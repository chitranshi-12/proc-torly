import { Attempt, IAttempt } from '../models/Attempt.js';
import { Exam } from '../models/Exam.js';
import { Session } from '../models/Session.js';
import { Incident } from '../models/Incident.js';
import { isDBConnected } from '../config/db.js';
import { memoryStore, MemAttempt, MemSession } from './memoryStore.js';
import { examService } from './examService.js';
import { monitorService, countFilledAnswers, calculateAuthoritativeRisk } from './monitorService.js';
import { ENV } from '../config/env.js';
import crypto from 'crypto';

export interface JoinStudentInput {
  examCode: string;
  studentName: string;
  rollNo: string;
  studentEmail?: string;
  institute?: string;
}

export const attemptService = {
  async joinExam(input: JoinStudentInput): Promise<{
    attempt: any;
    exam: any;
    sessionId: string;
    sessionToken: string;
    isResuming: boolean;
  }> {
    const code = input.examCode.trim().toUpperCase();
    const exam = await examService.getExamByCode(code);
    if (!exam) {
      throw new Error('Invalid examination code.');
    }

    if (exam.status === 'draft') {
      throw new Error('Examination is not available yet.');
    }

    if (exam.status === 'archived' || exam.status === 'completed') {
      throw new Error('Examination has ended.');
    }

    const now = new Date();
    if (exam.endTime && new Date(exam.endTime) < now) {
      throw new Error('Examination has ended.');
    }

    if (exam.startTime && new Date(exam.startTime).getTime() - now.getTime() > 24 * 3600000) {
      throw new Error('Examination is not available yet.');
    }

    const rollNo = input.rollNo.trim();
    const studentName = input.studentName.trim();
    const studentEmail = input.studentEmail?.trim().toLowerCase();
    const examIdStr = String(exam._id || exam.id);

    let attempt: any = null;
    let isResuming = false;

    if (isDBConnected()) {
      try {
        attempt = await Attempt.findOne({ examId: examIdStr, rollNo });
      } catch (err) { if (ENV.isProd) throw err; }
    }

    if (!attempt) {
      for (const a of memoryStore.attempts.values()) {
        if (a.examId === examIdStr && a.rollNo === rollNo) {
          attempt = a;
          break;
        }
      }
    }

    if (attempt) {
      // Check if different student details are entered for the same roll number
      const nameMatches = attempt.studentName.trim().toLowerCase() === studentName.toLowerCase();
      const emailMatches = Boolean(
        studentEmail && attempt.studentEmail && attempt.studentEmail.trim().toLowerCase() === studentEmail
      );

      if (!nameMatches && !emailMatches) {
        throw new Error('This student is already registered with different details.');
      }

      isResuming = true;
      if (attempt.status === 'submitted') {
        throw new Error('You have already submitted this examination.');
      }
      if (attempt.status === 'terminated') {
        throw new Error('This examination session was previously terminated.');
      }
      if (attempt.status === 'expired') {
        throw new Error('This examination session has expired.');
      }
      if (attempt.expiresAt && now.getTime() > new Date(attempt.expiresAt).getTime()) {
        attempt.status = 'expired';
        if (isDBConnected() && attempt.save) {
          attempt.save().catch(() => { });
        }
        throw new Error('This examination session has expired.');
      }

      // If resuming candidate provided email and previously none was stored, update it
      if (studentEmail && !attempt.studentEmail) {
        attempt.studentEmail = studentEmail;
        if (isDBConnected()) {
          await Attempt.updateOne({ _id: attempt._id }, { $set: { studentEmail } }).catch(() => { });
        }
      }
    } else {
      // Verify email was not already used with a different roll number
      if (studentEmail && isDBConnected()) {
        try {
          const emailAttempt = await Attempt.findOne({ examId: examIdStr, studentEmail });
          if (emailAttempt && emailAttempt.rollNo !== rollNo) {
            throw new Error('This student is already registered with a different Roll Number.');
          }
        } catch (err: any) {
          if (err.message.includes('already registered')) throw err;
        }
      }

      const studentId = `cand_${crypto.randomUUID().slice(0, 12)}`;
      const attemptDoc = {
        _id: `att_${crypto.randomUUID().slice(0, 10)}`,
        examId: examIdStr,
        studentId,
        studentName,
        studentEmail: studentEmail || undefined,
        rollNo,
        institute: input.institute || exam.settings?.instituteName || '',
        status: 'waiting' as const,
        answers: new Map<string, any>(),
        markedForReview: new Map<string, boolean>(),
        riskScore: 0,
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now
      };

      if (isDBConnected()) {
        try {
          attempt = await Attempt.create(attemptDoc);
        } catch (err) {
          if (ENV.isProd) throw err;
          attempt = attemptDoc;
          memoryStore.attempts.set(attemptDoc._id, attemptDoc);
        }
      } else {
        attempt = attemptDoc;
        memoryStore.attempts.set(attemptDoc._id, attemptDoc);
      }
    }

    const attemptIdStr = String(attempt._id);
    let session: any = null;

    if (isDBConnected()) {
      try {
        session = await Session.findOne({ attemptId: attemptIdStr });
      } catch (err) { if (ENV.isProd) throw err; }
    }

    if (!session) {
      for (const s of memoryStore.sessions.values()) {
        if (s.attemptId === attemptIdStr) {
          session = s;
          break;
        }
      }
    }

    // Generate an unpredictable cryptographically secure session token (256 bits entropy)
    const sessionToken = `st_${crypto.randomBytes(32).toString('hex')}`;
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    if (!session) {
      const sessDoc = {
        _id: `sess_${crypto.randomUUID().slice(0, 10)}`,
        examId: examIdStr,
        attemptId: attemptIdStr,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        rollNo: attempt.rollNo,
        sessionTokenHash,
        sessionStatus: 'connected' as const,
        lastHeartbeat: now,
        connectedAt: now,
        answeredCount: 0,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now
      };

      if (isDBConnected()) {
        try {
          session = await Session.create(sessDoc);
        } catch (err) {
          if (ENV.isProd) throw err;
          session = sessDoc;
          memoryStore.sessions.set(sessDoc._id, sessDoc);
        }
      } else {
        session = sessDoc;
        memoryStore.sessions.set(sessDoc._id, sessDoc);
      }
    } else {
      // Re-issue a fresh secure session secret upon candidate rejoining
      session.sessionTokenHash = sessionTokenHash;
      session.lastHeartbeat = now;
      session.sessionStatus = 'connected';

      if (isDBConnected()) {
        try {
          await Session.updateOne(
            { _id: session._id },
            {
              $set: {
                sessionTokenHash,
                sessionStatus: 'connected',
                lastHeartbeat: now
              }
            }
          );
        } catch (err) {
          if (ENV.isProd) throw err;
        }
      }
    }

    const safeExam = examService.sanitizeForStudent(exam);

    return {
      attempt,
      exam: safeExam,
      sessionId: String(session._id),
      sessionToken,
      isResuming
    };
  },

  async checkStartEligibility(attemptId: string): Promise<{
    canStart: boolean;
    reason?: string;
    code?: string;
    serverTime: string;
    startTime?: string;
    endTime?: string;
    allowEarlyStart: boolean;
    timeLeftMs: number;
    attemptStatus: string;
    examStatus: string;
    isAuthorized: boolean;
  }> {
    const attempt = await this.getAttemptById(attemptId);
    const now = new Date();
    if (!attempt) {
      return {
        canStart: false,
        reason: 'Examination attempt not found.',
        code: 'ATTEMPT_NOT_FOUND',
        serverTime: now.toISOString(),
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: 'unknown',
        examStatus: 'unknown',
        isAuthorized: false
      };
    }

    if (attempt.status === 'in_progress' && attempt.startedAt) {
      return {
        canStart: true,
        reason: 'Attempt is already in progress.',
        code: 'ALREADY_IN_PROGRESS',
        serverTime: now.toISOString(),
        startTime: attempt.startedAt ? new Date(attempt.startedAt).toISOString() : undefined,
        endTime: attempt.expiresAt ? new Date(attempt.expiresAt).toISOString() : undefined,
        allowEarlyStart: true,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: 'active',
        isAuthorized: true
      };
    }

    if (attempt.status === 'submitted') {
      return {
        canStart: false,
        reason: 'This examination attempt has already been submitted.',
        code: 'ALREADY_SUBMITTED',
        serverTime: now.toISOString(),
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: 'unknown',
        isAuthorized: false
      };
    }

    if (attempt.status === 'terminated') {
      return {
        canStart: false,
        reason: 'This examination attempt was terminated.',
        code: 'TERMINATED',
        serverTime: now.toISOString(),
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: 'unknown',
        isAuthorized: false
      };
    }

    if (attempt.status === 'expired') {
      return {
        canStart: false,
        reason: 'This examination attempt has expired.',
        code: 'EXPIRED',
        serverTime: now.toISOString(),
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: 'unknown',
        isAuthorized: false
      };
    }

    const exam = await examService.getExamById(attempt.examId);
    if (!exam) {
      return {
        canStart: false,
        reason: 'Associated examination not found.',
        code: 'EXAM_NOT_FOUND',
        serverTime: now.toISOString(),
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: 'unknown',
        isAuthorized: false
      };
    }

    if (exam.status === 'draft') {
      return {
        canStart: false,
        reason: 'Examination is currently in draft mode and not available.',
        code: 'EXAM_DRAFT',
        serverTime: now.toISOString(),
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: exam.status,
        isAuthorized: false
      };
    }

    if (exam.status === 'completed' || exam.status === 'archived') {
      return {
        canStart: false,
        reason: 'Examination has concluded and is no longer accepting starts.',
        code: 'EXAM_CONCLUDED',
        serverTime: now.toISOString(),
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: exam.status,
        isAuthorized: false
      };
    }

    const endTimeMs = exam.endTime ? new Date(exam.endTime).getTime() : 0;
    if (endTimeMs && endTimeMs < now.getTime()) {
      return {
        canStart: false,
        reason: 'Examination period has ended.',
        code: 'EXAM_ENDED',
        serverTime: now.toISOString(),
        endTime: exam.endTime ? new Date(exam.endTime).toISOString() : undefined,
        allowEarlyStart: false,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: exam.status,
        isAuthorized: false
      };
    }

    const startTimeMs = exam.startTime ? new Date(exam.startTime).getTime() : 0;
    const allowEarlyStart = Boolean(exam.settings?.allowEarlyStart);
    const isExamActive = exam.status === 'active';
    const isStartTimeArrived = !startTimeMs || startTimeMs <= now.getTime();

    const diff = Math.max(0, startTimeMs - now.getTime());

    // Examination is permitted to start if:
    // 1. Teacher explicitly enabled allowEarlyStart
    // 2. Examination status was explicitly set to 'active' by teacher
    // 3. Or the scheduled start time has arrived
    if (allowEarlyStart || isExamActive || isStartTimeArrived) {
      return {
        canStart: true,
        reason: allowEarlyStart
          ? 'Early start explicitly authorized by instructor.'
          : isExamActive
          ? 'Examination is live and active.'
          : 'Scheduled start time has arrived.',
        code: 'START_PERMITTED',
        serverTime: now.toISOString(),
        startTime: exam.startTime ? new Date(exam.startTime).toISOString() : undefined,
        endTime: exam.endTime ? new Date(exam.endTime).toISOString() : undefined,
        allowEarlyStart,
        timeLeftMs: 0,
        attemptStatus: attempt.status,
        examStatus: exam.status,
        isAuthorized: true
      };
    }

    // Otherwise, start time is in the future and early start is not authorized
    return {
      canStart: false,
      reason: `Scheduled start time (${new Date(exam.startTime).toLocaleTimeString()}) has not arrived yet.`,
      code: 'SCHEDULED_START_PENDING',
      serverTime: now.toISOString(),
      startTime: exam.startTime ? new Date(exam.startTime).toISOString() : undefined,
      endTime: exam.endTime ? new Date(exam.endTime).toISOString() : undefined,
      allowEarlyStart: false,
      timeLeftMs: diff,
      attemptStatus: attempt.status,
      examStatus: exam.status,
      isAuthorized: true
    };
  },

  async startAttempt(attemptId: string): Promise<any> {
    const eligibility = await this.checkStartEligibility(attemptId);
    if (!eligibility.canStart) {
      const err: any = new Error(eligibility.reason || 'Cannot start examination: Start conditions not satisfied.');
      err.code = eligibility.code;
      err.eligibility = eligibility;
      throw err;
    }

    let attempt = await this.getAttemptById(attemptId);
    if (!attempt) throw new Error('Attempt not found.');

    if (attempt.status === 'in_progress' && attempt.startedAt) {
      return attempt;
    }

    const exam = await examService.getExamById(attempt.examId);
    if (!exam) throw new Error('Examination not found.');

    const now = new Date();
    const durationMs = (exam.duration || 60) * 60 * 1000;
    const expiresAt = new Date(Math.min(new Date(exam.endTime).getTime(), now.getTime() + durationMs));

    attempt.status = 'in_progress';
    attempt.startedAt = now;
    attempt.expiresAt = expiresAt;
    attempt.lastActivityAt = now;

    if (isDBConnected() && attempt.save) {
      try {
        await attempt.save();
      } catch (err) { if (ENV.isProd) throw err; }
    }

    return attempt;
  },

  async recordEvidence(
    attemptId: string,
    data: { consentAgreed: boolean; consentVersion?: string; referencePhoto?: string }
  ): Promise<{
    success: boolean;
    consentTimestamp: string;
    photoUploadStatus: string;
    consentVersion: string;
  }> {
    const attempt = await this.getAttemptById(attemptId);
    if (!attempt) throw new Error('Attempt not found.');

    const now = new Date();
    const consentAgreed = Boolean(data.consentAgreed);
    const consentVersion = data.consentVersion || '1.0-dpdp-2023';
    const photoUploadStatus = data.referencePhoto ? 'uploaded' : 'not_provided';

    attempt.consentAgreed = consentAgreed;
    attempt.consentTimestamp = now;
    attempt.consentVersion = consentVersion;
    if (data.referencePhoto) {
      attempt.referencePhoto = data.referencePhoto;
    }
    attempt.photoUploadStatus = photoUploadStatus;

    if (isDBConnected()) {
      try {
        await Attempt.updateOne(
          { _id: attempt._id },
          {
            $set: {
              consentAgreed,
              consentTimestamp: now,
              consentVersion,
              ...(data.referencePhoto ? { referencePhoto: data.referencePhoto } : {}),
              photoUploadStatus
            }
          }
        );
        await Session.updateOne(
          { attemptId: String(attempt._id) },
          {
            $set: {
              consentAgreed,
              consentTimestamp: now,
              consentVersion,
              ...(data.referencePhoto ? { referencePhoto: data.referencePhoto } : {}),
              photoUploadStatus
            }
          }
        );
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    } else {
      const memSession = Array.from(memoryStore.sessions.values()).find((s) => s.attemptId === String(attempt._id));
      if (memSession) {
        memSession.consentAgreed = consentAgreed;
        memSession.consentTimestamp = now;
        memSession.consentVersion = consentVersion;
        if (data.referencePhoto) memSession.referencePhoto = data.referencePhoto;
        memSession.photoUploadStatus = photoUploadStatus;
      }
    }

    return {
      success: true,
      consentTimestamp: now.toISOString(),
      photoUploadStatus,
      consentVersion
    };
  },

  async saveAnswers(
    attemptId: string,
    answers: Record<string, any>,
    markedForReview?: Record<string, boolean>
  ): Promise<{
    savedAt: string;
    answeredCount: number;
    totalQuestions: number;
    progressPercentage: number;
    examId: string;
    studentId: string;
    attemptStatus: string;
  }> {
    const attempt = await this.getAttemptById(attemptId);
    if (!attempt) throw new Error('Attempt not found.');

    if (attempt.status === 'terminated') {
      throw new Error('Attempt has been terminated. Further answer modifications are prohibited.');
    }
    if (attempt.status === 'submitted') {
      throw new Error('Attempt has already been submitted. Further answer modifications are prohibited.');
    }
    if (attempt.status === 'expired') {
      throw new Error('Attempt has expired. Further answer modifications are prohibited.');
    }
    if (attempt.expiresAt && new Date().getTime() > new Date(attempt.expiresAt).getTime()) {
      attempt.status = 'expired';
      if (isDBConnected() && attempt.save) {
        attempt.save().catch(() => { });
      }
      throw new Error('Attempt has expired. Further answer modifications are prohibited.');
    }
    if (attempt.status !== 'in_progress') {
      throw new Error('Attempt is not active.');
      throw new Error(`Attempt is not active: status is "${attempt.status}".`);
    }

    if (answers && typeof answers === 'object') {
      for (const [qId, val] of Object.entries(answers)) {
        if (qId.length <= 100) {
          if (attempt.answers instanceof Map) {
            attempt.answers.set(qId, val);
          } else {
            if (!attempt.answers) attempt.answers = new Map();
            attempt.answers.set(qId, val);
          }
        }
      }
    }

    if (markedForReview && typeof markedForReview === 'object') {
      for (const [qId, val] of Object.entries(markedForReview)) {
        if (attempt.markedForReview instanceof Map) {
          attempt.markedForReview.set(qId, Boolean(val));
        }
      }
    }

    const now = new Date();
    attempt.lastActivityAt = now;

    if (isDBConnected() && attempt.save) {
      try {
        await attempt.save();
      } catch (err) { if (ENV.isProd) throw err; }
    }

    const exam = await examService.getExamById(attempt.examId);
    const totalQuestions = exam?.questions?.length || 0;
    const answeredCount = countFilledAnswers(attempt.answers);
    const progressPercentage = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

    // Update Session in DB
    if (isDBConnected()) {
      Session.updateOne(
        { attemptId: String(attempt._id) },
        {
          $set: {
            answeredCount,
            progressPercent: progressPercentage,
            lastHeartbeat: now
          }
        }
      ).catch(() => { });
    }

    return {
      savedAt: now.toISOString(),
      answeredCount,
      totalQuestions,
      progressPercentage,
      examId: attempt.examId,
      studentId: attempt.studentId,
      attemptStatus: attempt.status
    };
  },

  async submitAttempt(
    attemptId: string,
    finalAnswers?: Record<string, any>,
    options: {
      terminated?: boolean;
      terminationReason?: string;
      terminationSource?: 'invigilator' | 'automated_rule' | 'system';
      gradingOutcome?: 'evaluated' | 'withheld' | 'invalidated';
    } | boolean = false
  ): Promise<{
    score: number;
    totalMarks: number;
    riskScore: number;
    incidentCount: number;
    status: string;
    terminationReason?: string;
    terminationSource?: string;
    terminatedAt?: string;
    reviewStatus: string;
    gradingOutcome: string;
    submittedAt: string;
    incidents: any[];
  }> {
    const opts = typeof options === 'boolean' ? { terminated: options } : options;
    const isTerminated = Boolean(opts.terminated);

    const attempt = await this.getAttemptById(attemptId);
    if (!attempt) throw new Error('Attempt not found.');

    if (attempt.status === 'submitted' || attempt.status === 'terminated') {
      const incidents = await monitorService.getIncidentsByAttempt(attemptId);
      return {
        score: attempt.score || 0,
        totalMarks: attempt.totalMarks || 0,
        riskScore: attempt.riskScore || calculateAuthoritativeRisk(incidents),
        incidentCount: attempt.incidentCount || incidents.length,
        status: attempt.status,
        terminationReason: attempt.terminationReason,
        terminationSource: attempt.terminationSource,
        terminatedAt: attempt.terminatedAt?.toISOString(),
        reviewStatus: attempt.reviewStatus || (attempt.status === 'terminated' ? 'pending_review' : 'none'),
        gradingOutcome: attempt.gradingOutcome || (attempt.status === 'terminated' ? 'withheld' : 'evaluated'),
        submittedAt: attempt.submittedAt?.toISOString() || new Date().toISOString(),
        incidents: incidents.slice(0, 5)
      };
    }

    const exam = await examService.getExamById(attempt.examId);
    if (!exam) throw new Error('Examination not found.');

    if (finalAnswers && typeof finalAnswers === 'object') {
      for (const [qId, val] of Object.entries(finalAnswers)) {
        if (attempt.answers instanceof Map) {
          attempt.answers.set(qId, val);
        }
      }
    }

    let score = 0;
    let totalMarks = 0;

    for (const q of exam.questions || []) {
      const qMarks = Number(q.marks) || 1;
      totalMarks += qMarks;

      const givenAnswer = attempt.answers instanceof Map ? attempt.answers.get(q.id) : attempt.answers?.[q.id];
      if (givenAnswer !== undefined && givenAnswer !== null && q.correctAnswer !== undefined && q.correctAnswer !== null) {
        const qType = q.type || 'mcq';

        if (qType === 'multiple_select') {
          // Normalize candidate answer to sorted uppercase array of string tokens
          const studentSet = Array.isArray(givenAnswer)
            ? givenAnswer.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean)
            : String(givenAnswer).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
          const studentSorted = Array.from(new Set(studentSet)).sort();

          // Normalize correct answer to sorted uppercase array of string tokens
          const correctSet = Array.isArray(q.correctAnswer)
            ? q.correctAnswer.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean)
            : String(q.correctAnswer).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
          const correctSorted = Array.from(new Set(correctSet)).sort();

          if (
            studentSorted.length > 0 &&
            studentSorted.length === correctSorted.length &&
            studentSorted.every((val, idx) => val === correctSorted[idx])
          ) {
            score += qMarks;
          }
        } else if (qType === 'short_answer') {
          const studentStr = String(givenAnswer).trim().toLowerCase();
          const correctStr = String(q.correctAnswer).trim().toLowerCase();
          if (studentStr.length > 0 && (studentStr === correctStr || (correctStr.length > 0 && studentStr.includes(correctStr)))) {
            score += qMarks;
          }
        } else {
          // Default MCQ / single select string comparison
          if (
            String(givenAnswer).trim().toUpperCase() ===
            String(q.correctAnswer).trim().toUpperCase()
          ) {
            score += qMarks;
          }
        }
      }
    }

    const now = new Date();
    const incidents = await monitorService.getIncidentsByAttempt(attemptId);
    const computedRisk = calculateAuthoritativeRisk(incidents);

    attempt.score = Math.round(score * 100) / 100;
    attempt.totalMarks = totalMarks;
    attempt.riskScore = computedRisk;
    attempt.incidentCount = incidents.length;
    attempt.status = isTerminated ? 'terminated' : 'submitted';
    attempt.submittedAt = now;
    attempt.lastActivityAt = now;

    if (isTerminated) {
      attempt.terminatedAt = now;
      attempt.terminationReason = opts.terminationReason || 'Terminated under examination integrity rule';
      attempt.terminationSource = opts.terminationSource || 'automated_rule';
      attempt.reviewStatus = 'pending_review';
      attempt.gradingOutcome = opts.gradingOutcome || 'withheld';
    } else {
      attempt.reviewStatus = 'none';
      attempt.gradingOutcome = 'evaluated';
    }

    if (isDBConnected() && attempt.save) {
      try {
        await attempt.save();
      } catch (err) { if (ENV.isProd) throw err; }
    }

    return {
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      riskScore: attempt.riskScore,
      incidentCount: attempt.incidentCount,
      status: attempt.status,
      terminationReason: attempt.terminationReason,
      terminationSource: attempt.terminationSource,
      terminatedAt: attempt.terminatedAt?.toISOString(),
      reviewStatus: attempt.reviewStatus,
      gradingOutcome: attempt.gradingOutcome,
      submittedAt: now.toISOString(),
      incidents: incidents.slice(0, 5)
    };
  },

  async terminateAttempt(
    attemptId: string,
    options: {
      reason?: string;
      source?: 'invigilator' | 'automated_rule' | 'system';
      gradingOutcome?: 'evaluated' | 'withheld' | 'invalidated';
    } = {}
  ): Promise<any> {
    return this.submitAttempt(attemptId, undefined, {
      terminated: true,
      terminationReason: options.reason || 'Terminated by examination proctor',
      terminationSource: options.source || 'invigilator',
      gradingOutcome: options.gradingOutcome || 'withheld'
    });
  },

  /**
   * Safe Legacy-Session Recovery: Teacher-Authorized Session Reset
   * Generates a fresh 256-bit cryptographically random session token.
   * Stores ONLY its SHA-256 hash in MongoDB Atlas Session.sessionTokenHash.
   * Returns raw token solely to the authorized invigilator/teacher to share with student.
   */
  async resetStudentSession(attemptId: string): Promise<{
    attemptId: string;
    sessionToken: string;
    sessionId: string;
    studentName: string;
    rollNo: string;
    examId: string;
    resetAt: string;
  }> {
    const attempt = await this.getAttemptById(attemptId);
    if (!attempt) {
      throw new Error('Attempt not found.');
    }

    if (attempt.status === 'submitted') {
      throw new Error('Cannot reset session: Attempt has already been submitted.');
    }
    if (attempt.status === 'terminated') {
      throw new Error('Cannot reset session: Attempt has been terminated.');
    }
    if (attempt.status === 'expired') {
      throw new Error('Cannot reset session: Attempt has expired.');
    }
    if (attempt.expiresAt && new Date().getTime() > new Date(attempt.expiresAt).getTime()) {
      attempt.status = 'expired';
      if (isDBConnected() && attempt.save) {
        attempt.save().catch(() => { });
      }
      throw new Error('Cannot reset session: Attempt has expired.');
    }

    const sessionToken = `st_${crypto.randomBytes(32).toString('hex')}`;
    const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const now = new Date();
    const attemptIdStr = String(attempt._id);

    let session: any = null;
    if (isDBConnected()) {
      try {
        session = await Session.findOne({ attemptId: attemptIdStr });
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    }

    if (!session) {
      for (const s of memoryStore.sessions.values()) {
        if (s.attemptId === attemptIdStr) {
          session = s;
          break;
        }
      }
    }

    if (!session) {
      const sessDoc = {
        _id: `sess_${crypto.randomUUID().slice(0, 10)}`,
        examId: attempt.examId,
        attemptId: attemptIdStr,
        studentId: attempt.studentId,
        studentName: attempt.studentName,
        rollNo: attempt.rollNo,
        sessionTokenHash,
        sessionStatus: 'connected' as const,
        lastHeartbeat: now,
        connectedAt: now,
        answeredCount: 0,
        progressPercent: 0,
        createdAt: now,
        updatedAt: now
      };

      if (isDBConnected()) {
        try {
          session = await Session.create(sessDoc);
        } catch (err) {
          if (ENV.isProd) throw err;
          session = sessDoc;
          memoryStore.sessions.set(sessDoc._id, sessDoc);
        }
      } else {
        session = sessDoc;
        memoryStore.sessions.set(sessDoc._id, sessDoc);
      }
    } else {
      session.sessionTokenHash = sessionTokenHash;
      session.lastHeartbeat = now;

      if (isDBConnected()) {
        try {
          await Session.updateOne(
            { _id: session._id },
            {
              $set: {
                sessionTokenHash,
                lastHeartbeat: now
              }
            }
          );
        } catch (err) {
          if (ENV.isProd) throw err;
        }
      }
    }

    return {
      attemptId: attemptIdStr,
      sessionToken,
      sessionId: String(session._id),
      studentName: attempt.studentName,
      rollNo: attempt.rollNo,
      examId: attempt.examId,
      resetAt: now.toISOString()
    };
  },

  async getAttemptById(attemptId: string): Promise<any | null> {
    if (isDBConnected()) {
      try {
        let att = await Attempt.findById(attemptId);
        if (!att) {
          const sess = await Session.findById(attemptId);
          if (sess && sess.attemptId) {
            att = await Attempt.findById(sess.attemptId);
          }
        }
        if (att) return att;
      } catch (err) { if (ENV.isProd) throw err; }
    }
    let mem = memoryStore.attempts.get(attemptId);
    if (!mem) {
      const memSess = memoryStore.sessions.get(attemptId);
      if (memSess && memSess.attemptId) {
        mem = memoryStore.attempts.get(memSess.attemptId);
      }
    }
    return mem || null;
  }
};
