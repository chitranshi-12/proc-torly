/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * In-Memory Database Store for exam.co
 * Provides zero-downtime fallback when MongoDB Atlas connection is connecting or during unit tests.
 */

export interface MemUser {
  _id: string;
  firebaseUid: string;
  name: string;
  email: string;
  photoURL?: string;
  role: 'teacher' | 'invigilator' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

export interface MemExam {
  _id: string;
  id?: string;
  teacherId: string;
  title: string;
  description: string;
  examCode: string;
  questions: any[];
  duration: number;
  startTime: Date;
  endTime: Date;
  status: 'draft' | 'published' | 'scheduled' | 'active' | 'completed' | 'archived';
  settings: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemAttempt {
  _id: string;
  examId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  rollNo: string;
  institute?: string;
  answers: Map<string, any>;
  markedForReview: Map<string, boolean>;
  startedAt?: Date;
  expiresAt?: Date;
  submittedAt?: Date;
  terminatedAt?: Date;
  terminationReason?: string;
  terminationSource?: 'invigilator' | 'automated_rule' | 'system';
  reviewStatus?: 'none' | 'pending_review' | 'reviewed' | 'disputed';
  gradingOutcome?: 'evaluated' | 'withheld' | 'invalidated';
  incidentCount?: number;
  status: 'waiting' | 'in_progress' | 'submitted' | 'terminated' | 'expired';
  score?: number;
  totalMarks?: number;
  riskScore: number;
  consentAgreed?: boolean;
  consentTimestamp?: Date;
  consentVersion?: string;
  referencePhoto?: string;
  photoUploadStatus?: 'uploaded' | 'failed' | 'not_provided';
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemIncident {
  _id: string;
  examId: string;
  attemptId: string;
  studentId: string;
  studentName?: string;
  incidentType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metadata: any;
  timestamp: Date;
  createdAt: Date;
}

export interface MemSession {
  _id: string;
  examId: string;
  attemptId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  socketId?: string;
  sessionTokenHash?: string;
  sessionStatus: 'connected' | 'disconnected' | 'submitted' | 'terminated';
  lastHeartbeat: Date;
  connectedAt: Date;
  disconnectedAt?: Date;
  answeredCount: number;
  progressPercent: number;
  consentAgreed?: boolean;
  consentTimestamp?: Date;
  consentVersion?: string;
  referencePhoto?: string;
  photoUploadStatus?: 'uploaded' | 'failed' | 'not_provided';
  createdAt: Date;
  updatedAt: Date;
}

export const memoryStore = {
  users: new Map<string, MemUser>(),
  exams: new Map<string, MemExam>(),
  attempts: new Map<string, MemAttempt>(),
  incidents: new Map<string, MemIncident>(),
  sessions: new Map<string, MemSession>(),

  clear() {
    this.users.clear();
    this.exams.clear();
    this.attempts.clear();
    this.incidents.clear();
    this.sessions.clear();
  }
};
