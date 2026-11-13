import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Mail, 
  Phone, 
  Eye, 
  Edit2, 
  FileText, 
  TrendingUp, 
  UserPlus, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown,
  ExternalLink,
  Receipt,
  UserMinus,
  UserCheck,
  RotateCcw,
  Ban,
  CheckCircle,
  Sparkles,
  FileSpreadsheet,
  Download,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Counterparty, Contract, FinancialTitle } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { ChurnPredictionEngine } from '../../services/churnPredictionEngine';
import { ClientFinancialHistoryModal } from './ClientFinancialHistoryModal';
import { ImportClientsModal } from '../Modals/ImportClientsModal';
import { CNPJInputField } from '../Common/CNPJInputField';
import { validateFiscalDocument } from '../../utils/cnpjValidator';
import { matchesSearch } from '../../utils/searchUtils';
import { PremiumSelect } from '../Common/PremiumSelect';
import { useIsSimpleMode } from '../../hooks/useViewMode';
import { Card, PageToolbar, Button, StatCard, TabPills } from '../Common/ui';
import { TUsers, TUserPlus, TFile, TWallet } from '../Common/tileIcons';

interface ClientsViewProps {
  initialSearch?: string;
}

export const ClientsView: React.FC<ClientsViewProps> = ({ initialSearch = '' }) => {
  const simple = useIsSimpleMode();
  const [searchTerm, setSearchTerm] = useState(initialSearch);

  React.useEffect(() => {
    if (initialSearch !== undefined) {
      setSearchTerm(initialSearch);
    }
  }, [initialSearch]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ATIVO' | 'COM_CONTRATO' | 'SEM_CONTRATO' | 'RISCO_CHURN' | 'INATIVO'>('ALL');
  const [toastMessage, setToastMessage] = useState<string>('');
  const [selectedClient, setSelectedClient] = useState<Counterparty | null>(null);
  const [selectedContractForModal, setSelectedContractForModal] = useState<string | undefined>(undefined);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Counterparty | null>(null);
  const [docError, setDocError] = useState<string | null>(null);

  const counterparties = storage.getCounterparties();
  const allClientsList = counterparties.filter(c => c.type === 'CLIENTE' || c.type === 'AMBOS');
  const activeClientsCount = allClientsList.filter(c => c.status === 'ATIVO').length;
  const inactiveClientsCount = allClientsList.filter(c => c.status === 'INATIVO').length;

  const contracts = storage.getContracts();
  const activeContractsList = contracts.filter(c => c.status === 'ATIVO');
  const clientsWithActiveContractIds = useMemo(() => {
    return new Set(activeContractsList.map(c => c.customerId));
  }, [activeContractsList]);

  const activeWithContractCount = allClientsList.filter(c => c.status === 'ATIVO' && clientsWithActiveContractIds.has(c.id)).length;
  const activeWithoutContractCount = allClientsList.filter(c => c.status === 'ATIVO' && !clientsWithActiveContractIds.has(c.id)).length;

  // Avaliação Preditiva de Risco de Churn para cada cliente
  const riskAssessments = useMemo(() => {
    return ChurnPredictionEngine.getAllCustomerRiskAssessments();
  }, [counterparties, contracts]);

  const riskAssessmentMap = useMemo(() => {
    return new Map(riskAssessments.map(a => [a.customerId, a]));
  }, [riskAssessments]);

  const atRiskCount = useMemo(() => {
    return riskAssessments.filter(a => a.riskLevel === 'CRITICO' || a.riskLevel === 'ALTO').length;
  }, [riskAssessments]);

  const clients = allClientsList.filter(c => {
    if (statusFilter === 'ATIVO' && c.status !== 'ATIVO') return false;
    if (statusFilter === 'INATIVO' && c.status !== 'INATIVO') return false;
    if (statusFilter === 'COM_CONTRATO' && (c.status !== 'ATIVO' || !clientsWithActiveContractIds.has(c.id))) return false;
    if (statusFilter === 'SEM_CONTRATO' && (c.status !== 'ATIVO' || clientsWithActiveContractIds.has(c.id))) return false;
    if (statusFilter === 'RISCO_CHURN') {
      const risk = riskAssessmentMap.get(c.id);
      if (!risk || (risk.riskLevel !== 'CRITICO' && risk.riskLevel !== 'ALTO')) return false;
    }
    return matchesSearch([c.name, c.tradeName, c.document, c.email, c.phone, c.address, c.notes], searchTerm);
  });

  const titles = storage.getTitles().filter(t => t.type === 'RECEBER');
  const today = new Date().toISOString().split('T')[0];

  const handleToggleClientStatus = (client: Counterparty) => {
    const isActivating = client.status === 'INATIVO';
    const currentUser = storage.getCurrentUser();
    const clientContracts = contracts.filter(c => c.customerId === client.id);
    const activeContracts = clientContracts.filter(c => c.status === 'ATIVO');

    if (isActivating) {
      if (confirm(`Deseja reativar o cliente "${client.name}" na carteira de clientes ativos?`)) {
        const updated = counterparties.map(c => c.id === client.id ? { ...c, status: 'ATIVO' as const } : c);
        storage.saveCounterparties(updated);
        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'REATIVACAO_CLIENTE',
          module: 'Comercial & Clientes',
          recordId: client.id,
          details: `Reativação do cliente ${client.name} na carteira ativa.`
        });
        setToastMessage(`Cliente ${client.name} reativado com sucesso na carteira!`);
        setTimeout(() => setToastMessage(''), 4000);
      }
    } else {
      let promptMsg = `Deseja marcar o cliente "${client.name}" como INATIVO?`;
      if (activeContracts.length > 0) {
        promptMsg += `\n\nEste cliente possui ${activeContracts.length} contrato(s) ativo(s) (${activeContracts.map(c => c.contractNumber).join(', ')}). Deseja também inativar esses contratos para retirá-los da renda da carteira (MRR)?`;
      }

      if (confirm(promptMsg)) {
        const updatedCounterparties = counterparties.map(c => c.id === client.id ? { ...c, status: 'INATIVO' as const } : c);
        storage.saveCounterparties(updatedCounterparties);

        const todayStr = new Date().toISOString().split('T')[0];
        if (activeContracts.length > 0) {
          const allContracts = storage.getContracts();
          const updatedContracts = allContracts.map(ct => {
            if (ct.customerId === client.id && ct.status === 'ATIVO') {
              return {
                ...ct,
                status: 'INATIVO' as const,
                cancellationDate: ct.cancellationDate || todayStr,
                cancellationReason: 'Cliente marcado como inativo no cadastro',
                inactivatedAt: new Date().toISOString(),
                inactivatedBy: currentUser.name
              };
            }
            return ct;
          });
          storage.saveContracts(updatedContracts);
        }

        storage.addAuditLog({
          userName: currentUser.name,
          userRole: currentUser.role,
          action: 'INATIVACAO_CLIENTE',
          module: 'Comercial & Clientes',
          recordId: client.id,
          details: `Inativação do cliente ${client.name} e respectivos contratos.`
        });
        setToastMessage(`Cliente ${client.name} movido para inativos.`);
        setTimeout(() => setToastMessage(''), 4000);
      }
    }
  };

  // Client metrics and KPIs
  const clientMetrics = FinancialEngine.calculateClientMetrics();
  const totalOpenReceivables = titles.reduce((acc, t) => acc + t.balancePrincipal, 0);

  const [formData, setFormData] = useState<Partial<Counterparty>>({
    name: '',
    tradeName: '',
    document: '',
    email: '',
    phone: '',
    address: '',
    status: 'ATIVO',
    notes: ''
  });

  const handleOpenNew = () => {
    setEditingClient(null);
    setDocError(null);
    setFormData({
      name: '',
      tradeName: '',
      document: '',
      email: '',
      phone: '',
      address: '',
      status: 'ATIVO',
      notes: ''
    });
    setIsFormOpen(true);
  };

  const handleEdit = (client: Counterparty) => {
    setEditingClient(client);
    setDocError(null);
    setFormData(client);
    setIsFormOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    // Validação estrita de CNPJ / CPF para integridade fiscal
    if (formData.document?.trim()) {
      const fiscalCheck = validateFiscalDocument(formData.document);
      if (fiscalCheck.status === 'invalid') {
        setDocError(fiscalCheck.message);
        return;
      }
    }
    setDocError(null);

    const all = storage.getCounterparties();
    const currentUser = storage.getCurrentUser();

    if (editingClient) {
      const updated = all.map(c => c.id === editingClient.id ? { ...c, ...formData } as Counterparty : c);
      storage.saveCounterparties(updated);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'EDICAO_CLIENTE',
        module: 'Comercial & Clientes',
        recordId: editingClient.id,
        details: `Atualização cadastral do cliente ${formData.name} (CNPJ/CPF: ${formData.document || 'N/A'}, Status: ${formData.status || 'ATIVO'}, Tel: ${formData.phone || 'N/A'}).`
      });
    } else {
      const newClient: Counterparty = {
        id: `cli-${Date.now()}`,
        type: 'CLIENTE',
        name: formData.name!,
        tradeName: formData.tradeName || '',
        document: formData.document || '',
        email: formData.email || '',
        phone: formData.phone || '',
        address: formData.address || '',
        status: formData.status as 'ATIVO' | 'INATIVO' || 'ATIVO',
        notes: formData.notes || '',
        createdAt: new Date().toISOString().split('T')[0]
      };
      storage.saveCounterparties([...all, newClient]);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CADASTRO_CLIENTE',
        module: 'Comercial & Clientes',
        recordId: newClient.id,
        details: `Cadastro do novo cliente ${newClient.name} (CNPJ/CPF: ${newClient.document || 'N/A'}, Tel: ${newClient.phone || 'N/A'}, Email: ${newClient.email || 'N/A'}).`
      });
    }

    setIsFormOpen(false);
  };

  const handleOpenClientHistory = (client: Counterparty, contractId?: string) => {
    setSelectedClient(client);
    setSelectedContractForModal(contractId);
  };

  // Exportação da base de clientes para Excel (.xlsx)
  const handleExportClients = () => {
    if (clients.length === 0) {
      alert('Nenhum cliente para exportar com base nos filtros atuais.');
      return;
    }

    const exportRows = clients.map(client => {
      const clientContracts = contracts.filter(c => c.customerId === client.id);
      const activeContracts = clientContracts.filter(c => c.status === 'ATIVO');
      const clientMRR = activeContracts.reduce((sum, c) => sum + (c.monthlyTotal || 0), 0);
      const clientOpenReceivables = titles
        .filter(t => t.counterpartyId === client.id && t.balancePrincipal > 0)
        .reduce((sum, t) => sum + t.balancePrincipal, 0);

      return {
        'Razão Social / Nome': client.name,
        'Nome Fantasia': client.tradeName || '',
        'CNPJ / CPF': client.document || '',
        'Status': client.status,
        'E-mail Financeiro': client.email || '',
        'Telefone / WhatsApp': client.phone || '',
        'Endereço Comercial': client.address || '',
        'Contratos Ativos': activeContracts.length,
        'MRR Mensal (R$)': clientMRR,
        'Saldo a Receber Aberto (R$)': clientOpenReceivables,
        'Data de Cadastro': client.createdAt || '',
        'Observações': client.notes || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);

    ws['!cols'] = [
      { wch: 36 }, // Razão Social / Nome
      { wch: 25 }, // Nome Fantasia
      { wch: 20 }, // CNPJ / CPF
      { wch: 12 }, // Status
      { wch: 30 }, // E-mail
      { wch: 18 }, // Telefone
      { wch: 40 }, // Endereço
      { wch: 16 }, // Contratos Ativos
      { wch: 18 }, // MRR Mensal
      { wch: 26 }, // Saldo a Receber
      { wch: 16 }, // Data de Cadastro
      { wch: 40 }  // Observações
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes_Contaju');
    const todayStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `clientes_contaju_exportacao_${todayStr}.xlsx`);

    // Log de Auditoria
    const currentUser = storage.getCurrentUser();
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'EXPORTACAO_RELATORIO',
      module: 'Comercial & Clientes',
      recordId: `exp-cli-${Date.now()}`,
      details: `Exportação em planilha Excel de ${clients.length} clientes da carteira comercial.`
    });

    setToastMessage(`✓ ${clients.length} cliente(s) exportados com sucesso para Excel!`);
    setTimeout(() => setToastMessage(''), 4000);
  };

  return (
    <div className="space-y-6">
      
      <PageToolbar description="Carteira de clientes com histórico de pagamentos, contratos ativos e encerrados, atrasos e movimentações.">
        <Button
          variant="secondary"
          icon={<Download className="w-4 h-4" />}
          onClick={handleExportClients}
          title="Exportar os clientes exibidos para planilha Excel (.xlsx)"
        >
          Exportar
        </Button>
        <Button
          variant="secondary"
          icon={<FileSpreadsheet className="w-4 h-4" />}
          onClick={() => setIsImportModalOpen(true)}
          title="Importar vários clientes de uma planilha Excel (.xlsx) ou CSV"
        >
          Importar planilha
        </Button>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleOpenNew}>
          Novo cliente
        </Button>
      </PageToolbar>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Clientes ativos" icon={<TUsers />} accent="info"
          value={clientMetrics.activeClients}
          hint={`Base total de ${clientMetrics.totalClients} (${clientMetrics.activePercentage}% ativos)`}
        />
        <StatCard
          label="Novos no período" icon={<TUserPlus />} accent="success"
          value={`+${clientMetrics.newClientsPeriod}`}
          hint={`Expansão de ${clientMetrics.growthRate > 0 ? '+' : ''}${clientMetrics.growthRate}% no mês`}
        />
        <StatCard
          label="Com contrato recorrente" icon={<TFile />} accent="gold"
          value={
            <>
              {clientMetrics.clientsWithActiveContracts}
              <span className="text-sm font-normal text-[var(--text-muted)]"> de {clientMetrics.activeClients}</span>
            </>
          }
          hint={`${clientMetrics.contractCoveragePercentage}% da carteira`}
        />
        <StatCard
          label="Saldo em aberto" icon={<TWallet />} accent="gold"
          value={formatBRL(totalOpenReceivables)}
          hint={`Ticket médio ${formatBRL(clientMetrics.averageTicketPerClient)}/mês`}
        />
      </div>

      {toastMessage && (
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] flex items-center gap-3 text-sm text-[var(--text-primary)]">
          <CheckCircle className="w-4 h-4 text-[var(--status-success)] shrink-0" />
          <span className="flex-1">{toastMessage}</span>
          <button onClick={() => setToastMessage('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer" aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      )}

      {/* Abas de situação e busca */}
      <Card className="space-y-4">
        <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4">
          <div className="min-w-0 2xl:flex-1">
            <TabPills
              tabs={[
                { id: 'ALL', label: 'Todos', count: allClientsList.length },
                { id: 'ATIVO', label: 'Ativos', count: activeClientsCount },
                { id: 'COM_CONTRATO', label: 'Com contrato', count: activeWithContractCount },
                { id: 'SEM_CONTRATO', label: 'Avulsos', count: activeWithoutContractCount },
                { id: 'RISCO_CHURN', label: 'Risco de churn', count: atRiskCount },
                { id: 'INATIVO', label: 'Inativos', count: inactiveClientsCount }
              ]}
              value={statusFilter}
              onChange={id => setStatusFilter(id as any)}
            />
          </div>
          <div className="relative w-full 2xl:w-80 shrink-0">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por razão social, fantasia ou CNPJ"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 pl-10 pr-4 text-sm rounded-xl border border-[var(--border-highlight)]"
            />
          </div>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {activeClientsCount} clientes com cadastro ativo: {activeWithContractCount} com contrato recorrente (MRR) e {activeWithoutContractCount} avulsos.
        </p>
      </Card>

      {/* Table */}
      <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4 adv-only">CNPJ / CPF</th>
                <th className="py-3 px-4 min-w-[200px]">Contratos ativos</th>
                <th className="py-3 px-4">Contatos</th>
                <th className="py-3 px-4 text-right">Saldo em Aberto</th>
                <th className="py-3 px-4 text-center">Atrasos</th>
                <th className="py-3 px-4 text-center adv-only">Health Score (Risco)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {clients.map(client => {
                const clientTitles = titles.filter(t => t.counterpartyId === client.id);
                const openBalance = clientTitles.reduce((acc, t) => acc + t.balancePrincipal, 0);
                const clientContracts = contracts.filter(c => c.customerId === client.id);
                const activeContracts = clientContracts.filter(c => c.status === 'ATIVO');
                const cancelledOrInactiveContracts = clientContracts.filter(c => c.status === 'CANCELADO' || c.status === 'INATIVO');
                const closedContracts = clientContracts.filter(c => c.status === 'ENCERRADO' || c.status === 'SUSPENSO');
                const lastCancelledContract = cancelledOrInactiveContracts.find(c => c.cancellationDate);
                
                const clientDelays = clientTitles.filter(t => t.balancePrincipal > 0 && t.dueDate < today);
                const totalDelayDays = clientDelays.reduce((acc, t) => {
                  const diff = Math.max(0, Math.floor((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000));
                  return acc + diff;
                }, 0);
                const maxDelayDays = clientDelays.reduce((max, t) => {
                  const diff = Math.max(0, Math.floor((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000));
                  return Math.max(max, diff);
                }, 0);

                return (
                  <tr key={client.id} className="hover:bg-[var(--surface-elevated)]/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[var(--text-primary)]">{client.name}</div>
                      {client.tradeName && (
                        <div className="text-[11px] text-[var(--text-secondary)]">{client.tradeName}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--text-secondary)] adv-only">{client.document || '-'}</td>
                    
                    {/* MENU DROPDOWN DE VINCULAÇÃO COM CONTRATOS ATIVOS */}
                    <td className="py-3 px-4">
                      {activeContracts.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenClientHistory(client, activeContracts.length === 1 ? activeContracts[0].id : undefined)}
                          className="inline-flex items-center gap-2 h-8 px-3 rounded-full text-xs font-semibold bg-[var(--status-success-bg)] text-[var(--status-success)] hover:brightness-110 transition cursor-pointer"
                          title="Ver os contratos deste cliente"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-success)]" />
                          {activeContracts.length === 1 ? '1 contrato ativo' : `${activeContracts.length} contratos ativos`}
                          <span className="font-normal opacity-80 tabular-nums">• {formatBRL(activeContracts.reduce((acc, c) => acc + (Number(c.monthlyTotal) || 0), 0))}/mês</span>
                        </button>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <span className="text-[10px] text-[var(--text-secondary)] bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-2 py-0.5 rounded">
                            Sem contrato ativo
                          </span>
                          {closedContracts.length > 0 && (
                            <span className="text-[10px] text-slate-400" title={`${closedContracts.length} contrato(s) encerrado(s)`}>
                              ({closedContracts.length} encerrado)
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 space-y-0.5">
                      {client.email && (
                        <div className="flex items-center text-[var(--text-secondary)] text-[11px]">
                          <Mail className="w-3 h-3 mr-1 text-[var(--text-secondary)]" />
                          {client.email}
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center text-[var(--text-secondary)] text-[11px]">
                          <Phone className="w-3 h-3 mr-1 text-[var(--text-secondary)]" />
                          {client.phone}
                        </div>
                      )}
                    </td>
                    
                    <td className="py-3 px-4 text-right font-bold font-mono text-[var(--text-primary)]">
                      {formatBRL(openBalance)}
                    </td>

                    {/* Inadimplência / Atrasos */}
                    <td className="py-3 px-4 text-center">
                      {clientDelays.length > 0 ? (
                        <span 
                          onClick={() => handleOpenClientHistory(client)}
                          className="cursor-pointer inline-flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 transition-colors"
                          title={`${clientDelays.length} título(s) vencido(s). Máximo de ${maxDelayDays} dias.`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>{clientDelays.length} vencido(s) ({maxDelayDays}d)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Em dia</span>
                        </span>
                      )}
                    </td>

                    {/* Health Score & Risco de Churn */}
                    <td className="py-3 px-4 text-center adv-only">
                      {(() => {
                        const risk = riskAssessmentMap.get(client.id);
                        if (!risk) {
                          return <span className="text-[10px] text-[var(--text-muted)]">-</span>;
                        }
                        return (
                          <div 
                            className="flex flex-col items-center gap-0.5 cursor-help"
                            title={`Health Score: ${risk.healthScore}/100\nFatores: ${risk.riskFactors.join(' | ')}\nRecomendação: ${risk.recommendedAction}`}
                          >
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                              risk.riskLevel === 'CRITICO' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                              risk.riskLevel === 'ALTO' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                              risk.riskLevel === 'MODERADO' ? 'bg-blue-500/15 text-blue-400 border-blue-500/30' :
                              'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            }`}>
                              {risk.riskLevel === 'CRITICO' || risk.riskLevel === 'ALTO' ? (
                                <ShieldAlert className="w-3 h-3 shrink-0" />
                              ) : (
                                <ShieldCheck className="w-3 h-3 shrink-0" />
                              )}
                              <span>{risk.healthScore}/100</span>
                            </span>
                            <span className="text-[9px] text-[var(--text-muted)] font-mono font-medium">
                              {risk.riskLevel}
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                          client.status === 'ATIVO' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${client.status === 'ATIVO' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                          {client.status}
                        </span>

                        {lastCancelledContract?.cancellationDate && (
                          <span 
                            className="text-[9px] text-rose-400 font-medium"
                            title={lastCancelledContract.cancellationReason ? `Motivo: ${lastCancelledContract.cancellationReason}` : undefined}
                          >
                            Parou em {formatDateBR(lastCancelledContract.cancellationDate)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right space-x-1.5">
                      {client.status === 'ATIVO' ? (
                        <button
                          onClick={() => handleToggleClientStatus(client)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors inline-flex items-center text-xs"
                          title="Inativar este cliente e respectivos contratos"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleClientStatus(client)}
                          className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors inline-flex items-center text-xs"
                          title="Reativar este cliente na carteira ativa"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenClientHistory(client)}
                        className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors inline-flex items-center text-xs font-semibold"
                        title="Ver histórico de pagamentos, contratos e movimentações"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        <span>Ficha</span>
                      </button>
                      <button
                        onClick={() => handleEdit(client)}
                        className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] rounded-lg transition-colors"
                        title="Editar cadastro"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* COMPREHENSIVE CLIENT FINANCIAL FILE & FULL HISTORY MODAL */}
      {selectedClient && (
        <ClientFinancialHistoryModal
          client={selectedClient}
          initialContractId={selectedContractForModal}
          onClose={() => {
            setSelectedClient(null);
            setSelectedContractForModal(undefined);
          }}
          onEditClient={handleEdit}
        />
      )}

      {/* New / Edit Client Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-[var(--border-subtle)] text-[var(--text-primary)]">
            <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                {editingClient ? 'Editar cliente' : (simple ? 'Novo cliente' : 'Novo Cliente Contaju')}
              </h2>
              <button 
                onClick={() => setIsFormOpen(false)} 
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-3.5 text-xs">
              {docError && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center font-medium">
                  <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" />
                  <span>{docError}</span>
                </div>
              )}

              {/* 1. CNPJ / CPF no topo com Auto-Preenchimento Oficial */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-amber-500 dark:text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>CNPJ do Cliente (Auto-Preenchimento Oficial)</span>
                  </span>
                  <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-normal">
                    Puxa dados da Receita Federal
                  </span>
                </div>
                <CNPJInputField
                  id="client-cnpj-input"
                  value={formData.document || ''}
                  onChange={(maskedVal) => {
                    setFormData(prev => ({ ...prev, document: maskedVal }));
                    if (docError) setDocError(null);
                  }}
                  onDataFetched={(receita) => {
                    setFormData(prev => ({
                      ...prev,
                      name: receita.razaoSocial || prev.name,
                      tradeName: receita.nomeFantasia || prev.tradeName,
                      document: receita.formattedCnpj,
                      // A Receita não divulga a rua de alguns CNPJs (empresário individual): nesse caso
                      // não troca um endereço que já tem rua e número por um incompleto.
                      address: receita.logradouro || !prev.address ? receita.enderecoCompleto || prev.address : prev.address,
                      phone: prev.phone || receita.telefone,
                      email: prev.email || receita.email,
                      notes: prev.notes ? `${prev.notes}\n[CNAE: ${receita.cnaeCodigo} - ${receita.cnaeDescricao}]` : `CNAE: ${receita.cnaeCodigo} - ${receita.cnaeDescricao}. Situação: ${receita.situacaoCadastral}.`
                    }));
                  }}
                  label="Digite ou Cole o CNPJ *"
                  required
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">{simple ? 'Nome *' : 'Razão Social / Nome Completo *'}</label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="adv-only">
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={formData.tradeName || ''}
                  onChange={e => setFormData({ ...formData, tradeName: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">{simple ? 'E-mail' : 'E-mail Financeiro'}</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    value={formData.phone || ''}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">{simple ? 'Endereço' : 'Endereço Comercial'}</label>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400"
                />
                {(formData.address || '').trim() && !(formData.address || '').includes(',') ? (
                  <p className="mt-1.5 text-xs text-[var(--status-warning)] leading-relaxed">
                    Falta a rua e o número. A Receita não divulga o endereço completo de alguns CNPJs (empresário individual). Digite assim: RUA TAL, 310 - BAIRRO - CIDADE/UF - CEP: 00000-000
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">Modelo: RUA TAL, 310 - BAIRRO - CIDADE/UF - CEP: 00000-000. É usado nas notas fiscais.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Status</label>
                  <PremiumSelect
                    value={formData.status || 'ATIVO'}
                    onChange={e => setFormData({ ...formData, status: e.target.value as 'ATIVO' | 'INATIVO' })}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400"
                  >
                    <option value="ATIVO">ATIVO</option>
                    <option value="INATIVO">INATIVO</option>
                  </PremiumSelect>
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Observações</label>
                  <input
                    type="text"
                    value={formData.notes || ''}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-[#0b0b0d] bg-amber-400 hover:bg-amber-300 rounded-xl shadow-[0_0_12px_rgba(245,158,11,0.25)] transition-all"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importação de Clientes em Lote */}
      <ImportClientsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={(createdCount, updatedCount, contractsCount) => {
          let msg = `✓ Importação concluída! ${createdCount} novo(s) cliente(s) cadastrado(s) e ${updatedCount} atualizado(s).`;
          if (contractsCount > 0) {
            msg += ` ${contractsCount} contrato(s) ativo(s) gerados automaticamente!`;
          }
          setToastMessage(msg);
          setTimeout(() => setToastMessage(''), 6000);
        }}
      />

    </div>
  );
};
