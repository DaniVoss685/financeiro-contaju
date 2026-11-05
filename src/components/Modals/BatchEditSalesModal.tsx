import React, { useState } from 'react';
import { X, Layers, Calendar, CheckCircle2, AlertCircle, User, Tag, FileText, Check, DollarSign, Info } from 'lucide-react';
import { Sale, SaleItem } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR, formatCompetence, getFilteredChartAccounts, formatChartAccountSelectOptions } from '../../services/financialEngine';
import { SearchableSelect, SelectOption } from '../Common/SearchableSelect';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField, MonthField } from '../Common/DateField';

interface BatchEditSalesModalProps {
  isOpen: boolean;
  selectedSaleIds: string[];
  sales: Sale[];
  onClose: () => void;
  onSaved: (count: number) => void;
}

export const BatchEditSalesModal: React.FC<BatchEditSalesModalProps> = ({
  isOpen,
  selectedSaleIds,
  sales,
  onClose,
  onSaved
}) => {
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = today.substring(0, 7);

  // Campos habilitados para alteração em lote
  const [enableCustomer, setEnableCustomer] = useState(false);
  const [customerId, setCustomerId] = useState('');

  const [enableDescription, setEnableDescription] = useState(false);
  const [description, setDescription] = useState('');

  const [enableAccount, setEnableAccount] = useState(false);
  const [accountId, setAccountId] = useState('');

  const [enableDate, setEnableDate] = useState(false);
  const [date, setDate] = useState(today);

  const [enableCompetence, setEnableCompetence] = useState(false);
  const [competence, setCompetence] = useState(currentMonth);

  const [enableStatus, setEnableStatus] = useState(false);
  const [status, setStatus] = useState<'CONFIRMADA' | 'CANCELADA'>('CONFIRMADA');

  const [enableNotes, setEnableNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const [syncLinkedTitles, setSyncLinkedTitles] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  if (!isOpen || selectedSaleIds.length === 0) return null;

  const targetSales = sales.filter(s => selectedSaleIds.includes(s.id));
  const counterparties = storage.getCounterparties().filter(c => c.type === 'CLIENTE' || c.type === 'AMBOS');
  const allChartAccounts = storage.getChartAccounts();
  const analyticalRevenueAccounts = allChartAccounts.filter(
    a => a.isAnalytical && a.isActive && (a.nature === 'RECEITA_SERVICO' || a.code.startsWith('1'))
  );

  const customerOptions: SelectOption[] = counterparties.map(c => ({
    value: c.id,
    label: c.name,
    sublabel: c.document ? `Doc: ${c.document}` : undefined
  }));

  const chartAccountOptions: SelectOption[] = formatChartAccountSelectOptions(analyticalRevenueAccounts);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (
      !enableCustomer &&
      !enableDescription &&
      !enableAccount &&
      !enableDate &&
      !enableCompetence &&
      !enableStatus &&
      !enableNotes
    ) {
      setErrorMessage('Selecione ao menos um campo para alterar em lote.');
      return;
    }

    if (enableCustomer && !customerId) {
      setErrorMessage('Selecione o novo cliente desejado.');
      return;
    }

    if (enableDescription && !description.trim()) {
      setErrorMessage('Informe a nova descrição do serviço.');
      return;
    }

    if (enableAccount && !accountId) {
      setErrorMessage('Selecione a nova categoria/conta analítica do serviço.');
      return;
    }

    if (enableDate && !date) {
      setErrorMessage('Informe a nova data de emissão.');
      return;
    }

    if (enableCompetence && !competence) {
      setErrorMessage('Informe a nova competência.');
      return;
    }

    const currentUser = storage.getCurrentUser();
    let updatedCount = 0;
    const changedFields: string[] = [];

    if (enableCustomer) changedFields.push('Cliente');
    if (enableDescription) changedFields.push('Descrição do Serviço');
    if (enableAccount) changedFields.push('Categoria/Plano de Contas');
    if (enableDate) changedFields.push('Data de Emissão');
    if (enableCompetence) changedFields.push('Competência');
    if (enableStatus) changedFields.push('Status');
    if (enableNotes) changedFields.push('Observações');

    for (const sale of targetSales) {
      const updatedSale: Sale = {
        ...sale,
        customerId: enableCustomer && customerId ? customerId : sale.customerId,
        date: enableDate && date ? date : sale.date,
        competence: enableCompetence && competence ? competence : sale.competence,
        status: enableStatus ? status : sale.status,
        notes: enableNotes ? notes : sale.notes
      };

      // Atualiza os itens da venda se descrição ou categoria foram marcadas
      if (enableDescription || enableAccount) {
        if (updatedSale.items && updatedSale.items.length > 0) {
          updatedSale.items = updatedSale.items.map((item, idx) => {
            if (idx === 0) {
              return {
                ...item,
                description: enableDescription && description.trim() ? description.trim() : item.description,
                accountId: enableAccount && accountId ? accountId : item.accountId
              };
            }
            return item;
          });
        } else {
          updatedSale.items = [
            {
              id: `item-${sale.id}`,
              serviceId: 'srv-1',
              description: enableDescription && description.trim() ? description.trim() : (sale.notes || 'Prestação de Serviços'),
              quantity: 1,
              unitPrice: sale.netTotal || sale.grossTotal,
              discount: 0,
              total: sale.netTotal || sale.grossTotal,
              accountId: enableAccount && accountId ? accountId : 'acc-1.1.01'
            }
          ];
        }
      }

      storage.updateSale(updatedSale, syncLinkedTitles);
      updatedCount++;
    }

    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EDICAO_LOTE_VENDAS',
      module: 'Vendas e Faturamento',
      recordId: `batch-${targetSales.length}`,
      details: `Edição em lote concluída em ${updatedCount} vendas. Campos alterados: ${changedFields.join(', ')}. Sincronização com parcelas a receber: ${syncLinkedTitles ? 'SIM' : 'NÃO'}.`
    });

    onSaved(updatedCount);
    onClose();
  };

  const totalAmount = targetSales.reduce((acc, s) => acc + (s.netTotal || s.grossTotal || 0), 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div 
        className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-slate-950 shadow-xs font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Edição de Vendas em Lote
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] font-black border border-amber-500/30">
                  {targetSales.length} selecionada{targetSales.length > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Total acumulado das vendas selecionadas: <strong className="font-mono text-[var(--text-primary)]">{formatBRL(totalAmount)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleApply} className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="text-[11px] leading-relaxed">
              Marque apenas os campos que você deseja alterar em lote. Os campos <strong>desmarcados</strong> permanecerão exatamente como estão em cada uma das vendas.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center text-xs text-rose-700 dark:text-rose-300 font-semibold">
              <AlertCircle className="w-4 h-4 mr-2 text-rose-500 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Campo 1: Cliente */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            enableCustomer
              ? 'bg-[var(--surface-elevated)] border-amber-500/50 shadow-2xs'
              : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableCustomer}
                  onChange={e => setEnableCustomer(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-500" />
                  Alterar Cliente
                </span>
              </label>
              {enableCustomer && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Ativo</span>
              )}
            </div>

            {enableCustomer && (
              <div className="mt-2.5">
                <SearchableSelect
                  options={customerOptions}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder="Selecione o novo cliente..."
                  searchPlaceholder="Digite o nome ou CNPJ/CPF do cliente..."
                  required={enableCustomer}
                />
              </div>
            )}
          </div>

          {/* Campo 2: Descrição do Serviço */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            enableDescription
              ? 'bg-[var(--surface-elevated)] border-amber-500/50 shadow-2xs'
              : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableDescription}
                  onChange={e => setEnableDescription(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-500" />
                  Alterar Descrição / Nome do Serviço
                </span>
              </label>
              {enableDescription && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Ativo</span>
              )}
            </div>

            {enableDescription && (
              <div className="mt-2.5">
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Consultoria Mensal de Gestão Contábil"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 focus:outline-none"
                  required={enableDescription}
                />
              </div>
            )}
          </div>

          {/* Campo 3: Categoria do Serviço (Plano de Contas) */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            enableAccount
              ? 'bg-[var(--surface-elevated)] border-amber-500/50 shadow-2xs'
              : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableAccount}
                  onChange={e => setEnableAccount(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                  Alterar Categoria do Serviço (Plano de Contas DRE)
                </span>
              </label>
              {enableAccount && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Ativo</span>
              )}
            </div>

            {enableAccount && (
              <div className="mt-2.5">
                <SearchableSelect
                  options={chartAccountOptions}
                  value={accountId}
                  onChange={setAccountId}
                  placeholder="Selecione a conta analítica de receita..."
                  searchPlaceholder="Buscar por código ou nome da conta..."
                  required={enableAccount}
                />
              </div>
            )}
          </div>

          {/* Linha Dupla: Data de Emissão (Admissão) e Competência */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Campo 4: Data de Emissão */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              enableDate
                ? 'bg-[var(--surface-elevated)] border-amber-500/50 shadow-2xs'
                : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableDate}
                    onChange={e => setEnableDate(e.target.checked)}
                    className="w-4 h-4 rounded-md border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    Data de Emissão
                  </span>
                </label>
              </div>

              {enableDate && (
                <div className="mt-2.5">
                  <DateField
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] font-mono focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 focus:outline-none"
                    required={enableDate}
                  />
                </div>
              )}
            </div>

            {/* Campo 5: Competência DRE */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              enableCompetence
                ? 'bg-[var(--surface-elevated)] border-amber-500/50 shadow-2xs'
                : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableCompetence}
                    onChange={e => setEnableCompetence(e.target.checked)}
                    className="w-4 h-4 rounded-md border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    Competência (DRE)
                  </span>
                </label>
              </div>

              {enableCompetence && (
                <div className="mt-2.5">
                  <MonthField
                    value={competence}
                    onChange={e => setCompetence(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] font-mono focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 focus:outline-none"
                    required={enableCompetence}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Campo 6: Status */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            enableStatus
              ? 'bg-[var(--surface-elevated)] border-amber-500/50 shadow-2xs'
              : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableStatus}
                  onChange={e => setEnableStatus(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                  Alterar Status da Venda
                </span>
              </label>
            </div>

            {enableStatus && (
              <div className="mt-2.5">
                <PremiumSelect
                  value={status}
                  onChange={e => setStatus(e.target.value as 'CONFIRMADA' | 'CANCELADA')}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] font-bold focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                >
                  <option value="CONFIRMADA">CONFIRMADA (Ativa)</option>
                  <option value="CANCELADA">CANCELADA (Anulada)</option>
                </PremiumSelect>
              </div>
            )}
          </div>

          {/* Campo 7: Observações */}
          <div className={`p-3.5 rounded-xl border transition-all ${
            enableNotes
              ? 'bg-[var(--surface-elevated)] border-amber-500/50 shadow-2xs'
              : 'bg-[var(--surface-card)] border-[var(--border-subtle)] opacity-85 hover:opacity-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enableNotes}
                  onChange={e => setEnableNotes(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-500" />
                  Observações / Notas Adicionais
                </span>
              </label>
            </div>

            {enableNotes && (
              <div className="mt-2.5">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Adicione observações ou justificativas para as vendas..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Sincronização com Parcelas a Receber */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between">
            <div className="pr-3">
              <span className="text-xs font-bold text-[var(--text-primary)] block">
                Sincronizar Parcelas a Receber no Fluxo de Caixa
              </span>
              <span className="text-[10px] text-[var(--text-secondary)] block mt-0.5">
                Atualiza automaticamente cliente, descrição, categoria contábil e competência nos títulos vinculados em aberto.
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={syncLinkedTitles}
                onChange={e => setSyncLinkedTitles(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Lista de Vendas Prévia */}
          <div className="border border-[var(--border-subtle)] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="w-full px-3.5 py-2.5 bg-[var(--surface-elevated)] text-left flex items-center justify-between text-xs font-bold text-[var(--text-primary)] cursor-pointer hover:bg-[var(--surface-elevated)]/80"
            >
              <span>Vendas que serão alteradas ({targetSales.length})</span>
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                {showPreview ? 'Ocultar Lista ▲' : 'Ver Lista ▼'}
              </span>
            </button>

            {showPreview && (
              <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)] p-2 space-y-1 bg-[var(--surface-card)]">
                {targetSales.map(s => {
                  const client = counterparties.find(c => c.id === s.customerId);
                  return (
                    <div key={s.id} className="py-2 px-2 text-xs flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-[var(--text-primary)]">{s.saleNumber}</span>
                          <span className="text-[11px] text-[var(--text-secondary)] truncate">
                            • {client?.name || 'Cliente'}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate">
                          {s.items?.[0]?.description || s.notes || 'Serviço'} ({formatDateBR(s.date)})
                        </p>
                      </div>
                      <span className="font-mono font-bold text-[var(--text-primary)] shrink-0">
                        {formatBRL(s.netTotal || s.grossTotal)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Aplicar Alterações em {targetSales.length} Venda{targetSales.length > 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
