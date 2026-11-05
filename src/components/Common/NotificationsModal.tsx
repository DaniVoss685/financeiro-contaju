import React, { useEffect, useMemo, useState } from 'react';
import { X, BellRing, ArrowUpRight, ArrowDownLeft, FileText, CheckCheck, ChevronRight } from 'lucide-react';
import { collectNotifications, NotificationGroupId, NotificationItem } from '../../services/notificationSummary';
import { formatBRL } from '../../services/financialEngine';
import { useIsSimpleMode } from '../../hooks/useViewMode';
import { storage } from '../../services/storageService';
import { Badge } from './ui';
import type { NavigationScreen } from '../Sidebar';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (screen: NavigationScreen) => void;
}

const ICONS: Record<NotificationGroupId, React.ReactNode> = {
  DESPESAS: <ArrowUpRight className="w-4 h-4" />,
  RECEBIMENTOS: <ArrowDownLeft className="w-4 h-4" />,
  CONTRATOS: <FileText className="w-4 h-4" />,
  CONCILIACAO: <CheckCheck className="w-4 h-4" />
};

const TONE_TEXT: Record<NotificationItem['tone'], string> = {
  danger: 'text-[var(--status-danger)]',
  gold: 'text-[var(--brand-gold)]',
  info: 'text-[var(--status-info)]'
};

export const NotificationsModal: React.FC<NotificationsModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const simple = useIsSimpleMode();
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<'ALL' | NotificationGroupId>('ALL');

  useEffect(() => storage.subscribe(() => setTick(t => t + 1)), []);
  useEffect(() => {
    if (isOpen) setTab('ALL');
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const groups = useMemo(
    () => collectNotifications().filter(g => !(simple && g.id === 'CONCILIACAO')),
    [isOpen, tick, simple]
  );
  if (!isOpen) return null;

  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const visible = groups.filter(g => tab === 'ALL' || g.id === tab).filter(g => g.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="icon-tile-gold w-10 h-10 rounded-xl [&>svg]:w-5 [&>svg]:h-5"><BellRing /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Notificações</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {total === 0 ? 'Tudo em dia.' : `${total} ${total === 1 ? 'coisa pede' : 'coisas pedem'} a sua atenção.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] overflow-x-auto scrollbar-none">
            {[{ id: 'ALL' as const, label: 'Tudo', count: total }, ...groups.map(g => ({ id: g.id, label: g.label, count: g.items.length }))].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`h-9 px-3.5 shrink-0 inline-flex items-center gap-2 rounded-lg text-sm whitespace-nowrap transition-colors cursor-pointer ${
                  tab === t.id ? 'btn-gold font-semibold' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.label}
                <span className={`text-xs tabular-nums ${tab === t.id ? 'font-semibold' : 'text-[var(--text-muted)]'}`}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {visible.length === 0 && (
            <div className="py-10 text-center space-y-2">
              <span className="icon-tile-gold w-12 h-12 rounded-2xl mx-auto [&>svg]:w-6 [&>svg]:h-6"><CheckCheck /></span>
              <p className="text-[15px] font-semibold text-[var(--text-primary)]">Nada pendente</p>
              <p className="text-sm text-[var(--text-muted)]">Nenhuma conta atrasada nem vencendo hoje.</p>
            </div>
          )}

          {visible.map(g => (
            <section key={g.id}>
              <div className="flex items-center gap-2.5 mb-2.5">
                <span className="w-8 h-8 rounded-lg bg-[var(--brand-gold-soft)] text-[var(--brand-gold)] flex items-center justify-center">{ICONS[g.id]}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{g.label} <span className="text-[var(--text-muted)] font-normal">({g.items.length})</span></h3>
                  <p className="text-xs text-[var(--text-muted)]">{g.description}</p>
                </div>
              </div>
              <ul className="rounded-xl border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] overflow-hidden">
                {g.items.slice(0, 8).map(item => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate(item.screen);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</span>
                        <span className={`block text-xs mt-0.5 ${TONE_TEXT[item.tone]}`}>{item.detail}</span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {item.amount !== undefined && <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatBRL(item.amount)}</span>}
                        <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {g.items.length > 8 && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(g.items[0].screen);
                    onClose();
                  }}
                  className="mt-2 text-sm text-[var(--brand-gold)] hover:underline cursor-pointer"
                >
                  <Badge tone="gold">+{g.items.length - 8}</Badge> Ver todas
                </button>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};
