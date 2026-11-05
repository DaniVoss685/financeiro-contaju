import React, { useState, useId } from 'react';
import { X, CreditCard as CardIcon, Building2, Calendar, DollarSign, Palette, Trash2, AlertTriangle, Check, Landmark, Search } from 'lucide-react';
import { CreditCard, BankAccount } from '../../types';
import { storage } from '../../services/storageService';
import { BRAZILIAN_BANKS, POPULAR_BANKS_FOR_CARDS, BrazilianBank, findBankByTerm } from '../../data/brazilianBanks';
import { PremiumSelect } from '../Common/PremiumSelect';

interface CreditCardFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  bankAccounts: BankAccount[];
  editingCard?: CreditCard | null;
  onSuccess: () => void;
}

const BRAND_OPTIONS = [
  { value: 'MASTERCARD', label: 'Mastercard' },
  { value: 'VISA', label: 'Visa' },
  { value: 'ELO', label: 'Elo' },
  { value: 'AMEX', label: 'American Express' },
  { value: 'OUTRO', label: 'Outro' }
];

const COLOR_PRESETS = [
  { label: 'Roxo Nubank', value: '#820ad1' },
  { label: 'Laranja Itaú / Inter', value: '#ec7000' },
  { label: 'Vermelho Santander / Bradesco', value: '#cc092f' },
  { label: 'Azul BB / Caixa', value: '#003882' },
  { label: 'Verde Sicoob / Sicredi', value: '#00843d' },
  { label: 'Grafite / Preto C6 / XP', value: '#242424' },
  { label: 'Dourado / Gold', value: '#b45309' },
  { label: 'Azul Petróleo / BTG', value: '#0a2540' }
];

export const CreditCardFormModal: React.FC<CreditCardFormModalProps> = ({
  isOpen,
  onClose,
  bankAccounts,
  editingCard,
  onSuccess
}) => {
  const [name, setName] = useState(editingCard?.name || '');
  const [selectedBankCode, setSelectedBankCode] = useState<string>(() => {
    if (editingCard?.institution) {
      const found = findBankByTerm(editingCard.institution);
      return found ? found.code : '000';
    }
    return '260'; // Nubank por padrão
  });
  const [institution, setInstitution] = useState(editingCard?.institution || 'Nubank');
  const [brand, setBrand] = useState<CreditCard['brand']>(editingCard?.brand || 'MASTERCARD');
  const [lastFourDigits, setLastFourDigits] = useState(editingCard?.lastFourDigits || '');
  const [creditLimit, setCreditLimit] = useState(editingCard?.creditLimit ? String(editingCard.creditLimit) : '10000');
  const [closingDay, setClosingDay] = useState(editingCard?.closingDay ? String(editingCard.closingDay) : '25');
  const [dueDay, setDueDay] = useState(editingCard?.dueDay ? String(editingCard.dueDay) : '5');
  const [color, setColor] = useState(editingCard?.color || '#820ad1');
  const [defaultPaymentBankAccountId, setDefaultPaymentBankAccountId] = useState(
    editingCard?.defaultPaymentBankAccountId || bankAccounts[0]?.id || ''
  );
  const [notes, setNotes] = useState(editingCard?.notes || '');
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  if (!isOpen) return null;

  const handleBankSelect = (bank: BrazilianBank) => {
    setSelectedBankCode(bank.code);
    setInstitution(bank.name);
    setColor(bank.color);
    if (bank.suggestedBrand && bank.suggestedBrand !== 'OUTRO') {
      setBrand(bank.suggestedBrand);
    }
    // Se o nome estiver em branco ou for nome padrão de outro banco, atualiza automaticamente
    if (!name || BRAZILIAN_BANKS.some(b => name === `${b.name} Corporativo` || name === `${b.name} PJ`)) {
      setName(`${bank.name} Corporativo`);
    }
  };

  const handleDropdownChange = (code: string) => {
    setSelectedBankCode(code);
    const bank = BRAZILIAN_BANKS.find(b => b.code === code);
    if (bank) {
      if (bank.code === '000') {
        setInstitution('');
      } else {
        setInstitution(bank.name);
        setColor(bank.color);
        if (bank.suggestedBrand && bank.suggestedBrand !== 'OUTRO') {
          setBrand(bank.suggestedBrand);
        }
        if (!name || BRAZILIAN_BANKS.some(b => name === `${b.name} Corporativo` || name === `${b.name} PJ`)) {
          setName(`${bank.name} Corporativo`);
        }
      }
    }
  };

  const handleDeleteCard = () => {
    if (!editingCard) return;
    const res = storage.deleteCreditCard(editingCard.id);
    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setError(res.error || 'Erro ao excluir o cartão de crédito.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Por favor, informe o nome descritivo do cartão.');
      return;
    }

    const limitNum = parseFloat(creditLimit);
    if (isNaN(limitNum) || limitNum <= 0) {
      setError('Informe um limite de crédito válido maior que zero.');
      return;
    }

    const cDay = parseInt(closingDay, 10);
    const dDay = parseInt(dueDay, 10);
    if (isNaN(cDay) || cDay < 1 || cDay > 31) {
      setError('Dia de fechamento da fatura deve estar entre 1 e 31.');
      return;
    }
    if (isNaN(dDay) || dDay < 1 || dDay > 31) {
      setError('Dia de vencimento da fatura deve estar entre 1 e 31.');
      return;
    }

    const finalInstitution = institution.trim() || 'Banco Emissor';

    if (editingCard) {
      const updated: CreditCard = {
        ...editingCard,
        name: name.trim(),
        institution: finalInstitution,
        brand,
        lastFourDigits: lastFourDigits.slice(-4),
        creditLimit: limitNum,
        closingDay: cDay,
        dueDay: dDay,
        color,
        defaultPaymentBankAccountId: defaultPaymentBankAccountId || undefined,
        notes: notes.trim()
      };
      storage.updateCreditCard(updated);
    } else {
      const newCard: CreditCard = {
        id: `card-${Date.now()}`,
        name: name.trim(),
        institution: finalInstitution,
        brand,
        lastFourDigits: lastFourDigits.slice(-4),
        creditLimit: limitNum,
        closingDay: cDay,
        dueDay: dDay,
        color,
        defaultPaymentBankAccountId: defaultPaymentBankAccountId || undefined,
        status: 'ATIVO',
        notes: notes.trim(),
        createdAt: new Date().toISOString()
      };
      storage.addCreditCard(newCard);
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <CardIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingCard ? 'Editar Cartão de Crédito' : 'Novo Cartão de Crédito Corporativo'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Cadastre o cartão com limites e datas de fechamento para faturamento mensal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Pré-seleções Rápidas de Bancos Populares */}
          <div className="p-3.5 bg-slate-50 dark:bg-[#1b1b20]/60 rounded-2xl border border-slate-200 dark:border-[#26262b] space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-amber-500" />
                Instituição Bancária Emissora
              </label>
              <span className="text-[11px] text-slate-500">
                Pré-seleção rápida:
              </span>
            </div>

            {/* Pills de Bancos Populares */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
              {POPULAR_BANKS_FOR_CARDS.map(b => {
                const isSelected = selectedBankCode === b.code || institution.toLowerCase() === b.name.toLowerCase();
                return (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => handleBankSelect(b)}
                    className={`py-1.5 px-2 rounded-xl border text-[11px] font-semibold text-center transition-all cursor-pointer truncate flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold shadow-xs ring-1 ring-amber-500/40'
                        : 'border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#131316] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                    title={`${b.name} (${b.code}) - ${b.fullName}`}
                  >
                    <span 
                      className="w-2 h-2 rounded-full shrink-0" 
                      style={{ backgroundColor: b.color }} 
                    />
                    <span className="truncate">{b.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Dropdown Pesquisável com TODOS os bancos brasileiros */}
            <div className="pt-1.5">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Ou selecione na lista de todos os bancos e fintechs do Brasil:
              </label>
              <PremiumSelect
                value={selectedBankCode}
                onChange={(e) => handleDropdownChange(e.target.value)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer text-xs"
              >
                <optgroup label="Bancos Populares & Digitais">
                  {BRAZILIAN_BANKS.filter(b => b.isPopular).map(b => (
                    <option 
                      key={b.code} 
                      value={b.code}
                      className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white py-1"
                    >
                      {b.code} - {b.name} ({b.fullName})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Demais Bancos Comerciais e Cooperativas">
                  {BRAZILIAN_BANKS.filter(b => !b.isPopular && b.code !== '000').map(b => (
                    <option 
                      key={b.code} 
                      value={b.code}
                      className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white py-1"
                    >
                      {b.code} - {b.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Personalizado">
                  <option 
                    value="000"
                    className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white py-1"
                  >
                    000 - Outro Banco / Emissor Personalizado
                  </option>
                </optgroup>
              </PremiumSelect>
            </div>

            {/* Se for 000 ou instituição livre, exibe campo de texto aberto */}
            {(selectedBankCode === '000' || !BRAZILIAN_BANKS.some(b => b.code === selectedBankCode)) && (
              <div className="pt-1">
                <input
                  type="text"
                  required
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="Digite o nome do banco ou instituição..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Nome de Identificação */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nome de Identificação do Cartão *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Nubank PJ Mastercard, Itaú Corporate"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
            </div>

            {/* Bandeira */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bandeira do Cartão
              </label>
              <PremiumSelect
                value={brand}
                onChange={(e) => setBrand(e.target.value as CreditCard['brand'])}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer text-xs"
              >
                {BRAND_OPTIONS.map(b => (
                  <option 
                    key={b.value} 
                    value={b.value}
                    className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                  >
                    {b.label}
                  </option>
                ))}
              </PremiumSelect>
            </div>

            {/* Últimos 4 Dígitos */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Últimos 4 Dígitos
              </label>
              <input
                type="text"
                maxLength={4}
                value={lastFourDigits}
                onChange={(e) => setLastFourDigits(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex: 4821"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
            </div>

            {/* Limite de Crédito Total */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Limite de Crédito Total (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                onWheel={(e) => (e.target as HTMLElement).blur()}
                style={{ colorScheme: 'light dark' }}
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="10000.00"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
            </div>

            {/* Conta Bancária Padrão */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Conta Bancária Padrão para Débito
              </label>
              <PremiumSelect
                value={defaultPaymentBankAccountId}
                onChange={(e) => setDefaultPaymentBankAccountId(e.target.value)}
                style={{ colorScheme: 'light dark' }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer text-xs"
              >
                <option value="" className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white">
                  Selecione uma conta bancária PJ...
                </option>
                {bankAccounts.map(b => (
                  <option 
                    key={b.id} 
                    value={b.id}
                    className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                  >
                    {b.name} ({b.bankName || 'PJ'})
                  </option>
                ))}
              </PremiumSelect>
            </div>

            {/* Dia de Fechamento */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dia de Fechamento da Fatura *
              </label>
              <input
                type="number"
                min="1"
                max="31"
                required
                onWheel={(e) => (e.target as HTMLElement).blur()}
                style={{ colorScheme: 'light dark' }}
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
                placeholder="25"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Dia do mês em que a fatura fecha para novas compras.
              </span>
            </div>

            {/* Dia de Vencimento */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Dia de Vencimento da Fatura *
              </label>
              <input
                type="number"
                min="1"
                max="31"
                required
                onWheel={(e) => (e.target as HTMLElement).blur()}
                style={{ colorScheme: 'light dark' }}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="5"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Data de pagamento do boleto da fatura.
              </span>
            </div>

            {/* Seletor de Cores */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Cor Visual do Cartão
              </label>
              <div className="flex items-center gap-2.5 flex-wrap p-2.5 rounded-xl border border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/40">
                {COLOR_PRESETS.map(preset => {
                  const isCur = color.toLowerCase() === preset.value.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setColor(preset.value)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer flex items-center justify-center ${
                        isCur ? 'scale-110 border-white ring-2 ring-amber-500 shadow-sm' : 'border-slate-300 dark:border-slate-700 hover:scale-105'
                      }`}
                      style={{ backgroundColor: preset.value }}
                      title={preset.label}
                    >
                      {isCur && <Check className="w-3.5 h-3.5 text-white drop-shadow-xs" />}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1.5 ml-auto text-xs text-slate-500">
                  <span>Hex:</span>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] text-slate-900 dark:text-white font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Observações (Opcional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Cartão destinado para despesas de TI e marketing digital..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 text-xs"
              />
            </div>
          </div>

          {/* Footer de Ações */}
          <div className="pt-4 border-t border-slate-200 dark:border-[#26262b] flex items-center justify-between gap-3 shrink-0">
            <div>
              {editingCard && !isConfirmingDelete && (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir Cartão
                </button>
              )}

              {editingCard && isConfirmingDelete && (
                <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-950/60 p-1.5 rounded-xl border border-rose-200 dark:border-rose-800">
                  <span className="text-[11px] text-rose-700 dark:text-rose-300 font-semibold px-1">Confirmar exclusão?</span>
                  <button
                    type="button"
                    onClick={handleDeleteCard}
                    className="px-2.5 py-1 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors cursor-pointer"
                  >
                    Sim, excluir
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    Não
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#26262b] rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 rounded-xl shadow-md transition-all cursor-pointer"
              >
                {editingCard ? 'Salvar Alterações' : 'Cadastrar Cartão'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
