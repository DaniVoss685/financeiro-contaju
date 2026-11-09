import { FinancialTitle } from '../types';
import { storage } from './storageService';
import { FinancialEngine } from './financialEngine';
import { getDaysInMonth, advanceCompetence } from '../utils/dateUtils';

/** Marca gravada nas observações das contas que se repetem "sempre" (sem data para acabar). */
export const FOREVER_MARK = 'RECORRENTE SEMPRE';

const SERIES_SUFFIX = / - \d{4}-\d{2}$/;

const monthsAhead = (n: number): string => {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
};

/** Tira a marca "sempre" das contas de uma série (usado quando o usuário exclui "este mês e os próximos"). */
export function stopForeverSeries(titleIds: string[]) {
  if (titleIds.length === 0) return;
  const ids = new Set(titleIds);
  const all = storage.getTitles();
  let changed = false;
  const next = all.map(t => {
    if (ids.has(t.id) && t.notes && t.notes.includes(FOREVER_MARK)) {
      changed = true;
      return { ...t, notes: t.notes.replace(FOREVER_MARK, 'RECORRENTE') };
    }
    return t;
  });
  if (changed) storage.saveTitles(next);
}

/** Mantém sempre 12 a 24 meses à frente nas contas que se repetem "sempre". */
export function renewForeverRecurrences(): number {
  const titles = storage.getTitles();
  const groups = new Map<string, FinancialTitle[]>();
  titles.forEach(t => {
    if (!t.notes || !t.notes.includes(FOREVER_MARK)) return;
    const key = `${t.type}|${t.counterpartyId || ''}|${(t.titleNumber || '').replace(SERIES_SUFFIX, '')}`;
    const list = groups.get(key) || [];
    list.push(t);
    groups.set(key, list);
  });

  const threshold = monthsAhead(12);
  const target = monthsAhead(24);
  const created: FinancialTitle[] = [];
  const now = new Date().toISOString();

  groups.forEach((list, key) => {
    const last = [...list].sort((a, b) => a.competence.localeCompare(b.competence)).pop()!;
    if (last.competence >= threshold) return;
    const base = (last.titleNumber || '').replace(SERIES_SUFFIX, '');
    const lastDay = Number(String(last.dueDate || '').substring(8, 10)) || 10;
    let comp = last.competence;
    for (let guard = 0; guard < 36; guard++) {
      comp = advanceCompetence(comp, 1);
      if (comp > target) break;
      const [y, m] = comp.split('-').map(Number);
      const day = Math.min(lastDay, getDaysInMonth(y, m));
      const due = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      created.push({
        ...last,
        id: `tit-ren-${Date.now()}-${created.length}-${Math.floor(Math.random() * 1000)}`,
        titleNumber: `${base} - ${comp}`,
        description: (last.description || '').replace(/\[Recorrente \d{4}-\d{2}\]/, `[Recorrente ${comp}]`),
        competence: comp,
        issueDate: due,
        dueDate: due,
        expectedCashDate: due,
        originalAmount: last.originalAmount,
        settledPrincipal: 0,
        balancePrincipal: last.originalAmount,
        accruedInterest: 0,
        accruedFine: 0,
        documentState: 'CONFIRMADO',
        settlementState: 'ABERTO',
        createdAt: now,
        updatedAt: now
      });
    }
    void key;
  });

  if (created.length > 0) storage.saveTitles([...created, ...titles]);
  return created.length;
}

/** Contratos que se repetem todo mês: garante as faturas dos últimos meses e dos próximos 12. */
export function renewContractInvoices() {
  const back = monthsAhead(-3);
  storage.getContracts()
    .filter(c => c.status === 'ATIVO' && c.contractType !== 'AVULSO' && c.isRecurring !== false && !c.endDate && c.autoGenerateFutureMonths !== false)
    .forEach(c => {
      const startComp = String(c.startDate || '').substring(0, 7);
      const from = startComp && startComp > back ? startComp : back;
      FinancialEngine.generateContractFutureInstallments(c, 16, from);
    });
}
