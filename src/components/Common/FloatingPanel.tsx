import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface FloatingPanelProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Largura mínima do painel em px (o painel nunca fica menor que o campo). */
  minWidth?: number;
  /** Largura fixa em px (ignora a largura do campo). */
  width?: number;
  maxHeight?: number;
  /** No celular o painel vira uma gaveta na parte de baixo da tela. */
  sheetTitle?: string;
  children: React.ReactNode;
}

const MOBILE_QUERY = '(max-width: 639px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const handler = () => setMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

/**
 * Painel flutuante ancorado em um campo. Usa portal (não é cortado por modais com
 * rolagem), reposiciona ao rolar/redimensionar e abre para cima quando falta espaço.
 */
export const FloatingPanel: React.FC<FloatingPanelProps> = ({
  anchorRef,
  open,
  onClose,
  minWidth = 220,
  width,
  maxHeight = 340,
  sheetTitle = 'Selecione',
  children
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  const reposition = () => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 6;
    const panelWidth = width ?? Math.max(rect.width, minWidth);
    const content = panel.firstElementChild as HTMLElement | null;
    const panelHeight = Math.min(content?.scrollHeight ?? panel.scrollHeight, maxHeight);
    const spaceBelow = vh - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const openUp = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, vw - panelWidth - 12));
    setStyle({
      position: 'fixed',
      left,
      width: panelWidth,
      maxHeight: Math.max(160, Math.min(maxHeight, openUp ? spaceAbove : spaceBelow)),
      ...(openUp ? { bottom: vh - rect.top + gap } : { top: rect.bottom + gap }),
      visibility: 'visible'
    });
  };

  useLayoutEffect(() => {
    if (!open || isMobile) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile, width, minWidth, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-[1000] flex items-end" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" onClick={onClose} />
        <div
          ref={panelRef}
          className="relative w-full max-h-[78vh] flex flex-col rounded-t-3xl border-t border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-2xl pb-[env(safe-area-inset-bottom)] animate-[sheetIn_0.22s_cubic-bezier(0.2,0.8,0.2,1)_both]"
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
            <span className="text-[15px] font-semibold">{sheetTitle}</span>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-3 pb-4">{children}</div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className="z-[1000] flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-xl animate-[modalIn_0.14s_ease-out_both]"
    >
      <div className="overflow-y-auto">{children}</div>
    </div>,
    document.body
  );
};
