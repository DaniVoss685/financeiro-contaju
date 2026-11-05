import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { FloatingPanel } from './FloatingPanel';

/**
 * Substituto direto do <select> nativo: mesmo uso (<option>, <optgroup>, value, onChange
 * com e.target.value), mas com lista premium (busca em listas longas, teclado, e gaveta
 * no celular). Selects com `multiple` continuam nativos.
 */

interface ParsedOption {
  value: string;
  label: React.ReactNode;
  text: string;
  disabled: boolean;
  group?: string;
}

function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement(node)) return nodeText((node.props as any).children);
  return '';
}

function collectOptions(children: React.ReactNode, group: string | undefined, acc: ParsedOption[]): ParsedOption[] {
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<any>;
    if (el.type === React.Fragment) {
      collectOptions(el.props.children, group, acc);
    } else if (el.type === 'optgroup') {
      collectOptions(el.props.children, String(el.props.label ?? ''), acc);
    } else if (el.type === 'option') {
      const text = nodeText(el.props.children).trim();
      acc.push({
        value: el.props.value !== undefined ? String(el.props.value) : text,
        label: el.props.children,
        text,
        disabled: Boolean(el.props.disabled),
        group
      });
    }
  });
  return acc;
}

export type PremiumSelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  /** Texto do cabeçalho da gaveta no celular. */
  sheetTitle?: string;
};

export const PremiumSelect: React.FC<PremiumSelectProps> = (props) => {
  const {
    value,
    defaultValue,
    onChange,
    children,
    className = '',
    style,
    disabled,
    required,
    multiple,
    name,
    id,
    sheetTitle,
    ...rest
  } = props;

  const [innerValue, setInnerValue] = useState<string>(String(defaultValue ?? ''));
  const isControlled = value !== undefined;
  const current = isControlled ? String(Array.isArray(value) ? value[0] ?? '' : value ?? '') : innerValue;

  const options = useMemo(() => collectOptions(children, undefined, []), [children]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const searchable = options.length > 7;
  const selected = options.find(o => o.value === current);
  const emptyOption = options.find(o => o.value === '');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.text.toLowerCase().includes(q));
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const commit = useCallback((opt: ParsedOption) => {
    if (opt.disabled) return;
    if (!isControlled) setInnerValue(opt.value);
    if (opt.value !== current && onChange) {
      const target = { value: opt.value, name, id, type: 'select-one' };
      onChange({ target, currentTarget: target } as unknown as React.ChangeEvent<HTMLSelectElement>);
    }
    close();
    triggerRef.current?.focus();
  }, [isControlled, current, onChange, name, id, close]);

  // Abre já com o item atual destacado e foco na busca (listas longas)
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, visible.findIndex(o => o.value === current));
    setHighlight(idx);
    if (searchable) setTimeout(() => searchRef.current?.focus(), 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(visible.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[highlight]) commit(visible[highlight]);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  if (multiple) {
    return (
      <select value={value as any} defaultValue={defaultValue} onChange={onChange} className={className} style={style} disabled={disabled} required={required} multiple name={name} id={id} {...rest}>
        {children}
      </select>
    );
  }

  const { onBlur, onFocus, autoFocus, title, tabIndex } = rest as any;
  const dataProps: Record<string, unknown> = {};
  Object.keys(rest).forEach(k => {
    if (k.startsWith('data-') || k.startsWith('aria-')) dataProps[k] = (rest as any)[k];
  });

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        tabIndex={tabIndex}
        autoFocus={autoFocus}
        disabled={disabled}
        onBlur={onBlur}
        onFocus={onFocus}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        {...dataProps}
        style={{ ...style, paddingRight: 36 }}
        className={`${className} premium-select-trigger relative text-left cursor-pointer disabled:cursor-not-allowed`}
      >
        <span className={`block truncate ${selected && selected.value !== '' ? '' : 'text-[var(--text-tertiary)]'}`}>
          {selected ? (selected.text || ' ') : (emptyOption?.text || ' ')}
        </span>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={current}
          onChange={() => {}}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
      )}

      <FloatingPanel anchorRef={triggerRef} open={open} onClose={close} minWidth={240} sheetTitle={sheetTitle || 'Selecione uma opção'}>
        <div onKeyDown={onListKeyDown}>
          {searchable && (
            <div className="p-2 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--surface-card)] z-10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value);
                    setHighlight(0);
                  }}
                  placeholder="Buscar"
                  className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]"
                />
              </div>
            </div>
          )}

          <div ref={listRef} role="listbox" className="p-1.5 max-h-[300px] overflow-y-auto" tabIndex={-1}>
            {visible.length === 0 && (
              <p className="px-3 py-6 text-sm text-center text-[var(--text-muted)]">Nada encontrado</p>
            )}
            {visible.map((opt, idx) => {
              const showGroup = opt.group !== undefined && opt.group !== lastGroup;
              lastGroup = opt.group;
              const isSelected = opt.value === current;
              return (
                <React.Fragment key={`${opt.value}-${idx}`}>
                  {showGroup && opt.group && (
                    <p className="px-3 pt-3 pb-1 text-xs font-medium text-[var(--text-muted)]">{opt.group}</p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-index={idx}
                    disabled={opt.disabled}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => commit(opt)}
                    className={`w-full min-h-[40px] px-3 py-2 flex items-center gap-3 rounded-lg text-sm text-left transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      idx === highlight ? 'bg-[var(--surface-hover)]' : ''
                    } ${isSelected ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}
                  >
                    <span className="flex-1 min-w-0 break-words">{opt.label || ' '}</span>
                    {isSelected && <Check className="w-4 h-4 shrink-0 text-[var(--brand-gold)]" />}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </FloatingPanel>
    </>
  );
};
