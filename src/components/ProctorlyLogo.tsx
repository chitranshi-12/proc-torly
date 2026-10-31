import React from 'react';

interface ProctorlyLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  animate?: boolean;
}

export const ProctorlyEyeIcon: React.FC<{ size?: number | string; className?: string; animate?: boolean }> = ({
  size = 32,
  className = '',
  animate = true
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]"
      >
        <defs>
          {/* Outer eye gradient */}
          <linearGradient id="eyeGrad" x1="4" y1="24" x2="44" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="50%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>

          {/* Iris radial glow */}
          <radialGradient id="irisGrad" cx="24" cy="24" r="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="65%" stopColor="#0284C7" />
            <stop offset="100%" stopColor="#1E1B4B" />
          </radialGradient>

          {/* Pupil glow */}
          <radialGradient id="pupilGrad" cx="24" cy="24" r="4.5" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0F172A" />
          </radialGradient>

          {/* Upper eyelid shine */}
          <linearGradient id="lidShine" x1="8" y1="12" x2="40" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#818CF8" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#A5F3FC" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Outer Eye Outline / Contours */}
        <path
          d="M4 24C9 14.5 16 9.5 24 9.5C32 9.5 39 14.5 44 24C39 33.5 32 38.5 24 38.5C16 38.5 9 33.5 4 24Z"
          fill="#090D16"
          stroke="url(#eyeGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Eyelid Upper Highlight Accent */}
        <path
          d="M8.5 22C12.8 14.8 18.2 11.2 24 11.2C29.8 11.2 35.2 14.8 39.5 22"
          stroke="url(#lidShine)"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Subtle Scanner Reticle / Arc Markers */}
        <circle
          cx="24"
          cy="24"
          r="14"
          stroke="#0EA5E9"
          strokeWidth="0.75"
          strokeDasharray="2 4"
          opacity="0.4"
        />

        {/* Iris Outer Ring */}
        <circle
          cx="24"
          cy="24"
          r="9"
          fill="url(#irisGrad)"
          stroke="#38BDF8"
          strokeWidth="1.5"
        />

        {/* Inner Tech Concentric Lens Ring */}
        <circle
          cx="24"
          cy="24"
          r="6.5"
          stroke="#67E8F9"
          strokeWidth="0.75"
          strokeDasharray="3 2"
          opacity="0.75"
          className={animate ? 'animate-spin' : ''}
          style={{ transformOrigin: '24px 24px', animationDuration: '10s' }}
        />

        {/* Pupil Core (Smart Lens Sensor) */}
        <circle
          cx="24"
          cy="24"
          r="4"
          fill="url(#pupilGrad)"
        />

        {/* Optical Reflection Glint (Top-left catching light) */}
        <circle
          cx="21.5"
          cy="21.5"
          r="1.25"
          fill="#FFFFFF"
          opacity="0.95"
        />
        <circle
          cx="26"
          cy="26"
          r="0.6"
          fill="#FFFFFF"
          opacity="0.6"
        />

        {/* Corner Cyber Accents (Left & Right canthus anchors) */}
        <path d="M4 24H7" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
        <path d="M41 24H44" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export const ProctorlyLogo: React.FC<ProctorlyLogoProps> = ({
  size = 'md',
  showText = true,
  className = '',
  animate = true
}) => {
  const pixelSizes = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 52,
    xl: 64
  };

  const textSizes = {
    xs: 'text-sm',
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl'
  };

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Eye Emblem Container */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-2xl blur-md opacity-30 group-hover:opacity-60 transition duration-300" />
        <div className="relative p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-center">
          <ProctorlyEyeIcon size={pixelSizes[size]} animate={animate} />
        </div>
      </div>

      {/* Brand Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className={`font-black tracking-tight text-white font-sans ${textSizes[size]}`}>
              Proctor<span className="text-cyan-400">ly</span>
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ProctorlyLogo;
