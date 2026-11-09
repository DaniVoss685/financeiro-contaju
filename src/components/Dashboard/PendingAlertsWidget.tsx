import { formatCompetenceShort } from '../../utils/dateUtils';
import React, { useMemo } from 'react';
import { 
  BellRing, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  Clock,
  ExternalLink,
  DollarSign
} from 'lucide-react';
import { FinancialTitle, Counterparty } from '../../types';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { storage } from '../../services/storageService';
import { Card, IconTile, IconBadge } from '../Common/ui';
import { NavigationScreen } from '../Sidebar';

interface PendingAlertsWidgetProps {
  titles: FinancialTitle[];
  counterparties?: Counterparty[];
  onNavigate: (screen: NavigationScreen) => void;
  onSelectTitle?: (title: FinancialTitle) => void;
}

export const PendingAlertsWidget: React.FC<PendingAlertsWidgetProps> = ({
  titles = [],
  counterparties = [],
  onNavigate,
  onSelectTitle
}) => {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);
  const in3DaysStr = in3Days.toISOString().split('T')[0];

  const effectiveCounterparties = Array.isArray(counterparties) && counterparties.length > 0 
    ? counterparties 
    : storage.getCounterparties();
  const counterpartyMap = useMemo(() => {
    return new Map((effectiveCounterparties || []).map(c => [c.id, c]));
  }, [effectiveCounterparties]);

  // Filtra títulos ativos com saldo pendente vencendo entre hoje e D+3
  const activePendingTitles = (titles || []).filter(t => 
    t &&
    t.documentState === 'CONFIRMADO' &&
    (t.balancePrincipal || 0) > 0 &&
    t.dueDate &&
    t.dueDate >= todayStr &&
    t.dueDate <= in3DaysStr
  );

  const pendingReceivables = activePendingTitles.filter(t => t.type === 'RECEBER');
  const pendingPayables = activePendingTitles.filter(t => t.type === 'PAGAR');

  const totalReceivableAmount = pendingReceivables.reduce((sum, t) => sum + (t.balancePrincipal || 0), 0);
  const totalPayableAmount = pendingPayables.reduce((sum, t) => sum + (t.balancePrincipal || 0), 0);
  const netProjected = totalReceivableAmount - totalPayableAmount;

  const totalAlertsCount = activePendingTitles.length;

  // Títulos ordenados por vencimento iminente
  const sortedUpcoming = [...activePendingTitles].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));

  const getDueBadge = (dueDate?: string) => {
    if (!dueDate) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          Sem data
        </span>
      );
    }

    if (dueDate === todayStr) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-rose-500/15 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-400 dark:border-rose-800 animate-pulse">
          Vence Hoje
        </span>
      );
    }
    
    // Calcula diferença em dias
    const dueTime = new Date(`${dueDate}T00:00:00`).getTime();
    const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
    const diffDays = Math.ceil((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return (
        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-amber-500/15 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-400 dark:border-amber-800">
          Vence Amanhã
        </span>
      );
    }

    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        Em {diffDays} dias
      </span>
    );
  };

  // Nada vencendo: uma linha só, sem ocupar a tela
  if (totalAlertsCount === 0) {
    return (
      <Card className="!py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile><CheckCircle2 /></IconTile>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold">Tudo em dia nos próximos 3 dias</p>
              <p className="text-sm text-[var(--text-muted)]">Nenhuma conta a pagar ou a receber vence de {formatDateBR(todayStr)} a {formatDateBR(in3DaysStr)}.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button onClick={() => onNavigate('CONTAS_PAGAR')} className="h-9 px-3 text-sm whitespace-nowrap text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors cursor-pointer">Contas a pagar</button>
            <button onClick={() => onNavigate('CONTAS_RECEBER')} className="h-9 px-3 text-sm whitespace-nowrap text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg transition-colors cursor-pointer">Contas a receber</button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <IconTile><BellRing /></IconTile>
            <h3>Avisos dos próximos 3 dias</h3>
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--surface-elevated)] text-xs text-[var(--text-secondary)]">
              <span className={`w-1.5 h-1.5 rounded-full ${totalAlertsCount > 0 ? 'bg-[var(--brand-gold-fill)]' : 'bg-[var(--status-success)]'}`} />
              {totalAlertsCount > 0 ? `${totalAlertsCount} pendências` : 'Em dia'}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Vencimentos de {formatDateBR(todayStr)} a {formatDateBR(in3DaysStr)}. Clique numa linha para abrir o lançamento.
          </p>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => onNavigate('CONTAS_PAGAR')}
            className="h-9 px-3 text-sm whitespace-nowrap text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            Contas a pagar
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNavigate('CONTAS_RECEBER')}
            className="h-9 px-3 text-sm whitespace-nowrap text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            Contas a receber
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('CONTAS_RECEBER')}
          className="p-5 rounded-2xl border border-[var(--border-subtle)] cursor-pointer hover:border-[var(--border-highlight)] transition-colors"
        >
          <div className="flex justify-between items-center text-sm text-[var(--text-secondary)]">
            <span className="flex items-center gap-2.5"><IconBadge tone="success"><ArrowUpRight /></IconBadge>A receber</span>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">{pendingReceivables.length}</span>
          </div>
          <div className={`mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums ${totalReceivableAmount > 0 ? 'text-[var(--status-success)]' : ''}`}>
            {formatBRL(totalReceivableAmount)}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">Previsão de entrada de caixa</div>
        </div>

        <div
          onClick={() => onNavigate('CONTAS_PAGAR')}
          className="p-5 rounded-2xl border border-[var(--border-subtle)] cursor-pointer hover:border-[var(--border-highlight)] transition-colors"
        >
          <div className="flex justify-between items-center text-sm text-[var(--text-secondary)]">
            <span className="flex items-center gap-2.5"><IconBadge tone="danger"><ArrowDownRight /></IconBadge>A pagar</span>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">{pendingPayables.length}</span>
          </div>
          <div className={`mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums ${totalPayableAmount > 0 ? 'text-[var(--status-danger)]' : ''}`}>
            {formatBRL(totalPayableAmount)}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">Vence nos próximos dias</div>
        </div>

        <div className="p-5 rounded-2xl border border-[var(--border-subtle)]">
          <div className="flex justify-between items-center text-sm text-[var(--text-secondary)]">
            <span className="flex items-center gap-2.5"><IconBadge tone="gold"><DollarSign /></IconBadge>Saldo líquido</span>
            <span className="text-xs text-[var(--text-muted)]">{netProjected >= 0 ? 'Superávit' : 'Déficit'}</span>
          </div>
          <div className={`mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums ${netProjected < 0 ? 'text-[var(--status-danger)]' : ''}`}>
            {formatBRL(netProjected)}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            {netProjected >= 0 ? 'Caixa suficiente no curto prazo' : 'Atenção à cobertura de caixa'}
          </div>
        </div>
      </div>

      {/* Listagem detalhada das contas com foco maior no tamanho de cliente e descrição */}
      {sortedUpcoming.length > 0 ? (
        <div className="adv-only space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Detalhamento das Contas a Liquidar nos Próximos 3 Dias
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Clique em qualquer linha para abrir diretamente os detalhes
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-[#26262b] border border-slate-200 dark:border-[#26262b] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
            {sortedUpcoming.map(t => {
              const isReceber = t.type === 'RECEBER';
              const cp = counterpartyMap.get(t.counterpartyId);
              const cpName = cp?.name || t.counterpartyName || 'Cliente / Fornecedor';

              return (
                <div 
                  key={t.id}
                  onClick={() => {
                    if (onSelectTitle) {
                      onSelectTitle(t);
                    } else {
                      onNavigate(isReceber ? 'CONTAS_RECEBER' : 'CONTAS_PAGAR');
                    }
                  }}
                  className="p-3 sm:p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-[#1b1b20]/80 transition-all cursor-pointer text-xs group"
                  title="Clique para abrir diretamente este lançamento"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className={`p-2 rounded-xl shrink-0 border ${
                      isReceber 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                    }`}>
                      {isReceber ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      {/* FOCO MAIOR NO TAMANHO: Nome do Cliente/Fornecedor em Destaque */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                          {cpName}
                        </span>
                        <span className="adv-only text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          {t.titleNumber}
                        </span>
                      </div>

                      {/* Descrição e Competência juntas para fácil identificação */}
                      <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 truncate">
                        <span className="truncate font-medium">{t.description || 'Sem descrição'}</span>
                        {t.competence && (
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 shrink-0 bg-amber-500/10 px-1.5 py-0.2 rounded">
                            • Ref: {formatCompetenceShort(t.competence)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3.5 shrink-0 ml-3">
                    <div className="text-right">
                      <div className={`text-sm sm:text-base font-mono font-black ${
                        isReceber ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {formatBRL(t.balancePrincipal)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {formatDateBR(t.dueDate)}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {getDueBadge(t.dueDate)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-4 text-center bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b] space-y-1">
          <CheckCircle2 className="w-6 h-6 mx-auto text-emerald-500" />
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Nenhuma conta a pagar ou receber vence nos próximos 3 dias.
          </div>
          <div className="text-[11px] text-slate-500">
            Todos os compromissos imediatos estão regularizados.
          </div>
        </div>
      )}

    </Card>
  );
};
