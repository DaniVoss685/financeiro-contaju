import React, { useState, useMemo } from 'react';
import { MoneyField } from '../Common/MoneyField';
import {
  RefreshCw,
  Play,
  Search,
  CheckCircle2,
  Calendar,
  FileText,
  Layers,
  ArrowUpRight,
  CalendarClock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Repeat,
  AlertTriangle,
  Folder,
  MessageCircle,
  Copy,
  ExternalLink,
  Edit,
  XCircle,
  PlusCircle,
  Check,
  Percent,
  DollarSign,
  Clock,
  ChevronRight
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR, formatCompetence, getAccountBadgeColorClasses, formatAccountNameWithoutCode } from '../../services/financialEngine';
import { matchesSearch } from '../../utils/searchUtils';
import { advanceCompetence, getDaysInMonth } from '../../utils/dateUtils';
import { Contract, FinancialTitle, ChartAccount, Counterparty } from '../../types';
import { ContractScheduleModal } from '../Modals/ContractScheduleModal';
import { toast } from '../../hooks/useToast';
import { PremiumSelect } from '../Common/PremiumSelect';

interface RecurrencesViewProps {
  onOpenBillingModal: () => void;
}

interface ExpenseRecurringSeries {
  seriesKey: string;
  counterpartyId: string;
  counterpartyName: string;
  counterpartyPhone?: string;
  counterpartyEmail?: string;
  description: string;
  chartAccountId?: string;
  chartAccount?: ChartAccount | null;
  amount: number;
  dueDay: number;
  openCount: number;
  totalCount: number;
  nextCompetence: string;
  lastCompetence: string;
  totalFutureAmount: number;
  openTitles: FinancialTitle[];
  allTitles: FinancialTitle[];
}

export const RecurrencesView: React.FC<RecurrencesViewProps> = ({ onOpenBillingModal }) => {
  const [activeTab, setActiveTab] = useState<'RECEITAS' | 'DESPESAS' | 'ALERTAS'>('RECEITAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContractForSchedule, setSelectedContractForSchedule] = useState<Contract | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modais de ações em massa para despesas recorrentes
  const [adjustModalSeries, setAdjustModalSeries] = useState<ExpenseRecurringSeries | null>(null);
  const [adjustMode, setAdjustMode] = useState<'VALUE' | 'PERCENT'>('VALUE');
  const [adjustValue, setAdjustValue] = useState<number>(0);
  const [adjustPercent, setAdjustPercent] = useState<number>(5);

  const [extendModalSeries, setExtendModalSeries] = useState<ExpenseRecurringSeries | null>(null);
  const [extendMonthsCount, setExtendMonthsCount] = useState<number>(12);

  const [cancelModalSeries, setCancelModalSeries] = useState<ExpenseRecurringSeries | null>(null);

  const contracts = storage.getContracts();
  const clients = storage.getCounterparties();
  const allTitles = storage.getTitles();
  const chartAccounts = storage.getChartAccounts();
  const today = new Date().toISOString().split('T')[0];
  const todayCompetence = today.substring(0, 7);
  const currentUser = storage.getCurrentUser();

  // 1. RECEITAS RECORRENTES (Contratos)
  const activeRecurrences = useMemo(() => {
    return contracts.filter(c => 
      c.status === 'ATIVO' && 
      c.isRecurring !== false && 
      c.contractType !== 'AVULSO'
    );
  }, [contracts]);

  const totalMonthlyMRR = useMemo(() => {
    return activeRecurrences.reduce((acc, c) => acc + (c.monthlyTotal || 0), 0);
  }, [activeRecurrences]);

  const filteredContracts = useMemo(() => {
    return activeRecurrences.filter(c => {
      const client = clients.find(cl => cl.id === (c.customerId || (c as any).clientId));
      return matchesSearch([
        c.contractNumber,
        client?.name,
        client?.document,
        String(c.dueDay),
        String(c.monthlyTotal)
      ], searchTerm);
    });
  }, [activeRecurrences, clients, searchTerm]);

  // 2. DESPESAS RECORRENTES (Séries de Pagamento)
  const expenseSeries = useMemo(() => {
    const payables = allTitles.filter(t => 
      t.type === 'PAGAR' && 
      (t.originType === 'RECORRENCIA_PAGAR' || (t.notes && t.notes.toLowerCase().includes('recorr')))
    );

    const seriesMap = new Map<string, FinancialTitle[]>();
    for (const t of payables) {
      const cleanDesc = (t.description || '').replace(/\s*-\s*\d{4}-\d{2}$/, '').trim();
      const key = `${t.counterpartyId}_${cleanDesc.toLowerCase()}`;
      const list = seriesMap.get(key) || [];
      list.push(t);
      seriesMap.set(key, list);
    }

    const seriesList: ExpenseRecurringSeries[] = [];
    for (const [key, titles] of seriesMap.entries()) {
      titles.sort((a, b) => (a.competence || a.dueDate).localeCompare(b.competence || b.dueDate));
      const first = titles[0];
      const supplier = clients.find(c => c.id === first.counterpartyId);
      const chartAcc = chartAccounts.find(a => a.id === first.accountId);
      const openTitles = titles.filter(t => t.settlementState !== 'LIQUIDADO' && t.documentState !== 'CANCELADO');

      let dueDay = 10;
      if (first.dueDate && first.dueDate.includes('-')) {
        dueDay = parseInt(first.dueDate.split('-')[2], 10) || 10;
      }

      const cleanDesc = (first.description || '').replace(/\s*-\s*\d{4}-\d{2}$/, '').trim();
      const totalFuture = openTitles.reduce((acc, t) => acc + (Number(t.balancePrincipal) || Number(t.originalAmount) || 0), 0);

      seriesList.push({
        seriesKey: key,
        counterpartyId: first.counterpartyId,
        counterpartyName: supplier?.name || supplier?.tradeName || 'Fornecedor',
        counterpartyPhone: supplier?.phone,
        counterpartyEmail: supplier?.email,
        description: cleanDesc,
        chartAccountId: first.accountId,
        chartAccount: chartAcc,
        amount: Number(first.originalAmount) || 0,
        dueDay,
        openCount: openTitles.length,
        totalCount: titles.length,
        nextCompetence: openTitles[0]?.competence || titles[titles.length - 1]?.competence || '',
        lastCompetence: titles[titles.length - 1]?.competence || '',
        totalFutureAmount: totalFuture,
        openTitles,
        allTitles: titles
      });
    }

    return seriesList;
  }, [allTitles, clients, chartAccounts, refreshTrigger]);

  const filteredExpenseSeries = useMemo(() => {
    return expenseSeries.filter(s => {
      return matchesSearch([
        s.description,
        s.counterpartyName,
        String(s.dueDay),
        String(s.amount),
        s.chartAccount?.name
      ], searchTerm);
    });
  }, [expenseSeries, searchTerm]);

  const totalMonthlyExpenses = useMemo(() => {
    return expenseSeries
      .filter(s => s.openCount > 0)
      .reduce((acc, s) => acc + s.amount, 0);
  }, [expenseSeries]);

  // 3. ALERTAS PREVENTIVOS DE VENCIMENTOS RECORRENTES (Próximos 7 dias ou Vencidos)
  const upcomingRecurringTitles = useMemo(() => {
    const todayObj = new Date(today + 'T00:00:00');
    return allTitles.filter(t => {
      if (t.documentState === 'CANCELADO' || t.settlementState === 'LIQUIDADO') return false;
      const isRec = t.originType === 'CONTRATO' || t.originType === 'RECORRENCIA_PAGAR' || (t.notes && t.notes.toLowerCase().includes('recorr'));
      if (!isRec) return false;
      if (!t.dueDate) return false;
      try {
        const dueObj = new Date(t.dueDate + 'T00:00:00');
        const diffDays = Math.ceil((dueObj.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      } catch {
        return false;
      }
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [allTitles, today, refreshTrigger]);

  const filteredUpcomingTitles = useMemo(() => {
    return upcomingRecurringTitles.filter(t => {
      const party = clients.find(c => c.id === t.counterpartyId);
      return matchesSearch([
        t.titleNumber,
        t.description,
        party?.name,
        party?.tradeName,
        t.dueDate,
        String(t.originalAmount)
      ], searchTerm);
    });
  }, [upcomingRecurringTitles, clients, searchTerm]);

  // Ações em massa para Despesas Recorrentes
  const handleExecuteBulkAdjust = () => {
    if (!adjustModalSeries) return;
    let targetAmount = adjustValue;
    if (adjustMode === 'PERCENT') {
      targetAmount = Math.round(adjustModalSeries.amount * (1 + adjustPercent / 100) * 100) / 100;
    }
    if (targetAmount <= 0) {
      toast.error('Informe um valor superior a zero para o reajuste.');
      return;
    }

    const titlesToUpdate = adjustModalSeries.openTitles;
    titlesToUpdate.forEach(t => {
      const newBal = Math.max(0, targetAmount - (t.settledPrincipal || 0));
      storage.updateTitle(t.id, {
        originalAmount: targetAmount,
        balancePrincipal: newBal
      });
    });

    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'REAJUSTE_SERIE_RECORRENTE',
      module: 'Contas a Pagar',
      recordId: adjustModalSeries.seriesKey,
      details: `Reajuste em lote na série recorrente "${adjustModalSeries.description}". ${titlesToUpdate.length} títulos atualizados para ${formatBRL(targetAmount)}.`
    });

    toast.success(`Reajuste aplicado com sucesso! ${titlesToUpdate.length} meses futuros foram atualizados para ${formatBRL(targetAmount)}.`);
    setAdjustModalSeries(null);
    setRefreshTrigger(k => k + 1);
  };

  const handleExecuteBulkCancel = () => {
    if (!cancelModalSeries) return;
    const titlesToCancel = cancelModalSeries.openTitles;
    if (titlesToCancel.length === 0) return;

    titlesToCancel.forEach(t => {
      storage.updateTitle(t.id, {
        documentState: 'CANCELADO',
        notes: t.notes ? `${t.notes} [Cancelado em lote no Gestor de Recorrências]` : 'Cancelado em lote no Gestor de Recorrências'
      });
    });

    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CANCELAMENTO_SERIE_RECORRENTE',
      module: 'Contas a Pagar',
      recordId: cancelModalSeries.seriesKey,
      details: `Cancelamento de ${titlesToCancel.length} meses futuros da despesa recorrente "${cancelModalSeries.description}".`
    });

    toast.success(`${titlesToCancel.length} meses futuros da despesa foram cancelados.`);
    setCancelModalSeries(null);
    setRefreshTrigger(k => k + 1);
  };

  const handleExecuteExtendSeries = () => {
    if (!extendModalSeries || extendMonthsCount <= 0) return;
    const lastComp = extendModalSeries.lastCompetence || todayCompetence;
    const startMonth = advanceCompetence(lastComp, 1);
    const newTitles: FinancialTitle[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < extendMonthsCount; i++) {
      const targetComp = advanceCompetence(startMonth, i);
      const [tYear, tMonth] = targetComp.split('-').map(Number);
      const maxDays = getDaysInMonth(tYear, tMonth);
      const actualDay = Math.min(extendModalSeries.dueDay, maxDays);
      const targetDueDate = `${targetComp}-${String(actualDay).padStart(2, '0')}`;

      const newId = `title-rec-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;
      const cleanTitleNumber = (extendModalSeries.allTitles[0]?.titleNumber || 'TIT').split(' - ')[0];
      const newTitleNumber = `${cleanTitleNumber} - ${targetComp}`;

      newTitles.push({
        id: newId,
        companyId: 'comp-1',
        titleNumber: newTitleNumber,
        type: 'PAGAR',
        counterpartyId: extendModalSeries.counterpartyId,
        description: extendModalSeries.description,
        launchDate: today,
        issueDate: today,
        competence: targetComp,
        dueDate: targetDueDate,
        expectedCashDate: targetDueDate,
        originalAmount: extendModalSeries.amount,
        settledPrincipal: 0,
        balancePrincipal: extendModalSeries.amount,
        accruedInterest: 0,
        accruedFine: 0,
        documentState: 'CONFIRMADO',
        settlementState: 'ABERTO',
        originType: 'RECORRENCIA_PAGAR',
        accountId: extendModalSeries.chartAccountId || '',
        notes: 'Prorrogação de meses futuros via Gestor Central de Recorrências',
        createdAt: now,
        updatedAt: now
      });
    }

    storage.saveTitles([...newTitles, ...allTitles]);
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'PRORROGACAO_SERIE_RECORRENTE',
      module: 'Contas a Pagar',
      recordId: extendModalSeries.seriesKey,
      details: `Prorrogação de ${extendMonthsCount} meses da despesa recorrente "${extendModalSeries.description}" a partir de ${startMonth}.`
    });

    toast.success(`Prorrogação concluída! ${extendMonthsCount} novos meses foram adicionados à programação.`);
    setExtendModalSeries(null);
    setRefreshTrigger(k => k + 1);
  };

  // Gerador de mensagem WhatsApp preventiva
  const generateWhatsAppMessage = (title: FinancialTitle) => {
    const party = clients.find(c => c.id === title.counterpartyId);
    const partyName = party?.name || party?.tradeName || 'Prezado(a)';
    const valFormatted = formatBRL(title.balancePrincipal || title.originalAmount);
    const dateFormatted = formatDateBR(title.dueDate);

    if (title.type === 'RECEBER') {
      return `Olá, ${partyName}! Tudo bem?\n\nPassando para lembrar sobre a sua fatura/honorário referente a *${title.description}* no valor de *${valFormatted}*, com vencimento em *${dateFormatted}*.\n\nCaso já tenha efetuado o pagamento, por gentileza desconsidere este aviso. Estamos à disposição!`;
    } else {
      return `⚠️ *Aviso de Pagamento - Contaju*\n\nInformamos que a despesa recorrente *${title.description}* de *${partyName}* no valor de *${valFormatted}* tem vencimento programado para *${dateFormatted}*.\n${title.barcode ? `Linha Digitável: ${title.barcode}\n` : ''}Favor providenciar a quitação na tesouraria.`;
    }
  };

  const handleSendWhatsApp = (title: FinancialTitle) => {
    const party = clients.find(c => c.id === title.counterpartyId);
    const phone = (party?.phone || '').replace(/\D/g, '');
    let finalPhone = phone;
    if (phone.length >= 10 && !phone.startsWith('55')) {
      finalPhone = `55${phone}`;
    }

    const msg = generateWhatsAppMessage(title);
    const url = finalPhone 
      ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success('WhatsApp aberto em nova guia!');
  };

  const handleCopyMessage = (title: FinancialTitle) => {
    const msg = generateWhatsAppMessage(title);
    navigator.clipboard.writeText(msg);
    toast.success('Mensagem copiada para a área de transferência!');
  };

  return (
    <div className="space-y-6">
      
      {/* Header com Navegação de Abas */}
      <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-600 dark:text-purple-400">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Gestor Central de Recorrências
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Visão unificada de receitas contratadas, despesas recorrentes programadas e alertas preventivos.
              </p>
            </div>
          </div>

          {activeTab === 'RECEITAS' && (
            <button
              onClick={onOpenBillingModal}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Gerar Lote de Faturamento</span>
            </button>
          )}
        </div>

        {/* Abas Superiores */}
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pt-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => { setActiveTab('RECEITAS'); setSearchTerm(''); }}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'RECEITAS'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Receitas Recorrentes (Contratos)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              {activeRecurrences.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('DESPESAS'); setSearchTerm(''); }}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'DESPESAS'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>Despesas Recorrentes (A Pagar)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300">
              {expenseSeries.length}
            </span>
          </button>

          <button
            onClick={() => { setActiveTab('ALERTAS'); setSearchTerm(''); }}
            className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'ALERTAS'
                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>Alertas Preventivos (WhatsApp)</span>
            {upcomingRecurringTitles.length > 0 && (
              <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-purple-500 text-white animate-pulse">
                {upcomingRecurringTitles.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* KPI Cards Dinâmicos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {activeTab === 'RECEITAS' ? (
          <>
            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Contratos Recorrentes Ativos
              </span>
              <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {activeRecurrences.length} contratos
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Regras ativas gerando títulos automáticos
              </span>
            </div>

            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                MRR Recorrente Contratado
              </span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                {formatBRL(totalMonthlyMRR)}
                <span className="text-xs font-normal text-[var(--text-secondary)] ml-1">/mês</span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Receita previsível contratada
              </span>
            </div>

            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Competência Vigente
              </span>
              <div className="text-xl font-bold text-[var(--text-primary)] mt-1 font-mono">
                {todayCompetence}
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Pronto para faturamento do mês
              </span>
            </div>
          </>
        ) : activeTab === 'DESPESAS' ? (
          <>
            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Séries de Despesas Ativas
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                {expenseSeries.filter(s => s.openCount > 0).length} séries
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Contas e contratos a pagar recorrentes
              </span>
            </div>

            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Desembolso Mensal Previsto
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 font-mono">
                {formatBRL(totalMonthlyExpenses)}
                <span className="text-xs font-normal text-[var(--text-secondary)] ml-1">/mês</span>
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Total fixo recorrente a pagar
              </span>
            </div>

            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Comprometimento Futuro
              </span>
              <div className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1 font-mono">
                {formatBRL(expenseSeries.reduce((acc, s) => acc + s.totalFutureAmount, 0))}
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Total já programado para meses futuros
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Vencimentos nos Próximos 7 Dias
              </span>
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {upcomingRecurringTitles.length} títulos
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Títulos recorrentes próximos do prazo
              </span>
            </div>

            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Recebimentos em Alerta
              </span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                {formatBRL(upcomingRecurringTitles.filter(t => t.type === 'RECEBER').reduce((acc, t) => acc + (t.balancePrincipal || t.originalAmount), 0))}
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Cobrança amigável preventiva
              </span>
            </div>

            <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
                Pagamentos em Alerta
              </span>
              <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 font-mono">
                {formatBRL(upcomingRecurringTitles.filter(t => t.type === 'PAGAR').reduce((acc, t) => acc + (t.balancePrincipal || t.originalAmount), 0))}
              </div>
              <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
                Alerta para tesouraria não pagar juros
              </span>
            </div>
          </>
        )}
      </div>

      {/* Conteúdo da Aba 1: Receitas Recorrentes (Contratos) */}
      {activeTab === 'RECEITAS' && (
        <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Regras de Emissão Periódica Configuradas ({filteredContracts.length})
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Geração idempotente com verificação automática de duplicidade por competência.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                placeholder="Buscar por contrato ou cliente..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Contrato</th>
                  <th className="py-3 px-4">Cliente Favorecido</th>
                  <th className="py-3 px-4 text-center">Dia Vencimento</th>
                  <th className="py-3 px-4 text-right">Honorário Mensal</th>
                  <th className="py-3 px-4 text-center">Próximos Meses</th>
                  <th className="py-3 px-4 text-center">Início da Vigência</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredContracts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--text-secondary)]">
                      Nenhum contrato recorrente ativo encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredContracts.map(c => {
                    const client = clients.find(cl => cl.id === (c.customerId || (c as any).clientId));
                    const scheduledTitles = allTitles.filter(t => t.originType === 'CONTRATO' && t.originId === c.id && t.documentState !== 'CANCELADO');
                    const count = scheduledTitles.length;

                    return (
                      <tr key={c.id} className="hover:bg-[var(--surface-elevated)]/40 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-amber-700 dark:text-amber-300">
                          {c.contractNumber}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[var(--text-primary)]">
                          {client?.name || 'Cliente'}
                          {client?.document && (
                            <span className="block text-[10px] font-mono text-[var(--text-secondary)]">
                              {client.document}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-[var(--text-primary)]">
                          Dia {c.dueDay}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatBRL(c.monthlyTotal || 0)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            <CalendarClock className="w-3.5 h-3.5" />
                            <span>{count} meses programados</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center text-[var(--text-secondary)] font-mono">
                          {formatDateBR(c.startDate)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedContractForSchedule(c);
                              setIsScheduleModalOpen(true);
                            }}
                            className="px-3 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                            title="Gerenciar e gerar meses futuros deste contrato"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>Próximos Meses</span>
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
      )}

      {/* Conteúdo da Aba 2: Despesas Recorrentes (A Pagar) */}
      {activeTab === 'DESPESAS' && (
        <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Séries de Despesas Recorrentes Configuradas ({filteredExpenseSeries.length})
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Ações em massa para reajuste de valor, prorrogação de meses ou cancelamento futuro.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                placeholder="Buscar despesa ou fornecedor..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Descrição da Despesa</th>
                  <th className="py-3 px-4">Fornecedor / Favorecido</th>
                  <th className="py-3 px-4">Categoria Contábil</th>
                  <th className="py-3 px-4 text-center">Dia Vencimento</th>
                  <th className="py-3 px-4 text-right">Valor Mensal</th>
                  <th className="py-3 px-4 text-center">Meses Futuros</th>
                  <th className="py-3 px-4 text-right">Ações em Massa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredExpenseSeries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--text-secondary)]">
                      Nenhuma despesa recorrente cadastrada no momento.
                    </td>
                  </tr>
                ) : (
                  filteredExpenseSeries.map(s => {
                    const catColors = getAccountBadgeColorClasses(s.chartAccount);
                    const catName = formatAccountNameWithoutCode(s.chartAccount);

                    return (
                      <tr key={s.seriesKey} className="hover:bg-[var(--surface-elevated)]/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-[var(--text-primary)]">
                          {s.description}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[var(--text-secondary)]">
                          {s.counterpartyName}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md border ${catColors.container}`}>
                            <Folder className={`w-3 h-3 ${catColors.icon} shrink-0`} />
                            <span>{catName}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold text-[var(--text-primary)]">
                          Dia {s.dueDay}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                          {formatBRL(s.amount)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {s.openCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                              <CalendarClock className="w-3.5 h-3.5" />
                              <span>{s.openCount} meses em aberto</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-semibold">
                              Finalizada ({s.totalCount} quitados)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {s.openCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustModalSeries(s);
                                  setAdjustValue(s.amount);
                                  setAdjustPercent(5);
                                  setAdjustMode('VALUE');
                                }}
                                className="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                                title="Reajustar valor de todos os meses futuros em lote"
                              >
                                <DollarSign className="w-3 h-3 text-amber-500" />
                                <span>Reajustar</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setExtendModalSeries(s);
                                setExtendMonthsCount(12);
                              }}
                              className="px-2.5 py-1 bg-purple-500/15 hover:bg-purple-500/25 text-purple-700 dark:text-purple-300 border border-purple-500/30 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                              title="Prorrogar série gerando novos meses futuros"
                            >
                              <PlusCircle className="w-3 h-3 text-purple-500" />
                              <span>Prorrogar</span>
                            </button>

                            {s.openCount > 0 && (
                              <button
                                type="button"
                                onClick={() => setCancelModalSeries(s)}
                                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/20 rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                                title="Cancelar meses futuros em aberto desta despesa"
                              >
                                <XCircle className="w-3 h-3 text-rose-500" />
                                <span>Pausar</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conteúdo da Aba 3: Alertas Preventivos de Vencimentos & WhatsApp */}
      {activeTab === 'ALERTAS' && (
        <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                <span>Alertas de Vencimentos Recorrentes ({filteredUpcomingTitles.length})</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-700 dark:text-purple-300">
                  Próximos 7 dias
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Envio direto de lembretes via WhatsApp ou e-mail com mensagens pré-formatadas para cobrança amigável ou tesouraria.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
              <input
                type="text"
                placeholder="Buscar por lançamento ou favorecido..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Descrição / Título</th>
                  <th className="py-3 px-4">Cliente / Fornecedor</th>
                  <th className="py-3 px-4 text-center">Vencimento</th>
                  <th className="py-3 px-4 text-right">Valor em Aberto</th>
                  <th className="py-3 px-4 text-right">Disparo Preventivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredUpcomingTitles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[var(--text-secondary)]">
                      Nenhum título recorrente vencendo nos próximos 7 dias. Tudo em dia!
                    </td>
                  </tr>
                ) : (
                  filteredUpcomingTitles.map(t => {
                    const party = clients.find(c => c.id === t.counterpartyId);
                    const isOverdue = (t.dueDate || today) < today;

                    return (
                      <tr key={t.id} className="hover:bg-[var(--surface-elevated)]/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            t.type === 'RECEBER'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                          }`}>
                            {t.type === 'RECEBER' ? 'Receber' : 'Pagar'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-[var(--text-primary)]">
                          {t.description}
                          <span className="block text-[10px] font-mono text-slate-500 font-normal">
                            #{t.titleNumber}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-[var(--text-secondary)]">
                          {party?.name || party?.tradeName || 'Contraparte'}
                          {party?.phone && (
                            <span className="block text-[10px] font-mono text-slate-500">
                              Tel: {party.phone}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold">
                          <span className={isOverdue ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>
                            {formatDateBR(t.dueDate)}
                          </span>
                          <span className="block text-[9px] font-sans font-semibold text-slate-500">
                            {isOverdue ? 'Vencido' : 'Vence em breve'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-[var(--text-primary)]">
                          {formatBRL(t.balancePrincipal || t.originalAmount)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSendWhatsApp(t)}
                              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold transition-all inline-flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Abrir mensagem pronta no WhatsApp Web/App"
                            >
                              <MessageCircle className="w-3.5 h-3.5 fill-current" />
                              <span>WhatsApp</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(t)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                              title="Copiar mensagem pré-formatada"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Cronograma & Faturamento dos Próximos Meses */}
      <ContractScheduleModal
        contract={selectedContractForSchedule}
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setSelectedContractForSchedule(null);
        }}
      />

      {/* Modal de Reajuste em Massa para Despesa Recorrente */}
      {adjustModalSeries && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1B212D] rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Reajustar Valores da Série em Massa
                </h3>
              </div>
              <button
                onClick={() => setAdjustModalSeries(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-[11px] text-slate-500 block">Despesa selecionada:</span>
                <strong className="text-slate-900 dark:text-slate-100 text-sm block">
                  {adjustModalSeries.description}
                </strong>
                <span className="text-slate-600 dark:text-slate-400 text-[11px] block mt-1">
                  Fornecedor: {adjustModalSeries.counterpartyName} • Valor atual: {formatBRL(adjustModalSeries.amount)}
                </span>
                <span className="text-purple-600 dark:text-purple-400 text-[11px] font-bold block mt-1">
                  Afetará {adjustModalSeries.openCount} mês(es) futuros em aberto.
                </span>
              </div>

              <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAdjustMode('VALUE')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    adjustMode === 'VALUE' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Novo Valor Fixo (R$)
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustMode('PERCENT')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    adjustMode === 'PERCENT' ? 'bg-white dark:bg-slate-700 text-amber-600 shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Percentual de Reajuste (%)
                </button>
              </div>

              {adjustMode === 'VALUE' ? (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Informe o novo valor mensal (R$) *
                  </label>
                  <MoneyField value={Number(adjustValue) || 0} onChange={(v: number) => setAdjustValue(v)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-bold bg-white dark:bg-slate-900" />
                </div>
              ) : (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Percentual de Reajuste (%) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={adjustPercent}
                    onChange={e => setAdjustPercent(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-bold bg-white dark:bg-slate-900"
                    placeholder="Ex: 5 para +5%"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Novo valor calculado: <strong>{formatBRL(adjustModalSeries.amount * (1 + adjustPercent / 100))}</strong>
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setAdjustModalSeries(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkAdjust}
                className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-md cursor-pointer"
              >
                Confirmar Reajuste em Massa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Prorrogação de Meses Futuros */}
      {extendModalSeries && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1B212D] rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Prorrogar Série de Despesa Recorrente
                </h3>
              </div>
              <button
                onClick={() => setExtendModalSeries(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Adicione novos meses à esteira recorrente de <strong>{extendModalSeries.description}</strong> ({formatBRL(extendModalSeries.amount)}/mês, dia {extendModalSeries.dueDay}).
              </p>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Quantos meses deseja adicionar? *
                </label>
                <PremiumSelect
                  value={extendMonthsCount}
                  onChange={e => setExtendMonthsCount(parseInt(e.target.value, 10))}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs bg-white dark:bg-slate-900 font-bold"
                >
                  <option value="3">+ 3 meses (Trimestral)</option>
                  <option value="6">+ 6 meses (Semestral)</option>
                  <option value="12">+ 12 meses (1 ano adicional)</option>
                  <option value="24">+ 24 meses (2 anos adicionais)</option>
                </PremiumSelect>
              </div>

              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-[11px] text-purple-800 dark:text-purple-300">
                Serão gerados <strong>{extendMonthsCount} novos títulos</strong> a partir do mês seguinte à última competência cadastrada ({extendModalSeries.lastCompetence || todayCompetence}).
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setExtendModalSeries(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteExtendSeries}
                className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-md cursor-pointer"
              >
                Adicionar {extendMonthsCount} Meses
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Cancelamento de Meses Futuros */}
      {cancelModalSeries && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1B212D] rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Cancelar Meses Futuros da Despesa?
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Você está prestes a cancelar <strong>{cancelModalSeries.openCount} lançamentos futuros em aberto</strong> da despesa <strong>{cancelModalSeries.description}</strong>.
            </p>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ⚠️ Os meses passados que já foram pagos/liquidados serão preservados intactos. Esta ação cancelará apenas os títulos que ainda estão pendentes.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCancelModalSeries(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkCancel}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl shadow-md cursor-pointer"
              >
                Confirmar Cancelamento em Lote
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
