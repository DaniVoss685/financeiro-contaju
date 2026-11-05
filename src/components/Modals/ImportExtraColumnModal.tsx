import React, { useState } from 'react';
import { Plus, X, Columns, AlertCircle, Check } from 'lucide-react';
import { ExtraColumnDefinition } from '../../services/contaAzulMappingEngine';
import { PremiumSelect } from '../Common/PremiumSelect';

interface ImportExtraColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableHeaders: string[];
  alreadyMappedHeaders: string[];
  onAddColumn: (col: ExtraColumnDefinition) => void;
}

export const ImportExtraColumnModal: React.FC<ImportExtraColumnModalProps> = ({
  isOpen,
  onClose,
  availableHeaders,
  alreadyMappedHeaders,
  onAddColumn
}) => {
  const unmappedHeaders = availableHeaders.filter(h => !alreadyMappedHeaders.includes(h));

  const [selectedHeader, setSelectedHeader] = useState<string>(unmappedHeaders[0] || '');
  const [columnLabel, setColumnLabel] = useState<string>(unmappedHeaders[0] || '');
  const [columnType, setColumnType] = useState<'TEXT' | 'NUMBER' | 'DATE' | 'CURRENCY'>('TEXT');

  if (!isOpen) return null;

  const handleSelectHeader = (header: string) => {
    setSelectedHeader(header);
    if (!columnLabel || unmappedHeaders.includes(columnLabel)) {
      setColumnLabel(header);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHeader) {
      alert('Selecione uma coluna da planilha.');
      return;
    }

    const safeId = `col_${Date.now()}_${columnLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    onAddColumn({
      id: safeId,
      sourceHeader: selectedHeader,
      label: columnLabel.trim() || selectedHeader,
      type: columnType
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="p-4 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Columns className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Adicionar Coluna Extra da Planilha
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Importe campos não nativos como metadados personalizados
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-card)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
              Coluna de Origem na Planilha:
            </label>
            {unmappedHeaders.length > 0 ? (
              <PremiumSelect
                value={selectedHeader}
                onChange={(e) => handleSelectHeader(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              >
                {unmappedHeaders.map(h => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </PremiumSelect>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Todas as colunas disponíveis já foram mapeadas. Você pode selecionar uma coluna existente para duplicar se desejar:</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
              Nome de Exibição no App (Rótulo):
            </label>
            <input
              type="text"
              value={columnLabel}
              onChange={(e) => setColumnLabel(e.target.value)}
              placeholder="Ex: Centro de Custo, Nota Fiscal, Projeto..."
              required
              className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-medium text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
              Tipo de Dado:
            </label>
            <PremiumSelect
              value={columnType}
              onChange={(e) => setColumnType(e.target.value as any)}
              className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-medium text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
            >
              <option value="TEXT">Texto Geral</option>
              <option value="CURRENCY">Moeda / Valor Financeiro (R$)</option>
              <option value="NUMBER">Número Inteiro / Decimal</option>
              <option value="DATE">Data (AAAA-MM-DD)</option>
            </PremiumSelect>
          </div>

          <div className="p-3 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-[11px] text-[var(--text-secondary)] space-y-1">
            <span className="font-semibold text-[var(--text-primary)]">Onde esta coluna será salva:</span>
            <p>
              Os valores serão visíveis na tabela de validação do Step 3 e persistidos de forma segura no registro de metadados (<code className="text-amber-400">customFields</code>) de cada título importado.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl hover:bg-[var(--surface-elevated)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedHeader}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Incluir Coluna</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
