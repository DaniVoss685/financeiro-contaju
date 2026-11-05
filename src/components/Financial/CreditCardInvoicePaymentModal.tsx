import React, { useState } from 'react';
import { formatDateBR } from '../../services/financialEngine';
import { formatCompetenceShort } from '../../utils/dateUtils';
import { MoneyField } from '../Common/MoneyField';
import { 
  X, 
  CreditCard as CardIcon, 
  Building2, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  AlertTriangle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { CreditCard, BankAccount } from '../../types';
import { FinancialEngine, formatBRL } from '../../services/financialEngine';
import { storage } from '../../services/storageService';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface CreditCardInvoicePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: CreditCard;
  invoiceMonth: string; // YYYY-MM
  invoiceTotal: number;
  invoiceBalance: number;
  dueDate: string;
  bankAccounts: BankAccount[];
  onSuccess: () => void;
}

export const CreditCardInvoicePaymentModal: React.FC<CreditCardInvoicePaymentModalProps> = ({
  isOpen,
  onClose,
  card,
  invoiceMonth,
  invoiceTotal,
  invoiceBalance,
  dueDate,
  bankAccounts,
  onSuccess
}) => {
  const [bankAccountId, setBankAccountId] = useState(
    card.defaultPaymentBankAccountId || bankAccounts[0]?.id || ''
  );
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [amountToPay, setAmountToPay] = useState(String(invoiceBalance));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const selectedBank = bankAccounts.find(b => b.id === bankAccountId);
  const bankCurrentBalance = selectedBank ? FinancialEngine.calculateAccountBalance(selectedBank.id) : 0;

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const val = parseFloat(amountToPay);
    if (isNaN(val) || val <= 0) {
      setError('Por favor, informe um valor de pagamento válido.');
      return;
    }

    if (!bankAccountId) {
      setError('Selecione a conta bancária de onde o saldo será debitado.');
      return;
    }

    setIsProcessing(true);

    const res = FinancialEngine.payCardInvoice({
      cardId: card.id,
      invoiceMonth,
      bankAccountId,
      amountPaid: val,
      paymentDate,
      notes: notes.trim()
    });

    setIsProcessing(false);

    if (res.success) {
      // Log de Auditoria
      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'PAGAMENTO_FATURA_CARTAO',
        module: 'Cartões de Crédito',
        recordId: card.id,
        details: `Pagamento de fatura ${invoiceMonth} do cartão ${card.name} no valor de ${formatBRL(val)} debitado da conta ${selectedBank?.name || 'PJ'}.`
      });

      onSuccess();
      onClose();
    } else {
      setError(res.error || 'Erro ao processar o pagamento da fatura.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <CardIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Pagamento de Fatura do Cartão
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {card.name} — Fatura {formatCompetenceShort(invoiceMonth)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handlePay} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Invoice Summary Box */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Total da Fatura:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-slate-200">{formatBRL(invoiceTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Vencimento da Fatura:</span>
              <span className="font-mono text-slate-900 dark:text-slate-200">{dueDate}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Saldo a Pagar:</span>
              <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatBRL(invoiceBalance)}
              </span>
            </div>
          </div>

          {/* Conta Bancária Pagadora */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Debitar da Conta Bancária PJ *
            </label>
            <PremiumSelect
              required
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              style={{ colorScheme: 'light dark' }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 cursor-pointer text-xs"
            >
              <option value="" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">
                Selecione a conta bancária pagadora...
              </option>
              {bankAccounts.map(b => (
                <option 
                  key={b.id} 
                  value={b.id}
                  className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                >
                  {b.name} ({b.bankName || 'Banco PJ'})
                </option>
              ))}
            </PremiumSelect>
            {selectedBank && (
              <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span>Saldo contábil disponível:</span>
                <span className={`font-mono font-semibold ${bankCurrentBalance >= parseFloat(amountToPay || '0') ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {formatBRL(bankCurrentBalance)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Data do Pagamento */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Data do Pagamento *
              </label>
              <DateField
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-xs"
              />
            </div>

            {/* Valor a Pagar */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Valor do Pagamento (R$) *
              </label>
              <MoneyField value={parseFloat(String(amountToPay)) || 0} onChange={(v: number) => setAmountToPay(v ? String(v) : '')} className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-xs" required />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observações / Comprovante
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Pago via débito automático / Pix bancário"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-xs"
            />
          </div>

          {/* Automations Badge */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-2xl space-y-1.5 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="font-semibold text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Impactos automáticos no sistema:
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Gera saída bancária imediata na conta selecionada.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Baixa automaticamente os títulos da fatura no Contas a Pagar.</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span>Restaura o limite de crédito disponível do cartão.</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-[#26262b] flex items-center justify-end gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#26262b] rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isProcessing ? 'Processando...' : 'Confirmar Pagamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
