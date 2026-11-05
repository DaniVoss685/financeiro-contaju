import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  Search, 
  Building2, 
  Tag, 
  Calendar, 
  DollarSign, 
  CheckSquare, 
  Square, 
  RefreshCw, 
  Sparkles,
  CreditCard as CardIcon,
  HelpCircle,
  ClipboardPaste,
  ShieldCheck,
  Split
} from 'lucide-react';
import { 
  CreditCard, 
  Counterparty, 
  ChartAccount, 
  CreditCardPurchase, 
  CreditCardInstallment 
} from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatCompetence } from '../../services/financialEngine';
import { getDaysInMonth, addMonthsSafe } from '../../utils/dateUtils';
import { 
  ParsedInvoiceTransaction, 
  InvoiceComparisonMatch, 
  extractTextFromPdf, 
  parseInvoiceTextLines, 
  parseInvoiceSpreadsheet, 
  parseInvoiceOFX,
  compareInvoiceItems 
} from '../../utils/cardInvoiceParser';
import { parseOFX } from '../../utils/ofxParser';
import { toast } from '../../hooks/useToast';
import { PremiumSelect } from '../Common/PremiumSelect';

interface CreditCardInvoiceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: CreditCard;
  invoiceMonth: string; // YYYY-MM
  manualInvoiceItems: Array<{
    purchaseId: string;
    purchaseDate: string;
    description: string;
    counterpartyName: string;
    chartAccountName: string;
    installmentNumber: number;
    totalInstallments: number;
    amount: number;
    dueDate: string;
  }>;
  counterparties: Counterparty[];
  chartAccounts: ChartAccount[];
  onSuccess: () => void;
}

export const CreditCardInvoiceImportModal: React.FC<CreditCardInvoiceImportModalProps> = ({
  isOpen,
  onClose,
  card,
  invoiceMonth,
  manualInvoiceItems,
  counterparties,
  chartAccounts,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'UPLOAD' | 'PASTE'>('UPLOAD');
  const [pastedText, setPastedText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Parsed items from the invoice
  const [importedItems, setImportedItems] = useState<ParsedInvoiceTransaction[]>([]);
  
  // Selection of missing items to import and register
  const [selectedMissingIds, setSelectedMissingIds] = useState<Set<string>>(new Set());

  // Editable overrides for missing items before registering
  const [itemEdits, setItemEdits] = useState<Record<string, {
    description: string;
    chartAccountId: string;
    counterpartyName: string;
    counterpartyId?: string;
  }>>({});

  // Active view tab for the comparison results
  const [resultFilterTab, setResultFilterTab] = useState<'MISSING' | 'MATCHED' | 'ONLY_SYSTEM'>('MISSING');

  // Comparison computation
  const comparison = useMemo(() => {
    return compareInvoiceItems(importedItems, manualInvoiceItems);
  }, [importedItems, manualInvoiceItems]);

  // Whenever missing items change, select all missing by default
  useEffect(() => {
    if (comparison.missingInSystem.length > 0) {
      const allMissingIds = new Set(comparison.missingInSystem.map(m => m.invoiceItem!.id));
      setSelectedMissingIds(allMissingIds);
      setResultFilterTab('MISSING');

      // Initialize default edits
      const initialEdits: Record<string, any> = {};
      comparison.missingInSystem.forEach(m => {
        const it = m.invoiceItem!;
        initialEdits[it.id] = {
          description: it.description,
          chartAccountId: it.suggestedChartAccountId || chartAccounts[0]?.id || 'acc-desp-1',
          counterpartyName: it.suggestedCounterpartyName || it.cleanDescription,
          counterpartyId: it.suggestedCounterpartyId
        };
      });
      setItemEdits(initialEdits);
    } else if (comparison.matched.length > 0) {
      setResultFilterTab('MATCHED');
    }
  }, [comparison]);

  if (!isOpen) return null;

  // Process text lines
  const handleParseText = (text: string) => {
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const parsed = parseInvoiceTextLines(text, invoiceMonth, chartAccounts, counterparties);
      if (parsed.length === 0) {
        setErrorMessage('Nenhum lançamento válido foi identificado no texto. Certifique-se de que há datas e valores (ex: "14/09 UBER *TRIP 24,90").');
      } else {
        setImportedItems(parsed);
        toast.info(`${parsed.length} lançamentos extraídos da fatura para conciliação.`);
      }
    } catch (err: any) {
      setErrorMessage(`Erro ao processar texto da fatura: ${err?.message || 'Formato não reconhecido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const fileName = file.name.toLowerCase();

    try {
      const arrayBuffer = await file.arrayBuffer();

      if (fileName.endsWith('.pdf')) {
        // PDF parser
        const text = await extractTextFromPdf(arrayBuffer);
        if (!text || text.trim().length < 10) {
          throw new Error('O PDF enviado não contém texto legível diretamente (pode ser imagem digitalizada). Tente copiar o texto da fatura e colar na aba "Colar Texto".');
        }
        handleParseText(text);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.csv') || fileName.endsWith('.xls')) {
        // Excel/CSV parser
        const parsed = parseInvoiceSpreadsheet(arrayBuffer, invoiceMonth, chartAccounts, counterparties);
        if (parsed.length === 0) {
          throw new Error('Nenhum lançamento encontrado na planilha. Verifique as colunas de data, descrição e valor.');
        }
        setImportedItems(parsed);
        toast.info(`${parsed.length} lançamentos extraídos da planilha de fatura.`);
      } else if (fileName.endsWith('.ofx')) {
        // OFX parser inteligente
        const textDecoder = new TextDecoder('latin1');
        const ofxStr = textDecoder.decode(new Uint8Array(arrayBuffer));
        const ofxParsed = parseInvoiceOFX(ofxStr, invoiceMonth, chartAccounts, counterparties);
        if (ofxParsed.length === 0) {
          throw new Error('Nenhum lançamento legível encontrado no arquivo OFX.');
        }
        setImportedItems(ofxParsed);
        toast.info(`${ofxParsed.length} lançamentos extraídos do extrato OFX.`);
      } else {
        throw new Error('Formato não suportado. Por favor, envie arquivos PDF, OFX, XLSX ou CSV.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Falha ao ler o arquivo da fatura.');
    } finally {
      setIsProcessing(false);
      // Reset input value
      e.target.value = '';
    }
  };

  // Load realistic sample invoice for instant demonstration
  const handleLoadSampleInvoice = () => {
    // Generates a sample invoice with some items matching current manual items, plus missing items
    const [y, m] = invoiceMonth.split('-');
    const sampleText = `
FATURA DO CARTÃO CORPORATIVO - BANCO EMISSOR
Vencimento: 15/${m}/${y} | Período de Compras

10/${m} POSTO SHELL COMBUSTIVEIS R$ 180,00
12/${m} UBER *TRIP SAO PAULO BR R$ 38,50
14/${m} RESTAURANTE COCO BAMBU R$ 245,90
18/${m} AMAZON AWS SERVICOS TI R$ 420,00
20/${m} IFOOD *REFEICAO EMPRESA R$ 89,90
22/${m} KALUNGA MATERIAIS DE ESCRITORIO R$ 115,40
25/${m} DROPBOX SERVICOS NUVEM 01/03 R$ 75,00
`;
    setPastedText(sampleText.trim());
    handleParseText(sampleText.trim());
  };

  const handleToggleSelectMissing = (id: string) => {
    setSelectedMissingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAllMissing = () => {
    if (selectedMissingIds.size === comparison.missingInSystem.length) {
      setSelectedMissingIds(new Set());
    } else {
      setSelectedMissingIds(new Set(comparison.missingInSystem.map(m => m.invoiceItem!.id)));
    }
  };

  const handleEditChange = (id: string, field: string, value: any) => {
    setItemEdits(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  // Execute import of selected missing items
  const handleConfirmImportMissing = () => {
    const missingToImport = comparison.missingInSystem.filter(m => selectedMissingIds.has(m.invoiceItem!.id));
    if (missingToImport.length === 0) {
      toast.warning('Selecione pelo menos um lançamento faltante para cadastrar.');
      return;
    }

    const [dueY, dueM] = invoiceMonth.split('-').map(Number);
    const maxDays = getDaysInMonth(dueY, dueM);
    const actualDueDay = Math.min(card.dueDay, maxDays);
    const invoiceDueDate = `${dueY}-${String(dueM).padStart(2, '0')}-${String(actualDueDay).padStart(2, '0')}`;

    const newPurchases: CreditCardPurchase[] = [];

    for (const m of missingToImport) {
      const it = m.invoiceItem!;
      const edits = itemEdits[it.id] || {
        description: it.description,
        chartAccountId: it.suggestedChartAccountId || chartAccounts[0]?.id || 'acc-desp-1',
        counterpartyName: it.suggestedCounterpartyName || it.cleanDescription
      };

      const installmentsCount = it.totalInstallments || 1;
      const installmentValue = it.amount;
      const totalAmount = installmentsCount > 1 ? Math.round(installmentValue * installmentsCount * 100) / 100 : installmentValue;
      const purchaseId = `pur-imp-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

      // Generate installments
      const installments: CreditCardInstallment[] = [];
      const currentInstNum = it.installmentNumber || 1;

      for (let i = 1; i <= installmentsCount; i++) {
        // Calculate invoice month for each installment relative to current installment
        const monthOffset = i - currentInstNum;
        const instInvoiceMonth = addMonthsSafe(`${invoiceMonth}-01`, monthOffset).slice(0, 7);
        const [instY, instM] = instInvoiceMonth.split('-').map(Number);
        const instMaxDays = getDaysInMonth(instY, instM);
        const instDueDay = Math.min(card.dueDay, instMaxDays);
        const instDueDate = `${instY}-${String(instM).padStart(2, '0')}-${String(instDueDay).padStart(2, '0')}`;

        installments.push({
          installmentNumber: i,
          totalInstallments: installmentsCount,
          amount: installmentValue,
          competence: instInvoiceMonth,
          dueDate: instDueDate,
          invoiceMonth: instInvoiceMonth,
          settled: false
        });
      }

      newPurchases.push({
        id: purchaseId,
        cardId: card.id,
        transactionType: it.transactionType || 'DESPESA',
        purchaseDate: it.formattedDate,
        description: edits.description,
        counterpartyId: edits.counterpartyId,
        counterpartyName: edits.counterpartyName,
        chartAccountId: edits.chartAccountId,
        totalAmount,
        installmentsCount,
        calculationMode: 'TOTAL_DIVIDED',
        installmentValue,
        invoiceMonth,
        installments,
        notes: `Importado de fatura/extrato do cartão ${card.name} (${invoiceMonth})`,
        createdAt: new Date().toISOString()
      });
    }

    // Save batch in storage and sync with Contas a Pagar
    storage.batchAddCardPurchasesAndSyncTitles(newPurchases);

    toast.success(`✓ ${newPurchases.length} novos lançamentos importados e sincronizados com a fatura ${invoiceMonth}!`);
    onSuccess();
    onClose();
  };

  const selectedCount = selectedMissingIds.size;
  const selectedSum = comparison.missingInSystem
    .filter(m => selectedMissingIds.has(m.invoiceItem!.id))
    .reduce((acc, m) => acc + m.invoiceItem!.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div 
        className="bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#26262b] rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header com identidade do Cartão */}
        <div className="px-6 py-4.5 border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/80 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-md shrink-0"
              style={{ backgroundColor: card.color || '#cdaa58' }}
            >
              <CardIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Conciliação e Cruzamento de Fatura ({card.name})
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  Fatura: {invoiceMonth}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Compare a fatura do banco com os lançamentos manuais do sistema e cadastre compras faltantes.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Seção 1: Upload ou Colagem da Fatura */}
          {importedItems.length === 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('UPLOAD')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      activeTab === 'UPLOAD'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload de Fatura (PDF / OFX / Excel)
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('PASTE')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      activeTab === 'PASTE'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Colar Texto da Fatura
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleLoadSampleInvoice}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Carregar Exemplo de Teste
                </button>
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {activeTab === 'UPLOAD' ? (
                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-500/60 rounded-3xl p-8 text-center bg-slate-50 dark:bg-slate-800/30 transition-all flex flex-col items-center justify-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <FileText className="w-7 h-7" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Selecione ou arraste a fatura do cartão
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-md mx-auto">
                      Formatos aceitos: <strong>OFX</strong>, <strong>CSV</strong>, <strong>PDF</strong> ou <strong>Excel</strong>.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
                      <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-[10px] text-purple-700 dark:text-purple-300 font-semibold">Nubank</span>
                      <span className="px-2 py-0.5 rounded-md bg-orange-100 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-[10px] text-orange-700 dark:text-orange-300 font-semibold">Itaú</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-[10px] text-slate-800 dark:text-slate-200 font-semibold">C6 Bank</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[10px] text-amber-700 dark:text-amber-300 font-semibold">Inter</span>
                      <span className="px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[10px] text-rose-700 dark:text-rose-300 font-semibold">Bradesco</span>
                    </div>
                  </div>

                  <label className="cursor-pointer mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Escolher Arquivo no Computador
                    <input
                      type="file"
                      accept=".pdf,.ofx,.xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isProcessing}
                    />
                  </label>

                  {isProcessing && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 mt-2 font-medium">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Lendo streams de texto e decodificando lançamentos da fatura...
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Abra o PDF da fatura ou o app do banco, selecione os lançamentos (Ctrl+C) e cole abaixo (Ctrl+V):
                  </p>
                  <textarea
                    rows={8}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Exemplo:&#10;14/09 POSTO SHELL R$ 180,00&#10;15/09 UBER *TRIP 28,90&#10;18/09 RESTAURANTE COCO BAMBU R$ 240,00"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                  <button
                    type="button"
                    disabled={isProcessing || !pastedText.trim()}
                    onClick={() => handleParseText(pastedText)}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Processar e Fazer Cruzamento
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Seção 2: Comparativo e Cruzamento de Dados */
            <div className="space-y-6">
              
              {/* Barra de Ação Superior do Comparativo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-amber-500" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Cruzamento de Dados Concluído
                    </h4>
                    <span className="text-xs text-slate-600 dark:text-slate-400">
                      {importedItems.length} lançamentos na fatura importada vs {manualInvoiceItems.length} cadastrados no sistema.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setImportedItems([]);
                    setPastedText('');
                    setErrorMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold border border-slate-300 dark:border-slate-700 flex items-center gap-1.5 transition-colors self-start sm:self-auto cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Importar Outra Fatura
                </button>
              </div>

              {/* Cards de Resumo Comparativo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                    Total Fatura Importada (PDF)
                  </span>
                  <div className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                    {formatBRL(comparison.totalImported)}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {importedItems.length} transações no documento
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                    Total Já Lançado no Sistema
                  </span>
                  <div className="text-lg font-bold text-slate-900 dark:text-slate-200 font-mono">
                    {formatBRL(comparison.totalManual)}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {manualInvoiceItems.length} compras cadastradas nesta fatura
                  </span>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  comparison.totalDifference > 0.05 
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400' 
                    : comparison.totalDifference < -0.05
                      ? 'bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-400'
                      : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                }`}>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                    Divergência / Saldo Faltante
                  </span>
                  <div className="text-lg font-bold font-mono">
                    {comparison.totalDifference > 0 ? `+${formatBRL(comparison.totalDifference)}` : formatBRL(comparison.totalDifference)}
                  </div>
                  <span className="text-[10px] block mt-0.5 opacity-90">
                    {comparison.missingInSystem.length > 0
                      ? `${comparison.missingInSystem.length} compras faltantes a lançar`
                      : 'Fatura 100% conciliada!'}
                  </span>
                </div>
              </div>

              {/* Abas de Visualização do Cruzamento */}
              <div className="flex border-b border-slate-800 gap-2">
                <button
                  type="button"
                  onClick={() => setResultFilterTab('MISSING')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                    resultFilterTab === 'MISSING'
                      ? 'border-amber-500 text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                  Faltando Lançar no Sistema
                  <span className={`px-2 py-0.2 rounded-full text-[10px] ${
                    comparison.missingInSystem.length > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {comparison.missingInSystem.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setResultFilterTab('MATCHED')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                    resultFilterTab === 'MATCHED'
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Já Bateu / Conciliados
                  <span className="px-2 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300">
                    {comparison.matched.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setResultFilterTab('ONLY_SYSTEM')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                    resultFilterTab === 'ONLY_SYSTEM'
                      ? 'border-slate-400 text-slate-200'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                  Apenas no Sistema
                  <span className="px-2 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-400">
                    {comparison.onlyInSystem.length}
                  </span>
                </button>
              </div>

              {/* Tabela de Lançamentos Faltantes (Com seleção e edição rápida) */}
              {resultFilterTab === 'MISSING' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleSelectAllMissing}
                        className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                      >
                        {selectedMissingIds.size === comparison.missingInSystem.length ? (
                          <CheckSquare className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                        {selectedMissingIds.size === comparison.missingInSystem.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                      </button>
                      <span>({selectedCount} selecionados de {comparison.missingInSystem.length})</span>
                    </div>

                    <span className="text-[11px] text-slate-400">
                      Total selecionado para importar: <strong className="text-amber-400 font-mono">{formatBRL(selectedSum)}</strong>
                    </span>
                  </div>

                  {comparison.missingInSystem.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 dark:text-emerald-400 mx-auto mb-2" />
                      Nenhum lançamento faltando! Todas as compras da fatura importada já constam no sistema.
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">
                          <tr>
                            <th className="p-3 w-10 text-center">Sel.</th>
                            <th className="p-3">Data</th>
                            <th className="p-3">Descrição / Estabelecimento</th>
                            <th className="p-3">Categoria (Plano de Contas)</th>
                            <th className="p-3">Fornecedor</th>
                            <th className="p-3 text-center">Parcela</th>
                            <th className="p-3 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                          {comparison.missingInSystem.map(m => {
                            const it = m.invoiceItem!;
                            const isChecked = selectedMissingIds.has(it.id);
                            const edits = itemEdits[it.id] || {
                              description: it.description,
                              chartAccountId: it.suggestedChartAccountId || chartAccounts[0]?.id || 'acc-desp-1',
                              counterpartyName: it.suggestedCounterpartyName || it.cleanDescription
                            };

                            return (
                              <tr 
                                key={it.id} 
                                className={`transition-colors ${
                                  isChecked ? 'bg-amber-500/10 dark:bg-amber-950/20 hover:bg-amber-500/15 dark:hover:bg-amber-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 opacity-70'
                                }`}
                              >
                                <td className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleSelectMissing(it.id)}
                                    className="rounded border-slate-300 dark:border-slate-700 text-amber-500 focus:ring-amber-500/30 cursor-pointer"
                                  />
                                </td>
                                <td className="p-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {it.formattedDate}
                                </td>
                                <td className="p-3">
                                  <input
                                    type="text"
                                    value={edits.description}
                                    onChange={(e) => handleEditChange(it.id, 'description', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                                  />
                                </td>
                                <td className="p-3">
                                  <PremiumSelect
                                    value={edits.chartAccountId}
                                    onChange={(e) => handleEditChange(it.id, 'chartAccountId', e.target.value)}
                                    style={{ colorScheme: 'light dark' }}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 cursor-pointer"
                                  >
                                    {chartAccounts
                                      .filter(a => a.type === 'DESPESA' || a.code.startsWith('4.'))
                                      .map(a => (
                                        <option 
                                          key={a.id} 
                                          value={a.id}
                                          className="bg-white text-slate-900 dark:bg-[#131316] dark:text-white"
                                        >
                                          {a.code} - {a.name}
                                        </option>
                                      ))}
                                  </PremiumSelect>
                                </td>
                                <td className="p-3">
                                  <input
                                    type="text"
                                    value={edits.counterpartyName}
                                    onChange={(e) => handleEditChange(it.id, 'counterpartyName', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                                    placeholder="Nome do Fornecedor"
                                  />
                                </td>
                                <td className="p-3 text-center">
                                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px] font-bold text-amber-700 dark:text-amber-400 border border-slate-200 dark:border-slate-700">
                                    {it.installmentText || '1/1'}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                  {formatBRL(it.amount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Tabela de Lançamentos Conciliados (Já Batem) */}
              {resultFilterTab === 'MATCHED' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Estes lançamentos constam tanto na fatura importada quanto nos registros manuais do sistema:
                  </p>

                  <div className="border border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                        <tr>
                          <th className="p-3">Data Fatura</th>
                          <th className="p-3">Lançamento na Fatura PDF</th>
                          <th className="p-3">Lançamento Manual no Sistema</th>
                          <th className="p-3">Categoria</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-slate-300">
                        {comparison.matched.map(m => (
                          <tr key={m.id} className="hover:bg-slate-800/40">
                            <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                              {m.invoiceItem?.formattedDate}
                            </td>
                            <td className="p-3 font-medium text-white">
                              {m.invoiceItem?.description}
                            </td>
                            <td className="p-3 text-slate-300">
                              {m.manualItem?.description} ({m.manualItem?.counterpartyName})
                            </td>
                            <td className="p-3 text-slate-400">
                              {m.manualItem?.chartAccountName}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1 mx-auto w-fit">
                                <CheckCircle2 className="w-3 h-3" />
                                Conciliado
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                              {formatBRL(m.invoiceItem?.amount || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tabela de Lançamentos Apenas no Sistema */}
              {resultFilterTab === 'ONLY_SYSTEM' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Lançamentos registrados manualmente nesta fatura ({invoiceMonth}), mas que <strong>não foram localizados no arquivo importado</strong>:
                  </p>

                  {comparison.onlyInSystem.length === 0 ? (
                    <div className="p-8 text-center bg-slate-800/40 rounded-xl border border-slate-800 text-slate-400 text-xs">
                      Nenhum lançamento órfão. Todas as compras cadastradas manualmente bateram com o arquivo.
                    </div>
                  ) : (
                    <div className="border border-slate-700 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800 text-slate-300 font-semibold border-b border-slate-700">
                          <tr>
                            <th className="p-3">Data</th>
                            <th className="p-3">Descrição da Compra</th>
                            <th className="p-3">Fornecedor</th>
                            <th className="p-3">Categoria</th>
                            <th className="p-3 text-center">Parcela</th>
                            <th className="p-3 text-right">Valor no Sistema</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {comparison.onlyInSystem.map(m => (
                            <tr key={m.id} className="hover:bg-slate-800/40">
                              <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                                {m.manualItem?.purchaseDate}
                              </td>
                              <td className="p-3 font-medium text-white">
                                {m.manualItem?.description}
                              </td>
                              <td className="p-3 text-slate-300">
                                {m.manualItem?.counterpartyName}
                              </td>
                              <td className="p-3 text-slate-400">
                                {m.manualItem?.chartAccountName}
                              </td>
                              <td className="p-3 text-center font-mono">
                                {m.manualItem?.installmentNumber}/{m.manualItem?.totalInstallments}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-300 whitespace-nowrap">
                                {formatBRL(m.manualItem?.amount || 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

        </div>

        {/* Footer com botões de ação */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {importedItems.length > 0 && (
              <span>
                Competência de lançamento: <strong className="text-slate-900 dark:text-white">{formatCompetence(invoiceMonth)}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-[#1b1b20] dark:hover:bg-slate-800 border border-slate-200 dark:border-[#26262b] rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            {importedItems.length > 0 && comparison.missingInSystem.length > 0 && (
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={handleConfirmImportMissing}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:brightness-105 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.2]" />
                Importar e Cadastrar {selectedCount} {selectedCount === 1 ? 'Lançamento Faltante' : 'Lançamentos Faltantes'} ({formatBRL(selectedSum)})
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
