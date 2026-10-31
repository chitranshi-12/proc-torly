import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle2, ShieldCheck, AlertTriangle, ArrowRight, Award, Lock, Download } from 'lucide-react';
import { ProctorlyLogo } from './ProctorlyLogo';

interface ExamCompletionProps {
  result: any;
  onReset: () => void;
}

export const ExamCompletion: React.FC<ExamCompletionProps> = ({ result, onReset }) => {
  useEffect(() => {
    if (result.status === 'submitted') {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [result.status]);

  const scorePct =
    result.totalMarks && result.totalMarks > 0
      ? Math.round((result.score / result.totalMarks) * 100)
      : 0;

  const isTerminated = result.status === 'terminated';

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-radial from-slate-900 to-slate-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 text-center backdrop-blur-xl">
          <div className="flex justify-center mb-6">
            <ProctorlyLogo size="sm" showText={true} />
          </div>
          {isTerminated ? (
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center mb-6 shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          )}

          <h2 className="text-2xl font-black text-white tracking-tight">
            {isTerminated ? 'Examination Terminated' : 'Examination Submitted Successfully'}
          </h2>
          <p className="mt-2 text-xs text-slate-400">
            {isTerminated
              ? 'Your examination session was concluded by the automated proctoring defense or invigilator.'
              : 'All responses have been securely encrypted, evaluated, and transmitted to the examination board.'}
          </p>

          {/* Score Card */}
          <div className="mt-6 p-6 rounded-2xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Automated Score Assessment
            </div>
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl font-black text-white">{result.score ?? 0}</span>
              <span className="text-slate-400 font-mono text-sm">/ {result.totalMarks || 0} pts</span>
            </div>
            <div className="mt-2 text-xs font-bold text-cyan-400">
              Grade Percentage: {scorePct}%
            </div>
          </div>

          {/* Proctoring Risk & Integrity Summary */}
          <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-left space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Proctoring Risk Index
              </span>
              <span
                className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                  (result.riskScore || 0) < 25
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : (result.riskScore || 0) < 60
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                }`}
              >
                {result.riskScore || 0} / 100 Risk
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-cyan-400" /> Compliance Standard
              </span>
              <span className="font-mono text-slate-300">DPDP Act 2023 Compliant</span>
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-500 pt-2 border-t border-slate-900">
              <span>Timestamp:</span>
              <span>{new Date().toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={onReset}
            className="mt-8 w-full py-3.5 px-4 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Return to Candidate Portal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
