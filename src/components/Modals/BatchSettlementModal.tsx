import React, { useState, useMemo } from 'react';
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  Landmark, 
  TrendingDown, 
  TrendingUp, 
  Calendar, 
  FileText,
  Lock,
  Layers,
  ArrowRight
} from 'lucide-react';
import { FinancialTitle, BankAccount } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface BatchSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  titles: FinancialTitle[];
  type: 'PAGAR' | 'RECEBER';
  onSettled: () => void;
}

export const BatchSettlementModal: React.FC<BatchSettlementModalProps> = ({
  isOpen,
  onClose,
  titles,
  type,
  onSettled
}) => {
  const today = new Date().toISOString().split('T')[0];
  const accounts = useMemo(() => storage.getBankAccounts().filter(a => a.status === 'ATIVO'), []);
  const counterparties = useMemo(() => storage.getCounterparties(), []);

  // Filtra apenas títulos que possuem saldo a liquidar e não estão cancelados
  const eligibleTitles = useMemo(() => {
    return titles.filter(t => t && t.documentState !== 'CANCELADO' && (Number(t.balancePrincipal) || 0) > 0.005);
  }, [titles]);

  // Checagem de títulos pertencentes a competências fechadas
  const closedPeriodTitles = useMemo(() => {
    return eligibleTitles.filter(t => FinancialEngine.isPeriodClosed(t.competence));
  }, [eligibleTitles]);

  const payableTitles = useMemo(() => {
    return eligibleTitles.filter(t => !FinancialEngine.isPeriodClosed(t.competence));
  }, [eligibleTitles]);

  const [settlementDate, setSettlementDate] = useState(today);
  const [bankAccountId, setBankAccountId] = useState(accounts[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState<'PIX' | 'TED' | 'BOLETO' | 'CARTAO' | 'DINHEIRO' | 'DEBITO'>('PIX');
  const [batchNotes, setBatchNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successReport, setSuccessReport] = useState<{ totalSettled: number; totalAmount: number } | null>(null);

  const selectedAccount = accounts.find(a => a.id === bankAccountId);
  const totalPrincipalToSettle = payableTitles.reduce((acc, t) => acc + (Number(t.balancePrincipal) || 0), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (payableTitles.length === 0) {
      setErrorMessage('Nenhum título elegível para liquidação em lote.');
      return;
    }

    if (!bankAccountId) {
      setErrorMessage('Selecione uma conta bancária ou caixa para movimentação.');
      return;
    }

    if (settlementDate > today) {
      setErrorMessage('A data efetiva de liquidação não pode ser futura.');
      return;
    }

    const settlementMonth = settlementDate.substring(0, 7);
    if (FinancialEngine.isPeriodClosed(settlementMonth)) {
      setErrorMessage(`A competência de liquidação ${settlementMonth} encontra-se fechada para movimentações.`);
      return;
    }

    setIsProcessing(true);

    let successCount = 0;
    let settledAmount = 0;
    const errors: string[] = [];

    // Executa cada baixa sequencialmente
    for (const title of payableTitles) {
      const result = FinancialEngine.postSettlement({
        titleId: title.id,
        settlementDate,
        bankAccountId,
        principalSettled: Number(title.balancePrincipal),
        discount: 0,
        interest: 0,
        fine: 0,
        bankFee: 0,
        notes: batchNotes 
          ? `[Baixa em Lote • ${paymentMethod}] ${batchNotes}` 
          : `[Baixa em Lote • ${paymentMethod}] Liquidação coletiva de obrigações.`,
        voucherRef: `LOTE-${paymentMethod}-${Date.now().toString().slice(-4)}`
      });

      if (result.success) {
        successCount++;
        settledAmount += title.balancePrincipal;
      } else {
        errors.push(`${title.titleNumber}: ${result.message}`);
      }
    }

    setIsProcessing(false);

    if (errors.length > 0) {
      setErrorMessage(`Atenção: ${successCount} títulos baixados, porém ocorreram erros em ${errors.length} itens: ${errors[0]}`);
      onSettled();
    } else {
      setSuccessReport({ totalSettled: successCount, totalAmount: settledAmount });
      onSettled();
      setTimeout(() => {
        setSuccessReport(null);
        onClose();
      }, 1800);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[var(--surface-card)] rounded-none sm:rounded-2xl shadow-2xl max-w-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden border border-[var(--border-subtle)] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 my-0 sm:my-6 flex flex-col">
        
        {/* Header Fixo */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl border shrink-0 ${
              type === 'PAGAR' 
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400' 
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            }`}>
              {type === 'PAGAR' ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)] truncate">
                Liquidação em Lote ({type === 'PAGAR' ? 'Contas a Pagar' : 'Contas a Receber'})
              </h2>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                Baixar {payableTitles.length} título(s) selecionados com 1 único comando
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] cursor-pointer shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Rolável */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs pb-28 sm:pb-6 scroll-smooth [scroll-padding-bottom:7rem]">

          {successReport && (
            <div className="p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-emerald-200 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold text-sm">Lote liquidado com sucesso!</div>
                <div>{successReport.totalSettled} títulos quitados no total de {formatBRL(successReport.totalAmount)}.</div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-200 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Alerta de Competência Fechada se houver títulos bloqueados */}
          {closedPeriodTitles.length > 0 && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-amber-200 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <strong>{closedPeriodTitles.length} título(s) em competência fechada/auditada</strong> foram desconsiderados deste lote para preservar a integridade contábil.
              </div>
            </div>
          )}

          {/* Resumo do Lote */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-secondary)] block font-semibold uppercase">Títulos a Baixar</span>
              <span className="text-lg font-bold text-[var(--text-primary)] font-mono">{payableTitles.length}</span>
              <span className="text-[10px] text-slate-400 block">de {titles.length} selecionados</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-secondary)] block font-semibold uppercase">Montante Total</span>
              <span className={`text-lg font-bold font-mono ${type === 'PAGAR' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatBRL(totalPrincipalToSettle)}
              </span>
              <span className="text-[10px] text-slate-400 block">saldo 100% amortizado</span>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
              <span className="text-[10px] text-[var(--text-secondary)] block font-semibold uppercase">Conta Selecionada</span>
              <span className="text-xs font-bold text-amber-300 block truncate mt-1">
                {selectedAccount?.name || 'Selecione...'}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                Saldo: {formatBRL(selectedAccount?.initialBalance || 0)}
              </span>
            </div>
          </div>

          <form id="batch-settlement-form" onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              
              {/* Conta Bancária */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Conta Bancária / Caixa de Movimentação *
                </label>
                <PremiumSelect
                  required
                  value={bankAccountId}
                  onChange={e => setBankAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.institution || acc.type})
                    </option>
                  ))}
                </PremiumSelect>
              </div>

              {/* Data Efetiva da Baixa */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Data Efetiva da Baixa *
                </label>
                <DateField
                  required
                  max={today}
                  value={settlementDate}
                  onChange={e => setSettlementDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-sm sm:text-xs text-[var(--text-primary)] font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Forma de Pagamento / Liquidação */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Forma de Liquidação *
                </label>
                <PremiumSelect
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-sm sm:text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="PIX">⚡ PIX (Transferência Instantânea)</option>
                  <option value="TED">🏦 TED / Transferência Bancária</option>
                  <option value="BOLETO">📄 Boleto Bancário Compensado</option>
                  <option value="CARTAO">💳 Cartão Corporativo</option>
                  <option value="DEBITO">🏧 Débito Automático em Conta</option>
                  <option value="DINHEIRO">💵 Dinheiro / Caixa Físico</option>
                </PremiumSelect>
              </div>

              {/* Observação / Identificador do Lote */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                  Observação / Histórico do Lote
                </label>
                <input
                  type="text"
                  placeholder="Ex: Baixa quinzenal de fornecedores / lote NF"
                  value={batchNotes}
                  onChange={e => setBatchNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-sm sm:text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Lista Prévia dos Títulos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">
                  Prévia dos Lançamentos ({payableTitles.length})
                </span>
                <span className="text-[10px] text-slate-400">
                  Amortização integral de cada saldo pendente
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto border border-[var(--border-subtle)] rounded-xl divide-y divide-[var(--border-subtle)] bg-[var(--surface-elevated)]/50">
                {payableTitles.map(t => {
                  const cp = counterparties.find(c => c.id === t.counterpartyId);
                  return (
                    <div key={t.id} className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-[var(--surface-elevated)] transition-colors">
                      <div className="min-w-0 pr-3">
                        <div className="font-semibold text-[var(--text-primary)] truncate">
                          {t.titleNumber} • {cp?.name || 'Favorecido'}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] truncate">
                          {t.description} • Venc: {formatDateBR(t.dueDate)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-amber-300 block">
                          {formatBRL(t.balancePrincipal)}
                        </span>
                        <span className="text-[9px] text-emerald-400 font-semibold block">
                          100% quitado
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </form>
        </div>

        {/* Footer Fixo */}
        <div className="shrink-0 sticky bottom-0 p-3 sm:p-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)]/95 backdrop-blur flex justify-between items-center gap-3 z-10 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="min-h-[42px] px-4 py-2 bg-transparent hover:bg-[var(--surface-card)] text-[var(--text-secondary)] rounded-xl text-xs font-semibold border border-[var(--border-subtle)] transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="submit"
            form="batch-settlement-form"
            disabled={isProcessing || payableTitles.length === 0}
            className="min-h-[42px] px-5 sm:px-6 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <span>Processando {payableTitles.length} Baixas...</span>
            ) : (
              <>
                <span>Confirmar Baixa em Lote ({formatBRL(totalPrincipalToSettle)})</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
