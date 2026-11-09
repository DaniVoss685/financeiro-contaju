import { storage } from './storageService';
import { ReportingEngine } from './reportingEngine';
import { FinancialEngine, formatBRL } from './financialEngine';

export type KpiCategory = 'Competência' | 'Comercial' | 'Caixa' | 'Risco' | 'Controladoria';
export type KpiFormat = 'CURRENCY' | 'PERCENT' | 'INTEGER' | 'DECIMAL';

export interface AnnualKpiRow {
  id: string;
  name: string;
  description: string;
  category: KpiCategory;
  format: KpiFormat;
  valuesByMonth: number[]; // 12 posições (índices 0 a 11, de Janeiro a Dezembro)
  periodTotal: number; // Total acumulado ou média do período selecionado
  annualGrowth: number; // Crescimento ou evolução percentual no período
  positiveDirection: 'UP' | 'DOWN'; // 'UP' = subir é positivo (ex: receita); 'DOWN' = descer é positivo (ex: churn, inadimplência)
  aggregationType: 'SUM' | 'AVERAGE' | 'LATEST';
  // Metas Orçamentárias
  targetValuesByMonth?: number[];
  targetPeriodTotal?: number;
  targetAchievementRate?: number; // % atingimento (Realizado / Meta * 100)
  targetDiff?: number;
}

export class KpiEngine {
  /**
   * Calcula as séries mensais de todos os KPIs para o ano de referência
   * e resume o total e a evolução para os meses ativos selecionados.
   */
  public static getAnnualKpis(year: number, activeMonthIndices: number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]): AnnualKpiRow[] {
    const dreComp = ReportingEngine.generateDRE(year, 'COMPETENCIA');
    const contracts = storage.getContracts();
    const titles = storage.getTitles();
    const settlements = storage.getSettlements().filter(s => !s.isReversed);
    const bankAccounts = storage.getBankAccounts();
    const kpiTargets = storage.getKpiTargets(year);

    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

    // 1. Receita Bruta (DRE Competência)
    const grossRevLine = dreComp.lines.find(l => l.name.includes('RECEITA BRUTA') || l.id === 'h-1');
    const grossRevByMonth = Array.from({ length: 12 }, (_, i) => grossRevLine ? (grossRevLine.valuesByMonth[i] || 0) : 0);

    // 2. Resultado Líquido (DRE Competência)
    const netResultByMonth = Array.from({ length: 12 }, (_, i) => dreComp.netResults[i] || 0);

    // 3. Margem Líquida (%)
    const netMarginByMonth = grossRevByMonth.map((rev, i) => rev > 0 ? (netResultByMonth[i] / rev) * 100 : 0);

    // 4. Contratos Ativos e MRR por mês
    // Para cada mês mStr, quais contratos estavam com status ativo
    const contractsByMonth = months.map(mStr => {
      return contracts.filter(c => {
        const start = (c.startDate || c.entryDate || c.createdAt || '').substring(0, 7);
        if (!start || start > mStr) return false;
        const cancel = c.cancellationDate || c.inactivatedAt || '';
        if (cancel && cancel.substring(0, 7) < mStr) return false;
        return c.status === 'ATIVO' || (cancel && cancel.substring(0, 7) >= mStr);
      });
    });

    // Clientes Ativos (com Contrato Ativo)
    const activeClientsByMonth = contractsByMonth.map(cts => new Set(cts.map(c => c.customerId)).size);

    // MRR por mês
    const mrrByMonth = contractsByMonth.map(cts => cts.reduce((acc, c) => acc + (c.monthlyTotal || 0), 0));

    // Primeiro contrato por cliente para detectar novos clientes
    const customerFirstContractMap = new Map<string, string>();
    for (const c of contracts) {
      const cur = customerFirstContractMap.get(c.customerId);
      const contractStart = (c.startDate || c.entryDate || c.createdAt || '').substring(0, 7);
      if (!cur || (contractStart && contractStart < cur)) {
        customerFirstContractMap.set(c.customerId, contractStart);
      }
    }

    // Novos clientes por mês
    const newClientsByMonth = months.map(mStr => {
      let count = 0;
      for (const [_, startMonth] of customerFirstContractMap.entries()) {
        if (startMonth === mStr) count++;
      }
      return count;
    });

    // Clientes cancelados (churn) por mês
    const churnClientsByMonth = months.map((mStr, idx) => {
      const canceledInMonth = contracts.filter(c => {
        const cancel = (c.cancellationDate || c.inactivatedAt || '').substring(0, 7);
        return (c.status === 'CANCELADO' || c.status === 'ENCERRADO') && cancel === mStr;
      }).map(c => c.customerId);
      
      // Filtrar apenas aqueles que não possuem outro contrato ativo no mês
      const activeInMonth = new Set(contractsByMonth[idx].map(c => c.customerId));
      const trueChurn = canceledInMonth.filter(cId => !activeInMonth.has(cId));
      return new Set(trueChurn).size;
    });

    // Taxa de Churn (%) por mês
    const churnRateByMonth = months.map((_, i) => {
      const base = i > 0 ? activeClientsByMonth[i - 1] : activeClientsByMonth[0];
      return base > 0 ? (churnClientsByMonth[i] / base) * 100 : 0;
    });

    // Ticket Médio por cliente ativo (R$/mês)
    const avgTicketByMonth = months.map((_, i) => {
      const act = activeClientsByMonth[i];
      return act > 0 ? mrrByMonth[i] / act : 0;
    });

    // 5. Entradas e Saídas de Caixa (Liquidações efetivas)
    const cashInflowByMonth = months.map(mStr => {
      let sum = 0;
      for (const s of settlements) {
        if ((s.settlementDate || '').startsWith(mStr)) {
          const title = titles.find(t => t.id === s.titleId);
          if (title?.type === 'RECEBER') {
            sum += s.components?.principalSettled || s.components?.netFinancialAmount || 0;
          }
        }
      }
      return Math.round(sum * 100) / 100;
    });

    const cashOutflowByMonth = months.map(mStr => {
      let sum = 0;
      for (const s of settlements) {
        if ((s.settlementDate || '').startsWith(mStr)) {
          const title = titles.find(t => t.id === s.titleId);
          if (title?.type === 'PAGAR') {
            sum += s.components?.principalSettled || s.components?.netFinancialAmount || 0;
          }
        }
      }
      return Math.round(sum * 100) / 100;
    });

    const netCashByMonth = cashInflowByMonth.map((inf, i) => Math.round((inf - cashOutflowByMonth[i]) * 100) / 100);

    // Saldo bancário consolidado mês a mês
    const cashBalanceByMonth = months.map(mStr => {
      return FinancialEngine.getConsolidatedCashBalance(`${mStr}-31`);
    });

    // 6. Inadimplência mês a mês (% e R$)
    const delinquencyRateByMonth = months.map(mStr => {
      const openTitles = titles.filter(t => 
        t.type === 'RECEBER' && 
        t.documentState === 'CONFIRMADO' && 
        (t.competence || t.dueDate || '').substring(0, 7) <= mStr
      );
      const totalOpen = openTitles.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
      const overdue = openTitles
        .filter(t => (t.dueDate || '') < `${mStr}-31` && (t.balancePrincipal || 0) > 0)
        .reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
      return totalOpen > 0 ? (overdue / totalOpen) * 100 : 0;
    });

    // 7. A Receber e A Pagar em aberto
    const openReceivablesByMonth = months.map(mStr => {
      return titles
        .filter(t => t.type === 'RECEBER' && (t.competence || t.dueDate || '').substring(0, 7) === mStr && (t.balancePrincipal || 0) > 0)
        .reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
    });

    const openPayablesByMonth = months.map(mStr => {
      return titles
        .filter(t => t.type === 'PAGAR' && (t.competence || t.dueDate || '').substring(0, 7) === mStr && (t.balancePrincipal || 0) > 0)
        .reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
    });

    // Helper para consolidar total e evolução de acordo com os meses ativos selecionados
    const consolidateRow = (
      id: string,
      name: string,
      description: string,
      category: KpiCategory,
      format: KpiFormat,
      valuesByMonth: number[],
      aggregationType: 'SUM' | 'AVERAGE' | 'LATEST',
      positiveDirection: 'UP' | 'DOWN' = 'UP'
    ): AnnualKpiRow => {
      const activeValues = activeMonthIndices.map(i => valuesByMonth[i] || 0);
      
      let periodTotal = 0;
      if (aggregationType === 'SUM') {
        periodTotal = activeValues.reduce((acc, v) => acc + v, 0);
      } else if (aggregationType === 'AVERAGE') {
        const nonZero = activeValues.filter(v => v !== 0);
        periodTotal = nonZero.length > 0 ? activeValues.reduce((acc, v) => acc + v, 0) / nonZero.length : 0;
      } else {
        // LATEST
        periodTotal = activeValues[activeValues.length - 1] || 0;
      }

      // Calcular crescimento / evolução anual (% AH)
      // Compara o primeiro mês ativo com o último mês ativo
      const firstVal = activeValues[0] || 0;
      const lastVal = activeValues[activeValues.length - 1] || 0;
      let annualGrowth = 0;
      if (firstVal !== 0) {
        annualGrowth = ((lastVal - firstVal) / Math.abs(firstVal)) * 100;
      } else if (lastVal > 0) {
        annualGrowth = 100;
      }

      // Metas do KPI para o ano
      const matchingTarget = kpiTargets.find(t => t.kpiId === id);
      const targetValues = matchingTarget?.monthlyTargets || Array.from({ length: 12 }, () => 0);
      const activeTargetValues = activeMonthIndices.map(i => targetValues[i] || 0);

      let targetPeriodTotal = 0;
      if (aggregationType === 'SUM') {
        targetPeriodTotal = activeTargetValues.reduce((acc, v) => acc + v, 0);
      } else if (aggregationType === 'AVERAGE') {
        const nonZeroT = activeTargetValues.filter(v => v !== 0);
        targetPeriodTotal = nonZeroT.length > 0 ? activeTargetValues.reduce((acc, v) => acc + v, 0) / nonZeroT.length : 0;
      } else {
        targetPeriodTotal = activeTargetValues[activeTargetValues.length - 1] || 0;
      }

      let targetAchievementRate: number | undefined = undefined;
      if (targetPeriodTotal !== 0) {
        if (positiveDirection === 'UP') {
          targetAchievementRate = Math.round((periodTotal / targetPeriodTotal) * 1000) / 10;
        } else {
          targetAchievementRate = periodTotal <= targetPeriodTotal 
            ? Math.round((100 + ((targetPeriodTotal - periodTotal) / targetPeriodTotal) * 100) * 10) / 10
            : Math.round((targetPeriodTotal / Math.max(0.001, periodTotal)) * 1000) / 10;
        }
      }

      const targetDiff = Math.round((periodTotal - targetPeriodTotal) * 100) / 100;

      return {
        id,
        name,
        description,
        category,
        format,
        valuesByMonth,
        periodTotal: Math.round(periodTotal * 100) / 100,
        annualGrowth: Math.round(annualGrowth * 10) / 10,
        aggregationType,
        positiveDirection,
        targetValuesByMonth: targetValues,
        targetPeriodTotal: Math.round(targetPeriodTotal * 100) / 100,
        targetAchievementRate,
        targetDiff
      };
    };

    return [
      consolidateRow(
        'faturamento_bruto',
        'Receita Bruta (Faturamento)',
        'Total do faturamento reconhecido pelo regime de competência contábil (DRE) em cada mês.',
        'Competência',
        'CURRENCY',
        grossRevByMonth,
        'SUM',
        'UP'
      ),
      consolidateRow(
        'resultado_liquido',
        'Resultado Líquido do Exercício',
        'Lucro ou prejuízo líquido apurado após todas as deduções, custos operacionais e impostos.',
        'Competência',
        'CURRENCY',
        netResultByMonth,
        'SUM',
        'UP'
      ),
      consolidateRow(
        'margem_liquida',
        'Margem Líquida (%)',
        'Eficiência operacional: percentual do faturamento convertido em lucro líquido da empresa.',
        'Controladoria',
        'PERCENT',
        netMarginByMonth,
        'AVERAGE',
        'UP'
      ),
      consolidateRow(
        'mrr',
        'MRR (Receita Mensal Recorrente)',
        'Valor mensal recorrente contratado da carteira de clientes ativos da Contaju.',
        'Comercial',
        'CURRENCY',
        mrrByMonth,
        'LATEST',
        'UP'
      ),
      consolidateRow(
        'clientes_ativos',
        'Clientes Ativos sob Contrato',
        'Quantidade de clientes únicos com pelo menos um contrato formal com status ATIVO.',
        'Comercial',
        'INTEGER',
        activeClientsByMonth,
        'LATEST',
        'UP'
      ),
      consolidateRow(
        'crescimento_clientes',
        'Novos Clientes (Novos Contratos)',
        'Quantidade de novos clientes que ativaram seu primeiro contrato na Contaju no período.',
        'Comercial',
        'INTEGER',
        newClientsByMonth,
        'SUM',
        'UP'
      ),
      consolidateRow(
        'churn_clientes',
        'Clientes Churn (Cancelados)',
        'Clientes que cancelaram ou encerraram contrato no período e ficaram sem contrato ativo.',
        'Comercial',
        'INTEGER',
        churnClientsByMonth,
        'SUM',
        'DOWN'
      ),
      consolidateRow(
        'taxa_churn',
        'Taxa de Churn (%)',
        'Percentual de clientes com contrato cancelado em relação à base ativa do período.',
        'Comercial',
        'PERCENT',
        churnRateByMonth,
        'AVERAGE',
        'DOWN'
      ),
      consolidateRow(
        'ticket_medio',
        'Ticket Médio por Cliente',
        'Valor médio mensal de honorários contratados por cliente ativo (MRR / Clientes Ativos).',
        'Comercial',
        'CURRENCY',
        avgTicketByMonth,
        'AVERAGE',
        'UP'
      ),
      consolidateRow(
        'saldo_disponivel',
        'Disponibilidade em Caixa',
        'Saldo líquido consolidado e conciliado disponível nas contas bancárias da empresa.',
        'Caixa',
        'CURRENCY',
        cashBalanceByMonth,
        'LATEST',
        'UP'
      ),
      consolidateRow(
        'entradas_caixa',
        'Entradas Realizadas (Caixa)',
        'Valores monetários que foram efetivamente recebidos e liquidados no banco no mês.',
        'Caixa',
        'CURRENCY',
        cashInflowByMonth,
        'SUM',
        'UP'
      ),
      consolidateRow(
        'saidas_caixa',
        'Saídas Realizadas (Caixa)',
        'Total de pagamentos, tributos e despesas efetivamente desembolsados nas contas bancárias.',
        'Caixa',
        'CURRENCY',
        cashOutflowByMonth,
        'SUM',
        'DOWN'
      ),
      consolidateRow(
        'saldo_liquido_caixa',
        'Geração Líquida de Caixa',
        'Superávit ou déficit financeiro do período (Entradas Realizadas - Saídas Realizadas).',
        'Caixa',
        'CURRENCY',
        netCashByMonth,
        'SUM',
        'UP'
      ),
      consolidateRow(
        'inadimplencia',
        'Taxa de Inadimplência (%)',
        'Percentual da carteira a receber vencida em relação ao total a receber da competência.',
        'Risco',
        'PERCENT',
        delinquencyRateByMonth,
        'AVERAGE',
        'DOWN'
      ),
      consolidateRow(
        'contas_receber_aberto',
        'A Receber em Aberto',
        'Volume total de títulos e faturas pendentes de liquidação na carteira de cobrança.',
        'Comercial',
        'CURRENCY',
        openReceivablesByMonth,
        'SUM',
        'UP'
      ),
      consolidateRow(
        'contas_pagar_aberto',
        'A Pagar em Aberto',
        'Compromissos, fornecedores e contas com vencimento a quitar no período.',
        'Caixa',
        'CURRENCY',
        openPayablesByMonth,
        'SUM',
        'DOWN'
      )
    ];
  }

  /**
   * Formata o valor de um KPI conforme a tipagem definida
   */
  public static formatValue(val: number, format: KpiFormat): string {
    if (val === 0) return format === 'PERCENT' ? '0,0%' : format === 'CURRENCY' ? 'R$ 0,00' : '0';

    if (format === 'CURRENCY') {
      return formatBRL(val);
    }
    if (format === 'PERCENT') {
      return `${val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }
    if (format === 'INTEGER') {
      return Math.round(val).toLocaleString('pt-BR');
    }
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
}
