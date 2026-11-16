import { Request, Response } from 'express';
import { reportService } from '../services/reportService.js';
import { examService } from '../services/examService.js';

export const reportController = {
  async getExamResults(req: Request, res: Response) {
    try {
      const examId = req.params.id;
      const teacherId = req.user!.id;

      const exam = await examService.getExamById(examId, teacherId);
      if (!exam && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to view results for this examination.' });
      }

      const report = await reportService.getExamResults(examId);
      return res.json(report);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to fetch results.' });
    }
  },

  async exportCSV(req: Request, res: Response) {
    try {
      const examId = req.params.id;
      const teacherId = req.user!.id;

      const exam = await examService.getExamById(examId, teacherId);
      if (!exam && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to export results for this examination.' });
      }

      const examCode = exam ? exam.examCode : 'results';
      const csvData = await reportService.generateCSV(examId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="exam_${examCode}_results.csv"`);
      return res.status(200).send(csvData);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to export CSV.' });
    }
  }
};
