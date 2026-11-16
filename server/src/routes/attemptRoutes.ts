import { Router } from 'express';
import { attemptController } from '../controllers/attemptController.js';
import { monitorController } from '../controllers/monitorController.js';
import { teacherAuthMiddleware, studentAuthMiddleware, studentOrTeacherAuthMiddleware } from '../middleware/authMiddleware.js';
import { submissionLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/:id/eligibility', studentOrTeacherAuthMiddleware, attemptController.getStartEligibility);
router.post('/:id/evidence', studentAuthMiddleware, attemptController.recordEvidence);
router.post('/:id/start', studentAuthMiddleware, attemptController.startAttempt);
router.get('/:id', studentAuthMiddleware, attemptController.getAttempt);
router.put('/:id/answers', studentAuthMiddleware, attemptController.saveAnswers);
router.post('/:id/answers', studentAuthMiddleware, attemptController.saveAnswers);
router.post('/:id/submit', submissionLimiter, studentAuthMiddleware, attemptController.submitAttempt);
router.post('/:id/terminate', studentOrTeacherAuthMiddleware, attemptController.terminateAttempt);
router.post('/:id/reset-session', teacherAuthMiddleware, attemptController.teacherResetSession);
router.get('/:id/incidents', studentAuthMiddleware, monitorController.getAttemptIncidents);

export default router;
