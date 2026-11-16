/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Teacher Examinations Management, Question Editor & Shareable Links (White-Theme SaaS Design)
 * Features:
 * - Complete Question Management: Add, Edit, Delete (with confirmation dialog), Duplicate, Reorder, Preview, Marks, Types
 * - Question Types: MCQ (Single Select), Multiple Select, Short Answer, with live candidate preview
 * - Published Assessment Protection: Guards question set mutations when candidate submissions exist
 * - Edit Existing Exam & Questions modal with cloud database synchronization
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  BookOpen,
  Play,
  Trash2,
  Copy,
  FileText,
  Share2,
  QrCode,
  ExternalLink,
  X,
  Upload,
  Clock,
  Sparkles,
  Edit3,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  AlertTriangle,
  AlertCircle,
  CheckSquare,
  Square
} from 'lucide-react';
import QRCode from 'qrcode';
import { firebaseExamService, ExamData, Question, QuestionType } from '../services/firebaseExamService';
import { demoService } from '../services/demoService';
import { api } from '../services/api';
import { ExamCoLogo } from './ExamCoLogo';

function toLocalDateTimeInput(date: Date | string | number): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExam, setEditingExam] = useState<ExamData | null>(null);
  const [activeAttemptCount, setActiveAttemptCount] = useState(0);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Share & QR Modal
  const [sharingExam, setSharingExam] = useState<ExamData | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  // Question Delete Confirmation Dialog State
  const [deletingQuestion, setDeletingQuestion] = useState<{ index: number; question: Question } | null>(null);

  // Question Preview Toggle State
  const [previewingQuestionId, setPreviewingQuestionId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [instituteName, setInstituteName] = useState('Stanford Polytech Institute of Computing');
  const [customCode, setCustomCode] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [startTime, setStartTime] = useState(toLocalDateTimeInput(Date.now()));
  const [endTime, setEndTime] = useState(toLocalDateTimeInput(Date.now() + 7 * 24 * 3600000));
  const [description, setDescription] = useState('');
  const [requireFullscreen, setRequireFullscreen] = useState(true);
  const [allowEarlyStart, setAllowEarlyStart] = useState(false);

  // Questions List
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: `q_${Date.now()}_1`,
      type: 'mcq',
      question: 'Which consistency model ensures that all reads return the value of the most recent write?',
      optionA: 'Eventual Consistency',
      optionB: 'Strict Linearizability',
      optionC: 'Causal Ordering',
      optionD: 'Monotonic Reads',
      correctAnswer: 'B',
      marks: 2.0
    },
    {
      id: `q_${Date.now()}_2`,
      type: 'mcq',
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
    setLoadError(null);
    try {
      if (isDemo) {
        setExams(demoService.getExams());
      } else {
        try {
          const res = await api.listExams();
          if (res && Array.isArray(res.exams)) {
            const mapped: ExamData[] = res.exams.map((e: any) => ({
              id: String(e._id || e.id),
              code: e.examCode || e.code,
              title: e.title,
              description: e.description || '',
              durationMinutes: e.duration || e.durationMinutes || 60,
              startTime: e.startTime,
              endTime: e.endTime,
              createdBy: e.teacherId || 'Teacher',
              questions: (e.questions || []).map((q: any) => ({
                id: q.id,
                type: q.type || 'mcq',
                question: q.question,
                options: q.options || [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean),
                optionA: q.options?.[0] || q.optionA || '',
                optionB: q.options?.[1] || q.optionB || '',
                optionC: q.options?.[2] || q.optionC || '',
                optionD: q.options?.[3] || q.optionD || '',
                correctAnswer: q.correctAnswer,
                marks: Number(q.marks) || 1
              })),
              createdAt: e.createdAt,
              instituteName: e.settings?.instituteName || e.instituteName,
              requireFullscreen: e.settings?.requireFullscreen ?? true,
              status: e.status || 'published',
              allowEarlyStart: Boolean(e.settings?.allowEarlyStart ?? e.allowEarlyStart),
              settings: e.settings || {
                instituteName: e.settings?.instituteName || e.instituteName,
                requireFullscreen: e.settings?.requireFullscreen ?? true,
                allowEarlyStart: Boolean(e.settings?.allowEarlyStart ?? e.allowEarlyStart)
              }
            }));
            setExams(mapped);
          } else {
            setExams(await firebaseExamService.getExams());
          }
        } catch {
          setExams(await firebaseExamService.getExams());
        }
      }
    } catch (err) {
      console.error('Failed to load examinations:', err);
      setExams([]);
      setLoadError(err instanceof Error ? err.message : 'Failed to load examinations.');
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
        color: { dark: '#0f172a', light: '#ffffff' }
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
        try {
          await api.deleteExam(id);
        } catch {
          await firebaseExamService.deleteExam(id);
        }
      }
      fetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to delete exam');
    }
  };

  // Open Create Exam Modal
  const openCreateModal = () => {
    setEditingExam(null);
    setActiveAttemptCount(0);
    setTitle('');
    setInstituteName('Stanford Polytech Institute of Computing');
    setCustomCode('');
    setDurationMinutes(45);
    setStartTime(toLocalDateTimeInput(Date.now()));
    setEndTime(toLocalDateTimeInput(Date.now() + 7 * 24 * 3600000));
    setDescription('');
    setRequireFullscreen(true);
    setAllowEarlyStart(false);
    setQuestions([
      {
        id: `q_${Date.now()}_1`,
        type: 'mcq',
        question: 'Which consistency model ensures that all reads return the value of the most recent write?',
        optionA: 'Eventual Consistency',
        optionB: 'Strict Linearizability',
        optionC: 'Causal Ordering',
        optionD: 'Monotonic Reads',
        correctAnswer: 'B',
        marks: 2.0
      },
      {
        id: `q_${Date.now()}_2`,
        type: 'mcq',
        question: 'In WebRTC, what protocol is used by peers to discover their public IP address when behind NAT?',
        optionA: 'STUN (Session Traversal Utilities for NAT)',
        optionB: 'DHCP (Dynamic Host Config)',
        optionC: 'BGP (Border Gateway)',
        optionD: 'SNMP (Simple Network Management)',
        correctAnswer: 'A',
        marks: 2.0
      }
    ]);
    setCreateError(null);
    setShowCreateModal(true);
  };

  // Open Edit Exam Modal with candidate attempt inspection
  const openEditModal = async (exam: ExamData) => {
    setEditingExam(exam);
    setTitle(exam.title || '');
    setInstituteName(exam.instituteName || 'Stanford Polytech Institute of Computing');
    setCustomCode(exam.code || '');
    setDurationMinutes(exam.durationMinutes || 45);
    setStartTime(exam.startTime ? toLocalDateTimeInput(exam.startTime) : toLocalDateTimeInput(Date.now()));
    setEndTime(exam.endTime ? toLocalDateTimeInput(exam.endTime) : toLocalDateTimeInput(Date.now() + 7 * 24 * 3600000));
    setDescription(exam.description || '');
    setRequireFullscreen(exam.requireFullscreen ?? true);
    setAllowEarlyStart(Boolean(exam.allowEarlyStart ?? exam.settings?.allowEarlyStart));
    setQuestions(
      (exam.questions || []).map((q: any, idx: number) => ({
        id: q.id || `q_${Date.now()}_${idx + 1}`,
        type: q.type || 'mcq',
        question: q.question || '',
        optionA: q.optionA || q.options?.[0] || '',
        optionB: q.optionB || q.options?.[1] || '',
        optionC: q.optionC || q.options?.[2] || '',
        optionD: q.optionD || q.options?.[3] || '',
        correctAnswer: q.correctAnswer || 'A',
        marks: Number(q.marks) || 1
      }))
    );
    setCreateError(null);
    setShowCreateModal(true);

    // Inspect if exam has active or completed candidate attempts
    setActiveAttemptCount(0);
    if (!isDemo && exam.id) {
      try {
        const monitorRes = await api.getExamMonitoring(exam.id);
        if (monitorRes) {
          const totalAttempts = (monitorRes.totalRegistered || 0) + (monitorRes.activeCount || 0) + (monitorRes.submittedCount || 0);
          setActiveAttemptCount(totalAttempts);
        }
      } catch (e) {
        console.warn('Could not inspect attempts for exam:', e);
      }
    }
  };

  // ── Question Management Handlers ──

  // Add Question with unique stable ID
  const addQuestionField = () => {
    const newId = `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setQuestions((prev) => [
      ...prev,
      {
        id: newId,
        type: 'mcq',
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

  // Duplicate Question
  const duplicateQuestion = (index: number) => {
    const target = questions[index];
    if (!target) return;
    const newId = `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const copy: Question = {
      ...target,
      id: newId,
      question: `${target.question} (Copy)`
    };
    const nextList = [...questions];
    nextList.splice(index + 1, 0, copy);
    setQuestions(nextList);
  };

  // Reorder Question (Up / Down)
  const reorderQuestion = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const nextList = [...questions];
    const [moved] = nextList.splice(index, 1);
    nextList.splice(targetIndex, 0, moved);
    setQuestions(nextList);
  };

  // Delete Question - Confirm Action
  const confirmDeleteQuestion = () => {
    if (!deletingQuestion) return;
    setQuestions((prev) => prev.filter((_, i) => i !== deletingQuestion.index));
    setDeletingQuestion(null);
  };

  // Toggle Multi-Select Option in Question Editor
  const toggleMultiSelectOption = (questionIndex: number, optionKey: string) => {
    setQuestions((prev) =>
      prev.map((item, i) => {
        if (i !== questionIndex) return item;
        const curAns = item.correctAnswer;
        let selected: string[] = [];
        if (Array.isArray(curAns)) {
          selected = [...curAns];
        } else if (typeof curAns === 'string' && curAns.length > 0) {
          selected = curAns.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
        }

        if (selected.includes(optionKey)) {
          selected = selected.filter((k) => k !== optionKey);
        } else {
          selected.push(optionKey);
        }
        selected.sort();

        return { ...item, correctAnswer: selected };
      })
    );
  };

  // CSV Import
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
          return;
        }

        const cols = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
        if (cols.length >= 6) {
          parsed.push({
            id: `q_csv_${Date.now()}_${index}`,
            type: 'mcq',
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

  // Save Examination (Create or Update)
  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);

    const generatedCode = customCode ? customCode.trim().toUpperCase() : Math.random().toString(36).substring(2, 8).toUpperCase();

    const formattedQuestions = questions.map((q, idx) => ({
      id: q.id || `q_${idx + 1}`,
      type: q.type || 'mcq',
      question: q.question.trim(),
      options: [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean),
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctAnswer: q.correctAnswer,
      marks: Number(q.marks) || 1,
      orderNum: idx + 1
    }));

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
      status: 'published',
      allowEarlyStart,
      settings: {
        requireFullscreen,
        instituteName: instituteName.trim(),
        allowEarlyStart
      },
      questions: formattedQuestions
    };

    try {
      if (editingExam) {
        // Update existing examination
        if (isDemo) {
          const existing = demoService.getExamById(editingExam.id);
          if (existing) {
            Object.assign(existing, {
              title: title.trim(),
              description: description.trim(),
              instituteName: instituteName.trim(),
              durationMinutes: Number(durationMinutes),
              startTime: new Date(startTime).toISOString(),
              endTime: new Date(endTime).toISOString(),
              requireFullscreen,
              allowEarlyStart,
              settings: {
                requireFullscreen,
                instituteName: instituteName.trim(),
                allowEarlyStart
              },
              questions: formattedQuestions
            });
          }
        } else {
          try {
            await api.updateExam(editingExam.id, {
              title: title.trim(),
              description: description.trim(),
              duration: Number(durationMinutes),
              startTime: new Date(startTime).toISOString(),
              endTime: new Date(endTime).toISOString(),
              settings: {
                requireFullscreen,
                instituteName: instituteName.trim(),
                allowEarlyStart
              },
              // If attempts exist, backend guards question mutation
              questions: activeAttemptCount > 0 ? undefined : formattedQuestions
            });
          } catch (apiErr: any) {
            console.warn('API updateExam fallback:', apiErr);
            await firebaseExamService.updateExam(editingExam.id, payload);
          }
        }
      } else {
        // Create new examination
        if (isDemo) {
          demoService.createExam(payload);
        } else {
          try {
            await api.createExam({
              title: title.trim(),
              examCode: generatedCode,
              description: description.trim(),
              duration: Number(durationMinutes),
              startTime: new Date(startTime).toISOString(),
              endTime: new Date(endTime).toISOString(),
              status: 'published',
              settings: {
                requireFullscreen,
                instituteName: instituteName.trim(),
                allowEarlyStart
              },
              questions: formattedQuestions
            });
          } catch {
            await firebaseExamService.createExam(payload);
          }
        }
      }

      setShowCreateModal(false);
      setEditingExam(null);
      fetchExams();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to save examination');
    } finally {
      setCreateLoading(false);
    }
  };

  // Recalculate total marks across questions
  const totalMarks = questions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0);
  const isQuestionSetLocked = Boolean(editingExam && activeAttemptCount > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 selection:bg-indigo-500 selection:text-white">
      {loadError && (
        <div role="alert" className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 font-medium">
          Could not load cloud examinations: {loadError}
        </div>
      )}

      {/* Demo Mode Notice */}
      {isDemo && (
        <div className="mb-6 p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
            <div>
              <span className="font-bold text-slate-900 text-sm">Demo Simulation Active:</span>{' '}
              <span className="text-xs text-slate-600">
                Connected to simulation environment with preloaded students and instant multi-tab sync.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const testExam = exams[0] || demoService.getExams()[0];
              if (onOpenStudentView) {
                onOpenStudentView(testExam);
              } else {
                window.open(`${window.location.origin}${window.location.pathname}?exam=${testExam.id}&code=${testExam.code}`, '_blank');
              }
            }}
            className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0 active:scale-95"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Candidate Test Tab</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-slate-200 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <ExamCoLogo size="sm" theme="light" />
            <span>Examinations Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create proctored assessments, manage questions, and monitor live test sessions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Exam</span>
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-semibold text-slate-500">Loading examinations...</p>
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-xl mx-auto shadow-sm">
          <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-bold text-slate-900 mb-1">No Examinations Found</h3>
          <p className="text-xs text-slate-500 mb-6 font-medium">Create your first examination to generate share links and invite codes for candidates.</p>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors cursor-pointer shadow-sm active:scale-95"
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
                className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-3xl p-6 transition-all flex flex-col justify-between shadow-sm hover:shadow-md"
              >
                <div>
                  {/* Top Status & Code */}
                  <div className="flex items-center justify-between mb-3.5">
                    <span
                      onClick={() => copyToClipboard(exam.code, 'code')}
                      className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-xl border border-indigo-200 hover:border-indigo-400 transition-colors cursor-pointer flex items-center gap-1.5"
                      title="Click to copy exam code"
                    >
                      <span>Code: {exam.code}</span>
                      <Copy className="w-3 h-3 text-indigo-400" />
                    </span>

                    {copiedCode === exam.code && (
                      <span className="text-[10px] text-emerald-700 font-bold">Copied!</span>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full ${
                          exam.status === 'draft'
                            ? 'bg-slate-100 text-slate-700 border border-slate-300'
                            : exam.status === 'active' || isLive
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : new Date() < new Date(exam.startTime)
                            ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {exam.status === 'draft'
                          ? 'Draft'
                          : exam.status === 'active' || isLive
                          ? 'Active Window'
                          : new Date() < new Date(exam.startTime)
                          ? 'Scheduled'
                          : 'Concluded'}
                      </span>

                      {(exam.allowEarlyStart || exam.settings?.allowEarlyStart) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200" title="Registered candidates in waiting room may start before scheduled time">
                          ⚡ Early Start
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="font-bold text-base text-slate-900 mb-1 line-clamp-1">{exam.title}</h3>
                  <div className="text-[11px] text-indigo-600 font-semibold mb-2">{exam.instituteName || 'Department of Computing'}</div>
                  <p className="text-xs text-slate-500 line-clamp-2 mb-4">{exam.description || 'Proctored examination assessment.'}</p>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200 text-center mb-4">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Duration</div>
                      <div className="text-xs font-bold text-slate-900">{exam.durationMinutes}m</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Questions</div>
                      <div className="text-xs font-bold text-indigo-700">{exam.questions?.length || 0} Questions</div>
                    </div>
                  </div>

                  {/* Share Link Card */}
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-2xl mb-4 text-xs">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] uppercase font-bold text-slate-600 flex items-center gap-1">
                        <Share2 className="w-3 h-3 text-indigo-600" />
                        <span>Candidate Invite Link</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => openShareModal(exam)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
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
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-700 truncate"
                      />
                      <button
                        type="button"
                        onClick={() => copyToClipboard(shareUrl, 'link')}
                        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 cursor-pointer"
                        title="Copy Exam URL"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectExam(exam, 'dashboard')}
                      className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Live Invigilation</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectExam(exam, 'reports')}
                      className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-300"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>Audit Reports</span>
                    </button>
                  </div>

                  <div className="flex justify-between items-center pt-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenStudentView) {
                          onOpenStudentView(exam);
                        } else {
                          window.open(shareUrl, '_blank');
                        }
                      }}
                      className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Test as Candidate</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(exam)}
                        className="text-slate-600 hover:text-indigo-600 font-bold flex items-center gap-1 cursor-pointer transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
                        title="Edit Examination & Questions"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => deleteExam(exam.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1 cursor-pointer"
                        title="Delete Exam"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share & QR Code Modal */}
      {sharingExam && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSharingExam(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-2 border border-indigo-200">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Student Examination Access</h3>
              <p className="text-xs text-slate-500 mt-1">{sharingExam.title}</p>
              <div className="inline-block mt-2 font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-200">
                Exam Code: {sharingExam.code}
              </div>
            </div>

            {/* QR Code */}
            {qrCodeDataUrl && (
              <div className="bg-white p-3 rounded-2xl w-56 h-56 mx-auto mb-6 flex items-center justify-center border border-slate-200 shadow-sm">
                <img src={qrCodeDataUrl} alt="Exam QR Code" className="w-full h-full" />
              </div>
            )}

            {/* Share link input */}
            <div className="mb-4">
              <label className="block text-[11px] uppercase tracking-wider text-slate-600 font-bold mb-1.5">
                Direct Candidate Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={getShareUrl(sharingExam)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 text-xs font-mono truncate"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(getShareUrl(sharingExam), 'link')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer"
                >
                  {copiedLink === getShareUrl(sharingExam) ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Question Delete Confirmation Dialog */}
      {deletingQuestion && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center">Delete Question Confirmation</h3>
            <p className="text-xs text-slate-600 mt-2 text-center leading-relaxed">
              Are you sure you want to remove <strong>Question {deletingQuestion.index + 1}</strong>:
              <span className="block mt-1 italic text-slate-500 font-mono text-[11px] truncate">
                "{deletingQuestion.question.question || 'Untitled Question'}"
              </span>
              This will remove ({deletingQuestion.question.marks || 1} Marks) and update the total question count.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setDeletingQuestion(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteQuestion}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-3xl w-full max-w-3xl p-6 sm:p-8 shadow-2xl my-8 relative">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false);
                setEditingExam(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-black text-slate-900 mb-1">
              {editingExam ? 'Edit Examination & Questions' : 'Create New Examination'}
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              {editingExam
                ? 'Modify assessment timing, proctoring rules, and manage question structure.'
                : 'Configure timing, questions, and automated proctoring rules.'}
            </p>

            {createError && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                {createError}
              </div>
            )}

            {/* Published Exam Notice */}
            {isQuestionSetLocked && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Published Assessment Protection Active:</span>
                  <p className="mt-0.5 text-amber-800 leading-relaxed">
                    This examination already has {activeAttemptCount} candidate attempt{activeAttemptCount > 1 ? 's' : ''}. Modifying question structure (adding, deleting, or reordering) is restricted to preserve historical grading accuracy and candidate score integrity. You may update schedule windows, duration, and instructions.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveExam} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Examination Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CS401 Distributed Systems Midterm"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:bg-white focus:border-indigo-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Institution / Department
                  </label>
                  <input
                    type="text"
                    required
                    value={instituteName}
                    onChange={(e) => setInstituteName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    6-Character Access Code {editingExam ? '(Read-only)' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    disabled={Boolean(editingExam)}
                    placeholder="Auto-generated if empty"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-mono uppercase focus:bg-white focus:border-indigo-600 outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={360}
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Start Window
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    End Window
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs focus:bg-white focus:border-indigo-600 outline-none"
                  />
                </div>
              </div>

              {/* Early Start Setting */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
                <input
                  type="checkbox"
                  id="allowEarlyStartCheckbox"
                  checked={allowEarlyStart}
                  onChange={(e) => setAllowEarlyStart(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="allowEarlyStartCheckbox" className="cursor-pointer text-xs">
                  <span className="font-bold text-slate-800 block">Authorize Early Start (Waiting Room)</span>
                  <span className="text-slate-500 block mt-0.5 leading-relaxed">
                    Allow registered candidates who complete checklist onboarding to start the examination before the scheduled start time window. If unchecked, the candidate start button remains locked until the scheduled time arrives.
                  </span>
                </label>
              </div>

              {/* Questions Section */}
              <div className="pt-4 border-t border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Questions ({questions.length}) • Total Marks: {totalMarks} pts
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Configure question types, marks, options, and authoritative answer keys.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 cursor-pointer flex items-center gap-1.5 transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Import CSV</span>
                      <input type="file" accept=".csv" onChange={handleCSVImport} className="hidden" />
                    </label>

                    <button
                      type="button"
                      disabled={isQuestionSetLocked}
                      onClick={addQuestionField}
                      className="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                  {questions.map((q, idx) => {
                    const isPreviewing = previewingQuestionId === q.id;

                    return (
                      <div key={q.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-3">
                        {/* Question Card Top Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                              Q{idx + 1}.
                            </span>

                            {/* Question Type Selector */}
                            <select
                              value={q.type || 'mcq'}
                              onChange={(e) => {
                                const newType = e.target.value as QuestionType;
                                setQuestions((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? {
                                          ...item,
                                          type: newType,
                                          correctAnswer: newType === 'multiple_select' ? ['A'] : newType === 'short_answer' ? '' : 'A'
                                        }
                                      : item
                                  )
                                );
                              }}
                              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800"
                            >
                              <option value="mcq">MCQ (Single Select)</option>
                              <option value="multiple_select">Multiple Select (Checkboxes)</option>
                              <option value="short_answer">Short Answer (Text)</option>
                            </select>

                            {/* Marks Input */}
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500 font-medium">Marks:</span>
                              <input
                                type="number"
                                min={0.1}
                                step={0.5}
                                value={q.marks || 1}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 1;
                                  setQuestions((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, marks: val } : item))
                                  );
                                }}
                                className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-900"
                              />
                            </div>
                          </div>

                          {/* Action Buttons: Reorder, Duplicate, Preview, Delete */}
                          <div className="flex items-center gap-1 self-end sm:self-auto">
                            <button
                              type="button"
                              disabled={idx === 0 || isQuestionSetLocked}
                              onClick={() => reorderQuestion(idx, 'up')}
                              className="p-1 rounded-md hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              disabled={idx === questions.length - 1 || isQuestionSetLocked}
                              onClick={() => reorderQuestion(idx, 'down')}
                              className="p-1 rounded-md hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              disabled={isQuestionSetLocked}
                              onClick={() => duplicateQuestion(idx)}
                              className="p-1 rounded-md hover:bg-slate-200 disabled:opacity-30 text-slate-600 transition-colors"
                              title="Duplicate Question"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setPreviewingQuestionId(isPreviewing ? null : q.id)}
                              className={`p-1 rounded-md transition-colors ${
                                isPreviewing ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200 text-slate-600'
                              }`}
                              title={isPreviewing ? 'Hide Candidate Preview' : 'Show Candidate Preview'}
                            >
                              {isPreviewing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>

                            <button
                              type="button"
                              disabled={isQuestionSetLocked}
                              onClick={() => setDeletingQuestion({ index: idx, question: q })}
                              className="p-1 rounded-md hover:bg-rose-100 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors"
                              title="Delete Question"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Question Text */}
                        <input
                          type="text"
                          required
                          placeholder="Enter question prompt..."
                          value={q.question}
                          onChange={(e) => {
                            const val = e.target.value;
                            setQuestions((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, question: val } : item))
                            );
                          }}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-medium outline-none"
                        />

                        {/* Inline Candidate Preview Mode */}
                        {isPreviewing && (
                          <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-200 space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                              <span>Candidate Test View Preview</span>
                              <span>{q.marks || 1} Mark{(q.marks || 1) > 1 ? 's' : ''}</span>
                            </div>
                            <p className="font-bold text-slate-900 text-xs">{q.question || 'Question prompt will appear here...'}</p>
                            {q.type === 'short_answer' ? (
                              <textarea
                                readOnly
                                rows={2}
                                placeholder="Candidate will type short-answer response here..."
                                className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-500 italic"
                              />
                            ) : (
                              <div className="space-y-1.5 pt-1">
                                {[
                                  { k: 'A', text: q.optionA },
                                  { k: 'B', text: q.optionB },
                                  { k: 'C', text: q.optionC },
                                  { k: 'D', text: q.optionD }
                                ]
                                  .filter((opt) => opt.text && opt.text.trim().length > 0)
                                  .map((opt) => (
                                    <div key={opt.k} className="p-2 rounded-lg bg-white border border-slate-200 text-xs flex items-center gap-2">
                                      <span className="w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] bg-slate-100 text-slate-700">
                                        {opt.k}
                                      </span>
                                      <span className="text-slate-800">{opt.text}</span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Dynamic Input According to Question Type */}
                        {q.type === 'short_answer' ? (
                          <div className="space-y-1.5">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              Model Answer / Expected Keyword (For Automated Matching)
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Linearizability (Student response will be matched case-insensitive)"
                              value={typeof q.correctAnswer === 'string' ? q.correctAnswer : ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setQuestions((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, correctAnswer: val } : item))
                                );
                              }}
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium text-xs"
                            />
                            <p className="text-[10px] text-slate-500">
                              Leave empty for manual teacher evaluation, or provide expected keyword for auto-scoring.
                            </p>
                          </div>
                        ) : q.type === 'multiple_select' ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                Options & Correct Answer Keys
                              </span>
                              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                                Check all options that are correct
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {(['A', 'B', 'C', 'D'] as const).map((key) => {
                                const fieldKey = `option${key}` as keyof Question;
                                const curAns = q.correctAnswer;
                                const isChecked = Array.isArray(curAns)
                                  ? curAns.includes(key)
                                  : typeof curAns === 'string' && curAns.includes(key);

                                return (
                                  <div key={key} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-300">
                                    <button
                                      type="button"
                                      onClick={() => toggleMultiSelectOption(idx, key)}
                                      className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs shrink-0 cursor-pointer transition-colors ${
                                        isChecked ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                      }`}
                                      title={isChecked ? 'Marked Correct' : 'Click to mark correct'}
                                    >
                                      {key}
                                    </button>
                                    <input
                                      type="text"
                                      placeholder={`Option ${key}`}
                                      value={(q[fieldKey] as string) || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setQuestions((prev) =>
                                          prev.map((item, i) => (i === idx ? { ...item, [fieldKey]: val } : item))
                                        );
                                      }}
                                      className="flex-1 bg-transparent text-slate-800 outline-none text-xs"
                                    />
                                    <input
                                      type="checkbox"
                                      checked={Boolean(isChecked)}
                                      onChange={() => toggleMultiSelectOption(idx, key)}
                                      className="rounded text-indigo-600 cursor-pointer"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          /* Standard MCQ (Single Select) */
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                Multiple Choice Options
                              </span>
                              <select
                                value={typeof q.correctAnswer === 'string' ? q.correctAnswer : 'A'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setQuestions((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, correctAnswer: val } : item))
                                  );
                                }}
                                className="bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-semibold text-slate-800"
                              >
                                <option value="A">Correct: Option A</option>
                                <option value="B">Correct: Option B</option>
                                <option value="C">Correct: Option C</option>
                                <option value="D">Correct: Option D</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                type="text"
                                required
                                placeholder="Option A"
                                value={q.optionA || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setQuestions((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, optionA: val } : item))
                                  );
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                              />
                              <input
                                type="text"
                                required
                                placeholder="Option B"
                                value={q.optionB || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setQuestions((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, optionB: val } : item))
                                  );
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                              />
                              <input
                                type="text"
                                placeholder="Option C"
                                value={q.optionC || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setQuestions((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, optionC: val } : item))
                                  );
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                              />
                              <input
                                type="text"
                                placeholder="Option D"
                                value={q.optionD || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setQuestions((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, optionD: val } : item))
                                  );
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingExam(null);
                  }}
                  className="flex-1 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {createLoading
                    ? 'Saving Examination...'
                    : editingExam
                    ? 'Save Changes'
                    : 'Create & Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
