/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * exam.co - Modern Online Examination Platform
 */

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/LandingPage';
import { StudentCodeEntry } from './components/StudentCodeEntry';
import { firebaseExamService, ExamData } from './services/firebaseExamService';
import { testFirestoreConnection } from './services/firebase';
import { demoService, DEMO_EXAM } from './services/demoService';
import { api, removeAuthToken, setAuthToken, setStudentSessionToken, removeStudentSessionToken } from './services/api';
import { ExamCoLogo } from './components/ExamCoLogo';
import { LoadingScreen } from './components/LoadingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExamCompletion } from './components/ExamCompletion';
import { StudentChecklist } from './components/StudentChecklist';
import { WaitingRoom } from './components/WaitingRoom';
import { ExamRoom } from './components/ExamRoom';

// Resilient lazy-loading helper with automatic retry for transient network/HMR blips
function resilientLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3,
  delayMs = 800
): React.LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (left: number) => {
        factory()
          .then(resolve)
          .catch((err) => {
            if (left <= 1) {
              console.error('Dynamic module load failed after retries:', err);
              reject(err);
            } else {
              setTimeout(() => attempt(left - 1), delayMs);
            }
          });
      };
      attempt(retries);
    })
  );
}

// Lazy-loaded teacher/admin views
const AdminLogin = resilientLazy(() => import('./components/AdminLogin').then((m) => ({ default: m.AdminLogin })));
const AdminExamList = resilientLazy(() => import('./components/AdminExamList').then((m) => ({ default: m.AdminExamList })));
const InvigilatorDashboard = resilientLazy(() => import('./components/InvigilatorDashboard').then((m) => ({ default: m.InvigilatorDashboard })));
const ExamReports = resilientLazy(() => import('./components/ExamReports').then((m) => ({ default: m.ExamReports })));

type AppView =
  | 'landing'
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
  const [authLoading, setAuthLoading] = useState(true);

  // Determine initial view from URL params
  const [currentView, setCurrentView] = useState<AppView>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      // Explicit result view request
      if (params.get('view') === 'completion' || params.get('view') === 'result' || params.has('attemptResult')) {
        return 'exam_completion';
      }
      const isStudent =
        params.has('exam') ||
        params.has('code') ||
        params.has('examId') ||
        params.get('mode') === 'student' ||
        window.location.pathname.startsWith('/exam/');
      if (isStudent) return 'student_entry';
      if (params.get('view') === 'login') return 'admin_login';
    }
    return 'landing';
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
  const [activeExam, setActiveExam] = useState<any | null>(null);
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
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [mediaStreams, setMediaStreams] = useState<{ webcam: MediaStream; screen: MediaStream } | null>(null);
  const [examResult, setExamResult] = useState<any | null>(null);

  // URL parameters for student flow
  const [urlExamCode, setUrlExamCode] = useState<string>('');
  const [urlExamId, setUrlExamId] = useState<string>('');

  // Invigilator State
  const [adminUser, setAdminUser] = useState<any | null>(null);
  const [selectedAdminExam, setSelectedAdminExam] = useState<any | null>(null);

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
      const demoMatch = demoService.getExamById(examId);
      if (demoMatch) {
        setActiveExam(demoMatch);
      }
    }

    // Check if there is an authoritative submitted attempt preserved across browser refresh
    // Result screen is restored ONLY when explicitly requested via URL or active completion tab session
    try {
      const isExplicitResultRoute =
        params.get('view') === 'completion' ||
        params.get('view') === 'result' ||
        params.has('attemptResult');
      const isSessionResultActive = sessionStorage.getItem('examco_active_result_view') === 'true';

      if (isExplicitResultRoute || isSessionResultActive) {
        const savedSubmission = localStorage.getItem('examco_submission_result');
        if (savedSubmission) {
          const parsed = JSON.parse(savedSubmission);
          if (parsed && (parsed.status === 'submitted' || parsed.status === 'terminated')) {
            setExamResult(parsed);
            setCurrentView('exam_completion');

            // Asynchronously reconcile latest score and authoritative status with backend
            if (parsed.attemptId) {
              api.getAttempt(parsed.attemptId)
                .then(({ attempt }) => {
                  if (attempt && (attempt.status === 'submitted' || attempt.status === 'terminated')) {
                    setExamResult((prev: any) => ({
                      ...prev,
                      score: attempt.score ?? prev?.score ?? 0,
                      totalMarks: attempt.totalMarks ?? prev?.totalMarks ?? 0,
                      status: attempt.status,
                      riskScore: attempt.riskScore ?? prev?.riskScore,
                      incidentCount: attempt.incidentCount ?? prev?.incidentCount,
                      terminationReason: attempt.terminationReason || prev?.terminationReason
                    }));
                  }
                })
                .catch(() => {
                  // If offline or network blip, local submission payload remains authoritative
                });
            }
          }
        }
      }

      // Restore active student exam session if candidate refreshed
      const savedStudentData = localStorage.getItem('examco_student_data');
      if (savedStudentData) {
        try {
          const parsed = JSON.parse(savedStudentData);
          if (parsed.exam && (parsed.sessionId || parsed.attemptId)) {
            setActiveExam(parsed.exam);
            if (parsed.info) setCandidateInfo(parsed.info);
            if (parsed.sessionId) setSessionId(parsed.sessionId);
            if (parsed.attemptId) setAttemptId(parsed.attemptId);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }, []);

  const currentViewRef = useRef(currentView);
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    if (isDemo) {
      setAuthLoading(false);
      return;
    }

    let active = true;
    const unsubscribe = firebaseExamService.onAuthChange(async (user) => {
      if (!user) {
        removeAuthToken();
        setAdminUser(null);
        if (active) setAuthLoading(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        setAuthToken(idToken);
        const { user: profile } = await api.getMe();
        if (!active) return;
        setAdminUser(profile);
        if (currentViewRef.current === 'admin_login' || currentViewRef.current === 'landing') {
          setCurrentView('admin_exams');
        }
      } catch (error) {
        console.warn('Backend teacher sync note:', error);
        if (!active) return;
        // Fallback user from Firebase token
        const fallback = {
          id: user.uid,
          name: user.displayName || 'Teacher',
          email: user.email || 'teacher@exam.co',
          role: 'teacher'
        };
        setAdminUser(fallback);
        if (currentViewRef.current === 'admin_login') {
          setCurrentView('admin_exams');
        }
      } finally {
        if (active) setAuthLoading(false);
      }
    });

    testFirestoreConnection();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isDemo]);

  const handleLaunchDemo = () => {
    setIsDemo(true);
    localStorage.setItem('omni_is_demo', 'true');
    const demoTeacher = {
      id: 'demo_prof_vance',
      name: 'Prof. David Vance',
      email: 'vance@exam.co',
      role: 'teacher'
    };
    setAdminUser(demoTeacher);
    setCurrentView('admin_exams');
  };

  const handleExitDemo = () => {
    setIsDemo(false);
    localStorage.removeItem('omni_is_demo');
    setAdminUser(null);
    setCurrentView('landing');
  };

  const handleStudentVerified = (
    examData: any,
    info: { name: string; rollNo: string; email: string; institute?: string },
    sessId: string,
    attId: string,
    sessionToken?: string
  ) => {
    setActiveExam(examData);
    setCandidateInfo(info);
    setSessionId(sessId);
    setAttemptId(attId);
    if (sessionToken) {
      setStudentSessionToken(sessionToken);
    }
    try {
      localStorage.setItem(
        'examco_student_data',
        JSON.stringify({
          exam: examData,
          info,
          sessionId: sessId,
          attemptId: attId
        })
      );
    } catch (_) {}
    setCurrentView('student_checklist');
  };

  const handleChecklistCompleted = (
    streams: { webcam: MediaStream; screen: MediaStream },
    _refPhoto: string
  ) => {
    setMediaStreams(streams);
    setCurrentView('waiting_room');
  };

  const handleStartExam = () => {
    setCurrentView('exam_room');
  };

  const handleExamFinished = (result: any) => {
    // Immediately stop all open webcam and screen media tracks
    if (mediaStreams) {
      try {
        mediaStreams.webcam?.getTracks().forEach((t) => t.stop());
        mediaStreams.screen?.getTracks().forEach((t) => t.stop());
      } catch (_) {}
    }
    setMediaStreams(null);

    setExamResult(result);
    try {
      localStorage.setItem('examco_submission_result', JSON.stringify(result));
      sessionStorage.setItem('examco_active_result_view', 'true');
      const url = new URL(window.location.href);
      url.searchParams.set('view', 'completion');
      if (result.attemptId) url.searchParams.set('attemptId', result.attemptId);
      window.history.replaceState({ view: 'exam_completion' }, '', url.toString());
    } catch (_) {}
    setCurrentView('exam_completion');
  };

  const handleResetStudent = () => {
    if (mediaStreams) {
      try {
        mediaStreams.webcam?.getTracks().forEach((t) => t.stop());
        mediaStreams.screen?.getTracks().forEach((t) => t.stop());
      } catch (_) {}
    }
    setMediaStreams(null);
    setSessionId(null);
    setAttemptId(null);
    setActiveExam(null);
    setExamResult(null);
    removeStudentSessionToken();
    try {
      localStorage.removeItem('examco_student_session');
      localStorage.removeItem('examco_student_token');
      localStorage.removeItem('examco_student_data');
      localStorage.removeItem('examco_submission_result');
      sessionStorage.removeItem('examco_active_result_view');
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('attemptId');
      url.searchParams.delete('exam');
      url.searchParams.delete('code');
      window.history.replaceState({}, '', url.pathname);
    } catch (_) {}

    if (adminUser || isDemo) {
      setCurrentView('admin_exams');
    } else {
      setCurrentView('landing');
    }
  };

  const handleAdminLoginSuccess = (user: any) => {
    setAdminUser(user);
    setCurrentView('admin_exams');
  };

  const handleAdminLogout = async () => {
    removeAuthToken();
    try {
      await firebaseExamService.logout();
    } catch (_) {}
    setAdminUser(null);
    setIsDemo(false);
    localStorage.removeItem('omni_is_demo');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      window.history.replaceState({}, '', url.pathname);
    } catch (_) {}
    setCurrentView('landing');
  };

  const handleSelectAdminExam = (exam: any, target: 'dashboard' | 'reports') => {
    setSelectedAdminExam(exam);
    setCurrentView(target === 'dashboard' ? 'admin_dashboard' : 'admin_reports');
  };

  const handleOpenStudentView = (exam: any) => {
    setActiveExam(exam);
    setUrlExamCode(exam.examCode || exam.code);
    setUrlExamId(exam.id || exam._id);
    setCurrentView('student_entry');
  };

  const handleOpenTestStudentTab = () => {
    const targetExam = selectedAdminExam || activeExam || demoService.getExams()[0];
    const code = targetExam.examCode || targetExam.code || 'DEMO101';
    const id = targetExam.id || targetExam._id || 'demo';
    const url = `${window.location.origin}${window.location.pathname}?exam=${id}&code=${code}&mode=student`;
    window.open(url, '_blank');
  };

  if (authLoading) {
    return <LoadingScreen message="Connecting to exam.co platform..." onTimeout={() => setAuthLoading(false)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navbar rendered on all pages except active exam room and landing */}
      {currentView !== 'exam_room' && currentView !== 'landing' && (
        <Navbar
          currentView={currentView}
          onNavigate={(view) => {
            if (view === 'student_entry') {
              try {
                sessionStorage.removeItem('examco_active_result_view');
                localStorage.removeItem('examco_submission_result');
              } catch (_) {}
            }
            setCurrentView(view as AppView);
          }}
          adminUser={adminUser}
          onLogoutAdmin={handleAdminLogout}
          isDemo={isDemo}
          onExitDemo={handleExitDemo}
          onOpenTestStudentTab={handleOpenTestStudentTab}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        <ErrorBoundary onReset={() => setCurrentView('landing')}>
          <Suspense fallback={<LoadingScreen message="Loading examination workspace..." />}>
            {/* Landing Page */}
            {currentView === 'landing' && (
              <LandingPage
                onTeacherLogin={() => setCurrentView('admin_login')}
                onStudentJoin={(code) => {
                  try {
                    sessionStorage.removeItem('examco_active_result_view');
                    localStorage.removeItem('examco_submission_result');
                  } catch (_) {}
                  if (code) setUrlExamCode(code);
                  setCurrentView('student_entry');
                }}
                onLaunchDemo={handleLaunchDemo}
              />
            )}

            {/* Teacher Login */}
            {currentView === 'admin_login' && (
              <AdminLogin
                onSuccess={handleAdminLoginSuccess}
                onLaunchDemo={handleLaunchDemo}
                onBackToHome={() => setCurrentView('landing')}
              />
            )}

            {/* Teacher Examination Management */}
            {currentView === 'admin_exams' && (adminUser || isDemo) && (
              <AdminExamList
                onSelectExam={handleSelectAdminExam}
                onOpenStudentView={handleOpenStudentView}
                isDemo={isDemo}
              />
            )}
            {currentView === 'admin_exams' && !adminUser && !isDemo && (
              <AdminLogin
                onSuccess={handleAdminLoginSuccess}
                onLaunchDemo={handleLaunchDemo}
                onBackToHome={() => setCurrentView('landing')}
              />
            )}

            {/* Live Monitoring Console */}
            {currentView === 'admin_dashboard' && selectedAdminExam && (
              <InvigilatorDashboard
                exam={selectedAdminExam}
                onBack={() => setCurrentView('admin_exams')}
                isDemo={isDemo}
              />
            )}

            {/* Audit & Results Reports */}
            {currentView === 'admin_reports' && selectedAdminExam && (
              <ExamReports
                exam={selectedAdminExam}
                onBack={() => setCurrentView('admin_exams')}
              />
            )}

            {/* Student Entry */}
            {currentView === 'student_entry' && (
              <StudentCodeEntry
                onVerified={handleStudentVerified}
                initialCode={urlExamCode}
                initialExam={activeExam}
                isDemo={isDemo}
                onBackToHome={() => setCurrentView('landing')}
              />
            )}

            {/* Student Readiness Checklist */}
            {currentView === 'student_checklist' && activeExam && (sessionId || attemptId) && (
              <StudentChecklist
                exam={activeExam}
                sessionId={sessionId || ''}
                attemptId={attemptId || sessionId || ''}
                candidateInfo={candidateInfo}
                onCompleted={handleChecklistCompleted}
                onBack={() => setCurrentView('student_entry')}
                isDemo={isDemo}
              />
            )}

            {/* Student Waiting Room */}
            {currentView === 'waiting_room' && activeExam && (sessionId || attemptId) && mediaStreams && (
              <WaitingRoom
                exam={activeExam}
                sessionId={sessionId || ''}
                attemptId={attemptId || sessionId || ''}
                candidateInfo={candidateInfo}
                mediaStreams={mediaStreams}
                onStartExam={handleStartExam}
                onBackToEntry={() => setCurrentView('student_entry')}
                onBackToChecklist={() => setCurrentView('student_checklist')}
                isDemo={isDemo}
              />
            )}

            {/* Active Examination Room */}
            {currentView === 'exam_room' && activeExam && (sessionId || attemptId) && mediaStreams && (
              <ExamRoom
                sessionId={sessionId || ''}
                attemptId={attemptId || sessionId || ''}
                exam={activeExam}
                candidateInfo={candidateInfo}
                mediaStreams={mediaStreams}
                onFinished={handleExamFinished}
                isDemo={isDemo}
              />
            )}

            {/* Stream Recovery if refreshed or media connection lost */}
            {(currentView === 'waiting_room' || currentView === 'exam_room') && activeExam && (sessionId || attemptId) && !mediaStreams && (
              <div className="max-w-md mx-auto px-4 py-16 text-center">
                <div className="bg-white border border-slate-200/90 rounded-3xl p-8 shadow-xl">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mx-auto flex items-center justify-center mb-4">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Proctoring Streams Required</h3>
                  <p className="text-xs text-slate-600 mb-6 font-medium">
                    Camera and screen sharing permissions must be active to proceed with this examination.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentView('student_checklist')}
                    className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm cursor-pointer"
                  >
                    Re-enable Camera & Screen Sharing
                  </button>
                </div>
              </div>
            )}

            {/* Submission Confirmation */}
            {currentView === 'exam_completion' && examResult && (
              <ErrorBoundary
                fallback={
                  <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 selection:bg-indigo-500 selection:text-white">
                    <div className="sm:mx-auto sm:w-full sm:max-w-lg bg-white border border-slate-200/90 rounded-3xl shadow-xl p-8 sm:p-10 text-center">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 mx-auto flex items-center justify-center mb-6">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                        Examination Submitted Successfully
                      </h2>
                      <p className="mt-2 text-xs sm:text-sm text-slate-600">
                        All responses have been securely verified, evaluated, and transmitted to the authoritative examination record.
                      </p>
                      <div className="mt-6 p-6 rounded-2xl bg-slate-50 border border-slate-200">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Authoritative Score Assessment
                        </div>
                        <div className="flex items-baseline justify-center gap-2">
                          <span className="text-4xl sm:text-5xl font-black text-slate-900">{examResult.score ?? 0}</span>
                          <span className="text-slate-500 font-mono text-sm font-bold">/ {examResult.totalMarks || 0} pts</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleResetStudent}
                        className="mt-8 w-full py-3.5 px-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-xs transition-all cursor-pointer shadow-sm"
                      >
                        Return to Candidate Portal
                      </button>
                    </div>
                  </div>
                }
              >
                <ExamCompletion result={examResult} onReset={handleResetStudent} />
              </ErrorBoundary>
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* Footer (omitted during active exam room & landing page) */}
      {currentView !== 'exam_room' && currentView !== 'landing' && (
        <footer className="border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500 shadow-xs">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ExamCoLogo size="sm" theme="light" />
              <span className="text-slate-300">•</span>
              <span className="text-slate-600 font-medium">Enterprise Examination Architecture</span>
            </div>
            <div className="flex items-center gap-4 text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Authoritative Timer & Autosave
              </span>
              <span>•</span>
              <span>Real-Time Invigilation & Audit</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
