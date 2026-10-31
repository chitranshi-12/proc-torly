import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  ArrowLeft,
  Search,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { firebaseExamService, ExamData } from '../services/firebaseExamService';
import { ProctorlyEyeIcon } from './ProctorlyLogo';

interface ExamReportsProps {
  exam: ExamData;
  onBack: () => void;
}

export const ExamReports: React.FC<ExamReportsProps> = ({ exam, onBack }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

  useEffect(() => {
    if (!exam?.id) return;
    const unsubSessions = firebaseExamService.subscribeExamSessions(exam.id, setSessions);
    const unsubViolations = firebaseExamService.subscribeExamViolations(exam.id, setViolations);
    return () => {
      unsubSessions();
      unsubViolations();
    };
  }, [exam?.id]);

  const exportCsv = () => {
    let csv = 'Roll No,Candidate Name,Status,Score,Total Marks,Risk Score,Violations Count,Consent Timestamp\n';
    sessions.forEach((s) => {
      const vCount = violations.filter((v) => v.sessionId === s.id).length;
      csv += `"${s.rollNo}","${s.studentName}","${s.status}",${s.score ?? 'N/A'},${s.totalMarks || 0},${s.riskScore || 0},${vCount},"${s.consentTimestamp || ''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Proctorly_${exam.code}_Report.csv`;
    a.click();
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(56, 189, 248);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PROCTORLY CLOUD INTEGRITY REPORT', 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(226, 232, 240);
    doc.setFont('helvetica', 'normal');
    doc.text(`Examination: ${exam.title} (Code: ${exam.code})`, 14, 27);
    doc.text(`Generated: ${new Date().toLocaleString()} | Cloud Firestore Architecture`, 14, 34);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('CANDIDATE AUDIT ROSTER', 14, 52);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 58, 196, 58);
    doc.setFontSize(8);
    doc.text('ROLL NO', 14, 63);
    doc.text('NAME', 50, 63);
    doc.text('STATUS', 110, 63);
    doc.text('SCORE', 145, 63);
    doc.text('FLAGS', 175, 63);
    doc.line(14, 66, 196, 66);

    let y = 74;
    doc.setFont('helvetica', 'normal');
    sessions.forEach((s) => {
      const vCount = violations.filter((v) => v.sessionId === s.id).length;
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text(s.rollNo || '-', 14, y);
      doc.text((s.studentName || '').slice(0, 25), 50, y);
      doc.text((s.status || '').toUpperCase(), 110, y);
      doc.text(`${s.score ?? '-'} / ${s.totalMarks || '-'}`, 145, y);
      doc.text(String(vCount), 175, y);
      y += 8;
    });

    doc.save(`Proctorly_${exam.code}_Report.pdf`);
  };

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return s.studentName?.toLowerCase().includes(q) || s.rollNo?.toLowerCase().includes(q);
  });

  const studentViolations = selectedStudent
    ? violations.filter((v) => v.sessionId === selectedStudent.id)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-8 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ProctorlyEyeIcon size={24} />
              <span>Proctorly Assessment & Audit Reports</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {exam.title} • Exam Code: <span className="font-mono text-cyan-400 font-bold">{exam.code}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCsv}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={exportPdf}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
          >
            <Download className="w-4 h-4" />
            <span>Export Official PDF Report</span>
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Enrolled Candidates
          </div>
          <div className="text-2xl font-black text-white">{sessions.length}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Completed Submissions
          </div>
          <div className="text-2xl font-black text-emerald-400">
            {sessions.filter((s) => s.status === 'submitted').length}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Total Violations Logged
          </div>
          <div className="text-2xl font-black text-amber-400">{violations.length}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
            High Risk Candidates
          </div>
          <div className="text-2xl font-black text-rose-400">
            {sessions.filter((s) => (s.riskScore || 0) >= 50).length}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 relative max-w-sm">
        <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
        <input
          type="text"
          placeholder="Filter by candidate or roll number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Roll No</th>
                <th className="py-3 px-4">Candidate Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Violations</th>
                <th className="py-3 px-4">Risk Index</th>
                <th className="py-3 px-4">Consent Timestamp</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No candidate records found in Cloud Firestore.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const sV = violations.filter((v) => v.sessionId === s.id);
                  const isHighRisk = (s.riskScore || 0) >= 50;

                  return (
                    <tr key={s.id} className="hover:bg-slate-950/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-cyan-300">{s.rollNo}</td>
                      <td className="py-3 px-4 font-medium text-white">{s.studentName}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-200">
                        {s.score != null ? `${s.score} / ${s.totalMarks}` : 'In Progress'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-amber-400">{sV.length}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                            isHighRisk
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-emerald-950 text-emerald-300'
                          }`}
                        >
                          {s.riskScore || 0}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {s.consentTimestamp ? new Date(s.consentTimestamp).toLocaleString() : 'Pending'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedStudent(s)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
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
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl my-8 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{selectedStudent.studentName}</h2>
                  <span className="font-mono text-xs text-indigo-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {selectedStudent.rollNo}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Consent Logged: <span className="font-mono text-slate-300">{selectedStudent.consentTimestamp}</span>
                </p>
              </div>

              <button
                onClick={() => setSelectedStudent(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Score Obtained</div>
                <div className="text-2xl font-black text-white">
                  {selectedStudent.score ?? 'In Progress'}{' '}
                  <span className="text-sm font-normal text-slate-400">/ {selectedStudent.totalMarks} pts</span>
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Risk Score Index</div>
                <div className="text-2xl font-black text-cyan-400">{selectedStudent.riskScore || 0}%</div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Violations Recorded</div>
                <div className="text-2xl font-black text-amber-400">{studentViolations.length} Flags</div>
              </div>
            </div>

            {/* Violation Evidence Screenshots */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                Recorded Violations & Storage Captures ({studentViolations.length})
              </h3>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {studentViolations.length === 0 ? (
                  <p className="text-xs text-slate-500 p-4 bg-slate-950 rounded-xl text-center">
                    Clean examination record. No infractions logged.
                  </p>
                ) : (
                  studentViolations.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
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
                        <p className="text-slate-300 text-[11px]">{v.details}</p>
                      </div>

                      <div className="flex gap-2 shrink-0">
                        {v.screenUrl && (
                          <a href={v.screenUrl} target="_blank" rel="noreferrer">
                            <img
                              src={v.screenUrl}
                              alt="Screen"
                              className="w-16 h-10 object-cover rounded border border-slate-700 hover:border-cyan-400 transition-colors"
                            />
                          </a>
                        )}
                        {v.webcamUrl && (
                          <a href={v.webcamUrl} target="_blank" rel="noreferrer">
                            <img
                              src={v.webcamUrl}
                              alt="Cam"
                              className="w-16 h-10 object-cover rounded border border-slate-700 hover:border-cyan-400 transition-colors"
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
