/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co - Assessment Results & Audit Reports
 * SaaS White Theme with MongoDB + Firestore Synchronization
 */

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  ArrowLeft,
  Search,
  CheckCircle,
  FileSpreadsheet,
  AlertTriangle,
  User,
  Clock,
  ShieldAlert,
  Percent,
  Award
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { firebaseExamService, ExamData } from '../services/firebaseExamService';
import { api } from '../services/api';
import { ExamCoLogo } from './ExamCoLogo';

interface ExamReportsProps {
  exam: ExamData;
  onBack: () => void;
}

export const ExamReports: React.FC<ExamReportsProps> = ({ exam, onBack }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const examId = exam?.id || (exam as any)?._id;

  // Load from MongoDB Atlas backend API and subscribe to live Firestore
  useEffect(() => {
    if (!examId) return;

    let active = true;

    // 1. Fetch persistent results from MongoDB
    api.getExamResults(examId)
      .then((data) => {
        if (!active) return;
        if (data && data.results && data.results.length > 0) {
          // Map MongoDB attempts to report sessions
          const mapped = data.results.map((r: any) => ({
            id: r.attemptId || r.id,
            rollNo: r.studentRollNo || r.rollNo || '-',
            studentName: r.studentName || 'Candidate',
            status: r.status,
            score: r.score,
            totalMarks: r.maxPossibleMarks || exam.totalMarks || 100,
            riskScore: r.riskScore || 0,
            violationsCount: r.violationsCount || 0,
            submittedAt: r.submittedAt,
            consentTimestamp: r.startedAt
          }));
          setSessions(mapped);
        }
      })
      .catch((err) => {
        console.warn('Backend exam results note:', err.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    // 2. Subscribe to Firestore for real-time live exam updates
    const unsubSessions = firebaseExamService.subscribeExamSessions(examId, (liveList) => {
      if (!active) return;
      if (liveList && liveList.length > 0) {
        setSessions((prev) => {
          // Merge or replace with live updates
          const map = new Map<string, any>();
          prev.forEach((s) => map.set(s.id, s));
          liveList.forEach((s) => map.set(s.id, { ...map.get(s.id), ...s }));
          return Array.from(map.values());
        });
      }
      setIsLoading(false);
    });

    const unsubViolations = firebaseExamService.subscribeExamViolations(examId, (liveV) => {
      if (!active) return;
      if (liveV) setViolations(liveV);
    });

    return () => {
      active = false;
      unsubSessions();
      unsubViolations();
    };
  }, [examId]);

  const exportCsv = () => {
    let csv = 'Roll No,Candidate Name,Status,Score,Total Marks,Percentage,Risk Score,Violations Count,Consent Timestamp\n';
    sessions.forEach((s) => {
      const vCount = s.violationsCount !== undefined
        ? s.violationsCount
        : violations.filter((v) => v.sessionId === s.id).length;
      const pct = s.score != null && s.totalMarks ? Math.round((s.score / s.totalMarks) * 100) : 'N/A';
      csv += `"${s.rollNo}","${s.studentName}","${s.status}",${s.score ?? 'N/A'},${s.totalMarks || 0},"${pct}%",${s.riskScore || 0},${vCount},"${s.consentTimestamp || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam_co_${exam.code}_Report.csv`;
    a.click();
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFillColor(79, 70, 229); // Indigo 600
    doc.rect(0, 0, 210, 36, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('EXAM.CO EXAMINATION AUDIT REPORT', 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(224, 231, 255);
    doc.setFont('helvetica', 'normal');
    doc.text(`Examination: ${exam.title} (Code: ${exam.code})`, 14, 24);
    doc.text(`Generated: ${new Date().toLocaleString()} | Official Academic Record`, 14, 30);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CANDIDATE AUDIT ROSTER', 14, 48);

    doc.setDrawColor(226, 232, 240);
    doc.line(14, 52, 196, 52);
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('ROLL NO', 14, 57);
    doc.text('NAME', 50, 57);
    doc.text('STATUS', 110, 57);
    doc.text('SCORE', 145, 57);
    doc.text('RISK INDEX', 175, 57);
    doc.line(14, 60, 196, 60);

    let y = 68;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    sessions.forEach((s) => {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      const vCount = s.violationsCount !== undefined
        ? s.violationsCount
        : violations.filter((v) => v.sessionId === s.id).length;
      doc.text(s.rollNo || '-', 14, y);
      doc.text((s.studentName || '').slice(0, 25), 50, y);
      doc.text((s.status || '').toUpperCase(), 110, y);
      doc.text(`${s.score ?? '-'} / ${s.totalMarks || '-'}`, 145, y);
      doc.text(`${s.riskScore || 0}% (${vCount} flags)`, 175, y);
      y += 8;
    });

    doc.save(`exam_co_${exam.code}_Report.pdf`);
  };

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.studentName?.toLowerCase().includes(q) || s.rollNo?.toLowerCase().includes(q);
  });

  const studentViolations = selectedStudent
    ? violations.filter((v) => v.sessionId === selectedStudent.id)
    : [];

  const completedCount = sessions.filter((s) => s.status === 'submitted').length;
  const highRiskCount = sessions.filter((s) => (s.riskScore || 0) >= 50).length;
  const scoresWithValues = sessions.filter((s) => s.score != null).map((s) => s.score);
  const averageScore = scoresWithValues.length > 0
    ? Math.round((scoresWithValues.reduce((a, b) => a + b, 0) / scoresWithValues.length) * 10) / 10
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-slate-200 gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-xs"
            title="Return to Exams List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <ExamCoLogo size="sm" theme="light" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Assessment Results & Audit Reports</h1>
              <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                Code: {exam.code}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {exam.title} • Authoritative MongoDB Atlas Records & Live Cloud Firestore Audit Logs
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCsv}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={exportPdf}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Export Official PDF Report</span>
          </button>
        </div>
      </div>

      {/* Analytics KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Enrolled Candidates</span>
            <User className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{sessions.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Verified registrations</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Completed</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{completedCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {sessions.length > 0 ? `${Math.round((completedCount / sessions.length) * 100)}% completion rate` : '0%'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Average Score</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {averageScore != null ? averageScore : '—'}
            {averageScore != null && <span className="text-sm font-normal text-slate-500"> / {exam.totalMarks || 100}</span>}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Graded candidates</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">High Risk Flags</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">{highRiskCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {violations.length} total integrity incidents
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
        <input
          type="text"
          placeholder="Filter by candidate name or roll number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
        />
      </div>

      {/* Main Roster Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Roll No</th>
                <th className="py-3 px-4">Candidate Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Violations</th>
                <th className="py-3 px-4">Risk Index</th>
                <th className="py-3 px-4">Consent & Start Time</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <CheckCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-600">No candidate assessment records found.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Students will appear automatically as they join and submit answers.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const sV = s.violationsCount !== undefined
                    ? s.violationsCount
                    : violations.filter((v) => v.sessionId === s.id).length;
                  const isHighRisk = (s.riskScore || 0) >= 50;

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600">{s.rollNo}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{s.studentName}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          s.status === 'submitted'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : s.status === 'in_progress'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {s.score != null ? (
                          <span className="flex items-center gap-1.5">
                            <span>{s.score} / {s.totalMarks || exam.totalMarks || 100}</span>
                            <span className="text-[11px] font-medium text-slate-500">
                              ({Math.round((s.score / (s.totalMarks || exam.totalMarks || 100)) * 100)}%)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal italic">In Progress</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-amber-600">{sV}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                            isHighRisk
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {s.riskScore || 0}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                        {s.consentTimestamp
                          ? new Date(s.consentTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Pending'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedStudent(s)}
                          className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Audit Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Student Audit Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl my-8 p-6 shadow-2xl text-slate-900">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">{selectedStudent.studentName}</h2>
                  <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Roll: {selectedStudent.rollNo}
                  </span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                    {selectedStudent.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Start / Consent: <span className="font-mono text-slate-700">{selectedStudent.consentTimestamp || 'Not recorded'}</span>
                </p>
              </div>

              <button
                onClick={() => setSelectedStudent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Score Obtained</div>
                <div className="text-2xl font-bold text-slate-900">
                  {selectedStudent.score ?? 'In Progress'}{' '}
                  <span className="text-sm font-normal text-slate-500">/ {selectedStudent.totalMarks || exam.totalMarks || 100} pts</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Risk Score Index</div>
                <div className="text-2xl font-bold text-indigo-600">{selectedStudent.riskScore || 0}%</div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Violations Recorded</div>
                <div className="text-2xl font-bold text-amber-600">
                  {selectedStudent.violationsCount !== undefined ? selectedStudent.violationsCount : studentViolations.length} Flags
                </div>
              </div>
            </div>

            {/* Violation Evidence Screenshots */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3 flex items-center justify-between">
                <span>Recorded Violations & Storage Captures ({studentViolations.length})</span>
                <span className="text-[11px] text-slate-500 font-normal">Evidence Database Records</span>
              </h3>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {studentViolations.length === 0 ? (
                  <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
                    <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                    Clean examination record. No infractions logged.
                  </div>
                ) : (
                  studentViolations.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
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
                        <p className="text-slate-700 text-[11px]">{v.details || v.description}</p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {v.screenUrl && (
                          <a href={v.screenUrl} target="_blank" rel="noreferrer">
                            <img
                              src={v.screenUrl}
                              alt="Screen"
                              className="w-16 h-10 object-cover rounded border border-slate-200 hover:border-indigo-500 transition-colors"
                            />
                          </a>
                        )}
                        {v.webcamUrl && (
                          <a href={v.webcamUrl} target="_blank" rel="noreferrer">
                            <img
                              src={v.webcamUrl}
                              alt="Cam"
                              className="w-16 h-10 object-cover rounded border border-slate-200 hover:border-indigo-500 transition-colors"
                            />
                          </a>
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
    </div>
  );
};
