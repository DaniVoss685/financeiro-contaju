import React, { useMemo, useState } from 'react';
import { Plus, Pencil, EyeOff, Check, X } from 'lucide-react';
import { storage } from '../../services/storageService';
import { getFilteredChartAccounts } from '../../services/financialEngine';
import { QuickCreateAccountModal } from '../Modals/QuickCreateAccountModal';
import { Card, Button } from '../Common/ui';
import type { ChartAccount } from '../../types';

/**
 * Categorias de receita e de despesa da empresa, em linguagem simples.
 * O plano de contas (códigos, DRE) continua por trás, mas quem lança só vê a categoria.
 */
export const CategoriesView: React.FC = () => {
  const [tick, setTick] = useState(0);
  const [creating, setCreating] = useState<'RECEBER' | 'PAGAR' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const accounts = useMemo(() => storage.getChartAccounts(), [tick]);
  const receitas = useMemo(() => getFilteredChartAccounts(accounts, 'RECEBER').filter(a => !a.id.startsWith('acc-8.')), [accounts]);
  const despesas = useMemo(() => getFilteredChartAccounts(accounts, 'PAGAR').filter(a => !a.id.startsWith('acc-8.')), [accounts]);

  const save = (acc: ChartAccount, changes: Partial<ChartAccount>) => {
    storage.saveChartAccounts(storage.getChartAccounts().map(a => (a.id === acc.id ? { ...a, ...changes } : a)));
    setTick(t => t + 1);
  };

  const column = (title: string, list: ChartAccount[], type: 'RECEBER' | 'PAGAR') => (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h3>
          <p className="text-sm text-[var(--text-muted)]">{list.length} categorias</p>
        </div>
        <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setCreating(type)}>
          Nova categoria
        </Button>
      </div>
      <ul className="divide-y divide-[var(--border-subtle)] rounded-xl border border-[var(--border-subtle)]">
        {list.map(a => (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
            {editingId === a.id ? (
              <>
                <input
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  className="flex-1 h-9 px-3 text-sm rounded-lg border border-[var(--border-highlight)]"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Salvar nome"
                    onClick={() => {
                      if (draft.trim()) save(a, { name: draft.trim() });
                      setEditingId(null);
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--status-success)] hover:bg-[var(--surface-hover)] cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancelar"
                    onClick={() => setEditingId(null)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-sm text-[var(--text-primary)] truncate">{a.name}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="Mudar o nome"
                    onClick={() => {
                      setEditingId(a.id);
                      setDraft(a.name);
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Esconder esta categoria dos lançamentos"
                    onClick={() => save(a, { isActive: false })}
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--surface-hover)] cursor-pointer"
                  >
                    <EyeOff className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">Nenhuma categoria ainda.</li>}
      </ul>
    </Card>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
        Estas são as categorias que aparecem quando você lança uma receita ou uma despesa. Crie as da sua empresa, mude o nome ou esconda as que você não usa.
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        {column('Categorias de receita', receitas, 'RECEBER')}
        {column('Categorias de despesa', despesas, 'PAGAR')}
      </div>
      {creating && (
        <QuickCreateAccountModal
          isOpen
          titleType={creating}
          onClose={() => setCreating(null)}
          onAccountCreated={() => {
            setCreating(null);
            setTick(t => t + 1);
          }}
        />
      )}
    </div>
  );
};
