import React, { useState, useMemo } from 'react';
import { 
  Sliders, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  ShieldAlert, 
  DollarSign, 
  Calendar, 
  Clock, 
  ArrowRight, 
  FileSpreadsheet, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  Zap, 
  BarChart2, 
  Percent, 
  Info, 
  Copy, 
  Check,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { StressTestingEngine, StressTestParams, StressTestResult } from '../../services/stressTestingEngine';
import { formatBRL } from '../../services/financialEngine';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';

interface StressTestingViewProps {
  onNavigateScreen?: (screen: any) => void;
}

export const StressTestingView: React.FC<StressTestingViewProps> = ({
  onNavigateScreen
}) => {
  // Parâmetros do teste de estresse
  const [churnRate, setChurnRate] = useState<number>(5);
  const [delayDays, setDelayDays] = useState<number>(10);
  const [expenseInflation, setExpenseInflation] = useState<number>(5);
  const [activePreset, setActivePreset] = useState<'BASE' | 'MODERADO' | 'SEVERO' | 'PIOR_CASO' | 'CUSTOM'>('MODERADO');
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Seleção rápida de cenário pré-definido
  const handleApplyPreset = (preset: 'BASE' | 'MODERADO' | 'SEVERO' | 'PIOR_CASO') => {
    const p = StressTestingEngine.getScenarioPreset(preset);
    setChurnRate(p.churnRatePct);
    setDelayDays(p.delayDays);
    setExpenseInflation(p.expenseInflationPct);
    setActivePreset(preset);
  };

  const handleSliderChange = (setter: React.Dispatch<React.SetStateAction<number>>, value: number) => {
    setter(value);
    setActivePreset('CUSTOM');
  };

  // Executa o cálculo da simulação de estresse de 180 dias
  const result: StressTestResult = useMemo(() => {
    const params: StressTestParams = {
      churnRatePct: churnRate,
      delayDays: delayDays,
      expenseInflationPct: expenseInflation,
      scenarioPreset: activePreset === 'CUSTOM' ? 'PERSONALIZADO' : activePreset
    };
    return StressTestingEngine.runStressTest(params);
  }, [churnRate, delayDays, expenseInflation, activePreset]);

  // Exportação para Excel
  const handleExportExcel = () => {
    const headers = [
      'Mês Projeção',
      'Período',
      'Receita Base (R$)',
      'Perda Churn (R$)',
      'Receita Represada Mora (R$)',
      'Receita Realizada (R$)',
      'Despesas Projetadas (R$)',
      'Saldo Líquido Mês (R$)',
      'Saldo Final Caixa (R$)',
      'Déficit no Mês?'
    ];

    const rows = result.projections.map(p => [
      `Mês ${p.monthIndex}`,
      p.monthLabel,
      p.baseRevenue,
      p.revenueLostToChurn,
      p.revenueDelayed,
      p.revenueRealizedInMonth,
      p.stressedExpenses,
      p.stressedNetCash,
      p.stressedEndBalance,
      p.isNegativeBalance ? 'SIM (DÉFICIT)' : 'NÃO (POSITIVO)'
    ]);

    exportToExcel(
      `simulacao-estresse-caixa-180d-${new Date().toISOString().split('T')[0]}`,
      'Estresse 180 Dias',
      headers,
      rows
    );
  };

  // Exportação para CSV
  const handleExportCSV = () => {
    const headers = [
      'Mes',
      'Periodo',
      'Receita_Base',
      'Perda_Churn',
      'Mora_Atraso',
      'Receita_Realizada',
      'Despesas',
      'Saldo_Liquido',
      'Saldo_Final_Caixa',
      'Status_Deficit'
    ];

    const rows = result.projections.map(p => [
      p.monthIndex,
      p.monthLabel,
      p.baseRevenue,
      p.revenueLostToChurn,
      p.revenueDelayed,
      p.revenueRealizedInMonth,
      p.stressedExpenses,
      p.stressedNetCash,
      p.stressedEndBalance,
      p.isNegativeBalance ? 'DEFICIT' : 'POSITIVO'
    ]);

    exportToCSV(`simulacao-estresse-caixa-180d-${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  // Copiar resumo executivo para área de transferência
  const handleCopySummary = () => {
    const text = [
      `📊 SIMULAÇÃO DE ESTRESSE DE CAIXA E CHURN (180 DIAS) - CONTAJU`,
      `------------------------------------------------------------`,
      `• Cenário: ${activePreset === 'CUSTOM' ? 'Personalizado' : activePreset}`,
      `• Parâmetros: Churn ${churnRate}%/mês | Mora ${delayDays} dias | Inflação Custos ${expenseInflation}%`,
      `• Saldo Atual de Partida: ${formatBRL(result.startingCashBalance)}`,
      `• Saldo Mínimo Projetado: ${formatBRL(result.minimumStressedCash)}`,
      `• Necessidade de Capital de Giro (NCG): ${formatBRL(result.workingCapitalNeeded)}`,
      `• Perda Acumulada por Churn: ${formatBRL(result.totalRevenueLostToChurn)}`,
      `• Cash Runway: ${result.cashRunwayMonths ? `Déficit no ${result.cashRunwayMonths}º mês` : 'Superior a 6 meses (Saudável)'}`,
      `\nDiagnóstico: ${result.summaryText}`
    ].join('\n');

    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  // Renderização do gráfico SVG vetorial (Curva Base vs Curva Estressada)
  const svgGraph = useMemo(() => {
    const allBalances = [
      result.startingCashBalance,
      ...result.projections.map(p => p.baseEndBalance),
      ...result.projections.map(p => p.stressedEndBalance)
    ];
    const maxVal = Math.max(...allBalances, 1000);
    const minVal = Math.min(...allBalances, -1000);
    const range = maxVal - minVal || 1;

    const width = 800;
    const height = 240;
    const padX = 50;
    const padY = 30;
    const plotWidth = width - padX * 2;
    const plotHeight = height - padY * 2;

    const getY = (val: number) => {
      const norm = (val - minVal) / range;
      return height - padY - norm * plotHeight;
    };

    const getX = (idx: number) => {
      // idx 0 = Início, 1..6 = Meses
      return padX + (idx / 6) * plotWidth;
    };

    const zeroY = getY(0);

    // Pontos da linha base
    const basePoints = [
      { x: getX(0), y: getY(result.startingCashBalance), val: result.startingCashBalance, label: 'Hoje' },
      ...result.projections.map((p, idx) => ({
        x: getX(idx + 1),
        y: getY(p.baseEndBalance),
        val: p.baseEndBalance,
        label: p.monthLabel
      }))
    ];

    // Pontos da linha estressada
    const stressedPoints = [
      { x: getX(0), y: getY(result.startingCashBalance), val: result.startingCashBalance, label: 'Hoje' },
      ...result.projections.map((p, idx) => ({
        x: getX(idx + 1),
        y: getY(p.stressedEndBalance),
        val: p.stressedEndBalance,
        label: p.monthLabel
      }))
    ];

    const basePolyline = basePoints.map(pt => `${pt.x},${pt.y}`).join(' ');
    const stressedPolyline = stressedPoints.map(pt => `${pt.x},${pt.y}`).join(' ');

    return {
      width,
      height,
      zeroY,
      basePoints,
      stressedPoints,
      basePolyline,
      stressedPolyline,
      minVal,
      maxVal
    };
  }, [result]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* 1. Header do Módulo */}
      <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ShieldAlert className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                Simulador de Estresse de Liquidez e Churn (180 Dias)
              </h2>
              <span className="text-[11px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-bold">
                Stress Testing Semestral
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Simule a resiliência do caixa projetando o impacto acumulado de cancelamentos de contratos (Churn), atrasos médios de recebimento (Mora) e inflação de custos operacionais nos próximos 6 meses.
            </p>
          </div>

          <div className="flex items-center space-x-2 flex-wrap">
            <button
              onClick={handleCopySummary}
              className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium transition-colors flex items-center cursor-pointer shadow-2xs"
              title="Copiar sumário do teste de estresse"
            >
              {copiedSummary ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1.5 text-[var(--text-secondary)]" />
                  Copiar Resumo
                </>
              )}
            </button>

            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
              Excel
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium transition-colors flex items-center cursor-pointer shadow-2xs"
            >
              <Download className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
              CSV
            </button>
          </div>
        </div>

        {/* Pílulas de Cenários 1-Click */}
        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3 flex-wrap gap-2">
          <div className="flex items-center space-x-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mr-2">
              Cenários Pré-Configurados:
            </span>

            <button
              onClick={() => handleApplyPreset('BASE')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activePreset === 'BASE'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-xs'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              🌱 Cenário Base (Churn 1%, Mora 0d, Custos 0%)
            </button>

            <button
              onClick={() => handleApplyPreset('MODERADO')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activePreset === 'MODERADO'
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-xs'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              ⚠️ Alerta Moderado (Churn 5%, Mora 10d, Custos +5%)
            </button>

            <button
              onClick={() => handleApplyPreset('SEVERO')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activePreset === 'SEVERO'
                  ? 'bg-orange-500 text-slate-950 font-bold shadow-xs'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              🔥 Estresse Severo (Churn 15%, Mora 20d, Custos +10%)
            </button>

            <button
              onClick={() => handleApplyPreset('PIOR_CASO')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activePreset === 'PIOR_CASO'
                  ? 'bg-rose-500 text-white font-bold shadow-xs'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              🚨 Pior Caso / Crise (Churn 25%, Mora 35d, Custos +15%)
            </button>

            {activePreset === 'CUSTOM' && (
              <span className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                ⚙️ Cenário Personalizado
              </span>
            )}
          </div>

          <div className="text-[11px] text-[var(--text-secondary)] font-mono">
            Saldo Atual de Caixa: <span className="font-bold text-[var(--text-primary)]">{formatBRL(result.startingCashBalance)}</span>
          </div>
        </div>
      </div>

      {/* 2. Sliders de Ajuste Interativo */}
      <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Parâmetros de Estresse Financeiro (Ajuste em Tempo Real)
            </h3>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Altere os seletores para projetar impactos instantâneos
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Slider 1: Churn Rate */}
          <div className="space-y-2 p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center">
                <Percent className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                Taxa de Churn Mensal:
              </label>
              <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                churnRate >= 15 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                churnRate >= 5 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {churnRate.toFixed(1)}% ao mês
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="35"
              step="0.5"
              value={churnRate}
              onChange={(e) => handleSliderChange(setChurnRate, parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono">
              <span>0% (Zero Churn)</span>
              <span>15% (Crise)</span>
              <span>35% (Extremo)</span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] leading-tight pt-1">
              Percentual mensal composto de cancelamentos sobre a receita recorrente da carteira de contratos.
            </p>
          </div>

          {/* Slider 2: Dias de Atraso Médio */}
          <div className="space-y-2 p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center">
                <Clock className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                Dias Adicionais de Mora/Atraso:
              </label>
              <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                delayDays >= 20 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                delayDays >= 10 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                +{delayDays} dias
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="45"
              step="1"
              value={delayDays}
              onChange={(e) => handleSliderChange(setDelayDays, parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono">
              <span>0d (Pontual)</span>
              <span>15d (Moderado)</span>
              <span>45d (Crítico)</span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] leading-tight pt-1">
              Atraso médio no pagamento dos honorários, diferindo entradas de caixa para os meses subsequentes.
            </p>
          </div>

          {/* Slider 3: Variação de Despesas Operacionais */}
          <div className="space-y-2 p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center">
                <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                Inflação / Variação de Custos:
              </label>
              <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                expenseInflation >= 10 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                expenseInflation > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                {expenseInflation > 0 ? `+${expenseInflation}%` : `${expenseInflation}%`}
              </span>
            </div>
            <input
              type="range"
              min="-10"
              max="30"
              step="1"
              value={expenseInflation}
              onChange={(e) => handleSliderChange(setExpenseInflation, parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] font-mono">
              <span>-10% (Corte)</span>
              <span>0% (Estável)</span>
              <span>+30% (Expansão)</span>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] leading-tight pt-1">
              Oscilação ou aumento de despesas operacionais fixas (folha, softwares, estrutura, contratações).
            </p>
          </div>
        </div>
      </div>

      {/* 3. Cards de Indicadores de Estresse */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Saldo Mínimo de Caixa Projetado */}
        <div className={`p-4 rounded-xl border transition-all ${
          result.minimumStressedCash < 0
            ? 'bg-rose-500/10 border-rose-500/30'
            : 'bg-[var(--surface-card)] border-[var(--border-subtle)]'
        }`}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Saldo Mínimo de Caixa</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              result.minimumStressedCash < 0
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {result.minimumStressedCash < 0 ? 'Déficit Previsto' : 'Reserva Positiva'}
            </span>
          </div>
          <div className={`text-xl font-bold font-mono tracking-tight ${
            result.minimumStressedCash < 0 ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {formatBRL(result.minimumStressedCash)}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1 flex items-center">
            {result.minimumStressedCash < 0 ? (
              <span className="text-rose-400 font-semibold flex items-center">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Caixa entra no vermelho
              </span>
            ) : (
              <span className="text-emerald-400 font-medium flex items-center">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Piso de segurança preservado
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Necessidade de Capital de Giro (NCG) */}
        <div className={`p-4 rounded-xl border transition-all ${
          result.workingCapitalNeeded > 0
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-[var(--surface-card)] border-[var(--border-subtle)]'
        }`}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Aporte Necessário (NCG)</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              result.workingCapitalNeeded > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
            }`}>
              {result.workingCapitalNeeded > 0 ? 'Exige Capital' : 'Autossuficiente'}
            </span>
          </div>
          <div className={`text-xl font-bold font-mono tracking-tight ${
            result.workingCapitalNeeded > 0 ? 'text-amber-400' : 'text-emerald-400'
          }`}>
            {formatBRL(result.workingCapitalNeeded)}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">
            {result.workingCapitalNeeded > 0 
              ? 'Crédito ou aporte necessário para cobrir o pior mês' 
              : 'Nenhum aporte financeiro emergencial exigido'}
          </div>
        </div>

        {/* Card 3: Cash Runway (Sobrevida de Caixa) */}
        <div className={`p-4 rounded-xl border transition-all ${
          result.cashRunwayMonths !== null && result.cashRunwayMonths <= 3
            ? 'bg-rose-500/10 border-rose-500/30'
            : result.cashRunwayMonths !== null
            ? 'bg-amber-500/10 border-amber-500/30'
            : 'bg-[var(--surface-card)] border-[var(--border-subtle)]'
        }`}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Cash Runway (Sobrevida)</span>
            <Clock className={`w-4 h-4 ${
              result.cashRunwayMonths !== null ? 'text-rose-400' : 'text-emerald-400'
            }`} />
          </div>
          <div className={`text-xl font-bold font-mono tracking-tight ${
            result.cashRunwayMonths !== null ? 'text-rose-400' : 'text-emerald-400'
          }`}>
            {result.cashRunwayMonths !== null
              ? `${result.cashRunwayMonths}º Mês (${result.projections[result.cashRunwayMonths - 1]?.monthLabel})`
              : '> 6 Meses'}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">
            {result.cashRunwayMonths !== null
              ? 'Ponto de ruptura estimado se o estresse persistir'
              : 'Caixa suporta todo o semestre sem romper'}
          </div>
        </div>

        {/* Card 4: Perda Acumulada de Receita por Churn */}
        <div className="p-4 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Perda de Receita por Churn</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-400 tracking-tight">
            -{formatBRL(result.totalRevenueLostToChurn)}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">
            Receita que deixará de ingressar nos próximos 180 dias
          </div>
        </div>

      </div>

      {/* 4. Gráfico Visual Vetorial (SVG) de Projeção Comparativa */}
      <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[var(--border-subtle)] pb-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center">
              <BarChart2 className="w-4 h-4 mr-2 text-amber-400" />
              Trajetória de Liquidez Projetada (Curva Base vs Curva Sob Estresse)
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Evolução do saldo de caixa acumulado mês a mês nos próximos 180 dias.
            </p>
          </div>

          {/* Legenda */}
          <div className="flex items-center space-x-4 text-xs font-medium">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
              <span className="text-[var(--text-secondary)]">Cenário Base (Sem Estresse)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span>
              <span className="text-[var(--text-secondary)]">Cenário Estressado</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-rose-500 border-t border-dashed border-rose-500 inline-block"></span>
              <span className="text-[var(--text-secondary)]">Ponto Zero / Ruptura</span>
            </div>
          </div>
        </div>

        {/* Container responsivo do SVG */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[650px] py-2">
            <svg
              viewBox={`0 0 ${svgGraph.width} ${svgGraph.height}`}
              className="w-full h-auto overflow-visible select-none"
            >
              <defs>
                <linearGradient id="stressedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Linha Zero (Break-even de Insolvência) */}
              {svgGraph.zeroY >= 20 && svgGraph.zeroY <= svgGraph.height - 20 && (
                <g>
                  <line
                    x1="40"
                    y1={svgGraph.zeroY}
                    x2={svgGraph.width - 40}
                    y2={svgGraph.zeroY}
                    stroke="#f43f5e"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                  <text
                    x={svgGraph.width - 35}
                    y={svgGraph.zeroY + 4}
                    fill="#f43f5e"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="start"
                  >
                    R$ 0 (Insolvência)
                  </text>
                </g>
              )}

              {/* Linha 1: Cenário Base (Verde / Emerald) */}
              <polyline
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeDasharray="5 5"
                points={svgGraph.basePolyline}
              />

              {/* Linha 2: Cenário Estressado (Âmbar / Rosa) */}
              <polyline
                fill="none"
                stroke="#cdaa58"
                strokeWidth="3.5"
                points={svgGraph.stressedPolyline}
              />

              {/* Pontos e Rótulos do Cenário Base */}
              {svgGraph.basePoints.map((pt, i) => (
                <g key={`base-${i}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill="#10b981"
                    stroke="#020617"
                    strokeWidth="2"
                  />
                  {i > 0 && (
                    <text
                      x={pt.x}
                      y={pt.y - 10}
                      fill="#10b981"
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {formatBRL(pt.val).replace('R$', '').trim()}
                    </text>
                  )}
                </g>
              ))}

              {/* Pontos e Rótulos do Cenário Estressado */}
              {svgGraph.stressedPoints.map((pt, i) => (
                <g key={`stressed-${i}`}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={pt.val < 0 ? '6' : '5'}
                    fill={pt.val < 0 ? '#f43f5e' : '#cdaa58'}
                    stroke="#020617"
                    strokeWidth="2"
                  />
                  <text
                    x={pt.x}
                    y={pt.val < 0 ? pt.y + 16 : pt.y - 12}
                    fill={pt.val < 0 ? '#f43f5e' : '#fbbf24'}
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {formatBRL(pt.val)}
                  </text>
                  <text
                    x={pt.x}
                    y={svgGraph.height - 8}
                    fill="var(--text-secondary)"
                    fontSize="11"
                    fontWeight="500"
                    textAnchor="middle"
                  >
                    {pt.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Resumo Dinâmico do Diagnóstico */}
        <div className={`p-4 rounded-xl border flex items-start space-x-3 ${
          result.isCriticalSolvencyRisk
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
        }`}>
          {result.isCriticalSolvencyRisk ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 text-xs">
            <span className="font-bold uppercase tracking-wider block text-[11px]">
              Diagnóstico Estratégico de Caixa:
            </span>
            <p className="leading-relaxed">
              {result.summaryText}
            </p>
          </div>
        </div>
      </div>

      {/* 5. Tabela Comparativa Analítica Mês a Mês (6 Meses) */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center">
              <Calendar className="w-4 h-4 mr-2 text-amber-400" />
              Detalhamento Mensal da Projeção de 180 Dias
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Composição analítica de receita retida, perdas por cancelamento, mora e evolução do saldo acumulado.
            </p>
          </div>

          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
            6 Meses Futuros
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] uppercase tracking-wider font-semibold text-[10px]">
                <th className="py-3 px-3.5">Mês / Competência</th>
                <th className="py-3 px-3 text-right">MRR Base</th>
                <th className="py-3 px-3 text-right">Perda por Churn</th>
                <th className="py-3 px-3 text-right">Atraso / Mora</th>
                <th className="py-3 px-3 text-right text-amber-400">Receita Realizada</th>
                <th className="py-3 px-3 text-right text-rose-400">Despesas Operacionais</th>
                <th className="py-3 px-3 text-right">Saldo do Mês</th>
                <th className="py-3 px-3 text-right font-bold">Saldo Final Caixa</th>
                <th className="py-3 px-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {result.projections.map((p) => (
                <tr 
                  key={p.monthIndex}
                  className={`hover:bg-[var(--surface-elevated)]/50 transition-colors ${
                    p.isNegativeBalance ? 'bg-rose-500/5' : ''
                  }`}
                >
                  {/* Mês */}
                  <td className="py-3 px-3.5 font-medium text-[var(--text-primary)]">
                    <div className="flex items-center space-x-2">
                      <span className="w-5 h-5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center font-mono text-[10px] text-amber-400 font-bold">
                        {p.monthIndex}
                      </span>
                      <div>
                        <div className="font-bold">{p.monthLabel}</div>
                        <div className="text-[10px] text-[var(--text-secondary)] font-mono">{p.yearMonth}</div>
                      </div>
                    </div>
                  </td>

                  {/* MRR Base */}
                  <td className="py-3 px-3 text-right font-mono text-[var(--text-secondary)]">
                    {formatBRL(p.baseRevenue)}
                  </td>

                  {/* Perda Churn */}
                  <td className="py-3 px-3 text-right font-mono text-rose-400">
                    -{formatBRL(p.revenueLostToChurn)}
                  </td>

                  {/* Atraso Mora */}
                  <td className="py-3 px-3 text-right font-mono text-amber-400/90">
                    {formatBRL(p.revenueDelayed)}
                  </td>

                  {/* Receita Realizada */}
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-300">
                    {formatBRL(p.revenueRealizedInMonth)}
                  </td>

                  {/* Despesas */}
                  <td className="py-3 px-3 text-right font-mono text-rose-400">
                    {formatBRL(p.stressedExpenses)}
                  </td>

                  {/* Saldo Líquido do Mês */}
                  <td className={`py-3 px-3 text-right font-mono font-semibold ${
                    p.isDeficit ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {p.isDeficit ? '' : '+'}
                    {formatBRL(p.stressedNetCash)}
                  </td>

                  {/* Saldo Acumulado em Caixa */}
                  <td className={`py-3 px-3 text-right font-mono font-bold ${
                    p.isNegativeBalance ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {formatBRL(p.stressedEndBalance)}
                  </td>

                  {/* Status Badge */}
                  <td className="py-3 px-3.5 text-center">
                    {p.isNegativeBalance ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                        Déficit
                      </span>
                    ) : p.isDeficit ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Consumo Reserva
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        Superávit
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Matriz de Medidas Preventivas e Plano de Ação */}
      <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <div className="flex items-center space-x-2 border-b border-[var(--border-subtle)] pb-3">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Plano de Mitigação Preventiva Recomendado para a Diretoria
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-xs font-bold text-amber-400 flex items-center">
              1. Combate Ativo ao Churn
            </span>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Monitore de perto os clientes no radar de risco pelo Health Score. Clientes com atrasos superiores a 15 dias devem receber contato proativo do Customer Success para repactuação antes do cancelamento formal.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-xs font-bold text-amber-400 flex items-center">
              2. Redução do Prazo de Recebimento
            </span>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Implemente lembretes automáticos prévios de vencimento via WhatsApp/e-mail (D-3, D0 e D+2). Cada dia a menos no prazo médio de recebimento preserva a liquidez imediata e adia a necessidade de capital de giro.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1.5">
            <span className="text-xs font-bold text-amber-400 flex items-center">
              3. Gestão e Travamento de Custos Fixos
            </span>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Em cenários com previsão de déficit, congele novas contratações e revisite contratos de fornecedores de software e licenças com baixa utilização, mantendo o ponto de equilíbrio operacional compatível com o MRR.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
