import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { storage } from './storageService';
import {
  CompanyProfile,
  User,
  ChartAccount,
  BankAccount,
  Counterparty,
  ServiceItem,
  Contract,
  Sale,
  FinancialTitle,
  Settlement,
  FinancialMovement,
  StatementEntry,
  CreditCard,
  CreditCardPurchase,
  PeriodClosure,
  AuditLogEntry,
  AnnualBudgetPlan,
  ReconciliationRule,
  BankBalanceClosingRecord,
  CashCountRecord,
  SavedCashSimulationScenario,
  ImprovementRequest
} from '../types';
import { ConflictResolutionEngine } from './conflictResolutionEngine';
import { OfflineSyncService } from './offlineSyncService';

export interface SyncStats {
  companies: number;
  users: number;
  chartAccounts: number;
  bankAccounts: number;
  counterparties: number;
  services: number;
  contracts: number;
  sales: number;
  titles: number;
  settlements: number;
  movements: number;
  statements: number;
  creditCards: number;
  cardPurchases: number;
  periodClosures: number;
  auditLogs: number;
  budgetPlans: number;
  reconciliationRules: number;
  bankClosings: number;
  cashCounts: number;
  simulationScenarios: number;
  improvements: number;
  totalRecords: number;
}

export interface SyncResult {
  success: boolean;
  message: string;
  stats?: SyncStats;
  errors?: string[];
  durationMs: number;
}

// ==============================================================================
// MAPEADORES CAMEL_CASE <-> SNAKE_CASE
// ==============================================================================

function mapCompanyToDb(c: CompanyProfile) {
  return {
    id: c.id,
    company_name: c.companyName,
    trade_name: c.tradeName,
    cnpj: c.cnpj,
    email: c.email || null,
    phone: c.phone || null,
    address: c.address || null,
    city: c.city || null,
    state: c.state || null,
    zip_code: c.zipCode || null,
    currency: c.currency || 'BRL',
    timezone: c.timezone || 'America/Sao_Paulo',
    tax_regime: c.fiscalRegime || 'SIMPLES_NACIONAL'
  };
}

function mapCompanyFromDb(row: any): CompanyProfile {
  return {
    id: row.id,
    companyName: row.company_name,
    tradeName: row.trade_name,
    cnpj: row.cnpj,
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || '',
    city: row.city || '',
    state: row.state || '',
    zipCode: row.zip_code || '',
    currency: 'BRL',
    timezone: row.timezone || 'America/Sao_Paulo',
    fiscalRegime: row.tax_regime || 'SIMPLES_NACIONAL'
  };
}

function mapUserToDb(u: User) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    avatar: u.avatar || null,
    status: u.status || 'ATIVO',
    created_at: u.createdAt || new Date().toISOString()
  };
}

function mapUserFromDb(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar: row.avatar || undefined,
    status: row.status || 'ATIVO',
    createdAt: row.created_at
  };
}

function mapChartAccountToDb(ca: ChartAccount) {
  return {
    id: ca.id,
    code: ca.code,
    name: ca.name,
    parent_id: ca.parentId || null,
    nature: ca.nature,
    dremap: ca.dremap,
    cash_flow_category: ca.cashFlowCategory,
    is_analytical: ca.isAnalytical,
    is_synthetic: Boolean(ca.isSynthetic),
    is_active: Boolean(ca.isActive),
    status: ca.status || 'ATIVO',
    dre_line_mapping: ca.dreLineMapping || null,
    type: ca.type || null,
    external_code: ca.externalCode || null
  };
}

function mapChartAccountFromDb(row: any): ChartAccount {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    parentId: row.parent_id,
    nature: row.nature,
    dremap: row.dremap,
    cashFlowCategory: row.cash_flow_category,
    isAnalytical: row.is_analytical,
    isSynthetic: row.is_synthetic,
    isActive: row.is_active,
    status: row.status,
    dreLineMapping: row.dre_line_mapping,
    type: row.type,
    externalCode: row.external_code
  };
}

function mapBankAccountToDb(b: BankAccount) {
  return {
    id: b.id,
    institution: b.institution || b.name || 'Outro',
    name: b.name,
    bank_code: b.bankCode || null,
    agency: b.agency || null,
    account_number: b.accountNumber || null,
    type: b.type || 'CORRENTE',
    currency: b.currency || 'BRL',
    initial_balance: b.initialBalance,
    current_balance: b.currentBalance ?? b.initialBalance,
    base_date: b.baseDate || new Date().toISOString().split('T')[0],
    include_in_cash_flow: b.includeInCashFlow !== false,
    status: b.status || 'ATIVO',
    color: b.color || '#3B82F6'
  };
}

function mapBankAccountFromDb(row: any): BankAccount {
  return {
    id: row.id,
    institution: row.institution || 'Banco',
    name: row.name,
    bankCode: row.bank_code || undefined,
    agency: row.agency || undefined,
    accountNumber: row.account_number || undefined,
    type: row.type || 'CORRENTE',
    currency: 'BRL',
    initialBalance: Number(row.initial_balance || 0),
    currentBalance: Number(row.current_balance || row.initial_balance || 0),
    baseDate: row.base_date || new Date().toISOString().split('T')[0],
    includeInCashFlow: row.include_in_cash_flow !== false,
    status: row.status || 'ATIVO',
    color: row.color || '#3B82F6'
  };
}

function mapCounterpartyToDb(cp: Counterparty) {
  return {
    id: cp.id,
    type: cp.type,
    name: cp.name,
    trade_name: cp.tradeName || null,
    document: cp.document,
    email: cp.email || null,
    phone: cp.phone || null,
    address: cp.address || null,
    status: cp.status || 'ATIVO',
    notes: cp.notes || null,
    created_at: cp.createdAt || new Date().toISOString()
  };
}

function mapCounterpartyFromDb(row: any): Counterparty {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    tradeName: row.trade_name || undefined,
    document: row.document,
    email: row.email || '',
    phone: row.phone || '',
    address: row.address || undefined,
    status: row.status,
    notes: row.notes || undefined,
    createdAt: row.created_at
  };
}

function mapServiceToDb(s: ServiceItem) {
  return {
    id: s.id,
    name: s.name,
    description: s.description || null,
    default_price: s.defaultPrice,
    modality: s.modality,
    default_account_id: s.defaultAccountId || null,
    chart_account_id: s.chartAccountId || null,
    status: s.status || 'ATIVO'
  };
}

function mapServiceFromDb(row: any): ServiceItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    defaultPrice: Number(row.default_price || 0),
    modality: row.modality,
    defaultAccountId: row.default_account_id || '',
    chartAccountId: row.chart_account_id || undefined,
    status: row.status
  };
}

function mapContractToDb(c: Contract) {
  return {
    id: c.id,
    contract_number: c.contractNumber,
    customer_id: c.customerId,
    company_id: c.companyId || null,
    description: c.description,
    items: c.items || [],
    monthly_total: c.monthlyTotal,
    start_date: c.startDate,
    end_date: c.endDate || null,
    entry_date: c.entryDate || null,
    contract_type: c.contractType || 'RECORRENTE',
    is_recurring: c.isRecurring !== false,
    auto_generate_future_months: c.autoGenerateFutureMonths !== false,
    future_months_count: c.futureMonthsCount || 12,
    acquisition_channel: c.acquisitionChannel || null,
    acquisition_referrer_name: c.acquisitionReferrerName || null,
    acquisition_social_network: c.acquisitionSocialNetwork || null,
    acquisition_notes: c.acquisitionNotes || null,
    periodicity: c.periodicity || 'MENSAL',
    billing_frequency: c.billingFrequency || null,
    due_day: c.dueDay,
    due_rule: c.dueRule || 'SAME_MONTH',
    billing_method: c.billingMethod || 'BOLETO',
    status: c.status || 'ATIVO',
    cancellation_date: c.cancellationDate || null,
    cancellation_reason: c.cancellationReason || null,
    cancellation_notes: c.cancellationNotes || null,
    inactivated_at: c.inactivatedAt || null,
    inactivated_by: c.inactivatedBy || null,
    status_history: c.statusHistory || [],
    notes: c.notes || null,
    adjustment_rule: c.adjustmentRule || null,
    adjustments: c.adjustments || [],
    annual_balance_fee: c.annualBalanceFee || null,
    last_generated_competence: c.lastGeneratedCompetence || null,
    created_at: c.createdAt || new Date().toISOString()
  };
}

function mapContractFromDb(row: any): Contract {
  return {
    id: row.id,
    contractNumber: row.contract_number,
    customerId: row.customer_id,
    companyId: row.company_id || undefined,
    description: row.description,
    items: row.items || [],
    monthlyTotal: Number(row.monthly_total || 0),
    startDate: row.start_date,
    endDate: row.end_date || undefined,
    entryDate: row.entry_date || undefined,
    contractType: row.contract_type || 'RECORRENTE',
    isRecurring: row.is_recurring,
    autoGenerateFutureMonths: row.auto_generate_future_months,
    futureMonthsCount: row.future_months_count,
    acquisitionChannel: row.acquisition_channel || undefined,
    acquisitionReferrerName: row.acquisition_referrer_name || undefined,
    acquisitionSocialNetwork: row.acquisition_social_network || undefined,
    acquisitionNotes: row.acquisition_notes || undefined,
    periodicity: row.periodicity,
    billingFrequency: row.billing_frequency || undefined,
    dueDay: row.due_day,
    dueRule: row.due_rule,
    billingMethod: row.billing_method,
    status: row.status,
    cancellationDate: row.cancellation_date || undefined,
    cancellationReason: row.cancellation_reason || undefined,
    cancellationNotes: row.cancellation_notes || undefined,
    inactivatedAt: row.inactivated_at || undefined,
    inactivatedBy: row.inactivated_by || undefined,
    statusHistory: row.status_history || [],
    notes: row.notes || undefined,
    adjustmentRule: row.adjustment_rule || undefined,
    adjustments: row.adjustments || [],
    annualBalanceFee: row.annual_balance_fee || undefined,
    lastGeneratedCompetence: row.last_generated_competence || undefined,
    createdAt: row.created_at
  };
}

function mapSaleToDb(s: Sale) {
  return {
    id: s.id,
    sale_number: s.saleNumber,
    customer_id: s.customerId,
    competence: s.competence,
    date: s.date,
    items: s.items || [],
    gross_total: s.grossTotal,
    discount_total: s.discountTotal || 0,
    net_total: s.netTotal,
    installments_count: s.installmentsCount || 1,
    notes: s.notes || null,
    contract_id: s.contractId || null,
    contract_number: s.contractNumber || null,
    origin_type: s.originType || 'CONTRATO',
    status: s.status || 'CONFIRMADA',
    title_ids: s.titleIds || [],
    created_at: s.createdAt || new Date().toISOString()
  };
}

function mapSaleFromDb(row: any): Sale {
  return {
    id: row.id,
    saleNumber: row.sale_number,
    customerId: row.customer_id,
    competence: row.competence,
    date: row.date,
    items: row.items || [],
    grossTotal: Number(row.gross_total || 0),
    discountTotal: Number(row.discount_total || 0),
    netTotal: Number(row.net_total || 0),
    installmentsCount: Number(row.installments_count || 1),
    notes: row.notes || undefined,
    contractId: row.contract_id || undefined,
    contractNumber: row.contract_number || undefined,
    originType: row.origin_type || 'CONTRATO',
    status: row.status,
    titleIds: row.title_ids || [],
    createdAt: row.created_at
  };
}

function mapTitleToDb(t: FinancialTitle) {
  const counterparties = storage.getCounterparties();
  const existingCounterpartyIds = new Set(counterparties.map(cp => cp.id));
  
  const fallbackCounterpartyId = t.type === 'RECEBER'
    ? (counterparties.find(cp => cp.type === 'CLIENTE' || cp.type === 'AMBOS')?.id || 'cli-1')
    : (counterparties.find(cp => cp.type === 'FORNECEDOR' || cp.type === 'AMBOS')?.id || 'forn-1');

  const validCounterpartyId = t.counterpartyId && existingCounterpartyIds.has(t.counterpartyId)
    ? t.counterpartyId
    : fallbackCounterpartyId;

  const chartAccounts = storage.getChartAccounts();
  const validAccountIds = new Set(chartAccounts.filter(a => a.isAnalytical).map(a => a.id));
  const fallbackAccountId = t.type === 'RECEBER'
    ? (chartAccounts.find(a => a.isAnalytical && a.nature.startsWith('RECEITA'))?.id || 'acc-1.1.01')
    : (chartAccounts.find(a => a.isAnalytical && a.nature.startsWith('DESPESA'))?.id || 'acc-2.1.01');
  const validAccountId = t.accountId && validAccountIds.has(t.accountId)
    ? t.accountId
    : fallbackAccountId;

  return {
    id: t.id,
    company_id: t.companyId || null,
    type: t.type,
    title_number: t.titleNumber,
    counterparty_id: validCounterpartyId,
    description: t.description,
    account_id: validAccountId,
    launch_date: t.launchDate,
    competence: t.competence,
    issue_date: t.issueDate,
    due_date: t.dueDate,
    expected_cash_date: t.expectedCashDate,
    original_amount: t.originalAmount,
    settled_principal: t.settledPrincipal || 0,
    balance_principal: t.balancePrincipal,
    accrued_interest: t.accruedInterest || 0,
    accrued_fine: t.accruedFine || 0,
    document_state: t.documentState || 'CONFIRMADO',
    settlement_state: t.settlementState || 'ABERTO',
    origin_type: t.originType || 'MANUAL',
    origin_id: t.originId || null,
    installment_index: t.installmentIndex || 1,
    total_installments: t.totalInstallments || 1,
    expected_bank_account_id: t.expectedBankAccountId || null,
    credit_card_id: t.creditCardId || null,
    credit_card_invoice_month: t.creditCardInvoiceMonth || null,
    is_credit_card_purchase: Boolean(t.isCreditCardPurchase),
    sale_id: t.saleId || null,
    sale_number: t.saleNumber || null,
    contract_id: t.contractId || null,
    contract_number: t.contractNumber || null,
    barcode: t.barcode || null,
    bank_document_number: t.bankDocumentNumber || null,
    external_id: t.externalId || null,
    fingerprint: t.fingerprint || null,
    notes: t.notes || null,
    created_at: t.createdAt || new Date().toISOString()
  };
}

function mapTitleFromDb(row: any): FinancialTitle {
  return {
    id: row.id,
    companyId: row.company_id || 'comp-1',
    type: row.type,
    titleNumber: row.title_number,
    counterpartyId: row.counterparty_id,
    description: row.description,
    accountId: row.account_id,
    launchDate: row.launch_date,
    competence: row.competence,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    expectedCashDate: row.expected_cash_date,
    originalAmount: Number(row.original_amount || 0),
    settledPrincipal: Number(row.settled_principal || 0),
    balancePrincipal: Number(row.balance_principal || 0),
    accruedInterest: Number(row.accrued_interest || 0),
    accruedFine: Number(row.accrued_fine || 0),
    documentState: row.document_state,
    settlementState: row.settlement_state,
    originType: row.origin_type,
    originId: row.origin_id || undefined,
    installmentIndex: row.installment_index,
    totalInstallments: row.total_installments,
    expectedBankAccountId: row.expected_bank_account_id || undefined,
    creditCardId: row.credit_card_id || undefined,
    creditCardInvoiceMonth: row.credit_card_invoice_month || undefined,
    isCreditCardPurchase: row.is_credit_card_purchase,
    saleId: row.sale_id || undefined,
    saleNumber: row.sale_number || undefined,
    contractId: row.contract_id || undefined,
    contractNumber: row.contract_number || undefined,
    barcode: row.barcode || undefined,
    bankDocumentNumber: row.bank_document_number || undefined,
    externalId: row.external_id || undefined,
    fingerprint: row.fingerprint || undefined,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at
  };
}

function mapSettlementToDb(s: Settlement) {
  return {
    id: s.id,
    title_id: s.titleId,
    settlement_number: s.settlementNumber,
    settlement_date: s.settlementDate,
    bank_account_id: s.bankAccountId,
    components: s.components,
    notes: s.notes || null,
    voucher_ref: s.voucherRef || null,
    is_reversed: Boolean(s.isReversed),
    reversed_at: s.reversedAt || null,
    reversed_by: s.reversedBy || null,
    reversal_reason: s.reversalReason || null,
    created_at: s.createdAt || new Date().toISOString(),
    created_by: s.createdBy || 'Sistema'
  };
}

function mapSettlementFromDb(row: any): Settlement {
  return {
    id: row.id,
    titleId: row.title_id,
    settlementNumber: row.settlement_number || `LQ-${row.id.slice(-6)}`,
    settlementDate: row.settlement_date,
    bankAccountId: row.bank_account_id,
    components: row.components || {
      principalSettled: 0,
      discount: 0,
      interest: 0,
      fine: 0,
      bankFee: 0,
      netFinancialAmount: 0
    },
    notes: row.notes || undefined,
    voucherRef: row.voucher_ref || undefined,
    isReversed: Boolean(row.is_reversed),
    reversedAt: row.reversed_at || undefined,
    reversedBy: row.reversed_by || undefined,
    reversalReason: row.reversal_reason || undefined,
    createdAt: row.created_at,
    createdBy: row.created_by || 'Sistema'
  };
}

function mapMovementToDb(m: FinancialMovement) {
  return {
    id: m.id,
    bank_account_id: m.bankAccountId,
    date: m.date,
    direction: m.direction,
    amount: m.amount,
    origin_type: m.originType,
    origin_reference_id: m.originReferenceId || null,
    description: m.description,
    counterparty_id: m.counterpartyId || null,
    account_id: m.accountId || null,
    cash_flow_category: m.cashFlowCategory,
    is_reversed: Boolean(m.isReversed),
    created_at: m.createdAt || new Date().toISOString()
  };
}

function mapMovementFromDb(row: any): FinancialMovement {
  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    date: row.date,
    direction: row.direction || 'ENTRADA',
    amount: Number(row.amount || 0),
    originType: row.origin_type || 'OPERACAO_DIRETA',
    originReferenceId: row.origin_reference_id || undefined,
    description: row.description || '',
    counterpartyId: row.counterparty_id || undefined,
    accountId: row.account_id || undefined,
    cashFlowCategory: row.cash_flow_category || 'OPERACIONAL',
    isReversed: Boolean(row.is_reversed),
    createdAt: row.created_at
  };
}

function mapStatementToDb(st: StatementEntry) {
  return {
    id: st.id,
    import_batch_id: st.importBatchId || 'batch-legacy',
    bank_account_id: st.bankAccountId,
    fit_id: st.fitId || null,
    date: st.date,
    description: st.description,
    document_number: st.documentNumber || null,
    amount: st.amount,
    reconciliation_status: st.reconciliationStatus,
    suggested_title_id: st.suggestedTitleId || null,
    rule_applied: st.ruleApplied || null,
    matched_movement_id: st.matchedMovementId || null,
    matched_title_id: st.matchedTitleId || null,
    reconciliation_note: st.reconciliationNote || null
  };
}

function mapStatementFromDb(row: any): StatementEntry {
  return {
    id: row.id,
    importBatchId: row.import_batch_id || 'batch-legacy',
    bankAccountId: row.bank_account_id,
    fitId: row.fit_id || undefined,
    date: row.date,
    description: row.description,
    documentNumber: row.document_number || undefined,
    amount: Number(row.amount || 0),
    reconciliationStatus: row.reconciliation_status || 'PENDENTE',
    suggestedTitleId: row.suggested_title_id || undefined,
    ruleApplied: row.rule_applied || undefined,
    matchedMovementId: row.matched_movement_id || undefined,
    matchedTitleId: row.matched_title_id || undefined,
    reconciliationNote: row.reconciliation_note || undefined
  };
}

function mapCreditCardToDb(c: CreditCard) {
  return {
    id: c.id,
    name: c.name,
    institution: c.institution,
    brand: c.brand,
    last_four_digits: c.lastFourDigits,
    credit_limit: c.creditLimit,
    closing_day: c.closingDay,
    due_day: c.dueDay,
    color: c.color,
    default_payment_bank_account_id: c.defaultPaymentBankAccountId || null,
    status: c.status || 'ATIVO',
    notes: c.notes || null,
    created_at: c.createdAt || new Date().toISOString()
  };
}

function mapCreditCardFromDb(row: any): CreditCard {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    brand: row.brand,
    lastFourDigits: row.last_four_digits,
    creditLimit: Number(row.credit_limit || 0),
    closingDay: Number(row.closing_day || 20),
    dueDay: Number(row.due_day || 5),
    color: row.color || '#8B5CF6',
    defaultPaymentBankAccountId: row.default_payment_bank_account_id || undefined,
    status: row.status || 'ATIVO',
    notes: row.notes || undefined,
    createdAt: row.created_at
  };
}

function mapCardPurchaseToDb(p: CreditCardPurchase, fallbackAccountId: string) {
  let notesWithTag = p.notes || null;
  if (p.transactionType && p.transactionType !== 'DESPESA') {
    if (!notesWithTag) {
      notesWithTag = `[TRANSACTION_TYPE:${p.transactionType}]`;
    } else if (!notesWithTag.includes(`[TRANSACTION_TYPE:`)) {
      notesWithTag = `[TRANSACTION_TYPE:${p.transactionType}] ${notesWithTag}`;
    }
  }

  return {
    id: p.id,
    card_id: p.cardId,
    purchase_date: p.purchaseDate,
    description: p.description,
    counterparty_id: p.counterpartyId || null,
    counterparty_name: p.counterpartyName || null,
    chart_account_id: p.chartAccountId || fallbackAccountId,
    total_amount: p.totalAmount,
    installments_count: p.installmentsCount || 1,
    calculation_mode: p.calculationMode || 'TOTAL_DIVIDED',
    installment_value: p.installmentValue || null,
    installments: p.installments || [],
    invoice_month: p.invoiceMonth,
    notes: notesWithTag,
    created_at: p.createdAt || new Date().toISOString()
  };
}

function mapCardPurchaseFromDb(row: any): CreditCardPurchase {
  let transType: 'DESPESA' | 'ESTORNO' | 'CASHBACK' = row.transaction_type || 'DESPESA';
  if (row.notes && row.notes.includes('[TRANSACTION_TYPE:ESTORNO]')) {
    transType = 'ESTORNO';
  } else if (row.notes && row.notes.includes('[TRANSACTION_TYPE:CASHBACK]')) {
    transType = 'CASHBACK';
  }
  const cleanNotes = row.notes ? row.notes.replace(/\[TRANSACTION_TYPE:[A-Z]+\]\s*/g, '').trim() : undefined;

  return {
    id: row.id,
    cardId: row.card_id,
    transactionType: transType,
    purchaseDate: row.purchase_date,
    description: row.description,
    counterpartyId: row.counterparty_id || undefined,
    counterpartyName: row.counterparty_name || undefined,
    chartAccountId: row.chart_account_id,
    totalAmount: Number(row.total_amount || 0),
    installmentsCount: Number(row.installments_count || 1),
    calculationMode: row.calculation_mode || 'TOTAL_DIVIDED',
    installmentValue: row.installment_value ? Number(row.installment_value) : undefined,
    installments: row.installments || [],
    invoiceMonth: row.invoice_month,
    notes: cleanNotes || undefined,
    createdAt: row.created_at
  };
}

function mapPeriodClosureToDb(fc: PeriodClosure) {
  return {
    id: fc.id,
    year_month: fc.yearMonth || (fc as any).competence || '2026-01',
    closed_at: fc.closedAt,
    closed_by: fc.closedBy,
    notes: fc.notes || null,
    is_closed: fc.isClosed !== false,
    reopened_at: fc.reopenedAt || null,
    reopened_by: fc.reopenedBy || null,
    reopen_reason: fc.reopenReason || null,
    bank_snapshots: fc.bankSnapshots || [],
    checklist_snapshot: fc.checklistSnapshot || null
  };
}

function mapPeriodClosureFromDb(row: any): PeriodClosure {
  return {
    id: row.id,
    yearMonth: row.year_month,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    notes: row.notes || undefined,
    isClosed: row.is_closed,
    reopenedAt: row.reopened_at || undefined,
    reopenedBy: row.reopened_by || undefined,
    reopenReason: row.reopen_reason || undefined,
    bankSnapshots: row.bank_snapshots || [],
    checklistSnapshot: row.checklist_snapshot || undefined
  };
}

function mapReconciliationRuleToDb(r: ReconciliationRule) {
  return {
    id: r.id,
    name: r.name,
    pattern: r.pattern,
    match_type: r.matchType,
    transaction_type: r.transactionType,
    chart_account_id: r.chartAccountId,
    counterparty_id: r.counterpartyId || null,
    action: r.action,
    active: r.active !== false,
    priority: r.priority || 10,
    description_template: r.descriptionTemplate || null,
    tags: r.tags || []
  };
}

function mapReconciliationRuleFromDb(row: any): ReconciliationRule {
  return {
    id: row.id,
    name: row.name,
    pattern: row.pattern,
    matchType: row.match_type,
    transactionType: row.transaction_type,
    chartAccountId: row.chart_account_id,
    counterpartyId: row.counterparty_id || undefined,
    action: row.action,
    active: row.active !== false,
    priority: row.priority || 10,
    descriptionTemplate: row.description_template || undefined,
    tags: row.tags || [],
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString()
  };
}

function mapAuditLogToDb(l: AuditLogEntry) {
  return {
    id: l.id,
    timestamp: l.timestamp,
    user_name: l.userName,
    user_role: l.userRole,
    action: l.action,
    module: l.module,
    record_id: l.recordId || null,
    details: l.details,
    previous_value: l.previousValue || null,
    new_value: l.newValue || null
  };
}

function mapAuditLogFromDb(row: any): AuditLogEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    userName: row.user_name,
    userRole: row.user_role,
    action: row.action,
    module: row.module,
    recordId: row.record_id || undefined,
    details: row.details,
    previousValue: row.previous_value || undefined,
    newValue: row.new_value || undefined
  };
}

export const CONTAJU_TABLES = {
  COMPANIES: 'contaju_companies',
  USERS: 'contaju_users',
  CHART_ACCOUNTS: 'contaju_chart_of_accounts',
  BANK_ACCOUNTS: 'contaju_bank_accounts',
  COUNTERPARTIES: 'contaju_counterparties',
  SERVICES: 'contaju_services',
  CONTRACTS: 'contaju_contracts',
  SALES: 'contaju_sales',
  TITLES: 'contaju_financial_titles',
  SETTLEMENTS: 'contaju_settlements',
  MOVEMENTS: 'contaju_financial_movements',
  STATEMENTS: 'contaju_statement_entries',
  CREDIT_CARDS: 'contaju_credit_cards',
  CARD_PURCHASES: 'contaju_card_purchases',
  PERIOD_CLOSURES: 'contaju_period_closures',
  RECONCILIATION_RULES: 'contaju_reconciliation_rules',
  BANK_CLOSINGS: 'contaju_bank_balance_closings',
  BUDGET_PLANS: 'contaju_budget_plans',
  AUDIT_LOGS: 'contaju_audit_logs'
} as const;

// ==============================================================================
// CLASSE PRINCIPAL DE SINCRONIZAÇÃO
// ==============================================================================

class SupabaseSyncService {
  private isSyncing = false;
  private lastSyncTimestamp: string | null = null;

  public getLastSyncTime(): string | null {
    if (this.lastSyncTimestamp) return this.lastSyncTimestamp;
    try {
      return localStorage.getItem('contaju_last_supabase_sync');
    } catch {
      return null;
    }
  }

  private setLastSyncTime(isoDate: string) {
    this.lastSyncTimestamp = isoDate;
    try {
      localStorage.setItem('contaju_last_supabase_sync', isoDate);
    } catch {
      // ignore
    }
  }

  /**
   * Envia todos os dados locais para o Supabase (Push / Seed Remoto)
   * Usa upsert para não duplicar dados existentes nem corromper integridade.
   */
  public async syncAllToSupabase(): Promise<SyncResult> {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message: 'Supabase não configurado. Adicione a URL e a Anon Key.',
        durationMs: 0
      };
    }

    if (this.isSyncing) {
      return {
        success: false,
        message: 'Uma sincronização já está em andamento.',
        durationMs: 0
      };
    }

    const client = getSupabaseClient();
    if (!client) {
      return {
        success: false,
        message: 'Cliente Supabase indisponível.',
        durationMs: 0
      };
    }

    this.isSyncing = true;
    const startTime = performance.now();
    const errors: string[] = [];

    const stats: SyncStats = {
      companies: 0,
      users: 0,
      chartAccounts: 0,
      bankAccounts: 0,
      counterparties: 0,
      services: 0,
      contracts: 0,
      sales: 0,
      titles: 0,
      settlements: 0,
      movements: 0,
      statements: 0,
      creditCards: 0,
      cardPurchases: 0,
      periodClosures: 0,
      auditLogs: 0,
      budgetPlans: 0,
      reconciliationRules: 0,
      bankClosings: 0,
      cashCounts: 0,
      simulationScenarios: 0,
      improvements: 0,
      totalRecords: 0
    };

    try {
      // 1. Empresa
      const company = storage.getCompany();
      if (company?.id) {
        const { error } = await client.from(CONTAJU_TABLES.COMPANIES).upsert([mapCompanyToDb(company)], { onConflict: 'id' });
        if (error) errors.push(`Empresas: ${error.message}`);
        else stats.companies = 1;
      }

      // 2. Usuários
      const users = storage.getUsers();
      if (users.length > 0) {
        const { error } = await client.from(CONTAJU_TABLES.USERS).upsert(users.map(mapUserToDb), { onConflict: 'id' });
        if (error) errors.push(`Usuários: ${error.message}`);
        else stats.users = users.length;
      }

      // 3. Plano de Contas
      const accounts = storage.getChartAccounts();
      if (accounts.length > 0) {
        const mapped = accounts.map(mapChartAccountToDb);
        const { error } = await client.from(CONTAJU_TABLES.CHART_ACCOUNTS).upsert(mapped, { onConflict: 'id' });
        if (error) errors.push(`Plano de Contas: ${error.message}`);
        else stats.chartAccounts = accounts.length;
      }

      // 4. Contas Bancárias
      const banks = storage.getBankAccounts();
      if (banks.length > 0) {
        const { error } = await client.from(CONTAJU_TABLES.BANK_ACCOUNTS).upsert(banks.map(mapBankAccountToDb), { onConflict: 'id' });
        if (error) errors.push(`Contas Bancárias: ${error.message}`);
        else stats.bankAccounts = banks.length;
      }

      // 5. Contrapartes (Clientes/Fornecedores)
      const counterparties = storage.getCounterparties();
      if (counterparties.length > 0) {
        const { error } = await client.from(CONTAJU_TABLES.COUNTERPARTIES).upsert(counterparties.map(mapCounterpartyToDb), { onConflict: 'id' });
        if (error) errors.push(`Clientes/Fornecedores: ${error.message}`);
        else stats.counterparties = counterparties.length;
      }

      // 6. Serviços
      const services = storage.getServices();
      if (services.length > 0) {
        const { error } = await client.from(CONTAJU_TABLES.SERVICES).upsert(services.map(mapServiceToDb), { onConflict: 'id' });
        if (error) errors.push(`Serviços: ${error.message}`);
        else stats.services = services.length;
      }

      // 7. Contratos
      const contracts = storage.getContracts();
      if (contracts.length > 0) {
        const { error } = await client.from(CONTAJU_TABLES.CONTRACTS).upsert(contracts.map(mapContractToDb), { onConflict: 'id' });
        if (error) errors.push(`Contratos: ${error.message}`);
        else stats.contracts = contracts.length;
      }

      // 8. Vendas
      const sales = storage.getSales();
      if (sales.length > 0) {
        const { error } = await client.from(CONTAJU_TABLES.SALES).upsert(sales.map(mapSaleToDb), { onConflict: 'id' });
        if (error) errors.push(`Vendas: ${error.message}`);
        else stats.sales = sales.length;
      }

      // 9. Títulos Financeiros
      const titles = storage.getTitles();
      if (titles.length > 0) {
        const chunks = this.chunkArray(titles.map(mapTitleToDb), 100);
        let titleErrors = 0;
        for (const chunk of chunks) {
          const { error } = await client.from(CONTAJU_TABLES.TITLES).upsert(chunk, { onConflict: 'id' });
          if (error) {
            titleErrors++;
            errors.push(`Títulos Financeiros: ${error.message}`);
            break;
          }
        }
        if (titleErrors === 0) stats.titles = titles.length;
      }

      // 10. Baixas / Liquidações
      const settlements = storage.getSettlements();
      if (settlements.length > 0) {
        const chunks = this.chunkArray(settlements.map(mapSettlementToDb), 100);
        let settErrors = 0;
        for (const chunk of chunks) {
          const { error } = await client.from(CONTAJU_TABLES.SETTLEMENTS).upsert(chunk, { onConflict: 'id' });
          if (error) {
            settErrors++;
            errors.push(`Liquidações: ${error.message}`);
            break;
          }
        }
        if (settErrors === 0) stats.settlements = settlements.length;
      }

      // 11. Movimentações de Caixa
      const movements = storage.getMovements();
      if (movements.length > 0) {
        const chunks = this.chunkArray(movements.map(mapMovementToDb), 100);
        let movErrors = 0;
        for (const chunk of chunks) {
          const { error } = await client.from(CONTAJU_TABLES.MOVEMENTS).upsert(chunk, { onConflict: 'id' });
          if (error) {
            movErrors++;
            errors.push(`Movimentações de Caixa: ${error.message}`);
            break;
          }
        }
        if (movErrors === 0) stats.movements = movements.length;
      }

      // 12. Extrato Bancário
      const statements = storage.getStatementEntries();
      const validMovementIds = new Set(movements.map(m => m.id));
      const validTitleIds = new Set(titles.map(t => t.id));
      if (statements.length > 0) {
        const mappedStatements = statements.map(st => {
          const mapped = mapStatementToDb(st);
          if (mapped.matched_movement_id && !validMovementIds.has(mapped.matched_movement_id)) {
            mapped.matched_movement_id = null;
          }
          if (mapped.matched_title_id && !validTitleIds.has(mapped.matched_title_id)) {
            mapped.matched_title_id = null;
          }
          if (mapped.suggested_title_id && !validTitleIds.has(mapped.suggested_title_id)) {
            mapped.suggested_title_id = null;
          }
          return mapped;
        });
        const chunks = this.chunkArray(mappedStatements, 100);
        let stmtErrors = 0;
        for (const chunk of chunks) {
          const { error } = await client.from(CONTAJU_TABLES.STATEMENTS).upsert(chunk, { onConflict: 'id' });
          if (error) {
            stmtErrors++;
            errors.push(`Extrato Bancário: ${error.message}`);
            break;
          }
        }
        if (stmtErrors === 0) stats.statements = statements.length;
      }

      // 13. Cartões de Crédito
      const cards = storage.getCreditCards();
      if (cards.length > 0) {
        const mappedCards = cards.map(c => ({
          id: c.id,
          name: c.name,
          institution: c.institution,
          brand: c.brand,
          last_four_digits: c.lastFourDigits,
          credit_limit: c.creditLimit,
          closing_day: c.closingDay,
          due_day: c.dueDay,
          color: c.color,
          default_payment_bank_account_id: c.defaultPaymentBankAccountId || null,
          status: c.status || 'ATIVO',
          notes: c.notes || null,
          created_at: c.createdAt || new Date().toISOString()
        }));
        const { error } = await client.from(CONTAJU_TABLES.CREDIT_CARDS).upsert(mappedCards, { onConflict: 'id' });
        if (error) errors.push(`Cartões: ${error.message}`);
        else stats.creditCards = cards.length;
      }

      // 14. Compras de Cartão
      const cardPurchases = storage.getCardPurchases();
      const validAccountIds = new Set(storage.getChartAccounts().map(a => a.id));
      const fallbackExpenseAccountId = storage.getChartAccounts().find(a => a.isAnalytical && a.nature.startsWith('DESPESA'))?.id || 'acc-3.2.04';
      if (cardPurchases.length > 0) {
        const mappedPurchases = cardPurchases.map(p => ({
          id: p.id,
          card_id: p.cardId,
          purchase_date: p.purchaseDate,
          description: p.description,
          counterparty_id: p.counterpartyId || null,
          counterparty_name: p.counterpartyName || null,
          chart_account_id: validAccountIds.has(p.chartAccountId) ? p.chartAccountId : fallbackExpenseAccountId,
          total_amount: p.totalAmount,
          installments_count: p.installmentsCount || 1,
          calculation_mode: p.calculationMode,
          installment_value: p.installmentValue,
          installments: p.installments || [],
          invoice_month: p.invoiceMonth,
          notes: p.notes || null,
          created_at: p.createdAt || new Date().toISOString()
        }));
        const { error } = await client.from(CONTAJU_TABLES.CARD_PURCHASES).upsert(mappedPurchases, { onConflict: 'id' });
        if (error) errors.push(`Compras Cartão: ${error.message}`);
        else stats.cardPurchases = cardPurchases.length;
      }

      // 15. Fechamentos de Período
      const closures = storage.getPeriodClosures();
      if (closures.length > 0) {
        const mappedClosures = closures.map(fc => ({
          id: fc.id,
          year_month: fc.yearMonth || fc.competence || '2026-01',
          closed_at: fc.closedAt,
          closed_by: fc.closedBy,
          notes: fc.notes || null,
          is_closed: fc.isClosed !== false,
          reopened_at: fc.reopenedAt || null,
          reopened_by: fc.reopenedBy || null,
          reopen_reason: fc.reopenReason || null,
          bank_snapshots: fc.bankSnapshots || [],
          checklist_snapshot: fc.checklistSnapshot || null
        }));
        const { error } = await client.from(CONTAJU_TABLES.PERIOD_CLOSURES).upsert(mappedClosures, { onConflict: 'id' });
        if (error) errors.push(`Fechamentos de Período: ${error.message}`);
        else stats.periodClosures = closures.length;
      }

      // 16. Regras de Conciliação
      const rules = storage.getReconciliationRules();
      if (rules.length > 0) {
        const mappedRules = rules.map(r => ({
          id: r.id,
          name: r.name,
          pattern: r.pattern,
          match_type: r.matchType,
          transaction_type: r.transactionType,
          chart_account_id: validAccountIds.has(r.chartAccountId) ? r.chartAccountId : fallbackExpenseAccountId,
          counterparty_id: r.counterpartyId || null,
          action: r.action,
          active: r.active,
          priority: r.priority || 10,
          description_template: r.descriptionTemplate || null,
          tags: r.tags || [],
          created_at: r.createdAt || new Date().toISOString(),
          updated_at: r.updatedAt || new Date().toISOString()
        }));
        const { error } = await client.from(CONTAJU_TABLES.RECONCILIATION_RULES).upsert(mappedRules, { onConflict: 'id' });
        if (error) errors.push(`Regras de Conciliação: ${error.message}`);
        else stats.reconciliationRules = rules.length;
      }

      // 17. Fechamentos de Saldo Bancário
      const bankClosings = storage.getBankClosingRecords();
      if (bankClosings.length > 0) {
        const mappedClosings = bankClosings.map(bc => ({
          id: bc.id,
          bank_account_id: bc.bankAccountId,
          closing_date: bc.closingDate,
          closing_time: bc.closingTime,
          closed_by: bc.closedBy,
          system_balance: bc.systemBalance,
          real_balance: bc.realBalance,
          difference: bc.difference,
          status: bc.status,
          notes: bc.notes || null,
          created_at: bc.createdAt || new Date().toISOString()
        }));
        const { error } = await client.from(CONTAJU_TABLES.BANK_CLOSINGS).upsert(mappedClosings, { onConflict: 'id' });
        if (error) errors.push(`Fechamentos de Saldo: ${error.message}`);
        else stats.bankClosings = bankClosings.length;
      }

      // 18. Orçamentos Anuais
      const budgetPlans = storage.getBudgetPlans();
      if (budgetPlans.length > 0) {
        const mappedPlans = budgetPlans.map(bp => ({
          id: bp.id,
          year: bp.year,
          name: bp.name,
          updated_at: bp.updatedAt || new Date().toISOString(),
          notes: bp.notes || null,
          items: bp.items || []
        }));
        const { error } = await client.from(CONTAJU_TABLES.BUDGET_PLANS).upsert(mappedPlans, { onConflict: 'id' });
        if (error) errors.push(`Planos Orçamentários: ${error.message}`);
        else stats.budgetPlans = budgetPlans.length;
      }

      // 19. Auditoria
      const logs = storage.getAuditLogs();
      if (logs.length > 0) {
        const mappedLogs = logs.slice(0, 200).map(l => ({
          id: l.id,
          timestamp: l.timestamp,
          user_name: l.userName,
          user_role: l.userRole,
          action: l.action,
          module: l.module,
          record_id: l.recordId || null,
          details: l.details,
          previous_value: l.previousValue || null,
          new_value: l.newValue || null
        }));
        const { error } = await client.from(CONTAJU_TABLES.AUDIT_LOGS).upsert(mappedLogs, { onConflict: 'id' });
        if (error) errors.push(`Logs de Auditoria: ${error.message}`);
        else stats.auditLogs = mappedLogs.length;
      }

      stats.totalRecords = 
        stats.companies +
        stats.users +
        stats.chartAccounts +
        stats.bankAccounts +
        stats.counterparties +
        stats.services +
        stats.contracts +
        stats.sales +
        stats.titles +
        stats.settlements +
        stats.movements +
        stats.statements +
        stats.creditCards +
        stats.cardPurchases +
        stats.periodClosures +
        stats.reconciliationRules +
        stats.bankClosings +
        stats.budgetPlans +
        stats.auditLogs;

      const durationMs = Math.round(performance.now() - startTime);
      const nowIso = new Date().toISOString();
      this.setLastSyncTime(nowIso);

      if (errors.length > 0) {
        return {
          success: false,
          message: `Sincronização parcial com o Supabase: ${stats.totalRecords} registros enviados, mas houveram ${errors.length} erro(s).`,
          stats,
          errors,
          durationMs
        };
      }

      return {
        success: true,
        message: `Sincronização com o Supabase concluída com sucesso! ${stats.totalRecords} registros enviados em ${durationMs}ms.`,
        stats,
        durationMs
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Falha crítica durante sincronização: ${msg}`,
        errors: [...errors, msg],
        stats,
        durationMs
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Baixa dados do Supabase e atualiza o armazenamento local (Pull)
   */
  public async pullAllFromSupabase(): Promise<SyncResult> {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message: 'Supabase não configurado.',
        durationMs: 0
      };
    }

    const client = getSupabaseClient();
    if (!client) {
      return {
        success: false,
        message: 'Cliente Supabase indisponível.',
        durationMs: 0
      };
    }

    const startTime = performance.now();
    const errors: string[] = [];
    const stats: SyncStats = {
      companies: 0,
      users: 0,
      chartAccounts: 0,
      bankAccounts: 0,
      counterparties: 0,
      services: 0,
      contracts: 0,
      sales: 0,
      titles: 0,
      settlements: 0,
      movements: 0,
      statements: 0,
      creditCards: 0,
      cardPurchases: 0,
      periodClosures: 0,
      auditLogs: 0,
      budgetPlans: 0,
      reconciliationRules: 0,
      bankClosings: 0,
      cashCounts: 0,
      simulationScenarios: 0,
      improvements: 0,
      totalRecords: 0
    };

    try {
      // 1. Empresa
      const { data: compData, error: compErr } = await client.from(CONTAJU_TABLES.COMPANIES).select('*').limit(1);
      if (compErr) errors.push(`Empresas: ${compErr.message}`);
      else if (compData && compData.length > 0) {
        storage.saveCompany(mapCompanyFromDb(compData[0]));
        stats.companies = 1;
      }

      // 2. Usuários
      const { data: usersData, error: usersErr } = await client.from(CONTAJU_TABLES.USERS).select('*');
      if (usersErr) errors.push(`Usuários: ${usersErr.message}`);
      else if (usersData && usersData.length > 0) {
        storage.saveUsers(usersData.map(mapUserFromDb));
        stats.users = usersData.length;
      }

      // 3. Plano de Contas
      const { data: accountsData, error: accErr } = await client.from(CONTAJU_TABLES.CHART_ACCOUNTS).select('*');
      if (accErr) errors.push(`Plano de Contas: ${accErr.message}`);
      else if (accountsData && accountsData.length > 0) {
        storage.saveChartAccounts(accountsData.map(mapChartAccountFromDb));
        stats.chartAccounts = accountsData.length;
      }

      // 4. Contas Bancárias
      const { data: banksData, error: banksErr } = await client.from(CONTAJU_TABLES.BANK_ACCOUNTS).select('*');
      if (banksErr) errors.push(`Contas Bancárias: ${banksErr.message}`);
      else if (banksData && banksData.length > 0) {
        storage.saveBankAccounts(banksData.map(mapBankAccountFromDb));
        stats.bankAccounts = banksData.length;
      }

      // 5. Contrapartes
      const { data: cpData, error: cpErr } = await client.from(CONTAJU_TABLES.COUNTERPARTIES).select('*');
      if (cpErr) errors.push(`Contrapartes: ${cpErr.message}`);
      else if (cpData && cpData.length > 0) {
        storage.saveCounterparties(cpData.map(mapCounterpartyFromDb));
        stats.counterparties = cpData.length;
      }

      // 6. Serviços
      const { data: srvData, error: srvErr } = await client.from(CONTAJU_TABLES.SERVICES).select('*');
      if (srvErr) errors.push(`Serviços: ${srvErr.message}`);
      else if (srvData && srvData.length > 0) {
        storage.saveServices(srvData.map(mapServiceFromDb));
        stats.services = srvData.length;
      }

      // 7. Contratos
      const { data: ctrData, error: ctrErr } = await client.from(CONTAJU_TABLES.CONTRACTS).select('*');
      if (ctrErr) errors.push(`Contratos: ${ctrErr.message}`);
      else if (ctrData && ctrData.length > 0) {
        storage.saveContracts(ctrData.map(mapContractFromDb));
        stats.contracts = ctrData.length;
      }

      // 8. Vendas
      const { data: salesData, error: salesErr } = await client.from(CONTAJU_TABLES.SALES).select('*');
      if (salesErr) errors.push(`Vendas: ${salesErr.message}`);
      else if (salesData && salesData.length > 0) {
        storage.saveSales(salesData.map(mapSaleFromDb));
        stats.sales = salesData.length;
      }

      // 9 e 10. Títulos Financeiros e Baixas com Resolução Automática de Conflitos (LWW + Preservação de Saldo)
      const { data: titlesData, error: titlesErr } = await client.from(CONTAJU_TABLES.TITLES).select('*');
      if (titlesErr) errors.push(`Títulos: ${titlesErr.message}`);

      const { data: settData, error: settErr } = await client.from(CONTAJU_TABLES.SETTLEMENTS).select('*');
      if (settErr) errors.push(`Liquidações: ${settErr.message}`);

      // 1. Consolida Settlements (Baixas) primeiro, unificando registros remotos e locais
      const remoteSettlements: Settlement[] = (settData && settData.length > 0)
        ? settData.map(mapSettlementFromDb)
        : [];
      const localSettlements = storage.getSettlements();
      const settlementMergeResult = ConflictResolutionEngine.mergeSettlements(localSettlements, remoteSettlements);
      storage.saveSettlements(settlementMergeResult.mergedSettlements);
      stats.settlements = settlementMergeResult.mergedSettlements.length;

      // 2. Consolida Títulos Financeiros usando LWW e recalculando saldos com as baixas unificadas
      const remoteTitles: FinancialTitle[] = (titlesData && titlesData.length > 0)
        ? titlesData.map(mapTitleFromDb)
        : [];
      const localTitles = storage.getTitles();
      const titleMergeResult = ConflictResolutionEngine.mergeTitleCollections(
        localTitles,
        remoteTitles,
        settlementMergeResult.mergedSettlements
      );
      storage.saveTitles(titleMergeResult.mergedTitles);
      stats.titles = titleMergeResult.mergedTitles.length;

      // 3. Notifica se conflitos concorrentes foram mitigados
      if (titleMergeResult.conflictsResolvedCount > 0) {
        OfflineSyncService.notifyConflictResolved(
          `${titleMergeResult.conflictsResolvedCount} conflito(s) entre dispositivos foram resolvidos automaticamente sem perda de saldo.`,
          titleMergeResult.conflictsResolvedCount,
          titleMergeResult.conflictReports
        );
      }

      // 11. Movimentações
      const { data: movData, error: movErr } = await client.from(CONTAJU_TABLES.MOVEMENTS).select('*');
      if (movErr) errors.push(`Movimentações: ${movErr.message}`);
      else if (movData && movData.length > 0) {
        storage.saveMovements(movData.map(mapMovementFromDb));
        stats.movements = movData.length;
      }

      // 12. Extratos
      const { data: stmtData, error: stmtErr } = await client.from(CONTAJU_TABLES.STATEMENTS).select('*');
      if (stmtErr) errors.push(`Extratos: ${stmtErr.message}`);
      else if (stmtData && stmtData.length > 0) {
        storage.saveStatementEntries(stmtData.map(mapStatementFromDb));
        stats.statements = stmtData.length;
      }

      // 13. Cartões de Crédito (Higienizando dados mockados legados)
      const { data: cardsData, error: cardsErr } = await client.from(CONTAJU_TABLES.CREDIT_CARDS).select('*');
      if (cardsErr) errors.push(`Cartões: ${cardsErr.message}`);
      else if (cardsData && cardsData.length > 0) {
        // Resposta vazia da nuvem (sessão vencida, por exemplo) nunca apaga os cartões que já estão no aparelho
        const sanitizedCards = cardsData
          .filter(c => c.id !== 'card-1' && c.id !== 'card-2')
          .map(mapCreditCardFromDb);
        storage.saveCreditCards(sanitizedCards);
        stats.creditCards = sanitizedCards.length;

        // Limpeza remota de cartões "mock" desativada: apagava dados do Supabase ao abrir o app.
      }

      // 14. Compras de Cartão (Higienizando dados mockados legados)
      const { data: purchasesData, error: purErr } = await client.from(CONTAJU_TABLES.CARD_PURCHASES).select('*');
      if (purErr) errors.push(`Compras Cartão: ${purErr.message}`);
      else if (purchasesData && purchasesData.length > 0) {
        const isMockPur = (id: string) => Boolean(id && /^pur-(?:[1-9]|1[0-9]|20)$/.test(id));
        const sanitizedPurchases = purchasesData
          .filter(p => !isMockPur(p.id) && p.card_id !== 'card-1' && p.card_id !== 'card-2')
          .map(mapCardPurchaseFromDb);
        storage.saveCardPurchases(sanitizedPurchases);
        stats.cardPurchases = sanitizedPurchases.length;

        // Limpeza remota de compras "mock" desativada: apagava dados do Supabase ao abrir o app.
      }

      // 15. Fechamentos de Período
      const { data: closuresData, error: clsErr } = await client.from(CONTAJU_TABLES.PERIOD_CLOSURES).select('*');
      if (clsErr) errors.push(`Fechamentos de Período: ${clsErr.message}`);
      else if (closuresData && closuresData.length > 0) {
        storage.savePeriodClosures(closuresData.map(mapPeriodClosureFromDb));
        stats.periodClosures = closuresData.length;
      }

      // 16. Regras de Conciliação
      const { data: rulesData, error: rlsErr } = await client.from(CONTAJU_TABLES.RECONCILIATION_RULES).select('*');
      if (rlsErr) errors.push(`Regras de Conciliação: ${rlsErr.message}`);
      else if (rulesData && rulesData.length > 0) {
        storage.saveReconciliationRules(rulesData.map(mapReconciliationRuleFromDb));
        stats.reconciliationRules = rulesData.length;
      }

      // 17. Logs de Auditoria
      const { data: auditData, error: audErr } = await client.from(CONTAJU_TABLES.AUDIT_LOGS).select('*').order('timestamp', { ascending: false }).limit(200);
      if (audErr) errors.push(`Auditoria: ${audErr.message}`);
      else if (auditData && auditData.length > 0) {
        storage.saveAuditLogs(auditData.map(mapAuditLogFromDb));
        stats.auditLogs = auditData.length;
      }

      stats.totalRecords = 
        stats.companies +
        stats.users +
        stats.chartAccounts +
        stats.bankAccounts +
        stats.counterparties +
        stats.services +
        stats.contracts +
        stats.sales +
        stats.titles +
        stats.settlements +
        stats.movements +
        stats.statements +
        stats.creditCards +
        stats.cardPurchases +
        stats.periodClosures +
        stats.reconciliationRules +
        stats.auditLogs;

      const durationMs = Math.round(performance.now() - startTime);
      const nowIso = new Date().toISOString();
      this.setLastSyncTime(nowIso);

      return {
        success: errors.length === 0,
        message: errors.length === 0
          ? `Dados do Supabase baixados com sucesso! ${stats.totalRecords} registros carregados.`
          : `Dados baixados parcialmente (${stats.totalRecords} registros). ${errors.length} erro(s).`,
        stats,
        errors,
        durationMs
      };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Falha ao baixar dados do Supabase: ${msg}`,
        errors: [...errors, msg],
        stats,
        durationMs
      };
    }
  }

  // ==============================================================================
  // DIRECT REAL-TIME MUTATIONS (PERSISTÊNCIA DIRETA NO BANCO DE DADOS SUPABASE)
  // ==============================================================================

  public async saveTitleDirectly(title: FinancialTitle): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'Supabase não conectado' };
    try {
      const payload = mapTitleToDb(title);
      const { error } = await client.from(CONTAJU_TABLES.TITLES).upsert([payload], { onConflict: 'id' });
      if (error) {
        console.error('[SupabaseDirect] Erro ao salvar título diretamente:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      console.error('[SupabaseDirect] Falha de rede ao salvar título:', e);
      return { success: false, error: e.message };
    }
  }

  public async saveTitlesDirectly(titles: FinancialTitle[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || titles.length === 0) return { success: false, error: 'Supabase não conectado ou lista vazia' };
    try {
      const chunks = this.chunkArray(titles, 100);
      for (const chunk of chunks) {
        const payload = chunk.map(mapTitleToDb);
        const { error } = await client.from(CONTAJU_TABLES.TITLES).upsert(payload, { onConflict: 'id' });
        if (error) {
          console.error('[SupabaseDirect] Erro no lote de títulos:', error);
          return { success: false, error: error.message };
        }
      }
      return { success: true };
    } catch (e: any) {
      console.error('[SupabaseDirect] Falha ao sincronizar títulos:', e);
      return { success: false, error: e.message };
    }
  }

  public async deleteTitleDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'Supabase não conectado' };
    try {
      const { error } = await client.from(CONTAJU_TABLES.TITLES).delete().eq('id', id);
      if (error) {
        console.error('[SupabaseDirect] Erro ao deletar título:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteTitlesDirectly(ids: string[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || ids.length === 0) return { success: false };
    try {
      const chunks = this.chunkArray(ids, 100);
      for (const chunk of chunks) {
        const { error } = await client.from(CONTAJU_TABLES.TITLES).delete().in('id', chunk);
        if (error) {
          console.error('[SupabaseDirect] Erro ao deletar títulos em lote:', error);
          return { success: false, error: error.message };
        }
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveContractDirectly(contract: Contract): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'Supabase não conectado' };
    try {
      const payload = mapContractToDb(contract);
      const { error } = await client.from(CONTAJU_TABLES.CONTRACTS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveContractsDirectly(contracts: Contract[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || contracts.length === 0) return { success: false };
    try {
      const payload = contracts.map(mapContractToDb);
      const { error } = await client.from(CONTAJU_TABLES.CONTRACTS).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteContractDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.CONTRACTS).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveCounterpartyDirectly(counterparty: Counterparty): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapCounterpartyToDb(counterparty);
      const { error } = await client.from(CONTAJU_TABLES.COUNTERPARTIES).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveCounterpartiesDirectly(counterparties: Counterparty[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || counterparties.length === 0) return { success: false };
    try {
      const payload = counterparties.map(mapCounterpartyToDb);
      const { error } = await client.from(CONTAJU_TABLES.COUNTERPARTIES).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteCounterpartyDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.COUNTERPARTIES).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveSettlementDirectly(settlement: Settlement): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapSettlementToDb(settlement);
      const { error } = await client.from(CONTAJU_TABLES.SETTLEMENTS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveSettlementsDirectly(settlements: Settlement[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || settlements.length === 0) return { success: false };
    try {
      const payload = settlements.map(mapSettlementToDb);
      const { error } = await client.from(CONTAJU_TABLES.SETTLEMENTS).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteSettlementDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.SETTLEMENTS).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveMovementDirectly(movement: FinancialMovement): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapMovementToDb(movement);
      const { error } = await client.from(CONTAJU_TABLES.MOVEMENTS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveMovementsDirectly(movements: FinancialMovement[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || movements.length === 0) return { success: false };
    try {
      const payload = movements.map(mapMovementToDb);
      const { error } = await client.from(CONTAJU_TABLES.MOVEMENTS).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteMovementDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.MOVEMENTS).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveBankAccountDirectly(bank: BankAccount): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapBankAccountToDb(bank);
      const { error } = await client.from(CONTAJU_TABLES.BANK_ACCOUNTS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveBankAccountsDirectly(banks: BankAccount[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || banks.length === 0) return { success: false };
    try {
      const payload = banks.map(mapBankAccountToDb);
      const { error } = await client.from(CONTAJU_TABLES.BANK_ACCOUNTS).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteBankAccountDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.BANK_ACCOUNTS).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveCreditCardDirectly(card: CreditCard): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapCreditCardToDb(card);
      const { error } = await client.from(CONTAJU_TABLES.CREDIT_CARDS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveCreditCardsDirectly(cards: CreditCard[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || cards.length === 0) return { success: false };
    try {
      const payload = cards.map(mapCreditCardToDb);
      const { error } = await client.from(CONTAJU_TABLES.CREDIT_CARDS).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteCreditCardDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.CREDIT_CARDS).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveCardPurchaseDirectly(purchase: CreditCardPurchase): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const fallbackId = storage.getChartAccounts().find(a => a.isAnalytical && a.nature.startsWith('DESPESA'))?.id || 'acc-3.2.04';
      const payload = mapCardPurchaseToDb(purchase, fallbackId);
      const { error } = await client.from(CONTAJU_TABLES.CARD_PURCHASES).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveCardPurchasesDirectly(purchases: CreditCardPurchase[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || purchases.length === 0) return { success: false };
    try {
      const fallbackId = storage.getChartAccounts().find(a => a.isAnalytical && a.nature.startsWith('DESPESA'))?.id || 'acc-3.2.04';
      const payload = purchases.map(p => mapCardPurchaseToDb(p, fallbackId));
      const { error } = await client.from(CONTAJU_TABLES.CARD_PURCHASES).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteCardPurchaseDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.CARD_PURCHASES).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveStatementEntryDirectly(entry: StatementEntry): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapStatementToDb(entry);
      const { error } = await client.from(CONTAJU_TABLES.STATEMENTS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveStatementEntriesDirectly(entries: StatementEntry[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || entries.length === 0) return { success: false };
    try {
      const payload = entries.map(mapStatementToDb);
      const { error } = await client.from(CONTAJU_TABLES.STATEMENTS).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteStatementEntryDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.STATEMENTS).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveSaleDirectly(sale: Sale): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapSaleToDb(sale);
      const { error } = await client.from(CONTAJU_TABLES.SALES).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveSalesDirectly(sales: Sale[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || sales.length === 0) return { success: false };
    try {
      const payload = sales.map(mapSaleToDb);
      const { error } = await client.from(CONTAJU_TABLES.SALES).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteSaleDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.SALES).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveCompanyDirectly(comp: CompanyProfile): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapCompanyToDb(comp);
      const { error } = await client.from(CONTAJU_TABLES.COMPANIES).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveUserDirectly(user: User): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapUserToDb(user);
      const { error } = await client.from(CONTAJU_TABLES.USERS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveUsersDirectly(users: User[]): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client || users.length === 0) return { success: false };
    try {
      const payload = users.map(mapUserToDb);
      const { error } = await client.from(CONTAJU_TABLES.USERS).upsert(payload, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async savePeriodClosureDirectly(closure: PeriodClosure): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapPeriodClosureToDb(closure);
      const { error } = await client.from(CONTAJU_TABLES.PERIOD_CLOSURES).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveReconciliationRuleDirectly(rule: ReconciliationRule): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapReconciliationRuleToDb(rule);
      const { error } = await client.from(CONTAJU_TABLES.RECONCILIATION_RULES).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteReconciliationRuleDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.RECONCILIATION_RULES).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async deleteUserDirectly(id: string): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const { error } = await client.from(CONTAJU_TABLES.USERS).delete().eq('id', id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async saveAuditLogDirectly(log: AuditLogEntry): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false };
    try {
      const payload = mapAuditLogToDb(log);
      const { error } = await client.from(CONTAJU_TABLES.AUDIT_LOGS).upsert([payload], { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  }
}

export const supabaseSync = new SupabaseSyncService();
