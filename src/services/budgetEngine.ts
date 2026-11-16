import { storage } from './storageService';
import { ReportingEngine } from './reportingEngine';
import { ChartAccount, AnnualBudgetPlan, OperationNature } from '../types';

export interface BudgetHierarchyLine {
  id: string;
  code: string;
  name: string;
  level: number;
  isHeader?: boolean;
  isSummary?: boolean;
  isAnalytical?: boolean;
  nature: OperationNature;
  plannedMonthly: number[];
  plannedTotal: number;
  realizedMonthly: number[];
  realizedTotal: number;
  varianceNominal: number; // Realized - Planned
  variancePercent: number; // % deviation
  executionRate: number; // Realized / Planned * 100
  favorableStatus: 'FAVORAVEL' | 'ATENCAO' | 'DESFAVORAVEL' | 'NEUTRO';
}

export interface BudgetSummaryKPIs {
  totalPlannedRevenue: number;
  totalRealizedRevenue: number;
  revenueExecutionRate: number;
  revenueVariance: number;

  totalPlannedCostsAndExpenses: number;
  totalRealizedCostsAndExpenses: number;
  costsExpensesExecutionRate: number;
  costsExpensesVariance: number;

  plannedNetIncome: number;
  realizedNetIncome: number;
  netIncomeVariance: number;
  netIncomeExecutionRate: number;

  overallBudgetAdherence: number;
  favorableAccountsCount: number;
  criticalAlertsCount: number;

  // Aliases for view compatibility
  totalRevenueRealized: number;
  totalRevenuePlanned: number;
  revenueVarianceNominal: number;

  totalExpensesRealized: number;
  totalExpensesPlanned: number;
  expensesExecutionRate: number;
  expensesVarianceNominal: number;

  netIncomeRealized: number;
  netIncomePlanned: number;
  netIncomeVarianceNominal: number;
}

export class BudgetEngine {
  /**
   * Generates full comparison between Budget Plan and Actual (DRE Realizado) for a specific year
   * Optionally filtered to a specific month (0 to 11) or full year
   */
  public static getBudgetComparison(year: number, selectedMonth?: number): {
    lines: BudgetHierarchyLine[];
    kpis: BudgetSummaryKPIs;
    plan: AnnualBudgetPlan;
  } {
    const plan = storage.getBudgetPlan(year);
    const dre = ReportingEngine.generateDRE(year);
    const accounts = storage.getChartAccounts();

    // Mapping of planned values by account ID
    const plannedMap = new Map<string, number[]>();
    for (const item of plan.items) {
      plannedMap.set(item.accountId, item.monthlyPlanned || new Array(12).fill(0));
    }

    // Helper to get planned array for an account
    const getPlanned = (accId: string): number[] => {
      return plannedMap.get(accId) || new Array(12).fill(0);
    };

    // Helper to sum monthly arrays
    const sumArrays = (arrs: number[][]): number[] => {
      const res = new Array(12).fill(0);
      for (const a of arrs) {
        if (!a) continue;
        for (let i = 0; i < 12; i++) {
          res[i] += a[i] || 0;
        }
      }
      return res;
    };

    const subtractArrays = (a: number[], b: number[]): number[] => {
      const res = new Array(12).fill(0);
      for (let i = 0; i < 12; i++) {
        res[i] = (a[i] || 0) - (b[i] || 0);
      }
      return res;
    };

    // Calculate sum of specific months if selectedMonth is specified, else all 12
    const calcTotal = (monthly: number[]): number => {
      if (selectedMonth !== undefined && selectedMonth >= 0 && selectedMonth < 12) {
        return monthly[selectedMonth] || 0;
      }
      return monthly.reduce((acc, v) => acc + v, 0);
    };

    // Determine status based on nature and execution
    const evaluateStatus = (
      isRevenue: boolean,
      plannedVal: number,
      realizedVal: number
    ): 'FAVORAVEL' | 'ATENCAO' | 'DESFAVORAVEL' | 'NEUTRO' => {
      if (plannedVal === 0 && realizedVal === 0) return 'NEUTRO';
      if (plannedVal === 0) return isRevenue ? 'FAVORAVEL' : 'DESFAVORAVEL';

      const rate = (realizedVal / plannedVal) * 100;
      if (isRevenue) {
        if (rate >= 98) return 'FAVORAVEL';
        if (rate >= 85) return 'ATENCAO';
        return 'DESFAVORAVEL';
      } else {
        // Costs / Expenses: lower is better
        if (rate <= 100) return 'FAVORAVEL';
        if (rate <= 106) return 'ATENCAO';
        return 'DESFAVORAVEL';
      }
    };

    // Build hierarchy matching the official DRE
    const lines: BudgetHierarchyLine[] = [];

    // 1. RECEITA BRUTA
    const revAccounts = accounts.filter(a => a.parentId === 'grp-1.1' && a.isAnalytical);
    const revChildLines: BudgetHierarchyLine[] = revAccounts.map(acc => {
      const pMonthly = getPlanned(acc.id);
      const dreLine = dre.lines.find(l => l.id === acc.id);
      const rMonthly = dreLine?.valuesByMonth || new Array(12).fill(0);
      const pTot = calcTotal(pMonthly);
      const rTot = calcTotal(rMonthly);
      const varNom = rTot - pTot;
      const varPct = pTot !== 0 ? (varNom / pTot) * 100 : 0;
      const execRate = pTot !== 0 ? (rTot / pTot) * 100 : (rTot > 0 ? 100 : 0);

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        level: 3,
        isAnalytical: true,
        nature: 'RECEITA_SERVICO',
        plannedMonthly: pMonthly,
        plannedTotal: pTot,
        realizedMonthly: rMonthly,
        realizedTotal: rTot,
        varianceNominal: varNom,
        variancePercent: varPct,
        executionRate: execRate,
        favorableStatus: evaluateStatus(true, pTot, rTot)
      };
    });

    const grossPlannedMonthly = sumArrays(revChildLines.map(l => l.plannedMonthly));
    const grossRealizedMonthly = sumArrays(revChildLines.map(l => l.realizedMonthly));
    const grossPTot = calcTotal(grossPlannedMonthly);
    const grossRTot = calcTotal(grossRealizedMonthly);
    const grossVar = grossRTot - grossPTot;

    lines.push({
      id: 'grp-1',
      code: '1',
      name: '1. RECEITA BRUTA DE SERVIÇOS',
      level: 1,
      isHeader: true,
      nature: 'RECEITA_SERVICO',
      plannedMonthly: grossPlannedMonthly,
      plannedTotal: grossPTot,
      realizedMonthly: grossRealizedMonthly,
      realizedTotal: grossRTot,
      varianceNominal: grossVar,
      variancePercent: grossPTot !== 0 ? (grossVar / grossPTot) * 100 : 0,
      executionRate: grossPTot !== 0 ? (grossRTot / grossPTot) * 100 : 0,
      favorableStatus: evaluateStatus(true, grossPTot, grossRTot)
    });

    lines.push(...revChildLines);

    // 2. DEDUÇÕES DA RECEITA
    const deducAccounts = accounts.filter(a => a.parentId === 'grp-1.2' && a.isAnalytical);
    const deducChildLines: BudgetHierarchyLine[] = deducAccounts.map(acc => {
      const pMonthly = getPlanned(acc.id);
      const dreLine = dre.lines.find(l => l.id === acc.id);
      const rMonthly = dreLine?.valuesByMonth || new Array(12).fill(0);
      const pTot = calcTotal(pMonthly);
      const rTot = calcTotal(rMonthly);
      const varNom = rTot - pTot;
      const varPct = pTot !== 0 ? (varNom / pTot) * 100 : 0;
      const execRate = pTot !== 0 ? (rTot / pTot) * 100 : 0;

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        level: 3,
        isAnalytical: true,
        nature: 'DEDUCAO_RECEITA',
        plannedMonthly: pMonthly,
        plannedTotal: pTot,
        realizedMonthly: rMonthly,
        realizedTotal: rTot,
        varianceNominal: varNom,
        variancePercent: varPct,
        executionRate: execRate,
        favorableStatus: evaluateStatus(false, pTot, rTot)
      };
    });

    const deducPlannedMonthly = sumArrays(deducChildLines.map(l => l.plannedMonthly));
    const deducRealizedMonthly = sumArrays(deducChildLines.map(l => l.realizedMonthly));
    const deducPTot = calcTotal(deducPlannedMonthly);
    const deducRTot = calcTotal(deducRealizedMonthly);
    const deducVar = deducRTot - deducPTot;

    lines.push({
      id: 'grp-2-deduc',
      code: '2',
      name: '2. (-) DEDUÇÕES E TRIBUTOS SOBRE SERVIÇOS',
      level: 1,
      isHeader: true,
      nature: 'DEDUCAO_RECEITA',
      plannedMonthly: deducPlannedMonthly,
      plannedTotal: deducPTot,
      realizedMonthly: deducRealizedMonthly,
      realizedTotal: deducRTot,
      varianceNominal: deducVar,
      variancePercent: deducPTot !== 0 ? (deducVar / deducPTot) * 100 : 0,
      executionRate: deducPTot !== 0 ? (deducRTot / deducPTot) * 100 : 0,
      favorableStatus: evaluateStatus(false, deducPTot, deducRTot)
    });

    lines.push(...deducChildLines);

    // (=) RECEITA LÍQUIDA
    const netRevPlannedMonthly = subtractArrays(grossPlannedMonthly, deducPlannedMonthly);
    const netRevRealizedMonthly = subtractArrays(grossRealizedMonthly, deducRealizedMonthly);
    const netRevPTot = calcTotal(netRevPlannedMonthly);
    const netRevRTot = calcTotal(netRevRealizedMonthly);
    const netRevVar = netRevRTot - netRevPTot;

    lines.push({
      id: 'sub-net-rev',
      code: '(=)',
      name: '(=) RECEITA OPERACIONAL LÍQUIDA',
      level: 1,
      isSummary: true,
      nature: 'RECEITA_SERVICO',
      plannedMonthly: netRevPlannedMonthly,
      plannedTotal: netRevPTot,
      realizedMonthly: netRevRealizedMonthly,
      realizedTotal: netRevRTot,
      varianceNominal: netRevVar,
      variancePercent: netRevPTot !== 0 ? (netRevVar / netRevPTot) * 100 : 0,
      executionRate: netRevPTot !== 0 ? (netRevRTot / netRevPTot) * 100 : 0,
      favorableStatus: evaluateStatus(true, netRevPTot, netRevRTot)
    });

    // 3. CUSTOS DOS SERVIÇOS
    const costAccounts = accounts.filter(a => a.parentId === 'grp-2.1' && a.isAnalytical);
    const costChildLines: BudgetHierarchyLine[] = costAccounts.map(acc => {
      const pMonthly = getPlanned(acc.id);
      const dreLine = dre.lines.find(l => l.id === acc.id);
      const rMonthly = dreLine?.valuesByMonth || new Array(12).fill(0);
      const pTot = calcTotal(pMonthly);
      const rTot = calcTotal(rMonthly);
      const varNom = rTot - pTot;
      const varPct = pTot !== 0 ? (varNom / pTot) * 100 : 0;
      const execRate = pTot !== 0 ? (rTot / pTot) * 100 : 0;

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        level: 3,
        isAnalytical: true,
        nature: 'CUSTO_SERVICO',
        plannedMonthly: pMonthly,
        plannedTotal: pTot,
        realizedMonthly: rMonthly,
        realizedTotal: rTot,
        varianceNominal: varNom,
        variancePercent: varPct,
        executionRate: execRate,
        favorableStatus: evaluateStatus(false, pTot, rTot)
      };
    });

    const costPlannedMonthly = sumArrays(costChildLines.map(l => l.plannedMonthly));
    const costRealizedMonthly = sumArrays(costChildLines.map(l => l.realizedMonthly));
    const costPTot = calcTotal(costPlannedMonthly);
    const costRTot = calcTotal(costRealizedMonthly);
    const costVar = costRTot - costPTot;

    lines.push({
      id: 'grp-3-costs',
      code: '3',
      name: '3. (-) CUSTOS DOS SERVIÇOS PRESTADOS (CSP)',
      level: 1,
      isHeader: true,
      nature: 'CUSTO_SERVICO',
      plannedMonthly: costPlannedMonthly,
      plannedTotal: costPTot,
      realizedMonthly: costRealizedMonthly,
      realizedTotal: costRTot,
      varianceNominal: costVar,
      variancePercent: costPTot !== 0 ? (costVar / costPTot) * 100 : 0,
      executionRate: costPTot !== 0 ? (costRTot / costPTot) * 100 : 0,
      favorableStatus: evaluateStatus(false, costPTot, costRTot)
    });

    lines.push(...costChildLines);

    // (=) LUCRO BRUTO
    const grossProfitPlannedMonthly = subtractArrays(netRevPlannedMonthly, costPlannedMonthly);
    const grossProfitRealizedMonthly = subtractArrays(netRevRealizedMonthly, costRealizedMonthly);
    const grossProfitPTot = calcTotal(grossProfitPlannedMonthly);
    const grossProfitRTot = calcTotal(grossProfitRealizedMonthly);
    const grossProfitVar = grossProfitRTot - grossProfitPTot;

    lines.push({
      id: 'sub-gross-profit',
      code: '(=)',
      name: '(=) RESULTADO OPERACIONAL BRUTO (LUCRO BRUTO)',
      level: 1,
      isSummary: true,
      nature: 'RECEITA_SERVICO',
      plannedMonthly: grossProfitPlannedMonthly,
      plannedTotal: grossProfitPTot,
      realizedMonthly: grossProfitRealizedMonthly,
      realizedTotal: grossProfitRTot,
      varianceNominal: grossProfitVar,
      variancePercent: grossProfitPTot !== 0 ? (grossProfitVar / grossProfitPTot) * 100 : 0,
      executionRate: grossProfitPTot !== 0 ? (grossProfitRTot / grossProfitPTot) * 100 : 0,
      favorableStatus: evaluateStatus(true, grossProfitPTot, grossProfitRTot)
    });

    // 4. DESPESAS OPERACIONAIS
    const opExpAccounts = accounts.filter(
      a => (a.parentId === 'grp-3.1' || a.parentId === 'grp-3.2' || a.parentId === 'grp-3.3' || a.parentId === 'grp-3.4') && a.isAnalytical
    );
    const opExpChildLines: BudgetHierarchyLine[] = opExpAccounts.map(acc => {
      const pMonthly = getPlanned(acc.id);
      const dreLine = dre.lines.find(l => l.id === acc.id);
      const rMonthly = dreLine?.valuesByMonth || new Array(12).fill(0);
      const pTot = calcTotal(pMonthly);
      const rTot = calcTotal(rMonthly);
      const varNom = rTot - pTot;
      const varPct = pTot !== 0 ? (varNom / pTot) * 100 : 0;
      const execRate = pTot !== 0 ? (rTot / pTot) * 100 : 0;

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        level: 3,
        isAnalytical: true,
        nature: 'DESPESA_OPERACIONAL',
        plannedMonthly: pMonthly,
        plannedTotal: pTot,
        realizedMonthly: rMonthly,
        realizedTotal: rTot,
        varianceNominal: varNom,
        variancePercent: varPct,
        executionRate: execRate,
        favorableStatus: evaluateStatus(false, pTot, rTot)
      };
    });

    const opExpPlannedMonthly = sumArrays(opExpChildLines.map(l => l.plannedMonthly));
    const opExpRealizedMonthly = sumArrays(opExpChildLines.map(l => l.realizedMonthly));
    const opExpPTot = calcTotal(opExpPlannedMonthly);
    const opExpRTot = calcTotal(opExpRealizedMonthly);
    const opExpVar = opExpRTot - opExpPTot;

    lines.push({
      id: 'grp-4-expenses',
      code: '4',
      name: '4. (-) DESPESAS OPERACIONAIS (ADM, PESSOAL, MKT)',
      level: 1,
      isHeader: true,
      nature: 'DESPESA_OPERACIONAL',
      plannedMonthly: opExpPlannedMonthly,
      plannedTotal: opExpPTot,
      realizedMonthly: opExpRealizedMonthly,
      realizedTotal: opExpRTot,
      varianceNominal: opExpVar,
      variancePercent: opExpPTot !== 0 ? (opExpVar / opExpPTot) * 100 : 0,
      executionRate: opExpPTot !== 0 ? (opExpRTot / opExpPTot) * 100 : 0,
      favorableStatus: evaluateStatus(false, opExpPTot, opExpRTot)
    });

    lines.push(...opExpChildLines);

    // (=) EBITDA
    const ebitdaPlannedMonthly = subtractArrays(grossProfitPlannedMonthly, opExpPlannedMonthly);
    const ebitdaRealizedMonthly = subtractArrays(grossProfitRealizedMonthly, opExpRealizedMonthly);
    const ebitdaPTot = calcTotal(ebitdaPlannedMonthly);
    const ebitdaRTot = calcTotal(ebitdaRealizedMonthly);
    const ebitdaVar = ebitdaRTot - ebitdaPTot;

    lines.push({
      id: 'sub-ebitda',
      code: '(=)',
      name: '(=) RESULTADO OPERACIONAL ANTES DO RESULTADO FINANCEIRO (EBITDA)',
      level: 1,
      isSummary: true,
      nature: 'RECEITA_SERVICO',
      plannedMonthly: ebitdaPlannedMonthly,
      plannedTotal: ebitdaPTot,
      realizedMonthly: ebitdaRealizedMonthly,
      realizedTotal: ebitdaRTot,
      varianceNominal: ebitdaVar,
      variancePercent: ebitdaPTot !== 0 ? (ebitdaVar / ebitdaPTot) * 100 : 0,
      executionRate: ebitdaPTot !== 0 ? (ebitdaRTot / ebitdaPTot) * 100 : 0,
      favorableStatus: evaluateStatus(true, ebitdaPTot, ebitdaRTot)
    });

    // 5. RESULTADO FINANCEIRO (Receitas Fin. vs Despesas Fin.)
    const finAccounts = accounts.filter(
      a => (a.parentId === 'grp-4.1' || a.parentId === 'grp-4.2') && a.isAnalytical
    );
    const finChildLines: BudgetHierarchyLine[] = finAccounts.map(acc => {
      const pMonthly = getPlanned(acc.id);
      const dreLine = dre.lines.find(l => l.id === acc.id);
      const rMonthly = dreLine?.valuesByMonth || new Array(12).fill(0);
      const pTot = calcTotal(pMonthly);
      const rTot = calcTotal(rMonthly);
      const isFinRevenue = acc.parentId === 'grp-4.1';
      const varNom = isFinRevenue ? rTot - pTot : rTot - pTot;
      const varPct = pTot !== 0 ? (varNom / pTot) * 100 : 0;
      const execRate = pTot !== 0 ? (rTot / pTot) * 100 : 0;

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        level: 3,
        isAnalytical: true,
        nature: isFinRevenue ? ('RECEITA_FINANCEIRA' as OperationNature) : ('DESPESA_FINANCEIRA' as OperationNature),
        plannedMonthly: pMonthly,
        plannedTotal: pTot,
        realizedMonthly: rMonthly,
        realizedTotal: rTot,
        varianceNominal: varNom,
        variancePercent: varPct,
        executionRate: execRate,
        favorableStatus: evaluateStatus(isFinRevenue, pTot, rTot)
      };
    });

    const finRevPlanned = sumArrays(finChildLines.filter(l => l.nature === 'RECEITA_FINANCEIRA').map(l => l.plannedMonthly));
    const finExpPlanned = sumArrays(finChildLines.filter(l => l.nature === 'DESPESA_FINANCEIRA').map(l => l.plannedMonthly));
    const netFinPlannedMonthly = subtractArrays(finRevPlanned, finExpPlanned);

    const finRevRealized = sumArrays(finChildLines.filter(l => l.nature === 'RECEITA_FINANCEIRA').map(l => l.realizedMonthly));
    const finExpRealized = sumArrays(finChildLines.filter(l => l.nature === 'DESPESA_FINANCEIRA').map(l => l.realizedMonthly));
    const netFinRealizedMonthly = subtractArrays(finRevRealized, finExpRealized);

    const netFinPTot = calcTotal(netFinPlannedMonthly);
    const netFinRTot = calcTotal(netFinRealizedMonthly);
    const netFinVar = netFinRTot - netFinPTot;

    lines.push({
      id: 'grp-5-fin',
      code: '5',
      name: '5. (+/-) RESULTADO FINANCEIRO LÍQUIDO',
      level: 1,
      isHeader: true,
      nature: 'OUTRA_RECEITA',
      plannedMonthly: netFinPlannedMonthly,
      plannedTotal: netFinPTot,
      realizedMonthly: netFinRealizedMonthly,
      realizedTotal: netFinRTot,
      varianceNominal: netFinVar,
      variancePercent: netFinPTot !== 0 ? (netFinVar / netFinPTot) * 100 : 0,
      executionRate: netFinPTot !== 0 ? (netFinRTot / netFinPTot) * 100 : 0,
      favorableStatus: evaluateStatus(true, netFinPTot, netFinRTot)
    });

    lines.push(...finChildLines);

    // (=) RESULTADO LÍQUIDO DO EXERCÍCIO
    const finalNetPlannedMonthly = sumArrays([ebitdaPlannedMonthly, netFinPlannedMonthly]);
    const finalNetRealizedMonthly = sumArrays([ebitdaRealizedMonthly, netFinRealizedMonthly]);
    const finalNetPTot = calcTotal(finalNetPlannedMonthly);
    const finalNetRTot = calcTotal(finalNetRealizedMonthly);
    const finalNetVar = finalNetRTot - finalNetPTot;

    lines.push({
      id: 'sub-final-net',
      code: '(=)',
      name: '(=) RESULTADO LÍQUIDO DO EXERCÍCIO (LUCRO LÍQUIDO)',
      level: 1,
      isSummary: true,
      nature: 'RECEITA_SERVICO',
      plannedMonthly: finalNetPlannedMonthly,
      plannedTotal: finalNetPTot,
      realizedMonthly: finalNetRealizedMonthly,
      realizedTotal: finalNetRTot,
      varianceNominal: finalNetVar,
      variancePercent: finalNetPTot !== 0 ? (finalNetVar / finalNetPTot) * 100 : 0,
      executionRate: finalNetPTot !== 0 ? (finalNetRTot / finalNetPTot) * 100 : 0,
      favorableStatus: evaluateStatus(true, finalNetPTot, finalNetRTot)
    });

    // Summary KPIs
    const totalPlannedRevenue = grossPTot;
    const totalRealizedRevenue = grossRTot;
    const revenueExecutionRate = totalPlannedRevenue !== 0 ? (totalRealizedRevenue / totalPlannedRevenue) * 100 : 0;
    const revenueVariance = totalRealizedRevenue - totalPlannedRevenue;

    const totalPlannedCostsAndExpenses = costPTot + opExpPTot + deducPTot;
    const totalRealizedCostsAndExpenses = costRTot + opExpRTot + deducRTot;
    const costsExpensesExecutionRate = totalPlannedCostsAndExpenses !== 0 
      ? (totalRealizedCostsAndExpenses / totalPlannedCostsAndExpenses) * 100 
      : 0;
    const costsExpensesVariance = totalRealizedCostsAndExpenses - totalPlannedCostsAndExpenses;

    const plannedNetIncome = finalNetPTot;
    const realizedNetIncome = finalNetRTot;
    const netIncomeVariance = realizedNetIncome - plannedNetIncome;
    const netIncomeExecutionRate = plannedNetIncome !== 0 ? (realizedNetIncome / plannedNetIncome) * 100 : 0;

    const analyticalLines = lines.filter(l => l.isAnalytical);
    const favorableAccountsCount = analyticalLines.filter(l => l.favorableStatus === 'FAVORAVEL').length;
    const criticalAlertsCount = analyticalLines.filter(l => l.favorableStatus === 'DESFAVORAVEL').length;

    const revAdherence = totalPlannedRevenue > 0 
      ? Math.min(100, (totalRealizedRevenue / totalPlannedRevenue) * 100) 
      : 100;
    const expAdherence = totalPlannedCostsAndExpenses > 0 
      ? Math.max(0, 100 - Math.max(0, ((totalRealizedCostsAndExpenses - totalPlannedCostsAndExpenses) / totalPlannedCostsAndExpenses) * 100)) 
      : 100;
    const overallBudgetAdherence = totalPlannedRevenue > 0 || totalPlannedCostsAndExpenses > 0
      ? (revAdherence + expAdherence) / 2
      : 100;

    const kpis: BudgetSummaryKPIs = {
      totalPlannedRevenue,
      totalRealizedRevenue,
      revenueExecutionRate,
      revenueVariance,
      totalPlannedCostsAndExpenses,
      totalRealizedCostsAndExpenses,
      costsExpensesExecutionRate,
      costsExpensesVariance,
      plannedNetIncome,
      realizedNetIncome,
      netIncomeVariance,
      netIncomeExecutionRate,

      overallBudgetAdherence,
      favorableAccountsCount,
      criticalAlertsCount,

      totalRevenueRealized: totalRealizedRevenue,
      totalRevenuePlanned: totalPlannedRevenue,
      revenueVarianceNominal: revenueVariance,

      totalExpensesRealized: totalRealizedCostsAndExpenses,
      totalExpensesPlanned: totalPlannedCostsAndExpenses,
      expensesExecutionRate: costsExpensesExecutionRate,
      expensesVarianceNominal: costsExpensesVariance,

      netIncomeRealized: realizedNetIncome,
      netIncomePlanned: plannedNetIncome,
      netIncomeVarianceNominal: netIncomeVariance
    };

    return { lines, kpis, plan };
  }

  /**
   * Replicates a given month's value across all remaining months for a specific account
   */
  public static replicateMonthValue(
    plan: AnnualBudgetPlan,
    accountId: string,
    sourceMonth: number
  ): AnnualBudgetPlan {
    const item = plan.items.find(i => i.accountId === accountId);
    if (!item) return plan;

    const sourceVal = item.monthlyPlanned[sourceMonth] || 0;
    const newMonthly = new Array(12).fill(sourceVal);

    const updatedItems = plan.items.map(i => 
      i.accountId === accountId ? { ...i, monthlyPlanned: newMonthly } : i
    );

    return {
      ...plan,
      items: updatedItems,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Adjusts all monthly values for an account or whole plan by a percentage (e.g. +5% or -10%)
   */
  public static applyPercentageAdjustment(
    plan: AnnualBudgetPlan,
    percentAdjustment: number,
    accountId?: string
  ): AnnualBudgetPlan {
    const factor = 1 + percentAdjustment / 100;

    const updatedItems = plan.items.map(i => {
      if (accountId && i.accountId !== accountId) return i;
      const newMonthly = i.monthlyPlanned.map(val => Math.round(val * factor));
      return { ...i, monthlyPlanned: newMonthly };
    });

    return {
      ...plan,
      items: updatedItems,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Applies progressive month-over-month growth or reduction (e.g. +5% or -10% month by month)
   */
  public static applyMonthByMonthVariation(
    plan: AnnualBudgetPlan,
    accountId: string,
    monthlyVariationPct: number,
    startMonth: number = 0
  ): AnnualBudgetPlan {
    const item = plan.items.find(i => i.accountId === accountId);
    if (!item) return plan;

    const newMonthly = [...item.monthlyPlanned];
    const initialBase = newMonthly[startMonth] || 0;
    const factor = 1 + monthlyVariationPct / 100;

    let runningVal = initialBase;
    for (let m = startMonth + 1; m < 12; m++) {
      runningVal = Math.round(runningVal * factor);
      newMonthly[m] = runningVal;
    }

    const updatedItems = plan.items.map(i =>
      i.accountId === accountId ? { ...i, monthlyPlanned: newMonthly } : i
    );

    return {
      ...plan,
      items: updatedItems,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Sets a constant monthly value across all 12 months for an account
   */
  public static setConstantMonthlyValue(
    plan: AnnualBudgetPlan,
    accountId: string,
    constantAmount: number
  ): AnnualBudgetPlan {
    const newMonthly = new Array(12).fill(constantAmount);
    const existingIndex = plan.items.findIndex(i => i.accountId === accountId);
    let updatedItems: AnnualBudgetPlan['items'];

    if (existingIndex >= 0) {
      updatedItems = plan.items.map(i =>
        i.accountId === accountId ? { ...i, monthlyPlanned: newMonthly } : i
      );
    } else {
      updatedItems = [...plan.items, { accountId, monthlyPlanned: newMonthly }];
    }

    return {
      ...plan,
      items: updatedItems,
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Generates a new plan prepopulated from the realized values of that year or previous year
   */
  public static createFromRealized(year: number): AnnualBudgetPlan {
    const dre = ReportingEngine.generateDRE(year);
    const accounts = storage.getChartAccounts().filter(a => a.isAnalytical);

    const items = accounts.map(acc => {
      const line = dre.lines.find(l => l.id === acc.id);
      return {
        accountId: acc.id,
        monthlyPlanned: line?.valuesByMonth ? [...line.valuesByMonth] : new Array(12).fill(0)
      };
    });

    return {
      id: `budget-${year}`,
      year,
      name: `Orçamento ${year} (Base Realizado)`,
      updatedAt: new Date().toISOString(),
      notes: `Orçamento gerado automaticamente com base nos lançamentos contábeis realizados em ${year}.`,
      items
    };
  }
}
