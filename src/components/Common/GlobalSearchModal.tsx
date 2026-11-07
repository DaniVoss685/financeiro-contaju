import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Users,
  FileText,
  Briefcase,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
  Receipt,
  CornerDownLeft,
  ArrowUpDown,
  Sparkles,
  Building2,
  Calendar,
  Layers,
  Tag
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR, formatCompetence } from '../../services/financialEngine';
import { matchesSearch } from '../../utils/searchUtils';
import { NavigationScreen } from '../Sidebar';

export type SearchCategoryFilter = 
  | 'ALL'
  | 'CLIENTES'
  | 'CONTRATOS'
  | 'SERVICOS'
  | 'RECEBER'
  | 'PAGAR'
  | 'MOVIMENTACOES'
  | 'VENDAS';

export interface GlobalSearchResult {
  id: string;
  category: 'CLIENTE' | 'CONTRATO' | 'SERVICO' | 'RECEBER' | 'PAGAR' | 'MOVIMENTACAO' | 'VENDA';
  categoryLabel: string;
  targetScreen: NavigationScreen;
  filterValue: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  amount?: number;
  date?: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToItem: (screen: NavigationScreen, searchFilter: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigateToItem
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategoryFilter>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategory('ALL');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Read data from storage
  const counterparties = useMemo(() => storage.getCounterparties(), [isOpen]);
  const contracts = useMemo(() => storage.getContracts(), [isOpen]);
  const services = useMemo(() => storage.getServices(), [isOpen]);
  const titles = useMemo(() => storage.getTitles(), [isOpen]);
  const movements = useMemo(() => storage.getMovements(), [isOpen]);
  const sales = useMemo(() => storage.getSales(), [isOpen]);

  // Compute all matching results
  const allResults = useMemo(() => {
    if (!isOpen) return [];

    const results: GlobalSearchResult[] = [];
    const trimmedQuery = query.trim();

    // Helper map of counterparty id -> name
    const cpMap = new Map<string, string>();
    counterparties.forEach(c => cpMap.set(c.id, c.name));

    // 1. CLIENTES & FORNECEDORES
    counterparties.forEach(c => {
      const isClient = c.type === 'CLIENTE' || c.type === 'AMBOS';
      const isSupplier = c.type === 'FORNECEDOR' || c.type === 'AMBOS';

      const matches = matchesSearch(
        [c.name, c.tradeName, c.document, c.email, c.phone, c.address, c.city],
        trimmedQuery
      );

      if (matches) {
        if (isClient) {
          results.push({
            id: `cp-cli-${c.id}`,
            category: 'CLIENTE',
            categoryLabel: 'Cliente',
            targetScreen: 'CLIENTES',
            filterValue: c.name,
            title: c.name,
            subtitle: `${c.tradeName ? `${c.tradeName} • ` : ''}${c.document || 'Sem documento'}${c.city ? ` • ${c.city}` : ''}`,
            badge: c.status === 'ATIVO' ? 'Ativo' : 'Inativo',
            badgeColor: c.status === 'ATIVO' ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
            icon: Users
          });
        }
      }
    });

    // 2. CONTRATOS
    contracts.forEach(ctr => {
      const clientName = cpMap.get(ctr.customerId) || 'Cliente';
      const matches = matchesSearch(
        [ctr.contractNumber, clientName, ctr.notes, ctr.status, String(ctr.monthlyTotal)],
        trimmedQuery
      );

      if (matches) {
        results.push({
          id: `ctr-${ctr.id}`,
          category: 'CONTRATO',
          categoryLabel: 'Contrato',
          targetScreen: 'CONTRATOS',
          filterValue: ctr.contractNumber,
          title: `${ctr.contractNumber} - ${clientName}`,
          subtitle: `Mensalidade: ${formatBRL(ctr.monthlyTotal)} • Venc. Dia ${ctr.dueDay}`,
          badge: ctr.status,
          badgeColor: ctr.status === 'ATIVO' ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
          amount: ctr.monthlyTotal,
          icon: FileText
        });
      }
    });

    // 3. SERVIÇOS
    services.forEach(srv => {
      const matches = matchesSearch(
        [srv.name, srv.code, srv.description, srv.category, String(srv.defaultPrice)],
        trimmedQuery
      );

      if (matches) {
        results.push({
          id: `srv-${srv.id}`,
          category: 'SERVICO',
          categoryLabel: 'Serviço',
          targetScreen: 'SERVICOS',
          filterValue: srv.name,
          title: srv.name,
          subtitle: `${srv.code ? `Código: ${srv.code} • ` : ''}${srv.category || 'Geral'}`,
          badge: formatBRL(srv.defaultPrice),
          badgeColor: 'bg-amber-500/15 text-amber-900 dark:text-amber-300 font-mono font-bold',
          amount: srv.defaultPrice,
          icon: Briefcase
        });
      }
    });

    // 4. TÍTULOS FINANCEIROS (A RECEBER E A PAGAR)
    titles.forEach(t => {
      const cpName = cpMap.get(t.counterpartyId) || (t.type === 'RECEBER' ? 'Cliente' : 'Fornecedor');
      const matches = matchesSearch(
        [t.titleNumber, t.description, cpName, t.competence, t.dueDate, String(t.originalAmount), t.notes],
        trimmedQuery
      );

      if (matches) {
        const isReceivable = t.type === 'RECEBER';
        results.push({
          id: `tit-${t.id}`,
          category: isReceivable ? 'RECEBER' : 'PAGAR',
          categoryLabel: isReceivable ? 'A Receber' : 'A Pagar',
          targetScreen: isReceivable ? 'CONTAS_RECEBER' : 'CONTAS_PAGAR',
          filterValue: t.titleNumber,
          title: `${t.titleNumber} - ${cpName}`,
          subtitle: `${t.description} • Venc. ${formatDateBR(t.dueDate)} • Comp. ${formatCompetence(t.competence)}`,
          badge: `${formatBRL(t.originalAmount)} • ${t.settlementState}`,
          badgeColor: t.settlementState === 'LIQUIDADO' 
            ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' 
            : isReceivable 
            ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300' 
            : 'bg-rose-500/15 text-rose-800 dark:text-rose-300',
          amount: t.originalAmount,
          date: t.dueDate,
          icon: isReceivable ? TrendingUp : TrendingDown
        });
      }
    });

    // 5. VENDAS & FATURAMENTO
    sales.forEach(s => {
      const clientName = cpMap.get(s.customerId) || 'Cliente';
      const matches = matchesSearch(
        [s.saleNumber, clientName, s.competence, s.notes, s.items?.[0]?.description, String(s.netTotal || s.grossTotal)],
        trimmedQuery
      );

      if (matches) {
        results.push({
          id: `sale-${s.id}`,
          category: 'VENDA',
          categoryLabel: 'Venda',
          targetScreen: 'VENDAS_FATURAMENTO',
          filterValue: s.saleNumber,
          title: `${s.saleNumber} - ${clientName}`,
          subtitle: `Comp. ${formatCompetence(s.competence)} • ${s.items?.[0]?.description || 'Prestação de Serviços'}`,
          badge: formatBRL(s.netTotal || s.grossTotal),
          badgeColor: 'bg-amber-500/15 text-amber-900 dark:text-amber-300 font-mono font-bold',
          amount: s.netTotal || s.grossTotal,
          icon: Receipt
        });
      }
    });

    // 6. MOVIMENTAÇÕES BANCÁRIAS
    movements.forEach(m => {
      const matches = matchesSearch(
        [m.description, m.type, m.category, String(m.amount), m.date],
        trimmedQuery
      );

      if (matches) {
        results.push({
          id: `mov-${m.id}`,
          category: 'MOVIMENTACAO',
          categoryLabel: 'Movimentação',
          targetScreen: 'MOVIMENTACOES',
          filterValue: m.description,
          title: m.description,
          subtitle: `Data: ${formatDateBR(m.date)} • ${m.type === 'ENTRADA' ? 'Entrada (+) Crédito' : 'Saída (-) Débito'}`,
          badge: `${m.type === 'ENTRADA' ? '+' : '-'}${formatBRL(m.amount)}`,
          badgeColor: m.type === 'ENTRADA' ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' : 'bg-rose-500/15 text-rose-800 dark:text-rose-300',
          amount: m.amount,
          date: m.date,
          icon: ArrowLeftRight
        });
      }
    });

    return results;
  }, [isOpen, query, counterparties, contracts, services, titles, movements, sales]);

  // Filter by category tab
  const filteredResults = useMemo(() => {
    if (activeCategory === 'ALL') return allResults;
    if (activeCategory === 'CLIENTES') return allResults.filter(r => r.category === 'CLIENTE');
    if (activeCategory === 'CONTRATOS') return allResults.filter(r => r.category === 'CONTRATO');
    if (activeCategory === 'SERVICOS') return allResults.filter(r => r.category === 'SERVICO');
    if (activeCategory === 'RECEBER') return allResults.filter(r => r.category === 'RECEBER');
    if (activeCategory === 'PAGAR') return allResults.filter(r => r.category === 'PAGAR');
    if (activeCategory === 'MOVIMENTACOES') return allResults.filter(r => r.category === 'MOVIMENTACAO');
    if (activeCategory === 'VENDAS') return allResults.filter(r => r.category === 'VENDA');
    return allResults;
  }, [allResults, activeCategory]);

  // Clamp selection index
  useEffect(() => {
    setSelectedIndex(0);
  }, [activeCategory, query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredResults.length - 1 ? prev + 1 : 0));
      scrollSelectedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredResults.length - 1));
      scrollSelectedIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelectItem(filteredResults[selectedIndex]);
      }
    }
  };

  const scrollSelectedIntoView = () => {
    setTimeout(() => {
      const activeEl = resultsContainerRef.current?.querySelector('[data-selected="true"]');
      activeEl?.scrollIntoView({ block: 'nearest' });
    }, 10);
  };

  const handleSelectItem = (item: GlobalSearchResult) => {
    onNavigateToItem(item.targetScreen, item.filterValue);
    onClose();
  };

  if (!isOpen) return null;

  // Counts for category tabs
  const categoryCounts = {
    ALL: allResults.length,
    CLIENTES: allResults.filter(r => r.category === 'CLIENTE').length,
    CONTRATOS: allResults.filter(r => r.category === 'CONTRATO').length,
    SERVICOS: allResults.filter(r => r.category === 'SERVICO').length,
    RECEBER: allResults.filter(r => r.category === 'RECEBER').length,
    PAGAR: allResults.filter(r => r.category === 'PAGAR').length,
    MOVIMENTACOES: allResults.filter(r => r.category === 'MOVIMENTACAO').length,
    VENDAS: allResults.filter(r => r.category === 'VENDA').length
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 sm:pt-16 bg-[var(--surface-elevated)]/70 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="bg-[var(--surface-card)] rounded-2xl shadow-2xl border border-[var(--border-subtle)] w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Bar Input */}
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Search className="w-5 h-5" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por clientes, contratos, faturas, serviços ou movimentações..."
            className="flex-1 bg-transparent text-sm sm:text-base font-semibold text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none"
          />

          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors cursor-pointer"
              title="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--text-secondary)] px-2 py-1 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)]">
            <span>ESC</span>
            <span className="text-[10px] font-normal">fechar</span>
          </div>
        </div>

        {/* Category Filters Bar */}
        <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] overflow-x-auto scrollbar-thin">
          <div className="flex items-center gap-1.5 min-w-max text-xs">
            <button
              onClick={() => setActiveCategory('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeCategory === 'ALL'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
              }`}
            >
              <span>Todos</span>
              <span className="text-[10px] opacity-80">({categoryCounts.ALL})</span>
            </button>

            {categoryCounts.CLIENTES > 0 && (
              <button
                onClick={() => setActiveCategory('CLIENTES')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === 'CLIENTES'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Clientes ({categoryCounts.CLIENTES})</span>
              </button>
            )}

            {categoryCounts.CONTRATOS > 0 && (
              <button
                onClick={() => setActiveCategory('CONTRATOS')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === 'CONTRATOS'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <FileText className="w-3 h-3" />
                <span>Contratos ({categoryCounts.CONTRATOS})</span>
              </button>
            )}

            {categoryCounts.RECEBER > 0 && (
              <button
                onClick={() => setActiveCategory('RECEBER')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === 'RECEBER'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                <span>A Receber ({categoryCounts.RECEBER})</span>
              </button>
            )}

            {categoryCounts.PAGAR > 0 && (
              <button
                onClick={() => setActiveCategory('PAGAR')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === 'PAGAR'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <TrendingDown className="w-3 h-3" />
                <span>A Pagar ({categoryCounts.PAGAR})</span>
              </button>
            )}

            {categoryCounts.SERVICOS > 0 && (
              <button
                onClick={() => setActiveCategory('SERVICOS')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === 'SERVICOS'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <Briefcase className="w-3 h-3" />
                <span>Serviços ({categoryCounts.SERVICOS})</span>
              </button>
            )}

            {categoryCounts.VENDAS > 0 && (
              <button
                onClick={() => setActiveCategory('VENDAS')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === 'VENDAS'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <Receipt className="w-3 h-3" />
                <span>Vendas ({categoryCounts.VENDAS})</span>
              </button>
            )}

            {categoryCounts.MOVIMENTACOES > 0 && (
              <button
                onClick={() => setActiveCategory('MOVIMENTACOES')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeCategory === 'MOVIMENTACOES'
                    ? 'bg-[var(--surface-card)] text-[var(--text-primary)] dark:bg-white dark:text-slate-900 shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>Movimentações ({categoryCounts.MOVIMENTACOES})</span>
              </button>
            )}
          </div>
        </div>

        {/* Results List */}
        <div 
          ref={resultsContainerRef}
          className="flex-1 overflow-y-auto p-2 sm:p-3 space-y-1.5 min-h-[220px] max-h-[500px]"
        >
          {filteredResults.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-center mx-auto text-[var(--text-secondary)] mb-3">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Nenhum resultado encontrado
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                Não localizamos itens para <strong className="text-[var(--text-primary)]">"{query}"</strong>. Tente pesquisar por nome do cliente, número do contrato, título financeiro ou serviço.
              </p>
            </div>
          ) : (
            filteredResults.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;

              return (
                <div
                  key={item.id}
                  data-selected={isSelected}
                  onClick={() => handleSelectItem(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-xs'
                      : 'bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      item.category === 'CLIENTE'
                        ? 'bg-slate-500/15 text-slate-800 dark:text-slate-200'
                        : item.category === 'CONTRATO'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : item.category === 'SERVICO'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : item.category === 'RECEBER'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : item.category === 'PAGAR'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : item.category === 'VENDA'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'bg-slate-500/15 text-slate-600 dark:text-slate-400'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)] text-sm truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-md bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] shrink-0">
                          {item.categoryLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {item.badge && (
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold border ${item.badgeColor || 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border-[var(--border-subtle)]'}`}>
                        {item.badge}
                      </span>
                    )}
                    <div className={`p-1 rounded-md text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? 'opacity-100 text-amber-500' : ''}`}>
                      <CornerDownLeft className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with tips */}
        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] font-mono text-[10px] font-bold">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] font-mono text-[10px] font-bold">↓</kbd>
              <span>Navegar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] font-mono text-[10px] font-bold">↵</kbd>
              <span>Acessar</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] font-mono text-[10px] font-bold">ESC</kbd>
              <span>Fechar</span>
            </span>
          </div>

          <span className="font-medium text-[var(--text-secondary)] hidden sm:inline">
            Navega e filtra diretamente na tela correspondente
          </span>
        </div>
      </div>
    </div>
  );
};
