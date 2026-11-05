import React, { useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Scale, 
  FileSpreadsheet, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  AlertTriangle,
  Layers,
  Calendar,
  Sparkles
} from 'lucide-react';
import { ChartAccount, AnnualBudgetPlan } from '../../types';
import { formatBRL, FinancialEngine } from '../../services/financialEngine';
import { exportToExcel } from '../../utils/exportUtils';

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

interface BudgetDreCashProjectionTabProps {
  selectedYear: number;
  editingPlan: AnnualBudgetPlan;
  revenueAccounts: ChartAccount[];
  deductionAccounts: ChartAccount[];
  costAccounts: ChartAccount[];
  expenseAccounts: ChartAccount[];
  getEditingPlannedArray: (accId: string) => number[];
  onNavigateToPlanning: () => void;
}

export const BudgetDreCashProjectionTab: React.FC<BudgetDreCashProjectionTabProps> = ({
  selectedYear,
  editingPlan,
  revenueAccounts,
  deductionAccounts,
  costAccounts,
  expenseAccounts,
  getEditingPlannedArray,
  onNavigateToPlanning
}) => {
  // Saldo inicial de 1º de Janeiro do ano selecionado
  const initialCashBalanceYear = useMemo(() => {
    try {
      return FinancialEngine.getConsolidatedCashBalance(`${selectedYear}-01-01`);
    } catch {
      return 0;
    }
  }, [selectedYear]);

  // Cálculos mensais integrados de DRE e Caixa
  const projectionData = useMemo(() => {
    const revMonthly = new Array(12).fill(0);
    const dedMonthly = new Array(12).fill(0);
    const netRevMonthly = new Array(12).fill(0);
    const costMonthly = new Array(12).fill(0);
    const grossProfitMonthly = new Array(12).fill(0);
    const expMonthly = new Array(12).fill(0);
    const netIncomeMonthly = new Array(12).fill(0);
    const netMarginMonthly = new Array(12).fill(0);

    // Caixa
    const cashInflowsMonthly = new Array(12).fill(0);
    const cashOutflowsMonthly = new Array(12).fill(0);
    const cashNetMonthly = new Array(12).fill(0);
    const cashInitialMonthly = new Array(12).fill(0);
    const cashFinalMonthly = new Array(12).fill(0);

    for (let m = 0; m < 12; m++) {
      // 1. Receitas
      let sumRev = 0;
      revenueAccounts.forEach(acc => {
        sumRev += getEditingPlannedArray(acc.id)[m] || 0;
      });
      revMonthly[m] = sumRev;

      // 2. Deduções
      let sumDed = 0;
      deductionAccounts.forEach(acc => {
        sumDed += getEditingPlannedArray(acc.id)[m] || 0;
      });
      dedMonthly[m] = sumDed;

      // 3. Receita Líquida
      const netRev = sumRev - sumDed;
      netRevMonthly[m] = netRev;

      // 4. Custos
      let sumCost = 0;
      costAccounts.forEach(acc => {
        sumCost += getEditingPlannedArray(acc.id)[m] || 0;
      });
      costMonthly[m] = sumCost;

      // 5. Lucro Bruto
      const grossProfit = netRev - sumCost;
      grossProfitMonthly[m] = grossProfit;

      // 6. Despesas
      let sumExp = 0;
      expenseAccounts.forEach(acc => {
        sumExp += getEditingPlannedArray(acc.id)[m] || 0;
      });
      expMonthly[m] = sumExp;

      // 7. Lucro Líquido DRE
      const netInc = grossProfit - sumExp;
      netIncomeMonthly[m] = netInc;
      netMarginMonthly[m] = sumRev > 0 ? (netInc / sumRev) * 100 : 0;

      // 8. Fluxo de Caixa Projetado
      cashInflowsMonthly[m] = netRev;
      cashOutflowsMonthly[m] = sumCost + sumExp;
      cashNetMonthly[m] = cashInflowsMonthly[m] - cashOutflowsMonthly[m];

      if (m === 0) {
        cashInitialMonthly[m] = initialCashBalanceYear;
      } else {
        cashInitialMonthly[m] = cashFinalMonthly[m - 1];
      }
      cashFinalMonthly[m] = cashInitialMonthly[m] + cashNetMonthly[m];
    }

    // Totais anuais
    const totalRev = revMonthly.reduce((a, b) => a + b, 0);
    const totalDed = dedMonthly.reduce((a, b) => a + b, 0);
    const totalNetRev = totalRev - totalDed;
    const totalCost = costMonthly.reduce((a, b) => a + b, 0);
    const totalGrossProfit = totalNetRev - totalCost;
    const totalExp = expMonthly.reduce((a, b) => a + b, 0);
    const totalNetIncome = totalGrossProfit - totalExp;
    const totalMargin = totalRev > 0 ? (totalNetIncome / totalRev) * 100 : 0;

    const totalCashIn = cashInflowsMonthly.reduce((a, b) => a + b, 0);
    const totalCashOut = cashOutflowsMonthly.reduce((a, b) => a + b, 0);
    const totalCashNet = totalCashIn - totalCashOut;
    const finalYearCash = cashFinalMonthly[11];

    return {
      revMonthly,
      dedMonthly,
      netRevMonthly,
      costMonthly,
      grossProfitMonthly,
      expMonthly,
      netIncomeMonthly,
      netMarginMonthly,
      cashInflowsMonthly,
      cashOutflowsMonthly,
      cashNetMonthly,
      cashInitialMonthly,
      cashFinalMonthly,
      totalRev,
      totalDed,
      totalNetRev,
      totalCost,
      totalGrossProfit,
      totalExp,
      totalNetIncome,
      totalMargin,
      totalCashIn,
      totalCashOut,
      totalCashNet,
      finalYearCash
    };
  }, [
    revenueAccounts, 
    deductionAccounts, 
    costAccounts, 
    expenseAccounts, 
    getEditingPlannedArray, 
    initialCashBalanceYear
  ]);

  // Exportar Relatório Consolidado para Excel
  const handleExportConsolidatedExcel = () => {
    const headers = ['Métrica / Estrutura', 'Total Anual', '% AV', ...MONTH_SHORT.map(m => `${m}/${String(selectedYear).substring(2)}`)];
    
    const fmtP = (val: number) => `${val.toFixed(1)}%`;
    const av = (val: number) => projectionData.totalRev > 0 ? fmtP((val / projectionData.totalRev) * 100) : '0.0%';

    const rows: (string | number)[][] = [
      ['=== DEMONSTRAÇÃO DO RESULTADO (DRE) ===', '', '', ...new Array(12).fill('')],
      ['(+) Receita Bruta de Serviços', projectionData.totalRev, '100.0%', ...projectionData.revMonthly],
      ['(-) Deduções e Impostos sobre Serviços', projectionData.totalDed, av(projectionData.totalDed), ...projectionData.dedMonthly],
      ['(=) Receita Operacional Líquida', projectionData.totalNetRev, av(projectionData.totalNetRev), ...projectionData.netRevMonthly],
      ['(-) Custos dos Serviços Prestados (CSP)', projectionData.totalCost, av(projectionData.totalCost), ...projectionData.costMonthly],
      ['(=) Lucro Bruto Operacional', projectionData.totalGrossProfit, av(projectionData.totalGrossProfit), ...projectionData.grossProfitMonthly],
      ['(-) Despesas Operacionais Totais', projectionData.totalExp, av(projectionData.totalExp), ...projectionData.expMonthly],
      ['(=) RESULTADO LÍQUIDO DO EXERCÍCIO (DRE)', projectionData.totalNetIncome, av(projectionData.totalNetIncome), ...projectionData.netIncomeMonthly],
      ['Margem Líquida (%)', fmtP(projectionData.totalMargin), '-', ...projectionData.netMarginMonthly.map(m => fmtP(m))],
      ['', '', '', ...new Array(12).fill('')],
      ['=== FLUXO DE CAIXA PROJETADO ===', '', '', ...new Array(12).fill('')],
      ['(+) Saldo Inicial de Caixa', initialCashBalanceYear, '-', ...projectionData.cashInitialMonthly],
      ['(+) Entradas Operacionais de Caixa', projectionData.totalCashIn, '-', ...projectionData.cashInflowsMonthly],
      ['(-) Saídas Operacionais de Caixa', projectionData.totalCashOut, '-', ...projectionData.cashOutflowsMonthly],
      ['(=) GERAÇÃO LÍQUIDA DE CAIXA', projectionData.totalCashNet, '-', ...projectionData.cashNetMonthly],
      ['(=) SALDO FINAL ACUMULADO DE CAIXA', projectionData.finalYearCash, '-', ...projectionData.cashFinalMonthly]
    ];

    exportToExcel(
      `Demonstrativo_DRE_e_Caixa_Projetado_${selectedYear}`,
      'DRE_e_Caixa_Projetado',
      headers,
      rows
    );
  };

  return (
    <div className="space-y-6">
      
      {/* Header da Aba */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Demonstrativo DRE & Caixa Projetado ({selectedYear})
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Integração consolidada entre o Resultado Econômico (DRE por Competência) e a Liquidez Financeira (Fluxo de Caixa) do orçamento simulado.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onNavigateToPlanning}
            className="px-3.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors"
          >
            Ajustar Metas na Grade
          </button>
          <button
            onClick={handleExportConsolidatedExcel}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-[#18181b] rounded-xl text-xs font-bold transition-all shadow-xs flex items-center"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5" />
            Exportar Excel DRE x Caixa
          </button>
        </div>
      </div>

      {/* Cards de Síntese Executiva */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* 1. Receita Bruta */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] to-transparent shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase">
            <span>Receita Bruta Total</span>
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-mono font-bold text-amber-300">
            {formatBRL(projectionData.totalRev)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Média: {formatBRL(projectionData.totalRev / 12)}/mês
          </span>
        </div>

        {/* 2. Custos Totais */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/[0.05] to-transparent shadow-xs">
          <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase">
            <span>Custos dos Serviços</span>
            <ArrowDownRight className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-mono font-bold text-amber-300">
            {formatBRL(projectionData.totalCost)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {projectionData.totalRev > 0 ? `${((projectionData.totalCost / projectionData.totalRev) * 100).toFixed(1)}% do faturamento` : '-'}
          </span>
        </div>

        {/* 3. Despesas Operacionais */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-rose-500/30 bg-gradient-to-br from-rose-500/[0.05] to-transparent shadow-xs">
          <div className="flex items-center justify-between text-xs text-rose-400 font-bold uppercase">
            <span>Despesas Operacionais</span>
            <ArrowDownRight className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-xl font-mono font-bold text-rose-300">
            {formatBRL(projectionData.totalExp)}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {projectionData.totalRev > 0 ? `${((projectionData.totalExp / projectionData.totalRev) * 100).toFixed(1)}% do faturamento` : '-'}
          </span>
        </div>

        {/* 4. Lucro Líquido DRE */}
        <div className={`bg-[var(--surface-card)] p-4 rounded-xl border shadow-xs ${
          projectionData.totalNetIncome >= 0 ? 'border-amber-500/40 bg-amber-500/[0.05]' : 'border-rose-500/40 bg-rose-500/[0.05]'
        }`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase text-amber-400">
            <span>Lucro Líquido (DRE)</span>
            <Scale className="w-4 h-4" />
          </div>
          <div className={`mt-2 text-xl font-mono font-bold ${
            projectionData.totalNetIncome >= 0 ? 'text-amber-400' : 'text-rose-400'
          }`}>
            {formatBRL(projectionData.totalNetIncome)}
          </div>
          <span className="text-[11px] font-semibold text-amber-300">
            Margem Líquida: {projectionData.totalMargin.toFixed(1)}%
          </span>
        </div>

        {/* 5. Saldo Final de Caixa */}
        <div className={`p-4 rounded-xl border shadow-xs ${
          projectionData.finalYearCash >= 0 ? 'bg-slate-900 border-2 border-amber-500/40 text-amber-300' : 'bg-slate-900 border-2 border-rose-500/40 text-rose-400'
        }`}>
          <div className="flex items-center justify-between text-xs font-bold uppercase text-amber-400">
            <span>Saldo Final de Caixa</span>
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <div className={`mt-2 text-xl font-mono font-bold ${
            projectionData.finalYearCash >= 0 ? 'text-amber-300' : 'text-rose-400'
          }`}>
            {formatBRL(projectionData.finalYearCash)}
          </div>
          <span className="text-[11px] text-amber-400">
            Geração Líquida: {projectionData.totalCashNet >= 0 ? '+' : ''}{formatBRL(projectionData.totalCashNet)}
          </span>
        </div>
      </div>

      {/* Tabela 1: Demonstrativo DRE Projetado Mês a Mês */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
        <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[var(--text-primary)]">1. Demonstração do Resultado do Exercício (DRE Projetada)</span>
            <span className="text-[11px] text-[var(--text-secondary)]">• Regime de Competência</span>
          </div>
          <span className="text-[11px] text-amber-400 font-semibold">
            Exercício {selectedYear}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[1050px]">
            <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)]">
              <tr className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-2.5 px-4 min-w-[260px] sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)]">
                  Estrutura do DRE
                </th>
                <th className="py-2.5 px-3 text-right bg-amber-500/10 text-amber-400 font-bold min-w-[120px] border-r border-[var(--border-subtle)]">
                  Total Anual
                </th>
                <th className="py-2.5 px-2 text-right bg-[var(--surface-elevated)] text-[var(--text-secondary)] min-w-[65px] border-r border-[var(--border-subtle)]">
                  % AV
                </th>
                {MONTH_SHORT.map((m, idx) => (
                  <th key={m} className={`py-2.5 px-2 text-right min-w-[90px] border-r border-[var(--border-subtle)]/60 ${
                    idx % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/70'
                  }`}>
                    {m}/{String(selectedYear).substring(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {/* Receita Bruta */}
              <tr className="bg-amber-500/[0.08] font-semibold hover:bg-amber-500/[0.14] transition-colors">
                <td className="py-2.5 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-amber-300 font-bold">
                  (+) Receita Bruta Operacional
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-amber-300 bg-amber-500/15 border-r border-[var(--border-subtle)]">
                  {formatBRL(projectionData.totalRev)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">
                  100.0%
                </td>
                {projectionData.revMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-amber-300 font-medium border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Deduções */}
              {projectionData.totalDed > 0 && (
                <tr className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                  <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-[var(--text-secondary)] pl-8">
                    (-) Deduções e Impostos sobre Vendas
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-rose-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                    {formatBRL(projectionData.totalDed)}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">
                    {projectionData.totalRev > 0 ? `${((projectionData.totalDed / projectionData.totalRev) * 100).toFixed(1)}%` : '-'}
                  </td>
                  {projectionData.dedMonthly.map((v, i) => (
                    <td key={i} className={`py-2 px-2 text-right font-mono text-rose-400 border-r border-[var(--border-subtle)]/40 ${
                      i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                    }`}>
                      {formatBRL(v)}
                    </td>
                  ))}
                </tr>
              )}

              {/* Receita Líquida */}
              <tr className="bg-[var(--surface-elevated)]/70 font-semibold border-t border-[var(--border-subtle)]">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">
                  (=) Receita Operacional Líquida
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-[var(--text-primary)] bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {formatBRL(projectionData.totalNetRev)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">
                  {projectionData.totalRev > 0 ? `${((projectionData.totalNetRev / projectionData.totalRev) * 100).toFixed(1)}%` : '-'}
                </td>
                {projectionData.netRevMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Custos dos Serviços */}
              <tr className="bg-amber-500/[0.04] hover:bg-amber-500/[0.08] transition-colors">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-amber-300 pl-8">
                  (-) Custos dos Serviços Prestados (CSP)
                </td>
                <td className="py-2 px-3 text-right font-mono text-amber-300 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {formatBRL(projectionData.totalCost)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">
                  {projectionData.totalRev > 0 ? `${((projectionData.totalCost / projectionData.totalRev) * 100).toFixed(1)}%` : '-'}
                </td>
                {projectionData.costMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-amber-300 border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Lucro Bruto */}
              <tr className="bg-[var(--surface-elevated)]/70 font-semibold border-t border-[var(--border-subtle)]">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">
                  (=) Lucro Bruto Operacional
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-[var(--text-primary)] bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {formatBRL(projectionData.totalGrossProfit)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">
                  {projectionData.totalRev > 0 ? `${((projectionData.totalGrossProfit / projectionData.totalRev) * 100).toFixed(1)}%` : '-'}
                </td>
                {projectionData.grossProfitMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-[var(--text-primary)] font-medium border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Despesas Operacionais */}
              <tr className="bg-rose-500/[0.04] hover:bg-rose-500/[0.08] transition-colors">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-rose-300 pl-8">
                  (-) Despesas Operacionais Totais
                </td>
                <td className="py-2 px-3 text-right font-mono text-rose-300 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {formatBRL(projectionData.totalExp)}
                </td>
                <td className="py-2 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-[var(--border-subtle)]">
                  {projectionData.totalRev > 0 ? `${((projectionData.totalExp / projectionData.totalRev) * 100).toFixed(1)}%` : '-'}
                </td>
                {projectionData.expMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-rose-300 border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* RESULTADO LÍQUIDO DRE */}
              <tr className="bg-amber-500/20 font-bold border-t-2 border-amber-500/40 text-amber-300 text-xs">
                <td className="py-2.5 px-4 sticky left-0 bg-amber-950/60 z-10 border-r border-amber-500/30 text-amber-300">
                  (=) RESULTADO LÍQUIDO DO EXERCÍCIO (DRE)
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-amber-300 bg-amber-500/20 border-r border-amber-500/30">
                  {formatBRL(projectionData.totalNetIncome)}
                </td>
                <td className="py-2.5 px-2 text-right font-mono text-amber-400 border-r border-amber-500/30">
                  {projectionData.totalMargin.toFixed(1)}%
                </td>
                {projectionData.netIncomeMonthly.map((v, i) => (
                  <td key={i} className={`py-2.5 px-2 text-right font-mono font-bold border-r border-amber-500/20 ${
                    v >= 0 ? 'text-amber-300' : 'text-rose-400'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Margem Líquida % */}
              <tr className="bg-[var(--surface-elevated)]/50 text-[11px] text-[var(--text-secondary)]">
                <td className="py-1.5 px-4 sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)]">
                  Margem Líquida (%)
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-amber-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {projectionData.totalMargin.toFixed(1)}%
                </td>
                <td className="py-1.5 px-2 text-right font-mono border-r border-[var(--border-subtle)]">-</td>
                {projectionData.netMarginMonthly.map((m, i) => (
                  <td key={i} className={`py-1.5 px-2 text-right font-mono border-r border-[var(--border-subtle)]/40 ${
                    m >= 0 ? 'text-amber-300' : 'text-rose-400'
                  }`}>
                    {m.toFixed(1)}%
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela 2: Demonstrativo Fluxo de Caixa Projetado Mês a Mês */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
        <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[var(--text-primary)]">2. Demonstração do Fluxo de Caixa Projetado</span>
            <span className="text-[11px] text-[var(--text-secondary)]">• Regime de Caixa Financeiro</span>
          </div>
          <span className="text-[11px] text-amber-300 font-semibold">
            Saldo Inicial de 01/Jan: {formatBRL(initialCashBalanceYear)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[1050px]">
            <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)]">
              <tr className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-2.5 px-4 min-w-[260px] sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)]">
                  Rubrica Financeira
                </th>
                <th className="py-2.5 px-3 text-right bg-amber-500/10 text-amber-400 font-bold min-w-[120px] border-r border-[var(--border-subtle)]">
                  Total Exercício
                </th>
                {MONTH_SHORT.map((m, idx) => (
                  <th key={m} className={`py-2.5 px-2 text-right min-w-[90px] border-r border-[var(--border-subtle)]/60 ${
                    idx % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/70'
                  }`}>
                    {m}/{String(selectedYear).substring(2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {/* Saldo Inicial */}
              <tr className="bg-[var(--surface-elevated)]/60 font-medium">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)] text-[var(--text-secondary)]">
                  (+) Saldo Inicial de Caixa
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-[var(--text-primary)] bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {formatBRL(initialCashBalanceYear)}
                </td>
                {projectionData.cashInitialMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-[var(--text-secondary)] border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Entradas de Caixa */}
              <tr className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-amber-300 pl-8">
                  (+) Entradas Operacionais de Clientes
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-amber-300 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {formatBRL(projectionData.totalCashIn)}
                </td>
                {projectionData.cashInflowsMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-amber-300/90 border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Saídas de Caixa */}
              <tr className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-rose-400 pl-8">
                  (-) Desembolsos de Custos e Despesas
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold text-rose-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                  {formatBRL(projectionData.totalCashOut)}
                </td>
                {projectionData.cashOutflowsMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono text-rose-400 border-r border-[var(--border-subtle)]/40 ${
                    i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* Geração Líquida de Caixa */}
              <tr className="bg-amber-500/10 font-bold border-t border-[var(--border-subtle)]">
                <td className="py-2 px-4 sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)] text-amber-300">
                  (=) GERAÇÃO LÍQUIDA DE CAIXA NO MÊS
                </td>
                <td className={`py-2 px-3 text-right font-mono font-extrabold bg-amber-500/15 border-r border-[var(--border-subtle)] ${
                  projectionData.totalCashNet >= 0 ? 'text-amber-300' : 'text-rose-400'
                }`}>
                  {projectionData.totalCashNet >= 0 ? '+' : ''}{formatBRL(projectionData.totalCashNet)}
                </td>
                {projectionData.cashNetMonthly.map((v, i) => (
                  <td key={i} className={`py-2 px-2 text-right font-mono font-bold border-r border-[var(--border-subtle)]/40 ${
                    v >= 0 ? 'text-amber-300' : 'text-rose-400'
                  } ${i % 2 === 0 ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'}`}>
                    {v >= 0 ? '+' : ''}{formatBRL(v)}
                  </td>
                ))}
              </tr>

              {/* SALDO FINAL DE CAIXA */}
              <tr className="bg-slate-950 font-extrabold border-t-2 border-amber-500/50 text-amber-300 text-xs">
                <td className="py-2.5 px-4 sticky left-0 bg-slate-950 z-10 border-r border-amber-500/40 text-amber-300">
                  (=) SALDO FINAL ACUMULADO DE CAIXA
                </td>
                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-amber-300 bg-slate-900 border-r border-amber-500/40 text-sm">
                  {formatBRL(projectionData.finalYearCash)}
                </td>
                {projectionData.cashFinalMonthly.map((v, i) => (
                  <td key={i} className={`py-2.5 px-2 text-right font-mono font-bold border-r border-amber-500/30 ${
                    v >= 0 ? 'text-amber-300' : 'text-rose-400'
                  }`}>
                    {formatBRL(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção Comparativa: Descasamento Lucro DRE vs Caixa */}
      <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Scale className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Análise de Integração Contábil x Financeira (Lucro DRE vs Caixa)
            </h3>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">
            Acompanhamento de conversão de lucro contábil em liquidez efetiva
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)] font-medium">Conversão de Resultado em Caixa</div>
            <div className="text-lg font-bold font-mono text-[var(--text-primary)] mt-1">
              {projectionData.totalNetIncome > 0 
                ? `${((projectionData.totalCashNet / projectionData.totalNetIncome) * 100).toFixed(1)}%` 
                : 'N/A'}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              Percentual do Lucro Líquido que é transformado em caixa disponível no exercício.
            </p>
          </div>

          <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)] font-medium">Ponto de Equilíbrio Operacional</div>
            <div className="text-lg font-bold font-mono text-amber-400 mt-1">
              {formatBRL(projectionData.totalExp + projectionData.totalCost)}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1">
              Faturamento anual mínimo necessário para cobrir todos os desembolsos orçados.
            </p>
          </div>

          <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-secondary)] font-medium">Mês com Menor Caixa Projetado</div>
            {(() => {
              let minCash = Infinity;
              let minMonth = 0;
              projectionData.cashFinalMonthly.forEach((v, idx) => {
                if (v < minCash) {
                  minCash = v;
                  minMonth = idx;
                }
              });
              return (
                <div>
                  <div className={`text-lg font-bold font-mono mt-1 ${minCash >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {MONTH_SHORT[minMonth]}: {formatBRL(minCash)}
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    {minCash >= 0 ? 'Saldo de caixa positivo garantido em todos os meses.' : 'Atenção: Risco de saldo de caixa negativo neste mês.'}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

    </div>
  );
};
