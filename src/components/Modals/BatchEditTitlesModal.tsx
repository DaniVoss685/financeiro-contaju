import React, { useState } from 'react';
import { X, Layers, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { FinancialTitle } from '../../types';
import { storage } from '../../services/storageService';
import { getFilteredChartAccounts, formatChartAccountSelectOptions } from '../../services/financialEngine';
import { SearchableSelect, SelectOption } from '../Common/SearchableSelect';
import { DateField, MonthField } from '../Common/DateField';

interface BatchEditTitlesModalProps {
  isOpen: boolean;
  selectedTitleIds: string[];
  type: 'RECEBER' | 'PAGAR';
  onClose: () => void;
  onSaved: () => void;
}

export const BatchEditTitlesModal: React.FC<BatchEditTitlesModalProps> = ({
  isOpen,
  selectedTitleIds,
  type,
  onClose,
  onSaved
}) => {
  const [enableCompetence, setEnableCompetence] = useState(false);
  const [competence, setCompetence] = useState('');

  const [enableDueDate, setEnableDueDate] = useState(false);
  const [dueDateMode, setDueDateMode] = useState<'FIXED' | 'POSTPONE'>('FIXED');
  const [newDueDate, setNewDueDate] = useState('');
  const [postponeDays, setPostponeDays] = useState<number>(30);

  const [enableAccount, setEnableAccount] = useState(false);
  const [accountId, setAccountId] = useState('');

  const [enableBank, setEnableBank] = useState(false);
  const [expectedBankAccountId, setExpectedBankAccountId] = useState('');

  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || selectedTitleIds.length === 0) return null;

  const allChartAccounts = storage.getChartAccounts();
  const chartAccounts = getFilteredChartAccounts(allChartAccounts, type);
  const bankAccounts = storage.getBankAccounts().filter(a => a.status === 'ATIVO');

  const chartAccountOptions: SelectOption[] = formatChartAccountSelectOptions(chartAccounts);

  const bankAccountOptions: SelectOption[] = [
    { value: '', label: 'Indiferente / Não definida' },
    ...bankAccounts.map(b => ({
      value: b.id,
      label: b.name,
      sublabel: b.institution
    }))
  ];

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!enableCompetence && !enableDueDate && !enableAccount && !enableBank) {
      setErrorMessage('Selecione ao menos um campo para alterar em massa.');
      return;
    }

    if (enableCompetence && !competence) {
      setErrorMessage('Informe a nova competência.');
      return;
    }

    if (enableDueDate && dueDateMode === 'FIXED' && !newDueDate) {
      setErrorMessage('Informe a nova data de vencimento.');
      return;
    }

    if (enableAccount && !accountId) {
      setErrorMessage('Selecione a conta analítica do plano de contas.');
      return;
    }

    const titles = storage.getTitles();
    const setIds = new Set(selectedTitleIds);
    let updatedCount = 0;

    const updated = titles.map(t => {
      if (!setIds.has(t.id)) return t;

      const updates: Partial<FinancialTitle> = {};

      if (enableCompetence && competence) {
        updates.competence = competence;
      }

      if (enableDueDate) {
        if (dueDateMode === 'FIXED' && newDueDate) {
          updates.dueDate = newDueDate;
          updates.expectedCashDate = newDueDate;
        } else if (dueDateMode === 'POSTPONE' && postponeDays) {
          const parts = t.dueDate.split('-').map(Number);
          const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
          dateObj.setDate(dateObj.getDate() + postponeDays);
          const nextY = dateObj.getFullYear();
          const nextM = String(dateObj.getMonth() + 1).padStart(2, '0');
          const nextD = String(dateObj.getDate()).padStart(2, '0');
          const finalDate = `${nextY}-${nextM}-${nextD}`;
          updates.dueDate = finalDate;
          updates.expectedCashDate = finalDate;
        }
      }

      if (enableAccount && accountId) {
        updates.accountId = accountId;
      }

      if (enableBank) {
        updates.expectedBankAccountId = expectedBankAccountId || undefined;
      }

      updatedCount++;
      return {
        ...t,
        ...updates,
        updatedAt: new Date().toISOString()
      };
    });

    storage.saveTitles(updated);

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'ALTERACAO_EM_MASSA_TITULOS',
      module: type === 'RECEBER' ? 'Contas a Receber' : 'Contas a Pagar',
      recordId: `batch-${selectedTitleIds.length}`,
      details: `Alteração em lote aplicada a ${updatedCount} lançamentos.`
    });

    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-amber-500/30 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Alteração em Massa ({selectedTitleIds.length} selecionados)
              </h2>
              <p className="text-[11px] text-slate-300">
                Escolha os campos que deseja alterar simultaneamente nos títulos selecionados.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleApply} className="p-6 space-y-4 text-xs">
          
          {/* Opção: Competência */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={enableCompetence}
                  onChange={(e) => setEnableCompetence(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <span>Alterar Competência de Todos</span>
              </label>
            </div>
            {enableCompetence && (
              <div className="pt-2 pl-6">
                <MonthField
                  value={competence}
                  onChange={(e) => setCompetence(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white w-full"
                  required={enableCompetence}
                />
              </div>
            )}
          </div>

          {/* Opção: Vencimento */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={enableDueDate}
                  onChange={(e) => setEnableDueDate(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <span>Alterar Data de Vencimento</span>
              </label>
            </div>
            {enableDueDate && (
              <div className="pt-2 pl-6 space-y-2">
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="dueDateMode"
                      checked={dueDateMode === 'FIXED'}
                      onChange={() => setDueDateMode('FIXED')}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                    <span>Data Fixa</span>
                  </label>
                  <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700">
                    <input
                      type="radio"
                      name="dueDateMode"
                      checked={dueDateMode === 'POSTPONE'}
                      onChange={() => setDueDateMode('POSTPONE')}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                    <span>Postergar Dias (+X dias)</span>
                  </label>
                </div>

                {dueDateMode === 'FIXED' ? (
                  <DateField
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white w-full"
                    required={enableDueDate && dueDateMode === 'FIXED'}
                  />
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-600">Adicionar</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={postponeDays}
                      onChange={(e) => setPostponeDays(parseInt(e.target.value) || 0)}
                      className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white text-center font-bold"
                    />
                    <span className="text-slate-600">dias ao vencimento atual de cada um</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Opção: Categoria / Plano de Contas */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={enableAccount}
                  onChange={(e) => setEnableAccount(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <span>
                  Alterar Classificação Contábil ({type === 'RECEBER' ? 'Apenas Receitas' : 'Apenas Custos & Despesas'})
                </span>
              </label>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                type === 'RECEBER' 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {type === 'RECEBER' ? 'Receitas' : 'Custos & Despesas'}
              </span>
            </div>
            {enableAccount && (
              <div className="pt-2 pl-6">
                <SearchableSelect
                  options={chartAccountOptions}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder={type === 'RECEBER' ? "Selecione nova conta de receita..." : "Selecione nova conta de custos/despesas..."}
                  searchPlaceholder="Buscar conta analítica..."
                  required={enableAccount}
                />
              </div>
            )}
          </div>

          {/* Opção: Banco Previsto */}
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={enableBank}
                  onChange={(e) => setEnableBank(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-amber-500"
                />
                <span>Alterar Conta Bancária Prevista</span>
              </label>
            </div>
            {enableBank && (
              <div className="pt-2 pl-6">
                <SearchableSelect
                  options={bankAccountOptions}
                  value={expectedBankAccountId}
                  onChange={setExpectedBankAccountId}
                  placeholder="Selecione o banco previsto..."
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition-colors flex items-center cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              Aplicar em {selectedTitleIds.length} Títulos
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
