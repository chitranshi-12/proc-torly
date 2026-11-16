/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Examination Completion & Result Screen (White-Theme SaaS Design)
 * Authoritatively separates:
 * 1. Academic score
 * 2. Examination outcome (Submitted vs Terminated by Invigilator vs Automated Rule)
 * 3. Proctoring risk index (derived from real MongoDB incidents)
 * 4. Termination reason & exact timestamp
 * 5. Teacher review status (Pending Review vs Final)
 * 6. Institutional Privacy & Audit notice (No uncertified compliance claims)
 */

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Info,
  Clock,
  FileQuestion,
  UserCheck,
  Cpu
} from 'lucide-react';
import { ExamCoLogo } from './ExamCoLogo';

interface ExamCompletionProps {
  result: any;
  onReset: () => void;
}

export const ExamCompletion: React.FC<ExamCompletionProps> = ({ result, onReset }) => {
  const isTerminated = result.status === 'terminated';

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
      ? Math.round(((result.score ?? 0) / result.totalMarks) * 100)
      : 0;

  const terminationSource =
    result.terminationSource === 'invigilator'
      ? 'Invigilator'
      : result.terminationSource === 'automated_rule'
      ? 'Automated Examination Rule'
      : result.reason?.toLowerCase().includes('invigilator')
      ? 'Invigilator'
      : 'Automated Examination Rule';

  const terminationReason =
    result.terminationReason ||
    result.reason ||
    (isTerminated ? 'Examination session was terminated under proctoring rules.' : '');

  const terminatedAt = result.terminatedAt || result.submittedAt || new Date().toISOString();

  // Authoritative proctoring risk index calculation
  const hasRiskScore = typeof result.riskScore === 'number' && !isNaN(result.riskScore);
  const riskScore = hasRiskScore ? result.riskScore : null;
  const incidentCount = result.incidentCount ?? (Array.isArray(result.incidents) ? result.incidents.length : 0);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 selection:bg-indigo-500 selection:text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl shadow-slate-200/50 p-6 sm:p-10 text-center">
          <div className="flex justify-center mb-6">
            <ExamCoLogo size="md" theme="light" />
          </div>

          {/* Status Indicator Icon */}
          {isTerminated ? (
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 mx-auto flex items-center justify-center mb-5 shadow-xs">
              <AlertTriangle className="w-8 h-8" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 mx-auto flex items-center justify-center mb-5 shadow-xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>
          )}

          {/* Outcome Header */}
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {isTerminated ? 'EXAMINATION TERMINATED' : 'Examination Submitted Successfully'}
          </h2>
          <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
            {isTerminated
              ? 'This examination session was stopped prior to scheduled completion. Review details below.'
              : 'All responses have been securely verified, evaluated, and transmitted to the examination record.'}
          </p>

          {/* PART 1A: Termination Audit Details (Displayed ONLY if terminated) */}
          {isTerminated && (
            <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-rose-50/70 border border-rose-200 text-left space-y-3">
              <div className="flex items-center justify-between border-b border-rose-200/80 pb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Termination Record
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300">
                  {terminationSource === 'Invigilator' ? (
                    <UserCheck className="w-3 h-3" />
                  ) : (
                    <Cpu className="w-3 h-3" />
                  )}
                  {terminationSource}
                </span>
              </div>

              <div className="text-xs space-y-2 text-slate-700">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                  <span className="font-semibold text-slate-900 shrink-0">Recorded Reason:</span>
                  <span className="font-mono text-slate-800 text-right break-words">{terminationReason}</span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-rose-200/50">
                  <span className="font-semibold text-slate-900">Termination Time:</span>
                  <span className="font-mono text-slate-700 flex items-center gap-1 text-[11px]">
                    <Clock className="w-3 h-3 text-slate-500" />
                    {new Date(terminatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-rose-200/50">
                  <span className="font-semibold text-slate-900">Review Status:</span>
                  <span className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                    Pending Invigilator Review
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* PART 1B: Academic Score Assessment (Separated from termination state) */}
          <div className="mt-5 p-5 sm:p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <FileQuestion className="w-3.5 h-3.5 text-indigo-600" /> Academic Score Assessment
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 text-slate-700 font-mono">
                {isTerminated ? 'Withheld Pending Review' : 'Authoritative'}
              </span>
            </div>

            <div className="flex items-baseline justify-center gap-2 my-2">
              <span className="text-4xl sm:text-5xl font-black text-slate-900">{result.score ?? 0}</span>
              <span className="text-slate-500 font-mono text-sm font-bold">/ {result.totalMarks || 0} pts</span>
            </div>

            <div className="text-xs font-bold text-indigo-600 mb-2">
              Evaluated Accuracy: {scorePct}%
            </div>

            <p className="text-[11px] text-slate-500 border-t border-slate-200/80 pt-2 text-left sm:text-center">
              {isTerminated
                ? 'Academic marks represent answers recorded before session conclusion. Official confirmation remains subject to teacher audit.'
                : 'Scored against authoritative server answer key. All question submissions persisted.'}
            </p>
          </div>

          {/* PART 1C: Proctoring Risk Index & Audit History */}
          <div className="mt-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-slate-700 flex items-center gap-1.5 font-medium">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" /> Proctoring Risk Index
              </span>
              {riskScore !== null ? (
                <span
                  className={`font-mono font-bold px-2.5 py-0.5 rounded-full text-[11px] ${
                    riskScore < 25
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : riskScore < 60
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {riskScore} / 100 Risk ({incidentCount} incident{incidentCount === 1 ? '' : 's'})
                </span>
              ) : (
                <span className="font-mono font-semibold px-2.5 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-700 border border-slate-300">
                  Not assessed
                </span>
              )}
            </div>

            {/* Privacy & Audit Info (Replaced false DPDP compliance claim) */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                <Info className="w-3.5 h-3.5 text-slate-500" /> Session Audit & Privacy
              </span>
              <span className="text-[11px] text-slate-600 font-medium">
                Retained under examination audit policy
              </span>
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1 font-mono">
              <span>Timestamp:</span>
              <span>{new Date().toLocaleString()}</span>
            </div>
          </div>

          {/* Return Button */}
          <button
            type="button"
            onClick={onReset}
            className="mt-6 w-full py-3.5 px-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 text-xs transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 shadow-sm"
          >
            <span>Return to Candidate Portal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
