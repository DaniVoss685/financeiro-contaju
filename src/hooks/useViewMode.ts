import { useEffect, useState } from 'react';
import { isConsultant } from '../services/authService';

/**
 * Duas versões do sistema:
 * - Contábil (consultoria/Contaju): todos os campos técnicos (competência, plano de contas, documento...).
 * - Simples (empresas clientes): só o que o dia a dia precisa, com palavras comuns.
 * Empresas clientes sempre veem a versão simples. Consultores escolhem (padrão: contábil).
 */
const KEY = 'contaju_view_mode';
const EVT = 'contaju-view-mode';

export function getIsSimpleMode(): boolean {
  if (!isConsultant()) return true;
  try {
    return localStorage.getItem(KEY) === 'simples';
  } catch {
    return false;
  }
}

/** Marca o <html> para o CSS esconder o que é técnico na versão simples. */
export function applyViewModeClass(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('simple-mode', getIsSimpleMode());
}

export function setViewMode(mode: 'simples' | 'contabil'): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // ignora
  }
  applyViewModeClass();
  window.dispatchEvent(new Event(EVT));
}

export function useIsSimpleMode(): boolean {
  const [simple, setSimple] = useState<boolean>(getIsSimpleMode);
  useEffect(() => {
    applyViewModeClass();
    const on = () => setSimple(getIsSimpleMode());
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return simple;
}
