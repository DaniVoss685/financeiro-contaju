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
      {/* Emblema dourado de gestão financeira */}
      <div 
        className={`${dimensions.box} rounded-xl bg-gradient-to-b from-[#18181b] via-[#09090b] to-[#000000] border border-[#d4af37]/50 shadow-[0_0_26px_-6px_rgba(212,175,55,0.6)] flex items-center justify-center relative overflow-hidden flex-shrink-0 group`}
      >
        {/* Subtle golden ambient sheen */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#d4af37]/10 via-transparent to-[#fef08a]/20 opacity-80" />
        
        
        <svg 
          width={dimensions.icon} 
          height={dimensions.icon} 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-[0_1px_3px_rgba(212,175,55,0.45)]"
        >
          {/* Barras crescendo + linha de resultado: gestão financeira */}
          <rect x="4.5" y="13.5" width="3.4" height="6" rx="0.9" fill="url(#goldGradient)" />
          <rect x="10.3" y="10" width="3.4" height="9.5" rx="0.9" fill="url(#goldGradient)" />
          <rect x="16.1" y="6.5" width="3.4" height="13" rx="0.9" fill="url(#goldGradient)" />
          <path d="M4.5 9.5L9.5 6L13 8.2L19.5 3.2" stroke="url(#goldGradientLight)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15.8 3.1H19.6V6.9" stroke="url(#goldGradientLight)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

          <defs>
            <linearGradient id="goldGradient" x1="4" y1="6" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FCD34D" />
              <stop offset="0.5" stopColor="#D4AF37" />
              <stop offset="1" stopColor="#92400E" />
            </linearGradient>
            <linearGradient id="goldGradientLight" x1="4" y1="3" x2="20" y2="10" gradientUnits="userSpaceOnUse">
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
              CONTAJU
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
