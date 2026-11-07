import React, { useState, useMemo } from 'react';
import { 
  X, 
  Landmark, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  Search, 
  Download, 
  Wallet, 
  FileSpreadsheet, 
  Layers, 
  CalendarDays, 
  Filter,
  Building2,
  CheckCircle2,
  Receipt
} from 'lucide-react';
import { BankAccount, FinancialMovement } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { matchesSearch } from '../../utils/searchUtils';
import { PremiumSelect } from '../Common/PremiumSelect';

interface BankAccountStatementModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: BankAccount | null;
  initialPeriodYear?: number;
  initialPeriodMonth?: number;
}

type GroupingMode = 'DAY' | 'WEEK' | 'MONTH' | 'LIST';
type DirectionFilter = 'ALL' | 'ENTRADA' | 'SAIDA';
type PeriodFilter = 'CURRENT_MONTH' | 'LAST_MONTH' | 'LAST_90_DAYS' | 'CURRENT_YEAR' | 'ALL';

interface EnrichedMovement extends FinancialMovement {
  counterpartyName?: string;
  categoryName?: string;
  runningBalance: number;
}

export const BankAccountStatementModal: React.FC<BankAccountStatementModalProps> = ({
  isOpen,
  onClose,
  account,
  initialPeriodYear,
  initialPeriodMonth
}) => {
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('DAY');
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('CURRENT_MONTH');
  const [searchTerm, setSearchTerm] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const currentYear = initialPeriodYear || new Date().getFullYear();
  const currentMonth = initialPeriodMonth || (new Date().getMonth() + 1);

  const counterparties = storage.getCounterparties();
  const chartAccounts = storage.getChartAccounts();

  // 1. Obter todas as movimentações da conta em ordem cronológica para cálculo do saldo progressivo
  const allAccountMovements = useMemo(() => {
    if (!account) return [];
    const rawMovements = storage.getMovements().filter(m => m.bankAccountId === account.id && !m.isReversed);
    // Ordenação cronológica crescente para computar o saldo contínuo
    const sortedAsc = [...rawMovements].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    
    let currentRunning = account.initialBalance;
    const enriched: EnrichedMovement[] = [];

    for (const mov of sortedAsc) {
      if (mov.direction === 'ENTRADA') {
        currentRunning += mov.amount;
      } else {
        currentRunning -= mov.amount;
      }

      const counterparty = counterparties.find(c => c.id === mov.counterpartyId);
      const category = chartAccounts.find(ca => ca.id === mov.accountId);

      enriched.push({
        ...mov,
        counterpartyName: counterparty?.tradeName || counterparty?.name,
        categoryName: category?.name,
        runningBalance: Math.round(currentRunning * 100) / 100
      });
    }

    return enriched;
  }, [account.id, account.initialBalance]);

  // 2. Filtro por Período
  const periodFilteredMovements = useMemo(() => {
    return allAccountMovements.filter(m => {
      if (periodFilter === 'ALL') return true;

      const [movYear, movMonth] = m.date.split('-').map(Number);

      if (periodFilter === 'CURRENT_MONTH') {
        return movYear === currentYear && movMonth === currentMonth;
      }

      if (periodFilter === 'LAST_MONTH') {
        const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        return movYear === lastYear && movMonth === lastMonth;
      }

      if (periodFilter === 'CURRENT_YEAR') {
        return movYear === currentYear;
      }

      if (periodFilter === 'LAST_90_DAYS') {
        const d = new Date();
        d.setDate(d.getDate() - 90);
        const cutoff = d.toISOString().split('T')[0];
        return m.date >= cutoff;
      }

      return true;
    });
  }, [allAccountMovements, periodFilter, currentYear, currentMonth]);

  // 3. Filtro por Direção e Busca
  const filteredMovements = useMemo(() => {
    return periodFilteredMovements.filter(m => {
      if (directionFilter !== 'ALL' && m.direction !== directionFilter) return false;
      if (searchTerm.trim()) {
        const matches = matchesSearch([
          m.description,
          m.counterpartyName,
          m.categoryName,
          m.originReferenceId,
          m.date
        ], searchTerm);
        if (!matches) return false;
      }
      return true;
    });
  }, [periodFilteredMovements, directionFilter, searchTerm]);

  // Totais do período filtrado
  const totalInflows = periodFilteredMovements
    .filter(m => m.direction === 'ENTRADA')
    .reduce((sum, m) => sum + m.amount, 0);

  const totalOutflows = periodFilteredMovements
    .filter(m => m.direction === 'SAIDA')
    .reduce((sum, m) => sum + m.amount, 0);

  const netPeriod = totalInflows - totalOutflows;
  const currentActualBalance = FinancialEngine.getAccountBalance(account.id);

  // 4. Agrupamento por Dia, Semana ou Mês
  const groupedData = useMemo(() => {
    // Decrescente para exibição (mais recente primeiro)
    const sortedDesc = [...filteredMovements].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    if (groupingMode === 'LIST') {
      return [{ key: 'all', title: 'Todas as Movimentações', movements: sortedDesc, inflows: totalInflows, outflows: totalOutflows }];
    }

    if (groupingMode === 'DAY') {
      const groupsMap = new Map<string, EnrichedMovement[]>();
      sortedDesc.forEach(m => {
        const day = m.date;
        const current = groupsMap.get(day) || [];
        current.push(m);
        groupsMap.set(day, current);
      });

      return Array.from(groupsMap.entries()).map(([dateStr, movs]) => {
        const inSum = movs.filter(m => m.direction === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
        const outSum = movs.filter(m => m.direction === 'SAIDA').reduce((s, m) => s + m.amount, 0);
        return {
          key: dateStr,
          title: formatDateBR(dateStr),
          subtitle: dateStr === today ? 'Hoje' : undefined,
          movements: movs,
          inflows: inSum,
          outflows: outSum
        };
      });
    }

    if (groupingMode === 'WEEK') {
      const getWeekNumber = (dateStr: string) => {
        const d = new Date(dateStr + 'T00:00:00');
        const day = d.getDate();
        const weekNum = Math.ceil(day / 7);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `Semana ${weekNum} (${month}/${d.getFullYear()})`;
      };

      const groupsMap = new Map<string, EnrichedMovement[]>();
      sortedDesc.forEach(m => {
        const weekKey = getWeekNumber(m.date);
        const current = groupsMap.get(weekKey) || [];
        current.push(m);
        groupsMap.set(weekKey, current);
      });

      return Array.from(groupsMap.entries()).map(([weekKey, movs]) => {
        const inSum = movs.filter(m => m.direction === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
        const outSum = movs.filter(m => m.direction === 'SAIDA').reduce((s, m) => s + m.amount, 0);
        return {
          key: weekKey,
          title: weekKey,
          subtitle: `${movs.length} lançamentos`,
          movements: movs,
          inflows: inSum,
          outflows: outSum
        };
      });
    }

    if (groupingMode === 'MONTH') {
      const groupsMap = new Map<string, EnrichedMovement[]>();
      sortedDesc.forEach(m => {
        const monthKey = m.date.substring(0, 7); // YYYY-MM
        const current = groupsMap.get(monthKey) || [];
        current.push(m);
        groupsMap.set(monthKey, current);
      });

      return Array.from(groupsMap.entries()).map(([monthKey, movs]) => {
        const [y, m] = monthKey.split('-');
        const inSum = movs.filter(m => m.direction === 'ENTRADA').reduce((s, m) => s + m.amount, 0);
        const outSum = movs.filter(m => m.direction === 'SAIDA').reduce((s, m) => s + m.amount, 0);
        return {
          key: monthKey,
          title: `${m}/${y}`,
          subtitle: `${movs.length} movimentações no mês`,
          movements: movs,
          inflows: inSum,
          outflows: outSum
        };
      });
    }

    return [];
  }, [filteredMovements, groupingMode, today, totalInflows, totalOutflows]);

  // Exportação
  const handleExport = (format: 'EXCEL' | 'CSV') => {
    const headers = [
      'Data',
      'Tipo',
      'Descrição',
      'Cliente / Fornecedor',
      'Categoria Contábil',
      'Valor (R$)',
      'Saldo Acumulado (R$)',
      'Referência'
    ];

    const rows = filteredMovements.map(m => [
      formatDateBR(m.date),
      m.direction === 'ENTRADA' ? 'Entrada (+)' : 'Saída (-)',
      m.description,
      m.counterpartyName || '-',
      m.categoryName || '-',
      m.amount,
      m.runningBalance,
      m.originReferenceId || '-'
    ]);

    const filename = `Extrato_${account.name.replace(/\s+/g, '_')}_${today}`;
    if (format === 'EXCEL') {
      exportToExcel(filename, 'Extrato Bancario', headers, rows);
    } else {
      exportToCSV(filename, headers, rows);
    }
  };

  if (!isOpen || !account) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-[var(--surface-card)] border border-[var(--border-subtle)]/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-[var(--text-primary)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho do Extrato */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/15 rounded-xl border border-amber-500/30 text-amber-400">
              <Landmark className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight">
                  {account.name}
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                  {account.type === 'CORRENTE' ? 'Conta Corrente' : account.type === 'APLICACAO' ? 'Aplicação' : 'Caixa Físico'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-2 mt-0.5">
                <span>{account.institution}</span>
                {account.agency && <span>• Ag: {account.agency}</span>}
                {account.accountNumber && <span>• CC: {account.accountNumber}</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right mr-3 hidden sm:block">
              <div className="text-[10px] text-[var(--text-secondary)] uppercase font-semibold">Saldo Atual Disponível</div>
              <div className={`text-xl font-mono font-bold ${currentActualBalance >= 0 ? 'text-[var(--brand-gold)]' : 'text-[var(--status-danger)]'}`}>
                {formatBRL(currentActualBalance)}
              </div>
            </div>

            <button
              onClick={() => handleExport('EXCEL')}
              className="p-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-lg border border-[var(--border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Exportar para Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-[var(--status-success)]" />
              <span className="hidden md:inline">Exportar</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-colors"
              title="Fechar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Cards de Resumo do Período */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-[var(--surface-elevated)]/40 border-b border-[var(--border-subtle)]">
          <div className="p-3 rounded-xl bg-[var(--surface-elevated)]/60 border border-[var(--border-subtle)]/60 space-y-1">
            <div className="flex justify-between items-center text-[11px] text-[var(--text-secondary)]">
              <span>Saldo Inicial</span>
              <Wallet className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            </div>
            <div className="text-base font-mono font-bold text-[var(--text-primary)]">
              {formatBRL(account.initialBalance)}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Base cadastrada</div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-elevated)]/60 border border-[var(--border-subtle)]/60 space-y-1">
            <div className="flex justify-between items-center text-[11px] text-[var(--text-secondary)]">
              <span>Entradas (Período)</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--status-success)]" />
            </div>
            <div className="text-base font-mono font-bold text-[var(--status-success)]">
              +{formatBRL(totalInflows)}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {periodFilteredMovements.filter(m => m.direction === 'ENTRADA').length} recebimentos
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-elevated)]/60 border border-[var(--border-subtle)]/60 space-y-1">
            <div className="flex justify-between items-center text-[11px] text-[var(--text-secondary)]">
              <span>Saídas (Período)</span>
              <ArrowDownRight className="w-3.5 h-3.5 text-[var(--status-danger)]" />
            </div>
            <div className="text-base font-mono font-bold text-[var(--status-danger)]">
              -{formatBRL(totalOutflows)}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {periodFilteredMovements.filter(m => m.direction === 'SAIDA').length} pagamentos
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--surface-elevated)]/60 border border-amber-500/30 space-y-1">
            <div className="flex justify-between items-center text-[11px] text-[var(--brand-gold)] font-semibold">
              <span>Geração Líquida</span>
              <Receipt className="w-3.5 h-3.5 text-[var(--brand-gold)]" />
            </div>
            <div className={`text-base font-mono font-bold ${netPeriod >= 0 ? 'text-[var(--brand-gold)]' : 'text-[var(--status-danger)]'}`}>
              {netPeriod >= 0 ? `+${formatBRL(netPeriod)}` : formatBRL(netPeriod)}
            </div>
            <div className="text-[10px] text-[var(--brand-gold)]/80">Fluxo líquido no período</div>
          </div>
        </div>

        {/* Barra de Filtros e Modos de Agrupamento */}
        <div className="px-4 py-3 bg-[var(--surface-card)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          {/* Abas de Agrupamento */}
          <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
            <span className="text-[10px] text-[var(--text-muted)] font-semibold px-2 uppercase">Agrupar:</span>
            <button
              onClick={() => setGroupingMode('DAY')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                groupingMode === 'DAY'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-slate-200 hover:bg-[var(--surface-hover)]'
              }`}
            >
              Por Dia
            </button>
            <button
              onClick={() => setGroupingMode('WEEK')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                groupingMode === 'WEEK'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-slate-200 hover:bg-[var(--surface-hover)]'
              }`}
            >
              Por Semana
            </button>
            <button
              onClick={() => setGroupingMode('MONTH')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                groupingMode === 'MONTH'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-slate-200 hover:bg-[var(--surface-hover)]'
              }`}
            >
              Por Mês
            </button>
            <button
              onClick={() => setGroupingMode('LIST')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                groupingMode === 'LIST'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-slate-200 hover:bg-[var(--surface-hover)]'
              }`}
            >
              Lista Contínua
            </button>
          </div>

          {/* Filtro de Período, Direção e Busca */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Seletor de Período */}
            <PremiumSelect
              value={periodFilter}
              onChange={e => setPeriodFilter(e.target.value as PeriodFilter)}
              className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg px-2.5 py-1.5 focus:border-amber-500 outline-hidden font-medium"
            >
              <option value="CURRENT_MONTH">Mês Atual ({currentMonth}/{currentYear})</option>
              <option value="LAST_MONTH">Mês Anterior</option>
              <option value="LAST_90_DAYS">Últimos 90 dias</option>
              <option value="CURRENT_YEAR">Ano Atual ({currentYear})</option>
              <option value="ALL">Todo o Histórico</option>
            </PremiumSelect>

            {/* Direção */}
            <PremiumSelect
              value={directionFilter}
              onChange={e => setDirectionFilter(e.target.value as DirectionFilter)}
              className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg px-2.5 py-1.5 focus:border-amber-500 outline-hidden font-medium"
            >
              <option value="ALL">Todas Movimentações</option>
              <option value="ENTRADA">Apenas Entradas (+)</option>
              <option value="SAIDA">Apenas Saídas (-)</option>
            </PremiumSelect>

            {/* Campo de Busca */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar no extrato..."
                className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg pl-8 pr-3 py-1.5 text-xs focus:border-amber-500 outline-hidden w-40 sm:w-48 placeholder:text-slate-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista Agrupada de Lançamentos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {groupedData.length === 0 || filteredMovements.length === 0 ? (
            <div className="p-12 text-center text-[var(--text-muted)] space-y-2">
              <Landmark className="w-10 h-10 mx-auto text-slate-600" />
              <div className="font-semibold text-[var(--text-secondary)]">Nenhuma movimentação encontrada neste banco</div>
              <p className="text-xs text-slate-600">Altere o período ou os termos de busca para visualizar outros lançamentos.</p>
            </div>
          ) : (
            groupedData.map(group => (
              <div key={group.key} className="bg-[var(--surface-elevated)]/60 rounded-xl border border-[var(--border-subtle)] overflow-hidden shadow-xs">
                {/* Cabeçalho do Grupo (Dia / Semana / Mês) */}
                <div className="px-4 py-2.5 bg-[var(--surface-elevated)]/70 border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <CalendarDays className="w-4 h-4 text-[var(--brand-gold)]" />
                    <span className="font-bold text-[var(--text-primary)]">{group.title}</span>
                    {group.subtitle && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--surface-hover)]/60 text-[var(--text-primary)]">
                        {group.subtitle}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 text-[11px] font-mono">
                    <span className="text-[var(--status-success)]">
                      Entradas: +{formatBRL(group.inflows)}
                    </span>
                    <span className="text-[var(--status-danger)]">
                      Saídas: -{formatBRL(group.outflows)}
                    </span>
                    <span className={`font-bold ${group.inflows - group.outflows >= 0 ? 'text-[var(--brand-gold)]' : 'text-[var(--status-danger)]'}`}>
                      Líquido: {formatBRL(group.inflows - group.outflows)}
                    </span>
                  </div>
                </div>

                {/* Tabela de Transações do Grupo */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)]/80 text-[10px] text-[var(--text-secondary)] uppercase font-semibold bg-[var(--surface-card)]/50">
                        <th className="py-2 px-3">Data</th>
                        <th className="py-2 px-3">Histórico / Descrição</th>
                        <th className="py-2 px-3">Cliente / Fornecedor</th>
                        <th className="py-2 px-3">Categoria</th>
                        <th className="py-2 px-3 text-right">Valor</th>
                        <th className="py-2 px-3 text-right">Saldo Acumulado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]/50">
                      {group.movements.map(m => {
                        const isEntry = m.direction === 'ENTRADA';
                        return (
                          <tr key={m.id} className="hover:bg-[var(--surface-hover)]/40 transition-colors">
                            <td className="py-2.5 px-3 text-[var(--text-secondary)] font-mono whitespace-nowrap">
                              {formatDateBR(m.date)}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-[var(--text-primary)]">
                              <div className="flex items-center space-x-1.5">
                                <span className={`p-1 rounded-full ${isEntry ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                  {isEntry ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                </span>
                                <span>{m.description}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-[var(--text-primary)] truncate max-w-[180px]">
                              {m.counterpartyName || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-[var(--text-secondary)] truncate max-w-[150px]">
                              {m.categoryName || '-'}
                            </td>
                            <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                              isEntry ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'
                            }`}>
                              {isEntry ? `+${formatBRL(m.amount)}` : `-${formatBRL(m.amount)}`}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-[var(--text-primary)] whitespace-nowrap">
                              {formatBRL(m.runningBalance)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Rodapé Informativo */}
        <div className="px-6 py-3 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/90 flex flex-wrap items-center justify-between text-xs text-[var(--text-secondary)] gap-2">
          <span>
            Mostrando <strong>{filteredMovements.length}</strong> lançamentos no período filtrado.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] rounded-lg text-xs font-semibold transition-colors"
          >
            Fechar Extrato
          </button>
        </div>
      </div>
    </div>
  );
};
