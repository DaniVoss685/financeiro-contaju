import React, { useState, useMemo, useEffect } from 'react';
import { formatDateBR } from '../../services/financialEngine';
import { formatCompetenceShort } from '../../utils/dateUtils';
import { 
  CreditCard as CardIcon, 
  Plus, 
  ShoppingBag, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Receipt, 
  Search, 
  Edit3, 
  Clock, 
  ExternalLink,
  Sparkles,
  FileSpreadsheet,
  Trash2,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { 
  CreditCard as CreditCardType, 
  CreditCardPurchase, 
  BankAccount, 
  Counterparty, 
  ChartAccount
} from '../../types';
import { FinancialEngine, formatBRL } from '../../services/financialEngine';
import { storage } from '../../services/storageService';
import { CreditCardFormModal } from './CreditCardFormModal';
import { CreditCardPurchaseModal } from './CreditCardPurchaseModal';
import { CreditCardInvoicePaymentModal } from './CreditCardInvoicePaymentModal';
import { CreditCardInvoiceImportModal } from './CreditCardInvoiceImportModal';
import { Card, PageToolbar, Button, MoreMenu } from '../Common/ui';

interface CreditCardsViewProps {
  onNavigateToPayables?: () => void;
}

export const CreditCardsView: React.FC<CreditCardsViewProps> = ({ onNavigateToPayables }) => {
  const [cards, setCards] = useState<CreditCardType[]>(() => storage.getCreditCards());
  const [purchases, setPurchases] = useState<CreditCardPurchase[]>(() => storage.getCardPurchases());
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => storage.getBankAccounts());
  const [counterparties, setCounterparties] = useState<Counterparty[]>(() => storage.getCounterparties());
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>(() => storage.getChartAccounts());
  const [selectedCardId, setSelectedCardId] = useState<string>(() => {
    const loadedCards = storage.getCreditCards();
    return loadedCards.length > 0 ? loadedCards[0].id : '';
  });
  const [selectedInvoiceMonth, setSelectedInvoiceMonth] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState('');

  // Modals
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardType | null>(null);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<CreditCardPurchase | null>(null);
  const [initialPurchaseType, setInitialPurchaseType] = useState<'DESPESA' | 'ESTORNO' | 'CASHBACK'>('DESPESA');
  const [isPayInvoiceModalOpen, setIsPayInvoiceModalOpen] = useState(false);
  const [isImportInvoiceModalOpen, setIsImportInvoiceModalOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<CreditCardType | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<{ id: string; description: string; amount: number } | null>(null);

  const handleOpenNewPurchase = (type: 'DESPESA' | 'ESTORNO' = 'DESPESA') => {
    setEditingPurchase(null);
    setInitialPurchaseType(type);
    setIsPurchaseModalOpen(true);
  };

  const handleOpenEditPurchase = (purchaseId: string) => {
    const pur = purchases.find(p => p.id === purchaseId) || storage.getCardPurchases().find(p => p.id === purchaseId);
    if (pur) {
      setEditingPurchase(pur);
      setInitialPurchaseType(pur.transactionType || 'DESPESA');
      setIsPurchaseModalOpen(true);
    }
  };

  const loadData = () => {
    const loadedCards = storage.getCreditCards();
    const loadedPurchases = storage.getCardPurchases();
    const loadedBanks = storage.getBankAccounts();
    const loadedCounterparties = storage.getCounterparties();
    const loadedChartAccounts = storage.getChartAccounts();

    setCards(loadedCards);
    setPurchases(loadedPurchases);
    setBankAccounts(loadedBanks);
    setCounterparties(loadedCounterparties);
    setChartAccounts(loadedChartAccounts);

    if (loadedCards.length > 0) {
      if (!selectedCardId || !loadedCards.some(c => c.id === selectedCardId)) {
        setSelectedCardId(loadedCards[0].id);
      }
    }
  };

  useEffect(() => {
    return storage.subscribe(() => {
      loadData();
    });
  }, []);

  const activeCard = useMemo(() => {
    return cards.find(c => c.id === selectedCardId) || cards[0];
  }, [cards, selectedCardId]);

  // Invoices for active card
  const invoices = useMemo(() => {
    if (!activeCard) return [];
    return FinancialEngine.getCardInvoices(activeCard.id);
  }, [activeCard, purchases]);

  // Set default invoice month if not set
  useEffect(() => {
    if (invoices.length > 0) {
      if (!selectedInvoiceMonth || !invoices.some(inv => inv.invoiceMonth === selectedInvoiceMonth)) {
        const preferred = invoices.find(i => i.status !== 'PAGA' && i.totalAmount > 0) || invoices[0];
        setSelectedInvoiceMonth(preferred.invoiceMonth);
      }
    }
  }, [invoices, selectedInvoiceMonth]);

  const activeInvoice = useMemo(() => {
    return invoices.find(i => i.invoiceMonth === selectedInvoiceMonth) || invoices[0];
  }, [invoices, selectedInvoiceMonth]);

  // Purchases / Installments for active invoice
  const currentInvoiceItems = useMemo(() => {
    if (!activeCard || !selectedInvoiceMonth) return [];

    const items: Array<{
      purchaseId: string;
      transactionType?: 'DESPESA' | 'ESTORNO' | 'CASHBACK';
      purchaseDate: string;
      description: string;
      counterpartyName: string;
      chartAccountName: string;
      installmentNumber: number;
      totalInstallments: number;
      amount: number;
      dueDate: string;
      settled: boolean;
    }> = [];

    const cardPurchases = purchases.filter(p => p.cardId === activeCard.id);

    for (const pur of cardPurchases) {
      const chartAcc = chartAccounts.find(a => a.id === pur.chartAccountId);
      for (const inst of pur.installments) {
        if (inst.invoiceMonth === selectedInvoiceMonth) {
          items.push({
            purchaseId: pur.id,
            transactionType: pur.transactionType || 'DESPESA',
            purchaseDate: pur.purchaseDate,
            description: pur.description,
            counterpartyName: pur.counterpartyName || (pur.transactionType === 'ESTORNO' ? 'Estorno / Devolução' : 'Fornecedor'),
            chartAccountName: chartAcc ? `${chartAcc.code} - ${chartAcc.name}` : 'Despesas Gerais',
            installmentNumber: inst.installmentNumber,
            totalInstallments: inst.totalInstallments,
            amount: inst.amount,
            dueDate: inst.dueDate,
            settled: inst.settled
          });
        }
      }
    }

    if (!searchFilter.trim()) return items;

    const term = searchFilter.toLowerCase();
    return items.filter(it => 
      it.description.toLowerCase().includes(term) ||
      it.counterpartyName.toLowerCase().includes(term) ||
      it.chartAccountName.toLowerCase().includes(term)
    );
  }, [activeCard, purchases, selectedInvoiceMonth, chartAccounts, searchFilter]);

  // Invoice payment records
  const invoicePayments = useMemo(() => {
    if (!activeCard) return [];
    return storage.getCardInvoicePayments()
      .filter(p => p.cardId === activeCard.id)
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [activeCard]);

  const handleOpenNewCard = () => {
    setEditingCard(null);
    setIsCardModalOpen(true);
  };

  const handleEditCard = (card: CreditCardType) => {
    setEditingCard(card);
    setIsCardModalOpen(true);
  };

  const handleOpenPayInvoice = () => {
    if (activeInvoice) {
      setIsPayInvoiceModalOpen(true);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      <PageToolbar description="Compras à vista ou parceladas, faturas mensais e integração direta com o Contas a Pagar.">
        <MoreMenu
          items={[
            ...(onNavigateToPayables
              ? [{ label: 'Ver no Contas a Pagar', icon: <ExternalLink className="w-4 h-4" />, onClick: onNavigateToPayables }]
              : []),
            { label: 'Novo cartão', icon: <Plus className="w-4 h-4" />, onClick: handleOpenNewCard },
            ...(activeCard
              ? [{
                  label: 'Importar fatura (OFX, CSV ou PDF)',
                  icon: <FileSpreadsheet className="w-4 h-4" />,
                  onClick: () => setIsImportInvoiceModalOpen(true),
                  hint: 'Nubank, Itaú, C6, Inter, Bradesco'
                }]
              : []),
            ...(cards.length > 0
              ? [{
                  label: 'Lançar estorno ou crédito',
                  icon: <RotateCcw className="w-4 h-4" />,
                  onClick: () => handleOpenNewPurchase('ESTORNO'),
                  hint: 'Devolução ou cashback no cartão'
                }]
              : [])
          ]}
        />
        <Button
          id="btn-new-purchase"
          variant="primary"
          disabled={cards.length === 0}
          icon={<ShoppingBag className="w-4 h-4" />}
          onClick={() => handleOpenNewPurchase('DESPESA')}
        >
          Lançar compra no cartão
        </Button>
      </PageToolbar>

      {/* Cards Selector Bar (Visual Cards Carousel) ou Empty State */}
      {cards.length === 0 ? (
        <Card className="text-center max-w-xl mx-auto my-6 py-10">
          <div className="w-12 h-12 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-center mx-auto mb-4 text-[var(--text-secondary)]">
            <CardIcon className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <h3 className="mb-2">Nenhum cartão cadastrado</h3>
          <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto mb-6 leading-relaxed">
            Cadastre os cartões corporativos da empresa para acompanhar limites, faturas mensais, compras à vista ou parceladas e lançar tudo automaticamente no Contas a Pagar.
          </p>
          <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleOpenNewCard} className="mx-auto">
            Cadastrar primeiro cartão
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {cards.map(card => {
            const isSelected = activeCard?.id === card.id;
            const metrics = FinancialEngine.getCardAvailableLimit(card.id);
            const usedPercent = card.creditLimit > 0 ? Math.min(100, (metrics.used / card.creditLimit) * 100) : 0;

            return (
              <div
                key={card.id}
                onClick={() => setSelectedCardId(card.id)}
                className={`cursor-pointer rounded-2xl p-5 transition-all relative overflow-hidden border ${
                  isSelected 
                    ? 'ring-2 ring-amber-500 border-amber-500 shadow-lg shadow-amber-500/10 bg-white dark:bg-[#181F2C]' 
                    : 'border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316] hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                {/* Card Color Stripe */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: card.color || '#cdaa58' }}
                />

                <div className="flex items-start justify-between mb-4">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {card.institution || 'Banco Emissor'}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                      {card.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditCard(card);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                      title="Editar cartão"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCardToDelete(card);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                      title="Excluir cartão"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      •••• {card.lastFourDigits || '0000'}
                    </span>
                  </div>
                </div>

                {/* Balance & Limit Progress */}
                <div className="space-y-2 mb-3">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Limite Disponível:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatBRL(metrics.available)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-[#26262b]">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        usedPercent > 85 ? 'bg-rose-500' : usedPercent > 60 ? 'bg-amber-500' : 'bg-amber-400'
                      }`}
                      style={{ width: `${usedPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>Usado: {formatBRL(metrics.used)}</span>
                    <span>Total: {formatBRL(card.creditLimit)}</span>
                  </div>
                </div>

                {/* Dates */}
                <div className="pt-2 border-t border-slate-100 dark:border-[#26262b] flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Fecha dia <strong className="text-slate-700 dark:text-slate-200">{card.closingDay}</strong>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Vence dia <strong className="text-slate-700 dark:text-slate-200">{card.dueDay}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeCard && (
        <>
          {/* Active Card Invoice Management Workspace */}
          <div className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-2xl overflow-hidden shadow-2xs">
            {/* Months Tabs */}
            <div className="px-6 py-3 bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] flex items-center justify-between gap-4 overflow-x-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  Faturas Mensais:
                </span>
                <div className="flex items-center gap-1.5">
                  {invoices.map(inv => {
                    const isSelected = selectedInvoiceMonth === inv.invoiceMonth;
                    return (
                      <button
                        key={inv.invoiceMonth}
                        onClick={() => setSelectedInvoiceMonth(inv.invoiceMonth)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500 text-black shadow-xs font-bold'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span>{formatCompetenceShort(inv.invoiceMonth)}</span>
                        {inv.status === 'PAGA' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                        {inv.status === 'FECHADA' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        )}
                        {inv.status === 'ABERTA' && inv.totalAmount > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeInvoice && (
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    activeInvoice.status === 'PAGA'
                      ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                      : activeInvoice.status === 'FECHADA'
                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                  }`}>
                    {activeInvoice.status === 'PAGA' ? 'Fatura Paga' : activeInvoice.status === 'FECHADA' ? 'Fatura Fechada' : 'Fatura Aberta'}
                  </span>
                </div>
              )}
            </div>

            {/* Active Invoice Details Dashboard */}
            {activeInvoice && (
              <div className="p-6 border-b border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b]">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                      Total da fatura ({formatCompetenceShort(activeInvoice.invoiceMonth)})
                    </span>
                    <div className="text-xl font-bold text-slate-900 dark:text-white font-mono">
                      {formatBRL(activeInvoice.totalAmount)}
                    </div>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      {activeInvoice.itemsCount} {activeInvoice.itemsCount === 1 ? 'lançamento nesta fatura' : 'lançamentos nesta fatura'}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b]">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                      Saldo Restante a Pagar
                    </span>
                    <div className={`text-xl font-bold font-mono ${activeInvoice.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatBRL(activeInvoice.balance)}
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {activeInvoice.paidAmount > 0 ? `Já pago: ${formatBRL(activeInvoice.paidAmount)}` : 'Aguardando liquidação'}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b]">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-1">
                      Fechamento & Vencimento
                    </span>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Fecha: <span className="font-mono text-slate-600 dark:text-slate-300">{formatDateBR(activeInvoice.closingDate)}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1">
                      Vence: <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{formatDateBR(activeInvoice.dueDate)}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b] flex flex-col justify-center">
                    <button
                      id="btn-pay-invoice"
                      type="button"
                      disabled={activeInvoice.balance <= 0}
                      onClick={handleOpenPayInvoice}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all ${
                        activeInvoice.balance > 0
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:brightness-105 text-white shadow-emerald-900/20 active:scale-95 cursor-pointer'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {activeInvoice.balance > 0 ? 'Pagar Fatura' : 'Fatura Totalmente Paga'}
                    </button>
                    {activeInvoice.balance > 0 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 text-center block mt-1.5">
                        Debita de banco PJ e liquida no Contas a Pagar
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Purchases List in Current Invoice */}
            <div className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Lançamentos da fatura ({formatCompetenceShort(selectedInvoiceMonth)})
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({currentInvoiceItems.length})
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsImportInvoiceModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1.5 transition-colors shadow-2xs whitespace-nowrap"
                    title="Comparar com Fatura em PDF do Banco"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    Conciliar Fatura (PDF)
                  </button>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Buscar por fornecedor, descrição..."
                      className="w-full bg-white dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {currentInvoiceItems.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-[#1b1b20]/40 rounded-xl border border-slate-200 dark:border-[#26262b] text-slate-500 text-xs">
                  Nenhum lançamento encontrado nesta fatura ({formatCompetenceShort(selectedInvoiceMonth)}).
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-[#26262b] rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px] lg:min-w-full">
                    <thead className="bg-slate-50 dark:bg-[#1b1b20] text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-[#26262b]">
                      <tr>
                        <th className="p-3">Data</th>
                        <th className="p-3">Descrição do Lançamento</th>
                        <th className="hidden md:table-cell p-3">Estabelecimento / Favorecido</th>
                        <th className="hidden lg:table-cell p-3">Categoria</th>
                        <th className="p-3 text-center">Tipo / Parcela</th>
                        <th className="p-3 text-right">Valor nesta Fatura</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="hidden xl:table-cell p-3">Integração</th>
                        <th className="p-3 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#26262b] text-slate-700 dark:text-slate-300">
                      {currentInvoiceItems.map((item) => (
                        <tr key={`${item.purchaseId}-${item.installmentNumber}`} className="hover:bg-slate-50 dark:hover:bg-[#1b1b20]/60 transition-colors">
                          <td className="p-3 font-mono text-slate-500 dark:text-slate-400">
                            {item.purchaseDate}
                          </td>
                          <td className="p-3 font-semibold text-slate-900 dark:text-white">
                            {item.description}
                          </td>
                          <td className="hidden md:table-cell p-3 text-slate-700 dark:text-slate-300">
                            {item.counterpartyName}
                          </td>
                          <td className="hidden lg:table-cell p-3 text-slate-500 dark:text-slate-400">
                            {item.chartAccountName}
                          </td>
                          <td className="p-3 text-center">
                            {item.transactionType === 'ESTORNO' ? (
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 font-mono text-[10px] text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 font-bold">
                                ESTORNO
                              </span>
                            ) : item.transactionType === 'CASHBACK' ? (
                              <span className="px-2 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-950/60 font-mono text-[10px] text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-800 font-bold">
                                CASHBACK
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-[11px] text-amber-600 dark:text-amber-400 border border-slate-200 dark:border-slate-700 font-bold">
                                {item.installmentNumber}/{item.totalInstallments}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-mono font-bold">
                            {item.transactionType === 'ESTORNO' || item.transactionType === 'CASHBACK' ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                - {formatBRL(item.amount)}
                              </span>
                            ) : (
                              <span className="text-slate-900 dark:text-white">
                                {formatBRL(item.amount)}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              item.settled
                                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                                : 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                            }`}>
                              {item.settled ? 'LIQUIDADO' : 'EM ABERTO'}
                            </span>
                          </td>
                          <td className="hidden xl:table-cell p-3">
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Contas a Pagar
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditPurchase(item.purchaseId)}
                                className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Editar lançamento de cartão"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPurchaseToDelete({ id: item.purchaseId, description: item.description, amount: item.amount })}
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Excluir lançamento da fatura e parcelas no Contas a Pagar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Past Payments History for this Card */}
            {invoicePayments.length > 0 && (
              <div className="p-6 border-t border-slate-200 dark:border-[#26262b] bg-slate-50/50 dark:bg-[#131316]/40">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Histórico de Pagamentos de Faturas Anteriores
                  </h4>
                </div>

                <div className="border border-slate-200 dark:border-[#26262b] rounded-xl overflow-x-auto bg-white dark:bg-[#131316]">
                  <table className="w-full text-left text-xs min-w-[650px] lg:min-w-full">
                    <thead className="bg-slate-50 dark:bg-[#1b1b20] text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-[#26262b]">
                      <tr>
                        <th className="p-2.5">Data do Pagamento</th>
                        <th className="p-2.5">Fatura Referente</th>
                        <th className="p-2.5">Conta Bancária Debitada</th>
                        <th className="p-2.5 text-right">Valor Pago</th>
                        <th className="p-2.5">Responsável</th>
                        <th className="p-2.5">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#26262b] text-slate-700 dark:text-slate-300">
                      {invoicePayments.map(pay => {
                        const bank = bankAccounts.find(b => b.id === pay.bankAccountId);
                        return (
                          <tr key={pay.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="p-2.5 font-mono text-slate-500 dark:text-slate-400">{formatDateBR(pay.paymentDate)}</td>
                            <td className="p-2.5 font-bold text-slate-900 dark:text-white">{formatCompetenceShort(pay.invoiceMonth)}</td>
                            <td className="p-2.5 text-slate-700 dark:text-slate-300">{bank?.name || 'Conta PJ'}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              {formatBRL(pay.amountPaid)}
                            </td>
                            <td className="p-2.5 text-slate-500 dark:text-slate-400">{pay.createdBy || 'Sistema'}</td>
                            <td className="p-2.5 text-slate-500 dark:text-slate-400">{pay.notes || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <CreditCardFormModal
        isOpen={isCardModalOpen}
        onClose={() => setIsCardModalOpen(false)}
        bankAccounts={bankAccounts}
        editingCard={editingCard}
        onSuccess={loadData}
      />

      <CreditCardPurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => {
          setIsPurchaseModalOpen(false);
          setEditingPurchase(null);
        }}
        cards={cards}
        counterparties={counterparties}
        chartAccounts={chartAccounts}
        initialCardId={activeCard?.id}
        initialTransactionType={initialPurchaseType}
        editingPurchase={editingPurchase}
        onSuccess={loadData}
      />

      {activeCard && activeInvoice && (
        <CreditCardInvoicePaymentModal
          isOpen={isPayInvoiceModalOpen}
          onClose={() => setIsPayInvoiceModalOpen(false)}
          card={activeCard}
          invoiceMonth={activeInvoice.invoiceMonth}
          invoiceTotal={activeInvoice.totalAmount}
          invoiceBalance={activeInvoice.balance}
          dueDate={activeInvoice.dueDate}
          bankAccounts={bankAccounts}
          onSuccess={loadData}
        />
      )}

      {activeCard && isImportInvoiceModalOpen && (
        <CreditCardInvoiceImportModal
          isOpen={isImportInvoiceModalOpen}
          onClose={() => setIsImportInvoiceModalOpen(false)}
          card={activeCard}
          invoiceMonth={selectedInvoiceMonth || activeInvoice?.invoiceMonth || new Date().toISOString().slice(0, 7)}
          manualInvoiceItems={currentInvoiceItems}
          counterparties={counterparties}
          chartAccounts={chartAccounts}
          onSuccess={loadData}
        />
      )}

      {/* Modal de Confirmação de Exclusão de Cartão */}
      {cardToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div 
            className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-3xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-500 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Excluir Cartão de Crédito?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
              Você está prestes a excluir o cartão <strong className="text-slate-900 dark:text-white">{cardToDelete.name}</strong>. Esta ação removerá todas as compras associadas e cancelará os títulos em aberto gerados no Contas a Pagar.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setCardToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#26262b] rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  storage.deleteCreditCard(cardToDelete.id);
                  setCardToDelete(null);
                  loadData();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md transition-all cursor-pointer"
              >
                Sim, Excluir Cartão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Compra */}
      {purchaseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
          <div 
            className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-3xl w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-500 mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Excluir Lançamento de Compra?
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
              Deseja excluir a compra <strong className="text-slate-900 dark:text-white">{purchaseToDelete.description}</strong> no valor de <strong className="text-slate-900 dark:text-white">{formatBRL(purchaseToDelete.amount)}</strong>? As parcelas vinculadas serão removidas do Contas a Pagar.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPurchaseToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#26262b] rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  storage.deleteCardPurchase(purchaseToDelete.id);
                  setPurchaseToDelete(null);
                  loadData();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-md transition-all cursor-pointer"
              >
                Sim, Excluir Compra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
