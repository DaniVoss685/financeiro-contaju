import React, { useState, useRef, useMemo, useEffect, useDeferredValue } from 'react';
import { 
  CheckCheck, 
  Upload, 
  Search, 
  Sparkles, 
  AlertCircle, 
  AlertTriangle,
  CheckCircle2, 
  Link2, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Plus,
  Sliders, 
  FileText, 
  Calendar, 
  Layers, 
  ArrowRight, 
  RefreshCw, 
  Trash2, 
  Info, 
  ChevronDown, 
  ChevronUp, 
  Calculator, 
  Wand2, 
  DollarSign, 
  Check, 
  X, 
  Settings2, 
  Wallet, 
  Zap, 
  BookmarkPlus, 
  Scale, 
  Bot,
  RotateCcw,
  Undo2,
  Landmark,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  HandCoins,
  History
} from 'lucide-react';
import { BankStatementEntry, FinancialTitle, Counterparty, ReconciliationMatchResult, AiReconciliationSuggestion, BankAccount } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR, getFilteredChartAccounts, formatChartAccountSelectOptions } from '../../services/financialEngine';
import { parseOFX, parseOFXFull } from '../../utils/ofxParser';
import { calculateReconciliationSimilarity } from '../../services/reconciliationMatchingEngine';
import { normalizeForSearch, matchesSearch } from '../../utils/searchUtils';
import { SearchableSelect, SelectOption } from '../Common/SearchableSelect';
import { ReconciliationRulesModal } from './ReconciliationRulesModal';
import { ReconciliationDiagnosticsModal } from './ReconciliationDiagnosticsModal';
import { BankBalanceClosingModal } from './BankBalanceClosingModal';
import { ReconciliationFloatingModal } from './ReconciliationFloatingModal';
import { AiReconciliationModal } from './AiReconciliationModal';
import { QuickNewBankAccountModal } from './QuickNewBankAccountModal';
import { TitleSettlementHistoryModal } from './TitleSettlementHistoryModal';
import { applyReconciliationRules, learnAndCreateRuleFromTransaction } from '../../services/reconciliationRulesService';
import { BANCO_INTER_ACCOUNT, BANCO_INTER_OFX_TRANSACTIONS } from '../../data/interOfxTrainingData';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';
import { Card, PageToolbar, Button, StatCard, FieldLabel, MoreMenu } from '../Common/ui';

export const ReconciliationView: React.FC = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  // Modais de Regras De-Para, Diagnóstico de Logs, Conferência de Fechamento de Saldos, Assistente IA e Histórico de Título
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isFloatingReconcileOpen, setIsFloatingReconcileOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [rulesPresetPattern, setRulesPresetPattern] = useState<string>('');
  const [selectedHistoryTitle, setSelectedHistoryTitle] = useState<FinancialTitle | null>(null);
  const [initialPartialModeForModal, setInitialPartialModeForModal] = useState<boolean>(false);

  // Escuta alterações do storage de forma reativa
  useEffect(() => {
    return storage.subscribe(() => {
      setRefreshKey(k => k + 1);
    });
  }, []);

  const accounts = useMemo(() => {
    try {
      const data = storage.getBankAccounts();
      const list = Array.isArray(data) ? data.filter(Boolean) : [];
      if (list.length === 0) {
        storage.saveBankAccounts([BANCO_INTER_ACCOUNT]);
        return [BANCO_INTER_ACCOUNT];
      }
      return list;
    } catch (err) {
      console.error('Erro ao ler contas bancárias:', err);
      return [BANCO_INTER_ACCOUNT];
    }
  }, [refreshKey]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || BANCO_INTER_ACCOUNT.id);

  // Atualiza a conta selecionada se a lista mudar ou se a conta atual não existir mais
  useEffect(() => {
    if (accounts.length > 0 && !accounts.some(a => a.id === selectedAccountId)) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const [statementFilter, setStatementFilter] = useState<'ALL' | 'PENDENTE' | 'SUGESTAO' | 'CONCILIADO'>('PENDENTE');
  const [searchStmt, setSearchStmt] = useState('');
  const deferredSearchStmt = useDeferredValue(searchStmt);
  const [searchTitle, setSearchTitle] = useState('');
  const deferredSearchTitle = useDeferredValue(searchTitle);
  const [toleranceThreshold, setToleranceThreshold] = useState<number>(75); // % de similaridade mínima (default 75% - Forte)
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Modal de Confirmação para Conciliação em Lote
  const [batchConfirmModal, setBatchConfirmModal] = useState<{
    isOpen: boolean;
    type: 'MULTI_SELECTION' | 'ALL_SUGGESTIONS' | 'SETTLED_EXACT_MATCHES';
    title: string;
    description: string;
    stmtsCount: number;
    titlesCount: number;
    totalStmts: number;
    totalTitles: number;
    difference: number;
    onConfirm: () => void;
  } | null>(null);

  // Modal de Confirmação para Desconciliação / Estorno Seguro (Opção 2)
  const [unreconcileModal, setUnreconcileModal] = useState<{
    isOpen: boolean;
    stmt: BankStatementEntry;
    matchedTitle?: FinancialTitle | null;
  } | null>(null);

  // Active selections for two-column pairing & multi-selection
  const [selectedStmtIds, setSelectedStmtIds] = useState<string[]>([]);
  const [selectedTitleIds, setSelectedTitleIds] = useState<string[]>([]);
  const [isStmtMultiMode, setIsStmtMultiMode] = useState<boolean>(false);
  const [isTitleMultiMode, setIsTitleMultiMode] = useState<boolean>(false);

  // Filtro de títulos: 'ALL' (inclui já baixados/pagos), 'PENDING' (em aberto), 'LIQUIDADO' (já pagos)
  const [titleSettlementFilter, setTitleSettlementFilter] = useState<'ALL' | 'PENDING' | 'LIQUIDADO'>('ALL');

  // Filtro de Período / Mês dos Títulos do ERP (Padrão: Mês Atual)
  const [titleYearMonth, setTitleYearMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [titlePeriodMode, setTitlePeriodMode] = useState<'MONTH' | 'ALL'>('MONTH');

  // Controle de expansão de detalhes do score por título
  const [expandedScoreTitleId, setExpandedScoreTitleId] = useState<string | null>(null);

  // Right column tab: 'SELECT_EXISTING' | 'CREATE_NEW' | 'TRANSFER'
  const [rightColumnTab, setRightColumnTab] = useState<'SELECT_EXISTING' | 'CREATE_NEW' | 'TRANSFER'>('SELECT_EXISTING');

  // Form states for creating a new ERP title from bank statement
  const [newTitleDesc, setNewTitleDesc] = useState('');
  const [newTitleAmount, setNewTitleAmount] = useState<number>(0);
  const [newTitleType, setNewTitleType] = useState<'PAGAR' | 'RECEBER'>('PAGAR');
  const [newTitleCategory, setNewTitleCategory] = useState('');
  const [newTitleEntity, setNewTitleEntity] = useState('');
  const [newTitleDate, setNewTitleDate] = useState('');
  const [saveAsAutoRule, setSaveAsAutoRule] = useState<boolean>(true);

  // Form states for Transferência Entre Contas
  const [transferOriginAccountId, setTransferOriginAccountId] = useState('');
  const [transferDestinationAccountId, setTransferDestinationAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState<number>(0);
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transferFeeAmount, setTransferFeeAmount] = useState<number>(0);
  const [transferNotes, setTransferNotes] = useState('');
  const [transferError, setTransferError] = useState('');

  // Estados de Ajuste Financeiro da Conciliação (Valores 100% Exatos)
  const [adjPrincipal, setAdjPrincipal] = useState<number>(0);
  const [adjInterest, setAdjInterest] = useState<number>(0);
  const [adjFine, setAdjFine] = useState<number>(0);
  const [adjDiscount, setAdjDiscount] = useState<number>(0);
  const [isManualEditOpen, setIsManualEditOpen] = useState<boolean>(false);

  // Upload and parse real OFX file com leitura segura de ArrayBuffer, TextDecoder e deduplicação
  const [isImportingOfx, setIsImportingOfx] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Controles de limitação para performance fluida e sem travamentos na listagem
  const [stmtsDisplayLimit, setStmtsDisplayLimit] = useState(50);
  const [titlesDisplayLimit, setTitlesDisplayLimit] = useState(50);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedStmtIdsRef = useRef(selectedStmtIds);
  selectedStmtIdsRef.current = selectedStmtIds;
  const selectedTitleIdsRef = useRef(selectedTitleIds);
  selectedTitleIdsRef.current = selectedTitleIds;

  const statements = useMemo(() => {
    try {
      const data = storage.getStatementEntries();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch (err) {
      console.error('Erro ao ler extratos bancários:', err);
      return [];
    }
  }, [refreshKey]);

  const titles = useMemo(() => {
    try {
      const data = storage.getTitles();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch (err) {
      console.error('Erro ao ler títulos:', err);
      return [];
    }
  }, [refreshKey]);

  const chartAccounts = useMemo(() => {
    try {
      const data = storage.getChartAccounts();
      return Array.isArray(data) ? data.filter(a => a && a.isAnalytical && a.isActive) : [];
    } catch (err) {
      console.error('Erro ao ler plano de contas:', err);
      return [];
    }
  }, [refreshKey]);

  const persons = useMemo(() => {
    try {
      const data = storage.getPersons();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch (err) {
      console.error('Erro ao ler contrapartes:', err);
      return [];
    }
  }, [refreshKey]);

  // Map de contrapartes para consulta O(1) de CNPJ/CPF, razão social e nome fantasia
  const counterpartyMap = useMemo(() => {
    const map = new Map<string, Counterparty>();
    for (const p of persons) {
      if (p && p.id) {
        map.set(p.id, p);
      }
    }
    return map;
  }, [persons]);

  const currentAccount = accounts.find(a => a && a.id === selectedAccountId);

  // Correspondências 100% exatas entre lançamentos do extrato e títulos já baixados manualmente no ERP (Sugestão 1)
  const settledExactMatches = useMemo(() => {
    if (!selectedAccountId) return [];

    const unrecStmts = statements.filter(
      s => s && s.bankAccountId === selectedAccountId && s.reconciliationStatus !== 'CONCILIADO'
    );
    const liquidatedTitles = titles.filter(
      t => t && (t.settlementState === 'LIQUIDADO' || (t.balancePrincipal !== undefined && t.balancePrincipal <= 0.005 && (t.settledPrincipal || 0) > 0)) &&
           t.reconciliationStatus !== 'CONCILIADO'
    );

    const matches: Array<{ stmt: BankStatementEntry; title: FinancialTitle }> = [];
    const usedTitleIds = new Set<string>();
    const usedStmtIds = new Set<string>();

    unrecStmts.forEach(stmt => {
      if (usedStmtIds.has(stmt.id)) return;
      const stmtAbs = Math.abs(Number(stmt.amount) || 0);
      if (stmtAbs <= 0.005) return;
      const expectedType = Number(stmt.amount) < 0 ? 'PAGAR' : 'RECEBER';

      // Candidatos de mesmo tipo e valor exato no centavo
      const candidates = liquidatedTitles.filter(t => {
        if (usedTitleIds.has(t.id)) return false;
        if (t.type !== expectedType) return false;
        const tVal = Number(t.settledPrincipal || t.originalAmount) || 0;
        return Math.abs(stmtAbs - tVal) < 0.005;
      });

      if (candidates.length === 1) {
        const best = candidates[0];
        usedStmtIds.add(stmt.id);
        usedTitleIds.add(best.id);
        matches.push({ stmt, title: best });
      } else if (candidates.length > 1) {
        // Desempate por proximidade de data de quitação ou vencimento
        const stmtTime = new Date(stmt.date).getTime() || 0;
        let bestTitle = candidates[0];
        let minDiff = Infinity;
        for (const cand of candidates) {
          const candDate = cand.settledAt || cand.dueDate || cand.competencyDate;
          const diff = Math.abs(stmtTime - (new Date(candDate).getTime() || 0));
          if (diff < minDiff) {
            minDiff = diff;
            bestTitle = cand;
          }
        }
        usedStmtIds.add(stmt.id);
        usedTitleIds.add(bestTitle.id);
        matches.push({ stmt, title: bestTitle });
      }
    });

    return matches;
  }, [statements, selectedAccountId, titles]);

  // Opções formatadas e filtradas do Plano de Contas para o SearchableSelect (Despesa vs Receita)
  const chartAccountOptions = useMemo<SelectOption[]>(() => {
    return formatChartAccountSelectOptions(chartAccounts, newTitleType);
  }, [chartAccounts, newTitleType]);

  // Opções formatadas de Contrapartes / Favorecidos para o SearchableSelect
  const entityOptions = useMemo<SelectOption[]>(() => {
    return persons
      .filter(p => {
        if (!p) return false;
        if (newTitleType === 'PAGAR') {
          return p.type === 'FORNECEDOR' || p.type === 'AMBOS' || p.type === 'OUTRO';
        } else {
          return p.type === 'CLIENTE' || p.type === 'AMBOS' || p.type === 'OUTRO';
        }
      })
      .map(p => ({
        value: p.id,
        label: p.name,
        sublabel: p.document ? `Doc: ${p.document}` : (p.type === 'FORNECEDOR' ? 'Fornecedor' : p.type === 'CLIENTE' ? 'Cliente' : p.type),
        badge: p.type
      }));
  }, [persons, newTitleType]);

  // Alterna o tipo do título no formulário CREATE_NEW e limpa a categoria se não pertencer ao novo tipo
  const handleTitleTypeChange = (type: 'PAGAR' | 'RECEBER') => {
    setNewTitleType(type);
    if (newTitleCategory) {
      const validAccs = getFilteredChartAccounts(chartAccounts, type);
      if (!validAccs.some(a => a.id === newTitleCategory)) {
        setNewTitleCategory('');
      }
    }
  };

  // Helper para destacar os cards com degradê verde lateral conforme a porcentagem de correspondência
  // Requisito: Quanto maior a %, mais em destaque de verde fica o card.
  // Sempre com degradê de cores com verde pequeno começando na lateral esquerda sem atrapalhar a visualização do texto.
  const getMatchHighlightStyle = (score: number, isSelected: boolean, isStatement: boolean = false) => {
    if (isSelected) {
      return {
        borderClass: 'border-2 border-amber-500 ring-4 ring-amber-500/25 shadow-xl shadow-amber-500/15 rounded-xl z-10 transition-all scale-[1.006]',
        bgClass: isStatement 
          ? 'bg-gradient-to-r from-amber-50 via-yellow-50/60 to-amber-100/50 dark:from-slate-950 dark:via-[#0e1628] dark:to-slate-900 text-slate-950 dark:text-white' 
          : 'bg-gradient-to-r from-amber-50 via-yellow-50/60 to-amber-100/50 dark:from-slate-950 dark:via-[#1b1428] dark:to-slate-900 text-slate-950 dark:text-white'
      };
    }

    if (score >= 90) {
      return {
        borderClass: 'border border-emerald-500/40 border-l-[5px] border-l-emerald-500 rounded-xl shadow-2xs',
        bgClass: 'bg-white dark:bg-[#17171b] bg-gradient-to-r from-emerald-500/15 via-emerald-500/3 via-15% to-transparent hover:border-emerald-500/60 transition-all'
      };
    }
    if (score >= 75) {
      return {
        borderClass: 'border border-slate-200 dark:border-[#26262b] border-l-4 border-l-emerald-500 rounded-xl shadow-2xs',
        bgClass: 'bg-white dark:bg-[#17171b] bg-gradient-to-r from-emerald-500/10 via-transparent to-transparent hover:border-emerald-400/60 transition-all'
      };
    }
    if (score >= 60) {
      return {
        borderClass: 'border border-slate-200 dark:border-[#26262b] border-l-4 border-l-emerald-400 dark:border-l-emerald-500/70 rounded-xl shadow-2xs',
        bgClass: 'bg-white dark:bg-[#17171b] bg-gradient-to-r from-emerald-500/5 via-transparent to-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-all'
      };
    }
    if (score >= 40) {
      return {
        borderClass: 'border border-slate-200 dark:border-[#26262b] border-l-4 border-l-emerald-300 dark:border-l-emerald-700/60 rounded-xl shadow-2xs',
        bgClass: 'bg-white dark:bg-[#17171b] hover:border-slate-300 dark:hover:border-slate-600 transition-all'
      };
    }

    return {
      borderClass: 'border border-slate-200/90 dark:border-[#26262b] rounded-xl shadow-2xs',
      bgClass: 'bg-white dark:bg-[#17171b] hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-xs transition-all'
    };
  };

  // Helper para colorir o percentual de assertividade/compatibilidade de acordo com faixas claras de probabilidade
  const getScoreAssertivenessColor = (score: number) => {
    if (score >= 95) {
      // 95% - 100%: Verde esmeralda vivo (Alta precisão / Exata)
      return {
        badgeClass: 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/20 font-black',
        textClass: 'text-emerald-600 dark:text-emerald-400 font-black',
        dotClass: 'bg-emerald-500',
        label: 'Exata'
      };
    }
    if (score >= 80) {
      // 80% - 94%: Verde / Teal (Alta)
      return {
        badgeClass: 'bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/40 font-extrabold',
        textClass: 'text-teal-600 dark:text-teal-400 font-extrabold',
        dotClass: 'bg-teal-500',
        label: 'Alta'
      };
    }
    if (score >= 60) {
      // 60% - 79%: Amarelo / Âmbar (Média)
      return {
        badgeClass: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 font-bold',
        textClass: 'text-amber-600 dark:text-amber-400 font-bold',
        dotClass: 'bg-amber-500',
        label: 'Média'
      };
    }
    if (score >= 40) {
      // 40% - 59%: Laranja (Baixa)
      return {
        badgeClass: 'bg-orange-500/15 text-orange-800 dark:text-orange-300 border-orange-500/40 font-semibold',
        textClass: 'text-orange-600 dark:text-orange-400 font-semibold',
        dotClass: 'bg-orange-500',
        label: 'Baixa'
      };
    }
    // < 40%: Cinza (Mínima)
    return {
      badgeClass: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/30 font-medium',
      textClass: 'text-slate-500 dark:text-slate-400 font-medium',
      dotClass: 'bg-slate-400',
      label: 'Mínima'
    };
  };

  // Filtered bank statements for the selected account
  const accountStatements = useMemo(() => {
    return statements.filter(s => s && s.bankAccountId === selectedAccountId);
  }, [statements, selectedAccountId]);

  const filteredStatements = useMemo(() => {
    return accountStatements.filter(s => {
      if (!s) return false;
      if (statementFilter !== 'ALL' && s.reconciliationStatus !== statementFilter) return false;
      if (deferredSearchStmt) {
        const q = normalizeForSearch(deferredSearchStmt);
        const match = normalizeForSearch(s.description || '').includes(q) || 
                      normalizeForSearch(s.fitId || '').includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [accountStatements, statementFilter, deferredSearchStmt]);

  const selectedStmtId = selectedStmtIds[0] || null;
  const selectedTitleId = selectedTitleIds[0] || null;
  const selectedStmt = statements.find(s => s && s.id === selectedStmtId);
  const selectedTitle = titles.find(t => t && t.id === selectedTitleId);

  const selectedStmts = useMemo(() => {
    return statements.filter(s => s && selectedStmtIds.includes(s.id));
  }, [statements, selectedStmtIds]);

  const selectedTitles = useMemo(() => {
    return titles.filter(t => t && selectedTitleIds.includes(t.id));
  }, [titles, selectedTitleIds]);

  const totalStmtsAmount = useMemo(() => {
    return Math.round(selectedStmts.reduce((sum, s) => sum + Math.abs(Number(s.amount) || 0), 0) * 100) / 100;
  }, [selectedStmts]);

  const totalTitlesAmount = useMemo(() => {
    return Math.round(selectedTitles.reduce((sum, t) => {
      const val = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
      return sum + (Number(val) || 0);
    }, 0) * 100) / 100;
  }, [selectedTitles]);

  const isMultiSelection = selectedStmtIds.length > 1 || selectedTitleIds.length > 1;
  const multiDifference = Math.round((totalStmtsAmount - totalTitlesAmount) * 100) / 100;
  const isMultiExact = Math.abs(multiDifference) < 0.005;

  // Pré-visualização Automática do Impacto no Fluxo de Caixa / Saldo Bancário (Sugestão 1)
  const bankAccountImpact = useMemo(() => {
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account) return null;

    const currentBalance = account.currentBalance ?? 0;
    
    // Impacto líquido no caixa
    let netDelta = 0;
    if (isMultiSelection) {
      netDelta = selectedStmts.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    } else if (selectedStmt) {
      netDelta = Number(selectedStmt.amount) || 0;
    } else if (selectedTitle) {
      netDelta = selectedTitle.type === 'RECEBER' 
        ? (selectedTitle.balancePrincipal > 0 ? selectedTitle.balancePrincipal : selectedTitle.originalAmount)
        : -(selectedTitle.balancePrincipal > 0 ? selectedTitle.balancePrincipal : selectedTitle.originalAmount);
    }

    const isAlreadySettled = !isMultiSelection && selectedTitle?.settlementState === 'LIQUIDADO';
    const effectiveImpact = isAlreadySettled ? 0 : netDelta;
    const projectedBalance = currentBalance + effectiveImpact;

    return {
      accountName: account.name,
      bankName: account.bankName || 'Banco',
      currentBalance,
      effectiveImpact,
      projectedBalance,
      isAlreadySettled
    };
  }, [accounts, selectedAccountId, isMultiSelection, selectedStmts, selectedStmt, selectedTitle]);

  // Toggle de extrato (suporta seleção múltipla)
  const handleToggleStatement = (stmt: BankStatementEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!stmt) return;

    setSelectedStmtIds(prev => {
      const exists = prev.includes(stmt.id);
      if (exists) {
        return prev.filter(id => id !== stmt.id);
      } else {
        const stmtAmount = Number(stmt.amount) || 0;
        const isDebit = stmtAmount < 0;
        const requiredType = isDebit ? 'PAGAR' : 'RECEBER';

        setNewTitleDesc(stmt.description || '');
        setNewTitleAmount(Math.abs(stmtAmount));
        setNewTitleType(requiredType);
        setNewTitleDate(stmt.date || new Date().toISOString().split('T')[0]);
        fillTransferDataFromStatement(stmt);

        // Se tiver sugestão ou vínculo, auto-seleciona o título
        if (stmt.suggestedTitleId) {
          setSelectedTitleIds(tPrev => tPrev.includes(stmt.suggestedTitleId!) ? tPrev : [...tPrev, stmt.suggestedTitleId!]);
          setRightColumnTab('SELECT_EXISTING');
        } else if (stmt.matchedTitleId) {
          setSelectedTitleIds(tPrev => tPrev.includes(stmt.matchedTitleId!) ? tPrev : [...tPrev, stmt.matchedTitleId!]);
          setRightColumnTab('SELECT_EXISTING');
        }

        return [...prev, stmt.id];
      }
    });
  };

  const handleSelectStatement = (stmt: BankStatementEntry) => {
    if (!stmt) return;
    const stmtAmount = Number(stmt.amount) || 0;
    const isDebit = stmtAmount < 0;
    const requiredType = isDebit ? 'PAGAR' : 'RECEBER';

    setNewTitleDesc(stmt.description || '');
    setNewTitleAmount(Math.abs(stmtAmount));
    setNewTitleType(requiredType);
    setNewTitleDate(stmt.date || new Date().toISOString().split('T')[0]);
    fillTransferDataFromStatement(stmt);

    setSelectedStmtIds([stmt.id]);

    // Se tiver sugestão ou vínculo, auto-seleciona o título correspondente
    if (stmt.suggestedTitleId) {
      setSelectedTitleIds([stmt.suggestedTitleId]);
      setRightColumnTab('SELECT_EXISTING');
    } else if (stmt.matchedTitleId) {
      setSelectedTitleIds([stmt.matchedTitleId]);
      setRightColumnTab('SELECT_EXISTING');
    }
  };

  // Preenche dados da transferência a partir de um lançamento de extrato selecionado
  const fillTransferDataFromStatement = (stmt: BankStatementEntry) => {
    const absAmt = Math.abs(Number(stmt.amount) || 0);
    setTransferAmount(absAmt);
    const today = new Date().toISOString().split('T')[0];
    setTransferDate(stmt.date > today ? today : stmt.date);
    setTransferNotes(`Transferência entre contas: ${stmt.description}`);
    const activeAccs = accounts.filter(a => a.status === 'ATIVO');
    const myAccId = stmt.bankAccountId || selectedAccountId;
    if (stmt.amount < 0) {
      // Saída: a conta do extrato é a de Origem
      setTransferOriginAccountId(myAccId);
      const other = activeAccs.find(a => a.id !== myAccId);
      if (other) setTransferDestinationAccountId(other.id);
    } else {
      // Entrada: a conta do extrato é a de Destino
      setTransferDestinationAccountId(myAccId);
      const other = activeAccs.find(a => a.id !== myAccId);
      if (other) setTransferOriginAccountId(other.id);
    }
  };

  // Navegação de mês/período para a coluna de títulos do ERP
  const handlePrevTitleMonth = () => {
    setTitlePeriodMode('MONTH');
    const [year, month] = titleYearMonth.split('-').map(Number);
    const d = new Date(year, month - 2, 1);
    setTitleYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextTitleMonth = () => {
    setTitlePeriodMode('MONTH');
    const [year, month] = titleYearMonth.split('-').map(Number);
    const d = new Date(year, month, 1);
    setTitleYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleCurrentTitleMonth = () => {
    setTitlePeriodMode('MONTH');
    const now = new Date();
    setTitleYearMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  };

  const formatTitleMonthYearLabel = (ym: string) => {
    try {
      const [year, month] = ym.split('-').map(Number);
      const date = new Date(year, month - 1, 1);
      const monthName = date.toLocaleDateString('pt-BR', { month: 'long' });
      return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
    } catch {
      return ym;
    }
  };

  // Registra e concilia uma transferência entre contas bancárias
  const handleCreateTransferAndReconcile = (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError('');

    const origin = transferOriginAccountId;
    const destination = transferDestinationAccountId;

    if (!origin || !destination) {
      setTransferError('Selecione a conta bancária de origem e a de destino.');
      return;
    }

    if (origin === destination) {
      setTransferError('A conta de origem e a de destino não podem ser iguais.');
      return;
    }

    if (transferAmount <= 0) {
      setTransferError('O valor da transferência deve ser maior que zero.');
      return;
    }

    const res = FinancialEngine.postTransfer({
      originAccountId: origin,
      destinationAccountId: destination,
      amount: Number(transferAmount),
      date: transferDate,
      feeAmount: Number(transferFeeAmount) || 0,
      notes: transferNotes || `Transferência entre contas conciliada (${selectedStmt?.description || ''})`
    });

    if (!res.success) {
      setTransferError(res.message);
      return;
    }

    // Se houver lançamento de extrato ativo sendo conciliado:
    if (selectedStmt) {
      const allStmts = storage.getStatementEntries();
      const updatedStmts = allStmts.map(s => {
        if (s.id === selectedStmt.id) {
          return {
            ...s,
            reconciliationStatus: 'CONCILIADO' as const,
            reconciliationNote: `Conciliado via Transferência entre contas (${origin === currentAccount?.id ? 'Saída' : 'Entrada'})`
          };
        }
        // Se na outra conta bancária houver extrato correspondente não conciliado com mesmo valor e data próxima, concilia também
        const otherAccountId = origin === currentAccount?.id ? destination : origin;
        if (
          s.bankAccountId === otherAccountId &&
          s.reconciliationStatus === 'PENDENTE' &&
          Math.abs(Math.abs(Number(s.amount)) - Number(transferAmount)) < 0.005 &&
          ((selectedStmt.amount < 0 && Number(s.amount) > 0) || (selectedStmt.amount > 0 && Number(s.amount) < 0))
        ) {
          return {
            ...s,
            reconciliationStatus: 'CONCILIADO' as const,
            reconciliationNote: 'Conciliado automaticamente via contraparte de transferência'
          };
        }
        return s;
      });
      storage.saveStatementEntries(updatedStmts);
    }

    // Auditoria
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CONCILIACAO_TRANSFERENCIA_BANCARIA',
      module: 'Conciliação Bancária',
      recordId: selectedStmt?.id || 'TRANSFERENCIA',
      details: `Transferência de ${formatBRL(transferAmount)} entre contas ${origin} -> ${destination} registrada e conciliada.`
    });

    setSuccessMsg(`Transferência de ${formatBRL(transferAmount)} registrada e conciliada com sucesso!`);
    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setRightColumnTab('SELECT_EXISTING');
    setRefreshKey(k => k + 1);
  };

  // Toggle de título (suporta seleção múltipla)
  const handleToggleTitle = (titleId: string, e?: React.MouseEvent | React.ChangeEvent<HTMLInputElement>) => {
    if (e && 'stopPropagation' in e) e.stopPropagation();
    setSelectedTitleIds(prev => {
      if (prev.includes(titleId)) {
        return prev.filter(id => id !== titleId);
      } else {
        return [...prev, titleId];
      }
    });
  };

  const handleSelectTitle = (titleId: string) => {
    setSelectedTitleIds([titleId]);
  };

  // Clique ergonômico no card de extrato: se o modo multi estiver ativo ou se o usuário estiver compondo lote, faz toggle
  const handleCardClickStatement = (stmt: BankStatementEntry, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).closest('button')) {
      return;
    }
    if (isStmtMultiMode || e.shiftKey || e.ctrlKey || e.metaKey || selectedStmtIds.length > 1) {
      handleToggleStatement(stmt, e);
    } else {
      if (selectedStmtIds.length === 1 && selectedStmtIds[0] === stmt.id) {
        setSelectedStmtIds([]);
      } else {
        handleSelectStatement(stmt);
      }
    }
  };

  // Clique ergonômico no card de título: se o modo multi estiver ativo ou se o usuário estiver compondo lote, faz toggle
  const handleCardClickTitle = (titleId: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).closest('button')) {
      return;
    }
    if (isTitleMultiMode || e.shiftKey || e.ctrlKey || e.metaKey || selectedTitleIds.length > 1) {
      handleToggleTitle(titleId, e);
    } else {
      if (selectedTitleIds.length === 1 && selectedTitleIds[0] === titleId) {
        setSelectedTitleIds([]);
      } else {
        handleSelectTitle(titleId);
      }
    }
  };

  // Abre a Janela Flutuante de Conciliação Bancária
  const handleOpenReconcileModal = (stmt?: BankStatementEntry, title?: FinancialTitle, initialPartial?: boolean) => {
    setErrorMsg('');
    setInitialPartialModeForModal(Boolean(initialPartial));
    if (stmt) {
      handleSelectStatement(stmt);
      if (!title) {
        if (stmt.suggestedTitleId) {
          const sug = titles.find(t => t.id === stmt.suggestedTitleId);
          if (sug) setSelectedTitleIds([sug.id]);
        } else if (stmt.matchedTitleId) {
          const mat = titles.find(t => t.id === stmt.matchedTitleId);
          if (mat) setSelectedTitleIds([mat.id]);
        }
      }
    }
    if (title) {
      setSelectedTitleIds([title.id]);
    }
    setIsFloatingReconcileOpen(true);
  };

  // Executa motor de conciliação por similaridade para preencher sugestões em lote
  const handleRunAutoMatch = () => {
    const allStatements = storage.getStatementEntries();
    let suggestionsCount = 0;

    const updated = allStatements.map(stmt => {
      if (stmt.bankAccountId !== selectedAccountId) return stmt;
      if (stmt.reconciliationStatus === 'CONCILIADO') return stmt;

      // Filter titles for the target type
      const targetType = stmt.amount < 0 ? 'PAGAR' : 'RECEBER';
      const candidateTitles = titles.filter(t => t.type === targetType && t.settlementState !== 'LIQUIDADO');

      let bestScore = 0;
      let bestTitleId: string | null = null;
      let bestConfidence = '';

      for (const t of candidateTitles) {
        const cp = counterpartyMap.get(t.counterpartyId);
        const matchResult = calculateReconciliationSimilarity(stmt, t, cp);
        if (matchResult.score > bestScore) {
          bestScore = matchResult.score;
          bestTitleId = t.id;
          bestConfidence = matchResult.confidence;
        }
      }

      if (bestScore >= toleranceThreshold && bestTitleId) {
        suggestionsCount++;
        return {
          ...stmt,
          reconciliationStatus: 'SUGESTAO' as const,
          suggestedTitleId: bestTitleId,
          ruleApplied: `SIMILARIDADE_${bestScore}% (${bestConfidence})`
        };
      }

      return stmt;
    });

    storage.saveStatementEntries(updated);
    setSuccessMsg(`Processamento concluído: ${suggestionsCount} sugestões identificadas com similaridade ≥ ${toleranceThreshold}%.`);
    setRefreshKey(k => k + 1);
  };

  // Executa regras De-Para de conciliação automática configuradas pelo usuário
  const handleRunRules = () => {
    setErrorMsg('');
    try {
      const currentUser = storage.getCurrentUser();
      const res = applyReconciliationRules(selectedAccountId, currentUser);
      const totalRulesApplied = res.reconciledCount + res.suggestedCount;
      if (totalRulesApplied > 0) {
        setSuccessMsg(`Sucesso! ${res.reconciledCount} lançamento(s) foram conciliados automaticamente e ${res.suggestedCount} vinculados como sugestão pelas Regras De-Para!`);
      } else {
        setSuccessMsg(`Execução de Regras: nenhum lançamento pendente atendeu aos critérios das regras ativas para esta conta.`);
      }
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setErrorMsg(`Erro ao executar regras: ${err.message || 'Falha ao processar regras'}`);
    }
  };

  // Sincroniza os valores de ajuste quando o par de seleção muda
  useEffect(() => {
    if (selectedStmt && selectedTitle) {
      const p = selectedTitle.balancePrincipal > 0 ? selectedTitle.balancePrincipal : selectedTitle.originalAmount;
      setAdjPrincipal(p);
      setAdjInterest(0);
      setAdjFine(0);
      setAdjDiscount(0);
      
      const stmtAbs = Math.round(Math.abs(selectedStmt.amount) * 100) / 100;
      const isExact = Math.abs(stmtAbs - p) < 0.005;
      // Se já houver divergência, abre o painel de ajuste para que o usuário possa conciliar com ajuste ou pagamento parcial
      setIsManualEditOpen(!isExact);
    } else {
      setIsManualEditOpen(false);
    }
  }, [selectedStmtId, selectedTitleId]);

  const stmtAbsAmount = selectedStmt ? Math.round(Math.abs(selectedStmt.amount) * 100) / 100 : 0;
  const currentTitleBalance = selectedTitle ? (selectedTitle.balancePrincipal > 0 ? selectedTitle.balancePrincipal : selectedTitle.originalAmount) : 0;
  
  // Total liquidado considerando Principal + Juros + Multa - Desconto
  const totalSettledCalculated = Math.round((adjPrincipal + adjInterest + adjFine - adjDiscount) * 100) / 100;
  
  // Diferença em relação ao extrato bancário
  const differenceToStatement = Math.round((totalSettledCalculated - stmtAbsAmount) * 100) / 100;
  
  // É 100% exato?
  const isValues100PercentExact = Boolean(selectedStmt && selectedTitle && Math.abs(differenceToStatement) < 0.005);

  // Ações de Ajuste Rápido
  const handleApplyDiffAsInterest = () => {
    if (!selectedStmt || !selectedTitle) return;
    const p = currentTitleBalance;
    setAdjPrincipal(p);
    setAdjInterest(Math.max(0, Math.round((stmtAbsAmount - p) * 100) / 100));
    setAdjFine(0);
    setAdjDiscount(0);
  };

  const handleApplyDiffAsFine = () => {
    if (!selectedStmt || !selectedTitle) return;
    const p = currentTitleBalance;
    setAdjPrincipal(p);
    setAdjInterest(0);
    setAdjFine(Math.max(0, Math.round((stmtAbsAmount - p) * 100) / 100));
    setAdjDiscount(0);
  };

  const handleApplyDiffAsDiscount = () => {
    if (!selectedStmt || !selectedTitle) return;
    const p = currentTitleBalance;
    setAdjPrincipal(p);
    setAdjInterest(0);
    setAdjFine(0);
    setAdjDiscount(Math.max(0, Math.round((p - stmtAbsAmount) * 100) / 100));
  };

  // Opção 1: Atalho de Auto-Conciliação Expressa com 1 Clique (Score 100% Exato)
  const handleDirectExpressReconcile = (stmt: BankStatementEntry, title: FinancialTitle) => {
    if (!stmt || !title) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const stmtAbs = Math.round(Math.abs(Number(stmt.amount) || 0) * 100) / 100;
      const titleBal = title.balancePrincipal > 0 ? title.balancePrincipal : title.originalAmount;
      
      let p = titleBal;
      let interest = 0;
      let fine = 0;
      let discount = 0;

      // Se este for o par selecionado e o usuário já ajustou nos campos de conciliação
      if (selectedStmt?.id === stmt.id && selectedTitle?.id === title.id) {
        p = adjPrincipal;
        interest = adjInterest;
        fine = adjFine;
        discount = adjDiscount;
        const total = Math.round((p + interest + fine - discount) * 100) / 100;
        if (Math.abs(total - stmtAbs) >= 0.005) {
          handleOpenReconcileModal(stmt, title);
          setErrorMsg(`Valores divergentes: a composição contábil (${formatBRL(total)}) difere do extrato (${formatBRL(stmtAbs)}). Confira e defina se a diferença é Pagamento Parcial, Tarifa Bancária ou Desconto no modal antes de conciliar.`);
          return;
        }
      } else {
        const diff = Math.round((stmtAbs - titleBal) * 100) / 100;
        if (Math.abs(diff) >= 0.005) {
          // Bloqueia conciliação cega com divergência de valores: abre o modal para conferência
          handleOpenReconcileModal(stmt, title);
          setErrorMsg(`Valores divergentes: o extrato (${formatBRL(stmtAbs)}) difere do saldo do título (${formatBRL(titleBal)}). Selecione Pagamento Parcial ou informe Desconto/Acréscimo no modal.`);
          return;
        }
        p = titleBal;
      }

      // Se o título já estiver liquidado, apenas vincula
      if (title.settlementState === 'LIQUIDADO' || title.balancePrincipal <= 0.005) {
        const allStmts = storage.getStatementEntries();
        const updatedStmts = allStmts.map(s => s.id === stmt.id ? {
          ...s,
          reconciliationStatus: 'CONCILIADO' as const,
          matchedTitleId: title.id
        } : s);
        storage.saveStatementEntries(updatedStmts);

        const allTitles = storage.getTitles();
        const updatedTitles = allTitles.map(t => t.id === title.id ? {
          ...t,
          reconciliationStatus: 'CONCILIADO' as const,
          updatedAt: new Date().toISOString()
        } : t);
        storage.saveTitles(updatedTitles);
      } else {
        // Título em aberto -> dar baixa contábil segura via FinancialEngine
        const safeEffectiveDate = stmt.date > today ? today : stmt.date;
        const safeBankAccountId = stmt.bankAccountId || selectedAccountId;

        const res = FinancialEngine.postSettlement({
          titleId: title.id,
          settlementDate: safeEffectiveDate,
          bankAccountId: safeBankAccountId,
          principalSettled: p,
          discount,
          interest,
          fine,
          bankFee: 0,
          notes: `Baixa via Conciliação Expressa 1-Clique (${stmt.description})${
            interest > 0 || fine > 0 || discount > 0 ? ` [Ajuste: Juros ${formatBRL(interest)}, Multa ${formatBRL(fine)}, Desc ${formatBRL(discount)}]` : ''
          }`,
          voucherRef: stmt.fitId
        });

        if (!res.success) {
          setErrorMsg(`Erro ao liquidar título: ${res.message}`);
          return;
        }

        // Atualiza status contábil e de conciliação do título
        const allTitles = storage.getTitles();
        const updatedTitles = allTitles.map(t => {
          if (t.id === title.id) {
            const isFullySettled = t.balancePrincipal <= 0.005;
            return {
              ...t,
              reconciliationStatus: isFullySettled ? ('CONCILIADO' as const) : ('PENDENTE' as const),
              updatedAt: new Date().toISOString()
            };
          }
          return t;
        });
        storage.saveTitles(updatedTitles);

        // Marca extrato como CONCILIADO
        const allStmts = storage.getStatementEntries();
        const updatedStmts = allStmts.map(s => s.id === stmt.id ? {
          ...s,
          reconciliationStatus: 'CONCILIADO' as const,
          matchedTitleId: title.id,
          matchedMovementId: res.settlement?.id
        } : s);
        storage.saveStatementEntries(updatedStmts);
      }

      // Auditoria
      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CONCILIACAO_EXPRESSA_1_CLIQUE',
        module: 'Conciliação Bancária',
        recordId: stmt.id,
        details: `⚡ Conciliação Expressa 1-Clique: Extrato "${stmt.description}" (${formatBRL(stmt.amount)}) cruzado e liquidado com título ${title.titleNumber}.`
      });

      setSuccessMsg(`⚡ Sucesso! Lançamento "${stmt.description}" conciliado com o título ${title.titleNumber} via Conciliação Expressa.`);
      setSelectedStmtIds([]);
      setSelectedTitleIds([]);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setErrorMsg(`Erro na conciliação expressa: ${err.message || 'Falha ao conciliar'}`);
    }
  };

  // Opção 2: Desconciliação / Estorno Seguro (Undo/Rollback)
  const handleUnreconcileConfirm = () => {
    if (!unreconcileModal || !unreconcileModal.stmt) return;
    const stmt = unreconcileModal.stmt;
    try {
      let revertedTitleNumber = '';
      if (stmt.matchedTitleId) {
        const currentTitles = storage.getTitles();
        const matchedTitle = currentTitles.find(t => t.id === stmt.matchedTitleId);
        if (matchedTitle) {
          revertedTitleNumber = matchedTitle.titleNumber;
          // Se o título foi liquidado/baixado, reabre o título restaurando o saldo contábil
          if (matchedTitle.settlementState === 'LIQUIDADO' || matchedTitle.settledPrincipal > 0) {
            FinancialEngine.reopenTitleToOpen(matchedTitle.id, `Desconciliação bancária do extrato "${stmt.description}"`);
          } else {
            // Se o título já era aberto ou apenas vinculado, desmarca reconciliationStatus
            const updated = currentTitles.map(t => t.id === matchedTitle.id ? {
              ...t,
              reconciliationStatus: 'PENDENTE' as const,
              updatedAt: new Date().toISOString()
            } : t);
            storage.saveTitles(updated);
          }
        }
      }

      // Atualiza o extrato para PENDENTE e desvincula IDs
      const allStmts = storage.getStatementEntries();
      const updatedStmts = allStmts.map(s => s.id === stmt.id ? {
        ...s,
        reconciliationStatus: 'PENDENTE' as const,
        matchedTitleId: undefined,
        matchedMovementId: undefined
      } : s);
      storage.saveStatementEntries(updatedStmts);

      // Auditoria
      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'DESCONCILIACAO_ESTORNO',
        module: 'Conciliação Bancária',
        recordId: stmt.id,
        details: `Desconciliação realizada: Extrato "${stmt.description}" (${formatBRL(stmt.amount)}) desvinculado${revertedTitleNumber ? ` do título ${revertedTitleNumber}` : ''}.`
      });

      setSuccessMsg(`✓ Sucesso! Lançamento "${stmt.description}" foi desconciliado${revertedTitleNumber ? ` e o título ${revertedTitleNumber} foi reaberto no financeiro` : ''}.`);
      setUnreconcileModal(null);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setErrorMsg(`Erro ao desconciliar: ${err.message || 'Falha na operação'}`);
      setUnreconcileModal(null);
    }
  };

  // Executa a conciliação em lote confirmada para múltiplos extratos e/ou múltiplos títulos
  // Executa a conciliação em lote confirmada para múltiplos extratos e/ou múltiplos títulos
  const executeMultiBatchReconcile = () => {
    const today = new Date().toISOString().split('T')[0];
    let settledCount = 0;
    let alreadySettledCount = 0;
    const errors: string[] = [];
    const successfullySettledTitleIds: string[] = [];

    const isOneStmtToMultipleTitles = selectedStmts.length === 1 && selectedTitles.length > 1;
    const isMultipleStmtsToOneTitle = selectedStmts.length > 1 && selectedTitles.length === 1;

    // Realiza a baixa contábil no ERP para cada título pendente
    if (isMultipleStmtsToOneTitle) {
      // Caso Nx1: Vários pagamentos de extrato quitando 1 despesa
      const targetTitle = selectedTitles[0];
      if (targetTitle.settlementState === 'LIQUIDADO') {
        alreadySettledCount++;
        successfullySettledTitleIds.push(targetTitle.id);
      } else {
        const titleBalance = targetTitle.balancePrincipal > 0 ? targetTitle.balancePrincipal : targetTitle.originalAmount;
        const rawDate = selectedStmts[0]?.date || today;
        const effectiveDate = rawDate > today ? today : rawDate;
        
        // Baixa o valor total dos extratos (respeitando o saldo do título)
        const principalToSettle = Math.min(titleBalance, totalStmtsAmount);
        const diffSurplus = Math.max(0, Math.round((totalStmtsAmount - titleBalance) * 100) / 100);

        const res = FinancialEngine.postSettlement({
          titleId: targetTitle.id,
          settlementDate: effectiveDate,
          bankAccountId: selectedStmts[0]?.bankAccountId || selectedAccountId,
          principalSettled: principalToSettle,
          discount: 0,
          interest: diffSurplus,
          fine: 0,
          bankFee: 0,
          notes: `Baixa via conciliação de ${selectedStmts.length} extratos: ${selectedStmts.map(s => `${s.description} (${formatBRL(s.amount)})`).join(' + ')}`,
          voucherRef: selectedStmts.map(s => s.fitId).filter(Boolean).slice(0, 3).join(';')
        });

        if (res.success) {
          settledCount++;
          successfullySettledTitleIds.push(targetTitle.id);
        } else {
          errors.push(`${targetTitle.titleNumber}: ${res.message}`);
        }
      }
    } else {
      // Casos 1xN ou NxM: Baixa individual para cada título
      selectedTitles.forEach(t => {
        if (t.settlementState === 'LIQUIDADO') {
          alreadySettledCount++;
          successfullySettledTitleIds.push(t.id);
        } else {
          const p = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
          const rawDate = selectedStmts[0]?.date || today;
          const effectiveDate = rawDate > today ? today : rawDate;

          const res = FinancialEngine.postSettlement({
            titleId: t.id,
            settlementDate: effectiveDate,
            bankAccountId: selectedStmts[0]?.bankAccountId || selectedAccountId,
            principalSettled: p,
            discount: 0,
            interest: 0,
            fine: 0,
            bankFee: 0,
            notes: isOneStmtToMultipleTitles
              ? `Baixa via Conciliação do Extrato "${selectedStmts[0]?.description}" (${formatBRL(selectedStmts[0]?.amount)})`
              : `Baixa via Conciliação em Lote (${selectedStmts.map(s => s.description).slice(0, 2).join(', ')})`,
            voucherRef: selectedStmts.map(s => s.fitId).filter(Boolean).slice(0, 3).join(';')
          });

          if (res.success) {
            settledCount++;
            successfullySettledTitleIds.push(t.id);
          } else {
            errors.push(`${t.titleNumber}: ${res.message}`);
          }
        }
      });
    }

    // Atualiza os títulos no storage marcando reconciliationStatus: 'CONCILIADO'
    const currentTitles = storage.getTitles();
    const updatedTitles = currentTitles.map(t => {
      if (selectedTitleIds.includes(t.id) && successfullySettledTitleIds.includes(t.id)) {
        return {
          ...t,
          reconciliationStatus: 'CONCILIADO' as const,
          reconciliationNote: isOneStmtToMultipleTitles
            ? `Conciliado com extrato "${selectedStmts[0]?.description}" (${formatBRL(selectedStmts[0]?.amount)})`
            : `Conciliado em lote com ${selectedStmts.length} extratos`,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    storage.saveTitles(updatedTitles);

    // Marca todos os extratos selecionados como conciliados e vincula inteligentemente
    const allStmts = storage.getStatementEntries();
    const updatedStmts = allStmts.map(s => {
      if (selectedStmtIds.includes(s.id)) {
        let matchedId = selectedTitles[0]?.id;
        if (s.suggestedTitleId && selectedTitleIds.includes(s.suggestedTitleId)) {
          matchedId = s.suggestedTitleId;
        } else {
          const matchByAmount = selectedTitles.find(t => Math.abs(Math.abs(s.amount) - (t.balancePrincipal || t.originalAmount)) < 0.01);
          if (matchByAmount) matchedId = matchByAmount.id;
        }
        return {
          ...s,
          reconciliationStatus: 'CONCILIADO' as const,
          matchedTitleId: matchedId,
          reconciliationNote: isOneStmtToMultipleTitles
            ? `Conciliado com ${selectedTitles.length} títulos: ${selectedTitles.map(t => t.titleNumber).join(', ')}`
            : isMultipleStmtsToOneTitle
              ? `Conciliado com o título #${selectedTitles[0]?.titleNumber}`
              : `Conciliado em lote com ${selectedTitles.length} títulos`
        };
      }
      return s;
    });
    storage.saveStatementEntries(updatedStmts);

    // Salva auditoria completa
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CONCILIACAO_LOTE',
      module: 'Conciliação Bancária',
      recordId: selectedStmtIds.join(','),
      details: isOneStmtToMultipleTitles
        ? `Conciliação 1xN: 1 extrato "${selectedStmts[0]?.description}" [${formatBRL(totalStmtsAmount)}] liquidou ${selectedTitles.length} despesas/receitas [${formatBRL(totalTitlesAmount)}].`
        : isMultipleStmtsToOneTitle
          ? `Conciliação Nx1: ${selectedStmts.length} extratos [${formatBRL(totalStmtsAmount)}] liquidaram a despesa #${selectedTitles[0]?.titleNumber} [${formatBRL(totalTitlesAmount)}].`
          : `Conciliação em Lote: ${selectedStmts.length} extrato(s) [${formatBRL(totalStmtsAmount)}] cruzados com ${selectedTitles.length} título(s) [${formatBRL(totalTitlesAmount)}].`
    });

    if (errors.length > 0) {
      setErrorMsg(`Avisos ao conciliar em lote: ${errors.join('; ')}`);
    }

    if (isOneStmtToMultipleTitles) {
      setSuccessMsg(`✓ Sucesso! O pagamento do extrato de ${formatBRL(totalStmtsAmount)} foi conciliado com sucesso e liquidou ${selectedTitles.length} despesas/receitas no ERP!`);
    } else if (isMultipleStmtsToOneTitle) {
      setSuccessMsg(`✓ Sucesso! ${selectedStmts.length} pagamentos do extrato totalizando ${formatBRL(totalStmtsAmount)} foram conciliados com a despesa #${selectedTitles[0].titleNumber}!`);
    } else {
      setSuccessMsg(`✓ Conciliação em lote concluída com sucesso! ${selectedStmts.length} extrato(s) vinculados a ${selectedTitles.length} título(s) (${settledCount} baixados no ERP).`);
    }

    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setRefreshKey(k => k + 1);
  };

  // Marca um título como conciliado via banco diretamente
  const handleMarkTitleAsReconciled = (title: FinancialTitle) => {
    const allTitles = storage.getTitles().map(t => {
      if (t.id === title.id) {
        return {
          ...t,
          reconciliationStatus: 'CONCILIADO' as const,
          reconciledViaBank: true,
          reconciledAt: new Date().toISOString(),
          reconciliationNote: 'Marcado como conciliado via banco',
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    storage.saveTitles(allTitles);
    setSuccessMsg(`✓ Título #${title.titleNumber} marcado como conciliado via banco!`);
    setRefreshKey(k => k + 1);
  };

  // Desmarca a conciliação bancária de um título
  const handleUnmarkTitleReconciled = (title: FinancialTitle) => {
    const allTitles = storage.getTitles().map(t => {
      if (t.id === title.id) {
        return {
          ...t,
          reconciliationStatus: 'PENDENTE' as const,
          reconciledViaBank: false,
          reconciledAt: undefined,
          reconciliationNote: undefined,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    storage.saveTitles(allTitles);
    setSuccessMsg(`Título #${title.titleNumber} desmarcado de conciliado.`);
    setRefreshKey(k => k + 1);
  };

  // Inicia a conciliação: se 100% exato executa; se houver diferença, abre a janela de conciliação para Pagamento Parcial ou Ajuste de Valores
  const handleInitiateReconciliation = () => {
    if (selectedStmts.length === 0 || selectedTitles.length === 0) return;

    // 1. Caso especial fundamental: se todos os títulos selecionados já estiverem baixados/liquidados previamente,
    // vincula exclusivamente para registro de auditoria e conciliação bancária SEM duplicar lançamentos no caixa!
    const allSelectedTitlesAlreadyLiquidated = selectedTitles.every(t => t.settlementState === 'LIQUIDADO' || (t.balancePrincipal !== undefined && t.balancePrincipal <= 0.005));
    if (allSelectedTitlesAlreadyLiquidated) {
      const allStmts = storage.getStatementEntries().map(s => {
        if (selectedStmtIds.includes(s.id)) {
          return {
            ...s,
            reconciliationStatus: 'CONCILIADO' as const,
            matchedTitleId: selectedTitles[0]?.id,
            reconciliationNote: selectedTitles.length === 1 
              ? `Conciliado com título já baixado previamente #${selectedTitles[0].titleNumber}`
              : `Conciliado com ${selectedTitles.length} títulos já baixados: ${selectedTitles.map(t => `#${t.titleNumber}`).join(', ')}`
          };
        }
        return s;
      });
      storage.saveStatementEntries(allStmts);

      const allTitles = storage.getTitles().map(t => {
        if (selectedTitleIds.includes(t.id)) {
          return {
            ...t,
            reconciliationStatus: 'CONCILIADO' as const,
            reconciledViaBank: true,
            reconciledAt: new Date().toISOString(),
            reconciliationNote: `Conciliado com extrato (${formatBRL(totalStmtsAmount)})`,
            updatedAt: new Date().toISOString()
          };
        }
        return t;
      });
      storage.saveTitles(allTitles);

      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CONCILIACAO_VINCULO_MANUAL',
        module: 'Conciliação Bancária',
        recordId: selectedTitleIds.join(','),
        details: `Conciliação vinculada: ${selectedTitles.length} título(s) já baixado(s) manualmente vinculado(s) a ${selectedStmts.length} extrato(s) sem duplicar movimentação de caixa.`
      });

      setSuccessMsg(selectedTitles.length === 1
        ? `✓ Sucesso! O título #${selectedTitles[0].titleNumber} (já liquidado) foi vinculado e marcado como conciliado via banco sem duplicar o lançamento no caixa!`
        : `✓ Sucesso! Os ${selectedTitles.length} títulos (já liquidados) foram vinculados e marcados como conciliados via banco sem duplicar lançamentos no caixa!`
      );
      setSelectedStmtIds([]);
      setSelectedTitleIds([]);
      setRefreshKey(k => k + 1);
      return;
    }

    // Se os valores já forem 100% iguais ou lote padrão, executa diretamente
    if (isMultiExact) {
      if (selectedStmts.length === 1 && selectedTitles.length === 1) {
        handleDirectExpressReconcile(selectedStmts[0], selectedTitles[0]);
      } else {
        executeMultiBatchReconcile();
      }
      return;
    }

    // Se houver qualquer diferença no caso 1x1, 1xN ou NxM:
    // REGRA MANDATÓRIA: Bloqueia conciliação cega de valores divergentes!
    // Abre obrigatoriamente a janela de conciliação para escolha de Pagamento Parcial ou Desconto/Acréscimo.
    const diff = Math.round((totalStmtsAmount - totalTitlesAmount) * 100) / 100;
    handleOpenReconcileModal(selectedStmts[0], selectedTitles[0]);
    setErrorMsg(`Valores divergentes: o total do extrato (${formatBRL(totalStmtsAmount)}) difere dos títulos (${formatBRL(totalTitlesAmount)}) por ${formatBRL(Math.abs(diff))}. Na janela aberta, marque "Pagamento Parcial" (se for quitação parcial) ou informe Desconto/Acréscimo para fechar o valor.`);
    return;
  };

  // Dispara a conciliação em lote de todas as sugestões aprovadas
  const handleTriggerBatchReconcileAllSuggestions = () => {
    setErrorMsg('');
    const allStmts = storage.getStatementEntries();
    const allTitles = storage.getTitles();
    const suggestions = allStmts.filter(s => 
      s.bankAccountId === selectedAccountId && 
      s.reconciliationStatus === 'SUGESTAO' && 
      Boolean(s.suggestedTitleId)
    );

    if (suggestions.length === 0) {
      setErrorMsg('Nenhuma sugestão de conciliação aguardando aprovação para a conta bancária selecionada.');
      return;
    }

    const validSuggestions = suggestions.filter(s => allTitles.some(t => t.id === s.suggestedTitleId));
    if (validSuggestions.length === 0) {
      setErrorMsg('Os títulos sugeridos não foram encontrados no ERP.');
      return;
    }

    const totalStmts = validSuggestions.reduce((sum, s) => sum + Math.abs(s.amount), 0);
    const totalTitles = validSuggestions.reduce((sum, s) => {
      const t = allTitles.find(title => title.id === s.suggestedTitleId);
      return sum + (t ? (t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount) : 0);
    }, 0);

    setBatchConfirmModal({
      isOpen: true,
      type: 'ALL_SUGGESTIONS',
      title: 'Conciliar Todas as Sugestões em Lote',
      description: `Deseja conciliar e dar baixa contábil automaticamente em todas as ${validSuggestions.length} sugestões identificadas pelo motor de compatibilidade bancária?`,
      stmtsCount: validSuggestions.length,
      titlesCount: validSuggestions.length,
      totalStmts,
      totalTitles,
      difference: Math.round(Math.abs(totalStmts - totalTitles) * 100) / 100,
      onConfirm: () => {
        setBatchConfirmModal(null);
        executeBatchReconcileAllSuggestions();
      }
    });
  };

  // Executa a conciliação de todas as sugestões em lote
  const executeBatchReconcileAllSuggestions = () => {
    const today = new Date().toISOString().split('T')[0];
    const allStmts = storage.getStatementEntries();
    const allTitles = storage.getTitles();
    
    const suggestions = allStmts.filter(s => 
      s.bankAccountId === selectedAccountId && 
      s.reconciliationStatus === 'SUGESTAO' && 
      Boolean(s.suggestedTitleId)
    );

    let settledCount = 0;
    let alreadySettledCount = 0;
    let reconciledCount = 0;
    const errors: string[] = [];
    const processedTitleIds: string[] = [];
    const processedStmtIds: string[] = [];

    suggestions.forEach(stmt => {
      const targetTitle = allTitles.find(t => t.id === stmt.suggestedTitleId);
      if (!targetTitle) return;

      if (targetTitle.settlementState === 'LIQUIDADO') {
        alreadySettledCount++;
        reconciledCount++;
        processedTitleIds.push(targetTitle.id);
        processedStmtIds.push(stmt.id);
      } else {
        const rawDate = stmt.date || today;
        const effectiveDate = rawDate > today ? today : rawDate;
        const p = targetTitle.balancePrincipal > 0 ? targetTitle.balancePrincipal : targetTitle.originalAmount;

        const res = FinancialEngine.postSettlement({
          titleId: targetTitle.id,
          settlementDate: effectiveDate,
          bankAccountId: stmt.bankAccountId,
          principalSettled: p,
          discount: 0,
          interest: 0,
          fine: 0,
          bankFee: 0,
          notes: `Baixa via Conciliação em Lote de Sugestões (${stmt.description})`,
          voucherRef: stmt.fitId
        });

        if (res.success) {
          settledCount++;
          reconciledCount++;
          processedTitleIds.push(targetTitle.id);
          processedStmtIds.push(stmt.id);
        } else {
          errors.push(`${targetTitle.titleNumber}: ${res.message}`);
        }
      }
    });

    // Atualiza os títulos no storage marcando como CONCILIADO
    const currentTitles = storage.getTitles();
    const updatedTitles = currentTitles.map(t => {
      if (processedTitleIds.includes(t.id)) {
        return {
          ...t,
          reconciliationStatus: 'CONCILIADO' as const,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    storage.saveTitles(updatedTitles);

    // Marca os extratos como conciliados
    const currentStmts = storage.getStatementEntries();
    const updatedStmts = currentStmts.map(s => {
      if (processedStmtIds.includes(s.id)) {
        return {
          ...s,
          reconciliationStatus: 'CONCILIADO' as const,
          matchedTitleId: s.suggestedTitleId
        };
      }
      return s;
    });
    storage.saveStatementEntries(updatedStmts);

    // Auditoria
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CONCILIACAO_LOTE_SUGESTOES',
      module: 'Conciliação Bancária',
      recordId: processedStmtIds.join(','),
      details: `Conciliação em Lote de Sugestões: ${reconciledCount} lançamentos conciliados (${settledCount} baixados no ERP, ${alreadySettledCount} já liquidados vinculados).`
    });

    if (errors.length > 0) {
      setErrorMsg(`Avisos ao conciliar sugestões: ${errors.join('; ')}`);
    }

    setSuccessMsg(`Sucesso! ${reconciledCount} sugestões de extrato foram conciliadas e quitadas no ERP em lote! (${settledCount} baixadas agora, ${alreadySettledCount} já quitadas vinculadas).`);
    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setRefreshKey(k => k + 1);
  };

  // Dispara modal de confirmação para conciliar todos os títulos já baixados que têm valor exato
  const handleTriggerBatchReconcileSettled = () => {
    setErrorMsg('');
    if (settledExactMatches.length === 0) {
      setErrorMsg('Nenhuma correspondência exata encontrada com títulos já baixados no momento.');
      return;
    }

    const totalStmts = settledExactMatches.reduce((sum, m) => sum + Math.abs(Number(m.stmt.amount) || 0), 0);
    const totalTitles = settledExactMatches.reduce((sum, m) => {
      const tVal = Number(m.title.settledPrincipal || m.title.originalAmount) || 0;
      return sum + tVal;
    }, 0);

    setBatchConfirmModal({
      isOpen: true,
      type: 'SETTLED_EXACT_MATCHES',
      title: 'Conciliar Títulos Já Baixados em Lote',
      description: `Identificamos ${settledExactMatches.length} lançamentos do extrato que correspondem com 100% de precisão de valores (no centavo) a títulos que já foram quitados manualmente no ERP. Deseja realizar a auditoria e conciliação em lote sem duplicar registros de caixa?`,
      stmtsCount: settledExactMatches.length,
      titlesCount: settledExactMatches.length,
      totalStmts,
      totalTitles,
      difference: Math.round(Math.abs(totalStmts - totalTitles) * 100) / 100,
      onConfirm: () => {
        setBatchConfirmModal(null);
        executeBatchReconcileSettled();
      }
    });
  };

  // Executa a conciliação em lote dos títulos já baixados
  const executeBatchReconcileSettled = () => {
    if (settledExactMatches.length === 0) return;

    const matchedStmtMap = new Map<string, FinancialTitle>();
    const matchedTitleMap = new Map<string, BankStatementEntry>();

    settledExactMatches.forEach(m => {
      matchedStmtMap.set(m.stmt.id, m.title);
      matchedTitleMap.set(m.title.id, m.stmt);
    });

    // 1. Atualiza extratos
    const allStmts = storage.getStatementEntries().map(s => {
      const matchedTitle = matchedStmtMap.get(s.id);
      if (matchedTitle) {
        return {
          ...s,
          reconciliationStatus: 'CONCILIADO' as const,
          matchedTitleId: matchedTitle.id,
          reconciliationNote: `Conciliado em lote com título já baixado manual #${matchedTitle.titleNumber}`
        };
      }
      return s;
    });
    storage.saveStatementEntries(allStmts);

    // 2. Atualiza títulos (sem chamar postSettlement, pois já estão quitados!)
    const allTitles = storage.getTitles().map(t => {
      const matchedStmt = matchedTitleMap.get(t.id);
      if (matchedStmt) {
        return {
          ...t,
          reconciliationStatus: 'CONCILIADO' as const,
          reconciledViaBank: true,
          reconciledAt: new Date().toISOString(),
          reconciliationNote: `Conciliado em lote com extrato (${formatBRL(Math.abs(matchedStmt.amount))})`,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    storage.saveTitles(allTitles);

    // Auditoria
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CONCILIACAO_LOTE_JA_BAIXADOS',
      module: 'Conciliação Bancária',
      recordId: settledExactMatches.map(m => m.stmt.id).join(','),
      details: `Conciliação em Lote de Já Baixados: ${settledExactMatches.length} títulos já liquidados vinculados aos lançamentos de extrato sem duplicação de caixa.`
    });

    setSuccessMsg(`✓ Sucesso! ${settledExactMatches.length} títulos já baixados manualmente foram conciliados com o extrato bancário sem alterar lançamentos do caixa.`);
    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setRefreshKey(k => k + 1);
  };

  // Função mestre para executar conciliação direta entre um lançamento de extrato e um título
  const executeDirectReconciliation = (
    stmt: BankStatementEntry,
    title: FinancialTitle,
    options?: {
      overridePrincipal?: number;
      overrideInterest?: number;
      overrideFine?: number;
      overrideDiscount?: number;
    }
  ): boolean => {
    setErrorMsg('');
    const stmtAbs = Math.round(Math.abs(Number(stmt.amount) || 0) * 100) / 100;
    const titleBal = Math.round((title.balancePrincipal > 0 ? title.balancePrincipal : title.originalAmount) * 100) / 100;

    // Caso 1: Título já liquidado no ERP (apenas cruzar e vincular auditoria)
    if (title.settlementState === 'LIQUIDADO' || (title.balancePrincipal !== undefined && title.balancePrincipal <= 0.005)) {
      const allStmts = storage.getStatementEntries();
      const updatedStmts = allStmts.map(s => s.id === stmt.id ? {
        ...s,
        reconciliationStatus: 'CONCILIADO' as const,
        matchedTitleId: title.id
      } : s);
      storage.saveStatementEntries(updatedStmts);

      const allTitles = storage.getTitles();
      const updatedTitles = allTitles.map(t => t.id === title.id ? {
        ...t,
        reconciliationStatus: 'CONCILIADO' as const,
        updatedAt: new Date().toISOString()
      } : t);
      storage.saveTitles(updatedTitles);

      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CONCILIACAO_VINCULO_MANUAL',
        module: 'Conciliação Bancária',
        recordId: stmt.id,
        details: `Extrato "${stmt.description}" (${formatBRL(stmt.amount)}) vinculado e conciliado com o título já liquidado ${title.titleNumber}.`
      });

      setSuccessMsg(`Lançamento "${stmt.description}" conciliado com sucesso com o título ${title.titleNumber}!`);
      setSelectedStmtIds([]);
      setSelectedTitleIds([]);
      setRefreshKey(k => k + 1);
      return true;
    }

    // Caso 2: Título em aberto - determinar valores exatos de liquidação
    let princ = options?.overridePrincipal ?? (adjPrincipal > 0 ? adjPrincipal : titleBal);
    let inter = options?.overrideInterest ?? adjInterest;
    let fine = options?.overrideFine ?? adjFine;
    let disc = options?.overrideDiscount ?? adjDiscount;

    if (princ <= 0) {
      princ = titleBal > 0 ? titleBal : stmtAbs;
    }

    const isPartial = princ < titleBal - 0.005;

    // Se o valor principal for maior que o saldo, atualiza o título no storage
    if (princ > titleBal) {
      const allTitles = storage.getTitles();
      const updatedTitles = allTitles.map(t => {
        if (t.id === title.id) {
          const diffP = princ - t.balancePrincipal;
          const newOriginal = Math.round(Math.max(0.01, t.originalAmount + diffP) * 100) / 100;
          return {
            ...t,
            originalAmount: newOriginal,
            balancePrincipal: princ,
            updatedAt: new Date().toISOString()
          };
        }
        return t;
      });
      storage.saveTitles(updatedTitles);
    }

    // Realiza a liquidação contábil via FinancialEngine
    const today = new Date().toISOString().split('T')[0];
    const safeEffectiveDate = stmt.date > today ? today : stmt.date;
    const safeBankAccountId = stmt.bankAccountId || selectedAccountId || (storage.getBankAccounts()[0]?.id ?? '');

    const settlementResult = FinancialEngine.postSettlement({
      titleId: title.id,
      settlementDate: safeEffectiveDate,
      bankAccountId: safeBankAccountId,
      principalSettled: princ,
      discount: disc,
      interest: inter,
      fine: fine,
      bankFee: 0,
      notes: isPartial
        ? `Baixa parcial via Conciliação Bancária (${stmt.description}). Saldo restante em aberto: ${formatBRL(titleBal - princ)}`
        : `Baixa via Conciliação Bancária Extrato (${stmt.description})${
            inter > 0 || fine > 0 || disc > 0 || Math.abs(princ - titleBal) > 0.005
              ? ` [Ajuste: Principal ${formatBRL(princ)}${inter > 0 ? `, Juros ${formatBRL(inter)}` : ''}${fine > 0 ? `, Multa ${formatBRL(fine)}` : ''}${disc > 0 ? `, Desc ${formatBRL(disc)}` : ''}]`
              : ''
          }`,
      voucherRef: stmt.fitId
    });

    if (!settlementResult.success) {
      setErrorMsg(`Falha ao conciliar lançamento: ${settlementResult.message}`);
      return false;
    }

    // Atualiza o título no storage:
    // SE FOR PARCIAL: mantém PENDENTE pois o restante continua em aberto!
    // SE FOR TOTAL: marca como CONCILIADO
    const currentTitles = storage.getTitles();
    const updatedTitles = currentTitles.map(t => {
      if (t.id === title.id) {
        const hasRemaining = t.balancePrincipal > 0.005;
        return {
          ...t,
          reconciliationStatus: isPartial && hasRemaining ? ('PENDENTE' as const) : ('CONCILIADO' as const),
          reconciliationNote: isPartial && hasRemaining
            ? `Pagamento parcial de ${formatBRL(princ)} conciliado via extrato (${stmt.description}). Saldo restante em aberto: ${formatBRL(t.balancePrincipal)}`
            : t.reconciliationNote,
          updatedAt: new Date().toISOString()
        };
      }
      return t;
    });
    storage.saveTitles(updatedTitles);

    // Atualiza o lançamento de extrato como CONCILIADO no storage
    const allStmts = storage.getStatementEntries();
    const updatedStmts = allStmts.map(s => s.id === stmt.id ? { 
      ...s, 
      reconciliationStatus: 'CONCILIADO' as const,
      matchedTitleId: title.id,
      reconciliationNote: isPartial
        ? `Conciliado como pagamento parcial do título #${title.titleNumber} (restante em aberto no ERP: ${formatBRL(titleBal - princ)})`
        : s.reconciliationNote
    } : s);
    storage.saveStatementEntries(updatedStmts);

    // Auditoria
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: isPartial ? 'CONCILIACAO_PAGAMENTO_PARCIAL' : 'CONCILIACAO_MANUAL',
      module: 'Conciliação Bancária',
      recordId: stmt.id,
      details: isPartial
        ? `Pagamento Parcial Conciliado: Extrato "${stmt.description}" (${formatBRL(stmt.amount)}) liquidou ${formatBRL(princ)} do título ${title.titleNumber}. Restante em aberto no ERP: ${formatBRL(titleBal - princ)}.`
        : `Conciliado: Extrato "${stmt.description}" (${formatBRL(stmt.amount)}) com título ${title.titleNumber}. Liquidado: Principal ${formatBRL(princ)}${inter > 0 ? `, Juros ${formatBRL(inter)}` : ''}${disc > 0 ? `, Desconto ${formatBRL(disc)}` : ''}.`
    });

    setSuccessMsg(isPartial
      ? `✓ Sucesso! Pagamento parcial de ${formatBRL(princ)} conciliado. O título #${title.titleNumber} continua em aberto com saldo restante de ${formatBRL(titleBal - princ)}.`
      : `Sucesso! Lançamento "${stmt.description}" conciliado e quitado no ERP com o título ${title.titleNumber}!`
    );
    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setRefreshKey(k => k + 1);
    return true;
  };


  // Salva o padrão do par selecionado como Regra De-Para Automática
  const handleSaveCurrentPairAsRule = () => {
    if (!selectedStmt || !selectedTitle) return;
    try {
      const createdRule = learnAndCreateRuleFromTransaction({
        stmt: selectedStmt,
        chartAccountId: selectedTitle.accountId,
        counterpartyId: selectedTitle.counterpartyId,
        ruleName: `Regra: ${selectedStmt.description.slice(0, 24)}`,
        autoReconcile: true
      });
      setSuccessMsg(`Regra de Conciliação Automática salva! Futuros extratos com "${createdRule.pattern}" serão associados automaticamente à conta contábil.`);
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      setErrorMsg(`Erro ao registrar regra: ${err.message || 'Falha ao salvar'}`);
    }
  };

  // Confirm reconciliation: suporta tanto par único (1x1) quanto conciliação em lote (1xN, Nx1, NxM)
  const handleConfirmPairing = () => {
    setErrorMsg('');
    if (selectedStmts.length === 0 || selectedTitles.length === 0) {
      setErrorMsg('Selecione pelo menos um lançamento do extrato na coluna esquerda e pelo menos um título na coluna direita para conciliar.');
      return;
    }

    // =========================================================================
    // CASO 1: CONCILIAÇÃO EM LOTE / MULTI-SELEÇÃO (ex: 1 pagamento para 2 títulos)
    // =========================================================================
    if (isMultiSelection) {
      if (!isMultiExact) {
        handleOpenReconcileModal(selectedStmts[0], selectedTitles[0]);
        setErrorMsg(`A conciliação em lote com valores divergentes está bloqueada (${formatBRL(Math.abs(multiDifference))}). Na janela aberta, ajuste os valores para bater 100% antes de confirmar.`);
        return;
      }

      // Se valores 100% conferidos, executa diretamente
      executeMultiBatchReconcile();
      return;
    }

    // =========================================================================
    // CASO 2: CONCILIAÇÃO UNITÁRIA (1 extrato com 1 título)
    // =========================================================================
    if (!selectedStmt || !selectedTitle) return;

    const titleBal = selectedTitle.balancePrincipal > 0 ? selectedTitle.balancePrincipal : selectedTitle.originalAmount;
    const stmtAbs = Math.abs(Number(selectedStmt.amount) || 0);

    // Se houver divergência, abre obrigatoriamente a janela de conciliação para Pagamento Parcial ou Ajuste
    if (Math.abs(stmtAbs - titleBal) >= 0.005) {
      handleOpenReconcileModal(selectedStmt, selectedTitle);
      setErrorMsg(`Valores divergentes: o extrato (${formatBRL(stmtAbs)}) difere do ERP (${formatBRL(titleBal)}). Selecione a opção "Pagamento Parcial" ou informe Desconto/Acréscimo na janela para poder conciliar.`);
      return;
    }

    executeDirectReconciliation(selectedStmt, selectedTitle, {
      overridePrincipal: stmtAbs,
      overrideInterest: 0,
      overrideFine: 0,
      overrideDiscount: 0
    });
  };

  // Create a brand new title and immediately reconcile with selected statement
  const handleCreateTitleAndReconcile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStmt) {
      setErrorMsg('Selecione um lançamento na coluna da esquerda antes de criar o título.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const rawDate = newTitleDate || selectedStmt.date;
    const safeDate = rawDate > today ? today : rawDate;

    const titleNumber = `TIT-${newTitleType === 'PAGAR' ? 'PAG' : 'REC'}-${Date.now().toString().slice(-6)}`;
    const newTitle: FinancialTitle = {
      id: `title-${Date.now()}`,
      companyId: 'comp-1',
      titleNumber,
      type: newTitleType,
      counterpartyId: newTitleEntity || (newTitleType === 'PAGAR' ? 'cli-1' : 'cli-2'),
      expectedBankAccountId: selectedAccountId,
      accountId: newTitleCategory || (newTitleType === 'PAGAR' ? 'acc-4.1.01' : 'acc-3.1.01'),
      description: newTitleDesc,
      launchDate: safeDate,
      competence: safeDate.substring(0, 7),
      issueDate: safeDate,
      dueDate: safeDate,
      expectedCashDate: safeDate,
      originalAmount: newTitleAmount,
      settledPrincipal: 0,
      balancePrincipal: newTitleAmount,
      accruedInterest: 0,
      accruedFine: 0,
      documentState: 'CONFIRMADO',
      settlementState: 'ABERTO',
      originType: 'MANUAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save new title into ERP
    const currentTitles = storage.getTitles();
    storage.saveTitles([newTitle, ...currentTitles]);

    // Perform immediate settlement
    FinancialEngine.postSettlement({
      titleId: newTitle.id,
      settlementDate: safeDate,
      bankAccountId: selectedStmt.bankAccountId,
      principalSettled: newTitleAmount,
      discount: 0,
      interest: 0,
      fine: 0,
      bankFee: 0,
      notes: `Lançado e baixado automaticamente via Conciliação Bancária (${selectedStmt.description})`,
      voucherRef: selectedStmt.fitId
    });

    // Mark title as reconciled
    const freshTitles = storage.getTitles();
    const updatedWithConciliated = freshTitles.map(t => t.id === newTitle.id ? {
      ...t,
      reconciliationStatus: 'CONCILIADO' as const,
      updatedAt: new Date().toISOString()
    } : t);
    storage.saveTitles(updatedWithConciliated);

    // Mark statement as reconciled
    const all = storage.getStatementEntries();
    const updated = all.map(s => s.id === selectedStmt.id ? { 
      ...s, 
      reconciliationStatus: 'CONCILIADO' as const,
      matchedTitleId: newTitle.id 
    } : s);
    storage.saveStatementEntries(updated);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CRIACAO_E_CONCILIACAO',
      module: 'Conciliação Bancária',
      recordId: newTitle.id,
      details: `Novo título ${titleNumber} criado e conciliado imediatamente com extrato "${selectedStmt.description}"`
    });

    if (saveAsAutoRule && selectedStmt && newTitle.accountId) {
      try {
        const createdRule = learnAndCreateRuleFromTransaction({
          stmt: selectedStmt,
          chartAccountId: newTitle.accountId,
          counterpartyId: newTitleEntity || undefined,
          ruleName: `Regra: ${newTitleDesc.slice(0, 25)}`,
          autoReconcile: true
        });
        setSuccessMsg(`Novo lançamento ${titleNumber} criado e conciliado! Regra De-Para "${createdRule.name}" gerada automaticamente para os próximos extratos.`);
      } catch (e) {
        setSuccessMsg(`Novo lançamento ${titleNumber} criado e conciliado com sucesso no extrato bancário!`);
      }
    } else {
      setSuccessMsg(`Novo lançamento ${titleNumber} criado e conciliado com sucesso no extrato bancário!`);
    }

    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setRightColumnTab('SELECT_EXISTING');
    setRefreshKey(k => k + 1);
  };

  // Criação e quitação inteligente a partir da sugestão da IA
  const handleCreateTitleFromAiSuggestion = (stmt: BankStatementEntry, sug: AiReconciliationSuggestion) => {
    const isDebit = stmt.amount < 0;
    const targetType = isDebit ? 'PAGAR' : 'RECEBER';
    const absAmount = Math.abs(stmt.amount);
    const today = new Date().toISOString().split('T')[0];
    const safeDate = stmt.date > today ? today : stmt.date;

    const matchedCat = chartAccounts.find(
      c => c.name.toLowerCase() === (sug.suggestedCategory || '').toLowerCase() || c.code === sug.suggestedCategory
    );
    const accountId = matchedCat?.id || (targetType === 'PAGAR' ? 'acc-4.1.01' : 'acc-3.1.01');
    const defaultCounterpartyId = persons[0]?.id || (targetType === 'PAGAR' ? 'cli-1' : 'cli-2');

    const titleNumber = `TIT-${targetType === 'PAGAR' ? 'PAG' : 'REC'}-${Date.now().toString().slice(-6)}`;
    const newTitle: FinancialTitle = {
      id: `title-ai-${Date.now()}`,
      companyId: 'comp-1',
      titleNumber,
      type: targetType,
      counterpartyId: defaultCounterpartyId,
      expectedBankAccountId: stmt.bankAccountId || selectedAccountId,
      accountId,
      description: `[IA] ${stmt.description}`,
      launchDate: safeDate,
      competence: safeDate.substring(0, 7),
      issueDate: safeDate,
      dueDate: safeDate,
      expectedCashDate: safeDate,
      originalAmount: absAmount,
      settledPrincipal: 0,
      balancePrincipal: absAmount,
      accruedInterest: 0,
      accruedFine: 0,
      documentState: 'CONFIRMADO',
      settlementState: 'ABERTO',
      originType: 'MANUAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const currentTitles = storage.getTitles();
    storage.saveTitles([newTitle, ...currentTitles]);

    FinancialEngine.postSettlement({
      titleId: newTitle.id,
      settlementDate: safeDate,
      bankAccountId: stmt.bankAccountId || selectedAccountId,
      principalSettled: absAmount,
      discount: 0,
      interest: 0,
      fine: 0,
      bankFee: 0,
      notes: `Título gerado e quitado via Assistente IA OpenCode (${stmt.description})`,
      voucherRef: stmt.fitId
    });

    const allUpdatedTitles = storage.getTitles().map(t => t.id === newTitle.id ? {
      ...t,
      reconciliationStatus: 'CONCILIADO' as const,
      updatedAt: new Date().toISOString()
    } : t);
    storage.saveTitles(allUpdatedTitles);

    const allStmts = storage.getStatementEntries().map(s => s.id === stmt.id ? {
      ...s,
      reconciliationStatus: 'CONCILIADO' as const,
      matchedTitleId: newTitle.id
    } : s);
    storage.saveStatementEntries(allStmts);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CONCILIACAO_IA_CRIACAO',
      module: 'Conciliação Bancária',
      recordId: newTitle.id,
      details: `Lançamento criado e conciliado via IA OpenCode com base no extrato "${stmt.description}" (${formatBRL(stmt.amount)}).`
    });

    setSuccessMsg(`Sucesso! Título ${titleNumber} criado e conciliado com base na recomendação da IA.`);
    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setRefreshKey(k => k + 1);
  };

  // Upload and parse real OFX file com leitura segura de ArrayBuffer, TextDecoder e deduplicação
  const processFile = (file: File) => {
    if (!file) return;

    setIsImportingOfx(true);
    setErrorMsg('');
    setSuccessMsg('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        if (!buffer || buffer.byteLength === 0) {
          setErrorMsg('O arquivo selecionado está vazio.');
          setIsImportingOfx(false);
          return;
        }

        // Tenta decodificar inicialmente como UTF-8
        let content = '';
        try {
          const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
          content = utf8Decoder.decode(buffer);
        } catch {
          content = '';
        }

        // Se o arquivo contiver cabeçalho declarando CHARSET:1252, ISO-8859-1 ou caracteres de substituição
        const upperCheck = (content || '').toUpperCase();
        if (!content || upperCheck.includes('CHARSET:1252') || upperCheck.includes('CHARSET:ISO-8859-1') || upperCheck.includes('CHARSET:CSISO88591') || content.includes('\uFFFD')) {
          try {
            const win1252Decoder = new TextDecoder('windows-1252');
            content = win1252Decoder.decode(buffer);
          } catch {
            // Continua com UTF-8 se windows-1252 não for suportado
          }
        }

        const parsedResult = parseOFXFull(content);
        const parsed = parsedResult.transactions;

        if (parsed.length === 0) {
          setErrorMsg(`Nenhuma transação financeira reconhecida em "${file.name}". Certifique-se de que o arquivo é um extrato bancário OFX ou CSV válido.`);
          setIsImportingOfx(false);
          return;
        }

        // Resolução inteligente da conta bancária:
        // 1. Procura conta bancária correspondente por número de conta ou código do banco
        const currentBankAccounts = storage.getBankAccounts();
        const rawOfxAcct = (parsedResult.accountId || '').replace(/\D/g, '');
        const rawOfxBank = (parsedResult.bankId || '').trim();

        let targetAccount = currentBankAccounts.find(a => {
          const aAcct = (a.accountNumber || '').replace(/\D/g, '');
          const aBank = (a.bankCode || '').trim();
          if (rawOfxAcct && aAcct && (aAcct === rawOfxAcct || aAcct.includes(rawOfxAcct) || rawOfxAcct.includes(aAcct))) {
            return true;
          }
          if (rawOfxBank && aBank && (aBank === rawOfxBank || aBank === `0${rawOfxBank}` || `0${aBank}` === rawOfxBank)) {
            return true;
          }
          return false;
        });

        // 2. Se não encontrou por dados bancários, verifica a conta atualmente selecionada
        if (!targetAccount) {
          targetAccount = currentBankAccounts.find(a => a.id === selectedAccountId);
        }

        // 3. Se nenhuma conta existir ou bater, cria automaticamente com os dados do OFX
        if (!targetAccount) {
          const bankName = rawOfxBank === '077' || rawOfxBank === '77' ? 'Banco Inter' :
                           (rawOfxBank === '260' || rawOfxBank === '0260') ? 'Nubank' :
                           rawOfxBank === '001' || rawOfxBank === '1' ? 'Banco do Brasil' :
                           rawOfxBank === '237' ? 'Bradesco' :
                           rawOfxBank === '341' ? 'Itaú' :
                           rawOfxBank === '033' || rawOfxBank === '33' ? 'Santander' :
                           rawOfxBank === '756' ? 'Sicoob' :
                           rawOfxBank === '748' ? 'Sicredi' :
                           rawOfxBank === '104' ? 'Caixa Econômica Federal' :
                           `Banco (${rawOfxBank || 'OFX'})`;

          const newAcc: BankAccount = {
            id: `bank-${rawOfxBank || '077'}-${Date.now()}`,
            institution: bankName,
            name: `${bankName} (Cta ${parsedResult.accountId || 'Principal'})`,
            bankCode: rawOfxBank || '077',
            agency: parsedResult.branchId || '0001-9',
            accountNumber: parsedResult.accountId || '437267326',
            type: 'CORRENTE',
            currency: 'BRL',
            initialBalance: parsedResult.ledgerBalance !== undefined ? parsedResult.ledgerBalance : 0,
            currentBalance: parsedResult.ledgerBalance !== undefined ? parsedResult.ledgerBalance : 0,
            baseDate: parsedResult.ledgerDate || new Date().toISOString().split('T')[0],
            includeInCashFlow: true,
            status: 'ATIVO',
            color: '#cdaa58'
          };

          storage.saveBankAccounts([...currentBankAccounts, newAcc]);
          targetAccount = newAcc;
        }

        const targetAccountId = targetAccount.id;
        setSelectedAccountId(targetAccountId);
        setStatementFilter('ALL');
        setSearchStmt('');

        const currentStatements = storage.getStatementEntries();
        const batchId = `batch-ofx-${Date.now()}`;

        // Deduplicação inteligente por fitId na mesma conta bancária
        const existingFitIds = new Set(
          currentStatements
            .filter(s => s.bankAccountId === targetAccountId && s.fitId)
            .map(s => s.fitId)
        );

        let alreadyExistingCount = 0;
        const newEntries: BankStatementEntry[] = [];

        parsed.forEach((p, idx) => {
          if (p.fitId && existingFitIds.has(p.fitId)) {
            alreadyExistingCount++;
          } else {
            newEntries.push({
              id: `stmt-ofx-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
              importBatchId: batchId,
              bankAccountId: targetAccountId,
              fitId: p.fitId,
              date: p.date,
              amount: p.amount,
              description: p.description,
              reconciliationStatus: 'PENDENTE'
            });
            if (p.fitId) {
              existingFitIds.add(p.fitId);
            }
          }
        });

        if (newEntries.length === 0 && alreadyExistingCount > 0) {
          // Re-importação inteligente: atualiza descrições e valores das transações pendentes daquele arquivo
          let refreshedCount = 0;
          const updatedAll = currentStatements.map(s => {
            if (s.bankAccountId === targetAccountId && s.reconciliationStatus === 'PENDENTE') {
              const matchingOfx = parsed.find(p => p.fitId === s.fitId);
              if (matchingOfx) {
                refreshedCount++;
                return {
                  ...s,
                  date: matchingOfx.date,
                  amount: matchingOfx.amount,
                  description: matchingOfx.description
                };
              }
            }
            return s;
          });

          storage.saveStatementEntries(updatedAll);
          setSuccessMsg(`Extrato OFX "${file.name}" sincronizado: ${alreadyExistingCount} lançamentos conferidos na conta ${targetAccount.name} (${refreshedCount} pendentes atualizados).`);
          setRefreshKey(k => k + 1);
          setIsImportingOfx(false);
          return;
        }

        storage.saveStatementEntries([...newEntries, ...currentStatements]);

        // Aplica regras de conciliação De-Para automaticamente nos novos lançamentos
        try {
          const currentUser = storage.getCurrentUser();
          applyReconciliationRules(targetAccountId, currentUser);
        } catch (ruleErr) {
          console.warn('Aplicação de regras De-Para pós-importação:', ruleErr);
        }

        // Feedback enriquecido com saldo do banco se presente
        const balanceInfo = parsedResult.ledgerBalance !== undefined 
          ? ` • Saldo Informado pelo Banco: ${formatBRL(parsedResult.ledgerBalance)}`
          : '';

        if (alreadyExistingCount > 0) {
          setSuccessMsg(`Extrato OFX "${file.name}" importado com sucesso na conta ${targetAccount.name}! ${newEntries.length} novas transações adicionadas (${alreadyExistingCount} já existiam)${balanceInfo}.`);
        } else {
          setSuccessMsg(`Extrato OFX "${file.name}" importado com sucesso na conta ${targetAccount.name}! ${newEntries.length} transações adicionadas${balanceInfo}.`);
        }

        setRefreshKey(k => k + 1);
      } catch (err: any) {
        console.error('Erro ao processar arquivo OFX:', err);
        setErrorMsg(`Falha ao ler o arquivo OFX: ${err?.message || 'Formato inválido ou corrompido'}`);
      } finally {
        setIsImportingOfx(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setErrorMsg('Erro de leitura física do arquivo no navegador.');
      setIsImportingOfx(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Exclusão individual de lançamento do extrato
  const handleDeleteStatement = (stmtId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const all = storage.getStatementEntries();
    storage.saveStatementEntries(all.filter(s => s.id !== stmtId));
    setSelectedStmtIds(prev => prev.filter(id => id !== stmtId));
    setSuccessMsg('Lançamento removido do extrato bancário com sucesso.');
    setRefreshKey(k => k + 1);
  };

  // Limpeza de todos os lançamentos pendentes da conta atual
  const handleClearAccountPendingStatements = () => {
    const pending = accountStatements.filter(s => s.reconciliationStatus === 'PENDENTE');
    if (pending.length === 0) {
      setErrorMsg('Nenhum lançamento pendente para limpar nesta conta bancária.');
      return;
    }
    if (confirm(`Deseja realmente excluir todos os ${pending.length} lançamentos pendentes desta conta bancária? Os lançamentos já conciliados serão preservados intactos.`)) {
      const all = storage.getStatementEntries();
      const preserved = all.filter(s => s.bankAccountId !== selectedAccountId || s.reconciliationStatus !== 'PENDENTE');
      storage.saveStatementEntries(preserved);
      setSelectedStmtIds([]);
      setSuccessMsg(`${pending.length} lançamentos pendentes foram removidos com sucesso. Agora você pode importar um novo arquivo OFX.`);
      setRefreshKey(k => k + 1);
    }
  };

  // Carga e treino com o extrato real do Banco Inter (36 transações)
  const handleSimulateOFX = () => {
    // 1. Garante que a conta Banco Inter está cadastrada e selecionada
    const currentBanks = storage.getBankAccounts();
    let interBank = currentBanks.find(b => b.bankCode === '077' || b.accountNumber === '437267326' || b.id === BANCO_INTER_ACCOUNT.id);
    if (!interBank) {
      storage.saveBankAccounts([...currentBanks, BANCO_INTER_ACCOUNT]);
      interBank = BANCO_INTER_ACCOUNT;
    }
    setSelectedAccountId(interBank.id);

    const batchId = `batch-inter-train-${Date.now()}`;
    const allStmts = storage.getStatementEntries();
    const existingFitIds = new Set(allStmts.filter(s => s.bankAccountId === interBank!.id).map(s => s.fitId));

    const newEntries: BankStatementEntry[] = BANCO_INTER_OFX_TRANSACTIONS
      .filter(t => !existingFitIds.has(t.fitId))
      .map(t => ({
        ...t,
        importBatchId: batchId,
        bankAccountId: interBank!.id
      }));

    if (newEntries.length === 0) {
      setSuccessMsg(`Extrato de treino do Banco Inter (36 transações) já carregado na conta ${interBank.name}.`);
    } else {
      storage.saveStatementEntries([...newEntries, ...allStmts]);
      setSuccessMsg(`Extrato de treino do Banco Inter carregado com sucesso (${newEntries.length} transações importadas). Saldo do banco: R$ 8.522,51.`);
    }

    // Aplica regras de conciliação De-Para automáticas
    try {
      const currentUser = storage.getCurrentUser();
      const rulesRes = applyReconciliationRules(interBank.id, currentUser);
      if (rulesRes.suggestedCount > 0) {
        setSuccessMsg(prev => `${prev} • ${rulesRes.suggestedCount} sugestões vinculadas por De-Para.`);
      }
    } catch {
      // ignore
    }

    setStatementFilter('ALL');
    setSearchStmt('');
    setRefreshKey(k => k + 1);
  };

  // KPI calculations
  const pendingCount = accountStatements.filter(s => s.reconciliationStatus === 'PENDENTE').length;
  const suggestionCount = accountStatements.filter(s => s.reconciliationStatus === 'SUGESTAO').length;
  const reconciledCount = accountStatements.filter(s => s.reconciliationStatus === 'CONCILIADO').length;

  // Listagem de títulos com filtro estrito por tipo (pagamento -> apenas contas a pagar; recebido -> apenas contas a receber)
  // e ordenação automática por maior chance de compatibilidade em ordem decrescente
  const rankedTitles = useMemo(() => {
    // 1. Filtro base de títulos com suporte ao filtro de liquidação (o usuário pediu: "MESMO SE EU JA TIVER RECEBIDO OU PAGO MANUALMENTE ELE APARECE PRA CONCILIAR PRA GARANTIR QUE CRUZEI OS DADOS E CASO NÃO, ELE DE BAIXA NO TITULO SELECIONADO.")
    let candidates = titles.filter(t => {
      if (titleSettlementFilter === 'PENDING') {
        return t.settlementState !== 'LIQUIDADO' || (selectedStmt && selectedStmt.matchedTitleId === t.id);
      }
      if (titleSettlementFilter === 'LIQUIDADO') {
        return t.settlementState === 'LIQUIDADO';
      }
      // 'ALL': Exibe todos os títulos (em aberto e liquidados)
      return true;
    });

    // 1.1 FILTRO DE PERÍODO / MÊS DO ERP (Padrão: Mês atual; títulos selecionados sempre preservados)
    if (titlePeriodMode === 'MONTH' && titleYearMonth) {
      candidates = candidates.filter(t => {
        // Se o título está selecionado ou vinculado ao extrato, preserva sempre visível
        if (selectedTitleIds.includes(t.id)) return true;
        if (selectedStmt && (selectedStmt.matchedTitleId === t.id || selectedStmt.suggestedTitleId === t.id)) return true;
        
        const dueYm = t.dueDate ? t.dueDate.substring(0, 7) : '';
        const compYm = t.competence ? t.competence.substring(0, 7) : '';
        return dueYm === titleYearMonth || compYm === titleYearMonth;
      });
    }

    // 2. REGRA MANDATÓRIA DO USUÁRIO:
    // "E quando selecionar um pagamento ele apenas selecione os pagamentos que ja tenho, quando for valor recebido, filtrar apenas os valores a receber"
    if (selectedStmt) {
      const isDebit = selectedStmt.amount < 0;
      const expectedType = isDebit ? 'PAGAR' : 'RECEBER';
      candidates = candidates.filter(t => t.type === expectedType);
    }

    // 3. Pesquisa de texto com tolerância e acentuação via matchesSearch
    if (deferredSearchTitle) {
      candidates = candidates.filter(t => {
        const person = counterpartyMap.get(t.counterpartyId);
        return matchesSearch([
          t.titleNumber,
          t.description,
          person?.name,
          person?.tradeName,
          person?.document,
          t.category,
          t.notes
        ], deferredSearchTitle);
      });
    }

    // 4. Sem extrato selecionado: ordena por data de vencimento
    if (!selectedStmt) {
      return candidates.map(t => ({
        title: t,
        match: null as ReconciliationMatchResult | null,
        person: counterpartyMap.get(t.counterpartyId)
      })).sort((a, b) => {
        const dateA = String(a.title?.dueDate || '');
        const dateB = String(b.title?.dueDate || '');
        return dateA.localeCompare(dateB);
      });
    }

    // 5. REGRA MANDATÓRIA DO USUÁRIO:
    // "quando selecionar o card do etrato, ja ordenar por ordem de maior chance de compatibilidade automaticamente em ordem decrescente"
    const scored = candidates.map(t => {
      const person = counterpartyMap.get(t.counterpartyId);
      const match = calculateReconciliationSimilarity(selectedStmt, t, person);
      return { title: t, match, person };
    });

    scored.sort((a, b) => {
      const scoreA = a.match?.score || 0;
      const scoreB = b.match?.score || 0;
      // Ordem decrescente de compatibilidade (maior probabilidade no topo)
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      // Desempate 1: proximidade de datas com o extrato de forma segura
      try {
        const stmtTime = new Date((selectedStmt?.date || '') + 'T00:00:00').getTime();
        const dueATime = new Date((a.title?.dueDate || '') + 'T00:00:00').getTime();
        const dueBTime = new Date((b.title?.dueDate || '') + 'T00:00:00').getTime();
        const diffA = isNaN(dueATime) ? 9999999999 : Math.abs(dueATime - stmtTime);
        const diffB = isNaN(dueBTime) ? 9999999999 : Math.abs(dueBTime - stmtTime);
        if (diffA !== diffB) {
          return diffA - diffB;
        }
      } catch {
        // Ignora erro de data e avança para o próximo critério
      }
      // Desempate 2: número do título
      const numA = String(a.title?.titleNumber || '');
      const numB = String(b.title?.titleNumber || '');
      return numA.localeCompare(numB);
    });

    return scored;
  }, [titles, selectedStmt, deferredSearchTitle, counterpartyMap, titleSettlementFilter, titlePeriodMode, titleYearMonth, selectedTitleIds]);

  // Bidirecionalidade: se um título for selecionado e nenhum extrato estiver marcado,
  // filtra e ordena os extratos de acordo com a natureza do título (Pagar -> débitos, Receber -> créditos)
  // em ordem decrescente de compatibilidade
  const rankedStatements = useMemo(() => {
    if (!selectedTitle || selectedStmtId) {
      return filteredStatements.map(s => ({
        statement: s,
        match: null as ReconciliationMatchResult | null
      }));
    }

    // Filtra extratos pela natureza contábil do título
    const expectedDebit = selectedTitle.type === 'PAGAR';
    const compatibleStatements = filteredStatements.filter(s => {
      if (!s) return false;
      const isDebit = (Number(s.amount) || 0) < 0;
      return isDebit === expectedDebit;
    });

    const cp = counterpartyMap.get(selectedTitle.counterpartyId);
    const scored = compatibleStatements.map(s => {
      const match = calculateReconciliationSimilarity(s, selectedTitle, cp);
      return { statement: s, match };
    });

    // Ordenação decrescente de compatibilidade
    scored.sort((a, b) => {
      const scoreA = a.match?.score || 0;
      const scoreB = b.match?.score || 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      const dateA = String(a.statement?.date || '');
      const dateB = String(b.statement?.date || '');
      return dateB.localeCompare(dateA);
    });

    return scored;
  }, [filteredStatements, selectedTitle, selectedStmtId, counterpartyMap]);

  // Controles de limitação para performance fluida e sem travamentos na listagem
  const visibleRankedStatements = useMemo(() => {
    return rankedStatements.slice(0, stmtsDisplayLimit);
  }, [rankedStatements, stmtsDisplayLimit]);

  const visibleRankedTitles = useMemo(() => {
    return rankedTitles.slice(0, titlesDisplayLimit);
  }, [rankedTitles, titlesDisplayLimit]);

  // Match do par atualmente selecionado
  const currentPairMatch = useMemo(() => {
    if (!selectedStmt || !selectedTitle) return null;
    const cp = counterpartyMap.get(selectedTitle.counterpartyId);
    return calculateReconciliationSimilarity(selectedStmt, selectedTitle, cp);
  }, [selectedStmt, selectedTitle, counterpartyMap]);

  const currentPairScore = currentPairMatch ? currentPairMatch.score : 0;

  const handleClearSelection = () => {
    setSelectedStmtIds([]);
    setSelectedTitleIds([]);
    setExpandedScoreTitleId(null);
  };

  // Ações de marcação em lote para os extratos
  const handleSelectAllStatements = () => {
    const visibleIds = rankedStatements.map(r => r.statement.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedStmtIds.includes(id));
    
    if (allSelected) {
      setSelectedStmtIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      const newStmtIds = Array.from(new Set([...selectedStmtIds, ...visibleIds]));
      setSelectedStmtIds(newStmtIds);

      // Auto-seleciona os títulos sugeridos para que o usuário possa conciliar diretamente em lote
      const suggestedIds = rankedStatements
        .map(r => r.statement.suggestedTitleId)
        .filter((id): id is string => Boolean(id));
      if (suggestedIds.length > 0) {
        setSelectedTitleIds(prev => Array.from(new Set([...prev, ...suggestedIds])));
      }
    }
  };

  // Ações de marcação em lote para os títulos do ERP
  const handleSelectAllTitles = () => {
    const visibleIds = rankedTitles.map(r => r.title.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedTitleIds.includes(id));
    
    if (allSelected) {
      setSelectedTitleIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedTitleIds(prev => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Atalhos de teclado para conciliação ágil (com refs estáveis para nunca causar recriação de listeners)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se o foco estiver em campo de entrada de formulário ou se houver modal aberto
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
         target.tagName === 'TEXTAREA' ||
         target.tagName === 'SELECT' ||
         target.isContentEditable)
      ) {
        return;
      }

      // Atalho: ESC para limpar seleções ativas
      if (e.key === 'Escape') {
        if (selectedStmtIdsRef.current.length > 0 || selectedTitleIdsRef.current.length > 0) {
          e.preventDefault();
          handleClearSelection();
        }
        return;
      }

      // Atalho: Enter para abrir a janela flutuante de conciliação
      if (e.key === 'Enter') {
        if (selectedStmtIdsRef.current.length > 0 || selectedTitleIdsRef.current.length > 0) {
          e.preventDefault();
          setIsFloatingReconcileOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingFile(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFile(e.dataTransfer.files[0]);
        }
      }}
      className="space-y-6 relative"
    >
      {/* Full Page Overlay de Drag and Drop para arquivo OFX */}
      {isDraggingFile && (
        <div className="fixed inset-0 bg-amber-500/15 backdrop-blur-xs z-50 flex flex-col items-center justify-center border-4 border-dashed border-amber-500 rounded-3xl p-8 text-center pointer-events-none animate-in fade-in duration-200">
          <div className="p-6 bg-slate-900/90 rounded-3xl border border-amber-500/50 shadow-2xl flex flex-col items-center max-w-md pointer-events-auto">
            <Upload className="w-16 h-16 text-amber-400 animate-bounce mb-3" />
            <h3 className="text-lg font-bold text-amber-200">Solte seu extrato OFX ou CSV aqui</h3>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              O sistema irá identificar automaticamente o banco, selecionar ou criar a conta bancária e importar todos os lançamentos com proteção anti-duplicidade.
            </p>
          </div>
        </div>
      )}
      
      {/* Hidden file input for real OFX */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept=".ofx,.OFX,.csv,.CSV,.txt,.TXT" 
        className="hidden" 
      />

      <PageToolbar description="Confronte o extrato bancário oficial (à esquerda) com os lançamentos do sistema ou crie novos títulos na hora (à direita).">
        <MoreMenu
          items={[
            { label: 'Conferir saldos e fechamento', icon: <Scale className="w-4 h-4" />, onClick: () => setIsClosingModalOpen(true), hint: 'Compara o saldo do sistema com o saldo real do banco' },
            { label: 'Regras De-Para', icon: <Sliders className="w-4 h-4" />, onClick: () => setIsRulesModalOpen(true), hint: 'Regras automáticas baseadas na descrição do extrato' },
            { label: 'Aplicar regras agora', icon: <Settings2 className="w-4 h-4" />, onClick: handleRunRules },
            { label: 'Assistente de IA', icon: <Bot className="w-4 h-4" />, onClick: () => setIsAiModalOpen(true) },
            { label: 'Diagnóstico e logs', icon: <FileText className="w-4 h-4" />, onClick: () => setIsDiagnosticsModalOpen(true), hint: 'Motivos de não conciliação' },
            { label: 'Nova conta bancária', icon: <Plus className="w-4 h-4" />, onClick: () => setIsNewAccountModalOpen(true) },
            { label: 'Gerar extrato de exemplo', icon: <RefreshCw className="w-4 h-4" />, onClick: handleSimulateOFX, hint: 'Dados de demonstração' }
          ]}
        />
        <Button
          variant="secondary"
          icon={isImportingOfx ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          onClick={() => !isImportingOfx && fileInputRef.current?.click()}
          disabled={isImportingOfx}
          title="Importar extrato OFX ou CSV do banco"
        >
          {isImportingOfx ? 'Processando OFX...' : 'Importar OFX'}
        </Button>
        <Button
          variant={suggestionCount > 0 ? 'secondary' : 'primary'}
          icon={<Sparkles className="w-4 h-4" />}
          onClick={handleRunAutoMatch}
        >
          Localizar sugestões
        </Button>
        {suggestionCount > 0 && (
          <Button
            variant="primary"
            icon={<CheckCheck className="w-4 h-4" />}
            onClick={handleTriggerBatchReconcileAllSuggestions}
            title="Aprovar e conciliar todas as sugestões encontradas"
          >
            Conciliar sugestões ({suggestionCount})
          </Button>
        )}
        {settledExactMatches.length > 0 && (
          <Button
            variant="secondary"
            icon={<HandCoins className="w-4 h-4" />}
            onClick={handleTriggerBatchReconcileSettled}
            title="Conciliar em lote os lançamentos que batem 100% com títulos já baixados no sistema"
          >
            Conciliar já baixados ({settledExactMatches.length})
          </Button>
        )}
      </PageToolbar>

      <Card className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="w-full sm:w-72">
          <FieldLabel>Conta bancária</FieldLabel>
          <PremiumSelect
            value={selectedAccountId}
            onChange={e => {
              setSelectedAccountId(e.target.value);
              setSelectedStmtIds([]);
              setSelectedTitleIds([]);
            }}
            sheetTitle="Conta bancária"
            className="w-full h-10 px-3 text-sm"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </PremiumSelect>
        </div>

        {currentAccount && (
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-1.5">Saldo contábil</p>
            <p className="h-10 flex items-center text-[17px] font-semibold tabular-nums">
              {formatBRL(FinancialEngine.calculateAccountBalance(currentAccount.id))}
            </p>
          </div>
        )}

        <div className="w-full sm:w-56">
          <FieldLabel>Tolerância da sugestão</FieldLabel>
          <PremiumSelect
            value={toleranceThreshold}
            onChange={e => setToleranceThreshold(Number(e.target.value))}
            sheetTitle="Tolerância da sugestão"
            className="w-full h-10 px-3 text-sm"
          >
            <option value={90}>90% ou mais (muito forte)</option>
            <option value={75}>75% ou mais (forte, padrão)</option>
            <option value={60}>60% ou mais (recomendada)</option>
            <option value={100}>100% (exato)</option>
          </PremiumSelect>
        </div>

        <p className="text-xs text-[var(--text-muted)] sm:ml-auto hidden md:block">
          Atalhos: <kbd className="px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)]">Enter</kbd> concilia •{' '}
          <kbd className="px-1.5 py-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)]">Esc</kbd> limpa a seleção
        </p>
      </Card>

      {successMsg && (
        <div className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <Check className="w-4 h-4 text-[var(--status-success)] shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" aria-label="Fechar aviso">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--status-danger)] shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" aria-label="Fechar aviso">✕</button>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Sugestões encontradas" value={suggestionCount} hint="Pela regra de aproximação" />
        <StatCard label="Já baixados no sistema" value={settledExactMatches.length} hint="Valor exato no extrato, sem duplicar caixa" />
        <StatCard label="Extrato pendente" value={pendingCount} hint="Vincule a um título ou crie um novo" />
        <StatCard label="Conciliados" value={reconciledCount} hint="Saldo bancário e contábil conferidos" />
      </div>

      {/* GRID PRINCIPAL: 2 COLUNAS DE CONCILIAÇÃO BANCÁRIA (Adaptativo) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6 items-start relative">
        
        {/* ======================================================== */}
        {/* COLUNA ESQUERDA: EXTRATO BANCÁRIO / OFX                  */}
        {/* ======================================================== */}
        <div 
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              processFile(e.dataTransfer.files[0]);
            }
          }}
          className={`bg-white dark:bg-[#131316] rounded-2xl border transition-all duration-200 shadow-2xs overflow-hidden flex flex-col relative ${
            isDraggingFile ? 'border-amber-500 ring-2 ring-amber-500/30' : 'border-slate-200 dark:border-[#26262b]'
          }`}
        >
          {/* Overlay de Drag and Drop para arquivo OFX */}
          {isDraggingFile && (
            <div className="absolute inset-0 bg-amber-500/10 backdrop-blur-xs z-30 flex flex-col items-center justify-center border-2 border-dashed border-amber-500 rounded-2xl pointer-events-none p-6 text-center">
              <Upload className="w-12 h-12 text-amber-500 animate-bounce mb-2" />
              <span className="text-sm font-bold text-amber-900 dark:text-amber-200">Solte o arquivo OFX ou CSV aqui</span>
              <span className="text-xs text-amber-700 dark:text-amber-400 mt-1">Importação automática com proteção contra duplicidade</span>
            </div>
          )}

          {/* Header da Coluna 1 */}
          <div className="p-4 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  1. Extrato Bancário / OFX ({filteredStatements.length})
                  {currentAccount && (
                    <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md truncate max-w-[160px]" title={currentAccount.name}>
                      {currentAccount.name}
                    </span>
                  )}
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selecione o lançamento que deseja auditar ou conciliar
              </p>
            </div>

            {/* Filter Tabs e Botão Multi-Seleção */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsStmtMultiMode(prev => !prev)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  isStmtMultiMode
                    ? 'bg-amber-500 text-slate-950 border border-amber-400'
                    : 'bg-white dark:bg-[#131316] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#26262b] hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Ativar/desativar modo de multi-seleção por clique no extrato"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isStmtMultiMode ? 'Multi-Seleção Ativa' : '+ Selecionar Vários'}</span>
              </button>

              <div className="flex items-center space-x-1 bg-white dark:bg-[#131316] p-1 rounded-xl border border-slate-200 dark:border-[#26262b] text-[11px]">
                <button
                  onClick={() => setStatementFilter('PENDENTE')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    statementFilter === 'PENDENTE'
                      ? 'bg-amber-500 text-black'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Pendentes ({pendingCount})
                </button>
                <button
                  onClick={() => setStatementFilter('SUGESTAO')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    statementFilter === 'SUGESTAO'
                      ? 'bg-amber-500 text-black'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Sugestões ({suggestionCount})
                </button>
                <button
                  onClick={() => setStatementFilter('CONCILIADO')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    statementFilter === 'CONCILIADO'
                      ? 'bg-amber-500 text-black'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Conciliados ({reconciledCount})
                </button>
                <button
                  onClick={() => setStatementFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                    statementFilter === 'ALL'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="p-3 border-b border-slate-100 dark:border-[#26262b]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar no extrato por texto ou FITID..."
                value={searchStmt}
                onChange={e => setSearchStmt(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
            </div>
          </div>

          {/* Barra de Ações em Lote do Extrato */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-[#1b1b20]/90 border-b border-slate-200 dark:border-[#26262b] flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rankedStatements.length > 0 && rankedStatements.every(r => selectedStmtIds.includes(r.statement.id))}
                onChange={handleSelectAllStatements}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
              <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                Marcar Todos ({rankedStatements.length})
              </span>
            </label>

            <div className="flex items-center gap-2.5">
              {selectedStmtIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedStmtIds([])}
                  className="text-[11px] text-slate-500 hover:text-amber-500 transition-colors cursor-pointer"
                >
                  Limpar Seleção ({selectedStmtIds.length})
                </button>
              )}

              {accountStatements.some(s => s.reconciliationStatus === 'PENDENTE') && (
                <button
                  type="button"
                  onClick={handleClearAccountPendingStatements}
                  className="text-[11px] text-rose-500 hover:text-rose-600 transition-colors cursor-pointer flex items-center gap-1 font-medium hover:underline"
                  title="Remove todos os lançamentos pendentes desta conta para permitir reimportação limpa de OFX"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpar Pendentes</span>
                </button>
              )}
            </div>
          </div>

          {/* Aviso contextual de multi-seleção de títulos */}
          {selectedTitles.length > 0 && selectedStmtIds.length === 0 && (
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Extratos priorizados para {selectedTitles.length === 1 ? `o título ${selectedTitles[0].titleNumber}` : `${selectedTitles.length} títulos selecionados`}</span>
              </div>
              <button
                onClick={() => setSelectedTitleIds([])}
                className="text-[11px] underline hover:text-amber-600 cursor-pointer"
              >
                Limpar
              </button>
            </div>
          )}



          {/* Statement List com cards independentes e espaçamento visual claro */}
          <div className="p-3 space-y-2.5 max-h-[600px] overflow-y-auto scrollbar-thin">
            {rankedStatements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-white dark:bg-[#17171b] rounded-xl border border-dashed border-slate-200 dark:border-[#26262b]">
                Nenhum lançamento no extrato para o filtro selecionado.
              </div>
            ) : (
              visibleRankedStatements.map(({ statement: stmt, match }) => {
                const isSelected = selectedStmtIds.includes(stmt.id);
                const isCredit = stmt.amount > 0;
                const suggestedTitle = titles.find(t => t.id === stmt.suggestedTitleId);
                const matchedTitle = titles.find(t => t.id === stmt.matchedTitleId);
                const score = match?.score || 0;
                const highlight = getMatchHighlightStyle(score, isSelected, true);

                return (
                  <div
                    key={stmt.id}
                    onClick={(e) => handleCardClickStatement(stmt, e)}
                    className={`p-3.5 transition-all cursor-pointer relative min-h-[148px] flex flex-col justify-between ${highlight.borderClass} ${highlight.bgClass}`}
                  >
                    <div className="flex-1 min-w-0">
                      {/* Badge Dourada de Destaque Premium na Linha Selecionada */}
                      {isSelected && (
                        <div className="mb-2 px-3 py-1 bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/40 rounded-lg flex items-center justify-between animate-in fade-in duration-150">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                            <span>Extrato Selecionado para Conciliação</span>
                          </span>
                          <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200">
                            {stmt.amount < 0 ? 'Saída / Débito' : 'Entrada / Crédito'}
                          </span>
                        </div>
                      )}

                      {/* Linha Superior: Checkbox, Porcentagem à Esquerda, Status, Vencimento/Data e Valor em Destaque */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1.5 min-w-0 flex-1">
                          {/* Checkbox de Seleção Múltipla */}
                          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleStatement(stmt, e as any)}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                              title="Marcar/desmarcar este extrato para conciliação"
                            />
                          </div>

                          {isSelected && (
                            <span className="text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in duration-150">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                              <span>Selecionado {selectedStmtIds.length > 1 ? `(#${selectedStmtIds.indexOf(stmt.id) + 1})` : ''}</span>
                            </span>
                          )}

                          {/* PORCENTAGEM DE COMPATIBILIDADE BEM À ESQUERDA */}
                          {score >= 40 && (
                            <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs ${getScoreAssertivenessColor(score).badgeClass}`}>
                              <Sparkles className="w-3 h-3 shrink-0" />
                              <span>{score}% compatível</span>
                            </span>
                          )}

                          {stmt.reconciliationStatus === 'CONCILIADO' ? (
                            <span className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1 shadow-2xs">
                              <CheckCheck className="w-3 h-3 stroke-[2.5]" />
                              <span>Conciliado</span>
                            </span>
                          ) : stmt.reconciliationStatus === 'SUGESTAO' ? (
                            <span className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>{stmt.ruleApplied || 'Sugestão'}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full font-bold">
                              Pendente
                            </span>
                          )}

                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isCredit 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30' 
                              : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                          }`}>
                            {isCredit ? 'Crédito' : 'Débito'}
                          </span>

                          {/* DATA DO EXTRATO COM DESTAQUE MAIOR */}
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700/80 border">
                            <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                            <span>{formatDateBR(stmt.date)}</span>
                          </span>
                        </div>

                        {/* VALOR DO EXTRATO EM DESTAQUE MÁXIMO */}
                        <div className="text-right whitespace-nowrap shrink-0">
                          <div className={`text-base sm:text-lg font-black font-mono leading-none ${
                            isSelected 
                              ? 'text-amber-600 dark:text-amber-400 drop-shadow-xs' 
                              : isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {isCredit ? '+' : ''} {formatBRL(stmt.amount)}
                          </div>
                        </div>
                      </div>

                      {/* DESCRIÇÃO EM DESTAQUE */}
                      <div className={`text-sm sm:text-[13px] font-extrabold leading-snug mt-1.5 line-clamp-2 ${
                        isSelected ? 'text-slate-950 dark:text-white' : 'text-slate-900 dark:text-slate-100'
                      }`} title={stmt.description}>
                        {stmt.description}
                      </div>

                      {/* Resumo de similaridade caso haja match */}
                      {match && match.summaryBadge && (
                        <div className={`text-[11px] mt-1 font-semibold ${isSelected ? 'text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400'}`}>
                          {match.summaryBadge}
                        </div>
                      )}
                    </div>

                    {/* Linha Inferior: Código FITID Discreto e Ações */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#26262b]/70 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/60 font-medium">
                          FITID: {stmt.fitId}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Botão de Conciliar ao lado do card selecionado */}
                        {isSelected && (
                          <>
                            {isValues100PercentExact && selectedTitle && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDirectExpressReconcile(stmt, selectedTitle);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white border border-emerald-400 cursor-pointer active:scale-95"
                                title="Conciliação Expressa em 1 Clique (Valores conferem 100%)"
                              >
                                <Zap className="w-3.5 h-3.5 fill-white" />
                                <span>⚡ 1-Clique</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const target = selectedTitle || (stmt.suggestedTitleId ? titles.find(t => t.id === stmt.suggestedTitleId) : null);
                                handleOpenReconcileModal(stmt, target || undefined);
                              }}
                              className="px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 cursor-pointer active:scale-95"
                              title="Conciliar imediatamente com o título selecionado"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>Conciliar</span>
                            </button>
                          </>
                        )}

                        {/* Botão de Desconciliação para extratos já conciliados */}
                        {stmt.reconciliationStatus === 'CONCILIADO' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const matched = titles.find(t => t.id === stmt.matchedTitleId);
                              setUnreconcileModal({
                                isOpen: true,
                                stmt,
                                matchedTitle: matched || null
                              });
                            }}
                            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 transition-colors cursor-pointer active:scale-95"
                            title="Desfazer conciliação deste lançamento e reabrir título original"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Desconciliar</span>
                          </button>
                        )}

                        {stmt.reconciliationStatus !== 'CONCILIADO' && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteStatement(stmt.id, e)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded hover:bg-rose-500/10 transition-colors cursor-pointer"
                            title="Excluir lançamento pendente do extrato bancário"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Vínculo info com atalho de 1-Clique na Sugestão (Opção 1) */}
                    {stmt.reconciliationStatus === 'SUGESTAO' && suggestedTitle && (
                      <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-slate-800 dark:text-slate-200 flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 truncate min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="truncate">Sugestão: <strong>{suggestedTitle.titleNumber}</strong> ({suggestedTitle.description})</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-amber-500 font-mono">
                            {formatBRL(suggestedTitle.balancePrincipal > 0 ? suggestedTitle.balancePrincipal : suggestedTitle.originalAmount)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDirectExpressReconcile(stmt, suggestedTitle);
                            }}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1 shadow-xs transition-colors cursor-pointer active:scale-95"
                            title="Conciliar direto em 1 clique com esta sugestão"
                          >
                            <Zap className="w-2.5 h-2.5 fill-slate-950" />
                            <span>1-Clique</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {stmt.reconciliationStatus === 'CONCILIADO' && matchedTitle && (
                      <div className="mt-2.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 truncate min-w-0">
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate">Conciliado com: <strong>{matchedTitle.titleNumber}</strong> ({matchedTitle.description})</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                            {formatBRL(matchedTitle.originalAmount)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUnreconcileModal({
                                isOpen: true,
                                stmt,
                                matchedTitle
                              });
                            }}
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold text-rose-500 dark:text-rose-400 hover:bg-rose-500/15 border border-rose-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Desfazer conciliação e reabrir título no financeiro"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            <span>Desfazer</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {rankedStatements.length > stmtsDisplayLimit && (
              <div className="p-3 text-center bg-slate-50 dark:bg-[#1b1b20]/60 border-t border-slate-100 dark:border-[#26262b]">
                <button
                  type="button"
                  onClick={() => setStmtsDisplayLimit(prev => prev + 50)}
                  className="text-xs font-bold text-amber-500 hover:text-amber-400 py-1.5 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer"
                >
                  Carregar mais lançamentos (+{rankedStatements.length - stmtsDisplayLimit} restantes)...
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* COLUNA DIREITA: TÍTULOS DO ERP OU CRIAR NOVO LANÇAMENTO  */}
        {/* ======================================================== */}
        <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-[#26262b] shadow-2xs overflow-hidden flex flex-col">
          
          {/* Header com Abas da Coluna 2 */}
          <div className="p-4 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  2. Lançamentos no ERP & Contas
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Vincule a um título existente ou crie o lançamento na hora
              </p>
            </div>

            {/* Alternador de Modo da Direita e Botão Multi-Seleção */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsTitleMultiMode(prev => !prev)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  isTitleMultiMode
                    ? 'bg-amber-500 text-slate-950 border border-amber-400'
                    : 'bg-white dark:bg-[#131316] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#26262b] hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                title="Ativar/desativar modo de multi-seleção por clique nas despesas/receitas"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{isTitleMultiMode ? 'Multi-Seleção Ativa' : '+ Selecionar Vários'}</span>
              </button>

              <div className="flex items-center bg-white dark:bg-[#131316] p-1 rounded-xl border border-slate-200 dark:border-[#26262b] text-xs">
                <button
                  type="button"
                  onClick={() => setRightColumnTab('SELECT_EXISTING')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                    rightColumnTab === 'SELECT_EXISTING'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Selecionar Existente
                </button>
                <button
                  type="button"
                  onClick={() => setRightColumnTab('CREATE_NEW')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1 cursor-pointer ${
                    rightColumnTab === 'CREATE_NEW'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Criar Novo
                </button>
                <button
                  type="button"
                  onClick={() => setRightColumnTab('TRANSFER')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-colors flex items-center gap-1 cursor-pointer ${
                    rightColumnTab === 'TRANSFER'
                      ? 'bg-amber-500 text-black shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title="Criar ou conciliar transferência entre contas bancárias"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Transferência
                </button>
              </div>
            </div>
          </div>

          {/* MODO 1: SELECIONAR TÍTULO EXISTENTE */}
          {rightColumnTab === 'SELECT_EXISTING' && (
            <div>
              {/* Search Bar e Filtros de Período e Liquidação */}
              <div className="p-3 border-b border-slate-100 dark:border-[#26262b] space-y-2.5">
                {/* Input de Busca Estrita com Botão de Limpeza */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por nº título, favorecido, descrição..."
                    value={searchTitle}
                    onChange={e => setSearchTitle(e.target.value)}
                    className="w-full pl-8 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                  {searchTitle && (
                    <button
                      type="button"
                      onClick={() => setSearchTitle('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Navegador de Período / Mês no Topo do ERP */}
                <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-[#131316]/80 border border-slate-200/80 dark:border-[#26262b] text-xs">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePrevTitleMonth}
                      className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      title="Mês anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-slate-800 dark:text-slate-100 px-1 select-none text-[11px] sm:text-xs">
                      {titlePeriodMode === 'MONTH' ? formatTitleMonthYearLabel(titleYearMonth) : 'Todos os Períodos'}
                    </span>
                    <button
                      type="button"
                      onClick={handleNextTitleMonth}
                      className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                      title="Próximo mês"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleCurrentTitleMonth}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                        titlePeriodMode === 'MONTH' && titleYearMonth === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
                          ? 'bg-amber-500 text-black shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                      }`}
                      title="Voltar para o mês corrente"
                    >
                      Mês Atual
                    </button>
                    <button
                      type="button"
                      onClick={() => setTitlePeriodMode(prev => prev === 'ALL' ? 'MONTH' : 'ALL')}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${
                        titlePeriodMode === 'ALL'
                          ? 'bg-amber-500 text-black shadow-2xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                      }`}
                      title="Exibir títulos de todos os meses ou filtrar por mês"
                    >
                      {titlePeriodMode === 'ALL' ? 'Filtro: Todos' : 'Ver Todos'}
                    </button>
                  </div>
                </div>

                {/* Filtro de Estado: Todos, Em Aberto, Já Baixados */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider mr-1">Status:</span>
                  <button
                    type="button"
                    onClick={() => setTitleSettlementFilter('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      titleSettlementFilter === 'ALL'
                        ? 'bg-amber-500 text-black shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setTitleSettlementFilter('PENDING')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      titleSettlementFilter === 'PENDING'
                        ? 'bg-amber-500 text-black shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Em Aberto
                  </button>
                  <button
                    type="button"
                    onClick={() => setTitleSettlementFilter('LIQUIDADO')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                      titleSettlementFilter === 'LIQUIDADO'
                        ? 'bg-amber-500 text-black shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    Já Baixados / Pagos
                  </button>
                </div>
              </div>

              {/* Barra de Ações em Lote dos Títulos */}
              <div className="px-4 py-2 bg-slate-50 dark:bg-[#1b1b20]/90 border-b border-slate-200 dark:border-[#26262b] flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rankedTitles.length > 0 && rankedTitles.every(r => selectedTitleIds.includes(r.title.id))}
                    onChange={handleSelectAllTitles}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    Marcar Todos ({rankedTitles.length})
                  </span>
                </label>

                {selectedTitleIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTitleIds([])}
                    className="text-[11px] text-slate-500 hover:text-amber-500 transition-colors cursor-pointer"
                  >
                    Limpar Seleção ({selectedTitleIds.length})
                  </button>
                )}
              </div>



              {/* Banner Informativo de Filtro e Ordenação Ativa */}
              {selectedStmt && (
                <div className="px-4 py-2.5 border-b text-xs flex items-center justify-between transition-colors bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {selectedStmt.amount < 0 ? (
                      <ArrowDownRight className="w-4 h-4 text-slate-500 shrink-0" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span>
                      Exibindo <strong>{selectedStmt.amount < 0 ? 'Contas a Pagar' : 'Contas a Receber'}</strong> ({rankedTitles.length} títulos)
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    Maior compatibilidade no topo ↓
                  </span>
                </div>
              )}

              {/* Lista de Títulos do ERP com cards independentes e espaçamento visual claro */}
              <div className="p-3 space-y-2.5 max-h-[600px] overflow-y-auto scrollbar-thin">
                {rankedTitles.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 space-y-3 bg-white dark:bg-[#17171b] rounded-xl border border-dashed border-slate-200 dark:border-[#26262b]">
                    <p>
                      Nenhum título localizado com os filtros atuais.
                    </p>
                    {selectedStmt && (
                      <button
                        type="button"
                        onClick={() => setRightColumnTab('CREATE_NEW')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Criar Novo Título para este Lançamento
                      </button>
                    )}
                  </div>
                ) : (
                  visibleRankedTitles.map(({ title: t, match, person }) => {
                    const isSelected = selectedTitleIds.includes(t.id);
                    const isExpanded = expandedScoreTitleId === t.id;
                    const score = match?.score || 0;
                    const isLiquidado = t.settlementState === 'LIQUIDADO';
                    const highlight = getMatchHighlightStyle(score, isSelected, false);

                    const today = new Date().toISOString().split('T')[0];
                    const isOverdue = (t.balancePrincipal > 0 || t.settlementState !== 'LIQUIDADO') && t.dueDate < today;
                    const isToday = t.dueDate === today;

                    return (
                      <div
                        key={t.id}
                        onClick={(e) => handleCardClickTitle(t.id, e)}
                        className={`p-3.5 transition-all cursor-pointer relative min-h-[148px] flex flex-col justify-between ${highlight.borderClass} ${highlight.bgClass}`}
                      >
                        <div className="flex-1 min-w-0">
                          {/* Badge Dourada de Destaque Premium na Linha Selecionada */}
                          {isSelected && (
                            <div className="mb-2 px-3 py-1 bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/40 rounded-lg flex items-center justify-between animate-in fade-in duration-150">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                                <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />
                                <span>Título ERP Selecionado para Conciliação</span>
                              </span>
                              <span className="text-[10px] font-bold text-amber-800 dark:text-amber-200">
                                #{t.titleNumber} • {t.type === 'PAGAR' ? 'Contas a Pagar' : 'Contas a Receber'}
                              </span>
                            </div>
                          )}

                          {/* Linha Superior: Checkbox, Porcentagem à Esquerda, Status, e VALOR EM DESTAQUE */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1.5 min-w-0 flex-1">
                              {/* Checkbox de Seleção Múltipla */}
                              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => handleToggleTitle(t.id, e as any)}
                                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500"
                                  title="Marcar/desmarcar este título para conciliação"
                                />
                              </div>

                              {isSelected && (
                                <span className="text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full flex items-center gap-1 animate-in fade-in duration-150">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                  <span>Selecionado {selectedTitleIds.length > 1 ? `(#${selectedTitleIds.indexOf(t.id) + 1})` : ''}</span>
                                </span>
                              )}

                              {/* PORCENTAGEM DE COMPATIBILIDADE BEM PRÓXIMA DA BORDA ESQUERDA */}
                              {match && (
                                <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs ${getScoreAssertivenessColor(score).badgeClass}`}>
                                  <Sparkles className="w-3 h-3 shrink-0" />
                                  <span>{score}% compatível • {match.confidence}</span>
                                </span>
                              )}

                              {/* Tipo: A PAGAR ou A RECEBER */}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                t.type === 'PAGAR'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40'
                              }`}>
                                {t.type === 'PAGAR' ? 'A PAGAR' : 'A RECEBER'}
                              </span>

                              {/* Status de Conciliação Bancária e Baixa com Dois Vistinhos */}
                              {t.reconciliationStatus === 'CONCILIADO' ? (
                                <span 
                                  className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40 flex items-center gap-1 shadow-2xs"
                                  title={`Conciliado com o Extrato Bancário${t.reconciliationNote ? `: ${t.reconciliationNote}` : ''}`}
                                >
                                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
                                  <span>CONCILIADO VIA BANCO</span>
                                </span>
                              ) : isLiquidado ? (
                                <span 
                                  className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/60 dark:border-amber-500/40 flex items-center gap-1 shadow-2xs"
                                  title="Título baixado manualmente no ERP (caixa/dinheiro/transferência). Pendente de conciliação com o extrato bancário."
                                >
                                  <HandCoins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 stroke-[2.2]" />
                                  <span>BAIXADO MANUAL (PENDENTE BANCO)</span>
                                </span>
                              ) : t.settlementState === 'PARCIAL' ? (
                                <span 
                                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40 flex items-center gap-1 shadow-2xs"
                                  title={`Pago parcialmente: ${formatBRL(t.settledPrincipal || 0)}. Saldo restante em aberto: ${formatBRL(t.balancePrincipal)}`}
                                >
                                  <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span>PARCIAL (Restante: {formatBRL(t.balancePrincipal)})</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                                  EM ABERTO
                                </span>
                              )}

                              {/* Badge de Sugestão Automática de Pagamento Parcial */}
                              {match?.isPartialMatch && (
                                <span 
                                  className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/50 flex items-center gap-1 shadow-2xs animate-pulse"
                                  title={`Provável pagamento parcial do título (${match.partialPercentage}%). Restará em aberto: ${formatBRL(match.remainingBalanceEstimated || 0)}`}
                                >
                                  <Clock className="w-3 h-3 text-amber-500 stroke-[2.5]" />
                                  <span>💡 PROVÁVEL PARCIAL ({match.partialPercentage}%)</span>
                                </span>
                              )}

                              {/* Divergência de centavos com o extrato selecionado */}
                              {selectedStmt && (() => {
                                const titleBal = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
                                const diff = Math.round((Math.abs(selectedStmt.amount) - titleBal) * 100) / 100;
                                if (Math.abs(diff) < 0.005) {
                                  return (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40 font-mono">
                                      ✓ Valor Exato (R$ 0,00)
                                    </span>
                                  );
                                }
                                if (Math.abs(diff) <= 100) {
                                  return (
                                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-slate-800 dark:text-amber-300 dark:border-amber-500/30">
                                      {diff > 0 ? `+${formatBRL(diff)} (Juros/Multa)` : `-${formatBRL(Math.abs(diff))} (Desconto)`}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* VALOR EM DESTAQUE MÁXIMO */}
                            <div className="text-right whitespace-nowrap shrink-0">
                              <div className={`text-base sm:text-lg font-black font-mono leading-none ${
                                isSelected 
                                  ? 'text-amber-600 dark:text-amber-400 drop-shadow-xs' 
                                  : t.type === 'RECEBER' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {formatBRL(t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount)}
                              </div>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 block text-right mt-0.5 font-medium">
                                {t.balancePrincipal > 0 && t.settledPrincipal > 0 
                                  ? `Saldo (Orig: ${formatBRL(t.originalAmount)})` 
                                  : `Valor do Título`}
                              </span>
                            </div>
                          </div>

                          {/* DESCRIÇÃO EM DESTAQUE */}
                          <div className={`text-sm sm:text-[14px] font-extrabold leading-snug mt-1.5 line-clamp-2 ${
                            isSelected ? 'text-slate-950 dark:text-white' : 'text-slate-900 dark:text-slate-100'
                          }`} title={t.description}>
                            {t.description}
                          </div>

                          {/* FAVORECIDO EM DESTAQUE */}
                          <div className={`text-xs font-bold mt-1.5 flex items-center gap-1.5 truncate ${
                            isSelected ? 'text-amber-900 dark:text-amber-200' : 'text-slate-800 dark:text-slate-200'
                          }`}>
                            <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">Favorecido:</span>
                            <span className={`font-extrabold truncate ${isSelected ? 'text-slate-950 dark:text-white' : 'text-slate-900 dark:text-slate-100'}`}>
                              {person?.tradeName || person?.name || 'Não informado'}
                            </span>
                            {person?.document && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-normal shrink-0">
                                ({person.document})
                              </span>
                            )}
                          </div>

                          {/* DATA DE VENCIMENTO EM DESTAQUE MAIOR */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border shadow-2xs ${
                              isOverdue
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
                                : isToday
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700/80'
                            }`}>
                              <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                              <span>Vencimento: {formatDateBR(t.dueDate)}</span>
                              {isOverdue && <span className="text-[10px] uppercase font-black tracking-wider text-rose-600 dark:text-rose-500">(Vencido)</span>}
                              {isToday && <span className="text-[10px] uppercase font-black tracking-wider text-amber-600 dark:text-amber-500">(Vence Hoje)</span>}
                            </span>

                            {match && match.summaryBadge && (
                              <span className={`text-[11px] font-medium ${isSelected ? 'text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400'}`}>
                                {match.summaryBadge}
                              </span>
                            )}
                          </div>

                          {/* Painel expansível de auditoria de fatores (se aberto) */}
                          {match && isExpanded && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-white/90 dark:bg-black/50 border border-slate-200 dark:border-[#26262b] text-[11px] space-y-1.5">
                              <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                                <span>• Valor ({match.breakdown.amountScore}/50 pts):</span>
                                <span className="font-semibold">{match.breakdown.amountSummary}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                                <span>• Data ({match.breakdown.dateScore}/30 pts):</span>
                                <span className="font-semibold">{match.breakdown.dateSummary}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                                <span>• Descrição / Favorecido ({match.breakdown.descriptionScore}/20 pts):</span>
                                <span className="font-semibold">{match.breakdown.descriptionSummary}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Linha Inferior: Código Doc e Dados Secundários com DESTAQUE MENOR + Ações */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-[#26262b]/70 flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 font-mono text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                            <span className="bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/60 font-medium">
                              Doc #{t.titleNumber}
                            </span>
                            {t.competence && (
                              <span className="bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/60 font-medium">
                                Comp: {t.competence}
                              </span>
                            )}
                            {(t.settlementState === 'PARCIAL' || (t.settledPrincipal && t.settledPrincipal > 0)) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedHistoryTitle(t);
                                }}
                                className="text-[10px] font-bold text-amber-800 dark:text-amber-300 hover:text-amber-950 dark:hover:text-amber-100 flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 transition-colors"
                                title="Ver linha do tempo com extratos bancários e amortizações anteriores deste título"
                              >
                                <History className="w-3 h-3 text-amber-500" />
                                <span>Extratos Anteriores</span>
                              </button>
                            )}
                            {match && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedScoreTitleId(isExpanded ? null : t.id);
                                }}
                                className="text-[10px] font-semibold text-amber-500 hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                              >
                                <span>Ver Fatores</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>

                          {/* Botões de Ação na Direita */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Ação Rápida: Provável Pagamento Parcial Detectado pelo Motor de IA/Matching */}
                            {selectedStmt && match?.isPartialMatch && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenReconcileModal(selectedStmt, t, true);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-black transition-all shadow-xs flex items-center gap-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:brightness-110 text-slate-950 border border-amber-300 cursor-pointer active:scale-95 animate-pulse"
                                title={`⚡ Sugestão Automática: Conciliar como Pagamento Parcial de ${formatBRL(Math.abs(selectedStmt.amount))} e manter saldo de ${formatBRL(match.remainingBalanceEstimated || 0)} em aberto no ERP`}
                              >
                                <Clock className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>⚡ Parcial ({match.partialPercentage}%)</span>
                              </button>
                            )}

                            {selectedStmt && Math.abs(Math.abs(selectedStmt.amount) - (t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount)) < 0.005 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDirectExpressReconcile(selectedStmt, t);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-white border border-emerald-400 cursor-pointer active:scale-95"
                                title="Conciliação Expressa em 1 Clique (Valores conferem 100%)"
                              >
                                <Zap className="w-3.5 h-3.5 fill-white" />
                                <span>⚡ 1-Clique</span>
                              </button>
                            )}

                            {isSelected ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const suggestedStmt = statements.find(s => s.suggestedTitleId === t.id || s.matchedTitleId === t.id);
                                  handleOpenReconcileModal(selectedStmt || suggestedStmt || undefined, t);
                                }}
                                className="px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 border border-amber-400 cursor-pointer active:scale-95"
                                title="Abrir conciliação deste título com o extrato"
                              >
                                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                                <span>Conciliar</span>
                              </button>
                            ) : selectedStmt && score >= 40 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenReconcileModal(selectedStmt, t);
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500 text-amber-900 dark:text-amber-200 hover:text-black border border-amber-500/40 cursor-pointer active:scale-95"
                                title="Abrir janela de conciliação para este lançamento"
                              >
                                <Check className="w-3 h-3 stroke-[2.5]" />
                                <span>Conciliar</span>
                              </button>
                            ) : null}

                            {t.reconciliationStatus === 'CONCILIADO' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnmarkTitleReconciled(t);
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-slate-300 dark:border-slate-700/80 transition-colors cursor-pointer"
                                title="Desmarcar conciliação bancária deste título"
                              >
                                Desconciliar
                              </button>
                            ) : isLiquidado && !selectedStmt ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkTitleAsReconciled(t);
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-300 dark:border-emerald-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Marcar este título já liquidado como conciliado via banco"
                              >
                                <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Marcar Conciliado</span>
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {rankedTitles.length > titlesDisplayLimit && (
                  <div className="p-3 text-center bg-slate-50 dark:bg-[#1b1b20]/60 border-t border-slate-100 dark:border-[#26262b]">
                    <button
                      type="button"
                      onClick={() => setTitlesDisplayLimit(prev => prev + 50)}
                      className="text-xs font-bold text-amber-500 hover:text-amber-400 py-1.5 px-4 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                      Carregar mais títulos (+{rankedTitles.length - titlesDisplayLimit} restantes)...
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODO 2: CRIAR NOVO TÍTULO E CONCILIAR JÁ */}
          {rightColumnTab === 'CREATE_NEW' && (
            <form onSubmit={handleCreateTitleAndReconcile} className="p-6 space-y-4 text-xs max-h-[580px] overflow-y-auto">
              
              {!selectedStmt && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-800 dark:text-amber-300 font-medium flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2 text-amber-500 flex-shrink-0" />
                  Selecione um lançamento do extrato bancário na coluna da esquerda para preencher os dados automaticamente.
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Tipo de Título *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTitleTypeChange('PAGAR')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      newTitleType === 'PAGAR'
                        ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                        : 'bg-white dark:bg-[#1b1b20] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#26262b] hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    Contas a Pagar (Despesa)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTitleTypeChange('RECEBER')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      newTitleType === 'RECEBER'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white dark:bg-[#1b1b20] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#26262b] hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    Contas a Receber (Receita)
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Descrição da Operação *
                </label>
                <input
                  type="text"
                  required
                  value={newTitleDesc}
                  onChange={e => setNewTitleDesc(e.target.value)}
                  placeholder="Ex: Tarifa de Manutenção de Conta, Abastecimento..."
                  className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] px-3.5 py-2 font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Valor (R$) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      value={newTitleAmount || ''}
                      onChange={e => setNewTitleAmount(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] pl-9 pr-3 py-2 font-bold text-slate-900 dark:text-amber-400 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Data de Competência *
                  </label>
                  <DateField
                    required
                    value={newTitleDate}
                    onChange={e => setNewTitleDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] px-3 py-2 font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Classificação Contábil (Plano de Contas)
                  <span className="text-[10px] text-amber-500 font-normal ml-1">
                    ({newTitleType === 'PAGAR' ? 'Filtrado: Custos e Despesas' : 'Filtrado: Receitas Operacionais'})
                  </span>
                </label>
                <SearchableSelect
                  options={chartAccountOptions}
                  value={newTitleCategory}
                  onChange={setNewTitleCategory}
                  placeholder={`Selecione a conta de ${newTitleType === 'PAGAR' ? 'despesa ou custo' : 'receita'}...`}
                  searchPlaceholder="Pesquisar por código, nome da conta ou grupo contábil..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  {newTitleType === 'PAGAR' ? 'Fornecedor / Favorecido' : 'Cliente / Pagador'}
                </label>
                <SearchableSelect
                  options={entityOptions}
                  value={newTitleEntity}
                  onChange={setNewTitleEntity}
                  placeholder={`Selecione o ${newTitleType === 'PAGAR' ? 'fornecedor ou credor' : 'cliente'}...`}
                  searchPlaceholder="Pesquisar por nome, documento ou tipo..."
                />
              </div>

              {/* Checkbox de Aprendizado de Regra Automática */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="saveAutoRuleCheck"
                  checked={saveAsAutoRule}
                  onChange={e => setSaveAsAutoRule(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-amber-500/50 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="saveAutoRuleCheck" className="text-[11px] text-amber-950 dark:text-amber-200 cursor-pointer select-none leading-snug">
                  <strong>Aprender padrão: salvar como Regra De-Para Automática</strong>
                  <span className="block text-slate-500 dark:text-slate-400 mt-0.5">
                    Extratos futuros com descritor similar serão categorizados e conciliados automaticamente com este plano de contas.
                  </span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-[#26262b]">
                <button
                  type="submit"
                  disabled={!selectedStmt}
                  className={`w-full py-3 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 ${
                    selectedStmt
                      ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-black hover:brightness-105 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  Criar Lançamento no ERP e Conciliar Imediatamente
                </button>
              </div>

            </form>
          )}

          {/* MODO 3: REGISTRAR E CONCILIAR TRANSFERÊNCIA ENTRE CONTAS */}
          {rightColumnTab === 'TRANSFER' && (
            <form onSubmit={handleCreateTransferAndReconcile} className="p-6 space-y-4 text-xs max-h-[580px] overflow-y-auto">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-1">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-700 dark:text-amber-300">
                  <ArrowLeftRight className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Transferência Interna Entre Contas Bancárias</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Registra a movimentação financeira entre duas contas bancárias da empresa (ex: PIX entre contas próprias, suprimento de caixa) sem gerar despesa ou receita indevida na DRE.
                </p>
                {selectedStmt && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    Lançamento do Extrato: <strong>{selectedStmt.description}</strong> ({formatBRL(selectedStmt.amount)}) em {formatDateBR(selectedStmt.date)}
                  </div>
                )}
              </div>

              {transferError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-300 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{transferError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Conta de Origem (Saída) *
                  </label>
                  <PremiumSelect
                    value={transferOriginAccountId}
                    onChange={e => setTransferOriginAccountId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Selecione a conta de saída...</option>
                    {accounts.filter(a => a.status === 'ATIVO').map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bankName} - {acc.name} ({formatBRL(acc.currentBalance)})
                      </option>
                    ))}
                  </PremiumSelect>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Conta de Destino (Entrada) *
                  </label>
                  <PremiumSelect
                    value={transferDestinationAccountId}
                    onChange={e => setTransferDestinationAccountId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Selecione a conta de entrada...</option>
                    {accounts.filter(a => a.status === 'ATIVO').map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bankName} - {acc.name} ({formatBRL(acc.currentBalance)})
                      </option>
                    ))}
                  </PremiumSelect>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Valor da Transferência (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={transferAmount || ''}
                    onChange={e => setTransferAmount(parseFloat(e.target.value) || 0)}
                    required
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 font-mono font-bold focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Data da Transferência *
                  </label>
                  <DateField
                    value={transferDate}
                    onChange={e => setTransferDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    Tarifa Bancária (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transferFeeAmount || ''}
                    onChange={e => setTransferFeeAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 font-mono focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  Observações / Histórico
                </label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  placeholder="Ex: Transferência de saldo Inter para Bradesco"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-[#26262b]">
                <button
                  type="submit"
                  className="w-full py-3 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 text-black hover:brightness-105 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  Registrar e Conciliar Transferência
                </button>
              </div>
            </form>
          )}

        </div>

      </div>

      {/* MODAL DE CONFIRMAÇÃO DA CONCILIAÇÃO EM LOTE */}
      {batchConfirmModal && batchConfirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-[#26262b] shadow-2xl max-w-lg w-full overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-[#26262b] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-500">
                  <CheckCheck className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {batchConfirmModal.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {batchConfirmModal.type === 'SETTLED_EXACT_MATCHES'
                      ? 'Auditoria e conciliação de títulos previamente quitados (sem duplicar lançamentos de caixa)'
                      : 'Conciliação bancária assistida com baixa automática no ERP'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBatchConfirmModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {batchConfirmModal.description}
              </p>

              {/* Quadro de Valores */}
              <div className="bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b] rounded-xl p-4 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Extratos Bancários ({batchConfirmModal.stmtsCount}):</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">
                    {formatBRL(batchConfirmModal.totalStmts)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Títulos no ERP ({batchConfirmModal.titlesCount}):</span>
                  <span className="font-bold text-slate-900 dark:text-white font-mono">
                    {formatBRL(batchConfirmModal.totalTitles)}
                  </span>
                </div>
                
                {batchConfirmModal.difference > 0.005 ? (
                  <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex justify-between items-center text-amber-600 dark:text-amber-400">
                    <span className="font-bold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Divergência Total:
                    </span>
                    <span className="font-bold font-mono">
                      {formatBRL(batchConfirmModal.difference)}
                    </span>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                    <span className="font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      Valores 100% Conferidos (Diferença: R$ 0,00)
                    </span>
                    <span className="font-bold font-mono">
                      R$ 0,00
                    </span>
                  </div>
                )}
              </div>

              {batchConfirmModal.difference > 0.005 ? (
                <div className="p-3.5 bg-rose-500/10 border-2 border-rose-500/50 rounded-xl text-xs space-y-1.5 text-rose-900 dark:text-rose-200">
                  <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 stroke-[2.5]" />
                    <span>CONCILIAÇÃO BLOQUEADA: VALORES DIVERGENTES</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    A conciliação <strong>NÃO PODE ser aceita</strong> sem que os valores estejam corrigidos e batam 100%! Existe uma diferença de <strong>{formatBRL(batchConfirmModal.difference)}</strong>. Corrija ou ajuste os valores na janela de conciliação para prosseguir.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0 stroke-[3]" />
                  <span>Valores 100% conferidos e prontos para conciliação.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 dark:bg-[#1b1b20] border-t border-slate-100 dark:border-[#26262b] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBatchConfirmModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              {batchConfirmModal.difference > 0.005 && (
                <button
                  type="button"
                  onClick={() => {
                    setBatchConfirmModal(null);
                    handleOpenReconcileModal();
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-4 h-4" />
                  <span>Ajustar na Janela de Conciliação</span>
                </button>
              )}

              <button
                type="button"
                disabled={batchConfirmModal.difference > 0.005}
                onClick={batchConfirmModal.onConfirm}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  batchConfirmModal.difference <= 0.005
                    ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20 cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-300 dark:border-slate-700 opacity-60'
                }`}
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>
                  {batchConfirmModal.difference <= 0.005 
                    ? (batchConfirmModal.type === 'SETTLED_EXACT_MATCHES'
                        ? `Confirmar Conciliação (${batchConfirmModal.titlesCount} Títulos Já Baixados)`
                        : 'Confirmar Conciliação em Lote (100% Exato)')
                    : 'Bloqueado (Valores Divergentes)'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Janela Flutuante de Conciliação Bancária & Auditoria Rigorosa 100% */}
      {isFloatingReconcileOpen && (
        <ReconciliationFloatingModal
          isOpen={isFloatingReconcileOpen}
          onClose={() => setIsFloatingReconcileOpen(false)}
          selectedStatements={selectedStmts.length > 0 ? selectedStmts : (selectedStmt ? [selectedStmt] : [])}
          selectedTitles={selectedTitles.length > 0 ? selectedTitles : (selectedTitle ? [selectedTitle] : [])}
          counterpartyMap={counterpartyMap}
          selectedAccountId={selectedAccountId}
          allAvailableTitles={titles}
          onSelectTitle={(t) => {
            setSelectedTitleIds([t.id]);
          }}
          onCreateTitleDirectly={(stmt) => {
            setIsFloatingReconcileOpen(false);
            setSelectedStmtIds([stmt.id]);
            setNewTitleDesc(stmt.description);
            setNewTitleAmount(Math.abs(stmt.amount));
            setNewTitleType(stmt.amount < 0 ? 'PAGAR' : 'RECEBER');
            const today = new Date().toISOString().split('T')[0];
            setNewTitleDate(stmt.date > today ? today : stmt.date);
            setRightColumnTab('CREATE_NEW');
          }}
          onSuccess={(msg) => {
            setSuccessMsg(msg);
            setSelectedStmtIds([]);
            setSelectedTitleIds([]);
            setRefreshKey(k => k + 1);
          }}
          onError={(msg) => setErrorMsg(msg)}
          initialPartialMode={initialPartialModeForModal}
        />
      )}

      {/* Modal Visual de Histórico de Extratos & Baixas do Título Parcial */}
      <TitleSettlementHistoryModal
        isOpen={Boolean(selectedHistoryTitle)}
        title={selectedHistoryTitle}
        onClose={() => setSelectedHistoryTitle(null)}
      />

      {/* Modal de Gerenciamento de Regras De-Para */}
      <ReconciliationRulesModal
        isOpen={isRulesModalOpen}
        onClose={() => {
          setIsRulesModalOpen(false);
          setRulesPresetPattern('');
        }}
        presetPattern={rulesPresetPattern}
        bankAccountId={selectedAccountId}
        selectedBankAccountId={selectedAccountId}
        bankAccountName={currentAccount?.name || 'Conta Bancária'}
        statementEntries={accountStatements}
        chartAccounts={chartAccounts}
        counterparties={persons}
        currentUser={storage.getCurrentUser()}
        onRulesApplied={({ reconciledCount, suggestedCount }) => {
          setRefreshKey(k => k + 1);
          if (reconciledCount > 0) {
            setSuccessMsg(`Sucesso! ${reconciledCount} lançamento(s) conciliado(s) pelas regras De-Para.`);
          } else if (suggestedCount > 0) {
            setSuccessMsg(`Regras aplicadas: ${suggestedCount} sugestão(ões) vinculada(s).`);
          } else {
            setSuccessMsg('Regras de conciliação processadas.');
          }
        }}
      />

      {/* Modal de Diagnóstico e Auditoria Detalhada de Conciliação */}
      <ReconciliationDiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setIsDiagnosticsModalOpen(false)}
        selectedBankAccountId={selectedAccountId}
        toleranceThreshold={toleranceThreshold}
        onCreateRuleFromPattern={(pattern) => {
          setRulesPresetPattern(pattern);
          setIsDiagnosticsModalOpen(false);
          setIsRulesModalOpen(true);
        }}
      />

      {/* Modal de Conferência de Saldos Bancários & Fechamento Perfeito */}
      <BankBalanceClosingModal
        isOpen={isClosingModalOpen}
        onClose={() => setIsClosingModalOpen(false)}
        defaultAccountId={selectedAccountId}
        onSuccess={() => setRefreshKey(k => k + 1)}
      />

      {/* Modal do Assistente de Conciliação com IA OpenCode (Multi-Model Failover) */}
      <AiReconciliationModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        selectedStatement={selectedStmt}
        allStatements={filteredStatements}
        candidateTitles={titles}
        chartAccounts={chartAccounts}
        onApplyMatch={(stmt, title) => {
          const stmtAbs = Math.round(Math.abs(Number(stmt.amount) || 0) * 100) / 100;
          const titleBal = Math.round((title.balancePrincipal > 0 ? title.balancePrincipal : title.originalAmount) * 100) / 100;
          if (Math.abs(stmtAbs - titleBal) >= 0.005) {
            handleOpenReconcileModal(stmt, title);
            setErrorMsg(`Valores divergentes: o extrato (${formatBRL(stmtAbs)}) difere do saldo do título (${formatBRL(titleBal)}). Faça a conferência e defina se a diferença é Tarifa Bancária ou Desconto no modal.`);
          } else {
            handleDirectExpressReconcile(stmt, title);
          }
        }}
        onCreateTitleFromAi={(stmt, sug) => {
          handleCreateTitleFromAiSuggestion(stmt, sug);
        }}
      />

      {/* Modal de Confirmação para Desconciliação / Estorno Seguro (Opção 2) */}
      {unreconcileModal && unreconcileModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#131316] rounded-2xl border border-rose-500/40 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Desfazer Conciliação</h3>
                <p className="text-xs text-slate-500">Estorno Contábil e Restauração de Saldo</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Você tem certeza que deseja desconciliar o lançamento do extrato{' '}
              <strong className="text-slate-900 dark:text-white font-semibold">"{unreconcileModal.stmt.description}"</strong> no valor de{' '}
              <strong className="text-amber-500 font-mono font-bold">{formatBRL(Math.abs(unreconcileModal.stmt.amount))}</strong>?
            </p>

            {unreconcileModal.matchedTitle ? (
              <div className="p-3 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b] space-y-1">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Título Vinculado a Estornar/Reabrir:</span>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[240px]">
                    {unreconcileModal.matchedTitle.titleNumber} - {unreconcileModal.matchedTitle.description}
                  </span>
                  <span className="font-mono font-bold text-amber-500 shrink-0">
                    {formatBRL(unreconcileModal.matchedTitle.originalAmount)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  A baixa financeira será estornada, o saldo bancário da conta será recomposto e o título voltará para o status "EM ABERTO".
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                O extrato voltará para o status "PENDENTE" na fila de conciliação desta conta.
              </p>
            )}

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-[#26262b]">
              <button
                type="button"
                onClick={() => setUnreconcileModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleUnreconcileConfirm}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirmar Desconciliação</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BARRA FIXA FLUTUANTE INFERIOR DE CONCILIAÇÃO (SEMPRE VISÍVEL MESMO COM ROLAGEM) */}
      {selectedStmtIds.length > 0 && selectedTitleIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-950/95 border-2 border-amber-500/60 shadow-2xl rounded-2xl px-5 py-3 backdrop-blur-md flex items-center gap-4 text-white max-w-[94vw] animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">
                Extrato ({selectedStmtIds.length}):
              </div>
              <div className="text-sm font-black font-mono text-sky-300">
                {formatBRL(totalStmtsAmount)}
              </div>
            </div>

            <div className={`w-8 h-8 rounded-full flex items-center justify-center border font-bold text-xs ${
              isMultiExact 
                ? 'bg-emerald-950 border-emerald-500 text-emerald-400' 
                : 'bg-amber-950 border-amber-500 text-amber-400'
            }`}>
              {isMultiExact ? '✓' : '≠'}
            </div>

            <div>
              <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                ERP ({selectedTitleIds.length}):
              </div>
              <div className="text-sm font-black font-mono text-amber-300">
                {formatBRL(totalTitlesAmount)}
              </div>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleInitiateReconciliation}
              className={`px-4 py-2 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ${
                isMultiExact
                  ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 text-slate-950 border border-emerald-300 shadow-emerald-500/30'
                  : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 border border-amber-300 shadow-amber-500/30'
              }`}
              title={isMultiExact ? 'Valores 100% batendo. Confirmar conciliação.' : 'Valores divergentes: abre a janela para selecionar Pagamento Parcial ou Desconto/Acréscimo.'}
            >
              {isMultiExact ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Confirmar Conciliação</span>
                </>
              ) : (
                <>
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Conciliar & Ajustar ({formatBRL(Math.abs(multiDifference))})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedStmtIds([]);
                setSelectedTitleIds([]);
              }}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Cancelar seleções"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Criação Rápida de Nova Conta Bancária */}
      <QuickNewBankAccountModal
        isOpen={isNewAccountModalOpen}
        onClose={() => setIsNewAccountModalOpen(false)}
        onAccountCreated={(newAcc) => {
          setSelectedAccountId(newAcc.id);
          setIsNewAccountModalOpen(false);
          setSuccessMsg(`Conta bancária "${newAcc.name}" criada com sucesso e selecionada para conciliação!`);
          setRefreshKey(k => k + 1);
        }}
      />

    </div>
  );
};
