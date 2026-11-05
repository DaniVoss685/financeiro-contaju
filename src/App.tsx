import React, { useState, useEffect, useMemo, useTransition, Suspense, lazy } from 'react';
import { Header } from './components/Header';
import { Sidebar, NavigationScreen } from './components/Sidebar';
import { isConsultant, getOrgs, getActiveOrgId, switchOrg } from './services/authService';
import { BottomNavBar } from './components/Common/BottomNavBar';
import { storage } from './services/storageService';
import { User } from './types';
import { AppErrorBoundary } from './components/Common/AppErrorBoundary';

// Modals
import { NewTitleModal } from './components/Modals/NewTitleModal';
import { TransferModal } from './components/Modals/TransferModal';
import { BillingGenerationModal } from './components/Modals/BillingGenerationModal';

// View Principal importada diretamente para carregamento instantâneo no primeiro acesso
import { DashboardView } from './components/Dashboard/DashboardView';

// Helper com retry automático contra falhas transitórias de chunks
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      console.warn('[Contaju Lazy] Recarregando módulo após falha transitória...', error);
      return await componentImport();
    }
  });
}

// Demais Views carregadas sob demanda via Code-Splitting
// Cópia do painel como era antes da limpeza (abrir com ?painel=antes para comparar)
const DashboardViewAntes = lazyWithRetry(() => import('./components/Dashboard/DashboardViewAntes').then(m => ({ default: m.DashboardViewAntes })));
const ConsultoriaView = lazyWithRetry(() => import('./components/Consultoria/ConsultoriaView').then(m => ({ default: m.ConsultoriaView })));
const ClientsView = lazyWithRetry(() => import('./components/Commercial/ClientsView').then(m => ({ default: m.ClientsView })));
const ServicesView = lazyWithRetry(() => import('./components/Commercial/ServicesView').then(m => ({ default: m.ServicesView })));
const ContractsView = lazyWithRetry(() => import('./components/Commercial/ContractsView').then(m => ({ default: m.ContractsView })));
const SalesView = lazyWithRetry(() => import('./components/Commercial/SalesView').then(m => ({ default: m.SalesView })));

const ReceivablesView = lazyWithRetry(() => import('./components/Financial/ReceivablesView').then(m => ({ default: m.ReceivablesView })));
const PayablesView = lazyWithRetry(() => import('./components/Financial/PayablesView').then(m => ({ default: m.PayablesView })));
const CreditCardsView = lazyWithRetry(() => import('./components/Financial/CreditCardsView').then(m => ({ default: m.CreditCardsView })));
const MovementsView = lazyWithRetry(() => import('./components/Financial/MovementsView').then(m => ({ default: m.MovementsView })));
const BankAccountsView = lazyWithRetry(() => import('./components/Financial/BankAccountsView').then(m => ({ default: m.BankAccountsView })));
const ReconciliationView = lazyWithRetry(() => import('./components/Financial/ReconciliationView').then(m => ({ default: m.ReconciliationView })));

const DREView = lazyWithRetry(() => import('./components/Management/DREView').then(m => ({ default: m.DREView })));
const CashFlowView = lazyWithRetry(() => import('./components/Management/CashFlowView').then(m => ({ default: m.CashFlowView })));
const BudgetPlanningView = lazyWithRetry(() => import('./components/Management/BudgetPlanningView').then(m => ({ default: m.BudgetPlanningView })));
const CompareDRECashView = lazyWithRetry(() => import('./components/Management/CompareDRECashView').then(m => ({ default: m.CompareDRECashView })));
const ReportsView = lazyWithRetry(() => import('./components/Management/ReportsView').then(m => ({ default: m.ReportsView })));
const SettingsHubView = lazyWithRetry(() => import('./components/Config/SettingsHubView').then(m => ({ default: m.SettingsHubView })));
import type { ConfigSubTab } from './components/Config/SettingsHubView';

import { Menu, Minimize2 } from 'lucide-react';
import { useToast, ToastProvider } from './hooks/useToast';
import { ToastContainer } from './components/Common/Toast';
import { FloatingCalculator } from './components/Common/FloatingCalculator';
import { LoginView } from './components/Auth/LoginView';

const ScreenLoadingFallback: React.FC = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[350px]">
    <div className="w-8 h-8 border-2 border-[var(--border-highlight)] border-t-[var(--brand-gold-fill)] rounded-full animate-spin mb-4" />
    <span className="text-sm text-[var(--text-muted)]">Carregando...</span>
  </div>
);

function AppContent() {
  const { toasts, dismissToast, showSuccess, showError, showInfo } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => storage.isAuthenticated());
  const [currentScreen, setCurrentScreen] = useState<NavigationScreen>('DASHBOARD');
  const [isPendingScreen, startScreenTransition] = useTransition();
  const [dataVersion, setDataVersion] = useState(0);
  const [currentUser, setCurrentUser] = useState<User>(() => storage.getCurrentUser());
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Navegação ultra-rápida instantânea (0ms latency)
  const handleNavigate = (screen: NavigationScreen) => {
    setCurrentScreen(screen);
  };

  // Badges de pendências para navegação mobile - depende exclusivamente de atualizações nos dados, NUNCA da troca de tela
  const { overduePayablesCount, overdueReceivablesCount } = useMemo(() => {
    const titles = storage.getTitles();
    const todayStr = new Date().toISOString().split('T')[0];
    return {
      overduePayablesCount: titles.filter(t => t.type === 'PAGAR' && t.balancePrincipal > 0 && t.dueDate < todayStr).length,
      overdueReceivablesCount: titles.filter(t => t.type === 'RECEBER' && t.balancePrincipal > 0 && t.dueDate < todayStr).length
    };
  }, [dataVersion]);

  // Sair do Modo Foco ao pressionar a tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) {
        setIsFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode]);

  // Initialize theme, sync & background prefetch on root
  useEffect(() => {
    const currentTheme = storage.getTheme();
    document.documentElement.classList.toggle('light', currentTheme === 'light');
    document.documentElement.classList.toggle('dark', currentTheme === 'dark');

    // Sincronização inteligente com nuvem (Supabase) em segundo plano
    storage.ensureCloudSync();

    // Inicialização da rotina automática semanal de exportação de backups por e-mail
    import('./services/automaticBackupService').then(({ automaticBackupService }) => {
      automaticBackupService.initScheduler();
    }).catch(() => {});

    // Pré-carregamento (Pre-warming) em segundo plano dos módulos mais acessados quando o navegador estiver ocioso
    const prewarmModules = () => {
      import('./components/Financial/PayablesView');
      import('./components/Financial/ReceivablesView');
      import('./components/Financial/CreditCardsView');
      import('./components/Financial/MovementsView');
      import('./components/Financial/BankAccountsView');
      import('./components/Commercial/ContractsView');
      import('./components/Commercial/ClientsView');
      import('./components/Management/DREView');
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(prewarmModules, { timeout: 1500 });
    } else {
      setTimeout(prewarmModules, 800);
    }

    const unsubscribe = storage.subscribe(() => {
      const updatedTheme = storage.getTheme();
      document.documentElement.classList.toggle('light', updatedTheme === 'light');
      document.documentElement.classList.toggle('dark', updatedTheme === 'dark');
      setCurrentUser(storage.getCurrentUser());
      setIsAuthenticated(storage.isAuthenticated());
      setDataVersion(v => v + 1);
    });
    return unsubscribe;
  }, []);

  // Global transactional modals
  const [isNewTitleModalOpen, setIsNewTitleModalOpen] = useState(false);
  const [newTitleType, setNewTitleType] = useState<'RECEBER' | 'PAGAR'>('RECEBER');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);

  // Floating Calculator State (persistente - inicia ativa como numerozinho flutuante)
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('contaju_calc_open');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [isCalculatorMinimized, setIsCalculatorMinimized] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('contaju_calc_minimized');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('contaju_calc_open', JSON.stringify(isCalculatorOpen));
    } catch {
      // ignore
    }
  }, [isCalculatorOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('contaju_calc_minimized', JSON.stringify(isCalculatorMinimized));
    } catch {
      // ignore
    }
  }, [isCalculatorMinimized]);

  // Global Keyboard Shortcut Alt+C para Calculadora
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setIsCalculatorOpen(prev => {
          if (!prev) {
            setIsCalculatorMinimized(false);
            return true;
          }
          setIsCalculatorMinimized(min => !min);
          return true;
        });
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleToggleCalculator = () => {
    if (!isCalculatorOpen) {
      setIsCalculatorOpen(true);
      setIsCalculatorMinimized(false);
    } else if (isCalculatorMinimized) {
      setIsCalculatorMinimized(false);
    } else {
      setIsCalculatorMinimized(true);
    }
  };

  // Global search navigation filter
  const [globalSearchFilter, setGlobalSearchFilter] = useState<{
    screen: NavigationScreen;
    term: string;
    timestamp: number;
  } | null>(null);

  const handleNavigateWithSearch = (screen: NavigationScreen, searchFilter: string) => {
    setGlobalSearchFilter({ screen, term: searchFilter, timestamp: Date.now() });
    handleNavigate(screen);
  };


  const handleOpenNewTitleModal = (type: 'RECEBER' | 'PAGAR') => {
    setNewTitleType(type);
    setIsNewTitleModalOpen(true);
  };

  const currentSearchTerm = globalSearchFilter?.screen === currentScreen ? globalSearchFilter.term : undefined;

  const renderActiveScreen = () => {
    switch (currentScreen) {
      case 'DASHBOARD': {
        const PainelEscolhido = new URLSearchParams(window.location.search).get('painel') === 'antes' ? DashboardViewAntes : DashboardView;
        return (
          <PainelEscolhido
            onNavigate={handleNavigate}
            onOpenNewTitleModal={handleOpenNewTitleModal}
            onOpenBillingModal={() => setIsBillingModalOpen(true)}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
          />
        );
      }
      
      // Commercial
      case 'CLIENTES':
        return <ClientsView initialSearch={currentSearchTerm} />;
      case 'SERVICOS':
        return <ServicesView initialSearch={currentSearchTerm} />;
      case 'CONTRATOS':
        return (
          <ContractsView 
            onOpenBillingModal={() => setIsBillingModalOpen(true)} 
            initialSearch={currentSearchTerm}
          />
        );
      case 'VENDAS_FATURAMENTO':
        return (
          <SalesView 
            onOpenBillingModal={() => setIsBillingModalOpen(true)} 
            initialSearch={currentSearchTerm}
            onNavigate={(screen) => handleNavigate(screen as any)}
          />
        );

      // Financial
      case 'CONTAS_RECEBER':
        return (
          <ReceivablesView 
            onOpenNewTitleModal={handleOpenNewTitleModal} 
            initialSearch={currentSearchTerm}
          />
        );
      case 'CONTAS_PAGAR':
        return (
          <PayablesView 
            onOpenNewTitleModal={handleOpenNewTitleModal} 
            initialSearch={currentSearchTerm}
          />
        );
      case 'CARTAO_CREDITO':
        return <CreditCardsView onNavigateToPayables={() => handleNavigate('CONTAS_PAGAR')} />;
      case 'MOVIMENTACOES':
        return <MovementsView initialSearch={currentSearchTerm} />;
      case 'BANCOS_CONTAS':
        return <BankAccountsView onOpenTransferModal={() => setIsTransferModalOpen(true)} />;
      case 'CONCILIACAO':
        return <ReconciliationView />;

      // Management & Reports
      case 'DRE':
        return <DREView isFocusMode={isFocusMode} onToggleFocusMode={() => setIsFocusMode(prev => !prev)} onNavigate={handleNavigate} />;
      case 'FLUXO_CAIXA':
        return <CashFlowView isFocusMode={isFocusMode} onToggleFocusMode={() => setIsFocusMode(prev => !prev)} />;
      case 'PLANEJAMENTO_ORCAMENTARIO':
        return <BudgetPlanningView />;
      case 'COMPARE_DRE_CAIXA':
        return <CompareDRECashView />;
      case 'RELATORIOS':
        return <ReportsView />;

      // Consolidated Configuration Hub & AI Center
      case 'CONSULTORIA':
        return <ConsultoriaView />;
      case 'IA':
        return (
          <SettingsHubView
            initialTab="IA"
            onNavigateToScreen={handleNavigate}
            onOpenBillingModal={() => setIsBillingModalOpen(true)}
          />
        );

      case 'CONFIGURACOES':
      case 'EMPRESA':
      case 'FORNECEDORES':
      case 'PLANO_CONTAS':
      case 'RECORRENCIAS':
      case 'USUARIOS_PERMISSOES':
      case 'FECHAMENTO_PERIODO':
      case 'MODULOS_INTEGRACOES':
      case 'NOTIFICACOES':
      case 'MELHORIAS':
      case 'AUDITORIA':
      case 'BACKUP':
        return (
          <SettingsHubView
            initialTab={currentScreen === 'CONFIGURACOES' ? 'EMPRESA' : (currentScreen as ConfigSubTab)}
            onNavigateToScreen={handleNavigate}
            onOpenBillingModal={() => setIsBillingModalOpen(true)}
          />
        );

      default:
        return (
          <DashboardView
            onNavigate={handleNavigate}
            onOpenNewTitleModal={handleOpenNewTitleModal}
            onOpenBillingModal={() => setIsBillingModalOpen(true)}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
          />
        );
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-[var(--surface-canvas)] font-sans antialiased text-[var(--text-primary)]">
        <LoginView
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            setIsAuthenticated(true);
            showSuccess('Acesso Liberado', `Bem-vindo(a), ${user.name}!`);
            // Garante hidratação completa imediata de todos os dados do banco Supabase
            storage.initializeDatabaseFirst().then(() => {
              setDataVersion(v => v + 1);
            });
          }}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full max-w-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-x-hidden overflow-y-hidden font-sans antialiased transition-colors relative">
      
      {/* Floating Focus Mode Banner */}
      {isFocusMode && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-[var(--surface-card)]/95 backdrop-blur-md border border-[var(--border-subtle)] shadow-lg pl-4 pr-1.5 py-1.5 rounded-full">
          <span className="text-sm text-[var(--text-secondary)]">Modo foco</span>
          <button
            onClick={() => setIsFocusMode(false)}
            className="px-3 h-8 rounded-full bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Pressione Esc para sair do modo foco"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      )}

      {/* Sidebar for Desktop and Mobile (hidden in Focus Mode) */}
      {!isFocusMode && (
        <Sidebar
          currentScreen={currentScreen}
          onNavigate={(screen) => {
            handleNavigate(screen);
            setIsMobileSidebarOpen(false);
          }}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          onLogout={() => {
            setIsAuthenticated(false);
            showInfo('Sessão Encerrada', 'Você saiu com segurança.');
          }}
        />
      )}

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 max-w-full relative">
        {/* Indicador de Transição Suave entre Telas (não-intrusivo) */}
        {isPendingScreen && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--brand-gold-fill)] animate-pulse z-50" />
        )}
        
        {/* Global Header Responsivo (hidden in Focus Mode) */}
        {!isFocusMode && (
          <Header
            currentUser={currentUser}
            currentScreen={currentScreen}
            onOpenNewTitleModal={handleOpenNewTitleModal}
            onOpenTransferModal={() => setIsTransferModalOpen(true)}
            onOpenBillingModal={() => setIsBillingModalOpen(true)}
            onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
            onNavigate={handleNavigate}
            onNavigateWithSearch={handleNavigateWithSearch}
            onToggleCalculator={handleToggleCalculator}
            isCalculatorOpen={isCalculatorOpen}
            isCalculatorMinimized={isCalculatorMinimized}
            onLogout={() => {
              setIsAuthenticated(false);
              showInfo('Sessão Encerrada', 'Você saiu com segurança.');
            }}
          />
        )}

        {/* Main Dynamic View Scroll Area - Full Screen Width Responsivo */}
        <main className={`flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg-app)] text-[var(--text-primary)] w-full max-w-full min-w-0 ${
          isFocusMode ? 'p-3 sm:p-6' : 'px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 pb-24 lg:pb-10'
        }`}>
          <div className="w-full max-w-[1600px] mx-auto min-w-0 space-y-6">
            {isConsultant() && (getOrgs().find(o => o.id === getActiveOrgId())?.role === 'CONSULTOR') && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--gold-edge)] bg-[var(--brand-gold-soft)] px-4 py-3 text-sm">
                <span>Você está vendo a empresa <strong>{getOrgs().find(o => o.id === getActiveOrgId())?.name}</strong> como consultor.</span>
                <button type="button" onClick={() => { const own = getOrgs().find(o => o.role !== 'CONSULTOR'); if (own) switchOrg(own.id); else handleNavigate('CONSULTORIA'); }} className="font-semibold text-[var(--brand-gold)] underline underline-offset-2">Voltar para a minha empresa</button>
              </div>
            )}
            <AppErrorBoundary fallbackTitle="Falha na exibição desta tela">
              <Suspense fallback={<ScreenLoadingFallback />}>
                {renderActiveScreen()}
              </Suspense>
            </AppErrorBoundary>
          </div>
        </main>
      </div>

      {/* Transactional Modals */}
      {isNewTitleModalOpen && (
        <NewTitleModal
          key={`new-title-${newTitleType}`}
          isOpen={isNewTitleModalOpen}
          defaultType={newTitleType}
          onClose={() => setIsNewTitleModalOpen(false)}
          onSaved={(details) => {
            setIsNewTitleModalOpen(false);
            const tipoLabel = (details?.type || newTitleType) === 'RECEBER' ? 'Título a receber' : 'Título a pagar';
            const countLabel = details?.count && details.count > 1 ? ` (${details.count} lançamentos/parcelas)` : '';
            const descLabel = details?.description ? `: "${details.description}"` : '';
            showSuccess(
              `${tipoLabel}${countLabel}${descLabel} salvo com sucesso no sistema!`,
              'Lançamento Concluído'
            );
            // force re-render
            setCurrentScreen(prev => prev);
          }}
          onCreated={() => {
            setIsNewTitleModalOpen(false);
            setCurrentScreen(prev => prev);
          }}
          onError={(err) => {
            showError(err, 'Erro ao Salvar Título');
          }}
        />
      )}

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onTransferred={() => {
          setIsTransferModalOpen(false);
          showSuccess('Transferência entre contas bancárias registrada com sucesso!', 'Transferência Efetuada');
          setCurrentScreen(prev => prev);
        }}
        onCompleted={() => {
          setIsTransferModalOpen(false);
          showSuccess('Transferência entre contas bancárias registrada com sucesso!', 'Transferência Efetuada');
          setCurrentScreen(prev => prev);
        }}
        onError={(err) => {
          showError(err, 'Falha na Transferência');
        }}
      />

      <BillingGenerationModal
        isOpen={isBillingModalOpen}
        onClose={() => setIsBillingModalOpen(false)}
        onGenerated={(res) => {
          setIsBillingModalOpen(false);
          if (res && res.generatedCount > 0) {
            showSuccess(
              `${res.generatedCount} título(s) gerados para a competência selecionada!`,
              'Faturamento Concluído'
            );
          } else if (res && res.alreadyExistingCount > 0) {
            showInfo(
              `Todos os contratos ativos já foram faturados anteriormente para este período (${res.alreadyExistingCount} títulos existentes).`,
              'Faturamento em Dia'
            );
          } else {
            showSuccess('Geração de faturamento concluída com sucesso!', 'Faturamento Concluído');
          }
          setCurrentScreen(prev => prev);
        }}
      />

      {/* Sistema Global de Notificações (Toast) */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Calculadora Flutuante e Minimizável do Sistema */}
      <FloatingCalculator
        isOpen={isCalculatorOpen}
        isMinimized={isCalculatorMinimized}
        onOpen={() => {
          setIsCalculatorOpen(true);
          setIsCalculatorMinimized(false);
        }}
        onMinimize={() => setIsCalculatorMinimized(true)}
        onClose={() => setIsCalculatorOpen(false)}
      />

      {/* Barra de Navegação Inferior Mobile */}
      {!isFocusMode && (
        <BottomNavBar
          currentScreen={currentScreen}
          onNavigate={handleNavigate}
          onOpenDrawer={() => setIsMobileSidebarOpen(true)}
          overduePayablesCount={overduePayablesCount}
          overdueReceivablesCount={overdueReceivablesCount}
        />
      )}

    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

