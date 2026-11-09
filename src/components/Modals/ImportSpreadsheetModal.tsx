import React, { useState, useMemo, useRef, useEffect, Component } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Settings2, 
  RefreshCw, 
  SlidersHorizontal, 
  Building2, 
  Calendar, 
  X,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Eye,
  GitCompare,
  UserCheck,
  Info,
  Plus,
  Edit3,
  Columns,
  GitMerge,
  Filter,
  Layers,
  Sparkles,
  Brain,
  Zap,
  CheckCheck,
  Maximize2,
  Minimize2,
  Search,
  BookmarkCheck,
  History,
  RotateCcw,
  Package
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { storage } from '../../services/storageService';
import { categoryLearningService } from '../../services/categoryLearningService';
import { matchesSearch } from '../../utils/searchUtils';
import { importAuditService, ImportAuditLog } from '../../services/importAuditService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { 
  FinancialTitle, 
  TitleType, 
  Settlement, 
  FinancialMovement, 
  Counterparty,
  ChartAccount,
  BankAccount
} from '../../types';
import {
  analyzeContaAzulSpreadsheet,
  downloadBaseSpreadsheetTemplate,
  downloadContaAzulSampleTemplate,
  detectColumnMatch,
  calculateMonthlySummaries,
  CONTA_AZUL_COLUMN_PATTERNS,
  AnalyzedImportRow,
  BaseSpreadsheetRow,
  ExtraColumnDefinition,
  TypeDetectionMode,
  ImportDiffAction,
  MonthSummary,
  generateTitleFingerprint,
  getRowMonthKey,
  normalizeText,
  normalizeToCompetence,
  normalizeToISODate
} from '../../services/contaAzulMappingEngine';
import { ImportMonthlySummaryBar } from './ImportMonthlySummaryBar';
import { ImportExtraColumnModal } from './ImportExtraColumnModal';
import { ImportEditRowModal } from './ImportEditRowModal';
import { ImportCrossReferenceModal } from './ImportCrossReferenceModal';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface ImportSpreadsheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onImportCompleted?: () => void;
  defaultType?: TitleType;
}

interface ColumnMapping {
  tipo: string;
  titulo: string;
  fornecedor: string;
  documento?: string;
  descricao: string;
  competencia: string;
  emissao: string;
  vencimento: string;
  dataPagamento: string;
  previsaoCaixa: string;
  valorOriginal: string;
  principalBaixado: string;
  saldoAtual: string;
  situacao: string;
  categoria: string;
  banco: string;
  centroCusto: string;
}

const SAVED_MAPPING_STORAGE_KEY = 'contaju_saved_import_mapping_template';

interface SavedMappingTemplate {
  name: string;
  updatedAt: string;
  mapping: ColumnMapping;
  headersSignature?: string;
  extraColumns?: ExtraColumnDefinition[];
}

function saveMappingTemplate(mapping: ColumnMapping, headers?: string[], extraCols?: ExtraColumnDefinition[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const template: SavedMappingTemplate = {
      name: 'Modelo de Colunas Padrão ContaJu',
      updatedAt: new Date().toISOString(),
      mapping,
      headersSignature: headers && headers.length > 0 ? headers.slice().sort().join('|') : undefined,
      extraColumns: extraCols
    };
    localStorage.setItem(SAVED_MAPPING_STORAGE_KEY, JSON.stringify(template));
  } catch (e) {
    console.warn('Falha ao salvar template de mapeamento:', e);
  }
}

function getSavedMappingTemplate(): SavedMappingTemplate | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVED_MAPPING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const SAVED_PROFILES_STORAGE_KEY = 'contaju_saved_custom_mapping_profiles_v1';

export interface CustomMappingProfile {
  id: string;
  name: string; // Ex: "Extrato Banco Inter", "Relatório Conta Azul Vendas", "Planilha Folha de Pagamento"
  createdAt: string;
  updatedAt: string;
  mapping: ColumnMapping;
  headersSignature?: string;
  extraColumns?: ExtraColumnDefinition[];
  fallbackExpenseAccountId?: string;
  fallbackRevenueAccountId?: string;
  typeDetectionMode?: TypeDetectionMode;
  defaultType?: TitleType;
}

export function getCustomMappingProfiles(): CustomMappingProfile[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SAVED_PROFILES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomMappingProfile(profile: Omit<CustomMappingProfile, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): CustomMappingProfile {
  const existing = getCustomMappingProfiles();
  const nowIso = new Date().toISOString();
  let savedItem: CustomMappingProfile;

  if (profile.id) {
    const idx = existing.findIndex(p => p.id === profile.id);
    if (idx >= 0) {
      savedItem = {
        ...existing[idx],
        ...profile,
        id: profile.id,
        updatedAt: nowIso
      };
      existing[idx] = savedItem;
    } else {
      savedItem = {
        ...profile,
        id: profile.id,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      existing.push(savedItem);
    }
  } else {
    savedItem = {
      ...profile,
      id: `profile-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    existing.push(savedItem);
  }

  try {
    localStorage.setItem(SAVED_PROFILES_STORAGE_KEY, JSON.stringify(existing));
  } catch (e) {
    console.warn('Falha ao persistir perfis de mapeamento:', e);
  }
  return savedItem;
}

export function deleteCustomMappingProfile(id: string): void {
  const existing = getCustomMappingProfiles();
  const filtered = existing.filter(p => p.id !== id);
  try {
    localStorage.setItem(SAVED_PROFILES_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Falha ao excluir perfil de mapeamento:', e);
  }
}

export interface GroupedChartAccounts {
  groupName: string;
  shortName: string;
  badgeColor: string;
  accounts: ChartAccount[];
}

export function getGroupedChartAccounts(accounts: ChartAccount[], moduleFilter?: TitleType): GroupedChartAccounts[] {
  let analytical = accounts.filter(a => a.isAnalytical && a.isActive);

  if (moduleFilter === 'PAGAR') {
    analytical = analytical.filter(a => {
      const code = a.code || '';
      const nat = a.nature || '';
      // Exclui receitas brutas e financeiras no Contas a Pagar
      if (code.startsWith('1.1') || nat === 'RECEITA_SERVICO') return false;
      if (code.startsWith('4.1') || nat === 'RECEITA_FINANCEIRA') return false;
      return true;
    });
  } else if (moduleFilter === 'RECEBER') {
    analytical = analytical.filter(a => {
      const code = a.code || '';
      const nat = a.nature || '';
      // No Contas a Receber, permite apenas receitas e aportes de capital
      if (code.startsWith('2.') || nat === 'CUSTO_SERVICO') return false;
      if (code.startsWith('3.') || nat.startsWith('DESPESA_')) return false;
      if (code.startsWith('4.2') || nat === 'DESPESA_FINANCEIRA') return false;
      if (code.startsWith('5.') || nat === 'TRIBUTO_LUCRO') return false;
      if (code.startsWith('6.') || nat === 'INVESTIMENTO_ATIVO') return false;
      if (code.startsWith('1.2') || nat === 'DEDUCAO_RECEITA') return false;
      return true;
    });
  }

  const groupDefs: { key: string; name: string; shortName: string; badgeColor: string; match: (acc: ChartAccount) => boolean }[] = [
    {
      key: '1.1',
      name: '1. RECEITAS DE SERVIÇOS E FATURAMENTO',
      shortName: 'Receitas de Serviços',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      match: (acc) => (acc.code || '').startsWith('1.1') || acc.nature === 'RECEITA_SERVICO'
    },
    {
      key: '1.2',
      name: '1.2 DEDUÇÕES DA RECEITA (IMPOSTOS & ABATIMENTOS)',
      shortName: 'Deduções',
      badgeColor: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
      match: (acc) => (acc.code || '').startsWith('1.2') || acc.nature === 'DEDUCAO_RECEITA'
    },
    {
      key: '2',
      name: '2. CUSTOS DA OPERAÇÃO (SERVIÇOS PRESTADOS - CSP/CPV)',
      shortName: 'Custos da Operação',
      badgeColor: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      match: (acc) => (acc.code || '').startsWith('2') || acc.nature === 'CUSTO_SERVICO'
    },
    {
      key: '3.1',
      name: '3.1 DESPESAS COM PESSOAL (FOLHA, BENEFÍCIOS & PRÓ-LABORE)',
      shortName: 'Despesas c/ Pessoal',
      badgeColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      match: (acc) => (acc.code || '').startsWith('3.1') || acc.nature === 'DESPESA_PESSOAL'
    },
    {
      key: '3.2',
      name: '3.2 DESPESAS ADMINISTRATIVAS & TI (ALUGUEL, ENERGIA, SOFTWARES)',
      shortName: 'Despesas Admin & TI',
      badgeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
      match: (acc) => (acc.code || '').startsWith('3.2') || acc.nature === 'DESPESA_ADMINISTRATIVA'
    },
    {
      key: '3.3',
      name: '3.3 DESPESAS COMERCIAIS & MARKETING (PUBLICIDADE, TRÁFEGO, COMISSÕES)',
      shortName: 'Despesas Comerciais & Mkt',
      badgeColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
      match: (acc) => (acc.code || '').startsWith('3.3') || acc.nature === 'DESPESA_COMERCIAL'
    },
    {
      key: '4.1',
      name: '4.1 RECEITAS FINANCEIRAS (JUROS RECEBIDOS, MULTAS & RENDIMENTOS)',
      shortName: 'Receitas Financeiras',
      badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      match: (acc) => (acc.code || '').startsWith('4.1') || acc.nature === 'RECEITA_FINANCEIRA'
    },
    {
      key: '4.2',
      name: '4.2 DESPESAS FINANCEIRAS (JUROS PAGOS, MULTAS & TARIFAS BANCÁRIAS)',
      shortName: 'Despesas Financeiras',
      badgeColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      match: (acc) => (acc.code || '').startsWith('4.2') || acc.nature === 'DESPESA_FINANCEIRA'
    },
    {
      key: '5',
      name: '5. TRIBUTOS SOBRE O LUCRO (SIMPLES, IRPJ & CSLL)',
      shortName: 'Tributos s/ Lucro',
      badgeColor: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      match: (acc) => (acc.code || '').startsWith('5.') || acc.nature === 'TRIBUTO_LUCRO'
    },
    {
      key: '6',
      name: '6. INVESTIMENTOS & ATIVOS (EQUIPAMENTOS, HARDWARE & MÓVEIS)',
      shortName: 'Investimentos & Ativos',
      badgeColor: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
      match: (acc) => (acc.code || '').startsWith('6.') || acc.nature === 'INVESTIMENTO_ATIVO'
    },
    {
      key: '7',
      name: '7. FINANCIAMENTOS, SÓCIOS & DISTRIBUIÇÃO DE LUCROS',
      shortName: 'Sócios & Financiamentos',
      badgeColor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      match: (acc) => (acc.code || '').startsWith('7.') || acc.nature === 'FINANCIAMENTO_SOCIO' || acc.id === 'acc-7.1.04' || acc.name.toLowerCase().includes('lucro')
    },
    {
      key: '8',
      name: '8. CONTROLES ESPECÍFICOS & ADIANTAMENTOS',
      shortName: 'Controles Específicos',
      badgeColor: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      match: (acc) => (acc.code || '').startsWith('8.') || acc.nature === 'CONTROLE_ESPECIFICO'
    }
  ];

  const matchedAccountIds = new Set<string>();
  const result: GroupedChartAccounts[] = [];

  for (const def of groupDefs) {
    if (moduleFilter === 'PAGAR' && (def.key === '1.1' || def.key === '4.1')) continue;
    if (moduleFilter === 'RECEBER' && ['2', '3.1', '3.2', '3.3', '4.2', '5', '6', '8'].includes(def.key)) continue;

    const matched = analytical.filter(a => !matchedAccountIds.has(a.id) && def.match(a));
    matched.forEach(a => matchedAccountIds.add(a.id));
    if (matched.length > 0) {
      result.push({
        groupName: def.name,
        shortName: def.shortName,
        badgeColor: def.badgeColor,
        accounts: matched.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }))
      });
    }
  }

  // Contas residuais (caso haja contas customizadas pelo usuário fora da numeração padrão)
  const leftovers = analytical.filter(a => !matchedAccountIds.has(a.id));
  if (leftovers.length > 0) {
    result.push({
      groupName: 'OUTRAS CONTAS E OPERAÇÕES',
      shortName: 'Outras Contas',
      badgeColor: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
      accounts: leftovers.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }))
    });
  }

  return result;
}

export interface AccountGroupStyle {
  borderLeft: string;
  bgSubtle: string;
  badgeStyle: string;
  groupLabel: string;
}

export function getAccountGroupBadgeStyle(acc?: ChartAccount | null): AccountGroupStyle {
  if (!acc) {
    return {
      borderLeft: 'border-l-4 border-l-slate-500',
      bgSubtle: 'bg-slate-500/5',
      badgeStyle: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
      groupLabel: 'Sem Categoria'
    };
  }

  const code = acc.code || '';
  const nature = acc.nature || '';
  const name = acc.name.toLowerCase();

  // 1.1 Receitas de Serviços / Faturamento (Verde)
  if (code.startsWith('1.1') || nature === 'RECEITA_SERVICO') {
    return {
      borderLeft: 'border-l-4 border-l-emerald-500',
      bgSubtle: 'bg-emerald-500/10 hover:bg-emerald-500/15',
      badgeStyle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      groupLabel: 'Receita'
    };
  }

  // 1.2 Deduções da Receita (Rosa)
  if (code.startsWith('1.2') || nature === 'DEDUCAO_RECEITA') {
    return {
      borderLeft: 'border-l-4 border-l-rose-500',
      bgSubtle: 'bg-rose-500/10 hover:bg-rose-500/15',
      badgeStyle: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      groupLabel: 'Dedução'
    };
  }

  // 2. Custos Operacionais / Serviços Prestados (Âmbar) - CSP / CPV
  if (code.startsWith('2') || nature === 'CUSTO_SERVICO') {
    return {
      borderLeft: 'border-l-4 border-l-amber-500',
      bgSubtle: 'bg-amber-500/10 hover:bg-amber-500/15',
      badgeStyle: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      groupLabel: 'Custo da Operação'
    };
  }

  // 3.1 Despesas com Pessoal (Índigo)
  if (code.startsWith('3.1') || nature === 'DESPESA_PESSOAL') {
    return {
      borderLeft: 'border-l-4 border-l-indigo-500',
      bgSubtle: 'bg-indigo-500/10 hover:bg-indigo-500/15',
      badgeStyle: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      groupLabel: 'Despesa c/ Pessoal'
    };
  }

  // 3.2 Despesas Administrativas & TI (Sky)
  if (code.startsWith('3.2') || nature === 'DESPESA_ADMINISTRATIVA') {
    return {
      borderLeft: 'border-l-4 border-l-sky-500',
      bgSubtle: 'bg-sky-500/10 hover:bg-sky-500/15',
      badgeStyle: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      groupLabel: 'Despesa Admin/TI'
    };
  }

  // 3.3 Despesas Comerciais & Marketing (Ciano)
  if (code.startsWith('3.3') || nature === 'DESPESA_COMERCIAL') {
    return {
      borderLeft: 'border-l-4 border-l-cyan-500',
      bgSubtle: 'bg-cyan-500/10 hover:bg-cyan-500/15',
      badgeStyle: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      groupLabel: 'Despesa Comercial'
    };
  }

  // 4.1 Receitas Financeiras (Verde Esmeralda)
  if (code.startsWith('4.1') || nature === 'RECEITA_FINANCEIRA') {
    return {
      borderLeft: 'border-l-4 border-l-emerald-500',
      bgSubtle: 'bg-emerald-500/10 hover:bg-emerald-500/15',
      badgeStyle: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      groupLabel: 'Receita Financeira'
    };
  }

  // 4.2 Despesas Financeiras (Azul)
  if (code.startsWith('4.2') || nature === 'DESPESA_FINANCEIRA' || nature.includes('FINANCEIR')) {
    return {
      borderLeft: 'border-l-4 border-l-blue-500',
      bgSubtle: 'bg-blue-500/10 hover:bg-blue-500/15',
      badgeStyle: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      groupLabel: 'Despesa Financeira'
    };
  }

  // 5. Tributos sobre o Lucro (Laranja)
  if (code.startsWith('5.') || nature === 'TRIBUTO_LUCRO') {
    return {
      borderLeft: 'border-l-4 border-l-orange-500',
      bgSubtle: 'bg-orange-500/10 hover:bg-orange-500/15',
      badgeStyle: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
      groupLabel: 'Tributo s/ Lucro'
    };
  }

  // 6. Investimentos & Ativos (Teal)
  if (code.startsWith('6.') || nature === 'INVESTIMENTO_ATIVO') {
    return {
      borderLeft: 'border-l-4 border-l-teal-500',
      bgSubtle: 'bg-teal-500/10 hover:bg-teal-500/15',
      badgeStyle: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
      groupLabel: 'Investimento / Ativo'
    };
  }

  // 7. Sócios & Distribuição de Lucros (Roxo)
  if (code.startsWith('7.') || nature === 'FINANCIAMENTO_SOCIO' || name.includes('lucro') || acc.id === 'acc-7.1.04') {
    return {
      borderLeft: 'border-l-4 border-l-purple-500',
      bgSubtle: 'bg-purple-500/10 hover:bg-purple-500/15',
      badgeStyle: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      groupLabel: 'Sócios & Lucros'
    };
  }

  // 8. Controles Específicos (Ardósia)
  if (code.startsWith('8.') || nature === 'CONTROLE_ESPECIFICO') {
    return {
      borderLeft: 'border-l-4 border-l-slate-400',
      bgSubtle: 'bg-slate-500/10 hover:bg-slate-500/15',
      badgeStyle: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
      groupLabel: 'Controle Específico'
    };
  }

  return {
    borderLeft: 'border-l-4 border-l-slate-400',
    bgSubtle: 'bg-slate-500/10 hover:bg-slate-500/15',
    badgeStyle: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
    groupLabel: 'Outras'
  };
}

// Modal Popover de Busca e Seleção Rápida de Categorias Agrupadas
export interface CategoryQuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAccount: (accountId: string) => void;
  currentAccountId?: string;
  targetDescription?: string;
  targetType?: TitleType;
  groupedAccounts: GroupedChartAccounts[];
}

export const CategoryQuickSearchModal: React.FC<CategoryQuickSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectAccount,
  currentAccountId,
  targetDescription,
  targetType,
  groupedAccounts
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGroupFilter, setActiveGroupFilter] = useState<string>('TODOS');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setActiveGroupFilter('TODOS');
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const availableGroups = useMemo(() => {
    return groupedAccounts.filter(g => {
      if (targetType === 'PAGAR') {
        if (g.shortName === 'Receitas' || g.groupName.includes('RECEITAS DE SERVIÇOS')) return false;
      } else if (targetType === 'RECEBER') {
        const expenseGroups = ['Custos', 'Pessoal', 'Administrativas & TI', 'Comerciais & Mkt', 'Tributos', 'Sócios & Lucros'];
        if (expenseGroups.includes(g.shortName)) return false;
      }
      return true;
    });
  }, [groupedAccounts, targetType]);

  const filteredGroups = useMemo(() => {
    return availableGroups.map(g => {
      if (activeGroupFilter !== 'TODOS' && g.shortName !== activeGroupFilter) {
        return { ...g, accounts: [] };
      }
      const matchingAccounts = g.accounts.filter(a => {
        if (targetType === 'PAGAR') {
          if ((a.code || '').startsWith('1.1') || a.nature === 'RECEITA_SERVICO') return false;
        } else if (targetType === 'RECEBER') {
          if ((a.code || '').startsWith('3.') || a.nature === 'CUSTO_SERVICO') return false;
          if ((a.code || '').startsWith('4.') || (a.nature || '').startsWith('DESPESA_')) return false;
          if ((a.code || '').startsWith('6.') || a.nature === 'TRIBUTO_LUCRO') return false;
          if ((a.code || '').startsWith('7.') || a.nature === 'FINANCIAMENTO_SOCIO') return false;
        }

        if (!searchTerm.trim()) return true;
        return matchesSearch([a.code, a.name, a.nature, g.groupName, g.shortName], searchTerm);
      });
      return { ...g, accounts: matchingAccounts };
    }).filter(g => g.accounts.length > 0);
  }, [availableGroups, activeGroupFilter, searchTerm, targetType]);

  const totalMatchingAccounts = filteredGroups.reduce((acc, g) => acc + g.accounts.length, 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Se houver contas encontradas, seleciona a primeira imediatamente
      const firstAccount = filteredGroups[0]?.accounts[0];
      if (firstAccount) {
        onSelectAccount(firstAccount.id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden text-[var(--text-primary)]">
        
        {/* Header com barra de pesquisa */}
        <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-xs">
                <Search className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span>Pesquisar Categoria por Nome ou Código</span>
                  {targetType === 'PAGAR' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      Contas a Pagar (Despesas & Custos)
                    </span>
                  ) : targetType === 'RECEBER' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      Contas a Receber (Receitas & Vendas)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      Plano de Contas
                    </span>
                  )}
                </h3>
                {targetDescription ? (
                  <p className="text-[11px] text-[var(--text-secondary)] truncate max-w-lg mt-0.5">
                    Lançamento atual: <strong className="text-[var(--text-primary)]">{targetDescription}</strong>
                  </p>
                ) : (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Escolha a conta contábil para categorizar os lançamentos selecionados
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Campo de Busca Rápida por Nome */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-amber-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Digite o nome da categoria (ex: Aluguel, Vale, Energia, Pro-labore) ou código (ex: 4.1.01, 4101)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full pl-9 pr-20 py-2 rounded-xl border border-amber-500/30 bg-[var(--surface-card)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 focus:outline-hidden font-medium"
            />
            <div className="absolute right-2 top-2 flex items-center space-x-1">
              <span className="text-[10px] font-mono text-[var(--text-secondary)] px-1.5 py-0.5 bg-[var(--surface-elevated)] rounded border border-[var(--border-subtle)]">
                {totalMatchingAccounts} contas
              </span>
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold px-1"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filtros Rápidos por Macro-Grupo */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            <button
              type="button"
              onClick={() => setActiveGroupFilter('TODOS')}
              className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                activeGroupFilter === 'TODOS'
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
              }`}
            >
              Todas
            </button>
            {availableGroups.map(g => (
              <button
                key={g.shortName}
                type="button"
                onClick={() => setActiveGroupFilter(g.shortName)}
                className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                  activeGroupFilter === g.shortName
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-xs'
                    : 'bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)]'
                }`}
              >
                {g.shortName}
              </button>
            ))}
          </div>
        </div>

        {/* Lista Agrupada com Rolagem */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
              Nenhuma conta contábil encontrada para o termo "{searchTerm}".
            </div>
          ) : (
            filteredGroups.map(group => (
              <div key={group.groupName} className="space-y-1.5">
                <div className="flex items-center space-x-2 px-1">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${group.badgeColor}`}>
                    {group.groupName}
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    ({group.accounts.length} contas)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {group.accounts.map(acc => {
                    const isSelected = acc.id === currentAccountId;

                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          onSelectAccount(acc.id);
                          onClose();
                        }}
                        className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-xs'
                            : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-amber-400/50 hover:bg-[var(--surface-card)] text-[var(--text-primary)]'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <span className="font-mono text-[10px] text-amber-400/90 font-bold block">
                            {acc.code || 'Conta'}
                          </span>
                          <span className="text-xs truncate block font-medium">
                            {acc.name}
                          </span>
                        </div>

                        {isSelected && (
                          <span className="text-xs font-bold text-amber-400 shrink-0">
                            ✓ Ativa
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé do Modal de Busca */}
        <div className="p-3 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)] shrink-0">
          <span>
            Pressione <strong>Esc</strong> para fechar ou clique na categoria desejada para selecionar.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] font-bold text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};

interface ImportErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface ImportErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ImportErrorBoundary extends React.Component<ImportErrorBoundaryProps, ImportErrorBoundaryState> {
  props: ImportErrorBoundaryProps;
  state: ImportErrorBoundaryState = { hasError: false };

  constructor(props: ImportErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ImportErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ImportErrorBoundary capturou falha de renderização:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[var(--surface-card)] border border-rose-500/40 rounded-3xl p-8 max-w-lg mx-auto shadow-2xl text-center space-y-4 my-auto">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              Inconsistência Temporária na Exibição
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Houve uma falha ao processar a exibição desta planilha: {this.state.error?.message || 'Formato não reconhecido'}. Seus dados originais não foram perdidos.
            </p>
            <div className="flex justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  (this as any).setState({ hasError: false, error: undefined });
                  if (this.props.onReset) this.props.onReset();
                }}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
              >
                Voltar e Recarregar Modal
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ImportSpreadsheetModalInner: React.FC<ImportSpreadsheetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onImportCompleted,
  defaultType
}) => {
  // Stepper: 1: Upload & Preset, 2: Mapping, 3: Validation, Idempotency & Diff, 4: Results
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // File and sheet state
  const [fileName, setFileName] = useState<string>('');
  const [rawSheetData, setRawSheetData] = useState<Record<string, any>[]>([]);
  const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<'CONTA_AZUL' | 'PLANILHA_BASE' | 'CONTAJU' | 'CUSTOM'>('CONTA_AZUL');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Database lookups
  const bankAccounts = useMemo(() => storage.getBankAccounts(), []);
  const chartAccounts = useMemo(() => storage.getChartAccounts(), []);
  const chartAccountsMap = useMemo(() => new Map(chartAccounts.map(a => [a.id, a])), [chartAccounts]);
  const counterparties = useMemo(() => storage.getCounterparties(), []);
  
  const defaultBank = bankAccounts[0]?.id || '';
  const defaultExpenseAccount = chartAccounts.find(a => a.nature === 'DESPESA_ADMINISTRATIVA' && a.isAnalytical)?.id || chartAccounts[0]?.id || '';
  const defaultRevenueAccount = chartAccounts.find(a => a.nature === 'RECEITA_SERVICO' && a.isAnalytical)?.id || chartAccounts[0]?.id || '';

  // Modo de Separação de Tipo (Receita vs Despesa)
  const [typeDetectionMode, setTypeDetectionMode] = useState<TypeDetectionMode>('AUTO');
  const [fallbackDefaultType, setFallbackDefaultType] = useState<TitleType>(defaultType || 'PAGAR');
  const [fallbackBankAccountId, setFallbackBankAccountId] = useState<string>(defaultBank);
  const [fallbackExpenseAccountId, setFallbackExpenseAccountId] = useState<string>(defaultExpenseAccount);
  const [fallbackRevenueAccountId, setFallbackRevenueAccountId] = useState<string>(defaultRevenueAccount);

  // Sincroniza tipo padrão e limpa estado ao reabrir
  useEffect(() => {
    if (isOpen) {
      if (defaultType) {
        setFallbackDefaultType(defaultType);
      }
    } else {
      if (step === 4) {
        setStep(1);
        setRawSheetData([]);
        setAnalyzedRows([]);
        setFileName('');
        setImportSummary(null);
        setExtraColumns([]);
      }
    }
  }, [isOpen, defaultType]);

  // Visualização e Modal de Categorias Inteligente
  const [isFullscreen, setIsFullscreen] = useState<boolean>(true);
  const [categorySearchTarget, setCategorySearchTarget] = useState<{
    rowNumber?: number;
    description?: string;
    currentAccountId?: string;
    type?: TitleType;
    isBulk?: boolean;
  } | null>(null);

  const groupedAccounts = useMemo(() => {
    return getGroupedChartAccounts(chartAccounts, categorySearchTarget?.type || defaultType);
  }, [chartAccounts, categorySearchTarget?.type, defaultType]);
  const [savedTemplateBanner, setSavedTemplateBanner] = useState<string | null>(null);
  const [cascadeSuggestion, setCascadeSuggestion] = useState<{
    partyName: string;
    targetAccountId: string;
    targetAccountName: string;
    otherRowNumbers: number[];
  } | null>(null);

  // Perfis de Mapeamento com Nome Customizado
  const [customProfiles, setCustomProfiles] = useState<CustomMappingProfile[]>(() => getCustomMappingProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [showSaveProfileModal, setShowSaveProfileModal] = useState<boolean>(false);
  const [newProfileName, setNewProfileName] = useState<string>('');

  // Filtro de Duplicadas Internas no Próprio Arquivo (Step 3)
  const [filterDuplicatesOnly, setFilterDuplicatesOnly] = useState<boolean>(false);

  // Filtro de Parcelamentos Inteligentes (Step 3)
  const [filterInstallmentsOnly, setFilterInstallmentsOnly] = useState<boolean>(false);

  // Histórico de Auditoria e Reversão Segura de Importações
  const [showAuditHistoryModal, setShowAuditHistoryModal] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<ImportAuditLog[]>(() => importAuditService.getLogs());
  const [auditFeedbackMsg, setAuditFeedbackMsg] = useState<string | null>(null);
  const [rollbackConfirmId, setRollbackConfirmId] = useState<string | null>(null);

  // Colunas Extras Customizadas
  const [extraColumns, setExtraColumns] = useState<ExtraColumnDefinition[]>([]);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);

  // Modais de Edição e Cruzamento
  const [editingRow, setEditingRow] = useState<AnalyzedImportRow | null>(null);
  const [showCrossReferenceModal, setShowCrossReferenceModal] = useState(false);

  // Mapeamento Canônico
  const [mapping, setMapping] = useState<ColumnMapping>({
    tipo: '',
    titulo: '',
    fornecedor: '',
    documento: '',
    descricao: '',
    competencia: '',
    emissao: '',
    vencimento: '',
    dataPagamento: '',
    previsaoCaixa: '',
    valorOriginal: '',
    principalBaixado: '',
    saldoAtual: '',
    situacao: '',
    categoria: '',
    banco: '',
    centroCusto: ''
  });

  // Linhas analisadas pela engine de mapeamento e idempotência
  const [analyzedRows, setAnalyzedRows] = useState<AnalyzedImportRow[]>([]);
  const [filterAction, setFilterAction] = useState<string>('TODOS');
  const [filterType, setFilterType] = useState<'TODOS' | 'RECEBER' | 'PAGAR'>('TODOS');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedDiffRow, setSelectedDiffRow] = useState<AnalyzedImportRow | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Resoluções manuais de contrapartes feitas pelo usuário no Step 3
  const [partyOverrides, setPartyOverrides] = useState<Record<number, { action: 'USE_EXISTING' | 'CREATE_NEW', partyId?: string }>>({});

  const [importSummary, setImportSummary] = useState<{
    createdCount: number;
    updatedCount: number;
    ignoredCount: number;
    settledCount: number;
    newPartiesCount: number;
    receivablesCount: number;
    payablesCount: number;
    totalReceivables: number;
    totalPayables: number;
  } | null>(null);

  // Ações de Template Memorizado
  const handleSaveCurrentMappingTemplate = () => {
    saveMappingTemplate(mapping, availableHeaders, extraColumns);
    setSavedTemplateBanner('Modelo de colunas memorizado com sucesso! Próximas importações usarão este padrão automaticamente.');
    setTimeout(() => setSavedTemplateBanner(null), 5000);
  };

  // Manipulação de Perfis de Mapeamento com Nome Customizado
  const handleSaveCurrentProfile = () => {
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      alert('Por favor, informe um nome para o perfil (ex: Extrato Banco Inter, Relatório Conta Azul Vendas).');
      return;
    }

    const saved = saveCustomMappingProfile({
      name: trimmed,
      mapping,
      headersSignature: availableHeaders && availableHeaders.length > 0 ? availableHeaders.slice().sort().join('|') : undefined,
      extraColumns,
      fallbackExpenseAccountId,
      fallbackRevenueAccountId,
      typeDetectionMode,
      defaultType: fallbackDefaultType
    });

    const updatedList = getCustomMappingProfiles();
    setCustomProfiles(updatedList);
    setSelectedProfileId(saved.id);
    setShowSaveProfileModal(false);
    setNewProfileName('');
    setSavedTemplateBanner(`✓ Perfil de mapeamento "${saved.name}" salvo com sucesso!`);
    setTimeout(() => setSavedTemplateBanner(null), 5000);
  };

  const handleApplyCustomProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    if (!profileId) return;

    const profile = customProfiles.find(p => p.id === profileId);
    if (!profile) return;

    let matchCount = 0;
    const newMapping = { ...mapping };

    (Object.keys(profile.mapping) as (keyof ColumnMapping)[]).forEach(k => {
      const col = profile.mapping[k];
      if (col && availableHeaders.includes(col)) {
        newMapping[k] = col;
        matchCount++;
      } else if (col) {
        newMapping[k] = col;
      }
    });

    setMapping(newMapping);
    if (profile.extraColumns && profile.extraColumns.length > 0) {
      setExtraColumns(profile.extraColumns);
    }
    if (profile.fallbackExpenseAccountId) {
      setFallbackExpenseAccountId(profile.fallbackExpenseAccountId);
    }
    if (profile.fallbackRevenueAccountId) {
      setFallbackRevenueAccountId(profile.fallbackRevenueAccountId);
    }
    if (profile.typeDetectionMode) {
      setTypeDetectionMode(profile.typeDetectionMode);
    }

    setSavedTemplateBanner(`✓ Perfil "${profile.name}" aplicado com sucesso (${matchCount} colunas vinculadas)!`);
    setTimeout(() => setSavedTemplateBanner(null), 5000);
  };

  const handleDeleteCustomProfile = (profileId: string) => {
    const profile = customProfiles.find(p => p.id === profileId);
    if (!profile) return;
    if (!confirm(`Deseja realmente excluir o perfil de mapeamento "${profile.name}"?`)) return;

    deleteCustomMappingProfile(profileId);
    const updated = getCustomMappingProfiles();
    setCustomProfiles(updated);
    if (selectedProfileId === profileId) {
      setSelectedProfileId('');
    }
    setSavedTemplateBanner(`Perfil "${profile.name}" excluído.`);
    setTimeout(() => setSavedTemplateBanner(null), 4000);
  };

  const handleRollbackBatch = (batchId: string) => {
    const res = importAuditService.rollbackBatch(batchId);
    setAuditLogs(importAuditService.getLogs());
    setRollbackConfirmId(null);
    if (res.success) {
      setAuditFeedbackMsg(`✓ ${res.message}`);
      if (onSuccess) onSuccess();
    } else {
      setAuditFeedbackMsg(`⚠️ ${res.message}`);
    }
    setTimeout(() => setAuditFeedbackMsg(null), 7000);
  };

  // Detecção e Ações de Duplicidade Interna no Próprio Arquivo
  const internalDuplicateStats = useMemo(() => {
    const dups = analyzedRows.filter(r => r.isInternalDuplicate && !r.isTypeFilteredOut && r.action !== 'ERRO');
    const groups = new Set(dups.map(r => r.internalDuplicateGroupKey).filter(Boolean));
    return {
      totalDuplicates: dups.length,
      groupCount: groups.size,
      redundantCount: dups.filter(r => !r.isInternalDuplicateOriginal).length
    };
  }, [analyzedRows]);

  const handleDeselectRedundantDuplicates = () => {
    let deselectedCount = 0;
    setAnalyzedRows(prev => prev.map(r => {
      if (r.isInternalDuplicate && !r.isInternalDuplicateOriginal && r.isSelected) {
        deselectedCount++;
        return { ...r, isSelected: false };
      }
      return r;
    }));
    setSavedTemplateBanner(`✓ ${deselectedCount} cópias de lançamentos duplicados foram desmarcadas (mantendo a 1ª ocorrência de cada)!`);
    setTimeout(() => setSavedTemplateBanner(null), 6000);
  };

  const handleApplySavedTemplate = () => {
    const saved = getSavedMappingTemplate();
    if (!saved) {
      alert('Nenhum modelo de mapeamento memorizado anteriormente.');
      return;
    }
    const newMapping = { ...mapping };
    let matchCount = 0;
    (Object.keys(saved.mapping) as (keyof ColumnMapping)[]).forEach(k => {
      const col = saved.mapping[k];
      if (col && availableHeaders.includes(col)) {
        newMapping[k] = col;
        matchCount++;
      }
    });
    setMapping(newMapping);
    setSavedTemplateBanner(`Modelo memorizado aplicado com sucesso (${matchCount} colunas vinculadas)!`);
    setTimeout(() => setSavedTemplateBanner(null), 5000);
  };

  // -------------------------------------------------------------
  // Preset Mapping Applicator
  // -------------------------------------------------------------
  const applyPresetMapping = (headers: string[], preset: 'CONTA_AZUL' | 'PLANILHA_BASE' | 'CONTAJU' | 'CUSTOM') => {
    setSelectedPreset(preset);

    const findMatch = (patterns: string[]) => detectColumnMatch(headers, patterns);

    if (preset === 'PLANILHA_BASE') {
      // 11 colunas canônicas da planilha base + tipo e centro de custo
      setMapping({
        tipo: findMatch(['Tipo', 'Natureza', 'Operação']),
        titulo: findMatch(['Título', 'Titulo']),
        fornecedor: findMatch(['Fornecedor', 'Fornecedor / Cliente', 'Cliente/Fornecedor', 'Cliente']),
        documento: findMatch(['CNPJ / CPF', 'CPF / CNPJ', 'CNPJ', 'CPF', 'Documento']),
        descricao: findMatch(['Descrição', 'Descricao']),
        competencia: findMatch(CONTA_AZUL_COLUMN_PATTERNS.competencia),
        emissao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.emissao),
        vencimento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.vencimento),
        dataPagamento: findMatch(['Data Pagamento', 'Data da Baixa', 'Data Quitação', 'Pago em']),
        previsaoCaixa: findMatch(['Previsão Caixa', 'Previsao Caixa', 'Previsão']),
        valorOriginal: findMatch(['Valor Original', 'Valor']),
        principalBaixado: findMatch(['Principal Baixado', 'Valor Pago', 'Valor Baixado']),
        saldoAtual: findMatch(['Saldo Atual', 'Saldo']),
        situacao: findMatch(['Situação', 'Situacao', 'Status']),
        categoria: findMatch(['Categoria', 'Plano de Contas']),
        banco: findMatch(['Banco', 'Conta Bancária']),
        centroCusto: findMatch(['Centro de Custo', 'Centro de Custos', 'CC'])
      });
    } else if (preset === 'CONTA_AZUL') {
      // Padrão completo do Conta Azul (com detecção de tipo de lançamento)
      setMapping({
        tipo: findMatch(CONTA_AZUL_COLUMN_PATTERNS.tipo),
        titulo: findMatch(CONTA_AZUL_COLUMN_PATTERNS.titulo),
        fornecedor: findMatch(CONTA_AZUL_COLUMN_PATTERNS.fornecedor),
        documento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.documento),
        descricao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.descricao),
        competencia: findMatch(CONTA_AZUL_COLUMN_PATTERNS.competencia),
        emissao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.emissao),
        vencimento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.vencimento),
        dataPagamento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.dataPagamento),
        previsaoCaixa: findMatch(CONTA_AZUL_COLUMN_PATTERNS.previsaoCaixa),
        valorOriginal: findMatch(CONTA_AZUL_COLUMN_PATTERNS.valorOriginal),
        principalBaixado: findMatch(CONTA_AZUL_COLUMN_PATTERNS.principalBaixado),
        saldoAtual: findMatch(CONTA_AZUL_COLUMN_PATTERNS.saldoAtual),
        situacao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.situacao),
        categoria: findMatch(CONTA_AZUL_COLUMN_PATTERNS.categoria),
        banco: findMatch(CONTA_AZUL_COLUMN_PATTERNS.banco),
        centroCusto: findMatch(CONTA_AZUL_COLUMN_PATTERNS.centroCusto)
      });
    } else if (preset === 'CONTAJU') {
      setMapping({
        tipo: findMatch(['tipo', 'natureza', 'fluxo']),
        titulo: findMatch(['documento', 'número', 'título']),
        fornecedor: findMatch(['fornecedor', 'cliente', 'contraparte']),
        documento: findMatch(['cnpj', 'cpf', 'documento', 'cpf/cnpj']),
        descricao: findMatch(['descrição', 'descricao', 'historico']),
        competencia: findMatch(CONTA_AZUL_COLUMN_PATTERNS.competencia),
        emissao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.emissao),
        vencimento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.vencimento),
        dataPagamento: findMatch(['data de pagamento', 'data pagamento', 'data da baixa']),
        previsaoCaixa: findMatch(['previsão', 'previsao caixa']),
        valorOriginal: findMatch(['valor original', 'valor']),
        principalBaixado: findMatch(['valor pago', 'principal baixado']),
        saldoAtual: findMatch(['saldo atual', 'saldo']),
        situacao: findMatch(['situação', 'situacao', 'status']),
        categoria: findMatch(['plano de contas', 'categoria']),
        banco: findMatch(['banco previsto', 'banco']),
        centroCusto: findMatch(['centro de custo', 'unidade'])
      });
    } else {
      // Auto-detect genérico
      setMapping({
        tipo: findMatch(CONTA_AZUL_COLUMN_PATTERNS.tipo),
        titulo: findMatch(CONTA_AZUL_COLUMN_PATTERNS.titulo),
        fornecedor: findMatch(CONTA_AZUL_COLUMN_PATTERNS.fornecedor),
        documento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.documento),
        descricao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.descricao),
        competencia: findMatch(CONTA_AZUL_COLUMN_PATTERNS.competencia),
        emissao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.emissao),
        vencimento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.vencimento),
        dataPagamento: findMatch(CONTA_AZUL_COLUMN_PATTERNS.dataPagamento),
        previsaoCaixa: findMatch(CONTA_AZUL_COLUMN_PATTERNS.previsaoCaixa),
        valorOriginal: findMatch(CONTA_AZUL_COLUMN_PATTERNS.valorOriginal),
        principalBaixado: findMatch(CONTA_AZUL_COLUMN_PATTERNS.principalBaixado),
        saldoAtual: findMatch(CONTA_AZUL_COLUMN_PATTERNS.saldoAtual),
        situacao: findMatch(CONTA_AZUL_COLUMN_PATTERNS.situacao),
        categoria: findMatch(CONTA_AZUL_COLUMN_PATTERNS.categoria),
        banco: findMatch(CONTA_AZUL_COLUMN_PATTERNS.banco),
        centroCusto: findMatch(CONTA_AZUL_COLUMN_PATTERNS.centroCusto)
      });
    }
  };

  // -------------------------------------------------------------
  // Leitura do Arquivo com Tratamento Seguro e Multi-Aba / Banner
  // -------------------------------------------------------------
  const handleFileUpload = (file: File) => {
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const originalConsoleError = console.error;
      const originalConsoleWarn = console.warn;

      try {
        console.error = (...args: any[]) => {
          try {
            const msg = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
            if (msg.includes('Bad uncompressed size') || msg.includes('zip') || msg.includes('sheetJS')) {
              return;
            }
          } catch (_) {}
          originalConsoleError.apply(console, args);
        };
        console.warn = (...args: any[]) => {
          try {
            const msg = args.map(a => (typeof a === 'string' ? a : String(a))).join(' ');
            if (msg.includes('Bad uncompressed size')) return;
          } catch (_) {}
          originalConsoleWarn.apply(console, args);
        };

        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        // Detecção inteligente da melhor aba e da linha exata onde começam os cabeçalhos
        let bestSheetName = workbook.SheetNames[0];
        let bestWorksheet = workbook.Sheets[bestSheetName];
        let bestHeaderRowIndex = 0;
        let highestScore = -1;

        const financialKeywords = [
          'venc', 'valor', 'pago', 'pagto', 'baix', 'saldo', 'fornec', 'client',
          'situac', 'status', 'descri', 'tipo', 'titul', 'doc', 'emiss', 'compet',
          'liquid', 'aberto', 'banco', 'categoria', 'plano'
        ];

        for (const sName of workbook.SheetNames) {
          const ws = workbook.Sheets[sName];
          if (!ws || !ws['!ref']) continue;

          // Lê primeiras 30 linhas como matriz bruta
          const rowsMatrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, range: 0 });
          const scanLimit = Math.min(rowsMatrix.length, 30);

          let sheetBestRow = 0;
          let sheetMaxMatch = 0;

          for (let r = 0; r < scanLimit; r++) {
            const rowArr = rowsMatrix[r];
            if (!Array.isArray(rowArr) || rowArr.length === 0) continue;

            let rowMatches = 0;
            const textCells = rowArr.map(c => normalizeText(String(c || '')));

            for (const cellTxt of textCells) {
              if (!cellTxt) continue;
              const hasKeyword = financialKeywords.some(kw => cellTxt.includes(kw));
              if (hasKeyword) {
                rowMatches += 5;
              } else if (cellTxt.length >= 2) {
                rowMatches += 1;
              }
            }

            if (rowMatches > sheetMaxMatch) {
              sheetMaxMatch = rowMatches;
              sheetBestRow = r;
            }
          }

          const totalRowsInSheet = rowsMatrix.length;
          const sheetScore = sheetMaxMatch * 100 + totalRowsInSheet;

          if (sheetScore > highestScore) {
            highestScore = sheetScore;
            bestSheetName = sName;
            bestWorksheet = ws;
            bestHeaderRowIndex = sheetBestRow;
          }
        }

        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(bestWorksheet, { 
          range: bestHeaderRowIndex,
          defval: '',
          raw: false 
        });

        if (jsonData.length === 0) {
          alert('A planilha selecionada está vazia ou não contém dados legíveis.');
          return;
        }

        // Extrai e normaliza lista de cabeçalhos válidos
        const rawHeaders = Object.keys(jsonData[0] || {});
        const headers = rawHeaders.filter(h => h && !h.startsWith('__EMPTY'));
        const finalHeaders = headers.length > 0 ? headers : rawHeaders;

        setAvailableHeaders(finalHeaders);
        setRawSheetData(jsonData);

        applyPresetMapping(finalHeaders, selectedPreset);

        // Auto-carrega modelo previamente memorizado pelo usuário se compatível
        const savedTpl = getSavedMappingTemplate();
        if (savedTpl) {
          let matchCount = 0;
          const mergedMapping = { ...mapping };
          (Object.keys(savedTpl.mapping) as (keyof ColumnMapping)[]).forEach(k => {
            const col = savedTpl.mapping[k];
            if (col && finalHeaders.includes(col)) {
              mergedMapping[k] = col;
              matchCount++;
            }
          });

          if (matchCount >= 2) {
            setMapping(mergedMapping);
            setSavedTemplateBanner(`Modelo memorizado detectado e aplicado (${matchCount} colunas correspondentes)!`);
          }
        }

        setStep(2);
      } catch (err) {
        console.error('Erro ao ler planilha:', err);
        alert('Não foi possível ler o arquivo. Certifique-se de que é uma planilha válida (.xlsx, .xls ou .csv).');
      } finally {
        console.error = originalConsoleError;
        console.warn = originalConsoleWarn;
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // -------------------------------------------------------------
  // Step 2 -> 3: Process and Validate Mapped Rows
  // -------------------------------------------------------------
  const handleProcessValidation = () => {
    try {
      if (!mapping.vencimento && !mapping.valorOriginal) {
        alert('Selecione pelo menos as colunas de "Data de Vencimento" e "Valor Original" para continuar.');
        return;
      }

      const existingTitles = storage.getTitles() || [];
      const currentCounterparties = storage.getCounterparties() || [];
      const currentAccounts = storage.getChartAccounts() || [];

      const analyzed = analyzeContaAzulSpreadsheet(
        rawSheetData,
        availableHeaders,
        mapping as any,
        existingTitles,
        currentCounterparties,
        currentAccounts,
        fallbackExpenseAccountId,
        fallbackRevenueAccountId,
        typeDetectionMode,
        extraColumns,
        fallbackDefaultType
      );

      if (!analyzed || analyzed.length === 0) {
        alert('Nenhum registro legível foi extraído da planilha com os mapeamentos informados. Por favor, revise as colunas.');
        return;
      }

      setAnalyzedRows(analyzed);
      setPartyOverrides({});
      setSelectedMonth('ALL');
      setFilterAction('TODOS');
      setFilterType('TODOS');
      setFilterCategoryMode('TODOS');
      setStep(3);
    } catch (err: any) {
      console.error('Erro ao processar dados da planilha:', err);
      alert(`Ocorreu um erro ao processar os dados da planilha: ${err?.message || 'Falha de leitura'}. Verifique os mapeamentos e tente novamente.`);
    }
  };

  // -------------------------------------------------------------
  // Resumo Mensal Dinâmico
  // -------------------------------------------------------------
  const monthlySummaries: MonthSummary[] = useMemo(() => {
    return calculateMonthlySummaries(analyzedRows);
  }, [analyzedRows]);

  // -------------------------------------------------------------
  // Resoluções Manuais e Edições de Linha (Step 3)
  // -------------------------------------------------------------
  const handleSetRowType = (rowNumber: number, newType: TitleType) => {
    setAnalyzedRows(prev => prev.map(r => {
      if (r.rowNumber !== rowNumber) return r;

      const norm = { ...r.normalized, tipo: newType, isManuallyEdited: true };
      const newFingerprint = generateTitleFingerprint(newType, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
      
      return {
        ...r,
        normalized: norm,
        fingerprint: newFingerprint,
        matchedChartAccountId: newType === 'RECEBER' ? fallbackRevenueAccountId : fallbackExpenseAccountId
      };
    }));
  };

  const handleSaveRow = (
    rowNumber: number, 
    updatedNormalized: BaseSpreadsheetRow, 
    resolvedPartyId?: string, 
    resolvedAccountId?: string
  ) => {
    setAnalyzedRows(prev => prev.map(r => {
      if (r.rowNumber !== rowNumber) return r;

      const newFingerprint = generateTitleFingerprint(
        updatedNormalized.tipo,
        updatedNormalized.titulo,
        updatedNormalized.fornecedor,
        updatedNormalized.vencimento,
        updatedNormalized.valorOriginal
      );

      // Revalida se existe erro remanescente
      const errors: string[] = [];
      if (!updatedNormalized.vencimento) errors.push('Vencimento inválido');
      if (updatedNormalized.valorOriginal <= 0) errors.push('Valor original deve ser superior a R$ 0,00');
      if (!updatedNormalized.fornecedor) errors.push('Contraparte não informada');

      const action: ImportDiffAction = errors.length > 0 
        ? 'ERRO' 
        : (r.action === 'ERRO' || r.action === 'IGNORAR_IDENTICO')
          ? (r.existingTitle ? 'ATUALIZAR' : 'CRIAR')
          : r.action;

      return {
        ...r,
        normalized: updatedNormalized,
        fingerprint: newFingerprint,
        action,
        errors,
        matchedCounterpartyId: resolvedPartyId || r.matchedCounterpartyId,
        matchedChartAccountId: resolvedAccountId || r.matchedChartAccountId,
        isSelected: action !== 'ERRO'
      };
    }));
  };

  const handleToggleRowStatus = (rowNumber: number) => {
    setAnalyzedRows(prev => prev.map(r => {
      if (r.rowNumber !== rowNumber) return r;

      const isCurrentlyPaid = r.normalized.situacao === 'LIQUIDADO';
      const newSituacao = isCurrentlyPaid ? 'ABERTO' : 'LIQUIDADO';
      const valorOriginal = r.normalized.valorOriginal;
      const principalBaixado = isCurrentlyPaid ? 0 : valorOriginal;
      const saldoAtual = isCurrentlyPaid ? valorOriginal : 0;
      const dataPagamento = !isCurrentlyPaid ? (r.normalized.dataPagamento || r.normalized.vencimento) : undefined;

      const updatedNormalized: BaseSpreadsheetRow = {
        ...r.normalized,
        situacao: newSituacao,
        principalBaixado,
        saldoAtual,
        dataPagamento,
        isManuallyEdited: true
      };

      const newFingerprint = generateTitleFingerprint(
        updatedNormalized.tipo,
        updatedNormalized.titulo,
        updatedNormalized.fornecedor,
        updatedNormalized.vencimento,
        updatedNormalized.valorOriginal
      );

      return {
        ...r,
        normalized: updatedNormalized,
        fingerprint: newFingerprint
      };
    }));
  };

  // Filtros de Categoria e Memória Inteligente (Step 3)
  const [filterCategoryMode, setFilterCategoryMode] = useState<'TODOS' | 'MEMORIA' | 'MANUAL' | 'FILTRADOS_SINAL'>('TODOS');
  const [batchCategoryId, setBatchCategoryId] = useState<string>('');

  // -------------------------------------------------------------
  // Edição em Massa por Coluna (Step 3)
  // -------------------------------------------------------------
  type BulkField = 'categoria' | 'competencia' | 'vencimento' | 'dataPagamento' | 'fornecedor' | 'descricao' | 'titulo' | 'valorOriginal' | 'tipo' | 'situacao';
  const [bulkField, setBulkField] = useState<BulkField>('categoria');
  const [bulkCategoryId, setBulkCategoryId] = useState<string>('');
  const [bulkCompetencia, setBulkCompetencia] = useState<string>('');
  const [bulkVencimento, setBulkVencimento] = useState<string>('');
  const [bulkDataPagamento, setBulkDataPagamento] = useState<string>('');
  const [bulkFornecedor, setBulkFornecedor] = useState<string>('');
  const [bulkDescricao, setBulkDescricao] = useState<string>('');
  const [bulkTitulo, setBulkTitulo] = useState<string>('');
  const [bulkValor, setBulkValor] = useState<string>('');
  const [bulkTipo, setBulkTipo] = useState<TitleType>('PAGAR');
  const [bulkSituacao, setBulkSituacao] = useState<'ABERTO' | 'LIQUIDADO'>('ABERTO');
  const [bulkFeedbackMsg, setBulkFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const handleChangeRowCategory = (rowNumber: number, newAccountId: string) => {
    const targetAccount = chartAccounts.find(a => a.id === newAccountId);
    if (!targetAccount) return;

    // Atualiza a linha selecionada
    setAnalyzedRows(prev => prev.map(r => {
      if (r.rowNumber !== rowNumber) return r;
      return {
        ...r,
        matchedChartAccountId: targetAccount.id,
        matchedChartAccountName: targetAccount.name,
        normalized: {
          ...r.normalized,
          categoria: targetAccount.name,
          isManuallyEdited: true
        },
        categoryResolution: 'MATCH_PLANO',
        isFromMemory: false,
        memoryReason: 'Ajustado manualmente nesta sessão (será gravado na memória de IA)'
      };
    }));

    // Auto-Preenchimento em Cascata por Fornecedor/Cliente na Tabela:
    // Identifica se existem outros lançamentos deste mesmo Fornecedor/Cliente com categorias diferentes
    const currentRow = analyzedRows.find(r => r.rowNumber === rowNumber);
    const partyName = (currentRow?.normalized?.fornecedor || '').trim();

    if (partyName && partyName.length >= 2) {
      const normParty = normalizeText(partyName);
      const otherMatchingRows = analyzedRows.filter(r => 
        r.rowNumber !== rowNumber &&
        !r.isTypeFilteredOut &&
        r.action !== 'ERRO' &&
        normalizeText(r.normalized.fornecedor || '') === normParty &&
        r.matchedChartAccountId !== newAccountId
      );

      if (otherMatchingRows.length > 0) {
        setCascadeSuggestion({
          partyName,
          targetAccountId: targetAccount.id,
          targetAccountName: targetAccount.name,
          otherRowNumbers: otherMatchingRows.map(r => r.rowNumber)
        });
      }
    }
  };

  const handleApplyCascade = () => {
    if (!cascadeSuggestion) return;
    const { targetAccountId, targetAccountName, otherRowNumbers, partyName } = cascadeSuggestion;

    setAnalyzedRows(prev => prev.map(r => {
      if (!otherRowNumbers.includes(r.rowNumber)) return r;
      return {
        ...r,
        matchedChartAccountId: targetAccountId,
        matchedChartAccountName: targetAccountName,
        normalized: {
          ...r.normalized,
          categoria: targetAccountName,
          isManuallyEdited: true
        },
        categoryResolution: 'MATCH_PLANO',
        isFromMemory: true,
        memoryReason: `Cascata automática por fornecedor: "${partyName}"`,
        memoryConfidence: 0.98
      };
    }));

    const appliedCount = otherRowNumbers.length;
    setCascadeSuggestion(null);
    setSavedTemplateBanner(`✓ Categoria "${targetAccountName}" aplicada com sucesso a todos os outros ${appliedCount} lançamentos de "${partyName}"!`);
    setTimeout(() => setSavedTemplateBanner(null), 6000);
  };

  const handleApplyBatchCategory = () => {
    if (!batchCategoryId) {
      alert('Por favor, selecione uma categoria para aplicar aos lançamentos marcados.');
      return;
    }
    const targetAccount = chartAccounts.find(a => a.id === batchCategoryId);
    if (!targetAccount) return;

    let count = 0;
    setAnalyzedRows(prev => prev.map(r => {
      if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
      count++;
      return {
        ...r,
        matchedChartAccountId: targetAccount.id,
        matchedChartAccountName: targetAccount.name,
        normalized: {
          ...r.normalized,
          categoria: targetAccount.name,
          isManuallyEdited: true
        },
        categoryResolution: 'MATCH_PLANO',
        isFromMemory: false,
        memoryReason: `Atribuído em lote para "${targetAccount.name}"`
      };
    }));
    setBulkFeedbackMsg({ text: `Categoria "${targetAccount.name}" aplicada a ${count} lançamentos!`, type: 'success' });
    setTimeout(() => setBulkFeedbackMsg(null), 5000);
  };

  // Aplicação da alteração em massa para a coluna selecionada
  const handleApplyBulkEdit = () => {
    const selectedActiveCount = analyzedRows.filter(r => r.isSelected && r.action !== 'ERRO' && !r.isTypeFilteredOut).length;
    if (selectedActiveCount === 0) {
      alert('Nenhum lançamento ativo selecionado. Marque as caixas de seleção das linhas que deseja alterar em massa.');
      return;
    }

    let summaryText = '';

    if (bulkField === 'categoria') {
      const catId = bulkCategoryId || batchCategoryId;
      if (!catId) {
        alert('Por favor, selecione uma categoria do Plano de Contas para aplicar.');
        return;
      }
      const targetAccount = chartAccounts.find(a => a.id === catId);
      if (!targetAccount) return;

      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        return {
          ...r,
          matchedChartAccountId: targetAccount.id,
          matchedChartAccountName: targetAccount.name,
          normalized: {
            ...r.normalized,
            categoria: targetAccount.name,
            isManuallyEdited: true
          },
          categoryResolution: 'MATCH_PLANO',
          isFromMemory: false,
          memoryReason: `Atribuído em lote para "${targetAccount.name}"`
        };
      }));
      summaryText = `Categoria alterada para "${targetAccount.name}" em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'competencia') {
      const cleanComp = bulkCompetencia.trim();
      const normComp = normalizeToCompetence(cleanComp);
      if (!normComp || !/^\d{4}-\d{2}$/.test(normComp)) {
        alert('Informe a competência no formato AAAA-MM (Ex: 2026-02) ou mês/ano.');
        return;
      }
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        return {
          ...r,
          normalized: {
            ...r.normalized,
            competencia: normComp,
            isManuallyEdited: true
          }
        };
      }));
      summaryText = `Competência alterada para ${normComp} em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'vencimento') {
      if (!bulkVencimento) {
        alert('Informe uma data de vencimento válida.');
        return;
      }
      const isoVenc = normalizeToISODate(bulkVencimento);
      if (!isoVenc) {
        alert('Data de vencimento inválida.');
        return;
      }
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        const norm: BaseSpreadsheetRow = {
          ...r.normalized,
          vencimento: isoVenc,
          previsaoCaixa: r.normalized.dataPagamento || isoVenc,
          isManuallyEdited: true
        };
        const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
        return {
          ...r,
          normalized: norm,
          fingerprint: fp
        };
      }));
      summaryText = `Vencimento alterado para ${formatDateBR(isoVenc)} em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'dataPagamento') {
      const isoPagto = bulkDataPagamento ? normalizeToISODate(bulkDataPagamento) : '';
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        const isPaid = !!isoPagto;
        const val = r.normalized.valorOriginal;
        const norm: BaseSpreadsheetRow = {
          ...r.normalized,
          dataPagamento: isoPagto || undefined,
          situacao: isPaid ? 'LIQUIDADO' : 'ABERTO',
          principalBaixado: isPaid ? val : 0,
          saldoAtual: isPaid ? 0 : val,
          previsaoCaixa: isoPagto || r.normalized.vencimento,
          isManuallyEdited: true
        };
        const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
        return {
          ...r,
          normalized: norm,
          fingerprint: fp
        };
      }));
      summaryText = isoPagto
        ? `Data de pagamento definida como ${formatDateBR(isoPagto)} e situação alterada para LIQUIDADO em ${selectedActiveCount} lançamento(s)!`
        : `Data de pagamento removida em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'fornecedor') {
      if (!bulkFornecedor.trim()) {
        alert('Informe o nome do fornecedor ou cliente.');
        return;
      }
      const newPartyName = bulkFornecedor.trim();
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        const norm: BaseSpreadsheetRow = {
          ...r.normalized,
          fornecedor: newPartyName,
          isManuallyEdited: true
        };
        const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);

        const matched = counterparties.find(cp => 
          normalizeText(cp.name) === normalizeText(newPartyName) ||
          normalizeText(cp.tradeName || '') === normalizeText(newPartyName)
        );

        return {
          ...r,
          normalized: norm,
          fingerprint: fp,
          matchedCounterpartyId: matched ? matched.id : undefined,
          counterpartyResolution: matched ? 'MATCH_EXATO' : 'NOVO_SOLICITADO'
        };
      }));
      summaryText = `Fornecedor/Cliente alterado para "${newPartyName}" em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'descricao') {
      if (!bulkDescricao.trim()) {
        alert('Informe a descrição para aplicar.');
        return;
      }
      const descVal = bulkDescricao.trim();
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        return {
          ...r,
          normalized: {
            ...r.normalized,
            descricao: descVal,
            isManuallyEdited: true
          }
        };
      }));
      summaryText = `Descrição atualizada em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'titulo') {
      if (!bulkTitulo.trim()) {
        alert('Informe o título / referência para aplicar.');
        return;
      }
      const titVal = bulkTitulo.trim();
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        const norm: BaseSpreadsheetRow = {
          ...r.normalized,
          titulo: titVal,
          isManuallyEdited: true
        };
        const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
        return {
          ...r,
          normalized: norm,
          fingerprint: fp
        };
      }));
      summaryText = `Título alterado para "${titVal}" em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'valorOriginal') {
      const numVal = parseFloat(bulkValor.replace(',', '.'));
      if (isNaN(numVal) || numVal <= 0) {
        alert('Informe um valor numérico válido e maior que zero.');
        return;
      }
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        const isPaid = r.normalized.situacao === 'LIQUIDADO';
        const principalBaixado = isPaid ? numVal : Math.min(r.normalized.principalBaixado, numVal);
        const saldoAtual = Math.max(0, Math.round((numVal - principalBaixado) * 100) / 100);
        const norm: BaseSpreadsheetRow = {
          ...r.normalized,
          valorOriginal: numVal,
          principalBaixado,
          saldoAtual,
          isManuallyEdited: true
        };
        const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
        return {
          ...r,
          normalized: norm,
          fingerprint: fp
        };
      }));
      summaryText = `Valor original alterado para ${formatBRL(numVal)} em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'tipo') {
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        const norm: BaseSpreadsheetRow = {
          ...r.normalized,
          tipo: bulkTipo,
          isManuallyEdited: true
        };
        const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
        return {
          ...r,
          normalized: norm,
          fingerprint: fp
        };
      }));
      summaryText = `Tipo alterado para ${bulkTipo === 'RECEBER' ? 'Receita' : 'Despesa'} em ${selectedActiveCount} lançamento(s)!`;
    } else if (bulkField === 'situacao') {
      setAnalyzedRows(prev => prev.map(r => {
        if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
        const isPaid = bulkSituacao === 'LIQUIDADO';
        const val = r.normalized.valorOriginal;
        const norm: BaseSpreadsheetRow = {
          ...r.normalized,
          situacao: bulkSituacao,
          principalBaixado: isPaid ? val : 0,
          saldoAtual: isPaid ? 0 : val,
          isManuallyEdited: true
        };
        return {
          ...r,
          normalized: norm
        };
      }));
      summaryText = `Situação alterada para ${bulkSituacao} em ${selectedActiveCount} lançamento(s)!`;
    }

    setBulkFeedbackMsg({ text: summaryText, type: 'success' });
    setTimeout(() => setBulkFeedbackMsg(null), 5000);
  };

  // Limpeza de Coluna em Massa (deixar em branco)
  const handleClearBulkField = () => {
    const selectedActiveCount = analyzedRows.filter(r => r.isSelected && r.action !== 'ERRO' && !r.isTypeFilteredOut).length;
    if (selectedActiveCount === 0) {
      alert('Nenhum lançamento ativo selecionado. Marque as caixas de seleção das linhas que deseja limpar.');
      return;
    }

    setAnalyzedRows(prev => prev.map(r => {
      if (!r.isSelected || r.action === 'ERRO' || r.isTypeFilteredOut) return r;
      const norm: BaseSpreadsheetRow = { ...r.normalized, isManuallyEdited: true };

      if (bulkField === 'titulo') norm.titulo = '';
      if (bulkField === 'descricao') norm.descricao = '';
      if (bulkField === 'competencia') norm.competencia = '';
      if (bulkField === 'fornecedor') norm.fornecedor = '';
      if (bulkField === 'dataPagamento') {
        norm.dataPagamento = undefined;
        norm.situacao = 'ABERTO';
        norm.principalBaixado = 0;
        norm.saldoAtual = norm.valorOriginal;
      }

      const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
      return { ...r, normalized: norm, fingerprint: fp };
    }));

    setBulkFeedbackMsg({ text: `Coluna "${bulkField}" limpa (deixada em branco) em ${selectedActiveCount} lançamento(s)!`, type: 'info' });
    setTimeout(() => setBulkFeedbackMsg(null), 5000);
  };

  // Alteração inline rápida da data de pagamento com quitação automática
  const handleInlinePaymentDateChange = (rowNumber: number, newDate: string) => {
    setAnalyzedRows(prev => prev.map(r => {
      if (r.rowNumber !== rowNumber) return r;

      const iso = newDate ? normalizeToISODate(newDate) : '';
      const isPaid = !!iso;
      const val = r.normalized.valorOriginal;

      const norm: BaseSpreadsheetRow = {
        ...r.normalized,
        dataPagamento: iso || undefined,
        situacao: isPaid ? 'LIQUIDADO' : (r.normalized.situacao === 'LIQUIDADO' ? 'ABERTO' : r.normalized.situacao),
        principalBaixado: isPaid ? val : 0,
        saldoAtual: isPaid ? 0 : val,
        previsaoCaixa: iso || r.normalized.vencimento,
        isManuallyEdited: true
      };

      const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);

      return {
        ...r,
        normalized: norm,
        fingerprint: fp
      };
    }));
  };

  // Edição rápida de célula inline na tabela
  const handleInlineUpdate = (rowNumber: number, field: keyof BaseSpreadsheetRow, value: any) => {
    setAnalyzedRows(prev => prev.map(r => {
      if (r.rowNumber !== rowNumber) return r;

      const norm: BaseSpreadsheetRow = {
        ...r.normalized,
        [field]: value,
        isManuallyEdited: true
      };

      if (field === 'valorOriginal') {
        const numVal = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.')) || 0;
        norm.valorOriginal = numVal;
        const isPaid = norm.situacao === 'LIQUIDADO';
        norm.principalBaixado = isPaid ? numVal : Math.min(norm.principalBaixado, numVal);
        norm.saldoAtual = Math.max(0, Math.round((numVal - norm.principalBaixado) * 100) / 100);
      }

      if (field === 'competencia') {
        norm.competencia = normalizeToCompetence(value, norm.vencimento);
      }

      if (field === 'vencimento') {
        const iso = normalizeToISODate(value);
        if (iso) {
          norm.vencimento = iso;
          if (!norm.dataPagamento) {
            norm.previsaoCaixa = iso;
          }
        }
      }

      const fp = generateTitleFingerprint(norm.tipo, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);

      const errors: string[] = [];
      if (!norm.vencimento) errors.push('Data de vencimento ausente ou inválida');
      if (norm.valorOriginal <= 0) errors.push('Valor original deve ser superior a R$ 0,00');
      if (!norm.fornecedor) errors.push('Contraparte não informada');

      const action: ImportDiffAction = errors.length > 0 
        ? 'ERRO' 
        : (r.action === 'ERRO' || r.action === 'IGNORAR_IDENTICO')
          ? (r.existingTitle ? 'ATUALIZAR' : 'CRIAR')
          : r.action;

      return {
        ...r,
        normalized: norm,
        fingerprint: fp,
        errors,
        action,
        isSelected: action !== 'ERRO' ? r.isSelected : false
      };
    }));
  };

  // Métricas do Preview (Step 3)
  const previewMetrics = useMemo(() => {
    const total = analyzedRows.length;
    const safeRows = analyzedRows.filter(r => r && r.normalized);
    const toCreate = safeRows.filter(r => r.action === 'CRIAR' && r.isSelected).length;
    const toUpdate = safeRows.filter(r => r.action === 'ATUALIZAR' && r.isSelected).length;
    const ignored = safeRows.filter(r => r.action === 'IGNORAR_IDENTICO').length;
    const errors = safeRows.filter(r => r.action === 'ERRO').length;
    const memoryCount = safeRows.filter(r => r.isFromMemory && !r.isTypeFilteredOut).length;
    const filteredOutCount = safeRows.filter(r => r.isTypeFilteredOut).length;
    const manualCategoryCount = safeRows.filter(r => !r.isFromMemory && !r.isTypeFilteredOut && r.action !== 'ERRO').length;
    const installmentCount = safeRows.filter(r => r.isInstallment && !r.isTypeFilteredOut && r.action !== 'ERRO').length;
    const docValidatedCount = safeRows.filter(r => r.documentValidation?.isValid && !r.isTypeFilteredOut && r.action !== 'ERRO').length;
    
    const selectedActive = safeRows.filter(r => r.isSelected && r.action !== 'ERRO' && !r.isTypeFilteredOut);
    const totalReceivables = selectedActive
      .filter(r => r.normalized?.tipo === 'RECEBER')
      .reduce((acc, r) => acc + (typeof r.normalized?.valorOriginal === 'number' && !isNaN(r.normalized.valorOriginal) ? r.normalized.valorOriginal : 0), 0);

    const totalPayables = selectedActive
      .filter(r => r.normalized?.tipo === 'PAGAR')
      .reduce((acc, r) => acc + (typeof r.normalized?.valorOriginal === 'number' && !isNaN(r.normalized.valorOriginal) ? r.normalized.valorOriginal : 0), 0);

    const paidValue = selectedActive.reduce((acc, r) => acc + (typeof r.normalized?.principalBaixado === 'number' && !isNaN(r.normalized.principalBaixado) ? r.normalized.principalBaixado : 0), 0);

    return { 
      total, 
      toCreate, 
      toUpdate, 
      ignored, 
      errors, 
      memoryCount,
      filteredOutCount,
      manualCategoryCount,
      installmentCount,
      docValidatedCount,
      totalReceivables, 
      totalPayables, 
      netBalance: totalReceivables - totalPayables,
      paidValue 
    };
  }, [analyzedRows]);

  // Linhas filtradas para exibição no Step 3 (por status, tipo, mês e categoria)
  const displayedRows = useMemo(() => {
    return analyzedRows.filter(r => {
      if (!r || !r.normalized) return false;

      // Filtro por Mês seguro
      if (selectedMonth !== 'ALL') {
        const rowMonth = getRowMonthKey(r.normalized);
        if (rowMonth !== selectedMonth) return false;
      }

      // Filtro por Status
      if (filterAction !== 'TODOS' && r.action !== filterAction) {
        return false;
      }

      // Filtro por Tipo (Receita vs Despesa)
      if (filterType !== 'TODOS' && r.normalized.tipo !== filterType) {
        return false;
      }

      // Filtro por Categoria / Memória IA
      if (filterCategoryMode === 'MEMORIA' && !r.isFromMemory) {
        return false;
      }
      if (filterCategoryMode === 'MANUAL' && (r.isFromMemory || r.isTypeFilteredOut)) {
        return false;
      }
      if (filterCategoryMode === 'FILTRADOS_SINAL' && !r.isTypeFilteredOut) {
        return false;
      }

      // Filtro para Ver Apenas Duplicadas Internas no Próprio Arquivo
      if (filterDuplicatesOnly && !r.isInternalDuplicate) {
        return false;
      }

      // Filtro para Ver Apenas Lançamentos Parcelados
      if (filterInstallmentsOnly && !r.isInstallment) {
        return false;
      }

      return true;
    });
  }, [analyzedRows, filterAction, filterType, selectedMonth, filterCategoryMode, filterDuplicatesOnly, filterInstallmentsOnly]);

  // Toggle seleção individual
  const toggleRow = (rowNumber: number) => {
    setAnalyzedRows(prev => prev.map(r => r.rowNumber === rowNumber ? { ...r, isSelected: !r.isSelected } : r));
  };

  const toggleAll = (selected: boolean) => {
    setAnalyzedRows(prev => prev.map(r => {
      if (r.action === 'ERRO' || r.action === 'IGNORAR_IDENTICO') return r;
      // Se tiver filtro de mês ou tipo, aplica apenas aos visíveis
      const isVisible = displayedRows.some(d => d.rowNumber === r.rowNumber);
      return isVisible ? { ...r, isSelected: selected } : r;
    }));
  };

  // Ações de Lote no Mês
  const handleApproveMonth = (monthKey: string) => {
    setAnalyzedRows(prev => prev.map(r => {
      const rowMonth = getRowMonthKey(r?.normalized);
      if (monthKey === 'ALL' || rowMonth === monthKey) {
        if (r.action !== 'ERRO') return { ...r, isSelected: true };
      }
      return r;
    }));
  };

  const handleDeselectMonth = (monthKey: string) => {
    setAnalyzedRows(prev => prev.map(r => {
      const rowMonth = getRowMonthKey(r?.normalized);
      if (monthKey === 'ALL' || rowMonth === monthKey) {
        return { ...r, isSelected: false };
      }
      return r;
    }));
  };

  const handleSetMonthType = (monthKey: string, newType: 'RECEBER' | 'PAGAR') => {
    setAnalyzedRows(prev => prev.map(r => {
      const rowMonth = getRowMonthKey(r?.normalized);
      if (monthKey === 'ALL' || rowMonth === monthKey) {
        const norm = { ...r.normalized, tipo: newType, isManuallyEdited: true };
        const newFingerprint = generateTitleFingerprint(newType, norm.titulo, norm.fornecedor, norm.vencimento, norm.valorOriginal);
        return {
          ...r,
          normalized: norm,
          fingerprint: newFingerprint,
          matchedChartAccountId: newType === 'RECEBER' ? fallbackRevenueAccountId : fallbackExpenseAccountId
        };
      }
      return r;
    }));
  };

  // Adicionar Coluna Extra
  const handleAddExtraColumn = (col: ExtraColumnDefinition) => {
    setExtraColumns(prev => [...prev, col]);
    // Atualiza imediatamente as linhas analisadas capturando os dados brutos dessa coluna
    setAnalyzedRows(prev => prev.map(r => {
      const rawVal = r.raw[col.sourceHeader];
      const custom = { ...(r.normalized.customFields || {}), [col.id]: rawVal };
      return {
        ...r,
        normalized: {
          ...r.normalized,
          customFields: custom
        }
      };
    }));
  };

  // Atualização após criação de entidades via Modal de Cruzamento
  const handleRefreshEntities = () => {
    const existingTitles = storage.getTitles();
    const currentCounterparties = storage.getCounterparties();
    const currentAccounts = storage.getChartAccounts();

    // Re-analisa com novos cadastros
    const reAnalyzed = analyzeContaAzulSpreadsheet(
      rawSheetData,
      availableHeaders,
      mapping as any,
      existingTitles,
      currentCounterparties,
      currentAccounts,
      fallbackExpenseAccountId,
      fallbackRevenueAccountId,
      typeDetectionMode,
      extraColumns,
      fallbackDefaultType
    );

    // Preserva edições manuais prévias realizadas pelo usuário
    const preserved = reAnalyzed.map(newRow => {
      const prevRow = analyzedRows.find(pr => pr.rowNumber === newRow.rowNumber);
      if (!prevRow) return newRow;
      if (prevRow.normalized.isManuallyEdited) {
        return {
          ...newRow,
          normalized: prevRow.normalized,
          fingerprint: prevRow.fingerprint,
          matchedCounterpartyId: prevRow.matchedCounterpartyId || newRow.matchedCounterpartyId,
          matchedChartAccountId: prevRow.matchedChartAccountId || newRow.matchedChartAccountId,
          action: prevRow.action === 'ERRO' && newRow.action !== 'ERRO' ? newRow.action : prevRow.action,
          isSelected: prevRow.isSelected
        };
      }
      return {
        ...newRow,
        isSelected: prevRow.action === 'ERRO' && newRow.action !== 'ERRO' ? true : prevRow.isSelected
      };
    });

    setAnalyzedRows(preserved);
  };

  // -------------------------------------------------------------
  // Step 3 -> 4: Execução da Gravação Transacional Idempotente
  // -------------------------------------------------------------
  const handleExecuteImport = () => {
    const selectedRows = analyzedRows.filter(r => r.isSelected && r.action !== 'ERRO');
    if (selectedRows.length === 0) {
      alert('Nenhuma linha elegível selecionada para importação.');
      return;
    }

    setIsImporting(true);

    try {
      const currentTitles = storage.getTitles();
      const currentCounterparties = storage.getCounterparties();
      const currentSettlements = storage.getSettlements();
      const currentMovements = storage.getMovements();
      const currentUser = storage.getCurrentUser();
      const nowIso = new Date().toISOString();

      let createdCount = 0;
      let updatedCount = 0;
      let settledCount = 0;
      let newPartiesCount = 0;
      let receivablesCount = 0;
      let payablesCount = 0;
      let totalReceivables = 0;
      let totalPayables = 0;

      const updatedTitlesList = [...currentTitles];
      const newSettlements: Settlement[] = [];
      const newMovements: FinancialMovement[] = [];
      const createdTitleIds: string[] = [];
      const updatedTitleIds: string[] = [];

      // Mapeamento de contrapartes novas criadas nesta execução para reaproveitamento
      const createdPartyMap: Record<string, string> = {};

      for (const row of selectedRows) {
        const isRevenue = row.normalized.tipo === 'RECEBER';
        if (isRevenue) {
          receivablesCount++;
          totalReceivables += row.normalized.valorOriginal;
        } else {
          payablesCount++;
          totalPayables += row.normalized.valorOriginal;
        }

        // 1. Resolução da Contraparte (Cliente para Receita, Fornecedor para Despesa)
        let resolvedPartyId = row.matchedCounterpartyId;
        const override = partyOverrides[row.rowNumber];

        if (override?.action === 'USE_EXISTING' && override.partyId) {
          resolvedPartyId = override.partyId;
        } else if (override?.action === 'CREATE_NEW' || (!resolvedPartyId && row.counterpartyResolution === 'NOVO_SOLICITADO')) {
          const normName = row.normalized.fornecedor.trim();
          if (createdPartyMap[normName]) {
            resolvedPartyId = createdPartyMap[normName];
          } else {
            const newPartyId = `cp-imp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
            const validatedDocStr = row.documentValidation?.isValid 
              ? row.documentValidation.formatted 
              : (row.normalized.documento || '00.000.000/0000-00');

            const newParty: Counterparty = {
              id: newPartyId,
              type: isRevenue ? 'CLIENTE' : 'FORNECEDOR',
              name: normName,
              tradeName: normName,
              document: validatedDocStr,
              email: `contato@${normName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'empresa'}.com.br`,
              phone: '(11) 99999-0000',
              status: 'ATIVO',
              notes: `Cadastrado na importação de planilha (${fileName}) como ${isRevenue ? 'Cliente' : 'Fornecedor'}.`,
              createdAt: nowIso
            };
            currentCounterparties.push(newParty);
            createdPartyMap[normName] = newPartyId;
            resolvedPartyId = newPartyId;
            newPartiesCount++;
          }
        } else if (!resolvedPartyId && row.suggestedCounterpartyId) {
          resolvedPartyId = row.suggestedCounterpartyId;
        }

        if (!resolvedPartyId) {
          resolvedPartyId = counterparties[0]?.id || 'cp-1';
        }

        // 2. Classificação / Plano de Contas e Banco
        const defaultAccountForType = isRevenue ? fallbackRevenueAccountId : fallbackExpenseAccountId;
        const accountId = row.matchedChartAccountId || defaultAccountForType;
        const expectedBankId = fallbackBankAccountId;

        if (row.action === 'CRIAR') {
          // Criação de Novo Título
          const titleId = `tit-imp-${Date.now()}-${row.rowNumber}-${Math.floor(Math.random() * 1000)}`;
          createdTitleIds.push(titleId);

          const rawBaixado = row.normalized.principalBaixado || 0;
          const valOriginal = row.normalized.valorOriginal || 0;
          let principalReal = rawBaixado;
          let encargosJuros = 0;
          let descontoFinanceiro = 0;

          // Detecção Automática de Juros/Multas nas Quitações com Acréscimo OU Desconto Financeiro
          if (valOriginal > 0 && rawBaixado > (valOriginal + 0.01)) {
            encargosJuros = Math.round((rawBaixado - valOriginal) * 100) / 100;
            principalReal = valOriginal;
          } else if (valOriginal > 0 && rawBaixado > 0 && rawBaixado < (valOriginal - 0.01) && (row.normalized.situacao === 'LIQUIDADO' || row.normalized.saldoAtual === 0)) {
            descontoFinanceiro = Math.round((valOriginal - rawBaixado) * 100) / 100;
            principalReal = valOriginal;
          }

          const newTitle: FinancialTitle = {
            id: titleId,
            companyId: 'comp-1',
            type: row.normalized.tipo,
            titleNumber: row.normalized.titulo,
            externalId: row.externalId,
            fingerprint: row.fingerprint,
            importSource: selectedPreset === 'PLANILHA_BASE' ? 'PLANILHA_BASE' : 'CONTA_AZUL',
            categoryName: row.normalized.categoria,
            customFields: row.normalized.customFields,
            counterpartyId: resolvedPartyId,
            description: row.normalized.descricao,
            accountId,
            installmentIndex: row.installmentInfo?.current,
            totalInstallments: row.installmentInfo?.total,
            launchDate: nowIso.split('T')[0],
            competence: row.normalized.competencia,
            issueDate: row.normalized.emissao,
            dueDate: row.normalized.vencimento,
            expectedCashDate: row.normalized.previsaoCaixa,
            originalAmount: valOriginal,
            settledPrincipal: principalReal,
            balancePrincipal: Math.max(0, valOriginal - principalReal),
            accruedInterest: encargosJuros,
            accruedFine: 0,
            documentState: row.normalized.situacao === 'CANCELADO' ? 'CANCELADO' : 'CONFIRMADO',
            settlementState: row.normalized.situacao === 'LIQUIDADO' ? 'LIQUIDADO' : row.normalized.situacao === 'PARCIAL' ? 'PARCIAL' : 'ABERTO',
            originType: 'MANUAL',
            expectedBankAccountId: expectedBankId,
            notes: encargosJuros > 0
              ? `Importado de planilha (${fileName}). Título: ${row.normalized.titulo}. [Quitação com acréscimo: R$ ${formatBRL(principalReal)} principal + R$ ${formatBRL(encargosJuros)} juros/multa].`
              : descontoFinanceiro > 0
              ? `Importado de planilha (${fileName}). Título: ${row.normalized.titulo}. [Quitação com desconto: R$ ${formatBRL(valOriginal)} quitado com abatimento de R$ ${formatBRL(descontoFinanceiro)} (Líquido: R$ ${formatBRL(rawBaixado)})].`
              : `Importado de planilha (${fileName}). Título: ${row.normalized.titulo}.`,
            createdAt: nowIso,
            updatedAt: nowIso
          };

          updatedTitlesList.unshift(newTitle);
          createdCount++;

          // Se já possui baixa de principal, registra Settlement e Movimento Bancário
          if (rawBaixado > 0) {
            settledCount++;
            const settlementId = `set-imp-${Date.now()}-${row.rowNumber}`;
            const settlementDate = row.normalized.dataPagamento || row.normalized.previsaoCaixa || row.normalized.vencimento;

            newSettlements.push({
              id: settlementId,
              titleId,
              settlementNumber: `BX-IMP-${Math.floor(Math.random() * 90000 + 10000)}`,
              settlementDate,
              bankAccountId: expectedBankId,
              components: {
                principalSettled: principalReal,
                discount: descontoFinanceiro,
                interest: encargosJuros,
                fine: 0,
                bankFee: 0,
                netFinancialAmount: rawBaixado
              },
              notes: encargosJuros > 0
                ? `Baixa com acréscimo importada (${fileName}). Principal: R$ ${formatBRL(principalReal)} + Juros/Multa: R$ ${formatBRL(encargosJuros)}.`
                : descontoFinanceiro > 0
                ? `Baixa com desconto importada (${fileName}). Principal amortizado: R$ ${formatBRL(valOriginal)} - Desconto: R$ ${formatBRL(descontoFinanceiro)} (Líquido: R$ ${formatBRL(rawBaixado)}).`
                : `Baixa importada (${fileName}).`,
              isReversed: false,
              createdAt: nowIso,
              createdBy: currentUser.name
            });

            newMovements.push({
              id: `mov-imp-${Date.now()}-${row.rowNumber}`,
              bankAccountId: expectedBankId,
              date: settlementDate,
              direction: isRevenue ? 'ENTRADA' : 'SAIDA',
              amount: rawBaixado,
              originType: 'BAIXA_TITULO',
              originReferenceId: settlementId,
              description: encargosJuros > 0
                ? `Baixa importada ${row.normalized.titulo} - ${row.normalized.fornecedor} (Principal: R$ ${formatBRL(principalReal)} + Juros/Multa: R$ ${formatBRL(encargosJuros)})`
                : descontoFinanceiro > 0
                ? `Baixa com desconto importada ${row.normalized.titulo} - ${row.normalized.fornecedor} (Total: R$ ${formatBRL(valOriginal)} com Desconto: R$ ${formatBRL(descontoFinanceiro)})`
                : `Baixa importada ${row.normalized.titulo} - ${row.normalized.fornecedor}`,
              counterpartyId: resolvedPartyId,
              accountId,
              cashFlowCategory: 'OPERACIONAL',
              createdAt: nowIso
            });
          }
        } else if (row.action === 'ATUALIZAR' && row.existingTitle) {
          // Atualização de Título Existente (Diff confirmado)
          const idx = updatedTitlesList.findIndex(t => t.id === row.existingTitle?.id);
          if (idx !== -1) {
            const currentT = updatedTitlesList[idx];
            const updatedT: FinancialTitle = {
              ...currentT,
              type: row.normalized.tipo,
              externalId: row.externalId,
              fingerprint: row.fingerprint,
              categoryName: row.normalized.categoria || currentT.categoryName,
              customFields: { ...(currentT.customFields || {}), ...(row.normalized.customFields || {}) },
              competence: row.normalized.competencia,
              dueDate: row.normalized.vencimento,
              expectedCashDate: row.normalized.previsaoCaixa,
              originalAmount: row.normalized.valorOriginal,
              settledPrincipal: row.normalized.principalBaixado,
              balancePrincipal: row.normalized.saldoAtual,
              settlementState: row.normalized.situacao === 'LIQUIDADO' ? 'LIQUIDADO' : row.normalized.situacao === 'PARCIAL' ? 'PARCIAL' : 'ABERTO',
              documentState: row.normalized.situacao === 'CANCELADO' ? 'CANCELADO' : 'CONFIRMADO',
              updatedAt: nowIso,
              notes: `${currentT.notes || ''} [Atualizado via importação ${fileName} em ${nowIso.split('T')[0]}]`
            };

            updatedTitlesList[idx] = updatedT;
            updatedCount++;
            updatedTitleIds.push(currentT.id);

            // Se o principal baixado aumentou, registra a baixa complementar separando acréscimo
            if (row.normalized.principalBaixado > currentT.settledPrincipal) {
              const diffTotal = row.normalized.principalBaixado - currentT.settledPrincipal;
              const remainingPrincipal = Math.max(0, currentT.originalAmount - currentT.settledPrincipal);
              const compPrincipal = Math.min(diffTotal, remainingPrincipal);
              const compInterest = Math.max(0, Math.round((diffTotal - compPrincipal) * 100) / 100);

              const isSettledWithDiscount = (row.normalized.situacao === 'LIQUIDADO' || row.normalized.saldoAtual === 0) && row.normalized.principalBaixado < (row.normalized.valorOriginal - 0.01);
              const compDiscount = isSettledWithDiscount ? Math.max(0, Math.round((row.normalized.valorOriginal - row.normalized.principalBaixado) * 100) / 100) : 0;

              settledCount++;
              const settlementId = `set-imp-upd-${Date.now()}-${row.rowNumber}`;
              const settlementDate = row.normalized.dataPagamento || row.normalized.previsaoCaixa || row.normalized.vencimento;

              newSettlements.push({
                id: settlementId,
                titleId: currentT.id,
                settlementNumber: `BX-UPD-${Math.floor(Math.random() * 90000 + 10000)}`,
                settlementDate,
                bankAccountId: currentT.expectedBankAccountId || expectedBankId,
                components: {
                  principalSettled: compPrincipal,
                  discount: compDiscount,
                  interest: compInterest,
                  fine: 0,
                  bankFee: 0,
                  netFinancialAmount: diffTotal
                },
                notes: compInterest > 0
                  ? `Baixa complementar com juros/multa (${fileName}). Principal: R$ ${formatBRL(compPrincipal)} + Encargos: R$ ${formatBRL(compInterest)}.`
                  : compDiscount > 0
                  ? `Baixa complementar com desconto (${fileName}). Principal: R$ ${formatBRL(compPrincipal)} - Desconto: R$ ${formatBRL(compDiscount)}.`
                  : `Baixa atualizada via reimportação (${fileName}).`,
                isReversed: false,
                createdAt: nowIso,
                createdBy: currentUser.name
              });

              newMovements.push({
                id: `mov-imp-upd-${Date.now()}-${row.rowNumber}`,
                bankAccountId: currentT.expectedBankAccountId || expectedBankId,
                date: settlementDate,
                direction: isRevenue ? 'ENTRADA' : 'SAIDA',
                amount: diffTotal,
                originType: 'BAIXA_TITULO',
                originReferenceId: settlementId,
                description: compInterest > 0
                  ? `Baixa complementar importada ${row.normalized.titulo} - ${row.normalized.fornecedor} (inclui R$ ${formatBRL(compInterest)} juros/multa)`
                  : `Baixa complementar importada ${row.normalized.titulo} - ${row.normalized.fornecedor}`,
                counterpartyId: resolvedPartyId,
                accountId,
                cashFlowCategory: 'OPERACIONAL',
                createdAt: nowIso
              });
            }
          }
        }
      }

      // Persistência Transacional
      storage.saveCounterparties(currentCounterparties);
      storage.saveTitles(updatedTitlesList);
      if (newSettlements.length > 0) {
        storage.saveSettlements([...newSettlements, ...currentSettlements]);
      }
      if (newMovements.length > 0) {
        storage.saveMovements([...newMovements, ...currentMovements]);
      }

      // Aprendizado Contínuo com os dados confirmados pelo usuário
      try {
        const rowsToLearn = selectedRows.map(r => {
          const acc = chartAccounts.find(a => a.id === r.matchedChartAccountId);
          return {
            fornecedor: r.normalized.fornecedor,
            descricao: r.normalized.descricao,
            tipo: r.normalized.tipo,
            chartAccountId: r.matchedChartAccountId || '',
            chartAccountName: acc?.name || r.normalized.categoria || ''
          };
        }).filter(r => r.chartAccountId && r.chartAccountName);

        categoryLearningService.learnBatch(rowsToLearn);
      } catch (e) {
        console.warn('Falha ao gravar aprendizado de categorias:', e);
      }

      // Memoriza modelo de colunas automaticamente para próximas importações
      try {
        saveMappingTemplate(mapping, availableHeaders, extraColumns);
      } catch (e) {
        console.warn('Falha ao memorizar template de mapeamento:', e);
      }

      // Registro de Auditoria
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CRIACAO_TITULO',
        module: 'Mapeamento Conta Azul -> Planilha-Base',
        recordId: `import-${Date.now()}`,
        details: `Importação transacional de ${selectedRows.length} títulos da planilha "${fileName}". ${createdCount} criados (${receivablesCount} receitas, ${payablesCount} despesas), ${updatedCount} atualizados, ${settledCount} baixas e ${newPartiesCount} novas contrapartes cadastradas.`
      });

      if (newPartiesCount > 0) {
        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'CADASTRO_FORNECEDOR',
          module: 'Cadastros & Contrapartes',
          recordId: `cp-batch-${Date.now()}`,
          details: `Cadastro automático de ${newPartiesCount} novas contrapartes (clientes/fornecedores) identificadas e aprovadas na importação da planilha "${fileName}".`
        });
      }

      // Gravação no Histórico de Auditoria com Suporte a Rollback
      try {
        const batchLog: ImportAuditLog = {
          id: `batch-${Date.now()}`,
          importedAt: nowIso,
          fileName: fileName || 'Planilha Importada',
          presetName: selectedPreset,
          user: currentUser.name || 'Administrador',
          totalRows: selectedRows.length,
          createdCount,
          updatedCount,
          settledCount,
          totalAmountReceivables: totalReceivables,
          totalAmountPayables: totalPayables,
          createdTitleIds,
          updatedTitleIds,
          createdPartyIds: Object.values(createdPartyMap)
        };
        importAuditService.saveLog(batchLog);
        setAuditLogs(importAuditService.getLogs());
      } catch (e) {
        console.warn('Erro ao salvar lote no histórico de importação:', e);
      }

      setImportSummary({
        createdCount,
        updatedCount,
        ignoredCount: previewMetrics.ignored,
        settledCount,
        newPartiesCount,
        receivablesCount,
        payablesCount,
        totalReceivables,
        totalPayables
      });

      setStep(4);
    } catch (err) {
      console.error('Erro na gravação transacional:', err);
      alert('Ocorreu um erro durante a gravação dos dados importados. Verifique o console.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in ${
      isFullscreen ? 'p-0' : 'p-1 sm:p-2 md:p-3'
    }`}>
      <div className={`bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xl w-full flex flex-col overflow-hidden text-[var(--text-primary)] transition-all duration-200 ${
        isFullscreen
          ? 'w-screen h-screen max-w-[100vw] max-h-[100vh] rounded-none'
          : step === 3
            ? 'max-w-[99vw] 2xl:max-w-[1850px] max-h-[96vh] h-[95vh] rounded-2xl'
            : 'max-w-6xl max-h-[96vh] h-[95vh] rounded-2xl'
      }`}>
        
        {/* Modal Top Header */}
        <div className="p-3 sm:p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                  Importação de Planilhas: Receitas & Despesas
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Separação por Mês & Cruzamento Cadastral
                </span>
                {isFullscreen && (
                  <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    Modo Tela Inteira
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Mapeamento flexível, resumos mensais em tempo real, edição inline antes da aprovação e campos personalizados.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => {
                setAuditLogs(importAuditService.getLogs());
                setShowAuditHistoryModal(true);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
              title="Visualizar histórico de importações realizadas e reverter lotes com segurança"
            >
              <History className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Histórico de Auditoria</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Restaurar tamanho de janela' : 'Expandir para Tela Inteira (evitar cortes de colunas)'}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-amber-400 hover:bg-[var(--surface-card)] transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors cursor-pointer"
              title="Fechar importador"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Stepper Wizard Progress Bar */}
        <div className="px-5 py-2.5 bg-[var(--surface-card)] border-b border-[var(--border-subtle)] flex items-center justify-between text-xs font-semibold shrink-0">
          <div className="flex items-center space-x-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 1 ? 'bg-amber-400 text-[#18181b]' : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
            }`}>
              1
            </span>
            <span className={step === 1 ? 'text-amber-400 font-bold' : 'text-[var(--text-secondary)]'}>
              Arquivo & Preset
            </span>
          </div>

          <div className="h-0.5 flex-1 max-w-[50px] bg-[var(--border-subtle)] mx-2" />

          <div className="flex items-center space-x-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 2 ? 'bg-amber-400 text-[#18181b]' : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
            }`}>
              2
            </span>
            <span className={step === 2 ? 'text-amber-400 font-bold' : 'text-[var(--text-secondary)]'}>
              Mapeamento de Colunas
            </span>
          </div>

          <div className="h-0.5 flex-1 max-w-[50px] bg-[var(--border-subtle)] mx-2" />

          <div className="flex items-center space-x-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 3 ? 'bg-amber-400 text-[#18181b]' : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
            }`}>
              3
            </span>
            <span className={step === 3 ? 'text-amber-400 font-bold' : 'text-[var(--text-secondary)]'}>
              Conferência de Categorias & Memória IA
            </span>
          </div>

          <div className="h-0.5 flex-1 max-w-[50px] bg-[var(--border-subtle)] mx-2" />

          <div className="flex items-center space-x-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step === 4 ? 'bg-emerald-400 text-[#18181b]' : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)]'
            }`}>
              4
            </span>
            <span className={step === 4 ? 'text-emerald-400 font-bold' : 'text-[var(--text-secondary)]'}>
              Importação Concluída
            </span>
          </div>
        </div>

        {/* Modal Body Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

          {/* ========================================================= */}
          {/* STEP 1: UPLOAD & PRESET SELECTION */}
          {/* ========================================================= */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Presets Grid */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center">
                  <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  Origem do Arquivo / Formato da Planilha:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'CONTA_AZUL', name: 'Conta Azul', desc: 'Mapeamento automático de receitas e despesas' },
                    { id: 'PLANILHA_BASE', name: 'Planilha-Base Anual', desc: 'Modelo operacional unificado' },
                    { id: 'CONTAJU', name: 'Modelo ContaJu', desc: 'Template com plano de contas integrado' },
                    { id: 'CUSTOM', name: 'Personalizado', desc: 'Mapeamento flexível de qualquer layout' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPreset(p.id as any)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selectedPreset === p.id
                          ? 'bg-amber-500/15 border-amber-400 text-amber-300 shadow-xs'
                          : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-amber-500/40'
                      }`}
                    >
                      <p className="font-bold text-xs text-[var(--text-primary)]">{p.name}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload Drag & Drop Box */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileUpload(e.dataTransfer.files[0]);
                  }
                }}
                className={`p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                  isDragOver 
                    ? 'border-amber-400 bg-amber-500/10 scale-[0.99]' 
                    : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:border-amber-500/50 hover:bg-[var(--surface-card)]'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />

                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3">
                  <Upload className="w-7 h-7" />
                </div>

                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  Arraste e solte sua planilha aqui, ou clique para selecionar
                </h3>
                <p className="text-xs text-[var(--text-secondary)] max-w-sm">
                  Formatos suportados: .xlsx, .xls e .csv. Planilhas com Contas a Pagar, Contas a Receber ou ambas unificadas anualmente.
                </p>
              </div>

              {/* Modelos Oficiais para Download */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">
                        Planilha-Base Anual (Receitas & Despesas)
                      </h4>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        Template oficial com múltiplos meses, colunas de tipo, saldos e centro de custo.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadBaseSpreadsheetTemplate(XLSX)}
                    className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center transition-colors shrink-0 ml-2"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Baixar Modelo
                  </button>
                </div>

                <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">
                        Exemplo Anual Exportado Conta Azul
                      </h4>
                      <p className="text-[10px] text-[var(--text-secondary)]">
                        Demonstração com múltiplos meses e lançamentos de receitas e despesas.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadContaAzulSampleTemplate(XLSX)}
                    className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-blue-400 border border-blue-500/30 rounded-lg text-xs font-bold flex items-center transition-colors shrink-0 ml-2"
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Baixar Exemplo
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 2: COLUMN MAPPING & REVENUE/EXPENSE CONFIG */}
          {/* ========================================================= */}
          {step === 2 && (
            <div className="space-y-5">
              {/* File Info Bar */}
              <div className="bg-[var(--surface-elevated)] p-3.5 rounded-xl border border-[var(--border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-[var(--text-primary)]">{fileName}</span>
                  <span className="text-xs text-[var(--text-secondary)]">({rawSheetData.length} linhas detectadas)</span>
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-xs text-[var(--text-secondary)] font-semibold">Perfil de Mapeamento:</span>
                  
                  {/* Dropdown de Modelos do Sistema e Meus Perfis Salvos */}
                  <PremiumSelect
                    value={selectedProfileId ? `custom:${selectedProfileId}` : selectedPreset}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('custom:')) {
                        const profId = val.replace('custom:', '');
                        handleApplyCustomProfile(profId);
                      } else {
                        setSelectedProfileId('');
                        applyPresetMapping(availableHeaders, val as any);
                      }
                    }}
                    aria-label="Perfil de mapeamento"
                    className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-card)] border border-amber-500/40 text-xs font-bold text-amber-400 focus:outline-hidden cursor-pointer"
                  >
                    <optgroup label="Modelos Padrão do Sistema">
                      <option value="CONTA_AZUL">Conta Azul (Recomendado)</option>
                      <option value="PLANILHA_BASE">Planilha-Base Anual</option>
                      <option value="CONTAJU">Modelo ContaJu</option>
                      <option value="CUSTOM">Personalizado (Manual)</option>
                    </optgroup>

                    {customProfiles.length > 0 && (
                      <optgroup label="Meus Perfis Salvos">
                        {customProfiles.map(p => (
                          <option key={p.id} value={`custom:${p.id}`}>
                            ⭐ {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </PremiumSelect>

                  {/* Botão para Salvar Novo Perfil Customizado */}
                  <button
                    type="button"
                    onClick={() => {
                      setNewProfileName('');
                      setShowSaveProfileModal(true);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    title="Salvar o mapeamento atual com um nome personalizado para carregar em futuras importações em 1 clique"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>Salvar Como Novo Perfil...</span>
                  </button>

                  {/* Botão de Excluir Perfil Customizado */}
                  {selectedProfileId && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomProfile(selectedProfileId)}
                      className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs transition-colors cursor-pointer"
                      title="Excluir este perfil personalizado salvo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Configuração de Separação de Receitas e Despesas */}
              <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center">
                    <TrendingUp className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                    Separação Inteligente: Receitas vs. Despesas
                  </h4>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Define como o sistema classifica cada linha da planilha
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                      Método de Identificação de Tipo:
                    </label>
                    <PremiumSelect
                      value={typeDetectionMode}
                      onChange={e => setTypeDetectionMode(e.target.value as TypeDetectionMode)}
                      className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-amber-400 focus:border-amber-400 focus:outline-hidden"
                    >
                      <option value="AUTO">Automático (Coluna Tipo / Palavras-chave / Sinais)</option>
                      <option value="SIGNAL_BASED">Baseado em Sinal (+ Receitas / - Despesas)</option>
                      <option value="FORCE_PAYABLE">Forçar todas como Contas a Pagar (Despesas)</option>
                      <option value="FORCE_RECEIVABLE">Forçar todas como Contas a Receber (Receitas)</option>
                    </PremiumSelect>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                      Classificação Fallback (quando não identificado na linha):
                    </label>
                    <PremiumSelect
                      value={fallbackDefaultType}
                      onChange={e => setFallbackDefaultType(e.target.value as TitleType)}
                      className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                    >
                      <option value="PAGAR">Contas a Pagar (Despesa / Fornecedor)</option>
                      <option value="RECEBER">Contas a Receber (Receita / Cliente)</option>
                    </PremiumSelect>
                  </div>
                </div>

                {/* Conta Bancária para Quitações */}
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <div className="max-w-xs">
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                      Conta Bancária Padrão (para baixas de liquidação):
                    </label>
                    <PremiumSelect
                      value={fallbackBankAccountId}
                      onChange={e => setFallbackBankAccountId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium text-[var(--text-primary)] focus:outline-hidden"
                    >
                      {bankAccounts.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.institution})
                        </option>
                      ))}
                    </PremiumSelect>
                  </div>
                </div>
              </div>

              {/* Barra de Ações Rápidas de Mapeamento & Modelo Memorizado */}
              <div className="bg-[var(--surface-card)] p-3.5 rounded-xl border border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black">
                    💾
                  </span>
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Modelo & Inteligência de Colunas
                    </span>
                    <p className="text-[10px] text-[var(--text-secondary)]">
                      Memorize o cabeçalho desta planilha para preenchimento automático nas próximas importações
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplySavedTemplate}
                    className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Preencher mapeamento usando o modelo gravado anteriormente"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>⚡ Restaurar Modelo Salvo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveCurrentMappingTemplate}
                    className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Gravar este mapeamento como modelo padrão no navegador"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>💾 Memorizar este Mapeamento</span>
                  </button>
                </div>
              </div>

              {savedTemplateBanner && (
                <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{savedTemplateBanner}</span>
                </div>
              )}

              {/* Tabela de Mapeamento Canônico */}
              <div className="bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                <div className="p-3 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      Mapeamento de Cabeçalhos da Planilha
                    </span>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                      Vincule as colunas do seu arquivo aos campos do sistema. Inclui coluna para Data de Pagamento / Baixa!
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddColumnModal(true)}
                    className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    + Adicionar Coluna Extra da Planilha
                  </button>
                </div>

                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] bg-[var(--surface-card)] sticky top-0 z-10">
                        <th className="py-2.5 px-4 w-52">Campo no Sistema</th>
                        <th className="py-2.5 px-4 w-72">Coluna na Planilha Importada</th>
                        <th className="py-2.5 px-4">Regra de Tratamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {[
                        { key: 'tipo', label: 'Tipo / Operação', req: false, treatment: 'Receita vs. Despesa (crédito/débito, entrada/saída)' },
                        { key: 'titulo', label: 'Título / Referência', req: false, treatment: 'Identificador único ou gerado automaticamente' },
                        { key: 'fornecedor', label: 'Fornecedor / Cliente', req: true, treatment: 'Cruzamento com clientes/fornecedores cadastrados' },
                        { key: 'documento', label: 'CPF / CNPJ (Documento Fiscal)', req: false, isHighlight: true, treatment: 'Validação matemática (módulo 11), vínculo automático em lote e unificação cadastral' },
                        { key: 'descricao', label: 'Descrição', req: false, treatment: 'Histórico descritivo do lançamento' },
                        { key: 'categoria', label: 'Categoria / DRE', req: false, treatment: 'Cruzamento com Plano de Contas analítico' },
                        { key: 'competencia', label: 'Competência', req: false, treatment: 'Formato AAAA-MM para relatórios mensais' },
                        { key: 'emissao', label: 'Data de Emissão', req: false, treatment: 'Data do documento contábil' },
                        { key: 'vencimento', label: 'Data de Vencimento', req: true, treatment: 'Data limite para pagamento ou recebimento' },
                        { key: 'dataPagamento', label: 'Data do Pagamento / Baixa', req: false, isHighlight: true, treatment: 'Data de quitação efetiva (títulos já pagos geram baixa e movimento automaticamente)' },
                        { key: 'previsaoCaixa', label: 'Previsão de Caixa', req: false, treatment: 'Data de realização financeira projetada' },
                        { key: 'valorOriginal', label: 'Valor Original', req: true, treatment: 'Valor bruto contratado ou faturado' },
                        { key: 'principalBaixado', label: 'Principal Baixado', req: false, treatment: 'Valor já liquidado / pago / recebido' },
                        { key: 'saldoAtual', label: 'Saldo em Aberto', req: false, treatment: 'Valor restante calculado (Original - Baixado)' },
                        { key: 'situacao', label: 'Situação / Status', req: false, treatment: 'Aberto, Parcial, Liquidado ou Cancelado' },
                        { key: 'centroCusto', label: 'Centro de Custo', req: false, treatment: 'Unidade de negócio ou centro de custos' },
                        { key: 'banco', label: 'Banco / Conta', req: false, treatment: 'Conta bancária de liquidação' }
                      ].map(field => {
                        const currentMappedCol = (mapping as any)[field.key] || '';
                        return (
                          <tr key={field.key} className={`transition-colors ${
                            field.isHighlight 
                              ? 'bg-emerald-500/5 hover:bg-emerald-500/10' 
                              : 'hover:bg-[var(--surface-elevated)]/40'
                          }`}>
                            <td className="py-2.5 px-4 font-semibold text-[var(--text-primary)]">
                              <div className="flex items-center flex-wrap gap-1">
                                <span>{field.label}</span>
                                {field.req && <span className="text-rose-400 font-bold">*</span>}
                                {field.isHighlight && (
                                  <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    💳 Já Pago
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-2.5 px-4">
                              <PremiumSelect
                                value={currentMappedCol}
                                onChange={(e) => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                aria-label={`Mapeamento para ${field.label}`}
                                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-semibold focus:outline-hidden ${
                                  currentMappedCol === '__DONT_IMPORT__'
                                    ? 'bg-slate-500/15 border-slate-500/40 text-slate-400 font-bold'
                                    : currentMappedCol
                                      ? 'bg-amber-500/10 border-amber-400/40 text-amber-300'
                                      : field.req
                                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                        : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                                }`}
                              >
                                <option value="">-- Não mapeado / Automático --</option>
                                <option value="__DONT_IMPORT__">🚫 (Não importar / Deixar em branco)</option>
                                {availableHeaders.map(h => (
                                  <option key={h} value={h}>
                                    Coluna: {h}
                                  </option>
                                ))}
                              </PremiumSelect>
                            </td>

                            <td className="py-2.5 px-4 text-[11px] text-[var(--text-secondary)]">
                              {field.treatment}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Colunas Extras Configuradas */}
              {extraColumns.length > 0 && (
                <div className="bg-[var(--surface-card)] p-3 rounded-xl border border-[var(--border-subtle)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 flex items-center">
                      <Columns className="w-3.5 h-3.5 mr-1" />
                      Colunas Extras Ativas ({extraColumns.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddColumnModal(true)}
                      className="text-[11px] text-amber-400 hover:underline font-semibold"
                    >
                      + Adicionar Mais
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {extraColumns.map(col => (
                      <div key={col.id} className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs flex items-center space-x-2">
                        <span className="font-bold text-[var(--text-primary)]">{col.label}:</span>
                        <span className="text-[var(--text-secondary)] font-mono">{col.sourceHeader}</span>
                        <button
                          type="button"
                          onClick={() => setExtraColumns(prev => prev.filter(c => c.id !== col.id))}
                          className="text-rose-400 hover:text-rose-300 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Card Informativo do Filtro Rigoroso de Direção e Sinal */}
              <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
                fallbackDefaultType === 'RECEBER'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                <div className="p-2 rounded-lg bg-[var(--surface-elevated)] shrink-0">
                  {fallbackDefaultType === 'RECEBER' ? (
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-rose-400" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)] text-sm">
                      {fallbackDefaultType === 'RECEBER'
                        ? 'Filtro de Contas a Receber: Apenas Valores Positivos (Recebimentos)'
                        : 'Filtro de Contas a Pagar: Apenas Despesas & Saídas Financeiras'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Filtro Ativo
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {fallbackDefaultType === 'RECEBER'
                      ? 'Neste módulo, o sistema aceitará estritamente valores positivos e créditos de recebimento. Lançamentos com valores negativos ou classificados como despesas serão automaticamente descartados para evitar poluição da carteira.'
                      : 'Neste módulo, o sistema aceitará estritamente despesas e saídas a pagar. Valores com sinal negativo na planilha serão interpretados como valor devido a pagar. Créditos e recebimentos serão descartados.'}
                  </p>
                </div>
              </div>

            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 3: CONFERÊNCIA DE CATEGORIAS, MEMÓRIA IA & APROVAÇÃO */}
          {/* ========================================================= */}
          {step === 3 && (
            <div className="space-y-4">
              
              {/* Banner de Conferência de Categorias & Memória IA */}
              <div className="p-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-[var(--surface-card)] to-amber-500/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--text-primary)]">
                        Conferência de Dados, Categorias & Memória de IA
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Aprendizado Contínuo Ativo
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Verifique e ajuste títulos, datas, valores e categorias antes de importar. Você pode editar diretamente nas células da tabela ou usar a barra de alteração em massa por coluna abaixo!
                    </p>
                  </div>
                </div>

                {bulkFeedbackMsg && (
                  <div className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-in fade-in flex items-center gap-1.5 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{bulkFeedbackMsg.text}</span>
                  </div>
                )}
              </div>

              {/* SUPER BARRA DE EDIÇÃO EM MASSA POR COLUNA */}
              <div className="bg-[var(--surface-card)] p-3.5 rounded-2xl border border-amber-500/30 shadow-xs space-y-2.5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black">
                      ⚡
                    </span>
                    <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                      Edição em Massa por Coluna
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {analyzedRows.filter(r => r.isSelected && r.action !== 'ERRO' && !r.isTypeFilteredOut).length} selecionadas
                      </span>
                    </h4>
                  </div>
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    Marque os lançamentos e escolha qual coluna deseja alterar para todos simultaneamente.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Seletor da Coluna Alvo */}
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Alterar Coluna:</span>
                    <PremiumSelect
                      value={bulkField}
                      onChange={(e) => setBulkField(e.target.value as any)}
                      aria-label="Coluna para alteração em massa"
                      className="px-3 py-1.5 rounded-xl border border-amber-500/40 bg-[var(--surface-elevated)] text-xs font-bold text-amber-400 focus:outline-hidden"
                    >
                      <option value="categoria">📁 Categoria (Plano de Contas)</option>
                      <option value="competencia">📅 Competência (Mês/Ano)</option>
                      <option value="vencimento">🗓️ Data de Vencimento</option>
                      <option value="dataPagamento">💳 Data de Pagamento / Baixa</option>
                      <option value="fornecedor">🏢 Fornecedor / Cliente</option>
                      <option value="descricao">📝 Descrição / Histórico</option>
                      <option value="titulo">🏷️ Título / Referência</option>
                      <option value="valorOriginal">💰 Valor Original (R$)</option>
                      <option value="tipo">🔄 Tipo (Receita vs Despesa)</option>
                      <option value="situacao">✅ Situação (Aberto / Pago)</option>
                    </PremiumSelect>
                  </div>

                  {/* Input do Novo Valor com base na Coluna */}
                  <div className="flex-1 min-w-[260px]">
                    {bulkField === 'categoria' && (
                      <div className="flex items-center gap-2">
                        {(() => {
                          const activeBulkAccId = bulkCategoryId || batchCategoryId;
                          const currentAcc = chartAccountsMap.get(activeBulkAccId || '');
                          return (
                            <button
                              type="button"
                              onClick={() => setCategorySearchTarget({ isBulk: true, currentAccountId: activeBulkAccId, type: fallbackDefaultType })}
                              className="flex-1 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-[var(--surface-elevated)] hover:border-amber-400 text-xs font-medium text-left flex items-center justify-between gap-2 transition-all cursor-pointer shadow-xs"
                              title="Clique para abrir a pesquisa por nome e código contábil agrupada por categorias do plano de contas"
                            >
                              <span className="truncate">
                                {currentAcc ? (
                                  <span className="text-[var(--text-primary)] font-bold">
                                    {currentAcc.code && <span className="text-amber-400 font-mono mr-1.5">[{currentAcc.code}]</span>}
                                    {currentAcc.name}
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-secondary)] italic">
                                    🔍 Clique para pesquisar e escolher a categoria por nome...
                                  </span>
                                )}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-[10px] flex items-center gap-1 shrink-0">
                                <Search className="w-3 h-3" />
                                Pesquisar
                              </span>
                            </button>
                          );
                        })()}

                        {(bulkCategoryId || batchCategoryId) && (
                          <button
                            type="button"
                            onClick={() => {
                              setBulkCategoryId('');
                              setBatchCategoryId('');
                            }}
                            className="p-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-rose-400 hover:border-rose-400/40 text-xs cursor-pointer"
                            title="Limpar categoria selecionada"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}

                    {bulkField === 'competencia' && (
                      <input
                        type="text"
                        placeholder="Informe a competência (Ex: 2026-02 ou 02/2026)"
                        value={bulkCompetencia}
                        onChange={(e) => setBulkCompetencia(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono font-semibold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                      />
                    )}

                    {bulkField === 'vencimento' && (
                      <DateField
                        value={bulkVencimento}
                        onChange={(e) => setBulkVencimento(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono font-semibold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                      />
                    )}

                    {bulkField === 'dataPagamento' && (
                      <DateField
                        value={bulkDataPagamento}
                        onChange={(e) => setBulkDataPagamento(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono font-semibold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                      />
                    )}

                    {bulkField === 'fornecedor' && (
                      <input
                        type="text"
                        placeholder="Nome do Fornecedor ou Cliente para as selecionadas..."
                        value={bulkFornecedor}
                        onChange={(e) => setBulkFornecedor(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                      />
                    )}

                    {bulkField === 'descricao' && (
                      <input
                        type="text"
                        placeholder="Nova descrição para os lançamentos selecionados..."
                        value={bulkDescricao}
                        onChange={(e) => setBulkDescricao(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                      />
                    )}

                    {bulkField === 'titulo' && (
                      <input
                        type="text"
                        placeholder="Novo título / número de documento para os selecionados..."
                        value={bulkTitulo}
                        onChange={(e) => setBulkTitulo(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                      />
                    )}

                    {bulkField === 'valorOriginal' && (
                      <MoneyField value={parseFloat(String(bulkValor)) || 0} onChange={(v: number) => setBulkValor(v ? String(v) : '')} className="w-full px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden" />
                    )}

                    {bulkField === 'tipo' && (
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setBulkTipo('RECEBER')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            bulkTipo === 'RECEBER'
                              ? 'bg-emerald-500 text-white border-emerald-400 shadow-xs'
                              : 'bg-[var(--surface-elevated)] text-emerald-400 border-[var(--border-subtle)]'
                          }`}
                        >
                          Definir todas como Receita
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkTipo('PAGAR')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            bulkTipo === 'PAGAR'
                              ? 'bg-rose-500 text-white border-rose-400 shadow-xs'
                              : 'bg-[var(--surface-elevated)] text-rose-400 border-[var(--border-subtle)]'
                          }`}
                        >
                          Definir todas como Despesa
                        </button>
                      </div>
                    )}

                    {bulkField === 'situacao' && (
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setBulkSituacao('LIQUIDADO')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            bulkSituacao === 'LIQUIDADO'
                              ? 'bg-emerald-500 text-white border-emerald-400 shadow-xs'
                              : 'bg-[var(--surface-elevated)] text-emerald-400 border-[var(--border-subtle)]'
                          }`}
                        >
                          Definir como LIQUIDADO (Pago)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkSituacao('ABERTO')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                            bulkSituacao === 'ABERTO'
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                              : 'bg-[var(--surface-elevated)] text-amber-400 border-[var(--border-subtle)]'
                          }`}
                        >
                          Definir como EM ABERTO
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Botões de Ação em Massa */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {['titulo', 'descricao', 'competencia', 'fornecedor', 'dataPagamento'].includes(bulkField) && (
                      <button
                        type="button"
                        onClick={handleClearBulkField}
                        title="Limpar e deixar em branco esta coluna para todas as linhas marcadas"
                        className="px-3 py-2 bg-[var(--surface-elevated)] hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 border border-[var(--border-subtle)] hover:border-rose-500/30 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Deixar em Branco</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleApplyBulkEdit}
                      className="px-4 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Aplicar nas Selecionadas</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Cards de Métricas Inteligentes e Diagnóstico */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold">Total a Importar</span>
                    <span className="text-base font-black text-[var(--text-primary)]">{previewMetrics.toCreate + previewMetrics.toUpdate}</span>
                  </div>
                  <Layers className="w-5 h-5 text-amber-400/60" />
                </div>

                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-emerald-400 block uppercase font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-xs shadow-emerald-400" />
                      Memória de IA
                    </span>
                    <span className="text-base font-black text-emerald-400">
                      {previewMetrics.memoryCount} <span className="text-xs font-normal text-emerald-300/80">({previewMetrics.total > 0 ? Math.round((previewMetrics.memoryCount / previewMetrics.total) * 100) : 0}%)</span>
                    </span>
                  </div>
                  <Brain className="w-5 h-5 text-emerald-400/80" />
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold">Revisão / Padrão</span>
                    <span className="text-base font-black text-amber-400">{previewMetrics.manualCategoryCount}</span>
                  </div>
                  <Edit3 className="w-5 h-5 text-amber-400/60" />
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--text-secondary)] block uppercase font-bold">
                      {previewMetrics.filteredOutCount > 0 ? '🚫 Descartados por Sinal' : 'Valor Total'}
                    </span>
                    <span className="text-xs font-black text-[var(--text-primary)] font-mono block truncate">
                      {previewMetrics.filteredOutCount > 0 
                        ? `${previewMetrics.filteredOutCount} ignorados` 
                        : formatBRL(fallbackDefaultType === 'RECEBER' ? previewMetrics.totalReceivables : previewMetrics.totalPayables)}
                    </span>
                  </div>
                  <Filter className="w-5 h-5 text-slate-400" />
                </div>
              </div>

              {/* Barra de Resumo Mensal Dinâmico & Abas por Mês */}
              <ImportMonthlySummaryBar
                monthlySummaries={monthlySummaries}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
                onApproveMonth={handleApproveMonth}
                onDeselectMonth={handleDeselectMonth}
                onSetMonthType={handleSetMonthType}
              />

              {/* Barra de Ações, Filtros e Ferramentas Cadastrais */}
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 bg-[var(--surface-card)] p-3 rounded-xl border border-[var(--border-subtle)] text-xs">
                
                {/* Filtros Combinados (Status, Tipo e Memória de Categoria) */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Filtro por Tipo */}
                  <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-lg border border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setFilterType('TODOS')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                        filterType === 'TODOS'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('RECEBER')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center space-x-1 transition-colors ${
                        filterType === 'RECEBER'
                          ? 'bg-emerald-500 text-white font-bold shadow-xs'
                          : 'text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                    >
                      <TrendingUp className="w-3 h-3" />
                      <span>Receitas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('PAGAR')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center space-x-1 transition-colors ${
                        filterType === 'PAGAR'
                          ? 'bg-rose-500 text-white font-bold shadow-xs'
                          : 'text-rose-400 hover:bg-rose-500/10'
                      }`}
                    >
                      <TrendingDown className="w-3 h-3" />
                      <span>Despesas</span>
                    </button>
                  </div>

                  {/* Filtro de Memória / Categoria */}
                  <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-lg border border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setFilterCategoryMode('TODOS')}
                      className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                        filterCategoryMode === 'TODOS'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Todas Categorias
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterCategoryMode('MEMORIA')}
                      className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center space-x-1 transition-colors ${
                        filterCategoryMode === 'MEMORIA'
                          ? 'bg-emerald-500 text-white font-bold shadow-xs'
                          : 'text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                      title="Exibir apenas lançamentos pré-enquadrados pela inteligência do sistema"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                      <span>Memória IA ({previewMetrics.memoryCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterCategoryMode('MANUAL')}
                      className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                        filterCategoryMode === 'MANUAL'
                          ? 'bg-blue-500 text-white font-bold shadow-xs'
                          : 'text-blue-400 hover:bg-blue-500/10'
                      }`}
                    >
                      Padrão/Manual ({previewMetrics.manualCategoryCount})
                    </button>
                    {previewMetrics.filteredOutCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterCategoryMode('FILTRADOS_SINAL')}
                        className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center space-x-1 transition-colors ${
                          filterCategoryMode === 'FILTRADOS_SINAL'
                            ? 'bg-rose-500 text-white font-bold shadow-xs'
                            : 'text-rose-400 hover:bg-rose-500/10'
                        }`}
                        title="Lançamentos descartados por sinal ou tipo incompatível com o módulo"
                      >
                        <span>🚫 Descartados ({previewMetrics.filteredOutCount})</span>
                      </button>
                    )}
                  </div>

                  {/* Filtro por Ação / Diff */}
                  <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-lg border border-[var(--border-subtle)]">
                    {[
                      { id: 'TODOS', label: 'Todos' },
                      { id: 'CRIAR', label: 'Novos' },
                      { id: 'ATUALIZAR', label: 'Diff' },
                      { id: 'IGNORAR_IDENTICO', label: 'Idênticos' },
                      { id: 'ERRO', label: 'Erros' }
                    ].map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFilterAction(f.id)}
                        className={`px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                          filterAction === f.id
                            ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {/* Filtro e Destaque de Duplicatas Internas no Próprio Arquivo */}
                  {internalDuplicateStats.totalDuplicates > 0 && (
                    <div className="flex items-center space-x-1.5 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/30">
                      <button
                        type="button"
                        onClick={() => setFilterDuplicatesOnly(prev => !prev)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                          filterDuplicatesOnly
                            ? 'bg-amber-400 text-slate-950 shadow-md ring-2 ring-amber-300'
                            : 'text-amber-300 hover:bg-amber-500/20'
                        }`}
                        title="Filtrar apenas lançamentos repetidos dentro deste mesmo arquivo"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>⚠️ {internalDuplicateStats.totalDuplicates} Duplicatas no Arquivo</span>
                      </button>
                      {internalDuplicateStats.redundantCount > 0 && (
                        <button
                          type="button"
                          onClick={handleDeselectRedundantDuplicates}
                          className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-500/40 transition-colors cursor-pointer"
                          title="Desmarca automaticamente as ocorrências extras preservando a 1ª linha de cada lançamento repetido"
                        >
                          Desmarcar Cópias ({internalDuplicateStats.redundantCount})
                        </button>
                      )}
                    </div>
                  )}

                  {/* Filtro de Lançamentos Parcelados Inteligentes */}
                  {previewMetrics.installmentCount > 0 && (
                    <div className="flex items-center space-x-1 bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-500/30">
                      <button
                        type="button"
                        onClick={() => setFilterInstallmentsOnly(prev => !prev)}
                        className={`px-2.5 py-1 rounded-md text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer ${
                          filterInstallmentsOnly
                            ? 'bg-purple-400 text-slate-950 shadow-md ring-2 ring-purple-300'
                            : 'text-purple-300 hover:bg-purple-500/20'
                        }`}
                        title="Filtrar apenas lançamentos identificados como parcelas (ex: 1/12, 2/12)"
                      >
                        <Package className="w-3.5 h-3.5 text-purple-400" />
                        <span>📦 Parcelados ({previewMetrics.installmentCount})</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Botões de Ação Rápida */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCrossReferenceModal(true)}
                    className="px-2.5 py-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 rounded-lg font-bold flex items-center transition-colors"
                    title="Cruzar clientes, fornecedores e categorias com os cadastros do app"
                  >
                    <GitMerge className="w-3.5 h-3.5 mr-1" />
                    Cruzar Dados com o App
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAddColumnModal(true)}
                    className="px-2.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 rounded-lg font-bold flex items-center transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    + Coluna Extra
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleAll(true)}
                    className="px-2.5 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] font-bold text-[var(--text-primary)] hover:bg-[var(--surface-card)] rounded-lg"
                  >
                    Marcar Visíveis
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleAll(false)}
                    className="px-2.5 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {/* Tabela de Validação Canônica com Edição Inline e Ampla Visibilidade */}
              <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden flex-1 min-h-[460px] max-h-[calc(92vh-380px)] overflow-y-auto overflow-x-auto shadow-inner">
                <table className="w-full text-left border-collapse text-xs min-w-[1300px]">
                  <thead className="sticky top-0 bg-[var(--surface-elevated)] z-10 border-b border-[var(--border-subtle)] shadow-xs">
                    <tr className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          aria-label="Marcar ou desmarcar todas as linhas visíveis"
                          checked={displayedRows.length > 0 && displayedRows.every(r => r.isSelected)}
                          onChange={(e) => {
                            const shouldSelect = e.target.checked;
                            const visibleNumbers = new Set(displayedRows.map(r => r.rowNumber));
                            setAnalyzedRows(prev => prev.map(r => {
                              if (visibleNumbers.has(r.rowNumber) && r.action !== 'ERRO' && !r.isTypeFilteredOut) {
                                return { ...r, isSelected: shouldSelect };
                              }
                              return r;
                            }));
                          }}
                          className="rounded border-[var(--border-subtle)] text-amber-400 focus:ring-0 cursor-pointer"
                        />
                      </th>
                      <th className="py-2.5 px-2.5 w-16 text-center">Ação</th>
                      <th className="py-2.5 px-2.5 w-24 text-center">Tipo</th>
                      <th className="py-2.5 px-3 min-w-[180px] max-w-[240px]">Fornecedor / Cliente</th>
                      <th className="py-2.5 px-3 min-w-[220px] max-w-[320px]">Descrição</th>
                      <th className="py-2.5 px-3 min-w-[280px]">Categoria (Plano & Memória IA)</th>
                      <th className="py-2.5 px-3 min-w-[150px] max-w-[220px]">Título / Doc</th>
                      <th className="py-2.5 px-2 text-center w-24">Competência</th>
                      <th className="py-2.5 px-2 text-center w-32">Vencimento</th>
                      <th className="py-2.5 px-2 text-center w-32 bg-emerald-500/10 text-emerald-300 font-bold border-x border-emerald-500/20">
                        💳 Data Pagto
                      </th>
                      <th className="py-2.5 px-3 text-right w-28">Valor Original</th>
                      <th className="py-2.5 px-3 text-right w-24">Baixado</th>
                      <th className="py-2.5 px-3 text-right w-24">Saldo</th>
                      <th className="py-2.5 px-2.5 text-center w-24">Situação</th>
                      {extraColumns.map(col => (
                        <th key={col.id} className="py-2.5 px-3 text-[var(--text-secondary)]">
                          {col.label}
                        </th>
                      ))}
                      <th className="py-2.5 px-2.5 text-center w-16">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={14 + extraColumns.length} className="py-12 text-center text-xs text-[var(--text-secondary)] font-sans">
                          Nenhum lançamento encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map(row => {
                        const isRevenue = row.normalized.tipo === 'RECEBER';

                        return (
                          <tr 
                            key={row.rowNumber} 
                            className={`hover:bg-[var(--surface-elevated)]/50 transition-colors ${
                              row.isInternalDuplicate ? 'bg-amber-500/10 border-l-4 border-l-amber-400 hover:bg-amber-500/20 ' : ''
                            }${
                              row.isTypeFilteredOut ? 'bg-rose-500/5 opacity-40' :
                              row.action === 'ERRO' ? 'bg-rose-500/5 opacity-70' :
                              row.action === 'IGNORAR_IDENTICO' ? 'opacity-50' : 
                              !row.isSelected ? 'opacity-40' : ''
                            }`}
                          >
                            {/* Checkbox de Seleção */}
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={row.isSelected}
                                disabled={row.action === 'ERRO' || row.action === 'IGNORAR_IDENTICO' || row.isTypeFilteredOut}
                                onChange={() => toggleRow(row.rowNumber)}
                                aria-label={`Selecionar linha ${row.rowNumber}`}
                                className="rounded border-[var(--border-subtle)] text-amber-400 focus:ring-0 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>

                            {/* Badge de Ação */}
                            <td className="py-2 px-2.5 text-center flex flex-col items-center justify-center gap-1">
                              {row.action === 'CRIAR' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                  Novo
                                </span>
                              )}
                              {row.action === 'ATUALIZAR' && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDiffRow(row)}
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 flex items-center justify-center space-x-1 mx-auto"
                                >
                                  <span>Diff</span>
                                  <Eye className="w-2.5 h-2.5" />
                                </button>
                              )}
                              {row.action === 'IGNORAR_IDENTICO' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30" title="Registro idêntico já cadastrado no banco">
                                  Idêntico
                                </span>
                              )}
                              {row.action === 'ERRO' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30" title={row.errors.join('; ')}>
                                  Erro
                                </span>
                              )}
                              {row.isInternalDuplicate && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-xs cursor-help"
                                  title={`Duplicata no próprio arquivo (${row.internalDuplicateCount}x com mesmo valor, vencimento e fornecedor): Linhas ${row.internalDuplicateRowNumbers?.join(', ')}${row.isInternalDuplicateOriginal ? ' (Esta é a 1ª ocorrência)' : ' (Cópia excedente)'}`}
                                >
                                  ⚠️ Dup {row.internalDuplicateCount}x
                                </span>
                              )}
                            </td>

                            {/* Tipo: Receita vs Despesa */}
                            <td className="py-2 px-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleSetRowType(row.rowNumber, isRevenue ? 'PAGAR' : 'RECEBER')}
                                title="Clique para alternar entre Receita e Despesa"
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center justify-center space-x-1 mx-auto transition-all ${
                                  isRevenue
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                                }`}
                              >
                                {isRevenue ? (
                                  <>
                                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                                    <span>Receita</span>
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="w-3 h-3 text-rose-400" />
                                    <span>Despesa</span>
                                  </>
                                )}
                              </button>
                            </td>

                            {/* Fornecedor / Cliente (Editável Inline) */}
                            <td className="py-2 px-3 min-w-[180px] max-w-[240px]">
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={row.normalized.fornecedor || ''}
                                  onChange={(e) => handleInlineUpdate(row.rowNumber, 'fornecedor', e.target.value)}
                                  title="Editar fornecedor ou cliente"
                                  className="w-full px-2 py-1 bg-transparent hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-transparent hover:border-[var(--border-subtle)] focus:border-amber-400 rounded-lg text-xs font-semibold text-[var(--text-primary)] transition-colors focus:outline-hidden"
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                  {row.counterpartyResolution === 'NOVO_SOLICITADO' && (
                                    <span className="text-[9px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 inline-block">
                                      Novo ({isRevenue ? 'Cliente' : 'Fornecedor'})
                                    </span>
                                  )}
                                  {row.counterpartyResolution === 'SUGESTAO' && (
                                    <span className="text-[9px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 inline-block">
                                      Sugerido
                                    </span>
                                  )}
                                  {row.documentValidation?.isValid && (
                                    <span 
                                      className="text-[9px] text-emerald-300 font-bold bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30 inline-flex items-center gap-1"
                                      title={`${row.documentValidation.type} validado matematicamente com sucesso (${row.documentValidation.formatted})`}
                                    >
                                      <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                                      <span>{row.documentValidation.type} Válido</span>
                                    </span>
                                  )}
                                  {row.matchedByDocument && (
                                    <span 
                                      className="text-[9px] text-blue-300 font-bold bg-blue-500/15 px-1.5 py-0.5 rounded border border-blue-500/30 inline-block"
                                      title="Vinculado ao cadastro do app por correspondência de CNPJ/CPF"
                                    >
                                      ✓ Vínculo Fiscal
                                    </span>
                                  )}
                                  {row.documentValidation?.raw && !row.documentValidation.isValid && (
                                    <span 
                                      className="text-[9px] text-rose-300 font-bold bg-rose-500/15 px-1.5 py-0.5 rounded border border-rose-500/30 inline-flex items-center gap-1"
                                      title={`Documento fiscal "${row.documentValidation.raw}" com dígitos verificadores inválidos.`}
                                    >
                                      ⚠️ Doc Inválido
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Descrição (Editável Inline com Textarea e Quebra de Linha) */}
                            <td className="py-2 px-3 min-w-[220px] max-w-[320px]">
                              <textarea
                                rows={2}
                                value={row.normalized.descricao || ''}
                                onChange={(e) => handleInlineUpdate(row.rowNumber, 'descricao', e.target.value)}
                                title="Editar descrição"
                                className="w-full px-2 py-1 bg-transparent hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-transparent hover:border-[var(--border-subtle)] focus:border-amber-400 rounded-lg text-xs text-[var(--text-secondary)] leading-snug break-words whitespace-normal transition-colors focus:outline-hidden resize-none"
                              />
                              {row.isInstallment && row.installmentInfo && (
                                <div className="mt-1">
                                  <span 
                                    className="text-[9px] text-purple-300 font-black bg-purple-500/20 px-1.5 py-0.5 rounded border border-purple-500/30 inline-flex items-center gap-1 shadow-xs"
                                    title={`Parcela ${row.installmentInfo.current} de ${row.installmentInfo.total} identificada automaticamente na descrição.`}
                                  >
                                    <Package className="w-2.5 h-2.5 text-purple-400" />
                                    <span>📦 Parcela {row.installmentInfo.current}/{row.installmentInfo.total}</span>
                                  </span>
                                </div>
                              )}
                            </td>

                            {/* Categoria / Plano de Contas & Memória IA (NO LUGAR DO TÍTULO / DOC, ENTRE DESCRIÇÃO E VENCIMENTO/VALOR) */}
                            <td className="py-2 px-3 min-w-[280px]">
                              {row.isTypeFilteredOut ? (
                                <span 
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 block truncate"
                                  title={row.typeFilterReason}
                                >
                                  🚫 Descartado ({row.normalized.tipo === 'RECEBER' ? 'Receita' : 'Despesa'})
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  {/* Indicador de Memória / IA */}
                                  {row.isFromMemory ? (
                                    <span 
                                      title={`🧠 Enquadrado pela Memória de IA do Sistema!\nMotivo: ${row.memoryReason || 'Padrão anterior similar'}\nConfiança: ${Math.round((row.memoryConfidence || 0.9) * 100)}%`}
                                      className="relative flex h-3.5 w-3.5 shrink-0 cursor-help"
                                    >
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border border-emerald-300 shadow-xs shadow-emerald-500/50 items-center justify-center text-[7px] text-slate-950 font-black">
                                        ✓
                                      </span>
                                    </span>
                                  ) : row.normalized.isManuallyEdited ? (
                                    <span 
                                      title="✏️ Categoria ajustada manualmente nesta sessão. Será gravada na memória de IA ao concluir a importação!"
                                      className="inline-flex rounded-full h-3 w-3 bg-blue-500 border border-blue-300 shrink-0 cursor-help"
                                    />
                                  ) : (
                                    <span 
                                      title="⚙️ Categoria padrão do plano de contas. Altere para enquadrar na categoria correta."
                                      className="inline-flex rounded-full h-2.5 w-2.5 bg-slate-500 border border-slate-400 shrink-0 cursor-help"
                                    />
                                  )}

                                  {(() => {
                                    const currentAcc = chartAccountsMap.get(row.matchedChartAccountId || '');
                                    const groupStyle = getAccountGroupBadgeStyle(currentAcc);

                                    return (
                                      <button
                                        type="button"
                                        onClick={() => setCategorySearchTarget({
                                          rowNumber: row.rowNumber,
                                          description: row.normalized.descricao || row.normalized.titulo,
                                          currentAccountId: row.matchedChartAccountId,
                                          type: row.normalized.tipo
                                        })}
                                        className={`flex-1 py-1 px-2 rounded-lg text-xs font-medium border text-left flex items-center justify-between gap-1.5 transition-all cursor-pointer shadow-xs ${groupStyle.borderLeft} ${groupStyle.bgSubtle} border-[var(--border-subtle)] hover:border-amber-400/80 ${
                                          row.isFromMemory ? 'ring-1 ring-emerald-500/30' : ''
                                        }`}
                                        title={`Grupo: ${groupStyle.groupLabel}\nClique para abrir a pesquisa por nome e código contábil`}
                                      >
                                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                                          {/* Badge com cor suave por Macro-Grupo Contábil */}
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-black tracking-wide border uppercase shrink-0 ${groupStyle.badgeStyle}`}>
                                            {groupStyle.groupLabel}
                                          </span>

                                          <span className="truncate text-[var(--text-primary)]">
                                            {currentAcc ? (
                                              <>
                                                {currentAcc.code && <span className="opacity-70 font-mono mr-1">[{currentAcc.code}]</span>}
                                                <span className="font-semibold">{currentAcc.name}</span>
                                              </>
                                            ) : (
                                              <span className="text-amber-400 font-medium italic flex items-center gap-1">
                                                <Search className="w-3 h-3" /> Selecionar categoria...
                                              </span>
                                            )}
                                          </span>
                                        </div>

                                        <Search className="w-3.5 h-3.5 shrink-0 opacity-70 text-amber-400" />
                                      </button>
                                    );
                                  })()}
                                </div>
                              )}
                            </td>

                            {/* Título / Documento (Editável Inline com Quebra de Linha) */}
                            <td className="py-2 px-3 min-w-[150px] max-w-[220px]">
                              <input
                                type="text"
                                value={row.normalized.titulo || ''}
                                onChange={(e) => handleInlineUpdate(row.rowNumber, 'titulo', e.target.value)}
                                title="Editar título / documento"
                                className="w-full px-2 py-1 bg-transparent hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-transparent hover:border-[var(--border-subtle)] focus:border-amber-400 rounded-lg text-xs font-bold text-[var(--text-primary)] transition-colors focus:outline-hidden"
                              />
                            </td>

                            {/* Competência (Editável Inline) */}
                            <td className="py-2 px-2 text-center w-24">
                              <input
                                type="text"
                                placeholder="AAAA-MM"
                                value={row.normalized.competencia || ''}
                                onChange={(e) => handleInlineUpdate(row.rowNumber, 'competencia', e.target.value)}
                                title="Editar competência (AAAA-MM)"
                                className="w-20 px-1.5 py-1 text-center font-mono font-bold text-xs text-amber-300 bg-transparent hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-transparent hover:border-[var(--border-subtle)] focus:border-amber-400 rounded-lg transition-colors focus:outline-hidden"
                              />
                            </td>

                            {/* Vencimento (Editável Inline com Fallback Seguro para input date) */}
                            <td className="py-2 px-2 text-center w-32">
                              <DateField
                                value={row.normalized.vencimento && /^\d{4}-\d{2}-\d{2}$/.test(row.normalized.vencimento) ? row.normalized.vencimento : ''}
                                onChange={(e) => handleInlineUpdate(row.rowNumber, 'vencimento', e.target.value)}
                                title="Editar data de vencimento"
                                className="w-28 px-1.5 py-1 text-center font-mono font-bold text-xs text-[var(--text-primary)] bg-transparent hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-transparent hover:border-[var(--border-subtle)] focus:border-amber-400 rounded-lg transition-colors focus:outline-hidden"
                              />
                            </td>

                            {/* Data de Pagamento / Quitação (Editável Inline com Quitação Automática) */}
                            <td className="py-2 px-2 text-center w-32">
                              <DateField
                                value={row.normalized.dataPagamento && /^\d{4}-\d{2}-\d{2}$/.test(row.normalized.dataPagamento) ? row.normalized.dataPagamento : ''}
                                onChange={(e) => handleInlinePaymentDateChange(row.rowNumber, e.target.value)}
                                title="Data de pagamento / quitação efetiva"
                                className={`w-28 px-1.5 py-1 text-center font-mono font-bold text-xs rounded-lg transition-colors focus:outline-hidden ${
                                  row.normalized.dataPagamento
                                    ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 focus:border-emerald-400 font-black'
                                    : 'bg-transparent hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-transparent hover:border-[var(--border-subtle)] focus:border-amber-400 text-[var(--text-secondary)]'
                                }`}
                              />
                            </td>

                            {/* Valor Original (Editável Inline) */}
                            <td className="py-2 px-3 text-right w-28">
                              <MoneyField value={Number(typeof row.normalized.valorOriginal === 'number' && !isNaN(row.normalized.valorOriginal) ? row.normalized.valorOriginal : 0) || 0} onChange={(v: number) => handleInlineUpdate(row.rowNumber, 'valorOriginal', v)} className={`w-24 px-1.5 py-1 text-right font-mono font-bold text-xs bg-transparent hover:bg-[var(--surface-elevated)] focus:bg-[var(--surface-elevated)] border border-transparent hover:border-[var(--border-subtle)] focus:border-amber-400 rounded-lg transition-colors focus:outline-hidden ${
                                  isRevenue ? 'text-emerald-400' : 'text-[var(--text-primary)]'
                                }`} />
                            </td>

                            {/* Principal Baixado */}
                            <td className="py-2 px-3 text-right text-blue-400 font-mono">
                              {(() => {
                                const baixado = row.normalized.principalBaixado || 0;
                                const original = row.normalized.valorOriginal || 0;
                                const hasSurcharge = original > 0 && baixado > original + 0.01;
                                const diffJuros = hasSurcharge ? baixado - original : 0;
                                const hasDiscount = original > 0 && baixado > 0 && baixado < original - 0.01 && (row.normalized.situacao === 'LIQUIDADO' || row.normalized.saldoAtual === 0);
                                const diffDesconto = hasDiscount ? original - baixado : 0;

                                if (baixado <= 0) return '-';

                                return (
                                  <div className="flex flex-col items-end">
                                    <span>{formatBRL(baixado)}</span>
                                    {hasSurcharge && (
                                      <span
                                        className="text-[9px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-1 py-0.2 rounded mt-0.5 flex items-center gap-0.5 whitespace-nowrap shadow-2xs"
                                        title={`Quitação com Acréscimo: Valor pago supera o valor original em R$ ${formatBRL(diffJuros)}. O sistema registrará automaticamente R$ ${formatBRL(original)} como principal e R$ ${formatBRL(diffJuros)} como Juros/Multa.`}
                                      >
                                        ⚡ +{formatBRL(diffJuros)} juros
                                      </span>
                                    )}
                                    {hasDiscount && (
                                      <span
                                        className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1 py-0.2 rounded mt-0.5 flex items-center gap-0.5 whitespace-nowrap shadow-2xs"
                                        title={`Quitação com Desconto: Título liquidado com abatimento de R$ ${formatBRL(diffDesconto)}. O sistema registrará R$ ${formatBRL(original)} de principal amortizado e R$ ${formatBRL(diffDesconto)} como Desconto Financeiro obtido/concedido.`}
                                      >
                                        🏷️ -{formatBRL(diffDesconto)} desc.
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Saldo Restante */}
                            <td className="py-2 px-3 text-right font-bold text-[var(--text-primary)] font-mono">
                              {formatBRL(row.normalized.saldoAtual || 0)}
                            </td>

                            {/* Situação (Alternar Status com 1 Clique) */}
                            <td className="py-2 px-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleRowStatus(row.rowNumber)}
                                title="Clique para alternar entre LIQUIDADO (Pago) e ABERTO"
                                className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all hover:scale-105 active:scale-95 border cursor-pointer ${
                                  row.normalized.situacao === 'LIQUIDADO' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30' :
                                  row.normalized.situacao === 'PARCIAL' ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30' :
                                  row.normalized.situacao === 'ATRASADO' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30' :
                                  'bg-slate-500/20 text-slate-300 border-slate-500/40 hover:bg-slate-500/30'
                                }`}
                              >
                                {row.normalized.situacao}
                              </button>
                            </td>

                            {/* Colunas Extras */}
                            {extraColumns.map(col => (
                              <td key={col.id} className="py-2 px-3 text-[var(--text-secondary)] min-w-[120px] break-words whitespace-normal">
                                {row.normalized.customFields?.[col.id] !== undefined 
                                  ? String(row.normalized.customFields[col.id]) 
                                  : '-'}
                              </td>
                            ))}

                            {/* Botão de Edição Completa */}
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => setEditingRow(row)}
                                className="p-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-amber-400 border border-amber-500/30 hover:border-amber-400 transition-colors cursor-pointer"
                                title="Editar todos os campos e rateios desta linha em modal detalhado"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
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

          {/* ========================================================= */}
          {/* STEP 4: RESULTS & SUCCESS SUMMARY */}
          {/* ========================================================= */}
          {step === 4 && importSummary && (
            <div className="space-y-6 text-center py-6">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg animate-in zoom-in">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                  Importação Aprovada e Concluída com Sucesso!
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md mx-auto">
                  Os títulos foram integrados com controle de idempotência, separação de receitas/despesas e vínculos cadastrais.
                </p>
              </div>

              {/* Summary Card */}
              <div className="max-w-lg mx-auto bg-[var(--surface-elevated)] p-5 rounded-2xl border border-[var(--border-subtle)] text-left space-y-3">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-emerald-400 font-semibold flex items-center">
                    <TrendingUp className="w-3.5 h-3.5 mr-1" />
                    Receitas Criadas ({importSummary.receivablesCount}):
                  </span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {formatBRL(importSummary.totalReceivables)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-rose-400 font-semibold flex items-center">
                    <TrendingDown className="w-3.5 h-3.5 mr-1" />
                    Despesas Criadas ({importSummary.payablesCount}):
                  </span>
                  <span className="font-bold text-rose-400 font-mono text-sm">
                    {formatBRL(importSummary.totalPayables)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-secondary)] font-medium">Títulos Atualizados (Diff Confirmado):</span>
                  <span className="font-bold text-amber-400 font-mono text-sm">{importSummary.updatedCount}</span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-secondary)] font-medium">Títulos Ignorados (Idênticos / Idempotentes):</span>
                  <span className="font-bold text-blue-400 font-mono text-sm">{importSummary.ignoredCount}</span>
                </div>

                <div className="flex justify-between items-center text-xs pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-secondary)] font-medium">Baixas Financeiras Gravadas:</span>
                  <span className="font-bold text-amber-300 font-mono text-sm">{importSummary.settledCount}</span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--text-secondary)] font-medium">Novos Cadastros Criados no App:</span>
                  <span className="font-bold text-[var(--text-primary)] font-mono text-sm">{importSummary.newPartiesCount}</span>
                </div>
              </div>

              {/* Card de Confirmação do Aprendizado de IA */}
              <div className="max-w-lg mx-auto p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-amber-500/10 to-emerald-500/10 border border-emerald-500/30 text-left flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <Brain className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--text-primary)]">
                      Motor de Inteligência e Aprendizado Atualizado
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Memória Salva
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    Todas as categorias confirmadas ou corrigidas nesta importação foram memorizadas pelo sistema. Nas próximas importações de planilhas, lançamentos similares virão enquadrados automaticamente com o selo de memória!
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center shrink-0">
          {step === 1 && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Cancelar
              </button>
              <span className="text-xs text-[var(--text-secondary)]">
                Selecione uma planilha para prosseguir
              </span>
            </>
          )}

          {step === 2 && (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-bold flex items-center transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Voltar
              </button>

              <button
                type="button"
                onClick={handleProcessValidation}
                className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-[#18181b] rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(245,158,11,0.25)] flex items-center"
              >
                Analisar Dados & Ver Resumos Mensais
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={isImporting}
                className="px-4 py-2 bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl text-xs font-bold flex items-center transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                Ajustar Mapeamento
              </button>

              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || (previewMetrics.toCreate === 0 && previewMetrics.toUpdate === 0)}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(16,185,129,0.25)] flex items-center disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Gravando Transações...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Aprovar e Importar ({previewMetrics.toCreate + previewMetrics.toUpdate} Títulos Selecionados)
                  </>
                )}
              </button>
            </>
          )}

          {step === 4 && (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (onSuccess) onSuccess();
                  if (onImportCompleted) onImportCompleted();
                  onClose();
                }}
                className="px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-[#18181b] rounded-xl text-xs font-bold transition-all shadow-[0_0_12px_rgba(245,158,11,0.25)]"
              >
                Concluir e Visualizar Títulos Financeiros
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Modal / Drawer de Comparação Antes vs Depois (Diff) */}
      {selectedDiffRow && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xl max-w-xl w-full p-5 space-y-4 text-left text-xs">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2">
                <GitCompare className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Auditoria de Alteração: {selectedDiffRow.normalized.titulo}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDiffRow(null)}
                className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)]">
              Este registro já existe na base de dados. Veja os campos alterados pelo arquivo importado:
            </p>

            <div className="bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--surface-card)] uppercase">
                    <th className="py-2 px-3">Campo</th>
                    <th className="py-2 px-3">Antes (No Banco)</th>
                    <th className="py-2 px-3">Depois (Na Planilha)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono">
                  {selectedDiffRow.diffs.map(d => (
                    <tr key={d.field} className={d.hasChanged ? 'bg-amber-500/10' : ''}>
                      <td className="py-2 px-3 font-sans font-bold text-[var(--text-primary)]">
                        {d.label}
                      </td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">
                        {String(d.oldValue ?? '-')}
                      </td>
                      <td className={`py-2 px-3 ${d.hasChanged ? 'text-amber-400 font-bold' : 'text-[var(--text-primary)]'}`}>
                        {String(d.newValue ?? '-')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedDiffRow(null)}
                className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-amber-400 transition-colors shadow-xs"
              >
                Fechar Auditoria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Incluir Coluna Extra */}
      {showAddColumnModal && (
        <ImportExtraColumnModal
          isOpen={showAddColumnModal}
          onClose={() => setShowAddColumnModal(false)}
          availableHeaders={availableHeaders}
          alreadyMappedHeaders={Object.values(mapping).filter(Boolean)}
          onAddColumn={handleAddExtraColumn}
        />
      )}

      {/* Modal para Edição de Linha Individual */}
      {editingRow && (
        <ImportEditRowModal
          isOpen={!!editingRow}
          onClose={() => setEditingRow(null)}
          row={editingRow}
          counterparties={counterparties}
          chartAccounts={chartAccounts}
          bankAccounts={bankAccounts}
          extraColumns={extraColumns}
          onSaveRow={handleSaveRow}
        />
      )}

      {/* Modal de Cruzamento e Criação de Dados Cadastrais */}
      {showCrossReferenceModal && (
        <ImportCrossReferenceModal
          isOpen={showCrossReferenceModal}
          onClose={() => setShowCrossReferenceModal(false)}
          analyzedRows={analyzedRows}
          counterparties={counterparties}
          chartAccounts={chartAccounts}
          onEntitiesCreated={handleRefreshEntities}
        />
      )}

      {/* Modal Rápido de Pesquisa & Seleção de Categorias Agrupadas */}
      {categorySearchTarget && (
        <CategoryQuickSearchModal
          isOpen={!!categorySearchTarget}
          onClose={() => setCategorySearchTarget(null)}
          currentAccountId={categorySearchTarget.currentAccountId}
          targetDescription={categorySearchTarget.description}
          targetType={categorySearchTarget.type || fallbackDefaultType}
          groupedAccounts={groupedAccounts}
          onSelectAccount={(selectedAccId) => {
            if (categorySearchTarget.isBulk) {
              setBulkCategoryId(selectedAccId);
              setBatchCategoryId(selectedAccId);
            } else if (categorySearchTarget.rowNumber) {
              handleChangeRowCategory(categorySearchTarget.rowNumber, selectedAccId);
            }
          }}
        />
      )}

      {/* Toast Flutuante de Auto-Preenchimento em Cascata por Fornecedor/Cliente */}
      {cascadeSuggestion && (
        <div className="fixed bottom-24 right-8 z-70 max-w-md p-4 rounded-2xl bg-[var(--surface-card)] border-2 border-amber-400/90 shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30 shadow-xs">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <span>Auto-Preenchimento em Cascata</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 font-black text-[9px] border border-amber-500/40">
                    {cascadeSuggestion.otherRowNumbers.length} outros
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={() => setCascadeSuggestion(null)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-0.5"
                  title="Fechar sugestão"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Você definiu a categoria <strong className="text-amber-400">"{cascadeSuggestion.targetAccountName}"</strong> para <strong className="text-[var(--text-primary)]">"{cascadeSuggestion.partyName}"</strong>. Deseja aplicar para todos os outros <strong className="text-[var(--text-primary)]">{cascadeSuggestion.otherRowNumbers.length}</strong> lançamentos deste mesmo Fornecedor/Cliente?
              </p>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleApplyCascade}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Sim, Aplicar a Todos ({cascadeSuggestion.otherRowNumbers.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCascadeSuggestion(null)}
                  className="px-2.5 py-1.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold text-xs transition-colors cursor-pointer"
                >
                  Apenas Esta Linha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Salvar Perfil de Mapeamento Customizado */}
      {showSaveProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <BookmarkCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Salvar Perfil de Mapeamento</h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">Grave as colunas e configurações atuais para reutilizar depois</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSaveProfileModal(false);
                  setNewProfileName('');
                }}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                  Nome do Perfil:
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="Ex: Extrato Banco Inter, Relatório Conta Azul Vendas, Folha de Pagamento"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveCurrentProfile();
                    } else if (e.key === 'Escape') {
                      setShowSaveProfileModal(false);
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] focus:border-amber-400 rounded-xl text-xs font-medium text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-[var(--surface-elevated)]/60 rounded-xl border border-[var(--border-subtle)] text-[11px] text-[var(--text-secondary)] space-y-1">
                <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  O que será gravado neste perfil:
                </div>
                <p>• Mapeamento de todas as colunas ({Object.values(mapping).filter(Boolean).length} colunas mapeadas)</p>
                <p>• Categorias padrão de receitas e despesas configuradas</p>
                <p>• Modo de detecção de tipo ({typeDetectionMode}) e colunas extras</p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => {
                  setShowSaveProfileModal(false);
                  setNewProfileName('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentProfile}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 transition-colors shadow-sm cursor-pointer flex items-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                <span>Salvar Perfil</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico de Auditoria e Reversão Segura (Rollback) */}
      {showAuditHistoryModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Histórico de Auditoria das Importações</h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">Rastreabilidade completa de planilhas importadas e reversão segura em lote</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAuditHistoryModal(false);
                  setRollbackConfirmId(null);
                }}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {auditFeedbackMsg && (
              <div className="mx-4 mt-3 p-3 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-200 text-xs font-bold animate-in fade-in flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                <span>{auditFeedbackMsg}</span>
              </div>
            )}

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  Nenhum registro de importação encontrado no histórico.
                </div>
              ) : (
                auditLogs.map((log) => {
                  const isConfirming = rollbackConfirmId === log.id;
                  const canRollback = !log.rolledBack && log.createdTitleIds?.length > 0;

                  return (
                    <div
                      key={log.id}
                      className={`p-3.5 rounded-xl border transition-colors ${
                        log.rolledBack
                          ? 'bg-[var(--surface-elevated)]/40 border-[var(--border-subtle)] opacity-60'
                          : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-purple-500/30'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2 mb-2">
                        <div className="flex items-center space-x-2">
                          <FileSpreadsheet className="w-4 h-4 text-purple-400" />
                          <span className="text-xs font-bold text-[var(--text-primary)]">{log.fileName}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {formatDateBR(log.importedAt.split('T')[0])} às {new Date(log.importedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {log.rolledBack && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              Revertido
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Por: <strong className="text-[var(--text-primary)]">{log.user}</strong> | Modelo: <strong className="text-amber-400">{log.presetName}</strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                        <div className="bg-[var(--surface-card)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] text-[var(--text-secondary)] block">Títulos Criados</span>
                          <strong className="text-emerald-400 text-sm">{log.createdCount}</strong>
                        </div>
                        <div className="bg-[var(--surface-card)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] text-[var(--text-secondary)] block">Atualizados (Diff)</span>
                          <strong className="text-amber-400 text-sm">{log.updatedCount}</strong>
                        </div>
                        <div className="bg-[var(--surface-card)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] text-[var(--text-secondary)] block">Receitas Importadas</span>
                          <strong className="text-emerald-400 text-xs">{formatBRL(log.totalAmountReceivables || 0)}</strong>
                        </div>
                        <div className="bg-[var(--surface-card)] p-2 rounded-lg border border-[var(--border-subtle)]">
                          <span className="text-[10px] text-[var(--text-secondary)] block">Despesas Importadas</span>
                          <strong className="text-rose-400 text-xs">{formatBRL(log.totalAmountPayables || 0)}</strong>
                        </div>
                      </div>

                      {canRollback && (
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {isConfirming ? (
                            <div className="flex items-center gap-2 bg-rose-500/15 p-1.5 rounded-xl border border-rose-500/40">
                              <span className="text-[11px] font-bold text-rose-300">
                                Confirmar exclusão dos {log.createdTitleIds.length} títulos criados?
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRollbackBatch(log.id)}
                                className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-colors cursor-pointer"
                              >
                                Sim, Reverter
                              </button>
                              <button
                                type="button"
                                onClick={() => setRollbackConfirmId(null)}
                                className="px-2 py-1 rounded-lg bg-[var(--surface-card)] text-[var(--text-secondary)] text-xs font-semibold hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRollbackConfirmId(log.id)}
                              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                              title="Desfazer todos os títulos criados por este lote específico"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Desfazer / Reverter Lote</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowAuditHistoryModal(false);
                  setRollbackConfirmId(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[var(--surface-card)] hover:bg-[var(--surface-card)]/80 text-[var(--text-primary)] border border-[var(--border-subtle)] cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export const ImportSpreadsheetModal: React.FC<ImportSpreadsheetModalProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <ImportErrorBoundary onReset={props.onClose}>
      <ImportSpreadsheetModalInner {...props} />
    </ImportErrorBoundary>
  );
};
