import React, { useState, useEffect, useMemo } from 'react';
import { MoneyField } from '../Common/MoneyField';
import { Landmark, Plus, ArrowLeftRight, Edit2, Wallet, CheckCircle2, Building, Calculator, Coins, FileText, Scale } from 'lucide-react';
import { BankAccount } from '../../types';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL } from '../../services/financialEngine';
import { CashCalculatorModal } from './CashCalculatorModal';
import { BankAccountStatementModal } from './BankAccountStatementModal';
import { BankBalanceClosingModal } from './BankBalanceClosingModal';
import { PremiumSelect } from '../Common/PremiumSelect';
import { Card, PageToolbar, Button, MoreMenu } from '../Common/ui';

interface BankAccountsViewProps {
  onOpenTransferModal: () => void;
}

export const BankAccountsView: React.FC<BankAccountsViewProps> = ({ onOpenTransferModal }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [isCashCalcOpen, setIsCashCalcOpen] = useState(false);
  const [selectedCashAccount, setSelectedCashAccount] = useState<BankAccount | null>(null);
  const [statementAccount, setStatementAccount] = useState<BankAccount | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingAccount, setClosingAccount] = useState<BankAccount | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    return storage.subscribe(() => {
      setDataVersion(v => v + 1);
    });
  }, []);

  const accounts = useMemo(() => storage.getBankAccounts(), [dataVersion]);
  const consolidated = useMemo(() => FinancialEngine.getConsolidatedCashBalance(), [dataVersion]);

  const handleOpenStatement = (acc: BankAccount) => {
    setStatementAccount(acc);
    setIsStatementOpen(true);
  };

  const handleOpenCashCalculator = (acc?: BankAccount) => {
    if (acc) {
      setSelectedCashAccount(acc);
    } else {
      // Find first physical cash account or fallback to first account
      const cashAcc = accounts.find(a => a.type === 'CAIXA_FISICO') || accounts[0];
      setSelectedCashAccount(cashAcc);
    }
    setIsCashCalcOpen(true);
  };

  const [formData, setFormData] = useState<Partial<BankAccount>>({
    name: '',
    bankCode: '000',
    agency: '',
    accountNumber: '',
    type: 'CORRENTE',
    initialBalance: 0,
    status: 'ATIVO'
  });

  const handleOpenNew = () => {
    setEditingAccount(null);
    setFormData({
      name: '',
      bankCode: '341',
      agency: '1234',
      accountNumber: '56789-0',
      type: 'CORRENTE',
      initialBalance: 0,
      status: 'ATIVO'
    });
    setIsModalOpen(true);
  };

  const handleEdit = (acc: BankAccount) => {
    setEditingAccount(acc);
    setFormData(acc);
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    const all = storage.getBankAccounts();
    const currentUser = storage.getCurrentUser();

    if (editingAccount) {
      const updated = all.map(a => a.id === editingAccount.id ? { ...a, ...formData } as BankAccount : a);
      storage.saveBankAccounts(updated);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'EDICAO_CONTA_BANCARIA',
        module: 'Bancos e Contas',
        recordId: editingAccount.id,
        details: `Atualização de dados da conta ${formData.name}.`
      });
    } else {
      const newAcc: BankAccount = {
        id: `acc-${Date.now()}`,
        name: formData.name!,
        institution: formData.institution || formData.name || 'Banco',
        bankCode: formData.bankCode || '000',
        agency: formData.agency || '',
        accountNumber: formData.accountNumber || '',
        type: formData.type as any || 'CORRENTE',
        currency: 'BRL',
        initialBalance: Number(formData.initialBalance) || 0,
        currentBalance: Number(formData.initialBalance) || 0,
        baseDate: new Date().toISOString().split('T')[0],
        includeInCashFlow: true,
        status: formData.status as any || 'ATIVO',
        color: '#4338ca'
      };
      storage.saveBankAccounts([...all, newAcc]);
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CADASTRO_CONTA_BANCARIA',
        module: 'Bancos e Contas',
        recordId: newAcc.id,
        details: `Cadastro de nova conta bancária ${newAcc.name} (Saldo inicial: ${formatBRL(newAcc.initialBalance)}).`
      });
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      
      <PageToolbar description="Contas correntes, aplicações de liquidez imediata e caixas físicos.">
        <MoreMenu
          items={[
            {
              label: 'Conferência de saldos (fechamento)',
              icon: <Scale className="w-4 h-4" />,
              onClick: () => {
                setClosingAccount(null);
                setIsClosingModalOpen(true);
              },
              hint: 'Compara o saldo do sistema com o saldo real do banco'
            },
            {
              label: 'Calculadora de caixa físico',
              icon: <Calculator className="w-4 h-4" />,
              onClick: () => handleOpenCashCalculator(),
              hint: 'Contagem de cédulas e moedas'
            }
          ]}
        />
        <Button variant="secondary" icon={<ArrowLeftRight className="w-4 h-4" />} onClick={onOpenTransferModal}>
          Nova transferência
        </Button>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={handleOpenNew}>
          Cadastrar conta
        </Button>
      </PageToolbar>

      <Card hero className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
        <div>
          <p className="text-sm text-[var(--text-secondary)]">Disponibilidade líquida consolidada</p>
          <p className="mt-2 text-[32px] leading-10 font-semibold tracking-tight tabular-nums">{formatBRL(consolidated)}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Total disponível em todas as contas ativas do escritório</p>
        </div>
        <p className="text-sm text-[var(--text-muted)]">{accounts.length} contas ativas</p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
        {accounts.map(acc => {
          const balance = FinancialEngine.getAccountBalance(acc.id);
          return (
            <div
              key={acc.id}
              onDoubleClick={() => handleOpenStatement(acc)}
              className="bg-[var(--surface-card)] p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] flex flex-col justify-between hover:border-[var(--border-highlight)] transition-colors cursor-pointer group"
              title="Dê dois cliques para abrir o extrato completo e as movimentações"
            >
              <div>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate">{acc.name}</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-1 tabular-nums">
                      {[acc.agency && `Ag ${acc.agency}`, acc.accountNumber && `CC ${acc.accountNumber}`].filter(Boolean).join(' • ') || 'Sem dados bancários'}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0 -mr-2 -mt-1">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenStatement(acc);
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                      title="Ver extrato completo"
                      aria-label={`Ver extrato de ${acc.name}`}
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleEdit(acc);
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
                      title="Editar conta"
                      aria-label={`Editar ${acc.name}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <span className="inline-flex items-center h-6 px-2.5 mt-3 rounded-full bg-[var(--surface-elevated)] text-xs text-[var(--text-secondary)]">
                  {acc.type}
                </span>
              </div>

              <div className="mt-6 pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-sm text-[var(--text-muted)]">Saldo atual</p>
                <p className={`mt-1 text-[22px] leading-7 font-semibold tracking-tight tabular-nums ${balance < 0 ? 'text-[var(--status-danger)]' : ''}`}>
                  {formatBRL(balance)}
                </p>

                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  {acc.type === 'CAIXA_FISICO' && (
                    <Button
                      variant="secondary"
                      className="h-9 flex-1"
                      icon={<Calculator className="w-4 h-4" />}
                      onClick={e => {
                        e.stopPropagation();
                        handleOpenCashCalculator(acc);
                      }}
                    >
                      Contar cédulas
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    className="h-9 flex-1"
                    icon={<Scale className="w-4 h-4" />}
                    title="Conferir o saldo do sistema com o saldo real no banco"
                    onClick={e => {
                      e.stopPropagation();
                      setClosingAccount(acc);
                      setIsClosingModalOpen(true);
                    }}
                  >
                    Conferir com o banco
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cash Calculator Modal */}
      {selectedCashAccount && (
        <CashCalculatorModal
          isOpen={isCashCalcOpen}
          onClose={() => setIsCashCalcOpen(false)}
          bankAccount={selectedCashAccount}
          onSuccess={() => {}}
        />
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 bg-slate-50">
              <h2 className="text-base font-semibold text-slate-900">
                {editingAccount ? 'Editar Conta Bancária' : 'Nova Conta Bancária'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nome da Conta / Banco *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Itaú Unibanco PJ"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-1.5"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tipo de Conta</label>
                  <PremiumSelect
                    value={formData.type || 'CORRENTE'}
                    onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full rounded border border-slate-300 px-3 py-1.5"
                  >
                    <option value="CORRENTE">Conta Corrente</option>
                    <option value="POUPANCA">Poupança / Aplicação</option>
                    <option value="CAIXA_FISICO">Caixa Físico</option>
                    <option value="PAGAMENTO">Conta de Pagamento</option>
                  </PremiumSelect>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Cód. Banco</label>
                  <input
                    type="text"
                    value={formData.bankCode || ''}
                    onChange={e => setFormData({ ...formData, bankCode: e.target.value })}
                    className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Agência</label>
                  <input
                    type="text"
                    value={formData.agency || ''}
                    onChange={e => setFormData({ ...formData, agency: e.target.value })}
                    className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Número da Conta</label>
                  <input
                    type="text"
                    value={formData.accountNumber || ''}
                    onChange={e => setFormData({ ...formData, accountNumber: e.target.value })}
                    className="w-full rounded border border-slate-300 px-3 py-1.5 font-mono"
                  />
                </div>
              </div>

              {!editingAccount && (
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Saldo Inicial (R$)</label>
                  <MoneyField value={Number(formData.initialBalance) || 0} onChange={(v: number) => setFormData({ ...formData, initialBalance: v })} className="w-full rounded border border-slate-300 px-3 py-1.5 font-bold" />
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm"
                >
                  Salvar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Account Statement Modal (aberto com 2 cliques na conta) */}
      {isStatementOpen && statementAccount && (
        <BankAccountStatementModal
          isOpen={isStatementOpen}
          onClose={() => {
            setIsStatementOpen(false);
            setStatementAccount(null);
          }}
          account={statementAccount}
        />
      )}

      {/* Modal de Conferência de Saldos Bancários & Fechamento Perfeito */}
      <BankBalanceClosingModal
        isOpen={isClosingModalOpen}
        onClose={() => {
          setIsClosingModalOpen(false);
          setClosingAccount(null);
        }}
        defaultAccountId={closingAccount?.id || 'ALL'}
        onSuccess={() => {}}
      />

    </div>
  );
};
