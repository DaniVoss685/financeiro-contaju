/**
 * Reproduz o "pago que volta a ficar em aberto" e a "conta bancária que some" com um Supabase falso em memória.
 * Nada vai para o banco de verdade: o fetch é interceptado.
 *
 * Cenário: o aparelho B ficou com uma cópia antiga (título em aberto, sem a baixa). No aparelho A o título foi pago,
 * então a nuvem tem o título LIQUIDADO e a baixa. B abre o sistema.
 *
 * Rodar: npx tsx scripts/test-sync-stale-device.ts
 */
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; }
};
(globalThis as any).window = globalThis;
(globalThis as any).document = { visibilityState: 'visible', addEventListener: () => {} };
(globalThis as any).addEventListener = () => {};
try { Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'teste' }, configurable: true }); } catch { /* ignora */ }
process.env.VITE_SUPABASE_URL = 'http://fake.supabase.local';
process.env.VITE_SUPABASE_ANON_KEY = 'fake-anon-key';

// ---------------------------------------------------------------- Supabase falso
const db: Record<string, any[]> = {};
const writes: Array<{ table: string; ids: string[] }> = [];
let revertedInCloud = false; // a nuvem chegou a receber o título pago como "em aberto"?
let titlesFailedOnce = false;
const T_ID = 'tit-teste-pago';
const DELAY = 220; // cada leitura demora um pouco, como no celular
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const realFetch = globalThis.fetch;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (!url.host.includes('fake.supabase.local')) return realFetch(input, init);
  const m = url.pathname.match(/\/rest\/v1\/([^/]+)/);
  if (!m) return new Response(JSON.stringify({}), { status: 200 });
  const table = m[1];
  const method = String(init?.method || 'GET').toUpperCase();
  db[table] = db[table] || [];
  if (method === 'GET' || method === 'HEAD') {
    // A lista de títulos é a maior (1.400 linhas na Contaju): no celular essa leitura passa de 3 segundos
    await sleep(table === 'contaju_financial_titles' ? 3500 : DELAY);
    // FALHA_LEITURA=1: a primeira leitura dos títulos dá erro no servidor (rede ruim), a segunda funciona
    if (table === 'contaju_financial_titles' && process.env.FALHA_LEITURA && !titlesFailedOnce) {
      titlesFailedOnce = true;
      return new Response(JSON.stringify({ message: 'erro temporário', code: '500' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 100000);
    return new Response(JSON.stringify(db[table].slice(offset, offset + limit)), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (method === 'POST') {
    const body = JSON.parse(String(init?.body || '[]'));
    const rows = Array.isArray(body) ? body : [body];
    for (const r of rows) {
      if (table === 'contaju_financial_titles' && r.id === T_ID && r.settlement_state !== 'LIQUIDADO') revertedInCloud = true;
      const i = db[table].findIndex(x => x.id === r.id);
      const row = { ...(i >= 0 ? db[table][i] : {}), ...r, updated_at: new Date().toISOString() }; // gatilho do banco
      if (i >= 0) db[table][i] = row; else db[table].push(row);
    }
    writes.push({ table, ids: rows.map(r => r.id) });
    return new Response('', { status: 201 });
  }
  if (method === 'DELETE') {
    const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
    db[table] = db[table].filter(x => x.id !== id);
    return new Response('', { status: 204 });
  }
  return new Response('', { status: 204 });
};

// ---------------------------------------------------------------- dados
const old = '2026-11-01T10:00:00.000Z';
const paidAt = '2026-11-20T15:00:00.000Z';
const titleBase = {
  company_id: 'comp-1', type: 'PAGAR', title_number: 'PAG-TESTE', counterparty_id: null, description: 'Aluguel teste',
  account_id: null, launch_date: '2026-11-01', competence: '2026-11', issue_date: '2026-11-01', due_date: '2026-11-10',
  expected_cash_date: '2026-11-10', original_amount: 500, accrued_interest: 0, accrued_fine: 0,
  document_state: 'CONFIRMADO', origin_type: 'MANUAL', created_at: old
};
// Nuvem: título pago (aparelho A) + baixa + conta bancária
db.contaju_financial_titles = [{ id: T_ID, ...titleBase, settled_principal: 500, balance_principal: 0, settlement_state: 'LIQUIDADO', updated_at: paidAt }];
db.contaju_settlements = [{ id: 'set-teste', title_id: T_ID, settlement_number: 'B-1', settlement_date: '2026-11-20', bank_account_id: 'acc-a',
  components: { principalSettled: 500, interest: 0, fine: 0, discount: 0, bankFee: 0, netFinancialAmount: 500 }, is_reversed: false, created_at: paidAt, updated_at: paidAt }];
// Título 2: a nuvem já foi estragada por uma cópia velha (ficou "em aberto"), mas a baixa dele continua lá
const T2 = 'tit-teste-estragado';
db.contaju_financial_titles.push({ id: T2, ...titleBase, title_number: 'PAG-TESTE-2', settled_principal: 0, balance_principal: 500, settlement_state: 'ABERTO', updated_at: old });
db.contaju_settlements.push({ id: 'set-teste-2', title_id: T2, settlement_number: 'B-2', settlement_date: '2026-11-20', bank_account_id: 'acc-a',
  components: { principalSettled: 500, interest: 0, fine: 0, discount: 0, bankFee: 0, netFinancialAmount: 500 }, is_reversed: false, created_at: paidAt, updated_at: paidAt });
db.contaju_bank_accounts = [{ id: 'acc-a', institution: 'Inter', name: 'Inter', type: 'CORRENTE', currency: 'BRL', initial_balance: 0, current_balance: 0, base_date: '2026-11-01', include_in_cash_flow: true, status: 'ATIVO', updated_at: old }];
db.contaju_companies = [{ id: 'comp-1', company_name: 'Teste' }];

// Aparelho B: cópia antiga (em aberto, sem baixa) + conta "Consumo" criada aqui e que ainda não subiu
const staleTitle = {
  id: T_ID, companyId: 'comp-1', type: 'PAGAR', titleNumber: 'PAG-TESTE', description: 'Aluguel teste', launchDate: '2026-11-01',
  competence: '2026-11', issueDate: '2026-11-01', dueDate: '2026-11-10', expectedCashDate: '2026-11-10', originalAmount: 500,
  settledPrincipal: 0, balancePrincipal: 500, accruedInterest: 0, accruedFine: 0, documentState: 'CONFIRMADO',
  settlementState: 'ABERTO', originType: 'MANUAL', createdAt: old, updatedAt: old
};
store.set('contaju_supabase_url', 'http://fake.supabase.local');
store.set('contaju_supabase_anon_key', 'fake-anon-key');
store.set('contaju_schema_version', 'v7_supabase_database_first');
// Título 3: existia no aparelho, mas foi apagado em outro aparelho (não está mais na nuvem) — não pode voltar
const T3 = 'tit-apagado-em-outro-aparelho';
// Título 4: cópia duplicada que foi apagada na nuvem e anotada na lista de apagados; o aparelho ainda a tem
const T4 = 'tit-copia-duplicada';
db.contaju_deleted_records = [{ table_name: 'contaju_financial_titles', record_id: T4 }];
store.set('contaju_titles', JSON.stringify([staleTitle, { ...staleTitle, id: T2, titleNumber: 'PAG-TESTE-2' }, { ...staleTitle, id: T3, titleNumber: 'PAG-APAGADO' }, { ...staleTitle, id: T4, titleNumber: 'PAG-COPIA', createdAt: '2026-11-24T19:32:00.000Z', updatedAt: '2026-11-24T19:32:00.000Z' }]));
store.set('contaju_settlements', JSON.stringify([]));
store.set('contaju_bank_accounts', JSON.stringify([
  { id: 'acc-a', institution: 'Inter', name: 'Inter', type: 'CORRENTE', currency: 'BRL', initialBalance: 0, currentBalance: 0, baseDate: '2026-11-01', includeInCashFlow: true, status: 'ATIVO' },
  { id: 'acc-consumo', institution: 'Consumo', name: 'Consumo', type: 'CORRENTE', currency: 'BRL', initialBalance: 0, currentBalance: 0, baseDate: '2026-11-22', includeInCashFlow: true, status: 'ATIVO', createdAt: '2026-11-22T12:00:00.000Z', updatedAt: '2026-11-22T12:00:00.000Z' }
]));
store.set('contaju_last_sync_ok_local', '2026-11-21T00:00:00.000Z'); // último envio completo foi antes de criar a Consumo
// Na leitura anterior (já com a versão nova) a nuvem tinha os 3 títulos e só a conta Inter
store.set('contaju_cloud_ids_local', JSON.stringify({ contaju_titles: [T_ID, T2, T3], contaju_bank_accounts: ['acc-a'], contaju_settlements: ['set-teste', 'set-teste-2'] }));

// ---------------------------------------------------------------- execução
let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'OK  ' : 'FALHA'} ${msg}`); if (!ok) failures++; };

(async () => {
  const { storage } = await import('../src/services/storageService');
  // Uma rotina de abertura grava a lista de títulos antes de a nuvem ser lida (ex.: geração de recorrentes)
  storage.saveTitles(storage.getTitles());
  await sleep(300);
  check(writes.length === 0, `nada foi enviado antes de ler a nuvem (${writes.length} envio(s))`);
  const first = await storage.initializeDatabaseFirst();
  if (process.env.FALHA_LEITURA) {
    check(first === false, 'primeira leitura falhou e o aparelho não se considera em dia');
    await sleep(4000);
    check(!writes.some(w => w.table === 'contaju_financial_titles'), 'com a leitura falhando, nenhum título subiu');
    const second = await storage.initializeDatabaseFirst(); // nova tentativa (no app: a cada 45 s ou 10 s após abrir)
    check(second === true, 'segunda leitura funcionou');
  }
  await sleep(6000); // deixa a gravação automática (3 s) e o reenvio rodarem
  if (process.env.DEBUG_SYNC) {
    const { supabaseSync } = await import('../src/services/supabaseSyncService');
    console.log('sync manual:', JSON.stringify(await supabaseSync.syncAllToSupabase()).slice(0, 400));
  }

  const cloudTitle = db.contaju_financial_titles.find(t => t.id === T_ID);
  const localTitle = storage.getTitles().find(t => t.id === T_ID);
  const titleWrites = writes.filter(w => w.table === 'contaju_financial_titles');
  console.log('\nGravações de títulos feitas pelo aparelho B:', titleWrites.length, '| todas:', writes.map(w => `${w.table}:${w.ids.length}`).join(' '));

  check(!revertedInCloud, 'a nuvem nunca recebeu a cópia antiga "em aberto" por cima do pago');
  check(cloudTitle?.settlement_state === 'LIQUIDADO', `nuvem termina com o título pago (está ${cloudTitle?.settlement_state})`);
  // (reenviar a versão já somada e correta é aceitável; o que não pode é subir a cópia velha — conferido acima)
  check(titleWrites.length <= 1, `aparelho B não ficou regravando o título (${titleWrites.length} envio(s))`);
  check(localTitle?.settlementState === 'LIQUIDADO', `aparelho B mostra o título pago (mostra ${localTitle?.settlementState})`);
  const t2Local = storage.getTitles().find(t => t.id === T2);
  const t2Cloud = db.contaju_financial_titles.find(t => t.id === T2);
  check(t2Local?.settlementState === 'LIQUIDADO', `título com baixa mas gravado "em aberto" volta a aparecer pago (mostra ${t2Local?.settlementState})`);
  check(t2Cloud?.settlement_state === 'LIQUIDADO', `e a nuvem é corrigida (está ${t2Cloud?.settlement_state})`);
  check(!db.contaju_financial_titles.some(t => t.id === T3), 'título apagado em outro aparelho não voltou para a nuvem');
  check(!storage.getTitles().some(t => t.id === T3), 'nem continua aparecendo no aparelho B');
  check(!storage.getTitles().some(t => t.id === T4), 'cópia apagada (lista de apagados) sumiu do aparelho B');
  check(!db.contaju_financial_titles.some(t => t.id === T4), 'e não foi reenviada para a nuvem');
  check(storage.getBankAccounts().some(b => b.id === 'acc-consumo'), 'aparelho B ainda tem a conta Consumo');
  check(db.contaju_bank_accounts.some(b => b.id === 'acc-consumo'), 'conta Consumo foi enviada para a nuvem');

  console.log(failures === 0 ? '\nTUDO CERTO' : `\n${failures} FALHA(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
