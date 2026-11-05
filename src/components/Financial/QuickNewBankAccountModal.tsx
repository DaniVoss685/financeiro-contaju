import React, { useState } from 'react';
import { Landmark, X, Check, Building2, Wallet, DollarSign, Calendar } from 'lucide-react';
import { BankAccount, BankAccountType } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL } from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface QuickNewBankAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: (account: BankAccount) => void;
  initialData?: {
    name?: string;
    institution?: string;
    agency?: string;
    accountNumber?: string;
    initialBalance?: number;
    bankCode?: string;
  };
}

const POPULAR_BANKS = [
  { code: '077', name: 'Banco Inter', color: '#f97316' },
  { code: '260', name: 'Nubank', color: '#8b5cf6' },
  { code: '341', name: 'Itaú Unibanco', color: '#ea580c' },
  { code: '237', name: 'Bradesco', color: '#dc2626' },
  { code: '001', name: 'Banco do Brasil', color: '#eab308' },
  { code: '104', name: 'Caixa Econômica', color: '#0284c7' },
  { code: '033', name: 'Santander', color: '#e11d48' },
  { code: '756', name: 'Sicoob', color: '#059669' },
  { code: '748', name: 'Sicredi', color: '#16a34a' },
  { code: '000', name: 'Outro / Caixa Local', color: '#64748b' }
];

export const QuickNewBankAccountModal: React.FC<QuickNewBankAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
  initialData
}) => {
  const [institution, setInstitution] = useState(initialData?.institution || 'Banco Inter');
  const [name, setName] = useState(initialData?.name || 'Banco Inter Principal');
  const [bankCode, setBankCode] = useState(initialData?.bankCode || '077');
  const [agency, setAgency] = useState(initialData?.agency || '0001-9');
  const [accountNumber, setAccountNumber] = useState(initialData?.accountNumber || '');
  const [type, setType] = useState<BankAccountType>('CORRENTE');
  const [initialBalance, setInitialBalance] = useState<number>(initialData?.initialBalance || 0);
  const [baseDate, setBaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [color, setColor] = useState('#cdaa58');
  const [errorMsg, setErrorMsg] = useState('');

  // Sincroniza quando initialData mudar
  React.useEffect(() => {
    if (initialData) {
      if (initialData.institution) setInstitution(initialData.institution);
      if (initialData.name) setName(initialData.name);
      if (initialData.bankCode) setBankCode(initialData.bankCode);
      if (initialData.agency) setAgency(initialData.agency);
      if (initialData.accountNumber) setAccountNumber(initialData.accountNumber);
      if (typeof initialData.initialBalance === 'number') setInitialBalance(initialData.initialBalance);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSelectBankPreset = (bank: typeof POPULAR_BANKS[0]) => {
    setInstitution(bank.name);
    setBankCode(bank.code);
    setColor(bank.color);
    if (!name || name === 'Banco Inter Principal' || POPULAR_BANKS.some(b => b.name === name)) {
      setName(`${bank.name} Principal`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim()) {
      setErrorMsg('Informe um nome de identificação para a conta bancária.');
      return;
    }

    try {
      const allAccounts = storage.getBankAccounts();
      
      const newAccount: BankAccount = {
        id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        institution: institution.trim() || 'Instituição Bancária',
        name: name.trim(),
        bankCode: bankCode.trim() || '000',
        agency: agency.trim() || '0001',
        accountNumber: accountNumber.trim() || '00000-0',
        type,
        currency: 'BRL',
        initialBalance: Number(initialBalance) || 0,
        currentBalance: Number(initialBalance) || 0,
        baseDate: baseDate || new Date().toISOString().split('T')[0],
        includeInCashFlow: true,
        status: 'ATIVO',
        color: color || '#cdaa58'
      };

      storage.saveBankAccounts([...allAccounts, newAccount]);

      const currentUser = storage.getCurrentUser();
      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CRIACAO_CONTA_BANCARIA',
        module: 'Conciliação Bancária',
        recordId: newAccount.id,
        details: `Nova conta bancária "${newAccount.name}" (${newAccount.institution}) cadastrada via Conciliação. Saldo Inicial: ${formatBRL(newAccount.initialBalance)}.`
      });

      onAccountCreated(newAccount);
      onClose();
    } catch (err: any) {
      setErrorMsg(`Erro ao salvar conta: ${err.message || 'Falha ao salvar'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div 
        className="bg-white dark:bg-[#131316] rounded-3xl border border-slate-200 dark:border-[#26262b] shadow-2xl max-w-xl w-full flex flex-col max-h-[92vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/60 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Cadastrar Nova Conta Bancária
              </h3>
              <p className="text-xs text-slate-500">
                Disponibilize para conciliação imediata e importação de extratos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Atalhos de Bancos Populares */}
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
              Escolha rápida da Instituição:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {POPULAR_BANKS.slice(0, 10).map(b => (
                <button
                  key={b.code + b.name}
                  type="button"
                  onClick={() => handleSelectBankPreset(b)}
                  className={`p-2 rounded-xl border text-[11px] font-semibold text-center transition-all cursor-pointer truncate ${
                    institution === b.name
                      ? 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-300 font-bold shadow-xs'
                      : 'border-slate-200 dark:border-[#26262b] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Nome da Conta no Sistema *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Inter Principal, Nubank PJ"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Tipo da Conta
              </label>
              <PremiumSelect
                value={type}
                onChange={e => setType(e.target.value as BankAccountType)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
              >
                <option value="CORRENTE" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">Conta Corrente</option>
                <option value="POUPANCA" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">Poupança</option>
                <option value="INVESTIMENTO" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">Aplicação / Investimento</option>
                <option value="CAIXA_FISICO" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">Caixa Físico / Gaveta</option>
              </PremiumSelect>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Código Banco
              </label>
              <input
                type="text"
                value={bankCode}
                onChange={e => setBankCode(e.target.value)}
                placeholder="077"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Agência
              </label>
              <input
                type="text"
                value={agency}
                onChange={e => setAgency(e.target.value)}
                placeholder="0001-9"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono"
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Número da Conta
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                placeholder="1234567-8"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                Saldo Inicial (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={initialBalance}
                onChange={e => setInitialBalance(parseFloat(e.target.value) || 0)}
                placeholder="0,00"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono font-bold"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Saldo na data de início do controle
              </span>
            </div>

            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-sky-500" />
                Data-Base de Abertura
              </label>
              <DateField
                value={baseDate}
                onChange={e => setBaseDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-[#26262b] flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Salvar e Selecionar Conta</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
