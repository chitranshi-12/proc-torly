/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Enterprise React Error Boundary
 * Prevents black screens and unhandled crashes, providing graceful recovery options.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';
import { ExamCoLogo } from './ExamCoLogo';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('exam.co UI ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    window.location.href = window.location.origin + window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center px-4 py-12 selection:bg-indigo-500 selection:text-white">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 shadow-xl shadow-slate-200/50 text-center">
            <div className="flex justify-center mb-6">
              <ExamCoLogo size="lg" theme="light" />
            </div>

            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-5 shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {this.props.fallbackTitle || 'Something interrupted this session'}
            </h1>

            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              An unexpected interface error occurred. Your examination responses and state are preserved securely on the server.
            </p>

            {this.state.error && (
              <div className="mt-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left overflow-hidden">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Diagnostic Message
                </span>
                <p className="text-xs font-mono text-slate-700 break-words line-clamp-3">
                  {this.state.error.message || 'Unknown runtime error'}
                </p>
              </div>
            )}

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Home className="w-4 h-4" />
                <span>Return to Home</span>
              </button>
            </div>
          </div>

          <div className="mt-6 text-xs text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <span>exam.co High-Integrity Recovery Protocol</span>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
