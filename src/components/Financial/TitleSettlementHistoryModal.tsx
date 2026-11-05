import React, { useMemo } from 'react';
import { 
  X, 
  History, 
  CheckCheck, 
  HandCoins, 
  Calendar, 
  Building2, 
  FileText, 
  Clock, 
  Tag, 
  Printer, 
  Landmark, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Receipt,
  ShieldCheck
} from 'lucide-react';
import { FinancialTitle, Settlement, BankStatementEntry, BankAccount, Counterparty } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';

interface TitleSettlementHistoryModalProps {
  isOpen: boolean;
  title: FinancialTitle | null;
  onClose: () => void;
}

export const TitleSettlementHistoryModal: React.FC<TitleSettlementHistoryModalProps> = ({
  isOpen,
  title,
  onClose
}) => {
  if (!isOpen || !title) return null;

  const counterparties: Counterparty[] = useMemo(() => storage.getCounterparties(), []);
  const bankAccounts: BankAccount[] = useMemo(() => storage.getBankAccounts(), []);
  const counterparty = counterparties.find(c => c.id === title.counterpartyId);

  // Liquidações contábeis realizadas neste título
  const settlements: Settlement[] = useMemo(() => {
    return storage.getSettlements()
      .filter(s => s.titleId === title.id && !s.isReversed)
      .sort((a, b) => new Date(a.settlementDate).getTime() - new Date(b.settlementDate).getTime());
  }, [title.id]);

  // Lançamentos de extrato bancário vinculados a este título
  const matchedStatements: BankStatementEntry[] = useMemo(() => {
    return storage.getStatementEntries()
      .filter(s => s.matchedTitleId === title.id)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [title.id]);

  const bankAccountMap = useMemo(() => {
    const map = new Map<string, BankAccount>();
    bankAccounts.forEach(acc => map.set(acc.id, acc));
    return map;
  }, [bankAccounts]);

  const isReceivable = title.type === 'RECEBER';
  const isFullySettled = title.settlementState === 'LIQUIDADO' || title.balancePrincipal <= 0.005;
  const isPartial = title.settlementState === 'PARCIAL' || (title.settledPrincipal > 0 && !isFullySettled);

  const percentSettled = title.originalAmount > 0 
    ? Math.min(100, Math.round(((title.settledPrincipal || 0) / title.originalAmount) * 100))
    : (isFullySettled ? 100 : 0);

  // Une os settlements com os extratos correspondentes
  const historyTimeline = useMemo(() => {
    if (settlements.length === 0 && matchedStatements.length === 0) {
      return [];
    }

    // Se temos settlements, mapeamos cada um com o respectivo extrato
    if (settlements.length > 0) {
      let runningSettled = 0;
      return settlements.map((s, idx) => {
        const comp = s.components;
        const pSettled = comp?.principalSettled ?? 0;
        runningSettled += pSettled;
        const netAmt = comp?.netFinancialAmount ?? pSettled;
        const remBal = Math.max(0, Math.round((title.originalAmount - runningSettled) * 100) / 100);

        const stmt = matchedStatements.find(st => 
          st.matchedMovementId === s.id || 
          st.fitId === s.voucherRef || 
          (st.date === s.settlementDate && Math.abs(Math.abs(st.amount) - netAmt) < 0.05)
        );
        const acc = bankAccountMap.get(s.bankAccountId) || (stmt ? bankAccountMap.get(stmt.bankAccountId) : undefined);

        return {
          id: s.id,
          date: s.settlementDate,
          principalSettled: pSettled,
          discount: comp?.discount ?? 0,
          interest: comp?.interest ?? 0,
          fine: comp?.fine ?? 0,
          bankFee: comp?.bankFee ?? 0,
          netFinancialAmount: netAmt,
          remainingBalance: remBal,
          notes: s.notes,
          voucherRef: s.voucherRef,
          isBankReconciled: Boolean(stmt || title.reconciledViaBank || s.notes?.includes('Conciliação')),
          statement: stmt,
          accountName: acc ? `${acc.name} (${acc.institution || ''})` : 'Conta Bancária Padrão',
          settlementIndex: idx + 1
        };
      });
    }

    // Se temos apenas extratos vinculados sem registro explícito de settlement
    let runningStmtSettled = 0;
    return matchedStatements.map((stmt, idx) => {
      const acc = bankAccountMap.get(stmt.bankAccountId);
      const stmtAbs = Math.abs(stmt.amount);
      runningStmtSettled += stmtAbs;
      const remBal = Math.max(0, Math.round((title.originalAmount - runningStmtSettled) * 100) / 100);

      return {
        id: stmt.id,
        date: stmt.date,
        principalSettled: stmtAbs,
        discount: 0,
        interest: 0,
        fine: 0,
        bankFee: 0,
        netFinancialAmount: stmtAbs,
        remainingBalance: remBal,
        notes: stmt.reconciliationNote || `Extrato: ${stmt.description}`,
        voucherRef: stmt.fitId || stmt.documentNumber,
        isBankReconciled: true,
        statement: stmt,
        accountName: acc ? `${acc.name} (${acc.institution || ''})` : 'Extrato Bancário',
        settlementIndex: idx + 1
      };
    });
  }, [settlements, matchedStatements, bankAccountMap, title]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-[#17171b] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden border border-slate-200 dark:border-[#26262b] flex flex-col animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header Premium com Gradiente e Status */}
        <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-[#26262b] bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-[#1b1b20] dark:via-[#17171b] dark:to-[#1b1b20] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isReceivable 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
            }`}>
              <History className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-[#26262b] text-slate-700 dark:text-slate-300">
                  Doc #{title.titleNumber}
                </span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isReceivable
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40'
                    : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40'
                }`}>
                  {isReceivable ? 'Contas a Receber' : 'Contas a Pagar'}
                </span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  isFullySettled
                    ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40'
                    : isPartial
                    ? 'bg-amber-500/15 text-amber-900 dark:text-amber-300 border-amber-500/40'
                    : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {isFullySettled ? 'LIQUIDADO' : isPartial ? 'PARCIALMENTE PAGO' : 'EM ABERTO'}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-1 truncate" title={title.description}>
                {title.description}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#26262b] transition-colors cursor-pointer"
              title="Imprimir Histórico"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#26262b] transition-colors cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Resumo Financeiro em Cards de KPI */}
        <div className="shrink-0 px-5 py-3.5 bg-slate-50/80 dark:bg-[#1b1b20]/60 border-b border-slate-200 dark:border-[#26262b] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-white dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b]">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Valor Original</span>
            <span className="text-sm font-black font-mono text-slate-900 dark:text-white mt-0.5 block">
              {formatBRL(title.originalAmount)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b]">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold block">Já Baixado ({percentSettled}%)</span>
            <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {formatBRL(title.settledPrincipal || 0)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b]">
            <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-semibold block">Saldo em Aberto</span>
            <span className="text-sm font-black font-mono text-amber-600 dark:text-amber-400 mt-0.5 block">
              {formatBRL(title.balancePrincipal)}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-white dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b]">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block">Favorecido</span>
            <span className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block truncate" title={counterparty?.tradeName || counterparty?.name}>
              {counterparty?.tradeName || counterparty?.name || 'Não informado'}
            </span>
          </div>
        </div>

        {/* Barra de Progresso de Amortização */}
        <div className="shrink-0 px-5 py-2.5 bg-white dark:bg-[#17171b] border-b border-slate-100 dark:border-[#26262b]/70 flex items-center gap-3">
          <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                percentSettled >= 100 
                  ? 'bg-emerald-500' 
                  : 'bg-gradient-to-r from-amber-500 to-emerald-500'
              }`}
              style={{ width: `${percentSettled}%` }}
            />
          </div>
          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
            {percentSettled}% Amortizado
          </span>
        </div>

        {/* Corpo do Modal: Linha do Tempo Visual */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-amber-500" />
              <span>Linha do Tempo de Baixas & Extratos Bancários ({historyTimeline.length})</span>
            </h3>

            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-3">
              <span className="flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" /> Conciliado Banco
              </span>
              <span className="flex items-center gap-1">
                <HandCoins className="w-3.5 h-3.5 text-amber-500" /> Baixa Manual
              </span>
            </div>
          </div>

          {historyTimeline.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-[#1b1b20]/40 border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400">
              <Clock className="w-10 h-10 mx-auto text-slate-400 mb-2 stroke-[1.5]" />
              <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Nenhum pagamento ou conciliação efetuada</p>
              <p className="text-xs mt-1">Este título está integralmente em aberto no valor de {formatBRL(title.originalAmount)}.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {historyTimeline.map((item) => (
                <div 
                  key={item.id}
                  className="relative p-4 rounded-xl bg-slate-50/70 dark:bg-[#1b1b20]/50 border border-slate-200 dark:border-[#26262b] hover:border-amber-500/40 transition-colors shadow-2xs"
                >
                  {/* Ponto na linha do tempo */}
                  <div className={`absolute -left-[27px] top-4 w-4 h-4 rounded-full border-2 bg-white dark:bg-[#17171b] flex items-center justify-center ${
                    item.isBankReconciled 
                      ? 'border-emerald-500 text-emerald-500' 
                      : 'border-amber-500 text-amber-500'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${item.isBankReconciled ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800/80 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDateBR(item.date)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-[#26262b] text-slate-700 dark:text-slate-300">
                        {item.settlementIndex}ª Amortização
                      </span>
                      {item.isBankReconciled ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40 flex items-center gap-1">
                          <CheckCheck className="w-3 h-3 stroke-[2.5]" />
                          <span>CONCILIADO BANCO</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/60 flex items-center gap-1">
                          <HandCoins className="w-3 h-3 stroke-[2.2]" />
                          <span>BAIXA MANUAL ERP</span>
                        </span>
                      )}
                    </div>

                    <div className="text-right font-mono">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mr-1.5 font-sans">Amortizado:</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                        {formatBRL(item.principalSettled)}
                      </span>
                    </div>
                  </div>

                  {/* Detalhes da Conta, Observação e Autenticação */}
                  <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                      <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{item.accountName}</span>
                    </div>

                    {item.voucherRef && (
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono text-[11px] truncate">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">Comprovante: {item.voucherRef}</span>
                      </div>
                    )}
                  </div>

                  {/* Lançamento do Extrato Bancário Cruzado (se houver) */}
                  {item.statement && (
                    <div className="mt-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-900 dark:text-emerald-300 flex items-center justify-between gap-2">
                      <span className="truncate">
                        <strong>Histórico Extrato:</strong> "{item.statement.description}"
                      </span>
                      <span className="font-mono font-bold shrink-0">
                        {formatBRL(Math.abs(item.statement.amount))}
                      </span>
                    </div>
                  )}

                  {/* Acréscimos ou Descontos */}
                  {(item.interest > 0 || item.fine > 0 || item.discount > 0 || item.bankFee > 0) && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
                      {item.interest > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                          + Juros: {formatBRL(item.interest)}
                        </span>
                      )}
                      {item.fine > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                          + Multa: {formatBRL(item.fine)}
                        </span>
                      )}
                      {item.discount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                          - Desconto: {formatBRL(item.discount)}
                        </span>
                      )}
                      {item.bankFee > 0 && (
                        <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/30">
                          - Tarifa: {formatBRL(item.bankFee)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Notas */}
                  {item.notes && (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 italic">
                      "{item.notes}"
                    </p>
                  )}

                  {/* Saldo Restante pós-baixa */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200/40 dark:border-slate-800/60 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 dark:text-slate-400">Saldo remanescente após este pagamento:</span>
                    <span className={`font-mono font-bold ${
                      item.remainingBalance <= 0.005 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : 'text-amber-600 dark:text-amber-400'
                    }`}>
                      {item.remainingBalance <= 0.005 ? 'R$ 0,00 (Totalmente Quitado)' : formatBRL(item.remainingBalance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-3.5 bg-slate-50 dark:bg-[#1b1b20] border-t border-slate-200 dark:border-[#26262b] flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Auditoria Contábil e Bancária Integrada</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-[#26262b] hover:bg-slate-300 dark:hover:bg-[#34343b] text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
