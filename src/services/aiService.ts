import { 
  AiProviderConfig, 
  AiChatMessage, 
  AiExecutionResult, 
  AiExecutionAttempt, 
  AiModelChainItem,
  AiReconciliationSuggestion,
  BankStatementEntry,
  FinancialTitle,
  ChartAccount,
  Counterparty,
  AgentRoleType
} from '../types';
import { storage } from './storageService';
import { AiModelCatalogService, DEFAULT_DYNAMIC_CATALOG } from './aiModelCatalogService';

export const KNOWN_OPENCODE_MODELS: AiModelChainItem[] = DEFAULT_DYNAMIC_CATALOG;

export class AiService {
  /**
   * Obtém a configuração salva ou padrão
   */
  public static getConfig(): AiProviderConfig {
    return storage.getAiConfig();
  }

  /**
   * Salva as configurações de IA e credenciais da OpenCode
   */
  public static saveConfig(config: AiProviderConfig): void {
    storage.saveAiConfig(config);
  }

  /**
   * Testa a conectividade direta com um modelo específico da OpenCode
   */
  public static async testModelConnection(
    modelId: string, 
    customApiKey?: string, 
    customEndpoint?: string
  ): Promise<{ success: boolean; latencyMs: number; message: string; statusCode?: number }> {
    const config = this.getConfig();
    const rawKey = customApiKey !== undefined ? customApiKey : config.apiKey;
    const apiKey = typeof rawKey === 'string' ? rawKey.trim() : rawKey;
    let endpoint = (customEndpoint || config.endpointUrl || 'https://opencode.ai/zen/go/v1').trim().replace(/\/+$/, '');

    if (!apiKey) {
      return { 
        success: false, 
        latencyMs: 0, 
        message: 'Chave de API não informada. Por favor, insira sua chave OpenCode Go nas Configurações de IA.' 
      };
    }

    // Comunicação segura via Serverless Gateway (evita bloqueio de CORS do navegador)
    const startTime = Date.now();
    try {
      const serverlessRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentRole: 'CFO_EXECUTIVO',
          action: 'ping_test',
          messages: [{ role: 'user', content: 'Ping' }],
          preferredModel: modelId,
          fallbackModels: [],
          customApiKey: apiKey,
          customEndpoint: endpoint,
          temperature: 0.1,
          maxTokens: 5
        })
      });

      const latencyMs = Date.now() - startTime;
      let data: any = {};
      try {
        data = await serverlessRes.json();
      } catch {
        data = {};
      }

      if (serverlessRes.ok && data.success) {
        return {
          success: true,
          latencyMs,
          statusCode: 200,
          message: `Conexão bem-sucedida com ${data.modelUsed || modelId} (${latencyMs}ms)`
        };
      } else {
        const errorMsg = data.error || (data.attempts?.[0]?.errorMessage) || `Erro HTTP ${serverlessRes.status}: Falha ao autenticar com o modelo ${modelId}.`;
        return {
          success: false,
          latencyMs,
          statusCode: serverlessRes.status,
          message: errorMsg
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        latencyMs,
        message: `Servidor local da API não respondeu: ${err.message || 'Sem conexão com /api/agents'}. Verifique se a aplicação está em execução.`
      };
    }
  }

  /**
   * Executa um teste rápido de prompt com uma IA específica ou com a cadeia configurada
   */
  public static async testPrompt(
    promptText: string,
    specificModel?: string
  ): Promise<{
    success: boolean;
    content: string;
    modelUsed: string;
    latencyMs: number;
    error?: string;
  }> {
    const config = this.getConfig();
    if (!config.apiKey) {
      return {
        success: false,
        content: '',
        modelUsed: 'NONE',
        latencyMs: 0,
        error: 'Chave da API do OpenCode Go não configurada. Por favor, insira sua chave no campo acima.'
      };
    }

    const messages = [
      {
        role: 'system' as const,
        content: 'Você é o consultor de inteligência artificial financeira do ERP Contaju. Responda de forma clara, profissional, prática e concisa em português do Brasil.'
      },
      {
        role: 'user' as const,
        content: promptText
      }
    ];

    const res = await this.executeWithFailover(messages, {
      preferredModel: specificModel,
      featureName: 'Playground de Teste de IA',
      maxTokens: 600,
      temperature: 0.3
    });

    return {
      success: res.success,
      content: res.content,
      modelUsed: res.modelUsed,
      latencyMs: res.totalDurationMs,
      error: res.success ? undefined : (res.attempts[res.attempts.length - 1]?.errorMessage || 'Falha ao executar teste.')
    };
  }

  /**
   * Executa teste no modo Sandbox com System Prompt, Modelo e Pergunta customizados
   * com diagnóstico inteligente de erros (Opção 1)
   */
  public static async testAgentCustomSandbox(options: {
    systemPrompt: string;
    userPrompt: string;
    model: string;
    agentRole?: AgentRoleType;
    allowedTools?: string[];
    temperature?: number;
    customApiKey?: string;
    customEndpoint?: string;
  }): Promise<{
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
  }> {
    const config = this.getConfig();
    const apiKey = (options.customApiKey !== undefined ? options.customApiKey.trim() : config.apiKey?.trim()) || '';

    if (!apiKey) {
      return {
        success: false,
        content: '',
        modelUsed: options.model,
        latencyMs: 0,
        error: 'Chave de API não configurada.',
        errorDiagnostic: {
          code: 'AUTH_MISSING_KEY',
          title: 'Chave de API Ausente',
          suggestion: 'Insira sua chave de API na aba "Catálogo de Modelos & Conexão" para autorizar requisições aos modelos de IA.'
        }
      };
    }

    if (!options.userPrompt.trim()) {
      return {
        success: false,
        content: '',
        modelUsed: options.model,
        latencyMs: 0,
        error: 'Pergunta do teste não pode ficar em branco.',
        errorDiagnostic: {
          code: 'PROMPT_EMPTY',
          title: 'Pergunta em Branco',
          suggestion: 'Digite uma pergunta ou selecione um dos exemplos rápidos para testar a resposta do agente.'
        }
      };
    }

    let contextualSystem = options.systemPrompt.trim();
    if (options.allowedTools && options.allowedTools.length > 0) {
      contextualSystem += `\n\n[CAPACIDADES AUTORIZADAS NO ERP]: ${options.allowedTools.join(', ')}. Respeite estritamente esses limites operacionais e contábeis.`;
    }

    const messages: AiChatMessage[] = [
      { role: 'system', content: contextualSystem },
      { role: 'user', content: options.userPrompt.trim() }
    ];

    const startTime = Date.now();
    const res = await this.executeWithFailover(messages, {
      preferredModel: options.model,
      featureName: `Sandbox: ${options.agentRole || 'Agente Customizado'}`,
      agentRole: options.agentRole || 'CFO_EXECUTIVO',
      temperature: options.temperature ?? 0.3,
      maxTokens: 1000,
      customApiKey: apiKey,
      customEndpoint: options.customEndpoint || config.endpointUrl
    });
    const latencyMs = Date.now() - startTime;

    if (!res.success) {
      const rawError = res.attempts[res.attempts.length - 1]?.errorMessage || 'Erro inesperado na chamada da IA.';
      const lowerErr = rawError.toLowerCase();
      let diag = {
        code: 'EXECUTION_FAILED',
        title: 'Falha na Execução do Modelo',
        suggestion: 'Verifique se o modelo selecionado está disponível no seu plano ou tente selecionar outro modelo como DeepSeek ou Claude.'
      };

      if (lowerErr.includes('expired') || lowerErr.includes('key has expired')) {
        diag = {
          code: 'API_KEY_EXPIRED',
          title: 'Chave de API Expirada no Provedor',
          suggestion: 'A OpenCode ou seu provedor invalidou esta chave por segurança. Acesse console.opencode.ai, gere uma nova chave de API e atualize-a no sistema.'
        };
      } else if (rawError.includes('429') || lowerErr.includes('rate limit')) {
        diag = {
          code: 'RATE_LIMIT',
          title: 'Limite de Requisições Atingido (Rate Limit - HTTP 429)',
          suggestion: 'O provedor deste modelo está momentaneamente saturado. Ative a cadeia de contingência ou selecione outro modelo.'
        };
      } else if (rawError.includes('401') || lowerErr.includes('unauthorized') || lowerErr.includes('invalid key')) {
        diag = {
          code: 'UNAUTHORIZED',
          title: 'Chave Inválida (HTTP 401)',
          suggestion: 'A chave de API informada não foi aceita pelo provedor. Verifique se a chave foi copiada integralmente sem espaços extras.'
        };
      } else if (rawError.includes('404') || lowerErr.includes('model not found')) {
        diag = {
          code: 'MODEL_NOT_FOUND',
          title: 'Modelo Não Encontrado (HTTP 404)',
          suggestion: 'Este modelo específico não está liberado para a sua conta ou chave. Escolha outro modelo no catálogo disponível.'
        };
      } else if (lowerErr.includes('conexão') || lowerErr.includes('fetch')) {
        diag = {
          code: 'NETWORK_GATEWAY',
          title: 'Falha de Conexão com o Gateway',
          suggestion: 'Não foi possível alcançar o servidor da API. Verifique sua conexão com a internet ou o status do gateway.'
        };
      }

      return {
        success: false,
        content: '',
        modelUsed: res.modelUsed,
        latencyMs,
        error: rawError,
        errorDiagnostic: diag
      };
    }

    return {
      success: true,
      content: res.content,
      modelUsed: res.modelUsed,
      latencyMs: res.totalDurationMs || latencyMs
    };
  }

  /**
   * Executa uma requisição de IA com Failover Automático em Cascata
   * Se o modelo primário falhar (HTTP 429 rate limit, 500, timeout, etc.), tenta o secundário, e assim sucessivamente
   */
  public static async executeWithFailover(
    messages: AiChatMessage[],
    options: {
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
      featureName?: string;
      agentRole?: AgentRoleType;
      preferredModel?: string;
      customApiKey?: string;
      customEndpoint?: string;
    } = {}
  ): Promise<AiExecutionResult> {
    const config = this.getConfig();
    const startTimeTotal = Date.now();
    const role: AgentRoleType = options.agentRole || 'CFO_EXECUTIVO';

    const apiKey = (options.customApiKey !== undefined ? options.customApiKey.trim() : config.apiKey?.trim()) || '';
    if (!apiKey) {
      return {
        success: false,
        content: '',
        modelUsed: 'NONE',
        failoverOccurred: false,
        attempts: [{
          model: 'NONE',
          durationMs: 0,
          success: false,
          errorMessage: 'Chave de API não informada. Por favor, insira sua chave nas Configurações de IA.'
        }],
        totalDurationMs: 0
      };
    }

    // 1. Executa via Serverless Gateway (/api/agents) com failover inteligente
    try {
      const serverlessRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentRole: role,
          action: options.featureName || 'general_query',
          messages,
          temperature: options.temperature ?? config.temperature ?? 0.2,
          maxTokens: options.maxTokens ?? config.maxTokens ?? 2000,
          jsonMode: options.jsonMode,
          preferredModel: options.preferredModel || config.primaryModel,
          fallbackModels: config.fallbackModels || [],
          customApiKey: apiKey,
          customEndpoint: options.customEndpoint || config.endpointUrl || undefined
        })
      });

      const duration = Date.now() - startTimeTotal;
      let data: any = {};
      try {
        data = await serverlessRes.json();
      } catch {
        data = {};
      }

      if (serverlessRes.ok && data.success) {
        // Registra a execução no histórico auditável da Central de Agentes
        storage.addAgentRun({
          id: `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          agentRole: role,
          taskType: options.featureName || 'Consulta IA',
          requestedBy: storage.getCurrentUser().name,
          companyId: 'comp-1',
          startedAt: new Date(startTimeTotal).toISOString(),
          completedAt: new Date().toISOString(),
          status: 'SUCESSO',
          modelUsed: data.modelUsed || config.primaryModel,
          latencyMs: duration,
          failoverOccurred: Boolean(data.failoverOccurred),
          inputSummary: messages[messages.length - 1]?.content?.substring(0, 100) || '',
          outputSummary: data.content?.substring(0, 150) || ''
        });

        return {
          success: true,
          content: data.content,
          modelUsed: data.modelUsed,
          failoverOccurred: Boolean(data.failoverOccurred),
          attempts: data.attempts || [{ model: data.modelUsed, durationMs: duration, success: true, statusCode: 200 }],
          totalDurationMs: duration,
          parsedJson: data.parsedJson
        };
      } else {
        const errorMsg = data.error || (data.attempts?.[data.attempts.length - 1]?.errorMessage) || `Erro HTTP ${serverlessRes.status}`;
        
        storage.addAgentRun({
          id: `run-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          agentRole: role,
          taskType: options.featureName || 'Consulta IA',
          requestedBy: storage.getCurrentUser().name,
          companyId: 'comp-1',
          startedAt: new Date(startTimeTotal).toISOString(),
          completedAt: new Date().toISOString(),
          status: 'FALHA',
          modelUsed: data.modelUsed || config.primaryModel || 'NONE',
          latencyMs: duration,
          failoverOccurred: Boolean(data.failoverOccurred),
          inputSummary: messages[messages.length - 1]?.content?.substring(0, 100) || '',
          outputSummary: errorMsg.substring(0, 150)
        });

        return {
          success: false,
          content: '',
          modelUsed: data.modelUsed || 'FAILOVER_EXHAUSTED',
          failoverOccurred: Boolean(data.failoverOccurred),
          attempts: data.attempts || [{
            model: options.preferredModel || config.primaryModel || 'NONE',
            durationMs: duration,
            success: false,
            statusCode: serverlessRes.status,
            errorMessage: errorMsg
          }],
          totalDurationMs: duration
        };
      }
    } catch (err: any) {
      const duration = Date.now() - startTimeTotal;
      return {
        success: false,
        content: '',
        modelUsed: 'GATEWAY_ERROR',
        failoverOccurred: false,
        attempts: [{
          model: 'GATEWAY_ERROR',
          durationMs: duration,
          success: false,
          errorMessage: `Falha de conexão com a API de Agentes: ${err.message || 'Servidor indisponível'}. Certifique-se de que a aplicação está em execução.`
        }],
        totalDurationMs: duration
      };
    }
  }

  /**
   * Assistente IA de Conciliação Bancária: Analisa uma transação do extrato e recomenda o matching contábil ideal
   */
  public static async analyzeReconciliationTransaction(
    statement: BankStatementEntry,
    candidateTitles: FinancialTitle[],
    chartAccounts: ChartAccount[],
    counterparties?: Counterparty[]
  ): Promise<AiReconciliationSuggestion & { success: boolean; error?: string }> {
    const parties = counterparties && counterparties.length > 0 ? counterparties : storage.getPersons();

    const prompt = `Você é o auditor e assistente contábil do sistema ERP financeiro Contaju.
Analise a seguinte transação bancária e recomende a conciliação exata com os lançamentos do sistema.

TRANSAÇÃO DO EXTRATO BANCÁRIO:
- Data: ${statement.date}
- Valor: R$ ${statement.amount.toFixed(2)} (${statement.amount < 0 ? 'DÉBITO / SAÍDA' : 'CRÉDITO / ENTRADA'})
- Descrição no Banco: "${statement.description}"
- Código FITID: ${statement.fitId}

TÍTULOS CANDIDATOS NO SISTEMA (Contas a Pagar/Receber):
${candidateTitles.slice(0, 15).map(t => {
  const party = parties.find(c => c.id === t.counterpartyId);
  return `- ID: ${t.id} | Tipo: ${t.type} | Nº: ${t.titleNumber} | Valor: R$ ${(t.balancePrincipal || t.originalAmount).toFixed(2)} | Venc: ${t.dueDate} | Desc: "${t.description}" | Cliente/Forn: "${party?.name || 'Não inf.'}"`;
}).join('\n')}

CATEGORIAS DO PLANO DE CONTAS (DRE):
${chartAccounts.slice(0, 25).map(a => `- ID: ${a.id} | Código: ${a.code} | Nome: ${a.name}`).join('\n')}

INSTRUÇÃO:
Responda ESTRITAMENTE em formato JSON com o seguinte schema:
{
  "statementId": "${statement.id}",
  "suggestedTitleId": "id-do-titulo-se-houver-correspondencia-ou-null",
  "suggestedAccountCategory": "id-da-categoria-contabil-mais-provavel",
  "suggestedCategory": "Nome da Categoria Contábil Sugerida",
  "suggestedCounterpartyName": "nome-do-cliente-ou-fornecedor-inferido",
  "confidenceScore": 85, // número de 0 a 100
  "action": "CONCILIAR_EXISTENTE", // "CONCILIAR_EXISTENTE" | "CRIAR_NOVO_TITULO" | "IGNORAR_TARIFA"
  "reasoning": "Justificativa clara e profissional da escolha contábil",
  "isNewTitleRecommended": false, // true se não encontrou título existente e recomenda criar novo lançamento
  "suggestedDescription": "Descrição limpa e padronizada sugerida para o título"
}`;

    const auditorAgent = storage.getAgentDefinitions().find(a => a.role === 'AUDITOR_CONCILIACAO');
    const systemPrompt = auditorAgent?.systemPrompt || 'Você é um perito contábil e financeiro de conciliação. Responda estritamente em JSON válido.';
    const modelToUse = auditorAgent?.defaultModel;

    const res = await this.executeWithFailover([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.1,
      jsonMode: true,
      featureName: 'Conciliação Bancária',
      agentRole: 'AUDITOR_CONCILIACAO',
      preferredModel: modelToUse
    });

    if (res.success && res.parsedJson) {
      const conf = Number(res.parsedJson.confidenceScore) || 75;
      const act = res.parsedJson.action || (res.parsedJson.suggestedTitleId ? 'CONCILIAR_EXISTENTE' : 'CRIAR_NOVO_TITULO');

      return {
        statementId: statement.id,
        suggestedTitleId: res.parsedJson.suggestedTitleId || undefined,
        suggestedAccountCategory: res.parsedJson.suggestedAccountCategory || undefined,
        suggestedCategory: res.parsedJson.suggestedCategory || res.parsedJson.suggestedAccountCategory || undefined,
        suggestedCounterpartyName: res.parsedJson.suggestedCounterpartyName || undefined,
        confidenceScore: conf,
        confidence: conf,
        reasoning: res.parsedJson.reasoning || `Sugerido via ${res.modelUsed}`,
        isNewTitleRecommended: Boolean(res.parsedJson.isNewTitleRecommended) || act === 'CRIAR_NOVO_TITULO',
        action: act,
        suggestedDescription: res.parsedJson.suggestedDescription || statement.description,
        modelUsed: res.modelUsed,
        attempts: res.attempts,
        hadFailover: res.failoverOccurred,
        success: true
      };
    }

    // Fallback heurístico inteligente se a IA estiver offline ou desabilitada
    return {
      statementId: statement.id,
      confidenceScore: 30,
      confidence: 30,
      reasoning: res.content ? `Não foi possível analisar detalhadamente: ${res.content}` : 'Análise preliminar (sem resposta da IA)',
      isNewTitleRecommended: true,
      action: 'CRIAR_NOVO_TITULO',
      suggestedDescription: statement.description,
      modelUsed: res.modelUsed,
      attempts: res.attempts,
      hadFailover: res.failoverOccurred,
      success: res.success,
      error: res.success ? undefined : 'Falha na comunicação com a API OpenCode'
    };
  }

  /**
   * Resumo Executivo Financeiro Diário para o Dashboard
   */
  public static async generateExecutiveBriefing(metrics: {
    totalReceivablesToday: number;
    totalPayablesToday: number;
    currentBankBalance: number;
    projectedCashFlow: number;
    delinquencyRate: number;
    overdueCount: number;
    companyName: string;
  }): Promise<{ briefingHtml: string; modelUsed: string; failoverOccurred: boolean }> {
    const prompt = `Gere um briefing executivo financeiro curto, elegante e direto ao ponto para a diretoria da empresa "${metrics.companyName}".

MÉTRICAS DO DIA:
- Saldo Bancário Consolidado: R$ ${metrics.currentBankBalance.toFixed(2)}
- A Receber Previsto Hoje: R$ ${metrics.totalReceivablesToday.toFixed(2)}
- A Pagar Previsto Hoje: R$ ${metrics.totalPayablesToday.toFixed(2)}
- Saldo Projetado de Caixa: R$ ${metrics.projectedCashFlow.toFixed(2)}
- Índice de Inadimplência: ${metrics.delinquencyRate.toFixed(2)}% (${metrics.overdueCount} títulos vencidos)

Estruture o texto em 3 parágrafos objetivos:
1. Panorama Geral de Liquidez e Caixa do Dia.
2. Ações Prioritárias Recomendadas (cobrança ou conciliação).
3. Conclusão estratégica para manter o fluxo positivo.
Destaque valores importantes em negrito.`;

    const cfoAgent = storage.getAgentDefinitions().find(a => a.role === 'CFO_EXECUTIVO');
    const systemPrompt = cfoAgent?.systemPrompt || 'Você é o CFO executivo da empresa. Escreva em português claro, profissional e inspirador.';
    const modelToUse = cfoAgent?.defaultModel;

    const res = await this.executeWithFailover([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ], {
      temperature: 0.3,
      featureName: 'Briefing Executivo',
      agentRole: 'CFO_EXECUTIVO',
      preferredModel: modelToUse
    });

    if (res.success) {
      return {
        briefingHtml: res.content,
        modelUsed: res.modelUsed,
        failoverOccurred: res.failoverOccurred
      };
    }

    return {
      briefingHtml: `Hoje a empresa possui saldo de R$ ${metrics.currentBankBalance.toFixed(2)}, com R$ ${metrics.totalReceivablesToday.toFixed(2)} previstos para recebimento e R$ ${metrics.totalPayablesToday.toFixed(2)} para quitação. Inadimplência em ${metrics.delinquencyRate.toFixed(1)}%.`,
      modelUsed: 'LOCAL_RULE',
      failoverOccurred: false
    };
  }
}
