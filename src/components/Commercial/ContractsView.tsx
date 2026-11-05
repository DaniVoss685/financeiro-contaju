import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, 
  Plus, 
  Search, 
  CalendarClock, 
  AlertCircle, 
  CheckCircle, 
  Edit2, 
  Play, 
  Upload, 
  FileSpreadsheet,
  Share2,
  Users,
  Compass,
  ArrowUpDown,
  History,
  Scale,
  DollarSign,
  Calendar,
  Sparkles,
  TrendingUp,
  X,
  Ban,
  UserMinus,
  RotateCcw,
  Trash2,
  ShieldAlert,
  SlidersHorizontal,
  Info,
  Clock,
  ArrowRight,
  Send
} from 'lucide-react';
import { 
  Contract, 
  ContractStatusHistoryEntry,
  AcquisitionChannel, 
  SocialNetworkType,
  ContractAdjustment,
  ContractAdjustmentReason,
  AnnualBalanceFeeConfig
} from '../../types';
import { storage } from '../../services/storageService';
import { 
  FinancialEngine, 
  formatBRL, 
  formatDateBR, 
  formatCompetence,
  ContractGenerationProgressState,
  calculateBalanceFeeDueDate
} from '../../services/financialEngine';
import { SearchableSelect } from '../Common/SearchableSelect';
import { ImportContractsModal } from '../Modals/ImportContractsModal';
import { ContractScheduleModal } from '../Modals/ContractScheduleModal';
import { CancelContractModal } from '../Modals/CancelContractModal';
import { DeleteContractModal } from '../Modals/DeleteContractModal';
import { CompleteCounterpartyModal } from '../Modals/CompleteCounterpartyModal';
import { ContractAdjustmentNotificationModal } from '../Modals/ContractAdjustmentNotificationModal';
import { BalanceFeeBatchBillingModal } from '../Modals/BalanceFeeBatchBillingModal';
import { matchesSearch } from '../../utils/searchUtils';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField, MonthField } from '../Common/DateField';
import { Card, PageToolbar, Button, StatCard, TabPills, MoreMenu } from '../Common/ui';
import { TTrendUp, TFile, TBan, TCoins } from '../Common/tileIcons';

interface ContractsViewProps {
  onOpenBillingModal: () => void;
  initialSearch?: string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const ContractsView: React.FC<ContractsViewProps> = ({ onOpenBillingModal, initialSearch = '' }) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchTerm(initialSearch);
      setStatusTab('ALL');
    }
  }, [initialSearch]);
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [statusTab, setStatusTab] = useState<'ALL' | 'ATIVO' | 'CANCELADO' | 'INATIVO' | 'SUSPENSO_ENCERRADO'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isBalanceFeeBatchModalOpen, setIsBalanceFeeBatchModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [successToast, setSuccessToast] = useState<string>('');

  // Atalho Rápido para Edição/Criação de Clientes
  const [clientsRefreshTrigger, setClientsRefreshTrigger] = useState(0);
  const [clientModalCounterpartyId, setClientModalCounterpartyId] = useState<string | null>(null);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  // Cancelamento & Inativação Modal State
  const [selectedContractForCancel, setSelectedContractForCancel] = useState<Contract | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Exclusão Modal State
  const [selectedContractForDelete, setSelectedContractForDelete] = useState<Contract | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Cronograma & Parcelas Futuras do Contrato Modal State
  const [selectedContractForSchedule, setSelectedContractForSchedule] = useState<Contract | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Aba ativa do modal de cadastro: Dados do Contrato vs Cronograma & Faturas vs Log de Auditoria
  const [contractModalTab, setContractModalTab] = useState<'FORM' | 'SCHEDULE' | 'AUDIT_LOG'>('FORM');
  const [refreshScheduleTrigger, setRefreshScheduleTrigger] = useState(0);
  const [isGeneratingInsideContract, setIsGeneratingInsideContract] = useState(false);
  const [insideContractProgress, setInsideContractProgress] = useState<ContractGenerationProgressState | null>(null);
  const [insideContractFeedback, setInsideContractFeedback] = useState<string>('');

  // Controle do mês inicial de faturamento das parcelas do contrato
  const [generationStartMode, setGenerationStartMode] = useState<'CURRENT_MONTH' | 'ENTRY_MONTH' | 'CUSTOM'>('CURRENT_MONTH');
  const [customStartCompetence, setCustomStartCompetence] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [isSubmittingContract, setIsSubmittingContract] = useState(false);

  // Reajustes Form State
  const [showAdjustmentForm, setShowAdjustmentForm] = useState(false);
  const [newAdjustmentData, setNewAdjustmentData] = useState({
    date: new Date().toISOString().split('T')[0],
    newAmount: 0,
    reason: 'REAJUSTE_ANUAL' as ContractAdjustmentReason,
    notes: ''
  });

  // Notificação de Reajuste ao Cliente Modal State
  const [notifyAdjustmentModal, setNotifyAdjustmentModal] = useState<{
    isOpen: boolean;
    adjustment: ContractAdjustment | null;
  }>({
    isOpen: false,
    adjustment: null
  });

  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    return storage.subscribe(() => {
      setDataVersion(v => v + 1);
    });
  }, []);

  const contracts = useMemo(() => storage.getContracts(), [dataVersion]);
  const counterparties = useMemo(() => {
    return storage.getCounterparties().filter(c => c.type === 'CLIENTE' || c.type === 'AMBOS');
  }, [clientsRefreshTrigger, isModalOpen, dataVersion]);
  const services = useMemo(() => storage.getServices(), [dataVersion]);
  const bankAccounts = useMemo(() => storage.getBankAccounts(), [dataVersion]);
  const allTitles = useMemo(() => storage.getTitles(), [dataVersion]);

  // Fechar modal com tecla Escape para maior comodidade e responsividade
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const activeContracts = useMemo(() => contracts.filter(c => c.status === 'ATIVO'), [contracts]);
  const cancelledContracts = useMemo(() => contracts.filter(c => c.status === 'CANCELADO'), [contracts]);
  const inactiveContracts = useMemo(() => contracts.filter(c => c.status === 'INATIVO'), [contracts]);
  const suspendedOrClosedContracts = useMemo(() => contracts.filter(c => c.status === 'SUSPENSO' || c.status === 'ENCERRADO'), [contracts]);
  const outOfPortfolioContracts = useMemo(() => contracts.filter(c => c.status === 'CANCELADO' || c.status === 'INATIVO'), [contracts]);
  const outOfPortfolioTotal = useMemo(() => outOfPortfolioContracts.reduce((acc, c) => acc + (c.monthlyTotal || 0), 0), [outOfPortfolioContracts]);

  const filteredContracts = useMemo(() => {
    return contracts.filter(c => {
      const client = counterparties.find(cp => cp.id === c.customerId);
      const searchMatch = matchesSearch([
        client?.name,
        client?.tradeName,
        c.contractNumber,
        c.description,
        c.notes,
        c.cancellationReason,
        c.cancellationNotes
      ], searchTerm);
      
      if (!searchMatch) return false;
      if (channelFilter !== 'ALL' && c.acquisitionChannel !== channelFilter) return false;
      if (statusTab === 'ATIVO' && c.status !== 'ATIVO') return false;
      if (statusTab === 'CANCELADO' && c.status !== 'CANCELADO') return false;
      if (statusTab === 'INATIVO' && c.status !== 'INATIVO') return false;
      if (statusTab === 'SUSPENSO_ENCERRADO' && c.status !== 'SUSPENSO' && c.status !== 'ENCERRADO') return false;
      return true;
    });
  }, [contracts, counterparties, searchTerm, channelFilter, statusTab]);

  const mrr = useMemo(() => FinancialEngine.calculateMRR(), [contracts]);
  const activeAvgTicket = useMemo(() => activeContracts.length > 0 ? mrr / activeContracts.length : 0, [activeContracts, mrr]);

  const handleReactivate = (c: Contract) => {
    if (confirm(`Deseja reativar o contrato ${c.contractNumber} (${formatBRL(c.monthlyTotal)}/mês) para a Carteira Ativa?`)) {
      const res = storage.reactivateContract(c.id, { reactivateClient: true });
      if (res.success) {
        setSuccessToast(res.message);
        setTimeout(() => setSuccessToast(''), 5000);
      }
    }
  };

  const [formData, setFormData] = useState<Partial<Contract>>({
    contractNumber: '',
    customerId: counterparties[0]?.id || '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    entryDate: new Date().toISOString().split('T')[0],
    contractType: 'RECORRENTE',
    isRecurring: true,
    autoGenerateFutureMonths: true,
    futureMonthsCount: 12,
    billingFrequency: 'MENSAL',
    dueDay: 10,
    dueRule: 'NEXT_MONTH',
    billingMethod: 'BOLETO',
    monthlyTotal: 0,
    status: 'ATIVO',
    notes: '',
    acquisitionChannel: 'INDICACAO',
    acquisitionReferrerName: '',
    acquisitionSocialNetwork: 'Instagram',
    acquisitionNotes: '',
    adjustments: [],
    annualBalanceFee: {
      enabled: false,
      amount: 2500,
      installmentType: 'UNICA_DEZEMBRO',
      billingMonths: [12],
      dueDay: 10,
      notes: ''
    }
  });

  const effectiveStartComp = useMemo(() => {
    const currentMonth = new Date().toISOString().substring(0, 7);
    if (generationStartMode === 'CURRENT_MONTH') {
      return currentMonth;
    }
    if (generationStartMode === 'ENTRY_MONTH') {
      return formData.startDate ? formData.startDate.substring(0, 7) : currentMonth;
    }
    return customStartCompetence || currentMonth;
  }, [generationStartMode, customStartCompetence, formData.startDate]);

  // Previsão em tempo real das parcelas que serão geradas
  const previewSchedule = useMemo(() => {
    if (formData.contractType === 'AVULSO' || formData.isRecurring === false || formData.autoGenerateFutureMonths === false) {
      return null;
    }
    const count = Number(formData.futureMonthsCount) || 12;
    const amount = Number(formData.monthlyTotal) || 0;
    const [startYear, startMonth] = effectiveStartComp.split('-').map(Number);
    
    const targetEnd = new Date(startYear, startMonth - 1 + count - 1, 1);
    const endComp = `${targetEnd.getFullYear()}-${String(targetEnd.getMonth() + 1).padStart(2, '0')}`;
    const startComp = `${startYear}-${String(startMonth).padStart(2, '0')}`;

    return {
      count,
      totalAmount: count * amount,
      startComp,
      endComp
    };
  }, [formData.contractType, formData.isRecurring, formData.autoGenerateFutureMonths, formData.futureMonthsCount, formData.monthlyTotal, effectiveStartComp]);

  const handleOpenNew = () => {
    setEditingContract(null);
    setShowAdjustmentForm(false);
    setContractModalTab('FORM');
    setFormData({
      contractNumber: `CTR-${new Date().getFullYear()}-${Math.floor(Math.random() * 900 + 100)}`,
      customerId: counterparties[0]?.id || '',
      description: 'Honorários Contábeis e Fiscais',
      startDate: new Date().toISOString().split('T')[0],
      entryDate: new Date().toISOString().split('T')[0],
      contractType: 'RECORRENTE',
      isRecurring: true,
      autoGenerateFutureMonths: true,
      futureMonthsCount: 12,
      billingFrequency: 'MENSAL',
      dueDay: 10,
      dueRule: 'NEXT_MONTH',
      billingMethod: 'BOLETO',
      monthlyTotal: 2500,
      status: 'ATIVO',
      notes: '',
      acquisitionChannel: 'INDICACAO',
      acquisitionReferrerName: '',
      acquisitionSocialNetwork: 'Instagram',
      acquisitionNotes: '',
      adjustments: [],
      annualBalanceFee: {
        enabled: false,
        amount: 2500,
        installmentType: 'UNICA_DEZEMBRO',
        billingMonths: [12],
        dueDay: 10,
        notes: ''
      }
    });
    setNewAdjustmentData({
      date: new Date().toISOString().split('T')[0],
      newAmount: 2500,
      reason: 'REAJUSTE_ANUAL',
      notes: ''
    });
    setGenerationStartMode('CURRENT_MONTH');
    setCustomStartCompetence(new Date().toISOString().substring(0, 7));
    setIsModalOpen(true);
  };

  const handleEdit = (c: Contract) => {
    setEditingContract(c);
    setShowAdjustmentForm(false);
    setContractModalTab('FORM');
    setGenerationStartMode('CURRENT_MONTH');
    setCustomStartCompetence(new Date().toISOString().substring(0, 7));
    setFormData({
      ...c,
      contractType: c.contractType || (c.isRecurring === false ? 'AVULSO' : 'RECORRENTE'),
      isRecurring: c.isRecurring !== false && c.contractType !== 'AVULSO',
      autoGenerateFutureMonths: c.autoGenerateFutureMonths !== false,
      futureMonthsCount: c.futureMonthsCount || 12,
      entryDate: c.entryDate || c.startDate || new Date().toISOString().split('T')[0],
      acquisitionChannel: c.acquisitionChannel || 'OUTRO',
      acquisitionReferrerName: c.acquisitionReferrerName || '',
      acquisitionSocialNetwork: c.acquisitionSocialNetwork || 'Instagram',
      acquisitionNotes: c.acquisitionNotes || '',
      adjustments: c.adjustments || [],
      annualBalanceFee: c.annualBalanceFee || {
        enabled: false,
        amount: c.monthlyTotal || 2500,
        installmentType: 'UNICA_DEZEMBRO',
        billingMonths: [12],
        dueDay: c.dueDay || 10,
        notes: ''
      }
    });
    setNewAdjustmentData({
      date: new Date().toISOString().split('T')[0],
      newAmount: c.monthlyTotal || 2500,
      reason: 'REAJUSTE_ANUAL',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const editingContractTitles = useMemo(() => {
    const targetId = editingContract?.id || formData.id;
    const targetNumber = editingContract?.contractNumber || formData.contractNumber;
    if (!targetId && !targetNumber) return [];
    
    const titles = storage.getTitles();
    return titles
      .filter(t => 
        t.type === 'RECEBER' && 
        (t.originType === 'CONTRATO' || t.originType === 'VENDA') && 
        (t.originId === targetId || t.contractId === targetId || t.contractNumber === targetNumber || t.originId === targetNumber) && 
        t.documentState !== 'CANCELADO'
      )
      .sort((a, b) => (a.competence || a.dueDate).localeCompare(b.competence || b.dueDate));
  }, [editingContract, formData.id, formData.contractNumber, isModalOpen, refreshScheduleTrigger]);

  const handleGenerateInsideContract = async (options?: { updateExistingOpen?: boolean }) => {
    setIsGeneratingInsideContract(true);
    setInsideContractFeedback('');
    setInsideContractProgress({
      percent: 5,
      stage: 'Iniciando faturamento...',
      currentMonth: '',
      processed: 0,
      total: Number(formData.futureMonthsCount) || 12
    });

    try {
      if (!formData.contractNumber?.trim()) {
        alert('Por favor, informe o Número do Contrato primeiro.');
        setIsGeneratingInsideContract(false);
        setInsideContractProgress(null);
        return;
      }
      if (!formData.customerId?.trim()) {
        alert('Por favor, selecione o Cliente Contratante primeiro.');
        setIsGeneratingInsideContract(false);
        setInsideContractProgress(null);
        return;
      }
      if (!formData.monthlyTotal || Number(formData.monthlyTotal) <= 0) {
        alert('Por favor, informe o Valor Mensal dos Honorários.');
        setIsGeneratingInsideContract(false);
        setInsideContractProgress(null);
        return;
      }

      const all = storage.getContracts();
      const monthsCount = Number(formData.futureMonthsCount) || 12;
      const todayYmd = new Date().toISOString().split('T')[0];
      const currentMonthComp = todayYmd.substring(0, 7);
      const entryMonthComp = (formData.entryDate || formData.startDate || todayYmd).substring(0, 7);
      const effectiveStartComp = generationStartMode === 'ENTRY_MONTH'
        ? entryMonthComp
        : generationStartMode === 'CUSTOM' && customStartCompetence
        ? customStartCompetence
        : currentMonthComp;

      let contractToGenerate: Contract;

      if (editingContract) {
        const updated = all.map(c => c.id === editingContract.id ? {
          ...c,
          ...formData,
          status: 'ATIVO' as const,
          cancellationDate: undefined,
          cancellationReason: undefined
        } as Contract : c);
        storage.saveContracts(updated);
        contractToGenerate = updated.find(c => c.id === editingContract.id)!;
      } else {
        const newId = `ctr-${Date.now()}`;
        const newContract: Contract = {
          id: newId,
          companyId: 'comp-1',
          contractNumber: formData.contractNumber!,
          customerId: formData.customerId!,
          description: formData.description || 'Honorários Contábeis',
          startDate: formData.startDate || todayYmd,
          entryDate: formData.entryDate || formData.startDate || todayYmd,
          contractType: 'RECORRENTE',
          isRecurring: true,
          periodicity: 'MENSAL',
          dueDay: Number(formData.dueDay) || 10,
          dueRule: (formData.dueRule as any) || 'NEXT_MONTH',
          billingMethod: (formData.billingMethod as any) || 'BOLETO',
          monthlyTotal: Number(formData.monthlyTotal) || 0,
          items: formData.items || [
            {
              id: `item-${Date.now()}`,
              serviceId: services[0]?.id || 'srv-1',
              description: formData.description || 'Honorários Contábeis',
              quantity: 1,
              unitPrice: Number(formData.monthlyTotal) || 0,
              accountId: services[0]?.defaultAccountId || 'acc-1.1.01',
              total: Number(formData.monthlyTotal) || 0
            }
          ],
          status: 'ATIVO',
          createdAt: new Date().toISOString()
        };
        storage.saveContracts([...all, newContract]);
        contractToGenerate = newContract;
        setEditingContract(newContract);
      }

      const res = await FinancialEngine.generateContractFutureInstallmentsAsync(
        contractToGenerate,
        monthsCount,
        effectiveStartComp,
        options,
        (p) => setInsideContractProgress(p)
      );

      setRefreshScheduleTrigger(prev => prev + 1);

      if (res.error) {
        setInsideContractFeedback(`⚠️ ${res.error}`);
      } else if (res.generatedCount > 0) {
        setInsideContractFeedback(`✓ Sucesso! ${res.generatedCount} novas faturas geradas cobrindo ${res.competences.length} meses (${formatBRL(res.totalAmountGenerated)}).`);
        setSuccessToast(`✓ ${res.generatedCount} faturas geradas com sucesso para o Contrato ${contractToGenerate.contractNumber}!`);
      } else if ((res.updatedCount || 0) > 0) {
        setInsideContractFeedback(`✓ Sucesso! ${res.updatedCount} faturas em aberto sincronizadas para ${formatBRL(contractToGenerate.monthlyTotal)}.`);
        setSuccessToast(`✓ ${res.updatedCount} faturas sincronizadas para o Contrato ${contractToGenerate.contractNumber}!`);
      } else if (res.alreadyExistingCount > 0) {
        setInsideContractFeedback(`ℹ️ Todas as ${res.alreadyExistingCount} competências já possuem faturas geradas no Contas a Receber. Use 'Sincronizar em Aberto' se desejar atualizar valores.`);
      }

      setTimeout(() => setInsideContractFeedback(''), 8000);
      setTimeout(() => setSuccessToast(''), 5000);
    } catch (err: any) {
      console.error('Erro na geração direta:', err);
      setInsideContractFeedback(`⚠️ Falha ao gerar: ${err?.message || 'Erro inesperado'}`);
    } finally {
      setIsGeneratingInsideContract(false);
      setTimeout(() => setInsideContractProgress(null), 1200);
    }
  };

  const handleOpenAuditLog = (c: Contract) => {
    handleEdit(c);
    setContractModalTab('AUDIT_LOG');
  };

  const handleApplyAdjustment = () => {
    const currentAmount = formData.monthlyTotal || 0;
    const newAmount = Number(newAdjustmentData.newAmount);
    if (!newAmount || newAmount <= 0) {
      alert('Informe um valor de reajuste válido superior a R$ 0,00.');
      return;
    }

    const percentage = currentAmount > 0 
      ? Math.round(((newAmount - currentAmount) / currentAmount) * 10000) / 100
      : 0;

    const currentUser = storage.getCurrentUser();
    const newAdjustment: ContractAdjustment = {
      id: `adj-${Date.now()}`,
      date: newAdjustmentData.date,
      previousAmount: currentAmount,
      newAmount: newAmount,
      percentage: percentage,
      reason: newAdjustmentData.reason,
      notes: newAdjustmentData.notes || undefined,
      appliedAt: new Date().toISOString(),
      appliedBy: currentUser.name
    };

    const updatedAdjustments = [newAdjustment, ...(formData.adjustments || [])];
    
    setFormData({
      ...formData,
      monthlyTotal: newAmount,
      adjustments: updatedAdjustments
    });

    setShowAdjustmentForm(false);
    setSuccessToast(`Reajuste de ${formatBRL(currentAmount)} para ${formatBRL(newAmount)} registrado no contrato!`);
    setTimeout(() => setSuccessToast(''), 4000);
  };

  const handleBalanceFeeTypeChange = (type: 'UNICA_DEZEMBRO' | 'DUAS_PARCELAS' | 'TRES_PARCELAS' | 'PERSONALIZADO') => {
    let months: number[] = [formData.annualBalanceFee?.competenceMonth || 12];
    if (type === 'DUAS_PARCELAS') {
      months = [11, 12];
    } else if (type === 'TRES_PARCELAS') {
      months = [10, 11, 12];
    } else if (type === 'PERSONALIZADO') {
      months = formData.annualBalanceFee?.billingMonths || [12];
    }

    setFormData({
      ...formData,
      annualBalanceFee: {
        ...(formData.annualBalanceFee || { 
          enabled: true, 
          amount: formData.monthlyTotal || 0,
          dueRule: 'SAME_MONTH',
          dueDay: formData.dueDay || 10
        }),
        installmentType: type,
        billingMonths: months,
        competenceMonth: type === 'UNICA_DEZEMBRO' ? (formData.annualBalanceFee?.competenceMonth || months[0] || 12) : undefined,
        dueRule: formData.annualBalanceFee?.dueRule || 'SAME_MONTH'
      }
    });
  };

  const handleSingleCompetenceMonthChange = (monthNum: number) => {
    setFormData({
      ...formData,
      annualBalanceFee: {
        ...(formData.annualBalanceFee || { 
          enabled: true, 
          amount: formData.monthlyTotal || 0,
          dueRule: 'SAME_MONTH',
          dueDay: formData.dueDay || 10
        }),
        installmentType: 'UNICA_DEZEMBRO',
        billingMonths: [monthNum],
        competenceMonth: monthNum
      }
    });
  };

  const toggleCustomBalanceMonth = (monthNum: number) => {
    const currentMonths = formData.annualBalanceFee?.billingMonths || [];
    let updatedMonths: number[];
    if (currentMonths.includes(monthNum)) {
      if (currentMonths.length === 1) {
        alert('Selecione pelo menos um mês para faturar a taxa de balanço.');
        return;
      }
      updatedMonths = currentMonths.filter(m => m !== monthNum);
    } else {
      updatedMonths = [...currentMonths, monthNum].sort((a, b) => a - b);
    }

    setFormData({
      ...formData,
      annualBalanceFee: {
        ...(formData.annualBalanceFee || { enabled: true, amount: formData.monthlyTotal || 0, installmentType: 'PERSONALIZADO' }),
        billingMonths: updatedMonths
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingContract) return;

    if (!formData.contractNumber?.trim()) {
      alert('Por favor, informe o Número do Contrato (ex: CTR-001).');
      return;
    }
    if (!formData.customerId?.trim()) {
      alert('Por favor, selecione o Cliente Contratante.');
      return;
    }
    if (!formData.monthlyTotal || Number(formData.monthlyTotal) <= 0) {
      alert('Por favor, informe o Valor Mensal dos Honorários (superior a R$ 0,00).');
      return;
    }

    setIsSubmittingContract(true);
    const safetyTimer = setTimeout(() => {
      setIsSubmittingContract(false);
    }, 6000);

    try {
      const all = storage.getContracts();
      const currentUser = storage.getCurrentUser();

      const isContractRecurring = formData.contractType !== 'AVULSO' && formData.isRecurring !== false;
      const shouldAutoGenerate = isContractRecurring && formData.autoGenerateFutureMonths !== false;
      const monthsCount = Number(formData.futureMonthsCount) || 12;

      // Calcular competência inicial efetiva conforme modo selecionado
      const todayYmd = new Date().toISOString().split('T')[0];
      const currentMonthComp = todayYmd.substring(0, 7);
      const entryMonthComp = (formData.entryDate || formData.startDate || todayYmd).substring(0, 7);
      const effectiveStartComp = generationStartMode === 'ENTRY_MONTH'
        ? entryMonthComp
        : generationStartMode === 'CUSTOM' && customStartCompetence
        ? customStartCompetence
        : currentMonthComp;

      if (editingContract) {
        let updatedStatusHistory = editingContract.statusHistory || [];
        if (formData.status && formData.status !== editingContract.status) {
          const historyEntry: ContractStatusHistoryEntry = {
            id: `csh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            contractId: editingContract.id,
            previousStatus: editingContract.status,
            newStatus: formData.status as any,
            changedAt: new Date().toISOString(),
            changedBy: currentUser.name,
            userRole: currentUser.role,
            reason: formData.cancellationReason || `Alteração manual no cadastro (${editingContract.status} ➔ ${formData.status})`,
            notes: formData.cancellationNotes,
            effectiveDate: formData.cancellationDate || new Date().toISOString().split('T')[0]
          };
          updatedStatusHistory = [historyEntry, ...updatedStatusHistory];
        }

        const isSettingActive = formData.status === 'ATIVO' || !formData.status;
        const updated = all.map(c => c.id === editingContract.id ? { 
          ...c, 
          ...formData,
          status: (formData.status || c.status || 'ATIVO') as any,
          cancellationDate: isSettingActive ? undefined : (formData.cancellationDate || c.cancellationDate),
          cancellationReason: isSettingActive ? undefined : (formData.cancellationReason || c.cancellationReason),
          contractType: isContractRecurring ? 'RECORRENTE' : 'AVULSO',
          isRecurring: isContractRecurring,
          futureMonthsCount: monthsCount,
          adjustments: formData.adjustments || c.adjustments || [],
          annualBalanceFee: formData.annualBalanceFee || c.annualBalanceFee,
          statusHistory: updatedStatusHistory
        } as Contract : c);
        storage.saveContracts(updated);

        let generationMsg = '';
        if (shouldAutoGenerate && isSettingActive) {
          const savedContract = updated.find(c => c.id === editingContract.id)!;
          const res = FinancialEngine.generateContractFutureInstallments(savedContract, monthsCount, effectiveStartComp);
          if (res.generatedCount > 0) {
            generationMsg = ` • ${res.generatedCount} títulos gerados para os próximos meses (${formatBRL(res.totalAmountGenerated)})`;
          } else if ((res.updatedCount || 0) > 0) {
            generationMsg = ` • ${res.updatedCount} títulos em aberto sincronizados`;
          } else if (res.alreadyExistingCount > 0) {
            generationMsg = ` • (${res.alreadyExistingCount} títulos preservados no cronograma)`;
          }
        }

        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'EDICAO_CONTRATO',
          module: 'Contratos Recorrentes',
          recordId: editingContract.id,
          details: `Alteração do contrato ${formData.contractNumber}.${generationMsg}`
        });
        setSuccessToast(`Contrato ${formData.contractNumber} atualizado com sucesso!${generationMsg}`);
      } else {
        const newContract: Contract = {
          id: `ctr-${Date.now()}`,
          companyId: 'comp-1',
          contractNumber: formData.contractNumber!,
          customerId: formData.customerId!,
          description: formData.description || 'Honorários Contábeis',
          startDate: formData.startDate || new Date().toISOString().split('T')[0],
          entryDate: formData.entryDate || formData.startDate || new Date().toISOString().split('T')[0],
          endDate: formData.endDate || undefined,
          contractType: isContractRecurring ? 'RECORRENTE' : 'AVULSO',
          isRecurring: isContractRecurring,
          autoGenerateFutureMonths: shouldAutoGenerate,
          futureMonthsCount: monthsCount,
          acquisitionChannel: formData.acquisitionChannel || 'OUTRO',
          acquisitionReferrerName: formData.acquisitionReferrerName || undefined,
          acquisitionSocialNetwork: formData.acquisitionSocialNetwork || undefined,
          acquisitionNotes: formData.acquisitionNotes || undefined,
          billingFrequency: 'MENSAL',
          dueDay: Number(formData.dueDay) || 10,
          dueRule: formData.dueRule as 'SAME_MONTH' | 'NEXT_MONTH' || 'NEXT_MONTH',
          billingMethod: formData.billingMethod as any || 'BOLETO',
          monthlyTotal: Number(formData.monthlyTotal) || 0,
          periodicity: 'MENSAL',
          items: [
            {
              id: `item-${Date.now()}`,
              serviceId: services[0]?.id || 'srv-1',
              description: formData.description || 'Honorários Contábeis',
              quantity: 1,
              unitPrice: Number(formData.monthlyTotal) || 0,
              accountId: services[0]?.defaultAccountId || 'acc-1.1.01',
              total: Number(formData.monthlyTotal) || 0
            }
          ],
          status: formData.status as any || 'ATIVO',
          cancellationDate: formData.cancellationDate || undefined,
          cancellationReason: formData.cancellationReason || undefined,
          cancellationNotes: formData.cancellationNotes || undefined,
          statusHistory: [
            {
              id: `csh-${Date.now()}`,
              contractId: `ctr-${Date.now()}`,
              previousStatus: 'RASCUNHO',
              newStatus: (formData.status as any) || 'ATIVO',
              changedAt: new Date().toISOString(),
              changedBy: currentUser.name,
              userRole: currentUser.role,
              reason: 'Cadastro inicial do contrato',
              effectiveDate: formData.startDate || new Date().toISOString().split('T')[0]
            }
          ],
          adjustments: formData.adjustments || [],
          annualBalanceFee: formData.annualBalanceFee,
          notes: formData.notes || '',
          createdAt: new Date().toISOString()
        };
        storage.saveContracts([...all, newContract]);

        let generationMsg = '';
        if (shouldAutoGenerate && newContract.status === 'ATIVO') {
          const res = FinancialEngine.generateContractFutureInstallments(newContract, monthsCount, effectiveStartComp);
          if (res.generatedCount > 0) {
            generationMsg = ` • ${res.generatedCount} títulos a receber gerados automaticamente para os próximos meses (${formatBRL(res.totalAmountGenerated)})`;
          } else if (res.alreadyExistingCount > 0) {
            generationMsg = ` • (${res.alreadyExistingCount} títulos preservados no cronograma)`;
          }
        }

        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'CADASTRO_CONTRATO',
          module: 'Contratos Recorrentes',
          recordId: newContract.id,
          details: `Cadastro de novo contrato ${newContract.contractNumber} (${formatBRL(newContract.monthlyTotal)}/mês).${generationMsg}`
        });

        const antiDupInfo = shouldAutoGenerate && newContract.status === 'ATIVO'
          ? ' (As faturas já estão geradas no Contas a Receber e Vendas — não é necessário faturar novamente em Vendas).'
          : '';
        setSuccessToast(`Contrato ${newContract.contractNumber} cadastrado com sucesso!${generationMsg}${antiDupInfo}`);
      }

      setTimeout(() => setSuccessToast(''), 7000);
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Erro ao salvar contrato:', err);
      alert(`Ocorreu um erro ao salvar o contrato: ${err?.message || 'Falha inesperada no processamento.'}`);
    } finally {
      clearTimeout(safetyTimer);
      setIsSubmittingContract(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageToolbar description="Mensalidades, histórico de reajustes, taxa de balanço anual e faturamento em lote.">
        <MoreMenu
          items={[
            {
              label: 'Importar contratos (Excel)',
              icon: <Upload className="w-4 h-4" />,
              onClick: () => setIsImportModalOpen(true),
              hint: 'Vários contratos de uma vez, pelo modelo oficial'
            },
            {
              label: 'Faturar taxa de balanço (13º)',
              icon: <Scale className="w-4 h-4" />,
              onClick: () => setIsBalanceFeeBatchModalOpen(true),
              hint: 'Em lote, conforme o parcelamento de cada contrato'
            }
          ]}
        />
        <Button variant="secondary" icon={<CalendarClock className="w-4 h-4" />} onClick={onOpenBillingModal}>
          Processar faturamento mensal
        </Button>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleOpenNew}>
          Novo contrato
        </Button>
      </PageToolbar>

      {successToast && (
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] flex items-center gap-3 text-sm text-[var(--text-primary)]">
          <CheckCircle className="w-4 h-4 text-[var(--status-success)] shrink-0" />
          <span className="flex-1">{successToast}</span>
          <button onClick={() => setSuccessToast('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="MRR da carteira ativa" icon={<TTrendUp />} accent="success" value={formatBRL(mrr)} hint="Só contratos com faturamento ativo" />
        <StatCard
          label="Contratos ativos" icon={<TFile />} accent="info"
          value={activeContracts.length}
          hint={`${Math.round((activeContracts.length / (contracts.length || 1)) * 100)}% da base (${contracts.length} cadastrados)`}
        />
        <StatCard
          label="Cancelados e inativos" icon={<TBan />} accent="danger"
          value={outOfPortfolioContracts.length}
          tone={outOfPortfolioContracts.length > 0 ? 'danger' : 'neutral'}
          hint={`${formatBRL(outOfPortfolioTotal)}/mês saiu do faturamento`}
        />
        <StatCard label="Ticket médio ativo" icon={<TCoins />} accent="gold" value={formatBRL(activeAvgTicket)} hint="Valor médio mensal por contrato" />
      </div>

      <Card className="space-y-4">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4">
          <div className="min-w-0 2xl:flex-1">
            <TabPills
              tabs={[
                { id: 'ALL', label: 'Todos', count: contracts.length },
                { id: 'ATIVO', label: 'Carteira ativa', count: activeContracts.length },
                { id: 'CANCELADO', label: 'Cancelados', count: cancelledContracts.length },
                { id: 'INATIVO', label: 'Inativos', count: inactiveContracts.length },
                ...(suspendedOrClosedContracts.length > 0
                  ? [{ id: 'SUSPENSO_ENCERRADO', label: 'Suspensos e encerrados', count: suspendedOrClosedContracts.length }]
                  : [])
              ]}
              value={statusTab}
              onChange={id => setStatusTab(id as any)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_16rem] gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por cliente, número ou motivo de cancelamento"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-[var(--border-highlight)]"
            />
          </div>
          <PremiumSelect
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            sheetTitle="Canal de aquisição"
            className="w-full h-10 px-3 text-sm"
          >
            <option value="ALL">Todos os canais de aquisição</option>
            <option value="INDICACAO">Indicação</option>
            <option value="REDE_SOCIAL">Rede social</option>
            <option value="MECANISMO_PESQUISA">Mecanismo de pesquisa</option>
            <option value="PROSPECCAO_ATIVA">Prospecção ativa</option>
            <option value="EVENTO">Evento</option>
            <option value="OUTRO">Outros</option>
          </PremiumSelect>
        </div>
      </Card>

      {/* Contracts Table */}
      <div className="bg-white dark:bg-[#131316] rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Contrato / Tipo</th>
                <th className="py-3 px-4">Cliente / Contratante</th>
                <th className="py-3 px-4">Entrada & Origem</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4 text-right">Mensalidade</th>
                <th className="py-3 px-4 text-center">Faturamento & Próximos Meses</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#26262b]">
              {filteredContracts.map(c => {
                const client = counterparties.find(cp => cp.id === c.customerId);
                const isRecurring = c.isRecurring !== false && c.contractType !== 'AVULSO';
                const scheduledTitles = allTitles.filter(t => t.originType === 'CONTRATO' && t.originId === c.id && t.documentState !== 'CANCELADO');
                const scheduledCount = scheduledTitles.length;
                const openTitlesCount = scheduledTitles.filter(t => t.settlementState !== 'LIQUIDADO').length;

                return (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-[#1b1b20]/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">{c.contractNumber}</span>
                        {isRecurring ? (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            ⚡ Recorrente
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                            Avulso
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{c.description}</div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {c.annualBalanceFee && c.annualBalanceFee.enabled && (
                          <span 
                            className="inline-flex items-center text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30"
                            title={`Taxa de Balanço Anual: ${formatBRL(c.annualBalanceFee.amount)} (${c.annualBalanceFee.billingMonths?.length || 1} parcela(s))` }
                          >
                            <Scale className="w-3 h-3 mr-1 text-amber-500" />
                            Taxa Balanço: {formatBRL(c.annualBalanceFee.amount)} ({c.annualBalanceFee.billingMonths?.length || 1}x)
                          </span>
                        )}
                        {c.adjustments && c.adjustments.length > 0 && (
                          <span 
                            className="inline-flex items-center text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30"
                            title={`${c.adjustments.length} reajuste(s) no histórico. Último em ${formatDateBR(c.adjustments[0]?.date)}`}
                          >
                            <TrendingUp className="w-3 h-3 mr-1 text-amber-500" />
                            {c.adjustments.length} reajuste(s)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{client?.name || 'Cliente'}</span>
                        {client && (
                          <button
                            type="button"
                            onClick={() => {
                              setClientModalCounterpartyId(client.id);
                              setIsClientModalOpen(true);
                            }}
                            className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 p-0.5 rounded hover:bg-amber-500/10 transition-colors cursor-pointer"
                            title={`Editar cadastro de ${client.name}`}
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{client?.document}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center text-slate-800 dark:text-slate-200 font-medium text-[11px]">
                        <CalendarClock className="w-3.5 h-3.5 mr-1 text-amber-500 shrink-0" />
                        <span>Entrada: {formatDateBR(c.entryDate || c.startDate)}</span>
                      </div>
                      <div className="mt-1">
                        {c.acquisitionChannel === 'INDICACAO' && (
                          <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800" title={c.acquisitionReferrerName ? `Indicado por: ${c.acquisitionReferrerName}` : ''}>
                            🤝 {c.acquisitionReferrerName ? `Indicação: ${c.acquisitionReferrerName}` : 'Indicação'}
                          </span>
                        )}
                        {c.acquisitionChannel === 'REDE_SOCIAL' && (
                          <span className="inline-flex items-center text-[10px] font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                            📱 {c.acquisitionSocialNetwork || 'Rede Social'}
                          </span>
                        )}
                        {c.acquisitionChannel === 'MECANISMO_PESQUISA' && (
                          <span className="inline-flex items-center text-[10px] font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                            🔍 Google / Pesquisa
                          </span>
                        )}
                        {c.acquisitionChannel === 'PROSPECCAO_ATIVA' && (
                          <span className="inline-flex items-center text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                            🎯 Prospecção
                          </span>
                        )}
                        {c.acquisitionChannel === 'EVENTO' && (
                          <span className="inline-flex items-center text-[10px] font-semibold text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/50 px-2 py-0.5 rounded border border-pink-200 dark:border-pink-800">
                            🎤 Evento
                          </span>
                        )}
                        {(!c.acquisitionChannel || c.acquisitionChannel === 'OUTRO') && (
                          <span className="inline-flex items-center text-[10px] text-slate-500 bg-slate-100 dark:bg-[#1b1b20] px-2 py-0.5 rounded">
                            Origem direta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Todo dia {c.dueDay}</span>
                      <div className="text-[10px] text-slate-500">
                        {c.dueRule === 'NEXT_MONTH' ? 'Mês seguinte (D+1)' : 'Mesmo mês (D+0)'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {c.status === 'CANCELADO' || c.status === 'INATIVO' ? (
                        <div>
                          <div className="text-sm font-bold text-slate-400 dark:text-slate-500 line-through">
                            {formatBRL(c.monthlyTotal)}
                          </div>
                          <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                            Fora do MRR
                          </span>
                        </div>
                      ) : (
                        <div>
                          <div className="font-bold text-slate-900 dark:text-amber-400 text-sm">
                            {formatBRL(c.monthlyTotal)}
                          </div>
                          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Renda Ativa
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {isRecurring ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContractForSchedule(c);
                            setIsScheduleModalOpen(true);
                          }}
                          className="inline-flex flex-col items-center group p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors cursor-pointer"
                          title="Clique para ver o cronograma e gerar próximos meses"
                        >
                          {scheduledCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md group-hover:brightness-110">
                              <CalendarClock className="w-3.5 h-3.5" />
                              <span>{scheduledCount} meses gerados</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md group-hover:text-amber-500">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              <span>Gerar meses</span>
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {openTitlesCount > 0 ? `${openTitlesCount} a vencer` : (scheduledCount > 0 ? 'Todos quitados' : 'Pendente')}
                          </span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-mono">Sem recorrência</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {c.status === 'ATIVO' && (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          ATIVO
                        </span>
                      )}

                      {c.status === 'CANCELADO' && (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                            <Ban className="w-3 h-3" />
                            CANCELADO
                          </span>
                          {c.cancellationDate && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                              Desde {formatDateBR(c.cancellationDate)}
                            </span>
                          )}
                          {c.cancellationReason && (
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 max-w-[140px] truncate" title={c.cancellationReason}>
                              {c.cancellationReason}
                            </span>
                          )}
                        </div>
                      )}

                      {c.status === 'INATIVO' && (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            <UserMinus className="w-3 h-3" />
                            INATIVO
                          </span>
                          {c.cancellationDate && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                              Desde {formatDateBR(c.cancellationDate)}
                            </span>
                          )}
                          {c.cancellationReason && (
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 max-w-[140px] truncate" title={c.cancellationReason}>
                              {c.cancellationReason}
                            </span>
                          )}
                        </div>
                      )}

                      {c.status === 'SUSPENSO' && (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                            <Clock className="w-3 h-3" />
                            SUSPENSO
                          </span>
                        </div>
                      )}

                      {c.status === 'ENCERRADO' && (
                        <div className="flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                            ENCERRADO
                          </span>
                          {c.endDate && (
                            <span className="text-[10px] text-slate-500 mt-0.5">
                              Fim: {formatDateBR(c.endDate)}
                            </span>
                          )}
                        </div>
                      )}

                      {!['ATIVO', 'CANCELADO', 'INATIVO', 'SUSPENSO', 'ENCERRADO'].includes(c.status) && (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {c.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === 'ATIVO' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedContractForCancel(c);
                                setIsCancelModalOpen(true);
                              }}
                              className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                              title="Cancelar Contrato ou Deixar Inativo..."
                            >
                              <Ban className="w-4 h-4" />
                            </button>

                            {isRecurring && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedContractForSchedule(c);
                                  setIsScheduleModalOpen(true);
                                }}
                                className="p-1.5 text-slate-600 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-[#1b1b20] rounded-lg transition-colors cursor-pointer"
                                title="Ver Cronograma / Gerar Próximos Meses"
                              >
                                <CalendarClock className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReactivate(c)}
                            className="px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            title="Reativar contrato na carteira ativa"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Reativar</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenAuditLog(c)}
                          className="p-1.5 text-slate-600 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-[#1b1b20] rounded-lg transition-colors cursor-pointer relative"
                          title="Aba / Log de Auditoria de Mudança de Status (Ativo/Inativo/Cancelado)"
                        >
                          <History className="w-4 h-4 text-amber-500" />
                          {(c.statusHistory?.length || 0) > 0 && (
                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-black text-[9px] font-black rounded-full flex items-center justify-center">
                              {c.statusHistory?.length}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(c)}
                          className="p-1.5 text-slate-600 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-[#1b1b20] rounded-lg transition-colors cursor-pointer"
                          title="Editar Contrato"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedContractForDelete(c);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Excluir Contrato Definitivamente..."
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Redesenhado: Altamente Responsivo com Fechamento Seguro (Backdrop / X / Escape / Cancelar) */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div 
            className="bg-white dark:bg-[#131316] rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[92vh] border border-slate-200 dark:border-[#26262b] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            
            {/* Header Fixo e Sempre Visível com Botão X Acessível */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] shrink-0 sticky top-0 z-20">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-black border border-amber-500/50 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.25)] shrink-0">
                  <FileText className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {editingContract ? 'Editar Contrato Recorrente' : 'Novo Contrato de Prestação de Serviços'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Honorários, taxa de balanço anual, reajustes históricos e parâmetros de faturamento
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)} 
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
                title="Fechar janela (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas do Cadastro de Contrato: 1. Dados do Contrato | 2. Cronograma & Faturas Geradas | 3. Log de Auditoria */}
            <div className="px-6 pt-2 pb-0 bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] flex items-center gap-2 shrink-0 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setContractModalTab('FORM')}
                className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  contractModalTab === 'FORM'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Dados do Contrato</span>
              </button>

              <button
                type="button"
                onClick={() => setContractModalTab('SCHEDULE')}
                className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  contractModalTab === 'SCHEDULE'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5 text-amber-500" />
                <span>Cronograma & Faturas Geradas</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  editingContractTitles.length > 0
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}>
                  {editingContractTitles.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setContractModalTab('AUDIT_LOG')}
                className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  contractModalTab === 'AUDIT_LOG'
                    ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Log de Auditoria & Status</span>
                {(editingContract?.statusHistory?.length || 0) > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                    {editingContract?.statusHistory?.length}
                  </span>
                )}
              </button>
            </div>

            {/* Formulário com Container Interno com Scroll Seguro */}
            <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden">
              
              {contractModalTab === 'AUDIT_LOG' ? (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
                  {/* Card do Status Atual do Contrato */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1b1b20]/60 border border-slate-200 dark:border-[#26262b] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-[#26262b]">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
                          Status Atual no Sistema
                        </span>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                            formData.status === 'ATIVO'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                              : formData.status === 'CANCELADO'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                              : formData.status === 'INATIVO'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                              : formData.status === 'SUSPENSO'
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}>
                            <span className={`w-2 h-2 rounded-full ${
                              formData.status === 'ATIVO' ? 'bg-emerald-500' : formData.status === 'CANCELADO' ? 'bg-rose-500' : 'bg-amber-500'
                            }`} />
                            {formData.status || 'ATIVO'}
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {formatBRL(formData.monthlyTotal || 0)}/mês
                          </span>
                          <span className="text-slate-500">•</span>
                          <span className="text-slate-600 dark:text-slate-400 font-semibold">
                            {counterparties.find(cp => cp.id === formData.customerId)?.name || 'Cliente'}
                          </span>
                        </div>
                      </div>

                      {/* Botão de Ação Rápida de Mudança de Status */}
                      {editingContract && (
                        <div className="flex items-center gap-2">
                          {formData.status === 'ATIVO' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedContractForCancel(editingContract);
                                setIsCancelModalOpen(true);
                              }}
                              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>Cancelar ou Inativar Contrato</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                handleReactivate(editingContract);
                                setIsModalOpen(false);
                              }}
                              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reativar para Carteira Ativa</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Detalhes de Cancelamento se inativo ou cancelado */}
                    {(formData.status === 'CANCELADO' || formData.status === 'INATIVO' || formData.cancellationDate) && (
                      <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs space-y-1">
                        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold">
                          <Info className="w-3.5 h-3.5 text-amber-500" />
                          <span>Dados do Término / Encerramento da Relação Comercial:</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-700 dark:text-slate-300 pt-1">
                          <div>
                            <span className="text-slate-500">Data de Término / Efeito: </span>
                            <strong>{formData.cancellationDate ? formatDateBR(formData.cancellationDate) : '-'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Motivo Declarado: </span>
                            <strong>{formData.cancellationReason || '-'}</strong>
                          </div>
                          {formData.inactivatedBy && (
                            <div>
                              <span className="text-slate-500">Responsável pelo Registro: </span>
                              <strong>{formData.inactivatedBy}</strong>
                            </div>
                          )}
                          {formData.cancellationNotes && (
                            <div className="sm:col-span-2">
                              <span className="text-slate-500">Observações / Histórico: </span>
                              <span>{formData.cancellationNotes}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Histórico Cronológico de Mudanças de Status */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <History className="w-4 h-4 text-amber-500" />
                        <span>Log Cronológico de Mudanças de Status (Auditoria)</span>
                      </h4>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {(editingContract?.statusHistory?.length || 0)} evento(s) registrado(s)
                      </span>
                    </div>

                    {(editingContract?.statusHistory && editingContract.statusHistory.length > 0) ? (
                      <div className="rounded-xl border border-slate-200 dark:border-[#26262b] overflow-hidden bg-white dark:bg-[#131316]">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-[#1b1b20] text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-[#26262b]">
                              <tr>
                                <th className="py-2.5 px-3 whitespace-nowrap">Data / Hora</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Usuário Responsável</th>
                                <th className="py-2.5 px-3 text-center whitespace-nowrap">Transição de Status</th>
                                <th className="py-2.5 px-3 whitespace-nowrap">Vigência / Término</th>
                                <th className="py-2.5 px-3">Motivo & Observações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-[#26262b]">
                              {editingContract.statusHistory.map((entry) => (
                                <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-[#1b1b20]/40 transition-colors">
                                  <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-800 dark:text-slate-200">
                                    {formatDateBR(entry.changedAt)}
                                    <span className="text-[10px] text-slate-400 block font-normal">
                                      às {new Date(entry.changedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </td>

                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <span className="font-bold text-slate-900 dark:text-white block">
                                      {entry.changedBy}
                                    </span>
                                    {entry.userRole && (
                                      <span className="text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded font-medium">
                                        {entry.userRole}
                                      </span>
                                    )}
                                  </td>

                                  <td className="py-3 px-3 text-center whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1.5">
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                        {entry.previousStatus}
                                      </span>
                                      <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        entry.newStatus === 'ATIVO'
                                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                          : entry.newStatus === 'CANCELADO'
                                          ? 'bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                                          : entry.newStatus === 'INATIVO'
                                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                                          : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600'
                                      }`}>
                                        {entry.newStatus}
                                      </span>
                                    </div>
                                  </td>

                                  <td className="py-3 px-3 whitespace-nowrap text-slate-700 dark:text-slate-300 font-mono">
                                    {entry.effectiveDate ? formatDateBR(entry.effectiveDate) : '-'}
                                  </td>

                                  <td className="py-3 px-3 text-slate-700 dark:text-slate-300 max-w-xs">
                                    {entry.reason && (
                                      <div className="font-semibold text-slate-900 dark:text-white">
                                        {entry.reason}
                                      </div>
                                    )}
                                    {entry.notes && (
                                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {entry.notes}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316] text-center space-y-2">
                        <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                        <h5 className="font-bold text-slate-700 dark:text-slate-300">
                          Nenhuma alteração de status registrada
                        </h5>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Este contrato mantém seu status desde o cadastro inicial. Toda alteração futura entre Ativo, Inativo ou Cancelado será registrada automaticamente aqui com data, hora e usuário responsável.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Outros Logs de Auditoria do Sistema Vinculados a este Contrato */}
                  {editingContract && (
                    <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-[#26262b]">
                      <h4 className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-slate-500" />
                        <span>Eventos do Contrato na Trilha Geral de Auditoria</span>
                      </h4>

                      {storage.getContractAuditLogs(editingContract.id, editingContract.contractNumber).length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {storage.getContractAuditLogs(editingContract.id, editingContract.contractNumber).map(log => (
                            <div key={log.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b] flex items-start justify-between gap-3 text-xs">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 dark:text-white">{log.action}</span>
                                  <span className="text-[10px] text-slate-500 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 rounded font-medium">
                                    {log.userName} ({log.userRole})
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{log.details}</p>
                              </div>
                              <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                {formatDateBR(log.timestamp)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">Nenhum evento adicional registrado.</p>
                      )}
                    </div>
                  )}
                </div>
              ) : contractModalTab === 'SCHEDULE' ? (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
                  {/* Cards com Estatísticas do Contrato */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Total de Meses</span>
                      <div className="text-lg font-bold text-slate-900 dark:text-white mt-1 font-mono">
                        {editingContractTitles.length} parcelas
                      </div>
                      <span className="text-[10px] text-slate-500">Títulos registrados no sistema</span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Em Aberto / A Vencer</span>
                      <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1 font-mono">
                        {editingContractTitles.filter(t => t.settlementState !== 'LIQUIDADO').length} parcelas
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatBRL(editingContractTitles.filter(t => t.settlementState !== 'LIQUIDADO').reduce((acc, t) => acc + (t.balancePrincipal || 0), 0))}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Quitados / Recebidos</span>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                        {editingContractTitles.filter(t => t.settlementState === 'LIQUIDADO').length} parcelas
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatBRL(editingContractTitles.filter(t => t.settlementState === 'LIQUIDADO').reduce((acc, t) => acc + (t.settledPrincipal || 0), 0))}
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b]">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Volume Total Faturado</span>
                      <div className="text-lg font-bold text-amber-500 mt-1 font-mono">
                        {formatBRL(editingContractTitles.reduce((acc, t) => acc + (t.originalAmount || 0), 0))}
                      </div>
                      <span className="text-[10px] text-slate-500">Soma de todas as parcelas</span>
                    </div>
                  </div>

                  {/* Barra de Controles de Geração */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wide">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>Gerar Novas Faturas & Meses Futuros</span>
                        </h4>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          Projeta parcelas vinculadas deste contrato no Contas a Receber e Vendas.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1 bg-white dark:bg-[#131316] px-2.5 py-1 rounded-xl border border-slate-200 dark:border-[#26262b]">
                          <span className="text-[10px] font-bold text-slate-500">Início:</span>
                          <PremiumSelect
                            value={generationStartMode}
                            onChange={e => setGenerationStartMode(e.target.value as any)}
                            className="bg-transparent border-0 py-0.5 px-1 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-0 cursor-pointer"
                          >
                            <option value="CURRENT_MONTH">Mês Atual ({new Date().toISOString().substring(0, 7)})</option>
                            <option value="ENTRY_MONTH">Data de Entrada ({formData.startDate?.substring(0, 7) || new Date().toISOString().substring(0, 7)})</option>
                            <option value="CUSTOM">Personalizado...</option>
                          </PremiumSelect>
                        </div>

                        {generationStartMode === 'CUSTOM' && (
                          <MonthField
                            value={customStartCompetence}
                            onChange={e => setCustomStartCompetence(e.target.value)}
                            className="rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100"
                          />
                        )}

                        <PremiumSelect
                          value={formData.futureMonthsCount || 12}
                          onChange={e => setFormData({ ...formData, futureMonthsCount: Number(e.target.value) })}
                          className="rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100"
                        >
                          <option value={6}>6 meses</option>
                          <option value={12}>12 meses (1 ano)</option>
                          <option value={24}>24 meses (2 anos)</option>
                          <option value={36}>36 meses (3 anos)</option>
                        </PremiumSelect>

                        <button
                          type="button"
                          onClick={() => handleGenerateInsideContract()}
                          disabled={isGeneratingInsideContract}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 text-slate-950 font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{isGeneratingInsideContract ? 'Gerando...' : 'Gerar Meses'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGenerateInsideContract({ updateExistingOpen: true })}
                          disabled={isGeneratingInsideContract}
                          className="px-3 py-1.5 bg-white dark:bg-[#131316] hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          title="Sincroniza valores das parcelas em aberto"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                          <span>Sincronizar em Aberto</span>
                        </button>
                      </div>
                    </div>
                    {/* Live Progress Bar do Contrato */}
                    {insideContractProgress && (
                      <div className="p-3 bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/5 border border-amber-500/30 rounded-xl space-y-2 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <Sparkles className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                            <span className="truncate">{insideContractProgress.stage}</span>
                          </div>
                          <span className="font-mono text-amber-700 dark:text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded-md text-[11px] shrink-0">
                            {insideContractProgress.percent}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-700">
                          <div 
                            className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${insideContractProgress.percent}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span>Geração assíncrona fluida</span>
                          <span>{insideContractProgress.processed} de {insideContractProgress.total} meses</span>
                        </div>
                      </div>
                    )}

                    {insideContractFeedback && (
                      <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center justify-between animate-in fade-in">
                        <span>{insideContractFeedback}</span>
                        <button
                          type="button"
                          onClick={() => setInsideContractFeedback('')}
                          className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          OK
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tabela de Parcelas do Contrato */}
                  <div className="border border-slate-200 dark:border-[#26262b] rounded-xl overflow-hidden bg-white dark:bg-[#131316]">
                    <div className="p-3 bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wide">
                        Faturas Vinculadas ({editingContractTitles.length})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Mensalidade: <strong className="text-slate-900 dark:text-white font-mono">{formatBRL(formData.monthlyTotal || 0)}</strong> • Venc. Todo dia {formData.dueDay || 10} ({formData.dueRule === 'NEXT_MONTH' ? 'mês seguinte' : 'mesmo mês'})
                      </span>
                    </div>

                    {editingContractTitles.length === 0 ? (
                      <div className="p-8 text-center space-y-3">
                        <Calendar className="w-10 h-10 text-slate-400 mx-auto opacity-40" />
                        <p className="text-xs text-slate-500">
                          Nenhuma fatura foi gerada para este contrato ainda.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleGenerateInsideContract()}
                          disabled={isGeneratingInsideContract}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Gerar Faturas Agora</span>
                        </button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[360px]">
                        <table className="w-full text-left text-xs min-w-[700px]">
                          <thead className="bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] text-slate-500 font-semibold text-[11px] sticky top-0 z-10">
                            <tr>
                              <th className="py-2.5 px-3">Competência</th>
                              <th className="py-2.5 px-3">Nº Fatura</th>
                              <th className="py-2.5 px-3">Descrição</th>
                              <th className="py-2.5 px-3 text-center">Vencimento</th>
                              <th className="py-2.5 px-3 text-right">Valor</th>
                              <th className="py-2.5 px-3 text-center">Situação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-[#26262b]">
                            {editingContractTitles.map(t => {
                              const isSettled = t.settlementState === 'LIQUIDADO';
                              const isOverdue = !isSettled && t.dueDate < new Date().toISOString().split('T')[0];
                              return (
                                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                      {formatCompetence(t.competence)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                                    {t.titleNumber}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                                    {t.description}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                                    {formatDateBR(t.dueDate)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                                    {formatBRL(t.originalAmount)}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isSettled
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                                        : isOverdue
                                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30'
                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                                    }`}>
                                      {isSettled ? 'Quitado' : isOverdue ? 'Vencido' : 'Em Aberto'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
                
                {/* Bloco 1: Identificação e Cliente */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1b1b20]/60 border border-slate-200 dark:border-[#26262b] space-y-3">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                    1. Identificação & Contratante
                  </span>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Nº do Contrato *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: CTR-2026-001"
                        value={formData.contractNumber || ''}
                        onChange={e => setFormData({ ...formData, contractNumber: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                        <label className="block font-semibold text-slate-800 dark:text-slate-200">
                          Cliente Contratante *
                        </label>
                        <div className="flex items-center gap-1.5">
                          {formData.customerId && (
                            <button
                              type="button"
                              onClick={() => {
                                setClientModalCounterpartyId(formData.customerId || null);
                                setIsClientModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-lg transition-colors cursor-pointer"
                              title="Editar cadastro completo deste cliente sem fechar o contrato"
                            >
                              <Edit2 className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              <span>Editar Cadastro</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setClientModalCounterpartyId('NEW');
                              setIsClientModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
                            title="Cadastrar um novo cliente agora sem sair do contrato"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Novo Cliente</span>
                          </button>
                        </div>
                      </div>
                      <SearchableSelect
                        required
                        options={counterparties.map(c => ({
                          value: c.id,
                          label: c.name,
                          sublabel: c.document ? `Doc: ${c.document}` : undefined
                        }))}
                        value={formData.customerId || ''}
                        onChange={val => setFormData({ ...formData, customerId: val })}
                        placeholder="Pesquise o cliente..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                      Objeto do Contrato / Descrição dos Honorários *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Assessoria Contábil, Fiscal e Gestão Financeira"
                      value={formData.description || ''}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Bloco 2: Vigência & Prazos */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1b1b20]/60 border border-slate-200 dark:border-[#26262b] space-y-3">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                    2. Vigência & Prazos de Vencimento
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Data de Início do Contrato *
                      </label>
                      <DateField
                        required
                        value={formData.startDate || ''}
                        onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Início da vigência contratual</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Dia do Vencimento Mensal *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        required
                        onWheel={(e) => (e.target as HTMLElement).blur()}
                        value={formData.dueDay || 10}
                        onChange={e => setFormData({ ...formData, dueDay: parseInt(e.target.value) || 10 })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Dia fixo (Ex: 10, 15, 20)</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Regra da Competência
                      </label>
                      <PremiumSelect
                        value={formData.dueRule || 'NEXT_MONTH'}
                        onChange={e => setFormData({ ...formData, dueRule: e.target.value as any })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      >
                        <option value="NEXT_MONTH">Mês Seguinte (D+1)</option>
                        <option value="SAME_MONTH">Mesmo Mês (D+0)</option>
                      </PremiumSelect>
                      <span className="text-[10px] text-slate-500 mt-1 block">Ex: fatura Jan vence em Fev</span>
                    </div>
                  </div>
                </div>

                {/* Bloco 3: Valores Financeiros & Faturamento */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1b1b20]/60 border border-slate-200 dark:border-[#26262b] space-y-3">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                    3. Honorários Mensais & Cobrança
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Valor Mensal Atual (R$) *
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          value={formData.monthlyTotal || ''}
                          onChange={e => setFormData({ ...formData, monthlyTotal: parseFloat(e.target.value) || 0 })}
                          className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] pl-9 pr-3.5 py-2 text-xs font-bold text-slate-900 dark:text-amber-400 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 mt-1 block">Honorário mensal recorrente</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Forma de Cobrança
                      </label>
                      <PremiumSelect
                        value={formData.billingMethod || 'BOLETO'}
                        onChange={e => setFormData({ ...formData, billingMethod: e.target.value as any })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      >
                        <option value="BOLETO">Boleto Bancário</option>
                        <option value="PIX">PIX Cobrança</option>
                        <option value="TRANSFERENCIA">Transferência / TED</option>
                        <option value="OUTRO">Outro Meio</option>
                      </PremiumSelect>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Status do Contrato
                      </label>
                      <PremiumSelect
                        value={formData.status || 'ATIVO'}
                        onChange={e => {
                          const newStatus = e.target.value as any;
                          setFormData({ 
                            ...formData, 
                            status: newStatus,
                            cancellationDate: (newStatus === 'CANCELADO' || newStatus === 'INATIVO') ? (formData.cancellationDate || new Date().toISOString().split('T')[0]) : formData.cancellationDate,
                            cancellationReason: (newStatus === 'CANCELADO' || newStatus === 'INATIVO') ? (formData.cancellationReason || 'Rescisão solicitada pelo cliente') : formData.cancellationReason
                          });
                        }}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      >
                        <option value="ATIVO">🟢 ATIVO (Gera Faturamento & compõe MRR)</option>
                        <option value="CANCELADO">🔴 CANCELADO (Rescindido / Fora do MRR)</option>
                        <option value="INATIVO">🟡 INATIVO (Pausado / Fora do MRR)</option>
                        <option value="SUSPENSO">🟣 SUSPENSO (Temporário)</option>
                        <option value="ENCERRADO">⚪ ENCERRADO (Vigência Concluída)</option>
                      </PremiumSelect>
                    </div>
                  </div>

                  {/* Campos específicos quando o Contrato está Cancelado ou Inativo */}
                  {(formData.status === 'CANCELADO' || formData.status === 'INATIVO') && (
                    <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-900/50 space-y-3 mt-3 animate-in fade-in">
                      <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-xs">
                        <Ban className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>Controle de Encerramento / Inativação de Contrato</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            A partir de qual data o cliente parou? *
                          </label>
                          <DateField
                            value={formData.cancellationDate || ''}
                            onChange={e => setFormData({ ...formData, cancellationDate: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Motivo do Cancelamento / Inativação
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: Rescisão a pedido do cliente, troca de contador..."
                            value={formData.cancellationReason || ''}
                            onChange={e => setFormData({ ...formData, cancellationReason: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Observações e Detalhes da Rescisão
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Acordo amigável, entrega de livros fiscais..."
                          value={formData.cancellationNotes || ''}
                          onChange={e => setFormData({ ...formData, cancellationNotes: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bloco 4: Tipo de Contrato & Faturamento Automático dos Próximos Meses */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 space-y-4">
                  <div>
                    <span className="text-[11px] font-bold text-amber-900 dark:text-amber-400 uppercase tracking-wider block flex items-center gap-1.5">
                      <CalendarClock className="w-4 h-4 text-amber-500" />
                      4. Tipo de Contrato & Faturamento Automático dos Próximos Meses
                    </span>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Defina se o contrato é recorrente ou avulso e se deseja agendar imediatamente os títulos a receber de todos os meses futuros.
                    </p>
                  </div>

                  {/* Seletor Recorrente vs Avulso */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label 
                      className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                        formData.contractType !== 'AVULSO' && formData.isRecurring !== false
                          ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                          : 'border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316] hover:border-amber-500/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="contractType"
                        checked={formData.contractType !== 'AVULSO' && formData.isRecurring !== false}
                        onChange={() => setFormData({ 
                          ...formData, 
                          contractType: 'RECORRENTE', 
                          isRecurring: true,
                          autoGenerateFutureMonths: true 
                        })}
                        className="mt-1 text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>Contrato Recorrente</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500 text-slate-950">
                            Recomendado
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          Honorário contábil contínuo. Permite projeção de MRR e faturamento automático dos próximos meses.
                        </p>
                      </div>
                    </label>

                    <label 
                      className={`p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                        formData.contractType === 'AVULSO' || formData.isRecurring === false
                          ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                          : 'border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316] hover:border-amber-500/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="contractType"
                        checked={formData.contractType === 'AVULSO' || formData.isRecurring === false}
                        onChange={() => setFormData({ 
                          ...formData, 
                          contractType: 'AVULSO', 
                          isRecurring: false,
                          autoGenerateFutureMonths: false 
                        })}
                        className="mt-1 text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-white">
                          Contrato Avulso / Pontual
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                          Serviço esporádico ou pontual, sem geração de parcelas recorrentes contínuas.
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Configuração de Geração de Meses Futuros (Apenas quando Recorrente) */}
                  {formData.contractType !== 'AVULSO' && formData.isRecurring !== false && (
                    <div className="p-3.5 bg-white dark:bg-[#131316] rounded-xl border border-amber-500/30 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.autoGenerateFutureMonths !== false}
                            onChange={e => setFormData({ ...formData, autoGenerateFutureMonths: e.target.checked })}
                            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 border-slate-300 dark:border-slate-700"
                          />
                          <span className="font-bold text-xs text-slate-900 dark:text-white">
                            ⚡ Gerar faturamento automático de todos os próximos meses agora
                          </span>
                        </label>

                        {formData.autoGenerateFutureMonths !== false && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                              Projetar para:
                            </span>
                            <PremiumSelect
                              value={formData.futureMonthsCount || 12}
                              onChange={e => setFormData({ ...formData, futureMonthsCount: Number(e.target.value) })}
                              className="rounded-lg border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-amber-400 focus:ring-2 focus:ring-amber-500"
                            >
                              <option value={6}>Próximos 6 meses</option>
                              <option value={12}>Próximos 12 meses (1 ano)</option>
                              <option value={24}>Próximos 24 meses (2 anos)</option>
                              <option value={36}>Próximos 36 meses (3 anos)</option>
                            </PremiumSelect>
                          </div>
                        )}
                      </div>

                      {/* Seletor explícito de mês inicial (atendendo à solicitação de faturar a partir de agora vs entrada) */}
                      {formData.autoGenerateFutureMonths !== false && (
                        <div className="p-3 bg-slate-50 dark:bg-[#1b1b20] rounded-lg border border-slate-200 dark:border-[#26262b] space-y-2">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5 text-amber-500" />
                            A partir de qual mês você deseja iniciar a geração das faturas?
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <label className={`p-2 rounded-lg border flex items-center gap-2 cursor-pointer text-xs transition-colors ${
                              generationStartMode === 'CURRENT_MONTH'
                                ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-900 dark:text-amber-300'
                                : 'border-slate-200 dark:border-[#26262b] text-slate-700 dark:text-slate-400 hover:border-amber-500/40'
                            }`}>
                              <input
                                type="radio"
                                name="generationStartMode"
                                checked={generationStartMode === 'CURRENT_MONTH'}
                                onChange={() => setGenerationStartMode('CURRENT_MONTH')}
                                className="text-amber-500 focus:ring-amber-500"
                              />
                              <div>
                                <div className="text-xs">Mês Atual ({new Date().toISOString().substring(0, 7)})</div>
                                <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">Recomendado (a partir de agora)</div>
                              </div>
                            </label>

                            <label className={`p-2 rounded-lg border flex items-center gap-2 cursor-pointer text-xs transition-colors ${
                              generationStartMode === 'ENTRY_MONTH'
                                ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-900 dark:text-amber-300'
                                : 'border-slate-200 dark:border-[#26262b] text-slate-700 dark:text-slate-400 hover:border-amber-500/40'
                            }`}>
                              <input
                                type="radio"
                                name="generationStartMode"
                                checked={generationStartMode === 'ENTRY_MONTH'}
                                onChange={() => setGenerationStartMode('ENTRY_MONTH')}
                                className="text-amber-500 focus:ring-amber-500"
                              />
                              <div>
                                <div className="text-xs">Data de Entrada ({formData.startDate?.substring(0, 7) || new Date().toISOString().substring(0, 7)})</div>
                                <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400">Desde o início do contrato</div>
                              </div>
                            </label>

                            <label className={`p-2 rounded-lg border flex items-center gap-2 cursor-pointer text-xs transition-colors ${
                              generationStartMode === 'CUSTOM'
                                ? 'border-amber-500 bg-amber-500/10 font-bold text-amber-900 dark:text-amber-300'
                                : 'border-slate-200 dark:border-[#26262b] text-slate-700 dark:text-slate-400 hover:border-amber-500/40'
                            }`}>
                              <input
                                type="radio"
                                name="generationStartMode"
                                checked={generationStartMode === 'CUSTOM'}
                                onChange={() => setGenerationStartMode('CUSTOM')}
                                className="text-amber-500 focus:ring-amber-500"
                              />
                              <div className="flex-1">
                                <div className="text-xs">Personalizado:</div>
                                <MonthField
                                  value={customStartCompetence}
                                  onChange={e => {
                                    setCustomStartCompetence(e.target.value);
                                    setGenerationStartMode('CUSTOM');
                                  }}
                                  className="w-full mt-1 px-2 py-0.5 text-[11px] rounded border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316]"
                                />
                              </div>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Card de Simulação Dinâmica */}
                      {previewSchedule && (
                        <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-amber-500" />
                              Previsão do Faturamento Automático Programado:
                            </span>
                            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                              {formatBRL(previewSchedule.totalAmount)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 pt-1 border-t border-amber-500/20">
                            <span>✓ Títulos integrados ao Fluxo de Caixa</span>
                            <span>•</span>
                            <span>✓ Sem duplicidade</span>
                            <span>•</span>
                            <span>✓ Gerenciável a qualquer momento</span>
                          </div>
                        </div>
                      )}

                      {/* Botões de Ação Imediata de Geração e Link para Cronograma */}
                      <div className="pt-2.5 border-t border-amber-500/20 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleGenerateInsideContract()}
                            disabled={isGeneratingInsideContract}
                            className="px-3.5 py-2 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 text-slate-950 font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Gera imediatamente as faturas programadas para este contrato sem precisar fechar o modal"
                          >
                            <Sparkles className="w-3.5 h-3.5 fill-current" />
                            <span>{isGeneratingInsideContract ? 'Gerando Faturas...' : '⚡ Gerar Faturas Deste Contrato Agora'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGenerateInsideContract({ updateExistingOpen: true })}
                            disabled={isGeneratingInsideContract}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="Sincroniza os valores e vencimentos das parcelas em aberto existentes"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                            <span>Sincronizar em Aberto</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setContractModalTab('SCHEDULE')}
                          className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>Ver Faturas Geradas ({editingContractTitles.length}) ➔</span>
                        </button>
                      </div>

                      {/* Live Progress Bar do Contrato */}
                      {insideContractProgress && (
                        <div className="p-2.5 bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-amber-500/5 border border-amber-500/30 rounded-xl space-y-2 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                              <Sparkles className="w-4 h-4 animate-spin text-amber-500 shrink-0" />
                              <span className="truncate">{insideContractProgress.stage}</span>
                            </div>
                            <span className="font-mono text-amber-700 dark:text-amber-300 font-bold bg-amber-500/20 px-2 py-0.5 rounded-md text-[11px] shrink-0">
                              {insideContractProgress.percent}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-700">
                            <div 
                              className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${insideContractProgress.percent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {insideContractFeedback && (
                        <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs font-semibold text-amber-900 dark:text-amber-200 animate-in fade-in flex items-center justify-between">
                          <span>{insideContractFeedback}</span>
                          <button
                            type="button"
                            onClick={() => setInsideContractFeedback('')}
                            className="text-[10px] text-amber-700 dark:text-amber-400 hover:underline ml-2 cursor-pointer"
                          >
                            OK
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bloco 5: Entrada do Cliente & Origem da Aquisição */}
                <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <span className="text-[11px] font-bold text-amber-900 dark:text-amber-400 uppercase tracking-wider block flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-amber-500" />
                    5. Data de Entrada & Canal de Aquisição do Cliente
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Data de Entrada do Cliente *
                      </label>
                      <DateField
                        required
                        value={formData.entryDate || formData.startDate || ''}
                        onChange={e => setFormData({ ...formData, entryDate: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Início do relacionamento com o escritório</span>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Canal / Origem da Aquisição *
                      </label>
                      <PremiumSelect
                        value={formData.acquisitionChannel || 'INDICACAO'}
                        onChange={e => setFormData({ ...formData, acquisitionChannel: e.target.value as AcquisitionChannel })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      >
                        <option value="INDICACAO">🤝 Indicação (Cliente, Parceiro ou Amigo)</option>
                        <option value="REDE_SOCIAL">📱 Rede Social (Instagram, LinkedIn, etc.)</option>
                        <option value="MECANISMO_PESQUISA">🔍 Mecanismo de Pesquisa (Google, Bing, SEO)</option>
                        <option value="PROSPECCAO_ATIVA">🎯 Prospecção Ativa (Outbound / Comercial)</option>
                        <option value="EVENTO">🎤 Evento / Palestra / Feira</option>
                        <option value="OUTRO">Outros Canais</option>
                      </PremiumSelect>
                      <span className="text-[10px] text-slate-500 mt-1 block">Rastreamento de onde veio o cliente</span>
                    </div>
                  </div>

                  {formData.acquisitionChannel === 'INDICACAO' && (
                    <div className="pt-2 border-t border-amber-500/20">
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Quem Indicou este Cliente? *
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Dr. Roberto Martins (Cliente há 3 anos), ou Parceiro Imobiliário"
                        value={formData.acquisitionReferrerName || ''}
                        onChange={e => setFormData({ ...formData, acquisitionReferrerName: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                      <span className="text-[10px] text-slate-500 mt-1 block">Nome da pessoa ou empresa que realizou a indicação</span>
                    </div>
                  )}

                  {formData.acquisitionChannel === 'REDE_SOCIAL' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-amber-500/20 items-start">
                      <div>
                        <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Qual Rede Social? *
                        </label>
                        <PremiumSelect
                          value={formData.acquisitionSocialNetwork || 'Instagram'}
                          onChange={e => setFormData({ ...formData, acquisitionSocialNetwork: e.target.value as SocialNetworkType })}
                          className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="LinkedIn">LinkedIn</option>
                          <option value="Facebook">Facebook</option>
                          <option value="YouTube">YouTube</option>
                          <option value="TikTok">TikTok</option>
                          <option value="Outro">Outra Rede Social</option>
                        </PremiumSelect>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                          Campanha / Detalhes do Perfil
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Anúncio de BPO Financeiro no Feed ou Contato via DM"
                          value={formData.acquisitionNotes || ''}
                          onChange={e => setFormData({ ...formData, acquisitionNotes: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}

                  {(formData.acquisitionChannel === 'MECANISMO_PESQUISA' || formData.acquisitionChannel === 'PROSPECCAO_ATIVA' || formData.acquisitionChannel === 'EVENTO' || formData.acquisitionChannel === 'OUTRO') && (
                    <div className="pt-2 border-t border-amber-500/20">
                      <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                        Detalhes da Aquisição / Campanha
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Busca orgânica Google 'contabilidade em SP', Google Ads, Feira do Empreendedor, etc."
                        value={formData.acquisitionNotes || ''}
                        onChange={e => setFormData({ ...formData, acquisitionNotes: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>

                {/* Bloco 5: Histórico & Registro de Reajustes de Valor */}
                <div className="p-4 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-amber-500 uppercase tracking-wider block flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                        5. Histórico & Registro de Reajustes de Valor
                      </span>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        Registre alterações de honorários contratuais (anuais, inflação ou escopo) com rastreabilidade completa.
                      </p>
                    </div>

                    {!showAdjustmentForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewAdjustmentData({
                            date: new Date().toISOString().split('T')[0],
                            newAmount: formData.monthlyTotal || 2500,
                            reason: 'REAJUSTE_ANUAL',
                            notes: ''
                          });
                          setShowAdjustmentForm(true);
                        }}
                        className="h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-xs transition-colors shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        + Novo Reajuste
                      </button>
                    )}
                  </div>

                  {/* Formulário em Linha para Registrar Novo Reajuste */}
                  {showAdjustmentForm && (
                    <div className="p-3.5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-sm space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                        <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                          <History className="w-4 h-4 text-amber-500" />
                          Lançar Novo Reajuste de Valor
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAdjustmentForm(false)}
                          className="text-slate-400 hover:text-slate-600 text-xs"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Novo Valor Mensal (R$) *
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={newAdjustmentData.newAmount || ''}
                              onChange={(e) => setNewAdjustmentData({ ...newAdjustmentData, newAmount: parseFloat(e.target.value) || 0 })}
                              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] pl-8 pr-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white"
                            />
                          </div>

                          {/* Atalhos rápidos de percentual */}
                          <div className="flex items-center gap-1 mt-1.5">
                            {[5, 8, 10, 12, 15].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => {
                                  const base = formData.monthlyTotal || 0;
                                  const calculated = Math.round(base * (1 + pct / 100) * 100) / 100;
                                  setNewAdjustmentData({ ...newAdjustmentData, newAmount: calculated });
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 font-medium"
                              >
                                +{pct}%
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Data de Vigência *
                          </label>
                          <DateField
                            value={newAdjustmentData.date}
                            onChange={(e) => setNewAdjustmentData({ ...newAdjustmentData, date: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                          />
                          <span className="text-[10px] text-slate-500 mt-1 block">Quando passa a valer o novo valor</span>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Motivo do Reajuste *
                          </label>
                          <PremiumSelect
                            value={newAdjustmentData.reason}
                            onChange={(e) => setNewAdjustmentData({ ...newAdjustmentData, reason: e.target.value as ContractAdjustmentReason })}
                            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] px-2.5 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                          >
                            <option value="REAJUSTE_ANUAL">📅 Reajuste Anual de Honorários</option>
                            <option value="IPCA">📈 IPCA (Índice de Preços ao Consumidor)</option>
                            <option value="IGPM">📊 IGP-M (Índice Geral de Preços)</option>
                            <option value="ACORDO_MUTUO">🤝 Acordo Mútuo / Negociação</option>
                            <option value="AUMENTO_ESCOPO">🚀 Aumento de Escopo / Funcionários</option>
                            <option value="OUTRO">Outro Motivo</option>
                          </PremiumSelect>
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Observações / Justificativa
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: Cláusula 5ª do contrato de prestação de serviços - reajuste anual pelo IPCA acumulado de 12 meses."
                          value={newAdjustmentData.notes}
                          onChange={(e) => setNewAdjustmentData({ ...newAdjustmentData, notes: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                      </div>

                      {/* Resumo da Variação e Botões */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="text-xs">
                          <span className="text-slate-500">Valor Atual: </span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{formatBRL(formData.monthlyTotal || 0)}</span>
                          <span className="mx-2 text-slate-400">➔</span>
                          <span className="text-slate-500">Novo Valor: </span>
                          <span className="font-bold text-amber-500 font-mono">{formatBRL(newAdjustmentData.newAmount)}</span>
                          {formData.monthlyTotal && formData.monthlyTotal > 0 ? (
                            <span className={`ml-2 text-[11px] font-bold px-1.5 py-0.5 rounded ${
                              newAdjustmentData.newAmount >= formData.monthlyTotal 
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' 
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            }`}>
                              {newAdjustmentData.newAmount >= formData.monthlyTotal ? '+' : ''}
                              {(((newAdjustmentData.newAmount - formData.monthlyTotal) / formData.monthlyTotal) * 100).toFixed(2)}%
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowAdjustmentForm(false)}
                            className="px-3 py-1 text-xs rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleApplyAdjustment}
                            className="px-3.5 py-1 text-xs font-bold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-xs transition-colors cursor-pointer"
                          >
                            Gravar Reajuste
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tabela do Histórico de Reajustes Já Realizados */}
                  <div className="space-y-2">
                    {formData.adjustments && formData.adjustments.length > 0 ? (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 dark:bg-[#1b1b20] text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-[#26262b]">
                            <tr>
                              <th className="py-2 px-3">Vigência</th>
                              <th className="py-2 px-3">De ➔ Para</th>
                              <th className="py-2 px-3 text-center">Variação</th>
                              <th className="py-2 px-3">Motivo</th>
                              <th className="py-2 px-3">Observações</th>
                              <th className="py-2 px-3 text-right">Notificação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-[#26262b]">
                            {formData.adjustments.map((adj) => (
                              <tr key={adj.id} className="hover:bg-slate-50 dark:hover:bg-[#1b1b20]/40">
                                <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {formatDateBR(adj.date)}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                  <span className="line-through text-slate-400">{formatBRL(adj.previousAmount)}</span>
                                  <span className="mx-1 text-slate-400">➔</span>
                                  <span className="font-bold text-slate-900 dark:text-white">{formatBRL(adj.newAmount)}</span>
                                </td>
                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    adj.percentage >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                  }`}>
                                    {adj.percentage >= 0 ? `+${adj.percentage}%` : `${adj.percentage}%`}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                  {adj.reason === 'REAJUSTE_ANUAL' && 'Reajuste Anual'}
                                  {adj.reason === 'IPCA' && 'IPCA'}
                                  {adj.reason === 'IGPM' && 'IGP-M'}
                                  {adj.reason === 'ACORDO_MUTUO' && 'Acordo Mútuo'}
                                  {adj.reason === 'AUMENTO_ESCOPO' && 'Aumento de Escopo'}
                                  {adj.reason === 'OUTRO' && 'Outro'}
                                </td>
                                <td className="py-2 px-3 text-slate-500 truncate max-w-xs" title={adj.notes || ''}>
                                  {adj.notes || '-'}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setNotifyAdjustmentModal({ isOpen: true, adjustment: adj })}
                                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] transition-colors cursor-pointer border border-emerald-500/20"
                                    title="Notificar cliente sobre este reajuste (WhatsApp / E-mail)"
                                  >
                                    <Send className="w-3 h-3" />
                                    <span>Notificar</span>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-3 bg-white dark:bg-[#131316] rounded-lg border border-slate-200 dark:border-[#26262b] text-slate-500 text-center">
                        Nenhum reajuste registrado até o momento. O contrato está com o valor inicial acordado.
                      </div>
                    )}
                  </div>
                </div>

                {/* Bloco 6: Taxa de Balanço Anual (13º Honorário Contábil) */}
                <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-amber-900 dark:text-amber-400 uppercase tracking-wider block flex items-center gap-1.5">
                        <Scale className="w-3.5 h-3.5 text-amber-500" />
                        6. Taxa de Balanço Anual (Fechamento / 13º Honorário Contábil)
                      </span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                        Cobrança anual complementar referente ao encerramento do balanço patrimonial e demonstrações contábeis.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input 
                        type="checkbox" 
                        checked={formData.annualBalanceFee?.enabled || false}
                        onChange={(e) => {
                          const isEnabled = e.target.checked;
                          setFormData({
                            ...formData,
                            annualBalanceFee: {
                              ...(formData.annualBalanceFee || {
                                amount: formData.monthlyTotal || 2500,
                                installmentType: 'UNICA_DEZEMBRO',
                                billingMonths: [12],
                                dueDay: formData.dueDay || 10
                              }),
                              enabled: isEnabled
                            }
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                      <span className="ml-2 font-bold text-xs text-slate-800 dark:text-slate-200">
                        {formData.annualBalanceFee?.enabled ? 'Ativada' : 'Desativada'}
                      </span>
                    </label>
                  </div>

                  {formData.annualBalanceFee?.enabled && (
                    <div className="space-y-4 pt-2 border-t border-amber-500/20 animate-in fade-in">
                      
                      {/* Linha 1: Valor, Forma de Cobrança e Escolha da Competência */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                        <div>
                          <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-xs">
                            Valor Total da Taxa de Balanço (R$) *
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              required={formData.annualBalanceFee?.enabled}
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              value={formData.annualBalanceFee.amount || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                annualBalanceFee: {
                                  ...formData.annualBalanceFee!,
                                  amount: parseFloat(e.target.value) || 0
                                }
                              })}
                              className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] pl-9 pr-3.5 py-2 text-xs font-bold text-slate-900 dark:text-amber-400 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (formData.monthlyTotal) {
                                setFormData({
                                  ...formData,
                                  annualBalanceFee: {
                                    ...formData.annualBalanceFee!,
                                    amount: formData.monthlyTotal
                                  }
                                });
                              }
                            }}
                            className="text-[10px] text-amber-700 dark:text-amber-300 hover:underline mt-1 font-semibold block"
                          >
                            Usar valor igual à mensalidade ({formatBRL(formData.monthlyTotal || 0)})
                          </button>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-xs">
                            Forma de Cobrança / Parcelamento *
                          </label>
                          <PremiumSelect
                            value={formData.annualBalanceFee.installmentType || 'UNICA_DEZEMBRO'}
                            onChange={(e) => handleBalanceFeeTypeChange(e.target.value as any)}
                            className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                          >
                            <option value="UNICA_DEZEMBRO">1x Parcela Única</option>
                            <option value="DUAS_PARCELAS">2x Dividido em 2 Meses (Nov e Dez)</option>
                            <option value="TRES_PARCELAS">3x Dividido em 3 Meses (Out, Nov e Dez)</option>
                            <option value="PERSONALIZADO">Personalizado (Escolher Meses)</option>
                          </PremiumSelect>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            {formData.annualBalanceFee.installmentType === 'UNICA_DEZEMBRO' 
                              ? 'Cobrança em cota única anual' 
                              : 'Cobrança parcelada em múltiplos meses'}
                          </span>
                        </div>

                        {formData.annualBalanceFee.installmentType === 'UNICA_DEZEMBRO' ? (
                          <div>
                            <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-xs flex items-center justify-between">
                              <span>Mês da Competência *</span>
                              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">Mês de referência</span>
                            </label>
                            <PremiumSelect
                              value={formData.annualBalanceFee.competenceMonth || (formData.annualBalanceFee.billingMonths?.[0] || 12)}
                              onChange={(e) => handleSingleCompetenceMonthChange(parseInt(e.target.value, 10))}
                              className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                            >
                              {MONTH_NAMES.map((name, idx) => (
                                <option key={idx + 1} value={idx + 1}>
                                  {String(idx + 1).padStart(2, '0')} - {name} {idx + 1 === 12 ? ' (Encerramento do Exercício)' : ''}
                                </option>
                              ))}
                            </PremiumSelect>
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              Define em qual mês contábil a taxa será alocada
                            </span>
                          </div>
                        ) : (
                          <div>
                            <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-xs">
                              Competências Selecionadas
                            </label>
                            <div className="px-3 py-2 bg-slate-50 dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-lg text-xs font-bold text-amber-700 dark:text-amber-300 truncate">
                              {formData.annualBalanceFee.billingMonths && formData.annualBalanceFee.billingMonths.length > 0
                                ? formData.annualBalanceFee.billingMonths.map(m => MONTH_NAMES[m - 1]).join(', ')
                                : 'Nenhuma selecionada'}
                            </div>
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              {formData.annualBalanceFee.billingMonths?.length || 0} competência(s) de faturamento
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Seleção Personalizada de Meses (se PERSONALIZADO) */}
                      {formData.annualBalanceFee.installmentType === 'PERSONALIZADO' && (
                        <div className="p-3 bg-white dark:bg-[#131316] rounded-xl border border-amber-500/30 space-y-2">
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                            Selecione os meses de competência em que a Taxa de Balanço será cobrada:
                          </span>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                            {MONTH_NAMES.map((name, index) => {
                              const monthNum = index + 1;
                              const isSelected = formData.annualBalanceFee?.billingMonths?.includes(monthNum);
                              return (
                                <button
                                  key={monthNum}
                                  type="button"
                                  onClick={() => toggleCustomBalanceMonth(monthNum)}
                                  className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all ${
                                    isSelected 
                                      ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs' 
                                      : 'bg-slate-50 dark:bg-[#1b1b20] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#26262b] hover:border-amber-500/50'
                                  }`}
                                >
                                  {name.slice(0, 3)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Linha 2: Regra de Vencimento e Data de Vencimento */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start p-3 bg-amber-500/5 dark:bg-amber-500/10 rounded-xl border border-amber-500/20">
                        <div>
                          <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-xs flex items-center gap-1.5">
                            <CalendarClock className="w-3.5 h-3.5 text-amber-500" />
                            <span>Regra de Vencimento da Taxa *</span>
                          </label>
                          <PremiumSelect
                            value={formData.annualBalanceFee.dueRule || 'SAME_MONTH'}
                            onChange={(e) => setFormData({
                              ...formData,
                              annualBalanceFee: {
                                ...formData.annualBalanceFee!,
                                dueRule: e.target.value as any
                              }
                            })}
                            className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                          >
                            <option value="SAME_MONTH">✓ Vencimento na própria competência (mesmo mês) [Padrão]</option>
                            <option value="NEXT_MONTH">Vencimento no mês seguinte à competência</option>
                            <option value="SPECIFIC_DATE">Data de Vencimento Específica (Data Fixa)</option>
                          </PremiumSelect>
                          <span className="text-[10px] text-slate-500 mt-1 block">
                            {formData.annualBalanceFee.dueRule === 'NEXT_MONTH'
                              ? 'O título vencerá no mês subsequente à competência faturada'
                              : formData.annualBalanceFee.dueRule === 'SPECIFIC_DATE'
                              ? 'O título terá uma data exata de vencimento fixada no calendário'
                              : 'O título vencerá dentro do próprio mês da competência (ex.: competência Dezembro vence em Dezembro)'}
                          </span>
                        </div>

                        {formData.annualBalanceFee.dueRule === 'SPECIFIC_DATE' ? (
                          <div>
                            <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-xs">
                              Data Exata de Vencimento *
                            </label>
                            <DateField
                              required={formData.annualBalanceFee?.dueRule === 'SPECIFIC_DATE'}
                              value={formData.annualBalanceFee.specificDueDate || ''}
                              onChange={(e) => setFormData({
                                ...formData,
                                annualBalanceFee: {
                                  ...formData.annualBalanceFee!,
                                  specificDueDate: e.target.value
                                }
                              })}
                              className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                            />
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              Data definitiva de vencimento nos lançamentos a receber
                            </span>
                          </div>
                        ) : (
                          <div>
                            <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5 text-xs">
                              Dia do Vencimento da Taxa *
                            </label>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              value={formData.annualBalanceFee.dueDay || formData.dueDay || 10}
                              onChange={(e) => setFormData({
                                ...formData,
                                annualBalanceFee: {
                                  ...formData.annualBalanceFee!,
                                  dueDay: parseInt(e.target.value) || 10
                                }
                              })}
                              className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                            />
                            <span className="text-[10px] text-slate-500 mt-1 block">
                              {formData.annualBalanceFee.dueRule === 'NEXT_MONTH'
                                ? `Vencerá dia ${formData.annualBalanceFee.dueDay || formData.dueDay || 10} do mês seguinte`
                                : `Vencerá dia ${formData.annualBalanceFee.dueDay || formData.dueDay || 10} da própria competência`}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Caixa de Simulação Dinâmica da Cobrança */}
                      <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 text-amber-950 dark:text-amber-300 font-bold text-xs">
                          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                          <span>Previsão de Lançamentos da Taxa de Balanço:</span>
                        </div>

                        {formData.annualBalanceFee.billingMonths && formData.annualBalanceFee.billingMonths.length > 0 ? (
                          <div className="space-y-2 pt-1">
                            <p className="text-xs text-slate-700 dark:text-slate-300">
                              Valor total de <strong>{formatBRL(formData.annualBalanceFee.amount || 0)}</strong> distribuído em{' '}
                              <strong>{formData.annualBalanceFee.billingMonths.length} parcela(s)</strong>:
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                              {formData.annualBalanceFee.billingMonths.map((m, idx) => {
                                const currentYear = new Date().getFullYear();
                                const compStr = `${currentYear}-${String(m).padStart(2, '0')}`;
                                const feeDueDate = calculateBalanceFeeDueDate(
                                  formData.annualBalanceFee,
                                  formData.dueDay || 10,
                                  (formData.dueRule as any) || 'SAME_MONTH',
                                  compStr
                                );
                                const totalInst = formData.annualBalanceFee!.billingMonths.length;
                                const baseAmount = Math.round(((formData.annualBalanceFee!.amount || 0) / totalInst) * 100) / 100;
                                const instAmount = (idx + 1 === totalInst)
                                  ? Math.round(((formData.annualBalanceFee!.amount || 0) - baseAmount * (totalInst - 1)) * 100) / 100
                                  : baseAmount;

                                const isSameMonth = feeDueDate.startsWith(compStr);

                                return (
                                  <div 
                                    key={m}
                                    className="p-2.5 rounded-lg bg-white dark:bg-[#131316] border border-amber-500/30 text-[11px] space-y-1"
                                  >
                                    <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                                      <span>Parcela {idx + 1}/{totalInst}</span>
                                      <span className="text-amber-600 dark:text-amber-400 font-mono">{formatBRL(instAmount)}</span>
                                    </div>
                                    <div className="text-slate-600 dark:text-slate-400">
                                      Competência: <strong className="text-slate-900 dark:text-slate-100">{MONTH_NAMES[m - 1]}/{currentYear}</strong>
                                    </div>
                                    <div className="text-slate-600 dark:text-slate-400 flex items-center justify-between gap-1">
                                      <span>Vencimento: <strong className="text-slate-900 dark:text-slate-100">{formatDateBR(feeDueDate)}</strong></span>
                                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                                        formData.annualBalanceFee?.dueRule === 'SPECIFIC_DATE'
                                          ? 'bg-purple-500/15 text-purple-700 dark:text-purple-300'
                                          : isSameMonth 
                                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' 
                                          : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                      }`}>
                                        {formData.annualBalanceFee?.dueRule === 'SPECIFIC_DATE'
                                          ? 'Data Fixa'
                                          : isSameMonth 
                                          ? 'Na competência' 
                                          : 'Mês seguinte'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-rose-600 dark:text-rose-400">
                            Nenhum mês de faturamento selecionado para a Taxa de Balanço.
                          </p>
                        )}

                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block pt-1">
                          ℹ️ Ao gerar o faturamento destas competências, os títulos a receber serão criados com a competência e data de vencimento configuradas acima.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                </div>
              )}

              {/* Rodapé Fixo de Ações com Botões Adequados à Aba Ativa */}
              <div className="px-6 py-3.5 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex items-center justify-between gap-3 shrink-0 sticky bottom-0 z-20">
                {contractModalTab === 'AUDIT_LOG' ? (
                  <>
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                      Trilha de auditoria e conformidade contábil com histórico auditado de mudanças de status.
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => setContractModalTab('FORM')}
                        className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                      >
                        Voltar para Dados do Contrato
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-5 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 rounded-xl shadow-md transition-all cursor-pointer"
                      >
                        Fechar
                      </button>
                    </div>
                  </>
                ) : contractModalTab === 'SCHEDULE' ? (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setContractModalTab('FORM')}
                        className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                      >
                        Voltar para Dados do Contrato
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateInsideContract()}
                        disabled={isGeneratingInsideContract}
                        className="px-4 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 fill-current" />
                        <span>{isGeneratingInsideContract ? 'Gerando...' : 'Gerar Faturas Agora'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                      >
                        Fechar
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setContractModalTab('SCHEDULE')}
                        className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        <span>Ver Cronograma & Faturas ({editingContractTitles.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setContractModalTab('AUDIT_LOG')}
                        className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer hidden sm:flex"
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Auditoria ({editingContract?.statusHistory?.length || 0})</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingContract}
                        className="px-6 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {isSubmittingContract ? (
                          <span>Salvando Contrato...</span>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 text-black stroke-[2.5]" />
                            <span>Salvar Contrato</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal de Importação em Lote de Contratos */}
      <ImportContractsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(count) => {
          setSuccessToast(`${count} contrato(s) e respectivos clientes importados e cruzados com sucesso!`);
          setTimeout(() => setSuccessToast(''), 6000);
        }}
      />

      {/* Modal de Cronograma & Faturamento Automático dos Próximos Meses */}
      <ContractScheduleModal
        contract={selectedContractForSchedule}
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false);
          setSelectedContractForSchedule(null);
        }}
        onUpdate={() => {
          // Atualiza lista e notificações se necessário
          setSuccessToast('Cronograma de parcelas e títulos atualizado com sucesso!');
          setTimeout(() => setSuccessToast(''), 4000);
        }}
      />

      {/* Modal de Cancelamento / Inativação de Contrato */}
      <CancelContractModal
        contract={selectedContractForCancel}
        isOpen={isCancelModalOpen}
        onClose={() => {
          setIsCancelModalOpen(false);
          setSelectedContractForCancel(null);
        }}
        onSuccess={(msg) => {
          setSuccessToast(msg);
          setTimeout(() => setSuccessToast(''), 6000);
        }}
      />

      {/* Modal de Exclusão Definitiva de Contrato */}
      <DeleteContractModal
        contract={selectedContractForDelete}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setSelectedContractForDelete(null);
        }}
        onSuccess={(msg) => {
          setSuccessToast(msg);
          setTimeout(() => setSuccessToast(''), 6000);
        }}
      />

      {/* Modal Rápido de Criação / Edição de Cliente */}
      <CompleteCounterpartyModal
        isOpen={isClientModalOpen}
        counterpartyId={clientModalCounterpartyId}
        defaultType="CLIENTE"
        onClose={() => {
          setIsClientModalOpen(false);
          setClientModalCounterpartyId(null);
        }}
        onSaved={(savedClient) => {
          setClientsRefreshTrigger(prev => prev + 1);
          if (clientModalCounterpartyId === 'NEW') {
            setFormData(prev => ({ ...prev, customerId: savedClient.id }));
          }
          setSuccessToast(`Dados de "${savedClient.name}" salvos com sucesso!`);
          setTimeout(() => setSuccessToast(''), 4000);
        }}
      />

      {/* Modal de Notificação Formal de Reajuste ao Cliente */}
      {notifyAdjustmentModal.isOpen && notifyAdjustmentModal.adjustment && (
        <ContractAdjustmentNotificationModal
          isOpen={true}
          contract={{
            ...(editingContract || {}),
            ...formData,
            id: editingContract?.id || formData.id || 'ctr-temp',
            contractNumber: formData.contractNumber || editingContract?.contractNumber || 'CTR',
            description: formData.description || editingContract?.description || 'Contrato',
            customerId: formData.customerId || editingContract?.customerId || '',
            monthlyTotal: formData.monthlyTotal || editingContract?.monthlyTotal || 0,
            dueDay: formData.dueDay || editingContract?.dueDay || 10,
            status: formData.status || editingContract?.status || 'ATIVO'
          } as Contract}
          adjustment={notifyAdjustmentModal.adjustment}
          onClose={() => setNotifyAdjustmentModal({ isOpen: false, adjustment: null })}
        />
      )}

      {/* Modal de Faturamento em Lote de Taxa de Balanço Anual (13º Honorário) */}
      <BalanceFeeBatchBillingModal
        isOpen={isBalanceFeeBatchModalOpen}
        onClose={() => setIsBalanceFeeBatchModalOpen(false)}
        onGenerated={(res) => {
          setSuccessToast(`Faturamento de Taxas de Balanço concluído: ${res.totalTitlesGenerated} títulos gerados (${formatBRL(res.totalAmountGenerated)})`);
          setTimeout(() => setSuccessToast(''), 6000);
        }}
      />
    </div>
  );
};
