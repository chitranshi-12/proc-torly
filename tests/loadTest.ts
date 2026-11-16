import http from 'http';
import { createApp } from '../server/src/app.js';
import { setupSocketServer } from '../server/src/sockets/socketManager.js';
import { Exam } from '../server/src/models/Exam.js';
import { Attempt } from '../server/src/models/Attempt.js';
import { connectDB } from '../server/src/config/db.js';

async function runLoadTest() {
  console.log('⚡ Starting exam.co 100 Concurrent Candidate Load Test...\n');

  try {
    await connectDB();
  } catch (err: any) {
    console.warn('DB note during load test:', err.message);
  }

  const app = createApp();
  const server = http.createServer(app);
  setupSocketServer(server);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const examCode = `LOAD${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // 1. Teacher creates assessment
    const examRes = await fetch(`${baseUrl}/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dev_teacher_token_load_tester'
      },
      body: JSON.stringify({
        title: 'High-Concurrency Examination 100 Cohort',
        examCode,
        duration: 60,
        startTime: new Date(Date.now() - 3600000).toISOString(),
        endTime: new Date(Date.now() + 24 * 3600000).toISOString(),
        status: 'active',
        questions: [
          {
            id: 'q1',
            type: 'mcq',
            question: 'What is the speed of light in vacuum?',
            options: ['3x10^8 m/s', '1.5x10^8 m/s', '300 m/s', 'Zero'],
            correctAnswer: '3x10^8 m/s',
            marks: 1.0,
            orderNum: 1
          },
          {
            id: 'q2',
            type: 'mcq',
            question: 'What is the time complexity of binary search?',
            options: ['O(log n)', 'O(n)', 'O(n^2)', 'O(1)'],
            correctAnswer: 'O(log n)',
            marks: 1.0,
            orderNum: 2
          }
        ]
      })
    });
    const examData = await examRes.json();
    const examId = examData.exam._id || examData.exam.id;
    console.log(`📋 Created assessment "${examData.exam.title}" (${examCode})`);

    const CONCURRENT_STUDENTS = 100;
    console.log(`🚀 Spawning ${CONCURRENT_STUDENTS} concurrent student sessions...`);

    const startTime = Date.now();

    // 2. 100 students join simultaneously
    const joinPromises = Array.from({ length: CONCURRENT_STUDENTS }, async (_, i) => {
      const rollNo = `CAND-${1000 + i}`;
      const name = `Student Number ${i + 1}`;
      const res = await fetch(`${baseUrl}/student/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examCode,
          studentName: name,
          rollNo,
          institute: 'Load Test Cohort'
        })
      });
      const data = await res.json();
      return { rollNo, attemptId: data.attemptId, status: res.status };
    });

    const joinResults = await Promise.all(joinPromises);
    const successfulJoins = joinResults.filter((r) => r.status === 200 && r.attemptId);
    console.log(`✅ Concurrent Joins: ${successfulJoins.length}/${CONCURRENT_STUDENTS} succeeded in ${Date.now() - startTime}ms`);

    // 3. 100 students start their attempts simultaneously
    const startStart = Date.now();
    const startPromises = successfulJoins.map(async (st) => {
      const res = await fetch(`${baseUrl}/attempts/${st.attemptId}/start`, {
        method: 'POST',
        headers: { 'x-student-session': st.attemptId }
      });
      return res.status === 200;
    });
    const startResults = await Promise.all(startPromises);
    const successfulStarts = startResults.filter(Boolean);
    console.log(`✅ Concurrent Starts: ${successfulStarts.length}/${successfulJoins.length} started in ${Date.now() - startStart}ms`);

    // 4. 100 students autosave answers simultaneously
    const saveStart = Date.now();
    const savePromises = successfulJoins.map(async (st, idx) => {
      const isCorrect = idx % 2 === 0;
      const res = await fetch(`${baseUrl}/attempts/${st.attemptId}/answers`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-student-session': st.attemptId
        },
        body: JSON.stringify({
          answers: {
            q1: '3x10^8 m/s',
            q2: isCorrect ? 'O(log n)' : 'O(n)'
          }
        })
      });
      return res.status === 200;
    });
    const saveResults = await Promise.all(savePromises);
    const successfulSaves = saveResults.filter(Boolean);
    console.log(`✅ Simultaneous Autosaves: ${successfulSaves.length}/${successfulJoins.length} saved in ${Date.now() - saveStart}ms`);

    // 5. 100 students submit simultaneously
    const submitStart = Date.now();
    const submitPromises = successfulJoins.map(async (st) => {
      const res = await fetch(`${baseUrl}/attempts/${st.attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-student-session': st.attemptId
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      return { status: res.status, score: data.score };
    });
    const submitResults = await Promise.all(submitPromises);
    const successfulSubmissions = submitResults.filter((r) => r.status === 200);
    console.log(`✅ Simultaneous Submissions: ${successfulSubmissions.length}/${successfulJoins.length} submitted in ${Date.now() - submitStart}ms`);

    const totalDuration = Date.now() - startTime;
    console.log(`\n🎉 100 Concurrent Student Load Test Completed in ${totalDuration}ms`);
    console.log(`📈 Average latency per phase: ~${Math.round(totalDuration / 4)}ms total cohort throughput`);

    // Cleanup
    await Exam.deleteOne({ _id: examId }).catch(() => {});
    await Attempt.deleteMany({ examId: String(examId) }).catch(() => {});
  } finally {
    server.close();
    process.exit(0);
  }
}

runLoadTest().catch((err) => {
  console.error('Load test error:', err);
  process.exit(1);
});
