/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Top Navigation Bar
 */

import React from 'react';
import {
  ShieldCheck,
  UserCheck,
  LogOut,
  BookOpen,
  Sparkles,
  ExternalLink,
  Zap,
  RotateCcw
} from 'lucide-react';

import { ProctorlyLogo } from './ProctorlyLogo';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  adminUser: any | null;
  onLogoutAdmin: () => void;
  isDemo?: boolean;
  onExitDemo?: () => void;
  onOpenTestStudentTab?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  adminUser,
  onLogoutAdmin,
  isDemo = false,
  onExitDemo,
  onOpenTestStudentTab
}) => {
  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => {
            if (adminUser || isDemo) {
              onNavigate('admin_exams');
            } else {
              onNavigate('admin_login');
            }
          }}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <ProctorlyLogo size="sm" showText={false} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white font-sans">
                Proctor<span className="text-cyan-400">ly</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                Teacher Console
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">AI Vision & WebRTC Online Exam Proctoring</p>
          </div>
        </div>

        {/* Right side Actions */}
        <div className="flex items-center gap-3">
          {/* Demo Mode Badge and Sync Button */}
          {isDemo && (
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 text-xs font-semibold">
                <Zap className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                <span>Simulation Active (6 Candidates)</span>
              </div>

              {onOpenTestStudentTab && (
                <button
                  onClick={onOpenTestStudentTab}
                  className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                  title="Open a second tab to test candidate experience"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Test Student View</span>
                </button>
              )}

              {onExitDemo && (
                <button
                  onClick={onExitDemo}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 hover:border-rose-700 transition-colors cursor-pointer"
                  title="Exit demo and connect to Live Cloud Firestore"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Exit Demo</span>
                </button>
              )}
            </div>
          )}

          {/* Navigation modes */}
          {adminUser ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onNavigate('admin_exams')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
                  currentView.startsWith('admin')
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>My Exams</span>
              </button>

              <div className="h-4 w-px bg-slate-800" />

              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-xs font-bold text-indigo-300">
                  {adminUser.name ? adminUser.name[0].toUpperCase() : 'T'}
                </div>
                <div className="hidden lg:block text-left text-xs">
                  <div className="font-medium text-slate-200">{adminUser.name}</div>
                  <div className="text-[10px] text-slate-400">Teacher / Invigilator</div>
                </div>
                <button
                  onClick={onLogoutAdmin}
                  title="Logout"
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : !isDemo ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate('admin_login')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-all shadow-sm cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                <span>Teacher Sign In</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
