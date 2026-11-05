import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  Ban,
  Eye, 
  FileSpreadsheet,
  Calendar,
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
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  MessageCircle,
  Lock,
  Printer,
  FileCheck,
  Folder,
  Scale,
  X,
  CheckCheck,
  HandCoins
} from 'lucide-react';
import { FinancialTitle, Settlement, ChartAccount } from '../../types';
import { storage } from '../../services/storageService';
import { 
  FinancialEngine, 
  formatBRL, 
  formatDateBR, 
  getTemporalStatus, 
  getFilteredChartAccounts, 
  formatAccountNameWithoutCode, 
  getAccountBadgeColorClasses, 
  triggerWhatsAppForTitle,
  isBalanceFeeTitle
} from '../../services/financialEngine';
import { CreditRiskService, CustomerRiskProfile, RiskLevel } from '../../services/creditRiskService';
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
import { ReceiptModal } from '../Modals/ReceiptModal';
import { TitleSettlementHistoryModal } from './TitleSettlementHistoryModal';
import { ModulePeriodNavigator } from '../Common/ModulePeriodNavigator';
import { SwipeableCard } from '../Common/SwipeableCard';
import { useModulePeriod } from '../../hooks/useModulePeriod';
import { toast } from '../../hooks/useToast';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { PremiumSelect } from '../Common/PremiumSelect';
import { Card, PageToolbar, Button, StatTile, TabPills, Disclosure, FieldLabel, MoreMenu } from '../Common/ui';
import { formatPeriodRangeBR, formatCompetenceShort } from '../../utils/dateUtils';
import { TWallet, TClock, TCalendar, TAlert, TCheck, TShield } from '../Common/tileIcons';

interface ReceivablesViewProps {
  onOpenNewTitleModal: (type: 'RECEBER') => void;
  initialSearch?: string;
}

export const ReceivablesView: React.FC<ReceivablesViewProps> = ({ onOpenNewTitleModal, initialSearch = '' }) => {
  const today = new Date().toISOString().split('T')[0];
  const { period } = useModulePeriod('RECEIVABLES');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'ABERTO' | 'VENCIDO' | 'LIQUIDADO' | 'CANCELADO' | 'CONCILIADO'>(
    initialSearch ? 'TODOS' : 'ABERTO'
  );

  React.useEffect(() => {
    if (initialSearch) {
      setSearchTerm(initialSearch);
      setStatusFilter('TODOS');
    }
  }, [initialSearch]);
  const [quickDateFilter, setQuickDateFilter] = useState<'ALL' | 'HOJE' | 'ESTA_SEMANA' | 'VENCIDO' | 'LIQUIDADO' | 'ESTE_MES'>('ALL');
  const [isPredictiveExpandedMobile, setIsPredictiveExpandedMobile] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [originFilter, setOriginFilter] = useState<'ALL' | 'CONTRATO' | 'TAXA_BALANCO' | 'VENDA' | 'MANUAL'>('ALL');
  const [counterpartyFilter, setCounterpartyFilter] = useState<string>('ALL');
  const [bankFilter, setBankFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'BAIXO' | 'MODERADO' | 'ALTO'>('ALL');

  // Sorting state
  const [sortField, setSortField] = useState<string>('dueDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [selectedTitleForSettlement, setSelectedTitleForSettlement] = useState<FinancialTitle | null>(null);
  const [selectedTitleForEdit, setSelectedTitleForEdit] = useState<FinancialTitle | null>(null);
  const [receiptTitle, setReceiptTitle] = useState<FinancialTitle | null>(null);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [isBatchSettlementOpen, setIsBatchSettlementOpen] = useState(false);
  const [isBatchPostponeOpen, setIsBatchPostponeOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDedupModalOpen, setIsDedupModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedMobileIds, setExpandedMobileIds] = useState<Record<string, boolean>>({});
  const [historyTitle, setHistoryTitle] = useState<FinancialTitle | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const duplicateCandidates = useMemo(() => {
    try {
      return storage.findDuplicateTitleCandidates('RECEBER');
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

  // Modal de Reabertura de Recebimentos (Voltar para Em Aberto)
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
      title: toastMessage.type === 'success' ? 'Contas a Receber' : (toastMessage.type === 'error' ? 'Erro' : 'Aviso')
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
      return Array.isArray(data) ? data.filter(t => t && t.type === 'RECEBER') : [];
    } catch (err) {
      console.error('Erro ao ler títulos a receber:', err);
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

  // Base titles matching Receivables Period (estritamente por Data de Vencimento)
  const periodTitles = useMemo(() => {
    try {
      return titles.filter(t => {
        if (!t) return false;
        if (period && period.active) {
          const pYear = period.year;
          const pMonth = period.month;
          const dueStr = String(t.dueDate || '');

          if (pMonth === 0) {
            // Todos os meses do ano
            const yStr = String(pYear);
            if (!dueStr.startsWith(yStr)) return false;
          } else {
            // Mês específico
            const ymStr = `${pYear}-${String(pMonth).padStart(2, '0')}`;
            if (!dueStr.startsWith(ymStr)) return false;
          }
        }
        return true;
      });
    } catch (err) {
      console.error('Erro ao filtrar títulos a receber por período de vencimento:', err);
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
      const conciliados = notCancelled.filter(t => t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank);

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
        conciliadosTotal: conciliados.reduce((acc, t) => acc + (Number(t.settledPrincipal || t.originalAmount) || 0), 0),
        conciliadosCount: conciliados.length,
        canceladosCount: periodTitles.filter(t => t && t.documentState === 'CANCELADO').length,
        todosCount: periodTitles.length
      };
    } catch (err) {
      console.error('Erro ao calcular estatísticas de recebíveis:', err);
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

  // Diagnóstico Preditivo de Risco de Crédito da Carteira (Escopado estritamente ao Período Selecionado)
  const portfolioRisk = useMemo(() => {
    return CreditRiskService.getPortfolioRiskOverview(today, periodTitles);
  }, [periodTitles, titles, refreshKey, today]);

  // Estatísticas e agrupamento de categorias ativas com receita no período selecionado
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

      // Contas analíticas de receita do plano de contas
      const revenueAccounts = getFilteredChartAccounts(chartAccounts, 'RECEBER');
      const inPeriodMap = new Map<string, { account: ChartAccount; count: number; totalAmount: number }>();

      revenueAccounts.forEach(acc => {
        const stat = counts[acc.id];
        if (stat && stat.count > 0) {
          inPeriodMap.set(acc.id, {
            account: acc,
            count: stat.count,
            totalAmount: Math.round(stat.totalAmount * 100) / 100
          });
        }
      });

      // Garantir inclusão de qualquer conta com lançamentos a receber no período
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
      inPeriod.sort((a, b) => b.count - a.count || (a.account.code || '').localeCompare(b.account.code || '', undefined, { numeric: true }));

      const others = revenueAccounts
        .filter(acc => !inPeriodMap.has(acc.id))
        .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

      const isFinRevenue = (acc: ChartAccount) => (acc.code && acc.code.startsWith('4.1')) || acc.nature === 'RECEITA_FINANCEIRA';
      const inPeriodService = inPeriod.filter(it => !isFinRevenue(it.account));
      const inPeriodFinancial = inPeriod.filter(it => isFinRevenue(it.account));
      const othersService = others.filter(acc => !isFinRevenue(acc));
      const othersFinancial = others.filter(acc => isFinRevenue(acc));

      return {
        inPeriod,
        others,
        inPeriodService,
        inPeriodFinancial,
        othersService,
        othersFinancial,
        unclassifiedCount,
        unclassifiedTotal: Math.round(unclassifiedTotal * 100) / 100,
        totalTitlesInPeriod: periodTitles.filter(t => t && t.documentState !== 'CANCELADO').length
      };
    } catch (err) {
      console.error('Erro ao calcular estatísticas de categorias no período em Receber:', err);
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
        const client = counterparties.find(c => c && c.id === t.counterpartyId);
        const chartAcc = chartAccounts.find(a => a && (a.id === t.accountId || a.id === t.chartAccountId));
        const matchSearch = matchesSearch([
          client?.name,
          client?.tradeName,
          client?.document,
          t.titleNumber,
          t.description,
          chartAcc?.name,
          chartAcc?.code
        ], searchTerm);

        if (!matchSearch) return false;

        // Risk filter
        if (riskFilter !== 'ALL') {
          const p = portfolioRisk.customerProfiles[t.counterpartyId];
          if (p?.riskLevel !== riskFilter) return false;
        }

        // Category filter (específico, não classificado ou todos)
        if (categoryFilter !== 'ALL') {
          if (categoryFilter === 'SEM_CATEGORIA') {
            const hasCategory = Boolean(t.chartAccountId || t.accountId);
            if (hasCategory) return false;
          } else if (t.chartAccountId !== categoryFilter && t.accountId !== categoryFilter) {
            return false;
          }
        }

        // Origin filter (Contrato Recorrente vs Taxa de Balanço vs Venda Avulsa/Parcelada vs Manual)
        if (originFilter !== 'ALL') {
          const isTB = isBalanceFeeTitle(t);
          const isContract = (t.originType === 'CONTRATO' || (t.titleNumber && t.titleNumber.startsWith('FAT-')) || Boolean(t.contractNumber)) && !isTB;
          const isSale = t.originType === 'VENDA' || (t.titleNumber && t.titleNumber.startsWith('VEN-')) || Boolean(t.saleNumber);

          if (originFilter === 'TAXA_BALANCO' && !isTB) return false;
          if (originFilter === 'CONTRATO' && (!isContract || isTB)) return false;
          if (originFilter === 'VENDA' && !isSale) return false;
          if (originFilter === 'MANUAL' && (isContract || isSale || isTB)) return false;
        }

        // Counterparty filter
        if (counterpartyFilter !== 'ALL' && t.counterpartyId !== counterpartyFilter) {
          return false;
        }

        // Bank account filter
        if (bankFilter !== 'ALL' && t.expectedBankAccountId !== bankFilter) {
          return false;
        }

        const balance = Number(t.balancePrincipal) || 0;
        const due = String(t.dueDate || '');

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
          if (statusFilter === 'CONCILIADO') return t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank);
        }

        return true;
      });
    } catch (err) {
      console.error('Erro ao filtrar títulos:', err);
      return [];
    }
  }, [periodTitles, searchTerm, categoryFilter, counterpartyFilter, bankFilter, quickDateFilter, statusFilter, today, weekRange, counterparties, chartAccounts]);

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
      console.error('Erro ao ordenar títulos:', err);
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
    setOriginFilter('ALL');
    setCounterpartyFilter('ALL');
    setBankFilter('ALL');
    setQuickDateFilter('ALL');
    setStatusFilter('ABERTO');
  };

  const hasActiveFilters = searchTerm !== '' || categoryFilter !== 'ALL' || originFilter !== 'ALL' || counterpartyFilter !== 'ALL' || bankFilter !== 'ALL' || quickDateFilter !== 'ALL';

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
        text: `Título ${t.titleNumber} duplicado com sucesso!`
      });
    }
  };

  // WhatsApp reminder/collection notification
  const handleTriggerWhatsApp = (t: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const client = counterparties.find(c => c && c.id === t.counterpartyId);
    const clientPhone = client?.phone || (client as any)?.mobilePhone || (client as any)?.whatsapp;
    const res = triggerWhatsAppForTitle(t, clientPhone, client?.name || client?.tradeName);
    if (res.copied) {
      setToastMessage({
        type: 'success',
        text: 'Mensagem de cobrança WhatsApp copiada e conversa aberta!'
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
      text: `${created.length} título(s) duplicado(s) com sucesso!`
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
        text: `🔒 O recebimento #${t.titleNumber} está conciliado via banco e não pode ser editado. Para fazer alterações, desfaça a conciliação na tela de Conciliação Bancária.`
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
        text: `🔒 O recebimento #${t.titleNumber} está conciliado via banco e não pode ser excluído. Desfaça a conciliação bancária primeiro na tela de Conciliação.`
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
        text: `🔒 O recebimento #${t.titleNumber} está conciliado via banco e não pode ser cancelado. Desfaça a conciliação na tela de Conciliação Bancária.`
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
        text: `🔒 O recebimento #${t.titleNumber} está conciliado via banco e não pode ser estornado diretamente. Desfaça a conciliação na tela de Conciliação Bancária primeiro.`
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
        text: 'Nenhum dos títulos selecionados pode ser reaberto (títulos conciliados via banco devem ser desconciliados na tela de Conciliação antes de serem estornados).'
      });
      return;
    }
    setReopenModalState({
      isOpen: true,
      titles: targetTitles
    });
  };

  // Status de conciliação bancária (informativo e com bloqueio de alteração acidental)
  const handleToggleSingleReconciled = (title: FinancialTitle, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setToastMessage({
      type: 'info',
      text: title.reconciliationStatus === 'CONCILIADO' || title.reconciledViaBank
        ? `🔒 O recebimento #${title.titleNumber} foi conciliado via extrato bancário. Para desconciliar, utilize a tela de Conciliação Bancária.`
        : `Acesse a tela de Conciliação Bancária para conciliar o recebimento #${title.titleNumber} com o extrato bancário.`
    });
  };

  // Alterna conciliação bancária em lote
  const handleBatchToggleReconciled = () => {
    if (selectedIds.length === 0) return;
    setToastMessage({
      type: 'info',
      text: 'A conciliação e desconciliação bancária devem ser realizadas na tela de Conciliação Bancária para garantir o cruzamento correto com o extrato bancário.'
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
        text: `${res.deletedCount} lançamento(s) excluído(s) permanentemente com sucesso!${res.affectedSettlements > 0 ? ` (${res.affectedSettlements} baixa(s) estornada(s))` : ''}`
      });
    } else {
      const res = storage.batchCancelTitles(ids);
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
      setConfirmModalState({ isOpen: false, mode: 'CANCEL', titles: [] });
      setRefreshKey(k => k + 1);
      setToastMessage({
        type: res.cancelledCount > 0 ? 'success' : 'info',
        text: `${res.cancelledCount} título(s) cancelado(s) com sucesso.${res.ignoredCount > 0 ? ` (${res.ignoredCount} ignorados por possuírem baixas ou já cancelados)` : ''}`
      });
    }
  };

  // Export handlers
  const handleExportExcel = () => {
    const headers = ['Título', 'Cliente', 'Descrição', 'Competência', 'Emissão', 'Vencimento', 'Previsão Caixa', 'Valor Original', 'Principal Baixado', 'Saldo Atual', 'Situação'];
    const rows = filteredTitles.map(t => {
      const client = counterparties.find(c => c.id === t.counterpartyId);
      return [
        t.titleNumber,
        client?.name || 'Cliente',
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
    exportToExcel(`contas-a-receber-${today}`, 'Contas a Receber', headers, rows);
  };

  const handleExportCSV = () => {
    const headers = ['Título', 'Cliente', 'Descrição', 'Competência', 'Emissão', 'Vencimento', 'Previsão Caixa', 'Valor Original', 'Saldo Atual', 'Situação'];
    const rows = filteredTitles.map(t => {
      const client = counterparties.find(c => c.id === t.counterpartyId);
      return [
        t.titleNumber,
        client?.name || 'Cliente',
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
    exportToCSV(`contas-a-receber-${today}`, headers, rows);
  };

  const handleExportSelectedExcel = () => {
    if (selectedIds.length === 0) return;
    const targetTitles = titles.filter(t => selectedIds.includes(t.id));
    const headers = ['Título', 'Cliente', 'Descrição', 'Competência', 'Emissão', 'Vencimento', 'Previsão Caixa', 'Valor Original', 'Principal Baixado', 'Saldo Atual', 'Situação'];
    const rows = targetTitles.map(t => {
      const client = counterparties.find(c => c.id === t.counterpartyId);
      return [
        t.titleNumber,
        client?.name || 'Cliente',
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
    exportToExcel(`lote-receber-selecionados-${today}`, 'Lote Selecionado', headers, rows);
    setToastMessage({
      type: 'success',
      text: `${targetTitles.length} títulos selecionados exportados para planilha Excel!`
    });
  };

  const handleCancelTitle = (t: FinancialTitle) => {
    handleOpenSingleCancel(t);
  };

  const openBalanceTotal = filteredTitles.filter(t => t.documentState !== 'CANCELADO').reduce((acc, t) => acc + t.balancePrincipal, 0);

  return (
    <div className="space-y-6">
      
      <PageToolbar description="Honorários faturados, agenda de liquidação e baixas parciais ou integrais.">
        <MoreMenu
          attention={duplicateCandidates.length > 0}
          items={[
            {
              label: 'Limpeza de duplicidades',
              icon: <Sparkles className="w-4 h-4" />,
              onClick: () => setIsDedupModalOpen(true),
              badge: duplicateCandidates.length > 0 ? duplicateCandidates.length : undefined,
              hint: 'Encontra títulos repetidos (mesmo vencimento, valor e descrição)'
            },
            { label: 'Exportar para Excel', icon: <FileSpreadsheet className="w-4 h-4" />, onClick: handleExportExcel },
            { label: 'Exportar para CSV', icon: <Download className="w-4 h-4" />, onClick: handleExportCSV }
          ]}
        />
        <Button
          variant="secondary"
          icon={<Upload className="w-4 h-4" />}
          onClick={() => setIsImportModalOpen(true)}
          title="Importar lançamentos de planilha externa (Conta Azul, Asaas, Omie, etc.)"
        >
          Importar
        </Button>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => onOpenNewTitleModal('RECEBER')}>
          Novo recebimento
        </Button>
      </PageToolbar>

      {/* Previsão de inadimplência (recolhida por padrão) */}
      <Disclosure
        icon={<TShield />}
        title="Previsão de inadimplência"
        subtitle={
          period && period.active
            ? `Período ${formatPeriodRangeBR(period.month, period.year)}`
            : 'Pontualidade histórica por cliente e valores em aberto na carteira'
        }
        open={isPredictiveExpandedMobile}
        onToggle={() => setIsPredictiveExpandedMobile(v => !v)}
      >
        <div className="mb-5">
          <TabPills
            tabs={[
              { id: 'ALL', label: 'Todos' },
              { id: 'BAIXO', label: 'Baixo risco' },
              { id: 'MODERADO', label: 'Risco moderado' },
              { id: 'ALTO', label: 'Alto risco' }
            ]}
            value={riskFilter}
            onChange={id => setRiskFilter(id as any)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">Recebimento seguro</p>
            <p className="mt-2 text-[22px] leading-7 font-semibold tabular-nums">{formatBRL(portfolioRisk.lowRiskOpenAmount)}</p>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">Clientes pontuais, com mais de 85% das parcelas pagas em dia.</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">Atenção preventiva</p>
            <p className="mt-2 text-[22px] leading-7 font-semibold tabular-nums">{formatBRL(portfolioRisk.moderateRiskOpenAmount)}</p>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">Atrasos pontuais no histórico. Vale enviar lembrete antes do vencimento.</p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] p-4">
            <p className="text-sm text-[var(--text-secondary)]">Em risco crítico</p>
            <p className={`mt-2 text-[22px] leading-7 font-semibold tabular-nums ${portfolioRisk.highRiskOpenAmount > 0 ? 'text-[var(--status-danger)]' : ''}`}>
              {formatBRL(portfolioRisk.highRiskOpenAmount)}
            </p>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">
              {portfolioRisk.highRiskCustomerCount} cliente(s) com títulos vencidos ou alto índice de inadimplência.
            </p>
          </div>
        </div>
      </Disclosure>

      {/* Indicadores (também funcionam como filtros rápidos) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatTile
          label="Em aberto" icon={<TWallet />} accent="info"
          value={formatBRL(stats.openTotal)}
          hint="Total a receber"
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
            label="Recebidos" icon={<TCheck />} accent="success"
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

      {/* Filtros */}
      <Card className="space-y-5">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4">
          <div className="min-w-0 2xl:flex-1">
          <TabPills
            tabs={[
              { id: 'ABERTO', label: 'Em aberto', count: stats.openCount },
              { id: 'VENCIDO', label: 'Vencidos', count: stats.vencidosCount },
              { id: 'LIQUIDADO', label: 'Liquidados', count: stats.liquidadosCount },
              { id: 'CONCILIADO', label: 'Conciliados', count: stats.conciliadosCount },
              { id: 'TODOS', label: 'Todos', count: stats.todosCount },
              { id: 'CANCELADO', label: 'Cancelados', count: stats.canceladosCount }
            ]}
            value={quickDateFilter === 'ALL' ? statusFilter : ''}
            onChange={id => {
              setStatusFilter(id as any);
              setQuickDateFilter('ALL');
            }}
          />
          </div>
          <div className="relative w-full 2xl:w-72 shrink-0">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por cliente, documento ou descrição"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-[var(--border-highlight)]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="adv-only">
            <FieldLabel>Plano de contas</FieldLabel>
            <PremiumSelect
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              sheetTitle="Plano de contas"
              className="w-full h-10 px-3 text-sm"
            >
              <option value="ALL">Todas as receitas ({categoryStats.totalTitlesInPeriod} no período)</option>
              {categoryStats.unclassifiedCount > 0 && (
                <option value="SEM_CATEGORIA">
                  Sem categoria ({categoryStats.unclassifiedCount} títulos • {formatBRL(categoryStats.unclassifiedTotal)})
                </option>
              )}
              {categoryStats.inPeriodService.length > 0 && (
                <optgroup label="Receitas de serviços no período">
                  {categoryStats.inPeriodService.map(({ account, count, totalAmount }) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name} ({count} títulos • {formatBRL(totalAmount)})
                    </option>
                  ))}
                </optgroup>
              )}
              {categoryStats.inPeriodFinancial.length > 0 && (
                <optgroup label="Receitas financeiras no período">
                  {categoryStats.inPeriodFinancial.map(({ account, count, totalAmount }) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name} ({count} títulos • {formatBRL(totalAmount)})
                    </option>
                  ))}
                </optgroup>
              )}
              {categoryStats.othersService.length > 0 && (
                <optgroup label="Receitas de serviços (plano de contas)">
                  {categoryStats.othersService.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {categoryStats.othersFinancial.length > 0 && (
                <optgroup label="Receitas financeiras (plano de contas)">
                  {categoryStats.othersFinancial.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </PremiumSelect>
          </div>

          <div>
            <FieldLabel>Cliente</FieldLabel>
            <PremiumSelect
              value={counterpartyFilter}
              onChange={e => setCounterpartyFilter(e.target.value)}
              sheetTitle="Cliente"
              className="w-full h-10 px-3 text-sm"
            >
              <option value="ALL">Todos os clientes</option>
              {counterparties.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
              <option value="CONTRATO">Contratos recorrentes (mensalidades)</option>
              <option value="TAXA_BALANCO">Taxas de balanço anual (13º)</option>
              <option value="VENDA">Vendas avulsas ou parceladas</option>
              <option value="MANUAL">Lançamentos diretos (manuais)</option>
            </PremiumSelect>
          </div>

          <div className="adv-only">
            <FieldLabel>Conta bancária prevista</FieldLabel>
            <PremiumSelect
              value={bankFilter}
              onChange={e => setBankFilter(e.target.value)}
              sheetTitle="Conta bancária"
              className="w-full h-10 px-3 text-sm"
            >
              <option value="ALL">Todas as contas</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.type})
                </option>
              ))}
            </PremiumSelect>
          </div>
        </div>

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
                      text: `${filteredTitles.length} títulos desta categoria selecionados! Você pode classificá-los em lote usando a barra de ações.`
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

      {/* Receivables Period Navigator (Vencimento) */}
      <ModulePeriodNavigator
        moduleType="RECEIVABLES"
        titlePrefix="Vencimentos a Receber em"
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
          <div className="fixed bottom-16 inset-x-3 z-40 sm:static sm:inset-auto bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white p-3 sm:p-3.5 rounded-2xl sm:rounded-xl border border-amber-500/40 shadow-2xl sm:shadow-xl flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-3 animate-in slide-in-from-bottom sm:slide-in-from-top duration-200">
            {/* Header / Info counter */}
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                  {selectedIds.length}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-xs flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{selectedIds.length} recebimento(s)</span>
                    {hasClosedInSelection && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-normal">
                        <Lock className="w-3 h-3" /> Travada
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-300 truncate">
                    Saldo: <strong className="text-amber-400 font-bold">{formatBRL(totalSelectedBalance)}</strong>
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
                  title="Estornar os recebimentos e voltar os títulos selecionados para EM ABERTO"
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
                title="Marcar ou desmarcar conciliação bancária dos recebimentos selecionados"
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
                className="min-h-[40px] px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white border border-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors flex items-center cursor-pointer shrink-0"
              >
                <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                Em Massa
              </button>

              {/* Duplicar */}
              <button
                type="button"
                onClick={() => handleBatchDuplicate(false)}
                className="min-h-[40px] px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-medium border border-white/20 transition-colors flex items-center cursor-pointer shrink-0"
                title="Duplicar lançamentos para a mesma competência"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Duplicar
              </button>

              {/* Duplicar (+1 Mês) */}
              <button
                type="button"
                onClick={() => handleBatchDuplicate(true)}
                className="min-h-[40px] px-3 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-medium border border-white/20 transition-colors flex items-center cursor-pointer shrink-0"
                title="Duplicar avançando competência e vencimento em +1 mês"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
                +1 Mês
              </button>

              {/* Cancelar */}
              <button
                type="button"
                onClick={handleOpenBatchCancel}
                className="min-h-[40px] px-3 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors flex items-center cursor-pointer shrink-0"
                title="Alterar a situação dos títulos selecionados para CANCELADO"
              >
                <Ban className="w-3.5 h-3.5 mr-1 text-amber-400" />
                Cancelar
              </button>

              {/* Excluir */}
              <button
                type="button"
                onClick={handleOpenBatchDelete}
                className="min-h-[40px] px-3 py-2 bg-rose-700/70 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-bold border border-rose-500/40 transition-colors flex items-center cursor-pointer shrink-0"
                title="Excluir permanentemente os títulos selecionados do sistema"
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

      {/* Summary Banner of current list */}
      <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/60 px-4 py-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
        <span className="text-emerald-900 dark:text-emerald-200 flex items-center flex-wrap gap-1">
          <span>Listando <strong>{sortedTitles.length}</strong> lançamentos correspondentes aos filtros.</span>
          <span className="hidden sm:inline ml-2 text-[11px] text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-700">
            💡 Dica: Duplo clique em qualquer linha para editar o título
          </span>
          <span className="sm:hidden text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
            👆 Toque para detalhes • ↔ Deslize para a direita para Receber ou esquerda para Editar
          </span>
        </span>
        <span className="text-emerald-950 dark:text-emerald-100 font-bold text-xs sm:text-sm">
          Saldo em Aberto Filtrado: {formatBRL(sortedTitles.filter(t => t.documentState !== 'CANCELADO').reduce((acc, t) => acc + t.balancePrincipal, 0))}
        </span>
      </div>

      {/* Mobile View: Cards Expansíveis (Descrição, Data de Vencimento e Valor; clique na linha expande o restante) */}
      <div className={`block md:hidden space-y-2.5 ${selectedIds.length > 0 ? 'pb-28 sm:pb-0' : ''}`}>
        {sortedTitles.length === 0 ? (
          <div className="bg-white dark:bg-[#1b1b20] p-8 rounded-xl border border-slate-200 dark:border-[#26262b] text-center text-slate-600 dark:text-slate-300 text-xs shadow-2xs">
            Nenhum título a receber localizado para os filtros informados.
          </div>
        ) : (
          sortedTitles.map(t => {
            if (!t) return null;
            const customer = counterparties.find(c => c && c.id === t.counterpartyId);
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
              cardBg = 'bg-emerald-100/60 dark:bg-emerald-950/40';
              cardBorder = 'border-emerald-400 dark:border-emerald-600';
            }

            const canSettle = t.balancePrincipal > 0 && t.documentState !== 'CANCELADO';

            return (
              <SwipeableCard
                key={t.id}
                onSwipeRight={canSettle ? () => setSelectedTitleForSettlement(t) : undefined}
                rightLabel="Receber"
                onSwipeLeft={() => handleStartEditTitle(t)}
                leftLabel="Editar"
              >
                <div 
                  className={`rounded-xl border shadow-2xs overflow-hidden transition-all ${cardBg} ${cardBorder}`}
                >
                {/* Linha Principal Mobile: Status, Cliente, Descrição, Data e Valor Imediatos */}
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
                        className="rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4 bg-white dark:bg-slate-800"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Badge Temporal, Categoria e Risco Imediatos */}
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
                            Recebido
                          </span>
                        )}
                        {t.settlementState === 'PARCIAL' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setHistoryTitle(t);
                            }}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/80 cursor-pointer flex items-center gap-1 transition-colors"
                            title="Título com recebimento parcial. Clique para ver extratos e comprovantes vinculados."
                          >
                            <Clock className="w-2.5 h-2.5 text-amber-600" />
                            <span>Parcial (Restante: {formatBRL(t.balancePrincipal)})</span>
                          </button>
                        )}
                        {(t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank) ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1 shadow-2xs">
                            <CheckCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                            <span>Conciliado</span>
                          </span>
                        ) : t.settlementState === 'LIQUIDADO' ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleSingleReconciled(t, e)}
                            className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/50 dark:border-amber-500/40 inline-flex items-center gap-1 cursor-pointer shadow-2xs hover:bg-amber-500/25 transition-colors"
                            title="Baixado manualmente no ERP, aguardando conciliação bancária."
                          >
                            <HandCoins className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0 stroke-[2.2]" />
                            <span>Baixado Manual (Pendente Banco)</span>
                          </button>
                        ) : null}
                        {isBalanceFeeTitle(t) ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30 flex items-center gap-0.5">
                            <Scale className="w-2.5 h-2.5" />
                            <span>Taxa Balanço {t.installmentIndex && t.totalInstallments ? `(${t.installmentIndex}/${t.totalInstallments})` : ''}</span>
                          </span>
                        ) : (t.originType === 'CONTRATO' || (t.titleNumber && t.titleNumber.startsWith('FAT-')) || t.contractNumber) ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            🏷️ Contrato {t.contractNumber || ''}
                          </span>
                        ) : null}
                        {(t.originType === 'VENDA' || (t.titleNumber && t.titleNumber.startsWith('VEN-')) || t.saleNumber) && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                            🏷️ Venda {t.saleNumber || ''}
                          </span>
                        )}
                        {portfolioRisk.customerProfiles[t.counterpartyId] && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${portfolioRisk.customerProfiles[t.counterpartyId].riskColorClasses.badge}`}>
                            {portfolioRisk.customerProfiles[t.counterpartyId].riskBadgeLabel}
                          </span>
                        )}
                      </div>

                      {/* Cliente / Devedor em Destaque */}
                      <div className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm leading-snug">
                        {customer?.tradeName || customer?.name || 'Cliente não especificado'}
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
                            <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800">
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
                      <div className="font-extrabold font-mono text-emerald-600 dark:text-emerald-400 text-sm sm:text-base leading-tight">
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
                          Recebido
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
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Cliente / Devedor</span>
                        <span className="font-medium text-slate-900 dark:text-slate-100 block truncate">
                          {customer?.name || 'Cliente não especificado'}
                        </span>
                        {customer?.document && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-mono">{customer.document}</span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">Nº Documento / Título</span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200 block truncate">
                          {t.titleNumber || 'Sem código'}
                        </span>
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
                    </div>

                    {/* Resumo Financeiro */}
                    <div className="bg-white dark:bg-[#1b1b20] p-2.5 rounded-lg border border-slate-200 dark:border-[#26262b] flex justify-between items-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Valor Original</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{formatBRL(t.originalAmount)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Recebido</span>
                        <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatBRL(t.settledPrincipal || 0)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Saldo a Receber</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatBRL(t.balancePrincipal)}</span>
                      </div>
                    </div>

                    {/* Diagnóstico Preditivo do Cliente */}
                    {portfolioRisk.customerProfiles[t.counterpartyId] && (
                      <div className="p-3 rounded-xl bg-white dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Diagnóstico Preditivo</span>
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${portfolioRisk.customerProfiles[t.counterpartyId].riskColorClasses.badge}`}>
                            {portfolioRisk.customerProfiles[t.counterpartyId].riskBadgeLabel}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-[10px]">
                          <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800/60">
                            <span className="text-slate-400 block">Pontualidade:</span>
                            <strong className="text-slate-800 dark:text-slate-200">{portfolioRisk.customerProfiles[t.counterpartyId].punctualityScore}%</strong>
                          </div>
                          <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800/60">
                            <span className="text-slate-400 block">Atraso Médio:</span>
                            <strong className="text-slate-800 dark:text-slate-200">{portfolioRisk.customerProfiles[t.counterpartyId].averageDelayDays}d</strong>
                          </div>
                          <div className="p-1.5 rounded bg-slate-50 dark:bg-slate-800/60">
                            <span className="text-slate-400 block">Vencidos:</span>
                            <strong className={portfolioRisk.customerProfiles[t.counterpartyId].overdueCount > 0 ? 'text-rose-600 font-bold' : 'text-slate-800 dark:text-slate-200'}>
                              {portfolioRisk.customerProfiles[t.counterpartyId].overdueCount}
                            </strong>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-600 dark:text-slate-400">
                          <strong className="text-slate-700 dark:text-slate-300">Recomendação: </strong>
                          {portfolioRisk.customerProfiles[t.counterpartyId].recommendedAction}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const p = portfolioRisk.customerProfiles[t.counterpartyId];
                            if (p?.suggestedWhatsAppMessage) {
                              navigator.clipboard.writeText(p.suggestedWhatsAppMessage);
                              setToastMessage({ text: 'Mensagem WhatsApp copiada com sucesso!', type: 'success' });
                            }
                          }}
                          className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 border border-emerald-300 dark:border-emerald-700 transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Copiar Mensagem de Cobrança WhatsApp</span>
                        </button>
                      </div>
                    )}

                    {/* Ações Rápidas Mobile */}
                    <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex flex-wrap gap-2 items-center">
                      {t.balancePrincipal > 0 && t.documentState !== 'CANCELADO' && (
                        <button
                          type="button"
                          onClick={() => setSelectedTitleForSettlement(t)}
                          className="min-h-[42px] flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Receber / Baixar</span>
                        </button>
                      )}

                      {/* Voltar para Aberto (quando há valor recebido/liquidado) */}
                      {(t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL') && (
                        <button
                          type="button"
                          onClick={(e) => handleOpenSingleReopen(t, e)}
                          disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                          className={`min-h-[42px] py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs transition-colors ${
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                              : 'bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700/60 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 cursor-pointer'
                          }`}
                          title={
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'Bloqueado: Título conciliado via banco. Desfaça a conciliação na tela de Conciliação Bancária antes de estornar.'
                              : 'Estornar recebimentos e voltar este título para EM ABERTO'
                          }
                        >
                          <RotateCcw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          <span>Voltar Aberto</span>
                        </button>
                      )}

                      {/* Status de Conciliação Bancária */}
                      {t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank ? (
                        <span
                          className="min-h-[40px] py-2 px-3 border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 select-none"
                          title="Conciliado com o Extrato Bancário. Para desconciliar, utilize a tela de Conciliação Bancária."
                        >
                          <CheckCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Conciliado</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleToggleSingleReconciled(t, e)}
                          className="min-h-[40px] py-2 px-3 border rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
                          title="Conciliar via extrato bancário na tela de Conciliação"
                        >
                          <CheckCheck className="w-4 h-4 text-slate-400" />
                          <span>Conciliar</span>
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
                            : 'Editar recebimento'
                        }
                      >
                        <Edit3 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDuplicateOne(t, e)}
                        className="min-h-[40px] min-w-[40px] py-2 px-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        title="Duplicar lançamento"
                      >
                        <Copy className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>Duplicar</span>
                      </button>

                      {t.balancePrincipal > 0 && t.documentState !== 'CANCELADO' && (
                        <button
                          type="button"
                          onClick={(e) => handleTriggerWhatsApp(t, e)}
                          className="min-h-[40px] min-w-[40px] p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs shadow-2xs flex items-center justify-center cursor-pointer"
                          title="Enviar aviso/cobrança via WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setHistoryTitle(t)}
                        className="min-h-[40px] min-w-[40px] p-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs shadow-2xs flex items-center justify-center cursor-pointer"
                        title="Ver histórico de recebimentos"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Botão de Recibo Mobile */}
                      {(t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL') && (
                        <button
                          type="button"
                          onClick={() => setReceiptTitle(t)}
                          className="min-h-[40px] py-2 px-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                          title="Gerar e Imprimir Recibo Oficial de Quitação"
                        >
                          <Printer className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Recibo</span>
                        </button>
                      )}

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
                              : 'Cancelar título'
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
                            ? 'Bloqueado: Título conciliado via banco não pode ser excluído.'
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

      {/* Receivables Table (Desktop & Tablets) */}
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
                    title={isAllSelected ? "Desmarcar todos" : "Selecionar todos os títulos da lista"}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    )}
                  </button>
                </th>

                {/* Sortable Column: Título */}
                <th 
                  onClick={() => handleSort('titleNumber')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por número do título"
                >
                  <div className="flex items-center gap-1">
                    <span>Descrição / Lançamento</span>
                    {sortField === 'titleNumber' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Sortable Column: Cliente */}
                <th 
                  onClick={() => handleSort('counterparty')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por nome do cliente (ordem alfabética)"
                >
                  <div className="flex items-center gap-1">
                    <span>Cliente</span>
                    {sortField === 'counterparty' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Sortable Column: Competência (Adaptativo: oculto em notebooks compactos, visível em Mac/Desktops) */}
                <th 
                  onClick={() => handleSort('competence')}
                  className="adv-only hidden xl:table-cell py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por competência"
                >
                  <div className="flex items-center gap-1">
                    <span>Competência</span>
                    {sortField === 'competence' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Sortable Column: Vencimento */}
                <th 
                  onClick={() => handleSort('dueDate')}
                  className="py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por data de vencimento"
                >
                  <div className="flex items-center gap-1">
                    <span>Vencimento</span>
                    {sortField === 'dueDate' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Sortable Column: Previsão Caixa (Adaptativo: visível em telas 2K/Grandes) */}
                <th 
                  onClick={() => handleSort('expectedCashDate')}
                  className="adv-only hidden 2xl:table-cell py-3 px-4 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por previsão de caixa"
                >
                  <div className="flex items-center gap-1">
                    <span>Previsão Caixa</span>
                    {sortField === 'expectedCashDate' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Sortable Column: Valor Original */}
                <th 
                  onClick={() => handleSort('originalAmount')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por valor original"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Valor Original</span>
                    {sortField === 'originalAmount' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Sortable Column: Saldo Devedor */}
                <th 
                  onClick={() => handleSort('balancePrincipal')}
                  className="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por saldo devedor"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Saldo Devedor</span>
                    {sortField === 'balancePrincipal' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                {/* Temporal Situation (Adaptativo: oculto em notebooks, visível em Mac/Desktops) */}
                <th className="hidden xl:table-cell py-3 px-4 text-center">Situação Temporal</th>

                {/* Sortable Column: Status */}
                <th 
                  onClick={() => handleSort('status')}
                  className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 select-none transition-colors"
                  title="Clique para ordenar por status de liquidação"
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Status</span>
                    {sortField === 'status' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-amber-500" /> : <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                </th>

                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTitles.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500">
                    Nenhum título a receber localizado para os filtros informados.
                  </td>
                </tr>
              ) : (
                sortedTitles.map(t => {
                  if (!t) return null;
                  const client = counterparties.find(c => c && c.id === t.counterpartyId);
                  const tempStatus = getTemporalStatus(t, today);
                  const isSelected = selectedIds.includes(t.id);
                  const balance = Number(t.balancePrincipal) || 0;
                  const titleDueDate = t.dueDate || today;
                  const chartAcc = chartAccounts.find(a => a && (a.id === t.accountId || a.id === t.chartAccountId));
                  const categoryName = formatAccountNameWithoutCode(chartAcc);

                  // Calculate days diff for row highlighting safely
                  let daysDiff = 0;
                  try {
                    daysDiff = Math.ceil((new Date(titleDueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
                  } catch {
                    daysDiff = 0;
                  }
                  const isOverdue = balance > 0 && titleDueDate < today;
                  const isNearDue = balance > 0 && !isOverdue && !isNaN(daysDiff) && daysDiff >= 0 && daysDiff <= 3;

                  let rowColorClass = 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-l-transparent';
                  if (t.documentState === 'CANCELADO') {
                    rowColorClass = 'opacity-50 bg-slate-50/50 dark:bg-slate-900/40 border-l-4 border-l-slate-300 dark:border-l-slate-700';
                  } else if (t.settlementState === 'LIQUIDADO') {
                    rowColorClass = 'bg-emerald-50/25 hover:bg-emerald-50/50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 border-l-4 border-l-emerald-400';
                  } else if (isOverdue) {
                    // Soft red for overdue row with full dark contrast
                    rowColorClass = 'bg-rose-50/75 hover:bg-rose-100/80 border-l-4 border-l-rose-500 text-rose-950 dark:bg-rose-950/25 dark:hover:bg-rose-950/45 dark:border-l-rose-500 dark:text-rose-100 font-medium';
                  } else if (isNearDue) {
                    // Soft yellow for near due row with full dark contrast
                    rowColorClass = 'bg-amber-50/75 hover:bg-amber-100/80 border-l-4 border-l-amber-500 text-amber-950 dark:bg-amber-950/20 dark:hover:bg-amber-950/40 dark:border-l-amber-400 dark:text-amber-100 font-medium';
                  }

                  return (
                    <tr 
                      key={t.id}
                      onDoubleClick={() => handleStartEditTitle(t)}
                      title="💡 Dê um duplo clique para editar este lançamento"
                      className={`${rowColorClass} transition-colors cursor-pointer select-none ${
                        isSelected ? 'bg-amber-500/15 ring-1 ring-inset ring-amber-400' : ''
                      }`}
                    >
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelectOne(t.id, e as any)}
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer w-4 h-4"
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
                                title={`Número do título: ${t.titleNumber}`}
                                className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-200/80 dark:border-slate-800"
                              >
                                #{t.titleNumber}
                              </span>

                              {isBalanceFeeTitle(t) ? (
                                <span 
                                  title={`Taxa de Balanço Anual / 13º Honorário Contábil (${t.installmentIndex || 1}ª de ${t.totalInstallments || 1} parcelas)`}
                                  className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                                >
                                  <Scale className="w-2.5 h-2.5" />
                                  <span>Taxa de Balanço {t.installmentIndex && t.totalInstallments ? `(${t.installmentIndex}/${t.totalInstallments})` : ''}</span>
                                </span>
                              ) : (t.originType === 'CONTRATO' || (t.titleNumber && t.titleNumber.startsWith('FAT-')) || t.contractNumber) ? (
                                <span 
                                  title={`Título originado de Contrato Recorrente${t.contractNumber ? `: ${t.contractNumber}` : ''}`}
                                  className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                                >
                                  🏷️ Contrato {t.contractNumber || ''}
                                </span>
                              ) : null}
                              {(t.originType === 'VENDA' || (t.titleNumber && t.titleNumber.startsWith('VEN-')) || t.saleNumber) && (
                                <span 
                                  title={`Título originado de Venda Avulsa / Parcelada${t.saleNumber ? `: ${t.saleNumber}` : ''}`}
                                  className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30"
                                >
                                  🏷️ Venda {t.saleNumber || ''}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-slate-800">{client?.name || 'Cliente'}</span>
                          {portfolioRisk.customerProfiles[t.counterpartyId] && (
                            <span
                              title={`${portfolioRisk.customerProfiles[t.counterpartyId].recommendedAction} (Clique para copiar mensagem de cobrança WhatsApp)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const p = portfolioRisk.customerProfiles[t.counterpartyId];
                                if (p?.suggestedWhatsAppMessage) {
                                  navigator.clipboard.writeText(p.suggestedWhatsAppMessage);
                                  setToastMessage({ text: 'Mensagem WhatsApp copiada com sucesso!', type: 'success' });
                                }
                              }}
                              className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${portfolioRisk.customerProfiles[t.counterpartyId].riskColorClasses.badge}`}
                            >
                              <span>{portfolioRisk.customerProfiles[t.counterpartyId].riskBadgeLabel}</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-700">{client?.document}</div>
                      </td>

                      <td className="adv-only hidden xl:table-cell py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                        {formatCompetenceShort(t.competence)}
                      </td>

                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {formatDateBR(t.dueDate)}
                      </td>

                      <td className="adv-only hidden 2xl:table-cell py-3 px-4 text-slate-600">
                        {formatDateBR(t.expectedCashDate || t.dueDate)}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-700 font-medium">
                        {formatBRL(t.originalAmount)}
                      </td>

                      <td className="py-3 px-4 text-right font-bold text-slate-900 text-sm">
                        {formatBRL(t.balancePrincipal)}
                      </td>

                      <td className="hidden xl:table-cell py-3 px-4 text-center">
                        {t.balancePrincipal <= 0 ? (
                          <span className="text-[10px] font-medium text-slate-500">-</span>
                        ) : (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            tempStatus === 'VENCIDO'
                              ? 'bg-rose-100 text-rose-800'
                              : tempStatus === 'VENCE_HOJE'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-50 text-emerald-800'
                          }`}>
                            {tempStatus === 'VENCIDO' ? 'Vencido' : tempStatus === 'VENCE_HOJE' ? 'Vence Hoje' : 'A Vencer'}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap min-w-[96px]">
                        <div className="flex flex-col items-center justify-center gap-1">
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
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-2xs transition-colors inline-flex items-center"
                            title="Efetuar baixa de recebimento"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Baixar
                          </button>
                        )}

                        <button
                          onClick={() => handleStartEditTitle(t)}
                          disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                          className={`p-1 rounded transition-colors ${
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-60'
                              : 'text-slate-600 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer'
                          }`}
                          title={
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'Bloqueado: Título conciliado via banco não pode ser editado. Desfaça a conciliação na tela de Conciliação Bancária.'
                              : 'Editar lançamento (ou dê duplo clique na linha)'
                          }
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={(e) => handleDuplicateOne(t, e)}
                          className="p-1 text-slate-600 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
                          title="Duplicar este lançamento"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        {t.balancePrincipal > 0 && t.documentState !== 'CANCELADO' && (
                          <button
                            onClick={(e) => handleTriggerWhatsApp(t, e)}
                            className="p-1 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition-colors cursor-pointer"
                            title="Enviar aviso de cobrança via WhatsApp"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => setHistoryTitle(t)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
                          title="Ver detalhes e histórico de liquidações"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Gerar Recibo Oficial para o Cliente */}
                        {(t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL') && (
                          <button
                            onClick={() => setReceiptTitle(t)}
                            className="p-1 text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded transition-colors"
                            title="Gerar e Imprimir Recibo Oficial de Quitação para o Cliente"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        )}

                        {(t.settledPrincipal > 0 || t.settlementState === 'LIQUIDADO' || t.settlementState === 'PARCIAL') && (
                          <button
                            onClick={(e) => handleOpenSingleReopen(t, e)}
                            disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                            className={`p-1 rounded transition-colors ${
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-60'
                                : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer'
                            }`}
                            title={
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'Bloqueado: Título conciliado via banco. Desfaça a conciliação na tela de Conciliação Bancária antes de estornar.'
                                : 'Voltar para Em Aberto (estorna recebimentos e devolve saldo)'
                            }
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}

                        {t.balancePrincipal === t.originalAmount && t.documentState !== 'CANCELADO' && (
                          <button
                            onClick={(e) => handleOpenSingleCancel(t, e)}
                            disabled={t.reconciliationStatus === 'CONCILIADO' || Boolean(t.reconciledViaBank)}
                            className={`p-1 rounded transition-colors ${
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-60'
                                : 'text-amber-500 hover:text-amber-700 hover:bg-amber-50 cursor-pointer'
                            }`}
                            title={
                              t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                                ? 'Bloqueado: Título conciliado via banco não pode ser cancelado.'
                                : 'Cancelar Título (muda status para CANCELADO)'
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
                              : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer'
                          }`}
                          title={
                            t.reconciliationStatus === 'CONCILIADO' || t.reconciledViaBank
                              ? 'Bloqueado: Título conciliado via banco não pode ser excluído.'
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
        type="RECEBER"
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
          defaultType="RECEBER"
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
        type="RECEBER"
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
        type="RECEBER"
        titles={confirmModalState.titles}
        onClose={() => setConfirmModalState(prev => ({ ...prev, isOpen: false, titles: [] }))}
        onConfirm={handleExecuteConfirmedAction}
      />

      {/* Modal de Reabertura de Recebimento / Voltar para Em Aberto */}
      <ConfirmReopenTitlesModal
        isOpen={reopenModalState.isOpen}
        titles={reopenModalState.titles}
        type="RECEBER"
        onClose={() => setReopenModalState({ isOpen: false, titles: [] })}
        onConfirmed={(reopenedCount, message) => {
          setSelectedIds([]);
          setRefreshKey(k => k + 1);
          setToastMessage({
            type: 'success',
            text: message || `${reopenedCount} recebimento(s) voltaram para EM ABERTO!`
          });
        }}
      />

      {/* Assistente de Limpeza de Duplicidades */}
      <DeduplicationWizardModal
        isOpen={isDedupModalOpen}
        type="RECEBER"
        onClose={() => setIsDedupModalOpen(false)}
        onResolved={(deletedCount) => {
          setRefreshKey(k => k + 1);
          setToastMessage({
            type: 'success',
            text: `✓ ${deletedCount} duplicata(s) de títulos a receber removida(s) com sucesso!`
          });
        }}
      />

      {/* Modal de Emissão de Recibo Oficial */}
      <ReceiptModal
        isOpen={!!receiptTitle}
        title={receiptTitle}
        onClose={() => setReceiptTitle(null)}
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
