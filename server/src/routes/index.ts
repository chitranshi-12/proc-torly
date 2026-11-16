import { Router } from 'express';
import authRoutes from './authRoutes.js';
import examRoutes from './examRoutes.js';
import studentRoutes from './studentRoutes.js';
import attemptRoutes from './attemptRoutes.js';
import monitorRoutes from './monitorRoutes.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/exams', examRoutes);
apiRouter.use('/student', studentRoutes);
apiRouter.use('/attempts', attemptRoutes);
apiRouter.use('/monitor', monitorRoutes);
apiRouter.post('/incidents', (req, res, next) => {
  // Direct shortcut for /api/incidents
  req.url = '/incidents';
  monitorRoutes(req, res, next);
});

export default apiRouter;
