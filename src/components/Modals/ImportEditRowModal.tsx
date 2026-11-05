import React, { useState, useEffect } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { 
  Edit3, 
  X, 
  Save, 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  Calendar, 
  DollarSign, 
  Tag, 
  Layers, 
  CheckCircle2,
  AlertCircle,
  Search
} from 'lucide-react';
import { AnalyzedImportRow, BaseSpreadsheetRow, ExtraColumnDefinition, generateTitleFingerprint } from '../../services/contaAzulMappingEngine';
import { Counterparty, ChartAccount, BankAccount, TitleType } from '../../types';
import { CategoryQuickSearchModal, getGroupedChartAccounts } from './ImportSpreadsheetModal';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface ImportEditRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: AnalyzedImportRow | null;
  counterparties: Counterparty[];
  chartAccounts: ChartAccount[];
  bankAccounts: BankAccount[];
  extraColumns: ExtraColumnDefinition[];
  onSaveRow: (rowNumber: number, updatedNormalized: BaseSpreadsheetRow, resolvedPartyId?: string, resolvedAccountId?: string) => void;
}

export const ImportEditRowModal: React.FC<ImportEditRowModalProps> = ({
  isOpen,
  onClose,
  row,
  counterparties,
  chartAccounts,
  bankAccounts,
  extraColumns,
  onSaveRow
}) => {
  const [tipo, setTipo] = useState<TitleType>(row?.normalized?.tipo || 'PAGAR');
  const [titulo, setTitulo] = useState<string>(row?.normalized?.titulo || '');
  const [fornecedor, setFornecedor] = useState<string>(row?.normalized?.fornecedor || '');
  const [descricao, setDescricao] = useState<string>(row?.normalized?.descricao || '');
  const [competencia, setCompetencia] = useState<string>(row?.normalized?.competencia || '');
  const [emissao, setEmissao] = useState<string>(row?.normalized?.emissao || '');
  const [vencimento, setVencimento] = useState<string>(row?.normalized?.vencimento || '');
  const [previsaoCaixa, setPrevisaoCaixa] = useState<string>(row?.normalized?.previsaoCaixa || '');
  const [valorOriginal, setValorOriginal] = useState<number>(row?.normalized?.valorOriginal || 0);
  const [principalBaixado, setPrincipalBaixado] = useState<number>(row?.normalized?.principalBaixado || 0);
  const [situacao, setSituacao] = useState<'ABERTO' | 'PARCIAL' | 'LIQUIDADO' | 'ATRASADO' | 'CANCELADO'>(row?.normalized?.situacao || 'ABERTO');
  const [selectedPartyId, setSelectedPartyId] = useState<string>(row?.matchedCounterpartyId || row?.suggestedCounterpartyId || '');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(row?.matchedChartAccountId || '');
  const [centroCusto, setCentroCusto] = useState<string>(row?.normalized?.centroCusto || '');
  const [customFields, setCustomFields] = useState<Record<string, any>>(row?.normalized?.customFields || {});
  const [showCategorySearch, setShowCategorySearch] = useState(false);
  const groupedAccounts = React.useMemo(() => getGroupedChartAccounts(chartAccounts, tipo), [chartAccounts, tipo]);

  // Reset form when row changes
  useEffect(() => {
    if (row && row.normalized) {
      setTipo(row.normalized.tipo || 'PAGAR');
      setTitulo(row.normalized.titulo || '');
      setFornecedor(row.normalized.fornecedor || '');
      setDescricao(row.normalized.descricao || '');
      setCompetencia(row.normalized.competencia || '');
      setEmissao(row.normalized.emissao || '');
      setVencimento(row.normalized.vencimento || '');
      setPrevisaoCaixa(row.normalized.previsaoCaixa || '');
      setValorOriginal(row.normalized.valorOriginal || 0);
      setPrincipalBaixado(row.normalized.principalBaixado || 0);
      setSituacao(row.normalized.situacao || 'ABERTO');
      setSelectedPartyId(row.matchedCounterpartyId || row.suggestedCounterpartyId || '');
      setSelectedAccountId(row.matchedChartAccountId || '');
      setCentroCusto(row.normalized.centroCusto || '');
      setCustomFields(row.normalized.customFields || {});
    }
  }, [row]);

  if (!isOpen || !row) return null;

  // Recalcula saldo automático
  const calculatedSaldo = Math.max(0, Math.round((valorOriginal - principalBaixado) * 100) / 100);

  // Filtrar contrapartes de acordo com o tipo
  const relevantCounterparties = counterparties.filter(c => 
    tipo === 'RECEBER' ? (c.type === 'CLIENTE' || c.type === 'AMBOS') : (c.type === 'FORNECEDOR' || c.type === 'AMBOS')
  );

  // Filtrar contas analíticas de acordo com o tipo
  const relevantAccounts = chartAccounts.filter(a => a.isAnalytical);
  const currentAccount = chartAccounts.find(a => a.id === selectedAccountId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Determina status de liquidação com base nos valores
    let finalSituacao = situacao;
    if (calculatedSaldo <= 0.01 && valorOriginal > 0) {
      finalSituacao = 'LIQUIDADO';
    } else if (principalBaixado > 0 && calculatedSaldo > 0.01) {
      finalSituacao = 'PARCIAL';
    }

    const updated: BaseSpreadsheetRow = {
      ...row.normalized,
      tipo,
      titulo: titulo.trim(),
      fornecedor: fornecedor.trim(),
      descricao: descricao.trim(),
      competencia: competencia.trim(),
      emissao: emissao.trim(),
      vencimento: vencimento.trim(),
      previsaoCaixa: previsaoCaixa.trim() || vencimento.trim(),
      valorOriginal: Math.round(valorOriginal * 100) / 100,
      principalBaixado: Math.round(principalBaixado * 100) / 100,
      saldoAtual: calculatedSaldo,
      situacao: finalSituacao,
      centroCusto: centroCusto.trim() || undefined,
      customFields,
      isManuallyEdited: true
    };

    onSaveRow(row.rowNumber, updated, selectedPartyId || undefined, selectedAccountId || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center space-x-2">
                <span>Editar Linha {row.rowNumber} da Planilha</span>
                {row.normalized.isManuallyEdited && (
                  <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 rounded font-bold">
                    Editada
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Ajuste valores, datas ou classificação antes da aprovação final
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-card)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          
          {/* Seletor Tipo: Receita vs Despesa */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1.5">
              Natureza Financeira (Operação):
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTipo('RECEBER')}
                className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition-all font-bold text-xs ${
                  tipo === 'RECEBER'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 ring-2 ring-emerald-500/30'
                    : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Receita (Contas a Receber)</span>
              </button>

              <button
                type="button"
                onClick={() => setTipo('PAGAR')}
                className={`p-2.5 rounded-xl border flex items-center justify-center space-x-2 transition-all font-bold text-xs ${
                  tipo === 'PAGAR'
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 ring-2 ring-rose-500/30'
                    : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <TrendingDown className="w-4 h-4 text-rose-400" />
                <span>Despesa (Contas a Pagar)</span>
              </button>
            </div>
          </div>

          {/* Linha 1: Título e Contraparte */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Título / Código de Referência:
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-mono font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Nome do {tipo === 'RECEBER' ? 'Cliente' : 'Fornecedor'} (Texto da Planilha):
              </label>
              <input
                type="text"
                value={fornecedor}
                onChange={(e) => setFornecedor(e.target.value)}
                required
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-medium text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Vínculo de Cadastro no App */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
              Vincular a Cadastro Existente no App ({tipo === 'RECEBER' ? 'Clientes' : 'Fornecedores'}):
            </label>
            <PremiumSelect
              value={selectedPartyId}
              onChange={(e) => setSelectedPartyId(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-medium text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
            >
              <option value="">-- Cadastrar automaticamente como novo "{fornecedor}" --</option>
              {relevantCounterparties.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.document ? `(${c.document})` : ''} - [{c.type}]
                </option>
              ))}
            </PremiumSelect>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
              Descrição do Lançamento:
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
              className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-medium text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          {/* Linha 2: Datas (Competência, Emissão, Vencimento) - Previsão de Caixa oculta sincronizada com Vencimento */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Competência:
              </label>
              <input
                type="text"
                placeholder="AAAA-MM"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs font-mono font-semibold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Emissão:
              </label>
              <DateField
                value={emissao}
                onChange={(e) => setEmissao(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-lg text-xs font-mono text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1 text-amber-400">
                Vencimento:
              </label>
              <DateField
                value={vencimento}
                onChange={(e) => {
                  setVencimento(e.target.value);
                  setPrevisaoCaixa(e.target.value);
                }}
                required
                className="w-full px-2.5 py-1.5 bg-[var(--surface-elevated)] border border-amber-400/40 rounded-lg text-xs font-mono font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Linha 3: Valores Financeiros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1 text-amber-400">
                Valor Original (R$):
              </label>
              <MoneyField value={Number(valorOriginal) || 0} onChange={(v: number) => setValorOriginal(v)} className="w-full px-3 py-1.5 bg-[var(--surface-card)] border border-amber-400/40 rounded-lg text-xs font-mono font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden" required />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Principal Baixado (R$):
              </label>
              <MoneyField value={Number(principalBaixado) || 0} onChange={(v: number) => setPrincipalBaixado(v)} className="w-full px-3 py-1.5 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg text-xs font-mono text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden" />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1">
                Saldo Atual Restante (R$):
              </label>
              <div className="px-3 py-1.5 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-lg text-xs font-mono font-bold text-[var(--text-primary)]">
                R$ {calculatedSaldo.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Linha 4: Situação e Plano de Contas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Situação / Status:
              </label>
              <PremiumSelect
                value={situacao}
                onChange={(e) => setSituacao(e.target.value as any)}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              >
                <option value="ABERTO">ABERTO</option>
                <option value="PARCIAL">PARCIAL</option>
                <option value="LIQUIDADO">LIQUIDADO</option>
                <option value="ATRASADO">ATRASADO</option>
                <option value="CANCELADO">CANCELADO</option>
              </PremiumSelect>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Conta do Plano de Contas:
              </label>
              <button
                type="button"
                onClick={() => setShowCategorySearch(true)}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] hover:border-amber-400 rounded-xl text-xs font-medium text-left flex items-center justify-between transition-all cursor-pointer shadow-xs"
                title="Pesquisar categoria contábil com agrupamento e caixa de busca por nome ou código"
              >
                <span className="truncate">
                  {currentAccount ? (
                    <span className="text-[var(--text-primary)] font-bold">
                      {currentAccount.code && <span className="text-amber-400 font-mono mr-1.5">[{currentAccount.code}]</span>}
                      {currentAccount.name}
                    </span>
                  ) : (
                    <span className="text-amber-400 italic flex items-center gap-1 font-semibold">
                      <Search className="w-3.5 h-3.5" /> Clique para pesquisar e selecionar categoria...
                    </span>
                  )}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-[10px] flex items-center gap-1 shrink-0 ml-2">
                  <Search className="w-3 h-3" />
                  Buscar
                </span>
              </button>
            </div>
          </div>

          {/* Centro de Custo e Colunas Extras */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                Centro de Custo / Projeto:
              </label>
              <input
                type="text"
                value={centroCusto}
                onChange={(e) => setCentroCusto(e.target.value)}
                placeholder="Ex: Administrativo, Tecnologia, Obra..."
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
              />
            </div>

            {extraColumns.map(col => (
              <div key={col.id}>
                <label className="text-xs font-semibold text-[var(--text-secondary)] block mb-1">
                  {col.label} (Coluna Extra):
                </label>
                <input
                  type="text"
                  value={customFields[col.id] !== undefined ? String(customFields[col.id]) : ''}
                  onChange={(e) => setCustomFields(prev => ({ ...prev, [col.id]: e.target.value }))}
                  placeholder={`Valor de ${col.label}`}
                  className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs text-[var(--text-primary)] focus:border-amber-400 focus:outline-hidden"
                />
              </div>
            ))}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[var(--border-subtle)] shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-xl hover:bg-[var(--surface-elevated)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Alterações</span>
            </button>
          </div>
        </form>

      </div>

      {/* Modal de Busca Rápida de Categorias com Pesquisa por Nome e Macro-Grupos */}
      {showCategorySearch && (
        <CategoryQuickSearchModal
          isOpen={showCategorySearch}
          onClose={() => setShowCategorySearch(false)}
          currentAccountId={selectedAccountId}
          targetDescription={descricao || titulo}
          targetType={tipo}
          groupedAccounts={groupedAccounts}
          onSelectAccount={(accId) => {
            setSelectedAccountId(accId);
            setShowCategorySearch(false);
          }}
        />
      )}
    </div>
  );
};
