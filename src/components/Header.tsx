import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Wallet,
  Plus,
  ChevronDown,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  Download,
  Upload,
  CalendarDays,
  Sun,
  Moon,
  Bell,
  Search,
  Calculator,
  Menu,
  LogOut,
  Check
} from 'lucide-react';
import { User, UserRole } from '../types';
import { NavigationScreen, getScreenTitle } from './Sidebar';
import { storage } from '../services/storageService';
import { FinancialEngine, formatBRL } from '../services/financialEngine';
import { useModulePeriod } from '../hooks/useModulePeriod';
import { useToast } from '../hooks/useToast';
import { formatPeriodRangeBR } from '../utils/dateUtils';
import { GlobalPeriodSelectorModal } from './Common/GlobalPeriodSelectorModal';
import { GlobalSearchModal } from './Common/GlobalSearchModal';
import { PWAInstallButton } from './Common/PWAInstallButton';
import { OfflineSyncIndicator } from './Common/OfflineSyncIndicator';
import { AiHealthStatusPill } from './Common/AiHealthStatusPill';

interface HeaderProps {
  currentUser: User;
  currentScreen?: NavigationScreen;
  onOpenNewTitleModal: (defaultType: 'RECEBER' | 'PAGAR') => void;
  onOpenTransferModal: () => void;
  onOpenBillingModal: () => void;
  onOpenMobileSidebar?: () => void;
  onNavigate?: (screen: NavigationScreen) => void;
  onNavigateWithSearch?: (screen: NavigationScreen, searchFilter: string) => void;
  onToggleCalculator?: () => void;
  isCalculatorOpen?: boolean;
  isCalculatorMinimized?: boolean;
  onLogout?: () => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Gestor geral',
  ADMIN: 'Administrador',
  GESTOR_FINANCEIRO: 'Gestor financeiro',
  OPERADOR: 'Operador',
  CONSULTA: 'Consulta'
};

/** Fecha um popover ao clicar fora ou apertar Esc. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const iconButton =
  'relative h-10 w-10 shrink-0 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer';

const menuItem =
  'w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-left';

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  currentScreen = 'DASHBOARD',
  onOpenNewTitleModal,
  onOpenTransferModal,
  onOpenBillingModal,
  onOpenMobileSidebar,
  onNavigate,
  onNavigateWithSearch,
  onToggleCalculator,
  isCalculatorOpen = false,
  isCalculatorMinimized = false,
  onLogout
}) => {
  const { showSuccess, showError } = useToast();
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(storage.getTheme());
  const newMenu = usePopover();
  const userMenu = usePopover();

  const payablesPeriod = useModulePeriod('PAYABLES');
  const receivablesPeriod = useModulePeriod('RECEIVABLES');
  const dashboardPeriod = useModulePeriod('DASHBOARD');

  const currentPeriodConfig = useMemo(() => {
    const syncGlobally = (p: any) => storage.saveGlobalPeriodFilter(p);
    if (currentScreen === 'CONTAS_PAGAR') {
      return {
        label: 'Vencimentos a pagar',
        period: payablesPeriod.period,
        updatePeriod: syncGlobally,
        title: 'Período de vencimento: contas a pagar',
        subtitle: 'Filtra as contas a pagar pelo mês de vencimento'
      };
    }
    if (currentScreen === 'CONTAS_RECEBER') {
      return {
        label: 'Vencimentos a receber',
        period: receivablesPeriod.period,
        updatePeriod: syncGlobally,
        title: 'Período de vencimento: contas a receber',
        subtitle: 'Filtra as contas a receber pelo mês de vencimento'
      };
    }
    return {
      label: 'Painel executivo',
      period: dashboardPeriod.period,
      updatePeriod: syncGlobally,
      title: 'Período do painel executivo',
      subtitle: 'Período usado nos gráficos, DRE e demais módulos'
    };
  }, [currentScreen, payablesPeriod.period, receivablesPeriod.period, dashboardPeriod.period]);

  const company = useMemo(() => storage.getCompany(), []);
  const users = useMemo(() => storage.getUsers(), []);
  const [consolidatedCash, setConsolidatedCash] = useState<number>(() => {
    try {
      return FinancialEngine.getConsolidatedCashBalance();
    } catch {
      return 0;
    }
  });

  // Ctrl+K / Cmd+K abre a busca
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const computeNotifications = useCallback(() => {
    try {
      const titles = storage.getTitles();
      const todayStr = new Date().toISOString().split('T')[0];
      const nowTime = new Date().getTime();
      const expiring = storage.getContracts().filter(c => {
        if (c.status !== 'ATIVO' || !c.endDate) return false;
        const diffDays = Math.ceil((new Date(c.endDate).getTime() - nowTime) / (1000 * 3600 * 24));
        return diffDays >= 0 && diffDays <= 30;
      }).length;
      const payToday = titles.filter(t => t.type === 'PAGAR' && t.balancePrincipal > 0 && t.dueDate === todayStr).length;
      const pendingReconcile = storage.getStatementEntries().filter(
        s => s.reconciliationStatus === 'PENDENTE' || s.reconciliationStatus === 'SUGESTAO'
      ).length;
      return expiring + payToday + pendingReconcile;
    } catch {
      return 0;
    }
  }, []);

  const [totalAlerts, setTotalAlerts] = useState(computeNotifications);

  useEffect(() => {
    return storage.subscribe(() => {
      try {
        setConsolidatedCash(FinancialEngine.getConsolidatedCashBalance());
      } catch {
        // mantém o último valor
      }
      setTotalAlerts(computeNotifications());
    });
  }, [computeNotifications]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    storage.setTheme(nextTheme);
    document.documentElement.classList.toggle('light', nextTheme === 'light');
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const handleSwitchUser = (userId: string) => {
    storage.setCurrentUserId(userId);
    userMenu.setOpen(false);
    window.location.reload();
  };

  const handleExportBackup = () => {
    const backupJson = storage.exportFullBackup();
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-contaju-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    userMenu.setOpen(false);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      const ok = storage.importFullBackup(content);
      if (ok) {
        showSuccess('Backup restaurado com sucesso. O sistema vai recarregar.', 'Restauração concluída');
        setTimeout(() => window.location.reload(), 1200);
      } else {
        showError('O arquivo selecionado não é um backup válido do ContaJu.', 'Arquivo inválido');
      }
    };
    reader.readAsText(file);
    userMenu.setOpen(false);
  };

  const { title, group } = getScreenTitle(currentScreen as NavigationScreen);
  const period = currentPeriodConfig.period;
  const periodText = period.active ? formatPeriodRangeBR(period.month, period.year) : 'Todo o período';
  const calculatorActive = isCalculatorOpen && !isCalculatorMinimized;

  return (
    <>
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/90 backdrop-blur-md">
      <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center gap-3 sm:gap-4">

        {/* Menu (celular) + título da tela */}
        {onOpenMobileSidebar && (
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className={`${iconButton} lg:hidden -ml-2`}
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="min-w-0 flex-1 lg:flex-none lg:w-[200px] xl:w-[240px]">
          {group && <p className="hidden sm:block text-xs text-[var(--text-muted)] leading-none mb-1 truncate">{group}</p>}
          <h1 className="text-[17px] leading-tight font-semibold tracking-tight text-[var(--text-primary)] truncate">{title}</h1>
        </div>

        {/* Busca */}
        <button
          type="button"
          onClick={() => setIsSearchModalOpen(true)}
          className="hidden md:flex flex-1 max-w-md h-10 items-center gap-3 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:border-[var(--border-highlight)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer"
          title="Buscar clientes, contratos, faturas e serviços (Ctrl+K)"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="text-sm truncate">Buscar no sistema</span>
          <kbd className="ml-auto hidden lg:inline-flex items-center gap-0.5 text-xs text-[var(--text-muted)] px-1.5 h-5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)]">
            Ctrl K
          </kbd>
        </button>

        <div className="hidden md:block flex-1" />

        {/* Disponibilidade */}
        <div className="hidden 2xl:flex flex-col items-end leading-tight pr-1" title="Saldo consolidado em todas as contas">
          <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
            <Wallet className="w-3.5 h-3.5" strokeWidth={1.75} />
            Disponível
          </span>
          <span className="text-[15px] font-semibold text-[var(--text-primary)] tabular-nums">{formatBRL(consolidatedCash)}</span>
        </div>

        {/* Período */}
        <button
          type="button"
          onClick={() => setIsPeriodModalOpen(true)}
          className="hidden lg:flex h-10 items-center gap-2.5 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-sm text-[var(--text-primary)] hover:border-[var(--border-highlight)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer whitespace-nowrap"
          title={`Período: ${currentPeriodConfig.label}`}
        >
          <CalendarDays className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
          <span className="tabular-nums">{periodText}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        </button>

        {/* Novo lançamento */}
        <div className="relative shrink-0" ref={newMenu.ref}>
          <button
            type="button"
            onClick={() => newMenu.setOpen(o => !o)}
            className="h-10 flex items-center gap-2 pl-3.5 pr-3 sm:pr-3.5 rounded-xl btn-gold text-sm font-semibold active:brightness-95 transition cursor-pointer"
            aria-haspopup="menu"
            aria-expanded={newMenu.open}
          >
            <Plus className="w-4 h-4" strokeWidth={2.25} />
            <span className="hidden sm:inline">Novo</span>
            <ChevronDown className="hidden sm:block w-3.5 h-3.5 opacity-70" />
          </button>

          {newMenu.open && (
            <div role="menu" className="absolute right-0 mt-2 w-72 p-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xl z-50 animate-[modalIn_0.16s_ease-out]">
              <p className="px-3 pt-2 pb-1.5 text-xs text-[var(--text-muted)]">Criar lançamento</p>
              <button type="button" role="menuitem" className={menuItem} onClick={() => { newMenu.setOpen(false); onOpenNewTitleModal('RECEBER'); }}>
                <ArrowDownLeft className="w-4 h-4 text-[var(--status-success)]" strokeWidth={1.75} />
                Conta a receber
              </button>
              <button type="button" role="menuitem" className={menuItem} onClick={() => { newMenu.setOpen(false); onOpenNewTitleModal('PAGAR'); }}>
                <ArrowUpRight className="w-4 h-4 text-[var(--status-danger)]" strokeWidth={1.75} />
                Conta a pagar
              </button>
              <button type="button" role="menuitem" className={menuItem} onClick={() => { newMenu.setOpen(false); onOpenTransferModal(); }}>
                <ArrowLeftRight className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                Transferência entre contas
              </button>
              <div className="my-1.5 h-px bg-[var(--border-subtle)]" />
              <button type="button" role="menuitem" className={menuItem} onClick={() => { newMenu.setOpen(false); onOpenBillingModal(); }}>
                <FileText className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                Gerar faturamento do mês
              </button>
            </div>
          )}
        </div>

        {/* Ações discretas */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => setIsSearchModalOpen(true)} className={`${iconButton} md:hidden`} aria-label="Buscar">
            <Search className="w-[18px] h-[18px]" strokeWidth={1.75} />
          </button>

          <div className="hidden 2xl:flex items-center gap-1 mr-1">
            <AiHealthStatusPill onNavigate={onNavigate} />
          </div>
          <OfflineSyncIndicator />
          <PWAInstallButton variant="header" />

          {onToggleCalculator && (
            <button
              type="button"
              onClick={onToggleCalculator}
              className={`${iconButton} hidden sm:flex ${calculatorActive ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]' : ''}`}
              title="Calculadora (Alt+C)"
              aria-label="Calculadora"
            >
              <Calculator className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate && onNavigate('NOTIFICACOES')}
            className={iconButton}
            title="Central de notificações"
            aria-label="Notificações"
          >
            <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
            {totalAlerts > 0 && (
              <span className="absolute top-2 right-2 min-w-[8px] h-2 rounded-full bg-[var(--brand-gold-fill)] ring-2 ring-[var(--surface-card)] shadow-[0_0_10px_2px_rgba(201,162,74,0.7)]" />
            )}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className={`${iconButton} hidden sm:flex`}
            title={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />}
          </button>
        </div>

        {/* Usuário */}
        <div className="relative shrink-0 hidden sm:block" ref={userMenu.ref}>
          <button
            type="button"
            onClick={() => userMenu.setOpen(o => !o)}
            className="h-10 flex items-center gap-2.5 pl-1 pr-1 sm:pr-2.5 rounded-xl hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            aria-haspopup="menu"
            aria-expanded={userMenu.open}
            title="Perfil e conta"
          >
            <span className="w-8 h-8 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-sm font-semibold text-[var(--text-primary)]">
              {currentUser.name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden 2xl:block text-left leading-tight">
              <span className="block text-sm font-medium text-[var(--text-primary)] truncate max-w-[130px]">{currentUser.name}</span>
              <span className="block text-xs text-[var(--text-muted)]">{ROLE_LABELS[currentUser.role]}</span>
            </span>
          </button>

          {userMenu.open && (
            <div role="menu" className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-24px)] p-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xl z-50 animate-[modalIn_0.16s_ease-out]">
              <div className="px-3 pt-2.5 pb-3 border-b border-[var(--border-subtle)] mb-1.5">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{currentUser.name}</p>
                <p className="text-xs text-[var(--text-muted)] truncate">{currentUser.email}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{company.tradeName}</p>
              </div>

              {users.length > 1 && (
                <>
                  <p className="px-3 pt-1 pb-1.5 text-xs text-[var(--text-muted)]">Trocar de usuário</p>
                  <div className="max-h-44 overflow-y-auto">
                    {users.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        role="menuitem"
                        onClick={() => handleSwitchUser(u.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors cursor-pointer text-left"
                      >
                        <span className="w-7 h-7 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-semibold text-[var(--text-secondary)] shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block text-sm text-[var(--text-primary)] truncate">{u.name}</span>
                          <span className="block text-xs text-[var(--text-muted)]">{ROLE_LABELS[u.role]}</span>
                        </span>
                        {u.id === currentUser.id && <Check className="w-4 h-4 text-[var(--brand-gold)] shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <div className="my-1.5 h-px bg-[var(--border-subtle)]" />
                </>
              )}

              <button type="button" role="menuitem" onClick={handleExportBackup} className={menuItem}>
                <Download className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                Exportar backup
              </button>
              <label className={menuItem}>
                <Upload className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                Restaurar backup
                <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
              </label>

              <div className="my-1.5 h-px bg-[var(--border-subtle)]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  userMenu.setOpen(false);
                  storage.logout();
                  if (onLogout) onLogout();
                }}
                className={`${menuItem} text-[var(--status-danger)]`}
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </div>

    </header>

      {isPeriodModalOpen && (
        <GlobalPeriodSelectorModal
          isOpen={isPeriodModalOpen}
          onClose={() => setIsPeriodModalOpen(false)}
          customPeriod={currentPeriodConfig.period}
          onSaveCustomPeriod={currentPeriodConfig.updatePeriod}
          titleOverride={currentPeriodConfig.title}
          subtitleOverride={currentPeriodConfig.subtitle}
        />
      )}

      {isSearchModalOpen && (
        <GlobalSearchModal
          isOpen={isSearchModalOpen}
          onClose={() => setIsSearchModalOpen(false)}
          onNavigate={(screen, searchFilter) => {
            setIsSearchModalOpen(false);
            if (onNavigateWithSearch && searchFilter) {
              onNavigateWithSearch(screen, searchFilter);
            } else if (onNavigate) {
              onNavigate(screen);
            }
          }}
        />
      )}
    </>
  );
};
