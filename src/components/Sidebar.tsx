import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Receipt,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Landmark,
  CheckCheck,
  BarChart3,
  LineChart,
  FileSpreadsheet,
  Sliders,
  Scale,
  Target,
  PanelLeftClose,
  PanelLeftOpen,
  CreditCard,
  X,
  Bot,
  Briefcase as BriefcaseIcon,
  Sun,
  Moon,
  LogOut
} from 'lucide-react';
import { storage } from '../services/storageService';
import { isConsultant } from '../services/authService';
import { ChevronDown } from 'lucide-react';
import { GoldenLionLogo } from './Common/GoldenLionLogo';

export type NavigationScreen =
  | 'DASHBOARD'
  | 'CLIENTES'
  | 'SERVICOS'
  | 'CONTRATOS'
  | 'VENDAS_FATURAMENTO'
  | 'CONTAS_RECEBER'
  | 'CONTAS_PAGAR'
  | 'CARTAO_CREDITO'
  | 'MOVIMENTACOES'
  | 'BANCOS_CONTAS'
  | 'CONCILIACAO'
  | 'DRE'
  | 'FLUXO_CAIXA'
  | 'PLANEJAMENTO_ORCAMENTARIO'
  | 'COMPARE_DRE_CAIXA'
  | 'RELATORIOS'
  | 'IA'
  | 'CONSULTORIA'
  | 'CONFIGURACOES'
  | 'EMPRESA'
  | 'FORNECEDORES'
  | 'PLANO_CONTAS'
  | 'RECORRENCIAS'
  | 'USUARIOS_PERMISSOES'
  | 'FECHAMENTO_PERIODO'
  | 'MODULOS_INTEGRACOES'
  | 'NOTIFICACOES'
  | 'MELHORIAS'
  | 'AUDITORIA'
  | 'BACKUP';

/** Telas que pertencem ao hub de Configurações (mesma aba no menu). */
export const CONFIG_SCREENS: NavigationScreen[] = [
  'CONFIGURACOES', 'EMPRESA', 'FORNECEDORES', 'PLANO_CONTAS', 'RECORRENCIAS',
  'USUARIOS_PERMISSOES', 'FECHAMENTO_PERIODO', 'MODULOS_INTEGRACOES',
  'NOTIFICACOES', 'MELHORIAS', 'AUDITORIA', 'BACKUP'
];

/** Título exibido no topo de cada tela. */
export const SCREEN_TITLES: Partial<Record<NavigationScreen, { title: string; group: string }>> = {
  DASHBOARD: { title: 'Painel executivo', group: 'Visão geral' },
  CLIENTES: { title: 'Clientes', group: 'Comercial' },
  SERVICOS: { title: 'Serviços', group: 'Comercial' },
  CONTRATOS: { title: 'Contratos recorrentes', group: 'Comercial' },
  VENDAS_FATURAMENTO: { title: 'Vendas e faturamento', group: 'Comercial' },
  CONTAS_RECEBER: { title: 'Contas a receber', group: 'Financeiro' },
  CONTAS_PAGAR: { title: 'Contas a pagar', group: 'Financeiro' },
  CARTAO_CREDITO: { title: 'Cartões de crédito', group: 'Financeiro' },
  MOVIMENTACOES: { title: 'Movimentações', group: 'Financeiro' },
  BANCOS_CONTAS: { title: 'Bancos e contas', group: 'Financeiro' },
  CONCILIACAO: { title: 'Conciliação bancária', group: 'Financeiro' },
  DRE: { title: 'DRE gerencial', group: 'Gestão' },
  FLUXO_CAIXA: { title: 'Fluxo de caixa', group: 'Gestão' },
  PLANEJAMENTO_ORCAMENTARIO: { title: 'Planejamento orçamentário', group: 'Gestão' },
  COMPARE_DRE_CAIXA: { title: 'Comparar DRE x caixa', group: 'Gestão' },
  RELATORIOS: { title: 'Relatórios gerenciais', group: 'Gestão' },
  IA: { title: 'Central de IA', group: 'Inteligência artificial' },
  CONSULTORIA: { title: 'Modo consultoria', group: 'Consultoria' }
};

export function getScreenTitle(screen: NavigationScreen): { title: string; group: string } {
  if (CONFIG_SCREENS.includes(screen)) return { title: 'Configurações', group: 'Sistema' };
  return SCREEN_TITLES[screen] || { title: 'Contaju', group: '' };
}

const SHORT_LABELS: Partial<Record<NavigationScreen, string>> = {
  DASHBOARD: 'Painel',
  CLIENTES: 'Clientes',
  SERVICOS: 'Serviços',
  CONTRATOS: 'Contratos',
  VENDAS_FATURAMENTO: 'Vendas',
  CONTAS_RECEBER: 'Receber',
  CONTAS_PAGAR: 'Pagar',
  CARTAO_CREDITO: 'Cartões',
  MOVIMENTACOES: 'Caixa',
  BANCOS_CONTAS: 'Bancos',
  CONCILIACAO: 'Conciliar',
  DRE: 'DRE',
  FLUXO_CAIXA: 'Fluxo',
  PLANEJAMENTO_ORCAMENTARIO: 'Orçamento',
  COMPARE_DRE_CAIXA: 'DRE x Caixa',
  RELATORIOS: 'Relatórios',
  IA: 'IA',
  CONSULTORIA: 'Consultoria',
  CONFIGURACOES: 'Ajustes'
};

interface SidebarProps {
  currentScreen: NavigationScreen;
  onNavigate: (screen: NavigationScreen) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onLogout?: () => void;
}

interface NavItem {
  id: NavigationScreen;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
  /** "alert" = atraso (vermelho). Qualquer outro valor fica neutro. */
  badgeTone?: 'alert' | 'neutral';
  /** Item pouco usado: fica atrás de "Mais opções" no grupo. */
  secondary?: boolean;
  /** Técnico/contábil: some na versão simples (empresas clientes). */
  advanced?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentScreen,
  onNavigate,
  isOpenMobile,
  onCloseMobile,
  onLogout
}) => {
  const currentUser = storage.getCurrentUser();
  const [theme, setTheme] = useState<'dark' | 'light'>(storage.getTheme());
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    storage.setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    document.documentElement.classList.toggle('dark', next === 'dark');
  };
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('contaju_sidebar_minimized');
      if (saved !== null) return saved === 'true';
    } catch {
      // ignora
    }
    return typeof window !== 'undefined' && window.innerWidth < 1280;
  });

  // Recolhe sozinho depois de 5 segundos sem mexer (somente computador)
  const idleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetIdle = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (typeof window === 'undefined' || window.innerWidth < 1024) return;
    idleRef.current = setTimeout(() => setIsMinimized(true), 5000);
  }, []);
  useEffect(() => {
    resetIdle();
    return () => {
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, [resetIdle, currentScreen]);

  // O menu em gaveta (celular) nunca fica recolhido
  const collapsed = isMinimized && !isOpenMobile;

  useEffect(() => {
    if (!isOpenMobile) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseMobile();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpenMobile, onCloseMobile]);

  const toggleMinimized = () => {
    setIsMinimized(prev => {
      const next = !prev;
      try {
        localStorage.setItem('contaju_sidebar_minimized', String(next));
      } catch {
        // ignora
      }
      return next;
    });
  };

  const computeAlertBadges = useCallback(() => {
    try {
      const titles = storage.getTitles();
      const today = new Date().toISOString().split('T')[0];
      const overdueRec = titles.filter(t => t.type === 'RECEBER' && t.balancePrincipal > 0 && t.dueDate < today).length;
      const overduePay = titles.filter(t => t.type === 'PAGAR' && t.balancePrincipal > 0 && t.dueDate < today).length;
      const pendingReconcile = storage.getStatementEntries().filter(
        s => s.reconciliationStatus === 'PENDENTE' || s.reconciliationStatus === 'SUGESTAO'
      ).length;
      const nowTime = new Date().getTime();
      const expiring = storage.getContracts().filter(c => {
        if (c.status !== 'ATIVO' || !c.endDate) return false;
        const diffDays = Math.ceil((new Date(c.endDate).getTime() - nowTime) / (1000 * 3600 * 24));
        return diffDays >= 0 && diffDays <= 30;
      }).length;
      const payToday = titles.filter(t => t.type === 'PAGAR' && t.balancePrincipal > 0 && t.dueDate === today).length;
      return {
        overdueReceivables: overdueRec,
        overduePayables: overduePay,
        pendingReconciliation: pendingReconcile,
        totalNotificationAlerts: expiring + payToday + pendingReconcile
      };
    } catch {
      return { overdueReceivables: 0, overduePayables: 0, pendingReconciliation: 0, totalNotificationAlerts: 0 };
    }
  }, []);

  const [alertBadges, setAlertBadges] = useState(computeAlertBadges);

  useEffect(() => {
    return storage.subscribe(() => {
      setAlertBadges(computeAlertBadges());
    });
  }, [computeAlertBadges]);

  const { overdueReceivables, overduePayables, pendingReconciliation, totalNotificationAlerts } = alertBadges;

  const [openMore, setOpenMore] = useState<Record<string, boolean>>({});

  const groups: NavGroup[] = [
    {
      title: 'Visão geral',
      items: [{ id: 'DASHBOARD', label: 'Painel executivo', icon: LayoutDashboard }]
    },
    {
      title: 'Comercial',
      items: [
        { id: 'CLIENTES', label: 'Clientes', icon: Users },
        { id: 'SERVICOS', label: 'Serviços', icon: Briefcase, secondary: true },
        { id: 'CONTRATOS', label: 'Contratos recorrentes', icon: FileText },
        { id: 'VENDAS_FATURAMENTO', label: 'Vendas e faturamento', icon: Receipt }
      ]
    },
    {
      title: 'Financeiro',
      items: [
        { id: 'CONTAS_RECEBER', label: 'Contas a receber', icon: TrendingUp, badge: overdueReceivables || undefined, badgeTone: 'alert' },
        { id: 'CONTAS_PAGAR', label: 'Contas a pagar', icon: TrendingDown, badge: overduePayables || undefined, badgeTone: 'alert' },
        { id: 'CARTAO_CREDITO', label: 'Cartões de crédito', icon: CreditCard },
        { id: 'MOVIMENTACOES', label: 'Movimentações', icon: ArrowLeftRight },
        { id: 'BANCOS_CONTAS', label: 'Bancos e contas', icon: Landmark },
        { id: 'CONCILIACAO', label: 'Conciliação bancária', icon: CheckCheck, badge: pendingReconciliation || undefined, badgeTone: 'neutral' }
      ]
    },
    {
      title: 'Gestão',
      items: [
        { id: 'DRE', label: 'DRE gerencial', icon: BarChart3, advanced: true },
        { id: 'FLUXO_CAIXA', label: 'Fluxo de caixa', icon: LineChart },
        { id: 'PLANEJAMENTO_ORCAMENTARIO', label: 'Planejamento orçamentário', icon: Target, secondary: true, advanced: true },
        { id: 'COMPARE_DRE_CAIXA', label: 'Comparar DRE x caixa', icon: Scale, secondary: true, advanced: true },
        { id: 'RELATORIOS', label: 'Relatórios gerenciais', icon: FileSpreadsheet }
      ]
    },
    {
      title: 'Sistema',
      items: [
        ...(isConsultant() ? [{ id: 'CONSULTORIA' as NavigationScreen, label: 'Modo consultoria', icon: BriefcaseIcon }] : []),
        { id: 'IA', label: 'Central de IA', icon: Bot, secondary: true },
        { id: 'CONFIGURACOES', label: 'Configurações', icon: Sliders, badge: totalNotificationAlerts || undefined, badgeTone: 'neutral' }
      ]
    }
  ];

  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black/50 backdrop-blur-[3px]"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Menu principal"
        onMouseMove={resetIdle}
        onMouseEnter={resetIdle}
        className={`
          fixed lg:static inset-y-0 left-0 z-50 lg:z-auto flex flex-col shrink-0 select-none
          w-[300px] max-w-[88vw] ${collapsed ? 'lg:w-[92px]' : 'lg:w-[264px]'}
          bg-[var(--surface-card)] border-r border-[var(--border-subtle)]
          transition-[width,transform] duration-300 ease-out
          ${isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Marca */}
        <div className={`h-16 shrink-0 flex items-center border-b border-[var(--border-subtle)] ${collapsed ? 'justify-center px-0' : 'justify-between px-5'}`}>
          <button
            type="button"
            onClick={collapsed ? toggleMinimized : () => onNavigate('DASHBOARD')}
            className="flex items-center gap-3 min-w-0 cursor-pointer"
            title={collapsed ? 'Expandir menu' : 'Ir para o painel'}
          >
            <GoldenLionLogo size="md" />
            {!collapsed && (
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">Contaju</span>
                <span className="block text-xs text-[var(--text-muted)] truncate">Gestão financeira</span>
              </span>
            )}
          </button>
          {!collapsed && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navegação */}
        <nav className={`flex-1 overflow-y-auto py-5 ${collapsed ? 'px-3' : 'px-3'}`}>
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.title}>
                {!collapsed ? (
                  <h3 className="px-3 mb-1.5 text-xs font-medium text-[var(--text-muted)]">{group.title}</h3>
                ) : (
                  <div className="mx-auto mb-2 h-px w-6 bg-[var(--border-subtle)]" />
                )}

                <div className="space-y-0.5">
                  {(() => {
                    const secondaryItems = group.items.filter(i => i.secondary);
                    const hasActiveSecondary = secondaryItems.some(i => i.id === currentScreen);
                    const moreOpen = !!openMore[group.title] || hasActiveSecondary;
                    const visibleItems = group.items.filter(i => !i.secondary || (collapsed ? i.id === currentScreen : moreOpen));
                    return { visibleItems, secondaryItems, moreOpen };
                  })().visibleItems.map(item => {
                    const Icon = item.icon;
                    const isActive = item.id === 'CONFIGURACOES' ? CONFIG_SCREENS.includes(currentScreen) : currentScreen === item.id;
                    const badgeClass =
                      item.badgeTone === 'alert'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]';

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onNavigate(item.id);
                          onCloseMobile();
                        }}
                        title={collapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ''}` : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`
                          group relative w-full flex rounded-lg text-sm transition-colors cursor-pointer ${item.advanced ? 'adv-only' : ''}
                          ${collapsed ? 'flex-col items-center justify-center gap-1 py-2 min-h-[56px]' : 'h-10 items-center gap-3 px-3'}
                          ${isActive
                            ? 'bg-[linear-gradient(90deg,rgba(201,162,74,0.18),rgba(201,162,74,0.04))] ring-1 ring-[var(--gold-edge)] text-[var(--text-primary)] font-medium'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'}
                        `}
                      >
                        {isActive && (
                          <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r-full bg-[var(--brand-gold-fill)] shadow-[0_0_14px_2px_rgba(201,162,74,0.75)]" />
                        )}
                        <span className="relative shrink-0">
                          <Icon
                            strokeWidth={1.75}
                            className={`w-[18px] h-[18px] ${isActive ? 'text-[var(--brand-gold)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}`}
                          />
                          {collapsed && item.badge !== undefined && (
                            <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ring-2 ring-[var(--surface-card)] ${item.badgeTone === 'alert' ? 'bg-rose-500' : 'bg-[var(--brand-gold-fill)]'}`} />
                          )}
                        </span>
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {collapsed && <span className="text-xs leading-tight text-center max-w-[76px] truncate">{SHORT_LABELS[item.id] || item.label}</span>}
                        {!collapsed && item.badge !== undefined && (
                          <span className={`ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-medium flex items-center justify-center tabular-nums ${badgeClass}`}>
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {!collapsed && group.items.some(i => i.secondary) && !group.items.some(i => i.secondary && i.id === currentScreen) && (
                    <button
                      type="button"
                      onClick={() => setOpenMore(p => ({ ...p, [group.title]: !p[group.title] }))}
                      aria-expanded={!!openMore[group.title]}
                      className="w-full h-9 px-3 flex items-center gap-3 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                    >
                      <ChevronDown className={`w-[18px] h-[18px] transition-transform ${openMore[group.title] ? 'rotate-180' : ''}`} strokeWidth={1.75} />
                      <span>{openMore[group.title] ? 'Menos opções' : 'Mais opções'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Conta (somente celular): usuário, tema e sair */}
        <div className="lg:hidden shrink-0 border-t border-[var(--border-subtle)] p-3 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="w-9 h-9 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-sm font-semibold">
              {currentUser.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-medium truncate">{currentUser.name}</span>
              <span className="block text-xs text-[var(--text-muted)] truncate">{currentUser.email}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full h-11 flex items-center gap-3 px-3 rounded-lg text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />}
            {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          </button>
          <button
            type="button"
            onClick={() => {
              storage.logout();
              onCloseMobile();
              if (onLogout) onLogout();
            }}
            className="w-full h-11 flex items-center gap-3 px-3 rounded-lg text-sm text-[var(--status-danger)] hover:bg-[var(--surface-hover)] cursor-pointer"
          >
            <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
            Sair da conta
          </button>
        </div>

        {/* Rodapé: recolher / expandir (somente computador) */}
        <div className="hidden lg:block shrink-0 border-t border-[var(--border-subtle)] p-3">
          <button
            type="button"
            onClick={toggleMinimized}
            className={`w-full h-10 flex items-center rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer ${collapsed ? 'justify-center' : 'gap-3 px-3'}`}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <PanelLeftClose className="w-[18px] h-[18px]" strokeWidth={1.75} />}
            {!collapsed && <span>Recolher menu</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
