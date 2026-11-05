import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Network, Plus, Search, Layers, Edit2, CornerDownRight, FolderPlus, 
  CheckCircle2, Copy, Sparkles, GripVertical, ChevronUp, ChevronDown, 
  ChevronRight, FolderInput, Folder, FolderOpen, ArrowUpDown, Wand2, 
  Check, X, AlertTriangle, HelpCircle, Activity, Clock, Filter, 
  Maximize2, Minimize2, GitMerge, Trash2, Eye, EyeOff, ShieldAlert, ShieldCheck 
} from 'lucide-react';
import { ChartOfAccount, OperationNature, CashFlowCategory } from '../../types';
import { storage } from '../../services/storageService';
import { matchesSearch } from '../../utils/searchUtils';
import { 
  STRATEGIC_DRE_GROUPS, 
  calculateNextChildCode, 
  reorderAndRenumberAccounts, 
  moveAccountToStrategicGroup, 
  moveAccountOneStep, 
  renumberAllChartAccounts,
  findStrategicGroupByAccount,
  executeMergeAccounts,
  checkAccountDeletionSafety,
  executeDeleteAccount,
  toggleAccountStatus,
  StrategicGroupDefinition,
  MergeAccountsSummary 
} from '../../services/chartOfAccountsEngine';
import { PremiumSelect } from '../Common/PremiumSelect';

/**
 * Converte qualquer texto digitado para o padrão contábil Title Case inteligente:
 * Primeira letra maiúscula e próximas minúsculas, mantendo conectivos em minúsculas
 * e siglas fiscais/bancárias consagradas em maiúsculas.
 */
export function formatAccountDescription(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';

  const LOWERCASE_WORDS = new Set([
    'de', 'da', 'do', 'dos', 'das',
    'e', 'em', 'para', 'com', 'por', 'ou',
    'na', 'no', 'nas', 'nos',
    'a', 'o', 'as', 'os', 'ao', 'aos',
    'sobre', 'sob', 'sem', 'ate', 'até'
  ]);

  const UPPERCASE_ACRONYMS: Record<string, string> = {
    'ti': 'TI',
    'rh': 'RH',
    'bpo': 'BPO',
    'pix': 'PIX',
    'erp': 'ERP',
    'crm': 'CRM',
    'mei': 'MEI',
    'me': 'ME',
    'epp': 'EPP',
    'ltda': 'LTDA',
    'sa': 'S/A',
    's/a': 'S/A',
    'eireli': 'EIRELI',
    'cnpj': 'CNPJ',
    'cpf': 'CPF',
    'irpf': 'IRPF',
    'irpj': 'IRPJ',
    'csll': 'CSLL',
    'pis': 'PIS',
    'cofins': 'COFINS',
    'icms': 'ICMS',
    'iss': 'ISS',
    'fgts': 'FGTS',
    'inss': 'INSS',
    'dre': 'DRE',
    'dfc': 'DFC',
    'dfp': 'DFP',
    'cpv': 'CPV',
    'csp': 'CSP',
    'iof': 'IOF',
    'ted': 'TED',
    'doc': 'DOC',
    'saas': 'SaaS',
    'aws': 'AWS',
    'gcp': 'GCP',
    'pj': 'PJ',
    'pf': 'PF'
  };

  const words = trimmed.split(/\s+/);
  const formatted = words.map((word, index) => {
    const cleanWord = word.toLowerCase().replace(/[^a-zA-Z0-9áàâãéèêíïóôõöúçñ/]/g, '');
    
    if (UPPERCASE_ACRONYMS[cleanWord]) {
      return word.replace(new RegExp(cleanWord, 'i'), UPPERCASE_ACRONYMS[cleanWord]);
    }

    if (index > 0 && LOWERCASE_WORDS.has(cleanWord)) {
      return word.toLowerCase();
    }

    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return formatted.join(' ');
}

interface ModalCreationContext {
  mode: 'NEW' | 'CHILD' | 'SIBLING' | 'CLONE';
  referenceAccount?: ChartOfAccount;
}

export const ChartOfAccountsView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRootFilter, setSelectedRootFilter] = useState<string>('TODOS');
  const [usageFilter, setUsageFilter] = useState<'TODOS' | 'COM_LANCAMENTOS' | 'OCIOSAS'>('TODOS');
  
  // Opção 1: Acordeão Retrátil (Grupos Sintéticos Recolhidos)
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());

  // Modais de Criação, Edição, Renumeração, Fusão e Trava de Exclusão
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRenumberModalOpen, setIsRenumberModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [creationContext, setCreationContext] = useState<ModalCreationContext>({ mode: 'NEW' });
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Estados de Fusão de Contas (Opção 1)
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [mergeSourceAccount, setMergeSourceAccount] = useState<ChartOfAccount | null>(null);
  const [mergeTargetAccountId, setMergeTargetAccountId] = useState<string>('');
  const [mergeInactivateSource, setMergeInactivateSource] = useState<boolean>(true);
  const [isExecutingMerge, setIsExecutingMerge] = useState<boolean>(false);

  // Estados de Trava de Segurança e Exclusão (Opção 2)
  const [safetyModalData, setSafetyModalData] = useState<{
    isOpen: boolean;
    account: ChartOfAccount | null;
    checkResult: ReturnType<typeof checkAccountDeletionSafety> | null;
  }>({
    isOpen: false,
    account: null,
    checkResult: null
  });

  // Estados de Arrastar e Soltar (Drag and Drop)
  const [draggedAccountId, setDraggedAccountId] = useState<string | null>(null);
  const [dragOverAccountId, setDragOverAccountId] = useState<string | null>(null);
  const [dragOverPlacement, setDragOverPlacement] = useState<'BEFORE' | 'AFTER' | 'INTO' | null>(null);

  // Gatilho de atualização do storage
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    return storage.subscribe(() => setRefreshTrigger(k => k + 1));
  }, []);

  const accounts = useMemo(() => {
    const raw = storage.getChartAccounts();
    return [...raw].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [refreshTrigger]);

  // Auditoria de Lançamentos e Uso de Contas
  const accountUsageIndex = useMemo(() => {
    const titles = storage.getTitles();
    const movements = storage.getMovements();
    const services = storage.getServices();
    const contracts = storage.getContracts();
    const rules = storage.getReconciliationRules ? storage.getReconciliationRules() : [];

    const map = new Map<string, {
      total: number;
      titles: number;
      movements: number;
      other: number;
      lastDate?: string;
    }>();

    const recordUsage = (accId: string | undefined, type: 'title' | 'movement' | 'other', date?: string) => {
      if (!accId) return;
      const current = map.get(accId) || { total: 0, titles: 0, movements: 0, other: 0 };
      current.total += 1;
      if (type === 'title') current.titles += 1;
      else if (type === 'movement') current.movements += 1;
      else current.other += 1;

      if (date && (!current.lastDate || date > current.lastDate)) {
        current.lastDate = date;
      }
      map.set(accId, current);
    };

    titles.forEach(t => recordUsage(t.accountId, 'title', t.issueDate || t.launchDate || t.dueDate));
    movements.forEach(m => recordUsage(m.accountId, 'movement', m.createdAt));
    services.forEach(s => recordUsage(s.chartAccountId || (s as any).defaultAccountId, 'other'));
    contracts.forEach(c => {
      c.items?.forEach(it => recordUsage(it.accountId, 'other'));
    });
    rules.forEach(r => recordUsage(r.chartAccountId, 'other'));

    return map;
  }, [refreshTrigger]);

  // Calcular lançamentos consolidados para grupos sintéticos (soma das filhas)
  const syntheticGroupUsageTotals = useMemo(() => {
    const totals = new Map<string, number>();

    accounts.forEach(acc => {
      if (acc.isSynthetic || !acc.isAnalytical) {
        const prefixDot = `${acc.code}.`;
        let sum = 0;
        accounts.forEach(child => {
          if (child.isAnalytical && (child.parentId === acc.id || child.code.startsWith(prefixDot))) {
            const usage = accountUsageIndex.get(child.id);
            if (usage) sum += usage.total;
          }
        });
        totals.set(acc.id, sum);
      }
    });

    return totals;
  }, [accounts, accountUsageIndex]);

  const [formData, setFormData] = useState<Partial<ChartOfAccount>>({
    code: '',
    name: '',
    nature: 'DESPESA_ADMINISTRATIVA',
    isSynthetic: false,
    dreLineMapping: 'DESPESAS_ADMINISTRATIVAS',
    status: 'ATIVO',
    parentId: 'grp-3.2'
  });

  // Estatísticas do Plano de Contas e Auditoria
  const stats = useMemo(() => {
    const total = accounts.length;
    const analytical = accounts.filter(a => a.isAnalytical);
    const synthetic = accounts.filter(a => a.isSynthetic || !a.isAnalytical);
    
    let inUse = 0;
    let idle = 0;

    analytical.forEach(a => {
      const usage = accountUsageIndex.get(a.id);
      if (usage && usage.total > 0) inUse++;
      else idle++;
    });

    const mapped = accounts.filter(a => a.dremap && a.dremap.include).length;
    const inUsePct = analytical.length > 0 ? Math.round((inUse / analytical.length) * 100) : 0;

    return { 
      total, 
      analyticalCount: analytical.length, 
      syntheticCount: synthetic.length, 
      inUse, 
      idle, 
      inUsePct,
      mapped 
    };
  }, [accounts, accountUsageIndex]);

  // Contas analíticas disponíveis para destino de fusão
  const availableMergeTargets = useMemo(() => {
    if (!mergeSourceAccount) return [];
    return accounts.filter(a => a.isAnalytical && a.id !== mergeSourceAccount.id && a.isActive);
  }, [accounts, mergeSourceAccount]);

  const showToast = (message: string) => {
    setToastFeedback(message);
    setTimeout(() => {
      setToastFeedback(prev => prev === message ? null : prev);
    }, 4500);
  };

  // Alternar recolhimento de um grupo (Opção 1)
  const toggleGroup = (groupId: string) => {
    setCollapsedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const expandAllGroups = () => {
    setCollapsedGroupIds(new Set());
    showToast('Todos os grupos contábeis foram expandidos.');
  };

  const collapseAllGroups = () => {
    const allSyntheticIds = accounts
      .filter(a => a.isSynthetic || !a.isAnalytical)
      .map(a => a.id);
    setCollapsedGroupIds(new Set(allSyntheticIds));
    showToast('Todos os grupos contábeis foram recolhidos.');
  };

  // Verifica se uma conta deve ser visível de acordo com o estado do acordeão
  const isAccountVisibleInAccordion = (acc: ChartOfAccount): boolean => {
    if (searchTerm.trim().length > 0) return true;
    if (!acc.parentId || !acc.code.includes('.')) return true;

    let currentParentId: string | null | undefined = acc.parentId;
    while (currentParentId) {
      if (collapsedGroupIds.has(currentParentId)) {
        return false;
      }
      const parentAcc = accounts.find(a => a.id === currentParentId);
      currentParentId = parentAcc?.parentId;
    }

    return true;
  };

  // Filtragem combinada (Raiz, Busca, Auditoria de Uso e Acordeão)
  const filtered = useMemo(() => {
    return accounts.filter(a => {
      if (selectedRootFilter !== 'TODOS') {
        const rootDigit = a.code.charAt(0);
        if (rootDigit !== selectedRootFilter) return false;
      }

      if (usageFilter !== 'TODOS' && a.isAnalytical) {
        const usage = accountUsageIndex.get(a.id);
        const hasUsage = usage && usage.total > 0;
        if (usageFilter === 'COM_LANCAMENTOS' && !hasUsage) return false;
        if (usageFilter === 'OCIOSAS' && hasUsage) return false;
      }

      if (!matchesSearch([a.code, a.name, a.nature, a.dreLineMapping], searchTerm)) {
        return false;
      }

      if (!isAccountVisibleInAccordion(a)) {
        return false;
      }

      return true;
    });
  }, [accounts, selectedRootFilter, usageFilter, searchTerm, collapsedGroupIds, accountUsageIndex]);

  const handleParentGroupSelect = (parentGroupId: string) => {
    const groupDef = STRATEGIC_DRE_GROUPS.find(g => g.id === parentGroupId);
    if (!groupDef) {
      setFormData(prev => ({ ...prev, parentId: parentGroupId }));
      return;
    }

    const nextCode = calculateNextChildCode(groupDef.prefix, accounts);

    setFormData(prev => ({
      ...prev,
      parentId: groupDef.id,
      code: nextCode,
      nature: groupDef.nature,
      cashFlowCategory: groupDef.cashFlowCategory,
      dreLineMapping: groupDef.dreLine,
      dremap: {
        include: groupDef.dreLine !== 'NAO_APLICAVEL',
        line: groupDef.dreLine,
        multiplier: groupDef.multiplier
      }
    }));
  };

  const handleOpenNew = () => {
    setEditingAccount(null);
    setCreationContext({ mode: 'NEW' });
    
    const defaultGroup = STRATEGIC_DRE_GROUPS.find(g => g.id === 'grp-3.2') || STRATEGIC_DRE_GROUPS[0];
    const nextCode = calculateNextChildCode(defaultGroup.prefix, accounts);

    setFormData({
      code: nextCode,
      name: '',
      parentId: defaultGroup.id,
      nature: defaultGroup.nature,
      isSynthetic: false,
      dreLineMapping: defaultGroup.dreLine,
      cashFlowCategory: defaultGroup.cashFlowCategory,
      status: 'ATIVO'
    });
    setIsModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const handleCreateChild = (parent: ChartOfAccount) => {
    const prefix = parent.code;
    const nextCode = calculateNextChildCode(prefix, accounts);
    const parentGroup = findStrategicGroupByAccount(parent);

    if (collapsedGroupIds.has(parent.id)) {
      setCollapsedGroupIds(prev => {
        const next = new Set(prev);
        next.delete(parent.id);
        return next;
      });
    }

    setEditingAccount(null);
    setCreationContext({ mode: 'CHILD', referenceAccount: parent });
    setFormData({
      code: nextCode,
      name: '',
      parentId: parent.id,
      nature: parent.nature,
      isSynthetic: false,
      dreLineMapping: parent.dreLineMapping || parentGroup?.dreLine || 'DESPESAS_ADMINISTRATIVAS',
      cashFlowCategory: parent.cashFlowCategory || parentGroup?.cashFlowCategory || 'OPERACIONAL',
      status: 'ATIVO'
    });
    setIsModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const handleCreateSibling = (sibling: ChartOfAccount) => {
    const siblingGroup = findStrategicGroupByAccount(sibling);
    const prefix = siblingGroup ? siblingGroup.prefix : sibling.code.substring(0, sibling.code.lastIndexOf('.'));
    const nextCode = calculateNextChildCode(prefix || '3.2', accounts);

    setEditingAccount(null);
    setCreationContext({ mode: 'SIBLING', referenceAccount: sibling });
    setFormData({
      code: nextCode,
      name: '',
      parentId: sibling.parentId,
      nature: sibling.nature,
      isSynthetic: false,
      dreLineMapping: sibling.dreLineMapping || siblingGroup?.dreLine || 'DESPESAS_ADMINISTRATIVAS',
      cashFlowCategory: sibling.cashFlowCategory || siblingGroup?.cashFlowCategory || 'OPERACIONAL',
      status: 'ATIVO'
    });
    setIsModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const handleCloneAccount = (source: ChartOfAccount) => {
    const sourceGroup = findStrategicGroupByAccount(source);
    const prefix = sourceGroup ? sourceGroup.prefix : source.code.substring(0, source.code.lastIndexOf('.'));
    const nextCode = calculateNextChildCode(prefix || '3.2', accounts);

    setEditingAccount(null);
    setCreationContext({ mode: 'CLONE', referenceAccount: source });
    setFormData({
      code: nextCode,
      name: '',
      parentId: source.parentId,
      nature: source.nature,
      isSynthetic: source.isSynthetic ?? !source.isAnalytical,
      dreLineMapping: source.dreLineMapping || source.dremap?.line || 'DESPESAS_ADMINISTRATIVAS',
      cashFlowCategory: source.cashFlowCategory || 'OPERACIONAL',
      status: 'ATIVO'
    });
    setIsModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const handleEdit = (a: ChartOfAccount) => {
    setEditingAccount(a);
    setCreationContext({ mode: 'NEW', referenceAccount: a });
    setFormData(a);
    setIsModalOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    const formattedName = formatAccountDescription(formData.name.trim());
    const all = storage.getChartAccounts();
    const currentUser = storage.getCurrentUser();
    const groupDef = STRATEGIC_DRE_GROUPS.find(g => g.id === formData.parentId || g.dreLine === formData.dreLineMapping);

    if (editingAccount) {
      const updated = all.map(a => a.id === editingAccount.id ? { 
        ...a, 
        ...formData,
        name: formattedName,
        nature: formData.nature || groupDef?.nature || a.nature,
        cashFlowCategory: formData.cashFlowCategory || groupDef?.cashFlowCategory || a.cashFlowCategory || 'OPERACIONAL',
        dremap: {
          include: formData.dreLineMapping !== 'NAO_APLICAVEL',
          line: groupDef?.dreLine || formData.dreLineMapping || 'OUTRAS_OPERACIONAIS',
          multiplier: groupDef?.multiplier ?? 1
        }
      } as ChartOfAccount : a);
      storage.saveChartAccounts(updated);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'EDICAO_PLANO_CONTAS',
        module: 'Plano de Contas',
        recordId: editingAccount.id,
        details: `Atualização da conta contábil ${formData.code} - ${formattedName}.`
      });
      showToast(`Conta contábil "${formData.code} - ${formattedName}" salva com sucesso!`);
    } else {
      const isSynth = Boolean(formData.isSynthetic);
      const newAcc: ChartOfAccount = {
        id: `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        code: formData.code.trim(),
        name: formattedName,
        parentId: formData.parentId || groupDef?.id || null,
        nature: (formData.nature as any) || groupDef?.nature || 'DESPESA_ADMINISTRATIVA',
        dremap: {
          include: formData.dreLineMapping !== 'NAO_APLICAVEL',
          line: groupDef?.dreLine || formData.dreLineMapping || 'OUTRAS_OPERACIONAIS',
          multiplier: groupDef?.multiplier ?? 1
        },
        cashFlowCategory: (formData.cashFlowCategory as any) || groupDef?.cashFlowCategory || 'OPERACIONAL',
        isAnalytical: !isSynth,
        isSynthetic: isSynth,
        isActive: true,
        dreLineMapping: formData.dreLineMapping || groupDef?.dreLine || 'DESPESAS_ADMINISTRATIVAS',
        status: 'ATIVO'
      };

      let updatedList = [...all, newAcc];

      if (creationContext.mode === 'CHILD' && creationContext.referenceAccount) {
        const parentId = creationContext.referenceAccount.id;
        updatedList = updatedList.map(a => {
          if (a.id === parentId && !a.isSynthetic) {
            return {
              ...a,
              isSynthetic: true,
              isAnalytical: false
            };
          }
          return a;
        });
      }

      storage.saveChartAccounts(updatedList);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CRIACAO_PLANO_CONTAS',
        module: 'Plano de Contas',
        recordId: newAcc.id,
        details: `Criação da conta contábil ${newAcc.code} - ${newAcc.name} (Modo: ${creationContext.mode}).`
      });
      showToast(`Nova conta "${newAcc.code} - ${newAcc.name}" cadastrada com sucesso!`);
    }

    setIsModalOpen(false);
  };

  const handleQuickMoveGroup = (account: ChartOfAccount, targetGroupId: string) => {
    if (!targetGroupId || account.parentId === targetGroupId) return;

    const { updatedAccounts, newAccountCode } = moveAccountToStrategicGroup(accounts, account.id, targetGroupId);
    storage.saveChartAccounts(updatedAccounts);

    setCollapsedGroupIds(prev => {
      const next = new Set(prev);
      next.delete(targetGroupId);
      return next;
    });

    const targetGroup = STRATEGIC_DRE_GROUPS.find(g => g.id === targetGroupId);
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'MOVER_GRUPO_PLANO_CONTAS',
      module: 'Plano de Contas',
      recordId: account.id,
      details: `Conta ${account.name} movida de ${account.code} para o grupo ${targetGroup?.name || targetGroupId} com novo código ${newAccountCode}.`
    });

    showToast(`Conta "${account.name}" movida para ${targetGroup?.name || 'novo grupo'}. Novo código: ${newAccountCode}`);
  };

  const handleStepMove = (account: ChartOfAccount, direction: 'UP' | 'DOWN') => {
    const updated = moveAccountOneStep(accounts, account.id, direction);
    storage.saveChartAccounts(updated);
    const newAcc = updated.find(a => a.id === account.id);
    showToast(`Posição da conta "${account.name}" alterada para ${newAcc?.code || account.code}.`);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, account: ChartOfAccount) => {
    setDraggedAccountId(account.id);
    e.dataTransfer.setData('text/plain', account.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetAccount: ChartOfAccount) => {
    e.preventDefault();
    if (!draggedAccountId || draggedAccountId === targetAccount.id) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const placement: 'BEFORE' | 'AFTER' = e.clientY < midY ? 'BEFORE' : 'AFTER';

    setDragOverAccountId(targetAccount.id);
    setDragOverPlacement(placement);
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = () => {
    setDragOverAccountId(null);
    setDragOverPlacement(null);
  };

  const handleDrop = (e: React.DragEvent, targetAccount: ChartOfAccount) => {
    e.preventDefault();
    const sourceId = draggedAccountId || e.dataTransfer.getData('text/plain');

    if (!sourceId || sourceId === targetAccount.id) {
      setDraggedAccountId(null);
      setDragOverAccountId(null);
      setDragOverPlacement(null);
      return;
    }

    const sourceAccount = accounts.find(a => a.id === sourceId);
    if (!sourceAccount) return;

    if (targetAccount.isSynthetic) {
      setCollapsedGroupIds(prev => {
        const next = new Set(prev);
        next.delete(targetAccount.id);
        return next;
      });
    }

    const placement = dragOverPlacement || 'BEFORE';
    const reordered = reorderAndRenumberAccounts(accounts, sourceId, targetAccount.id, placement as any);
    storage.saveChartAccounts(reordered);

    const finalSource = reordered.find(a => a.id === sourceId);
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'REORDENAR_PLANO_CONTAS',
      module: 'Plano de Contas',
      recordId: sourceId,
      details: `Conta ${sourceAccount.name} reposicionada via arrastar e renumerada para ${finalSource?.code}.`
    });

    showToast(`✓ Linha reposicionada! "${sourceAccount.name}" renumerada para ${finalSource?.code} em sequência.`);
    setDraggedAccountId(null);
    setDragOverAccountId(null);
    setDragOverPlacement(null);
  };

  const handleDragEnd = () => {
    setDraggedAccountId(null);
    setDragOverAccountId(null);
    setDragOverPlacement(null);
  };

  // Renumeração Global e Alinhamento Estratégico com a DRE
  const handleExecuteGlobalRenumber = () => {
    const { updatedAccounts, renumberedCount } = renumberAllChartAccounts(accounts);
    storage.saveChartAccounts(updatedAccounts);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'RENUMERACAO_GLOBAL_PLANO_CONTAS',
      module: 'Plano de Contas',
      recordId: 'ALL',
      details: `Renumeração global e alinhamento com a DRE executados. ${renumberedCount} contas ajustadas.`
    });

    setIsRenumberModalOpen(false);
    showToast(`⚡ Sucesso! ${renumberedCount} contas foram realinhadas e renumeradas sequencialmente de acordo com a DRE.`);
  };

  // ==========================================
  // OPÇÃO 1: FUSÃO / UNIFICAÇÃO DE CONTAS
  // ==========================================
  const handleOpenMergeModal = (sourceAcc: ChartOfAccount) => {
    setMergeSourceAccount(sourceAcc);
    setMergeTargetAccountId('');
    setMergeInactivateSource(true);
    setIsMergeModalOpen(true);
  };

  const handleConfirmMerge = () => {
    if (!mergeSourceAccount || !mergeTargetAccountId) {
      alert('Por favor, selecione uma conta de destino válida para a fusão.');
      return;
    }

    setIsExecutingMerge(true);
    try {
      const res = executeMergeAccounts(mergeSourceAccount.id, mergeTargetAccountId, mergeInactivateSource);
      if (res.success) {
        showToast(
          `✓ Fusão concluída! ${res.summary.totalMigrated} registros migrados com sucesso para ${res.targetAccountName}.`
        );
        setIsMergeModalOpen(false);
        setMergeSourceAccount(null);
        setMergeTargetAccountId('');
      } else {
        alert(`Erro na fusão: ${res.errorMessage || 'Falha ao processar migração'}`);
      }
    } finally {
      setIsExecutingMerge(false);
    }
  };

  // ==========================================
  // OPÇÃO 2: TRAVA DE SEGURANÇA CONTRA EXCLUSÃO
  // ==========================================
  const handleAttemptDeleteAccount = (account: ChartOfAccount) => {
    const usage = accountUsageIndex.get(account.id);
    const usageTotal = usage ? usage.total : 0;
    const safetyResult = checkAccountDeletionSafety(account, accounts, usageTotal);

    setSafetyModalData({
      isOpen: true,
      account,
      checkResult: safetyResult
    });
  };

  const handleConfirmDeleteIdleAccount = () => {
    if (!safetyModalData.account) return;
    const accountToDelete = safetyModalData.account;

    const updated = executeDeleteAccount(accounts, accountToDelete.id);
    storage.saveChartAccounts(updated);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EXCLUSAO_CONTA_OCIOSA',
      module: 'Plano de Contas',
      recordId: accountToDelete.id,
      details: `Conta ociosa ${accountToDelete.code} - ${accountToDelete.name} excluída permanentemente. Grupo renumerado sequencialmente.`
    });

    setSafetyModalData({ isOpen: false, account: null, checkResult: null });
    showToast(`Conta ociosa "${accountToDelete.code} - ${accountToDelete.name}" excluída e grupo renumerado com sucesso.`);
  };

  const handleInactivateBlockedAccount = (account: ChartOfAccount) => {
    const updated = toggleAccountStatus(accounts, account.id);
    storage.saveChartAccounts(updated);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'INATIVACAO_CONTA_CONTABIL',
      module: 'Plano de Contas',
      recordId: account.id,
      details: `Conta ${account.code} - ${account.name} inativada para novos lançamentos com preservação do histórico fiscal.`
    });

    setSafetyModalData({ isOpen: false, account: null, checkResult: null });
    showToast(`Conta "${account.code} - ${account.name}" inativada para novos lançamentos com histórico 100% preservado.`);
  };

  const handleToggleStatus = (account: ChartOfAccount) => {
    const updated = toggleAccountStatus(accounts, account.id);
    storage.saveChartAccounts(updated);
    const target = updated.find(a => a.id === account.id);
    showToast(`Status da conta "${account.name}" alterado para ${target?.status || (target?.isActive ? 'ATIVO' : 'INATIVO')}.`);
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Feedback Flutuante */}
      {toastFeedback && (
        <div className="fixed top-5 right-5 z-50 bg-slate-950 text-white border border-amber-500/40 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-200">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold">{toastFeedback}</span>
          <button 
            type="button" 
            onClick={() => setToastFeedback(null)}
            className="text-slate-400 hover:text-white ml-2 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Estratégico */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                Plano de Contas Gerencial & Mapeamento DRE
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Árvore retrátil, auto-renumeração por arrasto, trava de exclusão de lançamentos e fusão de contas em lote.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          {/* Botão de Alinhamento Global */}
          <button
            type="button"
            onClick={() => setIsRenumberModalOpen(true)}
            className="px-3.5 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Percorre todas as contas e renumera sequencialmente garantindo alinhamento total com a DRE"
          >
            <Wand2 className="w-4 h-4 text-amber-500" />
            <span>⚡ Renumerar & Alinhar com DRE</span>
          </button>

          {/* Botão de Nova Conta */}
          <button
            type="button"
            onClick={handleOpenNew}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:brightness-105 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Conta</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas e Auditoria de Lançamentos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Total de Contas</span>
          <div className="text-xl font-bold font-mono text-[var(--text-primary)] mt-1">{stats.total}</div>
          <span className="text-[10px] text-slate-400">{stats.analyticalCount} analíticas • {stats.syntheticCount} sintéticas</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block flex items-center justify-between">
            <span>Em Uso Ativo</span>
            <span className="font-mono">{stats.inUsePct}%</span>
          </span>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">{stats.inUse}</div>
          <span className="text-[10px] text-slate-400">Com títulos e movimentações</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">Contas Ociosas</span>
          <div className="text-xl font-bold font-mono text-amber-500 mt-1">{stats.idle}</div>
          <span className="text-[10px] text-slate-400">Zero lançamentos (Prontas p/ auditoria)</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 block">Mapeadas na DRE</span>
          <div className="text-xl font-bold font-mono text-blue-500 mt-1">{stats.mapped}</div>
          <span className="text-[10px] text-slate-400">Com impacto em relatórios</span>
        </div>
      </div>

      {/* Barra de Filtro, Abas Estratégicas e Controles */}
      <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-2xs space-y-3">
        
        {/* Linha Superior: Abas Estratégicas por Seção DRE */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            type="button"
            onClick={() => setSelectedRootFilter('TODOS')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === 'TODOS' 
                ? 'bg-amber-500 text-slate-950 shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Todas as Contas ({accounts.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('1')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '1' 
                ? 'bg-emerald-600 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            📈 1. Receitas & Deduções
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('2')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '2' 
                ? 'bg-amber-600 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            ⚙️ 2. Custos dos Serviços
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('3')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '3' 
                ? 'bg-blue-600 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            🏢 3. Despesas Operacionais (Admin / Gerais / Comerciais)
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('4')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '4' 
                ? 'bg-teal-600 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            💵 4. Resultado Financeiro
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('5')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '5' 
                ? 'bg-pink-600 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            🏛️ 5. Tributos sobre Lucro
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('6')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '6' 
                ? 'bg-cyan-600 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            💼 6. Ativos & Investimentos
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('7')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '7' 
                ? 'bg-violet-600 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            🤝 7. Sócios & Financiamentos
          </button>
          <button
            type="button"
            onClick={() => setSelectedRootFilter('8')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap cursor-pointer ${
              selectedRootFilter === '8' 
                ? 'bg-slate-700 text-white shadow-2xs' 
                : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            📑 8. Controles Específicos
          </button>
        </div>

        {/* Linha Intermediária: Busca, Filtro de Auditoria e Controles */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pt-2 border-t border-[var(--border-subtle)]">
          
          {/* Input de Busca */}
          <div className="relative flex-1 max-w-md w-full">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar conta por código, descrição ou mapeamento DRE..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            
            {/* Filtro de Auditoria de Lançamentos */}
            <div className="flex items-center gap-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
              <span className="text-[10px] font-bold text-slate-500 px-1.5 flex items-center gap-1">
                <Filter className="w-3 h-3 text-amber-500" />
                Uso:
              </span>
              <button
                type="button"
                onClick={() => setUsageFilter('TODOS')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  usageFilter === 'TODOS'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setUsageFilter('COM_LANCAMENTOS')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  usageFilter === 'COM_LANCAMENTOS'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-500'
                }`}
                title="Exibir apenas contas que possuem lançamentos vinculados"
              >
                <span>🔥 Em Uso ({stats.inUse})</span>
              </button>
              <button
                type="button"
                onClick={() => setUsageFilter('OCIOSAS')}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  usageFilter === 'OCIOSAS'
                    ? 'bg-amber-600 text-white font-bold'
                    : 'text-amber-600 dark:text-amber-400 hover:text-amber-500'
                }`}
                title="Exibir contas analíticas sem lançamentos (auditoria)"
              >
                <span>💤 Ociosas ({stats.idle})</span>
              </button>
            </div>

            {/* Controles Globais de Acordeão */}
            <div className="flex items-center gap-1 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
              <button
                type="button"
                onClick={expandAllGroups}
                className="px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors flex items-center gap-1 cursor-pointer"
                title="Expandir todas as pastas e subpastas"
              >
                <Maximize2 className="w-3 h-3 text-amber-500" />
                <span>Expandir Tudo</span>
              </button>
              <button
                type="button"
                onClick={collapseAllGroups}
                className="px-2 py-1 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors flex items-center gap-1 cursor-pointer"
                title="Recolher todas as pastas sintéticas"
              >
                <Minimize2 className="w-3 h-3 text-slate-400" />
                <span>Recolher Tudo</span>
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Tabela Interativa de Contas com Acordeão, Drag & Drop, Auditoria e Fusão */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3 w-14 text-center">Ordem</th>
                <th className="py-3 px-4 w-28">Código</th>
                <th className="py-3 px-4">Descrição da Conta</th>
                <th className="py-3 px-3">Tipo</th>
                <th className="py-3 px-4">Linha Estratégica DRE</th>
                <th className="py-3 px-4">Auditoria & Uso</th>
                <th className="py-3 px-3">Mover de Grupo</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filtered.map(acc => {
                const isSynthetic = acc.isSynthetic ?? !acc.isAnalytical;
                const level = acc.code.split('.').length;
                const isDragging = draggedAccountId === acc.id;
                const isOver = dragOverAccountId === acc.id;
                const isCollapsed = collapsedGroupIds.has(acc.id);

                const groupDef = findStrategicGroupByAccount(acc);
                const usage = accountUsageIndex.get(acc.id);
                const syntheticUsageSum = isSynthetic ? (syntheticGroupUsageTotals.get(acc.id) || 0) : 0;

                const directChildrenCount = isSynthetic 
                  ? accounts.filter(child => child.parentId === acc.id || (child.code.startsWith(acc.code + '.') && child.code.split('.').length === level + 1)).length
                  : 0;

                return (
                  <tr 
                    key={acc.id} 
                    draggable={!isSynthetic}
                    onDragStart={e => handleDragStart(e, acc)}
                    onDragOver={e => handleDragOver(e, acc)}
                    onDragLeave={handleDragLeave}
                    onDrop={e => handleDrop(e, acc)}
                    onDragEnd={handleDragEnd}
                    className={`transition-colors select-none ${
                      isSynthetic 
                        ? 'bg-[var(--surface-elevated)]/80 font-bold text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]' 
                        : 'hover:bg-[var(--surface-elevated)] text-[var(--text-primary)]'
                    } ${isDragging ? 'opacity-30 bg-amber-500/15' : ''} ${
                      isOver 
                        ? dragOverPlacement === 'BEFORE' 
                          ? 'border-t-2 border-amber-500 bg-amber-500/10' 
                          : 'border-b-2 border-amber-500 bg-amber-500/10' 
                        : ''
                    } ${acc.status === 'INATIVO' || acc.isActive === false ? 'opacity-60 bg-slate-50 dark:bg-slate-900/30' : ''}`}
                  >
                    {/* Alça de Arraste OU Toggle do Acordeão */}
                    <td className="py-2 px-2 text-center">
                      {!isSynthetic ? (
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleStepMove(acc, 'UP')}
                            className="p-1 hover:text-amber-500 text-slate-400 rounded cursor-pointer"
                            title="Subir uma posição e renumerar"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <div 
                            className="cursor-grab active:cursor-grabbing p-1 text-slate-400 hover:text-amber-500"
                            title="Arraste para reposicionar ou mover para outro grupo"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleStepMove(acc, 'DOWN')}
                            className="p-1 hover:text-amber-500 text-slate-400 rounded cursor-pointer"
                            title="Descer uma posição e renumerar"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleGroup(acc.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors flex items-center justify-center cursor-pointer mx-auto"
                          title={isCollapsed ? 'Expandir este grupo de contas' : 'Recolher este grupo de contas'}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="w-4 h-4 text-amber-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-amber-500" />
                          )}
                        </button>
                      )}
                    </td>

                    {/* Código Estrutural */}
                    <td className="py-2.5 px-4 font-mono text-[var(--text-primary)] font-bold whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md ${
                        isSynthetic 
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold shadow-2xs' 
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                      }`}>
                        {acc.code}
                      </span>
                    </td>

                    {/* Descrição com Indentação e Ícone de Pasta */}
                    <td className="py-2.5 px-4" style={{ paddingLeft: `${Math.max(16, level * 18)}px` }}>
                      <div className="flex items-center gap-2">
                        {isSynthetic ? (
                          <button
                            type="button"
                            onClick={() => toggleGroup(acc.id)}
                            className="flex items-center gap-1.5 cursor-pointer hover:text-amber-500 transition-colors text-left"
                          >
                            {isCollapsed ? (
                              <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                            ) : (
                              <FolderOpen className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <span className="font-bold uppercase tracking-wide">
                              {acc.name}
                            </span>
                            {directChildrenCount > 0 && (
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded-full font-normal">
                                {directChildrenCount} {directChildrenCount === 1 ? 'filha' : 'filhas'}
                              </span>
                            )}
                          </button>
                        ) : (
                          <>
                            {level > 1 && <span className="text-slate-400 font-mono text-[10px]">└</span>}
                            <span className="font-medium">
                              {acc.name}
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    {/* Tipo: Sintética vs Analítica */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        isSynthetic 
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200' 
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {isSynthetic ? 'Sintética (Grupo)' : 'Analítica (Lançamento)'}
                      </span>
                    </td>

                    {/* Linha Estratégica DRE */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {groupDef ? (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                          groupDef.rootSection === 'RECEITA' 
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : groupDef.rootSection === 'DESPESA'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                            : groupDef.rootSection === 'CUSTO'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                            : groupDef.rootSection === 'FINANCEIRO'
                            ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30'
                            : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30'
                        }`}>
                          {groupDef.dreLabel}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-mono">
                          {acc.dreLineMapping || acc.dremap?.line || 'Geral'}
                        </span>
                      )}
                    </td>

                    {/* Auditoria de Lançamentos & Uso */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {isSynthetic ? (
                        syntheticUsageSum > 0 ? (
                          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 flex items-center gap-1 w-fit">
                            <Activity className="w-3 h-3 text-blue-500" />
                            <span>{syntheticUsageSum} no grupo</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Grupo sem registros</span>
                        )
                      ) : usage && usage.total > 0 ? (
                        <div className="flex items-center gap-1.5" title={`${usage.titles} títulos, ${usage.movements} movimentações${usage.lastDate ? ` • Último uso: ${usage.lastDate}` : ''}`}>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>{usage.total} {usage.total === 1 ? 'lançamento' : 'lançamentos'}</span>
                          </span>
                          {usage.titles > 0 && (
                            <span className="text-[9px] font-mono text-slate-400">({usage.titles} T)</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1 w-fit" title="Nenhum título ou movimentação vinculado a esta conta">
                          <Clock className="w-3 h-3 text-amber-500" />
                          <span>Ociosa (0)</span>
                        </span>
                      )}
                    </td>

                    {/* Dropdown Rápido: Mover para Grupo */}
                    <td className="py-2.5 px-3">
                      {!isSynthetic ? (
                        <PremiumSelect
                          value={acc.parentId || ''}
                          onChange={e => handleQuickMoveGroup(acc, e.target.value)}
                          className="w-36 text-[10px] py-1 px-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] font-medium focus:border-amber-500 cursor-pointer"
                          title="Transfere a conta diretamente para outro grupo com renumeração automática"
                        >
                          <option value="" disabled>Mover para...</option>
                          {STRATEGIC_DRE_GROUPS.map(grp => (
                            <option key={grp.id} value={grp.id}>
                              📁 {grp.dreLabel}
                            </option>
                          ))}
                        </PremiumSelect>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic">Pasta Raiz</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(acc)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded transition-colors cursor-pointer ${
                          acc.status === 'INATIVO' || acc.isActive === false
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-200'
                        }`}
                        title="Clique para alternar entre Ativo e Inativo"
                      >
                        {acc.status || (acc.isActive ? 'ATIVO' : 'INATIVO')}
                      </button>
                    </td>

                    {/* Ações Rápidas (Fusão, Clonagem, Edição e Exclusão com Trava) */}
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        
                        {/* Botão de Fusão de Contas (Opção 1) */}
                        {!isSynthetic && (
                          <button
                            type="button"
                            onClick={() => handleOpenMergeModal(acc)}
                            className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            title={`Fundir ${acc.code} com outra conta transferindo todo o histórico`}
                          >
                            <GitMerge className="w-3 h-3 text-blue-500" />
                            <span>Fundir</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCloneAccount(acc)}
                          className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 border border-amber-500/40 rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title={`Clonar linha com parâmetros contábeis e mapeamento DRE idênticos a ${acc.code}`}
                        >
                          <Copy className="w-3 h-3 text-amber-500" />
                          <span>Clonar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCreateChild(acc)}
                          className="px-2 py-1 bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title={`Criar sublinha filha sob ${acc.code} com numeração sequencial automática`}
                        >
                          <CornerDownRight className="w-3 h-3 text-amber-500" />
                          <span>+ Sublinha</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCreateSibling(acc)}
                          className="px-2 py-1 bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title={`Criar nova linha no mesmo grupo com numeração sequencial automática`}
                        >
                          <Plus className="w-3 h-3 text-slate-400" />
                          <span>+ Linha</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEdit(acc)}
                          className="p-1.5 text-[var(--text-secondary)] hover:text-amber-400 hover:bg-[var(--surface-elevated)] rounded-lg cursor-pointer"
                          title="Editar detalhes desta conta"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Botão de Exclusão com Trava de Segurança Contábil (Opção 2) */}
                        <button
                          type="button"
                          onClick={() => handleAttemptDeleteAccount(acc)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer transition-colors"
                          title="Excluir conta (protegida por trava contábil caso possua lançamentos)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* ======================================================== */}
      {/* MODAL DE FUSÃO / UNIFICAÇÃO DE CONTAS EM LOTE (OPÇÃO 1) */}
      {/* ======================================================== */}
      {isMergeModalOpen && mergeSourceAccount && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-lg w-full border border-[var(--border-subtle)] overflow-hidden animate-in fade-in duration-150">
            
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-500">
                  <GitMerge className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">
                    Fusão de Contas Contábeis (Merge em Lote)
                  </h2>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Transfira todo o histórico da conta obsoleta para uma conta de destino com segurança.
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsMergeModalOpen(false)} 
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              
              {/* Conta de Origem (Fixa) */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Conta de Origem (A ser fundida):</span>
                <div className="text-sm font-bold text-rose-600 dark:text-rose-400 font-mono">
                  {mergeSourceAccount.code} - {mergeSourceAccount.name}
                </div>
                <div className="text-[11px] text-slate-500 pt-1 flex items-center gap-2">
                  <span>Natureza: <strong>{mergeSourceAccount.nature}</strong></span>
                  <span>•</span>
                  <span>Vínculos ativos: <strong>{accountUsageIndex.get(mergeSourceAccount.id)?.total || 0}</strong> registros</span>
                </div>
              </div>

              {/* Conta de Destino (Dropdown com busca) */}
              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1">
                  Conta de Destino (Que receberá todo o histórico) *
                </label>
                <PremiumSelect
                  value={mergeTargetAccountId}
                  onChange={e => setMergeTargetAccountId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 text-xs font-medium focus:border-amber-500 focus:outline-hidden cursor-pointer"
                >
                  <option value="">Selecione a conta analítica de destino...</option>
                  {availableMergeTargets.map(target => (
                    <option key={target.id} value={target.id}>
                      {target.code} - {target.name} ({target.nature})
                    </option>
                  ))}
                </PremiumSelect>
                <p className="text-[10px] text-slate-500 mt-1">
                  Todos os títulos a pagar/receber, conciliações, serviços e contratos apontarão para esta conta.
                </p>
              </div>

              {/* Opção de Inativação da Conta de Origem */}
              <div className="p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mergeInactivateSource}
                    onChange={e => setMergeInactivateSource(e.target.checked)}
                    className="mt-0.5 rounded border-[var(--border-subtle)] text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-[var(--text-primary)] block">
                      Inativar a conta de origem após a fusão (Recomendado)
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] block mt-0.5">
                      Evita que operadores façam novos lançamentos acidentais na conta anterior, preservando o nome com a indicação "(Fundida em X)".
                    </span>
                  </div>
                </label>
              </div>

              {/* Card de Segurança */}
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-2.5 text-blue-700 dark:text-blue-300">
                <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-blue-500" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Garantia de Integridade:</strong> Nenhum lançamento será excluído ou perdido. O sistema reclassifica automaticamente os lançamentos fiscais, atualiza a DRE em tempo real e grava histórico de auditoria.
                </div>
              </div>

              {/* Rodapé */}
              <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsMergeModalOpen(false)}
                  disabled={isExecutingMerge}
                  className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMerge}
                  disabled={isExecutingMerge || !mergeTargetAccountId}
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <GitMerge className="w-4 h-4" />
                  <span>{isExecutingMerge ? 'Processando Fusão...' : 'Confirmar Fusão em Lote'}</span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL DE TRAVA DE SEGURANÇA CONTRA EXCLUSÃO (OPÇÃO 2)    */}
      {/* ======================================================== */}
      {safetyModalData.isOpen && safetyModalData.account && safetyModalData.checkResult && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--border-subtle)] overflow-hidden animate-in fade-in duration-150">
            
            {/* Header com Ícone Condicional */}
            <div className={`px-6 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3 ${
              safetyModalData.checkResult.canDelete 
                ? 'bg-rose-500/10' 
                : 'bg-amber-500/10'
            }`}>
              <div className={`p-2.5 rounded-xl border ${
                safetyModalData.checkResult.canDelete
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
              }`}>
                {safetyModalData.checkResult.canDelete ? (
                  <Trash2 className="w-6 h-6" />
                ) : (
                  <ShieldAlert className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {safetyModalData.checkResult.canDelete
                    ? 'Confirmar Exclusão de Conta Ociosa'
                    : 'Trava de Segurança Contábil'}
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  {safetyModalData.checkResult.canDelete
                    ? 'Conta sem lançamentos vinculados'
                    : 'Proteção de integridade contábil e fiscal'}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4 text-xs">
              
              {/* Mensagem e Motivação */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] leading-relaxed space-y-2">
                <div className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {safetyModalData.account.code} - {safetyModalData.account.name}
                </div>
                {safetyModalData.checkResult.reason && (
                  <p className="text-amber-800 dark:text-amber-300 font-medium">
                    {safetyModalData.checkResult.reason}
                  </p>
                )}
                {safetyModalData.checkResult.canDelete && (
                  <p className="text-slate-600 dark:text-slate-300">
                    Esta conta analítica não possui nenhum lançamento ou contrato registrado. A exclusão permanente é segura e o grupo restante será reorganizado e renumerado automaticamente.
                  </p>
                )}
              </div>

              {/* Botões Condicionais de Resolução Segura */}
              {!safetyModalData.checkResult.canDelete ? (
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Ações seguras recomendadas:</span>
                  
                  {safetyModalData.checkResult.isBlockedByUsage && (
                    <>
                      {/* Ação 1: Inativar Conta */}
                      <button
                        type="button"
                        onClick={() => handleInactivateBlockedAccount(safetyModalData.account!)}
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold border border-slate-300 dark:border-slate-700 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <EyeOff className="w-4 h-4 text-amber-500" />
                          <span>Inativar Conta para Novos Lançamentos</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal">Recomendado</span>
                      </button>

                      {/* Ação 2: Fundir com Outra Conta */}
                      <button
                        type="button"
                        onClick={() => {
                          const acc = safetyModalData.account!;
                          setSafetyModalData({ isOpen: false, account: null, checkResult: null });
                          handleOpenMergeModal(acc);
                        }}
                        className="w-full px-4 py-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold border border-blue-500/30 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <GitMerge className="w-4 h-4 text-blue-500" />
                          <span>Fundir com Outra Conta (Migrar Histórico)</span>
                        </div>
                        <span className="text-[10px] text-blue-400 font-normal">Transfere dados</span>
                      </button>
                    </>
                  )}

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSafetyModalData({ isOpen: false, account: null, checkResult: null })}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] cursor-pointer"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setSafetyModalData({ isOpen: false, account: null, checkResult: null })}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteIdleAccount}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs cursor-pointer transition-colors"
                  >
                    Excluir Conta Ociosa
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição / Clonagem com Menu Suspenso Inteligente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-lg w-full border border-[var(--border-subtle)] overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  {editingAccount ? (
                    <>
                      <Edit2 className="w-4 h-4 text-amber-500" />
                      <span>Editar Conta Contábil</span>
                    </>
                  ) : creationContext.mode === 'CLONE' ? (
                    <>
                      <Copy className="w-4 h-4 text-amber-500" />
                      <span>Clonar Conta Contábil</span>
                    </>
                  ) : creationContext.mode === 'CHILD' ? (
                    <>
                      <CornerDownRight className="w-4 h-4 text-amber-500" />
                      <span>Nova Sublinha Contábil</span>
                    </>
                  ) : creationContext.mode === 'SIBLING' ? (
                    <>
                      <Plus className="w-4 h-4 text-amber-500" />
                      <span>Nova Linha Contábil</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 text-amber-500" />
                      <span>Nova Conta Contábil</span>
                    </>
                  )}
                </h2>
                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {creationContext.mode === 'CLONE' && creationContext.referenceAccount
                    ? `Clonando estrutura de "${creationContext.referenceAccount.code} - ${creationContext.referenceAccount.name}". Apenas informe o novo nome.`
                    : creationContext.mode === 'CHILD' && creationContext.referenceAccount
                    ? `Inserindo subconta filha sob "${creationContext.referenceAccount.code} - ${creationContext.referenceAccount.name}"`
                    : creationContext.mode === 'SIBLING' && creationContext.referenceAccount
                    ? `Inserindo conta no mesmo grupo de "${creationContext.referenceAccount.code} - ${creationContext.referenceAccount.name}"`
                    : 'Defina a categoria mãe. O sistema numera e vincula a DRE automaticamente.'}
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 text-xs">
              
              {/* Menu Suspenso Principal: Categoria Mãe & Grupo Estratégico DRE */}
              <div>
                <label className="block font-bold text-[var(--text-primary)] mb-1 flex items-center justify-between">
                  <span>Categoria Mãe / Grupo Estratégico DRE *</span>
                  <span className="text-[10px] text-amber-500 font-semibold">Auto-numeração sequencial</span>
                </label>
                <PremiumSelect
                  value={formData.parentId || 'grp-3.2'}
                  onChange={e => handleParentGroupSelect(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 font-medium focus:border-amber-500 focus:outline-hidden cursor-pointer"
                >
                  <optgroup label="📈 1. RECEITAS E DEDUÇÕES">
                    <option value="grp-1.1">1.1 - Receitas de Serviços / Faturamento (Credora)</option>
                    <option value="grp-1.2">1.2 - Deduções da Receita e Impostos (Devedora)</option>
                  </optgroup>
                  <optgroup label="⚙️ 2. CUSTOS OPERACIONAIS">
                    <option value="grp-2.1">2.1 - Custos dos Serviços Prestados - CSP / CPV (Devedora)</option>
                  </optgroup>
                  <optgroup label="🏢 3. DESPESAS OPERACIONAIS (SEPARADAS)">
                    <option value="grp-3.1">3.1 - Despesas com Pessoal & Encargos (Devedora)</option>
                    <option value="grp-3.2">3.2 - Despesas Administrativas (Devedora)</option>
                    <option value="grp-3.4">3.4 - Despesas Gerais Operacionais (Devedora)</option>
                    <option value="grp-3.3">3.3 - Despesas Comerciais e Marketing (Devedora)</option>
                  </optgroup>
                  <optgroup label="💵 4. RESULTADO FINANCEIRO">
                    <option value="grp-4.1">4.1 - Receitas Financeiras (Juros / Rendimentos) (Credora)</option>
                    <option value="grp-4.2">4.2 - Despesas Financeiras & Tarifas (Devedora)</option>
                  </optgroup>
                  <optgroup label="🏛️ 5. TRIBUTOS SOBRE LUCRO">
                    <option value="grp-5">5.1 - Tributos sobre o Lucro - IRPJ / CSLL (Devedora)</option>
                  </optgroup>
                  <optgroup label="💼 6. ATIVOS & INVESTIMENTOS (BALANÇO PATRIMONIAL)">
                    <option value="grp-6">6.1 - Ativos, Equipamentos e Investimentos</option>
                  </optgroup>
                  <optgroup label="🤝 7. SÓCIOS & FINANCIAMENTOS (BALANÇO PATRIMONIAL)">
                    <option value="grp-7">7.1 - Empréstimos, Aportes e Distribuição de Lucros</option>
                  </optgroup>
                  <optgroup label="📑 8. CONTROLES ESPECÍFICOS">
                    <option value="grp-8">8.1 - Controles Específicos & Transitórias</option>
                  </optgroup>
                </PremiumSelect>
                <p className="text-[10px] text-slate-500 mt-1">
                  Ao trocar a categoria mãe, o código e as regras da DRE são recalculados automaticamente para a posição correta.
                </p>
              </div>

              {/* Linha com Código Estrutural e Natureza */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Código Estrutural *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 3.2.10"
                    value={formData.code || ''}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 font-mono font-bold focus:border-amber-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">
                    Natureza Operacional
                  </label>
                  <PremiumSelect
                    value={formData.nature || 'DESPESA_ADMINISTRATIVA'}
                    onChange={e => setFormData({ ...formData, nature: e.target.value as any })}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 focus:border-amber-500 focus:outline-hidden"
                  >
                    <option value="RECEITA_SERVICO">Receita de Serviços (Credora)</option>
                    <option value="DEDUCAO_RECEITA">Dedução da Receita (Devedora)</option>
                    <option value="CUSTO_SERVICO">Custo dos Serviços (Devedora)</option>
                    <option value="DESPESA_PESSOAL">Despesa com Pessoal (Devedora)</option>
                    <option value="DESPESA_ADMINISTRATIVA">Despesa Administrativa (Devedora)</option>
                    <option value="DESPESA_OPERACIONAL">Despesa Geral Operacional (Devedora)</option>
                    <option value="DESPESA_COMERCIAL">Despesa Comercial (Devedora)</option>
                    <option value="RECEITA_FINANCEIRA">Receita Financeira (Credora)</option>
                    <option value="DESPESA_FINANCEIRA">Despesa Financeira (Devedora)</option>
                    <option value="TRIBUTO_LUCRO">Tributo sobre o Lucro (Devedora)</option>
                    <option value="INVESTIMENTO_ATIVO">Ativo / Investimento (Patrimonial)</option>
                    <option value="FINANCIAMENTO_SOCIO">Financiamento / Sócio (Patrimonial)</option>
                    <option value="CONTROLE_ESPECIFICO">Controle Específico</option>
                  </PremiumSelect>
                </div>
              </div>

              {/* Descrição da Conta com Title Case Inteligente */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-medium text-[var(--text-secondary)]">
                    Nome / Descrição da Conta *
                  </label>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    Auto-formatação (Title Case inteligente)
                  </span>
                </div>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  placeholder="Ex: Licenças de Softwares e Serviços de TI"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  onBlur={e => {
                    const formatted = formatAccountDescription(e.target.value);
                    if (formatted && formatted !== e.target.value) {
                      setFormData(prev => ({ ...prev, name: formatted }));
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-2 font-medium focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Indicador de Encaixe e Vínculo DRE */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-700 dark:text-amber-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div className="text-[11px] leading-relaxed">
                  Conta configurada para encaixe sob o grupo <strong>{formData.code?.substring(0, formData.code?.lastIndexOf('.')) || '3.2'}</strong> com vínculo à linha <strong>{formData.dreLineMapping || 'DRE'}</strong>.
                </div>
              </div>

              {/* Checkbox Sintética */}
              <div className="flex items-center pt-1">
                <label className="flex items-center space-x-2 text-[var(--text-primary)] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.isSynthetic)}
                    onChange={e => setFormData({ ...formData, isSynthetic: e.target.checked })}
                    className="rounded border-[var(--border-subtle)] text-amber-500 focus:ring-amber-500"
                  />
                  <span>Conta Sintética de Agrupamento (Pasta totalizadora, sem lançamentos diretos)</span>
                </label>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-xs cursor-pointer transition-colors"
                >
                  {editingAccount ? 'Salvar Alterações' : creationContext.mode === 'CLONE' ? 'Concluir Clonagem' : 'Criar Conta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Renumeração Global e Alinhamento DRE */}
      {isRenumberModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--border-subtle)] p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-500">
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30">
                <Wand2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  Renumerar & Alinhar com DRE
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Alinhamento estratégico do plano de contas
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-[var(--text-secondary)] leading-relaxed space-y-2">
              <p>
                Esta ação irá percorrer todas as contas analíticas e garantir que cada uma siga rigorosamente a numeração sequencial do seu grupo DRE:
              </p>
              <ul className="list-disc pl-4 space-y-1 font-mono text-[11px] text-[var(--text-primary)]">
                <li>1.1.01..N - Receitas de Serviços</li>
                <li>1.2.01..N - Deduções e Tributos</li>
                <li>2.1.01..N - Custos dos Serviços</li>
                <li>3.1.01..N - Despesas com Pessoal</li>
                <li>3.2.01..N - Despesas Administrativas</li>
                <li>3.3.01..N - Despesas Comerciais</li>
                <li>3.4.01..N - Despesas Gerais Operacionais</li>
                <li>4.1/4.2 - Resultado Financeiro</li>
                <li>6.1 - Ativos & Investimentos</li>
              </ul>
              <p className="text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                ✓ Seus lançamentos financeiros existentes e relatórios permanecerão 100% íntegros (vínculos preservados pelo identificador único).
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsRenumberModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteGlobalRenumber}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs cursor-pointer transition-colors"
              >
                Confirmar Renumeração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
