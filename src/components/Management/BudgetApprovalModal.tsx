import React, { useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  History, 
  Save, 
  Calendar,
  Layers
} from 'lucide-react';
import { BudgetChangeRecord } from '../../types';
import { formatBRL } from '../../services/financialEngine';

interface BudgetApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  changes: BudgetChangeRecord[];
  year: number;
  onConfirmApproval: (versionName: string, notes: string) => void;
  impactMetrics: {
    oldRevenue: number;
    newRevenue: number;
    oldExpense: number;
    newExpense: number;
    oldNetIncome: number;
    newNetIncome: number;
  };
}

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const BudgetApprovalModal: React.FC<BudgetApprovalModalProps> = ({
  isOpen,
  onClose,
  changes,
  year,
  onConfirmApproval,
  impactMetrics
}) => {
  const [versionName, setVersionName] = useState(`Revisão Orçamentária ${year}.${new Date().getMonth() + 1}`);
  const [notes, setNotes] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  if (!isOpen) return null;

  const revDiff = impactMetrics.newRevenue - impactMetrics.oldRevenue;
  const expDiff = impactMetrics.newExpense - impactMetrics.oldExpense;
  const netDiff = impactMetrics.newNetIncome - impactMetrics.oldNetIncome;

  const filteredChanges = changes.filter(c => 
    !filterAccount || 
    c.accountName.toLowerCase().includes(filterAccount.toLowerCase()) ||
    (c.accountCode && c.accountCode.includes(filterAccount))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!versionName.trim()) return;
    onConfirmApproval(versionName.trim(), notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--surface-card)] w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30">
                  {changes.length} {changes.length === 1 ? 'célula alterada' : 'células alteradas'}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">Exercício {year}</span>
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Aprovar Simulação e Transformar em Novas Metas
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          
          {/* Executive Impact Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Receitas */}
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
              <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
                <span>Faturamento Projetado</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-lg font-mono font-bold text-[var(--text-primary)]">
                {formatBRL(impactMetrics.newRevenue)}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>Meta anterior: {formatBRL(impactMetrics.oldRevenue)}</span>
                <span className={`font-semibold ${revDiff >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {revDiff >= 0 ? `+${formatBRL(revDiff)}` : formatBRL(revDiff)}
                </span>
              </div>
            </div>

            {/* Despesas */}
            <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
              <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
                <span>Despesas & Custos</span>
                <TrendingDown className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-lg font-mono font-bold text-[var(--text-primary)]">
                {formatBRL(impactMetrics.newExpense)}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>Meta anterior: {formatBRL(impactMetrics.oldExpense)}</span>
                <span className={`font-semibold ${expDiff <= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {expDiff >= 0 ? `+${formatBRL(expDiff)}` : formatBRL(expDiff)}
                </span>
              </div>
            </div>

            {/* Resultado Líquido */}
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1">
              <div className="flex justify-between items-center text-xs text-amber-300 font-semibold">
                <span>Resultado Líquido Simulado</span>
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-lg font-mono font-bold text-amber-400">
                {formatBRL(impactMetrics.newNetIncome)}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
                <span>Variação Líquida:</span>
                <span className={`font-bold ${netDiff >= 0 ? 'text-amber-400' : 'text-rose-400'}`}>
                  {netDiff >= 0 ? `+${formatBRL(netDiff)}` : formatBRL(netDiff)}
                </span>
              </div>
            </div>
          </div>

          {/* Form version name and notes */}
          <div className="bg-[var(--surface-elevated)] p-4 rounded-xl border border-[var(--border-subtle)] space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Identificação da Nova Meta & Histórico
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Título da Versão / Meta:
                </label>
                <input
                  type="text"
                  value={versionName}
                  onChange={e => setVersionName(e.target.value)}
                  placeholder="Ex: Metas Revisadas Q2 - Crescimento 5%"
                  className="w-full px-3 py-2 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  Justificativa / Motivo da Revisão:
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Ajuste após repactuação contratual e redução de custos de TI"
                  className="w-full px-3 py-2 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Detailed Audit Table of Changes */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Detalhamento de Linhas e Colunas Alteradas ({changes.length})
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Histórico que será salvo e vinculado a esta revisão para consulta permanente
                </p>
              </div>

              <input
                type="text"
                value={filterAccount}
                onChange={e => setFilterAccount(e.target.value)}
                placeholder="Filtrar por conta..."
                className="px-3 py-1 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden w-48"
              />
            </div>

            <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Conta Contábil</th>
                    <th className="py-2.5 px-3 text-center">Coluna (Mês)</th>
                    <th className="py-2.5 px-3 text-right">Meta Anterior</th>
                    <th className="py-2.5 px-3 text-right">Novo Valor</th>
                    <th className="py-2.5 px-3 text-right">Variação (R$)</th>
                    <th className="py-2.5 px-3 text-center">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
                  {filteredChanges.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[var(--text-secondary)] font-sans">
                        Nenhuma alteração encontrada com o filtro aplicado.
                      </td>
                    </tr>
                  ) : (
                    filteredChanges.map((ch, idx) => {
                      const diff = ch.newValue - ch.previousValue;
                      const diffPct = ch.previousValue !== 0 ? (diff / ch.previousValue) * 100 : 0;

                      return (
                        <tr key={idx} className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                          <td className="py-2 px-3 font-sans font-medium text-[var(--text-primary)]">
                            <div>
                              <span className="font-semibold">{ch.accountName}</span>
                              {ch.accountCode && (
                                <span className="ml-1.5 text-[10px] font-mono text-amber-400">
                                  {ch.accountCode}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2 px-3 text-center font-sans font-bold text-amber-400 bg-amber-500/10">
                            {MONTH_SHORT[ch.monthIndex]}
                          </td>

                          <td className="py-2 px-3 text-right text-[var(--text-secondary)]">
                            {formatBRL(ch.previousValue)}
                          </td>

                          <td className="py-2 px-3 text-right font-bold text-amber-400">
                            {formatBRL(ch.newValue)}
                          </td>

                          <td className={`py-2 px-3 text-right font-bold ${
                            diff > 0 ? 'text-amber-400' : diff < 0 ? 'text-rose-400' : 'text-[var(--text-secondary)]'
                          }`}>
                            {diff > 0 ? `+${formatBRL(diff)}` : formatBRL(diff)}
                            {ch.previousValue !== 0 && ` (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%)`}
                          </td>

                          <td className="py-2 px-3 text-center font-sans">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--surface-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                              {ch.changeType === 'MONTH_BY_MONTH' ? 'Mês a Mês' : ch.changeType === 'PERCENT' ? 'Percentual' : ch.changeType === 'REPLICATE' ? 'Replicado' : 'Manual'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">
            A gravação salvará a versão no histórico e atualizará a meta oficial do sistema.
          </span>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)] transition-colors"
            >
              Voltar à Simulação
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 text-xs font-bold text-[#18181b] bg-amber-500 hover:bg-amber-400 rounded-xl shadow-md transition-all flex items-center"
            >
              <Save className="w-4 h-4 mr-1.5" />
              Confirmar e Gravar Novas Metas
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
