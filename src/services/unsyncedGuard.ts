/**
 * Proteção contra perda de dados que ainda não chegaram na nuvem.
 *
 * O que acontecia: a sessão do usuário vencia, o banco recusava as gravações (erro 401) e o sistema seguia mostrando
 * os dados só na memória do navegador. Ao entrar de novo, a nuvem (sem esses dados) substituía a cópia local.
 *
 * Agora:
 * 1) toda gravação recusada ou sem rede marca a empresa como "com dados não enviados";
 * 2) a sessão vencida aparece na tela (nada de falhar em silêncio);
 * 3) sair do sistema ou trocar de empresa guarda uma reserva desses dados (não é apagada);
 * 4) ao carregar da nuvem, o que existe só no aparelho é somado ao que veio e reenviado.
 */

// Tabelas da nuvem que carregam dados do usuário e o respectivo nome na cópia local
export const TABLE_TO_KEY: Record<string, string> = {
  contaju_sales: 'contaju_sales',
  contaju_counterparties: 'contaju_counterparties',
  contaju_contracts: 'contaju_contracts',
  contaju_services: 'contaju_services',
  contaju_financial_titles: 'contaju_titles',
  contaju_settlements: 'contaju_settlements',
  contaju_financial_movements: 'contaju_movements',
  contaju_bank_accounts: 'contaju_bank_accounts',
  contaju_credit_cards: 'contaju_credit_cards',
  contaju_card_purchases: 'contaju_card_purchases',
  contaju_statement_entries: 'contaju_statements'
};
export const SYNC_KEYS = Object.values(TABLE_TO_KEY);

const dirtyKey = (org: string) => `contaju_dirty_${org}`;
const stashKey = (org: string) => `contaju_unsynced_${org}`;
export const LAST_OK_KEY = 'contaju_last_sync_ok';

const activeOrg = (): string => {
  try { return localStorage.getItem('contaju_active_org') || 'local'; } catch { return 'local'; }
};
// Empresa a quem pertence a cópia que está no aparelho agora
const cacheOrg = (): string => {
  try { return localStorage.getItem('contaju_cache_org') || localStorage.getItem('contaju_active_org') || 'local'; } catch { return 'local'; }
};

// ------------------------------ estado para a tela ------------------------------
export interface SyncGuardStatus {
  unsynced: boolean; // há dados só neste aparelho
  sessionExpired: boolean; // o banco recusou a sessão
}
let sessionExpired = false;
let flushing = false;
let lastFlushErrors: string[] = [];
/** Motivo do último envio que não deu certo (para mostrar na tela). */
export function getLastFlushErrors(): string[] { return lastFlushErrors; }
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => { try { fn(); } catch { /* ignora */ } });

export function subscribeSyncGuard(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function getSyncGuardStatus(): SyncGuardStatus {
  return { unsynced: hasUnsynced(), sessionExpired };
}
export function setSessionExpired(v: boolean): void {
  if (sessionExpired === v) return;
  sessionExpired = v;
  emit();
}

/**
 * Um erro 401 sozinho não prova que o login caiu (pode ser uma resposta atrasada de antes do login).
 * Confere de verdade: só avisa se o aparelho realmente não tem mais sessão. Se tem, o aviso some.
 */
let sessionCheckTimer: ReturnType<typeof setTimeout> | null = null;
export function queueSessionCheck(): void {
  if (sessionCheckTimer) return;
  sessionCheckTimer = setTimeout(async () => {
    sessionCheckTimer = null;
    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const client = getSupabaseClient();
      if (!client) return;
      const { data, error } = await client.auth.getSession();
      if (!data.session && !error) setSessionExpired(true);
      else if (data.session) setSessionExpired(false);
    } catch { /* sem rede: não conclui nada */ }
  }, 2500);
}

// ------------------------------ marcação de pendências ------------------------------
export function markDirty(table: string): void {
  try {
    const org = activeOrg();
    const cur = JSON.parse(localStorage.getItem(dirtyKey(org)) || '{}');
    cur[table] = new Date().toISOString();
    localStorage.setItem(dirtyKey(org), JSON.stringify(cur));
    emit();
  } catch { /* sem armazenamento */ }
}

export function hasDirty(org: string = cacheOrg()): boolean {
  try {
    const cur = JSON.parse(localStorage.getItem(dirtyKey(org)) || '{}');
    return Object.keys(cur).length > 0;
  } catch { return false; }
}

export function hasStash(org: string = cacheOrg()): boolean {
  try { return !!localStorage.getItem(stashKey(org)); } catch { return false; }
}

export function hasUnsynced(): boolean {
  return hasDirty() || hasStash();
}

export function clearDirty(org: string = cacheOrg()): void {
  try { localStorage.removeItem(dirtyKey(org)); } catch { /* ignora */ }
  emit();
}

// ------------------------------ reserva antes de limpar o aparelho ------------------------------
const rowTime = (r: any): string => String(r?.updatedAt || r?.createdAt || r?.date || '');

/** União por id: a linha mais nova vence; linhas só de um dos lados entram. */
export function unionById(a: any[], b: any[]): any[] {
  const map = new Map<string, any>();
  for (const r of a || []) if (r && r.id != null) map.set(String(r.id), r);
  for (const r of b || []) {
    if (!r || r.id == null) continue;
    const cur = map.get(String(r.id));
    if (!cur || rowTime(r) > rowTime(cur)) map.set(String(r.id), r);
  }
  return Array.from(map.values());
}

/**
 * Guarda uma reserva do que está só neste aparelho. Chamada ANTES de apagar a cópia local (sair, trocar de empresa).
 * Se há marca de pendência, guarda tudo; senão guarda só o que for mais novo que o último envio completo.
 */
export function stashLocalBeforePurge(): void {
  try {
    const org = cacheOrg();
    const lastOk = localStorage.getItem(`${LAST_OK_KEY}_${org}`) || '';
    const dirty = hasDirty(org);
    const prev = JSON.parse(localStorage.getItem(stashKey(org)) || '{}') as Record<string, any[]>;
    let any = false;
    for (const key of SYNC_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let rows: any[] = [];
      try { rows = JSON.parse(raw); } catch { continue; }
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const keep = dirty ? rows : rows.filter(r => !lastOk || rowTime(r) > lastOk);
      if (keep.length === 0) continue;
      prev[key] = unionById(prev[key] || [], keep);
      any = true;
    }
    if (any) localStorage.setItem(stashKey(org), JSON.stringify(prev));
  } catch { /* a reserva é um extra: nunca impede sair */ }
}

export function readStash(org: string = cacheOrg()): Record<string, any[]> {
  try { return JSON.parse(localStorage.getItem(stashKey(org)) || '{}'); } catch { return {}; }
}
export function clearStash(org: string = cacheOrg()): void {
  try { localStorage.removeItem(stashKey(org)); } catch { /* ignora */ }
  emit();
}

// ------------------------------ o que já esteve na nuvem ------------------------------
// Lista de ids que vieram na última leitura completa de cada tabela. Serve para distinguir, entre os registros
// que só existem no aparelho, o que é novo (nunca esteve na nuvem: tem que subir) do que foi apagado em outro
// aparelho (esteve na nuvem e sumiu: não pode voltar).
const cloudIdsKey = (org: string) => `contaju_cloud_ids_${org}`;
export function readCloudIds(org: string = cacheOrg()): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(cloudIdsKey(org)) || '{}'); } catch { return {}; }
}
export function writeCloudIds(localKey: string, ids: string[], org: string = cacheOrg()): void {
  try {
    const cur = readCloudIds(org);
    cur[localKey] = ids;
    localStorage.setItem(cloudIdsKey(org), JSON.stringify(cur));
  } catch { /* sem espaço: segue com a regra antiga */ }
}

// Ids apagados (vêm da nuvem): nunca voltam da cópia deste aparelho
const deletedKey = (org: string) => `contaju_deleted_ids_${org}`;
export function readDeletedIds(org: string = cacheOrg()): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem(deletedKey(org)) || '{}'); } catch { return {}; }
}
export function writeDeletedIds(byKey: Record<string, string[]>, org: string = cacheOrg()): void {
  try { localStorage.setItem(deletedKey(org), JSON.stringify(byKey)); } catch { /* sem espaço */ }
}

export function markSyncedOk(): void {
  try { localStorage.setItem(`${LAST_OK_KEY}_${cacheOrg()}`, new Date().toISOString()); } catch { /* ignora */ }
}
export function lastSyncOk(): string {
  try { return localStorage.getItem(`${LAST_OK_KEY}_${cacheOrg()}`) || ''; } catch { return ''; }
}

// ------------------------------ reenvio ------------------------------
/** Tenta enviar tudo o que está só neste aparelho. Devolve true quando a nuvem ficou em dia. */
export async function flushUnsynced(): Promise<boolean> {
  if (flushing) return false;
  flushing = true;
  try {
    const { getSupabaseClient } = await import('./supabaseClient');
    const client = getSupabaseClient();
    if (!client) return false;
    const { data } = await client.auth.getSession();
    if (!data.session) { setSessionExpired(true); return false; }
    // Antes de enviar, o aparelho precisa ter somado a cópia dele com a nuvem nesta abertura
    // (senão uma cópia velha regravaria por cima). A leitura, ao terminar, chama este envio de novo.
    const { storage } = await import('./storageService');
    if (!storage.isHydratedFromCloud()) { void storage.ensureCloudSync(); return false; }
    // (getSession já renova sozinho quando o acesso venceu; não chamamos a renovação à mão para não disputar com ela)
    const { supabaseSync } = await import('./supabaseSyncService');
    let res = await supabaseSync.syncAllToSupabase();
    // Banco recusou o acesso (401) mesmo com sessão guardada: renova o acesso uma vez e tenta de novo
    if (!res.success && sessionExpired) {
      try {
        const r = await client.auth.refreshSession();
        if (r.data?.session) { setSessionExpired(false); res = await supabaseSync.syncAllToSupabase(); }
      } catch { /* segue com o resultado anterior */ }
    }
    // Cadastros de apoio (empresa, usuários, plano de contas, regras, auditoria) não são lançamentos do cliente:
    // se só eles recusarem, os lançamentos já estão na nuvem e o aviso não deve ficar preso.
    const SUPPORT = /^(Empresas|Usuários|Plano de Contas|Regras de Conciliação|Logs de Auditoria|Planos Orçamentários|Fechamentos de Período|Fechamentos de Saldo|Contagens do caixa):/;
    lastFlushErrors = res.errors || [];
    const onlySupportFailed = !res.success && lastFlushErrors.length > 0 && lastFlushErrors.every(e => SUPPORT.test(e));
    if (res.success || onlySupportFailed) {
      setSessionExpired(false);
      clearDirty();
      clearStash();
      markSyncedOk();
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    flushing = false;
  }
}

/** Vigia a sessão: se o banco deixou de aceitar o login, avisa na tela e tenta reenviar assim que voltar. */
let watching = false;
export function startSyncWatch(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const check = async () => {
    try {
      const { getSupabaseClient } = await import('./supabaseClient');
      const client = getSupabaseClient();
      if (!client) return;
      const { data } = await client.auth.getSession();
      if (!data.session) {
        setSessionExpired(true);
        return;
      }
      // sessão ok: se havia aviso, some; se a nuvem ainda não foi lida nesta abertura, lê de novo; se há pendência, reenvia
      setSessionExpired(false);
      const { storage } = await import('./storageService');
      if (!storage.isHydratedFromCloud()) { void storage.ensureCloudSync(); return; }
      if (hasUnsynced()) void flushUnsynced();
    } catch { /* sem rede: tenta de novo no próximo ciclo */ }
  };
  const tick = () => { if (document.visibilityState === 'visible') void check(); };
  window.setInterval(tick, 45000);
  // Se algo não subiu, tenta de novo a cada 10 segundos (não espera o próximo ciclo)
  window.setInterval(() => { if (document.visibilityState === 'visible' && hasUnsynced()) void check(); }, 10000);
  window.addEventListener('online', () => void check());
  document.addEventListener('visibilitychange', tick);
  window.setTimeout(() => void check(), 4000);
}
