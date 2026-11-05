import React, { useState, useMemo } from 'react';
import { X, FolderPlus, PlusCircle, Check, AlertCircle } from 'lucide-react';
import { ChartAccount, OperationNature, CashFlowCategory } from '../../types';
import { storage } from '../../services/storageService';
import { calculateNextChildCode } from '../../services/chartOfAccountsEngine';
import { formatAccountDescription } from '../Config/ChartOfAccountsView';
import { PremiumSelect } from '../Common/PremiumSelect';

interface QuickCreateAccountModalProps {
  isOpen: boolean;
  defaultNature?: OperationNature;
  titleType?: 'PAGAR' | 'RECEBER';
  onClose: () => void;
  onAccountCreated: (newAccount: ChartAccount) => void;
}

export const QuickCreateAccountModal: React.FC<QuickCreateAccountModalProps> = ({
  isOpen,
  defaultNature,
  titleType = 'PAGAR',
  onClose,
  onAccountCreated
}) => {
  const [mode, setMode] = useState<'SUBCATEGORIA' | 'CATEGORIA'>('SUBCATEGORIA');
  const [parentAccountId, setParentAccountId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [nature, setNature] = useState<OperationNature>(
    defaultNature || (titleType === 'RECEBER' ? 'RECEITA_SERVICO' : 'DESPESA_ADMINISTRATIVA')
  );
  const [dreLine, setDreLine] = useState(titleType === 'RECEBER' ? 'RECEITA_BRUTA' : 'DESPESAS_OPERACIONAIS');
  const [cashFlowCategory, setCashFlowCategory] = useState<CashFlowCategory>('OPERACIONAL');
  const [errorMessage, setErrorMessage] = useState('');

  const allAccounts = useMemo(() => storage.getChartAccounts(), [isOpen]);

  // Contas sintéticas para servirem de Categoria Mãe
  const syntheticAccounts = useMemo(() => {
    return allAccounts.filter(a => !a.isAnalytical || a.isSynthetic);
  }, [allAccounts]);

  // Filtrar categorias mãe mais pertinentes ao contexto (despesas para pagar, receitas para receber)
  const filteredParents = useMemo(() => {
    if (titleType === 'RECEBER') {
      const rec = syntheticAccounts.filter(a => a.code.startsWith('1') || a.nature.startsWith('RECEITA'));
      return rec.length > 0 ? rec : syntheticAccounts;
    } else {
      const exp = syntheticAccounts.filter(a => a.code.startsWith('2') || a.code.startsWith('3') || a.code.startsWith('4') || a.code.startsWith('5') || a.nature.startsWith('DESPESA') || a.nature.startsWith('CUSTO'));
      return exp.length > 0 ? exp : syntheticAccounts;
    }
  }, [syntheticAccounts, titleType]);

  // Ao selecionar a categoria mãe, gerar automaticamente uma sugestão de código sequencial
  const handleSelectParent = (parentId: string) => {
    setParentAccountId(parentId);
    const parent = allAccounts.find(a => a.id === parentId);
    if (parent) {
      if (parent.nature) setNature(parent.nature);
      if (parent.dremap?.line) setDreLine(parent.dremap.line);
      if (parent.cashFlowCategory) setCashFlowCategory(parent.cashFlowCategory);

      // Calcular próximo código com precisão hierárquica
      const nextCode = calculateNextChildCode(parent.code, allAccounts);
      setAccountCode(nextCode);
    }
  };

  // Inicializar com o primeiro pai caso vazio
  React.useEffect(() => {
    if (isOpen && !parentAccountId && filteredParents.length > 0) {
      handleSelectParent(filteredParents[0].id);
    }
  }, [isOpen, filteredParents, parentAccountId]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!accountName.trim()) {
      setErrorMessage('Informe o nome da conta contábil.');
      return;
    }
    if (!accountCode.trim()) {
      setErrorMessage('Informe o código da conta.');
      return;
    }

    // Validar se código já existe
    const codeExists = allAccounts.some(a => a.code.trim() === accountCode.trim());
    if (codeExists) {
      setErrorMessage(`O código contábil "${accountCode}" já está em uso por outra conta.`);
      return;
    }

    const isSub = mode === 'SUBCATEGORIA';
    const newId = `acc-${Date.now()}`;
    const formattedName = formatAccountDescription(accountName.trim());
    const newAccount: ChartAccount = {
      id: newId,
      code: accountCode.trim(),
      name: formattedName,
      parentId: isSub ? (parentAccountId || null) : null,
      nature,
      dremap: {
        include: true,
        line: dreLine,
        multiplier: titleType === 'RECEBER' ? 1 : -1
      },
      cashFlowCategory,
      isAnalytical: isSub, // Se for subcategoria, é analítica para receber lançamentos
      isSynthetic: !isSub,
      isActive: true,
      status: 'ATIVO',
      dreLineMapping: dreLine
    };

    const updated = [...allAccounts, newAccount];
    storage.saveChartAccounts(updated);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CRIACAO_PLANO_CONTAS_RAPIDO',
      module: 'Plano de Contas',
      recordId: newAccount.id,
      details: `Criação rápida de ${isSub ? 'subcategoria analítica' : 'categoria sintética'} ${newAccount.code} - ${newAccount.name} via tela de lançamentos.`
    });

    onAccountCreated(newAccount);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        
        {/* Header com estilo Magic Board */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-amber-500/30 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
              <FolderPlus className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Nova Conta no Plano de Contas
              </h3>
              <p className="text-xs text-slate-300">
                Cadastre a categoria ou subcategoria sem perder seu lançamento
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas de Modo */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setMode('SUBCATEGORIA')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              mode === 'SUBCATEGORIA'
                ? 'border-amber-500 text-amber-500 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Subcategoria Analítica (Recebe Lançamentos)
          </button>
          <button
            type="button"
            onClick={() => setMode('CATEGORIA')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              mode === 'CATEGORIA'
                ? 'border-amber-500 text-amber-500 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <FolderPlus className="w-4 h-4" />
            Nova Categoria Mãe (Sintética)
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          {mode === 'SUBCATEGORIA' ? (
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Categoria Principal (Mãe) *
              </label>
              <PremiumSelect
                value={parentAccountId}
                onChange={(e) => handleSelectParent(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                required
              >
                <option value="">Selecione o grupo/categoria pai...</option>
                {filteredParents.map(parent => (
                  <option key={parent.id} value={parent.id}>
                    {parent.code} - {parent.name}
                  </option>
                ))}
              </PremiumSelect>
              <p className="text-[11px] text-slate-500 mt-1">
                A nova subcategoria herdará a classificação DRE e o fluxo de caixa do grupo.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
              Criando uma nova categoria agrupadora no topo da árvore. Subcategorias analíticas poderão ser associadas a ela posteriormente.
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block font-semibold text-slate-700 mb-1">
                Código Contábil *
              </label>
              <input
                type="text"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                placeholder="Ex: 4.1.15"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono font-bold text-slate-800 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                required
              />
            </div>

            <div className="col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Nome da {mode === 'SUBCATEGORIA' ? 'Subcategoria' : 'Categoria'} *
              </label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={mode === 'SUBCATEGORIA' ? 'Ex: Softwares e Ferramentas de TI' : 'Ex: DESPESAS COM TECNOLOGIA'}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Natureza Operacional
              </label>
              <PremiumSelect
                value={nature}
                onChange={(e) => setNature(e.target.value as OperationNature)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                {titleType === 'RECEBER' ? (
                  <>
                    <option value="RECEITA_SERVICO">Receita de Serviços</option>
                    <option value="RECEITA_FINANCEIRA">Receita Financeira</option>
                    <option value="OUTRA_RECEITA">Outra Receita Operacional</option>
                  </>
                ) : (
                  <>
                    <option value="CUSTO_SERVICO">Custo de Serviço / Produção (CSP/CPV)</option>
                    <option value="DESPESA_ADMINISTRATIVA">Despesa Administrativa</option>
                    <option value="DESPESA_COMERCIAL">Despesa Comercial / Vendas</option>
                    <option value="DESPESA_OPERACIONAL">Despesa Operacional</option>
                    <option value="DESPESA_PESSOAL">Despesa com Pessoal / Folha</option>
                    <option value="DESPESA_FINANCEIRA">Despesa Financeira / Juros</option>
                    <option value="DEDUCAO_RECEITA">Dedução de Receita / Impostos sobre Venda</option>
                    <option value="TRIBUTO_LUCRO">Tributo sobre o Lucro (IRPJ / CSLL)</option>
                    <option value="INVESTIMENTO_ATIVO">Investimento / Imobilizado</option>
                  </>
                )}
              </PremiumSelect>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Fluxo de Caixa
              </label>
              <PremiumSelect
                value={cashFlowCategory}
                onChange={(e) => setCashFlowCategory(e.target.value as CashFlowCategory)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs bg-white"
              >
                <option value="OPERACIONAL">Operacional</option>
                <option value="INVESTIMENTO">Investimento</option>
                <option value="FINANCIAMENTO">Financiamento</option>
              </PremiumSelect>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[11px] text-slate-600">
            <span>Esta conta ficará ativa e pronta para uso imediato no lançamento.</span>
            <span className="font-semibold text-emerald-700 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Ativa
            </span>
          </div>

          {/* Rodapé */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              Salvar e Selecionar
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
