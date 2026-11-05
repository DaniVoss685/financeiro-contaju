import React, { useState, useMemo } from 'react';
import { 
  Users, 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Download, 
  FileSpreadsheet, 
  Calendar, 
  DollarSign, 
  Info,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { CohortEngine } from '../../services/cohortEngine';
import { formatBRL } from '../../services/financialEngine';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { PremiumSelect } from '../Common/PremiumSelect';

interface CohortRetentionViewProps {
  onNavigateScreen?: (screen: string) => void;
}

export const CohortRetentionView: React.FC<CohortRetentionViewProps> = ({
  onNavigateScreen
}) => {
  const [metricMode, setMetricMode] = useState<'CLIENTS' | 'NRR_REVENUE'>('CLIENTS');
  const [maxCohorts, setMaxCohorts] = useState<number>(12);

  const cohortData = useMemo(() => {
    return CohortEngine.generateCohortAnalysis(maxCohorts);
  }, [maxCohorts]);

  const getHeatmapColor = (rate: number) => {
    if (rate >= 95) return 'bg-emerald-500/30 text-emerald-300 font-bold';
    if (rate >= 85) return 'bg-emerald-500/20 text-emerald-400 font-semibold';
    if (rate >= 75) return 'bg-teal-500/20 text-teal-300 font-medium';
    if (rate >= 60) return 'bg-amber-500/20 text-amber-300 font-medium';
    if (rate >= 40) return 'bg-orange-500/20 text-orange-300 font-medium';
    return 'bg-rose-500/20 text-rose-300 font-semibold';
  };

  const handleExportExcel = () => {
    const headers = [
      'Safra de Entrada',
      'Clientes Iniciais (M0)',
      'MRR Inicial (R$)',
      ...Array.from({ length: 12 }, (_, i) => `Mês ${i}`)
    ];

    const data = cohortData.cohorts.map(c => {
      const row = [
        c.cohortLabel,
        c.initialCount,
        formatBRL(c.initialMrr)
      ];
      for (let i = 0; i < 12; i++) {
        const cell = c.cells.find(cl => cl.monthIndex === i);
        if (cell) {
          row.push(metricMode === 'CLIENTS' ? `${cell.retentionRate}%` : `${cell.mrrRetentionRate}%`);
        } else {
          row.push('-');
        }
      }
      return row;
    });

    exportToExcel(`retencao_coortes_${metricMode.toLowerCase()}`, 'Coortes_Retencao', headers, data);
  };

  const handleExportCSV = () => {
    const headers = [
      'Safra',
      'Clientes Iniciais',
      'MRR Inicial',
      ...Array.from({ length: 12 }, (_, i) => `M${i}`)
    ];

    const data = cohortData.cohorts.map(c => {
      const row = [
        c.cohortLabel,
        c.initialCount,
        c.initialMrr
      ];
      for (let i = 0; i < 12; i++) {
        const cell = c.cells.find(cl => cl.monthIndex === i);
        row.push(cell ? (metricMode === 'CLIENTS' ? cell.retentionRate : cell.mrrRetentionRate) : '');
      }
      return row;
    });

    exportToCSV(`retencao_coortes_${metricMode.toLowerCase()}`, headers, data);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-[var(--surface-card)] p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold text-[var(--text-primary)]">
                  Análise de Coortes & Retenção de Contratos (Cohort Analysis)
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Ciclo de Vida
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Acompanhe a sobrevivência e retenção de contratos por safra mensal de ativação ao longo de 12 meses.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-amber-500/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-colors flex items-center cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
              Exportar Excel
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-amber-500/50 text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-colors flex items-center cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              CSV
            </button>
          </div>
        </div>

        {/* 4 Cards de Resumo de Retenção */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2 border-t border-[var(--border-subtle)]">
          <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-1">
            <div className="flex justify-between items-center text-xs text-emerald-400 font-semibold">
              <span>Retenção Média (M3)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-300">
              {cohortData.averageRetentionM3}%
            </div>
            <div className="text-[11px] text-emerald-400">
              Após os primeiros 90 dias de contrato
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-teal-500/30 bg-teal-500/10 space-y-1">
            <div className="flex justify-between items-center text-xs text-teal-400 font-semibold">
              <span>Retenção Média (M6)</span>
              <TrendingUp className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-teal-300">
              {cohortData.averageRetentionM6}%
            </div>
            <div className="text-[11px] text-teal-400">
              Após 1 semestre de relacionamento
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1">
            <div className="flex justify-between items-center text-xs text-amber-400 font-semibold">
              <span>Retenção Anual (M12)</span>
              <Calendar className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-300">
              {cohortData.averageRetentionM12}%
            </div>
            <div className="text-[11px] text-amber-400">
              Completando ciclo integral de 1 ano
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
            <div className="flex justify-between items-center text-xs text-[var(--text-secondary)] font-semibold">
              <span>Safras Analisadas</span>
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-[var(--text-primary)]">
              {cohortData.totalCohorts} safras
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              Histórico contratual registrado
            </div>
          </div>
        </div>
      </div>

      {/* Controles de Visualização: Retenção de Clientes vs Retenção de Receita (NRR) */}
      <div className="bg-[var(--surface-card)] p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="inline-flex p-0.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] shadow-2xs">
            <button
              type="button"
              onClick={() => setMetricMode('CLIENTS')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center cursor-pointer ${
                metricMode === 'CLIENTS'
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Retenção de Clientes (%)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('NRR_REVENUE')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center cursor-pointer ${
                metricMode === 'NRR_REVENUE'
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 mr-1.5" />
              Retenção de Receita Recorrente (NRR %)
            </button>
          </div>

          <div className="flex items-center space-x-2 text-xs text-[var(--text-secondary)]">
            <span>Safras visíveis:</span>
            <PremiumSelect
              value={maxCohorts}
              onChange={(e) => setMaxCohorts(Number(e.target.value))}
              className="px-2.5 py-1 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium text-[var(--text-primary)] focus:outline-hidden cursor-pointer"
            >
              <option value={6}>Últimas 6 Safras</option>
              <option value={12}>Últimas 12 Safras</option>
              <option value={24}>Últimas 24 Safras</option>
            </PremiumSelect>
          </div>
        </div>

        {/* Tabela de Coortes com Heatmap */}
        <div className="overflow-x-auto max-w-full rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase text-[11px] font-bold tracking-wider">
                <th className="py-3 px-4 sticky left-0 z-20 bg-[var(--surface-elevated)] shadow-sm min-w-[140px]">
                  Safra de Entrada
                </th>
                <th className="py-3 px-3 text-right border-l border-[var(--border-subtle)] min-w-[90px]">
                  Base Inicial
                </th>
                <th className="py-3 px-3 text-right border-l border-[var(--border-subtle)] min-w-[100px]">
                  MRR Inicial
                </th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th 
                    key={i} 
                    className="py-3 px-2.5 text-center font-mono border-l border-[var(--border-subtle)] min-w-[65px]"
                    title={`Mês ${i} após contratação inicial`}
                  >
                    M{i}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--border-subtle)]">
              {cohortData.cohorts.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-10 text-center text-xs text-[var(--text-secondary)]">
                    Nenhuma safra com contratos registrada para o período.
                  </td>
                </tr>
              ) : (
                cohortData.cohorts.map((cohort) => {
                  return (
                    <tr key={cohort.cohortKey} className="hover:bg-amber-500/5 transition-colors">
                      {/* Safra */}
                      <td className="py-2.5 px-4 sticky left-0 z-10 bg-[var(--surface-card)] font-bold text-xs text-[var(--text-primary)] border-r border-[var(--border-subtle)] whitespace-nowrap">
                        {cohort.cohortLabel}
                      </td>

                      {/* Base Inicial M0 */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-primary)] border-r border-[var(--border-subtle)] whitespace-nowrap">
                        {cohort.initialCount} clientes
                      </td>

                      {/* MRR Inicial M0 */}
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-amber-300 border-r border-[var(--border-subtle)] whitespace-nowrap">
                        {formatBRL(cohort.initialMrr)}
                      </td>

                      {/* Células M0 a M11 com Heatmap */}
                      {Array.from({ length: 12 }, (_, mIdx) => {
                        const cell = cohort.cells.find(c => c.monthIndex === mIdx);
                        if (!cell) {
                          return (
                            <td key={mIdx} className="py-2.5 px-2 text-center text-[var(--text-muted)] opacity-30 border-l border-[var(--border-subtle)]">
                              -
                            </td>
                          );
                        }

                        const rate = metricMode === 'CLIENTS' ? cell.retentionRate : cell.mrrRetentionRate;
                        const colorClass = getHeatmapColor(rate);

                        return (
                          <td 
                            key={mIdx}
                            className={`py-2.5 px-2 text-center font-mono text-xs border-l border-[var(--border-subtle)] transition-colors ${colorClass}`}
                            title={`Safra ${cohort.cohortLabel} no Mês ${mIdx}: ${cell.activeCount}/${cohort.initialCount} clientes retidos (${cell.retentionRate}%) | MRR retido: ${formatBRL(cell.retainedMrr)} (${cell.mrrRetentionRate}%)`}
                          >
                            <span className="tabular-nums">
                              {rate}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Legenda do Heatmap */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
          <div className="flex items-center space-x-2">
            <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Escala de retenção da carteira:</span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-1 font-mono text-[10px]">
            <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 font-bold border border-emerald-500/40">≥95% Excelente</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30">85-94% Alta</span>
            <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-medium border border-teal-500/30">75-84% Moderada</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">60-74% Alerta</span>
            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">&lt;60% Risco Crítico</span>
          </div>
        </div>

      </div>

    </div>
  );
};
