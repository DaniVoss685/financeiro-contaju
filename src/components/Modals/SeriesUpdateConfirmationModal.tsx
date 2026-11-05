import React, { useState, useMemo } from 'react';
import { 
  X, 
  Repeat, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  ShieldCheck, 
  ChevronDown, 
  ChevronUp,
  FolderTree,
  Building2,
  Sparkles
} from 'lucide-react';
import { FinancialTitle } from '../../types';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { SeriesDetectionResult, SeriesFieldChanges } from '../../services/recurringSeriesService';
import { storage } from '../../services/storageService';

interface SeriesUpdateConfirmationModalProps {
  isOpen: boolean;
  targetTitle: FinancialTitle;
  newAmount: number;
  newDueDate?: string;
  newAccountId?: string;
  newBankAccountId?: string;
  fieldChanges?: SeriesFieldChanges;
  seriesInfo: SeriesDetectionResult;
  onConfirm: (applyToSubsequent: boolean) => void;
  onCancel: () => void;
}

export const SeriesUpdateConfirmationModal: React.FC<SeriesUpdateConfirmationModalProps> = ({
  isOpen,
  targetTitle,
  newAmount,
  newDueDate,
  newAccountId,
  newBankAccountId,
  fieldChanges,
  seriesInfo,
  onConfirm,
  onCancel
}) => {
  const [showDetails, setShowDetails] = useState(false);

  // Mapear nomes de plano de contas e bancos para exibição amigável
  const { oldAccountName, newAccountName, oldBankName, newBankName } = useMemo(() => {
    try {
      const chartAccounts = storage.getChartAccounts();
      const bankAccounts = storage.getBankAccounts();

      const oldAcc = chartAccounts.find(a => a.id === targetTitle.accountId);
      const newAcc = chartAccounts.find(a => a.id === newAccountId);

      const oldBank = bankAccounts.find(b => b.id === targetTitle.expectedBankAccountId);
      const newBank = bankAccounts.find(b => b.id === newBankAccountId);

      return {
        oldAccountName: oldAcc?.name || targetTitle.accountId || 'Não definida',
        newAccountName: newAcc?.name || newAccountId || 'Não definida',
        oldBankName: oldBank ? `${oldBank.name} (${oldBank.institution})` : 'Indiferente / Não definida',
        newBankName: newBank ? `${newBank.name} (${newBank.institution})` : 'Indiferente / Não definida'
      };
    } catch {
      return {
        oldAccountName: 'Conta anterior',
        newAccountName: 'Nova conta',
        oldBankName: 'Banco anterior',
        newBankName: 'Novo banco'
      };
    }
  }, [targetTitle.accountId, newAccountId, targetTitle.expectedBankAccountId, newBankAccountId]);

  if (!isOpen) return null;

  const previousAmount = targetTitle.originalAmount || 0;
  const diff = newAmount - previousAmount;
  const isIncrease = diff > 0;
  const subsequentCount = seriesInfo.subsequentOpenTitles.length;

  const isAmountChanged = fieldChanges ? fieldChanges.amountChanged : Math.abs(newAmount - previousAmount) > 0.001;
  const isDueDayChanged = fieldChanges ? fieldChanges.dueDayChanged : false;
  const isAccountChanged = fieldChanges ? fieldChanges.accountChanged : Boolean(newAccountId && newAccountId !== targetTitle.accountId);
  const isBankChanged = fieldChanges ? fieldChanges.bankAccountChanged : Boolean(newBankAccountId !== (targetTitle.expectedBankAccountId || ''));

  return (
    <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
              {seriesInfo.seriesType === 'PARCELAMENTO' ? (
                <Layers className="w-5 h-5" />
              ) : (
                <Repeat className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold tracking-tight">
                Atualizar Lançamento Recorrente
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {seriesInfo.seriesTypeLabel} • {targetTitle.titleNumber}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo do Diálogo */}
        <div className="p-5 space-y-4 text-xs">
          
          {/* Card com as Modificações Detectadas */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#17171b] border border-slate-200 dark:border-[#26262b] space-y-3">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
              <span>Descrição do Título:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[240px]">
                {targetTitle.description}
              </span>
            </div>

            {/* 1. Alteração de Valor */}
            {isAmountChanged && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Valor Anterior</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {formatBRL(previousAmount)}
                    </span>
                  </div>

                  <div className="px-2">
                    <ArrowRight className="w-4 h-4 text-amber-500" />
                  </div>

                  <div className="text-right">
                    <span className="block text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Novo Valor</span>
                    <span className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                      {formatBRL(newAmount)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isIncrease 
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  }`}>
                    {isIncrease ? `+ ${formatBRL(diff)}` : `- ${formatBRL(Math.abs(diff))}`}
                  </span>
                </div>
              </div>
            )}

            {/* 2. Alteração de Dia de Vencimento */}
            {isDueDayChanged && fieldChanges && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300">
                  <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-500">Vencimento Padrão</span>
                    <span className="text-xs font-semibold">Dia {fieldChanges.oldDueDay}</span>
                  </div>
                </div>

                <ArrowRight className="w-3.5 h-3.5 text-amber-500" />

                <div className="text-right">
                  <span className="block text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Novo Dia</span>
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Todo dia {fieldChanges.newDueDay}</span>
                </div>
              </div>
            )}

            {/* 3. Alteração de Categoria Contábil */}
            {isAccountChanged && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 truncate max-w-[190px]">
                  <FolderTree className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate" title={oldAccountName}>{oldAccountName}</span>
                </div>

                <ArrowRight className="w-3.5 h-3.5 text-amber-500 shrink-0 mx-1" />

                <div className="text-right truncate max-w-[190px] font-bold text-indigo-600 dark:text-indigo-400">
                  <span className="truncate" title={newAccountName}>{newAccountName}</span>
                </div>
              </div>
            )}

            {/* 4. Alteração de Conta Bancária */}
            {isBankChanged && (
              <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 truncate max-w-[190px]">
                  <Building2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                  <span className="truncate" title={oldBankName}>{oldBankName}</span>
                </div>

                <ArrowRight className="w-3.5 h-3.5 text-amber-500 shrink-0 mx-1" />

                <div className="text-right truncate max-w-[190px] font-bold text-teal-600 dark:text-teal-400">
                  <span className="truncate" title={newBankName}>{newBankName}</span>
                </div>
              </div>
            )}
          </div>

          {/* Pergunta de Decisão */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              Como você deseja aplicar esta alteração?
            </h4>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-xs">
              Detectamos que este lançamento faz parte de uma sequência com{' '}
              <strong className="text-amber-600 dark:text-amber-400">{subsequentCount} lançamento(s) seguinte(s) em aberto</strong>.
            </p>
          </div>

          {/* Aviso de Proteção para Meses Já Pagos */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-start gap-2.5 text-emerald-900 dark:text-emerald-300">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <div className="leading-snug text-[11px]">
              <strong>Histórico Protegido:</strong> Lançamentos que já foram pagos/recebidos ou com baixas confirmadas{' '}
              {seriesInfo.paidTitlesCount > 0 ? `(${seriesInfo.paidTitlesCount} já quitados) ` : ''}
              <strong>não serão modificados</strong>. Apenas os meses em aberto desse período em diante serão atualizados.
            </div>
          </div>

          {/* Aviso especial de Contrato com Histórico de Reajuste */}
          {seriesInfo.seriesType === 'CONTRATO' && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center space-x-2 text-[11px] text-amber-800 dark:text-amber-300">
              <Sparkles className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                <strong>Sincronização Contratual:</strong> O contrato ativo terá seu valor mensal atualizado e um registro oficial será gravado no seu <strong>Histórico de Reajustes</strong> (com opção de notificar o cliente via WhatsApp/E-mail).
              </span>
            </div>
          )}

          {/* Lista detalhada expansível dos próximos meses */}
          {subsequentCount > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-[#26262b] overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#17171b] flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <span>Ver os {subsequentCount} lançamentos futuros que serão atualizados</span>
                {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showDetails && (
                <div className="p-2.5 max-h-40 overflow-y-auto space-y-1.5 bg-white dark:bg-[#131316]">
                  {seriesInfo.subsequentOpenTitles.map(t => (
                    <div 
                      key={t.id} 
                      className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 dark:bg-[#17171b] border border-slate-200/60 dark:border-slate-800 text-[11px]"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-mono text-[10px] text-slate-500 block truncate">{t.titleNumber}</span>
                        <span className="text-slate-700 dark:text-slate-300 truncate block">{t.description}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-500 block">Venc: {formatDateBR(t.dueDate)}</span>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{formatBRL(newAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Rodapé com as 2 opções de decisão */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#17171b] flex flex-col sm:flex-row gap-2.5 sm:justify-end">
          <button
            type="button"
            onClick={() => onConfirm(false)}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 dark:border-[#26262b] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <span>Alterar Apenas Este Lançamento</span>
          </button>

          <button
            type="button"
            onClick={() => onConfirm(true)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-md transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Este e Todos os {subsequentCount} Meses Seguintes</span>
          </button>
        </div>
      </div>
    </div>
  );
};
