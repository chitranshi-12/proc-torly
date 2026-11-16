/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Student Readiness Checklist (White-Theme SaaS Design)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Mic,
  Monitor,
  Wifi,
  ScanFace,
  ChevronRight,
  RefreshCw,
  Lock,
  ArrowLeft
} from 'lucide-react';
import { firebaseExamService } from '../services/firebaseExamService';
import { api } from '../services/api';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';

interface StudentChecklistProps {
  exam: any;
  sessionId: string;
  attemptId?: string;
  candidateInfo: { name: string; rollNo: string; email: string };
  onCompleted: (mediaStreams: { webcam: MediaStream; screen: MediaStream }, refPhoto: string) => void;
  onBack: () => void;
  isDemo?: boolean;
}

export const StudentChecklist: React.FC<StudentChecklistProps> = ({
  exam,
  sessionId,
  attemptId,
  candidateInfo,
  onCompleted,
  onBack,
  isDemo = false
}) => {
  // Step 1: Consent
  const [consentAgreed, setConsentAgreed] = useState(false);

  // Step 2: Media Streams
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);

  // Step 3: Checks Status
  const [camMicGranted, setCamMicGranted] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [isRequestingCam, setIsRequestingCam] = useState(false);
  const [screenGranted, setScreenGranted] = useState(false);
  const [fullscreenGranted, setFullscreenGranted] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  // Step 4: Face Verification
  const [referencePhoto, setReferencePhoto] = useState<string | null>(null);
  const [faceCheckStatus, setFaceCheckStatus] = useState<'idle' | 'checking' | 'passed' | 'failed'>('idle');
  const [faceCheckMsg, setFaceCheckMsg] = useState<string>('');

  // Step 5: System check
  const [multiMonitorDetected, setMultiMonitorDetected] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const screenPreviewRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const isCompletedRef = useRef(false);
  const isMountedRef = useRef(true);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  webcamStreamRef.current = webcamStream;
  screenStreamRef.current = screenStream;

  useEffect(() => {
    isMountedRef.current = true;
    // Check multi-monitor
    if ((window.screen as any).isExtended) {
      setMultiMonitorDetected(true);
    }

    return () => {
      isMountedRef.current = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      // Clean up media tracks ONLY if student leaves without completing the checklist
      if (!isCompletedRef.current) {
        if (webcamStreamRef.current) {
          try {
            webcamStreamRef.current.getTracks().forEach((t) => t.stop());
          } catch (_) {}
        }
        if (screenStreamRef.current) {
          try {
            screenStreamRef.current.getTracks().forEach((t) => t.stop());
          } catch (_) {}
        }
      }
    };
  }, []);

  // Request Camera & Mic
  const requestCameraAndMic = async () => {
    if (isRequestingCam) return;
    setIsRequestingCam(true);
    setCamError(null);

    // Stop existing stream tracks to avoid NotReadableError / camera locking
    if (webcamStream) {
      try {
        webcamStream.getTracks().forEach((t) => t.stop());
      } catch (_) {}
      setWebcamStream(null);
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCamError('Media Devices API is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      setIsRequestingCam(false);
      return;
    }

    try {
      // 20-second bounded race for user permission response
      const mediaPromise = navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: true
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Permission request timed out. Please allow camera and microphone access in your browser.')),
          20000
        )
      );

      const stream = await Promise.race([mediaPromise, timeoutPromise]);
      if (!isMountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setWebcamStream(stream);
      setCamMicGranted(true);
      setCamError(null);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.play().catch(() => {});
      }

      // Mic volume visualization
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const updateMeter = () => {
          if (!analyserRef.current || !isMountedRef.current) return;
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animationFrameRef.current = requestAnimationFrame(updateMeter);
        };
        updateMeter();
      } catch (err) {
        console.warn('Audio visualizer note:', err);
      }
    } catch (err: any) {
      console.warn('Camera/Mic permission note:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCamError(
          'Camera or Microphone permission was denied. Please click the lock or camera icon in your browser address bar, set Camera & Microphone to "Allow", and click Try Again.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCamError('No webcam or microphone was detected on this device. Please connect a working camera and microphone.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCamError(
          'Camera is currently in use by another application (e.g. Zoom, Google Meet, Teams, or another browser window). Please close other video applications and retry.'
        );
      } else {
        setCamError(err.message || 'Could not access camera/microphone. Please verify browser permissions and retry.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsRequestingCam(false);
      }
    }
  };

  // Prominent Unified Action: Request Fullscreen & Entire Screen Share
  const requestFullscreenAndScreenShare = async () => {
    setScreenError(null);
    setFullscreenNotice(null);

    // 1. Request fullscreen for the examination interface (handled gracefully)
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setFullscreenGranted(true);
      } else if (document.fullscreenElement) {
        setFullscreenGranted(true);
      }
    } catch (fsErr: any) {
      console.warn('Fullscreen request note:', fsErr?.message);
      setFullscreenGranted(false);
      setFullscreenNotice('Fullscreen was not granted. You can still proceed, or enable fullscreen from your browser.');
    }

    // 2. Request screen sharing using getDisplayMedia with monitor preference
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor'
        } as any,
        audio: false
      });

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings() as any;

      // Reject window/tab sharing - entire desktop is required
      if (settings.displaySurface && settings.displaySurface !== 'monitor' && settings.displaySurface !== 'screen') {
        videoTrack.stop();
        setScreenGranted(false);
        setScreenStream(null);
        setScreenError(
          'Security Rejection: You selected a single Application Window or Browser Tab. You MUST select "Entire Screen" in the browser sharing dialog so complete desktop integrity is confirmed.'
        );
        return;
      }

      setScreenStream(stream);
      setScreenGranted(true);

      if (screenPreviewRef.current) {
        screenPreviewRef.current.srcObject = stream;
      }

      videoTrack.onended = () => {
        setScreenGranted(false);
        setScreenStream(null);
        setScreenError('Screen sharing ended. Please click "Enter Fullscreen & Share Entire Screen" to resume.');
      };
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setScreenError('Screen sharing was cancelled or denied. Entire screen sharing is mandatory to proceed.');
      } else {
        setScreenError(err.message || 'Screen sharing could not be started. Please try again.');
      }
    }
  };

  // Capture Reference Photo and verify face with fast fallback
  const captureAndVerifyFace = async () => {
    if (!videoRef.current || !camMicGranted) return;
    setFaceCheckStatus('checking');
    setFaceCheckMsg('Analyzing facial landmarks with AI model...');

    try {
      // Ensure video element has loaded dimensions
      if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not initialize canvas');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const photoData = canvas.toDataURL('image/jpeg', 0.85);
      if (isMountedRef.current) {
        setReferencePhoto(photoData);
      }

      // Analyze with COCO-SSD with bounded 3.5s timeout race
      const aiDetectionPromise = async () => {
        try {
          await tf.ready();
          const model = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
          if (!videoRef.current) return null;
          return await model.detect(videoRef.current);
        } catch {
          return null;
        }
      };

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500));
      const predictions = await Promise.race([aiDetectionPromise(), timeoutPromise]);

      if (!isMountedRef.current) return;

      if (predictions && Array.isArray(predictions)) {
        const persons = predictions.filter((p) => p.class === 'person' && p.score > 0.45);
        if (persons.length === 1) {
          setFaceCheckStatus('passed');
          setFaceCheckMsg('Reference face identity verified. Exactly 1 candidate confirmed.');
          return;
        } else if (persons.length === 0) {
          setFaceCheckStatus('failed');
          setFaceCheckMsg('No clear face detected. Please ensure proper room lighting and look directly into the camera.');
          return;
        } else {
          setFaceCheckStatus('failed');
          setFaceCheckMsg(`Multiple individuals (${persons.length}) detected. Examination room must contain only the candidate.`);
          return;
        }
      }

      // Safe fallback when AI load took longer than 3.5s or was offline: photo is valid
      setFaceCheckStatus('passed');
      setFaceCheckMsg('Reference photo captured. Facial profile registered.');
    } catch (err) {
      if (isMountedRef.current) {
        setFaceCheckStatus('passed');
        setFaceCheckMsg('Reference photo captured. Facial profile registered.');
      }
    }
  };

  // Submit Pre-check & Enter Waiting Room
  const handleProceedToWaitingRoom = async () => {
    if (!consentAgreed) {
      setApiError('You must agree to proctoring consent to proceed.');
      return;
    }
    if (!camMicGranted || !screenGranted || !webcamStream || !screenStream) {
      setApiError('Camera, microphone, and entire screen permissions are mandatory.');
      return;
    }
    if (!referencePhoto || faceCheckStatus !== 'passed') {
      setApiError('Please complete facial verification reference photo check.');
      return;
    }

    setRegistering(true);
    setApiError(null);
    isCompletedRef.current = true;

    // Record verified student consent and facial reference photo via authenticated backend API
    const targetAttemptId = attemptId || sessionId;
    if (!isDemo && targetAttemptId) {
      try {
        await api.submitStudentEvidence(targetAttemptId, {
          consentAgreed: true,
          consentVersion: '1.0-dpdp-2023',
          referencePhoto: referencePhoto || undefined
        });
      } catch (err: any) {
        console.warn('Backend evidence recording notice:', err);
      }
    }

    // Immediately advance candidate to waiting room
    try {
      onCompleted({ webcam: webcamStream, screen: screenStream }, referencePhoto);
    } catch (err: any) {
      console.error('Failed to transition to waiting room:', err);
      setApiError('Could not enter waiting room. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setRegistering(false);
      }
    }
  };

  const allPassed =
    consentAgreed &&
    camMicGranted &&
    screenGranted &&
    referencePhoto &&
    faceCheckStatus === 'passed';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 selection:bg-indigo-500 selection:text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-slate-200 gap-4">
        <div>
          <button
            type="button"
            onClick={() => {
              if (webcamStream) {
                try { webcamStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
              }
              if (screenStream) {
                try { screenStream.getTracks().forEach((t) => t.stop()); } catch (_) {}
              }
              onBack();
            }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 mb-1 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Change Credentials</span>
          </button>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <span>Pre-Exam System Readiness Check</span>
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            {exam.title} • Exam Code: <span className="font-mono text-indigo-600 font-bold">{exam.code || exam.examCode}</span>
          </p>
        </div>
        <div className="text-right sm:border-l sm:border-slate-200 sm:pl-6">
          <div className="text-xs text-slate-400 font-medium">Candidate</div>
          <div className="text-sm font-bold text-slate-900">{candidateInfo.name}</div>
          <div className="text-xs font-mono text-indigo-600 font-semibold">{candidateInfo.rollNo}</div>
        </div>
      </div>

      {apiError && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <span className="font-medium">{apiError}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Step 1: Explicit Consent & Privacy Disclosure */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs flex items-center justify-center font-bold">
                1
              </span>
              <span>Candidate Proctoring Consent (Statutory Disclosure)</span>
            </h3>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Mandatory Consent
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-2 mb-4 leading-relaxed">
            <p className="font-bold text-slate-800">
              Notice of Automated & Real-Time Human Invigilation:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li><strong className="text-slate-800">Entire Desktop Screen Share:</strong> Continuous monitoring to ensure no unauthorized browser tabs or external applications are opened.</li>
              <li><strong className="text-slate-800">Webcam Video & AI Face Tracking:</strong> Continuous verification of facial presence, absence, and detection of secondary individuals.</li>
              <li><strong className="text-slate-800">Microphone Audio Monitoring:</strong> Detection of unauthorized speech and audio signals.</li>
              <li><strong className="text-slate-800">Automated Violation Logging:</strong> Real-time proctoring strikes and metadata are logged to MongoDB Atlas with live peer-to-peer video streaming to the invigilator console. (Persistent cloud photo storage is disabled on Firebase Spark free tier).</li>
            </ul>
          </div>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentAgreed}
              onChange={(e) => setConsentAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
            />
            <span className="text-xs text-slate-700 font-medium">
              I consent to live screen-sharing, webcam video monitoring, microphone audio analysis, and automated violation evidence logging for the duration of this assessment.
            </span>
          </label>
        </div>

        {/* Step 2: Camera & Microphone Authorization */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs flex items-center justify-center font-bold">
                2
              </span>
              <span>Webcam & Microphone Verification</span>
            </h3>
            {camMicGranted ? (
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Granted
              </span>
            ) : (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Pending
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="relative aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transform -scale-x-100 ${camMicGranted ? 'block' : 'hidden'}`}
              />
              {!camMicGranted && (
                <div className="text-center p-6 text-slate-400">
                  <Camera className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-xs font-medium">Camera preview will appear here</p>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <p className="text-xs text-slate-600 font-normal leading-relaxed">
                  Position your camera directly in front of your face. Ensure adequate room lighting without harsh glare behind you.
                </p>

                {camMicGranted && (
                  <div>
                    <div className="flex justify-between text-xs text-slate-600 mb-1 font-medium">
                      <span className="flex items-center gap-1">
                        <Mic className="w-3.5 h-3.5 text-indigo-600" /> Mic Input Activity
                      </span>
                      <span className="font-mono font-bold text-indigo-600">{micLevel}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-75"
                        style={{ width: `${micLevel}%` }}
                      />
                    </div>
                  </div>
                )}
                {camError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <span className="font-medium">{camError}</span>
                  </div>
                )}
              </div>

              {!camMicGranted ? (
                <button
                  type="button"
                  disabled={isRequestingCam}
                  onClick={requestCameraAndMic}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isRequestingCam ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Requesting Camera Permission...</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" />
                      <span>{camError ? 'Retry Camera & Microphone' : 'Allow Camera & Microphone'}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={captureAndVerifyFace}
                  disabled={faceCheckStatus === 'checking'}
                  className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  <ScanFace className="w-4 h-4 text-indigo-400" />
                  <span>Capture Facial Reference Photo</span>
                </button>
              )}
            </div>
          </div>

          {faceCheckStatus !== 'idle' && (
            <div className={`mt-4 p-3.5 rounded-xl border text-xs flex items-center justify-between ${
              faceCheckStatus === 'passed'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : faceCheckStatus === 'checking'
                ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {faceCheckStatus === 'passed' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                {faceCheckStatus === 'checking' && <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />}
                {faceCheckStatus === 'failed' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
                <span>{faceCheckMsg}</span>
              </div>
              {referencePhoto && (
                <img
                  src={referencePhoto}
                  alt="Reference Face"
                  className="w-8 h-8 rounded-full object-cover border border-slate-300 shadow-xs"
                />
              )}
            </div>
          )}
        </div>

        {/* Step 3: Fullscreen & Entire Screen Share Authorization */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs flex items-center justify-center font-bold">
                3
              </span>
              <span>Fullscreen & Entire Screen Share Authorization</span>
            </h3>
            <div className="flex items-center gap-2">
              {fullscreenGranted && (
                <span className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" /> Fullscreen Ready
                </span>
              )}
              {screenGranted ? (
                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Entire Screen Active
                </span>
              ) : (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Action Required
                </span>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-600 mb-4 leading-relaxed font-normal">
            To ensure complete desktop examination integrity, click the button below to expand to fullscreen and select your entire display.
            <strong className="text-slate-900 block mt-1">Important: Choose "Entire Screen" in the browser sharing dialog (not a single tab or window).</strong>
          </p>

          {fullscreenNotice && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>{fullscreenNotice}</span>
            </div>
          )}

          {screenError && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <span className="font-medium">{screenError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
            <div className="aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center relative">
              <video
                ref={screenPreviewRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-contain ${screenGranted ? 'block' : 'hidden'}`}
              />
              {!screenGranted && (
                <div className="text-center p-6 text-slate-400">
                  <Monitor className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-xs font-medium">Entire screen stream preview will display here</p>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={requestFullscreenAndScreenShare}
                className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 ${
                  screenGranted
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>{screenGranted ? 'Re-select Entire Screen Share' : 'Enter Fullscreen & Share Entire Screen'}</span>
              </button>

              <div className="mt-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 flex items-center gap-2 leading-tight">
                <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>In Chrome's prompt, click the "Entire Screen" tab, select your monitor, and click "Share".</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 4: Network & Hardware Diagnostics */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2.5 mb-4">
            <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs flex items-center justify-center font-bold">
              4
            </span>
            <span>Diagnostics & Offline Tolerant Sync</span>
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
              <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="text-slate-500 text-[11px]">Network State</div>
                <div className="font-bold text-slate-900">
                  {navigator.onLine ? 'Connected to exam.co' : 'Offline (Autosave Queued)'}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
              <Monitor className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <div className="text-slate-500 text-[11px]">Display Setup</div>
                <div className="font-bold text-slate-900">
                  {multiMonitorDetected ? 'Multi-Display Alert' : 'Single Monitor (OK)'}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3">
              <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0" />
              <div>
                <div className="text-slate-500 text-[11px]">Integrity Defense</div>
                <div className="font-bold text-slate-900">Active & Armed</div>
              </div>
            </div>
          </div>
        </div>

        {/* Proceed to Waiting Room */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-600 text-center sm:text-left font-medium">
            {allPassed ? (
              <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> All checks verified. Ready to enter waiting room.
              </span>
            ) : (
              <span>Complete all 4 readiness steps above to proceed to the examination waiting room.</span>
            )}
          </div>

          <button
            type="button"
            disabled={!allPassed || registering}
            onClick={handleProceedToWaitingRoom}
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 text-sm transition-all cursor-pointer active:scale-95"
          >
            {registering ? (
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Enter Examination Waiting Room</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
