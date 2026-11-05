import React, { useState, useMemo } from 'react';
import { 
  X, 
  Scale, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Sparkles, 
  Play,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  Clock,
  Building2,
  Check
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { 
  FinancialEngine, 
  formatBRL, 
  formatDateBR,
  calculateBalanceFeeDueDate 
} from '../../services/financialEngine';
import { Contract, Counterparty, FinancialTitle } from '../../types';
import { PremiumSelect } from '../Common/PremiumSelect';

interface BalanceFeeBatchBillingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated?: (results: {
    totalTitlesGenerated: number;
    totalAmountGenerated: number;
    alreadyExistingCount: number;
  }) => void;
  onNavigateToReceivablesWithFilter?: () => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const BalanceFeeBatchBillingModal: React.FC<BalanceFeeBatchBillingModalProps> = ({
  isOpen,
  onClose,
  onGenerated,
  onNavigateToReceivablesWithFilter
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [filterMode, setFilterMode] = useState<'ALL_YEAR' | 'SPECIFIC_MONTH'>('ALL_YEAR');
  const [selectedMonth, setSelectedMonth] = useState<number>(12); // Padrão Dezembro
  
  // Seleção de contratos para faturamento
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);
  
  // Estados de execução e progresso
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    percent: number;
    stage: string;
    processed: number;
    total: number;
    generated: number;
    amount: number;
  } | null>(null);

  const [results, setResults] = useState<{
    totalContractsWithFee: number;
    totalTitlesGenerated: number;
    totalAmountGenerated: number;
    alreadyExistingCount: number;
    details: Array<{
      contractId: string;
      contractNumber: string;
      clientName: string;
      installmentIndex: number;
      totalInstallments: number;
      competence: string;
      dueDate: string;
      amount: number;
      status: 'GERADO' | 'JA_EXISTE';
    }>;
  } | null>(null);

  // Carregar dados atualizados do storage
  const contracts = useMemo(() => {
    return storage.getContracts().filter(c => c.status === 'ATIVO');
  }, [isOpen]);

  const counterparties = useMemo(() => {
    return storage.getCounterparties();
  }, [isOpen]);

  const existingTitles = useMemo(() => {
    return storage.getTitles();
  }, [isOpen, results]);

  // Contratos com taxa de balanço anual habilitada e valor > 0
  const contractsWithBalanceFee = useMemo(() => {
    return contracts.filter(c => 
      c.annualBalanceFee && 
      c.annualBalanceFee.enabled && 
      (c.annualBalanceFee.amount || 0) > 0
    );
  }, [contracts]);

  // Contratos filtrados pelo modo (ano todo ou mês específico)
  const filteredContracts = useMemo(() => {
    if (filterMode === 'ALL_YEAR') {
      return contractsWithBalanceFee;
    }
    return contractsWithBalanceFee.filter(c => {
      const months = c.annualBalanceFee?.billingMonths || [12];
      return months.includes(selectedMonth);
    });
  }, [contractsWithBalanceFee, filterMode, selectedMonth]);

  // Inicializar seleção com todos os contratos elegíveis
  React.useEffect(() => {
    if (isOpen) {
      setSelectedContractIds(filteredContracts.map(c => c.id));
      setResults(null);
      setProgress(null);
    }
  }, [isOpen, filteredContracts.length, filterMode, selectedMonth]);

  const handleToggleSelectContract = (id: string) => {
    setSelectedContractIds(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedContractIds.length === filteredContracts.length) {
      setSelectedContractIds([]);
    } else {
      setSelectedContractIds(filteredContracts.map(c => c.id));
    }
  };

  // Contagem de contratos por tipo de parcelamento
  const statsByInstallmentType = useMemo(() => {
    let single = 0;
    let two = 0;
    let three = 0;
    let custom = 0;
    let totalValue = 0;

    contractsWithBalanceFee.forEach(c => {
      const t = c.annualBalanceFee?.installmentType;
      const val = c.annualBalanceFee?.amount || 0;
      totalValue += val;
      if (t === 'UNICA_DEZEMBRO') single++;
      else if (t === 'DUAS_PARCELAS') two++;
      else if (t === 'TRES_PARCELAS') three++;
      else custom++;
    });

    return { single, two, three, custom, totalValue };
  }, [contractsWithBalanceFee]);

  // Executar faturamento em lote
  const handleExecuteBilling = async () => {
    if (selectedContractIds.length === 0) {
      alert('Selecione ao menos um contrato para faturar.');
      return;
    }

    setIsGenerating(true);
    setResults(null);

    const targetCompetence = filterMode === 'SPECIFIC_MONTH' 
      ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`
      : undefined;

    try {
      const res = await FinancialEngine.generateAnnualBalanceFeesBatchAsync(
        {
          targetYear: selectedYear,
          targetCompetence,
          contractIds: selectedContractIds
        },
        (p) => setProgress(p)
      );

      setResults(res);
      onGenerated?.({
        totalTitlesGenerated: res.totalTitlesGenerated,
        totalAmountGenerated: res.totalAmountGenerated,
        alreadyExistingCount: res.alreadyExistingCount
      });
    } catch (err: any) {
      console.error('Erro no faturamento em lote da taxa de balanço:', err);
      alert(`Falha no processamento: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsGenerating(false);
      setTimeout(() => setProgress(null), 800);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white dark:bg-[#1b1b20] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131316] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Faturamento em Lote - Taxa de Balanço Anual</span>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                  13º Honorário
                </span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Gera títulos a receber rigorosamente com base no parcelamento (1x, 2x, 3x) cadastrado em cada contrato.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            disabled={isGenerating}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
          
          {/* Card Resumo de Taxas Cadastradas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold uppercase">Total Contratos c/ Taxa</span>
              <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{contractsWithBalanceFee.length}</span>
              <span className="text-[10px] text-slate-500 block">de {contracts.length} ativos</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold uppercase">Valor Previsto Anual</span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatBRL(statsByInstallmentType.totalValue)}
              </span>
              <span className="text-[10px] text-slate-500 block">em taxas cadastradas</span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 col-span-2">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold uppercase">Distribuição de Parcelas</span>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold text-[10px]">
                  1x Parcela: <strong>{statsByInstallmentType.single}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold text-[10px]">
                  2x Parcelas: <strong>{statsByInstallmentType.two}</strong>
                </span>
                <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 font-semibold text-[10px]">
                  3x Parcelas: <strong>{statsByInstallmentType.three}</strong>
                </span>
                {statsByInstallmentType.custom > 0 && (
                  <span className="px-2 py-0.5 rounded bg-teal-500/15 text-teal-700 dark:text-teal-300 font-semibold text-[10px]">
                    Personalizado: <strong>{statsByInstallmentType.custom}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Seletores de Ano e Modo de Faturamento */}
          <div className="bg-purple-50/50 dark:bg-purple-950/20 p-4 rounded-xl border border-purple-200/70 dark:border-purple-800/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Ano de Referência do Exercício:</span>
                </label>
                <PremiumSelect
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  disabled={isGenerating}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none"
                >
                  <option value={currentYear - 1}>{currentYear - 1}</option>
                  <option value={currentYear}>{currentYear} (Exercício Atual)</option>
                  <option value={currentYear + 1}>{currentYear + 1} (Próximo Exercício)</option>
                </PremiumSelect>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Escopo do Faturamento:</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setFilterMode('ALL_YEAR'); setResults(null); }}
                    disabled={isGenerating}
                    className={`py-2 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                      filterMode === 'ALL_YEAR'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    Ano Completo (Todas)
                  </button>

                  <button
                    type="button"
                    onClick={() => { setFilterMode('SPECIFIC_MONTH'); setResults(null); }}
                    disabled={isGenerating}
                    className={`py-2 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer text-center ${
                      filterMode === 'SPECIFIC_MONTH'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    Por Mês Específico
                  </button>
                </div>
              </div>
            </div>

            {filterMode === 'SPECIFIC_MONTH' && (
              <div className="pt-2 border-t border-purple-200/50 dark:border-purple-800/40">
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Mês de Competência a faturar:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {MONTH_NAMES.map((name, i) => {
                    const mNum = i + 1;
                    const isSelected = selectedMonth === mNum;
                    const countInMonth = contractsWithBalanceFee.filter(c => (c.annualBalanceFee?.billingMonths || [12]).includes(mNum)).length;
                    return (
                      <button
                        key={mNum}
                        type="button"
                        onClick={() => setSelectedMonth(mNum)}
                        className={`p-2 rounded-lg text-[11px] text-center border font-medium cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-xs'
                            : countInMonth > 0
                            ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-purple-200 dark:border-purple-900 hover:bg-purple-100/50'
                            : 'bg-slate-100/70 dark:bg-slate-900/40 text-slate-400 border-transparent'
                        }`}
                      >
                        <div>{name.substring(0, 3)}</div>
                        <div className={`text-[9px] ${isSelected ? 'text-purple-100' : 'text-slate-400'}`}>
                          {countInMonth} ctr
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Lista de Contratos Elegíveis com Prévia das Parcelas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="select-all-fee-contracts"
                  checked={filteredContracts.length > 0 && selectedContractIds.length === filteredContracts.length}
                  onChange={handleToggleSelectAll}
                  disabled={isGenerating || filteredContracts.length === 0}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4"
                />
                <label htmlFor="select-all-fee-contracts" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
                  Selecionar Todos ({selectedContractIds.length}/{filteredContracts.length} contratos)
                </label>
              </div>

              <span className="text-[11px] text-slate-500">
                Total selecionado: <strong className="text-purple-600 dark:text-purple-400 font-mono">
                  {formatBRL(filteredContracts.filter(c => selectedContractIds.includes(c.id)).reduce((acc, c) => acc + (c.annualBalanceFee?.amount || 0), 0))}
                </strong>
              </span>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filteredContracts.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  Nenhum contrato ativo possui taxa de balanço configurada para este critério.
                </div>
              ) : (
                filteredContracts.map(contract => {
                  const fee = contract.annualBalanceFee!;
                  const customer = counterparties.find(cp => cp.id === contract.customerId);
                  const isChecked = selectedContractIds.includes(contract.id);
                  const months = fee.billingMonths || [12];
                  const totalInst = months.length;

                  // Verificar se já existe algum título gerado para este ano
                  const alreadyGeneratedCount = months.filter(m => {
                    const compStr = `${selectedYear}-${String(m).padStart(2, '0')}`;
                    const tbNum = `TB-${compStr}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;
                    return existingTitles.some(t => 
                      t.contractId === contract.id && 
                      (t.titleNumber === tbNum || t.titleNumber?.startsWith(`FAT-TB-${compStr}`) || (t.competence === compStr && t.notes?.includes('Taxa de Balanço'))) &&
                      t.documentState !== 'CANCELADO'
                    );
                  }).length;

                  return (
                    <div 
                      key={contract.id}
                      onClick={() => !isGenerating && handleToggleSelectContract(contract.id)}
                      className={`p-3 flex items-start sm:items-center justify-between gap-3 cursor-pointer select-none hover:bg-purple-50/30 dark:hover:bg-purple-950/20 transition-colors ${
                        isChecked ? 'bg-purple-50/20 dark:bg-purple-950/10' : 'opacity-65'
                      }`}
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          disabled={isGenerating}
                          className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer w-4 h-4 mt-0.5 sm:mt-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {customer?.tradeName || customer?.name || 'Cliente'}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                              {contract.contractNumber}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              totalInst === 1 
                                ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' 
                                : totalInst === 2
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                            }`}>
                              {totalInst}x {totalInst === 1 ? 'Parcela Única' : 'Parcelas'}
                            </span>
                          </div>

                          {/* Prévia das parcelas com competências e datas */}
                          <div className="flex items-center gap-1.5 flex-wrap mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                            <span>Cobrança em:</span>
                            {months.map((m, idx) => {
                              const compStr = `${selectedYear}-${String(m).padStart(2, '0')}`;
                              const dueDate = calculateBalanceFeeDueDate(
                                fee,
                                contract.dueDay || 10,
                                contract.dueRule || 'SAME_MONTH',
                                compStr
                              );
                              return (
                                <span 
                                  key={m} 
                                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700"
                                >
                                  {idx + 1}ª: <strong>{MONTH_NAMES[m - 1].substring(0, 3)}/{selectedYear}</strong> (Venc. {formatDateBR(dueDate)})
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-bold font-mono text-purple-600 dark:text-purple-400 text-xs sm:text-sm">
                          {formatBRL(fee.amount)}
                        </div>
                        <div className="text-[10px]">
                          {alreadyGeneratedCount === totalInst ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-end gap-0.5">
                              <Check className="w-3 h-3" /> Faturado
                            </span>
                          ) : alreadyGeneratedCount > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">
                              {alreadyGeneratedCount}/{totalInst} faturadas
                            </span>
                          ) : (
                            <span className="text-slate-400">Pendente</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Barra de Progresso durante a geração */}
          {isGenerating && progress && (
            <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 p-4 rounded-xl space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-purple-600" />
                  <span>{progress.stage}</span>
                </span>
                <span className="font-mono font-bold text-purple-700 dark:text-purple-300">
                  {progress.percent}%
                </span>
              </div>
              <div className="w-full bg-purple-200 dark:bg-purple-900/60 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-purple-700 dark:text-purple-300">
                <span>Processando {progress.processed} de {progress.total} contratos</span>
                <span>Gerados até agora: <strong>{progress.generated} títulos ({formatBRL(progress.amount)})</strong></span>
              </div>
            </div>
          )}

          {/* Resultados pós-execução */}
          {results && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Faturamento em Lote Concluído com Sucesso!</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Títulos Gerados</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {results.totalTitlesGenerated}
                  </span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Total Faturado</span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                    {formatBRL(results.totalAmountGenerated)}
                  </span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Já Existiam</span>
                  <span className="text-base font-bold text-slate-600 dark:text-slate-400 font-mono">
                    {results.alreadyExistingCount}
                  </span>
                </div>
              </div>

              {/* Botão para visualizar no Contas a Receber */}
              {onNavigateToReceivablesWithFilter && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToReceivablesWithFilter();
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 hover:text-purple-900 hover:underline cursor-pointer"
                  >
                    <span>Ver Títulos de Taxa de Balanço no Contas a Receber</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Nota Explicativa */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-slate-600 dark:text-slate-400 text-[11px]">
            <Info className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
            <p>
              <strong>Regra de Negócio:</strong> Se um contrato possuir parcelamento em 2x (ex.: Outubro e Dezembro) ou 3x (Outubro, Novembro e Dezembro), o valor total anual será rateado entre as parcelas, com eventuais centavos de arredondamento compensados na última parcela. Títulos já existentes não são duplicados.
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#131316] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {results ? 'Fechar' : 'Cancelar'}
          </button>

          <button
            type="button"
            onClick={handleExecuteBilling}
            disabled={isGenerating || selectedContractIds.length === 0}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-md shadow-purple-600/20 flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Processando...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>
                  Faturar {selectedContractIds.length} Contrato(s)
                </span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
