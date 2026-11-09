import React, { useState, useEffect, useMemo } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { X, Edit3, AlertCircle, CheckCircle2, FolderPlus, Wallet, Edit2, Plus, Repeat, CalendarClock, Layers, Tag } from 'lucide-react';
import { FinancialTitle, Counterparty, ChartAccount, Contract, ContractAdjustment } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, getFilteredChartAccounts, formatChartAccountSelectOptions } from '../../services/financialEngine';
import { SearchableSelect, SelectOption } from '../Common/SearchableSelect';
import { CompleteCounterpartyModal } from './CompleteCounterpartyModal';
import { QuickCreateAccountModal } from './QuickCreateAccountModal';
import { RecurringSeriesService, SeriesDetectionResult, SeriesFieldChanges } from '../../services/recurringSeriesService';
import { SeriesUpdateConfirmationModal } from './SeriesUpdateConfirmationModal';
import { ContractAdjustmentNotificationModal } from './ContractAdjustmentNotificationModal';
import { advanceCompetence, getDaysInMonth } from '../../utils/dateUtils';
import { toast } from '../../hooks/useToast';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField, MonthField } from '../Common/DateField';
import { useIsSimpleMode } from '../../hooks/useViewMode';

interface EditTitleModalProps {
  isOpen: boolean;
  title: FinancialTitle | null;
  onClose: () => void;
  onSaved: () => void;
}

export const EditTitleModal: React.FC<EditTitleModalProps> = ({
  isOpen,
  title,
  onClose,
  onSaved
}) => {
  const simple = useIsSimpleMode();
  const today = new Date().toISOString().split('T')[0];
  const [description, setDescription] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [counterpartyFilter, setCounterpartyFilter] = useState<'TODOS' | 'FORNECEDORES' | 'CLIENTES'>('TODOS');
  const [counterpartyRefreshTrigger, setCounterpartyRefreshTrigger] = useState(0);
  const [isManualCounterpartyModalOpen, setIsManualCounterpartyModalOpen] = useState(false);
  const [manualCounterpartyId, setManualCounterpartyId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState('');
  const [competence, setCompetence] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [expectedCashDate, setExpectedCashDate] = useState('');
  const [originalAmount, setOriginalAmount] = useState<number>(0);
  const [expectedBankAccountId, setExpectedBankAccountId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Estados para Ativação de Recorrência a partir do lançamento
  const [isRecurringEnabled, setIsRecurringEnabled] = useState(false);
  const [recurringStartMonth, setRecurringStartMonth] = useState('');
  const [recurringOption, setRecurringOption] = useState<'3' | '6' | '9' | '12' | '24' | '36' | 'CUSTOM'>('12');
  const [recurringCustomCount, setRecurringCustomCount] = useState<number>(12);

  // Quick account creation state
  const [isQuickAccountModalOpen, setIsQuickAccountModalOpen] = useState(false);

  // Quick counterparty creation state
  const [quickCreatedId, setQuickCreatedId] = useState<string | null>(null);
  const [openCompleteModal, setOpenCompleteModal] = useState(false);
  const [openCompleteAfterSave, setOpenCompleteAfterSave] = useState(true);

  // Estados de Baixa / Pagamento / Recebimento imediato
  const [isAlreadySettled, setIsAlreadySettled] = useState(false);
  const [settlementDate, setSettlementDate] = useState(today);
  const [settlementBankAccountId, setSettlementBankAccountId] = useState('');
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState<'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO_DEBITO' | 'DINHEIRO' | 'DEBITO_AUTOMATICO' | 'OUTROS'>('PIX');
  const [settlementDiscount, setSettlementDiscount] = useState<number>(0);
  const [settlementInterest, setSettlementInterest] = useState<number>(0);
  const [settlementBankFee, setSettlementBankFee] = useState<number>(0);
  const [settlementVoucherRef, setSettlementVoucherRef] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');

  // Estados para interceptação de alteração de valor em séries/recorrências/parcelamentos
  const [seriesModalState, setSeriesModalState] = useState<{
    isOpen: boolean;
    pendingAmount: number;
    pendingDueDate?: string;
    pendingAccountId?: string;
    pendingBankAccountId?: string;
    fieldChanges?: SeriesFieldChanges;
    seriesInfo: SeriesDetectionResult | null;
    pendingUpdates: Partial<FinancialTitle> | null;
  }>({
    isOpen: false,
    pendingAmount: 0,
    seriesInfo: null,
    pendingUpdates: null
  });

  // Estados para notificação formal de reajuste de contrato ao cliente
  const [notificationModalState, setNotificationModalState] = useState<{
    isOpen: boolean;
    contract: Contract | null;
    adjustment: ContractAdjustment | null;
  }>({
    isOpen: false,
    contract: null,
    adjustment: null
  });

  useEffect(() => {
    if (title) {
      setDescription(title.description || '');
      setCounterpartyId(title.counterpartyId || '');
      setAccountId(title.accountId || '');
      setCompetence(title.competence || '');
      setDueDate(title.dueDate || '');
      setExpectedCashDate(title.expectedCashDate || title.dueDate || '');
      setOriginalAmount(title.originalAmount || 0);
      setExpectedBankAccountId(title.expectedBankAccountId || '');
      setBarcode(title.barcode || '');
      setNotes(title.notes || '');
      setErrorMessage('');

      setIsAlreadySettled(false);
      setSettlementDate(today);
      setSettlementBankAccountId(title.expectedBankAccountId || '');
      setSettlementPaymentMethod('PIX');
      setSettlementDiscount(0);
      setSettlementInterest(0);
      setSettlementBankFee(0);
      setSettlementVoucherRef('');
      setSettlementNotes('');

      // Inicializa recorrência a partir do mês seguinte da competência do título
      setIsRecurringEnabled(false);
      const defaultNextMonth = advanceCompetence(title.competence || today.substring(0, 7), 1);
      setRecurringStartMonth(defaultNextMonth);
      setRecurringOption('12');
      setRecurringCustomCount(12);

      setSeriesModalState({
        isOpen: false,
        pendingAmount: 0,
        seriesInfo: null,
        pendingUpdates: null
      });
    }
  }, [title, isOpen]);

  // Helpers de Recorrência
  const repeatCount = useMemo(() => {
    if (recurringOption === 'CUSTOM') {
      return Math.max(1, Math.min(120, Number(recurringCustomCount) || 1));
    }
    return parseInt(recurringOption, 10) || 12;
  }, [recurringOption, recurringCustomCount]);

  const endCompetence = useMemo(() => {
    if (!recurringStartMonth || repeatCount <= 0) return '';
    return advanceCompetence(recurringStartMonth, repeatCount - 1);
  }, [recurringStartMonth, repeatCount]);

  const formatCompetenceDisplay = (comp: string) => {
    if (!comp || !comp.includes('-')) return comp;
    const [y, m] = comp.split('-');
    return `${m}/${y}`;
  };

  const getDueDayLabel = (d: string) => {
    if (!d || !d.includes('-')) return '10';
    return String(parseInt(d.split('-')[2], 10) || 10);
  };

  // Filtrar rigorosamente o plano de contas:
  // - Para RECEBER: apenas Receitas
  // - Para PAGAR: apenas Custos e Despesas
  const chartAccounts = useMemo(() => {
    if (!title) return [];
    const all = storage.getChartAccounts();
    const filtered = getFilteredChartAccounts(all, title.type);
    // Se o título já possui uma conta que não constava no filtro, preserva a conta existente
    if (accountId && !filtered.some(a => a.id === accountId)) {
      const current = all.find(a => a.id === accountId);
      if (current) {
        return [current, ...filtered];
      }
    }
    return filtered;
  }, [title?.type, accountId, isOpen]);

  const allCounterparties = useMemo(() => {
    try {
      const data = storage.getCounterparties();
      return Array.isArray(data) ? data.filter(Boolean) : [];
    } catch {
      return [];
    }
  }, [counterpartyRefreshTrigger, isOpen]);

  const bankAccounts = useMemo(() => {
    try {
      const data = storage.getBankAccounts();
      return Array.isArray(data) ? data.filter(a => a && a.status === 'ATIVO') : [];
    } catch {
      return [];
    }
  }, [isOpen]);

  // Hooks ficam ANTES do retorno antecipado (regra dos hooks do React)
  const chartAccountOptions: SelectOption[] = useMemo(() => {
    return formatChartAccountSelectOptions(chartAccounts || [], title?.type === 'RECEBER' ? 'RECEBER' : 'PAGAR');
  }, [chartAccounts, title?.type]);

  const selectedAccount = useMemo(() => {
    return (chartAccounts || []).find(a => a.id === accountId);
  }, [chartAccounts, accountId]);

  if (!isOpen || !title) return null;

  const isReceber = title.type === 'RECEBER';
  const hasSettlements = (title.settledPrincipal || 0) > 0;
  const isReconciled = title.reconciliationStatus === 'CONCILIADO' || Boolean(title.reconciledViaBank);

  const counterparties = (allCounterparties || []).filter(c => {
    if (!c) return false;
    if (isReceber) return c.type === 'CLIENTE' || c.type === 'AMBOS';
    if (counterpartyFilter === 'FORNECEDORES') return c.type === 'FORNECEDOR' || c.type === 'AMBOS';
    if (counterpartyFilter === 'CLIENTES') return c.type === 'CLIENTE' || c.type === 'AMBOS';
    return true; // TODOS
  });

  const counterpartyOptions: SelectOption[] = counterparties
    .filter(c => c && c.id)
    .map(c => {
      let typeBadge = '';
      if (c.type === 'CLIENTE') typeBadge = 'Cliente';
      else if (c.type === 'FORNECEDOR') typeBadge = 'Fornecedor';
      else if (c.type === 'AMBOS') typeBadge = 'Cliente & Forn.';

      return {
        value: c.id,
        label: c.name || 'Sem Nome',
        sublabel: c.document ? `Doc: ${c.document}` : (c.tradeName || undefined),
        badge: c.status === 'ATIVO' ? typeBadge : 'Inativo'
      };
    });

  const bankAccountOptions: SelectOption[] = [
    { value: '', label: 'Indiferente / Não definida' },
    ...bankAccounts.map(b => {
      let balanceStr = '0.00';
      try {
        const bal = FinancialEngine.getAccountBalance(b.id);
        balanceStr = Number(bal || 0).toFixed(2);
      } catch {
        balanceStr = '0.00';
      }
      return {
        value: b.id,
        label: b.name || 'Conta Bancária',
        sublabel: `${b.institution || 'Banco'} - Saldo R$ ${balanceStr}`
      };
    })
  ];

  const handleQuickCreateCounterparty = (name: string) => {
    const newId = `cp-${Date.now()}`;
    const newParty: Counterparty = {
      id: newId,
      name,
      type: isReceber ? 'CLIENTE' : (counterpartyFilter === 'CLIENTES' ? 'CLIENTE' : 'FORNECEDOR'),
      document: '',
      email: '',
      phone: '',
      status: 'ATIVO',
      createdAt: new Date().toISOString(),
      notes: 'Cadastro rápido criado via edição de título.'
    };
    storage.addCounterparty(newParty);
    setCounterpartyId(newId);
    setQuickCreatedId(newId);
  };

  const handleAccountCreated = (newAccount: ChartAccount) => {
    setAccountId(newAccount.id);
  };

  const handleCloseNotificationModal = () => {
    setNotificationModalState({
      isOpen: false,
      contract: null,
      adjustment: null
    });
    onSaved();
    onClose();
  };

  const executeFinalSave = (
    updatesToApply: Partial<FinancialTitle>,
    amountToSave: number,
    applyToSubsequent: boolean,
    seriesInfo?: SeriesDetectionResult | null
  ) => {
    if (!title) return;

    const currentUser = storage.getCurrentUser();
    const newBalance = Math.max(0, amountToSave - (title.settledPrincipal || 0));
    let createdContract: Contract | undefined = undefined;
    let createdAdjustment: ContractAdjustment | undefined = undefined;

    if (applyToSubsequent && seriesInfo && seriesInfo.subsequentOpenTitles.length > 0) {
      const result = RecurringSeriesService.executeSeriesUpdate({
        targetTitleId: title.id,
        newAmount: amountToSave,
        updates: updatesToApply,
        applyToSubsequent: true,
        subsequentTitleIds: seriesInfo.subsequentOpenTitles.map(t => t.id),
        contractId: title.contractId,
        propagateDueDay: true,
        propagateAccount: true,
        propagateBankAccount: true,
        currentUser
      });

      createdContract = result.contract;
      createdAdjustment = result.adjustment;

      toast.success(
        `Atualização em lote concluída com sucesso! ${result.updatedCount} lançamento(s) em aberto foram atualizados.`
      );
    } else {
      storage.updateTitle(title.id, {
        ...updatesToApply,
        originalAmount: Number(amountToSave),
        balancePrincipal: newBalance
      });

      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'EDICAO_TITULO',
        module: isReceber ? 'Contas a Receber' : 'Contas a Pagar',
        recordId: title.id,
        details: `Edição do título ${title.titleNumber} (${updatesToApply.description || title.description}). Valor: ${formatBRL(amountToSave)}, Vencimento: ${updatesToApply.dueDate || title.dueDate}.`
      });

      if (seriesInfo && seriesInfo.isSeries) {
        toast.success(isReceber ? 'Receita atualizada com sucesso!' : 'Despesa atualizada com sucesso!');
      }
    }

    // Se ativou a recorrência para os próximos meses, gerar os lançamentos subsequentes com segurança
    if (isRecurringEnabled && repeatCount > 0 && recurringStartMonth) {
      const now = new Date().toISOString();
      const existingTitles = storage.getTitles();
      const newRecurringTitles: FinancialTitle[] = [];

      let baseDueDay = 10;
      if (dueDate && dueDate.includes('-')) {
        baseDueDay = parseInt(dueDate.split('-')[2], 10) || 10;
      }

      const cleanTitleNumber = (title.titleNumber || 'TIT').split(' - ')[0];

      for (let i = 0; i < repeatCount; i++) {
        const targetComp = advanceCompetence(recurringStartMonth, i);
        const [tYear, tMonth] = targetComp.split('-').map(Number);
        const maxDays = getDaysInMonth(tYear, tMonth);
        const actualDay = Math.min(baseDueDay, maxDays);
        const targetDueDate = `${targetComp}-${String(actualDay).padStart(2, '0')}`;

        // Verifica se já existe um lançamento com os mesmos dados fundamentais no mesmo mês para evitar duplicidade
        const alreadyExists = existingTitles.some(
          et => et.counterpartyId === counterpartyId && 
                et.competence === targetComp && 
                et.type === title.type &&
                et.description === description.trim() &&
                et.documentState !== 'CANCELADO'
        );
        if (alreadyExists) continue;

        const newId = `title-rec-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 6)}`;
        const newTitleNumber = `${cleanTitleNumber} - ${targetComp}`;

        newRecurringTitles.push({
          id: newId,
          companyId: title.companyId || 'comp-1',
          titleNumber: newTitleNumber,
          type: title.type,
          counterpartyId,
          description: description.trim(),
          launchDate: today,
          issueDate: today,
          competence: targetComp,
          dueDate: targetDueDate,
          expectedCashDate: targetDueDate,
          originalAmount: Number(amountToSave),
          settledPrincipal: 0,
          balancePrincipal: Number(amountToSave),
          accruedInterest: 0,
          accruedFine: 0,
          documentState: 'CONFIRMADO',
          settlementState: 'ABERTO',
          originType: title.type === 'PAGAR' ? 'RECORRENCIA_PAGAR' : (title.originType === 'CONTRATO' ? 'CONTRATO' : 'MANUAL'),
          accountId,
          expectedBankAccountId: settlementBankAccountId || expectedBankAccountId || undefined,
          barcode: barcode.trim() || undefined,
          notes: notes.trim() ? `${notes.trim()} [Recorrência]` : 'Lançamento recorrente mensal gerado via edição',
          createdAt: now,
          updatedAt: now
        });
      }

      if (newRecurringTitles.length > 0) {
        storage.saveTitles([...newRecurringTitles, ...existingTitles]);
        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: title.type === 'PAGAR' ? 'NOVO_TITULO_RECORRENTE' : 'NOVO_TITULO_MANUAL',
          module: isReceber ? 'Contas a Receber' : 'Contas a Pagar',
          recordId: newRecurringTitles[0].id,
          details: `Ativação de recorrência a partir do título ${title.titleNumber}. Gerados ${newRecurringTitles.length} lançamentos (${formatCompetenceDisplay(recurringStartMonth)} até ${formatCompetenceDisplay(endCompetence)}) no valor unitário de ${formatBRL(amountToSave)}.`
        });
        toast.success(`Recorrência ativada com sucesso! ${newRecurringTitles.length} lançamento(s) foram gerados para os próximos meses.`);
      }
    }

    // Se marcou como liquidado agora, efetuar a baixa do saldo remanescente
    if (isAlreadySettled && newBalance > 0) {
      FinancialEngine.postSettlement({
        titleId: title.id,
        settlementDate,
        bankAccountId: settlementBankAccountId,
        principalSettled: newBalance,
        discount: settlementDiscount,
        interest: settlementInterest,
        fine: 0,
        bankFee: isReceber ? settlementBankFee : 0,
        voucherRef: settlementVoucherRef.trim() || undefined,
        notes: settlementNotes.trim() 
          ? `${settlementNotes.trim()} [${settlementPaymentMethod}]` 
          : `Baixa realizada na edição do título [${settlementPaymentMethod}]`
      });
    }

    // Se houve reajuste em contrato recorrente, abrir modal de notificação ao cliente
    if (createdContract && createdAdjustment) {
      setNotificationModalState({
        isOpen: true,
        contract: createdContract,
        adjustment: createdAdjustment
      });
      return;
    }

    if (quickCreatedId && openCompleteAfterSave) {
      setOpenCompleteModal(true);
    } else {
      onSaved();
      onClose();
    }
  };

  const handleConfirmSeriesChoice = (applyToSubsequent: boolean) => {
    if (!seriesModalState.pendingUpdates) return;
    const updates = seriesModalState.pendingUpdates;
    const amt = seriesModalState.pendingAmount;
    const info = seriesModalState.seriesInfo;

    setSeriesModalState({
      isOpen: false,
      pendingAmount: 0,
      seriesInfo: null,
      pendingUpdates: null
    });

    executeFinalSave(updates, amt, applyToSubsequent, info);
  };

  const handleCancelSeriesChoice = () => {
    setSeriesModalState(prev => ({ ...prev, isOpen: false }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!counterpartyId) {
      setErrorMessage(isReceber ? 'Selecione o cliente.' : 'Selecione o fornecedor.');
      return;
    }
    if (!description.trim()) {
      setErrorMessage('Informe a descrição do lançamento.');
      return;
    }
    if (!accountId) {
      setErrorMessage('Selecione uma conta analítica do plano de contas.');
      return;
    }
    if (originalAmount <= 0) {
      setErrorMessage('O valor do título deve ser superior a zero.');
      return;
    }

    if (hasSettlements && originalAmount < title.settledPrincipal) {
      setErrorMessage(
        `O valor original (${formatBRL(originalAmount)}) não pode ser inferior ao valor já baixado (${formatBRL(title.settledPrincipal)}).`
      );
      return;
    }

    if (FinancialEngine.isPeriodClosed(title.competence)) {
      setErrorMessage(`A competência atual deste título (${title.competence}) encontra-se FECHADA e travada para alterações contábeis. Reabra o período no Fechamento Mensal para realizar modificações.`);
      return;
    }

    if (FinancialEngine.isPeriodClosed(competence)) {
      setErrorMessage(`A competência informada (${competence}) encontra-se FECHADA e travada para alterações.`);
      return;
    }

    // Validações da ativação de recorrência
    if (isRecurringEnabled) {
      if (!recurringStartMonth) {
        setErrorMessage('Informe o mês a partir do qual a recorrência começará.');
        return;
      }
      if (FinancialEngine.isPeriodClosed(recurringStartMonth)) {
        setErrorMessage(`O mês inicial da recorrência (${recurringStartMonth}) encontra-se FECHADO e travado para lançamentos contábeis.`);
        return;
      }
      if (repeatCount <= 0) {
        setErrorMessage('A quantidade de repetições deve ser de pelo menos 1 mês.');
        return;
      }
    }

    const currentUser = storage.getCurrentUser();
    if (currentUser.role === 'CONSULTA') {
      setErrorMessage('Perfil de consulta não possui permissão para editar títulos.');
      return;
    }

    if (isReconciled) {
      setErrorMessage('Este título está conciliado via banco e não pode ser editado. Desfaça a conciliação bancária primeiro na tela de Conciliação.');
      return;
    }

    // Se marcou para liquidar/baixar agora o saldo restante
    if (isAlreadySettled) {
      if (!settlementBankAccountId) {
        setErrorMessage('Selecione a conta bancária onde ocorreu a movimentação.');
        return;
      }
      if (settlementDate > today) {
        setErrorMessage('A data da liquidação não pode ser futura.');
        return;
      }
      const settlementMonth = settlementDate.substring(0, 7);
      if (FinancialEngine.isPeriodClosed(settlementMonth)) {
        setErrorMessage(`O mês da liquidação (${settlementMonth}) encontra-se encerrado para alterações.`);
        return;
      }
    }

    const updatesPayload: Partial<FinancialTitle> = {
      description: description.trim(),
      counterpartyId,
      accountId,
      competence,
      dueDate,
      expectedCashDate: dueDate, // Oculto da interface, leva em conta a data de vencimento
      expectedBankAccountId: settlementBankAccountId || expectedBankAccountId || undefined,
      barcode: barcode.trim() || undefined,
      notes,
      originType: isRecurringEnabled && title.type === 'PAGAR' ? 'RECORRENCIA_PAGAR' : title.originType
    };

    // Verificar se houve alteração no valor, vencimento, categoria ou conta bancária
    const fieldChanges = RecurringSeriesService.detectFieldChanges(title, {
      originalAmount: Number(originalAmount),
      dueDate,
      accountId,
      expectedBankAccountId: settlementBankAccountId || expectedBankAccountId
    });

    if (fieldChanges.hasAnyChange) {
      const seriesInfo = RecurringSeriesService.detectSeries(title);
      // Se pertence a uma série e há meses/parcelas seguintes em aberto
      if (seriesInfo.isSeries && seriesInfo.subsequentOpenTitles.length > 0) {
        setSeriesModalState({
          isOpen: true,
          pendingAmount: Number(originalAmount),
          pendingDueDate: dueDate,
          pendingAccountId: accountId,
          pendingBankAccountId: settlementBankAccountId || expectedBankAccountId,
          fieldChanges,
          seriesInfo,
          pendingUpdates: updatesPayload
        });
        return;
      }
    }

    // Sem alteração de série ou sem parcelas seguintes em aberto: salvar diretamente
    executeFinalSave(updatesPayload, Number(originalAmount), false, null);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div 
          className="bg-white dark:bg-[#131316] rounded-none sm:rounded-3xl shadow-2xl max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden border border-slate-200 dark:border-[#26262b] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 my-0 sm:my-4 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          
          {/* Header Fixo com Ampla Proporção */}
          <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/80 z-10">
            <div className="flex items-center space-x-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isReceber ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400'
              }`}>
                <Edit3 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
                  <span>{simple ? (isReceber ? 'Editar recebimento' : 'Editar despesa') : 'Editar Lançamento:'}</span>
                  <span className="adv-only font-mono text-amber-600 dark:text-amber-400">{title.titleNumber}</span>
                  <span className={`adv-only text-[10px] sm:text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                    isReceber ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                  }`}>
                    {isReceber ? 'Conta a Receber' : 'Conta a Pagar'}
                  </span>
                </h2>
                <p className="adv-only text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Visualização ampla: ajuste Favorecido/Cliente, valores, competência, vencimento e Plano de Contas
                </p>
              </div>
            </div>
            <button 
              type="button"
              onClick={onClose} 
              className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {errorMessage && (
            <div className="shrink-0 mx-4 sm:mx-6 mt-3 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-center text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {hasSettlements && (
            <div className="shrink-0 mx-4 sm:mx-6 mt-3 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-800 dark:text-amber-300">
              ⚠️ Este lançamento possui baixas parciais ({formatBRL(title.settledPrincipal)} baixados de {formatBRL(title.originalAmount)}). O valor original não pode ser reduzido abaixo do total já baixado.
            </div>
          )}

          {isReconciled && (
            <div className="shrink-0 mx-4 sm:mx-6 mt-3 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                🔒 Este lançamento está <strong>conciliado via banco</strong> e está protegido contra alterações diretas. Para editar valores, datas ou dados contábeis, desfaça a conciliação na tela de <strong>Conciliação Bancária</strong>.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs pb-28 sm:pb-6 scroll-smooth [scroll-padding-bottom:7rem]">
            
            {/* Grid Principal dos Campos com Ampla Proporção */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 sm:gap-4">
              
              {/* Fornecedor / Favorecido / Cliente */}
              <div className="md:col-span-8">
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <label className="block font-semibold text-slate-800 dark:text-slate-200">
                      {isReceber ? 'Cliente *' : 'Fornecedor ou Cliente *'}
                    </label>
                    {!isReceber && (
                      <div className="flex items-center gap-1 text-[10px] bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setCounterpartyFilter('TODOS')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                            counterpartyFilter === 'TODOS' ? 'bg-amber-500 text-[var(--text-primary)] shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setCounterpartyFilter('FORNECEDORES')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                            counterpartyFilter === 'FORNECEDORES' ? 'bg-amber-500 text-[var(--text-primary)] shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Forn.
                        </button>
                        <button
                          type="button"
                          onClick={() => setCounterpartyFilter('CLIENTES')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                            counterpartyFilter === 'CLIENTES' ? 'bg-amber-500 text-[var(--text-primary)] shadow-2xs font-bold' : 'text-slate-600 dark:text-slate-400'
                          }`}
                          title="Permite selecionar clientes cadastrados dos quais você comprou"
                        >
                          Clientes
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {counterpartyId && (
                      <button
                        type="button"
                        onClick={() => {
                          setManualCounterpartyId(counterpartyId);
                          setIsManualCounterpartyModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                        title="Editar cadastro completo desta contraparte"
                      >
                        <Edit2 className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>Editar Cadastro</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setManualCounterpartyId('NEW');
                        setIsManualCounterpartyModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
                      title={isReceber ? 'Cadastrar novo cliente' : 'Cadastrar novo fornecedor ou cliente'}
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isReceber ? 'Novo Cliente' : 'Novo Favorecido'}</span>
                    </button>
                  </div>
                </div>
                <SearchableSelect
                  options={counterpartyOptions}
                  value={counterpartyId}
                  onChange={setCounterpartyId}
                  placeholder="Pesquise por nome, CNPJ/CPF ou cadastre..."
                  searchPlaceholder="Digite o nome do favorecido..."
                  allowQuickCreate={true}
                  quickCreateLabel={(q) => `+ Cadastrar rápido "${q}"`}
                  onQuickCreate={handleQuickCreateCounterparty}
                  required
                />
              </div>

              {/* Valor Original R$ */}
              <div className="md:col-span-4">
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  {simple ? 'Valor (R$) *' : 'Valor Original (R$) *'}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-bold text-slate-400">R$</span>
                  <MoneyField value={originalAmount} onChange={setOriginalAmount} className="w-full rounded-xl sm:rounded-2xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] pl-10 pr-3 py-2.5 font-bold text-slate-900 dark:text-amber-400 text-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 focus:outline-none min-h-[42px] sm:min-h-[46px]" required />
                </div>
              </div>

              {/* Descrição do Título */}
              <div className="md:col-span-12">
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1">
                  {simple ? 'Descrição *' : 'Descrição do Lançamento *'}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Fornecimento de Licenças de TI, Honorários de Consultoria, Aluguel..."
                  className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              {/* SEÇÃO AMPLA E DEDICADA: PLANO DE CONTAS */}
              <div className="md:col-span-12 p-4 sm:p-5 bg-slate-50 dark:bg-[#1b1b20]/70 border border-slate-200 dark:border-[#26262b] rounded-2xl sm:rounded-3xl space-y-3 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        {simple ? 'Categoria *' : (isReceber ? 'Classificação de Receitas (Plano de Contas DRE) *' : 'Classificação de Custos & Despesas (Plano de Contas DRE) *')}
                      </label>
                      <span className="adv-only text-[11px] text-slate-500 dark:text-slate-400">
                        Selecione a conta analítica para apuração precisa na DRE Gerencial e no Fluxo de Caixa
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`adv-only text-[10px] sm:text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                      isReceber 
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    }`}>
                      {isReceber ? '✓ Apenas Receitas' : '✓ Apenas Custos & Despesas'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsQuickAccountModalOpen(true)}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
                      <span>{simple ? '+ Nova categoria' : '+ Criar Nova Conta'}</span>
                    </button>
                  </div>
                </div>

                {/* Seletor com Visual Amplo, Altura Generosa e Busca Rápida */}
                <SearchableSelect
                  options={simple ? chartAccountOptions.map(o => ({ ...o, label: String(o.label).replace(/^[\d.]+\s*-\s*/, ''), sublabel: undefined, badge: undefined })) : chartAccountOptions}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder={isReceber ? "Pesquise ou selecione a conta analítica de receitas..." : "Pesquise ou selecione a conta analítica de custos ou despesas..."}
                  searchPlaceholder="Digite código contábil (ex: 4.1.01) ou descrição da conta..."
                  size="lg"
                  maxDropdownHeight="max-h-[380px] sm:max-h-[440px]"
                  required
                />

                {/* Card Informativo com a Conta Selecionada */}
                {selectedAccount && (
                  <div className="adv-only p-3.5 bg-white dark:bg-[#131316] rounded-2xl border border-slate-200 dark:border-[#26262b] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        {selectedAccount.code}
                      </span>
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {selectedAccount.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {selectedAccount.group || (isReceber ? 'Receitas Operacionais' : 'Custos e Despesas Operacionais')} • Natureza {selectedAccount.nature || 'ANALÍTICA'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                      ✓ Conta Analítica Ativa
                    </span>
                  </div>
                )}
              </div>

              {/* Datas e Banco em 3 Colunas Equilibradas */}
              <div className="md:col-span-4 adv-only">
                <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold mb-1">
                  Competência Contábil *
                </label>
                <MonthField
                  value={competence}
                  onChange={(e) => setCompetence(e.target.value)}
                  style={{ colorScheme: 'light dark' }}
                  className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white px-3 py-2.5 text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div className="md:col-span-4">
                <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold mb-1">
                  Data de Vencimento *
                </label>
                <DateField
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setExpectedCashDate(e.target.value);
                    if (simple && e.target.value) setCompetence(e.target.value.substring(0, 7));
                  }}
                  style={{ colorScheme: 'light dark' }}
                  className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white px-3 py-2.5 text-xs sm:text-sm font-medium"
                  required
                />
              </div>

              <div className="md:col-span-4 adv-only">
                <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold mb-1">
                  Conta Bancária Prevista
                </label>
                <SearchableSelect
                  options={bankAccountOptions}
                  value={expectedBankAccountId}
                  onChange={setExpectedBankAccountId}
                  placeholder="Selecione o banco..."
                />
              </div>

              {/* Linha Digitável e Observações */}
              <div className="md:col-span-6">
                <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold mb-1">
                  {simple ? 'Código de barras do boleto' : 'Linha Digitável / Código de Barras do Boleto'}
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Ex: 34191.79001 01043.510047 91020.150008 5 98450000185000"
                  className="w-full font-mono text-xs rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white px-3.5 py-2.5 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-6">
                <label className="block text-slate-700 dark:text-slate-300 text-xs font-semibold mb-1">
                  {simple ? 'Observações' : 'Observações (Opcional)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informações adicionais, centro de custo, etc..."
                  className="w-full rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white px-3.5 py-2.5 text-xs sm:text-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* SEÇÃO DE ATIVAÇÃO DE RECORRÊNCIA */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              isRecurringEnabled
                ? 'bg-purple-50/70 dark:bg-purple-950/25 border-purple-300 dark:border-purple-800 shadow-xs'
                : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRecurringEnabled}
                    onChange={(e) => setIsRecurringEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Repeat className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    {simple ? 'Repetir nos próximos meses' : 'Ativar recorrência para os próximos meses'}
                  </span>
                </label>

                {isRecurringEnabled && (
                  <span className="adv-only text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    🔄 Recorrência Ativada
                  </span>
                )}
              </div>

              {isRecurringEnabled && (
                <div className="mt-3 pt-3 border-t border-purple-200/80 dark:border-purple-800/60 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-[11px] font-semibold mb-1">
                        A partir de qual mês começar *
                      </label>
                      <MonthField
                        value={recurringStartMonth}
                        onChange={(e) => setRecurringStartMonth(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
                        required={isRecurringEnabled}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 block">
                        Sugestão: próximo mês após a competência atual
                      </span>
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 text-[11px] font-semibold mb-1">
                        Quantas vezes vai ser (Duração) *
                      </label>
                      <PremiumSelect
                        value={recurringOption}
                        onChange={(e) => setRecurringOption(e.target.value as any)}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium cursor-pointer"
                        required={isRecurringEnabled}
                      >
                        <option value="3">3 meses (Trimestral)</option>
                        <option value="6">6 meses (Semestral)</option>
                        <option value="9">9 meses</option>
                        <option value="12">12 meses (1 ano)</option>
                        <option value="24">24 meses (2 anos)</option>
                        <option value="36">36 meses (3 anos)</option>
                        <option value="CUSTOM">Período personalizado...</option>
                      </PremiumSelect>
                    </div>
                  </div>

                  {recurringOption === 'CUSTOM' && (
                    <div className="p-2.5 bg-white dark:bg-slate-800/80 rounded-lg border border-purple-200 dark:border-purple-800/60">
                      <label className="block text-slate-700 dark:text-slate-300 text-[11px] font-semibold mb-1">
                        Informe a quantidade de meses repetidos (2 a 120):
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="120"
                        value={recurringCustomCount || ''}
                        onChange={(e) => setRecurringCustomCount(Math.max(2, Math.min(120, parseInt(e.target.value, 10) || 2)))}
                        className="w-full sm:w-48 rounded-md border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold"
                        placeholder="Ex: 18"
                        required={isRecurringEnabled && recurringOption === 'CUSTOM'}
                      />
                    </div>
                  )}

                  {/* Resumo dinâmico em tempo real */}
                  <div className="p-3 bg-purple-100/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-purple-900 dark:text-purple-200">
                      <CalendarClock className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span>Resumo da Programação Recorrente</span>
                    </div>
                    <p className="text-purple-950 dark:text-purple-200 leading-relaxed text-[11px]">
                      Serão gerados <strong>{repeatCount} novos lançamentos recorrentes</strong> mensais de <strong>{formatCompetenceDisplay(recurringStartMonth)}</strong> até <strong>{formatCompetenceDisplay(endCompetence)}</strong> no valor de <strong>{formatBRL(originalAmount)}</strong> cada.
                    </p>
                    <div className="flex items-center justify-between pt-1 border-t border-purple-200/60 dark:border-purple-800/60 text-[11px] text-purple-800 dark:text-purple-300">
                      <span>Vencimento programado: <strong>Todo dia {getDueDayLabel(dueDate)}</strong></span>
                      <span>Total futuro: <strong>{formatBRL(originalAmount * repeatCount)}</strong></span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEÇÃO DE BAIXA / LIQUIDAÇÃO IMEDIATA (se o título ainda possuir saldo a quitar) */}
            {title.balancePrincipal > 0 && (
              <div className={`p-3.5 rounded-xl border transition-all ${
                isAlreadySettled
                  ? (isReceber ? 'bg-[var(--status-success-bg)] border-[var(--status-success)]/40' : 'bg-[var(--status-danger-bg)] border-[var(--status-danger)]/40')
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isAlreadySettled}
                      onChange={(e) => {
                        setIsAlreadySettled(e.target.checked);
                        if (e.target.checked && !settlementBankAccountId && bankAccounts.length > 0) {
                          setSettlementBankAccountId(bankAccounts[0].id);
                        }
                      }}
                      className={`w-4 h-4 rounded border-slate-300 ${
                        isReceber ? 'text-emerald-600 focus:ring-emerald-500' : 'text-rose-600 focus:ring-rose-500'
                      }`}
                    />
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <Wallet className={`w-4 h-4 ${isReceber ? 'text-emerald-600' : 'text-rose-600'}`} />
                      {isReceber
                        ? (simple ? 'Já foi recebido?' : `Marcar como já recebido agora? (Saldo de ${formatBRL(title.balancePrincipal)})`)
                        : (simple ? 'Já foi pago?' : `Marcar como já pago agora? (Saldo de ${formatBRL(title.balancePrincipal)})`)}
                    </span>
                  </label>

                  {isAlreadySettled && (
                    <span className={`adv-only text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                      isReceber ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200'
                    }`}>
                      {isReceber ? '✓ Receber Agora' : '✓ Pagar Agora'}
                    </span>
                  )}
                </div>

                {isAlreadySettled && (
                  <div className="mt-3 pt-3 border-t border-slate-200/90 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-slate-700 text-[11px] font-semibold mb-1">
                          {isReceber ? 'Data do Recebimento *' : 'Data do Pagamento *'}
                        </label>
                        <DateField
                          max={today}
                          value={settlementDate}
                          onChange={(e) => setSettlementDate(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium"
                          required={isAlreadySettled}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-700 text-[11px] font-semibold mb-1">
                          {simple ? (isReceber ? 'Em qual conta caiu? *' : 'De qual conta saiu? *') : (isReceber ? 'Conta de Crédito *' : 'Conta de Débito *')}
                        </label>
                        <PremiumSelect
                          value={settlementBankAccountId}
                          onChange={(e) => setSettlementBankAccountId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium"
                          required={isAlreadySettled}
                        >
                          <option value="">Selecione a conta...</option>
                          {bankAccounts.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.institution})
                            </option>
                          ))}
                        </PremiumSelect>
                      </div>

                      <div>
                        <label className="block text-slate-700 text-[11px] font-semibold mb-1">
                          Forma de Pagamento
                        </label>
                        <PremiumSelect
                          value={settlementPaymentMethod}
                          onChange={(e) => setSettlementPaymentMethod(e.target.value as any)}
                          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium"
                        >
                          <option value="PIX">PIX</option>
                          <option value="BOLETO">Boleto Bancário</option>
                          <option value="TRANSFERENCIA">Transferência</option>
                          <option value="CARTAO_DEBITO">Cartão de Débito</option>
                          <option value="DINHEIRO">Dinheiro em Espécie</option>
                          <option value="DEBITO_AUTOMATICO">Débito Automático</option>
                          <option value="OUTROS">Outros</option>
                        </PremiumSelect>
                      </div>
                    </div>

                    <div className="adv-only grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div>
                        <label className="block text-slate-600 text-[10px] font-medium mb-1">
                          Desconto (R$)
                        </label>
                        <MoneyField value={settlementDiscount} onChange={setSettlementDiscount} className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white" />
                      </div>

                      <div>
                        <label className="block text-slate-600 text-[10px] font-medium mb-1">
                          Juros / Multa (R$)
                        </label>
                        <MoneyField value={settlementInterest} onChange={setSettlementInterest} className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white" />
                      </div>

                      {isReceber && (
                        <div>
                          <label className="block text-slate-600 text-[10px] font-medium mb-1">
                            Tarifa Retida (R$)
                          </label>
                          <MoneyField value={settlementBankFee} onChange={setSettlementBankFee} className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white" />
                        </div>
                      )}

                      <div>
                        <label className="block text-slate-600 text-[10px] font-medium mb-1">
                          Nº Comprovante
                        </label>
                        <input
                          type="text"
                          value={settlementVoucherRef}
                          onChange={(e) => setSettlementVoucherRef(e.target.value)}
                          placeholder="Doc / Comprovante"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium">
                      <span className="text-slate-600">{simple ? (isReceber ? 'Valor que você vai receber:' : 'Valor que você vai pagar:') : 'Líquido a movimentar na conta:'}</span>
                      <span className={`font-bold ${isReceber ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatBRL(
                          Math.max(
                            0,
                            (originalAmount - title.settledPrincipal) 
                            - settlementDiscount 
                            + settlementInterest 
                            - (isReceber ? settlementBankFee : 0)
                          )
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {quickCreatedId && (
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="completeAfterEdit"
                  checked={openCompleteAfterSave}
                  onChange={(e) => setOpenCompleteAfterSave(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="completeAfterEdit" className="text-slate-700 cursor-pointer text-xs">
                  Abrir modal para completar cadastro de cliente/fornecedor após salvar
                </label>
              </div>
            )}

            </div>

            {/* Footer Fixo */}
            <div className="shrink-0 sticky bottom-0 bg-white/95 dark:bg-[#131316]/95 backdrop-blur border-t border-slate-200 dark:border-[#26262b] p-3 sm:p-4 z-10 flex items-center justify-end gap-3 shadow-lg">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#26262b] rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isReconciled}
                className={`min-h-[42px] px-6 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center ${
                  isReconciled
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-300 dark:border-slate-700'
                    : 'text-[var(--text-primary)] bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 cursor-pointer shadow-amber-500/10'
                }`}
                title={isReconciled ? 'Este título está conciliado via banco e não pode ser alterado diretamente.' : undefined}
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" />
                <span>{isReconciled ? (simple ? 'Bloqueado' : 'Bloqueado (Conciliado via Banco)') : 'Salvar Alterações'}</span>
              </button>
            </div>

          </form>

        </div>
      </div>

      {openCompleteModal && quickCreatedId && (
        <CompleteCounterpartyModal
          isOpen={true}
          counterpartyId={quickCreatedId}
          onClose={() => {
            setOpenCompleteModal(false);
            onSaved();
            onClose();
          }}
          onSaved={() => {
            setOpenCompleteModal(false);
            onSaved();
            onClose();
          }}
        />
      )}

      {isQuickAccountModalOpen && (
        <QuickCreateAccountModal
          isOpen={true}
          titleType={title.type}
          onClose={() => setIsQuickAccountModalOpen(false)}
          onAccountCreated={handleAccountCreated}
        />
      )}

      {/* Modal Manual de Criação / Edição de Favorecido */}
      <CompleteCounterpartyModal
        isOpen={isManualCounterpartyModalOpen}
        counterpartyId={manualCounterpartyId}
        defaultType={isReceber ? 'CLIENTE' : 'FORNECEDOR'}
        onClose={() => {
          setIsManualCounterpartyModalOpen(false);
          setManualCounterpartyId(null);
        }}
        onSaved={(savedParty) => {
          setCounterpartyRefreshTrigger(prev => prev + 1);
          if (manualCounterpartyId === 'NEW') {
            setCounterpartyId(savedParty.id);
          }
        }}
      />

      {/* Modal de Confirmação para Atualização em Lote de Recorrências e Parcelamentos */}
      {seriesModalState.isOpen && seriesModalState.seriesInfo && (
        <SeriesUpdateConfirmationModal
          isOpen={seriesModalState.isOpen}
          targetTitle={title}
          newAmount={seriesModalState.pendingAmount}
          newDueDate={seriesModalState.pendingDueDate}
          newAccountId={seriesModalState.pendingAccountId}
          newBankAccountId={seriesModalState.pendingBankAccountId}
          fieldChanges={seriesModalState.fieldChanges}
          seriesInfo={seriesModalState.seriesInfo}
          onConfirm={handleConfirmSeriesChoice}
          onCancel={handleCancelSeriesChoice}
        />
      )}

      {/* Modal de Notificação Formal de Reajuste ao Cliente (WhatsApp / E-mail) */}
      {notificationModalState.isOpen && notificationModalState.contract && notificationModalState.adjustment && (
        <ContractAdjustmentNotificationModal
          isOpen={notificationModalState.isOpen}
          contract={notificationModalState.contract}
          adjustment={notificationModalState.adjustment}
          onClose={handleCloseNotificationModal}
        />
      )}
    </>
  );
};
