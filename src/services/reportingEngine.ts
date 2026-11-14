import { ChartAccount, FinancialTitle, FinancialMovement } from '../types';
import { storage } from './storageService';
import { FinancialEngine } from './financialEngine';

export type DRERegime = 'COMPETENCIA' | 'CAIXA' | 'COMPARATIVO';

export interface DRELineItem {
  id: string;
  name: string;
  code?: string;
  type?: 'RECEITA' | 'DEDUCAO' | 'CUSTO' | 'DESPESA' | 'RESULTADO' | 'SUBTOTAL';
  isHeader?: boolean;
  isSummary?: boolean;
  level: number; // 0 for major group, 1 for subgroup, 2 for account
  groupId?: string; // Identifier of top group (e.g. 'h-1', 'h-2', 'h-3', 'h-4', 'h-5', 'h-6')
  parentHeaderId?: string; // Direct parent header id (e.g. 'h-4' or 'h-4.1')
  valuesByMonth: number[]; // 12 months: index 0 = Jan, ..., index 11 = Dec (regime ativo ou competência)
  totalYear: number;
  compValuesByMonth?: number[]; // Valores puros de competência
  compTotalYear?: number;
  // Campos comparativos e regime de caixa
  cashValuesByMonth?: number[]; // Realizado financeiramente por caixa nos 12 meses
  cashTotalYear?: number;
  gapValuesByMonth?: number[]; // Variação mês a mês (Competência - Caixa)
  gapTotalYear?: number;
  realizationRates?: number[]; // Taxa % de realização financeira nos 12 meses
  totalRealizationRate?: number; // Taxa % anual de realização
  matchedTitleIds?: string[];
  titles?: FinancialTitle[];
}

export type DREMatrix = {
  months: string[];
  lines: DRELineItem[];
  netResults: number[];
  totalNetResult: number;
  regime?: DRERegime;
  cashNetResults?: number[];
  totalCashNetResult?: number;
};

export interface CashFlowLineItem {
  id: string;
  name: string;
  code?: string;
  type?: 'ENTRADA' | 'SAIDA' | 'SALDO';
  isHeader?: boolean;
  isSummary?: boolean;
  level: number;
  valuesByMonth: number[];
  totalYear: number;
  activityCategory?: 'OPERACIONAL' | 'INVESTIMENTO' | 'FINANCIAMENTO' | 'TOTAL' | 'SALDO';
}

export type CashFlowMatrix = {
  months: string[];
  lines: CashFlowLineItem[];
  openingBalances: number[];
  netMovements: number[];
  closingBalances: number[];
};

export class ReportingEngine {
  /**
   * GENERATE DRE GERENCIAL MULTI-REGIME (COMPETÊNCIA, CAIXA OU COMPARATIVO)
   * Apura os 12 meses do ano e total anual sob regime de competência econômica ou efetivação financeira em caixa.
   */
  public static generateDRE(
    year: number,
    regime: DRERegime = 'COMPETENCIA'
  ): DREMatrix {
    const titles = storage.getTitles().filter(t => t.documentState !== 'CANCELADO');
    const accounts = storage.getChartAccounts();
    const allSettlements = storage.getSettlements().filter(s => !s.isReversed);
    const allMovements = storage.getMovements().filter(m => !m.isReversed);

    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const allSales = storage.getSales().filter(s => s.status !== 'CANCELADA');

    // Índices montados uma vez (antes, cada conta × mês varria a lista inteira de títulos e de vendas)
    const titleById = new Map<string, FinancialTitle>();
    const titleIdSet = new Set<string>();
    const titleSaleIdSet = new Set<string>();
    const contractCompSet = new Set<string>();
    titles.forEach(t => {
      titleById.set(t.id, t);
      titleIdSet.add(t.id);
      if (t.saleId) titleSaleIdSet.add(t.saleId);
      const c = t.competence?.substring(0, 7);
      if (c) {
        if (t.originId) contractCompSet.add(`${t.originId}|${c}`);
        if (t.contractId) contractCompSet.add(`${t.contractId}|${c}`);
      }
    });
    const hasLinkedTitles = (sale: any, compStr: string): boolean =>
      titleSaleIdSet.has(sale.id) ||
      Boolean(sale.titleIds && sale.titleIds.some((id: string) => titleIdSet.has(id))) ||
      Boolean(sale.contractId && contractCompSet.has(`${sale.contractId}|${compStr}`));
    const salesByComp = new Map<string, any[]>();
    allSales.forEach(sale => {
      const k = (sale.competence || sale.date || '').substring(0, 7);
      const list = salesByComp.get(k) || [];
      list.push(sale);
      salesByComp.set(k, list);
    });
    const accountById = new Map(accounts.map(a => [a.id, a]));
    const settlementsByTitle = new Map<string, typeof allSettlements>();
    allSettlements.forEach(st => {
      const list = settlementsByTitle.get(st.titleId) || [];
      list.push(st);
      settlementsByTitle.set(st.titleId, list);
    });

    // Helper para apurar competência e caixa de cada conta analítica
    const getValuesForAccount = (accId: string): {
      monthlyComp: number[];
      totalComp: number;
      monthlyCash: number[];
      totalCash: number;
      titleIds: string[];
    } => {
      const monthlyComp = new Array(12).fill(0);
      const monthlyCash = new Array(12).fill(0);
      const titleIds: string[] = [];

      const targetAcc = accountById.get(accId);
      const isExpenseNature = Boolean(targetAcc && (
        targetAcc.nature?.includes('DESPESA') || 
        targetAcc.nature?.includes('CUSTO') || 
        targetAcc.code?.startsWith('2') || 
        targetAcc.code?.startsWith('3') || 
        targetAcc.code?.startsWith('4')
      ));

      const isTargetAccount = (title: FinancialTitle): boolean => {
        const tAccId = title.accountId || (title as any).chartAccountId;
        if (tAccId === accId) return true;
        // Compatibilidade com títulos a receber legados ou sem conta apontando para acc-1.1.01
        if (accId === 'acc-1.1.01' && title.type === 'RECEBER' && (!tAccId || tAccId === 'acc-rec-01' || tAccId === 'acc-srv-1')) {
          return true;
        }
        return false;
      };

      // Só os títulos desta conta (filtrados uma vez, não a cada mês)
      const accTitles = titles.filter(isTargetAccount);

      // 1. Competência (conforme competence YYYY-MM ou corte de mês)
      for (let m = 0; m < 12; m++) {
        const compStr = `${year}-${(m + 1).toString().padStart(2, '0')}`;
        const matchingTitles = accTitles.filter(t => {
          const tComp = (t.competence ? t.competence.substring(0, 7) : (t.dueDate ? t.dueDate.substring(0, 7) : ''));
          return tComp === compStr;
        });

        for (const title of matchingTitles) {
          if (!titleIds.includes(title.id)) titleIds.push(title.id);
          const sign = (isExpenseNature && title.type === 'RECEBER') ? -1 : 1;
          monthlyComp[m] += (title.originalAmount || 0) * sign;
        }

        // Conciliação de Vendas Confirmadas da competência:
        // Se uma venda confirmada existir para o mês, mas não tiver títulos no array de títulos somados, computar o faturamento
        for (const sale of (salesByComp.get(compStr) || [])) {
          // Se nenhum título da venda estiver registrado em titles, computar pelos itens da venda
          if (!hasLinkedTitles(sale, compStr)) {
            const saleItems = sale.items && sale.items.length > 0 ? sale.items : [
              {
                id: `item-${sale.id}`,
                unitPrice: sale.netTotal || sale.grossTotal || 0,
                total: sale.netTotal || sale.grossTotal || 0,
                accountId: accId
              }
            ];

            for (const item of saleItems) {
              const itemAccId = item.accountId || 'acc-1.1.01';
              const matchesThisAcc = itemAccId === accId || (accId === 'acc-1.1.01' && (!itemAccId || itemAccId === 'acc-rec-01'));
              if (matchesThisAcc) {
                monthlyComp[m] += item.total || item.unitPrice || 0;
              }
            }
          }
        }

        // Computa encargos e deduções financeiras apuradas nas baixas para Competência
        if (accId === 'acc-4.2.04') { // Tarifas Bancárias
          for (const s of allSettlements) {
            if (s.settlementDate?.startsWith(compStr) && (s.components?.bankFee || 0) > 0) {
              monthlyComp[m] += s.components.bankFee;
            }
          }
        } else if (accId === 'acc-4.2.03') { // Descontos Financeiros Concedidos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'RECEBER' && s.settlementDate?.startsWith(compStr) && (s.components?.discount || 0) > 0) {
              monthlyComp[m] += s.components.discount;
            }
          }
        } else if (accId === 'acc-4.1.03') { // Descontos Financeiros Obtidos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'PAGAR' && s.settlementDate?.startsWith(compStr) && (s.components?.discount || 0) > 0) {
              monthlyComp[m] += s.components.discount;
            }
          }
        } else if (accId === 'acc-4.2.01') { // Juros Pagos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'PAGAR' && s.settlementDate?.startsWith(compStr) && (s.components?.interest || 0) > 0) {
              monthlyComp[m] += s.components.interest;
            }
          }
        } else if (accId === 'acc-4.1.01') { // Juros Recebidos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'RECEBER' && s.settlementDate?.startsWith(compStr) && (s.components?.interest || 0) > 0) {
              monthlyComp[m] += s.components.interest;
            }
          }
        } else if (accId === 'acc-4.2.02') { // Multas Pagas
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'PAGAR' && s.settlementDate?.startsWith(compStr) && (s.components?.fine || 0) > 0) {
              monthlyComp[m] += s.components.fine;
            }
          }
        } else if (accId === 'acc-4.1.02') { // Multas Recebidas
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'RECEBER' && s.settlementDate?.startsWith(compStr) && (s.components?.fine || 0) > 0) {
              monthlyComp[m] += s.components.fine;
            }
          }
        }

        monthlyComp[m] = Math.round(monthlyComp[m] * 100) / 100;
      }

      // 2. Caixa (conforme quitações financeiras efetivadas no mês do ano)
      for (let m = 0; m < 12; m++) {
        const monthStr = `${year}-${(m + 1).toString().padStart(2, '0')}`;

        for (const title of accTitles) {
          let monthSettled = 0;
          const matchingSettlements = settlementsByTitle.get(title.id) || [];

          if (matchingSettlements.length > 0) {
            for (const s of matchingSettlements) {
              const sDate = s.settlementDate || '';
              if (sDate.startsWith(monthStr)) {
                monthSettled += s.components?.principalSettled || s.components?.netFinancialAmount || 0;
                if (!titleIds.includes(title.id)) titleIds.push(title.id);
              }
            }
          } else {
            const payDate = (title as any).actualPaymentDate || (title as any).paymentDate || '';
            if (payDate && payDate.startsWith(monthStr) && (title.settledPrincipal || 0) > 0) {
              monthSettled += title.settledPrincipal;
              if (!titleIds.includes(title.id)) titleIds.push(title.id);
            } else if (!payDate && title.settlementState === 'LIQUIDADO' && (title.dueDate || '').startsWith(monthStr)) {
              monthSettled += title.settledPrincipal || title.originalAmount || 0;
              if (!titleIds.includes(title.id)) titleIds.push(title.id);
            }
          }

          const sign = (isExpenseNature && title.type === 'RECEBER') ? -1 : 1;
          monthlyCash[m] += monthSettled * sign;

          // Saldo em aberto com previsão de pagamento / vencimento no mês selecionado
          // Regra de Caixa Gerencial: "o que for de caixa é o que tem o pagamento nesse mês, tanto o que foi feito quanto o que está em aberto, você tem que somar os dois"
          const isDueDateInMonth = (title.dueDate || '').startsWith(monthStr);
          if (isDueDateInMonth) {
            const openBalance = typeof title.balancePrincipal === 'number'
              ? title.balancePrincipal
              : Math.max(0, (title.originalAmount || 0) - (title.settledPrincipal || 0));

            if (openBalance > 0.001) {
              monthlyCash[m] += openBalance * sign;
              if (!titleIds.includes(title.id)) titleIds.push(title.id);
            }
          }
        }

        // Computa encargos e deduções financeiras apuradas nas baixas para Caixa
        if (accId === 'acc-4.2.04') { // Tarifas Bancárias
          for (const s of allSettlements) {
            if (s.settlementDate?.startsWith(monthStr) && (s.components?.bankFee || 0) > 0) {
              monthlyCash[m] += s.components.bankFee;
            }
          }
        } else if (accId === 'acc-4.2.03') { // Descontos Financeiros Concedidos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'RECEBER' && s.settlementDate?.startsWith(monthStr) && (s.components?.discount || 0) > 0) {
              monthlyCash[m] += s.components.discount;
            }
          }
        } else if (accId === 'acc-4.1.03') { // Descontos Financeiros Obtidos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'PAGAR' && s.settlementDate?.startsWith(monthStr) && (s.components?.discount || 0) > 0) {
              monthlyCash[m] += s.components.discount;
            }
          }
        } else if (accId === 'acc-4.2.01') { // Juros Pagos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'PAGAR' && s.settlementDate?.startsWith(monthStr) && (s.components?.interest || 0) > 0) {
              monthlyCash[m] += s.components.interest;
            }
          }
        } else if (accId === 'acc-4.1.01') { // Juros Recebidos
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'RECEBER' && s.settlementDate?.startsWith(monthStr) && (s.components?.interest || 0) > 0) {
              monthlyCash[m] += s.components.interest;
            }
          }
        } else if (accId === 'acc-4.2.02') { // Multas Pagas
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'PAGAR' && s.settlementDate?.startsWith(monthStr) && (s.components?.fine || 0) > 0) {
              monthlyCash[m] += s.components.fine;
            }
          }
        } else if (accId === 'acc-4.1.02') { // Multas Recebidas
          for (const s of allSettlements) {
            const title = titleById.get(s.titleId);
            if (title?.type === 'RECEBER' && s.settlementDate?.startsWith(monthStr) && (s.components?.fine || 0) > 0) {
              monthlyCash[m] += s.components.fine;
            }
          }
        }

        // Movimentações financeiras avulsas diretas do extrato/caixa (exclui baixas de títulos já computadas acima)
        for (const mov of allMovements) {
          if (!mov.date || !mov.date.startsWith(monthStr)) continue;
          // Ignora movimentações decorrentes de baixa de título/quitação para evitar duplicidade de caixa
          if (mov.originType === 'BAIXA_TITULO' || (mov.originReferenceId && mov.originReferenceId.startsWith('set-'))) {
            continue;
          }
          const matchesMovementAcc = (mov as any).accountId === accId || 
            (accId === 'acc-4.2.04' && mov.originType === 'OPERACAO_DIRETA' && mov.description?.toLowerCase().includes('tarifa'));
          if (matchesMovementAcc) {
            monthlyCash[m] += mov.amount || 0;
          }
        }

        monthlyCash[m] = Math.round(monthlyCash[m] * 100) / 100;
      }

      const totalComp = Math.round(monthlyComp.reduce((a, b) => a + b, 0) * 100) / 100;
      const totalCash = Math.round(monthlyCash.reduce((a, b) => a + b, 0) * 100) / 100;

      return { monthlyComp, totalComp, monthlyCash, totalCash, titleIds };
    };

    const sumArrays = (arrays: number[][]): number[] => {
      const result = new Array(12).fill(0);
      for (const arr of arrays) {
        for (let i = 0; i < 12; i++) {
          result[i] += arr[i] || 0;
        }
      }
      return result.map(v => Math.round(v * 100) / 100);
    };

    const subtractArrays = (arr1: number[], arr2: number[]): number[] => {
      return arr1.map((v, i) => Math.round((v - (arr2[i] || 0)) * 100) / 100);
    };

    // Helper construtor de linha DRE com preenchimento completo de métricas comparativas
    const createDRELine = (
      id: string,
      name: string,
      code: string | undefined,
      level: number,
      groupId: string,
      parentHeaderId: string | undefined,
      compValues: number[],
      compTotal: number,
      cashValues: number[],
      cashTotal: number,
      titleIds?: string[],
      isHeader = false,
      isSummary = false
    ): DRELineItem => {
      const activeValues = regime === 'CAIXA' ? cashValues : compValues;
      const activeTotal = regime === 'CAIXA' ? cashTotal : compTotal;

      const gapValues = compValues.map((c, i) => Math.round((c - (cashValues[i] || 0)) * 100) / 100);
      const gapTotal = Math.round((compTotal - cashTotal) * 100) / 100;

      const realizationRates = compValues.map((c, i) => {
        const cashVal = cashValues[i] || 0;
        if (c <= 0 && cashVal <= 0) return 100;
        if (c <= 0 && cashVal > 0) return 100;
        return Math.round(Math.min((cashVal / c) * 100, 999) * 10) / 10;
      });

      const totalRealizationRate = compTotal > 0
        ? Math.round(Math.min((cashTotal / compTotal) * 100, 999) * 10) / 10
        : 100;

      return {
        id,
        name,
        code,
        level,
        groupId,
        parentHeaderId,
        isHeader,
        isSummary,
        valuesByMonth: activeValues,
        totalYear: activeTotal,
        compValuesByMonth: compValues,
        compTotalYear: compTotal,
        cashValuesByMonth: cashValues,
        cashTotalYear: cashTotal,
        gapValuesByMonth: gapValues,
        gapTotalYear: gapTotal,
        realizationRates,
        totalRealizationRate,
        matchedTitleIds: titleIds
      };
    };

    // 1. Receita Bruta de Serviços (grp-1.1 ou nature/código correspondente)
    const grossRevenueAccs = accounts.filter(a => 
      (a.parentId === 'grp-1.1' || a.nature === 'RECEITA_SERVICO' || (a.code && a.code.startsWith('1.1'))) && 
      a.isAnalytical
    );
    const grossRevLines: DRELineItem[] = grossRevenueAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-1', 'h-1', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const grossRevCompValues = sumArrays(grossRevLines.map(l => l.compValuesByMonth || []));
    const grossRevCompTotal = Math.round(grossRevLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const grossRevCashValues = sumArrays(grossRevLines.map(l => l.cashValuesByMonth || []));
    const grossRevCashTotal = Math.round(grossRevLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // 2. Deduções da Receita (grp-1.2)
    const deducAccs = accounts.filter(a => 
      (a.parentId === 'grp-1.2' || a.nature === 'DEDUCAO_RECEITA' || (a.code && a.code.startsWith('1.2'))) && 
      a.isAnalytical
    );
    const deducLines: DRELineItem[] = deducAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-2', 'h-2', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const deducCompValues = sumArrays(deducLines.map(l => l.compValuesByMonth || []));
    const deducCompTotal = Math.round(deducLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const deducCashValues = sumArrays(deducLines.map(l => l.cashValuesByMonth || []));
    const deducCashTotal = Math.round(deducLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // (=) Receita Líquida
    const netRevCompValues = subtractArrays(grossRevCompValues, deducCompValues);
    const netRevCompTotal = Math.round((grossRevCompTotal - deducCompTotal) * 100) / 100;
    const netRevCashValues = subtractArrays(grossRevCashValues, deducCashValues);
    const netRevCashTotal = Math.round((grossRevCashTotal - deducCashTotal) * 100) / 100;

    // 3. Custos dos Serviços Prestados (grp-2 ou grp-2.1)
    const costAccs = accounts.filter(a => 
      (a.parentId === 'grp-2.1' || a.parentId === 'grp-2' || a.nature === 'CUSTO_SERVICO' || (a.code && a.code.startsWith('2'))) && 
      a.isAnalytical
    );
    const costLines: DRELineItem[] = costAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-3', 'h-3', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const costCompValues = sumArrays(costLines.map(l => l.compValuesByMonth || []));
    const costCompTotal = Math.round(costLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const costCashValues = sumArrays(costLines.map(l => l.cashValuesByMonth || []));
    const costCashTotal = Math.round(costLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // (=) Lucro Bruto
    const grossProfitCompValues = subtractArrays(netRevCompValues, costCompValues);
    const grossProfitCompTotal = Math.round((netRevCompTotal - costCompTotal) * 100) / 100;
    const grossProfitCashValues = subtractArrays(netRevCashValues, costCashValues);
    const grossProfitCashTotal = Math.round((netRevCashTotal - costCashTotal) * 100) / 100;

    // 4. Despesas Operacionais
    // 4.1 Despesas com Pessoal (grp-3.1)
    const personalAccs = accounts.filter(a => 
      (a.parentId === 'grp-3.1' || a.nature === 'DESPESA_PESSOAL' || (a.code && a.code.startsWith('3.1'))) && 
      a.isAnalytical
    );
    const personalLines: DRELineItem[] = personalAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-4', 'h-4.1', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const personalCompValues = sumArrays(personalLines.map(l => l.compValuesByMonth || []));
    const personalCompTotal = Math.round(personalLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const personalCashValues = sumArrays(personalLines.map(l => l.cashValuesByMonth || []));
    const personalCashTotal = Math.round(personalLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // 4.2 Despesas Administrativas (grp-3.2)
    const adminAccs = accounts.filter(a => 
      (a.parentId === 'grp-3.2' || a.nature === 'DESPESA_ADMINISTRATIVA' || (a.code && a.code.startsWith('3.2'))) && 
      a.isAnalytical
    );
    const adminLines: DRELineItem[] = adminAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-4', 'h-4.2', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const adminCompValues = sumArrays(adminLines.map(l => l.compValuesByMonth || []));
    const adminCompTotal = Math.round(adminLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const adminCashValues = sumArrays(adminLines.map(l => l.cashValuesByMonth || []));
    const adminCashTotal = Math.round(adminLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // 4.3 Despesas Comerciais (grp-3.3)
    const commAccs = accounts.filter(a => 
      (a.parentId === 'grp-3.3' || a.nature === 'DESPESA_COMERCIAL' || (a.code && a.code.startsWith('3.3'))) && 
      a.isAnalytical
    );
    const commLines: DRELineItem[] = commAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-4', 'h-4.3', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const commCompValues = sumArrays(commLines.map(l => l.compValuesByMonth || []));
    const commCompTotal = Math.round(commLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const commCashValues = sumArrays(commLines.map(l => l.cashValuesByMonth || []));
    const commCashTotal = Math.round(commLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // 4.4 Despesas Gerais Operacionais (grp-3.4 / DESPESA_OPERACIONAL / DESPESAS_GERAIS / 3.4)
    const generalAccs = accounts.filter(a => 
      (a.parentId === 'grp-3.4' || a.nature === 'DESPESA_OPERACIONAL' || (a.code && a.code.startsWith('3.4')) || a.dremap?.line === 'DESPESAS_GERAIS') && 
      a.isAnalytical
    );
    const generalLines: DRELineItem[] = generalAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-4', 'h-4.4', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const generalCompValues = sumArrays(generalLines.map(l => l.compValuesByMonth || []));
    const generalCompTotal = Math.round(generalLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const generalCashValues = sumArrays(generalLines.map(l => l.cashValuesByMonth || []));
    const generalCashTotal = Math.round(generalLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // Total Despesas Operacionais (Pessoal + Administrativas + Comerciais + Gerais)
    const opExpCompValues = sumArrays([personalCompValues, adminCompValues, commCompValues, generalCompValues]);
    const opExpCompTotal = Math.round((personalCompTotal + adminCompTotal + commCompTotal + generalCompTotal) * 100) / 100;
    const opExpCashValues = sumArrays([personalCashValues, adminCashValues, commCashValues, generalCashValues]);
    const opExpCashTotal = Math.round((personalCashTotal + adminCashTotal + commCashTotal + generalCashTotal) * 100) / 100;

    // (=) Resultado Operacional (EBITDA/LAJIR)
    const opResultCompValues = subtractArrays(grossProfitCompValues, opExpCompValues);
    const opResultCompTotal = Math.round((grossProfitCompTotal - opExpCompTotal) * 100) / 100;
    const opResultCashValues = subtractArrays(grossProfitCashValues, opExpCashValues);
    const opResultCashTotal = Math.round((grossProfitCashTotal - opExpCashTotal) * 100) / 100;

    // 5. Resultado Financeiro
    const finRevAccs = accounts.filter(a => 
      (a.parentId === 'grp-4.1' || a.nature === 'RECEITA_FINANCEIRA' || (a.code && a.code.startsWith('4.1'))) && 
      a.isAnalytical
    );
    const finRevLines = finRevAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-5', 'h-5.1', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const finRevCompValues = sumArrays(finRevLines.map(l => l.compValuesByMonth || []));
    const finRevCompTotal = Math.round(finRevLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const finRevCashValues = sumArrays(finRevLines.map(l => l.cashValuesByMonth || []));
    const finRevCashTotal = Math.round(finRevLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    const finExpAccs = accounts.filter(a => 
      (a.parentId === 'grp-4.2' || a.nature === 'DESPESA_FINANCEIRA' || (a.code && a.code.startsWith('4.2'))) && 
      a.isAnalytical
    );
    const finExpLines = finExpAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-5', 'h-5.2', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const finExpCompValues = sumArrays(finExpLines.map(l => l.compValuesByMonth || []));
    const finExpCompTotal = Math.round(finExpLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const finExpCashValues = sumArrays(finExpLines.map(l => l.cashValuesByMonth || []));
    const finExpCashTotal = Math.round(finExpLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    const netFinCompValues = subtractArrays(finRevCompValues, finExpCompValues);
    const netFinCompTotal = Math.round((finRevCompTotal - finExpCompTotal) * 100) / 100;
    const netFinCashValues = subtractArrays(finRevCashValues, finExpCashValues);
    const netFinCashTotal = Math.round((finRevCashTotal - finExpCashTotal) * 100) / 100;

    // (=) Resultado Antes dos Tributos (LAIR)
    const resultBeforeTaxesComp = opResultCompValues.map((v, i) => Math.round((v + netFinCompValues[i]) * 100) / 100);
    const resultBeforeTaxesCompTotal = Math.round((opResultCompTotal + netFinCompTotal) * 100) / 100;
    const resultBeforeTaxesCash = opResultCashValues.map((v, i) => Math.round((v + netFinCashValues[i]) * 100) / 100);
    const resultBeforeTaxesCashTotal = Math.round((opResultCashTotal + netFinCashTotal) * 100) / 100;

    // 6. Tributos sobre o Lucro (grp-5)
    const taxAccs = accounts.filter(a => 
      (a.parentId === 'grp-5' || a.nature === 'TRIBUTO_LUCRO' || (a.code && a.code.startsWith('5'))) && 
      a.isAnalytical
    );
    const taxLines = taxAccs.map(acc => {
      const { monthlyComp, totalComp, monthlyCash, totalCash, titleIds } = getValuesForAccount(acc.id);
      return createDRELine(acc.id, acc.name, acc.code, 2, 'h-6', 'h-6', monthlyComp, totalComp, monthlyCash, totalCash, titleIds);
    });
    const taxCompValues = sumArrays(taxLines.map(l => l.compValuesByMonth || []));
    const taxCompTotal = Math.round(taxLines.reduce((acc, l) => acc + (l.compTotalYear || 0), 0) * 100) / 100;
    const taxCashValues = sumArrays(taxLines.map(l => l.cashValuesByMonth || []));
    const taxCashTotal = Math.round(taxLines.reduce((acc, l) => acc + (l.cashTotalYear || 0), 0) * 100) / 100;

    // (=) Resultado Líquido Gerencial
    const netResultCompValues = subtractArrays(resultBeforeTaxesComp, taxCompValues);
    const netResultCompTotal = Math.round((resultBeforeTaxesCompTotal - taxCompTotal) * 100) / 100;
    const netResultCashValues = subtractArrays(resultBeforeTaxesCash, taxCashValues);
    const netResultCashTotal = Math.round((resultBeforeTaxesCashTotal - taxCashTotal) * 100) / 100;

    // Montagem hierárquica das linhas oficiais da DRE
    const lines: DRELineItem[] = [
      // 1. Receita Bruta
      createDRELine(
        'h-1',
        'RECEITA BRUTA DE SERVIÇOS',
        undefined,
        0,
        'h-1',
        undefined,
        grossRevCompValues,
        grossRevCompTotal,
        grossRevCashValues,
        grossRevCashTotal,
        grossRevLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...grossRevLines,

      // 2. Deduções
      createDRELine(
        'h-2',
        '(-) Deduções e Tributos sobre Faturamento',
        undefined,
        0,
        'h-2',
        undefined,
        deducCompValues,
        deducCompTotal,
        deducCashValues,
        deducCashTotal,
        deducLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...deducLines,

      // Summary Receita Líquida
      createDRELine(
        's-net-rev',
        '(=) RECEITA LÍQUIDA',
        undefined,
        0,
        'h-1',
        undefined,
        netRevCompValues,
        netRevCompTotal,
        netRevCashValues,
        netRevCashTotal,
        undefined,
        false,
        true
      ),

      // 3. Custos dos Serviços Prestados
      createDRELine(
        'h-3',
        '(-) Custos dos Serviços Prestados',
        undefined,
        0,
        'h-3',
        undefined,
        costCompValues,
        costCompTotal,
        costCashValues,
        costCashTotal,
        costLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...costLines,

      // Summary Lucro Bruto
      createDRELine(
        's-gross-profit',
        '(=) LUCRO BRUTO',
        undefined,
        0,
        'h-3',
        undefined,
        grossProfitCompValues,
        grossProfitCompTotal,
        grossProfitCashValues,
        grossProfitCashTotal,
        undefined,
        false,
        true
      ),

      // 4. Despesas Operacionais
      createDRELine(
        'h-4',
        '(-) Despesas Operacionais',
        undefined,
        0,
        'h-4',
        undefined,
        opExpCompValues,
        opExpCompTotal,
        opExpCashValues,
        opExpCashTotal,
        [...personalLines, ...adminLines, ...commLines, ...generalLines].flatMap(l => l.matchedTitleIds || []),
        true
      ),
      createDRELine(
        'h-4.1',
        'Despesas com Pessoal',
        undefined,
        1,
        'h-4',
        'h-4',
        personalCompValues,
        personalCompTotal,
        personalCashValues,
        personalCashTotal,
        personalLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...personalLines,

      createDRELine(
        'h-4.2',
        'Despesas Administrativas',
        undefined,
        1,
        'h-4',
        'h-4',
        adminCompValues,
        adminCompTotal,
        adminCashValues,
        adminCashTotal,
        adminLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...adminLines,

      createDRELine(
        'h-4.3',
        'Despesas Comerciais',
        undefined,
        1,
        'h-4',
        'h-4',
        commCompValues,
        commCompTotal,
        commCashValues,
        commCashTotal,
        commLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...commLines,

      ...(generalLines.length > 0 ? [
        createDRELine(
          'h-4.4',
          'Despesas Gerais Operacionais',
          undefined,
          1,
          'h-4',
          'h-4',
          generalCompValues,
          generalCompTotal,
          generalCashValues,
          generalCashTotal,
          generalLines.flatMap(l => l.matchedTitleIds || []),
          true
        ),
        ...generalLines
      ] : []),

      // Summary Resultado Operacional
      createDRELine(
        's-op-result',
        '(=) RESULTADO OPERACIONAL (EBITDA/LAJIDA)',
        undefined,
        0,
        'h-4',
        undefined,
        opResultCompValues,
        opResultCompTotal,
        opResultCashValues,
        opResultCashTotal,
        undefined,
        false,
        true
      ),

      // 5. Resultado Financeiro
      createDRELine(
        'h-5',
        '(+/-) Resultado Financeiro Líquido',
        undefined,
        0,
        'h-5',
        undefined,
        netFinCompValues,
        netFinCompTotal,
        netFinCashValues,
        netFinCashTotal,
        [...finRevLines, ...finExpLines].flatMap(l => l.matchedTitleIds || []),
        true
      ),
      createDRELine(
        'h-5.1',
        '(+) Receitas Financeiras',
        undefined,
        1,
        'h-5',
        'h-5',
        finRevCompValues,
        finRevCompTotal,
        finRevCashValues,
        finRevCashTotal,
        finRevLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...finRevLines,

      createDRELine(
        'h-5.2',
        '(-) Despesas Financeiras',
        undefined,
        1,
        'h-5',
        'h-5',
        finExpCompValues,
        finExpCompTotal,
        finExpCashValues,
        finExpCashTotal,
        finExpLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...finExpLines,

      // Summary LAIR
      createDRELine(
        's-lair',
        '(=) RESULTADO ANTES DOS TRIBUTOS (LAIR)',
        undefined,
        0,
        'h-5',
        undefined,
        resultBeforeTaxesComp,
        resultBeforeTaxesCompTotal,
        resultBeforeTaxesCash,
        resultBeforeTaxesCashTotal,
        undefined,
        false,
        true
      ),

      // 6. Tributos sobre Lucro
      createDRELine(
        'h-6',
        '(-) Tributos sobre o Lucro',
        undefined,
        0,
        'h-6',
        undefined,
        taxCompValues,
        taxCompTotal,
        taxCashValues,
        taxCashTotal,
        taxLines.flatMap(l => l.matchedTitleIds || []),
        true
      ),
      ...taxLines,

      // Final Summary
      createDRELine(
        's-final',
        '(=) RESULTADO LÍQUIDO GERENCIAL',
        undefined,
        0,
        's-final',
        undefined,
        netResultCompValues,
        netResultCompTotal,
        netResultCashValues,
        netResultCashTotal,
        undefined,
        false,
        true
      )
    ];

    const activeNetResults = regime === 'CAIXA' ? netResultCashValues : netResultCompValues;
    const activeTotalNetResult = regime === 'CAIXA' ? netResultCashTotal : netResultCompTotal;

    return {
      months,
      lines,
      netResults: activeNetResults,
      totalNetResult: activeTotalNetResult,
      regime,
      cashNetResults: netResultCashValues,
      totalCashNetResult: netResultCashTotal
    };
  }

  /**
   * Atalho para gerar a DRE gerencial pelo regime de Caixa (efetivação financeira)
   */
  public static generateDREByCash(year: number): DREMatrix {
    return this.generateDRE(year, 'CAIXA');
  }

  /**
   * Atalho para gerar a DRE gerencial comparativa (Caixa vs Competência lado a lado)
   */
  public static generateDREComparison(year: number): DREMatrix {
    return this.generateDRE(year, 'COMPARATIVO');
  }

  /**
   * Helper contábil para identificar se um item ou conta pertence à Distribuição de Lucros / Dividendos
   */
  public static isProfitDistribution(item: {
    accountId?: string;
    description?: string;
    notes?: string;
    categoryName?: string;
  }, accounts?: ChartAccount[]): boolean {
    if (item.accountId) {
      if (item.accountId === 'acc-7.1.04') return true;
      if (accounts) {
        const acc = accounts.find(a => a.id === item.accountId || a.code === item.accountId);
        if (acc) {
          if (acc.code === '7.1.04') return true;
          if (acc.nature === 'FINANCIAMENTO_SOCIO' && acc.name.toLowerCase().includes('lucro')) return true;
        }
      }
    }

    const text = `${item.description || ''} ${item.notes || ''} ${item.categoryName || ''}`.toLowerCase();
    const profitKeywords = [
      'distribuicao de lucro',
      'distribuição de lucro',
      'distribuicao de lucros',
      'distribuição de lucros',
      'distribuicao lucro',
      'distribuição lucro',
      'distrib. lucro',
      'distrib. lucros',
      'distrib lucros',
      'distrib lucro',
      'retirada de lucro',
      'retirada de lucros',
      'lucro distribuido',
      'lucros distribuidos',
      'dividendos',
      'dividendo'
    ];

    return profitKeywords.some(kw => text.includes(kw));
  }

  /**
   * GENERATE DIRECT CASH FLOW (FLUXO DE CAIXA DIRETO - CPC 03)
   * Segrega rigorosamente pagamentos de Atividades Reais da Empresa e Distribuição de Lucros aos Sócios.
   * Realized + Projected support across 12 months.
   */
  public static generateCashFlow(year: number, mode: 'REALIZADO' | 'PROJETADO' | 'CONSOLIDADO' = 'REALIZADO'): {
    months: string[];
    lines: CashFlowLineItem[];
    finalBalances: number[];
    summary: {
      totalInflows: number;
      totalOperationalOutflows: number;
      totalInvestmentOutflows: number;
      totalLoanOutflows: number;
      totalRealActivitiesOutflows: number;
      totalProfitDistribution: number;
      totalOutflows: number;
      netCashBeforeProfit: number;
      netCashFinal: number;
    };
  } {
    const movements = storage.getMovements().filter(m => !m.isReversed);
    const titles = storage.getTitles().filter(t => t.documentState === 'CONFIRMADO' && t.balancePrincipal > 0);
    const settlements = storage.getSettlements();
    const accounts = storage.getChartAccounts();
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    // Map para lookup rápido de títulos por settlement
    const allTitles = storage.getTitles();
    const settlementToTitleMap = new Map<string, FinancialTitle>();
    for (const s of settlements) {
      const t = allTitles.find(title => title.id === s.titleId);
      if (t) settlementToTitleMap.set(s.id, t);
    }

    // Initial balance at Jan 1st of the year
    const initialBalanceJan = FinancialEngine.getConsolidatedCashBalance(`${year}-01-01`);

    const opInflows = new Array(12).fill(0);
    const opOutflows = new Array(12).fill(0);
    const invInflows = new Array(12).fill(0);
    const invOutflows = new Array(12).fill(0);
    const finInflows = new Array(12).fill(0);
    const finLoanOutflows = new Array(12).fill(0);   // Amortização de Empréstimos e Financiamentos
    const finProfitOutflows = new Array(12).fill(0); // Distribuição de Lucros aos Sócios

    // Acumuladores analíticos por conta / rubrica para o modo detalhado (level: 2)
    type AccountBreakdown = { id: string; code?: string; name: string; valuesByMonth: number[] };
    const opInAccounts = new Map<string, AccountBreakdown>();
    const opOutAccounts = new Map<string, AccountBreakdown>();
    const invInAccounts = new Map<string, AccountBreakdown>();
    const invOutAccounts = new Map<string, AccountBreakdown>();
    const finInAccounts = new Map<string, AccountBreakdown>();
    const finOutAccounts = new Map<string, AccountBreakdown>();

    const recordAccountAmount = (
      map: Map<string, AccountBreakdown>,
      accountId: string | undefined,
      fallbackName: string,
      monthIdx: number,
      amount: number
    ) => {
      if (!amount) return;
      const acc = accountId ? accounts.find(a => a.id === accountId) : undefined;
      const key = acc?.id || fallbackName || 'outros';
      const code = acc?.code;
      const name = acc?.name || fallbackName || 'Outras Rubricas';

      if (!map.has(key)) {
        map.set(key, { id: key, code, name, valuesByMonth: new Array(12).fill(0) });
      }
      const item = map.get(key)!;
      item.valuesByMonth[monthIdx] = Math.round((item.valuesByMonth[monthIdx] + amount) * 100) / 100;
    };

    // 1. Realized movements
    if (mode === 'REALIZADO' || mode === 'CONSOLIDADO') {
      for (const mov of movements) {
        if (!mov.date.startsWith(`${year}-`)) continue;
        if (mov.cashFlowCategory === 'TRANSFERENCIA_INTERNA') continue; // Transferência interna tem efeito nulo

        const monthIdx = parseInt(mov.date.substring(5, 7), 10) - 1;
        if (monthIdx < 0 || monthIdx > 11) continue;

        const linkedTitle = mov.originReferenceId ? settlementToTitleMap.get(mov.originReferenceId) : undefined;
        const isProfit = ReportingEngine.isProfitDistribution({
          accountId: mov.accountId || linkedTitle?.accountId,
          description: `${mov.description || ''} ${linkedTitle?.description || ''}`,
          categoryName: linkedTitle?.categoryName
        }, accounts);

        // Se for saída de distribuição de lucros, segregar independente da categoria original
        if (isProfit && mov.direction === 'SAIDA') {
          finProfitOutflows[monthIdx] += mov.amount;
        } else if (mov.cashFlowCategory === 'OPERACIONAL') {
          if (mov.direction === 'ENTRADA') {
            opInflows[monthIdx] += mov.amount;
            recordAccountAmount(opInAccounts, mov.accountId || linkedTitle?.accountId, linkedTitle?.categoryName || mov.description || 'Receita Operacional', monthIdx, mov.amount);
          } else {
            opOutflows[monthIdx] += mov.amount;
            recordAccountAmount(opOutAccounts, mov.accountId || linkedTitle?.accountId, linkedTitle?.categoryName || mov.description || 'Despesa Operacional', monthIdx, mov.amount);
          }
        } else if (mov.cashFlowCategory === 'INVESTIMENTO') {
          if (mov.direction === 'ENTRADA') {
            invInflows[monthIdx] += mov.amount;
            recordAccountAmount(invInAccounts, mov.accountId || linkedTitle?.accountId, linkedTitle?.categoryName || mov.description || 'Ingresso de Investimento', monthIdx, mov.amount);
          } else {
            invOutflows[monthIdx] += mov.amount;
            recordAccountAmount(invOutAccounts, mov.accountId || linkedTitle?.accountId, linkedTitle?.categoryName || mov.description || 'Aquisição / Aplicação', monthIdx, mov.amount);
          }
        } else if (mov.cashFlowCategory === 'FINANCIAMENTO') {
          if (mov.direction === 'ENTRADA') {
            finInflows[monthIdx] += mov.amount;
            recordAccountAmount(finInAccounts, mov.accountId || linkedTitle?.accountId, linkedTitle?.categoryName || mov.description || 'Aporte / Empréstimo', monthIdx, mov.amount);
          } else {
            finLoanOutflows[monthIdx] += mov.amount;
            recordAccountAmount(finOutAccounts, mov.accountId || linkedTitle?.accountId, linkedTitle?.categoryName || mov.description || 'Amortização de Financiamento', monthIdx, mov.amount);
          }
        }
      }
    }

    // 2. Projected (saldo em aberto dos títulos pela data prevista de caixa)
    if (mode === 'PROJETADO' || mode === 'CONSOLIDADO') {
      for (const title of titles) {
        const targetDate = title.expectedCashDate || title.dueDate;
        if (!targetDate.startsWith(`${year}-`)) continue;

        const monthIdx = parseInt(targetDate.substring(5, 7), 10) - 1;
        if (monthIdx < 0 || monthIdx > 11) continue;

        const acc = accounts.find(a => a.id === title.accountId);
        const cat = acc ? acc.cashFlowCategory : 'OPERACIONAL';

        const isProfit = ReportingEngine.isProfitDistribution({
          accountId: title.accountId,
          description: title.description,
          categoryName: title.categoryName
        }, accounts);

        if (isProfit && title.type === 'PAGAR') {
          finProfitOutflows[monthIdx] += title.balancePrincipal;
        } else if (cat === 'INVESTIMENTO') {
          if (title.type === 'RECEBER') {
            invInflows[monthIdx] += title.balancePrincipal;
            recordAccountAmount(invInAccounts, title.accountId, title.categoryName || title.description || 'Ingresso de Investimento', monthIdx, title.balancePrincipal);
          } else {
            invOutflows[monthIdx] += title.balancePrincipal;
            recordAccountAmount(invOutAccounts, title.accountId, title.categoryName || title.description || 'Aquisição / Aplicação', monthIdx, title.balancePrincipal);
          }
        } else if (cat === 'FINANCIAMENTO') {
          if (title.type === 'RECEBER') {
            finInflows[monthIdx] += title.balancePrincipal;
            recordAccountAmount(finInAccounts, title.accountId, title.categoryName || title.description || 'Aporte / Empréstimo', monthIdx, title.balancePrincipal);
          } else {
            finLoanOutflows[monthIdx] += title.balancePrincipal;
            recordAccountAmount(finOutAccounts, title.accountId, title.categoryName || title.description || 'Amortização de Financiamento', monthIdx, title.balancePrincipal);
          }
        } else {
          if (title.type === 'RECEBER') {
            opInflows[monthIdx] += title.balancePrincipal;
            recordAccountAmount(opInAccounts, title.accountId, title.categoryName || title.description || 'Receita Operacional', monthIdx, title.balancePrincipal);
          } else {
            opOutflows[monthIdx] += title.balancePrincipal;
            recordAccountAmount(opOutAccounts, title.accountId, title.categoryName || title.description || 'Despesa Operacional', monthIdx, title.balancePrincipal);
          }
        }
      }
    }

    // Soma das saídas de financiamento (Empréstimos + Lucros)
    const finTotalOutflows = finLoanOutflows.map((loan, i) => Math.round((loan + finProfitOutflows[i]) * 100) / 100);

    // Pagamentos Reais das Atividades da Empresa (Operacional + Investimentos + Amortização de Dívidas)
    const realActivitiesOutflows = opOutflows.map((op, i) => 
      Math.round((op + invOutflows[i] + finLoanOutflows[i]) * 100) / 100
    );

    // Resultados Líquidos por Atividade
    const netOp = opInflows.map((v, i) => Math.round((v - opOutflows[i]) * 100) / 100);
    const netInv = invInflows.map((v, i) => Math.round((v - invOutflows[i]) * 100) / 100);
    const netFin = finInflows.map((v, i) => Math.round((v - finTotalOutflows[i]) * 100) / 100);

    // Fluxo de Caixa Antes da Distribuição de Lucros
    const totalMonthlyInflows = opInflows.map((opIn, i) => Math.round((opIn + invInflows[i] + finInflows[i]) * 100) / 100);
    const netCashBeforeProfit = totalMonthlyInflows.map((inflow, i) => Math.round((inflow - realActivitiesOutflows[i]) * 100) / 100);

    // Variação Líquida Final de Caixa (Net Real - Lucros)
    const netVariations = netCashBeforeProfit.map((before, i) => Math.round((before - finProfitOutflows[i]) * 100) / 100);

    // Initial balances roll-over month by month
    const initialBalances = new Array(12).fill(0);
    const finalBalances = new Array(12).fill(0);

    let currentBalance = initialBalanceJan;
    for (let m = 0; m < 12; m++) {
      initialBalances[m] = currentBalance;
      currentBalance = Math.round((currentBalance + netVariations[m]) * 100) / 100;
      finalBalances[m] = currentBalance;
    }

    // Gerador de linhas analíticas detalhadas por conta (nível 2)
    const buildBreakdownLines = (
      map: Map<string, AccountBreakdown>,
      prefix: string,
      type: 'ENTRADA' | 'SAIDA',
      category: 'OPERACIONAL' | 'INVESTIMENTO' | 'FINANCIAMENTO'
    ): CashFlowLineItem[] => {
      return Array.from(map.values())
        .filter(item => item.valuesByMonth.some(v => v !== 0))
        .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name))
        .map(item => ({
          id: `${prefix}-${item.id}`,
          name: item.name,
          code: item.code,
          level: 2,
          type,
          activityCategory: category,
          valuesByMonth: item.valuesByMonth,
          totalYear: Math.round(item.valuesByMonth.reduce((a, b) => a + b, 0) * 100) / 100
        }));
    };

    const opInLines = buildBreakdownLines(opInAccounts, 'cf-op-in-acc', 'ENTRADA', 'OPERACIONAL');
    const opOutLines = buildBreakdownLines(opOutAccounts, 'cf-op-out-acc', 'SAIDA', 'OPERACIONAL');
    const invInLines = buildBreakdownLines(invInAccounts, 'cf-inv-in-acc', 'ENTRADA', 'INVESTIMENTO');
    const invOutLines = buildBreakdownLines(invOutAccounts, 'cf-inv-out-acc', 'SAIDA', 'INVESTIMENTO');
    const finInLines = buildBreakdownLines(finInAccounts, 'cf-fin-in-acc', 'ENTRADA', 'FINANCIAMENTO');
    const finOutLines = buildBreakdownLines(finOutAccounts, 'cf-fin-out-acc', 'SAIDA', 'FINANCIAMENTO');

    const lines: CashFlowLineItem[] = [
      {
        id: 'cf-initial',
        name: '(=) SALDO INICIAL DE CAIXA E EQUIVALENTES',
        level: 0,
        isSummary: true,
        type: 'SALDO',
        activityCategory: 'SALDO',
        valuesByMonth: initialBalances,
        totalYear: initialBalanceJan
      },

      // 1. ATIVIDADES OPERACIONAIS
      {
        id: 'cf-op-header',
        name: '1. ATIVIDADES OPERACIONAIS',
        level: 0,
        isHeader: true,
        activityCategory: 'OPERACIONAL',
        valuesByMonth: new Array(12).fill(0),
        totalYear: 0
      },
      {
        id: 'cf-op-in',
        name: '(+) Caixa Gerado pelas Operações (Recebimentos / Ingressos)',
        level: 1,
        type: 'ENTRADA',
        activityCategory: 'OPERACIONAL',
        valuesByMonth: opInflows,
        totalYear: Math.round(opInflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      ...opInLines,
      {
        id: 'cf-op-out',
        name: '(-) Caixa Consumido pelas Operações (Pagamentos / Desembolsos)',
        level: 1,
        type: 'SAIDA',
        activityCategory: 'OPERACIONAL',
        valuesByMonth: opOutflows,
        totalYear: Math.round(opOutflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      ...opOutLines,
      {
        id: 'cf-op-net',
        name: '(=) SOMA DA ATIVIDADE OPERACIONAL (Caixa Líquido Operacional / Geração Líquida)',
        level: 0,
        isSummary: true,
        type: 'SALDO',
        activityCategory: 'OPERACIONAL',
        valuesByMonth: netOp,
        totalYear: Math.round(netOp.reduce((a, b) => a + b, 0) * 100) / 100
      },

      // 2. ATIVIDADES DE INVESTIMENTO
      {
        id: 'cf-inv-header',
        name: '2. ATIVIDADES DE INVESTIMENTO',
        level: 0,
        isHeader: true,
        activityCategory: 'INVESTIMENTO',
        valuesByMonth: new Array(12).fill(0),
        totalYear: 0
      },
      {
        id: 'cf-inv-in',
        name: '(+) Caixa Gerado por Investimentos (Resgates e Vendas de Ativos)',
        level: 1,
        type: 'ENTRADA',
        activityCategory: 'INVESTIMENTO',
        valuesByMonth: invInflows,
        totalYear: Math.round(invInflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      ...invInLines,
      {
        id: 'cf-inv-out',
        name: '(-) Caixa Consumido por Investimentos (Aquisições e Aplicações)',
        level: 1,
        type: 'SAIDA',
        activityCategory: 'INVESTIMENTO',
        valuesByMonth: invOutflows,
        totalYear: Math.round(invOutflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      ...invOutLines,
      {
        id: 'cf-inv-net',
        name: '(=) SOMA DA ATIVIDADE DE INVESTIMENTO (Fluxo Líquido de Investimento)',
        level: 0,
        isSummary: true,
        type: 'SALDO',
        activityCategory: 'INVESTIMENTO',
        valuesByMonth: netInv,
        totalYear: Math.round(netInv.reduce((a, b) => a + b, 0) * 100) / 100
      },

      // 3. ATIVIDADES DE FINANCIAMENTO
      {
        id: 'cf-fin-header',
        name: '3. ATIVIDADES DE FINANCIAMENTO',
        level: 0,
        isHeader: true,
        activityCategory: 'FINANCIAMENTO',
        valuesByMonth: new Array(12).fill(0),
        totalYear: 0
      },
      {
        id: 'cf-fin-in',
        name: '(+) Caixa Gerado por Financiamentos (Empréstimos e Aportes de Capital)',
        level: 1,
        type: 'ENTRADA',
        activityCategory: 'FINANCIAMENTO',
        valuesByMonth: finInflows,
        totalYear: Math.round(finInflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      ...finInLines,
      {
        id: 'cf-fin-out',
        name: '(-) Caixa Consumido por Financiamentos (Amortizações e Retiradas)',
        level: 1,
        type: 'SAIDA',
        activityCategory: 'FINANCIAMENTO',
        valuesByMonth: finTotalOutflows,
        totalYear: Math.round(finTotalOutflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      {
        id: 'cf-fin-out-loans',
        name: '    (-) Amortização de Empréstimos e Financiamentos',
        level: 2,
        type: 'SAIDA',
        activityCategory: 'FINANCIAMENTO',
        valuesByMonth: finLoanOutflows,
        totalYear: Math.round(finLoanOutflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      {
        id: 'cf-fin-out-profit',
        name: '    (-) Distribuição de Lucros e Dividendos aos Sócios',
        level: 2,
        type: 'SAIDA',
        activityCategory: 'FINANCIAMENTO',
        valuesByMonth: finProfitOutflows,
        totalYear: Math.round(finProfitOutflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      ...finOutLines,
      {
        id: 'cf-fin-net',
        name: '(=) SOMA DA ATIVIDADE DE FINANCIAMENTO (Fluxo Líquido de Financiamento)',
        level: 0,
        isSummary: true,
        type: 'SALDO',
        activityCategory: 'FINANCIAMENTO',
        valuesByMonth: netFin,
        totalYear: Math.round(netFin.reduce((a, b) => a + b, 0) * 100) / 100
      },

      // 4. Subtotal Gerencial de Demonstração (Segregação de Atividades Reais vs Retiradas de Lucro)
      {
        id: 'cf-real-activities-outflows',
        name: '(-) Total Desembolsos das Atividades da Empresa (Operação + Inv + Dívidas)',
        level: 0,
        isSummary: true,
        type: 'SAIDA',
        valuesByMonth: realActivitiesOutflows,
        totalYear: Math.round(realActivitiesOutflows.reduce((a, b) => a + b, 0) * 100) / 100
      },
      {
        id: 'cf-cash-before-profit',
        name: '(=) FLUXO DE CAIXA ANTES DA DISTRIBUIÇÃO DE LUCROS',
        level: 0,
        isSummary: true,
        type: 'SALDO',
        valuesByMonth: netCashBeforeProfit,
        totalYear: Math.round(netCashBeforeProfit.reduce((a, b) => a + b, 0) * 100) / 100
      },
      {
        id: 'cf-profit-distribution',
        name: '(-) Distribuição de Lucros aos Sócios no Período',
        level: 0,
        isSummary: true,
        type: 'SAIDA',
        valuesByMonth: finProfitOutflows,
        totalYear: Math.round(finProfitOutflows.reduce((a, b) => a + b, 0) * 100) / 100
      },

      // 5. Variação Líquida e Saldo Final
      {
        id: 'cf-net-variation',
        name: '(=) SOMA TOTAL DO FLUXO DE CAIXA NO PERÍODO (VARIAÇÃO LÍQUIDA)',
        level: 0,
        isSummary: true,
        type: 'SALDO',
        activityCategory: 'TOTAL',
        valuesByMonth: netVariations,
        totalYear: Math.round(netVariations.reduce((a, b) => a + b, 0) * 100) / 100
      },
      {
        id: 'cf-final',
        name: '(=) SALDO FINAL DE CAIXA E EQUIVALENTES',
        level: 0,
        isSummary: true,
        type: 'SALDO',
        activityCategory: 'SALDO',
        valuesByMonth: finalBalances,
        totalYear: finalBalances[11] // No fechamento anual, o saldo final é a posição de fechamento de Dezembro
      }
    ];

    const totalInflowsSum = opInflows.reduce((a, b) => a + b, 0) +
                            invInflows.reduce((a, b) => a + b, 0) +
                            finInflows.reduce((a, b) => a + b, 0);

    const totalOperationalOutflowsSum = opOutflows.reduce((a, b) => a + b, 0);
    const totalInvestmentOutflowsSum = invOutflows.reduce((a, b) => a + b, 0);
    const totalLoanOutflowsSum = finLoanOutflows.reduce((a, b) => a + b, 0);
    const totalRealActivitiesOutflowsSum = realActivitiesOutflows.reduce((a, b) => a + b, 0);
    const totalProfitDistributionSum = finProfitOutflows.reduce((a, b) => a + b, 0);
    const totalOutflowsSum = totalRealActivitiesOutflowsSum + totalProfitDistributionSum;
    const netCashBeforeProfitSum = netCashBeforeProfit.reduce((a, b) => a + b, 0);
    const netCashFinalSum = netVariations.reduce((a, b) => a + b, 0);

    return {
      months,
      lines,
      finalBalances,
      summary: {
        totalInflows: totalInflowsSum,
        totalOperationalOutflows: totalOperationalOutflowsSum,
        totalInvestmentOutflows: totalInvestmentOutflowsSum,
        totalLoanOutflows: totalLoanOutflowsSum,
        totalRealActivitiesOutflows: totalRealActivitiesOutflowsSum,
        totalProfitDistribution: totalProfitDistributionSum,
        totalOutflows: totalOutflowsSum,
        netCashBeforeProfit: netCashBeforeProfitSum,
        netCashFinal: netCashFinalSum
      }
    };
  }
}

