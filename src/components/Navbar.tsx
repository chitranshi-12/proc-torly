/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * exam.co Global Navigation Bar (White-Theme SaaS Design)
 */

import React from 'react';
import {
  LogOut,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { ExamCoLogo } from './ExamCoLogo';

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
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => {
            if (adminUser || isDemo) {
              onNavigate('admin_exams');
            } else {
              onNavigate('landing');
            }
          }}
          className="cursor-pointer"
        >
          <ExamCoLogo size="md" theme="light" />
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-3">
          {/* Demo Badge & Exit Button */}
          {isDemo && (
            <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
              <span className="text-xs font-bold text-indigo-900">Demo Environment</span>
              {onExitDemo && (
                <button
                  type="button"
                  onClick={onExitDemo}
                  className="ml-1 text-[11px] text-indigo-700 hover:text-indigo-950 font-semibold underline cursor-pointer"
                >
                  Exit Demo
                </button>
              )}
            </div>
          )}

          {/* Test Student Portal shortcut */}
          {onOpenTestStudentTab && (
            <button
              type="button"
              onClick={onOpenTestStudentTab}
              title="Open Student Test Window"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
              <span>Student Window</span>
            </button>
          )}

          {/* Teacher User Profile & Logout */}
          {adminUser && (
            <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-slate-200">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900 leading-tight">
                  {adminUser.name || 'Teacher'}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {adminUser.email || 'teacher@exam.co'}
                </span>
              </div>

              <button
                type="button"
                onClick={onLogoutAdmin}
                className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all cursor-pointer"
                title="Sign out of exam.co"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Public Navigation */}
          {!adminUser && !isDemo && currentView !== 'landing' && (
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Back to Home
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
