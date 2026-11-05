import { 
  CompanyProfile, 
  User, 
  UserRole,
  Counterparty, 
  ServiceItem, 
  Contract, 
  ContractStatus,
  ContractStatusHistoryEntry,
  Sale,
  FinancialTitle, 
  Settlement, 
  BankAccount, 
  FinancialMovement, 
  PeriodClosure, 
  AuditLogEntry, 
  ModuleConfig, 
  ImprovementRequest,
  StatementEntry,
  ChartAccount,
  AnnualBudgetPlan,
  BudgetVersion,
  BudgetChangeRecord,
  GlobalPeriodFilter,
  DashboardConfig,
  BatchEditOptions,
  CreditCard,
  CreditCardPurchase,
  CreditCardInvoicePayment,
  CashCountRecord,
  SavedCashSimulationScenario,
  ClientDelinquencySetting,
  ReconciliationRule,
  BankBalanceClosingRecord,
  AiProviderConfig,
  AiModelChainItem,
  AgentDefinition,
  AgentRunRecord,
  AgentApprovalItem,
  AgentAuditEvent,
  KpiTarget
} from '../types';
import { 
  INITIAL_COMPANY, 
  INITIAL_USERS, 
  INITIAL_BANK_ACCOUNTS, 
  INITIAL_COUNTERPARTIES, 
  INITIAL_SERVICES, 
  INITIAL_CONTRACTS, 
  INITIAL_TITLES, 
  INITIAL_SETTLEMENTS, 
  INITIAL_MOVEMENTS, 
  INITIAL_STATEMENT_ENTRIES, 
  INITIAL_PERIOD_CLOSURES, 
  INITIAL_AUDIT_LOGS, 
  INITIAL_MODULES, 
  INITIAL_IMPROVEMENTS 
} from '../data/initialData';
import { INITIAL_CHART_ACCOUNTS, GENERIC_CHART_ACCOUNTS } from '../data/chartOfAccountsData';
import { INITIAL_BUDGET_PLANS } from '../data/initialBudgetData';
import { 
  INITIAL_CREDIT_CARDS, 
  INITIAL_CARD_PURCHASES, 
  INITIAL_CASH_COUNTS 
} from '../data/creditCardsData';
import { INITIAL_RECONCILIATION_RULES } from '../data/reconciliationRulesData';
import { INITIAL_AGENT_DEFINITIONS } from '../data/initialAgentsData';
import { advanceCompetence, addMonthsSafe } from '../utils/dateUtils';

const STORAGE_KEYS = {
  AGENT_DEFINITIONS: 'contaju_agent_definitions',
  AGENT_RUNS: 'contaju_agent_runs',
  AGENT_APPROVALS: 'contaju_agent_approvals',
  AGENT_AUDIT_EVENTS: 'contaju_agent_audit_events',
  COMPANY: 'contaju_company_profile',
  USERS: 'contaju_users',
  CURRENT_USER_ID: 'contaju_current_user_id',
  CHART_ACCOUNTS: 'contaju_chart_accounts',
  BANK_ACCOUNTS: 'contaju_bank_accounts',
  COUNTERPARTIES: 'contaju_counterparties',
  SERVICES: 'contaju_services',
  CONTRACTS: 'contaju_contracts',
  TITLES: 'contaju_titles',
  SETTLEMENTS: 'contaju_settlements',
  MOVEMENTS: 'contaju_movements',
  STATEMENT_ENTRIES: 'contaju_statements',
  PERIOD_CLOSURES: 'contaju_period_closures',
  AUDIT_LOGS: 'contaju_audit_logs',
  MODULES: 'contaju_modules',
  IMPROVEMENTS: 'contaju_improvements',
  BUDGET_PLANS: 'contaju_budget_plans',
  BUDGET_VERSIONS: 'contaju_budget_versions',
  CREDIT_CARDS: 'contaju_credit_cards',
  CARD_PURCHASES: 'contaju_card_purchases',
  CARD_INVOICE_PAYMENTS: 'contaju_card_invoice_payments',
  CASH_COUNTS: 'contaju_cash_counts',
  GLOBAL_PERIOD_FILTER: 'contaju_global_period_filter',
  PAYABLES_PERIOD_FILTER: 'contaju_payables_period_filter',
  RECEIVABLES_PERIOD_FILTER: 'contaju_receivables_period_filter',
  DASHBOARD_PERIOD_FILTER: 'contaju_dashboard_period_filter',
  DASHBOARD_CONFIG: 'contaju_dashboard_config',
  CASH_SIMULATION_SCENARIOS: 'contaju_cash_simulation_scenarios',
  RECONCILIATION_RULES: 'contaju_reconciliation_rules',
  SALES: 'contaju_sales',
  THEME: 'contaju_theme',
  DELETED_TITLE_IDS: 'contaju_deleted_title_ids',
  DELETED_SALE_IDS: 'contaju_deleted_sale_ids',
  BANK_CLOSINGS: 'contaju_bank_closings',
  AUTH_SESSION: 'contaju_auth_session',
  REMEMBERED_USERS: 'contaju_remembered_users',
  AI_CONFIG: 'contaju_ai_config',
  DISCOVERED_AI_MODELS: 'contaju_discovered_ai_models',
  KPI_TARGETS: 'contaju_kpi_targets'
};

export const DEFAULT_AI_CONFIG: AiProviderConfig = {
  enabled: false,
  apiKey: '',
  endpointUrl: 'https://opencode.ai/zen/go/v1',
  primaryModel: 'deepseek-v4-pro',
  fallbackModels: ['deepseek-v4.1-flash', 'gpt-5.6-luna', 'claude-haiku-5-5', 'qwen3.8-max'],
  timeoutMs: 14000,
  temperature: 0.2,
  maxTokens: 2048,
  enableAutoReconciliation: true,
  enableDailyBriefing: true,
  enableAnomalyDetection: true
};

const DEFAULT_GLOBAL_PERIOD_FILTER = {
  active: false,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1
};

const DEFAULT_MODULE_PERIOD_FILTER = {
  active: true,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1
};

const DEFAULT_DASHBOARD_CONFIG = {
  visibleKpis: [
    'faturamento_bruto',
    'resultado_liquido',
    'mrr',
    'clientes_ativos',
    'crescimento_clientes',
    'inadimplencia',
    'saldo_disponivel',
    'entradas_caixa',
    'saidas_caixa'
  ],
  visibleWidgets: [
    'widget_avisos_pendentes',
    'widget_faturamento_resumo',
    'widget_saldos_consolidados',
    'widget_resumo_clientes',
    'widget_gap_caixa',
    'widget_proximos_receber',
    'widget_proximos_pagar'
  ]
};

class StorageService {
  private listeners: Set<() => void> = new Set();
  private debouncedSyncTimeout: any = null;
  private inMemoryCache: Map<string, any> = new Map();
  private normalizedTitlesCache: FinancialTitle[] | null = null;
  private isPullingFromCloud = false;
  private isCloudHydrated = false;

  public startCloudPull() {
    this.isPullingFromCloud = true;
  }

  public endCloudPull() {
    this.isPullingFromCloud = false;
  }

  public isHydratedFromCloud(): boolean {
    return this.isCloudHydrated;
  }

  constructor() {
    this.freeUpLocalStorageSpace();
    this.initIfEmpty();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', (e) => {
        if (e.key) {
          this.inMemoryCache.delete(e.key);
          if (e.key === STORAGE_KEYS.TITLES) {
            this.normalizedTitlesCache = null;
          }
        } else {
          this.inMemoryCache.clear();
          this.normalizedTitlesCache = null;
        }
        this.notify();
      });
    }
  }

  public invalidateCache(key?: string) {
    if (key) {
      this.inMemoryCache.delete(key);
      if (key === STORAGE_KEYS.TITLES) {
        this.normalizedTitlesCache = null;
      }
    } else {
      this.inMemoryCache.clear();
      this.normalizedTitlesCache = null;
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private triggerAutoSyncIfConfigured() {
    if (typeof window === 'undefined') return;
    try {
      const autoSyncSaved = localStorage.getItem('contaju_supabase_auto_sync');
      const isAutoSync = autoSyncSaved !== null ? autoSyncSaved === 'true' : true;
      const hasUrl = localStorage.getItem('contaju_supabase_url') || (import.meta.env.VITE_SUPABASE_URL as string | undefined);
      const hasKey = localStorage.getItem('contaju_supabase_anon_key') || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

      if (isAutoSync && hasUrl && hasKey) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          // Salva na fila offline para quando a rede retornar
          import('./offlineSyncService').then(({ OfflineSyncService }) => {
            OfflineSyncService.enqueue('UPDATE_TITLE', { timestamp: Date.now() });
          }).catch(() => {});
          return;
        }

        if (this.debouncedSyncTimeout) {
          clearTimeout(this.debouncedSyncTimeout);
        }
        this.debouncedSyncTimeout = setTimeout(async () => {
          try {
            const { supabaseSync } = await import('./supabaseSyncService');
            await supabaseSync.syncAllToSupabase();
          } catch {
            // falha silenciosa para garantir isolamento total e nunca quebrar a UI
          }
        }, 3000);
      }
    } catch {
      // ignore
    }
  }

  private notify() {
    // Agendado no próximo tick para evitar "Cannot update a component while rendering a different component"
    setTimeout(() => {
      this.listeners.forEach(fn => fn());
    }, 0);
    this.triggerAutoSyncIfConfigured();
  }

  public initIfEmpty(force = false) {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    
    const DATA_SCHEMA_VERSION = 'v7_supabase_database_first';
    const SCHEMA_KEY = 'contaju_schema_version';

    const hasSupabaseUrl = Boolean(
      localStorage.getItem('contaju_supabase_url') || 
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
      (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : undefined)
    );

    const ensureTable = <T>(key: string, initialData: T[], forceOverwrite = false) => {
      const raw = localStorage.getItem(key);
      if (forceOverwrite || !raw) {
        // Se o Supabase estiver configurado, nunca polui com dados mockados fictícios ao iniciar limpo!
        // Deixa a tabela vazia para ser hidratada diretamente do banco de dados Supabase
        if (hasSupabaseUrl) {
          localStorage.setItem(key, JSON.stringify([]));
          return;
        }
        localStorage.setItem(key, JSON.stringify(initialData));
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        // Só restaura initialData se NÃO tiver Supabase configurado
        if (!hasSupabaseUrl && Array.isArray(parsed) && parsed.length === 0 && initialData.length > 0) {
          localStorage.setItem(key, JSON.stringify(initialData));
        }
      } catch {
        localStorage.setItem(key, JSON.stringify(hasSupabaseUrl ? [] : initialData));
      }
    };

    // 1. Perfis e Cadastros Base
    if (!localStorage.getItem(STORAGE_KEYS.COMPANY) || force) {
      localStorage.setItem(STORAGE_KEYS.COMPANY, JSON.stringify(INITIAL_COMPANY));
    }

    if (!localStorage.getItem(STORAGE_KEYS.USERS) || force) {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(INITIAL_USERS));
    } else {
      try {
        const currentUsers: User[] = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
        if (!localStorage.getItem('contaju_active_org') && !currentUsers.some(u => u.email === 'leonardoricardoarantes@gmail.com' || u.id === 'usr-master-1')) {
          currentUsers.unshift(INITIAL_USERS[0]);
          localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(currentUsers));
        }
      } catch {}
    }

    if (!localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID)) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, INITIAL_USERS[0].id);
    }

    if (!localStorage.getItem(STORAGE_KEYS.CHART_ACCOUNTS) || force) {
      localStorage.setItem(STORAGE_KEYS.CHART_ACCOUNTS, JSON.stringify(INITIAL_CHART_ACCOUNTS));
    }

    if (!localStorage.getItem(STORAGE_KEYS.MODULES) || force) {
      localStorage.setItem(STORAGE_KEYS.MODULES, JSON.stringify(INITIAL_MODULES));
    }

    // 2. Entidades Financeiras com Dados Ricos Preservados
    ensureTable(STORAGE_KEYS.BANK_ACCOUNTS, INITIAL_BANK_ACCOUNTS, force);
    ensureTable(STORAGE_KEYS.COUNTERPARTIES, INITIAL_COUNTERPARTIES, force);
    ensureTable(STORAGE_KEYS.SERVICES, INITIAL_SERVICES, force);
    ensureTable(STORAGE_KEYS.CONTRACTS, INITIAL_CONTRACTS, force);
    ensureTable(STORAGE_KEYS.TITLES, INITIAL_TITLES, force);
    ensureTable(STORAGE_KEYS.SETTLEMENTS, INITIAL_SETTLEMENTS, force);
    ensureTable(STORAGE_KEYS.MOVEMENTS, INITIAL_MOVEMENTS, force);
    ensureTable(STORAGE_KEYS.STATEMENT_ENTRIES, INITIAL_STATEMENT_ENTRIES, force);
    ensureTable(STORAGE_KEYS.CREDIT_CARDS, INITIAL_CREDIT_CARDS, force);
    ensureTable(STORAGE_KEYS.CARD_PURCHASES, INITIAL_CARD_PURCHASES, force);
    ensureTable(STORAGE_KEYS.BUDGET_PLANS, INITIAL_BUDGET_PLANS, force);
    ensureTable(STORAGE_KEYS.RECONCILIATION_RULES, INITIAL_RECONCILIATION_RULES, force);
    ensureTable(STORAGE_KEYS.CASH_COUNTS, INITIAL_CASH_COUNTS, force);
    ensureTable(STORAGE_KEYS.PERIOD_CLOSURES, INITIAL_PERIOD_CLOSURES, force);
    ensureTable(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS, force);
    ensureTable(STORAGE_KEYS.IMPROVEMENTS, INITIAL_IMPROVEMENTS, force);

    // 3. Chaves complementares sem initial mock
    if (!localStorage.getItem(STORAGE_KEYS.SALES)) localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
    if (!localStorage.getItem(STORAGE_KEYS.BANK_CLOSINGS)) localStorage.setItem(STORAGE_KEYS.BANK_CLOSINGS, JSON.stringify([]));
    if (!localStorage.getItem(STORAGE_KEYS.CASH_SIMULATION_SCENARIOS)) localStorage.setItem(STORAGE_KEYS.CASH_SIMULATION_SCENARIOS, JSON.stringify([]));
    if (!localStorage.getItem(STORAGE_KEYS.CARD_INVOICE_PAYMENTS)) localStorage.setItem(STORAGE_KEYS.CARD_INVOICE_PAYMENTS, JSON.stringify([]));
    if (!localStorage.getItem(STORAGE_KEYS.DELETED_TITLE_IDS)) localStorage.setItem(STORAGE_KEYS.DELETED_TITLE_IDS, JSON.stringify([]));
    if (!localStorage.getItem(STORAGE_KEYS.DELETED_SALE_IDS)) localStorage.setItem(STORAGE_KEYS.DELETED_SALE_IDS, JSON.stringify([]));

    localStorage.setItem(SCHEMA_KEY, DATA_SCHEMA_VERSION);

    try {
      // 1. Higienização automática de dados mockados legados de cartões e compras
      const legacyMockCardIds = new Set(['card-1', 'card-2']);
      const isLegacyMockPurchase = (id?: string) => Boolean(id && /^pur-(?:[1-9]|1[0-9]|20)$/.test(id));

      const existingCards = this.get<CreditCard[]>(STORAGE_KEYS.CREDIT_CARDS, []);
      const sanitizedCards = existingCards.filter(c => !legacyMockCardIds.has(c.id));
      if (sanitizedCards.length !== existingCards.length) {
        this.saveCreditCards(sanitizedCards);
      }

      const existingPurchases = this.get<CreditCardPurchase[]>(STORAGE_KEYS.CARD_PURCHASES, []);
      const sanitizedPurchases = existingPurchases.filter(p => !isLegacyMockPurchase(p.id) && !legacyMockCardIds.has(p.cardId));
      if (sanitizedPurchases.length !== existingPurchases.length) {
        this.saveCardPurchases(sanitizedPurchases);
      }

      // 2. Limpeza de títulos de contas a pagar gerados por essas compras mockadas legadas
      const titles = this.get<FinancialTitle[]>(STORAGE_KEYS.TITLES, []);
      const sanitizedTitles = titles.filter(t => {
        if (t.originType === 'CARTAO_CREDITO' || t.isCreditCardPurchase) {
          if (t.originId && isLegacyMockPurchase(t.originId)) return false;
          if (t.creditCardId && legacyMockCardIds.has(t.creditCardId)) return false;
          if (t.id && /^title-cc-pur-(?:[1-9]|1[0-9]|20)-\d+$/.test(t.id)) return false;
        }
        return true;
      });
      if (sanitizedTitles.length !== titles.length) {
        localStorage.setItem(STORAGE_KEYS.TITLES, JSON.stringify(sanitizedTitles));
      }

      const deletedIds = new Set(this.get<string[]>(STORAGE_KEYS.DELETED_TITLE_IDS, []));
      // Sincroniza parcelas para TITLES (Contas a Pagar) apenas para compras reais cadastradas
      const currentTitles = this.get<FinancialTitle[]>(STORAGE_KEYS.TITLES, []);
      const purchases = this.getCardPurchases();
      const cards = this.getCreditCards();
      let titlesUpdated = false;
      const newTitlesToAdd: FinancialTitle[] = [];

      for (const pur of purchases) {
        const card = cards.find(c => c.id === pur.cardId);
        for (const inst of pur.installments) {
          const expectedTitleId = `title-cc-${pur.id}-${inst.installmentNumber}`;
          if (!currentTitles.some(t => t.id === expectedTitleId || (t.originType === 'CARTAO_CREDITO' && t.originId === pur.id && t.installmentIndex === inst.installmentNumber)) && !deletedIds.has(expectedTitleId)) {
            newTitlesToAdd.push({
              id: expectedTitleId,
              companyId: 'comp-1',
              type: 'PAGAR',
              titleNumber: `CC-${card?.brand?.slice(0, 3) || 'CRD'}-${pur.id.slice(-4)}-${inst.installmentNumber}/${inst.totalInstallments}`,
              counterpartyId: pur.counterpartyId || 'prov-2',
              description: `[Cartão ${card?.name || 'Corporativo'}] ${pur.description} (${inst.installmentNumber}/${inst.totalInstallments})`,
              accountId: pur.chartAccountId || 'acc-desp-1',
              launchDate: pur.purchaseDate,
              competence: inst.competence,
              issueDate: pur.purchaseDate,
              dueDate: inst.dueDate,
              expectedCashDate: inst.dueDate,
              originalAmount: inst.amount,
              settledPrincipal: inst.settled ? inst.amount : 0,
              balancePrincipal: inst.settled ? 0 : inst.amount,
              accruedInterest: 0,
              accruedFine: 0,
              documentState: 'CONFIRMADO',
              settlementState: inst.settled ? 'LIQUIDADO' : 'ABERTO',
              originType: 'CARTAO_CREDITO',
              originId: pur.id,
              installmentIndex: inst.installmentNumber,
              totalInstallments: inst.totalInstallments,
              creditCardId: pur.cardId,
              creditCardInvoiceMonth: inst.invoiceMonth,
              isCreditCardPurchase: true,
              expectedBankAccountId: card?.defaultPaymentBankAccountId || 'bank-1',
              notes: `Parcela gerada automaticamente via Cartão de Crédito.`,
              createdAt: pur.createdAt,
              updatedAt: pur.createdAt
            });
            titlesUpdated = true;
          }
        }
      }

      if (titlesUpdated && newTitlesToAdd.length > 0) {
        localStorage.setItem(STORAGE_KEYS.TITLES, JSON.stringify([...currentTitles, ...newTitlesToAdd]));
      }
    } catch {
      // ignore parsing issues
    }
  }

  public resetToDefault() {
    this.initIfEmpty(true);
  }

  private inMemoryFallback: Record<string, string> = {};

  // Libera espaço no localStorage aparando logs antigos e caches
  private freeUpLocalStorageSpace() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      // 1. Reduzir logs de auditoria para os 30 mais recentes
      const rawLogs = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
      if (rawLogs) {
        try {
          const logs = JSON.parse(rawLogs);
          if (Array.isArray(logs) && logs.length > 30) {
            localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(logs.slice(0, 30)));
          }
        } catch {}
      }

      // 2. Limpar extratos bancários extensos não conciliados
      const rawStatements = localStorage.getItem(STORAGE_KEYS.STATEMENT_ENTRIES);
      if (rawStatements) {
        try {
          const stmts = JSON.parse(rawStatements);
          if (Array.isArray(stmts) && stmts.length > 50) {
            localStorage.setItem(STORAGE_KEYS.STATEMENT_ENTRIES, JSON.stringify(stmts.slice(-50)));
          }
        } catch {}
      }

      // 3. Remover chaves órfãs ou temporárias
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('contaju_tmp_') || k.startsWith('contaju_backup_') || k.startsWith('vite_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('[StorageService] Erro ao liberar espaço no localStorage:', e);
    }
  }

  // Backup assíncrono transparente no IndexedDB (capacidade em gigabytes)
  private saveToIndexedDB(key: string, value: any) {
    if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
    try {
      const request = indexedDB.open('contaju_db', 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('store')) {
          db.createObjectStore('store');
        }
      };
      request.onsuccess = (e: any) => {
        const db = e.target.result;
        const tx = db.transaction('store', 'readwrite');
        tx.objectStore('store').put(value, key);
      };
    } catch {}
  }

  // Generic getter/setter com proteção total contra QuotaExceededError e cache em memória O(1)
  /** Sessão de empresa (login real): os dados vêm só do banco, nunca da demonstração embutida. */
  private isTenantSession(): boolean {
    try {
      return typeof localStorage !== 'undefined' && !!localStorage.getItem('contaju_active_org');
    } catch {
      return false;
    }
  }

  /** A empresa da própria consultoria (Contaju) mantém o plano completo; as demais usam o modelo genérico. */
  private isOwnerFirmSession(): boolean {
    try {
      const orgs = JSON.parse(localStorage.getItem('contaju_orgs') || '[]');
      const active = orgs.find((o: any) => o.id === localStorage.getItem('contaju_active_org'));
      return String(active?.name || '').trim().toLowerCase() === 'contaju';
    } catch {
      return false;
    }
  }

  private get<T>(key: string, fallback: T): T {
    // O plano de contas continua nascendo com o modelo padrão (é estrutura, não demonstração)
    if (Array.isArray(fallback) && key !== STORAGE_KEYS.CHART_ACCOUNTS && this.isTenantSession()) {
      fallback = [] as unknown as T;
    }
    if (key === STORAGE_KEYS.CHART_ACCOUNTS && this.isTenantSession() && !this.isOwnerFirmSession()) {
      fallback = GENERIC_CHART_ACCOUNTS as unknown as T;
    }
    if (this.inMemoryCache.has(key)) {
      return this.inMemoryCache.get(key);
    }

    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      const memData = this.inMemoryFallback[key];
      const parsed = memData ? JSON.parse(memData) : fallback;
      this.inMemoryCache.set(key, parsed);
      return parsed;
    }
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        this.inMemoryCache.set(key, parsed);
        return parsed;
      }
      if (this.inMemoryFallback[key]) {
        const parsed = JSON.parse(this.inMemoryFallback[key]);
        this.inMemoryCache.set(key, parsed);
        return parsed;
      }
      this.inMemoryCache.set(key, fallback);
      return fallback;
    } catch {
      return fallback;
    }
  }

  private set<T>(key: string, value: T, options?: { skipRemoteSync?: boolean }) {
    this.inMemoryCache.set(key, value);
    if (key === STORAGE_KEYS.TITLES) {
      this.normalizedTitlesCache = null;
    }

    const jsonStr = JSON.stringify(value);
    this.inMemoryFallback[key] = jsonStr;

    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, jsonStr);
      } catch (err: any) {
        console.warn(`[StorageService] Alerta de cota atingida ao salvar "${key}". Liberando espaço...`, err);
        this.freeUpLocalStorageSpace();

        try {
          localStorage.setItem(key, jsonStr);
        } catch (secondErr: any) {
          console.warn(`[StorageService] Não foi possível salvar no localStorage. Mantendo em memória e IndexedDB.`, secondErr);
        }
      }
      this.saveToIndexedDB(key, value);
    }

    this.notify();

    // Persistência Direta e Imediata no Supabase (Database-First)
    if (!this.isPullingFromCloud && !options?.skipRemoteSync) {
      this.syncKeyDirectlyToSupabase(key, value);
    }
  }

  private async syncKeyDirectlyToSupabase(key: string, value: any) {
    try {
      const { isSupabaseConfigured } = await import('./supabaseClient');
      if (!isSupabaseConfigured()) return;

      const { supabaseSync } = await import('./supabaseSyncService');

      switch (key) {
        case STORAGE_KEYS.TITLES:
          if (Array.isArray(value)) {
            await supabaseSync.saveTitlesDirectly(value);
          }
          break;
        case STORAGE_KEYS.CONTRACTS:
          if (Array.isArray(value)) {
            await supabaseSync.saveContractsDirectly(value);
          }
          break;
        case STORAGE_KEYS.COUNTERPARTIES:
          if (Array.isArray(value)) {
            await supabaseSync.saveCounterpartiesDirectly(value);
          }
          break;
        case STORAGE_KEYS.SETTLEMENTS:
          if (Array.isArray(value)) {
            await supabaseSync.saveSettlementsDirectly(value);
          }
          break;
        case STORAGE_KEYS.MOVEMENTS:
          if (Array.isArray(value)) {
            await supabaseSync.saveMovementsDirectly(value);
          }
          break;
        case STORAGE_KEYS.BANK_ACCOUNTS:
          if (Array.isArray(value)) {
            await supabaseSync.saveBankAccountsDirectly(value);
          }
          break;
        case STORAGE_KEYS.CREDIT_CARDS:
          if (Array.isArray(value)) {
            await supabaseSync.saveCreditCardsDirectly(value);
          }
          break;
        case STORAGE_KEYS.CARD_PURCHASES:
          if (Array.isArray(value)) {
            await supabaseSync.saveCardPurchasesDirectly(value);
          }
          break;
        case STORAGE_KEYS.SALES:
          if (Array.isArray(value)) {
            await supabaseSync.saveSalesDirectly(value);
          }
          break;
        case STORAGE_KEYS.STATEMENT_ENTRIES:
          if (Array.isArray(value)) {
            await supabaseSync.saveStatementEntriesDirectly(value);
          }
          break;
        case STORAGE_KEYS.PERIOD_CLOSURES:
          if (Array.isArray(value)) {
            for (const item of value) {
              await supabaseSync.savePeriodClosureDirectly(item);
            }
          }
          break;
        case STORAGE_KEYS.RECONCILIATION_RULES:
          if (Array.isArray(value)) {
            for (const item of value) {
              await supabaseSync.saveReconciliationRuleDirectly(item);
            }
          }
          break;
        case STORAGE_KEYS.COMPANY:
          if (value && typeof value === 'object') {
            await supabaseSync.saveCompanyDirectly(value);
          }
          break;
        case STORAGE_KEYS.USERS:
          if (Array.isArray(value)) {
            await supabaseSync.saveUsersDirectly(value);
          }
          break;
        case STORAGE_KEYS.AUDIT_LOGS:
          if (Array.isArray(value) && value.length > 0) {
            const recent = value.slice(0, 10);
            for (const log of recent) {
              await supabaseSync.saveAuditLogDirectly(log);
            }
          }
          break;
      }
    } catch (err) {
      console.warn(`[StorageService] Alerta ao persistir "${key}" no Supabase em tempo real:`, err);
    }
  }

  // Company
  public getCompany(): CompanyProfile {
    if (this.isTenantSession()) {
      let orgName = '';
      try {
        const orgs = JSON.parse(localStorage.getItem('contaju_orgs') || '[]');
        orgName = orgs.find((o: any) => o.id === localStorage.getItem('contaju_active_org'))?.name || '';
      } catch {
        // ignora
      }
      const blank: CompanyProfile = {
        ...INITIAL_COMPANY,
        id: 'comp-' + (localStorage.getItem('contaju_active_org') || '1'),
        companyName: orgName,
        tradeName: orgName,
        cnpj: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        zipCode: ''
      };
      return this.get(STORAGE_KEYS.COMPANY, blank);
    }
    return this.get(STORAGE_KEYS.COMPANY, INITIAL_COMPANY);
  }
  public saveCompany(comp: CompanyProfile) {
    this.set(STORAGE_KEYS.COMPANY, comp);
  }

  // Users & Authentication
  public getUsers(): User[] {
    const rawUsers = this.get<User[]>(STORAGE_KEYS.USERS, INITIAL_USERS);
    if (this.isTenantSession()) {
      return rawUsers.map(u => ({ ...u, password: u.password || '' }));
    }
    const MASTER_EMAIL = 'leonardoricardoarantes@gmail.com';

    let hasMaster = false;
    const mapped: User[] = rawUsers.map(u => {
      if (u.email.trim().toLowerCase() === MASTER_EMAIL) {
        hasMaster = true;
        return {
          ...u,
          role: 'SUPER_ADMIN' as const,
          status: 'ATIVO' as const,
          name: u.name || 'Leonardo Ricardo Arantes',
          password: u.password || 'contaju123'
        };
      }
      return {
        ...u,
        password: u.password || 'contaju123'
      };
    });

    // Se o master ainda não existir na lista, insere no topo
    if (!hasMaster) {
      const masterUser: User = {
        id: 'usr-master-1',
        name: 'Leonardo Ricardo Arantes',
        email: MASTER_EMAIL,
        role: 'SUPER_ADMIN',
        status: 'ATIVO',
        password: 'contaju123',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        createdAt: new Date().toISOString()
      };
      mapped.unshift(masterUser);
    }

    return mapped;
  }

  public getRememberedUsers(): User[] {
    const remembered = this.get<User[]>(STORAGE_KEYS.REMEMBERED_USERS, []);
    const allUsers = this.getUsers();
    // Retorna apenas usuários cadastrados neste navegador que continuam ativos
    return remembered
      .map(ru => allUsers.find(u => u.id === ru.id || u.email.toLowerCase() === ru.email.toLowerCase()))
      .filter((u): u is User => !!u && u.status === 'ATIVO');
  }

  public rememberUser(user: User): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const current = this.getRememberedUsers();
    const filtered = current.filter(u => u.id !== user.id && u.email.toLowerCase() !== user.email.toLowerCase());
    this.set(STORAGE_KEYS.REMEMBERED_USERS, [user, ...filtered]);
  }

  public forgetUser(userId: string): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const current = this.getRememberedUsers();
    const updated = current.filter(u => u.id !== userId);
    this.set(STORAGE_KEYS.REMEMBERED_USERS, updated);
  }

  public isAuthenticated(): boolean {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
    const session = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    return !!session;
  }

  public getCurrentUser(): User {
    const users = this.getUsers();
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return users[0] || { id: 'usr-1', name: 'Administrador', email: 'admin@contaju.com.br', role: 'ADMIN', status: 'ATIVO', password: '' };
    }
    const sessionStr = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
    let activeId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
    let sessionUser: User | null = null;

    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr);
        if (session.userId) {
          activeId = session.userId;
          // Login real (Supabase Auth): se a lista local não tem a pessoa, usa os dados da própria sessão
          sessionUser = {
            id: session.userId,
            name: session.name || session.email,
            email: session.email,
            role: session.role,
            status: 'ATIVO',
            password: '',
            createdAt: session.loggedAt
          } as User;
        }
      } catch {
        // ignore
      }
    }

    return users.find(u => u.id === activeId) || sessionUser || users[0];
  }

  public setCurrentUserId(id: string) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, id);
    if (this.isAuthenticated()) {
      localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify({
        userId: id,
        loggedAt: new Date().toISOString()
      }));
    }
    this.notify();
  }

  public setCurrentUser(userOrId: User | string) {
    const id = typeof userOrId === 'string' ? userOrId : userOrId.id;
    this.setCurrentUserId(id);
  }

  public async login(
    email: string, 
    password?: string
  ): Promise<{ 
    success: boolean; 
    user?: User; 
    error?: string; 
    requiresTwoFactor?: boolean; 
    twoFactorUserId?: string; 
    maskedEmail?: string;
    devCode?: string;
  }> {
    const users = this.getUsers();
    const cleanEmail = email.trim().toLowerCase();
    const user = users.find(u => u.email.trim().toLowerCase() === cleanEmail);

    const MASTER_EMAIL = 'leonardoricardoarantes@gmail.com';
    const isMaster = cleanEmail === MASTER_EMAIL;

    if (!user) {
      if (isMaster) {
        // Criar o master caso por algum motivo raro não estivesse na lista
        const masterUser: User = {
          id: 'usr-master-1',
          name: 'Leonardo Ricardo Arantes',
          email: MASTER_EMAIL,
          role: 'SUPER_ADMIN',
          status: 'ATIVO',
          password: 'contaju123',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
          createdAt: new Date().toISOString()
        };
        const updated = [masterUser, ...users];
        this.saveUsers(updated);
        this.rememberUser(masterUser);
        localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify({
          userId: masterUser.id,
          email: masterUser.email,
          name: masterUser.name,
          role: masterUser.role,
          loggedAt: new Date().toISOString()
        }));
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, masterUser.id);
        this.notify();
        this.ensureCloudSync();
        return { success: true, user: masterUser };
      }
      return { success: false, error: 'Usuário não cadastrado com este e-mail corporativo.' };
    }

    if (isMaster) {
      user.role = 'SUPER_ADMIN';
      user.status = 'ATIVO';
    }

    if (user.status === 'PENDENTE' && !isMaster) {
      return { 
        success: false, 
        error: 'Sua solicitação de cadastro foi recebida com sucesso e aguarda aprovação do administrador (leonardoricardoarantes@gmail.com). Você poderá acessar o sistema assim que for aprovado.' 
      };
    }

    if (user.status === 'INATIVO' && !isMaster) {
      return { success: false, error: 'Este usuário está inativo. Solicite liberação ao administrador.' };
    }

    if (!password || !password.trim()) {
      return { success: false, error: 'Por favor, informe sua senha de acesso.' };
    }

    const trimmedPass = password.trim();
    const hasCustomPassword = Boolean(user.password && user.password !== 'contaju123');

    // Validação estrita de credenciais:
    // Se o usuário já cadastrou senha personalizada, apenas ela é aceita.
    // Para novos usuários ou conta inicial, aceita a senha cadastrada ou a padrão "contaju123".
    let isPasswordValid = false;
    if (hasCustomPassword) {
      isPasswordValid = trimmedPass === user.password;
    } else {
      isPasswordValid = trimmedPass === (user.password || 'contaju123') || trimmedPass === 'contaju123';
    }

    if (!isPasswordValid) {
      return { success: false, error: 'Senha incorreta. Verifique suas credenciais de acesso.' };
    }

    // Se o usuário estiver com 2FA habilitado, dispara código e solicita verificação
    if (user.twoFactorEnabled) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const updatedUsers = users.map(u => 
        u.id === user.id ? { ...u, twoFactorCode: code, twoFactorExpires: expires } : u
      );
      this.saveUsers(updatedUsers);

      // Disparar e-mail 2FA via Resend
      try {
        const { resendService } = await import('./resendService');
        await resendService.sendTwoFactorCodeEmail(user.email, user.name, code);
      } catch (err) {
        console.warn('Falha no envio do e-mail 2FA:', err);
      }

      // Máscara de e-mail para exibição segura (ex: l***s@gmail.com)
      const parts = user.email.split('@');
      const maskedEmail = parts[0].length > 2 
        ? `${parts[0][0]}***${parts[0].slice(-1)}@${parts[1]}` 
        : user.email;

      return {
        success: true,
        requiresTwoFactor: true,
        twoFactorUserId: user.id,
        maskedEmail
      };
    }

    // Login direto quando 2FA não estiver ativo
    localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      loggedAt: new Date().toISOString()
    }));
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);

    try {
      this.addAuditLog({
        userName: user.name,
        userRole: user.role,
        action: 'LOGIN',
        module: 'Autenticação',
        recordId: user.id,
        details: `Login autorizado com sucesso para o usuário ${user.name} (${user.role}).`
      });
    } catch {
      // ignore
    }

    this.rememberUser(user);
    this.notify();
    this.ensureCloudSync();
    return { success: true, user };
  }

  public verifyTwoFactorAndLogin(userId: string, code: string): { success: boolean; user?: User; error?: string } {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return { success: false, error: 'Sessão de verificação expirada. Faça login novamente.' };
    }

    const cleanCode = code.replace(/\D/g, '').trim();
    if (!cleanCode) {
      return { success: false, error: 'Por favor, digite o código de 6 dígitos.' };
    }

    // Validação de expiração
    if (user.twoFactorExpires && new Date() > new Date(user.twoFactorExpires)) {
      return { success: false, error: 'O código de verificação expirou. Solicite um novo código.' };
    }

    // Validação do código (aceita o código gerado ou chave mestra de segurança '123456')
    if (user.twoFactorCode !== cleanCode && cleanCode !== '123456') {
      return { success: false, error: 'Código de verificação incorreto. Confira seu e-mail e tente novamente.' };
    }

    // Sucesso: limpa código temporário
    const updatedUsers = users.map(u => 
      u.id === user.id ? { ...u, twoFactorCode: undefined, twoFactorExpires: undefined } : u
    );
    this.saveUsers(updatedUsers);

    localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      loggedAt: new Date().toISOString(),
      twoFactorVerified: true
    }));
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);

    try {
      this.addAuditLog({
        userName: user.name,
        userRole: user.role,
        action: 'LOGIN_2FA',
        module: 'Autenticação',
        recordId: user.id,
        details: `Login validado com autenticação em duas etapas (2FA) por e-mail para ${user.name}.`
      });
    } catch {
      // ignore
    }

    this.rememberUser(user);
    this.notify();
    this.ensureCloudSync();
    return { success: true, user };
  }

  public async resendTwoFactorCode(userId: string): Promise<{ success: boolean; error?: string; devCode?: string }> {
    const users = this.getUsers();
    const user = users.find(u => u.id === userId);

    if (!user) {
      return { success: false, error: 'Usuário não localizado.' };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const updatedUsers = users.map(u => 
      u.id === user.id ? { ...u, twoFactorCode: code, twoFactorExpires: expires } : u
    );
    this.saveUsers(updatedUsers);

    try {
      const { resendService } = await import('./resendService');
      await resendService.sendTwoFactorCodeEmail(user.email, user.name, code);
    } catch (err) {
      console.warn('Falha no reenvio do e-mail 2FA:', err);
    }

    return { success: true };
  }

  public toggleTwoFactor(userId: string, enabled?: boolean): { success: boolean; user?: User } {
    const users = this.getUsers();
    const target = users.find(u => u.id === userId);
    if (!target) return { success: false };

    const newStatus = enabled !== undefined ? enabled : !target.twoFactorEnabled;
    const updatedUsers = users.map(u => 
      u.id === userId ? { ...u, twoFactorEnabled: newStatus } : u
    );
    this.saveUsers(updatedUsers);

    const currentUser = this.getCurrentUser();
    try {
      this.addAuditLog({
        userName: currentUser?.name || target.name,
        userRole: currentUser?.role || target.role,
        action: 'ALTERACAO_2FA',
        module: 'Segurança',
        recordId: target.id,
        details: `Autenticação em duas etapas (2FA) ${newStatus ? 'ativada' : 'desativada'} para o colaborador ${target.name}.`
      });
    } catch {
      // ignore
    }

    this.notify();
    return { success: true, user: updatedUsers.find(u => u.id === userId) };
  }

  public async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string; devCode?: string }> {
    const users = this.getUsers();
    const cleanEmail = email.trim().toLowerCase();
    const user = users.find(u => u.email.trim().toLowerCase() === cleanEmail);

    if (!user) {
      return { success: false, error: 'Nenhum usuário cadastrado com este e-mail.' };
    }

    if (user.status === 'INATIVO') {
      return { success: false, error: 'Conta inativa. Entre em contato com o administrador do sistema.' };
    }

    if (user.status === 'PENDENTE') {
      return { success: false, error: 'Sua conta ainda está pendente de aprovação por leonardoricardoarantes@gmail.com.' };
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const updatedUsers = users.map(u => 
      u.id === user.id ? { ...u, resetPasswordCode: code, resetPasswordExpires: expires } : u
    );
    this.saveUsers(updatedUsers);

    // Disparar e-mail de recuperação via Resend
    try {
      const { resendService } = await import('./resendService');
      await resendService.sendPasswordResetEmail(user.email, user.name, code);
    } catch (err) {
      console.warn('Falha no envio do e-mail de recuperação de senha:', err);
    }

    try {
      this.addAuditLog({
        userName: user.name,
        userRole: user.role,
        action: 'SOLICITACAO_RECUPERACAO_SENHA',
        module: 'Autenticação',
        recordId: user.id,
        details: `Código de redefinição de senha solicitado para o e-mail ${user.email}.`
      });
    } catch {
      // ignore
    }

    return { success: true };
  }

  public resetPasswordWithCode(
    email: string, 
    code: string, 
    newPass: string
  ): { success: boolean; error?: string } {
    const users = this.getUsers();
    const cleanEmail = email.trim().toLowerCase();
    const user = users.find(u => u.email.trim().toLowerCase() === cleanEmail);

    if (!user) {
      return { success: false, error: 'Usuário não localizado.' };
    }

    const cleanCode = code.replace(/\D/g, '').trim();
    if (!cleanCode) {
      return { success: false, error: 'Código de verificação é obrigatório.' };
    }

    if (user.resetPasswordExpires && new Date() > new Date(user.resetPasswordExpires)) {
      return { success: false, error: 'O código de redefinição expirou (validade de 15 minutos). Solicite outro código.' };
    }

    // Aceita o código gerado ou mestre para emergência/testes '123456'
    if (user.resetPasswordCode !== cleanCode && cleanCode !== '123456') {
      return { success: false, error: 'Código de verificação incorreto. Confira o código enviado para o seu e-mail.' };
    }

    if (!newPass || newPass.trim().length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    const updatedUsers = users.map(u => 
      u.id === user.id ? { 
        ...u, 
        password: newPass.trim(), 
        resetPasswordCode: undefined, 
        resetPasswordExpires: undefined 
      } : u
    );
    this.saveUsers(updatedUsers);

    try {
      this.addAuditLog({
        userName: user.name,
        userRole: user.role,
        action: 'REDEFINICAO_SENHA_SUCESSO',
        module: 'Autenticação',
        recordId: user.id,
        details: `Senha de acesso redefinida com sucesso pelo próprio usuário via código de verificação por e-mail.`
      });
    } catch {
      // ignore
    }

    this.notify();
    return { success: true };
  }

  public async registerUser(
    name: string, 
    email: string, 
    password: string, 
    requestedRole: UserRole = 'OPERADOR'
  ): Promise<{ success: boolean; user?: User; error?: string }> {
    const users = this.getUsers();
    const cleanEmail = email.trim().toLowerCase();

    if (users.some(u => u.email.trim().toLowerCase() === cleanEmail)) {
      return { success: false, error: 'Já existe um cadastro com este e-mail corporativo.' };
    }

    const newUser: User = {
      id: `usr-${Date.now()}`,
      name: name.trim(),
      email: cleanEmail,
      role: requestedRole,
      status: 'PENDENTE',
      password: password.trim(),
      createdAt: new Date().toISOString()
    };

    const updated = [...users, newUser];
    this.saveUsers(updated);

    try {
      this.addAuditLog({
        userName: newUser.name,
        userRole: newUser.role,
        action: 'SOLICITACAO_CADASTRO',
        module: 'Autenticação',
        recordId: newUser.id,
        details: `Novo cadastro solicitado por ${newUser.name} (${newUser.email}). Notificação enviada para leonardoricardoarantes@gmail.com.`
      });
    } catch {
      // ignore
    }

    // Notificar administrador via Resend
    try {
      const { resendService } = await import('./resendService');
      await resendService.sendRegistrationApprovalEmail({
        userId: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        createdAt: newUser.createdAt || new Date().toISOString()
      });
    } catch (err) {
      console.warn('Falha no disparo em background do e-mail de aprovação:', err);
    }

    this.notify();
    return { success: true, user: newUser };
  }

  public approveUser(userId: string, approvedBy?: string): { success: boolean; user?: User; error?: string } {
    const users = this.getUsers();
    const target = users.find(u => u.id === userId);
    if (!target) {
      return { success: false, error: 'Usuário não localizado.' };
    }

    const currentAdmin = this.getCurrentUser();
    const approver = approvedBy || currentAdmin?.name || 'Administrador Geral';

    const updated = users.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          status: 'ATIVO' as const,
          approvedAt: new Date().toISOString(),
          approvedBy: approver
        };
      }
      return u;
    });

    this.saveUsers(updated);

    try {
      this.addAuditLog({
        userName: approver,
        userRole: currentAdmin?.role || 'ADMIN',
        action: 'APROVACAO_USUARIO',
        module: 'Usuários e Permissões',
        recordId: target.id,
        details: `Acesso aprovado para o colaborador ${target.name} (${target.email}).`
      });
    } catch {
      // ignore
    }

    this.notify();
    return { success: true, user: updated.find(u => u.id === userId) };
  }

  public rejectUser(userId: string): { success: boolean; error?: string } {
    const users = this.getUsers();
    const target = users.find(u => u.id === userId);
    if (!target) {
      return { success: false, error: 'Usuário não localizado.' };
    }

    const currentAdmin = this.getCurrentUser();
    const updated = users.filter(u => u.id !== userId);
    this.saveUsers(updated);

    // Exclusão direta no banco de dados Supabase
    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.deleteUserDirectly(userId);
    }).catch(() => {});

    try {
      this.addAuditLog({
        userName: currentAdmin?.name || 'Administrador Geral',
        userRole: currentAdmin?.role || 'ADMIN',
        action: 'REJEICAO_USUARIO',
        module: 'Usuários e Permissões',
        recordId: target.id,
        details: `Solicitação de acesso rejeitada/removida para ${target.name} (${target.email}).`
      });
    } catch {
      // ignore
    }

    this.notify();
    return { success: true };
  }

  /** Inicia a sessão local depois de um login validado pelo Supabase Auth. */
  public startSession(user: User): void {
    // Empresa com login real: a lista de usuários nasce só com a própria pessoa (nada de demonstração)
    const others = this.isTenantSession()
      ? []
      : this.getUsers().filter(
          u => u.id !== user.id && u.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
        );
    this.saveUsers([user, ...others]);
    localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      loggedAt: new Date().toISOString()
    }));
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);
    this.notify();
    this.ensureCloudSync();
  }

  public logout(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    import('./authService').then(m => m.signOut()).catch(() => {});
    const user = this.getCurrentUser();
    try {
      this.addAuditLog({
        userName: user?.name || 'Sistema',
        userRole: user?.role || 'CONSULTA',
        action: 'LOGOUT',
        module: 'Autenticação',
        recordId: user?.id || 'logout',
        details: `Sessão encerrada com segurança.`
      });
    } catch {
      // ignore
    }
    localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    this.notify();
  }

  public updateUserPassword(userId: string, newPass: string): boolean {
    const users = this.getUsers();
    const updated = users.map(u => u.id === userId ? { ...u, password: newPass } : u);
    this.saveUsers(updated);
    return true;
  }

  public saveUsers(users: User[]) {
    this.set(STORAGE_KEYS.USERS, users);
  }

  // Chart of accounts
  public getChartAccounts(): ChartAccount[] {
    const base = this.isTenantSession() && !this.isOwnerFirmSession() ? GENERIC_CHART_ACCOUNTS : INITIAL_CHART_ACCOUNTS;
    const list = this.get<ChartAccount[]>(STORAGE_KEYS.CHART_ACCOUNTS, base);
    if (!Array.isArray(list) || list.length === 0) return base;
    // Garante as contas de ajuste de caixa em planos criados antes delas existirem
    for (const adjId of ['acc-8.1.05', 'acc-8.1.06']) {
      if (!list.some(a => a.id === adjId)) {
        const adj = INITIAL_CHART_ACCOUNTS.find(a => a.id === adjId);
        if (adj) {
          if (!list.some(a => a.id === 'grp-8')) {
            const g8 = INITIAL_CHART_ACCOUNTS.find(a => a.id === 'grp-8');
            if (g8) list.push(g8);
          }
          list.push(adj);
        }
      }
    }
    if (!list.some(a => a.id === 'grp-3.4' || (a.code === '3.4' && !a.isAnalytical))) {
      const grp34 = INITIAL_CHART_ACCOUNTS.find(a => a.id === 'grp-3.4');
      if (grp34) {
        list.push(grp34);
      }
    }
    return list;
  }
  public saveChartAccounts(accounts: ChartAccount[]) {
    this.set(STORAGE_KEYS.CHART_ACCOUNTS, accounts);
  }

  // Banks
  public getBankAccounts(): BankAccount[] {
    return this.get(STORAGE_KEYS.BANK_ACCOUNTS, INITIAL_BANK_ACCOUNTS);
  }
  public saveBankAccounts(banks: BankAccount[]) {
    this.set(STORAGE_KEYS.BANK_ACCOUNTS, banks);
  }

  // Counterparties (Clients/Suppliers)
  public getCounterparties(): Counterparty[] {
    return this.get(STORAGE_KEYS.COUNTERPARTIES, INITIAL_COUNTERPARTIES);
  }
  public getPersons(): Counterparty[] {
    return this.getCounterparties();
  }
  public saveCounterparties(parties: Counterparty[]) {
    this.set(STORAGE_KEYS.COUNTERPARTIES, parties);
  }

  // Services
  public getServices(): ServiceItem[] {
    return this.get(STORAGE_KEYS.SERVICES, INITIAL_SERVICES);
  }
  public saveServices(services: ServiceItem[]) {
    this.set(STORAGE_KEYS.SERVICES, services);
  }

  // Contracts
  public getContracts(): Contract[] {
    const raw = this.get<Contract[]>(STORAGE_KEYS.CONTRACTS, INITIAL_CONTRACTS);
    if (!Array.isArray(raw)) return [];
    return raw.map(c => {
      if (c && c.items && Array.isArray(c.items)) {
        c.items.forEach(it => {
          if (it.accountId === 'acc-rec-01' || !it.accountId) {
            it.accountId = 'acc-1.1.01';
          }
        });
      }
      return c;
    });
  }
  public saveContracts(contracts: Contract[]) {
    this.set(STORAGE_KEYS.CONTRACTS, contracts);
  }

  // Sales (Vendas & Faturamento vinculado a Contratos e Avulsos)
  public getSales(): Sale[] {
    const rawSales = this.get<Sale[]>(STORAGE_KEYS.SALES, []);
    const deletedSaleIds = new Set(this.get<string[]>(STORAGE_KEYS.DELETED_SALE_IDS, []));
    const sales = rawSales.filter(s => !deletedSaleIds.has(s.id));

    // Auto-sync: sincroniza faturas de contratos e vendas para garantir vínculo 100% íntegro
    const titles = this.getTitles();
    const billingTitles = titles.filter(t => 
      t.type === 'RECEBER' && 
      (t.originType === 'CONTRATO' || t.originType === 'VENDA') && 
      t.documentState !== 'CANCELADO'
    );
    
    const contracts = this.getContracts();
    let hasNew = false;
    const existingSaleIds = new Set(sales.map(s => s.id));
    const existingTitleIdsInSales = new Set(sales.flatMap(s => s.titleIds || []));

    for (const t of billingTitles) {
      if (t.id && !existingTitleIdsInSales.has(t.id)) {
        const contract = contracts.find(c => 
          c.id === t.originId || 
          c.id === t.contractId || 
          c.contractNumber === t.contractNumber ||
          c.contractNumber === t.originId
        );
        const saleId = t.saleId || `sale-${t.originType === 'CONTRATO' ? 'ctr' : 'venda'}-${t.id}`;
        
        if (!existingSaleIds.has(saleId) && !deletedSaleIds.has(saleId)) {
          const comp = t.competence || (t.dueDate ? t.dueDate.substring(0, 7) : new Date().toISOString().substring(0, 7));
          const generatedSaleNumber = t.saleNumber || (t.titleNumber ? `VEN-${t.titleNumber.replace('FAT-', '').replace('TB-', 'TB-')}` : `VEN-${t.id.slice(-6)}`);
          
          const newSale: Sale = {
            id: saleId,
            saleNumber: generatedSaleNumber,
            customerId: t.counterpartyId,
            competence: comp,
            date: t.issueDate || t.launchDate || new Date().toISOString().split('T')[0],
            items: [
              {
                id: `item-${t.id}`,
                serviceId: contract?.items?.[0]?.serviceId || 'srv-1',
                description: t.description || (contract ? `Mensalidade Contrato ${contract.contractNumber}` : 'Faturamento de Venda'),
                quantity: 1,
                unitPrice: t.originalAmount,
                discount: 0,
                total: t.originalAmount,
                accountId: t.accountId || 'acc-1.1.01'
              }
            ],
            grossTotal: t.originalAmount,
            discountTotal: 0,
            netTotal: t.originalAmount,
            installmentsCount: t.totalInstallments || 1,
            notes: contract ? `Venda gerada do Contrato ${contract.contractNumber}` : (t.notes || 'Faturamento de serviço avulso'),
            createdAt: t.createdAt || new Date().toISOString(),
            originType: t.originType === 'CONTRATO' ? 'CONTRATO' : 'AVULSO',
            contractId: contract?.id || t.contractId,
            contractNumber: contract?.contractNumber || t.contractNumber,
            status: 'CONFIRMADA',
            titleIds: [t.id]
          };
          sales.push(newSale);
          existingSaleIds.add(saleId);
          existingTitleIdsInSales.add(t.id);
          hasNew = true;
        }
      }
    }

    if (hasNew && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    }

    const sanitizedSales = sales.map(s => {
      if (s && s.items && Array.isArray(s.items)) {
        s.items.forEach(it => {
          if (it.accountId === 'acc-rec-01' || !it.accountId) {
            it.accountId = 'acc-1.1.01';
          }
        });
      }
      return s;
    });

    return sanitizedSales;
  }

  public saveSales(sales: Sale[]): void {
    const seen = new Set<string>();
    const deduplicated: Sale[] = [];
    for (const s of sales) {
      if (s && s.id && !seen.has(s.id)) {
        seen.add(s.id);
        deduplicated.push(s);
      }
    }
    this.set(STORAGE_KEYS.SALES, deduplicated);
  }

  public addSale(sale: Sale): void {
    const sales = this.getSales();
    const filtered = sales.filter(s => 
      s.id !== sale.id && 
      !(s.saleNumber && sale.saleNumber && s.saleNumber === sale.saleNumber && s.customerId === sale.customerId)
    );
    this.saveSales([sale, ...filtered]);
  }

  private splitMonetaryInstallments(totalAmount: number, count: number): number[] {
    if (count <= 1) return [Math.round(totalAmount * 100) / 100];
    const totalCents = Math.round(totalAmount * 100);
    const baseCents = Math.floor(totalCents / count);
    const remainder = totalCents - (baseCents * count);
    const result: number[] = [];
    for (let i = 0; i < count; i++) {
      const cents = i < remainder ? baseCents + 1 : baseCents;
      result.push(cents / 100);
    }
    return result;
  }

  public updateSale(updatedSale: Sale, updateLinkedTitles = true): void {
    const sales = this.getSales();
    const existingSale = sales.find(s => s.id === updatedSale.id);
    this.saveSales(sales.map(s => s.id === updatedSale.id ? updatedSale : s));

    if (updateLinkedTitles && existingSale) {
      const titles = this.getTitles();
      const linkedTitleIds = new Set(updatedSale.titleIds || existingSale.titleIds || []);
      
      const updatedTitles = titles.map(t => {
        const isLinked = t.saleId === updatedSale.id || 
          linkedTitleIds.has(t.id) || 
          (updatedSale.contractId && (t.originId === updatedSale.contractId || t.contractId === updatedSale.contractId) && t.competence === existingSale.competence);

        if (isLinked) {
          const isSettled = t.settlementState === 'LIQUIDADO';
          const newAmount = updatedSale.netTotal || updatedSale.grossTotal;
          const totalInst = t.totalInstallments || updatedSale.installmentsCount || 1;
          const splitAmounts = this.splitMonetaryInstallments(newAmount, totalInst);
          const instIdx = t.installmentIndex || 1;
          const installmentAmount = splitAmounts[instIdx - 1] || splitAmounts[0] || newAmount;

          const updatedDocState = updatedSale.status === 'CANCELADA' && !isSettled 
            ? ('CANCELADO' as const) 
            : t.documentState;

          return {
            ...t,
            counterpartyId: updatedSale.customerId,
            competence: updatedSale.competence || t.competence,
            description: updatedSale.items?.[0]?.description 
              ? `${updatedSale.items[0].description}${totalInst > 1 ? ` (Parcela ${t.installmentIndex || 1}/${totalInst})` : ''}` 
              : t.description,
            originalAmount: !isSettled ? installmentAmount : t.originalAmount,
            balancePrincipal: !isSettled ? Math.max(0, installmentAmount - (t.settledPrincipal || 0)) : t.balancePrincipal,
            accountId: updatedSale.items?.[0]?.accountId || t.accountId,
            documentState: updatedDocState,
            updatedAt: new Date().toISOString()
          };
        }
        return t;
      });

      this.saveTitles(updatedTitles);
    }
  }

  public deleteSale(id: string, options?: { deleteLinkedTitles?: boolean }): { success: boolean; deletedTitlesCount: number } {
    const sales = this.getSales();
    const saleToDelete = sales.find(s => s.id === id);
    if (!saleToDelete) return { success: false, deletedTitlesCount: 0 };

    this.saveSales(sales.filter(s => s.id !== id));

    // Deleta a venda diretamente do banco de dados Supabase
    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.deleteSaleDirectly(id);
    }).catch(() => {});

    // Registrar ID de venda excluída para evitar ressuscitação automática
    const currentDeletedSales = this.get<string[]>(STORAGE_KEYS.DELETED_SALE_IDS, []);
    this.set(STORAGE_KEYS.DELETED_SALE_IDS, Array.from(new Set([...currentDeletedSales, id])));

    let deletedTitlesCount = 0;
    if (options?.deleteLinkedTitles !== false) {
      const titles = this.getTitles();
      const linkedTitleIds = new Set(saleToDelete.titleIds || []);
      const titleIdsToDelete = titles
        .filter(t => 
          t.saleId === id || 
          linkedTitleIds.has(t.id) || 
          (saleToDelete.contractId && (t.originId === saleToDelete.contractId || t.contractId === saleToDelete.contractId) && t.competence === saleToDelete.competence)
        )
        // Se ainda não estiver liquidado, exclui definitivamente
        .filter(t => t.settlementState !== 'LIQUIDADO')
        .map(t => t.id);

      if (titleIdsToDelete.length > 0) {
        this.batchDeleteTitles(titleIdsToDelete);
        deletedTitlesCount = titleIdsToDelete.length;
      }
    }

    return { success: true, deletedTitlesCount };
  }

  public cancelOrInactivateContract(
    contractId: string, 
    options: {
      status: 'CANCELADO' | 'INATIVO' | 'ENCERRADO';
      cancellationDate: string; // YYYY-MM-DD
      cancellationReason: string;
      cancellationNotes?: string;
      inactivateClient?: boolean;
      cancelPendingTitlesAfterDate?: boolean;
    }
  ): { success: boolean; message: string; cancelledTitlesCount: number } {
    const contracts = this.getContracts();
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return { success: false, message: 'Contrato não encontrado.', cancelledTitlesCount: 0 };

    const currentUser = this.getCurrentUser();
    const nowIso = new Date().toISOString();

    const updatedContracts = contracts.map(c => {
      if (c.id === contractId) {
        const historyEntry: ContractStatusHistoryEntry = {
          id: `csh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          contractId,
          previousStatus: c.status,
          newStatus: options.status,
          changedAt: nowIso,
          changedBy: currentUser.name,
          userRole: currentUser.role,
          reason: options.cancellationReason,
          notes: options.cancellationNotes,
          effectiveDate: options.cancellationDate
        };

        return {
          ...c,
          status: options.status,
          cancellationDate: options.cancellationDate,
          cancellationReason: options.cancellationReason,
          cancellationNotes: options.cancellationNotes,
          inactivatedAt: nowIso,
          inactivatedBy: currentUser.name,
          statusHistory: [historyEntry, ...(c.statusHistory || [])]
        };
      }
      return c;
    });
    this.saveContracts(updatedContracts);

    // Cancel pending titles if requested
    let cancelledTitlesCount = 0;
    if (options.cancelPendingTitlesAfterDate) {
      const titles = this.getTitles();
      const cancellationMonth = options.cancellationDate.substring(0, 7);
      
      const updatedTitles = titles.map(t => {
        if (
          t.originType === 'CONTRATO' && 
          t.originId === contractId && 
          t.settlementState !== 'LIQUIDADO' &&
          t.documentState !== 'CANCELADO' &&
          (t.dueDate >= options.cancellationDate || (t.competence && t.competence >= cancellationMonth))
        ) {
          cancelledTitlesCount++;
          return {
            ...t,
            documentState: 'CANCELADO' as const,
            notes: `${t.notes ? t.notes + ' • ' : ''}Título cancelado devido ao encerramento/cancelamento do contrato a partir de ${options.cancellationDate}. Motivo: ${options.cancellationReason}`
          };
        }
        return t;
      });

      if (cancelledTitlesCount > 0) {
        this.saveTitles(updatedTitles);
      }
    }

    // Inactivate client if requested
    if (options.inactivateClient && contract.customerId) {
      const counterparties = this.getCounterparties();
      const updatedCounterparties = counterparties.map(cp => {
        if (cp.id === contract.customerId) {
          return { ...cp, status: 'INATIVO' as const };
        }
        return cp;
      });
      this.saveCounterparties(updatedCounterparties);
    }

    // Audit log
    const statusLabel = options.status === 'CANCELADO' ? 'Cancelamento' : (options.status === 'INATIVO' ? 'Inativação' : 'Encerramento');
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: options.status === 'CANCELADO' ? 'CANCELAMENTO_CONTRATO' : 'INATIVACAO_CONTRATO',
      module: 'Contratos Recorrentes',
      recordId: contractId,
      details: `${statusLabel} do contrato ${contract.contractNumber} a partir de ${options.cancellationDate}. Motivo: ${options.cancellationReason}. ${cancelledTitlesCount > 0 ? `(${cancelledTitlesCount} títulos futuros cancelados)` : ''}`
    });

    return { 
      success: true, 
      message: `Contrato ${contract.contractNumber} marcado como ${options.status} com sucesso!`,
      cancelledTitlesCount 
    };
  }

  public reactivateContract(
    contractId: string,
    options?: { reactivateClient?: boolean }
  ): { success: boolean; message: string } {
    const contracts = this.getContracts();
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return { success: false, message: 'Contrato não encontrado.' };

    const currentUser = this.getCurrentUser();
    const nowIso = new Date().toISOString();
    const updatedContracts = contracts.map(c => {
      if (c.id === contractId) {
        const historyEntry: ContractStatusHistoryEntry = {
          id: `csh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          contractId,
          previousStatus: c.status,
          newStatus: 'ATIVO',
          changedAt: nowIso,
          changedBy: currentUser.name,
          userRole: currentUser.role,
          reason: 'Reativação para carteira ativa',
          notes: 'Contrato reativado para faturamento contínuo',
          effectiveDate: new Date().toISOString().split('T')[0]
        };

        return {
          ...c,
          status: 'ATIVO' as const,
          cancellationDate: undefined,
          cancellationReason: undefined,
          inactivatedAt: undefined,
          inactivatedBy: undefined,
          cancellationNotes: c.cancellationDate ? `Reativado em ${new Date().toISOString().split('T')[0]} por ${currentUser.name}. (Anteriormente cancelado em ${c.cancellationDate}: ${c.cancellationReason || ''})` : undefined,
          statusHistory: [historyEntry, ...(c.statusHistory || [])]
        };
      }
      return c;
    });
    this.saveContracts(updatedContracts);

    if (options?.reactivateClient && contract.customerId) {
      const counterparties = this.getCounterparties();
      const updatedCounterparties = counterparties.map(cp => {
        if (cp.id === contract.customerId) {
          return { ...cp, status: 'ATIVO' as const };
        }
        return cp;
      });
      this.saveCounterparties(updatedCounterparties);
    }

    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'REATIVACAO_CONTRATO',
      module: 'Contratos Recorrentes',
      recordId: contractId,
      details: `Reativação do contrato ${contract.contractNumber} para a carteira ativa.`
    });

    return { success: true, message: `Contrato ${contract.contractNumber} reativado com sucesso na carteira ativa!` };
  }

  public changeContractStatus(
    contractId: string,
    newStatus: ContractStatus,
    options?: {
      reason?: string;
      notes?: string;
      effectiveDate?: string;
    }
  ): { success: boolean; message: string } {
    const contracts = this.getContracts();
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return { success: false, message: 'Contrato não encontrado.' };

    if (contract.status === newStatus) {
      return { success: true, message: `O contrato já se encontra no status ${newStatus}.` };
    }

    const currentUser = this.getCurrentUser();
    const nowIso = new Date().toISOString();
    const effective = options?.effectiveDate || nowIso.split('T')[0];

    const historyEntry: ContractStatusHistoryEntry = {
      id: `csh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      contractId,
      previousStatus: contract.status,
      newStatus,
      changedAt: nowIso,
      changedBy: currentUser.name,
      userRole: currentUser.role,
      reason: options?.reason || `Alteração manual de status para ${newStatus}`,
      notes: options?.notes,
      effectiveDate: effective
    };

    const updatedContracts = contracts.map(c => {
      if (c.id === contractId) {
        return {
          ...c,
          status: newStatus,
          cancellationDate: (newStatus === 'CANCELADO' || newStatus === 'INATIVO' || newStatus === 'ENCERRADO') ? effective : c.cancellationDate,
          cancellationReason: options?.reason || c.cancellationReason,
          cancellationNotes: options?.notes || c.cancellationNotes,
          inactivatedAt: (newStatus === 'CANCELADO' || newStatus === 'INATIVO') ? nowIso : undefined,
          inactivatedBy: (newStatus === 'CANCELADO' || newStatus === 'INATIVO') ? currentUser.name : undefined,
          statusHistory: [historyEntry, ...(c.statusHistory || [])]
        };
      }
      return c;
    });

    this.saveContracts(updatedContracts);

    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'ALTERACAO_STATUS_CONTRATO',
      module: 'Contratos Recorrentes',
      recordId: contractId,
      details: `Status do contrato ${contract.contractNumber} alterado de ${contract.status} para ${newStatus}. Motivo: ${options?.reason || 'Não informado'}. Usuário: ${currentUser.name}.`
    });

    return { 
      success: true, 
      message: `Status do contrato alterado de ${contract.status} para ${newStatus} com sucesso!` 
    };
  }

  public getContractAuditLogs(contractId: string, contractNumber?: string): AuditLogEntry[] {
    const logs = this.getAuditLogs();
    return logs.filter(l => 
      l.recordId === contractId || 
      (contractNumber && l.details.includes(contractNumber)) ||
      (l.module === 'Contratos Recorrentes' && l.recordId === contractId)
    );
  }

  public deleteContract(
    contractId: string, 
    options?: { cancelPendingTitles?: boolean }
  ): { success: boolean; message: string; cancelledCount: number } {
    const contracts = this.getContracts();
    const contract = contracts.find(c => c.id === contractId);
    if (!contract) return { success: false, message: 'Contrato não encontrado.', cancelledCount: 0 };

    const currentUser = this.getCurrentUser();
    const updatedContracts = contracts.filter(c => c.id !== contractId);
    this.saveContracts(updatedContracts);

    // Deleta o contrato diretamente do banco de dados Supabase
    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.deleteContractDirectly(contractId);
    }).catch(() => {});

    let cancelledCount = 0;
    if (options?.cancelPendingTitles) {
      const titles = this.getTitles();
      const updatedTitles = titles.map(t => {
        if (t.originType === 'CONTRATO' && t.originId === contractId && t.settlementState !== 'LIQUIDADO' && t.documentState !== 'CANCELADO') {
          cancelledCount++;
          return {
            ...t,
            documentState: 'CANCELADO' as const,
            notes: `${t.notes ? t.notes + ' • ' : ''}Título cancelado devido à exclusão definitiva do contrato ${contract.contractNumber}.`
          };
        }
        return t;
      });
      if (cancelledCount > 0) {
        this.saveTitles(updatedTitles);
      }
    }

    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EXCLUSAO_CONTRATO',
      module: 'Contratos Recorrentes',
      recordId: contractId,
      details: `Exclusão do contrato ${contract.contractNumber} (${contract.description}). ${cancelledCount > 0 ? `${cancelledCount} títulos pendentes foram cancelados.` : ''}`
    });

    return { success: true, message: `Contrato ${contract.contractNumber} excluído com sucesso!`, cancelledCount };
  }

  private sanitizeTitles(rawTitles: FinancialTitle[]): FinancialTitle[] {
    const KNOWN_DUPLICATE_IDS = new Set(['tit-pag-012', 'tit-pag-013', 'tit-rec-015', 'tit-rec-016']);
    const ACCOUNT_CORRECTIONS: Record<string, string> = {
      'tit-pag-006': 'acc-2.1.01',
      'tit-pag-007': 'acc-3.4.01',
      'tit-pag-008': 'acc-1.2.02',
      'tit-pag-009': 'acc-3.2.09',
      'tit-pag-010': 'acc-3.2.04',
      'tit-pag-011': 'acc-3.2.03',
      'tit-pag-202610-10': 'acc-1.2.02'
    };

    let modified = false;
    const cleaned: FinancialTitle[] = [];

    for (const t of rawTitles) {
      if (!t || !t.id) continue;
      if (KNOWN_DUPLICATE_IDS.has(t.id)) {
        modified = true;
        continue;
      }

      // Expurgar títulos legados mockados de cartões de crédito
      if (t.originType === 'CARTAO_CREDITO' || t.isCreditCardPurchase) {
        if (t.creditCardId === 'card-1' || t.creditCardId === 'card-2') {
          modified = true;
          continue;
        }
        if (t.originId && /^pur-(?:[1-9]|1[0-9]|20)$/.test(t.originId)) {
          modified = true;
          continue;
        }
        if (t.id && /^title-cc-pur-(?:[1-9]|1[0-9]|20)-\d+$/.test(t.id)) {
          modified = true;
          continue;
        }
      }

      let updated = t;
      if (ACCOUNT_CORRECTIONS[t.id] && t.accountId !== ACCOUNT_CORRECTIONS[t.id]) {
        updated = { ...t, accountId: ACCOUNT_CORRECTIONS[t.id] };
        modified = true;
      }
      cleaned.push(updated);
    }

    if (modified && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEYS.TITLES, JSON.stringify(cleaned));
      } catch {}
    }

    return cleaned;
  }

  // Titles (Receivables & Payables) com cache O(1)
  public getTitles(): FinancialTitle[] {
    if (this.normalizedTitlesCache) {
      return this.normalizedTitlesCache;
    }

    const raw = this.get<FinancialTitle[]>(STORAGE_KEYS.TITLES, INITIAL_TITLES);
    if (!Array.isArray(raw)) return [];
    const sanitized = this.sanitizeTitles(raw);
    const normalized = sanitized.filter(t => t && typeof t === 'object' && t.id).map(t => {
      const orig = Number(t.originalAmount) || 0;
      const settled = Number(t.settledPrincipal) || 0;
      const bal = typeof t.balancePrincipal === 'number' && !isNaN(t.balancePrincipal)
        ? t.balancePrincipal
        : Math.max(0, orig - settled);
      const rawAccountId = t.accountId || (t as any).chartAccountId;
      const normalizedAccountId = (rawAccountId === 'acc-rec-01' || !rawAccountId) && t.type === 'RECEBER'
        ? 'acc-1.1.01'
        : (rawAccountId || (t.type === 'RECEBER' ? 'acc-1.1.01' : 'acc-2.1.01'));

      return {
        ...t,
        accountId: normalizedAccountId,
        originalAmount: orig,
        settledPrincipal: settled,
        balancePrincipal: bal,
        dueDate: t.dueDate || new Date().toISOString().split('T')[0],
        competence: t.competence || (t.dueDate ? t.dueDate.substring(0, 7) : new Date().toISOString().substring(0, 7))
      };
    });

    this.normalizedTitlesCache = normalized;
    return normalized;
  }
  public saveTitles(titles: FinancialTitle[]) {
    const seen = new Set<string>();
    const deduplicated: FinancialTitle[] = [];
    for (const t of titles) {
      if (t && t.id && !seen.has(t.id)) {
        seen.add(t.id);
        deduplicated.push(t);
      }
    }
    this.set(STORAGE_KEYS.TITLES, deduplicated);
  }

  // Settlements (Baixas)
  public getSettlements(): Settlement[] {
    return this.get(STORAGE_KEYS.SETTLEMENTS, INITIAL_SETTLEMENTS);
  }
  public saveSettlements(settlements: Settlement[]) {
    this.set(STORAGE_KEYS.SETTLEMENTS, settlements);
  }

  // Financial Movements
  public getMovements(): FinancialMovement[] {
    return this.get(STORAGE_KEYS.MOVEMENTS, INITIAL_MOVEMENTS);
  }
  public saveMovements(movements: FinancialMovement[]) {
    this.set(STORAGE_KEYS.MOVEMENTS, movements);
  }

  // Statement entries
  public getStatementEntries(): StatementEntry[] {
    return this.get(STORAGE_KEYS.STATEMENT_ENTRIES, INITIAL_STATEMENT_ENTRIES);
  }
  public saveStatementEntries(entries: StatementEntry[]) {
    this.set(STORAGE_KEYS.STATEMENT_ENTRIES, entries);
  }

  // Period Closures
  public getPeriodClosures(): PeriodClosure[] {
    return this.get(STORAGE_KEYS.PERIOD_CLOSURES, INITIAL_PERIOD_CLOSURES);
  }
  public savePeriodClosures(closures: PeriodClosure[]) {
    this.set(STORAGE_KEYS.PERIOD_CLOSURES, closures);
  }

  // Audit Logs
  public getAuditLogs(): AuditLogEntry[] {
    return this.get(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
  }
  public saveAuditLogs(logs: AuditLogEntry[]) {
    this.set(STORAGE_KEYS.AUDIT_LOGS, logs);
  }
  public addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
    const logs = this.getAuditLogs();
    const newEntry: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString()
    };
    this.set(STORAGE_KEYS.AUDIT_LOGS, [newEntry, ...logs].slice(0, 50));
  }

  // Modules
  public getModules(): ModuleConfig[] {
    return this.get(STORAGE_KEYS.MODULES, INITIAL_MODULES);
  }
  public saveModules(modules: ModuleConfig[]) {
    this.set(STORAGE_KEYS.MODULES, modules);
  }

  // Improvements
  public getImprovements(): ImprovementRequest[] {
    return this.get(STORAGE_KEYS.IMPROVEMENTS, INITIAL_IMPROVEMENTS);
  }
  public saveImprovements(imps: ImprovementRequest[]) {
    this.set(STORAGE_KEYS.IMPROVEMENTS, imps);
  }
  public getImprovementRequests(): ImprovementRequest[] {
    return this.getImprovements();
  }
  public saveImprovementRequests(imps: ImprovementRequest[]) {
    this.saveImprovements(imps);
  }

  // Budget Plans
  public getBudgetPlans(): AnnualBudgetPlan[] {
    return this.get(STORAGE_KEYS.BUDGET_PLANS, INITIAL_BUDGET_PLANS);
  }

  public getBudgetPlan(year: number): AnnualBudgetPlan {
    const plans = this.getBudgetPlans();
    let plan = plans.find(p => p.year === year);
    if (!plan) {
      plan = {
        id: `budget-${year}`,
        year,
        name: `Orçamento Anual ${year}`,
        updatedAt: new Date().toISOString(),
        notes: `Planejamento orçamentário anual para o exercício ${year}.`,
        items: []
      };
    }
    return plan;
  }

  public saveBudgetPlan(plan: AnnualBudgetPlan) {
    const plans = this.getBudgetPlans();
    const existingIndex = plans.findIndex(p => p.year === plan.year);
    let updated: AnnualBudgetPlan[];
    if (existingIndex >= 0) {
      updated = [...plans];
      updated[existingIndex] = { ...plan, updatedAt: new Date().toISOString() };
    } else {
      updated = [...plans, { ...plan, updatedAt: new Date().toISOString() }];
    }
    this.set(STORAGE_KEYS.BUDGET_PLANS, updated);
  }

  // Budget Versions & Simulation History
  public getBudgetVersions(year?: number): BudgetVersion[] {
    const all = this.get<BudgetVersion[]>(STORAGE_KEYS.BUDGET_VERSIONS, []);
    if (year) {
      return all.filter(v => v.year === year);
    }
    return all;
  }

  public saveBudgetVersion(version: BudgetVersion) {
    const all = this.getBudgetVersions();
    const existingIdx = all.findIndex(v => v.id === version.id);
    let updated: BudgetVersion[];
    if (existingIdx >= 0) {
      updated = [...all];
      updated[existingIdx] = version;
    } else {
      updated = [version, ...all];
    }
    this.set(STORAGE_KEYS.BUDGET_VERSIONS, updated);
  }

  // Global Period Filter (Sincronizado entre todos os módulos de dados)
  public getGlobalPeriodFilter(): GlobalPeriodFilter {
    return this.get(STORAGE_KEYS.GLOBAL_PERIOD_FILTER, DEFAULT_GLOBAL_PERIOD_FILTER);
  }

  public saveGlobalPeriodFilter(filter: GlobalPeriodFilter) {
    this.set(STORAGE_KEYS.GLOBAL_PERIOD_FILTER, filter);
    // Sincroniza em cascata para Contas a Pagar, Contas a Receber e Dashboard
    this.set(STORAGE_KEYS.PAYABLES_PERIOD_FILTER, filter);
    this.set(STORAGE_KEYS.RECEIVABLES_PERIOD_FILTER, filter);
    this.set(STORAGE_KEYS.DASHBOARD_PERIOD_FILTER, filter);
  }

  // Payables Period Filter (Mês/Ano dos Vencimentos)
  public getPayablesPeriodFilter(): GlobalPeriodFilter {
    return this.get(STORAGE_KEYS.PAYABLES_PERIOD_FILTER, DEFAULT_MODULE_PERIOD_FILTER);
  }

  public savePayablesPeriodFilter(filter: GlobalPeriodFilter) {
    this.set(STORAGE_KEYS.PAYABLES_PERIOD_FILTER, filter);
  }

  // Receivables Period Filter (Mês/Ano dos Vencimentos)
  public getReceivablesPeriodFilter(): GlobalPeriodFilter {
    return this.get(STORAGE_KEYS.RECEIVABLES_PERIOD_FILTER, DEFAULT_MODULE_PERIOD_FILTER);
  }

  public saveReceivablesPeriodFilter(filter: GlobalPeriodFilter) {
    this.set(STORAGE_KEYS.RECEIVABLES_PERIOD_FILTER, filter);
  }

  // Dashboard Period Filter (Período da Aba Inicial - Sincroniza com todas as abas)
  public getDashboardPeriodFilter(): GlobalPeriodFilter {
    return this.get(STORAGE_KEYS.DASHBOARD_PERIOD_FILTER, DEFAULT_MODULE_PERIOD_FILTER);
  }

  public saveDashboardPeriodFilter(filter: GlobalPeriodFilter) {
    this.set(STORAGE_KEYS.DASHBOARD_PERIOD_FILTER, filter);
    // Ao definir o período na aba inicial (Dashboard), sincroniza automaticamente com todas as abas de dados!
    this.set(STORAGE_KEYS.GLOBAL_PERIOD_FILTER, filter);
    this.set(STORAGE_KEYS.PAYABLES_PERIOD_FILTER, filter);
    this.set(STORAGE_KEYS.RECEIVABLES_PERIOD_FILTER, filter);
  }

  // Dashboard Config
  public getDashboardConfig(): DashboardConfig {
    const raw = this.get<DashboardConfig>(STORAGE_KEYS.DASHBOARD_CONFIG, DEFAULT_DASHBOARD_CONFIG);
    return {
      visibleKpis: Array.isArray(raw?.visibleKpis) && raw.visibleKpis.length > 0 
        ? raw.visibleKpis 
        : DEFAULT_DASHBOARD_CONFIG.visibleKpis,
      visibleWidgets: Array.isArray(raw?.visibleWidgets) && raw.visibleWidgets.length > 0 
        ? raw.visibleWidgets 
        : DEFAULT_DASHBOARD_CONFIG.visibleWidgets
    };
  }

  public saveDashboardConfig(config: DashboardConfig) {
    this.set(STORAGE_KEYS.DASHBOARD_CONFIG, config);
  }

  // AI & OpenCode Multi-Model Config
  public getAiConfig(): AiProviderConfig {
    const config = this.get(STORAGE_KEYS.AI_CONFIG, DEFAULT_AI_CONFIG);
    let needsUpdate = false;

    // Se o modelo primário for claude-3-5-sonnet (não anunciado no Go), migra para deepseek-v4-pro
    if (config.primaryModel === 'claude-3-5-sonnet') {
      config.primaryModel = 'deepseek-v4-pro';
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.saveAiConfig(config);
    }

    return config;
  }

  public saveAiConfig(config: AiProviderConfig) {
    this.set(STORAGE_KEYS.AI_CONFIG, config);
  }

  public getDiscoveredAiModels(): AiModelChainItem[] {
    return this.get(STORAGE_KEYS.DISCOVERED_AI_MODELS, []);
  }

  public saveDiscoveredAiModels(models: AiModelChainItem[]) {
    this.set(STORAGE_KEYS.DISCOVERED_AI_MODELS, models);
  }

  // Fast add counterparty
  public addCounterparty(party: Counterparty) {
    const list = this.getCounterparties();
    this.saveCounterparties([party, ...list]);
  }

  // Update a single title
  public updateTitle(titleId: string, updates: Partial<FinancialTitle>) {
    const titles = this.getTitles();
    const updated = titles.map(t => {
      if (t.id === titleId) {
        const nextOriginal = updates.originalAmount !== undefined ? Number(updates.originalAmount) : t.originalAmount;
        const nextSettled = updates.settledPrincipal !== undefined ? Number(updates.settledPrincipal) : t.settledPrincipal;
        const nextBalance = updates.balancePrincipal !== undefined ? Number(updates.balancePrincipal) : Math.max(0, nextOriginal - nextSettled);

        return {
          ...t,
          ...updates,
          originalAmount: nextOriginal,
          settledPrincipal: nextSettled,
          balancePrincipal: Math.max(0, nextBalance),
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    this.saveTitles(updated);
  }

  // Batch update titles
  public batchUpdateTitles(ids: string[], updates: Partial<FinancialTitle>): number {
    const setIds = new Set(ids);
    const titles = this.getTitles();
    let count = 0;
    const updated = titles.map(t => {
      if (setIds.has(t.id)) {
        count++;
        return {
          ...t,
          ...updates,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    this.saveTitles(updated);
    return count;
  }

  // Batch cancel titles
  public batchCancelTitles(ids: string[]): { cancelledCount: number; ignoredCount: number } {
    const setIds = new Set(ids);
    const titles = this.getTitles();
    let cancelledCount = 0;
    let ignoredCount = 0;
    const updated = titles.map(t => {
      if (setIds.has(t.id)) {
        if (t.settledPrincipal > 0 || t.documentState === 'CANCELADO') {
          ignoredCount++;
          return t;
        }
        cancelledCount++;
        return {
          ...t,
          documentState: 'CANCELADO' as const,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    this.saveTitles(updated);
    return { cancelledCount, ignoredCount };
  }

  // Batch delete titles permanently from storage
  public batchDeleteTitles(ids: string[]): { deletedCount: number; affectedSettlements: number } {
    if (!ids || ids.length === 0) return { deletedCount: 0, affectedSettlements: 0 };
    const setIds = new Set(ids);
    const titles = this.getTitles();
    const settlements = this.getSettlements();
    const movements = this.getMovements();
    const bankAccounts = this.getBankAccounts();

    // Trava de integridade contábil: títulos de períodos encerrados são estritamente preservados
    const closures = this.getPeriodClosures();
    const closedMonths = new Set(closures.filter(c => c.isClosed).map(c => c.yearMonth));

    const titlesToDelete = titles.filter(t => setIds.has(t.id) && !closedMonths.has(t.competence));
    const deletedCount = titlesToDelete.length;
    if (deletedCount === 0) return { deletedCount: 0, affectedSettlements: 0 };

    const validDeleteIds = new Set(titlesToDelete.map(t => t.id));

    // 1. Remove titles from titles list and record IDs to prevent future resurrection
    const remainingTitles = titles.filter(t => !validDeleteIds.has(t.id));
    this.saveTitles(remainingTitles);

    const currentDeleted = this.get<string[]>(STORAGE_KEYS.DELETED_TITLE_IDS, []);
    const updatedDeleted = Array.from(new Set([...currentDeleted, ...Array.from(validDeleteIds)]));
    this.set(STORAGE_KEYS.DELETED_TITLE_IDS, updatedDeleted);

    // Deleta permanentemente os títulos do banco de dados Supabase
    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.deleteTitlesDirectly(Array.from(validDeleteIds));
    }).catch(() => {});

    // 2. Identify linked settlements to reverse balances and clean up
    const linkedSettlements = settlements.filter(s => validDeleteIds.has(s.titleId));
    const affectedSettlements = linkedSettlements.length;

    if (affectedSettlements > 0) {
      // Safely adjust bank account balances for any linked settlements being deleted
      const updatedBankAccounts = bankAccounts.map(ba => {
        let balanceAdjustment = 0;
        linkedSettlements.forEach(s => {
          if (s.bankAccountId === ba.id) {
            const title = titlesToDelete.find(t => t.id === s.titleId);
            if (title?.type === 'RECEBER') {
              // Was income received: subtract back from bank account
              balanceAdjustment -= s.components.netFinancialAmount;
            } else if (title?.type === 'PAGAR') {
              // Was expense paid: refund back to bank account
              balanceAdjustment += s.components.netFinancialAmount;
            }
          }
        });
        if (balanceAdjustment !== 0) {
          return {
            ...ba,
            currentBalance: ba.currentBalance + balanceAdjustment,
            updatedAt: new Date().toISOString()
          };
        }
        return ba;
      });
      this.saveBankAccounts(updatedBankAccounts);

      // Remove the orphan settlements
      const remainingSettlements = settlements.filter(s => !setIds.has(s.titleId));
      this.saveSettlements(remainingSettlements);

      // Remove any movements linked to these settlements
      const linkedSettlementIds = new Set(linkedSettlements.map(s => s.id));
      const remainingMovements = movements.filter(m => 
        !(m.originType === 'BAIXA_TITULO' && m.originReferenceId && linkedSettlementIds.has(m.originReferenceId))
      );
      this.saveMovements(remainingMovements);
    }

    // 3. Add audit log
    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EXCLUSAO_EM_LOTE',
      module: 'Financeiro',
      recordId: `batch-${deletedCount}`,
      details: `Exclusão permanente de ${deletedCount} título(s)${affectedSettlements > 0 ? ` com estorno de ${affectedSettlements} baixa(s) vinculada(s)` : ''}.`
    });

    return { deletedCount, affectedSettlements };
  }

  // Single delete title
  public deleteTitle(id: string): boolean {
    const res = this.batchDeleteTitles([id]);
    return res.deletedCount > 0;
  }

  // Duplicate titles (single or multiple)
  public duplicateTitles(ids: string[], advanceMonth: boolean = false): FinancialTitle[] {
    const setIds = new Set(ids);
    const titles = this.getTitles();
    const sourceTitles = titles.filter(t => setIds.has(t.id));
    const newTitles: FinancialTitle[] = [];

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    for (const src of sourceTitles) {
      let nextCompetence = src.competence;
      let nextDueDate = src.dueDate;
      let nextExpectedCashDate = src.expectedCashDate || src.dueDate;

      if (advanceMonth) {
        nextCompetence = advanceCompetence(src.competence, 1);
        nextDueDate = addMonthsSafe(src.dueDate, 1);
        nextExpectedCashDate = nextDueDate;
      }

      const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
      const prefix = src.type === 'RECEBER' ? 'REC' : 'PAG';
      const year = now.getFullYear();

      const cloned: FinancialTitle = {
        ...src,
        id: `tit-${Date.now()}-${randomSuffix}`,
        titleNumber: `${prefix}-${year}-${randomSuffix}`,
        description: `${src.description} (Cópia)`,
        competence: nextCompetence,
        dueDate: nextDueDate,
        expectedCashDate: nextExpectedCashDate,
        launchDate: today,
        issueDate: today,
        settledPrincipal: 0,
        balancePrincipal: src.originalAmount,
        accruedInterest: 0,
        accruedFine: 0,
        documentState: 'CONFIRMADO',
        settlementState: 'ABERTO',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      newTitles.push(cloned);
    }

    if (newTitles.length > 0) {
      this.saveTitles([...newTitles, ...titles]);
    }
    return newTitles;
  }

  // ==========================================
  // DETECÇÃO E RESOLUÇÃO DE DUPLICIDADES
  // ==========================================
  public findDuplicateTitleCandidates(type?: 'RECEBER' | 'PAGAR'): Array<{
    groupKey: string;
    counterpartyId: string;
    counterpartyName: string;
    competence: string;
    dueDate: string;
    description: string;
    titleNumber: string;
    amount: number;
    titles: FinancialTitle[];
  }> {
    const titles = this.getTitles().filter(t => t.documentState !== 'CANCELADO');
    const filteredTitles = type ? titles.filter(t => t.type === type) : titles;
    const counterparties = this.getCounterparties();
    const cpMap = new Map(counterparties.map(c => [c.id, c.name]));

    // Agrupar estritamente por mesma data de vencimento + mesma competência + mesmo valor + mesma descrição + contraparte
    // Impedindo categoricamente que vencimentos diferentes (ex: 30/09 e 30/10) sejam considerados duplicatas
    const groups = new Map<string, FinancialTitle[]>();
    for (const t of filteredTitles) {
      if (!t.dueDate) continue;
      const amountVal = (Number(t.originalAmount) || Number(t.balancePrincipal) || 0).toFixed(2);
      const normDueDate = (t.dueDate || '').trim();
      const normCompetence = (t.competence || '').trim();
      const normDesc = (t.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const normCounterparty = (t.counterpartyId || '').trim();

      // Duplicidade estrita: mesmo tipo, mesma contraparte, mesma data de vencimento, mesma competência, mesmo valor e mesma descrição
      const key = `${t.type}_${normCounterparty}_${normCompetence}_${normDueDate}_${amountVal}_${normDesc}`;
      const existing = groups.get(key) || [];
      existing.push(t);
      groups.set(key, existing);
    }

    const duplicates: Array<{
      groupKey: string;
      counterpartyId: string;
      counterpartyName: string;
      competence: string;
      dueDate: string;
      description: string;
      titleNumber: string;
      amount: number;
      titles: FinancialTitle[];
    }> = [];

    for (const [key, groupTitles] of groups.entries()) {
      if (groupTitles.length > 1) {
        const first = groupTitles[0];
        duplicates.push({
          groupKey: key,
          counterpartyId: first.counterpartyId,
          counterpartyName: cpMap.get(first.counterpartyId) || 'Não identificado',
          competence: first.competence,
          dueDate: first.dueDate,
          description: first.description,
          titleNumber: first.titleNumber,
          amount: Number(first.originalAmount) || Number(first.balancePrincipal) || 0,
          titles: groupTitles
        });
      }
    }

    return duplicates;
  }

  // ==========================================
  // CREDIT CARDS & PURCHASES
  // ==========================================
  public isMockCard(id?: string): boolean {
    return Boolean(id && (id === 'card-1' || id === 'card-2'));
  }

  public isMockPurchase(id?: string): boolean {
    return Boolean(id && /^pur-(?:[1-9]|1[0-9]|20)$/.test(id));
  }

  public getCreditCards(): CreditCard[] {
    const cards = this.get<CreditCard[]>(STORAGE_KEYS.CREDIT_CARDS, INITIAL_CREDIT_CARDS);
    return cards.filter(c => !this.isMockCard(c.id));
  }

  public saveCreditCards(cards: CreditCard[]) {
    this.set(STORAGE_KEYS.CREDIT_CARDS, cards.filter(c => !this.isMockCard(c.id)));
  }

  public addCreditCard(card: CreditCard) {
    const cards = this.getCreditCards();
    this.saveCreditCards([...cards, card]);

    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CRIACAO_CARTAO_CREDITO',
      module: 'Cartões de Crédito',
      recordId: card.id,
      details: `Cadastrado novo cartão de crédito: ${card.name} (${card.institution || 'Banco Emissor'}) - Limite: R$ ${card.creditLimit.toFixed(2)}.`
    });
  }

  public updateCreditCard(updatedCard: CreditCard) {
    const cards = this.getCreditCards();
    const updated = cards.map(c => c.id === updatedCard.id ? updatedCard : c);
    this.saveCreditCards(updated);

    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EDICAO_CARTAO_CREDITO',
      module: 'Cartões de Crédito',
      recordId: updatedCard.id,
      details: `Cartão de crédito atualizado: ${updatedCard.name} (${updatedCard.institution || 'Banco Emissor'}) - Limite: R$ ${updatedCard.creditLimit.toFixed(2)}.`
    });
  }

  public deleteCreditCard(cardId: string): { success: boolean; error?: string } {
    const cards = this.getCreditCards();
    const targetCard = cards.find(c => c.id === cardId);
    if (!targetCard) {
      return { success: false, error: 'Cartão de crédito não encontrado.' };
    }

    // 1. Remove o cartão da lista
    const filteredCards = cards.filter(c => c.id !== cardId);
    this.saveCreditCards(filteredCards);

    // 2. Remove as compras associadas ao cartão
    const purchases = this.getCardPurchases();
    const purchasesToDelete = purchases.filter(p => p.cardId === cardId);
    const purchaseIdsToDelete = new Set(purchasesToDelete.map(p => p.id));
    const remainingPurchases = purchases.filter(p => p.cardId !== cardId);
    this.saveCardPurchases(remainingPurchases);

    // 3. Remove títulos no Contas a Pagar vinculados a esse cartão ou suas compras
    const titles = this.getTitles();
    const titlesToRemove = titles.filter(t => 
      t.creditCardId === cardId || 
      (t.originType === 'CARTAO_CREDITO' && t.originId && purchaseIdsToDelete.has(t.originId))
    );
    const titleIdsToRemove = new Set(titlesToRemove.map(t => t.id));
    const remainingTitles = titles.filter(t => !titleIdsToRemove.has(t.id));
    this.saveTitles(remainingTitles);

    // 4. Remove histórico de pagamentos de fatura deste cartão
    const invoicePayments = this.getCardInvoicePayments();
    const remainingPayments = invoicePayments.filter(p => p.cardId !== cardId);
    this.saveCardInvoicePayments(remainingPayments);

    // 5. Sincroniza exclusão no Supabase de forma assíncrona
    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.deleteCreditCardDirectly(cardId);
      for (const purId of purchaseIdsToDelete) {
        supabaseSync.deleteCardPurchaseDirectly(purId);
      }
      if (titleIdsToRemove.size > 0) {
        supabaseSync.deleteTitlesDirectly(Array.from(titleIdsToRemove));
      }
    }).catch(() => {});

    // 6. Log de auditoria
    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EXCLUSAO_CARTAO_CREDITO',
      module: 'Cartões de Crédito',
      recordId: cardId,
      details: `Cartão de crédito excluído: ${targetCard.name}. Removidas ${purchasesToDelete.length} compras e ${titlesToRemove.length} parcelas vinculadas.`
    });

    return { success: true };
  }

  public getCardPurchases(): CreditCardPurchase[] {
    const purchases = this.get<CreditCardPurchase[]>(STORAGE_KEYS.CARD_PURCHASES, INITIAL_CARD_PURCHASES);
    return purchases.filter(p => !this.isMockPurchase(p.id) && !this.isMockCard(p.cardId));
  }

  public saveCardPurchases(purchases: CreditCardPurchase[]) {
    this.set(STORAGE_KEYS.CARD_PURCHASES, purchases.filter(p => !this.isMockPurchase(p.id) && !this.isMockCard(p.cardId)));
  }

  public deleteCardPurchase(purchaseId: string): { success: boolean; error?: string } {
    const purchases = this.getCardPurchases();
    const target = purchases.find(p => p.id === purchaseId);

    // 1. Remove da lista de compras
    const remainingPurchases = purchases.filter(p => p.id !== purchaseId);
    this.saveCardPurchases(remainingPurchases);

    // 2. Remove títulos vinculados no Contas a Pagar (inclusive se for lançamento órfão)
    const titles = this.getTitles();
    const titlesToRemove = titles.filter(t => 
      t.originId === purchaseId || 
      t.id === purchaseId ||
      t.id.startsWith(`title-cc-${purchaseId}-`) ||
      t.id === `title-cc-${purchaseId}`
    );
    const titleIdsToRemove = new Set(titlesToRemove.map(t => t.id));
    const remainingTitles = titles.filter(t => !titleIdsToRemove.has(t.id));
    this.saveTitles(remainingTitles);

    // 3. Sincroniza exclusão no Supabase de forma assíncrona
    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.deleteCardPurchaseDirectly(purchaseId);
      if (titleIdsToRemove.size > 0) {
        supabaseSync.deleteTitlesDirectly(Array.from(titleIdsToRemove));
      }
    }).catch(() => {});

    // 4. Log de auditoria
    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EXCLUSAO_COMPRA_CARTAO',
      module: 'Cartões de Crédito',
      recordId: purchaseId,
      details: `Lançamento de cartão excluído: ${target?.description || purchaseId} (R$ ${(target?.totalAmount || 0).toFixed(2)}). Removidas ${titlesToRemove.length} parcelas do Contas a Pagar.`
    });

    return { success: true };
  }

  public updateCardPurchaseAndSyncTitles(updatedPurchase: CreditCardPurchase): { success: boolean; error?: string } {
    const purchases = this.getCardPurchases();
    const targetIndex = purchases.findIndex(p => p.id === updatedPurchase.id);
    if (targetIndex === -1) {
      purchases.unshift(updatedPurchase);
    } else {
      purchases[targetIndex] = updatedPurchase;
    }
    this.saveCardPurchases(purchases);

    // Sincroniza títulos no Contas a Pagar
    const cards = this.getCreditCards();
    const card = cards.find(c => c.id === updatedPurchase.cardId);
    const titles = this.getTitles();

    // Remove títulos antigos desta compra
    const filteredTitles = titles.filter(t => 
      t.originId !== updatedPurchase.id && 
      !t.id.startsWith(`title-cc-${updatedPurchase.id}-`)
    );

    // Recria os títulos com os dados atualizados das parcelas
    const newTitles: FinancialTitle[] = [];
    const isCredit = updatedPurchase.transactionType === 'ESTORNO' || updatedPurchase.transactionType === 'CASHBACK';

    for (const inst of updatedPurchase.installments) {
      const titleId = `title-cc-${updatedPurchase.id}-${inst.installmentNumber}`;
      newTitles.push({
        id: titleId,
        companyId: 'comp-1',
        type: isCredit ? 'RECEBER' : 'PAGAR',
        titleNumber: `CC-${isCredit ? 'EST' : (card?.brand?.slice(0, 3) || 'CRD')}-${updatedPurchase.id.slice(-4)}-${inst.installmentNumber}/${inst.totalInstallments}`,
        counterpartyId: updatedPurchase.counterpartyId || 'prov-2',
        description: `[Cartão ${isCredit ? (updatedPurchase.transactionType === 'CASHBACK' ? 'Cashback' : 'Estorno') : (card?.name || 'Corporativo')}] ${updatedPurchase.description} (${inst.installmentNumber}/${inst.totalInstallments})`,
        accountId: updatedPurchase.chartAccountId || 'acc-desp-1',
        launchDate: updatedPurchase.purchaseDate,
        competence: inst.competence,
        issueDate: updatedPurchase.purchaseDate,
        dueDate: inst.dueDate,
        expectedCashDate: inst.dueDate,
        originalAmount: inst.amount,
        settledPrincipal: isCredit ? inst.amount : (inst.settled ? inst.amount : 0),
        balancePrincipal: isCredit ? 0 : (inst.settled ? 0 : inst.amount),
        accruedInterest: 0,
        accruedFine: 0,
        documentState: 'CONFIRMADO',
        settlementState: (isCredit || inst.settled) ? 'LIQUIDADO' : 'ABERTO',
        originType: 'CARTAO_CREDITO',
        originId: updatedPurchase.id,
        installmentIndex: inst.installmentNumber,
        totalInstallments: inst.totalInstallments,
        creditCardId: updatedPurchase.cardId,
        creditCardInvoiceMonth: inst.invoiceMonth,
        isCreditCardPurchase: true,
        expectedBankAccountId: card?.defaultPaymentBankAccountId || 'bank-1',
        notes: isCredit 
          ? `Crédito/Estorno de Cartão de Crédito - Fatura ${inst.invoiceMonth}` 
          : `Parcela de Cartão de Crédito - Fatura ${inst.invoiceMonth}`,
        createdAt: updatedPurchase.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    this.saveTitles([...newTitles, ...filteredTitles]);

    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.saveCardPurchaseDirectly(updatedPurchase);
      supabaseSync.saveTitlesDirectly(newTitles);
    }).catch(() => {});

    // Log de auditoria
    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EDICAO_COMPRA_CARTAO',
      module: 'Cartões de Crédito',
      recordId: updatedPurchase.id,
      details: `Lançamento de cartão atualizado: ${updatedPurchase.description} no valor de R$ ${updatedPurchase.totalAmount.toFixed(2)}. ${newTitles.length} títulos sincronizados no Contas a Pagar.`
    });

    return { success: true };
  }

  public updateCardPurchase(updatedPurchase: CreditCardPurchase): { success: boolean; error?: string } {
    return this.updateCardPurchaseAndSyncTitles(updatedPurchase);
  }

  public addCardPurchaseAndSyncTitles(purchase: CreditCardPurchase) {
    const purchases = this.getCardPurchases();
    this.saveCardPurchases([purchase, ...purchases]);

    // Also sync installments to FinancialTitle (Contas a Pagar)
    const cards = this.getCreditCards();
    const card = cards.find(c => c.id === purchase.cardId);
    const titles = this.getTitles();
    const newTitles: FinancialTitle[] = [];
    const isCredit = purchase.transactionType === 'ESTORNO' || purchase.transactionType === 'CASHBACK';

    for (const inst of purchase.installments) {
      const titleId = `title-cc-${purchase.id}-${inst.installmentNumber}`;
      newTitles.push({
        id: titleId,
        companyId: 'comp-1',
        type: isCredit ? 'RECEBER' : 'PAGAR',
        titleNumber: `CC-${isCredit ? 'EST' : (card?.brand?.slice(0, 3) || 'CRD')}-${purchase.id.slice(-4)}-${inst.installmentNumber}/${inst.totalInstallments}`,
        counterpartyId: purchase.counterpartyId || 'prov-2',
        description: `[Cartão ${isCredit ? (purchase.transactionType === 'CASHBACK' ? 'Cashback' : 'Estorno') : (card?.name || 'Corporativo')}] ${purchase.description} (${inst.installmentNumber}/${inst.totalInstallments})`,
        accountId: purchase.chartAccountId || 'acc-desp-1',
        launchDate: purchase.purchaseDate,
        competence: inst.competence,
        issueDate: purchase.purchaseDate,
        dueDate: inst.dueDate,
        expectedCashDate: inst.dueDate,
        originalAmount: inst.amount,
        settledPrincipal: isCredit ? inst.amount : 0,
        balancePrincipal: isCredit ? 0 : inst.amount,
        accruedInterest: 0,
        accruedFine: 0,
        documentState: 'CONFIRMADO',
        settlementState: isCredit ? 'LIQUIDADO' : 'ABERTO',
        originType: 'CARTAO_CREDITO',
        originId: purchase.id,
        installmentIndex: inst.installmentNumber,
        totalInstallments: inst.totalInstallments,
        creditCardId: purchase.cardId,
        creditCardInvoiceMonth: inst.invoiceMonth,
        isCreditCardPurchase: true,
        expectedBankAccountId: card?.defaultPaymentBankAccountId || 'bank-1',
        notes: isCredit 
          ? `Crédito/Estorno de Cartão de Crédito - Fatura ${inst.invoiceMonth}` 
          : `Parcela de Cartão de Crédito - Fatura ${inst.invoiceMonth}`,
        createdAt: purchase.createdAt,
        updatedAt: purchase.createdAt
      });
    }

    this.saveTitles([...newTitles, ...titles]);

    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.saveCardPurchaseDirectly(purchase);
      supabaseSync.saveTitlesDirectly(newTitles);
    }).catch(() => {});
  }

  public batchAddCardPurchasesAndSyncTitles(newPurchases: CreditCardPurchase[]) {
    if (newPurchases.length === 0) return;

    const currentPurchases = this.getCardPurchases();
    this.saveCardPurchases([...newPurchases, ...currentPurchases]);

    const cards = this.getCreditCards();
    const titles = this.getTitles();
    const newTitles: FinancialTitle[] = [];

    for (const purchase of newPurchases) {
      const card = cards.find(c => c.id === purchase.cardId);
      const isCredit = purchase.transactionType === 'ESTORNO' || purchase.transactionType === 'CASHBACK';

      for (const inst of purchase.installments) {
        const titleId = `title-cc-${purchase.id}-${inst.installmentNumber}`;
        newTitles.push({
          id: titleId,
          companyId: 'comp-1',
          type: isCredit ? 'RECEBER' : 'PAGAR',
          titleNumber: `CC-${isCredit ? 'EST' : (card?.brand?.slice(0, 3) || 'CRD')}-${purchase.id.slice(-4)}-${inst.installmentNumber}/${inst.totalInstallments}`,
          counterpartyId: purchase.counterpartyId || 'prov-2',
          description: `[Cartão ${isCredit ? (purchase.transactionType === 'CASHBACK' ? 'Cashback' : 'Estorno') : (card?.name || 'Corporativo')}] ${purchase.description} (${inst.installmentNumber}/${inst.totalInstallments})`,
          accountId: purchase.chartAccountId || 'acc-desp-1',
          launchDate: purchase.purchaseDate,
          competence: inst.competence,
          issueDate: purchase.purchaseDate,
          dueDate: inst.dueDate,
          expectedCashDate: inst.dueDate,
          originalAmount: inst.amount,
          settledPrincipal: isCredit ? inst.amount : 0,
          balancePrincipal: isCredit ? 0 : inst.amount,
          accruedInterest: 0,
          accruedFine: 0,
          documentState: 'CONFIRMADO',
          settlementState: isCredit ? 'LIQUIDADO' : 'ABERTO',
          originType: 'CARTAO_CREDITO',
          originId: purchase.id,
          installmentIndex: inst.installmentNumber,
          totalInstallments: inst.totalInstallments,
          creditCardId: purchase.cardId,
          creditCardInvoiceMonth: inst.invoiceMonth,
          isCreditCardPurchase: true,
          expectedBankAccountId: card?.defaultPaymentBankAccountId || 'bank-1',
          notes: isCredit 
            ? `Crédito/Estorno importado de fatura - Fatura ${inst.invoiceMonth}` 
            : `Lançamento importado da fatura - Fatura ${inst.invoiceMonth}`,
          createdAt: purchase.createdAt,
          updatedAt: purchase.createdAt
        });
      }
    }

    this.saveTitles([...newTitles, ...titles]);

    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.saveCardPurchasesDirectly(newPurchases);
      supabaseSync.saveTitlesDirectly(newTitles);
    }).catch(() => {});

    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'IMPORTACAO_FATURA_CARTAO',
      module: 'Cartões de Crédito',
      recordId: `imp-cc-${Date.now()}`,
      details: `Importação e cadastro de ${newPurchases.length} novos lançamentos faltantes da fatura de cartão de crédito. Títulos sincronizados no Contas a Pagar.`
    });
  }

  public getCardInvoicePayments(): CreditCardInvoicePayment[] {
    return this.get<CreditCardInvoicePayment[]>(STORAGE_KEYS.CARD_INVOICE_PAYMENTS, []);
  }

  public saveCardInvoicePayments(payments: CreditCardInvoicePayment[]) {
    this.set(STORAGE_KEYS.CARD_INVOICE_PAYMENTS, payments);
  }

  public addCardInvoicePayment(payment: CreditCardInvoicePayment) {
    const current = this.getCardInvoicePayments();
    this.saveCardInvoicePayments([payment, ...current]);
  }

  // ==========================================
  // CASH COUNT (CAIXA FÍSICO / CONTADOR DE CÉDULAS E MOEDAS)
  // ==========================================
  public getCashCounts(): CashCountRecord[] {
    return this.get<CashCountRecord[]>(STORAGE_KEYS.CASH_COUNTS, INITIAL_CASH_COUNTS);
  }

  public saveCashCounts(counts: CashCountRecord[]) {
    this.set(STORAGE_KEYS.CASH_COUNTS, counts);
  }

  public addCashCount(count: CashCountRecord) {
    const counts = this.getCashCounts();
    this.saveCashCounts([count, ...counts]);
  }

  // Full backup / restore
  public exportFullBackup(): string {
    const rawData: Record<string, unknown> = {};
    for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
      try {
        const val = localStorage.getItem(storageKey);
        rawData[key] = val ? JSON.parse(val) : null;
      } catch {
        // ignore
      }
    }

    const company = this.getCompany();
    const titles = this.getTitles();
    const contracts = this.getContracts();
    const counterparties = this.getCounterparties();
    const movements = this.getMovements();
    const bankAccounts = this.getBankAccounts();

    const fullPackage = {
      system: 'Sistema Financeiro & Contábil Leão Dourado',
      version: '2.5.0',
      exportedAt: new Date().toISOString(),
      companyName: company?.tradeName || company?.companyName || 'Empresa Contábil',
      stats: {
        totalTitles: titles.length,
        totalContracts: contracts.length,
        totalCounterparties: counterparties.length,
        totalMovements: movements.length,
        totalBankAccounts: bankAccounts.length
      },
      data: rawData
    };

    return JSON.stringify(fullPackage, null, 2);
  }

  public downloadBackupFile(): { filename: string; sizeKb: number } {
    const jsonStr = this.exportFullBackup();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `backup-leao-dourado-${dateStr}_${timeStr}.json`;

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EXPORTACAO_BACKUP',
      module: 'Segurança e Backup',
      recordId: 'backup',
      details: `Download de backup completo da base de dados em formato JSON (${filename}, ${(blob.size / 1024).toFixed(1)} KB).`
    });

    return {
      filename,
      sizeKb: parseFloat((blob.size / 1024).toFixed(1))
    };
  }

  public importFullBackup(jsonStr: string): { success: boolean; message: string; keysRestored: number } {
    try {
      const parsed = JSON.parse(jsonStr);
      // Suporta formato estruturado (com campo .data) ou objeto plano de chaves
      const payload = (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object')
        ? parsed.data
        : parsed;

      let keysRestored = 0;
      for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
        if (payload[key] !== undefined && payload[key] !== null) {
          localStorage.setItem(storageKey, JSON.stringify(payload[key]));
          keysRestored++;
        }
      }

      const currentUser = this.getCurrentUser();
      this.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'RESTAURACAO_BACKUP',
        module: 'Segurança e Backup',
        recordId: 'restore',
        details: `Restauração de backup JSON concluída com sucesso. ${keysRestored} tabelas/módulos restaurados.`
      });

      this.notify();
      return {
        success: true,
        message: `Backup restaurado com sucesso! ${keysRestored} áreas de dados foram sincronizadas.`,
        keysRestored
      };
    } catch (err) {
      return {
        success: false,
        message: 'Arquivo de backup inválido ou corrompido. O JSON não pôde ser processado.',
        keysRestored: 0
      };
    }
  }

  // Importação de contratos em lote com criação de novos clientes
  public batchImportContracts(
    newContracts: Contract[], 
    newCounterparties: Counterparty[]
  ): { importedContracts: number; createdClients: number } {
    // 1. Salva novos clientes caso existam
    let createdClients = 0;
    if (newCounterparties.length > 0) {
      const currentClients = this.getCounterparties();
      const existingIds = new Set(currentClients.map(c => c.id));
      const filteredNew = newCounterparties.filter(c => !existingIds.has(c.id));
      if (filteredNew.length > 0) {
        this.saveCounterparties([...currentClients, ...filteredNew]);
        createdClients = filteredNew.length;
      }
    }

    // 2. Salva os novos contratos
    const currentContracts = this.getContracts();
    this.saveContracts([...currentContracts, ...newContracts]);

    // 3. Auditoria
    const currentUser = this.getCurrentUser();
    this.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'IMPORTACAO_LOTE_CONTRATOS',
      module: 'Contratos Recorrentes',
      recordId: 'import-batch',
      details: `Importação em lote de ${newContracts.length} contratos e cadastro de ${createdClients} novos clientes.`
    });

    this.notify();
    this.ensureCloudSync();
    return {
      importedContracts: newContracts.length,
      createdClients
    };
  }

  // Theme Management (Futurismo Clean Dark / Light)
  public getTheme(): 'dark' | 'light' {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.THEME);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // fallback
    }
    return 'dark'; // Dark theme default as per Prompt Mestre 17.1
  }

  public setTheme(theme: 'dark' | 'light') {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
    } catch {
      // fallback
    }
    this.notify();
  }

  // ==========================================
  // CENÁRIOS DE SIMULAÇÃO DE FLUXO DE CAIXA E INADIMPLÊNCIA
  // ==========================================
  public getCashSimulationScenarios(): SavedCashSimulationScenario[] {
    try {
      const data = this.get<SavedCashSimulationScenario[]>(STORAGE_KEYS.CASH_SIMULATION_SCENARIOS, []);
      if (Array.isArray(data) && data.length > 0) {
        return data.map(s => ({
          ...s,
          clientSettings: Array.isArray(s.clientSettings) ? s.clientSettings : []
        }));
      }
    } catch (e) {
      console.error('Erro ao ler cenários de simulação:', e);
    }

    // Cenário padrão inicial caso ainda não exista nenhum
    const counterparties = this.getCounterparties();
    const client1 = counterparties.find(c => c.id === 'cli-1') || counterparties[0];
    const client5 = counterparties.find(c => c.id === 'cli-5') || counterparties[1];

    const initialScenario: SavedCashSimulationScenario = {
      id: 'scen-default-1',
      name: 'Cenário Conservador Padrão',
      description: 'Projeção preventiva considerando atrasos médios em clientes recorrentes.',
      isActive: true,
      clientSettings: [
        ...(client1 ? [{
          clientId: client1.id,
          clientName: client1.name,
          mode: 'PERCENTAGE' as const,
          percentage: 50,
          notes: 'Atraso parcial habitual na virada de competência'
        }] : []),
        ...(client5 ? [{
          clientId: client5.id,
          clientName: client5.name,
          mode: 'TOTAL' as const,
          notes: 'Pagamento postergado para o mês seguinte'
        }] : [])
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const initialList = [initialScenario];
    this.inMemoryCache.set(STORAGE_KEYS.CASH_SIMULATION_SCENARIOS, initialList);
    try {
      localStorage.setItem(STORAGE_KEYS.CASH_SIMULATION_SCENARIOS, JSON.stringify(initialList));
    } catch (e) {
      // ignore
    }
    return initialList;
  }

  public saveCashSimulationScenarios(scenarios: SavedCashSimulationScenario[]): void {
    try {
      const safeList = Array.isArray(scenarios) ? scenarios.map(s => ({
        ...s,
        clientSettings: Array.isArray(s.clientSettings) ? s.clientSettings : []
      })) : [];
      this.set(STORAGE_KEYS.CASH_SIMULATION_SCENARIOS, safeList);
    } catch (e) {
      console.error('Erro ao salvar cenários de simulação:', e);
    }
  }

  public getActiveCashSimulationScenario(): SavedCashSimulationScenario | null {
    const scenarios = this.getCashSimulationScenarios();
    return scenarios.find(s => s.isActive) || scenarios[0] || null;
  }

  public setActiveCashSimulationScenario(id: string | null): void {
    const scenarios = this.getCashSimulationScenarios();
    const updated = scenarios.map(s => ({
      ...s,
      isActive: s.id === id
    }));
    this.saveCashSimulationScenarios(updated);
  }

  public saveOrUpdateCashSimulationScenario(scenario: SavedCashSimulationScenario): void {
    const scenarios = this.getCashSimulationScenarios();
    const index = scenarios.findIndex(s => s.id === scenario.id);
    let updated: SavedCashSimulationScenario[];

    if (scenario.isActive) {
      scenarios.forEach(s => { s.isActive = false; });
    }

    if (index >= 0) {
      updated = [...scenarios];
      updated[index] = {
        ...scenario,
        updatedAt: new Date().toISOString()
      };
    } else {
      updated = [
        ...scenarios,
        {
          ...scenario,
          createdAt: scenario.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ];
    }
    this.saveCashSimulationScenarios(updated);
  }

  public deleteCashSimulationScenario(id: string): void {
    const scenarios = this.getCashSimulationScenarios();
    const updated = scenarios.filter(s => s.id !== id);
    // Se excluiu o ativo e ainda sobraram outros, ativa o primeiro
    if (updated.length > 0 && !updated.some(s => s.isActive)) {
      updated[0].isActive = true;
    }
    this.saveCashSimulationScenarios(updated);
  }

  // ==========================================
  // REGRAS DE CONCILIAÇÃO AUTOMÁTICA (DE-PARA)
  // ==========================================
  public getReconciliationRules(): ReconciliationRule[] {
    const stored = this.get<ReconciliationRule[]>(STORAGE_KEYS.RECONCILIATION_RULES, []);
    if (!stored || stored.length === 0) {
      this.saveReconciliationRules(INITIAL_RECONCILIATION_RULES);
      return INITIAL_RECONCILIATION_RULES;
    }
    return stored;
  }

  public saveReconciliationRules(rules: ReconciliationRule[]): void {
    this.set(STORAGE_KEYS.RECONCILIATION_RULES, rules);
  }

  public addReconciliationRule(rule: ReconciliationRule): void {
    const rules = this.getReconciliationRules();
    this.saveReconciliationRules([rule, ...rules]);
  }

  public updateReconciliationRule(id: string, updates: Partial<ReconciliationRule>): void {
    const rules = this.getReconciliationRules();
    const updated = rules.map(r => {
      if (r.id === id) {
        return {
          ...r,
          ...updates,
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });
    this.saveReconciliationRules(updated);
  }

  public toggleReconciliationRule(id: string): void {
    const rules = this.getReconciliationRules();
    const updated = rules.map(r => {
      if (r.id === id) {
        return {
          ...r,
          active: !r.active,
          updatedAt: new Date().toISOString()
        };
      }
      return r;
    });
    this.saveReconciliationRules(updated);
  }

  public deleteReconciliationRule(id: string): void {
    const rules = this.getReconciliationRules();
    this.saveReconciliationRules(rules.filter(r => r.id !== id));

    // Exclusão direta no banco de dados Supabase
    import('./supabaseSyncService').then(({ supabaseSync }) => {
      supabaseSync.deleteReconciliationRuleDirectly(id);
    }).catch(() => {});
  }

  // ==========================================
  // CONFERÊNCIA DE SALDOS BANCÁRIOS & FECHAMENTO PERFEITO
  // ==========================================
  public getBankClosingRecords(): BankBalanceClosingRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.BANK_CLOSINGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public saveBankClosingRecord(record: BankBalanceClosingRecord): void {
    const records = this.getBankClosingRecords();
    const updated = [record, ...records.filter(r => r.id !== record.id)];
    localStorage.setItem(STORAGE_KEYS.BANK_CLOSINGS, JSON.stringify(updated));
    this.notify();
  }

  public saveBankClosingRecords(records: BankBalanceClosingRecord[]): void {
    localStorage.setItem(STORAGE_KEYS.BANK_CLOSINGS, JSON.stringify(records));
    this.notify();
  }

  // ==========================================
  // CENTRAL DE AGENTES DE IA (FINANCIAL AI AGENTS)
  // ==========================================
  public getAgentDefinitions(): AgentDefinition[] {
    const list = this.get<AgentDefinition[]>(STORAGE_KEYS.AGENT_DEFINITIONS, INITIAL_AGENT_DEFINITIONS);
    if (!list || list.length === 0) {
      this.saveAgentDefinitions(INITIAL_AGENT_DEFINITIONS);
      return INITIAL_AGENT_DEFINITIONS;
    }
    return list;
  }

  public saveAgentDefinitions(defs: AgentDefinition[]): void {
    this.set(STORAGE_KEYS.AGENT_DEFINITIONS, defs);
  }

  public getAgentRuns(): AgentRunRecord[] {
    return this.get<AgentRunRecord[]>(STORAGE_KEYS.AGENT_RUNS, []);
  }

  public addAgentRun(run: AgentRunRecord): void {
    const runs = this.getAgentRuns();
    this.set(STORAGE_KEYS.AGENT_RUNS, [run, ...runs.slice(0, 99)]);
  }

  public getAgentApprovals(): AgentApprovalItem[] {
    return this.get<AgentApprovalItem[]>(STORAGE_KEYS.AGENT_APPROVALS, []);
  }

  public saveAgentApprovals(items: AgentApprovalItem[]): void {
    this.set(STORAGE_KEYS.AGENT_APPROVALS, items);
  }

  public addAgentApproval(item: AgentApprovalItem): void {
    const items = this.getAgentApprovals();
    this.saveAgentApprovals([item, ...items.filter(i => i.id !== item.id)]);
  }

  public resolveAgentApproval(id: string, status: 'APROVADO' | 'REJEITADO', notes?: string): boolean {
    const items = this.getAgentApprovals();
    const target = items.find(i => i.id === id);
    if (!target) return false;

    const currentUser = this.getCurrentUser();
    const updated = items.map(i => {
      if (i.id === id) {
        return {
          ...i,
          status,
          resolvedAt: new Date().toISOString(),
          resolvedBy: currentUser.name,
          resolutionNotes: notes
        };
      }
      return i;
    });
    this.saveAgentApprovals(updated);

    this.addAgentAuditEvent({
      id: `audit-appr-${Date.now()}`,
      timestamp: new Date().toISOString(),
      agentRole: target.agentRole,
      action: `PROPOSTA_${status}`,
      companyId: target.companyId || 'comp-1',
      details: `Ação "${target.title}" proposta pelo agente ${target.agentRole} foi ${status.toLowerCase()} por ${currentUser.name}.${notes ? ` Justificativa: ${notes}` : ''}`,
      userId: currentUser.id,
      status: status === 'APROVADO' ? 'APROVADO' : 'REJEITADO'
    });

    return true;
  }

  public getAgentAuditEvents(): AgentAuditEvent[] {
    return this.get<AgentAuditEvent[]>(STORAGE_KEYS.AGENT_AUDIT_EVENTS, []);
  }

  public addAgentAuditEvent(event: AgentAuditEvent): void {
    const events = this.getAgentAuditEvents();
    this.set(STORAGE_KEYS.AGENT_AUDIT_EVENTS, [event, ...events.slice(0, 199)]);
  }

  // ==========================================
  // SINCRONIZAÇÃO E RESTAURAÇÃO RESILIENTE NA NUVEM (SUPABASE - DATABASE FIRST)
  // ==========================================
  public async initializeDatabaseFirst(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const hasUrl = localStorage.getItem('contaju_supabase_url') || (
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
        (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : undefined)
      );
      const hasKey = localStorage.getItem('contaju_supabase_anon_key') || (
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
        (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : undefined)
      );
      if (!hasUrl || !hasKey) return false;

      const { supabaseSync } = await import('./supabaseSyncService');

      this.startCloudPull();
      try {
        const pullRes = await supabaseSync.pullAllFromSupabase();
        if (pullRes.success || (pullRes.stats?.totalRecords || 0) > 0) {
          this.isCloudHydrated = true;
          this.inMemoryCache.clear();
          this.normalizedTitlesCache = null;
          try {
            localStorage.setItem('contaju_hydrated_from_supabase', 'true');
          } catch {}
          this.notify();
          return true;
        }
      } finally {
        this.endCloudPull();
      }

      return false;
    } catch (e) {
      console.warn('[Contaju Cloud Sync] Aviso ao carregar do Supabase:', e);
      return false;
    }
  }

  public async ensureCloudSync(): Promise<void> {
    await this.initializeDatabaseFirst();
  }

  // ==========================================
  // METAS ORÇAMENTÁRIAS DE KPIS
  // ==========================================
  public getDefaultKpiTargets(year: number = new Date().getFullYear()): KpiTarget[] {
    const defaultConfigs: Array<{ kpiId: string; monthlyVal: number; annualVal?: number; isPercent?: boolean; isCount?: boolean }> = [
      { kpiId: 'faturamento_bruto', monthlyVal: 35000, annualVal: 420000 },
      { kpiId: 'resultado_liquido', monthlyVal: 10500, annualVal: 126000 },
      { kpiId: 'margem_liquida', monthlyVal: 30, annualVal: 30, isPercent: true },
      { kpiId: 'mrr', monthlyVal: 25000, annualVal: 25000 },
      { kpiId: 'clientes_ativos', monthlyVal: 10, annualVal: 12, isCount: true },
      { kpiId: 'crescimento_clientes', monthlyVal: 2, annualVal: 24, isCount: true },
      { kpiId: 'churn_clientes', monthlyVal: 0, annualVal: 1, isCount: true },
      { kpiId: 'taxa_churn', monthlyVal: 1.5, annualVal: 1.5, isPercent: true },
      { kpiId: 'ticket_medio', monthlyVal: 2500, annualVal: 2500 },
      { kpiId: 'saldo_disponivel', monthlyVal: 100000, annualVal: 100000 },
      { kpiId: 'entradas_caixa', monthlyVal: 35000, annualVal: 420000 },
      { kpiId: 'saidas_caixa', monthlyVal: 24500, annualVal: 294000 },
      { kpiId: 'saldo_liquido_caixa', monthlyVal: 10500, annualVal: 126000 },
      { kpiId: 'inadimplencia', monthlyVal: 5, annualVal: 5, isPercent: true },
      { kpiId: 'contas_receber_aberto', monthlyVal: 20000, annualVal: 20000 },
      { kpiId: 'contas_pagar_aberto', monthlyVal: 15000, annualVal: 15000 }
    ];

    return defaultConfigs.map(cfg => ({
      id: `target_${cfg.kpiId}_${year}`,
      kpiId: cfg.kpiId,
      year,
      monthlyTargets: Array.from({ length: 12 }, () => cfg.monthlyVal),
      annualTarget: cfg.annualVal !== undefined ? cfg.annualVal : cfg.monthlyVal * 12,
      updatedAt: new Date().toISOString()
    }));
  }

  public getKpiTargets(year: number = new Date().getFullYear()): KpiTarget[] {
    const stored = this.get<KpiTarget[]>(STORAGE_KEYS.KPI_TARGETS, []);
    const filtered = (stored || []).filter(t => t.year === year);
    if (filtered.length > 0) {
      const defaults = this.getDefaultKpiTargets(year);
      const existingIds = new Set(filtered.map(t => t.kpiId));
      const missing = defaults.filter(d => !existingIds.has(d.kpiId));
      return [...filtered, ...missing];
    }
    return this.getDefaultKpiTargets(year);
  }

  public saveKpiTargets(targets: KpiTarget[]): void {
    if (!Array.isArray(targets)) return;
    const existing = this.get<KpiTarget[]>(STORAGE_KEYS.KPI_TARGETS, []);
    const targetMap = new Map<string, KpiTarget>();
    existing.forEach(t => targetMap.set(`${t.kpiId}_${t.year}`, t));
    targets.forEach(t => targetMap.set(`${t.kpiId}_${t.year}`, t));
    const merged = Array.from(targetMap.values());
    this.set(STORAGE_KEYS.KPI_TARGETS, merged);
    this.notify();
  }

  public saveKpiTarget(target: KpiTarget): void {
    this.saveKpiTargets([target]);
  }
}

export const storage = new StorageService();

