/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Teacher & Invigilator Portal Entry
 */

import React, { useState } from 'react';
import {
  ShieldAlert,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Video,
  Monitor,
  Zap,
  CheckCircle2,
  UserPlus,
  LogIn
} from 'lucide-react';
import { api, setAuthToken } from '../services/api';
import { ProctorlyLogo } from './ProctorlyLogo';

interface AdminLoginProps {
  onSuccess: (user: any) => void;
  onLaunchDemo: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onSuccess, onLaunchDemo }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fillAdmin = () => {
    setEmail('admin@proctor.edu');
    setPassword('Admin@12345');
    setIsSignUp(false);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        if (!name.trim()) {
          setError('Please enter your full name.');
          return;
        }
        const res = await api.register({ name: name.trim(), email: email.trim().toLowerCase(), password, role: 'invigilator' });
        setAuthToken(res.token);
        setSuccess('Account created! Signing you in...');
        setTimeout(() => onSuccess(res.user), 500);
      } else {
        const res = await api.login({ email: email.trim().toLowerCase(), password });
        setAuthToken(res.token);
        onSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-950">

      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-5">
          <ProctorlyLogo size="lg" showText={true} />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Teacher &amp; Invigilator Portal
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Manage proctored exams and monitor live candidates.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md space-y-4">

        {/* ── Demo Mode Card ── */}
        <div className="bg-gradient-to-r from-indigo-950/80 via-slate-900 to-cyan-950/80 border border-indigo-500/40 rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                  Zero Setup
                </span>
                <span className="text-xs font-bold text-white">Interactive Demo</span>
              </div>
              <p className="text-xs text-slate-400">
                6 simulated students · live violation alerts · audio chimes · no login needed
              </p>
            </div>
            <button
              type="button"
              onClick={onLaunchDemo}
              className="shrink-0 py-2.5 px-5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              Launch Demo
            </button>
          </div>
        </div>

        {/* ── Login / Register Card ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">

          {/* Tab toggle */}
          <div className="flex gap-2 mb-5 p-1 bg-slate-950 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setIsSignUp(false); setError(null); setSuccess(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                !isSignUp ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsSignUp(true); setError(null); setSuccess(null); }}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isSignUp ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Register
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name — only for register */}
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Prof. David Vance"
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@institution.edu"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition"
              />
            </div>

            {/* Quick fill for sign-in mode */}
            {!isSignUp && (
              <button
                type="button"
                onClick={fillAdmin}
                className="text-xs text-indigo-400 hover:text-cyan-300 flex items-center gap-1 font-medium cursor-pointer transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Use default admin credentials
              </button>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{isSignUp ? 'Create Account & Enter' : 'Sign In to Dashboard'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Default credentials hint */}
          {!isSignUp && (
            <p className="mt-4 text-center text-xs text-slate-600">
              Default: <span className="text-slate-500">admin@proctor.edu</span> / <span className="text-slate-500">Admin@12345</span>
            </p>
          )}
        </div>

        {/* Feature pills */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
            <Monitor className="w-4 h-4 text-cyan-500 mx-auto mb-1" />
            WebRTC Screen View
          </div>
          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
            <Video className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
            AI Face Detection
          </div>
          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            Full Audit Logs
          </div>
        </div>
      </div>
    </div>
  );
};
