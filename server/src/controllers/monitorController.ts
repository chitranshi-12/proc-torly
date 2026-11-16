import { Request, Response } from 'express';
import { monitorService } from '../services/monitorService.js';
import { examService } from '../services/examService.js';
import { Attempt } from '../models/Attempt.js';

export const monitorController = {
  async getExamMonitoring(req: Request, res: Response) {
    try {
      const examId = req.params.id;
      const teacherId = req.user!.id;

      // Ensure exam belongs to teacher or user is admin
      const exam = await examService.getExamById(examId, teacherId);
      if (!exam && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized to monitor this examination.' });
      }

      const snapshot = await monitorService.getMonitoringSnapshot(examId);
      return res.json(snapshot);
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to load monitoring snapshot.' });
    }
  },

  async recordIncident(req: Request, res: Response) {
    try {
      const { examId, attemptId, studentId, studentName, incidentType, severity, metadata } = req.body;
      if (!examId || !attemptId || !incidentType) {
        return res.status(400).json({ error: 'examId, attemptId, and incidentType are required.' });
      }

      const result = await monitorService.recordIncident({
        examId,
        attemptId,
        studentId: studentId || 'cand_unknown',
        studentName,
        incidentType,
        severity,
        metadata
      });

      // Broadcast incident to teacher monitoring room via Socket.IO
      const io = req.app.get('io');
      if (io) {
        io.to(`exam:${examId}:teachers`).emit('incident:created', result.incident);
      }

      return res.status(201).json({
        incident: result.incident,
        riskScore: result.riskScore,
        incidentCount: result.incidentCount
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to record incident.' });
    }
  },

  async getAttemptIncidents(req: Request, res: Response) {
    try {
      const attemptId = req.params.id;
      const incidents = await monitorService.getIncidentsByAttempt(attemptId);
      return res.json({ incidents });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to retrieve incidents.' });
    }
  }
};
