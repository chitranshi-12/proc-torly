/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * exam.co - Teacher & Invigilator Dashboard
 * Features:
 * - Live candidate roster with online/offline heartbeats & risk metrics
 * - Real-time popup alerts: "🚨 Cheating Alert Intercepted"
 * - Screenshot & webcam photo evidence viewer
 * - Manual test termination button per candidate
 * - Complete violation history audit table per candidate
 * - Dark / Light theme toggle (Defaults to Modern White SaaS Theme)
 * - PDF and CSV report exports
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Users,
  Video,
  Monitor,
  AlertTriangle,
  Clock,
  Eye,
  CheckCircle,
  Search,
  Volume2,
  Bell,
  RefreshCw,
  ArrowLeft,
  Download,
  FileSpreadsheet,
  XCircle,
  Wifi,
  WifiOff,
  ExternalLink,
  Zap,
  Activity,
  Maximize2,
  X,
  Sun,
  Moon,
  Ban,
  Camera,
  Layers,
  FileText,
  VolumeX,
  Table,
  LayoutGrid,
  Plus,
  MessageSquare
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { firebaseExamService } from '../services/firebaseExamService';
import { FirebaseWebRTCManager } from '../services/firebaseWebRTC';
import { demoService } from '../services/demoService';
import { audioNotificationService, playThreatAlertChime } from '../services/audioNotificationService';
import { api } from '../services/api';
import { getSocket } from '../services/socketService';
import { ExamCoLogo } from './ExamCoLogo';

interface InvigilatorDashboardProps {
  exam: any;
  onBack: () => void;
  isDemo?: boolean;
}

export const InvigilatorDashboard: React.FC<InvigilatorDashboardProps> = ({
  exam,
  onBack,
  isDemo = false
}) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'warning' | 'flagged'>('all');
  const [activeTab, setActiveTab] = useState<'table' | 'cards' | 'violations_table'>('table');

  // Modern White SaaS theme by default
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Sound mute/unmute control (persistent across reloads)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => audioNotificationService.getSoundEnabled());
  const toggleSound = () => {
    const next = audioNotificationService.toggleSound();
    setSoundEnabled(next);
  };

  // Selected candidate for live watching & timeline
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [webrtcStatus, setWebrtcStatus] = useState<string>('idle');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Instant Popup Notification Toast for Teacher
  const [latestPopupAlert, setLatestPopupAlert] = useState<{
    id: string;
    studentId: string;
    studentName: string;
    violationType: string;
    time: string;
    screenUrl?: string;
    camUrl?: string;
  } | null>(null);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcManagerRef = useRef<FirebaseWebRTCManager | null>(null);
  const prevViolationCountRef = useRef<number>(0);
  const alertToastTimeoutRef = useRef<any>(null);
  const seenIncidentsRef = useRef<Set<string>>(new Set());

  // Subscriptions for Live Sessions, Violations & Socket.IO Events
  useEffect(() => {
    const examId = exam?.id || exam?._id;
    if (!examId) return;

    if (isDemo) {
      // Seed existing violations so they never trigger audio alerts on mount
      const existing = demoService.getViolations(examId);
      existing.forEach((v) => {
        if (v?.id) seenIncidentsRef.current.add(v.id);
      });
      audioNotificationService.seedKnownIncidents(existing.map((v) => v.id));
      prevViolationCountRef.current = existing.length;
      setSessions([...demoService.getStudents(examId)]);
      setViolations([...existing]);

      const updateDemoData = () => {
        const studentList = demoService.getStudents(examId);
        const violationList = demoService.getViolations(examId);
        setSessions([...studentList]);

        // Check if a new violation arrived that has not been announced
        violationList.forEach((v) => {
          if (v?.id && !seenIncidentsRef.current.has(v.id)) {
            triggerTeacherAlertPopup(v);
          }
        });
        prevViolationCountRef.current = violationList.length;
        setViolations([...violationList]);
      };

      const unsub = demoService.subscribe(updateDemoData);
      return () => {
        unsub();
        demoService.stopSimulation();
      };
    } else {
      // 1. Initial snapshot from real MongoDB backend
      api.getExamMonitoring(examId)
        .then((snapshot) => {
          if (snapshot?.candidates) {
            setSessions(snapshot.candidates);
          }
          if (snapshot?.incidents && Array.isArray(snapshot.incidents)) {
            // Seed incidents so they never trigger audio chimes
            snapshot.incidents.forEach((inc) => {
              if (inc.id) seenIncidentsRef.current.add(inc.id);
            });
            audioNotificationService.seedKnownIncidents(snapshot.incidents.map((i) => i.id));
            setViolations(snapshot.incidents);
          }
        })
        .catch((err) => console.warn('Monitoring snapshot note:', err.message));

      // 2. Real-time Socket.IO Connection
      const socket = getSocket();
      socket.emit('teacher:join', { examId });

      const onCandidateJoined = (data: any) => {
        setSessions((prev) => {
          const exists = prev.find((s) => s.id === data.attemptId || s.studentId === data.studentId);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: data.attemptId,
              studentId: data.studentId,
              studentName: data.studentName,
              rollNo: data.rollNo,
              status: 'in_progress',
              isOnline: true,
              lastHeartbeat: data.timestamp,
              answeredCount: 0,
              riskScore: 0
            }
          ];
        });
      };

      const onCandidateProgress = (data: any) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === data.attemptId || s.studentId === data.studentId
              ? {
                  ...s,
                  isOnline: true,
                  answeredCount: data.answeredCount ?? s.answeredCount,
                  progressPercent: data.progressPercentage ?? s.progressPercent,
                  lastHeartbeat: data.lastActivityAt || data.lastHeartbeat || s.lastHeartbeat,
                  status: data.attemptStatus || s.status
                }
              : s
          )
        );
      };

      const onCandidateStatus = (data: any) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === data.attemptId || s.studentId === data.studentId
              ? {
                  ...s,
                  status: data.status || s.status,
                  isOnline: data.isOnline !== undefined ? data.isOnline : s.isOnline,
                  riskScore: data.riskScore !== undefined ? data.riskScore : s.riskScore,
                  terminationReason: data.terminationReason || s.terminationReason,
                  terminationSource: data.terminationSource || s.terminationSource
                }
              : s
          )
        );
      };

      const onCandidateDisconnected = (data: any) => {
        setSessions((prev) =>
          prev.map((s) => (s.id === data.attemptId ? { ...s, isOnline: false } : s))
        );
      };

      const onIncidentCreated = (data: any) => {
        const incId = data.id || `inc_${data.studentId}_${data.timestamp}`;
        if (!seenIncidentsRef.current.has(incId)) {
          triggerTeacherAlertPopup({
            id: incId,
            rollNo: data.studentId,
            studentName: data.studentName,
            type: data.incidentType,
            timestamp: data.timestamp
          });
        }
        setViolations((prev) => [data, ...prev]);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === data.attemptId
              ? { ...s, riskScore: Math.min(100, (s.riskScore || 0) + 15) }
              : s
          )
        );
      };

      socket.on('candidate:joined', onCandidateJoined);
      socket.on('candidate:progress', onCandidateProgress);
      socket.on('candidate:status', onCandidateStatus);
      socket.on('candidate:disconnected', onCandidateDisconnected);
      socket.on('incident:created', onIncidentCreated);

      // Real-time video and screen streaming from student (eliminates black screen / no signal)
      const onCandidateStreamFrame = (data: any) => {
        const targetId = data?.attemptId;
        if (!targetId) return;
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === targetId || s.attemptId === targetId) {
              return {
                ...s,
                previewScreenDataUrl: data.screenDataUrl || s.previewScreenDataUrl,
                previewCamDataUrl: data.camDataUrl || s.previewCamDataUrl
              };
            }
            return s;
          })
        );
        setSelectedStudent((prev: any) => {
          if (prev && (prev.id === targetId || prev.attemptId === targetId)) {
            return {
              ...prev,
              previewScreenDataUrl: data.screenDataUrl || prev.previewScreenDataUrl,
              previewCamDataUrl: data.camDataUrl || prev.previewCamDataUrl
            };
          }
          return prev;
        });
      };
      socket.on('candidate:stream_frame', onCandidateStreamFrame);

      // Cloud Firestore real-time listeners as sync fallback
      let initialFirestoreSyncDone = false;
      const unsubSessions = firebaseExamService.subscribeExamSessions(examId, (list) => {
        if (list && list.length > 0) setSessions(list);
      });

      const unsubViolations = firebaseExamService.subscribeExamViolations(examId, (list) => {
        if (!initialFirestoreSyncDone) {
          // Seed initial violations without playing audio
          list.forEach((v) => { if (v?.id) seenIncidentsRef.current.add(v.id); });
          audioNotificationService.seedKnownIncidents(list.map((v) => v.id));
          initialFirestoreSyncDone = true;
          if (list && list.length > 0) setViolations(list);
          return;
        }

        // Only popup for genuinely new violation ID
        list.forEach((v) => {
          if (v?.id && !seenIncidentsRef.current.has(v.id)) {
            triggerTeacherAlertPopup(v);
          }
        });
        if (list && list.length > 0) setViolations(list);
      });

      return () => {
        socket.off('candidate:joined', onCandidateJoined);
        socket.off('candidate:progress', onCandidateProgress);
        socket.off('candidate:status', onCandidateStatus);
        socket.off('candidate:disconnected', onCandidateDisconnected);
        socket.off('incident:created', onIncidentCreated);
        socket.off('candidate:stream_frame', onCandidateStreamFrame);
        unsubSessions();
        unsubViolations();
      };
    }
  }, [exam?.id, exam?._id, isDemo]);

  // Show teacher instant popup notification with deduplicated sound alert
  const triggerTeacherAlertPopup = (v: any) => {
    if (!v) return;
    const alertId = v.id || `inc_${v.studentId || v.rollNo}_${v.timestamp || Date.now()}`;
    const isNew = !seenIncidentsRef.current.has(alertId);
    seenIncidentsRef.current.add(alertId);

    // Audio chime fires at most once per incident ID and respects user mute preference
    if (isNew) {
      audioNotificationService.playIncidentAlert(alertId);
    }

    setLatestPopupAlert({
      id: alertId,
      studentId: v.rollNo || v.studentId || '101',
      studentName: v.studentName || 'Student',
      violationType: v.type || v.incidentType || 'Integrity Violation',
      time: new Date(v.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      screenUrl: v.screenImageUrl || v.screenUrl,
      camUrl: v.camImageUrl || v.webcamUrl
    });

    clearTimeout(alertToastTimeoutRef.current);
    alertToastTimeoutRef.current = setTimeout(() => {
      setLatestPopupAlert(null);
    }, 9000);
  };

  // Connect WebRTC stream when a student is selected
  useEffect(() => {
    if (!selectedStudent) {
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.close();
        webrtcManagerRef.current = null;
      }
      setRemoteStream(null);
      setWebrtcStatus('idle');
      return;
    }

    setWebrtcStatus('connecting');
    const targetAttemptId = selectedStudent.id || selectedStudent.attemptId;
    const examIdentifier = exam?.id || exam?._id || 'exam';
    const webrtc = new FirebaseWebRTCManager(
      targetAttemptId,
      'invigilator',
      (stream) => {
        setRemoteStream(stream);
        setWebrtcStatus('connected');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      },
      examIdentifier
    );

    webrtc.startCall();
    webrtcManagerRef.current = webrtc;

    return () => {
      webrtc.close();
      setRemoteStream(null);
    };
  }, [selectedStudent]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const isStudentOnline = (student: any): boolean => {
    if (typeof student.isOnline === 'boolean') return student.isOnline;
    if (!student.lastHeartbeat) return false;
    return Date.now() - student.lastHeartbeat < 25000;
  };

  // MANUAL TERMINATION ACTION
  const handleTerminateStudent = async (student: any) => {
    const confirmTerm = confirm(
      `Are you sure you want to terminate the test for ${student.studentName} (${student.rollNo})?\nTheir test will immediately be locked and submitted.`
    );
    if (!confirmTerm) return;

    try {
      let authoritativeResult: any = null;
      if (isDemo) {
        demoService.terminateStudent(student.id, 'Manually terminated by invigilator for integrity breach');
      } else {
        try {
          authoritativeResult = await api.terminateExam(student.id, {
            reason: 'Manually terminated by invigilator for integrity breach',
            source: 'invigilator',
            examId: exam.id || exam._id
          });
        } catch {
          await firebaseExamService.terminateStudentSession(student.id, 'Manually terminated by invigilator');
        }
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === student.id
            ? {
                ...s,
                status: 'terminated',
                riskScore: authoritativeResult?.riskScore ?? s.riskScore ?? 0,
                terminationReason: authoritativeResult?.terminationReason || 'Manually terminated by invigilator',
                terminationSource: 'invigilator',
                terminatedAt: authoritativeResult?.terminatedAt || new Date().toISOString()
              }
            : s
        )
      );

      if (selectedStudent && selectedStudent.id === student.id) {
        setSelectedStudent((prev: any) => ({
          ...prev,
          status: 'terminated',
          riskScore: authoritativeResult?.riskScore ?? prev.riskScore ?? 0,
          terminationReason: authoritativeResult?.terminationReason || 'Manually terminated by invigilator'
        }));
      }

      alert(`Test terminated for ${student.studentName}.`);
    } catch (err: any) {
      alert(err.message || 'Failed to terminate student test');
    }
  };

  const handleAddTime = (student: any, minutes = 5) => {
    try {
      getSocket().emit('teacher:add_time', {
        attemptId: student.id,
        examId: exam.id || exam._id,
        minutes
      });
      alert(`Added ${minutes} minutes to ${student.studentName}'s exam timer.`);
    } catch (e: any) {
      alert(e.message || 'Failed to add time');
    }
  };

  const handleSendWarning = (student: any) => {
    const msg = prompt(`Enter warning message to send to ${student.studentName}:`, 'Please remain focused on your examination screen.');
    if (!msg) return;

    try {
      getSocket().emit('teacher:send_warning', {
        attemptId: student.id,
        examId: exam.id || exam._id,
        message: msg,
        teacherName: 'Invigilator'
      });
      alert(`Warning delivered to ${student.studentName}.`);
    } catch (e: any) {
      alert(e.message || 'Failed to send warning');
    }
  };

  const formatLastHeartbeat = (hb: any) => {
    if (!hb) return 'Never';
    const time = new Date(hb).getTime();
    if (isNaN(time) || time <= 0) return 'Never';
    const diffSec = Math.floor((Date.now() - time) / 1000);
    if (diffSec < 15) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return new Date(hb).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Export CSV of violations & results
  const exportCsv = () => {
    let csv = 'Roll No,Candidate Name,Institute,Status,Score,Total Marks,Risk Score,Violations Count,Last Heartbeat\n';
    sessions.forEach((s) => {
      const vCount = violations.filter((v) => v.sessionId === s.id).length;
      csv += `"${s.rollNo}","${s.studentName}","${s.institute || 'Institution'}","${s.status}",${s.score ?? 'In Progress'},${s.totalMarks || 0},${s.riskScore || 0},${vCount},"${new Date(s.lastHeartbeat || 0).toLocaleTimeString()}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam_co_${exam.code}_Audit_Report.csv`;
    a.click();
  };

  // Export PDF of audit report
  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(99, 102, 241);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('EXAM.CO CLOUD INVIGILATION AUDIT REPORT', 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(226, 232, 240);
    doc.setFont('helvetica', 'normal');
    doc.text(`Exam: ${exam.title} (Code: ${exam.code})`, 14, 27);
    doc.text(`Institution: ${exam.instituteName || 'Department'} | Generated: ${new Date().toLocaleString()}`, 14, 34);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CANDIDATE INTEGRITY AUDIT ROSTER', 14, 52);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 58, 196, 58);
    doc.setFontSize(8);
    doc.text('ROLL NO', 14, 63);
    doc.text('NAME', 50, 63);
    doc.text('STATUS', 110, 63);
    doc.text('SCORE', 145, 63);
    doc.text('RISK INDEX', 170, 63);
    doc.line(14, 66, 196, 66);

    let y = 74;
    doc.setFont('helvetica', 'normal');
    sessions.forEach((s) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(s.rollNo || '-', 14, y);
      doc.text((s.studentName || '').slice(0, 25), 50, y);
      doc.text((s.status || '').toUpperCase(), 110, y);
      doc.text(`${s.score ?? '-'} / ${s.totalMarks || '-'}`, 145, y);
      doc.text(`${s.riskScore || 0}%`, 170, y);
      y += 8;
    });

    doc.save(`exam_co_${exam.code}_Audit.pdf`);
  };

  // Filter students
  const filteredSessions = sessions.filter((s) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!s.studentName?.toLowerCase().includes(q) && !s.rollNo?.toLowerCase().includes(q)) {
        return false;
      }
    }
    const online = isStudentOnline(s);
    const vCount = violations.filter((v) => v.sessionId === s.id).length;
    if (filter === 'online') return online;
    if (filter === 'warning') return vCount > 0 && vCount < 3;
    if (filter === 'flagged') return vCount >= 3 || (s.riskScore || 0) >= 60 || s.status === 'terminated';
    return true;
  });

  const currentStudentViolations = selectedStudent
    ? violations.filter((v) => v.sessionId === selectedStudent.id)
    : [];

  const candidateShareUrl = `${window.location.origin}${window.location.pathname}?exam=${exam.id}&code=${exam.code}`;

  // Top summary metrics
  const totalRegistered = sessions.length;
  const onlineCount = sessions.filter(isStudentOnline).length;
  const offlineCount = Math.max(0, totalRegistered - onlineCount);
  const inProgressCount = sessions.filter((s) => s.status === 'in_progress').length;
  const submittedCount = sessions.filter((s) => s.status === 'submitted').length;
  const incidentCount = violations.length;

  const totalExamQuestions = Array.isArray(exam.questions) && exam.questions.length > 0 ? exam.questions.length : 10;
  const totalAnswersGiven = sessions.reduce((acc, s) => acc + (Number(s.answeredCount) || 0), 0);
  const totalPossibleAnswers = totalRegistered * totalExamQuestions;
  const overallProgressPercent = totalPossibleAnswers > 0 ? Math.min(100, Math.round((totalAnswersGiven / totalPossibleAnswers) * 100)) : 0;

  const themeContainer = isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900';
  const themeCard = isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm';
  const themeCardHeader = isDarkMode ? 'bg-slate-900/90 border-slate-800 text-white' : 'bg-slate-50/80 border-slate-200 text-slate-900';
  const themeSubtext = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const themeInput = isDarkMode
    ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500'
    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400';

  return (
    <div className={`min-h-screen ${themeContainer} p-4 sm:p-6 transition-colors font-sans`}>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header Bar */}
        <div className={`p-5 rounded-2xl border ${themeCard} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              }`}
              title="Return to Exams List"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <ExamCoLogo size="sm" theme={isDarkMode ? 'dark' : 'light'} />
                <h1 className="text-xl font-bold tracking-tight">{exam.title}</h1>
                <span className={`font-mono text-xs font-bold px-2.5 py-0.5 rounded border ${
                  isDarkMode ? 'text-indigo-400 bg-slate-950 border-slate-800' : 'text-indigo-600 bg-indigo-50 border-indigo-200'
                }`}>
                  Code: {exam.code}
                </span>
                {isDemo && (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Live Demo Active
                  </span>
                )}
              </div>
              <p className={`text-xs ${themeSubtext} mt-0.5`}>
                exam.co Live Monitoring Console • {exam.instituteName || 'Department Examination'} • Real-Time Integrity Feed
              </p>
            </div>
          </div>

          {/* Action Buttons & Theme Toggle */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Sound Mute / Unmute Toggle */}
            <button
              onClick={toggleSound}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer font-semibold ${
                soundEnabled
                  ? isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-indigo-400'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : isDarkMode
                  ? 'bg-slate-900 border-slate-800 text-slate-500'
                  : 'bg-slate-100 border-slate-200 text-slate-400'
              }`}
              title={soundEnabled ? 'Alert sounds active (click to mute)' : 'Alert sounds muted (click to enable)'}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-indigo-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
              <span>{soundEnabled ? 'Sound: ON' : 'Sound: MUTED'}</span>
            </button>

            {/* Dark / Light Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-amber-300'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
              }`}
              title="Toggle Dark / Light Theme"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
              <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            <button
              onClick={() => window.open(candidateShareUrl, '_blank')}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer font-semibold ${
                isDarkMode
                  ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
              }`}
              title="Open a separate browser tab to test as student"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Student Tab</span>
            </button>

            <button
              onClick={exportCsv}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer font-semibold ${
                isDarkMode
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={exportPdf}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF Report</span>
            </button>
          </div>
        </div>

        {/* TOP SUMMARY METRICS BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Total Candidates</span>
              <Users className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono">{totalRegistered}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Enrolled attempts</div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Currently Online</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="text-2xl font-black text-emerald-700 font-mono">{onlineCount}</div>
            <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">Active streaming</div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Currently Offline</span>
              <WifiOff className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div className="text-2xl font-black text-slate-700 font-mono">{offlineCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Disconnected / Left</div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Taking Exam</span>
              <Activity className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-indigo-700 font-mono">{inProgressCount}</div>
            <div className="text-[10px] text-indigo-600 mt-0.5 font-medium">In progress timer</div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Completed</span>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 font-mono">{submittedCount}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Submitted & scored</div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex items-center justify-between">
              <span>Review Incidents</span>
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            </div>
            <div className={`text-2xl font-black font-mono ${incidentCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              {incidentCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Logged violations</div>
          </div>
        </div>

        {/* OVERALL EXAMINATION COMPLETION PROGRESS BAR */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900">Overall Examination Completion</div>
              <div className="text-[11px] text-slate-500">
                {totalAnswersGiven} of {totalPossibleAnswers || 0} candidate question answers recorded
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-72">
            <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${overallProgressPercent}%` }}
              />
            </div>
            <span className="font-mono text-xs font-bold text-indigo-700 min-w-10 text-right">{overallProgressPercent}%</span>
          </div>
        </div>

        {/* View Switcher: Live Table vs. Cards Roster vs. Complete Violation History */}
        <div className="flex gap-2 border-b border-slate-200 pb-2 text-xs">
          <button
            onClick={() => setActiveTab('table')}
            className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'table'
                ? 'bg-indigo-600 text-white shadow-xs'
                : isDarkMode
                ? 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Live Candidate Table ({sessions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('cards')}
            className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'cards'
                ? 'bg-indigo-600 text-white shadow-xs'
                : isDarkMode
                ? 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Stream Cards View</span>
          </button>

          <button
            onClick={() => setActiveTab('violations_table')}
            className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'violations_table'
                ? 'bg-indigo-600 text-white shadow-xs'
                : isDarkMode
                ? 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 shadow-xs'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-rose-500" />
            <span>Incident Audit Table ({violations.length})</span>
          </button>
        </div>

        {/* TAB 1: ACTIVE CANDIDATE ROSTER + REAL-TIME FEED */}
        {(activeTab === 'table' || activeTab === 'cards') && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Student Grid Section */}
            <div className="lg:col-span-3 space-y-4">
              {/* Search & Filter Bar */}
              <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl border ${themeCard}`}>
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search candidate name or roll number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-9 pr-3 py-1.5 border rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${themeInput}`}
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs w-full sm:w-auto flex-wrap">
                  {[
                    { id: 'all', label: `All (${sessions.length})` },
                    { id: 'online', label: `Online (${sessions.filter(isStudentOnline).length})` },
                    { id: 'warning', label: 'Warnings' },
                    { id: 'flagged', label: 'Flagged / Terminated' }
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => setFilter(btn.id as any)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        filter === btn.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : isDarkMode
                          ? 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cards Grid */}
              {filteredSessions.length === 0 ? (
                <div className={`p-12 text-center rounded-2xl border ${themeCard}`}>
                  <Users className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <p className="text-sm font-semibold">No Candidates Found</p>
                  <p className={`text-xs ${themeSubtext} mt-1`}>
                    Share your exam link with students or click "Open Student Tab" to begin taking the exam.
                  </p>
                </div>
              ) : activeTab === 'table' ? (
                /* 9-COLUMN LIVE CANDIDATE TABLE */
                <div className={`rounded-2xl border overflow-hidden shadow-sm ${themeCard}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[10px] font-bold">
                        <tr>
                          <th className="py-3.5 px-4">Student Name</th>
                          <th className="py-3.5 px-3">Roll Number</th>
                          <th className="py-3.5 px-3">Connection</th>
                          <th className="py-3.5 px-3">Progress</th>
                          <th className="py-3.5 px-3">Answered</th>
                          <th className="py-3.5 px-3">Last Heartbeat</th>
                          <th className="py-3.5 px-3">Incidents</th>
                          <th className="py-3.5 px-3">State</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {filteredSessions.map((student) => {
                          const online = isStudentOnline(student);
                          const sViolations = violations.filter((v) => v.sessionId === student.id || v.attemptId === student.id);
                          const vCount = sViolations.length || student.incidentCount || 0;
                          const isTerm = student.status === 'terminated';
                          const answered = Number(student.answeredCount) || 0;
                          const progressPct = totalExamQuestions > 0 ? Math.round((answered / totalExamQuestions) * 100) : 0;
                          const lastPingStr = formatLastHeartbeat(student.lastHeartbeat);

                          return (
                            <tr
                              key={student.id}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isTerm ? 'bg-rose-50/30' : vCount >= 3 ? 'bg-rose-50/20' : ''
                              }`}
                            >
                              {/* 1. Student Name */}
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{student.studentName}</div>
                                <div className="text-[11px] text-slate-500 font-normal truncate max-w-[140px]">
                                  {student.studentEmail || student.institute || 'Candidate'}
                                </div>
                              </td>

                              {/* 2. Roll Number */}
                              <td className="py-3 px-3 font-mono font-semibold text-slate-800">
                                <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 text-[11px]">
                                  {student.rollNo}
                                </span>
                              </td>

                              {/* 3. Connection Status */}
                              <td className="py-3 px-3">
                                {online ? (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    Online
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                    Offline
                                  </span>
                                )}
                              </td>

                              {/* 4. Examination Progress */}
                              <td className="py-3 px-3 w-32">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                                    <div
                                      className="bg-indigo-600 h-2 rounded-full transition-all duration-200"
                                      style={{ width: `${progressPct}%` }}
                                    />
                                  </div>
                                  <span className="font-mono text-[10px] font-bold text-slate-700">{progressPct}%</span>
                                </div>
                              </td>

                              {/* 5. Answered Questions */}
                              <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                                <span className="font-bold text-indigo-600">{answered}</span> / {totalExamQuestions} Qs
                              </td>

                              {/* 6. Last Heartbeat */}
                              <td className="py-3 px-3 text-[11px] text-slate-500 font-mono">
                                {lastPingStr}
                              </td>

                              {/* 7. Incident Count */}
                              <td className="py-3 px-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                                    vCount === 0
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : vCount < 3
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                                  }`}
                                >
                                  {vCount} {vCount === 1 ? 'flag' : 'flags'}
                                </span>
                              </td>

                              {/* 8. Submission State */}
                              <td className="py-3 px-3">
                                {isTerm ? (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px] uppercase">
                                    Terminated
                                  </span>
                                ) : student.status === 'submitted' ? (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px] uppercase flex items-center gap-1 w-fit">
                                    <CheckCircle className="w-3 h-3 text-emerald-600" /> Submitted
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-[10px] uppercase">
                                    In Progress
                                  </span>
                                )}
                              </td>

                              {/* 9. Teacher Actions */}
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedStudent(student)}
                                    className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-bold cursor-pointer transition-colors"
                                    title="Inspect candidate stream and audit"
                                  >
                                    Inspect
                                  </button>

                                  {!isTerm && student.status !== 'submitted' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleAddTime(student, 5)}
                                        className="px-1.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10px] font-bold cursor-pointer transition-colors"
                                        title="Add +5 minutes to examination timer"
                                      >
                                        +5m
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleSendWarning(student)}
                                        className="px-1.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold cursor-pointer transition-colors"
                                        title="Send direct warning message"
                                      >
                                        Warn
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleTerminateStudent(student)}
                                        className="px-1.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-bold cursor-pointer transition-colors"
                                        title="Manually terminate candidate"
                                      >
                                        End
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Cards Stream Grid View */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredSessions.map((student) => {
                    const online = isStudentOnline(student);
                    const sViolations = violations.filter((v) => v.sessionId === student.id);
                    const vCount = sViolations.length;
                    const isTerm = student.status === 'terminated';
                    const isFlagged = vCount >= 3 || (student.riskScore || 0) >= 60 || isTerm;

                    return (
                      <div
                        key={student.id}
                        className={`rounded-2xl border transition-all overflow-hidden flex flex-col justify-between shadow-xs relative group ${
                          isTerm
                            ? 'border-rose-300 bg-rose-50/50'
                            : isFlagged
                            ? 'border-rose-300 bg-rose-50/30'
                            : vCount > 0
                            ? 'border-amber-300 bg-amber-50/30'
                            : themeCard
                        }`}
                      >
                        {/* Header */}
                        <div className={`p-3 border-b flex items-center justify-between ${themeCardHeader}`}>
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isTerm
                                  ? 'bg-rose-500'
                                  : online
                                  ? 'bg-emerald-500 animate-ping'
                                  : 'bg-slate-400'
                              }`}
                            />
                            <div>
                              <div className="font-bold text-xs leading-tight">
                                {student.studentName}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500">{student.rollNo}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isTerm ? (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
                                Terminated
                              </span>
                            ) : (
                              <span
                                className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                  online
                                    ? isDarkMode
                                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : isDarkMode
                                    ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}
                              >
                                {online ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
                                {online ? 'Active' : 'Offline'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Preview Screen Thumbnail */}
                        <div
                          onClick={() => setSelectedStudent(student)}
                          className={`aspect-video rounded-lg overflow-hidden m-2 border relative flex items-center justify-center cursor-pointer ${
                            isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                          }`}
                        >
                          {student.previewScreenDataUrl ? (
                            <img
                              src={student.previewScreenDataUrl}
                              alt="Screen Feed"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center text-slate-400 text-xs flex flex-col items-center gap-1">
                              <Monitor className="w-6 h-6 text-slate-400" />
                              <span className="text-[11px] font-medium">Click to Watch Live Stream</span>
                            </div>
                          )}

                          {/* Webcam PIP in corner */}
                          {student.previewCamDataUrl && (
                            <div className="absolute bottom-2 right-2 w-16 h-12 rounded border border-slate-300 overflow-hidden shadow-md bg-black">
                              <img
                                src={student.previewCamDataUrl}
                                alt="Cam PIP"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          <div className={`absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded font-mono ${
                            isDarkMode ? 'bg-slate-950/90 text-indigo-400' : 'bg-white/90 text-indigo-700 border border-slate-200 shadow-xs'
                          }`}>
                            Status: {student.status}
                          </div>
                        </div>

                        {/* Footer with Manual Terminate & Inspect */}
                        <div className={`p-3 border-t flex items-center justify-between text-xs ${themeCardHeader}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">
                              Risk: <strong className="text-indigo-600 font-bold">{student.riskScore || 0}%</strong>
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[11px] text-slate-500">
                              Flags:{' '}
                              <strong className={vCount >= 3 ? 'text-rose-600 font-bold' : vCount > 0 ? 'text-amber-600 font-bold' : 'text-slate-600 font-bold'}>
                                {vCount}/3
                              </strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {!isTerm && (
                              <button
                                onClick={() => handleTerminateStudent(student)}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                title="Manually terminate this candidate's test immediately"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Terminate</span>
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedStudent(student)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Inspect</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Real-Time Live Notification Alerts Feed */}
            <div className={`rounded-2xl border p-4 flex flex-col h-[750px] shadow-sm ${themeCard}`}>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-700">
                  <Bell className="w-4 h-4 text-indigo-600" />
                  <span>Real-Time Alerts Feed</span>
                </h3>
                <span className="text-[10px] font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  {violations.length} Captured
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {violations.length === 0 ? (
                  <div className="text-center py-20 text-slate-400 text-xs">
                    <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                    <p className="font-medium text-slate-500">No proctoring violations recorded yet.</p>
                  </div>
                ) : (
                  violations.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        const match = sessions.find((s) => s.id === v.sessionId);
                        if (match) setSelectedStudent(match);
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer text-xs space-y-2 group shadow-xs ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            v.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {v.type}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <div>
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {v.studentName} (ID: {v.rollNo || v.studentId})
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{v.description || v.details}</p>
                      </div>

                      {/* Evidence Thumbnails */}
                      {(v.screenImageUrl || v.screenUrl || v.camImageUrl || v.webcamUrl) && (
                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          {(v.screenImageUrl || v.screenUrl) && (
                            <img
                              src={v.screenImageUrl || v.screenUrl}
                              alt="Screen"
                              className="aspect-video object-cover rounded border border-slate-200 hover:border-indigo-500 transition-colors cursor-zoom-in"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(v.screenImageUrl || v.screenUrl);
                              }}
                            />
                          )}
                          {(v.camImageUrl || v.webcamUrl) && (
                            <img
                              src={v.camImageUrl || v.webcamUrl}
                              alt="Webcam"
                              className="aspect-video object-cover rounded border border-slate-200 hover:border-indigo-500 transition-colors cursor-zoom-in"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(v.camImageUrl || v.webcamUrl);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: COMPLETE VIOLATION HISTORY TABLE PER STUDENT */}
        {activeTab === 'violations_table' && (
          <div className={`rounded-2xl border p-6 shadow-sm overflow-x-auto ${themeCard}`}>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900">Audit Violation Evidence History Table</h2>
                <p className={`text-xs ${themeSubtext} mt-0.5`}>
                  Chronological evidence logs with screenshot and webcam camera captures per student
                </p>
              </div>

              <span className="font-mono text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                Total Incident Logs: {violations.length}
              </span>
            </div>

            {violations.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                <p className="font-semibold text-slate-600">Clean Examination: Zero violations have been detected or reported.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                    <th className="py-3 px-3">Student ID</th>
                    <th className="py-3 px-3">Candidate Name</th>
                    <th className="py-3 px-3">Violation Type</th>
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Screen Evidence</th>
                    <th className="py-3 px-3">Webcam Photo</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {violations.map((v) => {
                    const matchStudent = sessions.find((s) => s.id === v.sessionId);
                    return (
                      <tr
                        key={v.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          v.severity === 'CRITICAL' ? 'bg-rose-50/50' : ''
                        }`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-indigo-600">
                          {v.rollNo || v.studentId || '101'}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900">{v.studentName}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              v.severity === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {v.type}
                          </span>
                          <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">{v.description || v.details}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-500">
                          {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-3 px-3">
                          {v.screenImageUrl || v.screenUrl ? (
                            <img
                              src={v.screenImageUrl || v.screenUrl}
                              alt="Screen Evidence"
                              onClick={() => setPreviewImage(v.screenImageUrl || v.screenUrl)}
                              className="w-16 h-10 object-cover rounded border border-slate-200 cursor-pointer hover:scale-105 transition-transform"
                            />
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">No capture</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {v.camImageUrl || v.webcamUrl ? (
                            <img
                              src={v.camImageUrl || v.webcamUrl}
                              alt="Webcam Photo"
                              onClick={() => setPreviewImage(v.camImageUrl || v.webcamUrl)}
                              className="w-16 h-10 object-cover rounded border border-slate-200 cursor-pointer hover:scale-105 transition-transform"
                            />
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">No capture</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {matchStudent && matchStudent.status !== 'terminated' ? (
                            <button
                              onClick={() => handleTerminateStudent(matchStudent)}
                              className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              Terminate Test
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 uppercase font-mono">Terminated</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

      </div>

      {/* INSTANT POPUP NOTIFICATION FOR TEACHER (Top-Right Alert) */}
      {latestPopupAlert && (
        <div className="fixed top-5 right-5 z-50 max-w-md w-full bg-white border-2 border-rose-400 rounded-2xl shadow-xl p-4 animate-in slide-in-from-top duration-200 text-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🚨 Cheating Alert Intercepted</span>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                </div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">
                  Student ID: {latestPopupAlert.studentId} ({latestPopupAlert.studentName})
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Violation: <strong className="text-rose-700 font-semibold">{latestPopupAlert.violationType}</strong> at {latestPopupAlert.time}
                </div>
              </div>
            </div>

            <button
              onClick={() => setLatestPopupAlert(null)}
              className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Captured Thumbnails */}
          {(latestPopupAlert.screenUrl || latestPopupAlert.camUrl) && (
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">
              {latestPopupAlert.screenUrl && (
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Screen Screenshot</div>
                  <img
                    src={latestPopupAlert.screenUrl}
                    alt="Screen Screenshot"
                    onClick={() => setPreviewImage(latestPopupAlert.screenUrl || null)}
                    className="w-full h-20 object-cover rounded-lg border border-slate-200 cursor-pointer hover:border-indigo-500"
                  />
                </div>
              )}
              {latestPopupAlert.camUrl && (
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-500 mb-1">Webcam Photo</div>
                  <img
                    src={latestPopupAlert.camUrl}
                    alt="Webcam Photo"
                    onClick={() => setPreviewImage(latestPopupAlert.camUrl || null)}
                    className="w-full h-20 object-cover rounded-lg border border-slate-200 cursor-pointer hover:border-indigo-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected Student Modal: Live WebRTC Stream + Violation Log + Manual Terminate */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl my-8 p-6 shadow-2xl text-slate-900">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{selectedStudent.studentName}</h2>
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    ID: {selectedStudent.rollNo}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    selectedStudent.status === 'terminated'
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}>
                    {selectedStudent.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Integrity Risk Score: <strong className="text-amber-600 font-bold">{selectedStudent.riskScore || 0}%</strong> • Total Flags: <strong className="text-rose-600 font-bold">{currentStudentViolations.length}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedStudent.status !== 'terminated' && (
                  <button
                    onClick={() => handleTerminateStudent(selectedStudent)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Terminate Test Now</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Live WebRTC Screen Watcher with Fallback */}
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 mb-6 text-white">
              <div className="flex justify-between items-center text-xs font-bold text-slate-300 mb-2">
                <span className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-indigo-400" />
                  <span>Live Candidate Desktop Screen & Self-View Webcam</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                  {remoteStream
                    ? '● WebRTC 30fps Stream Active'
                    : selectedStudent.previewScreenDataUrl
                    ? '● Real-Time Proctoring Stream Active'
                    : '● Initializing Video Feed...'}
                </span>
              </div>

              <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative">
                {remoteStream ? (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-contain"
                  />
                ) : selectedStudent.previewScreenDataUrl ? (
                  <img
                    src={selectedStudent.previewScreenDataUrl}
                    alt="Live Candidate Screen"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-400 p-8 flex flex-col items-center">
                    <Video className="w-10 h-10 mx-auto mb-2 text-indigo-400 animate-pulse" />
                    <p className="text-xs font-semibold text-slate-200">Connecting candidate video feed...</p>
                    <p className="text-[10px] text-slate-400 mt-1">Waiting for initial video frames from student browser</p>
                  </div>
                )}

                {/* Webcam PIP in corner */}
                {selectedStudent.previewCamDataUrl && (
                  <div className="absolute bottom-3 right-3 w-32 h-24 rounded-lg border-2 border-indigo-500 overflow-hidden shadow-2xl bg-black">
                    <img
                      src={selectedStudent.previewCamDataUrl}
                      alt="Webcam PIP"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Violations Log with Timestamps & Images */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center justify-between">
                <span>Violations Log & Captured Evidence ({currentStudentViolations.length})</span>
                <span className="text-[11px] text-slate-500 font-normal">Evidence Database Records</span>
              </h3>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {currentStudentViolations.length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                    <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                    Clean session. No violation flags recorded for this candidate.
                  </div>
                ) : (
                  currentStudentViolations.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold uppercase text-[9px] px-1.5 py-0.5 rounded ${
                              v.severity === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {v.type}
                          </span>
                          <span className="text-slate-400 font-mono text-[10px]">
                            {new Date(v.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-slate-700 text-[11px]">{v.description || v.details}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(v.screenImageUrl || v.screenUrl) && (
                          <img
                            src={v.screenImageUrl || v.screenUrl}
                            alt="Screen Capture"
                            onClick={() => setPreviewImage(v.screenImageUrl || v.screenUrl)}
                            className="w-14 h-9 object-cover rounded border border-slate-200 cursor-pointer hover:border-indigo-500 transition-colors"
                          />
                        )}
                        {(v.camImageUrl || v.webcamUrl) && (
                          <img
                            src={v.camImageUrl || v.webcamUrl}
                            alt="Cam Capture"
                            onClick={() => setPreviewImage(v.camImageUrl || v.webcamUrl)}
                            className="w-14 h-9 object-cover rounded border border-slate-200 cursor-pointer hover:border-indigo-500 transition-colors"
                          />
                        )}
                        {!(v.screenImageUrl || v.screenUrl) && !(v.camImageUrl || v.webcamUrl) && (
                          <span className="text-[10px] text-slate-400 italic bg-slate-100 px-2 py-1 rounded">
                            Live Feed Only (Spark Free Tier)
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Zoom Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-slate-900/85 backdrop-blur-xs z-50 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="max-w-4xl w-full">
            <img
              src={previewImage}
              alt="Violation Evidence"
              className="w-full h-auto rounded-2xl border border-slate-700 shadow-2xl"
            />
            <p className="text-center text-xs text-white/80 mt-3">Click anywhere to close full-size evidence view</p>
          </div>
        </div>
      )}
    </div>
  );
};
