import React, { useState, useMemo } from 'react';
import { 
  X, 
  Barcode, 
  Check, 
  AlertCircle, 
  Building2, 
  Calendar, 
  CreditCard, 
  CheckCircle2, 
  Copy, 
  ArrowRight,
  Sparkles,
  Search
} from 'lucide-react';
import { FinancialTitle, BankAccount, Counterparty } from '../../types';
import { FinancialEngine, formatBRL, formatDateBR } from '../../services/financialEngine';
import { storage } from '../../services/storageService';
import { PremiumSelect } from '../Common/PremiumSelect';
import { DateField } from '../Common/DateField';

interface BoletoBatchSettlementModalProps {
  isOpen: boolean;
  onClose: () => void;
  titles: FinancialTitle[];
  bankAccounts: BankAccount[];
  counterparties: Counterparty[];
  onSuccess: (message: string) => void;
}

interface RecognizedBoleto {
  id: string;
  rawInput: string;
  cleanDigits: string;
  matchedTitle?: FinancialTitle;
  matchedSupplier?: Counterparty;
  recognizedAmount?: number;
  matchType: 'EXATO_LINHA' | 'DOCUMENTO_BANCO' | 'VALOR_SIMILAR' | 'NAO_ENCONTRADO';
  matchNote: string;
}

export const BoletoBatchSettlementModal: React.FC<BoletoBatchSettlementModalProps> = ({
  isOpen,
  onClose,
  titles,
  bankAccounts,
  counterparties,
  onSuccess
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(bankAccounts[0]?.id || '');
  const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedBoletoIds, setSelectedBoletoIds] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Títulos a pagar em aberto
  const openPayables = useMemo(() => {
    return titles.filter(t => t.type === 'PAGAR' && t.settlementState !== 'LIQUIDADO' && t.documentState !== 'CANCELADO');
  }, [titles]);

  // Processamento e reconhecimento inteligente das linhas digitadas
  const recognizedBoletos = useMemo<RecognizedBoleto[]>(() => {
    if (!inputText.trim()) return [];

    const lines = inputText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    return lines.map((line, idx) => {
      const cleanDigits = line.replace(/\D/g, '');
      const id = `rec-bol-${idx}`;

      // 1. Procura por correspondência direta de barcode
      let match = openPayables.find(t => {
        if (!t.barcode) return false;
        const cleanTBar = t.barcode.replace(/\D/g, '');
        return cleanTBar === cleanDigits || 
               (cleanDigits.length >= 8 && cleanTBar.includes(cleanDigits)) ||
               (cleanTBar.length >= 8 && cleanDigits.includes(cleanTBar));
      });

      if (match) {
        const supplier = counterparties.find(c => c.id === match?.counterpartyId);
        return {
          id,
          rawInput: line,
          cleanDigits,
          matchedTitle: match,
          matchedSupplier: supplier,
          recognizedAmount: match.balancePrincipal > 0 ? match.balancePrincipal : match.originalAmount,
          matchType: 'EXATO_LINHA',
          matchNote: 'Correspondência exata por linha digitável cadastrada'
        };
      }

      // 2. Procura por correspondência de número do documento / nosso número
      match = openPayables.find(t => {
        if (!t.bankDocumentNumber) return false;
        const cleanDoc = t.bankDocumentNumber.replace(/\D/g, '');
        return cleanDoc && (cleanDigits.includes(cleanDoc) || cleanDoc.includes(cleanDigits));
      });

      if (match) {
        const supplier = counterparties.find(c => c.id === match?.counterpartyId);
        return {
          id,
          rawInput: line,
          cleanDigits,
          matchedTitle: match,
          matchedSupplier: supplier,
          recognizedAmount: match.balancePrincipal > 0 ? match.balancePrincipal : match.originalAmount,
          matchType: 'DOCUMENTO_BANCO',
          matchNote: `Nosso Número / Doc Bancário ${match.bankDocumentNumber} reconhecido`
        };
      }

      // 3. Extrai valor dos últimos 10 dígitos do boleto bancário (formato padrão FEBRABAN)
      // Nos boletos de cobrança, os últimos 10 dígitos são o valor em centavos
      if (cleanDigits.length >= 44) {
        const amountCentsStr = cleanDigits.slice(-10);
        const amountFromBarcode = parseInt(amountCentsStr, 10) / 100;
        if (amountFromBarcode > 0) {
          match = openPayables.find(t => {
            const titleAmt = t.balancePrincipal > 0 ? t.balancePrincipal : t.originalAmount;
            return Math.abs(titleAmt - amountFromBarcode) <= 0.01;
          });

          if (match) {
            const supplier = counterparties.find(c => c.id === match?.counterpartyId);
            return {
              id,
              rawInput: line,
              cleanDigits,
              matchedTitle: match,
              matchedSupplier: supplier,
              recognizedAmount: amountFromBarcode,
              matchType: 'VALOR_SIMILAR',
              matchNote: `Valor de R$ ${amountFromBarcode.toFixed(2)} extraído da linha digitável`
            };
          }
        }
      }

      return {
        id,
        rawInput: line,
        cleanDigits,
        matchType: 'NAO_ENCONTRADO',
        matchNote: 'Nenhum título a pagar em aberto localizado com esta linha digitável'
      };
    });
  }, [inputText, openPayables, counterparties]);

  // Atualiza seleção automática de todos os boletos reconhecidos com sucesso
  React.useEffect(() => {
    const validIds = recognizedBoletos.filter(b => b.matchedTitle).map(b => b.id);
    setSelectedBoletoIds(validIds);
  }, [recognizedBoletos]);

  if (!isOpen) return null;

  const validSelectedBoletos = recognizedBoletos.filter(
    b => b.matchedTitle && selectedBoletoIds.includes(b.id)
  );

  const totalSelectedAmount = validSelectedBoletos.reduce((acc, b) => {
    const val = b.matchedTitle 
      ? (b.matchedTitle.balancePrincipal > 0 ? b.matchedTitle.balancePrincipal : b.matchedTitle.originalAmount)
      : (b.recognizedAmount || 0);
    return acc + val;
  }, 0);

  // Exemplo de preenchimento rápido para demonstração
  const handleFillSample = () => {
    const sampleBarcodes = [
      '34191.79001 01043.510047 91020.150008 5 98450000185000', // Domínio Sistemas (R$ 1.850,00)
      '83670000007 2 20000048100 8 00000000000 0 00000000000 0', // Enel (R$ 720,00)
      '03399.81234 56789.012345 67890.123456 1 98420000048000'  // Google (R$ 480,00)
    ];
    setInputText(sampleBarcodes.join('\n'));
    setErrorMessage('');
  };

  // Execução da baixa em lote
  const handleExecuteBatchSettlement = () => {
    setErrorMessage('');
    if (validSelectedBoletos.length === 0) {
      setErrorMessage('Selecione pelo menos um boleto reconhecido para realizar a baixa.');
      return;
    }

    if (!selectedAccount) {
      setErrorMessage('Selecione a conta bancária de onde sairá o pagamento.');
      return;
    }

    setIsProcessing(true);

    try {
      let settledCount = 0;
      for (const item of validSelectedBoletos) {
        if (!item.matchedTitle) continue;
        const title = item.matchedTitle;
        const amountToPay = title.balancePrincipal > 0 ? title.balancePrincipal : title.originalAmount;

        const res = FinancialEngine.postSettlement({
          titleId: title.id,
          settlementDate: settlementDate,
          bankAccountId: selectedAccount,
          principalSettled: amountToPay,
          discount: 0,
          interest: 0,
          fine: 0,
          bankFee: 0,
          notes: `Baixa automática via leitor de boleto/linha digitável (${item.cleanDigits.slice(-10)})`,
          voucherRef: `BOL-${item.cleanDigits.slice(-8)}`
        });

        if (res.success) {
          // Atualiza o código de barras no título se não estava previamente salvo
          if (!title.barcode) {
            const allTitles = storage.getTitles();
            const updated = allTitles.map(t => t.id === title.id ? { ...t, barcode: item.rawInput } : t);
            storage.saveTitles(updated);
          }
          settledCount++;
        }
      }

      onSuccess(`Sucesso! ${settledCount} boleto(s) foram baixados e quitados no ERP no valor total de ${formatBRL(totalSelectedAmount)}.`);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao processar a baixa dos boletos.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#1b1b20] border border-slate-200 dark:border-[#26262b] rounded-none sm:rounded-2xl shadow-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] max-w-4xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        
        {/* Header Fixo */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-slate-200 dark:border-[#26262b] flex items-center justify-between bg-slate-50 dark:bg-[#131316] z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Barcode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
                <span className="truncate">Leitor e Baixa por Linha Digitável</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0">
                  Em Lote
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Cole linhas digitáveis para cruzar com o Contas a Pagar e baixar instantaneamente
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Rolável */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs pb-28 sm:pb-6 scroll-smooth [scroll-padding-bottom:7rem]">
          
          {/* Caixa de Entrada da Linha Digitável */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Barcode className="w-4 h-4 text-amber-500" />
                <span>Cole a Linha Digitável ou Código de Barras (1 por linha):</span>
              </label>
              <button
                type="button"
                onClick={handleFillSample}
                className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Colar Boletos de Exemplo ({openPayables.filter(t => t.barcode).length} cadastrados)</span>
              </button>
            </div>

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Cole aqui a linha digitável com pontos e espaços (ex: 34191.79001 01043.510047 91020.150008 5 98450000185000) ou apenas números..."
              rows={2}
              className="w-full p-3 font-mono text-sm sm:text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#131316] text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-hidden transition-all shadow-2xs"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              💡 Suporta leitor de código de barras óptico, relatórios de remessa bancária e múltiplos boletos colados de uma só vez.
            </p>
          </div>

          {/* Mensagem de Erro se houver */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Tabela de Boletos Reconhecidos */}
          {recognizedBoletos.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-2">
                  <span>Boletos Reconhecidos ({recognizedBoletos.length})</span>
                  <span className="text-[11px] text-slate-500">
                    • {validSelectedBoletos.length} selecionado(s) para baixa
                  </span>
                </h3>
              </div>

              <div className="border border-slate-200 dark:border-[#26262b] rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 dark:bg-[#131316] border-b border-slate-200 dark:border-[#26262b] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={recognizedBoletos.filter(b => b.matchedTitle).length > 0 && validSelectedBoletos.length === recognizedBoletos.filter(b => b.matchedTitle).length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBoletoIds(recognizedBoletos.filter(b => b.matchedTitle).map(b => b.id));
                              } else {
                                setSelectedBoletoIds([]);
                              }
                            }}
                            className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                          />
                        </th>
                        <th className="py-2.5 px-3">Título / Descrição</th>
                        <th className="py-2.5 px-3">Fornecedor</th>
                        <th className="py-2.5 px-3 text-center">Vencimento</th>
                        <th className="py-2.5 px-3 text-right">Valor</th>
                        <th className="py-2.5 px-3">Status do Cruzamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#26262b] bg-white dark:bg-[#1b1b20]">
                      {recognizedBoletos.map((b) => {
                        const isMatched = !!b.matchedTitle;
                        const isSelected = selectedBoletoIds.includes(b.id);
                        const amount = b.matchedTitle
                          ? (b.matchedTitle.balancePrincipal > 0 ? b.matchedTitle.balancePrincipal : b.matchedTitle.originalAmount)
                          : (b.recognizedAmount || 0);

                        return (
                          <tr 
                            key={b.id} 
                            className={`transition-colors ${
                              isMatched 
                                ? isSelected 
                                  ? 'bg-amber-500/10 dark:bg-amber-500/15' 
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50' 
                                : 'bg-slate-50/50 dark:bg-slate-900/30 opacity-70'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                disabled={!isMatched}
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedBoletoIds(prev => [...prev, b.id]);
                                  } else {
                                    setSelectedBoletoIds(prev => prev.filter(x => x !== b.id));
                                  }
                                }}
                                className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              {b.matchedTitle ? (
                                <div>
                                  <span className="font-bold font-mono text-slate-900 dark:text-white">
                                    {b.matchedTitle.titleNumber}
                                  </span>
                                  <span className="block text-slate-700 dark:text-slate-300 truncate max-w-xs">
                                    {b.matchedTitle.description}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono">
                                  {b.cleanDigits || b.rawInput}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-medium">
                              {b.matchedSupplier?.tradeName || b.matchedSupplier?.name || 'Não identificado'}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-600 dark:text-slate-400">
                              {b.matchedTitle ? formatDateBR(b.matchedTitle.dueDate) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white whitespace-nowrap">
                              {formatBRL(amount)}
                            </td>
                            <td className="py-2.5 px-3">
                              {isMatched ? (
                                <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{b.matchNote}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                                  <AlertCircle className="w-3 h-3 text-slate-400" />
                                  <span>{b.matchNote}</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Dados para a Baixa Financeira */}
          {validSelectedBoletos.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] space-y-4">
              <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
                <CreditCard className="w-4 h-4 text-amber-500" />
                <span>Configuração da Baixa no Contas a Pagar</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Conta Bancária de Débito:
                  </label>
                  <PremiumSelect
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white text-sm sm:text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  >
                    {bankAccounts.filter(a => a.status === 'ATIVO').map(a => (
                      <option key={a.id} value={a.id}>
                        {a.bankName} - {a.accountNumber} ({a.name})
                      </option>
                    ))}
                  </PremiumSelect>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data do Pagamento / Débito:
                  </label>
                  <DateField
                    value={settlementDate}
                    onChange={(e) => setSettlementDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1b1b20] text-slate-900 dark:text-white text-sm sm:text-xs font-semibold focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  Total Selecionado para Quitação:
                </span>
                <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                  {formatBRL(totalSelectedAmount)} ({validSelectedBoletos.length} boleto{validSelectedBoletos.length > 1 ? 's' : ''})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Fixo */}
        <div className="shrink-0 sticky bottom-0 p-3 sm:p-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50/95 dark:bg-[#131316]/95 backdrop-blur flex items-center justify-between gap-3 z-10 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleExecuteBatchSettlement}
            disabled={validSelectedBoletos.length === 0 || isProcessing}
            className={`min-h-[42px] px-5 sm:px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
              validSelectedBoletos.length > 0 && !isProcessing
                ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                : 'bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Check className="w-4 h-4 stroke-[3] shrink-0" />
            <span>
              {isProcessing
                ? 'Processando baixas...'
                : `Baixar ${validSelectedBoletos.length} Boleto${validSelectedBoletos.length > 1 ? 's' : ''} (${formatBRL(totalSelectedAmount)})`}
            </span>
          </button>
        </div>

      </div>
    </div>
  );
};
