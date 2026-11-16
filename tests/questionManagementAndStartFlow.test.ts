/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Question Management, Question Types Scoring Matrix & Student Start Flow Verification
 */

import http from 'http';
import { createApp } from '../server/src/app.js';
import { connectDB, isDBConnected } from '../server/src/config/db.js';
import { attemptService } from '../server/src/services/attemptService.js';
import { examService } from '../server/src/services/examService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log(`\n==================================================================`);
  console.log(`📋 Question Management, Scoring & Student Start Flow Verification`);
  console.log(`==================================================================\n`);

  await connectDB();

  const app = createApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  try {
    // ── 1. Create Exam with all 3 Question Types (MCQ, Multiple Select, Short Answer) ──
    const examCode = `TYP${Math.floor(1000 + Math.random() * 9000)}`;
    const createRes = await fetch(`${baseUrl}/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_teacher_token_prof_types'
      },
      body: JSON.stringify({
        title: 'Comprehensive Question Types Assessment',
        examCode,
        duration: 30,
        questions: [
          {
            id: 'q_mcq_1',
            type: 'mcq',
            question: 'What is the default port for HTTPS?',
            options: ['80', '443', '8080', '22'],
            correctAnswer: 'B',
            marks: 2
          },
          {
            id: 'q_multi_1',
            type: 'multiple_select',
            question: 'Which of the following are valid HTTP methods? (Select all that apply)',
            options: ['GET', 'POST', 'FETCH', 'DELETE'],
            correctAnswer: ['A', 'B', 'D'], // GET, POST, DELETE
            marks: 3
          },
          {
            id: 'q_short_1',
            type: 'short_answer',
            question: 'What does CSS stand for in web development?',
            correctAnswer: 'Cascading Style Sheets',
            marks: 5
          }
        ]
      })
    });
    const createData = await createRes.json();
    assert(createRes.status === 201, 'Teacher Creates Assessment with MCQ, Multiple-Select & Short-Answer');
    const examId = createData.exam._id || createData.exam.id;

    // ── 2. Student Joins Exam ──
    const joinRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode,
        studentName: 'Jordan Lee',
        rollNo: `ROLL-TYP-${Math.floor(1000 + Math.random() * 9000)}`,
        studentEmail: 'jordan@university.edu'
      })
    });
    const joinData = await joinRes.json();
    assert(joinRes.status === 200, 'Student Joins Assessment Session');
    const attemptId = joinData.attemptId;
    const studentToken = joinData.sessionToken;

    // ── 3. Start Exam & Verify Timer Initialization ──
    const startRes = await fetch(`${baseUrl}/attempts/${attemptId}/start`, {
      method: 'POST',
      headers: { 'x-student-session': studentToken }
    });
    const startData = await startRes.json();
    assert(startRes.status === 200 && startData.status === 'in_progress', 'Candidate Starts Exam (POST /api/attempts/:id/start)');

    // ── 4. Verify Idempotent Start: Re-starting in-progress attempt succeeds immediately ──
    const reStartRes = await fetch(`${baseUrl}/attempts/${attemptId}/start`, {
      method: 'POST',
      headers: { 'x-student-session': studentToken }
    });
    const reStartData = await reStartRes.json();
    assert(reStartRes.status === 200 && reStartData.status === 'in_progress', 'Re-starting in-progress exam is idempotent and returns 200');

    // ── 5. Student Answers All 3 Types Accurately ──
    // Multiple select provided as array ['A', 'B', 'D'] or comma-separated string
    const saveRes = await fetch(`${baseUrl}/attempts/${attemptId}/answers`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': studentToken
      },
      body: JSON.stringify({
        answers: {
          q_mcq_1: 'B', // Correct MCQ (+2)
          q_multi_1: ['B', 'D', 'A'], // Correct Multiple Select in different order (+3)
          q_short_1: 'cascading style sheets' // Correct Short Answer in lowercase (+5)
        }
      })
    });
    const saveData = await saveRes.json();
    assert(saveRes.status === 200 && saveData.answeredCount === 3, 'Answers for all 3 types saved cleanly (3/3 answered)');

    // ── 6. Submit and Verify Scoring Engine Matrix ──
    const submitRes = await fetch(`${baseUrl}/attempts/${attemptId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': studentToken
      },
      body: JSON.stringify({ answers: {} })
    });
    const submitData = await submitRes.json();
    assert(submitRes.status === 200, 'Submission Evaluated Successfully');
    assert(
      submitData.score === 10,
      `Full Scoring Evaluation: 10/10 pts (MCQ: 2, Multi-Select: 3, Short-Answer: 5). Received: ${submitData.score}`
    );

    // ── 7. Published Exam Protection: Prevent question mutation when submissions exist ──
    const mutateQuestionsRes = await fetch(`${baseUrl}/exams/${examId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_teacher_token_prof_types'
      },
      body: JSON.stringify({
        questions: [
          { id: 'q_hacked', type: 'mcq', question: 'Mutated Question', marks: 10 }
        ]
      })
    });
    assert(
      mutateQuestionsRes.status === 400,
      'Published Assessment Protection: Question structure mutation blocked when candidate attempts exist (400 Bad Request)'
    );

    // ── 8. Safe Exam Metadata Update: Allowed even when attempts exist ──
    const updateTitleRes = await fetch(`${baseUrl}/exams/${examId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_teacher_token_prof_types'
      },
      body: JSON.stringify({
        title: 'Comprehensive Question Types Assessment (Final Version)',
        duration: 45
      })
    });
    const updateTitleData = await updateTitleRes.json();
    assert(
      updateTitleRes.status === 200 && updateTitleData.exam.title.includes('Final Version'),
      'Teacher can safely update assessment title and duration without altering question structure'
    );

    // ── 9. Future Scheduled Exam Start Flow & Server-Authoritative Eligibility ──
    const schedExamCode = `SCH${Math.floor(1000 + Math.random() * 9000)}`;
    const futureStartTime = new Date(Date.now() + 2 * 3600000).toISOString(); // 2 hours from now
    const futureEndTime = new Date(Date.now() + 24 * 3600000).toISOString();
    const createSchedRes = await fetch(`${baseUrl}/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_teacher_token_prof_types'
      },
      body: JSON.stringify({
        title: 'Future Scheduled Assessment (Strict Eligibility)',
        examCode: schedExamCode,
        duration: 45,
        startTime: futureStartTime,
        endTime: futureEndTime,
        status: 'published',
        settings: {
          allowEarlyStart: false
        },
        questions: [
          {
            id: 'q_sched_1',
            type: 'mcq',
            question: 'Is this examination starting immediately?',
            options: ['Yes', 'No'],
            correctAnswer: 'A',
            marks: 1
          }
        ]
      })
    });
    const schedExamData = await createSchedRes.json();
    assert(createSchedRes.status === 201, 'Teacher creates published assessment with future scheduled startTime and allowEarlyStart=false');
    const schedExamId = schedExamData.exam._id || schedExamData.exam.id;

    // Student joins published future scheduled exam
    const studentJoinSchedRes = await fetch(`${baseUrl}/student/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examCode: schedExamCode,
        studentName: 'Bob Waiting',
        rollNo: 'WAIT-001',
        studentEmail: 'bob.waiting@example.com'
      })
    });
    assert(studentJoinSchedRes.status === 200, 'Candidate joins published exam with future scheduled startTime');
    const studentSchedData = await studentJoinSchedRes.json();
    const schedAttemptId = studentSchedData.attemptId;
    const schedSessionToken = studentSchedData.sessionToken;

    // Candidate checks eligibility: canStart must be false with SCHEDULED_START_PENDING
    const eligibilityRes = await fetch(`${baseUrl}/attempts/${schedAttemptId}/eligibility`, {
      headers: {
        'x-student-session': schedSessionToken
      }
    });
    const eligibilityData = await eligibilityRes.json();
    assert(
      eligibilityRes.status === 200 &&
      eligibilityData.canStart === false &&
      eligibilityData.code === 'SCHEDULED_START_PENDING' &&
      eligibilityData.timeLeftMs > 0,
      'Server-authoritative eligibility check returns canStart=false (SCHEDULED_START_PENDING)'
    );

    // Candidate attempts direct start before scheduled time: Must return 403 SCHEDULED_START_PENDING
    const startPrematureRes = await fetch(`${baseUrl}/attempts/${schedAttemptId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': schedSessionToken
      }
    });
    const startPrematureData = await startPrematureRes.json();
    assert(
      startPrematureRes.status === 403 &&
      startPrematureData.code === 'SCHEDULED_START_PENDING',
      'Candidate direct start blocked with 403 SCHEDULED_START_PENDING when early start is not authorized'
    );

    // Candidate records DPDP Act 2023 consent and reference photo evidence
    const evidenceRes = await fetch(`${baseUrl}/attempts/${schedAttemptId}/evidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': schedSessionToken
      },
      body: JSON.stringify({
        consentAgreed: true,
        consentVersion: '1.0-dpdp-2023',
        referencePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
      })
    });
    const evidenceData = await evidenceRes.json();
    assert(
      evidenceRes.status === 200 &&
      evidenceData.success === true &&
      evidenceData.photoUploadStatus === 'uploaded',
      'Candidate submits DPDP Act 2023 consent & reference photo evidence via backend API'
    );

    // Teacher enables allowEarlyStart for the examination
    const updateExamRes = await fetch(`${baseUrl}/exams/${schedExamId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_teacher_token_prof_types'
      },
      body: JSON.stringify({
        settings: {
          allowEarlyStart: true
        }
      })
    });
    assert(updateExamRes.status === 200, 'Teacher authorizes early start on examination (allowEarlyStart=true)');

    // Candidate re-checks eligibility: canStart must now be true!
    const eligibilityAfterRes = await fetch(`${baseUrl}/attempts/${schedAttemptId}/eligibility`, {
      headers: {
        'x-student-session': schedSessionToken
      }
    });
    const eligibilityAfterData = await eligibilityAfterRes.json();
    assert(
      eligibilityAfterRes.status === 200 &&
      eligibilityAfterData.canStart === true &&
      eligibilityAfterData.allowEarlyStart === true,
      'Eligibility re-check returns canStart=true after teacher authorizes early start'
    );

    // Candidate now starts proctored examination successfully
    const startAuthorizedRes = await fetch(`${baseUrl}/attempts/${schedAttemptId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': schedSessionToken
      }
    });
    const startAuthorizedData = await startAuthorizedRes.json();
    assert(
      startAuthorizedRes.status === 200 && startAuthorizedData.status === 'in_progress',
      'Candidate starts proctored exam successfully after teacher authorized early start'
    );

    // Verify candidate starting with sessionId also resolves to attempt
    const startBySessionIdRes = await fetch(`${baseUrl}/attempts/${studentSchedData.sessionId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-student-session': schedSessionToken
      }
    });
    assert(
      startBySessionIdRes.status === 200,
      'Candidate starting via sessionId parameter resolves attempt and returns status'
    );

  } catch (err: any) {
    console.error('Unexpected error in question management verification:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log(`\n==================================================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`==================================================================\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
