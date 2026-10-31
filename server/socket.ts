import { Server as SocketIOServer, Socket } from 'socket.io';
import { DB } from './db.js';
import crypto from 'crypto';

interface StudentSessionMetadata {
  sessionId: string;
  examId: string;
  studentName: string;
  rollNo: string;
  socketId: string;
  lastPing: number;
}

const activeStudents = new Map<string, StudentSessionMetadata>();

export function setupSocketIO(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    // Proctor joins an exam room to monitor students
    socket.on('proctor:join', ({ examId }: { examId: string }) => {
      socket.join(`exam:${examId}:proctors`);
      // Send currently online students for this exam
      const studentsInExam = Array.from(activeStudents.values())
        .filter((s) => s.examId === examId);
      socket.emit('proctor:online_students', studentsInExam);
    });

    // Student joins exam session
    socket.on('student:join', async (data: { examId: string; sessionId: string; studentName: string; rollNo: string }) => {
      const { examId, sessionId, studentName, rollNo } = data;
      socket.join(`session:${sessionId}`);
      socket.join(`exam:${examId}`);

      const meta: StudentSessionMetadata = {
        sessionId,
        examId,
        studentName,
        rollNo,
        socketId: socket.id,
        lastPing: Date.now()
      };
      activeStudents.set(socket.id, meta);

      // Update DB session socket_id
      try {
        await DB.run('UPDATE exam_sessions SET socket_id = ?, updated_at = ? WHERE id = ?', [
          socket.id,
          new Date().toISOString(),
          sessionId
        ]);
      } catch (err) {
        console.error('Failed to update student socket id:', err);
      }

      // Notify proctors
      io.to(`exam:${examId}:proctors`).emit('student:connected', meta);
    });

    // Student streams video/screen canvas frame updates (backup & rapid preview feed)
    socket.on('student:stream_frame', (data: { examId: string; sessionId: string; webcam?: string; screen?: string; timestamp?: string }) => {
      io.to(`exam:${data.examId}:proctors`).emit('proctor:stream_frame', data);
    });

    // WebRTC Signaling: Student -> Proctor or Proctor -> Student
    socket.on('webrtc:signal', (data: { targetSocketId?: string; sessionId?: string; examId: string; signal: any; type: 'offer' | 'answer' | 'candidate'; fromRole: 'student' | 'proctor' }) => {
      if (data.targetSocketId) {
        io.to(data.targetSocketId).emit('webrtc:signal', {
          fromSocketId: socket.id,
          sessionId: data.sessionId,
          signal: data.signal,
          type: data.type
        });
      } else if (data.fromRole === 'student') {
        // Broadcast to proctors in this exam
        io.to(`exam:${data.examId}:proctors`).emit('webrtc:signal', {
          fromSocketId: socket.id,
          sessionId: data.sessionId,
          signal: data.signal,
          type: data.type
        });
      }
    });

    // Invigilator command: Send Warning
    socket.on('proctor:send_warning', async (data: { sessionId: string; examId: string; message: string; invigilatorName: string }) => {
      const { sessionId, examId, message, invigilatorName } = data;
      const warningId = crypto.randomUUID();
      const now = new Date().toISOString();

      try {
        await DB.run(
          'INSERT INTO warnings_logs (id, session_id, message, sent_by, timestamp) VALUES (?, ?, ?, ?, ?)',
          [warningId, sessionId, message, invigilatorName || 'Proctor', now]
        );
      } catch (err) {
        console.error('Failed to log warning in DB:', err);
      }

      // Notify student
      io.to(`session:${sessionId}`).emit('student:warning_received', {
        id: warningId,
        message,
        timestamp: now,
        sentBy: invigilatorName
      });

      // Notify proctor room
      io.to(`exam:${examId}:proctors`).emit('proctor:warning_sent', {
        sessionId,
        message,
        timestamp: now
      });
    });

    // Invigilator command: Pause Exam
    socket.on('proctor:pause_exam', async (data: { sessionId: string; examId: string; reason?: string }) => {
      try {
        await DB.run("UPDATE exam_sessions SET status = 'paused', updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          data.sessionId
        ]);
      } catch (err) {
        console.error('Failed to pause session in DB:', err);
      }

      io.to(`session:${data.sessionId}`).emit('student:exam_paused', { reason: data.reason || 'Paused by Proctor' });
      io.to(`exam:${data.examId}:proctors`).emit('proctor:status_changed', { sessionId: data.sessionId, status: 'paused' });
    });

    // Invigilator command: Resume Exam
    socket.on('proctor:resume_exam', async (data: { sessionId: string; examId: string }) => {
      try {
        await DB.run("UPDATE exam_sessions SET status = 'in_progress', updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          data.sessionId
        ]);
      } catch (err) {
        console.error('Failed to resume session in DB:', err);
      }

      io.to(`session:${data.sessionId}`).emit('student:exam_resumed');
      io.to(`exam:${data.examId}:proctors`).emit('proctor:status_changed', { sessionId: data.sessionId, status: 'in_progress' });
    });

    // Invigilator command: Add Extra Time
    socket.on('proctor:add_time', async (data: { sessionId: string; examId: string; minutes: number }) => {
      const addedSeconds = (data.minutes || 5) * 60;
      try {
        await DB.run(
          'UPDATE exam_sessions SET added_time_seconds = added_time_seconds + ?, updated_at = ? WHERE id = ?',
          [addedSeconds, new Date().toISOString(), data.sessionId]
        );
      } catch (err) {
        console.error('Failed to add time in DB:', err);
      }

      io.to(`session:${data.sessionId}`).emit('student:time_added', {
        minutes: data.minutes,
        addedSeconds
      });
      io.to(`exam:${data.examId}:proctors`).emit('proctor:time_added', {
        sessionId: data.sessionId,
        minutes: data.minutes
      });
    });

    // Invigilator command: Terminate Exam
    socket.on('proctor:terminate_exam', async (data: { sessionId: string; examId: string; reason: string }) => {
      try {
        await DB.run("UPDATE exam_sessions SET status = 'terminated', updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          data.sessionId
        ]);
      } catch (err) {
        console.error('Failed to terminate session in DB:', err);
      }

      io.to(`session:${data.sessionId}`).emit('student:exam_terminated', {
        reason: data.reason || 'Terminated due to multiple violations.'
      });
      io.to(`exam:${data.examId}:proctors`).emit('proctor:status_changed', { sessionId: data.sessionId, status: 'terminated' });
    });

    // Disconnect
    socket.on('disconnect', () => {
      const meta = activeStudents.get(socket.id);
      if (meta) {
        activeStudents.delete(socket.id);
        io.to(`exam:${meta.examId}:proctors`).emit('student:disconnected', {
          sessionId: meta.sessionId,
          studentName: meta.studentName
        });
      }
    });
  });
}
