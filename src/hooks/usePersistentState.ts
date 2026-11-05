import { useCallback, useState } from 'react';

/**
 * Estado que sobrevive à troca de aba: os filtros escolhidos continuam quando a pessoa
 * volta à tela. Só somem quando ela limpa os filtros (ou fecha o navegador).
 */
export const PERSISTENT_PREFIX = 'contaju_filter_';

export function usePersistentState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = PERSISTENT_PREFIX + key;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      // sem armazenamento: usa o valor inicial
    }
    return initial;
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue(prev => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(resolved));
        } catch {
          // ignora
        }
        return resolved;
      });
    },
    [storageKey]
  );

  return [value, set];
}
