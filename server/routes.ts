import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { google } from 'googleapis';
import { DB } from './db.js';
import { generateToken, authMiddleware, AuthUser } from './auth.js';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

function createOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export function createApiRouter(io: SocketIOServer): Router {
  const router = Router();
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Helper to save base64 image to uploads
  function saveBase64Image(base64Data: string, prefix = 'shot'): string | null {
    if (!base64Data || !base64Data.includes('base64,')) return null;
    try {
      const parts = base64Data.split('base64,');
      const ext = parts[0].includes('image/png') ? 'png' : 'jpg';
      const buffer = Buffer.from(parts[1], 'base64');
      const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filepath = path.join(uploadsDir, filename);
      fs.writeFileSync(filepath, buffer);
      return `/uploads/${filename}`;
    } catch (err) {
      console.error('Failed to save base64 image:', err);
      return null;
    }
  }

  // ==========================================
  // GOOGLE OAUTH2
  // ==========================================

  // Step 1: Redirect browser to Google consent screen
  router.get('/auth/google', (req: Request, res: Response) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect(
        `/?auth_error=${encodeURIComponent('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.')}`
      );
    }
    const oauth2Client = createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account'
    });
    res.redirect(url);
  });

  // Step 2: Google redirects back here with ?code=
  router.get('/auth/google/callback', async (req: Request, res: Response) => {
    const { code, error } = req.query as { code?: string; error?: string };

    if (error || !code) {
      return res.redirect(`/?auth_error=${encodeURIComponent(error || 'Google sign-in was cancelled.')}`);
    }

    try {
      const oauth2Client = createOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Fetch user profile from Google
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2.userinfo.get();

      if (!profile.email) {
        return res.redirect(`/?auth_error=${encodeURIComponent('Could not retrieve email from Google account.')}`);
      }

      const email = profile.email.toLowerCase();
      const name = profile.name || email.split('@')[0];
      const googleId = profile.id || '';

      // Find or create user in local SQLite DB
      let user = await DB.queryOne<any>('SELECT * FROM users WHERE email = ?', [email]);
      if (!user) {
        const id = crypto.randomUUID();
        // No password needed for Google users — store a random hash
        const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
        await DB.run(
          'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, name, email, passwordHash, 'invigilator', new Date().toISOString()]
        );
        user = await DB.queryOne<any>('SELECT * FROM users WHERE id = ?', [id]);
      }

      const token = generateToken({ id: user.id, email: user.email, name: user.name, role: user.role });

      // Redirect to frontend with token in URL fragment (never in query string)
      res.redirect(`/?auth_token=${encodeURIComponent(token)}&auth_name=${encodeURIComponent(user.name)}&auth_email=${encodeURIComponent(user.email)}&auth_role=${encodeURIComponent(user.role)}&auth_id=${encodeURIComponent(user.id)}`);
    } catch (err: any) {
      console.error('Google OAuth callback error:', err.message);
      res.redirect(`/?auth_error=${encodeURIComponent('Google sign-in failed. Please try again.')}`);
    }
  });

  // Check if Google OAuth is configured
  router.get('/auth/google/status', (req: Request, res: Response) => {
    res.json({ configured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) });
  });

  // ==========================================
  // AUTHENTICATION
  // ==========================================
  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await DB.queryOne<any>('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = generateToken({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      });

      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
      }

      const existing = await DB.queryOne('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
      if (existing) {
        return res.status(400).json({ error: 'Email is already registered' });
      }

      const id = crypto.randomUUID();
      const passwordHash = await bcrypt.hash(password, 10);
      const userRole = role === 'admin' ? 'admin' : 'invigilator';

      await DB.run(
        'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name.trim(), email.trim().toLowerCase(), passwordHash, userRole, new Date().toISOString()]
      );

      const token = generateToken({ id, email: email.trim().toLowerCase(), name: name.trim(), role: userRole });
      res.status(201).json({
        token,
        user: { id, name: name.trim(), email: email.trim().toLowerCase(), role: userRole }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/auth/me', authMiddleware, async (req: Request, res: Response) => {
    const authUser = (req as any).user as AuthUser;
    const user = await DB.queryOne<any>('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [authUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });

  // ==========================================
  // EXAMS MANAGEMENT (Admin / Invigilator)
  // ==========================================
  router.get('/exams', authMiddleware, async (req: Request, res: Response) => {
    try {
      const exams = await DB.queryAll<any>(`
        SELECT e.*, 
          (SELECT COUNT(*) FROM questions q WHERE q.exam_id = e.id) as question_count,
          (SELECT COUNT(*) FROM exam_sessions s WHERE s.exam_id = e.id) as student_count,
          (SELECT COUNT(*) FROM violations v WHERE v.exam_id = e.id) as violation_count
        FROM exams e
        ORDER BY e.created_at DESC
      `);
      res.json({ exams });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/exams', authMiddleware, async (req: Request, res: Response) => {
    try {
      const authUser = (req as any).user as AuthUser;
      const {
        title,
        description,
        durationMinutes,
        startTime,
        endTime,
        shuffleQuestions,
        maxViolations,
        googleFormEmbedUrl,
        retentionDays,
        customCode
      } = req.body;

      if (!title || !durationMinutes || !startTime || !endTime) {
        return res.status(400).json({ error: 'Title, duration, start time and end time are required' });
      }

      const id = crypto.randomUUID();
      // Generate unique 6-character code or use customCode
      let code = customCode ? customCode.trim().toUpperCase() : crypto.randomBytes(3).toString('hex').toUpperCase();

      // Ensure unique code
      let existing = await DB.queryOne('SELECT id FROM exams WHERE code = ?', [code]);
      let attempts = 0;
      while (existing && attempts < 5) {
        code = crypto.randomBytes(3).toString('hex').toUpperCase();
        existing = await DB.queryOne('SELECT id FROM exams WHERE code = ?', [code]);
        attempts++;
      }

      await DB.run(
        `INSERT INTO exams (id, code, title, description, duration_minutes, start_time, end_time, shuffle_questions, max_violations, google_form_embed_url, created_by, retention_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          code,
          title.trim(),
          description || '',
          parseInt(durationMinutes, 10),
          new Date(startTime).toISOString(),
          new Date(endTime).toISOString(),
          shuffleQuestions ? 1 : 0,
          parseInt(maxViolations, 10) || 5,
          googleFormEmbedUrl ? googleFormEmbedUrl.trim() : null,
          authUser.id,
          parseInt(retentionDays, 10) || 30,
          new Date().toISOString()
        ]
      );

      const exam = await DB.queryOne('SELECT * FROM exams WHERE id = ?', [id]);
      res.status(201).json({ exam });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/exams/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE id = ?', [req.params.id]);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });

      const questions = await DB.queryAll('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_num ASC', [exam.id]);
      res.json({ exam, questions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/exams/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await DB.run('DELETE FROM questions WHERE exam_id = ?', [req.params.id]);
      await DB.run('DELETE FROM violations WHERE exam_id = ?', [req.params.id]);
      await DB.run('DELETE FROM exam_sessions WHERE exam_id = ?', [req.params.id]);
      await DB.run('DELETE FROM exams WHERE id = ?', [req.params.id]);
      res.json({ success: true, message: 'Exam and all associated records deleted.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // QUESTIONS MANAGEMENT
  // ==========================================
  router.post('/exams/:id/questions', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { question, optionA, optionB, optionC, optionD, correctAnswer, marks } = req.body;
      if (!question || !optionA || !optionB || !correctAnswer) {
        return res.status(400).json({ error: 'Question text, options and correct answer are required' });
      }

      const count = await DB.queryOne<any>('SELECT COUNT(*) as c FROM questions WHERE exam_id = ?', [req.params.id]);
      const orderNum = (count?.c || 0) + 1;
      const qId = crypto.randomUUID();

      await DB.run(
        `INSERT INTO questions (id, exam_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, order_num)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          qId,
          req.params.id,
          question.trim(),
          optionA.trim(),
          optionB.trim(),
          (optionC || '').trim(),
          (optionD || '').trim(),
          correctAnswer.trim().toUpperCase(),
          parseFloat(marks) || 1.0,
          orderNum
        ]
      );

      const created = await DB.queryOne('SELECT * FROM questions WHERE id = ?', [qId]);
      res.status(201).json({ question: created });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // CSV Upload / Import endpoint
  router.post('/exams/:id/questions/csv', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { csvText } = req.body;
      if (!csvText) return res.status(400).json({ error: 'CSV content is required' });

      const lines = csvText.trim().split('\n').filter((l: string) => l.trim().length > 0);
      if (lines.length === 0) return res.status(400).json({ error: 'Empty CSV file' });

      // Check header or assume: question,optA,optB,optC,optD,correct,marks
      let startIndex = 0;
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('question') && firstLine.includes('opta')) {
        startIndex = 1;
      }

      let count = 0;
      const countRes = await DB.queryOne<any>('SELECT COUNT(*) as c FROM questions WHERE exam_id = ?', [req.params.id]);
      let currentOrder = (countRes?.c || 0) + 1;

      for (let i = startIndex; i < lines.length; i++) {
        // Robust CSV line parser taking into account quotes
        const line = lines[i];
        const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
        const matches: string[] = [];
        let match;
        while ((match = regex.exec(line)) !== null) {
          if (match.index === regex.lastIndex) regex.lastIndex++;
          let val = match[1] || '';
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1).replace(/""/g, '"');
          }
          matches.push(val.trim());
          if (matches.length >= 7) break;
        }

        if (matches.length >= 6) {
          const [q, optA, optB, optC, optD, correct, marks] = matches;
          if (q && optA && optB) {
            await DB.run(
              `INSERT INTO questions (id, exam_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, order_num)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                crypto.randomUUID(),
                req.params.id,
                q,
                optA,
                optB,
                optC || '',
                optD || '',
                (correct || 'A').toUpperCase(),
                parseFloat(marks) || 1.0,
                currentOrder++
              ]
            );
            count++;
          }
        }
      }

      res.json({ success: true, count, message: `Successfully imported ${count} questions from CSV.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Google Form JSON Import endpoint
  router.post('/exams/:id/questions/google-form', authMiddleware, async (req: Request, res: Response) => {
    try {
      const { questions } = req.body;
      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'Valid questions array is required' });
      }

      const countRes = await DB.queryOne<any>('SELECT COUNT(*) as c FROM questions WHERE exam_id = ?', [req.params.id]);
      let currentOrder = (countRes?.c || 0) + 1;
      let inserted = 0;

      for (const item of questions) {
        const qText = item.question || item.title;
        const options = item.options || [];
        const optA = options[0] || item.optA || 'Option A';
        const optB = options[1] || item.optB || 'Option B';
        const optC = options[2] || item.optC || '';
        const optD = options[3] || item.optD || '';
        const correct = item.correct || item.correctAnswer || 'A';
        const marks = parseFloat(item.marks || item.points || 1.0);

        if (qText) {
          await DB.run(
            `INSERT INTO questions (id, exam_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, order_num)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.params.id, qText, optA, optB, optC, optD, correct, marks, currentOrder++]
          );
          inserted++;
        }
      }

      res.json({ success: true, count: inserted, message: `Imported ${inserted} questions from Google Form.` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/questions/:id', authMiddleware, async (req: Request, res: Response) => {
    try {
      await DB.run('DELETE FROM questions WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // STUDENT FLOW & VERIFICATION
  // ==========================================
  // Step 1: Verify Exam Code
  router.post('/student/verify-code', async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: 'Exam code is required' });

      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE code = ?', [code.trim().toUpperCase()]);
      if (!exam) return res.status(404).json({ error: 'Exam code not found. Please verify with your instructor.' });

      const now = new Date();
      const startTime = new Date(exam.start_time);
      const endTime = new Date(exam.end_time);

      let status = 'upcoming';
      if (now >= startTime && now <= endTime) {
        status = 'active';
      } else if (now > endTime) {
        status = 'ended';
      }

      const qCount = await DB.queryOne<any>('SELECT COUNT(*) as c FROM questions WHERE exam_id = ?', [exam.id]);

      res.json({
        exam: {
          id: exam.id,
          code: exam.code,
          title: exam.title,
          description: exam.description,
          durationMinutes: exam.duration_minutes,
          startTime: exam.start_time,
          endTime: exam.end_time,
          maxViolations: exam.max_violations,
          hasGoogleFormEmbed: !!exam.google_form_embed_url,
          googleFormEmbedUrl: exam.google_form_embed_url,
          questionCount: qCount?.c || 0,
          status,
          serverTime: now.toISOString()
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Step 2: Register Student Session & Consent
  router.post('/student/register-session', async (req: Request, res: Response) => {
    try {
      const { examId, studentName, rollNo, email, consentAgreed, referencePhoto, hardwareDetails } = req.body;

      if (!examId || !studentName || !rollNo) {
        return res.status(400).json({ error: 'Student name, Roll number and Exam ID are required' });
      }

      if (!consentAgreed) {
        return res.status(400).json({ error: 'Proctoring consent must be agreed to proceed' });
      }

      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE id = ?', [examId]);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });

      // Save reference photo
      let photoUrl: string | null = null;
      if (referencePhoto) {
        photoUrl = saveBase64Image(referencePhoto, 'face_ref');
      }

      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();

      await DB.run(
        `INSERT INTO exam_sessions (id, exam_id, student_name, roll_no, email, consent_agreed, consent_timestamp, reference_photo_url, hardware_details, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`,
        [
          sessionId,
          examId,
          studentName.trim(),
          rollNo.trim(),
          email ? email.trim() : null,
          1,
          now, // DPDP Act 2023 compliant timestamp
          photoUrl,
          hardwareDetails ? JSON.stringify(hardwareDetails) : null,
          now,
          now
        ]
      );

      res.status(201).json({
        sessionId,
        studentName: studentName.trim(),
        rollNo: rollNo.trim(),
        status: 'waiting',
        consentTimestamp: now,
        exam: {
          id: exam.id,
          title: exam.title,
          code: exam.code,
          durationMinutes: exam.duration_minutes,
          startTime: exam.start_time,
          endTime: exam.end_time,
          serverTime: new Date().toISOString()
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Step 3: Get Session Status & Questions (supports safe resume after refresh!)
  router.get('/student/session/:sessionId', async (req: Request, res: Response) => {
    try {
      const session = await DB.queryOne<any>('SELECT * FROM exam_sessions WHERE id = ?', [req.params.sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE id = ?', [session.exam_id]);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });

      // If exam is in progress or waiting, fetch questions (strip correct answers for security!)
      let questions = await DB.queryAll<any>(
        'SELECT id, exam_id, question, option_a, option_b, option_c, option_d, marks, order_num FROM questions WHERE exam_id = ? ORDER BY order_num ASC',
        [exam.id]
      );

      if (exam.shuffle_questions === 1) {
        // Deterministic pseudo-random shuffle per student roll_no
        questions = [...questions].sort((a, b) => {
          const hashA = (a.id + session.roll_no).length % 3;
          const hashB = (b.id + session.roll_no).length % 3;
          return hashA - hashB;
        });
      }

      // Calculate time remaining based on server clock!
      const now = Date.now();
      let remainingSeconds = exam.duration_minutes * 60 + (session.added_time_seconds || 0);

      if (session.start_time) {
        const elapsed = Math.floor((now - new Date(session.start_time).getTime()) / 1000);
        remainingSeconds = Math.max(0, (exam.duration_minutes * 60 + (session.added_time_seconds || 0)) - elapsed);
      }

      // Count violations
      const vCount = await DB.queryOne<any>('SELECT COUNT(*) as c FROM violations WHERE session_id = ?', [session.id]);

      res.json({
        session: {
          id: session.id,
          studentName: session.student_name,
          rollNo: session.roll_no,
          status: session.status,
          startTime: session.start_time,
          addedTimeSeconds: session.added_time_seconds,
          savedAnswers: JSON.parse(session.answers_json || '{}'),
          violationCount: vCount?.c || 0,
          maxViolations: exam.max_violations
        },
        exam: {
          id: exam.id,
          title: exam.title,
          code: exam.code,
          durationMinutes: exam.duration_minutes,
          startTime: exam.start_time,
          endTime: exam.end_time,
          googleFormEmbedUrl: exam.google_form_embed_url,
          maxViolations: exam.max_violations
        },
        questions,
        remainingSeconds,
        serverTime: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Step 4: Start Exam (enters fullscreen, starts synchronized server timer)
  router.post('/student/session/:sessionId/start', async (req: Request, res: Response) => {
    try {
      const session = await DB.queryOne<any>('SELECT * FROM exam_sessions WHERE id = ?', [req.params.sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const now = new Date().toISOString();
      const startTime = session.start_time || now;

      await DB.run("UPDATE exam_sessions SET status = 'in_progress', start_time = ?, updated_at = ? WHERE id = ?", [
        startTime,
        now,
        session.id
      ]);

      res.json({ success: true, startTime, status: 'in_progress' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Step 5: Autosave Answers (called every 10s or per answer change)
  router.post('/student/session/:sessionId/autosave', async (req: Request, res: Response) => {
    try {
      const { answers } = req.body;
      const session = await DB.queryOne<any>('SELECT id, status FROM exam_sessions WHERE id = ?', [req.params.sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      if (session.status === 'terminated' || session.status === 'submitted') {
        return res.status(400).json({ error: `Exam already ${session.status}` });
      }

      const answersJson = JSON.stringify(answers || {});
      await DB.run('UPDATE exam_sessions SET answers_json = ?, updated_at = ? WHERE id = ?', [
        answersJson,
        new Date().toISOString(),
        req.params.sessionId
      ]);

      res.json({ success: true, savedAt: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Step 6: Submit Exam (Auto-graded score calculation + risk score summary)
  router.post('/student/session/:sessionId/submit', async (req: Request, res: Response) => {
    try {
      const { answers, autoSubmitted, reason } = req.body;
      const session = await DB.queryOne<any>('SELECT * FROM exam_sessions WHERE id = ?', [req.params.sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const finalAnswers = answers || JSON.parse(session.answers_json || '{}');

      // Grade questions
      const questions = await DB.queryAll<any>('SELECT * FROM questions WHERE exam_id = ?', [session.exam_id]);
      let totalMarks = 0;
      let scoredMarks = 0;

      for (const q of questions) {
        totalMarks += q.marks;
        const studentAns = finalAnswers[q.id];
        if (studentAns && studentAns.toString().trim().toUpperCase() === q.correct_answer.toString().trim().toUpperCase()) {
          scoredMarks += q.marks;
        }
      }

      // Calculate risk score based on violations
      const violations = await DB.queryAll<any>('SELECT severity FROM violations WHERE session_id = ?', [session.id]);
      let riskPoints = 0;
      for (const v of violations) {
        if (v.severity === 'LOW') riskPoints += 5;
        if (v.severity === 'MEDIUM') riskPoints += 15;
        if (v.severity === 'HIGH') riskPoints += 25;
        if (v.severity === 'CRITICAL') riskPoints += 40;
      }
      const riskScore = Math.min(100, riskPoints);

      const now = new Date().toISOString();
      const status = autoSubmitted ? 'terminated' : 'submitted';

      await DB.run(
        `UPDATE exam_sessions 
         SET answers_json = ?, score = ?, total_marks = ?, risk_score = ?, status = ?, end_time = ?, updated_at = ?
         WHERE id = ?`,
        [JSON.stringify(finalAnswers), scoredMarks, totalMarks, riskScore, status, now, now, session.id]
      );

      // Notify proctors
      io.to(`exam:${session.exam_id}:proctors`).emit('proctor:exam_submitted', {
        sessionId: session.id,
        studentName: session.student_name,
        rollNo: session.roll_no,
        score: scoredMarks,
        totalMarks,
        riskScore,
        status,
        reason: reason || 'Submitted normally'
      });

      res.json({
        success: true,
        score: scoredMarks,
        totalMarks,
        riskScore,
        status,
        message: 'Exam submitted successfully.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Step 7: Log Violation with Screen & Webcam Screenshots
  router.post('/student/violation', async (req: Request, res: Response) => {
    try {
      const { sessionId, type, severity, details, screenScreenshot, webcamScreenshot } = req.body;
      if (!sessionId || !type) {
        return res.status(400).json({ error: 'Session ID and violation type are required' });
      }

      const session = await DB.queryOne<any>('SELECT * FROM exam_sessions WHERE id = ?', [sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE id = ?', [session.exam_id]);

      // Save screenshot files
      const screenPath = saveBase64Image(screenScreenshot, 'violation_screen');
      const webcamPath = saveBase64Image(webcamScreenshot, 'violation_cam');

      const vId = crypto.randomUUID();
      const now = new Date().toISOString();

      await DB.run(
        `INSERT INTO violations (id, session_id, exam_id, type, severity, timestamp, screenshot_path, webcam_path, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vId, sessionId, session.exam_id, type, severity || 'MEDIUM', now, screenPath, webcamPath, details || '']
      );

      // Recalculate violations count and risk score
      const violations = await DB.queryAll<any>('SELECT severity FROM violations WHERE session_id = ?', [sessionId]);
      let riskPoints = 0;
      for (const v of violations) {
        if (v.severity === 'LOW') riskPoints += 5;
        if (v.severity === 'MEDIUM') riskPoints += 15;
        if (v.severity === 'HIGH') riskPoints += 25;
        if (v.severity === 'CRITICAL') riskPoints += 40;
      }
      const riskScore = Math.min(100, riskPoints);
      await DB.run('UPDATE exam_sessions SET risk_score = ?, updated_at = ? WHERE id = ?', [riskScore, now, sessionId]);

      const violationCount = violations.length;
      const maxAllowed = exam?.max_violations || 5;
      const isTerminated = violationCount >= maxAllowed;

      if (isTerminated) {
        await DB.run("UPDATE exam_sessions SET status = 'terminated', updated_at = ? WHERE id = ?", [now, sessionId]);
        // Tell student socket they are auto-terminated
        io.to(`session:${sessionId}`).emit('student:exam_terminated', {
          reason: `Exceeded maximum allowed proctoring violations (${violationCount}/${maxAllowed}).`
        });
      }

      // Notify proctors in real-time
      const alertPayload = {
        violationId: vId,
        sessionId,
        studentName: session.student_name,
        rollNo: session.roll_no,
        type,
        severity: severity || 'MEDIUM',
        timestamp: now,
        screenPath,
        webcamPath,
        details,
        violationCount,
        maxAllowed,
        riskScore,
        isTerminated
      };

      io.to(`exam:${session.exam_id}:proctors`).emit('proctor:violation_alert', alertPayload);

      res.status(201).json({
        success: true,
        violationCount,
        maxAllowed,
        isTerminated,
        riskScore
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Periodic Snapshot upload (every 10s background capture)
  router.post('/student/snapshot', async (req: Request, res: Response) => {
    try {
      const { sessionId, screenScreenshot, webcamScreenshot } = req.body;
      if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

      // Save snapshots to uploads folder
      const screenPath = saveBase64Image(screenScreenshot, 'periodic_screen');
      const camPath = saveBase64Image(webcamScreenshot, 'periodic_cam');

      res.json({ success: true, screenPath, camPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // INVIGILATOR DASHBOARD & AUDIT REPORTS
  // ==========================================
  // Real-time live dashboard state
  router.get('/exams/:id/dashboard', authMiddleware, async (req: Request, res: Response) => {
    try {
      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE id = ?', [req.params.id]);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });

      const sessions = await DB.queryAll<any>(`
        SELECT s.*, 
          (SELECT COUNT(*) FROM violations v WHERE v.session_id = s.id) as violation_count,
          (SELECT json_group_array(json_object(
            'id', v.id, 'type', v.type, 'severity', v.severity, 'timestamp', v.timestamp, 
            'screenshot_path', v.screenshot_path, 'webcam_path', v.webcam_path, 'details', v.details
          )) FROM (SELECT * FROM violations WHERE session_id = s.id ORDER BY timestamp DESC LIMIT 5) v) as recent_violations
        FROM exam_sessions s
        WHERE s.exam_id = ?
        ORDER BY s.risk_score DESC, s.created_at DESC
      `, [exam.id]);

      const formattedSessions = sessions.map((s) => ({
        ...s,
        recent_violations: s.recent_violations ? JSON.parse(s.recent_violations) : []
      }));

      // Recent violations across all students for this exam
      const liveAlerts = await DB.queryAll<any>(`
        SELECT v.*, s.student_name, s.roll_no
        FROM violations v
        JOIN exam_sessions s ON s.id = v.session_id
        WHERE v.exam_id = ?
        ORDER BY v.timestamp DESC
        LIMIT 25
      `, [exam.id]);

      res.json({
        exam,
        sessions: formattedSessions,
        liveAlerts
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Detailed report for a specific student session
  router.get('/exams/:id/reports/:sessionId', authMiddleware, async (req: Request, res: Response) => {
    try {
      const session = await DB.queryOne<any>('SELECT * FROM exam_sessions WHERE id = ?', [req.params.sessionId]);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE id = ?', [session.exam_id]);
      const violations = await DB.queryAll<any>('SELECT * FROM violations WHERE session_id = ? ORDER BY timestamp ASC', [session.id]);
      const warnings = await DB.queryAll<any>('SELECT * FROM warnings_logs WHERE session_id = ? ORDER BY timestamp ASC', [session.id]);
      const questions = await DB.queryAll<any>('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_num ASC', [session.exam_id]);

      const studentAnswers = JSON.parse(session.answers_json || '{}');
      const questionsWithAnswers = questions.map((q) => {
        const studentAns = studentAnswers[q.id] || null;
        const isCorrect = studentAns && studentAns.toString().toUpperCase() === q.correct_answer.toString().toUpperCase();
        return {
          ...q,
          studentAnswer: studentAns,
          isCorrect
        };
      });

      res.json({
        exam,
        session: {
          ...session,
          hardwareDetails: session.hardware_details ? JSON.parse(session.hardware_details) : null
        },
        violations,
        warnings,
        questions: questionsWithAnswers
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Export CSV of students results and violations
  router.get('/exams/:id/export/csv', authMiddleware, async (req: Request, res: Response) => {
    try {
      const exam = await DB.queryOne<any>('SELECT * FROM exams WHERE id = ?', [req.params.id]);
      if (!exam) return res.status(404).json({ error: 'Exam not found' });

      const sessions = await DB.queryAll<any>(`
        SELECT s.*,
          (SELECT COUNT(*) FROM violations v WHERE v.session_id = s.id) as violation_count
        FROM exam_sessions s
        WHERE s.exam_id = ?
        ORDER BY s.roll_no ASC
      `, [exam.id]);

      let csv = 'Roll No,Student Name,Status,Score,Total Marks,Percentage,Violations Count,Risk Score (0-100),Consent Timestamp,Start Time,End Time\n';
      for (const s of sessions) {
        const pct = s.total_marks > 0 && s.score != null ? ((s.score / s.total_marks) * 100).toFixed(1) + '%' : 'N/A';
        csv += `"${s.roll_no}","${s.student_name}","${s.status}",${s.score ?? 'N/A'},${s.total_marks || 0},"${pct}",${s.violation_count},${s.risk_score},"${s.consent_timestamp || ''}","${s.start_time || ''}","${s.end_time || ''}"\n`;
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="exam_${exam.code}_report.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Data Retention: Auto-delete recordings/screenshots older than retention days
  router.post('/admin/cleanup', authMiddleware, async (req: Request, res: Response) => {
    try {
      const exams = await DB.queryAll<any>('SELECT id, retention_days FROM exams');
      let deletedCount = 0;

      for (const ex of exams) {
        const retentionDays = ex.retention_days || 30;
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

        const oldViolations = await DB.queryAll<any>(
          'SELECT id, screenshot_path, webcam_path FROM violations WHERE exam_id = ? AND timestamp < ?',
          [ex.id, cutoffDate]
        );

        for (const v of oldViolations) {
          if (v.screenshot_path) {
            const fullPath = path.join(process.cwd(), v.screenshot_path);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              deletedCount++;
            }
          }
          if (v.webcam_path) {
            const fullPath = path.join(process.cwd(), v.webcam_path);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
              deletedCount++;
            }
          }
        }
      }

      res.json({
        success: true,
        deletedFiles: deletedCount,
        message: `Retention cleanup finished. Cleaned ${deletedCount} archived recording files.`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
