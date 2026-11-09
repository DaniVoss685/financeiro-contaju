import React, { useState, useEffect } from 'react';
import { X, UserCheck, Building, Mail, Phone, MapPin, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Counterparty } from '../../types';
import { storage } from '../../services/storageService';
import { CNPJInputField } from '../Common/CNPJInputField';
import { useIsSimpleMode } from '../../hooks/useViewMode';
import { validateFiscalDocument } from '../../utils/cnpjValidator';

interface CompleteCounterpartyModalProps {
  isOpen: boolean;
  counterpartyId: string | null;
  defaultType?: 'CLIENTE' | 'FORNECEDOR' | 'AMBOS';
  onClose: () => void;
  onSaved: (updated: Counterparty) => void;
}

export const CompleteCounterpartyModal: React.FC<CompleteCounterpartyModalProps> = ({
  isOpen,
  counterpartyId,
  defaultType = 'CLIENTE',
  onClose,
  onSaved
}) => {
  const simple = useIsSimpleMode();
  const [formData, setFormData] = useState<Partial<Counterparty>>({
    name: '',
    tradeName: '',
    document: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    status: 'ATIVO',
    type: defaultType
  });
  const [successMsg, setSuccessMsg] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const isCreatingNew = counterpartyId === 'NEW';

  useEffect(() => {
    if (!isOpen || !counterpartyId) return;

    if (counterpartyId === 'NEW') {
      setFormData({
        name: '',
        tradeName: '',
        document: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        status: 'ATIVO',
        type: defaultType
      });
      setDocError(null);
    } else {
      const parties = storage.getCounterparties();
      const target = parties.find(p => p.id === counterpartyId);
      if (target) {
        setFormData({ ...target });
        setDocError(null);
      }
    }
  }, [counterpartyId, isOpen, defaultType]);

  if (!isOpen || !counterpartyId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

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
    let savedParty: Counterparty;

    if (isCreatingNew) {
      savedParty = {
        id: `cp-${Date.now()}`,
        name: formData.name!.trim(),
        tradeName: formData.tradeName?.trim() || '',
        type: (formData.type as any) || defaultType || 'CLIENTE',
        document: formData.document?.trim() || '',
        email: formData.email?.trim() || '',
        phone: formData.phone?.trim() || '',
        address: formData.address?.trim() || '',
        notes: formData.notes?.trim() || '',
        status: (formData.status as any) || 'ATIVO',
        createdAt: new Date().toISOString()
      };
      storage.saveCounterparties([...all, savedParty]);

      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CADASTRO_RAPIDO_CONTRAPARTE',
        module: 'Cadastros',
        recordId: savedParty.id,
        details: `Cadastro rápido de ${savedParty.type}: ${savedParty.name} (Doc: ${savedParty.document || 'Não informado'}).`
      });
    } else {
      const updatedList = all.map(p => {
        if (p.id === counterpartyId) {
          return {
            ...p,
            name: formData.name!.trim(),
            tradeName: formData.tradeName?.trim() || '',
            type: formData.type || p.type || defaultType,
            document: formData.document?.trim() || '',
            email: formData.email?.trim() || '',
            phone: formData.phone?.trim() || '',
            address: formData.address?.trim() || '',
            notes: formData.notes?.trim() || '',
            status: (formData.status as any) || 'ATIVO'
          };
        }
        return p;
      });

      storage.saveCounterparties(updatedList);
      savedParty = updatedList.find(p => p.id === counterpartyId)!;

      storage.addAuditLog({
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'COMPLEMENTACAO_CADASTRO_RAPIDO',
        module: 'Cadastros',
        recordId: counterpartyId,
        details: `Edição dos dados cadastrais de ${savedParty.name} (Doc: ${savedParty.document || 'Não informado'}).`
      });
    }

    setSuccessMsg(true);
    setTimeout(() => {
      setSuccessMsg(false);
      onSaved(savedParty);
      onClose();
    }, 500);
  };

  const modalTitle = isCreatingNew
    ? `Novo Cadastro de ${defaultType === 'CLIENTE' ? 'Cliente' : 'Fornecedor'}`
    : `Editar Cadastro de ${formData.type === 'CLIENTE' ? 'Cliente' : 'Fornecedor'}`;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#131316] rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 dark:border-[#26262b] animate-in fade-in zoom-in-95">
        
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)]">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {modalTitle}
              </h2>
              <p className="adv-only text-[11px] text-[var(--text-secondary)]">
                {isCreatingNew 
                  ? 'Preencha os dados do registro sem sair do fluxo atual.' 
                  : 'Atualize os dados fiscais e cadastrais do cliente/fornecedor.'}
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-lg flex items-center text-xs text-emerald-800 dark:text-emerald-300 font-medium">
            <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span>{isCreatingNew ? 'Cadastro criado com sucesso!' : 'Cadastro atualizado com sucesso!'}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5 text-xs">
          {docError && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-center font-medium">
              <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{docError}</span>
            </div>
          )}
          
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              {simple ? 'Nome *' : 'Razão Social / Nome Completo *'}
            </label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 px-3 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="adv-only">
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nome Fantasia
              </label>
              <input
                type="text"
                value={formData.tradeName || ''}
                onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                placeholder="Ex: ContaJu Softwares"
                className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 px-3 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <CNPJInputField
                id="modal-counterparty-cnpj"
                value={formData.document || ''}
                onChange={(maskedVal) => {
                  setFormData(prev => ({ ...prev, document: maskedVal }));
                  if (docError) setDocError(null);
                }}
                label={simple ? 'CNPJ *' : 'CNPJ (Cadastro Fiscal) *'}
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                {simple ? 'E-mail' : 'E-mail para Faturamento'}
              </label>
              <input
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contato@empresa.com.br"
                className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 px-3 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Telefone / WhatsApp
              </label>
              <input
                type="text"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(11) 99999-9999"
                className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 px-3 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              {simple ? 'Endereço' : 'Endereço Completo'}
            </label>
            <input
              type="text"
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Av. Paulista, 1000 - Sala 12 - São Paulo/SP"
              className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 px-3 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              {simple ? 'Observações' : 'Observações Adicionais'}
            </label>
            <textarea
              rows={2}
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Condições comerciais, dados bancários, regime tributário..."
              className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-slate-100 px-3 py-1.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-[#26262b]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition-colors flex items-center cursor-pointer"
            >
              <UserCheck className="w-3.5 h-3.5 mr-1.5" />
              Salvar Cadastro
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
