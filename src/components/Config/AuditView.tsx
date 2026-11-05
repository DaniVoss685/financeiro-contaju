import React, { useState } from 'react';
import { History, Search, Download, FileSpreadsheet, ShieldCheck, Filter } from 'lucide-react';
import { storage } from '../../services/storageService';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { formatDateBR } from '../../services/financialEngine';
import { matchesSearch } from '../../utils/searchUtils';
import { PremiumSelect } from '../Common/PremiumSelect';

export const AuditView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');

  const logs = storage.getAuditLogs().sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const modules = Array.from(new Set(logs.map(l => l.module)));

  const filteredLogs = logs.filter(l => {
    if (moduleFilter !== 'ALL' && l.module !== moduleFilter) return false;
    if (searchTerm) {
      const match = matchesSearch([
        l.action,
        l.details,
        l.userName,
        l.module,
        l.recordId
      ], searchTerm);
      if (!match) return false;
    }
    return true;
  });

  const handleExportExcel = () => {
    const headers = ['Data/Hora', 'Usuário', 'Perfil', 'Módulo', 'Ação', 'Registro ID', 'Detalhes'];
    const rows = filteredLogs.map(l => [
      l.timestamp,
      l.userName,
      l.userRole,
      l.module,
      l.action,
      l.recordId || '-',
      l.details
    ]);
    exportToExcel('trilha-auditoria', 'Auditoria', headers, rows);
  };

  const handleExportCSV = () => {
    const headers = ['Data/Hora', 'Usuário', 'Perfil', 'Módulo', 'Ação', 'Registro ID', 'Detalhes'];
    const rows = filteredLogs.map(l => [
      l.timestamp,
      l.userName,
      l.userRole,
      l.module,
      l.action,
      l.recordId || '-',
      l.details
    ]);
    exportToCSV('trilha-auditoria', headers, rows);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Trilha de Auditoria & Governança Imutável
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Registro criptográfico e sequencial de todas as operações, liquidações, ajustes e travas do sistema.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-all flex items-center shadow-2xs cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400" />
            Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-[var(--surface-elevated)] hover:bg-slate-200 dark:hover:bg-[#1B212D] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-all flex items-center shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
            CSV
          </button>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="bg-[var(--surface-card)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-amber-500" />
          <label className="font-semibold text-[var(--text-secondary)]">Módulo:</label>
          <PremiumSelect
            value={moduleFilter}
            onChange={e => setModuleFilter(e.target.value)}
            className="rounded-xl border border-[var(--border-subtle)] px-2.5 py-1.5 bg-[var(--surface-elevated)] text-[var(--text-primary)] text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
          >
            <option value="ALL">Todos os Módulos ({logs.length})</option>
            {modules.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </PremiumSelect>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
          <input
            type="text"
            placeholder="Buscar por usuário, ação, ID ou detalhe..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabela de Logs */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-elevated)]/60 border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Data e Hora</th>
                <th className="py-3 px-4">Usuário</th>
                <th className="py-3 px-4">Módulo</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Detalhes da Operação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--text-secondary)]">
                    Nenhum registro de auditoria encontrado para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(l => (
                  <tr key={l.id} className="hover:bg-[var(--surface-elevated)]/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[var(--text-secondary)] whitespace-nowrap text-[11px]">
                      {l.timestamp ? new Date(l.timestamp).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                      }) : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{l.userName}</div>
                      <div className="text-[10px] text-[var(--text-secondary)] font-mono">{l.userRole}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                        {l.module}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-amber-700 dark:text-amber-300 font-mono text-[11px]">
                        {l.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[var(--text-secondary)] text-[11px] leading-relaxed max-w-md">
                      {l.details}
                      {l.recordId && (
                        <span className="block text-[10px] font-mono text-[var(--text-secondary)] mt-0.5 opacity-80">
                          Ref ID: {l.recordId}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
