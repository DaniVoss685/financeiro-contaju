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
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string>('');
  const [errorToast, setErrorToast] = useState<string>('');
  const [savedSummary, setSavedSummary] = useState<{ date: string; time: string; items: { name: string; status: string; difference: number }[] } | null>(null);

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
        notes: notes.trim() || 'Conferência de saldos',
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

      setSavedSummary({
        date: closingDate,
        time: timeStr,
        items: accountsData.map(item => ({ name: item.account.name, status: item.status, difference: item.difference }))
      });

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
                  Conferir com o banco
                </h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Compare o saldo do sistema com o do banco.
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
                Conferir
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
              {/* Data e conta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Data da conferência</label>
                  <DateField
                    value={closingDate}
                    onChange={e => setClosingDate(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Conta</label>
                  <PremiumSelect
                    value={selectedAccountId}
                    onChange={e => setSelectedAccountId(e.target.value)}
                    className="w-full h-11 rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="ALL">Todas as contas</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </PremiumSelect>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)]">
                Digite o saldo que aparece no seu banco. O sistema mostra se bate com o que está registrado.
              </p>

              {/* Uma linha limpa por conta */}
              <div className="space-y-3">
                {accountsData.map(item => (
                  <div key={item.account.id} className="rounded-2xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316] p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                        <Landmark className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="block font-semibold text-slate-900 dark:text-white">{item.account.name}</span>
                        {(() => {
                          const last = closingHistory
                            .filter(r => r.bankAccountId === item.account.id)
                            .sort((a, b) => (b.closingDate + b.closingTime).localeCompare(a.closingDate + a.closingTime))[0];
                          return (
                            <span className="block text-xs text-[var(--text-muted)]">
                              {last
                                ? `Última conferência: ${formatDateBR(last.closingDate)} — ${Math.abs(last.difference) < 0.005 ? 'bateu certinho' : last.difference > 0 ? `sobravam ${formatBRL(last.difference)}` : `faltavam ${formatBRL(Math.abs(last.difference))}`}`
                                : 'Ainda não foi conferida'}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                      <div>
                        <span className="block text-sm text-[var(--text-secondary)] mb-1.5">No sistema</span>
                        <span className="block h-11 leading-[2.75rem] font-semibold tabular-nums text-slate-900 dark:text-white">{formatBRL(item.systemBalance)}</span>
                      </div>
                      <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1.5">No banco (R$)</label>
                        <MoneyField value={parseFloat(String(item.realBalance)) || 0} onChange={(v: number) => handleBalanceChange(item.account.id, String(v))} className="w-full h-11 px-3.5 rounded-xl border border-amber-500/40 bg-white dark:bg-[#131316] font-semibold text-sm text-slate-900 dark:text-amber-400 focus:ring-2 focus:ring-amber-500 focus:outline-none" allowNegative />
                      </div>
                      <div>
                        <span className="block text-sm text-[var(--text-secondary)] mb-1.5">Resultado</span>
                        {item.status === 'PERFEITO' ? (
                          <span className="inline-flex items-center gap-1.5 h-11 font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" /> Bateu certinho
                          </span>
                        ) : (
                          <span className={`block h-11 leading-[2.75rem] font-semibold tabular-nums ${item.status === 'SOBRA' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {item.status === 'SOBRA' ? 'Sobra ' : 'Falta '}{formatBRL(Math.abs(item.difference))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Só aparece quando há diferença */}
              {!consolidated.isAllPerfect && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 text-sm text-[var(--text-secondary)] space-y-1.5">
                  <span className="font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" /> Como achar a diferença
                  </span>
                  <p>
                    {consolidated.totalDifference > 0
                      ? 'Sobrando no banco: veja se entrou algum PIX ou transferência que ainda não foi lançado.'
                      : 'Faltando no banco: veja se saiu alguma tarifa, débito automático ou pagamento que ainda não foi lançado.'}
                  </p>
                </div>
              )}

              {/* Observação (opcional) */}
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Observação (opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 text-sm text-slate-900 dark:text-slate-100"
                />
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
                  Nenhum fechamento salvo anteriormente. Realize a conferência na aba "Conferência Atual" e clique em "Salvar conferência".
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

        {/* Modal de sucesso: o que foi conferido */}
        {savedSummary && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-[var(--border-highlight)] bg-[var(--surface-card)] p-8 shadow-2xl">
              <div className="mx-auto w-14 h-14 rounded-full bg-[var(--status-success-bg)] flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-[var(--status-success)]" />
              </div>
              <h3 className="mt-5 text-center text-lg font-semibold text-[var(--text-primary)]">Conferência salva</h3>
              <p className="mt-1 text-center text-sm text-[var(--text-secondary)]">
                {formatDateBR(savedSummary.date)} às {savedSummary.time}
              </p>
              <ul className="mt-5 divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)]">
                {savedSummary.items.map(it => (
                  <li key={it.name} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="font-medium text-[var(--text-primary)]">{it.name}</span>
                    <span className={it.status === 'PERFEITO' ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'}>
                      {it.status === 'PERFEITO' ? 'Bateu certinho' : (it.difference > 0 ? 'Sobra ' : 'Falta ') + formatBRL(Math.abs(it.difference))}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => { setSavedSummary(null); onClose(); }}
                className="mt-6 w-full h-12 rounded-xl btn-gold text-sm font-semibold cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        )}

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
              <span>Salvar conferência</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
