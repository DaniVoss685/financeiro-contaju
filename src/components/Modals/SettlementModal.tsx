import React, { useState } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { X, CheckCircle2, AlertCircle, Calculator, Info, Landmark, Clock, History } from 'lucide-react';
import { FinancialTitle, BankAccount } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL } from '../../services/financialEngine';
import { TitleSettlementHistoryModal } from '../Financial/TitleSettlementHistoryModal';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';
import { useIsSimpleMode } from '../../hooks/useViewMode';

interface SettlementModalProps {
  title: FinancialTitle;
  isOpen: boolean;
  onClose: () => void;
  onSettled: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  title,
  isOpen,
  onClose,
  onSettled
}) => {
  const accounts = storage.getBankAccounts().filter(a => a.status === 'ATIVO');
  const counterparties = storage.getCounterparties();
  const counterparty = counterparties.find(c => c.id === title?.counterpartyId);

  const today = new Date().toISOString().split('T')[0];

  const [settlementDate, setSettlementDate] = useState(today);
  const [bankAccountId, setBankAccountId] = useState(title?.expectedBankAccountId || accounts[0]?.id || '');
  const [principalSettled, setPrincipalSettled] = useState<number>(title?.balancePrincipal || 0);
  const simple = useIsSimpleMode();
  const [showExtras, setShowExtras] = useState<boolean>(false);
  const [discount, setDiscount] = useState<number>(0);
  const [interest, setInterest] = useState<number>(0);
  const [fine, setFine] = useState<number>(0);
  const [bankFee, setBankFee] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [voucherRef, setVoucherRef] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const selectedAccount = accounts.find(a => a.id === bankAccountId);

  // Calculations per Prompt Item 11:
  // Recebimento: Net = principal - discount + interest + fine - bankFee
  // Pagamento: Net = principal - discount + interest + fine + bankFee
  const isReceivable = title.type === 'RECEBER';
  const netFinancialAmount = isReceivable
    ? principalSettled - discount + interest + fine - bankFee
    : principalSettled - discount + interest + fine + bankFee;

  const newBalancePrincipal = Math.max(0, title.balancePrincipal - principalSettled);
  const resultingState = newBalancePrincipal <= 0.005 ? 'LIQUIDADO' : 'PARCIAL';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!bankAccountId) {
      setErrorMessage('Selecione uma conta bancária ou caixa para movimentação.');
      return;
    }
    if (principalSettled <= 0) {
      setErrorMessage('O principal baixado deve ser maior que zero.');
      return;
    }
    if (discount > principalSettled) {
      setErrorMessage('O desconto não pode exceder o principal baixado.');
      return;
    }
    if (principalSettled > title.balancePrincipal + 0.005) {
      setErrorMessage(`O principal baixado não pode exceder o saldo (${formatBRL(title.balancePrincipal)}).`);
      return;
    }

    setIsSubmitting(true);
    const result = FinancialEngine.postSettlement({
      titleId: title.id,
      settlementDate,
      bankAccountId,
      principalSettled: Number(principalSettled),
      discount: Number(discount),
      interest: Number(interest),
      fine: Number(fine),
      bankFee: Number(bankFee),
      notes,
      voucherRef
    });

    setIsSubmitting(false);

    if (result.success) {
      onSettled();
      onClose();
    } else {
      setErrorMessage(result.message);
    }
  };

  if (!isOpen || !title) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-2xl lg:max-w-3xl w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden border border-slate-200 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 my-0 sm:my-8 flex flex-col">
        
        {/* Header Fixo */}
        <div className={`shrink-0 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between border-b ${
          isReceivable ? 'bg-emerald-50/70 border-emerald-100' : 'bg-rose-50/70 border-rose-100'
        }`}>
          <div>
            <span className={`${simple ? 'hidden' : ''} text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              isReceivable ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {isReceivable ? 'Baixa de Recebimento' : 'Baixa de Pagamento'}
            </span>
            <h2 className="text-base font-semibold text-slate-900 mt-1">
              {simple ? (isReceivable ? 'Marcar como recebido' : 'Marcar como pago') : `Título: ${title.titleNumber}`}
            </h2>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Title Details Summary */}
        <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex flex-wrap justify-between items-center gap-3">
          <div>
            <div className="font-semibold text-slate-900 text-sm">{counterparty?.name || 'Contraparte'}</div>
            <div className="text-slate-700 text-xs">{title.description}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-700">{simple ? (isReceivable ? 'Valor a receber' : 'Valor a pagar') : 'Saldo Atual em Aberto:'}</div>
            <div className="font-bold text-base text-slate-900">{formatBRL(title.balancePrincipal)}</div>
          </div>
        </div>

        {/* Banner Informativo de Baixa Parcial Prévia */}
        {(title.settlementState === 'PARCIAL' || Boolean(title.settledPrincipal && title.settledPrincipal > 0)) && (
          <div className="shrink-0 px-4 py-2.5 sm:px-6 bg-amber-500/10 border-b border-amber-500/20 text-xs flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-amber-900">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{simple ? 'Já foi pago em parte:' : 'Título parcialmente pago:'}</strong> Valor original de {formatBRL(title.originalAmount)}, sendo que <strong>{formatBRL(title.settledPrincipal || 0)}</strong> já foi amortizado.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-950 flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            >
              <History className="w-3.5 h-3.5 text-amber-600" />
              <span>Ver Extratos Anteriores</span>
            </button>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="shrink-0 mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs pb-28 sm:pb-6 scroll-smooth [scroll-padding-bottom:7rem]">
          
          {/* Main Parameters: Date and Bank Account */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-4">
              <label className="block font-medium text-slate-700 mb-1">
                {simple ? (isReceivable ? 'Data em que recebeu *' : 'Data em que pagou *') : 'Data Efetiva da Baixa *'}
              </label>
              <DateField
                max={today}
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                required
              />
              <span className={`text-[10px] text-slate-500 mt-0.5 ${simple ? 'hidden' : 'block'}`}>Data do movimento bancário</span>
            </div>

            <div className="md:col-span-8">
              <label className="block font-medium text-slate-700 mb-1">
                {simple ? (isReceivable ? 'Em qual conta caiu? *' : 'De qual conta saiu? *') : 'Conta Bancária / Caixa de Movimentação *'}
              </label>
              <PremiumSelect
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium text-slate-900 bg-white"
                required
              >
                <option value="">Selecione a conta bancária...</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {simple ? acc.name : `${acc.name} — Ag: ${acc.agency || '-'} CC: ${acc.accountNumber || '-'} (${acc.type}) — Saldo: ${formatBRL(FinancialEngine.getAccountBalance(acc.id))}`}
                  </option>
                ))}
              </PremiumSelect>

              {/* Visual Card showing selected bank details descending cleanly */}
              {selectedAccount && !simple && (
                <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <span>{selectedAccount.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded font-mono">
                        {selectedAccount.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                      <span>Agência: <strong className="text-slate-800">{selectedAccount.agency || '-'}</strong></span>
                      <span>•</span>
                      <span>Conta: <strong className="text-slate-800">{selectedAccount.accountNumber || '-'}</strong></span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right sm:border-l sm:border-slate-200 sm:pl-4">
                    <span className="text-[10px] text-slate-500 block">Saldo Disponível Atual</span>
                    <span className="font-bold text-xs text-emerald-700">
                      {formatBRL(FinancialEngine.getAccountBalance(selectedAccount.id))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Component Values Grid */}
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
            <div className="flex items-center justify-between font-semibold text-slate-800 border-b border-slate-200 pb-2">
              <span className="flex items-center">
                <Calculator className="w-4 h-4 mr-1 text-amber-500" />
                {simple ? 'Valores' : 'Composição Financeira da Baixa'}
              </span>
              <span className={`text-[10px] font-normal text-slate-500 ${simple ? 'hidden' : ''}`}>Regra de Cálculo Oficial</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  {simple ? (isReceivable ? 'Valor recebido (R$) *' : 'Valor pago (R$) *') : 'Principal Baixar (R$) *'}
                </label>
                <MoneyField value={principalSettled} onChange={setPrincipalSettled} className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm sm:text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500" required max={title.balancePrincipal} />
              </div>

              <div className="col-span-2 sm:col-span-4">
                <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showExtras}
                    onChange={(e) => {
                      setShowExtras(e.target.checked);
                      if (!e.target.checked) { setDiscount(0); setInterest(0); setFine(0); setBankFee(0); }
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-slate-700 font-medium">Teve desconto, juros ou multa?</span>
                </label>
              </div>

              {showExtras && (<>
              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Desconto (R$)
                </label>
                <MoneyField value={discount} onChange={setDiscount} className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm sm:text-xs text-amber-700 focus:ring-2 focus:ring-amber-500" max={principalSettled} />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Juros (R$)
                </label>
                <MoneyField value={interest} onChange={setInterest} className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm sm:text-xs text-slate-800 focus:ring-2 focus:ring-amber-500" />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Multa (R$)
                </label>
                <MoneyField value={fine} onChange={setFine} className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm sm:text-xs text-slate-800 focus:ring-2 focus:ring-amber-500" />
              </div>

              {isReceivable && (
                <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-slate-700 font-medium">
                        Tarifa Bancária Retida (R$)
                      </label>
                      <span className="text-[10px] text-slate-500">Taxa de boleto ou cartão descontada pelo banco</span>
                    </div>
                    <MoneyField value={bankFee} onChange={setBankFee} className="w-28 rounded-xl border border-slate-300 px-2.5 py-1.5 text-sm sm:text-xs text-rose-700 text-right font-medium focus:ring-2 focus:ring-amber-500" />
                  </div>
                </div>
              )}
              </>)}
            </div>

            {/* Calculated Results Summary Box */}
            <div className="mt-3 pt-3 border-t border-slate-300/80 space-y-1.5 text-xs">
              <div className="flex justify-between items-center text-slate-700">
                <span>{simple ? (isReceivable ? 'Valor que entra no banco:' : 'Valor que sai do banco:') : 'Dinheiro Efetivo no Banco:'}</span>
                <span className="font-bold text-sm text-slate-900">{formatBRL(netFinancialAmount)}</span>
              </div>
              <div className={`flex justify-between items-center text-slate-600 ${simple && newBalancePrincipal <= 0 ? 'hidden' : ''}`}>
                <span>{simple ? 'Fica faltando:' : 'Saldo Principal Restante:'}</span>
                <span className="font-semibold text-slate-800">{formatBRL(newBalancePrincipal)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>{simple ? 'Situação:' : 'Status Resultante:'}</span>
                <span className={`font-semibold px-2.5 py-0.5 rounded-full text-[11px] ${
                  resultingState === 'LIQUIDADO' ? 'bg-[var(--status-success-bg)] text-[var(--status-success)]' : 'bg-[var(--brand-gold-soft)] text-[var(--brand-gold)]'
                }`}>
                  {resultingState === 'LIQUIDADO' ? (simple ? (isReceivable ? 'Recebido por inteiro' : 'Pago por inteiro') : 'Quitação Total') : (simple ? 'Parcial' : 'Baixa Parcial')}
                </span>
              </div>
            </div>

          </div>

          {/* Notes and Document Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="adv-only">
              <label className="block font-medium text-slate-700 mb-1">
                Nº Comprovante / Autenticação
              </label>
              <input
                type="text"
                value={voucherRef}
                onChange={(e) => setVoucherRef(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Observações
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          </div>

          {/* Footer Actions (Sticky) */}
          <div className="shrink-0 sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 sm:p-4 z-10 flex items-center justify-end gap-3 shadow-lg">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`min-h-[42px] px-5 sm:px-6 py-2.5 text-xs font-semibold text-white rounded-xl shadow-md transition-colors flex items-center justify-center cursor-pointer ${
                isReceivable 
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' 
                  : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
              <span>{isSubmitting ? 'Processando...' : simple ? (isReceivable ? 'Recebido' : 'Pago') : 'Confirmar Baixa'}</span>
            </button>
          </div>

        </form>

        {/* Modal de Histórico de Extratos e Baixas Vinculadas */}
        <TitleSettlementHistoryModal
          isOpen={isHistoryOpen}
          title={title}
          onClose={() => setIsHistoryOpen(false)}
        />

      </div>
    </div>
  );
};
