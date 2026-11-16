import { Router } from 'express';
import { attemptController } from '../controllers/attemptController.js';
import { examController } from '../controllers/examController.js';
import { generalLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/exams/:code', generalLimiter, examController.getPublicExamByCode);
router.post('/join', generalLimiter, attemptController.studentJoin);

export default router;
