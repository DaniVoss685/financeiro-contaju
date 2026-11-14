import React, { useState, useEffect, useMemo } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { 
  Check, 
  AlertTriangle, 
  AlertCircle, 
  X, 
  Zap, 
  Sliders, 
  Calculator, 
  BookmarkPlus, 
  ArrowRight, 
  ShieldCheck, 
  Scale, 
  FileText, 
  Sparkles, 
  Plus, 
  Wallet,
  Building2,
  Calendar,
  Lock,
  Clock,
  History,
  CheckCircle2
} from 'lucide-react';
import { BankStatementEntry, FinancialTitle, Counterparty } from '../../types';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { storage } from '../../services/storageService';
import { learnAndCreateRuleFromTransaction } from '../../services/reconciliationRulesService';
import { calculateReconciliationSimilarity } from '../../services/reconciliationMatchingEngine';
import { TitleSettlementHistoryModal } from './TitleSettlementHistoryModal';

interface ReconciliationFloatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStatements: BankStatementEntry[];
  selectedTitles: FinancialTitle[];
  counterpartyMap: Map<string, Counterparty>;
  selectedAccountId: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onSelectTitle?: (title: FinancialTitle) => void;
  allAvailableTitles?: FinancialTitle[];
  onCreateTitleDirectly?: (stmt: BankStatementEntry) => void;
  initialPartialMode?: boolean;
}

export const ReconciliationFloatingModal: React.FC<ReconciliationFloatingModalProps> = ({
  isOpen,
  onClose,
  selectedStatements,
  selectedTitles,
  counterpartyMap,
  selectedAccountId,
  onSuccess,
  onError,
  onSelectTitle,
  allAvailableTitles,
  onCreateTitleDirectly,
  initialPartialMode = false
}) => {
  const [internalSelectedTitle, setInternalSelectedTitle] = useState<FinancialTitle | null>(null);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);

  // Limpa seleção interna ao reabrir o modal ou mudar títulos externos
  useEffect(() => {
    if (selectedTitles && selectedTitles.length > 0) {
      setInternalSelectedTitle(null);
    }
  }, [selectedTitles, isOpen]);

  // Par único ou multi-seleção
  const effectiveTitles = selectedTitles.length > 0 
    ? selectedTitles 
    : (internalSelectedTitle ? [internalSelectedTitle] : []);

  const isMultiSelection = selectedStatements.length > 1 || effectiveTitles.length > 1;
  const singleStmt = selectedStatements[0] || null;
  const singleTitle = effectiveTitles[0] || null;

  // Valores de ajuste para conciliação unitária
  const [adjPrincipal, setAdjPrincipal] = useState<number>(0);
  const [adjInterest, setAdjInterest] = useState<number>(0);
  const [adjFine, setAdjFine] = useState<number>(0);
  const [adjDiscount, setAdjDiscount] = useState<number>(0);
  const [adjBankFee, setAdjBankFee] = useState<number>(0);
  const [isPartialSettlement, setIsPartialSettlement] = useState<boolean>(false);
  const [showExtras, setShowExtras] = useState<boolean>(false);
  const [isManualEditOpen, setIsManualEditOpen] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Inicializa valores sempre que o modal abre ou os itens mudam
  useEffect(() => {
    if (isOpen && singleStmt && singleTitle) {
      const titleBal = singleTitle.balancePrincipal > 0 ? singleTitle.balancePrincipal : singleTitle.originalAmount;
      const stmtAbs = Math.round(Math.abs(Number(singleStmt.amount) || 0) * 100) / 100;
      
      const canPartial = stmtAbs < titleBal - 0.005;
      const shouldBePartial = Boolean(initialPartialMode && canPartial);

      setAdjPrincipal(shouldBePartial ? stmtAbs : titleBal);
      setAdjInterest(0);
      setAdjFine(0);
      setAdjDiscount(0);
      setAdjBankFee(0);
      setIsPartialSettlement(shouldBePartial);
      
      // Abre a edição manual se houver divergência inicial
      const isExact = Math.abs(stmtAbs - titleBal) < 0.005;
      setIsManualEditOpen(!isExact);
    }
  }, [isOpen, singleStmt, singleTitle, initialPartialMode]);

  // Tecla Escape para fechar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Candidatos compatíveis quando nenhum título foi pré-selecionado (Hook declarado incondicionalmente no topo)
  const topCandidateTitles = useMemo(() => {
    if (!isOpen || !singleStmt || singleTitle) return [];
    const pool = (allAvailableTitles && allAvailableTitles.length > 0) ? allAvailableTitles : storage.getTitles();
    const expectedType = singleStmt.amount < 0 ? 'PAGAR' : 'RECEBER';
    
    return pool
      .filter(t => t.type === expectedType && t.settlementState !== 'LIQUIDADO')
      .map(t => {
        const cp = counterpartyMap.get(t.counterpartyId);
        const match = calculateReconciliationSimilarity(singleStmt, t, cp);
        return { title: t, match, cp };
      })
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 5);
  }, [isOpen, singleStmt, singleTitle, allAvailableTitles, counterpartyMap]);

  // Cálculos para Par Unitário
  const stmtAbsAmount = singleStmt ? Math.round(Math.abs(Number(singleStmt.amount) || 0) * 100) / 100 : 0;
  const currentTitleBalance = singleTitle ? (singleTitle.balancePrincipal > 0 ? singleTitle.balancePrincipal : singleTitle.originalAmount) : 0;
  
  // Opção de Pagamento / Recebimento Parcial (quando o extrato é menor que o saldo do título)
  const canPartialSettlement = Boolean(!isMultiSelection && singleStmt && singleTitle && stmtAbsAmount < currentTitleBalance - 0.005);

  // Distinção de natureza: RECEBER (tarifa bancária é retida/descontada na entrada) vs PAGAR (tarifa bancária é debitada a mais)
  const isReceipt = singleTitle ? singleTitle.type === 'RECEBER' : (singleStmt ? Number(singleStmt.amount) > 0 : true);
  const totalSettledCalculated = Math.round(
    (isReceipt
      ? (adjPrincipal + adjInterest + adjFine - adjDiscount - adjBankFee)
      : (adjPrincipal + adjInterest + adjFine - adjDiscount + adjBankFee)
    ) * 100
  ) / 100;
  const differenceToStatement = Math.round((totalSettledCalculated - stmtAbsAmount) * 100) / 100;
  const isSingleExact = Math.abs(differenceToStatement) < 0.005;

  // Cálculos para Multi-seleção
  const totalStmtsAmount = Math.round(selectedStatements.reduce((sum, s) => sum + Math.abs(Number(s.amount) || 0), 0) * 100) / 100;
  const totalTitlesAmount = Math.round(effectiveTitles.reduce((sum, t) => {
    const val = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
    return sum + (Number(val) || 0);
  }, 0) * 100) / 100;
  const multiDifference = Math.round((totalStmtsAmount - totalTitlesAmount) * 100) / 100;
  const isMultiExact = Math.abs(multiDifference) < 0.005;

  // Regra Estrita do Usuário:
  // SÓ PODE ACEITAR se os valores baterem 100% exatamente (diferença R$ 0,00) OU se for marcado Pagamento Parcial
  const canConfirm = isMultiSelection 
    ? (selectedStatements.length > 0 && effectiveTitles.length > 0 && isMultiExact) 
    : Boolean(singleStmt && singleTitle) && (
        isSingleExact || (canPartialSettlement && isPartialSettlement)
      );

  // Ações de Ajuste Rápido
  const handleEnablePartialSettlement = () => {
    setIsPartialSettlement(true);
    setAdjPrincipal(stmtAbsAmount);
    setAdjInterest(0);
    setAdjFine(0);
    setAdjDiscount(0);
    setAdjBankFee(0);
  };

  // Terceira opção: o título passa a valer exatamente o que o extrato mostra (sem desconto, juros ou multa)
  const handleAdjustToStatement = () => {
    setIsPartialSettlement(false);
    setAdjPrincipal(stmtAbsAmount);
    setAdjInterest(0);
    setAdjFine(0);
    setAdjDiscount(0);
    setAdjBankFee(0);
  };

  const handleApplyDiffAsInterest = () => {
    setAdjPrincipal(currentTitleBalance);
    setAdjInterest(Math.max(0, Math.round((stmtAbsAmount - currentTitleBalance) * 100) / 100));
    setAdjFine(0);
    setAdjDiscount(0);
    setAdjBankFee(0);
  };

  const handleApplyDiffAsFine = () => {
    setAdjPrincipal(currentTitleBalance);
    setAdjInterest(0);
    setAdjFine(Math.max(0, Math.round((stmtAbsAmount - currentTitleBalance) * 100) / 100));
    setAdjDiscount(0);
    setAdjBankFee(0);
  };

  const handleApplyDiffAsDiscount = () => {
    setAdjPrincipal(currentTitleBalance);
    setAdjInterest(0);
    setAdjFine(0);
    setAdjDiscount(Math.max(0, Math.round((currentTitleBalance - stmtAbsAmount) * 100) / 100));
    setAdjBankFee(0);
  };

  const handleApplyDiffAsBankFee = () => {
    setAdjPrincipal(currentTitleBalance);
    setAdjInterest(0);
    setAdjFine(0);
    setAdjDiscount(0);
    const fee = isReceipt
      ? Math.max(0, Math.round((currentTitleBalance - stmtAbsAmount) * 100) / 100)
      : Math.max(0, Math.round((stmtAbsAmount - currentTitleBalance) * 100) / 100);
    setAdjBankFee(fee);
  };

  // Salvar Regra De-Para
  const handleSaveRule = () => {
    if (!singleStmt || !singleTitle) return;
    try {
      const createdRule = learnAndCreateRuleFromTransaction({
        stmt: singleStmt,
        chartAccountId: singleTitle.accountId,
        counterpartyId: singleTitle.counterpartyId,
        ruleName: `Regra: ${singleStmt.description.slice(0, 24)}`,
        autoReconcile: true
      });
      onSuccess(`Regra De-Para criada com sucesso para o padrão "${createdRule.pattern}"!`);
    } catch (err: any) {
      onError(`Erro ao salvar regra: ${err.message || 'Falha ao salvar'}`);
    }
  };

  // Execução da Conciliação
  const handleConfirmReconciliation = () => {
    if (!canConfirm) {
      onError('A conciliação está bloqueada: os valores precisam bater 100% (diferença R$ 0,00). Realize o ajuste antes de confirmar.');
      return;
    }

    setIsSubmitting(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      if (isMultiSelection) {
        // Execução Multi-Seleção
        let settledCount = 0;
        let alreadySettledCount = 0;
        const successfullySettledTitleIds: string[] = [];

        effectiveTitles.forEach(t => {
          if (t.settlementState === 'LIQUIDADO') {
            alreadySettledCount++;
            successfullySettledTitleIds.push(t.id);
          } else {
            const p = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
            const rawDate = selectedStatements[0]?.date || today;
            const effectiveDate = rawDate > today ? today : rawDate;

            const res = FinancialEngine.postSettlement({
              titleId: t.id,
              settlementDate: effectiveDate,
              bankAccountId: selectedStatements[0]?.bankAccountId || selectedAccountId,
              principalSettled: p,
              discount: 0,
              interest: 0,
              fine: 0,
              bankFee: 0,
              notes: `Baixa via Janela Flutuante de Conciliação em Lote (${selectedStatements.map(s => s.description).slice(0, 2).join(', ')})`,
              voucherRef: selectedStatements.map(s => s.fitId).filter(Boolean).slice(0, 3).join(';')
            });

            if (res.success) {
              settledCount++;
              successfullySettledTitleIds.push(t.id);
            }
          }
        });

        // Atualiza títulos
        const currentTitles = storage.getTitles();
        const updatedTitles = currentTitles.map(t => {
          if (effectiveTitles.some(st => st.id === t.id) && successfullySettledTitleIds.includes(t.id)) {
            return {
              ...t,
              reconciliationStatus: 'CONCILIADO' as const,
              updatedAt: new Date().toISOString()
            };
          }
          return t;
        });
        storage.saveTitles(updatedTitles);

        // Atualiza extratos
        const allStmts = storage.getStatementEntries();
        const updatedStmts = allStmts.map(s => {
          if (selectedStatements.some(ss => ss.id === s.id)) {
            return {
              ...s,
              reconciliationStatus: 'CONCILIADO' as const,
              matchedTitleId: effectiveTitles[0]?.id
            };
          }
          return s;
        });
        storage.saveStatementEntries(updatedStmts);

        // Auditoria
        const currentUser = storage.getCurrentUser();
        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'CONCILIACAO_LOTE_CONFIRMADA',
          module: 'Conciliação Bancária',
          recordId: selectedStatements.map(s => s.id).join(','),
          details: `Conciliação em Lote confirmada via janela flutuante com valores 100% batendo: ${selectedStatements.length} extratos [${formatBRL(totalStmtsAmount)}] cruzados com ${selectedTitles.length} títulos [${formatBRL(totalTitlesAmount)}].`
        });

        onSuccess(`Conciliação em lote realizada com sucesso com 100% de paridade! (${settledCount} títulos baixados, ${alreadySettledCount} já liquidados vinculados)`);
        onClose();
      } else {
        // Conciliação Unitária
        if (!singleStmt || !singleTitle) return;

        // Se o título já estava liquidado
        if (singleTitle.settlementState === 'LIQUIDADO' || singleTitle.balancePrincipal <= 0.005) {
          const allStmts = storage.getStatementEntries();
          const updatedStmts = allStmts.map(s => s.id === singleStmt.id ? {
            ...s,
            reconciliationStatus: 'CONCILIADO' as const,
            matchedTitleId: singleTitle.id
          } : s);
          storage.saveStatementEntries(updatedStmts);

          const allTitles = storage.getTitles();
          const updatedTitles = allTitles.map(t => t.id === singleTitle.id ? {
            ...t,
            reconciliationStatus: 'CONCILIADO' as const,
            updatedAt: new Date().toISOString()
          } : t);
          storage.saveTitles(updatedTitles);

          const currentUser = storage.getCurrentUser();
          storage.addAuditLog({
            userName: currentUser.name,
            userRole: currentUser.role,
            action: 'CONCILIACAO_VINCULO_EXATO',
            module: 'Conciliação Bancária',
            recordId: singleStmt.id,
            details: `Extrato "${singleStmt.description}" (${formatBRL(singleStmt.amount)}) vinculado e conciliado 100% com o título ${singleTitle.titleNumber}.`
          });

          onSuccess(`Lançamento "${singleStmt.description}" conciliado com 100% de paridade com o título ${singleTitle.titleNumber}!`);
          onClose();
          return;
        }

        const isPartial = isPartialSettlement && canPartialSettlement;
        const effectivePrincipalToSettle = isPartial ? stmtAbsAmount : adjPrincipal;
        const effectiveDiscount = isPartial ? 0 : adjDiscount;
        const effectiveInterest = isPartial ? 0 : adjInterest;
        const effectiveFine = isPartial ? 0 : adjFine;
        const effectiveBankFee = isPartial ? 0 : adjBankFee;

        // Se o valor principal for maior que o saldo (acréscimo no valor original)
        if (!isPartial && Math.abs(effectivePrincipalToSettle - currentTitleBalance) > 0.005) {
          const allTitles = storage.getTitles();
          const updatedTitles = allTitles.map(t => {
            if (t.id === singleTitle.id) {
              const diffP = effectivePrincipalToSettle - t.balancePrincipal;
              const newOriginal = Math.round(Math.max(0.01, t.originalAmount + diffP) * 100) / 100;
              return {
                ...t,
                originalAmount: newOriginal,
                balancePrincipal: effectivePrincipalToSettle,
                updatedAt: new Date().toISOString()
              };
            }
            return t;
          });
          storage.saveTitles(updatedTitles);
        }

        const safeEffectiveDate = singleStmt.date > today ? today : singleStmt.date;
        const safeBankAccountId = singleStmt.bankAccountId || selectedAccountId;

        const settlementResult = FinancialEngine.postSettlement({
          titleId: singleTitle.id,
          settlementDate: safeEffectiveDate,
          bankAccountId: safeBankAccountId,
          principalSettled: effectivePrincipalToSettle,
          discount: effectiveDiscount,
          interest: effectiveInterest,
          fine: effectiveFine,
          bankFee: effectiveBankFee,
          notes: isPartial
            ? `Baixa parcial via Conciliação Bancária (${singleStmt.description}). Saldo restante em aberto: ${formatBRL(currentTitleBalance - effectivePrincipalToSettle)}`
            : `Baixa via Janela de Conciliação (${singleStmt.description})${
                effectiveInterest > 0 || effectiveFine > 0 || effectiveDiscount > 0 || effectiveBankFee > 0 || Math.abs(effectivePrincipalToSettle - currentTitleBalance) > 0.005
                  ? ` [Ajuste 100%: Principal ${formatBRL(effectivePrincipalToSettle)}${effectiveInterest > 0 ? `, Juros ${formatBRL(effectiveInterest)}` : ''}${effectiveFine > 0 ? `, Multa ${formatBRL(effectiveFine)}` : ''}${effectiveDiscount > 0 ? `, Desc Comercial ${formatBRL(effectiveDiscount)}` : ''}${effectiveBankFee > 0 ? `, Tarifa Bancária ${formatBRL(effectiveBankFee)}` : ''}]`
                  : ''
              }`,
          voucherRef: singleStmt.fitId
        });

        if (!settlementResult.success) {
          onError(`Falha ao liquidar título: ${settlementResult.message}`);
          setIsSubmitting(false);
          return;
        }

        // Atualiza título no storage:
        // SE FOR PARCIAL: mantém PENDENTE pois o restante continua em aberto!
        // SE FOR TOTAL: marca como CONCILIADO
        const currentTitles = storage.getTitles();
        const updatedTitles = currentTitles.map(t => {
          if (t.id === singleTitle.id) {
            const hasRemaining = t.balancePrincipal > 0.005;
            return {
              ...t,
              reconciliationStatus: isPartial && hasRemaining ? ('PENDENTE' as const) : ('CONCILIADO' as const),
              reconciliationNote: isPartial && hasRemaining
                ? `Pagamento parcial de ${formatBRL(effectivePrincipalToSettle)} conciliado via extrato (${singleStmt.description}). Saldo restante em aberto: ${formatBRL(t.balancePrincipal)}`
                : t.reconciliationNote,
              updatedAt: new Date().toISOString()
            };
          }
          return t;
        });
        storage.saveTitles(updatedTitles);

        // Marca extrato como CONCILIADO
        const allStmts = storage.getStatementEntries();
        const updatedStmts = allStmts.map(s => s.id === singleStmt.id ? { 
          ...s, 
          reconciliationStatus: 'CONCILIADO' as const,
          matchedTitleId: singleTitle.id,
          reconciliationNote: isPartial
            ? `Conciliado como pagamento parcial do título #${singleTitle.titleNumber} (restante em aberto no ERP: ${formatBRL(currentTitleBalance - effectivePrincipalToSettle)})`
            : s.reconciliationNote
        } : s);
        storage.saveStatementEntries(updatedStmts);

        // Auditoria
        const currentUser = storage.getCurrentUser();
        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: isPartial ? 'CONCILIACAO_PAGAMENTO_PARCIAL' : 'CONCILIACAO_100_EXATA',
          module: 'Conciliação Bancária',
          recordId: singleStmt.id,
          details: isPartial
            ? `Pagamento Parcial: Extrato "${singleStmt.description}" (${formatBRL(singleStmt.amount)}) baixou ${formatBRL(effectivePrincipalToSettle)} do título ${singleTitle.titleNumber}. Restante em aberto no ERP: ${formatBRL(currentTitleBalance - effectivePrincipalToSettle)}.`
            : `Conciliado 100%: Extrato "${singleStmt.description}" (${formatBRL(singleStmt.amount)}) com título ${singleTitle.titleNumber}. Liquidado: Principal ${formatBRL(effectivePrincipalToSettle)}${effectiveInterest > 0 ? `, Juros ${formatBRL(effectiveInterest)}` : ''}${effectiveFine > 0 ? `, Multa ${formatBRL(effectiveFine)}` : ''}${effectiveDiscount > 0 ? `, Desc Comercial ${formatBRL(effectiveDiscount)}` : ''}${effectiveBankFee > 0 ? `, Tarifa Bancária ${formatBRL(effectiveBankFee)}` : ''}. Diferença: R$ 0,00.`
        });

        onSuccess(isPartial
          ? `✓ Sucesso! Pagamento parcial de ${formatBRL(effectivePrincipalToSettle)} conciliado. O título #${singleTitle.titleNumber} continua em aberto com saldo de ${formatBRL(currentTitleBalance - effectivePrincipalToSettle)}.`
          : `Conciliação concluída com sucesso! Extrato e Título 100% conferidos e quitados no ERP.`
        );
        onClose();
      }
    } catch (err: any) {
      onError(`Erro durante conciliação: ${err.message || 'Falha desconhecida'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const person = singleTitle ? counterpartyMap.get(singleTitle.counterpartyId) : null;

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-[#131316] rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[92vh] border border-slate-200 dark:border-[#26262b] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header da Janela Flutuante */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-[var(--surface-card)] text-[var(--text-primary)] shrink-0 sticky top-0 z-20">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                  {isMultiSelection ? 'Conciliação em Lote (Multi-Seleção)' : 'Conferência e Conciliação Bancária'}
                </h2>
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  canConfirm 
                    ? 'bg-emerald-500/20 text-[var(--status-success)] border border-emerald-500/40' 
                    : 'bg-rose-500/30 text-[var(--status-danger)] border border-rose-500/50'
                }`}>
                  {canConfirm ? '✓ 100% Batendo' : '⚠ Exige Correção de Valores'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                A conciliação exige 100% de paridade financeira para garantir conformidade e integridade contábil.
              </p>
            </div>
          </div>

          <button 
            type="button"
            onClick={onClose} 
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors shrink-0 cursor-pointer"
            title="Fechar janela (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          
          {/* ========================================================================= */}
          {/* ALERTA MANDATÓRIO QUANDO OS VALORES NÃO FOREM CORRIGIDOS E NÃO BATEREM 100% */}
          {/* ========================================================================= */}
          {!canConfirm ? (
            <div className="rounded-xl border border-[var(--status-danger)]/40 bg-[var(--status-danger-bg)] px-4 py-3 space-y-3 animate-in fade-in">
              <p className="text-sm text-[var(--text-primary)] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--status-danger)] shrink-0" />
                <span>
                  Tem diferença de{' '}
                  <strong className="text-[var(--status-danger)] tabular-nums">{formatBRL(Math.abs(isMultiSelection ? multiDifference : differenceToStatement))}</strong>
                  {' '}entre o extrato e o lançamento.
                </span>
              </p>

              {!isMultiSelection && (
                <div className="flex flex-wrap items-center gap-2">
                  {canPartialSettlement && (
                    <button
                      type="button"
                      onClick={handleEnablePartialSettlement}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--border-highlight)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] flex items-center gap-1.5 cursor-pointer"
                      title="Dá baixa só no valor do extrato e mantém o restante em aberto"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{isReceipt ? 'Recebimento parcial' : 'Pagamento parcial'} (resta {formatBRL(currentTitleBalance - stmtAbsAmount)})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleAdjustToStatement}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold btn-gold flex items-center gap-1.5 cursor-pointer"
                    title="O lançamento passa a valer o mesmo valor do extrato, sem lançar desconto ou juros"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Ajustar para {formatBRL(stmtAbsAmount)} (valor do extrato)</span>
                  </button>

                  {stmtAbsAmount < currentTitleBalance ? (
                    <button
                      type="button"
                      onClick={isReceipt ? handleApplyDiffAsBankFee : handleApplyDiffAsDiscount}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--border-highlight)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                      Lançar a diferença como {isReceipt ? 'tarifa' : 'desconto'} (-{formatBRL(currentTitleBalance - stmtAbsAmount)})
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleApplyDiffAsInterest}
                      className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[var(--border-highlight)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                    >
                      Lançar a diferença como juros (+{formatBRL(stmtAbsAmount - currentTitleBalance)})
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-900 dark:text-emerald-300 flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-500 shrink-0">
                  <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <span className="font-bold text-xs">
                    Valores 100% Batendo e Conferidos (Diferença: R$ 0,00)
                  </span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                    O valor do extrato e a composição contábil conferem integralmente. A conciliação está liberada para efetivação.
                  </p>
                </div>
              </div>

              {!isMultiSelection && (
                <button
                  type="button"
                  onClick={handleSaveRule}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white dark:bg-[#1b1b20] hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  title="Salvar como regra automática para extratos futuros com a mesma descrição"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-amber-500" />
                  <span>Lembrar Regra De-Para</span>
                </button>
              )}
            </div>
          )}

          {/* Confronto Visual Lado a Lado (2 Colunas no Modal) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* LADO ESQUERDO: EXTRATO BANCÁRIO */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1b1b20]/60 border border-slate-200 dark:border-[#26262b] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#26262b]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                    Lançamento no Extrato Bancário
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                  {selectedStatements.length} selecionado(s)
                </span>
              </div>

              {isMultiSelection ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedStatements.map(s => (
                    <div key={s.id} className="p-2.5 bg-white dark:bg-[#131316] rounded-lg border border-slate-200 dark:border-[#26262b] flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">{s.description}</span>
                        <span className="text-[10px] text-[var(--text-muted)]">{formatDateBR(s.date)} • FITID: {s.fitId}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {formatBRL(Math.abs(s.amount))}
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex justify-between font-bold text-xs">
                    <span>Total do Extrato:</span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">{formatBRL(totalStmtsAmount)}</span>
                  </div>
                </div>
              ) : singleStmt ? (
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">Descrição Oficial:</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{singleStmt.description}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">Valor do Extrato:</span>
                      <span className="text-base font-extrabold font-mono text-amber-600 dark:text-amber-400">
                        {singleStmt.amount < 0 ? '-' : '+'} {formatBRL(Math.abs(singleStmt.amount))}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-[#26262b] text-[11px]">
                    <div>
                      <span className="text-[var(--text-muted)] block">Data da Transação:</span>
                      <strong className="text-slate-800 dark:text-slate-200">{formatDateBR(singleStmt.date)}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Documento / FITID:</span>
                      <strong className="font-mono text-slate-800 dark:text-slate-200">{singleStmt.fitId}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-[var(--text-secondary)] bg-white dark:bg-[#131316] rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-60" />
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Nenhum extrato bancário selecionado</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Marque ou clique em "Conciliar" em uma linha do extrato para confrontar.</p>
                </div>
              )}
            </div>

            {/* LADO DIREITO: TÍTULO(S) DO ERP */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1b1b20]/60 border border-slate-200 dark:border-[#26262b] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#26262b]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                    Lançamento Contábil no ERP
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                  {selectedTitles.length} selecionado(s)
                </span>
              </div>

              {isMultiSelection ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedTitles.map(t => {
                    const p = counterpartyMap.get(t.counterpartyId);
                    const val = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
                    return (
                      <div key={t.id} className="p-2.5 bg-white dark:bg-[#131316] rounded-lg border border-slate-200 dark:border-[#26262b] flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white block">{t.titleNumber} • {p?.name || t.description}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">Vencimento: {formatDateBR(t.dueDate)} • {t.type}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {formatBRL(val)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex justify-between font-bold text-xs">
                    <span>Total dos Títulos:</span>
                    <span className="font-mono text-slate-900 dark:text-amber-400">{formatBRL(totalTitlesAmount)}</span>
                  </div>
                </div>
              ) : singleTitle ? (
                <div className="space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">Título / Favorecido:</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {singleTitle.titleNumber} • {person?.name || singleTitle.description}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[var(--text-muted)] uppercase font-semibold block">Saldo em Aberto:</span>
                      <span className="text-base font-extrabold font-mono text-slate-900 dark:text-amber-400">
                        {formatBRL(currentTitleBalance)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-[#26262b] text-[11px]">
                    <div>
                      <span className="text-[var(--text-muted)] block">Vencimento Contratual:</span>
                      <strong className="text-slate-800 dark:text-slate-200">{formatDateBR(singleTitle.dueDate)}</strong>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block">Tipo & Status:</span>
                      <strong className="text-slate-800 dark:text-slate-200">
                        {singleTitle.type === 'PAGAR' ? 'Contas a Pagar' : 'Contas a Receber'} ({singleTitle.settlementState})
                      </strong>
                    </div>
                  </div>

                  {/* Atalho para Histórico de Baixas Anteriores (se houver) */}
                  {(singleTitle.settlementState === 'PARCIAL' || (singleTitle.settledPrincipal && singleTitle.settledPrincipal > 0)) && (
                    <button
                      type="button"
                      onClick={() => setIsHistoryModalOpen(true)}
                      className="mt-2 w-full p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/30 flex items-center justify-between text-xs font-semibold cursor-pointer transition-all"
                      title="Abrir linha do tempo com todos os pagamentos e extratos já vinculados a este título"
                    >
                      <span className="flex items-center gap-1.5 font-bold">
                        <History className="w-4 h-4 text-amber-500" />
                        <span>Histórico de Extratos & Baixas Anteriores</span>
                      </span>
                      <span className="font-mono text-[11px] bg-amber-500/20 px-2 py-0.5 rounded text-amber-800 dark:text-amber-300">
                        {formatBRL(singleTitle.settledPrincipal || 0)} pago &rarr;
                      </span>
                    </button>
                  )}
                </div>
              ) : singleStmt ? (
                <div className="p-3.5 bg-white dark:bg-[#131316] rounded-xl border border-slate-200 dark:border-[#26262b] space-y-2.5">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Selecione um título para cruzar:
                    </span>
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                      {singleStmt.amount < 0 ? 'A Pagar' : 'A Receber'}
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {topCandidateTitles.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)] py-3 text-center">
                        Nenhum título {singleStmt.amount < 0 ? 'a pagar' : 'a receber'} em aberto no momento.
                      </p>
                    ) : (
                      topCandidateTitles.map(({ title: t, match, cp }) => {
                        const bal = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
                        return (
                          <div 
                            key={t.id} 
                            onClick={() => {
                              setInternalSelectedTitle(t);
                              if (onSelectTitle) onSelectTitle(t);
                            }}
                            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-amber-500/60 hover:bg-amber-500/5 transition-all cursor-pointer flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{t.titleNumber}</span>
                                <span className="text-[10px] text-[var(--text-muted)]">Venc: {formatDateBR(t.dueDate)}</span>
                                {match.score >= 40 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                    {match.score}% compatível
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-700 dark:text-slate-300 truncate block mt-0.5">
                                {cp?.name || t.description}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono font-bold text-xs text-slate-900 dark:text-white block">
                                {formatBRL(bal)}
                              </span>
                              <span className="text-[10px] text-amber-500 font-bold hover:underline">
                                Selecionar ➔
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {onCreateTitleDirectly && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onCreateTitleDirectly(singleStmt);
                      }}
                      className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-black text-slate-800 dark:text-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Criar Novo Lançamento no ERP a partir deste Extrato</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-[var(--text-secondary)] bg-white dark:bg-[#131316] rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-80" />
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Nenhum título contábil selecionado</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Marque ou clique em "Conciliar" em um título na coluna do ERP para confrontar.</p>
                </div>
              )}
            </div>
          </div>

          {/* Composição e Ajustes da Conciliação (Apenas se unitário e não liquidado) */}
          {!isMultiSelection && singleTitle && singleTitle.settlementState !== 'LIQUIDADO' && (
            <div className="p-4 rounded-xl bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-[var(--brand-gold)]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                    Composição e Ajustes da Conciliação
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-secondary)]">
                  {canPartialSettlement
                    ? 'Selecione Pagamento Parcial ou ajuste Desconto/Acréscimo'
                    : 'Ajuste os campos abaixo até a diferença ser exatamente R$ 0,00'}
                </span>
              </div>

              {/* Opção Destacada de Pagamento / Recebimento Parcial */}
              {canPartialSettlement && (
                <div className={`p-3.5 rounded-xl border transition-all ${
                  isPartialSettlement
                    ? 'bg-amber-500/20 border-amber-500 text-[var(--text-primary)] ring-2 ring-amber-500/40'
                    : 'bg-[var(--surface-elevated)]/80 border-[var(--border-subtle)] text-[var(--text-primary)] hover:border-amber-500/40'
                }`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPartialSettlement}
                      onChange={e => {
                        const checked = e.target.checked;
                        setIsPartialSettlement(checked);
                        if (checked) {
                          setAdjPrincipal(stmtAbsAmount);
                          setAdjDiscount(0);
                          setAdjInterest(0);
                          setAdjFine(0);
                          setAdjBankFee(0);
                        } else {
                          setAdjPrincipal(currentTitleBalance);
                        }
                      }}
                      className="mt-0.5 w-5 h-5 rounded border-amber-500 text-amber-500 focus:ring-amber-500 cursor-pointer accent-amber-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-xs text-[var(--brand-gold)] uppercase tracking-wide">
                          {isReceipt ? 'Recebimento Parcial' : 'Pagamento Parcial'} (Manter Restante em Aberto)
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-[var(--brand-gold)] border border-amber-500/30">
                          Opção Recomendada
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed">
                        Dá baixa exclusivamente no valor do extrato (<strong>{formatBRL(stmtAbsAmount)}</strong>). O saldo restante de <strong className="text-[var(--brand-gold)] font-mono font-bold">{formatBRL(currentTitleBalance - stmtAbsAmount)}</strong> continuará <strong>EM ABERTO</strong> no ERP (status PARCIAL) para ser conciliado nos próximos lançamentos.
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-4 text-xs font-mono">
                        <div>
                          <span className="text-[var(--text-muted)]">Saldo Atual: </span>
                          <strong className="text-[var(--text-primary)]">{formatBRL(currentTitleBalance)}</strong>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">Baixa no Extrato: </span>
                          <strong className="text-[var(--status-success)]">-{formatBRL(stmtAbsAmount)}</strong>
                        </div>
                        <div>
                          <span className="text-[var(--text-muted)]">Restará em Aberto: </span>
                          <strong className="text-[var(--brand-gold)] font-bold underline">{formatBRL(currentTitleBalance - stmtAbsAmount)}</strong>
                        </div>
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <label className="flex items-center gap-2.5 text-sm text-[var(--text-primary)] cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={showExtras || adjInterest > 0 || adjFine > 0 || adjDiscount > 0 || adjBankFee > 0}
                  onChange={e => {
                    setShowExtras(e.target.checked);
                    if (!e.target.checked) { setAdjInterest(0); setAdjFine(0); setAdjDiscount(0); setAdjBankFee(0); }
                  }}
                  className="w-4 h-4 rounded"
                />
                Teve juros, multa, desconto ou tarifa?
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {/* Principal */}
                <div className="bg-[var(--surface-elevated)] p-2.5 rounded-lg border border-[var(--border-subtle)]">
                  <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase block mb-1">
                    Valor Principal (R$) *
                  </label>
                  <MoneyField value={Number(adjPrincipal) || 0} onChange={(v: number) => setAdjPrincipal(Math.max(0, v))} className="w-full bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:border-amber-400 focus:outline-hidden" />
                  <span className="text-[9px] text-[var(--text-muted)] mt-1 block">Saldo ERP: {formatBRL(currentTitleBalance)}</span>
                </div>

                {/* Juros */}
                <div className={`${showExtras || adjInterest > 0 || adjFine > 0 || adjDiscount > 0 || adjBankFee > 0 ? '' : 'hidden '}bg-[var(--surface-elevated)] p-2.5 rounded-lg border border-[var(--border-subtle)]`}>
                  <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase block mb-1">
                    + Juros (R$)
                  </label>
                  <MoneyField value={Number(adjInterest) || 0} onChange={(v: number) => setAdjInterest(Math.max(0, v))} className="w-full bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:border-sky-400 focus:outline-hidden" />
                  <span className="text-[9px] text-[var(--text-muted)] mt-1 block">Acréscimo por atraso</span>
                </div>

                {/* Multa */}
                <div className={`${showExtras || adjInterest > 0 || adjFine > 0 || adjDiscount > 0 || adjBankFee > 0 ? '' : 'hidden '}bg-[var(--surface-elevated)] p-2.5 rounded-lg border border-[var(--border-subtle)]`}>
                  <label className="text-[10px] text-[var(--brand-gold)] font-bold uppercase block mb-1">
                    + Multa (R$)
                  </label>
                  <MoneyField value={Number(adjFine) || 0} onChange={(v: number) => setAdjFine(Math.max(0, v))} className="w-full bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--brand-gold)] font-mono focus:border-amber-400 focus:outline-hidden" />
                  <span className="text-[9px] text-[var(--text-muted)] mt-1 block">Penalidade contratual</span>
                </div>

                {/* Desconto Comercial */}
                <div className={`${showExtras || adjInterest > 0 || adjFine > 0 || adjDiscount > 0 || adjBankFee > 0 ? '' : 'hidden '}bg-[var(--surface-elevated)] p-2.5 rounded-lg border border-[var(--border-subtle)]`}>
                  <label className="text-[10px] text-[var(--status-success)] font-bold uppercase block mb-1">
                    - Desconto Comercial (R$)
                  </label>
                  <MoneyField value={Number(adjDiscount) || 0} onChange={(v: number) => setAdjDiscount(Math.max(0, v))} className="w-full bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--status-success)] font-mono focus:border-emerald-400 focus:outline-hidden" />
                  <span className="text-[9px] text-[var(--text-muted)] mt-1 block">Abatimento negociado</span>
                </div>

                {/* Tarifa Bancária */}
                <div className={`${showExtras || adjInterest > 0 || adjFine > 0 || adjDiscount > 0 || adjBankFee > 0 ? '' : 'hidden '}bg-[var(--surface-elevated)] p-2.5 rounded-lg border border-[var(--border-subtle)]`}>
                  <label className="text-[10px] text-[var(--text-secondary)] font-bold uppercase block mb-1">
                    {isReceipt ? '- Tarifa Bancária (R$)' : '+ Tarifa Bancária (R$)'}
                  </label>
                  <MoneyField value={Number(adjBankFee) || 0} onChange={(v: number) => setAdjBankFee(Math.max(0, v))} className="w-full bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] font-mono focus:border-orange-400 focus:outline-hidden" />
                  <span className="text-[9px] text-[var(--text-muted)] mt-1 block">
                    {isReceipt ? 'Taxa boleto/cartão retida' : 'Taxa TED/DOC/emissão'}
                  </span>
                </div>
              </div>

              {/* Resumo da Fórmula em Tempo Real */}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="text-[var(--text-primary)]">
                  <span>Cálculo: </span>
                  <span className="text-[var(--text-primary)] font-semibold">{formatBRL(adjPrincipal)}</span>
                  {adjInterest > 0 && <span className="text-[var(--status-danger)]"> + {formatBRL(adjInterest)} (Juros)</span>}
                  {adjFine > 0 && <span className="text-[var(--brand-gold)]"> + {formatBRL(adjFine)} (Multa)</span>}
                  {adjDiscount > 0 && <span className="text-[var(--status-success)]"> - {formatBRL(adjDiscount)} (Desc. Comercial)</span>}
                  {adjBankFee > 0 && <span className="text-[var(--text-secondary)]"> {isReceipt ? '-' : '+'} {formatBRL(adjBankFee)} (Tarifa Bancária)</span>}
                  <span className="text-[var(--text-primary)] font-bold"> = Total: {formatBRL(totalSettledCalculated)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[var(--text-secondary)] text-xs">Diferença para o Extrato:</span>
                  <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                    isSingleExact
                      ? 'bg-emerald-500/20 text-[var(--status-success)] border border-emerald-500/40'
                      : 'bg-rose-500/30 text-[var(--status-danger)] border border-rose-500/50'
                  }`}>
                    {isSingleExact ? '✓ R$ 0,00 (100% Batendo)' : formatBRL(differenceToStatement)}
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Rodapé de Ações Fixo com Botão Bloqueado se Divergente */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 sticky bottom-0 z-20">
          <div className="flex items-center gap-2 text-xs">
            {canConfirm ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                {isPartialSettlement 
                  ? `Pronto: Baixa Parcial de ${formatBRL(stmtAbsAmount)} (Restante: ${formatBRL(currentTitleBalance - stmtAbsAmount)} continuará em aberto no ERP).`
                  : 'Valores 100% conferidos e prontos para conciliação.'}
              </span>
            ) : (
              <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-rose-500" />
                Conciliação bloqueada: diferença de {formatBRL(Math.abs(isMultiSelection ? multiDifference : differenceToStatement))}. Marque "Pagamento Parcial" ou informe Desconto/Acréscimo.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={!canConfirm || isSubmitting}
              onClick={handleConfirmReconciliation}
              className={`px-6 py-2.5 rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center gap-2 ${
                canConfirm && !isSubmitting
                  ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 text-slate-950 cursor-pointer shadow-amber-500/20 active:scale-95'
                  : 'bg-slate-300 dark:bg-slate-800 text-[var(--text-muted)] dark:text-slate-600 border border-slate-300 dark:border-slate-700 cursor-not-allowed opacity-75'
              }`}
            >
              {canConfirm ? (
                isPartialSettlement ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>CONFIRMAR {isReceipt ? 'RECEBIMENTO' : 'PAGAMENTO'} PARCIAL ({formatBRL(stmtAbsAmount)}) • RESTANTE ({formatBRL(currentTitleBalance - stmtAbsAmount)}) EM ABERTO</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>{isMultiSelection ? `CONFIRMAR CONCILIAÇÃO EM LOTE (${selectedStatements.length} ➔ ${selectedTitles.length})` : 'CONFIRMAR CONCILIAÇÃO (100% EXATO)'}</span>
                  </>
                )
              ) : (
                <>
                  <Lock className="w-4 h-4 text-rose-500 stroke-[2.5]" />
                  <span>CONCILIAÇÃO BLOQUEADA (MARQUE PARCIAL OU AJUSTE VALORES)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Modal de Histórico de Baixas & Extratos Anteriores */}
        <TitleSettlementHistoryModal
          isOpen={isHistoryModalOpen}
          title={singleTitle}
          onClose={() => setIsHistoryModalOpen(false)}
        />

      </div>
    </div>
  );
};
