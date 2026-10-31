/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Teacher & Invigilator Dashboard
 * Features:
 * - Live candidate roster with online/offline heartbeats & risk metrics
 * - Real-time popup alerts: "🚨 Student ID: [ID] ([Name]) did something wrong - [Type] - [Time]"
 * - Screenshot & webcam photo evidence viewer
 * - Manual test termination button per candidate
 * - Complete violation history audit table per candidate
 * - Dark / Light theme toggle
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
  FileText
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { firebaseExamService } from '../services/firebaseExamService';
import { FirebaseWebRTCManager } from '../services/firebaseWebRTC';
import { demoService, playThreatAlertChime, DemoViolation } from '../services/demoService';
import { ProctorlyEyeIcon } from './ProctorlyLogo';

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
  const [activeTab, setActiveTab] = useState<'roster' | 'violations_table'>('roster');

  // Dark / Light Theme Toggle
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

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

  // Subscriptions for Live Sessions and Violations
  useEffect(() => {
    if (!exam?.id) return;

    if (isDemo) {
      const updateDemoData = () => {
        const studentList = demoService.getStudents(exam.id);
        const violationList = demoService.getViolations(exam.id);
        setSessions([...studentList]);

        // Check if a new violation arrived
        if (violationList.length > prevViolationCountRef.current && prevViolationCountRef.current !== 0) {
          const newest = violationList[0];
          triggerTeacherAlertPopup(newest);
        }
        prevViolationCountRef.current = violationList.length;
        setViolations([...violationList]);
      };

      updateDemoData();
      const unsub = demoService.subscribe(updateDemoData);
      return () => unsub();
    } else {
      // Cloud Firestore real-time listeners
      const unsubSessions = firebaseExamService.subscribeExamSessions(exam.id, (list) => {
        if (list.length > 0) {
          setSessions(list);
        } else {
          setSessions(demoService.getStudents());
        }
      });

      const unsubViolations = firebaseExamService.subscribeExamViolations(exam.id, (list) => {
        if (list.length > prevViolationCountRef.current && prevViolationCountRef.current !== 0) {
          const newest = list[0];
          triggerTeacherAlertPopup(newest);
        }
        prevViolationCountRef.current = list.length;
        if (list.length > 0) {
          setViolations(list);
        } else {
          setViolations(demoService.getViolations());
        }
      });

      return () => {
        unsubSessions();
        unsubViolations();
      };
    }
  }, [exam?.id, isDemo]);

  // Show teacher instant popup notification
  const triggerTeacherAlertPopup = (v: any) => {
    playThreatAlertChime();
    setLatestPopupAlert({
      id: v.id,
      studentId: v.rollNo || v.studentId || '101',
      studentName: v.studentName || 'Student',
      violationType: v.type || 'Integrity Violation',
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
    const webrtc = new FirebaseWebRTCManager(
      selectedStudent.id,
      'invigilator',
      (stream) => {
        setRemoteStream(stream);
        setWebrtcStatus('connected');
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      }
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

  // Check if candidate is active online
  const isStudentOnline = (student: any): boolean => {
    if (typeof student.isOnline === 'boolean') return student.isOnline;
    if (!student.lastHeartbeat) return false;
    return Date.now() - student.lastHeartbeat < 15000;
  };

  // MANUAL TERMINATION ACTION
  const handleTerminateStudent = async (student: any) => {
    const confirmTerm = confirm(
      `Are you sure you want to terminate the test for ${student.studentName} (${student.rollNo})?\nTheir test will immediately be locked and submitted.`
    );
    if (!confirmTerm) return;

    try {
      if (isDemo) {
        demoService.terminateStudent(student.id, 'Manually terminated by invigilator for integrity breach');
      } else {
        await firebaseExamService.terminateStudentSession(student.id, 'Manually terminated by invigilator');
      }

      // Update local student session
      setSessions((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, status: 'terminated', riskScore: 100 } : s))
      );

      if (selectedStudent && selectedStudent.id === student.id) {
        setSelectedStudent((prev: any) => ({ ...prev, status: 'terminated' }));
      }

      alert(`Test terminated for ${student.studentName}.`);
    } catch (err: any) {
      alert(err.message || 'Failed to terminate student test');
    }
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
    a.download = `Proctorly_${exam.code}_Audit_Report.csv`;
    a.click();
  };

  // Export PDF of audit report
  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(56, 189, 248);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PROCTORLY CLOUD INVIGILATION AUDIT REPORT', 14, 18);

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

    doc.save(`OmniProctor_${exam.code}_Audit.pdf`);
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

  const themeContainer = isDarkMode
    ? 'bg-slate-950 text-slate-100'
    : 'bg-slate-50 text-slate-900';
  const themeCard = isDarkMode
    ? 'bg-slate-900 border-slate-800'
    : 'bg-white border-slate-200 shadow-sm';
  const themeCardHeader = isDarkMode
    ? 'bg-slate-900/90 border-slate-800 text-white'
    : 'bg-slate-100 border-slate-200 text-slate-900';
  const themeSubtext = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  return (
    <div className={`min-h-screen ${themeContainer} p-4 sm:p-6 transition-colors`}>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Top Header Bar */}
        <div className={`p-5 rounded-2xl border ${themeCard} flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg`}>
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                isDarkMode ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
              }`}
              title="Return to Exams List"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <ProctorlyEyeIcon size={24} />
                <h1 className="text-xl font-bold tracking-tight">{exam.title}</h1>
                <span className="font-mono text-xs font-bold text-cyan-400 bg-slate-950 px-2.5 py-0.5 rounded border border-slate-800">
                  Code: {exam.code}
                </span>
                {isDemo && (
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-800">
                    Live Demo Active
                  </span>
                )}
              </div>
              <p className={`text-xs ${themeSubtext} mt-0.5`}>
                Proctorly Invigilation Console • {exam.instituteName || 'Department Examination'} • Real-Time AI Cheating Feeds
              </p>
            </div>
          </div>

          {/* Action Buttons & Theme Toggle */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Dark / Light Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer font-semibold ${
                isDarkMode ? 'bg-slate-800 border-slate-700 text-amber-300' : 'bg-slate-200 border-slate-300 text-slate-800'
              }`}
              title="Toggle Dark / Light Theme"
            >
              {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            <button
              onClick={() => window.open(candidateShareUrl, '_blank')}
              className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30 flex items-center gap-1.5 transition-colors cursor-pointer font-semibold"
              title="Open a separate browser tab to test as student"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Student Tab</span>
            </button>

            <button
              onClick={exportCsv}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition-colors cursor-pointer font-semibold ${
                isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={exportPdf}
              className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF Report</span>
            </button>
          </div>
        </div>

        {/* View Switcher: Live Cards Roster vs. Complete Violation History Table */}
        <div className="flex gap-2 border-b border-slate-800 pb-2 text-xs">
          <button
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'roster'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Active Candidate Cards ({sessions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('violations_table')}
            className={`px-4 py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'violations_table'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-rose-400" />
            <span>Violation History Table ({violations.length})</span>
          </button>
        </div>

        {/* TAB 1: ACTIVE CANDIDATE ROSTER + REAL-TIME FEED */}
        {activeTab === 'roster' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Student Grid Section */}
            <div className="lg:col-span-3 space-y-4">
              {/* Search & Filter Bar */}
              <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl border ${themeCard}`}>
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search candidate name or roll number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs w-full sm:w-auto">
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
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
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
                  <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                  <p className="text-sm font-semibold">No Candidates Found</p>
                  <p className={`text-xs ${themeSubtext} mt-1`}>
                    Share your exam link with students or click "Open Student Tab" to begin taking the exam.
                  </p>
                </div>
              ) : (
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
                        className={`rounded-2xl border transition-all overflow-hidden flex flex-col justify-between shadow-lg relative group ${
                          isTerm
                            ? 'border-rose-600 bg-rose-950/20'
                            : isFlagged
                            ? 'border-rose-500/80'
                            : vCount > 0
                            ? 'border-amber-500/60'
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
                                  ? 'bg-emerald-400 animate-ping'
                                  : 'bg-slate-500'
                              }`}
                            />
                            <div>
                              <div className="font-bold text-xs leading-tight">
                                {student.studentName}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">{student.rollNo}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isTerm ? (
                              <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                                Terminated
                              </span>
                            ) : (
                              <span
                                className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                  online
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
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
                          className="aspect-video bg-slate-950 rounded-lg overflow-hidden m-2 border border-slate-800 relative flex items-center justify-center cursor-pointer"
                        >
                          {student.previewScreenDataUrl ? (
                            <img
                              src={student.previewScreenDataUrl}
                              alt="Screen Feed"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center text-slate-500 text-xs flex flex-col items-center gap-1">
                              <Monitor className="w-6 h-6" />
                              <span>Click to Watch Live Stream</span>
                            </div>
                          )}

                          {/* Webcam PIP in corner */}
                          {student.previewCamDataUrl && (
                            <div className="absolute bottom-2 right-2 w-16 h-12 rounded border border-slate-700 overflow-hidden shadow-lg bg-slate-950">
                              <img
                                src={student.previewCamDataUrl}
                                alt="Cam PIP"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          <div className="absolute top-2 left-2 text-[9px] font-bold bg-slate-950/90 px-2 py-0.5 rounded text-cyan-400 font-mono">
                            Status: {student.status}
                          </div>
                        </div>

                        {/* Footer with Manual Terminate & Inspect */}
                        <div className={`p-3 border-t flex items-center justify-between text-xs ${themeCardHeader}`}>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px]">
                              Risk: <strong className="text-cyan-400">{student.riskScore || 0}%</strong>
                            </span>
                            <span>•</span>
                            <span className="text-[11px]">
                              Warnings:{' '}
                              <strong className={vCount >= 3 ? 'text-rose-400' : vCount > 0 ? 'text-amber-400' : 'text-slate-400'}>
                                {vCount}/3
                              </strong>
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {!isTerm && (
                              <button
                                onClick={() => handleTerminateStudent(student)}
                                className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                title="Manually terminate this candidate's test immediately"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Terminate</span>
                              </button>
                            )}

                            <button
                              onClick={() => setSelectedStudent(student)}
                              className="px-2 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
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
            <div className={`rounded-2xl border p-4 flex flex-col h-[750px] shadow-xl ${themeCard}`}>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <Bell className="w-4 h-4 text-cyan-400" />
                  <span>Real-Time Alerts Feed</span>
                </h3>
                <span className="text-[10px] font-mono text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800 animate-pulse">
                  {violations.length} Captured
                </span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {violations.length === 0 ? (
                  <div className="text-center py-20 text-slate-500 text-xs">
                    <CheckCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p>No proctoring violations recorded yet.</p>
                  </div>
                ) : (
                  violations.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        const match = sessions.find((s) => s.id === v.sessionId);
                        if (match) setSelectedStudent(match);
                      }}
                      className="p-3 bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl transition-all cursor-pointer text-xs space-y-2 group"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            v.severity === 'CRITICAL'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {v.type}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>

                      <div>
                        <div className="font-bold text-white group-hover:text-cyan-400 transition-colors">
                          {v.studentName} (ID: {v.rollNo || v.studentId})
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2">{v.description || v.details}</p>
                      </div>

                      {/* Evidence Thumbnails */}
                      {(v.screenImageUrl || v.screenUrl || v.camImageUrl || v.webcamUrl) && (
                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          {(v.screenImageUrl || v.screenUrl) && (
                            <img
                              src={v.screenImageUrl || v.screenUrl}
                              alt="Screen"
                              className="aspect-video object-cover rounded border border-slate-800 hover:border-cyan-400 transition-colors"
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
                              className="aspect-video object-cover rounded border border-slate-800 hover:border-cyan-400 transition-colors"
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
          <div className={`rounded-2xl border p-6 shadow-xl overflow-x-auto ${themeCard}`}>
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold">Audit Violation Evidence History Table</h2>
                <p className={`text-xs ${themeSubtext} mt-0.5`}>
                  Chronological evidence logs with screenshot and webcam camera captures per student
                </p>
              </div>

              <span className="font-mono text-xs font-bold text-rose-400 bg-rose-950/80 px-3 py-1 rounded-full border border-rose-800">
                Total Incident Logs: {violations.length}
              </span>
            </div>

            {violations.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs">
                <CheckCircle className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p>Clean Examination: Zero violations have been detected or reported.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className={`border-b ${isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
                    <th className="py-3 px-3">Student ID</th>
                    <th className="py-3 px-3">Candidate Name</th>
                    <th className="py-3 px-3">Violation Type</th>
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Screen Evidence</th>
                    <th className="py-3 px-3">Webcam Photo</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {violations.map((v) => {
                    const matchStudent = sessions.find((s) => s.id === v.sessionId);
                    return (
                      <tr
                        key={v.id}
                        className={`hover:bg-slate-900/50 transition-colors ${
                          v.severity === 'CRITICAL' ? 'bg-rose-950/10' : ''
                        }`}
                      >
                        <td className="py-3 px-3 font-mono font-bold text-indigo-400">
                          {v.rollNo || v.studentId || '101'}
                        </td>
                        <td className="py-3 px-3 font-semibold">{v.studentName}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              v.severity === 'CRITICAL'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {v.type}
                          </span>
                          <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">{v.description || v.details}</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400">
                          {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-3 px-3">
                          {v.screenImageUrl || v.screenUrl ? (
                            <img
                              src={v.screenImageUrl || v.screenUrl}
                              alt="Screen Evidence"
                              onClick={() => setPreviewImage(v.screenImageUrl || v.screenUrl)}
                              className="w-16 h-10 object-cover rounded border border-slate-700 cursor-pointer hover:scale-105 transition-transform"
                            />
                          ) : (
                            <span className="text-slate-600 font-mono text-[10px]">No capture</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {v.camImageUrl || v.webcamUrl ? (
                            <img
                              src={v.camImageUrl || v.webcamUrl}
                              alt="Webcam Photo"
                              onClick={() => setPreviewImage(v.camImageUrl || v.webcamUrl)}
                              className="w-16 h-10 object-cover rounded border border-slate-700 cursor-pointer hover:scale-105 transition-transform"
                            />
                          ) : (
                            <span className="text-slate-600 font-mono text-[10px]">No capture</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {matchStudent && matchStudent.status !== 'terminated' ? (
                            <button
                              onClick={() => handleTerminateStudent(matchStudent)}
                              className="px-2 py-1 bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 rounded text-[10px] font-bold cursor-pointer transition-colors"
                            >
                              Terminate Test
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 uppercase font-mono">Terminated</span>
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
        <div className="fixed top-5 right-5 z-50 max-w-md w-full bg-slate-900 border-2 border-rose-500 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-top duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-black text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🚨 Cheating Alert Intercepted</span>
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  Student ID: {latestPopupAlert.studentId} ({latestPopupAlert.studentName})
                </div>
                <div className="text-xs text-slate-300 mt-1">
                  Violation: <strong className="text-rose-300 font-semibold">{latestPopupAlert.violationType}</strong> at {latestPopupAlert.time}
                </div>
              </div>
            </div>

            <button
              onClick={() => setLatestPopupAlert(null)}
              className="text-slate-400 hover:text-white p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Captured Thumbnails */}
          {(latestPopupAlert.screenUrl || latestPopupAlert.camUrl) && (
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800">
              {latestPopupAlert.screenUrl && (
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Screen Screenshot</div>
                  <img
                    src={latestPopupAlert.screenUrl}
                    alt="Screen Screenshot"
                    onClick={() => setPreviewImage(latestPopupAlert.screenUrl || null)}
                    className="w-full h-20 object-cover rounded-lg border border-slate-700 cursor-pointer hover:border-cyan-400"
                  />
                </div>
              )}
              {latestPopupAlert.camUrl && (
                <div>
                  <div className="text-[9px] uppercase font-bold text-slate-400 mb-1">Webcam Photo</div>
                  <img
                    src={latestPopupAlert.camUrl}
                    alt="Webcam Photo"
                    onClick={() => setPreviewImage(latestPopupAlert.camUrl || null)}
                    className="w-full h-20 object-cover rounded-lg border border-slate-700 cursor-pointer hover:border-cyan-400"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected Student Modal: Live WebRTC Stream + Violation Log + Manual Terminate */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl my-8 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{selectedStudent.studentName}</h2>
                  <span className="font-mono text-xs text-indigo-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    ID: {selectedStudent.rollNo}
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    selectedStudent.status === 'terminated'
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {selectedStudent.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Integrity Risk Score: <strong className="text-amber-400">{selectedStudent.riskScore || 0}%</strong> • Total Flags: <strong className="text-rose-400">{currentStudentViolations.length}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedStudent.status !== 'terminated' && (
                  <button
                    onClick={() => handleTerminateStudent(selectedStudent)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-lg shadow-rose-600/30"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Terminate Test Now</span>
                  </button>
                )}
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Live WebRTC Screen Watcher with Fallback */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6">
              <div className="flex justify-between items-center text-xs font-bold text-slate-300 mb-2">
                <span className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-cyan-400" />
                  <span>Live Candidate Desktop Screen & Self-View Webcam</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400">
                  {remoteStream
                    ? '● WebRTC Stream Active'
                    : selectedStudent.previewScreenDataUrl
                    ? '● Live Snapshot Stream (5s Fallback Active)'
                    : 'Initializing Signaling...'}
                </span>
              </div>

              <div className="aspect-video bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative">
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
                    alt="Screen Stream"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center text-slate-500 p-8">
                    <Monitor className="w-12 h-12 mx-auto mb-2 text-slate-700 animate-pulse" />
                    <p className="text-xs">Connecting peer-to-peer WebRTC stream...</p>
                  </div>
                )}

                {/* Webcam PIP in corner */}
                {selectedStudent.previewCamDataUrl && (
                  <div className="absolute bottom-3 right-3 w-32 h-24 rounded-lg border-2 border-indigo-500/80 overflow-hidden shadow-2xl bg-slate-950">
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
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
                <span>Violations Log & Captured Evidence ({currentStudentViolations.length})</span>
                <span className="text-[11px] text-slate-500 font-normal">Evidence Database Records</span>
              </h3>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {currentStudentViolations.length === 0 ? (
                  <div className="p-6 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                    Clean session. No violation flags recorded for this candidate.
                  </div>
                ) : (
                  currentStudentViolations.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold uppercase text-[9px] px-1.5 py-0.5 rounded ${
                              v.severity === 'CRITICAL'
                                ? 'bg-rose-950 text-rose-300'
                                : 'bg-amber-950 text-amber-300'
                            }`}
                          >
                            {v.type}
                          </span>
                          <span className="text-slate-500 font-mono text-[10px]">
                            {new Date(v.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px]">{v.description || v.details}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(v.screenImageUrl || v.screenUrl) && (
                          <img
                            src={v.screenImageUrl || v.screenUrl}
                            alt="Screen Capture"
                            onClick={() => setPreviewImage(v.screenImageUrl || v.screenUrl)}
                            className="w-14 h-9 object-cover rounded border border-slate-700 cursor-pointer hover:border-cyan-400 transition-colors"
                          />
                        )}
                        {(v.camImageUrl || v.webcamUrl) && (
                          <img
                            src={v.camImageUrl || v.webcamUrl}
                            alt="Cam Capture"
                            onClick={() => setPreviewImage(v.camImageUrl || v.webcamUrl)}
                            className="w-14 h-9 object-cover rounded border border-slate-700 cursor-pointer hover:border-cyan-400 transition-colors"
                          />
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
          className="fixed inset-0 bg-slate-950/95 z-50 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div className="max-w-4xl w-full">
            <img
              src={previewImage}
              alt="Violation Evidence"
              className="w-full h-auto rounded-2xl border border-slate-800 shadow-2xl"
            />
            <p className="text-center text-xs text-slate-400 mt-3">Click anywhere to close full-size evidence view</p>
          </div>
        </div>
      )}
    </div>
  );
};
