import { Request, Response } from 'express';
import { examService } from '../services/examService.js';

export const examController = {
  async listTeacherExams(req: Request, res: Response) {
    try {
      const teacherId = req.user!.id;
      const exams = await examService.getExamsByTeacher(teacherId);
      return res.json({ exams });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to list examinations.' });
    }
  },

  async createExam(req: Request, res: Response) {
    try {
      const teacherId = req.user!.id;
      const exam = await examService.createExam(teacherId, req.body);
      return res.status(201).json({ exam });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to create examination.' });
    }
  },

  async getExam(req: Request, res: Response) {
    try {
      const teacherId = req.user!.id;
      const exam = await examService.getExamById(req.params.id, teacherId);
      if (!exam) return res.status(404).json({ error: 'Examination not found.' });
      return res.json({ exam });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to retrieve examination.' });
    }
  },

  async updateExam(req: Request, res: Response) {
    try {
      const teacherId = req.user!.id;
      const exam = await examService.updateExam(req.params.id, teacherId, req.body);
      if (!exam) return res.status(404).json({ error: 'Examination not found or not editable.' });
      return res.json({ exam });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Failed to update examination.' });
    }
  },

  async deleteExam(req: Request, res: Response) {
    try {
      const teacherId = req.user!.id;
      const success = await examService.deleteExam(req.params.id, teacherId);
      if (!success) return res.status(404).json({ error: 'Examination not found or not deletable.' });
      return res.json({ success: true, message: 'Examination deleted successfully.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to delete examination.' });
    }
  },

  async publishExam(req: Request, res: Response) {
    try {
      const teacherId = req.user!.id;
      const exam = await examService.publishExam(req.params.id, teacherId);
      if (!exam) return res.status(404).json({ error: 'Examination not found.' });
      return res.json({ exam });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to publish examination.' });
    }
  },

  /**
   * Public endpoint for student lookup by code (correct answers are stripped!)
   */
  async getPublicExamByCode(req: Request, res: Response) {
    try {
      const code = String(req.params.code).trim().toUpperCase();
      const exam = await examService.getExamByCode(code);
      if (!exam) {
        return res.status(404).json({ error: 'Exam access code not found.' });
      }

      const sanitized = examService.sanitizeForStudent(exam);
      return res.json({ exam: sanitized });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load examination.' });
    }
  }
};
