import React, { useState, useMemo, useEffect } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { 
  X, 
  Landmark, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  RotateCcw, 
  History, 
  Save, 
  ArrowRight,
  Sparkles,
  Layers,
  Scale,
  DollarSign,
  Calendar,
  Clock,
  ShieldCheck,
  FileText,
  HelpCircle,
  Plus
} from 'lucide-react';
import { BankAccount, BankBalanceClosingRecord } from '../../types';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { storage } from '../../services/storageService';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface BankBalanceClosingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAccountId?: string;
  onSuccess?: () => void;
}

export const BankBalanceClosingModal: React.FC<BankBalanceClosingModalProps> = ({
  isOpen,
  onClose,
  defaultAccountId,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'conference' | 'history'>('conference');
  const [closingDate, setClosingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccountId || 'ALL');
  
  // Saldos declarados pelo usuário (Key: bankAccountId, Value: number)
  const [realBalances, setRealBalances] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<string>('Fechamento de conferência de saldos bancários');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string>('');
  const [errorToast, setErrorToast] = useState<string>('');

  const accounts = storage.getBankAccounts();
  const allStatements = storage.getStatementEntries();
  const allTitles = storage.getTitles();
  const closingHistory = storage.getBankClosingRecords();

  // Inicializa os saldos reais sugeridos com o saldo atual do sistema para conveniência
  useEffect(() => {
    if (isOpen) {
      const initialMap: Record<string, number> = {};
      accounts.forEach(acc => {
        const sysBal = FinancialEngine.calculateAccountBalance(acc.id);
        // Se já tiver digitado mantém, caso contrário inicializa com o saldo atual do sistema
        initialMap[acc.id] = realBalances[acc.id] !== undefined ? realBalances[acc.id] : Math.round(sysBal * 100) / 100;
      });
      setRealBalances(initialMap);
      if (defaultAccountId) {
        setSelectedAccountId(defaultAccountId);
      }
    }
  }, [isOpen, defaultAccountId]);

  // Contas filtradas para conferência
  const visibleAccounts = useMemo(() => {
    if (selectedAccountId === 'ALL') {
      return accounts.filter(a => a.status === 'ATIVO');
    }
    return accounts.filter(a => a.id === selectedAccountId);
  }, [accounts, selectedAccountId]);

  // Cálculos de saldo por conta
  const accountsData = useMemo(() => {
    return visibleAccounts.map(acc => {
      const systemBalance = Math.round(FinancialEngine.calculateAccountBalance(acc.id) * 100) / 100;
      const realBalance = realBalances[acc.id] !== undefined ? realBalances[acc.id] : systemBalance;
      const difference = Math.round((realBalance - systemBalance) * 100) / 100;

      // Status
      let status: 'PERFEITO' | 'SOBRA' | 'FALTA' = 'PERFEITO';
      if (difference > 0.005) {
        status = 'SOBRA';
      } else if (difference < -0.005) {
        status = 'FALTA';
      }

      // Diagnóstico: extratos pendentes
      const pendingStmts = allStatements.filter(
        s => s.bankAccountId === acc.id && s.reconciliationStatus !== 'CONCILIADO'
      );
      const pendingStmtsTotal = pendingStmts.reduce((sum, s) => sum + (s.amount || 0), 0);

      // Diagnóstico: títulos em aberto previstos nesta conta
      const openTitles = allTitles.filter(
        t => t.expectedBankAccountId === acc.id && t.settlementState !== 'LIQUIDADO' && t.documentState !== 'CANCELADO'
      );
      const openTitlesTotal = openTitles.reduce((sum, t) => sum + (t.balancePrincipal || t.originalAmount || 0), 0);

      return {
        account: acc,
        systemBalance,
        realBalance,
        difference,
        status,
        pendingStmtsCount: pendingStmts.length,
        pendingStmtsTotal,
        openTitlesCount: openTitles.length,
        openTitlesTotal
      };
    });
  }, [visibleAccounts, realBalances, allStatements, allTitles]);

  // Totais consolidados
  const consolidated = useMemo(() => {
    const totalSystem = accountsData.reduce((sum, item) => sum + item.systemBalance, 0);
    const totalReal = accountsData.reduce((sum, item) => sum + item.realBalance, 0);
    const totalDifference = Math.round((totalReal - totalSystem) * 100) / 100;
    const isAllPerfect = accountsData.every(item => Math.abs(item.difference) < 0.005);

    return {
      totalSystem,
      totalReal,
      totalDifference,
      isAllPerfect
    };
  }, [accountsData]);

  // Atualizar saldo real digitado pelo usuário
  const handleBalanceChange = (accountId: string, valueStr: string) => {
    const num = parseFloat(valueStr);
    setRealBalances(prev => ({
      ...prev,
      [accountId]: isNaN(num) ? 0 : num
    }));
  };

  // Salvar conferência de fechamento
  const handleSaveClosing = () => {
    setIsSubmitting(true);
    setErrorToast('');
    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentUser = storage.getCurrentUser();

      const newRecords: BankBalanceClosingRecord[] = accountsData.map(item => ({
        id: `close-${Date.now()}-${item.account.id}`,
        bankAccountId: item.account.id,
        closingDate,
        closingTime: timeStr,
        closedBy: currentUser.name || 'Administrador',
        systemBalance: item.systemBalance,
        realBalance: item.realBalance,
        difference: item.difference,
        status: item.status,
        notes,
        pendingStatementsCount: item.pendingStmtsCount,
        pendingTitlesCount: item.openTitlesCount,
        createdAt: now.toISOString()
      }));

      // Salva cada registro no storage
      newRecords.forEach(rec => storage.saveBankClosingRecord(rec));

      // Auditoria
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'FECHAMENTO_SALDO_BANCARIO',
        module: 'Conciliação Bancária',
        recordId: newRecords[0]?.id || 'closing',
        details: `Conferência de saldos bancários realizada em ${formatDateBR(closingDate)}. ${
          consolidated.isAllPerfect 
            ? '✓ Fechamento 100% perfeito (sem divergências).' 
            : `Divergência apurada de ${formatBRL(consolidated.totalDifference)}.`
        }`
      });

      setSuccessToast(
        consolidated.isAllPerfect 
          ? '🎉 Fechamento Perfeito gravado com sucesso! Todos os saldos batem 100% com o banco.' 
          : 'Conferência de saldos gravada com sucesso no histórico de auditoria!'
      );

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        setSuccessToast('');
      }, 5000);
    } catch (err: any) {
      setErrorToast(`Erro ao gravar fechamento: ${err.message || 'Falha inesperada'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        
        {/* Header com identidade visual Leão Dourado */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400 shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Conferência de Saldos Bancários & Fechamento Perfeito
                </h2>
                <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                  Bancos & Caixa
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Compare o saldo registrado no sistema com o saldo real que você tem no banco e identifique valores faltando ou passando.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Abas */}
            <div className="flex bg-slate-200 dark:bg-[#131316] p-0.5 rounded-xl border border-slate-300 dark:border-[#26262b] text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('conference')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'conference'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Conferência Atual
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Histórico ({closingHistory.length})</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-[#26262b] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Banners */}
        {successToast && (
          <div className="mx-5 mt-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              {successToast}
            </span>
            <button onClick={() => setSuccessToast('')} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
        )}

        {errorToast && (
          <div className="mx-5 mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-800 dark:text-rose-300 font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
              {errorToast}
            </span>
            <button onClick={() => setErrorToast('')} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
        )}

        {/* Conteúdo da Modal */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">

          {activeTab === 'conference' ? (
            <>
              {/* Filtros e Controles de Conferência */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 dark:bg-[#1b1b20] p-3.5 rounded-xl border border-slate-200 dark:border-[#26262b]">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Data da Conferência
                    </label>
                    <DateField
                      value={closingDate}
                      onChange={e => setClosingDate(e.target.value)}
                      className="rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Filtrar Conta
                    </label>
                    <PremiumSelect
                      value={selectedAccountId}
                      onChange={e => setSelectedAccountId(e.target.value)}
                      className="rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="ALL">Todas as Contas (Fechamento Global)</option>
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.institution})
                        </option>
                      ))}
                    </PremiumSelect>
                  </div>
                </div>

                {/* Banner de Status Consolidado */}
                <div className="flex items-center gap-3 self-end sm:self-auto">
                  {consolidated.isAllPerfect ? (
                    <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block">
                          Fechamento Perfeito
                        </span>
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                          Saldos 100% equalizados
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-amber-900 dark:text-amber-300 block">
                          Divergência Total: {formatBRL(consolidated.totalDifference)}
                        </span>
                        <span className="text-[10px] text-slate-600 dark:text-slate-400">
                          {consolidated.totalDifference > 0 ? 'Passando no banco' : 'Faltando no banco'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tabela Comparativa de Bancos (Sistema vs Real que Tenho) */}
              <div className="bg-white dark:bg-[#131316] rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs overflow-hidden">
                <div className="p-3.5 bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-amber-500" />
                    Comparativo por Banco / Conta Corrente
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Digite no campo "Saldo que Tenho" o valor que consta no extrato ou aplicativo do banco
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-[#26262b]">
                  {accountsData.map(item => (
                    <div key={item.account.id} className="p-4 hover:bg-slate-50 dark:hover:bg-[#1b1b20]/40 transition-colors">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                        
                        {/* Identificação do Banco */}
                        <div className="lg:col-span-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 font-bold text-xs">
                              {item.account.institution.slice(0, 3).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                                <span>{item.account.name}</span>
                                <span className="text-[10px] text-slate-500 font-normal">
                                  ({item.account.type})
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">
                                Ag: {item.account.agency || '0001'} • CC: {item.account.accountNumber || '00000'}
                              </div>
                            </div>
                          </div>

                          {/* Diagnóstico rápido */}
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                            {item.pendingStmtsCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                ⚡ {item.pendingStmtsCount} extratos pendentes ({formatBRL(item.pendingStmtsTotal)})
                              </span>
                            ) : (
                              <span className="text-slate-400">✓ Extrato zerado</span>
                            )}
                            {item.openTitlesCount > 0 && (
                              <span className="text-slate-500 dark:text-slate-400">
                                • {item.openTitlesCount} títulos em aberto ({formatBRL(item.openTitlesTotal)})
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Saldo no Sistema (ERP) */}
                        <div className="lg:col-span-2 text-left lg:text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">
                            Saldo no Sistema (ERP)
                          </span>
                          <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                            {formatBRL(item.systemBalance)}
                          </span>
                        </div>

                        {/* Saldo que Tenho no Banco (Input Editável) */}
                        <div className="lg:col-span-3">
                          <label className="block text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 mb-1">
                            Saldo que Tenho no Banco (R$) *
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                            <MoneyField value={parseFloat(String(item.realBalance)) || 0} onChange={(v: number) => handleBalanceChange(item.account.id, String(v))} className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-amber-500/40 bg-white dark:bg-[#131316] font-mono font-bold text-sm text-slate-900 dark:text-amber-400 focus:ring-2 focus:ring-amber-500 focus:outline-none" allowNegative />
                          </div>
                        </div>

                        {/* Diferença Apurada & Status */}
                        <div className="lg:col-span-3 text-left lg:text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">
                            Divergência (Real - Sistema)
                          </span>
                          <div className="flex lg:justify-end items-center gap-1.5 mt-0.5">
                            {item.status === 'PERFEITO' ? (
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                R$ 0,00
                              </span>
                            ) : item.status === 'SOBRA' ? (
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-600 dark:text-amber-400 text-sm">
                                <TrendingUp className="w-4 h-4 text-amber-500" />
                                +{formatBRL(item.difference)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
                                <TrendingDown className="w-4 h-4 text-rose-500" />
                                {formatBRL(item.difference)}
                              </span>
                            )}
                          </div>

                          {/* Mensagem Explicativa */}
                          <div className="text-[11px] mt-1 font-medium">
                            {item.status === 'PERFEITO' && (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                Fechamento 100% exato!
                              </span>
                            )}
                            {item.status === 'SOBRA' && (
                              <span className="text-amber-700 dark:text-amber-400" title="Possíveis recebimentos do dia ainda não baixados ou registrados no sistema">
                                Sobrando no banco (falta lançar entradas)
                              </span>
                            )}
                            {item.status === 'FALTA' && (
                              <span className="text-rose-700 dark:text-rose-400" title="Possíveis despesas, tarifas ou saídas que caíram no banco mas ainda não foram baixadas no sistema">
                                Faltando no banco (falta lançar saídas/tarifas)
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>
                  ))}
                </div>

                {/* Linha de Totalização Geral */}
                <div className="p-4 bg-amber-500/10 dark:bg-amber-500/5 border-t border-amber-500/20 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  <div className="lg:col-span-4">
                    <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider block">
                      Total Consolidado da Conferência
                    </span>
                    <span className="text-[11px] text-slate-600 dark:text-slate-400">
                      Soma de todas as contas ativas listadas
                    </span>
                  </div>

                  <div className="lg:col-span-2 text-left lg:text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Sistema</span>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                      {formatBRL(consolidated.totalSystem)}
                    </span>
                  </div>

                  <div className="lg:col-span-3 text-left lg:text-right">
                    <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 block">Total Real Declarado</span>
                    <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">
                      {formatBRL(consolidated.totalReal)}
                    </span>
                  </div>

                  <div className="lg:col-span-3 text-left lg:text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Divergência Total</span>
                    <span className={`font-mono font-bold text-base ${
                      consolidated.isAllPerfect 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : (consolidated.totalDifference > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400')
                    }`}>
                      {consolidated.isAllPerfect ? 'R$ 0,00 (Perfeito)' : formatBRL(consolidated.totalDifference)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notas do Fechamento */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Observações & Anotações do Fechamento
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ex: Conferência diária de encerramento do dia, saldos conferidos via aplicativo..."
                  className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Dicas para Alcançar o Fechamento Perfeito */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b] text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Como resolver divergências e fazer o fechamento perfeito:
                </span>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>
                    <strong>Se a diferença for positiva (Sobrando no banco):</strong> verifique se houve entradas por PIX ou transferências no extrato que ainda não foram conciliadas no menu Conciliação Bancária.
                  </li>
                  <li>
                    <strong>Se a diferença for negativa (Faltando no banco):</strong> verifique tarifas bancárias, juros de limite, débitos automáticos ou pagamentos feitos no banco que ainda não foram baixados no Contas a Pagar.
                  </li>
                  <li>
                    Importe o arquivo <strong>OFX</strong> atualizado do banco na tela de Conciliação para casar todos os lançamentos pendentes com 1 clique!
                  </li>
                </ul>
              </div>
            </>
          ) : (
            /* Histórico de Fechamentos Anteriores */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Histórico de Conferências Gravadas ({closingHistory.length})
                </span>
                <span className="text-[11px] text-slate-500">
                  Rastreabilidade e auditoria de fechamento
                </span>
              </div>

              {closingHistory.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b]">
                  Nenhum fechamento salvo anteriormente. Realize a conferência na aba "Conferência Atual" e clique em "Salvar Conferência de Fechamento".
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#26262b]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] text-slate-700 dark:text-slate-300 font-semibold uppercase text-[10px]">
                      <tr>
                        <th className="py-3 px-4">Data / Hora</th>
                        <th className="py-3 px-4">Conta Bancária</th>
                        <th className="py-3 px-4 text-right">Saldo Sistema</th>
                        <th className="py-3 px-4 text-right">Saldo Real</th>
                        <th className="py-3 px-4 text-right">Diferença</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4">Responsável / Obs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#26262b]">
                      {closingHistory.map(rec => {
                        const acc = accounts.find(a => a.id === rec.bankAccountId);
                        return (
                          <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-[#1b1b20]/50 transition-colors">
                            <td className="py-3 px-4 font-mono">
                              <div>{formatDateBR(rec.closingDate)}</div>
                              <div className="text-[10px] text-slate-500">{rec.closingTime}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {acc?.name || 'Conta Bancária'}
                              </span>
                              <div className="text-[10px] text-slate-500">{acc?.institution}</div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                              {formatBRL(rec.systemBalance)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                              {formatBRL(rec.realBalance)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold">
                              {Math.abs(rec.difference) < 0.005 ? (
                                <span className="text-emerald-600 dark:text-emerald-400">R$ 0,00</span>
                              ) : rec.difference > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400">+{formatBRL(rec.difference)}</span>
                              ) : (
                                <span className="text-rose-600 dark:text-rose-400">{formatBRL(rec.difference)}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {rec.status === 'PERFEITO' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                                  ✓ PERFEITO
                                </span>
                              ) : rec.status === 'SOBRA' ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                  SOBRANDO
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30">
                                  FALTANDO
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-[11px] text-slate-600 dark:text-slate-400">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">{rec.closedBy}</div>
                              {rec.notes && <div className="text-[10px] text-slate-500 truncate max-w-xs">{rec.notes}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Rodapé Fixo de Ações */}
        <div className="p-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#26262b] rounded-xl transition-colors cursor-pointer"
          >
            Fechar
          </button>

          {activeTab === 'conference' && (
            <button
              type="button"
              onClick={handleSaveClosing}
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-black stroke-[2.5]" />
              <span>Salvar Conferência de Fechamento</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
