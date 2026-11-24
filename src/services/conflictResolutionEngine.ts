import { FinancialTitle, Settlement, TitleSettlementState, AuditLogEntry } from '../types';
import { storage } from './storageService';

export interface TitleConflictReport {
  titleId: string;
  titleNumber: string;
  description: string;
  winner: 'LOCAL' | 'REMOTE' | 'MERGED';
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  reason: string;
  diffFields: string[];
  settlementsMergedCount: number;
  localSnapshot: Partial<FinancialTitle>;
  remoteSnapshot: Partial<FinancialTitle>;
  resolvedSnapshot: Partial<FinancialTitle>;
}

export interface TitleMergeResult {
  mergedTitles: FinancialTitle[];
  conflictsResolvedCount: number;
  conflictReports: TitleConflictReport[];
}

export interface SettlementMergeResult {
  mergedSettlements: Settlement[];
  newFromRemoteCount: number;
  preservedFromLocalCount: number;
}

const CONFLICT_HISTORY_STORAGE_KEY = 'contaju_conflict_resolution_history';

/**
 * Motor de Detecção e Resolução de Conflitos para Sincronização Multi-Dispositivo
 * Implementa estratégia Last-Write-Wins (LWW) inteligente com:
 * 1. Fusão semântica de liquidações (nenhuma baixa ou quitação é perdida)
 * 2. Recálculo determinístico de saldos a pagar/receber
 * 3. Log de auditoria completo para compliance e rastreabilidade
 */
export class ConflictResolutionEngine {
  private static recentConflictReports: TitleConflictReport[] = [];

  /**
   * Compara dois títulos e identifica campos divergentes
   */
  public static compareTitles(local: FinancialTitle, remote: FinancialTitle): {
    hasConflict: boolean;
    diffFields: string[];
    details: string;
  } {
    const diffFields: string[] = [];

    if (local.description?.trim() !== remote.description?.trim()) diffFields.push('description');
    if (local.dueDate !== remote.dueDate) diffFields.push('dueDate');
    if (local.expectedCashDate !== remote.expectedCashDate) diffFields.push('expectedCashDate');
    if (Math.abs((local.originalAmount || 0) - (remote.originalAmount || 0)) > 0.001) diffFields.push('originalAmount');
    if (local.accountId !== remote.accountId) diffFields.push('accountId');
    if (local.counterpartyId !== remote.counterpartyId) diffFields.push('counterpartyId');
    if ((local.notes || '').trim() !== (remote.notes || '').trim()) diffFields.push('notes');
    if (local.documentState !== remote.documentState) diffFields.push('documentState');
    if (local.settlementState !== remote.settlementState) diffFields.push('settlementState');
    if (local.categoryName !== remote.categoryName) diffFields.push('categoryName');
    if (Math.abs((local.settledPrincipal || 0) - (remote.settledPrincipal || 0)) > 0.001) diffFields.push('settledPrincipal');
    if (Math.abs((local.balancePrincipal || 0) - (remote.balancePrincipal || 0)) > 0.001) diffFields.push('balancePrincipal');

    const hasConflict = diffFields.length > 0;
    const details = hasConflict
      ? `Campos divergentes: ${diffFields.join(', ')}`
      : 'Sem divergências de dados';

    return { hasConflict, diffFields, details };
  }

  /**
   * Realiza a mesclagem das liquidações (Settlements) de ambos os dispositivos.
   * Assegura que nenhuma baixa seja excluída ou sobreposta acidentalmente.
   */
  public static mergeSettlements(
    localSettlements: Settlement[],
    remoteSettlements: Settlement[]
  ): SettlementMergeResult {
    const settlementMap = new Map<string, Settlement>();
    let newFromRemoteCount = 0;
    let preservedFromLocalCount = 0;

    // 1. Registra os settlements locais
    for (const local of localSettlements) {
      if (local?.id) {
        settlementMap.set(local.id, { ...local });
        preservedFromLocalCount++;
      }
    }

    // 2. Mescla com os settlements remotos
    for (const remote of remoteSettlements) {
      if (!remote?.id) continue;

      if (!settlementMap.has(remote.id)) {
        // Novo settlement que o dispositivo local ainda não tinha
        settlementMap.set(remote.id, { ...remote });
        newFromRemoteCount++;
      } else {
        // Já existe em ambos: se um deles foi estornado (isReversed), o estorno prevalece por segurança
        const existing = settlementMap.get(remote.id)!;
        if (remote.isReversed && !existing.isReversed) {
          settlementMap.set(remote.id, { ...remote });
        } else if (!remote.isReversed && existing.isReversed) {
          // Mantém estornado localmente
          settlementMap.set(remote.id, { ...existing });
        } else {
          // Ambos no mesmo estado, mantém o mais recente
          const localTime = new Date(existing.createdAt || 0).getTime();
          const remoteTime = new Date(remote.createdAt || 0).getTime();
          settlementMap.set(remote.id, remoteTime >= localTime ? remote : existing);
        }
      }
    }

    const mergedSettlements = Array.from(settlementMap.values()).sort((a, b) => 
      new Date(b.settlementDate || b.createdAt || 0).getTime() - new Date(a.settlementDate || a.createdAt || 0).getTime()
    );

    return {
      mergedSettlements,
      newFromRemoteCount,
      preservedFromLocalCount
    };
  }

  /**
   * Resolve conflito pontual entre a versão local e remota de um mesmo título.
   * Aplica Last-Write-Wins para metadados e recalcula saldos com base nos settlements unificados.
   */
  public static resolveTitle(
    local: FinancialTitle,
    remote: FinancialTitle,
    titleSettlements: Settlement[]
  ): {
    resolved: FinancialTitle;
    conflictReport?: TitleConflictReport;
  } {
    const comparison = this.compareTitles(local, remote);

    // Se os dados são equivalentes, mantém o registro com timestamp mais atual
    if (!comparison.hasConflict) {
      const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
      const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();
      const base = remoteTime > localTime ? { ...remote } : { ...local };
      // As duas cópias iguais não provam que a situação está certa: se uma cópia velha "em aberto" foi gravada
      // por cima na nuvem, as duas ficam iguais e a baixa existente era ignorada. As baixas mandam no saldo.
      const own = titleSettlements.filter(s => s.titleId === base.id);
      if (own.length > 0) {
        const settled = own.filter(s => !s.isReversed).reduce((sum, s) => sum + (Number(s.components?.principalSettled) || 0), 0);
        const balance = Math.max(0, Number(((base.originalAmount || 0) - settled).toFixed(2)));
        const state: TitleSettlementState = balance <= 0.001 && base.originalAmount > 0 ? 'LIQUIDADO' : (settled > 0.001 ? 'PARCIAL' : 'ABERTO');
        if (state !== base.settlementState || Math.abs((base.balancePrincipal || 0) - balance) > 0.001) {
          base.settledPrincipal = Number(settled.toFixed(2));
          base.balancePrincipal = balance;
          base.settlementState = state;
        }
      }
      return { resolved: base };
    }

    // Determina vencedor por timestamp (Last-Write-Wins)
    const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
    const remoteTime = new Date(remote.updatedAt || remote.createdAt || 0).getTime();

    const isLocalWinner = localTime >= remoteTime;
    const winner: 'LOCAL' | 'REMOTE' | 'MERGED' = isLocalWinner ? 'LOCAL' : 'REMOTE';
    const baseSource = isLocalWinner ? local : remote;
    const fallbackSource = isLocalWinner ? remote : local;

    // Clona o título vencedor
    const resolved: FinancialTitle = {
      ...baseSource,
      // Preserva notas ou campos customizados se a fonte vencedora não os preencheu
      notes: baseSource.notes?.trim() ? baseSource.notes : (fallbackSource.notes || ''),
      categoryName: baseSource.categoryName || fallbackSource.categoryName,
      customFields: { ...(fallbackSource.customFields || {}), ...(baseSource.customFields || {}) }
    };

    // REGRA DE OURO FINANCEIRA: Recálculo de Quitações / Saldo
    // NUNCA descartamos baixas registradas em campo.
    const validSettlements = titleSettlements.filter(s => s.titleId === resolved.id && !s.isReversed);
    const computedSettled = validSettlements.reduce(
      (sum, s) => sum + (Number(s.components?.principalSettled) || 0),
      0
    );
    const computedBalance = Math.max(0, Number(((resolved.originalAmount || 0) - computedSettled).toFixed(2)));

    let computedSettlementState: TitleSettlementState = 'ABERTO';
    if (computedBalance <= 0.001 && resolved.originalAmount > 0) {
      computedSettlementState = 'LIQUIDADO';
    } else if (computedSettled > 0.001) {
      computedSettlementState = 'PARCIAL';
    }

    resolved.settledPrincipal = Number(computedSettled.toFixed(2));
    resolved.balancePrincipal = computedBalance;
    resolved.settlementState = computedSettlementState;
    resolved.updatedAt = new Date().toISOString();

    const reason = `Conflito resolvido via Last-Write-Wins (${winner} venceu). Local: ${local.updatedAt || 'N/A'}, Remoto: ${remote.updatedAt || 'N/A'}. ` +
      `Saldos recalculados a partir de ${validSettlements.length} quitação(ões) consolidada(s).`;

    const conflictReport: TitleConflictReport = {
      titleId: resolved.id,
      titleNumber: resolved.titleNumber || 'S/N',
      description: resolved.description || 'Título sem descrição',
      winner,
      localUpdatedAt: local.updatedAt || local.createdAt || 'N/A',
      remoteUpdatedAt: remote.updatedAt || remote.createdAt || 'N/A',
      reason,
      diffFields: comparison.diffFields,
      settlementsMergedCount: validSettlements.length,
      localSnapshot: {
        description: local.description,
        dueDate: local.dueDate,
        originalAmount: local.originalAmount,
        settledPrincipal: local.settledPrincipal,
        balancePrincipal: local.balancePrincipal,
        settlementState: local.settlementState,
        updatedAt: local.updatedAt
      },
      remoteSnapshot: {
        description: remote.description,
        dueDate: remote.dueDate,
        originalAmount: remote.originalAmount,
        settledPrincipal: remote.settledPrincipal,
        balancePrincipal: remote.balancePrincipal,
        settlementState: remote.settlementState,
        updatedAt: remote.updatedAt
      },
      resolvedSnapshot: {
        description: resolved.description,
        dueDate: resolved.dueDate,
        originalAmount: resolved.originalAmount,
        settledPrincipal: resolved.settledPrincipal,
        balancePrincipal: resolved.balancePrincipal,
        settlementState: resolved.settlementState,
        updatedAt: resolved.updatedAt
      }
    };

    // Grava no log de auditoria
    this.recordAuditLog(conflictReport);

    return { resolved, conflictReport };
  }

  /**
   * Mescla duas coleções de títulos (Local x Remoto) com resolução determinística de conflitos
   */
  public static mergeTitleCollections(
    localTitles: FinancialTitle[],
    remoteTitles: FinancialTitle[],
    allSettlements: Settlement[]
  ): TitleMergeResult {
    const titlesMap = new Map<string, FinancialTitle>();
    const localMap = new Map<string, FinancialTitle>();
    const remoteMap = new Map<string, FinancialTitle>();
    const conflictReports: TitleConflictReport[] = [];

    localTitles.forEach(t => t?.id && localMap.set(t.id, t));
    remoteTitles.forEach(t => t?.id && remoteMap.set(t.id, t));

    // Todos os IDs presentes em local ou remoto
    const allIds = new Set([...Array.from(localMap.keys()), ...Array.from(remoteMap.keys())]);

    for (const id of allIds) {
      const local = localMap.get(id);
      const remote = remoteMap.get(id);

      if (local && !remote) {
        // Título existe apenas localmente (criado offline ou ainda não subiu)
        const titleSettlements = allSettlements.filter(s => s.titleId === id && !s.isReversed);
        const settled = titleSettlements.reduce((sum, s) => sum + (s.components?.principalSettled || 0), 0);
        const balance = Math.max(0, Number(((local.originalAmount || 0) - settled).toFixed(2)));
        const state: TitleSettlementState = balance <= 0.001 && local.originalAmount > 0 
          ? 'LIQUIDADO' 
          : (settled > 0 ? 'PARCIAL' : local.settlementState);

        titlesMap.set(id, {
          ...local,
          settledPrincipal: Number(settled.toFixed(2)),
          balancePrincipal: balance,
          settlementState: state
        });
      } else if (!local && remote) {
        // Título existe apenas remotamente (criado em outro dispositivo)
        const titleSettlements = allSettlements.filter(s => s.titleId === id && !s.isReversed);
        const settled = titleSettlements.reduce((sum, s) => sum + (s.components?.principalSettled || 0), 0);
        const balance = Math.max(0, Number(((remote.originalAmount || 0) - settled).toFixed(2)));
        const state: TitleSettlementState = balance <= 0.001 && remote.originalAmount > 0 
          ? 'LIQUIDADO' 
          : (settled > 0 ? 'PARCIAL' : remote.settlementState);

        titlesMap.set(id, {
          ...remote,
          settledPrincipal: Number(settled.toFixed(2)),
          balancePrincipal: balance,
          settlementState: state
        });
      } else if (local && remote) {
        // Concorrência entre ambos
        const titleSettlements = allSettlements.filter(s => s.titleId === id);
        const { resolved, conflictReport } = this.resolveTitle(local, remote, titleSettlements);
        titlesMap.set(id, resolved);

        if (conflictReport) {
          conflictReports.push(conflictReport);
        }
      }
    }

    const mergedTitles = Array.from(titlesMap.values()).sort((a, b) => 
      new Date(b.dueDate || b.launchDate || 0).getTime() - new Date(a.dueDate || a.launchDate || 0).getTime()
    );

    if (conflictReports.length > 0) {
      this.saveHistory(conflictReports);
    }

    return {
      mergedTitles,
      conflictsResolvedCount: conflictReports.length,
      conflictReports
    };
  }

  /**
   * Registra a resolução do conflito no Log de Auditoria do sistema
   */
  private static recordAuditLog(report: TitleConflictReport): void {
    try {
      storage.addAuditLog({
        userName: 'Sincronizador Automático (LWW)',
        userRole: 'ADMIN',
        action: 'RESOLUÇÃO_CONFLITO_MULTIDISPOSITIVO',
        module: 'FINANCEIRO_SINCRONIZACAO',
        recordId: report.titleId,
        details: `${report.reason} [Divergências: ${report.diffFields.join(', ')}]`,
        previousValue: JSON.stringify({
          winner: report.winner,
          localSnapshot: report.localSnapshot,
          remoteSnapshot: report.remoteSnapshot
        }),
        newValue: JSON.stringify(report.resolvedSnapshot)
      });
    } catch (e) {
      console.warn('[ConflictResolutionEngine] Não foi possível salvar log de auditoria do conflito:', e);
    }
  }

  /**
   * Salva os relatórios de conflito no histórico recente
   */
  private static saveHistory(reports: TitleConflictReport[]): void {
    this.recentConflictReports = [...reports, ...this.recentConflictReports].slice(0, 50);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CONFLICT_HISTORY_STORAGE_KEY, JSON.stringify(this.recentConflictReports));
      } catch (e) {
        console.warn('[ConflictResolutionEngine] Falha ao persistir histórico de conflitos:', e);
      }
    }
  }

  /**
   * Retorna os últimos relatórios de conflitos resolvidos
   */
  public static getConflictHistory(): TitleConflictReport[] {
    if (this.recentConflictReports.length > 0) {
      return this.recentConflictReports;
    }
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(CONFLICT_HISTORY_STORAGE_KEY);
        if (stored) {
          this.recentConflictReports = JSON.parse(stored);
          return this.recentConflictReports;
        }
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Limpa o histórico de conflitos
   */
  public static clearHistory(): void {
    this.recentConflictReports = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CONFLICT_HISTORY_STORAGE_KEY);
    }
  }
}
