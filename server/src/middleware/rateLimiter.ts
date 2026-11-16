import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
}) {
  const ipMap = new Map<string, RateLimitRecord>();

  // Cleanup interval
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipMap.entries()) {
      if (now > record.resetTime) {
        ipMap.delete(ip);
      }
    }
  }, options.windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const record = ipMap.get(ip);

    if (!record || now > record.resetTime) {
      ipMap.set(ip, {
        count: 1,
        resetTime: now + options.windowMs
      });
      return next();
    }

    record.count++;
    if (record.count > options.maxRequests) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({
        error: options.message || 'Too many requests. Please wait a moment before trying again.'
      });
    }

    next();
  };
}

export const generalLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  message: 'Too many requests from this IP.'
});

export const authLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  message: 'Too many authentication attempts. Please slow down.'
});

export const submissionLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 250,
  message: 'Too many submission requests.'
});
