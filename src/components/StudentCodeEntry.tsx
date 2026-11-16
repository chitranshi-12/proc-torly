/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * exam.co Student Examination Entrance (White-Theme SaaS Design)
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Building,
  User,
  Hash,
  Mail,
  KeyRound,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { api, setStudentSessionToken } from '../services/api';
import { demoService } from '../services/demoService';
import { ExamCoLogo } from './ExamCoLogo';

interface StudentCodeEntryProps {
  onVerified: (
    examData: any,
    candidateInfo: { name: string; rollNo: string; email: string; institute?: string },
    sessionId: string,
    attemptId: string,
    sessionToken?: string
  ) => void;
  initialCode?: string;
  initialExam?: any;
  isDemo?: boolean;
  onBackToHome?: () => void;
}

export const StudentCodeEntry: React.FC<StudentCodeEntryProps> = ({
  onVerified,
  initialCode = '',
  initialExam = null,
  isDemo = false,
  onBackToHome
}) => {
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [institute, setInstitute] = useState(initialExam?.instituteName || '');
  const [email, setEmail] = useState('');
  const [examCode, setExamCode] = useState(initialCode || initialExam?.examCode || initialExam?.code || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examInfo, setExamInfo] = useState<any | null>(initialExam);

  // If initialCode or exam was passed, verify exam code lookup
  useEffect(() => {
    if (initialExam) {
      setExamInfo(initialExam);
      setExamCode(initialExam.examCode || initialExam.code);
      if (initialExam.instituteName) setInstitute(initialExam.instituteName);
    } else if (initialCode) {
      setExamCode(initialCode);
      lookupExam(initialCode);
    }
  }, [initialCode, initialExam]);

  const lookupExam = async (code: string) => {
    if (!code || code.length < 3) return;
    setError(null);
    try {
      if (isDemo || code.toUpperCase() === 'DEMO101') {
        const found = demoService.getExamByCode(code);
        if (found) {
          setExamInfo(found);
          if (found.instituteName) setInstitute(found.instituteName);
        }
      } else {
        const res = await api.getPublicExamByCode(code.trim().toUpperCase());
        if (res.exam) {
          setExamInfo(res.exam);
          if (res.exam.settings?.instituteName) setInstitute(res.exam.settings.instituteName);
        }
      }
    } catch (err: any) {
      console.warn('Exam lookup note:', err.message);
    }
  };

  const handleCodeBlur = () => {
    if (examCode.trim()) {
      lookupExam(examCode.trim());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = examCode.trim().toUpperCase();
    const cleanName = name.trim();
    const cleanRollNo = rollNo.trim();
    const cleanEmail = email.trim();

    if (!cleanCode) {
      setError('Invalid examination code.');
      return;
    }
    if (!cleanName || !cleanRollNo) {
      setError('Student details are incomplete.');
      return;
    }

    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        setError('Please enter a valid email address.');
        return;
      }
    }

    setLoading(true);

    try {
      if (isDemo || cleanCode === 'DEMO101') {
        const demoExam = demoService.getExamByCode(cleanCode) || initialExam;
        const candidateData = {
          name: cleanName,
          rollNo: cleanRollNo,
          email: cleanEmail,
          institute: institute.trim() || 'Demo Institute'
        };
        setStudentSessionToken('demo_student_session');
        onVerified(demoExam, candidateData, 'demo_session_1', 'demo_attempt_1', 'demo_student_session');
        return;
      }

      // Real backend join API
      const response = await api.joinExam({
        examCode: cleanCode,
        studentName: cleanName,
        rollNo: cleanRollNo,
        studentEmail: cleanEmail || undefined,
        institute: institute.trim() || undefined
      });

      if (response.sessionToken) {
        setStudentSessionToken(response.sessionToken);
      }

      const candidateData = {
        name: cleanName,
        rollNo: cleanRollNo,
        email: cleanEmail,
        institute: institute.trim()
      };

      onVerified(response.exam, candidateData, response.sessionId, response.attemptId, response.sessionToken);
    } catch (err: any) {
      setError(err.message || 'Server connection failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 selection:bg-indigo-500 selection:text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5 cursor-pointer" onClick={onBackToHome}>
            <ExamCoLogo size="lg" theme="light" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Candidate Examination Entry
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your examination access code and student verification details to proceed.
          </p>
        </div>

        {/* Exam Information Header if identified */}
        {examInfo && (
          <div className="mb-6 bg-white border border-indigo-200 rounded-2xl p-4.5 flex items-center justify-between gap-4 shadow-sm shadow-indigo-100/50">
            <div>
              <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider block">
                Active Assessment
              </span>
              <h2 className="text-base font-bold text-slate-900 mt-0.5">{examInfo.title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {examInfo.questions?.length || 0} Questions · {examInfo.duration || examInfo.durationMinutes || 60} Minutes
              </p>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono font-bold text-sm">
              {examInfo.examCode || examInfo.code}
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Form Card */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Exam Code */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Examination Code
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. EXAM01"
                  value={examCode}
                  onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                  onBlur={handleCodeBlur}
                  maxLength={12}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-bold tracking-wider focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none text-sm uppercase placeholder:text-slate-400 placeholder:font-normal"
                />
              </div>
            </div>

            {/* Student Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Legal Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none text-sm placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Roll Number / Student ID */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Roll Number / Student ID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Hash className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2026-CS-042"
                  value={rollNo}
                  onChange={(e) => setRollNo(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono font-medium focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none text-sm placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Email (Optional) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  placeholder="jane.doe@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:bg-white focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 outline-none text-sm placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-sm shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <span>{loading ? 'Verifying & Joining...' : 'Continue to Examination'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {onBackToHome && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onBackToHome}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to exam.co home</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
