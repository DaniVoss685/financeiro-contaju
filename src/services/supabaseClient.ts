import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { markDirty, queueSessionCheck, TABLE_TO_KEY } from './unsyncedGuard';

const STORAGE_KEYS = {
  SUPABASE_URL: 'contaju_supabase_url',
  SUPABASE_ANON_KEY: 'contaju_supabase_anon_key',
  SUPABASE_AUTO_SYNC: 'contaju_supabase_auto_sync'
};

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  source: 'env' | 'localStorage' | 'none';
  autoSync: boolean;
}

let cachedClient: SupabaseClient | null = null;
let cachedClientKey = '';

export function getSupabaseConfig(): SupabaseConfig {
  const envUrl = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
    (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : undefined)
  )?.trim();
  const envKey = (
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
    (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : undefined)
  )?.trim();

  const localUrl = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) : null)?.trim();
  const localKey = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SUPABASE_ANON_KEY) : null)?.trim();
  const autoSyncSaved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEYS.SUPABASE_AUTO_SYNC) : null;
  const autoSync = autoSyncSaved !== null ? autoSyncSaved === 'true' : true;

  if (envUrl && envKey) {
    return {
      url: envUrl,
      anonKey: envKey,
      source: 'env',
      autoSync
    };
  }

  if (localUrl && localKey) {
    return {
      url: localUrl,
      anonKey: localKey,
      source: 'localStorage',
      autoSync
    };
  }

  return {
    url: localUrl || envUrl || '',
    anonKey: localKey || envKey || '',
    source: 'none',
    autoSync
  };
}

export function isSupabaseConfigured(): boolean {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey && config.url.startsWith('http'));
}

export function saveSupabaseConfig(url: string, anonKey: string, autoSync = true): void {
  if (typeof window === 'undefined') return;
  
  if (url) {
    localStorage.setItem(STORAGE_KEYS.SUPABASE_URL, url.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_URL);
  }

  if (anonKey) {
    localStorage.setItem(STORAGE_KEYS.SUPABASE_ANON_KEY, anonKey.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS.SUPABASE_ANON_KEY);
  }

  localStorage.setItem(STORAGE_KEYS.SUPABASE_AUTO_SYNC, String(autoSync));

  // Invalida cliente em cache para recriar com novos parâmetros
  cachedClient = null;
  cachedClientKey = '';
}

export function clearSupabaseCustomConfig(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS.SUPABASE_URL);
  localStorage.removeItem(STORAGE_KEYS.SUPABASE_ANON_KEY);
  cachedClient = null;
  cachedClientKey = '';
}


// ---------------------------------------------------------------------------
// Multiempresa: toda tabela de dados (contaju_*) é isolada pela empresa ativa.
// Aqui o cliente passa a filtrar leituras/exclusões pela empresa e a gravar o
// org_id em cada linha. O banco (RLS) é quem garante o isolamento de verdade.
// ---------------------------------------------------------------------------
const ORG_FREE_TABLES = new Set([
  'contaju_organizations',
  'contaju_memberships',
  'contaju_consultants',
  'contaju_invitations',
  'contaju_consultant_access_log'
]);

// A empresa ativa fica TRAVADA nesta aba desde que a página abriu. Antes ela era lida do armazenamento compartilhado
// entre abas: quando outro usuário entrava em outra aba, a aba antiga passava a gravar os dados dela na empresa nova.
let tabOrg: string | null = null;
try {
  tabOrg = typeof localStorage !== 'undefined' ? localStorage.getItem('contaju_active_org') : null;
} catch {
  tabOrg = null;
}

/** Troca a empresa desta aba (só chamar no login ou ao trocar de empresa nesta mesma aba). */
export function setTabOrg(id: string | null): void {
  tabOrg = id;
}

// Se outra aba mudar a empresa ativa ou o usuário, esta aba recarrega do zero (memória limpa) em vez de gravar na empresa errada.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', e => {
    if (e.key === 'contaju_active_org' && e.newValue !== tabOrg) {
      window.location.reload();
    }
  });
}

export function getTabOrg(): string | null {
  return tabOrg;
}

function activeOrgId(): string | null {
  return tabOrg;
}

function withOrg(rows: any, org: string): any {
  if (Array.isArray(rows)) return rows.map(r => ({ ...r, org_id: org }));
  return rows && typeof rows === 'object' ? { ...rows, org_id: org } : rows;
}

function scopeToOrg(client: SupabaseClient): SupabaseClient {
  const originalFrom = client.from.bind(client);
  (client as any).from = (table: string) => {
    const builder: any = originalFrom(table);
    const org = activeOrgId();
    if (!table.startsWith('contaju_') || ORG_FREE_TABLES.has(table) || !org) return builder;
    return new Proxy(builder, {
      get(target, prop) {
        if (prop === 'select') return (...a: any[]) => target.select(...a).eq('org_id', org);
        if (prop === 'insert') return (rows: any, ...a: any[]) => target.insert(withOrg(rows, org), ...a);
        if (prop === 'upsert') {
          return (rows: any, opts?: any, ...a: any[]) =>
            target.upsert(withOrg(rows, org), opts?.onConflict === 'id' ? { ...opts, onConflict: 'org_id,id' } : opts, ...a);
        }
        if (prop === 'update') return (v: any, ...a: any[]) => target.update(v, ...a).eq('org_id', org);
        if (prop === 'delete') return (...a: any[]) => target.delete(...a).eq('org_id', org);
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };
  return client;
}

// Observa as respostas do banco: gravação recusada (sessão vencida, sem permissão, servidor fora) ou sem rede
// deixa uma marca de "dados só neste aparelho" e a sessão vencida aparece na tela, em vez de falhar em silêncio.
// Gravações nos dados do Contaju saem UMA DE CADA VEZ, na ordem em que foram feitas.
// Antes saíam em paralelo e duas gravações da mesma baixa (título + baixa) travavam uma na outra no banco
// ("deadlock", erro 500): o banco recusava as duas e o lançamento ficava só no aparelho.
let writeTail: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
// Engasgo passageiro do banco ou da rede (500, 502, 503, 504 ou queda de conexão): tenta de novo sozinho, na hora.
async function sendWithRetry(input: any, init?: any): Promise<Response> {
  const waits = [400, 1200, 3000];
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.status >= 500 && attempt < waits.length) { await sleep(waits[attempt]); continue; }
      return res;
    } catch (e) {
      if (attempt < waits.length) { await sleep(waits[attempt]); continue; }
      throw e;
    }
  }
}

const guardedFetch: typeof fetch = async (input: any, init?: any) => {
  let table = '';
  let method = 'GET';
  try {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const m = url.match(/\/rest\/v1\/([^/?]+)/);
    table = m ? m[1] : '';
    method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
  } catch { /* segue sem classificar */ }
  const isData = !!table && Object.prototype.hasOwnProperty.call(TABLE_TO_KEY, table);
  const isAuthToken = typeof input === 'string' ? input.includes('/auth/v1/token') : String(input?.url || '').includes('/auth/v1/token');
  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  try {
    let res: Response;
    if (isWrite && table.startsWith('contaju_')) {
      const run = writeTail.then(() => sendWithRetry(input, init));
      writeTail = run.catch(() => undefined);
      res = await run;
    } else {
      res = await fetch(input, init);
    }
    // Caixa-preta do login: se o banco recusar a renovação do acesso, guarda o motivo exato (código e hora) para diagnóstico
    if (isAuthToken && !res.ok) {
      res.clone().json().then((b: any) => {
        try {
          const list = JSON.parse(localStorage.getItem('contaju_auth_diag') || '[]');
          list.unshift({ em: new Date().toISOString(), status: res.status, codigo: b?.error_code || b?.error || '', msg: String(b?.msg || b?.error_description || b?.message || '').slice(0, 160) });
          localStorage.setItem('contaju_auth_diag', JSON.stringify(list.slice(0, 20)));
        } catch { /* só diagnóstico */ }
      }).catch(() => {});
    }
    if (isData && !res.ok) {
      if (res.status === 401) queueSessionCheck();
      if (isWrite && (res.status === 401 || res.status === 403 || res.status >= 500)) markDirty(table);
    } else if (res.status === 401 && table.startsWith('contaju_')) {
      queueSessionCheck();
    }
    return res;
  } catch (e) {
    if (isData && isWrite) markDirty(table);
    throw e;
  }
};

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !config.url.startsWith('http')) {
    return null;
  }

  const clientKey = `${config.url}_${config.anonKey}`;
  if (cachedClient && cachedClientKey === clientKey) {
    return cachedClient;
  }

  try {
    cachedClient = scopeToOrg(createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      global: { fetch: guardedFetch }
    }));
    cachedClientKey = clientKey;
    return cachedClient;
  } catch (err) {
    console.error('[SupabaseClient] Falha ao instanciar cliente Supabase:', err);
    return null;
  }
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  statusCode?: number;
  databaseFound?: boolean;
  tablesFound?: string[];
  missingTables?: string[];
  error?: string;
}

export async function testSupabaseConnection(): Promise<ConnectionTestResult> {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return {
      success: false,
      message: 'URL e Chave Anon do Supabase não configuradas.',
      error: 'CREDENTIALS_MISSING'
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      success: false,
      message: 'Não foi possível inicializar o cliente do Supabase com os dados informados.',
      error: 'CLIENT_INITIALIZATION_FAILED'
    };
  }

  const startTime = performance.now();

  try {
    // 1. Testa requisição básica contra a API REST do Supabase
    // Tentamos consultar as tabelas principais
    const targetTables = [
      'contaju_companies',
      'contaju_users',
      'contaju_chart_of_accounts',
      'contaju_bank_accounts',
      'contaju_counterparties',
      'contaju_contracts',
      'contaju_financial_titles'
    ];

    const tablesFound: string[] = [];
    const missingTables: string[] = [];

    // Testa pelo menos a tabela contaju_companies
    const { error: compError } = await client
      .from('contaju_companies')
      .select('id')
      .limit(1);

    const latencyMs = Math.round(performance.now() - startTime);

    if (compError) {
      // Código PGRST204 ou similar significa que tabela não existe ainda
      if (compError.code === '42P01' || compError.message?.includes('does not exist') || compError.message?.includes('relation "contaju_companies" does not exist')) {
        return {
          success: true, // Conexão com Supabase foi bem-sucedida, mas schema ainda não foi executado
          databaseFound: false,
          latencyMs,
          tablesFound: [],
          missingTables: targetTables,
          message: 'Conectado ao Supabase com sucesso! Porém as tabelas do Contaju ainda não foram criadas. Execute o script schema.sql no SQL Editor do Supabase.'
        };
      }

      // Erro de autenticação / JWT inválido
      if (compError.code === 'PGRST301' || compError.message?.includes('JWT') || compError.message?.includes('Invalid API key')) {
        return {
          success: false,
          latencyMs,
          message: 'Chave de API (Anon Key) inválida ou expirada. Verifique as credenciais no painel do Supabase.',
          error: compError.message
        };
      }

      // Outro erro de API
      return {
        success: false,
        latencyMs,
        message: `Erro na resposta do Supabase: ${compError.message}`,
        error: compError.message
      };
    }

    // Se a consulta a companies funcionou, o banco e a tabela existem!
    tablesFound.push('companies');

    // Checagem rápida de outras tabelas para diagnóstico
    for (const tbl of targetTables.filter(t => t !== 'companies')) {
      const { error } = await client.from(tbl).select('id').limit(1);
      if (!error) {
        tablesFound.push(tbl);
      } else {
        missingTables.push(tbl);
      }
    }

    return {
      success: true,
      databaseFound: true,
      latencyMs,
      tablesFound,
      missingTables,
      message: `Conexão bem-sucedida com o Supabase! (${latencyMs}ms). ${tablesFound.length} tabela(s) verificada(s).`
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      latencyMs,
      message: `Falha na conexão de rede com o Supabase: ${errorMessage}`,
      error: errorMessage
    };
  }
}
