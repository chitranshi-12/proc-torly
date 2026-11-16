import mongoose, { Schema, Document } from 'mongoose';

export type SessionStatus = 'connected' | 'disconnected' | 'submitted' | 'terminated';

export interface ISession extends Document {
  examId: string;
  attemptId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  socketId?: string;
  sessionTokenHash?: string;
  sessionStatus: SessionStatus;
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

const SessionSchema = new Schema<ISession>(
  {
    _id: {
      type: String,
      required: true
    } as any,
    examId: {
      type: String,
      required: true,
      index: true
    },
    attemptId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    studentId: {
      type: String,
      required: true,
      index: true
    },
    studentName: {
      type: String,
      required: true
    },
    rollNo: {
      type: String,
      required: true
    },
    socketId: {
      type: String
    },
    sessionTokenHash: {
      type: String,
      index: true
    },
    sessionStatus: {
      type: String,
      enum: ['connected', 'disconnected', 'submitted', 'terminated'],
      default: 'connected',
      index: true
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now,
      index: true
    },
    connectedAt: {
      type: Date,
      default: Date.now
    },
    disconnectedAt: {
      type: Date
    },
    answeredCount: {
      type: Number,
      default: 0
    },
    progressPercent: {
      type: Number,
      default: 0
    },
    consentAgreed: {
      type: Boolean,
      default: false
    },
    consentTimestamp: {
      type: Date
    },
    consentVersion: {
      type: String
    },
    referencePhoto: {
      type: String
    },
    photoUploadStatus: {
      type: String,
      enum: ['uploaded', 'failed', 'not_provided'],
      default: 'not_provided'
    }
  },
  {
    timestamps: true
  }
);

SessionSchema.index({ examId: 1, studentId: 1 });
SessionSchema.index({ examId: 1, lastHeartbeat: -1 });

export const Session = mongoose.model<ISession>('Session', SessionSchema);
