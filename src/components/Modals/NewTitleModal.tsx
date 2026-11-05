import React, { useState, useMemo, useEffect } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { 
  X, 
  PlusCircle, 
  AlertCircle, 
  UserPlus, 
  FolderPlus, 
  Calendar, 
  Layers, 
  Repeat, 
  Receipt, 
  Users, 
  Building2, 
  CheckCircle2, 
  Info,
  CalendarDays,
  CreditCard,
  DollarSign,
  Wallet,
  CheckSquare,
  Sliders,
  Edit2,
  Plus
} from 'lucide-react';
import { TitleType, FinancialTitle, Counterparty, ChartAccount } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, getFilteredChartAccounts, isRevenueAccount, isCostOrExpenseAccount, formatChartAccountSelectOptions } from '../../services/financialEngine';
import { SearchableSelect, SelectOption } from '../Common/SearchableSelect';
import { CompleteCounterpartyModal } from './CompleteCounterpartyModal';
import { QuickCreateAccountModal } from './QuickCreateAccountModal';
import { toast } from '../../hooks/useToast';
import { addMonthsSafe, advanceCompetence, getDaysInMonth } from '../../utils/dateUtils';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField, MonthField } from '../Common/DateField';
import { useIsSimpleMode } from '../../hooks/useViewMode';
import { formatCompetenceShort } from '../../utils/dateUtils';

interface NewTitleModalProps {
  isOpen: boolean;
  defaultType?: TitleType;
  onClose: () => void;
  onSaved?: (details?: { count: number; type: TitleType; description: string; totalAmount: number }) => void;
  onCreated?: () => void;
  onError?: (errorMessage: string) => void;
}

type LaunchMode = 'UNICO' | 'PARCELADO' | 'RECORRENTE';
type CounterpartyFilterType = 'TODOS' | 'FORNECEDORES' | 'CLIENTES';

export const NewTitleModal: React.FC<NewTitleModalProps> = ({
  isOpen,
  defaultType = 'PAGAR',
  onClose,
  onSaved,
  onCreated,
  onError
}) => {
  const simple = useIsSimpleMode();
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  // Tipo de Título (PAGAR ou RECEBER)
  const [type, setType] = useState<TitleType>(defaultType);

  // Modo de Lançamento (Único, Parcelado, Recorrente)
  const [launchMode, setLaunchMode] = useState<LaunchMode>('UNICO');

  // Filtro de Contraparte (no Contas a Pagar permite selecionar clientes!)
  const [counterpartyFilter, setCounterpartyFilter] = useState<CounterpartyFilterType>('TODOS');

  // Dados Básicos do Título
  const [baseTitleNumber, setBaseTitleNumber] = useState(
    `${defaultType === 'RECEBER' ? 'REC' : 'PAG'}-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`
  );
  const [counterpartyId, setCounterpartyId] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');

  // Datas (Removida a data de emissão conforme solicitação do usuário!)
  const [launchDate, setLaunchDate] = useState(today);
  const [competence, setCompetence] = useState(currentMonth);
  const [dueDate, setDueDate] = useState(today);
  const [expectedCashDate, setExpectedCashDate] = useState(today);

  // Versão simples: a competência acompanha o mês do vencimento (sem pedir ao cliente)
  useEffect(() => {
    if (simple && dueDate) setCompetence(dueDate.substring(0, 7));
  }, [simple, dueDate]);

  // Valores e Modo Parcelado/Recorrente
  const [originalAmount, setOriginalAmount] = useState<number>(0);
  const [amountMode, setAmountMode] = useState<'TOTAL' | 'PARCELA'>('TOTAL');
  const [installmentsCount, setInstallmentsCount] = useState<number>(3);
  const [isCustomInstallments, setIsCustomInstallments] = useState<boolean>(false);
  const [recurringMonths, setRecurringMonths] = useState<number>(12);
  const [isCustomRecurring, setIsCustomRecurring] = useState<boolean>(false);
  const [recurringDay, setRecurringDay] = useState<number>(() => {
    const day = parseInt(today.split('-')[2], 10);
    return isNaN(day) ? 10 : day;
  });

  // Configurações de Liquidação / Pagamento Imediato no Lançamento
  const [isAlreadySettled, setIsAlreadySettled] = useState<boolean>(false);
  const [settlementDate, setSettlementDate] = useState<string>(today);
  const [settlementBankAccountId, setSettlementBankAccountId] = useState<string>('');
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState<'PIX' | 'BOLETO' | 'TRANSFERENCIA' | 'CARTAO_DEBITO' | 'DINHEIRO' | 'DEBITO_AUTOMATICO' | 'OUTROS'>('PIX');
  const [settlementDiscount, setSettlementDiscount] = useState<number>(0);
  const [settlementInterest, setSettlementInterest] = useState<number>(0);
  const [settlementBankFee, setSettlementBankFee] = useState<number>(0);
  const [settlementVoucherRef, setSettlementVoucherRef] = useState<string>('');
  const [settlementNotes, setSettlementNotes] = useState<string>('');
  const [settlementScope, setSettlementScope] = useState<'FIRST' | 'ALL'>('FIRST');

  const [expectedBankAccountId, setExpectedBankAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Modal de Criação Rápida de Categoria/Subcategoria no Plano de Contas
  const [isQuickAccountModalOpen, setIsQuickAccountModalOpen] = useState(false);

  // Modal de Completar Cadastro de Contraparte
  const [quickCreatedId, setQuickCreatedId] = useState<string | null>(null);
  const [openCompleteModal, setOpenCompleteModal] = useState(false);
  const [openCompleteAfterSave, setOpenCompleteAfterSave] = useState(true);

  // Sincronizar com defaultType toda vez que o modal abrir ou a prop defaultType mudar
  useEffect(() => {
    if (isOpen) {
      const activeType = defaultType || 'PAGAR';
      setType(activeType);
      setBaseTitleNumber(
        `${activeType === 'RECEBER' ? 'REC' : 'PAG'}-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`
      );
      setLaunchDate(today);
      setCompetence(currentMonth);
      setDueDate(today);
      setExpectedCashDate(today);
      setAccountId('');
      setCounterpartyId('');
      setDescription('');
      setOriginalAmount(0);
      setErrorMessage('');
      setLaunchMode('UNICO');
      setCounterpartyFilter('TODOS');
      setInstallmentsCount(3);
      setIsCustomInstallments(false);
      setRecurringMonths(12);
      setIsCustomRecurring(false);
      setIsAlreadySettled(false);
      setSettlementDate(today);
      setSettlementBankAccountId(bankAccounts[0]?.id || '');
      setSettlementPaymentMethod('PIX');
      setSettlementDiscount(0);
      setSettlementInterest(0);
      setSettlementBankFee(0);
      setSettlementVoucherRef('');
      setSettlementNotes('');
      setSettlementScope('FIRST');
    }
  }, [isOpen, defaultType]);

  // Atualizar prefixo quando o tipo mudar
  const handleTypeChange = (newType: TitleType) => {
    setType(newType);
    setBaseTitleNumber(`${newType === 'RECEBER' ? 'REC' : 'PAG'}-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`);
    
    // Se a conta atual não pertencer ao novo tipo selecionado, limpar a seleção
    if (accountId) {
      const currentAcc = storage.getChartAccounts().find(a => a.id === accountId);
      if (currentAcc) {
        if (newType === 'RECEBER' && !isRevenueAccount(currentAcc)) {
          setAccountId('');
        } else if (newType === 'PAGAR' && !isCostOrExpenseAccount(currentAcc)) {
          setAccountId('');
        }
      }
    }
  };

  // Atalho Rápido de Edição/Criação de Contraparte
  const [counterpartyRefreshTrigger, setCounterpartyRefreshTrigger] = useState(0);
  const [isManualCounterpartyModalOpen, setIsManualCounterpartyModalOpen] = useState(false);
  const [manualCounterpartyId, setManualCounterpartyId] = useState<string | null>(null);

  // Carregar contrapartes com filtro inteligente
  // No contas a pagar, o usuário pode selecionar tanto fornecedores quanto clientes!
  const allCounterparties = useMemo(() => storage.getCounterparties(), [counterpartyRefreshTrigger, isOpen]);
  const counterparties = useMemo(() => {
    return allCounterparties.filter(c => {
      if (type === 'RECEBER') {
        return c.type === 'CLIENTE' || c.type === 'AMBOS';
      }
      // Se for PAGAR:
      if (counterpartyFilter === 'FORNECEDORES') {
        return c.type === 'FORNECEDOR' || c.type === 'AMBOS';
      }
      if (counterpartyFilter === 'CLIENTES') {
        return c.type === 'CLIENTE' || c.type === 'AMBOS';
      }
      // 'TODOS': lista fornecedores e clientes pois às vezes compra de clientes
      return true;
    });
  }, [allCounterparties, type, counterpartyFilter]);

  // Filtrar rigorosamente o plano de contas analítico:
  // - Para PAGAR: Apenas Custos e Despesas
  // - Para RECEBER: Apenas Receitas
  const chartAccounts = useMemo(() => {
    const all = storage.getChartAccounts();
    return getFilteredChartAccounts(all, type);
  }, [type, isOpen]);
  const bankAccounts = storage.getBankAccounts().filter(a => a.status === 'ATIVO');

  const counterpartyOptions: SelectOption[] = useMemo(() => {
    return counterparties.map(c => {
      let typeBadge = '';
      if (c.type === 'CLIENTE') typeBadge = 'Cliente';
      else if (c.type === 'FORNECEDOR') typeBadge = 'Fornecedor';
      else if (c.type === 'AMBOS') typeBadge = 'Cliente & Forn.';

      return {
        value: c.id,
        label: c.name,
        sublabel: c.document ? `Doc: ${c.document}` : (c.tradeName || undefined),
        badge: c.status === 'ATIVO' ? typeBadge : 'Inativo'
      };
    });
  }, [counterparties]);

  const chartAccountOptions: SelectOption[] = useMemo(() => {
    return formatChartAccountSelectOptions(chartAccounts);
  }, [chartAccounts]);

  const bankAccountOptions: SelectOption[] = useMemo(() => [
    { value: '', label: 'Indiferente / Não definida' },
    ...bankAccounts.map(b => ({
      value: b.id,
      label: b.name,
      sublabel: b.institution
    }))
  ], [bankAccounts]);

  // Handler para quando uma nova conta contábil for criada pelo modal rápido
  const handleAccountCreated = (newAccount: ChartAccount) => {
    setAccountId(newAccount.id);
  };

  const handleQuickCreateCounterparty = (name: string) => {
    const newId = `cp-${Date.now()}`;
    const newParty: Counterparty = {
      id: newId,
      name,
      type: type === 'RECEBER' ? 'CLIENTE' : (counterpartyFilter === 'CLIENTES' ? 'CLIENTE' : 'FORNECEDOR'),
      document: '',
      email: '',
      phone: '',
      status: 'ATIVO',
      createdAt: new Date().toISOString(),
      notes: 'Cadastro rápido realizado via tela de lançamento.'
    };
    storage.addCounterparty(newParty);
    setCounterpartyId(newId);
    setQuickCreatedId(newId);
    setOpenCompleteAfterSave(true);
  };

  // Cálculo das parcelas ou recorrências para o "Magic Board"
  const calculatedItems = useMemo(() => {
    if (!dueDate || !competence) return [];

    // 1. Lançamento Único
    if (launchMode === 'UNICO') {
      return [{
        index: 1,
        titleNumber: baseTitleNumber,
        competence,
        dueDate,
        expectedCashDate: dueDate,
        amount: originalAmount
      }];
    }

    // 2. Compra Parcelada
    if (launchMode === 'PARCELADO') {
      const count = Math.max(2, Math.min(120, installmentsCount || 2));
      let installmentAmount = 0;
      let firstInstallmentAmount = 0;

      if (amountMode === 'TOTAL') {
        const total = originalAmount;
        installmentAmount = Math.floor((total / count) * 100) / 100;
        // Ajuste de centavos na primeira parcela
        const diff = Math.round((total - (installmentAmount * count)) * 100) / 100;
        firstInstallmentAmount = Math.round((installmentAmount + diff) * 100) / 100;
      } else {
        installmentAmount = originalAmount;
        firstInstallmentAmount = originalAmount;
      }

      const items = [];
      const dueD = parseInt(dueDate.split('-')[2], 10);

      for (let i = 0; i < count; i++) {
        // Cálculo de Vencimento seguro sem estouro de mês nem alteração de fuso
        const dueStr = addMonthsSafe(dueDate, i, dueD);

        // Cálculo de Competência econômica (DRE) segura
        const compStr = advanceCompetence(competence, i);

        items.push({
          index: i + 1,
          titleNumber: `${baseTitleNumber} - ${i + 1}/${count}`,
          competence: compStr,
          dueDate: dueStr,
          expectedCashDate: dueStr,
          amount: i === 0 ? firstInstallmentAmount : installmentAmount
        });
      }
      return items;
    }

    // 3. Conta Recorrente
    if (launchMode === 'RECORRENTE') {
      const months = Math.max(1, Math.min(120, recurringMonths || 12));
      const items = [];

      for (let i = 0; i < months; i++) {
        const compStr = advanceCompetence(competence, i);
        const [targetYear, targetMonth] = compStr.split('-').map(Number);

        // Dia do vencimento seguro respeitando limite de dias do mês
        const maxDaysInMonth = getDaysInMonth(targetYear, targetMonth);
        const actualDay = Math.min(recurringDay || 10, maxDaysInMonth);
        const dueStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;

        items.push({
          index: i + 1,
          titleNumber: `${baseTitleNumber} - ${compStr}`,
          competence: compStr,
          dueDate: dueStr,
          expectedCashDate: dueStr,
          amount: originalAmount
        });
      }
      return items;
    }

    return [];
  }, [
    launchMode, 
    baseTitleNumber, 
    competence, 
    dueDate, 
    expectedCashDate, 
    originalAmount, 
    amountMode, 
    installmentsCount, 
    recurringMonths, 
    recurringDay
  ]);

  const totalCalculatedAmount = useMemo(() => {
    return calculatedItems.reduce((acc, item) => acc + item.amount, 0);
  }, [calculatedItems]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const notifyError = (msg: string, title = 'Atenção no Preenchimento') => {
      setErrorMessage(msg);
      toast.error(msg, title);
      if (onError) onError(msg);
    };

    if (!counterpartyId) {
      notifyError(type === 'RECEBER' ? 'Selecione ou cadastre o cliente.' : 'Selecione ou cadastre o fornecedor ou cliente.');
      return;
    }
    if (!description.trim()) {
      notifyError('Informe a descrição do lançamento.');
      return;
    }
    if (!accountId) {
      notifyError('Selecione uma conta analítica do plano de contas ou crie uma nova.');
      return;
    }
    if (originalAmount <= 0) {
      notifyError('O valor deve ser superior a zero.');
      return;
    }

    // Validação de competência fechada
    if (FinancialEngine.isPeriodClosed(competence)) {
      notifyError(`O período de competência ${competence} está fechado para novos lançamentos.`, 'Competência Fechada');
      return;
    }

    // Validações adicionais se marcou como já pago ou já recebido
    if (isAlreadySettled) {
      if (!settlementBankAccountId) {
        notifyError('Selecione a conta bancária onde ocorreu a movimentação do pagamento/recebimento.', 'Conta Bancária Obrigatória');
        return;
      }
      if (settlementDate > today) {
        notifyError('A data da baixa efetiva não pode ser futura.', 'Data Inválida');
        return;
      }
      const settlementMonth = settlementDate.substring(0, 7);
      if (FinancialEngine.isPeriodClosed(settlementMonth)) {
        notifyError(`O mês da liquidação (${settlementMonth}) encontra-se encerrado para alterações.`, 'Período Fechado');
        return;
      }
    }

    const currentUser = storage.getCurrentUser();
    if (currentUser.role === 'CONSULTA') {
      notifyError('Perfil de consulta não possui permissão para cadastrar títulos.', 'Permissão Negada');
      return;
    }

    // Criar títulos a partir da lista calculada
    const now = new Date().toISOString();
    const newTitles: FinancialTitle[] = calculatedItems.map((item) => ({
      id: `tit-${Date.now()}-${item.index}-${Math.floor(Math.random() * 1000)}`,
      companyId: 'comp-1',
      type,
      titleNumber: item.titleNumber,
      counterpartyId,
      description: launchMode === 'PARCELADO' 
        ? `${description.trim()} (${item.index}/${calculatedItems.length})`
        : (launchMode === 'RECORRENTE' ? `${description.trim()} [Recorrente ${item.competence}]` : description.trim()),
      accountId,
      launchDate,
      competence: item.competence,
      issueDate: launchDate, // Data de emissão sincronizada com a data de lançamento
      dueDate: item.dueDate,
      expectedCashDate: item.expectedCashDate,
      originalAmount: Number(item.amount),
      settledPrincipal: 0,
      balancePrincipal: Number(item.amount),
      accruedInterest: 0,
      accruedFine: 0,
      documentState: 'CONFIRMADO',
      settlementState: 'ABERTO',
      originType: launchMode === 'RECORRENTE' ? 'RECORRENCIA_PAGAR' : (launchMode === 'PARCELADO' ? 'DESPESA_DIRETA' : 'MANUAL'),
      installmentIndex: launchMode === 'PARCELADO' ? item.index : undefined,
      totalInstallments: launchMode === 'PARCELADO' ? calculatedItems.length : undefined,
      expectedBankAccountId: settlementBankAccountId || expectedBankAccountId || undefined,
      notes: notes ? `${notes} ${launchMode !== 'UNICO' ? `(${launchMode})` : ''}` : (launchMode !== 'UNICO' ? `Gerado via lançamento ${launchMode.toLowerCase()}` : undefined),
      createdAt: now,
      updatedAt: now
    }));

    const existingTitles = storage.getTitles();
    storage.saveTitles([...newTitles, ...existingTitles]);

    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: launchMode === 'PARCELADO' ? 'NOVO_TITULO_PARCELADO' : (launchMode === 'RECORRENTE' ? 'NOVO_TITULO_RECORRENTE' : 'NOVO_TITULO_MANUAL'),
      module: type === 'RECEBER' ? 'Contas a Receber' : 'Contas a Pagar',
      recordId: newTitles[0].id,
      details: `Criação de ${newTitles.length} título(s) (${description}) no valor total de R$ ${totalCalculatedAmount.toFixed(2)}. Modo: ${launchMode}.`
    });

    // Se marcou como já pago/recebido, efetivar a liquidação nas tabelas financeiras
    if (isAlreadySettled) {
      const titlesToSettle = (launchMode === 'UNICO' || settlementScope === 'ALL')
        ? newTitles
        : [newTitles[0]];

      for (let i = 0; i < titlesToSettle.length; i++) {
        const titleToSettle = titlesToSettle[i];
        // Descontos e juros são atribuídos ao primeiro título ou rateados
        const disc = i === 0 ? settlementDiscount : 0;
        const intr = i === 0 ? settlementInterest : 0;
        const fee = (type === 'RECEBER' && i === 0) ? settlementBankFee : 0;

        FinancialEngine.postSettlement({
          titleId: titleToSettle.id,
          settlementDate,
          bankAccountId: settlementBankAccountId,
          principalSettled: titleToSettle.originalAmount,
          discount: disc,
          interest: intr,
          fine: 0,
          bankFee: fee,
          voucherRef: settlementVoucherRef.trim() || undefined,
          notes: settlementNotes.trim()
            ? `${settlementNotes.trim()} [${settlementPaymentMethod}]`
            : `Liquidação imediata no cadastro [${settlementPaymentMethod}]`
        });
      }
    }

    if (quickCreatedId && openCompleteAfterSave) {
      setOpenCompleteModal(true);
    } else {
      if (onSaved) {
        onSaved({
          count: newTitles.length,
          type,
          description: description.trim(),
          totalAmount: totalCalculatedAmount
        });
      }
      if (onCreated) onCreated();
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-hidden border border-slate-200 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 my-0 sm:my-4 flex flex-col">
          
          {/* Header Superior Fixo */}
          <div className="shrink-0 px-4 py-3 sm:px-6 sm:py-3.5 flex items-center justify-between border-b border-slate-200 bg-slate-50/90 backdrop-blur z-10">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className={`p-2 rounded-xl text-white shrink-0 ${type === 'PAGAR' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                {type === 'PAGAR' ? <CreditCard className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate flex items-center gap-2">
                  <span className="truncate">{simple ? (type === 'PAGAR' ? 'Nova despesa' : 'Novo recebimento') : (type === 'PAGAR' ? 'Lançamento de Contas a Pagar' : 'Lançamento de Contas a Receber')}</span>
                </h2>
                <p className="adv-only text-[11px] sm:text-xs text-slate-500 truncate hidden xs:block">
                  Lançamento avulso, parcelamento de compras ou contas recorrentes com Magic Board
                </p>
              </div>
            </div>

            <button 
              onClick={onClose} 
              type="button"
              className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer shrink-0"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mensagem de Erro */}
          {errorMessage && (
            <div className="shrink-0 mx-4 sm:mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Formulário com Corpo Rolável e Rodapé Fixo */}
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs pb-28 sm:pb-6 scroll-smooth [scroll-padding-bottom:7rem]">
            
            {/* TABS DE MODO DE LANÇAMENTO (MAGIC BOARD SELECTOR) */}
            <div className="bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/80 grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setLaunchMode('UNICO')}
                className={`min-h-[40px] py-2 px-1 sm:px-3 rounded-lg font-semibold text-[11px] sm:text-xs transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                  launchMode === 'UNICO'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                <span className="text-center">{simple ? 'Uma vez' : 'Único (1x)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setLaunchMode('PARCELADO')}
                className={`min-h-[40px] py-2 px-1 sm:px-3 rounded-lg font-semibold text-[11px] sm:text-xs transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                  launchMode === 'PARCELADO'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span className="text-center">{simple ? 'Parcelado' : 'Parcelado (Nx)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setLaunchMode('RECORRENTE')}
                className={`min-h-[40px] py-2 px-1 sm:px-3 rounded-lg font-semibold text-[11px] sm:text-xs transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
                  launchMode === 'RECORRENTE'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Repeat className="w-4 h-4 shrink-0" />
                <span className="text-center">{simple ? 'Todo mês' : 'Recorrente'}</span>
              </button>
            </div>

            {/* Alternador de Tipo de Título (Pagar / Receber) */}
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="font-semibold text-slate-700 shrink-0">{simple ? 'Tipo' : 'Fluxo:'}</span>
                <div role="radiogroup" aria-label="Tipo de lançamento" className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-slate-200 bg-slate-100/80 flex-1 sm:flex-none sm:min-w-[320px]">
                  {([['PAGAR', 'Conta a pagar'], ['RECEBER', 'Conta a receber']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      role="radio"
                      aria-checked={type === val}
                      onClick={() => handleTypeChange(val)}
                      className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        type === val
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`text-[11px] text-slate-500 hidden ${simple ? '' : 'sm:block'}`}>
                Doc Base: <span className="font-mono font-medium">{baseTitleNumber}</span>
              </div>
            </div>

            {/* SEÇÃO 1: FORNECEDOR / CLIENTE & DOCUMENTO */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              
              {/* Fornecedor / Cliente com opção de clientes no contas a pagar */}
              <div className={simple ? 'md:col-span-12' : 'md:col-span-8'}>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <label className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>{type === 'RECEBER' ? 'Cliente' : 'Fornecedor ou Cliente'} *</span>
                    </label>

                    {/* No Contas a Pagar, permitir alternar filtro entre Todos / Apenas Fornecedores / Apenas Clientes */}
                    {type === 'PAGAR' && (
                      <div className="flex items-center gap-1 text-[10px] bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => setCounterpartyFilter('TODOS')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                            counterpartyFilter === 'TODOS' ? 'bg-amber-500 text-slate-950 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="Exibir todos os fornecedores e clientes cadastrados"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setCounterpartyFilter('FORNECEDORES')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                            counterpartyFilter === 'FORNECEDORES' ? 'bg-amber-500 text-slate-950 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Fornecedores
                        </button>
                        <button
                          type="button"
                          onClick={() => setCounterpartyFilter('CLIENTES')}
                          className={`px-1.5 py-0.5 rounded font-medium transition-colors cursor-pointer ${
                            counterpartyFilter === 'CLIENTES' ? 'bg-amber-500 text-slate-950 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title="Permite selecionar clientes cadastrados dos quais você comprou produtos ou serviços"
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
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors cursor-pointer"
                        title="Editar cadastro completo desta contraparte"
                      >
                        <Edit2 className="w-3 h-3 text-amber-600" />
                        <span>Editar Cadastro</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setManualCounterpartyId('NEW');
                        setIsManualCounterpartyModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer"
                      title={type === 'RECEBER' ? 'Cadastrar novo cliente' : 'Cadastrar novo fornecedor ou cliente'}
                    >
                      <Plus className="w-3 h-3" />
                      <span>{type === 'RECEBER' ? 'Novo Cliente' : 'Novo Favorecido'}</span>
                    </button>
                  </div>
                </div>

                <SearchableSelect
                  options={counterpartyOptions}
                  value={counterpartyId}
                  onChange={setCounterpartyId}
                  placeholder={type === 'PAGAR' ? 'Pesquise fornecedor ou cliente cadastrado...' : 'Pesquise cliente cadastrado...'}
                  searchPlaceholder="Digite razão social, nome fantasia ou documento..."
                  allowQuickCreate={true}
                  quickCreateLabel={(q) => `+ Cadastrar rápido "${q}"`}
                  onQuickCreate={handleQuickCreateCounterparty}
                  required
                />
              </div>

              {/* Número do Documento */}
              <div className={`md:col-span-4 ${simple ? 'hidden' : ''}`}>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nº Documento / Título *
                </label>
                <input
                  type="text"
                  value={baseTitleNumber}
                  onChange={(e) => setBaseTitleNumber(e.target.value)}
                  placeholder="Ex: NF-12345, BOLETO-99"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm sm:text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  required
                />
              </div>
            </div>

            {/* Descrição do Título */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {simple ? 'Descrição *' : 'Descrição do Lançamento *'}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={simple ? '' : 'Ex: Licença de software Figma, Fatura de Internet Fibra, Aluguel do Escritório, Compra de computadores...'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                required
              />
            </div>

            {/* SEÇÃO 2: CLASSIFICAÇÃO NO PLANO DE CONTAS + BOTÃO DE CRIAR NOVA CATEGORIA/SUBCATEGORIA */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>
                      {simple
                        ? 'Categoria *'
                        : type === 'RECEBER'
                          ? 'Classificação de Receitas (Plano de Contas) *'
                          : 'Classificação de Custos & Despesas (Plano de Contas) *'}
                    </span>
                  </label>
                  <span className={`${simple ? 'hidden' : ''} text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    type === 'RECEBER' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {type === 'RECEBER' ? 'Apenas Receitas' : 'Apenas Custos & Despesas'}
                  </span>
                </div>

                {/* Botão de abrir aba/modal de criação de categoria ou subcategoria */}
                <button
                  type="button"
                  onClick={() => setIsQuickAccountModalOpen(true)}
                  className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                  title="Não encontrou a conta necessária? Clique para criar uma nova categoria ou subcategoria agora"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
                  <span>{simple ? '+ Nova categoria' : '+ Criar Categoria / Subcategoria'}</span>
                </button>
              </div>

              <SearchableSelect
                options={simple ? chartAccountOptions.map(o => ({ ...o, label: String(o.label).replace(/^[\d.]+\s*-\s*/, ''), sublabel: undefined, badge: undefined })) : chartAccountOptions}
                value={accountId}
                onChange={setAccountId}
                placeholder={simple ? 'Escolha uma categoria' : (type === 'RECEBER' ? "Selecione a conta analítica de receitas..." : "Selecione a conta analítica de custos ou despesas...")}
                searchPlaceholder={simple ? 'Buscar categoria...' : 'Buscar por código ou descrição da conta...'}
                required
              />
            </div>

            {/* SEÇÃO 3: VALORES E PARÂMETROS DO MODO ESCOLHIDO */}
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
              
              {/* Modo Único */}
              {launchMode === 'UNICO' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {simple ? 'Valor (R$) *' : 'Valor do Título (R$) *'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 font-bold text-slate-400">R$</span>
                      <MoneyField value={originalAmount} onChange={setOriginalAmount} className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" required />
                    </div>
                  </div>

                  <div className="adv-only">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Conta Bancária Prevista
                    </label>
                    <SearchableSelect
                      options={bankAccountOptions}
                      value={expectedBankAccountId}
                      onChange={setExpectedBankAccountId}
                      placeholder="Indiferente / Não definida"
                    />
                  </div>
                </div>
              )}

              {/* Modo Compra Parcelada */}
              {launchMode === 'PARCELADO' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Forma de Cálculo do Valor
                      </label>
                      <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => setAmountMode('TOTAL')}
                          className={`flex-1 py-1 text-center font-medium rounded-lg text-[11px] transition-colors ${
                            amountMode === 'TOTAL' ? 'bg-white text-amber-600 font-bold shadow-2xs' : 'text-slate-600'
                          }`}
                        >
                          Valor Total da Compra
                        </button>
                        <button
                          type="button"
                          onClick={() => setAmountMode('PARCELA')}
                          className={`flex-1 py-1 text-center font-medium rounded-lg text-[11px] transition-colors ${
                            amountMode === 'PARCELA' ? 'bg-white text-amber-600 font-bold shadow-2xs' : 'text-slate-600'
                          }`}
                        >
                          Valor de Cada Parcela
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        {amountMode === 'TOTAL' ? 'Valor Total da Compra (R$) *' : 'Valor da Parcela (R$) *'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 font-bold text-slate-400">R$</span>
                        <MoneyField value={originalAmount} onChange={setOriginalAmount} className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" required />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-semibold text-slate-700 text-xs">
                          Qtd de Parcelas *
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCustomInstallments(!isCustomInstallments)}
                          className="text-[11px] font-semibold text-amber-500 hover:text-amber-600 underline flex items-center gap-1"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>{isCustomInstallments ? 'Ver lista' : 'Personalizar'}</span>
                        </button>
                      </div>

                      {!isCustomInstallments ? (
                        <PremiumSelect
                          value={installmentsCount}
                          onChange={(e) => {
                            if (e.target.value === 'CUSTOM') {
                              setIsCustomInstallments(true);
                            } else {
                              setInstallmentsCount(parseInt(e.target.value, 10));
                            }
                          }}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold"
                        >
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 24, 36, 48, 60].map(num => (
                            <option key={num} value={num}>{num}x parcelas mensais</option>
                          ))}
                          <option value="CUSTOM">Outra quantidade (personalizada)...</option>
                        </PremiumSelect>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setInstallmentsCount(prev => Math.max(2, prev - 1))}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={2}
                            max={120}
                            inputMode="numeric"
                            value={installmentsCount}
                            onChange={(e) => setInstallmentsCount(Math.max(2, Math.min(120, parseInt(e.target.value, 10) || 2)))}
                            className="w-full rounded-xl border border-amber-400 px-2.5 py-1.5 text-sm sm:text-xs bg-amber-500/10 font-bold text-center text-slate-950 focus:ring-2 focus:ring-amber-500"
                            placeholder="Qtd (ex: 7, 14, 25...)"
                          />
                          <button
                            type="button"
                            onClick={() => setInstallmentsCount(prev => Math.min(120, prev + 1))}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-[11px] text-slate-900">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span>
                        Serão geradas <strong>{installmentsCount} parcelas</strong> {isCustomInstallments ? '(quantidade personalizada)' : ''}. Ajuste de centavos automático.
                      </span>
                    </div>
                    <span className="font-bold text-slate-950">
                      Total: {formatBRL(totalCalculatedAmount)}
                    </span>
                  </div>
                </div>
              )}

              {/* Modo Conta Recorrente */}
              {launchMode === 'RECORRENTE' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Valor Mensal Fixo (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 font-bold text-slate-400">R$</span>
                        <MoneyField value={originalAmount} onChange={setOriginalAmount} className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2 font-bold text-slate-900 text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500" required />
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Dia do Vencimento Todo Mês *
                      </label>
                      <PremiumSelect
                        value={recurringDay}
                        onChange={(e) => setRecurringDay(parseInt(e.target.value, 10))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>Dia {day < 10 ? `0${day}` : day} de cada mês</option>
                        ))}
                      </PremiumSelect>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block font-semibold text-slate-700 text-xs">
                          Projetar Meses *
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCustomRecurring(!isCustomRecurring)}
                          className="text-[11px] font-semibold text-amber-500 hover:text-amber-600 underline flex items-center gap-1"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>{isCustomRecurring ? 'Ver lista' : 'Personalizar'}</span>
                        </button>
                      </div>

                      {!isCustomRecurring ? (
                        <PremiumSelect
                          value={recurringMonths}
                          onChange={(e) => {
                            if (e.target.value === 'CUSTOM') {
                              setIsCustomRecurring(true);
                            } else {
                              setRecurringMonths(parseInt(e.target.value, 10));
                            }
                          }}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-semibold"
                        >
                          <option value={1}>1 mês</option>
                          <option value={2}>2 meses</option>
                          <option value={3}>3 meses</option>
                          <option value={4}>4 meses</option>
                          <option value={5}>5 meses</option>
                          <option value={6}>6 meses (1 semestre)</option>
                          <option value={8}>8 meses</option>
                          <option value={9}>9 meses</option>
                          <option value={10}>10 meses</option>
                          <option value={12}>12 meses (1 ano)</option>
                          <option value={18}>18 meses (1,5 ano)</option>
                          <option value={24}>24 meses (2 anos)</option>
                          <option value={36}>36 meses (3 anos)</option>
                          <option value={48}>48 meses (4 anos)</option>
                          <option value={60}>60 meses (5 anos)</option>
                          <option value="CUSTOM">Outra quantidade (personalizada)...</option>
                        </PremiumSelect>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRecurringMonths(prev => Math.max(1, prev - 1))}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={120}
                            inputMode="numeric"
                            value={recurringMonths}
                            onChange={(e) => setRecurringMonths(Math.max(1, Math.min(120, parseInt(e.target.value, 10) || 1)))}
                            className="w-full rounded-xl border border-amber-400 px-2.5 py-1.5 text-sm sm:text-xs bg-amber-500/10 font-bold text-center text-slate-950 focus:ring-2 focus:ring-amber-500"
                            placeholder="Qtd de meses (ex: 7, 15...)"
                          />
                          <button
                            type="button"
                            onClick={() => setRecurringMonths(prev => Math.min(120, prev + 1))}
                            className="px-2.5 py-1.5 border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center justify-between text-[11px] text-emerald-900">
                    <div className="flex items-center space-x-2">
                      <Repeat className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>
                        Recorrência programada: <strong>{recurringMonths} lançamentos</strong> {isCustomRecurring ? '(personalizado)' : ''} mensais com vencimento todo dia {recurringDay}.
                      </span>
                    </div>
                    <span className="font-bold text-emerald-950">
                      Total Projetado: {formatBRL(totalCalculatedAmount)}
                    </span>
                  </div>
                </div>
              )}

            </div>

            {/* SEÇÃO 4: DATAS (DATA DE LANÇAMENTO, COMPETÊNCIA E VENCIMENTO) - SEM DATA DE EMISSÃO! */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>{simple ? 'Quando' : 'Datas Fundamentais & Competência Econômica'}</span>
                </span>
                <span className={`text-[10px] text-slate-500 ${simple ? 'hidden' : ''}`}>
                  Data de emissão removida (utiliza a data de lançamento)
                </span>
              </div>

              <div className={`grid grid-cols-1 gap-3 ${simple ? 'sm:grid-cols-1' : 'sm:grid-cols-3'}`}>
                
                {/* Data de Lançamento */}
                <div className={simple ? 'hidden' : ''}>
                  <label className="block text-slate-700 text-[11px] mb-1 font-semibold">
                    Data de Lançamento *
                  </label>
                  <DateField
                    value={launchDate}
                    onChange={(e) => setLaunchDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    required
                  />
                </div>

                {/* Competência DRE */}
                <div className={simple ? 'hidden' : ''}>
                  <label className="block text-slate-700 text-[11px] mb-1 font-semibold">
                    Competência DRE *
                  </label>
                  <MonthField
                    value={competence}
                    onChange={(e) => setCompetence(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    required
                  />
                </div>

                {/* Vencimento (1ª Parcela ou Único) - A Previsão de Caixa fica oculta e leva em conta esta data */}
                <div>
                  <label className="block text-slate-700 text-[11px] mb-1 font-semibold">
                    {launchMode === 'PARCELADO' ? '1º Vencimento *' : 'Vencimento *'}
                  </label>
                  <DateField
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      setExpectedCashDate(e.target.value);
                    }}
                    className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    required
                  />
                </div>

              </div>
            </div>

            {/* SEÇÃO 5: MARCAR SE JÁ FOI PAGO OU RECEBIDO (CONFIGURAÇÕES DE PAGAMENTO) */}
            <div className={`p-4 rounded-xl border transition-all ${
              isAlreadySettled 
                ? (type === 'PAGAR' ? 'bg-[var(--status-danger-bg)] border-[var(--status-danger)]/40' : 'bg-[var(--status-success-bg)] border-[var(--status-success)]/40')
                : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isAlreadySettled}
                    onChange={(e) => {
                      setIsAlreadySettled(e.target.checked);
                      if (e.target.checked && !settlementBankAccountId && bankAccounts.length > 0) {
                        setSettlementBankAccountId(bankAccounts[0].id);
                      }
                    }}
                    className={`mt-0.5 sm:mt-0 w-4 h-4 rounded border-slate-300 ${
                      type === 'PAGAR' ? 'text-rose-600 focus:ring-rose-500' : 'text-emerald-600 focus:ring-emerald-500'
                    }`}
                  />
                  <div>
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <Wallet className={`w-4 h-4 ${type === 'PAGAR' ? 'text-rose-600' : 'text-emerald-600'}`} />
                      {simple
                        ? (type === 'PAGAR' ? 'Já foi pago?' : 'Já foi recebido?')
                        : type === 'PAGAR'
                          ? 'Este lançamento já foi pago? (Registrar liquidação imediata)'
                          : 'Este lançamento já foi recebido? (Registrar recebimento imediato)'}
                    </span>
                    <p className="adv-only text-[11px] text-slate-500 mt-0.5">
                      {type === 'PAGAR'
                        ? 'Ao marcar, o título será salvo como quitado e a saída será debitada da conta bancária no extrato.'
                        : 'Ao marcar, o título será salvo como quitado e a entrada será creditada na conta bancária no extrato.'}
                    </p>
                  </div>
                </label>

                {isAlreadySettled && (
                  <span className={`${simple ? 'hidden' : ''} self-start sm:self-auto text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    type === 'PAGAR' 
                      ? 'bg-rose-100 text-rose-800 border-rose-200' 
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}>
                    {type === 'PAGAR' ? '✓ Baixa Imediata Ativa' : '✓ Recebimento Imediato Ativo'}
                  </span>
                )}
              </div>

              {/* PAINEL EXPANSÍVEL COM AS CONFIGURAÇÕES DE PAGAMENTO */}
              {isAlreadySettled && (
                <div className="mt-3.5 pt-3.5 border-t border-slate-200/90 space-y-3 animate-in fade-in-50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    
                    {/* Data do Pagamento / Recebimento */}
                    <div>
                      <label className="block text-slate-700 text-[11px] mb-1 font-semibold">
                        {type === 'PAGAR' ? 'Data do Pagamento *' : 'Data do Recebimento *'}
                      </label>
                      <DateField
                        max={today}
                        value={settlementDate}
                        onChange={(e) => setSettlementDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        required={isAlreadySettled}
                      />
                      <span className="text-[10px] text-slate-400">Data efetiva da movimentação</span>
                    </div>

                    {/* Conta Bancária de Origem / Destino */}
                    <div>
                      <label className="block text-slate-700 text-[11px] mb-1 font-semibold">
                        {type === 'PAGAR' ? 'Conta Bancária (Débito) *' : 'Conta Bancária (Crédito) *'}
                      </label>
                      <PremiumSelect
                        value={settlementBankAccountId}
                        onChange={(e) => setSettlementBankAccountId(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        required={isAlreadySettled}
                      >
                        <option value="">Selecione a conta bancária...</option>
                        {bankAccounts.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.institution})
                          </option>
                        ))}
                      </PremiumSelect>
                    </div>

                    {/* Forma de Pagamento */}
                    <div>
                      <label className="block text-slate-700 text-[11px] mb-1 font-semibold">
                        Forma de Pagamento
                      </label>
                      <PremiumSelect
                        value={settlementPaymentMethod}
                        onChange={(e) => setSettlementPaymentMethod(e.target.value as any)}
                        className="w-full rounded-xl border border-slate-300 px-2.5 py-1.5 text-xs bg-white font-medium text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      >
                        <option value="PIX">PIX</option>
                        <option value="BOLETO">Boleto Bancário</option>
                        <option value="TRANSFERENCIA">Transferência (TED / DOC)</option>
                        <option value="CARTAO_DEBITO">Cartão de Débito</option>
                        <option value="DINHEIRO">Dinheiro em Espécie</option>
                        <option value="DEBITO_AUTOMATICO">Débito Automático</option>
                        <option value="OUTROS">Outros</option>
                      </PremiumSelect>
                    </div>

                  </div>

                  {/* Componentes de Ajuste Financeiro (Desconto, Juros, Tarifa) */}
                  <div className="adv-only grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div>
                      <label className="block text-slate-600 text-[10px] font-semibold mb-1">
                        Desconto Obtido/Concedido (R$)
                      </label>
                      <MoneyField value={settlementDiscount} onChange={setSettlementDiscount} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm sm:text-xs bg-white focus:ring-1 focus:ring-amber-500" />
                    </div>

                    <div>
                      <label className="block text-slate-600 text-[10px] font-semibold mb-1">
                        Juros / Multa Pagos (R$)
                      </label>
                      <MoneyField value={settlementInterest} onChange={setSettlementInterest} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm sm:text-xs bg-white focus:ring-1 focus:ring-amber-500" />
                    </div>

                    {type === 'RECEBER' && (
                      <div>
                        <label className="block text-slate-600 text-[10px] font-semibold mb-1">
                          Tarifa Bancária Retida (R$)
                        </label>
                        <MoneyField value={settlementBankFee} onChange={setSettlementBankFee} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm sm:text-xs bg-white focus:ring-1 focus:ring-amber-500" />
                      </div>
                    )}

                    <div>
                      <label className="block text-slate-600 text-[10px] font-semibold mb-1">
                        Nº Comprovante / Autenticação
                      </label>
                      <input
                        type="text"
                        value={settlementVoucherRef}
                        onChange={(e) => setSettlementVoucherRef(e.target.value)}
                        placeholder="Ex: AUT-987654"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm sm:text-xs bg-white focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  {/* Se for Parcelado ou Recorrente, permitir escolher se quita só o 1º ou todos */}
                  {launchMode !== 'UNICO' && (
                    <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-700 font-medium">
                        {simple ? `Como são ${calculatedItems.length} parcelas:` : `Como este lançamento possui ${calculatedItems.length} ocorrências:`}
                      </span>
                      <div className="flex items-center space-x-3">
                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="settlementScope"
                            checked={settlementScope === 'FIRST'}
                            onChange={() => setSettlementScope('FIRST')}
                            className="text-amber-500"
                          />
                          <span>{simple ? (type === 'PAGAR' ? 'Marcar só a 1ª parcela como paga' : 'Marcar só a 1ª parcela como recebida') : 'Liquidar apenas a 1ª parcela/ocorrência agora'}</span>
                        </label>
                        <label className="flex items-center space-x-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="settlementScope"
                            checked={settlementScope === 'ALL'}
                            onChange={() => setSettlementScope('ALL')}
                            className="text-amber-500"
                          />
                          <span>{simple ? `Marcar as ${calculatedItems.length} parcelas` : `Liquidar todas as ${calculatedItems.length} ocorrências`}</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Resumo do Valor Efetivamente Movimentado */}
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-100/90 border border-slate-200 text-xs">
                    <span className="text-slate-700 font-medium">
                      Valor líquido a movimentar na conta bancária:
                    </span>
                    <span className={`font-bold text-sm ${type === 'PAGAR' ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {formatBRL(
                        Math.max(
                          0,
                          (settlementScope === 'ALL' ? totalCalculatedAmount : (calculatedItems[0]?.amount || originalAmount))
                          - settlementDiscount 
                          + settlementInterest 
                          - (type === 'RECEBER' ? settlementBankFee : 0)
                        )
                      )}
                    </span>
                  </div>

                </div>
              )}
            </div>

            {/* MAGIC BOARD PREVIEW (Para compras parceladas ou recorrência) */}
            {calculatedItems.length > 1 && (
              <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
                      {simple ? `Parcelas (${calculatedItems.length})` : `Magic Board de Pré-visualização (${calculatedItems.length} títulos gerados)`}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    Total: {formatBRL(totalCalculatedAmount)}
                  </span>
                </div>

                {/* Grid Responsivo de Cards de Parcelas / Recorrência */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-48 overflow-y-auto pr-1">
                  {calculatedItems.map((item) => (
                    <div 
                      key={item.index} 
                      className="bg-slate-800/90 border border-slate-700/80 rounded-lg p-2 text-[11px] space-y-1 hover:border-amber-500 transition-colors"
                    >
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="font-bold text-white">#{item.index}</span>
                        <span className="text-[9px] px-1 py-0.2 bg-slate-700 text-slate-300 rounded font-mono">
                          {simple ? formatCompetenceShort(item.competence) : item.competence}
                        </span>
                      </div>
                      <div className="font-bold text-emerald-400 truncate">
                        {formatBRL(item.amount)}
                      </div>
                      <div className="text-[10px] text-slate-300 flex items-center gap-1">
                        <CalendarDays className="w-3 h-3 text-slate-400" />
                        <span>{item.dueDate.split('-').reverse().join('/')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                {simple ? 'Observações' : 'Observações Adicionais'}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes opcionais sobre o lançamento, forma de pagamento, etc."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm sm:text-xs focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {quickCreatedId && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-xs text-slate-900 font-medium">
                    Novo parceiro cadastrado rapidamente!
                  </span>
                </div>
                <label className="flex items-center space-x-1.5 cursor-pointer text-xs text-amber-600 font-semibold min-h-[36px]">
                  <input
                    type="checkbox"
                    checked={openCompleteAfterSave}
                    onChange={(e) => setOpenCompleteAfterSave(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span>Completar cadastro cadastral após salvar</span>
                </label>
              </div>
            )}

            </div>

            {/* Rodapé Fixo de Ações (Sticky Footer) */}
            <div className="shrink-0 sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 sm:p-4 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
              <div className="text-xs text-slate-600 flex items-center justify-between sm:justify-start">
                <div>
                  <span>Total a registrar: </span>
                  <span className="font-bold text-slate-900 text-sm ml-1">
                    {formatBRL(totalCalculatedAmount || originalAmount)}
                  </span>
                </div>
                {calculatedItems.length > 1 && (
                  <span className="text-slate-500 ml-1.5">
                    ({calculatedItems.length} {launchMode === 'PARCELADO' ? 'parcelas' : 'meses'})
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-3 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[42px] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`min-h-[42px] px-5 sm:px-6 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer flex-1 sm:flex-none ${
                    type === 'PAGAR' 
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20' 
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  }`}
                >
                  <PlusCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {calculatedItems.length > 1 
                      ? (simple ? `Salvar ${calculatedItems.length} parcelas (${formatBRL(totalCalculatedAmount)})` : `Lançar ${calculatedItems.length} Títulos (${formatBRL(totalCalculatedAmount)})`)
                      : 'Salvar Lançamento'
                    }
                  </span>
                </button>
              </div>
            </div>

          </form>

        </div>
      </div>

      {/* Modal de Criação Rápida de Categoria/Subcategoria no Plano de Contas */}
      {isQuickAccountModalOpen && (
        <QuickCreateAccountModal
          isOpen={true}
          titleType={type}
          onClose={() => setIsQuickAccountModalOpen(false)}
          onAccountCreated={handleAccountCreated}
        />
      )}

      {/* Modal de Complementação de Cadastro de Contraparte */}
      {openCompleteModal && quickCreatedId && (
        <CompleteCounterpartyModal
          isOpen={true}
          counterpartyId={quickCreatedId}
          onClose={() => {
            setOpenCompleteModal(false);
            if (onSaved) onSaved();
            if (onCreated) onCreated();
            onClose();
          }}
          onSaved={() => {
            setOpenCompleteModal(false);
            if (onSaved) onSaved();
            if (onCreated) onCreated();
            onClose();
          }}
        />
      )}

      {/* Modal Manual de Criação / Edição de Favorecido */}
      <CompleteCounterpartyModal
        isOpen={isManualCounterpartyModalOpen}
        counterpartyId={manualCounterpartyId}
        defaultType={type === 'RECEBER' ? 'CLIENTE' : 'FORNECEDOR'}
        onClose={() => {
          setIsManualCounterpartyModalOpen(false);
          setManualCounterpartyId(null);
        }}
        onSaved={(savedParty) => {
          setCounterpartyRefreshTrigger(prev => prev + 1);
          if (manualCounterpartyId === 'NEW') {
            setCounterpartyId(savedParty.id);
          }
          toast.success(`Cadastro de "${savedParty.name}" salvo com sucesso!`, 'Cadastro Atualizado');
        }}
      />
    </>
  );
};
