import { formatCompetenceShort } from '../../utils/dateUtils';
import React, { useState, useMemo } from 'react';
import { 
  X, 
  FileText, 
  TrendingUp, 
  DollarSign, 
  AlertTriangle, 
  Calendar, 
  History, 
  CreditCard, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  Building2, 
  ChevronDown, 
  Layers, 
  ShieldCheck, 
  Receipt,
  FileCheck,
  Ban,
  Activity,
  UserCheck,
  ExternalLink
} from 'lucide-react';
import { Counterparty, Contract, FinancialTitle, Settlement, BankAccount } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { useIsSimpleMode } from '../../hooks/useViewMode';
import { PremiumSelect } from '../Common/PremiumSelect';

interface ClientFinancialHistoryModalProps {
  client: Counterparty;
  initialContractId?: string;
  onClose: () => void;
  onEditClient?: (client: Counterparty) => void;
}

type TabType = 'VISAO_GERAL' | 'PAGAMENTOS' | 'CONTRATOS' | 'ATRASOS' | 'MOVIMENTACOES';

interface MovementEvent {
  id: string;
  type: 'PAGAMENTO' | 'FATURA' | 'CONTRATO' | 'ATRASO' | 'AUDITORIA';
  date: string;
  title: string;
  description: string;
  amount?: string;
  amountNumber?: number;
  contractNumber?: string;
  statusBadge?: {
    label: string;
    color: string;
  };
  details?: string;
}

export const ClientFinancialHistoryModal: React.FC<ClientFinancialHistoryModalProps> = ({
  client,
  initialContractId,
  onClose,
  onEditClient
}) => {
  const simple = useIsSimpleMode();
  const [activeTab, setActiveTab] = useState<TabType>('VISAO_GERAL');
  const [selectedContractFilter, setSelectedContractFilter] = useState<string>(initialContractId || 'ALL');
  const [movementFilter, setMovementFilter] = useState<'ALL' | 'PAGAMENTO' | 'FATURA' | 'CONTRATO' | 'ATRASO'>('ALL');
  const [contractStatusFilter, setContractStatusFilter] = useState<'ALL' | 'ATIVO' | 'ENCERRADO'>('ALL');

  const today = new Date().toISOString().split('T')[0];

  // Base Data from Storage
  const allContracts = storage.getContracts();
  const allTitles = storage.getTitles();
  const allSettlements = storage.getSettlements();
  const bankAccounts = storage.getBankAccounts();
  const auditLogs = storage.getAuditLogs();

  // Client Specific Entities
  const clientContracts = useMemo(() => {
    return allContracts.filter(c => c.customerId === client.id);
  }, [allContracts, client.id]);

  const activeContracts = useMemo(() => {
    return clientContracts.filter(c => c.status === 'ATIVO');
  }, [clientContracts]);

  const closedContracts = useMemo(() => {
    return clientContracts.filter(c => c.status === 'ENCERRADO' || c.status === 'SUSPENSO');
  }, [clientContracts]);

  const clientTitles = useMemo(() => {
    return allTitles.filter(t => t.counterpartyId === client.id && t.type === 'RECEBER');
  }, [allTitles, client.id]);

  const clientTitlesMap = useMemo(() => {
    return new Map<string, FinancialTitle>(clientTitles.map(t => [t.id, t]));
  }, [clientTitles]);

  // Settlements (Payments received from client)
  const clientSettlements = useMemo(() => {
    return allSettlements.filter(s => !s.isReversed && clientTitlesMap.has(s.titleId));
  }, [allSettlements, clientTitlesMap]);

  // Filtered by Selected Contract (Dropdown)
  const filteredTitles = useMemo(() => {
    if (selectedContractFilter === 'ALL') return clientTitles;
    return clientTitles.filter(t => t.contractId === selectedContractFilter || t.originId === selectedContractFilter);
  }, [clientTitles, selectedContractFilter]);

  const filteredSettlements = useMemo(() => {
    if (selectedContractFilter === 'ALL') return clientSettlements;
    return clientSettlements.filter(s => {
      const title = clientTitlesMap.get(s.titleId);
      return title && (title.contractId === selectedContractFilter || title.originId === selectedContractFilter);
    });
  }, [clientSettlements, clientTitlesMap, selectedContractFilter]);

  // Delays (Títulos em atraso)
  const delayedTitles = useMemo(() => {
    return filteredTitles.filter(t => t.balancePrincipal > 0 && t.dueDate < today);
  }, [filteredTitles, today]);

  // Client Metrics
  const metrics = useMemo(() => {
    const totalInvoiced = filteredTitles.reduce((acc, t) => acc + t.originalAmount, 0);
    const totalReceived = filteredSettlements.reduce((acc, s) => acc + s.components.netFinancialAmount, 0);
    const openBalance = filteredTitles.reduce((acc, t) => acc + t.balancePrincipal, 0);
    const overdueBalance = delayedTitles.reduce((acc, t) => acc + t.balancePrincipal, 0);
    
    // Average days of delay for overdue titles
    const totalDelayDays = delayedTitles.reduce((acc, t) => {
      const diff = Math.max(0, Math.floor((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000));
      return acc + diff;
    }, 0);
    const avgDelayDays = delayedTitles.length > 0 ? Math.round(totalDelayDays / delayedTitles.length) : 0;

    // Monthly recurring value from active contracts
    const recurringMonthly = activeContracts.reduce((acc, c) => acc + c.monthlyTotal, 0);

    return {
      totalInvoiced,
      totalReceived,
      openBalance,
      overdueBalance,
      overdueCount: delayedTitles.length,
      avgDelayDays,
      recurringMonthly,
      totalContracts: clientContracts.length,
      activeContractsCount: activeContracts.length,
      closedContractsCount: closedContracts.length
    };
  }, [filteredTitles, filteredSettlements, delayedTitles, activeContracts, closedContracts, clientContracts, today]);

  // Selected Contract info
  const currentSelectedContract = useMemo(() => {
    if (selectedContractFilter === 'ALL') return null;
    return clientContracts.find(c => c.id === selectedContractFilter) || null;
  }, [clientContracts, selectedContractFilter]);

  // Full Unified Movement History (Timeline de movimentação)
  const movementHistory = useMemo<MovementEvent[]>(() => {
    const events: MovementEvent[] = [];

    // 1. Settlements (Pagamentos)
    filteredSettlements.forEach(s => {
      const title = clientTitlesMap.get(s.titleId);
      const bank = bankAccounts.find(b => b.id === s.bankAccountId);
      const contract = clientContracts.find(c => c.id === title?.contractId || c.id === title?.originId);

      events.push({
        id: `mov-set-${s.id}`,
        type: 'PAGAMENTO',
        date: s.settlementDate,
        title: `Pagamento Recebido (${s.settlementNumber})`,
        description: `Quitação ${title ? `do título ${title.titleNumber} (${title.description})` : 'de título a receber'}.`,
        amount: `+${formatBRL(s.components.netFinancialAmount)}`,
        amountNumber: s.components.netFinancialAmount,
        contractNumber: contract?.contractNumber,
        statusBadge: {
          label: 'RECEBIDO / LIQUIDADO',
          color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
        },
        details: `Conta creditada: ${bank?.name || 'Conta Bancária'} • Juros: ${formatBRL(s.components.interest)} • Multa: ${formatBRL(s.components.fine)} • Desconto: ${formatBRL(s.components.discount)}`
      });
    });

    // 2. Titles (Faturamentos gerados)
    filteredTitles.forEach(t => {
      const contract = clientContracts.find(c => c.id === t.contractId || c.id === t.originId);
      events.push({
        id: `mov-tit-${t.id}`,
        type: 'FATURA',
        date: t.launchDate || t.issueDate,
        title: `Fatura Emitida (${t.titleNumber})`,
        description: `${t.description} • Competência: ${t.competence} • Vencimento: ${formatDateBR(t.dueDate)}`,
        amount: formatBRL(t.originalAmount),
        amountNumber: t.originalAmount,
        contractNumber: contract?.contractNumber,
        statusBadge: {
          label: t.settlementState,
          color: t.settlementState === 'LIQUIDADO' 
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
            : t.dueDate < today 
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
        },
        details: `Saldo devedor atual: ${formatBRL(t.balancePrincipal)}`
      });
    });

    // 3. Contracts (Início ou Encerramento)
    clientContracts.forEach(c => {
      if (selectedContractFilter !== 'ALL' && c.id !== selectedContractFilter) return;

      events.push({
        id: `mov-ct-start-${c.id}`,
        type: 'CONTRATO',
        date: c.startDate,
        title: `Início do Contrato (${c.contractNumber})`,
        description: `${c.description} • Mensalidade: ${formatBRL(c.monthlyTotal)} (Vencimento todo dia ${c.dueDay})`,
        amount: `${formatBRL(c.monthlyTotal)}/mês`,
        contractNumber: c.contractNumber,
        statusBadge: {
          label: c.status === 'ATIVO' ? 'CONTRATO ATIVO' : 'CONTRATO REGISTRADO',
          color: 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
        },
        details: `Serviços: ${c.items.map(i => i.description).join(', ')}`
      });

      if (c.endDate) {
        events.push({
          id: `mov-ct-end-${c.id}`,
          type: 'CONTRATO',
          date: c.endDate,
          title: `Encerramento de Contrato (${c.contractNumber})`,
          description: `Término da vigência contratual. ${c.notes || ''}`,
          contractNumber: c.contractNumber,
          statusBadge: {
            label: 'CONTRATO ENCERRADO',
            color: 'bg-slate-500/10 text-slate-400 border border-slate-500/30'
          },
          details: `Status final: ${c.status}`
        });
      }
    });

    // 4. Overdue Delays Events
    delayedTitles.forEach(t => {
      const diff = Math.max(0, Math.floor((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000));
      const contract = clientContracts.find(c => c.id === t.contractId || c.id === t.originId);

      events.push({
        id: `mov-delay-${t.id}`,
        type: 'ATRASO',
        date: t.dueDate,
        title: `Vencimento Ultrapassado (${t.titleNumber})`,
        description: `Título com vencimento em ${formatDateBR(t.dueDate)} atingiu ${diff} dias de atraso.`,
        amount: `Saldo: ${formatBRL(t.balancePrincipal)}`,
        amountNumber: t.balancePrincipal,
        contractNumber: contract?.contractNumber,
        statusBadge: {
          label: `${diff} DIAS DE ATRASO`,
          color: 'bg-rose-500/15 text-rose-400 border border-rose-500/40 font-bold'
        },
        details: `Multa contratual projetada: 2% (${formatBRL(t.balancePrincipal * 0.02)}) + juros de mora.`
      });
    });

    // Sort descending by date
    return events.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredSettlements, filteredTitles, clientContracts, clientTitlesMap, bankAccounts, delayedTitles, selectedContractFilter, today]);

  // Filtered movements for the movement history tab
  const displayedMovements = useMemo(() => {
    if (movementFilter === 'ALL') return movementHistory;
    return movementHistory.filter(m => m.type === movementFilter);
  }, [movementHistory, movementFilter]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in">
      <div className="bg-[var(--surface-card)] text-[var(--text-primary)] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[var(--border-subtle)] transition-all">
        
        {/* MODAL HEADER */}
        <div className="p-6 sm:p-7 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="adv-only text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-400/30">
                Ficha Financeira & Histórico Operacional
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                client.status === 'ATIVO' 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                  : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
              }`}>
                {client.status}
              </span>
              {activeContracts.length > 0 && (
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                  {activeContracts.length} {activeContracts.length === 1 ? 'contrato ativo' : 'contratos ativos'}
                </span>
              )}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mt-1.5 flex items-center">
              {client.name}
              {client.tradeName && (
                <span className="text-sm font-normal text-[var(--text-secondary)] ml-2">
                  ({client.tradeName})
                </span>
              )}
            </h2>
            <div className="text-sm text-[var(--text-secondary)] mt-1.5">
              <span className="adv-only">CNPJ/CPF: {client.document || 'Não informado'} • </span>E-mail: {client.email || 'Não informado'} • Tel: {client.phone || '-'}
            </div>
          </div>

          {/* DROPDOWN DE VINCULAÇÃO COM CONTRATOS ATIVOS (SEMPRE VISÍVEL NO TOPO) */}
          <div className="flex items-center space-x-3">
            <div className="adv-only relative min-w-[260px] sm:min-w-[320px]">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1 flex items-center">
                <FileText className="w-3 h-3 mr-1 text-amber-400" />
                Vínculo com Contrato Ativo:
              </label>
              <div className="relative">
                <PremiumSelect
                  value={selectedContractFilter}
                  onChange={(e) => setSelectedContractFilter(e.target.value)}
                  className="w-full appearance-none pl-3 pr-8 py-2 text-xs rounded-xl bg-[var(--surface-card)] text-[var(--text-primary)] border border-amber-500/40 focus:border-amber-400 focus:outline-none shadow-xs font-medium cursor-pointer"
                >
                  <option value="ALL">
                    📋 Todos os Contratos ({clientContracts.length} no total)
                  </option>
                  {activeContracts.length > 0 && (
                    <optgroup label="Contratos Ativos">
                      {activeContracts.map(ct => (
                        <option key={ct.id} value={ct.id}>
                          🟢 {ct.contractNumber} - {formatBRL(ct.monthlyTotal)}/mês (Dia {ct.dueDay})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {closedContracts.length > 0 && (
                    <optgroup label="Contratos Encerrados / Suspensos">
                      {closedContracts.map(ct => (
                        <option key={ct.id} value={ct.id}>
                          ⚪ {ct.contractNumber} - {ct.status} ({formatBRL(ct.monthlyTotal)}/mês)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </PremiumSelect>
                <ChevronDown className="w-4 h-4 text-amber-400 absolute right-2.5 top-2.5 pointer-events-none" />
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] transition-colors self-start mt-4 sm:mt-0"
              title="Fechar Ficha"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ACTIVE CONTRACT SUMMARY BANNER (When a contract is selected) */}
        {currentSelectedContract && (
          <div className="adv-only bg-amber-950/30 border-b border-amber-500/20 px-5 py-2.5 flex flex-wrap items-center justify-between text-xs gap-3">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${currentSelectedContract.status === 'ATIVO' ? 'bg-amber-400 animate-pulse' : 'bg-slate-400'}`} />
              <strong className="text-amber-300 font-mono">{currentSelectedContract.contractNumber}</strong>
              <span className="text-[var(--text-secondary)]">•</span>
              <span className="text-[var(--text-primary)]">{currentSelectedContract.description}</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-[var(--text-secondary)]">
                Vencimento: <strong className="text-[var(--text-primary)]">dia {currentSelectedContract.dueDay}</strong>
              </span>
              <span className="text-[var(--text-secondary)]">
                Mensalidade: <strong className="text-amber-400 font-mono font-bold">{formatBRL(currentSelectedContract.monthlyTotal)}</strong>
              </span>
              <span className="text-[var(--text-secondary)]">
                Cobrança: <strong className="text-[var(--text-primary)]">{currentSelectedContract.billingMethod}</strong>
              </span>
              <button
                onClick={() => setSelectedContractFilter('ALL')}
                className="text-[11px] text-amber-400 hover:underline ml-2"
              >
                Limpar Filtro
              </button>
            </div>
          </div>
        )}

        {/* NAVIGATION TABS */}
        <div className="border-b border-[var(--border-subtle)] px-6 flex items-center space-x-2 bg-[var(--surface-elevated)] overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('VISAO_GERAL')}
            className={`py-4 px-4 font-semibold transition-all border-b-2 flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'VISAO_GERAL'
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{simple ? 'Resumo' : 'Visão Geral & Indicadores'}</span>
          </button>

          <button
            onClick={() => setActiveTab('PAGAMENTOS')}
            className={`py-4 px-4 font-semibold transition-all border-b-2 flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'PAGAMENTOS'
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>{simple ? 'Pagamentos' : 'Histórico de Pagamentos'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold ml-1">
              {filteredSettlements.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('CONTRATOS')}
            className={`py-4 px-4 font-semibold transition-all border-b-2 flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'CONTRATOS'
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Contratos ({clientContracts.length})</span>
            {activeContracts.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold ml-1">
                {activeContracts.length} Ativo(s)
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ATRASOS')}
            className={`py-4 px-4 font-semibold transition-all border-b-2 flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'ATRASOS'
                ? 'border-rose-400 text-rose-400 bg-rose-500/5'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>{simple ? 'Em atraso' : 'Atrasos & Inadimplência'}</span>
            {metrics.overdueCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold ml-1 animate-pulse">
                {metrics.overdueCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('MOVIMENTACOES')}
            className={`adv-only py-3 px-3.5 font-semibold transition-all border-b-2 flex items-center space-x-1.5 whitespace-nowrap ${
              activeTab === 'MOVIMENTACOES'
                ? 'border-amber-400 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Histórico de Movimentação Completo</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-500/10 text-[var(--text-secondary)] border border-[var(--border-subtle)] ml-1">
              {movementHistory.length}
            </span>
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-8 flex-1 text-sm">
          
          {/* TAB 1: VISÃO GERAL */}
          {activeTab === 'VISAO_GERAL' && (
            <div className="space-y-8">
              
              {/* O que mais importa: atraso e quanto falta receber */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className={`p-6 rounded-2xl border ${
                  metrics.overdueCount > 0
                    ? 'bg-[var(--status-danger-bg)] border-[var(--status-danger)]/40'
                    : 'bg-[var(--status-success-bg)] border-[var(--status-success)]/30'
                }`}>
                  <div className={`flex items-center gap-2 text-sm font-medium ${metrics.overdueCount > 0 ? 'text-[var(--status-danger)]' : 'text-[var(--status-success)]'}`}>
                    {metrics.overdueCount > 0 ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>{metrics.overdueCount > 0 ? 'Em atraso' : 'Tudo em dia'}</span>
                  </div>
                  <div className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${metrics.overdueCount > 0 ? 'text-[var(--status-danger)]' : 'text-[var(--text-primary)]'}`}>
                    {formatBRL(metrics.overdueBalance)}
                  </div>
                  <div className="mt-1.5 text-sm text-[var(--text-secondary)]">
                    {metrics.overdueCount > 0
                      ? `${metrics.overdueCount} ${metrics.overdueCount === 1 ? 'conta vencida' : 'contas vencidas'}, em média ${metrics.avgDelayDays} dias de atraso`
                      : 'Nenhuma conta vencida'}
                  </div>
                </div>

                <div className="p-6 rounded-2xl border border-[var(--gold-edge)] bg-[var(--brand-gold-soft)]">
                  <div className="flex items-center gap-2 text-sm font-medium text-[var(--brand-gold)]">
                    <Clock className="w-4 h-4" />
                    <span>A receber</span>
                  </div>
                  <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">
                    {formatBRL(metrics.openBalance)}
                  </div>
                  <div className="mt-1.5 text-sm text-[var(--text-secondary)]">Saldo em aberto deste cliente</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="px-6 py-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                  <div className="text-sm text-[var(--text-secondary)]">Total faturado</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">{formatBRL(metrics.totalInvoiced)}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">{filteredTitles.length} {simple ? 'cobranças' : 'títulos emitidos'}</div>
                </div>
                <div className="px-6 py-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                  <div className="text-sm text-[var(--text-secondary)]">Total recebido</div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-[var(--status-success)]">{formatBRL(metrics.totalReceived)}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">{filteredSettlements.length} pagamentos</div>
                </div>
              </div>

              {/* Active Contracts Quick Glance */}
              <div className="bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border-subtle)] p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-[var(--text-primary)] flex items-center text-base">
                    <FileText className="w-4 h-4 mr-1.5 text-amber-400" />
                    {simple ? 'Contratos' : 'Contratos Recorrentes do Cliente'}
                  </h3>
                  <div className="text-xs text-[var(--text-secondary)]">
                    {simple ? 'Receita mensal' : 'Receita recorrente ativa'}: <strong className="text-amber-400 font-mono">{formatBRL(metrics.recurringMonthly)}/mês</strong>
                  </div>
                </div>

                {clientContracts.length === 0 ? (
                  <p className="text-[var(--text-secondary)] p-3 bg-[var(--surface-card)] rounded-lg border border-[var(--border-subtle)]">
                    Nenhum contrato recorrente vinculado a este cliente no momento.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {clientContracts.map(ct => (
                      <div 
                        key={ct.id} 
                        className={`p-5 rounded-xl border transition-all ${
                          ct.status === 'ATIVO' 
                            ? 'bg-[var(--brand-gold-soft)] border-[var(--gold-edge)]' 
                            : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-75'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="adv-only font-semibold tabular-nums text-amber-300">{ct.contractNumber}</span>
                            <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                              ct.status === 'ATIVO' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                                : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                            }`}>
                              {ct.status}
                            </span>
                            <div className="font-medium text-[var(--text-primary)] mt-1">{ct.description}</div>
                            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                              Vencimento: dia {ct.dueDay} • Cobrança: {ct.billingMethod}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold tabular-nums text-[var(--text-primary)] text-sm block">
                              {formatBRL(ct.monthlyTotal)}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)]">/mês</span>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                          <span className="adv-only text-[var(--text-secondary)] truncate max-w-[200px]">
                            {ct.items.map(i => i.description).join(', ')}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedContractFilter(ct.id);
                              setActiveTab('PAGAMENTOS');
                            }}
                            className="text-amber-400 hover:underline font-medium inline-flex items-center"
                          >
                            Ver pagamentos
                            <ArrowUpRight className="w-3 h-3 ml-0.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Settlements and Delays Snapshot */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* Recent Payments Box */}
                <div className="bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border-subtle)] p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-[var(--text-primary)] flex items-center text-base">
                      <CreditCard className="w-4 h-4 mr-1.5 text-emerald-400" />
                      {simple ? 'Últimos pagamentos' : 'Últimos Pagamentos Recebidos'}
                    </h3>
                    <button
                      onClick={() => setActiveTab('PAGAMENTOS')}
                      className="text-xs text-amber-400 hover:underline font-medium"
                    >
                      Ver todos ({clientSettlements.length})
                    </button>
                  </div>

                  {clientSettlements.length === 0 ? (
                    <p className="text-[var(--text-secondary)] p-3 text-center">Nenhum pagamento registrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {clientSettlements.slice(0, 4).map(s => {
                        const title = clientTitlesMap.get(s.titleId);
                        const bank = bankAccounts.find(b => b.id === s.bankAccountId);
                        return (
                          <div key={s.id} className="px-4 py-3 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] flex justify-between items-center">
                            <div>
                              <div className="font-semibold text-[var(--text-primary)] flex items-center space-x-1.5">
                                <span className="adv-only">{s.settlementNumber}</span><span className="simple-only">{title?.description || 'Pagamento'}</span>
                                <span className="text-[10px] text-[var(--text-secondary)] font-normal font-mono">
                                  ({formatDateBR(s.settlementDate)})
                                </span>
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)]">
                                <span className="adv-only">{title?.titleNumber} - {title?.description} • </span>{bank?.name || 'Banco'}
                              </div>
                            </div>
                            <span className="font-semibold tabular-nums text-emerald-400">
                              {formatBRL(s.components.netFinancialAmount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Overdue Delays Box */}
                <div className="bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border-subtle)] p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-[var(--status-danger)] flex items-center text-base">
                      <AlertTriangle className="w-4 h-4 mr-1.5 text-rose-400" />
                      {simple ? 'Em atraso' : 'Situação de Atrasos & Cobrança'}
                    </h3>
                    <button
                      onClick={() => setActiveTab('ATRASOS')}
                      className="text-xs text-amber-400 hover:underline font-medium"
                    >
                      Detalhar ({delayedTitles.length})
                    </button>
                  </div>

                  {delayedTitles.length === 0 ? (
                    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-center space-y-1">
                      <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-400" />
                      <div className="font-bold text-xs">Cliente 100% Adimplente!</div>
                      <div className="text-[11px] text-emerald-300/80">Nenhum título em atraso na carteira.</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {delayedTitles.slice(0, 4).map(t => {
                        const diff = Math.max(0, Math.floor((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000));
                        return (
                          <div key={t.id} className="px-4 py-3 rounded-xl bg-[var(--status-danger-bg)] border border-[var(--status-danger)]/30 flex justify-between items-center">
                            <div>
                              <div className="font-semibold text-rose-300 flex items-center space-x-1.5">
                                <span className="adv-only">{t.titleNumber}</span><span className="simple-only">{t.description}</span>
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">
                                  {diff} dias de atraso
                                </span>
                              </div>
                              <div className="text-[11px] text-[var(--text-secondary)]">
                                Venceu em {formatDateBR(t.dueDate)}<span className="adv-only"> • Comp: {formatCompetenceShort(t.competence)}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-semibold tabular-nums text-rose-400 block">
                                {formatBRL(t.balancePrincipal)}
                              </span>
                              <span className="text-[10px] text-[var(--text-secondary)]">Saldo a liquidar</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: HISTÓRICO DE PAGAMENTOS */}
          {activeTab === 'PAGAMENTOS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-sm flex items-center">
                    <CreditCard className="w-4 h-4 mr-1.5 text-emerald-400" />
                    Histórico Completo de Pagamentos (Liquidações)
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Todos os pagamentos e baixas efetuadas pelo cliente registradas no sistema.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[var(--text-secondary)]">Total pago no filtro: </span>
                  <strong className="text-emerald-400 font-mono font-bold text-sm">
                    {formatBRL(metrics.totalReceived)}
                  </strong>
                </div>
              </div>

              {filteredSettlements.length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] space-y-2">
                  <CreditCard className="w-8 h-8 mx-auto text-[var(--text-secondary)]" />
                  <p className="text-[var(--text-secondary)] font-medium">Nenhum pagamento encontrado com os filtros atuais.</p>
                  {selectedContractFilter !== 'ALL' && (
                    <button
                      onClick={() => setSelectedContractFilter('ALL')}
                      className="text-amber-400 underline text-xs"
                    >
                      Remover filtro de contrato
                    </button>
                  )}
                </div>
              ) : (
                <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--surface-card)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Data Pagto</th>
                        <th className="py-2.5 px-3">Nº Liquidação</th>
                        <th className="py-2.5 px-3">Título / Competência</th>
                        <th className="py-2.5 px-3">Contrato Vinculado</th>
                        <th className="py-2.5 px-3 text-right">Principal</th>
                        <th className="py-2.5 px-3 text-right">Juros/Multa</th>
                        <th className="py-2.5 px-3 text-right">Valor Líquido</th>
                        <th className="py-2.5 px-3">Conta Creditada</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-tabular">
                      {filteredSettlements.map(s => {
                        const title = clientTitlesMap.get(s.titleId);
                        const bank = bankAccounts.find(b => b.id === s.bankAccountId);
                        const contract = clientContracts.find(c => c.id === title?.contractId || c.id === title?.originId);
                        const additions = s.components.interest + s.components.fine;

                        return (
                          <tr key={s.id} className="hover:bg-[var(--surface-elevated)]/60 transition-colors">
                            <td className="py-2.5 px-3 font-medium text-[var(--text-primary)] font-mono">
                              {formatDateBR(s.settlementDate)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-amber-400 font-semibold">
                              {s.settlementNumber}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-medium text-[var(--text-primary)]">{title?.titleNumber || '-'}</div>
                              <div className="text-[10px] text-[var(--text-secondary)]">Comp: {title?.competence || '-'}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              {contract ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[10px]">
                                  {contract.contractNumber}
                                </span>
                              ) : (
                                <span className="text-[var(--text-secondary)] text-[10px]">Faturamento Avulso</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium text-[var(--text-primary)]">
                              {formatBRL(s.components.principalSettled)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[var(--text-secondary)]">
                              {additions > 0 ? (
                                <span className="text-amber-400 font-medium">+{formatBRL(additions)}</span>
                              ) : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-400">
                              {formatBRL(s.components.netFinancialAmount)}
                            </td>
                            <td className="py-2.5 px-3 text-[var(--text-secondary)]">
                              {bank?.name || 'Conta Corrente'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                LIQUIDADO
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONTRATOS (ATIVOS E ENCERRADOS) */}
          {activeTab === 'CONTRATOS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-sm flex items-center">
                    <FileText className="w-4 h-4 mr-1.5 text-amber-400" />
                    Contratos do Cliente (Ativos e Encerrados)
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Histórico contratual completo com vigência, serviços contemplados e valores mensais.
                  </p>
                </div>

                {/* Status Filter for Contracts */}
                <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-lg border border-[var(--border-subtle)] text-xs">
                  <button
                    onClick={() => setContractStatusFilter('ALL')}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      contractStatusFilter === 'ALL'
                        ? 'bg-amber-500/20 text-amber-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Todos ({clientContracts.length})
                  </button>
                  <button
                    onClick={() => setContractStatusFilter('ATIVO')}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      contractStatusFilter === 'ATIVO'
                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Ativos ({activeContracts.length})
                  </button>
                  <button
                    onClick={() => setContractStatusFilter('ENCERRADO')}
                    className={`px-2.5 py-1 rounded font-medium transition-all ${
                      contractStatusFilter === 'ENCERRADO'
                        ? 'bg-slate-500/20 text-slate-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Encerrados ({closedContracts.length})
                  </button>
                </div>
              </div>

              {clientContracts
                .filter(c => contractStatusFilter === 'ALL' || c.status === contractStatusFilter)
                .length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-[var(--text-secondary)]" />
                  <p className="text-[var(--text-secondary)]">Nenhum contrato encontrado nesta categoria.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {clientContracts
                    .filter(c => contractStatusFilter === 'ALL' || c.status === contractStatusFilter)
                    .map(ct => {
                      const isSelectedInHeader = selectedContractFilter === ct.id;
                      const contractSettlements = clientSettlements.filter(s => {
                        const title = clientTitlesMap.get(s.titleId);
                        return title?.contractId === ct.id || title?.originId === ct.id;
                      });
                      const contractTotalPaid = contractSettlements.reduce((acc, s) => acc + s.components.netFinancialAmount, 0);

                      return (
                        <div 
                          key={ct.id}
                          className={`p-4 rounded-xl border transition-all ${
                            isSelectedInHeader
                              ? 'bg-amber-950/30 border-amber-400 ring-1 ring-amber-400/40'
                              : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                            <div className="flex items-center space-x-2.5">
                              <div className={`p-2 rounded-lg ${ct.status === 'ATIVO' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                <FileText className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold tabular-nums text-base text-[var(--text-primary)]">{ct.contractNumber}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    ct.status === 'ATIVO' 
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                                      : ct.status === 'CANCELADO'
                                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                      : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                                  }`}>
                                    {ct.status}
                                  </span>
                                  {ct.cancellationDate && (
                                    <span className="text-[10px] text-rose-400 font-medium">
                                      • Cancelado em {formatDateBR(ct.cancellationDate)} {ct.cancellationReason ? `(${ct.cancellationReason})` : ''}
                                    </span>
                                  )}
                                  {isSelectedInHeader && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400">
                                      ✓ Atualmente Filtrado
                                    </span>
                                  )}
                                </div>
                                <div className="font-medium text-[var(--text-primary)] text-xs mt-0.5">{ct.description}</div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-3">
                              <div className="text-right">
                                <span className="text-[10px] text-[var(--text-secondary)] block">Valor Mensal:</span>
                                <span className="font-semibold tabular-nums text-amber-400 text-base">{formatBRL(ct.monthlyTotal)}</span>
                              </div>
                              <button
                                onClick={() => {
                                  setSelectedContractFilter(ct.id);
                                  setActiveTab('PAGAMENTOS');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors"
                              >
                                Filtrar Histórico
                              </button>
                            </div>
                          </div>

                          {/* Contract Meta Data */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 text-xs border-b border-[var(--border-subtle)]">
                            <div>
                              <span className="text-[var(--text-secondary)] text-[10px] block uppercase font-semibold">Início de Vigência:</span>
                              <span className="font-mono text-[var(--text-primary)]">{formatDateBR(ct.startDate)}</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-secondary)] text-[10px] block uppercase font-semibold">Término / Encerramento:</span>
                              <span className="font-mono text-[var(--text-primary)]">{ct.endDate ? formatDateBR(ct.endDate) : 'Vigência Indeterminada'}</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-secondary)] text-[10px] block uppercase font-semibold">Dia de Vencimento:</span>
                              <span className="font-bold text-[var(--text-primary)]">Dia {ct.dueDay} ({ct.dueRule === 'NEXT_MONTH' ? 'Mês subsequente' : 'Mês atual'})</span>
                            </div>
                            <div>
                              <span className="text-[var(--text-secondary)] text-[10px] block uppercase font-semibold">Forma de Cobrança:</span>
                              <span className="font-medium text-[var(--text-primary)]">{ct.billingMethod}</span>
                            </div>
                          </div>

                          {/* Services Included in Contract */}
                          <div className="pt-3">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] block mb-1.5">
                              Serviços Contratados ({ct.items.length}):
                            </span>
                            <div className="space-y-1.5">
                              {ct.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs p-2 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)]">
                                  <div className="flex items-center space-x-2">
                                    <FileCheck className="w-3.5 h-3.5 text-amber-400" />
                                    <span className="font-medium text-[var(--text-primary)]">{item.description}</span>
                                    <span className="text-[10px] text-[var(--text-secondary)]">({item.quantity}x)</span>
                                  </div>
                                  <span className="font-mono font-semibold text-[var(--text-primary)]">{formatBRL(item.unitPrice * item.quantity)}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Notes and financial summary */}
                          <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex flex-wrap justify-between items-center text-[11px] text-[var(--text-secondary)] gap-2">
                            <span>{ct.notes || 'Sem observações registradas.'}</span>
                            <span className="text-[var(--text-primary)] font-medium">
                              Total liquidado neste contrato: <strong className="text-emerald-400 font-mono">{formatBRL(contractTotalPaid)}</strong> ({contractSettlements.length} pagamentos)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ATRASOS & INADIMPLÊNCIA */}
          {activeTab === 'ATRASOS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
                <div>
                  <h3 className="font-bold text-rose-400 text-sm flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1.5 text-rose-400" />
                    Títulos em Atraso & Análise de Inadimplência
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Títulos com vencimento ultrapassado e saldo em aberto com contagem precisa de dias de atraso.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-[var(--text-secondary)]">Dívida total vencida: </span>
                  <strong className="text-rose-400 font-mono font-bold text-sm">
                    {formatBRL(metrics.overdueBalance)}
                  </strong>
                </div>
              </div>

              {delayedTitles.length === 0 ? (
                <div className="p-8 text-center bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
                  <h4 className="font-bold text-sm text-emerald-300">Nenhum Título em Atraso</h4>
                  <p className="text-xs text-emerald-200/80 max-w-md mx-auto">
                    Este cliente está em dia com todas as suas obrigações financeiras. Todos os títulos vencidos foram devidamente liquidados.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  
                  {/* Alert summary banner */}
                  <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-rose-300 flex items-center text-xs uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 mr-1.5 text-rose-400" />
                        Alerta de Cobrança Ativo
                      </div>
                      <div className="text-xs text-rose-200/80 mt-1">
                        Existem <strong>{delayedTitles.length} título(s)</strong> em atraso acumulando saldo devedor de <strong>{formatBRL(metrics.overdueBalance)}</strong>. Média de atraso: <strong>{metrics.avgDelayDays} dias</strong>.
                      </div>
                    </div>
                  </div>

                  {/* Delayed Titles Table */}
                  <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--surface-card)]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">Título</th>
                          <th className="py-2.5 px-3">Competência</th>
                          <th className="py-2.5 px-3">Vencimento</th>
                          <th className="py-2.5 px-3 text-center">Dias de Atraso</th>
                          <th className="py-2.5 px-3 text-right">Valor Original</th>
                          <th className="py-2.5 px-3 text-right">Saldo Devedor</th>
                          <th className="py-2.5 px-3 text-right">Multa (2%) + Juros</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)] font-tabular">
                        {delayedTitles.map(t => {
                          const diff = Math.max(0, Math.floor((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000));
                          const fine = t.balancePrincipal * 0.02;
                          const interest = t.balancePrincipal * 0.00033 * diff;
                          const projectedTotal = t.balancePrincipal + fine + interest;

                          return (
                            <tr key={t.id} className="hover:bg-rose-950/10 transition-colors">
                              <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)]">
                                {t.titleNumber}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[var(--text-secondary)]">
                                {t.competence}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-medium text-rose-400">
                                {formatDateBR(t.dueDate)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  {diff} dias
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-medium text-[var(--text-secondary)]">
                                {formatBRL(t.originalAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-rose-400">
                                {formatBRL(t.balancePrincipal)}
                              </td>
                              <td className="py-2.5 px-3 text-right text-[11px] text-amber-400">
                                +{formatBRL(fine + interest)}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                  VENCIDO
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* TAB 5: HISTÓRICO DE MOVIMENTAÇÃO COMPLETO (TIMELINE) */}
          {activeTab === 'MOVIMENTACOES' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                <div>
                  <h3 className="font-bold text-[var(--text-primary)] text-sm flex items-center">
                    <History className="w-4 h-4 mr-1.5 text-amber-400" />
                    Linha do Tempo de Movimentações do Cliente
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Extrato unificado de pagamentos, contratos firmados, emissão de faturas e auditoria cadastral em ordem cronológica.
                  </p>
                </div>

                {/* Filter by Movement Type */}
                <div className="flex items-center space-x-1 bg-[var(--surface-elevated)] p-1 rounded-lg border border-[var(--border-subtle)] text-xs">
                  <button
                    onClick={() => setMovementFilter('ALL')}
                    className={`px-2 py-1 rounded font-medium transition-all ${
                      movementFilter === 'ALL'
                        ? 'bg-amber-500/20 text-amber-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Todas ({movementHistory.length})
                  </button>
                  <button
                    onClick={() => setMovementFilter('PAGAMENTO')}
                    className={`px-2 py-1 rounded font-medium transition-all ${
                      movementFilter === 'PAGAMENTO'
                        ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Pagamentos
                  </button>
                  <button
                    onClick={() => setMovementFilter('FATURA')}
                    className={`px-2 py-1 rounded font-medium transition-all ${
                      movementFilter === 'FATURA'
                        ? 'bg-amber-500/20 text-amber-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Faturas
                  </button>
                  <button
                    onClick={() => setMovementFilter('CONTRATO')}
                    className={`px-2 py-1 rounded font-medium transition-all ${
                      movementFilter === 'CONTRATO'
                        ? 'bg-amber-500/20 text-amber-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Contratos
                  </button>
                  <button
                    onClick={() => setMovementFilter('ATRASO')}
                    className={`px-2 py-1 rounded font-medium transition-all ${
                      movementFilter === 'ATRASO'
                        ? 'bg-rose-500/20 text-rose-300 font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Atrasos
                  </button>
                </div>
              </div>

              {displayedMovements.length === 0 ? (
                <div className="p-8 text-center bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] space-y-2">
                  <History className="w-8 h-8 mx-auto text-[var(--text-secondary)]" />
                  <p className="text-[var(--text-secondary)]">Nenhuma movimentação encontrada para o filtro selecionado.</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border-subtle)]">
                  {displayedMovements.map(ev => {
                    return (
                      <div key={ev.id} className="relative group">
                        {/* Dot indicator */}
                        <div className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 bg-[var(--surface-card)] ${
                          ev.type === 'PAGAMENTO'
                            ? 'border-emerald-400 ring-4 ring-emerald-500/10'
                            : ev.type === 'ATRASO'
                              ? 'border-rose-400 ring-4 ring-rose-500/10'
                              : ev.type === 'CONTRATO'
                                ? 'border-amber-400 ring-4 ring-amber-500/10'
                                : 'border-amber-400 ring-4 ring-amber-500/10'
                        }`} />

                        <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] group-hover:border-amber-500/30 transition-all">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                                {formatDateBR(ev.date)}
                              </span>
                              <span className="text-[var(--text-secondary)]">•</span>
                              <span className="font-bold text-[var(--text-primary)] text-xs">
                                {ev.title}
                              </span>
                              {ev.contractNumber && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                  {ev.contractNumber}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              {ev.amount && (
                                <span className={`font-mono font-bold text-xs ${
                                  ev.type === 'PAGAMENTO' 
                                    ? 'text-emerald-400' 
                                    : ev.type === 'ATRASO' 
                                      ? 'text-rose-400' 
                                      : 'text-[var(--text-primary)]'
                                }`}>
                                  {ev.amount}
                                </span>
                              )}
                              {ev.statusBadge && (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${ev.statusBadge.color}`}>
                                  {ev.statusBadge.label}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-[var(--text-secondary)] mt-1">
                            {ev.description}
                          </div>

                          {ev.details && (
                            <div className="text-[11px] text-[var(--text-secondary)]/80 mt-1.5 pt-1.5 border-t border-[var(--border-subtle)] font-mono">
                              {ev.details}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap justify-between items-center gap-3">
          <div className="text-xs text-[var(--text-secondary)]">
            Cadastrado em: <strong className="text-[var(--text-primary)] font-mono">{formatDateBR(client.createdAt || '2026-01-01')}</strong>
          </div>
          <div className="flex items-center space-x-2">
            {onEditClient && (
              <button
                onClick={() => {
                  onClose();
                  onEditClient(client);
                }}
                className="px-4 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl transition-colors"
              >
                Editar Cadastro
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-[#0b0b0d] bg-amber-400 hover:bg-amber-300 rounded-xl shadow-[0_0_12px_rgba(245,158,11,0.3)] transition-all"
            >
              Fechar Ficha
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
