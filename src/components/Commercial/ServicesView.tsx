import React, { useState } from 'react';
import { Briefcase, Plus, Search, CheckCircle2, Edit2, Tag } from 'lucide-react';
import { ServiceItem } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL } from '../../services/financialEngine';
import { matchesSearch } from '../../utils/searchUtils';
import { PremiumSelect } from '../Common/PremiumSelect';
import { Card, PageToolbar, Button } from '../Common/ui';

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
      <PageToolbar description="Classificação analítica no DRE e parametrização de honorários e serviços avulsos.">
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleOpenNew}>
          Novo serviço
        </Button>
      </PageToolbar>

      <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar serviços"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-[var(--border-highlight)]"
          />
        </div>
        <span className="text-sm text-[var(--text-muted)]">
          {services.length} serviços cadastrados
        </span>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {services.map(srv => {
          const acc = chartAccounts.find(a => a.id === srv.chartAccountId);
          return (
            <div
              key={srv.id}
              className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] flex flex-col justify-between hover:border-[var(--border-highlight)] transition-colors"
            >
              <div>
                <div className="flex justify-between items-start gap-3">
                  <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[var(--surface-elevated)] text-xs text-[var(--text-secondary)]">
                    {srv.modality === 'RECORRENTE' ? 'Recorrência mensal' : 'Serviço avulso'}
                  </span>
                  <button
                    onClick={() => handleEdit(srv)}
                    className="w-8 h-8 -mr-2 -mt-1 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                    aria-label={`Editar ${srv.name}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="mt-3">{srv.name}</h3>
                <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">{srv.description}</p>
              </div>

              <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] flex justify-between items-end gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-[var(--text-muted)]">Conta do DRE</div>
                  <div className="text-sm text-[var(--text-secondary)] truncate">{acc?.code} - {acc?.name}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs text-[var(--text-muted)]">Preço sugerido</div>
                  <div className="text-[17px] font-semibold tabular-nums">{formatBRL(srv.defaultPrice)}</div>
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
