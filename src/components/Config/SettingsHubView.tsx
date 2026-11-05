import React, { useState, useEffect } from 'react';
import {
  Building,
  Truck,
  Network,
  Clock,
  ShieldCheck,
  LockKeyhole,
  Sliders,
  Bell,
  Lightbulb,
  History,
  Database,
  SlidersHorizontal,
  ChevronRight,
  ChevronDown,
  Bot
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { NavigationScreen } from '../Sidebar';
import { isConsultant } from '../../services/authService';

import { CompanyConfigView } from './CompanyConfigView';
import { SuppliersView } from './SuppliersView';
import { ChartOfAccountsView } from './ChartOfAccountsView';
import { RecurrencesView } from './RecurrencesView';
import { UsersPermissionsView } from './UsersPermissionsView';
import { PeriodClosureView } from './PeriodClosureView';
import { IntegrationsView } from './IntegrationsView';
import { NotificationsConfigView } from './NotificationsConfigView';
import { ImprovementsView } from './ImprovementsView';
import { AuditView } from './AuditView';
import { BackupView } from './BackupView';
import { SupabaseConfigView } from './SupabaseConfigView';
import { AgentCenterView } from './AgentCenterView';

export type ConfigSubTab =
  | 'EMPRESA'
  | 'FORNECEDORES'
  | 'PLANO_CONTAS'
  | 'RECORRENCIAS'
  | 'USUARIOS_PERMISSOES'
  | 'FECHAMENTO_PERIODO'
  | 'MODULOS_INTEGRACOES'
  | 'SUPABASE'
  | 'IA'
  | 'NOTIFICACOES'
  | 'MELHORIAS'
  | 'AUDITORIA'
  | 'BACKUP';

interface SettingsHubViewProps {
  initialTab?: ConfigSubTab;
  onNavigateToScreen?: (screen: NavigationScreen) => void;
  onOpenBillingModal?: () => void;
}

interface TabDefinition {
  id: ConfigSubTab;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export const SettingsHubView: React.FC<SettingsHubViewProps> = ({
  initialTab = 'EMPRESA',
  onNavigateToScreen,
  onOpenBillingModal
}) => {
  const [activeTab, setActiveTab] = useState<ConfigSubTab>(initialTab);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    return storage.subscribe(() => setRefreshTrigger(prev => prev + 1));
  }, []);

  // Calcular alertas para o badge de Notificações
  const titles = storage.getTitles();
  const today = new Date().toISOString().split('T')[0];
  const stmts = storage.getStatementEntries();
  const pendingReconciliation = stmts.filter(
    s => s.reconciliationStatus === 'PENDENTE' || s.reconciliationStatus === 'SUGESTAO'
  ).length;

  const contracts = storage.getContracts().filter(c => c.status === 'ATIVO');
  const expiringContractsCount = contracts.filter(c => {
    if (!c.endDate) return false;
    const diffDays = Math.ceil((new Date(c.endDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return diffDays >= 0 && diffDays <= 30;
  }).length;
  const payablesTodayCount = titles.filter(t => t.type === 'PAGAR' && t.balancePrincipal > 0 && t.dueDate === today).length;
  const totalNotificationAlerts = expiringContractsCount + payablesTodayCount + pendingReconciliation;

  const tabs: TabDefinition[] = [
    {
      id: 'EMPRESA',
      label: 'Dados da Empresa',
      shortLabel: 'Empresa',
      description: 'CNPJ, endereço, regime tributário e certificado digital',
      icon: Building
    },
    {
      id: 'FORNECEDORES',
      label: 'Fornecedores',
      shortLabel: 'Fornecedores',
      description: 'Gestão de fornecedores, prestadores e parceiros',
      icon: Truck
    },
    {
      id: 'PLANO_CONTAS',
      label: 'Plano de Contas',
      shortLabel: 'Plano de contas',
      description: 'Estrutura analítica e sintética de receitas e despesas',
      icon: Network
    },
    {
      id: 'RECORRENCIAS',
      label: 'Regras de Recorrência',
      shortLabel: 'Recorrências',
      description: 'Faturamento recorrente automático e 13º honorário',
      icon: Clock
    },
    {
      id: 'USUARIOS_PERMISSOES',
      label: 'Usuários e Permissões',
      shortLabel: 'Usuários e acessos',
      description: 'Perfis de acesso, segurança RBAC e usuários ativos',
      icon: ShieldCheck
    },
    {
      id: 'FECHAMENTO_PERIODO',
      label: 'Fechamento de Período',
      shortLabel: 'Fechamento do mês',
      description: 'Trava contábil mensal e checklist de 5 travas',
      icon: LockKeyhole
    },
    {
      id: 'MODULOS_INTEGRACOES',
      label: 'Módulos e Integrações',
      shortLabel: 'Módulos e integrações',
      description: 'Ativação de funcionalidades e conexão bancária/APIs',
      icon: Sliders
    },
    {
      id: 'SUPABASE',
      label: 'Banco Supabase (Cloud)',
      shortLabel: 'Banco de dados',
      description: 'Conexão PostgreSQL na nuvem, migrações SQL e sincronização',
      icon: Database
    },
    {
      id: 'IA',
      label: 'Inteligência Artificial (OpenCode Go)',
      shortLabel: 'Inteligência artificial',
      description: 'Configurar chave OpenCode Go, sincronizar 37 modelos, conciliação e pareceres',
      icon: Bot,
      badge: storage.getAgentApprovals().filter(a => a.status === 'PENDENTE').length || undefined
    },
    {
      id: 'NOTIFICACOES',
      label: 'Notificações e Alertas',
      shortLabel: 'Notificações',
      description: 'Monitoramento de vencimentos, contratos e conciliações',
      icon: Bell,
      badge: totalNotificationAlerts > 0 ? totalNotificationAlerts : undefined
    },
    {
      id: 'MELHORIAS',
      label: 'Solicitações de Melhorias',
      shortLabel: 'Melhorias',
      description: 'Sugestões, ideias e backlog evolutivo da plataforma',
      icon: Lightbulb
    },
    {
      id: 'AUDITORIA',
      label: 'Trilha de Auditoria',
      shortLabel: 'Auditoria',
      description: 'Rastreabilidade completa de ações e registros no sistema',
      icon: History
    },
    {
      id: 'BACKUP',
      label: 'Backup e Segurança',
      shortLabel: 'Backup',
      description: 'Exportação, importação e integridade do banco de dados',
      icon: Database
    }
  ];

  const handleInternalNavigate = (target: string) => {
    const isSubTab = tabs.some(t => t.id === target);
    if (isSubTab) {
      setActiveTab(target as ConfigSubTab);
    } else if (onNavigateToScreen) {
      onNavigateToScreen(target as NavigationScreen);
    }
  };

  const consultant = isConsultant();
  // Empresas clientes não veem a conexão técnica com o banco.
  const visibleTabs = tabs.filter(t => t.id !== 'SUPABASE' || consultant);
  const byId = (ids: ConfigSubTab[]) => ids.map(id => visibleTabs.find(t => t.id === id)).filter(Boolean) as TabDefinition[];
  const sections: { title: string; tabs: TabDefinition[]; collapsible?: boolean }[] = [
    { title: 'Minha empresa', tabs: byId(['EMPRESA', 'FORNECEDORES', 'PLANO_CONTAS', 'RECORRENCIAS']) },
    { title: 'Controle', tabs: byId(['USUARIOS_PERMISSOES', 'FECHAMENTO_PERIODO', 'NOTIFICACOES']) },
    { title: 'Avançado', collapsible: true, tabs: byId(['IA', 'MODULOS_INTEGRACOES', 'SUPABASE', 'AUDITORIA', 'BACKUP', 'MELHORIAS']) }
  ];
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedHasActive = sections[2].tabs.some(t => t.id === activeTab);

  const currentTabObj = tabs.find(t => t.id === activeTab) || tabs[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
      {/* Menu das configurações: lista vertical no computador, abas rolando no celular */}
      <nav
        aria-label="Seções das configurações"
        className="lg:sticky lg:top-0 -mx-4 px-4 sm:mx-0 sm:px-0 min-w-0"
      >
        <div className="flex lg:flex-col gap-1 lg:gap-5 overflow-x-auto lg:overflow-visible scrollbar-none pb-1 lg:pb-0">
          {sections.map(section => {
            const renderTab = (tab: TabDefinition) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.description}
                    aria-current={isActive ? 'page' : undefined}
                    className={`shrink-0 lg:w-full h-10 px-3.5 lg:px-3 flex items-center gap-3 rounded-lg text-sm whitespace-nowrap transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] font-medium'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[var(--brand-gold)]' : 'text-[var(--text-muted)]'}`} strokeWidth={1.75} />
                    <span className="truncate">{tab.shortLabel}</span>
                    {tab.badge !== undefined && tab.badge > 0 && (
                      <span className="lg:ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full bg-[var(--surface-elevated)] text-xs text-[var(--text-secondary)] flex items-center justify-center tabular-nums">
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              };
            const open = !section.collapsible || advancedOpen || advancedHasActive;
            return (
              <div key={section.title} className="flex lg:flex-col gap-1 shrink-0 lg:shrink">
                {section.collapsible ? (
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(o => !o)}
                    aria-expanded={open}
                    className="hidden lg:flex px-3 mb-0.5 items-center justify-between text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                  >
                    {section.title}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                ) : (
                  <h3 className="hidden lg:block px-3 mb-0.5 text-xs font-medium text-[var(--text-muted)]">{section.title}</h3>
                )}
                {section.collapsible && !open ? (
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(true)}
                    className="lg:hidden shrink-0 h-10 px-3.5 flex items-center gap-3 rounded-lg text-sm text-[var(--text-secondary)] cursor-pointer"
                  >
                    Avançado
                  </button>
                ) : (
                  section.tabs.map(renderTab)
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="min-w-0 space-y-5">
      {/* Conteúdo Renderizado da Aba Interna Selecionada */}
      <div className="settings-content">
        {activeTab === 'EMPRESA' && <CompanyConfigView />}
        {activeTab === 'FORNECEDORES' && <SuppliersView />}
        {activeTab === 'PLANO_CONTAS' && <ChartOfAccountsView />}
        {activeTab === 'RECORRENCIAS' && (
          <RecurrencesView onOpenBillingModal={onOpenBillingModal || (() => {})} />
        )}
        {activeTab === 'USUARIOS_PERMISSOES' && <UsersPermissionsView />}
        {activeTab === 'FECHAMENTO_PERIODO' && (
          <PeriodClosureView onNavigate={handleInternalNavigate} />
        )}
        {activeTab === 'MODULOS_INTEGRACOES' && <IntegrationsView />}
        {activeTab === 'SUPABASE' && <SupabaseConfigView />}
        {activeTab === 'IA' && <AgentCenterView />}
        {activeTab === 'NOTIFICACOES' && (
          <NotificationsConfigView onNavigate={handleInternalNavigate} />
        )}
        {activeTab === 'MELHORIAS' && <ImprovementsView />}
        {activeTab === 'AUDITORIA' && <AuditView />}
        {activeTab === 'BACKUP' && <BackupView />}
      </div>
      </div>
    </div>
  );
};
