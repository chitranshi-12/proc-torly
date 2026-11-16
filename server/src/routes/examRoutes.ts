import { Router } from 'express';
import { examController } from '../controllers/examController.js';
import { teacherAuthMiddleware } from '../middleware/authMiddleware.js';
import { monitorController } from '../controllers/monitorController.js';
import { reportController } from '../controllers/reportController.js';

const router = Router();

// Teacher authenticated exam routes
router.get('/', teacherAuthMiddleware, examController.listTeacherExams);
router.post('/', teacherAuthMiddleware, examController.createExam);
router.get('/:id', teacherAuthMiddleware, examController.getExam);
router.patch('/:id', teacherAuthMiddleware, examController.updateExam);
router.put('/:id', teacherAuthMiddleware, examController.updateExam);
router.delete('/:id', teacherAuthMiddleware, examController.deleteExam);
router.post('/:id/publish', teacherAuthMiddleware, examController.publishExam);

// Monitoring and results on exams
router.get('/:id/monitor', teacherAuthMiddleware, monitorController.getExamMonitoring);
router.get('/:id/results', teacherAuthMiddleware, reportController.getExamResults);
router.get('/:id/export', teacherAuthMiddleware, reportController.exportCSV);

export default router;
