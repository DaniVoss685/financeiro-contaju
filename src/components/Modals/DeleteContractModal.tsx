import React, { useState, useMemo } from 'react';
import { 
  X, 
  Trash2, 
  AlertTriangle, 
  FileText,
  DollarSign,
  ShieldAlert
} from 'lucide-react';
import { Contract } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';

interface DeleteContractModalProps {
  contract: Contract | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const DeleteContractModal: React.FC<DeleteContractModalProps> = ({
  contract,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [cancelPendingTitles, setCancelPendingTitles] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const counterparties = storage.getCounterparties();
  const allTitles = storage.getTitles();

  const client = useMemo(() => {
    if (!contract) return null;
    return counterparties.find(c => c.id === contract.customerId);
  }, [contract, counterparties]);

  const pendingTitles = useMemo(() => {
    if (!contract) return [];
    return allTitles.filter(t => 
      t.originType === 'CONTRATO' &&
      t.originId === contract.id &&
      t.settlementState !== 'LIQUIDADO' &&
      t.documentState !== 'CANCELADO'
    );
  }, [contract, allTitles]);

  const pendingTotal = useMemo(() => {
    return pendingTitles.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
  }, [pendingTitles]);

  if (!isOpen || !contract) return null;

  const handleDelete = () => {
    setIsDeleting(true);
    try {
      const res = storage.deleteContract(contract.id, { cancelPendingTitles });
      if (res.success) {
        onSuccess(res.message);
        onClose();
      } else {
        alert(res.message);
      }
    } catch (err) {
      console.error('Erro ao excluir contrato:', err);
      alert('Ocorreu um erro ao excluir o contrato.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-[#131316] rounded-2xl shadow-2xl max-w-lg w-full flex flex-col border border-slate-200 dark:border-[#26262b] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-rose-50/50 dark:bg-rose-950/20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Excluir Contrato Definitivamente
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Esta ação removerá o contrato do cadastro
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b] space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-slate-900 dark:text-white">{contract.contractNumber}</span>
              <span className="font-bold text-rose-600 dark:text-rose-400">{formatBRL(contract.monthlyTotal)}/mês</span>
            </div>
            <div className="font-semibold text-slate-800 dark:text-slate-200">{client?.name || 'Cliente'}</div>
            <div className="text-[11px] text-slate-500">{contract.description}</div>
          </div>

          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Tem certeza de que deseja excluir permanentemente o contrato <strong className="text-slate-900 dark:text-white">{contract.contractNumber}</strong>?
          </p>

          {pendingTitles.length > 0 && (
            <label className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={cancelPendingTitles}
                onChange={(e) => setCancelPendingTitles(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700"
              />
              <div className="space-y-0.5">
                <span className="font-bold text-rose-900 dark:text-rose-300 block">
                  Cancelar {pendingTitles.length} títulos em aberto ({formatBRL(pendingTotal)})
                </span>
                <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
                  Cancela as cobranças futuras pendentes geradas para este contrato, evitando saldo em aberto fantasma no Contas a Receber.
                </span>
              </div>
            </label>
          )}

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-300">
            <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>
              <strong>Dica de Gestão:</strong> Se o contrato foi cancelado pelo cliente durante a operação comercial, prefira a opção <strong>"Cancelar ou Deixar Inativo"</strong> para manter o histórico de quando o cliente parou de trabalhar com o escritório e registrar o motivo.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-semibold transition-colors text-xs"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-md shadow-rose-600/20 flex items-center gap-1.5 text-xs"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? 'Excluindo...' : 'Sim, Excluir Contrato'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
