/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Landing Page (Professional White-Theme SaaS)
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Users,
  Clock,
  FileCheck2,
  Lock,
  BarChart3,
  CheckCircle2,
  GraduationCap,
  KeyRound,
  Zap,
  Play
} from 'lucide-react';
import { ExamCoLogo } from './ExamCoLogo';

interface LandingPageProps {
  onTeacherLogin: () => void;
  onStudentJoin: (code?: string) => void;
  onLaunchDemo: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onTeacherLogin,
  onStudentJoin,
  onLaunchDemo
}) => {
  const [examCodeInput, setExamCodeInput] = useState('');

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (examCodeInput.trim()) {
      onStudentJoin(examCodeInput.trim().toUpperCase());
    } else {
      onStudentJoin();
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* ── Top Header ── */}
      <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <ExamCoLogo size="md" theme="light" />

          <div className="flex items-center gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={onLaunchDemo}
              className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              Interactive Demo
            </button>
            <button
              type="button"
              onClick={() => onStudentJoin()}
              className="text-xs sm:text-sm font-semibold px-3.5 py-1.5 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Student Portal
            </button>
            <button
              type="button"
              onClick={onTeacherLogin}
              className="text-xs sm:text-sm font-semibold px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>Teacher Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <section className="relative pt-16 sm:pt-24 pb-20 sm:pb-28 overflow-hidden bg-radial from-indigo-50/50 via-white to-white border-b border-slate-200/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold mb-6 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Modern Production Examination Platform</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 max-w-4xl mx-auto leading-[1.12]">
            High-integrity assessments built for schools, universities, and enterprise.
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed font-normal">
            Authoritative server-side timers, continuous proctoring verification, resilient autosave, and instantaneous grade analytics — all in one modern examination engine.
          </p>

          {/* Quick Join / Action Bar */}
          <div className="mt-10 max-w-md mx-auto">
            <form
              onSubmit={handleQuickJoin}
              className="flex items-center gap-2 bg-white p-2 rounded-2xl border-2 border-indigo-100 focus-within:border-indigo-600 shadow-xl shadow-indigo-100/50 transition-all"
            >
              <div className="pl-2.5 text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Enter 6-char Exam Code..."
                value={examCodeInput}
                onChange={(e) => setExamCodeInput(e.target.value.toUpperCase())}
                maxLength={12}
                className="bg-transparent flex-1 px-2 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none uppercase font-mono tracking-wider font-semibold"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
              >
                <span>Join Exam</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-slate-500 font-medium">
              <span>Have an assigned assessment?</span>
              <button
                type="button"
                onClick={() => onStudentJoin('DEMO101')}
                className="text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
              >
                Try sample code DEMO101
              </button>
            </div>
          </div>

          {/* Teacher quick actions */}
          <div className="mt-10 pt-8 border-t border-slate-100 flex flex-wrap items-center justify-center gap-4 text-xs">
            <span className="text-slate-500 font-semibold">Educators & Administrators:</span>
            <button
              type="button"
              onClick={onTeacherLogin}
              className="inline-flex items-center gap-1.5 font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
            >
              <span>Sign in with Google</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onLaunchDemo}
              className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <Zap className="w-3 h-3 text-indigo-600" />
              <span>Explore Teacher Console Demo</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── Core Value Pillars ── */}
      <section className="py-20 bg-slate-50/70 border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-2">
              Architectural Guarantees
            </h2>
            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Built for reliability under real testing conditions.
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Pillar 1 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-6">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">
                Authoritative Server Timer
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Exam duration, starts, and expirations are strictly calculated and enforced on the server. Client clock tampering or refreshing never grants extra testing time.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">
                Real-Time Proctored Invigilation
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Live candidate heartbeats, tab-switch detection, fullscreen enforcement, and instant threat alert banners keep instructors in complete control of cohort integrity.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mb-6">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">
                Instant Grading & CSV Reports
              </h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                Authoritative grading algorithms calculate points and risk scores upon submission, generating instant audit reports and one-click spreadsheet CSV exports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-8 bg-white text-slate-500 text-xs border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ExamCoLogo size="sm" theme="light" />
            <span>• Enterprise Examination Architecture</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <span>Authoritative Scoring Engine</span>
            <span>•</span>
            <span>Zero-Downtime Resilience</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
