import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGlobalPeriod } from '../../hooks/useGlobalPeriod';
import { GlobalPeriodFilter } from '../../types';
import { formatPeriodRangeBR } from '../../utils/dateUtils';

interface GlobalPeriodSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  customPeriod?: GlobalPeriodFilter;
  onSaveCustomPeriod?: (period: GlobalPeriodFilter) => void;
  titleOverride?: string;
  subtitleOverride?: string;
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const chip =
  'h-11 rounded-xl text-sm transition-colors cursor-pointer border';

export const GlobalPeriodSelectorModal: React.FC<GlobalPeriodSelectorModalProps> = ({
  isOpen,
  onClose,
  customPeriod,
  onSaveCustomPeriod,
  titleOverride,
  subtitleOverride
}) => {
  const globalPeriodHook = useGlobalPeriod();
  const effectivePeriod = customPeriod || globalPeriodHook.period;

  const [selectedMonth, setSelectedMonth] = useState<number>(effectivePeriod.month);
  const [selectedYear, setSelectedYear] = useState<number>(effectivePeriod.year);
  const [isActive, setIsActive] = useState<boolean>(effectivePeriod.active);

  useEffect(() => {
    if (isOpen) {
      setSelectedMonth(effectivePeriod.month);
      setSelectedYear(effectivePeriod.year);
      setIsActive(effectivePeriod.active);
    }
  }, [isOpen, effectivePeriod]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const persist = (updated: GlobalPeriodFilter) => {
    if (onSaveCustomPeriod) {
      onSaveCustomPeriod(updated);
    } else {
      globalPeriodHook.updatePeriod(updated);
    }
    onClose();
  };

  const handleApply = () => persist({ active: true, year: selectedYear, month: selectedMonth });
  const handleDeactivate = () => persist({ ...effectivePeriod, active: false });

  const now = new Date();
  const shortcut = (label: string, month: number, year: number) => (
    <button
      type="button"
      onClick={() => {
        setSelectedMonth(month);
        setSelectedYear(year);
        setIsActive(true);
      }}
      className="h-9 px-3.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition-colors cursor-pointer whitespace-nowrap"
    >
      {label}
    </button>
  );

  const prev = now.getMonth() === 0 ? { m: 12, y: now.getFullYear() - 1 } : { m: now.getMonth(), y: now.getFullYear() };
  const next = now.getMonth() === 11 ? { m: 1, y: now.getFullYear() + 1 } : { m: now.getMonth() + 2, y: now.getFullYear() };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{titleOverride || 'Escolher período'}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {subtitleOverride || 'Escolha o mês e o ano que o sistema deve mostrar.'}
            </p>
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

        {/* Conteúdo */}
        <div className="px-6 py-6 space-y-6 overflow-y-auto">
          {/* Ano */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedYear(y => y - 1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              aria-label="Ano anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xl font-semibold tabular-nums tracking-tight">{selectedYear}</span>
            <button
              type="button"
              onClick={() => setSelectedYear(y => y + 1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              aria-label="Próximo ano"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Meses */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {MONTHS.map((label, idx) => {
              const selected = selectedMonth === idx + 1;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setSelectedMonth(idx + 1);
                    setIsActive(true);
                  }}
                  className={`${chip} ${
                    selected
                      ? 'bg-[var(--brand-gold-fill)] border-transparent text-[#18181b] font-semibold'
                      : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label.slice(0, 3)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(0);
                setIsActive(true);
              }}
              className={`${chip} col-span-3 sm:col-span-4 ${
                selectedMonth === 0
                  ? 'border-[var(--brand-gold-fill)] ring-1 ring-[var(--brand-gold-fill)] text-[var(--text-primary)] font-medium'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              Ano inteiro
            </button>
          </div>

          {/* Atalhos */}
          <div>
            <p className="text-sm text-[var(--text-muted)] mb-2">Atalhos</p>
            <div className="flex flex-wrap gap-2">
              {shortcut('Mês atual', now.getMonth() + 1, now.getFullYear())}
              {shortcut('Mês anterior', prev.m, prev.y)}
              {shortcut('Próximo mês', next.m, next.y)}
            </div>
          </div>

          {/* Prévia */}
          <div className="rounded-xl bg-[var(--surface-base)] border border-[var(--border-subtle)] px-4 py-3.5">
            <p className="text-sm text-[var(--text-muted)]">{isActive ? 'Vai mostrar de' : 'Filtro desligado'}</p>
            <p className="mt-0.5 text-[15px] font-medium tabular-nums text-[var(--text-primary)]">
              {isActive ? formatPeriodRangeBR(selectedMonth, selectedYear) : 'Todos os lançamentos, sem filtro de data'}
            </p>
          </div>
        </div>

        {/* Rodapé */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          {effectivePeriod.active ? (
            <button
              type="button"
              onClick={handleDeactivate}
              className="h-10 px-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-left"
            >
              Ver tudo (tirar o filtro)
            </button>
          ) : (
            <span className="text-sm text-[var(--text-muted)]">Hoje mostrando tudo</span>
          )}

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-sm border border-[var(--border-highlight)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="h-10 px-5 rounded-xl text-sm font-semibold bg-[var(--brand-gold-fill)] text-[#18181b] hover:brightness-105 transition cursor-pointer"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
