import { extractTextFromPdf } from './cardInvoiceParser';

export interface PdfStatementLine {
  date: string; // AAAA-MM-DD
  description: string;
  amount: number; // negativo = saída, positivo = entrada
  fitId: string;
}

const AMOUNT_RE = /(-|\+)?\s*(?:R\$)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*([CD])?(?![\d,])/gi;
const DATE_RE = /(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/;

const OUT_WORDS = /\b(pagamento|pagto|d[eé]bito|saque|tarifa|compra|transfer[eê]ncia enviada|pix enviado|pix env|enviado|ted enviada|boleto|fatura|iof|juros|multa|cobran[cç]a)\b/i;
const IN_WORDS = /\b(recebido|receb|cr[eé]dito|dep[oó]sito|estorno|rendimento|pix recebido|ted recebida|transfer[eê]ncia recebida)\b/i;

function toIso(d: string, m: string, y: string | undefined, fallbackYear: number): string {
  let year = fallbackYear;
  if (y) year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return `${year}-${m}-${d}`;
}

/** Lê o texto de um extrato em PDF e devolve os lançamentos (data, descrição e valor). É uma leitura por aproximação: o usuário confere depois. */
export function parseBankStatementText(text: string): PdfStatementLine[] {
  const yearHint = (text.match(/\b(20\d{2})\b/) || [])[1];
  const fallbackYear = yearHint ? Number(yearHint) : new Date().getFullYear();
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: PdfStatementLine[] = [];
  let currentDate = '';
  const seen = new Map<string, number>();

  for (const line of lines) {
    const dm = line.match(DATE_RE);
    if (dm) currentDate = toIso(dm[1], dm[2], dm[3], fallbackYear);
    if (!currentDate) continue;

    const matches = [...line.matchAll(AMOUNT_RE)];
    if (matches.length === 0) continue;
    // Em extratos, o último valor da linha costuma ser o saldo; o primeiro é o lançamento
    const m = matches.length > 1 ? matches[0] : matches[0];
    const raw = Number(m[2].replace(/\./g, '').replace(',', '.'));
    if (!raw || isNaN(raw)) continue;

    let sign = 0;
    if (m[1] === '-' || (m[3] || '').toUpperCase() === 'D') sign = -1;
    else if (m[1] === '+' || (m[3] || '').toUpperCase() === 'C') sign = 1;
    let description = line
      .replace(DATE_RE, '')
      .replace(AMOUNT_RE, '')
      .replace(/R\$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!sign) sign = IN_WORDS.test(description) ? 1 : OUT_WORDS.test(description) ? -1 : -1;
    if (description.length < 3 || /^saldo/i.test(description) || /saldo (anterior|do dia|final|inicial)/i.test(description)) continue;

    const amount = sign * raw;
    const base = `${currentDate}|${amount.toFixed(2)}|${description.toLowerCase()}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    out.push({
      date: currentDate,
      description,
      amount,
      fitId: `pdf-${currentDate}-${Math.abs(amount * 100).toFixed(0)}-${sign < 0 ? 'D' : 'C'}-${hash(description)}-${n}`
    });
  }
  return out;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

export async function parseBankStatementPdf(buffer: ArrayBuffer): Promise<PdfStatementLine[]> {
  const text = await extractTextFromPdf(buffer);
  if (!text || text.trim().length < 20) {
    throw new Error('O PDF não tem texto legível (pode ser uma imagem). Baixe o extrato em outro formato ou copie o texto.');
  }
  return parseBankStatementText(text);
}
