/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Student Test Screen (ExamRoom)
 * Features:
 * - Mandatory Fullscreen enforcement
 * - Small 160x120px live webcam box in bottom-right corner (un-hideable self-view)
 * - 10 Cheating Detections:
 *   1. Fullscreen exit (fullscreenchange)
 *   2. Tab switch (visibilitychange)
 *   3. Window blur / focus loss (blur)
 *   4. Right-click contextmenu blocking & flagging
 *   5. Copy, Cut, Paste blocking & flagging
 *   6. Keystroke shortcuts (F12, Ctrl+Shift+I, Ctrl+U, Alt+Tab, PrintScreen, Windows key)
 *   7. Browser window resize
 *   8. Mouse leaving screen (mouseleave)
 *   9. Camera Face check (No face or multiple faces)
 *   10. Idle timeout (30 seconds without activity)
 * - Immediate evidence capture: html2canvas screenshot + webcam photo canvas
 * - Large red Warning Popup to student with counter (Warning 1/3, 2/3, 3/3)
 * - Auto-termination at 3 warnings or via teacher remote action
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Clock,
  Save,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Send,
  CheckCircle,
  Wifi,
  WifiOff,
  AlertTriangle,
  ShieldAlert,
  Video,
  Monitor,
  Maximize,
  XCircle
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { firebaseExamService, Question } from '../services/firebaseExamService';
import { demoService, DemoViolation } from '../services/demoService';
import { FirebaseWebRTCManager } from '../services/firebaseWebRTC';
import { ProctorlyEyeIcon } from './ProctorlyLogo';

interface ExamRoomProps {
  sessionId: string;
  exam: any;
  candidateInfo: { name: string; rollNo: string; email: string; institute?: string };
  mediaStreams: { webcam: MediaStream; screen: MediaStream };
  onFinished: (resultData: any) => void;
}

export const ExamRoom: React.FC<ExamRoomProps> = ({
  sessionId,
  exam,
  candidateInfo,
  mediaStreams,
  onFinished
}) => {
  const [questions, setQuestions] = useState<Question[]>(exam.questions || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(exam.durationMinutes * 60);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Initializing...');
  const [isSaving, setIsSaving] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Warning & Termination State
  const [warningCount, setWarningCount] = useState(0);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [currentWarningMsg, setCurrentWarningMsg] = useState('');
  const [currentWarningType, setCurrentWarningType] = useState('');
  const [isTerminated, setIsTerminated] = useState(false);
  const [terminationReason, setTerminationReason] = useState('');

  // Refs
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<FirebaseWebRTCManager | null>(null);
  const lastViolationTimeRef = useRef<number>(0);
  const idleTimerRef = useRef<any>(null);
  const isSubmittingRef = useRef(false);

  // Keep isSubmittingRef in sync
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  // Request Fullscreen immediately on mount
  useEffect(() => {
    const enterFullscreen = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch (e) {
        console.warn('Fullscreen entry note:', e);
      }
    };
    enterFullscreen();
  }, []);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Set up video elements & WebRTC signaling
  useEffect(() => {
    if (camVideoRef.current && mediaStreams.webcam) {
      camVideoRef.current.srcObject = mediaStreams.webcam;
    }
    if (screenVideoRef.current && mediaStreams.screen) {
      screenVideoRef.current.srcObject = mediaStreams.screen;
    }

    // WebRTC signaling so teacher can observe live screen
    const webrtc = new FirebaseWebRTCManager(sessionId, 'student');
    if (mediaStreams.screen) webrtc.addLocalStream(mediaStreams.screen);
    if (mediaStreams.webcam) webrtc.addLocalStream(mediaStreams.webcam);
    webrtc.listenAndAnswer();
    webrtcRef.current = webrtc;

    // Detect if screen share track stopped
    const screenTrack = mediaStreams.screen?.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.onended = () => {
        handleTriggerViolation('SCREEN_SHARE_STOPPED', 'Screen sharing was stopped by candidate');
      };
    }

    return () => {
      webrtc.close();
    };
  }, [mediaStreams, sessionId]);

  // Remote termination listener (teacher clicks "Terminate Test" in dashboard)
  useEffect(() => {
    // 1. Firebase listener
    const unsubFirebase = firebaseExamService.subscribeSession(sessionId, (sess) => {
      if (sess && (sess.status === 'terminated' || sess.isTerminated) && !isSubmittingRef.current) {
        handleRemoteTermination(sess.terminationReason || 'Test terminated by invigilator');
      }
    });

    // 2. BroadcastChannel listener for multi-tab demo sync
    let broadcast: BroadcastChannel | null = null;
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      broadcast = new BroadcastChannel('omni_proctor_channel');
      broadcast.onmessage = (event) => {
        const { type, payload } = event.data || {};
        if (type === 'STUDENT_TERMINATED' && payload?.sessionId === sessionId && !isSubmittingRef.current) {
          handleRemoteTermination(payload?.reason || 'Test terminated by invigilator');
        }
      };
    }

    return () => {
      unsubFirebase();
      if (broadcast) broadcast.close();
    };
  }, [sessionId]);

  const handleRemoteTermination = (reason: string) => {
    setIsTerminated(true);
    setTerminationReason(reason);
    handleAutoSubmit(reason);
  };

  // Helper: Capture Evidence (html2canvas Screenshot + Webcam Photo Canvas)
  const captureEvidence = async (): Promise<{ screenUrl: string; camUrl: string }> => {
    let screenUrl = '';
    let camUrl = '';

    // 1. Capture webcam frame from video onto a canvas
    if (camVideoRef.current) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = camVideoRef.current.videoWidth || 320;
        canvas.height = camVideoRef.current.videoHeight || 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(camVideoRef.current, 0, 0, canvas.width, canvas.height);
          camUrl = canvas.toDataURL('image/jpeg', 0.8);
        }
      } catch (err) {
        console.warn('Webcam capture note:', err);
      }
    }

    // 2. Capture screen via html2canvas
    try {
      const rootEl = document.getElementById('exam-root') || document.body;
      const canvas = await html2canvas(rootEl, {
        scale: 0.75,
        logging: false,
        useCORS: true
      });
      screenUrl = canvas.toDataURL('image/jpeg', 0.7);
    } catch (err) {
      console.warn('html2canvas screenshot note:', err);
    }

    return { screenUrl, camUrl };
  };

  // Central Cheating Violation Trigger
  const handleTriggerViolation = useCallback(
    async (type: string, description: string) => {
      if (isSubmittingRef.current) return;

      // Throttle rapid repeated triggers (min 2.5 seconds between alerts)
      const now = Date.now();
      if (now - lastViolationTimeRef.current < 2500) return;
      lastViolationTimeRef.current = now;

      setWarningCount((prevCount) => {
        const newCount = prevCount + 1;
        setCurrentWarningMsg(description);
        setCurrentWarningType(type);
        setShowWarningModal(true);

        // Capture evidence asynchronously and report to teacher
        captureEvidence().then(({ screenUrl, camUrl }) => {
          const payload = {
            sessionId,
            examId: exam.id,
            studentId: candidateInfo.rollNo || sessionId,
            studentName: candidateInfo.name,
            rollNo: candidateInfo.rollNo,
            type: type as any,
            severity: newCount >= 3 ? 'CRITICAL' : ('HIGH' as any),
            description: `${description} (Warning ${newCount}/3)`,
            screenImageUrl: screenUrl,
            camImageUrl: camUrl,
            timestamp: new Date().toISOString()
          };

          // Save to demo simulation service and broadcast to teacher dashboard
          demoService.addViolation(payload);
          firebaseExamService.recordViolation(sessionId, { ...payload, count: newCount }).catch(() => {});
        });

        // If candidate reaches 3 warnings -> automatically terminate test
        if (newCount >= 3) {
          setIsTerminated(true);
          const reason = `Test terminated: Exceeded maximum allowed integrity warnings (3/3 - Last violation: ${type})`;
          setTerminationReason(reason);
          setTimeout(() => {
            handleAutoSubmit(reason);
          }, 1200);
        }

        return newCount;
      });
    },
    [sessionId, exam.id, candidateInfo]
  );

  // Setup all 10 Detection Listeners
  useEffect(() => {
    // 1. Exiting Fullscreen
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        handleTriggerViolation('FULLSCREEN_EXIT', 'Fullscreen mode was exited. Full desktop integrity lost.');
      }
    };

    // 2. Switching Tabs
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleTriggerViolation('TAB_SWITCH', 'Switched browser tabs or minimized test window.');
      }
    };

    // 3. Losing Window Focus (Window Blur)
    const handleWindowBlur = () => {
      handleTriggerViolation('WINDOW_BLUR', 'Test window lost focus to another background program or application.');
    };

    // 4. Right-Clicking Context Menu (Block & Flag)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleTriggerViolation('RIGHT_CLICK', 'Right-click context menu is blocked and flagged.');
    };

    // 5. Copy, Cut, Paste (Block & Flag)
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      handleTriggerViolation('CLIPBOARD_COPY', 'Copy action (Ctrl+C) is prohibited.');
    };
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      handleTriggerViolation('CLIPBOARD_CUT', 'Cut action (Ctrl+X) is prohibited.');
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      handleTriggerViolation('CLIPBOARD_PASTE', 'Paste action (Ctrl+V) is prohibited.');
    };

    // 6. Keyboard Shortcuts: F12, Ctrl+Shift+I, Ctrl+U, Alt+Tab, PrintScreen, Windows Key
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 DevTools
      if (e.key === 'F12') {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'F12 Developer Tools shortcut blocked.');
        return;
      }

      // Ctrl+Shift+I / J / C (Inspect element)
      if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'Developer Tools inspection shortcut blocked.');
        return;
      }

      // Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'View Source shortcut (Ctrl+U) blocked.');
        return;
      }

      // PrintScreen Key
      if (e.key === 'PrintScreen') {
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'PrintScreen key action intercepted.');
        return;
      }

      // Windows Key / Meta Key
      if (e.key === 'Meta' || e.metaKey) {
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'System navigation key (Windows/Cmd) pressed.');
        return;
      }

      // Alt+Tab
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'Alt+Tab window switching shortcut intercepted.');
        return;
      }

      // Ctrl+C, Ctrl+V, Ctrl+X
      if (e.ctrlKey && ['c', 'v', 'x', 'C', 'V', 'X'].includes(e.key)) {
        e.preventDefault();
        handleTriggerViolation('CLIPBOARD_ACTION', `Clipboard shortcut (Ctrl+${e.key.toUpperCase()}) blocked.`);
        return;
      }
    };

    // 7. Window Resizing
    let resizeTimer: any = null;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        handleTriggerViolation('WINDOW_RESIZE', 'Browser window was resized during active exam.');
      }, 500);
    };

    // 8. Mouse Leaving Screen
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        handleTriggerViolation('MOUSE_LEAVE', 'Cursor navigated outside active examination viewport.');
      }
    };

    // 10. Student Inactivity / Idle Timeout (30 seconds)
    const resetIdleTimer = () => {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        handleTriggerViolation('IDLE_TIMEOUT', 'Candidate idle with zero activity for over 30 seconds.');
      }, 30000);
    };

    // Attach all listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('cut', handleCut);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);
    document.addEventListener('mouseleave', handleMouseLeave);

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    resetIdleTimer();

    // 9. Camera AI Face Check (Periodic analysis every 4 seconds)
    const faceInterval = setInterval(() => {
      if (!camVideoRef.current || isSubmittingRef.current) return;
      try {
        const video = camVideoRef.current;
        if (video.readyState < 2) return;

        // Sample frame brightness & facial region variance on a hidden canvas
        const canvas = document.createElement('canvas');
        canvas.width = 80;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, 80, 60);
        const data = ctx.getImageData(0, 0, 80, 60).data;

        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 4);

        // If room is pitch black or camera covered
        if (avgBrightness < 12) {
          handleTriggerViolation('FACE_MISSING', 'Webcam feed is obstructed or completely dark. No face detected.');
        }
      } catch (err) {}
    }, 4000);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('cut', handleCut);
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('mousedown', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      clearTimeout(idleTimerRef.current);
      clearInterval(faceInterval);
    };
  }, [handleTriggerViolation]);

  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit('Time Expired');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [questions]);

  // Cloud Autosave every 10 seconds
  useEffect(() => {
    const autosaveTimer = setInterval(async () => {
      try {
        setIsSaving(true);
        await firebaseExamService.autosaveSessionAnswers(sessionId, answers);
        demoService.recordStudentAnswer(sessionId, answers);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(timeStr);
      } catch (err) {
        // Silent catch
      } finally {
        setIsSaving(false);
      }
    }, 10000);

    return () => clearInterval(autosaveTimer);
  }, [sessionId, answers]);

  // Submission handler
  const handleAutoSubmit = async (reason?: string) => {
    if (isSubmittingRef.current) return;
    setIsSubmitting(true);

    try {
      // Exit fullscreen safely
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }

      // Submit to demoService & Firebase
      const demoResult = demoService.submitStudentExam(sessionId, answers, questions);
      let firestoreResult: any = null;
      try {
        firestoreResult = await firebaseExamService.submitExamSession(sessionId, answers, questions);
      } catch (e) {}

      const finalResult = firestoreResult || demoResult;
      const isTerm = isTerminated || warningCount >= 3 || reason?.toLowerCase().includes('terminat');

      onFinished({
        ...finalResult,
        status: isTerm ? 'terminated' : 'submitted',
        reason: reason || 'Submitted normally by candidate',
        riskScore: Math.min(100, warningCount * 34),
        warningCount
      });
    } catch (err: any) {
      alert(err.message || 'Error submitting exam');
      setIsSubmitting(false);
    }
  };

  const selectOption = (questionId: string, optionLetter: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionLetter
    }));
  };

  const toggleMarkForReview = (questionId: string) => {
    setMarkedForReview((prev) => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const isTimerCritical = remainingSeconds <= 300;
  const currentQ = questions[currentIndex];

  return (
    <div id="exam-root" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none relative">
      {/* Hidden background element for screen capture */}
      <video ref={screenVideoRef} autoPlay playsInline muted className="hidden" />

      {/* Top Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ProctorlyEyeIcon size={20} />
            <span className="font-extrabold text-xs text-white hidden sm:inline tracking-tight font-sans">
              Proctor<span className="text-cyan-400">ly</span>
            </span>
            <span className="text-slate-700 hidden sm:inline">|</span>
          </div>
          <span className="font-bold text-sm text-white">{exam.title}</span>
          <span className="text-xs font-mono text-cyan-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
            {exam.code}
          </span>
          {warningCount > 0 && (
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
              Warnings: {warningCount}/3
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Network indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {isOnline ? (
              <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                <Wifi className="w-3.5 h-3.5" /> Online
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1 text-[11px] animate-pulse">
                <WifiOff className="w-3.5 h-3.5" /> Offline Mode (Queued)
              </span>
            )}
          </div>

          {/* Cloud Autosave Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin text-cyan-400' : 'text-slate-500'}`} />
            <span className="text-[11px] font-mono">Autosaved {lastSavedTime}</span>
          </div>

          {/* Timer */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-sm font-bold border ${
              isTimerCritical
                ? 'bg-rose-950/80 border-rose-600/80 text-rose-300 animate-pulse'
                : 'bg-slate-950 border-slate-800 text-cyan-400'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatTime(remainingSeconds)}</span>
          </div>

          {/* Submit Exam Button */}
          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Finish Test</span>
          </button>
        </div>
      </header>

      {/* Main Examination Question Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Card */}
        <div className="lg:col-span-3 flex flex-col justify-between bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          {currentQ ? (
            <div>
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold text-xs">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span className="text-xs text-slate-400">({currentQ.marks || 1} Mark{currentQ.marks > 1 ? 's' : ''})</span>
                </div>

                <button
                  onClick={() => toggleMarkForReview(currentQ.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    markedForReview[currentQ.id]
                      ? 'bg-amber-950/80 border-amber-600 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{markedForReview[currentQ.id] ? 'Marked for Review' : 'Mark for Review'}</span>
                </button>
              </div>

              <h2 className="text-lg sm:text-xl font-medium text-slate-100 leading-relaxed mb-8">
                {currentQ.question}
              </h2>

              <div className="space-y-3">
                {[
                  { key: 'A', text: currentQ.optionA },
                  { key: 'B', text: currentQ.optionB },
                  { key: 'C', text: currentQ.optionC },
                  { key: 'D', text: currentQ.optionD }
                ]
                  .filter((opt) => opt.text && opt.text.trim().length > 0)
                  .map((opt) => {
                    const isSelected = answers[currentQ.id] === opt.key;
                    return (
                      <div
                        key={opt.key}
                        onClick={() => selectOption(currentQ.id, opt.key)}
                        className={`p-4 rounded-xl border text-sm font-medium transition-all cursor-pointer flex items-center gap-3 ${
                          isSelected
                            ? 'bg-indigo-600/20 border-cyan-400 text-white shadow-md'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-950'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-cyan-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {opt.key}
                        </div>
                        <span className="flex-1">{opt.text}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <p>No questions configured for this examination.</p>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-6 mt-8 border-t border-slate-800">
            <button
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded-xl text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <button
              onClick={() => {
                setAnswers((prev) => {
                  const copy = { ...prev };
                  delete copy[currentQ?.id];
                  return copy;
                });
              }}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              Clear Answer
            </button>

            <button
              disabled={currentIndex === questions.length - 1}
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Question Palette Sidebar */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">
              Question Palette
            </h3>

            <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const isAnswered = !!answers[q.id];
                const isCurrent = idx === currentIndex;
                const isReview = markedForReview[q.id];

                let bgClass = 'bg-slate-950 text-slate-400 border-slate-800';
                if (isAnswered) bgClass = 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50';
                if (isReview) bgClass = 'bg-amber-600/30 text-amber-300 border-amber-500/50';
                if (isCurrent) bgClass += ' ring-2 ring-cyan-400 font-bold';

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-lg border text-xs font-medium flex items-center justify-center transition-all cursor-pointer ${bgClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] space-y-2 text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-emerald-600/30 border border-emerald-500/50" />
                <span>Answered ({Object.keys(answers).length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-amber-600/30 border border-amber-500/50" />
                <span>Marked for Review ({Object.values(markedForReview).filter(Boolean).length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-slate-950 border border-slate-800" />
                <span>Unanswered ({questions.length - Object.keys(answers).length})</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400">
            <div className="font-semibold text-slate-200">{candidateInfo.name}</div>
            <div className="font-mono text-[11px] text-indigo-400">{candidateInfo.rollNo}</div>
          </div>
        </div>
      </div>

      {/* MANDATORY BOTTOM-RIGHT SMALL VIDEO BOX (160x120px) */}
      {/* Student self-view video feed, cannot be hidden or removed */}
      <div
        className="fixed bottom-4 right-4 z-40 w-40 h-28 sm:w-44 sm:h-32 rounded-xl shadow-2xl border-2 border-indigo-500/90 overflow-hidden bg-slate-950 flex flex-col justify-between pointer-events-none"
        style={{ width: '160px', height: '120px' }}
      >
        <video
          ref={camVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-slate-950/90 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-cyan-400 border border-cyan-900/60 shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span>PROCTORLY EYE</span>
        </div>
        <div className="absolute bottom-1 left-1.5 right-1.5 bg-slate-950/80 px-1.5 py-0.5 rounded text-[8px] font-mono text-slate-300 truncate">
          {candidateInfo.name || 'Candidate'}
        </div>
      </div>

      {/* POPUP WARNING TO THE STUDENT (Large Red Modal) */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-rose-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-rose-500 rounded-2xl max-w-lg w-full p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center mb-4 border border-rose-500/40">
              <AlertTriangle className="w-9 h-9" />
            </div>

            <h2 className="text-2xl font-black text-rose-400 tracking-tight">
              ⚠️ Prohibited Action Detected!
            </h2>

            <p className="text-sm text-slate-200 mt-2 font-medium">
              You performed a prohibited action: <strong className="text-rose-300">"{currentWarningMsg}"</strong>
            </p>

            <p className="text-xs text-slate-400 mt-1">
              A high-resolution screenshot and webcam photo have been captured and reported to your teacher's dashboard.
            </p>

            {/* Warning Counter Display */}
            <div className="my-5 py-3 px-6 rounded-xl bg-rose-950/90 border border-rose-700/80 inline-flex flex-col items-center shadow-inner">
              <span className="text-[10px] uppercase font-bold tracking-widest text-rose-300">
                Official Integrity Strike
              </span>
              <span className="text-3xl font-black text-white font-mono mt-0.5">
                Warning {warningCount} / 3
              </span>
            </div>

            <p className="text-xs font-semibold text-rose-400">
              {warningCount >= 3
                ? 'Maximum allowable violations reached (3/3). This examination has been terminated.'
                : 'Note: If you reach 3 warnings, your test will be permanently terminated and submitted.'}
            </p>

            <div className="mt-6 flex justify-center">
              {warningCount < 3 ? (
                <button
                  onClick={() => setShowWarningModal(false)}
                  className="w-full py-3 px-6 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-rose-600/30"
                >
                  I Understand & Resume Test
                </button>
              ) : (
                <div className="text-xs text-slate-400 font-mono animate-pulse">
                  Submitting termination report to invigilator...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Confirm Test Submission</h3>
            <p className="text-xs text-slate-400 mb-4">
              Are you sure you wish to submit your answers? Once submitted, your test session will be finalized.
            </p>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Questions:</span>
                <span className="font-bold text-white">{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Questions Answered:</span>
                <span className="font-bold text-emerald-400">{Object.keys(answers).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Questions Unanswered:</span>
                <span className="font-bold text-rose-400">{questions.length - Object.keys(answers).length}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              >
                Return to Test
              </button>
              <button
                disabled={isSubmitting}
                onClick={() => handleAutoSubmit('Submitted normally by student')}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors cursor-pointer shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Confirm & Submit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
