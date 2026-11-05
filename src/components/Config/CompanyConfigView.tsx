import React, { useState } from 'react';
import { Building, Save, CheckCircle2, Download, Database } from 'lucide-react';
import { CompanyInfo } from '../../types';
import { storage } from '../../services/storageService';
import { PremiumSelect } from '../Common/PremiumSelect';

export const CompanyConfigView: React.FC = () => {
  const [company, setCompany] = useState<CompanyInfo>(storage.getCompany());
  const [successMsg, setSuccessMsg] = useState('');

  const handleExportBackup = () => {
    try {
      const res = storage.downloadBackupFile();
      setSuccessMsg(`Backup "${res.filename}" (${res.sizeKb} KB) exportado com sucesso!`);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch {
      alert('Erro ao exportar backup');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    storage.saveCompany(company);
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'ALTERACAO_DADOS_EMPRESA',
      module: 'Configurações da Empresa',
      recordId: company.id,
      details: `Atualização dos dados cadastrais da empresa ${company.tradeName}.`
    });
    setSuccessMsg('Dados da empresa salvos com sucesso!');
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <Building className="w-5 h-5 text-amber-400" />
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">Dados da Empresa / Escritório</h1>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Configuração cadastral, regime tributário e dados fiscais do escritório contábil.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportBackup}
          className="px-3.5 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition-colors flex items-center space-x-2 shadow-xs cursor-pointer"
          title="Exportar backup completo de segurança da base de dados em formato JSON"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Exportar Backup (.JSON)</span>
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center text-xs text-emerald-400 font-medium">
          <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="bg-[var(--surface-card)] p-6 rounded-2xl border border-[var(--border-subtle)] shadow-sm">
        <form onSubmit={handleSave} className="space-y-4 text-xs max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1">Razão Social *</label>
              <input
                type="text"
                required
                value={company.legalName}
                onChange={e => setCompany({ ...company, legalName: e.target.value })}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1">Nome Fantasia *</label>
              <input
                type="text"
                required
                value={company.tradeName}
                onChange={e => setCompany({ ...company, tradeName: e.target.value })}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1">CNPJ *</label>
              <input
                type="text"
                required
                value={company.cnpj}
                onChange={e => setCompany({ ...company, cnpj: e.target.value })}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 font-mono focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1">Regime Tributário</label>
              <PremiumSelect
                value={company.taxRegime}
                onChange={e => setCompany({ ...company, taxRegime: e.target.value as any })}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 font-medium focus:outline-none focus:border-amber-400 transition-colors cursor-pointer"
              >
                <option value="SIMPLES_NACIONAL">Simples Nacional</option>
                <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
                <option value="LUCRO_REAL">Lucro Real</option>
              </PremiumSelect>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1">E-mail Financeiro Principal</label>
              <input
                type="email"
                value={company.email || ''}
                onChange={e => setCompany({ ...company, email: e.target.value })}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
            <div>
              <label className="block font-medium text-[var(--text-secondary)] mb-1">Telefone de Contato</label>
              <input
                type="text"
                value={company.phone || ''}
                onChange={e => setCompany({ ...company, phone: e.target.value })}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[var(--text-secondary)] mb-1">Endereço Completo</label>
            <input
              type="text"
              value={company.address || ''}
              onChange={e => setCompany({ ...company, address: e.target.value })}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div className="pt-4 border-t border-[var(--border-subtle)] flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-sm transition-colors flex items-center cursor-pointer"
            >
              <Save className="w-4 h-4 mr-1.5" />
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
