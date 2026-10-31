/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Teacher Examinations Management & Shareable Links
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  BookOpen,
  Users,
  AlertTriangle,
  Play,
  FileSpreadsheet,
  Trash2,
  Copy,
  FileText,
  Clock,
  Sparkles,
  Share2,
  QrCode,
  ExternalLink,
  CheckCircle2,
  MessageSquare,
  Mail,
  X,
  Upload,
  Download,
  ShieldAlert
} from 'lucide-react';
import QRCode from 'qrcode';
import { firebaseExamService, ExamData, Question } from '../services/firebaseExamService';
import { demoService } from '../services/demoService';
import { ProctorlyEyeIcon } from './ProctorlyLogo';

interface AdminExamListProps {
  onSelectExam: (exam: ExamData, view: 'dashboard' | 'reports') => void;
  onOpenStudentView?: (exam: ExamData) => void;
  isDemo?: boolean;
}

export const AdminExamList: React.FC<AdminExamListProps> = ({
  onSelectExam,
  onOpenStudentView,
  isDemo = false
}) => {
  const [exams, setExams] = useState<ExamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Share & QR Modal
  const [sharingExam, setSharingExam] = useState<ExamData | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [instituteName, setInstituteName] = useState('Stanford Polytech Institute of Computing');
  const [customCode, setCustomCode] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [startTime, setStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [endTime, setEndTime] = useState(new Date(Date.now() + 4 * 3600000).toISOString().slice(0, 16));
  const [description, setDescription] = useState('');
  const [requireFullscreen, setRequireFullscreen] = useState(true);

  // Questions
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: 'q1',
      question: 'Which consistency model ensures that all reads return the value of the most recent write?',
      optionA: 'Eventual Consistency',
      optionB: 'Strict Linearizability',
      optionC: 'Causal Ordering',
      optionD: 'Monotonic Reads',
      correctAnswer: 'B',
      marks: 2.0
    },
    {
      id: 'q2',
      question: 'In WebRTC, what protocol is used by peers to discover their public IP address when behind NAT?',
      optionA: 'STUN (Session Traversal Utilities for NAT)',
      optionB: 'DHCP (Dynamic Host Config)',
      optionC: 'BGP (Border Gateway)',
      optionD: 'SNMP (Simple Network Management)',
      correctAnswer: 'A',
      marks: 2.0
    }
  ]);

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchExams = async () => {
    setLoading(true);
    try {
      if (isDemo) {
        setExams(demoService.getExams());
      } else {
        const list = await firebaseExamService.getExams();
        setExams(list.length > 0 ? list : demoService.getExams());
      }
    } catch (err) {
      console.warn('Falling back to demo exams:', err);
      setExams(demoService.getExams());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
    if (isDemo) {
      const unsub = demoService.subscribe(() => {
        setExams(demoService.getExams());
      });
      return () => unsub();
    }
  }, [isDemo]);

  const getShareUrl = (exam: ExamData) => {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    return `${origin}${pathname}?exam=${exam.id}&code=${exam.code}`;
  };

  const openShareModal = async (exam: ExamData) => {
    setSharingExam(exam);
    const url = getShareUrl(exam);
    try {
      const qr = await QRCode.toDataURL(url, {
        width: 260,
        margin: 2,
        color: { dark: '#020617', light: '#ffffff' }
      });
      setQrCodeDataUrl(qr);
    } catch (e) {
      console.error('QR generation error:', e);
    }
  };

  const copyToClipboard = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2500);
    } else {
      setCopiedLink(text);
      setTimeout(() => setCopiedLink(null), 2500);
    }
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Are you sure you want to delete this examination?')) return;
    try {
      if (isDemo) {
        demoService.deleteExam(id);
      } else {
        await firebaseExamService.deleteExam(id);
      }
      fetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to delete exam');
    }
  };

  const addQuestionField = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${Date.now()}_${prev.length + 1}`,
        question: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctAnswer: 'A',
        marks: 2.0
      }
    ]);
  };

  // CSV Import handler
  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      const lines = text.split('\n').filter((l) => l.trim().length > 0);
      const parsed: Question[] = [];

      lines.forEach((line, index) => {
        if (index === 0 && line.toLowerCase().includes('question')) {
          return; // skip header
        }

        const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length >= 6) {
          parsed.push({
            id: `q_csv_${Date.now()}_${index}`,
            question: cols[0],
            optionA: cols[1],
            optionB: cols[2],
            optionC: cols[3],
            optionD: cols[4] || '',
            correctAnswer: (cols[5] || 'A').toUpperCase(),
            marks: parseFloat(cols[6]) || 2.0
          });
        }
      });

      if (parsed.length > 0) {
        setQuestions((prev) => [...prev, ...parsed]);
        alert(`Successfully imported ${parsed.length} questions from CSV!`);
      } else {
        alert('Could not parse questions. CSV format: question,optA,optB,optC,optD,correct,marks');
      }
    };
    reader.readAsText(file);
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    const generatedCode = customCode ? customCode.trim().toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();

    const payload = {
      code: generatedCode,
      title: title.trim(),
      instituteName: instituteName.trim(),
      description: description.trim(),
      durationMinutes: Number(durationMinutes),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      createdBy: 'Teacher / Invigilator',
      requireFullscreen,
      questions
    };

    try {
      if (isDemo) {
        demoService.createExam(payload);
      } else {
        await firebaseExamService.createExam(payload);
      }

      setShowCreateModal(false);
      fetchExams();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to save examination');
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner if in Demo Mode */}
      {isDemo && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-slate-900 to-indigo-950/60 border border-cyan-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
            <div>
              <span className="font-bold text-white text-sm">Demo Mode Active:</span>{' '}
              <span className="text-xs text-slate-300">
                Connected to in-memory simulation engine with 6 live students and instant multi-tab sync.
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              const testExam = exams[0] || demoService.getExams()[0];
              if (onOpenStudentView) {
                onOpenStudentView(testExam);
              } else {
                window.open(`${window.location.origin}${window.location.pathname}?exam=${testExam.id}&code=${testExam.code}`, '_blank');
              }
            }}
            className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow transition-all cursor-pointer shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Candidate Test Tab</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <ProctorlyEyeIcon size={26} />
            <span>Proctorly Examinations & Invigilation</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Create proctored assessments, generate student invite links/QR codes, and launch live invigilation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Exam</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-cyan-400 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading examinations...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center max-w-xl mx-auto">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-base font-bold text-white mb-1">No Examinations Found</h3>
          <p className="text-xs text-slate-400 mb-6">Create your first examination to generate share links for students.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl hover:bg-indigo-500 transition-colors cursor-pointer"
          >
            Create Examination
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam) => {
            const isLive = new Date() >= new Date(exam.startTime) && new Date() <= new Date(exam.endTime);
            const shareUrl = getShareUrl(exam);

            return (
              <div
                key={exam.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 transition-all flex flex-col justify-between shadow-xl"
              >
                <div>
                  {/* Top Status & Code */}
                  <div className="flex items-center justify-between mb-3">
                    <span
                      onClick={() => copyToClipboard(exam.code, 'code')}
                      className="font-mono text-xs font-bold text-cyan-300 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 hover:border-cyan-500 transition-colors cursor-pointer flex items-center gap-1.5"
                      title="Click to copy exam code"
                    >
                      <span>Code: {exam.code}</span>
                      <Copy className="w-3 h-3 text-slate-400" />
                    </span>

                    {copiedCode === exam.code && (
                      <span className="text-[10px] text-emerald-400 font-semibold animate-pulse">Copied!</span>
                    )}

                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        isLive
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : new Date() < new Date(exam.startTime)
                          ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isLive ? 'Active Window' : new Date() < new Date(exam.startTime) ? 'Scheduled' : 'Ended'}
                    </span>
                  </div>

                  <h3 className="font-bold text-base text-white mb-1 line-clamp-1">{exam.title}</h3>
                  <div className="text-[11px] text-indigo-400 font-medium mb-2">{exam.instituteName || 'Department of Computing'}</div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-4">{exam.description || 'Proctored examination.'}</p>

                  <div className="grid grid-cols-2 gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-center mb-4">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Duration</div>
                      <div className="text-xs font-bold text-slate-200">{exam.durationMinutes}m</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Questions</div>
                      <div className="text-xs font-bold text-cyan-400">{exam.questions?.length || 0} MCQs</div>
                    </div>
                  </div>

                  {/* Share Link Card */}
                  <div className="bg-indigo-950/30 border border-indigo-900/50 p-2.5 rounded-xl mb-4 text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase font-semibold text-indigo-300 flex items-center gap-1">
                        <Share2 className="w-3 h-3 text-cyan-400" />
                        <span>Student Invite Link</span>
                      </span>
                      <button
                        onClick={() => openShareModal(exam)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <QrCode className="w-3 h-3" />
                        <span>QR & Share</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="flex-1 bg-slate-950/80 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-300 truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(shareUrl, 'link')}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                        title="Copy Exam URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onSelectExam(exam, 'dashboard')}
                      className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-md shadow-indigo-600/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Live Invigilation</span>
                    </button>

                    <button
                      onClick={() => onSelectExam(exam, 'reports')}
                      className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Audit Reports</span>
                    </button>
                  </div>

                  <div className="flex justify-between items-center pt-2 text-[11px] text-slate-500">
                    <button
                      onClick={() => {
                        if (onOpenStudentView) {
                          onOpenStudentView(exam);
                        } else {
                          window.open(shareUrl, '_blank');
                        }
                      }}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Test as Candidate</span>
                    </button>

                    <button
                      onClick={() => deleteExam(exam.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors p-1 cursor-pointer"
                      title="Delete Exam"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share & QR Code Modal */}
      {sharingExam && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setSharingExam(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-2 border border-indigo-500/20">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">Student Examination Access</h3>
              <p className="text-xs text-slate-400 mt-1">{sharingExam.title}</p>
              <div className="inline-block mt-2 font-mono text-xs font-bold text-cyan-300 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                Exam Code: {sharingExam.code}
              </div>
            </div>

            {/* QR Code */}
            {qrCodeDataUrl && (
              <div className="bg-white p-4 rounded-2xl w-56 h-56 mx-auto mb-6 flex items-center justify-center shadow-xl">
                <img src={qrCodeDataUrl} alt="Exam QR Code" className="w-full h-full" />
              </div>
            )}

            {/* Share link input */}
            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Direct Candidate Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getShareUrl(sharingExam)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs font-mono truncate"
                />
                <button
                  onClick={() => copyToClipboard(getShareUrl(sharingExam), 'link')}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                >
                  {copiedLink === getShareUrl(sharingExam) ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Instant Social / Email Buttons */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                  `Please join the proctored exam "${sharingExam.title}". Access Link: ${getShareUrl(sharingExam)} (Code: ${sharingExam.code})`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp Share</span>
              </a>

              <a
                href={`mailto:?subject=${encodeURIComponent(`Proctored Examination Access: ${sharingExam.title}`)}&body=${encodeURIComponent(
                  `Dear Candidate,\n\nPlease access your scheduled proctored examination using the link below:\n\n${getShareUrl(
                    sharingExam
                  )}\n\nExam Code: ${sharingExam.code}\n\nEnsure camera, microphone, and entire screen permissions are allowed.`
                )}`}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Email Invite</span>
              </a>
            </div>

            <button
              onClick={() => {
                const url = getShareUrl(sharingExam);
                setSharingExam(null);
                if (onOpenStudentView) {
                  onOpenStudentView(sharingExam);
                } else {
                  window.open(url, '_blank');
                }
              }}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-cyan-300 border border-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Student View Directly</span>
            </button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl my-8 p-6 sm:p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">Create Proctored Examination</h2>
            <p className="text-xs text-slate-400 mb-6">
              Configure assessment parameters, MCQ bank, duration, and proctoring constraints.
            </p>

            {createError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateExam} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Exam Title <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. CS401: Distributed Cloud Architecture"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Institute / University Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={instituteName}
                    onChange={(e) => setInstituteName(e.target.value)}
                    placeholder="e.g. Stanford Polytech Institute"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Exam Code
                  </label>
                  <input
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    placeholder="e.g. MID2026 (Auto if empty)"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-cyan-300 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Duration (Minutes) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={5}
                    max={300}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10))}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Start Window
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    End Window
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="reqFullscreen"
                    checked={requireFullscreen}
                    onChange={(e) => setRequireFullscreen(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
                  />
                  <label htmlFor="reqFullscreen" className="text-xs text-slate-300 cursor-pointer select-none">
                    <strong className="text-white">Require Fullscreen Mode:</strong> Automatically trigger fullscreen upon test start and log un-fullscreen events as violations.
                  </label>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                    Description & Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Instructions or examination overview for candidate..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Questions Builder & CSV Import */}
              <div className="pt-4 border-t border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Questions Definition ({questions.length} Questions)
                  </span>

                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-cyan-300 font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload CSV</span>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleCSVImport}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={addQuestionField}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                    >
                      + Add Question
                    </button>
                  </div>
                </div>

                <div className="space-y-4 max-h-72 overflow-y-auto pr-2">
                  {questions.map((q, idx) => (
                    <div key={q.id || idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                      <div className="flex justify-between items-center text-xs font-bold text-indigo-400">
                        <span>Question {idx + 1}</span>
                        {questions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                            className="text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        required
                        value={q.question}
                        onChange={(e) => {
                          const copy = [...questions];
                          copy[idx].question = e.target.value;
                          setQuestions(copy);
                        }}
                        placeholder="Enter question text..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-white text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <input
                          type="text"
                          required
                          placeholder="Option A"
                          value={q.optionA}
                          onChange={(e) => {
                            const copy = [...questions];
                            copy[idx].optionA = e.target.value;
                            setQuestions(copy);
                          }}
                          className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Option B"
                          value={q.optionB}
                          onChange={(e) => {
                            const copy = [...questions];
                            copy[idx].optionB = e.target.value;
                            setQuestions(copy);
                          }}
                          className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                        />
                        <input
                          type="text"
                          placeholder="Option C"
                          value={q.optionC}
                          onChange={(e) => {
                            const copy = [...questions];
                            copy[idx].optionC = e.target.value;
                            setQuestions(copy);
                          }}
                          className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                        />
                        <input
                          type="text"
                          placeholder="Option D"
                          value={q.optionD}
                          onChange={(e) => {
                            const copy = [...questions];
                            copy[idx].optionD = e.target.value;
                            setQuestions(copy);
                          }}
                          className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-white"
                        />
                      </div>
                      <div className="flex gap-4 items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Correct:</span>
                          <select
                            value={q.correctAnswer}
                            onChange={(e) => {
                              const copy = [...questions];
                              copy[idx].correctAnswer = e.target.value;
                              setQuestions(copy);
                            }}
                            className="px-2 py-1 bg-slate-900 border border-slate-800 rounded text-cyan-300 font-bold"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Marks:</span>
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={q.marks}
                            onChange={(e) => {
                              const copy = [...questions];
                              copy[idx].marks = parseFloat(e.target.value) || 1;
                              setQuestions(copy);
                            }}
                            className="w-16 px-2 py-1 bg-slate-900 border border-slate-800 rounded text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-xs font-bold text-white transition-all shadow-lg shadow-indigo-600/30 cursor-pointer flex items-center gap-2"
                >
                  {createLoading ? (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <span>Publish & Generate Share Link</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
