import React, { useState, useEffect } from 'react';
import { Clock, Play, Video, Monitor, AlertCircle, CheckCircle2 } from 'lucide-react';
import { firebaseExamService } from '../services/firebaseExamService';
import { ProctorlyLogo } from './ProctorlyLogo';

interface WaitingRoomProps {
  exam: any;
  sessionId: string;
  candidateInfo: { name: string; rollNo: string };
  mediaStreams: { webcam: MediaStream; screen: MediaStream };
  onStartExam: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({
  exam,
  sessionId,
  candidateInfo,
  mediaStreams,
  onStartExam
}) => {
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);
  const [isLive, setIsLive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const camPreviewRef = React.useRef<HTMLVideoElement>(null);
  const screenPreviewRef = React.useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (camPreviewRef.current && mediaStreams.webcam) {
      camPreviewRef.current.srcObject = mediaStreams.webcam;
    }
    if (screenPreviewRef.current && mediaStreams.screen) {
      screenPreviewRef.current.srcObject = mediaStreams.screen;
    }
  }, [mediaStreams]);

  useEffect(() => {
    const startTimeMs = new Date(exam.startTime).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = startTimeMs - now;
      if (diff <= 0) {
        setTimeLeftMs(0);
        setIsLive(true);
      } else {
        setTimeLeftMs(diff);
        setIsLive(false);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [exam.startTime]);

  const formatCountdown = (ms: number) => {
    if (ms <= 0) return '00:00:00';
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartExam = async () => {
    setStarting(true);
    setError(null);

    // Request Fullscreen
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('Fullscreen request prompt notice:', err);
    }

    try {
      try {
        await firebaseExamService.startExamSession(sessionId);
      } catch (fbErr) {
        console.warn('Firebase session start fallback to demo engine:', fbErr);
      }
      onStartExam();
    } catch (err: any) {
      console.warn('Proceeding to exam room:', err);
      onStartExam();
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl mb-8 text-center relative overflow-hidden">
        <div className="flex justify-center mb-4">
          <ProctorlyLogo size="sm" showText={true} />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <Clock className="w-3.5 h-3.5" />
          <span>Candidate Examination Waiting Room</span>
        </div>

        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          {exam.title}
        </h1>
        <p className="mt-2 text-sm text-slate-300 max-w-2xl mx-auto">
          Exam Code: <span className="font-mono text-cyan-400 font-bold">{exam.code}</span> • Duration: <span className="font-bold text-white">{exam.durationMinutes} Minutes</span>
        </p>

        {/* Countdown */}
        <div className="mt-8">
          {isLive ? (
            <div className="inline-flex flex-col items-center">
              <span className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                The Examination Is Live Now
              </span>
              <p className="text-xs text-slate-400 mb-6">
                Click below to enter fullscreen and begin your examination timer.
              </p>
              <button
                type="button"
                disabled={starting}
                onClick={handleStartExam}
                className="px-8 py-4 rounded-xl text-base font-extrabold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-xl shadow-emerald-600/30 flex items-center gap-3 transition-all cursor-pointer transform hover:scale-105 active:scale-95"
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
          ) : (
            <div className="inline-block bg-slate-950/80 border border-slate-800 rounded-2xl p-6 shadow-inner">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">
                Time Remaining Until Exam Commences
              </div>
              <div className="font-mono text-4xl sm:text-5xl font-black text-cyan-400 tracking-wider">
                {formatCountdown(timeLeftMs)}
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Scheduled Start: {new Date(exam.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Streams Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><Video className="w-4 h-4 text-cyan-400" /> Live Webcam Feed</span>
            <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
          </div>
          <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
            <video ref={camPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><Monitor className="w-4 h-4 text-indigo-400" /> Entire Desktop Screen</span>
            <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Ready</span>
          </div>
          <div className="aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800">
            <video ref={screenPreviewRef} autoPlay playsInline muted className="w-full h-full object-contain" />
          </div>
        </div>
      </div>
    </div>
  );
};
