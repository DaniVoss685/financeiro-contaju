/**
 * Lançamento cujo cliente ainda não subiu para a nuvem não pode ficar só no aparelho.
 * Supabase falso em memória que imita a regra do banco (cliente tem que existir).
 * Rodar: npx tsx scripts/test-cliente-faltando.ts
 */
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null), setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, get length() { return store.size; }
};
(globalThis as any).window = globalThis;
(globalThis as any).document = { visibilityState: 'visible', addEventListener: () => {} };
(globalThis as any).addEventListener = () => {};
try { Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'teste' }, configurable: true }); } catch { /* ignora */ }
process.env.VITE_SUPABASE_URL = 'http://fake.supabase.local';
process.env.VITE_SUPABASE_ANON_KEY = 'fake-anon-key';
store.set('contaju_supabase_url', 'http://fake.supabase.local');
store.set('contaju_supabase_anon_key', 'fake-anon-key');

const ORG = 'org-teste';
const db: Record<string, any[]> = { contaju_counterparties: [], contaju_financial_titles: [] };
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const table = (url.pathname.match(/\/rest\/v1\/([^/]+)/) || [])[1] || '';
  const method = String(init?.method || 'GET').toUpperCase();
  db[table] = db[table] || [];
  if (method !== 'POST') return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  const rows = [].concat(JSON.parse(String(init?.body || '[]')));
  // regra do banco: cliente do lançamento precisa existir na mesma empresa
  if (table === 'contaju_financial_titles') {
    const bad = rows.find((r: any) => r.counterparty_id && !db.contaju_counterparties.some(c => c.id === r.counterparty_id && c.org_id === r.org_id));
    if (bad) return new Response(JSON.stringify({ code: '23503', message: 'insert or update on table "contaju_financial_titles" violates foreign key constraint "contaju_financial_titles_counterparty_id_fkey"' }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
  for (const r of rows as any[]) {
    const i = db[table].findIndex(x => x.id === r.id && x.org_id === r.org_id);
    if (i >= 0) db[table][i] = { ...db[table][i], ...r }; else db[table].push(r);
  }
  return new Response('', { status: 201 });
};

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) failures++; };

(async () => {
  const { setTabOrg } = await import('../src/services/supabaseClient');
  const { storage } = await import('../src/services/storageService');
  const { supabaseSync } = await import('../src/services/supabaseSyncService');
  setTabOrg(ORG);
  store.set('contaju_cache_org', ORG);
  // cliente só existe neste aparelho (não subiu)
  storage.saveCounterparties([{ id: 'cli-local', name: 'Cliente só no aparelho', type: 'CLIENTE', status: 'ATIVO' } as any]);
  const titulo: any = {
    id: 'tit-dinheiro', companyId: 'comp-1', type: 'RECEBER', titleNumber: 'REC-1', counterpartyId: 'cli-local', description: 'Recebido em dinheiro',
    launchDate: '2026-11-25', competence: '2026-11', issueDate: '2026-11-25', dueDate: '2026-11-25', expectedCashDate: '2026-11-25',
    originalAmount: 300, settledPrincipal: 300, balancePrincipal: 0, accruedInterest: 0, accruedFine: 0,
    documentState: 'CONFIRMADO', settlementState: 'LIQUIDADO', originType: 'MANUAL', createdAt: '2026-11-25T10:00:00.000Z'
  };
  const res = await supabaseSync.saveTitlesDirectly([titulo]);
  check(res.success, `gravação do lançamento deu certo (${res.error || 'ok'})`);
  check(db.contaju_counterparties.some(c => c.id === 'cli-local' && c.org_id === ORG), 'o cliente que faltava subiu para a nuvem, na mesma empresa');
  const t = db.contaju_financial_titles.find(x => x.id === 'tit-dinheiro');
  check(!!t && t.counterparty_id === 'cli-local', 'o lançamento chegou à nuvem com o cliente ligado');

  // cópia de outra empresa no aparelho: não sobe nada da outra empresa
  store.set('contaju_cache_org', 'outra-empresa');
  storage.saveCounterparties([{ id: 'cli-outra', name: 'Cliente de outra empresa', type: 'CLIENTE', status: 'ATIVO' } as any]);
  await supabaseSync.saveTitlesDirectly([{ ...titulo, id: 'tit-outra', counterpartyId: 'cli-outra' }]);
  check(!db.contaju_counterparties.some(c => c.id === 'cli-outra'), 'com cópia de outra empresa, o cliente NÃO sobe');
  check(!db.contaju_financial_titles.some(x => x.id === 'tit-outra'), 'e o lançamento também não');

  console.log(failures === 0 ? '\nTUDO CERTO' : `\n${failures} FALHA(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
