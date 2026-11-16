import { Request, Response, NextFunction } from 'express';
import { getAdminAuth } from '../config/firebaseAdmin.js';
import { authService } from '../services/authService.js';
import { Attempt } from '../models/Attempt.js';
import { Session } from '../models/Session.js';
import { isDBConnected } from '../config/db.js';
import { memoryStore } from '../services/memoryStore.js';
import crypto from 'crypto';

export interface AuthenticatedUser {
  id: string;
  firebaseUid: string;
  email: string;
  name: string;
  role: 'teacher' | 'invigilator' | 'admin';
  photoURL?: string;
}

export interface StudentAuthSession {
  attemptId: string;
  examId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      studentSession?: StudentAuthSession;
    }
  }
}

/**
 * Teacher & Staff Authentication Middleware
 * Verifies Firebase ID Token, upserts MongoDB Teacher record, and enforces teacher role.
 */
export async function teacherAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No Bearer token provided.' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const adminAuth = getAdminAuth();

  let uid: string;
  let email: string = '';
  let name: string = '';
  let photoURL: string = '';

  // 1. Dev/testing token — BLOCKED in production
  if (token.startsWith('dev_teacher_token_')) {
    const { ENV } = await import('../config/env.js');
    if (ENV.isProd) {
      return res.status(401).json({ error: 'Dev tokens are not accepted in production.' });
    }
    uid = token.replace('dev_teacher_token_', '');
    email = `${uid}@exam.co`;
    name = 'Dev Teacher';
  } else if (adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email || '';
      name = decoded.name || email.split('@')[0] || 'Teacher';
      photoURL = decoded.picture || '';
    } catch (err: any) {
      return res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
    }
  } else {
    // JWT payload decoder — only allowed in development (no Firebase Admin private key configured)
    const { ENV } = await import('../config/env.js');
    if (ENV.isProd) {
      // In production, Firebase Admin must be configured; unverified tokens are rejected.
      return res.status(401).json({ error: 'Firebase Admin SDK not configured. Cannot verify token in production.' });
    }
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        uid = payload.user_id || payload.sub || payload.uid;
        email = payload.email || '';
        name = payload.name || email.split('@')[0] || 'Teacher';
        photoURL = payload.picture || '';
      } else {
        return res.status(401).json({ error: 'Malformed authentication token.' });
      }
    } catch {
      return res.status(401).json({ error: 'Unable to parse authentication token.' });
    }
  }

  try {
    const teacher = await authService.getOrCreateTeacher({
      uid,
      name,
      email,
      photoURL
    });

    req.user = {
      id: String(teacher._id),
      firebaseUid: teacher.firebaseUid,
      email: teacher.email,
      name: teacher.name,
      role: teacher.role,
      photoURL: teacher.photoURL
    };

    next();
  } catch (error: any) {
    req.user = {
      id: uid,
      firebaseUid: uid,
      email: email || `${uid}@exam.co`,
      name: name || 'Teacher',
      role: 'teacher',
      photoURL
    };
    next();
  }
}

/**
 * Student Session Authorization Middleware
 * Validates cryptographically random session secret token (SHA-256 hashed).
 * Prevents IDOR, token guessing, and unauthorized cross-student attempt tampering.
 */
export async function studentAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const attemptId = req.params.id || req.params.attemptId || (req.body && req.body.attemptId);
  let studentToken = (req.headers['x-student-session'] as string) || (req.headers['x-student-id'] as string) || '';

  if (studentToken.startsWith('{')) {
    try {
      const parsed = JSON.parse(studentToken);
      studentToken = parsed.sessionToken || parsed.attemptId || parsed.sessionId || parsed.studentId || studentToken;
    } catch {}
  }

  if (!attemptId) {
    return res.status(400).json({ error: 'Attempt identifier is required.' });
  }

  if (!studentToken || studentToken.trim().length === 0) {
    return res.status(401).json({ error: 'Session authentication required. No student session secret provided.' });
  }

  try {
    let attempt: any = null;
    let session: any = null;

    if (isDBConnected()) {
      try {
        attempt = await Attempt.findById(attemptId);
        if (attempt) {
          session = await Session.findOne({ attemptId: String(attempt._id) });
        } else {
          session = await Session.findById(attemptId);
          if (session && session.attemptId) {
            attempt = await Attempt.findById(session.attemptId);
          }
        }
      } catch {}
    }

    if (!attempt) {
      attempt = memoryStore.attempts.get(attemptId);
      if (attempt) {
        session = Array.from(memoryStore.sessions.values()).find((s) => s.attemptId === String(attempt._id));
      } else {
        const memSession = memoryStore.sessions.get(attemptId);
        if (memSession && memSession.attemptId) {
          attempt = memoryStore.attempts.get(memSession.attemptId);
          session = memSession;
        }
      }
    }

    if (!attempt) {
      return res.status(404).json({ error: 'Examination attempt not found.' });
    }

    // Strict Security & Legacy Session Handling:
    // Missing session or missing sessionTokenHash MUST be rejected immediately (401 Unauthorized).
    // Never authenticate or automatically upgrade legacy sessions based solely on attemptId, studentId, or rollNo.
    if (!session || !session.sessionTokenHash) {
      return res.status(401).json({
        error: 'Session authentication failed: Session requires recovery. Missing cryptographic session token hash.',
        code: 'SESSION_TOKEN_HASH_MISSING'
      });
    }

    // Cross-verify session ownership against the specific attempt and examination
    if (session.attemptId !== String(attempt._id) || session.examId !== attempt.examId) {
      return res.status(403).json({ error: 'Session does not match examination attempt.' });
    }

    const incomingToken = studentToken.trim();
    const incomingHash = crypto.createHash('sha256').update(incomingToken).digest('hex');

    let isAuthorized = false;
    if (incomingHash.length === session.sessionTokenHash.length) {
      isAuthorized = crypto.timingSafeEqual(
        Buffer.from(incomingHash, 'hex'),
        Buffer.from(session.sessionTokenHash, 'hex')
      );
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Unauthorized attempt access. Invalid or mismatched session secret.' });
    }

    req.studentSession = {
      attemptId: String(attempt._id),
      examId: attempt.examId,
      studentId: attempt.studentId,
      studentName: attempt.studentName,
      rollNo: attempt.rollNo
    };

    next();
  } catch (err: any) {
    console.error('Student auth verification error:', err);
    return res.status(500).json({ error: 'Failed to verify examination attempt.' });
  }
}

/**
 * Combined Student or Teacher Auth Middleware
 * Permits candidate session or authenticated teacher/invigilator.
 */
export async function studentOrTeacherAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return teacherAuthMiddleware(req, res, next);
  }
  return studentAuthMiddleware(req, res, next);
}
