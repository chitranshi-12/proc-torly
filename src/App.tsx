/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * OmniProctor - Teacher-First Proctoring Platform
 */

import React, { useState, useEffect, useRef } from 'react';
import { ProctorlyEyeIcon } from './components/ProctorlyLogo';
import { Navbar } from './components/Navbar';
import { StudentCodeEntry } from './components/StudentCodeEntry';
import { StudentChecklist } from './components/StudentChecklist';
import { WaitingRoom } from './components/WaitingRoom';
import { ExamRoom } from './components/ExamRoom';
import { ExamCompletion } from './components/ExamCompletion';
import { AdminLogin } from './components/AdminLogin';
import { AdminExamList } from './components/AdminExamList';
import { InvigilatorDashboard } from './components/InvigilatorDashboard';
import { ExamReports } from './components/ExamReports';
import { firebaseExamService, ExamData } from './services/firebaseExamService';
import { testFirestoreConnection } from './services/firebase';
import { seedDemoExamIfEmpty } from './services/seedFirebase';
import { demoService, DEMO_EXAM } from './services/demoService';
import { api, getAuthToken, removeAuthToken } from './services/api';

type AppView =
  | 'admin_login'
  | 'admin_exams'
  | 'admin_dashboard'
  | 'admin_reports'
  | 'student_entry'
  | 'student_checklist'
  | 'waiting_room'
  | 'exam_room'
  | 'exam_completion';

export default function App() {
  // authLoading stays true until Firebase resolves the persisted session.
  // Without this gate the teacher sees a flash of the login page on every refresh.
  const [authLoading, setAuthLoading] = useState(true);

  // Determine initial view from URL params
  const [currentView, setCurrentView] = useState<AppView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isStudent =
        params.has('exam') ||
        params.has('code') ||
        params.has('examId') ||
        params.get('mode') === 'student' ||
        window.location.pathname.startsWith('/exam/');
      if (isStudent) return 'student_entry';
    }
    return 'admin_login';
  });

  const [isDemo, setIsDemo] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('omni_is_demo');
      if (saved === 'true') return true;
      const params = new URLSearchParams(window.location.search);
      if (params.get('code') === 'DEMO101' || params.get('exam') === 'exam_demo_101') return true;
    }
    return false;
  });

  // Student Flow State
  const [activeExam, setActiveExam] = useState<ExamData | null>(null);
  const [candidateInfo, setCandidateInfo] = useState<{
    name: string;
    rollNo: string;
    email: string;
    institute?: string;
  }>({
    name: '',
    rollNo: '',
    email: '',
    institute: ''
  });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mediaStreams, setMediaStreams] = useState<{ webcam: MediaStream; screen: MediaStream } | null>(null);
  const [examResult, setExamResult] = useState<any | null>(null);

  // URL parameters for student flow
  const [urlExamCode, setUrlExamCode] = useState<string>('');
  const [urlExamId, setUrlExamId] = useState<string>('');

  // Invigilator State
  const [adminUser, setAdminUser] = useState<any | null>(null);
  const [selectedAdminExam, setSelectedAdminExam] = useState<ExamData | null>(null);

  // Parse URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code') || '';
    const examId = params.get('exam') || params.get('examId') || '';
    if (code) setUrlExamCode(code);
    if (examId) setUrlExamId(examId);

    if (code === 'DEMO101' || examId === 'exam_demo_101') {
      setIsDemo(true);
      setActiveExam(DEMO_EXAM);
    } else if (examId) {
      // Try to load exam by ID from demoService or Firestore
      const demoMatch = demoService.getExamById(examId);
      if (demoMatch) {
        setActiveExam(demoMatch);
      }
    }
  }, []);

  // Initialize auth: check local JWT token first, then Firebase as fallback.
  // Using a ref to drive navigation avoids the stale-closure bug where
  // currentView captured at subscription time is never updated.
  const currentViewRef = useRef(currentView);
  useEffect(() => { currentViewRef.current = currentView; }, [currentView]);

  useEffect(() => {
    // Check demo mode first — no network needed
    if (isDemo) {
      setAuthLoading(false);
      return;
    }

    // Try local JWT token (fast path)
    const token = getAuthToken();
    if (token) {
      api.getMe()
        .then(({ user }) => {
          setAdminUser({ id: user.id, name: user.name, email: user.email, role: user.role });
          if (currentViewRef.current === 'admin_login') setCurrentView('admin_exams');
        })
        .catch(() => removeAuthToken())
        .finally(() => setAuthLoading(false));
      return;
    }

    // No token — resolve immediately, show login page
    setAuthLoading(false);

    // Background: seed demo data (non-blocking)
    testFirestoreConnection();
    seedDemoExamIfEmpty();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLaunchDemo = () => {
    setIsDemo(true);
    localStorage.setItem('omni_is_demo', 'true');
    const demoTeacher = {
      id: 'demo_prof_vance',
      name: 'Prof. David Vance',
      email: 'vance@proctor.edu',
      role: 'teacher'
    };
    setAdminUser(demoTeacher);
    setCurrentView('admin_exams');
  };

  const handleExitDemo = () => {
    setIsDemo(false);
    localStorage.removeItem('omni_is_demo');
    setAdminUser(null);
    setCurrentView('admin_login');
  };

  const handleStudentVerified = (
    examData: ExamData,
    info: { name: string; rollNo: string; email: string; institute?: string },
    sessId: string
  ) => {
    setActiveExam(examData);
    setCandidateInfo(info);
    setSessionId(sessId);
    setCurrentView('student_checklist');
  };

  const handleChecklistCompleted = (
    streams: { webcam: MediaStream; screen: MediaStream },
    refPhoto: string
  ) => {
    setMediaStreams(streams);
    setCurrentView('waiting_room');
  };

  const handleStartExam = () => {
    setCurrentView('exam_room');
  };

  const handleExamFinished = (result: any) => {
    setExamResult(result);
    setCurrentView('exam_completion');
  };

  const handleResetStudent = () => {
    if (mediaStreams) {
      mediaStreams.webcam?.getTracks().forEach((t) => t.stop());
      mediaStreams.screen?.getTracks().forEach((t) => t.stop());
    }
    setMediaStreams(null);
    setSessionId(null);
    setActiveExam(null);
    setExamResult(null);

    // Return to teacher portal if logged in, otherwise student entry
    if (adminUser || isDemo) {
      setCurrentView('admin_exams');
    } else {
      setCurrentView('admin_login');
    }
  };

  const handleAdminLoginSuccess = (user: any) => {
    setAdminUser(user);
    setCurrentView('admin_exams');
  };

  const handleAdminLogout = async () => {
    removeAuthToken();
    try { await firebaseExamService.logout(); } catch (_) {}
    setAdminUser(null);
    setIsDemo(false);
    localStorage.removeItem('omni_is_demo');
    setCurrentView('admin_login');
  };

  const handleSelectAdminExam = (exam: ExamData, target: 'dashboard' | 'reports') => {
    setSelectedAdminExam(exam);
    setCurrentView(target === 'dashboard' ? 'admin_dashboard' : 'admin_reports');
  };

  const handleOpenStudentView = (exam: ExamData) => {
    setActiveExam(exam);
    setUrlExamCode(exam.code);
    setUrlExamId(exam.id);
    setCurrentView('student_entry');
  };

  const handleOpenTestStudentTab = () => {
    const targetExam = selectedAdminExam || activeExam || demoService.getExams()[0];
    const url = `${window.location.origin}${window.location.pathname}?exam=${targetExam.id}&code=${targetExam.code}&mode=student`;
    window.open(url, '_blank');
  };

  // Block render until Firebase resolves the persisted session to prevent login flash.
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Hide navbar inside active exam room to maintain completely clean exam environment */}
      {currentView !== 'exam_room' && (
        <Navbar
          currentView={currentView}
          onNavigate={(view) => setCurrentView(view as AppView)}
          adminUser={adminUser}
          onLogoutAdmin={handleAdminLogout}
          isDemo={isDemo}
          onExitDemo={handleExitDemo}
          onOpenTestStudentTab={handleOpenTestStudentTab}
        />
      )}

      {/* Main View Router */}
      <main className="flex-1">
        {/* Teacher Entry (Home Page) */}
        {currentView === 'admin_login' && (
          <AdminLogin
            onSuccess={handleAdminLoginSuccess}
            onLaunchDemo={handleLaunchDemo}
          />
        )}

        {/* Teacher Exams List — protected: only accessible when logged in or in demo */}
        {currentView === 'admin_exams' && (adminUser || isDemo) && (
          <AdminExamList
            onSelectExam={handleSelectAdminExam}
            onOpenStudentView={handleOpenStudentView}
            isDemo={isDemo}
          />
        )}
        {currentView === 'admin_exams' && !adminUser && !isDemo && (
          // Redirect unauthenticated access back to login
          <>{setCurrentView('admin_login')}</>
        )}

        {/* Live Invigilator Monitoring Console */}
        {currentView === 'admin_dashboard' && selectedAdminExam && (
          <InvigilatorDashboard
            exam={selectedAdminExam}
            onBack={() => setCurrentView('admin_exams')}
            isDemo={isDemo}
          />
        )}

        {/* Audit Reports */}
        {currentView === 'admin_reports' && selectedAdminExam && (
          <ExamReports
            exam={selectedAdminExam}
            onBack={() => setCurrentView('admin_exams')}
          />
        )}

        {/* Student Flow (Only via Teacher's Link or Test Mode) */}
        {currentView === 'student_entry' && (
          <StudentCodeEntry
            onVerified={handleStudentVerified}
            initialCode={urlExamCode}
            initialExam={activeExam}
            isDemo={isDemo}
          />
        )}

        {currentView === 'student_checklist' && activeExam && sessionId && (
          <StudentChecklist
            exam={activeExam}
            sessionId={sessionId}
            candidateInfo={candidateInfo}
            onCompleted={handleChecklistCompleted}
            onBack={() => setCurrentView('student_entry')}
          />
        )}

        {currentView === 'waiting_room' && activeExam && sessionId && mediaStreams && (
          <WaitingRoom
            exam={activeExam}
            sessionId={sessionId}
            candidateInfo={candidateInfo}
            mediaStreams={mediaStreams}
            onStartExam={handleStartExam}
          />
        )}

        {currentView === 'exam_room' && activeExam && sessionId && mediaStreams && (
          <ExamRoom
            sessionId={sessionId}
            exam={activeExam}
            candidateInfo={candidateInfo}
            mediaStreams={mediaStreams}
            onFinished={handleExamFinished}
          />
        )}

        {currentView === 'exam_completion' && examResult && (
          <ExamCompletion result={examResult} onReset={handleResetStudent} />
        )}
      </main>

      {/* Footer */}
      {currentView !== 'exam_room' && (
        <footer className="border-t border-slate-900 bg-slate-950 py-5 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ProctorlyEyeIcon size={18} animate={false} />
              <span className="font-semibold text-slate-400">Proctorly AI Enterprise</span>
              <span className="text-slate-600">•</span>
              <span>Teacher-First Invigilation Architecture</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>WebRTC Direct Screen Stream</span>
              <span>•</span>
              <span>Cloud Firestore & Offline Tolerant Sync</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
