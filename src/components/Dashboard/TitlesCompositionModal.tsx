import { formatCompetenceShort } from '../../utils/dateUtils';
import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar, 
  FileText, 
  Sliders, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  ExternalLink,
  Layers,
  ArrowRight,
  DollarSign,
  User,
  Building2
} from 'lucide-react';
import { FinancialTitle, Counterparty } from '../../types';
import { formatBRL, formatDateBR } from '../../services/financialEngine';

interface TitlesCompositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'RECEBER' | 'PAGAR';
  periodStr: string; // formato 'YYYY-MM' ex: '2026-10'
  allTitles: FinancialTitle[];
  counterparties: Counterparty[];
  onSelectTitle: (title: FinancialTitle) => void;
  initialFilterMode?: 'DUE_DATE' | 'COMPETENCE' | 'BOTH';
}

export const TitlesCompositionModal: React.FC<TitlesCompositionModalProps> = ({
  isOpen,
  onClose,
  type,
  periodStr,
  allTitles = [],
  counterparties = [],
  onSelectTitle,
  initialFilterMode = 'DUE_DATE'
}) => {
  const [filterMode, setFilterMode] = useState<'DUE_DATE' | 'COMPETENCE' | 'BOTH'>(initialFilterMode);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'SETTLED'>('OPEN');

  const counterpartyMap = useMemo(() => {
    return new Map((counterparties || []).map(c => [c.id, c]));
  }, [counterparties]);

  // Formata o período para exibição amigável
  const formattedPeriod = useMemo(() => {
    if (!periodStr || !periodStr.includes('-')) return periodStr;
    const [year, month] = periodStr.split('-');
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const mIdx = parseInt(month, 10) - 1;
    return `${monthNames[mIdx] || month} de ${year}`;
  }, [periodStr]);

  // Filtra os títulos do tipo solicitado
  const targetTitles = useMemo(() => {
    return (allTitles || []).filter(t => t && t.type === type && t.documentState === 'CONFIRMADO');
  }, [allTitles, type]);

  // Aplica o filtro de período de acordo com o modo
  const periodFilteredTitles = useMemo(() => {
    return targetTitles.filter(t => {
      const isDueInMonth = t.dueDate && t.dueDate.startsWith(periodStr);
      const isCompetenceInMonth = t.competence && t.competence.startsWith(periodStr);

      if (filterMode === 'DUE_DATE') {
        return isDueInMonth;
      }
      if (filterMode === 'COMPETENCE') {
        return isCompetenceInMonth;
      }
      return isDueInMonth || isCompetenceInMonth;
    });
  }, [targetTitles, periodStr, filterMode]);

  // Aplica filtros de busca e status de liquidação
  const finalFilteredTitles = useMemo(() => {
    return periodFilteredTitles.filter(t => {
      // Filtro de status
      if (statusFilter === 'OPEN' && t.balancePrincipal <= 0) return false;
      if (statusFilter === 'SETTLED' && t.settlementState !== 'LIQUIDADO' && t.balancePrincipal > 0) return false;

      // Busca por texto
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const cp = counterpartyMap.get(t.counterpartyId);
      const cpName = (cp?.name || '').toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const num = (t.titleNumber || '').toLowerCase();
      return cpName.includes(q) || desc.includes(q) || num.includes(q);
    });
  }, [periodFilteredTitles, statusFilter, search, counterpartyMap]);

  // Estatísticas e somas
  const totalPrincipalOpen = useMemo(() => {
    return finalFilteredTitles.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
  }, [finalFilteredTitles]);

  const totalOriginal = useMemo(() => {
    return finalFilteredTitles.reduce((acc, t) => acc + (t.originalAmount || 0), 0);
  }, [finalFilteredTitles]);

  if (!isOpen) return null;

  const isReceber = type === 'RECEBER';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Premium do Modal */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-[#26262b] bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 text-white flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              isReceber 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}>
              {isReceber ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownRight className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Composição dos Títulos a {isReceber ? 'Receber' : 'Pagar'}
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {formattedPeriod}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Auditoria detalhada da soma de lançamentos que compõem a projeção financeira do período.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Explicativo com Alternador de Critério (Regime de Caixa vs Competência) */}
        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-[#17171b] border-b border-slate-200 dark:border-[#26262b] space-y-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-amber-500" />
                Critério de Agrupamento dos Valores no Período:
              </span>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                {filterMode === 'DUE_DATE' && (
                  <span>
                    <strong>Regime de Caixa (Data de Vencimento):</strong> Exibe apenas os títulos que <strong>vencem no mês {periodStr}</strong>. É o critério ideal para projeção de liquidez e saldo de banco diário.
                  </span>
                )}
                {filterMode === 'COMPETENCE' && (
                  <span>
                    <strong>Regime de Competência:</strong> Exibe os títulos faturados para a <strong>competência {periodStr}</strong> (mesmo que o vencimento ocorra no mês subsequente).
                  </span>
                )}
                {filterMode === 'BOTH' && (
                  <span>
                    <strong>Visão Unificada (Vencimento OU Competência):</strong> Inclui tanto títulos que vencem neste mês quanto os de competência deste mês (atenção: pode duplicar se mensalidades tiverem vencimento no mês seguinte).
                  </span>
                )}
              </p>
            </div>

            {/* Alternador de Modo */}
            <div className="flex items-center p-1 bg-white dark:bg-[#131316] border border-slate-300 dark:border-[#26262b] rounded-xl text-xs font-semibold shrink-0 shadow-2xs">
              <button
                type="button"
                onClick={() => setFilterMode('DUE_DATE')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'DUE_DATE'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Filtrar exclusivamente por títulos com data de vencimento neste mês"
              >
                Por Vencimento (Caixa Real)
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('COMPETENCE')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'COMPETENCE'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Filtrar exclusivamente por títulos pertencentes a esta competência"
              >
                Por Competência
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('BOTH')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterMode === 'BOTH'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Soma de ambos (competência + vencimento)"
              >
                Ambos (Acumulado)
              </button>
            </div>
          </div>

          {/* Barra de Filtros e Busca Rápida */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por cliente, fornecedor ou descrição..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-[#131316] border border-slate-300 dark:border-[#26262b] rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="flex items-center bg-white dark:bg-[#131316] border border-slate-300 dark:border-[#26262b] rounded-xl p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('OPEN')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'OPEN'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Em Aberto
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('SETTLED')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'SETTLED'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Já Baixados
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'ALL'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Todos
                </button>
              </div>

              {/* Totalizador da Lista */}
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-right shrink-0">
                <span className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-400 block leading-tight">
                  Total Filtrado ({finalFilteredTitles.length}):
                </span>
                <span className="text-sm font-extrabold font-mono text-amber-950 dark:text-amber-300">
                  {formatBRL(statusFilter === 'OPEN' ? totalPrincipalOpen : totalOriginal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabela de Títulos com Design Premium */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#26262b]">
          {finalFilteredTitles.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <AlertCircle className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Nenhum título localizado com os filtros selecionados
              </p>
              <p className="text-xs text-slate-500">
                Tente alternar o critério de data (Vencimento vs. Competência) ou limpar o campo de busca.
              </p>
            </div>
          ) : (
            finalFilteredTitles.map(t => {
              const cp = counterpartyMap.get(t.counterpartyId);
              const cpName = cp?.name || t.counterpartyName || 'Cliente/Fornecedor não identificado';
              const isSettled = t.settlementState === 'LIQUIDADO' || t.balancePrincipal <= 0.005;

              return (
                <div
                  key={t.id}
                  onClick={() => {
                    onClose();
                    onSelectTitle(t);
                  }}
                  className="p-3.5 sm:p-4 hover:bg-amber-500/5 dark:hover:bg-amber-500/10 transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  title="Clique na linha para abrir o modal deste título"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Linha 1: Nome do Cliente/Fornecedor em Destaque Maior + Badge de Código */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                        {cpName}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {t.titleNumber}
                      </span>
                      {t.originType === 'CONTRATO' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30">
                          Contrato
                        </span>
                      )}
                    </div>

                    {/* Linha 2: Descrição Completa e Competência */}
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 flex-wrap">
                      <span className="font-medium truncate max-w-md">{t.description}</span>
                      {t.competence && (
                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Comp: {formatCompetenceShort(t.competence)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Lado Direito: Vencimento + Valor + Botão de Abertura */}
                  <div className="flex items-center gap-4 shrink-0 text-right">
                    <div>
                      <div className={`text-sm sm:text-base font-mono font-black ${
                        isReceber ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
                      }`}>
                        {formatBRL(t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                        Vencimento: <strong className="text-slate-700 dark:text-slate-300">{formatDateBR(t.dueDate)}</strong>
                      </div>
                      {isSettled && (
                        <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                          ✓ Liquidado
                        </span>
                      )}
                    </div>

                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-amber-500 group-hover:text-slate-950 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-all shadow-xs">
                      <ExternalLink className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé com Resumo Contábil */}
        <div className="p-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Layers className="w-4 h-4 text-amber-500" />
            <span>
              Mostrando <strong>{finalFilteredTitles.length}</strong> títulos de um total de <strong>{targetTitles.length}</strong> cadastrados no período.
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold transition-colors cursor-pointer"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};
