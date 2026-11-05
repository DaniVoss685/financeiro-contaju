import React, { useState, useMemo, useEffect } from 'react';
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Download, 
  Save, 
  RefreshCw, 
  Copy, 
  Percent, 
  Search, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Sparkles,
  BarChart3,
  Calendar,
  Layers,
  FileSpreadsheet,
  Table,
  SlidersHorizontal,
  Check,
  Maximize2,
  Minimize2,
  History,
  RotateCcw,
  FileText,
  Eye,
  Award
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { formatBRL, FinancialEngine } from '../../services/financialEngine';
import { BudgetEngine, BudgetHierarchyLine } from '../../services/budgetEngine';
import { AnnualBudgetPlan, BudgetVersion, BudgetChangeRecord, ChartAccount } from '../../types';
import { exportToExcel } from '../../utils/exportUtils';
import { matchesSearch } from '../../utils/searchUtils';
import { BudgetRowSimulationModal } from './BudgetRowSimulationModal';
import { BudgetApprovalModal } from './BudgetApprovalModal';
import { BudgetVersionDetailsModal } from './BudgetVersionDetailsModal';
import { BudgetDreCashProjectionTab } from './BudgetDreCashProjectionTab';
import { PremiumSelect } from '../Common/PremiumSelect';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

type AnnualMetricMode = 'ORC_VS_REAL' | 'PLANNED_ONLY' | 'REALIZED_ONLY' | 'VARIANCE_ONLY';

export const BudgetPlanningView: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth(); // 0..11

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [activeTab, setActiveTab] = useState<'ANNUAL_12M' | 'COMPARISON' | 'PLANNING' | 'DRE_CASH_PROJECTION' | 'VERSIONS'>('PLANNING');
  const [annualMetricMode, setAnnualMetricMode] = useState<AnnualMetricMode>('ORC_VS_REAL');
  const [selectedMonth, setSelectedMonth] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [natureFilter, setNatureFilter] = useState<'ALL' | 'RECEITAS' | 'DESPESAS'>('ALL');
  const [isFitScreen, setIsFitScreen] = useState<boolean>(false);
  const [useCompactNumbers, setUseCompactNumbers] = useState<boolean>(false);
  const [expandedCodes, setExpandedCodes] = useState<Record<string, boolean>>({
    '1': true,
    '2': true,
    '3': true,
    '4': true,
    '5': true
  });

  // Base salva original do ano selecionado
  const [savedPlan, setSavedPlan] = useState<AnnualBudgetPlan>(() => {
    return storage.getBudgetPlan(currentYear);
  });

  // Plano em edição / simulação
  const [editingPlan, setEditingPlan] = useState<AnnualBudgetPlan>(() => {
    return storage.getBudgetPlan(currentYear);
  });

  // Versões de histórico
  const [versionsList, setVersionsList] = useState<BudgetVersion[]>(() => {
    return storage.getBudgetVersions(currentYear);
  });

  // Estado de simulação em lote
  const [batchPercent, setBatchPercent] = useState<number>(5);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Modais
  const [simulatingAccount, setSimulatingAccount] = useState<ChartAccount | null>(null);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<BudgetVersion | null>(null);

  // Visão Expandida vs Recolhida (Grade de Elaboração)
  const [structureMode, setStructureMode] = useState<'EXPANDED' | 'COLLAPSED'>('EXPANDED');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSectionCollapse = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleSetGlobalStructure = (mode: 'EXPANDED' | 'COLLAPSED') => {
    setStructureMode(mode);
    if (mode === 'COLLAPSED') {
      setCollapsedSections(new Set(['revenue', 'deductions', 'costs', 'expenses']));
    } else {
      setCollapsedSections(new Set());
    }
  };

  const isRevenueExpanded = structureMode === 'EXPANDED' && !collapsedSections.has('revenue');
  const isDeductionsExpanded = structureMode === 'EXPANDED' && !collapsedSections.has('deductions');
  const isCostsExpanded = structureMode === 'EXPANDED' && !collapsedSections.has('costs');
  const isExpensesExpanded = structureMode === 'EXPANDED' && !collapsedSections.has('expenses');

  // Carregar dados ao trocar de ano
  const handleYearChange = (newYear: number) => {
    setSelectedYear(newYear);
    const plan = storage.getBudgetPlan(newYear);
    setSavedPlan(plan);
    setEditingPlan(plan);
    setVersionsList(storage.getBudgetVersions(newYear));
  };

  const accounts = useMemo(() => storage.getChartAccounts(), []);
  const currentUser = storage.getCurrentUser();

  // Helper para formatar números compactos na visão enquadrada
  const formatCompactBRL = (amount: number): string => {
    if (!amount || Math.abs(amount) < 0.01) return '-';
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1_000_000) {
      return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
    }
    if (abs >= 1_000) {
      return `${sign}${(abs / 1_000).toFixed(1).replace('.', ',')}k`;
    }
    return `${sign}${Math.round(abs).toString()}`;
  };

  // Mapeamento de alterações entre o plano salvo original e o plano simulado
  const changesList = useMemo<BudgetChangeRecord[]>(() => {
    const list: BudgetChangeRecord[] = [];
    const origMap = new Map<string, number[]>();
    savedPlan.items.forEach(it => origMap.set(it.accountId, it.monthlyPlanned));

    editingPlan.items.forEach(it => {
      const origMonthly = origMap.get(it.accountId) || new Array(12).fill(0);
      const acc = accounts.find(a => a.id === it.accountId);
      it.monthlyPlanned.forEach((newVal, mIdx) => {
        const oldVal = origMonthly[mIdx] || 0;
        if (Math.abs(newVal - oldVal) > 0.01) {
          list.push({
            accountId: it.accountId,
            accountName: acc?.name || it.accountId,
            accountCode: acc?.code,
            monthIndex: mIdx,
            previousValue: oldVal,
            newValue: newVal,
            changeType: 'MANUAL'
          });
        }
      });
    });

    return list;
  }, [savedPlan, editingPlan, accounts]);

  // Set para verificação O(1) de célula alterada (accountId-monthIndex)
  const changedCellsSet = useMemo(() => {
    const set = new Set<string>();
    changesList.forEach(c => set.add(`${c.accountId}-${c.monthIndex}`));
    return set;
  }, [changesList]);

  // Mapa de quantas alterações existem por conta
  const changedCountByAccount = useMemo(() => {
    const map = new Map<string, number>();
    changesList.forEach(c => {
      map.set(c.accountId, (map.get(c.accountId) || 0) + 1);
    });
    return map;
  }, [changesList]);

  // Colunas (meses) que possuem alterações
  const changedMonthsSet = useMemo(() => {
    const set = new Set<number>();
    changesList.forEach(c => set.add(c.monthIndex));
    return set;
  }, [changesList]);

  // Comparativos e dados calculados
  const comparisonData = useMemo(() => {
    const monthFilter = selectedMonth === 'ALL' ? undefined : selectedMonth;
    return BudgetEngine.getBudgetComparison(selectedYear, monthFilter);
  }, [selectedYear, selectedMonth]);

  const fullYearData = useMemo(() => {
    return BudgetEngine.getBudgetComparison(selectedYear, undefined);
  }, [selectedYear]);

  const { lines, kpis } = comparisonData;

  // Filtro de linhas
  const filterHierarchyLines = (srcLines: BudgetHierarchyLine[]) => {
    return srcLines.filter(line => {
      if (searchQuery.trim()) {
        const match = matchesSearch([line.name, line.code], searchQuery);
        if (!match) return false;
      }

      if (natureFilter === 'RECEITAS') {
        if (line.id.startsWith('grp-3') || line.id.startsWith('grp-4') || line.id === 'grp-2-deduc' || line.id.startsWith('grp-cost') || line.id.startsWith('grp-exp')) {
          return false;
        }
      } else if (natureFilter === 'DESPESAS') {
        if (line.id === 'grp-1' || line.id === 'sub-net-rev' || line.id === 'sub-gross-profit') {
          return false;
        }
      }

      return true;
    });
  };

  const filteredComparisonLines = useMemo(() => {
    return filterHierarchyLines(lines);
  }, [lines, searchQuery, natureFilter]);

  const filteredAnnualLines = useMemo(() => {
    return filterHierarchyLines(fullYearData.lines);
  }, [fullYearData.lines, searchQuery, natureFilter]);

  // Mapa de valores realizados por conta contábil para exibir abaixo dos valores orçados
  const accountRealizedMap = useMemo(() => {
    const map = new Map<string, number[]>();
    fullYearData.lines.forEach(l => {
      map.set(l.id, l.realizedMonthly);
    });
    return map;
  }, [fullYearData.lines]);

  // Totais consolidados mensais
  const monthlySummaryRibbon = useMemo(() => {
    const revenueLine = fullYearData.lines.find(l => l.id === 'grp-1');
    const netIncomeLine = fullYearData.lines.find(l => l.id === 'sub-final-net');
    const costsLine = fullYearData.lines.find(l => l.id === 'grp-3-costs' || l.id === 'grp-3-custos');
    const opExpLine = fullYearData.lines.find(l => l.id === 'grp-4-expenses' || l.id === 'grp-4-op');

    const revPlanned = revenueLine ? revenueLine.plannedMonthly : new Array(12).fill(0);
    const revRealized = revenueLine ? revenueLine.realizedMonthly : new Array(12).fill(0);

    const netPlanned = netIncomeLine ? netIncomeLine.plannedMonthly : new Array(12).fill(0);
    const netRealized = netIncomeLine ? netIncomeLine.realizedMonthly : new Array(12).fill(0);

    const expPlanned = new Array(12).fill(0);
    const expRealized = new Array(12).fill(0);
    for (let i = 0; i < 12; i++) {
      expPlanned[i] = (costsLine?.plannedMonthly[i] || 0) + (opExpLine?.plannedMonthly[i] || 0);
      expRealized[i] = (costsLine?.realizedMonthly[i] || 0) + (opExpLine?.realizedMonthly[i] || 0);
    }

    return {
      revPlanned,
      revRealized,
      expPlanned,
      expRealized,
      netPlanned,
      netRealized
    };
  }, [fullYearData]);

  // Métricas de Impacto da Simulação Atual vs Meta Salva Original
  const simulationImpact = useMemo(() => {
    let oldRevenue = 0;
    let newRevenue = 0;
    let oldExpense = 0;
    let newExpense = 0;

    const analyticalAccounts = accounts.filter(a => a.isAnalytical);

    analyticalAccounts.forEach(acc => {
      const origItem = savedPlan.items.find(i => i.accountId === acc.id);
      const editItem = editingPlan.items.find(i => i.accountId === acc.id);

      const origSum = origItem ? origItem.monthlyPlanned.reduce((a, b) => a + b, 0) : 0;
      const editSum = editItem ? editItem.monthlyPlanned.reduce((a, b) => a + b, 0) : 0;

      if (acc.code.startsWith('1')) {
        // Receita
        oldRevenue += origSum;
        newRevenue += editSum;
      } else if (acc.code.startsWith('2') || acc.code.startsWith('3') || acc.code.startsWith('4')) {
        // Deduções, Custos ou Despesas
        oldExpense += origSum;
        newExpense += editSum;
      }
    });

    const oldNetIncome = oldRevenue - oldExpense;
    const newNetIncome = newRevenue - newExpense;

    return {
      oldRevenue,
      newRevenue,
      oldExpense,
      newExpense,
      oldNetIncome,
      newNetIncome,
      revenueDiff: newRevenue - oldRevenue,
      expenseDiff: newExpense - oldExpense,
      netDiff: newNetIncome - oldNetIncome
    };
  }, [accounts, savedPlan, editingPlan]);

  // Expand / Collapse
  const toggleExpand = (code: string) => {
    setExpandedCodes(prev => ({
      ...prev,
      [code]: !prev[code]
    }));
  };

  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {};
    fullYearData.lines.forEach(l => {
      if (l.code) allExpanded[l.code] = true;
    });
    setExpandedCodes(allExpanded);
  };

  const collapseAll = () => {
    setExpandedCodes({});
  };

  // -------------------------------------------------------------
  // Edição e Simulação de Valores
  // -------------------------------------------------------------
  const handlePlannedValueChange = (accountId: string, monthIdx: number, valueStr: string) => {
    const numVal = parseFloat(valueStr) || 0;
    const items = [...editingPlan.items];
    const itemIndex = items.findIndex(i => i.accountId === accountId);

    if (itemIndex >= 0) {
      const updatedMonthly = [...items[itemIndex].monthlyPlanned];
      updatedMonthly[monthIdx] = numVal;
      items[itemIndex] = { ...items[itemIndex], monthlyPlanned: updatedMonthly };
    } else {
      const newMonthly = new Array(12).fill(0);
      newMonthly[monthIdx] = numVal;
      items.push({ accountId, monthlyPlanned: newMonthly });
    }

    setEditingPlan({ ...editingPlan, items });
  };

  const handleReplicateMonth = (accountId: string, sourceMonth: number) => {
    const updated = BudgetEngine.replicateMonthValue(editingPlan, accountId, sourceMonth);
    setEditingPlan(updated);
    setSaveSuccessMessage('Valor replicado com sucesso para os 12 meses!');
    setTimeout(() => setSaveSuccessMessage(null), 2500);
  };

  // Simulações Globais / Rápidas
  const handleQuickSimulation = (type: 'REV_PLUS_5' | 'REV_PLUS_10' | 'EXP_MINUS_5' | 'EXP_MINUS_10' | 'BATCH_PERCENT') => {
    let factor = 1;
    let targetPrefix: string | null = null;
    let label = '';

    if (type === 'REV_PLUS_5') {
      factor = 1.05;
      targetPrefix = '1';
      label = '+5% no Faturamento';
    } else if (type === 'REV_PLUS_10') {
      factor = 1.10;
      targetPrefix = '1';
      label = '+10% no Faturamento';
    } else if (type === 'EXP_MINUS_5') {
      factor = 0.95;
      targetPrefix = 'EXP';
      label = '-5% em Custos e Despesas';
    } else if (type === 'EXP_MINUS_10') {
      factor = 0.90;
      targetPrefix = 'EXP';
      label = '-10% em Custos e Despesas';
    } else if (type === 'BATCH_PERCENT') {
      factor = 1 + (batchPercent / 100);
      label = `Ajuste de ${batchPercent > 0 ? '+' : ''}${batchPercent}% em todo o orçamento`;
    }

    const updatedItems = editingPlan.items.map(item => {
      const acc = accounts.find(a => a.id === item.accountId);
      if (!acc) return item;

      let shouldApply = false;
      if (!targetPrefix) {
        shouldApply = true;
      } else if (targetPrefix === '1' && acc.code.startsWith('1')) {
        shouldApply = true;
      } else if (targetPrefix === 'EXP' && (acc.code.startsWith('2') || acc.code.startsWith('3') || acc.code.startsWith('4'))) {
        shouldApply = true;
      }

      if (shouldApply) {
        const newMonthly = item.monthlyPlanned.map(val => Math.round(val * factor));
        return { ...item, monthlyPlanned: newMonthly };
      }
      return item;
    });

    setEditingPlan({ ...editingPlan, items: updatedItems });
    setSaveSuccessMessage(`Simulação aplicada: ${label}!`);
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleImportFromRealized = () => {
    if (!window.confirm(`Deseja preencher as metas de ${selectedYear} com base nos lançamentos contábeis já apurados no sistema?`)) {
      return;
    }
    const autoPlan = BudgetEngine.createFromRealized(selectedYear);
    setEditingPlan(autoPlan);
    setSaveSuccessMessage('Valores realizados importados para a simulação de trabalho!');
    setTimeout(() => setSaveSuccessMessage(null), 3000);
  };

  const handleResetSimulation = () => {
    if (changesList.length > 0 && !window.confirm('Deseja descartar todas as alterações simuladas e restaurar a meta oficial salva?')) {
      return;
    }
    setEditingPlan(JSON.parse(JSON.stringify(savedPlan)));
    setSaveSuccessMessage('Simulação descartada. Meta oficial restaurada.');
    setTimeout(() => setSaveSuccessMessage(null), 2500);
  };

  // Aplicação de Simulação de Linha vinda do Modal
  const handleApplyRowSimulation = (newMonthly: number[]) => {
    if (!simulatingAccount) return;
    const accountId = simulatingAccount.id;

    const items = [...editingPlan.items];
    const existingIndex = items.findIndex(i => i.accountId === accountId);

    if (existingIndex >= 0) {
      items[existingIndex] = { ...items[existingIndex], monthlyPlanned: newMonthly };
    } else {
      items.push({ accountId, monthlyPlanned: newMonthly });
    }

    setEditingPlan({ ...editingPlan, items });
    setSaveSuccessMessage(`Simulação aplicada com sucesso para ${simulatingAccount.name}!`);
    setTimeout(() => setSaveSuccessMessage(null), 2500);
  };

  // Confirmação e Gravação de Novas Metas (Aprovação)
  const handleConfirmApproval = (versionName: string, notes: string) => {
    const updatedPlan: AnnualBudgetPlan = {
      ...editingPlan,
      name: versionName,
      updatedAt: new Date().toISOString(),
      notes: notes || editingPlan.notes
    };

    // 1. Salva o plano no storage oficial
    storage.saveBudgetPlan(updatedPlan);

    // 2. Salva a versão no histórico
    const versionRecord: BudgetVersion = {
      id: `ver-${selectedYear}-${Date.now()}`,
      versionNumber: versionName,
      year: selectedYear,
      approvedAt: new Date().toISOString(),
      approvedBy: currentUser.name,
      notes: notes || 'Revisão de metas aprovada.',
      totalChanges: changesList.length,
      changes: changesList,
      planSnapshot: JSON.parse(JSON.stringify(updatedPlan))
    };
    storage.saveBudgetVersion(versionRecord);

    // 3. Log de auditoria
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'ATUALIZACAO_ORCAMENTO',
      module: 'Planejamento Orçamentário',
      recordId: updatedPlan.id,
      details: `Aprovação de novas metas orçamentárias (${versionName}) com ${changesList.length} alterações registradas.`
    });

    // 4. Atualiza os estados locais
    setSavedPlan(updatedPlan);
    setEditingPlan(updatedPlan);
    setVersionsList(storage.getBudgetVersions(selectedYear));

    setSaveSuccessMessage(`Sucesso! As novas metas orçamentárias foram aprovadas e registradas no histórico.`);
    setTimeout(() => setSaveSuccessMessage(null), 4000);
  };

  // Restaurar uma versão do histórico
  const handleRestoreVersion = (ver: BudgetVersion) => {
    storage.saveBudgetPlan(ver.planSnapshot);
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'ATUALIZACAO_ORCAMENTO',
      module: 'Planejamento Orçamentário',
      recordId: ver.planSnapshot.id,
      details: `Restauração da versão histórica "${ver.versionNumber}" como meta oficial ativa.`
    });

    setSavedPlan(ver.planSnapshot);
    setEditingPlan(ver.planSnapshot);
    setVersionsList(storage.getBudgetVersions(selectedYear));

    setSaveSuccessMessage(`Versão "${ver.versionNumber}" restaurada com sucesso como meta de trabalho ativa!`);
    setTimeout(() => setSaveSuccessMessage(null), 3500);
  };

  const getEditingPlannedArray = (accId: string): number[] => {
    const item = editingPlan.items.find(i => i.accountId === accId);
    return item?.monthlyPlanned || new Array(12).fill(0);
  };

  const getSavedPlannedArray = (accId: string): number[] => {
    const item = savedPlan.items.find(i => i.accountId === accId);
    return item?.monthlyPlanned || new Array(12).fill(0);
  };

  // Contas analíticas agrupadas para a aba de Planejamento (Receita, Custo, Despesa)
  const analyticalAccounts = useMemo(() => accounts.filter(a => a.isAnalytical), [accounts]);

  const revenueAccounts = useMemo(() => {
    return analyticalAccounts.filter(a => 
      a.nature === 'RECEITA_SERVICO' || 
      a.parentId === 'grp-1.1' || 
      (a.code.startsWith('1') && !a.code.startsWith('1.2'))
    ).sort((a, b) => a.code.localeCompare(b.code));
  }, [analyticalAccounts]);

  const deductionAccounts = useMemo(() => {
    return analyticalAccounts.filter(a => 
      a.nature === 'DEDUCAO_RECEITA' || 
      a.parentId === 'grp-1.2' || 
      a.code.startsWith('1.2')
    ).sort((a, b) => a.code.localeCompare(b.code));
  }, [analyticalAccounts]);

  const costAccounts = useMemo(() => {
    return analyticalAccounts.filter(a => 
      a.nature === 'CUSTO_SERVICO' || 
      a.parentId?.startsWith('grp-2') || 
      a.code.startsWith('2')
    ).sort((a, b) => a.code.localeCompare(b.code));
  }, [analyticalAccounts]);

  const expenseAccounts = useMemo(() => {
    return analyticalAccounts.filter(a => 
      !revenueAccounts.some(r => r.id === a.id) &&
      !deductionAccounts.some(d => d.id === a.id) &&
      !costAccounts.some(c => c.id === a.id)
    ).sort((a, b) => a.code.localeCompare(b.code));
  }, [analyticalAccounts, revenueAccounts, deductionAccounts, costAccounts]);

  // Cálculos consolidados para a SOMA GERAL (DRE e Caixa) no final da tabela de planejamento
  const initialCashYear = useMemo(() => {
    try {
      return FinancialEngine.getConsolidatedCashBalance(`${selectedYear}-01-01`);
    } catch {
      return 0;
    }
  }, [selectedYear]);

  const planningSummary = useMemo(() => {
    const monthlyRevenue = new Array(12).fill(0);
    const monthlyDeductions = new Array(12).fill(0);
    const monthlyCosts = new Array(12).fill(0);
    const monthlyExpenses = new Array(12).fill(0);
    const monthlyGrossProfit = new Array(12).fill(0);
    const monthlyNetIncome = new Array(12).fill(0);
    const monthlyTotalExpensesAndCosts = new Array(12).fill(0);
    const monthlyCashNet = new Array(12).fill(0);
    const monthlyCashInitial = new Array(12).fill(0);
    const monthlyCashFinal = new Array(12).fill(0);

    for (let m = 0; m < 12; m++) {
      let r = 0;
      revenueAccounts.forEach(acc => { r += getEditingPlannedArray(acc.id)[m] || 0; });
      monthlyRevenue[m] = r;

      let d = 0;
      deductionAccounts.forEach(acc => { d += getEditingPlannedArray(acc.id)[m] || 0; });
      monthlyDeductions[m] = d;

      let c = 0;
      costAccounts.forEach(acc => { c += getEditingPlannedArray(acc.id)[m] || 0; });
      monthlyCosts[m] = c;

      let e = 0;
      expenseAccounts.forEach(acc => { e += getEditingPlannedArray(acc.id)[m] || 0; });
      monthlyExpenses[m] = e;

      const netRev = r - d;
      const gross = netRev - c;
      const netInc = gross - e;

      monthlyGrossProfit[m] = gross;
      monthlyNetIncome[m] = netInc;

      const totalOut = c + e;
      monthlyTotalExpensesAndCosts[m] = totalOut;
      const cashNet = netRev - totalOut;
      monthlyCashNet[m] = cashNet;

      if (m === 0) {
        monthlyCashInitial[m] = initialCashYear;
      } else {
        monthlyCashInitial[m] = monthlyCashFinal[m - 1];
      }
      monthlyCashFinal[m] = monthlyCashInitial[m] + cashNet;
    }

    const totalRevenue = monthlyRevenue.reduce((a, b) => a + b, 0);
    const totalDeductions = monthlyDeductions.reduce((a, b) => a + b, 0);
    const totalCosts = monthlyCosts.reduce((a, b) => a + b, 0);
    const totalExpenses = monthlyExpenses.reduce((a, b) => a + b, 0);
    const totalGrossProfit = monthlyGrossProfit.reduce((a, b) => a + b, 0);
    const totalNetIncome = monthlyNetIncome.reduce((a, b) => a + b, 0);
    const totalCashNet = monthlyCashNet.reduce((a, b) => a + b, 0);
    const finalYearCash = monthlyCashFinal[11];

    return {
      monthlyRevenue,
      monthlyDeductions,
      monthlyCosts,
      monthlyExpenses,
      monthlyGrossProfit,
      monthlyNetIncome,
      monthlyTotalExpensesAndCosts,
      monthlyCashNet,
      monthlyCashInitial,
      monthlyCashFinal,
      totalRevenue,
      totalDeductions,
      totalCosts,
      totalExpenses,
      totalGrossProfit,
      totalNetIncome,
      totalCashNet,
      finalYearCash
    };
  }, [revenueAccounts, deductionAccounts, costAccounts, expenseAccounts, editingPlan, initialCashYear]);

  // Export handlers
  const handleExportComparisonExcel = () => {
    const headers = [
      'Código', 
      'Conta / Grupo', 
      'Orçado (R$)', 
      'Realizado (R$)', 
      'Desvio Nominal (R$)', 
      'Desvio (%)', 
      'Atingimento (%)', 
      'Status'
    ];
    const rows = filteredComparisonLines.map(line => [
      line.code || '',
      line.name,
      line.plannedTotal,
      line.realizedTotal,
      line.varianceNominal,
      (line.variancePercent ?? 0).toFixed(2) + '%',
      (line.executionRate ?? 0).toFixed(2) + '%',
      line.favorableStatus
    ]);

    exportToExcel(
      `Planejamento_Orcamentario_Vs_Realizado_${selectedYear}`,
      'Orcado_vs_Realizado',
      headers,
      rows
    );
  };

  const handleExportMatrixExcel = () => {
    const headers = [
      'Código', 
      'Conta / Grupo', 
      'Orçado Anual (R$)', 
      'Realizado Anual (R$)', 
      'Desvio Anual (R$)', 
      ...MONTH_SHORT.map(m => `${m} Orçado`), 
      ...MONTH_SHORT.map(m => `${m} Realizado`),
      ...MONTH_SHORT.map(m => `${m} Desvio`)
    ];
    const rows = fullYearData.lines.map(line => {
      const devMonthly = line.realizedMonthly.map((r, i) => r - (line.plannedMonthly[i] || 0));
      return [
        line.code || '',
        line.name,
        line.plannedTotal,
        line.realizedTotal,
        line.varianceNominal,
        ...line.plannedMonthly,
        ...line.realizedMonthly,
        ...devMonthly
      ];
    });

    exportToExcel(
      `Matriz_Orcamento_12_Meses_${selectedYear}`,
      'Matriz_12_Meses',
      headers,
      rows
    );
  };

  return (
    <div className="space-y-6 pb-12 w-full text-[var(--text-primary)]">
      {/* Toast Notification */}
      {saveSuccessMessage && (
        <div className="fixed top-4 right-4 z-50 bg-amber-500 text-[#18181b] px-4 py-3 rounded-xl shadow-xl flex items-center space-x-2 border border-amber-400 font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-xs">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                  Planejamento Orçamentário & Simulação
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  Exercício {selectedYear}
                </span>
                {changesList.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-[#18181b] animate-pulse">
                    {changesList.length} {changesList.length === 1 ? 'alteração pendente' : 'alterações pendentes'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Elabore cenários, simule crescimento ou corte de despesas linha a linha e aprove novas metas com histórico rastreado.
              </p>
            </div>
          </div>
        </div>

        {/* Year Selector & Primary Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-semibold">
            {[currentYear - 1, currentYear, currentYear + 1].map(yr => (
              <button
                key={yr}
                onClick={() => handleYearChange(yr)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  selectedYear === yr
                    ? 'bg-amber-500 text-[#18181b] font-bold shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)]'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          <button
            onClick={activeTab === 'PLANNING' ? handleExportMatrixExcel : handleExportComparisonExcel}
            className="px-3.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-semibold flex items-center transition-colors shadow-xs"
            title="Exportar matriz orçamentária para planilha Excel"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
            Exportar Excel
          </button>

          {/* Botão de Aprovação em Destaque Dourado */}
          {changesList.length > 0 && (
            <button
              onClick={() => setIsApprovalModalOpen(true)}
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-[#18181b] rounded-xl text-xs font-bold flex items-center transition-all shadow-md shadow-amber-500/20"
            >
              <Award className="w-4 h-4 mr-1.5" />
              Aprovar Novas Metas ({changesList.length})
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex flex-wrap border-b border-[var(--border-subtle)] gap-2 sm:gap-6">
        <button
          onClick={() => setActiveTab('PLANNING')}
          className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'PLANNING'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Elaboração & Simulação de Metas</span>
          {changesList.length > 0 && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500 text-[#18181b]">
              {changesList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('DRE_CASH_PROJECTION')}
          className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'DRE_CASH_PROJECTION'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Demonstrativo DRE x Caixa Simulado</span>
        </button>

        <button
          onClick={() => setActiveTab('ANNUAL_12M')}
          className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'ANNUAL_12M'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>Visão Anual 12 Meses (Orçado x Realizado)</span>
        </button>

        <button
          onClick={() => setActiveTab('COMPARISON')}
          className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'COMPARISON'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Acompanhamento Mensal & Desvios</span>
        </button>

        <button
          onClick={() => setActiveTab('VERSIONS')}
          className={`pb-3 text-sm font-semibold flex items-center space-x-2 border-b-2 transition-all ${
            activeTab === 'VERSIONS'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Histórico de Versões & Metas</span>
          {versionsList.length > 0 && (
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {versionsList.length}
            </span>
          )}
        </button>
      </div>

      {/* Executive KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Receita Bruta */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Receita Bruta
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              (kpis?.revenueExecutionRate ?? 0) >= 98 
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              {(kpis?.revenueExecutionRate ?? 0).toFixed(1)}% Realizado
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {formatBRL(kpis?.totalRevenueRealized ?? 0)}
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-mono">
              Meta: {formatBRL(kpis?.totalRevenuePlanned ?? 0)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
            <span>Desvio Nominal:</span>
            <span className={`font-mono font-semibold ${(kpis?.revenueVarianceNominal ?? 0) >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
              {(kpis?.revenueVarianceNominal ?? 0) >= 0 ? '+' : ''}{formatBRL(kpis?.revenueVarianceNominal ?? 0)}
            </span>
          </div>
        </div>

        {/* 2. Custos e Despesas */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Custos & Despesas
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              (kpis?.expensesExecutionRate ?? 0) <= 100 
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
            }`}>
              {(kpis?.expensesExecutionRate ?? 0).toFixed(1)}% Consumido
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-mono font-bold text-[var(--text-primary)]">
              {formatBRL(kpis?.totalExpensesRealized ?? 0)}
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-mono">
              Teto: {formatBRL(kpis?.totalExpensesPlanned ?? 0)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
            <span>Saldo Orçamentário:</span>
            <span className={`font-mono font-semibold ${((kpis?.totalExpensesPlanned ?? 0) - (kpis?.totalExpensesRealized ?? 0)) >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
              {formatBRL((kpis?.totalExpensesPlanned ?? 0) - (kpis?.totalExpensesRealized ?? 0))}
            </span>
          </div>
        </div>

        {/* 3. Resultado Líquido */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Resultado Líquido
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              (kpis?.netIncomeRealized ?? 0) >= (kpis?.netIncomePlanned ?? 0) 
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' 
                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
            }`}>
              {(kpis?.netIncomeExecutionRate ?? 0).toFixed(1)}% Atingido
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={`text-lg font-mono font-bold ${(kpis?.netIncomeRealized ?? 0) >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
              {formatBRL(kpis?.netIncomeRealized ?? 0)}
            </span>
            <span className="text-xs text-[var(--text-secondary)] font-mono">
              Meta: {formatBRL(kpis?.netIncomePlanned ?? 0)}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
            <span>Superávit/Déficit:</span>
            <span className={`font-mono font-semibold ${(kpis?.netIncomeVarianceNominal ?? 0) >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
              {(kpis?.netIncomeVarianceNominal ?? 0) >= 0 ? '+' : ''}{formatBRL(kpis?.netIncomeVarianceNominal ?? 0)}
            </span>
          </div>
        </div>

        {/* 4. Aderência Geral */}
        <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Aderência ao Orçamento
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {kpis?.favorableAccountsCount ?? 0} favoráveis
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-lg font-mono font-bold text-amber-400">
              {(kpis?.overallBudgetAdherence ?? 0).toFixed(1)}%
            </span>
            <span className="text-xs text-[var(--text-secondary)]">
              {kpis?.criticalAlertsCount ?? 0} desvios críticos
            </span>
          </div>
          <div className="mt-2 w-full bg-[var(--surface-elevated)] h-1.5 rounded-full overflow-hidden">
            <div 
              className="bg-amber-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, kpis?.overallBudgetAdherence ?? 0))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ELABORAÇÃO & SIMULAÇÃO DO ORÇAMENTO (SOLICITADO COM BOTÕES RÁPIDOS) */}
      {/* ========================================================================= */}
      {activeTab === 'PLANNING' && (
        <div className="space-y-4">
          
          {/* Quick Simulation Options Toolbar */}
          <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center mr-1">
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  Simulações Rápidas:
                </span>

                {/* Botões de Opções de Simulação Direta */}
                <button
                  onClick={() => handleQuickSimulation('REV_PLUS_5')}
                  className="px-2.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-amber-500/15 hover:border-amber-500/40 text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-colors flex items-center"
                  title="Simular aumento de 5% em todas as contas de Receita"
                >
                  <TrendingUp className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  +5% Faturamento
                </button>

                <button
                  onClick={() => handleQuickSimulation('REV_PLUS_10')}
                  className="px-2.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-amber-500/15 hover:border-amber-500/40 text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-colors flex items-center"
                  title="Simular aumento de 10% em todas as contas de Receita"
                >
                  <TrendingUp className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  +10% Faturamento
                </button>

                <button
                  onClick={() => handleQuickSimulation('EXP_MINUS_5')}
                  className="px-2.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-amber-500/15 hover:border-amber-500/40 text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-colors flex items-center"
                  title="Simular redução de 5% em Custos e Despesas"
                >
                  <TrendingDown className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  -5% Despesas
                </button>

                <button
                  onClick={() => handleQuickSimulation('EXP_MINUS_10')}
                  className="px-2.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-amber-500/15 hover:border-amber-500/40 text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-colors flex items-center"
                  title="Simular redução de 10% em Custos e Despesas"
                >
                  <TrendingDown className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  -10% Despesas
                </button>

                <div className="h-4 w-px bg-[var(--border-subtle)] hidden sm:block" />

                {/* Ajuste em Lote % com Proteção contra Scroll */}
                <div className="flex items-center space-x-1.5 text-xs">
                  <input
                    type="number"
                    value={batchPercent}
                    onChange={e => setBatchPercent(Number(e.target.value))}
                    onWheel={e => (e.target as HTMLElement).blur()}
                    className="w-16 px-2 py-1 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg text-center text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                  />
                  <span className="text-xs font-bold text-[var(--text-secondary)]">%</span>
                  <button
                    onClick={() => handleQuickSimulation('BATCH_PERCENT')}
                    className="px-2.5 py-1 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold rounded-lg text-xs transition-colors flex items-center border border-[var(--border-subtle)]"
                  >
                    <Percent className="w-3 h-3 mr-1 text-amber-400" />
                    Aplicar no Geral
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleImportFromRealized}
                  className="px-3 py-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold hover:bg-amber-500/20 flex items-center transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Base Realizado
                </button>

                {/* Seletor rápido de linha para simulação personalizada */}
                <PremiumSelect
                  onChange={e => {
                    const acc = accounts.find(a => a.id === e.target.value);
                    if (acc) {
                      setSimulatingAccount(acc);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                  className="px-2.5 py-1.5 bg-slate-800 border border-amber-500/40 text-amber-400 rounded-xl text-xs font-semibold focus:border-amber-400 focus:outline-hidden cursor-pointer"
                  title="Selecione uma conta para personalizar reajuste por percentual, valor e período"
                >
                  <option value="" disabled>⚡ Personalizar Linha Específica...</option>
                  <optgroup label="Receitas Operacionais">
                    {revenueAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Custos Diretos (CSP)">
                    {costAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Despesas Operacionais">
                    {expenseAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </optgroup>
                </PremiumSelect>

                {changesList.length > 0 && (
                  <button
                    onClick={handleResetSimulation}
                    className="px-3 py-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold hover:bg-rose-500/20 flex items-center transition-colors"
                    title="Descartar alterações simuladas e restaurar o plano salvo"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" />
                    Descartar Simulação
                  </button>
                )}
              </div>
            </div>

            {/* Impact Banner da Simulação */}
            {changesList.length > 0 && (
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <div>
                    <span className="text-[11px] text-[var(--text-secondary)] block">Faturamento Projetado:</span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">
                      {formatBRL(simulationImpact.newRevenue)}
                      <span className={`ml-1.5 text-[10px] ${simulationImpact.revenueDiff >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                        ({simulationImpact.revenueDiff >= 0 ? '+' : ''}{formatBRL(simulationImpact.revenueDiff)})
                      </span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-[var(--text-secondary)] block">Despesas Projetadas:</span>
                    <span className="font-mono font-bold text-[var(--text-primary)]">
                      {formatBRL(simulationImpact.newExpense)}
                      <span className={`ml-1.5 text-[10px] ${simulationImpact.expenseDiff <= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                        ({simulationImpact.expenseDiff >= 0 ? '+' : ''}{formatBRL(simulationImpact.expenseDiff)})
                      </span>
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-amber-300 block font-semibold">Novo Lucro Líquido:</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {formatBRL(simulationImpact.newNetIncome)}
                      <span className={`ml-1.5 text-[10px] ${simulationImpact.netDiff >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                        ({simulationImpact.netDiff >= 0 ? '+' : ''}{formatBRL(simulationImpact.netDiff)})
                      </span>
                    </span>
                  </div>

                  <div className="border-l border-[var(--border-subtle)] pl-4 hidden md:block">
                    <span className="text-[11px] text-[var(--text-secondary)] block">Rastreamento:</span>
                    <span className="font-bold text-amber-400">
                      {changesList.length} células modificadas em {changedCountByAccount.size} contas
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsApprovalModalOpen(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-[#18181b] rounded-xl text-xs font-bold transition-all shadow-md flex items-center"
                >
                  <Award className="w-4 h-4 mr-1.5" />
                  Aprovar e Tornar Meta Oficial
                </button>
              </div>
            )}
          </div>

          {/* 12-Month Editable Matrix Table with Alternate Column Colors */}
          <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
            <div className="p-3 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-[var(--text-primary)]">Grade Mensal de Elaboração ({selectedYear})</span>
                <span className="text-[11px] text-[var(--text-secondary)] hidden sm:inline">
                  • Colunas com cores alternadas para diferenciação visual instantânea
                </span>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {/* Toggle Visão: Expandida vs Recolhida */}
                <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700">
                  <button
                    onClick={() => handleSetGlobalStructure('EXPANDED')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                      structureMode === 'EXPANDED'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Exibir todas as contas analíticas detalhadas"
                  >
                    <Maximize2 className="w-3 h-3" />
                    Expandido
                  </button>
                  <button
                    onClick={() => handleSetGlobalStructure('COLLAPSED')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                      structureMode === 'COLLAPSED'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Recolher contas e exibir apenas linhas sintéticas e principais"
                  >
                    <Minimize2 className="w-3 h-3" />
                    Recolhido
                  </button>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500/30 border border-amber-500" />
                  Modificado
                </span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[680px]">
              <table className="w-full text-left border-collapse text-xs min-w-[1150px]">
                <thead className="sticky top-0 z-20 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] shadow-xs">
                  <tr className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    <th className="py-3 px-4 min-w-[260px] sticky left-0 bg-[var(--surface-elevated)] z-30 border-r border-[var(--border-subtle)]">
                      Conta Contábil
                    </th>
                    <th className="py-3 px-3 text-right bg-[var(--surface-card)] min-w-[120px] text-[var(--text-primary)] border-r border-[var(--border-subtle)]">
                      Total Anual
                    </th>
                    {MONTH_SHORT.map((m, idx) => {
                      const isEven = idx % 2 === 0;
                      const hasChangedInCol = changedMonthsSet.has(idx);

                      return (
                        <th 
                          key={m} 
                          className={`py-3 px-2 text-right min-w-[100px] border-r border-[var(--border-subtle)]/60 ${
                            isEven ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/80'
                          }`}
                        >
                          <div className="flex items-center justify-end space-x-1">
                            <span>{m}/{String(selectedYear).substring(2)}</span>
                            {hasChangedInCol && (
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Possui alterações nesta coluna" />
                            )}
                          </div>
                        </th>
                      );
                    })}
                    <th className="py-3 px-3 text-center min-w-[100px] bg-[var(--surface-elevated)]">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {/* ========================================================================= */}
                  {/* 1. GRUPO: RECEITAS OPERACIONAIS (FATURAMENTO) */}
                  {/* ========================================================================= */}
                  <tr className="bg-slate-900 border-t-2 border-b border-amber-500/40">
                    <td colSpan={15} className="py-2.5 px-4">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleSectionCollapse('revenue')}
                          className="flex items-center space-x-2 group cursor-pointer text-left"
                          title="Clique para expandir ou recolher este grupo"
                        >
                          <span className="p-1 rounded-md bg-slate-800 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                            {isRevenueExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <span className="font-bold text-xs text-amber-300 uppercase tracking-wider group-hover:text-amber-200">
                            1. Receitas Operacionais (Faturamento)
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-semibold border border-amber-500/30">
                            {revenueAccounts.length} {revenueAccounts.length === 1 ? 'conta' : 'contas'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({isRevenueExpanded ? 'Clique p/ recolher' : 'Clique p/ expandir'})
                          </span>
                        </button>
                        <span className="text-xs font-mono font-bold text-amber-400">
                          Total Anual Previsto: {formatBRL(planningSummary.totalRevenue)}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Linhas de Contas de Receita (Ocultas no modo recolhido) */}
                  {isRevenueExpanded && revenueAccounts.map(acc => {
                    const monthly = getEditingPlannedArray(acc.id);
                    const savedMonthly = getSavedPlannedArray(acc.id);
                    const annualTotal = monthly.reduce((a, b) => a + b, 0);
                    const hasAccountChanged = changedCountByAccount.has(acc.id);
                    const rMonthly = accountRealizedMap.get(acc.id) || [];
                    const rTotal = rMonthly.reduce((a, b) => a + b, 0);

                    return (
                      <tr key={acc.id} className="bg-gradient-to-r from-amber-500/[0.05] via-amber-500/[0.015] to-transparent hover:from-amber-500/[0.10] border-l-2 border-amber-500/50 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-[var(--text-primary)] sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)]">
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-[var(--text-primary)]">{acc.name}</span>
                              {hasAccountChanged && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  Alterada
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-amber-400">{acc.code}</span>
                          </div>
                        </td>

                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                          <div>{formatBRL(annualTotal)}</div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-normal mt-0.5">
                            Real: {formatBRL(rTotal)}
                          </div>
                        </td>

                        {monthly.map((val, mIdx) => {
                          const isEven = mIdx % 2 === 0;
                          const cellKey = `${acc.id}-${mIdx}`;
                          const isCellChanged = changedCellsSet.has(cellKey);
                          const origVal = savedMonthly[mIdx] || 0;
                          const rVal = rMonthly[mIdx] || 0;

                          return (
                            <td 
                              key={mIdx} 
                              className={`py-1 px-1.5 text-right border-r border-[var(--border-subtle)]/40 ${
                                isEven ? 'bg-[var(--surface-card)]/40' : 'bg-[var(--surface-elevated)]/60'
                              }`}
                            >
                              <div className="relative">
                                <input
                                  type="number"
                                  value={val === 0 ? '' : val}
                                  placeholder="0"
                                  onChange={e => handlePlannedValueChange(acc.id, mIdx, e.target.value)}
                                  onWheel={e => (e.target as HTMLElement).blur()}
                                  title={isCellChanged ? `Anterior: ${formatBRL(origVal)} → Novo: ${formatBRL(val)}` : undefined}
                                  className={`w-full text-right px-2 py-1.5 rounded-lg font-mono text-xs sm:text-[13px] font-medium placeholder:text-[var(--text-secondary)]/40 focus:outline-hidden transition-colors ${
                                    isCellChanged
                                      ? 'bg-amber-500/20 border-2 border-amber-500/60 text-amber-300 font-bold focus:border-amber-400'
                                      : 'bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                                  }`}
                                />
                                {isCellChanged && (
                                  <span className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                                )}
                              </div>
                              <div className="text-[9px] text-[var(--text-secondary)] font-mono text-right mt-0.5" title={`Realizado no período: ${formatBRL(rVal)}`}>
                                Real: {formatBRL(rVal)}
                              </div>
                            </td>
                          );
                        })}

                        <td className="py-1 px-2 text-center bg-[var(--surface-card)]">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => setSimulatingAccount(acc)}
                              className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 rounded-lg transition-colors"
                              title="Simular ajustes específicos nesta linha (reajuste %, variação mês a mês, etc.)"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleReplicateMonth(acc.id, 0)}
                              className="p-1.5 text-[var(--text-secondary)] hover:text-amber-400 hover:bg-amber-500/15 rounded-lg transition-colors"
                              title="Replicar valor de Janeiro para todos os 12 meses"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Subtotal de Receitas */}
                  <tr className="bg-slate-900 font-bold text-amber-300 border-y-2 border-amber-500/40 text-xs">
                    <td className="py-2.5 px-4 sticky left-0 bg-slate-900 z-10 border-r border-amber-500/40 text-amber-300">
                      SUBTOTAL RECEITAS OPERACIONAIS
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-300 bg-slate-800 border-r border-amber-500/40">
                      {formatBRL(planningSummary.totalRevenue)}
                    </td>
                    {planningSummary.monthlyRevenue.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono text-amber-300 border-r border-amber-500/30">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td className="bg-slate-900"></td>
                  </tr>

                  {/* ========================================================================= */}
                  {/* 2. GRUPO: DEDUÇÕES (SE HOUVER) */}
                  {/* ========================================================================= */}
                  {deductionAccounts.length > 0 && (
                    <>
                      <tr className="bg-slate-900 border-t-2 border-b border-slate-700">
                        <td colSpan={15} className="py-2.5 px-4">
                          <div className="flex items-center justify-between">
                            <button
                              onClick={() => toggleSectionCollapse('deductions')}
                              className="flex items-center space-x-2 group cursor-pointer text-left"
                            >
                              <span className="p-1 rounded-md bg-slate-800 text-slate-300 group-hover:bg-slate-700 transition-colors">
                                {isDeductionsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </span>
                              <span className="font-bold text-xs text-slate-300 uppercase tracking-wider">
                                Deduções e Impostos sobre Faturamento
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isDeductionsExpanded && deductionAccounts.map(acc => {
                        const monthly = getEditingPlannedArray(acc.id);
                        const savedMonthly = getSavedPlannedArray(acc.id);
                        const annualTotal = monthly.reduce((a, b) => a + b, 0);
                        const rMonthly = accountRealizedMap.get(acc.id) || [];
                        const rTotal = rMonthly.reduce((a, b) => a + b, 0);

                        return (
                          <tr key={acc.id} className="bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)]/50 transition-colors">
                            <td className="py-2 px-4 text-[var(--text-secondary)] pl-8 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)]">
                              <span className="text-xs">{acc.name}</span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-rose-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                              <div>{formatBRL(annualTotal)}</div>
                              <div className="text-[10px] text-[var(--text-secondary)] font-normal mt-0.5">
                                Real: {formatBRL(rTotal)}
                              </div>
                            </td>
                            {monthly.map((val, mIdx) => {
                              const rVal = rMonthly[mIdx] || 0;
                              return (
                                <td key={mIdx} className="py-1 px-1.5 text-right border-r border-[var(--border-subtle)]/40">
                                  <input
                                    type="number"
                                    value={val === 0 ? '' : val}
                                    placeholder="0"
                                    onChange={e => handlePlannedValueChange(acc.id, mIdx, e.target.value)}
                                    className="w-full text-right px-2 py-1 rounded-lg font-mono text-xs bg-[var(--surface-elevated)] border border-[var(--border-subtle)]"
                                  />
                                  <div className="text-[9px] text-[var(--text-secondary)] font-mono text-right mt-0.5" title={`Realizado no período: ${formatBRL(rVal)}`}>
                                    Real: {formatBRL(rVal)}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-1 px-2 text-center bg-[var(--surface-card)]"></td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* ========================================================================= */}
                  {/* 3. GRUPO: CUSTOS DOS SERVIÇOS PRESTADOS (CSP) */}
                  {/* ========================================================================= */}
                  <tr className="bg-slate-900 border-t-2 border-b border-amber-500/40">
                    <td colSpan={15} className="py-2.5 px-4">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleSectionCollapse('costs')}
                          className="flex items-center space-x-2 group cursor-pointer text-left"
                          title="Clique para expandir ou recolher este grupo"
                        >
                          <span className="p-1 rounded-md bg-slate-800 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                            {isCostsExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                          <span className="font-bold text-xs text-amber-300 uppercase tracking-wider group-hover:text-amber-200">
                            2. Custos dos Serviços Prestados (Custos Diretos)
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-semibold border border-amber-500/30">
                            {costAccounts.length} {costAccounts.length === 1 ? 'conta' : 'contas'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({isCostsExpanded ? 'Clique p/ recolher' : 'Clique p/ expandir'})
                          </span>
                        </button>
                        <span className="text-xs font-mono font-bold text-amber-400">
                          Total Anual Previsto: {formatBRL(planningSummary.totalCosts)}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Linhas de Contas de Custo */}
                  {isCostsExpanded && costAccounts.map(acc => {
                    const monthly = getEditingPlannedArray(acc.id);
                    const savedMonthly = getSavedPlannedArray(acc.id);
                    const annualTotal = monthly.reduce((a, b) => a + b, 0);
                    const hasAccountChanged = changedCountByAccount.has(acc.id);
                    const rMonthly = accountRealizedMap.get(acc.id) || [];
                    const rTotal = rMonthly.reduce((a, b) => a + b, 0);

                    return (
                      <tr key={acc.id} className="bg-gradient-to-r from-amber-500/[0.05] via-amber-500/[0.015] to-transparent hover:from-amber-500/[0.10] border-l-2 border-amber-500/50 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-[var(--text-primary)] sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)]">
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-[var(--text-primary)]">{acc.name}</span>
                              {hasAccountChanged && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  Alterada
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-amber-400">{acc.code}</span>
                          </div>
                        </td>

                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                          <div>{formatBRL(annualTotal)}</div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-normal mt-0.5">
                            Real: {formatBRL(rTotal)}
                          </div>
                        </td>

                        {monthly.map((val, mIdx) => {
                          const isEven = mIdx % 2 === 0;
                          const cellKey = `${acc.id}-${mIdx}`;
                          const isCellChanged = changedCellsSet.has(cellKey);
                          const origVal = savedMonthly[mIdx] || 0;
                          const rVal = rMonthly[mIdx] || 0;

                          return (
                            <td 
                              key={mIdx} 
                              className={`py-1 px-1.5 text-right border-r border-[var(--border-subtle)]/40 ${
                                isEven ? 'bg-[var(--surface-card)]/40' : 'bg-[var(--surface-elevated)]/60'
                              }`}
                            >
                              <div className="relative">
                                <input
                                  type="number"
                                  value={val === 0 ? '' : val}
                                  placeholder="0"
                                  onChange={e => handlePlannedValueChange(acc.id, mIdx, e.target.value)}
                                  onWheel={e => (e.target as HTMLElement).blur()}
                                  title={isCellChanged ? `Anterior: ${formatBRL(origVal)} → Novo: ${formatBRL(val)}` : undefined}
                                  className={`w-full text-right px-2 py-1.5 rounded-lg font-mono text-xs sm:text-[13px] font-medium placeholder:text-[var(--text-secondary)]/40 focus:outline-hidden transition-colors ${
                                    isCellChanged
                                      ? 'bg-amber-500/20 border-2 border-amber-500/60 text-amber-300 font-bold focus:border-amber-400'
                                      : 'bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                                  }`}
                                />
                                {isCellChanged && (
                                  <span className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                                )}
                              </div>
                              <div className="text-[9px] text-[var(--text-secondary)] font-mono text-right mt-0.5" title={`Realizado no período: ${formatBRL(rVal)}`}>
                                Real: {formatBRL(rVal)}
                              </div>
                            </td>
                          );
                        })}

                        <td className="py-1 px-2 text-center bg-[var(--surface-card)]">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => setSimulatingAccount(acc)}
                              className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 rounded-lg transition-colors"
                              title="Simular ajustes específicos nesta linha (reajuste %, variação mês a mês, etc.)"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleReplicateMonth(acc.id, 0)}
                              className="p-1.5 text-[var(--text-secondary)] hover:text-amber-400 hover:bg-amber-500/15 rounded-lg transition-colors"
                              title="Replicar valor de Janeiro para todos os 12 meses"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Subtotal de Custos */}
                  <tr className="bg-slate-900 font-bold text-amber-300 border-y-2 border-amber-500/40 text-xs">
                    <td className="py-2.5 px-4 sticky left-0 bg-slate-900 z-10 border-r border-amber-500/40 text-amber-300">
                      SUBTOTAL CUSTOS DIRETOS (CSP)
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-300 bg-slate-800 border-r border-amber-500/40">
                      {formatBRL(planningSummary.totalCosts)}
                    </td>
                    {planningSummary.monthlyCosts.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono text-amber-300 border-r border-amber-500/30">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td className="bg-slate-900"></td>
                  </tr>

                  {/* ========================================================================= */}
                  {/* 4. GRUPO: DESPESAS OPERACIONAIS */}
                  {/* ========================================================================= */}
                  <tr className="bg-slate-900 border-t-2 border-b border-slate-700">
                    <td colSpan={15} className="py-2.5 px-4">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => toggleSectionCollapse('expenses')}
                          className="flex items-center space-x-2 group cursor-pointer text-left"
                          title="Clique para expandir ou recolher este grupo"
                        >
                          <span className="p-1 rounded-md bg-slate-800 text-slate-300 group-hover:bg-slate-700 transition-colors">
                            {isExpensesExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                          <span className="font-bold text-xs text-slate-200 uppercase tracking-wider group-hover:text-white">
                            3. Despesas Operacionais (Administrativas, Comerciais, Pessoal & Gerais)
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                            {expenseAccounts.length} {expenseAccounts.length === 1 ? 'conta' : 'contas'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({isExpensesExpanded ? 'Clique p/ recolher' : 'Clique p/ expandir'})
                          </span>
                        </button>
                        <span className="text-xs font-mono font-bold text-slate-300">
                          Total Anual Previsto: {formatBRL(planningSummary.totalExpenses)}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Linhas de Contas de Despesa */}
                  {isExpensesExpanded && expenseAccounts.map(acc => {
                    const monthly = getEditingPlannedArray(acc.id);
                    const savedMonthly = getSavedPlannedArray(acc.id);
                    const annualTotal = monthly.reduce((a, b) => a + b, 0);
                    const hasAccountChanged = changedCountByAccount.has(acc.id);
                    const rMonthly = accountRealizedMap.get(acc.id) || [];
                    const rTotal = rMonthly.reduce((a, b) => a + b, 0);

                    return (
                      <tr key={acc.id} className="bg-gradient-to-r from-slate-500/[0.05] via-slate-500/[0.015] to-transparent hover:from-slate-500/[0.10] border-l-2 border-slate-500/50 transition-colors">
                        <td className="py-2.5 px-4 font-medium text-[var(--text-primary)] sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)]">
                          <div className="flex flex-col">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-semibold text-[var(--text-primary)]">{acc.name}</span>
                              {hasAccountChanged && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                  Alterada
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">{acc.code}</span>
                          </div>
                        </td>

                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-300 bg-slate-800/40 border-r border-[var(--border-subtle)]">
                          <div>{formatBRL(annualTotal)}</div>
                          <div className="text-[10px] text-[var(--text-secondary)] font-normal mt-0.5">
                            Real: {formatBRL(rTotal)}
                          </div>
                        </td>

                        {monthly.map((val, mIdx) => {
                          const isEven = mIdx % 2 === 0;
                          const cellKey = `${acc.id}-${mIdx}`;
                          const isCellChanged = changedCellsSet.has(cellKey);
                          const origVal = savedMonthly[mIdx] || 0;
                          const rVal = rMonthly[mIdx] || 0;

                          return (
                            <td 
                              key={mIdx} 
                              className={`py-1 px-1.5 text-right border-r border-[var(--border-subtle)]/40 ${
                                isEven ? 'bg-[var(--surface-card)]/40' : 'bg-[var(--surface-elevated)]/60'
                              }`}
                            >
                              <div className="relative">
                                <input
                                  type="number"
                                  value={val === 0 ? '' : val}
                                  placeholder="0"
                                  onChange={e => handlePlannedValueChange(acc.id, mIdx, e.target.value)}
                                  onWheel={e => (e.target as HTMLElement).blur()}
                                  title={isCellChanged ? `Anterior: ${formatBRL(origVal)} → Novo: ${formatBRL(val)}` : undefined}
                                  className={`w-full text-right px-2 py-1.5 rounded-lg font-mono text-xs sm:text-[13px] font-medium placeholder:text-[var(--text-secondary)]/40 focus:outline-hidden transition-colors ${
                                    isCellChanged
                                      ? 'bg-amber-500/20 border-2 border-amber-500/60 text-amber-300 font-bold focus:border-amber-400'
                                      : 'bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30'
                                  }`}
                                />
                                {isCellChanged && (
                                  <span className="absolute top-1 left-1.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                                )}
                              </div>
                              <div className="text-[9px] text-[var(--text-secondary)] font-mono text-right mt-0.5" title={`Realizado no período: ${formatBRL(rVal)}`}>
                                Real: {formatBRL(rVal)}
                              </div>
                            </td>
                          );
                        })}

                        <td className="py-1 px-2 text-center bg-[var(--surface-card)]">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => setSimulatingAccount(acc)}
                              className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/15 rounded-lg transition-colors"
                              title="Simular ajustes específicos nesta linha (reajuste %, variação mês a mês, etc.)"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleReplicateMonth(acc.id, 0)}
                              className="p-1.5 text-[var(--text-secondary)] hover:text-amber-400 hover:bg-amber-500/15 rounded-lg transition-colors"
                              title="Replicar valor de Janeiro para todos os 12 meses"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Subtotal de Despesas */}
                  <tr className="bg-gradient-to-r from-rose-950/90 via-rose-900/50 to-[var(--surface-card)] font-bold text-rose-300 border-y-2 border-rose-500/40 text-xs">
                    <td className="py-2.5 px-4 sticky left-0 bg-rose-950/95 z-10 border-r border-rose-500/40 text-rose-300">
                      SUBTOTAL DESPESAS OPERACIONAIS
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-rose-300 bg-rose-900/60 border-r border-rose-500/40">
                      {formatBRL(planningSummary.totalExpenses)}
                    </td>
                    {planningSummary.monthlyExpenses.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono text-rose-300 border-r border-rose-500/30">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td className="bg-rose-950/80"></td>
                  </tr>

                  {/* ========================================================================= */}
                  {/* SOMA GERAL — DRE (REGIME DE COMPETÊNCIA) */}
                  {/* ========================================================================= */}
                  <tr className="bg-[var(--surface-elevated)] border-t-4 border-amber-500/60 font-bold uppercase text-[11px] text-amber-400">
                    <td colSpan={15} className="py-2.5 px-4">
                      SOMA GERAL — DEMONSTRAÇÃO DO RESULTADO (DRE - REGIME DE COMPETÊNCIA)
                    </td>
                  </tr>

                  {/* (+) Receita Operacional Bruta */}
                  <tr className="bg-slate-900/60 font-semibold text-amber-300">
                    <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-amber-300">
                      (+) Receita Operacional Bruta
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-amber-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                      {formatBRL(planningSummary.totalRevenue)}
                    </td>
                    {planningSummary.monthlyRevenue.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono border-r border-[var(--border-subtle)]/40 text-amber-300">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td></td>
                  </tr>

                  {/* (-) Custos Operacionais */}
                  <tr className="hover:bg-[var(--surface-elevated)]/40 text-amber-300">
                    <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-amber-300 pl-8">
                      (-) Custos dos Serviços Prestados
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-amber-300 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                      {formatBRL(planningSummary.totalCosts)}
                    </td>
                    {planningSummary.monthlyCosts.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono border-r border-[var(--border-subtle)]/40 text-amber-300">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td></td>
                  </tr>

                  {/* (=) Lucro Bruto */}
                  <tr className="bg-[var(--surface-elevated)]/60 font-semibold border-t border-[var(--border-subtle)] text-[var(--text-primary)]">
                    <td className="py-2 px-4 sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)]">
                      (=) Lucro Bruto Operacional
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold bg-amber-500/10 border-r border-[var(--border-subtle)] text-[var(--text-primary)]">
                      {formatBRL(planningSummary.totalGrossProfit)}
                    </td>
                    {planningSummary.monthlyGrossProfit.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono border-r border-[var(--border-subtle)]/40 text-[var(--text-primary)]">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td></td>
                  </tr>

                  {/* (-) Despesas Operacionais */}
                  <tr className="hover:bg-[var(--surface-elevated)]/40 text-rose-300">
                    <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-rose-300 pl-8">
                      (-) Despesas Operacionais Totais
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-rose-300 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                      {formatBRL(planningSummary.totalExpenses)}
                    </td>
                    {planningSummary.monthlyExpenses.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono border-r border-[var(--border-subtle)]/40 text-rose-300">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td></td>
                  </tr>

                  {/* (=) RESULTADO LÍQUIDO DO EXERCÍCIO (DRE) */}
                  <tr className="bg-amber-500/20 font-extrabold border-t-2 border-amber-500/50 text-amber-300 text-xs">
                    <td className="py-2.5 px-4 sticky left-0 bg-amber-950/80 z-10 border-r border-amber-500/40 text-amber-300">
                      (=) RESULTADO LÍQUIDO DO EXERCÍCIO (DRE)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-extrabold text-amber-300 bg-amber-500/25 border-r border-amber-500/40 text-sm">
                      {formatBRL(planningSummary.totalNetIncome)}
                    </td>
                    {planningSummary.monthlyNetIncome.map((v, idx) => (
                      <td key={idx} className={`py-2.5 px-2 text-right font-mono font-bold border-r border-amber-500/25 ${
                        v >= 0 ? 'text-amber-300' : 'text-rose-400'
                      }`}>
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td className="bg-amber-950/80"></td>
                  </tr>

                  {/* ========================================================================= */}
                  {/* SOMA GERAL — FLUXO DE CAIXA (REGIME FINANCEIRO) */}
                  {/* ========================================================================= */}
                  <tr className="bg-[var(--surface-elevated)] border-t-4 border-amber-500/60 font-bold uppercase text-[11px] text-amber-400">
                    <td colSpan={15} className="py-2.5 px-4">
                      SOMA GERAL — FLUXO FINANCEIRO DE CAIXA (REGIME DE CAIXA)
                    </td>
                  </tr>

                  {/* (+) Entradas de Caixa */}
                  <tr className="hover:bg-[var(--surface-elevated)]/40 text-amber-300 font-medium">
                    <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-amber-300 pl-8">
                      (+) Entradas Operacionais de Caixa
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-amber-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                      {formatBRL(planningSummary.totalRevenue)}
                    </td>
                    {planningSummary.monthlyRevenue.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono border-r border-[var(--border-subtle)]/40 text-amber-300">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td></td>
                  </tr>

                  {/* (-) Saídas de Caixa */}
                  <tr className="hover:bg-[var(--surface-elevated)]/40 text-rose-400 font-medium">
                    <td className="py-2 px-4 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] text-rose-400 pl-8">
                      (-) Saídas Operacionais (Custos + Despesas)
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-rose-400 bg-amber-500/10 border-r border-[var(--border-subtle)]">
                      {formatBRL(planningSummary.totalCosts + planningSummary.totalExpenses)}
                    </td>
                    {planningSummary.monthlyTotalExpensesAndCosts.map((v, idx) => (
                      <td key={idx} className="py-2 px-2 text-right font-mono border-r border-[var(--border-subtle)]/40 text-rose-400">
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td></td>
                  </tr>

                  {/* (=) Geração Líquida de Caixa */}
                  <tr className="bg-amber-500/10 font-bold text-amber-300 border-t border-[var(--border-subtle)]">
                    <td className="py-2 px-4 sticky left-0 bg-[var(--surface-elevated)] z-10 border-r border-[var(--border-subtle)] text-amber-300">
                      (=) GERAÇÃO LÍQUIDA DE CAIXA NO MÊS
                    </td>
                    <td className={`py-2 px-3 text-right font-mono font-extrabold bg-amber-500/20 border-r border-[var(--border-subtle)] ${
                      planningSummary.totalCashNet >= 0 ? 'text-amber-400' : 'text-rose-400'
                    }`}>
                      {planningSummary.totalCashNet >= 0 ? '+' : ''}{formatBRL(planningSummary.totalCashNet)}
                    </td>
                    {planningSummary.monthlyCashNet.map((v, idx) => (
                      <td key={idx} className={`py-2 px-2 text-right font-mono font-bold border-r border-[var(--border-subtle)]/40 ${
                        v >= 0 ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {v >= 0 ? '+' : ''}{formatBRL(v)}
                      </td>
                    ))}
                    <td className="bg-amber-500/10"></td>
                  </tr>

                  {/* (=) SALDO FINAL ACUMULADO DE CAIXA */}
                  <tr className="bg-slate-950 font-extrabold border-t-2 border-amber-500/50 text-amber-400 text-xs">
                    <td className="py-2.5 px-4 sticky left-0 bg-slate-950 z-10 border-r border-amber-500/40 text-amber-400">
                      (=) SALDO FINAL ACUMULADO DE CAIXA
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-extrabold text-amber-400 bg-slate-900 border-r border-amber-500/40 text-sm">
                      {formatBRL(planningSummary.finalYearCash)}
                    </td>
                    {planningSummary.monthlyCashFinal.map((v, idx) => (
                      <td key={idx} className={`py-2.5 px-2 text-right font-mono font-bold border-r border-amber-500/30 ${
                        v >= 0 ? 'text-amber-400' : 'text-rose-400'
                      }`}>
                        {formatBRL(v)}
                      </td>
                    ))}
                    <td className="bg-slate-950"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* NOVA SUB-ABA: DEMONSTRATIVO DRE & CAIXA PROJETADO */}
      {/* ========================================================================= */}
      {activeTab === 'DRE_CASH_PROJECTION' && (
        <BudgetDreCashProjectionTab
          selectedYear={selectedYear}
          editingPlan={editingPlan}
          revenueAccounts={revenueAccounts}
          deductionAccounts={deductionAccounts}
          costAccounts={costAccounts}
          expenseAccounts={expenseAccounts}
          getEditingPlannedArray={getEditingPlannedArray}
          onNavigateToPlanning={() => setActiveTab('PLANNING')}
        />
      )}

      {/* ========================================================================= */}
      {/* TAB 2: VISÃO ANUAL 12 MESES (ORÇADO X REALIZADO LADO A LADO) */}
      {/* ========================================================================= */}
      {activeTab === 'ANNUAL_12M' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[var(--text-secondary)] mr-1">Exibição:</span>
              {[
                { id: 'ORC_VS_REAL', label: 'Orçado x Realizado' },
                { id: 'PLANNED_ONLY', label: 'Apenas Orçado' },
                { id: 'REALIZED_ONLY', label: 'Apenas Realizado' },
                { id: 'VARIANCE_ONLY', label: 'Desvios (R$ e %)' }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setAnnualMetricMode(m.id as AnnualMetricMode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    annualMetricMode === m.id
                      ? 'bg-amber-500 text-[#18181b] shadow-xs'
                      : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setIsFitScreen(!isFitScreen)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors flex items-center ${
                  isFitScreen
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
                title={isFitScreen ? 'Mudar para Visualização 12M Completa' : 'Ajustar à Tela (Compacto)'}
              >
                {isFitScreen ? <Minimize2 className="w-3.5 h-3.5 mr-1.5" /> : <Maximize2 className="w-3.5 h-3.5 mr-1.5" />}
                {isFitScreen ? 'Modo Compacto' : '12 Meses (Scroll Livre)'}
              </button>

              <button
                onClick={handleExportMatrixExcel}
                className="px-3 py-1.5 text-xs font-semibold text-amber-400 border border-amber-500/30 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 flex items-center transition-colors"
                title="Exportar grade dos 12 meses para Excel"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Planilha 12M
              </button>
            </div>
          </div>

          {/* Consolidated 12-Month Summary Ribbon */}
          <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs p-4 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2.5">
              <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center">
                <Layers className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                Resumo Consolidado Mês a Mês ({selectedYear})
              </span>
              <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                Coluna destacada em dourado = Mês focal corrente ({MONTH_NAMES[currentMonthIndex]}) • Role horizontalmente para ver todos os meses
              </span>
            </div>

            <div className="overflow-x-auto pb-2">
              <table className={`w-full text-left border-collapse text-xs ${isFitScreen ? 'min-w-[1100px]' : 'min-w-[1360px]'}`}>
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)]">
                    <th className="py-2.5 px-3 sticky left-0 bg-[var(--surface-card)] z-10 min-w-[240px] border-r border-[var(--border-subtle)] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.15)]">
                      Linha Mestra
                    </th>
                    <th className="py-2.5 px-2 text-right font-bold text-[var(--text-primary)] bg-[var(--surface-elevated)] min-w-[120px] border-r border-[var(--border-subtle)]">
                      Total Anual
                    </th>
                    {MONTH_SHORT.map((m, idx) => {
                      const isCurrent = idx === currentMonthIndex && selectedYear === currentYear;
                      const isEven = idx % 2 === 0;

                      return (
                        <th 
                          key={m} 
                          className={`py-2.5 px-2 text-right border-r border-[var(--border-subtle)]/60 min-w-[85px] ${
                            isCurrent 
                              ? 'bg-amber-500/15 text-amber-300 font-bold border-x border-amber-500/30' 
                              : isEven ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/80'
                          }`}
                        >
                          {m}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
                  {/* Receita Bruta */}
                  <tr className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                    <td className={`py-2 px-2.5 font-sans font-semibold text-[var(--text-primary)] sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] ${isFitScreen ? 'truncate' : ''}`}>
                      Receita Bruta (R$)
                    </td>
                    <td className="py-2 px-1.5 text-right font-bold text-amber-400 bg-[var(--surface-elevated)]">
                      {isFitScreen && useCompactNumbers 
                        ? formatCompactBRL(monthlySummaryRibbon.revRealized.reduce((a, b) => a + b, 0))
                        : formatBRL(monthlySummaryRibbon.revRealized.reduce((a, b) => a + b, 0))}
                    </td>
                    {monthlySummaryRibbon.revRealized.map((val, idx) => {
                      const isCurrent = idx === currentMonthIndex && selectedYear === currentYear;
                      const isEven = idx % 2 === 0;
                      return (
                        <td key={idx} className={`py-2 px-1 text-right text-[var(--text-primary)] ${
                          isCurrent 
                            ? 'bg-amber-500/15 font-bold border-x border-amber-500/30 text-amber-300' 
                            : isEven ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                        }`}>
                          {isFitScreen && useCompactNumbers ? formatCompactBRL(val) : formatBRL(val)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Custos e Despesas */}
                  <tr className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                    <td className={`py-2 px-2.5 font-sans font-semibold text-[var(--text-primary)] sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] ${isFitScreen ? 'truncate' : ''}`}>
                      Custos & Despesas (R$)
                    </td>
                    <td className="py-2 px-1.5 text-right font-bold text-rose-400 bg-[var(--surface-elevated)]">
                      {isFitScreen && useCompactNumbers 
                        ? formatCompactBRL(monthlySummaryRibbon.expRealized.reduce((a, b) => a + b, 0))
                        : formatBRL(monthlySummaryRibbon.expRealized.reduce((a, b) => a + b, 0))}
                    </td>
                    {monthlySummaryRibbon.expRealized.map((val, idx) => {
                      const isCurrent = idx === currentMonthIndex && selectedYear === currentYear;
                      const isEven = idx % 2 === 0;
                      return (
                        <td key={idx} className={`py-2 px-1 text-right text-[var(--text-secondary)] ${
                          isCurrent 
                            ? 'bg-amber-500/15 font-bold border-x border-amber-500/30 text-amber-300' 
                            : isEven ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                        }`}>
                          {isFitScreen && useCompactNumbers ? formatCompactBRL(val) : formatBRL(val)}
                        </td>
                      );
                    })}
                  </tr>

                  {/* Resultado Líquido */}
                  <tr className="bg-amber-500/5 font-bold hover:bg-amber-500/10 transition-colors">
                    <td className={`py-2 px-2.5 font-sans font-bold text-amber-400 sticky left-0 bg-[var(--surface-card)] z-10 border-r border-[var(--border-subtle)] ${isFitScreen ? 'truncate' : ''}`}>
                      Resultado Líquido (R$)
                    </td>
                    <td className="py-2 px-1.5 text-right font-bold text-amber-400 bg-[var(--surface-elevated)]">
                      {isFitScreen && useCompactNumbers 
                        ? formatCompactBRL(monthlySummaryRibbon.netRealized.reduce((a, b) => a + b, 0))
                        : formatBRL(monthlySummaryRibbon.netRealized.reduce((a, b) => a + b, 0))}
                    </td>
                    {monthlySummaryRibbon.netRealized.map((val, idx) => {
                      const isCurrent = idx === currentMonthIndex && selectedYear === currentYear;
                      const isEven = idx % 2 === 0;
                      return (
                        <td key={idx} className={`py-2 px-1 text-right ${val >= 0 ? 'text-amber-400' : 'text-rose-400'} ${
                          isCurrent 
                            ? 'bg-amber-500/20 font-bold border-x border-amber-500/40 text-amber-300' 
                            : isEven ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                        }`}>
                          {isFitScreen && useCompactNumbers ? formatCompactBRL(val) : formatBRL(val)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Full 12-Month Matrix Table with Alternate Column Colors */}
          <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[750px] overflow-y-auto pb-2">
              <table className={`w-full text-left border-collapse text-xs ${isFitScreen ? 'min-w-[1150px]' : 'min-w-[1380px]'}`}>
                <thead className="sticky top-0 z-20 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] shadow-xs">
                  <tr className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    <th className="py-3 px-3.5 sticky left-0 bg-[var(--surface-elevated)] z-30 border-r border-[var(--border-subtle)] min-w-[280px] max-w-[340px] shadow-[3px_0_8px_-2px_rgba(0,0,0,0.2)]">
                      Conta Contábil / Estrutura
                    </th>

                    <th className="py-3 px-2 text-right bg-[var(--surface-card)] border-r border-[var(--border-subtle)] font-bold text-[var(--text-primary)] min-w-[130px]">
                      Total Anual ({selectedYear})
                    </th>

                    {MONTH_SHORT.map((m, idx) => {
                      const isCurrent = idx === currentMonthIndex && selectedYear === currentYear;
                      const isEven = idx % 2 === 0;

                      return (
                        <th 
                          key={m} 
                          className={`py-3 px-2 text-right border-r border-[var(--border-subtle)]/60 ${
                            annualMetricMode === 'ORC_VS_REAL' ? 'min-w-[115px]' : 'min-w-[92px]'
                          } ${
                            isCurrent 
                              ? 'bg-amber-500/15 text-amber-300 font-bold border-x border-amber-500/30' 
                              : isEven ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/80'
                          }`}
                        >
                          <div className="flex flex-col items-end">
                            <div className="flex items-center space-x-1">
                              <span>{m}</span>
                              {isCurrent && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Mês corrente" />
                              )}
                            </div>
                            {annualMetricMode === 'ORC_VS_REAL' && (
                              <span className="text-[9px] font-normal text-[var(--text-secondary)]">
                                {isFitScreen ? 'R/O' : 'Real / Orç'}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredAnnualLines.map(line => {
                    const isHeader = line.isHeader;
                    const isSummary = line.isSummary;
                    const isExpanded = line.code ? expandedCodes[line.code] : true;

                    let rowBg = 'hover:bg-[var(--surface-elevated)]/60';
                    let fontStyle = 'text-[var(--text-primary)] font-normal';
                    let stickyBg = 'bg-[var(--surface-card)]';

                    if (isHeader) {
                      rowBg = 'bg-[var(--surface-elevated)] font-bold text-[var(--text-primary)] border-t border-b border-[var(--border-subtle)]';
                      fontStyle = 'font-bold text-[var(--text-primary)]';
                      stickyBg = 'bg-[var(--surface-elevated)]';
                    } else if (isSummary) {
                      rowBg = 'bg-amber-500/10 font-bold text-amber-300 border-t-2 border-b-2 border-amber-500/30';
                      fontStyle = 'font-bold text-amber-300';
                      stickyBg = 'bg-amber-950/40';
                    }

                    return (
                      <tr key={line.id} className={`${rowBg} transition-colors`}>
                        {/* Fixed Account Column */}
                        <td 
                          className={`py-2.5 px-3 sticky left-0 ${stickyBg} z-10 border-r border-[var(--border-subtle)] shadow-[3px_0_8px_-2px_rgba(0,0,0,0.2)]`}
                          title={`${line.code} - ${line.name}`}
                        >
                          <div 
                            className="flex items-center space-x-1.5 truncate"
                            style={{ paddingLeft: `${Math.max(0, (line.level - 1) * 12)}px` }}
                          >
                            {isHeader && (
                              <button
                                onClick={() => line.code && toggleExpand(line.code)}
                                className="p-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded shrink-0"
                              >
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                            )}
                            <span className="font-mono text-[10px] text-amber-400 font-medium shrink-0">
                              {line.code}
                            </span>
                            <span className={`${fontStyle} truncate text-xs sm:text-[13px]`} title={line.name}>
                              {line.name}
                            </span>
                          </div>
                        </td>

                        {/* Total Anual */}
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-[var(--text-primary)] bg-[var(--surface-card)] border-r border-[var(--border-subtle)] tabular-nums">
                          {annualMetricMode === 'ORC_VS_REAL' ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-[var(--text-primary)] text-xs sm:text-[13px] font-bold">
                                {isFitScreen && useCompactNumbers ? formatCompactBRL(line.plannedTotal) : formatBRL(line.plannedTotal)}
                              </span>
                              <span className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">
                                Real: {isFitScreen && useCompactNumbers ? formatCompactBRL(line.realizedTotal) : formatBRL(line.realizedTotal)}
                              </span>
                              <span className={`text-[9px] font-mono ${line.varianceNominal >= 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                {line.varianceNominal > 0 ? '+' : ''}{isFitScreen && useCompactNumbers ? formatCompactBRL(line.varianceNominal) : formatBRL(line.varianceNominal)}
                              </span>
                            </div>
                          ) : annualMetricMode === 'PLANNED_ONLY' ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-xs sm:text-[13px]">
                                {isFitScreen && useCompactNumbers ? formatCompactBRL(line.plannedTotal) : formatBRL(line.plannedTotal)}
                              </span>
                              <span className="text-[9px] text-[var(--text-secondary)]/80 font-mono mt-0.5">
                                Real: {isFitScreen && useCompactNumbers ? formatCompactBRL(line.realizedTotal) : formatBRL(line.realizedTotal)}
                              </span>
                            </div>
                          ) : annualMetricMode === 'REALIZED_ONLY' ? (
                            <div className="flex flex-col items-end leading-tight">
                              <span className="text-xs sm:text-[13px]">
                                {isFitScreen && useCompactNumbers ? formatCompactBRL(line.realizedTotal) : formatBRL(line.realizedTotal)}
                              </span>
                              <span className="text-[9px] text-[var(--text-secondary)]/80 font-mono mt-0.5">
                                Orç: {isFitScreen && useCompactNumbers ? formatCompactBRL(line.plannedTotal) : formatBRL(line.plannedTotal)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end leading-tight">
                              <span className={`text-xs sm:text-[13px] ${line.varianceNominal >= 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                {line.varianceNominal > 0 ? '+' : ''}{isFitScreen && useCompactNumbers ? formatCompactBRL(line.varianceNominal) : formatBRL(line.varianceNominal)}
                              </span>
                              <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                                {(line.variancePercent ?? 0).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </td>

                        {/* 12 Months Columns with Alternate Colors */}
                        {MONTH_SHORT.map((m, mIdx) => {
                          const isCurrent = mIdx === currentMonthIndex && selectedYear === currentYear;
                          const isEven = mIdx % 2 === 0;
                          const pVal = line.plannedMonthly[mIdx] || 0;
                          const rVal = line.realizedMonthly[mIdx] || 0;
                          const devNom = rVal - pVal;
                          const devPct = pVal !== 0 ? (devNom / pVal) * 100 : 0;

                          return (
                            <td 
                              key={mIdx} 
                              className={`py-2 px-2 text-right font-mono text-[11px] sm:text-xs tabular-nums border-r border-[var(--border-subtle)]/40 ${
                                isCurrent 
                                  ? 'bg-amber-500/15 border-x border-amber-500/30 font-semibold' 
                                  : isEven ? 'bg-[var(--surface-card)]' : 'bg-[var(--surface-elevated)]/60'
                              }`}
                            >
                              {annualMetricMode === 'ORC_VS_REAL' ? (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="font-bold text-[var(--text-primary)]">
                                    {isFitScreen && useCompactNumbers ? formatCompactBRL(pVal) : formatBRL(pVal)}
                                  </span>
                                  <span className="text-[10px] text-[var(--text-secondary)] font-mono mt-0.5">
                                    Real: {isFitScreen && useCompactNumbers ? formatCompactBRL(rVal) : formatBRL(rVal)}
                                  </span>
                                </div>
                              ) : annualMetricMode === 'PLANNED_ONLY' ? (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="text-[var(--text-primary)] font-medium">
                                    {isFitScreen && useCompactNumbers ? formatCompactBRL(pVal) : formatBRL(pVal)}
                                  </span>
                                  <span className="text-[9px] text-[var(--text-secondary)]/80 font-mono mt-0.5">
                                    Real: {isFitScreen && useCompactNumbers ? formatCompactBRL(rVal) : formatBRL(rVal)}
                                  </span>
                                </div>
                              ) : annualMetricMode === 'REALIZED_ONLY' ? (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="text-[var(--text-primary)] font-bold">
                                    {isFitScreen && useCompactNumbers ? formatCompactBRL(rVal) : formatBRL(rVal)}
                                  </span>
                                  <span className="text-[9px] text-[var(--text-secondary)]/80 font-mono mt-0.5">
                                    Orç: {isFitScreen && useCompactNumbers ? formatCompactBRL(pVal) : formatBRL(pVal)}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-end leading-tight">
                                  <span className={`font-semibold ${devNom >= 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                    {devNom > 0 ? '+' : ''}{isFitScreen && useCompactNumbers ? formatCompactBRL(devNom) : formatBRL(devNom)}
                                  </span>
                                  <span className="text-[9px] text-[var(--text-secondary)] font-mono">
                                    {devPct > 0 ? '+' : ''}{(devPct ?? 0).toFixed(0)}%
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ACOMPANHAMENTO MENSAL E DESVIOS */}
      {/* ========================================================================= */}
      {activeTab === 'COMPARISON' && (
        <div className="space-y-4">
          {/* Controls & Filters Bar */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs">
            {/* Month Filter */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-[var(--text-secondary)] mr-1">Visão:</span>
              <button
                onClick={() => setSelectedMonth('ALL')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  selectedMonth === 'ALL'
                    ? 'bg-amber-500 text-[#18181b] shadow-xs'
                    : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                }`}
              >
                Acumulado Anual (12M)
              </button>
              {MONTH_SHORT.map((m, idx) => (
                <button
                  key={m}
                  onClick={() => setSelectedMonth(idx)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-all ${
                    selectedMonth === idx
                      ? 'bg-amber-500 text-[#18181b] font-bold shadow-xs'
                      : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Search and Nature Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  placeholder="Buscar conta..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/60 focus:border-amber-400 focus:outline-hidden w-40 sm:w-48"
                />
              </div>

              <PremiumSelect
                value={natureFilter}
                onChange={e => setNatureFilter(e.target.value as any)}
                aria-label="Filtrar contas por natureza"
                className="px-2.5 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              >
                <option value="ALL">Todas as Contas</option>
                <option value="RECEITAS">Apenas Receitas</option>
                <option value="DESPESAS">Custos e Despesas</option>
              </PremiumSelect>

              <button
                onClick={expandAll}
                className="px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-elevated)]"
              >
                Expandir
              </button>
              <button
                onClick={collapseAll}
                className="px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-elevated)]"
              >
                Recolher
              </button>
            </div>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                    <th className="py-3 px-4 w-72">Estrutura Contábil / Conta</th>
                    <th className="py-3 px-3 text-right">Orçado (R$)</th>
                    <th className="py-3 px-3 text-right">Realizado (R$)</th>
                    <th className="py-3 px-3 text-right">Desvio R$</th>
                    <th className="py-3 px-3 text-right">Desvio %</th>
                    <th className="py-3 px-4 text-center w-36">Execução</th>
                    <th className="py-3 px-4 text-center w-28">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {filteredComparisonLines.map(line => {
                    const isHeader = line.isHeader;
                    const isSummary = line.isSummary;
                    const isExpanded = line.code ? expandedCodes[line.code] : true;

                    let rowBg = 'hover:bg-[var(--surface-elevated)]/60';
                    let fontStyle = 'text-[var(--text-primary)] font-normal';

                    if (isHeader) {
                      rowBg = 'bg-[var(--surface-elevated)] font-bold text-[var(--text-primary)] border-t border-b border-[var(--border-subtle)]';
                      fontStyle = 'font-bold text-[var(--text-primary)]';
                    } else if (isSummary) {
                      rowBg = 'bg-amber-500/10 font-bold text-amber-300 border-t-2 border-b-2 border-amber-500/30';
                      fontStyle = 'font-bold text-amber-300';
                    }

                    return (
                      <tr key={line.id} className={`${rowBg} transition-colors`}>
                        <td className="py-2.5 px-4 font-medium text-[var(--text-primary)]">
                          <div 
                            className="flex items-center space-x-2"
                            style={{ paddingLeft: `${Math.max(0, (line.level - 1) * 16)}px` }}
                          >
                            {isHeader && (
                              <button
                                onClick={() => line.code && toggleExpand(line.code)}
                                className="p-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded"
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <span className="font-mono text-xs text-amber-400 font-semibold">{line.code}</span>
                            <span className={fontStyle}>{line.name}</span>
                          </div>
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-primary)] text-xs sm:text-[13px]">
                          {formatBRL(line.plannedTotal)}
                        </td>

                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-primary)] text-xs sm:text-[13px]">
                          {formatBRL(line.realizedTotal)}
                        </td>

                        <td className={`py-2.5 px-3 text-right font-mono font-bold text-xs sm:text-[13px] ${
                          line.varianceNominal > 0 ? 'text-amber-400' : line.varianceNominal < 0 ? 'text-rose-400' : 'text-[var(--text-secondary)]'
                        }`}>
                          {line.varianceNominal > 0 ? '+' : ''}{formatBRL(line.varianceNominal)}
                        </td>

                        <td className={`py-2.5 px-3 text-right font-mono text-xs sm:text-[13px] ${
                          (line.variancePercent ?? 0) > 0 ? 'text-amber-400' : (line.variancePercent ?? 0) < 0 ? 'text-rose-400' : 'text-[var(--text-secondary)]'
                        }`}>
                          {(line.variancePercent ?? 0) > 0 ? '+' : ''}{(line.variancePercent ?? 0).toFixed(1)}%
                        </td>

                        <td className="py-2.5 px-4">
                          <div className="flex items-center space-x-2">
                            <div className="flex-1 bg-[var(--surface-elevated)] h-2 rounded-full overflow-hidden border border-[var(--border-subtle)]">
                              <div
                                className={`h-full rounded-full ${
                                  line.favorableStatus === 'FAVORAVEL' ? 'bg-amber-400' : line.favorableStatus === 'ALERTA' ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, line.executionRate ?? 0))}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-mono font-bold text-[var(--text-primary)] w-10 text-right">
                              {(line.executionRate ?? 0).toFixed(0)}%
                            </span>
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-center">
                          {line.favorableStatus === 'FAVORAVEL' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Favorável
                            </span>
                          ) : line.favorableStatus === 'ALERTA' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Atenção
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                              <XCircle className="w-3 h-3 mr-1" />
                              Crítico
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: HISTÓRICO DE VERSÕES & METAS APROVADAS (SOLICITADO) */}
      {/* ========================================================================= */}
      {activeTab === 'VERSIONS' && (
        <div className="space-y-4">
          <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)] flex items-center">
                <History className="w-4 h-4 mr-2 text-amber-400" />
                Histórico de Revisões e Metas Aprovadas ({selectedYear})
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Rastreamento completo das versões de metas orçamentárias salvas com detalhamento das linhas e colunas alteradas.
              </p>
            </div>

            <span className="text-xs font-semibold text-amber-400 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30">
              {versionsList.length} {versionsList.length === 1 ? 'versão registrada' : 'versões registradas'}
            </span>
          </div>

          {versionsList.length === 0 ? (
            <div className="bg-[var(--surface-card)] p-12 text-center rounded-2xl border border-[var(--border-subtle)] space-y-3">
              <History className="w-12 h-12 text-[var(--text-secondary)] mx-auto opacity-50" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Nenhuma revisão orçamentária arquivada ainda</h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                Quando você realizar simulações na aba "Elaboração & Simulação de Metas" e clicar em "Aprovar Novas Metas", cada versão aprovada será arquivada aqui com o histórico completo de quem aprovou, data e quais linhas e colunas foram modificadas.
              </p>
              <button
                onClick={() => setActiveTab('PLANNING')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-[#18181b] rounded-xl text-xs font-bold transition-all"
              >
                Ir para Simulação de Metas
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {versionsList.map(ver => (
                <div 
                  key={ver.id}
                  className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs space-y-4 hover:border-amber-500/40 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30">
                          {ver.versionNumber}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {new Date(ver.approvedAt).toLocaleDateString('pt-BR')} às {new Date(ver.approvedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[var(--text-primary)] mt-1">
                        Aprovado por: {ver.approvedBy}
                      </h3>
                    </div>

                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] text-amber-300 border border-[var(--border-subtle)]">
                      {ver.totalChanges} alterações
                    </span>
                  </div>

                  {ver.notes && (
                    <p className="text-xs text-[var(--text-secondary)] bg-[var(--surface-elevated)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                      "{ver.notes}"
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => setViewingVersion(ver)}
                      className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-amber-400 text-xs font-semibold rounded-xl border border-[var(--border-subtle)] transition-colors flex items-center"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" />
                      Ver Linhas e Colunas Alteradas
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm(`Deseja restaurar a versão "${ver.versionNumber}" como as metas oficiais ativas para ${ver.year}?`)) {
                          handleRestoreVersion(ver);
                        }
                      }}
                      className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 transition-colors flex items-center"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Restaurar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAIS AUXILIARES */}
      {/* ========================================================================= */}

      {/* 1. Modal de Simulação Rápida por Linha */}
      <BudgetRowSimulationModal
        isOpen={!!simulatingAccount}
        onClose={() => setSimulatingAccount(null)}
        account={simulatingAccount}
        currentMonthly={simulatingAccount ? getEditingPlannedArray(simulatingAccount.id) : []}
        originalMonthly={simulatingAccount ? getSavedPlannedArray(simulatingAccount.id) : []}
        onApply={handleApplyRowSimulation}
        year={selectedYear}
      />

      {/* 2. Modal de Aprovação de Novas Metas */}
      <BudgetApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        changes={changesList}
        year={selectedYear}
        onConfirmApproval={handleConfirmApproval}
        impactMetrics={{
          oldRevenue: simulationImpact.oldRevenue,
          newRevenue: simulationImpact.newRevenue,
          oldExpense: simulationImpact.oldExpense,
          newExpense: simulationImpact.newExpense,
          oldNetIncome: simulationImpact.oldNetIncome,
          newNetIncome: simulationImpact.newNetIncome
        }}
      />

      {/* 3. Modal de Visualização de Detalhes da Versão Histórica */}
      <BudgetVersionDetailsModal
        isOpen={!!viewingVersion}
        onClose={() => setViewingVersion(null)}
        version={viewingVersion}
        onRestoreVersion={handleRestoreVersion}
      />
    </div>
  );
};
