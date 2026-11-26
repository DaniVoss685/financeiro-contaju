import { 
  BankStatementEntry, 
  FinancialTitle, 
  ReconciliationRule, 
  ReconciliationDiagnosticLog, 
  User, 
  Counterparty,
  ChartAccount
} from '../types';
import { storage } from './storageService';
import { FinancialEngine } from './financialEngine';
import { calculateReconciliationSimilarity, cleanBankDescription } from './reconciliationMatchingEngine';
import { normalizeForSearch } from '../utils/searchUtils';

/**
 * Verifica se uma transação do extrato bate com os critérios de uma regra de conciliação
 */
export function matchesReconciliationRule(stmt: BankStatementEntry, rule: ReconciliationRule): boolean {
  if (!rule.active) return false;

  // 1. Validação de Direção / Natureza (Débito/Crédito)
  const isDebit = stmt.amount < 0;
  if (rule.transactionType === 'DEBIT' && !isDebit) return false;
  if (rule.transactionType === 'CREDIT' && isDebit) return false;

  // 2. Validação do Padrão do Descritor Bancário
  const stmtDesc = normalizeForSearch(stmt.description);
  const pattern = normalizeForSearch(rule.pattern);

  if (!pattern) return false;

  switch (rule.matchType) {
    case 'STARTS_WITH':
      return stmtDesc.startsWith(pattern);
    case 'EQUALS':
      return stmtDesc === pattern;
    case 'REGEX':
      try {
        const regex = new RegExp(rule.pattern, 'i');
        return regex.test(stmt.description);
      } catch {
        return stmtDesc.includes(pattern);
      }
    case 'CONTAINS':
    default:
      return stmtDesc.includes(pattern);
  }
}

/**
 * Testa uma regra contra uma lista de transações de extrato (para feedback em tempo real na criação)
 */
export function testRuleAgainstStatements(
  rule: ReconciliationRule, 
  statements?: BankStatementEntry[]
): { matchingCount: number; matchedSamples: BankStatementEntry[] } {
  const pool = (statements && statements.length > 0) ? statements : storage.getStatementEntries();
  const matched = pool.filter(stmt => matchesReconciliationRule(stmt, rule));
  return {
    matchingCount: matched.length,
    matchedSamples: matched.slice(0, 5)
  };
}

/**
 * Executa a aplicação de regras ativas em lote para extratos pendentes de uma conta
 */
export function applyReconciliationRules(
  accountId?: string,
  currentUser?: User
): {
  processedCount: number;
  reconciledCount: number;
  suggestedCount: number;
  logs: ReconciliationDiagnosticLog[];
  appliedRuleNames: string[];
} {
  const effectiveUser = currentUser || storage.getCurrentUser();
  const rules = storage.getReconciliationRules().filter(r => r.active);
  // Ordena por prioridade crescente (1 primeiro, depois 2, etc.)
  rules.sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const allStatements = storage.getStatementEntries();
  const currentTitles = storage.getTitles();
  const counterparties = storage.getCounterparties();
  const chartAccounts = storage.getChartAccounts();

  const targetStatements = allStatements.filter(s => {
    if (s.reconciliationStatus !== 'PENDENTE') return false;
    if (accountId && accountId !== 'ALL' && s.bankAccountId !== accountId) return false;
    return true;
  });

  let reconciledCount = 0;
  let suggestedCount = 0;
  const appliedRulesSet = new Set<string>();
  const diagnosticLogs: ReconciliationDiagnosticLog[] = [];
  const updatedStatementsMap = new Map<string, BankStatementEntry>();

  const today = new Date().toISOString().split('T')[0];

  for (const stmt of targetStatements) {
    let matchedRule: ReconciliationRule | null = null;

    for (const rule of rules) {
      if (matchesReconciliationRule(stmt, rule)) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      appliedRulesSet.add(matchedRule.name);
      const isDebit = stmt.amount < 0;
      const targetType = isDebit ? 'PAGAR' : 'RECEBER';
      const absAmount = Math.abs(stmt.amount);

      if (matchedRule.action === 'AUTO_CREATE_AND_RECONCILE') {
        // 1. Gera título contábil no ERP
        const titleNumber = `REG-${isDebit ? 'PAG' : 'REC'}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
        const safeDueDate = stmt.date || today;

        const effectiveDescription = matchedRule.descriptionTemplate 
          ? matchedRule.descriptionTemplate.replace('{desc}', stmt.description)
          : `${matchedRule.name}: ${stmt.description}`;

        const newTitle: FinancialTitle = {
          id: `title-auto-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          companyId: 'comp-1',
          type: targetType,
          titleNumber,
          counterpartyId: matchedRule.counterpartyId || undefined,
          description: effectiveDescription,
          accountId: matchedRule.chartAccountId,
          launchDate: stmt.date || today,
          competence: (stmt.date || today).slice(0, 7),
          issueDate: stmt.date || today,
          dueDate: safeDueDate,
          expectedCashDate: safeDueDate,
          originalAmount: absAmount,
          settledPrincipal: 0,
          balancePrincipal: absAmount,
          accruedInterest: 0,
          accruedFine: 0,
          documentState: 'CONFIRMADO',
          settlementState: 'ABERTO',
          originType: 'MANUAL',
          reconciliationStatus: 'CONCILIADO',
          expectedBankAccountId: stmt.bankAccountId,
          notes: `Lançado automaticamente pela Regra de Conciliação "${matchedRule.name}"`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // 1. Persiste o título em aberto antes de chamar a baixa para que o motor encontre o registro
        const currentTitles = storage.getTitles();
        storage.saveTitles([newTitle, ...currentTitles]);

        // 2. Registra a baixa contábil imediata com validação de período contábil
        const safeSettlementDate = (stmt.date && stmt.date <= today) ? stmt.date : today;
        const settlementRes = FinancialEngine.postSettlement({
          titleId: newTitle.id,
          settlementDate: safeSettlementDate,
          bankAccountId: stmt.bankAccountId,
          principalSettled: absAmount,
          discount: 0,
          interest: 0,
          fine: 0,
          bankFee: 0,
          notes: `Baixa via Regra de Conciliação "${matchedRule.name}" (${stmt.description})`,
          voucherRef: stmt.fitId
        });

        if (settlementRes.success) {
          // 3. Atualiza o extrato apenas se a baixa contábil foi confirmada
          updatedStatementsMap.set(stmt.id, {
            ...stmt,
            reconciliationStatus: 'CONCILIADO',
            matchedTitleId: newTitle.id,
            ruleApplied: `REGRA: ${matchedRule.name}`
          });

          reconciledCount++;

          diagnosticLogs.push({
            id: `diag-rule-${stmt.id}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            bankAccountId: stmt.bankAccountId,
            stmtId: stmt.id,
            fitId: stmt.fitId,
            date: stmt.date,
            amount: stmt.amount,
            description: stmt.description,
            status: 'REGRA_APLICADA',
            ruleAppliedName: matchedRule.name,
            toleranceThresholdUsed: 0,
            bestCandidateTitleId: newTitle.id,
            bestCandidateTitleNumber: newTitle.titleNumber,
            bestCandidateScore: 100,
            primaryReason: `Conciliado automaticamente pela Regra "${matchedRule.name}". Novo título ${titleNumber} gerado e liquidado com partida dobrada no ERP.`,
            detailedReasons: [
              `Descritor bancário atendeu ao padrão "${matchedRule.pattern}" (${matchedRule.matchType})`,
              `Natureza contábil compatível: ${targetType}`,
              `Conta contábil vinculada: ${chartAccounts.find(a => a.id === matchedRule?.chartAccountId)?.name || matchedRule.chartAccountId}`
            ],
            suggestedAction: 'JA_CONCILIADO'
          });
        } else {
          // Em caso de falha na baixa (ex: período contábil fechado), reverte o título em aberto e emite log
          const remainingTitles = storage.getTitles().filter(t => t.id !== newTitle.id);
          storage.saveTitles(remainingTitles);

          diagnosticLogs.push({
            id: `diag-rule-${stmt.id}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            bankAccountId: stmt.bankAccountId,
            stmtId: stmt.id,
            fitId: stmt.fitId,
            date: stmt.date,
            amount: stmt.amount,
            description: stmt.description,
            status: 'NAO_CONCILIADO',
            ruleAppliedName: matchedRule.name,
            toleranceThresholdUsed: 0,
            bestCandidateScore: 0,
            primaryReason: `Regra "${matchedRule.name}" não pôde ser liquidada: ${settlementRes.message}`,
            detailedReasons: [
              `Falha na liquidação contábil: ${settlementRes.message}`
            ],
            suggestedAction: 'CONCILIAR_MANUAL'
          });
        }
      } else {
        // Apenas sugerir
        updatedStatementsMap.set(stmt.id, {
          ...stmt,
          reconciliationStatus: 'SUGESTAO',
          ruleApplied: `REGRA_SUGESTAO: ${matchedRule.name}`
        });

        suggestedCount++;

        diagnosticLogs.push({
          id: `diag-rule-${stmt.id}-${Date.now()}`,
          timestamp: new Date().toISOString(),
          bankAccountId: stmt.bankAccountId,
          stmtId: stmt.id,
          fitId: stmt.fitId,
          date: stmt.date,
          amount: stmt.amount,
          description: stmt.description,
          status: 'SUGESTAO_ENCONTRADA',
          ruleAppliedName: matchedRule.name,
          toleranceThresholdUsed: 0,
          bestCandidateScore: 90,
          primaryReason: `Sugestão gerada pela Regra "${matchedRule.name}". Transação categorizada para revisão contábil.`,
          detailedReasons: [
            `Descritor bancário atendeu ao padrão "${matchedRule.pattern}"`,
            `Conta contábil sugerida: ${chartAccounts.find(a => a.id === matchedRule?.chartAccountId)?.name || matchedRule.chartAccountId}`
          ],
          suggestedAction: 'CONCILIAR_MANUAL'
        });
      }
    }
  }

  // Persiste extratos atualizados
  if (updatedStatementsMap.size > 0) {
    const updatedStmtsList = allStatements.map(s => {
      const match = updatedStatementsMap.get(s.id);
      return match || s;
    });
    storage.saveStatementEntries(updatedStmtsList);
  }

  // Adiciona ao log de auditoria geral
  if (reconciledCount > 0 || suggestedCount > 0) {
    storage.addAuditLog({
      userName: effectiveUser.name,
      userRole: effectiveUser.role,
      action: 'APLICACAO_REGRAS_CONCILIACAO',
      module: 'Conciliação Bancária',
      recordId: accountId || 'ALL',
      details: `Execução de Regras de Conciliação: ${reconciledCount} lançamentos conciliados e ${suggestedCount} sugestões aplicadas (${Array.from(appliedRulesSet).join(', ')}).`
    });
  }

  return {
    processedCount: targetStatements.length,
    reconciledCount,
    suggestedCount,
    logs: diagnosticLogs,
    appliedRuleNames: Array.from(appliedRulesSet)
  };
}

/**
 * Analisa e gera o diagnóstico detalhado para TODOS os extratos de uma conta bancária,
 * explicando com precisão por que cada transação conciliou ou por que NÃO conciliou.
 */
export function generateReconciliationDiagnostics(
  accountId?: string,
  toleranceThreshold: number = 75
): ReconciliationDiagnosticLog[] {
  const allStatements = storage.getStatementEntries().filter(s => {
    if (accountId && accountId !== 'ALL' && s.bankAccountId !== accountId) return false;
    return true;
  });
  const allTitles = storage.getTitles();
  const counterparties = storage.getCounterparties();
  const counterpartyMap = new Map(counterparties.map(c => [c.id, c]));
  const rules = storage.getReconciliationRules();

  const diagnosticList: ReconciliationDiagnosticLog[] = [];

  for (const stmt of allStatements) {
    const isDebit = stmt.amount < 0;
    const targetType = isDebit ? 'PAGAR' : 'RECEBER';
    const stmtAbsAmount = Math.abs(stmt.amount);

    // Caso 1: Já está conciliado
    if (stmt.reconciliationStatus === 'CONCILIADO') {
      const matchedTitle = allTitles.find(t => t.id === stmt.matchedTitleId);
      diagnosticList.push({
        id: `diag-conc-${stmt.id}`,
        timestamp: new Date().toISOString(),
        bankAccountId: stmt.bankAccountId,
        stmtId: stmt.id,
        fitId: stmt.fitId,
        date: stmt.date,
        amount: stmt.amount,
        description: stmt.description,
        status: 'CONCILIADO',
        toleranceThresholdUsed: toleranceThreshold,
        bestCandidateTitleId: matchedTitle?.id,
        bestCandidateTitleNumber: matchedTitle?.titleNumber,
        bestCandidateCounterpartyName: matchedTitle ? counterpartyMap.get(matchedTitle.counterpartyId)?.name : undefined,
        bestCandidateScore: 100,
        primaryReason: matchedTitle 
          ? `Lançamento já devidamente conciliado e auditado com o título ${matchedTitle.titleNumber} (${matchedTitle.description}).`
          : 'Lançamento marcado como conciliado no extrato.',
        detailedReasons: [
          'Vínculo contábil confirmado e gravado no extrato',
          stmt.ruleApplied ? `Regra de conciliação vinculada: ${stmt.ruleApplied}` : 'Conciliação manual/automática confirmada'
        ],
        suggestedAction: 'JA_CONCILIADO'
      });
      continue;
    }

    // Caso 2: Possui sugestão ativa
    if (stmt.reconciliationStatus === 'SUGESTAO' && stmt.suggestedTitleId) {
      const suggestedTitle = allTitles.find(t => t.id === stmt.suggestedTitleId);
      if (suggestedTitle) {
        const cp = counterpartyMap.get(suggestedTitle.counterpartyId);
        const match = calculateReconciliationSimilarity(stmt, suggestedTitle, cp);

        diagnosticList.push({
          id: `diag-sug-${stmt.id}`,
          timestamp: new Date().toISOString(),
          bankAccountId: stmt.bankAccountId,
          stmtId: stmt.id,
          fitId: stmt.fitId,
          date: stmt.date,
          amount: stmt.amount,
          description: stmt.description,
          status: 'SUGESTAO_ENCONTRADA',
          toleranceThresholdUsed: toleranceThreshold,
          bestCandidateTitleId: suggestedTitle.id,
          bestCandidateTitleNumber: suggestedTitle.titleNumber,
          bestCandidateCounterpartyName: cp?.name,
          bestCandidateScore: match.score,
          breakdown: match.breakdown,
          primaryReason: `Sugestão identificada com ${match.score}% de similaridade com o título ${suggestedTitle.titleNumber} (${cp?.name || suggestedTitle.description}).`,
          detailedReasons: [
            `Pontuação de Valor: ${match.breakdown.amountScore}/50 (${match.breakdown.amountSummary})`,
            `Pontuação de Data: ${match.breakdown.dateScore}/30 (${match.breakdown.dateSummary})`,
            `Pontuação de Descrição/Favorecido: ${match.breakdown.descriptionScore}/20 (${match.breakdown.descriptionSummary})`
          ],
          suggestedAction: 'CONCILIAR_MANUAL',
          actionNote: 'Pode ser conciliado em lote através do botão "Conciliar Sugestões em Lote".'
        });
        continue;
      }
    }

    // Caso 3: PENDENTE — Investigar a fundo por que não conciliou automaticamente
    const candidateTitles = allTitles.filter(t => t.type === targetType && t.settlementState !== 'LIQUIDADO');

    if (candidateTitles.length === 0) {
      // Não há títulos em aberto da natureza necessária
      diagnosticList.push({
        id: `diag-fail-no-titles-${stmt.id}`,
        timestamp: new Date().toISOString(),
        bankAccountId: stmt.bankAccountId,
        stmtId: stmt.id,
        fitId: stmt.fitId,
        date: stmt.date,
        amount: stmt.amount,
        description: stmt.description,
        status: 'NAO_CONCILIADO',
        toleranceThresholdUsed: toleranceThreshold,
        bestCandidateScore: 0,
        primaryReason: `Nenhum título em aberto a ${targetType === 'PAGAR' ? 'pagar' : 'receber'} foi localizado no ERP para conciliação.`,
        detailedReasons: [
          `A transação bancária é de ${isDebit ? 'DÉBITO (-)' : 'CRÉDITO (+)'}, exigindo título a ${targetType}`,
          `Não existem títulos em aberto com esta natureza cadastrados no ERP`,
          `Pode se tratar de despesa bancária avulsa, taxa ou recebimento não faturado previamente`
        ],
        suggestedAction: 'CRIAR_TITULO',
        actionNote: 'Clique em "Criar Novo Título" ou configure uma Regra de Conciliação Automática para categorizar este descritor automaticamente.'
      });
      continue;
    }

    // Avalia todos os candidatos para identificar o mais próximo e mapear as deficiências
    let bestCandidate: { title: FinancialTitle; score: number; breakdown: any; cp?: Counterparty } | null = null;

    for (const t of candidateTitles) {
      const cp = counterpartyMap.get(t.counterpartyId);
      const match = calculateReconciliationSimilarity(stmt, t, cp);
      if (!bestCandidate || match.score > bestCandidate.score) {
        bestCandidate = {
          title: t,
          score: match.score,
          breakdown: match.breakdown,
          cp
        };
      }
    }

    if (!bestCandidate || bestCandidate.score === 0) {
      diagnosticList.push({
        id: `diag-fail-zero-score-${stmt.id}`,
        timestamp: new Date().toISOString(),
        bankAccountId: stmt.bankAccountId,
        stmtId: stmt.id,
        fitId: stmt.fitId,
        date: stmt.date,
        amount: stmt.amount,
        description: stmt.description,
        status: 'NAO_CONCILIADO',
        toleranceThresholdUsed: toleranceThreshold,
        bestCandidateScore: 0,
        primaryReason: `Nenhum título do ERP apresentou similaridade mínima com o valor (R$ ${stmtAbsAmount.toFixed(2)}) e data deste extrato.`,
        detailedReasons: [
          `Total de ${candidateTitles.length} títulos a ${targetType} avaliados no ERP`,
          `Nenhum título apresentou valor compatível dentro das margens de tolerância aceitáveis`,
          `Descritor bancário "${stmt.description}" não possui palavras-chave correspondentes no ERP`
        ],
        suggestedAction: 'CRIAR_TITULO',
        actionNote: 'Recomendado cadastrar o lançamento contábil correspondente ou criar uma regra de De-Para.'
      });
    } else {
      // Houve um candidato mais próximo, mas o score ficou abaixo da tolerância
      const detailedReasons: string[] = [
        `Score alcançado: ${bestCandidate.score}% (limiar de aprovação automática: ${toleranceThreshold}%)`,
        `Candidato mais próximo: Título ${bestCandidate.title.titleNumber} (${bestCandidate.cp?.name || bestCandidate.title.description})`,
        `Critério Valor: ${bestCandidate.breakdown.amountScore}/50 (${bestCandidate.breakdown.amountSummary})`,
        `Critério Data: ${bestCandidate.breakdown.dateScore}/30 (${bestCandidate.breakdown.dateSummary})`,
        `Critério Descrição: ${bestCandidate.breakdown.descriptionScore}/20 (${bestCandidate.breakdown.descriptionSummary})`
      ];

      const suggestedAction = bestCandidate.score >= 50 ? 'AJUSTAR_TOLERANCIA' : 'CRIAR_REGRA_DE_PARA';

      diagnosticList.push({
        id: `diag-fail-low-score-${stmt.id}`,
        timestamp: new Date().toISOString(),
        bankAccountId: stmt.bankAccountId,
        stmtId: stmt.id,
        fitId: stmt.fitId,
        date: stmt.date,
        amount: stmt.amount,
        description: stmt.description,
        status: 'NAO_CONCILIADO',
        toleranceThresholdUsed: toleranceThreshold,
        bestCandidateTitleId: bestCandidate.title.id,
        bestCandidateTitleNumber: bestCandidate.title.titleNumber,
        bestCandidateCounterpartyName: bestCandidate.cp?.name,
        bestCandidateScore: bestCandidate.score,
        breakdown: bestCandidate.breakdown,
        primaryReason: `O título mais compatível (${bestCandidate.title.titleNumber} - ${bestCandidate.cp?.name || bestCandidate.title.description}) atingiu ${bestCandidate.score}%, ficando abaixo do limiar de ${toleranceThreshold}%.`,
        detailedReasons,
        suggestedAction,
        actionNote: bestCandidate.score >= 50
          ? 'Você pode reduzir a tolerância nas opções ou clicar no par para conciliar manualmente com equalização.'
          : 'Crie uma Regra de Conciliação Automática (De-Para) para reconhecer este tipo de descritor bancário.'
      });
    }
  }

  return diagnosticList;
}

/**
 * Cria e aprende uma regra de conciliação automática a partir de uma conciliação manual
 * ou criação de título avulso, garantindo que lançamentos bancários futuros similares
 * sejam conciliados ou sugeridos com 1 clique.
 */
export function learnAndCreateRuleFromTransaction(params: {
  stmt: BankStatementEntry;
  chartAccountId: string;
  counterpartyId?: string;
  ruleName?: string;
  autoReconcile?: boolean;
}): ReconciliationRule {
  const bankDesc = cleanBankDescription(params.stmt.description);
  // Pega as primeiras 3 palavras significativas ou o descritor limpo
  const words = bankDesc.tokens;
  const pattern = (words.slice(0, 3).join(' ') || bankDesc.cleaned).slice(0, 30).trim();
  const isDebit = Number(params.stmt.amount) < 0;
  const now = new Date().toISOString();

  const existingRules = storage.getReconciliationRules();
  const newRule: ReconciliationRule = {
    id: `rule-auto-${Date.now()}`,
    name: params.ruleName || `Regra: ${pattern.toUpperCase() || 'EXTRATO'}`,
    pattern: pattern || params.stmt.description.slice(0, 20).trim(),
    matchType: 'CONTAINS',
    transactionType: isDebit ? 'DEBIT' : 'CREDIT',
    chartAccountId: params.chartAccountId,
    counterpartyId: params.counterpartyId || undefined,
    action: (params.autoReconcile ?? true) ? 'AUTO_CREATE_AND_RECONCILE' : 'AUTO_SUGGEST',
    active: true,
    priority: 15,
    createdAt: now,
    updatedAt: now
  };

  storage.saveReconciliationRules([...existingRules, newRule]);
  return newRule;
}
