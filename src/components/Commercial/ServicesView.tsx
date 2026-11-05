import React, { useState } from 'react';
import { Briefcase, Plus, Search, CheckCircle2, Edit2, Tag } from 'lucide-react';
import { ServiceItem } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL } from '../../services/financialEngine';
import { matchesSearch } from '../../utils/searchUtils';
import { PremiumSelect } from '../Common/PremiumSelect';

interface ServicesViewProps {
  initialSearch?: string;
}

export const ServicesView: React.FC<ServicesViewProps> = ({ initialSearch = '' }) => {
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  React.useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchTerm(initialSearch);
    }
  }, [initialSearch]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);

  const services = storage.getServices().filter(s =>
    matchesSearch([s.name, s.description], searchTerm)
  );

  const chartAccounts = storage.getChartAccounts().filter(a => a.isAnalytical && a.isActive);

  const [formData, setFormData] = useState<Partial<ServiceItem>>({
    name: '',
    modality: 'RECORRENTE',
    defaultPrice: 0,
    chartAccountId: chartAccounts[0]?.id || '',
    isActive: true,
    description: ''
  });

  const handleOpenNew = () => {
    setEditingService(null);
    setFormData({
      name: '',
      modality: 'RECORRENTE',
      defaultPrice: 0,
      chartAccountId: chartAccounts[0]?.id || '',
      isActive: true,
      description: ''
    });
    setIsModalOpen(true);
  };

  const handleEdit = (srv: ServiceItem) => {
    setEditingService(srv);
    setFormData(srv);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    const all = storage.getServices();
    const currentUser = storage.getCurrentUser();

    if (editingService) {
      const updated = all.map(s => s.id === editingService.id ? { ...s, ...formData } as ServiceItem : s);
      storage.saveServices(updated);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'EDICAO_SERVICO',
        module: 'Comercial & Serviços',
        recordId: editingService.id,
        details: `Atualização de serviço ${formData.name}.`
      });
    } else {
      const accId = formData.chartAccountId || formData.defaultAccountId || chartAccounts[0]?.id || '';
      const newSrv: ServiceItem = {
        id: `srv-${Date.now()}`,
        name: formData.name!,
        modality: formData.modality as 'RECORRENTE' | 'AVULSO' || 'RECORRENTE',
        defaultPrice: Number(formData.defaultPrice) || 0,
        defaultAccountId: accId,
        chartAccountId: accId,
        status: (formData.isActive ?? true) ? 'ATIVO' : 'INATIVO',
        description: formData.description || ''
      };
      storage.saveServices([...all, newSrv]);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CADASTRO_SERVICO',
        module: 'Comercial & Serviços',
        recordId: newSrv.id,
        details: `Cadastro do serviço ${newSrv.name} (${formatBRL(newSrv.defaultPrice)}).`
      });
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-xl border border-[var(--border-subtle)] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <Briefcase className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Catálogo de Serviços Contábeis</h1>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Classificação analítica no DRE e parametrização de honorários e avulsos.
          </p>
        </div>

        <button
          onClick={handleOpenNew}
          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Novo Serviço
        </button>
      </div>

      <div className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-2xs flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar serviços..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] focus:outline-hidden focus:border-amber-500"
          />
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          Serviços cadastrados: <strong className="text-[var(--text-primary)]">{services.length}</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map(srv => {
          const acc = chartAccounts.find(a => a.id === srv.chartAccountId);
          return (
            <div key={srv.id} className="bg-[var(--surface-card)] p-4 rounded-xl border border-[var(--border-subtle)] shadow-2xs flex flex-col justify-between hover:border-amber-500/40 transition-colors">
              <div>
                <div className="flex justify-between items-start">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                    srv.modality === 'RECORRENTE' 
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200' 
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  }`}>
                    {srv.modality === 'RECORRENTE' ? 'Recorrência Mensal' : 'Serviço Avulso'}
                  </span>
                  <button
                    onClick={() => handleEdit(srv)}
                    className="text-[var(--text-secondary)] hover:text-amber-400 p-1 cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="font-bold text-[var(--text-primary)] text-sm mt-2">{srv.name}</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">{srv.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex justify-between items-end">
                <div>
                  <div className="text-[10px] text-[var(--text-secondary)]">Conta DRE:</div>
                  <div className="text-xs font-medium text-[var(--text-secondary)] truncate max-w-[150px]">{acc?.code} - {acc?.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-secondary)]">Preço Sugerido</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] font-mono">{formatBRL(srv.defaultPrice)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-[var(--border-subtle)]">
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                {editingService ? 'Editar Serviço' : 'Novo Serviço'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 cursor-pointer">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">Nome do Serviço *</label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-1.5 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">Modalidade *</label>
                  <PremiumSelect
                    value={formData.modality || 'RECORRENTE'}
                    onChange={e => setFormData({ ...formData, modality: e.target.value as 'RECORRENTE' | 'AVULSO' })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-1.5 focus:outline-hidden focus:border-amber-500"
                  >
                    <option value="RECORRENTE">Recorrente (Mensal)</option>
                    <option value="AVULSO">Avulso / Pontual</option>
                  </PremiumSelect>
                </div>
                <div>
                  <label className="block font-medium text-[var(--text-secondary)] mb-1">Preço Sugerido (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.defaultPrice || ''}
                    onChange={e => setFormData({ ...formData, defaultPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-1.5 font-bold font-mono focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">Conta DRE Vinculada *</label>
                <PremiumSelect
                  value={formData.chartAccountId}
                  onChange={e => setFormData({ ...formData, chartAccountId: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-1.5 focus:outline-hidden focus:border-amber-500"
                >
                  {chartAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                  ))}
                </PremiumSelect>
              </div>

              <div>
                <label className="block font-medium text-[var(--text-secondary)] mb-1">Descrição</label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-input)] text-[var(--text-primary)] px-3 py-1.5 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm cursor-pointer"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
