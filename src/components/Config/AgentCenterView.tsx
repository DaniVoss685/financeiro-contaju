import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Sparkles, 
  ShieldCheck, 
  CheckCheck, 
  Briefcase, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Server, 
  Zap, 
  Lock, 
  ChevronRight, 
  Activity, 
  Layers, 
  FileText,
  AlertCircle,
  RefreshCw,
  Key,
  Eye,
  EyeOff,
  Search,
  ArrowUp,
  ArrowDown,
  Check,
  Plus,
  X,
  Send,
  MessageSquare,
  HelpCircle,
  Columns,
  Trophy,
  Sliders,
  Edit3,
  Wrench,
  ChevronDown,
  Cpu,
  Globe,
  ExternalLink
} from 'lucide-react';
import { 
  AgentDefinition, 
  AgentApprovalItem, 
  AgentRunRecord, 
  AgentRoleType,
  AiProviderConfig,
  AiModelChainItem
} from '../../types';
import { storage } from '../../services/storageService';
import { AgentOrchestratorService } from '../../services/agentOrchestratorService';
import { AiService } from '../../services/aiService';
import { 
  AiModelCatalogService, 
  AI_PROVIDER_PRESETS, 
  detectProviderFromKey, 
  AiProviderPreset 
} from '../../services/aiModelCatalogService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { AgentEditModal } from '../Modals/AgentEditModal';
import { PremiumSelect } from '../Common/PremiumSelect';

export const AgentCenterView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'AGENTES' | 'APROVACOES' | 'RUNS' | 'GATEWAY'>(() => {
    const cfg = AiService.getConfig();
    return cfg.apiKey ? 'AGENTES' : 'GATEWAY';
  });
  const [agents, setAgents] = useState<AgentDefinition[]>(() => AgentOrchestratorService.getAgents());
  const [approvals, setApprovals] = useState<AgentApprovalItem[]>(() => AgentOrchestratorService.getAllApprovals());
  const [runs, setRuns] = useState<AgentRunRecord[]>(() => storage.getAgentRuns());
  const [aiConfig, setAiConfig] = useState<AiProviderConfig>(() => AiService.getConfig());
  const [catalogModels, setCatalogModels] = useState<AiModelChainItem[]>(() => AiModelCatalogService.getCachedCatalog());
  const [isSyncingModels, setIsSyncingModels] = useState(false);
  const [editingAgent, setEditingAgent] = useState<AgentDefinition | null>(null);
  const [assigningModelDropdown, setAssigningModelDropdown] = useState<string | null>(null);

  const handleSaveEditedAgent = (updatedAgent: AgentDefinition) => {
    const currentAgents = AgentOrchestratorService.getAgents();
    const updatedList = currentAgents.map(a => a.id === updatedAgent.id ? updatedAgent : a);
    AgentOrchestratorService.saveAgents(updatedList);
    setAgents(updatedList);
    setEditingAgent(null);
    setActionSuccessMsg(`Agente "${updatedAgent.name}" configurado com sucesso! Modelo atribuído: ${updatedAgent.defaultModel}`);
    setTimeout(() => setActionSuccessMsg(''), 5000);
  };

  const handleToggleAgentStatus = (agentId: string) => {
    const currentAgents = AgentOrchestratorService.getAgents();
    const updatedList = currentAgents.map(a => a.id === agentId ? { ...a, isActive: !a.isActive } : a);
    AgentOrchestratorService.saveAgents(updatedList);
    setAgents(updatedList);
    const target = updatedList.find(a => a.id === agentId);
    setActionSuccessMsg(`Agente "${target?.name}" ${target?.isActive ? 'ativado' : 'pausado'}.`);
    setTimeout(() => setActionSuccessMsg(''), 3500);
  };

  const handleAssignModelToAgent = (modelId: string, agentRole: AgentRoleType) => {
    const currentAgents = AgentOrchestratorService.getAgents();
    const updatedList = currentAgents.map(a => a.role === agentRole ? { ...a, defaultModel: modelId } : a);
    AgentOrchestratorService.saveAgents(updatedList);
    setAgents(updatedList);
    setAssigningModelDropdown(null);
    const target = updatedList.find(a => a.role === agentRole);
    setActionSuccessMsg(`Modelo "${modelId}" atribuído com sucesso ao agente "${target?.name}"!`);
    setTimeout(() => setActionSuccessMsg(''), 5000);
  };

  // Estados de Conexão Multi-Provedores (OpenCode, OpenRouter, OpenAI, Gemini, Groq, etc.)
  const [apiKeyInput, setApiKeyInput] = useState(() => aiConfig.apiKey || '');
  const [endpointUrlInput, setEndpointUrlInput] = useState(() => aiConfig.endpointUrl || 'https://opencode.ai/zen/go/v1');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    const existing = AI_PROVIDER_PRESETS.find(p => p.endpointUrl && aiConfig.endpointUrl && p.endpointUrl.replace(/\/+$/, '') === aiConfig.endpointUrl.replace(/\/+$/, ''));
    return existing ? existing.id : 'opencode_go';
  });
  const [showEndpointCustomInput, setShowEndpointCustomInput] = useState(false);
  const [autoDetectNotice, setAutoDetectNotice] = useState<string | null>(null);
  const [connectionDiagnostic, setConnectionDiagnostic] = useState<{
    code: string;
    title: string;
    suggestion: string;
    consoleUrl?: string;
  } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConnectingKey, setIsConnectingKey] = useState(false);
  const [searchModelQuery, setSearchModelQuery] = useState('');
  const [selectedProviderFilter, setSelectedProviderFilter] = useState('ALL');
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; latencyMs: number; message: string }>>({});

  // Estado de execução de teste do CFO
  const [isRunningCfo, setIsRunningCfo] = useState(false);
  const [cfoResult, setCfoResult] = useState<{ briefing: string; modelUsed: string; failover: boolean } | null>(null);

  // Mensagens de ação
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');
  const [actionErrorMsg, setActionErrorMsg] = useState('');

  // Estados do Playground de Testes Práticos de IA (com Modo de Comparação Lado a Lado)
  const [testPlaygroundModel, setTestPlaygroundModel] = useState<string>('');
  const [testPlaygroundModelB, setTestPlaygroundModelB] = useState<string>('gpt-5.6-luna');
  const [isComparisonMode, setIsComparisonMode] = useState(false);
  const [testPlaygroundPrompt, setTestPlaygroundPrompt] = useState<string>(
    'Analise rapidamente a saúde do caixa da Contaju e dê uma recomendação financeira executiva.'
  );
  const [isRunningPlaygroundTest, setIsRunningPlaygroundTest] = useState(false);
  const [playgroundResult, setPlaygroundResult] = useState<{
    content: string;
    modelUsed: string;
    latencyMs: number;
    success: boolean;
    error?: string;
  } | null>(null);
  const [playgroundResultB, setPlaygroundResultB] = useState<{
    content: string;
    modelUsed: string;
    latencyMs: number;
    success: boolean;
    error?: string;
  } | null>(null);

  const handleRunPlaygroundTest = async () => {
    if (!testPlaygroundPrompt.trim()) return;
    setIsRunningPlaygroundTest(true);
    setPlaygroundResult(null);
    setPlaygroundResultB(null);

    const targetModelA = testPlaygroundModel || aiConfig.primaryModel || 'deepseek-v4-pro';
    const targetModelB = testPlaygroundModelB || (catalogModels.find(m => m.id !== targetModelA)?.id || 'gpt-5.6-luna');

    try {
      if (isComparisonMode) {
        // Execução Concorrente Lado a Lado
        const [resA, resB] = await Promise.all([
          AiService.testPrompt(testPlaygroundPrompt.trim(), targetModelA),
          AiService.testPrompt(testPlaygroundPrompt.trim(), targetModelB)
        ]);

        setPlaygroundResult(resA);
        setPlaygroundResultB(resB);

        if (resA.success && resB.success) {
          const diff = Math.abs(resA.latencyMs - resB.latencyMs);
          const faster = resA.latencyMs <= resB.latencyMs ? resA.modelUsed : resB.modelUsed;
          setActionSuccessMsg(`Comparação concluída! ${faster} respondeu ${diff}ms mais rápido.`);
          setTimeout(() => setActionSuccessMsg(''), 5000);
        } else if (resA.success || resB.success) {
          setActionSuccessMsg('Comparação parcial executada.');
          setTimeout(() => setActionSuccessMsg(''), 4000);
        } else {
          setActionErrorMsg(resA.error || resB.error || 'Falha ao executar comparação.');
          setTimeout(() => setActionErrorMsg(''), 5000);
        }
      } else {
        // Execução Individual
        const res = await AiService.testPrompt(testPlaygroundPrompt.trim(), targetModelA);
        setPlaygroundResult(res);
        if (res.success) {
          setActionSuccessMsg(`Resposta recebida com sucesso via ${res.modelUsed} (${res.latencyMs}ms)!`);
          setTimeout(() => setActionSuccessMsg(''), 4000);
        } else {
          setActionErrorMsg(res.error || 'Falha ao executar teste.');
          setTimeout(() => setActionErrorMsg(''), 5000);
        }
      }
    } catch (err: any) {
      setPlaygroundResult({
        success: false,
        content: '',
        modelUsed: targetModelA,
        latencyMs: 0,
        error: err.message || 'Erro inesperado na execução do teste.'
      });
    } finally {
      setIsRunningPlaygroundTest(false);
    }
  };

  // Sincroniza catálogo de modelos em tempo real na montagem
  useEffect(() => {
    setIsSyncingModels(true);
    AiModelCatalogService.fetchCatalog(true)
      .then(res => {
        if (res.models && res.models.length > 0) {
          setCatalogModels(res.models);
        }
      })
      .catch(() => {})
      .finally(() => setIsSyncingModels(false));
  }, []);

  const handleRefreshCatalog = async () => {
    setIsSyncingModels(true);
    setActionSuccessMsg('');
    setActionErrorMsg('');
    try {
      const res = await AiModelCatalogService.fetchCatalog(true);
      setCatalogModels(res.models);
      setActionSuccessMsg(`Catálogo atualizado com sucesso! ${res.models.length} modelos sincronizados com OpenCode Go.`);
      setTimeout(() => setActionSuccessMsg(''), 5000);
    } catch (err: any) {
      setActionErrorMsg('Não foi possível sincronizar o catálogo online. Usando catálogo local.');
      setTimeout(() => setActionErrorMsg(''), 5000);
    } finally {
      setIsSyncingModels(false);
    }
  };

  // Sincroniza com as alterações no storage
  useEffect(() => {
    const unsub = storage.subscribe(() => {
      setAgents(AgentOrchestratorService.getAgents());
      setApprovals(AgentOrchestratorService.getAllApprovals());
      setRuns(storage.getAgentRuns());
      const cfg = AiService.getConfig();
      setAiConfig(cfg);
      if (cfg.apiKey && !apiKeyInput) {
        setApiKeyInput(cfg.apiKey);
      }
    });
    return unsub;
  }, []);

  const handleApiKeyChange = (val: string) => {
    setApiKeyInput(val);
    setConnectionDiagnostic(null);
    if (!val.trim()) return;

    const detected = detectProviderFromKey(val);
    if (detected && detected.id !== selectedPresetId) {
      setSelectedPresetId(detected.id);
      if (detected.endpointUrl) {
        setEndpointUrlInput(detected.endpointUrl);
      }
      setAutoDetectNotice(`Provedor identificado: ${detected.name}`);
      setTimeout(() => setAutoDetectNotice(null), 4000);
    }
  };

  const handleSelectPreset = (preset: AiProviderPreset) => {
    setSelectedPresetId(preset.id);
    setConnectionDiagnostic(null);
    if (preset.endpointUrl) {
      setEndpointUrlInput(preset.endpointUrl);
    }
    if (preset.id === 'custom') {
      setShowEndpointCustomInput(true);
    }
  };

  const handleConnectOpenCodeGo = async () => {
    if (!apiKeyInput.trim()) {
      setActionErrorMsg('Por favor, informe sua Chave de API.');
      setTimeout(() => setActionErrorMsg(''), 5000);
      return;
    }
    setIsConnectingKey(true);
    setActionErrorMsg('');
    setActionSuccessMsg('');
    setConnectionDiagnostic(null);
    try {
      const activePreset = AI_PROVIDER_PRESETS.find(p => p.id === selectedPresetId);
      const res = await AiModelCatalogService.connectAndSync(
        apiKeyInput.trim(),
        endpointUrlInput.trim(),
        activePreset?.suggestedPrimaryModel
      );
      setCatalogModels(AiModelCatalogService.getCachedCatalog());
      const updated = AiService.getConfig();
      setAiConfig(updated);
      if (res.success) {
        setActionSuccessMsg(`🎉 ${res.message}`);
        setTimeout(() => setActionSuccessMsg(''), 6000);
      } else {
        setActionErrorMsg(res.message);
        if (res.errorDiagnostic) {
          setConnectionDiagnostic({
            ...res.errorDiagnostic,
            consoleUrl: activePreset?.consoleUrl
          });
        }
        setTimeout(() => setActionErrorMsg(''), 8000);
      }
    } catch (err: any) {
      setActionErrorMsg(`Falha na conexão: ${err.message || 'Erro inesperado'}`);
      setTimeout(() => setActionErrorMsg(''), 6000);
    } finally {
      setIsConnectingKey(false);
    }
  };

  const handleTestSingleModel = async (modelId: string) => {
    setTestingModelId(modelId);
    try {
      const res = await AiService.testModelConnection(modelId, aiConfig.apiKey, aiConfig.endpointUrl);
      setTestResults(prev => ({ ...prev, [modelId]: res }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [modelId]: { success: false, latencyMs: 0, message: err.message || 'Falha de conexão' } }));
    } finally {
      setTestingModelId(null);
    }
  };

  const pendingApprovalsCount = approvals.filter(a => a.status === 'PENDENTE').length;

  const handleApprove = (id: string) => {
    setActionErrorMsg('');
    setActionSuccessMsg('');
    const res = AgentOrchestratorService.approveProposal(id);
    if (res.success) {
      setActionSuccessMsg(res.message);
      setTimeout(() => setActionSuccessMsg(''), 4000);
    } else {
      setActionErrorMsg(res.message);
      setTimeout(() => setActionErrorMsg(''), 5000);
    }
  };

  const handleReject = (id: string) => {
    setActionErrorMsg('');
    setActionSuccessMsg('');
    const res = AgentOrchestratorService.rejectProposal(id);
    if (res.success) {
      setActionSuccessMsg(res.message);
      setTimeout(() => setActionSuccessMsg(''), 4000);
    } else {
      setActionErrorMsg(res.message);
      setTimeout(() => setActionErrorMsg(''), 5000);
    }
  };

  const handleRunCfoAnalysis = async () => {
    setIsRunningCfo(true);
    setActionErrorMsg('');
    try {
      const res = await AgentOrchestratorService.runCfoAnalysis();
      if (res.success) {
        setCfoResult({
          briefing: res.briefing,
          modelUsed: res.modelUsed,
          failover: res.failoverOccurred
        });
      } else {
        setActionErrorMsg(res.briefing || 'Não foi possível gerar a análise.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Falha de comunicação.');
    } finally {
      setIsRunningCfo(false);
    }
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
    <div className="space-y-6">
      {/* Top Banner de Governança e Gateway Seguro */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 border border-slate-700/60 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Gateway Serverless Ativo
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                <Lock className="w-3 h-3 text-amber-400" />
                Zero Segredos no Cliente (PII Redacted)
              </span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
              <Bot className="w-7 h-7 text-amber-400" />
              Central de Agentes Financeiros & IA
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Agentes especialistas para apoio à gestão financeira. As consultas e análises operam de forma autônoma sob isolamento de tenant; qualquer baixa contábil exige autorização humana prévia.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRunCfoAnalysis}
              disabled={isRunningCfo}
              className="px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isRunningCfo ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  Analisando Caixa...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar Parecer do CFO
                </>
              )}
            </button>
          </div>
        </div>

        {/* Painel Central de Conexão Multi-Provedores & IAs */}
        <div className="mt-5 p-4 sm:p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--gold-edge)] shadow-lg space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-purple-600/20 text-[var(--brand-gold)] border border-purple-500/40 shrink-0 mt-0.5">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <span>Hub de Conexão Multi-Provedores de IA</span>
                  </h3>
                  {aiConfig.apiKey ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Chave Ativa
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-[var(--brand-gold)] border border-amber-500/40 animate-pulse">
                      Selecione o provedor e insira sua chave
                    </span>
                  )}
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-[var(--brand-gold)] border border-purple-500/30">
                    {catalogModels.length} IAs Carregadas
                  </span>
                  {aiConfig.primaryModel && (
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Modelo: <strong className="text-[var(--brand-gold)]">{aiConfig.primaryModel}</strong>
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xl">
                  Conecte sua chave da <strong>OpenCode</strong>, <strong>OpenRouter</strong>, <strong>OpenAI</strong>, <strong>Google Gemini</strong>, <strong>Groq</strong> ou <strong>Endpoint Customizado</strong>. Ao colar sua chave, o sistema detecta o provedor automaticamente.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRefreshCatalog}
              disabled={isSyncingModels}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover,var(--surface-elevated))] text-[var(--text-secondary)] border border-[var(--border-subtle)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50 self-stretch sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingModels ? 'animate-spin text-[var(--brand-gold)]' : 'text-[var(--text-secondary)]'}`} />
              <span>{isSyncingModels ? 'Sincronizando...' : 'Recarregar Catálogo'}</span>
            </button>
          </div>

          {/* Seletor de Presets de Provedores com 1 Clique */}
          <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[var(--brand-gold)]" />
                <span>Escolha o Provedor da sua Chave:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowEndpointCustomInput(!showEndpointCustomInput)}
                className="text-[11px] text-[var(--brand-gold)] hover:text-[var(--brand-gold)] underline cursor-pointer"
              >
                {showEndpointCustomInput ? 'Ocultar URL do Endpoint' : 'Ver/Editar URL do Endpoint'}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AI_PROVIDER_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500/20 text-[var(--brand-gold)] border-amber-500/50 shadow-sm shadow-amber-500/10'
                        : 'bg-[var(--surface-elevated)] hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                    }`}
                  >
                    <span>{preset.name}</span>
                    {preset.badge && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-semibold ${
                        isSelected ? 'bg-amber-500/30 text-amber-200' : 'bg-[var(--surface-elevated)] text-[var(--text-muted)]'
                      }`}>
                        {preset.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campo Customizável de Endpoint URL caso expandido */}
          {showEndpointCustomInput && (
            <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1">
              <label className="block text-[11px] font-bold text-[var(--text-secondary)]">
                URL Base do Endpoint da API (OpenAI-Compatible):
              </label>
              <input
                type="text"
                value={endpointUrlInput}
                onChange={(e) => setEndpointUrlInput(e.target.value)}
                placeholder="https://opencode.ai/zen/go/v1 ou https://openrouter.ai/api/v1"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono text-[var(--text-primary)] placeholder:text-slate-500 focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
              <span className="text-[10px] text-[var(--text-muted)] block">
                O gateway adicionará automaticamente <code>/chat/completions</code> para despacho das mensagens.
              </span>
            </div>
          )}

          {/* Aviso de Auto-Detecção */}
          {autoDetectNotice && (
            <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-200 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--brand-gold)] shrink-0" />
              <span>{autoDetectNotice}</span>
            </div>
          )}

          {/* Input Direto da Chave e Botão de Salvar/Atualizar */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={AI_PROVIDER_PRESETS.find(p => p.id === selectedPresetId)?.placeholder || 'Cole sua API Key aqui'}
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono text-[var(--text-primary)] placeholder:text-slate-500 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                title={showApiKey ? 'Ocultar chave' : 'Exibir chave'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="button"
              onClick={handleConnectOpenCodeGo}
              disabled={isConnectingKey || !apiKeyInput.trim()}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isConnectingKey ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Validando Chave & Modelos...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Validar Conexão & Salvar Chave</span>
                </>
              )}
            </button>
          </div>

          {/* Diagnóstico Inteligente em caso de Falha ou Chave Expirada */}
          {connectionDiagnostic && (
            <div className="mt-3 p-4 rounded-xl border border-rose-500/40 bg-rose-950/40 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-rose-200">
                      {connectionDiagnostic.title}
                    </h4>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-mono border border-rose-500/30">
                      {connectionDiagnostic.code}
                    </span>
                  </div>
                  <p className="text-xs text-rose-300">
                    {connectionDiagnostic.suggestion}
                  </p>
                </div>
              </div>

              {connectionDiagnostic.consoleUrl && (
                <div className="pt-2 flex items-center gap-3 border-t border-rose-500/20">
                  <a
                    href={connectionDiagnostic.consoleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-[var(--text-primary)] font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Acessar Console para Gerar Nova Chave</span>
                  </a>
                  <span className="text-[11px] text-rose-300">
                    Gere uma nova chave lá, copie e cole no campo acima para revalidar.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notificações de Ação */}
        {actionSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}
        {actionErrorMsg && !connectionDiagnostic && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionErrorMsg}</span>
          </div>
        )}
      </div>

      {/* Navegação entre Abas da Central */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('GATEWAY')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'GATEWAY'
              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
          }`}
        >
          <Key className="w-4 h-4 text-amber-500" />
          <span>Catálogo de Modelos & Conexão ({catalogModels.length})</span>
          {aiConfig.apiKey ? (
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('AGENTES')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'AGENTES'
              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
          }`}
        >
          <Bot className="w-4 h-4" />
          Agentes Especialistas ({agents.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('APROVACOES')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'APROVACOES'
              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
          }`}
        >
          <CheckCheck className="w-4 h-4" />
          Aprovações Human-in-the-Loop
          {pendingApprovalsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RUNS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'RUNS'
              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]'
          }`}
        >
          <Activity className="w-4 h-4" />
          Trilha de Auditoria & Execuções ({runs.length})
        </button>
      </div>

      {/* ABA 1: AGENTES ESPECIALISTAS */}
      {activeTab === 'AGENTES' && (
        <div className="space-y-6">
          {/* Parecer do CFO Gerado em Tempo Real */}
          {cfoResult && (
            <div className="p-6 rounded-2xl bg-[var(--surface-elevated)] border border-amber-500/30 shadow-lg relative">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2.5">
                  <Briefcase className="w-5 h-5 text-amber-500" />
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Parecer Executivo da Diretoria Financeira (CFO)
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
                  <span>Modelo: <strong>{cfoResult.modelUsed}</strong></span>
                  {cfoResult.failover && (
                    <span className="text-amber-400 font-bold">(Failover Acionado)</span>
                  )}
                  <button 
                    type="button" 
                    onClick={() => setCfoResult(null)}
                    className="p-1 hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed whitespace-pre-line text-[var(--text-primary)]">
                {cfoResult.briefing}
              </div>
            </div>
          )}

          {/* Top Bar da Aba de Agentes: Resumo & Ações Rápidas */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Personalização de Prompts, Modelos & Capacidades
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Altere livremente as capacidades, o prompt mestre e selecione qualquer um dos modelos de IA disponíveis para cada especialista.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                {catalogModels.length} Modelos Disponíveis no Catálogo
              </span>
            </div>
          </div>

          {/* Cards dos 4 Especialistas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {agents.map(agent => {
              const modelMeta = catalogModels.find(m => m.id === agent.defaultModel);
              return (
                <div 
                  key={agent.id}
                  className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] hover:border-amber-500/40 transition-all flex flex-col justify-between shadow-xs space-y-4"
                >
                  <div className="space-y-3.5">
                    {/* Top Row: Ícone, Nome, Papel e Toggle de Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] shadow-xs shrink-0">
                          {getAgentRoleIcon(agent.role)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-[var(--text-primary)]">{agent.name}</h4>
                            <span className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-mono font-semibold px-2 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                              {agent.role}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">
                            {agent.description}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleAgentStatus(agent.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer shrink-0 border ${
                          agent.isActive 
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25' 
                            : 'bg-slate-700/40 text-slate-400 border-slate-600 hover:bg-slate-700'
                        }`}
                        title="Clique para alternar entre Ativo e Pausado"
                      >
                        {agent.isActive ? '● Ativo' : '○ Em Pausa'}
                      </button>
                    </div>

                    {/* Bloco do Modelo Selecionado */}
                    <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-wider block">
                          Modelo de IA Atribuído:
                        </span>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-amber-500" />
                            {modelMeta?.name || agent.defaultModel}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/20 text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {agent.defaultModel}
                          </span>
                          {modelMeta?.provider && (
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {modelMeta.provider}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingAgent(agent)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-card)] hover:bg-amber-500/15 hover:text-amber-400 text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                        title="Mudar o modelo deste agente"
                      >
                        <Cpu className="w-3 h-3 text-amber-500" />
                        <span>Trocar Modelo</span>
                      </button>
                    </div>

                    {/* Bloco do Prompt do Sistema (Instruções Mestras) */}
                    <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-amber-500" />
                          <span>Prompt Mestre do Agente</span>
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                          {agent.systemPrompt?.length || 0} caracteres
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-primary)] font-mono bg-[var(--surface-card)] p-2.5 rounded-lg border border-[var(--border-subtle)] line-clamp-3 leading-relaxed whitespace-pre-wrap">
                        {agent.systemPrompt}
                      </p>
                    </div>

                    {/* Capacidades & Ferramentas Autorizadas */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1">
                          <Wrench className="w-3.5 h-3.5 text-amber-500" />
                          <span>Capacidades Autorizadas ({agent.allowedTools?.length || 0}):</span>
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold">
                          Permissões Contábeis
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.allowedTools?.map((tool, idx) => (
                          <span 
                            key={idx} 
                            className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Card com Ações */}
                  <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <span className="text-[11px] text-amber-500 font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{agent.requiresApproval ? 'Requer Aprovação Humana Prévia' : 'Modo Autônomo para Consultas'}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => setEditingAgent(agent)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Editar Agente (Prompt & Modelo)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 2: APROVAÇÕES PENDENTES (HUMAN-IN-THE-LOOP) */}
      {activeTab === 'APROVACOES' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 shrink-0 text-amber-500" />
            <span>
              <strong>Princípio de Integridade Contábil:</strong> As propostas listadas abaixo foram calculadas e sugeridas pelos agentes especialistas. Nenhuma movimentação bancária ou baixa de título é efetivada sem a sua revisão e aprovação explícita.
            </span>
          </div>

          {approvals.length === 0 ? (
            <div className="p-12 text-center bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)]">
              <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-[var(--text-primary)]">Nenhuma proposta pendente</h4>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Todas as recomendações de conciliação e títulos estão em dia.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {approvals.map(appr => (
                <div 
                  key={appr.id}
                  className="p-4 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        appr.status === 'PENDENTE' 
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : appr.status === 'APROVADO'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-rose-500/15 text-rose-400'
                      }`}>
                        {appr.status}
                      </span>
                      <span className="text-[10px] text-[var(--text-secondary)]">
                        Agente: <strong>{appr.agentRole}</strong> • Confiança: <strong>{appr.confidenceScore}%</strong>
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-[var(--text-primary)]">{appr.title}</h4>
                    <p className="text-xs text-[var(--text-secondary)]">{appr.description}</p>
                    <p className="text-[11px] text-[var(--text-secondary)] italic bg-[var(--surface-elevated)] p-2 rounded-lg">
                      💡 Justificativa Contábil: {appr.reasoning}
                    </p>
                  </div>

                  {appr.status === 'PENDENTE' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReject(appr.id)}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApprove(appr.id)}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Aprovar & Executar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: TRILHA DE AUDITORIA & EXECUÇÕES */}
      {activeTab === 'RUNS' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                Histórico de Execuções dos Agentes
              </h3>
              <span className="text-xs text-[var(--text-secondary)]">{runs.length} chamadas registradas</span>
            </div>

            {runs.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
                Nenhuma execução registrada até o momento.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[var(--surface-elevated)] text-[var(--text-secondary)] font-semibold border-b border-[var(--border-subtle)]">
                      <th className="p-3">Data/Hora</th>
                      <th className="p-3">Agente</th>
                      <th className="p-3">Tarefa</th>
                      <th className="p-3">Modelo</th>
                      <th className="p-3">Latência</th>
                      <th className="p-3">Failover</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {runs.map(run => (
                      <tr key={run.id} className="hover:bg-[var(--surface-elevated)] transition-colors">
                        <td className="p-3 text-[var(--text-secondary)] font-mono">
                          {new Date(run.startedAt).toLocaleString('pt-BR')}
                        </td>
                        <td className="p-3 font-bold text-[var(--text-primary)]">
                          {run.agentRole}
                        </td>
                        <td className="p-3 text-[var(--text-primary)]">
                          {run.taskType}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-amber-500">
                          {run.modelUsed}
                        </td>
                        <td className="p-3 font-mono text-[11px]">
                          {run.latencyMs}ms
                        </td>
                        <td className="p-3">
                          {run.failoverOccurred ? (
                            <span className="text-amber-400 font-bold">Sim</span>
                          ) : (
                            <span className="text-[var(--text-secondary)]">Não</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            run.status === 'SUCESSO' 
                              ? 'bg-emerald-500/15 text-emerald-400' 
                              : 'bg-rose-500/15 text-rose-400'
                          }`}>
                            {run.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 4: CONEXÃO OPENCODE GO & CATÁLOGO DINÂMICO DE IAS */}
      {activeTab === 'GATEWAY' && (
        <div className="space-y-6">
          {/* Card 1: Conexão e Importação da Chave OpenCode Go */}
          <div className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <span>Ativação & Conexão OpenCode Go</span>
                    {aiConfig.apiKey ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Ativo & Conectado
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Aguardando Chave
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Cole sua chave da API do OpenCode Go abaixo. Ao conectar, o sistema valida a credencial, atualiza e importa todas as IAs disponíveis para uso imediato no sistema.
                  </p>
                </div>
              </div>

              <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] self-start sm:self-auto">
                Endpoint: https://opencode.ai/zen/go/v1
              </span>
            </div>

            {/* Input da Chave e Ação de Conexão Imediata */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-[var(--text-primary)]">
                Chave da API do OpenCode Go:
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="Cole sua chave da API OpenCode Go (ex: sk-... ou opencode_...)"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs font-mono text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                    title={showApiKey ? 'Ocultar chave' : 'Exibir chave'}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleConnectOpenCodeGo}
                  disabled={isConnectingKey}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isConnectingKey ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                      <span>Validando & Importando IAs...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Conectar & Importar IAs Agora</span>
                    </>
                  )}
                </button>
              </div>

              {aiConfig.apiKey && (
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold pt-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Chave configurada com sucesso. As IAs estão ativas para Conciliação Bancária, Parecer do CFO e Análises Contábeis.</span>
                </div>
              )}
            </div>
          </div>

          {/* Card: Playground de Teste Prático & Imediato de IA */}
          <div className="p-6 rounded-2xl bg-[var(--surface-card)] border border-amber-500/30 space-y-4 shadow-md bg-gradient-to-b from-amber-500/5 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Playground: Teste Prático & Imediato de IA</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Faça perguntas financeiras ou testes de ping para qualquer modelo e veja o tempo de resposta em milissegundos na hora.
                </p>
              </div>

              {/* Controles de Modo e Seletores de Modelos */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Toggle Modo Individual vs Comparação */}
                <div className="flex items-center p-0.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs">
                  <button
                    type="button"
                    onClick={() => setIsComparisonMode(false)}
                    className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      !isComparisonMode
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Teste Único
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsComparisonMode(true)}
                    className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isComparisonMode
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Columns className="w-3.5 h-3.5" />
                    <span>Comparar 2 Modelos</span>
                  </button>
                </div>

                {!isComparisonMode ? (
                  /* Seletor de Modelo Individual */
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">Modelo:</span>
                    <PremiumSelect
                      value={testPlaygroundModel || aiConfig.primaryModel}
                      onChange={(e) => setTestPlaygroundModel(e.target.value)}
                      className="bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {catalogModels.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.id}) {m.id === aiConfig.primaryModel ? '⭐ Primário' : ''}
                        </option>
                      ))}
                    </PremiumSelect>
                    {testPlaygroundModel && testPlaygroundModel !== aiConfig.primaryModel && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = { ...aiConfig, primaryModel: testPlaygroundModel };
                          AiService.saveConfig(updated);
                          setAiConfig(updated);
                          setActionSuccessMsg(`Modelo primário definido para ${testPlaygroundModel}`);
                          setTimeout(() => setActionSuccessMsg(''), 4000);
                        }}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer shrink-0"
                        title="Definir este modelo como padrão para todo o sistema"
                      >
                        Usar Como Primário
                      </button>
                    )}
                  </div>
                ) : (
                  /* Seletores de Modelos A e B para Comparação */
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-amber-400">Modelo A:</span>
                      <PremiumSelect
                        value={testPlaygroundModel || aiConfig.primaryModel}
                        onChange={(e) => setTestPlaygroundModel(e.target.value)}
                        className="bg-[var(--surface-elevated)] border border-amber-500/40 rounded-xl px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        {catalogModels.map(m => (
                          <option key={`a-${m.id}`} value={m.id}>
                            {m.name} {m.id === aiConfig.primaryModel ? '⭐' : ''}
                          </option>
                        ))}
                      </PremiumSelect>
                    </div>

                    <span className="text-xs text-[var(--text-secondary)] font-bold">vs</span>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-purple-400">Modelo B:</span>
                      <PremiumSelect
                        value={testPlaygroundModelB}
                        onChange={(e) => setTestPlaygroundModelB(e.target.value)}
                        className="bg-[var(--surface-elevated)] border border-purple-500/40 rounded-xl px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-purple-500"
                      >
                        {catalogModels.map(m => (
                          <option key={`b-${m.id}`} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </PremiumSelect>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sugestões Rápidas de Pergunta */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-[var(--text-secondary)] text-[11px] font-bold uppercase tracking-wider">
                Exemplos de Teste Rápido:
              </span>
              <button
                type="button"
                onClick={() => setTestPlaygroundPrompt("Responda apenas: 'IA Contaju Conectada com Sucesso!' e informe a data/hora e o seu modelo.")}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs border border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                ⚡ Ping de Conexão
              </button>
              <button
                type="button"
                onClick={() => setTestPlaygroundPrompt("Analise rapidamente a saúde do caixa da Contaju e dê uma recomendação financeira executiva.")}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs border border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                📊 Parecer de Caixa
              </button>
              <button
                type="button"
                onClick={() => setTestPlaygroundPrompt("Como categorizar no plano de contas um lançamento de extrato: 'DEB TARIFA PIX MENSALIDADE'?")}
                className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-xs border border-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                🏷️ Teste de Conciliação
              </button>
            </div>

            {/* Input da Pergunta e Botão de Executar */}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={testPlaygroundPrompt}
                onChange={(e) => setTestPlaygroundPrompt(e.target.value)}
                placeholder="Digite uma pergunta para a IA testar (ex: Como classificar tarifa bancária?)..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRunPlaygroundTest();
                }}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleRunPlaygroundTest}
                disabled={isRunningPlaygroundTest || !testPlaygroundPrompt.trim() || !aiConfig.apiKey}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isRunningPlaygroundTest ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isComparisonMode ? 'Comparando Modelos...' : 'Executando IA...'}</span>
                  </>
                ) : (
                  <>
                    {isComparisonMode ? <Columns className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                    <span>{isComparisonMode ? 'Comparar Lado a Lado' : 'Executar Teste Agora'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Exibição da Resposta: Modo Individual */}
            {!isComparisonMode && playgroundResult && (
              <div className={`p-4 rounded-xl border text-xs space-y-2 animate-in fade-in ${
                playgroundResult.success 
                  ? 'bg-[var(--surface-elevated)] border-emerald-500/30' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                      playgroundResult.success ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {playgroundResult.success ? '✓ Resposta Recebida' : 'Falha na Consulta'}
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      Modelo: <strong className="text-amber-500">{playgroundResult.modelUsed}</strong>
                    </span>
                  </div>
                  {playgroundResult.success && (
                    <span className="font-mono text-emerald-400 font-bold">
                      ⚡ Latência: {playgroundResult.latencyMs}ms
                    </span>
                  )}
                </div>

                <div className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-sans text-xs pt-1">
                  {playgroundResult.success ? playgroundResult.content : playgroundResult.error}
                </div>
              </div>
            )}

            {/* Exibição da Resposta: Modo Comparação Lado a Lado */}
            {isComparisonMode && (playgroundResult || playgroundResultB) && (
              <div className="space-y-3 animate-in fade-in">
                {/* Banner de Latência e Vencedor */}
                {playgroundResult?.success && playgroundResultB?.success && (
                  <div className="p-3 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-between text-xs text-purple-200">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>Diferença de Performance: </strong>
                        {playgroundResult.latencyMs < playgroundResultB.latencyMs ? (
                          <>
                            <strong className="text-amber-400">{playgroundResult.modelUsed}</strong> foi{' '}
                            <span className="font-mono font-bold text-emerald-400">
                              {playgroundResultB.latencyMs - playgroundResult.latencyMs}ms mais rápido
                            </span>{' '}
                            que {playgroundResultB.modelUsed}.
                          </>
                        ) : playgroundResultB.latencyMs < playgroundResult.latencyMs ? (
                          <>
                            <strong className="text-purple-400">{playgroundResultB.modelUsed}</strong> foi{' '}
                            <span className="font-mono font-bold text-emerald-400">
                              {playgroundResult.latencyMs - playgroundResultB.latencyMs}ms mais rápido
                            </span>{' '}
                            que {playgroundResult.modelUsed}.
                          </>
                        ) : (
                          'Empate técnico em velocidade!'
                        )}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] opacity-75 shrink-0 hidden sm:inline">
                      {playgroundResult.latencyMs}ms vs {playgroundResultB.latencyMs}ms
                    </span>
                  </div>
                )}

                {/* Grid Duplo Lado a Lado */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Painel do Modelo A */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-[var(--surface-elevated)] space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            Modelo A: {playgroundResult?.modelUsed || testPlaygroundModel || aiConfig.primaryModel}
                          </span>
                          {playgroundResult?.success && playgroundResultB?.success && playgroundResult.latencyMs <= playgroundResultB.latencyMs && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                              <Trophy className="w-3 h-3 text-emerald-400" /> Mais Rápido
                            </span>
                          )}
                        </div>
                        {playgroundResult?.success && (
                          <span className="font-mono text-emerald-400 font-bold">
                            ⚡ {playgroundResult.latencyMs}ms
                          </span>
                        )}
                      </div>

                      <div className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-sans text-xs max-h-[320px] overflow-y-auto pr-1">
                        {playgroundResult?.success ? playgroundResult.content : (playgroundResult?.error || 'Aguardando execução...')}
                      </div>
                    </div>

                    {playgroundResult?.success && playgroundResult.modelUsed !== aiConfig.primaryModel && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...aiConfig, primaryModel: playgroundResult.modelUsed };
                            AiService.saveConfig(updated);
                            setAiConfig(updated);
                            setActionSuccessMsg(`Modelo primário alterado para ${playgroundResult.modelUsed}`);
                            setTimeout(() => setActionSuccessMsg(''), 4000);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
                        >
                          Definir como Primário ⭐
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Painel do Modelo B */}
                  <div className="p-4 rounded-xl border border-purple-500/30 bg-[var(--surface-elevated)] space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            Modelo B: {playgroundResultB?.modelUsed || testPlaygroundModelB}
                          </span>
                          {playgroundResult?.success && playgroundResultB?.success && playgroundResultB.latencyMs < playgroundResult.latencyMs && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 flex items-center gap-1">
                              <Trophy className="w-3 h-3 text-emerald-400" /> Mais Rápido
                            </span>
                          )}
                        </div>
                        {playgroundResultB?.success && (
                          <span className="font-mono text-emerald-400 font-bold">
                            ⚡ {playgroundResultB.latencyMs}ms
                          </span>
                        )}
                      </div>

                      <div className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-sans text-xs max-h-[320px] overflow-y-auto pr-1">
                        {playgroundResultB?.success ? playgroundResultB.content : (playgroundResultB?.error || 'Aguardando execução...')}
                      </div>
                    </div>

                    {playgroundResultB?.success && playgroundResultB.modelUsed !== aiConfig.primaryModel && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...aiConfig, primaryModel: playgroundResultB.modelUsed };
                            AiService.saveConfig(updated);
                            setAiConfig(updated);
                            setActionSuccessMsg(`Modelo primário alterado para ${playgroundResultB.modelUsed}`);
                            setTimeout(() => setActionSuccessMsg(''), 4000);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer"
                        >
                          Definir como Primário ⭐
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Cadeia de Contingência Dinâmica (Failover) */}
          <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>Cadeia de Contingência Ativa</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Ordem de execução das IAs. Se o modelo primário retornar sobrecarga ou Rate Limit (429), o próximo assume automaticamente.
                </p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  setIsSyncingModels(true);
                  try {
                    const res = await AiModelCatalogService.fetchCatalog(true);
                    setCatalogModels(res.models);
                    setActionSuccessMsg(`Catálogo sincronizado: ${res.models.length} modelos identificados.`);
                    setTimeout(() => setActionSuccessMsg(''), 4000);
                  } catch (e: any) {
                    setActionErrorMsg(`Falha na atualização: ${e.message}`);
                    setTimeout(() => setActionErrorMsg(''), 4000);
                  } finally {
                    setIsSyncingModels(false);
                  }
                }}
                disabled={isSyncingModels}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors flex items-center gap-2 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isSyncingModels ? 'animate-spin' : ''}`} />
                <span>{isSyncingModels ? 'Sincronizando...' : 'Atualizar Lista Oficial'}</span>
              </button>
            </div>

            {/* Modelos da Cadeia Ativa */}
            <div className="space-y-2">
              {[aiConfig.primaryModel, ...(aiConfig.fallbackModels || [])].filter(Boolean).map((modelId, idx) => {
                const isPrimary = idx === 0;
                const meta = catalogModels.find(m => m.id === modelId);
                const testRes = testResults[modelId];
                const isTesting = testingModelId === modelId;

                return (
                  <div
                    key={modelId}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isPrimary 
                        ? 'bg-amber-500/10 border-amber-500/40 text-[var(--text-primary)]' 
                        : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                        isPrimary ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-700 text-slate-300'
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs">{meta?.name || modelId}</span>
                          <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-[var(--surface-card)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                            {modelId}
                          </span>
                          {isPrimary && (
                            <span className="px-2 py-0.2 rounded-full text-[9px] font-black uppercase bg-amber-500 text-slate-950">
                              ⭐ Modelo Primário
                            </span>
                          )}
                        </div>
                        {meta?.description && (
                          <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">{meta.description}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {testRes && (
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${
                          testRes.success 
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        }`}>
                          {testRes.success ? `Ativo (${testRes.latencyMs}ms)` : 'Falhou'}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleTestSingleModel(modelId)}
                        disabled={isTesting || !aiConfig.apiKey}
                        className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
                        title="Testar conectividade"
                      >
                        {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" /> : <Play className="w-3.5 h-3.5" />}
                      </button>

                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentChain = [aiConfig.primaryModel, ...(aiConfig.fallbackModels || [])];
                            const updatedChain = currentChain.filter(m => m !== modelId);
                            const updatedConfig = {
                              ...aiConfig,
                              primaryModel: updatedChain[0] || 'deepseek-v4-pro',
                              fallbackModels: updatedChain.slice(1)
                            };
                            AiService.saveConfig(updatedConfig);
                            setAiConfig(updatedConfig);
                          }}
                          className="p-1.5 rounded-lg border border-[var(--border-subtle)] hover:bg-rose-500/10 text-[var(--text-secondary)] hover:text-rose-400 cursor-pointer"
                          title="Remover da contingência"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: Explorador Completo das IAs da OpenCode Go */}
          <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  <span>IAs Disponíveis no OpenCode Go ({catalogModels.length} modelos)</span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Clique em "Tornar Primário" ou "+ Contingência" para configurar quais IAs o aplicativo utilizará nas análises.
                </p>
              </div>

              {/* Busca de Modelo */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
                <input
                  type="text"
                  value={searchModelQuery}
                  onChange={(e) => setSearchModelQuery(e.target.value)}
                  placeholder="Pesquisar IA (ex: deepseek, luna, qwen)..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Grid com os Modelos Disponíveis */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {catalogModels
                .filter(m => {
                  if (!searchModelQuery.trim()) return true;
                  const q = searchModelQuery.toLowerCase();
                  return m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || (m.description && m.description.toLowerCase().includes(q));
                })
                .map((item) => {
                  const isPrimary = aiConfig.primaryModel === item.id;
                  const isFallback = aiConfig.fallbackModels?.includes(item.id);
                  const isTesting = testingModelId === item.id;
                  const testRes = testResults[item.id];

                  return (
                    <div 
                      key={item.id}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                        isPrimary 
                          ? 'bg-amber-500/10 border-amber-500/40 text-[var(--text-primary)] shadow-xs'
                          : isFallback
                          ? 'bg-blue-500/10 border-blue-500/30 text-[var(--text-primary)]'
                          : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <span className="font-bold text-xs text-[var(--text-primary)] truncate block">{item.name}</span>
                            <span className="text-[9px] font-mono text-[var(--text-secondary)] truncate block">{item.id}</span>
                          </div>
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--surface-card)] border border-[var(--border-subtle)] shrink-0">
                            {item.provider}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed mb-3 line-clamp-2">
                          {item.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-1 text-[11px]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleTestSingleModel(item.id)}
                            disabled={isTesting || !aiConfig.apiKey}
                            className="p-1 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-40"
                            title="Testar ping e conectividade"
                          >
                            {isTesting ? <RefreshCw className="w-3 h-3 animate-spin text-amber-500" /> : <Play className="w-3 h-3" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTestPlaygroundModel(item.id);
                              window.scrollTo({ top: 250, behavior: 'smooth' });
                            }}
                            className="px-1.5 py-1 rounded-md border border-[var(--border-subtle)] hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-amber-500 cursor-pointer text-[10px] flex items-center gap-1"
                            title="Carregar este modelo no Playground de teste"
                          >
                            <MessageSquare className="w-2.5 h-2.5" />
                            <span>Testar</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
                          {/* Agentes que já usam este modelo */}
                          {agents.filter(ag => ag.defaultModel === item.id).map(ag => (
                            <span 
                              key={ag.id} 
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1"
                              title={`Este modelo é utilizado pelo agente ${ag.name}`}
                            >
                              <Bot className="w-2.5 h-2.5 text-amber-500" />
                              <span className="truncate max-w-[80px]">{ag.name}</span>
                            </span>
                          ))}

                          {/* Dropdown Atribuir a Agente */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setAssigningModelDropdown(assigningModelDropdown === item.id ? null : item.id)}
                              className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[var(--surface-card)] hover:bg-amber-500/15 hover:text-amber-400 text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer flex items-center gap-1"
                              title="Vincular este modelo de IA a um agente específico"
                            >
                              <Bot className="w-2.5 h-2.5 text-amber-500" />
                              <span>Vincular Agente</span>
                              <ChevronDown className="w-2.5 h-2.5" />
                            </button>

                            {assigningModelDropdown === item.id && (
                              <div className="absolute right-0 bottom-full mb-1 w-56 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-xl z-30 p-1.5 space-y-1 animate-in fade-in zoom-in-95">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] px-2 py-1 block border-b border-[var(--border-subtle)]">
                                  Vincular modelo a:
                                </span>
                                {agents.map(ag => (
                                  <button
                                    key={ag.id}
                                    type="button"
                                    onClick={() => handleAssignModelToAgent(item.id, ag.role)}
                                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-amber-500/15 text-[var(--text-primary)] hover:text-amber-400 flex items-center justify-between transition-colors cursor-pointer"
                                  >
                                    <span className="truncate">{ag.name}</span>
                                    {ag.defaultModel === item.id ? (
                                      <span className="text-[9px] font-bold text-emerald-400">Ativo</span>
                                    ) : (
                                      <span className="text-[9px] text-[var(--text-secondary)]">Aplicar</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {isPrimary ? (
                            <span className="text-[10px] font-black text-amber-500 px-2 py-0.5">
                              ⭐ Ativo
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated: AiProviderConfig = {
                                    ...aiConfig,
                                    primaryModel: item.id
                                  };
                                  AiService.saveConfig(updated);
                                  setAiConfig(updated);
                                  setActionSuccessMsg(`Modelo primário alterado para ${item.name}.`);
                                  setTimeout(() => setActionSuccessMsg(''), 3000);
                                }}
                                className="px-2 py-0.5 text-[10px] font-bold rounded-md border border-amber-500/50 text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
                              >
                                Tornar Primário
                              </button>

                              {!isFallback ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const fallbacks = aiConfig.fallbackModels || [];
                                    if (!fallbacks.includes(item.id)) {
                                      const updated: AiProviderConfig = {
                                        ...aiConfig,
                                        fallbackModels: [...fallbacks, item.id]
                                      };
                                      AiService.saveConfig(updated);
                                      setAiConfig(updated);
                                    }
                                  }}
                                  className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[var(--surface-card)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] transition-colors cursor-pointer"
                                >
                                  + Contingência
                                </button>
                              ) : (
                                <span className="text-[9px] font-bold text-blue-400 px-1.5 py-0.5">
                                  ✓ Na Cadeia
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição Completa do Agente (Prompts, Modelos e Capacidades) */}
      <AgentEditModal
        isOpen={Boolean(editingAgent)}
        onClose={() => setEditingAgent(null)}
        agent={editingAgent}
        availableModels={catalogModels}
        onSave={handleSaveEditedAgent}
      />
    </div>
  );
};
