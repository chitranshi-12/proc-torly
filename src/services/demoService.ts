/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Demo Service & Real-Time Simulation Engine
 * Works completely in-memory with BroadcastChannel / localStorage sync.
 */

import { ExamData, Question } from './firebaseExamService';

export interface DemoCandidateSession {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  email: string;
  institute: string;
  status: 'registered' | 'waiting' | 'in_progress' | 'submitted';
  consentAgreed: boolean;
  isOnline: boolean;
  isActive: boolean;
  lastHeartbeat: number;
  answers: Record<string, string>;
  score: number | null;
  totalMarks: number;
  riskScore: number;
  violationCount: number;
  startedAt: string | null;
  endedAt: string | null;
  latestViolation?: DemoViolation;
  previewScreenDataUrl?: string;
  previewCamDataUrl?: string;
}

export interface DemoViolation {
  id: string;
  sessionId: string;
  examId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  type:
    | 'TAB_SWITCH'
    | 'WINDOW_BLUR'
    | 'FULLSCREEN_EXIT'
    | 'SCREEN_SHARE_STOPPED'
    | 'MULTIPLE_FACES'
    | 'FACE_MISSING'
    | 'MOBILE_PHONE_DETECTED'
    | 'CLIPBOARD_DEVTOOLS'
    | 'NETWORK_DISCONNECT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  timestamp: string;
  screenImageUrl: string;
  camImageUrl: string;
}

// Generate realistic SVG mock evidence for screen & webcam
function generateMockScreenSVG(studentName: string, violationType: string): string {
  const isDevtools = violationType === 'CLIPBOARD_DEVTOOLS';
  const isTab = violationType === 'TAB_SWITCH' || violationType === 'WINDOW_BLUR';
  const isScreenStopped = violationType === 'SCREEN_SHARE_STOPPED';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#0f172a"/>
    <!-- Window Titlebar -->
    <rect width="640" height="30" fill="#1e293b"/>
    <circle cx="20" cy="15" r="5" fill="#ef4444"/>
    <circle cx="36" cy="15" r="5" fill="#f59e0b"/>
    <circle cx="52" cy="15" r="5" fill="#10b981"/>
    <text x="75" y="19" fill="#94a3b8" font-family="sans-serif" font-size="11">Exam Browser Integrity Screen Capture - ${studentName}</text>
    
    <!-- Main content area -->
    <rect x="20" y="50" width="380" height="280" rx="8" fill="#1e293b" stroke="#334155"/>
    <rect x="40" y="70" width="300" height="16" rx="4" fill="#38bdf8" opacity="0.3"/>
    <rect x="40" y="100" width="340" height="10" rx="3" fill="#475569"/>
    <rect x="40" y="120" width="320" height="10" rx="3" fill="#475569"/>
    <rect x="40" y="140" width="280" height="10" rx="3" fill="#475569"/>
    
    <!-- Answer choices -->
    <rect x="40" y="170" width="340" height="30" rx="6" fill="#0f172a" stroke="#334155"/>
    <rect x="40" y="210" width="340" height="30" rx="6" fill="#0f172a" stroke="#38bdf8"/>
    <rect x="40" y="250" width="340" height="30" rx="6" fill="#0f172a" stroke="#334155"/>
    
    <!-- Detection Overlay -->
    ${
      isDevtools
        ? `<rect x="415" y="50" width="205" height="280" rx="6" fill="#090d16" stroke="#f43f5e"/>
           <text x="425" y="80" fill="#f43f5e" font-family="monospace" font-size="12" font-weight="bold">DEVTOOLS / CONSOLE</text>
           <text x="425" y="105" fill="#94a3b8" font-family="monospace" font-size="9">&gt; Inspect Element</text>
           <text x="425" y="125" fill="#94a3b8" font-family="monospace" font-size="9">&gt; copy(window.answers)</text>
           <rect x="425" y="145" width="185" height="60" fill="#1e293b" rx="4"/>
           <text x="435" y="175" fill="#ef4444" font-family="monospace" font-size="10">BLOCKED KEYSTROKE</text>`
        : isTab
        ? `<rect x="415" y="50" width="205" height="160" rx="6" fill="#1e1b4b" stroke="#818cf8"/>
           <text x="425" y="75" fill="#c7d2fe" font-family="sans-serif" font-size="11" font-weight="bold">External Browser Tab</text>
           <rect x="425" y="90" width="185" height="18" rx="4" fill="#312e81"/>
           <text x="435" y="103" fill="#a5b4fc" font-family="sans-serif" font-size="9">google.com/search?q=...</text>
           <rect x="425" y="120" width="185" height="70" rx="4" fill="#0f172a"/>`
        : isScreenStopped
        ? `<rect x="0" y="30" width="640" height="330" fill="#000000" opacity="0.8"/>
           <text x="320" y="180" fill="#ef4444" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle">SCREEN SHARE INTERRUPTED</text>`
        : `<rect x="415" y="50" width="205" height="280" rx="6" fill="#1e293b" stroke="#334155"/>
           <circle cx="517" cy="140" r="40" fill="#334155"/>
           <text x="517" y="210" fill="#94a3b8" font-family="sans-serif" font-size="10" text-anchor="middle">Candidate Desktop Verified</text>`
    }
    
    <!-- Watermark timestamp -->
    <rect x="20" y="310" width="220" height="20" rx="4" fill="#000000" opacity="0.6"/>
    <text x="25" y="324" fill="#38bdf8" font-family="monospace" font-size="10">EVIDENCE: ${violationType}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function generateMockCamSVG(studentName: string, violationType: string): string {
  const isNoFace = violationType === 'FACE_MISSING';
  const isMultiFace = violationType === 'MULTIPLE_FACES';
  const isPhone = violationType === 'MOBILE_PHONE_DETECTED';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
    <rect width="320" height="240" fill="#111827"/>
    
    <!-- Room Background -->
    <rect x="20" y="20" width="280" height="200" rx="10" fill="#1f2937"/>
    
    ${
      isNoFace
        ? `<!-- Empty Chair -->
           <path d="M120 180 Q160 140 200 180 Z" fill="#374151"/>
           <rect x="140" y="170" width="40" height="50" fill="#4b5563"/>
           <rect x="70" y="70" width="180" height="60" rx="8" fill="#ef4444" opacity="0.2" stroke="#ef4444"/>
           <text x="160" y="105" fill="#f87171" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">NO CANDIDATE FACE</text>`
        : isMultiFace
        ? `<!-- 2 People -->
           <circle cx="110" cy="90" r="30" fill="#9ca3af"/>
           <path d="M70 170 C70 130 150 130 150 170 Z" fill="#4b5563"/>
           <circle cx="210" cy="95" r="28" fill="#f87171"/>
           <path d="M175 170 C175 135 245 135 245 170 Z" fill="#b91c1c"/>
           <rect x="180" y="65" width="60" height="60" rx="4" fill="none" stroke="#ef4444" stroke-width="2"/>
           <text x="160" y="35" fill="#ef4444" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">MULTIPLE FACES DETECTED</text>`
        : isPhone
        ? `<!-- Person holding phone -->
           <circle cx="150" cy="85" r="35" fill="#9ca3af"/>
           <path d="M100 180 C100 135 200 135 200 180 Z" fill="#4b5563"/>
           <!-- Phone object -->
           <rect x="200" y="110" width="30" height="55" rx="5" fill="#000000" stroke="#f59e0b" stroke-width="2"/>
           <rect x="204" y="115" width="22" height="42" fill="#38bdf8"/>
           <rect x="195" y="105" width="40" height="65" rx="4" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,3"/>
           <text x="160" y="35" fill="#f59e0b" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">PHONE DETECTED (COCO-SSD 91%)</text>`
        : `<!-- Normal Face -->
           <circle cx="160" cy="90" r="35" fill="#cbd5e1"/>
           <circle cx="150" cy="85" r="4" fill="#1e293b"/>
           <circle cx="170" cy="85" r="4" fill="#1e293b"/>
           <path d="M152 105 Q160 112 168 105" stroke="#1e293b" stroke-width="2" fill="none"/>
           <path d="M110 180 C110 140 210 140 210 180 Z" fill="#64748b"/>
           <!-- Verified Bounding Box -->
           <rect x="120" y="50" width="80" height="90" rx="6" fill="none" stroke="#10b981" stroke-width="2"/>
           <text x="160" y="35" fill="#34d399" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">1 FACE IDENTIFIED</text>`
    }
    
    <rect x="10" y="210" width="300" height="22" rx="4" fill="#000000" opacity="0.7"/>
    <text x="20" y="225" fill="#94a3b8" font-family="monospace" font-size="9">CAM: ${studentName.toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Play pleasant dual-frequency audio chime for invigilator threat alerts
export function playThreatAlertChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc1.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15); // E6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(440, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Audio might require user interaction first
  }
}

// Default Seed Exam
export const DEMO_EXAM: ExamData = {
  id: 'exam_demo_101',
  code: 'DEMO101',
  title: 'CS401: Distributed Systems & Cloud Security',
  description: 'Midterm Comprehensive Assessment. Strict camera, audio, and monitor integrity enforced.',
  instituteName: 'Stanford Polytech Institute of Computing',
  requireFullscreen: true,
  durationMinutes: 45,
  startTime: new Date(Date.now() - 30 * 60000).toISOString(),
  endTime: new Date(Date.now() + 180 * 60000).toISOString(),
  createdBy: 'Prof. David Vance',
  createdAt: new Date().toISOString(),
  questions: [
    {
      id: 'q1',
      question: 'Which consistency model ensures that every read operation receives the most recent write or an error?',
      optionA: 'Eventual Consistency',
      optionB: 'Strict Linearizability',
      optionC: 'Causal Ordering',
      optionD: 'Read-Uncommitted Isolation',
      correctAnswer: 'B',
      marks: 2.0
    },
    {
      id: 'q2',
      question: 'In the Raft consensus algorithm, which RPC is used by the leader to replicate log entries and maintain heartbeats?',
      optionA: 'RequestVote',
      optionB: 'AppendEntries',
      optionC: 'CommitQuorum',
      optionD: 'SyncState',
      correctAnswer: 'B',
      marks: 2.0
    },
    {
      id: 'q3',
      question: 'What is the primary role of STUN and TURN protocols in WebRTC peer-to-peer streaming?',
      optionA: 'Video frame transcoding and compression',
      optionB: 'NAT traversal and relaying media packets when direct P2P connection fails',
      optionC: 'AI facial landmark recognition processing',
      optionD: 'Database snapshot synchronization',
      correctAnswer: 'B',
      marks: 2.0
    },
    {
      id: 'q4',
      question: 'Which HTTP header mitigates clickjacking attacks by forbidding framing across external domains?',
      optionA: 'Content-Security-Policy: frame-ancestors',
      optionB: 'X-XSS-Protection: 1',
      optionC: 'Strict-Transport-Security: max-age=31536000',
      optionD: 'Access-Control-Allow-Origin: *',
      correctAnswer: 'A',
      marks: 2.0
    },
    {
      id: 'q5',
      question: 'Under CAP Theorem, during a transient network partition (P), a distributed system must choose between:',
      optionA: 'Latency and Throughput',
      optionB: 'Consistency (C) and Availability (A)',
      optionC: 'Atomicity and Durability',
      optionD: 'Encryption and Compression',
      correctAnswer: 'B',
      marks: 2.0
    }
  ]
};

// Seed 6 realistic students
const INITIAL_DEMO_STUDENTS: DemoCandidateSession[] = [
  {
    id: 'demo_sess_1',
    examId: 'exam_demo_101',
    studentId: 'stud_1',
    studentName: 'Alex Rivera',
    rollNo: 'CS2026-001',
    email: 'alex.rivera@stanford.edu',
    institute: 'Stanford Polytech Institute of Computing',
    status: 'in_progress',
    consentAgreed: true,
    isOnline: true,
    isActive: true,
    lastHeartbeat: Date.now(),
    answers: { q1: 'B', q2: 'B' },
    score: null,
    totalMarks: 10,
    riskScore: 24,
    violationCount: 1,
    startedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    endedAt: null,
    previewScreenDataUrl: generateMockScreenSVG('Alex Rivera', 'NORMAL'),
    previewCamDataUrl: generateMockCamSVG('Alex Rivera', 'NORMAL')
  },
  {
    id: 'demo_sess_2',
    examId: 'exam_demo_101',
    studentId: 'stud_2',
    studentName: 'Priya Sharma',
    rollNo: 'CS2026-014',
    email: 'priya.sharma@stanford.edu',
    institute: 'Stanford Polytech Institute of Computing',
    status: 'in_progress',
    consentAgreed: true,
    isOnline: true,
    isActive: true,
    lastHeartbeat: Date.now(),
    answers: { q1: 'B', q2: 'B', q3: 'B' },
    score: null,
    totalMarks: 10,
    riskScore: 0,
    violationCount: 0,
    startedAt: new Date(Date.now() - 18 * 60000).toISOString(),
    endedAt: null,
    previewScreenDataUrl: generateMockScreenSVG('Priya Sharma', 'NORMAL'),
    previewCamDataUrl: generateMockCamSVG('Priya Sharma', 'NORMAL')
  },
  {
    id: 'demo_sess_3',
    examId: 'exam_demo_101',
    studentId: 'stud_3',
    studentName: 'Marcus Chen',
    rollNo: 'CS2026-032',
    email: 'marcus.chen@stanford.edu',
    institute: 'Stanford Polytech Institute of Computing',
    status: 'in_progress',
    consentAgreed: true,
    isOnline: true,
    isActive: false,
    lastHeartbeat: Date.now() - 4000,
    answers: { q1: 'A' },
    score: null,
    totalMarks: 10,
    riskScore: 68,
    violationCount: 3,
    startedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    endedAt: null,
    previewScreenDataUrl: generateMockScreenSVG('Marcus Chen', 'CLIPBOARD_DEVTOOLS'),
    previewCamDataUrl: generateMockCamSVG('Marcus Chen', 'MOBILE_PHONE_DETECTED')
  },
  {
    id: 'demo_sess_4',
    examId: 'exam_demo_101',
    studentId: 'stud_4',
    studentName: 'Sarah Jenkins',
    rollNo: 'CS2026-045',
    email: 'sarah.j@stanford.edu',
    institute: 'Stanford Polytech Institute of Computing',
    status: 'in_progress',
    consentAgreed: true,
    isOnline: false,
    isActive: false,
    lastHeartbeat: Date.now() - 25000,
    answers: { q1: 'B' },
    score: null,
    totalMarks: 10,
    riskScore: 45,
    violationCount: 2,
    startedAt: new Date(Date.now() - 12 * 60000).toISOString(),
    endedAt: null,
    previewScreenDataUrl: generateMockScreenSVG('Sarah Jenkins', 'SCREEN_SHARE_STOPPED'),
    previewCamDataUrl: generateMockCamSVG('Sarah Jenkins', 'NORMAL')
  },
  {
    id: 'demo_sess_5',
    examId: 'exam_demo_101',
    studentId: 'stud_5',
    studentName: 'David Kim',
    rollNo: 'CS2026-067',
    email: 'david.kim@stanford.edu',
    institute: 'Stanford Polytech Institute of Computing',
    status: 'submitted',
    consentAgreed: true,
    isOnline: false,
    isActive: false,
    lastHeartbeat: Date.now() - 600000,
    answers: { q1: 'B', q2: 'B', q3: 'B', q4: 'A', q5: 'B' },
    score: 10.0,
    totalMarks: 10,
    riskScore: 12,
    violationCount: 1,
    startedAt: new Date(Date.now() - 35 * 60000).toISOString(),
    endedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    previewScreenDataUrl: generateMockScreenSVG('David Kim', 'NORMAL'),
    previewCamDataUrl: generateMockCamSVG('David Kim', 'NORMAL')
  },
  {
    id: 'demo_sess_6',
    examId: 'exam_demo_101',
    studentId: 'stud_6',
    studentName: 'Elena Rostova',
    rollNo: 'CS2026-088',
    email: 'elena.rostova@stanford.edu',
    institute: 'Stanford Polytech Institute of Computing',
    status: 'in_progress',
    consentAgreed: true,
    isOnline: true,
    isActive: true,
    lastHeartbeat: Date.now(),
    answers: { q1: 'B', q2: 'A', q3: 'B' },
    score: null,
    totalMarks: 10,
    riskScore: 82,
    violationCount: 4,
    startedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    endedAt: null,
    previewScreenDataUrl: generateMockScreenSVG('Elena Rostova', 'TAB_SWITCH'),
    previewCamDataUrl: generateMockCamSVG('Elena Rostova', 'MULTIPLE_FACES')
  }
];

const INITIAL_DEMO_VIOLATIONS: DemoViolation[] = [
  {
    id: 'v_init_1',
    sessionId: 'demo_sess_3',
    examId: 'exam_demo_101',
    studentId: 'stud_3',
    studentName: 'Marcus Chen',
    rollNo: 'CS2026-032',
    type: 'MOBILE_PHONE_DETECTED',
    severity: 'CRITICAL',
    description: 'COCO-SSD model detected mobile phone device held in candidate field of view (confidence 92%)',
    timestamp: new Date(Date.now() - 3 * 60000).toISOString(),
    screenImageUrl: generateMockScreenSVG('Marcus Chen', 'CLIPBOARD_DEVTOOLS'),
    camImageUrl: generateMockCamSVG('Marcus Chen', 'MOBILE_PHONE_DETECTED')
  },
  {
    id: 'v_init_2',
    sessionId: 'demo_sess_6',
    examId: 'exam_demo_101',
    studentId: 'stud_6',
    studentName: 'Elena Rostova',
    rollNo: 'CS2026-088',
    type: 'MULTIPLE_FACES',
    severity: 'CRITICAL',
    description: 'MediaPipe face detector identified 2 individuals in the webcam frame simultaneously',
    timestamp: new Date(Date.now() - 5 * 60000).toISOString(),
    screenImageUrl: generateMockScreenSVG('Elena Rostova', 'TAB_SWITCH'),
    camImageUrl: generateMockCamSVG('Elena Rostova', 'MULTIPLE_FACES')
  },
  {
    id: 'v_init_3',
    sessionId: 'demo_sess_6',
    examId: 'exam_demo_101',
    studentId: 'stud_6',
    studentName: 'Elena Rostova',
    rollNo: 'CS2026-088',
    type: 'TAB_SWITCH',
    severity: 'HIGH',
    description: 'Candidate switched window tab or minimized the exam window (document.visibilityState: hidden)',
    timestamp: new Date(Date.now() - 7 * 60000).toISOString(),
    screenImageUrl: generateMockScreenSVG('Elena Rostova', 'TAB_SWITCH'),
    camImageUrl: generateMockCamSVG('Elena Rostova', 'NORMAL')
  },
  {
    id: 'v_init_4',
    sessionId: 'demo_sess_4',
    examId: 'exam_demo_101',
    studentId: 'stud_4',
    studentName: 'Sarah Jenkins',
    rollNo: 'CS2026-045',
    type: 'SCREEN_SHARE_STOPPED',
    severity: 'CRITICAL',
    description: 'DisplayMedia video track ended by user action. Desktop sharing halted.',
    timestamp: new Date(Date.now() - 11 * 60000).toISOString(),
    screenImageUrl: generateMockScreenSVG('Sarah Jenkins', 'SCREEN_SHARE_STOPPED'),
    camImageUrl: generateMockCamSVG('Sarah Jenkins', 'NORMAL')
  }
];

class DemoServiceManager {
  private broadcast: BroadcastChannel | null = null;
  private exams: ExamData[] = [DEMO_EXAM];
  private students: DemoCandidateSession[] = [...INITIAL_DEMO_STUDENTS];
  private violations: DemoViolation[] = [...INITIAL_DEMO_VIOLATIONS];
  private listeners: Set<() => void> = new Set();
  private simulationInterval: any = null;

  constructor() {
    this.initStorage();
    this.initBroadcastChannel();
    this.startSimulation();
  }

  private initStorage() {
    try {
      const storedExams = localStorage.getItem('omni_demo_exams');
      if (storedExams) {
        this.exams = JSON.parse(storedExams);
      } else {
        localStorage.setItem('omni_demo_exams', JSON.stringify(this.exams));
      }

      const storedStudents = localStorage.getItem('omni_demo_students');
      if (storedStudents) {
        this.students = JSON.parse(storedStudents);
      } else {
        localStorage.setItem('omni_demo_students', JSON.stringify(this.students));
      }

      const storedViolations = localStorage.getItem('omni_demo_violations');
      if (storedViolations) {
        this.violations = JSON.parse(storedViolations);
      } else {
        localStorage.setItem('omni_demo_violations', JSON.stringify(this.violations));
      }
    } catch (e) {
      console.warn('localStorage not accessible for demo:', e);
    }
  }

  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.broadcast = new BroadcastChannel('omni_proctor_channel');
      this.broadcast.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'STUDENT_ANSWER') {
          this.handleRemoteAnswer(payload);
        } else if (type === 'STUDENT_VIOLATION') {
          this.handleRemoteViolation(payload);
        } else if (type === 'STUDENT_STATUS') {
          this.handleRemoteStatus(payload);
        } else if (type === 'STUDENT_SUBMIT') {
          this.handleRemoteSubmit(payload);
        }
      };
    }
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {}
    });
  }

  public subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public getExams(): ExamData[] {
    return this.exams;
  }

  public getExamByCode(code: string): ExamData | null {
    const clean = code.trim().toUpperCase();
    return this.exams.find((e) => e.code.toUpperCase() === clean) || null;
  }

  public getExamById(id: string): ExamData | null {
    return this.exams.find((e) => e.id === id) || null;
  }

  public createExam(data: Omit<ExamData, 'id' | 'createdAt'>): ExamData {
    const newExam: ExamData = {
      ...data,
      id: `exam_demo_${Date.now()}`,
      code: data.code.trim().toUpperCase(),
      createdAt: new Date().toISOString()
    };
    this.exams.unshift(newExam);
    try {
      localStorage.setItem('omni_demo_exams', JSON.stringify(this.exams));
    } catch (e) {}
    this.notify();
    return newExam;
  }

  public deleteExam(id: string) {
    this.exams = this.exams.filter((e) => e.id !== id);
    try {
      localStorage.setItem('omni_demo_exams', JSON.stringify(this.exams));
    } catch (e) {}
    this.notify();
  }

  public getStudents(examId?: string): DemoCandidateSession[] {
    if (!examId) return this.students;
    return this.students.filter((s) => s.examId === examId);
  }

  public getViolations(examId?: string): DemoViolation[] {
    if (!examId) return this.violations;
    return this.violations.filter((v) => v.examId === examId);
  }

  // Record a new violation (called locally or triggered by simulation)
  public addViolation(violation: Omit<DemoViolation, 'id' | 'timestamp'>) {
    const newV: DemoViolation = {
      ...violation,
      id: `v_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    };

    this.violations.unshift(newV);

    // Update student risk score and violation count
    const student = this.students.find((s) => s.id === violation.sessionId);
    if (student) {
      student.violationCount += 1;
      student.riskScore = Math.min(100, student.riskScore + (violation.severity === 'CRITICAL' ? 25 : 15));
      student.latestViolation = newV;
      if (violation.screenImageUrl) student.previewScreenDataUrl = violation.screenImageUrl;
      if (violation.camImageUrl) student.previewCamDataUrl = violation.camImageUrl;
    }

    try {
      localStorage.setItem('omni_demo_violations', JSON.stringify(this.violations.slice(0, 50)));
      localStorage.setItem('omni_demo_students', JSON.stringify(this.students));
    } catch (e) {}

    playThreatAlertChime();
    this.notify();

    // Broadcast across tabs
    if (this.broadcast) {
      this.broadcast.postMessage({ type: 'STUDENT_VIOLATION', payload: newV });
    }

    return newV;
  }

  // Student registers in Demo Mode
  public registerStudent(info: {
    name: string;
    rollNo: string;
    email: string;
    institute: string;
    examCode: string;
  }): { session: DemoCandidateSession; exam: ExamData } {
    const exam = this.getExamByCode(info.examCode);
    if (!exam) {
      throw new Error(`Exam code "${info.examCode}" was not found.`);
    }

    // Check duplicate attempt
    const existing = this.students.find(
      (s) =>
        s.examId === exam.id &&
        (s.rollNo.toLowerCase() === info.rollNo.toLowerCase() ||
          s.email.toLowerCase() === info.email.toLowerCase())
    );

    if (existing && existing.status === 'submitted') {
      throw new Error(
        `Duplicate attempt rejected: Candidate with Roll No ${info.rollNo} / Email ${info.email} has already submitted this examination.`
      );
    }

    const sessionId = existing ? existing.id : `demo_sess_${Date.now()}`;
    const session: DemoCandidateSession = existing || {
      id: sessionId,
      examId: exam.id,
      studentId: `stud_${Date.now()}`,
      studentName: info.name,
      rollNo: info.rollNo,
      email: info.email,
      institute: info.institute,
      status: 'registered',
      consentAgreed: false,
      isOnline: true,
      isActive: true,
      lastHeartbeat: Date.now(),
      answers: {},
      score: null,
      totalMarks: exam.questions?.reduce((acc, q) => acc + (q.marks || 1), 0) || 10,
      riskScore: 0,
      violationCount: 0,
      startedAt: null,
      endedAt: null,
      previewScreenDataUrl: generateMockScreenSVG(info.name, 'NORMAL'),
      previewCamDataUrl: generateMockCamSVG(info.name, 'NORMAL')
    };

    if (!existing) {
      this.students.unshift(session);
      try {
        localStorage.setItem('omni_demo_students', JSON.stringify(this.students));
      } catch (e) {}
      this.notify();
    }

    if (this.broadcast) {
      this.broadcast.postMessage({ type: 'STUDENT_STATUS', payload: session });
    }

    return { session, exam };
  }

  public updateStudentStatus(sessionId: string, updates: Partial<DemoCandidateSession>) {
    const s = this.students.find((item) => item.id === sessionId);
    if (s) {
      Object.assign(s, updates);
      try {
        localStorage.setItem('omni_demo_students', JSON.stringify(this.students));
      } catch (e) {}
      this.notify();
      if (this.broadcast) {
        this.broadcast.postMessage({ type: 'STUDENT_STATUS', payload: s });
      }
    }
  }

  public recordStudentAnswer(sessionId: string, answers: Record<string, string>) {
    const s = this.students.find((item) => item.id === sessionId);
    if (s) {
      s.answers = answers;
      s.lastHeartbeat = Date.now();
      try {
        localStorage.setItem('omni_demo_students', JSON.stringify(this.students));
      } catch (e) {}
      this.notify();
      if (this.broadcast) {
        this.broadcast.postMessage({ type: 'STUDENT_ANSWER', payload: { sessionId, answers } });
      }
    }
  }

  public submitStudentExam(sessionId: string, answers: Record<string, string>, questions: Question[]) {
    const s = this.students.find((item) => item.id === sessionId);
    let scored = 0;
    let total = 0;
    questions.forEach((q) => {
      total += q.marks || 1;
      if (answers[q.id]?.toUpperCase() === q.correctAnswer?.toUpperCase()) {
        scored += q.marks || 1;
      }
    });

    if (s) {
      s.answers = answers;
      s.score = scored;
      s.totalMarks = total;
      s.status = 'submitted';
      s.endedAt = new Date().toISOString();
      try {
        localStorage.setItem('omni_demo_students', JSON.stringify(this.students));
      } catch (e) {}
      this.notify();
      if (this.broadcast) {
        this.broadcast.postMessage({ type: 'STUDENT_SUBMIT', payload: s });
      }
    }

    return { scoredMarks: scored, totalMarks: total, percentage: total > 0 ? Math.round((scored / total) * 100) : 0 };
  }

  public terminateStudent(sessionId: string, reason?: string) {
    const s = this.students.find((item) => item.id === sessionId);
    if (s) {
      s.status = 'submitted';
      s.riskScore = 100;
      s.endedAt = new Date().toISOString();
      try {
        localStorage.setItem('omni_demo_students', JSON.stringify(this.students));
      } catch (e) {}
      this.notify();
      if (this.broadcast) {
        this.broadcast.postMessage({
          type: 'STUDENT_TERMINATED',
          payload: { sessionId, reason: reason || 'Test manually terminated by teacher' }
        });
      }
    }
  }

  private handleRemoteAnswer(payload: { sessionId: string; answers: Record<string, string> }) {
    const s = this.students.find((item) => item.id === payload.sessionId);
    if (s) {
      s.answers = payload.answers;
      s.lastHeartbeat = Date.now();
      this.notify();
    }
  }

  private handleRemoteViolation(violation: DemoViolation) {
    if (!this.violations.some((v) => v.id === violation.id)) {
      this.violations.unshift(violation);
      const student = this.students.find((s) => s.id === violation.sessionId);
      if (student) {
        student.violationCount += 1;
        student.riskScore = Math.min(100, student.riskScore + (violation.severity === 'CRITICAL' ? 25 : 15));
        student.latestViolation = violation;
      }
      playThreatAlertChime();
      this.notify();
    }
  }

  private handleRemoteStatus(session: DemoCandidateSession) {
    const idx = this.students.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      this.students[idx] = session;
    } else {
      this.students.unshift(session);
    }
    this.notify();
  }

  private handleRemoteSubmit(session: DemoCandidateSession) {
    const idx = this.students.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      this.students[idx] = session;
      this.notify();
    }
  }

  // Background randomized simulation to make the Invigilator Dashboard alive
  private startSimulation() {
    if (this.simulationInterval) return;

    this.simulationInterval = setInterval(() => {
      // Pick an active in_progress student
      const activeCandidates = this.students.filter(
        (s) => s.status === 'in_progress' && s.isOnline && s.studentId !== 'stud_local_test'
      );
      if (activeCandidates.length === 0) return;

      const randomCandidate = activeCandidates[Math.floor(Math.random() * activeCandidates.length)];

      const possibleViolations: Array<{
        type: DemoViolation['type'];
        severity: DemoViolation['severity'];
        desc: string;
      }> = [
        {
          type: 'TAB_SWITCH',
          severity: 'HIGH',
          desc: 'Candidate switched window tab or minimized the exam window (document.visibilityState: hidden)'
        },
        {
          type: 'FULLSCREEN_EXIT',
          severity: 'MEDIUM',
          desc: 'Full-screen mode was exited. Candidate desktop window boundaries changed.'
        },
        {
          type: 'FACE_MISSING',
          severity: 'HIGH',
          desc: 'MediaPipe vision model: No candidate face visible in camera frame for 6+ seconds'
        },
        {
          type: 'MOBILE_PHONE_DETECTED',
          severity: 'CRITICAL',
          desc: 'COCO-SSD object recognition model detected smartphone in candidate workspace'
        },
        {
          type: 'CLIPBOARD_DEVTOOLS',
          severity: 'MEDIUM',
          desc: 'Unauthorized keystroke combination or clipboard copy action intercepted'
        }
      ];

      const chosen = possibleViolations[Math.floor(Math.random() * possibleViolations.length)];

      this.addViolation({
        sessionId: randomCandidate.id,
        examId: randomCandidate.examId,
        studentId: randomCandidate.studentId,
        studentName: randomCandidate.studentName,
        rollNo: randomCandidate.rollNo,
        type: chosen.type,
        severity: chosen.severity,
        description: chosen.desc,
        screenImageUrl: generateMockScreenSVG(randomCandidate.studentName, chosen.type),
        camImageUrl: generateMockCamSVG(randomCandidate.studentName, chosen.type)
      });
    }, 18000); // Trigger every 18 seconds for vivid real-time demonstration
  }
}

export const demoService = new DemoServiceManager();
