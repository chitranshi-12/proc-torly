import { Request, Response, NextFunction } from 'express';
import { ENV } from '../config/env.js';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  console.error(`❌ [${req.method}] ${req.url} - Error ${statusCode}:`, err);

  res.status(statusCode).json({
    error: message,
    ...(ENV.isProd ? {} : { stack: err.stack })
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}
