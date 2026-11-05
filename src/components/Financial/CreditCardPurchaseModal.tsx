import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  ShoppingBag, 
  CreditCard as CardIcon, 
  Calendar, 
  Calculator, 
  Split, 
  Building2, 
  Layers, 
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { CreditCard, Counterparty, ChartAccount, CreditCardPurchase, CreditCardInstallment } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL } from '../../services/financialEngine';
import { getDaysInMonth } from '../../utils/dateUtils';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface CreditCardPurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CreditCard[];
  counterparties: Counterparty[];
  chartAccounts: ChartAccount[];
  initialCardId?: string;
  initialTransactionType?: 'DESPESA' | 'ESTORNO' | 'CASHBACK';
  editingPurchase?: CreditCardPurchase | null;
  onSuccess: () => void;
}

export const CreditCardPurchaseModal: React.FC<CreditCardPurchaseModalProps> = ({
  isOpen,
  onClose,
  cards,
  counterparties,
  chartAccounts,
  initialCardId,
  initialTransactionType = 'DESPESA',
  editingPurchase,
  onSuccess
}) => {
  const [transactionType, setTransactionType] = useState<'DESPESA' | 'ESTORNO' | 'CASHBACK'>(initialTransactionType);
  const [cardId, setCardId] = useState(initialCardId || cards[0]?.id || '');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [customCounterpartyName, setCustomCounterpartyName] = useState('');
  const [chartAccountId, setChartAccountId] = useState('acc-desp-1');
  const [installmentsCount, setInstallmentsCount] = useState<number>(1);
  
  // Calculation mode: TOTAL_DIVIDED or INSTALLMENT_VALUE
  const [calculationMode, setCalculationMode] = useState<'TOTAL_DIVIDED' | 'INSTALLMENT_VALUE'>('TOTAL_DIVIDED');
  const [totalAmountInput, setTotalAmountInput] = useState<string>('');
  const [installmentValueInput, setInstallmentValueInput] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editingPurchase) {
      setCardId(editingPurchase.cardId);
      setTransactionType(editingPurchase.transactionType || 'DESPESA');
      setPurchaseDate(editingPurchase.purchaseDate);
      setDescription(editingPurchase.description);
      setCounterpartyId(editingPurchase.counterpartyId || '');
      setCustomCounterpartyName(editingPurchase.counterpartyName || '');
      setChartAccountId(editingPurchase.chartAccountId || 'acc-desp-1');
      setInstallmentsCount(editingPurchase.installmentsCount || 1);
      setCalculationMode(editingPurchase.calculationMode || 'TOTAL_DIVIDED');
      setTotalAmountInput(String(editingPurchase.totalAmount));
      setInstallmentValueInput(String(editingPurchase.installmentValue || editingPurchase.totalAmount));
      setNotes(editingPurchase.notes || '');
      setError(null);
    } else {
      setCardId(initialCardId || cards[0]?.id || '');
      setTransactionType(initialTransactionType || 'DESPESA');
      setPurchaseDate(new Date().toISOString().split('T')[0]);
      setDescription('');
      setCounterpartyId('');
      setCustomCounterpartyName('');
      setChartAccountId('acc-desp-1');
      setInstallmentsCount(1);
      setCalculationMode('TOTAL_DIVIDED');
      setTotalAmountInput('');
      setInstallmentValueInput('');
      setNotes('');
      setError(null);
    }
  }, [editingPurchase, initialCardId, initialTransactionType, isOpen, cards]);

  const selectedCard = useMemo(() => {
    return cards.find(c => c.id === cardId) || cards[0];
  }, [cards, cardId]);

  // Derived amounts
  const { finalTotalAmount, finalInstallmentValue } = useMemo(() => {
    const count = Math.max(1, installmentsCount);
    if (calculationMode === 'TOTAL_DIVIDED') {
      const total = Math.max(0, parseFloat(totalAmountInput) || 0);
      const perInstallment = total > 0 ? Math.round((total / count) * 100) / 100 : 0;
      return { finalTotalAmount: total, finalInstallmentValue: perInstallment };
    } else {
      const perInstallment = Math.max(0, parseFloat(installmentValueInput) || 0);
      const total = Math.round(perInstallment * count * 100) / 100;
      return { finalTotalAmount: total, finalInstallmentValue: perInstallment };
    }
  }, [calculationMode, totalAmountInput, installmentValueInput, installmentsCount]);

  // Generate installments schedule based on purchase date and card closing day
  const previewInstallments = useMemo<CreditCardInstallment[]>(() => {
    if (!selectedCard || finalTotalAmount <= 0) return [];

    const result: CreditCardInstallment[] = [];
    const count = Math.max(1, installmentsCount);
    const pDate = new Date(purchaseDate + 'T12:00:00');
    const pDay = pDate.getDate();
    let pMonth = pDate.getMonth() + 1; // 1-12
    let pYear = pDate.getFullYear();

    // If purchase day >= card closing day, it enters the NEXT month invoice!
    if (pDay >= selectedCard.closingDay) {
      pMonth += 1;
      if (pMonth > 12) {
        pMonth = 1;
        pYear += 1;
      }
    }

    let remainingTotal = finalTotalAmount;

    for (let i = 1; i <= count; i++) {
      let instYear = pYear;
      let instMonth = pMonth + (i - 1);
      while (instMonth > 12) {
        instMonth -= 12;
        instYear += 1;
      }

      const invoiceMonth = `${instYear}-${String(instMonth).padStart(2, '0')}`;

      // Due date of that invoice
      let dueYear = instYear;
      let dueMonth = instMonth;
      if (selectedCard.dueDay <= selectedCard.closingDay) {
        dueMonth += 1;
        if (dueMonth > 12) {
          dueMonth = 1;
          dueYear += 1;
        }
      }
      const maxDays = getDaysInMonth(dueYear, dueMonth);
      const actualDueDay = Math.min(selectedCard.dueDay, maxDays);
      const dueDate = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(actualDueDay).padStart(2, '0')}`;

      // Adjust last installment for roundings
      let currentInstAmount = finalInstallmentValue;
      if (i === count) {
        currentInstAmount = Math.round(remainingTotal * 100) / 100;
      } else {
        remainingTotal = Math.round((remainingTotal - currentInstAmount) * 100) / 100;
      }

      result.push({
        installmentNumber: i,
        totalInstallments: count,
        amount: currentInstAmount,
        competence: invoiceMonth,
        invoiceMonth,
        dueDate,
        settled: false
      });
    }

    return result;
  }, [selectedCard, finalTotalAmount, finalInstallmentValue, installmentsCount, purchaseDate]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCard) {
      setError('Selecione um cartão de crédito cadastrado.');
      return;
    }

    if (!description.trim()) {
      setError('Informe uma descrição clara para o lançamento.');
      return;
    }

    if (finalTotalAmount <= 0) {
      setError('O valor do lançamento deve ser maior que zero.');
      return;
    }

    if (!purchaseDate) {
      setError('Selecione a data da transação.');
      return;
    }

    const providerName = customCounterpartyName.trim() || 
      counterparties.find(c => c.id === counterpartyId)?.name || 
      'Despesa Geral Cartão';

    const initialInvoiceMonth = previewInstallments[0]?.invoiceMonth || `${purchaseDate.substring(0, 7)}`;

    if (editingPurchase) {
      // Atualizar compra existente com preservação de IDs de parcelas compatíveis
      const updatedPurchase: CreditCardPurchase = {
        ...editingPurchase,
        cardId,
        transactionType,
        purchaseDate,
        description: description.trim(),
        counterpartyId: counterpartyId || undefined,
        counterpartyName: providerName,
        chartAccountId,
        totalAmount: finalTotalAmount,
        installmentsCount,
        calculationMode,
        installmentValue: finalInstallmentValue,
        invoiceMonth: initialInvoiceMonth,
        installments: previewInstallments,
        notes: notes.trim()
      };

      storage.updateCardPurchaseAndSyncTitles(updatedPurchase);

      // Log de Auditoria
      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'EDICAO_COMPRA_CARTAO',
        module: 'Cartões de Crédito',
        recordId: updatedPurchase.id,
        details: `Atualizado ${transactionType} no cartão ${selectedCard.name}: ${updatedPurchase.description} no valor de ${formatBRL(finalTotalAmount)}. Sincronizado no Contas a Pagar.`
      });
    } else {
      // Nova Compra / Estorno
      const newPurchase: CreditCardPurchase = {
        id: `cp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        cardId,
        transactionType,
        purchaseDate,
        description: description.trim(),
        counterpartyId: counterpartyId || undefined,
        counterpartyName: providerName,
        chartAccountId,
        totalAmount: finalTotalAmount,
        installmentsCount,
        calculationMode,
        installmentValue: finalInstallmentValue,
        invoiceMonth: initialInvoiceMonth,
        installments: previewInstallments,
        notes: notes.trim(),
        createdAt: new Date().toISOString()
      };

      // Save purchase AND synchronize with FinancialTitle (Contas a Pagar)
      storage.addCardPurchaseAndSyncTitles(newPurchase);

      // Audit log
      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: transactionType === 'DESPESA' ? 'LANCAMENTO_COMPRA_CARTAO' : 'LANCAMENTO_ESTORNO_CARTAO',
        module: 'Cartões de Crédito',
        recordId: newPurchase.id,
        details: `Lançado ${transactionType} no cartão ${selectedCard.name}: ${newPurchase.description} no valor de ${formatBRL(finalTotalAmount)}. Sincronizado no Contas a Pagar.`
      });
    }

    onSuccess();
    onClose();
  };

  const isCreditType = transactionType !== 'DESPESA';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isCreditType
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
            }`}>
              {transactionType === 'ESTORNO' ? (
                <RotateCcw className="w-5 h-5" />
              ) : transactionType === 'CASHBACK' ? (
                <Sparkles className="w-5 h-5" />
              ) : (
                <ShoppingBag className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingPurchase ? 'Editar Lançamento no Cartão' : isCreditType ? 'Novo Estorno / Crédito no Cartão' : 'Nova Compra no Cartão de Crédito'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {isCreditType
                  ? 'Abate o total da fatura selecionada e recompõe o limite do cartão.'
                  : 'Lançamento parcelado ou à vista com integração direta no Contas a Pagar.'}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Seletor de Tipo de Transação */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTransactionType('DESPESA')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                transactionType === 'DESPESA'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Compra / Despesa
            </button>
            <button
              type="button"
              onClick={() => setTransactionType('ESTORNO')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                transactionType === 'ESTORNO'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Estorno / Devolução
            </button>
            <button
              type="button"
              onClick={() => setTransactionType('CASHBACK')}
              className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                transactionType === 'CASHBACK'
                  ? 'bg-teal-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Cashback / Recompensa
            </button>
          </div>

          {isCreditType && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>
                <strong>{transactionType === 'CASHBACK' ? 'Cashback:' : 'Estorno / Devolução:'}</strong> Este lançamento entrará como crédito líquido na fatura, diminuindo o valor a pagar e liberando o limite disponível do cartão.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Cartão */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cartão de Crédito Utilizado *
              </label>
              <PremiumSelect
                required
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer text-xs"
              >
                {cards.map(card => (
                  <option 
                    key={card.id} 
                    value={card.id}
                    className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                  >
                    {card.name} ({card.institution} • Final {card.lastFourDigits || '••••'}) — Fecha dia {card.closingDay} / Vence dia {card.dueDay}
                  </option>
                ))}
              </PremiumSelect>
            </div>

            {/* Data da Compra */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Data da Compra *
              </label>
              <DateField
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
              {selectedCard && (
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Fechamento do cartão: dia {selectedCard.closingDay}
                </span>
              )}
            </div>

            {/* Categoria do Plano de Contas */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Categoria / Plano de Contas *
              </label>
              <PremiumSelect
                value={chartAccountId}
                onChange={(e) => setChartAccountId(e.target.value)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer text-xs"
              >
                {chartAccounts
                  .filter(a => (transactionType === 'DESPESA' ? a.type === 'DESPESA' : true) && a.acceptsLaunches)
                  .map(a => (
                    <option 
                      key={a.id} 
                      value={a.id}
                      className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                    >
                      {a.code} - {a.name}
                    </option>
                  ))}
              </PremiumSelect>
            </div>

            {/* Descrição */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Descrição da Compra / Despesa *
              </label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Assinatura de Software, Material de Escritório, Passagens..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
            </div>

            {/* Fornecedor */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Fornecedor Cadastrado
              </label>
              <PremiumSelect
                value={counterpartyId}
                onChange={(e) => setCounterpartyId(e.target.value)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer text-xs"
              >
                <option value="" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">
                  Selecione ou digite ao lado...
                </option>
                {counterparties.map(c => (
                  <option 
                    key={c.id} 
                    value={c.id}
                    className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                  >
                    {c.name} ({c.type})
                  </option>
                ))}
              </PremiumSelect>
            </div>

            {/* Ou Nome do Estabelecimento */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Ou Estabelecimento / Nome Avulso
              </label>
              <input
                type="text"
                value={customCounterpartyName}
                onChange={(e) => setCustomCounterpartyName(e.target.value)}
                placeholder="Ex: Amazon AWS, Posto Shell, Kalunga..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
            </div>

            {/* Modalidade de Cálculo das Parcelas */}
            <div className="md:col-span-2 p-3.5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Split className="w-4 h-4 text-amber-500" />
                  Condições de Parcelamento
                </span>
                
                {/* Switcher de Modalidade */}
                <div className="flex items-center bg-slate-200 dark:bg-slate-900 p-1 rounded-xl border border-slate-300 dark:border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setCalculationMode('TOTAL_DIVIDED')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      calculationMode === 'TOTAL_DIVIDED'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Valor Total ÷ Parcelas
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalculationMode('INSTALLMENT_VALUE')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      calculationMode === 'INSTALLMENT_VALUE'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Valor da Parcela × N° Parcelas
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Número de Parcelas *
                  </label>
                  <PremiumSelect
                    value={installmentsCount}
                    onChange={(e) => setInstallmentsCount(parseInt(e.target.value, 10) || 1)}
                    style={{ colorScheme: 'light dark' }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer text-xs"
                  >
                    <option value="1" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">
                      1x (À vista na fatura)
                    </option>
                    {Array.from({ length: 23 }, (_, i) => i + 2).map(n => (
                      <option 
                        key={n} 
                        value={n}
                        className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                      >
                        {n}x parcelado
                      </option>
                    ))}
                    <option value="36" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">
                      36x parcelado
                    </option>
                    <option value="48" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">
                      48x parcelado
                    </option>
                  </PremiumSelect>
                </div>

                {calculationMode === 'TOTAL_DIVIDED' ? (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Valor Total da Compra (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      style={{ colorScheme: 'light dark' }}
                      value={totalAmountInput}
                      onChange={(e) => setTotalAmountInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Valor de Cada Parcela (R$) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      style={{ colorScheme: 'light dark' }}
                      value={installmentValueInput}
                      onChange={(e) => setInstallmentValueInput(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
                    />
                  </div>
                )}

                <div className="p-2.5 bg-white dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {calculationMode === 'TOTAL_DIVIDED' ? 'Valor por parcela calculado:' : 'Valor total calculado:'}
                  </span>
                  <div className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">
                    {calculationMode === 'TOTAL_DIVIDED' 
                      ? `${installmentsCount}x de ${formatBRL(finalInstallmentValue)}`
                      : `Total de ${formatBRL(finalTotalAmount)}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Pré-visualização das parcelas e vencimentos */}
            {previewInstallments.length > 0 && (
              <div className="md:col-span-2 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950/40">
                <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    Cronograma de Vencimento nas Faturas ({previewInstallments.length} parcelas)
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold font-mono">
                    Total: {formatBRL(finalTotalAmount)}
                  </span>
                </div>

                <div className="max-h-36 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800/60 text-xs">
                  {previewInstallments.map((inst) => (
                    <div key={inst.installmentNumber} className="px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-800 text-[11px] font-mono flex items-center justify-center text-slate-700 dark:text-slate-300 font-semibold">
                          {inst.installmentNumber}/{inst.totalInstallments}
                        </span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          Fatura: <strong className="text-slate-900 dark:text-white">{inst.invoiceMonth}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 text-[11px]">
                          Vencimento: <span className="text-slate-700 dark:text-slate-300 font-mono">{inst.dueDate}</span>
                        </span>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-300">
                          {formatBRL(inst.amount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Observações
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes adicionais sobre a compra ou projeto correspondente..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-[#26262b] flex items-center justify-between gap-3 shrink-0">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              Sincroniza automaticamente com o relatório de Contas a Pagar
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#26262b] rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`px-5 py-2 text-xs font-bold text-slate-950 rounded-xl shadow-md transition-all cursor-pointer ${
                  isCreditType
                    ? 'bg-emerald-500 hover:bg-emerald-400'
                    : 'bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105'
                }`}
              >
                {editingPurchase ? 'Salvar Alterações' : isCreditType ? 'Confirmar Estorno / Crédito' : 'Confirmar Compra'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
