import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  FileText, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  HelpCircle, 
  ArrowUpRight, 
  ArrowDownRight,
  Receipt,
  Calendar,
  Settings2,
  Sliders,
  Sparkles,
  Building2,
  Layers,
  CreditCard,
  BarChart3,
  Percent,
  DollarSign,
  RefreshCw,
  Check,
  ArrowRight,
  ShieldCheck,
  Users,
  UserPlus,
  UserCheck,
  UserMinus,
  Table,
  ShieldAlert
} from 'lucide-react';
import { BankAccount, FinancialTitle } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR, getTemporalStatus } from '../../services/financialEngine';
import { ReportingEngine } from '../../services/reportingEngine';
import { NavigationScreen } from '../Sidebar';
import { useDashboardConfig } from '../../hooks/useDashboardConfig';
import { useModulePeriod } from '../../hooks/useModulePeriod';
import { ModulePeriodNavigator } from '../Common/ModulePeriodNavigator';
import { PendingAlertsWidget } from './PendingAlertsWidget';
import { CashLiquiditySimulationWidget } from './CashLiquiditySimulationWidget';
import { AnnualKpiComparisonView } from './AnnualKpiComparisonView';
import { ChurnRiskWidget } from './ChurnRiskWidget';
import { CohortRetentionView } from './CohortRetentionView';
import { StressTestingView } from './StressTestingView';
import { BankAccountStatementModal } from '../Financial/BankAccountStatementModal';
import { EditTitleModal } from '../Modals/EditTitleModal';
import { PageToolbar, Button, TabPills, Card, IconTile, IconBadge, Badge, Disclosure, MoreMenu } from '../Common/ui';
import { TReceipt, TBank, TWallet, TTrendUp, TChart, TAlert, TRepeat } from '../Common/tileIcons';

interface DashboardViewProps {
  onNavigate: (screen: NavigationScreen) => void;
  onOpenNewTitleModal: (type: 'RECEBER' | 'PAGAR') => void;
  onOpenBillingModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenNewTitleModal,
  onOpenBillingModal
}) => {
  const today = new Date().toISOString().split('T')[0];
  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth(); // 0-based

  const { config, toggleKpi, toggleWidget, updateConfig, resetToDefault } = useDashboardConfig();
  const { period } = useModulePeriod('DASHBOARD');

  // Arrays seguros para evitar quebras por valores legados no localStorage
  const safeVisibleKpis = useMemo(() => {
    return Array.isArray(config?.visibleKpis) && config.visibleKpis.length > 0
      ? config.visibleKpis
      : ['faturamento_bruto', 'resultado_liquido', 'mrr', 'clientes_ativos', 'crescimento_clientes', 'inadimplencia', 'saldo_disponivel', 'entradas_caixa', 'saidas_caixa'];
  }, [config?.visibleKpis]);

  const safeVisibleWidgets = useMemo(() => {
    return Array.isArray(config?.visibleWidgets) && config.visibleWidgets.length > 0
      ? config.visibleWidgets
      : ['widget_avisos_pendentes', 'widget_risco_churn', 'widget_faturamento_resumo', 'widget_saldos_consolidados', 'widget_resumo_clientes', 'widget_dre_economico', 'widget_posicao_caixa', 'widget_proximos_vencimentos'];
  }, [config?.visibleWidgets]);

  // Trigger para recálculo instantâneo ao salvar alterações de títulos
  const [dashboardRefreshTrigger, setDashboardRefreshTrigger] = useState(0);

  // Tab: 'DASHBOARD' | 'ANNUAL_KPIS' | 'COHORT' | 'CHURN_RISK' | 'STRESS_TEST' | 'KPIS_CONFIG'
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'ANNUAL_KPIS' | 'COHORT' | 'CHURN_RISK' | 'STRESS_TEST' | 'KPIS_CONFIG'>('DASHBOARD');
  // Modo de exibição no bloco de KPIs: 'MONTH_CARDS' | 'ANNUAL_TABLE'
  const [kpiDisplayMode, setKpiDisplayMode] = useState<'MONTH_CARDS' | 'ANNUAL_TABLE'>('MONTH_CARDS');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  // Modal de edição de títulos aberto por clique nas linhas do dashboard
  const [selectedTitleForEdit, setSelectedTitleForEdit] = useState<FinancialTitle | null>(null);
  const [isEditTitleModalOpen, setIsEditTitleModalOpen] = useState(false);

  const handleOpenEditTitle = (title: FinancialTitle) => {
    setSelectedTitleForEdit(title);
    setIsEditTitleModalOpen(true);
  };

  const handleTitleSaved = () => {
    setDashboardRefreshTrigger(prev => prev + 1);
  };

  // Extrato bancário aberto por duplo clique
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [selectedAccountForStatement, setSelectedAccountForStatement] = useState<BankAccount | null>(null);

  const handleOpenAccountStatement = (acc: BankAccount) => {
    setSelectedAccountForStatement(acc);
    setIsStatementModalOpen(true);
  };

  // Effective year & month factoring in global period filter
  const effectiveYear = period.active ? period.year : selectedYear;
  const effectiveMonthIdx = period.active && period.month > 0 ? period.month - 1 : currentMonthIdx;
  const currentCompetenceStr = `${effectiveYear}-${String(effectiveMonthIdx + 1).padStart(2, '0')}`;

  // 1. DRE Data (Competence) memoizado
  const { dreData, currentMonthGrossRevenue, currentMonthNetResult, ytdGrossRevenue, ytdNetResult, ytdMargin, monthMargin } = useMemo(() => {
    const dre = ReportingEngine.generateDRE(effectiveYear);
    const grossRev = dre.lines[0]?.valuesByMonth[effectiveMonthIdx] || 0;
    const netRes = dre.netResults[effectiveMonthIdx] || 0;
    const ytdGross = dre.lines[0]?.totalYear || 0;
    const ytdNet = dre.totalNetResult || 0;
    const ytdMarg = ytdGross > 0 ? (ytdNet / ytdGross) * 100 : 0;
    const monthMarg = grossRev > 0 ? (netRes / grossRev) * 100 : 0;
    return {
      dreData: dre,
      currentMonthGrossRevenue: grossRev,
      currentMonthNetResult: netRes,
      ytdGrossRevenue: ytdGross,
      ytdNetResult: ytdNet,
      ytdMargin: ytdMarg,
      monthMargin: monthMarg
    };
  }, [effectiveYear, effectiveMonthIdx, dashboardRefreshTrigger]);

  // 2. Cash Data (Realized Cash Flow) memoizado
  const { cashData, consolidatedCash, currentMonthCashInflow, currentMonthCashOutflow, currentMonthNetCash } = useMemo(() => {
    const cash = ReportingEngine.generateCashFlow(effectiveYear, 'REALIZADO');
    const consolidated = FinancialEngine.getConsolidatedCashBalance();
    const opInLine = cash.lines.find(l => l.id === 'cf-op-in') || cash.lines[2];
    const opOutLine = cash.lines.find(l => l.id === 'cf-op-out') || cash.lines[3];
    const inflow = opInLine?.valuesByMonth[effectiveMonthIdx] || 0;
    const outflow = opOutLine?.valuesByMonth[effectiveMonthIdx] || 0;
    return {
      cashData: cash,
      consolidatedCash: consolidated,
      currentMonthCashInflow: inflow,
      currentMonthCashOutflow: outflow,
      currentMonthNetCash: inflow - outflow
    };
  }, [effectiveYear, effectiveMonthIdx, dashboardRefreshTrigger]);

  // 3. Bank Accounts Detailed memoizado
  const { bankAccounts, bankAccountsWithBalance } = useMemo(() => {
    const accounts = storage.getBankAccounts().filter(b => b.status === 'ATIVO');
    const withBal = accounts.map(b => ({
      ...b,
      calculatedBalance: FinancialEngine.getAccountBalance(b.id)
    }));
    return { bankAccounts: accounts, bankAccountsWithBalance: withBal };
  }, [dashboardRefreshTrigger]);

  // 4. Portfolio, Contracts & Billing memoizado
  const { 
    titles, 
    counterparties, 
    contracts, 
    receivables, 
    payables, 
    openReceivables, 
    openPayables, 
    mrr, 
    delinquency, 
    activeContractsCount, 
    averageTicket,
    titlesThisCompetence,
    contractsBilledCount,
    contractsPendingCount,
    totalBilledThisMonth
  } = useMemo(() => {
    const confirmedTitles = storage.getTitles().filter(t => t.documentState === 'CONFIRMADO');
    const allCounterparties = storage.getCounterparties();
    const activeContracts = storage.getContracts().filter(c => c.status === 'ATIVO');

    const rec = confirmedTitles.filter(t => t.type === 'RECEBER');
    const pay = confirmedTitles.filter(t => t.type === 'PAGAR');

    const openRec = rec.reduce((acc, t) => acc + t.balancePrincipal, 0);
    const openPay = pay.reduce((acc, t) => acc + t.balancePrincipal, 0);

    const calcMrr = FinancialEngine.calculateMRR();
    const calcDelinquency = FinancialEngine.calculateDelinquencyRate(today);
    const countActive = activeContracts.length;
    const avgTicket = countActive > 0 ? calcMrr / countActive : 0;

    const thisComp = confirmedTitles.filter(t => t.competence === currentCompetenceStr && t.originType === 'CONTRATO');
    const billedCount = new Set(thisComp.map(t => t.originId)).size;
    const pendingCount = Math.max(0, countActive - billedCount);
    const billedMonth = thisComp.reduce((acc, t) => acc + t.originalAmount, 0);

    return {
      titles: confirmedTitles,
      counterparties: allCounterparties,
      contracts: activeContracts,
      receivables: rec,
      payables: pay,
      openReceivables: openRec,
      openPayables: openPay,
      mrr: calcMrr,
      delinquency: calcDelinquency,
      activeContractsCount: countActive,
      averageTicket: avgTicket,
      titlesThisCompetence: thisComp,
      contractsBilledCount: billedCount,
      contractsPendingCount: pendingCount,
      totalBilledThisMonth: billedMonth
    };
  }, [today, currentCompetenceStr, dashboardRefreshTrigger]);

  // 5. Client KPIs & Metrics memoizado
  const clientMetrics = useMemo(() => {
    return FinancialEngine.calculateClientMetrics(effectiveYear, effectiveMonthIdx);
  }, [effectiveYear, effectiveMonthIdx, dashboardRefreshTrigger]);

  // Next dues in next 7 days
  const upcomingReceivables = (receivables || [])
    .filter(t => t && (t.balancePrincipal || 0) > 0 && t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 5);

  const upcomingPayables = (payables || [])
    .filter(t => t && (t.balancePrincipal || 0) > 0 && t.dueDate && t.dueDate >= today)
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    .slice(0, 5);

  // Preset Handlers for KPI Configuration
  const applyPreset = (presetName: 'EXECUTIVO' | 'TESOURARIA' | 'CONTROLADORIA' | 'COMERCIAL') => {
    if (presetName === 'EXECUTIVO') {
      updateConfig({
        visibleKpis: ['faturamento_bruto', 'resultado_liquido', 'mrr', 'clientes_ativos', 'crescimento_clientes', 'inadimplencia', 'margem_liquida', 'ticket_medio'],
        visibleWidgets: ['widget_faturamento_resumo', 'widget_saldos_consolidados', 'widget_resumo_clientes', 'widget_dre_economico', 'widget_posicao_caixa', 'widget_proximos_vencimentos']
      });
    } else if (presetName === 'COMERCIAL') {
      updateConfig({
        visibleKpis: ['clientes_ativos', 'crescimento_clientes', 'carteira_total_clientes', 'mrr', 'ticket_medio', 'inadimplencia', 'faturamento_bruto'],
        visibleWidgets: ['widget_resumo_clientes', 'widget_faturamento_resumo', 'widget_proximos_vencimentos']
      });
    } else if (presetName === 'TESOURARIA') {
      updateConfig({
        visibleKpis: ['saldo_disponivel', 'entradas_caixa', 'saidas_caixa', 'saldo_liquido_caixa', 'contas_receber_aberto', 'contas_pagar_aberto'],
        visibleWidgets: ['widget_saldos_consolidados', 'widget_posicao_caixa', 'widget_proximos_vencimentos']
      });
    } else if (presetName === 'CONTROLADORIA') {
      updateConfig({
        visibleKpis: ['faturamento_bruto', 'resultado_liquido', 'faturamento_ano', 'margem_liquida', 'mrr', 'inadimplencia'],
        visibleWidgets: ['widget_faturamento_resumo', 'widget_dre_economico', 'widget_posicao_caixa', 'widget_proximos_vencimentos']
      });
    }
  };

  // KPI Catalog with metadata
  const KPI_CATALOG = [
    {
      id: 'faturamento_bruto',
      name: 'Receita Bruta (Mês)',
      category: 'Competência',
      value: formatBRL(currentMonthGrossRevenue),
      subtext: `Acumulado Ano: ${formatBRL(ytdGrossRevenue)}`,
      icon: Receipt,
      color: 'amber',
      description: 'Faturamento reconhecido por competência contábil no mês selecionado.'
    },
    {
      id: 'resultado_liquido',
      name: 'Resultado Líquido (Mês)',
      category: 'Competência',
      value: formatBRL(currentMonthNetResult),
      subtext: `Margem: ${monthMargin.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'emerald',
      description: 'Lucro ou prejuízo líquido gerencial após todas as deduções e despesas.'
    },
    {
      id: 'mrr',
      name: 'MRR (Receita Recorrente)',
      category: 'Comercial',
      value: formatBRL(mrr),
      subtext: `${activeContractsCount} contratos ativos`,
      icon: FileText,
      color: 'amber',
      description: 'Receita mensal recorrente normalizada de clientes ativos.'
    },
    {
      id: 'clientes_ativos',
      name: 'Clientes Ativos (Contratos)',
      category: 'Clientes',
      value: `${clientMetrics.activeClients}`,
      subtext: `${clientMetrics.activeClients} clientes com contrato ativo`,
      icon: Users,
      color: 'amber',
      description: 'Número de clientes únicos com contrato formalizado e vigente (status ATIVO). Desconsidera cadastros sem contrato.'
    },
    {
      id: 'crescimento_clientes',
      name: 'Crescimento Contratual',
      category: 'Clientes',
      value: `+${clientMetrics.newClientsPeriod} novos (${clientMetrics.growthRate > 0 ? '+' : ''}${clientMetrics.growthRate}%)`,
      subtext: `${clientMetrics.netGrowthDiff >= 0 ? '+' : ''}${clientMetrics.netGrowthDiff} líq. vs mês anterior (${clientMetrics.churnPeriod} churn)`,
      icon: UserPlus,
      color: 'emerald',
      description: 'Novos clientes que ativaram contratos no período, descontando cancelamentos e churn da base.'
    },
    {
      id: 'carteira_total_clientes',
      name: 'Carteira de Contratos',
      category: 'Clientes',
      value: `${clientMetrics.totalContractClients || clientMetrics.activeClients}`,
      subtext: `${clientMetrics.inactiveClients} cancelados/inativos (Churn: ${clientMetrics.churnRate}%)`,
      icon: UserCheck,
      color: 'amber',
      description: 'Base total de clientes com relacionamento contratual ativo ou histórico de churn.'
    },
    {
      id: 'inadimplencia',
      name: 'Taxa de Inadimplência',
      category: 'Risco',
      value: `${delinquency.rate}%`,
      subtext: `Vencido: ${formatBRL(delinquency.overdueBalance)}`,
      icon: AlertTriangle,
      color: 'amber',
      description: 'Razão entre títulos vencidos e total em aberto na carteira.'
    },
    {
      id: 'saldo_disponivel',
      name: 'Disponibilidade Bancária',
      category: 'Caixa',
      value: formatBRL(consolidatedCash),
      subtext: `${bankAccounts.length} contas bancárias PJ`,
      icon: Wallet,
      color: 'emerald',
      description: 'Saldo líquido total disponível e conciliado nas contas da empresa.'
    },
    {
      id: 'entradas_caixa',
      name: 'Entradas Realizadas (Caixa)',
      category: 'Caixa',
      value: formatBRL(currentMonthCashInflow),
      subtext: 'Liquidações efetivas',
      icon: ArrowUpRight,
      color: 'teal',
      description: 'Valores que efetivamente entraram nas contas bancárias no mês.'
    },
    {
      id: 'saidas_caixa',
      name: 'Saídas Realizadas (Caixa)',
      category: 'Caixa',
      value: formatBRL(currentMonthCashOutflow),
      subtext: 'Desembolsos operacionais',
      icon: ArrowDownRight,
      color: 'rose',
      description: 'Pagamentos e saídas financeiras liquidadas nas contas no mês.'
    },
    {
      id: 'saldo_liquido_caixa',
      name: 'Geração Líquida de Caixa',
      category: 'Caixa',
      value: formatBRL(currentMonthNetCash),
      subtext: currentMonthNetCash >= 0 ? 'Superávit no período' : 'Déficit no período',
      icon: BarChart3,
      color: currentMonthNetCash >= 0 ? 'emerald' : 'rose',
      description: 'Diferença entre entradas e saídas de caixa no mês selecionado.'
    },
    {
      id: 'contas_receber_aberto',
      name: 'A Receber em Aberto',
      category: 'Carteira',
      value: formatBRL(openReceivables),
      subtext: `${receivables.filter(t => t.balancePrincipal > 0).length} títulos a receber`,
      icon: Clock,
      color: 'amber',
      description: 'Saldo devedor total em aberto de títulos a receber.'
    },
    {
      id: 'contas_pagar_aberto',
      name: 'A Pagar em Aberto',
      category: 'Carteira',
      value: formatBRL(openPayables),
      subtext: `${payables.filter(t => t.balancePrincipal > 0).length} obrigações a pagar`,
      icon: Clock,
      color: 'orange',
      description: 'Saldo credor total em aberto de obrigações e contas a pagar.'
    },
    {
      id: 'margem_liquida',
      name: 'Margem Gerencial Ano',
      category: 'Controladoria',
      value: `${ytdMargin.toFixed(1)}%`,
      subtext: `Lucro YTD: ${formatBRL(ytdNetResult)}`,
      icon: Percent,
      color: 'amber',
      description: 'Percentual do faturamento anual convertido em lucro líquido.'
    },
    {
      id: 'ticket_medio',
      name: 'Ticket Médio por Cliente',
      category: 'Comercial',
      value: formatBRL(clientMetrics.averageTicketPerClient || averageTicket),
      subtext: 'Base de clientes com contrato ativo',
      icon: DollarSign,
      color: 'amber',
      description: 'Honorário médio mensal gerado por cliente com contrato ativo (MRR ÷ Clientes com Contrato Ativo).'
    }
  ];

  return (
    <div className="space-y-6">
      
      <PageToolbar description="Seu caixa, o que vence nos próximos dias e o resultado do mês.">
        <Button variant="primary" icon={<Calendar className="w-4 h-4" />} onClick={onOpenBillingModal}>
          Faturamento mensal
        </Button>
        <MoreMenu
          items={[
            { label: 'Conciliação bancária', icon: <CheckCircle2 className="w-4 h-4" />, onClick: () => onNavigate('CONCILIACAO'), hint: 'Conferir o extrato com os lançamentos' },
            { label: 'Personalizar painel', icon: <Settings2 className="w-4 h-4" />, onClick: () => setActiveTab('KPIS_CONFIG'), hint: 'Escolher o que aparece nas análises' }
          ]}
        />
      </PageToolbar>

      <div className="min-w-0 max-w-full">
        <TabPills
          tabs={[
            { id: 'DASHBOARD', label: 'Visão geral' },
            { id: 'ANNUAL_KPIS', label: 'Evolução anual' },
            { id: 'CARTEIRA', label: 'Clientes' },
            { id: 'STRESS_TEST', label: 'Estresse de caixa' }
          ]}
          value={activeTab === 'COHORT' || activeTab === 'CHURN_RISK' ? 'CARTEIRA' : activeTab}
          onChange={id => setActiveTab(id === 'CARTEIRA' ? 'COHORT' : (id as any))}
        />
      </div>

      {/* Dashboard Period Navigator */}
      <ModulePeriodNavigator
        moduleType="DASHBOARD"
        titlePrefix="Período de Apuração"
        filterSubtitle="Painel Executivo e DRE"
        matchedCount={(titles || []).filter(t => t.competence?.startsWith(String(effectiveYear))).length}
        totalCount={(titles || []).length}
      />

      {/* ========================================================================= */}
      {/* TAB 1: VISÃO GERAL DO DASHBOARD (COM WIDGETS & KPIS CONFIGURADOS)          */}
      {/* ========================================================================= */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* DESTAQUE: disponibilidade e termômetro do mês */}
          <Card hero className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-6 lg:gap-8 items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-3.5">
                <IconTile><TWallet /></IconTile>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">Disponibilidade consolidada</p>
                  <p className="text-sm text-[var(--text-muted)]">Saldo somado de todas as contas ativas</p>
                </div>
              </div>
              <p className="mt-6 text-[40px] leading-[48px] sm:text-[48px] sm:leading-[56px] font-semibold tracking-tight tabular-nums">
                {formatBRL(consolidatedCash)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="gold">MRR {formatBRL(mrr)}</Badge>
                <Badge tone="info">{activeContractsCount} contratos ativos</Badge>
                <Badge tone={delinquency.rate > 0 ? 'danger' : 'success'}>Inadimplência {delinquency.rate}%</Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]/60 p-4">
                <IconBadge tone="success"><TTrendUp /></IconBadge>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">Receita do mês</p>
                <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{formatBRL(currentMonthGrossRevenue)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">Acumulado no ano {formatBRL(ytdGrossRevenue)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]/60 p-4">
                <IconBadge tone={currentMonthNetResult < 0 ? 'danger' : 'gold'}><TChart /></IconBadge>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">Resultado líquido</p>
                <p className={`mt-1 text-lg font-semibold tracking-tight tabular-nums ${currentMonthNetResult < 0 ? 'text-[var(--status-danger)]' : ''}`}>{formatBRL(currentMonthNetResult)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">Margem no ano {ytdMargin.toFixed(1)}%</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)]/60 p-4">
                <IconBadge tone="info"><TRepeat /></IconBadge>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">Faturado no mês</p>
                <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{formatBRL(totalBilledThisMonth)}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{contractsBilledCount} de {activeContractsCount} contratos</p>
              </div>
            </div>
          </Card>

          {/* WIDGET SOLICITADO: AVISOS PENDENTES (PRÓXIMOS 3 DIAS) */}
          {safeVisibleWidgets.includes('widget_avisos_pendentes') && (
            <PendingAlertsWidget 
              titles={titles || []} 
              counterparties={counterparties || []}
              onNavigate={onNavigate} 
              onSelectTitle={handleOpenEditTitle}
            />
          )}

          {/* WIDGET 6: PRÓXIMOS VENCIMENTOS */}
          {safeVisibleWidgets.includes('widget_proximos_vencimentos') && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
              
              {/* Contas a Receber Próximas */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                    <TrendingUp className="w-4 h-4 mr-1.5 text-emerald-600" />
                    Próximos Vencimentos a Receber
                  </h3>
                  <button
                    onClick={() => onNavigate('CONTAS_RECEBER')}
                    className="text-xs font-semibold text-amber-500 hover:text-amber-400"
                  >
                    Ver todos ({receivables.filter(t => t.balancePrincipal > 0).length}) →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-700 font-medium">
                        <th className="py-2">Cliente</th>
                        <th className="py-2">Vencimento</th>
                        <th className="py-2 text-right">Saldo</th>
                        <th className="py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {upcomingReceivables.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-700">Nenhum vencimento pendente</td>
                        </tr>
                      ) : (
                        upcomingReceivables.map(t => {
                          const client = counterparties.find(c => c.id === t.counterpartyId);
                          const tempStatus = getTemporalStatus(t, today);
                          return (
                            <tr 
                              key={t.id} 
                              onClick={() => handleOpenEditTitle(t)}
                              className="hover:bg-amber-50/60 dark:hover:bg-amber-950/20 cursor-pointer transition-colors group"
                              title="Clique para abrir e editar este lançamento"
                            >
                              <td className="py-2.5 font-medium text-slate-900">
                                <div className="flex flex-col">
                                  <span className="font-bold text-xs text-slate-900 group-hover:text-amber-500 transition-colors">
                                    {client?.name || 'Cliente não identificado'}
                                  </span>
                                  <span className="text-[11px] text-slate-700 truncate max-w-[200px]">
                                    {t.description}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 text-slate-600 font-mono">{formatDateBR(t.dueDate)}</td>
                              <td className="py-2.5 text-right font-bold text-slate-900 font-mono">{formatBRL(t.balancePrincipal)}</td>
                              <td className="py-2.5 text-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                  tempStatus === 'VENCE_HOJE' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {tempStatus === 'VENCE_HOJE' ? 'Vence Hoje' : 'A Vencer'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Contas a Pagar Próximas */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center">
                    <TrendingDown className="w-4 h-4 mr-1.5 text-rose-600" />
                    Próximos Vencimentos a Pagar
                  </h3>
                  <button
                    onClick={() => onNavigate('CONTAS_PAGAR')}
                    className="text-xs font-semibold text-amber-500 hover:text-amber-400"
                  >
                    Ver todos ({payables.filter(t => t.balancePrincipal > 0).length}) →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-700 font-medium">
                        <th className="py-2">Fornecedor</th>
                        <th className="py-2">Vencimento</th>
                        <th className="py-2 text-right">Saldo</th>
                        <th className="py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {upcomingPayables.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-700">Nenhum pagamento pendente</td>
                        </tr>
                      ) : (
                        upcomingPayables.map(t => {
                          const supplier = counterparties.find(c => c.id === t.counterpartyId);
                          const tempStatus = getTemporalStatus(t, today);
                          return (
                            <tr 
                              key={t.id} 
                              onClick={() => handleOpenEditTitle(t)}
                              className="hover:bg-rose-50/60 dark:hover:bg-rose-950/20 cursor-pointer transition-colors group"
                              title="Clique para abrir e editar esta obrigação"
                            >
                              <td className="py-2.5 font-medium text-slate-900">
                                <div className="flex flex-col">
                                  <span className="font-bold text-xs text-slate-900 group-hover:text-rose-600 transition-colors">
                                    {supplier?.name || 'Fornecedor não identificado'}
                                  </span>
                                  <span className="text-[11px] text-slate-700 truncate max-w-[200px]">
                                    {t.description}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 text-slate-600 font-mono">{formatDateBR(t.dueDate)}</td>
                              <td className="py-2.5 text-right font-bold text-rose-700 font-mono">{formatBRL(t.balancePrincipal)}</td>
                              <td className="py-2.5 text-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                  tempStatus === 'VENCE_HOJE' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                }`}>
                                  {tempStatus === 'VENCE_HOJE' ? 'Vence Hoje' : 'A Vencer'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          <p className="pt-2 text-sm font-medium text-[var(--text-muted)]">Análises detalhadas</p>

          <Disclosure
            icon={<TWallet />}
            title="Projeção de caixa e inadimplência"
            subtitle="Quanto deve sobrar nos próximos meses"
            open={!!openSec['projecao']}
            onToggle={() => setOpenSec(p => ({ ...p, projecao: !p['projecao'] }))}
          >
          {/* NOVO WIDGET SOLICITADO: PROJEÇÃO DE CAIXA LÍQUIDO & SIMULAÇÃO DE INADIMPLÊNCIA ESPERADA */}
          <CashLiquiditySimulationWidget
            currentCompetenceStr={currentCompetenceStr}
            nominalCashBalance={consolidatedCash}
            allReceivables={receivables}
            allPayables={payables}
            contracts={contracts}
            counterparties={counterparties}
            onSelectTitle={handleOpenEditTitle}
            onOpenStressTesting={() => setActiveTab('STRESS_TEST')}
          />

          </Disclosure>

          <Disclosure
            icon={<TAlert />}
            title="Risco de perder clientes"
            subtitle="Contratos com sinal de cancelamento"
            open={!!openSec['churn']}
            onToggle={() => setOpenSec(p => ({ ...p, churn: !p['churn'] }))}
          >
          {/* WIDGET: DETECÇÃO PREDITIVA DE RISCO DE CHURN (HEALTH SCORE) */}
          {safeVisibleWidgets.includes('widget_risco_churn') && (
            <ChurnRiskWidget onNavigateScreen={onNavigate} isCompactMode={true} />
          )}

          </Disclosure>

          <Disclosure
            icon={<TReceipt />}
            title="Faturamento, saldos e clientes"
            subtitle="Resumo do mês, contas bancárias e carteira"
            open={!!openSec['resumo']}
            onToggle={() => setOpenSec(p => ({ ...p, resumo: !p['resumo'] }))}
          >
          {/* WIDGETS CONFIGURÁVEIS SOLICITADOS: FATURAMENTO & SALDOS BANCÁRIOS CONSOLIDADOS */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-6">
            
            {/* WIDGET 1: RESUMO RÁPIDO DE FATURAMENTO MENSAL */}
            {safeVisibleWidgets.includes('widget_faturamento_resumo') && (
              <Card className="flex flex-col justify-between gap-6">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <IconTile><TReceipt /></IconTile>
                        <h3>Faturamento do mês</h3>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        Competência {dreData.months[effectiveMonthIdx]}/{effectiveYear}
                      </p>
                    </div>
                    <Button variant="primary" className="h-9 shrink-0" onClick={onOpenBillingModal} icon={<ArrowRight className="w-4 h-4" />}>
                      Faturar lote
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-[var(--border-subtle)]">
                      <p className="text-sm text-[var(--text-secondary)]">Total faturado</p>
                      <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums">{formatBRL(totalBilledThisMonth)}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">Títulos do mês</p>
                    </div>
                    <div className="p-4 rounded-xl border border-[var(--border-subtle)]">
                      <p className="text-sm text-[var(--text-secondary)]">Contratos faturados</p>
                      <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums">
                        {contractsBilledCount} <span className="text-sm font-normal text-[var(--text-muted)]">de {activeContractsCount}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">Já gerados</p>
                    </div>
                    <div className="p-4 rounded-xl border border-[var(--border-subtle)]">
                      <p className="text-sm text-[var(--text-secondary)]">Pendentes</p>
                      <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums">{contractsPendingCount}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">A faturar no lote</p>
                    </div>
                    <div className="p-4 rounded-xl border border-[var(--border-subtle)]">
                      <p className="text-sm text-[var(--text-secondary)]">Ticket médio</p>
                      <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums">{formatBRL(averageTicket)}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">Por contrato ativo</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-3 text-sm text-[var(--text-muted)]">
                  <span>O faturamento não gera duplicidade.</span>
                  <button onClick={() => onNavigate('CONTRATOS')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer">
                    Ver contratos
                  </button>
                </div>
              </Card>
            )}

            {/* WIDGET 2: SALDOS BANCÁRIOS CONSOLIDADOS */}
            {safeVisibleWidgets.includes('widget_saldos_consolidados') && (
              <Card className="flex flex-col justify-between gap-6">
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <IconTile><TBank /></IconTile>
                        <h3>Saldos bancários</h3>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-1">Dê dois cliques numa conta para abrir o extrato</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-[var(--text-muted)]">Total em caixa</p>
                      <p className="text-xl font-semibold tracking-tight tabular-nums">{formatBRL(consolidatedCash)}</p>
                    </div>
                  </div>

                  <div className="divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
                    {bankAccountsWithBalance.map(b => (
                      <div
                        key={b.id}
                        onDoubleClick={() => handleOpenAccountStatement(b)}
                        className="py-3.5 flex items-center justify-between gap-4 cursor-pointer group"
                        title="Dê dois cliques para abrir o extrato detalhado por dia, semana ou mês"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-[var(--brand-gold)] transition-colors">{b.name}</p>
                          <p className="text-xs text-[var(--text-muted)] tabular-nums">
                            Ag {b.agency || '-'} • CC {b.accountNumber || '-'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <p className={`text-sm font-semibold tabular-nums ${b.calculatedBalance < 0 ? 'text-[var(--status-danger)]' : ''}`}>
                            {formatBRL(b.calculatedBalance)}
                          </p>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleOpenAccountStatement(b);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                            title="Ver extrato e movimentações"
                            aria-label={`Ver extrato de ${b.name}`}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center gap-3 text-sm text-[var(--text-muted)]">
                  <span>{bankAccounts.length} contas no fluxo de caixa</span>
                  <button onClick={() => onNavigate('CONCILIACAO')} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer">
                    Extratos e conciliação
                  </button>
                </div>
              </Card>
            )}

            {/* WIDGET 3: PANORAMA & MÉTRICAS DE CLIENTES (SOLICITADO) */}
            {safeVisibleWidgets.includes('widget_resumo_clientes') && (
              <div className="bg-[var(--surface-card)] p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs col-span-1 lg:col-span-2 flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[var(--border-subtle)] gap-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30 text-amber-400">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                            Panorama da Carteira de Clientes & Expansão
                          </h3>
                          <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">
                            {clientMetrics.activeClients} Ativos
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Métricas de base ativa, novos clientes conquistados e taxa de retenção
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onNavigate('CLIENTES')}
                        className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 text-xs font-semibold rounded-lg transition-colors flex items-center border border-amber-500/30 cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 mr-1" />
                        Ver Todos os Clientes
                        <ArrowRight className="w-3 h-3 ml-1" />
                      </button>
                    </div>
                  </div>

                  {/* 4 Cards de Métricas Principais de Clientes com Alto Contraste */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
                    <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                      <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-secondary)]">Clientes Ativos</span>
                        <Users className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="text-2xl font-bold font-mono text-[var(--text-primary)] tracking-tight">
                        {clientMetrics.activeClients}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center justify-between pt-0.5">
                        <span>Taxa de Ativação:</span>
                        <span className="font-semibold text-amber-400">{clientMetrics.activePercentage}% da base</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-1">
                      <div className="flex justify-between items-center text-xs text-emerald-400">
                        <span className="font-semibold text-emerald-300">Crescimento de Clientes</span>
                        <UserPlus className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-2xl font-bold font-mono text-emerald-300 tracking-tight">
                        +{clientMetrics.newClientsPeriod} novos
                      </div>
                      <div className="text-[11px] text-emerald-400 flex items-center justify-between pt-0.5">
                        <span>Expansão no Mês:</span>
                        <span className="font-semibold text-emerald-300">
                          {clientMetrics.growthRate > 0 ? '+' : ''}{clientMetrics.growthRate}%
                        </span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1">
                      <div className="flex justify-between items-center text-xs text-amber-400">
                        <span className="font-semibold text-amber-300">Cobertura de Contratos</span>
                        <FileText className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="text-2xl font-bold font-mono text-amber-300 tracking-tight">
                        {clientMetrics.clientsWithActiveContracts} <span className="text-sm font-normal text-[var(--text-muted)]">/ {clientMetrics.activeClients}</span>
                      </div>
                      <div className="text-[11px] text-amber-400 flex items-center justify-between pt-0.5">
                        <span>Com Recorrência:</span>
                        <span className="font-semibold text-amber-300">{clientMetrics.contractCoveragePercentage}% da carteira</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1">
                      <div className="flex justify-between items-center text-xs text-amber-400">
                        <span className="font-semibold text-amber-300">Ticket Médio (ARPU)</span>
                        <DollarSign className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="text-xl font-bold font-mono text-amber-300 tracking-tight">
                        {formatBRL(clientMetrics.averageTicketPerClient)}
                      </div>
                      <div className="text-[11px] text-amber-400 flex items-center justify-between pt-0.5">
                        <span>MRR Normalizado:</span>
                        <span className="font-semibold text-amber-300">{formatBRL(mrr)}/mês</span>
                      </div>
                    </div>
                  </div>

                  {/* Barra Visual de Saúde e Distribuição da Carteira */}
                  <div className="mt-4 p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-[var(--text-secondary)]">Composição da Carteira de Clientes:</span>
                      <div className="flex items-center space-x-3 text-[11px]">
                        <span className="flex items-center text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
                          {clientMetrics.activeClients} Ativos ({clientMetrics.activePercentage}%)
                        </span>
                        <span className="flex items-center text-[var(--text-muted)]">
                          <span className="w-2 h-2 rounded-full bg-slate-500 mr-1.5" />
                          {clientMetrics.inactiveClients} Inativos ({100 - clientMetrics.activePercentage}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-[var(--surface-card)] border border-[var(--border-subtle)] h-2 rounded-full overflow-hidden flex">
                      <div 
                        className="bg-emerald-500 h-full transition-all" 
                        style={{ width: `${clientMetrics.activePercentage}%` }} 
                        title={`Ativos: ${clientMetrics.activeClients}`}
                      />
                      <div 
                        className="bg-slate-600 h-full transition-all" 
                        style={{ width: `${100 - clientMetrics.activePercentage}%` }} 
                        title={`Inativos: ${clientMetrics.inactiveClients}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap justify-between items-center text-xs text-[var(--text-secondary)] gap-2">
                  <span className="text-[11px]">
                    Base total de <strong className="text-[var(--text-primary)]">{clientMetrics.totalClients} clientes</strong> registrados. Última atualização em tempo real.
                  </span>
                  <button
                    onClick={() => onNavigate('CLIENTES')}
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center cursor-pointer"
                  >
                    Gerenciar Clientes & Contratos
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </button>
                </div>
              </div>
            )}

          </div>

          </Disclosure>

          <Disclosure
            icon={<TChart />}
            title="Indicadores do período"
            subtitle="Os indicadores que você escolheu"
            open={!!openSec['kpis']}
            onToggle={() => setOpenSec(p => ({ ...p, kpis: !p['kpis'] }))}
          >
          {/* GRID DE KPIS DINÂMICOS CONFORME CONFIGURAÇÃO DO USUÁRIO */}
          {safeVisibleKpis.length > 0 && (
            <div className="bg-[var(--surface-card)] p-4 sm:p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[var(--border-subtle)] pb-3 gap-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Indicadores Financeiros Chave (KPIs Selecionados)
                  </h3>
                </div>

                <div className="flex items-center space-x-2 flex-wrap">
                  {/* Seletor de Modo: Cards do Mês vs Linha a Linha Anual */}
                  <div className="inline-flex p-0.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setKpiDisplayMode('MONTH_CARDS')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center cursor-pointer ${
                        kpiDisplayMode === 'MONTH_CARDS'
                          ? 'bg-amber-400 text-slate-950 font-bold shadow-2xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      title="Ver cards executivos do mês selecionado"
                    >
                      <Calendar className="w-3.5 h-3.5 mr-1.5" />
                      Mês Atual ({dreData.months[effectiveMonthIdx]}/{effectiveYear})
                    </button>
                    <button
                      type="button"
                      onClick={() => setKpiDisplayMode('ANNUAL_TABLE')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center cursor-pointer ${
                        kpiDisplayMode === 'ANNUAL_TABLE'
                          ? 'bg-amber-400 text-slate-950 font-bold shadow-2xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      title="Ver tabela comparativa com todos os 12 meses linha a linha"
                    >
                      <Table className="w-3.5 h-3.5 mr-1.5" />
                      Detalhado por Ano (Linha a Linha)
                    </button>
                  </div>

                  <button
                    onClick={() => setActiveTab('KPIS_CONFIG')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center px-2 py-1 rounded-md hover:bg-[var(--surface-elevated)] cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5 mr-1" />
                    Personalizar
                  </button>
                </div>
              </div>

              {kpiDisplayMode === 'MONTH_CARDS' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
                  {KPI_CATALOG
                    .filter(kpi => safeVisibleKpis.includes(kpi.id))
                    .map(kpi => {
                      const IconComponent = kpi.icon;
                      const navTarget: NavigationScreen | null = 
                        kpi.id === 'contas_pagar_aberto' ? 'CONTAS_PAGAR' :
                        kpi.id === 'contas_receber_aberto' ? 'CONTAS_RECEBER' :
                        (kpi.id === 'saldo_liquido_caixa' || kpi.id === 'entradas_caixa' || kpi.id === 'saidas_caixa') ? 'FLUXO_CAIXA' :
                        (kpi.id === 'receita_liquida' || kpi.id === 'lucro_liquido' || kpi.id === 'ebitda' || kpi.id === 'margem_liquida') ? 'DRE' :
                        kpi.id === 'ticket_medio' ? 'CLIENTES' : null;

                      return (
                        <div 
                          key={kpi.id}
                          onClick={() => navTarget && onNavigate(navTarget)}
                          className={`p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-amber-500/40 transition-all space-y-1.5 ${
                            navTarget ? 'cursor-pointer hover:shadow-2xs active:scale-[0.99]' : ''
                          }`}
                          title={navTarget ? `Clique para abrir o módulo correspondente` : undefined}
                        >
                          <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
                            <span className="font-medium truncate max-w-[170px]" title={kpi.name}>{kpi.name}</span>
                            <IconComponent className="w-4 h-4 text-amber-400 shrink-0 ml-1" />
                          </div>
                          <div className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight font-mono">
                            {kpi.value}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate flex items-center justify-between" title={kpi.subtext}>
                            <span>{kpi.subtext}</span>
                            {navTarget && <ArrowRight className="w-3 h-3 text-[var(--text-muted)] opacity-60 ml-1 shrink-0" />}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <AnnualKpiComparisonView
                  currentYear={effectiveYear}
                  selectedMonthIdx={effectiveMonthIdx}
                  onNavigateScreen={onNavigate}
                  isCompactMode={true}
                />
              )}
            </div>
          )}

          </Disclosure>

          <Disclosure
            icon={<TTrendUp />}
            title="Resultado do mês"
            subtitle="Receitas, custos e lucro por competência"
            open={!!openSec['dre']}
            onToggle={() => setOpenSec(p => ({ ...p, dre: !p['dre'] }))}
          >
          {/* BLOCO 1: RESULTADO POR COMPETÊNCIA (DRE ECONÔMICO) */}
          {safeVisibleWidgets.includes('widget_dre_economico') && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Demonstração do Resultado do Exercício (DRE Econômico)
                  </h2>
                </div>
                <button
                  onClick={() => onNavigate('DRE')}
                  className="text-xs text-amber-500 hover:text-amber-400 font-semibold"
                >
                  Abrir DRE Completa →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1">
                  <div className="flex justify-between items-center text-xs text-[var(--text-secondary)] font-medium">
                    <span>Receita Reconhecida ({dreData.months[effectiveMonthIdx]})</span>
                    <Receipt className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-[var(--text-primary)] mt-1">
                    {formatBRL(currentMonthGrossRevenue)}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-1 flex justify-between">
                    <span>Acumulado Ano:</span>
                    <span className="font-semibold text-[var(--text-secondary)]">{formatBRL(ytdGrossRevenue)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                  <div className="flex justify-between items-center text-xs text-emerald-400 font-medium">
                    <span>Resultado Líquido (Mês)</span>
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-emerald-300 mt-1">
                    {formatBRL(currentMonthNetResult)}
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-1 flex justify-between">
                    <span>Margem Gerencial Ano:</span>
                    <span className="font-semibold text-emerald-300">{ytdMargin.toFixed(1)}%</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1">
                  <div className="flex justify-between items-center text-xs text-amber-400 font-medium">
                    <span>MRR (Receita Recorrente)</span>
                    <FileText className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold font-mono text-amber-300 mt-1">
                    {formatBRL(mrr)}
                  </div>
                  <div className="text-[11px] text-amber-400 mt-1 flex justify-between">
                    <span>Contratos Ativos:</span>
                    <span className="font-semibold text-amber-300">{activeContractsCount} clientes</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-1">
                  <div className="flex justify-between items-center text-xs text-rose-400 font-medium">
                    <span className="flex items-center">
                      Inadimplência Carteira
                      <span title="Fórmula: Saldo Vencido / Saldo Total em Aberto na data" className="ml-1 cursor-help">
                        <HelpCircle className="w-3 h-3 text-rose-400" />
                      </span>
                    </span>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xl font-bold text-amber-950 mt-1">
                    {delinquency.rate}%
                  </div>
                  <div className="text-[11px] text-slate-700 mt-1 flex justify-between">
                    <span>Vencido:</span>
                    <span className="font-semibold text-amber-800">{formatBRL(delinquency.overdueBalance)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          </Disclosure>

          <Disclosure
            icon={<TBank />}
            title="Posição de caixa e carteira"
            subtitle="Saldo, a receber e a pagar consolidados"
            open={!!openSec['posicao']}
            onToggle={() => setOpenSec(p => ({ ...p, posicao: !p['posicao'] }))}
          >
          {/* BLOCO 2: POSIÇÃO FINANCEIRA DE CAIXA E CARTEIRA */}
          {safeVisibleWidgets.includes('widget_posicao_caixa') && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                  <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                    Posição Financeira de Caixa & Carteira a Liquidar
                  </h2>
                </div>
                <button
                  onClick={() => onNavigate('FLUXO_CAIXA')}
                  className="text-xs text-amber-500 hover:text-amber-400 font-semibold"
                >
                  Ver Fluxo de Caixa →
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex justify-between items-center text-xs text-slate-700 font-medium">
                    <span>Disponibilidade Bancária</span>
                    <Wallet className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">
                    {formatBRL(consolidatedCash)}
                  </div>
                  <div className="text-[11px] text-slate-700 mt-1">
                    Soma de {bankAccounts.length} contas bancárias PJ
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-emerald-50/40 border border-emerald-100">
                  <div className="flex justify-between items-center text-xs text-emerald-900 font-medium">
                    <span>Recebimentos no Mês (Caixa)</span>
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-900 mt-1">
                    {formatBRL(currentMonthCashInflow)}
                  </div>
                  <div className="text-[11px] text-slate-700 mt-1">
                    Entradas efetivamente liquidadas
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-rose-50/40 border border-rose-100">
                  <div className="flex justify-between items-center text-xs text-rose-900 font-medium">
                    <span>Pagamentos no Mês (Caixa)</span>
                    <ArrowDownRight className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="text-xl font-bold text-rose-900 mt-1">
                    {formatBRL(currentMonthCashOutflow)}
                  </div>
                  <div className="text-[11px] text-slate-700 mt-1">
                    Saídas operacionais liquidadas
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex justify-between items-center text-xs text-slate-700 font-medium">
                    <span>Carteira em Aberto</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-sm font-semibold text-emerald-700 mt-1">
                    + {formatBRL(openReceivables)} <span className="text-[10px] text-slate-700 font-normal">(Receber)</span>
                  </div>
                  <div className="text-sm font-semibold text-rose-700">
                    - {formatBRL(openPayables)} <span className="text-[10px] text-slate-700 font-normal">(Pagar)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          </Disclosure>


        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: EVOLUÇÃO ANUAL DOS KPIS (LINHA A LINHA, JAN A DEZ)                 */}
      {/* ========================================================================= */}
      {activeTab === 'ANNUAL_KPIS' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <AnnualKpiComparisonView
            currentYear={effectiveYear}
            selectedMonthIdx={effectiveMonthIdx}
            onNavigateScreen={onNavigate}
            isCompactMode={false}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ANÁLISE DE COORTES (RETENÇÃO DE CONTRATOS & NRR)                   */}
      {/* ========================================================================= */}
      {(activeTab === 'COHORT' || activeTab === 'CHURN_RISK') && (
        <TabPills
          tabs={[{ id: 'COHORT', label: 'Retenção' }, { id: 'CHURN_RISK', label: 'Risco de cancelamento' }]}
          value={activeTab}
          onChange={id => setActiveTab(id as any)}
        />
      )}

      {activeTab === 'COHORT' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <CohortRetentionView onNavigateScreen={onNavigate} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: GESTÃO DE RISCO DE CHURN & HEALTH SCORE DOS CLIENTES               */}
      {/* ========================================================================= */}
      {activeTab === 'CHURN_RISK' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <ChurnRiskWidget onNavigateScreen={onNavigate} isCompactMode={false} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SIMULADOR DE ESTRESSE DE CAIXA E CHURN (180 DIAS)                  */}
      {/* ========================================================================= */}
      {activeTab === 'STRESS_TEST' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <StressTestingView onNavigateScreen={onNavigate} />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: CENTRAL DE CONFIGURAÇÃO DE KPIS & WIDGETS (SOLICITAÇÃO DO USUÁRIO)  */}
      {/* ========================================================================= */}
      {activeTab === 'KPIS_CONFIG' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          
          {/* Header Card with Presets */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center">
                  <Sliders className="w-5 h-5 mr-2 text-amber-400" />
                  Central de Personalização de KPIs Financeiros
                </h2>
                <p className="text-xs text-slate-700 mt-1">
                  Ative ou desative os indicadores e widgets que deseja visualizar no seu Dashboard. Suas escolhas são salvas automaticamente.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={resetToDefault}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                  Restaurar Padrão
                </button>
                <button
                  onClick={() => setActiveTab('DASHBOARD')}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold shadow-2xs flex items-center"
                >
                  Ver no Dashboard
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </button>
              </div>
            </div>

            {/* Presets Bar */}
            <div>
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-2">
                Perfis Prontos para Ativação Rápida:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => applyPreset('EXECUTIVO')}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 text-[var(--text-primary)] text-xs font-medium transition-colors flex items-center"
                >
                  <Building2 className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  Perfil Diretoria & Executivo (MRR, Clientes, Lucro e Inadimplência)
                </button>

                <button
                  onClick={() => applyPreset('COMERCIAL')}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 text-[var(--text-primary)] text-xs font-medium transition-colors flex items-center"
                >
                  <Users className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  Perfil Comercial & Clientes (Clientes Ativos, Crescimento, Cobertura, MRR)
                </button>

                <button
                  onClick={() => applyPreset('TESOURARIA')}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 text-xs font-medium transition-colors flex items-center"
                >
                  <Wallet className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
                  Perfil Tesouraria & Caixa (Saldos Bancários, Entradas e Saídas)
                </button>

                <button
                  onClick={() => applyPreset('CONTROLADORIA')}
                  className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 hover:bg-amber-500/25 text-[var(--text-primary)] text-xs font-medium transition-colors flex items-center"
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  Perfil Controladoria & DRE (Faturamento Anual, Margem Líquida)
                </button>
              </div>
            </div>
          </div>

          {/* Section 1: KPI Selector Grid */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  1. Indicadores Chave de Desempenho (KPIs)
                </h3>
                <p className="text-xs text-slate-700">
                  Clique para marcar ou desmarcar os cartões de indicadores financeiros que serão exibidos no Dashboard.
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-800 rounded-full font-mono">
                {safeVisibleKpis.length} de {KPI_CATALOG.length} selecionados
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {KPI_CATALOG.map(kpi => {
                const isSelected = safeVisibleKpis.includes(kpi.id);
                const IconComponent = kpi.icon;

                return (
                  <div
                    key={kpi.id}
                    onClick={() => toggleKpi(kpi.id)}
                    className={`p-4 rounded-xl border-2 transition-all cursor-pointer select-none relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {kpi.category}
                        </span>
                        
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 mt-2.5">
                        <IconComponent className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-400'}`} />
                        <h4 className="font-bold text-xs text-slate-900">{kpi.name}</h4>
                      </div>

                      <p className="text-[11px] text-slate-700 mt-1 leading-relaxed">
                        {kpi.description}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex justify-between items-center text-xs">
                      <span className="text-slate-700 text-[10px]">Valor Atual:</span>
                      <span className="font-bold font-mono text-slate-900">{kpi.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Widgets Selector */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                2. Blocos e Widgets Estruturais do Dashboard
              </h3>
              <p className="text-xs text-slate-700">
                Escolha quais seções analíticas completas devem compor a interface.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Widget: Faturamento Mensal Resumo */}
              <div 
                onClick={() => toggleWidget('widget_faturamento_resumo')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-start ${
                  safeVisibleWidgets.includes('widget_faturamento_resumo')
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <Receipt className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-900">Widget: Resumo Rápido de Faturamento</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Exibe volume de faturamento do mês, contratos emitidos vs pendentes de geração, ticket médio e botão para execução do lote.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  safeVisibleWidgets.includes('widget_faturamento_resumo') ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                }`}>
                  {safeVisibleWidgets.includes('widget_faturamento_resumo') && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Widget: Saldos Bancários Consolidados */}
              <div 
                onClick={() => toggleWidget('widget_saldos_consolidados')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-start ${
                  safeVisibleWidgets.includes('widget_saldos_consolidados')
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">Widget: Saldos Bancários Consolidados</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Apresenta cada conta bancária (Itaú, Nubank, Santander, etc.) com seu saldo líquido atualizado e saldo consolidado total da empresa.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  safeVisibleWidgets.includes('widget_saldos_consolidados') ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                }`}>
                  {safeVisibleWidgets.includes('widget_saldos_consolidados') && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Widget: Panorama da Carteira de Clientes */}
              <div 
                onClick={() => toggleWidget('widget_resumo_clientes')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-start ${
                  safeVisibleWidgets.includes('widget_resumo_clientes')
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-900">Bloco: Panorama & Métricas da Carteira de Clientes</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Exibe número de clientes ativos, taxa de expansão/crescimento líquido, cobertura contratual, ticket médio e distribuição da base.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  safeVisibleWidgets.includes('widget_resumo_clientes') ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                }`}>
                  {safeVisibleWidgets.includes('widget_resumo_clientes') && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Widget: Avisos Pendentes (Próximos 3 Dias) */}
              <div 
                onClick={() => toggleWidget('widget_avisos_pendentes')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-start ${
                  safeVisibleWidgets.includes('widget_avisos_pendentes')
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-slate-900">Bloco: Avisos Pendentes (Próximos 3 Dias)</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Cálculo automático e monitoramento de contas a pagar e receber vencendo em até 3 dias.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  safeVisibleWidgets.includes('widget_avisos_pendentes') ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                }`}>
                  {safeVisibleWidgets.includes('widget_avisos_pendentes') && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Widget: DRE Econômica */}
              <div 
                onClick={() => toggleWidget('widget_dre_economico')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-start ${
                  safeVisibleWidgets.includes('widget_dre_economico')
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-900">Bloco: Resultado Econômico por Competência (DRE)</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Visão de faturamento reconhecido, resultado líquido, MRR e taxa de inadimplência da carteira.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  safeVisibleWidgets.includes('widget_dre_economico') ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                }`}>
                  {safeVisibleWidgets.includes('widget_dre_economico') && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Widget: Posição de Caixa & Carteira */}
              <div 
                onClick={() => toggleWidget('widget_posicao_caixa')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-start ${
                  safeVisibleWidgets.includes('widget_posicao_caixa')
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-900">Bloco: Posição de Caixa e Carteira a Liquidar</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Entradas e saídas de caixa liquidadas no mês, além do confronto entre saldo a receber vs saldo a pagar.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  safeVisibleWidgets.includes('widget_posicao_caixa') ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                }`}>
                  {safeVisibleWidgets.includes('widget_posicao_caixa') && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

              {/* Widget: Próximos Vencimentos */}
              <div 
                onClick={() => toggleWidget('widget_proximos_vencimentos')}
                className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-start ${
                  safeVisibleWidgets.includes('widget_proximos_vencimentos')
                    ? 'border-amber-500 bg-amber-500/10'
                    : 'border-slate-200 bg-white opacity-70 hover:opacity-100'
                }`}
              >
                <div className="space-y-1 pr-3">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-900">Bloco: Próximos Vencimentos (Receber & Pagar)</span>
                  </div>
                  <p className="text-[11px] text-slate-700">
                    Tabelas operacionais com os próximos 5 recebimentos e 5 pagamentos com alertas de situação temporal.
                  </p>
                </div>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  safeVisibleWidgets.includes('widget_proximos_vencimentos') ? 'bg-amber-500 text-white' : 'border border-slate-300 bg-white'
                }`}>
                  {safeVisibleWidgets.includes('widget_proximos_vencimentos') && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </div>

            </div>
          </div>

          {/* Bottom Action bar */}
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center">
            <span className="text-xs text-emerald-900 font-medium flex items-center">
              <ShieldCheck className="w-4 h-4 text-emerald-600 mr-2" />
              Suas preferências de KPIs e Widgets estão salvas e ativas para sua sessão.
            </span>
            <button
              onClick={() => setActiveTab('DASHBOARD')}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors flex items-center"
            >
              Voltar ao Dashboard
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </button>
          </div>

        </div>
      )}

      {/* Modal de Extrato Bancário e Movimentações com Agrupamento (2 cliques na conta) */}
      {isStatementModalOpen && selectedAccountForStatement && (
        <BankAccountStatementModal
          isOpen={isStatementModalOpen}
          onClose={() => {
            setIsStatementModalOpen(false);
            setSelectedAccountForStatement(null);
          }}
          account={selectedAccountForStatement}
        />
      )}

      {/* Modal de Edição Direta de Título Aberto a partir de qualquer widget do Dashboard */}
      {isEditTitleModalOpen && (
        <EditTitleModal
          isOpen={isEditTitleModalOpen}
          title={selectedTitleForEdit}
          onClose={() => {
            setIsEditTitleModalOpen(false);
            setSelectedTitleForEdit(null);
          }}
          onSaved={handleTitleSaved}
        />
      )}

    </div>
  );
};
