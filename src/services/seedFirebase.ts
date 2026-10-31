/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Pre-seeds DEMO101 Exam into Firestore if database is empty
 */

import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function seedDemoExamIfEmpty() {
  try {
    const snap = await getDocs(collection(db, 'exams'));
    if (!snap.empty) return;

    const examId = 'exam_demo101';
    const now = new Date();
    const startTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const endTime = new Date(now.getTime() + 180 * 60 * 1000).toISOString();

    const questions = [
      {
        id: 'q1',
        question: 'Which consistency model guarantees that every read receives the most recent write?',
        optionA: 'Eventual Consistency',
        optionB: 'Strict Linearizability',
        optionC: 'Causal Ordering',
        optionD: 'Monotonic Reads',
        correctAnswer: 'B',
        marks: 2.0
      },
      {
        id: 'q2',
        question: 'Which WebRTC component is responsible for STUN/TURN traversal and candidate discovery?',
        optionA: 'ICE (Interactive Connectivity Establishment)',
        optionB: 'SCTP DataChannel',
        optionC: 'DTLS Handshake',
        optionD: 'SRTP Payload Encryption',
        correctAnswer: 'A',
        marks: 2.0
      },
      {
        id: 'q3',
        question: 'What is the primary architectural defense against CSRF attacks in single page apps?',
        optionA: 'Strict-Transport-Security header',
        optionB: 'Anti-CSRF token verification and SameSite cookie policies',
        optionC: 'Disabling JavaScript in browser',
        optionD: 'Using HTTP GET for updates',
        correctAnswer: 'B',
        marks: 2.0
      },
      {
        id: 'q4',
        question: 'In Firestore Security Rules, where must relational access control validation occur?',
        optionA: 'Client-side query where clauses only',
        optionB: 'Server-side rules using request.auth and resource.data',
        optionC: 'HTTP proxy rewrite rules',
        optionD: 'Browser LocalStorage flags',
        correctAnswer: 'B',
        marks: 2.0
      },
      {
        id: 'q5',
        question: 'According to CAP theorem, what trade-off must distributed partitions tolerate?',
        optionA: 'High availability vs strict consistency',
        optionB: 'Storage compression vs speed',
        optionC: 'Token size vs latency',
        optionD: 'Memory vs CPU usage',
        correctAnswer: 'A',
        marks: 2.0
      }
    ];

    await setDoc(doc(db, 'exams', examId), {
      id: examId,
      code: 'DEMO101',
      title: 'CS301: Cloud Systems & Computer Security',
      description: 'Official online proctored examination covering distributed architectures, cryptographic security, and WebRTC protocols.',
      durationMinutes: 45,
      startTime,
      endTime,
      createdBy: 'admin@proctor.edu',
      questions,
      createdAt: now.toISOString(),
      retentionDays: 30
    });

    console.log('✅ Pre-seeded DEMO101 exam into Cloud Firestore');
  } catch (err) {
    console.warn('Seed exam notice:', err);
  }
}
