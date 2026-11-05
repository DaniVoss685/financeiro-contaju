import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';

/**
 * Campos de data premium. Sempre mostram e aceitam DIA/MÊS/ANO (dd/mm/aaaa),
 * com calendário em português. Valor interno continua em ISO (aaaa-mm-dd), então
 * dá para trocar <input type="date"> por <DateField> sem mexer na lógica.
 * <MonthField> faz o mesmo para competência (mm/aaaa).
 */

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function isoToBR(iso: string | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function brToIso(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isoMonthToBR(iso: string | undefined): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : '';
}

function maskMonth(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 6);
  return d.length <= 2 ? d : `${d.slice(0, 2)}/${d.slice(2)}`;
}

function brToIsoMonth(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const mo = Number(m[1]);
  const y = Number(m[2]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12) return null;
  return `${m[2]}-${m[1]}`;
}

const CALENDAR_ICON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2385858f' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4.5' width='18' height='16' rx='3'/%3E%3Cpath d='M3 9.5h18M8 3v3M16 3v3'/%3E%3C/svg%3E")`;

type BaseProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'defaultValue'> & {
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  min?: string;
  max?: string;
};

function makeEvent(value: string, name?: string, id?: string, type = 'date') {
  const target = { value, name, id, type };
  return { target, currentTarget: target } as unknown as React.ChangeEvent<HTMLInputElement>;
}

const navBtn =
  'w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer';

/* ------------------------------------------------------------------ */
/* DateField (dia/mês/ano)                                             */
/* ------------------------------------------------------------------ */
export const DateField: React.FC<BaseProps> = ({
  value,
  defaultValue,
  onChange,
  min,
  max,
  className = '',
  style,
  disabled,
  name,
  id,
  placeholder = 'dd/mm/aaaa',
  onBlur,
  onFocus,
  ...rest
}) => {
  const isControlled = value !== undefined;
  const [innerValue, setInnerValue] = useState(defaultValue ?? '');
  const iso = isControlled ? value || '' : innerValue;

  const [text, setText] = useState(isoToBR(iso));
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const inputRef = useRef<HTMLInputElement>(null);

  const today = useMemo(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
  }, []);

  const initialView = () => {
    const m = iso.match(/^(\d{4})-(\d{2})/);
    return m ? { y: Number(m[1]), m: Number(m[2]) } : { y: today.y, m: today.m };
  };
  const [view, setView] = useState(initialView);

  // Mantém o texto em sincronia quando o valor muda por fora (ex.: "Hoje", limpar formulário)
  useEffect(() => {
    setText(isoToBR(iso));
  }, [iso]);

  const emit = useCallback((next: string) => {
    if (!isControlled) setInnerValue(next);
    onChange?.(makeEvent(next, name, id));
  }, [isControlled, onChange, name, id]);

  const outOfRange = (isoDay: string) => (min && isoDay < min) || (max && isoDay > max);

  const pick = (y: number, m: number, d: number) => {
    const next = `${y}-${pad(m)}-${pad(d)}`;
    if (outOfRange(next)) return;
    emit(next);
    setText(isoToBR(next));
    setOpen(false);
  };

  const openPanel = () => {
    if (disabled) return;
    setView(initialView());
    setMode('days');
    setOpen(true);
  };

  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDate(e.target.value);
    setText(masked);
    if (masked === '') {
      emit('');
      return;
    }
    const parsed = brToIso(masked);
    if (parsed && !outOfRange(parsed)) {
      emit(parsed);
      const m = parsed.match(/^(\d{4})-(\d{2})/);
      if (m) setView({ y: Number(m[1]), m: Number(m[2]) });
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = brToIso(text);
    if (!parsed || outOfRange(parsed)) setText(isoToBR(iso));
    setOpen(false);
    onBlur?.(e);
  };

  // Células do mês (semana começa no domingo)
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m - 1, 1).getDay();
    const total = daysInMonth(view.y, view.m);
    const prevTotal = daysInMonth(view.m === 1 ? view.y - 1 : view.y, view.m === 1 ? 12 : view.m - 1);
    const list: { y: number; m: number; d: number; outside: boolean }[] = [];
    for (let i = first - 1; i >= 0; i--) {
      list.push({ y: view.m === 1 ? view.y - 1 : view.y, m: view.m === 1 ? 12 : view.m - 1, d: prevTotal - i, outside: true });
    }
    for (let d = 1; d <= total; d++) list.push({ y: view.y, m: view.m, d, outside: false });
    let nd = 1;
    while (list.length % 7 !== 0 || list.length < 42) {
      list.push({ y: view.m === 12 ? view.y + 1 : view.y, m: view.m === 12 ? 1 : view.m + 1, d: nd++, outside: true });
    }
    return list;
  }, [view]);

  const stepMonth = (delta: number) => {
    setView(v => {
      const total = v.y * 12 + (v.m - 1) + delta;
      return { y: Math.floor(total / 12), m: (total % 12) + 1 };
    });
  };

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode={typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'none' : 'numeric'}
        autoComplete="off"
        name={name}
        id={id}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={10}
        onChange={handleText}
        onFocus={e => {
          openPanel();
          onFocus?.(e);
        }}
        onClick={openPanel}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' && !open) openPanel();
          if (e.key === 'Enter' && open) setOpen(false);
        }}
        style={{
          backgroundImage: CALENDAR_ICON,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1rem 1rem',
          ...style
        }}
        className={`${className} tabular-nums`}
      />

      <FloatingPanel anchorRef={inputRef} open={open} onClose={() => setOpen(false)} width={316} maxHeight={420} sheetTitle="Escolha a data">
        <div className="p-3" onMouseDown={e => e.preventDefault()}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" className={navBtn} onClick={() => (mode === 'days' ? stepMonth(-1) : setView(v => ({ ...v, y: v.y - 1 })))} aria-label="Anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMode(m => (m === 'days' ? 'months' : 'days'))}
              className="h-9 px-3 rounded-lg text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
            >
              {mode === 'days' ? `${MONTHS[view.m - 1]} de ${view.y}` : view.y}
            </button>
            <button type="button" className={navBtn} onClick={() => (mode === 'days' ? stepMonth(1) : setView(v => ({ ...v, y: v.y + 1 })))} aria-label="Próximo">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {mode === 'months' ? (
            <div className="grid grid-cols-3 gap-1.5 py-1">
              {MONTHS_SHORT.map((label, idx) => {
                const isCurrent = view.y === today.y && idx + 1 === today.m;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setView(v => ({ ...v, m: idx + 1 }));
                      setMode('days');
                    }}
                    className={`h-11 rounded-xl text-sm transition-colors cursor-pointer hover:bg-[var(--surface-hover)] ${
                      idx + 1 === view.m ? 'bg-[var(--surface-elevated)] font-semibold' : isCurrent ? 'text-[var(--brand-gold)] font-medium' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 mb-1">
                {WEEKDAYS.map((w, i) => (
                  <span key={i} className="h-8 flex items-center justify-center text-xs text-[var(--text-muted)]">{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((c, i) => {
                  const cellIso = `${c.y}-${pad(c.m)}-${pad(c.d)}`;
                  const isSel = cellIso === iso;
                  const isToday = c.y === today.y && c.m === today.m && c.d === today.d;
                  const blocked = Boolean(outOfRange(cellIso));
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={blocked}
                      onClick={() => pick(c.y, c.m, c.d)}
                      className={`h-10 sm:h-9 rounded-lg text-sm tabular-nums transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                        isSel
                          ? 'bg-[var(--brand-gold-fill)] text-[#18181b] font-semibold'
                          : `${c.outside ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'} hover:bg-[var(--surface-hover)] ${isToday ? 'ring-1 ring-inset ring-[var(--brand-gold-fill)]' : ''}`
                      }`}
                    >
                      {c.d}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => {
                emit('');
                setText('');
                setOpen(false);
              }}
              className="h-9 px-3 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => pick(today.y, today.m, today.d)}
              className="h-9 px-3 rounded-lg text-sm font-medium text-[var(--brand-gold)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
            >
              Hoje
            </button>
          </div>
        </div>
      </FloatingPanel>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* MonthField (competência: mm/aaaa)                                   */
/* ------------------------------------------------------------------ */
export const MonthField: React.FC<BaseProps> = ({
  value,
  defaultValue,
  onChange,
  min,
  max,
  className = '',
  style,
  disabled,
  name,
  id,
  placeholder = 'mm/aaaa',
  onBlur,
  onFocus,
  ...rest
}) => {
  const isControlled = value !== undefined;
  const [innerValue, setInnerValue] = useState(defaultValue ?? '');
  const iso = isControlled ? value || '' : innerValue;

  const [text, setText] = useState(isoMonthToBR(iso));
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;

  const baseYear = () => {
    const m = iso.match(/^(\d{4})/);
    return m ? Number(m[1]) : todayY;
  };
  const [year, setYear] = useState(baseYear);

  useEffect(() => {
    setText(isoMonthToBR(iso));
  }, [iso]);

  const outOfRange = (v: string) => (min && v < min.slice(0, 7)) || (max && v > max.slice(0, 7));

  const emit = (next: string) => {
    if (!isControlled) setInnerValue(next);
    onChange?.(makeEvent(next, name, id, 'month'));
  };

  const pick = (y: number, m: number) => {
    const next = `${y}-${pad(m)}`;
    if (outOfRange(next)) return;
    emit(next);
    setText(isoMonthToBR(next));
    setOpen(false);
  };

  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskMonth(e.target.value);
    setText(masked);
    if (masked === '') {
      emit('');
      return;
    }
    const parsed = brToIsoMonth(masked);
    if (parsed && !outOfRange(parsed)) {
      emit(parsed);
      setYear(Number(parsed.slice(0, 4)));
    }
  };

  return (
    <>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode={typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'none' : 'numeric'}
        autoComplete="off"
        name={name}
        id={id}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={7}
        onChange={handleText}
        onFocus={e => {
          if (!disabled) {
            setYear(baseYear());
            setOpen(true);
          }
          onFocus?.(e);
        }}
        onClick={() => {
          if (!disabled) {
            setYear(baseYear());
            setOpen(true);
          }
        }}
        onBlur={e => {
          const parsed = brToIsoMonth(text);
          if (!parsed || outOfRange(parsed)) setText(isoMonthToBR(iso));
          setOpen(false);
          onBlur?.(e);
        }}
        style={{
          backgroundImage: CALENDAR_ICON,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1rem 1rem',
          ...style
        }}
        className={`${className} tabular-nums`}
      />

      <FloatingPanel anchorRef={inputRef} open={open} onClose={() => setOpen(false)} width={280} maxHeight={340} sheetTitle="Escolha a competência">
        <div className="p-3" onMouseDown={e => e.preventDefault()}>
          <div className="flex items-center justify-between mb-2">
            <button type="button" className={navBtn} onClick={() => setYear(y => y - 1)} aria-label="Ano anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums">{year}</span>
            <button type="button" className={navBtn} onClick={() => setYear(y => y + 1)} aria-label="Próximo ano">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS_SHORT.map((label, idx) => {
              const v = `${year}-${pad(idx + 1)}`;
              const isSel = v === iso.slice(0, 7);
              const isCurrent = year === todayY && idx + 1 === todayM;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={Boolean(outOfRange(v))}
                  onClick={() => pick(year, idx + 1)}
                  className={`h-11 rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    isSel
                      ? 'bg-[var(--brand-gold-fill)] text-[#18181b] font-semibold'
                      : `hover:bg-[var(--surface-hover)] ${isCurrent ? 'text-[var(--brand-gold)] font-medium' : 'text-[var(--text-secondary)]'}`
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => {
                emit('');
                setText('');
                setOpen(false);
              }}
              className="h-9 px-3 rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => pick(todayY, todayM)}
              className="h-9 px-3 rounded-lg text-sm font-medium text-[var(--brand-gold)] hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
            >
              Mês atual
            </button>
          </div>
        </div>
      </FloatingPanel>
    </>
  );
};
