import React, { useState } from 'react';
import { 
  X, 
  Send, 
  Copy, 
  Mail, 
  MessageCircle, 
  CheckCircle2, 
  ArrowRight, 
  FileText, 
  Calendar, 
  ExternalLink,
  Sparkles,
  Check
} from 'lucide-react';
import { Contract, ContractAdjustment } from '../../types';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { resendService } from '../../services/resendService';
import { storage } from '../../services/storageService';
import { toast } from '../../hooks/useToast';

interface ContractAdjustmentNotificationModalProps {
  isOpen: boolean;
  contract: Contract;
  adjustment: ContractAdjustment;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  onClose: () => void;
}

export const ContractAdjustmentNotificationModal: React.FC<ContractAdjustmentNotificationModalProps> = ({
  isOpen,
  contract,
  adjustment,
  clientName: propClientName,
  clientPhone: propClientPhone,
  clientEmail: propClientEmail,
  onClose
}) => {
  // Buscar cliente atualizado caso não venha completo por props
  const client = React.useMemo(() => {
    try {
      const counterparties = storage.getCounterparties();
      return counterparties.find(c => c.id === contract.customerId);
    } catch {
      return null;
    }
  }, [contract.customerId]);

  const clientName = propClientName || client?.name || 'Cliente';
  const clientPhone = propClientPhone || client?.phone || '';
  const clientEmail = propClientEmail || client?.email || '';

  const [activeTab, setActiveTab] = useState<'WHATSAPP' | 'EMAIL'>('WHATSAPP');
  const [recipientPhone, setRecipientPhone] = useState(clientPhone);
  const [recipientEmail, setRecipientEmail] = useState(clientEmail);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  // Template da mensagem para WhatsApp
  const defaultWhatsAppMessage = `Olá, *${clientName}*! Tudo bem?

Informamos que os honorários e serviços referentes ao contrato *${contract.contractNumber}* (*${contract.description}*) tiveram o valor mensal atualizado:

• *Valor Anterior:* ${formatBRL(adjustment.previousAmount)}
• *Novo Valor Mensal:* ${formatBRL(adjustment.newAmount)} (${adjustment.percentage >= 0 ? '+' : ''}${adjustment.percentage.toFixed(2)}%)
• *Vencimento:* Todo dia ${contract.dueDay || '10'} de cada mês
• *Vigência:* a partir de ${formatDateBR(adjustment.date)}
${adjustment.notes ? `• *Observações:* ${adjustment.notes}\n` : ''}
Qualquer dúvida, nossa equipe financeira está à inteira disposição!

Atenciosamente,
*ContaJu Contabilidade & Gestão*`;

  const [whatsAppText, setWhatsAppText] = useState(defaultWhatsAppMessage);

  if (!isOpen) return null;

  const handleCopyMessage = () => {
    try {
      navigator.clipboard.writeText(whatsAppText);
      setCopied(true);
      toast.success('Mensagem copiada para a área de transferência!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Erro ao copiar texto.');
    }
  };

  const handleOpenWhatsApp = () => {
    const cleanPhone = (recipientPhone || '').replace(/\D/g, '');
    let finalPhone = cleanPhone;
    if (cleanPhone.length >= 10 && !cleanPhone.startsWith('55')) {
      finalPhone = `55${cleanPhone}`;
    }

    const encoded = encodeURIComponent(whatsAppText);
    const url = finalPhone 
      ? `https://wa.me/${finalPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(url, '_blank', 'noopener,noreferrer');
    toast.success('WhatsApp aberto em nova guia!');
  };

  const handleSendEmail = async () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      toast.error('Informe um e-mail válido para envio.');
      return;
    }

    setIsSendingEmail(true);
    try {
      const res = await resendService.sendContractAdjustmentEmail({
        clientName,
        clientEmail: recipientEmail,
        contractNumber: contract.contractNumber,
        contractDescription: contract.description,
        previousAmount: adjustment.previousAmount,
        newAmount: adjustment.newAmount,
        percentage: adjustment.percentage,
        effectiveDate: adjustment.date,
        dueDay: contract.dueDay,
        reason: adjustment.reasonLabel || adjustment.reason,
        notes: adjustment.notes
      });

      if (res.success) {
        setEmailSent(true);
        toast.success(`Comunicado formal de reajuste enviado com sucesso para ${recipientEmail}!`);
      } else {
        toast.error(res.error || 'Erro ao enviar e-mail via Resend.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha na comunicação com o servidor de e-mail.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">
                Notificar Cliente sobre Reajuste
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {contract.contractNumber} • {clientName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-5 space-y-4 text-xs">
          {/* Card Comparativo do Reajuste */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-500">Valor Anterior</span>
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 line-through">
                  {formatBRL(adjustment.previousAmount)}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <ArrowRight className="w-4 h-4 text-amber-500" />
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  adjustment.percentage >= 0 
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}>
                  {adjustment.percentage >= 0 ? `+${adjustment.percentage.toFixed(2)}%` : `${adjustment.percentage.toFixed(2)}%`}
                </span>
              </div>

              <div className="text-right">
                <span className="block text-[10px] uppercase font-bold text-slate-500">Novo Valor Mensal</span>
                <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatBRL(adjustment.newAmount)}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                Vencimento: <strong>Todo dia {contract.dueDay || '10'}</strong>
              </span>
              <span>
                Vigência a partir de: <strong>{formatDateBR(adjustment.date)}</strong>
              </span>
            </div>
          </div>

          {/* Abas: WhatsApp vs E-mail */}
          <div className="flex rounded-xl bg-slate-100 dark:bg-[#1b1b20] p-1 border border-slate-200 dark:border-[#26262b]">
            <button
              type="button"
              onClick={() => setActiveTab('WHATSAPP')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'WHATSAPP'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span>WhatsApp / Mensagem</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('EMAIL')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'EMAIL'
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>E-mail Formal (Resend)</span>
            </button>
          </div>

          {/* Conteúdo Aba WhatsApp */}
          {activeTab === 'WHATSAPP' && (
            <div className="space-y-3 animate-in fade-in duration-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Número de WhatsApp do Cliente:
                </label>
                <input
                  type="text"
                  value={recipientPhone}
                  onChange={e => setRecipientPhone(e.target.value)}
                  placeholder="Ex: (11) 98765-4321"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b] rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Mensagem Formatada (você pode editar antes de enviar):
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyMessage}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        <span>Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" />
                        <span>Copiar Texto</span>
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  rows={7}
                  value={whatsAppText}
                  onChange={e => setWhatsAppText(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b] rounded-xl text-xs font-sans focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 outline-none resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Abrir no WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </button>

                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-[#222c3e] font-semibold text-slate-700 dark:text-slate-300 rounded-xl transition-colors flex items-center justify-center space-x-1.5 cursor-pointer border border-slate-200 dark:border-[#26262b]"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copiar</span>
                </button>
              </div>
            </div>
          )}

          {/* Conteúdo Aba E-mail */}
          {activeTab === 'EMAIL' && (
            <div className="space-y-3 animate-in fade-in duration-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail do Destinatário:
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={e => setRecipientEmail(e.target.value)}
                  placeholder="cliente@exemplo.com.br"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b] rounded-xl text-xs focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 outline-none"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b] space-y-2 text-slate-600 dark:text-slate-300">
                <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400 font-bold text-[11px]">
                  <Sparkles className="w-4 h-4" />
                  <span>Template Formal com Identidade Visual ContaJu</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  O e-mail será disparado com o cabeçalho dourado da ContaJu, tabela com os valores antigo e novo em destaque, data de vigência e dia de vencimento, de forma 100% profissional.
                </p>
                {emailSent && (
                  <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-600 dark:text-emerald-400 text-xs flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" />
                    <span>Comunicado já disparado para este destinatário com sucesso!</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSendEmail}
                disabled={isSendingEmail || !recipientEmail}
                className={`w-full py-2.5 px-4 font-bold rounded-xl shadow-md transition-colors flex items-center justify-center space-x-2 cursor-pointer ${
                  isSendingEmail || !recipientEmail
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>{isSendingEmail ? 'Enviando Comunicado...' : 'Disparar E-mail Formal (Resend)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-[#202838] dark:hover:bg-[#2c2c33] text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            Concluir e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
