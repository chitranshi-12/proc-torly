/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Student Entrance Form (Accessible via Teacher's Link)
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Video,
  Monitor,
  Mic,
  Lock,
  ArrowRight,
  AlertCircle,
  Building,
  User,
  Hash,
  Mail,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import { firebaseExamService, ExamData } from '../services/firebaseExamService';
import { demoService } from '../services/demoService';

import { ProctorlyLogo } from './ProctorlyLogo';

interface StudentCodeEntryProps {
  onVerified: (
    examData: ExamData,
    candidateInfo: { name: string; rollNo: string; email: string; institute?: string },
    sessionId: string
  ) => void;
  initialCode?: string;
  initialExam?: ExamData | null;
  isDemo?: boolean;
}

export const StudentCodeEntry: React.FC<StudentCodeEntryProps> = ({
  onVerified,
  initialCode = '',
  initialExam = null,
  isDemo = false
}) => {
  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [institute, setInstitute] = useState(initialExam?.instituteName || '');
  const [email, setEmail] = useState('');
  const [examCode, setExamCode] = useState(initialCode || initialExam?.code || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examInfo, setExamInfo] = useState<ExamData | null>(initialExam);

  // If exam was passed or code is set, pre-fetch exam info
  useEffect(() => {
    if (initialExam) {
      setExamInfo(initialExam);
      setExamCode(initialExam.code);
      if (initialExam.instituteName) setInstitute(initialExam.instituteName);
    } else if (initialCode) {
      setExamCode(initialCode);
      // Fetch exam details
      const fetchDetails = async () => {
        try {
          let found: ExamData | null = null;
          if (isDemo) {
            found = demoService.getExamByCode(initialCode);
          } else {
            found = await firebaseExamService.getExamByCode(initialCode);
          }
          if (found) {
            setExamInfo(found);
            if (found.instituteName) setInstitute(found.instituteName);
          }
        } catch (e) {}
      };
      fetchDetails();
    }
  }, [initialCode, initialExam, isDemo]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rollNo.trim() || !examCode.trim() || !email.trim()) {
      setError('Please provide your full name, roll number, institutional email, and valid exam code.');
      return;
    }

    setLoading(true);
    setError(null);

    const cleanCode = examCode.trim().toUpperCase();

    try {
      if (isDemo) {
        // In-memory demo verification
        const res = demoService.registerStudent({
          name: name.trim(),
          rollNo: rollNo.trim(),
          email: email.trim().toLowerCase(),
          institute: institute.trim() || 'Stanford Polytech Institute of Computing',
          examCode: cleanCode
        });

        onVerified(
          res.exam,
          {
            name: name.trim(),
            rollNo: rollNo.trim(),
            email: email.trim().toLowerCase(),
            institute: institute.trim()
          },
          res.session.id
        );
      } else {
        // Firebase Cloud verification
        const res = await firebaseExamService.enrollStudent({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          rollNo: rollNo.trim(),
          institute: institute.trim(),
          examCode: cleanCode
        });

        onVerified(
          res.exam,
          {
            name: name.trim(),
            rollNo: rollNo.trim(),
            email: email.trim().toLowerCase(),
            institute: institute.trim()
          },
          res.sessionId
        );
      }
    } catch (err: any) {
      // If Firebase failed due to provider restrictions, fallback to demo service smoothly
      if (err.message && (err.message.includes('auth/') || err.message.includes('operation-not-allowed'))) {
        try {
          const res = demoService.registerStudent({
            name: name.trim(),
            rollNo: rollNo.trim(),
            email: email.trim().toLowerCase(),
            institute: institute.trim() || 'Stanford Polytech Institute of Computing',
            examCode: cleanCode
          });

          onVerified(
            res.exam,
            {
              name: name.trim(),
              rollNo: rollNo.trim(),
              email: email.trim().toLowerCase(),
              institute: institute.trim()
            },
            res.session.id
          );
          return;
        } catch (demoErr: any) {
          setError(demoErr.message);
          return;
        }
      }
      setError(err.message || 'Failed to register candidate session for this examination.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 bg-slate-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-3">
          <ProctorlyLogo size="md" showText={true} />
        </div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight sm:text-3xl">
          Candidate Examination Entry
        </h2>
        <p className="mt-1.5 text-xs text-slate-400">
          Enter candidate credentials to verify eligibility and proceed to pre-exam checks
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl">
          
          {/* Active Exam Overview Banner if resolved */}
          {examInfo && (
            <div className="mb-6 p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/80 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-300">
                  Target Examination
                </span>
                <div className="font-bold text-white text-sm">{examInfo.title}</div>
                <div className="text-slate-400 mt-0.5">
                  {examInfo.instituteName || 'Department Assessment'} • {examInfo.durationMinutes} Minutes • {examInfo.questions?.length || 0} Questions
                </div>
              </div>
              <div className="font-mono font-bold text-cyan-300 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-700">
                {examInfo.code}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Full Candidate Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Eleanor Vance"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Roll Number / Student ID <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    placeholder="2026-CS-104"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Institutional Email <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@university.edu"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  College / Institute Name
                </label>
                <div className="relative">
                  <Building className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={institute}
                    onChange={(e) => setInstitute(e.target.value)}
                    placeholder="Stanford Polytech"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Exam Code <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={examCode}
                    onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                    placeholder="e.g. DEMO101"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-cyan-300 font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 shadow-lg shadow-indigo-600/30 transition-all text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Proceed to Pre-Exam Setup & Consent</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Privacy & Hardware Disclosure */}
          <div className="mt-8 pt-6 border-t border-slate-800 text-center">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Proctored Environment Verification</span>
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 flex flex-col items-center gap-1">
                <Video className="w-4 h-4 text-cyan-400" />
                <span>Webcam & Face</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 flex flex-col items-center gap-1">
                <Mic className="w-4 h-4 text-indigo-400" />
                <span>Microphone</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 flex flex-col items-center gap-1">
                <Monitor className="w-4 h-4 text-amber-400" />
                <span>Entire Screen</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
