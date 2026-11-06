import React, { useMemo, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { storage } from '../../services/storageService';
import { FinancialEngine, formatBRL } from '../../services/financialEngine';
import { MoneyField } from '../Common/MoneyField';
import { MonthField } from '../Common/DateField';
import { TabPills } from '../Common/ui';
import { formatCompetenceShort } from '../../utils/dateUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const field = 'w-full h-11 px-3.5 rounded-xl border border-[var(--border-highlight)] text-sm';

/** "E se...?": mostra como fica o caixa nos próximos 12 meses com uma receita ou despesa nova. */
export const ScenarioSimulatorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [kind, setKind] = useState<'RECEITA' | 'DESPESA'>('RECEITA');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState(0);
  const [start, setStart] = useState(thisMonth);
  const [months, setMonths] = useState<number>(0); // 0 = sem fim

  const rows = useMemo(() => {
    if (!isOpen) return [];
    let balance = 0;
    try {
      balance = FinancialEngine.getConsolidatedCashBalance();
    } catch {
      balance = 0;
    }
    const open = storage.getTitles().filter(t => t && t.documentState !== 'CANCELADO' && (Number(t.balancePrincipal) || 0) > 0);
    const list: { month: string; entra: number; sai: number; extra: number; semSim: number; comSim: number }[] = [];
    let sem = balance;
    let com = balance;
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      // contas atrasadas entram no primeiro mês
      const inMonth = (t: any) => (i === 0 ? String(t.dueDate || '').substring(0, 7) <= ym : String(t.dueDate || '').substring(0, 7) === ym);
      const entra = open.filter(t => t.type === 'RECEBER' && inMonth(t)).reduce((a, t) => a + (Number(t.balancePrincipal) || 0), 0);
      const sai = open.filter(t => t.type === 'PAGAR' && inMonth(t)).reduce((a, t) => a + (Number(t.balancePrincipal) || 0), 0);
      const active = ym >= start && (months === 0 || ym < addMonths(start, months));
      const extra = active ? (kind === 'RECEITA' ? amount : -amount) : 0;
      sem += entra - sai;
      com += entra - sai + extra;
      list.push({ month: ym, entra, sai, extra, semSim: sem, comSim: com });
    }
    return list;
  }, [isOpen, kind, amount, start, months]);

  if (!isOpen) return null;
  const last = rows[rows.length - 1];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs" onClick={onClose}>
      <div className="w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-[var(--border-subtle)] shrink-0">
          <div className="flex items-center gap-3">
            <span className="icon-tile-gold w-10 h-10 rounded-xl [&>svg]:w-5 [&>svg]:h-5"><Sparkles /></span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Simular o caixa</h2>
              <p className="text-sm text-[var(--text-muted)]">Veja como ficam os próximos 12 meses se entrar uma receita ou uma despesa nova.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          <TabPills
            tabs={[{ id: 'RECEITA', label: 'Entra uma receita' }, { id: 'DESPESA', label: 'Entra uma despesa' }]}
            value={kind}
            onChange={id => setKind(id as any)}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm text-[var(--text-secondary)] mb-1.5">{kind === 'RECEITA' ? 'Cliente ou descrição' : 'Descrição'} (opcional)</label>
              <input value={label} onChange={e => setLabel(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Valor por mês (R$)</label>
              <MoneyField value={amount} onChange={setAmount} className={field} />
            </div>
            <div>
              <label className="block text-sm text-[var(--text-secondary)] mb-1.5">A partir de</label>
              <MonthField value={start} onChange={e => setStart(e.target.value)} className={field} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Por quanto tempo</label>
              <TabPills
                tabs={[{ id: '0', label: 'Todo mês, sem fim' }, { id: '3', label: '3 meses' }, { id: '6', label: '6 meses' }, { id: '12', label: '12 meses' }]}
                value={String(months)}
                onChange={id => setMonths(Number(id))}
              />
            </div>
          </div>

          {last && (
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-5 py-4">
                <p className="text-sm text-[var(--text-secondary)]">Caixa em 12 meses, sem simular</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatBRL(last.semSim)}</p>
              </div>
              <div className="rounded-2xl border border-[var(--gold-edge)] bg-[var(--brand-gold-soft)] px-5 py-4">
                <p className="text-sm text-[var(--brand-gold)]">Caixa em 12 meses, com {label.trim() || 'a simulação'}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{formatBRL(last.comSim)}</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-elevated)] text-[var(--text-secondary)]">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Mês</th>
                  <th className="text-right font-medium px-4 py-2.5">Entra</th>
                  <th className="text-right font-medium px-4 py-2.5">Sai</th>
                  <th className="text-right font-medium px-4 py-2.5">Caixa sem simular</th>
                  <th className="text-right font-medium px-4 py-2.5">Caixa simulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {rows.map(r => (
                  <tr key={r.month}>
                    <td className="px-4 py-2.5 tabular-nums">{formatCompetenceShort(r.month)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--status-success)]">{formatBRL(r.entra + Math.max(0, r.extra))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-[var(--status-danger)]">{formatBRL(r.sai + Math.max(0, -r.extra))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatBRL(r.semSim)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatBRL(r.comSim)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Considera o saldo de hoje e as contas em aberto. É só uma simulação: nada é lançado.</p>
        </div>
      </div>
    </div>
  );
};

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
