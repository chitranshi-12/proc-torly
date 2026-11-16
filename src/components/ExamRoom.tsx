/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Student Test Screen (ExamRoom - White-Theme SaaS Redesign)
 * Features:
 * - Mandatory Fullscreen enforcement
 * - Small 160x120px live webcam box in bottom-right corner (un-hideable self-view)
 * - 10 Cheating Detections with immediate evidence capture
 * - Red Warning Popup to student with strike counter (Warning 1/3, 2/3, 3/3)
 * - Auto-termination at 3 warnings or via teacher remote action
 * - Resilient autosaving using authoritative attemptId
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
  CheckCircle2,
  Maximize,
  XCircle,
  Award
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { firebaseExamService, Question } from '../services/firebaseExamService';
import { demoService } from '../services/demoService';
import { FirebaseWebRTCManager } from '../services/firebaseWebRTC';
import { api } from '../services/api';
import { getSocket } from '../services/socketService';
import { ExamCoLogo } from './ExamCoLogo';

interface ExamRoomProps {
  sessionId: string;
  attemptId?: string;
  exam: any;
  candidateInfo: { name: string; rollNo: string; email: string; institute?: string };
  mediaStreams: { webcam: MediaStream; screen: MediaStream };
  onFinished: (resultData: any) => void;
  isDemo?: boolean;
}

const ShortAnswerBox: React.FC<{
  questionId: string;
  initialValue: string;
  onAnswerChange: (val: string) => void;
}> = ({ questionId, initialValue, onAnswerChange }) => {
  const [val, setVal] = useState(initialValue);

  useEffect(() => {
    setVal(initialValue);
  }, [questionId, initialValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setVal(newVal);
    onAnswerChange(newVal);
  };

  const wordCount = (val || '').trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
          Type Your Response
        </label>
        <span className="text-[11px] font-mono text-slate-400">
          Auto-saved as you type
        </span>
      </div>
      <textarea
        rows={6}
        value={val}
        onChange={handleChange}
        placeholder="Type your detailed short-answer response here..."
        className="w-full p-4 rounded-2xl border-2 border-slate-200 focus:border-indigo-600 focus:outline-hidden text-sm font-medium text-slate-900 placeholder:text-slate-400 bg-white transition-all resize-y shadow-xs"
      />
      <div className="flex justify-between items-center text-xs text-slate-500">
        <span>Words: {wordCount}</span>
        <span
          className={
            val.trim().length > 0
              ? 'text-emerald-700 font-semibold'
              : 'text-slate-400'
          }
        >
          {val.trim().length > 0 ? '✓ Response entered' : 'Response required'}
        </span>
      </div>
    </div>
  );
};

export const ExamRoom: React.FC<ExamRoomProps> = ({
  sessionId,
  attemptId,
  exam,
  candidateInfo,
  mediaStreams,
  onFinished,
  isDemo = false
}) => {
  const targetAttemptId = attemptId || sessionId;

  // Normalize questions format (handles both array of options and optionA/B/C/D)
  const [questions, setQuestions] = useState<any[]>(() => {
    return (exam.questions || []).map((q: any, idx: number) => {
      const optionsList = Array.isArray(q.options) && q.options.length > 0
        ? q.options
        : [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean);

      return {
        id: q.id || `q_${idx + 1}`,
        type: q.type || 'mcq',
        question: q.question,
        options: optionsList,
        optionA: optionsList[0] || q.optionA || '',
        optionB: optionsList[1] || q.optionB || '',
        optionC: optionsList[2] || q.optionC || '',
        optionD: optionsList[3] || q.optionD || '',
        marks: Number(q.marks) || 1
      };
    });
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});

  const durationMinutes = Number(exam.duration || exam.durationMinutes || 60);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(durationMinutes * 60);
  const [lastSavedTime, setLastSavedTime] = useState<string>('Just now');
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

  // Fullscreen and Screen Sharing state & recovery
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isScreenSharingActive, setIsScreenSharingActive] = useState(true);
  const [screenRecoveryError, setScreenRecoveryError] = useState<string | null>(null);

  // Refs
  const camVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<FirebaseWebRTCManager | null>(null);
  const lastViolationTimeRef = useRef<number>(0);
  const idleTimerRef = useRef<any>(null);
  const isSubmittingRef = useRef(false);

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

    const examIdentifier = exam.id || exam._id || 'exam';
    const signalingKey = targetAttemptId || sessionId;

    try {
      const webrtc = new FirebaseWebRTCManager(signalingKey, 'student', undefined, examIdentifier);
      if (mediaStreams.screen) webrtc.addLocalStream(mediaStreams.screen);
      if (mediaStreams.webcam) webrtc.addLocalStream(mediaStreams.webcam);
      webrtc.listenAndAnswer();
      webrtcRef.current = webrtc;
    } catch (e) {
      console.warn('WebRTC signaling note:', e);
    }

    // Helper to capture lightweight stream frame snapshots
    const captureStreamThumbnails = () => {
      let camDataUrl = '';
      let screenDataUrl = '';

      if (camVideoRef.current && camVideoRef.current.readyState >= 2) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = 180;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(camVideoRef.current, 0, 0, 240, 180);
            camDataUrl = canvas.toDataURL('image/jpeg', 0.5);
          }
        } catch (_) {}
      }

      if (screenVideoRef.current && screenVideoRef.current.readyState >= 2) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 480;
          canvas.height = 270;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(screenVideoRef.current, 0, 0, 480, 270);
            screenDataUrl = canvas.toDataURL('image/jpeg', 0.5);
          }
        } catch (_) {}
      }

      return { camDataUrl, screenDataUrl };
    };

    // Continuous real-time frame streaming over Socket.IO to guarantee zero blackout in teacher console
    const streamInterval = setInterval(() => {
      if (isDemo || isSubmittingRef.current) return;
      const { camDataUrl, screenDataUrl } = captureStreamThumbnails();
      if (camDataUrl || screenDataUrl) {
        const socket = getSocket();
        socket.emit('candidate:stream_frame', {
          examId: examIdentifier,
          attemptId: signalingKey,
          studentId: candidateInfo.rollNo || sessionId,
          camDataUrl,
          screenDataUrl,
          timestamp: Date.now()
        });
      }
    }, 2500);

    const screenTrack = mediaStreams.screen?.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.onended = () => {
        setIsScreenSharingActive(false);
        if (!isDemo) {
          api.recordIncident({
            examId: exam.id || exam._id,
            attemptId: targetAttemptId,
            studentId: candidateInfo.rollNo || sessionId,
            studentName: candidateInfo.name,
            incidentType: 'SCREEN_SHARE_STOPPED',
            severity: 'MEDIUM',
            metadata: { description: 'Screen sharing was stopped or disconnected.' }
          }).catch(() => {});
        }
      };
    }

    return () => {
      clearInterval(streamInterval);
      if (webrtcRef.current) webrtcRef.current.close();
    };
  }, [mediaStreams, sessionId, targetAttemptId, exam.id, exam._id, candidateInfo, isDemo]);

  // Authoritative Attempt Synchronization & Expiry Check
  useEffect(() => {
    if (!targetAttemptId || isDemo) return;

    let isSubscribed = true;
    const attemptPromise = api.getAttempt(targetAttemptId);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Attempt reconciliation timeout')), 6000)
    );

    Promise.race([attemptPromise, timeoutPromise])
      .then(({ attempt }: any) => {
        if (!isSubscribed || !attempt) return;

        // If attempt is already terminated, submitted, or expired, immediately finish
        if (attempt.status === 'terminated' || attempt.status === 'submitted' || attempt.status === 'expired') {
          handleAutoSubmit(attempt.terminationReason || `Examination status is ${attempt.status}.`);
          return;
        }

        // Reconcile authoritative remaining time from server expiresAt
        if (attempt.expiresAt) {
          const expiresAtMs = new Date(attempt.expiresAt).getTime();
          const serverRemainingSecs = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
          setRemainingSeconds(serverRemainingSecs);
          if (serverRemainingSecs <= 0) {
            handleAutoSubmit('Time Expired');
            return;
          }
        }

        // Reconcile previously autosaved answers and review flags
        if (attempt.answers && typeof attempt.answers === 'object') {
          const restoredAnswers: Record<string, any> = {};
          if (attempt.answers instanceof Map) {
            attempt.answers.forEach((v: any, k: string) => { restoredAnswers[k] = v; });
          } else {
            Object.entries(attempt.answers).forEach(([k, v]) => { restoredAnswers[k] = v; });
          }
          setAnswers((prev) => ({ ...restoredAnswers, ...prev }));
        }

        if (attempt.markedForReview && typeof attempt.markedForReview === 'object') {
          const restoredReview: Record<string, boolean> = {};
          if (attempt.markedForReview instanceof Map) {
            attempt.markedForReview.forEach((v: any, k: string) => { restoredReview[k] = Boolean(v); });
          } else {
            Object.entries(attempt.markedForReview).forEach(([k, v]) => { restoredReview[k] = Boolean(v); });
          }
          setMarkedForReview((prev) => ({ ...restoredReview, ...prev }));
        }
      })
      .catch((err) => {
        console.warn('Initial attempt reconciliation note:', err);
      });

    return () => {
      isSubscribed = false;
    };
  }, [targetAttemptId, isDemo]);

  // Clean up media tracks on unmount
  useEffect(() => {
    return () => {
      if (mediaStreams) {
        try {
          mediaStreams.webcam?.getTracks().forEach((t) => t.stop());
          mediaStreams.screen?.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }
    };
  }, [mediaStreams]);

  // Action to recover screen sharing if ended
  const handleResumeScreenShare = async () => {
    setScreenRecoveryError(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' } as any,
        audio: false
      });

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings() as any;

      if (settings.displaySurface && settings.displaySurface !== 'monitor' && settings.displaySurface !== 'screen') {
        videoTrack.stop();
        setScreenRecoveryError('Security Notice: You must select "Entire Screen" (not a window or tab) to resume your examination.');
        return;
      }

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }

      videoTrack.onended = () => {
        setIsScreenSharingActive(false);
        if (!isDemo) {
          api.recordIncident({
            examId: exam.id || exam._id,
            attemptId: targetAttemptId,
            studentId: candidateInfo.rollNo || sessionId,
            studentName: candidateInfo.name,
            incidentType: 'SCREEN_SHARE_STOPPED',
            severity: 'MEDIUM',
            metadata: { description: 'Screen sharing was stopped or disconnected.' }
          }).catch(() => {});
        }
      };

      if (webrtcRef.current) {
        webrtcRef.current.addLocalStream(stream);
      }

      setIsScreenSharingActive(true);

      if (!isDemo) {
        api.recordIncident({
          examId: exam.id || exam._id,
          attemptId: targetAttemptId,
          studentId: candidateInfo.rollNo || sessionId,
          studentName: candidateInfo.name,
          incidentType: 'SCREEN_SHARE_RESUMED',
          severity: 'LOW',
          metadata: { description: 'Screen sharing successfully re-established by candidate.' }
        }).catch(() => {});
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setScreenRecoveryError('Screen sharing prompt was cancelled. Please click Resume Screen Sharing and choose Entire Screen to proceed.');
      } else {
        setScreenRecoveryError(err.message || 'Could not restart screen share. Please try again.');
      }
    }
  };

  // Action to restore Fullscreen
  const handleReEnterFullscreen = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn('Re-enter fullscreen note:', err);
    }
  };

  // Remote termination listener
  useEffect(() => {
    let unsubFirebase = () => {};
    try {
      unsubFirebase = firebaseExamService.subscribeSession(sessionId, (sess) => {
        if (sess && (sess.status === 'terminated' || sess.isTerminated) && !isSubmittingRef.current) {
          handleRemoteTermination(sess.terminationReason || 'Test terminated by invigilator');
        }
      });
    } catch {}

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

  // Capture Evidence Helper
  const captureEvidence = async (): Promise<{ screenUrl: string; camUrl: string }> => {
    let screenUrl = '';
    let camUrl = '';

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

  // Cheating Violation Handler
  const handleTriggerViolation = useCallback(
    async (type: string, description: string) => {
      if (isSubmittingRef.current) return;

      // Filter out non-cheating signals: MOUSE_LEAVE and WINDOW_BLUR never cause strikes
      const normalizedType = (type || '').toUpperCase();
      if (
        normalizedType.includes('MOUSE_LEAVE') ||
        normalizedType.includes('MOUSELEAVE') ||
        normalizedType.includes('WINDOW_BLUR') ||
        normalizedType.includes('BLUR')
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastViolationTimeRef.current < 2500) return;
      lastViolationTimeRef.current = now;

      setWarningCount((prevCount) => {
        const newCount = prevCount + 1;
        setCurrentWarningMsg(description);
        setCurrentWarningType(type);
        setShowWarningModal(true);

        captureEvidence().then(({ screenUrl, camUrl }) => {
          const payload = {
            sessionId,
            examId: exam.id || exam._id,
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

          demoService.addViolation(payload);
          if (!isDemo) {
            // Persist genuine incident into real MongoDB
            api.recordIncident({
              examId: exam.id || exam._id,
              attemptId: targetAttemptId,
              studentId: candidateInfo.rollNo || sessionId,
              studentName: candidateInfo.name,
              incidentType: type,
              severity: newCount >= 3 ? 'CRITICAL' : 'HIGH',
              metadata: {
                description: `${description} (Warning ${newCount}/3)`,
                warningCount: newCount,
                screenUrl,
                camUrl
              }
            }).catch((err) => console.warn('Failed to save proctoring evidence to MongoDB:', err));

            firebaseExamService
              .recordViolation(sessionId, { ...payload, count: newCount })
              .catch((error) => console.warn('Failed to save proctoring evidence:', error));
          }
        });

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
    [sessionId, targetAttemptId, exam.id, exam._id, candidateInfo, isDemo]
  );

  // Setup Detection Listeners
  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);
      if (!inFullscreen && !isDemo) {
        api.recordIncident({
          examId: exam.id || exam._id,
          attemptId: targetAttemptId,
          studentId: candidateInfo.rollNo || sessionId,
          studentName: candidateInfo.name,
          incidentType: 'FULLSCREEN_EXIT',
          severity: 'LOW',
          metadata: { description: 'Candidate temporarily exited fullscreen.' }
        }).catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      // Trigger ONLY when the page/tab is genuinely hidden (switched tabs or minimized window)
      // Native Chrome screen-sharing indicator interactions keep document.visibilityState === 'visible'
      if (document.visibilityState === 'hidden') {
        handleTriggerViolation('TAB_SWITCH', 'Switched browser tabs or minimized test window.');
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      handleTriggerViolation('RIGHT_CLICK', 'Right-click context menu is blocked and flagged.');
    };

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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'F12 Developer Tools shortcut blocked.');
        return;
      }
      if (e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key)) {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'Developer Tools inspection shortcut blocked.');
        return;
      }
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'View Source shortcut (Ctrl+U) blocked.');
        return;
      }
      if (e.key === 'PrintScreen') {
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'PrintScreen key action intercepted.');
        return;
      }
      if (e.key === 'Meta' || e.metaKey) {
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'System navigation key (Windows/Cmd) pressed.');
        return;
      }
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        handleTriggerViolation('KEYBOARD_SHORTCUT', 'Alt+Tab window switching shortcut intercepted.');
        return;
      }
      if (e.ctrlKey && ['c', 'v', 'x', 'C', 'V', 'X'].includes(e.key)) {
        e.preventDefault();
        handleTriggerViolation('CLIPBOARD_ACTION', `Clipboard shortcut (Ctrl+${e.key.toUpperCase()}) blocked.`);
        return;
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('cut', handleCut);
    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('cut', handleCut);
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleTriggerViolation, isDemo, exam.id, exam._id, targetAttemptId, candidateInfo, sessionId]);

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
  }, []);

  // Real-time Socket.IO Connection & Heartbeats
  useEffect(() => {
    const socket = getSocket();
    const examIdentifier = exam.id || exam._id || 'exam';

    socket.emit('exam:join', {
      examId: examIdentifier,
      attemptId: targetAttemptId,
      studentId: candidateInfo.rollNo,
      studentName: candidateInfo.name,
      rollNo: candidateInfo.rollNo
    });

    const onWarning = (data: any) => {
      setWarningCount((c) => c + 1);
      setCurrentWarningMsg(data.message || 'Warning from Invigilator');
      setCurrentWarningType('Invigilator Warning');
      setShowWarningModal(true);
    };

    const onTimeAdded = (data: any) => {
      const added = (Number(data.minutes) || 5) * 60;
      setRemainingSeconds((prev) => prev + added);
    };

    const onTerminated = (data: any) => {
      setIsTerminated(true);
      setTerminationReason(data.reason || 'Terminated by Invigilator');
      handleAutoSubmit('Terminated by Invigilator');
    };

    socket.on('student:warning_received', onWarning);
    socket.on('student:time_added', onTimeAdded);
    socket.on('student:exam_terminated', onTerminated);

    const heartbeatTimer = setInterval(() => {
      const answeredTotal = Object.keys(answers).length;
      socket.emit('candidate:heartbeat', {
        examId: examIdentifier,
        attemptId: targetAttemptId,
        studentId: candidateInfo.rollNo,
        answeredCount: answeredTotal,
        progressPercent: questions.length > 0 ? Math.round((answeredTotal / questions.length) * 100) : 0
      });
    }, 12000);

    return () => {
      clearInterval(heartbeatTimer);
      socket.off('student:warning_received', onWarning);
      socket.off('student:time_added', onTimeAdded);
      socket.off('student:exam_terminated', onTerminated);
    };
  }, [targetAttemptId, exam?.id, answers, questions.length]);

  // Immediate Debounced Autosave (1200ms) on any answer modification + 10s periodic sync
  useEffect(() => {
    if (!targetAttemptId || isDemo) return;

    const debouncedTimer = setTimeout(async () => {
      try {
        setIsSaving(true);
        await api.saveAnswers(targetAttemptId, answers, markedForReview);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(timeStr);
      } catch (err) {
        console.warn('Debounced autosave note:', err);
      } finally {
        setIsSaving(false);
      }
    }, 1200);

    return () => clearTimeout(debouncedTimer);
  }, [answers, markedForReview, targetAttemptId, isDemo]);

  // Cloud Autosave every 10 seconds
  useEffect(() => {
    const autosaveTimer = setInterval(async () => {
      try {
        setIsSaving(true);
        if (!isDemo) {
          try {
            await api.saveAnswers(targetAttemptId, answers, markedForReview);
          } catch {
            await firebaseExamService.autosaveSessionAnswers(targetAttemptId, answers);
          }
        }
        demoService.recordStudentAnswer(targetAttemptId, answers);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLastSavedTime(timeStr);
      } catch (err) {
        console.warn('Autosave sync note:', err);
        setLastSavedTime('Saved locally');
      } finally {
        setIsSaving(false);
      }
    }, 10000);

    return () => clearInterval(autosaveTimer);
  }, [targetAttemptId, answers, markedForReview, isDemo]);

  // Submission handler
  const handleAutoSubmit = async (reason?: string) => {
    if (isSubmittingRef.current) return;
    setIsSubmitting(true);

    try {
      // Release camera and screen tracks immediately on submission/termination
      if (mediaStreams) {
        try {
          mediaStreams.webcam?.getTracks().forEach((t) => t.stop());
          mediaStreams.screen?.getTracks().forEach((t) => t.stop());
        } catch (_) {}
      }

      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }

      const isTerm = Boolean(isTerminated || warningCount >= 3 || reason?.toLowerCase().includes('terminat'));
      let finalResult: any;

      if (isDemo) {
        const result = demoService.submitStudentExam(targetAttemptId, answers, questions);
        finalResult = {
          ...result,
          score: result.scoredMarks,
          status: isTerm ? 'terminated' : 'submitted',
          terminationReason: reason || (isTerm ? 'Exceeded maximum allowed integrity warnings (3/3)' : undefined),
          terminationSource: reason?.toLowerCase().includes('invigilator') ? 'invigilator' : 'automated_rule',
          terminatedAt: isTerm ? new Date().toISOString() : undefined,
          reviewStatus: isTerm ? 'pending_review' : 'none',
          gradingOutcome: isTerm ? 'withheld' : 'evaluated'
        };
      } else {
        try {
          if (isTerm) {
            finalResult = await api.terminateExam(targetAttemptId, {
              reason: reason || (warningCount >= 3 ? `Exceeded maximum allowed integrity warnings (3/3 - Last violation: ${currentWarningType || 'INTEGRITY_BREACH'})` : 'Examination terminated'),
              source: reason?.toLowerCase().includes('invigilator') ? 'invigilator' : 'automated_rule',
              examId: exam.id || exam._id
            });
          } else {
            finalResult = await api.submitExam(targetAttemptId, { answers, terminated: false });
          }
        } catch (apiErr) {
          finalResult = await firebaseExamService.submitExamSession(targetAttemptId, answers, isTerm);
        }
      }

      try {
        getSocket().emit('attempt:submitted', {
          attemptId: targetAttemptId,
          examId: exam.id || exam._id,
          studentName: candidateInfo.name
        });
      } catch {}

      onFinished({
        ...finalResult,
        attemptId: targetAttemptId,
        status: finalResult.status || (isTerm ? 'terminated' : 'submitted'),
        terminationReason: finalResult.terminationReason || reason || (isTerm ? 'Terminated under examination rule' : undefined),
        terminationSource: finalResult.terminationSource || (reason?.toLowerCase().includes('invigilator') ? 'invigilator' : 'automated_rule'),
        terminatedAt: finalResult.terminatedAt || (isTerm ? new Date().toISOString() : undefined),
        reviewStatus: finalResult.reviewStatus || (isTerm ? 'pending_review' : 'none'),
        gradingOutcome: finalResult.gradingOutcome || (isTerm ? 'withheld' : 'evaluated'),
        riskScore: finalResult.riskScore,
        score: finalResult.score,
        totalMarks: finalResult.totalMarks,
        incidentCount: finalResult.incidentCount,
        warningCount
      });
    } catch (err: any) {
      alert(err.message || 'Error submitting exam');
      setIsSubmitting(false);
    }
  };

  const selectOption = (questionId: string, optionKey: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionKey
    }));
  };

  const toggleMultiOption = (questionId: string, optionKey: string) => {
    setAnswers((prev) => {
      const current = prev[questionId];
      let selected: string[] = [];
      if (Array.isArray(current)) {
        selected = [...current];
      } else if (typeof current === 'string' && current.length > 0) {
        selected = current.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
      }

      if (selected.includes(optionKey)) {
        selected = selected.filter((k) => k !== optionKey);
      } else {
        selected.push(optionKey);
      }
      selected.sort();

      return {
        ...prev,
        [questionId]: selected
      };
    });
  };

  const isQuestionAnswered = (qId: string) => {
    const ans = answers[qId];
    if (Array.isArray(ans)) return ans.length > 0;
    return ans !== undefined && ans !== null && String(ans).trim().length > 0;
  };

  const toggleMarkForReview = (questionId: string) => {
    setMarkedForReview((prev) => ({
      ...prev,
      [questionId]: !prev[questionId]
    }));
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '00:00';
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
    <div id="exam-root" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col select-none relative font-sans">
      {/* Hidden element for screen capture */}
      <video ref={screenVideoRef} autoPlay playsInline muted className="hidden" />

      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <ExamCoLogo size="sm" theme="light" />
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="font-bold text-sm text-slate-900 max-w-[200px] sm:max-w-xs truncate">{exam.title}</span>
          <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200 hidden sm:inline-block">
            {exam.code || exam.examCode}
          </span>
          {warningCount > 0 && (
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
              Warnings: {warningCount}/3
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* Network indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {isOnline ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1 text-[11px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Wifi className="w-3.5 h-3.5 text-emerald-600" /> Online
              </span>
            ) : (
              <span className="text-amber-700 font-semibold flex items-center gap-1 text-[11px] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 animate-pulse">
                <WifiOff className="w-3.5 h-3.5 text-amber-600" /> Offline Sync
              </span>
            )}
          </div>

          {/* Cloud Autosave Indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500">
            <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin text-indigo-600' : 'text-slate-400'}`} />
            <span className="text-[11px] font-mono">Autosaved {lastSavedTime}</span>
          </div>

          {/* Timer */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-mono text-sm font-bold border ${
              isTimerCritical
                ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
                : 'bg-slate-100 border-slate-200 text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>{formatTime(remainingSeconds)}</span>
          </div>

          {/* Submit Exam Button */}
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Finish Test</span>
          </button>
        </div>
      </header>

      {/* Fullscreen Restoration Banner */}
      {!isFullscreen && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3">
          <div className="bg-amber-50 border border-amber-300 p-3 rounded-2xl flex items-center justify-between text-xs text-amber-900 shadow-sm animate-pulse">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span><strong>Fullscreen Mode Inactive:</strong> Examination rules recommend fullscreen mode for maximum integrity.</span>
            </div>
            <button
              type="button"
              onClick={handleReEnterFullscreen}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
            >
              Restore Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* Main Examination Question Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Question Card */}
        <div className="lg:col-span-3 flex flex-col justify-between bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm">
          {currentQ ? (
            <div>
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-xs">
                    Question {currentIndex + 1} of {questions.length}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">({currentQ.marks || 1} Mark{currentQ.marks > 1 ? 's' : ''})</span>
                </div>

                <button
                  type="button"
                  onClick={() => toggleMarkForReview(currentQ.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    markedForReview[currentQ.id]
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{markedForReview[currentQ.id] ? 'Marked for Review' : 'Mark for Review'}</span>
                </button>
              </div>

              <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed mb-8">
                {currentQ.question}
              </h2>

              {currentQ.type === 'multiple_select' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl w-fit">
                    <span>Multiple Select: Choose all options that apply.</span>
                  </div>
                  {[
                    { key: 'A', text: currentQ.optionA || currentQ.options?.[0] },
                    { key: 'B', text: currentQ.optionB || currentQ.options?.[1] },
                    { key: 'C', text: currentQ.optionC || currentQ.options?.[2] },
                    { key: 'D', text: currentQ.optionD || currentQ.options?.[3] }
                  ]
                    .filter((opt) => opt.text && String(opt.text).trim().length > 0)
                    .map((opt) => {
                      const curVal = answers[currentQ.id];
                      const selectedKeys = Array.isArray(curVal)
                        ? curVal
                        : typeof curVal === 'string' && curVal.length > 0
                        ? curVal.split(',').map((s) => s.trim().toUpperCase())
                        : [];
                      const isSelected = selectedKeys.includes(opt.key);

                      return (
                        <div
                          key={opt.key}
                          onClick={() => toggleMultiOption(currentQ.id, opt.key)}
                          className={`p-4 rounded-2xl border-2 text-sm font-medium transition-all cursor-pointer flex items-center gap-3.5 ${
                            isSelected
                              ? 'bg-indigo-50/80 border-indigo-600 text-indigo-950 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
                              isSelected
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-slate-100 border-slate-300 text-slate-600'
                            }`}
                          >
                            {isSelected ? '✓' : opt.key}
                          </div>
                          <span className="flex-1 leading-snug">{opt.text}</span>
                        </div>
                      );
                    })}
                </div>
              ) : currentQ.type === 'short_answer' ||
              (!currentQ.options?.length && !currentQ.optionA && !currentQ.optionB) ? (
                <ShortAnswerBox
                  key={currentQ.id}
                  questionId={currentQ.id}
                  initialValue={typeof answers[currentQ.id] === 'string' ? answers[currentQ.id] : ''}
                  onAnswerChange={(val) => {
                    setAnswers((prev) => ({
                      ...prev,
                      [currentQ.id]: val
                    }));
                  }}
                />
              ) : currentQ.type === 'mcq' ? (
                <div className="space-y-3">
                  {[
                    { key: 'A', text: currentQ.optionA || currentQ.options?.[0] },
                    { key: 'B', text: currentQ.optionB || currentQ.options?.[1] },
                    { key: 'C', text: currentQ.optionC || currentQ.options?.[2] },
                    { key: 'D', text: currentQ.optionD || currentQ.options?.[3] }
                  ]
                    .filter((opt) => opt.text && String(opt.text).trim().length > 0)
                    .map((opt) => {
                      const isSelected = answers[currentQ.id] === opt.key;
                      return (
                        <div
                          key={opt.key}
                          onClick={() => selectOption(currentQ.id, opt.key)}
                          className={`p-4 rounded-2xl border-2 text-sm font-medium transition-all cursor-pointer flex items-center gap-3.5 ${
                            isSelected
                              ? 'bg-indigo-50/80 border-indigo-600 text-indigo-950 font-bold shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {opt.key}
                          </div>
                          <span className="flex-1 leading-snug">{opt.text}</span>
                        </div>
                      );
                    })}
                </div>
              ) : (
                /* Unsupported question type graceful fallback */
                <div className="space-y-4 p-5 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Standard Question Format ({currentQ.type})
                  </div>
                  <ShortAnswerBox
                    key={currentQ.id}
                    questionId={currentQ.id}
                    initialValue={typeof answers[currentQ.id] === 'string' ? answers[currentQ.id] : ''}
                    onAnswerChange={(val) => {
                      setAnswers((prev) => ({
                        ...prev,
                        [currentQ.id]: val
                      }));
                    }}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 font-medium">
              <p>No questions configured for this examination.</p>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-6 mt-8 border-t border-slate-100">
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAnswers((prev) => {
                  const copy = { ...prev };
                  delete copy[currentQ?.id];
                  return copy;
                });
              }}
              className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
            >
              Clear Answer
            </button>

            <button
              type="button"
              disabled={currentIndex === questions.length - 1}
              onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Question Palette Sidebar */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
              Question Palette
            </h3>

            <div className="grid grid-cols-5 gap-2 max-h-72 overflow-y-auto pr-1">
              {questions.map((q, idx) => {
                const isAnswered = isQuestionAnswered(q.id);
                const isCurrent = idx === currentIndex;
                const isReview = markedForReview[q.id];

                let bgClass = 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100';
                if (isAnswered) bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
                if (isReview) bgClass = 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
                if (isCurrent) bgClass += ' ring-2 ring-indigo-600 font-black';

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-9 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${bgClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-[11px] space-y-2 text-slate-600 font-medium">
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-emerald-50 border border-emerald-300" />
                <span>Answered ({questions.filter((q) => isQuestionAnswered(q.id)).length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-amber-50 border border-amber-300" />
                <span>Marked for Review ({Object.values(markedForReview).filter(Boolean).length})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded bg-slate-50 border border-slate-200" />
                <span>Unanswered ({questions.length - Object.keys(answers).length})</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-xs">
            <div className="font-bold text-slate-900">{candidateInfo.name}</div>
            <div className="font-mono text-[11px] text-indigo-600 font-semibold">{candidateInfo.rollNo}</div>
          </div>
        </div>
      </div>

      {/* Floating Picture-In-Picture Webcam Feed (160x120px) */}
      <div
        className="fixed bottom-4 right-4 z-40 w-40 h-28 sm:w-44 sm:h-32 rounded-2xl shadow-2xl border-2 border-indigo-600 overflow-hidden bg-slate-950 flex flex-col justify-between pointer-events-none"
        style={{ width: '160px', height: '120px' }}
      >
        <video
          ref={camVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover transform -scale-x-100"
        />
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-slate-900/90 px-2 py-0.5 rounded-full text-[9px] font-mono font-bold text-indigo-300 border border-indigo-500/30 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>PROCTORLY</span>
        </div>
        <div className="absolute bottom-1 left-1.5 right-1.5 bg-slate-900/80 px-1.5 py-0.5 rounded text-[8px] font-mono text-slate-200 truncate">
          {candidateInfo.name || 'Candidate'}
        </div>
      </div>

      {/* Warning Modal */}
      {showWarningModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-500 rounded-3xl max-w-lg w-full p-6 sm:p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 mx-auto flex items-center justify-center mb-4 border border-rose-200">
              <AlertTriangle className="w-9 h-9" />
            </div>

            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Prohibited Action Intercepted
            </h2>

            <p className="text-sm text-slate-700 mt-2 font-medium">
              You performed a prohibited action: <strong className="text-rose-600">"{currentWarningMsg}"</strong>
            </p>

            <p className="text-xs text-slate-500 mt-1">
              A high-resolution screenshot and webcam frame have been reported to your invigilator's dashboard.
            </p>

            <div className="my-5 py-3 px-6 rounded-2xl bg-rose-50 border border-rose-200 inline-flex flex-col items-center">
              <span className="text-[10px] uppercase font-bold tracking-widest text-rose-700">
                Official Integrity Strike
              </span>
              <span className="text-3xl font-black text-rose-700 font-mono mt-0.5">
                Warning {warningCount} / 3
              </span>
            </div>

            <p className="text-xs font-semibold text-rose-600">
              {warningCount >= 3
                ? 'Maximum allowable violations reached (3/3). This examination has been terminated.'
                : 'Note: If you reach 3 warnings, your examination will be terminated and submitted immediately.'}
            </p>

            <div className="mt-6 flex justify-center">
              {warningCount < 3 ? (
                <button
                  type="button"
                  onClick={() => setShowWarningModal(false)}
                  className="w-full py-3.5 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-rose-600/30"
                >
                  I Understand & Resume Test
                </button>
              ) : (
                <div className="text-xs text-slate-500 font-mono animate-pulse">
                  Submitting termination report to invigilator...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manual Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-slate-200/90 p-6 sm:p-8 rounded-3xl shadow-2xl">
            <h3 className="text-xl font-black text-slate-900 mb-2">Confirm Test Submission</h3>
            <p className="text-xs text-slate-600 mb-5">
              Are you sure you wish to submit your answers? Once submitted, your examination attempt will be finalized and evaluated.
            </p>

            <div className="bg-slate-50 p-4.5 rounded-2xl border border-slate-200 mb-6 text-xs space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-600 font-medium">Total Questions:</span>
                <span className="font-bold text-slate-900">{questions.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-medium">Questions Answered:</span>
                <span className="font-bold text-emerald-700">{Object.keys(answers).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-medium">Questions Unanswered:</span>
                <span className="font-bold text-rose-700">{questions.length - Object.keys(answers).length}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
              >
                Return to Test
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleAutoSubmit('Submitted normally by student')}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-all cursor-pointer shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 active:scale-95"
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

      {/* Screen Sharing Recovery Modal */}
      {!isScreenSharingActive && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-indigo-600 rounded-3xl max-w-md w-full p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-4 border border-indigo-200">
              <Monitor className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Screen Sharing Paused</h2>
            <p className="text-xs text-slate-600 mt-2">
              Screen sharing has stopped or was disconnected. Continuous desktop screen sharing is mandatory to complete this examination.
            </p>
            <div className="mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 text-left">
              Click below, select <strong>Entire Screen</strong> in the browser prompt, and click Share to resume.
            </div>
            {screenRecoveryError && (
              <p className="text-xs text-rose-600 mt-2 font-medium">{screenRecoveryError}</p>
            )}
            <button
              type="button"
              onClick={handleResumeScreenShare}
              className="mt-6 w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md active:scale-95"
            >
              Resume Screen Sharing
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
