import React, { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Sparkles,
  Cpu,
  Wrench,
  FileText,
  ShieldCheck,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Search,
  AlertCircle,
  Briefcase,
  CheckCheck,
  AlertTriangle,
  Zap,
  Sliders,
  Settings,
  Layers,
  HelpCircle,
  Play,
  Send,
  CheckCircle2,
  RefreshCw,
  Terminal,
  Key,
  ExternalLink
} from 'lucide-react';
import { AgentDefinition, AgentRoleType, AiModelChainItem } from '../../types';
import { INITIAL_AGENT_DEFINITIONS } from '../../data/initialAgentsData';
import { DEFAULT_DYNAMIC_CATALOG } from '../../services/aiModelCatalogService';
import { AiService } from '../../services/aiService';
import { PremiumSelect } from '../Common/PremiumSelect';

export const AVAILABLE_AGENT_TOOLS: { id: string; name: string; description: string; category: string }[] = [
  { id: 'consultar_fluxo_caixa', name: 'Fluxo de Caixa', description: 'Consulta extratos, saldos bancários e movimentações financeiras', category: 'Tesouraria' },
  { id: 'consultar_dre_regimes', name: 'DRE Competência & Caixa', description: 'Leitura analítica da DRE sob regimes contábil e financeiro', category: 'Controladoria' },
  { id: 'projetar_liquidez_diaria', name: 'Projeção de Liquidez', description: 'Projeção de saldos futuros e descasamento em 30, 60 e 90 dias', category: 'Tesouraria' },
  { id: 'gerar_parecer_executivo', name: 'Parecer Executivo', description: 'Elaboração de minutas e relatórios estratégicos para a diretoria', category: 'Gestão' },
  { id: 'analisar_transacao_extrato', name: 'Análise de Extrato OFX', description: 'Leitura e parsing detalhado de linhas de extrato bancário', category: 'Conciliação' },
  { id: 'buscar_titulos_candidatos', name: 'Busca de Títulos no ERP', description: 'Localização de títulos por valor, vencimento e favorecido', category: 'Conciliação' },
  { id: 'verificar_regras_depara', name: 'Regras De-Para', description: 'Aplicação de regras de conciliação bancária automática', category: 'Conciliação' },
  { id: 'propor_conciliacao', name: 'Proposta de Conciliação', description: 'Criação de propostas Human-in-the-Loop para aprovação do gestor', category: 'Conciliação' },
  { id: 'listar_titulos_vencidos', name: 'Aging List de Cobrança', description: 'Monitoramento contínuo de contas a receber em atraso', category: 'Cobrança' },
  { id: 'calcular_indice_inadimplencia', name: 'Índice de Inadimplência', description: 'Cálculo de taxa de risco, PDD e perdas estimadas', category: 'Cobrança' },
  { id: 'analisar_historico_cliente', name: 'Histórico do Cliente', description: 'Avaliação de pontualidade e score de recebimento por sacado', category: 'Cobrança' },
  { id: 'propor_notificacao_cobranca', name: 'Régua de Cobrança', description: 'Minuta de avisos de vencimento preventivos e cordiais', category: 'Cobrança' },
  { id: 'verificar_fechamento_periodos', name: 'Trava de Períodos Fechados', description: 'Garante o respeito ao encerramento contábil da diretoria', category: 'Compliance' },
  { id: 'auditar_partidas_dobradas', name: 'Partidas Dobradas', description: 'Auditoria estrita de débitos e créditos equilibrados', category: 'Compliance' },
  { id: 'detectar_titulos_duplicados', name: 'Detecção de Duplicidades', description: 'Alerta preventivo de duplicidade de boletos e despesas', category: 'Compliance' },
  { id: 'validar_integridade_dre', name: 'Integridade da DRE', description: 'Conferência de somas, deduções fiscais e margens líquidas', category: 'Compliance' }
];

interface AgentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  agent: AgentDefinition | null;
  availableModels: AiModelChainItem[];
  onSave: (updatedAgent: AgentDefinition) => void;
}

export const AgentEditModal: React.FC<AgentEditModalProps> = ({
  isOpen,
  onClose,
  agent,
  availableModels,
  onSave
}) => {
  if (!isOpen || !agent) return null;

  // Estados dos campos do agente
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [defaultModel, setDefaultModel] = useState(agent.defaultModel);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [allowedTools, setAllowedTools] = useState<string[]>(agent.allowedTools || []);
  const [isActive, setIsActive] = useState(agent.isActive);
  const [requiresApproval, setRequiresApproval] = useState(agent.requiresApproval);
  const [isAutonomous, setIsAutonomous] = useState(agent.isAutonomous);

  // Estados de navegação interna do modal
  const [activeModalTab, setActiveModalTab] = useState<'PROMPT' | 'MODELO' | 'CAPACIDADES' | 'TESTAR' | 'GERAL'>('PROMPT');
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>('ALL');
  const [customToolInput, setCustomToolInput] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Estados da Sandbox de Teste Individual do Agente (Opção 1)
  const [sandboxQuestion, setSandboxQuestion] = useState(() => {
    switch (agent.role) {
      case 'CFO_EXECUTIVO':
        return 'Qual é o diagnóstico do fluxo de caixa e quais alertas a diretoria deve observar hoje?';
      case 'AUDITOR_CONCILIACAO':
        return 'Como conciliar uma tarifa bancária de débito de R$ 14,90 no plano de contas?';
      case 'ANALISTA_INADIMPLENCIA':
        return 'Elabore uma notificação cordial para cliente corporativo com título vencido há 5 dias.';
      case 'GUARDIAO_CONTABIL':
        return 'Quais são os requisitos contábeis para realizar uma liquidação com desconto condicional?';
      default:
        return 'Apresente suas funções e como você pode auxiliar a gestão financeira.';
    }
  });
  const [isExecutingSandbox, setIsExecutingSandbox] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<{
    success: boolean;
    content: string;
    modelUsed: string;
    latencyMs: number;
    error?: string;
    errorDiagnostic?: {
      code: string;
      title: string;
      suggestion: string;
    };
  } | null>(null);

  const handleRunSandboxTest = async () => {
    if (!sandboxQuestion.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Por favor, digite uma pergunta para testar o agente.' });
      setTimeout(() => setFeedbackMsg(null), 3500);
      return;
    }

    setIsExecutingSandbox(true);
    setSandboxResult(null);

    try {
      const res = await AiService.testAgentCustomSandbox({
        systemPrompt: systemPrompt.trim(),
        userPrompt: sandboxQuestion.trim(),
        model: defaultModel,
        agentRole: agent.role,
        allowedTools
      });

      setSandboxResult(res);
      if (res.success) {
        setFeedbackMsg({ type: 'success', text: `Resposta gerada via ${res.modelUsed} em ${res.latencyMs}ms!` });
        setTimeout(() => setFeedbackMsg(null), 4000);
      }
    } catch (err: any) {
      setSandboxResult({
        success: false,
        content: '',
        modelUsed: defaultModel,
        latencyMs: 0,
        error: err.message || 'Falha inesperada na execução do teste.',
        errorDiagnostic: {
          code: 'CLIENT_EXCEPTION',
          title: 'Erro de Execução Local',
          suggestion: 'Verifique se a aplicação está em execução e conectada à internet.'
        }
      });
    } finally {
      setIsExecutingSandbox(false);
    }
  };

  // Estados para atualização rápida de chave dentro do modal caso tenha expirado
  const [quickApiKeyInput, setQuickApiKeyInput] = useState('');
  const [showQuickKeyInput, setShowQuickKeyInput] = useState(false);

  const handleSaveQuickKeyAndRetest = async () => {
    if (!quickApiKeyInput.trim()) return;
    const current = AiService.getConfig();
    AiService.saveConfig({
      ...current,
      apiKey: quickApiKeyInput.trim(),
      enabled: true
    });
    setFeedbackMsg({ type: 'success', text: 'Chave atualizada! Disparando novo teste...' });
    setTimeout(() => setFeedbackMsg(null), 3000);
    setShowQuickKeyInput(false);

    setIsExecutingSandbox(true);
    setSandboxResult(null);
    try {
      const res = await AiService.testAgentCustomSandbox({
        systemPrompt: systemPrompt.trim(),
        userPrompt: sandboxQuestion.trim(),
        model: defaultModel,
        agentRole: agent.role,
        allowedTools,
        customApiKey: quickApiKeyInput.trim()
      });
      setSandboxResult(res);
      if (res.success) {
        setFeedbackMsg({ type: 'success', text: `Sucesso! Resposta gerada via ${res.modelUsed} em ${res.latencyMs}ms!` });
        setTimeout(() => setFeedbackMsg(null), 4000);
      }
    } catch (err: any) {
      setSandboxResult({
        success: false,
        content: '',
        modelUsed: defaultModel,
        latencyMs: 0,
        error: err.message || 'Falha inesperada no teste.',
        errorDiagnostic: {
          code: 'CLIENT_EXCEPTION',
          title: 'Erro de Execução Local',
          suggestion: 'Verifique se a aplicação está em execução.'
        }
      });
    } finally {
      setIsExecutingSandbox(false);
    }
  };

  // Modelos unificados (catálogo dinâmico + catálogo padrão)
  const allModelsList: AiModelChainItem[] = React.useMemo(() => {
    const map = new Map<string, AiModelChainItem>();
    for (const m of availableModels) {
      map.set(m.id, m);
    }
    for (const m of DEFAULT_DYNAMIC_CATALOG) {
      if (!map.has(m.id)) {
        map.set(m.id, m);
      }
    }
    return Array.from(map.values());
  }, [availableModels]);

  // Provedores únicos para filtro
  const uniqueProviders = React.useMemo(() => {
    const set = new Set<string>();
    allModelsList.forEach(m => {
      if (m.provider) set.add(m.provider);
    });
    return Array.from(set).sort();
  }, [allModelsList]);

  // Lista filtrada de modelos
  const filteredModels = React.useMemo(() => {
    return allModelsList.filter(m => {
      if (selectedProviderFilter !== 'ALL' && m.provider !== selectedProviderFilter) {
        return false;
      }
      if (!modelSearchQuery.trim()) return true;
      const q = modelSearchQuery.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
      );
    });
  }, [allModelsList, selectedProviderFilter, modelSearchQuery]);

  // Modelo atualmente selecionado
  const selectedModelMeta = allModelsList.find(m => m.id === defaultModel);

  // Restaura o prompt padrão de fábrica
  const handleRestoreDefaultPrompt = () => {
    const original = INITIAL_AGENT_DEFINITIONS.find(a => a.role === agent.role);
    if (original) {
      setSystemPrompt(original.systemPrompt);
      setFeedbackMsg({ type: 'success', text: 'Prompt de fábrica restaurado com sucesso!' });
      setTimeout(() => setFeedbackMsg(null), 3500);
    }
  };

  // Injeção de melhorias de prompt
  const handleAppendPromptDirective = (directive: string) => {
    if (systemPrompt.includes(directive)) {
      setFeedbackMsg({ type: 'error', text: 'Esta diretriz já está presente no prompt.' });
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }
    setSystemPrompt(prev => `${prev.trim()}\n\n${directive}`);
    setFeedbackMsg({ type: 'success', text: 'Diretriz adicionada ao prompt!' });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Toggle de ferramentas
  const handleToggleTool = (toolId: string) => {
    setAllowedTools(prev => 
      prev.includes(toolId) 
        ? prev.filter(t => t !== toolId) 
        : [...prev, toolId]
    );
  };

  // Adicionar ferramenta personalizada
  const handleAddCustomTool = () => {
    const clean = customToolInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!clean) return;
    if (allowedTools.includes(clean)) {
      setFeedbackMsg({ type: 'error', text: 'Esta capacidade já está autorizada.' });
      setTimeout(() => setFeedbackMsg(null), 3000);
      return;
    }
    setAllowedTools(prev => [...prev, clean]);
    setCustomToolInput('');
    setFeedbackMsg({ type: 'success', text: `Capacidade "${clean}" adicionada!` });
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Salvar
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFeedbackMsg({ type: 'error', text: 'O nome do agente não pode ficar em branco.' });
      return;
    }
    if (!systemPrompt.trim()) {
      setFeedbackMsg({ type: 'error', text: 'O prompt do sistema não pode ficar em branco.' });
      return;
    }

    const updated: AgentDefinition = {
      ...agent,
      name: name.trim(),
      description: description.trim(),
      defaultModel,
      systemPrompt: systemPrompt.trim(),
      allowedTools,
      isActive,
      requiresApproval,
      isAutonomous
    };

    onSave(updated);
  };

  const getAgentRoleIcon = (role: AgentRoleType) => {
    switch (role) {
      case 'CFO_EXECUTIVO':
        return <Briefcase className="w-5 h-5 text-amber-500" />;
      case 'AUDITOR_CONCILIACAO':
        return <CheckCheck className="w-5 h-5 text-emerald-500" />;
      case 'ANALISTA_INADIMPLENCIA':
        return <AlertTriangle className="w-5 h-5 text-rose-500" />;
      case 'GUARDIAO_CONTABIL':
        return <ShieldCheck className="w-5 h-5 text-blue-500" />;
      default:
        return <Bot className="w-5 h-5 text-indigo-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho do Modal */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 shadow-sm shrink-0">
              {getAgentRoleIcon(agent.role)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Configurar Agente: {name}</span>
                </h2>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {agent.role}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isActive 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {isActive ? 'Ativo' : 'Em Pausa'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Altere o modelo de IA, personalize as instruções e promts mestres e defina as ferramentas autorizadas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Navegação Interna */}
        <div className="px-6 pt-3 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0">
          <button
            type="button"
            onClick={() => setActiveModalTab('PROMPT')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeModalTab === 'PROMPT'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30 shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Prompt & Diretrizes Mestras</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModalTab('MODELO')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeModalTab === 'MODELO'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30 shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Modelo de IA ({selectedModelMeta?.name || defaultModel})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModalTab('CAPACIDADES')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeModalTab === 'CAPACIDADES'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30 shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Wrench className="w-4 h-4" />
            <span>Capacidades & Ferramentas ({allowedTools.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModalTab('TESTAR')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeModalTab === 'TESTAR'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30 shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Testar Agente (Sandbox)</span>
            {sandboxResult && (
              <span className={`w-2 h-2 rounded-full ${sandboxResult.success ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveModalTab('GERAL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeModalTab === 'GERAL'
                ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30 shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Governança & Identidade</span>
          </button>
        </div>

        {/* Feedback Banner */}
        {feedbackMsg && (
          <div className={`mx-6 mt-3 p-3 rounded-xl border text-xs flex items-center gap-2 shrink-0 ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' 
              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
          }`}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Corpo do Modal com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* ABA 1: PROMPT DO SISTEMA & DIRETRIZES */}
          {activeModalTab === 'PROMPT' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-500" />
                    <span>Instruções Mestras do Agente (System Prompt)</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Defina como este especialista se comporta, quais regras de negócio ele deve obedecer e seu tom de resposta.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRestoreDefaultPrompt}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors self-start sm:self-auto"
                  title="Restaurar prompt padrão de fábrica para este papel"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  <span>Restaurar Prompt de Fábrica</span>
                </button>
              </div>

              {/* Textarea do Prompt */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span>Texto do Prompt do Sistema:</span>
                  <span className="font-mono text-[11px]">{systemPrompt.length} caracteres</span>
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={9}
                  placeholder="Escreva as diretrizes contábeis e operacionais deste agente..."
                  className="w-full p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] font-mono leading-relaxed focus:ring-2 focus:ring-amber-500 focus:outline-none resize-y"
                />
              </div>

              {/* Sugestões Rápidas de Ajuste de Capacidade */}
              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Turbinar Capacidades: Clique para adicionar diretrizes profissionais prontas</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Adicione regras pré-calibradas para aumentar a precisão analítica e a disciplina fiscal do agente:
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleAppendPromptDirective(
                      'DIRETRIZ DE DISCIPLINA FINANCEIRA: Em todos os pareceres, calcule e destaque a margem líquida gerencial e aponte desvios orçamentários acima de 5%.'
                    )}
                    className="px-2.5 py-1 rounded-lg text-xs bg-[var(--surface-elevated)] hover:bg-amber-500/10 text-[var(--text-primary)] hover:text-amber-400 border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  >
                    + Exigir Margem Líquida & Desvios
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAppendPromptDirective(
                      'DIRETRIZ DE AUDITORIA DE REGRAS: Nunca assuma liquidações sem verificar a duplicidade de data e valor em relação aos outros títulos do mês.'
                    )}
                    className="px-2.5 py-1 rounded-lg text-xs bg-[var(--surface-elevated)] hover:bg-amber-500/10 text-[var(--text-primary)] hover:text-amber-400 border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  >
                    + Bloqueio Rigoroso de Duplicatas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAppendPromptDirective(
                      'TOM EXECUTIVO SUCINTO: Forneça respostas diretas e em tópicos executivos sem introduções prolixas, priorizando números e recomendações imediatas de caixa.'
                    )}
                    className="px-2.5 py-1 rounded-lg text-xs bg-[var(--surface-elevated)] hover:bg-amber-500/10 text-[var(--text-primary)] hover:text-amber-400 border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  >
                    + Tom Executivo & Sucinto
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAppendPromptDirective(
                      'CONFORMIDADE FISCAL: Ao classificar tributos, separe sempre Guia DAS/Simples Nacional de deduções da receita de encargos sobre folha de salários.'
                    )}
                    className="px-2.5 py-1 rounded-lg text-xs bg-[var(--surface-elevated)] hover:bg-amber-500/10 text-[var(--text-primary)] hover:text-amber-400 border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  >
                    + Rigor Fiscal DAS vs Salários
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ABA 2: ESCOLHER MODELO DE IA DISPONÍVEL */}
          {activeModalTab === 'MODELO' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-500" />
                    <span>Selecione o Modelo de IA para este Agente</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Escolha qualquer um dos {allModelsList.length} modelos de inteligência artificial disponíveis no seu catálogo OpenCode Go.
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-[var(--surface-elevated)] px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] text-xs">
                  <span className="text-[var(--text-secondary)]">Modelo Ativo:</span>
                  <span className="font-bold text-amber-500 font-mono">{defaultModel}</span>
                </div>
              </div>

              {/* Barra de Filtro e Busca de Modelos */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    value={modelSearchQuery}
                    onChange={(e) => setModelSearchQuery(e.target.value)}
                    placeholder="Pesquisar por nome, código ou provedor (ex: deepseek, gpt, claude, qwen, luna)..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Filtro por Provedor */}
                <PremiumSelect
                  value={selectedProviderFilter}
                  onChange={(e) => setSelectedProviderFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                >
                  <option value="ALL">Todos os Provedores ({allModelsList.length})</option>
                  {uniqueProviders.map(p => (
                    <option key={p} value={p}>
                      {p.toUpperCase()}
                    </option>
                  ))}
                </PremiumSelect>
              </div>

              {/* Grid de Modelos Selecionáveis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                {filteredModels.map(model => {
                  const isSelected = defaultModel === model.id;
                  return (
                    <div
                      key={model.id}
                      onClick={() => setDefaultModel(model.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500 ring-2 ring-amber-500/30 text-[var(--text-primary)] shadow-md'
                          : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-amber-500/50 text-[var(--text-secondary)]'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-xs text-[var(--text-primary)] truncate">
                                {model.name}
                              </span>
                              {isSelected && (
                                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase bg-amber-500 text-slate-950 flex items-center gap-0.5">
                                  <Check className="w-2.5 h-2.5" /> Selecionado
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-[var(--text-secondary)] truncate block">
                              {model.id}
                            </span>
                          </div>

                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] shrink-0">
                            {model.provider}
                          </span>
                        </div>

                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-2 line-clamp-2">
                          {model.description || 'Modelo de alta performance para processamento financeiro e de linguagem.'}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px]">
                        <span className="capitalize px-1.5 py-0.5 rounded bg-black/20 text-[var(--text-secondary)]">
                          {model.category || 'Geral'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDefaultModel(model.id);
                          }}
                          className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-[var(--surface-card)] hover:bg-amber-500/20 hover:text-amber-400 text-[var(--text-primary)] border border-[var(--border-subtle)]'
                          }`}
                        >
                          {isSelected ? 'Em Uso' : 'Escolher este'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ABA 3: CAPACIDADES E FERRAMENTAS AUTORIZADAS */}
          {activeModalTab === 'CAPACIDADES' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--border-subtle)]">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-amber-500" />
                    <span>Capacidades e Ferramentas Autorizadas ({allowedTools.length} ativas)</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Ative ou desative as permissões de leitura contábil e sugestão que este agente pode acionar no ERP.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAllowedTools(AVAILABLE_AGENT_TOOLS.map(t => t.id))}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  >
                    Ativar Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllowedTools([])}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--surface-elevated)] hover:bg-rose-500/10 text-rose-400 border border-[var(--border-subtle)] transition-colors cursor-pointer"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {/* Lista de Ferramentas Nativas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {AVAILABLE_AGENT_TOOLS.map(tool => {
                  const isChecked = allowedTools.includes(tool.id);
                  return (
                    <label
                      key={tool.id}
                      className={`p-3 rounded-xl border flex items-start gap-3 transition-all cursor-pointer ${
                        isChecked 
                          ? 'bg-amber-500/10 border-amber-500/40 text-[var(--text-primary)]' 
                          : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] opacity-80 hover:opacity-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleTool(tool.id)}
                        className="mt-0.5 rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-xs text-[var(--text-primary)]">{tool.name}</span>
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[var(--surface-card)] text-[var(--text-secondary)]">
                            {tool.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-snug">
                          {tool.description}
                        </p>
                        <span className="text-[9px] font-mono text-amber-400/80 mt-1 block">
                          id: {tool.id}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Ferramentas Personalizadas Adicionais */}
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                <span className="text-xs font-bold text-[var(--text-primary)] block">
                  Adicionar Capacidade Personalizada:
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customToolInput}
                    onChange={(e) => setCustomToolInput(e.target.value)}
                    placeholder="Nome da capacidade (ex: notificar_whatsapp, exportar_relatorio_diretoria)..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomTool();
                      }
                    }}
                    className="flex-1 px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTool}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar</span>
                  </button>
                </div>

                {/* Chips de Ferramentas Personalizadas Não Nativas */}
                {allowedTools.filter(t => !AVAILABLE_AGENT_TOOLS.some(at => at.id === t)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {allowedTools
                      .filter(t => !AVAILABLE_AGENT_TOOLS.some(at => at.id === t))
                      .map(customTool => (
                        <span
                          key={customTool}
                          className="px-2.5 py-1 rounded-lg text-xs font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1.5"
                        >
                          <span>{customTool}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleTool(customTool)}
                            className="hover:text-rose-400 p-0.5 cursor-pointer"
                            title="Remover capacidade"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ABA 4: SANDBOX DE TESTE & DIAGNÓSTICO (OPÇÃO 1) */}
          {activeModalTab === 'TESTAR' && (
            <div className="space-y-4">
              <div className="pb-2 border-b border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-emerald-500" />
                    <span>Sandbox de Validação & Diagnóstico do Especialista</span>
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Simule perguntas de rotina e valide as respostas com o prompt, ferramentas e modelo configurados antes de salvar.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono">
                    <strong className="text-[var(--text-primary)]">{allowedTools.length}</strong> ferramentas
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    {defaultModel}
                  </span>
                </div>
              </div>

              {/* Sugestões rápidas de teste baseadas no papel */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  Sugestões Rápidas de Pergunta para {agent.role.replace('_', ' ')}:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ...(agent.role === 'CFO_EXECUTIVO' ? [
                      'Qual o diagnóstico do caixa hoje?',
                      'Quais alertas contábeis requerem atenção imediata da diretoria?',
                      'Como devemos planejar os pagamentos da próxima quinzena?'
                    ] : agent.role === 'AUDITOR_CONCILIACAO' ? [
                      'Como classificar uma despesa de tarifa bancária de R$ 14,90?',
                      'Qual procedimento para extrato com lançamento duplicado?',
                      'Como bater o saldo do extrato com as contas a pagar?'
                    ] : agent.role === 'ANALISTA_INADIMPLENCIA' ? [
                      'Elabore uma mensagem amigável de cobrança de 5 dias de atraso.',
                      'Qual a melhor estratégia para renegociar cliente com 3 parcelas abertas?',
                      'Qual o critério para aplicar juros e multa em títulos vencidos?'
                    ] : agent.role === 'GUARDIAO_CONTABIL' ? [
                      'Como tratar contabilmente uma conciliação com desconto comercial?',
                      'Quais contas contábeis são afetadas pelo estorno de um pagamento?',
                      'Como validar a consistência entre o DRE e o razão contábil?'
                    ] : [
                      'Apresente suas responsabilidades financeiras.',
                      'Como você pode auxiliar a equipe nesta tarefa?'
                    ])
                  ].map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSandboxQuestion(sug)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] hover:bg-emerald-500/10 hover:text-emerald-300 border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-all cursor-pointer text-left"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* Caixa de Entrada da Pergunta */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-[var(--text-primary)]">
                  Pergunta ou Cenário de Teste:
                </label>
                <div className="relative">
                  <textarea
                    rows={3}
                    value={sandboxQuestion}
                    onChange={(e) => setSandboxQuestion(e.target.value)}
                    placeholder="Ex: Como você analisa uma discrepância de conciliação bancária entre o extrato e o DRE de competência?"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-y"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    O teste usará o prompt calibrado ({systemPrompt.length} chars) e as {allowedTools.length} capacidades ativas.
                  </span>
                  <button
                    type="button"
                    onClick={handleRunSandboxTest}
                    disabled={isExecutingSandbox || !sandboxQuestion.trim()}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-emerald-900/30 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    {isExecutingSandbox ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Processando com IA...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Disparar Teste no Agente</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Resultados do Teste na Sandbox */}
              {sandboxResult && (
                <div className="mt-4 space-y-3">
                  {sandboxResult.success ? (
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-bold text-emerald-300">Resposta do Especialista Gerada com Sucesso</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-secondary)]">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            {sandboxResult.modelUsed}
                          </span>
                          <span className="text-emerald-400 font-semibold">
                            {sandboxResult.latencyMs}ms
                          </span>
                        </div>
                      </div>

                      <div className="p-3.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                        {sandboxResult.content}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                        <span>A resposta acima foi gerada seguindo as instruções do prompt e ferramentas ativas.</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(sandboxResult.content);
                            setFeedbackMsg({ type: 'success', text: 'Resposta copiada para a área de transferência!' });
                            setTimeout(() => setFeedbackMsg(null), 3000);
                          }}
                          className="hover:text-emerald-400 underline cursor-pointer"
                        >
                          Copiar Resposta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-rose-300">
                              {sandboxResult.errorDiagnostic?.title || 'Falha na Validação do Agente'}
                            </h4>
                            {sandboxResult.errorDiagnostic?.code && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-mono border border-rose-500/30">
                                {sandboxResult.errorDiagnostic.code}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-secondary)]">
                            {sandboxResult.error || 'Não foi possível concluir a execução do teste com este modelo.'}
                          </p>
                        </div>
                      </div>

                      {sandboxResult.errorDiagnostic?.suggestion && (
                        <div className="p-3 rounded-lg bg-rose-900/20 border border-rose-500/20 text-xs text-rose-200 space-y-1">
                          <strong className="block text-[11px] uppercase tracking-wider text-rose-300">
                            💡 Diagnóstico e Como Corrigir:
                          </strong>
                          <p>{sandboxResult.errorDiagnostic.suggestion}</p>
                        </div>
                      )}

                      {/* Opção de Atualização Rápida de Chave em caso de Chave Expirada ou Ausente */}
                      {(sandboxResult.errorDiagnostic?.code === 'API_KEY_EXPIRED' || 
                        sandboxResult.errorDiagnostic?.code === 'AUTH_MISSING_KEY' || 
                        sandboxResult.errorDiagnostic?.code === 'UNAUTHORIZED') && (
                        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-700/80 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                              <Key className="w-3.5 h-3.5 text-amber-400" />
                              <span>Atualizar Chave de API Sem Fechar Este Modal:</span>
                            </span>
                            <a
                              href="https://opencode.ai/console"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-amber-400 hover:text-amber-300 underline flex items-center gap-1 cursor-pointer font-semibold"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>Acessar Console OpenCode</span>
                            </a>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="password"
                              value={quickApiKeyInput}
                              onChange={(e) => setQuickApiKeyInput(e.target.value)}
                              placeholder="Cole a nova chave de API aqui para salvar e retestar..."
                              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-950 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                            <button
                              type="button"
                              onClick={handleSaveQuickKeyAndRetest}
                              disabled={isExecutingSandbox || !quickApiKeyInput.trim()}
                              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Salvar & Retestar</span>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setActiveModalTab('MODELO')}
                          className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                          <Cpu className="w-3.5 h-3.5 text-blue-400" />
                          <span>Alternar Modelo na Aba Modelos</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveModalTab('PROMPT')}
                          className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-medium flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Revisar Prompt do Sistema</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ABA 5: GOVERNANÇA E IDENTIDADE */}
          {activeModalTab === 'GERAL' && (
            <div className="space-y-4">
              <div className="pb-2 border-b border-[var(--border-subtle)]">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-amber-500" />
                  <span>Identidade, Ativação & Governança de Risco</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Configure o nome de exibição, a descrição das responsabilidades e as travas de aprovação humana.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[var(--text-primary)]">
                    Nome de Exibição do Agente:
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[var(--text-primary)]">
                    Papel Estratégico (Fixo no Sistema):
                  </label>
                  <input
                    type="text"
                    value={agent.role}
                    disabled
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-xs font-mono text-[var(--text-secondary)] opacity-70 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--text-primary)]">
                  Descrição das Atribuições:
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Switches de Governança */}
              <div className="p-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-3.5">
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                  Controles de Integridade Contábil & Execução:
                </h4>

                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <span className="font-bold text-xs text-[var(--text-primary)] block">Agente Ativo</span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Permite que este especialista participe das análises e conciliações do sistema.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 cursor-pointer"
                  />
                </label>

                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        Requer Aprovação Humana Prévia (Human-in-the-Loop)
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        <strong>Princípio de Integridade:</strong> O agente nunca efetuará baixas ou estornos bancários sem que um operador humano revise e aprove expressamente.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={requiresApproval}
                      onChange={(e) => setRequiresApproval(e.target.checked)}
                      className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 cursor-pointer"
                    />
                  </label>
                </div>

                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <span className="font-bold text-xs text-[var(--text-primary)] block">
                        Modo Autônomo para Consultas e Leituras
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        Autoriza o agente a responder perguntas e ler extratos em background sem travar o usuário.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isAutonomous}
                      onChange={(e) => setIsAutonomous(e.target.checked)}
                      className="w-4 h-4 text-amber-500 rounded focus:ring-amber-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé de Ações */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-500" />
            <span>Modelo: <strong className="text-[var(--text-primary)]">{defaultModel}</strong> • Ferramentas: <strong className="text-[var(--text-primary)]">{allowedTools.length}</strong></span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--surface-card)] hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Salvar Alterações do Agente</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
