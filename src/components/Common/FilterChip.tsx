import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';
import { MoneyField } from './MoneyField';

/** Botão de filtro que abre um painel suspenso (economiza espaço na tela). */
interface FilterChipProps {
  label: string;
  /** Texto do valor escolhido. Vazio = filtro desligado. */
  valueLabel?: string;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}

export const FilterChip: React.FC<FilterChipProps> = ({ label, valueLabel, width = 280, children }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const active = Boolean(valueLabel);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`h-10 px-3.5 inline-flex items-center gap-2 rounded-xl border text-sm whitespace-nowrap transition-colors cursor-pointer ${
          active
            ? 'border-[var(--gold-edge)] bg-[var(--brand-gold-soft)] text-[var(--text-primary)]'
            : 'border-[var(--border-highlight)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
        }`}
      >
        <span className={active ? 'text-[var(--text-muted)]' : ''}>{label}</span>
        {active && <span className="font-semibold max-w-[160px] truncate">{valueLabel}</span>}
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      </button>
      <FloatingPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={width} sheetTitle={label}>
        {children(() => setOpen(false))}
      </FloatingPanel>
    </>
  );
};

interface Option {
  value: string;
  label: string;
  hint?: string;
}

/** Filtro de escolha única (com busca quando a lista é grande). */
export const FilterChipSelect: React.FC<{
  label: string;
  value: string;
  allValue?: string;
  allLabel: string;
  options: Option[];
  onChange: (value: string) => void;
  width?: number;
}> = ({ label, value, allValue = 'ALL', allLabel, options, onChange, width }) => {
  const [query, setQuery] = useState('');
  const current = value === allValue ? '' : options.find(o => o.value === value)?.label || value;
  const filtered = useMemo(
    () => (query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query]
  );
  const all: Option[] = [{ value: allValue, label: allLabel }, ...filtered];

  return (
    <FilterChip label={label} valueLabel={current} width={width}>
      {close => (
        <div className="p-2">
          {options.length > 8 && (
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-[var(--border-highlight)]"
              />
            </div>
          )}
          <ul className="max-h-72 overflow-y-auto">
            {all.map(o => {
              const selected = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setQuery('');
                      close();
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm text-left cursor-pointer transition-colors ${
                      selected ? 'bg-[var(--brand-gold-soft)] text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {selected && <Check className="w-4 h-4 text-[var(--brand-gold)] shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </FilterChip>
  );
};

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Filtro de valor: abre um painel para escolher "a partir de" e "até". */
export const FilterChipAmount: React.FC<{
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}> = ({ min, max, onChange }) => {
  const [a, setA] = useState(min);
  const [b, setB] = useState(max);
  const label = min > 0 && max > 0 ? `R$ ${fmt.format(min)} a ${fmt.format(max)}` : min > 0 ? `a partir de R$ ${fmt.format(min)}` : max > 0 ? `até R$ ${fmt.format(max)}` : '';

  return (
    <FilterChip label="Valor" valueLabel={label} width={320}>
      {close => (
        <div
          className="p-4 space-y-4"
          onFocusCapture={() => {
            setA(min);
            setB(max);
          }}
        >
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1.5">A partir de (R$)</label>
            <MoneyField value={a} onChange={setA} className="w-full h-10 px-3 text-sm rounded-xl border border-[var(--border-highlight)]" />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Até (R$)</label>
            <MoneyField value={b} onChange={setB} className="w-full h-10 px-3 text-sm rounded-xl border border-[var(--border-highlight)]" />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                onChange(0, 0);
                setA(0);
                setB(0);
                close();
              }}
              className="h-9 px-3 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(a, b);
                close();
              }}
              className="h-9 px-4 rounded-lg text-sm font-semibold btn-gold cursor-pointer"
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </FilterChip>
  );
};
