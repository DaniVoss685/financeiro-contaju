import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGlobalPeriod } from '../../hooks/useGlobalPeriod';
import { GlobalPeriodFilter } from '../../types';
import { formatPeriodLabelBR } from '../../utils/dateUtils';
import { TabPills } from './ui';
import { DateField } from './DateField';

interface GlobalPeriodSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  customPeriod?: GlobalPeriodFilter;
  onSaveCustomPeriod?: (period: GlobalPeriodFilter) => void;
  titleOverride?: string;
  subtitleOverride?: string;
}

type Mode = 'MONTH' | 'YEAR' | 'DAY' | 'RANGE';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const chip = 'h-11 rounded-xl text-sm transition-colors cursor-pointer border';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

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
  const todayStr = ymd(new Date());

  const [mode, setMode] = useState<Mode>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState<number>(effectivePeriod.month || new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(effectivePeriod.year);
  const [day, setDay] = useState<string>(todayStr);
  const [from, setFrom] = useState<string>(todayStr);
  const [to, setTo] = useState<string>(todayStr);

  useEffect(() => {
    if (!isOpen) return;
    const p = effectivePeriod;
    setSelectedYear(p.year);
    setSelectedMonth(p.month || new Date().getMonth() + 1);
    if (p.fromDate && p.toDate) {
      if (p.fromDate === p.toDate) {
        setMode('DAY');
        setDay(p.fromDate);
      } else {
        setMode('RANGE');
        setFrom(p.fromDate);
        setTo(p.toDate);
      }
    } else {
      setMode(p.month === 0 ? 'YEAR' : 'MONTH');
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

  const draft = (): GlobalPeriodFilter => {
    if (mode === 'YEAR') return { active: true, year: selectedYear, month: 0 };
    if (mode === 'DAY') {
      const [y, m] = day.split('-').map(Number);
      return { active: true, year: y, month: m, fromDate: day, toDate: day };
    }
    if (mode === 'RANGE') {
      const a = from <= to ? from : to;
      const b = from <= to ? to : from;
      const [y, m] = a.split('-').map(Number);
      return { active: true, year: y, month: m, fromDate: a, toDate: b };
    }
    return { active: true, year: selectedYear, month: selectedMonth };
  };

  const handleApply = () => persist(draft());
  const handleDeactivate = () => persist({ ...effectivePeriod, fromDate: undefined, toDate: undefined, active: false });

  const now = new Date();
  const setRange = (a: Date, b: Date) => {
    setMode('RANGE');
    setFrom(ymd(a));
    setTo(ymd(b));
  };
  const rangeChip = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="h-9 px-3.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] transition-colors cursor-pointer whitespace-nowrap"
    >
      {label}
    </button>
  );

  const stepper = (value: number, onPrev: () => void, onNext: () => void) => (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        aria-label="Ano anterior"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xl font-semibold tabular-nums tracking-tight">{value}</span>
      <button
        type="button"
        onClick={onNext}
        className="w-10 h-10 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
        aria-label="Próximo ano"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );

  const fieldCls = 'w-full h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3.5 text-sm font-medium';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">{titleOverride || 'Escolher período'}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {subtitleOverride || 'Veja por mês, por ano, por um dia ou por um período que você escolher.'}
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
          <TabPills
            tabs={[
              { id: 'MONTH', label: 'Mês' },
              { id: 'YEAR', label: 'Ano' },
              { id: 'DAY', label: 'Dia' },
              { id: 'RANGE', label: 'Período' }
            ]}
            value={mode}
            onChange={id => setMode(id as Mode)}
          />

          {mode === 'MONTH' && (
            <div className="space-y-5">
              {stepper(selectedYear, () => setSelectedYear(y => y - 1), () => setSelectedYear(y => y + 1))}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {MONTHS.map((label, idx) => {
                  const selected = selectedMonth === idx + 1;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSelectedMonth(idx + 1)}
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
              </div>
              <div className="flex flex-wrap gap-2">
                {rangeChip('Mês atual', () => { setSelectedMonth(now.getMonth() + 1); setSelectedYear(now.getFullYear()); })}
                {rangeChip('Mês anterior', () => {
                  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                  setSelectedMonth(d.getMonth() + 1);
                  setSelectedYear(d.getFullYear());
                })}
                {rangeChip('Próximo mês', () => {
                  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                  setSelectedMonth(d.getMonth() + 1);
                  setSelectedYear(d.getFullYear());
                })}
              </div>
            </div>
          )}

          {mode === 'YEAR' && (
            <div className="space-y-5">
              {stepper(selectedYear, () => setSelectedYear(y => y - 1), () => setSelectedYear(y => y + 1))}
              <p className="text-sm text-[var(--text-muted)] text-center">Mostra o ano inteiro, de janeiro a dezembro.</p>
            </div>
          )}

          {mode === 'DAY' && (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-[var(--text-secondary)]">Qual dia?</label>
              <DateField value={day} onChange={e => setDay(e.target.value)} className={fieldCls} />
              <div className="flex flex-wrap gap-2">
                {rangeChip('Hoje', () => setDay(todayStr))}
                {rangeChip('Ontem', () => setDay(ymd(addDays(now, -1))))}
                {rangeChip('Amanhã', () => setDay(ymd(addDays(now, 1))))}
              </div>
            </div>
          )}

          {mode === 'RANGE' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">De</label>
                  <DateField value={from} onChange={e => setFrom(e.target.value)} className={fieldCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">Até</label>
                  <DateField value={to} onChange={e => setTo(e.target.value)} className={fieldCls} />
                </div>
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)] mb-2">Atalhos</p>
                <div className="flex flex-wrap gap-2">
                  {rangeChip('Próximos 7 dias', () => setRange(now, addDays(now, 6)))}
                  {rangeChip('Próximos 15 dias', () => setRange(now, addDays(now, 14)))}
                  {rangeChip('Próximos 30 dias', () => setRange(now, addDays(now, 29)))}
                  {rangeChip('Últimos 7 dias', () => setRange(addDays(now, -6), now))}
                  {rangeChip('Últimos 15 dias', () => setRange(addDays(now, -14), now))}
                  {rangeChip('Últimos 30 dias', () => setRange(addDays(now, -29), now))}
                </div>
              </div>
            </div>
          )}

          {/* Prévia */}
          <div className="rounded-xl bg-[var(--surface-base)] border border-[var(--border-subtle)] px-4 py-3.5">
            <p className="text-sm text-[var(--text-muted)]">Vai mostrar</p>
            <p className="mt-0.5 text-[15px] font-medium text-[var(--text-primary)]">{formatPeriodLabelBR(draft())}</p>
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
