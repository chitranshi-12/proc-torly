import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { Session } from '../models/Session.js';
import { Attempt } from '../models/Attempt.js';
import { Incident } from '../models/Incident.js';
import { ENV, isAllowedOrigin } from '../config/env.js';
import { getAdminAuth } from '../config/firebaseAdmin.js';

/** Tracks which sockets have been verified as teachers (socketId → examId). */
const verifiedTeacherSockets = new Map<string, Set<string>>(); // socketId → Set<examId>

async function verifyTeacherSocket(socket: Socket, examId: string): Promise<boolean> {
  // Check in-memory set first (already verified)
  const allowedExams = verifiedTeacherSockets.get(socket.id);
  if (allowedExams?.has(examId)) return true;

  // Attempt verification via handshake auth token
  const token = (socket.handshake.auth?.token as string) || (socket.handshake.headers?.authorization as string | undefined)?.replace('Bearer ', '');
  if (!token) return false;

  // Dev token accepted only outside production
  if (!ENV.isProd && token.startsWith('dev_teacher_token_')) {
    const set = verifiedTeacherSockets.get(socket.id) || new Set<string>();
    set.add(examId);
    verifiedTeacherSockets.set(socket.id, set);
    return true;
  }

  const adminAuth = getAdminAuth();
  if (!adminAuth) return false;
  try {
    await adminAuth.verifyIdToken(token);
    const set = verifiedTeacherSockets.get(socket.id) || new Set<string>();
    set.add(examId);
    verifiedTeacherSockets.set(socket.id, set);
    return true;
  } catch {
    return false;
  }
}

interface CandidateSocketMeta {
  socketId: string;
  examId: string;
  attemptId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  lastHeartbeat: number;
}

const activeCandidates = new Map<string, CandidateSocketMeta>(); // socketId -> meta
const candidateSocketLookup = new Map<string, string>(); // attemptId -> socketId

export function setupSocketServer(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked: Origin ${origin} is not allowed by FRONTEND_ORIGINS policy.`));
        }
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 15000,
    pingTimeout: 20000
  });

  io.on('connection', (socket: Socket) => {
    // ── TEACHER / PROCTOR JOIN MONITORING ROOM ──
    socket.on('teacher:join', async (data: { examId: string }) => {
      const { examId } = data;
      if (!examId) return;

      // Verify caller is an authenticated teacher
      const authorized = await verifyTeacherSocket(socket, examId);
      if (!authorized) {
        socket.emit('error:unauthorized', { message: 'Teacher authentication required to join monitoring room.' });
        return;
      }

      const room = `exam:${examId}:teachers`;
      socket.join(room);

      // Send current snapshot of active candidates for this exam
      const onlineCandidates = Array.from(activeCandidates.values())
        .filter((c) => c.examId === examId);

      socket.emit('monitoring:snapshot', {
        examId,
        onlineCandidates
      });
    });

    // ── STUDENT JOINS EXAM SESSION ──
    socket.on('exam:join', async (data: {
      examId: string;
      attemptId: string;
      studentId: string;
      studentName: string;
      rollNo: string;
    }) => {
      const { examId, attemptId, studentId, studentName, rollNo } = data;
      if (!examId || !attemptId) return;

      const meta: CandidateSocketMeta = {
        socketId: socket.id,
        examId,
        attemptId,
        studentId: studentId || 'cand_unknown',
        studentName: studentName || 'Candidate',
        rollNo: rollNo || '',
        lastHeartbeat: Date.now()
      };

      activeCandidates.set(socket.id, meta);
      candidateSocketLookup.set(attemptId, socket.id);

      socket.join(`attempt:${attemptId}`);
      socket.join(`exam:${examId}:students`);

      // Update session in DB
      try {
        await Session.updateOne(
          { attemptId },
          {
            socketId: socket.id,
            sessionStatus: 'connected',
            lastHeartbeat: new Date()
          }
        );
      } catch (err) {
        console.warn('Socket Session update error:', err);
      }

      // Notify teachers monitoring this exam
      io.to(`exam:${examId}:teachers`).emit('candidate:joined', {
        attemptId,
        studentId,
        studentName,
        rollNo,
        timestamp: new Date().toISOString()
      });
    });

    // ── CANDIDATE REAL-TIME VIDEO & SCREEN FRAME STREAMING (Zero Blackout Live Feed) ──
    socket.on('candidate:stream_frame', (data: {
      examId: string;
      attemptId: string;
      studentId: string;
      screenDataUrl?: string;
      camDataUrl?: string;
      timestamp: number;
    }) => {
      const { examId, attemptId } = data || {};
      if (!examId || !attemptId) return;
      io.to(`exam:${examId}:teachers`).emit('candidate:stream_frame', data);
    });

    // ── WEBRTC SIGNALING: TEACHER INITIATES CALL (OFFER) ──
    socket.on('webrtc:offer', (data: { attemptId: string; examId: string; offer: any }) => {
      const { attemptId, examId, offer } = data || {};
      if (!attemptId || !offer) return;
      io.to(`attempt:${attemptId}`).emit('webrtc:offer', {
        attemptId,
        examId,
        offer,
        fromSocket: socket.id
      });
    });

    // ── WEBRTC SIGNALING: CANDIDATE ANSWERS CALL (ANSWER) ──
    socket.on('webrtc:answer', (data: { attemptId: string; examId: string; answer: any }) => {
      const { attemptId, examId, answer } = data || {};
      if (!attemptId || !answer) return;
      io.to(`exam:${examId}:teachers`).emit('webrtc:answer', {
        attemptId,
        examId,
        answer,
        fromSocket: socket.id
      });
    });

    // ── WEBRTC SIGNALING: ICE CANDIDATES RELAY ──
    socket.on('webrtc:ice_candidate', (data: {
      attemptId: string;
      examId: string;
      candidate: any;
      from: 'student' | 'teacher';
    }) => {
      const { attemptId, examId, candidate, from } = data || {};
      if (!attemptId || !candidate) return;
      if (from === 'teacher') {
        io.to(`attempt:${attemptId}`).emit('webrtc:ice_candidate', data);
      } else {
        io.to(`exam:${examId}:teachers`).emit('webrtc:ice_candidate', data);
      }
    });

    // ── CANDIDATE HEARTBEAT ──
    socket.on('candidate:heartbeat', async (data: {
      examId: string;
      attemptId: string;
      studentId: string;
      answeredCount?: number;
      progressPercent?: number;
    }) => {
      const { examId, attemptId, answeredCount, progressPercent } = data;
      const meta = activeCandidates.get(socket.id);
      if (meta) {
        meta.lastHeartbeat = Date.now();
      }

      const now = new Date();
      // Update session in DB asynchronously
      Session.updateOne(
        { attemptId },
        {
          lastHeartbeat: now,
          sessionStatus: 'connected',
          ...(answeredCount !== undefined ? { answeredCount } : {}),
          ...(progressPercent !== undefined ? { progressPercent } : {})
        }
      ).catch(() => {});

      // Broadcast heartbeat progress to teachers
      io.to(`exam:${examId}:teachers`).emit('candidate:progress', {
        attemptId,
        isOnline: true,
        answeredCount: answeredCount ?? 0,
        progressPercent: progressPercent ?? 0,
        lastHeartbeat: now.toISOString()
      });
    });

    // ── INCIDENT REPORTED ──
    socket.on('incident:reported', async (data: {
      examId: string;
      attemptId: string;
      studentId: string;
      incidentType: string;
      severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      metadata?: any;
    }) => {
      const { examId, attemptId, studentId, incidentType, severity = 'MEDIUM', metadata } = data;
      const meta = activeCandidates.get(socket.id);
      const studentName = meta?.studentName || '';

      const now = new Date();
      let incidentId = `inc_${Date.now()}`;

      try {
        const doc = await Incident.create({
          examId,
          attemptId,
          studentId,
          studentName,
          incidentType,
          severity,
          metadata: metadata || {},
          timestamp: now
        });
        incidentId = String(doc._id);
      } catch (err) {
        console.warn('Socket Incident creation error:', err);
      }

      // Notify teachers immediately
      io.to(`exam:${examId}:teachers`).emit('incident:created', {
        id: incidentId,
        examId,
        attemptId,
        studentId,
        studentName,
        incidentType,
        severity,
        metadata,
        timestamp: now.toISOString()
      });
    });

    // ── TEACHER ACTION: SEND WARNING ──
    socket.on('teacher:send_warning', async (data: {
      attemptId: string;
      examId: string;
      message: string;
      teacherName?: string;
    }) => {
      const { attemptId, examId, message, teacherName } = data;

      const authorized = await verifyTeacherSocket(socket, examId);
      if (!authorized) {
        socket.emit('error:unauthorized', { message: 'Teacher authentication required to send warnings.' });
        return;
      }

      io.to(`attempt:${attemptId}`).emit('student:warning_received', {
        message,
        teacherName: teacherName || 'Invigilator',
        timestamp: new Date().toISOString()
      });

      // Confirm to teachers room
      io.to(`exam:${examId}:teachers`).emit('teacher:warning_sent', {
        attemptId,
        message,
        timestamp: new Date().toISOString()
      });
    });

    // ── TEACHER ACTION: ADD EXTRA TIME ──
    socket.on('teacher:add_time', async (data: {
      attemptId: string;
      examId: string;
      minutes: number;
    }) => {
      const { attemptId, examId, minutes } = data;

      const authorized = await verifyTeacherSocket(socket, examId);
      if (!authorized) {
        socket.emit('error:unauthorized', { message: 'Teacher authentication required to add time.' });
        return;
      }

      const addMs = (Number(minutes) || 5) * 60 * 1000;

      try {
        const attempt = await Attempt.findById(attemptId);
        if (attempt && attempt.expiresAt) {
          attempt.expiresAt = new Date(attempt.expiresAt.getTime() + addMs);
          await attempt.save();

          io.to(`attempt:${attemptId}`).emit('student:time_added', {
            minutes,
            newExpiresAt: attempt.expiresAt.toISOString()
          });

          io.to(`exam:${examId}:teachers`).emit('monitoring:update', {
            attemptId,
            action: 'time_added',
            minutes,
            newExpiresAt: attempt.expiresAt.toISOString()
          });
        }
      } catch (err) {
        console.error('Failed to add time:', err);
      }
    });

    // ── TEACHER ACTION: TERMINATE EXAM ──
    socket.on('teacher:terminate_exam', async (data: {
      attemptId: string;
      examId: string;
      reason: string;
    }) => {
      const { attemptId, examId, reason } = data;

      const authorized = await verifyTeacherSocket(socket, examId);
      if (!authorized) {
        socket.emit('error:unauthorized', { message: 'Teacher authentication required to terminate an attempt.' });
        return;
      }

      try {
        await Attempt.findByIdAndUpdate(attemptId, {
          status: 'terminated',
          submittedAt: new Date()
        });
        await Session.updateOne({ attemptId }, { sessionStatus: 'terminated' });

        io.to(`attempt:${attemptId}`).emit('student:exam_terminated', {
          reason: reason || 'Terminated by examination proctor.'
        });

        io.to(`exam:${examId}:teachers`).emit('candidate:status', {
          attemptId,
          status: 'terminated'
        });
      } catch (err) {
        console.error('Failed to terminate exam via socket:', err);
      }
    });

    // ── CANDIDATE SUBMISSION EVENT ──
    socket.on('attempt:submitted', (data: { attemptId: string; examId: string; studentName?: string }) => {
      const { attemptId, examId, studentName } = data;
      io.to(`exam:${examId}:teachers`).emit('attempt:submitted', {
        attemptId,
        studentName: studentName || 'Candidate',
        timestamp: new Date().toISOString()
      });
    });

    // ── DISCONNECT ──
    socket.on('disconnect', () => {
      verifiedTeacherSockets.delete(socket.id);
      const meta = activeCandidates.get(socket.id);
      if (meta) {
        activeCandidates.delete(socket.id);
        candidateSocketLookup.delete(meta.attemptId);

        // Update DB session
        Session.updateOne(
          { attemptId: meta.attemptId },
          { sessionStatus: 'disconnected', disconnectedAt: new Date() }
        ).catch(() => {});

        // Notify teachers
        io.to(`exam:${meta.examId}:teachers`).emit('candidate:disconnected', {
          attemptId: meta.attemptId,
          studentName: meta.studentName,
          timestamp: new Date().toISOString()
        });
      }
    });
  });

  // Background interval: sweep for heartbeat timeouts (>30 seconds)
  setInterval(() => {
    const now = Date.now();
    for (const [socketId, meta] of activeCandidates.entries()) {
      if (now - meta.lastHeartbeat > 30000) {
        // Stale heartbeat
        io.to(`exam:${meta.examId}:teachers`).emit('candidate:status', {
          attemptId: meta.attemptId,
          isOnline: false
        });
      }
    }
  }, 10000);

  return io;
}
