import React, { useState, useMemo } from 'react';
import { 
  X, 
  Calculator, 
  Coins, 
  Banknote, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  RotateCcw, 
  History, 
  Save, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { BankAccount, CashDenominations, CashCountRecord } from '../../types';
import { FinancialEngine, formatBRL } from '../../services/financialEngine';
import { storage } from '../../services/storageService';

interface CashCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccount: BankAccount;
  onSuccess?: () => void;
}

const BILL_DENOMINATIONS: Array<{ key: keyof CashDenominations['bills']; value: number; label: string; color: string }> = [
  { key: '200', value: 200, label: 'R$ 200', color: 'bg-stone-800 text-amber-200 border-amber-700/40' },
  { key: '100', value: 100, label: 'R$ 100', color: 'bg-slate-800/80 text-slate-200 border-slate-600/50' },
  { key: '50', value: 50, label: 'R$ 50', color: 'bg-amber-950/60 text-amber-300 border-amber-700/40' },
  { key: '20', value: 20, label: 'R$ 20', color: 'bg-yellow-950/60 text-yellow-300 border-yellow-700/40' },
  { key: '10', value: 10, label: 'R$ 10', color: 'bg-red-950/60 text-red-300 border-red-700/40' },
  { key: '5', value: 5, label: 'R$ 5', color: 'bg-amber-950/60 text-amber-300 border-amber-700/40' },
  { key: '2', value: 2, label: 'R$ 2', color: 'bg-blue-950/60 text-blue-300 border-blue-700/40' }
];

const COIN_DENOMINATIONS: Array<{ key: keyof CashDenominations['coins']; value: number; label: string }> = [
  { key: '1', value: 1.00, label: 'R$ 1,00' },
  { key: '0.50', value: 0.50, label: 'R$ 0,50' },
  { key: '0.25', value: 0.25, label: 'R$ 0,25' },
  { key: '0.10', value: 0.10, label: 'R$ 0,10' },
  { key: '0.05', value: 0.05, label: 'R$ 0,05' },
  { key: '0.01', value: 0.01, label: 'R$ 0,01' }
];

export const CashCalculatorModal: React.FC<CashCalculatorModalProps> = ({
  isOpen,
  onClose,
  bankAccount,
  onSuccess
}) => {
  const [bills, setBills] = useState<Record<string, number>>({
    '200': 0,
    '100': 0,
    '50': 0,
    '20': 0,
    '10': 0,
    '5': 0,
    '2': 0
  });

  const [coins, setCoins] = useState<Record<string, number>>({
    '1': 0,
    '0.50': 0,
    '0.25': 0,
    '0.10': 0,
    '0.05': 0,
    '0.01': 0
  });

  const [adjustReason, setAdjustReason] = useState<string>('Conferência física diária de expediente');
  const [activeTab, setActiveTab] = useState<'calculator' | 'history'>('calculator');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Recalculate system balance dynamically
  const systemBalance = useMemo(() => {
    return FinancialEngine.calculateAccountBalance(bankAccount.id);
  }, [bankAccount.id, isOpen]);

  // Calculate bill totals
  const totalBills = useMemo(() => {
    return BILL_DENOMINATIONS.reduce((sum, item) => {
      const count = bills[item.key] || 0;
      return sum + (count * item.value);
    }, 0);
  }, [bills]);

  // Calculate coin totals
  const totalCoins = useMemo(() => {
    return COIN_DENOMINATIONS.reduce((sum, item) => {
      const count = coins[item.key] || 0;
      return sum + (count * item.value);
    }, 0);
  }, [coins]);

  const totalPhysical = useMemo(() => {
    return totalBills + totalCoins;
  }, [totalBills, totalCoins]);

  // Difference: Physical - System
  const difference = useMemo(() => {
    return Math.round((totalPhysical - systemBalance) * 100) / 100;
  }, [totalPhysical, systemBalance]);

  // History for this bank account
  const historyRecords = useMemo(() => {
    return storage.getCashCounts()
      .filter(c => c.bankAccountId === bankAccount.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [bankAccount.id, successMessage, isOpen]);

  if (!isOpen) return null;

  const handleBillChange = (key: string, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setBills(prev => ({ ...prev, [key]: num }));
  };

  const handleAddBill = (key: string, delta: number) => {
    setBills(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta)
    }));
  };

  const handleCoinChange = (key: string, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setCoins(prev => ({ ...prev, [key]: num }));
  };

  const handleAddCoin = (key: string, delta: number) => {
    setCoins(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta)
    }));
  };

  const handleResetAll = () => {
    setBills({
      '200': 0, '100': 0, '50': 0, '20': 0, '10': 0, '5': 0, '2': 0
    });
    setCoins({
      '1': 0, '0.50': 0, '0.25': 0, '0.10': 0, '0.05': 0, '0.01': 0
    });
    setSuccessMessage(null);
  };

  const handleApplyAdjustment = () => {
    setIsSubmitting(true);
    const currentUser = storage.getCurrentUser();
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);

    const record: CashCountRecord = {
      id: `cnt-${Date.now()}`,
      bankAccountId: bankAccount.id,
      date: dateStr,
      time: timeStr,
      countedBy: currentUser.name,
      bills: {
        '200': bills['200'] || 0,
        '100': bills['100'] || 0,
        '50': bills['50'] || 0,
        '20': bills['20'] || 0,
        '10': bills['10'] || 0,
        '5': bills['5'] || 0,
        '2': bills['2'] || 0
      },
      coins: {
        '1': coins['1'] || 0,
        '0.50': coins['0.50'] || 0,
        '0.25': coins['0.25'] || 0,
        '0.10': coins['0.10'] || 0,
        '0.05': coins['0.05'] || 0,
        '0.01': coins['0.01'] || 0
      },
      totalBills,
      totalCoins,
      totalPhysical,
      systemBalance,
      difference,
      status: difference === 0 ? 'EQUILIBRADO' : difference > 0 ? 'SOBRA' : 'FALTA',
      notes: adjustReason,
      adjustedInSystem: true,
      createdAt: now.toISOString()
    };

    const res = FinancialEngine.applyCashCountAdjustment({
      bankAccountId: bankAccount.id,
      countRecord: record,
      adjustReason
    });

    setIsSubmitting(false);

    if (res.success) {
      setSuccessMessage(
        difference === 0 
          ? 'Contagem física salva! Caixa 100% equilibrado com o sistema.'
          : `Caixa físico atualizado com sucesso! Lançamento de ajuste de ${formatBRL(Math.abs(difference))} (${difference > 0 ? 'Sobra' : 'Quebra/Falta'}) efetuado no sistema.`
      );
      if (onSuccess) onSuccess();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Calculadora de Caixa Físico (Cédulas & Moedas)
                </h3>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {bankAccount.name}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Conte cédulas e moedas em espécie, confronte com o saldo contábil e equalize divergências automaticamente.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View switcher */}
            <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700/60 text-xs">
              <button
                id="btn-tab-calc"
                onClick={() => setActiveTab('calculator')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  activeTab === 'calculator' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Calculadora
              </button>
              <button
                id="btn-tab-hist"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
                  activeTab === 'history' 
                    ? 'bg-emerald-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                Histórico ({historyRecords.length})
              </button>
            </div>

            <button
              id="btn-close-cash-calc"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Banner */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl flex items-center justify-between text-sm text-emerald-200 animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-xs text-emerald-300 underline hover:text-white"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'calculator' ? (
            <>
              {/* Top Confrontation Summary Banner */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
                <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                  <span className="text-[11px] font-medium text-slate-400 block mb-1">
                    Saldo no Sistema
                  </span>
                  <div className="text-lg font-bold text-slate-100">
                    {formatBRL(systemBalance)}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Saldo atual em contas/movimentos
                  </span>
                </div>

                <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800">
                  <span className="text-[11px] font-medium text-slate-400 block mb-1">
                    Cédulas + Moedas
                  </span>
                  <div className="text-lg font-bold text-emerald-400">
                    {formatBRL(totalPhysical)}
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Cédulas: {formatBRL(totalBills)} | Moedas: {formatBRL(totalCoins)}
                  </span>
                </div>

                <div className={`p-3 rounded-lg border col-span-1 md:col-span-2 flex flex-col justify-between ${
                  difference === 0 
                    ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300' 
                    : difference > 0 
                      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300' 
                      : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      {difference === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {difference > 0 && <TrendingUp className="w-4 h-4 text-amber-400" />}
                      {difference < 0 && <TrendingDown className="w-4 h-4 text-rose-400" />}
                      Confronto Físico vs. Sistema
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                      difference === 0 
                        ? 'bg-emerald-500/20 text-emerald-300' 
                        : difference > 0 
                          ? 'bg-amber-500/20 text-amber-300' 
                          : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {difference === 0 ? 'EQUILIBRADO' : difference > 0 ? 'SOBRA DE CAIXA' : 'FALTA / QUEBRA'}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-2">
                    <div className="text-2xl font-black">
                      {difference > 0 && '+'}
                      {formatBRL(difference)}
                    </div>
                    <span className="text-xs text-slate-400">
                      {difference === 0 
                        ? 'Contagem física coincide com o sistema.' 
                        : difference > 0 
                          ? 'Valor físico excede o cadastrado no sistema.' 
                          : 'Valor físico inferior ao cadastrado no sistema.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Denominations Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Bills Column (7 cols) */}
                <div className="lg:col-span-7 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-400" />
                      <h4 className="font-semibold text-sm text-slate-200">
                        Cédulas de Papel-Moeda
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      Subtotal: {formatBRL(totalBills)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {BILL_DENOMINATIONS.map(item => {
                      const count = bills[item.key] || 0;
                      const subtotal = count * item.value;

                      return (
                        <div 
                          key={item.key}
                          className="flex items-center justify-between bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-[120px]">
                            <span className={`px-2.5 py-1 text-xs font-bold font-mono rounded border ${item.color}`}>
                              {item.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAddBill(item.key, -1)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold active:scale-95"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={count === 0 ? '' : count}
                              placeholder="0"
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              onChange={(e) => handleBillChange(item.key, e.target.value)}
                              className="w-16 text-center font-mono text-sm font-semibold bg-slate-900 border border-slate-700 rounded py-1 text-white focus:outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddBill(item.key, 1)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold active:scale-95"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddBill(item.key, 5)}
                              className="px-1.5 h-7 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                            >
                              +5
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddBill(item.key, 10)}
                              className="px-1.5 h-7 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                            >
                              +10
                            </button>
                          </div>

                          <div className="w-24 text-right">
                            <span className={`font-mono text-xs font-semibold ${count > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {formatBRL(subtotal)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Coins Column (5 cols) */}
                <div className="lg:col-span-5 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-amber-400" />
                      <h4 className="font-semibold text-sm text-slate-200">
                        Moedas Metálicas
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      Subtotal: {formatBRL(totalCoins)}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {COIN_DENOMINATIONS.map(item => {
                      const count = coins[item.key] || 0;
                      const subtotal = count * item.value;

                      return (
                        <div 
                          key={item.key}
                          className="flex items-center justify-between bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-[90px]">
                            <span className="px-2 py-0.5 text-xs font-bold font-mono rounded bg-amber-950/40 border border-amber-800/30 text-amber-200">
                              {item.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAddCoin(item.key, -1)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold active:scale-95"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={count === 0 ? '' : count}
                              placeholder="0"
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              onChange={(e) => handleCoinChange(item.key, e.target.value)}
                              className="w-14 text-center font-mono text-sm font-semibold bg-slate-900 border border-slate-700 rounded py-1 text-white focus:outline-none focus:border-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddCoin(item.key, 1)}
                              className="w-7 h-7 flex items-center justify-center rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold active:scale-95"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddCoin(item.key, 5)}
                              className="px-1.5 h-7 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                            >
                              +5
                            </button>
                          </div>

                          <div className="w-20 text-right">
                            <span className={`font-mono text-xs font-semibold ${count > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                              {formatBRL(subtotal)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Justification & Adjustment Section */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Observação ou Motivo da Conferência:
                  </label>
                  <button
                    type="button"
                    onClick={handleResetAll}
                    className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 self-start sm:self-auto"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Zerar contagem
                  </button>
                </div>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Ex: Conferência do turno da tarde, fechamento de gaveta, auditoria quinzenal..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </>
          ) : (
            /* History Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  Histórico de Contagens Físicas Realizadas
                </h4>
                <span className="text-xs text-slate-400">
                  Total de {historyRecords.length} contagens registradas
                </span>
              </div>

              {historyRecords.length === 0 ? (
                <div className="p-8 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                  Nenhuma contagem física registrada para este caixa físico ainda.
                </div>
              ) : (
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3">Data / Hora</th>
                        <th className="p-3">Responsável</th>
                        <th className="p-3 text-right">Cédulas</th>
                        <th className="p-3 text-right">Moedas</th>
                        <th className="p-3 text-right">Total Físico</th>
                        <th className="p-3 text-right">Saldo Sistema</th>
                        <th className="p-3 text-right">Diferença</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {historyRecords.map(rec => (
                        <tr key={rec.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3 font-mono font-medium text-slate-300">
                            {rec.date} <span className="text-slate-500">{rec.time}</span>
                          </td>
                          <td className="p-3 text-slate-300 font-medium">
                            {rec.countedBy}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">
                            {formatBRL(rec.totalBills)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">
                            {formatBRL(rec.totalCoins)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-white">
                            {formatBRL(rec.totalPhysical)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-400">
                            {formatBRL(rec.systemBalance)}
                          </td>
                          <td className={`p-3 text-right font-mono font-bold ${
                            rec.difference === 0 
                              ? 'text-emerald-400' 
                              : rec.difference > 0 
                                ? 'text-amber-400' 
                                : 'text-rose-400'
                          }`}>
                            {rec.difference > 0 && '+'}
                            {formatBRL(rec.difference)}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rec.status === 'EQUILIBRADO'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : rec.status === 'SOBRA'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              {rec.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400 max-w-xs truncate" title={rec.notes}>
                            {rec.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Fechar
          </button>

          {activeTab === 'calculator' && (
            <div className="flex items-center gap-3">
              <button
                id="btn-apply-cash-adjustment"
                type="button"
                disabled={isSubmitting || (totalPhysical === 0 && systemBalance === 0)}
                onClick={handleApplyAdjustment}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-lg transition-all ${
                  difference === 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                    : difference > 0
                      ? 'bg-amber-500 hover:bg-amber-400 text-[#18181b] shadow-amber-900/40 font-bold'
                      : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                } disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
              >
                <Save className="w-4 h-4" />
                {difference === 0
                  ? 'Salvar Conferência de Caixa (Equilibrado)'
                  : difference > 0
                    ? `Atualizar Caixa no Sistema (Ajustar Sobra de ${formatBRL(difference)})`
                    : `Atualizar Caixa no Sistema (Ajustar Falta de ${formatBRL(Math.abs(difference))})`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
