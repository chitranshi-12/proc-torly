import mongoose, { Schema, Document } from 'mongoose';
import crypto from 'crypto';

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface IIncident extends Document {
  examId: string;
  attemptId: string;
  studentId: string;
  studentName?: string;
  incidentType: string;
  severity: IncidentSeverity;
  timestamp: Date;
  metadata?: Record<string, any>;
  reviewedAt?: Date;
  reviewedBy?: string;
  createdAt: Date;
}

const IncidentSchema = new Schema<IIncident>(
  {
    _id: {
      type: String,
      default: () => `inc_${crypto.randomUUID().slice(0, 10)}`
    } as any,
    examId: {
      type: String,
      required: true,
      index: true
    },
    attemptId: {
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
      default: ''
    },
    incidentType: {
      type: String,
      required: true,
      index: true
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'MEDIUM'
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: () => ({})
    },
    reviewedAt: {
      type: Date
    },
    reviewedBy: {
      type: String
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

IncidentSchema.index({ examId: 1, timestamp: -1 });
IncidentSchema.index({ attemptId: 1, timestamp: -1 });

export const Incident = mongoose.model<IIncident>('Incident', IncidentSchema);
