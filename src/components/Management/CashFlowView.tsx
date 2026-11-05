import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Download,
  FileSpreadsheet,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  Layers,
  Calendar,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Scale,
  Maximize2,
  Minimize2,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  Check,
  Printer,
  FileText
} from 'lucide-react';
import { ReportingEngine, CashFlowLineItem } from '../../services/reportingEngine';
import { formatBRL } from '../../services/financialEngine';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { exportCashFlowToPDF } from '../../utils/pdfExportUtils';
import { useGlobalPeriod } from '../../hooks/useGlobalPeriod';
import { GlobalPeriodBanner } from '../Common/GlobalPeriodBanner';
import { storage } from '../../services/storageService';

export type CashFlowTimeHorizon = 'ANO' | 'SEMESTRE' | 'TRIMESTRE' | 'MES';

export interface CashFlowViewProps {
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
}

export const CashFlowView: React.FC<CashFlowViewProps> = ({ isFocusMode, onToggleFocusMode }) => {
  const currentYear = new Date().getFullYear();
  const { period } = useGlobalPeriod();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [mode, setMode] = useState<'REALIZADO' | 'PROJETADO' | 'COMBINADO'>('REALIZADO');
  const [pdfToast, setPdfToast] = useState<string | null>(null);

  // Modo de visualização: Consolidado (apenas grupos sintéticos e saldos) vs Analítico (detalhado)
  const [viewMode, setViewMode] = useState<'CONSOLIDADO' | 'ANALITICO'>('CONSOLIDADO');

  // Filtro de Segregação: Todos os Fluxos / Apenas Atividades de Caixa da Empresa / Apenas Distribuição de Lucros
  const [flowFilter, setFlowFilter] = useState<'TODOS' | 'ATIVIDADES_REAIS' | 'DISTRIBUICAO_LUCROS'>('TODOS');

  // Filtros de prazo solicitados: Ano (12 meses), Semestre, Trimestre ou Mês
  const [timeHorizon, setTimeHorizon] = useState<CashFlowTimeHorizon>('ANO');
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(1);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

  const effectiveYear = period.active ? period.year : selectedYear;
  // Note: mode can be passed directly. If COMBINADO, map to CONSOLIDADO in ReportingEngine
  const engineMode = mode === 'COMBINADO' ? 'CONSOLIDADO' : mode;
  const cashData = ReportingEngine.generateCashFlow(effectiveYear, engineMode);
  const allTitles = storage.getTitles();

  // Definição dos meses ativos de acordo com o filtro de horizonte de tempo
  const activeMonthIndices = useMemo(() => {
    if (timeHorizon === 'MES') {
      return [selectedMonth];
    }
    if (timeHorizon === 'ANO') {
      return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    }
    if (timeHorizon === 'SEMESTRE') {
      return selectedSemester === 1 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
    }
    // TRIMESTRE
    if (selectedQuarter === 1) return [0, 1, 2];
    if (selectedQuarter === 2) return [3, 4, 5];
    if (selectedQuarter === 3) return [6, 7, 8];
    return [9, 10, 11];
  }, [timeHorizon, selectedSemester, selectedQuarter, selectedMonth]);

  const horizonLabel = useMemo(() => {
    if (timeHorizon === 'MES') return `${cashData.months[selectedMonth]}/${effectiveYear}`;
    if (timeHorizon === 'ANO') return `Ano Completo (${effectiveYear}) - 12 Meses`;
    if (timeHorizon === 'SEMESTRE') return `${selectedSemester}º Semestre de ${effectiveYear}`;
    return `${selectedQuarter}º Trimestre (${selectedQuarter}T) de ${effectiveYear}`;
  }, [timeHorizon, selectedSemester, selectedQuarter, selectedMonth, effectiveYear, cashData.months]);

  const totalColLabel = useMemo(() => {
    if (timeHorizon === 'MES') return `Total ${cashData.months[selectedMonth]}`;
    if (timeHorizon === 'ANO') return 'Total Exercício';
    if (timeHorizon === 'SEMESTRE') return `Total ${selectedSemester}º Sem.`;
    return `Total ${selectedQuarter}º Trim.`;
  }, [timeHorizon, selectedSemester, selectedQuarter, selectedMonth, cashData.months]);

  // Cálculo do total da linha para o período filtrado
  const getLinePeriodTotal = (line: CashFlowLineItem): number => {
    const isInitialBalance = line.id === 'cf-initial' || line.name.includes('SALDO INICIAL');
    const isFinalBalance = line.id === 'cf-final' || line.name.includes('SALDO FINAL');

    if (isInitialBalance) {
      // Saldo inicial do primeiro mês do período filtrado
      const firstMonthIdx = activeMonthIndices[0];
      return line.valuesByMonth[firstMonthIdx] || 0;
    }
    if (isFinalBalance) {
      // Saldo final do último mês do período filtrado
      const lastMonthIdx = activeMonthIndices[activeMonthIndices.length - 1];
      return line.valuesByMonth[lastMonthIdx] || 0;
    }
    // Linha de fluxo: somatório dos meses do período
    return activeMonthIndices.reduce((acc, idx) => acc + (line.valuesByMonth[idx] || 0), 0);
  };

  // Linhas filtradas de acordo com a visão selecionada pelo gestor
  const displayedLines = useMemo(() => {
    let lines = cashData.lines;

    // Modo Consolidado exibe as linhas estruturais de nível 0 e 1 (Cabeçalhos de Atividades, Caixa Gerado, Caixa Consumido, Somas de Atividades e Totais)
    // Oculta apenas as rubricas analíticas detalhadas de nível 2
    if (viewMode === 'CONSOLIDADO') {
      lines = lines.filter(l => l.level <= 1 || l.isSummary || l.isHeader);
    }

    if (flowFilter === 'ATIVIDADES_REAIS') {
      // Oculta linhas de distribuição de lucros aos sócios
      return lines.filter(l => 
        l.id !== 'cf-fin-out-profit' && 
        l.id !== 'cf-profit-distribution'
      );
    }

    if (flowFilter === 'DISTRIBUICAO_LUCROS') {
      // Foco estrito na remuneração dos sócios e capacidade de caixa
      return lines.filter(l => 
        l.id === 'cf-initial' ||
        l.id === 'cf-op-net' ||
        l.id === 'cf-fin-out-loans' ||
        l.id === 'cf-fin-out-profit' ||
        l.id === 'cf-real-activities-outflows' ||
        l.id === 'cf-cash-before-profit' ||
        l.id === 'cf-profit-distribution' ||
        l.id === 'cf-net-variation' ||
        l.id === 'cf-final'
      );
    }

    return lines;
  }, [cashData.lines, viewMode, flowFilter]);

  // KPIs executivos do período selecionado com segregação precisa
  const periodKPIs = useMemo(() => {
    const initialLine = cashData.lines.find(l => l.id === 'cf-initial');
    const finalLine = cashData.lines.find(l => l.id === 'cf-final');
    const opInLine = cashData.lines.find(l => l.id === 'cf-op-in');
    const opOutLine = cashData.lines.find(l => l.id === 'cf-op-out');
    const opNetLine = cashData.lines.find(l => l.id === 'cf-op-net');

    const invInLine = cashData.lines.find(l => l.id === 'cf-inv-in');
    const invOutLine = cashData.lines.find(l => l.id === 'cf-inv-out');
    const invNetLine = cashData.lines.find(l => l.id === 'cf-inv-net');

    const finInLine = cashData.lines.find(l => l.id === 'cf-fin-in');
    const finOutLine = cashData.lines.find(l => l.id === 'cf-fin-out');
    const finLoanOutLine = cashData.lines.find(l => l.id === 'cf-fin-out-loans');
    const finProfitOutLine = cashData.lines.find(l => l.id === 'cf-fin-out-profit');
    const finNetLine = cashData.lines.find(l => l.id === 'cf-fin-net');

    const firstMonthIdx = activeMonthIndices[0];
    const lastMonthIdx = activeMonthIndices[activeMonthIndices.length - 1];

    const initialBalance = initialLine ? (initialLine.valuesByMonth[firstMonthIdx] || 0) : 0;
    const finalBalance = finalLine ? (finalLine.valuesByMonth[lastMonthIdx] || 0) : 0;

    const sumMonths = (line?: CashFlowLineItem) => {
      if (!line) return 0;
      return activeMonthIndices.reduce((acc, idx) => acc + (line.valuesByMonth[idx] || 0), 0);
    };

    const opInflows = sumMonths(opInLine);
    const opOutflows = sumMonths(opOutLine);
    const opNet = sumMonths(opNetLine);

    const invInflows = sumMonths(invInLine);
    const invOutflows = sumMonths(invOutLine);
    const invNet = sumMonths(invNetLine);

    const finInflows = sumMonths(finInLine);
    const finOutflows = sumMonths(finOutLine);
    const loanOutflows = sumMonths(finLoanOutLine);
    const profitDistributionOutflows = sumMonths(finProfitOutLine);
    const finNet = sumMonths(finNetLine);

    const totalInflows = opInflows + invInflows + finInflows;

    // Pagamentos Reais das Atividades (Operação + Investimentos + Amortização de Dívidas)
    const realActivitiesOutflows = opOutflows + invOutflows + loanOutflows;

    // Total Geral de Saídas
    const totalOutflows = realActivitiesOutflows + profitDistributionOutflows;

    // Geração de Caixa Antes da Distribuição de Lucros
    const netCashBeforeProfit = totalInflows - realActivitiesOutflows;

    // Geração Líquida Final (após distribuição de lucros / Soma Total)
    const netCashGeneration = totalInflows - totalOutflows;

    // Percentual de Lucro Distribuído sobre a Geração Líquida Pré-Lucros
    const profitPayoutRatio = netCashBeforeProfit > 0 
      ? (profitDistributionOutflows / netCashBeforeProfit) * 100 
      : 0;

    return {
      initialBalance,
      finalBalance,
      totalInflows,
      opInflows,
      opOutflows,
      opNet,
      invInflows,
      invOutflows,
      invNet,
      finInflows,
      finOutflows,
      finNet,
      loanOutflows,
      realActivitiesOutflows,
      profitDistributionOutflows,
      totalOutflows,
      netCashBeforeProfit,
      netCashGeneration,
      profitPayoutRatio
    };
  }, [cashData, activeMonthIndices]);

  const handleExportExcel = () => {
    const visibleMonthNames = activeMonthIndices.map(idx => cashData.months[idx]);
    const headers = ['Estrutura', 'Descrição', ...visibleMonthNames, totalColLabel];
    const rows = displayedLines.map(l => [
      l.code || '-',
      l.name,
      ...activeMonthIndices.map(idx => l.valuesByMonth[idx] || 0),
      getLinePeriodTotal(l)
    ]);
    exportToExcel(`Fluxo-Caixa-${flowFilter}-${timeHorizon}-${mode}-${effectiveYear}`, `Fluxo Caixa ${timeHorizon}`, headers, rows);
  };

  const handleExportCSV = () => {
    const visibleMonthNames = activeMonthIndices.map(idx => cashData.months[idx]);
    const headers = ['Estrutura', 'Descrição', ...visibleMonthNames, totalColLabel];
    const rows = displayedLines.map(l => [
      l.code || '-',
      l.name,
      ...activeMonthIndices.map(idx => l.valuesByMonth[idx] || 0),
      getLinePeriodTotal(l)
    ]);
    exportToCSV(`Fluxo-Caixa-${flowFilter}-${timeHorizon}-${mode}-${effectiveYear}`, headers, rows);
  };

  const handleExportPDF = () => {
    try {
      const company = storage.getCompany();
      const companyName = company.companyName || company.tradeName || 'Contaju Gestão Financeira';

      exportCashFlowToPDF(
        {
          months: cashData.months,
          lines: displayedLines,
          finalBalances: cashData.lines.find(l => l.id === 'cf-final')?.valuesByMonth
        },
        effectiveYear,
        {
          mode,
          companyName,
          timeHorizonLabel: `${horizonLabel}${flowFilter !== 'TODOS' ? ` • ${flowFilter === 'ATIVIDADES_REAIS' ? 'Atividades Reais de Caixa' : 'Distribuição de Lucros'}` : ''}`,
          activeMonthIndices,
          totalColLabel
        }
      );

      setPdfToast(`PDF Executivo do Fluxo de Caixa (${mode} • ${effectiveYear} • ${horizonLabel}) gerado com sucesso!`);
      setTimeout(() => setPdfToast(null), 4500);
    } catch (err: any) {
      console.error('Erro ao gerar PDF do Fluxo de Caixa:', err);
      alert(`Falha ao exportar PDF: ${err.message || 'Erro inesperado'}`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Diagnóstico Inteligente de Ponto Crítico de Liquidez (Sugestão 5)
  const liquidityDiagnostic = useMemo(() => {
    const finalLine = cashData.lines.find(l => l.id === 'cf-final');
    if (!finalLine) return null;

    let minBalance = Infinity;
    let minMonthIdx = activeMonthIndices[0];
    const negativeMonths: { month: string; balance: number }[] = [];

    activeMonthIndices.forEach(idx => {
      const bal = finalLine.valuesByMonth[idx] || 0;
      if (bal < minBalance) {
        minBalance = bal;
        minMonthIdx = idx;
      }
      if (bal < 0) {
        negativeMonths.push({ month: cashData.months[idx], balance: bal });
      }
    });

    const minMonthName = cashData.months[minMonthIdx];
    const avgOutflow = (periodKPIs.totalOutflows / (activeMonthIndices.length || 1)) || 1;
    // Buffer prudencial recomendado: 20% da média de desembolsos mensais
    const safetyBuffer = Math.max(1000, avgOutflow * 0.2);

    let status: 'CRITICO' | 'ALERTA' | 'SAUDAVEL' = 'SAUDAVEL';
    if (minBalance < 0 || negativeMonths.length > 0) {
      status = 'CRITICO';
    } else if (minBalance < safetyBuffer) {
      status = 'ALERTA';
    }

    return {
      status,
      minBalance: minBalance === Infinity ? 0 : minBalance,
      minMonthName,
      negativeMonthsCount: negativeMonths.length,
      negativeMonths,
      safetyBuffer,
      burnRateMonthly: periodKPIs.netCashGeneration < 0 ? Math.abs(periodKPIs.netCashGeneration / activeMonthIndices.length) : 0
    };
  }, [cashData, activeMonthIndices, periodKPIs]);

  return (
    <div className="space-y-6">

      {/* Header Principal */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <LineChart className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Fluxo de Caixa Direto
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
              {horizonLabel}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Demonstração estruturada da liquidez por regime de caixa (entradas e saídas efetivas e projetadas).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Realizado / Projetado / Combinado Toggles */}
          <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-medium">
            <button
              onClick={() => setMode('REALIZADO')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                mode === 'REALIZADO'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Realizado
            </button>
            <button
              onClick={() => setMode('PROJETADO')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                mode === 'PROJETADO'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Projetado
            </button>
            <button
              onClick={() => setMode('COMBINADO')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                mode === 'COMBINADO'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Combinado
            </button>
          </div>

          {/* Seletor de Ano */}
          <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
            <span className="font-semibold text-[var(--text-secondary)] px-1.5">Ano:</span>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                  selectedYear === y
                    ? 'bg-[var(--surface-card)] font-bold text-[var(--text-primary)] shadow-xs border border-[var(--border-highlight)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Exportações */}
          <button
            onClick={handleExportPDF}
            className="px-3.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors flex items-center shadow-xs cursor-pointer"
            title="Exportar demonstração executiva do fluxo de caixa em PDF (A4 Paisagem)"
          >
            <Download className="w-4 h-4 mr-1.5 text-amber-500 shrink-0" />
            PDF (A4)
          </button>

          <button
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors flex items-center shadow-xs cursor-pointer"
            title="Imprimir ou Salvar em PDF pelo navegador (com variáveis de tema)"
          >
            <Printer className="w-4 h-4 mr-1.5 text-[var(--text-secondary)] shrink-0" />
            Imprimir
          </button>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors flex items-center shadow-xs cursor-pointer"
            title="Exportar fluxo de caixa para planilha Excel"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-[var(--text-secondary)]" />
            Excel
          </button>

          {/* Modo Foco */}
          {onToggleFocusMode && (
            <button
              onClick={onToggleFocusMode}
              className={`px-3.5 py-1.5 border rounded-xl text-xs font-semibold transition-all flex items-center shadow-xs cursor-pointer ${
                isFocusMode
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-[var(--border-highlight)] font-bold'
                  : 'bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-primary)]'
              }`}
              title={isFocusMode ? "Sair do Modo Foco (Esc)" : "Ocultar cabeçalho e menu lateral para focar no fluxo financeiro"}
            >
              {isFocusMode ? <Minimize2 className="w-4 h-4 mr-1.5" /> : <Maximize2 className="w-4 h-4 mr-1.5" />}
              {isFocusMode ? 'Sair do Modo Foco' : 'Modo Foco'}
            </button>
          )}
        </div>
      </div>

      {/* Global Period Banner */}
      <GlobalPeriodBanner
        moduleName="Fluxo de Caixa Direto"
        matchedCount={allTitles.filter(t => t.competence?.startsWith(String(effectiveYear))).length}
        totalCount={allTitles.length}
      />

      {/* Barra de Filtros de Prazos: Ano (12 meses) / Semestre / Trimestre */}
      <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">

          {/* Seletores Principais de Prazo */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center mr-1">
              <Calendar className="w-3.5 h-3.5 mr-1 text-[var(--text-secondary)]" />
              Horizonte de Análise:
            </span>

            {/* Opção Ano Todo (12 meses) */}
            <button
              onClick={() => setTimeHorizon('ANO')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center cursor-pointer ${
                timeHorizon === 'ANO'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              Ano Todo (12 Meses)
            </button>

            {/* Opção Semestre */}
            <button
              onClick={() => setTimeHorizon('SEMESTRE')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center cursor-pointer ${
                timeHorizon === 'SEMESTRE'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              Semestre
            </button>

            {/* Opção Trimestre */}
            <button
              onClick={() => setTimeHorizon('TRIMESTRE')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center cursor-pointer ${
                timeHorizon === 'TRIMESTRE'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              Trimestre
            </button>

            {/* Opção Mês */}
            <button
              onClick={() => setTimeHorizon('MES')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center cursor-pointer min-h-[40px] sm:min-h-0 ${
                timeHorizon === 'MES'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              Mês
            </button>
          </div>

          {/* Sub-filtros quando Mês, Semestre ou Trimestre está selecionado */}
          <div className="flex items-center space-x-2 overflow-x-auto scrollbar-none max-w-full">
            {timeHorizon === 'MES' && (
              <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs overflow-x-auto scrollbar-none">
                {cashData.months.map((mName, mIdx) => (
                  <button
                    key={mIdx}
                    onClick={() => setSelectedMonth(mIdx)}
                    className={`px-2.5 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      selectedMonth === mIdx
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {mName}
                  </button>
                ))}
              </div>
            )}

            {timeHorizon === 'SEMESTRE' && (
              <div className="flex items-center space-x-1.5 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)]">
                <button
                  onClick={() => setSelectedSemester(1)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    selectedSemester === 1
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  1º Semestre (Jan - Jun)
                </button>
                <button
                  onClick={() => setSelectedSemester(2)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    selectedSemester === 2
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  2º Semestre (Jul - Dez)
                </button>
              </div>
            )}

            {timeHorizon === 'TRIMESTRE' && (
              <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)]">
                {([1, 2, 3, 4] as const).map(q => {
                  const qLabels = ['1T (Jan-Mar)', '2T (Abr-Jun)', '3T (Jul-Set)', '4T (Out-Dez)'];
                  return (
                    <button
                      key={q}
                      onClick={() => setSelectedQuarter(q)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        selectedQuarter === q
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {qLabels[q - 1]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Banner informativo de regime */}
        <div className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center space-x-2">
            <Wallet className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
            <span>
              Visão <strong>{mode}</strong> do Fluxo de Caixa para <strong>{horizonLabel}</strong>.
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {mode === 'REALIZADO'
              ? 'Considera liquidações bancárias efetivadas'
              : mode === 'PROJETADO'
              ? 'Considera títulos abertos pela data prevista de caixa'
              : 'Unifica histórico realizado com saldo futuro projetado'}
          </span>
        </div>
      </div>

      {/* Toast de Exportação de PDF */}
      {pdfToast && (
        <div className="bg-amber-500 text-slate-950 px-4 py-3 rounded-xl font-bold text-xs flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{pdfToast}</span>
          </div>
          <button
            onClick={() => setPdfToast(null)}
            className="text-slate-900 hover:text-black font-extrabold text-sm px-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Diagnóstico Executivo de Ponto Crítico de Liquidez */}
      {liquidityDiagnostic && (
        <div className={`p-4 rounded-2xl border transition-all shadow-xs ${
          liquidityDiagnostic.status === 'CRITICO'
            ? 'bg-rose-500/10 border-rose-500/40 text-rose-950 dark:text-rose-100'
            : liquidityDiagnostic.status === 'ALERTA'
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-950 dark:text-amber-100'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-100'
        }`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                liquidityDiagnostic.status === 'CRITICO'
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/50'
                  : liquidityDiagnostic.status === 'ALERTA'
                  ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/50'
                  : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/50'
              }`}>
                {liquidityDiagnostic.status === 'CRITICO' ? (
                  <AlertTriangle className="w-5 h-5 stroke-[2.5]" />
                ) : liquidityDiagnostic.status === 'ALERTA' ? (
                  <AlertCircle className="w-5 h-5 stroke-[2.5]" />
                ) : (
                  <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-[var(--text-primary)]">
                    {liquidityDiagnostic.status === 'CRITICO'
                      ? 'Ponto Crítico de Liquidez Detectado'
                      : liquidityDiagnostic.status === 'ALERTA'
                      ? 'Atenção à Margem de Segurança de Caixa'
                      : 'Liquidez Operacional Blindada'}
                  </span>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                    liquidityDiagnostic.status === 'CRITICO'
                      ? 'bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-500/40'
                      : liquidityDiagnostic.status === 'ALERTA'
                      ? 'bg-amber-500/20 text-amber-900 dark:text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border-emerald-500/40'
                  }`}>
                    {liquidityDiagnostic.status === 'CRITICO' ? 'Risco de Déficit' : liquidityDiagnostic.status === 'ALERTA' ? 'Margem Estreita' : 'Saudável'}
                  </span>
                </div>

                <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                  {liquidityDiagnostic.status === 'CRITICO' ? (
                    <>
                      Projeção indica <strong>saldo negativo em {liquidityDiagnostic.minMonthName} ({formatBRL(liquidityDiagnostic.minBalance)})</strong>.
                      Existem {liquidityDiagnostic.negativeMonthsCount} mês(es) com déficit de liquidez no período.
                      Recomendado negociar prazos de fornecedores, acionar linha de crédito ou antecipar recebíveis.
                    </>
                  ) : liquidityDiagnostic.status === 'ALERTA' ? (
                    <>
                      Menor saldo projetado ocorre em <strong>{liquidityDiagnostic.minMonthName} ({formatBRL(liquidityDiagnostic.minBalance)})</strong>,
                      abaixo da reserva prudencial recomendada de <strong>{formatBRL(liquidityDiagnostic.safetyBuffer)}</strong>.
                    </>
                  ) : (
                    <>
                      Ponto mínimo de caixa preservado em <strong>{formatBRL(liquidityDiagnostic.minBalance)} ({liquidityDiagnostic.minMonthName})</strong>.
                      A empresa mantém folga financeira em todos os meses analisados, sem risco de ruptura de liquidez.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <div className="text-right">
                <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold">Ponto Mais Baixo</span>
                <span className={`font-mono font-bold text-xs ${
                  liquidityDiagnostic.minBalance < 0 ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'
                }`}>
                  {formatBRL(liquidityDiagnostic.minBalance)} ({liquidityDiagnostic.minMonthName})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cards de Resumo Executivo do Período Filtrado (Adaptativo: 1 col celular, 2 col tablet, 3 col notebook, 5 col Mac/Desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {/* 1. Saldo Inicial */}
        <div className="bg-[var(--surface-card)] p-3.5 rounded-xl border border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] uppercase font-semibold">
            <span>Saldo Inicial</span>
            <Wallet className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </div>
          <div className="mt-2 text-lg font-mono font-bold text-[var(--text-primary)]">
            {formatBRL(periodKPIs.initialBalance)}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Abertura em {cashData.months[activeMonthIndices[0]]}/{effectiveYear}
          </span>
        </div>

        {/* 2. Total Entradas */}
        <div className="bg-emerald-500/[0.08] dark:bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-500/30 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-emerald-800 dark:text-emerald-400 uppercase font-semibold">
            <span>(+) Total Entradas</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className="mt-2 text-lg font-mono font-bold text-emerald-700 dark:text-emerald-300">
            {formatBRL(periodKPIs.totalInflows)}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Recebimentos no período
          </span>
        </div>

        {/* 3. Desembolsos Reais das Atividades (Operação + Inv + Dívidas) */}
        <div className="bg-amber-500/[0.08] dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-500/30 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-amber-900 dark:text-amber-400 uppercase font-semibold">
            <span>(-) Pagamento Real Atividades</span>
            <ArrowDownRight className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-lg font-mono font-bold text-amber-800 dark:text-amber-300">
            {formatBRL(periodKPIs.realActivitiesOutflows)}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Operacional + Imobilizado + Bancos
          </span>
        </div>

        {/* 4. Distribuição de Lucros aos Sócios */}
        <div className="bg-purple-500/[0.08] dark:bg-purple-950/20 p-3.5 rounded-xl border border-purple-500/30 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-purple-900 dark:text-purple-300 uppercase font-semibold">
            <span>(-) Distribuição de Lucros</span>
            <ArrowDownRight className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="mt-2 text-lg font-mono font-bold text-purple-800 dark:text-purple-200">
            {formatBRL(periodKPIs.profitDistributionOutflows)}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)]">
            Retiradas dos Sócios no Período
          </span>
        </div>

        {/* 5. Saldo Final */}
        <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border-2 border-[var(--border-highlight)] shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-primary)] uppercase font-bold">
            <span>(=) Saldo Final</span>
            <Wallet className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
          </div>
          <div className={`mt-2 text-lg font-mono font-bold ${periodKPIs.finalBalance >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
            {formatBRL(periodKPIs.finalBalance)}
          </div>
          <span className="text-[10px] text-[var(--text-secondary)] font-semibold">
            Fechamento em {cashData.months[activeMonthIndices[activeMonthIndices.length - 1]]}/{effectiveYear}
          </span>
        </div>
      </div>

      {/* Painel Estruturado das 3 Atividades (Operacional, Investimento e Financiamento) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Atividade Operacional */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">
              1. Atividades Operacionais
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
              Operação
            </span>
          </div>
          <div className="space-y-1.5 py-3 text-xs">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>(+) Caixa Gerado (Entradas):</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {formatBRL(periodKPIs.opInflows)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>(-) Caixa Consumido (Saídas):</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                {formatBRL(periodKPIs.opOutflows)}
              </span>
            </div>
          </div>
          <div className="border-t border-[var(--border-subtle)] pt-2.5 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              (=) Soma Operacional:
            </span>
            <span className={`font-mono font-extrabold text-sm ${periodKPIs.opNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {periodKPIs.opNet >= 0 ? '+' : ''}{formatBRL(periodKPIs.opNet)}
            </span>
          </div>
        </div>

        {/* Atividade de Investimento */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">
              2. Atividades de Investimento
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              Ativos / Aplicações
            </span>
          </div>
          <div className="space-y-1.5 py-3 text-xs">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>(+) Caixa Gerado (Resgates):</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {formatBRL(periodKPIs.invInflows)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>(-) Caixa Consumido (Aquisições):</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                {formatBRL(periodKPIs.invOutflows)}
              </span>
            </div>
          </div>
          <div className="border-t border-[var(--border-subtle)] pt-2.5 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              (=) Soma Investimento:
            </span>
            <span className={`font-mono font-extrabold text-sm ${periodKPIs.invNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {periodKPIs.invNet >= 0 ? '+' : ''}{formatBRL(periodKPIs.invNet)}
            </span>
          </div>
        </div>

        {/* Atividade de Financiamento */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-200">
              3. Atividades de Financiamento
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400">
              Empréstimos / Sócios
            </span>
          </div>
          <div className="space-y-1.5 py-3 text-xs">
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>(+) Caixa Gerado (Aportes/Créditos):</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {formatBRL(periodKPIs.finInflows)}
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
              <span>(-) Caixa Consumido (Amortizações/Lucros):</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                {formatBRL(periodKPIs.finOutflows)}
              </span>
            </div>
          </div>
          <div className="border-t border-[var(--border-subtle)] pt-2.5 flex justify-between items-center">
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              (=) Soma Financiamento:
            </span>
            <span className={`font-mono font-extrabold text-sm ${periodKPIs.finNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {periodKPIs.finNet >= 0 ? '+' : ''}{formatBRL(periodKPIs.finNet)}
            </span>
          </div>
        </div>
      </div>

      {/* Destaque Gerencial: Geração Pré-Sócios vs Retiradas */}
      <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
            <Scale className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Caixa Antes da Distribuição de Lucros:
              </span>
              <span className={`font-mono font-extrabold text-sm ${periodKPIs.netCashBeforeProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {periodKPIs.netCashBeforeProfit >= 0 ? '+' : ''}{formatBRL(periodKPIs.netCashBeforeProfit)}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Superávit de caixa puro gerado pelo negócio (Entradas menos Desembolsos Reais).
              {periodKPIs.profitDistributionOutflows > 0 ? (
                <> Foram retirados <strong>{formatBRL(periodKPIs.profitDistributionOutflows)}</strong> em lucros ({periodKPIs.profitPayoutRatio > 0 ? `${periodKPIs.profitPayoutRatio.toFixed(1)}% do caixa gerado` : 'consumindo reservas'}).</>
              ) : (
                <> Nenhuma distribuição de lucros realizada no período selecionado.</>
              )}
            </p>
          </div>
        </div>

        {/* Seletor de Visão de Segregação de Fluxos */}
        <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-medium self-stretch md:self-auto shrink-0">
          <button
            onClick={() => setFlowFilter('TODOS')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs ${
              flowFilter === 'TODOS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Exibir todas as rubricas contábeis e financeiras"
          >
            Todos os Fluxos
          </button>
          <button
            onClick={() => setFlowFilter('ATIVIDADES_REAIS')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs ${
              flowFilter === 'ATIVIDADES_REAIS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Excluir retiradas de lucros e focar no caixa das atividades da empresa"
          >
            Apenas Atividades Reais
          </button>
          <button
            onClick={() => setFlowFilter('DISTRIBUICAO_LUCROS')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer text-xs ${
              flowFilter === 'DISTRIBUICAO_LUCROS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title="Focar estritamente na remuneração dos sócios e capacidade de distribuição"
          >
            Apenas Lucros aos Sócios
          </button>
        </div>
      </div>

      {/* Tabela Estruturada do Fluxo de Caixa Direto */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
        {/* Alternador Rápido Mobile: Consolidado vs Analítico com Tap Target >= 40px */}
        <div className="p-2 sm:hidden bg-[var(--surface-card)] border-b border-[var(--border-subtle)]">
          <div className="grid grid-cols-2 p-1 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setViewMode('CONSOLIDADO')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[40px] flex items-center justify-center gap-1.5 ${
                viewMode === 'CONSOLIDADO' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Minimize2 className="w-4 h-4" />
              Consolidado
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ANALITICO')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[40px] flex items-center justify-center gap-1.5 ${
                viewMode === 'ANALITICO' ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Maximize2 className="w-4 h-4" />
              Analítico
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-[var(--text-primary)]">Matriz do Fluxo de Caixa</span>
            <span className="text-[11px] text-[var(--text-secondary)]">
              • Exibindo {displayedLines.length} rubricas em {activeMonthIndices.length} meses ({horizonLabel})
            </span>
          </div>
          {/* Seletor Segmentado Desktop: Consolidado vs Analítico */}
          <div className="hidden sm:flex items-center bg-[var(--surface-card)] p-0.5 rounded-xl border border-[var(--border-subtle)] text-xs shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('CONSOLIDADO')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'CONSOLIDADO'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Minimize2 className="w-3.5 h-3.5" />
              Consolidado
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ANALITICO')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'ANALITICO'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Analítico
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[720px]">
          <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-[#1b1b20] border-b border-slate-300 dark:border-slate-700 shadow-xs">
              <tr className="text-[11px] font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                <th className="py-3 px-2.5 sm:px-4 min-w-[145px] max-w-[165px] sm:min-w-[220px] sm:max-w-[260px] md:min-w-[300px] sticky left-0 bg-slate-100 dark:bg-[#1b1b20] z-30 border-r border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold shadow-sm">
                  Rubrica Financeira / Estrutura
                </th>

                {/* Colunas dos Meses Selecionados */}
                {activeMonthIndices.map(mIdx => {
                  const mName = cashData.months[mIdx];
                  return (
                    <th 
                      key={mIdx} 
                      className="py-3 px-2 text-right min-w-[95px] border-r border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold bg-slate-100 dark:bg-[#1b1b20]"
                    >
                      {mName}/{String(effectiveYear).substring(2)}
                    </th>
                  );
                })}

                {/* Coluna de Total do Período */}
                <th className="py-3 px-3 text-right font-extrabold text-slate-900 dark:text-slate-100 min-w-[130px] bg-slate-100 dark:bg-[#1b1b20] border-l-2 border-slate-300 dark:border-slate-700">
                  {totalColLabel}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {displayedLines.map(line => {
                const isSummary = line.isSummary;
                const isHeader = line.isHeader;
                const isFinalBalance = line.id === 'cf-final' || line.name.includes('SALDO FINAL');
                const isInitialBalance = line.id === 'cf-initial' || line.name.includes('SALDO INICIAL');
                const isOutflow = line.name.startsWith('(-)');
                const isActivityNet = line.id === 'cf-op-net' || line.id === 'cf-inv-net' || line.id === 'cf-fin-net';
                const isTotalNet = line.id === 'cf-net-variation';
                const isNetLine = isActivityNet || isTotalNet;
                const isCashBeforeProfit = line.id === 'cf-cash-before-profit';
                const isProfitLine = line.id === 'cf-profit-distribution' || line.id === 'cf-fin-out-profit';
                const isRealOutflowLine = line.id === 'cf-real-activities-outflows';
                const periodTotal = getLinePeriodTotal(line);

                let rowBg = 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40 text-slate-900 dark:text-slate-100';
                let stickyBg = 'bg-white dark:bg-[#131316] text-slate-900 dark:text-slate-100';

                if (isFinalBalance) {
                  rowBg = 'bg-slate-200 dark:bg-slate-900 text-slate-900 dark:text-white font-extrabold text-xs border-y-2 border-slate-400 dark:border-slate-600';
                  stickyBg = 'bg-slate-200 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-extrabold';
                } else if (isTotalNet) {
                  rowBg = 'bg-indigo-500/15 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100 font-extrabold text-xs border-y-2 border-indigo-500/50';
                  stickyBg = 'bg-indigo-100 dark:bg-[#1a1f3d] text-indigo-950 dark:text-indigo-100 font-extrabold';
                } else if (isActivityNet) {
                  rowBg = 'bg-blue-500/10 dark:bg-blue-950/30 text-slate-900 dark:text-slate-100 font-bold border-t-2 border-b-2 border-blue-300 dark:border-blue-800/70';
                  stickyBg = 'bg-blue-100 dark:bg-[#152338] text-slate-900 dark:text-slate-100 font-bold';
                } else if (isCashBeforeProfit) {
                  rowBg = 'bg-emerald-500/15 dark:bg-emerald-950/40 text-emerald-950 dark:text-emerald-100 font-extrabold text-xs border-y-2 border-emerald-500/40';
                  stickyBg = 'bg-emerald-100 dark:bg-[#13281e] text-emerald-950 dark:text-emerald-100 font-extrabold';
                } else if (isProfitLine) {
                  rowBg = 'bg-purple-500/10 dark:bg-purple-950/30 font-bold text-slate-900 dark:text-slate-100 border-l-4 border-l-purple-500';
                  stickyBg = 'bg-purple-100 dark:bg-[#20152b] text-slate-900 dark:text-slate-100 font-bold';
                } else if (isRealOutflowLine) {
                  rowBg = 'bg-amber-500/10 dark:bg-amber-950/20 font-bold text-slate-900 dark:text-slate-100 border-t border-b border-amber-500/30';
                  stickyBg = 'bg-amber-100 dark:bg-[#261f10] text-slate-900 dark:text-slate-100 font-bold';
                } else if (isInitialBalance) {
                  rowBg = 'bg-slate-50 dark:bg-slate-800/40 font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-700';
                  stickyBg = 'bg-slate-100 dark:bg-[#151c27] text-slate-900 dark:text-slate-100 font-semibold';
                } else if (isHeader) {
                  rowBg = 'bg-slate-100 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-xs border-t-2 border-slate-300 dark:border-slate-700';
                  stickyBg = 'bg-slate-200 dark:bg-[#1e2738] text-slate-900 dark:text-slate-100 font-bold';
                } else if (isSummary) {
                  rowBg = 'bg-slate-100/90 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-slate-100 border-t border-b border-slate-300 dark:border-slate-700';
                  stickyBg = 'bg-slate-200 dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 font-bold';
                }

                return (
                  <tr key={line.id} className={`${rowBg} transition-colors`}>
                    {/* Nome da Rubrica com Recuo Hierárquico */}
                    <td 
                      className={`py-2 px-2.5 sm:px-4 sticky left-0 z-10 border-r border-slate-200 dark:border-slate-700 shadow-sm min-w-[145px] max-w-[165px] sm:min-w-[220px] sm:max-w-[260px] md:min-w-[300px] ${stickyBg}`}
                      style={{ paddingLeft: `${Math.min(line.level * 8 + 8, 24)}px` }}
                    >
                      <div className="flex items-center space-x-1.5 sm:space-x-2 truncate min-w-0">
                        {line.code && (
                          <span className="font-mono text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-semibold shrink-0">
                            {line.code}
                          </span>
                        )}
                        <span className="truncate text-slate-900 dark:text-slate-100 font-semibold" title={line.name}>
                          {line.name}
                        </span>
                      </div>
                    </td>

                    {/* Valores dos Meses */}
                    {activeMonthIndices.map(mIdx => {
                      const val = line.valuesByMonth[mIdx] || 0;
                      const isEven = mIdx % 2 === 0;

                      let cellColor = 'text-slate-900 dark:text-slate-100 font-medium';
                      if (isHeader) {
                        cellColor = 'text-slate-400 dark:text-slate-500 font-normal';
                      } else if (val === 0) {
                        cellColor = 'text-slate-400 dark:text-slate-500 font-normal';
                      } else if (isFinalBalance) {
                        cellColor = val >= 0 ? 'text-emerald-800 dark:text-emerald-300 font-black' : 'text-rose-800 dark:text-rose-300 font-black';
                      } else if (isTotalNet) {
                        cellColor = val >= 0 ? 'text-indigo-900 dark:text-indigo-300 font-black' : 'text-rose-800 dark:text-rose-300 font-black';
                      } else if (isActivityNet) {
                        cellColor = val >= 0 ? 'text-emerald-800 dark:text-emerald-300 font-black' : 'text-rose-800 dark:text-rose-300 font-black';
                      } else if (isCashBeforeProfit) {
                        cellColor = val >= 0 ? 'text-emerald-700 dark:text-emerald-300 font-black' : 'text-rose-700 dark:text-rose-300 font-black';
                      } else if (isProfitLine) {
                        cellColor = 'text-purple-800 dark:text-purple-300 font-bold';
                      } else if (isRealOutflowLine) {
                        cellColor = 'text-amber-800 dark:text-amber-300 font-bold';
                      } else if (isInitialBalance) {
                        cellColor = 'text-slate-900 dark:text-slate-100 font-bold';
                      } else if (isOutflow && val > 0) {
                        cellColor = 'text-rose-700 dark:text-rose-400 font-bold';
                      } else if (!isOutflow && val > 0 && !isInitialBalance) {
                        cellColor = 'text-emerald-700 dark:text-emerald-400 font-bold';
                      }

                      const cellBg = (isFinalBalance || isHeader || isSummary || isNetLine || isCashBeforeProfit || isProfitLine || isRealOutflowLine) 
                        ? '' 
                        : (isEven ? 'bg-slate-50/40 dark:bg-white/[0.02]' : '');

                      return (
                        <td 
                          key={mIdx} 
                          className={`py-2 px-2 text-right font-mono border-r border-slate-200/60 dark:border-slate-800/60 ${cellColor} ${cellBg}`}
                        >
                          {isHeader ? '-' : (val !== 0 ? formatBRL(Math.abs(val)) : '-')}
                        </td>
                      );
                    })}

                    {/* Total do Período Filtrado */}
                    <td className={`py-2 px-3 text-right font-bold font-mono border-l-2 ${
                      isHeader
                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400 dark:text-slate-500 font-normal text-center'
                        : isFinalBalance
                        ? 'bg-slate-200 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sm ' + (periodTotal >= 0 ? 'text-emerald-800 dark:text-emerald-300 font-black' : 'text-rose-800 dark:text-rose-300 font-black')
                        : isTotalNet
                        ? 'bg-indigo-500/20 dark:bg-indigo-950/60 border-indigo-500/40 text-sm ' + (periodTotal >= 0 ? 'text-indigo-900 dark:text-indigo-200 font-black' : 'text-rose-800 dark:text-rose-300 font-black')
                        : isActivityNet
                        ? 'bg-blue-500/20 dark:bg-blue-950/60 border-blue-400/50 text-sm ' + (periodTotal >= 0 ? 'text-emerald-800 dark:text-emerald-300 font-black' : 'text-rose-800 dark:text-rose-300 font-black')
                        : isCashBeforeProfit
                        ? 'bg-emerald-500/20 dark:bg-emerald-950/60 border-emerald-500/40 text-sm ' + (periodTotal >= 0 ? 'text-emerald-700 dark:text-emerald-300 font-black' : 'text-rose-700 dark:text-rose-300 font-black')
                        : isProfitLine
                        ? 'bg-purple-500/15 dark:bg-purple-950/40 border-purple-500/30 text-purple-800 dark:text-purple-200 font-bold'
                        : isRealOutflowLine
                        ? 'bg-amber-500/15 dark:bg-amber-950/30 border-amber-500/30 text-amber-800 dark:text-amber-200 font-bold'
                        : isSummary
                        ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold'
                        : 'bg-slate-50/80 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                    }`}>
                      {isHeader ? '-' : formatBRL(Math.abs(periodTotal))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
