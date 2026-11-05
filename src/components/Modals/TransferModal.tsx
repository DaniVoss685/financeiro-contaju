import React, { useState } from 'react';
import { X, ArrowLeftRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL } from '../../services/financialEngine';
import { SearchableSelect } from '../Common/SearchableSelect';
import { toast } from '../../hooks/useToast';
import { DateField } from '../Common/DateField';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
  onTransferred?: () => void;
  onError?: (err: string) => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  onCompleted,
  onTransferred,
  onError
}) => {
  const accounts = storage.getBankAccounts().filter(a => a.status === 'ATIVO');
  const today = new Date().toISOString().split('T')[0];

  const [originAccountId, setOriginAccountId] = useState(accounts[0]?.id || '');
  const [destinationAccountId, setDestinationAccountId] = useState(accounts[1]?.id || '');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(today);
  const [feeAmount, setFeeAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (originAccountId === destinationAccountId) {
      const msg = 'A conta de origem e destino devem ser diferentes.';
      setErrorMessage(msg);
      toast.error(msg, 'Contas Idênticas');
      if (onError) onError(msg);
      return;
    }
    if (amount <= 0) {
      const msg = 'O valor da transferência deve ser positivo.';
      setErrorMessage(msg);
      toast.error(msg, 'Valor Inválido');
      if (onError) onError(msg);
      return;
    }

    const res = FinancialEngine.postTransfer({
      originAccountId,
      destinationAccountId,
      amount: Number(amount),
      date,
      feeAmount: Number(feeAmount),
      notes
    });

    if (res.success) {
      if (onCompleted) onCompleted();
      if (onTransferred) onTransferred();
      onClose();
    } else {
      setErrorMessage(res.message);
      toast.error(res.message, 'Falha na Transferência');
      if (onError) onError(res.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
        
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-slate-50">
          <div className="flex items-center space-x-2">
            <ArrowLeftRight className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-slate-900">
              Transferência entre Contas
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div>
            <SearchableSelect
              label="Conta de Origem (Débito)"
              required
              options={accounts.map(acc => ({
                value: acc.id,
                label: acc.name,
                sublabel: `Saldo: ${formatBRL(FinancialEngine.getAccountBalance(acc.id))}`
              }))}
              value={originAccountId}
              onChange={setOriginAccountId}
              placeholder="Selecione ou pesquise a conta de origem..."
            />
          </div>

          <div>
            <SearchableSelect
              label="Conta de Destino (Crédito)"
              required
              options={accounts.map(acc => ({
                value: acc.id,
                label: acc.name,
                sublabel: `Saldo: ${formatBRL(FinancialEngine.getAccountBalance(acc.id))}`
              }))}
              value={destinationAccountId}
              onChange={setDestinationAccountId}
              placeholder="Selecione ou pesquise a conta de destino..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Valor Transferido (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs font-bold text-slate-900"
                required
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Data Efetiva *
              </label>
              <DateField
                max={today}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-xs"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Tarifa da Transferência (TED/DOC se houver)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={feeAmount || ''}
              onChange={(e) => setFeeAmount(parseFloat(e.target.value) || 0)}
              placeholder="0,00"
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-rose-700"
            />
            <span className="text-[10px] text-slate-700">Classificada atomicamente em Despesas Financeiras</span>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Observações / Justificativa
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Cobertura de caixa para folha ou aplicação"
              className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center"
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              Executar Transferência
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
