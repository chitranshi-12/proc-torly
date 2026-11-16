import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { teacherAuthMiddleware } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/me', authLimiter, teacherAuthMiddleware, authController.getMe);
router.post('/verify', authLimiter, teacherAuthMiddleware, authController.verifyToken);

export default router;
