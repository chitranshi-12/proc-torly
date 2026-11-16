import { Router } from 'express';
import { monitorController } from '../controllers/monitorController.js';
import { generalLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/incidents', generalLimiter, monitorController.recordIncident);

export default router;
