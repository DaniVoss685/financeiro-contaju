import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { FloatingPanel } from '../Common/FloatingPanel';

type Catalogo = typeof import('../../data/nfseCatalogo');
let cache: Promise<Catalogo> | null = null;
/** Carrega a lista oficial só quando alguém abre uma janela de nota (arquivo grande). */
export const carregarCatalogo = (): Promise<Catalogo> => (cache ??= import('../../data/nfseCatalogo'));

export const pontuarServico = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}`;
export const pontuarNbs = (c: string) => `${c.slice(0, 1)}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7, 9)}`;

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Descrição de um código (ou vazio se não estiver na lista). */
export function useDescricoes() {
  const [cat, setCat] = useState<Catalogo | null>(null);
  useEffect(() => {
    let vivo = true;
    carregarCatalogo().then(c => vivo && setCat(c)).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return useMemo(() => {
    const serv = new Map(cat?.SERVICOS_NACIONAIS || []);
    const nbs = new Map(cat?.NBS_FOLHAS || []);
    return { carregado: Boolean(cat), servico: (c: string) => serv.get(c) || '', nbs: (c: string) => nbs.get(c) || '' };
  }, [cat]);
}

interface Item { codigo: string; descricao: string; norm: string; pontuado: string }

/** Ranqueia: código que começa com o que foi digitado → código que contém → todas as palavras no nome. */
function filtrar(itens: Item[], consulta: string): Item[] {
  const q = semAcento(consulta.trim());
  if (!q) return itens.slice(0, 80);
  const digitos = q.replace(/\D/g, '');
  const palavras = q.split(/\s+/).filter(Boolean);
  const pontuados: { it: Item; nota: number }[] = [];
  for (const it of itens) {
    let nota = -1;
    if (digitos.length >= 2 && /^[\d.\s-]+$/.test(q)) {
      if (it.codigo.startsWith(digitos)) nota = 0;
      else if (it.codigo.includes(digitos)) nota = 1;
    } else if (palavras.every(p => it.norm.includes(p))) {
      const pos = it.norm.indexOf(palavras[0]);
      nota = 2 + Math.min(pos, 200) / 1000;
    }
    if (nota >= 0) pontuados.push({ it, nota });
  }
  return pontuados.sort((a, b) => a.nota - b.nota).slice(0, 80).map(p => p.it);
}

/**
 * Escolha do código de serviço (lista nacional) ou do NBS, com busca por nome ou número,
 * como no Portal Nacional.
 */
export const NfseCatalogoSelect: React.FC<{
  tipo: 'SERVICO' | 'NBS';
  value: string;
  onChange: (codigo: string) => void;
  disabled?: boolean;
}> = ({ tipo, value, onChange, disabled }) => {
  const [cat, setCat] = useState<Catalogo | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [destaque, setDestaque] = useState(0);
  const ancora = useRef<HTMLDivElement>(null);
  const busca = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    carregarCatalogo().then(c => vivo && setCat(c)).catch(() => vivo && setFalhou(true));
    return () => { vivo = false; };
  }, []);

  const itens: Item[] = useMemo(() => {
    if (!cat) return [];
    const fonte = tipo === 'SERVICO' ? cat.SERVICOS_NACIONAIS : cat.NBS_FOLHAS;
    return fonte.map(([codigo, descricao]) => ({
      codigo,
      descricao,
      norm: semAcento(descricao),
      pontuado: tipo === 'SERVICO' ? pontuarServico(codigo) : pontuarNbs(codigo)
    }));
  }, [cat, tipo]);

  const resultados = useMemo(() => filtrar(itens, consulta), [itens, consulta]);
  const escolhido = itens.find(i => i.codigo === value);
  const placeholder = cat ? (tipo === 'SERVICO' ? 'Buscar serviço por nome ou código' : 'Buscar NBS por nome ou código') : 'Carregando lista oficial';

  useEffect(() => {
    if (aberto) {
      setConsulta('');
      setDestaque(0);
      setTimeout(() => busca.current?.focus(), 30);
    }
  }, [aberto]);
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-index="${destaque}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [destaque]);

  const escolher = (codigo: string) => {
    onChange(codigo);
    setAberto(false);
  };

  if (falhou) {
    return <p className="text-sm text-[var(--status-danger)]">Não foi possível carregar a lista de códigos. Recarregue a página.</p>;
  }

  const bloqueado = disabled || !cat;
  return (
    <div ref={ancora} className="relative">
      <div
        role="combobox"
        aria-expanded={aberto}
        aria-label={tipo === 'SERVICO' ? 'Serviço prestado' : 'Código NBS'}
        tabIndex={bloqueado ? -1 : 0}
        onClick={() => !bloqueado && setAberto(o => !o)}
        onKeyDown={e => {
          if (!bloqueado && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setAberto(true);
          }
        }}
        className={`w-full min-h-[46px] rounded-xl border px-3.5 py-2 text-sm select-none flex items-center justify-between gap-2 transition-colors ${
          bloqueado
            ? 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border-subtle)] cursor-not-allowed opacity-60'
            : aberto
            ? 'border-[var(--brand-gold-fill)] ring-[3px] ring-[var(--ring-focus)] bg-[var(--surface-input)] text-[var(--text-primary)] cursor-pointer'
            : 'border-[var(--border-highlight)] hover:border-[var(--border-strong)] bg-[var(--surface-input)] text-[var(--text-primary)] cursor-pointer'
        }`}
      >
        <div className="flex-1 min-w-0">
          {value ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate text-[var(--text-primary)]">{escolhido ? escolhido.descricao : `Código ${value} (fora da lista oficial atual)`}</span>
              {escolhido && <span className="text-xs px-1.5 py-0.5 rounded-md bg-[var(--surface-elevated)] text-[var(--text-secondary)] shrink-0">{escolhido.pontuado}</span>}
            </div>
          ) : (
            <span className="text-[var(--text-tertiary)]">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 text-[var(--text-muted)]">
          {value && !bloqueado && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] cursor-pointer"
              title="Limpar seleção"
              aria-label="Limpar seleção"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <FloatingPanel anchorRef={ancora} open={aberto} onClose={() => setAberto(false)} minWidth={380} maxHeight={440} sheetTitle={placeholder}>
        <div>
          <div className="p-2 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--surface-card)] z-10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                ref={busca}
                type="text"
                value={consulta}
                onChange={e => { setConsulta(e.target.value); setDestaque(0); }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setDestaque(h => Math.min(resultados.length - 1, h + 1)); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setDestaque(h => Math.max(0, h - 1)); }
                  else if (e.key === 'Enter') { e.preventDefault(); if (resultados[destaque]) escolher(resultados[destaque].codigo); }
                  else if (e.key === 'Escape') setAberto(false);
                }}
                placeholder={tipo === 'SERVICO' ? 'Nome ou código. Ex.: contabilidade, 171901' : 'Nome ou código. Ex.: contabilidade, 113022100'}
                className="w-full h-10 pl-9 pr-3 text-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)]"
              />
            </div>
          </div>
          <div ref={lista} className="p-1.5 max-h-[340px] overflow-y-auto" role="listbox">
            {resultados.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">Nada encontrado para &quot;{consulta}&quot;</div>
            ) : (
              resultados.map((it, idx) => (
                <button
                  key={it.codigo}
                  type="button"
                  role="option"
                  aria-selected={it.codigo === value}
                  data-index={idx}
                  onMouseEnter={() => setDestaque(idx)}
                  onClick={() => escolher(it.codigo)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start justify-between gap-3 cursor-pointer transition-colors ${idx === destaque ? 'bg-[var(--surface-hover)]' : ''}`}
                >
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm leading-snug ${it.codigo === value ? 'font-medium' : ''} text-[var(--text-primary)]`}>{it.descricao}</span>
                    <span className="block text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">{it.pontuado} • {it.codigo}</span>
                  </span>
                  {it.codigo === value && <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--brand-gold)]" />}
                </button>
              ))
            )}
            {resultados.length === 80 && <p className="px-3 py-2 text-xs text-[var(--text-muted)] text-center">Mostrando os 80 primeiros. Digite mais para refinar.</p>}
          </div>
        </div>
      </FloatingPanel>
    </div>
  );
};
