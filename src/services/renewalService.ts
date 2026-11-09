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

/**
 * Garante que todo contrato que se repete todo mês tenha uma cobrança VENCENDO em cada mês
 * (do mês atual até 12 meses à frente). Quem manda é a data de vencimento, não a competência.
 */
export function renewContractDueMonths(): number {
  const titles = storage.getTitles();
  const created: FinancialTitle[] = [];
  const now = new Date().toISOString();
  const nowYm = monthsAhead(0);

  storage.getContracts()
    .filter(c => c.status === 'ATIVO' && c.contractType !== 'AVULSO' && c.isRecurring !== false && !c.endDate && c.autoGenerateFutureMonths !== false)
    .forEach(c => {
      const mine = titles.filter(t =>
        t.type === 'RECEBER' && t.originType === 'CONTRATO' && t.documentState !== 'CANCELADO' &&
        (t.originId === c.id || t.contractId === c.id || t.contractNumber === c.contractNumber)
      );
      if (mine.length === 0) return;
      const dueMonths = new Set(mine.map(t => String(t.dueDate || '').substring(0, 7)));
      const firstDue = [...dueMonths].sort()[0];
      const template = [...mine].sort((a, b) => a.competence.localeCompare(b.competence)).pop()!;
      const dueDay = c.dueDay || Number(String(template.dueDate || '').substring(8, 10)) || 10;
      const nextMonthRule = c.dueRule === 'NEXT_MONTH';

      for (let i = 0; i <= 12; i++) {
        const ym = monthsAhead(i);
        if (ym < nowYm || ym < firstDue || dueMonths.has(ym)) continue;
        const [y, m] = ym.split('-').map(Number);
        const due = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(dueDay, getDaysInMonth(y, m))).padStart(2, '0')}`;
        const comp = nextMonthRule ? advanceCompetence(ym, -1) : ym;
        const amount = c.monthlyTotal || template.originalAmount;
        created.push({
          ...template,
          id: `tit-due-${Date.now()}-${created.length}-${Math.floor(Math.random() * 1000)}`,
          titleNumber: `FAT-${comp}-${String(c.contractNumber || '').replace('CTR-', '').replace('CT-', '')}-V${ym.replace('-', '')}`,
          description: (template.description || '').replace(/Comp\.\s*\d{2}\/\d{4}/, `Comp. ${comp.substring(5)}/${comp.substring(0, 4)}`),
          competence: comp,
          issueDate: due,
          dueDate: due,
          expectedCashDate: due,
          originalAmount: amount,
          settledPrincipal: 0,
          balancePrincipal: amount,
          accruedInterest: 0,
          accruedFine: 0,
          documentState: 'CONFIRMADO',
          settlementState: 'ABERTO',
          saleId: undefined,
          saleNumber: undefined,
          createdAt: now,
          updatedAt: now
        });
      }
    });

  if (created.length > 0) storage.saveTitles([...created, ...titles]);
  return created.length;
}
