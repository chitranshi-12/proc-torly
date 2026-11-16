import React from 'react';

interface ExamCoLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  theme?: 'dark' | 'light';
}

export const ExamCoLogo: React.FC<ExamCoLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  theme = 'dark'
}) => {
  const iconDimensions = {
    sm: 22,
    md: 28,
    lg: 34,
    xl: 42
  }[size];

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  }[size];

  const isLight = theme === 'light';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none font-semibold ${className}`}>
      {/* Geometric minimal badge */}
      <div
        className="relative flex items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shrink-0"
        style={{ width: iconDimensions, height: iconDimensions }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3/5 h-3/5"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>

      {showText && (
        <span className={`tracking-tight font-bold ${textSizes} ${isLight ? 'text-slate-900' : 'text-white'}`}>
          exam<span className="text-indigo-500">.co</span>
        </span>
      )}
    </div>
  );
};
