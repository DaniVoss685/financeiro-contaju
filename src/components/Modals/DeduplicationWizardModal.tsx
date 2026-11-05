import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Layers,
  ArrowRight,
  Filter,
  Check,
  Building,
  Calendar,
  DollarSign,
  Folder,
  ShieldCheck
} from 'lucide-react';
import { FinancialTitle } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR, formatCompetence, getAccountBadgeColorClasses, formatAccountNameWithoutCode } from '../../services/financialEngine';

interface DeduplicationWizardModalProps {
  isOpen: boolean;
  type: 'RECEBER' | 'PAGAR';
  onClose: () => void;
  onResolved: (deletedCount: number) => void;
}

export const DeduplicationWizardModal: React.FC<DeduplicationWizardModalProps> = ({
  isOpen,
  type,
  onClose,
  onResolved
}) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const chartAccounts = useMemo(() => storage.getChartAccounts(), [refreshTrigger]);

  // Buscar grupos candidatos a duplicidade
  const duplicateGroups = useMemo(() => {
    if (!isOpen) return [];
    return storage.findDuplicateTitleCandidates(type);
  }, [isOpen, type, refreshTrigger]);

  // Guarda quais IDs o usuário optou por manter (default: o 1º de cada grupo)
  // E quais serão excluídos
  const [selectedKeepIds, setSelectedKeepIds] = useState<Record<string, string>>({});
  const [selectedGroupsToProcess, setSelectedGroupsToProcess] = useState<Record<string, boolean>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Inicializar seleção padrão: manter o primeiro (mais antigo ou gerado por contrato), excluir os demais
  React.useEffect(() => {
    if (duplicateGroups.length > 0) {
      const initialKeep: Record<string, string> = {};
      const initialProcess: Record<string, boolean> = {};

      duplicateGroups.forEach(g => {
        // Preferência para manter: título originado de contrato ou com menor ID/criação mais antiga
        const preferredKeep = g.titles.find(t => t.originType === 'CONTRATO' || t.titleNumber.startsWith('FAT-')) || g.titles[0];
        initialKeep[g.groupKey] = preferredKeep.id;
        initialProcess[g.groupKey] = true;
      });

      setSelectedKeepIds(initialKeep);
      setSelectedGroupsToProcess(initialProcess);
    } else {
      setSelectedKeepIds({});
      setSelectedGroupsToProcess({});
    }
  }, [duplicateGroups]);

  if (!isOpen) return null;

  const totalGroups = duplicateGroups.length;
  const groupsToResolve = duplicateGroups.filter(g => selectedGroupsToProcess[g.groupKey]);
  
  // Total de títulos extras que serão excluídos
  const totalTitlesToDelete = groupsToResolve.reduce((acc, g) => {
    const keepId = selectedKeepIds[g.groupKey];
    const duplicatesInGroup = g.titles.filter(t => t.id !== keepId);
    return acc + duplicatesInGroup.length;
  }, 0);

  const handleToggleKeep = (groupKey: string, titleId: string) => {
    setSelectedKeepIds(prev => ({
      ...prev,
      [groupKey]: titleId
    }));
  };

  const handleToggleGroup = (groupKey: string) => {
    setSelectedGroupsToProcess(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const handleExecuteResolution = () => {
    if (totalTitlesToDelete === 0) return;

    setIsProcessing(true);
    try {
      const idsToDelete: string[] = [];

      groupsToResolve.forEach(g => {
        const keepId = selectedKeepIds[g.groupKey];
        g.titles.forEach(t => {
          if (t.id !== keepId) {
            idsToDelete.push(t.id);
          }
        });
      });

      if (idsToDelete.length > 0) {
        const res = storage.batchDeleteTitles(idsToDelete);
        
        storage.addAuditLog({
          userName: storage.getCurrentUser().name,
          userRole: storage.getCurrentUser().role,
          action: 'DEDUPLICACAO_ASSISTIDA',
          module: 'Financeiro',
          recordId: `dedup-${idsToDelete.length}`,
          details: `Assistente de conciliação: ${res.deletedCount} duplicata(s) de títulos a ${type.toLowerCase()} removidas com sucesso.`
        });

        onResolved(res.deletedCount);
        setRefreshTrigger(k => k + 1);
        onClose();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                Limpar lançamentos repetidos
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  {type === 'RECEBER' ? 'Contas a Receber' : 'Contas a Pagar'}
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Localize e resolva lançamentos repetidos com mesmo credor/devedor, competência e valor.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {totalGroups === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-sm text-[var(--text-primary)]">
                Nenhuma duplicidade encontrada!
              </h3>
              <p className="text-[var(--text-secondary)] max-w-md mx-auto text-xs">
                Seus lançamentos a {type.toLowerCase()} estão em ordem. Não há lançamentos sobrepostos com mesmo credor/devedor, mesma data de vencimento, mesma descrição e mesmo valor.
              </p>
            </div>
          ) : (
            <>
              {/* Alert notice com Regra Estrita */}
              <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Como identificamos os repetidos</span>
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  Para máxima segurança contábil, um lançamento só é agrupado como duplicidade quando possuir <strong>exatamente a mesma data de vencimento</strong>, <strong>mesma competência</strong>, <strong>mesma descrição</strong>, <strong>mesma contraparte</strong> e <strong>mesmo valor</strong>. Títulos com vencimentos em meses ou dias diferentes (recorrências ou parcelamentos) <strong>não são duplicidades</strong> e estão preservados.
                </p>
              </div>

              {/* Group list */}
              <div className="space-y-4">
                {duplicateGroups.map((g, gIdx) => {
                  const isChecked = !!selectedGroupsToProcess[g.groupKey];
                  const keepId = selectedKeepIds[g.groupKey];

                  return (
                    <div 
                      key={g.groupKey}
                      className={`rounded-xl border transition-all overflow-hidden ${
                        isChecked 
                          ? 'border-[var(--border-subtle)] bg-[var(--surface-elevated)]/40 shadow-xs' 
                          : 'opacity-50 border-[var(--border-subtle)] bg-slate-500/5'
                      }`}
                    >
                      {/* Group Header */}
                      <div className="p-3.5 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleGroup(g.groupKey)}
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer w-4 h-4 mt-1"
                            title="Processar este grupo"
                          />
                          <div className="space-y-1">
                            <div className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-2 flex-wrap">
                              <span className="text-slate-900 dark:text-slate-100">{g.counterpartyName}</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                Competência: {formatCompetence(g.competence)}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-blue-500" />
                                Vencimento: {formatDateBR(g.dueDate)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                              {g.description}
                            </div>
                            <span className="text-[11px] text-[var(--text-secondary)] block">
                              {g.titles.length} lançamentos iguais no valor de <strong>{formatBRL(g.amount)}</strong> cada
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 self-end sm:self-center">
                          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-base">
                            {formatBRL(g.amount)}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)] block">por lançamento</span>
                        </div>
                      </div>

                      {/* Titles in Group */}
                      <div className="p-3 divide-y divide-[var(--border-subtle)]">
                        {g.titles.map((t) => {
                          const isKeep = keepId === t.id;
                          const isContract = t.originType === 'CONTRATO' || (t.titleNumber && t.titleNumber.startsWith('FAT-'));
                          const isSale = t.originType === 'VENDA' || (t.titleNumber && t.titleNumber.startsWith('VEN-'));
                          const chartAcc = chartAccounts.find(a => a && (a.id === t.accountId || a.id === t.chartAccountId));
                          const categoryName = formatAccountNameWithoutCode(chartAcc);
                          const catColors = getAccountBadgeColorClasses(chartAcc);

                          return (
                            <div 
                              key={t.id} 
                              onClick={() => isChecked && handleToggleKeep(g.groupKey, t.id)}
                              className={`py-2.5 px-3 rounded-lg flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                isKeep 
                                  ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-950 dark:text-emerald-100' 
                                  : 'hover:bg-[var(--surface-elevated)] border border-transparent text-[var(--text-secondary)]'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  isKeep ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-400 bg-white dark:bg-slate-800'
                                }`}>
                                  {isKeep && <Check className="w-3 h-3" />}
                                </div>

                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-[var(--text-primary)]">
                                      {t.titleNumber}
                                    </span>

                                    {/* Categoria do Plano de Contas */}
                                    <span 
                                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md border ${catColors.container}`}
                                      title={`Categoria Contábil: ${categoryName}`}
                                    >
                                      <Folder className={`w-3 h-3 ${catColors.icon} shrink-0`} />
                                      <span>{categoryName}</span>
                                    </span>

                                    {/* Tag de Origem */}
                                    {isContract ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                                        🏷️ Contrato {t.contractNumber || ''}
                                      </span>
                                    ) : isSale ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                                        🏷️ Venda {t.saleNumber || ''}
                                      </span>
                                    ) : (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-700 dark:text-slate-300">
                                        🏷️ {t.originType || 'Lançamento'}
                                      </span>
                                    )}

                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                      t.settlementState === 'LIQUIDADO' 
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' 
                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                    }`}>
                                      {t.settlementState}
                                    </span>
                                  </div>

                                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 whitespace-normal break-words">
                                    {t.description}
                                  </div>

                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <span>Vencimento: <strong>{formatDateBR(t.dueDate)}</strong></span>
                                    <span>•</span>
                                    <span>Lançamento: {formatDateBR(t.launchDate || t.issueDate)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                {isKeep ? (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                                    ✓ Manter Este
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                    <Trash2 className="w-3 h-3" />
                                    Excluir este
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="text-xs text-[var(--text-secondary)]">
            {totalTitlesToDelete > 0 ? (
              <span>
                <strong>{totalTitlesToDelete}</strong> lançamento(s) repetido(s) serão removidos em <strong>{groupsToResolve.length}</strong> grupo(s).
              </span>
            ) : (
              <span>Nenhum lançamento repetido selecionado.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)] transition-colors cursor-pointer"
            >
              Fechar
            </button>
            {totalTitlesToDelete > 0 && (
              <button
                type="button"
                onClick={handleExecuteResolution}
                disabled={isProcessing}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isProcessing ? 'Excluindo...' : `Excluir ${totalTitlesToDelete} repetido(s)`}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
