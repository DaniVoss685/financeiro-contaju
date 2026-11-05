import type { CreditCardInstallment } from '../types';
import { getDaysInMonth } from './dateUtils';

interface CardDays {
  closingDay: number;
  dueDay: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const br = (d: string) => d.split('-').reverse().join('/');

/** Mês da fatura em que a compra cai: depois do dia de fechamento, vai para o mês seguinte. */
function firstInvoice(card: CardDays, purchaseDate: string): { year: number; month: number; pastClosing: boolean } {
  const d = new Date(purchaseDate + 'T12:00:00');
  let month = d.getMonth() + 1;
  let year = d.getFullYear();
  const pastClosing = d.getDate() >= card.closingDay;
  if (pastClosing) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { year, month, pastClosing };
}

function invoiceDates(card: CardDays, year: number, month: number) {
  const closeDay = Math.min(card.closingDay, getDaysInMonth(year, month));
  const closeDate = `${year}-${pad(month)}-${pad(closeDay)}`;
  let dueYear = year;
  let dueMonth = month;
  if (card.dueDay <= card.closingDay) {
    dueMonth += 1;
    if (dueMonth > 12) {
      dueMonth = 1;
      dueYear += 1;
    }
  }
  const dueDay = Math.min(card.dueDay, getDaysInMonth(dueYear, dueMonth));
  return { closeDate, dueDate: `${dueYear}-${pad(dueMonth)}-${pad(dueDay)}` };
}

/** Explica em português em qual fatura a compra vai entrar. */
export function describeCardInvoice(card: CardDays, purchaseDate: string) {
  const { year, month, pastClosing } = firstInvoice(card, purchaseDate);
  const { closeDate, dueDate } = invoiceDates(card, year, month);
  const invoiceMonth = `${year}-${pad(month)}`;
  return {
    invoiceMonth,
    closeDate,
    dueDate,
    pastClosing,
    message: pastClosing
      ? `A fatura fecha dia ${card.closingDay} e essa data já passou. A compra vai para a fatura de ${pad(month)}/${year}, que fecha em ${br(closeDate)} e vence em ${br(dueDate)}.`
      : `A compra entra na fatura de ${pad(month)}/${year}, que fecha em ${br(closeDate)} e vence em ${br(dueDate)}.`
  };
}

/** Parcelas mensais nas faturas certas (a última ajusta os centavos). */
export function buildCardInstallments(card: CardDays, purchaseDate: string, total: number, count: number): CreditCardInstallment[] {
  const n = Math.max(1, count);
  const { year, month } = firstInvoice(card, purchaseDate);
  const each = Math.round((total / n) * 100) / 100;
  let remaining = Math.round(total * 100) / 100;
  const result: CreditCardInstallment[] = [];

  for (let i = 1; i <= n; i++) {
    let y = year;
    let m = month + (i - 1);
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    const invoiceMonth = `${y}-${pad(m)}`;
    const { dueDate } = invoiceDates(card, y, m);
    const amount = i === n ? Math.round(remaining * 100) / 100 : each;
    remaining = Math.round((remaining - each) * 100) / 100;
    result.push({
      installmentNumber: i,
      totalInstallments: n,
      amount,
      competence: invoiceMonth,
      invoiceMonth,
      dueDate,
      settled: false
    });
  }
  return result;
}
