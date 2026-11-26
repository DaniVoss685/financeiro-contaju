/**
 * Gravação vai direto para a nuvem: uma por vez (sem impasse no banco), com nova tentativa quando o banco engasga,
 * e o que foi lançado antes de a nuvem terminar de carregar sobe na hora (só o que mudou).
 * Supabase falso em memória. Rodar: npx tsx scripts/test-gravacao-imediata.ts
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const db: Record<string, any[]> = {};
let inFlight = 0, maxInFlight = 0, deadlocksLeft = 1;
const sentTitleIds: string[] = [];
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const table = (url.pathname.match(/\/rest\/v1\/([^/]+)/) || [])[1] || '';
  const method = String(init?.method || 'GET').toUpperCase();
  if (method === 'GET') return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
  await sleep(30);
  try {
    // o banco engasga uma vez (impasse) na gravação da baixa
    if (table === 'contaju_settlements' && deadlocksLeft > 0) { deadlocksLeft--; return new Response(JSON.stringify({ code: '40P01', message: 'deadlock detected' }), { status: 500 }); }
    const rows = [].concat(JSON.parse(String(init?.body || '[]')));
    db[table] = db[table] || [];
    for (const r of rows as any[]) {
      if (table === 'contaju_financial_titles') sentTitleIds.push(r.id);
      const i = db[table].findIndex(x => x.id === r.id);
      if (i >= 0) db[table][i] = r; else db[table].push(r);
    }
    return new Response('', { status: 201 });
  } finally { inFlight--; }
};

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) failures++; };

(async () => {
  const { setTabOrg } = await import('../src/services/supabaseClient');
  const { storage } = await import('../src/services/storageService');
  setTabOrg('org-teste');
  // aparelho com 50 lançamentos antigos, nuvem ainda não lida nesta abertura
  const velho = (i: number): any => ({ id: `tit-velho-${i}`, companyId: 'c', type: 'PAGAR', titleNumber: `V-${i}`, counterpartyId: '', description: 'antigo',
    launchDate: '2026-10-01', competence: '2026-10', issueDate: '2026-10-01', dueDate: '2026-10-10', expectedCashDate: '2026-10-10', originalAmount: 10,
    settledPrincipal: 0, balancePrincipal: 10, accruedInterest: 0, accruedFine: 0, documentState: 'CONFIRMADO', settlementState: 'ABERTO', originType: 'MANUAL', createdAt: '2026-10-01T00:00:00Z' });
  store.set('contaju_titles', JSON.stringify(Array.from({ length: 50 }, (_, i) => velho(i))));
  check(!storage.isHydratedFromCloud(), 'cenário: a nuvem ainda não foi lida nesta abertura');

  // a pessoa lança uma despesa nova e dá baixa
  const novo = { ...velho(0), id: 'tit-novo', titleNumber: 'NOVO-1', description: 'Despesa lançada agora', createdAt: new Date().toISOString() };
  storage.saveTitles([novo, ...storage.getTitles()]);
  storage.saveSettlements([{ id: 'set-novo', titleId: 'tit-novo', settlementNumber: 'B1', settlementDate: '2026-11-25', bankAccountId: 'acc', components: { principalSettled: 10, interest: 0, fine: 0, discount: 0, bankFee: 0, netFinancialAmount: 10 }, isReversed: false, createdAt: new Date().toISOString() } as any]);
  await sleep(6000);

  check(!!db.contaju_financial_titles?.some(t => t.id === 'tit-novo'), 'a despesa lançada foi para a nuvem na hora, sem esperar a leitura');
  check(!sentTitleIds.some(id => id.startsWith('tit-velho')), `a lista velha do aparelho NÃO subiu junto (${sentTitleIds.filter(i => i.startsWith('tit-velho')).length} antigos enviados)`);
  check(!!db.contaju_settlements?.some(s => s.id === 'set-novo'), 'a baixa chegou na nuvem mesmo com o banco engasgando uma vez (nova tentativa sozinha)');
  check(maxInFlight === 1, `gravações saíram uma de cada vez (no máximo ${maxInFlight} ao mesmo tempo)`);

  console.log(failures === 0 ? '\nTUDO CERTO' : `\n${failures} FALHA(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
