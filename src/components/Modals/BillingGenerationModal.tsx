import React, { useState } from 'react';
import { 
  X, 
  CalendarClock, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Sparkles, 
  RotateCcw, 
  Play,
  Layers
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { 
  FinancialEngine, 
  formatBRL, 
  formatCompetence,
  BatchBillingProgressState 
} from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';
import { MonthField } from '../Common/DateField';

interface BillingGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (results?: {
    generatedCount: number;
    alreadyExistingCount: number;
    ignoredCount: number;
    totalAmountGenerated: number;
  }) => void;
}

export const BillingGenerationModal: React.FC<BillingGenerationModalProps> = ({
  isOpen,
  onClose,
  onGenerated
}) => {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  // Modo de faturamento: Mês único ou Múltiplos meses futuros
  const [billingMode, setBillingMode] = useState<'SINGLE_MONTH' | 'FUTURE_MONTHS'>('SINGLE_MONTH');
  const [competence, setCompetence] = useState(currentMonth);
  const [monthsCount, setMonthsCount] = useState<number>(3);
  const [updateExistingOpen, setUpdateExistingOpen] = useState(false);

  // Estados de execução e progresso em segundo plano
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<BatchBillingProgressState | null>(null);
  const [results, setResults] = useState<{
    totalProcessedContracts: number;
    generatedCount: number;
    updatedCount: number;
    alreadyExistingCount: number;
    totalAmountGenerated: number;
  } | null>(null);

  const contracts = storage.getContracts().filter(c => c.status === 'ATIVO' && c.contractType !== 'AVULSO' && c.isRecurring !== false);
  const counterparties = storage.getCounterparties();

  const handleExecuteGeneration = async () => {
    setIsGenerating(true);
    setResults(null);

    const effectiveMonths = billingMode === 'SINGLE_MONTH' ? 1 : monthsCount;

    try {
      const res = await FinancialEngine.generateMultipleContractsFutureInstallmentsAsync(
        contracts,
        effectiveMonths,
        competence,
        { updateExistingOpen },
        (p) => setProgress(p)
      );

      const summaryResults = {
        totalProcessedContracts: res.totalProcessedContracts,
        generatedCount: res.totalGeneratedCount,
        updatedCount: res.totalUpdatedCount,
        alreadyExistingCount: res.totalAlreadyExistingCount,
        totalAmountGenerated: res.totalAmountGenerated
      };

      setResults(summaryResults);
      onGenerated({
        generatedCount: res.totalGeneratedCount,
        alreadyExistingCount: res.totalAlreadyExistingCount,
        ignoredCount: 0,
        totalAmountGenerated: res.totalAmountGenerated
      });
    } catch (err: any) {
      console.error('Erro no faturamento em lote:', err);
      alert(`Falha no faturamento em lote: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsGenerating(false);
      setTimeout(() => setProgress(null), 1200);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Faturamento em Lote de Contratos
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Projeção inteligente com barra de progresso em segundo plano
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            disabled={isGenerating}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-xs">
          
          {/* Seletor de Modo: Mês Único vs Meses Futuros */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => { setBillingMode('SINGLE_MONTH'); setResults(null); }}
              disabled={isGenerating}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                billingMode === 'SINGLE_MONTH'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <CalendarClock className="w-3.5 h-3.5" />
              <span>Competência Única</span>
            </button>
            <button
              type="button"
              onClick={() => { setBillingMode('FUTURE_MONTHS'); setResults(null); }}
              disabled={isGenerating}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                billingMode === 'FUTURE_MONTHS'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Projetar Próximos Meses</span>
            </button>
          </div>

          {/* Parâmetros de Execução */}
          <div className="bg-[var(--surface-elevated)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-[var(--text-primary)] mb-1">
                  Competência Inicial *
                </label>
                <MonthField
                  value={competence}
                  disabled={isGenerating}
                  onChange={(e) => {
                    setCompetence(e.target.value);
                    setResults(null);
                  }}
                  className="w-full rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--surface-card)] focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-50"
                />
              </div>

              {billingMode === 'FUTURE_MONTHS' && (
                <div>
                  <label className="block font-semibold text-[var(--text-primary)] mb-1">
                    Quantidade de Meses *
                  </label>
                  <PremiumSelect
                    value={monthsCount}
                    disabled={isGenerating}
                    onChange={(e) => {
                      setMonthsCount(Number(e.target.value));
                      setResults(null);
                    }}
                    className="w-full rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--surface-card)] focus:ring-2 focus:ring-amber-500 focus:outline-none disabled:opacity-50 cursor-pointer"
                  >
                    <option value={3}>3 meses futuros</option>
                    <option value={6}>6 meses futuros</option>
                    <option value={12}>12 meses futuros (1 ano)</option>
                    <option value={24}>24 meses futuros (2 anos)</option>
                  </PremiumSelect>
                </div>
              )}
            </div>

            {/* Checkbox de Sincronização */}
            <label className="flex items-start gap-2 pt-1 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={updateExistingOpen}
                disabled={isGenerating}
                onChange={(e) => setUpdateExistingOpen(e.target.checked)}
                className="mt-0.5 rounded border-[var(--border-subtle)] text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <span>
                <strong>Sincronizar parcelas em aberto:</strong> se uma fatura já existir em aberto, atualizar o valor e vencimento conforme a mensalidade atual do contrato.
              </span>
            </label>
          </div>

          {/* Active contracts preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-[var(--text-primary)]">
                Contratos Ativos na Carteira ({contracts.length})
              </span>
              <span className="text-[var(--text-secondary)] font-mono font-medium">
                MRR Ativo: <strong className="text-[var(--text-primary)]">{formatBRL(FinancialEngine.calculateMRR())}</strong>
              </span>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 border border-[var(--border-subtle)] rounded-xl p-2 bg-[var(--surface-elevated)]/40">
              {contracts.length === 0 ? (
                <div className="p-4 text-center text-[var(--text-secondary)] italic">
                  Nenhum contrato ativo cadastrado para faturamento em lote.
                </div>
              ) : (
                contracts.map(c => {
                  const client = counterparties.find(cp => cp.id === c.customerId);
                  return (
                    <div key={c.id} className="flex justify-between items-center p-2 bg-[var(--surface-card)] rounded-lg border border-[var(--border-subtle)] text-xs">
                      <div className="truncate pr-2">
                        <div className="font-semibold text-[var(--text-primary)] truncate">{client?.name || 'Cliente'}</div>
                        <div className="text-[10px] text-[var(--text-secondary)]">{c.contractNumber} • Venc. dia {c.dueDay}</div>
                      </div>
                      <span className="font-bold font-mono text-[var(--text-primary)] shrink-0">{formatBRL(c.monthlyTotal)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Live Progress Bar durante a execução */}
          {progress && (
            <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/5 border border-amber-500/30 rounded-xl space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs font-bold">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Sparkles className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                  <span className="truncate">{progress.stage}</span>
                </div>
                <span className="font-mono text-amber-700 dark:text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded-md text-[11px] shrink-0">
                  {progress.percent}%
                </span>
              </div>

              <div className="w-full bg-[var(--surface-elevated)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)] p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 rounded-full transition-all duration-300 ease-out shadow-xs"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] font-mono">
                <span>Contratos: {progress.processedContracts} / {progress.totalContracts}</span>
                <span>Gerados: {progress.totalGenerated} • Total: {formatBRL(progress.totalAmountGenerated)}</span>
              </div>
            </div>
          )}

          {/* Results summary if executed */}
          {results && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 animate-in fade-in">
              <div className="flex items-center text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
                <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Faturamento em lote concluído com sucesso!</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="bg-[var(--surface-card)] p-2.5 rounded-lg border border-emerald-500/20">
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">{results.generatedCount}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-medium">Títulos Gerados</div>
                </div>
                <div className="bg-[var(--surface-card)] p-2.5 rounded-lg border border-amber-500/20">
                  <div className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono">{results.updatedCount}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-medium">Sincronizados</div>
                </div>
                <div className="bg-[var(--surface-card)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                  <div className="text-base font-bold text-[var(--text-secondary)] font-mono">{results.alreadyExistingCount}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-medium">Preservados</div>
                </div>
              </div>
              <div className="text-right text-xs font-semibold text-emerald-800 dark:text-emerald-300 pt-1">
                Volume Total Projetado: <span className="font-mono font-bold">{formatBRL(results.totalAmountGenerated)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            >
              {results ? 'Concluir' : 'Cancelar'}
            </button>
            <button
              type="button"
              onClick={handleExecuteGeneration}
              disabled={isGenerating || contracts.length === 0}
              className="px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CalendarClock className="w-4 h-4" />
              <span>{isGenerating ? 'Processando em Lote...' : 'Executar Faturamento em Lote'}</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
