import React, { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useGlobalPeriod } from '../../hooks/useGlobalPeriod';
import { formatPeriodRangeBR } from '../../utils/dateUtils';
import { GlobalPeriodSelectorModal } from './GlobalPeriodSelectorModal';

interface GlobalPeriodBannerProps {
  moduleName?: string;
  matchedCount?: number;
  totalCount?: number;
}

export const GlobalPeriodBanner: React.FC<GlobalPeriodBannerProps> = ({
  moduleName = 'este módulo',
  matchedCount,
  totalCount
}) => {
  const { period, toggleActive } = useGlobalPeriod();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!period.active) return null;

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3 min-w-0">
          <CalendarDays className="w-[18px] h-[18px] text-[var(--text-muted)] shrink-0" strokeWidth={1.75} />
          <div className="min-w-0">
            <p className="text-sm text-[var(--text-secondary)]">
              Filtro central ativo:{' '}
              <span className="font-medium text-[var(--text-primary)] tabular-nums">{formatPeriodRangeBR(period.month, period.year)}</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Vale para todo o sistema.{' '}
              {matchedCount !== undefined && totalCount !== undefined
                ? `Mostrando ${matchedCount} de ${totalCount} registros em ${moduleName}.`
                : 'Restringe a visualização aos lançamentos deste período.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="h-9 px-3.5 rounded-xl text-sm border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            title="Alterar o mês ou o ano do filtro central"
          >
            Alterar período
          </button>
          <button
            onClick={() => toggleActive(false)}
            className="h-9 px-3.5 rounded-xl text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            title="Desativar o filtro central"
          >
            Desativar
          </button>
        </div>
      </div>

      <GlobalPeriodSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
