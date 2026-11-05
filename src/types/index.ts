export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'GESTOR_FINANCEIRO' | 'OPERADOR' | 'CONSULTA';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  status?: 'ATIVO' | 'INATIVO' | 'PENDENTE';
  password?: string;
  createdAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  twoFactorEnabled?: boolean;
  twoFactorCode?: string;
  twoFactorExpires?: string;
  resetPasswordCode?: string;
  resetPasswordExpires?: string;
}

export type OperationNature = 
  | 'RECEITA_SERVICO'
  | 'DEDUCAO_RECEITA'
  | 'CUSTO_SERVICO'
  | 'DESPESA_PESSOAL'
  | 'DESPESA_ADMINISTRATIVA'
  | 'DESPESA_COMERCIAL'
  | 'DESPESA_OPERACIONAL'
  | 'RESULTADO_FINANCEIRO'
  | 'RECEITA_FINANCEIRA'
  | 'DESPESA_FINANCEIRA'
  | 'OUTRA_RECEITA'
  | 'TRIBUTO_LUCRO'
  | 'INVESTIMENTO_ATIVO'
  | 'FINANCIAMENTO_SOCIO'
  | 'CONTROLE_ESPECIFICO';

export type CashFlowCategory = 'OPERACIONAL' | 'INVESTIMENTO' | 'FINANCIAMENTO' | 'TRANSFERENCIA_INTERNA';

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  parentId?: string | null;
  nature: OperationNature;
  dremap: {
    include: boolean;
    line: string;
    multiplier: 1 | -1; // 1 adds, -1 subtracts
  };
  cashFlowCategory: CashFlowCategory;
  isAnalytical: boolean; // Only analytical accounts can receive entries
  isSynthetic?: boolean;
  isActive: boolean;
  status?: 'ATIVO' | 'INATIVO';
  dreLineMapping?: string;
  type?: string;
  externalCode?: string;
}

export type ChartOfAccount = ChartAccount;

export type EntityType = 'CLIENTE' | 'FORNECEDOR' | 'AMBOS';

export interface Counterparty {
  id: string;
  type: EntityType;
  name: string; // Razão Social / Nome
  tradeName?: string; // Nome Fantasia
  document: string; // CPF ou CNPJ
  email: string;
  phone: string;
  address?: string;
  status: 'ATIVO' | 'INATIVO';
  notes?: string;
  createdAt: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  description: string;
  defaultPrice: number;
  modality: 'RECORRENTE' | 'AVULSO';
  defaultAccountId: string;
  chartAccountId?: string;
  status: 'ATIVO' | 'INATIVO';
}

export type ContractStatus = 'RASCUNHO' | 'ATIVO' | 'SUSPENSO' | 'ENCERRADO' | 'CANCELADO' | 'INATIVO';
export type DueDayRule = 'SAME_MONTH' | 'NEXT_MONTH';

export interface ContractItem {
  id: string;
  serviceId: string;
  description: string;
  unitPrice: number;
  quantity: number;
  accountId: string;
  total?: number;
}

export type AcquisitionChannel = 
  | 'INDICACAO'
  | 'REDE_SOCIAL'
  | 'MECANISMO_PESQUISA'
  | 'PROSPECCAO_ATIVA'
  | 'EVENTO'
  | 'OUTRO';

export type SocialNetworkType = 
  | 'INSTAGRAM'
  | 'LINKEDIN'
  | 'FACEBOOK'
  | 'YOUTUBE'
  | 'TIKTOK'
  | 'OUTRA';

export type ContractAdjustmentReason = 
  | 'REAJUSTE_ANUAL' 
  | 'IGPM' 
  | 'IPCA' 
  | 'ACORDO_MUTUO' 
  | 'AUMENTO_ESCOPO' 
  | 'OUTRO';

export interface ContractAdjustment {
  id: string;
  date: string; // Data de vigência do novo valor (YYYY-MM-DD)
  previousAmount: number;
  newAmount: number;
  percentage: number; // % de variação calculada (ex: +8.5%)
  reason: ContractAdjustmentReason;
  reasonLabel?: string;
  notes?: string;
  appliedAt: string; // Data/hora do registro
  appliedBy?: string;
}

export type AnnualBalanceFeeInstallmentType = 
  | 'UNICA_DEZEMBRO' 
  | 'DUAS_PARCELAS' 
  | 'TRES_PARCELAS' 
  | 'PERSONALIZADO';

export type BalanceFeeDueRule = 'SAME_MONTH' | 'NEXT_MONTH' | 'SPECIFIC_DATE';

export interface AnnualBalanceFeeConfig {
  enabled: boolean;
  amount: number; // Valor total da taxa anual em R$ (ex: 2500.00)
  installmentType: AnnualBalanceFeeInstallmentType;
  billingMonths: number[]; // Meses de 1 a 12 em que será cobrada (ex: [12], [11, 12], [10, 11, 12])
  competenceMonth?: number; // Mês da competência específico (1 a 12) para parcela única (ex: 12 para Dezembro)
  dueDay?: number; // Dia de vencimento específico (1 a 31)
  dueRule?: BalanceFeeDueRule; // 'SAME_MONTH' (dentro da própria competência) | 'NEXT_MONTH' (mês seguinte) | 'SPECIFIC_DATE' (data fixa)
  specificDueDate?: string; // Data específica fixa de vencimento (YYYY-MM-DD) se aplicável
  notes?: string;
}

export type ContractType = 'RECORRENTE' | 'AVULSO';

export interface ContractStatusHistoryEntry {
  id: string;
  contractId: string;
  previousStatus: ContractStatus;
  newStatus: ContractStatus;
  changedAt: string; // Data e hora ISO da alteração
  changedBy: string; // Usuário responsável pela mudança
  userRole?: string;
  reason?: string; // Motivo da alteração de status
  notes?: string; // Observações / histórico
  effectiveDate?: string; // Data de vigência ou término (YYYY-MM-DD)
}

export interface Contract {
  id: string;
  contractNumber: string;
  customerId: string;
  companyId?: string;
  description: string;
  items: ContractItem[];
  monthlyTotal: number;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // Optional
  entryDate?: string; // Data de entrada / início do cliente (YYYY-MM-DD)
  contractType?: ContractType; // RECORRENTE (mensalidade contínua) ou AVULSO (serviço pontual)
  isRecurring?: boolean; // true = Recorrente (Padrão), false = Pontual / Avulso
  autoGenerateFutureMonths?: boolean; // Se gera títulos futuros automaticamente
  futureMonthsCount?: number; // Quantidade de meses antecipados (ex: 12)
  acquisitionChannel?: AcquisitionChannel; // Origem da aquisição
  acquisitionReferrerName?: string; // Nome de quem indicou (se for indicação)
  acquisitionSocialNetwork?: SocialNetworkType | string; // Rede social específica
  acquisitionNotes?: string; // Termo de busca / campanha / detalhes adicionais
  periodicity: 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
  billingFrequency?: string;
  dueDay: number; // 1 to 31
  dueRule: DueDayRule; // SAME_MONTH or NEXT_MONTH of competence
  billingMethod: 'BOLETO' | 'PIX' | 'TRANSFERENCIA' | 'OUTRO';
  status: ContractStatus;
  cancellationDate?: string; // Data a partir da qual o contrato foi cancelado/inativado (YYYY-MM-DD)
  cancellationReason?: string; // Motivo do cancelamento/inatividade
  cancellationNotes?: string; // Observações ou histórico da rescisão
  inactivatedAt?: string; // Data/hora do registro de cancelamento/inativação
  inactivatedBy?: string; // Usuário responsável pelo cancelamento/inativação
  statusHistory?: ContractStatusHistoryEntry[]; // Log cronológico de auditoria de cada mudança de status (Ativo/Inativo/Cancelado)
  notes?: string;
  adjustmentRule?: string; // e.g. 'IPCA anual'
  adjustments?: ContractAdjustment[]; // Histórico cronológico de reajustes de valor
  annualBalanceFee?: AnnualBalanceFeeConfig; // Configuração da Taxa de Balanço Anual (13º honorário)
  lastGeneratedCompetence?: string; // 'YYYY-MM'
  createdAt: string;
}

export interface SaleItem {
  id: string;
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  accountId: string;
}

export interface Sale {
  id: string;
  saleNumber: string;
  customerId: string;
  competence: string; // YYYY-MM
  date: string; // YYYY-MM-DD
  items: SaleItem[];
  grossTotal: number;
  discountTotal: number;
  netTotal: number;
  installmentsCount: number;
  notes?: string;
  createdAt: string;
  contractId?: string;
  contractNumber?: string;
  originType?: 'CONTRATO' | 'AVULSO';
  status?: 'CONFIRMADA' | 'CANCELADA';
  titleIds?: string[];
}

export type TitleType = 'RECEBER' | 'PAGAR';
export type TitleDocumentState = 'RASCUNHO' | 'CONFIRMADO' | 'CANCELADO';
export type TitleSettlementState = 'ABERTO' | 'PARCIAL' | 'LIQUIDADO';

export interface FinancialTitle {
  id: string;
  companyId: string;
  type: TitleType;
  titleNumber: string;
  counterpartyId: string; // Cliente ou Fornecedor
  description: string;
  accountId: string; // Plano de contas analítico
  
  // Datas fundamentais
  launchDate: string; // Data de lançamento (hoje por padrão)
  competence: string; // YYYY-MM (mês econômico)
  issueDate: string; // Data de emissão do documento
  dueDate: string; // Vencimento original
  expectedCashDate: string; // Data prevista de caixa
  
  // Valores
  originalAmount: number; // Valor original do título (principal)
  settledPrincipal: number; // Soma dos principais baixados válidos
  balancePrincipal: number; // Saldo principal = originalAmount - settledPrincipal
  
  // Encargos reconhecidos pendentes
  accruedInterest: number;
  accruedFine: number;
  
  // Status
  documentState: TitleDocumentState;
  settlementState: TitleSettlementState;
  
  // Origem
  originType: 'CONTRATO' | 'VENDA' | 'DESPESA_DIRETA' | 'RECORRENCIA_PAGAR' | 'MANUAL' | 'CARTAO_CREDITO';
  originId?: string;
  installmentIndex?: number;
  totalInstallments?: number;

  // Vínculo Contrato <-> Venda <-> Parcela a Receber
  contractId?: string;
  contractNumber?: string;
  saleId?: string;
  saleNumber?: string;
  
  // Cartão de Crédito (quando originType === 'CARTAO_CREDITO')
  creditCardId?: string;
  creditCardInvoiceMonth?: string; // YYYY-MM
  isCreditCardPurchase?: boolean;

  expectedBankAccountId?: string;
  barcode?: string; // Linha digitável ou código de barras do boleto / tributo
  bankDocumentNumber?: string; // Nosso Número ou Número do Documento Bancário
  externalId?: string; // Identificador estável do ERP de origem (ex: Conta Azul)
  fingerprint?: string; // Hash único para controle de idempotência e detecção de alterações
  importSource?: string; // 'CONTA_AZUL' | 'PLANILHA_BASE' | 'MANUAL' | etc.
  categoryName?: string; // Categoria original da planilha
  customFields?: Record<string, any>; // Colunas extras importadas não nativas
  reconciliationStatus?: 'PENDENTE' | 'CONCILIADO' | 'SUGESTAO';
  reconciledViaBank?: boolean; // Se foi conciliado via extrato bancário
  reconciledAt?: string; // Data/hora ISO da conciliação bancária
  reconciliationNote?: string; // Detalhes da conciliação ou extrato vinculado
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementComponent {
  principalSettled: number; // principal baixado
  discount: number; // desconto financeiro concedido/obtido
  interest: number; // juros recebidos/pagos
  fine: number; // multa recebida/paga
  bankFee: number; // tarifa bancária retida (ex: R$ 30,00)
  netFinancialAmount: number; // Dinheiro movimentado no banco = principal - desconto + juros + multa (- bankFee para receber)
}

export interface Settlement {
  id: string;
  titleId: string;
  settlementNumber: string;
  settlementDate: string; // Data efetiva (YYYY-MM-DD)
  bankAccountId: string;
  components: SettlementComponent;
  notes?: string;
  voucherRef?: string;
  isReversed: boolean;
  reversedAt?: string;
  reversedBy?: string;
  reversalReason?: string;
  createdAt: string;
  createdBy: string;
}

export type BankAccountType = 'CORRENTE' | 'POUPANCA' | 'CARTEIRA' | 'CAIXA_FISICO' | 'APLICACAO' | 'OUTRO';

export interface BankAccount {
  id: string;
  institution: string; // Itaú, Bradesco, etc.
  name: string;
  bankCode?: string;
  agency?: string;
  accountNumber?: string;
  type: BankAccountType;
  currency: 'BRL';
  initialBalance: number;
  currentBalance?: number;
  baseDate: string; // Data-base de abertura
  includeInCashFlow: boolean; // Se faz parte do caixa consolidado
  status: 'ATIVO' | 'INATIVO';
  color?: string;
}

export type MovementDirection = 'ENTRADA' | 'SAIDA';
export type MovementOrigin = 'BAIXA_TITULO' | 'TRANSFERENCIA' | 'OPERACAO_DIRETA' | 'ESTORNO' | 'AJUSTE_CAIXA' | 'FATURA_CARTAO';

// ==========================================
// CAIXA FÍSICO / CALCULADORA DE CÉDULAS & MOEDAS
// ==========================================
export interface CashDenominations {
  bills: {
    '200': number;
    '100': number;
    '50': number;
    '20': number;
    '10': number;
    '5': number;
    '2': number;
  };
  coins: {
    '1': number;
    '0.50': number;
    '0.25': number;
    '0.10': number;
    '0.05': number;
    '0.01': number;
  };
}

export interface CashCountRecord {
  id: string;
  bankAccountId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  countedBy: string;
  bills: Record<string, number>;
  coins: Record<string, number>;
  totalBills: number;
  totalCoins: number;
  totalPhysical: number;
  systemBalance: number;
  difference: number; // totalPhysical - systemBalance
  status: 'EQUILIBRADO' | 'SOBRA' | 'FALTA';
  notes?: string;
  adjustedInSystem: boolean;
  createdAt: string;
}

// ==========================================
// CONFERÊNCIA DE SALDOS BANCÁRIOS & FECHAMENTO PERFEITO
// ==========================================
export interface BankBalanceClosingRecord {
  id: string;
  bankAccountId: string;
  closingDate: string; // YYYY-MM-DD
  closingTime: string; // HH:mm
  closedBy: string;
  systemBalance: number; // Saldo do Sistema (ERP)
  realBalance: number; // Saldo Real que Tenho (Extrato/App Bancário)
  difference: number; // realBalance - systemBalance
  status: 'PERFEITO' | 'SOBRA' | 'FALTA';
  notes?: string;
  pendingStatementsCount?: number;
  pendingTitlesCount?: number;
  adjustedInSystem?: boolean;
  createdAt: string;
}

// ==========================================
// CARTÕES DE CRÉDITO CORPORATIVOS & FATURAS
// ==========================================
export type CreditCardBrand = 'MASTERCARD' | 'VISA' | 'ELO' | 'AMEX' | 'HIPERCARD' | 'OUTRO';

export interface CreditCard {
  id: string;
  name: string; // ex: "Nubank PJ Mastercard", "Itaú Corporate Visa"
  institution: string; // ex: "Nubank", "Itaú"
  brand: CreditCardBrand;
  lastFourDigits: string; // ex: "4821"
  creditLimit: number; // ex: 25000.00
  closingDay: number; // 1 a 31
  dueDay: number; // 1 a 31
  color: string; // ex: "#7c3aed"
  defaultPaymentBankAccountId?: string; // Conta bancária PJ padrão para pagamento
  status: 'ATIVO' | 'INATIVO';
  notes?: string;
  createdAt: string;
}

export interface CreditCardInstallment {
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  competence: string; // YYYY-MM
  dueDate: string; // YYYY-MM-DD da fatura correspondente
  invoiceMonth: string; // YYYY-MM da fatura que receberá esta parcela
  titleId?: string; // ID do título gerado no Contas a Pagar
  settled: boolean;
  settledAt?: string;
  settlementId?: string;
}

export interface CreditCardPurchase {
  id: string;
  cardId: string;
  transactionType?: 'DESPESA' | 'ESTORNO' | 'CASHBACK';
  purchaseDate: string; // YYYY-MM-DD
  description: string;
  counterpartyId?: string; // Fornecedor/Estabelecimento
  counterpartyName?: string;
  chartAccountId: string; // Categoria de Despesa do Plano de Contas
  totalAmount: number;
  installmentsCount: number; // 1 para à vista, > 1 para parcelado
  calculationMode: 'TOTAL_DIVIDED' | 'PER_INSTALLMENT';
  installmentValue: number;
  installments: CreditCardInstallment[];
  invoiceMonth: string; // YYYY-MM da 1ª parcela / fatura inicial
  notes?: string;
  createdAt: string;
}

export interface CreditCardInvoicePayment {
  id: string;
  cardId: string;
  invoiceMonth: string; // YYYY-MM
  paymentDate: string; // YYYY-MM-DD
  bankAccountId: string; // Conta bancária PJ que pagou a fatura
  amountPaid: number;
  notes?: string;
  movementId?: string;
  settlementIds: string[];
  createdAt: string;
  createdBy: string;
}

export interface FinancialMovement {
  id: string;
  bankAccountId: string;
  date: string; // Data efetiva
  direction: MovementDirection;
  amount: number; // Valor líquido creditado/debitado
  originType: MovementOrigin;
  originReferenceId?: string; // settlementId, transferId, etc.
  description: string;
  counterpartyId?: string;
  accountId?: string;
  cashFlowCategory: CashFlowCategory;
  isReversed?: boolean;
  createdAt: string;
}

export interface BankTransfer {
  id: string;
  originAccountId: string;
  destinationAccountId: string;
  amount: number;
  date: string;
  feeAmount?: number;
  feeAccountId?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface StatementEntry {
  id: string;
  importBatchId: string;
  bankAccountId: string;
  fitId?: string; // External bank ID
  date: string;
  description: string;
  documentNumber?: string;
  amount: number; // positive = credit, negative = debit
  reconciliationStatus: 'PENDENTE' | 'SUGESTAO' | 'CONCILIADO' | 'IGNORADO';
  suggestedTitleId?: string;
  ruleApplied?: string;
  matchedMovementId?: string;
  matchedTitleId?: string;
  reconciliationNote?: string;
}

export type BankStatementEntry = StatementEntry;

export type ReconciliationMatchConfidence = 'MUITO_FORTE' | 'FORTE' | 'POSSIVEL' | 'BAIXA';

export interface MatchFactorBreakdown {
  amountScore: number; // 0 - 50
  dateScore: number; // 0 - 30
  descriptionScore: number; // 0 - 20
  amountSummary: string;
  dateSummary: string;
  descriptionSummary: string;
  isPartialMatch?: boolean;
  partialPercentage?: number; // 0 a 100
  remainingBalanceEstimated?: number;
}

export interface ReconciliationMatchResult {
  score: number; // 0 - 100
  confidence: ReconciliationMatchConfidence;
  isHighlighted: boolean; // score >= 60
  breakdown: MatchFactorBreakdown;
  summaryBadge: string;
  isPartialMatch?: boolean;
  partialPercentage?: number; // 0 a 100
  remainingBalanceEstimated?: number;
}

// ==========================================
// REGRAS DE CONCILIAÇÃO AUTOMÁTICA (DE-PARA)
// ==========================================
export type ReconciliationRuleMatchType = 'CONTAINS' | 'STARTS_WITH' | 'EQUALS' | 'REGEX';
export type ReconciliationRuleAction = 'AUTO_CREATE_AND_RECONCILE' | 'AUTO_SUGGEST';
export type ReconciliationRuleTransactionType = 'DEBIT' | 'CREDIT' | 'BOTH';

export interface ReconciliationRule {
  id: string;
  name: string; // Ex: "Tarifas Bancárias Pacote PJ"
  pattern: string; // Ex: "TARIFA", "PACOTE DE SERVICOS", "PIX ENVIADO"
  matchType: ReconciliationRuleMatchType;
  transactionType: ReconciliationRuleTransactionType; // DEBIT / CREDIT / BOTH
  chartAccountId: string; // Conta Contábil mapeada (ex: acc-4.1.01)
  counterpartyId?: string; // Fornecedor/Cliente/Banco favorecido opcional
  action: ReconciliationRuleAction; // 'AUTO_CREATE_AND_RECONCILE' | 'AUTO_SUGGEST'
  active: boolean;
  priority: number;
  descriptionTemplate?: string; // Template para descrição gerada no ERP
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// LOG DETALHADO DO MOTOR DE CONCILIAÇÃO
// ==========================================
export interface ReconciliationDiagnosticLog {
  id: string;
  timestamp: string;
  bankAccountId: string;
  stmtId: string;
  fitId?: string;
  date: string;
  amount: number;
  description: string;
  status: 'CONCILIADO' | 'SUGESTAO_ENCONTRADA' | 'NAO_CONCILIADO' | 'REGRA_APLICADA';
  ruleAppliedName?: string;
  toleranceThresholdUsed: number;
  bestCandidateTitleId?: string;
  bestCandidateTitleNumber?: string;
  bestCandidateCounterpartyName?: string;
  bestCandidateScore: number;
  primaryReason: string; // Motivo claro em linguagem natural
  detailedReasons: string[]; // Lista de fatores analisados
  breakdown?: MatchFactorBreakdown;
  suggestedAction: 'CRIAR_TITULO' | 'AJUSTAR_TOLERANCIA' | 'CRIAR_REGRA_DE_PARA' | 'CONCILIAR_MANUAL' | 'JA_CONCILIADO';
  actionNote?: string;
}

export interface StatementImportBatch {
  id: string;
  bankAccountId: string;
  filename: string;
  fileFormat: 'OFX' | 'CSV' | 'XLSX';
  importedAt: string;
  totalEntries: number;
  importedCount: number;
  duplicateCount: number;
  status: 'SUCESSO' | 'PARCIAL' | 'FALHA';
}

export interface BankClosureSnapshot {
  bankAccountId: string;
  bankName: string;
  institution: string;
  systemBalance: number;
  declaredBalance: number;
  difference: number;
  isMatched: boolean;
}

export interface PeriodClosureChecklist {
  reconciled: boolean;
  pendingReconciliationCount: number;
  unsettledPayablesCount: number;
  unsettledReceivablesCount: number;
  totalUnsettledPayables: number;
  totalUnsettledReceivables: number;
  unclassifiedCount: number;
  taxesProvisioned: boolean;
  bankBalancesMatched: boolean;
  totalSystemBankBalance: number;
  totalDeclaredBankBalance: number;
  totalBankDifference: number;
}

export interface PeriodClosure {
  id: string;
  yearMonth: string; // YYYY-MM
  competence?: string; // Alias for yearMonth
  closedAt: string;
  closedBy: string;
  notes?: string;
  isClosed: boolean;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  bankSnapshots?: BankClosureSnapshot[];
  checklistSnapshot?: PeriodClosureChecklist;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userName: string;
  userRole: UserRole;
  action: string;
  module: string;
  recordId: string;
  details: string;
  previousValue?: string;
  newValue?: string;
}

export interface ModuleConfig {
  id: string;
  key: string;
  name: string;
  description: string;
  isCore: boolean; // Core modules cannot be disabled
  isEnabled: boolean;
  status: 'ATIVO' | 'PLANEJADO' | 'CONFIGURACAO_PENDENTE';
  dependencies?: string[];
  docUrl?: string;
}

export interface ImprovementRequest {
  id: string;
  title: string;
  problem?: string;
  expectedBenefit?: string;
  module?: string;
  category?: 'RELATORIOS' | 'USABILIDADE' | 'FISCAL_CONTABIL' | 'PERFORMANCE' | string;
  description?: string;
  votes?: number;
  requestedBy?: string;
  priority?: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  status: 'IDEIA' | 'ANALISE' | 'PLANEJADA' | 'DESENVOLVIMENTO' | 'TESTE' | 'CONCLUIDA' | 'EM_ANALISE';
  createdAt: string;
  createdBy?: string;
}

export interface CompanyProfile {
  id: string;
  companyName: string;
  tradeName: string;
  cnpj: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  currency: 'BRL';
  timezone: string; // 'America/Sao_Paulo'
  fiscalRegime: 'SIMPLES_NACIONAL' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL';
}

export type Company = CompanyProfile;
export type CompanyInfo = CompanyProfile;

export interface BudgetItem {
  accountId: string;
  monthlyPlanned: number[]; // 12 numbers for Jan..Dec
}

export interface AnnualBudgetPlan {
  id: string;
  year: number;
  name: string;
  updatedAt: string;
  notes?: string;
  items: BudgetItem[];
}

export interface BudgetChangeRecord {
  accountId: string;
  accountName: string;
  accountCode?: string;
  monthIndex: number; // 0..11
  previousValue: number;
  newValue: number;
  changeType: 'PERCENT' | 'MANUAL' | 'MONTH_BY_MONTH' | 'REPLICATE' | 'RESET';
  percentage?: number;
}

export interface BudgetVersion {
  id: string;
  versionNumber: string; // Ex: "v1.1", "v1.2", "Meta Aprovada"
  year: number;
  approvedAt: string;
  approvedBy: string;
  notes: string;
  totalChanges: number;
  changes: BudgetChangeRecord[];
  planSnapshot: AnnualBudgetPlan;
}

export interface BudgetComparisonLine {
  id: string;
  code?: string;
  name: string;
  level: number;
  isHeader?: boolean;
  isSummary?: boolean;
  nature?: OperationNature;
  plannedMonthly: number[];
  plannedTotal: number;
  realizedMonthly: number[];
  realizedTotal: number;
  varianceTotal: number; // Realized - Planned
  variancePercent: number; // %
  executionRate: number; // (Realized / Planned) * 100
  status: 'FAVORAVEL' | 'ATENCAO' | 'DESFAVORAVEL' | 'NEUTRO';
}

export interface GlobalPeriodFilter {
  active: boolean;
  year: number;
  month: number; // 1 to 12 (or 0 for whole year)
  /** Dia único ou período personalizado (AAAA-MM-DD). Quando existem, valem no lugar de mês/ano. */
  fromDate?: string;
  toDate?: string;
}

export interface DashboardConfig {
  visibleKpis: string[];
  visibleWidgets: string[];
}

export interface BatchEditOptions {
  competence?: string;
  dueDate?: string;
  postponeDays?: number;
  accountId?: string;
  expectedBankAccountId?: string;
}

export type DelinquencyImpactMode = 'TOTAL' | 'PERCENTAGE' | 'FIXED_VALUE';

export interface ClientDelinquencySetting {
  clientId: string;
  clientName: string;
  mode: DelinquencyImpactMode;
  percentage?: number; // ex: 50 para 50%
  fixedAmount?: number; // ex: 1500
  notes?: string;
}

export interface SavedCashSimulationScenario {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  clientSettings: ClientDelinquencySetting[];
  createdAt: string;
  updatedAt: string;
}

// =========================================================================
// TIPOS DO MÓDULO DE INTELIGÊNCIA ARTIFICIAL (OPENCODE & MULTI-MODEL FAILOVER)
// =========================================================================

export type AiProviderName = 
  | 'anthropic' 
  | 'openai' 
  | 'deepseek' 
  | 'google' 
  | 'meta' 
  | 'qwen' 
  | 'glm' 
  | 'grok' 
  | 'minimax' 
  | 'kimi' 
  | 'mimo' 
  | 'custom';

export type AiModelProtocol = 'openai_chat' | 'anthropic_messages' | 'openai_responses';

export type AiModelCategory = 'financeiro' | 'raciocinio' | 'rapido' | 'codigo' | 'geral';

export interface AiModelChainItem {
  id: string; // ex: 'deepseek-v4-pro', 'claude-haiku-5-5'
  name: string; // ex: 'DeepSeek V4 Pro'
  provider: AiProviderName;
  description?: string;
  isEnabled: boolean;
  category?: AiModelCategory;
  protocol?: AiModelProtocol;
  recommendedForApp?: boolean;
  isDevAgentOnly?: boolean;
  status?: 'active' | 'preview' | 'deprecated';
}

export interface AiProviderConfig {
  enabled: boolean;
  apiKey: string; // API Key da OpenCode Go (ou OpenAI compatível)
  endpointUrl: string; // Default: 'https://opencode.ai/zen/go/v1' ou endpoint customizado
  primaryModel: string; // Modelo prioritário
  fallbackModels: string[]; // Lista ordenada de contingência quando o primário falhar
  timeoutMs: number; // Timeout por requisição (ex: 12000ms)
  temperature: number; // 0.0 a 1.0 (default 0.2 para tarefas financeiras determinísticas)
  maxTokens: number;
  enableAutoReconciliation: boolean; // Sugestão automática de De-Para no extrato
  enableDailyBriefing: boolean; // Insights executivos no Dashboard
  enableAnomalyDetection: boolean; // Alertas preditivos de despesas atípicas
  lastDiscoveredAt?: string; // Data/Hora da última descoberta de catálogo de IA
  discoveredModels?: AiModelChainItem[]; // Catálogo sincronizado com a OpenCode
  lastFailoverEvent?: {
    timestamp: string;
    fromModel: string;
    toModel: string;
    reason: string;
    feature: string;
  };
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiExecutionAttempt {
  model: string;
  durationMs: number;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
}

export interface AiExecutionResult {
  success: boolean;
  content: string;
  modelUsed: string;
  failoverOccurred: boolean;
  attempts: AiExecutionAttempt[];
  totalDurationMs: number;
  parsedJson?: any;
}

export interface AiReconciliationSuggestion {
  statementId: string;
  suggestedTitleId?: string;
  suggestedAccountCategory?: string; // id da conta analítica
  suggestedCategory?: string; // nome ou código da categoria
  suggestedCounterpartyName?: string;
  confidenceScore: number; // 0 a 100
  confidence: number; // percentual de assertividade (0 a 100)
  reasoning: string;
  isNewTitleRecommended: boolean;
  action: 'CONCILIAR_EXISTENTE' | 'CRIAR_NOVO_TITULO' | 'IGNORAR_TARIFA';
  suggestedDescription?: string;
  modelUsed?: string;
  attempts?: AiExecutionAttempt[];
  hadFailover?: boolean;
}

// =========================================================================
// CENTRAL DE AGENTES DO APLICATIVO (FINANCIAL AI AGENTS)
// =========================================================================

export type AgentRoleType = 
  | 'CFO_EXECUTIVO' 
  | 'AUDITOR_CONCILIACAO' 
  | 'ANALISTA_INADIMPLENCIA' 
  | 'GUARDIAO_CONTABIL';

export interface AgentDefinition {
  id: string;
  role: AgentRoleType;
  name: string;
  description: string;
  avatarIcon: string;
  defaultModel: string;
  isAutonomous: boolean;
  requiresApproval: boolean;
  systemPrompt: string;
  allowedTools: string[];
  isActive: boolean;
}

export interface AgentRunRecord {
  id: string;
  agentRole: AgentRoleType;
  taskType: string;
  requestedBy: string;
  companyId: string;
  startedAt: string;
  completedAt?: string;
  status: 'PENDENTE' | 'PROCESSANDO' | 'SUCESSO' | 'FALHA' | 'AGUARDANDO_APROVACAO';
  modelUsed: string;
  latencyMs: number;
  failoverOccurred: boolean;
  tokensUsed?: number;
  inputSummary: string;
  outputSummary?: string;
  errorMessage?: string;
}

export interface AgentApprovalItem {
  id: string;
  runId: string;
  agentRole: AgentRoleType;
  companyId: string;
  title: string;
  description: string;
  proposedAction: 'BAIXAR_TITULO' | 'CRIAR_TITULO' | 'CONCILIAR_EXTRATO' | 'AJUSTAR_CONTRATO' | 'NOTIFICAR_COBRANCA';
  actionPayload: any;
  status: 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
  confidenceScore: number;
  reasoning: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export interface AgentAuditEvent {
  id: string;
  timestamp: string;
  agentRole: AgentRoleType;
  action: string;
  companyId: string;
  details: string;
  userId?: string;
  status: 'PROPOSTO' | 'APROVADO' | 'REJEITADO' | 'EXECUTADO';
}

// ==========================================
// METAS ORÇAMENTÁRIAS DE KPIS
// ==========================================
export interface KpiTarget {
  id: string;
  kpiId: string;
  year: number;
  monthlyTargets: number[]; // 12 meses (Jan a Dez)
  annualTarget: number;
  description?: string;
  updatedAt?: string;
}

// ==========================================
// RISCO PREDITIVO DE CHURN & HEALTH SCORE
// ==========================================
export type ChurnRiskLevel = 'CRITICO' | 'ALTO' | 'MODERADO' | 'SAUDAVEL';

export interface CustomerChurnRiskAssessment {
  customerId: string;
  customerName: string;
  customerDocument?: string;
  contractId?: string;
  contractNumber?: string;
  monthlyFee: number;
  healthScore: number; // 0 a 100
  riskLevel: ChurnRiskLevel;
  overdueTitlesCount: number;
  overdueAmount: number;
  maxDaysOverdue: number;
  historyLatePaymentRate: number; // % de faturas pagas com atraso
  monthsActive: number;
  isRenewalWindow: boolean; // Contrato perto dos 12 meses
  riskFactors: string[];
  recommendedAction: string;
  lastContactDate?: string;
}

// ==========================================
// ANÁLISE DE COORTES (COHORT RETENTION)
// ==========================================
export interface CohortMonthCell {
  monthIndex: number; // 0 = M0, 1 = M1...
  monthLabel: string;
  activeCount: number;
  retentionRate: number; // 0 a 100%
  retainedMrr: number;
  mrrRetentionRate: number; // 0 a 100% (Net Revenue Retention)
}

export interface CohortRow {
  cohortKey: string; // Ex: "2026-01"
  cohortLabel: string; // Ex: "Jan/2026"
  initialCount: number; // Clientes no M0
  initialMrr: number; // MRR inicial no M0
  cells: CohortMonthCell[];
}

export interface CohortAnalysisResult {
  cohorts: CohortRow[];
  averageRetentionM3: number;
  averageRetentionM6: number;
  averageRetentionM12: number;
  totalCohorts: number;
}

