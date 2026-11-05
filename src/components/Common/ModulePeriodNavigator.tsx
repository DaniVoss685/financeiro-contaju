import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useModulePeriod, ModulePeriodType } from '../../hooks/useModulePeriod';
import { formatPeriodLabelBR } from '../../utils/dateUtils';
import { GlobalPeriodSelectorModal } from './GlobalPeriodSelectorModal';

interface ModulePeriodNavigatorProps {
  moduleType: ModulePeriodType;
  titlePrefix?: string; // ex: "Vencimentos em" ou "Período:"
  filterSubtitle?: string; // ex: "Filtro por Data de Vencimento"
  className?: string;
  matchedCount?: number;
  totalCount?: number;
}

const stepBtn =
  'w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer';

export const ModulePeriodNavigator: React.FC<ModulePeriodNavigatorProps> = ({
  moduleType,
  titlePrefix = 'Vencimentos em',
  filterSubtitle = 'Filtro por data de vencimento',
  className = '',
  matchedCount,
  totalCount
}) => {
  const { period, updatePeriod, goToPreviousMonth, goToNextMonth, goToCurrentMonth, showAllPeriods } = useModulePeriod(moduleType);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const now = new Date();
  const isCurrentMonthActive = period.active && !period.fromDate && period.year === now.getFullYear() && period.month === now.getMonth() + 1;
  const rangeText = formatPeriodLabelBR(period);

  return (
    <>
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-3 px-1 ${className}`}>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="min-w-0 flex items-center gap-3 text-left cursor-pointer group"
          title="Escolher outro período"
        >
          <CalendarDays className="w-[18px] h-[18px] text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0 transition-colors" strokeWidth={1.75} />
          <span className="min-w-0">
            <span className="block text-sm text-[var(--text-secondary)] truncate">
              {titlePrefix} <span className="font-medium text-[var(--text-primary)] tabular-nums">{rangeText}</span>
            </span>
            {matchedCount !== undefined && totalCount !== undefined && (
              <span className="block text-xs text-[var(--text-muted)]">
                {filterSubtitle} • {matchedCount} de {totalCount} registros
              </span>
            )}
          </span>
        </button>

      </div>

      {isModalOpen && (
        <GlobalPeriodSelectorModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          customPeriod={period}
          onSaveCustomPeriod={updatePeriod}
          titleOverride={`Filtrar: ${filterSubtitle}`}
          subtitleOverride="A escolha deste período vale só para esta aba e não altera as outras áreas."
        />
      )}
    </>
  );
};
