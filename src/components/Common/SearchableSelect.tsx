import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, Plus, X } from 'lucide-react';
import { matchesSearch, normalizeForSearch } from '../../utils/searchUtils';
import { FloatingPanel } from './FloatingPanel';

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  group?: string;
}

interface SearchableSelectProps {
  id?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allowQuickCreate?: boolean;
  quickCreateLabel?: (query: string) => string;
  onQuickCreate?: (query: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  dropdownClassName?: string;
  maxDropdownHeight?: string;
  size?: 'sm' | 'md' | 'lg';
}

/** Seletor com busca (clientes, contas, categorias). Lista flutuante premium, gaveta no celular. */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  options,
  value,
  onChange,
  placeholder = 'Selecione uma opção',
  searchPlaceholder = 'Buscar por código ou descrição',
  allowQuickCreate = false,
  quickCreateLabel,
  onQuickCreate,
  disabled = false,
  required = false,
  className = '',
  size = 'md'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      const idx = Math.max(0, options.findIndex(o => o.value === value));
      setHighlight(idx);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filteredOptions = options.filter(opt => {
    if (!searchQuery.trim()) return true;
    return matchesSearch([opt.label, opt.sublabel, opt.badge, opt.group], searchQuery);
  });

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, isOpen]);

  const exactMatchExists = options.some(opt => normalizeForSearch(opt.label) === normalizeForSearch(searchQuery));

  const close = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleSelect = (val: string) => {
    onChange(val);
    close();
    containerRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
  };

  const handleQuickCreateClick = () => {
    if (onQuickCreate && searchQuery.trim()) {
      onQuickCreate(searchQuery.trim());
      close();
    }
  };

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(filteredOptions.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[highlight]) handleSelect(filteredOptions[highlight].value);
    }
  };

  const heightClass = size === 'lg' ? 'min-h-[46px]' : size === 'sm' ? 'min-h-[36px]' : 'min-h-[42px]';

  return (
    <div id={id} ref={containerRef} className={`relative ${className}`}>
      {required && (
        <input
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={() => {}}
          required={required}
          className="absolute inset-0 opacity-0 pointer-events-none w-full h-full -z-10"
        />
      )}

      <div
        role="combobox"
        aria-expanded={isOpen}
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(o => !o)}
        onKeyDown={e => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        className={`w-full text-left rounded-xl border px-3.5 text-sm transition-colors select-none flex items-center justify-between gap-2 ${heightClass} ${
          disabled
            ? 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)] cursor-not-allowed opacity-60'
            : isOpen
            ? 'border-[var(--brand-gold-fill)] ring-[3px] ring-[var(--ring-focus)] bg-[var(--surface-input)] text-[var(--text-primary)] cursor-pointer'
            : 'border-[var(--border-highlight)] hover:border-[var(--border-strong)] bg-[var(--surface-input)] text-[var(--text-primary)] cursor-pointer'
        }`}
      >
        <div className="flex-1 min-w-0">
          {selectedOption ? (
            <div className="flex items-center gap-2">
              <span className="truncate text-[var(--text-primary)]">{selectedOption.label}</span>
              {selectedOption.badge && (
                <span className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--surface-elevated)] text-[var(--text-secondary)] shrink-0">{selectedOption.badge}</span>
              )}
              {selectedOption.sublabel && (
                <span className="text-xs text-[var(--text-muted)] truncate hidden md:inline">{selectedOption.sublabel}</span>
              )}
            </div>
          ) : (
            <span className="text-[var(--text-tertiary)]">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-[var(--text-muted)]">
          {value && !disabled && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                onChange('');
              }}
              className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              title="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <FloatingPanel anchorRef={containerRef} open={isOpen} onClose={close} minWidth={360} maxHeight={440} sheetTitle={placeholder}>
        <div>
          <div className="p-2 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--surface-card)] z-10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={onSearchKeyDown}
                placeholder={searchPlaceholder}
                className="w-full h-10 pl-9 pr-16 text-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] pointer-events-none">
                {filteredOptions.length}
              </span>
            </div>
          </div>

          <div ref={listRef} className="p-1.5 max-h-[340px] overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const prevOpt = idx > 0 ? filteredOptions[idx - 1] : null;
                const showGroupHeader = opt.group && (!prevOpt || prevOpt.group !== opt.group);

                return (
                  <React.Fragment key={opt.value}>
                    {showGroupHeader && (
                      <p className="px-3 pt-3 pb-1 text-xs font-medium text-[var(--text-muted)]">{opt.group}</p>
                    )}
                    <button
                      type="button"
                      data-index={idx}
                      onMouseEnter={() => setHighlight(idx)}
                      onClick={() => handleSelect(opt.value)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                        idx === highlight ? 'bg-[var(--surface-hover)]' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm leading-snug ${isSelected ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
                          {opt.label}
                        </div>
                        {opt.sublabel && <div className="text-xs text-[var(--text-muted)] mt-0.5">{opt.sublabel}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {opt.badge && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--surface-elevated)] text-[var(--text-secondary)]">{opt.badge}</span>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-[var(--brand-gold)]" />}
                      </div>
                    </button>
                  </React.Fragment>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">Nada encontrado para &quot;{searchQuery}&quot;</div>
            )}

            {allowQuickCreate && searchQuery.trim() && !exactMatchExists && (
              <div className="pt-1.5 mt-1.5 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={handleQuickCreateClick}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[var(--brand-gold)] shrink-0" />
                  <span>{quickCreateLabel ? quickCreateLabel(searchQuery.trim()) : `Cadastrar "${searchQuery.trim()}"`}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
};
