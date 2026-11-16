import { Exam, IExam, IQuestion } from '../models/Exam.js';
import { Attempt } from '../models/Attempt.js';
import { isDBConnected } from '../config/db.js';
import { memoryStore, MemExam } from './memoryStore.js';
import { ENV } from '../config/env.js';
import crypto from 'crypto';

export function generateExamCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const examService = {
  async createExam(teacherId: string, data: Partial<IExam>): Promise<IExam | MemExam> {
    const examCode = data.examCode?.trim().toUpperCase() || generateExamCode();

    const questions: IQuestion[] = (data.questions || []).map((q, idx) => ({
      id: q.id || `q_${crypto.randomUUID().slice(0, 8)}`,
      type: q.type || 'mcq',
      question: q.question.trim(),
      options: q.options || [],
      correctAnswer: q.correctAnswer,
      marks: Number(q.marks) || 1,
      orderNum: q.orderNum ?? idx + 1
    }));

    const duration = Number(data.duration) || 60;
    const startTime = data.startTime ? new Date(data.startTime) : new Date();
    const endTime = data.endTime ? new Date(data.endTime) : new Date(Date.now() + 7 * 24 * 3600000);

    if (isDBConnected()) {
      try {
        const exam = await Exam.create({
          teacherId,
          title: data.title?.trim() || 'Untitled Examination',
          description: data.description?.trim() || '',
          examCode,
          questions,
          duration,
          startTime,
          endTime,
          status: data.status || 'published',
          settings: {
            shuffleQuestions: data.settings?.shuffleQuestions ?? false,
            requireFullscreen: data.settings?.requireFullscreen ?? true,
            maxViolations: data.settings?.maxViolations ?? 5,
            retentionDays: data.settings?.retentionDays ?? 30,
            instituteName: data.settings?.instituteName ?? 'exam.co',
            showScoreImmediately: data.settings?.showScoreImmediately ?? true,
            allowEarlyStart: Boolean(data.settings?.allowEarlyStart),
            joinWindowMinutesBeforeStart: data.settings?.joinWindowMinutesBeforeStart ?? 30
          }
        });
        return exam;
      } catch (err) {
        if (ENV.isProd) throw err; // never silently fall back in production
        console.warn('MongoDB Exam.create fallback to memoryStore:', err);
      }
    }

    const memExam: MemExam = {
      _id: `exam_${crypto.randomUUID().slice(0, 10)}`,
      teacherId,
      title: data.title?.trim() || 'Untitled Examination',
      description: data.description?.trim() || '',
      examCode,
      questions,
      duration,
      startTime,
      endTime,
      status: (data.status as any) || 'published',
      settings: {
        shuffleQuestions: data.settings?.shuffleQuestions ?? false,
        requireFullscreen: data.settings?.requireFullscreen ?? true,
        maxViolations: data.settings?.maxViolations ?? 5,
        retentionDays: data.settings?.retentionDays ?? 30,
        instituteName: data.settings?.instituteName ?? 'exam.co',
        showScoreImmediately: data.settings?.showScoreImmediately ?? true,
        allowEarlyStart: Boolean(data.settings?.allowEarlyStart),
        joinWindowMinutesBeforeStart: data.settings?.joinWindowMinutesBeforeStart ?? 30
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    memExam.id = memExam._id;
    memoryStore.exams.set(memExam._id, memExam);
    return memExam;
  },

  async updateExam(examId: string, teacherId: string, updates: Partial<IExam>): Promise<IExam | MemExam | null> {
    // Guard published exam question modifications if candidate attempts exist
    if (updates.questions !== undefined) {
      if (isDBConnected()) {
        try {
          const attemptCount = await Attempt.countDocuments({
            examId,
            status: { $in: ['in_progress', 'submitted', 'terminated'] }
          });
          if (attemptCount > 0) {
            throw new Error('Cannot modify question structure: This examination already has active or completed candidate submissions. Create a duplicate assessment to adjust questions.');
          }
        } catch (err: any) {
          if (err.message && err.message.includes('Cannot modify question structure')) throw err;
        }
      } else {
        const memAttempts = Array.from(memoryStore.attempts.values()).filter(
          (a) => a.examId === examId && ['in_progress', 'submitted', 'terminated'].includes(a.status)
        );
        if (memAttempts.length > 0) {
          throw new Error('Cannot modify question structure: This examination already has active or completed candidate submissions. Create a duplicate assessment to adjust questions.');
        }
      }
    }

    if (isDBConnected()) {
      try {
        const exam = await Exam.findOne({ _id: examId, teacherId });
        if (exam) {
          if (updates.title !== undefined) exam.title = updates.title.trim();
          if (updates.description !== undefined) exam.description = updates.description.trim();
          if (updates.duration !== undefined) exam.duration = Number(updates.duration);
          if (updates.startTime !== undefined) exam.startTime = new Date(updates.startTime);
          if (updates.endTime !== undefined) exam.endTime = new Date(updates.endTime);
          if (updates.status !== undefined) exam.status = updates.status;
          if (updates.settings !== undefined) {
            exam.settings = { ...exam.settings, ...updates.settings };
          }
          if (updates.questions !== undefined) {
            exam.questions = updates.questions.map((q: any, idx: number) => ({
              id: q.id || `q_${crypto.randomUUID().slice(0, 8)}`,
              type: q.type || 'mcq',
              question: (q.question || '').trim(),
              options: q.options || [],
              correctAnswer: q.correctAnswer,
              marks: Number(q.marks) || 1,
              orderNum: q.orderNum ?? idx + 1
            }));
          }
          await exam.save();
          return exam;
        }
      } catch (err) { if (ENV.isProd) throw err; }
    }

    const mem = memoryStore.exams.get(examId);
    if (!mem || mem.teacherId !== teacherId) return null;
    if (updates.title !== undefined) mem.title = updates.title.trim();
    if (updates.description !== undefined) mem.description = updates.description.trim();
    if (updates.duration !== undefined) mem.duration = Number(updates.duration);
    if (updates.startTime !== undefined) mem.startTime = new Date(updates.startTime);
    if (updates.endTime !== undefined) mem.endTime = new Date(updates.endTime);
    if (updates.status !== undefined) mem.status = updates.status as any;
    if (updates.settings !== undefined) {
      mem.settings = { ...mem.settings, ...updates.settings };
    }
    if (updates.questions !== undefined) {
      mem.questions = updates.questions.map((q: any, idx: number) => ({
        id: q.id || `q_${crypto.randomUUID().slice(0, 8)}`,
        type: q.type || 'mcq',
        question: (q.question || '').trim(),
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        marks: Number(q.marks) || 1,
        orderNum: q.orderNum ?? idx + 1
      }));
    }
    mem.updatedAt = new Date();
    return mem;
  },

  async deleteExam(examId: string, teacherId: string): Promise<boolean> {
    if (isDBConnected()) {
      try {
        const res = await Exam.deleteOne({ _id: examId, teacherId });
        if (res.deletedCount > 0) return true;
      } catch (err) { if (ENV.isProd) throw err; }
    }
    const mem = memoryStore.exams.get(examId);
    if (mem && mem.teacherId === teacherId) {
      memoryStore.exams.delete(examId);
      return true;
    }
    return false;
  },

  async getExamsByTeacher(teacherId: string): Promise<any[]> {
    if (isDBConnected()) {
      try {
        return await Exam.find({ teacherId }).sort({ createdAt: -1 });
      } catch (err) { if (ENV.isProd) throw err; }
    }
    return Array.from(memoryStore.exams.values())
      .filter((e) => e.teacherId === teacherId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async getExamById(examId: string, teacherId?: string): Promise<any | null> {
    if (isDBConnected()) {
      try {
        const query: any = { _id: examId };
        if (teacherId) query.teacherId = teacherId;
        const exam = await Exam.findOne(query);
        if (exam) return exam;
      } catch (err) { if (ENV.isProd) throw err; }
    }
    const mem = memoryStore.exams.get(examId);
    if (mem && (!teacherId || mem.teacherId === teacherId)) {
      return mem;
    }
    return null;
  },

  async getExamByCode(code: string): Promise<any | null> {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();
    if (isDBConnected()) {
      try {
        let exam = await Exam.findOne({ examCode: cleanCode });
        if (!exam) {
          exam = await Exam.findOne({
            examCode: { $regex: new RegExp(`^${cleanCode}$`, 'i') }
          });
        }
        if (exam) return exam;
      } catch (err) { if (ENV.isProd) throw err; }
    }
    for (const exam of memoryStore.exams.values()) {
      if ((exam.examCode || '').toUpperCase() === cleanCode) {
        return exam;
      }
    }
    return null;
  },

  sanitizeForStudent(exam: any): any {
    const obj = exam.toObject ? exam.toObject() : { ...exam };
    obj.questions = (obj.questions || []).map((q: any) => {
      const { correctAnswer, ...safeQuestion } = q;
      return safeQuestion;
    });
    return obj;
  },

  async publishExam(examId: string, teacherId: string): Promise<any | null> {
    if (isDBConnected()) {
      try {
        const exam = await Exam.findOne({ _id: examId, teacherId });
        if (exam) {
          exam.status = 'active';
          await exam.save();
          return exam;
        }
      } catch (err) { if (ENV.isProd) throw err; }
    }
    const mem = memoryStore.exams.get(examId);
    if (mem && mem.teacherId === teacherId) {
      mem.status = 'active';
      return mem;
    }
    return null;
  }
};
