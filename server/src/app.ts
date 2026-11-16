import express, { Express } from 'express';
import cors from 'cors';
import { ENV, isAllowedOrigin } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { isDBConnected } from './config/db.js';

export function createApp(): Express {
  const app = express();

  // Basic security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // CORS Configuration - Exact FRONTEND_ORIGINS allowlisting
  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked: Origin ${origin} is not allowed by FRONTEND_ORIGINS policy.`));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-student-session', 'x-student-id']
    })
  );

  // Request body parsing
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    const dbStatus = isDBConnected() ? 'connected' : 'disconnected';
    res.json({
      status: 'ok',
      service: 'exam.co backend',
      time: new Date().toISOString(),
      database: dbStatus,
      env: ENV.NODE_ENV
    });
  });

  // API Routes
  app.use('/api', apiRouter);

  return app;
}
