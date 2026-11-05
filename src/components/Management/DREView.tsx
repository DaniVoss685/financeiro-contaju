import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  BarChart3, 
  Download, 
  FileSpreadsheet, 
  Layers, 
  ChevronRight, 
  ChevronDown, 
  Eye, 
  EyeOff,
  Info, 
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Percent,
  Maximize2,
  Minimize2,
  Calendar,
  Scale,
  Sparkles,
  PieChart,
  FileText,
  Target,
  Users,
  AlertTriangle,
  Building2,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  Sliders,
  Presentation,
  Activity,
  CheckCircle2,
  Printer,
  Network,
  Pencil,
  Lock
} from 'lucide-react';
import { ReportingEngine, DREMatrix, DRELineItem, DRERegime } from '../../services/reportingEngine';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { BudgetEngine } from '../../services/budgetEngine';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { exportDREToPDF } from '../../utils/pdfExportUtils';
import { FinancialTitle } from '../../types';
import { storage } from '../../services/storageService';
import { useGlobalPeriod } from '../../hooks/useGlobalPeriod';
import { toast } from '../../hooks/useToast';
import { EditTitleModal } from '../Modals/EditTitleModal';
import { GlobalPeriodBanner } from '../Common/GlobalPeriodBanner';
import { DREWhatIfModal, WhatIfScenario } from './DREWhatIfModal';
import { DREOnePageSummaryModal } from './DREOnePageSummaryModal';
import { DRECashReconciliationEngine, DRECashReconciliationSummary } from '../../services/reconciliationEngine';

export interface DREViewProps {
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  onNavigate?: (screen: string) => void;
}

type ValueDisplayMode = 'INTEIRO' | 'CENTAVOS' | 'MILHARES';

/**
 * Minigráfico Sparkline vetorial ultraleve para curvas de tendência de receitas e despesas
 */
interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  isNetResult?: boolean;
}

const Sparkline: React.FC<SparklineProps> = ({ values, width = 46, height = 15, isNetResult }) => {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  if (range === 0) {
    return (
      <svg width={width} height={height} className="overflow-visible inline-block opacity-40">
        <line x1="2" y1={height / 2} x2={width - 2} y2={height / 2} stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
      </svg>
    );
  }

  const padding = 2;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastVal = values[values.length - 1];
  const firstVal = values[0];
  const isTrendingUp = lastVal >= firstVal;
  const strokeColor = isNetResult 
    ? (lastVal >= 0 ? '#10B981' : '#F43F5E')
    : (isTrendingUp ? '#cdaa58' : '#94A3B8');

  const lastX = width - padding;
  const lastY = height - padding - ((lastVal - min) / range) * (height - padding * 2);

  return (
    <svg width={width} height={height} className="overflow-visible inline-block" title={`Tendência • Início: ${formatBRL(firstVal)} ➔ Fim: ${formatBRL(lastVal)}`}>
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r="2" fill={strokeColor} />
    </svg>
  );
};

export const DREView: React.FC<DREViewProps> = ({ isFocusMode, onToggleFocusMode, onNavigate }) => {
  const currentYear = new Date().getFullYear();
  const { period } = useGlobalPeriod();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const effectiveYear = period.active ? period.year : selectedYear;
  const [timeHorizon, setTimeHorizon] = useState<'ANO' | 'SEMESTRE' | 'TRIMESTRE' | 'MES'>('ANO');
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(1);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

  // Detecção de viewport mobile para desativar fitToScreen forçado em telas < 640px
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' ? window.innerWidth < 640 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Estados de visualização:
  // 1. Expandido vs Recolhido (Recolhido exibe apenas os títulos das categorias principais e análises de resultados, sem subcategorias)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // 2. Compactação e densidade para ver os 12 meses lado a lado em uma tela só
  const [valueDisplayMode, setValueDisplayMode] = useState<ValueDisplayMode>('INTEIRO');
  const [fitToScreen, setFitToScreen] = useState<boolean>(true);

  // 3. Recursos de produtividade e análise avançada (Sugestões 3, 4 e 5)
  const [hideZeroRows, setHideZeroRows] = useState<boolean>(false);
  const [showSparklines, setShowSparklines] = useState<boolean>(true);
  const [showBudgetVariance, setShowBudgetVariance] = useState<boolean>(false);
  const [showHorizontalAnalysis, setShowHorizontalAnalysis] = useState<boolean>(false); // Sugestão 4: Análise Horizontal MoM %
  const [showColumnPercentages, setShowColumnPercentages] = useState<boolean>(false); // Opção de % nas colunas mensais (Análise Vertical)
  const [pdfToast, setPdfToast] = useState<string | null>(null);

  // Sugestão 1: Simulação What-If (Stress Testing & Cenários de Sensibilidade)
  const [showWhatIfModal, setShowWhatIfModal] = useState<boolean>(false);
  const [activeWhatIfScenario, setActiveWhatIfScenario] = useState<WhatIfScenario | null>(null);

  // Sugestão 2: Conciliação Caixa vs Competência (DRE x DFC)
  const [showCashReconciliation, setShowCashReconciliation] = useState<boolean>(false);

  // Sugestão 5: Sumário Executivo One-Pager
  const [showOnePageModal, setShowOnePageModal] = useState<boolean>(false);

  const [drillDownItem, setDrillDownItem] = useState<{
    line: DRELineItem;
    monthIdx: number; // -1 for full year/period
    monthName: string;
    regimeMode: 'COMPETENCIA' | 'CAIXA';
  } | null>(null);
  const [drillDownTab, setDrillDownTab] = useState<'TITLES' | 'CONCENTRATION' | 'CASH_RECONCILIATION'>('TITLES');
  const [selectedTitleForEdit, setSelectedTitleForEdit] = useState<FinancialTitle | null>(null);

  const [regime, setRegime] = useState<DRERegime>('COMPETENCIA');

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    return storage.subscribe(() => setRefreshTrigger(k => k + 1));
  }, []);

  const dreData = useMemo(() => {
    return ReportingEngine.generateDRE(effectiveYear, regime);
  }, [effectiveYear, regime, refreshTrigger]);

  const allTitles = useMemo(() => storage.getTitles(), [refreshTrigger]);
  const counterparties = useMemo(() => storage.getCounterparties(), [refreshTrigger]);
  const allSettlements = useMemo(() => storage.getSettlements().filter(s => !s.isReversed), [refreshTrigger]);

  // Apuração de Conciliação Caixa x Competência (Sugestão 2)
  const cashReconciliation = useMemo(() => {
    return DRECashReconciliationEngine.generateReconciliation(effectiveYear);
  }, [effectiveYear, allTitles]);

  // Informações completas de quitação e data de pagamento de um título
  const getTitlePaymentInfo = (title: FinancialTitle) => {
    const titleSettlements = allSettlements
      .filter(s => s.titleId === title.id)
      .sort((a, b) => (b.settlementDate || '').localeCompare(a.settlementDate || ''));

    if (titleSettlements.length > 0) {
      const latest = titleSettlements[0];
      const totalPaid = titleSettlements.reduce(
        (acc, s) => acc + (s.components?.principalSettled || s.components?.netFinancialAmount || 0),
        0
      );
      const isPaid = title.settlementState === 'LIQUIDADO' || totalPaid >= title.originalAmount - 0.01;
      const isPartial = title.settlementState === 'PARCIAL' || (totalPaid > 0 && !isPaid);
      return {
        isPaid,
        isPartial,
        paymentDate: latest.settlementDate,
        paidAmount: totalPaid,
        settlementsCount: titleSettlements.length
      };
    }

    const legacyDate = (title as any).actualPaymentDate || (title as any).paymentDate || (title as any).settlementDate;
    if (legacyDate) {
      return {
        isPaid: title.settlementState === 'LIQUIDADO',
        isPartial: title.settlementState === 'PARCIAL',
        paymentDate: legacyDate,
        paidAmount: title.settledPrincipal || title.originalAmount,
        settlementsCount: 1
      };
    }

    if (title.settlementState === 'LIQUIDADO') {
      const fallbackDate = title.updatedAt?.split('T')[0] || title.dueDate;
      return {
        isPaid: true,
        isPartial: false,
        paymentDate: fallbackDate,
        paidAmount: title.settledPrincipal || title.originalAmount,
        settlementsCount: 1
      };
    }

    return {
      isPaid: false,
      isPartial: false,
      paymentDate: null,
      paidAmount: 0,
      settlementsCount: 0
    };
  };

  // Filtragem dos meses ativos na visualização
  const activeMonthIndices = useMemo(() => {
    if (timeHorizon === 'MES') {
      return [selectedMonth];
    }
    if (timeHorizon === 'SEMESTRE') {
      return selectedSemester === 1 ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
    }
    if (timeHorizon === 'TRIMESTRE') {
      const start = (selectedQuarter - 1) * 3;
      return [start, start + 1, start + 2];
    }
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }, [timeHorizon, selectedSemester, selectedQuarter, selectedMonth]);

  // Meses alvo conforme o clique no drill-down (mês específico ou acumulado do período selecionado)
  const targetDrillDownMonths = useMemo(() => {
    if (!drillDownItem) return [];
    const { monthIdx } = drillDownItem;
    return monthIdx >= 0
      ? [`${effectiveYear}-${(monthIdx + 1).toString().padStart(2, '0')}`]
      : activeMonthIndices.map(m => `${effectiveYear}-${(m + 1).toString().padStart(2, '0')}`);
  }, [drillDownItem, effectiveYear, activeMonthIndices]);

  // Helper contábil que apura com precisão o impacto de caixa de um título no período selecionado
  const getTitleCashInPeriod = useCallback((title: FinancialTitle, targetMonths: string[]) => {
    let settledInPeriod = 0;
    const matchingSettlements = allSettlements.filter(s => s.titleId === title.id);

    if (matchingSettlements.length > 0) {
      for (const s of matchingSettlements) {
        const sMonth = s.settlementDate?.substring(0, 7) || '';
        if (targetMonths.includes(sMonth)) {
          settledInPeriod += s.components?.principalSettled || s.components?.netFinancialAmount || 0;
        }
      }
    } else {
      const payDate = (title as any).actualPaymentDate || (title as any).paymentDate || (title as any).settlementDate || '';
      const pMonth = payDate.substring(0, 7);
      if (payDate && targetMonths.includes(pMonth) && ((title.settledPrincipal || 0) > 0 || title.settlementState === 'LIQUIDADO')) {
        settledInPeriod += title.settledPrincipal || title.originalAmount || 0;
      } else if (!payDate && title.settlementState === 'LIQUIDADO') {
        const dueMonth = (title.dueDate || '').substring(0, 7);
        if (targetMonths.includes(dueMonth)) {
          settledInPeriod += title.settledPrincipal || title.originalAmount || 0;
        }
      }
    }

    // Saldo em aberto com previsão de pagamento / vencimento no período (regra contábil de caixa gerencial)
    let openDueInPeriod = 0;
    const dueMonth = (title.dueDate || '').substring(0, 7);
    if (targetMonths.includes(dueMonth)) {
      const openBalance = typeof title.balancePrincipal === 'number'
        ? title.balancePrincipal
        : Math.max(0, (title.originalAmount || 0) - (title.settledPrincipal || 0));

      if (openBalance > 0.001) {
        openDueInPeriod = openBalance;
      }
    }

    const totalInPeriod = Math.round((settledInPeriod + openDueInPeriod) * 100) / 100;
    return {
      settledInPeriod: Math.round(settledInPeriod * 100) / 100,
      openDueInPeriod: Math.round(openDueInPeriod * 100) / 100,
      totalInPeriod
    };
  }, [allSettlements]);

  // Filtragem estrita dos títulos da linha para o período e regime ativos
  const filteredDrillDownTitles = useMemo(() => {
    if (!drillDownItem) return [];
    const { line, regimeMode } = drillDownItem;

    // 1. Títulos vinculados à rubrica da DRE
    const lineTitles = allTitles.filter(t => 
      line.matchedTitleIds?.includes(t.id) || 
      t.accountId === line.id || 
      (line as any).accountId === t.accountId
    );

    // 2. Filtrar de acordo com o regime (Competência ou Caixa)
    if (regimeMode === 'CAIXA') {
      return lineTitles.filter(t => {
        const cash = getTitleCashInPeriod(t, targetDrillDownMonths);
        return cash.totalInPeriod > 0.001;
      });
    } else {
      // Regime de Competência
      return lineTitles.filter(t => {
        const compStr = t.competence && t.competence.trim().length >= 7
          ? t.competence.trim().substring(0, 7)
          : (t.dueDate ? t.dueDate.substring(0, 7) : '');
        return targetDrillDownMonths.includes(compStr);
      });
    }
  }, [drillDownItem, allTitles, targetDrillDownMonths, getTitleCashInPeriod]);

  // Totalizador consolidado dos títulos do drill-down para o período (bate centavo por centavo com a DRE)
  const drillDownTotalAmount = useMemo(() => {
    if (!drillDownItem || filteredDrillDownTitles.length === 0) return 0;
    if (drillDownItem.regimeMode === 'CAIXA') {
      return Math.round(filteredDrillDownTitles.reduce((acc, t) => {
        const cash = getTitleCashInPeriod(t, targetDrillDownMonths);
        return acc + cash.totalInPeriod;
      }, 0) * 100) / 100;
    } else {
      return Math.round(filteredDrillDownTitles.reduce((acc, t) => acc + (t.originalAmount || 0), 0) * 100) / 100;
    }
  }, [drillDownItem, filteredDrillDownTitles, targetDrillDownMonths, getTitleCashInPeriod]);

  // Raio-X de Concentração de Favorecidos / Clientes
  const drillDownConcentration = useMemo(() => {
    if (!drillDownItem || filteredDrillDownTitles.length === 0) return null;
    const isCash = drillDownItem.regimeMode === 'CAIXA';

    const getEffectiveAmount = (t: FinancialTitle) => {
      if (isCash) {
        return getTitleCashInPeriod(t, targetDrillDownMonths).totalInPeriod;
      }
      return t.originalAmount || 0;
    };

    const totalAmount = filteredDrillDownTitles.reduce((acc, t) => acc + getEffectiveAmount(t), 0);
    if (totalAmount <= 0) return null;

    const map = new Map<string, { counterpartyId: string; name: string; document: string; amount: number; count: number }>();

    for (const t of filteredDrillDownTitles) {
      const cId = t.counterpartyId || 'DESCONHECIDO';
      const cObj = counterparties.find(c => c.id === cId);
      const name = cObj?.name || 'Não identificado / Sem cadastro';
      const document = cObj?.document || '-';

      const cur = map.get(cId) || { counterpartyId: cId, name, document, amount: 0, count: 0 };
      cur.amount += getEffectiveAmount(t);
      cur.count += 1;
      map.set(cId, cur);
    }

    const items = Array.from(map.values())
      .map(item => ({
        ...item,
        percentage: (item.amount / totalAmount) * 100
      }))
      .sort((a, b) => b.amount - a.amount);

    const top1 = items[0];
    const top3Share = items.slice(0, 3).reduce((acc, i) => acc + i.percentage, 0);

    let riskLevel: 'BAIXO' | 'MEDIO' | 'ALTO' = 'BAIXO';
    let riskWarning = 'Distribuição equilibrada entre múltiplos favorecidos ou clientes.';

    if (top1 && top1.percentage >= 50) {
      riskLevel = 'ALTO';
      riskWarning = `Alerta Crítico: "${top1.name}" concentra ${top1.percentage.toFixed(1)}% do valor desta conta contábil!`;
    } else if (top1 && top1.percentage >= 35) {
      riskLevel = 'MEDIO';
      riskWarning = `Atenção: Alta concentração em "${top1.name}" (${top1.percentage.toFixed(1)}% do total).`;
    } else if (top3Share >= 75 && items.length > 3) {
      riskLevel = 'MEDIO';
      riskWarning = `Os 3 maiores parceiros concentram ${top3Share.toFixed(1)}% deste montante.`;
    }

    return {
      totalAmount,
      totalCounterparties: items.length,
      items,
      top1,
      top3Share,
      riskLevel,
      riskWarning
    };
  }, [drillDownItem, filteredDrillDownTitles, counterparties, targetDrillDownMonths, getTitleCashInPeriod]);

  // Dados do Planejamento Orçamentário para Análise Orçado vs Realizado (Sugestão 3)
  const budgetData = useMemo(() => {
    try {
      return BudgetEngine.getBudgetComparison(effectiveYear);
    } catch (e) {
      return null;
    }
  }, [effectiveYear]);

  // Mapeia uma linha do DRE para a linha correspondente no orçamento anual
  const getBudgetItemForLine = (line: DRELineItem) => {
    if (!budgetData || !budgetData.lines) return null;
    return budgetData.lines.find(bl => 
      (line.code && bl.code === line.code) || 
      bl.name.toLowerCase().trim() === line.name.toLowerCase().trim() ||
      bl.id === line.id
    );
  };

  // Retorna o valor orçado planejado para a linha nos meses ativos
  const getBudgetPlannedForLine = (line: DRELineItem) => {
    const bItem = getBudgetItemForLine(line);
    if (!bItem) return 0;
    if (activeMonthIndices.length === 12) return bItem.plannedTotal;
    return activeMonthIndices.reduce((acc, idx) => acc + (bItem.plannedMonthly[idx] || 0), 0);
  };

  // Contagem de linhas analíticas sem movimentação no período ativo (Sugestão 4)
  const hiddenZeroCount = useMemo(() => {
    return dreData.lines.filter(l => 
      l.level > 0 && 
      !l.isSummary && 
      !activeMonthIndices.some(idx => Math.abs(l.valuesByMonth[idx] || 0) > 0.001)
    ).length;
  }, [dreData.lines, activeMonthIndices]);

  // Funções de Apoio para Análise Horizontal (AH / MoM) e Vertical (Sugestão 4)
  const isLineDebitNature = (line: DRELineItem) => {
    if (line.type === 'DEDUCAO' || line.type === 'CUSTO' || line.type === 'DESPESA') return true;
    if (line.code?.startsWith('2') || line.code?.startsWith('3') || line.code?.startsWith('4') || line.code?.startsWith('5.')) return true;
    if (line.id === 'h-2' || line.id === 'h-3' || line.id === 'h-4' || line.id === 'h-5' || line.id.startsWith('h-4.') || line.id.startsWith('h-5.')) return true;
    return false;
  };

  const calculateVarianceAH = (currentVal: number, previousVal: number, isDebit: boolean) => {
    if (Math.abs(previousVal) < 0.001 && Math.abs(currentVal) < 0.001) {
      return { diff: 0, pct: 0, status: 'EQUAL' as const, label: '-' };
    }
    if (Math.abs(previousVal) < 0.001) {
      const isPositive = currentVal > 0;
      return {
        diff: currentVal,
        pct: 100,
        status: isPositive ? (isDebit ? 'UNFAVORABLE' as const : 'FAVORABLE' as const) : (isDebit ? 'FAVORABLE' as const : 'UNFAVORABLE' as const),
        label: '+100%'
      };
    }
    const diff = currentVal - previousVal;
    const pct = (diff / Math.abs(previousVal)) * 100;

    let status: 'FAVORABLE' | 'UNFAVORABLE' | 'EQUAL' = 'EQUAL';
    if (Math.abs(pct) < 0.1) {
      status = 'EQUAL';
    } else if (isDebit) {
      // Para custos e despesas: aumento é desfavorável (alerta), redução é favorável
      status = diff > 0 ? 'UNFAVORABLE' : 'FAVORABLE';
    } else {
      // Para receitas e lucros: aumento é favorável, redução é desfavorável
      status = diff > 0 ? 'FAVORABLE' : 'UNFAVORABLE';
    }

    const sign = pct > 0 ? '+' : '';
    const label = `${sign}${pct.toFixed(1)}%`;
    return { diff, pct, status, label };
  };

  const getLinePeriodAHEvolution = (line: DRELineItem) => {
    if (activeMonthIndices.length < 2) return null;
    const firstIdx = activeMonthIndices[0];
    const lastIdx = activeMonthIndices[activeMonthIndices.length - 1];
    const firstVal = line.valuesByMonth[firstIdx] || 0;
    const lastVal = line.valuesByMonth[lastIdx] || 0;
    return calculateVarianceAH(lastVal, firstVal, isLineDebitNature(line));
  };

  const getNetResultPeriodAHEvolution = () => {
    if (activeMonthIndices.length < 2) return null;
    const firstIdx = activeMonthIndices[0];
    const lastIdx = activeMonthIndices[activeMonthIndices.length - 1];
    const firstVal = dreData.netResults[firstIdx] || 0;
    const lastVal = dreData.netResults[lastIdx] || 0;
    return calculateVarianceAH(lastVal, firstVal, false);
  };

  // Alterna modo completo (Expandido vs Recolhido)
  const handleSetStructureMode = (mode: 'EXPANDED' | 'COLLAPSED') => {
    if (mode === 'COLLAPSED') {
      setIsCollapsed(true);
      const allHeaders = new Set(dreData.lines.filter(l => l.isHeader).map(l => l.id));
      setCollapsedSections(allHeaders);
    } else {
      setIsCollapsed(false);
      setCollapsedSections(new Set());
    }
  };

  // Alterna recolhimento de uma seção específica (clique no chevron da categoria)
  const handleToggleSection = (headerId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (isCollapsed) {
        // Se estava no modo global recolhido, inicializa mantendo os demais recolhidos e expandindo este
        const allHeaders = dreData.lines.filter(l => l.isHeader).map(l => l.id);
        allHeaders.forEach(id => {
          if (id !== headerId) next.add(id);
        });
        next.delete(headerId);
        setIsCollapsed(false);
        return next;
      }

      if (next.has(headerId)) {
        next.delete(headerId);
      } else {
        next.add(headerId);
      }
      return next;
    });
  };

  // Linhas visíveis conforme o estado expandido/recolhido e filtro de contas zeradas (Sugestão 4)
  const visibleLines = useMemo(() => {
    let lines = dreData.lines;

    if (isCollapsed) {
      // Modo Recolhido: apenas categorias principais (nível 0) e linhas de resultado/resumo
      lines = lines.filter(l => l.level === 0 || l.isSummary);
    } else {
      // Modo Expandido: exibe todas as categorias e subcategorias (com suporte a recolhimento pontual por chevron)
      lines = lines.filter(l => {
        if (l.level === 0 || l.isSummary) return true;

        // Oculta se o grupo principal está recolhido
        if (l.groupId && collapsedSections.has(l.groupId)) return false;

        // Oculta se o cabeçalho direto de subgrupo está recolhido
        if (l.parentHeaderId && collapsedSections.has(l.parentHeaderId)) return false;

        return true;
      });
    }

    if (hideZeroRows) {
      lines = lines.filter(l => {
        // Preserva cabeçalhos de grupos e sumários essenciais
        if (l.level === 0 || l.isSummary) return true;
        // Filtra linhas analíticas sem movimentação no período ativo
        return activeMonthIndices.some(idx => Math.abs(l.valuesByMonth[idx] || 0) > 0.001);
      });
    }

    return lines;
  }, [dreData.lines, isCollapsed, collapsedSections, hideZeroRows, activeMonthIndices]);

  // Formatação compacta de valores para visualização do ano todo em uma tela só
  const formatCellValue = (val: number) => {
    if (val === 0) return '-';
    const absVal = Math.abs(val);

    if (valueDisplayMode === 'MILHARES') {
      let formatted = '';
      if (absVal >= 1000000) {
        formatted = `${(absVal / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
      } else if (absVal >= 1000) {
        formatted = `${(absVal / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`;
      } else {
        formatted = absVal.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
      }
      return val < 0 ? `(${formatted})` : formatted;
    }

    const showDecimals = valueDisplayMode === 'CENTAVOS';
    const formatted = absVal.toLocaleString('pt-BR', {
      minimumFractionDigits: showDecimals ? 2 : 0,
      maximumFractionDigits: showDecimals ? 2 : 0
    });
    return val < 0 ? `(${formatted})` : formatted;
  };

  const isFullYear = timeHorizon === 'ANO';
  const canFitToScreen = fitToScreen && isFullYear && !isMobile;

  const horizonLabel = useMemo(() => {
    if (timeHorizon === 'MES') return `${dreData.months[selectedMonth]}/${effectiveYear}`;
    if (timeHorizon === 'SEMESTRE') return `${selectedSemester}º Semestre/${effectiveYear}`;
    if (timeHorizon === 'TRIMESTRE') return `${selectedQuarter}º Trimestre/${effectiveYear}`;
    return `Exercício Completo ${effectiveYear}`;
  }, [timeHorizon, selectedSemester, selectedQuarter, selectedMonth, effectiveYear, dreData.months]);

  const totalColLabel = useMemo(() => {
    const base = timeHorizon === 'MES' ? `Total ${dreData.months[selectedMonth]}`
      : timeHorizon === 'SEMESTRE' ? `Total ${selectedSemester}º Sem`
      : timeHorizon === 'TRIMESTRE' ? `Total ${selectedQuarter}º Tri`
      : 'Total Exercício';
    if (regime === 'CAIXA') return `${base} (Caixa)`;
    if (regime === 'COMPARATIVO') return `${base} (Competência)`;
    return base;
  }, [timeHorizon, selectedSemester, selectedQuarter, selectedMonth, dreData.months, regime]);

  // Totalizador da linha no período selecionado
  const getLinePeriodTotal = (line: DRELineItem) => {
    if (timeHorizon === 'ANO') return line.totalYear;
    return activeMonthIndices.reduce((acc, mIdx) => acc + (line.valuesByMonth[mIdx] || 0), 0);
  };

  const getLinePeriodCashTotal = (line: DRELineItem) => {
    if (timeHorizon === 'ANO') return line.cashTotalYear || 0;
    return activeMonthIndices.reduce((acc, mIdx) => acc + ((line.cashValuesByMonth && line.cashValuesByMonth[mIdx]) || 0), 0);
  };

  const getNetResultPeriodTotal = () => {
    if (timeHorizon === 'ANO') return dreData.totalNetResult;
    return activeMonthIndices.reduce((acc, mIdx) => acc + (dreData.netResults[mIdx] || 0), 0);
  };

  const getNetResultPeriodCashTotal = () => {
    if (timeHorizon === 'ANO') return dreData.cashTotalNetResult || 0;
    return activeMonthIndices.reduce((acc, mIdx) => acc + ((dreData.cashNetResults && dreData.cashNetResults[mIdx]) || 0), 0);
  };

  // Linha de Receita Bruta base para cálculos de Análise Vertical (global e mensal)
  const grossRevLine = useMemo(() => {
    return dreData.lines.find(l => l.name.includes('RECEITA BRUTA') || l.code === '1') || dreData.lines[0];
  }, [dreData.lines]);

  // KPIs Executivos do DRE calculados para o período ativo
  const kpis = useMemo(() => {
    const deducLine = dreData.lines.find(l => l.name.includes('DEDUÇÕES') || l.code === '2');
    const netRevLine = dreData.lines.find(l => l.name.includes('RECEITA LÍQUIDA') || l.name.includes('RECEITA OPERACIONAL LÍQUIDA'));
    const costsLine = dreData.lines.find(l => l.name.includes('CUSTOS') || l.code === '3');
    const grossProfitLine = dreData.lines.find(l => l.name.includes('LUCRO BRUTO') || l.name.includes('MARGEM'));
    const opExpLine = dreData.lines.find(l => l.name.includes('DESPESAS OPERACIONAIS') || l.code === '4');

    const grossRev = grossRevLine ? getLinePeriodTotal(grossRevLine) : (dreData.lines[0] ? getLinePeriodTotal(dreData.lines[0]) : 0);
    const deduc = deducLine ? getLinePeriodTotal(deducLine) : 0;
    const netRev = netRevLine ? getLinePeriodTotal(netRevLine) : (grossRev - deduc);
    const costs = costsLine ? getLinePeriodTotal(costsLine) : 0;
    const grossProfit = grossProfitLine ? getLinePeriodTotal(grossProfitLine) : (netRev - costs);
    const opExp = opExpLine ? getLinePeriodTotal(opExpLine) : 0;
    const netResult = getNetResultPeriodTotal();

    const grossMargin = grossRev > 0 ? (grossProfit / grossRev) * 100 : 0;
    const netMargin = grossRev > 0 ? (netResult / grossRev) * 100 : 0;
    const opResult = grossProfit - opExp;
    const finResult = netResult - opResult;

    return {
      grossRev,
      netRev,
      costs,
      grossProfit,
      grossMargin,
      opExp,
      opExpenses: opExp,
      opResult,
      finResult,
      netResult,
      netMargin
    };
  }, [dreData, activeMonthIndices, timeHorizon]);

  const handleOpenDrillDown = (
    line: DRELineItem, 
    monthIdx: number, 
    specificRegime?: 'COMPETENCIA' | 'CAIXA'
  ) => {
    let defaultRegime: 'COMPETENCIA' | 'CAIXA' = 'COMPETENCIA';
    if (specificRegime) {
      defaultRegime = specificRegime;
    } else if (regime === 'CAIXA') {
      defaultRegime = 'CAIXA';
    }

    let monthName = '';
    if (monthIdx >= 0) {
      monthName = `${dreData.months[monthIdx]}/${effectiveYear}`;
    } else {
      if (timeHorizon === 'MES') {
        monthName = `${dreData.months[selectedMonth]}/${effectiveYear} (Mês Selecionado)`;
      } else if (timeHorizon === 'SEMESTRE') {
        monthName = `${selectedSemester}º Semestre/${effectiveYear} (${selectedSemester === 1 ? 'Jan-Jun' : 'Jul-Dez'})`;
      } else if (timeHorizon === 'TRIMESTRE') {
        const qLabels = ['1º Tri (Jan-Mar)', '2º Tri (Abr-Jun)', '3º Tri (Jul-Set)', '4º Tri (Out-Dez)'];
        monthName = `${qLabels[selectedQuarter - 1]}/${effectiveYear}`;
      } else {
        monthName = `Ano Completo ${effectiveYear} (Jan-Dez)`;
      }
    }

    setDrillDownItem({
      line,
      monthIdx,
      monthName,
      regimeMode: defaultRegime
    });
    setDrillDownTab('TITLES');
  };

  const handleEditTitle = (t: FinancialTitle) => {
    const compStr = t.competence && t.competence.trim().length >= 7
      ? t.competence.trim().substring(0, 7)
      : (t.dueDate ? t.dueDate.substring(0, 7) : '');

    if (compStr && FinancialEngine.isPeriodClosed(compStr)) {
      toast.error(`Período Contábil Fechado: A competência ${compStr} já foi encerrada e está bloqueada para alterações.`);
      return;
    }

    setSelectedTitleForEdit(t);
  };

  const handleTitleSaved = () => {
    setSelectedTitleForEdit(null);
    setRefreshTrigger(k => k + 1);
    toast.success('Lançamento atualizado com sucesso!');
  };

  const handleExportExcel = () => {
    const isComparative = regime === 'COMPARATIVO';
    const headers = [
      'Código', 
      'Rubrica Econômica', 
      ...activeMonthIndices.map(i => dreData.months[i]), 
      ...(isComparative 
        ? ['Competência', 'Caixa Realizado', 'Gap (R$)', '% Realização'] 
        : [totalColLabel]
      ),
      '% AV',
      ...(showHorizontalAnalysis ? ['% AH (Evolução)'] : [])
    ];
    const grossRevVal = kpis.grossRev > 0 ? kpis.grossRev : 1;

    const rows = visibleLines.map(l => {
      const periodTot = getLinePeriodTotal(l);
      const av = grossRevVal > 0 ? (periodTot / grossRevVal) * 100 : 0;
      const ahEv = getLinePeriodAHEvolution(l);

      let totalCells: (string | number)[] = [periodTot];
      if (isComparative) {
        const cashVal = getLinePeriodCashTotal(l);
        const gapVal = Math.round((periodTot - cashVal) * 100) / 100;
        const rate = periodTot > 0 ? Math.min(Math.round((cashVal / periodTot) * 100), 999) : (cashVal > 0 ? 100 : 0);
        totalCells = [periodTot, cashVal, gapVal, `${rate}%`];
      }

      return [
        l.code || '-',
        l.name,
        ...activeMonthIndices.map(i => l.valuesByMonth[i] || 0),
        ...totalCells,
        `${(av ?? 0).toFixed(1)}%`,
        ...(showHorizontalAnalysis ? [ahEv ? ahEv.label : '-'] : [])
      ];
    });

    // Linha de Resultado Líquido
    const netPeriodTot = getNetResultPeriodTotal();
    const netAV = grossRevVal > 0 ? (netPeriodTot / grossRevVal) * 100 : 0;
    const netAHEv = getNetResultPeriodAHEvolution();

    let netTotalCells: (string | number)[] = [netPeriodTot];
    if (isComparative) {
      const netCash = getNetResultPeriodCashTotal();
      const netGap = Math.round((netPeriodTot - netCash) * 100) / 100;
      const netRate = netPeriodTot > 0 ? Math.min(Math.round((netCash / netPeriodTot) * 100), 999) : (netCash > 0 ? 100 : 0);
      netTotalCells = [netPeriodTot, netCash, netGap, `${netRate}%`];
    }

    rows.push([
      '9',
      '(=) RESULTADO LÍQUIDO DO EXERCÍCIO',
      ...activeMonthIndices.map(i => dreData.netResults[i] || 0),
      ...netTotalCells,
      `${(netAV ?? 0).toFixed(1)}%`,
      ...(showHorizontalAnalysis ? [netAHEv ? netAHEv.label : '-'] : [])
    ]);

    const fileSuffix = regime === 'CAIXA' ? 'Caixa' : regime === 'COMPARATIVO' ? 'Comparativo-Caixa-Competencia' : 'Competencia';
    exportToExcel(`DRE-${fileSuffix}-${effectiveYear}`, `DRE ${fileSuffix}`, headers, rows);
  };

  const handleExportCSV = () => {
    const isComparative = regime === 'COMPARATIVO';
    const headers = [
      'Código', 
      'Rubrica Econômica', 
      ...activeMonthIndices.map(i => dreData.months[i]), 
      ...(isComparative 
        ? ['Competência', 'Caixa Realizado', 'Gap (R$)', '% Realização'] 
        : [totalColLabel]
      )
    ];
    const rows = visibleLines.map(l => {
      const periodTot = getLinePeriodTotal(l);
      let totalCells: (string | number)[] = [periodTot];
      if (isComparative) {
        const cashVal = getLinePeriodCashTotal(l);
        const gapVal = Math.round((periodTot - cashVal) * 100) / 100;
        const rate = periodTot > 0 ? Math.min(Math.round((cashVal / periodTot) * 100), 999) : (cashVal > 0 ? 100 : 0);
        totalCells = [periodTot, cashVal, gapVal, `${rate}%`];
      }
      return [
        l.code || '-',
        l.name,
        ...activeMonthIndices.map(i => l.valuesByMonth[i] || 0),
        ...totalCells
      ];
    });
    const fileSuffix = regime === 'CAIXA' ? 'Caixa' : regime === 'COMPARATIVO' ? 'Comparativo' : 'Competencia';
    exportToCSV(`DRE-${fileSuffix}-${effectiveYear}`, headers, rows);
  };

  const handleExportPDF = () => {
    try {
      const company = storage.getCompany();
      exportDREToPDF(dreData, effectiveYear, {
        companyName: company.companyName || company.tradeName || 'Contaju Gestão Financeira',
        timeHorizonLabel: horizonLabel,
        activeMonthIndices,
        totalColLabel
      });
      setPdfToast(`PDF Executivo em folha A4 Paisagem gerado com sucesso para o exercício ${effectiveYear} (${horizonLabel})!`);
      setTimeout(() => setPdfToast(null), 5000);
    } catch (err: any) {
      console.error('Erro ao gerar PDF do DRE:', err);
      setPdfToast(`Não foi possível gerar o PDF: ${err?.message || 'Verifique os dados do exercício.'}`);
      setTimeout(() => setPdfToast(null), 4000);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const grossRevenueBase = kpis.grossRev > 0 ? kpis.grossRev : 1;

  return (
    <div className="space-y-6">
      
      {/* Toast de Exportação PDF */}
      {pdfToast && (
        <div className="p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-xl flex items-center justify-between text-xs text-amber-950 dark:text-amber-200 font-bold shadow-md animate-fade-in">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{pdfToast}</span>
          </div>
          <button 
            type="button"
            onClick={() => setPdfToast(null)} 
            className="text-slate-400 hover:text-slate-200 cursor-pointer text-sm font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header com visual consistente */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Demonstração do Resultado do Exercício (DRE Gerencial)
            </h1>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {regime === 'COMPETENCIA' && (
              <>Estruturado por <strong>Regime de Competência</strong>. Faturamento, custos e despesas reconhecidos pelo período econômico gerador.</>
            )}
            {regime === 'CAIXA' && (
              <>Estruturado por <strong>Regime de Caixa</strong>. Entradas e saídas reconhecidas exclusivamente pelas quitações e liquidações efetivadas.</>
            )}
            {regime === 'COMPARATIVO' && (
              <>Visão <strong>Comparativa Lado a Lado</strong>: Competência vs Caixa Realizado. Auditoria de descasamento financeiro, inadimplência e taxa de realização.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Ano */}
          <div className="flex items-center space-x-1.5 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
            <span className="font-semibold text-[var(--text-secondary)] px-2">Ano:</span>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                  effectiveYear === y 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Sugestão 5: Sumário Executivo One-Pager */}
          <button
            onClick={() => setShowOnePageModal(true)}
            className="px-3 py-2 bg-amber-500/10 border border-amber-500/50 text-amber-900 dark:text-amber-300 hover:bg-amber-500/20 rounded-xl text-xs font-bold transition-all flex items-center shadow-xs cursor-pointer"
            title="Abrir e exportar Sumário Executivo do DRE em Folha Única (One-Pager para Diretoria & Conselho)"
          >
            <Presentation className="w-4 h-4 mr-1.5 text-amber-500" />
            One-Pager (Executivo)
          </button>

          <button
            onClick={handleExportPDF}
            className="px-3 py-2 bg-[var(--surface-card)] border border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15 rounded-xl text-xs font-bold transition-colors flex items-center shadow-xs cursor-pointer"
            title="Exportar DRE diagramado para PDF executivo (A4 Paisagem)"
          >
            <FileText className="w-4 h-4 mr-1.5 text-amber-500" />
            PDF (A4 Paisagem)
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-2 bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] rounded-xl text-xs font-semibold transition-colors flex items-center shadow-xs cursor-pointer"
            title="Imprimir ou Salvar em PDF pelo navegador (com variáveis de tema)"
          >
            <Printer className="w-4 h-4 mr-1.5 text-[var(--text-secondary)]" />
            Imprimir
          </button>
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] rounded-xl text-xs font-medium transition-colors flex items-center shadow-xs cursor-pointer"
            title="Exportar para Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-amber-400" />
            Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] rounded-xl text-xs font-medium transition-colors flex items-center shadow-xs cursor-pointer"
            title="Exportar para CSV"
          >
            <Download className="w-4 h-4 mr-1.5 text-[var(--text-secondary)]" />
            CSV
          </button>

          {/* Atalho direto para Configuração e Mapeamento do Plano de Contas */}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('PLANO_CONTAS')}
              className="px-3 py-2 bg-amber-500/10 border border-amber-500/40 text-amber-900 dark:text-amber-300 hover:bg-amber-500/20 rounded-xl text-xs font-bold transition-all flex items-center shadow-xs cursor-pointer"
              title="Acessar o Plano de Contas Gerencial para criar, clonar ou vincular novas contas às linhas da DRE"
            >
              <Network className="w-4 h-4 mr-1.5 text-amber-500" />
              Plano de Contas
            </button>
          )}

          {/* Modo Foco */}
          {onToggleFocusMode && (
            <button
              onClick={onToggleFocusMode}
              className={`px-3 py-2 border rounded-xl text-xs font-semibold transition-all flex items-center shadow-xs ${
                isFocusMode 
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold hover:bg-amber-400' 
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] hover:text-amber-400 hover:border-amber-400/40'
              }`}
              title={isFocusMode ? "Sair do Modo Foco (Esc)" : "Ocultar cabeçalho e menu lateral para focar na visualização analítica"}
            >
              {isFocusMode ? <Minimize2 className="w-4 h-4 mr-1.5" /> : <Maximize2 className="w-4 h-4 mr-1.5" />}
              {isFocusMode ? 'Sair do Modo Foco' : 'Modo Foco'}
            </button>
          )}
        </div>
      </div>

      {/* Seletor de Horizonte Temporal (Ano, Semestre, Trimestre), Modo de Estrutura e Banner */}
      <div className="bg-[var(--surface-card)] p-3.5 sm:p-4 rounded-2xl border border-[var(--border-subtle)] space-y-3.5 shadow-2xs">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          
          {/* Horizonte Temporal */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-amber-400" />
              Período:
            </span>
            <div className="flex items-center bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)]">
              {(['ANO', 'SEMESTRE', 'TRIMESTRE', 'MES'] as const).map(h => (
                <button
                  key={h}
                  onClick={() => setTimeHorizon(h)}
                  className={`px-2.5 sm:px-3 py-1.5 min-h-[40px] sm:min-h-0 rounded-lg text-xs font-medium transition-colors ${
                    timeHorizon === h 
                      ? 'bg-amber-500 text-[#18181b] font-bold shadow-xs' 
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {h === 'ANO' ? 'Ano Completo (12M)' : h === 'SEMESTRE' ? 'Semestre' : h === 'TRIMESTRE' ? 'Trimestre' : 'Mês'}
                </button>
              ))}
            </div>

            {timeHorizon === 'MES' && (
              <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs overflow-x-auto scrollbar-none max-w-full">
                {dreData.months.map((mName, mIdx) => (
                  <button
                    key={mIdx}
                    type="button"
                    onClick={() => setSelectedMonth(mIdx)}
                    className={`px-2.5 py-1.5 min-h-[40px] rounded-lg font-medium transition-colors shrink-0 ${
                      selectedMonth === mIdx
                        ? 'bg-amber-500 text-[#18181b] font-bold shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {mName}
                  </button>
                ))}
              </div>
            )}

            {timeHorizon === 'SEMESTRE' && (
              <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
                {([1, 2] as const).map(sem => (
                  <button
                    key={sem}
                    onClick={() => setSelectedSemester(sem)}
                    className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                      selectedSemester === sem
                        ? 'bg-amber-500 text-[#18181b] font-bold shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {sem}º Semestre {sem === 1 ? '(Jan-Jun)' : '(Jul-Dez)'}
                  </button>
                ))}
              </div>
            )}

            {timeHorizon === 'TRIMESTRE' && (
              <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
                {([1, 2, 3, 4] as const).map(q => {
                  const qLabels = ['1º Tri (Jan-Mar)', '2º Tri (Abr-Jun)', '3º Tri (Jul-Set)', '4º Tri (Out-Dez)'];
                  return (
                    <button
                      key={q}
                      onClick={() => setSelectedQuarter(q)}
                      className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        selectedQuarter === q
                          ? 'bg-amber-500 text-[#18181b] font-bold shadow-xs'
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

          {/* Regime Contábil: Competência, Caixa ou Comparativo */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              Regime:
            </span>
            <div className="flex items-center bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
              <button
                type="button"
                onClick={() => setRegime('COMPETENCIA')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  regime === 'COMPETENCIA'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="DRE por Regime de Competência (Faturamento e Provisões)"
              >
                Competência
              </button>
              <button
                type="button"
                onClick={() => setRegime('CAIXA')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  regime === 'CAIXA'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="DRE por Regime de Caixa (Liquidações efetivas em conta bancária)"
              >
                Caixa
              </button>
              <button
                type="button"
                onClick={() => setRegime('COMPARATIVO')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  regime === 'COMPARATIVO'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="DRE Comparativo: Competência vs Caixa Lado a Lado com apuração de Gap e % Realização"
              >
                <span>Caixa x Competência</span>
                <span className={`text-[9px] uppercase px-1 py-0.2 rounded font-black ${
                  regime === 'COMPARATIVO' ? 'bg-black/20 text-slate-950' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  Lado a Lado
                </span>
              </button>
            </div>
          </div>

          {/* Modo de Visualização Estrutural: Recolhido vs Expandido */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)] hidden sm:inline">Exibição:</span>
            <div className="flex items-center bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
              <button
                type="button"
                onClick={() => handleSetStructureMode('COLLAPSED')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  isCollapsed 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Modo Recolhido: apenas categorias principais e análises de resultados (sem subcategorias)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Recolhido (Principais)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetStructureMode('EXPANDED')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  !isCollapsed 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Modo Expandido: exibe todas as categorias, subcategorias e contas analíticas detalhadas"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expandido (Completo)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Banner informativo com modo ativo e atalho */}
        <div className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center space-x-2">
            <Scale className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Demonstrativo apurado por <strong>Competência</strong> ({horizonLabel}) • 
              <strong className="text-[var(--text-primary)] ml-1">
                {isCollapsed ? 'Modo Sintético (Apenas Categorias Principais e Análises de Resultados)' : 'Modo Analítico (Expandido com Todas as Subcategorias e Contas)'}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-amber-400/90 font-medium">
              {visibleLines.length} linhas em exibição
            </span>
            <span>•</span>
            <span>Clique em qualquer valor para auditar</span>
          </div>
        </div>
      </div>

      {/* Global Period Banner */}
      <GlobalPeriodBanner
        moduleName="DRE Gerencial"
        matchedCount={
          regime === 'CAIXA'
            ? allTitles.filter(t => {
                const payDate = (t as any).actualPaymentDate || (t as any).paymentDate || (t as any).settlementDate || '';
                return payDate.startsWith(String(effectiveYear)) || (t.dueDate || '').startsWith(String(effectiveYear));
              }).length
            : allTitles.filter(t => (t.competence || t.dueDate || '').startsWith(String(effectiveYear))).length
        }
        totalCount={allTitles.length}
      />

      {/* Cards de Resumo Executivo da DRE (Adaptativo: 1 col celular, 2 col tablet, 3 col notebook, 5 col Mac/Desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {/* 1. Receita Operacional Bruta */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-amber-500/30 shadow-xs bg-amber-500/[0.04]">
          <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-400 uppercase font-bold tracking-wide">
            <span>Receita Bruta</span>
            <TrendingUp className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="mt-2 text-xl font-mono font-extrabold text-amber-900 dark:text-amber-300">
            {formatBRL(kpis.grossRev)}
          </div>
          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
            Faturamento bruto no período
          </span>
        </div>

        {/* 2. Custos dos Serviços */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 uppercase font-bold tracking-wide">
            <span>(-) Custos Operacionais</span>
            <TrendingDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="mt-2 text-xl font-mono font-extrabold text-slate-900 dark:text-slate-100">
            {formatBRL(kpis.costs)}
          </div>
          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
            Custos diretos da operação
          </span>
        </div>

        {/* 3. Lucro Bruto e Margem */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-amber-500/30 shadow-xs bg-amber-500/[0.04]">
          <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-400 uppercase font-bold tracking-wide">
            <span>(=) Lucro Bruto</span>
            <PieChart className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div className={`mt-2 text-xl font-mono font-extrabold ${kpis.grossProfit >= 0 ? 'text-amber-900 dark:text-amber-300' : 'text-rose-700 dark:text-rose-400'}`}>
            {formatBRL(kpis.grossProfit)}
          </div>
          <span className="text-[11px] text-amber-800 dark:text-amber-400 font-semibold">
            Margem Bruta: {kpis.grossMargin.toFixed(1)}%
          </span>
        </div>

        {/* 4. Despesas Operacionais */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 uppercase font-bold tracking-wide">
            <span>(-) Despesas Operacionais</span>
            <TrendingDown className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="mt-2 text-xl font-mono font-extrabold text-rose-800 dark:text-rose-300">
            {formatBRL(kpis.opExp)}
          </div>
          <span className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
            Despesas Adm., Comerciais e Pessoal
          </span>
        </div>

        {/* 5. Resultado Líquido do Exercício */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border-2 border-amber-500 shadow-xs bg-amber-500/10">
          <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-400 uppercase font-black tracking-wide">
            <span>(=) Resultado Líquido</span>
            <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div className={`mt-2 text-xl font-mono font-black ${kpis.netResult >= 0 ? 'text-amber-900 dark:text-amber-300' : 'text-rose-700 dark:text-rose-400'}`}>
            {kpis.netResult >= 0 ? '+' : ''}{formatBRL(kpis.netResult)}
          </div>
          <span className="text-[11px] text-amber-800 dark:text-amber-400 font-bold">
            Margem Líquida: {kpis.netMargin.toFixed(1)}% ({kpis.netResult >= 0 ? 'Lucro' : 'Prejuízo'})
          </span>
        </div>
      </div>

      {/* DRE Matrix Table com Degradês, Modo Expandido/Recolhido e Visualização Anual de 12 Meses */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
        
        {/* Alternador Rápido Mobile: Consolidado vs Analítico com Tap Target >= 40px */}
        <div className="p-2 sm:hidden bg-[var(--surface-card)] border-b border-[var(--border-subtle)]">
          <div className="grid grid-cols-2 p-1 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => handleSetStructureMode('COLLAPSED')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[40px] flex items-center justify-center gap-1.5 ${
                isCollapsed ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Minimize2 className="w-4 h-4" />
              Consolidado
            </button>
            <button
              type="button"
              onClick={() => handleSetStructureMode('EXPANDED')}
              className={`py-2 px-3 text-xs font-bold rounded-lg transition-all min-h-[40px] flex items-center justify-center gap-1.5 ${
                !isCollapsed ? 'bg-amber-500 text-slate-950 shadow-xs' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Maximize2 className="w-4 h-4" />
              Analítico
            </button>
          </div>
        </div>

        {/* Barra de Ferramentas da Matriz: Controles de Exibição, Estrutura e Densidade */}
        <div className="p-3 sm:p-3.5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-[var(--text-primary)]">Matriz do Demonstrativo do Resultado</span>
              <span className="text-[11px] text-[var(--text-secondary)] hidden md:inline">
                • {activeMonthIndices.length} meses ({horizonLabel})
              </span>
            </div>
            <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-[var(--surface-card)] border border-[var(--border-subtle)] text-amber-400">
              {visibleLines.length} linhas ({isCollapsed ? 'Modo Recolhido' : 'Modo Expandido'})
            </span>
          </div>

          {/* Controles de Modo: Expandido vs Recolhido, Densidade e Formatação Compacta */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor Segmentado: Expandido vs Recolhido */}
            <div className="flex items-center bg-[var(--surface-card)] p-0.5 rounded-xl border border-[var(--border-subtle)] text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => handleSetStructureMode('COLLAPSED')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  isCollapsed 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Modo Recolhido: exibe apenas os títulos das categorias principais e análises de resultados (sem subcategorias)"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Recolhido (Linhas Principais)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetStructureMode('EXPANDED')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  !isCollapsed 
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Modo Expandido: exibe todas as categorias, subcategorias e contas analíticas detalhadas"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expandido (Tudo)</span>
              </button>
            </div>

            {/* Seletor de Formatação de Valores (Inteiro vs Centavos vs Milhares) */}
            <div className="flex items-center bg-[var(--surface-card)] p-0.5 rounded-xl border border-[var(--border-subtle)] text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setValueDisplayMode('INTEIRO')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  valueDisplayMode === 'INTEIRO'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Valores inteiros (sem centavos) - Ideal para ver os 12 meses lado a lado sem corte"
              >
                12M Tela
              </button>
              <button
                type="button"
                onClick={() => setValueDisplayMode('CENTAVOS')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  valueDisplayMode === 'CENTAVOS'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Exibir centavos (,00) nos valores"
              >
                ,00
              </button>
              <button
                type="button"
                onClick={() => setValueDisplayMode('MILHARES')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  valueDisplayMode === 'MILHARES'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Abreviar em milhares (ex: 125k, 1,2M) para máxima compactação"
              >
                k (Mil)
              </button>
            </div>

            {/* Alternador de Ajuste 100% à Tela no modo Anual */}
            {isFullYear && (
              <button
                type="button"
                onClick={() => setFitToScreen(prev => !prev)}
                className={`px-2.5 py-1 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  fitToScreen 
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold' 
                    : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title={fitToScreen ? "Visualização ajustada em 100% da tela (sem rolagem horizontal)" : "Largura livre com rolagem horizontal"}
              >
                <span className="hidden sm:inline">{fitToScreen ? '12M em 1 Tela' : 'Largura Livre'}</span>
                <span className="sm:hidden">{fitToScreen ? '1 Tela' : 'Livre'}</span>
              </button>
            )}

            {/* Filtro Rápido: Ocultar Linhas Zeradas (Sugestão 4) */}
            <button
              type="button"
              onClick={() => setHideZeroRows(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                hideZeroRows
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-amber-400/40'
              }`}
              title="Ocultar contas analíticas e subcategorias que não possuem movimentação no período ativo"
            >
              {hideZeroRows ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{hideZeroRows ? `Zeradas Ocultas (${hiddenZeroCount})` : 'Ocultar Zeradas'}</span>
            </button>

            {/* Gráfico de Tendência Sparkline (Sugestão 3) */}
            <button
              type="button"
              onClick={() => setShowSparklines(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                showSparklines
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              title="Exibir minigráfico de curva de tendência (Sparklines) para cada linha do DRE"
            >
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Tendência</span>
            </button>

            {/* Comparativo Orçado vs Realizado (Sugestão 3) */}
            <button
              type="button"
              onClick={() => setShowBudgetVariance(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                showBudgetVariance
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-amber-400/40'
              }`}
              title="Comparar números realizados da DRE com as metas do Planejamento Orçamentário Anual"
            >
              <Target className="w-3.5 h-3.5 text-current" />
              <span>{showBudgetVariance ? 'Orçado Ativo' : 'Orçado vs Realizado'}</span>
            </button>

            {/* Análise Horizontal (MoM %) e Vertical (Sugestão 4) */}
            <button
              type="button"
              onClick={() => setShowHorizontalAnalysis(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                showHorizontalAnalysis
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-amber-400/40'
              }`}
              title="Ativar Análise Horizontal (AH): exibe a variação percentual mês a mês (MoM %) e evolução do período com cores de favorabilidade"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-current" />
              <span>{showHorizontalAnalysis ? 'Análise AH Ativa' : 'Análise AH (MoM)'}</span>
            </button>

            {/* Opção Solicitada: Ativar % nas Colunas (Análise Vertical por Mês / Linha de Resultado) */}
            <button
              type="button"
              onClick={() => setShowColumnPercentages(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                showColumnPercentages
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-amber-400/40'
              }`}
              title="Ativar % nas colunas: exibe a porcentagem (%) sobre a receita bruta de cada mês para cada linha e resultado"
            >
              <Percent className="w-3.5 h-3.5 text-current" />
              <span>{showColumnPercentages ? '% nas Colunas Ativo' : '% nas Colunas (AV)'}</span>
            </button>

            {/* Simulação What-If / Sensibilidade (Sugestão 1) */}
            <button
              type="button"
              onClick={() => setShowWhatIfModal(true)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                activeWhatIfScenario
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-amber-400/40'
              }`}
              title="Abrir simulador de sensibilidade e cenários de estresse (What-If): projete variações em receitas, custos e despesas"
            >
              <Sliders className="w-3.5 h-3.5 text-current" />
              <span>{activeWhatIfScenario ? `What-If (${activeWhatIfScenario.name})` : 'Simulação What-If'}</span>
              {activeWhatIfScenario && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
            </button>

            {/* Conciliação Caixa vs Competência (Sugestão 2) */}
            <button
              type="button"
              onClick={() => setShowCashReconciliation(prev => !prev)}
              className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                showCashReconciliation
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold shadow-xs'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-amber-400/40'
              }`}
              title="Confrontar DRE por Competência com a Liquidação Efetiva em Caixa (DFC): acompanhe taxas de realização e gaps de liquidez"
            >
              <Activity className="w-3.5 h-3.5 text-current" />
              <span>{showCashReconciliation ? 'Caixa x Competência Ativo' : 'Caixa vs Competência'}</span>
              {cashReconciliation.riskLevel === 'CRITICO' && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" title="Alerta crítico de liquidez" />
              )}
            </button>
          </div>
        </div>

        {/* Banner de Cenário Simulado Ativo (Sugestão 1) */}
        {activeWhatIfScenario && (
          <div className="bg-amber-500/15 border-b border-amber-500/40 p-3 px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-bold text-amber-950 dark:text-amber-200">
                Cenário Simulado Ativo: {activeWhatIfScenario.name}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Modificadores: 
                <strong className="text-amber-900 dark:text-amber-300 ml-1">Receita: {activeWhatIfScenario.revenueDelta >= 0 ? `+${activeWhatIfScenario.revenueDelta}%` : `${activeWhatIfScenario.revenueDelta}%`}</strong> • 
                <strong className="text-amber-900 dark:text-amber-300 ml-1">Custos: {activeWhatIfScenario.costDelta >= 0 ? `+${activeWhatIfScenario.costDelta}%` : `${activeWhatIfScenario.costDelta}%`}</strong> • 
                <strong className="text-amber-900 dark:text-amber-300 ml-1">Despesas: {activeWhatIfScenario.opExpDelta >= 0 ? `+${activeWhatIfScenario.opExpDelta}%` : `${activeWhatIfScenario.opExpDelta}%`}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowWhatIfModal(true)}
                className="px-2.5 py-1 bg-amber-500 text-slate-950 font-bold rounded-lg text-[11px] hover:bg-amber-400 cursor-pointer shadow-2xs"
              >
                Ajustar Parâmetros
              </button>
              <button
                type="button"
                onClick={() => setActiveWhatIfScenario(null)}
                className="px-2.5 py-1 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg text-[11px] cursor-pointer"
              >
                Limpar Cenário
              </button>
            </div>
          </div>
        )}

        {/* Banner de Diagnóstico Caixa vs Competência (Sugestão 2) */}
        {showCashReconciliation && (
          <div className={`border-b p-3.5 px-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs ${
            cashReconciliation.riskLevel === 'CRITICO' ? 'bg-rose-500/10 border-rose-500/30' :
            cashReconciliation.riskLevel === 'ALERTA' ? 'bg-amber-500/10 border-amber-500/30' :
            'bg-emerald-500/10 border-emerald-500/30'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold">
                {cashReconciliation.riskLevel === 'CRITICO' ? (
                  <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                ) : cashReconciliation.riskLevel === 'ALERTA' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span className={
                  cashReconciliation.riskLevel === 'CRITICO' ? 'text-rose-300' :
                  cashReconciliation.riskLevel === 'ALERTA' ? 'text-amber-300' :
                  'text-emerald-300'
                }>
                  Diagnóstico Caixa vs Competência: {cashReconciliation.riskTitle}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-black/20 uppercase">
                  Nível: {cashReconciliation.riskLevel}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] max-w-3xl">
                {cashReconciliation.riskDescription}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono shrink-0">
              <div className="bg-black/20 p-2 rounded-lg border border-white/5">
                <span className="text-[10px] text-slate-400 block">Realização de Receitas:</span>
                <strong className={`text-sm ${
                  cashReconciliation.overallRevenueRealizationRate >= 80 ? 'text-emerald-400' : 'text-amber-400'
                }`}>
                  {cashReconciliation.overallRevenueRealizationRate}%
                </strong>
                <span className="text-[10px] text-slate-400 block">({formatBRL(cashReconciliation.totalPendingRevenue)} pendente)</span>
              </div>

              <div className="bg-black/20 p-2 rounded-lg border border-white/5">
                <span className="text-[10px] text-slate-400 block">Geração Caixa Operacional:</span>
                <strong className={`text-sm ${
                  cashReconciliation.netOperatingCashGenerated >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {formatBRL(cashReconciliation.netOperatingCashGenerated)}
                </strong>
                <span className="text-[10px] text-slate-400 block">(Gap: {formatBRL(cashReconciliation.cashGap)})</span>
              </div>
            </div>
          </div>
        )}

        {/* Banner Informativo de Análise Horizontal e Vertical (Sugestão 4) */}
        {showHorizontalAnalysis && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Análise Horizontal (AH / MoM) e Vertical (AV) Ativada:
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Variações percentuais calculadas sobre o mês anterior (MoM). 
                <span className="text-emerald-700 dark:text-emerald-400 font-bold ml-1.5">● Verde:</span> favorável (expansão de receita/lucro ou economia de custos/despesas).
                <span className="text-rose-700 dark:text-rose-400 font-bold ml-1.5">● Vermelho:</span> desfavorável (queda de receita ou aumento de custos/despesas).
              </span>
            </div>
            <div className="text-[11px] font-mono text-amber-800 dark:text-amber-300 font-bold">
              Base AV: Receita Bruta ({formatBRL(kpis.grossRev)})
            </div>
          </div>
        )}

        {/* Banner Informativo de % nas Colunas (Análise Vertical por Mês) */}
        {showColumnPercentages && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 p-2.5 px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Percentual nas Colunas Mensais (Análise Vertical por Mês) Ativado:
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                Exibindo a representatividade (%) de cada conta e linha de resultado (Lucro Bruto, EBITDA, Margem Operacional e Resultado Líquido) calculada sobre a Receita Bruta do respectivo mês.
              </span>
            </div>
            <div className="text-[11px] font-mono text-amber-800 dark:text-amber-300 font-bold">
              Base AV Mensal: 100% Receita Bruta
            </div>
          </div>
        )}

        {/* Banner Executivo de Aderência Orçamentária */}
        {showBudgetVariance && budgetData && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 p-3 px-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Aderência Global ao Orçamento ({effectiveYear}):
              </span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] border ${
                budgetData.kpis.overallBudgetAdherence >= 90
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : budgetData.kpis.overallBudgetAdherence >= 75
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                {budgetData.kpis.overallBudgetAdherence.toFixed(1)}% de conformidade
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-700 dark:text-slate-300 font-mono">
              <div>
                Receita: <strong className="text-amber-900 dark:text-amber-300 font-bold">{formatBRL(budgetData.kpis.totalRealizedRevenue)}</strong>
                <span className="text-slate-500 dark:text-slate-400 ml-1">/ Meta {formatBRL(budgetData.kpis.totalPlannedRevenue)} ({budgetData.kpis.revenueExecutionRate.toFixed(0)}%)</span>
              </div>
              <div className="hidden sm:inline text-slate-500">•</div>
              <div>
                Gastos: <strong className={budgetData.kpis.costsExpensesExecutionRate > 100 ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-slate-900 dark:text-slate-200 font-bold'}>
                  {formatBRL(budgetData.kpis.totalRealizedCostsAndExpenses)}
                </strong>
                <span className="text-slate-500 dark:text-slate-400 ml-1">/ Teto {formatBRL(budgetData.kpis.totalPlannedCostsAndExpenses)} ({budgetData.kpis.costsExpensesExecutionRate.toFixed(0)}%)</span>
              </div>
            </div>
          </div>
        )}

        {/* Tabela do DRE com Layout Responsivo para 12 Meses Lado a Lado em Alta Legibilidade */}
        <div className={`max-h-[760px] scrollbar-thin ${canFitToScreen ? 'overflow-x-auto md:overflow-x-hidden' : 'overflow-x-auto'}`}>
          <table className={`w-full text-left border-collapse ${
            canFitToScreen ? 'table-fixed text-xs' : 'min-w-[1020px] text-xs'
          }`}>
            <thead className="sticky top-0 z-20 bg-slate-200/90 dark:bg-[#1b1b20] border-b-2 border-slate-300 dark:border-slate-600 shadow-xs">
              <tr className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                <th className={`py-2.5 px-2.5 sm:px-3 border-r border-slate-300 dark:border-slate-700 font-black min-w-[140px] max-w-[165px] sm:min-w-[240px] sticky left-0 z-30 bg-slate-200 dark:bg-[#1b1b20] shadow-sm ${
                  canFitToScreen ? 'w-[23%] sm:w-[24%]' : ''
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="truncate text-slate-900 dark:text-white font-extrabold">Estrutura / Categoria</span>
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 hidden lg:inline">
                      {isCollapsed ? '(Principal)' : '(Detalhado)'}
                    </span>
                  </div>
                </th>

                {/* Colunas dos Meses Selecionados (JAN a DEZ) */}
                {activeMonthIndices.map(mIdx => {
                  const mName = dreData.months[mIdx];
                  const isEven = mIdx % 2 === 0;

                  return (
                    <th 
                      key={mIdx} 
                      className={`py-2.5 px-1 sm:px-2 text-right border-r border-slate-300 dark:border-slate-700 font-extrabold uppercase tracking-tight text-xs ${
                        canFitToScreen 
                          ? 'w-[4.8%] sm:w-[5.1%]' 
                          : 'min-w-[70px]'
                      } ${
                        isEven ? 'bg-slate-100 dark:bg-[#141924]' : 'bg-slate-200/80 dark:bg-[#1b1b20]'
                      }`}
                    >
                      <span className="block truncate text-slate-900 dark:text-slate-100 font-extrabold">{mName}</span>
                      {showColumnPercentages && (
                        <span className="block text-[9px] text-amber-700 dark:text-amber-400 font-mono font-bold tracking-normal leading-none mt-0.5">
                          R$ / %
                        </span>
                      )}
                    </th>
                  );
                })}

                {/* Coluna de Total do Período (Simples ou Comparativo Lado a Lado) */}
                {regime === 'COMPARATIVO' ? (
                  <>
                    <th className={`py-2.5 px-2 text-right font-black text-amber-950 dark:text-amber-300 border-l-2 border-amber-500/50 bg-amber-500/15 dark:bg-amber-500/20 ${
                      canFitToScreen ? 'w-[7.5%] text-xs' : 'min-w-[85px] text-xs'
                    }`} title="Total apurado pelo Regime de Competência">
                      <span className="block truncate">Competência</span>
                    </th>
                    <th className={`py-2.5 px-2 text-right font-black text-emerald-950 dark:text-emerald-300 border-l border-emerald-500/40 bg-emerald-500/15 dark:bg-emerald-500/20 ${
                      canFitToScreen ? 'w-[7.5%] text-xs' : 'min-w-[85px] text-xs'
                    }`} title="Total liquidado efetivamente pelo Regime de Caixa">
                      <span className="block truncate">Caixa</span>
                    </th>
                    <th className={`py-2.5 px-1.5 text-right font-black text-slate-900 dark:text-slate-100 border-l border-slate-300 dark:border-slate-700 bg-slate-200/90 dark:bg-[#1b1b20] ${
                      canFitToScreen ? 'w-[6.2%] text-xs' : 'min-w-[75px] text-xs'
                    }`} title="Gap / Descolamento (Competência - Caixa)">
                      <span className="block truncate">Gap (R$)</span>
                    </th>
                    <th className={`py-2.5 px-1 text-right font-black text-amber-950 dark:text-amber-300 border-l border-amber-500/40 bg-amber-500/15 ${
                      canFitToScreen ? 'w-[5.5%] text-xs' : 'min-w-[65px] text-xs'
                    }`} title="Taxa de Realização Financeira em Caixa (% Liquidado / Competência)">
                      <span className="block truncate">% Realiz.</span>
                    </th>
                  </>
                ) : (
                  <th className={`py-2.5 px-2 text-right font-black text-amber-950 dark:text-amber-300 border-l-2 border-amber-500/50 bg-amber-500/15 dark:bg-amber-500/20 ${
                    canFitToScreen 
                      ? 'w-[9.4%] text-xs' 
                      : 'min-w-[100px] text-xs'
                  }`}>
                    <span className="block truncate">{totalColLabel}</span>
                  </th>
                )}

                {/* Colunas Opcionais de Desvio Orçamentário (Orçado e Desvio %) */}
                {showBudgetVariance && (
                  <>
                    <th className={`py-2.5 px-2 text-right font-black text-amber-900 dark:text-amber-300 border-l border-amber-500/30 bg-amber-500/10 ${
                      canFitToScreen ? 'w-[7%] text-xs' : 'min-w-[90px] text-xs'
                    }`}>
                      <span className="block truncate">Orçado</span>
                    </th>
                    <th className={`py-2.5 px-1.5 text-right font-black text-slate-900 dark:text-slate-100 border-l border-slate-300 dark:border-slate-700 bg-slate-200/90 dark:bg-[#1b1b20] ${
                      canFitToScreen ? 'w-[6.5%] text-xs' : 'min-w-[80px] text-xs'
                    }`}>
                      <span className="block truncate">Desvio %</span>
                    </th>
                  </>
                )}

                {/* Coluna de Conciliação Caixa x Competência (Sugestão 2) */}
                {showCashReconciliation && (
                  <th className={`py-2.5 px-1.5 text-right font-black text-amber-950 dark:text-amber-300 border-l border-amber-500/40 bg-amber-500/15 ${
                    canFitToScreen ? 'w-[6.2%] text-xs' : 'min-w-[75px] text-xs'
                  }`} title="Taxa de realização financeira em caixa (% liquidado dos títulos vinculados a esta rubrica)">
                    <span className="block truncate">% Caixa</span>
                  </th>
                )}

                {/* Análise Vertical % AV */}
                <th className={`py-2.5 px-1.5 text-right font-black text-slate-900 dark:text-slate-200 border-l border-slate-300 dark:border-slate-700 bg-slate-200/90 dark:bg-[#1b1b20] ${
                  canFitToScreen 
                    ? 'w-[5.4%] text-xs' 
                    : 'min-w-[70px] text-xs'
                }`} title="Análise Vertical: Percentual de participação da rubrica sobre a Receita Operacional Bruta">
                  <span className="block truncate">% AV</span>
                </th>

                {/* Análise Horizontal % AH (Sugestão 4) */}
                {showHorizontalAnalysis && (
                  <th className={`py-2.5 px-1.5 text-right font-black text-amber-950 dark:text-amber-300 border-l border-amber-500/40 bg-amber-500/10 ${
                    canFitToScreen 
                      ? 'w-[5.6%] text-xs' 
                      : 'min-w-[75px] text-xs'
                  }`} title="Análise Horizontal: Evolução acumulada do período (Primeiro mês ativo vs脱ltimo mês ativo)">
                    <span className="block truncate">% AH</span>
                  </th>
                )}

                {/* Minigráfico de Tendência Sparkline (Sugestão 3) */}
                {showSparklines && (
                  <th className={`py-2.5 px-1 text-center font-black text-slate-900 dark:text-slate-200 border-l border-slate-300 dark:border-slate-700 bg-slate-200/90 dark:bg-[#1b1b20] ${
                    canFitToScreen 
                      ? 'w-[5.2%] text-[10px]' 
                      : 'min-w-[65px] text-[10px]'
                  }`}>
                    <span className="block truncate">Tendência</span>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {visibleLines.map(line => {
                const isSummary = line.isSummary;
                const isRevenue = line.type === 'RECEITA' || line.code?.startsWith('1') || line.id === 'h-1';
                const isDeduction = line.type === 'DEDUCAO' || line.code?.startsWith('2') || line.id === 'h-2';
                const isCost = line.type === 'CUSTO' || line.code?.startsWith('3') || line.id === 'h-3';
                const isExpense = line.type === 'DESPESA' || line.code?.startsWith('4') || line.id === 'h-4' || line.id.startsWith('h-4.');
                const isFinancial = line.code?.startsWith('5') || line.code?.startsWith('6') || line.id === 'h-5' || line.id.startsWith('h-5.');
                
                const periodTotal = getLinePeriodTotal(line);
                const av = grossRevenueBase > 0 ? (periodTotal / grossRevenueBase) * 100 : 0;
                const isSectionCollapsed = isCollapsed || collapsedSections.has(line.id);

                // Estilização com degradês e categorias de acordo com a natureza no padrão Leão Dourado
                let rowBg = 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20 text-slate-900 dark:text-slate-100';
                let stickyBg = 'bg-white dark:bg-[#131316]';
                let valueColor = 'text-slate-900 dark:text-slate-100 font-semibold';

                if (isSummary) {
                  // Linhas de Resumo Executivo / Resultados Parciais
                  rowBg = 'bg-amber-500/15 dark:bg-amber-500/20 font-black text-amber-950 dark:text-amber-300 border-y-2 border-amber-500/50';
                  stickyBg = 'bg-amber-100 dark:bg-[#1c1a14] text-amber-950 dark:text-amber-300';
                  valueColor = 'text-amber-950 dark:text-amber-300 font-black';
                } else if (line.level === 0) {
                  // Cabeçalho de Grupo Principal
                  if (isRevenue || isDeduction) {
                    rowBg = 'bg-amber-50/80 dark:bg-amber-950/40 font-black text-amber-950 dark:text-amber-300 uppercase tracking-wider border-t-2 border-slate-300 dark:border-slate-700';
                    stickyBg = 'bg-amber-50 dark:bg-[#131316] text-amber-950 dark:text-amber-300';
                    valueColor = 'text-amber-950 dark:text-amber-300 font-black';
                  } else {
                    rowBg = 'bg-slate-100 dark:bg-slate-800/80 font-black text-slate-950 dark:text-white uppercase tracking-wider border-t-2 border-slate-300 dark:border-slate-700';
                    stickyBg = 'bg-slate-100 dark:bg-[#131316] text-slate-950 dark:text-white';
                    valueColor = 'text-slate-950 dark:text-white font-black';
                  }
                } else {
                  // Linhas analíticas detalhadas
                  if (isRevenue || isDeduction) {
                    valueColor = 'text-amber-900 dark:text-amber-300 font-semibold';
                  } else {
                    valueColor = 'text-slate-900 dark:text-slate-100 font-semibold';
                  }
                }

                return (
                  <tr key={line.id} className={`${rowBg} transition-colors`}>
                    {/* Descrição da Rubrica com Recuo Hierárquico e Botão de Expandir/Recolher */}
                    <td 
                      className={`py-2 px-2 sm:px-2.5 sticky left-0 z-10 border-r border-slate-300 dark:border-slate-700 shadow-sm min-w-[140px] max-w-[165px] sm:min-w-[240px] ${stickyBg} ${
                        canFitToScreen ? 'w-[23%] sm:w-[24%]' : ''
                      }`}
                      style={{ paddingLeft: isCollapsed ? '10px' : `${Math.min(line.level * 10 + 8, 28)}px` }}
                    >
                      <div className="flex items-center space-x-1 sm:space-x-1.5 min-w-0">
                        {/* Chevron interativo de seção para cabeçalhos com filhos (apenas no modo expandido) */}
                        {line.isHeader && !isCollapsed && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSection(line.id);
                            }}
                            className="p-0.5 -ml-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-amber-700 dark:text-amber-400 transition-colors shrink-0"
                            title={isSectionCollapsed ? "Clique para expandir subcategorias" : "Clique para recolher subcategorias"}
                          >
                            {isSectionCollapsed ? (
                              <ChevronRight className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        {line.code && (
                          <span className="font-mono text-[10px] text-amber-800 dark:text-amber-400 font-extrabold shrink-0 hidden sm:inline">
                            {line.code}
                          </span>
                        )}

                        <span 
                          className={`truncate text-xs ${isSummary || line.level === 0 ? 'font-extrabold text-slate-950 dark:text-white' : 'font-semibold text-slate-900 dark:text-slate-100'}`} 
                          title={line.name}
                        >
                          {line.name}
                        </span>
                      </div>
                    </td>

                    {/* Valores dos Meses */}
                    {activeMonthIndices.map(mIdx => {
                      const val = line.valuesByMonth[mIdx] || 0;
                      const isEven = mIdx % 2 === 0;
                      const prevVal = mIdx > 0 ? (line.valuesByMonth[mIdx - 1] || 0) : null;
                      const mom = prevVal !== null ? calculateVarianceAH(val, prevVal, isLineDebitNature(line)) : null;
                      const monthGrossRev = grossRevLine ? (grossRevLine.valuesByMonth[mIdx] || 0) : 0;
                      const monthPct = monthGrossRev > 0 ? (val / monthGrossRev) * 100 : null;

                      return (
                        <td 
                          key={mIdx} 
                          onClick={() => !isSummary && handleOpenDrillDown(line, mIdx, regime === 'COMPARATIVO' ? 'COMPETENCIA' : regime)}
                          title={`${line.name} • ${dreData.months[mIdx]}/${effectiveYear}: ${formatBRL(val)}${monthPct !== null ? ` (${monthPct.toFixed(1)}% da Rec. Bruta)` : ''} (Clique para auditar)`}
                          className={`py-2 px-1 sm:px-1.5 text-right font-mono border-r border-slate-200 dark:border-slate-800 transition-colors tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs ${
                            !isSummary ? 'cursor-pointer hover:bg-amber-500/20 hover:text-amber-900 dark:hover:text-amber-200' : ''
                          } ${
                            isEven ? 'bg-slate-50/70 dark:bg-slate-900/40' : ''
                          } ${
                            val === 0 ? 'text-slate-400 dark:text-slate-500 font-normal' : valueColor
                          }`}
                        >
                          <div>{formatCellValue(val)}</div>
                          {showColumnPercentages && (
                            <div 
                              className={`text-[9px] sm:text-[10px] font-mono mt-0.5 leading-none ${
                                monthPct === null || monthPct === 0
                                  ? 'text-slate-400 dark:text-slate-500'
                                  : isSummary
                                  ? 'text-amber-800 dark:text-amber-300 font-extrabold'
                                  : 'text-slate-600 dark:text-slate-400 font-medium'
                              }`}
                              title={monthGrossRev > 0 ? `${monthPct!.toFixed(1)}% da Receita Bruta de ${dreData.months[mIdx]}` : 'Sem receita apurada neste mês'}
                            >
                              {monthPct !== null ? `${monthPct.toFixed(1)}%` : '-'}
                            </div>
                          )}
                          {showHorizontalAnalysis && (
                            <div 
                              className={`text-[9px] sm:text-[10px] font-mono font-bold flex items-center justify-end gap-0.5 mt-0.5 leading-none ${
                                !mom ? 'text-slate-400 dark:text-slate-500' :
                                mom.status === 'FAVORABLE'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : mom.status === 'UNFAVORABLE'
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                              title={mIdx > 0 && mom
                                ? `Variação MoM vs ${dreData.months[mIdx - 1]}: ${mom.diff >= 0 ? '+' : ''}${formatBRL(mom.diff)} (${mom.label})` 
                                : `Mês inicial base: ${formatBRL(val)}`
                              }
                            >
                              <span>{mIdx === 0 ? 'Base' : mom ? mom.label : '-'}</span>
                              {mIdx > 0 && mom && mom.pct > 0.1 && <ArrowUpRight className="w-2.5 h-2.5 inline shrink-0" />}
                              {mIdx > 0 && mom && mom.pct < -0.1 && <ArrowDownRight className="w-2.5 h-2.5 inline shrink-0" />}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Bloco de Totais: Comparativo (Competência, Caixa, Gap, % Realização) ou Simples */}
                    {regime === 'COMPARATIVO' ? (() => {
                      const compVal = periodTotal;
                      const cashVal = getLinePeriodCashTotal(line);
                      const gapVal = Math.round((compVal - cashVal) * 100) / 100;
                      const realRate = compVal > 0 
                        ? Math.min(Math.round((cashVal / compVal) * 100), 999) 
                        : (cashVal > 0 ? 100 : 0);

                      return (
                        <>
                          {/* Competência */}
                          <td 
                            onClick={() => !isSummary && handleOpenDrillDown(line, -1, 'COMPETENCIA')}
                            title={`Competência • ${line.name}: ${formatBRL(compVal)}`}
                            className={`py-2 px-1.5 sm:px-2 text-right font-bold font-mono bg-amber-500/10 dark:bg-amber-500/15 border-l-2 border-amber-500/50 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs ${
                              !isSummary ? 'cursor-pointer hover:bg-amber-500/25' : ''
                            } ${valueColor}`}
                          >
                            {formatCellValue(compVal)}
                          </td>
                          {/* Caixa Realizado */}
                          <td 
                            onClick={() => !isSummary && handleOpenDrillDown(line, -1, 'CAIXA')}
                            title={`Caixa Realizado • ${line.name}: ${formatBRL(cashVal)}`}
                            className={`py-2 px-1.5 sm:px-2 text-right font-bold font-mono bg-emerald-500/10 dark:bg-emerald-500/15 border-l border-emerald-500/30 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs ${
                              !isSummary ? 'cursor-pointer hover:bg-emerald-500/25' : ''
                            } ${cashVal > 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-400'}`}
                          >
                            {formatCellValue(cashVal)}
                          </td>
                          {/* Gap (R$) */}
                          <td 
                            title={`Gap Financeiro (Competência - Caixa) • ${line.name}: ${formatBRL(gapVal)}`}
                            className={`py-2 px-1.5 text-right font-mono text-xs border-l border-slate-200 dark:border-slate-800 tabular-nums whitespace-nowrap overflow-hidden ${
                              gapVal === 0 ? 'text-slate-400' : gapVal > 0 ? 'text-amber-700 dark:text-amber-300 font-semibold' : 'text-indigo-600 dark:text-indigo-400 font-semibold'
                            }`}
                          >
                            {formatCellValue(gapVal)}
                          </td>
                          {/* % Realizado */}
                          <td 
                            title={`Taxa de Realização Financeira em Caixa: ${realRate}%`}
                            className={`py-2 px-1 text-right font-mono text-[11px] font-bold border-l border-amber-500/30 tabular-nums whitespace-nowrap overflow-hidden ${
                              compVal === 0 ? 'text-slate-400' :
                              realRate >= 80 ? 'text-emerald-700 dark:text-emerald-400' :
                              realRate < 50 ? 'text-rose-700 dark:text-rose-400' :
                              'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {compVal !== 0 ? `${realRate}%` : '-'}
                          </td>
                        </>
                      );
                    })() : (
                      <td 
                        onClick={() => !isSummary && handleOpenDrillDown(line, -1, regime)}
                        title={`Total Exercício • ${line.name}: ${formatBRL(periodTotal)}`}
                        className={`py-2 px-1.5 sm:px-2 text-right font-bold font-mono bg-amber-500/15 dark:bg-amber-500/20 border-l-2 border-amber-500/50 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs ${
                          !isSummary ? 'cursor-pointer hover:bg-amber-500/25 hover:text-amber-950 dark:hover:text-amber-200' : ''
                        } ${valueColor}`}
                      >
                        {formatCellValue(periodTotal)}
                      </td>
                    )}

                    {/* Colunas Opcionais de Orçado e Desvio % (Sugestão 3) */}
                    {showBudgetVariance && (() => {
                      const plannedVal = getBudgetPlannedForLine(line);
                      const varianceNom = periodTotal - plannedVal;
                      const variancePct = plannedVal !== 0 ? (varianceNom / Math.abs(plannedVal)) * 100 : 0;
                      
                      const isCostOrExp = line.nature === 'DEBITO' || line.id.startsWith('dre-custo') || line.id.startsWith('dre-desp');
                      const isFavorable = isCostOrExp ? varianceNom <= 0 : varianceNom >= 0;
                      const isNearZero = Math.abs(variancePct) <= 5;
                      
                      const varianceColor = isNearZero 
                        ? 'text-amber-400 font-bold' 
                        : isFavorable 
                        ? 'text-emerald-400 font-bold' 
                        : 'text-rose-400 font-bold';

                      return (
                        <>
                          <td 
                            title={`Orçado • ${line.name}: ${formatBRL(plannedVal)}`}
                            className="py-2 px-1.5 text-right font-mono text-xs text-slate-400 border-l border-amber-500/20 bg-amber-500/[0.03] tabular-nums whitespace-nowrap overflow-hidden"
                          >
                            {plannedVal !== 0 ? formatCellValue(plannedVal) : '-'}
                          </td>
                          <td 
                            title={`Desvio Orçamentário • Diferença: ${formatBRL(varianceNom)} (${variancePct.toFixed(1)}%)`}
                            className={`py-2 px-1.5 text-right font-mono text-xs border-l border-slate-200 dark:border-slate-800 tabular-nums whitespace-nowrap overflow-hidden ${varianceColor}`}
                          >
                            {plannedVal !== 0 ? `${variancePct > 0 ? '+' : ''}${variancePct.toFixed(1)}%` : '-'}
                          </td>
                        </>
                      );
                    })()}

                    {/* Coluna de Conciliação Caixa x Competência (Sugestão 2) */}
                    {showCashReconciliation && (() => {
                      const cashMetric = DRECashReconciliationEngine.getLineCashRealization(line.matchedTitleIds, allTitles);
                      const isHighRealized = cashMetric.rate >= 80;
                      const isLowRealized = cashMetric.rate < 50 && cashMetric.competence > 0;
                      return (
                        <td 
                          title={`Conciliação Caixa: Faturado: ${formatBRL(cashMetric.competence)} | Liquidado em Caixa: ${formatBRL(cashMetric.settled)} | Saldo Pendente: ${formatBRL(cashMetric.pending)}`}
                          className={`py-2 px-1.5 text-right font-mono text-[11px] font-bold border-l border-slate-200 dark:border-slate-800 tabular-nums whitespace-nowrap overflow-hidden ${
                            cashMetric.competence === 0 ? 'text-slate-400 dark:text-slate-500' :
                            isHighRealized ? 'text-emerald-700 dark:text-emerald-400' :
                            isLowRealized ? 'text-rose-700 dark:text-rose-400' :
                            'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {cashMetric.competence > 0 ? `${cashMetric.rate}%` : '-'}
                        </td>
                      );
                    })()}

                    {/* Análise Vertical (%) */}
                    <td 
                      title={`Análise Vertical: ${periodTotal !== 0 ? (av ?? 0).toFixed(1) : 0}% da Receita Bruta`}
                      className={`py-2 px-1 sm:px-1.5 text-right font-mono text-[11px] text-slate-700 dark:text-slate-300 font-semibold border-l border-slate-200 dark:border-slate-800 tabular-nums whitespace-nowrap overflow-hidden`}
                    >
                      {periodTotal !== 0 ? `${(av ?? 0).toFixed(1)}%` : '-'}
                    </td>

                    {/* Análise Horizontal (%) - Evolução Periódica (Sugestão 4) */}
                    {showHorizontalAnalysis && (() => {
                      const ahEv = getLinePeriodAHEvolution(line);
                      if (!ahEv) {
                        return (
                          <td className="py-2 px-1 text-right font-mono text-[11px] text-slate-400 border-l border-amber-500/20 bg-amber-500/[0.02]">
                            -
                          </td>
                        );
                      }
                      const color = ahEv.status === 'FAVORABLE' 
                        ? 'text-emerald-700 dark:text-emerald-400' 
                        : ahEv.status === 'UNFAVORABLE' 
                        ? 'text-rose-700 dark:text-rose-400' 
                        : 'text-slate-400 dark:text-slate-500';
                      return (
                        <td 
                          title={`Evolução AH no Período: ${ahEv.label} (${dreData.months[activeMonthIndices[0]]} → ${dreData.months[activeMonthIndices[activeMonthIndices.length - 1]]})`}
                          className={`py-2 px-1 sm:px-1.5 text-right font-mono text-[11px] font-bold border-l border-amber-500/30 bg-amber-500/[0.04] tabular-nums whitespace-nowrap overflow-hidden ${color}`}
                        >
                          <div className="flex items-center justify-end gap-0.5">
                            <span>{ahEv.label}</span>
                            {ahEv.pct > 0.1 && <ArrowUpRight className="w-2.5 h-2.5 inline shrink-0" />}
                            {ahEv.pct < -0.1 && <ArrowDownRight className="w-2.5 h-2.5 inline shrink-0" />}
                          </div>
                        </td>
                      );
                    })()}

                    {/* Minigráfico de Tendência Sparkline (Sugestão 3) */}
                    {showSparklines && (
                      <td className="py-2 px-1 text-center border-l border-slate-200 dark:border-slate-800 whitespace-nowrap overflow-hidden">
                        <Sparkline values={activeMonthIndices.map(i => line.valuesByMonth[i] || 0)} />
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* Linha Final: (=) RESULTADO LÍQUIDO DO EXERCÍCIO */}
              <tr className="bg-amber-500/15 dark:bg-amber-500/20 text-amber-950 dark:text-amber-300 font-extrabold text-xs sm:text-sm border-y-2 border-amber-500">
                <td className={`py-2.5 px-2 sm:px-2.5 sticky left-0 bg-amber-100 dark:bg-[#1a1812] z-10 border-r border-amber-500/50 shadow-sm min-w-[140px] max-w-[165px] sm:min-w-[240px] ${
                  canFitToScreen ? 'w-[23%] sm:w-[24%]' : ''
                }`}>
                  <div className="flex items-center space-x-1 sm:space-x-1.5 min-w-0">
                    <span className="font-mono text-[10px] text-black bg-amber-400 font-extrabold px-1.5 py-0.5 rounded-sm shrink-0">9</span>
                    <span className="truncate text-xs sm:text-sm font-extrabold uppercase tracking-tight text-amber-950 dark:text-amber-300">(=) RESULTADO LÍQUIDO</span>
                  </div>
                </td>

                {activeMonthIndices.map(mIdx => {
                  const net = dreData.netResults[mIdx] || 0;
                  const prevNet = mIdx > 0 ? (dreData.netResults[mIdx - 1] || 0) : null;
                  const mom = prevNet !== null ? calculateVarianceAH(net, prevNet, false) : null;
                  const monthGrossRev = grossRevLine ? (grossRevLine.valuesByMonth[mIdx] || 0) : 0;
                  const netMonthPct = monthGrossRev > 0 ? (net / monthGrossRev) * 100 : null;

                  return (
                    <td 
                      key={mIdx} 
                      title={`Resultado Líquido • ${dreData.months[mIdx]}/${effectiveYear}: ${formatBRL(net)}${netMonthPct !== null ? ` (Margem Líquida: ${netMonthPct.toFixed(1)}%)` : ''}`}
                      className={`py-2.5 px-1 sm:px-1.5 text-right font-mono font-bold border-r border-amber-500/30 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs ${
                        net >= 0 ? 'text-amber-950 dark:text-amber-300' : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      <div>{net !== 0 ? (net > 0 ? `+${formatCellValue(net)}` : formatCellValue(net)) : '-'}</div>
                      {showColumnPercentages && (
                        <div 
                          className={`text-[9px] sm:text-[10px] font-mono font-black mt-0.5 leading-none ${
                            netMonthPct === null || netMonthPct === 0
                              ? 'text-slate-400 dark:text-slate-500'
                              : netMonthPct >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                          title={monthGrossRev > 0 ? `Margem Líquida em ${dreData.months[mIdx]}: ${netMonthPct!.toFixed(1)}%` : 'Sem receita apurada neste mês'}
                        >
                          {netMonthPct !== null ? `${netMonthPct >= 0 ? '+' : ''}${netMonthPct.toFixed(1)}%` : '-'}
                        </div>
                      )}
                      {showHorizontalAnalysis && (
                        <div 
                          className={`text-[9px] sm:text-[10px] font-mono font-bold flex items-center justify-end gap-0.5 mt-0.5 leading-none ${
                            !mom ? 'text-slate-400 dark:text-slate-500' :
                            mom.status === 'FAVORABLE'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : mom.status === 'UNFAVORABLE'
                              ? 'text-rose-700 dark:text-rose-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                          title={mIdx > 0 && mom 
                            ? `Variação Resultado Líquido vs ${dreData.months[mIdx - 1]}: ${mom.diff >= 0 ? '+' : ''}${formatBRL(mom.diff)} (${mom.label})` 
                            : `Mês inicial base: ${formatBRL(net)}`
                          }
                        >
                          <span>{mIdx === 0 ? 'Base' : mom ? mom.label : '-'}</span>
                          {mIdx > 0 && mom && mom.pct > 0.1 && <ArrowUpRight className="w-2.5 h-2.5 inline shrink-0" />}
                          {mIdx > 0 && mom && mom.pct < -0.1 && <ArrowDownRight className="w-2.5 h-2.5 inline shrink-0" />}
                        </div>
                      )}
                    </td>
                  );
                })}

                {regime === 'COMPARATIVO' ? (() => {
                  const netComp = getNetResultPeriodTotal();
                  const netCash = getNetResultPeriodCashTotal();
                  const netGap = Math.round((netComp - netCash) * 100) / 100;
                  const netRealRate = netComp > 0 ? Math.min(Math.round((netCash / netComp) * 100), 999) : (netCash > 0 ? 100 : 0);

                  return (
                    <>
                      {/* Competência */}
                      <td 
                        title={`Resultado Líquido (Competência): ${formatBRL(netComp)}`}
                        className={`py-2.5 px-1.5 sm:px-2 text-right font-mono font-extrabold bg-amber-500/20 dark:bg-amber-500/25 border-l-2 border-amber-500 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs sm:text-sm ${
                          netComp >= 0 ? 'text-amber-950 dark:text-amber-300' : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {netComp >= 0 ? '+' : ''}{formatCellValue(netComp)}
                      </td>
                      {/* Caixa Realizado */}
                      <td 
                        title={`Resultado Líquido (Caixa Realizado): ${formatBRL(netCash)}`}
                        className={`py-2.5 px-1.5 sm:px-2 text-right font-mono font-extrabold bg-emerald-500/20 dark:bg-emerald-500/25 border-l border-emerald-500 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs sm:text-sm ${
                          netCash >= 0 ? 'text-emerald-950 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {netCash >= 0 ? '+' : ''}{formatCellValue(netCash)}
                      </td>
                      {/* Gap */}
                      <td 
                        title={`Gap de Liquidez (Competência - Caixa): ${formatBRL(netGap)}`}
                        className="py-2.5 px-1.5 text-right font-mono font-bold text-xs border-l border-amber-500/30 tabular-nums whitespace-nowrap"
                      >
                        {formatCellValue(netGap)}
                      </td>
                      {/* % Realizado */}
                      <td 
                        title={`Taxa de Realização Líquida em Caixa: ${netRealRate}%`}
                        className={`py-2.5 px-1 text-right font-mono text-[11px] font-black border-l border-amber-500/40 tabular-nums whitespace-nowrap ${
                          netRealRate >= 80 ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {netComp !== 0 ? `${netRealRate}%` : '-'}
                      </td>
                    </>
                  );
                })() : (
                  <td 
                    title={`Resultado Líquido Total do Exercício: ${formatBRL(getNetResultPeriodTotal())}`}
                    className={`py-2.5 px-1.5 sm:px-2 text-right font-mono font-extrabold bg-amber-500/20 dark:bg-amber-500/25 border-l-2 border-amber-500 tabular-nums whitespace-nowrap overflow-hidden text-ellipsis text-xs sm:text-sm ${
                      getNetResultPeriodTotal() >= 0 ? 'text-amber-950 dark:text-amber-300' : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {getNetResultPeriodTotal() >= 0 ? '+' : ''}{formatCellValue(getNetResultPeriodTotal())}
                  </td>
                )}

                {/* Colunas Opcionais de Orçado e Desvio % no Resultado Líquido */}
                {showBudgetVariance && budgetData && (() => {
                  const netPlanned = budgetData.kpis.plannedNetIncome || 0;
                  const netRealized = getNetResultPeriodTotal();
                  const netVar = netRealized - netPlanned;
                  const netVarPct = netPlanned !== 0 ? (netVar / Math.abs(netPlanned)) * 100 : 0;
                  const isNetFav = netVar >= 0;

                  return (
                    <>
                      <td 
                        title={`Resultado Líquido Orçado: ${formatBRL(netPlanned)}`}
                        className="py-2.5 px-2 text-right font-mono text-xs font-bold text-amber-300 border-l border-amber-500/40 bg-amber-500/10 tabular-nums whitespace-nowrap"
                      >
                        {formatCellValue(netPlanned)}
                      </td>
                      <td 
                        title={`Desvio Resultado Líquido: ${formatBRL(netVar)} (${netVarPct.toFixed(1)}%)`}
                        className={`py-2.5 px-2 text-right font-mono text-xs font-black border-l border-amber-500/40 tabular-nums whitespace-nowrap ${
                          isNetFav ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {netPlanned !== 0 ? `${netVarPct > 0 ? '+' : ''}${netVarPct.toFixed(1)}%` : '-'}
                      </td>
                    </>
                  );
                })()}

                {/* Realização Líquida Caixa no Resultado Final (Sugestão 2) */}
                {showCashReconciliation && (
                  <td 
                    title={`Geração Operacional de Caixa: ${formatBRL(cashReconciliation.netOperatingCashGenerated)} • Gap de Liquidez vs Lucro Contábil: ${formatBRL(cashReconciliation.cashGap)}`}
                    className={`py-2.5 px-1.5 text-right font-mono text-xs font-black border-l border-amber-500/40 bg-amber-500/15 tabular-nums whitespace-nowrap ${
                      cashReconciliation.netOperatingCashGenerated >= 0 ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-400'
                    }`}
                  >
                    {cashReconciliation.overallRevenueRealizationRate}%
                  </td>
                )}

                <td className="py-2.5 px-1 sm:px-1.5 text-right font-mono text-xs text-amber-900 dark:text-amber-300 border-l border-amber-500/40 font-bold tabular-nums whitespace-nowrap overflow-hidden">
                  {grossRevenueBase > 0 ? `${((getNetResultPeriodTotal() / grossRevenueBase) * 100).toFixed(1)}%` : '0%'}
                </td>

                {/* % AH para Resultado Líquido */}
                {showHorizontalAnalysis && (() => {
                  const netAHEv = getNetResultPeriodAHEvolution();
                  if (!netAHEv) {
                    return (
                      <td className="py-2.5 px-1 sm:px-1.5 text-right font-mono text-xs text-amber-900/60 dark:text-amber-300/60 border-l border-amber-500/40">
                        -
                      </td>
                    );
                  }
                  const color = netAHEv.status === 'FAVORABLE'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : netAHEv.status === 'UNFAVORABLE'
                    ? 'text-rose-700 dark:text-rose-400'
                    : 'text-amber-900 dark:text-amber-300';
                  return (
                    <td 
                      title={`Evolução AH Resultado Líquido: ${netAHEv.label} (${dreData.months[activeMonthIndices[0]]} → ${dreData.months[activeMonthIndices[activeMonthIndices.length - 1]]})`}
                      className={`py-2.5 px-1 sm:px-1.5 text-right font-mono text-xs font-black border-l border-amber-500/40 tabular-nums whitespace-nowrap overflow-hidden ${color}`}
                    >
                      <div className="flex items-center justify-end gap-0.5">
                        <span>{netAHEv.label}</span>
                        {netAHEv.pct > 0.1 && <ArrowUpRight className="w-2.5 h-2.5 inline shrink-0" />}
                        {netAHEv.pct < -0.1 && <ArrowDownRight className="w-2.5 h-2.5 inline shrink-0" />}
                      </div>
                    </td>
                  );
                })()}

                {/* Minigráfico de Tendência Sparkline para o Resultado Líquido (Sugestão 3) */}
                {showSparklines && (
                  <td className="py-2.5 px-1 text-center border-l border-amber-500/40 whitespace-nowrap overflow-hidden">
                    <Sparkline values={activeMonthIndices.map(i => dreData.netResults[i] || 0)} isNetResult />
                  </td>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down Modal com Design Moderno */}
      {/* Drill-down Modal com Design Moderno */}
      {drillDownItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-[var(--border-subtle)] flex flex-col max-h-[88vh]">
            
            {/* Cabeçalho do Drill-Down */}
            <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Rastreabilidade Contábil (Drill-Down DRE)
                  </span>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                    drillDownItem.regimeMode === 'COMPETENCIA'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {drillDownItem.regimeMode === 'COMPETENCIA' ? 'Regime de Competência' : 'Regime de Caixa'}
                  </span>
                </div>
                <h2 className="text-base font-bold text-[var(--text-primary)] mt-1.5 flex items-center gap-2">
                  <span>{drillDownItem.line.code ? `${drillDownItem.line.code} - ` : ''}{drillDownItem.line.name}</span>
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[var(--text-secondary)]">
                  <span>Período: <strong className="text-[var(--text-primary)]">{drillDownItem.monthName}</strong> • {filteredDrillDownTitles.length} lançamento(s) vinculados</span>
                  <span className={`px-2.5 py-0.5 rounded-md font-mono font-bold text-[11px] border ${
                    drillDownItem.regimeMode === 'CAIXA'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  }`} title="Soma total apurada dos lançamentos detalhados para esta rubrica no período">
                    Total na DRE: {formatBRL(drillDownTotalAmount)}
                  </span>
                  {drillDownItem.monthIdx > 0 && (() => {
                    const currentVal = drillDownItem.line.valuesByMonth[drillDownItem.monthIdx] || 0;
                    const prevVal = drillDownItem.line.valuesByMonth[drillDownItem.monthIdx - 1] || 0;
                    const mom = calculateVarianceAH(currentVal, prevVal, isLineDebitNature(drillDownItem.line));
                    return (
                      <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[11px] border ${
                        mom.status === 'FAVORABLE'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                          : mom.status === 'UNFAVORABLE'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                          : 'bg-slate-500/10 border-slate-500/30 text-slate-300'
                      }`} title={`Variação MoM em relação a ${dreData.months[drillDownItem.monthIdx - 1]}: ${formatBRL(mom.diff)}`}>
                        MoM: {mom.label}
                      </span>
                    );
                  })()}
                  {grossRevenueBase > 0 && (() => {
                    const val = drillDownItem.monthIdx >= 0 
                      ? (drillDownItem.line.valuesByMonth[drillDownItem.monthIdx] || 0)
                      : getLinePeriodTotal(drillDownItem.line);
                    const av = (val / grossRevenueBase) * 100;
                    return (
                      <span className="px-2 py-0.5 rounded-md font-mono font-semibold text-[11px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        AV: {av.toFixed(1)}% Rec. Bruta
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Controles do Cabeçalho: Alternância de Regime e Fechar */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <div className="flex items-center bg-black/20 p-0.5 rounded-lg border border-[var(--border-subtle)] text-xs">
                  <button
                    type="button"
                    onClick={() => setDrillDownItem(prev => prev ? ({ ...prev, regimeMode: 'COMPETENCIA' }) : null)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      drillDownItem.regimeMode === 'COMPETENCIA'
                        ? 'bg-amber-500 text-[#18181b] shadow-xs font-bold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="Filtrar por data de competência contábil"
                  >
                    Competência
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrillDownItem(prev => prev ? ({ ...prev, regimeMode: 'CAIXA' }) : null)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      drillDownItem.regimeMode === 'CAIXA'
                        ? 'bg-emerald-500 text-[#18181b] shadow-xs font-bold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    title="Filtrar por data efetiva de pagamento/liquidação em caixa"
                  >
                    Caixa Realizado
                  </button>
                </div>

                <button 
                  onClick={() => setDrillDownItem(null)} 
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] cursor-pointer"
                  title="Fechar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Abas do Drill-Down (Melhoria 2) */}
            <div className="flex border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]/50 px-5 pt-2">
              <button
                type="button"
                onClick={() => setDrillDownTab('TITLES')}
                className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  drillDownTab === 'TITLES'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Lançamentos Detalhados ({filteredDrillDownTitles.length})
              </button>

              <button
                type="button"
                onClick={() => setDrillDownTab('CONCENTRATION')}
                className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  drillDownTab === 'CONCENTRATION'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Raio-X de Concentração ({drillDownConcentration?.totalCounterparties || 0})
                {drillDownConcentration?.riskLevel === 'ALTO' && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Alta concentração detectada" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setDrillDownTab('CASH_RECONCILIATION')}
                className={`pb-2.5 px-4 text-xs font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  drillDownTab === 'CASH_RECONCILIATION'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                Conciliação Caixa (Liquidações)
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {drillDownTab === 'CONCENTRATION' ? (
                /* Visualização de Raio-X de Concentração (Melhoria 2) */
                <div className="space-y-4">
                  {drillDownConcentration ? (
                    <>
                      {/* Alerta de Risco de Dependência */}
                      <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                        drillDownConcentration.riskLevel === 'ALTO'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                          : drillDownConcentration.riskLevel === 'MEDIO'
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      }`}>
                        {drillDownConcentration.riskLevel === 'ALTO' ? (
                          <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                        ) : drillDownConcentration.riskLevel === 'MEDIO' ? (
                          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                        ) : (
                          <Building2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
                        )}
                        <div className="space-y-1">
                          <div className="font-bold text-xs flex items-center gap-2">
                            <span>Diagnóstico de Risco: Nível {drillDownConcentration.riskLevel}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full uppercase font-mono bg-black/20">
                              Top 1: {drillDownConcentration.top1?.percentage.toFixed(1)}% do valor
                            </span>
                          </div>
                          <div className="text-[11px] opacity-90 leading-relaxed">
                            {drillDownConcentration.riskWarning}
                          </div>
                        </div>
                      </div>

                      {/* Cards de Métricas de Concentração */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
                          <div className="text-[11px] text-[var(--text-secondary)] font-medium">Total Consolidado</div>
                          <div className="text-base font-bold text-[var(--text-primary)] mt-1 font-mono">
                            {formatBRL(drillDownConcentration.totalAmount)}
                          </div>
                        </div>

                        <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
                          <div className="text-[11px] text-[var(--text-secondary)] font-medium">Favorecidos / Clientes</div>
                          <div className="text-base font-bold text-[var(--text-primary)] mt-1 font-mono">
                            {drillDownConcentration.totalCounterparties} parceiro(s)
                          </div>
                        </div>

                        <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)]">
                          <div className="text-[11px] text-[var(--text-secondary)] font-medium">Top 3 Concentração</div>
                          <div className="text-base font-bold text-amber-400 mt-1 font-mono">
                            {drillDownConcentration.top3Share.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      {/* Tabela Ranqueada de Parceiros */}
                      <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
                            <tr>
                              <th className="py-2.5 px-3 w-10 text-center">#</th>
                              <th className="py-2.5 px-3">Favorecido / Cliente</th>
                              <th className="py-2.5 px-3 text-center">Títulos</th>
                              <th className="py-2.5 px-3 text-right">Valor Total</th>
                              <th className="py-2.5 px-3 w-40 text-right">Participação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)]">
                            {drillDownConcentration.items.map((item, idx) => {
                              const barColor = 
                                item.percentage >= 50 ? 'bg-rose-500' :
                                item.percentage >= 30 ? 'bg-amber-500' : 'bg-emerald-500';

                              return (
                                <tr key={item.counterpartyId} className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[var(--text-secondary)]">
                                    {idx + 1}º
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <div className="font-semibold text-[var(--text-primary)]">{item.name}</div>
                                    <div className="text-[10px] font-mono text-[var(--text-secondary)]">{item.document}</div>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-[var(--text-secondary)]">
                                    {item.count}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-[var(--text-primary)] font-mono">
                                    {formatBRL(item.amount)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <span className="font-mono font-bold text-[11px] text-[var(--text-primary)]">
                                        {item.percentage.toFixed(1)}%
                                      </span>
                                      <div className="w-16 h-2 bg-slate-700/40 rounded-full overflow-hidden shrink-0">
                                        <div 
                                          className={`h-full rounded-full ${barColor}`} 
                                          style={{ width: `${Math.min(100, Math.max(4, item.percentage))}%` }} 
                                        />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p className="text-[var(--text-secondary)] p-6 text-center bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
                      Nenhum favorecido identificado nos lançamentos deste período.
                    </p>
                  )}
                </div>
              ) : drillDownTab === 'CASH_RECONCILIATION' ? (
                /* Visualização de Conciliação Caixa x Competência (Sugestão 2) */
                (() => {
                  const titles = filteredDrillDownTitles;
                  const totalCompetence = titles.reduce((acc, t) => acc + t.originalAmount, 0);
                  const settledTitles = titles.filter(t => t.settlementState === 'LIQUIDADO');
                  const settledAmount = settledTitles.reduce((acc, t) => acc + (t.settledAmount || t.originalAmount), 0);
                  const pendingTitles = titles.filter(t => t.settlementState !== 'LIQUIDADO');
                  const pendingAmount = totalCompetence - settledAmount;
                  const rate = totalCompetence > 0 ? Math.round((settledAmount / totalCompetence) * 100) : 100;
                  
                  // Verificar se há atrasos
                  const todayStr = new Date().toISOString().split('T')[0];
                  const overdueTitles = pendingTitles.filter(t => t.dueDate < todayStr);
                  const overdueAmount = overdueTitles.reduce((acc, t) => acc + t.originalAmount, 0);

                  return (
                    <div className="space-y-4">
                      {/* Mini Cards de Realização */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Total Contábil (Competência)</span>
                          <div className="text-base font-mono font-bold text-[var(--text-primary)] mt-0.5">
                            {formatBRL(totalCompetence)}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                          <span className="text-[10px] uppercase font-bold text-emerald-400">Efetivado em Caixa</span>
                          <div className="text-base font-mono font-bold text-emerald-300 mt-0.5">
                            {formatBRL(settledAmount)}
                          </div>
                          <span className="text-[10px] text-emerald-400/80">{rate}% realizado</span>
                        </div>

                        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10">
                          <span className="text-[10px] uppercase font-bold text-amber-400">Pendente de Realização</span>
                          <div className="text-base font-mono font-bold text-amber-300 mt-0.5">
                            {formatBRL(pendingAmount)}
                          </div>
                          <span className="text-[10px] text-amber-400/80">{pendingTitles.length} títulos</span>
                        </div>

                        <div className={`p-3 rounded-xl border ${
                          overdueAmount > 0 ? 'border-rose-500/40 bg-rose-500/10' : 'border-slate-800 bg-slate-900/30'
                        }`}>
                          <span className={`text-[10px] uppercase font-bold ${overdueAmount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            Inadimplência / Atraso
                          </span>
                          <div className={`text-base font-mono font-bold mt-0.5 ${overdueAmount > 0 ? 'text-rose-300' : 'text-slate-400'}`}>
                            {formatBRL(overdueAmount)}
                          </div>
                          <span className="text-[10px] text-slate-400">{overdueTitles.length} títulos vencidos</span>
                        </div>
                      </div>

                      {/* Tabela de Status Financeiro dos Títulos */}
                      <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
                            <tr>
                              <th className="py-2.5 px-3">Título</th>
                              <th className="py-2.5 px-3">Favorecido</th>
                              <th className="py-2.5 px-3">Vencimento</th>
                              <th className="py-2.5 px-3 text-right">Valor Título</th>
                              <th className="py-2.5 px-3 text-right">Liquidado em Caixa</th>
                              <th className="py-2.5 px-3 text-center">Status Caixa</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                            {titles.map(t => {
                              const cp = counterparties.find(c => c.id === t.counterpartyId);
                              const isSettled = t.settlementState === 'LIQUIDADO';
                              const isOverdue = !isSettled && t.dueDate < todayStr;

                              return (
                                <tr key={t.id} className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                                  <td className="py-2.5 px-3 font-medium text-[var(--text-primary)]">{t.titleNumber}</td>
                                  <td className="py-2.5 px-3 font-sans">
                                    <div className="font-medium text-[var(--text-primary)]">{cp?.name || t.description}</div>
                                  </td>
                                  <td className="py-2.5 px-3 text-[var(--text-secondary)]">{formatDateBR(t.dueDate)}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-[var(--text-primary)]">
                                    {formatBRL(t.originalAmount)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                                    {formatBRL(t.settledAmount || (isSettled ? t.originalAmount : 0))}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-sans">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                      isSettled 
                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                                        : isOverdue 
                                        ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' 
                                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                    }`}>
                                      {isSettled ? 'Liquidado' : isOverdue ? 'Atrasado' : 'A Vencer'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()
              ) : (
                /* Visualização de Lançamentos Detalhados */
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] bg-amber-500/10 px-3 py-2 rounded-xl border border-amber-500/20">
                    <span className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                      <Info className="w-4 h-4 text-amber-400 shrink-0" />
                      Dê <strong>duplo clique</strong> na linha de qualquer lançamento para editar (ou use o ícone de lápis).
                    </span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-black/20 text-slate-300">
                      Filtro: {drillDownItem.regimeMode === 'COMPETENCIA' ? 'Competência (Mês Referência)' : 'Caixa Gerencial (Realizado + Em Aberto no Mês)'}
                    </span>
                  </div>

                  {filteredDrillDownTitles.length === 0 ? (
                    <p className="text-[var(--text-secondary)] p-8 text-center bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
                      Nenhum lançamento individualizado localizado para este período no regime de {drillDownItem.regimeMode === 'COMPETENCIA' ? 'competência' : 'caixa'}.
                    </p>
                  ) : (
                    <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden shadow-xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
                          <tr>
                            <th className="py-2.5 px-3">Título</th>
                            <th className="py-2.5 px-3">Favorecido & Descrição</th>
                            <th className="py-2.5 px-3 text-center">Competência</th>
                            <th className="py-2.5 px-3 text-center">Vencimento</th>
                            <th className="py-2.5 px-3 text-center">Data Pagamento</th>
                            {drillDownItem.regimeMode === 'CAIXA' ? (
                              <>
                                <th className="py-2.5 px-3 text-right">Efetivo Caixa (Período)</th>
                                <th className="py-2.5 px-3 text-right">Valor Original</th>
                              </>
                            ) : (
                              <th className="py-2.5 px-3 text-right">Valor Competência</th>
                            )}
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-3 text-center w-14">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {filteredDrillDownTitles.map(t => {
                            const cp = counterparties.find(c => c.id === t.counterpartyId);
                            const paymentInfo = getTitlePaymentInfo(t);
                            const compStr = t.competence && t.competence.trim().length >= 7 
                              ? t.competence.trim().substring(0, 7) 
                              : (t.dueDate ? t.dueDate.substring(0, 7) : '');
                            const isPeriodClosed = compStr ? FinancialEngine.isPeriodClosed(compStr) : false;

                            return (
                              <tr 
                                key={t.id} 
                                onDoubleClick={() => handleEditTitle(t)}
                                className="hover:bg-amber-500/10 transition-colors cursor-pointer group"
                                title={isPeriodClosed ? `Competência ${compStr} encerrada contabilmente (edição bloqueada)` : "Dê duplo clique para editar este lançamento"}
                              >
                                {/* Número do Título */}
                                <td className="py-2.5 px-3 font-mono font-medium text-[var(--text-primary)]">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      t.type === 'RECEBER' 
                                        ? 'bg-emerald-500/15 text-emerald-400' 
                                        : 'bg-rose-500/15 text-rose-400'
                                    }`}>
                                      {t.type === 'RECEBER' ? 'REC' : 'PAG'}
                                    </span>
                                    <span>{t.titleNumber}</span>
                                  </div>
                                </td>

                                {/* Favorecido / Cliente & Descrição com destaque e tamanho aprimorado */}
                                <td className="py-2.5 px-3">
                                  <div className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                                    {cp?.name || 'Não identificado'}
                                  </div>
                                  <div className="text-[11px] text-[var(--text-secondary)] font-medium truncate max-w-xs mt-0.5">
                                    {t.description || '-'}
                                  </div>
                                </td>

                                {/* Competência */}
                                <td className="py-2.5 px-3 text-center font-mono font-semibold text-amber-400">
                                  {t.competence || '-'}
                                </td>

                                {/* Vencimento */}
                                <td className="py-2.5 px-3 text-center text-[var(--text-secondary)] font-mono">
                                  {formatDateBR(t.dueDate)}
                                </td>

                                {/* Data Pagamento em Destaque */}
                                <td className="py-2.5 px-3 text-center font-mono">
                                  {paymentInfo.isPaid && paymentInfo.paymentDate ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                      {formatDateBR(paymentInfo.paymentDate)}
                                    </span>
                                  ) : paymentInfo.isPartial && paymentInfo.paymentDate ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                                      Parcial ({formatDateBR(paymentInfo.paymentDate)})
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-xs">-</span>
                                  )}
                                </td>

                                {/* Valor da linha conforme o Regime */}
                                {drillDownItem.regimeMode === 'CAIXA' ? (
                                  <>
                                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400 font-mono">
                                      {(() => {
                                        const cash = getTitleCashInPeriod(t, targetDrillDownMonths);
                                        return (
                                          <div>
                                            <div>{formatBRL(cash.totalInPeriod)}</div>
                                            {cash.settledInPeriod > 0 && cash.openDueInPeriod > 0 && (
                                              <div className="text-[10px] text-slate-400 font-normal">
                                                Liq: {formatBRL(cash.settledInPeriod)} | Aberto: {formatBRL(cash.openDueInPeriod)}
                                              </div>
                                            )}
                                            {cash.settledInPeriod > 0 && cash.openDueInPeriod === 0 && (
                                              <div className="text-[9px] text-emerald-500/80 font-normal">
                                                Liquidado no período
                                              </div>
                                            )}
                                            {cash.settledInPeriod === 0 && cash.openDueInPeriod > 0 && (
                                              <div className="text-[9px] text-amber-400/80 font-normal">
                                                Previsão a vencer
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-[var(--text-secondary)] font-mono text-xs">
                                      {formatBRL(t.originalAmount)}
                                    </td>
                                  </>
                                ) : (
                                  <td className="py-2.5 px-3 text-right font-bold text-[var(--text-primary)] font-mono">
                                    {formatBRL(t.originalAmount)}
                                  </td>
                                )}

                                {/* Status */}
                                <td className="py-2.5 px-3 text-center">
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                    t.settlementState === 'LIQUIDADO' 
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                                      : t.settlementState === 'PARCIAL'
                                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  }`}>
                                    {t.settlementState}
                                  </span>
                                </td>

                                {/* Botão de Ação: Editar ou Bloqueio Contábil */}
                                <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                  {isPeriodClosed ? (
                                    <span 
                                      className="inline-flex p-1.5 rounded-md text-slate-500 cursor-not-allowed bg-slate-800/40"
                                      title={`Competência ${compStr} encerrada contabilmente (bloqueada)`}
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleEditTitle(t)}
                                      className="p-1.5 rounded-md text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                                      title="Editar lançamento (ou clique duplo)"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-[var(--surface-elevated)] border-t-2 border-[var(--border-subtle)] font-semibold text-xs">
                          <tr>
                            <td colSpan={5} className="py-3 px-3 text-right uppercase tracking-wider text-[var(--text-secondary)] font-bold">
                              Soma Total da Rubrica ({drillDownItem.regimeMode === 'CAIXA' ? 'Regime de Caixa' : 'Regime de Competência'}):
                            </td>
                            <td className={`py-3 px-3 text-right font-mono font-extrabold text-sm ${
                              drillDownItem.regimeMode === 'CAIXA' ? 'text-emerald-400' : 'text-amber-400'
                            }`}>
                              {formatBRL(drillDownTotalAmount)}
                            </td>
                            {drillDownItem.regimeMode === 'CAIXA' && (
                              <td className="py-3 px-3 text-right font-mono text-xs text-[var(--text-secondary)]">
                                {formatBRL(filteredDrillDownTitles.reduce((acc, t) => acc + (t.originalAmount || 0), 0))}
                              </td>
                            )}
                            <td colSpan={2}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap justify-between items-center gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                <span>
                  Exibindo <strong>{filteredDrillDownTitles.length}</strong> lançamento(s) na rubrica {drillDownItem.line.name}
                </span>
                <span className={`px-2.5 py-1 rounded-lg font-mono font-bold border ${
                  drillDownItem.regimeMode === 'CAIXA' 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  Soma Exata: {formatBRL(drillDownTotalAmount)}
                </span>
              </div>
              <button
                onClick={() => setDrillDownItem(null)}
                className="px-4 py-2 bg-amber-500 text-[#18181b] font-bold rounded-xl text-xs hover:bg-amber-400 transition-colors shadow-xs cursor-pointer"
              >
                Fechar Drill-Down
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição Rápida de Lançamento */}
      {selectedTitleForEdit && (
        <EditTitleModal
          isOpen={!!selectedTitleForEdit}
          title={selectedTitleForEdit}
          onClose={() => setSelectedTitleForEdit(null)}
          onSaved={handleTitleSaved}
        />
      )}

      {/* Modal de Simulação What-If (Sugestão 1) */}
      {showWhatIfModal && (
        <DREWhatIfModal
          isOpen={showWhatIfModal}
          onClose={() => setShowWhatIfModal(false)}
          dreData={dreData}
          effectiveYear={effectiveYear}
          kpis={kpis}
          onApplyScenario={(scenario) => {
            setActiveWhatIfScenario(scenario);
          }}
          activeScenario={activeWhatIfScenario}
        />
      )}

      {/* Modal de Sumário Executivo One-Pager (Sugestão 5) */}
      {showOnePageModal && (
        <DREOnePageSummaryModal
          isOpen={showOnePageModal}
          onClose={() => setShowOnePageModal(false)}
          dreData={dreData}
          effectiveYear={effectiveYear}
          kpis={kpis}
          reconciliation={cashReconciliation}
        />
      )}

    </div>
  );
};
