import { Request, Response } from 'express';
import { attemptService } from '../services/attemptService.js';
import { Attempt } from '../models/Attempt.js';
import { Exam } from '../models/Exam.js';
import { examService } from '../services/examService.js';

export const attemptController = {
  async studentJoin(req: Request, res: Response) {
    try {
      const examCode = (req.body.examCode || req.body.code || '').trim();
      const studentName = (req.body.studentName || req.body.name || '').trim();
      const rollNo = (req.body.rollNo || req.body.rollNumber || req.body.studentId || '').trim();
      const studentEmail = (req.body.studentEmail || req.body.email || '').trim();
      const institute = (req.body.institute || req.body.instituteName || '').trim();

      if (!examCode) {
        return res.status(400).json({ error: 'Invalid examination code.' });
      }
      if (!studentName || !rollNo) {
        return res.status(400).json({ error: 'Student details are incomplete.' });
      }

      if (studentEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(studentEmail)) {
          return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
      }

      const result = await attemptService.joinExam({
        examCode,
        studentName,
        rollNo,
        studentEmail: studentEmail || undefined,
        institute: institute || undefined
      });

      return res.status(200).json({
        success: true,
        attemptId: String(result.attempt._id),
        studentId: result.attempt.studentId,
        sessionId: result.sessionId,
        sessionToken: result.sessionToken,
        exam: result.exam,
        isResuming: result.isResuming
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Server connection failed. Please retry.' });
    }
  },

  async startAttempt(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const attempt = await attemptService.startAttempt(attemptId);
      return res.json({
        status: attempt.status,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt
      });
    } catch (err: any) {
      const statusCode = err.code === 'SCHEDULED_START_PENDING' ? 403 : 400;
      return res.status(statusCode).json({
        error: err.message || 'Failed to start attempt.',
        code: err.code || 'START_REJECTED',
        eligibility: err.eligibility
      });
    }
  },

  async getStartEligibility(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const eligibility = await attemptService.checkStartEligibility(attemptId);
      return res.json(eligibility);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to check eligibility.' });
    }
  },

  async recordEvidence(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const { consentAgreed, consentVersion, referencePhoto } = req.body || {};
      const result = await attemptService.recordEvidence(attemptId, {
        consentAgreed,
        consentVersion,
        referencePhoto
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to record student evidence.' });
    }
  },

  async getAttempt(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const attempt = await attemptService.getAttemptById(attemptId);
      if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });

      const exam = await examService.getExamById(attempt.examId);
      if (!exam) return res.status(404).json({ error: 'Associated exam not found.' });

      const safeExam = examService.sanitizeForStudent(exam);

      // Convert Map to plain object for JSON response
      const answersObj = Object.fromEntries(attempt.answers ? attempt.answers.entries() : []);
      const reviewObj = Object.fromEntries(attempt.markedForReview ? attempt.markedForReview.entries() : []);

      return res.json({
        attempt: {
          id: String(attempt._id),
          studentId: attempt.studentId,
          studentName: attempt.studentName,
          rollNo: attempt.rollNo,
          status: attempt.status,
          startedAt: attempt.startedAt,
          expiresAt: attempt.expiresAt,
          submittedAt: attempt.submittedAt,
          terminatedAt: attempt.terminatedAt,
          terminationReason: attempt.terminationReason,
          terminationSource: attempt.terminationSource,
          reviewStatus: attempt.reviewStatus || (attempt.status === 'terminated' ? 'pending_review' : 'none'),
          gradingOutcome: attempt.gradingOutcome || (attempt.status === 'terminated' ? 'withheld' : 'evaluated'),
          answers: answersObj,
          markedForReview: reviewObj,
          score: (attempt.status === 'submitted' || attempt.status === 'terminated') ? attempt.score : undefined,
          totalMarks: attempt.totalMarks,
          riskScore: attempt.riskScore || 0,
          incidentCount: attempt.incidentCount || 0
        },
        exam: safeExam
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to get attempt.' });
    }
  },

  async saveAnswers(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const { answers, markedForReview } = req.body;

      const result = await attemptService.saveAnswers(attemptId, answers, markedForReview);

      // Emit candidate:progress to teacher room strictly AFTER database persistence
      const io = req.app.get('io');
      if (io) {
        io.to(`exam:${result.examId}:teachers`).emit('candidate:progress', {
          examId: result.examId,
          attemptId: String(attemptId),
          studentId: result.studentId,
          answeredCount: result.answeredCount,
          totalQuestions: result.totalQuestions,
          progressPercentage: result.progressPercentage,
          lastActivityAt: result.savedAt,
          attemptStatus: result.attemptStatus
        });
      }

      return res.json(result);
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('terminated') ||
          err.message.includes('prohibited') ||
          err.message.includes('submitted') ||
          err.message.includes('expired'))
      ) {
        return res.status(403).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message || 'Failed to save answers.' });
    }
  },

  async submitAttempt(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const { answers, terminated, terminationReason, terminationSource, gradingOutcome } = req.body;

      const result = await attemptService.submitAttempt(attemptId, answers, {
        terminated: Boolean(terminated),
        terminationReason,
        terminationSource,
        gradingOutcome
      });

      const io = req.app.get('io');
      if (io) {
        const attempt = await attemptService.getAttemptById(attemptId);
        if (attempt) {
          io.to(`exam:${attempt.examId}:teachers`).emit('candidate:status', {
            attemptId,
            status: result.status,
            isOnline: false,
            score: result.score,
            totalMarks: result.totalMarks,
            riskScore: result.riskScore,
            terminationReason: result.terminationReason,
            terminationSource: result.terminationSource
          });
        }
      }

      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to submit examination.' });
    }
  },

  async terminateAttempt(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const attempt = await attemptService.getAttemptById(attemptId);
      if (!attempt) return res.status(404).json({ error: 'Attempt not found.' });

      let source: 'invigilator' | 'automated_rule' = 'automated_rule';
      let validatedReason = 'Automated proctoring violation limit reached';

      // 1. If caller is authenticated as Teacher:
      if (req.user) {
        // Enforce: Teachers can terminate only attempts belonging to their own examinations
        const exam = await examService.getExamById(attempt.examId, req.user.id);
        if (!exam && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden: You are not authorized to terminate attempts for this examination.' });
        }
        source = 'invigilator';
        const rawReason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
        validatedReason = rawReason.length > 0 ? rawReason.slice(0, 500) : 'Manually terminated by invigilator';
      }
      // 2. If caller is Student Session:
      else if (req.studentSession) {
        // Enforce: Students can only trigger permitted automated termination for their own attempt
        if (req.studentSession.attemptId !== attemptId) {
          return res.status(403).json({ error: "Forbidden: Cannot terminate another candidate's examination." });
        }

        // Enforce: Students CANNOT choose terminationSource=invigilator!
        source = 'automated_rule';

        // Enforce: Students cannot supply arbitrary termination reasons or risk scores
        const rawReason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
        const allowedTriggers = [
          'Exceeded maximum allowed integrity warnings',
          'TAB_SWITCH',
          'FULLSCREEN_EXIT',
          'INTEGRITY_BREACH',
          'Time Expired',
          'Violation limit reached'
        ];
        const isPermitted = allowedTriggers.some((t) => rawReason.includes(t));
        validatedReason = isPermitted
          ? rawReason.slice(0, 250)
          : 'Terminated under automated examination integrity rule';
      } else {
        return res.status(401).json({ error: 'Authentication required to terminate examination.' });
      }

      // gradingOutcome is always strictly controlled server-side: 'withheld'
      const result = await attemptService.terminateAttempt(attemptId, {
        reason: validatedReason,
        source,
        gradingOutcome: 'withheld'
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`attempt:${attemptId}`).emit('student:exam_terminated', {
          reason: result.terminationReason,
          source: result.terminationSource,
          timestamp: result.terminatedAt
        });

        io.to(`exam:${attempt.examId}:teachers`).emit('candidate:status', {
          attemptId,
          status: 'terminated',
          riskScore: result.riskScore,
          terminationReason: result.terminationReason,
          terminationSource: result.terminationSource
        });
      }

      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to terminate attempt.' });
    }
  },

  async teacherResetSession(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      if (!attemptId) {
        return res.status(400).json({ error: 'Attempt ID is required.' });
      }

      const attempt = await attemptService.getAttemptById(attemptId);
      if (!attempt) {
        return res.status(404).json({ error: 'Examination attempt not found.' });
      }

      const teacherId = req.user?.id;
      const exam = await examService.getExamById(attempt.examId, teacherId);
      if (!exam || exam.teacherId !== teacherId) {
        return res.status(403).json({ error: 'Unauthorized. You can only reset sessions for your own examinations.' });
      }

      const result = await attemptService.resetStudentSession(attemptId);
      return res.status(200).json({
        success: true,
        message: 'Student session successfully reset with fresh cryptographic credentials.',
        ...result
      });
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('Cannot reset session') ||
          err.message.includes('submitted') ||
          err.message.includes('terminated') ||
          err.message.includes('expired'))
      ) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: err.message || 'Failed to reset student session.' });
    }
  }
};
