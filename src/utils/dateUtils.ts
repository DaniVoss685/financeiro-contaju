/**
 * Safe Financial Date Arithmetic Utilities
 * 
 * Provides deterministic calendar calculations free from JavaScript Date
 * timezone shifts (UTC/local) and month overflow anomalies (e.g. Jan 31 -> Mar 3).
 */

/**
 * Returns the maximum number of days in a specific year and month (1-based).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Safely advances or steps a competence string (YYYY-MM) by N months.
 */
export function advanceCompetence(competenceStr: string, monthsToAdd: number): string {
  if (!competenceStr || !competenceStr.includes('-')) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const [yStr, mStr] = competenceStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  const totalMonths = (y * 12 + (m - 1)) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
}

/**
 * Safely adds months to a YYYY-MM-DD date, respecting a preferred day of month
 * and clamping to the last valid day of the month (e.g. Jan 31 + 1 month -> Feb 28, + 2 months -> Mar 31).
 * Completely immune to timezone offsets and DST transitions.
 */
export function addMonthsSafe(
  baseDateStr: string,
  monthsToAdd: number,
  preferredDay?: number
): string {
  if (!baseDateStr || !baseDateStr.includes('-')) {
    return new Date().toISOString().split('T')[0];
  }

  const parts = baseDateStr.split('-').map(Number);
  const origYear = parts[0];
  const origMonth = parts[1]; // 1-based
  const origDay = parts[2];

  const targetDayPreference = preferredDay !== undefined ? preferredDay : origDay;

  const totalMonths = (origYear * 12 + (origMonth - 1)) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  const maxDays = getDaysInMonth(targetYear, targetMonth);
  const finalDay = Math.min(targetDayPreference, maxDays);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
}

/**
 * Formats a YYYY-MM-DD date string into Brazilian DD/MM/YYYY without timezone conversion.
 */
export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr || !dateStr.includes('-')) return '-';
  const [y, m, d] = dateStr.split('T')[0].split('-');
  if (!y || !m || !d) return dateStr;
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/**
 * Parses a Brazilian DD/MM/YYYY date string into standard ISO YYYY-MM-DD.
 */
export function parseDateBR(dateStr?: string | null): string {
  if (!dateStr || !dateStr.includes('/')) return '';
  const [d, m, y] = dateStr.split('/');
  if (!d || !m || !y) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Formata um período (mês 1-12 ou 0 para o ano inteiro) como intervalo em dia/mês/ano.
 * Ex.: (11, 2026) -> "01/11/2026 – 30/11/2026"; (0, 2026) -> "01/01/2026 – 31/12/2026".
 */
export function formatPeriodRangeBR(month: number, year: number): string {
  const firstMonth = month === 0 ? 1 : month;
  const lastMonth = month === 0 ? 12 : month;
  const lastDay = getDaysInMonth(year, lastMonth);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `01/${pad(firstMonth)}/${year} – ${pad(lastDay)}/${pad(lastMonth)}/${year}`;
}
