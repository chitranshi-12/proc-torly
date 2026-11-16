import { Session, ISession } from '../models/Session.js';
import { Attempt, IAttempt } from '../models/Attempt.js';
import { Incident, IIncident, IncidentSeverity } from '../models/Incident.js';
import { isDBConnected } from '../config/db.js';
import { memoryStore, MemIncident } from './memoryStore.js';
import { ENV } from '../config/env.js';
import crypto from 'crypto';

export const SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 40,
  HIGH: 20,
  MEDIUM: 10,
  LOW: 3
};

/**
 * Checks if a given answer value counts as answered according to validation rules:
 * Non-empty trimmed string, non-empty array/object, number, or boolean.
 */
export function isAnswerFilled(val: any): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'number') return !isNaN(val);
  if (typeof val === 'boolean') return true;
  if (typeof val === 'object') return Object.keys(val).length > 0;
  return false;
}

/**
 * Counts total answered questions verifying each answer contains genuine content.
 */
export function countFilledAnswers(answers: Map<string, any> | Record<string, any> | null | undefined): number {
  if (!answers) return 0;
  let count = 0;
  if (answers instanceof Map) {
    for (const val of answers.values()) {
      if (isAnswerFilled(val)) count++;
    }
  } else if (typeof answers === 'object') {
    for (const val of Object.values(answers)) {
      if (isAnswerFilled(val)) count++;
    }
  }
  return count;
}

/**
 * Calculates authoritative proctoring risk (0-100) from actual persisted incidents.
 * Deduplicates repeated incident notifications within a 5-second window.
 */
export function calculateAuthoritativeRisk(incidents: any[]): number {
  if (!incidents || incidents.length === 0) return 0;

  const sorted = [...incidents].sort(
    (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()
  );

  let totalRisk = 0;
  const recentEvents: { type: string; time: number }[] = [];

  for (const inc of sorted) {
    const incType = inc.incidentType || inc.type || 'UNKNOWN';
    const incTime = new Date(inc.timestamp || Date.now()).getTime();

    // Deduplicate identical incident types occurring within 5000ms
    const isDuplicate = recentEvents.some(
      (e) => e.type === incType && Math.abs(incTime - e.time) < 5000
    );

    if (!isDuplicate) {
      recentEvents.push({ type: incType, time: incTime });
      const sev = String(inc.severity || 'MEDIUM').toUpperCase();
      const weight = SEVERITY_WEIGHTS[sev] ?? 10;
      totalRisk += weight;
    }
  }

  return Math.min(100, totalRisk);
}

export const monitorService = {
  async getMonitoringSnapshot(examId: string): Promise<{
    candidates: any[];
    totalRegistered: number;
    activeCount: number;
    submittedCount: number;
    incidentCount: number;
    incidents?: any[];
  }> {
    let attempts: any[] = [];
    let sessions: any[] = [];
    let incidents: any[] = [];

    if (isDBConnected()) {
      try {
        attempts = await Attempt.find({ examId }).sort({ createdAt: -1 });
        sessions = await Session.find({ examId });
        incidents = await Incident.find({ examId }).sort({ timestamp: -1 });
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    } else {
      attempts = Array.from(memoryStore.attempts.values()).filter((a) => a.examId === examId);
      sessions = Array.from(memoryStore.sessions.values()).filter((s) => s.examId === examId);
      incidents = Array.from(memoryStore.incidents.values()).filter((i) => i.examId === examId);
    }

    const sessionMap = new Map<string, any>();
    sessions.forEach((s) => sessionMap.set(s.attemptId, s));

    const now = Date.now();
    let activeCount = 0;
    let submittedCount = 0;

    const candidateList = attempts.map((att) => {
      const sess = sessionMap.get(String(att._id));
      const lastPing = sess ? new Date(sess.lastHeartbeat).getTime() : 0;
      const isOnline = now - lastPing < 20000;

      if (att.status === 'in_progress') activeCount++;
      if (att.status === 'submitted') submittedCount++;

      const candIncidents = incidents.filter((i) => i.attemptId === String(att._id));
      const answeredCount = countFilledAnswers(att.answers);
      const computedRisk = candIncidents.length > 0 ? calculateAuthoritativeRisk(candIncidents) : (att.riskScore || 0);

      return {
        id: String(att._id),
        studentId: att.studentId,
        studentName: att.studentName,
        rollNo: att.rollNo,
        studentEmail: att.studentEmail || '',
        institute: att.institute || '',
        status: att.status,
        isOnline,
        lastHeartbeat: sess?.lastHeartbeat || att.lastActivityAt,
        answeredCount,
        progressPercent: sess?.progressPercent || 0,
        riskScore: computedRisk,
        incidentCount: candIncidents.length,
        score: att.score,
        totalMarks: att.totalMarks,
        terminationReason: att.terminationReason,
        terminationSource: att.terminationSource,
        terminatedAt: att.terminatedAt,
        reviewStatus: att.reviewStatus || 'none',
        gradingOutcome: att.gradingOutcome || 'evaluated'
      };
    });

    return {
      candidates: candidateList,
      totalRegistered: attempts.length,
      activeCount,
      submittedCount,
      incidentCount: incidents.length,
      incidents: incidents.map((i) => ({
        id: String(i._id),
        sessionId: i.attemptId,
        attemptId: i.attemptId,
        studentId: i.studentId,
        studentName: i.studentName,
        type: i.incidentType,
        incidentType: i.incidentType,
        severity: i.severity,
        metadata: i.metadata,
        timestamp: i.timestamp
      }))
    };
  },

  async recordIncident(data: {
    examId: string;
    attemptId: string;
    studentId: string;
    studentName?: string;
    incidentType: string;
    severity?: IncidentSeverity;
    metadata?: Record<string, any>;
  }): Promise<{ incident: any; riskScore: number; incidentCount: number }> {
    const severity = data.severity || 'MEDIUM';
    const now = new Date();
    let createdIncident: any = null;

    if (isDBConnected()) {
      try {
        const incidentId = `inc_${crypto.randomUUID().slice(0, 10)}`;
        createdIncident = await Incident.create({
          _id: incidentId,
          examId: data.examId,
          attemptId: data.attemptId,
          studentId: data.studentId,
          studentName: data.studentName || '',
          incidentType: data.incidentType,
          severity,
          metadata: data.metadata || {},
          timestamp: now
        });
      } catch (err: any) {
        console.error('Incident MongoDB creation note:', err.message);
        if (ENV.isProd) throw err;
      }
    }

    if (!createdIncident) {
      const memInc: MemIncident = {
        _id: `inc_${crypto.randomUUID().slice(0, 10)}`,
        examId: data.examId,
        attemptId: data.attemptId,
        studentId: data.studentId,
        studentName: data.studentName || '',
        incidentType: data.incidentType,
        severity,
        metadata: data.metadata || {},
        timestamp: now,
        createdAt: now
      };
      memoryStore.incidents.set(memInc._id, memInc);
      createdIncident = memInc;
    }

    // Retrieve all incidents for this attempt to derive authoritative risk score
    const allIncidents = await this.getIncidentsByAttempt(data.attemptId);
    const updatedRisk = calculateAuthoritativeRisk(allIncidents);
    const incidentCount = allIncidents.length;

    // Persist updated riskScore to the Attempt in MongoDB Atlas
    if (isDBConnected()) {
      try {
        await Attempt.updateOne(
          { _id: data.attemptId },
          {
            $set: {
              riskScore: updatedRisk,
              incidentCount,
              lastActivityAt: now
            }
          }
        );
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    }

    const memAtt = memoryStore.attempts.get(data.attemptId);
    if (memAtt) {
      memAtt.riskScore = updatedRisk;
      memAtt.incidentCount = incidentCount;
      memAtt.lastActivityAt = now;
    }

    return {
      incident: createdIncident,
      riskScore: updatedRisk,
      incidentCount
    };
  },

  async getIncidentsByExam(examId: string): Promise<any[]> {
    if (isDBConnected()) {
      try {
        return await Incident.find({ examId }).sort({ timestamp: -1 });
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    }
    return Array.from(memoryStore.incidents.values()).filter((i) => i.examId === examId);
  },

  async getIncidentsByAttempt(attemptId: string): Promise<any[]> {
    if (isDBConnected()) {
      try {
        return await Incident.find({ attemptId }).sort({ timestamp: -1 });
      } catch (err) {
        if (ENV.isProd) throw err;
      }
    }
    return Array.from(memoryStore.incidents.values()).filter((i) => i.attemptId === attemptId);
  }
};
