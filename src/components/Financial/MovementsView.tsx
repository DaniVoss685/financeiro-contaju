import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeftRight, 
  Search, 
  Download, 
  FileSpreadsheet, 
  ArrowUpRight, 
  ArrowDownRight,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { matchesSearch } from '../../utils/searchUtils';
import { FinancialMovement, FinancialTitle } from '../../types';
import { EditTitleModal } from '../Modals/EditTitleModal';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface MovementsViewProps {
  initialSearch?: string;
}

export const MovementsView: React.FC<MovementsViewProps> = ({ initialSearch = '' }) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'ENTRADA' | 'SAIDA'>('ALL');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [refreshKey, setRefreshKey] = useState(0);

  React.useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchTerm(initialSearch);
    }
  }, [initialSearch]);

  // States for ERP Title Edit Modal
  const [selectedTitleForEdit, setSelectedTitleForEdit] = useState<FinancialTitle | null>(null);

  // States for Direct Movement Edit Modal
  const [editingMovement, setEditingMovement] = useState<FinancialMovement | null>(null);
  const [movDescription, setMovDescription] = useState('');
  const [movDate, setMovDate] = useState('');
  const [movAmount, setMovAmount] = useState<number>(0);
  const [movBankAccountId, setMovBankAccountId] = useState('');
  const [movAccountId, setMovAccountId] = useState('');
  const [movDirection, setMovDirection] = useState<'ENTRADA' | 'SAIDA'>('ENTRADA');

  useEffect(() => {
    return storage.subscribe(() => {
      setRefreshKey(k => k + 1);
    });
  }, []);

  const accounts = useMemo(() => storage.getBankAccounts(), [refreshKey]);
  const movements = useMemo(() => {
    return [...storage.getMovements()].sort((a, b) => b.date.localeCompare(a.date));
  }, [refreshKey]);
  const titles = useMemo(() => storage.getTitles(), [refreshKey]);
  const settlements = useMemo(() => storage.getSettlements(), [refreshKey]);
  const chartAccounts = useMemo(() => {
    return storage.getChartAccounts().filter(a => a.isAnalytical && a.isActive);
  }, [refreshKey]);

  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      if (selectedAccountId !== 'ALL' && m.bankAccountId !== selectedAccountId) return false;
      if (directionFilter !== 'ALL' && m.direction !== directionFilter) return false;
      if (searchTerm) {
        const match = matchesSearch([
          m.description,
          m.originReferenceId
        ], searchTerm);
        if (!match) return false;
      }
      return true;
    });
  }, [movements, selectedAccountId, directionFilter, searchTerm]);

  // Handler for double clicking or clicking edit on a movement row
  const handleOpenEdit = (m: FinancialMovement) => {
    let matchedTitle: FinancialTitle | undefined;

    if (m.originReferenceId) {
      matchedTitle = titles.find(t => t.id === m.originReferenceId || t.titleNumber === m.originReferenceId);
      if (!matchedTitle) {
        const matchedSettlement = settlements.find(s => s.id === m.originReferenceId || s.settlementNumber === m.originReferenceId);
        if (matchedSettlement) {
          matchedTitle = titles.find(t => t.id === matchedSettlement.titleId);
        }
      }
    }

    if (matchedTitle) {
      setSelectedTitleForEdit(matchedTitle);
    } else {
      setEditingMovement(m);
      setMovDescription(m.description);
      setMovDate(m.date);
      setMovAmount(m.amount);
      setMovBankAccountId(m.bankAccountId);
      setMovAccountId(m.accountId || '');
      setMovDirection(m.direction);
    }
  };

  const handleSaveDirectMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement) return;

    const allMovements = storage.getMovements();
    const updated = allMovements.map(m => {
      if (m.id === editingMovement.id) {
        return {
          ...m,
          description: movDescription,
          date: movDate,
          amount: Math.abs(movAmount),
          bankAccountId: movBankAccountId,
          accountId: movAccountId || undefined,
          direction: movDirection
        };
      }
      return m;
    });

    storage.saveMovements(updated);
    FinancialEngine.recalculateAllAccountBalances();

    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'ATUALIZACAO',
      module: 'Movimentações',
      recordId: editingMovement.id,
      details: `Movimentação ${editingMovement.id} editada: ${movDescription}, ${formatBRL(movAmount)}`
    });

    setEditingMovement(null);
    setRefreshKey(k => k + 1);
  };

  const handleTitleSaved = () => {
    setSelectedTitleForEdit(null);
    FinancialEngine.recalculateAllAccountBalances();
    setRefreshKey(k => k + 1);
  };

  const handleExportExcel = () => {
    const headers = ['Data', 'Conta Bancária', 'Sentido', 'Origem', 'Descrição', 'Ref / Documento', 'Valor (R$)'];
    const rows = filteredMovements.map(m => {
      const acc = accounts.find(a => a.id === m.bankAccountId);
      return [
        m.date,
        acc?.name || 'Conta',
        m.direction,
        m.originType,
        m.description,
        m.originReferenceId || '-',
        m.amount
      ];
    });
    exportToExcel('extrato-movimentacoes', 'Movimentações', headers, rows);
  };

  const handleExportCSV = () => {
    const headers = ['Data', 'Conta Bancária', 'Sentido', 'Origem', 'Descrição', 'Ref / Documento', 'Valor (R$)'];
    const rows = filteredMovements.map(m => {
      const acc = accounts.find(a => a.id === m.bankAccountId);
      return [
        m.date,
        acc?.name || 'Conta',
        m.direction,
        m.originType,
        m.description,
        m.originReferenceId || '-',
        m.amount
      ];
    });
    exportToCSV('extrato-movimentacoes', headers, rows);
  };

  const totalIn = filteredMovements.filter(m => m.direction === 'ENTRADA').reduce((acc, m) => acc + m.amount, 0);
  const totalOut = filteredMovements.filter(m => m.direction === 'SAIDA').reduce((acc, m) => acc + m.amount, 0);

  return (
    <div className="space-y-6" key={refreshKey}>
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#131316] p-5 rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <ArrowLeftRight className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Movimentações de Caixa e Bancos
            </h1>
            <span className="text-[10px] bg-amber-500/10 text-amber-500 font-bold px-2.5 py-0.5 rounded-full border border-amber-500/30">
              Duplo Clique para Editar Lançamento
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Extrato integrado com o Contas a Pagar/Receber. Dê duplo clique em qualquer linha para abrir a tela flutuante de edição.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 bg-white dark:bg-[#1b1b20] border border-slate-300 dark:border-[#26262b] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-medium transition-colors flex items-center shadow-2xs"
          >
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
            Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 bg-white dark:bg-[#1b1b20] border border-slate-300 dark:border-[#26262b] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-xs font-medium transition-colors flex items-center shadow-2xs"
          >
            <Download className="w-4 h-4 mr-1.5 text-slate-500" />
            CSV
          </button>
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#131316] p-4 rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs">
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Total de Entradas (Filtro)</span>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center">
            <ArrowUpRight className="w-5 h-5 mr-1 text-emerald-500" />
            {formatBRL(totalIn)}
          </div>
        </div>

        <div className="bg-white dark:bg-[#131316] p-4 rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs">
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Total de Saídas (Filtro)</span>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1 flex items-center">
            <ArrowDownRight className="w-5 h-5 mr-1 text-rose-500" />
            {formatBRL(totalOut)}
          </div>
        </div>

        <div className="bg-white dark:bg-[#131316] p-4 rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs">
          <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">Saldo Líquido Movimentado</span>
          <div className={`text-xl font-bold mt-1 ${totalIn - totalOut >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {formatBRL(totalIn - totalOut)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#131316] p-4 rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center text-xs">
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 mr-2">Conta:</label>
            <PremiumSelect
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-[#26262b] px-2.5 py-1.5 bg-white dark:bg-[#1b1b20] text-slate-800 dark:text-slate-200 text-xs font-medium"
            >
              <option value="ALL">Todas as Contas ({accounts.length})</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </PremiumSelect>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 mr-2">Sentido:</label>
            <PremiumSelect
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as any)}
              className="rounded-lg border border-slate-300 dark:border-[#26262b] px-2.5 py-1.5 bg-white dark:bg-[#1b1b20] text-slate-800 dark:text-slate-200 text-xs font-medium"
            >
              <option value="ALL">Todos os Sentidos</option>
              <option value="ENTRADA">Entradas (Créditos)</option>
              <option value="SAIDA">Saídas (Débitos)</option>
            </PremiumSelect>
          </div>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por descrição ou documento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-amber-500/30"
          />
        </div>
      </div>

      {/* Mobile View: Cards Compactos de Movimentações (< 640px) */}
      <div className="block sm:hidden space-y-2.5">
        {filteredMovements.length === 0 ? (
          <div className="bg-white dark:bg-[#131316] p-8 rounded-xl border border-slate-200 dark:border-[#26262b] text-center text-slate-500 text-xs shadow-2xs">
            Nenhuma movimentação bancária encontrada.
          </div>
        ) : (
          filteredMovements.map(m => {
            const acc = accounts.find(a => a.id === m.bankAccountId);
            const isEntrada = m.direction === 'ENTRADA';

            return (
              <div
                key={m.id}
                onClick={() => handleOpenEdit(m)}
                className="bg-white dark:bg-[#131316] p-3.5 rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs space-y-2.5 active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors cursor-pointer"
              >
                {/* Top Row: Sentido + Data e Valor em Destaque */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      isEntrada
                        ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                        : 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                    }`}>
                      {isEntrada ? (
                        <ArrowDownRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                      )}
                      <span>{m.direction}</span>
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {formatDateBR(m.date)}
                    </span>
                  </div>

                  <div className={`font-extrabold font-mono text-sm ${
                    isEntrada ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}>
                    {isEntrada ? '+' : '-'} {formatBRL(m.amount)}
                  </div>
                </div>

                {/* Middle Row: Descrição */}
                <div className="font-semibold text-slate-900 dark:text-slate-100 text-xs leading-snug line-clamp-2">
                  {m.description || 'Sem descrição'}
                </div>

                {/* Bottom Row: Conta Bancária + Origem / Ref + Botão Editar */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#26262b] text-[11px]">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-medium text-slate-700 dark:text-slate-300 truncate">
                      {acc?.name || 'Conta Bancária'}
                    </div>
                    {(m.originType || m.originReferenceId) && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                        {m.originType} {m.originReferenceId ? `• ${m.originReferenceId}` : ''}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(m);
                    }}
                    className="min-h-[40px] min-w-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 ml-2 cursor-pointer transition-colors shrink-0"
                    title="Editar lançamento"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    <span>Editar</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Table with Double Click Support (Telas >= 640px) */}
      <div className="hidden sm:block bg-white dark:bg-[#131316] rounded-xl border border-slate-200 dark:border-[#26262b] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] text-slate-700 dark:text-slate-300 font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Conta Bancária</th>
                <th className="py-3 px-4">Sentido</th>
                <th className="hidden lg:table-cell py-3 px-4">Origem</th>
                <th className="py-3 px-4">Descrição da Operação</th>
                <th className="hidden xl:table-cell py-3 px-4">Documento / Ref</th>
                <th className="py-3 px-4 text-right">Valor</th>
                <th className="py-3 px-4 text-center">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#26262b]">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Nenhuma movimentação bancária encontrada.
                  </td>
                </tr>
              ) : (
                filteredMovements.map(m => {
                  const acc = accounts.find(a => a.id === m.bankAccountId);

                  return (
                    <tr 
                      key={m.id} 
                      onDoubleClick={() => handleOpenEdit(m)}
                      className="hover:bg-amber-500/5 dark:hover:bg-amber-500/10 cursor-pointer transition-colors group"
                      title="Clique duas vezes para abrir e editar o lançamento no Contas a Pagar/Receber"
                    >
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                        {formatDateBR(m.date)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {acc?.name || 'Conta Bancária'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          m.direction === 'ENTRADA'
                            ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                        }`}>
                          {m.direction}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {m.originType}
                      </td>
                      <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-medium">
                        <div className="flex items-center space-x-1.5">
                          <span>{m.description}</span>
                          <span className="opacity-0 group-hover:opacity-100 text-[10px] text-amber-500 font-bold transition-opacity">
                            (Duplo clique)
                          </span>
                        </div>
                      </td>
                      <td className="hidden xl:table-cell py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {m.originReferenceId || '-'}
                      </td>
                      <td className={`py-3 px-4 text-right font-bold text-sm ${
                        m.direction === 'ENTRADA' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {m.direction === 'ENTRADA' ? '+' : '-'} {formatBRL(m.amount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEdit(m);
                          }}
                          className="p-1.5 text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Editar lançamento (ou dê 2 cliques na linha)"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: EditTitleModal (quando a movimentação está vinculada ao Contas a Pagar/Receber) */}
      {selectedTitleForEdit && (
        <EditTitleModal
          isOpen={true}
          title={selectedTitleForEdit}
          onClose={() => setSelectedTitleForEdit(null)}
          onSaved={handleTitleSaved}
        />
      )}

      {/* Modal 2: Floating Direct Movement Edit Modal (quando é movimentação direta/avulsa) */}
      {editingMovement && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#131316] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-[#26262b] animate-in fade-in zoom-in-95">
            
            {/* Header com estilo Leão Dourado */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-black border border-amber-500/50 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.25)]">
                  <Edit3 className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Editar Lançamento da Movimentação
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ajuste instantâneo de valor, descrição e conta corrente
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setEditingMovement(null)} 
                className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDirectMovement} className="p-6 space-y-4 text-xs">
              
              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Descrição da Operação *
                </label>
                <input
                  type="text"
                  required
                  value={movDescription}
                  onChange={e => setMovDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Data da Movimentação *
                  </label>
                  <DateField
                    required
                    value={movDate}
                    onChange={e => setMovDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Valor da Operação (R$) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      onWheel={(e) => (e.target as HTMLElement).blur()}
                      value={movAmount || ''}
                      onChange={e => setMovAmount(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] pl-9 pr-3 py-2 text-xs font-bold text-slate-900 dark:text-amber-400 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Conta Bancária *
                  </label>
                  <PremiumSelect
                    value={movBankAccountId}
                    onChange={e => setMovBankAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  >
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </PremiumSelect>
                </div>

                <div>
                  <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Sentido Financeiro *
                  </label>
                  <PremiumSelect
                    value={movDirection}
                    onChange={e => setMovDirection(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] px-3 py-2 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  >
                    <option value="ENTRADA">ENTRADA (Crédito)</option>
                    <option value="SAIDA">SAÍDA (Débito)</option>
                  </PremiumSelect>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Classificação Contábil (Plano de Contas)
                </label>
                <PremiumSelect
                  value={movAccountId}
                  onChange={e => setMovAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                >
                  <option value="">Sem conta analítica vinculada</option>
                  {chartAccounts.map(ca => (
                    <option key={ca.id} value={ca.id}>{ca.code} - {ca.name}</option>
                  ))}
                </PremiumSelect>
              </div>

              {/* Ações */}
              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200 dark:border-[#26262b]">
                <button
                  type="button"
                  onClick={() => setEditingMovement(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1b1b20] rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-black stroke-[2.5]" />
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
