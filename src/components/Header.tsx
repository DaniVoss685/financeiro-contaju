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
  Check,
  Bot,
  Eye
} from 'lucide-react';
import { Camera } from 'lucide-react';
import { isConsultant } from '../services/authService';
import { useIsSimpleMode, setViewMode, getIsSimpleMode } from '../hooks/useViewMode';
import { NotificationsModal } from './Common/NotificationsModal';
import { collectNotifications } from '../services/notificationSummary';
import { User, UserRole } from '../types';
import { NavigationScreen, getScreenTitle } from './Sidebar';
import { storage } from '../services/storageService';
import { FinancialEngine, formatBRL } from '../services/financialEngine';
import { useModulePeriod } from '../hooks/useModulePeriod';
import { useToast } from '../hooks/useToast';
import { formatPeriodLabelBR } from '../utils/dateUtils';
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(storage.getTheme());
  const newMenu = usePopover();
  const userMenu = usePopover();
  // Foto do perfil: guardada neste aparelho e, quando possível, no cadastro do usuário
  const avatarKey = 'contaju_avatar_' + (currentUser.email || currentUser.id);
  const [avatar, setAvatar] = useState<string>(() => {
    try { return localStorage.getItem(avatarKey) || ''; } catch { return ''; }
  });
  const avatarInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try { setAvatar(localStorage.getItem(avatarKey) || ''); } catch { /* sem foto salva */ }
    (async () => {
      try {
        const { getSupabaseClient } = await import('../services/supabaseClient');
        const cl = getSupabaseClient();
        const { data } = (await cl?.auth.getUser()) || { data: null as any };
        const remote = data?.user?.user_metadata?.avatar;
        if (remote) { setAvatar(remote); try { localStorage.setItem(avatarKey, remote); } catch { /* ok */ } }
      } catch { /* segue sem foto da nuvem */ }
    })();
  }, [avatarKey]);
  const handleAvatarFile = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        const url = canvas.toDataURL('image/jpeg', 0.85);
        setAvatar(url);
        try { localStorage.setItem(avatarKey, url); } catch { /* ok */ }
        (async () => {
          try {
            const { getSupabaseClient } = await import('../services/supabaseClient');
            await getSupabaseClient()?.auth.updateUser({ data: { avatar: url } });
          } catch { /* a foto fica ao menos neste aparelho */ }
        })();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

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
      const simple = getIsSimpleMode();
      return collectNotifications()
        .filter(g => !(simple && g.id === 'CONCILIACAO'))
        .reduce((acc, g) => acc + g.items.length, 0);
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

  const simpleView = useIsSimpleMode();

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
        showError('O arquivo selecionado não é um backup válido do Contaju.', 'Arquivo inválido');
      }
    };
    reader.readAsText(file);
    userMenu.setOpen(false);
  };

  const { title, group } = getScreenTitle(currentScreen as NavigationScreen);
  const period = currentPeriodConfig.period;
  const periodText = formatPeriodLabelBR(period);
  const calculatorActive = isCalculatorOpen && !isCalculatorMinimized;

  return (
    <>
    <header className="sticky top-0 z-30 w-full border-b border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <div className="h-16 px-4 sm:px-6 lg:px-8 flex items-center gap-3 sm:gap-5">

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
        <div className="hidden" title="Saldo consolidado em todas as contas">
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
          className="hidden xl:flex h-10 items-center gap-2.5 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-sm text-[var(--text-primary)] hover:border-[var(--border-highlight)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer whitespace-nowrap"
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
              <div className="adv-only my-1.5 h-px bg-[var(--border-subtle)]" />
              <button type="button" role="menuitem" className={`${menuItem} adv-only`} onClick={() => { newMenu.setOpen(false); onOpenBillingModal(); }}>
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

                    <OfflineSyncIndicator />

          {onToggleCalculator && (
            <button
              type="button"
              onClick={onToggleCalculator}
              className={`${iconButton} hidden`}
              title="Calculadora (Alt+C)"
              aria-label="Calculadora"
            >
              <Calculator className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsNotificationsOpen(true)}
            className={iconButton}
            title="Notificações"
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
            className={`${iconButton}`}
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
            <span className="w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center text-sm font-semibold text-[var(--text-primary)]">
              {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : currentUser.name.charAt(0).toUpperCase()}
            </span>
            <span className="hidden 2xl:block text-left leading-tight">
              <span className="block text-sm font-medium text-[var(--text-primary)] truncate max-w-[130px]">{currentUser.name}</span>
              <span className="block text-xs text-[var(--text-muted)]">{ROLE_LABELS[currentUser.role]}</span>
            </span>
          </button>

          {userMenu.open && (
            <div role="menu" className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-24px)] p-1.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xl z-50 animate-[modalIn_0.16s_ease-out]">
              <div className="px-3 pt-2.5 pb-3 border-b border-[var(--border-subtle)] mb-1.5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => avatarInput.current?.click()}
                  className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden bg-[var(--surface-elevated)] border border-[var(--border-highlight)] flex items-center justify-center text-base font-semibold text-[var(--text-primary)] cursor-pointer group"
                  title={avatar ? 'Trocar foto' : 'Adicionar foto'}
                >
                  {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : currentUser.name.charAt(0).toUpperCase()}
                  <span className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                    <Camera className="w-4 h-4" />
                  </span>
                </button>
                <input ref={avatarInput} type="file" accept="image/*" className="hidden" onChange={e => { handleAvatarFile(e.target.files?.[0]); e.target.value = ''; }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{currentUser.name}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{currentUser.email}</p>
                  <button type="button" onClick={() => avatarInput.current?.click()} className="mt-0.5 text-xs text-[var(--brand-gold)] hover:underline cursor-pointer">
                    {avatar ? 'Trocar foto' : 'Adicionar foto'}
                  </button>
                </div>
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

              {isConsultant() && (
                <button type="button" role="menuitem" onClick={() => { userMenu.setOpen(false); setViewMode(simpleView ? 'contabil' : 'simples'); }} className={menuItem}>
                  <Eye className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                  {simpleView ? 'Ver versão contábil' : 'Ver versão simples'}
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => { userMenu.setOpen(false); toggleTheme(); }} className={menuItem}>
                {theme === 'dark' ? <Sun className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} /> : <Moon className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />}
                {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              </button>
              {onToggleCalculator && (
                <button type="button" role="menuitem" onClick={() => { userMenu.setOpen(false); onToggleCalculator(); }} className={menuItem}>
                  <Calculator className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                  Calculadora
                </button>
              )}
              {onNavigate && (
                <button type="button" role="menuitem" onClick={() => { userMenu.setOpen(false); onNavigate('IA'); }} className={menuItem}>
                  <Bot className="w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
                  Central de IA
                </button>
              )}
              <div className="my-1.5 h-px bg-[var(--border-subtle)]" />
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

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        onNavigate={screen => onNavigate && onNavigate(screen)}
        onOpenItem={item => {
          if (item.search && onNavigateWithSearch && (item.screen === 'CONTAS_PAGAR' || item.screen === 'CONTAS_RECEBER')) {
            // Um item atrasado pode ser de outro mês: tira o filtro de data para ele aparecer
            storage.saveGlobalPeriodFilter({ ...storage.getGlobalPeriodFilter(), fromDate: undefined, toDate: undefined, active: false });
            onNavigateWithSearch(item.screen, item.search);
          } else if (onNavigate) {
            onNavigate(item.screen);
          }
        }}
      />

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
