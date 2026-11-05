import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  Sparkles, 
  FileText, 
  Sliders, 
  Plus, 
  ArrowRight, 
  ExternalLink,
  Info,
  Calendar,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Tag,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { 
  ReconciliationDiagnosticLog, 
  BankStatementEntry, 
  FinancialTitle, 
  Counterparty,
  ChartAccount 
} from '../../types';
import { generateReconciliationDiagnostics } from '../../services/reconciliationRulesService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';

interface ReconciliationDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccountId?: string;
  selectedBankAccountId?: string;
  bankAccountName?: string;
  toleranceThreshold?: number;
  onSelectStatementForManualAction?: (stmtId: string) => void;
  onCreateRuleFromPattern?: (pattern: string) => void;
  onCreateTitleForStatement?: (stmt: BankStatementEntry) => void;
}

export const ReconciliationDiagnosticsModal: React.FC<ReconciliationDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  bankAccountId,
  selectedBankAccountId,
  bankAccountName = 'Conta Bancária',
  toleranceThreshold = 75,
  onSelectStatementForManualAction,
  onCreateRuleFromPattern,
  onCreateTitleForStatement
}) => {
  const effectiveBankAccountId = bankAccountId || selectedBankAccountId || '';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NAO_CONCILIADO' | 'SUGESTAO' | 'CONCILIADO'>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Gera diagnósticos detalhados para cada transação
  const diagnosticLogs = useMemo(() => {
    return generateReconciliationDiagnostics(effectiveBankAccountId, toleranceThreshold);
  }, [effectiveBankAccountId, toleranceThreshold, refreshKey]);

  // Contadores executivos para os cards de topo
  const metrics = useMemo(() => {
    const total = diagnosticLogs.length;
    const conciliados = diagnosticLogs.filter(d => d.status === 'CONCILIADO' || d.status === 'REGRA_APLICADA').length;
    const sugestoes = diagnosticLogs.filter(d => d.status === 'SUGESTAO_ENCONTRADA').length;
    const naoConciliados = diagnosticLogs.filter(d => d.status === 'NAO_CONCILIADO').length;

    // Razões de não conciliação
    const semTitulos = diagnosticLogs.filter(d => d.status === 'NAO_CONCILIADO' && d.suggestedAction === 'CRIAR_TITULO').length;
    const scoreBaixo = diagnosticLogs.filter(d => d.status === 'NAO_CONCILIADO' && d.suggestedAction !== 'CRIAR_TITULO').length;

    return { total, conciliados, sugestoes, naoConciliados, semTitulos, scoreBaixo };
  }, [diagnosticLogs]);

  // Filtragem dos logs
  const filteredLogs = useMemo(() => {
    return diagnosticLogs.filter(log => {
      // Filtro de status
      if (statusFilter === 'NAO_CONCILIADO' && log.status !== 'NAO_CONCILIADO') return false;
      if (statusFilter === 'SUGESTAO' && log.status !== 'SUGESTAO_ENCONTRADA') return false;
      if (statusFilter === 'CONCILIADO' && (log.status !== 'CONCILIADO' && log.status !== 'REGRA_APLICADA')) return false;

      // Busca por texto
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const inDesc = log.description.toLowerCase().includes(query);
        const inReason = log.primaryReason.toLowerCase().includes(query);
        const inNumber = log.bestCandidateTitleNumber?.toLowerCase().includes(query);
        const inCp = log.bestCandidateCounterpartyName?.toLowerCase().includes(query);
        if (!inDesc && !inReason && !inNumber && !inCp) return false;
      }

      return true;
    });
  }, [diagnosticLogs, statusFilter, searchTerm]);

  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900 dark:text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/15 rounded-xl border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  Diagnóstico do Motor de Conciliação
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {bankAccountName}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Auditoria analítica que explica por que cada lançamento bancário conciliou ou por que foi recusado pelo motor.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setRefreshKey(k => k + 1)}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Recalcular diagnóstico"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Executive Summary Metrics Grid */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50/50 dark:bg-[#0b0b0d] grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white border-slate-900 shadow-xs ring-2 ring-slate-900/20'
                : 'bg-white dark:bg-[#17171b] border-slate-200 dark:border-[#26262b] hover:border-slate-300'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
              Total Analisado
            </span>
            <div className="text-xl font-extrabold mt-0.5">{metrics.total}</div>
            <div className="text-[10px] opacity-70 mt-1">100% dos extratos</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('CONCILIADO')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'CONCILIADO'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-700/20'
                : 'bg-white dark:bg-[#17171b] border-slate-200 dark:border-[#26262b] hover:border-emerald-500/50'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Conciliados
            </span>
            <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-0.5">
              {metrics.conciliados}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Vínculo auditado</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('SUGESTAO')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'SUGESTAO'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs ring-2 ring-amber-600/20'
                : 'bg-white dark:bg-[#17171b] border-slate-200 dark:border-[#26262b] hover:border-amber-500/50'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Com Sugestões
            </span>
            <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400 mt-0.5">
              {metrics.sugestoes}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Aprovação pendente</div>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('NAO_CONCILIADO')}
            className={`p-3 rounded-xl border text-left transition-all ${
              statusFilter === 'NAO_CONCILIADO'
                ? 'bg-rose-700 text-white border-rose-700 shadow-xs ring-2 ring-rose-700/20'
                : 'bg-white dark:bg-[#17171b] border-slate-200 dark:border-[#26262b] hover:border-rose-500/50'
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Não Conciliados
            </span>
            <div className="text-xl font-extrabold text-rose-700 dark:text-rose-400 mt-0.5">
              {metrics.naoConciliados}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
              {metrics.semTitulos} sem título • {metrics.scoreBaixo} score baixo
            </div>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316] flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por descrição, motivo ou título..."
              className="w-full bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg pl-9 pr-3 py-1.5 text-xs font-medium outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="flex items-center space-x-1.5 w-full sm:w-auto overflow-x-auto text-xs">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mr-1">Filtrar:</span>
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors shrink-0 ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Todos ({diagnosticLogs.length})
            </button>
            <button
              onClick={() => setStatusFilter('NAO_CONCILIADO')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors shrink-0 ${
                statusFilter === 'NAO_CONCILIADO'
                  ? 'bg-rose-700 text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Não Conciliados ({metrics.naoConciliados})
            </button>
            <button
              onClick={() => setStatusFilter('SUGESTAO')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors shrink-0 ${
                statusFilter === 'SUGESTAO'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Sugestões ({metrics.sugestoes})
            </button>
            <button
              onClick={() => setStatusFilter('CONCILIADO')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors shrink-0 ${
                statusFilter === 'CONCILIADO'
                  ? 'bg-emerald-700 text-white font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Conciliados ({metrics.conciliados})
            </button>
          </div>
        </div>

        {/* Logs List Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 scrollbar-thin bg-slate-50/30 dark:bg-[#0b0b0d]">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-16 text-slate-500 dark:text-slate-400 text-xs space-y-2">
              <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 opacity-60" />
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                Nenhum log encontrado para o filtro selecionado.
              </p>
            </div>
          ) : (
            filteredLogs.map(log => {
              const isExpanded = expandedLogId === log.id;
              const isDebit = log.amount < 0;

              return (
                <div 
                  key={log.id}
                  className={`rounded-xl border transition-all ${
                    log.status === 'CONCILIADO' || log.status === 'REGRA_APLICADA'
                      ? 'bg-white dark:bg-[#131316] border-slate-200 dark:border-[#26262b]'
                      : log.status === 'SUGESTAO_ENCONTRADA'
                        ? 'bg-white dark:bg-[#131316] border-amber-500/30 dark:border-amber-500/30'
                        : 'bg-white dark:bg-[#131316] border-rose-300 dark:border-rose-900/50 shadow-2xs'
                  }`}
                >
                  {/* Card Header / Summary Row */}
                  <div 
                    onClick={() => toggleExpand(log.id)}
                    className="p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#171E2B] rounded-xl transition-colors"
                  >
                    <div className="flex items-start space-x-3 w-full sm:w-auto">
                      {/* Status Icon */}
                      <div className="mt-0.5">
                        {log.status === 'CONCILIADO' || log.status === 'REGRA_APLICADA' ? (
                          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        ) : log.status === 'SUGESTAO_ENCONTRADA' ? (
                          <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            <Sparkles className="w-4 h-4" />
                          </div>
                        ) : (
                          <div className="p-1.5 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            <AlertTriangle className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      {/* Transaction info & Primary reason */}
                      <div className="space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded font-semibold">
                            {formatDateBR(log.date)}
                          </span>

                          <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                            log.status === 'CONCILIADO' || log.status === 'REGRA_APLICADA'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : log.status === 'SUGESTAO_ENCONTRADA'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          }`}>
                            {log.status === 'REGRA_APLICADA' ? 'REGRA AUTOMÁTICA' : log.status.replace('_', ' ')}
                          </span>

                          {log.bestCandidateScore > 0 && (
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                              Similaridade: {log.bestCandidateScore}%
                            </span>
                          )}
                        </div>

                        <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {log.description}
                        </div>

                        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                          <strong>Diagnóstico:</strong> {log.primaryReason}
                        </p>
                      </div>
                    </div>

                    {/* Amount & Expand Toggle */}
                    <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                      <div className={`text-right font-extrabold text-sm whitespace-nowrap ${
                        isDebit ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {formatBRL(log.amount)}
                      </div>

                      <div className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Analytical Details */}
                  {isExpanded && (
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0b0b0d] text-xs space-y-4">
                      
                      {/* Breakdown Bars if candidate existed */}
                      {log.breakdown && (
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                            Composição da Pontuação Algorítmica (Total: {log.bestCandidateScore}/100)
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-2.5 rounded-lg bg-white dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b]">
                              <div className="flex justify-between items-center text-[11px] font-bold">
                                <span>Valor ({log.breakdown.amountScore}/50)</span>
                                <span className={log.breakdown.amountScore >= 40 ? 'text-emerald-600' : 'text-amber-600'}>
                                  {Math.round((log.breakdown.amountScore / 50) * 100)}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                                <div 
                                  className="bg-emerald-500 h-full rounded-full transition-all" 
                                  style={{ width: `${(log.breakdown.amountScore / 50) * 100}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                                {log.breakdown.amountSummary}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-white dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b]">
                              <div className="flex justify-between items-center text-[11px] font-bold">
                                <span>Data ({log.breakdown.dateScore}/30)</span>
                                <span className={log.breakdown.dateScore >= 20 ? 'text-emerald-600' : 'text-amber-600'}>
                                  {Math.round((log.breakdown.dateScore / 30) * 100)}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                                <div 
                                  className="bg-amber-500 h-full rounded-full transition-all" 
                                  style={{ width: `${(log.breakdown.dateScore / 30) * 100}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                                {log.breakdown.dateSummary}
                              </div>
                            </div>

                            <div className="p-2.5 rounded-lg bg-white dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b]">
                              <div className="flex justify-between items-center text-[11px] font-bold">
                                <span>Descrição ({log.breakdown.descriptionScore}/20)</span>
                                <span className={log.breakdown.descriptionScore >= 10 ? 'text-emerald-600' : 'text-slate-400'}>
                                  {Math.round((log.breakdown.descriptionScore / 20) * 100)}%
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden mt-1.5">
                                <div 
                                  className="bg-amber-500 h-full rounded-full transition-all" 
                                  style={{ width: `${(log.breakdown.descriptionScore / 20) * 100}%` }}
                                />
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                                {log.breakdown.descriptionSummary}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Detailed Bullet Points */}
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                          Fatores Analisados pelo Motor
                        </div>
                        <ul className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300 list-disc list-inside">
                          {log.detailedReasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>

                      {/* Actionable Recommendations */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          <strong>Ação Recomendada:</strong> {log.actionNote || 'Verifique o lançamento correspondente no ERP.'}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {log.status === 'NAO_CONCILIADO' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  if (onCreateRuleFromPattern) {
                                    // Pega a primeira palavra significativa
                                    const words = log.description.split(/\s+/).filter(w => w.length > 2);
                                    onCreateRuleFromPattern(words[0] || log.description);
                                    onClose();
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                                Criar Regra De-Para
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectStatementForManualAction) {
                                    onSelectStatementForManualAction(log.stmtId);
                                    onClose();
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Criar Título no ERP
                              </button>
                            </>
                          )}

                          {log.status === 'SUGESTAO_ENCONTRADA' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectStatementForManualAction) {
                                  onSelectStatementForManualAction(log.stmtId);
                                  onClose();
                                }
                              }}
                              className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Aprovar Conciliação na Tela
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Bottom Bar */}
        <div className="p-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">
            Limiar de aceitação automática configurado em: <strong>{toleranceThreshold}%</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-lg transition-colors"
          >
            Fechar Diagnóstico
          </button>
        </div>

      </div>
    </div>
  );
};
