import React, { useEffect } from 'react';
import { X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../Common/ui';

/** Peças compartilhadas pelas janelas de notas fiscais (mesmo visual dos demais modais). */

export const CAMPO =
  'w-full h-11 px-3.5 text-sm rounded-xl border border-[var(--border-highlight)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--brand-gold-fill)] disabled:opacity-60';

export const Campo: React.FC<{ label: string; hint?: React.ReactNode; erro?: string; className?: string; children: React.ReactNode }> = ({
  label,
  hint,
  erro,
  className = '',
  children
}) => (
  <div className={`min-w-0 ${className}`}>
    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
    {children}
    {erro ? (
      <p className="mt-1.5 text-xs text-[var(--status-danger)]">{erro}</p>
    ) : hint ? (
      <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">{hint}</p>
    ) : null}
  </div>
);

export const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
  bloqueado?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, onClose, footer, size = 'lg', bloqueado = false, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bloqueado) onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, bloqueado]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'} max-h-[94dvh] sm:max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="flex items-start justify-between gap-4 px-5 sm:px-7 py-5 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-start gap-3.5 min-w-0">
            {icon && <span className="icon-tile-gold w-10 h-10 rounded-xl shrink-0 [&>svg]:w-5 [&>svg]:h-5">{icon}</span>}
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] leading-6">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={bloqueado}
            aria-label="Fechar"
            className="w-10 h-10 -mr-2 -mt-1 shrink-0 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6">{children}</div>
        {footer && (
          <div className="shrink-0 px-5 sm:px-7 py-4 border-t border-[var(--border-subtle)] flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/** Modal de resultado (sucesso ou problema) para ações importantes. */
export const ResultadoModal: React.FC<{
  tipo: 'sucesso' | 'erro' | 'aviso';
  titulo: string;
  onClose: () => void;
  acao?: { label: string; onClick: () => void; carregando?: boolean };
  children: React.ReactNode;
}> = ({ tipo, titulo, onClose, acao, children }) => {
  const cor = tipo === 'sucesso' ? 'success' : tipo === 'erro' ? 'danger' : 'warning';
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-label={titulo}>
      <div className="w-full max-w-md p-7 sm:p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `var(--status-${cor}-bg)` }}>
          {tipo === 'sucesso' ? (
            <CheckCircle2 className="w-8 h-8" style={{ color: 'var(--status-success)' }} />
          ) : (
            <AlertTriangle className="w-7 h-7" style={{ color: `var(--status-${cor})` }} />
          )}
        </div>
        <h3 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">{titulo}</h3>
        <div className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed break-words">{children}</div>
        <div className="mt-6 flex flex-col gap-2.5">
          {acao && (
            <Button variant="primary" className="h-12 w-full" onClick={acao.onClick} disabled={acao.carregando} icon={acao.carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {acao.label}
            </Button>
          )}
          <Button variant={acao ? 'ghost' : 'primary'} className="h-12 w-full" onClick={onClose}>
            {acao ? 'Fechar' : 'Entendi'}
          </Button>
        </div>
      </div>
    </div>
  );
};

/** Caixa de mensagem dentro de formulários. */
export const Aviso: React.FC<{ tipo?: 'erro' | 'aviso' | 'info'; children: React.ReactNode; className?: string }> = ({ tipo = 'aviso', children, className = '' }) => {
  const cor = tipo === 'erro' ? 'danger' : tipo === 'info' ? 'info' : 'warning';
  return (
    <div
      className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm leading-relaxed ${className}`}
      style={{ backgroundColor: `var(--status-${cor}-bg)`, color: `var(--status-${cor})` }}
      role={tipo === 'erro' ? 'alert' : 'status'}
    >
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
};
