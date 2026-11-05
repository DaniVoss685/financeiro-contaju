import { 
  FinancialTitle, 
  Sale,
  Settlement, 
  FinancialMovement, 
  BankAccount, 
  Contract, 
  AuditLogEntry, 
  StatementEntry,
  ChartAccount,
  TitleSettlementState,
  CreditCard,
  CreditCardPurchase,
  CreditCardInvoicePayment,
  CashCountRecord,
  AnnualBalanceFeeConfig,
  DueDayRule
} from '../types';
import { storage } from './storageService';

export const formatBRL = (amount: number): string => {
  const safeAmount = (typeof amount === 'number' && !isNaN(amount) && isFinite(amount)) ? amount : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
};

export const parseBRL = (str: string): number => {
  if (!str) return 0;
  const clean = str.replace(/[^\d,-]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
};

export const formatDateBR = (dateStr: string): string => {
  if (!dateStr) return '-';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

export const getMonthName = (monthStr: string): string => {
  const months: Record<string, string> = {
    '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
    '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
    '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
  };
  return months[monthStr] || monthStr;
};

export const formatCompetence = (comp: string): string => {
  if (!comp) return '-';
  const [year, month] = comp.split('-');
  return `${getMonthName(month)}/${year}`;
};

/**
 * Calcula com precisão a data de vencimento da Taxa de Balanço Anual respeitando:
 * 1. Data específica fixa configurada (SPECIFIC_DATE)
 * 2. Vencimento na própria competência (SAME_MONTH) ou no mês subsequente (NEXT_MONTH)
 * 3. Dia de vencimento específico da taxa ou do contrato
 */
export const calculateBalanceFeeDueDate = (
  balanceFee: AnnualBalanceFeeConfig | undefined,
  contractDueDay: number,
  contractDueRule: DueDayRule | undefined,
  competence: string // 'YYYY-MM'
): string => {
  if (!balanceFee) {
    const [cYear, cMonth] = competence.split('-').map(Number);
    const day = Math.min(contractDueDay || 10, new Date(cYear, cMonth, 0).getDate());
    return `${cYear}-${String(cMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // 1. Data fixa específica
  if (balanceFee.dueRule === 'SPECIFIC_DATE' && balanceFee.specificDueDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(balanceFee.specificDueDate)) {
      return balanceFee.specificDueDate;
    }
  }

  const [compYearStr, compMonthStr] = competence.split('-');
  const compYear = parseInt(compYearStr, 10);
  const compMonth = parseInt(compMonthStr, 10);

  // 2. Regra de vencimento:
  // Se explicitamente 'SAME_MONTH': vence no próprio mês da competência!
  // Se explicitamente 'NEXT_MONTH': vence no mês seguinte!
  // Se não definido: assume 'SAME_MONTH' (dentro da própria competência)
  const feeRule = balanceFee.dueRule || 'SAME_MONTH';

  let targetYear = compYear;
  let targetMonth = compMonth;

  if (feeRule === 'NEXT_MONTH') {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }

  const feeDueDay = balanceFee.dueDay || contractDueDay || 10;
  const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
  const actualDueDay = Math.min(feeDueDay, lastDayOfMonth);

  const monthFormatted = String(targetMonth).padStart(2, '0');
  const dayFormatted = String(actualDueDay).padStart(2, '0');

  return `${targetYear}-${monthFormatted}-${dayFormatted}`;
};

export type TemporalStatus = 'A_VENCER' | 'VENCE_HOJE' | 'VENCIDO' | 'QUITADO';

export interface ContractGenerationProgressState {
  percent: number;
  stage: string;
  currentMonth: string;
  processed: number;
  total: number;
  currentContract?: string;
}

export type ContractGenerationProgressCallback = (state: ContractGenerationProgressState) => void;

export interface BatchBillingProgressState {
  percent: number;
  stage: string;
  currentContractNumber: string;
  currentCustomerName: string;
  processedContracts: number;
  totalContracts: number;
  totalGenerated: number;
  totalUpdated: number;
  totalAmountGenerated: number;
}

export type BatchBillingProgressCallback = (state: BatchBillingProgressState) => void;

export const getTemporalStatus = (title?: FinancialTitle | null, referenceDateStr?: string): TemporalStatus => {
  if (!title) return 'A_VENCER';
  if (title.settlementState === 'LIQUIDADO') {
    return 'QUITADO';
  }
  const ref = referenceDateStr || new Date().toISOString().split('T')[0];
  const due = title.dueDate || ref;
  if (due === ref) return 'VENCE_HOJE';
  if (due < ref) return 'VENCIDO';
  return 'A_VENCER';
};

export interface SettlementParams {
  titleId: string;
  settlementDate: string; // YYYY-MM-DD
  bankAccountId: string;
  principalSettled: number;
  discount: number;
  interest: number;
  fine: number;
  bankFee: number;
  notes?: string;
  voucherRef?: string;
}

export class FinancialEngine {
  /**
   * Check if date is in closed period
   */
  public static isPeriodClosed(yearMonth: string): boolean {
    const closures = storage.getPeriodClosures();
    return closures.some(c => c.yearMonth === yearMonth && c.isClosed);
  }

  /**
   * Divisão canônica de valor financeiro em parcelas exatas sem perda de centavos (IEEE 754 precision)
   * Garante que a soma das parcelas retornadas seja 100% igual ao totalAmount original.
   */
  public static splitInstallments(totalAmount: number, count: number): number[] {
    if (count <= 1) return [Math.round(totalAmount * 100) / 100];
    
    const totalCents = Math.round(totalAmount * 100);
    const baseCentsPerInstallment = Math.floor(totalCents / count);
    const remainderCents = totalCents - (baseCentsPerInstallment * count);

    const installments: number[] = [];
    for (let i = 0; i < count; i++) {
      const cents = i < remainderCents ? baseCentsPerInstallment + 1 : baseCentsPerInstallment;
      installments.push(cents / 100);
    }
    return installments;
  }

  /**
   * Calculate effective bank balance
   * Saldo = Saldo Inicial + Entradas Efetivas - Saídas Efetivas
   */
  public static getAccountBalance(bankAccountId: string, upToDate?: string): number {
    const accounts = storage.getBankAccounts();
    const account = accounts.find(a => a.id === bankAccountId);
    if (!account) return 0;

    const movements = storage.getMovements().filter(m => {
      if (m.bankAccountId !== bankAccountId || m.isReversed) return false;
      if (upToDate && m.date > upToDate) return false;
      return true;
    });

    let balance = account.initialBalance;
    for (const mov of movements) {
      if (mov.direction === 'ENTRADA') {
        balance += mov.amount;
      } else {
        balance -= mov.amount;
      }
    }
    return Math.round(balance * 100) / 100;
  }

  /**
   * Alias for getAccountBalance for consistent component ergonomics
   */
  public static calculateAccountBalance(bankAccountId: string, upToDate?: string): number {
    return FinancialEngine.getAccountBalance(bankAccountId, upToDate);
  }

  /**
   * Recalculates and refreshes account balance snapshots (balances are dynamic)
   */
  public static recalculateAllAccountBalances(): void {
    // Balances are computed dynamically on-the-fly via getAccountBalance
  }

  /**
   * Calculate consolidated cash balance for all included accounts
   */
  public static getConsolidatedCashBalance(upToDate?: string): number {
    const accounts = storage.getBankAccounts().filter(a => a.includeInCashFlow && a.status === 'ATIVO');
    return accounts.reduce((acc, a) => acc + this.getAccountBalance(a.id, upToDate), 0);
  }

  /**
   * POST A SETTLEMENT (BAIXA DE TÍTULO)
   * Implements strict formula from Prompt Item 11:
   * Valor financeiro = principal - desconto + juros + multa (- bankFee se receber)
   * Saldo principal = originalAmount - soma_principais_baixados
   */
  public static postSettlement(params: SettlementParams): { success: boolean; message: string; settlement?: Settlement } {
    const titles = storage.getTitles();
    const titleIndex = titles.findIndex(t => t.id === params.titleId);
    if (titleIndex === -1) {
      return { success: false, message: 'Título financeiro não encontrado.' };
    }
    const title = titles[titleIndex];

    // Period closure validation
    const competence = title.competence;
    const settlementMonth = params.settlementDate.substring(0, 7);
    if (this.isPeriodClosed(competence) || this.isPeriodClosed(settlementMonth)) {
      return { success: false, message: `O período financeiro ${competence} ou ${settlementMonth} encontra-se encerrado para alterações.` };
    }

    // Date validation: no future effective dates
    const today = new Date().toISOString().split('T')[0];
    if (params.settlementDate > today) {
      return { success: false, message: 'Data efetiva não pode ser futura. Para agendamento, utilize a data prevista.' };
    }

    const discount = Number(params.discount) || 0;
    const interest = Number(params.interest) || 0;
    const fine = Number(params.fine) || 0;
    const bankFee = Number(params.bankFee) || 0;
    const principalSettled = Number(params.principalSettled) || 0;

    // Number validations
    if (principalSettled <= 0) {
      return { success: false, message: 'O principal baixado deve ser superior a zero.' };
    }
    if (discount > principalSettled) {
      return { success: false, message: 'O desconto não pode ser superior ao principal baixado.' };
    }
    if (principalSettled > title.balancePrincipal + 0.001) {
      return { 
        success: false, 
        message: `Principal baixado (${formatBRL(principalSettled)}) não pode exceder o saldo restante (${formatBRL(title.balancePrincipal)}).` 
      };
    }

    const currentUser = storage.getCurrentUser();
    if (currentUser.role === 'CONSULTA') {
      return { success: false, message: 'Perfil de Consulta não possui permissão para realizar baixas.' };
    }

    // Formula execution
    // Net cash movement
    let netFinancialAmount = 0;
    if (title.type === 'RECEBER') {
      netFinancialAmount = principalSettled - discount + interest + fine - bankFee;
    } else {
      netFinancialAmount = principalSettled - discount + interest + fine + bankFee;
    }
    netFinancialAmount = Math.round(netFinancialAmount * 100) / 100;

    const newSettledPrincipal = Math.round((title.settledPrincipal + principalSettled) * 100) / 100;
    const newBalancePrincipal = Math.round((title.originalAmount - newSettledPrincipal) * 100) / 100;
    
    let newSettlementState: TitleSettlementState = 'PARCIAL';
    if (newBalancePrincipal <= 0.005) {
      newSettlementState = 'LIQUIDADO';
    }

    const settlementId = `set-${Date.now()}`;
    const newSettlement: Settlement = {
      id: settlementId,
      titleId: title.id,
      settlementNumber: `BX-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`,
      settlementDate: params.settlementDate,
      bankAccountId: params.bankAccountId,
      components: {
        principalSettled,
        discount,
        interest,
        fine,
        bankFee,
        netFinancialAmount
      },
      notes: params.notes,
      voucherRef: params.voucherRef,
      isReversed: false,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
    };

    // Update title
    const updatedTitle: FinancialTitle = {
      ...title,
      settledPrincipal: newSettledPrincipal,
      balancePrincipal: Math.max(0, newBalancePrincipal),
      settlementState: newSettlementState,
      updatedAt: new Date().toISOString()
    };
    titles[titleIndex] = updatedTitle;
    storage.saveTitles(titles);

    // Add settlement
    const settlements = storage.getSettlements();
    storage.saveSettlements([newSettlement, ...settlements]);

    // Create Bank Movements
    const movements = storage.getMovements();
    const newMovements: FinancialMovement[] = [];

    if (title.type === 'RECEBER') {
      const grossSettlementAmount = Math.round((principalSettled - discount + interest + fine) * 100) / 100;
      
      // Main inflow movement (gross receipt before bank fee deduction)
      if (grossSettlementAmount > 0) {
        newMovements.push({
          id: `mov-${Date.now()}-1`,
          bankAccountId: params.bankAccountId,
          date: params.settlementDate,
          direction: 'ENTRADA',
          amount: grossSettlementAmount,
          originType: 'BAIXA_TITULO',
          originReferenceId: settlementId,
          description: `Baixa ${title.titleNumber} - ${title.description}`,
          counterpartyId: title.counterpartyId,
          accountId: title.accountId,
          cashFlowCategory: 'OPERACIONAL',
          createdAt: new Date().toISOString()
        });
      }

      // Bank fee retained by bank (outflow expense, ensuring net bank balance matches netFinancialAmount exactly)
      if (bankFee > 0) {
        newMovements.push({
          id: `mov-${Date.now()}-fee`,
          bankAccountId: params.bankAccountId,
          date: params.settlementDate,
          direction: 'SAIDA',
          amount: bankFee,
          originType: 'BAIXA_TITULO',
          originReferenceId: settlementId,
          description: `Tarifa bancária retida - Tit. ${title.titleNumber}`,
          accountId: 'acc-4.2.04', // Tarifas Bancárias
          cashFlowCategory: 'OPERACIONAL',
          createdAt: new Date().toISOString()
        });
      }
    } else {
      // PAGAR
      const grossPaymentAmount = Math.round((principalSettled - discount + interest + fine) * 100) / 100;

      if (bankFee > 0) {
        // Outflow for title principal/components
        if (grossPaymentAmount > 0) {
          newMovements.push({
            id: `mov-${Date.now()}-1`,
            bankAccountId: params.bankAccountId,
            date: params.settlementDate,
            direction: 'SAIDA',
            amount: grossPaymentAmount,
            originType: 'BAIXA_TITULO',
            originReferenceId: settlementId,
            description: `Pagamento ${title.titleNumber} - ${title.description}`,
            counterpartyId: title.counterpartyId,
            accountId: title.accountId,
            cashFlowCategory: 'OPERACIONAL',
            createdAt: new Date().toISOString()
          });
        }
        // Outflow for bank fee
        newMovements.push({
          id: `mov-${Date.now()}-fee`,
          bankAccountId: params.bankAccountId,
          date: params.settlementDate,
          direction: 'SAIDA',
          amount: bankFee,
          originType: 'BAIXA_TITULO',
          originReferenceId: settlementId,
          description: `Tarifa bancária de liquidação - Tit. ${title.titleNumber}`,
          accountId: 'acc-4.2.04', // Tarifas Bancárias
          cashFlowCategory: 'OPERACIONAL',
          createdAt: new Date().toISOString()
        });
      } else if (netFinancialAmount > 0) {
        newMovements.push({
          id: `mov-${Date.now()}-1`,
          bankAccountId: params.bankAccountId,
          date: params.settlementDate,
          direction: 'SAIDA',
          amount: netFinancialAmount,
          originType: 'BAIXA_TITULO',
          originReferenceId: settlementId,
          description: `Pagamento ${title.titleNumber} - ${title.description}`,
          counterpartyId: title.counterpartyId,
          accountId: title.accountId,
          cashFlowCategory: 'OPERACIONAL',
          createdAt: new Date().toISOString()
        });
      }
    }

    storage.saveMovements([...newMovements, ...movements]);

    // Atualizar snapshot do saldo da conta bancária
    const currentBankAccounts = storage.getBankAccounts();
    const updatedBankAccounts = currentBankAccounts.map(ba => {
      if (ba.id === params.bankAccountId) {
        return {
          ...ba,
          currentBalance: FinancialEngine.getAccountBalance(ba.id),
          updatedAt: new Date().toISOString()
        };
      }
      return ba;
    });
    storage.saveBankAccounts(updatedBankAccounts);

    // Audit log
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: newSettlementState === 'LIQUIDADO' ? 'QUITACAO_TITULO' : 'BAIXA_PARCIAL',
      module: title.type === 'RECEBER' ? 'Contas a Receber' : 'Contas a Pagar',
      recordId: title.id,
      details: `Baixa de ${formatBRL(params.principalSettled)} registrada. Valor líquido movimentado: ${formatBRL(netFinancialAmount)}. Saldo restante: ${formatBRL(newBalancePrincipal)}.`,
      previousValue: `Saldo ${formatBRL(title.balancePrincipal)} (${title.settlementState})`,
      newValue: `Saldo ${formatBRL(newBalancePrincipal)} (${newSettlementState})`
    });

    return { success: true, message: 'Baixa processada com sucesso!', settlement: newSettlement };
  }

  /**
   * REVERSE A SETTLEMENT (ESTORNO DE BAIXA)
   */
  public static reverseSettlement(settlementId: string, reason: string): { success: boolean; message: string } {
    const currentUser = storage.getCurrentUser();
    if (currentUser.role === 'CONSULTA' || currentUser.role === 'OPERADOR') {
      return { success: false, message: 'Apenas Administradores e Gestores Financeiros podem estornar baixas.' };
    }

    const settlements = storage.getSettlements();
    const setIdx = settlements.findIndex(s => s.id === settlementId);
    if (setIdx === -1) return { success: false, message: 'Baixa não encontrada.' };
    const settlement = settlements[setIdx];

    if (settlement.isReversed) {
      return { success: false, message: 'Esta baixa já foi estornada anteriormente.' };
    }

    const titles = storage.getTitles();
    const titleIdx = titles.findIndex(t => t.id === settlement.titleId);
    if (titleIdx === -1) return { success: false, message: 'Título original não encontrado.' };
    const title = titles[titleIdx];

    // Period closure check
    const competence = title.competence;
    if (this.isPeriodClosed(competence) || this.isPeriodClosed(settlement.settlementDate.substring(0, 7))) {
      return { success: false, message: 'Período contábil fechado. Não é permitido estorno em períodos encerrados.' };
    }

    // Reconstitute title balance
    const restoredSettled = Math.max(0, title.settledPrincipal - settlement.components.principalSettled);
    const restoredBalance = Math.min(title.originalAmount, title.balancePrincipal + settlement.components.principalSettled);
    let newSettlementState: TitleSettlementState = 'PARCIAL';
    if (restoredBalance >= title.originalAmount - 0.005) {
      newSettlementState = 'ABERTO';
    }

    titles[titleIdx] = {
      ...title,
      settledPrincipal: Math.round(restoredSettled * 100) / 100,
      balancePrincipal: Math.round(restoredBalance * 100) / 100,
      settlementState: newSettlementState,
      updatedAt: new Date().toISOString()
    };
    storage.saveTitles(titles);

    // Mark settlement as reversed
    settlements[setIdx] = {
      ...settlement,
      isReversed: true,
      reversedAt: new Date().toISOString(),
      reversedBy: currentUser.name,
      reversalReason: reason
    };
    storage.saveSettlements(settlements);

    // Reverse bank movements
    const movements = storage.getMovements();
    const updatedMovements = movements.map(m => {
      if (m.originReferenceId === settlementId) {
        return { ...m, isReversed: true };
      }
      return m;
    });
    storage.saveMovements(updatedMovements);

    // Unlink any reconciled statement entries
    const stmts = storage.getStatementEntries();
    const updatedStmts = stmts.map(s => {
      if (s.matchedTitleId === title.id) {
        return { ...s, reconciliationStatus: 'PENDENTE' as const, matchedMovementId: undefined, matchedTitleId: undefined };
      }
      return s;
    });
    storage.saveStatementEntries(updatedStmts);

    // Audit log
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'ESTORNO_BAIXA',
      module: title.type === 'RECEBER' ? 'Contas a Receber' : 'Contas a Pagar',
      recordId: title.id,
      details: `Estorno da baixa ${settlement.settlementNumber} no valor de ${formatBRL(settlement.components.principalSettled)}. Motivo: ${reason}. Saldo reconstituído para ${formatBRL(restoredBalance)}.`,
      previousValue: `Saldo ${formatBRL(title.balancePrincipal)} (${title.settlementState})`,
      newValue: `Saldo ${formatBRL(restoredBalance)} (${newSettlementState})`
    });

    return { success: true, message: 'Estorno realizado com sucesso!' };
  }

  /**
   * REABRIR TÍTULO PARA EM ABERTO (Individual)
   * Estorna todas as liquidações do título, desvincula/reverte o saldo bancário da conta
   * e restabelece o título com saldo integral em aberto de acordo com a data de vencimento.
   */
  public static reopenTitleToOpen(titleId: string, reason?: string): { 
    success: boolean; 
    message: string; 
    reversedSettlementsCount: number;
    title?: FinancialTitle;
  } {
    const res = this.reopenTitlesToOpenBatch([titleId], reason);
    return {
      success: res.success,
      message: res.message,
      reversedSettlementsCount: res.reversedSettlementsCount,
      title: res.reopenedTitles[0]
    };
  }

  /**
   * REABRIR TÍTULOS PARA EM ABERTO EM LOTE (Batch)
   * Estorna em massa os pagamentos ou recebimentos dos títulos informados,
   * desvinculando movimentações e saldos bancários com integridade contábil atômica.
   */
  public static reopenTitlesToOpenBatch(titleIds: string[], reason?: string): {
    success: boolean;
    message: string;
    reopenedCount: number;
    reversedSettlementsCount: number;
    reopenedTitles: FinancialTitle[];
    errors: string[];
  } {
    if (!titleIds || titleIds.length === 0) {
      return {
        success: false,
        message: 'Nenhum título informado para reabertura.',
        reopenedCount: 0,
        reversedSettlementsCount: 0,
        reopenedTitles: [],
        errors: ['Nenhum ID informado.']
      };
    }

    const currentUser = storage.getCurrentUser();
    if (currentUser.role === 'CONSULTA') {
      return {
        success: false,
        message: 'Perfil de Consulta não possui permissão para reabrir títulos.',
        reopenedCount: 0,
        reversedSettlementsCount: 0,
        reopenedTitles: [],
        errors: ['Permissão insuficiente.']
      };
    }

    const titles = storage.getTitles();
    const settlements = storage.getSettlements();
    const bankAccounts = storage.getBankAccounts();
    const movements = storage.getMovements();
    const statementEntries = storage.getStatementEntries();

    const titleIdSet = new Set(titleIds);
    const targetTitles = titles.filter(t => titleIdSet.has(t.id));

    if (targetTitles.length === 0) {
      return {
        success: false,
        message: 'Nenhum dos títulos selecionados foi localizado.',
        reopenedCount: 0,
        reversedSettlementsCount: 0,
        reopenedTitles: [],
        errors: ['Títulos não localizados.']
      };
    }

    // Verifica fechamento de período contábil
    const closedPeriodErrors: string[] = [];
    targetTitles.forEach(t => {
      if (this.isPeriodClosed(t.competence)) {
        closedPeriodErrors.push(`O título ${t.titleNumber} pertence à competência ${t.competence} que está encerrada.`);
      }
    });

    if (closedPeriodErrors.length > 0 && closedPeriodErrors.length === targetTitles.length) {
      return {
        success: false,
        message: 'Todos os títulos selecionados pertencem a períodos contábeis encerrados.',
        reopenedCount: 0,
        reversedSettlementsCount: 0,
        reopenedTitles: [],
        errors: closedPeriodErrors
      };
    }

    const validTitlesToReopen = targetTitles.filter(t => !this.isPeriodClosed(t.competence));
    const validTitleIdsSet = new Set(validTitlesToReopen.map(t => t.id));

    // Identifica baixas ativas vinculadas
    const activeLinkedSettlements = settlements.filter(s => validTitleIdsSet.has(s.titleId) && !s.isReversed);
    const linkedSettlementIds = new Set(activeLinkedSettlements.map(s => s.id));

    const defaultReason = reason || 'Reabertura de pagamento/recebimento para Em Aberto';
    const nowIso = new Date().toISOString();

    // 1. Marcar movimentos bancários vinculados como estornados
    const updatedMovements = movements.map(m => {
      if (m.originReferenceId && linkedSettlementIds.has(m.originReferenceId)) {
        return { ...m, isReversed: true };
      }
      return m;
    });
    storage.saveMovements(updatedMovements);

    // 2. Atualizar Contas Bancárias (Desvincular e estornar saldo bancário)
    const updatedBankAccounts = bankAccounts.map(ba => {
      return {
        ...ba,
        currentBalance: FinancialEngine.getAccountBalance(ba.id),
        updatedAt: nowIso
      };
    });
    storage.saveBankAccounts(updatedBankAccounts);

    // 3. Marcar baixas como estornadas
    const updatedSettlements = settlements.map(s => {
      if (linkedSettlementIds.has(s.id)) {
        return {
          ...s,
          isReversed: true,
          reversedAt: nowIso,
          reversedBy: currentUser.name,
          reversalReason: defaultReason
        };
      }
      return s;
    });

    // 4. Desvincular extratos bancários conciliados
    const updatedStatements = statementEntries.map(stmt => {
      if (stmt.matchedTitleId && validTitleIdsSet.has(stmt.matchedTitleId)) {
        return {
          ...stmt,
          reconciliationStatus: 'PENDENTE' as const,
          matchedMovementId: undefined,
          matchedTitleId: undefined
        };
      }
      return stmt;
    });

    // 5. Restaurar os títulos para EM ABERTO com saldo total
    const reopenedTitles: FinancialTitle[] = [];
    const updatedTitles = titles.map(t => {
      if (validTitleIdsSet.has(t.id)) {
        const restored: FinancialTitle = {
          ...t,
          settledPrincipal: 0,
          balancePrincipal: t.originalAmount,
          settlementState: 'ABERTO',
          accruedInterest: 0,
          accruedFine: 0,
          updatedAt: nowIso
        };
        reopenedTitles.push(restored);
        return restored;
      }
      return t;
    });

    // Salvar restantes das estruturas no storage
    storage.saveSettlements(updatedSettlements);
    storage.saveStatementEntries(updatedStatements);
    storage.saveTitles(updatedTitles);

    // 6. Auditoria
    reopenedTitles.forEach(t => {
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'REABERTURA_TITULO_EM_ABERTO',
        module: t.type === 'RECEBER' ? 'Contas a Receber' : 'Contas a Pagar',
        recordId: t.titleNumber,
        details: `Título ${t.titleNumber} (${t.description}) voltou para EM ABERTO. Saldo restaurado para ${formatBRL(t.originalAmount)}. Data de vencimento: ${t.dueDate}. Saldo bancário desvinculado e estornado. Motivo: ${defaultReason}.`,
        previousValue: 'Quitado / Parcial',
        newValue: `Saldo ${formatBRL(t.originalAmount)} (ABERTO)`
      });
    });

    const isPlural = reopenedTitles.length > 1;
    const msg = isPlural
      ? `✓ ${reopenedTitles.length} títulos voltaram para EM ABERTO com sucesso! ${activeLinkedSettlements.length} baixa(s) estornada(s) e saldos bancários atualizados.`
      : `✓ O título ${reopenedTitles[0]?.titleNumber} voltou para EM ABERTO com sucesso! Saldo bancário desvinculado.`;

    return {
      success: true,
      message: msg,
      reopenedCount: reopenedTitles.length,
      reversedSettlementsCount: activeLinkedSettlements.length,
      reopenedTitles,
      errors: closedPeriodErrors
    };
  }

  /**
   * POST AN INTER-ACCOUNT TRANSFER (TRANSFERÊNCIA BANCÁRIA)
   * Generates atomic pair of movements (Outflow from origin, Inflow into destination)
   */
  public static postTransfer(params: {
    originAccountId: string;
    destinationAccountId: string;
    amount: number;
    date: string;
    feeAmount?: number;
    notes?: string;
  }): { success: boolean; message: string } {
    if (params.originAccountId === params.destinationAccountId) {
      return { success: false, message: 'A conta de origem e destino não podem ser iguais.' };
    }
    if (params.amount <= 0) {
      return { success: false, message: 'O valor da transferência deve ser positivo.' };
    }

    const today = new Date().toISOString().split('T')[0];
    if (params.date > today) {
      return { success: false, message: 'Data da transferência não pode ser futura.' };
    }

    const accounts = storage.getBankAccounts();
    const origin = accounts.find(a => a.id === params.originAccountId);
    const dest = accounts.find(a => a.id === params.destinationAccountId);
    if (!origin || !dest) {
      return { success: false, message: 'Contas bancárias não encontradas.' };
    }

    const transferId = `transf-${Date.now()}`;
    const movements = storage.getMovements();
    const newMovements: FinancialMovement[] = [
      // Outflow from origin
      {
        id: `mov-${Date.now()}-out`,
        bankAccountId: params.originAccountId,
        date: params.date,
        direction: 'SAIDA',
        amount: params.amount,
        originType: 'TRANSFERENCIA',
        originReferenceId: transferId,
        description: `Transferência enviada para ${dest.name} - ${params.notes || ''}`,
        cashFlowCategory: 'TRANSFERENCIA_INTERNA',
        createdAt: new Date().toISOString()
      },
      // Inflow to destination
      {
        id: `mov-${Date.now()}-in`,
        bankAccountId: params.destinationAccountId,
        date: params.date,
        direction: 'ENTRADA',
        amount: params.amount,
        originType: 'TRANSFERENCIA',
        originReferenceId: transferId,
        description: `Transferência recebida de ${origin.name} - ${params.notes || ''}`,
        cashFlowCategory: 'TRANSFERENCIA_INTERNA',
        createdAt: new Date().toISOString()
      }
    ];

    if (params.feeAmount && params.feeAmount > 0) {
      newMovements.push({
        id: `mov-${Date.now()}-fee`,
        bankAccountId: params.originAccountId,
        date: params.date,
        direction: 'SAIDA',
        amount: params.feeAmount,
        originType: 'OPERACAO_DIRETA',
        originReferenceId: transferId,
        description: `Tarifa de transferência DOC/TED para ${dest.name}`,
        accountId: 'acc-4.2.04',
        cashFlowCategory: 'OPERACIONAL',
        createdAt: new Date().toISOString()
      });
    }

    storage.saveMovements([...newMovements, ...movements]);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TRANSFERENCIA_BANCARIA',
      module: 'Bancos e Contas',
      recordId: transferId,
      details: `Transferência de ${formatBRL(params.amount)} de ${origin.name} para ${dest.name}.`
    });

    return { success: true, message: 'Transferência concluída com sucesso!' };
  }

  /**
   * GENERATE MONTHLY CONTRACT BILLINGS (FATURAMENTO DE CONTRATOS)
   * Idempotent generation for a given competence (e.g. '2026-09')
   */
  public static generateContractBilling(competence: string): {
    generatedCount: number;
    alreadyExistingCount: number;
    ignoredCount: number;
    totalAmountGenerated: number;
    results: Array<{ contract: Contract; title?: FinancialTitle; status: 'GERADO' | 'JA_EXISTE' | 'IGNORADO' }>;
  } {
    const contracts = storage.getContracts().filter(c => 
      c.status === 'ATIVO' && 
      c.isRecurring !== false && 
      c.contractType !== 'AVULSO'
    );
    const titles = storage.getTitles();
    const counterparties = storage.getCounterparties();

    let generatedCount = 0;
    let alreadyExistingCount = 0;
    let ignoredCount = 0;
    let totalAmountGenerated = 0;
    const results: Array<{ contract: Contract; title?: FinancialTitle; status: 'GERADO' | 'JA_EXISTE' | 'IGNORADO' }> = [];
    const newTitles: FinancialTitle[] = [];

    const [compYearStr, compMonthStr] = competence.split('-');
    const compYear = parseInt(compYearStr, 10);
    const compMonth = parseInt(compMonthStr, 10);
    const compMonthFormatted = compMonth.toString().padStart(2, '0');

    for (const contract of contracts) {
      const statusNorm = String(contract.status || '').toUpperCase();
      // Ignorar contratos cancelados, inativos ou suspensos
      if (statusNorm !== 'ATIVO') {
        ignoredCount++;
        results.push({ contract, status: 'IGNORADO' });
        continue;
      }

      // Check contract start and end dates
      if (contract.startDate && contract.startDate.substring(0, 7) > competence) {
        ignoredCount++;
        results.push({ contract, status: 'IGNORADO' });
        continue;
      }
      if (contract.endDate && contract.endDate.substring(0, 7) < competence) {
        ignoredCount++;
        results.push({ contract, status: 'IGNORADO' });
        continue;
      }

      // Calculate dueDate based on dueRule
      let dueYear = compYear;
      let dueMonth = compMonth;
      if (contract.dueRule === 'NEXT_MONTH') {
        dueMonth += 1;
        if (dueMonth > 12) {
          dueMonth = 1;
          dueYear += 1;
        }
      }

      // Safe day of month (handle 29, 30, 31)
      const lastDayOfMonth = new Date(dueYear, dueMonth, 0).getDate();
      const actualDueDay = Math.min(contract.dueDay, lastDayOfMonth);
      const dueDayFormatted = actualDueDay.toString().padStart(2, '0');
      const dueMonthFormatted = dueMonth.toString().padStart(2, '0');
      const dueDate = `${dueYear}-${dueMonthFormatted}-${dueDayFormatted}`;

      const client = counterparties.find(c => c.id === contract.customerId);
      const clientName = client ? client.name : 'Cliente';
      const rawAcc = contract.items?.[0]?.accountId;
      const mainAccountId = (rawAcc === 'acc-rec-01' || !rawAcc) ? 'acc-1.1.01' : rawAcc;

      // 1. Mensalidade Ordinária Recorrente
      const titleNumber = `FAT-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;
      const existing = titles.find(t => 
        (t.originType === 'CONTRATO' || t.originType === 'VENDA') && 
        (t.originId === contract.id || t.contractId === contract.id || t.contractNumber === contract.contractNumber || t.originId === contract.contractNumber) && 
        t.competence === competence &&
        (t.titleNumber === titleNumber || !t.titleNumber.startsWith('TB-')) &&
        t.documentState !== 'CANCELADO'
      );

      if (existing) {
        alreadyExistingCount++;
        results.push({ contract, title: existing, status: 'JA_EXISTE' });
      } else {
        const saleId = `sale-${contract.id}-${competence}`;
        const saleNumber = `VEN-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;
        const newTitleId = `tit-fat-${Date.now()}-${contract.id}`;

        const newTitle: FinancialTitle = {
          id: newTitleId,
          companyId: 'comp-1',
          type: 'RECEBER',
          titleNumber,
          counterpartyId: contract.customerId,
          description: `Mensalidade ${contract.description} - Comp. ${compMonthFormatted}/${compYear}`,
          accountId: mainAccountId,
          launchDate: new Date().toISOString().split('T')[0],
          competence,
          issueDate: new Date().toISOString().split('T')[0],
          dueDate,
          expectedCashDate: dueDate,
          originalAmount: contract.monthlyTotal,
          settledPrincipal: 0,
          balancePrincipal: contract.monthlyTotal,
          accruedInterest: 0,
          accruedFine: 0,
          documentState: 'CONFIRMADO',
          settlementState: 'ABERTO',
          originType: 'CONTRATO',
          originId: contract.id,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          saleId: saleId,
          saleNumber: saleNumber,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: `Gerado automaticamente via Faturamento de Contratos (Venda ${saleNumber}).`
        };

        const newSale: Sale = {
          id: saleId,
          saleNumber,
          customerId: contract.customerId,
          competence,
          date: new Date().toISOString().split('T')[0],
          items: (contract.items && contract.items.length > 0) ? contract.items.map(it => ({
            id: `item-${newTitleId}-${it.id}`,
            serviceId: it.serviceId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: 0,
            total: it.total,
            accountId: it.accountId
          })) : [
            {
              id: `item-${newTitleId}`,
              serviceId: 'srv-1',
              description: `Mensalidade ${contract.description}`,
              quantity: 1,
              unitPrice: contract.monthlyTotal,
              discount: 0,
              total: contract.monthlyTotal,
              accountId: mainAccountId
            }
          ],
          grossTotal: contract.monthlyTotal,
          discountTotal: 0,
          netTotal: contract.monthlyTotal,
          installmentsCount: 1,
          notes: `Faturamento recorrente do Contrato ${contract.contractNumber}`,
          createdAt: new Date().toISOString(),
          originType: 'CONTRATO',
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          status: 'CONFIRMADA',
          titleIds: [newTitleId]
        };
        storage.addSale(newSale);

        newTitles.push(newTitle);
        generatedCount++;
        totalAmountGenerated += contract.monthlyTotal;
        results.push({ contract, title: newTitle, status: 'GERADO' });

        // Update contract's lastGeneratedCompetence
        contract.lastGeneratedCompetence = competence;
      }

      // 2. Taxa de Balanço Anual (13º Honorário Contábil)
      if (
        contract.annualBalanceFee && 
        contract.annualBalanceFee.enabled && 
        contract.annualBalanceFee.amount > 0 &&
        Array.isArray(contract.annualBalanceFee.billingMonths) &&
        contract.annualBalanceFee.billingMonths.includes(compMonth)
      ) {
        const totalInstallments = contract.annualBalanceFee.billingMonths.length || 1;
        const currentInstallmentIndex = contract.annualBalanceFee.billingMonths.indexOf(compMonth) + 1;
        
        // Cálculo da parcela com compensação de centavos na última
        const baseInstallmentAmount = Math.round((contract.annualBalanceFee.amount / totalInstallments) * 100) / 100;
        const isLastInstallment = currentInstallmentIndex === totalInstallments;
        const installmentAmount = isLastInstallment 
          ? Math.round((contract.annualBalanceFee.amount - baseInstallmentAmount * (totalInstallments - 1)) * 100) / 100
          : baseInstallmentAmount;

        const balanceFeeTitleNumber = `TB-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;

        const existingBalanceFee = titles.find(t => 
          t.originType === 'CONTRATO' && 
          t.originId === contract.id && 
          t.competence === competence &&
          (t.titleNumber === balanceFeeTitleNumber || t.titleNumber.startsWith(`TB-${competence}`)) &&
          t.documentState !== 'CANCELADO'
        );

        if (!existingBalanceFee) {
          const feeDueDate = calculateBalanceFeeDueDate(contract.annualBalanceFee, contract.dueDay, contract.dueRule, competence);

          const newBalanceFeeTitle: FinancialTitle = {
            id: `tit-tb-${Date.now()}-${contract.id}-${compMonth}`,
            companyId: 'comp-1',
            type: 'RECEBER',
            titleNumber: balanceFeeTitleNumber,
            counterpartyId: contract.customerId,
            description: `Taxa de Balanço Anual (Parc. ${currentInstallmentIndex}/${totalInstallments}) - Contrato ${contract.contractNumber}`,
            accountId: mainAccountId,
            launchDate: new Date().toISOString().split('T')[0],
            competence,
            issueDate: new Date().toISOString().split('T')[0],
            dueDate: feeDueDate,
            expectedCashDate: feeDueDate,
            originalAmount: installmentAmount,
            settledPrincipal: 0,
            balancePrincipal: installmentAmount,
            accruedInterest: 0,
            accruedFine: 0,
            documentState: 'CONFIRMADO',
            settlementState: 'ABERTO',
            originType: 'CONTRATO',
            originId: contract.id,
            installmentIndex: currentInstallmentIndex,
            totalInstallments: totalInstallments,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            notes: `Gerado automaticamente referente à Taxa de Balanço Anual (${currentInstallmentIndex}ª parcela de ${totalInstallments}).`
          };

          newTitles.push(newBalanceFeeTitle);
          generatedCount++;
          totalAmountGenerated += installmentAmount;
          results.push({ contract, title: newBalanceFeeTitle, status: 'GERADO' });
        }
      }
    }

    if (newTitles.length > 0) {
      storage.saveTitles([...newTitles, ...titles]);
      storage.saveContracts(contracts);

      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'GERACAO_FATURAMENTO_CONTRATOS',
        module: 'Comercial & Faturamento',
        recordId: competence,
        details: `Geração em lote para competência ${competence}: ${generatedCount} títulos gerados totalizando ${formatBRL(totalAmountGenerated)}.`
      });
    }

    return {
      generatedCount,
      alreadyExistingCount,
      ignoredCount,
      totalAmountGenerated,
      results
    };
  }

  /**
   * FATURAMENTO AUTOMÁTICO DE PRÓXIMOS MESES DO CONTRATO
   * Gera antecipadamente todos os títulos a receber futuros para a vigência do contrato
   */
  /**
   * FATURAMENTO AUTOMÁTICO DE PRÓXIMOS MESES DO CONTRATO
   * Gera antecipadamente todos os títulos a receber futuros para a vigência do contrato
   * com suporte a sincronização/atualização de parcelas em aberto existentes.
   */
  public static generateContractFutureInstallments(
    contractOrId: Contract | string,
    numberOfMonths: number = 12,
    startFromCompetence?: string,
    options?: {
      overwriteOpen?: boolean;
      updateExistingOpen?: boolean;
    }
  ): {
    generatedCount: number;
    updatedCount: number;
    alreadyExistingCount: number;
    totalAmountGenerated: number;
    competences: string[];
    titles: FinancialTitle[];
    error?: string;
  } {
    const contracts = storage.getContracts();
    const contract = typeof contractOrId === 'string'
      ? contracts.find(c => c.id === contractOrId)
      : (contracts.find(c => c.id === contractOrId.id) || contractOrId);

    if (!contract) {
      return {
        generatedCount: 0,
        updatedCount: 0,
        alreadyExistingCount: 0,
        totalAmountGenerated: 0,
        competences: [],
        titles: [],
        error: 'Contrato não encontrado.'
      };
    }

    const statusNorm = String(contract.status || '').toUpperCase();
    if (statusNorm === 'CANCELADO' || statusNorm === 'INATIVO') {
      return {
        generatedCount: 0,
        updatedCount: 0,
        alreadyExistingCount: 0,
        totalAmountGenerated: 0,
        competences: [],
        titles: [],
        error: `O contrato ${contract.contractNumber} está ${contract.status}. Reative o contrato antes de gerar novas faturas.`
      };
    }

    const currentTitles = storage.getTitles();
    const currentSales = storage.getSales();
    const rawMainAcc = contract.items?.[0]?.accountId;
    const mainAccountId = (rawMainAcc === 'acc-rec-01' || !rawMainAcc) ? 'acc-1.1.01' : rawMainAcc;

    // Determinar competência inicial
    const today = new Date();
    const currentCompStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const startComp = startFromCompetence || currentCompStr;

    const [startYear, startMonth] = startComp.split('-').map(Number);
    
    let generatedCount = 0;
    let updatedCount = 0;
    let alreadyExistingCount = 0;
    let totalAmountGenerated = 0;
    const competencesGenerated: string[] = [];
    const newTitles: FinancialTitle[] = [];
    const newSales: Sale[] = [];
    const updatedTitleMap = new Map<string, FinancialTitle>();
    const updatedSaleMap = new Map<string, Sale>();

    const nowIso = new Date().toISOString();
    const todayYmd = nowIso.split('T')[0];
    const isRecurringContract = contract.contractType !== 'AVULSO' && contract.isRecurring !== false;
    const shouldUpdateOpen = options?.updateExistingOpen || options?.overwriteOpen;

    for (let i = 0; i < numberOfMonths; i++) {
      // Calcular ano e mês da competência
      const targetDate = new Date(startYear, startMonth - 1 + i, 1);
      const cYear = targetDate.getFullYear();
      const cMonth = targetDate.getMonth() + 1;
      const cMonthFormatted = String(cMonth).padStart(2, '0');
      const competence = `${cYear}-${cMonthFormatted}`;

      // Apenas contratos avulsos (não recorrentes) respeitam corte estrito de término
      if (!isRecurringContract && contract.endDate && competence > contract.endDate.substring(0, 7)) {
        break;
      }

      // Se o contrato estiver explicitamente cancelado/inativo, respeitar corte
      const isExplicitlyCancelled = statusNorm === 'CANCELADO' || statusNorm === 'INATIVO';
      if (isExplicitlyCancelled && contract.cancellationDate && competence >= contract.cancellationDate.substring(0, 7)) {
        break;
      }

      competencesGenerated.push(competence);

      // Calcular vencimento conforme regra (SAME_MONTH ou NEXT_MONTH)
      let dueYear = cYear;
      let dueMonth = cMonth;
      if (contract.dueRule === 'NEXT_MONTH') {
        dueMonth += 1;
        if (dueMonth > 12) {
          dueMonth = 1;
          dueYear += 1;
        }
      }

      const lastDayOfMonth = new Date(dueYear, dueMonth, 0).getDate();
      const actualDueDay = Math.min(contract.dueDay || 10, lastDayOfMonth);
      const dueDayFormatted = String(actualDueDay).padStart(2, '0');
      const dueMonthFormatted = String(dueMonth).padStart(2, '0');
      const dueDate = `${dueYear}-${dueMonthFormatted}-${dueDayFormatted}`;

      const titleNumber = `FAT-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;

      // Verificar se já existe título ativo para este contrato nesta competência
      const existing = currentTitles.find(t => 
        (t.originType === 'CONTRATO' || t.originType === 'VENDA') && 
        (t.originId === contract.id || t.contractId === contract.id || t.contractNumber === contract.contractNumber || t.originId === contract.contractNumber) && 
        t.competence === competence &&
        (t.titleNumber === titleNumber || !t.titleNumber.startsWith('TB-')) &&
        t.documentState !== 'CANCELADO'
      );

      if (existing) {
        if (shouldUpdateOpen && existing.settlementState !== 'LIQUIDADO' && existing.documentState !== 'CANCELADO') {
          // Atualiza fatura em aberto com os parâmetros e valores atuais do contrato
          const oldAmount = existing.originalAmount;
          const updatedTitle: FinancialTitle = {
            ...existing,
            originalAmount: contract.monthlyTotal,
            balancePrincipal: Math.max(0, contract.monthlyTotal - (existing.settledPrincipal || 0)),
            dueDate,
            expectedCashDate: dueDate,
            updatedAt: nowIso,
            notes: `${existing.notes || ''} [Sincronizado com contrato em ${todayYmd}: de ${formatBRL(oldAmount)} para ${formatBRL(contract.monthlyTotal)}]`
          };
          updatedTitleMap.set(updatedTitle.id, updatedTitle);
          updatedCount++;
          totalAmountGenerated += contract.monthlyTotal;

          // Atualizar também venda correspondente se existir
          const linkedSale = currentSales.find(s => 
            s.id === existing.saleId || 
            (s.titleIds && s.titleIds.includes(existing.id)) ||
            (s.contractId === contract.id && s.competence === competence)
          );
          if (linkedSale) {
            updatedSaleMap.set(linkedSale.id, {
              ...linkedSale,
              grossTotal: contract.monthlyTotal,
              netTotal: contract.monthlyTotal,
              items: linkedSale.items?.map(it => ({
                ...it,
                unitPrice: contract.monthlyTotal,
                total: contract.monthlyTotal
              })) || []
            });
          }
        } else {
          alreadyExistingCount++;
        }
      } else {
        const saleId = `sale-${contract.id}-${competence}`;
        const saleNumber = `VEN-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;
        const newTitleId = `tit-fat-${Date.now()}-${contract.id}-${competence}`;

        const newTitle: FinancialTitle = {
          id: newTitleId,
          companyId: 'comp-1',
          type: 'RECEBER',
          titleNumber,
          counterpartyId: contract.customerId,
          description: `Mensalidade ${contract.description} - Comp. ${cMonthFormatted}/${cYear}`,
          accountId: mainAccountId,
          launchDate: todayYmd,
          competence,
          issueDate: todayYmd,
          dueDate,
          expectedCashDate: dueDate,
          originalAmount: contract.monthlyTotal,
          settledPrincipal: 0,
          balancePrincipal: contract.monthlyTotal,
          accruedInterest: 0,
          accruedFine: 0,
          documentState: 'CONFIRMADO',
          settlementState: 'ABERTO',
          originType: 'CONTRATO',
          originId: contract.id,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          saleId: saleId,
          saleNumber: saleNumber,
          createdAt: nowIso,
          updatedAt: nowIso,
          notes: `Faturamento recorrente automático programado (Contrato ${contract.contractNumber} • Venda ${saleNumber}).`
        };

        const newSale: Sale = {
          id: saleId,
          saleNumber,
          customerId: contract.customerId,
          competence,
          date: todayYmd,
          items: (contract.items && contract.items.length > 0) ? contract.items.map(it => ({
            id: `item-${newTitleId}-${it.id}`,
            serviceId: it.serviceId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: 0,
            total: it.total,
            accountId: (it.accountId === 'acc-rec-01' || !it.accountId) ? 'acc-1.1.01' : it.accountId
          })) : [
            {
              id: `item-${newTitleId}`,
              serviceId: 'srv-1',
              description: `Mensalidade ${contract.description}`,
              quantity: 1,
              unitPrice: contract.monthlyTotal,
              discount: 0,
              total: contract.monthlyTotal,
              accountId: mainAccountId
            }
          ],
          grossTotal: contract.monthlyTotal,
          discountTotal: 0,
          netTotal: contract.monthlyTotal,
          installmentsCount: 1,
          notes: `Faturamento recorrente do Contrato ${contract.contractNumber}`,
          createdAt: nowIso,
          originType: 'CONTRATO',
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          status: 'CONFIRMADA',
          titleIds: [newTitleId]
        };

        newTitles.push(newTitle);
        newSales.push(newSale);
        generatedCount++;
        totalAmountGenerated += contract.monthlyTotal;
      }

      // Taxa de Balanço Anual (se configurada e incluir este mês)
      if (
        contract.annualBalanceFee && 
        contract.annualBalanceFee.enabled && 
        contract.annualBalanceFee.amount > 0 &&
        Array.isArray(contract.annualBalanceFee.billingMonths) &&
        contract.annualBalanceFee.billingMonths.includes(cMonth)
      ) {
        const totalInstallments = contract.annualBalanceFee.billingMonths.length || 1;
        const currentInstallmentIndex = contract.annualBalanceFee.billingMonths.indexOf(cMonth) + 1;
        
        const baseInstallmentAmount = Math.round((contract.annualBalanceFee.amount / totalInstallments) * 100) / 100;
        const isLastInstallment = currentInstallmentIndex === totalInstallments;
        const installmentAmount = isLastInstallment 
          ? Math.round((contract.annualBalanceFee.amount - baseInstallmentAmount * (totalInstallments - 1)) * 100) / 100
          : baseInstallmentAmount;

        const balanceFeeTitleNumber = `TB-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;

        const existingBalanceFee = currentTitles.find(t => 
          t.originType === 'CONTRATO' && 
          t.originId === contract.id && 
          t.competence === competence &&
          (t.titleNumber === balanceFeeTitleNumber || t.titleNumber.startsWith(`TB-${competence}`)) &&
          t.documentState !== 'CANCELADO'
        );

        if (!existingBalanceFee) {
          const feeDueDate = calculateBalanceFeeDueDate(contract.annualBalanceFee, contract.dueDay, contract.dueRule, competence);

          const newBalanceFeeTitle: FinancialTitle = {
            id: `tit-tb-${Date.now()}-${contract.id}-${cMonth}`,
            companyId: 'comp-1',
            type: 'RECEBER',
            titleNumber: balanceFeeTitleNumber,
            counterpartyId: contract.customerId,
            description: `Taxa de Balanço Anual (Parc. ${currentInstallmentIndex}/${totalInstallments}) - Contrato ${contract.contractNumber}`,
            accountId: mainAccountId,
            launchDate: todayYmd,
            competence,
            issueDate: todayYmd,
            dueDate: feeDueDate,
            expectedCashDate: feeDueDate,
            originalAmount: installmentAmount,
            settledPrincipal: 0,
            balancePrincipal: installmentAmount,
            accruedInterest: 0,
            accruedFine: 0,
            documentState: 'CONFIRMADO',
            settlementState: 'ABERTO',
            originType: 'CONTRATO',
            originId: contract.id,
            installmentIndex: currentInstallmentIndex,
            totalInstallments: totalInstallments,
            createdAt: nowIso,
            updatedAt: nowIso,
            notes: `Taxa de Balanço Anual gerada automaticamente no faturamento do contrato.`
          };

          newTitles.push(newBalanceFeeTitle);
          generatedCount++;
          totalAmountGenerated += installmentAmount;
        } else if (shouldUpdateOpen && existingBalanceFee.settlementState !== 'LIQUIDADO') {
          // Atualizar taxa de balanço em aberto existente se solicitado
          const updatedTB: FinancialTitle = {
            ...existingBalanceFee,
            originalAmount: installmentAmount,
            balancePrincipal: Math.max(0, installmentAmount - (existingBalanceFee.settledPrincipal || 0)),
            updatedAt: nowIso
          };
          updatedTitleMap.set(updatedTB.id, updatedTB);
          updatedCount++;
          totalAmountGenerated += installmentAmount;
        }
      }
    }

    // Persistir alterações de títulos
    if (newTitles.length > 0 || updatedTitleMap.size > 0) {
      let finalTitles = [...currentTitles];
      if (updatedTitleMap.size > 0) {
        finalTitles = finalTitles.map(t => updatedTitleMap.get(t.id) || t);
      }
      if (newTitles.length > 0) {
        finalTitles = [...newTitles, ...finalTitles];
      }
      storage.saveTitles(finalTitles);

      // Persistir alterações de vendas
      if (newSales.length > 0 || updatedSaleMap.size > 0) {
        let finalSales = [...currentSales];
        if (updatedSaleMap.size > 0) {
          finalSales = finalSales.map(s => updatedSaleMap.get(s.id) || s);
        }
        if (newSales.length > 0) {
          finalSales = [...newSales, ...finalSales];
        }
        storage.saveSales(finalSales);
      }

      // Atualizar lastGeneratedCompetence, garantir status ATIVO e limpar qualquer resquício de cancelamento
      const lastComp = competencesGenerated[competencesGenerated.length - 1] || startComp;
      const updatedContracts = contracts.map(c => {
        if (c.id === contract.id) {
          return {
            ...c,
            status: 'ATIVO' as const,
            cancellationDate: undefined,
            cancellationReason: undefined,
            lastGeneratedCompetence: lastComp,
            // Estender término caso esteja anterior à última competência faturada
            endDate: (c.endDate && c.endDate.substring(0, 7) < lastComp) ? `${lastComp}-28` : c.endDate
          };
        }
        return c;
      });
      storage.saveContracts(updatedContracts);

      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'GERACAO_FATURAMENTO_FUTURO',
        module: 'Contratos Recorrentes',
        recordId: contract.id,
        details: `Faturamento automático do contrato ${contract.contractNumber}: ${generatedCount} novos títulos criados, ${updatedCount} títulos em aberto atualizados, cobrindo ${competencesGenerated.length} competências (${competencesGenerated[0] || startComp} até ${lastComp}) totalizando ${formatBRL(totalAmountGenerated)}.`
      });
    }

    return {
      generatedCount,
      updatedCount,
      alreadyExistingCount,
      totalAmountGenerated,
      competences: competencesGenerated,
      titles: newTitles
    };
  }

  /**
   * GERAÇÃO ASSÍNCRONA EM SEGUNDO PLANO COM RELATÓRIO DE PROGRESSO
   * Processa meses futuros em lotes assíncronos não bloqueantes com feedback percentual
   */
  public static async generateContractFutureInstallmentsAsync(
    contractOrId: Contract | string,
    numberOfMonths: number = 12,
    startFromCompetence?: string,
    options?: {
      overwriteOpen?: boolean;
      updateExistingOpen?: boolean;
    },
    onProgress?: ContractGenerationProgressCallback
  ): Promise<{
    generatedCount: number;
    updatedCount: number;
    alreadyExistingCount: number;
    totalAmountGenerated: number;
    competences: string[];
    titles: FinancialTitle[];
    error?: string;
  }> {
    const contracts = storage.getContracts();
    const contract = typeof contractOrId === 'string'
      ? contracts.find(c => c.id === contractOrId)
      : (contracts.find(c => c.id === contractOrId.id) || contractOrId);

    if (!contract) {
      return {
        generatedCount: 0,
        updatedCount: 0,
        alreadyExistingCount: 0,
        totalAmountGenerated: 0,
        competences: [],
        titles: [],
        error: 'Contrato não encontrado.'
      };
    }

    const statusNorm = String(contract.status || '').toUpperCase();
    if (statusNorm === 'CANCELADO' || statusNorm === 'INATIVO') {
      return {
        generatedCount: 0,
        updatedCount: 0,
        alreadyExistingCount: 0,
        totalAmountGenerated: 0,
        competences: [],
        titles: [],
        error: `O contrato ${contract.contractNumber} está ${contract.status}. Reative o contrato antes de gerar novas faturas.`
      };
    }

    onProgress?.({
      percent: 5,
      stage: 'Carregando estrutura e regras contratuais...',
      currentMonth: '',
      processed: 0,
      total: numberOfMonths,
      currentContract: contract.contractNumber
    });
    await new Promise(r => setTimeout(r, 10));

    const currentTitles = storage.getTitles();
    const currentSales = storage.getSales();
    const rawMainAcc = contract.items?.[0]?.accountId;
    const mainAccountId = (rawMainAcc === 'acc-rec-01' || !rawMainAcc) ? 'acc-1.1.01' : rawMainAcc;

    const today = new Date();
    const currentCompStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const startComp = startFromCompetence || currentCompStr;
    const [startYear, startMonth] = startComp.split('-').map(Number);
    
    let generatedCount = 0;
    let updatedCount = 0;
    let alreadyExistingCount = 0;
    let totalAmountGenerated = 0;
    const competencesGenerated: string[] = [];
    const newTitles: FinancialTitle[] = [];
    const newSales: Sale[] = [];
    const updatedTitleMap = new Map<string, FinancialTitle>();
    const updatedSaleMap = new Map<string, Sale>();

    const nowIso = new Date().toISOString();
    const todayYmd = nowIso.split('T')[0];
    const isRecurringContract = contract.contractType !== 'AVULSO' && contract.isRecurring !== false;
    const shouldUpdateOpen = options?.updateExistingOpen || options?.overwriteOpen;

    for (let i = 0; i < numberOfMonths; i++) {
      const targetDate = new Date(startYear, startMonth - 1 + i, 1);
      const cYear = targetDate.getFullYear();
      const cMonth = targetDate.getMonth() + 1;
      const cMonthFormatted = String(cMonth).padStart(2, '0');
      const competence = `${cYear}-${cMonthFormatted}`;

      if (!isRecurringContract && contract.endDate && competence > contract.endDate.substring(0, 7)) {
        break;
      }
      const isExplicitlyCancelled = statusNorm === 'CANCELADO' || statusNorm === 'INATIVO';
      if (isExplicitlyCancelled && contract.cancellationDate && competence >= contract.cancellationDate.substring(0, 7)) {
        break;
      }

      competencesGenerated.push(competence);

      let dueYear = cYear;
      let dueMonth = cMonth;
      if (contract.dueRule === 'NEXT_MONTH') {
        dueMonth += 1;
        if (dueMonth > 12) {
          dueMonth = 1;
          dueYear += 1;
        }
      }

      const lastDayOfMonth = new Date(dueYear, dueMonth, 0).getDate();
      const actualDueDay = Math.min(contract.dueDay || 10, lastDayOfMonth);
      const dueDayFormatted = String(actualDueDay).padStart(2, '0');
      const dueMonthFormatted = String(dueMonth).padStart(2, '0');
      const dueDate = `${dueYear}-${dueMonthFormatted}-${dueDayFormatted}`;

      const titleNumber = `FAT-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;

      const existing = currentTitles.find(t => 
        (t.originType === 'CONTRATO' || t.originType === 'VENDA') && 
        (t.originId === contract.id || t.contractId === contract.id || t.contractNumber === contract.contractNumber || t.originId === contract.contractNumber) && 
        t.competence === competence &&
        (t.titleNumber === titleNumber || !t.titleNumber.startsWith('TB-')) &&
        t.documentState !== 'CANCELADO'
      );

      if (existing) {
        if (shouldUpdateOpen && existing.settlementState !== 'LIQUIDADO' && existing.documentState !== 'CANCELADO') {
          const oldAmount = existing.originalAmount;
          const updatedTitle: FinancialTitle = {
            ...existing,
            originalAmount: contract.monthlyTotal,
            balancePrincipal: Math.max(0, contract.monthlyTotal - (existing.settledPrincipal || 0)),
            dueDate,
            expectedCashDate: dueDate,
            updatedAt: nowIso,
            notes: `${existing.notes || ''} [Sincronizado com contrato em ${todayYmd}: de ${formatBRL(oldAmount)} para ${formatBRL(contract.monthlyTotal)}]`
          };
          updatedTitleMap.set(updatedTitle.id, updatedTitle);
          updatedCount++;
          totalAmountGenerated += contract.monthlyTotal;

          const linkedSale = currentSales.find(s => 
            s.id === existing.saleId || 
            (s.titleIds && s.titleIds.includes(existing.id)) ||
            (s.contractId === contract.id && s.competence === competence)
          );
          if (linkedSale) {
            updatedSaleMap.set(linkedSale.id, {
              ...linkedSale,
              grossTotal: contract.monthlyTotal,
              netTotal: contract.monthlyTotal,
              items: linkedSale.items?.map(it => ({
                ...it,
                unitPrice: contract.monthlyTotal,
                total: contract.monthlyTotal
              })) || []
            });
          }
        } else {
          alreadyExistingCount++;
        }
      } else {
        const saleId = `sale-${contract.id}-${competence}`;
        const saleNumber = `VEN-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;
        const newTitleId = `tit-fat-${Date.now()}-${contract.id}-${competence}`;

        const newTitle: FinancialTitle = {
          id: newTitleId,
          companyId: 'comp-1',
          type: 'RECEBER',
          titleNumber,
          counterpartyId: contract.customerId,
          description: `Mensalidade ${contract.description} - Comp. ${cMonthFormatted}/${cYear}`,
          accountId: mainAccountId,
          launchDate: todayYmd,
          competence,
          issueDate: todayYmd,
          dueDate,
          expectedCashDate: dueDate,
          originalAmount: contract.monthlyTotal,
          settledPrincipal: 0,
          balancePrincipal: contract.monthlyTotal,
          accruedInterest: 0,
          accruedFine: 0,
          documentState: 'CONFIRMADO',
          settlementState: 'ABERTO',
          originType: 'CONTRATO',
          originId: contract.id,
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          saleId: saleId,
          saleNumber: saleNumber,
          createdAt: nowIso,
          updatedAt: nowIso,
          notes: `Faturamento recorrente automático programado (Contrato ${contract.contractNumber} • Venda ${saleNumber}).`
        };

        const newSale: Sale = {
          id: saleId,
          saleNumber,
          customerId: contract.customerId,
          competence,
          date: todayYmd,
          items: (contract.items && contract.items.length > 0) ? contract.items.map(it => ({
            id: `item-${newTitleId}-${it.id}`,
            serviceId: it.serviceId,
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: 0,
            total: it.total,
            accountId: (it.accountId === 'acc-rec-01' || !it.accountId) ? 'acc-1.1.01' : it.accountId
          })) : [
            {
              id: `item-${newTitleId}`,
              serviceId: 'srv-1',
              description: `Mensalidade ${contract.description}`,
              quantity: 1,
              unitPrice: contract.monthlyTotal,
              discount: 0,
              total: contract.monthlyTotal,
              accountId: mainAccountId
            }
          ],
          grossTotal: contract.monthlyTotal,
          discountTotal: 0,
          netTotal: contract.monthlyTotal,
          installmentsCount: 1,
          notes: `Faturamento recorrente do Contrato ${contract.contractNumber}`,
          createdAt: nowIso,
          originType: 'CONTRATO',
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          status: 'CONFIRMADA',
          titleIds: [newTitleId]
        };

        newTitles.push(newTitle);
        newSales.push(newSale);
        generatedCount++;
        totalAmountGenerated += contract.monthlyTotal;
      }

      // Taxa de Balanço Anual (se configurada e incluir este mês)
      if (
        contract.annualBalanceFee && 
        contract.annualBalanceFee.enabled && 
        contract.annualBalanceFee.amount > 0 &&
        Array.isArray(contract.annualBalanceFee.billingMonths) &&
        contract.annualBalanceFee.billingMonths.includes(cMonth)
      ) {
        const totalInstallments = contract.annualBalanceFee.billingMonths.length || 1;
        const currentInstallmentIndex = contract.annualBalanceFee.billingMonths.indexOf(cMonth) + 1;
        
        const baseInstallmentAmount = Math.round((contract.annualBalanceFee.amount / totalInstallments) * 100) / 100;
        const isLastInstallment = currentInstallmentIndex === totalInstallments;
        const installmentAmount = isLastInstallment 
          ? Math.round((contract.annualBalanceFee.amount - baseInstallmentAmount * (totalInstallments - 1)) * 100) / 100
          : baseInstallmentAmount;

        const tbTitleNumber = `FAT-TB-${competence}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;
        const existingBalanceFee = currentTitles.find(t => 
          (t.originType === 'CONTRATO' || t.originType === 'VENDA') &&
          (t.originId === contract.id || t.contractId === contract.id) &&
          t.competence === competence &&
          (t.titleNumber === tbTitleNumber || t.description.includes('Taxa de Balanço')) &&
          t.documentState !== 'CANCELADO'
        );

        if (!existingBalanceFee) {
          const tbTitleId = `tit-tb-${Date.now()}-${contract.id}-${competence}`;
          const feeDueDate = calculateBalanceFeeDueDate(contract.annualBalanceFee, contract.dueDay, contract.dueRule, competence);
          const newTB: FinancialTitle = {
            id: tbTitleId,
            companyId: 'comp-1',
            type: 'RECEBER',
            titleNumber: tbTitleNumber,
            counterpartyId: contract.customerId,
            description: `Taxa de Balanço Anual (${currentInstallmentIndex}/${totalInstallments}) - Comp. ${cMonthFormatted}/${cYear}`,
            accountId: mainAccountId,
            launchDate: todayYmd,
            competence,
            issueDate: todayYmd,
            dueDate: feeDueDate,
            expectedCashDate: feeDueDate,
            originalAmount: installmentAmount,
            settledPrincipal: 0,
            balancePrincipal: installmentAmount,
            accruedInterest: 0,
            accruedFine: 0,
            documentState: 'CONFIRMADO',
            settlementState: 'ABERTO',
            originType: 'CONTRATO',
            originId: contract.id,
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            createdAt: nowIso,
            updatedAt: nowIso,
            notes: `Taxa de Balanço Anual programada do Contrato ${contract.contractNumber}.`
          };
          newTitles.push(newTB);
          generatedCount++;
          totalAmountGenerated += installmentAmount;
        } else if (shouldUpdateOpen && existingBalanceFee.settlementState !== 'LIQUIDADO') {
          const updatedTB: FinancialTitle = {
            ...existingBalanceFee,
            originalAmount: installmentAmount,
            balancePrincipal: Math.max(0, installmentAmount - (existingBalanceFee.settledPrincipal || 0)),
            updatedAt: nowIso
          };
          updatedTitleMap.set(updatedTB.id, updatedTB);
          updatedCount++;
          totalAmountGenerated += installmentAmount;
        }
      }

      // Emite atualização progressiva não bloqueante
      const pct = Math.min(88, Math.round(10 + ((i + 1) / numberOfMonths) * 75));
      onProgress?.({
        percent: pct,
        stage: `Processando ${cMonthFormatted}/${cYear} (${i + 1} de ${numberOfMonths} meses)...`,
        currentMonth: competence,
        processed: i + 1,
        total: numberOfMonths,
        currentContract: contract.contractNumber
      });
      await new Promise(r => setTimeout(r, 15));
    }

    // Persistência
    if (newTitles.length > 0 || updatedTitleMap.size > 0) {
      onProgress?.({
        percent: 92,
        stage: 'Gravando títulos e faturas com proteção de armazenamento...',
        currentMonth: '',
        processed: numberOfMonths,
        total: numberOfMonths,
        currentContract: contract.contractNumber
      });
      await new Promise(r => setTimeout(r, 10));

      let finalTitles = [...currentTitles];
      if (updatedTitleMap.size > 0) {
        finalTitles = finalTitles.map(t => updatedTitleMap.get(t.id) || t);
      }
      if (newTitles.length > 0) {
        finalTitles = [...newTitles, ...finalTitles];
      }
      storage.saveTitles(finalTitles);

      if (newSales.length > 0 || updatedSaleMap.size > 0) {
        let finalSales = [...currentSales];
        if (updatedSaleMap.size > 0) {
          finalSales = finalSales.map(s => updatedSaleMap.get(s.id) || s);
        }
        if (newSales.length > 0) {
          finalSales = [...newSales, ...finalSales];
        }
        storage.saveSales(finalSales);
      }

      const lastComp = competencesGenerated[competencesGenerated.length - 1] || startComp;
      const updatedContracts = contracts.map(c => {
        if (c.id === contract.id) {
          return {
            ...c,
            status: 'ATIVO' as const,
            cancellationDate: undefined,
            cancellationReason: undefined,
            lastGeneratedCompetence: lastComp,
            endDate: (c.endDate && c.endDate.substring(0, 7) < lastComp) ? `${lastComp}-28` : c.endDate
          };
        }
        return c;
      });
      storage.saveContracts(updatedContracts);

      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'GERACAO_FATURAMENTO_FUTURO_ASSINCRONO',
        module: 'Contratos Recorrentes',
        recordId: contract.id,
        details: `Geração assíncrona do contrato ${contract.contractNumber}: ${generatedCount} novos títulos criados, ${updatedCount} títulos em aberto atualizados, cobrindo ${competencesGenerated.length} competências (${competencesGenerated[0] || startComp} até ${lastComp}) totalizando ${formatBRL(totalAmountGenerated)}.`
      });
    }

    onProgress?.({
      percent: 100,
      stage: 'Faturamento concluído com sucesso!',
      currentMonth: '',
      processed: numberOfMonths,
      total: numberOfMonths,
      currentContract: contract.contractNumber
    });

    return {
      generatedCount,
      updatedCount,
      alreadyExistingCount,
      totalAmountGenerated,
      competences: competencesGenerated,
      titles: newTitles
    };
  }

  /**
   * FATURAMENTO EM LOTE DE MÚLTIPLOS CONTRATOS ATIVOS
   * Itera pelos contratos selecionados com barra de progresso unificada e assíncrona
   */
  public static async generateMultipleContractsFutureInstallmentsAsync(
    contractsList?: Contract[],
    numberOfMonths: number = 12,
    startFromCompetence?: string,
    options?: {
      overwriteOpen?: boolean;
      updateExistingOpen?: boolean;
    },
    onProgress?: BatchBillingProgressCallback
  ): Promise<{
    totalProcessedContracts: number;
    totalGeneratedCount: number;
    totalUpdatedCount: number;
    totalAlreadyExistingCount: number;
    totalAmountGenerated: number;
    contractsSummary: Array<{
      contractId: string;
      contractNumber: string;
      customerName: string;
      generated: number;
      updated: number;
      existing: number;
      amount: number;
      error?: string;
    }>;
  }> {
    const all = storage.getContracts();
    const targetContracts = (contractsList && contractsList.length > 0)
      ? contractsList
      : all.filter(c => c.status === 'ATIVO' && c.contractType !== 'AVULSO' && c.isRecurring !== false);

    const counterparties = storage.getCounterparties();
    const totalCount = targetContracts.length;

    let totalGeneratedCount = 0;
    let totalUpdatedCount = 0;
    let totalAlreadyExistingCount = 0;
    let totalAmountGenerated = 0;

    const summary: Array<{
      contractId: string;
      contractNumber: string;
      customerName: string;
      generated: number;
      updated: number;
      existing: number;
      amount: number;
      error?: string;
    }> = [];

    onProgress?.({
      percent: 0,
      stage: `Iniciando faturamento em lote para ${totalCount} contrato(s)...`,
      currentContractNumber: '',
      currentCustomerName: '',
      processedContracts: 0,
      totalContracts: totalCount,
      totalGenerated: 0,
      totalUpdated: 0,
      totalAmountGenerated: 0
    });
    await new Promise(r => setTimeout(r, 20));

    for (let i = 0; i < totalCount; i++) {
      const contract = targetContracts[i];
      const client = counterparties.find(c => c.id === contract.customerId);
      const clientName = client?.name || 'Cliente';

      const basePct = Math.round((i / totalCount) * 100);

      onProgress?.({
        percent: basePct,
        stage: `Processando contrato ${i + 1} de ${totalCount}: ${contract.contractNumber} (${clientName})...`,
        currentContractNumber: contract.contractNumber,
        currentCustomerName: clientName,
        processedContracts: i,
        totalContracts: totalCount,
        totalGenerated: totalGeneratedCount,
        totalUpdated: totalUpdatedCount,
        totalAmountGenerated
      });

      try {
        const res = await this.generateContractFutureInstallmentsAsync(
          contract,
          numberOfMonths,
          startFromCompetence,
          options,
          (subProgress) => {
            const stepContribution = (subProgress.percent / 100) * (100 / Math.max(1, totalCount));
            const livePct = Math.min(99, Math.round(basePct + stepContribution));
            onProgress?.({
              percent: livePct,
              stage: `Contrato ${i + 1}/${totalCount} (${contract.contractNumber}): ${subProgress.stage}`,
              currentContractNumber: contract.contractNumber,
              currentCustomerName: clientName,
              processedContracts: i,
              totalContracts: totalCount,
              totalGenerated: totalGeneratedCount,
              totalUpdated: totalUpdatedCount,
              totalAmountGenerated
            });
          }
        );

        totalGeneratedCount += res.generatedCount;
        totalUpdatedCount += res.updatedCount;
        totalAlreadyExistingCount += res.alreadyExistingCount;
        totalAmountGenerated += res.totalAmountGenerated;

        summary.push({
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          customerName: clientName,
          generated: res.generatedCount,
          updated: res.updatedCount,
          existing: res.alreadyExistingCount,
          amount: res.totalAmountGenerated,
          error: res.error
        });
      } catch (err: any) {
        summary.push({
          contractId: contract.id,
          contractNumber: contract.contractNumber,
          customerName: clientName,
          generated: 0,
          updated: 0,
          existing: 0,
          amount: 0,
          error: err?.message || 'Erro inesperado'
        });
      }

      await new Promise(r => setTimeout(r, 10));
    }

    onProgress?.({
      percent: 100,
      stage: `Faturamento em lote concluído com sucesso para ${totalCount} contrato(s)!`,
      currentContractNumber: '',
      currentCustomerName: '',
      processedContracts: totalCount,
      totalContracts: totalCount,
      totalGenerated: totalGeneratedCount,
      totalUpdated: totalUpdatedCount,
      totalAmountGenerated
    });

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'FATURAMENTO_EM_LOTE_CONTRATOS',
      module: 'Contratos Recorrentes',
      recordId: `batch-all-${totalCount}`,
      details: `Faturamento em lote de ${totalCount} contratos ativos concluído: ${totalGeneratedCount} títulos criados, ${totalUpdatedCount} atualizados (${formatBRL(totalAmountGenerated)}).`
    });

    return {
      totalProcessedContracts: totalCount,
      totalGeneratedCount,
      totalUpdatedCount,
      totalAlreadyExistingCount,
      totalAmountGenerated,
      contractsSummary: summary
    };
  }

  /**
   * CALCULATE MRR (MONTHLY RECURRING REVENUE)
   * Defined strictly in Prompt Item 16:
   * Normalized monthly value of active recurring contracts on the reference date.
   * Excludes one-off sales and installments. Overdue does not reduce MRR.
   */
  public static calculateMRR(): number {
    const contracts = storage.getContracts().filter(c => 
      c.status === 'ATIVO' && 
      c.isRecurring !== false && 
      c.contractType !== 'AVULSO'
    );
    return contracts.reduce((acc, c) => acc + (c.monthlyTotal || 0), 0);
  }

  /**
   * FATURAMENTO EM LOTE EXCLUSIVO DE TAXAS DE BALANÇO ANUAL
   * Respeita estritamente o que está cadastrado no contrato:
   * 1x Parcela Única, 2x Parcelas, 3x Parcelas ou Personalizado,
   * calculando a competência, valor e vencimento de cada parcela cadastrada.
   */
  public static async generateAnnualBalanceFeesBatchAsync(
    options: {
      targetYear?: number;
      targetCompetence?: string; // e.g. '2026-12' (se informado, fatura apenas parcelas deste mês)
      contractIds?: string[];
    } = {},
    onProgress?: (progress: {
      percent: number;
      stage: string;
      processed: number;
      total: number;
      generated: number;
      amount: number;
    }) => void
  ): Promise<{
    totalContractsWithFee: number;
    totalTitlesGenerated: number;
    totalAmountGenerated: number;
    alreadyExistingCount: number;
    generatedTitles: FinancialTitle[];
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
  }> {
    const allContracts = storage.getContracts();
    const counterparties = storage.getCounterparties();
    const currentTitles = storage.getTitles();
    const currentSales = storage.getSales();
    const currentUser = storage.getCurrentUser();

    const targetContracts = allContracts.filter(c => {
      if (c.status !== 'ATIVO') return false;
      if (options.contractIds && options.contractIds.length > 0 && !options.contractIds.includes(c.id)) {
        return false;
      }
      return (
        c.annualBalanceFee &&
        c.annualBalanceFee.enabled &&
        c.annualBalanceFee.amount > 0 &&
        Array.isArray(c.annualBalanceFee.billingMonths) &&
        c.annualBalanceFee.billingMonths.length > 0
      );
    });

    const targetYear = options.targetYear || (options.targetCompetence ? parseInt(options.targetCompetence.split('-')[0], 10) : new Date().getFullYear());
    const todayYmd = new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    const newTitles: FinancialTitle[] = [];
    const newSales: Sale[] = [];
    const details: Array<{
      contractId: string;
      contractNumber: string;
      clientName: string;
      installmentIndex: number;
      totalInstallments: number;
      competence: string;
      dueDate: string;
      amount: number;
      status: 'GERADO' | 'JA_EXISTE';
    }> = [];

    let totalTitlesGenerated = 0;
    let totalAmountGenerated = 0;
    let alreadyExistingCount = 0;

    const totalContracts = targetContracts.length;

    for (let i = 0; i < totalContracts; i++) {
      const contract = targetContracts[i];
      const client = counterparties.find(cp => cp.id === contract.customerId);
      const clientName = client?.name || client?.tradeName || 'Cliente';
      const balanceFee = contract.annualBalanceFee!;

      const billingMonths = [...balanceFee.billingMonths].sort((a, b) => a - b);
      const totalInstallments = billingMonths.length;
      const baseInstallmentAmount = Math.round((balanceFee.amount / totalInstallments) * 100) / 100;

      for (let mIdx = 0; mIdx < billingMonths.length; mIdx++) {
        const bMonth = billingMonths[mIdx];
        const installmentIndex = mIdx + 1;
        const compStr = `${targetYear}-${String(bMonth).padStart(2, '0')}`;

        // Se uma competência específica foi informada, pula outras competências
        if (options.targetCompetence && options.targetCompetence !== compStr) {
          continue;
        }

        // Valor da parcela (compensando centavos na última parcela)
        const isLast = installmentIndex === totalInstallments;
        const installmentAmount = isLast
          ? Math.round((balanceFee.amount - baseInstallmentAmount * (totalInstallments - 1)) * 100) / 100
          : baseInstallmentAmount;

        // Vencimento calculado respeitando a regra cadastrada
        const feeDueDate = calculateBalanceFeeDueDate(
          balanceFee,
          contract.dueDay || 10,
          contract.dueRule || 'SAME_MONTH',
          compStr
        );

        const tbTitleNumber = `TB-${compStr}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;

        // Verifica se já existe título para esta competência e contrato
        const existing = currentTitles.find(t => 
          (t.originType === 'CONTRATO' || t.originId === contract.id || t.contractId === contract.id) &&
          t.competence === compStr &&
          (t.titleNumber === tbTitleNumber || t.titleNumber.startsWith(`TB-${compStr}`) || isBalanceFeeTitle(t)) &&
          t.documentState !== 'CANCELADO'
        );

        if (existing) {
          alreadyExistingCount++;
          details.push({
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            clientName,
            installmentIndex,
            totalInstallments,
            competence: compStr,
            dueDate: existing.dueDate || feeDueDate,
            amount: existing.originalAmount || installmentAmount,
            status: 'JA_EXISTE'
          });
        } else {
          const rawAcc = contract.items?.[0]?.accountId;
          const mainAccountId = (rawAcc === 'acc-rec-01' || !rawAcc) ? 'acc-1.1.01' : rawAcc;
          const titleId = `tit-tb-${Date.now()}-${contract.id}-${installmentIndex}-${Math.random().toString(36).substr(2, 4)}`;
          const saleId = `sale-tb-${Date.now()}-${contract.id}-${installmentIndex}-${Math.random().toString(36).substr(2, 4)}`;
          const saleNumber = `VEN-TB-${compStr}-${contract.contractNumber.replace('CTR-', '').replace('CT-', '')}`;

          const newTitle: FinancialTitle = {
            id: titleId,
            companyId: 'comp-1',
            type: 'RECEBER',
            titleNumber: tbTitleNumber,
            counterpartyId: contract.customerId,
            description: `Taxa de Balanço Anual (${installmentIndex}/${totalInstallments}) - Contrato ${contract.contractNumber}`,
            accountId: mainAccountId,
            launchDate: todayYmd,
            competence: compStr,
            issueDate: todayYmd,
            dueDate: feeDueDate,
            expectedCashDate: feeDueDate,
            originalAmount: installmentAmount,
            settledPrincipal: 0,
            balancePrincipal: installmentAmount,
            accruedInterest: 0,
            accruedFine: 0,
            documentState: 'CONFIRMADO',
            settlementState: 'ABERTO',
            originType: 'CONTRATO',
            originId: contract.id,
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            saleId: saleId,
            saleNumber: saleNumber,
            installmentIndex,
            totalInstallments,
            createdAt: nowIso,
            updatedAt: nowIso,
            notes: `Faturamento em lote de Taxa de Balanço Anual (${installmentIndex}ª de ${totalInstallments} parcelas cadastradas no Contrato ${contract.contractNumber}).`
          };

          const newSale: Sale = {
            id: saleId,
            saleNumber,
            customerId: contract.customerId,
            competence: compStr,
            date: todayYmd,
            items: [
              {
                id: `item-${titleId}`,
                serviceId: 'srv-taxa-balanco',
                description: `Taxa de Balanço Anual (${installmentIndex}/${totalInstallments})`,
                quantity: 1,
                unitPrice: installmentAmount,
                discount: 0,
                total: installmentAmount,
                accountId: mainAccountId
              }
            ],
            grossTotal: installmentAmount,
            discountTotal: 0,
            netTotal: installmentAmount,
            installmentsCount: 1,
            notes: `Faturamento da Taxa de Balanço Anual do Contrato ${contract.contractNumber}`,
            createdAt: nowIso,
            originType: 'CONTRATO',
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            status: 'CONFIRMADA',
            titleIds: [titleId]
          };

          newTitles.push(newTitle);
          newSales.push(newSale);
          currentTitles.push(newTitle);
          totalTitlesGenerated++;
          totalAmountGenerated += installmentAmount;

          details.push({
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            clientName,
            installmentIndex,
            totalInstallments,
            competence: compStr,
            dueDate: feeDueDate,
            amount: installmentAmount,
            status: 'GERADO'
          });
        }
      }

      const percent = Math.min(100, Math.round(((i + 1) / totalContracts) * 100));
      onProgress?.({
        percent,
        stage: `Processando contrato ${contract.contractNumber} (${clientName})...`,
        processed: i + 1,
        total: totalContracts,
        generated: totalTitlesGenerated,
        amount: totalAmountGenerated
      });

      if (i % 3 === 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    }

    if (newTitles.length > 0) {
      storage.saveTitles(currentTitles);
      storage.saveSales([...currentSales, ...newSales]);

      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'FATURAMENTO_TAXA_BALANCO_LOTE',
        module: 'Comercial/Financeiro',
        recordId: `batch-tb-${Date.now()}`,
        details: `Faturamento em lote de Taxas de Balanço: ${totalTitlesGenerated} títulos gerados no total de ${formatBRL(totalAmountGenerated)} (${alreadyExistingCount} já existiam).`
      });
    }

    return {
      totalContractsWithFee: totalContracts,
      totalTitlesGenerated,
      totalAmountGenerated,
      alreadyExistingCount,
      generatedTitles: newTitles,
      details
    };
  }

  /**
   * CALCULATE INADIMPLÊNCIA (DELINQUENCY RATE)
   * Formula in Prompt Item 16:
   * "saldo vencido / saldo total em aberto na data de referência", excluding drafts and canceled.
   */
  public static calculateDelinquencyRate(referenceDateStr?: string): { rate: number; overdueBalance: number; openBalance: number } {
    const ref = referenceDateStr || new Date().toISOString().split('T')[0];
    const titles = storage.getTitles().filter(t => 
      t.type === 'RECEBER' && 
      t.documentState === 'CONFIRMADO' && 
      t.balancePrincipal > 0
    );

    const openBalance = titles.reduce((acc, t) => acc + t.balancePrincipal, 0);
    const overdueTitles = titles.filter(t => t.dueDate < ref);
    const overdueBalance = overdueTitles.reduce((acc, t) => acc + t.balancePrincipal, 0);

    const rate = openBalance > 0 ? (overdueBalance / openBalance) * 100 : 0;
    return {
      rate: Math.round(rate * 10) / 10,
      overdueBalance,
      openBalance
    };
  }

  /**
   * CALCULATE CLIENT METRICS & KPIS BASEADOS ESTREITAMENTE EM CONTRATOS ATIVOS
   * Conforme especificação do usuário:
   * 1. Apenas clientes com contrato ATIVO contam como clientes ativos.
   * 2. Clientes apenas cadastrados sem contrato não contam na base ativa nem de crescimento.
   * 3. Churn: clientes cujos contratos foram cancelados/encerrados e não possuem outro contrato ativo.
   * 4. Novos clientes: clientes que ativaram seu primeiro contrato no período.
   * 5. Crescimento e Churn calculados rigorosamente sobre a base contratual.
   */
  public static calculateClientMetrics(referenceYear?: number, referenceMonthIdx?: number) {
    const contracts = storage.getContracts();
    const counterparties = storage.getCounterparties();
    const registeredClients = counterparties.filter(c => c.type === 'CLIENTE' || c.type === 'AMBOS');

    // 1. Identificar clientes com contrato ativo
    const activeContracts = contracts.filter(c => c.status === 'ATIVO');
    const activeCustomerIds = new Set(activeContracts.map(c => c.customerId));
    const activeClients = activeCustomerIds.size;

    // 2. Identificar clientes que tiveram contrato cancelado/encerrado e não possuem nenhum ativo (Churn)
    const outOfPortfolioContracts = contracts.filter(c => c.status === 'CANCELADO' || c.status === 'ENCERRADO');
    const outOfPortfolioCustomerIds = new Set(outOfPortfolioContracts.map(c => c.customerId));
    const churnCustomerIds = Array.from(outOfPortfolioCustomerIds).filter(cId => !activeCustomerIds.has(cId));
    const inactiveClients = churnCustomerIds.length;

    // Base total de clientes com relacionamento contratual
    const totalContractClients = activeClients + inactiveClients;

    // 3. Período alvo e anterior
    const now = new Date();
    const targetYear = referenceYear ?? now.getFullYear();
    const targetMonth = referenceMonthIdx !== undefined ? referenceMonthIdx + 1 : now.getMonth() + 1;
    const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    let prevYear = targetYear;
    let prevMonth = targetMonth - 1;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`;

    // Mapa de primeiro contrato ativo por cliente para detectar novos clientes
    const customerFirstContractMap = new Map<string, string>();
    for (const c of contracts) {
      const cur = customerFirstContractMap.get(c.customerId);
      const contractStart = c.startDate || c.entryDate || c.createdAt || '';
      if (!cur || (contractStart && contractStart < cur)) {
        customerFirstContractMap.set(c.customerId, contractStart);
      }
    }

    // Novos clientes com contrato no período alvo
    const newClientsPeriod = Array.from(customerFirstContractMap.entries()).filter(([cId, startDate]) => {
      return startDate.startsWith(targetMonthStr) && (activeCustomerIds.has(cId) || churnCustomerIds.includes(cId));
    }).length;

    // Novos clientes no período anterior
    const newClientsPrevPeriod = Array.from(customerFirstContractMap.entries()).filter(([cId, startDate]) => {
      return startDate.startsWith(prevMonthStr) && (activeCustomerIds.has(cId) || churnCustomerIds.includes(cId));
    }).length;

    // Churn no período alvo: clientes cujo contrato cancelou/encerrou no mês e que ficaram sem contrato ativo
    const churnPeriod = contracts.filter(c => {
      if (c.status !== 'CANCELADO' && c.status !== 'ENCERRADO') return false;
      const cancelDate = c.cancellationDate || c.inactivatedAt || '';
      if (!cancelDate.startsWith(targetMonthStr)) return false;
      return !activeCustomerIds.has(c.customerId);
    }).map(c => c.customerId);
    const uniqueChurnPeriod = new Set(churnPeriod).size;

    // Churn no período anterior
    const churnPrevPeriod = contracts.filter(c => {
      if (c.status !== 'CANCELADO' && c.status !== 'ENCERRADO') return false;
      const cancelDate = c.cancellationDate || c.inactivatedAt || '';
      if (!cancelDate.startsWith(prevMonthStr)) return false;
      return !activeCustomerIds.has(c.customerId);
    }).map(c => c.customerId);
    const uniqueChurnPrevPeriod = new Set(churnPrevPeriod).size;

    // Crescimento líquido: novos contratos menos churn
    const netGrowth = newClientsPeriod - uniqueChurnPeriod;
    const netGrowthDiff = netGrowth - (newClientsPrevPeriod - uniqueChurnPrevPeriod);

    // Base inicial anterior estimada
    const baseClients = Math.max(1, activeClients - netGrowth);
    const growthRate = (netGrowth / baseClients) * 100;
    const churnRate = baseClients > 0 ? (uniqueChurnPeriod / baseClients) * 100 : 0;

    // Total MRR
    const mrr = activeContracts.reduce((acc, c) => acc + (c.monthlyTotal || 0), 0);
    const averageTicketPerClient = activeClients > 0 ? mrr / activeClients : 0;

    return {
      totalClients: totalContractClients > 0 ? totalContractClients : registeredClients.length,
      registeredClientsCount: registeredClients.length,
      totalContractClients,
      activeClients,
      inactiveClients,
      clientsWithActiveContracts: activeClients,
      newClientsPeriod,
      newClientsPrevPeriod,
      churnPeriod: uniqueChurnPeriod,
      churnPrevPeriod: uniqueChurnPrevPeriod,
      churnRate: Math.round(churnRate * 10) / 10,
      netGrowth,
      netGrowthDiff,
      growthRate: Math.round(growthRate * 10) / 10,
      mrr,
      averageTicketPerClient,
      activePercentage: totalContractClients > 0 ? Math.round((activeClients / totalContractClients) * 100) : 100,
      contractCoveragePercentage: 100
    };
  }

  // ==========================================
  // CARTÃO DE CRÉDITO & FATURAS
  // ==========================================
  public static getCardAvailableLimit(cardId: string): { limit: number; used: number; available: number } {
    const cards = storage.getCreditCards();
    const card = cards.find(c => c.id === cardId);
    if (!card) return { limit: 0, used: 0, available: 0 };

    const purchases = storage.getCardPurchases().filter(p => p.cardId === cardId);
    let used = 0;
    for (const pur of purchases) {
      const isCredit = pur.transactionType === 'ESTORNO' || pur.transactionType === 'CASHBACK';
      for (const inst of pur.installments) {
        if (!inst.settled) {
          if (isCredit) {
            used -= inst.amount;
          } else {
            used += inst.amount;
          }
        }
      }
    }
    used = Math.max(0, Math.round(used * 100) / 100);

    const available = Math.max(0, Math.round((card.creditLimit - used) * 100) / 100);
    return { limit: card.creditLimit, used, available };
  }

  public static getCardInvoices(cardId: string): Array<{
    invoiceMonth: string; // YYYY-MM
    closingDate: string; // YYYY-MM-DD
    dueDate: string; // YYYY-MM-DD
    totalAmount: number;
    paidAmount: number;
    balance: number;
    status: 'ABERTA' | 'FECHADA' | 'PAGA';
    itemsCount: number;
  }> {
    const cards = storage.getCreditCards();
    const card = cards.find(c => c.id === cardId);
    if (!card) return [];

    const purchases = storage.getCardPurchases().filter(p => p.cardId === cardId);
    const payments = storage.getCardInvoicePayments().filter(p => p.cardId === cardId);

    const monthMap = new Map<string, {
      total: number;
      settledCount: number;
      totalCount: number;
    }>();

    for (const pur of purchases) {
      const isCredit = pur.transactionType === 'ESTORNO' || pur.transactionType === 'CASHBACK';
      for (const inst of pur.installments) {
        const m = inst.invoiceMonth;
        const current = monthMap.get(m) || { total: 0, settledCount: 0, totalCount: 0 };
        if (isCredit) {
          current.total -= inst.amount;
        } else {
          current.total += inst.amount;
        }
        current.totalCount += 1;
        if (inst.settled) current.settledCount += 1;
        monthMap.set(m, current);
      }
    }

    // Also ensure current and neighbouring months exist
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    for (let offset = -2; offset <= 3; offset++) {
      const d = new Date(currentYear, currentMonth - 1 + offset, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap.has(mStr)) {
        monthMap.set(mStr, { total: 0, settledCount: 0, totalCount: 0 });
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const result = Array.from(monthMap.entries()).map(([month, data]) => {
      const [year, m] = month.split('-');
      const closingDay = String(card.closingDay).padStart(2, '0');
      const dueDay = String(card.dueDay).padStart(2, '0');
      
      const closingDate = `${year}-${m}-${closingDay}`;
      let dueYear = parseInt(year);
      let dueMonthNum = parseInt(m);
      if (card.dueDay <= card.closingDay) {
        dueMonthNum += 1;
        if (dueMonthNum > 12) {
          dueMonthNum = 1;
          dueYear += 1;
        }
      }
      const dueDate = `${dueYear}-${String(dueMonthNum).padStart(2, '0')}-${dueDay}`;

      const paidForMonth = payments
        .filter(p => p.invoiceMonth === month)
        .reduce((sum, p) => sum + p.amountPaid, 0);

      const normalizedTotal = Math.max(0, Math.round(data.total * 100) / 100);
      const balance = Math.max(0, Math.round((normalizedTotal - paidForMonth) * 100) / 100);
      let status: 'ABERTA' | 'FECHADA' | 'PAGA' = 'ABERTA';

      if (normalizedTotal > 0 && (balance <= 0.01 || data.settledCount === data.totalCount)) {
        status = 'PAGA';
      } else if (todayStr >= closingDate) {
        status = 'FECHADA';
      } else {
        status = 'ABERTA';
      }

      return {
        invoiceMonth: month,
        closingDate,
        dueDate,
        totalAmount: normalizedTotal,
        paidAmount: paidForMonth,
        balance,
        status,
        itemsCount: data.totalCount
      };
    });

    return result.sort((a, b) => b.invoiceMonth.localeCompare(a.invoiceMonth));
  }

  public static payCardInvoice(params: {
    cardId: string;
    invoiceMonth: string;
    bankAccountId: string;
    amountPaid: number;
    paymentDate: string;
    notes?: string;
  }): { success: boolean; error?: string } {
    const cards = storage.getCreditCards();
    const card = cards.find(c => c.id === params.cardId);
    if (!card) return { success: false, error: 'Cartão não encontrado.' };

    const bank = storage.getBankAccounts().find(b => b.id === params.bankAccountId);
    if (!bank) return { success: false, error: 'Conta bancária pagadora não encontrada.' };

    if (!params.amountPaid || params.amountPaid <= 0) {
      return { success: false, error: 'O valor do pagamento da fatura deve ser maior que R$ 0,00.' };
    }

    const today = params.paymentDate || new Date().toISOString().split('T')[0];
    const paymentMonth = today.substring(0, 7);

    // Validação estrita de fechamento de período contábil
    if (this.isPeriodClosed(params.invoiceMonth) || this.isPeriodClosed(paymentMonth)) {
      return { 
        success: false, 
        error: `O período financeiro (${params.invoiceMonth} ou ${paymentMonth}) encontra-se encerrado para movimentações ou baixas.` 
      };
    }

    const currentUser = storage.getCurrentUser();

    // 1. Cria a movimentação financeira (SAÍDA bancária na data de pagamento)
    const movementId = `mov-ccpay-${Date.now()}`;
    const newMovement: FinancialMovement = {
      id: movementId,
      bankAccountId: params.bankAccountId,
      date: today,
      direction: 'SAIDA',
      amount: params.amountPaid,
      originType: 'FATURA_CARTAO',
      originReferenceId: `cc-${params.cardId}-${params.invoiceMonth}`,
      description: `Pagamento Fatura Cartão ${card.name} (Ref: ${formatCompetence(params.invoiceMonth)})`,
      cashFlowCategory: 'OPERACIONAL',
      createdAt: new Date().toISOString()
    };
    storage.saveMovements([newMovement, ...storage.getMovements()]);

    // 2. Localiza os títulos a pagar da fatura
    const titles = storage.getTitles();
    const matchingTitles = titles.filter(t => 
      t.creditCardId === params.cardId && 
      t.creditCardInvoiceMonth === params.invoiceMonth &&
      t.type === 'PAGAR' &&
      t.documentState !== 'CANCELADO'
    );

    const settlementIds: string[] = [];
    const currentSettlements = storage.getSettlements();
    const newSettlements: Settlement[] = [];

    // Alocação exata do valor pago (quitação total ou parcial sem perda de centavos)
    let remainingToAllocate = Math.round(params.amountPaid * 100) / 100;
    const fullySettledTitleIds = new Set<string>();

    const updatedTitles = titles.map(t => {
      const isMatch = matchingTitles.some(mt => mt.id === t.id);
      if (!isMatch || t.balancePrincipal <= 0) return t;

      if (remainingToAllocate <= 0) {
        return t; // Valor pago já foi totalmente alocado a títulos anteriores
      }

      const settleAmount = Math.min(t.balancePrincipal, remainingToAllocate);
      remainingToAllocate = Math.round((remainingToAllocate - settleAmount) * 100) / 100;

      const settId = `sett-cc-${t.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      settlementIds.push(settId);

      newSettlements.push({
        id: settId,
        titleId: t.id,
        settlementNumber: `LQD-CC-${Date.now().toString().slice(-6)}`,
        settlementDate: today,
        bankAccountId: params.bankAccountId,
        components: {
          principalSettled: settleAmount,
          discount: 0,
          interest: 0,
          fine: 0,
          bankFee: 0,
          netFinancialAmount: settleAmount
        },
        notes: `Liquidado via Pagamento de Fatura do Cartão ${card.name}${settleAmount < t.balancePrincipal ? ' (Amortização Parcial)' : ''}`,
        isReversed: false,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.name
      });

      const newBalance = Math.round((t.balancePrincipal - settleAmount) * 100) / 100;
      const newSettled = Math.round(((t.settledPrincipal || 0) + settleAmount) * 100) / 100;
      const isComplete = newBalance <= 0;

      if (isComplete) {
        fullySettledTitleIds.add(t.id);
      }

      return {
        ...t,
        settledPrincipal: newSettled,
        balancePrincipal: Math.max(0, newBalance),
        settlementState: (isComplete ? 'LIQUIDADO' : 'PARCIAL') as TitleSettlementState,
        expectedBankAccountId: params.bankAccountId,
        updatedAt: new Date().toISOString()
      };
    });

    storage.saveTitles(updatedTitles);
    if (newSettlements.length > 0) {
      storage.saveSettlements([...newSettlements, ...currentSettlements]);
    }

    // 3. Atualiza parcelas nas compras com cartão
    const purchases = storage.getCardPurchases();
    const updatedPurchases = purchases.map(pur => {
      if (pur.cardId !== params.cardId) return pur;
      const updatedInstallments = pur.installments.map(inst => {
        if (inst.invoiceMonth === params.invoiceMonth) {
          // Se a fatura foi paga totalmente ou se o título vinculado foi quitado
          const isSettled = remainingToAllocate <= 0 || fullySettledTitleIds.size === matchingTitles.length;
          return {
            ...inst,
            settled: isSettled,
            settledAt: isSettled ? today : inst.settledAt,
            settlementId: isSettled ? movementId : inst.settlementId
          };
        }
        return inst;
      });
      return { ...pur, installments: updatedInstallments };
    });
    storage.saveCardPurchases(updatedPurchases);

    // 4. Record invoice payment
    storage.addCardInvoicePayment({
      id: `inv-pay-${Date.now()}`,
      cardId: params.cardId,
      invoiceMonth: params.invoiceMonth,
      paymentDate: today,
      bankAccountId: params.bankAccountId,
      amountPaid: params.amountPaid,
      notes: params.notes,
      movementId,
      settlementIds,
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name
    });

    // 5. Audit Log
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PAGAMENTO_FATURA_CARTAO',
      module: 'Bancos e Contas',
      recordId: params.cardId,
      details: `Pagamento da fatura ${params.invoiceMonth} do cartão ${card.name} no valor de ${formatBRL(params.amountPaid)} com débito na conta ${bank.name}.`
    });

    return { success: true };
  }

  // ==========================================
  // CAIXA FÍSICO / CONCILIAÇÃO & AJUSTE DE CONTAGEM
  // ==========================================
  public static applyCashCountAdjustment(params: {
    bankAccountId: string;
    countRecord: CashCountRecord;
    adjustReason?: string;
  }): { success: boolean; error?: string } {
    const bank = storage.getBankAccounts().find(b => b.id === params.bankAccountId);
    if (!bank) return { success: false, error: 'Conta de caixa físico não encontrada.' };

    const currentUser = storage.getCurrentUser();
    const diff = params.countRecord.difference;
    const today = params.countRecord.date || new Date().toISOString().split('T')[0];

    // If difference !== 0, create adjusting movement in cash box
    if (Math.abs(diff) > 0.001) {
      const isSobra = diff > 0;
      const adjustMovement: FinancialMovement = {
        id: `mov-cash-adj-${Date.now()}`,
        bankAccountId: params.bankAccountId,
        date: today,
        direction: isSobra ? 'ENTRADA' : 'SAIDA',
        amount: Math.abs(diff),
        originType: 'AJUSTE_CAIXA',
        originReferenceId: params.countRecord.id,
        description: isSobra 
          ? `Ajuste de Caixa Físico (Sobra de Caixa constatada em contagem física) - ${params.adjustReason || 'Conferência regular'}`
          : `Ajuste de Caixa Físico (Falta/Quebra de Caixa constatada em contagem física) - ${params.adjustReason || 'Conferência regular'}`,
        cashFlowCategory: 'OPERACIONAL',
        createdAt: new Date().toISOString()
      };
      storage.saveMovements([adjustMovement, ...storage.getMovements()]);
    }

    // Save cash count record with adjustedInSystem = true
    const updatedCount: CashCountRecord = {
      ...params.countRecord,
      adjustedInSystem: true
    };
    storage.addCashCount(updatedCount);

    // Audit log
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'AJUSTE_CONTAGEM_CAIXA_FISICO',
      module: 'Bancos e Contas',
      recordId: params.bankAccountId,
      details: `Contagem física de cédulas e moedas no ${bank.name}. Total apurado: ${formatBRL(params.countRecord.totalPhysical)} (Saldo anterior: ${formatBRL(params.countRecord.systemBalance)} | Divergência: ${formatBRL(diff)}). Ajuste efetuado no sistema.`
    });

    return { success: true };
  }
}

/**
 * Determina se uma conta contábil pertence ao grupo de RECEITAS (Vendas / Contas a Receber)
 */
export const isRevenueAccount = (account: ChartAccount): boolean => {
  if (!account) return false;

  // Ajuste de caixa (entrada): aparece nas receitas, mas não entra na DRE
  if (account.id === 'acc-8.1.05') return true;
  
  // Naturezas explícitas de receita
  if (
    account.nature === 'RECEITA_SERVICO' ||
    account.nature === 'RECEITA_FINANCEIRA' ||
    account.nature === 'OUTRA_RECEITA'
  ) {
    return true;
  }
  
  if (account.nature && account.nature.startsWith('RECEITA')) {
    return true;
  }
  
  // Se estiver mapeado para linha de receitas na DRE
  if (
    account.dremap?.line === 'RECEITA_BRUTA' ||
    account.dremap?.line === 'RECEITAS_FINANCEIRAS' ||
    account.dremap?.line === 'OUTRAS_RECEITAS_OPERACIONAIS'
  ) {
    return true;
  }
  
  // Código contábil iniciando com 1, excluindo deduções (1.2)
  if (account.code && account.code.startsWith('1')) {
    if (account.code.startsWith('1.2') || account.nature === 'DEDUCAO_RECEITA') {
      return false; // Deduções são redutoras / custos
    }
    return true;
  }
  
  return false;
};

/**
 * Determina se uma conta contábil pertence ao grupo de CUSTOS E DESPESAS (Contas a Pagar)
 */
export const isCostOrExpenseAccount = (account: ChartAccount): boolean => {
  if (!account) return false;
  
  // Se for explicitamente receita, não é custo/despesa
  if (isRevenueAccount(account)) {
    return false;
  }
  
  // Naturezas explícitas de custos, despesas, tributos e investimentos
  if (
    account.nature === 'CUSTO_SERVICO' ||
    account.nature === 'DESPESA_PESSOAL' ||
    account.nature === 'DESPESA_ADMINISTRATIVA' ||
    account.nature === 'DESPESA_COMERCIAL' ||
    account.nature === 'DESPESA_OPERACIONAL' ||
    account.nature === 'DESPESA_FINANCEIRA' ||
    account.nature === 'DEDUCAO_RECEITA' ||
    account.nature === 'TRIBUTO_LUCRO' ||
    account.nature === 'INVESTIMENTO_ATIVO' ||
    account.nature === 'RESULTADO_FINANCEIRO' ||
    account.nature === 'FINANCIAMENTO_SOCIO' ||
    account.nature === 'CONTROLE_ESPECIFICO'
  ) {
    return true;
  }
  
  if (account.nature && (account.nature.startsWith('DESPESA') || account.nature.startsWith('CUSTO'))) {
    return true;
  }
  
  // Mapeamento DRE de custos e despesas
  if (
    account.dremap?.line === 'CUSTO_SERVICOS' ||
    account.dremap?.line === 'DESPESAS_OPERACIONAIS' ||
    account.dremap?.line === 'DESPESAS_FINANCEIRAS' ||
    account.dremap?.line === 'TRIBUTOS_SOBRE_LUCRO' ||
    account.dremap?.line === 'DEDUCOES_RECEITA'
  ) {
    return true;
  }
  
  // Códigos 2 (Custos), 3, 4, 5 (Despesas), 6 (Tributos) ou 1.2 (Deduções)
  if (
    account.code &&
    (account.code.startsWith('2') ||
     account.code.startsWith('3') ||
     account.code.startsWith('4') ||
     account.code.startsWith('5') ||
     account.code.startsWith('6') ||
     account.code.startsWith('1.2'))
  ) {
    return true;
  }
  
  // Por padrão em um lançamento a pagar, qualquer conta que não seja receita pode ser selecionada
  return true;
};

/**
 * Filtra as contas do plano de contas analítico conforme o tipo de título:
 * - 'PAGAR': apenas Custos e Despesas
 * - 'RECEBER': apenas Receitas
 */
export const getFilteredChartAccounts = (
  accounts: ChartAccount[],
  titleType: 'PAGAR' | 'RECEBER'
): ChartAccount[] => {
  return accounts.filter(a => {
    if (!a.isAnalytical || !a.isActive) return false;
    if (titleType === 'RECEBER') {
      return isRevenueAccount(a);
    } else {
      return isCostOrExpenseAccount(a);
    }
  });
};

/**
 * Retorna metadados de taxonomia gerencial e contábil para uma conta do plano de contas,
 * separando estritamente Custos Operacionais de Despesas Operacionais e Receitas.
 */
export const getAccountTaxonomyInfo = (account: ChartAccount): {
  group: string;
  badge: string;
  categoryType: 'CUSTO' | 'DESPESA' | 'RECEITA' | 'DEDUCAO' | 'INVESTIMENTO' | 'FINANCIAMENTO' | 'OUTROS';
} => {
  const code = account.code || '';
  const nature = account.nature || '';

  // 1.1 Receitas de Serviços / Operacionais
  if (code.startsWith('1.1') || nature === 'RECEITA_SERVICO') {
    return {
      group: '1.1 RECEITAS DE SERVIÇOS & OPERACIONAIS',
      badge: 'RECEITA DE SERVIÇO',
      categoryType: 'RECEITA'
    };
  }

  // 1.2 Deduções da Receita
  if (code.startsWith('1.2') || nature === 'DEDUCAO_RECEITA') {
    return {
      group: '1.2 DEDUÇÕES DA RECEITA (IMPOSTOS & ABATIMENTOS)',
      badge: 'DEDUÇÃO',
      categoryType: 'DEDUCAO'
    };
  }

  // 2. Custos da Operação / Custos dos Serviços Prestados (CSP/CPV)
  if (code.startsWith('2') || nature === 'CUSTO_SERVICO') {
    return {
      group: '2. CUSTOS DA OPERAÇÃO (SERVIÇOS PRESTADOS - CSP/CPV)',
      badge: 'CUSTO DA OPERAÇÃO',
      categoryType: 'CUSTO'
    };
  }

  // 3.1 Despesas com Pessoal
  if (code.startsWith('3.1') || nature === 'DESPESA_PESSOAL') {
    return {
      group: '3.1 DESPESAS COM PESSOAL (FOLHA, BENEFÍCIOS & PRÓ-LABORE)',
      badge: 'DESPESA C/ PESSOAL',
      categoryType: 'DESPESA'
    };
  }

  // 3.2 Despesas Administrativas & TI
  if (code.startsWith('3.2') || nature === 'DESPESA_ADMINISTRATIVA') {
    return {
      group: '3.2 DESPESAS ADMINISTRATIVAS & TI (ALUGUEL & SOFTWARES)',
      badge: 'DESPESA ADMIN/TI',
      categoryType: 'DESPESA'
    };
  }

  // 3.3 Despesas Comerciais & Marketing
  if (code.startsWith('3.3') || nature === 'DESPESA_COMERCIAL') {
    return {
      group: '3.3 DESPESAS COMERCIAIS & MARKETING (TRÁFEGO & COMISSÕES)',
      badge: 'DESPESA COMERCIAL',
      categoryType: 'DESPESA'
    };
  }

  // 4.1 Receitas Financeiras
  if (code.startsWith('4.1') || nature === 'RECEITA_FINANCEIRA') {
    return {
      group: '4.1 RECEITAS FINANCEIRAS & RENDIMENTOS',
      badge: 'RECEITA FINANCEIRA',
      categoryType: 'RECEITA'
    };
  }

  // 4.2 Despesas Financeiras & Bancárias
  if (code.startsWith('4.2') || nature === 'DESPESA_FINANCEIRA' || nature.includes('FINANCEIR')) {
    return {
      group: '4.2 DESPESAS FINANCEIRAS & TARIFAS BANCÁRIAS',
      badge: 'DESPESA FINANCEIRA',
      categoryType: 'DESPESA'
    };
  }

  // 5. Tributos sobre o Lucro
  if (code.startsWith('5.') || nature === 'TRIBUTO_LUCRO') {
    return {
      group: '5. TRIBUTOS SOBRE O LUCRO (IRPJ & CSLL)',
      badge: 'TRIBUTO S/ LUCRO',
      categoryType: 'DESPESA'
    };
  }

  // 6. Investimentos & Ativos
  if (code.startsWith('6.') || nature === 'INVESTIMENTO_ATIVO') {
    return {
      group: '6. INVESTIMENTOS & ATIVOS (HARDWARE & EQUIPAMENTOS)',
      badge: 'INVESTIMENTO',
      categoryType: 'INVESTIMENTO'
    };
  }

  // 7. Sócios & Financiamentos
  if (code.startsWith('7.') || nature === 'FINANCIAMENTO_SOCIO') {
    return {
      group: '7. FINANCIAMENTOS, SÓCIOS & DISTRIBUIÇÃO DE LUCROS',
      badge: 'SÓCIOS & LUCROS',
      categoryType: 'FINANCIAMENTO'
    };
  }

  // 8. Controles Específicos
  if (code.startsWith('8.') || nature === 'CONTROLE_ESPECIFICO') {
    return {
      group: '8. CONTROLES ESPECÍFICOS & ADIANTAMENTOS',
      badge: 'CONTROLE ESPECÍFICO',
      categoryType: 'OUTROS'
    };
  }

  return {
    group: 'OUTRAS CONTAS E OPERAÇÕES',
    badge: 'OUTRAS',
    categoryType: 'OUTROS'
  };
};

/**
 * Formata lista de contas contábeis em opções para SearchableSelect com grupos visuais,
 * ordenação numérica e identificação clara de Custos vs Despesas.
 */
export const formatChartAccountSelectOptions = (
  accounts: ChartAccount[],
  titleType?: 'PAGAR' | 'RECEBER'
) => {
  const filtered = titleType ? getFilteredChartAccounts(accounts, titleType) : accounts.filter(a => a.isAnalytical && a.isActive);
  
  // Ordena por código numérico
  const sorted = [...filtered].sort((a, b) => 
    (a.code || '').localeCompare(b.code || '', undefined, { numeric: true })
  );

  return sorted.map(a => {
    const tax = getAccountTaxonomyInfo(a);
    return {
      value: a.id,
      label: `${a.code} - ${a.name}`,
      sublabel: a.nature ? `Natureza: ${a.nature}` : undefined,
      badge: tax.badge,
      group: tax.group
    };
  });
};

/**
 * Retorna o nome da conta do plano de contas sem os prefixos numéricos de código
 * (ex: "3.1.01.001 - Energia Elétrica" -> "Energia Elétrica", "2.1.02 Custos Operacionais" -> "Custos Operacionais").
 */
export const formatAccountNameWithoutCode = (account?: ChartAccount | null): string => {
  if (!account || !account.name) return 'Sem categoria';
  const cleaned = account.name.replace(/^[\d.]+\s*[-–—]?\s*/, '').trim();
  return cleaned || account.name;
};

/**
 * Retorna classes CSS de cores harmoniosas (fundo, texto, borda) para badges de categoria
 * baseadas na taxonomia e natureza contábil da conta, com excelente legibilidade em modo claro e escuro.
 */
export const getAccountBadgeColorClasses = (account?: ChartAccount | null): {
  container: string;
  icon: string;
} => {
  if (!account) {
    return {
      container: 'bg-slate-100 text-slate-700 dark:bg-slate-800/90 dark:text-slate-300 border-slate-200 dark:border-slate-700/60',
      icon: 'text-slate-500 dark:text-slate-400'
    };
  }

  const tax = getAccountTaxonomyInfo(account);
  const code = account.code || '';
  const nature = account.nature || '';

  // 1. Receitas de Serviços / Operacionais
  if (tax.categoryType === 'RECEITA') {
    return {
      container: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/70',
      icon: 'text-emerald-600 dark:text-emerald-400'
    };
  }

  // 2. Custos da Operação / Serviços Prestados (CSP/CPV)
  if (tax.categoryType === 'CUSTO') {
    return {
      container: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/70',
      icon: 'text-cyan-600 dark:text-cyan-400'
    };
  }

  // 3. Deduções da Receita (Impostos / Abatimentos)
  if (tax.categoryType === 'DEDUCAO') {
    return {
      container: 'bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800/70',
      icon: 'text-orange-600 dark:text-orange-400'
    };
  }

  // 4. Despesas Operacionais específicas
  if (code.startsWith('3.1') || nature === 'DESPESA_PESSOAL') {
    // Despesas com Pessoal / Folha / Benefícios
    return {
      container: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/70',
      icon: 'text-indigo-600 dark:text-indigo-400'
    };
  }

  if (code.startsWith('3.2') || nature === 'DESPESA_ADMINISTRATIVA') {
    // Despesas Administrativas & TI
    return {
      container: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
      icon: 'text-amber-600 dark:text-amber-400'
    };
  }

  if (code.startsWith('3.3') || nature === 'DESPESA_COMERCIAL') {
    // Despesas Comerciais & Marketing
    return {
      container: 'bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/70',
      icon: 'text-purple-600 dark:text-purple-400'
    };
  }

  if (code.startsWith('4.2') || nature.includes('FINANCEIR')) {
    // Despesas Financeiras & Bancárias
    return {
      container: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800/70',
      icon: 'text-rose-600 dark:text-rose-400'
    };
  }

  // 5. Investimentos & Ativos
  if (tax.categoryType === 'INVESTIMENTO' || code.startsWith('6.')) {
    return {
      container: 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800/70',
      icon: 'text-blue-600 dark:text-blue-400'
    };
  }

  // Padrão para despesas gerais
  if (tax.categoryType === 'DESPESA') {
    return {
      container: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/70',
      icon: 'text-amber-600 dark:text-amber-400'
    };
  }

  return {
    container: 'bg-slate-100 text-slate-700 dark:bg-slate-800/90 dark:text-slate-300 border-slate-200 dark:border-slate-700/60',
    icon: 'text-slate-500 dark:text-slate-400'
  };
};

/**
 * Identifica com precisão se o título é referente a Taxa de Balanço Anual / 13º Honorário
 */
export const isBalanceFeeTitle = (title?: FinancialTitle | null): boolean => {
  if (!title) return false;
  const num = (title.titleNumber || '').toUpperCase();
  const desc = (title.description || '').toLowerCase();
  const notes = (title.notes || '').toLowerCase();
  return (
    num.startsWith('TB-') || 
    num.startsWith('FAT-TB-') || 
    desc.includes('taxa de balanço') || 
    desc.includes('taxa de balanco') ||
    desc.includes('13º honorário') ||
    desc.includes('13o honorario') ||
    notes.includes('taxa de balanço') ||
    notes.includes('taxa de balanco')
  );
};

/**
 * Monta mensagem padronizada de WhatsApp para aviso de vencimento / cobrança preventiva
 */
export const buildWhatsAppMessageForTitle = (
  title: FinancialTitle,
  counterpartyName?: string
): string => {
  const party = (counterpartyName || 'Prezado(a)').trim();
  const val = formatBRL(title.balancePrincipal || title.originalAmount);
  const due = formatDateBR(title.dueDate);
  const desc = title.description || 'Lançamento financeiro';
  const isTB = isBalanceFeeTitle(title);

  if (title.type === 'RECEBER') {
    if (isTB) {
      return `Olá, ${party}! Tudo bem?\n\nPassando para lembrar sobre a *Taxa de Balanço Anual / Encerramento do Exercício* (*${desc}*).\n\n📌 *Valor:* ${val}\n📅 *Vencimento:* ${due}\n\nEsta cobrança refere-se aos trabalhos de fechamento das demonstrações contábeis, conciliações anuais e encerramento do Balanço Patrimonial do exercício.\n\nCaso já tenha efetuado o pagamento ou precise de 2ª via ou chave PIX, estamos à total disposição!\n\nAtenciosamente,\n*Equipe Financeira Contaju*`;
    }

    return `Olá, ${party}! Tudo bem?\n\nPassando para lembrar sobre a sua fatura/honorário referente a *${desc}* no valor de *${val}*, com vencimento em *${due}*.\n\nCaso já tenha efetuado o pagamento, por gentileza desconsidere este aviso. Estamos à disposição!`;
  } else {
    return `Olá, ${party}! Tudo bem?\n\nReferente ao compromisso financeiro de *${desc}* no valor de *${val}*, com vencimento programado para *${due}*.\n\nFavor confirmar a chave PIX ou dados bancários para liquidação tempestiva. Muito obrigado!`;
  }
};

/**
 * Dispara notificação via WhatsApp Web / App e copia a mensagem para a área de transferência
 */
export const triggerWhatsAppForTitle = (
  title: FinancialTitle,
  phone?: string,
  counterpartyName?: string
): { success: boolean; message: string; copied: boolean } => {
  const msg = buildWhatsAppMessageForTitle(title, counterpartyName);
  let copied = false;

  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(msg);
      copied = true;
    }
  } catch (err) {
    console.warn('Não foi possível copiar automaticamente para a área de transferência', err);
  }

  let cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.length >= 10 && cleanPhone.length <= 11 && !cleanPhone.startsWith('55')) {
    cleanPhone = `55${cleanPhone}`;
  }

  const encodedMsg = encodeURIComponent(msg);
  const waUrl = cleanPhone.length >= 12
    ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`;

  window.open(waUrl, '_blank', 'noopener,noreferrer');

  return {
    success: true,
    message: msg,
    copied
  };
};


