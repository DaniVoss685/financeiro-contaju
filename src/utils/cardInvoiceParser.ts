/**
 * Credit Card Invoice Parser & Reconciliation Engine
 * 
 * Supports extracting and parsing credit card statements and invoices from:
 * 1. PDF files (decompresses Flate streams and extracts transaction text)
 * 2. OFX statement files
 * 3. Excel (.xlsx) / CSV files
 * 4. Raw pasted invoice text (copy-paste from bank app / PDF)
 */

import { parseOFX } from './ofxParser';
import * as XLSX from 'xlsx';
import { ChartAccount, Counterparty } from '../types';
import { getFilteredChartAccounts } from '../services/financialEngine';

export interface ParsedInvoiceTransaction {
  id: string;
  transactionType?: 'DESPESA' | 'ESTORNO' | 'CASHBACK';
  rawDate: string; // ex: "14/09" ou "14/09/2026"
  formattedDate: string; // YYYY-MM-DD
  description: string;
  cleanDescription: string;
  amount: number; // Valor em R$ (positivo)
  installmentText?: string; // ex: "02/05"
  installmentNumber?: number;
  totalInstallments?: number;
  suggestedChartAccountId?: string;
  suggestedCounterpartyId?: string;
  suggestedCounterpartyName?: string;
}

export interface InvoiceComparisonMatch {
  id: string;
  status: 'MATCHED' | 'MISSING_IN_SYSTEM' | 'ONLY_IN_SYSTEM';
  invoiceItem?: ParsedInvoiceTransaction;
  manualItem?: {
    purchaseId: string;
    purchaseDate: string;
    description: string;
    counterpartyName: string;
    chartAccountName: string;
    installmentNumber: number;
    totalInstallments: number;
    amount: number;
    dueDate: string;
  };
  difference?: number;
  confidenceScore?: number; // 0 a 100
}

/**
 * Extracts plain text from a PDF buffer in pure browser/JS environment.
 */
export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const textDecoder = new TextDecoder('latin1');
  const fullRaw = textDecoder.decode(bytes);

  const extractedChunks: string[] = [];

  // 1. Find all streams
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(fullRaw)) !== null) {
    const streamStart = match.index + match[0].indexOf('\n') + 1;
    const streamEnd = match.index + match[0].lastIndexOf('endstream');
    const streamBytes = bytes.slice(streamStart, streamEnd);

    // Check if previous dictionary had /FlateDecode
    const dictSlice = fullRaw.substring(Math.max(0, match.index - 300), match.index);
    const isFlate = dictSlice.includes('/FlateDecode') || dictSlice.includes('/Fl');

    let decompressedBytes: Uint8Array | null = null;

    if (isFlate) {
      try {
        // Modern browser DecompressionStream (deflate or deflate-raw)
        if (typeof DecompressionStream !== 'undefined') {
          try {
            const ds = new DecompressionStream('deflate');
            const writer = ds.writable.getWriter();
            writer.write(streamBytes);
            writer.close();
            const response = new Response(ds.readable);
            const arrayBuf = await response.arrayBuffer();
            decompressedBytes = new Uint8Array(arrayBuf);
          } catch {
            // Try deflate-raw if zlib header was stripped
            const dsRaw = new DecompressionStream('deflate-raw');
            const writerRaw = dsRaw.writable.getWriter();
            writerRaw.write(streamBytes);
            writerRaw.close();
            const responseRaw = new Response(dsRaw.readable);
            const arrayBufRaw = await responseRaw.arrayBuffer();
            decompressedBytes = new Uint8Array(arrayBufRaw);
          }
        }
      } catch {
        // Fallback or ignore non-decompressed stream
      }
    }

    const streamStr = textDecoder.decode(decompressedBytes || streamBytes);
    
    // Extract text from text blocks: (string) Tj or [(str1) 12 (str2)] TJ
    const textBlockRegex = /(?:\[((?:[^\(\]]|\([^\)]*\))*)\]\s*TJ|\(([^\)]*)\)\s*Tj)/g;
    let textMatch: RegExpExecArray | null;

    while ((textMatch = textBlockRegex.exec(streamStr)) !== null) {
      if (textMatch[2] !== undefined) {
        // Simple string (text) Tj
        extractedChunks.push(cleanPdfString(textMatch[2]));
      } else if (textMatch[1] !== undefined) {
        // Array of strings [(...) 10 (...)] TJ
        const innerStrings = textMatch[1].match(/\(([^\)]*)\)/g);
        if (innerStrings) {
          const joined = innerStrings.map(s => cleanPdfString(s.slice(1, -1))).join(' ');
          extractedChunks.push(joined);
        }
      }
    }
  }

  // If stream extraction found substantial text, return it
  if (extractedChunks.length > 5) {
    return extractedChunks.join('\n');
  }

  // Fallback: extract any visible string literals from raw PDF
  const rawStringMatches = fullRaw.match(/\(([^\)]{3,})\)/g) || [];
  return rawStringMatches.map(s => cleanPdfString(s.slice(1, -1))).join('\n');
}

function cleanPdfString(str: string): string {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Intelligent categorization based on Brazilian commerce terms and vendor names
 */
export function suggestCategoryAndCounterparty(
  description: string,
  chartAccounts: ChartAccount[],
  counterparties: Counterparty[]
): { chartAccountId: string; counterpartyId?: string; counterpartyName: string } {
  const upper = description.toUpperCase();

  // Clean name
  let cleanName = description
    .replace(/\d{1,2}\/\d{1,2}/g, '') // remove installment info like 01/03
    .replace(/PARC\.?\s*\d+/gi, '')
    .replace(/R\$\s*[\d\.\,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Try to match existing counterparty
  const matchedCounterparty = counterparties.find(c => {
    const cUpper = c.name.toUpperCase();
    return upper.includes(cUpper) || cUpper.includes(upper) || (cleanName && cUpper.includes(cleanName.toUpperCase()));
  });

  const counterpartyId = matchedCounterparty?.id;
  const counterpartyName = matchedCounterparty?.name || cleanName || 'Fornecedor Fatura';

  // Find suitable expense accounts
  // Só despesas operacionais de verdade (exclui deduções da receita, tributos e resultado financeiro)
  const expenseAccounts = getFilteredChartAccounts(chartAccounts, 'PAGAR')
    .filter(a => (a.nature || '').startsWith('DESPESA') || /^[35]/.test(a.code || ''))
    .sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

  // Rules
  const findAccountByTerms = (terms: string[]) => {
    return expenseAccounts.find(a => 
      terms.some(t => a.name.toLowerCase().includes(t.toLowerCase()) || a.code.includes(t))
    )?.id;
  };

  let chartAccountId = '';

  if (/UBER|99APP|TAXI|POSTO|SHELL|IPIRANGA|PETROBRAS|COMBUSTIVEL|SEM PARAR|VELOE|AUTO POSTO/i.test(upper)) {
    chartAccountId = findAccountByTerms(['Combustível', 'Transporte', 'Veículos', 'Despesas com Veículos']) || '';
  } else if (/IFOOD|RAPPI|RESTAURANTE|LANCHONETE|PADARIA|MCDONALD|BURGER|CAFE|ALIMENTACAO|REFEICAO|OUTBACK|COCO BAMBU/i.test(upper)) {
    chartAccountId = findAccountByTerms(['Alimentação', 'Refeição', 'Copa', 'Lanches']) || '';
  } else if (/GOOGLE|MICROSOFT|AWS|AMAZON WEB|ADOBE|CHATGPT|OPENAI|GITHUB|ZOOM|APPLE\.COM|HOSTGATOR|LOCAWEB|CANVA|DROPBOX|SLACK/i.test(upper)) {
    chartAccountId = findAccountByTerms(['Software', 'Licença', 'TI', 'Informática', 'Tecnologia']) || '';
  } else if (/KALUNGA|PAPELARIA|MATERIAL DE ESCRITORIO|GRAFICA|IMPRESSAO/i.test(upper)) {
    chartAccountId = findAccountByTerms(['Material de Escritório', 'Impressos', 'Papelaria']) || '';
  } else if (/HOTEL|AIRBNB|BOOKING|VOEGOL|LATAM|AZUL|PASSAGEM|VIAGEM|HOSPEDAGEM/i.test(upper)) {
    chartAccountId = findAccountByTerms(['Viagens', 'Hospedagem', 'Passagens']) || '';
  } else if (/FARMACIA|DROGASIL|DROGA RAIA|PACHECO|PAGUE MENOS|CONSULTA|LABORATORIO/i.test(upper)) {
    chartAccountId = findAccountByTerms(['Saúde', 'Medicamentos', 'Benefícios']) || '';
  } else if (/TELEFONIA|VIVO|CLARO|TIM|OI|INTERNET|FIBRA/i.test(upper)) {
    chartAccountId = findAccountByTerms(['Telefonia', 'Comunicação', 'Internet']) || '';
  }

  // Fallback to general administrative/operational expense
  if (!chartAccountId) {
    const generalAcc = expenseAccounts.find(a => /gerais|outras|diversas/i.test(a.name)) || expenseAccounts.find(a => a.nature === 'DESPESA_ADMINISTRATIVA');
    chartAccountId = generalAcc ? generalAcc.id : (expenseAccounts[0]?.id || 'acc-desp-1');
  }

  return {
    chartAccountId,
    counterpartyId,
    counterpartyName
  };
}

/**
 * Parses raw text extracted from invoice into structured transactions.
 */
export function parseInvoiceTextLines(
  rawText: string,
  targetInvoiceMonth: string, // YYYY-MM
  chartAccounts: ChartAccount[] = [],
  counterparties: Counterparty[] = []
): ParsedInvoiceTransaction[] {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: ParsedInvoiceTransaction[] = [];

  const [yearStr, monthStr] = targetInvoiceMonth.split('-');
  const targetYear = parseInt(yearStr, 10);
  const targetMonth = parseInt(monthStr, 10);

  // Ignore summary and payment lines (credits that reduce invoice balance or bank transfers)
  const ignorePatterns = [
    /PAGAMENTO\s+(?:RECEBIDO|DE\s+FATURA|EFETUADO)/i,
    /SALDO\s+(?:ANTERIOR|ATUAL|DA\s+FATURA)/i,
    /TOTAL\s+(?:DESTA\s+FATURA|DA\s+FATURA|A\s+PAGAR)/i,
    /PAGAMENTO\s+MINIMO/i,
    /ENCARGOS|JUROS\s+DE\s+MORA|MULTA\s+POR\s+ATRASO/i,
    /CREDITO\s+DE\s+PAGAMENTO/i
  ];

  let idCounter = 1;

  for (const line of lines) {
    // Check if line should be ignored
    if (ignorePatterns.some(p => p.test(line))) {
      continue;
    }

    // Pattern 1: DD/MM or DD/MM/YYYY Description Amount
    // Ex: "12/09 UBER *TRIP SAO PAULO BR 24,90"
    // Ex: "15/09/2026 POSTO SHELL 150,00"
    // Ex: "20/09 IFOOD *PEDIDO 01/03 R$ 89,90"
    const lineRegex = /^(\d{1,2}[\/\.]\d{1,2}(?:[\/\.]\d{2,4})?)\s+(.+?)\s+(?:R\$\s*)?(-?[\d\.\,]+)$/i;
    const match = line.match(lineRegex);

    if (match) {
      const rawDateStr = match[1].replace(/\./g, '/');
      const descAndInst = match[2].trim();
      let rawAmountStr = match[3].trim();

      // Convert Brazilian number format (1.234,56 or 123,45)
      let amount = 0;
      let isNegative = rawAmountStr.startsWith('-') || /ESTORNO|REEMBOLSO|DEVOLUCAO|CASHBACK/i.test(descAndInst);
      const cleanRawAmount = rawAmountStr.replace(/^-/, '');

      if (cleanRawAmount.includes(',')) {
        amount = parseFloat(cleanRawAmount.replace(/\./g, '').replace(',', '.'));
      } else {
        amount = parseFloat(cleanRawAmount);
      }

      if (isNaN(amount) || amount === 0) continue;
      amount = Math.abs(amount);

      let transactionType: 'DESPESA' | 'ESTORNO' | 'CASHBACK' = 'DESPESA';
      if (isNegative) {
        transactionType = /CASHBACK/i.test(descAndInst) ? 'CASHBACK' : 'ESTORNO';
      }

      // Extract installment if present (e.g. 02/05 or Parc 2 de 5)
      let installmentText: string | undefined;
      let installmentNumber: number | undefined;
      let totalInstallments: number | undefined;

      const instMatch = descAndInst.match(/(?:(?:PARC(?:ELA)?\.?\s*)?(\d{1,2})\/(\d{1,2}))|(?:(\d{1,2})\s*DE\s*(\d{1,2}))/i);
      if (instMatch) {
        const current = parseInt(instMatch[1] || instMatch[3], 10);
        const total = parseInt(instMatch[2] || instMatch[4], 10);
        if (current > 0 && total >= current && total <= 120) {
          installmentNumber = current;
          totalInstallments = total;
          installmentText = `${current}/${total}`;
        }
      }

      // Format date to YYYY-MM-DD
      const dateParts = rawDateStr.split('/');
      const day = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10);
      let year = targetYear;
      if (dateParts[2]) {
        year = dateParts[2].length === 2 ? 2000 + parseInt(dateParts[2], 10) : parseInt(dateParts[2], 10);
      } else {
        // If invoice month is January and transaction is in December, year was previous
        if (targetMonth === 1 && month === 12) {
          year = targetYear - 1;
        }
      }

      const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Suggest category and counterparty
      const suggestions = suggestCategoryAndCounterparty(descAndInst, chartAccounts, counterparties);

      items.push({
        id: `inv-item-${Date.now()}-${idCounter++}`,
        transactionType,
        rawDate: rawDateStr,
        formattedDate,
        description: descAndInst,
        cleanDescription: suggestions.counterpartyName,
        amount: Math.round(amount * 100) / 100,
        installmentText,
        installmentNumber,
        totalInstallments,
        suggestedChartAccountId: suggestions.chartAccountId,
        suggestedCounterpartyId: suggestions.counterpartyId,
        suggestedCounterpartyName: suggestions.counterpartyName
      });
    }
  }

  return items;
}

/**
 * Parses spreadsheet (.xlsx / .csv) into parsed invoice transactions.
 * Includes dedicated column mapping for Nubank, Itaú, C6 Bank, Banco Inter and Bradesco.
 */
export function parseInvoiceSpreadsheet(
  buffer: ArrayBuffer,
  targetInvoiceMonth: string,
  chartAccounts: ChartAccount[] = [],
  counterparties: Counterparty[] = []
): ParsedInvoiceTransaction[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const items: ParsedInvoiceTransaction[] = [];
  const [yearStr] = targetInvoiceMonth.split('-');
  const targetYear = parseInt(yearStr, 10);

  let idCounter = 1;

  // 1. Check if first row is a recognizable header row (Nubank, Itaú, C6, Inter, Bradesco)
  let dateCol = -1;
  let descCol = -1;
  let amountCol = -1;
  let catCol = -1;
  let instCol = -1;
  let startIndex = 0;

  if (rawRows.length > 0 && Array.isArray(rawRows[0])) {
    const headerRow = rawRows[0].map(c => String(c || '').toLowerCase().trim());
    headerRow.forEach((col, idx) => {
      if (/(^date$|^data$|data_compra|data compra|data da transação)/i.test(col)) dateCol = idx;
      else if (/(^title$|^descri|^lançamento|^histor|^estabelecimento|^merchant)/i.test(col)) descCol = idx;
      else if (/(^amount$|^valor$|^total$|^vlr$)/i.test(col)) amountCol = idx;
      else if (/(^category$|^categoria$)/i.test(col)) catCol = idx;
      else if (/(^parcela$|^installment$)/i.test(col)) instCol = idx;
    });

    if (dateCol !== -1 && (descCol !== -1 || amountCol !== -1)) {
      startIndex = 1; // Skip header
    }
  }

  for (let r = startIndex; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length < 2) continue;

    let dateStr = '';
    let desc = '';
    let amount = 0;
    let isNegative = false;
    let explicitCategory = '';
    let installmentText: string | undefined;

    if (dateCol !== -1 && descCol !== -1 && amountCol !== -1) {
      // Map using discovered bank headers
      dateStr = String(row[dateCol] || '').trim();
      desc = String(row[descCol] || '').trim();
      const rawAmt = row[amountCol];

      if (typeof rawAmt === 'number') {
        isNegative = rawAmt < 0;
        amount = Math.abs(rawAmt);
      } else if (typeof rawAmt === 'string') {
        const cleaned = rawAmt.replace(/[R\$\s]/g, '').trim();
        isNegative = cleaned.startsWith('-') || /^-/.test(cleaned);
        const numStr = cleaned.replace(/^-/, '');
        amount = numStr.includes(',')
          ? parseFloat(numStr.replace(/\./g, '').replace(',', '.'))
          : parseFloat(numStr);
      }

      if (catCol !== -1 && row[catCol]) explicitCategory = String(row[catCol]).trim();
      if (instCol !== -1 && row[instCol]) installmentText = String(row[instCol]).trim();
    } else {
      // Fallback heuristics: search cells
      for (const cell of row) {
        if (!cell) continue;
        const valStr = String(cell).trim();

        if (!dateStr && /(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)/.test(valStr)) {
          dateStr = valStr;
          continue;
        }

        if (typeof cell === 'number' && amount === 0) {
          isNegative = cell < 0;
          amount = Math.abs(cell);
          continue;
        } else if (typeof cell === 'string') {
          const cleanedVal = valStr.replace(/[R\$\s]/g, '');
          if (/^-?[\d\.\,]+$/.test(cleanedVal)) {
            isNegative = cleanedVal.startsWith('-');
            const numStr = cleanedVal.replace(/^-/, '');
            const num = numStr.includes(',') 
              ? parseFloat(numStr.replace(/\./g, '').replace(',', '.'))
              : parseFloat(numStr);
            if (!isNaN(num) && num > 0 && amount === 0) {
              amount = num;
              continue;
            }
          }
        }

        if (!desc && typeof cell === 'string' && valStr.length >= 2 && !/^(data|valor|descri|parcela|amount|date|category)/i.test(valStr)) {
          desc = valStr;
        }
      }
    }

    if (desc && amount > 0) {
      let formattedDate = new Date().toISOString().split('T')[0];
      if (dateStr) {
        // Handle ISO YYYY-MM-DD or Brazilian DD/MM/YYYY
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
          formattedDate = dateStr.slice(0, 10);
        } else {
          const parts = dateStr.replace(/[\-\.]/g, '/').split('/');
          if (parts.length >= 2) {
            const d = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10);
            let y = targetYear;
            if (parts[2]) {
              y = parts[2].length === 2 ? 2000 + parseInt(parts[2], 10) : parseInt(parts[2], 10);
            }
            formattedDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          }
        }
      }

      // Detect Estorno / Cashback from description or negative value
      let transactionType: 'DESPESA' | 'ESTORNO' | 'CASHBACK' = 'DESPESA';
      if (isNegative || /ESTORNO|REEMBOLSO|DEVOLUCAO|CASHBACK|CREDITO\s+DE\s+PAGAMENTO/i.test(desc)) {
        transactionType = /CASHBACK/i.test(desc) ? 'CASHBACK' : 'ESTORNO';
      }

      // Detect installment in description if not already extracted
      let installmentNumber: number | undefined;
      let totalInstallments: number | undefined;
      if (!installmentText) {
        const instMatch = desc.match(/(\d{1,2})\/(\d{1,2})/);
        if (instMatch) {
          installmentNumber = parseInt(instMatch[1], 10);
          totalInstallments = parseInt(instMatch[2], 10);
          installmentText = `${installmentNumber}/${totalInstallments}`;
        }
      }

      const suggestions = suggestCategoryAndCounterparty(desc, chartAccounts, counterparties);

      items.push({
        id: `inv-item-xls-${Date.now()}-${idCounter++}`,
        transactionType,
        rawDate: dateStr || formattedDate,
        formattedDate,
        description: desc,
        cleanDescription: suggestions.counterpartyName,
        amount: Math.round(amount * 100) / 100,
        installmentText,
        installmentNumber,
        totalInstallments,
        suggestedChartAccountId: suggestions.chartAccountId,
        suggestedCounterpartyId: suggestions.counterpartyId,
        suggestedCounterpartyName: suggestions.counterpartyName
      });
    }
  }

  return items;
}

/**
 * Parses OFX credit card statement into parsed invoice transactions.
 * Supports Nubank, Itaú, C6 Bank, Banco Inter, Bradesco and standard OFX 1.0/2.0.
 */
export function parseInvoiceOFX(
  ofxContent: string,
  targetInvoiceMonth: string,
  chartAccounts: ChartAccount[] = [],
  counterparties: Counterparty[] = []
): ParsedInvoiceTransaction[] {
  const ofxItems = parseOFX(ofxContent);
  const items: ParsedInvoiceTransaction[] = [];
  let idCounter = 1;

  for (const it of ofxItems) {
    if (!it.description || isNaN(it.amount)) continue;

    const absAmount = Math.abs(it.amount);
    if (absAmount <= 0) continue;

    // Detect if Estorno / Cashback / Refund
    const upperDesc = it.description.toUpperCase();
    const isCredit = it.type === 'CREDIT' || it.amount > 0 || /ESTORNO|REEMBOLSO|DEVOLUCAO|CASHBACK/i.test(upperDesc);
    let transactionType: 'DESPESA' | 'ESTORNO' | 'CASHBACK' = 'DESPESA';
    if (isCredit && /ESTORNO|REEMBOLSO|DEVOLUCAO/i.test(upperDesc)) {
      transactionType = 'ESTORNO';
    } else if (isCredit && /CASHBACK|RECOMPENSA/i.test(upperDesc)) {
      transactionType = 'CASHBACK';
    } else if (isCredit) {
      transactionType = 'ESTORNO';
    }

    // Extract installment if present in OFX memo/desc
    let installmentText: string | undefined;
    let installmentNumber: number | undefined;
    let totalInstallments: number | undefined;
    const instMatch = it.description.match(/(?:PARC(?:ELA)?\.?\s*)?(\d{1,2})\/(\d{1,2})/i);
    if (instMatch) {
      installmentNumber = parseInt(instMatch[1], 10);
      totalInstallments = parseInt(instMatch[2], 10);
      installmentText = `${installmentNumber}/${totalInstallments}`;
    }

    const suggestions = suggestCategoryAndCounterparty(it.description, chartAccounts, counterparties);

    items.push({
      id: `inv-ofx-${Date.now()}-${idCounter++}`,
      transactionType,
      rawDate: it.date,
      formattedDate: it.date,
      description: it.description,
      cleanDescription: suggestions.counterpartyName,
      amount: Math.round(absAmount * 100) / 100,
      installmentText,
      installmentNumber,
      totalInstallments,
      suggestedChartAccountId: suggestions.chartAccountId,
      suggestedCounterpartyId: suggestions.counterpartyId,
      suggestedCounterpartyName: suggestions.counterpartyName
    });
  }

  return items;
}

/**
 * Cross-references imported invoice transactions with manually registered invoice items.
 */
export function compareInvoiceItems(
  importedItems: ParsedInvoiceTransaction[],
  manualItems: Array<{
    purchaseId: string;
    purchaseDate: string;
    description: string;
    counterpartyName: string;
    chartAccountName: string;
    installmentNumber: number;
    totalInstallments: number;
    amount: number;
    dueDate: string;
  }>
): {
  matched: InvoiceComparisonMatch[];
  missingInSystem: InvoiceComparisonMatch[];
  onlyInSystem: InvoiceComparisonMatch[];
  totalImported: number;
  totalManual: number;
  totalDifference: number;
} {
  const matched: InvoiceComparisonMatch[] = [];
  const missingInSystem: InvoiceComparisonMatch[] = [];
  const usedManualIndices = new Set<number>();

  for (const imp of importedItems) {
    let bestManualIdx = -1;
    let bestScore = 0;

    for (let i = 0; i < manualItems.length; i++) {
      if (usedManualIndices.has(i)) continue;
      const man = manualItems[i];

      // Value check (tolerância de 5 centavos)
      const diff = Math.abs(imp.amount - man.amount);
      if (diff > 0.05) continue;

      let score = 50; // base score for exact amount match

      // Date match
      if (imp.formattedDate === man.purchaseDate) {
        score += 30;
      } else {
        // Date within 3 days
        const impTime = new Date(imp.formattedDate).getTime();
        const manTime = new Date(man.purchaseDate).getTime();
        const daysDiff = Math.abs(impTime - manTime) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 3) {
          score += 20;
        }
      }

      // Description similarity
      const impWords = imp.description.toUpperCase().split(/\s+/).filter(w => w.length > 2);
      const manWords = `${man.description} ${man.counterpartyName}`.toUpperCase().split(/\s+/).filter(w => w.length > 2);
      const commonWords = impWords.filter(w => manWords.some(mw => mw.includes(w) || w.includes(mw)));
      if (commonWords.length > 0) {
        score += 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestManualIdx = i;
      }
    }

    if (bestManualIdx !== -1 && bestScore >= 50) {
      usedManualIndices.add(bestManualIdx);
      matched.push({
        id: `match-${imp.id}`,
        status: 'MATCHED',
        invoiceItem: imp,
        manualItem: manualItems[bestManualIdx],
        difference: 0,
        confidenceScore: bestScore
      });
    } else {
      missingInSystem.push({
        id: `missing-${imp.id}`,
        status: 'MISSING_IN_SYSTEM',
        invoiceItem: imp
      });
    }
  }

  // Find remaining manual items that were not found in the imported invoice
  const onlyInSystem: InvoiceComparisonMatch[] = [];
  manualItems.forEach((man, idx) => {
    if (!usedManualIndices.has(idx)) {
      onlyInSystem.push({
        id: `only-sys-${man.purchaseId}-${man.installmentNumber}`,
        status: 'ONLY_IN_SYSTEM',
        manualItem: man
      });
    }
  });

  const totalImported = Math.round(importedItems.reduce((acc, it) => acc + it.amount, 0) * 100) / 100;
  const totalManual = Math.round(manualItems.reduce((acc, it) => acc + it.amount, 0) * 100) / 100;
  const totalDifference = Math.round((totalImported - totalManual) * 100) / 100;

  return {
    matched,
    missingInSystem,
    onlyInSystem,
    totalImported,
    totalManual,
    totalDifference
  };
}
