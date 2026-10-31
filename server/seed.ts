import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { DB } from './db.js';

export async function seedInitialData() {
  // Check if admin user exists
  const existingAdmin = await DB.queryOne('SELECT * FROM users WHERE email = ?', ['admin@proctor.edu']);
  if (!existingAdmin) {
    const adminId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('Admin@12345', 10);
    await DB.run(
      'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [adminId, 'Chief Proctor Admin', 'admin@proctor.edu', passwordHash, 'admin', new Date().toISOString()]
    );
    console.log('✅ Seeded default admin: admin@proctor.edu / Admin@12345');
  }

  // Check if sample exam exists
  const existingExam = await DB.queryOne('SELECT * FROM exams WHERE code = ?', ['DEMO101']);
  if (!existingExam) {
    const examId = crypto.randomUUID();
    const now = new Date();
    const startTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // 10 mins ago (active)
    const endTime = new Date(now.getTime() + 120 * 60 * 1000).toISOString(); // 2 hours from now

    await DB.run(
      `INSERT INTO exams (id, code, title, description, duration_minutes, start_time, end_time, shuffle_questions, max_violations, created_by, retention_days, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        examId,
        'DEMO101',
        'CS301: Cloud Computing & Systems Security',
        'Official proctored examination covering distributed systems, network security, and fault tolerance. Webcam, microphone, and entire screen share are monitored continuously.',
        45,
        startTime,
        endTime,
        0,
        5,
        'admin',
        30,
        now.toISOString()
      ]
    );

    // Seed sample questions
    const questions = [
      {
        question: 'Which consistency model ensures that all reads return the value of the most recent write?',
        optA: 'Eventual Consistency',
        optB: 'Linearizability (Strict Consistency)',
        optC: 'Causal Consistency',
        optD: 'Monotonic Read Consistency',
        correct: 'B',
        marks: 2.0
      },
      {
        question: 'What is the primary defense against Cross-Site Request Forgery (CSRF)?',
        optA: 'Using HTTPS only',
        optB: 'Anti-CSRF synchronizer tokens and SameSite cookies',
        optC: 'Minifying JavaScript bundles',
        optD: 'Disabling CORS',
        correct: 'B',
        marks: 2.0
      },
      {
        question: 'In WebRTC, which protocol is responsible for gathering network candidates and NAT traversal?',
        optA: 'ICE (Interactive Connectivity Establishment) using STUN/TURN',
        optB: 'HTTP/2 multiplexing',
        optC: 'SSH tunnel',
        optD: 'BGP routing table',
        correct: 'A',
        marks: 2.0
      },
      {
        question: 'According to the CAP theorem, what property must a distributed system sacrifice in the presence of a network partition?',
        optA: 'Either Consistency or Availability',
        optB: 'Only Partition Tolerance',
        optC: 'Data compression',
        optD: 'Encryption at rest',
        correct: 'A',
        marks: 2.0
      },
      {
        question: 'Which HTTP header prevents clickjacking attacks by controlling whether a site can be framed?',
        optA: 'Access-Control-Allow-Origin',
        optB: 'X-Frame-Options / Content-Security-Policy frame-ancestors',
        optC: 'Strict-Transport-Security',
        optD: 'Cache-Control',
        correct: 'B',
        marks: 2.0
      }
    ];

    let order = 1;
    for (const q of questions) {
      await DB.run(
        `INSERT INTO questions (id, exam_id, question, option_a, option_b, option_c, option_d, correct_answer, marks, order_num)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), examId, q.question, q.optA, q.optB, q.optC, q.optD, q.correct, q.marks, order++]
      );
    }
    console.log('✅ Seeded demo exam code: DEMO101 with 5 questions');
  }
}
