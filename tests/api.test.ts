import http from 'http';
import { createApp } from '../server/src/app.js';
import { setupSocketServer } from '../server/src/sockets/socketManager.js';
import { Exam } from '../server/src/models/Exam.js';
import { Attempt } from '../server/src/models/Attempt.js';
import { User } from '../server/src/models/User.js';
import { connectDB } from '../server/src/config/db.js';

async function runTestSuite() {
  console.log('🧪 Starting exam.co Automated Integration Tests...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
      failed++;
    }
  }

  // Connect DB
  try {
    await connectDB();
  } catch (err: any) {
    console.warn('DB connect note in test runner:', err.message);
  }

  const app = createApp();
  const server = http.createServer(app);
  setupSocketServer(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'Health Check Endpoint (/api/health)');

    // 2. Unauthorized access protection
    const unauthRes = await fetch(`${baseUrl}/exams`);
    assert(unauthRes.status === 401, 'Unauthorized Teacher Route Rejection (No token)');

    // 3. Create Exam via Teacher API
    const testExamCode = `TEST${Math.floor(1000 + Math.random() * 9000)}`;
    const createExamRes = await fetch(`${baseUrl}/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_teacher_token_test_prof_1'
      },
      body: JSON.stringify({
        title: 'Computer Science Midterm Exam',
        examCode: testExamCode,
        duration: 45,
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() + 24 * 3600000).toISOString(),
        status: 'active',
        settings: {
          requireFullscreen: true,
          instituteName: 'Stanford Engineering'
        },
        questions: [
          {
            id: 'q1',
            type: 'mcq',
            question: 'What is the primary role of an index in MongoDB?',
            options: ['Accelerate query performance', 'Enforce memory caps', 'Store binary files', 'Compress images'],
            correctAnswer: 'Accelerate query performance',
            marks: 2.0,
            orderNum: 1
          },
          {
            id: 'q2',
            type: 'mcq',
            question: 'Which WebSocket protocol is used by Socket.IO?',
            options: ['WSS / HTTP Upgrade', 'FTP', 'SMTP', 'POP3'],
            correctAnswer: 'WSS / HTTP Upgrade',
            marks: 3.0,
            orderNum: 2
          }
        ]
      })
    });
    const createdExamData = await createExamRes.json();
    assert(createExamRes.status === 201 && createdExamData.exam.examCode === testExamCode, 'Teacher Creates Assessment (POST /api/exams)');
    const examId = createdExamData.exam._id || createdExamData.exam.id;

    // 4. Public Student Lookup Masks Correct Answers
    const publicLookupRes = await fetch(`${baseUrl}/student/exams/${testExamCode}`);
    const publicData = await publicLookupRes.json();
    const questionsSafe = publicData.exam.questions.every((q: any) => q.correctAnswer === undefined);
    assert(publicLookupRes.status === 200 && questionsSafe, 'Student Exam Lookup Strips Correct Answers (Security Guarantee)');

    // 5. Student Joins Examination
    const joinRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: testExamCode,
        studentName: 'Alice Johnson',
        rollNo: '2026-CS-001',
        studentEmail: 'alice@cs.stanford.edu',
        institute: 'Stanford'
      })
    });
    const joinData = await joinRes.json();
    assert(joinRes.status === 200 && !!joinData.attemptId && !!joinData.sessionToken, 'Student Joins Examination Session (POST /api/student/join)');
    const attemptId = joinData.attemptId;
    const studentToken = joinData.sessionToken;

    // 6. Student Starts Examination Attempt
    const startRes = await fetch(`${baseUrl}/attempts/${attemptId}/start`, {
      method: 'POST',
      headers: {
        'x-student-session': studentToken
      }
    });
    const startData = await startRes.json();
    assert(startRes.status === 200 && startData.status === 'in_progress', 'Authoritative Timer Start (POST /api/attempts/:id/start)');

    // 7. Student Autosaves Answers
    const saveRes = await fetch(`${baseUrl}/attempts/${attemptId}/answers`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': studentToken
      },
      body: JSON.stringify({
        answers: {
          q1: 'Accelerate query performance',
          q2: 'WSS / HTTP Upgrade'
        },
        markedForReview: {
          q1: false,
          q2: true
        }
      })
    });
    const saveData = await saveRes.json();
    assert(saveRes.status === 200 && saveData.answeredCount === 2, 'Candidate Autosaves Answers (PUT /api/attempts/:id/answers)');

    // 8. Student Submits Examination & Server Calculates Authoritative Score
    const submitRes = await fetch(`${baseUrl}/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': studentToken
      },
      body: JSON.stringify({
        answers: {
          q1: 'Accelerate query performance',
          q2: 'WSS / HTTP Upgrade'
        }
      })
    });
    const submitData = await submitRes.json();
    assert(
      submitRes.status === 200 && submitData.score === 5 && submitData.status === 'submitted',
      'Authoritative Server Scoring on Submission (POST /api/attempts/:id/submit)'
    );

    // 9. Teacher Live Monitoring Snapshot
    const monitorRes = await fetch(`${baseUrl}/exams/${examId}/monitor`, {
      headers: {
        'Authorization': 'Bearer dev_teacher_token_test_prof_1'
      }
    });
    const monitorData = await monitorRes.json();
    assert(
      monitorRes.status === 200 && monitorData.candidates && monitorData.candidates.length >= 1,
      'Live Invigilator Monitoring Snapshot (GET /api/exams/:id/monitor)'
    );

    // 10. Teacher CSV Export
    const exportRes = await fetch(`${baseUrl}/exams/${examId}/export`, {
      headers: {
        'Authorization': 'Bearer dev_teacher_token_test_prof_1'
      }
    });
    const csvText = await exportRes.text();
    assert(
      exportRes.status === 200 && csvText.includes('Roll No') && csvText.includes('Alice Johnson'),
      'Teacher Examination CSV Export (GET /api/exams/:id/export)'
    );

    // 11. Student Joining Error: Invalid Examination Code Rejection
    const invalidCodeRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: 'NONEXISTENT999',
        studentName: 'Test Student',
        rollNo: '2026-CS-999'
      })
    });
    const invalidCodeData = await invalidCodeRes.json();
    assert(
      invalidCodeRes.status === 400 && invalidCodeData.error === 'Invalid examination code.',
      'Student Joining: Invalid Code Rejection with Understandable Message'
    );

    // 12. Student Joining Error: Incomplete Student Details Rejection
    const incompleteDetailsRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: testExamCode,
        studentName: '',
        rollNo: ''
      })
    });
    const incompleteDetailsData = await incompleteDetailsRes.json();
    assert(
      incompleteDetailsRes.status === 400 && incompleteDetailsData.error === 'Student details are incomplete.',
      'Student Joining: Incomplete Details Rejection with Understandable Message'
    );

    // 13. Student Joining Error: Duplicate Roll Number with Conflicting Identity
    const duplicateRollRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: testExamCode,
        studentName: 'Imposter Student',
        rollNo: '2026-CS-001', // Already registered to Alice Johnson
        studentEmail: 'imposter@cs.stanford.edu'
      })
    });
    const duplicateRollData = await duplicateRollRes.json();
    assert(
      duplicateRollRes.status === 400 && duplicateRollData.error.includes('already registered'),
      'Student Joining: Duplicate Roll Number with Conflicting Details Rejected'
    );

    // 14. Student Joining: Returning Candidate Resumes Existing Attempt
    const bobJoinRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: testExamCode,
        studentName: 'Bob Smith',
        rollNo: '2026-CS-002',
        studentEmail: 'bob@cs.stanford.edu'
      })
    });
    const bobJoinData = await bobJoinRes.json();
    const bobAttemptId = bobJoinData.attemptId;

    const bobResumeRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: testExamCode,
        studentName: 'Bob Smith',
        rollNo: '2026-CS-002',
        studentEmail: 'bob@cs.stanford.edu'
      })
    });
    const bobResumeData = await bobResumeRes.json();
    assert(
      bobResumeRes.status === 200 && bobResumeData.attemptId === bobAttemptId && bobResumeData.isResuming === true,
      'Student Joining: Returning Candidate Cleanly Resumes Existing Attempt'
    );

    // 15. Student Joining: Submitted Candidate Cannot Re-Enter
    const submittedJoinRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: testExamCode,
        studentName: 'Alice Johnson',
        rollNo: '2026-CS-001',
        studentEmail: 'alice@cs.stanford.edu'
      })
    });
    const submittedJoinData = await submittedJoinRes.json();
    assert(
      submittedJoinRes.status === 400 && submittedJoinData.error.includes('already submitted'),
      'Student Joining: Already Submitted Candidate Cannot Re-Enter Exam'
    );

    // 16. Student Session Authorization with Raw or Serialized Token
    const jsonHeaderRes = await fetch(`${baseUrl}/attempts/${attemptId}`, {
      headers: {
        'x-student-session': JSON.stringify({ sessionToken: studentToken, attemptId })
      }
    });
    assert(
      jsonHeaderRes.status === 200,
      'Student Session Middleware Authorizes JSON-Formatted x-student-session'
    );

    // Clean up test records
    await Exam.deleteOne({ _id: examId }).catch(() => {});
    await Attempt.deleteOne({ _id: attemptId }).catch(() => {});
    await Attempt.deleteOne({ _id: bobAttemptId }).catch(() => {});
  } finally {
    server.close();
  }

  console.log(`\n================================`);
  console.log(`Tests Completed: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
