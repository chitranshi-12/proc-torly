import React from 'react';
export { ExamCoLogo } from './ExamCoLogo';

export const ProctorlyEyeIcon: React.FC<{ size?: number | string; className?: string }> = ({
  size = 28,
  className = ''
}) => {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0 ${className}`}
      style={{ width: size, height: size }}
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
  );
};

export const ProctorlyLogo = ({ size = 'md', showText = true }: any) => {
  return <div className="inline-flex items-center gap-2 font-bold text-white text-lg tracking-tight">exam<span className="text-indigo-400">.co</span></div>;
};
