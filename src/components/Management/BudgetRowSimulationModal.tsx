import React, { useState, useMemo } from 'react';
import { 
  X, 
  Percent, 
  TrendingUp, 
  TrendingDown, 
  Sparkles, 
  Copy, 
  RotateCcw, 
  Check, 
  SlidersHorizontal,
  ArrowRight,
  Calendar,
  DollarSign,
  Info
} from 'lucide-react';
import { ChartAccount } from '../../types';
import { formatBRL } from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';

interface BudgetRowSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: ChartAccount | null;
  currentMonthly: number[];
  originalMonthly: number[];
  onApply: (newMonthly: number[], changeType: 'PERCENT' | 'MANUAL' | 'MONTH_BY_MONTH' | 'REPLICATE' | 'RESET', pct?: number) => void;
  year: number;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const BudgetRowSimulationModal: React.FC<BudgetRowSimulationModalProps> = ({
  isOpen,
  onClose,
  account,
  currentMonthly,
  originalMonthly,
  onApply,
  year
}) => {
  // Modo de simulação:
  // 1. PERCENT: Aumento ou diminuição percentual (+ / - %)
  // 2. DELTA_VALUE: Aumento ou diminuição em valor fixo em R$ (+ / - R$)
  // 3. SET_VALUE: Definir um novo valor fixo em R$
  // 4. PROGRESSIVE: Variação progressiva composta mês a mês (+ / - %)
  // 5. REPLICATE: Replicar o valor de um mês de referência
  const [simType, setSimType] = useState<'PERCENT' | 'DELTA_VALUE' | 'SET_VALUE' | 'PROGRESSIVE' | 'REPLICATE'>('PERCENT');

  // Valores dos parâmetros
  const [percentValue, setPercentValue] = useState<number>(10);
  const [deltaValue, setDeltaValue] = useState<number>(1000);
  const [setValue, setSetAmount] = useState<number>(10000);
  const [progressiveRate, setProgressiveRate] = useState<number>(3);
  const [sourceMonth, setSourceMonth] = useState<number>(0);

  // Escopo de Período:
  // 'FROM_MONTH': A partir de um mês específico até o final do ano
  // 'CUSTOM_RANGE': De um mês inicial até um mês final
  // 'ALL_YEAR': Em todos os 12 meses do ano
  const [periodScope, setPeriodScope] = useState<'FROM_MONTH' | 'CUSTOM_RANGE' | 'ALL_YEAR'>('FROM_MONTH');
  const [startMonth, setStartMonth] = useState<number>(4); // Padrão: Maio (mês 4 no índice 0-11)
  const [endMonth, setEndMonth] = useState<number>(11); // Padrão: Dezembro

  // Cálculo da projeção simulada
  const simulatedMonthly = useMemo<number[]>(() => {
    if (!currentMonthly || currentMonthly.length !== 12) return new Array(12).fill(0);
    const result = [...currentMonthly];

    // Determina os limites de aplicação dos meses
    let minM = 0;
    let maxM = 11;

    if (periodScope === 'FROM_MONTH') {
      minM = Math.max(0, Math.min(11, startMonth));
      maxM = 11;
    } else if (periodScope === 'CUSTOM_RANGE') {
      minM = Math.max(0, Math.min(11, Math.min(startMonth, endMonth)));
      maxM = Math.max(0, Math.min(11, Math.max(startMonth, endMonth)));
    } else {
      minM = 0;
      maxM = 11;
    }

    if (simType === 'PERCENT') {
      const factor = 1 + (percentValue / 100);
      for (let m = minM; m <= maxM; m++) {
        result[m] = Math.round((currentMonthly[m] || 0) * factor);
      }
    } else if (simType === 'DELTA_VALUE') {
      for (let m = minM; m <= maxM; m++) {
        result[m] = Math.max(0, Math.round((currentMonthly[m] || 0) + deltaValue));
      }
    } else if (simType === 'SET_VALUE') {
      for (let m = minM; m <= maxM; m++) {
        result[m] = Math.max(0, Math.round(setValue));
      }
    } else if (simType === 'PROGRESSIVE') {
      const factor = 1 + (progressiveRate / 100);
      let running = currentMonthly[minM] || 0;
      for (let m = minM; m <= maxM; m++) {
        if (m === minM) {
          result[m] = running;
        } else {
          running = Math.round(running * factor);
          result[m] = Math.max(0, running);
        }
      }
    } else if (simType === 'REPLICATE') {
      const sourceVal = currentMonthly[sourceMonth] || 0;
      for (let m = minM; m <= maxM; m++) {
        result[m] = sourceVal;
      }
    }

    return result;
  }, [currentMonthly, simType, percentValue, deltaValue, setValue, progressiveRate, sourceMonth, periodScope, startMonth, endMonth]);

  // Métricas de Impacto
  const originalTotal = useMemo(() => originalMonthly.reduce((a, b) => a + b, 0), [originalMonthly]);
  const currentTotal = useMemo(() => currentMonthly.reduce((a, b) => a + b, 0), [currentMonthly]);
  const simulatedTotal = useMemo(() => simulatedMonthly.reduce((a, b) => a + b, 0), [simulatedMonthly]);
  
  // Variação na própria conta
  const totalDiff = simulatedTotal - currentTotal;
  const totalDiffPct = currentTotal !== 0 ? (totalDiff / currentTotal) * 100 : 0;

  // Impacto no Resultado Líquido da Empresa:
  // Se for RECEITA (natureza CREDITO): aumento (+diff) melhora o lucro (+lucro).
  // Se for CUSTO/DESPESA (natureza DEBITO): aumento (+diff) reduz o lucro (-lucro).
  const isRevenue = account?.nature === 'CREDITO';
  const netIncomeImpact = isRevenue ? totalDiff : -totalDiff;
  const cashImpact = netIncomeImpact; // No fluxo orçamentário o impacto caixa segue o mesmo sentido

  // Contagem de meses impactados
  const impactedMonthsCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < 12; i++) {
      if (Math.abs((simulatedMonthly[i] || 0) - (currentMonthly[i] || 0)) > 0.01) {
        count++;
      }
    }
    return count;
  }, [simulatedMonthly, currentMonthly]);

  if (!isOpen || !account) return null;

  const handleApplyClick = () => {
    let changeType: 'PERCENT' | 'MANUAL' | 'MONTH_BY_MONTH' | 'REPLICATE' | 'RESET' = 'MANUAL';
    let pct: number | undefined = undefined;

    if (simType === 'PERCENT') {
      changeType = 'PERCENT';
      pct = percentValue;
    } else if (simType === 'PROGRESSIVE') {
      changeType = 'MONTH_BY_MONTH';
      pct = progressiveRate;
    } else if (simType === 'REPLICATE') {
      changeType = 'REPLICATE';
    }

    onApply(simulatedMonthly, changeType, pct);
    onClose();
  };

  const handleResetToOriginal = () => {
    onApply([...originalMonthly], 'RESET', 0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#131316] w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-[var(--brand-gold)]">{account.code}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-medium">
                  {isRevenue ? 'Conta de Receita' : 'Conta de Custo / Despesa'}
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] hidden sm:inline">
                  Exercício: <strong className="text-[var(--text-primary)]">{year}</strong>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] mt-0.5">
                Ajustar Linha: {account.name}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-xl transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          
          {/* Seletor de Tipo de Ajuste */}
          <div>
            <label className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider block mb-2">
              1. Como deseja ajustar esta linha?
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSimType('PERCENT')}
                className={`py-2 px-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  simType === 'PERCENT'
                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-md'
                    : 'bg-[var(--surface-card)]/80 text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-amber-500/40 hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5" />
                  <span>Porcentagem</span>
                </div>
                <span className="text-[10px] opacity-80">(Aumentar / Reduzir %)</span>
              </button>

              <button
                type="button"
                onClick={() => setSimType('DELTA_VALUE')}
                className={`py-2 px-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  simType === 'DELTA_VALUE'
                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-md'
                    : 'bg-[var(--surface-card)]/80 text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-amber-500/40 hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Acréscimo em R$</span>
                </div>
                <span className="text-[10px] opacity-80">(+ ou - R$ no mês)</span>
              </button>

              <button
                type="button"
                onClick={() => setSimType('SET_VALUE')}
                className={`py-2 px-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  simType === 'SET_VALUE'
                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-md'
                    : 'bg-[var(--surface-card)]/80 text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-amber-500/40 hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Novo Valor Fixo</span>
                </div>
                <span className="text-[10px] opacity-80">(Definir R$ fixo)</span>
              </button>

              <button
                type="button"
                onClick={() => setSimType('PROGRESSIVE')}
                className={`py-2 px-3 rounded-xl border transition-all text-center flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  simType === 'PROGRESSIVE'
                    ? 'bg-amber-500 text-slate-950 font-bold border-amber-500 shadow-md'
                    : 'bg-[var(--surface-card)]/80 text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-amber-500/40 hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Mês a Mês</span>
                </div>
                <span className="text-[10px] opacity-80">(Variação progressiva)</span>
              </button>
            </div>
          </div>

          {/* Parâmetros do Tipo Escolhido */}
          <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)]">
            {simType === 'PERCENT' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    Defina o percentual de variação (+ para aumentar, - para diminuir):
                  </span>
                  <div className="flex items-center space-x-1.5">
                    {[-20, -10, -5, 5, 10, 15, 20].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setPercentValue(pct)}
                        className={`px-2 py-1 text-xs rounded-lg font-bold border transition-colors cursor-pointer ${
                          percentValue === pct
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {pct > 0 ? `+${pct}%` : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={percentValue}
                      onChange={e => setPercentValue(Number(e.target.value))}
                      className="w-36 px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-center font-bold text-base text-[var(--brand-gold)] focus:border-amber-400 focus:outline-hidden"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-[var(--text-secondary)] font-bold">%</span>
                  </div>
                  <span className="text-xs text-[var(--text-primary)]">
                    {percentValue >= 0 
                      ? `Aumentará os meses selecionados em +${percentValue}%`
                      : `Reduzirá os meses selecionados em ${percentValue}%`}
                  </span>
                </div>
              </div>
            )}

            {simType === 'DELTA_VALUE' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    Informe o valor a somar (+) ou subtrair (-) no orçamento mensal:
                  </span>
                  <div className="flex items-center space-x-1.5">
                    {[-5000, -1000, -500, 500, 1000, 2000, 5000].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setDeltaValue(val)}
                        className={`px-2 py-1 text-xs rounded-lg font-bold border transition-colors cursor-pointer ${
                          deltaValue === val
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {val > 0 ? `+${val}` : `${val}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-[var(--text-secondary)] font-bold">R$</span>
                    <input
                      type="number"
                      step="100"
                      value={deltaValue}
                      onChange={e => setDeltaValue(Number(e.target.value))}
                      className="w-44 pl-9 pr-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-right font-mono font-bold text-base text-[var(--brand-gold)] focus:border-amber-400 focus:outline-hidden"
                    />
                  </div>
                  <span className="text-xs text-[var(--text-primary)]">
                    {deltaValue >= 0 
                      ? `Somará +${formatBRL(deltaValue)} em cada mês selecionado`
                      : `Subtrairá ${formatBRL(Math.abs(deltaValue))} de cada mês selecionado`}
                  </span>
                </div>
              </div>
            )}

            {simType === 'SET_VALUE' && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-[var(--text-primary)] block">
                  Defina o novo valor absoluto a ser orçado em cada mês do período:
                </span>
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-[var(--text-secondary)] font-bold">R$</span>
                    <input
                      type="number"
                      step="500"
                      value={setValue}
                      onChange={e => setSetAmount(Number(e.target.value))}
                      className="w-48 pl-9 pr-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-right font-mono font-bold text-base text-[var(--brand-gold)] focus:border-amber-400 focus:outline-hidden"
                    />
                  </div>
                  <span className="text-xs text-[var(--text-primary)]">
                    O valor passará a ser exatamente <strong>{formatBRL(setValue)}</strong> nos meses selecionados.
                  </span>
                </div>
              </div>
            )}

            {simType === 'PROGRESSIVE' && (
              <div className="space-y-3">
                <span className="text-xs font-bold text-[var(--text-primary)] block">
                  Variação progressiva mês a mês (composta a partir do mês base):
                </span>
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={progressiveRate}
                      onChange={e => setProgressiveRate(Number(e.target.value))}
                      className="w-32 px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-center font-bold text-base text-[var(--brand-gold)] focus:border-amber-400 focus:outline-hidden"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-[var(--text-secondary)] font-bold">%</span>
                  </div>
                  <span className="text-xs text-[var(--text-primary)]">
                    {progressiveRate >= 0
                      ? `Crescerá +${progressiveRate}% mês a mês cumulativamente`
                      : `Decrescerá ${progressiveRate}% mês a mês cumulativamente`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Seleção de Período (A partir de qual mês?) */}
          <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[var(--brand-gold)]" />
                <span>2. Em qual período do ano {year} aplicar a alteração?</span>
              </label>

              {/* Escopos */}
              <div className="flex items-center bg-[var(--surface-elevated)] p-0.5 rounded-lg border border-[var(--border-subtle)] text-xs">
                <button
                  type="button"
                  onClick={() => setPeriodScope('FROM_MONTH')}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    periodScope === 'FROM_MONTH'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-[var(--text-primary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  A partir do mês X
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodScope('CUSTOM_RANGE')}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    periodScope === 'CUSTOM_RANGE'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-[var(--text-primary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Intervalo Específico
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodScope('ALL_YEAR')}
                  className={`px-3 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                    periodScope === 'ALL_YEAR'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-[var(--text-primary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Todos os 12 Meses
                </button>
              </div>
            </div>

            {periodScope === 'FROM_MONTH' && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="text-xs text-[var(--text-primary)]">Aplicar a alteração a partir de:</span>
                <PremiumSelect
                  value={startMonth}
                  onChange={e => setStartMonth(Number(e.target.value))}
                  className="px-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>
                      {name}/{year} (Mês {idx + 1})
                    </option>
                  ))}
                </PremiumSelect>
                <span className="text-xs text-[var(--brand-gold)] font-medium">
                  → até Dezembro/{year} ({12 - startMonth} meses serão alterados)
                </span>
                <span className="text-[11px] text-[var(--text-secondary)] w-full">
                  ℹ️ Os meses anteriores ({startMonth === 0 ? 'nenhum' : `Janeiro a ${MONTH_NAMES[startMonth - 1]}`}) permanecerão 100% intactos com seus valores originais.
                </span>
              </div>
            )}

            {periodScope === 'CUSTOM_RANGE' && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="text-xs text-[var(--text-primary)]">De:</span>
                <PremiumSelect
                  value={startMonth}
                  onChange={e => setStartMonth(Number(e.target.value))}
                  className="px-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>{name}/{year}</option>
                  ))}
                </PremiumSelect>

                <span className="text-xs text-[var(--text-primary)]">Até:</span>
                <PremiumSelect
                  value={endMonth}
                  onChange={e => setEndMonth(Number(e.target.value))}
                  className="px-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden cursor-pointer"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={idx}>{name}/{year}</option>
                  ))}
                </PremiumSelect>
              </div>
            )}

            {periodScope === 'ALL_YEAR' && (
              <p className="text-xs text-[var(--text-secondary)]">
                A alteração incidirá sobre todos os 12 meses do ano de {year} (Janeiro a Dezembro).
              </p>
            )}
          </div>

          {/* 3. PAINEL DE IMPACTO DA SIMULAÇÃO */}
          <div>
            <label className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider block mb-2">
              3. Impacto Projetado nos Resultados da Empresa
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Card 1: Impacto na Conta */}
              <div className="p-3.5 bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)] text-[11px] block">Nesta Linha ({account.name})</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-sm font-mono font-bold text-[var(--text-primary)]">
                    {formatBRL(simulatedTotal)}
                  </span>
                  <span className={`text-xs font-mono font-bold ${
                    totalDiff > 0 ? 'text-[var(--brand-gold)]' : totalDiff < 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  }`}>
                    {totalDiff > 0 ? `+${formatBRL(totalDiff)}` : formatBRL(totalDiff)}
                  </span>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-1 flex justify-between">
                  <span>Atual: {formatBRL(currentTotal)}</span>
                  <span>{totalDiffPct > 0 ? `+${totalDiffPct.toFixed(1)}%` : `${totalDiffPct.toFixed(1)}%`}</span>
                </div>
              </div>

              {/* Card 2: Impacto no Lucro Líquido */}
              <div className="p-3.5 bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)] text-[11px] block">Impacto no Lucro Líquido Anual</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className={`text-sm font-mono font-extrabold ${
                    netIncomeImpact >= 0 ? 'text-[var(--brand-gold)]' : 'text-[var(--status-danger)]'
                  }`}>
                    {netIncomeImpact >= 0 ? `+${formatBRL(netIncomeImpact)}` : formatBRL(netIncomeImpact)}
                  </span>
                  <span className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                    netIncomeImpact >= 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {netIncomeImpact >= 0 ? 'Lucro Aumenta' : 'Lucro Reduz'}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                  {isRevenue 
                    ? 'Receita adicional soma diretamente no resultado operacional.' 
                    : 'Aumento de custo/despesa subtrai do lucro líquido.'}
                </p>
              </div>

              {/* Card 3: Meses e Caixa */}
              <div className="p-3.5 bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)]">
                <span className="text-[var(--text-secondary)] text-[11px] block">Impacto no Saldo de Caixa</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className={`text-sm font-mono font-bold ${
                    cashImpact >= 0 ? 'text-[var(--brand-gold)]' : 'text-[var(--status-danger)]'
                  }`}>
                    {cashImpact >= 0 ? `+${formatBRL(cashImpact)}` : formatBRL(cashImpact)}
                  </span>
                  <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                    {impactedMonthsCount} {impactedMonthsCount === 1 ? 'mês alterado' : 'meses alterados'}
                  </span>
                </div>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                  Reflete na projeção acumulada do fluxo financeiro de caixa.
                </p>
              </div>
            </div>
          </div>

          {/* 4. Tabela de Comparação Mês a Mês (Antes vs Novo) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                4. Comparativo Mês a Mês dos 12 Meses ({year})
              </h3>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Meses com fundo dourado suave indicam alteração ativa
              </span>
            </div>

            <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-card)] text-[11px] text-[var(--text-primary)] font-bold uppercase">
                      <th className="py-2.5 px-3 w-24">Plano</th>
                      {MONTH_SHORT.map((m, idx) => (
                        <th 
                          key={m} 
                          className={`py-2.5 px-2 text-right ${
                            idx % 2 === 0 ? 'bg-[var(--surface-elevated)]' : 'bg-[var(--surface-card)]'
                          }`}
                        >
                          {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
                    {/* Linha Atual */}
                    <tr>
                      <td className="py-2 px-3 font-sans font-medium text-[var(--text-secondary)] bg-[var(--surface-card)]">
                        Atual
                      </td>
                      {currentMonthly.map((val, idx) => (
                        <td 
                          key={idx} 
                          className={`py-2 px-2 text-right text-[var(--text-secondary)] ${
                            idx % 2 === 0 ? 'bg-[var(--surface-elevated)]' : 'bg-[var(--surface-card)]'
                          }`}
                        >
                          {formatBRL(val)}
                        </td>
                      ))}
                    </tr>

                    {/* Linha Simulada com Destaque */}
                    <tr className="font-bold">
                      <td className="py-2 px-3 font-sans font-bold text-[var(--brand-gold)] bg-[var(--surface-card)]">
                        Simulado
                      </td>
                      {simulatedMonthly.map((val, idx) => {
                        const orig = currentMonthly[idx] || 0;
                        const diff = val - orig;
                        const isChanged = Math.abs(diff) > 0.01;

                        return (
                          <td 
                            key={idx} 
                            className={`py-2 px-2 text-right transition-colors ${
                              isChanged 
                                ? 'bg-amber-500/20 text-amber-300 border-x border-amber-500/40' 
                                : idx % 2 === 0 ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]' : 'bg-[var(--surface-card)] text-[var(--text-primary)]'
                            }`}
                          >
                            <div className="text-[var(--text-primary)]">{formatBRL(val)}</div>
                            {isChanged && (
                              <div className={`text-[9px] font-medium ${diff > 0 ? 'text-[var(--brand-gold)]' : 'text-[var(--text-secondary)]'}`}>
                                {diff > 0 ? `+${formatBRL(diff)}` : formatBRL(diff)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

        {/* Rodapé com Ações */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleResetToOriginal}
            className="px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/15 rounded-xl border border-rose-500/30 transition-colors flex items-center cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Restaurar Meta Original
          </button>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-xl border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApplyClick}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-md transition-all flex items-center cursor-pointer"
            >
              <Check className="w-4 h-4 mr-1.5" />
              Aplicar Projeção nesta Linha
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
