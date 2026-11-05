import { storage } from './storageService';
import type { NavigationScreen } from '../components/Sidebar';

export type NotificationGroupId = 'DESPESAS' | 'RECEBIMENTOS' | 'CONTRATOS' | 'CONCILIACAO';

export interface NotificationItem {
  id: string;
  title: string;
  detail: string;
  amount?: number;
  tone: 'danger' | 'gold' | 'info';
  screen: NavigationScreen;
}

export interface NotificationGroup {
  id: NotificationGroupId;
  label: string;
  description: string;
  items: NotificationItem[];
}

const ymdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);

const br = (d: string) => d.split('-').reverse().join('/');

/** Reúne tudo o que pede atenção, separado por tipo (despesas, recebimentos, contratos, conciliação). */
export function collectNotifications(): NotificationGroup[] {
  const today = ymdLocal(new Date());
  const names = new Map(storage.getCounterparties().map(c => [c.id, c.name]));
  const titles = storage.getTitles().filter(t => t && t.documentState !== 'CANCELADO' && (Number(t.balancePrincipal) || 0) > 0);

  const toItem = (t: any, kind: 'PAGAR' | 'RECEBER'): NotificationItem => {
    const due = String(t.dueDate || '');
    const late = due < today ? daysBetween(due, today) : 0;
    const who = names.get(t.counterpartyId) || (kind === 'PAGAR' ? 'Fornecedor' : 'Cliente');
    return {
      id: t.id,
      title: t.description ? `${who} — ${t.description}` : who,
      detail: late > 0 ? `Venceu em ${br(due)} (${late} ${late === 1 ? 'dia' : 'dias'} de atraso)` : due === today ? 'Vence hoje' : `Vence em ${br(due)}`,
      amount: Number(t.balancePrincipal) || 0,
      tone: late > 0 ? 'danger' : 'gold',
      screen: kind === 'PAGAR' ? 'CONTAS_PAGAR' : 'CONTAS_RECEBER'
    };
  };

  const pagar = titles
    .filter(t => t.type === 'PAGAR' && String(t.dueDate || '') <= today)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .map(t => toItem(t, 'PAGAR'));

  const receber = titles
    .filter(t => t.type === 'RECEBER' && String(t.dueDate || '') < today)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .map(t => toItem(t, 'RECEBER'));

  const limit = ymdLocal(new Date(Date.now() + 30 * 86400000));
  const contratos = storage
    .getContracts()
    .filter(c => c.status === 'ATIVO' && c.endDate && c.endDate >= today && c.endDate <= limit)
    .map(c => ({
      id: c.id,
      title: names.get(c.customerId) || 'Cliente',
      detail: `O contrato termina em ${br(c.endDate as string)}`,
      amount: Number(c.monthlyTotal) || 0,
      tone: 'info' as const,
      screen: 'CONTRATOS' as NavigationScreen
    }));

  const pendentes = storage
    .getStatementEntries()
    .filter(s => s.reconciliationStatus === 'PENDENTE' || s.reconciliationStatus === 'SUGESTAO');
  const conciliacao: NotificationItem[] = pendentes.length
    ? [
        {
          id: 'conciliacao',
          title: `${pendentes.length} ${pendentes.length === 1 ? 'lançamento do extrato' : 'lançamentos do extrato'} sem conferência`,
          detail: 'Confira o extrato do banco com os lançamentos do sistema',
          tone: 'gold',
          screen: 'CONCILIACAO'
        }
      ]
    : [];

  return [
    { id: 'DESPESAS', label: 'Despesas', description: 'Contas a pagar vencidas ou que vencem hoje', items: pagar },
    { id: 'RECEBIMENTOS', label: 'Recebimentos', description: 'Clientes com pagamento em atraso', items: receber },
    { id: 'CONTRATOS', label: 'Contratos', description: 'Contratos que terminam nos próximos 30 dias', items: contratos },
    { id: 'CONCILIACAO', label: 'Conciliação', description: 'Extrato do banco aguardando conferência', items: conciliacao }
  ];
}

export function countNotifications(groups: NotificationGroup[] = collectNotifications()): number {
  return groups.reduce((acc, g) => acc + g.items.length, 0);
}
