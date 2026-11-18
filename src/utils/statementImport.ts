import { StatementEntry } from '../types';

export interface IncomingLine {
  fitId?: string;
  date: string; // AAAA-MM-DD
  amount: number;
  description: string;
}

const norm = (t: string) =>
  (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const cents = (v: number) => Math.round(Math.abs(v) * 100) * (v < 0 ? -1 : 1);
const kindOf = (batchId?: string) => (batchId || '').startsWith('batch-pdf') ? 'pdf' : (batchId || '').startsWith('batch-ofx') ? 'ofx' : 'outro';

export interface DedupeResult<T extends IncomingLine> {
  fresh: T[];
  skipped: T[];
}

/**
 * Separa o que já está no extrato daquela conta do que é novo.
 * 1) mesmo código do banco (fitId);
 * 2) mesma data, valor e descrição: conta por quantidade (duas compras iguais no mesmo dia continuam valendo, mas
 *    re-importar o mesmo período não duplica nada);
 * 3) mesma data e valor vindos de OUTRO formato (OFX x PDF), em que a descrição muda um pouco.
 */
export function dedupeIncoming<T extends IncomingLine>(
  existing: StatementEntry[],
  incoming: T[],
  incomingKind: 'ofx' | 'pdf'
): DedupeResult<T> {
  const fit = new Set(existing.filter(e => e.fitId).map(e => e.fitId as string));
  const exact = new Map<string, number>();
  const crossFormat = new Map<string, number>();
  for (const e of existing) {
    const k3 = `${e.date}|${cents(e.amount)}|${norm(e.description)}`;
    exact.set(k3, (exact.get(k3) || 0) + 1);
    if (kindOf(e.importBatchId) !== incomingKind) {
      const k2 = `${e.date}|${cents(e.amount)}`;
      crossFormat.set(k2, (crossFormat.get(k2) || 0) + 1);
    }
  }
  const usedExact = new Map<string, number>();
  const usedCross = new Map<string, number>();
  const fresh: T[] = [];
  const skipped: T[] = [];
  for (const l of incoming) {
    if (l.fitId && fit.has(l.fitId)) { skipped.push(l); continue; }
    const k3 = `${l.date}|${cents(l.amount)}|${norm(l.description)}`;
    if ((usedExact.get(k3) || 0) < (exact.get(k3) || 0)) {
      usedExact.set(k3, (usedExact.get(k3) || 0) + 1);
      skipped.push(l);
      continue;
    }
    const k2 = `${l.date}|${cents(l.amount)}`;
    if ((usedCross.get(k2) || 0) < (crossFormat.get(k2) || 0)) {
      usedCross.set(k2, (usedCross.get(k2) || 0) + 1);
      skipped.push(l);
      continue;
    }
    fresh.push(l);
  }
  return { fresh, skipped };
}

export interface ImportLogEntry {
  accountId: string;
  importedAt: string; // ISO
  fileName: string;
  kind: 'ofx' | 'pdf';
  from: string; // AAAA-MM-DD (primeira data do arquivo)
  to: string;   // AAAA-MM-DD (última data do arquivo)
  total: number;
  added: number;
  skipped: number;
}

const logKey = () => {
  let org = 'local';
  try { org = localStorage.getItem('contaju_active_org') || 'local'; } catch { /* sem storage */ }
  return `contaju_extrato_imports_${org}`;
};

export function getImportLog(): ImportLogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(logKey()) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function addImportLog(entry: ImportLogEntry): void {
  try {
    const all = [entry, ...getImportLog()].slice(0, 100);
    localStorage.setItem(logKey(), JSON.stringify(all));
  } catch { /* o registro é só informativo */ }
}

export function periodOf(lines: IncomingLine[]): { from: string; to: string } {
  const dates = lines.map(l => l.date).filter(Boolean).sort();
  return { from: dates[0] || '', to: dates[dates.length - 1] || '' };
}

/** Período que o extrato da conta já cobre (a partir dos lançamentos guardados, vale em qualquer aparelho). */
export function coverageOf(entries: StatementEntry[], accountId: string): { from: string; to: string; count: number } | null {
  const dates = entries.filter(e => e.bankAccountId === accountId && e.date).map(e => e.date).sort();
  if (dates.length === 0) return null;
  return { from: dates[0], to: dates[dates.length - 1], count: dates.length };
}

export function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
