import React from 'react';

interface GoldenLionLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
  subtitle?: string;
}

export const GoldenLionLogo: React.FC<GoldenLionLogoProps> = ({
  size = 'md',
  className = '',
  showText = false,
  subtitle = 'Gestão Financeira & ERP'
}) => {
  const dimensions = {
    sm: { box: 'w-7 h-7', icon: 18, text: 'text-xs', sub: 'text-[9px]' },
    md: { box: 'w-9 h-9', icon: 22, text: 'text-sm', sub: 'text-[10px]' },
    lg: { box: 'w-11 h-11', icon: 26, text: 'text-base', sub: 'text-xs' },
    xl: { box: 'w-14 h-14', icon: 34, text: 'text-lg', sub: 'text-xs' },
  }[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Black badge with gold lion emblem */}
      <div 
        className={`${dimensions.box} rounded-xl bg-gradient-to-b from-[#18181b] via-[#09090b] to-[#000000] border border-[#d4af37]/40 flex items-center justify-center relative overflow-hidden flex-shrink-0 group`}
      >
        {/* Subtle golden ambient sheen */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#d4af37]/10 via-transparent to-[#fef08a]/20 opacity-80" />
        
        {/* Heraldic stylized Golden Lion SVG */}
        <svg 
          width={dimensions.icon} 
          height={dimensions.icon} 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-[0_1px_3px_rgba(212,175,55,0.45)]"
        >
          {/* Crown */}
          <path 
            d="M8 4L10 6.5L12 3L14 6.5L16 4V7H8V4Z" 
            fill="url(#goldGradient)" 
            stroke="#fef08a" 
            strokeWidth="0.4"
          />
          {/* Lion Mane and Head */}
          <path 
            d="M12 7C9 7 7.5 9 7.5 11.5C7.5 13.5 8.5 15.2 9.8 16.2C10.2 16.5 10.5 17.2 10.5 17.8L10.3 20H13.7L13.5 17.8C13.5 17.2 13.8 16.5 14.2 16.2C15.5 15.2 16.5 13.5 16.5 11.5C16.5 9 15 7 12 7Z" 
            fill="url(#goldGradient)" 
          />
          {/* Lion Snout / Face contours */}
          <path 
            d="M12 11.5V13.8M10.8 12.8L12 13.8L13.2 12.8" 
            stroke="#000000" 
            strokeWidth="0.8" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
          {/* Lion Eyes */}
          <circle cx="10.3" cy="10.5" r="0.7" fill="#000000" />
          <circle cx="13.7" cy="10.5" r="0.7" fill="#000000" />
          {/* Mane outer rays */}
          <path 
            d="M6 10C5.2 11.2 5 12.5 5.5 13.8C6 15 7.2 16 8 16.5M18 10C18.8 11.2 19 12.5 18.5 13.8C18 15 16.8 16 16 16.5" 
            stroke="url(#goldGradientLight)" 
            strokeWidth="1.2" 
            strokeLinecap="round" 
          />

          <defs>
            <linearGradient id="goldGradient" x1="6" y1="3" x2="18" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FCD34D" />
              <stop offset="0.45" stopColor="#D4AF37" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
            <linearGradient id="goldGradientLight" x1="5" y1="10" x2="19" y2="16" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE68A" />
              <stop offset="0.7" stopColor="#D4AF37" />
              <stop offset="1" stopColor="#B45309" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showText && (
        <div className="truncate text-left leading-tight">
          <div className={`font-bold tracking-wide text-[var(--text-primary)] ${dimensions.text} flex items-center gap-1.5`}>
            <span className="bg-gradient-to-r from-[#fbbf24] via-[#d4af37] to-[#cdaa58] bg-clip-text text-transparent drop-shadow-2xs">
              LEÃO DOURADO
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold tracking-wider uppercase">
              ERP
            </span>
          </div>
          {subtitle && (
            <p className={`text-[var(--text-secondary)] font-medium truncate ${dimensions.sub}`}>
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
