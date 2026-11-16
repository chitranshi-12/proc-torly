import dotenv from 'dotenv';
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const rawJwtSecret = process.env.JWT_SECRET?.trim() || '';

// In production, JWT_SECRET is strictly mandatory and cannot use hardcoded development fallbacks
if (isProd && (!rawJwtSecret || rawJwtSecret === 'exam_co_secure_student_session_key_2026')) {
  throw new Error('FATAL: JWT_SECRET environment variable is required and must not use a hardcoded default in production.');
}

const frontendOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((s) => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

export const ENV = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProd,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/exam_co',
  DB_NAME: process.env.DB_NAME || 'exam_co',
  FRONTEND_ORIGINS: frontendOrigins,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'pure-night-k3kqt',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || '',
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  JWT_SECRET: rawJwtSecret || 'exam_co_secure_student_session_key_2026',
};

/**
 * Validates incoming HTTP/WebSocket Origin header against FRONTEND_ORIGINS allowlist.
 * In development, permits localhost and 127.0.0.1 origins.
 * In production, strictly requires exact match in FRONTEND_ORIGINS allowlist.
 */
export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true; // Allow non-browser, server-to-server or same-origin requests

  if (!ENV.isProd) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return true;
      }
    } catch {}
  }

  const normalized = origin.replace(/\/+$/, '');
  return ENV.FRONTEND_ORIGINS.includes(normalized);
}
