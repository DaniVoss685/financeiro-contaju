import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingDown, 
  Plus, 
  Search, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Ban,
  Eye, 
  FileSpreadsheet,
  Edit3,
  Copy,
  Trash2,
  Layers,
  CheckSquare,
  Square,
  Sparkles,
  Upload,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CalendarDays,
  RotateCcw,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Barcode,
  Lock,
  Folder,
  MessageCircle,
  X,
  CheckCheck,
  HandCoins,
  Clock
} from 'lucide-react';
import { FinancialTitle, ChartAccount } from '../../types';
import { storage } from '../../services/storageService';
import { formatCompetenceShort, periodContainsDate } from '../../utils/dateUtils';
import { FinancialEngine, formatBRL, formatDateBR, getTemporalStatus, getFilteredChartAccounts, formatAccountNameWithoutCode, getAccountBadgeColorClasses, triggerWhatsAppForTitle } from '../../services/financialEngine';
import { matchesSearch } from '../../utils/searchUtils';
import { SettlementModal } from '../Modals/SettlementModal';
import { EditTitleModal } from '../Modals/EditTitleModal';
import { BatchEditTitlesModal } from '../Modals/BatchEditTitlesModal';
import { BatchSettlementModal } from '../Modals/BatchSettlementModal';
import { BatchPostponeModal } from '../Modals/BatchPostponeModal';
import { ImportSpreadsheetModal } from '../Modals/ImportSpreadsheetModal';
import { ConfirmBatchActionModal } from '../Modals/ConfirmBatchActionModal';
import { ConfirmReopenTitlesModal } from '../Modals/ConfirmReopenTitlesModal';
import { DeduplicationWizardModal } from '../Modals/DeduplicationWizardModal';
import { BoletoBatchSettlementModal } from './BoletoBatchSettlementModal';
import { TitleSettlementHistoryModal } from './TitleSettlementHistoryModal';
import { ModulePeriodNavigator } from '../Common/ModulePeriodNavigator';
import { SwipeableCard } from '../Common/SwipeableCard';
import { useModulePeriod } from '../../hooks/useModulePeriod';
import { toast } from '../../hooks/useToast';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { PremiumSelect } from '../Common/PremiumSelect';
import { Card, PageToolbar, Button, FilterPanel, FilterGroup, StatTile, TabPills, FieldLabel, MoreMenu } from '../Common/ui';
import { MoneyField } from '../Common/MoneyField';
import { useIsSimpleMode } from '../../hooks/useViewMode';
import { FilterChipSelect, FilterChipAmount } from '../Common/FilterChip';
import { usePersistentState } from '../../hooks/usePersistentState';
import { TWallet, TClock, TCalendar, TAlert, TCheck } from '../Common/tileIcons';

interface PayablesViewProps {
  onOpenNewTitleModal: (type: 'PAGAR') => void;
  initialSearch?: string;
}

export const PayablesView: React.FC<PayablesViewProps> = ({ onOpenNewTitleModal, initialSearch = '' }) => {
  const today = new Date().toISOString().split('T')[0];
  const { period } = useModulePeriod('PAYABLES');
  const simple = useIsSimpleMode();
  const [searchTerm, setSearchTerm] = usePersistentState<string>('pagar_busca', initialSearch);
  const [minAmount, setMinAmount] = usePersistentState<number>('pagar_min', 0);
  const [maxAmount, setMaxAmount] = usePersistentState<number>('pagar_max', 0);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [statusFilter, setStatusFilter] = usePersistentState<'TODOS' | 'ABERTO' | 'VENCIDO' | 'LIQUIDADO' | 'CANCELADO' | 'CONCILIADO'>('pagar_status', initialSearch ? 'TODOS' : 'ABERTO');

  React.useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      setStatusFilter('TODOS');
    }
  }, [initialSearch]);
  const [quickDateFilter, setQuickDateFilter] = usePersistentState<'ALL' | 'HOJE' | 'ESTA_SEMANA' | 'VENCIDO' | 'LIQUIDADO' | 'ESTE_MES'>('pagar_venc', 'ALL');
  const [categoryFilter, setCategoryFilter] = usePersistentState<string>('pagar_cat', 'ALL');
  const [counterpartyFilter, setCounterpartyFilter] = usePersistentState<string>('pagar_quem', 'ALL');
  const [bankFilter, setBankFilter] = usePersistentState<string>('pagar_banco', 'ALL');
  const [originFilter, setOriginFilter] = usePersistentState<'ALL' | 'CARTAO_CREDITO' | 'CONTRATO' | 'OUTROS'>('pagar_origem', 'ALL');

  // Sorting state
  const [sortField, setSortField] = useState<string>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedTitleForSettlement, setSelectedTitleForSettlement] = useState<FinancialTitle | null>(null);
  const [selectedTitleForEdit, setSelectedTitleForEdit] = useState<FinancialTitle | null>(null);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [isBatchSettlementOpen, setIsBatchSettlementOpen] = useState(false);
  const [isBatchPostponeOpen, setIsBatchPostponeOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBoletoModalOpen, setIsBoletoModalOpen] = useState(false);
  const [isDedupModalOpen, setIsDedupModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedMobileIds, setExpandedMobileIds] = useState<Record<string, boolean>>({});
  const [historyTitle, setHistoryTitle] = useState<FinancialTitle | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const duplicateCandidates = useMemo(() => {
    try {
      return storage.findDuplicateTitleCandidates('PAGAR');
    } catch {
      return [];
    }
  }, [refreshKey]);

  const toggleExpandMobile = (id: string) => {
    setExpandedMobileIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Modal de Confirmação em Lote ou Individual
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    mode: 'DELETE' | 'CANCEL';
    titles: FinancialTitle[];
  }>({
    isOpen: false,
    mode: 'DELETE',
    titles: []
  });

  // Modal de Reabertura de Pagamentos (Voltar para Em Aberto)
  const [reopenModalState, setReopenModalState] = useState<{
    isOpen: boolean;
    titles: FinancialTitle[];
  }>({
    isOpen: false,
    titles: []
  });

  // Notificação Toast não-bloqueante (substitui window.alert)
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    toast.show({
      type: toastMessage.type,
      message: toastMessage.text,
      title: toastMessage.type === 'success' ? 'Contas a Pagar' : (toastMessage.type === 'error' ? 'Erro' : 'Aviso')
    });
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Inscrição reativa para atualizações instantâneas no storage
  useEffect(() => {
    return storage.subscribe(() => {
      setRefreshKey(k => k + 1);
    });
  }, []);

  const titles = useMemo(() => {
    try {
      const data = storage.getTitles();
      return Array.isArray(data) ? data.filter(t => t && t.type === 'PAGAR') : [];
    } catch (err) {
      console.error('Erro ao ler títulos a pagar:', err);
      return [];
    }
  }, [refreshKey]);

  const counterparties = useMemo(() => {
    try {
      const data = storage.getCounterparties();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [refreshKey]);

  const chartAccounts = useMemo(() => {
    try {
      const data = storage.getChartAccounts();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [refreshKey]);

  const bankAccounts = useMemo(() => {
    try {
      const data = storage.getBankAccounts();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [refreshKey]);

  const settlements = useMemo(() => {
    try {
      const data = storage.getSettlements();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [refreshKey]);

  // Current week range (Monday to Sunday)
  const weekRange = useMemo(() => {
    try {
      const d = new Date(today + 'T00:00:00');
      const day = d.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        start: monday.toISOString().split('T')[0],
        end: sunday.toISOString().split('T')[0]
      };
    } catch {
      return { start: today, end: today };
    }
  }, [today]);

  // Base titles matching Payables Period (estritamente por Data de Vencimento)
  const periodTitles = useMemo(() => {
    try {
      return titles.filter(t => {
        if (!t) return false;
        if (!periodContainsDate(period, t.dueDate)) return false;
        return true;
      });
    } catch (err) {
      console.error('Erro ao filtrar títulos a pagar por período de vencimento:', err);
      return [];
    }
  }, [titles, period]);

  // KPI block stats
  const stats = useMemo(() => {
    try {
      const notCancelled = periodTitles.filter(t => t && t.documentState !== 'CANCELADO');
      const open = notCancelled.filter(t => (Number(t.balancePrincipal) || 0) > 0);
      const hoje = open.filter(t => String(t.dueDate || '') === today);
      const semana = open.filter(t => {
        const d = String(t.dueDate || '');
        return d && d >= weekRange.start && d <= weekRange.end;
      });
      const vencidos = open.filter(t => {
        const d = String(t.dueDate || '');
        return d && d < today;
      });
      const liquidados = notCancelled.filter(t => t.settlementState === 'LIQUIDADO');
      const conciliados = notCancelled.filter(t => t.reconciliationStatus === 'CONCILIADO');

      return {
        openTotal: open.reduce((acc, t) => acc + (Number(t.balancePrincipal) || 0), 0),
        openCount: open.length,
        hojeTotal: hoje.reduce((acc, t) => acc + (Number(t.balancePrincipal) || 0), 0),
        hojeCount: hoje.length,
        semanaTotal: semana.reduce((acc, t) => acc + (Number(t.balancePrincipal) || 0), 0),
        semanaCount: semana.length,
        vencidosTotal: vencidos.reduce((acc, t) => acc + (Number(t.balancePrincipal) || 0), 0),
        vencidosCount: vencidos.length,
        liquidadosTotal: liquidados.reduce((acc, t) => acc + (Number(t.originalAmount) || 0), 0),
        liquidadosCount: liquidados.length,
        conciliadosTotal: conciliados.reduce((acc, t) => acc + (Number(t.originalAmount) || 0), 0),
        conciliadosCount: conciliados.length,
        canceladosCount: periodTitles.filter(t => t && t.documentState === 'CANCELADO').length,
        todosCount: periodTitles.length
      };
    } catch (err) {
      console.error('Erro ao calcular estatísticas de contas a pagar:', err);
      return {
        openTotal: 0, openCount: 0,
        hojeTotal: 0, hojeCount: 0,
        semanaTotal: 0, semanaCount: 0,
        vencidosTotal: 0, vencidosCount: 0,
        liquidadosTotal: 0, liquidadosCount: 0,
        conciliadosTotal: 0, conciliadosCount: 0,
        canceladosCount: 0,
        todosCount: 0
      };
    }
  }, [periodTitles, today, weekRange]);

  // Estatísticas e agrupamento de categorias ativas com despesa no período selecionado
  const categoryStats = useMemo(() => {
    try {
      const counts: Record<string, { count: number; totalAmount: number }> = {};
      let unclassifiedCount = 0;
      let unclassifiedTotal = 0;

      periodTitles.forEach(t => {
        if (!t || t.documentState === 'CANCELADO') return;
        const accId = t.chartAccountId || t.accountId;
        const amt = Number(t.originalAmount) || 0;
        if (!accId) {
          unclassifiedCount++;
          unclassifiedTotal += amt;
        } else {
          if (!counts[accId]) {
            counts[accId] = { count: 0, totalAmount: 0 };
          }
          counts[accId].count++;
          counts[accId].totalAmount += amt;
        }
      });

      // Contas analíticas de despesas do plano de contas
      const expenseAccounts = getFilteredChartAccounts(chartAccounts, 'PAGAR');
      const inPeriodMap = new Map<string, { account: ChartAccount; count: number; totalAmount: number }>();

      expenseAccounts.forEach(acc => {
        const stat = counts[acc.id];
        if (stat && stat.count > 0) {
          inPeriodMap.set(acc.id, {
            account: acc,
            count: stat.count,
            totalAmount: Math.round(stat.totalAmount * 100) / 100
          });
        }
      });

      // Garantir inclusão de qualquer conta com lançamentos no período
      Object.keys(counts).forEach(accId => {
        if (!inPeriodMap.has(accId)) {
          const acc = chartAccounts.find(a => a && a.id === accId);
          if (acc) {
            inPeriodMap.set(accId, {
              account: acc,
              count: counts[accId].count,
              totalAmount: Math.round(counts[accId].totalAmount * 100) / 100
            });
          }
        }
      });

      const inPeriod = Array.from(inPeriodMap.values());
      inPeriod.sort((a, b) => b.count - a.count || a.account.code.localeCompare(b.account.code, undefined, { numeric: true }));

      const others = expenseAccounts
        .filter(acc => !inPeriodMap.has(acc.id))
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

      const isCost = (acc: ChartAccount) => (acc.code && acc.code.startsWith('2')) || acc.nature === 'CUSTO_SERVICO';
      const inPeriodCosts = inPeriod.filter(it => isCost(it.account));
      const inPeriodExpenses = inPeriod.filter(it => !isCost(it.account));
      const otherCosts = others.filter(acc => isCost(acc));
      const otherExpenses = others.filter(acc => !isCost(acc));

      return {
        inPeriod,
        others,
        inPeriodCosts,
        inPeriodExpenses,
        otherCosts,
        otherExpenses,
        unclassifiedCount,
        unclassifiedTotal: Math.round(unclassifiedTotal * 100) / 100,
        totalTitlesInPeriod: periodTitles.filter(t => t && t.documentState !== 'CANCELADO').length
      };
    } catch (err) {
      console.error('Erro ao calcular estatísticas de categorias no período:', err);
      return {
        inPeriod: [],
        others: [],
        unclassifiedCount: 0,
        unclassifiedTotal: 0,
        totalTitlesInPeriod: 0
      };
    }
  }, [periodTitles, chartAccounts]);

  // Filtering
  const filteredTitles = useMemo(() => {
    try {
      return periodTitles.filter(t => {
        if (!t) return false;
        const supplier = counterparties.find(c => c && c.id === t.counterpartyId);
        const chartAcc = chartAccounts.find(a => a && (a.id === t.accountId || a.id === t.chartAccountId));
        const matchSearch = matchesSearch([
          supplier?.name,
          supplier?.tradeName,
          supplier?.document,
          t.titleNumber,
          t.description,
          chartAcc?.name,
          chartAcc?.code
        ], searchTerm);

        if (!matchSearch) return false;

        // Category filter (específico, não classificado ou todos)
        if (categoryFilter !== 'ALL') {
          if (categoryFilter === 'SEM_CATEGORIA') {
            const hasCategory = Boolean(t.chartAccountId || t.accountId);
            if (hasCategory) return false;
          } else if (t.chartAccountId !== categoryFilter && t.accountId !== categoryFilter) {
            return false;
          }
        }

        // Counterparty filter
        if (counterpartyFilter !== 'ALL' && t.counterpartyId !== counterpartyFilter) {
          return false;
        }

        // Bank account filter
        if (bankFilter !== 'ALL' && t.expectedBankAccountId !== bankFilter) {
          return false;
        }

        // Origin filter
        if (originFilter === 'CARTAO_CREDITO' && t.originType !== 'CARTAO_CREDITO') {
          return false;
        }
        if (originFilter === 'CONTRATO') {
          const isContract = t.originType === 'CONTRATO' || t.originType === 'RECORRENCIA_PAGAR' || (t.titleNumber && t.titleNumber.startsWith('FAT-')) || Boolean(t.contractNumber);
          if (!isContract) return false;
        }
        if (originFilter === 'OUTROS') {
          const isContractOrCard = t.originType === 'CARTAO_CREDITO' || t.originType === 'CONTRATO' || t.originType === 'RECORRENCIA_PAGAR' || Boolean(t.contractNumber);
          if (isContractOrCard) return false;
        }

        const balance = Number(t.balancePrincipal) || 0;
        const due = String(t.dueDate || '');
        const valorTitulo = Number(t.originalAmount) || 0;
        if (minAmount > 0 && valorTitulo < minAmount) return false;
        if (maxAmount > 0 && valorTitulo > maxAmount) return false;

        // Quick Date filter
        if (quickDateFilter === 'HOJE') {
          if (t.documentState === 'CANCELADO' || balance <= 0 || due !== today) return false;
        } else if (quickDateFilter === 'ESTA_SEMANA') {
          if (t.documentState === 'CANCELADO' || balance <= 0 || due < weekRange.start || due > weekRange.end) return false;
        } else if (quickDateFilter === 'ESTE_MES') {
          if (t.documentState === 'CANCELADO' || balance <= 0 || !due.startsWith(today.slice(0, 7))) return false;
        } else if (quickDateFilter === 'VENCIDO') {
          if (t.documentState === 'CANCELADO' || balance <= 0 || due >= today) return false;
        } else if (quickDateFilter === 'LIQUIDADO') {
          if (t.documentState === 'CANCELADO' || t.settlementState !== 'LIQUIDADO') return false;
        }

        // Status pill tab filter (only applied if quickDateFilter is ALL)
        if (quickDateFilter === 'ALL') {
          if (statusFilter === 'TODOS') return true;
          if (statusFilter === 'CANCELADO') return t.documentState === 'CANCELADO';
          if (t.documentState === 'CANCELADO') return false;

          if (statusFilter === 'ABERTO') return balance > 0;
          if (statusFilter === 'VENCIDO') return balance > 0 && due < today;
          if (statusFilter === 'LIQUIDADO') return t.settlementState === 'LIQUIDADO';
          if (statusFilter === 'CONCILIADO') return t.reconciliationStatus === 'CONCILIADO';
        }

        return true;
      });
    } catch (err) {
      console.error('Erro ao filtrar títulos a pagar:', err);
      return [];
    }
  }, [periodTitles, minAmount, maxAmount, searchTerm, categoryFilter, counterpartyFilter, bankFilter, originFilter, quickDateFilter, statusFilter, today, weekRange, counterparties, chartAccounts]);

  // Sorting
  const sortedTitles = useMemo(() => {
    try {
      return [...filteredTitles].sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        switch (sortField) {
          case 'titleNumber':
            valA = a.titleNumber || '';
            valB = b.titleNumber || '';
            break;
          case 'counterparty':
            valA = counterparties.find(c => c && c.id === a.counterpartyId)?.name || '';
            valB = counterparties.find(c => c && c.id === b.counterpartyId)?.name || '';
            break;
          case 'competence':
            valA = a.competence || '';
            valB = b.competence || '';
            break;
          case 'dueDate':
            valA = a.dueDate || '';
            valB = b.dueDate || '';
            break;
          case 'expectedCashDate':
            valA = a.expectedCashDate || a.dueDate || '';
            valB = b.expectedCashDate || b.dueDate || '';
            break;
          case 'originalAmount':
            valA = Number(a.originalAmount) || 0;
            valB = Number(b.originalAmount) || 0;
            break;
          case 'balancePrincipal':
            valA = Number(a.balancePrincipal) || 0;
            valB = Number(b.balancePrincipal) || 0;
            break;
          case 'status':
            valA = a.documentState === 'CANCELADO' ? 'CANCELADO' : (a.settlementState || '');
            valB = b.documentState === 'CANCELADO' ? 'CANCELADO' : (b.settlementState || '');
            break;
          default:
            valA = a.dueDate || '';
            valB = b.dueDate || '';
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortOrder === 'asc' ? (valA - valB) : (valB - valA);
        } else {
          const strA = String(valA || '');
          const strB = String(valB || '');
          const res = strA.localeCompare(strB);
          return sortOrder === 'asc' ? res : -res;
        }
      });
    } catch (err) {
      console.error('Erro ao ordenar títulos a pagar:', err);
      return filteredTitles;
    }
  }, [filteredTitles, sortField, sortOrder, counterparties]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setCategoryFilter('ALL');
    setCounterpartyFilter('ALL');
    setBankFilter('ALL');
    setMinAmount(0);
    setMaxAmount(0);
    setOriginFilter('ALL');
    setQuickDateFilter('ALL');
    setStatusFilter('ABERTO');
  };

  const hasActiveFilters = minAmount > 0 || maxAmount > 0 || searchTerm !== '' || categoryFilter !== 'ALL' || counterpartyFilter !== 'ALL' || bankFilter !== 'ALL' || originFilter !== 'ALL' || quickDateFilter !== 'ALL';

  // Batch selection helpers - Permite selecionar qualquer lançamento, inclusive cancelados para exclusão em lote
  const selectableTitles = filteredTitles;
  const isAllSelected = selectableTitles.length > 0 && selectableTitles.every(t => selectedIds.includes(t.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableTitles.map(t => t.id));
    }
  };

  const handleToggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // Duplicate single title
  const handleDuplicateOne = (t: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const created = storage.duplicateTitles([t.id], false);
    if (created.length > 0) {
      setRefreshKey(k => k + 1);
      setToastMessage({
        type: 'success',
        text: `Despesa copiada com sucesso!`
      });
    }
  };

  // WhatsApp reminder/notification
  const handleTriggerWhatsApp = (t: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const supplier = counterparties.find(c => c && c.id === t.counterpartyId);
    const supplierPhone = supplier?.phone || (supplier as any)?.mobilePhone || (supplier as any)?.whatsapp;
    const res = triggerWhatsAppForTitle(t, supplierPhone, supplier?.name || supplier?.tradeName);
    if (res.copied) {
      setToastMessage({
        type: 'success',
        text: 'Mensagem de WhatsApp copiada e conversa aberta!'
      });
    } else {
      setToastMessage({
        type: 'success',
        text: 'Conversa de WhatsApp aberta com sucesso!'
      });
    }
  };

  // Batch operations
  const handleBatchDuplicate = (advanceMonth = false) => {
    if (selectedIds.length === 0) return;
    const created = storage.duplicateTitles(selectedIds, advanceMonth);
    setSelectedIds([]);
    setRefreshKey(k => k + 1);
    setToastMessage({
      type: 'success',
      text: `${created.length} despesa(s) copiada(s) com sucesso!`
    });
  };

  // Triggers para abrir o modal de confirmação
  const handleOpenBatchDelete = () => {
    if (selectedIds.length === 0) return;
    const allTitles = storage.getTitles();
    const targetTitles = allTitles.filter(t => selectedIds.includes(t.id));
    setConfirmModalState({
      isOpen: true,
      mode: 'DELETE',
      titles: targetTitles.length > 0 ? targetTitles : titles.filter(t => selectedIds.includes(t.id))
    });
  };

  const handleOpenBatchCancel = () => {
    if (selectedIds.length === 0) return;
    const allTitles = storage.getTitles();
    const targetTitles = allTitles.filter(t => selectedIds.includes(t.id));
    setConfirmModalState({
      isOpen: true,
      mode: 'CANCEL',
      titles: targetTitles.length > 0 ? targetTitles : titles.filter(t => selectedIds.includes(t.id))
    });
  };

  const handleStartEditTitle = (t: FinancialTitle) => {
    if (t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank) {
      setToastMessage({
        type: 'info',
        text: `🔒 Esta despesa já foi conferida com o banco e não pode ser editada. Para fazer alterações, desfaça a conciliação na tela de Conciliação Bancária.`
      });
      return;
    }
    setSelectedTitleForEdit(t);
  };

  const handleOpenSingleDelete = (t: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank) {
      setToastMessage({
        type: 'info',
        text: `🔒 Esta despesa já foi conferida com o banco e não pode ser excluída. Desfaça a conciliação bancária primeiro na tela de Conciliação.`
      });
      return;
    }
    setConfirmModalState({
      isOpen: true,
      mode: 'DELETE',
      titles: [t]
    });
  };

  const handleOpenSingleCancel = (t: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank) {
      setToastMessage({
        type: 'info',
        text: `🔒 Esta despesa já foi conferida com o banco e não pode ser cancelada. Desfaça a conciliação bancária primeiro na tela de Conciliação.`
      });
      return;
    }
    setConfirmModalState({
      isOpen: true,
      mode: 'CANCEL',
      titles: [t]
    });
  };

  const handleOpenSingleReopen = (t: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank) {
      setToastMessage({
        type: 'info',
        text: `🔒 Esta despesa já foi conferida com o banco. Para estornar ou reabrir esta despesa, desfaça a conciliação na tela de Conciliação Bancária.`
      });
      return;
    }
    setReopenModalState({
      isOpen: true,
      titles: [t]
    });
  };

  const handleOpenBatchReopen = () => {
    if (selectedIds.length === 0) return;
    const allTitles = storage.getTitles();
    const targetTitles = allTitles.filter(t => 
      selectedIds.includes(t.id) && 
      (t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL') &&
      t.reconciliationStatus !== 'CONCILIADO' &&
      !t.reconciledViaBank
    );
    if (targetTitles.length === 0) {
      setToastMessage({
        type: 'info',
        text: 'Nenhuma das despesas selecionadas pode ser reaberta (as conferidas com o banco devem ser desconciliados na Conciliação Bancária).'
      });
      return;
    }
    setReopenModalState({
      isOpen: true,
      titles: targetTitles
    });
  };

  // Requisito: A conciliação só pode ser marcada ou desfeita através da tela de conciliação bancária
  const handleToggleSingleReconciled = (title: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setToastMessage({
      type: 'info',
      text: title.reconciliationStatus === 'CONCILIADO' || title.reconciledViaBank
        ? `🔒 Título #${title.titleNumber} conciliado via banco. A conciliação só pode ser desfeita na tela de Conciliação Bancária.`
        : `ℹ️ Para conciliar este título com o extrato bancário, utilize o módulo de Conciliação Bancária.`
    });
  };

  // Informativo de conciliação em lote
  const handleBatchToggleReconciled = () => {
    setToastMessage({
      type: 'info',
      text: 'ℹ️ A conciliação bancária deve ser realizada de forma segura na tela de Conciliação Bancária confrontando os lançamentos com o extrato bancário.'
    });
  };

  // Execução após confirmação no modal
  const handleExecuteConfirmedAction = () => {
    const { mode, titles: targetTitles } = confirmModalState;
    const ids = targetTitles.length > 0 ? targetTitles.map(t => t.id) : selectedIds;
    if (ids.length === 0) {
      setConfirmModalState({ isOpen: false, mode: 'DELETE', titles: [] });
      return;
    }

    if (mode === 'DELETE') {
      const res = storage.batchDeleteTitles(ids);
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
      setConfirmModalState({ isOpen: false, mode: 'DELETE', titles: [] });
      setRefreshKey(k => k + 1);
      setToastMessage({
        type: 'success',
        text: `${res.deletedCount} despesa(s) excluída(s) com sucesso!${res.affectedSettlements > 0 ? ` (${res.affectedSettlements} pagamento(s) estornado(s))` : ''}`
      });
    } else {
      const res = storage.batchCancelTitles(ids);
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
      setConfirmModalState({ isOpen: false, mode: 'CANCEL', titles: [] });
      setRefreshKey(k => k + 1);
      setToastMessage({
        type: res.cancelledCount > 0 ? 'success' : 'info',
        text: `${res.cancelledCount} despesa(s) cancelada(s) com sucesso.${res.ignoredCount > 0 ? ` (${res.ignoredCount} ignorados por possuírem baixas ou já cancelados)` : ''}`
      });
    }
  };

  const handleExportExcel = () => {
    const headers = ['Título', 'Fornecedor', 'Descrição', 'Competência', 'Emissão', 'Vencimento', 'Previsão Caixa', 'Valor Original', 'Principal Baixado', 'Saldo Atual', 'Situação'];
    const rows = filteredTitles.map(t => {
      const supplier = counterparties.find(c => c.id === t.counterpartyId);
      return [
        t.titleNumber,
        supplier?.name || 'Fornecedor',
        t.description,
        t.competence,
        t.issueDate,
        t.dueDate,
        t.expectedCashDate || t.dueDate,
        t.originalAmount,
        t.settledPrincipal,
        t.balancePrincipal,
        t.documentState === 'CANCELADO' ? 'CANCELADO' : t.settlementState
      ];
    });
    exportToExcel(`contas-a-pagar-${today}`, 'Contas a Pagar', headers, rows);
  };

  const handleExportCSV = () => {
    const headers = ['Título', 'Fornecedor', 'Descrição', 'Competência', 'Emissão', 'Vencimento', 'Previsão Caixa', 'Valor Original', 'Saldo Atual', 'Situação'];
    const rows = filteredTitles.map(t => {
      const supplier = counterparties.find(c => c.id === t.counterpartyId);
      return [
        t.titleNumber,
        supplier?.name || 'Fornecedor',
        t.description,
        t.competence,
        t.issueDate,
        t.dueDate,
        t.expectedCashDate || t.dueDate,
        t.originalAmount,
        t.balancePrincipal,
        t.settlementState
      ];
    });
    exportToCSV(`contas-a-pagar-${today}`, headers, rows);
  };

  const handleExportSelectedExcel = () => {
    if (selectedIds.length === 0) return;
    const targetTitles = titles.filter(t => selectedIds.includes(t.id));
    const headers = ['Título', 'Fornecedor', 'Descrição', 'Competência', 'Emissão', 'Vencimento', 'Previsão Caixa', 'Valor Original', 'Principal Baixado', 'Saldo Atual', 'Situação'];
    const rows = targetTitles.map(t => {
      const supplier = counterparties.find(c => c.id === t.counterpartyId);
      return [
        t.titleNumber,
        supplier?.name || 'Fornecedor',
        t.description,
        t.competence,
        t.issueDate,
        t.dueDate,
        t.expectedCashDate || t.dueDate,
        t.originalAmount,
        t.settledPrincipal,
        t.balancePrincipal,
        t.documentState === 'CANCELADO' ? 'CANCELADO' : t.settlementState
      ];
    });
    exportToExcel(`lote-pagar-selecionados-${today}`, 'Lote Selecionado', headers, rows);
    setToastMessage({
      type: 'success',
      text: `${targetTitles.length} despesas exportadas para o Excel!`
    });
  };

  const handleCancelTitle = (t: FinancialTitle) => {
    handleOpenSingleCancel(t);
  };

  const openBalanceTotal = filteredTitles.filter(t => t.documentState !== 'CANCELADO').reduce((acc, t) => acc + t.balancePrincipal, 0);

  return (
    <div className="space-y-6">
      
      <PageToolbar description="Despesas, fornecedores, impostos, salários e pagamentos.">
        <MoreMenu
          attention={duplicateCandidates.length > 0}
          items={[
            {
              label: 'Limpeza de duplicidades',
              icon: <Sparkles className="w-4 h-4" />,
              onClick: () => setIsDedupModalOpen(true),
              badge: duplicateCandidates.length > 0 ? duplicateCandidates.length : undefined,
              hint: 'Encontra contas repetidas (mesmo vencimento, valor e descrição)'
            },
            { label: 'Exportar para Excel', icon: <FileSpreadsheet className="w-4 h-4" />, onClick: handleExportExcel },
            { label: 'Exportar para CSV', icon: <Download className="w-4 h-4" />, onClick: handleExportCSV }
          ]}
        />
        <Button
          variant="secondary"
          icon={<Upload className="w-4 h-4" />}
          onClick={() => setIsImportModalOpen(true)}
          title="Importar contas a pagar de planilha externa"
        >
          Importar
        </Button>
        <Button
          variant="secondary"
          icon={<Barcode className="w-4 h-4" />}
          onClick={() => setIsBoletoModalOpen(true)}
          title="Reconhecimento e baixa automática em lote por linha digitável ou boleto"
        >
          Baixar boletos
        </Button>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => onOpenNewTitleModal('PAGAR')}>
          Novo pagamento
        </Button>
      </PageToolbar>

      {/* Indicadores (também funcionam como filtros rápidos) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatTile
          label="Em aberto" icon={<TWallet />} accent="info"
          value={formatBRL(stats.openTotal)}
          hint="Total a pagar"
          count={stats.openCount}
          active={quickDateFilter === 'ALL' && statusFilter === 'ABERTO'}
          onClick={() => {
            setQuickDateFilter('ALL');
            setStatusFilter('ABERTO');
          }}
        />
        <StatTile
          label="Vence hoje" icon={<TClock />} accent="gold"
          value={formatBRL(stats.hojeTotal)}
          hint="Vencendo hoje"
          count={stats.hojeCount}
          active={quickDateFilter === 'HOJE'}
          onClick={() => setQuickDateFilter(prev => (prev === 'HOJE' ? 'ALL' : 'HOJE'))}
        />
        <StatTile
          label="Esta semana" icon={<TCalendar />} accent="info"
          value={formatBRL(stats.semanaTotal)}
          hint="Até domingo"
          count={stats.semanaCount}
          active={quickDateFilter === 'ESTA_SEMANA'}
          onClick={() => setQuickDateFilter(prev => (prev === 'ESTA_SEMANA' ? 'ALL' : 'ESTA_SEMANA'))}
        />
        <StatTile
          label="Vencidos" icon={<TAlert />} accent="danger"
          value={formatBRL(stats.vencidosTotal)}
          hint="Em atraso"
          count={stats.vencidosCount}
          tone={stats.vencidosTotal > 0 ? 'danger' : 'neutral'}
          active={quickDateFilter === 'VENCIDO'}
          onClick={() => setQuickDateFilter(prev => (prev === 'VENCIDO' ? 'ALL' : 'VENCIDO'))}
        />
        <div className="col-span-2 lg:col-span-1">
          <StatTile
            label="Pagos" icon={<TCheck />} accent="success"
            value={formatBRL(stats.liquidadosTotal)}
            hint="Já liquidados"
            count={stats.liquidadosCount}
            active={quickDateFilter === 'LIQUIDADO' || statusFilter === 'LIQUIDADO'}
            onClick={() => {
              setQuickDateFilter(prev => (prev === 'LIQUIDADO' ? 'ALL' : 'LIQUIDADO'));
              setStatusFilter('LIQUIDADO');
            }}
          />
        </div>
      </div>

      {/* Filtros: ficam suspensos e guardam a escolha ao trocar de aba */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <FilterChipSelect
            label="Situação"
            value={statusFilter}
            allValue="__nenhum__"
            allLabel="Mostrar tudo"
            showValue
            options={[
              { value: 'ABERTO', label: `Em aberto (${stats.openCount})` },
              { value: 'VENCIDO', label: `Atrasadas (${stats.vencidosCount})` },
              { value: 'LIQUIDADO', label: `Pagas (${stats.liquidadosCount})` },
              ...(simple ? [] : [{ value: 'CONCILIADO', label: `Conciliadas (${stats.conciliadosCount})` }]),
              { value: 'TODOS', label: `Todas (${stats.todosCount})` },
              { value: 'CANCELADO', label: `Canceladas (${stats.canceladosCount})` }
            ]}
            onChange={v => {
              if (v === '__nenhum__') return;
              setStatusFilter(v as any);
              setQuickDateFilter('ALL');
            }}
          />
          <FilterChipSelect
            label="Vencimento"
            value={quickDateFilter}
            allLabel="Todos"
            options={[{ value: 'HOJE', label: 'Vence hoje' }, { value: 'ESTA_SEMANA', label: 'Esta semana' }, { value: 'ESTE_MES', label: 'Este mês' }, { value: 'VENCIDO', label: 'Atrasados' }]}
            onChange={v => setQuickDateFilter(v as any)}
          />
          <FilterChipSelect
            label="Fornecedor"
            value={counterpartyFilter}
            allLabel="Todos"
            options={counterparties.filter(Boolean).map(c => ({ value: c.id, label: c.name }))}
            onChange={setCounterpartyFilter}
          />
          <FilterChipAmount min={minAmount} max={maxAmount} onChange={(lo, hi) => { setMinAmount(lo); setMaxAmount(hi); }} />
          <button
            type="button"
            onClick={() => setShowMoreFilters(v => !v)}
            className="adv-only h-10 px-3.5 rounded-xl border border-[var(--border-highlight)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
          >
            {showMoreFilters ? 'Menos filtros' : 'Mais filtros'}
          </button>
          <div className="relative w-full sm:w-72 sm:ml-auto">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por fornecedor, documento ou descrição"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-[var(--border-highlight)]"
            />
          </div>
        </div>

        {showMoreFilters && (
          <div className="adv-only">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl">
          <div className="adv-only">
            <FieldLabel>Plano de contas</FieldLabel>
            <PremiumSelect
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              sheetTitle="Plano de contas"
              className="w-full h-10 px-3 text-sm"
            >
              <option value="ALL">Todas as despesas ({categoryStats.totalTitlesInPeriod} no período)</option>
              {categoryStats.unclassifiedCount > 0 && (
                <option value="SEM_CATEGORIA">
                  Sem categoria ({categoryStats.unclassifiedCount} títulos • {formatBRL(categoryStats.unclassifiedTotal)})
                </option>
              )}
              {categoryStats.inPeriodCosts.length > 0 && (
                <optgroup label="Custos da operação no período (CSP/CPV)">
                  {categoryStats.inPeriodCosts.map(({ account, count, totalAmount }) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name} ({count} títulos • {formatBRL(totalAmount)})
                    </option>
                  ))}
                </optgroup>
              )}
              {categoryStats.inPeriodExpenses.length > 0 && (
                <optgroup label="Despesas operacionais no período">
                  {categoryStats.inPeriodExpenses.map(({ account, count, totalAmount }) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name} ({count} títulos • {formatBRL(totalAmount)})
                    </option>
                  ))}
                </optgroup>
              )}
              {categoryStats.otherCosts.length > 0 && (
                <optgroup label="Custos da operação (plano de contas)">
                  {categoryStats.otherCosts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {categoryStats.otherExpenses.length > 0 && (
                <optgroup label="Despesas operacionais (plano de contas)">
                  {categoryStats.otherExpenses.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </PremiumSelect>
          </div>


          <div className="adv-only">
            <FieldLabel>Conta bancária</FieldLabel>
            <PremiumSelect
              value={bankFilter}
              onChange={e => setBankFilter(e.target.value)}
              sheetTitle="Conta bancária"
              className="w-full h-10 px-3 text-sm"
            >
              <option value="ALL">Todas as contas</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.institution || b.type})
                </option>
              ))}
            </PremiumSelect>
          </div>

          <div className="adv-only">
            <FieldLabel>Origem do título</FieldLabel>
            <PremiumSelect
              value={originFilter}
              onChange={e => setOriginFilter(e.target.value as any)}
              sheetTitle="Origem do título"
              className="w-full h-10 px-3 text-sm"
            >
              <option value="ALL">Todas as origens</option>
              <option value="CARTAO_CREDITO">Cartão de crédito</option>
              <option value="CONTRATO">Contratos e recorrências</option>
              <option value="OUTROS">Boletos e despesas manuais</option>
            </PremiumSelect>
          </div>
          </div>
          </div>
        )}

        {(hasActiveFilters || categoryFilter !== 'ALL') && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-sm text-[var(--text-secondary)]">
              {filteredTitles.length} lançamento(s) •{' '}
              <span className="tabular-nums">
                {formatBRL(filteredTitles.reduce((acc, t) => acc + (t.balancePrincipal || t.originalAmount || 0), 0))}
              </span>
              {categoryFilter !== 'ALL' && (
                <span className="text-[var(--text-muted)]">
                  {' '}
                  em{' '}
                  {categoryFilter === 'SEM_CATEGORIA'
                    ? 'sem categoria'
                    : (() => {
                        const acc = chartAccounts.find(a => a.id === categoryFilter);
                        return acc ? `${acc.code} - ${acc.name}` : categoryFilter;
                      })()}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              {categoryFilter !== 'ALL' && filteredTitles.length > 0 && (
                <Button
                  variant="secondary"
                  className="h-9"
                  title="Selecionar todos os títulos filtrados para classificar ou editar em lote"
                  onClick={() => {
                    setSelectedIds(filteredTitles.map(t => t.id));
                    setToastMessage({
                      type: 'info',
                      text: `${filteredTitles.length} despesas desta categoria selecionadas! Você pode classificá-los em lote usando a barra de ações.`
                    });
                  }}
                >
                  Selecionar todos ({filteredTitles.length})
                </Button>
              )}
              {hasActiveFilters && (
                <Button variant="ghost" className="h-9" icon={<RotateCcw className="w-4 h-4" />} onClick={handleClearFilters} title="Limpar todos os filtros">
                  Limpar filtros
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Payables Period Navigator (Vencimento) */}
      <ModulePeriodNavigator
        moduleType="PAYABLES"
        titlePrefix="Vencimentos a Pagar em"
        filterSubtitle="Filtro estrito por Vencimento"
        matchedCount={filteredTitles.length}
        totalCount={titles.length}
      />

      {/* Batch Actions Toolbar */}
      {selectedIds.length > 0 && (() => {
        const selectedTitles = titles.filter(t => selectedIds.includes(t.id));
        const hasClosedInSelection = selectedTitles.some(t => FinancialEngine.isPeriodClosed(t.competence));
        const totalSelectedBalance = selectedTitles.reduce((acc, t) => acc + t.balancePrincipal, 0);
        const settledCountInSelection = selectedTitles.filter(t => t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL').length;

        return (
          <div className="fixed bottom-16 inset-x-3 z-40 sm:static sm:inset-auto bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white p-3 sm:p-3.5 rounded-2xl sm:rounded-xl border border-rose-800 shadow-2xl sm:shadow-xl flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-3 animate-in slide-in-from-bottom sm:slide-in-from-top duration-200">
            {/* Header / Info counter */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  {selectedIds.length}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-xs flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{selectedIds.length} obrigação(ões)</span>
                    {hasClosedInSelection && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-normal">
                        <Lock className="w-3 h-3" /> Travada
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-rose-200 truncate">
                    Saldo: <strong>{formatBRL(totalSelectedBalance)}</strong>
                  </div>
                </div>
              </div>

              {/* Botão Desmarcar no mobile */}
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="sm:hidden min-h-[40px] px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-white/10 active:bg-white/20 rounded-xl cursor-pointer shrink-0 font-medium flex items-center justify-center"
              >
                Desmarcar
              </button>
            </div>

            {/* Ações em Lote: Primária em destaque + Secundárias em carrossel horizontal suave */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none flex-nowrap pb-0.5 touch-pan-x">
              {/* Baixar em Lote (Ação Primária com destaque e >= 44px) */}
              <button
                type="button"
                onClick={() => setIsBatchSettlementOpen(true)}
                className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center cursor-pointer shrink-0"
                title="Liquidar e amortizar os títulos selecionados em lote"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                Baixar em Lote
              </button>

              {/* Voltar para Em Aberto em Lote */}
              {settledCountInSelection > 0 && (
                <button
                  type="button"
                  onClick={handleOpenBatchReopen}
                  className="min-h-[44px] px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center cursor-pointer shrink-0 animate-in fade-in"
                  title="Estornar os pagamentos e voltar as obrigações selecionadas para EM ABERTO"
                >
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Voltar para Aberto ({settledCountInSelection})
                </button>
              )}

              {/* Conciliar Banco em Lote */}
              <button
                type="button"
                onClick={handleBatchToggleReconciled}
                className="min-h-[44px] px-3.5 py-2 bg-teal-700 hover:bg-teal-600 active:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center cursor-pointer shrink-0"
                title="Marcar ou desmarcar conciliação bancária dos títulos selecionados"
              >
                <CheckCheck className="w-4 h-4 mr-1.5 text-teal-300" />
                Conciliar Banco
              </button>

              {/* Prorrogar Vencimento em Lote */}
              <button
                type="button"
                onClick={() => setIsBatchPostponeOpen(true)}
                className="min-h-[40px] px-3 py-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center cursor-pointer shrink-0"
                title="Prorrogar vencimentos dos títulos selecionados (+7, +15, +30 dias)"
              >
                <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                Prorrogar
              </button>

              {/* Exportar Lote */}
              <button
                type="button"
                onClick={handleExportSelectedExcel}
                className="min-h-[40px] px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-semibold border border-white/20 transition-colors flex items-center cursor-pointer shrink-0"
                title="Exportar apenas os títulos selecionados para planilha Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                Exportar
              </button>

              {/* Alteração em Massa */}
              <button
                type="button"
                onClick={() => setIsBatchEditOpen(true)}
                className="min-h-[40px] px-3 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                Em Massa
              </button>

              {/* Duplicar */}
              <button
                type="button"
                onClick={() => handleBatchDuplicate(false)}
                className="min-h-[40px] px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-medium border border-white/20 transition-colors flex items-center cursor-pointer shrink-0"
                title="Copiar as despesas selecionadas"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copiar
              </button>

              {/* Duplicar (+1 Mês) */}
              <button
                type="button"
                onClick={() => handleBatchDuplicate(true)}
                className="min-h-[40px] px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-medium border border-white/20 transition-colors flex items-center cursor-pointer shrink-0"
                title="Copiar para o mês seguinte"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
                +1 Mês
              </button>

              {/* Cancelar */}
              <button
                type="button"
                onClick={handleOpenBatchCancel}
                className="min-h-[40px] px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center cursor-pointer shrink-0"
                title="Alterar a situação das obrigações selecionadas para CANCELADO"
              >
                <Ban className="w-3.5 h-3.5 mr-1 text-amber-400" />
                Cancelar
              </button>

              {/* Excluir */}
              <button
                type="button"
                onClick={handleOpenBatchDelete}
                className="min-h-[40px] px-3 py-2 bg-rose-700/70 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold border border-rose-500/40 transition-colors flex items-center cursor-pointer shrink-0"
                title="Excluir permanentemente as obrigações selecionadas do sistema"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Excluir
              </button>

              {/* Desmarcar desktop */}
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="hidden sm:inline-flex min-h-[40px] px-3 py-2 text-xs text-slate-300 hover:text-white cursor-pointer items-center shrink-0 font-medium"
              >
                Desmarcar
              </button>
            </div>
          </div>
        );
      })()}

      {/* Summary Banner */}
      <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 px-4 py-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
        <span className="text-rose-900 dark:text-rose-200 flex items-center flex-wrap gap-1">
          <span>Listando <strong>{filteredTitles.length}</strong> obrigações a pagar.</span>
          <span className="hidden sm:inline ml-2 text-[11px] text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">
            💡 Dica: Duplo clique em qualquer linha para editar o lançamento
          </span>
          <span className="sm:hidden text-[10px] text-rose-700 dark:text-rose-300 font-medium">
            👆 Toque para detalhes • ↔ Deslize para a direita para Pagar ou esquerda para Editar
          </span>
        </span>
        <span className="text-rose-950 dark:text-rose-100 font-bold text-xs sm:text-sm">
          Saldo em Aberto a Pagar: {formatBRL(openBalanceTotal)}
        </span>
      </div>

      {/* Mobile View: Cards Expansíveis (Descrição, Data de Vencimento e Valor; clique na linha expande o restante) */}
      <div className={`block md:hidden space-y-2.5 ${selectedIds.length > 0 ? 'pb-28 sm:pb-0' : ''}`}>
        {sortedTitles.length === 0 ? (
          <div className="bg-white dark:bg-[#1b1b20] p-8 rounded-xl border border-slate-200 dark:border-[#26262b] text-center text-slate-600 dark:text-slate-300 text-xs shadow-2xs">
            Nenhuma despesa encontrada com esses filtros.
          </div>
        ) : (
          sortedTitles.map(t => {
            if (!t) return null;
            const supplier = counterparties.find(c => c && c.id === t.counterpartyId);
            const tempStatus = getTemporalStatus(t, today);
            const isSelected = selectedIds.includes(t.id);
            const isExpanded = !!expandedMobileIds[t.id];
            const balance = Number(t.balancePrincipal) || 0;
            const titleDueDate = t.dueDate || today;
            const chartAcc = chartAccounts.find(a => a && (a.id === t.accountId || a.id === t.chartAccountId));
            const bank = bankAccounts.find(b => b.id === t.bankAccountId);

            // Days diff for visual indicator
            let diffDays = 0;
            try {
              const dueDateObj = new Date(titleDueDate + 'T00:00:00');
              const todayObj = new Date(today + 'T00:00:00');
              diffDays = Math.ceil((dueDateObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24));
            } catch {
              diffDays = 0;
            }

            const isOverdue = balance > 0 && (diffDays < 0 || titleDueDate < today);
            const isNearDue = balance > 0 && !isOverdue && !isNaN(diffDays) && diffDays <= 3;

            let cardBorder = 'border-slate-200 dark:border-[#26262b]';
            let cardBg = 'bg-white dark:bg-[#1b1b20]';
            if (t.documentState === 'CANCELADO') {
              cardBg = 'bg-slate-50 dark:bg-slate-900/40 opacity-60';
              cardBorder = 'border-slate-200 dark:border-slate-800';
            } else if (isOverdue) {
              cardBg = 'bg-rose-50/40 dark:bg-rose-950/20';
              cardBorder = 'border-rose-300 dark:border-rose-800/60 ring-1 ring-rose-300/40';
            } else if (isNearDue) {
              cardBg = 'bg-amber-50/40 dark:bg-amber-950/20';
              cardBorder = 'border-amber-300 dark:border-amber-800/60 ring-1 ring-amber-300/40';
            } else if (t.settlementState === 'LIQUIDADO') {
              cardBg = 'bg-emerald-50/20 dark:bg-emerald-950/20';
              cardBorder = 'border-emerald-200 dark:border-emerald-800/50';
            }

            if (isSelected) {
              cardBg = 'bg-rose-100/60 dark:bg-rose-950/40';
              cardBorder = 'border-rose-400 dark:border-rose-600';
            }

            const canSettle = t.balancePrincipal > 0 && t.documentState !== 'CANCELADO';

            return (
              <SwipeableCard
                key={t.id}
                onSwipeRight={canSettle ? () => setSelectedTitleForSettlement(t) : undefined}
                rightLabel="Pagar"
                onSwipeLeft={() => handleStartEditTitle(t)}
                leftLabel="Editar"
              >
                <div 
                  className={`rounded-xl border shadow-2xs overflow-hidden transition-all ${cardBg} ${cardBorder}`}
                >
                {/* Linha Principal Mobile: Status, Fornecedor, Descrição, Data e Valor Imediatos */}
                <div 
                  onClick={() => toggleExpandMobile(t.id)}
                  className="p-3.5 cursor-pointer select-none active:bg-slate-100/60 dark:active:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    
                    {/* Checkbox com Tap Target >= 40px */}
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSelectOne(t.id, e as any);
                      }}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center -m-2 cursor-pointer shrink-0 pt-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded border-slate-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4 bg-white dark:bg-slate-800"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Badge Temporal e Categoria Imediatos */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {balance > 0 && t.documentState !== 'CANCELADO' && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isOverdue
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                              : isNearDue
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}>
                            {isOverdue ? 'Vencido' : isNearDue ? 'Vence Hoje' : 'Em dia'}
                          </span>
                        )}
                        {t.documentState === 'CANCELADO' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            Cancelado
                          </span>
                        )}
                        {t.settlementState === 'LIQUIDADO' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Pago
                          </span>
                        )}
                        {/* Ícone de Conciliação Bancária com Dois Vistinhos */}
                        {t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank ? (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-2xs select-none"
                            title={`Conciliado com o Extrato Bancário${t.reconciliationNote ? `: ${t.reconciliationNote}` : ''}. Para desconciliar, utilize a tela de Conciliação Bancária.`}
                          >
                            <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
                            <span>Conciliado</span>
                          </span>
                        ) : t.settlementState === 'LIQUIDADO' ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleSingleReconciled(t, e)}
                            className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/50 dark:border-amber-500/40 flex items-center gap-1 cursor-pointer shadow-2xs hover:bg-amber-500/25 transition-colors"
                            title="Baixado manualmente no ERP, aguardando conciliação bancária."
                          >
                            <HandCoins className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 stroke-[2.2]" />
                            <span>Baixado Manual (Pendente Banco)</span>
                          </button>
                        ) : null}
                        {t.settlementState === 'PARCIAL' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHistoryTitle(t);
                            }}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/80 cursor-pointer flex items-center gap-1 transition-colors"
                            title="Título com baixa parcial. Clique para ver extratos e comprovantes vinculados."
                          >
                            <Clock className="w-2.5 h-2.5 text-amber-600" />
                            <span>Parcial (Restante: {formatBRL(t.balancePrincipal)})</span>
                          </button>
                        )}
                        {(t.originType === 'CONTRATO' || (t.titleNumber && t.titleNumber.startsWith('FAT-')) || t.contractNumber) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            🏷️ Contrato {t.contractNumber || ''}
                          </span>
                        )}
                        {t.originType === 'RECORRENCIA_PAGAR' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                            🏷️ Recorrência
                          </span>
                        )}
                      </div>

                      {/* Fornecedor / Favorecido em Destaque */}
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm leading-snug">
                        {supplier?.name || supplier?.tradeName || 'Fornecedor não especificado'}
                      </div>

                      {/* Descrição em Destaque: maior, legível e com quebra de linha natural */}
                      <div className="text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-semibold break-words whitespace-normal leading-snug mt-1">
                        {t.description || 'Sem descrição informada'}
                      </div>

                      {/* Categoria do Plano de Contas (apenas nome com cor temática) e Código do Documento */}
                      {(() => {
                        const catColors = getAccountBadgeColorClasses(chartAcc);
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span 
                              title={`Categoria Contábil: ${formatAccountNameWithoutCode(chartAcc)}`}
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border max-w-[220px] truncate ${catColors.container}`}
                            >
                              <Folder className={`w-3 h-3 ${catColors.icon} shrink-0`} />
                              <span className="truncate">{formatAccountNameWithoutCode(chartAcc)}</span>
                            </span>
                            <span className="adv-only font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
                              #{t.titleNumber}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Data de Vencimento com Ícone */}
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        <span>Vencimento:</span>
                        <strong className={isOverdue ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-800 dark:text-slate-200'}>
                          {formatDateBR(t.dueDate)}
                        </strong>
                      </div>
                    </div>

                    {/* Valor em Destaque + Toggle Indicator */}
                    <div className="text-right shrink-0 flex flex-col items-end justify-between self-stretch">
                      <div className="font-extrabold font-mono text-rose-600 dark:text-rose-400 text-sm sm:text-base leading-tight">
                        {formatBRL(balance > 0 ? balance : t.originalAmount)}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-auto pt-2 font-medium">
                        <span>{isExpanded ? 'recolher' : 'detalhes'}</span>
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                        )}
                      </div>
                    </div>

                  </div>
                </div>

                {/* Conteúdo Expandido ao Clicar na Linha */}
                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-[#26262b] bg-slate-50/90 dark:bg-[#131316]/90 p-3.5 space-y-3 text-xs">
                    
                    {/* Status e Situação */}
                    <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-slate-200 dark:border-slate-800">
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Situação:</span>
                      {balance > 0 && t.documentState !== 'CANCELADO' && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isOverdue
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : isNearDue
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}>
                          {isOverdue ? 'Vencido' : isNearDue ? 'Vence Hoje' : 'Em dia'}
                        </span>
                      )}
                      {t.documentState === 'CANCELADO' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          Cancelado
                        </span>
                      )}
                      {t.settlementState === 'LIQUIDADO' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Pago
                        </span>
                      )}
                      {t.settlementState === 'PARCIAL' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          Parcialmente Baixado
                        </span>
                      )}
                    </div>

                    {/* Grade de Detalhes Secundários */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Fornecedor / Favorecido</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100 block truncate">
                          {supplier?.name || 'Fornecedor não especificado'}
                        </span>
                        {supplier?.document && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">{supplier.document}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Nº Documento / Título</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-medium text-slate-800 dark:text-slate-200 block truncate">
                            {t.titleNumber || 'Sem código'}
                          </span>
                          {t.barcode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(t.barcode || '');
                                setToastMessage({ text: 'Linha digitável do boleto copiada!', type: 'success' });
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 cursor-pointer"
                            >
                              <Barcode className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                              <span>Boleto</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Competência</span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200 block">
                          {formatCompetenceShort(t.competence)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Previsão Caixa</span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium block">
                          {formatDateBR(t.expectedCashDate || t.dueDate)}
                        </span>
                      </div>

                      {chartAcc && (
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Plano de Contas</span>
                          <span className="text-slate-800 dark:text-slate-200 font-medium block truncate">
                            {chartAcc.code} - {chartAcc.name}
                          </span>
                        </div>
                      )}

                      {bank && (
                        <div>
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Conta Bancária</span>
                          <span className="text-slate-800 dark:text-slate-200 font-medium block truncate">
                            {bank.name}
                          </span>
                        </div>
                      )}

                      {t.originType === 'CARTAO_CREDITO' && (
                        <div className="col-span-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700">
                            <CreditCard className="w-3 h-3 text-amber-500" />
                            Lançamento via Cartão de Crédito
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Resumo Financeiro */}
                    <div className="bg-white dark:bg-[#1b1b20] p-2.5 rounded-lg border border-slate-200 dark:border-[#26262b] flex justify-between items-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Valor Original</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{formatBRL(t.originalAmount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Principal Baixado</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatBRL(t.settledPrincipal || 0)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Saldo Restante</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">{formatBRL(t.balancePrincipal)}</span>
                      </div>
                    </div>

                    {/* Ações Rápidas Mobile */}
                    <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex flex-wrap gap-2 items-center">
                      {t.balancePrincipal > 0 && t.documentState !== 'CANCELADO' && (
                        <button
                          type="button"
                          onClick={() => setSelectedTitleForSettlement(t)}
                          className="min-h-[42px] flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Pagar</span>
                        </button>
                      )}

                      {(t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL') && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenSingleReopen(t, e)}
                          disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                          className={`min-h-[42px] flex-1 py-2.5 px-4 rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors ${
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white cursor-pointer'
                          }`}
                          title={
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'Bloqueado: Título conciliado via banco. Desfaça a conciliação na tela de Conciliação Bancária antes de estornar.'
                              : 'Voltar obrigação para EM ABERTO (Estornar pagamento)'
                          }
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Voltar Aberto</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStartEditTitle(t)}
                        disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                        className={`min-h-[40px] min-w-[40px] py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors ${
                          t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                            ? 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                            : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer'
                        }`}
                        title={
                          t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                            ? 'Bloqueado: Título conciliado via banco não pode ser editado. Desfaça a conciliação na tela de Conciliação Bancária.'
                            : 'Editar obrigação'
                        }
                      >
                        <Edit3 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDuplicateOne(t, e)}
                        className="min-h-[40px] min-w-[40px] py-2 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        title="Copiar despesa"
                      >
                        <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>Copiar</span>
                      </button>

                      {t.balancePrincipal > 0 && t.documentState !== 'CANCELADO' && (
                        <button
                          type="button"
                          onClick={(e) => handleTriggerWhatsApp(t, e)}
                          className="min-h-[40px] min-w-[40px] p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs shadow-2xs flex items-center justify-center cursor-pointer"
                          title="Enviar aviso/notificação via WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setHistoryTitle(t)}
                        className="min-h-[40px] min-w-[40px] p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs shadow-2xs flex items-center justify-center cursor-pointer"
                        title="Ver histórico de pagamentos"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {t.balancePrincipal === t.originalAmount && t.documentState !== 'CANCELADO' && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenSingleCancel(t, e)}
                          disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                          className={`min-h-[40px] min-w-[40px] p-2 rounded-xl text-xs shadow-2xs flex items-center justify-center transition-colors ${
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                              : 'bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-600/50 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 cursor-pointer'
                          }`}
                          title={
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'Bloqueado: Título conciliado via banco não pode ser cancelado.'
                              : 'Cancelar obrigação'
                          }
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleOpenSingleDelete(t, e)}
                        disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                        className={`min-h-[40px] min-w-[40px] p-2 rounded-xl text-xs shadow-2xs flex items-center justify-center transition-colors ${
                          t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                            ? 'bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                            : 'bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-600/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 cursor-pointer'
                        }`}
                        title={
                          t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                            ? 'Bloqueado: despesa já conferida com o banco não pode ser excluída.'
                            : 'Excluir definitivamente'
                        }
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                  </div>
                )}
              </div>
            </SwipeableCard>
          );
          })
        )}
      </div>

      {/* Payables Table (Desktop & Tablets) */}
      <div className="hidden md:block bg-white dark:bg-[#131316] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-200/90 dark:bg-[#131316] border-b-2 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-bold uppercase tracking-wider select-none">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleToggleSelectAll}
                    className="text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors cursor-pointer"
                    title={isAllSelected ? "Desmarcar todos" : "Selecionar todas as obrigações da lista"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    )}
                  </button>
                </th>

                {/* Título / Documento */}
                <th 
                  className="py-3 px-4 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('titleNumber')}
                  title="Clique para ordenar por Documento/Descrição"
                >
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Descrição / Documento</span>
                    {sortField === 'titleNumber' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Fornecedor / Favorecido */}
                <th 
                  className="py-3 px-4 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('counterparty')}
                  title="Clique para ordenar por Fornecedor (Ordem Alfabética)"
                >
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Fornecedor / Favorecido</span>
                    {sortField === 'counterparty' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Competência (Adaptativo: oculto em notebooks compactos, visível em Mac/Desktops) */}
                <th 
                  className="adv-only hidden xl:table-cell py-3 px-4 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('competence')}
                  title="Clique para ordenar por Competência"
                >
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Competência</span>
                    {sortField === 'competence' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Vencimento */}
                <th 
                  className="py-3 px-4 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('dueDate')}
                  title="Clique para ordenar por Data de Vencimento"
                >
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Vencimento</span>
                    {sortField === 'dueDate' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Previsão Caixa (Adaptativo: visível em monitores 2K/Grandes) */}
                <th 
                  className="adv-only hidden 2xl:table-cell py-3 px-4 cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('expectedCashDate')}
                  title="Clique para ordenar por Data de Previsão de Pagamento"
                >
                  <div className="flex items-center space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Previsão Caixa</span>
                    {sortField === 'expectedCashDate' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Valor Original */}
                <th 
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('originalAmount')}
                  title="Clique para ordenar por Valor Original"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Valor Original</span>
                    {sortField === 'originalAmount' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Saldo Restante */}
                <th 
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('balancePrincipal')}
                  title="Clique para ordenar por Saldo Restante"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Saldo Restante</span>
                    {sortField === 'balancePrincipal' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Situação Temporal (Adaptativo: oculto em notebooks, visível em Mac/Desktops) */}
                <th className="adv-only hidden xl:table-cell py-3 px-4 text-center text-slate-900 dark:text-slate-100 font-bold">
                  Situação Temporal
                </th>

                {/* Status */}
                <th 
                  className="py-3 px-4 text-center cursor-pointer hover:bg-slate-300/60 dark:hover:bg-slate-800/60 transition-colors text-slate-900 dark:text-slate-100 font-bold"
                  onClick={() => handleSort('status')}
                  title="Clique para ordenar por Status"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span className="text-slate-900 dark:text-slate-100 font-bold">Status</span>
                    {sortField === 'status' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" /> : <ArrowDown className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                    )}
                  </div>
                </th>

                <th className="py-3 px-4 text-right text-slate-900 dark:text-slate-100 font-bold">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTitles.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-700">
                    Nenhuma despesa encontrada com esses filtros.
                  </td>
                </tr>
              ) : (
                sortedTitles.map(t => {
                  if (!t) return null;
                  const supplier = counterparties.find(c => c && c.id === t.counterpartyId);
                  const tempStatus = getTemporalStatus(t, today);
                  const isSelected = selectedIds.includes(t.id);
                  const balance = Number(t.balancePrincipal) || 0;
                  const titleDueDate = t.dueDate || today;
                  const chartAcc = chartAccounts.find(a => a && (a.id === t.accountId || a.id === t.chartAccountId));
                  const categoryName = formatAccountNameWithoutCode(chartAcc);

                  // Days diff for visual indicator safely
                  let diffDays = 0;
                  try {
                    const dueDateObj = new Date(titleDueDate + 'T00:00:00');
                    const todayObj = new Date(today + 'T00:00:00');
                    diffDays = Math.ceil((dueDateObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24));
                  } catch {
                    diffDays = 0;
                  }

                  // Row status styling: Red (Overdue), Yellow (Near due 0-3 days), Clean (On time)
                  let rowColorClass = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800/60';
                  if (t.documentState === 'CANCELADO') {
                    rowColorClass = 'opacity-50 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/60';
                  } else if (balance > 0) {
                    if (diffDays < 0 || titleDueDate < today) {
                      // Overdue - Red alert (suave e legível em ambos os temas)
                      rowColorClass = 'bg-rose-50/75 hover:bg-rose-100/80 border-l-4 border-l-rose-500 text-rose-950 dark:bg-rose-950/25 dark:hover:bg-rose-950/45 dark:border-l-rose-500 dark:text-rose-100 font-medium border-b border-slate-100 dark:border-slate-800/60';
                    } else if (!isNaN(diffDays) && diffDays <= 3) {
                      // Near due (Today or next 3 days) - Amber alert
                      rowColorClass = 'bg-amber-50/75 hover:bg-amber-100/80 border-l-4 border-l-amber-500 text-amber-950 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 dark:border-l-amber-400 dark:text-amber-100 font-medium border-b border-slate-100 dark:border-slate-800/60';
                    }
                  } else if (t.settlementState === 'LIQUIDADO') {
                    rowColorClass = 'hover:bg-emerald-50/30 dark:hover:bg-emerald-950/30 transition-colors border-b border-slate-100 dark:border-slate-800/60';
                  }

                  if (isSelected) {
                    rowColorClass += ' bg-rose-100/80 dark:bg-rose-950/50';
                  }

                  return (
                    <tr 
                      key={t.id}
                      onDoubleClick={() => handleStartEditTitle(t)}
                      title="💡 Dê um duplo clique para editar este lançamento"
                      className={`cursor-pointer select-none ${rowColorClass}`}
                    >
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelectOne(t.id, e as any)}
                          className="rounded border-slate-300 dark:border-slate-600 text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4 bg-white dark:bg-slate-800"
                        />
                      </td>

                      <td className="py-3 px-4 min-w-[250px] max-w-[420px]">
                        {/* Descrição em Destaque: maior, legível e quebrando linha naturalmente */}
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words whitespace-normal">
                          {t.description || 'Sem descrição'}
                        </div>

                        {/* Categoria do Plano de Contas (com cores temáticas) e Código de Operação Minimizados */}
                        {(() => {
                          const catColors = getAccountBadgeColorClasses(chartAcc);
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap mt-1">
                              <span 
                                title={`Categoria Contábil: ${categoryName}${chartAcc?.code ? ` (${chartAcc.code})` : ''}`}
                                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${catColors.container}`}
                              >
                                <Folder className={`w-3 h-3 ${catColors.icon} shrink-0`} />
                                <span>{categoryName}</span>
                              </span>

                              <span 
                                title={`Número do documento/título: ${t.titleNumber}`}
                                className="adv-only font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-200/80 dark:border-slate-800"
                              >
                                #{t.titleNumber}
                              </span>

                          {(t.originType === 'CONTRATO' || (t.titleNumber && t.titleNumber.startsWith('FAT-')) || t.contractNumber) && (
                            <span 
                              title={`Origem: Contrato ${t.contractNumber || ''}`}
                              className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                            >
                              🏷️ Contrato {t.contractNumber || ''}
                            </span>
                          )}
                          {t.originType === 'RECORRENCIA_PAGAR' && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              🏷️ Recorrência
                            </span>
                          )}
                          {t.originType === 'CARTAO_CREDITO' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs">
                              <CreditCard className="w-2.5 h-2.5 text-amber-500" />
                              Cartão
                            </span>
                          )}
                          {t.barcode && (
                            <button
                              type="button"
                              title={`Linha digitável: ${t.barcode} (Clique para copiar)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(t.barcode || '');
                                setToastMessage({ text: 'Linha digitável do boleto copiada!', type: 'success' });
                              }}
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 hover:border-amber-500 cursor-pointer transition-colors"
                            >
                              <Barcode className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                              <span>Boleto</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{supplier?.name || 'Fornecedor'}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{supplier?.document}</div>
                      </td>

                      <td className="adv-only hidden xl:table-cell py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {formatCompetenceShort(t.competence)}
                      </td>

                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        {formatDateBR(t.dueDate)}
                      </td>

                      <td className="adv-only hidden 2xl:table-cell py-3 px-4 text-slate-600 dark:text-slate-400">
                        {formatDateBR(t.expectedCashDate || t.dueDate)}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 font-medium">
                        {formatBRL(t.originalAmount)}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-rose-600 dark:text-rose-400 text-sm">
                        {formatBRL(t.balancePrincipal)}
                      </td>

                      <td className="adv-only hidden xl:table-cell py-3 px-4 text-center">
                        {t.balancePrincipal <= 0 ? (
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">-</span>
                        ) : (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            tempStatus === 'VENCIDO'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 dark:border dark:border-rose-800/60'
                              : tempStatus === 'VENCE_HOJE'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/60'
                              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60'
                          }`}>
                            {tempStatus === 'VENCIDO' ? 'Vencido' : tempStatus === 'VENCE_HOJE' ? 'Vence Hoje' : 'A Vencer'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap min-w-[96px]">
                        <div className="simple-only">
                          {(() => {
                            const cancelled = t.documentState === 'CANCELADO';
                            const done = t.settlementState === 'LIQUIDADO';
                            const partial = t.settlementState === 'PARCIAL';
                            const label = cancelled ? 'Cancelado' : done ? 'Pago' : tempStatus === 'VENCIDO' ? (partial ? 'Parcial em atraso' : 'Em atraso') : partial ? 'Parcial' : tempStatus === 'VENCE_HOJE' ? 'Vence hoje' : 'A vencer';
                            const tone = cancelled
                              ? 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
                              : done
                              ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]'
                              : tempStatus === 'VENCIDO'
                              ? 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
                              : 'bg-[var(--brand-gold-soft)] text-[var(--brand-gold)]';
                            return <span className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-semibold whitespace-nowrap ${tone}`}>{label}</span>;
                          })()}
                        </div>
                        <div className="adv-only flex flex-col items-center justify-center gap-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            t.documentState === 'CANCELADO'
                              ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              : t.settlementState === 'LIQUIDADO'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800/60'
                              : t.settlementState === 'PARCIAL'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 dark:border dark:border-amber-800/60'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800/60'
                          }`}>
                            {t.documentState === 'CANCELADO' ? 'CANCELADO' : t.settlementState}
                          </span>
                          {t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank ? (
                            <span
                              className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 shadow-2xs select-none"
                              title={`Conciliado com o Extrato Bancário${t.reconciliationNote ? `: ${t.reconciliationNote}` : ''}. Para desconciliar, utilize a tela de Conciliação Bancária.`}
                            >
                              <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0 stroke-[2.5]" />
                              <span>Conciliado</span>
                            </span>
                          ) : t.settlementState === 'LIQUIDADO' ? (
                            <button
                              type="button"
                              onClick={(e) => handleToggleSingleReconciled(t, e)}
                              className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/50 dark:border-amber-500/40 hover:bg-amber-500/25 hover:border-amber-500 transition-colors cursor-pointer shadow-2xs"
                              title="Baixado manualmente no ERP, aguardando conciliação com o extrato bancário. Concilie na tela de Conciliação Bancária."
                            >
                              <HandCoins className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 stroke-[2.2]" />
                              <span>Baixado Manual (Pendente Banco)</span>
                            </button>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {t.balancePrincipal > 0 && t.documentState !== 'CANCELADO' && (
                          <button
                            onClick={() => setSelectedTitleForSettlement(t)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-2xs transition-colors inline-flex items-center cursor-pointer"
                            title="Efetuar pagamento da obrigação"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Pagar
                          </button>
                        )}

                        {(t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL') && (
                          <button
                            onClick={(e) => handleOpenSingleReopen(t, e)}
                            disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded shadow-2xs transition-colors inline-flex items-center ${
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                                : 'text-white bg-blue-600 hover:bg-blue-700 cursor-pointer'
                            }`}
                            title={
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'Bloqueado: Título conciliado via banco. Desfaça a conciliação na tela de Conciliação Bancária antes de estornar.'
                                : 'Voltar obrigação para EM ABERTO (Estornar pagamento)'
                            }
                          >
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />
                            Voltar Aberto
                          </button>
                        )}

                        <button
                          onClick={() => handleStartEditTitle(t)}
                          disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                          className={`p-1 rounded transition-colors ${
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-60'
                              : 'text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer'
                          }`}
                          title={
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'Bloqueado: Título conciliado via banco não pode ser editado. Desfaça a conciliação na tela de Conciliação Bancária.'
                              : 'Editar obrigação (ou dê duplo clique na linha)'
                          }
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => handleDuplicateOne(t, e)}
                          className="p-1 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
                          title="Copiar esta despesa"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        {t.balancePrincipal > 0 && t.documentState !== 'CANCELADO' && (
                          <button
                            onClick={(e) => handleTriggerWhatsApp(t, e)}
                            className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition-colors cursor-pointer"
                            title="Enviar aviso ou confirmação de pagamento via WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => setHistoryTitle(t)}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Ver detalhes e histórico de pagamentos"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {t.balancePrincipal === t.originalAmount && t.documentState !== 'CANCELADO' && (
                          <button
                            onClick={(e) => handleOpenSingleCancel(t, e)}
                            disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                            className={`p-1 rounded transition-colors ${
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-60'
                                : 'text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer'
                            }`}
                            title={
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'Bloqueado: Título conciliado via banco não pode ser cancelado.'
                                : 'Cancelar despesa'
                            }
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={(e) => handleOpenSingleDelete(t, e)}
                          disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                          className={`p-1 rounded transition-colors ${
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-60'
                              : 'text-rose-500 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer'
                          }`}
                          title={
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'Bloqueado: despesa já conferida com o banco não pode ser excluída.'
                              : 'Excluir Lançamento Definitivamente'
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settlement Modal */}
      {selectedTitleForSettlement && (
        <SettlementModal
          title={selectedTitleForSettlement}
          isOpen={true}
          onClose={() => setSelectedTitleForSettlement(null)}
          onSettled={() => {
            setSelectedTitleForSettlement(null);
            window.location.reload();
          }}
        />
      )}

      {/* Title Settlement History Modal (Linha do Tempo Visual e Extratos Vinculados) */}
      <TitleSettlementHistoryModal
        isOpen={Boolean(historyTitle)}
        title={historyTitle}
        onClose={() => setHistoryTitle(null)}
      />

      {/* Edit Title Modal (Double click or pencil action) */}
      <EditTitleModal
        isOpen={!!selectedTitleForEdit}
        title={selectedTitleForEdit}
        onClose={() => setSelectedTitleForEdit(null)}
        onSaved={() => {
          setSelectedTitleForEdit(null);
          setRefreshKey(k => k + 1);
        }}
      />

      {/* Batch Edit Titles Modal */}
      <BatchEditTitlesModal
        isOpen={isBatchEditOpen}
        selectedTitleIds={selectedIds}
        type="PAGAR"
        onClose={() => setIsBatchEditOpen(false)}
        onSaved={() => {
          setIsBatchEditOpen(false);
          setSelectedIds([]);
          setRefreshKey(k => k + 1);
        }}
      />

      {/* Spreadsheet Import Modal */}
      {isImportModalOpen && (
        <ImportSpreadsheetModal
          isOpen={isImportModalOpen}
          defaultType="PAGAR"
          onClose={() => setIsImportModalOpen(false)}
          onImportCompleted={() => {
            setIsImportModalOpen(false);
            setStatusFilter('TODOS');
            setQuickDateFilter('ALL');
            setSearchTerm('');
            setRefreshKey(k => k + 1);
          }}
        />
      )}

      {/* Modal de Baixa em Lote (Melhoria 5) */}
      <BatchSettlementModal
        isOpen={isBatchSettlementOpen}
        onClose={() => setIsBatchSettlementOpen(false)}
        titles={titles.filter(t => selectedIds.includes(t.id))}
        type="PAGAR"
        onSettled={() => {
          setSelectedIds([]);
          setRefreshKey(k => k + 1);
          setToastMessage({ type: 'success', text: 'Baixa em lote realizada com sucesso!' });
        }}
      />

      {/* Modal de Prorrogação de Vencimento em Lote (Melhoria 5) */}
      <BatchPostponeModal
        isOpen={isBatchPostponeOpen}
        onClose={() => setIsBatchPostponeOpen(false)}
        titles={titles.filter(t => selectedIds.includes(t.id))}
        onUpdated={() => {
          setSelectedIds([]);
          setRefreshKey(k => k + 1);
          setToastMessage({ type: 'success', text: 'Vencimentos prorrogados com sucesso!' });
        }}
      />

      {/* Confirm Batch or Single Delete / Cancel Modal */}
      <ConfirmBatchActionModal
        isOpen={confirmModalState.isOpen}
        mode={confirmModalState.mode}
        type="PAGAR"
        titles={confirmModalState.titles}
        onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false, titles: [] }))}
        onConfirm={handleExecuteConfirmedAction}
      />

      {/* Modal de Reabertura de Pagamento / Voltar para Em Aberto */}
      <ConfirmReopenTitlesModal
        isOpen={reopenModalState.isOpen}
        titles={reopenModalState.titles}
        type="PAGAR"
        onClose={() => setReopenModalState({ isOpen: false, titles: [] })}
        onConfirmed={(reopenedCount, message) => {
          setSelectedIds([]);
          setRefreshKey(k => k + 1);
          setToastMessage({
            type: 'success',
            text: message || `${reopenedCount} obrigação(ões) voltaram para EM ABERTO!`
          });
        }}
      />

      {/* Leitor e Baixa de Boletos em Lote por Linha Digitável */}
      <BoletoBatchSettlementModal
        isOpen={isBoletoModalOpen}
        onClose={() => setIsBoletoModalOpen(false)}
        titles={titles}
        bankAccounts={bankAccounts}
        counterparties={counterparties}
        onSuccess={(msg) => {
          setToastMessage({ text: msg, type: 'success' });
          setRefreshKey(k => k + 1);
        }}
      />

      {/* Assistente de Limpeza de Duplicidades */}
      <DeduplicationWizardModal
        isOpen={isDedupModalOpen}
        type="PAGAR"
        onClose={() => setIsDedupModalOpen(false)}
        onResolved={(deletedCount) => {
          setRefreshKey(k => k + 1);
          setToastMessage({
            type: 'success',
            text: `✓ ${deletedCount} despesa(s) repetida(s) removida(s) com sucesso!`
          });
        }}
      />

      {/* In-App Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center space-x-3 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-200 ${
          toastMessage.type === 'success' 
            ? 'bg-slate-900 text-emerald-300 border-emerald-600/50 shadow-emerald-950/20' 
            : toastMessage.type === 'error'
            ? 'bg-slate-900 text-rose-300 border-rose-600/50 shadow-rose-950/20'
            : 'bg-slate-900 text-amber-300 border-amber-600/50 shadow-amber-950/20'
        }`}>
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button 
            onClick={() => setToastMessage(null)} 
            className="text-slate-400 hover:text-white ml-2 p-0.5 rounded hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

    </div>
  );
};
