import React from 'react';
import {
  LayoutDashboard,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Menu
} from 'lucide-react';
import { NavigationScreen } from '../Sidebar';

export interface BottomNavBarProps {
  currentScreen: NavigationScreen;
  onNavigate: (screen: NavigationScreen) => void;
  onOpenDrawer: () => void;
  overduePayablesCount?: number;
  overdueReceivablesCount?: number;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  currentScreen,
  onNavigate,
  onOpenDrawer,
  overduePayablesCount = 0,
  overdueReceivablesCount = 0,
}) => {
  const isDreActive = currentScreen === 'DRE' || currentScreen === 'FLUXO_CAIXA' || currentScreen === 'RELATORIOS';
  const isOtherActive = ![
    'DASHBOARD', 'CONTAS_PAGAR', 'CONTAS_RECEBER', 'DRE', 'FLUXO_CAIXA', 'RELATORIOS'
  ].includes(currentScreen);

  const navItems = [
    { id: 'DASHBOARD' as NavigationScreen, label: 'Início', icon: LayoutDashboard, isActive: currentScreen === 'DASHBOARD' },
    { id: 'CONTAS_PAGAR' as NavigationScreen, label: 'Pagar', icon: TrendingDown, isActive: currentScreen === 'CONTAS_PAGAR', badge: overduePayablesCount || undefined },
    { id: 'CONTAS_RECEBER' as NavigationScreen, label: 'Receber', icon: TrendingUp, isActive: currentScreen === 'CONTAS_RECEBER', badge: overdueReceivablesCount || undefined },
    { id: 'DRE' as NavigationScreen, label: 'DRE', icon: BarChart3, isActive: isDreActive }
  ];

  const itemClass = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] rounded-xl transition-colors cursor-pointer relative active:scale-95 ${
      active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
    }`;

  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[var(--surface-card)]/95 backdrop-blur-md border-t border-[var(--border-subtle)] pb-[env(safe-area-inset-bottom)] select-none"
    >
      <div className="flex items-center justify-around h-[64px] px-2 max-w-md mx-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={itemClass(item.isActive)}
              aria-label={item.label}
              aria-current={item.isActive ? 'page' : undefined}
            >
              <span className="relative">
                <Icon className={`w-[22px] h-[22px] ${item.isActive ? 'text-[var(--brand-gold)]' : ''}`} strokeWidth={item.isActive ? 2 : 1.75} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-xs font-medium flex items-center justify-center ring-2 ring-[var(--surface-card)]">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              <span className={`text-xs ${item.isActive ? 'font-medium' : ''}`}>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenDrawer}
          className={itemClass(isOtherActive)}
          aria-label="Abrir menu completo"
        >
          <Menu className={`w-[22px] h-[22px] ${isOtherActive ? 'text-[var(--brand-gold)]' : ''}`} strokeWidth={isOtherActive ? 2 : 1.75} />
          <span className={`text-xs ${isOtherActive ? 'font-medium' : ''}`}>Menu</span>
        </button>
      </div>
    </nav>
  );
};
