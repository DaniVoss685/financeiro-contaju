import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bot, 
  Sparkles, 
  Key, 
  Layers, 
  ArrowUp, 
  ArrowDown, 
  CheckCircle2, 
  AlertTriangle, 
  RotateCcw, 
  Play, 
  ShieldCheck, 
  Eye, 
  EyeOff, 
  Clock, 
  Zap, 
  Check, 
  X, 
  Plus, 
  Sliders, 
  Activity,
  FileCheck,
  TrendingUp,
  Server,
  RefreshCw,
  Search,
  Filter,
  CheckCheck,
  ExternalLink,
  Code,
  Globe
} from 'lucide-react';
import { AiProviderConfig, AiModelChainItem, AiProviderName, AiModelCategory } from '../../types';
import { AiService } from '../../services/aiService';
import { AiModelCatalogService, AI_PROVIDER_PRESETS, detectProviderFromKey } from '../../services/aiModelCatalogService';
import { storage } from '../../services/storageService';
import { PremiumSelect } from '../Common/PremiumSelect';

export const AiConfigView: React.FC = () => {
  const [config, setConfig] = useState<AiProviderConfig>(() => AiService.getConfig());
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  
  // Catálogo dinâmico de modelos
  const [availableModels, setAvailableModels] = useState<AiModelChainItem[]>(() => 
    AiModelCatalogService.getCachedCatalog()
  );
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryStatusMsg, setDiscoveryStatusMsg] = useState('');
  const [discoveryErrorMsg, setDiscoveryErrorMsg] = useState('');

  // Filtros do Catálogo
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showDevAgents, setShowDevAgents] = useState(false);

  // Estado de teste de conexão por modelo
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, {
    success: boolean;
    latencyMs: number;
    message: string;
    statusCode?: number;
  }>>({});

  const [customModelInput, setCustomModelInput] = useState('');

  // Sincroniza estado inicial e carrega catálogo dinâmico
  useEffect(() => {
    const currentConfig = AiService.getConfig();
    setConfig(currentConfig);
    const cached = AiModelCatalogService.getCachedCatalog();
    setAvailableModels(cached);
  }, []);

  // Executa busca dinâmica de modelos no endpoint oficial / API serverless
  const handleDiscoverModels = async (force: boolean = true) => {
    setIsDiscovering(true);
    setDiscoveryStatusMsg('');
    setDiscoveryErrorMsg('');

    try {
      const result = await AiModelCatalogService.fetchCatalog(force);
      setAvailableModels(result.models);

      const updatedConfig: AiProviderConfig = {
        ...config,
        lastDiscoveredAt: result.lastUpdated,
        discoveredModels: result.models
      };
      setConfig(updatedConfig);
      AiService.saveConfig(updatedConfig);

      setDiscoveryStatusMsg(
        `Catálogo atualizado com sucesso! ${result.models.length} modelos identificados via ${
          result.source === 'live_fetch' || result.source === 'serverless_api' ? 'OpenCode Oficial' : 'Cache Resiliente'
        }.`
      );
      setTimeout(() => setDiscoveryStatusMsg(''), 5000);
    } catch (err: any) {
      setDiscoveryErrorMsg(`Não foi possível sincronizar o catálogo: ${err.message || 'Erro de conexão'}`);
      setTimeout(() => setDiscoveryErrorMsg(''), 6000);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSave = () => {
    AiService.saveConfig(config);
    setSaveSuccessMsg('Configurações da IA salvas com sucesso!');
    setTimeout(() => setSaveSuccessMsg(''), 4000);
  };

  // Move modelo para cima ou para baixo na cadeia
  const handleMoveModel = (index: number, direction: 'UP' | 'DOWN') => {
    const allModels = [config.primaryModel, ...config.fallbackModels];
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= allModels.length) return;

    const updated = [...allModels];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const newCfg = {
      ...config,
      primaryModel: updated[0],
      fallbackModels: updated.slice(1)
    };
    setConfig(newCfg);
    AiService.saveConfig(newCfg);
  };

  // Remove modelo da cadeia
  const handleRemoveModel = (modelIdToRemove: string) => {
    const allModels = [config.primaryModel, ...config.fallbackModels];
    if (allModels.length <= 1) {
      alert('A cadeia de contingência deve possuir ao menos 1 modelo.');
      return;
    }

    const filtered = allModels.filter(m => m !== modelIdToRemove);
    const newCfg = {
      ...config,
      primaryModel: filtered[0],
      fallbackModels: filtered.slice(1)
    };
    setConfig(newCfg);
    AiService.saveConfig(newCfg);
  };

  // Define modelo como primário diretamente
  const handleSetPrimary = (modelId: string) => {
    const existingFallbacks = config.fallbackModels.filter(m => m !== modelId);
    const newFallbacks = config.primaryModel && config.primaryModel !== modelId 
      ? [config.primaryModel, ...existingFallbacks] 
      : existingFallbacks;

    const newCfg = {
      ...config,
      primaryModel: modelId,
      fallbackModels: newFallbacks
    };
    setConfig(newCfg);
    AiService.saveConfig(newCfg);
  };

  // Adiciona modelo à cadeia de contingência
  const handleAddModel = (modelIdToAdd: string) => {
    const allModels = [config.primaryModel, ...config.fallbackModels];
    if (allModels.includes(modelIdToAdd)) return;

    const newCfg = {
      ...config,
      fallbackModels: [...config.fallbackModels, modelIdToAdd]
    };
    setConfig(newCfg);
    AiService.saveConfig(newCfg);
  };

  // Adiciona modelo customizado digitado
  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customModelInput.trim();
    if (!clean) return;
    handleAddModel(clean);
    setCustomModelInput('');
  };

  // Testa conexão com um modelo específico
  const handleTestConnection = async (modelId: string) => {
    setTestingModelId(modelId);
    try {
      const res = await AiService.testModelConnection(modelId, config.apiKey, config.endpointUrl);
      setTestResults(prev => ({ ...prev, [modelId]: res }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [modelId]: { success: false, latencyMs: 0, message: err.message || 'Erro inesperado' }
      }));
    } finally {
      setTestingModelId(null);
    }
  };

  // Testa todos os modelos da cadeia sequencialmente
  const handleTestAllModels = async () => {
    const chain = [config.primaryModel, ...config.fallbackModels];
    for (const model of chain) {
      await handleTestConnection(model);
    }
  };

  const chainList = [config.primaryModel, ...config.fallbackModels];

  // Provedores únicos para tabs de filtro
  const providerList = useMemo(() => {
    return AiModelCatalogService.getProviders(availableModels);
  }, [availableModels]);

  // Modelos filtrados para o explorador
  const filteredCatalog = useMemo(() => {
    return AiModelCatalogService.filterModels(availableModels, {
      provider: selectedProvider,
      category: selectedCategory,
      search: searchQuery,
      excludeDevAgents: !showDevAgents
    });
  }, [availableModels, selectedProvider, selectedCategory, searchQuery, showDevAgents]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in">
      
      {/* Header com identidade executiva */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#131316] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-500 shadow-xs">
            <Bot className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                Inteligência Artificial & Conector OpenCode
              </h1>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30">
                Catálogo Dinâmico & Failover Ativo
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Catálogo sincronizado com a OpenCode. Configure o modelo principal e a cadeia de contingência para garantir continuidade ininterrupta.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleDiscoverModels(true)}
            disabled={isDiscovering}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="Consultar catálogo oficial da OpenCode"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isDiscovering ? 'animate-spin' : ''}`} />
            <span>{isDiscovering ? 'Sincronizando...' : 'Atualizar Modelos'}</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Salvar Configurações</span>
          </button>
        </div>
      </div>

      {/* Alertas de Notificação */}
      {saveSuccessMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center text-xs text-emerald-800 dark:text-emerald-300 font-semibold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {discoveryStatusMsg && (
        <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center text-xs text-blue-800 dark:text-blue-300 font-semibold animate-in fade-in">
          <CheckCheck className="w-4 h-4 mr-2 text-blue-600 shrink-0" />
          <span>{discoveryStatusMsg}</span>
        </div>
      )}

      {discoveryErrorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center text-xs text-rose-800 dark:text-rose-300 font-semibold animate-in fade-in">
          <AlertTriangle className="w-4 h-4 mr-2 text-rose-600 shrink-0" />
          <span>{discoveryErrorMsg}</span>
        </div>
      )}

      {/* Card 1: Credenciais e Conexão da OpenCode */}
      <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <Key className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Credenciais do Provedor de IA
            </h2>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {config.enabled ? 'Recursos de IA Habilitados' : 'Recursos de IA Desativados'}
            </span>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
            />
          </label>
        </div>

        {/* Presets Rápidos de Provedores */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-amber-500" />
            <span>Presets Rápidos de Provedores Compatíveis:</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {AI_PROVIDER_PRESETS.map((p) => {
              const isSelected = p.endpointUrl && config.endpointUrl && p.endpointUrl.replace(/\/+$/, '') === config.endpointUrl.replace(/\/+$/, '');
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (p.endpointUrl) {
                      setConfig(prev => ({ ...prev, endpointUrl: p.endpointUrl }));
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              API Key (Opcional se configurado OPENCODE_API_KEY no servidor):
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => {
                  const val = e.target.value;
                  const detected = detectProviderFromKey(val);
                  if (detected && detected.endpointUrl) {
                    setConfig(prev => ({ ...prev, apiKey: val, endpointUrl: detected.endpointUrl }));
                  } else {
                    setConfig(prev => ({ ...prev, apiKey: val }));
                  }
                }}
                placeholder="Ex: opencode_sk_live_..., sk-or-..., AIzaSy... ou gsk_..."
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                title={showApiKey ? 'Ocultar chave' : 'Exibir chave'}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
              🛡️ A chave informada aqui tem prioridade absoluta sobre variáveis de ambiente do servidor.
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Endpoint da API:
              </label>
              <button
                type="button"
                onClick={() => setConfig({ ...config, endpointUrl: 'https://opencode.ai/zen/go/v1' })}
                className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer font-semibold"
              >
                Restaurar OpenCode Go
              </button>
            </div>
            <input
              type="text"
              value={config.endpointUrl}
              onChange={(e) => setConfig({ ...config, endpointUrl: e.target.value })}
              placeholder="https://opencode.ai/zen/go/v1"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block">
              Compatível com Chat Completions, OpenRouter, OpenAI, Gemini e Groq.
            </span>
          </div>
        </div>
      </div>

      {/* Card 2: Cadeia de Modelos & Contingência Ativa (Failover Engine) */}
      <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>Cadeia de Contingência Ativa (Ordem de Execução)</span>
                <span className="text-[11px] font-normal text-slate-500">
                  ({chainList.length} {chainList.length === 1 ? 'modelo' : 'modelos'})
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                O gateway tentará o modelo primário. Em caso de indisponibilidade ou rate limit (429), comuta automaticamente para os modelos subsequentes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestAllModels}
            disabled={Boolean(testingModelId)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 hover:bg-purple-100 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Zap className="w-3.5 h-3.5 text-purple-500" />
            <span>Testar Toda a Cadeia</span>
          </button>
        </div>

        {/* Lista Ordenada de Modelos da Cadeia Atual */}
        <div className="space-y-2.5">
          {chainList.map((modelId, index) => {
            const isPrimary = index === 0;
            const meta = availableModels.find(m => m.id === modelId);
            const testResult = testResults[modelId];
            const isTesting = testingModelId === modelId;

            return (
              <div 
                key={modelId}
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                  isPrimary
                    ? 'border-amber-500/50 bg-amber-50/25 dark:bg-amber-950/20 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#1b1b20]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    isPrimary
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    {index + 1}º
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {meta?.name || modelId}
                      </span>
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        {modelId}
                      </span>
                      {meta?.provider && (
                        <span className="text-[10px] font-semibold px-2 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {AiModelCatalogService.formatProviderName(meta.provider)}
                        </span>
                      )}
                      {isPrimary ? (
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-amber-500 text-slate-950 shadow-2xs flex items-center gap-1">
                          ⭐ Modelo Primário
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                          Contingência #{index}
                        </span>
                      )}
                    </div>
                    {meta?.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {meta.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status do Teste & Controles de Reordenação */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {testResult && (
                    <div className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                      testResult.success
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                    }`}>
                      {testResult.success ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Ativo ({testResult.latencyMs}ms)</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          <span title={testResult.message}>Falhou</span>
                        </>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleTestConnection(modelId)}
                    disabled={isTesting}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50"
                    title={`Testar conectividade com ${modelId}`}
                  >
                    {isTesting ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMoveModel(index, 'UP')}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Aumentar prioridade"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMoveModel(index, 'DOWN')}
                    disabled={index === chainList.length - 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Diminuir prioridade"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemoveModel(modelId)}
                    disabled={chainList.length <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remover modelo da cadeia"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Input para modelo customizado manual */}
        <form onSubmit={handleAddCustomModel} className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
          <input
            type="text"
            value={customModelInput}
            onChange={(e) => setCustomModelInput(e.target.value)}
            placeholder="Ou digite manualmente um identificador específico (ex: mistral-large, custom-fin-model)"
            className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] text-xs font-mono text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!customModelInput.trim()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 text-white cursor-pointer disabled:opacity-40"
          >
            Adicionar à Cadeia
          </button>
        </form>
      </div>

      {/* Card 3: Explorador do Catálogo Dinâmico de Modelos (OpenCode Discovery Hub) */}
      <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Catálogo Dinâmico da OpenCode ({availableModels.length} modelos descobertos)
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Última sincronização:{' '}
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                {config.lastDiscoveredAt ? new Date(config.lastDiscoveredAt).toLocaleString('pt-BR') : 'Padrão Inicial'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <Code className="w-3.5 h-3.5 text-slate-500" />
              <span>Exibir Dev Agents</span>
              <input
                type="checkbox"
                checked={showDevAgents}
                onChange={(e) => setShowDevAgents(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer ml-1"
              />
            </label>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar por nome, identificador ou capacidade (ex: deepseek, luna, flash, raciocínio)..."
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <PremiumSelect
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todas as Categorias</option>
              <option value="financeiro">💰 Financeiro & Conciliação</option>
              <option value="raciocinio">🧠 Raciocínio & Balanço</option>
              <option value="rapido">⚡ Flash / Ultra-Rápido</option>
              <option value="codigo">🛠️ Dev Agents & Automação</option>
            </PremiumSelect>
          </div>

          {/* Filtros em formato de Chips por Provedor */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedProvider('ALL')}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold tracking-tight transition-all shrink-0 cursor-pointer ${
                selectedProvider === 'ALL'
                  ? 'bg-amber-500 text-slate-950 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              Todos ({availableModels.length})
            </button>
            {providerList.map(prov => {
              const count = availableModels.filter(m => m.provider === prov).length;
              const isSelected = selectedProvider === prov;
              return (
                <button
                  key={prov}
                  type="button"
                  onClick={() => setSelectedProvider(prov)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold tracking-tight transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  {AiModelCatalogService.formatProviderName(prov)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid de Modelos Encontrados */}
        {filteredCatalog.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-500">
            Nenhum modelo corresponde aos filtros selecionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCatalog.map(model => {
              const isPrimary = config.primaryModel === model.id;
              const isInChain = chainList.includes(model.id);
              const testResult = testResults[model.id];
              const isTesting = testingModelId === model.id;

              return (
                <div 
                  key={model.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    isPrimary 
                      ? 'bg-amber-50/30 dark:bg-amber-950/20 border-amber-500/50 shadow-xs'
                      : isInChain
                      ? 'bg-blue-50/20 dark:bg-blue-950/15 border-blue-400/40'
                      : model.isDevAgentOnly
                      ? 'bg-slate-100/40 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-80'
                      : 'bg-slate-50/50 dark:bg-[#1b1b20] border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {model.name}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-500 block truncate">
                          {model.id}
                        </span>
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {model.provider}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed mb-3 line-clamp-2">
                      {model.description}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {AiModelCatalogService.formatCategoryName(model.category)}
                      </span>
                      {model.isDevAgentOnly ? (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-700 dark:text-purple-300">
                          🛠️ Dev Subagent
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          ✓ App Financeiro
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Ações Rápidas do Modelo */}
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handleTestConnection(model.id)}
                      disabled={isTesting}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer disabled:opacity-50 shrink-0"
                      title="Testar conectividade individual"
                    >
                      {isTesting ? (
                        <RotateCcw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      ) : (
                        <Play className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <div className="flex items-center gap-1.5 ml-auto">
                      {isPrimary ? (
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 px-2 py-1">
                          ⭐ Primário Ativo
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSetPrimary(model.id)}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-lg border border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                          >
                            Tornar Primário
                          </button>

                          {!isInChain ? (
                            <button
                              type="button"
                              onClick={() => handleAddModel(model.id)}
                              className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer flex items-center gap-1"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Contingência</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRemoveModel(model.id)}
                              className="px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-rose-500 cursor-pointer"
                              title="Remover da contingência"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Card 4: Auditoria do Último Evento de Failover */}
      {config.lastFailoverEvent && (
        <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-300/60 dark:border-amber-800/60 p-5 shadow-2xs space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold text-xs">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>Última Contingência Automática Executada com Sucesso</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
              <span className="text-[10px] text-slate-500 block">Horário</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                {new Date(config.lastFailoverEvent.timestamp).toLocaleTimeString('pt-BR')}
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
              <span className="text-[10px] text-slate-500 block">Modelo Indisponível</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                {config.lastFailoverEvent.fromModel}
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
              <span className="text-[10px] text-slate-500 block">Modelo que Assumiu</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {config.lastFailoverEvent.toModel}
              </span>
            </div>
            <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-200 dark:border-amber-900">
              <span className="text-[10px] text-slate-500 block">Motivo / Recurso</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block" title={config.lastFailoverEvent.reason}>
                {config.lastFailoverEvent.feature} ({config.lastFailoverEvent.reason})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Card 5: Casos de Uso e Recursos de Produtividade */}
      <div className="bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800/80 pb-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Recursos Inteligentes de Produtividade no Sistema
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#131316] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Conciliação Bancária</span>
              </div>
              <input
                type="checkbox"
                checked={config.enableAutoReconciliation}
                onChange={(e) => setConfig({ ...config, enableAutoReconciliation: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Decodifica MEMOs criptográficos de extratos bancários e sugere a categoria da DRE e favorecido com 1 clique.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#131316] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Briefing Diário</span>
              </div>
              <input
                type="checkbox"
                checked={config.enableDailyBriefing}
                onChange={(e) => setConfig({ ...config, enableDailyBriefing: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Gera resumo executivo matinal no Dashboard com saldo projetado, compromissos prioritários e metas de liquidez.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#131316] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Antifraude & Auditoria</span>
              </div>
              <input
                type="checkbox"
                checked={config.enableAnomalyDetection}
                onChange={(e) => setConfig({ ...config, enableAnomalyDetection: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Detecta potenciais pagamentos duplicados de fornecedores e divergências entre extratos bancários e ERP.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};
