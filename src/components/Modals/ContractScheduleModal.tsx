import React, { useState, useMemo } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { 
  CalendarClock, 
  X, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Sparkles, 
  Play, 
  DollarSign,
  Calendar,
  Layers,
  FileText,
  Edit2,
  Check,
  RotateCcw,
  Trash2,
  Tag
} from 'lucide-react';
import { Contract, FinancialTitle, Sale } from '../../types';
import { storage } from '../../services/storageService';
import { 
  FinancialEngine, 
  formatBRL, 
  formatDateBR, 
  formatCompetence, 
  getTemporalStatus,
  ContractGenerationProgressState 
} from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';
import { MonthField } from '../Common/DateField';

interface ContractScheduleModalProps {
  contract: Contract | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export const ContractScheduleModal: React.FC<ContractScheduleModalProps> = ({
  contract,
  isOpen,
  onClose,
  onUpdate
}) => {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  const [monthsCount, setMonthsCount] = useState<number>(12);
  const [startMonthMode, setStartMonthMode] = useState<'CURRENT_MONTH' | 'NEXT_MONTH' | 'CONTRACT_START' | 'CUSTOM'>('CURRENT_MONTH');
  const [customStartMonth, setCustomStartMonth] = useState<string>(currentMonth);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ContractGenerationProgressState | null>(null);
  const [feedback, setFeedback] = useState<{
    count: number;
    amount: number;
    existing: number;
    updated?: number;
    error?: string;
    isSyncSuggestion?: boolean;
  } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Quick edit value state
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string>('');

  const counterparties = useMemo(() => {
    if (!isOpen || !contract) return [];
    return storage.getCounterparties();
  }, [isOpen, contract]);

  const allSales = useMemo(() => {
    if (!isOpen || !contract) return [];
    return storage.getSales();
  }, [isOpen, contract, refreshTrigger]);

  const client = useMemo(() => {
    if (!contract) return null;
    return counterparties.find(c => c.id === contract.customerId);
  }, [contract, counterparties]);

  // Compute selected starting competence
  const effectiveStartCompetence = useMemo(() => {
    if (!contract) return currentMonth;
    if (startMonthMode === 'CURRENT_MONTH') {
      return currentMonth;
    }
    if (startMonthMode === 'NEXT_MONTH') {
      const [year, month] = currentMonth.split('-').map(Number);
      const nextDate = new Date(year, month, 1);
      return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    }
    if (startMonthMode === 'CONTRACT_START') {
      return contract.startDate ? contract.startDate.substring(0, 7) : currentMonth;
    }
    return customStartMonth || currentMonth;
  }, [contract, startMonthMode, customStartMonth, currentMonth]);

  // Read and deduplicate contract titles
  const { contractTitles, duplicateCount } = useMemo(() => {
    if (!contract) return { contractTitles: [], duplicateCount: 0 };
    const titles = storage.getTitles();
    
    const map = new Map<string, FinancialTitle>();
    let dupCount = 0;

    const matchingTitles = titles
      .filter(t => 
        t.type === 'RECEBER' && 
        (t.originType === 'CONTRATO' || t.originType === 'VENDA') && 
        (t.originId === contract.id || t.contractId === contract.id || t.contractNumber === contract.contractNumber || t.originId === contract.contractNumber) && 
        t.documentState !== 'CANCELADO'
      );

    matchingTitles.forEach(t => {
      const isBalanceFee = t.titleNumber.startsWith('TB-') || t.description.includes('Taxa de Balanço');
      const compKey = `${t.competence || (t.dueDate ? t.dueDate.substring(0, 7) : 'SEM_COMP')}_${isBalanceFee ? 'TB' : 'REG'}`;
      
      if (!map.has(compKey)) {
        map.set(compKey, t);
      } else {
        dupCount++;
        const existing = map.get(compKey)!;
        // Prioritize settled or higher amount
        if (t.settlementState === 'LIQUIDADO' && existing.settlementState !== 'LIQUIDADO') {
          map.set(compKey, t);
        }
      }
    });

    const sorted = Array.from(map.values()).sort((a, b) => {
      const compA = a.competence || a.dueDate;
      const compB = b.competence || b.dueDate;
      return compA.localeCompare(compB);
    });

    return { contractTitles: sorted, duplicateCount: dupCount };
  }, [contract, refreshTrigger]);

  const stats = useMemo(() => {
    const totalCount = contractTitles.length;
    const settled = contractTitles.filter(t => t.settlementState === 'LIQUIDADO');
    const open = contractTitles.filter(t => t.settlementState !== 'LIQUIDADO');
    const totalScheduledAmount = contractTitles.reduce((acc, t) => acc + (t.originalAmount || 0), 0);
    const totalSettledAmount = settled.reduce((acc, t) => acc + (t.settledPrincipal || 0), 0);
    const totalOpenAmount = open.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);

    return {
      totalCount,
      settledCount: settled.length,
      openCount: open.length,
      totalScheduledAmount,
      totalSettledAmount,
      totalOpenAmount
    };
  }, [contractTitles]);

  if (!isOpen || !contract) return null;

  const handleGenerate = async (options?: { updateExistingOpen?: boolean }) => {
    setIsGenerating(true);
    setFeedback(null);
    setProgress({
      percent: 5,
      stage: 'Iniciando processamento das parcelas...',
      currentMonth: '',
      processed: 0,
      total: monthsCount
    });

    try {
      const freshContract = storage.getContracts().find(c => c.id === contract.id) || contract;
      const res = await FinancialEngine.generateContractFutureInstallmentsAsync(
        freshContract, 
        monthsCount, 
        effectiveStartCompetence,
        options,
        (p) => setProgress(p)
      );

      if (res.error) {
        setFeedback({
          count: 0,
          amount: 0,
          existing: res.alreadyExistingCount,
          updated: res.updatedCount,
          error: res.error
        });
      } else if (res.generatedCount === 0 && (res.updatedCount || 0) === 0 && res.alreadyExistingCount > 0) {
        setFeedback({
          count: 0,
          amount: 0,
          existing: res.alreadyExistingCount,
          updated: 0,
          isSyncSuggestion: true
        });
      } else {
        setFeedback({
          count: res.generatedCount,
          amount: res.totalAmountGenerated,
          existing: res.alreadyExistingCount,
          updated: res.updatedCount
        });
      }
      setRefreshTrigger(prev => prev + 1);
      if (onUpdate) onUpdate();
    } catch (err: any) {
      console.error('Erro ao gerar parcelas futuras:', err);
      setFeedback({
        count: 0,
        amount: 0,
        existing: 0,
        error: `Erro ao processar: ${err?.message || 'Falha inesperada'}`
      });
    } finally {
      setIsGenerating(false);
      setTimeout(() => setProgress(null), 1200);
    }
  };

  const handleCleanDuplicates = () => {
    if (!contract) return;
    const titles = storage.getTitles();
    const map = new Map<string, string>(); // key -> id to keep
    const idsToRemove = new Set<string>();

    titles
      .filter(t => 
        t.type === 'RECEBER' && 
        (t.originType === 'CONTRATO' || t.originType === 'VENDA') && 
        (t.originId === contract.id || t.contractId === contract.id || t.contractNumber === contract.contractNumber || t.originId === contract.contractNumber) && 
        t.documentState !== 'CANCELADO'
      )
      .forEach(t => {
        const isBalanceFee = t.titleNumber.startsWith('TB-') || t.description.includes('Taxa de Balanço');
        const compKey = `${t.competence || (t.dueDate ? t.dueDate.substring(0, 7) : 'SEM_COMP')}_${isBalanceFee ? 'TB' : 'REG'}`;
        
        if (!map.has(compKey)) {
          map.set(compKey, t.id);
        } else {
          // If the one we already kept is not settled and this one is settled, swap
          const currentId = map.get(compKey)!;
          const currentTitle = titles.find(item => item.id === currentId);
          if (t.settlementState === 'LIQUIDADO' && currentTitle?.settlementState !== 'LIQUIDADO') {
            idsToRemove.add(currentId);
            map.set(compKey, t.id);
          } else {
            idsToRemove.add(t.id);
          }
        }
      });

    if (idsToRemove.size > 0) {
      const cleaned = titles.filter(t => !idsToRemove.has(t.id));
      storage.saveTitles(cleaned);
      setRefreshTrigger(prev => prev + 1);
      setEditSuccessMsg(`✓ ${idsToRemove.size} faturas duplicadas foram limpas e unificadas com sucesso!`);
      setTimeout(() => setEditSuccessMsg(''), 4000);
      if (onUpdate) onUpdate();
    }
  };

  const handleStartEdit = (t: FinancialTitle) => {
    setEditingTitleId(t.id);
    setEditAmount(t.originalAmount);
  };

  const handleSaveEdit = (t: FinancialTitle) => {
    if (editAmount <= 0) {
      alert('Informe um valor superior a R$ 0,00.');
      return;
    }

    const all = storage.getTitles();
    const currentUser = storage.getCurrentUser();
    const previousAmount = t.originalAmount;

    const updated = all.map(item => {
      if (item.id === t.id) {
        const isSettled = item.settlementState === 'LIQUIDADO';
        const newBalance = isSettled 
          ? 0 
          : Math.max(0, editAmount - (item.settledPrincipal || 0));

        return {
          ...item,
          originalAmount: editAmount,
          balancePrincipal: newBalance,
          updatedAt: new Date().toISOString(),
          notes: `${item.notes || ''} [Valor alterado de ${formatBRL(previousAmount)} para ${formatBRL(editAmount)} por ${currentUser.name}]`
        };
      }
      return item;
    });

    storage.saveTitles(updated);

    // Update corresponding sale if exists
    const sales = storage.getSales();
    const linkedSale = sales.find(s => 
      s.id === t.saleId || 
      (s.titleIds && s.titleIds.includes(t.id)) ||
      (s.contractId === contract.id && s.competence === t.competence)
    );
    if (linkedSale) {
      const updatedSales = sales.map(s => {
        if (s.id === linkedSale.id) {
          return {
            ...s,
            grossTotal: editAmount,
            netTotal: editAmount,
            items: s.items?.map(it => ({ ...it, unitPrice: editAmount, total: editAmount })) || []
          };
        }
        return s;
      });
      storage.saveSales(updatedSales);
    }

    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EDICAO_PARCELA_CONTRATO',
      module: 'Contratos & Faturas',
      recordId: t.id,
      details: `Fatura ${t.titleNumber} (Comp. ${t.competence}) do Contrato ${contract.contractNumber} teve o valor alterado de ${formatBRL(previousAmount)} para ${formatBRL(editAmount)}.`
    });

    setEditingTitleId(null);
    setRefreshTrigger(prev => prev + 1);
    setEditSuccessMsg(`✓ Valor da competência ${formatCompetence(t.competence)} atualizado com sucesso!`);
    setTimeout(() => setEditSuccessMsg(''), 4000);
    if (onUpdate) onUpdate();
  };

  const handleCancelEdit = () => {
    setEditingTitleId(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[94vh] border border-[var(--border-subtle)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  <span className="adv-only">Cronograma & Faturas do Contrato</span>
                  <span className="simple-only">Parcelas do contrato</span>
                </h2>
                <span className="adv-only font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {contract.contractNumber}
                </span>
                {duplicateCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                    {duplicateCount} duplicidade(s) detectada(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Cliente: <strong className="text-[var(--text-primary)]">{client?.name || 'Cliente'}</strong> • Mensalidade: <strong className="text-[var(--text-primary)] font-mono">{formatBRL(contract.monthlyTotal)}</strong><span className="adv-only"> • Venc. Todo dia {contract.dueDay} ({contract.dueRule === 'NEXT_MONTH' ? 'mês seguinte' : 'mesmo mês'})</span>
              </p>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={onClose} 
            className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          
          {/* Resumo simples */}
          <div className="simple-only flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--text-secondary)]">
            <span><strong className="text-[var(--text-primary)]">{stats.openCount}</strong> a receber ({formatBRL(stats.totalOpenAmount)})</span>
            <span><strong className="text-[var(--text-primary)]">{stats.settledCount}</strong> recebidas ({formatBRL(stats.totalSettledAmount)})</span>
          </div>

          {/* Quick Metrics */}
          <div className="adv-only grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Meses Programados
              </span>
              <div className="text-lg font-bold text-[var(--text-primary)] mt-1 font-mono">
                {stats.totalCount} parcelas
              </div>
              <span className="text-[10px] text-[var(--text-secondary)]">Vendas e Títulos no Contas a Receber</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Em Aberto / A Vencer
              </span>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 font-mono">
                {stats.openCount} ({formatBRL(stats.totalOpenAmount)})
              </div>
              <span className="text-[10px] text-[var(--text-secondary)]">Fluxo de caixa projetado</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Liquidados / Pagos
              </span>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                {stats.settledCount} ({formatBRL(stats.totalSettledAmount)})
              </div>
              <span className="text-[10px] text-[var(--text-secondary)]">Recebimentos confirmados</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Volume Total Projetado
              </span>
              <div className="text-lg font-bold text-amber-500 mt-1 font-mono">
                {formatBRL(stats.totalScheduledAmount)}
              </div>
              <span className="text-[10px] text-[var(--text-secondary)]">Soma das parcelas geradas</span>
            </div>
          </div>

          {/* Duplicates Alert Bar if detected */}
          {duplicateCount > 0 && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-semibold text-xs">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>
                  Foram encontradas <strong>{duplicateCount} faturas com a mesma competência</strong> geradas em execuções anteriores.
                </span>
              </div>
              <button
                type="button"
                onClick={handleCleanDuplicates}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Unificar e Limpar Duplicidades</span>
              </button>
            </div>
          )}

          {/* Success toast inside modal */}
          {editSuccessMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center text-xs text-emerald-800 dark:text-emerald-300 font-semibold animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-500 shrink-0" />
              <span>{editSuccessMsg}</span>
            </div>
          )}

          {/* Generator Control Bar with Month Selection */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5 uppercase tracking-wide">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Gerar próximos meses
                </h3>
                <p className="adv-only text-[11px] text-[var(--text-secondary)] mt-0.5">
                  Projeta vendas e parcelas vinculadas no Contas a Receber com proteção contra duplicidade.
                </p>
              </div>

              {/* Month Selection & Generation */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-[var(--surface-card)] p-1 rounded-xl border border-[var(--border-subtle)]">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] pl-2">A partir de:</span>
                  <PremiumSelect
                    value={startMonthMode}
                    onChange={e => setStartMonthMode(e.target.value as any)}
                    className="bg-transparent border-0 py-1 px-2 text-xs font-bold text-[var(--text-primary)] focus:ring-0 cursor-pointer"
                  >
                    <option value="CURRENT_MONTH">Mês Atual ({formatCompetence(currentMonth)})</option>
                    <option value="NEXT_MONTH">Próximo Mês</option>
                    <option value="CONTRACT_START">Início do Contrato ({formatCompetence(contract.startDate?.substring(0, 7) || currentMonth)})</option>
                    <option value="CUSTOM">Mês Personalizado...</option>
                  </PremiumSelect>
                </div>

                {startMonthMode === 'CUSTOM' && (
                  <MonthField
                    value={customStartMonth}
                    onChange={e => setCustomStartMonth(e.target.value)}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                )}

                <PremiumSelect
                  value={monthsCount}
                  onChange={e => setMonthsCount(Number(e.target.value))}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-2 text-xs font-bold text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value={6}>6 meses</option>
                  <option value={12}>12 meses (1 ano)</option>
                  <option value={24}>24 meses (2 anos)</option>
                  <option value={36}>36 meses (3 anos)</option>
                </PremiumSelect>

                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  title="Gerar títulos para as competências selecionadas"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isGenerating ? 'Gerando...' : 'Gerar Meses'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerate({ updateExistingOpen: true })}
                  disabled={isGenerating}
                  className="px-3.5 py-2 bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  title="Atualizar valores e datas de todas as parcelas em aberto com base no contrato atual"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  <span>Sincronizar em Aberto</span>
                </button>
              </div>
            </div>

            {/* Live Progress Bar durante a geração assíncrona */}
            {progress && (
              <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/5 border border-amber-500/30 rounded-xl space-y-2 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs font-bold">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Sparkles className="w-4 h-4 animate-spin text-amber-500" />
                    <span>{progress.stage}</span>
                  </div>
                  <span className="font-mono text-amber-700 dark:text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded-md text-[11px]">
                    {progress.percent}%
                  </span>
                </div>

                <div className="w-full bg-[var(--surface-elevated)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)] p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 rounded-full transition-all duration-300 ease-out shadow-xs"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)]">
                  <span>Processando em segundo plano sem travar a tela</span>
                  <span>{progress.processed} de {progress.total} meses processados</span>
                </div>
              </div>
            )}

            {feedback && (
              <div className="space-y-2">
                {feedback.error ? (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between text-xs text-rose-800 dark:text-rose-300 font-semibold animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{feedback.error}</span>
                    </div>
                    <button
                      onClick={() => setFeedback(null)}
                      className="text-rose-700 dark:text-rose-400 hover:underline text-[11px] cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                ) : feedback.isSyncSuggestion ? (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
                    <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold">Todas as {feedback.existing} competências deste período já possuem faturas geradas.</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          Para atualizar os valores das parcelas em aberto para o valor atual ({formatBRL(contract.monthlyTotal)}), clique em sincronizar.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleGenerate({ updateExistingOpen: true })}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Sincronizar Agora</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedback(null)}
                        className="px-2.5 py-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs cursor-pointer"
                      >
                        Dispensar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>
                        Execução concluída: <strong>{feedback.count} novas faturas geradas</strong>
                        {(feedback.updated || 0) > 0 && ` e ${feedback.updated} parcelas em aberto atualizadas`} ({formatBRL(feedback.amount)}).
                        {feedback.existing > 0 && ` (${feedback.existing} competências preservadas).`}
                      </span>
                    </div>
                    <button
                      onClick={() => setFeedback(null)}
                      className="text-emerald-700 dark:text-emerald-400 hover:underline text-[11px] cursor-pointer"
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Schedule Table */}
          <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--surface-card)]">
            <div className="p-3 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between">
              <span className="font-bold text-[var(--text-primary)] text-xs uppercase tracking-wide">
                Parcelas ({contractTitles.length})
              </span>
              <span className="adv-only text-[11px] text-[var(--text-secondary)]">
                Clique no valor ou no ícone para editar o valor de um mês específico
              </span>
            </div>

            {contractTitles.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <Calendar className="w-10 h-10 text-[var(--text-secondary)] mx-auto opacity-40" />
                <p className="text-xs text-[var(--text-secondary)]">
                  Nenhum título a receber foi gerado para este contrato ainda.
                </p>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Gerar Faturas Agora</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[380px]">
                <table className="w-full text-left text-xs sm:min-w-[560px]">
                  <thead className="bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold text-[11px] sticky top-0 z-10 backdrop-blur-xs">
                    <tr>
                      <th className="py-2.5 px-3 w-[110px]">Competência</th>
                      <th className="py-2.5 px-3 w-[150px] adv-only">Nº Fatura / Venda</th>
                      <th className="py-2.5 px-3 adv-only">Descrição do Serviço</th>
                      <th className="py-2.5 px-3 text-center w-[110px]">Vencimento</th>
                      <th className="py-2.5 px-3 text-right w-[160px]">Valor da Parcela</th>
                      <th className="py-2.5 px-3 text-center w-[120px]">Situação</th>
                      <th className="py-2.5 px-3 text-center w-[80px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {contractTitles.map(t => {
                      const isSettled = t.settlementState === 'LIQUIDADO';
                      const isOverdue = !isSettled && t.dueDate < today;
                      const isBalanceFee = t.titleNumber.startsWith('TB-') || t.description.includes('Taxa de Balanço');
                      const isEditingThis = editingTitleId === t.id;

                      // Check linked sale
                      const saleNumber = t.saleNumber || allSales.find(s => s.id === t.saleId || (s.titleIds && s.titleIds.includes(t.id)))?.saleNumber;

                      return (
                        <tr key={t.id} className="hover:bg-[var(--surface-elevated)]/40 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-[var(--text-primary)]">
                            <span className="px-2 py-0.5 rounded-md bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                              {formatCompetence(t.competence)}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-secondary)] adv-only">
                            <div className="flex flex-col">
                              <span className="font-semibold text-[var(--text-primary)]">{t.titleNumber}</span>
                              {saleNumber && (
                                <span className="text-[10px] text-amber-500 font-medium flex items-center gap-0.5">
                                  <Tag className="w-2.5 h-2.5" />
                                  {saleNumber}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-[var(--text-primary)] adv-only">
                            <div className="flex items-center gap-1.5">
                              {isBalanceFee ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shrink-0">
                                  13º Honorário
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                                  Mensalidade
                                </span>
                              )}
                              <span className="truncate max-w-sm" title={t.description}>
                                {t.description}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-[var(--text-primary)] whitespace-nowrap">
                            {formatDateBR(t.dueDate)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">
                            {isEditingThis ? (
                              <div className="flex items-center justify-end gap-1">
                                <MoneyField value={Number(editAmount) || 0} onChange={(v: number) => setEditAmount(v)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveEdit(t);
                                    if (e.key === 'Escape') handleCancelEdit();
                                  }} className="w-24 px-2 py-1 text-xs font-bold text-right rounded-lg border border-amber-500 bg-[var(--surface-card)] text-[var(--text-primary)] focus:ring-1 focus:ring-amber-500 focus:outline-none" />
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(t)}
                                  className="p-1 rounded bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer"
                                  title="Salvar valor alterado"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className="p-1 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-[var(--text-secondary)] cursor-pointer"
                                  title="Cancelar edição"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div 
                                onClick={() => handleStartEdit(t)}
                                className="group/edit inline-flex items-center justify-end gap-1.5 cursor-pointer p-1 rounded hover:bg-amber-500/10 transition-colors"
                                title="Clique para editar rapidamente o valor deste mês"
                              >
                                <span className="font-bold text-[var(--text-primary)]">
                                  {formatBRL(t.originalAmount)}
                                </span>
                                <Edit2 className="w-3 h-3 text-[var(--text-secondary)] opacity-0 group-hover/edit:opacity-100 transition-opacity" />
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            {isSettled ? (
                              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                                ✓ QUITADO
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30">
                                ⚠ VENCIDO
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                🕒 A VENCER
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {!isEditingThis && (
                              <button
                                type="button"
                                onClick={() => handleStartEdit(t)}
                                className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                                title="Editar valor da parcela"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between shrink-0">
          <span className="adv-only text-[11px] text-[var(--text-secondary)]">
            As alterações de valor e novas parcelas sincronizam automaticamente com a <strong>Aba Vendas</strong>, <strong>Contas a Receber</strong> e <strong>Fluxo de Caixa</strong>.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)] transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
