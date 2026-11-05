import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

/**
 * Peças de interface do ContaJu Elite. Usadas por todas as telas para manter o
 * mesmo respiro, a mesma tipografia e cor apenas onde ela informa algo.
 */

/** Cartão base: fundo da superfície, borda fina, sem sombra pesada. */
export const Card: React.FC<{ className?: string; padded?: boolean; children: React.ReactNode }> = ({
  className = '',
  padded = true,
  children
}) => (
  <div className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>
    {children}
  </div>
);

/** Linha de abertura da tela: descrição curta à esquerda, ações à direita. */
export const PageToolbar: React.FC<{ description?: React.ReactNode; children?: React.ReactNode }> = ({ description, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <p className="text-sm text-[var(--text-secondary)] max-w-2xl min-w-0 flex-1">{description}</p>
    {children && <div className="flex items-center gap-2 flex-wrap sm:shrink-0">{children}</div>}
  </div>
);

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand-gold-fill)] text-[#18181b] font-semibold hover:brightness-105 active:brightness-95',
  secondary: 'border border-[var(--border-highlight)] bg-[var(--surface-card)] text-[var(--text-primary)] font-medium hover:bg-[var(--surface-hover)]',
  ghost: 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] font-medium',
  danger: 'border border-[var(--border-highlight)] bg-[var(--surface-card)] text-[var(--status-danger)] font-medium hover:bg-[var(--surface-hover)]'
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: React.ReactNode }> = ({
  variant = 'secondary',
  icon,
  className = '',
  children,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    {...rest}
    className={`h-10 px-4 inline-flex items-center justify-center gap-2 rounded-xl text-sm transition cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
  >
    {icon}
    {children}
  </button>
);

/** Indicador clicável. A cor só aparece quando o número pede atenção (tone). */
export const StatTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  count?: number;
  active?: boolean;
  tone?: 'neutral' | 'danger' | 'success';
  onClick?: () => void;
}> = ({ label, value, hint, count, active = false, tone = 'neutral', onClick }) => {
  const valueColor = tone === 'danger' ? 'text-[var(--status-danger)]' : tone === 'success' ? 'text-[var(--status-success)]' : 'text-[var(--text-primary)]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 sm:p-5 transition-colors cursor-pointer min-w-0 ${
        active
          ? 'border-[var(--brand-gold-fill)] bg-[var(--surface-card)] ring-1 ring-[var(--brand-gold-fill)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-highlight)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-[var(--text-secondary)] truncate">{label}</span>
        {count !== undefined && (
          <span className="text-xs tabular-nums text-[var(--text-muted)] shrink-0">{count}</span>
        )}
      </div>
      <div className={`mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums truncate ${valueColor}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--text-muted)] truncate">{hint}</div>}
    </button>
  );
};

/** Indicador estático (não clicável). */
export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'neutral' | 'danger' | 'success' }> = ({ label, value, hint, tone = 'neutral' }) => {
  const valueColor = tone === 'danger' ? 'text-[var(--status-danger)]' : tone === 'success' ? 'text-[var(--status-success)]' : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 sm:p-5 min-w-0">
      <div className="text-sm text-[var(--text-secondary)] truncate">{label}</div>
      <div className={`mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums truncate ${valueColor}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div>}
    </div>
  );
};

/** Abas em pílula (controle segmentado). Rola na horizontal no celular. */
export const TabPills: React.FC<{
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}> = ({ tabs, value, onChange }) => (
  <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-elevated)] overflow-x-auto scrollbar-none max-w-full">
    {tabs.map(tab => {
      const active = tab.id === value;
      return (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`h-9 px-3.5 shrink-0 inline-flex items-center gap-2 rounded-lg text-sm whitespace-nowrap transition-colors cursor-pointer ${
            active
              ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-medium shadow-xs'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`text-xs tabular-nums ${active ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`}>{tab.count}</span>
          )}
        </button>
      );
    })}
  </div>
);

/** Seção que abre e fecha (começa fechada para tirar ruído da tela). */
export const Disclosure: React.FC<{
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, open, onToggle, right, children }) => (
  <Card padded={false}>
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4 text-left cursor-pointer"
      aria-expanded={open}
    >
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-[var(--text-primary)]">{title}</span>
        {subtitle && <span className="block text-sm text-[var(--text-muted)] mt-0.5 truncate">{subtitle}</span>}
      </span>
      <span className="flex items-center gap-3 shrink-0">
        {right}
        <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </span>
    </button>
    {open && <div className="px-5 sm:px-6 pb-5 sm:pb-6 border-t border-[var(--border-subtle)] pt-5">{children}</div>}
  </Card>
);

/** Rótulo de campo padronizado. */
export const FieldLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-center justify-between mb-1.5">
    <label className="text-sm font-medium text-[var(--text-secondary)]">{children}</label>
    {right}
  </div>
);

/** Botão "Mais" com menu de ações secundárias. */
export const MoreMenu: React.FC<{
  items: { label: string; icon?: React.ReactNode; onClick: () => void; badge?: number | string; hint?: string }[];
  label?: string;
  /** Mostra um ponto dourado quando há algo pendente dentro do menu. */
  attention?: boolean;
}> = ({ items, label = 'Mais', attention = false }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} icon={<MoreHorizontal className="w-4 h-4" />} className="relative">
        {label}
        {attention && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--brand-gold-fill)] ring-2 ring-[var(--surface-card)]" />}
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-72 p-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xl z-40 animate-[modalIn_0.16s_ease-out]">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              <span className="text-[var(--text-muted)] shrink-0">{item.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block">{item.label}</span>
                {item.hint && <span className="block text-xs text-[var(--text-muted)] mt-0.5">{item.hint}</span>}
              </span>
              {item.badge !== undefined && (
                <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--surface-elevated)] text-xs flex items-center justify-center tabular-nums">{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
