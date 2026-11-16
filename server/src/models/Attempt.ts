import mongoose, { Schema, Document } from 'mongoose';

export type AttemptStatus = 'waiting' | 'in_progress' | 'submitted' | 'terminated' | 'expired';
export type TerminationSource = 'invigilator' | 'automated_rule' | 'system';
export type ReviewStatus = 'none' | 'pending_review' | 'reviewed' | 'disputed';
export type GradingOutcome = 'evaluated' | 'withheld' | 'invalidated';

export interface IAttempt extends Document {
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
  terminationSource?: TerminationSource;
  reviewStatus?: ReviewStatus;
  gradingOutcome?: GradingOutcome;
  incidentCount?: number;
  status: AttemptStatus;
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

const AttemptSchema = new Schema<IAttempt>(
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
    studentId: {
      type: String,
      required: true,
      index: true
    },
    studentName: {
      type: String,
      required: true,
      trim: true
    },
    studentEmail: {
      type: String,
      lowercase: true,
      trim: true
    },
    rollNo: {
      type: String,
      required: true,
      trim: true
    },
    institute: {
      type: String,
      trim: true
    },
    answers: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => new Map()
    },
    markedForReview: {
      type: Map,
      of: Boolean,
      default: () => new Map()
    },
    startedAt: {
      type: Date
    },
    expiresAt: {
      type: Date
    },
    submittedAt: {
      type: Date
    },
    terminatedAt: {
      type: Date
    },
    terminationReason: {
      type: String,
      trim: true
    },
    terminationSource: {
      type: String,
      enum: ['invigilator', 'automated_rule', 'system']
    },
    reviewStatus: {
      type: String,
      enum: ['none', 'pending_review', 'reviewed', 'disputed'],
      default: 'none'
    },
    gradingOutcome: {
      type: String,
      enum: ['evaluated', 'withheld', 'invalidated'],
      default: 'evaluated'
    },
    incidentCount: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['waiting', 'in_progress', 'submitted', 'terminated', 'expired'],
      default: 'waiting',
      index: true
    },
    score: {
      type: Number,
      default: 0
    },
    totalMarks: {
      type: Number,
      default: 0
    },
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
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
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

AttemptSchema.index({ examId: 1, studentId: 1 });
AttemptSchema.index({ examId: 1, rollNo: 1 }, { unique: true });
AttemptSchema.index({ examId: 1, status: 1 });

export const Attempt = mongoose.model<IAttempt>('Attempt', AttemptSchema);
