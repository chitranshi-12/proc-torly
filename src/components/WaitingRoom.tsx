/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Candidate Examination Waiting Room (White-Theme SaaS Design)
 * Server-Authoritative Examination Start Eligibility & Real-Time Countdown
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Clock, Play, Video, Monitor, AlertCircle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { ExamCoLogo } from './ExamCoLogo';

interface WaitingRoomProps {
  exam: any;
  sessionId: string;
  attemptId?: string;
  candidateInfo: { name: string; rollNo: string };
  mediaStreams: { webcam: MediaStream; screen: MediaStream };
  onStartExam: () => void;
  onBackToEntry?: () => void;
  onBackToChecklist?: () => void;
  isDemo?: boolean;
}

interface StartEligibility {
  canStart: boolean;
  reason?: string;
  code?: string;
  serverTime?: string;
  startTime?: string;
  endTime?: string;
  allowEarlyStart?: boolean;
  timeLeftMs?: number;
  attemptStatus?: string;
  examStatus?: string;
  isAuthorized?: boolean;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  exam,
  sessionId,
  attemptId,
  candidateInfo,
  mediaStreams,
  onStartExam,
  onBackToEntry,
  onBackToChecklist,
  isDemo = false
}) => {
  const targetAttemptId = attemptId || sessionId;
  const [eligibility, setEligibility] = useState<StartEligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(!isDemo);
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const camPreviewRef = useRef<HTMLVideoElement>(null);
  const screenPreviewRef = useRef<HTMLVideoElement>(null);

  // Hook up video streams for candidate preview
  useEffect(() => {
    if (camPreviewRef.current && mediaStreams.webcam) {
      camPreviewRef.current.srcObject = mediaStreams.webcam;
    }
    if (screenPreviewRef.current && mediaStreams.screen) {
      screenPreviewRef.current.srcObject = mediaStreams.screen;
    }
  }, [mediaStreams]);

  // Server-authoritative eligibility query
  const checkEligibility = useCallback(async () => {
    if (isDemo || !targetAttemptId) {
      setLoadingEligibility(false);
      return;
    }

    try {
      const res = await api.getStartEligibility(targetAttemptId);
      if (res) {
        setEligibility(res);
        if (typeof res.timeLeftMs === 'number') {
          setTimeLeftMs(Math.max(0, res.timeLeftMs));
        }
      }
    } catch (err: any) {
      console.warn('Candidate start eligibility check:', err);
    } finally {
      setLoadingEligibility(false);
    }
  }, [isDemo, targetAttemptId]);

  // Initial eligibility check and recurring server poll (every 4 seconds)
  useEffect(() => {
    checkEligibility();

    if (isDemo) return;

    const interval = setInterval(() => {
      checkEligibility();
    }, 4000);

    return () => clearInterval(interval);
  }, [checkEligibility, isDemo]);

  // Smooth local 1-second countdown ticker
  useEffect(() => {
    if (isDemo) return;

    const ticker = setInterval(() => {
      setTimeLeftMs((prev) => {
        if (prev <= 1000) {
          // Time expired; poll server immediately for authorization
          checkEligibility();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [checkEligibility, isDemo]);

  const formatCountdown = (ms: number) => {
    if (ms <= 0) return '00:00:00';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartExam = async () => {
    if (starting) return;

    // Check server authorization if real examination
    if (!isDemo && eligibility && !eligibility.canStart) {
      setError(eligibility.reason || 'The scheduled start time has not arrived yet.');
      return;
    }

    setStarting(true);
    setError(null);

    // Request Fullscreen
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request prompt notice:', err);
    }

    if (!targetAttemptId) {
      setError('Examination attempt not found. Please re-enter your examination code to resume.');
      setStarting(false);
      return;
    }

    try {
      if (!isDemo) {
        // Bounded 8-second timeout race to prevent infinite loading spinner
        const startPromise = api.startExam(targetAttemptId);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out while starting examination. Please retry.')), 8000)
        );
        try {
          await Promise.race([startPromise, timeoutPromise]);
        } catch (apiErr: any) {
          const errMsg = apiErr?.message || '';
          if (
            errMsg.includes('in_progress') ||
            errMsg.includes('already') ||
            errMsg.includes('started') ||
            errMsg.includes('status is already')
          ) {
            // Already started, safe to proceed
          } else {
            throw apiErr;
          }
        }
      }
      onStartExam();
    } catch (err: any) {
      console.error('Failed to start the exam session:', err);
      setError(err instanceof Error ? err.message : 'Could not start the examination. Please retry.');
      // Refresh eligibility state from server
      checkEligibility();
    } finally {
      setStarting(false);
    }
  };

  const isLive = isDemo || Boolean(eligibility?.canStart);
  const isScheduledPending = !isLive && eligibility?.code === 'SCHEDULED_START_PENDING';
  const isHardBlocked = !isLive && eligibility && eligibility.code !== 'SCHEDULED_START_PENDING';

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 selection:bg-indigo-500 selection:text-white">
      {/* Banner */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-200/50 mb-8 text-center relative overflow-hidden">
        <div className="flex justify-center mb-5">
          <ExamCoLogo size="md" theme="light" />
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-4">
          <Clock className="w-3.5 h-3.5 text-indigo-600" />
          <span>Candidate Examination Waiting Room</span>
        </div>

        <h1 className="text-3xl font-black text-slate-900 tracking-tight sm:text-4xl">
          {exam.title}
        </h1>

        <p className="mt-2 text-sm text-slate-600 max-w-2xl mx-auto font-medium">
          Exam Code: <span className="font-mono text-indigo-600 font-bold">{exam.code || exam.examCode}</span> • Duration: <span className="font-bold text-slate-900">{exam.durationMinutes || exam.duration || 60} Minutes</span>
        </p>

        {/* Candidate Details Pill */}
        <div className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-500 font-medium">
          <span>Candidate: <strong className="text-slate-800">{candidateInfo.name}</strong></span>
          <span>•</span>
          <span>Roll No: <strong className="font-mono text-slate-800">{candidateInfo.rollNo}</strong></span>
        </div>

        {/* Dynamic Error / Alert Box */}
        {error && (
          <div className="mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm max-w-lg mx-auto flex flex-col gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium text-left">{error}</span>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-100">
              {onBackToEntry && (
                <button
                  type="button"
                  onClick={onBackToEntry}
                  className="px-3.5 py-1.5 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Return to Portal
                </button>
              )}
              <button
                type="button"
                onClick={checkEligibility}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Re-check Status
              </button>
            </div>
          </div>
        )}

        {/* Hard Blocked Examination (Ended, Concluded, Terminated, Expired, Draft) */}
        {isHardBlocked && (
          <div className="mt-6 p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-sm max-w-lg mx-auto flex flex-col gap-3 shadow-xs">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-left">
                <span className="font-bold block text-slate-900">Examination Not Startable</span>
                <span className="text-xs text-amber-800 mt-0.5 block">
                  {eligibility?.reason || 'This examination attempt cannot be started at this time.'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200">
              {onBackToEntry && (
                <button
                  type="button"
                  onClick={onBackToEntry}
                  className="px-4 py-2 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                >
                  Return to Candidate Portal
                </button>
              )}
            </div>
          </div>
        )}

        {/* Countdown / Start Action */}
        <div className="mt-8">
          {loadingEligibility ? (
            <div className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 py-4">
              <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span>Verifying examination start authorization with server...</span>
            </div>
          ) : isLive ? (
            <div className="inline-flex flex-col items-center">
              <span className="flex items-center gap-2 text-emerald-700 font-bold text-sm uppercase tracking-wider mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                {eligibility?.allowEarlyStart ? 'Early Start Authorized by Invigilator' : 'The Examination Is Live Now'}
              </span>
              <p className="text-xs text-slate-500 mb-6 font-medium">
                Click below to enter fullscreen and begin your authoritative examination timer.
              </p>
              <button
                type="button"
                disabled={starting}
                onClick={handleStartExam}
                className="px-8 py-4 rounded-2xl text-base font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-xl shadow-indigo-600/30 flex items-center gap-3 transition-all cursor-pointer transform hover:scale-105 active:scale-95"
              >
                {starting ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" />
                    <span>Start Proctored Exam (Enter Fullscreen)</span>
                  </>
                )}
              </button>
            </div>
          ) : isScheduledPending ? (
            <div className="inline-block bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-xs max-w-md w-full">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Scheduled Examination Start Window</span>
              </div>
              <div className="text-4xl sm:text-5xl font-mono font-black text-slate-900 tracking-wider my-3">
                {formatCountdown(timeLeftMs)}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-200 flex flex-col items-center">
                <p className="text-xs text-slate-500 mb-4 font-medium text-center leading-relaxed">
                  All candidate proctoring streams and readiness checks are streaming. The examination will automatically unlock at the scheduled start time, or if your invigilator authorizes early start.
                </p>
                <button
                  type="button"
                  disabled={true}
                  className="px-6 py-3 rounded-xl text-sm font-bold text-slate-400 bg-slate-200 border border-slate-300 inline-flex items-center gap-2 cursor-not-allowed opacity-75 shadow-none"
                  title="Scheduled start time pending. Please wait for the timer."
                >
                  <Lock className="w-4 h-4" />
                  <span>Waiting for Scheduled Start Time ({formatCountdown(timeLeftMs)})</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Verification Previews */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <Video className="w-4 h-4 text-indigo-600" />
              <span>Candidate Camera Feed</span>
            </span>
            <span className="text-xs text-emerald-600 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Streaming
            </span>
          </div>
          <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative">
            <video
              ref={camPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-indigo-600" />
              <span>Full Desktop Screen Share</span>
            </span>
            <span className="text-xs text-emerald-600 flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Streaming
            </span>
          </div>
          <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative">
            <video
              ref={screenPreviewRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* DPDP Act 2023 Proctoring Disclosure */}
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
        <div className="inline-flex items-center gap-2 text-xs text-slate-600 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Encrypted Proctoring Feed Active • DPDP Act 2023 Digital Assessment Protected</span>
        </div>
      </div>
    </div>
  );
};
