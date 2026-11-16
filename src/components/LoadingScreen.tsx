/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Standard Clean Loading Screen
 * Eliminates black-screen freeze states and provides timeout escape actions.
 */

import React, { useState, useEffect } from 'react';
import { Home } from 'lucide-react';
import { ExamCoLogo } from './ExamCoLogo';

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
  timeoutSeconds?: number;
  onTimeout?: () => void;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Initializing secure examination platform...',
  subMessage = 'Connecting to authoritative session services',
  timeoutSeconds = 8,
  onTimeout
}) => {
  const [showEscapeHatch, setShowEscapeHatch] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowEscapeHatch(true);
      if (onTimeout) {
        onTimeout();
      }
    }, timeoutSeconds * 1000);

    return () => clearTimeout(timer);
  }, [timeoutSeconds, onTimeout]);

  const handleReturnHome = () => {
    window.location.href = window.location.origin + window.location.pathname;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center px-4 py-12 select-none">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-lg shadow-slate-200/50 text-center flex flex-col items-center">
        <ExamCoLogo size="lg" theme="light" />

        <div className="relative my-8">
          <div className="w-12 h-12 rounded-full border-3 border-indigo-100 border-t-indigo-600 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
          </div>
        </div>

        <h2 className="text-lg font-bold text-slate-900 tracking-tight">
          {message}
        </h2>
        <p className="mt-1.5 text-xs text-slate-500 max-w-xs">
          {subMessage}
        </p>

        {showEscapeHatch && (
          <div className="mt-8 pt-6 border-t border-slate-100 w-full animate-fade-in">
            <p className="text-xs text-slate-500 mb-3">
              Taking longer than expected?
            </p>
            <button
              type="button"
              onClick={handleReturnHome}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Return to Main Portal</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
