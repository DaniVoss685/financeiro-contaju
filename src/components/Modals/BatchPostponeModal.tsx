import React, { useState, useMemo } from 'react';
import { 
  X, 
  CalendarDays, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Lock,
  ArrowRight
} from 'lucide-react';
import { FinancialTitle } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { DateField } from '../Common/DateField';

interface BatchPostponeModalProps {
  isOpen: boolean;
  onClose: () => void;
  titles: FinancialTitle[];
  onUpdated: () => void;
}

export const BatchPostponeModal: React.FC<BatchPostponeModalProps> = ({
  isOpen,
  onClose,
  titles,
  onUpdated
}) => {
  const [mode, setMode] = useState<'DAYS' | 'SPECIFIC_DATE'>('DAYS');
  const [daysToAdd, setDaysToAdd] = useState<number>(7);
  const [specificDate, setSpecificDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Títulos elegíveis (abertos e sem período fechado)
  const eligibleTitles = useMemo(() => {
    return titles.filter(t => t && t.documentState !== 'CANCELADO' && t.settlementState !== 'LIQUIDADO');
  }, [titles]);

  const closedTitles = useMemo(() => {
    return eligibleTitles.filter(t => FinancialEngine.isPeriodClosed(t.competence));
  }, [eligibleTitles]);

  const payableTitles = useMemo(() => {
    return eligibleTitles.filter(t => !FinancialEngine.isPeriodClosed(t.competence));
  }, [eligibleTitles]);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (payableTitles.length === 0) {
      setErrorMsg('Nenhum título elegível em aberto para prorrogação.');
      return;
    }

    if (mode === 'SPECIFIC_DATE' && !specificDate) {
      setErrorMsg('Informe a nova data de vencimento desejada.');
      return;
    }

    setIsProcessing(true);

    const currentUser = storage.getCurrentUser();
    let updatedCount = 0;

    for (const title of payableTitles) {
      let nextDueDate = title.dueDate;
      if (mode === 'DAYS') {
        const dParts = title.dueDate.split('-').map(Number);
        const dObj = new Date(dParts[0], dParts[1] - 1, dParts[2]);
        dObj.setDate(dObj.getDate() + daysToAdd);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const d = String(dObj.getDate()).padStart(2, '0');
        nextDueDate = `${y}-${m}-${d}`;
      } else {
        nextDueDate = specificDate;
      }

      storage.updateTitle(title.id, {
        dueDate: nextDueDate,
        expectedCashDate: nextDueDate
      });

      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'PRORROGACAO_LOTE_VENCIMENTO',
        module: title.type === 'PAGAR' ? 'Contas a Pagar' : 'Contas a Receber',
        recordId: title.id,
        details: `Vencimento prorrogado de ${formatDateBR(title.dueDate)} para ${formatDateBR(nextDueDate)} em lote. Motivo: ${reason || 'Ajuste operacional de fluxo de caixa'}.`,
        previousValue: title.dueDate,
        newValue: nextDueDate
      });

      updatedCount++;
    }

    setIsProcessing(false);
    onUpdated();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95 my-6 flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Prorrogar Vencimentos em Lote
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Postergar datas de {payableTitles.length} obrigação(ões) selecionada(s)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleApply} className="p-5 space-y-4 text-xs">

          {errorMsg && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {closedTitles.length > 0 && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-amber-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{closedTitles.length} títulos de competências fechadas foram protegidos e não serão alterados.</span>
            </div>
          )}

          {/* Modalidade */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-2">
              Modo de Prorrogação
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('DAYS')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-xs flex items-center justify-center gap-2 cursor-pointer ${
                  mode === 'DAYS'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Adicionar Dias (+X)</span>
              </button>

              <button
                type="button"
                onClick={() => setMode('SPECIFIC_DATE')}
                className={`py-2 px-3 rounded-xl font-bold border transition-all text-xs flex items-center justify-center gap-2 cursor-pointer ${
                  mode === 'SPECIFIC_DATE'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                    : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                <span>Nova Data Fixa</span>
              </button>
            </div>
          </div>

          {/* Opções de Dias Rápidos */}
          {mode === 'DAYS' ? (
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5">
                Escolha o acréscimo de dias:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[7, 15, 30, 60].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDaysToAdd(d)}
                    className={`py-2 px-2 rounded-xl font-mono font-bold text-center border cursor-pointer transition-all ${
                      daysToAdd === d
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--surface-card)]'
                    }`}
                  >
                    +{d} dias
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Nova Data de Vencimento e Previsão de Caixa *
              </label>
              <DateField
                required
                value={specificDate}
                onChange={e => setSpecificDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          )}

          {/* Motivo para auditoria */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Motivo da Prorrogação (Registrado na Trilha de Auditoria)
            </label>
            <input
              type="text"
              placeholder="Ex: Renegociação de prazo com fornecedor / acordo comercial"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-transparent hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] rounded-xl text-xs font-semibold border border-[var(--border-subtle)] cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing || payableTitles.length === 0}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              {isProcessing ? 'Atualizando...' : 'Confirmar Prorrogação'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
