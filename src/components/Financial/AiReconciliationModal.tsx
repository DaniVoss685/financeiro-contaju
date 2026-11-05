import React, { useState, useEffect } from 'react';
import {
  Bot,
  Sparkles,
  X,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  Zap,
  Settings,
  ChevronRight,
  BookmarkPlus,
  TrendingUp,
  FileCheck,
  Activity,
  Key
} from 'lucide-react';
import { BankStatementEntry, FinancialTitle, ChartOfAccount, AiReconciliationSuggestion } from '../../types';
import { AiService } from '../../services/aiService';
import { AiModelCatalogService } from '../../services/aiModelCatalogService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';

interface AiReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStatement: BankStatementEntry | null;
  allStatements: BankStatementEntry[];
  candidateTitles: FinancialTitle[];
  chartAccounts: ChartOfAccount[];
  onApplyMatch: (stmt: BankStatementEntry, title: FinancialTitle) => void;
  onCreateTitleFromAi: (stmt: BankStatementEntry, suggestion: AiReconciliationSuggestion) => void;
  onOpenAiConfig?: () => void;
}

export const AiReconciliationModal: React.FC<AiReconciliationModalProps> = ({
  isOpen,
  onClose,
  selectedStatement,
  allStatements,
  candidateTitles,
  chartAccounts,
  onApplyMatch,
  onCreateTitleFromAi,
  onOpenAiConfig
}) => {
  const [currentStmt, setCurrentStmt] = useState<BankStatementEntry | null>(selectedStatement);
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AiReconciliationSuggestion | null>(null);
  const [lastModelUsed, setLastModelUsed] = useState<string>('');
  const [attemptsLog, setAttemptsLog] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [quickApiKey, setQuickApiKey] = useState('');
  const [isQuickConnecting, setIsQuickConnecting] = useState(false);

  // Sincroniza o extrato selecionado ao abrir
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      const target = selectedStatement || allStatements.find(s => s.reconciliationStatus === 'PENDENTE') || allStatements[0] || null;
      setCurrentStmt(target);
      if (target) {
        runAiAnalysis(target);
      } else {
        setSuggestion(null);
      }
    }
  }, [isOpen, selectedStatement]);

  const handleQuickConnect = async () => {
    if (!quickApiKey.trim()) return;
    setIsQuickConnecting(true);
    setErrorMsg('');
    try {
      const res = await AiModelCatalogService.connectAndSync(quickApiKey.trim());
      if (res.success && currentStmt) {
        await runAiAnalysis(currentStmt);
      } else {
        setErrorMsg(res.message);
      }
    } catch (err: any) {
      setErrorMsg(`Falha na conexão: ${err.message || 'Erro inesperado'}`);
    } finally {
      setIsQuickConnecting(false);
    }
  };

  const runAiAnalysis = async (stmt: BankStatementEntry) => {
    setLoading(true);
    setErrorMsg('');
    setSuggestion(null);
    setAttemptsLog([]);

    const config = AiService.getConfig();
    if (config.apiKey && !config.enabled) {
      config.enabled = true;
      AiService.saveConfig(config);
    }

    if (!config.apiKey) {
      setErrorMsg('A Chave da API do OpenCode Go ainda não foi configurada. Insira sua chave abaixo para importar as IAs e conciliar:');
      setLoading(false);
      return;
    }

    try {
      // Filtra títulos do mesmo tipo (Pagar se negativo, Receber se positivo)
      const isDebit = (Number(stmt.amount) || 0) < 0;
      const filteredTitles = candidateTitles.filter(t => isDebit ? t.type === 'PAGAR' : t.type === 'RECEBER');

      const result = await AiService.analyzeReconciliationTransaction(stmt, filteredTitles, chartAccounts);
      
      setLastModelUsed(result.modelUsed || '');
      setAttemptsLog(result.attempts || []);

      if (result.success) {
        setSuggestion(result);
      } else {
        setErrorMsg(result.error || 'Não foi possível obter uma sugestão da IA. Verifique as credenciais da OpenCode.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro inesperado ao consultar a API de IA.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const config = AiService.getConfig();
  const matchedTitle = suggestion?.matchedTitleId ? candidateTitles.find(t => t.id === suggestion.matchedTitleId) : null;
  const suggestedCategoryObj = suggestion?.suggestedCategory 
    ? chartAccounts.find(c => c.name.toLowerCase() === suggestion.suggestedCategory.toLowerCase() || c.code === suggestion.suggestedCategory)
    : null;

  const hadFailover = attemptsLog.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header do Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-transparent border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center shadow-xs">
              <Bot className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Assistente de Conciliação com IA
                </h2>
                <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/40 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  OpenCode Multi-Model
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Classificação contábil autônoma com tolerância a falhas e redundância inteligente
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* Seletor de Extrato */}
          <div>
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider block mb-1.5">
              Transação do Extrato Bancário Analisada
            </label>
            <div className="relative">
              <PremiumSelect
                value={currentStmt?.id || ''}
                onChange={(e) => {
                  const found = allStatements.find(s => s.id === e.target.value);
                  if (found) {
                    setCurrentStmt(found);
                    runAiAnalysis(found);
                  }
                }}
                disabled={loading}
                className="w-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              >
                {allStatements.map(s => (
                  <option key={s.id} value={s.id}>
                    {formatDateBR(s.date)} — {s.description} ({formatBRL(s.amount)}) [{s.reconciliationStatus}]
                  </option>
                ))}
              </PremiumSelect>
            </div>
          </div>

          {/* Card Detalhado do Lançamento do Extrato */}
          {currentStmt && (
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Descrição no Extrato</span>
                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">
                  {currentStmt.description}
                </p>
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-secondary)]">
                  <span>Data: <strong>{formatDateBR(currentStmt.date)}</strong></span>
                  {currentStmt.fitId && <span>Doc/FitId: <strong>{currentStmt.fitId}</strong></span>}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Valor</span>
                <p className={`text-base font-black font-mono mt-0.5 ${
                  currentStmt.amount < 0 ? 'text-rose-500' : 'text-emerald-500'
                }`}>
                  {formatBRL(currentStmt.amount)}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  currentStmt.amount < 0 
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                    : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                }`}>
                  {currentStmt.amount < 0 ? 'Saída / Pagamento' : 'Entrada / Recebimento'}
                </span>
              </div>
            </div>
          )}

          {/* Banner de Failover / Contingência Disparada */}
          {hadFailover && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start space-x-3 text-xs text-amber-700 dark:text-amber-300">
              <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong>⚡ Failover Multi-Modelo Ativado com Sucesso:</strong>
                <p className="mt-0.5 text-[11px]">
                  O modelo primário encontrou lentidão ou instabilidade. O sistema alternou automaticamente para <strong>{lastModelUsed}</strong> na cadeia de contingência, mantendo sua conciliação sem travamentos.
                </p>
              </div>
            </div>
          )}

          {/* Mensagem de Erro ou Chave Não Configurada */}
          {errorMsg && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-3">
              <div className="flex items-start space-x-3 text-xs text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <strong>Falha na Consulta de IA:</strong>
                  <p className="mt-0.5 text-[11px]">{errorMsg}</p>
                </div>
              </div>

              {/* Inserção rápida de Chave caso não esteja configurada ou para reconfigurar */}
              <div className="pt-2 border-t border-rose-500/20">
                <label className="text-[11px] font-bold text-[var(--text-secondary)] block mb-1.5 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-purple-400" />
                  Ativar ou Atualizar Chave da API OpenCode Go:
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Cole sua API Key do OpenCode Go (opencode-zen-...)"
                    value={quickApiKey}
                    onChange={(e) => setQuickApiKey(e.target.value)}
                    className="flex-1 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                  />
                  <button
                    type="button"
                    onClick={handleQuickConnect}
                    disabled={isQuickConnecting || !quickApiKey.trim()}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {isQuickConnecting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Ativar & Conciliar
                  </button>
                </div>
              </div>

              {onOpenAiConfig && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAiConfig();
                    }}
                    className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Abrir Central de Agentes Completa
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Estado de Carregamento da IA */}
          {loading && (
            <div className="p-8 text-center rounded-xl border border-dashed border-purple-500/40 bg-purple-500/5 space-y-3">
              <RefreshCw className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Consultando Inteligência Artificial OpenCode...
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Avaliando descrição, valor, data e cruzando com o plano de contas e títulos em aberto.
                </p>
              </div>
            </div>
          )}

          {/* Resultado da Sugestão da IA */}
          {!loading && suggestion && (
            <div className="space-y-4">
              
              {/* Header do Diagnóstico */}
              <div className="p-4 rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-transparent space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text-secondary)]">Ação Recomendada:</span>
                    <span className={`text-xs px-2.5 py-1 rounded-lg font-bold border ${
                      suggestion.action === 'CONCILIAR_EXISTENTE'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : suggestion.action === 'CRIAR_NOVO_TITULO'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                    }`}>
                      {suggestion.action === 'CONCILIAR_EXISTENTE' && '✓ Vincular a Título Existente'}
                      {suggestion.action === 'CRIAR_NOVO_TITULO' && '+ Criar Novo Título no ERP'}
                      {suggestion.action === 'IGNORAR_TARIFA' && 'Ø Lançamento de Tarifa Bancária'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-secondary)]">Confiança:</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-black font-mono border ${
                      suggestion.confidence >= 80 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    }`}>
                      {suggestion.confidence}%
                    </span>
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-full">
                      Modelo: {lastModelUsed}
                    </span>
                  </div>
                </div>

                {/* Justificativa e Raciocínio Contábil */}
                <div className="text-xs text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-elevated)] p-3 rounded-lg border border-[var(--border-subtle)]">
                  <strong className="text-[var(--text-primary)] block mb-1">Raciocínio do Assistente Contábil:</strong>
                  {suggestion.reasoning}
                </div>

                {/* Categoria Sugerida */}
                {suggestion.suggestedCategory && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-[var(--border-subtle)]">
                    <span className="text-[var(--text-secondary)]">Categoria do Plano de Contas:</span>
                    <strong className="text-[var(--text-primary)]">
                      {suggestedCategoryObj ? `${suggestedCategoryObj.code} - ${suggestedCategoryObj.name}` : suggestion.suggestedCategory}
                    </strong>
                  </div>
                )}
              </div>

              {/* Título Correspondente Sugerido (se houver) */}
              {matchedTitle && (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      Título Localizado no ERP para Vinculação:
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-500">
                      {formatBRL(matchedTitle.balancePrincipal > 0 ? matchedTitle.balancePrincipal : matchedTitle.originalAmount)}
                    </span>
                  </div>
                  
                  <div className="text-xs text-[var(--text-secondary)] grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <span>Nº Documento: </span>
                      <strong className="text-[var(--text-primary)]">{matchedTitle.titleNumber}</strong>
                    </div>
                    <div>
                      <span>Vencimento: </span>
                      <strong className="text-[var(--text-primary)]">{formatDateBR(matchedTitle.dueDate)}</strong>
                    </div>
                    <div className="col-span-2">
                      <span>Descrição: </span>
                      <strong className="text-[var(--text-primary)]">{matchedTitle.description}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="px-6 py-4 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {currentStmt && (
              <button
                type="button"
                onClick={() => runAiAnalysis(currentStmt)}
                disabled={loading}
                className="px-3.5 py-2 bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Reprocessar análise com a IA"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Reanalisar
              </button>
            )}

            {onOpenAiConfig && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAiConfig();
                }}
                className="px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-purple-400 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                Configurar Modelos
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-card)] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Fechar
            </button>

            {suggestion && currentStmt && (
              <>
                {matchedTitle && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyMatch(currentStmt, matchedTitle);
                      onClose();
                    }}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Conciliar com Título ({matchedTitle.titleNumber})
                  </button>
                )}

                {(!matchedTitle || suggestion.action === 'CRIAR_NOVO_TITULO') && (
                  <button
                    type="button"
                    onClick={() => {
                      onCreateTitleFromAi(currentStmt, suggestion);
                      onClose();
                    }}
                    className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    Criar & Quitar Título Sugerido
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
