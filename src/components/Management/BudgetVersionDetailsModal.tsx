import React, { useState } from 'react';
import { 
  X, 
  History, 
  RotateCcw, 
  CheckCircle2, 
  Calendar, 
  User, 
  FileText,
  Search
} from 'lucide-react';
import { BudgetVersion } from '../../types';
import { formatBRL } from '../../services/financialEngine';

interface BudgetVersionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  version: BudgetVersion | null;
  onRestoreVersion: (version: BudgetVersion) => void;
}

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export const BudgetVersionDetailsModal: React.FC<BudgetVersionDetailsModalProps> = ({
  isOpen,
  onClose,
  version,
  onRestoreVersion
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen || !version) return null;

  const filteredChanges = version.changes.filter(c =>
    !search ||
    c.accountName.toLowerCase().includes(search.toLowerCase()) ||
    (c.accountCode && c.accountCode.includes(search))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[var(--surface-card)] w-full max-w-4xl rounded-2xl border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30">
                  {version.versionNumber}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">Exercício {version.year}</span>
              </div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Registro Histórico de Alterações da Meta
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
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] text-xs">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-[10px] text-[var(--text-secondary)] block">Data de Aprovação</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {new Date(version.approvedAt).toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-[10px] text-[var(--text-secondary)] block">Aprovado por</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {version.approvedBy}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-[10px] text-[var(--text-secondary)] block">Total de Células Alteradas</span>
                <span className="font-semibold text-amber-400">
                  {version.totalChanges} alterações
                </span>
              </div>
            </div>
          </div>

          {version.notes && (
            <div className="p-3 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] text-xs">
              <span className="font-bold text-[var(--text-secondary)] block mb-1">Observações da Revisão:</span>
              <p className="text-[var(--text-primary)]">{version.notes}</p>
            </div>
          )}

          {/* Table of Changes */}
          <div>
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Linhas e Colunas Modificadas nesta Revisão ({version.changes.length})
              </h3>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar conta..."
                className="px-3 py-1 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden w-48"
              />
            </div>

            <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-secondary)] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Conta Contábil</th>
                    <th className="py-2.5 px-3 text-center">Coluna (Mês)</th>
                    <th className="py-2.5 px-3 text-right">Meta Anterior</th>
                    <th className="py-2.5 px-3 text-right">Novo Valor Aprovado</th>
                    <th className="py-2.5 px-3 text-right">Variação (R$)</th>
                    <th className="py-2.5 px-3 text-center">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[11px]">
                  {filteredChanges.map((ch, idx) => {
                    const diff = ch.newValue - ch.previousValue;
                    const diffPct = ch.previousValue !== 0 ? (diff / ch.previousValue) * 100 : 0;

                    return (
                      <tr key={idx} className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                        <td className="py-2 px-3 font-sans font-medium text-[var(--text-primary)]">
                          <span className="font-semibold">{ch.accountName}</span>
                          {ch.accountCode && (
                            <span className="ml-1.5 text-[10px] font-mono text-amber-400">
                              {ch.accountCode}
                            </span>
                          )}
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
                            {ch.changeType}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)] transition-colors"
          >
            Fechar
          </button>

          <button
            onClick={() => {
              if (window.confirm(`Deseja restaurar a versão "${version.versionNumber}" como as metas de trabalho ativas para o ano ${version.year}?`)) {
                onRestoreVersion(version);
                onClose();
              }
            }}
            className="px-4 py-2 text-xs font-bold text-[#18181b] bg-amber-500 hover:bg-amber-400 rounded-xl shadow-md transition-all flex items-center"
          >
            <RotateCcw className="w-4 h-4 mr-1.5" />
            Restaurar esta Versão como Meta Ativa
          </button>
        </div>

      </div>
    </div>
  );
};
