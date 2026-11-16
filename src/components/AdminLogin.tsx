/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Teacher & Invigilator Portal Entry (White-Theme SaaS Design)
 */

import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  Zap,
  ArrowLeft
} from 'lucide-react';
import { api, setAuthToken } from '../services/api';
import { firebaseExamService } from '../services/firebaseExamService';
import { ExamCoLogo } from './ExamCoLogo';

interface AdminLoginProps {
  onSuccess: (user: any) => void;
  onLaunchDemo: () => void;
  onBackToHome?: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onSuccess,
  onLaunchDemo,
  onBackToHome
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishGoogleLogin = async (result: { user: { getIdToken: () => Promise<string> }; role?: string }) => {
    const idToken = await result.user.getIdToken();
    setAuthToken(idToken);

    try {
      const response = await api.getMe();
      onSuccess(response.user);
    } catch (apiErr: any) {
      console.warn('Backend teacher sync note:', apiErr.message);
      // Fallback user object from Firebase auth if backend is still establishing initial connection
      const fallbackUser = {
        id: (result.user as any).uid || 'teacher',
        name: (result.user as any).displayName || 'Teacher',
        email: (result.user as any).email || 'teacher@exam.co',
        role: 'teacher'
      };
      onSuccess(fallbackUser);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get('auth_error');
    if (!authError) return;

    setError(authError);
    params.delete('auth_error');
    const query = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    );
  }, []);

  useEffect(() => {
    let active = true;
    firebaseExamService
      .completeGoogleSignInRedirect()
      .then(async (result) => {
        if (!result || !active) return;
        setLoading(true);
        try {
          await finishGoogleLogin(result);
        } catch (err: any) {
          if (active) setError(err.message || 'Google sign-in failed. Please try again.');
        } finally {
          if (active) setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message || 'Google sign-in failed. Please try again.');
      });

    return () => {
      active = false;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await firebaseExamService.signInWithGoogle();
      if (!result) return; // redirected or completed
      await finishGoogleLogin({ user: result });
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-6 cursor-pointer" onClick={onBackToHome}>
          <ExamCoLogo size="lg" theme="light" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Teacher Portal
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in to manage examinations, monitor candidates, and export results.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md space-y-4">
        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3 shadow-xs">
            <ShieldAlert className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* ── Main Login Card ── */}
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-200/50">
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-slate-300 text-slate-900 font-bold text-sm shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{loading ? 'Authenticating with Google...' : 'Continue with Google'}</span>
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-500 font-bold tracking-wider">Or explore demo</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onLaunchDemo}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-700 text-sm font-bold transition-all cursor-pointer active:scale-95"
            >
              <Zap className="w-4 h-4 text-indigo-600" />
              <span>Launch Teacher Interactive Demo</span>
            </button>
          </div>
        </div>

        {onBackToHome && (
          <div className="text-center pt-2">
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
