import mongoose, { Schema, Document } from 'mongoose';

export interface IEvidence extends Document {
  examId: string;
  attemptId: string;
  incidentId?: string;
  storageReference: string;
  contentType: string;
  size: number;
  createdAt: Date;
  retentionExpiry: Date;
}

const EvidenceSchema = new Schema<IEvidence>(
  {
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
    incidentId: {
      type: String,
      index: true
    },
    storageReference: {
      type: String,
      required: true
    },
    contentType: {
      type: String,
      default: 'image/jpeg'
    },
    size: {
      type: Number,
      default: 0
    },
    retentionExpiry: {
      type: Date,
      required: true,
      index: true
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

EvidenceSchema.index({ examId: 1, createdAt: -1 });

export const Evidence = mongoose.model<IEvidence>('Evidence', EvidenceSchema);
