import mongoose, { Schema, Document } from 'mongoose';

export type QuestionType = 'mcq' | 'multiple_select' | 'short_answer';

export interface IQuestion {
  id: string;
  type: QuestionType;
  question: string;
  options?: string[]; // for mcq and multiple_select
  correctAnswer: string | string[]; // authoritative, excluded from public student response
  marks: number;
  orderNum: number;
}

export interface IExamSettings {
  shuffleQuestions?: boolean;
  requireFullscreen?: boolean;
  maxViolations?: number;
  retentionDays?: number;
  instituteName?: string;
  showScoreImmediately?: boolean;
  allowEarlyStart?: boolean;
  joinWindowMinutesBeforeStart?: number;
}

export interface IExam extends Document {
  teacherId: string;
  title: string;
  description: string;
  examCode: string;
  questions: IQuestion[];
  duration: number; // in minutes
  startTime: Date;
  endTime: Date;
  status: 'draft' | 'published' | 'scheduled' | 'active' | 'completed' | 'archived';
  settings: IExamSettings;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['mcq', 'multiple_select', 'short_answer'],
      default: 'mcq'
    },
    question: { type: String, required: true, maxlength: 4000 },
    options: [{ type: String, maxlength: 1000 }],
    correctAnswer: { type: Schema.Types.Mixed, required: true },
    marks: { type: Number, required: true, default: 1, min: 0.1 },
    orderNum: { type: Number, default: 0 }
  },
  { _id: false }
);

const ExamSchema = new Schema<IExam>(
  {
    teacherId: {
      type: String,
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      default: '',
      maxlength: 2000
    },
    examCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      uppercase: true,
      trim: true
    },
    questions: [QuestionSchema],
    duration: {
      type: Number,
      required: true,
      min: 1,
      max: 1440 // 24 hours
    },
    startTime: {
      type: Date,
      required: true,
      index: true
    },
    endTime: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'scheduled', 'active', 'completed', 'archived'],
      default: 'draft',
      index: true
    },
    settings: {
      shuffleQuestions: { type: Boolean, default: false },
      requireFullscreen: { type: Boolean, default: true },
      maxViolations: { type: Number, default: 5 },
      retentionDays: { type: Number, default: 30 },
      instituteName: { type: String, default: 'exam.co' },
      showScoreImmediately: { type: Boolean, default: true },
      allowEarlyStart: { type: Boolean, default: false },
      joinWindowMinutesBeforeStart: { type: Number, default: 120 }
    }
  },
  {
    timestamps: true
  }
);

ExamSchema.index({ teacherId: 1, createdAt: -1 });
ExamSchema.index({ examCode: 1, status: 1 });

export const Exam = mongoose.model<IExam>('Exam', ExamSchema);
