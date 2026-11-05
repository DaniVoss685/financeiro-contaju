import React, { useState, useMemo } from 'react';
import { 
  X, 
  AlertTriangle, 
  Ban, 
  UserMinus, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  ShieldAlert,
  ArrowRight,
  DollarSign,
  HelpCircle,
  Clock
} from 'lucide-react';
import { Contract, Counterparty } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface CancelContractModalProps {
  contract: Contract | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const CancelContractModal: React.FC<CancelContractModalProps> = ({
  contract,
  isOpen,
  onClose,
  onSuccess
}) => {
  const todayYmd = new Date().toISOString().split('T')[0];

  const [actionType, setActionType] = useState<'CANCELADO' | 'INATIVO' | 'SUSPENSO'>('CANCELADO');
  const [cancellationDate, setCancellationDate] = useState<string>(todayYmd);
  const [reason, setReason] = useState<string>('Rescisão solicitada pelo cliente');
  const [customReason, setCustomReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [inactivateClient, setInactivateClient] = useState<boolean>(true);
  const [cancelPendingTitles, setCancelPendingTitles] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const counterparties = storage.getCounterparties();
  const allTitles = storage.getTitles();

  const client = useMemo(() => {
    if (!contract) return null;
    return counterparties.find(c => c.id === contract.customerId);
  }, [contract, counterparties]);

  // Contratos ativos do mesmo cliente (para avisar se existem outros)
  const clientOtherContracts = useMemo(() => {
    if (!contract || !client) return [];
    return storage.getContracts().filter(c => c.customerId === client.id && c.id !== contract.id && c.status === 'ATIVO');
  }, [contract, client]);

  // Títulos em aberto vinculados que serão afetados a partir da data de cancelamento
  const affectedTitles = useMemo(() => {
    if (!contract) return [];
    const cancellationMonth = cancellationDate ? cancellationDate.substring(0, 7) : todayYmd.substring(0, 7);

    return allTitles.filter(t => 
      t.originType === 'CONTRATO' &&
      t.originId === contract.id &&
      t.settlementState !== 'LIQUIDADO' &&
      t.documentState !== 'CANCELADO' &&
      (t.dueDate >= cancellationDate || (t.competence && t.competence >= cancellationMonth))
    );
  }, [contract, cancellationDate, allTitles, todayYmd]);

  const totalAffectedAmount = useMemo(() => {
    return affectedTitles.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
  }, [affectedTitles]);

  if (!isOpen || !contract) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationDate) {
      alert('Por favor, informe a data em que o cliente parou de trabalhar com a gente.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalReason = reason === 'Outro motivo' && customReason.trim() ? customReason.trim() : reason;

      const res = storage.cancelOrInactivateContract(contract.id, {
        status: actionType,
        cancellationDate,
        cancellationReason: finalReason,
        cancellationNotes: notes.trim() || undefined,
        inactivateClient: inactivateClient && clientOtherContracts.length === 0,
        cancelPendingTitlesAfterDate: cancelPendingTitles
      });

      if (res.success) {
        onSuccess(res.message);
        onClose();
      } else {
        alert(res.message);
      }
    } catch (err) {
      console.error('Erro ao cancelar/inativar contrato:', err);
      alert('Ocorreu um erro ao processar a ação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white dark:bg-[#131316] rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[92vh] border border-slate-200 dark:border-[#26262b] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-rose-50/50 dark:bg-rose-950/20 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Cancelar ou Deixar Contrato Inativo
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Remova da renda da carteira ativa e controle quando o cliente encerrou os serviços
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Fechar (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumo do Contrato */}
        <div className="p-4 bg-slate-50 dark:bg-[#1b1b20] border-b border-slate-200 dark:border-[#26262b] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-slate-900 dark:text-white">{contract.contractNumber}</span>
              <span className="text-slate-500">•</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{client?.name || 'Cliente'}</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {contract.description} • Entrada: {formatDateBR(contract.entryDate || contract.startDate)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
              {formatBRL(contract.monthlyTotal)} / mês
            </div>
            <span className="text-[10px] text-slate-500">Valor que sairá da renda da carteira (MRR)</span>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
            
            {/* Escolha da Ação */}
            <div>
              <label className="block font-bold text-slate-800 dark:text-slate-200 mb-2">
                Qual status deseja aplicar ao contrato? *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label 
                  className={`p-3 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all ${
                    actionType === 'CANCELADO'
                      ? 'border-rose-500 bg-rose-500/10 shadow-xs'
                      : 'border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20]/50 hover:border-rose-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5" />
                      Cancelar Contrato
                    </span>
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'CANCELADO'}
                      onChange={() => setActionType('CANCELADO')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Rescisão definitiva. O cliente não opera mais com este contrato.
                  </span>
                </label>

                <label 
                  className={`p-3 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all ${
                    actionType === 'INATIVO'
                      ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                      : 'border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20]/50 hover:border-amber-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <UserMinus className="w-3.5 h-3.5" />
                      Deixar Inativo
                    </span>
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'INATIVO'}
                      onChange={() => setActionType('INATIVO')}
                      className="text-amber-600 focus:ring-amber-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Fora da carteira ativa. Pode ser reativado a qualquer momento.
                  </span>
                </label>

                <label 
                  className={`p-3 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all ${
                    actionType === 'SUSPENSO'
                      ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                      : 'border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20]/50 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Suspender
                    </span>
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'SUSPENSO'}
                      onChange={() => setActionType('SUSPENSO')}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Pausado temporariamente (ex: negociação ou parada de atividade).
                  </span>
                </label>
              </div>
            </div>

            {/* Data em que parou de trabalhar */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1b1b20]/60 border border-slate-200 dark:border-[#26262b] space-y-3">
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  📅 A partir de qual data o cliente parou de trabalhar com a gente? *
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                  Esta data marca oficialmente o fim da prestação de serviços para este contrato.
                </p>
                <DateField
                  required
                  value={cancellationDate}
                  onChange={(e) => setCancellationDate(e.target.value)}
                  className="w-full sm:w-64 rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3.5 py-2 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>

              {/* Motivo do Cancelamento */}
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Motivo do Cancelamento / Inativação *
                </label>
                <PremiumSelect
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                >
                  <option value="Rescisão solicitada pelo cliente">Rescisão solicitada pelo cliente</option>
                  <option value="Encerramento de atividades / Baixa do CNPJ">Encerramento de atividades / Baixa do CNPJ</option>
                  <option value="Troca de escritório de contabilidade">Troca de escritório de contabilidade</option>
                  <option value="Inadimplência financeira prolongada">Inadimplência financeira prolongada</option>
                  <option value="Redução de custos da empresa do cliente">Redução de custos da empresa do cliente</option>
                  <option value="Insatisfação com o serviço / atendimento">Insatisfação com o serviço / atendimento</option>
                  <option value="Término do período contratado">Término do período contratado</option>
                  <option value="Outro motivo">Outro motivo (especificar abaixo)</option>
                </PremiumSelect>

                {reason === 'Outro motivo' && (
                  <input
                    type="text"
                    required
                    placeholder="Especifique o motivo do cancelamento..."
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                  />
                )}
              </div>

              {/* Observações / Histórico */}
              <div>
                <label className="block font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Observações e Histórico da Rescisão (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Acordo amigável de transição, entrega de documentação contábil para o novo contador, etc."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-[#26262b] bg-white dark:bg-[#131316] px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
              </div>
            </div>

            {/* Opções de Organização do Sistema & Clientes */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Opções de Saneamento Financeiro & Carteira:
              </span>

              {/* Opção 1: Marcar Cliente como Inativo */}
              <label className="p-3.5 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20]/40 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1b1b20]">
                <input
                  type="checkbox"
                  checked={inactivateClient}
                  onChange={(e) => setInactivateClient(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Marcar o cliente como INATIVO no cadastro</span>
                    <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {client?.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {clientOtherContracts.length > 0 
                      ? `Aviso: Este cliente ainda possui ${clientOtherContracts.length} outro(s) contrato(s) ativo(s). Se desmarcado, ele continuará ativo na base.`
                      : 'O cliente não possui outros contratos ativos e será movido para clientes inativos, mantendo todo o histórico fiscal e de títulos.'
                    }
                  </p>
                </div>
              </label>

              {/* Opção 2: Cancelar Títulos Futuros em Aberto */}
              <label className="p-3.5 rounded-xl border border-slate-200 dark:border-[#26262b] bg-white dark:bg-[#1b1b20]/40 flex items-start gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1b1b20]">
                <input
                  type="checkbox"
                  checked={cancelPendingTitles}
                  onChange={(e) => setCancelPendingTitles(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700"
                />
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Cancelar títulos a receber em aberto a partir de {formatDateBR(cancellationDate)}</span>
                    {affectedTitles.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                        {affectedTitles.length} títulos ({formatBRL(totalAffectedAmount)})
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {affectedTitles.length > 0 
                      ? `Existem ${affectedTitles.length} cobranças em aberto somando ${formatBRL(totalAffectedAmount)} com vencimento/competência a partir desta data. Elas serão canceladas para não poluir nem inflar seu Contas a Receber.`
                      : 'Nenhum título futuro em aberto encontrado para este contrato após a data selecionada.'
                    }
                  </p>
                </div>
              </label>
            </div>

            {/* Aviso de Impacto no MRR */}
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="text-[11px] text-amber-900 dark:text-amber-300 leading-relaxed">
                <strong>Impacto Imediato na Renda da Carteira:</strong> O valor de <strong>{formatBRL(contract.monthlyTotal)}/mês</strong> será excluído da Renda Ativa da Carteira (MRR), garantindo que apenas clientes e contratos ativos componham seu faturamento recorrente.
              </div>
            </div>

          </div>

          {/* Footer de Ação */}
          <div className="px-6 py-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-semibold transition-colors text-xs"
            >
              Voltar / Manter Ativo
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-2 text-xs"
            >
              <Ban className="w-4 h-4 shrink-0" />
              <span>
                {isSubmitting ? 'Processando...' : `Confirmar ${actionType === 'CANCELADO' ? 'Cancelamento' : (actionType === 'INATIVO' ? 'Inativação' : 'Suspensão')}`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
