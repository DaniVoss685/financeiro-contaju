import React, { useState, useMemo } from 'react';
import { 
  X, 
  Settings2, 
  Plus, 
  Trash2, 
  Check, 
  Edit2, 
  Play, 
  Sparkles, 
  Sliders, 
  HelpCircle, 
  CheckCircle2, 
  AlertCircle,
  Tag,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  FolderOpen
} from 'lucide-react';
import { 
  ReconciliationRule, 
  ReconciliationRuleMatchType, 
  ReconciliationRuleAction, 
  ReconciliationRuleTransactionType,
  BankStatementEntry,
  ChartAccount,
  Counterparty,
  User
} from '../../types';
import { storage } from '../../services/storageService';
import { testRuleAgainstStatements, applyReconciliationRules } from '../../services/reconciliationRulesService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';

interface ReconciliationRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccountId?: string;
  bankAccountName?: string;
  statementEntries?: BankStatementEntry[];
  chartAccounts?: ChartAccount[];
  counterparties?: Counterparty[];
  currentUser?: User;
  presetPattern?: string;
  selectedBankAccountId?: string;
  onRulesApplied?: (summary: { reconciledCount: number; suggestedCount: number }) => void;
}

export const ReconciliationRulesModal: React.FC<ReconciliationRulesModalProps> = ({
  isOpen,
  onClose,
  bankAccountId,
  bankAccountName = 'Conta Bancária',
  statementEntries = [],
  chartAccounts = [],
  counterparties = [],
  currentUser,
  presetPattern,
  selectedBankAccountId,
  onRulesApplied
}) => {
  const effectiveBankAccountId = bankAccountId || selectedBankAccountId || '';
  const effectiveUser = currentUser || storage.getCurrentUser();

  const effectiveChartAccounts = useMemo(() => {
    return (chartAccounts && chartAccounts.length > 0) ? chartAccounts : storage.getChartAccounts();
  }, [chartAccounts]);

  const effectiveCounterparties = useMemo(() => {
    return (counterparties && counterparties.length > 0) ? counterparties : storage.getCounterparties();
  }, [counterparties]);

  const effectiveStatements = useMemo(() => {
    if (statementEntries && statementEntries.length > 0) return statementEntries;
    const all = storage.getStatementEntries();
    return effectiveBankAccountId ? all.filter(s => s.bankAccountId === effectiveBankAccountId) : all;
  }, [statementEntries, effectiveBankAccountId]);

  const [rules, setRules] = useState<ReconciliationRule[]>(() => storage.getReconciliationRules());
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  React.useEffect(() => {
    if (presetPattern && presetPattern.trim()) {
      handleStartNewRule(presetPattern.trim());
    }
  }, [presetPattern]);

  // Form State
  const [formName, setFormName] = useState('');
  const [formPattern, setFormPattern] = useState('');
  const [formMatchType, setFormMatchType] = useState<ReconciliationRuleMatchType>('CONTAINS');
  const [formTransactionType, setFormTransactionType] = useState<ReconciliationRuleTransactionType>('DEBIT');
  const [formChartAccountId, setFormChartAccountId] = useState('');
  const [formCounterpartyId, setFormCounterpartyId] = useState('');
  const [formAction, setFormAction] = useState<ReconciliationRuleAction>('AUTO_CREATE_AND_RECONCILE');
  const [formDescriptionTemplate, setFormDescriptionTemplate] = useState('');
  const [formPriority, setFormPriority] = useState<number>(1);
  const [formActive, setFormActive] = useState(true);

  // Analytical Chart of Accounts
  const analyticalAccounts = useMemo(() => {
    return effectiveChartAccounts.filter(a => a.isAnalytical && a.isActive);
  }, [effectiveChartAccounts]);

  const expenseAccounts = useMemo(() => {
    return analyticalAccounts.filter(a => a.nature?.includes('DESPESA') || a.code.startsWith('2') || a.code.startsWith('4'));
  }, [analyticalAccounts]);

  const revenueAccounts = useMemo(() => {
    return analyticalAccounts.filter(a => a.nature?.includes('RECEITA') || a.code.startsWith('1'));
  }, [analyticalAccounts]);

  // Live test preview of current draft rule
  const liveTestResult = useMemo(() => {
    if (!formPattern.trim()) return { matchingCount: 0, matchedSamples: [] };
    const draftRule: ReconciliationRule = {
      id: 'draft',
      name: formName,
      pattern: formPattern,
      matchType: formMatchType,
      transactionType: formTransactionType,
      chartAccountId: formChartAccountId,
      counterpartyId: formCounterpartyId,
      action: formAction,
      active: true,
      priority: formPriority,
      createdAt: '',
      updatedAt: ''
    };
    return testRuleAgainstStatements(draftRule, effectiveStatements);
  }, [formPattern, formMatchType, formTransactionType, formChartAccountId, formCounterpartyId, formAction, formPriority, effectiveStatements]);

  // Load Rule into Editor
  const handleEditRule = (rule: ReconciliationRule) => {
    setSelectedRuleId(rule.id);
    setFormName(rule.name);
    setFormPattern(rule.pattern);
    setFormMatchType(rule.matchType);
    setFormTransactionType(rule.transactionType);
    setFormChartAccountId(rule.chartAccountId);
    setFormCounterpartyId(rule.counterpartyId || '');
    setFormAction(rule.action);
    setFormDescriptionTemplate(rule.descriptionTemplate || '');
    setFormPriority(rule.priority || 1);
    setFormActive(rule.active);
    setIsEditing(true);
  };

  const handleStartNewRule = (defaultPattern?: string) => {
    setSelectedRuleId(null);
    setFormName(defaultPattern ? `Regra para "${defaultPattern}"` : '');
    setFormPattern(defaultPattern || '');
    setFormMatchType('CONTAINS');
    setFormTransactionType('DEBIT');
    setFormChartAccountId(expenseAccounts[0]?.id || analyticalAccounts[0]?.id || '');
    setFormCounterpartyId('');
    setFormAction('AUTO_CREATE_AND_RECONCILE');
    setFormDescriptionTemplate('');
    setFormPriority(rules.length + 1);
    setFormActive(true);
    setIsEditing(true);
  };

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPattern.trim() || !formChartAccountId) {
      alert('Preencha os campos obrigatórios: Nome da Regra, Padrão do Descritor e Conta Contábil.');
      return;
    }

    if (selectedRuleId) {
      // Update
      storage.updateReconciliationRule(selectedRuleId, {
        name: formName.trim(),
        pattern: formPattern.trim(),
        matchType: formMatchType,
        transactionType: formTransactionType,
        chartAccountId: formChartAccountId,
        counterpartyId: formCounterpartyId || undefined,
        action: formAction,
        descriptionTemplate: formDescriptionTemplate.trim() || undefined,
        priority: formPriority,
        active: formActive
      });
      setFeedbackBanner({
        type: 'success',
        message: `Regra "${formName}" atualizada com sucesso!`
      });
    } else {
      // Add
      const newRule: ReconciliationRule = {
        id: `rule-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        name: formName.trim(),
        pattern: formPattern.trim(),
        matchType: formMatchType,
        transactionType: formTransactionType,
        chartAccountId: formChartAccountId,
        counterpartyId: formCounterpartyId || undefined,
        action: formAction,
        descriptionTemplate: formDescriptionTemplate.trim() || undefined,
        priority: formPriority,
        active: formActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      storage.addReconciliationRule(newRule);
      setFeedbackBanner({
        type: 'success',
        message: `Nova regra "${formName}" cadastrada com sucesso!`
      });
    }

    setRules(storage.getReconciliationRules());
    setIsEditing(false);
    setSelectedRuleId(null);
  };

  const handleToggleActive = (ruleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    storage.toggleReconciliationRule(ruleId);
    setRules(storage.getReconciliationRules());
  };

  const handleDeleteRule = (ruleId: string, ruleName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Deseja realmente excluir a regra de conciliação "${ruleName}"?`)) {
      storage.deleteReconciliationRule(ruleId);
      setRules(storage.getReconciliationRules());
      if (selectedRuleId === ruleId) {
        setIsEditing(false);
        setSelectedRuleId(null);
      }
      setFeedbackBanner({
        type: 'info',
        message: `Regra "${ruleName}" excluída com sucesso.`
      });
    }
  };

  const handleExecuteAllRulesNow = () => {
    const res = applyReconciliationRules(effectiveBankAccountId, effectiveUser);
    setRules(storage.getReconciliationRules());
    setFeedbackBanner({
      type: 'success',
      message: `Regras executadas! ${res.reconciledCount} lançamentos conciliados automaticamente e ${res.suggestedCount} sugestões categorizadas.`
    });
    if (onRulesApplied) {
      onRulesApplied({
        reconciledCount: res.reconciledCount,
        suggestedCount: res.suggestedCount
      });
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter(r => {
      if (filterType === 'DEBIT') return r.transactionType === 'DEBIT';
      if (filterType === 'CREDIT') return r.transactionType === 'CREDIT';
      return true;
    });
  }, [rules, filterType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-900 dark:text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/15 rounded-xl border border-amber-500/30 text-amber-600 dark:text-amber-400">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  Regras de Conciliação Automática (De-Para)
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                  {rules.length} regras ativas
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Mapeie termos do extrato bancário para categorias contábeis e elimine lançamentos manuais repetitivos.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExecuteAllRulesNow}
              className="hidden sm:flex items-center px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              title="Executar regras no extrato atual da conta"
            >
              <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
              Executar Regras no Extrato
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {feedbackBanner && (
          <div className={`px-5 py-2.5 text-xs font-medium flex items-center justify-between border-b ${
            feedbackBanner.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800'
          }`}>
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{feedbackBanner.message}</span>
            </div>
            <button 
              onClick={() => setFeedbackBanner(null)}
              className="text-xs opacity-75 hover:opacity-100 underline ml-2"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Main Body: 2 Columns (Left: Rules List, Right: Form or Preview) */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-[#26262b]">
          
          {/* COLUNA ESQUERDA: LISTA DE REGRAS (5 colunas) */}
          <div className="lg:col-span-5 flex flex-col h-full overflow-hidden bg-slate-50/50 dark:bg-[#0b0b0d]">
            
            {/* Toolbar da lista */}
            <div className="p-3 border-b border-slate-200 dark:border-[#26262b] flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setFilterType('ALL')}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-colors ${
                    filterType === 'ALL'
                      ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Todas ({rules.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('DEBIT')}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-colors ${
                    filterType === 'DEBIT'
                      ? 'bg-rose-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Débitos
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('CREDIT')}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition-colors ${
                    filterType === 'CREDIT'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  Créditos
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleStartNewRule()}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-xs flex items-center transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nova Regra
              </button>
            </div>

            {/* Lista rolável */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
              {filteredRules.length === 0 ? (
                <div className="text-center py-10 px-4 text-slate-500 dark:text-slate-400 text-xs space-y-2">
                  <Sliders className="w-8 h-8 mx-auto text-slate-400 opacity-60" />
                  <p>Nenhuma regra cadastrada neste filtro.</p>
                  <button
                    type="button"
                    onClick={() => handleStartNewRule()}
                    className="text-amber-600 dark:text-amber-400 font-bold hover:underline"
                  >
                    Clique aqui para criar a primeira regra
                  </button>
                </div>
              ) : (
                filteredRules.map(rule => {
                  const targetAcc = chartAccounts.find(a => a.id === rule.chartAccountId);
                  const isSelected = isEditing && selectedRuleId === rule.id;

                  return (
                    <div
                      key={rule.id}
                      onClick={() => handleEditRule(rule)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-2 ring-amber-500/30' 
                          : rule.active 
                            ? 'bg-white dark:bg-[#17171b] border-slate-200 dark:border-[#26262b] hover:border-slate-300 dark:hover:border-slate-700 shadow-2xs' 
                            : 'bg-slate-100/70 dark:bg-[#131316] border-slate-200 dark:border-[#26262b] opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            rule.transactionType === 'DEBIT' 
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' 
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          }`}>
                            {rule.transactionType === 'DEBIT' ? 'DÉBITO (-)' : 'CRÉDITO (+)'}
                          </span>
                          <span className="text-xs font-bold truncate max-w-[200px]">
                            {rule.name}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleToggleActive(rule.id, e)}
                            className={`w-7 h-4 rounded-full transition-colors relative flex items-center px-0.5 ${
                              rule.active ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                            title={rule.active ? 'Desativar regra' : 'Ativar regra'}
                          >
                            <span className={`w-3 h-3 rounded-full bg-white transition-transform ${
                              rule.active ? 'translate-x-3' : 'translate-x-0'
                            }`} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteRule(rule.id, rule.name, e)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                            title="Excluir regra"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                        <div className="flex items-center space-x-1">
                          <span className="text-slate-500 font-mono text-[10px]">Padrão:</span>
                          <span className="font-mono font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded border border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-300">
                            {rule.pattern} ({rule.matchType})
                          </span>
                        </div>
                        <div className="truncate">
                          <span className="text-slate-500 text-[10px]">Conta: </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{targetAcc ? `${targetAcc.code} - ${targetAcc.name}` : rule.chartAccountId}</span>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-semibold">
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          {rule.action === 'AUTO_CREATE_AND_RECONCILE' ? 'Cria Título & Quita' : 'Apenas Sugere'}
                        </span>
                        <span>Prioridade #{rule.priority || 1}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* COLUNA DIREITA: FORMULÁRIO DE EDIÇÃO OU ADIÇÃO (7 colunas) */}
          <div className="lg:col-span-7 flex flex-col h-full overflow-hidden bg-white dark:bg-[#131316]">
            {isEditing ? (
              <form onSubmit={handleSaveRule} className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                      {selectedRuleId ? 'Editando Regra de Conciliação' : 'Nova Regra de Conciliação'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setSelectedRuleId(null);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scrollbar-thin">
                  
                  {/* Nome da Regra */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nome Identificador da Regra *
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="Ex: Tarifas e Pacotes de Serviços Bancários"
                      required
                      className="w-full bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg px-3 py-2 text-xs font-medium outline-hidden focus:border-amber-500"
                    />
                  </div>

                  {/* Direção e Padrão de Busca */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Natureza da Transação *
                      </label>
                      <PremiumSelect
                        value={formTransactionType}
                        onChange={e => setFormTransactionType(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg px-3 py-2 text-xs font-medium outline-hidden focus:border-amber-500"
                      >
                        <option value="DEBIT">DÉBITO (-) Pagamentos / Tarifas</option>
                        <option value="CREDIT">CRÉDITO (+) Recebimentos / TEDs</option>
                        <option value="BOTH">AMBOS (Débito e Crédito)</option>
                      </PremiumSelect>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Tipo de Correspondência *
                      </label>
                      <PremiumSelect
                        value={formMatchType}
                        onChange={e => setFormMatchType(e.target.value as any)}
                        className="w-full bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg px-3 py-2 text-xs font-medium outline-hidden focus:border-amber-500"
                      >
                        <option value="CONTAINS">Contém o texto (CONTAINS)</option>
                        <option value="STARTS_WITH">Começa com (STARTS_WITH)</option>
                        <option value="EQUALS">Exatamente igual (EQUALS)</option>
                        <option value="REGEX">Expressão Regular (REGEX)</option>
                      </PremiumSelect>
                    </div>
                  </div>

                  {/* Padrão do Descritor Bancário */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Texto do Descritor Bancário Procurado *
                    </label>
                    <input
                      type="text"
                      value={formPattern}
                      onChange={e => setFormPattern(e.target.value)}
                      placeholder="Ex: TARIFA, VIVO, ENEL, ALUGUEL, PIX TRANSF"
                      required
                      className="w-full font-mono bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-400 outline-hidden focus:border-amber-500"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      A regra irá procurar esse termo nas descrições importadas no extrato OFX/CSV.
                    </p>
                  </div>

                  {/* Feedback em Tempo Real sobre o Extrato Atual */}
                  <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b] text-xs">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        Teste em Tempo Real no Extrato Atual:
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        liveTestResult.matchingCount > 0 
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' 
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {liveTestResult.matchingCount} transações encontradas
                      </span>
                    </div>

                    {liveTestResult.matchingCount > 0 ? (
                      <div className="space-y-1 mt-2 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                        {liveTestResult.matchedSamples.map(sample => (
                          <div key={sample.id} className="truncate flex items-center justify-between bg-white dark:bg-[#1E2536] p-1.5 rounded border border-slate-200 dark:border-slate-700">
                            <span className="truncate">{formatDateBR(sample.date)} • {sample.description}</span>
                            <span className={`font-bold ml-2 ${sample.amount < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {formatBRL(sample.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Nenhuma transação do extrato atual corresponde a este padrão no momento. A regra continuará ativa para novos extratos importados.
                      </p>
                    )}
                  </div>

                  {/* Conta Contábil Vinculada */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Conta Contábil do Plano de Contas *
                    </label>
                    <PremiumSelect
                      value={formChartAccountId}
                      onChange={e => setFormChartAccountId(e.target.value)}
                      required
                      className="w-full bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg px-3 py-2 text-xs font-medium outline-hidden focus:border-amber-500"
                    >
                      <option value="">Selecione uma conta analítica...</option>
                      <optgroup label="Despesas Operacionais e Financeiras">
                        {expenseAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Receitas">
                        {revenueAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Demais Contas">
                        {analyticalAccounts.filter(a => !expenseAccounts.includes(a) && !revenueAccounts.includes(a)).map(acc => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </optgroup>
                    </PremiumSelect>
                  </div>

                  {/* Favorecido Opcional */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Favorecido / Fornecedor / Cliente Associado (Opcional)
                    </label>
                    <PremiumSelect
                      value={formCounterpartyId}
                      onChange={e => setFormCounterpartyId(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg px-3 py-2 text-xs font-medium outline-hidden focus:border-amber-500"
                    >
                      <option value="">Nenhum favorecido fixo (adotar padrão contábil)</option>
                      {effectiveCounterparties.map(cp => (
                        <option key={cp.id} value={cp.id}>
                          {cp.name} ({cp.type})
                        </option>
                      ))}
                    </PremiumSelect>
                  </div>

                  {/* Ação da Regra */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Ação ao Identificar a Transação *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className={`p-3 rounded-xl border cursor-pointer text-left transition-all ${
                        formAction === 'AUTO_CREATE_AND_RECONCILE'
                          ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-1 ring-amber-500/30'
                          : 'border-slate-200 dark:border-[#26262b] hover:bg-slate-50 dark:hover:bg-[#17171b]'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="formAction"
                            checked={formAction === 'AUTO_CREATE_AND_RECONCILE'}
                            onChange={() => setFormAction('AUTO_CREATE_AND_RECONCILE')}
                            className="text-amber-500"
                          />
                          <span className="text-xs font-bold">Lançar e Conciliar</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-5">
                          Cria o título no ERP, quita na conta bancária e marca o extrato como conciliação concluída.
                        </p>
                      </label>

                      <label className={`p-3 rounded-xl border cursor-pointer text-left transition-all ${
                        formAction === 'AUTO_SUGGEST'
                          ? 'border-amber-500 bg-amber-500/10 dark:bg-amber-500/15 ring-1 ring-amber-500/30'
                          : 'border-slate-200 dark:border-[#26262b] hover:bg-slate-50 dark:hover:bg-[#17171b]'
                      }`}>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="formAction"
                            checked={formAction === 'AUTO_SUGGEST'}
                            onChange={() => setFormAction('AUTO_SUGGEST')}
                            className="text-amber-500"
                          />
                          <span className="text-xs font-bold">Apenas Sugerir</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-5">
                          Gera a sugestão categorizada para aprovação e conferência manual pelo operador financeiro.
                        </p>
                      </label>
                    </div>
                  </div>

                  {/* Template de Descrição */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Descrição no ERP (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formDescriptionTemplate}
                      onChange={e => setFormDescriptionTemplate(e.target.value)}
                      placeholder="Ex: Tarifa Mensal Conta PJ (use {desc} para incluir texto original)"
                      className="w-full bg-slate-50 dark:bg-[#17171b] border border-slate-300 dark:border-[#26262b] rounded-lg px-3 py-2 text-xs font-medium outline-hidden focus:border-amber-500"
                    />
                  </div>

                </div>

                {/* Footer do Form */}
                <div className="p-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setSelectedRuleId(null);
                    }}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    Descartar Alterações
                  </button>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    {selectedRuleId ? 'Salvar Alterações da Regra' : 'Cadastrar Regra de Conciliação'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-slate-400 space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center">
                  <Sliders className="w-7 h-7" />
                </div>
                <div className="max-w-sm">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Gerenciador de Regras De-Para
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Selecione uma regra à esquerda para editar seus parâmetros ou clique abaixo para criar um novo mapeamento inteligente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleStartNewRule()}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Criar Nova Regra de De-Para
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400 text-center sm:text-left">
            Dica: Regras com ação <strong>"Lançar e Conciliar"</strong> automatizam 100% de tarifas recorrentes, telecomunicações e impostos.
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExecuteAllRulesNow}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Executar Regras no Extrato Agora
            </button>
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg font-semibold transition-colors"
            >
              Concluir
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
