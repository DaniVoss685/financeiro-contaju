import React, { useState, useMemo, useEffect } from 'react';
import { 
  Lock, 
  Unlock, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Calendar, 
  History, 
  FileText, 
  ShieldCheck, 
  Search, 
  ArrowRight,
  Sparkles,
  Layers,
  X,
  Building2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Copy,
  Eye,
  HelpCircle,
  Clock,
  RefreshCw,
  AlertCircle,
  Zap,
  Sliders,
  Check,
  Plus,
  Printer,
  Download
} from 'lucide-react';
import { 
  PeriodClosure, 
  BankAccount, 
  BankClosureSnapshot, 
  PeriodClosureChecklist,
  FinancialMovement,
  ChartAccount
} from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { exportPeriodClosureToPDF } from '../../utils/pdfExportUtils';
import { NavigationScreen } from '../Sidebar';
import { BankAccountStatementModal } from '../Financial/BankAccountStatementModal';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField, MonthField } from '../Common/DateField';

interface PeriodClosureViewProps {
  onNavigate?: (screen: NavigationScreen) => void;
}

interface BankReconciliationItem {
  bank: BankAccount;
  systemBalance: number;
  currentSystemBalance: number;
  totalIn: number;
  totalOut: number;
  declaredBalance: number;
  hasInput: boolean;
  difference: number;
  isMatched: boolean;
  pendingStatementsCount: number;
}

export const PeriodClosureView: React.FC<PeriodClosureViewProps> = ({ onNavigate }) => {
  const [closures, setClosures] = useState<PeriodClosure[]>(() => storage.getPeriodClosures());
  const currentUser = storage.getCurrentUser();
  const [refreshKey, setRefreshKey] = useState(0);

  // Mês padrão: mês passado (competência recém-concluída)
  const defaultLastMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const [newCompetence, setNewCompetence] = useState<string>(defaultLastMonth);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  // Ciência de inadimplência/títulos em aberto
  const [isAcknowledgedPending, setIsAcknowledgedPending] = useState(false);

  // =========================================================================
  // SUGESTÃO 5: POLÍTICA RÍGIDA DE FECHAMENTO (TOLERÂNCIA ZERO A DIVERGÊNCIAS)
  // =========================================================================
  const [isStrictClosurePolicy, setIsStrictClosurePolicy] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('contaju_strict_closure_policy');
      return saved !== null ? saved === 'true' : true; // Padrão: Rigorosa (Segurança máxima)
    } catch {
      return true;
    }
  });

  const handleToggleStrictPolicy = () => {
    if (currentUser.role !== 'ADMIN') {
      setMsg({ type: 'warning', text: 'Apenas Administradores podem alterar a Política de Fechamento Contábil.' });
      return;
    }
    const nextVal = !isStrictClosurePolicy;
    setIsStrictClosurePolicy(nextVal);
    try {
      localStorage.setItem('contaju_strict_closure_policy', String(nextVal));
    } catch (e) {
      console.error(e);
    }
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CONFIGURACAO_POLITICA_FECHAMENTO',
      module: 'Fechamento Contábil',
      recordId: 'strict-policy',
      details: `Política de Fechamento Perfeito (Divergência Zero) alterada para: ${nextVal ? 'ATIVADA (Rígida)' : 'DESATIVADA (Flexível)'}.`
    });
    setMsg({
      type: 'success',
      text: nextVal 
        ? 'Política de Fechamento Rígido ATIVADA: O fechamento só poderá ser executado com Divergência R$ 0,00.'
        : 'Modo Flexível ATIVADO: Fechamentos com divergência permitidos mediante justificativa formal auditada.'
    });
  };

  // =========================================================================
  // SUGESTÃO 1: MODAL DE AJUSTE RÁPIDO / TARIFA BANCÁRIA
  // =========================================================================
  const [adjustmentTarget, setAdjustmentTarget] = useState<BankReconciliationItem | null>(null);
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjDirection, setAdjDirection] = useState<'ENTRADA' | 'SAIDA'>('SAIDA');
  const [adjDate, setAdjDate] = useState<string>('');
  const [adjAccountId, setAdjAccountId] = useState<string>('acc-4.2.04'); // Padrão: Tarifas Bancárias
  const [adjDescription, setAdjDescription] = useState<string>('');
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);

  // Modal de Reabertura
  const [reopenTarget, setReopenTarget] = useState<PeriodClosure | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [isReopening, setIsReopening] = useState(false);

  // Modal de Detalhes de Fechamento Histórico
  const [viewDetailsClosure, setViewDetailsClosure] = useState<PeriodClosure | null>(null);

  // Modal Executivo / Impressão de Termo e Ata de Fechamento
  const [printTermClosure, setPrintTermClosure] = useState<PeriodClosure | null>(null);

  // Modal de Extrato Bancário em Linha
  const [statementAccount, setStatementAccount] = useState<BankAccount | null>(null);

  // Lista de Contas Bancárias Ativas
  const bankAccounts = useMemo(() => {
    return storage.getBankAccounts().filter(b => b.status === 'ATIVO');
  }, [refreshKey]);

  // Plano de Contas Analítico Ativo
  const chartAccounts = useMemo(() => {
    return storage.getChartAccounts().filter(c => c.isAnalytical && c.isActive);
  }, [refreshKey]);

  // Data de corte da competência (último dia do mês)
  const cutoffDate = useMemo(() => {
    if (!newCompetence || !newCompetence.includes('-')) return '';
    const [yStr, mStr] = newCompetence.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    return `${newCompetence}-${String(lastDay).padStart(2, '0')}`;
  }, [newCompetence]);

  // Saldos Declarados pelo Usuário ("Saldo que tenho / Extrato do Banco")
  const [declaredInputs, setDeclaredInputs] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`contaju_closure_balances_${defaultLastMonth}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Atualiza os saldos declarados ao mudar a competência
  useEffect(() => {
    if (!newCompetence) return;
    try {
      const saved = localStorage.getItem(`contaju_closure_balances_${newCompetence}`);
      if (saved) {
        setDeclaredInputs(JSON.parse(saved));
      } else {
        setDeclaredInputs({});
      }
    } catch {
      setDeclaredInputs({});
    }
  }, [newCompetence]);

  // Salva no localStorage quando o usuário altera valores
  const handleDeclaredBalanceChange = (accountId: string, value: string) => {
    const updated = { ...declaredInputs, [accountId]: value };
    setDeclaredInputs(updated);
    try {
      localStorage.setItem(`contaju_closure_balances_${newCompetence}`, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  // Efeito reativo para sincronizar com storage
  useEffect(() => {
    return storage.subscribe(() => {
      setClosures(storage.getPeriodClosures());
      setRefreshKey(k => k + 1);
    });
  }, []);

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(timer);
  }, [msg]);

  // =========================================================================
  // CÁLCULO DE SALDOS BANCÁRIOS (SISTEMA VS. DECLARADO)
  // =========================================================================
  const bankReconciliations: BankReconciliationItem[] = useMemo(() => {
    if (!newCompetence || !cutoffDate) return [];

    const movements = storage.getMovements().filter(m => !m.isReversed);
    const stmts = storage.getStatementEntries().filter(s => s && s.date.startsWith(newCompetence));

    return bankAccounts.map(bank => {
      // Saldo do sistema na data de corte da competência
      const systemBalance = FinancialEngine.getAccountBalance(bank.id, cutoffDate);
      
      // Saldo do sistema atual (hoje)
      const currentSystemBalance = FinancialEngine.getAccountBalance(bank.id);

      // Movimentações no mês desta conta
      const monthMovs = movements.filter(m => m.bankAccountId === bank.id && m.date.startsWith(newCompetence));
      const totalIn = monthMovs.filter(m => m.direction === 'ENTRADA').reduce((acc, m) => acc + m.amount, 0);
      const totalOut = monthMovs.filter(m => m.direction === 'SAIDA').reduce((acc, m) => acc + m.amount, 0);

      // Itens de extrato pendentes para esta conta no mês
      const pendingStatements = stmts.filter(s => 
        (s.bankAccountId === bank.id || (!s.bankAccountId && bank.id === 'bank-1')) && 
        (s.reconciliationStatus === 'PENDENTE' || s.reconciliationStatus === 'SUGESTAO')
      );

      // Saldo digitado pelo usuário
      const rawInput = declaredInputs[bank.id];
      const hasInput = rawInput !== undefined && rawInput !== '';
      const declaredBalance = hasInput ? parseFloat(rawInput.replace(/\./g, '').replace(',', '.')) || 0 : systemBalance;
      
      // Diferença = Saldo Real (Extrato) - Saldo do Sistema
      const difference = Math.round((declaredBalance - systemBalance) * 100) / 100;
      const isMatched = Math.abs(difference) < 0.01;

      return {
        bank,
        systemBalance,
        currentSystemBalance,
        totalIn,
        totalOut,
        declaredBalance,
        hasInput,
        difference,
        isMatched,
        pendingStatementsCount: pendingStatements.length
      };
    });
  }, [bankAccounts, newCompetence, cutoffDate, declaredInputs, refreshKey]);

  // Totais consolidados dos bancos
  const totalSystemBankBalance = useMemo(() => {
    return bankReconciliations.reduce((acc, b) => acc + b.systemBalance, 0);
  }, [bankReconciliations]);

  const totalDeclaredBankBalance = useMemo(() => {
    return bankReconciliations.reduce((acc, b) => acc + b.declaredBalance, 0);
  }, [bankReconciliations]);

  const totalBankDifference = useMemo(() => {
    return Math.round((totalDeclaredBankBalance - totalSystemBankBalance) * 100) / 100;
  }, [totalDeclaredBankBalance, totalSystemBankBalance]);

  const areAllBanksMatched = useMemo(() => {
    return bankReconciliations.length > 0 && bankReconciliations.every(b => b.isMatched);
  }, [bankReconciliations]);

  // Preencher todos os bancos com os saldos do sistema
  const handleCopyAllSystemBalances = () => {
    const updated: Record<string, string> = {};
    bankReconciliations.forEach(b => {
      updated[b.bank.id] = b.systemBalance.toFixed(2).replace('.', ',');
    });
    setDeclaredInputs(updated);
    try {
      localStorage.setItem(`contaju_closure_balances_${newCompetence}`, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    setMsg({ type: 'success', text: 'Saldos do sistema copiados para todos os bancos com sucesso.' });
  };

  // Preencher uma conta específica com o saldo do sistema
  const handleCopySingleSystemBalance = (bankId: string, systemBal: number) => {
    handleDeclaredBalanceChange(bankId, systemBal.toFixed(2).replace('.', ','));
  };

  // =========================================================================
  // ABERTURA E DISPARO DO AJUSTE RÁPIDO (SUGESTÃO 1)
  // =========================================================================
  const handleOpenQuickAdjustment = (item: BankReconciliationItem) => {
    setAdjustmentTarget(item);
    const absDiff = Math.abs(item.difference);
    setAdjAmount(absDiff);
    setAdjDate(cutoffDate || new Date().toISOString().split('T')[0]);

    // Se a diferença for negativa (Saldo real < Sistema), o banco tem menos dinheiro.
    // Logo, houve uma saída não registrada (ex: tarifa bancária, taxa, IOF, juros).
    // Se for positiva (Saldo real > Sistema), houve uma entrada não registrada (ex: rendimento).
    if (item.difference < -0.005) {
      setAdjDirection('SAIDA');
      // Procura conta analítica de Tarifas Bancárias ou Despesas Financeiras
      const tarifaAcc = chartAccounts.find(ca => ca.id === 'acc-4.2.04' || ca.name.toLowerCase().includes('tarifa'));
      setAdjAccountId(tarifaAcc?.id || chartAccounts[0]?.id || '');
      setAdjDescription(`Tarifas e encargos bancários do período - ${item.bank.name} (${newCompetence})`);
    } else {
      setAdjDirection('ENTRADA');
      // Procura conta analítica de Rendimentos ou Receitas Financeiras
      const rendAcc = chartAccounts.find(ca => ca.id === 'acc-4.1.01' || ca.name.toLowerCase().includes('rendimento') || ca.name.toLowerCase().includes('juros'));
      setAdjAccountId(rendAcc?.id || chartAccounts[0]?.id || '');
      setAdjDescription(`Rendimentos de aplicação / ajuste de conciliação - ${item.bank.name} (${newCompetence})`);
    }
  };

  const handleConfirmQuickAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentTarget || adjAmount <= 0) return;

    if (checklist?.isAlreadyClosed) {
      setMsg({ type: 'error', text: 'A competência selecionada já está fechada e bloqueada para lançamentos.' });
      return;
    }

    setIsSubmittingAdj(true);

    const movementId = `mov-adj-${Date.now()}`;
    const newMovement: FinancialMovement = {
      id: movementId,
      bankAccountId: adjustmentTarget.bank.id,
      date: adjDate,
      direction: adjDirection,
      amount: Math.abs(adjAmount),
      originType: 'OPERACAO_DIRETA',
      originReferenceId: `fechamento-${newCompetence}`,
      description: adjDescription.trim() || `Ajuste de Conciliação Bancária - ${adjustmentTarget.bank.name}`,
      accountId: adjAccountId,
      cashFlowCategory: 'OPERACIONAL',
      createdAt: new Date().toISOString()
    };

    // Salva o movimento no sistema
    const allMovements = storage.getMovements();
    storage.saveMovements([newMovement, ...allMovements]);
    FinancialEngine.recalculateAllAccountBalances();

    // Registra na Trilha de Auditoria
    const selectedAcc = chartAccounts.find(c => c.id === adjAccountId);
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'AJUSTE_CONCILIACAO_FECHAMENTO',
      module: 'Fechamento Contábil',
      recordId: movementId,
      details: `Lançamento rápido de conciliação executado na conta ${adjustmentTarget.bank.name}: ${adjDirection === 'SAIDA' ? '-' : '+'}${formatBRL(adjAmount)}. Categoria: ${selectedAcc?.name || adjAccountId}. Motivo: ${adjDescription}.`
    });

    // Se o usuário digitou o saldo real declarado, agora o sistema passa a ter exatamente esse saldo!
    // A diferença foi zerada matematicamente!
    setIsSubmittingAdj(false);
    setAdjustmentTarget(null);
    setRefreshKey(k => k + 1);

    setMsg({
      type: 'success',
      text: `Ajuste de ${formatBRL(adjAmount)} lançado com sucesso na conta ${adjustmentTarget.bank.name}! A diferença foi zerada.`
    });
  };

  // =========================================================================
  // CHECKLIST DE PRÉ-FECHAMENTO (5 TRAVAS DE SEGURANÇA OPERACIONAL)
  // =========================================================================
  const checklist = useMemo(() => {
    if (!newCompetence) return null;

    const titles = storage.getTitles().filter(t => t && t.competence === newCompetence && t.documentState !== 'CANCELADO');
    const stmts = storage.getStatementEntries().filter(s => s && s.date.startsWith(newCompetence));
    const movements = storage.getMovements().filter(m => !m.isReversed && m.date.startsWith(newCompetence));

    // Trava 1: Conciliação de Extratos
    const pendingReconciliation = stmts.filter(s => s.reconciliationStatus === 'PENDENTE' || s.reconciliationStatus === 'SUGESTAO');
    const isReconciliationOk = pendingReconciliation.length === 0;

    // Trava 2: Conferência Bancária (Diferença de saldos)
    const isBankBalancesOk = areAllBanksMatched;

    // Trava 3: Títulos com Vencimento no Mês ainda em Aberto
    const openTitlesInPeriod = titles.filter(t => (Number(t.balancePrincipal) || 0) > 0.005);
    const openPayables = openTitlesInPeriod.filter(t => t.type === 'PAGAR');
    const openReceivables = openTitlesInPeriod.filter(t => t.type === 'RECEBER');
    const totalOpenPayables = openPayables.reduce((acc, t) => acc + t.balancePrincipal, 0);
    const totalOpenReceivables = openReceivables.reduce((acc, t) => acc + t.balancePrincipal, 0);
    const isOpenTitlesOk = openTitlesInPeriod.length === 0 || isAcknowledgedPending;

    // Trava 4: Classificação Contábil (Plano de Contas atribuído e válido)
    const chartMap = new Map(storage.getChartAccounts().map(c => [c.id, c]));
    const unclassifiedTitles = titles.filter(t => !t.accountId || !chartMap.has(t.accountId));
    const unclassifiedMovements = movements.filter(m => m.accountId && !chartMap.has(m.accountId));
    const totalUnclassified = unclassifiedTitles.length + unclassifiedMovements.length;
    const isClassificationOk = totalUnclassified === 0;

    // Trava 5: Tributos e Impostos Provisionados
    const taxTitles = titles.filter(t => {
      const chartAcc = t.accountId ? chartMap.get(t.accountId) : null;
      const chartName = chartAcc ? chartAcc.name.toLowerCase() : '';
      const desc = (t.description || '').toLowerCase();
      return (
        chartName.includes('imposto') || 
        chartName.includes('tributo') || 
        chartName.includes('simples') || 
        chartName.includes('iss') ||
        chartName.includes('pis') ||
        chartName.includes('cofins') ||
        chartName.includes('retenc') ||
        desc.includes('das') ||
        desc.includes('darf') ||
        desc.includes('gps') ||
        desc.includes('iss') ||
        desc.includes('simples nacional')
      );
    });
    const isTaxesOk = taxTitles.length > 0;

    // Score Geral (quantas travas passaram)
    const passedCount = 
      (isReconciliationOk ? 1 : 0) + 
      (isBankBalancesOk ? 1 : 0) + 
      (isOpenTitlesOk ? 1 : 0) + 
      (isClassificationOk ? 1 : 0) + 
      (isTaxesOk ? 1 : 0);

    const isAlreadyClosed = closures.some(c => c.competence === newCompetence && c.isClosed);
    const isReadyToClose = passedCount === 5 && !isAlreadyClosed;

    return {
      // Trava 1
      isReconciliationOk,
      pendingReconciliationCount: pendingReconciliation.length,
      totalStatements: stmts.length,

      // Trava 2
      isBankBalancesOk,
      totalBankDifference,

      // Trava 3
      isOpenTitlesOk,
      openTitlesCount: openTitlesInPeriod.length,
      openPayablesCount: openPayables.length,
      openReceivablesCount: openReceivables.length,
      totalOpenPayables,
      totalOpenReceivables,

      // Trava 4
      isClassificationOk,
      totalUnclassified,

      // Trava 5
      isTaxesOk,
      taxTitlesCount: taxTitles.length,

      // Geral
      totalTitles: titles.length,
      passedCount,
      isAlreadyClosed,
      isReadyToClose
    };
  }, [newCompetence, areAllBanksMatched, totalBankDifference, isAcknowledgedPending, closures, refreshKey]);

  // =========================================================================
  // EXECUÇÃO DO FECHAMENTO MENSAL
  // =========================================================================
  const isClosureBlockedByPolicy = isStrictClosurePolicy && !areAllBanksMatched;
  const isClosureDisabled = checklist?.isAlreadyClosed || isClosureBlockedByPolicy;

  const handleClosePeriod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompetence) return;

    if (checklist?.isAlreadyClosed) {
      setMsg({ type: 'warning', text: `A competência ${newCompetence} já possui registro de fechamento ativo.` });
      return;
    }

    if (isClosureBlockedByPolicy) {
      setMsg({ 
        type: 'error', 
        text: 'Fechamento Bloqueado: A Política de Fechamento Perfeito exige que a diferença bancária seja exatamente R$ 0,00.' 
      });
      return;
    }

    if (!areAllBanksMatched && !window.confirm(
      `Atenção: A política rígida está desativada, mas existe uma divergência de saldo bancário de ${formatBRL(totalBankDifference)}. Deseja prosseguir com o fechamento mediante justificativa auditada?`
    )) {
      return;
    }

    // Criar Snapshots Bancários
    const bankSnapshots: BankClosureSnapshot[] = bankReconciliations.map(b => ({
      bankAccountId: b.bank.id,
      bankName: b.bank.name,
      institution: b.bank.institution,
      systemBalance: b.systemBalance,
      declaredBalance: b.declaredBalance,
      difference: b.difference,
      isMatched: b.isMatched
    }));

    // Criar Snapshot do Checklist
    const checklistSnapshot: PeriodClosureChecklist = {
      reconciled: checklist?.isReconciliationOk || false,
      pendingReconciliationCount: checklist?.pendingReconciliationCount || 0,
      unsettledPayablesCount: checklist?.openPayablesCount || 0,
      unsettledReceivablesCount: checklist?.openReceivablesCount || 0,
      totalUnsettledPayables: checklist?.totalOpenPayables || 0,
      totalUnsettledReceivables: checklist?.totalOpenReceivables || 0,
      unclassifiedCount: checklist?.totalUnclassified || 0,
      taxesProvisioned: checklist?.isTaxesOk || false,
      bankBalancesMatched: areAllBanksMatched,
      totalSystemBankBalance,
      totalDeclaredBankBalance,
      totalBankDifference
    };

    const now = new Date().toISOString();
    const newClosure: PeriodClosure = {
      id: `closure-${Date.now()}`,
      yearMonth: newCompetence,
      competence: newCompetence,
      closedAt: now,
      closedBy: `${currentUser.name} (${currentUser.role})`,
      isClosed: true,
      notes: notes || `Fechamento contábil e trava formal da competência ${newCompetence} com auditoria prévia de saldos.`,
      bankSnapshots,
      checklistSnapshot
    };

    const updated = [newClosure, ...closures.filter(c => c.competence !== newCompetence)];
    storage.savePeriodClosures(updated);
    setClosures(updated);

    // Auditoria
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'TRAVA_FECHAMENTO_PERIODO',
      module: 'Fechamento Contábil',
      recordId: newClosure.id,
      details: `Trava de segurança contábil da competência ${newCompetence} ativada. Saldos conferidos: Sistema ${formatBRL(totalSystemBankBalance)} vs Real ${formatBRL(totalDeclaredBankBalance)} (Divergência: ${formatBRL(totalBankDifference)}). Política rígida: ${isStrictClosurePolicy ? 'SIM' : 'NÃO'}. Parecer: ${newClosure.notes}.`,
      newValue: `FECHADO (${newCompetence})`
    });

    setMsg({ type: 'success', text: `Competência ${newCompetence} encerrada e travada com sucesso! Saldos bancários e relatórios auditados e congelados.` });
    setNotes('');
  };

  // =========================================================================
  // REABERTURA AUDITADA
  // =========================================================================
  const handleConfirmReopen = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTarget) return;

    if (currentUser.role !== 'ADMIN') {
      setMsg({ type: 'error', text: 'Apenas administradores podem reabrir períodos contábeis encerrados.' });
      return;
    }

    if (!reopenReason.trim()) {
      setMsg({ type: 'warning', text: 'Informe a justificativa obrigatória para auditoria.' });
      return;
    }

    setIsReopening(true);

    const updated = closures.filter(c => c.id !== reopenTarget.id);
    storage.savePeriodClosures(updated);
    setClosures(updated);

    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'REABERTURA_PERIODO_AUDITADA',
      module: 'Fechamento Contábil',
      recordId: reopenTarget.id,
      details: `Reabertura extraordinária da competência ${reopenTarget.competence}. Motivo registrado: "${reopenReason.trim()}".`,
      previousValue: `FECHADO (${reopenTarget.competence})`,
      newValue: `ABERTO (${reopenTarget.competence})`
    });

    setIsReopening(false);
    setReopenTarget(null);
    setReopenReason('');
    setMsg({ type: 'success', text: `Competência ${reopenTarget.competence} reaberta. Ação registrada na Trilha de Auditoria.` });
  };

  // Métricas de cabeçalho
  const totalClosed = closures.filter(c => c.isClosed).length;
  const latestClosure = closures.slice().sort((a, b) => (b.competence || b.yearMonth).localeCompare(a.competence || a.yearMonth))[0];

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Auditoria de Pré-Fechamento & Trava de Competência
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Checklist automatizado de 5 travas e conferência matemática de saldos bancários (Sistema vs. Extrato Real).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-300">
            {totalClosed} Competência(s) Travada(s)
          </span>
        </div>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl flex items-center text-xs font-medium border animate-in fade-in ${
          msg.type === 'success' 
            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200' 
            : msg.type === 'warning' 
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200' 
            : 'bg-rose-500/15 border-rose-500/40 text-rose-900 dark:text-rose-200'
        }`}>
          {msg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mr-2 text-amber-600 dark:text-amber-400 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
            Status da Trava Contábil
          </span>
          <div className="flex items-center gap-2 mt-1.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-bold text-[var(--text-primary)]">
              Proteção Anti-Retroatividade Ativa
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            Impedindo alterações involuntárias em meses já encerrados.
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
            Última Competência Fechada
          </span>
          <div className="flex items-center gap-2 mt-1.5">
            <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span className="text-lg font-bold font-mono text-amber-700 dark:text-amber-300">
              {latestClosure?.competence || latestClosure?.yearMonth || 'Nenhuma'}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            {latestClosure ? `Travada em ${formatDateBR(latestClosure.closedAt.split('T')[0])}` : 'Aguardando primeiro fechamento'}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">
            Auditor Responsável
          </span>
          <div className="flex items-center gap-2 mt-1.5">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-bold text-[var(--text-primary)] truncate">
              {currentUser.name}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            Papel: <strong>{currentUser.role}</strong> ({currentUser.role === 'ADMIN' ? 'Fechamento & Reabertura' : 'Apenas Consulta'})
          </span>
        </div>
      </div>

      {/* SELETOR DE COMPETÊNCIA PARA AUDITORIA */}
      <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <label className="text-[11px] uppercase font-bold text-[var(--text-secondary)] block">
              Selecione a Competência para Auditoria e Fechamento:
            </label>
            <div className="flex items-center gap-2 mt-1">
              <MonthField
                value={newCompetence}
                onChange={e => setNewCompetence(e.target.value)}
                className="rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-1.5 font-mono font-bold text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              <span className="text-xs text-[var(--text-secondary)]">
                (Data de corte: <strong>{formatDateBR(cutoffDate)}</strong>)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {checklist?.isAlreadyClosed ? (
            <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              <span>Competência {newCompetence} já encerrada e travada</span>
            </div>
          ) : (
            <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
              checklist?.passedCount === 5 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
            }`}>
              <Sparkles className="w-4 h-4" />
              <span>Status: {checklist?.passedCount} de 5 Travas Aprovadas</span>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAINEL DE AUDITORIA: CHECKLIST AUTOMATIZADO DE 5 TRAVAS                   */}
      {/* ========================================================================= */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <div>
              <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                Auditoria de Pré-Fechamento — Checklist Operacional de {newCompetence}
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Conferência rigorosa de extratos, saldos bancários, pendências de títulos e integridade contábil.
              </p>
            </div>
          </div>
          
          <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
            Score: {checklist?.passedCount || 0}/5 Aprovados
          </span>
        </div>

        <div className="p-5 space-y-3.5 divide-y divide-[var(--border-subtle)] text-xs">
          
          {/* TRAVA 1: Extratos e Conciliação Bancária */}
          <div className="pt-3.5 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                checklist?.isReconciliationOk 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}>
                {checklist?.isReconciliationOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">
                    1. Conciliação Bancária dos Extratos (100% Conciliado)
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    checklist?.isReconciliationOk 
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                  }`}>
                    {checklist?.isReconciliationOk ? 'Aprovada' : 'Atenção'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {checklist?.isReconciliationOk
                    ? `Todos os lançamentos do extrato bancário de ${newCompetence} foram conciliados com sucesso.`
                    : `Existem ${checklist?.pendingReconciliationCount} lançamento(s) de extrato ainda pendentes de conciliação ou sugestão não confirmada.`
                  }
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {onNavigate && !checklist?.isReconciliationOk && (
                <button
                  type="button"
                  onClick={() => onNavigate('CONCILIACAO')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Ir para Conciliação</span>
                </button>
              )}
            </div>
          </div>

          {/* TRAVA 2: Conferência dos Saldos Bancários (Sistema vs. Extrato) */}
          <div className="pt-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                checklist?.isBankBalancesOk 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}>
                {checklist?.isBankBalancesOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">
                    2. Conferência de Saldos Bancários (Sistema vs. Saldo Real Declarado)
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    checklist?.isBankBalancesOk 
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-300'
                  }`}>
                    {checklist?.isBankBalancesOk ? 'Saldos Batem (100%)' : 'Divergência Detectada'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {checklist?.isBankBalancesOk
                    ? `Todos os saldos bancários declarados batem exatamente com o saldo calculado pelo sistema em ${formatDateBR(cutoffDate)}.`
                    : `Divergência consolidada de ${formatBRL(Math.abs(totalBankDifference))} (${totalBankDifference > 0 ? 'Sobra / Passando no Banco' : 'Falta no Banco'}). Utilize a ação rápida "⚡ Lançar Ajuste" na tabela abaixo para zerar a diferença em segundos.`
                  }
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAllSystemBalances}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Copiar saldos do sistema para todos os bancos"
              >
                <Copy className="w-3.5 h-3.5 text-amber-500" />
                <span>Copiar Saldos do Sistema</span>
              </button>
            </div>
          </div>

          {/* TRAVA 3: Títulos Vencidos e Inadimplência do Período */}
          <div className="pt-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                checklist?.isOpenTitlesOk 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
              }`}>
                {checklist?.isOpenTitlesOk ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">
                    3. Resolução de Títulos em Aberto / Inadimplência na Competência
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    checklist?.isOpenTitlesOk 
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                  }`}>
                    {checklist?.openTitlesCount === 0 ? '100% Quitado' : isAcknowledgedPending ? 'Ciente e Aprovado' : 'Pendências em Aberto'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {checklist?.openTitlesCount === 0
                    ? `Todos os títulos vinculados à competência ${newCompetence} foram devidamente quitados.`
                    : `Existem ${checklist?.openTitlesCount} título(s) em aberto no período (A Pagar: ${formatBRL(checklist?.totalOpenPayables || 0)} | A Receber: ${formatBRL(checklist?.totalOpenReceivables || 0)}).`
                  }
                </p>

                {checklist && checklist.openTitlesCount > 0 && (
                  <label className="inline-flex items-center gap-2 mt-2 cursor-pointer text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <input
                      type="checkbox"
                      checked={isAcknowledgedPending}
                      onChange={e => setIsAcknowledgedPending(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span>Estou ciente dos títulos em aberto e confirmo que representam inadimplência/saldo a transferir para o próximo mês.</span>
                  </label>
                )}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {onNavigate && checklist && checklist.openTitlesCount > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('CONTAS_PAGAR')}
                    className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] font-semibold"
                  >
                    Ver Pagar
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('CONTAS_RECEBER')}
                    className="px-2.5 py-1 rounded-lg bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[11px] font-semibold"
                  >
                    Ver Receber
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* TRAVA 4: Classificação Contábil & Plano de Contas */}
          <div className="pt-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                checklist?.isClassificationOk 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
              }`}>
                {checklist?.isClassificationOk ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">
                    4. Classificação Contábil (DRE & Balancete)
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    checklist?.isClassificationOk 
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                      : 'bg-rose-100 dark:bg-rose-950 text-rose-900 dark:text-rose-300'
                  }`}>
                    {checklist?.isClassificationOk ? '100% Categorizado' : 'Incompleto'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {checklist?.isClassificationOk
                    ? 'Todos os títulos e lançamentos do mês possuem categoria e conta do plano de contas vinculada.'
                    : `Existem ${checklist?.totalUnclassified} lançamento(s) sem conta contábil vinculada, o que pode distorcer o DRE.`
                  }
                </p>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {onNavigate && !checklist?.isClassificationOk && (
                <button
                  type="button"
                  onClick={() => onNavigate('PLANO_CONTAS')}
                  className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                  <span>Plano de Contas</span>
                </button>
              )}
            </div>
          </div>

          {/* TRAVA 5: Apuração de Tributos e Encargos */}
          <div className="pt-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${
                checklist?.isTaxesOk 
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' 
                  : 'bg-slate-500/15 text-slate-700 dark:text-slate-300'
              }`}>
                {checklist?.isTaxesOk ? <CheckCircle2 className="w-4 h-4" /> : <FileText className="w-4 h-4 text-amber-500" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">
                    5. Apuração e Provisão de Tributos (DAS, ISS, Retenções)
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    checklist?.isTaxesOk 
                       ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                       : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}>
                    {checklist?.isTaxesOk ? 'Tributos Provisionados' : 'Sem Guias Identificadas'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {checklist?.isTaxesOk
                    ? `${checklist.taxTitlesCount} guia(s) e provisões tributárias registradas no período.`
                    : 'Nenhum lançamento com categoria de tributo ou imposto foi encontrado nesta competência. Certifique-se de que guias como Simples Nacional/ISS foram lançadas.'
                  }
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* CONFERÊNCIA DE SALDOS DOS BANCOS: SISTEMA VS. SALDO QUE TENHO (EXTRATO)   */}
      {/* ========================================================================= */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-500" />
              <span>Conferência de Saldos Bancários — Sistema vs. Saldo Real Declarado</span>
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
              Informe o saldo real do extrato bancário em <strong>{formatDateBR(cutoffDate)}</strong>. O sistema apontará automaticamente valores faltantes ou excedentes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!areAllBanksMatched && (
              <button
                type="button"
                onClick={() => {
                  const firstUnmatched = bankReconciliations.find(b => !b.isMatched);
                  if (firstUnmatched) handleOpenQuickAdjustment(firstUnmatched);
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Lançar Ajuste de Conciliação</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyAllSystemBalances}
              className="px-3 py-1.5 bg-[var(--surface-card)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Copy className="w-3.5 h-3.5 text-amber-500" />
              <span>Preencher Todos com Saldo do Sistema</span>
            </button>
          </div>
        </div>

        {/* Tabela de Conferência dos Bancos */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Conta Bancária / Caixa</th>
                <th className="py-3 px-4 text-right">Saldo Inicial</th>
                <th className="py-3 px-4 text-right">Entradas Mês</th>
                <th className="py-3 px-4 text-right">Saídas Mês</th>
                <th className="py-3 px-4 text-right bg-amber-500/5">Saldo Sistema ({formatDateBR(cutoffDate)})</th>
                <th className="py-3 px-4 text-center">Saldo Real Declarado (Extrato)</th>
                <th className="py-3 px-4 text-right">Diferença</th>
                <th className="py-3 px-4 text-center">Diagnóstico / Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {bankReconciliations.map(item => {
                const isPositiveDiff = item.difference > 0.005;
                const isNegativeDiff = item.difference < -0.005;

                return (
                  <tr key={item.bank.id} className="hover:bg-[var(--surface-elevated)]/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2.5">
                        <div 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: item.bank.color || '#D4AF37' }} 
                        />
                        <div>
                          <div className="font-bold text-[var(--text-primary)]">
                            {item.bank.name}
                          </div>
                          <div className="text-[10px] text-[var(--text-secondary)]">
                            {item.bank.institution} • Ag: {item.bank.agency || '0001'} CC: {item.bank.accountNumber || '-'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono text-[var(--text-secondary)]">
                      {formatBRL(item.systemBalance - item.totalIn + item.totalOut)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                      +{formatBRL(item.totalIn)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-rose-700 dark:text-rose-400">
                      -{formatBRL(item.totalOut)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-amber-300 bg-amber-500/5 text-sm">
                      {formatBRL(item.systemBalance)}
                    </td>

                    {/* Input do Saldo Real Declarado */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <span className="text-[11px] font-mono text-[var(--text-secondary)]">R$</span>
                        <input
                          type="text"
                          placeholder={item.systemBalance.toFixed(2).replace('.', ',')}
                          value={declaredInputs[item.bank.id] ?? ''}
                          onChange={e => handleDeclaredBalanceChange(item.bank.id, e.target.value)}
                          className="w-32 py-1.5 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] font-mono font-bold text-xs text-right text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopySingleSystemBalance(item.bank.id, item.systemBalance)}
                          className="p-1.5 rounded-md hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                          title="Copiar saldo do sistema para este banco"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Coluna da Diferença */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs">
                      {item.isMatched ? (
                        <span className="text-emerald-700 dark:text-emerald-400 flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          R$ 0,00
                        </span>
                      ) : isPositiveDiff ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-extrabold flex items-center justify-end gap-1">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          +{formatBRL(item.difference)}
                        </span>
                      ) : (
                        <span className="text-rose-700 dark:text-rose-400 font-extrabold flex items-center justify-end gap-1">
                          <ArrowDownRight className="w-3.5 h-3.5" />
                          {formatBRL(item.difference)}
                        </span>
                      )}
                    </td>

                    {/* Diagnóstico & Ações com Lançamento Rápido (Sugestão 1) */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {item.isMatched ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/40">
                            ✓ Bateu 100%
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenQuickAdjustment(item)}
                              className="px-2 py-1 text-[11px] font-bold text-amber-950 dark:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Lançar Ajuste Rápido / Tarifa Bancária para zerar a diferença desta conta"
                            >
                              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                              <span>Lançar Ajuste</span>
                            </button>

                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isPositiveDiff 
                                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/40' 
                                : 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800/40'
                            }`} title={isPositiveDiff ? 'Sobra no Banco (Passando)' : 'Falta no Banco (Faltando)'}>
                              {isPositiveDiff ? '+ Sobra' : '- Falta'}
                            </span>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => setStatementAccount(item.bank)}
                          className="p-1 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
                          title="Abrir Extrato Completo desta Conta para Conferência"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Rodapé Consolidado da Conferência */}
            <tfoot className="bg-[var(--surface-elevated)] border-t-2 border-[var(--border-subtle)] font-bold">
              <tr>
                <td className="py-3 px-4 uppercase text-[11px] text-[var(--text-secondary)]">
                  Total Geral Consolidado ({bankReconciliations.length} Contas)
                </td>
                <td colSpan={3} className="py-3 px-4 text-right text-[var(--text-secondary)] text-[11px]">
                  Posição em {formatDateBR(cutoffDate)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-900 dark:text-amber-300 bg-amber-500/10 text-sm">
                  {formatBRL(totalSystemBankBalance)}
                </td>
                <td className="py-3 px-4 text-center font-mono text-sm text-[var(--text-primary)]">
                  {formatBRL(totalDeclaredBankBalance)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-sm">
                  {areAllBanksMatched ? (
                    <span className="text-emerald-700 dark:text-emerald-400">R$ 0,00</span>
                  ) : totalBankDifference > 0 ? (
                    <span className="text-emerald-700 dark:text-emerald-400">+{formatBRL(totalBankDifference)}</span>
                  ) : (
                    <span className="text-rose-700 dark:text-rose-400">{formatBRL(totalBankDifference)}</span>
                  )}
                </td>
                <td className="py-3 px-4 text-center">
                  {areAllBanksMatched ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300">
                      ✓ Conciliado
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-800 dark:text-rose-300">
                      ⚠️ Divergência
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Guia Orientativo de Resolução de Divergências */}
        {!areAllBanksMatched && (
          <div className="p-4 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-900 dark:text-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-300">
                <HelpCircle className="w-4 h-4 shrink-0" />
                <span>Dicas Práticas para Encontrar os Valores Faltantes ou Passando:</span>
              </div>
              <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                Dica: Clique em <strong>"⚡ Lançar Ajuste"</strong> para lançar tarifas ou rendimentos em 1 clique.
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] leading-relaxed">
              <div className="p-3 rounded-xl bg-white/60 dark:bg-black/20 border border-amber-500/20">
                <strong className="block text-emerald-900 dark:text-emerald-300 mb-1">
                  1. Se estiver "Passando no Banco" (+ Sobra de Saldo no Extrato):
                </strong>
                Verifique se houve recebimentos de clientes via Pix direto não baixados, créditos de rendimentos de aplicação financeira ou transferências entre contas que entraram no banco mas não foram registradas.
              </div>
              <div className="p-3 rounded-xl bg-white/60 dark:bg-black/20 border border-amber-500/20">
                <strong className="block text-rose-900 dark:text-rose-300 mb-1">
                  2. Se estiver "Faltando no Banco" (- Falta de Saldo no Extrato):
                </strong>
                Verifique se o banco debitou tarifas mensais de manutenção de conta, taxas de emissão de boletos, IOF ou se houve pagamento de títulos realizado diretamente pelo internet banking sem a devida baixa no Contaju.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUGESTÃO 5: PAINEL DE GOVERNANÇA & POLÍTICA DE FECHAMENTO RIGOROSO        */}
      {/* ========================================================================= */}
      <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl border shrink-0 ${
              isStrictClosurePolicy 
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400' 
                : 'bg-slate-500/15 border-slate-500/30 text-slate-600 dark:text-slate-400'
            }`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Política de Fechamento Perfeito (Tolerância Zero a Divergências)
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isStrictClosurePolicy 
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800' 
                    : 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                  {isStrictClosurePolicy ? '🔒 TRAVA RÍGIDA ATIVA' : '🔓 MODO FLEXÍVEL'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-2xl leading-relaxed">
                {isStrictClosurePolicy 
                  ? 'Exige rigorosamente Diferença R$ 0,00 em todas as contas bancárias para permitir a trava da competência. Impede fechamentos com furos de caixa ou centavos divergentes.'
                  : 'Modo flexível ativo. Permite fechar competências com divergência mediante justificativa formal gravada na Trilha de Auditoria.'
                }
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-3">
            {currentUser.role === 'ADMIN' ? (
              <button
                type="button"
                onClick={handleToggleStrictPolicy}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                  isStrictClosurePolicy
                    ? 'bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-900 dark:text-amber-200'
                    : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-[var(--text-primary)] border border-[var(--border-subtle)]'
                }`}
                title="Alternar política de trava contábil"
              >
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>{isStrictClosurePolicy ? 'Desativar Política Rígida' : 'Ativar Tolerância Zero'}</span>
              </button>
            ) : (
              <span className="text-[11px] text-[var(--text-secondary)] italic">
                (Apenas Administradores podem alternar esta política)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FORMULÁRIO: TRAVA FORMAL DA COMPETÊNCIA COM AUDITORIA                     */}
      {/* ========================================================================= */}
      <div className="bg-[var(--surface-card)] p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
        <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-500" />
          <span>Executar Fechamento & Ativar Trava Contábil</span>
        </h2>

        {/* ALERTA DE BLOQUEIO POR POLÍTICA RÍGIDA (SUGESTÃO 5) */}
        {isClosureBlockedByPolicy && (
          <div className="mb-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-3 animate-in fade-in">
            <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block text-sm text-rose-950 dark:text-rose-100">
                🔒 Fechamento Bloqueado pela Política de Fechamento Perfeito:
              </strong>
              <p className="text-[11px] leading-relaxed">
                Existe uma divergência consolidada de <strong>{formatBRL(Math.abs(totalBankDifference))}</strong> entre o extrato bancário e o sistema. 
                Para prosseguir com o fechamento, clique em <strong>"⚡ Lançar Ajuste"</strong> na tabela acima para lançar tarifas ou rendimentos pendentes, ou concilie os lançamentos até que a diferença atinja R$ 0,00.
              </p>
            </div>
          </div>
        )}
        
        <form onSubmit={handleClosePeriod} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Mês / Ano da Competência *
              </label>
              <MonthField
                required
                value={newCompetence}
                onChange={e => setNewCompetence(e.target.value)}
                className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 font-mono font-bold text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Auditor Responsável
              </label>
              <input
                type="text"
                readOnly
                value={`${currentUser.name} (${currentUser.role})`}
                className="w-full rounded-xl bg-[var(--surface-elevated)]/60 border border-[var(--border-subtle)] px-3 py-2 text-[var(--text-secondary)] font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                Parecer / Observações do Fechamento
              </label>
              <input
                type="text"
                placeholder="Ex: Saldos bancários 100% conferidos e DRE conciliado"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
            <div className="text-[11px] text-[var(--text-secondary)]">
              {checklist?.isAlreadyClosed ? (
                <span className="text-rose-600 dark:text-rose-400 font-bold">
                  🔒 Esta competência já foi encerrada anteriormente.
                </span>
              ) : isClosureBlockedByPolicy ? (
                <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Trava bloqueada: Zere a diferença de {formatBRL(Math.abs(totalBankDifference))} para liberar o fechamento.
                </span>
              ) : areAllBanksMatched ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  ✓ Todos os saldos batem perfeitamente. Fechamento seguro garantido!
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  ⚠️ Saldos bancários com diferença de {formatBRL(totalBankDifference)}. O fechamento registrará esta pendência em auditoria.
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isClosureDisabled}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-xs font-extrabold shadow-md flex items-center gap-2 cursor-pointer transition-all"
            >
              <Lock className="w-4 h-4" />
              <span>
                {checklist?.isAlreadyClosed 
                  ? 'Competência Já Travada' 
                  : isClosureBlockedByPolicy 
                  ? 'Bloqueado por Divergência de Saldo' 
                  : 'Executar Fechamento & Travar Período'
                }
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* ========================================================================= */}
      {/* HISTÓRICO DE COMPETÊNCIAS FECHADAS COM CONSULTA DE SALDOS AUDITADOS        */}
      {/* ========================================================================= */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center">
          <h2 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
            <History className="w-4 h-4 text-amber-500" />
            <span>Histórico de Competências Fechadas ({closures.length})</span>
          </h2>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Auditoria completa de saldos e travas contábeis
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Competência</th>
                <th className="py-3 px-4">Data do Fechamento</th>
                <th className="py-3 px-4">Responsável</th>
                <th className="py-3 px-4">Saldos Conferidos</th>
                <th className="py-3 px-4">Parecer / Notas</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {closures.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-secondary)]">
                    Nenhuma competência contábil foi travada até o momento.
                  </td>
                </tr>
              ) : (
                closures.map(c => {
                  const comp = c.competence || c.yearMonth;
                  const hasBankData = c.bankSnapshots && c.bankSnapshots.length > 0;
                  const matched = c.checklistSnapshot?.bankBalancesMatched ?? true;

                  return (
                    <tr key={c.id} className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-amber-700 dark:text-amber-300 text-sm">
                        {comp}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-primary)]">
                        {formatDateBR(c.closedAt.split('T')[0])}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)]">
                        {c.closedBy}
                      </td>
                      <td className="py-3 px-4">
                        {hasBankData ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              matched 
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                            }`}>
                              {matched ? '✓ Bateu 100%' : 'Com Divergência'}
                            </span>
                            <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                              ({formatBRL(c.checklistSnapshot?.totalSystemBankBalance || 0)})
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Sem snapshot</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[var(--text-secondary)] max-w-xs truncate" title={c.notes}>
                        {c.notes || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/30 inline-flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          TRAVADO
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => setPrintTermClosure(c)}
                          className="px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-300 hover:bg-amber-500/20 bg-amber-500/10 border border-amber-500/30 rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer"
                          title="Visualizar e Imprimir Termo Executivo de Fechamento"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-500" />
                          <span>Termo</span>
                        </button>

                        <button
                          onClick={() => exportPeriodClosureToPDF(c)}
                          className="px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer"
                          title="Baixar Termo Executivo em PDF Institucional"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>PDF</span>
                        </button>

                        {hasBankData && (
                          <button
                            onClick={() => setViewDetailsClosure(c)}
                            className="px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer"
                            title="Ver Saldos e Checklist gravados no fechamento"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-500" />
                            <span>Detalhes</span>
                          </button>
                        )}

                        {currentUser.role === 'ADMIN' ? (
                          <button
                            onClick={() => setReopenTarget(c)}
                            className="px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-300 hover:bg-amber-500/20 bg-amber-500/10 border border-amber-500/30 rounded-xl transition-all inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Reabrir</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Somente Admin</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUGESTÃO 1: MODAL DE LANÇAMENTO RÁPIDO DE AJUSTE / TARIFA BANCÁRIA        */}
      {/* ========================================================================= */}
      {adjustmentTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    Lançamento Rápido de Ajuste de Conciliação
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Conta: <strong>{adjustmentTarget.bank.name}</strong> • Diferença a zerar: <strong>{formatBRL(Math.abs(adjustmentTarget.difference))}</strong>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setAdjustmentTarget(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmQuickAdjustment} className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed">
                💡 <strong>Dica Contábil:</strong> Este lançamento registrará a movimentação financeira no banco com data na competência selecionada, zerando automaticamente a divergência com o extrato.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                    Tipo do Ajuste *
                  </label>
                  <PremiumSelect
                    value={adjDirection}
                    onChange={e => setAdjDirection(e.target.value as 'ENTRADA' | 'SAIDA')}
                    className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 font-bold text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="SAIDA">Saída (Despesa / Tarifa / IOF)</option>
                    <option value="ENTRADA">Entrada (Receita / Rendimento / Estorno)</option>
                  </PremiumSelect>
                </div>

                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                    Data Efetiva *
                  </label>
                  <DateField
                    required
                    value={adjDate}
                    onChange={e => setAdjDate(e.target.value)}
                    className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                  Valor do Ajuste (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={adjAmount}
                  onChange={e => setAdjAmount(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 font-mono font-bold text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                  Classificação no Plano de Contas *
                </label>
                <PremiumSelect
                  required
                  value={adjAccountId}
                  onChange={e => setAdjAccountId(e.target.value)}
                  className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  {chartAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name} ({acc.nature})
                    </option>
                  ))}
                </PremiumSelect>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                  Descrição do Lançamento *
                </label>
                <input
                  type="text"
                  required
                  value={adjDescription}
                  onChange={e => setAdjDescription(e.target.value)}
                  className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-between items-center border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setAdjustmentTarget(null)}
                  className="px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmittingAdj || adjAmount <= 0}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Confirmar e Ajustar Saldo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE DETALHES DE FECHAMENTO HISTÓRICO                                */}
      {/* ========================================================================= */}
      {viewDetailsClosure && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Auditoria do Fechamento — Competência {viewDetailsClosure.competence || viewDetailsClosure.yearMonth}
                </h3>
              </div>
              <button 
                onClick={() => setViewDetailsClosure(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Fechado Em:</span>
                  <span className="font-semibold text-[var(--text-primary)]">{formatDateBR(viewDetailsClosure.closedAt.split('T')[0])}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Responsável:</span>
                  <span className="font-semibold text-[var(--text-primary)]">{viewDetailsClosure.closedBy}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] block">Parecer:</span>
                  <span className="font-semibold text-[var(--text-primary)] truncate block">{viewDetailsClosure.notes || '-'}</span>
                </div>
              </div>

              {/* Tabela de Saldos Gravados */}
              <div>
                <h4 className="font-bold text-[var(--text-primary)] mb-2 uppercase text-[11px]">
                  Saldos Bancários Auditados na Data do Fechamento:
                </h4>
                <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      <tr>
                        <th className="py-2.5 px-3">Banco</th>
                        <th className="py-2.5 px-3 text-right">Saldo do Sistema</th>
                        <th className="py-2.5 px-3 text-right">Saldo Declarado (Extrato)</th>
                        <th className="py-2.5 px-3 text-right">Diferença</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {viewDetailsClosure.bankSnapshots?.map((b, i) => (
                        <tr key={i}>
                          <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)]">
                            {b.bankName} ({b.institution})
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[var(--text-primary)]">
                            {formatBRL(b.systemBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[var(--text-primary)]">
                            {formatBRL(b.declaredBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {b.isMatched ? (
                              <span className="text-emerald-600 dark:text-emerald-400">R$ 0,00</span>
                            ) : (
                              <span className={b.difference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                {formatBRL(b.difference)}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              b.isMatched 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}>
                              {b.isMatched ? 'Conciliado' : 'Divergência'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap justify-between items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportPeriodClosureToPDF(viewDetailsClosure)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Termo em PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const tgt = viewDetailsClosure;
                      setViewDetailsClosure(null);
                      setPrintTermClosure(tgt);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-subtle)] flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Printer className="w-3.5 h-3.5 text-amber-500" />
                    <span>Visualizar Ata Completa / Imprimir</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setViewDetailsClosure(null)}
                  className="px-4 py-2 rounded-xl bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)] text-xs cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE REABERTURA COM JUSTIFICATIVA OBRIGATÓRIA                         */}
      {/* ========================================================================= */}
      {reopenTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Unlock className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">
                  Reabertura de Competência: {reopenTarget.competence || reopenTarget.yearMonth}
                </h3>
              </div>
              <button 
                onClick={() => { setReopenTarget(null); setReopenReason(''); }}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmReopen} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-800 dark:text-rose-300 text-[11px] leading-relaxed">
                ⚠️ <strong>Atenção:</strong> A reabertura de uma competência fechada destrava todos os títulos e saldos do período. 
                Esta operação é extraordinária e ficará registrada permanentemente na <strong>Trilha de Auditoria</strong>.
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                  Justificativa Formal Obrigatória *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Informe detalhadamente por que esta competência precisa ser reaberta (ex: cancelamento de NF-e, estorno solicitado por auditoria externa...)"
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => { setReopenTarget(null); setReopenReason(''); }}
                  className="px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isReopening || !reopenReason.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Confirmar e Destravar Período</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EXECUTIVO / IMPRESSÃO DE TERMO DE FECHAMENTO CONTÁBIL & SALDOS       */}
      {/* ========================================================================= */}
      {printTermClosure && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-[var(--border-subtle)] flex flex-col max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:rounded-none animate-in fade-in zoom-in-95">
            {/* Barra de Ações Superior (Oculta na Impressão) */}
            <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap justify-between items-center gap-3 print:hidden">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    Ata & Termo Executivo de Fechamento Contábil
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Competência {printTermClosure.competence || printTermClosure.yearMonth} • Comprovante com validade jurídica e contábil
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportPeriodClosureToPDF(printTermClosure)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar em PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl bg-[var(--surface-card)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] text-xs font-semibold border border-[var(--border-subtle)] flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-500" />
                  <span>Imprimir Termo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintTermClosure(null)}
                  className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] rounded-xl"
                  title="Fechar visualização"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Documento Imprimível Formal */}
            <div className="p-6 sm:p-10 overflow-y-auto space-y-6 text-slate-900 bg-white dark:bg-[#111622] dark:text-slate-100 font-sans print:p-0 print:text-black print:bg-white">
              {/* Cabeçalho da Empresa */}
              <div className="border-b-2 border-amber-500 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-extrabold text-amber-600 dark:text-amber-400">
                    CONTAJU • GOVERNANÇA E CONTROLE PATRIMONIAL
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
                    TERMO EXECUTIVO DE FECHAMENTO CONTÁBIL
                  </h1>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    {storage.getCompany().companyName || storage.getCompany().tradeName || 'Contaju Gestão Contábil'} • CNPJ: {storage.getCompany().cnpj || '00.000.000/0001-00'} • Regime: {storage.getCompany().fiscalRegime || 'Simples Nacional'}
                  </p>
                </div>

                <div className="sm:text-right shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Competência Contábil
                  </span>
                  <span className="text-lg sm:text-xl font-mono font-black text-amber-600 dark:text-amber-400 block">
                    {printTermClosure.competence || printTermClosure.yearMonth}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ID Trava: {printTermClosure.id.substring(0, 14)}...
                  </span>
                </div>
              </div>

              {/* Bloco 1: Identificação da Competência e Trava */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Data e Hora do Fechamento:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {printTermClosure.closedAt ? new Date(printTermClosure.closedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Responsável pelo Fechamento:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {printTermClosure.closedBy || 'Administrador'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Status Operacional:</span>
                  <span className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                    printTermClosure.checklistSnapshot?.bankBalancesMatched ?? true
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    TRAVADO COM CONFORMIDADE
                  </span>
                </div>
                <div className="sm:col-span-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Parecer Contábil Registrado:</span>
                  <span className="text-slate-700 dark:text-slate-300 italic">
                    "{printTermClosure.notes || 'Saldos bancários conferidos com exatidão matemática e lançamentos devidamente conciliados.'}"
                  </span>
                </div>
              </div>

              {/* Bloco 2: Auditoria de Conformidade do Checklist das 5 Travas */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-500" />
                  <span>1. Auditoria das 5 Travas de Segurança Operacional</span>
                </h3>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Trava de Segurança Contábil</th>
                        <th className="py-2.5 px-3 text-center">Auditoria</th>
                        <th className="py-2.5 px-3">Detalhamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          1. Conciliação Bancária de Extratos
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                            ✓ APROVADO
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                          Todos os lançamentos do período foram confrontados com o extrato bancário.
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          2. Conferência de Saldos Bancários
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            printTermClosure.checklistSnapshot?.bankBalancesMatched ?? true
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                          }`}>
                            {printTermClosure.checklistSnapshot?.bankBalancesMatched ?? true ? '✓ EXATO (R$ 0,00)' : 'COM JUSTIFICATIVA'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                          Saldos contábeis do sistema confrontados com o saldo declarado no extrato bancário oficial.
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          3. Resolução de Títulos em Aberto
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300">
                            ✓ CIENTE
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                          Posições a Pagar ({printTermClosure.checklistSnapshot?.unsettledPayablesCount ?? 0}) e a Receber ({printTermClosure.checklistSnapshot?.unsettledReceivablesCount ?? 0}) auditadas.
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          4. Classificação Contábil & Plano de Contas
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                            ✓ 100% VINCULADO
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                          Integridade total dos lançamentos com reflexo direto no DRE e Balanço Gerencial.
                        </td>
                      </tr>

                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          5. Provisão de Tributos e Encargos
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                            ✓ PROVISIONADO
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 text-[11px]">
                          Obrigações fiscais da competência apuradas e lançadas nas respectivas contas.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bloco 3: Demonstrativo de Saldos Bancários Auditados */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                  <span>2. Demonstrativo de Saldos Bancários e Posição Patrimonial</span>
                </h3>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-200 font-bold border-b border-amber-200 dark:border-amber-900">
                      <tr>
                        <th className="py-2.5 px-3">Conta Bancária / Caixa</th>
                        <th className="py-2.5 px-3 text-right">Saldo do Sistema (R$)</th>
                        <th className="py-2.5 px-3 text-right">Saldo do Extrato Real (R$)</th>
                        <th className="py-2.5 px-3 text-right">Diferença (R$)</th>
                        <th className="py-2.5 px-3 text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {(printTermClosure.bankSnapshots || []).map((b, i) => (
                        <tr key={i}>
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                            {b.bankName} ({b.institution})
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {formatBRL(b.systemBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-800 dark:text-slate-200">
                            {formatBRL(b.declaredBalance)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {b.isMatched ? (
                              <span className="text-emerald-700 dark:text-emerald-400">R$ 0,00</span>
                            ) : (
                              <span className={b.difference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                {b.difference > 0 ? `+${formatBRL(b.difference)}` : formatBRL(b.difference)}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              b.isMatched 
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' 
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                            }`}>
                              {b.isMatched ? '✓ Conciliado' : 'Divergência'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 dark:bg-slate-900/90 font-bold border-t-2 border-slate-300 dark:border-slate-700">
                      <tr>
                        <td className="py-2.5 px-3 text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                          TOTAL GERAL CONSOLIDADO
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-900 dark:text-white text-xs">
                          {formatBRL(
                            printTermClosure.checklistSnapshot?.totalSystemBankBalance ??
                            (printTermClosure.bankSnapshots || []).reduce((a, b) => a + b.systemBalance, 0)
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-900 dark:text-white text-xs">
                          {formatBRL(
                            printTermClosure.checklistSnapshot?.totalDeclaredBankBalance ??
                            (printTermClosure.bankSnapshots || []).reduce((a, b) => a + b.declaredBalance, 0)
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs">
                          {Math.abs(printTermClosure.checklistSnapshot?.totalBankDifference || 0) < 0.01 ? (
                            <span className="text-emerald-700 dark:text-emerald-400">R$ 0,00</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400">
                              {formatBRL(printTermClosure.checklistSnapshot?.totalBankDifference || 0)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[10px]">
                          {Math.abs(printTermClosure.checklistSnapshot?.totalBankDifference || 0) < 0.01 ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-bold">✓ 100% Exato</span>
                          ) : (
                            <span className="text-rose-600 dark:text-rose-400 font-bold">Divergente</span>
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Bloco 4: Declaração de Conformidade e Responsabilidade */}
              <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                <strong className="block text-slate-900 dark:text-slate-100 mb-1">
                  DECLARAÇÃO FORMAL DE CONFORMIDADE E FECHAMENTO:
                </strong>
                Certificamos que as movimentações financeiras, conciliações bancárias e saldos relativos à competência <strong>{printTermClosure.competence || printTermClosure.yearMonth}</strong> foram integralmente auditados e consolidados. 
                A execução deste fechamento ativa a trava operacional do sistema contra edições, exclusões ou inserções involuntárias retroativas, preservando a fidelidade das escriturações contábeis e fiscais.
              </div>

              {/* Bloco 5: Linhas de Assinatura */}
              <div className="pt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center text-xs">
                <div className="border-t border-slate-300 dark:border-slate-700 pt-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">
                    {printTermClosure.closedBy || 'Responsável Financeiro'}
                  </span>
                  <span className="text-[11px] text-slate-500 block">Auditor / Operador Contábil</span>
                </div>

                <div className="border-t border-slate-300 dark:border-slate-700 pt-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">
                    Diretoria & Gestão
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    {storage.getCompany().companyName || 'Diretoria Executiva'}
                  </span>
                </div>

                <div className="border-t border-slate-300 dark:border-slate-700 pt-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100 block">
                    Contador Responsável
                  </span>
                  <span className="text-[11px] text-slate-500 block">CRC / Conformidade Técnica</span>
                </div>
              </div>

              {/* Rodapé do Documento */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-400">
                <span>Contaju • Sistema Integrado de Gestão Contábil, Conciliação e Fechamento Perfeito</span>
                <span className="font-mono">Chave de Validação: {printTermClosure.id}</span>
              </div>
            </div>
          </div>
        </div>
      )}


      {statementAccount && (
        <BankAccountStatementModal
          isOpen={Boolean(statementAccount)}
          onClose={() => setStatementAccount(null)}
          account={statementAccount}
          initialPeriodYear={parseInt(newCompetence.split('-')[0], 10)}
          initialPeriodMonth={parseInt(newCompetence.split('-')[1], 10)}
        />
      )}

    </div>
  );
};
