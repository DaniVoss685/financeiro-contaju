// Teste do aviso de vencimento (sem banco e sem rede): mensagens do dia, regras de envio e proteção das rotas.
// Rodar: node scripts/test-push.mjs
import assert from 'node:assert/strict';
import * as webpush from 'web-push';
import { montarMensagens, enviar, configurarWebPush, brl } from '../api/_push/aviso.js';
import push from '../api/push.js';
import cron from '../api/push-cron.js';

let ok = 0;
const t = (nome, fn) => Promise.resolve().then(fn).then(() => { ok++; console.log('  ok  ' + nome); }, e => { console.error('FALHOU ' + nome + '\n', e); process.exitCode = 1; });
const fakeRes = () => { const r = { code: 0, body: null, headers: {}, setHeader(k, v) { r.headers[k] = v; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
// espaço fino/inseparável do pt-BR: comparamos sem ele
const sem = s => s.replace(/\s/g, ' ');

await t('um vencimento a pagar vira "Nome vence hoje" com o valor', () => {
  const m = montarMensagens([{ id: 'a', tipo: 'PAGAR', valor: 180, nome: 'Água', parte: 'Sabesp' }]);
  assert.equal(m.length, 1);
  assert.equal(m[0].title, 'Água vence hoje');
  assert.equal(sem(m[0].body), sem(`${brl(180)} a pagar • Sabesp`));
  assert.equal(m[0].url, '/#pagar');
});
await t('receita vira "Recebimento previsto hoje"', () => {
  const m = montarMensagens([{ id: 'b', tipo: 'RECEBER', valor: 1500.5, nome: 'Honorário Maria', parte: '' }]);
  assert.match(m[0].title, /^Recebimento previsto hoje: Honorário Maria$/);
  assert.equal(m[0].url, '/#receber');
});
await t('até 3 itens = um aviso cada', () => {
  const itens = [1, 2, 3].map(i => ({ id: 'i' + i, tipo: 'PAGAR', valor: i * 10, nome: 'Conta ' + i, parte: '' }));
  assert.equal(montarMensagens(itens).length, 3);
});
await t('mais de 3 itens = um resumo só, com totais', () => {
  const itens = [1, 2, 3, 4].map(i => ({ id: 'i' + i, tipo: i === 4 ? 'RECEBER' : 'PAGAR', valor: 100, nome: 'Conta ' + i, parte: '' }));
  const m = montarMensagens(itens);
  assert.equal(m.length, 1);
  assert.equal(m[0].title, '4 vencimentos hoje');
  assert.match(sem(m[0].body), /3 a pagar: R\$ 300,00/);
  assert.match(sem(m[0].body), /1 a receber: R\$ 100,00/);
});
await t('aparelho que só quer "a pagar" não recebe receita', () => {
  const itens = [{ id: 'a', tipo: 'PAGAR', valor: 5, nome: 'X', parte: '' }, { id: 'b', tipo: 'RECEBER', valor: 9, nome: 'Y', parte: '' }];
  const m = montarMensagens(itens, { receber: false });
  assert.equal(m.length, 1);
  assert.equal(m[0].title, 'X vence hoje');
  assert.equal(montarMensagens([], {}).length, 0);
});
await t('conta de amanhã vira "Nome vence amanhã" e vem depois das de hoje', () => {
  const m = montarMensagens([
    { id: 'x', tipo: 'PAGAR', valor: 90, nome: 'Luz', parte: '', quando: 'AMANHA' },
    { id: 'y', tipo: 'PAGAR', valor: 180, nome: 'Água', parte: '', quando: 'HOJE' }
  ]);
  assert.deepEqual(m.map(x => x.title), ['Água vence hoje', 'Luz vence amanhã']);
  assert.notEqual(m[0].tag, m[1].tag);
});
await t('resumo mistura hoje e amanhã no título', () => {
  const itens = [1, 2, 3, 4].map(i => ({ id: 'i' + i, tipo: 'PAGAR', valor: 10, nome: 'C' + i, parte: '', quando: i <= 2 ? 'HOJE' : 'AMANHA' }));
  assert.equal(montarMensagens(itens)[0].title, '4 vencimentos: 2 hoje, 2 amanhã');
});
await t('robô fora do horário (madrugada) não manda nada', async () => {
  const { horaBrasil } = await import('../api/push-cron.js');
  assert.equal(horaBrasil(Date.UTC(2026, 10, 24, 6, 0)), 3);
  assert.equal(horaBrasil(Date.UTC(2026, 10, 24, 11, 0)), 8);
});
await t('sem chaves o servidor não está pronto', () => {
  assert.equal(configurarWebPush({}), false);
});
await t('com chaves válidas configura; endereço inexistente não derruba (falha tratada)', async () => {
  const k = webpush.generateVAPIDKeys();
  assert.equal(configurarWebPush({ VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey }), true);
  const r = await enviar({ endpoint: 'https://localhost:9/nao-existe', p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' }, { title: 't', body: 'b', tag: 'x', url: '/' });
  assert.equal(r.ok, false);
});
await t('/api/push sem sessão: recusa', async () => {
  process.env.SUPABASE_URL = 'https://x.supabase.co'; process.env.SUPABASE_ANON_KEY = 'a'; process.env.SUPABASE_SERVICE_ROLE_KEY = 's';
  const k = webpush.generateVAPIDKeys(); process.env.VAPID_PUBLIC_KEY = k.publicKey; process.env.VAPID_PRIVATE_KEY = k.privateKey;
  const res = fakeRes();
  await push({ method: 'POST', headers: {}, body: { action: 'chave', orgId: '11111111-1111-1111-1111-111111111111' } }, res);
  assert.equal(res.code, 401);
  const res2 = fakeRes();
  await push({ method: 'GET', headers: {}, body: {} }, res2);
  assert.equal(res2.code, 405);
});
await t('/api/push sem chaves no servidor: avisa que não foi configurado', async () => {
  delete process.env.VAPID_PRIVATE_KEY;
  const res = fakeRes();
  await push({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { action: 'chave', orgId: '11111111-1111-1111-1111-111111111111' } }, res);
  assert.equal(res.code, 503);
});
await t('/api/push-cron sem o segredo do robô: recusa', async () => {
  process.env.CRON_SECRET = 'segredo-de-teste';
  const res = fakeRes();
  await cron({ headers: { authorization: 'Bearer errado' } }, res);
  assert.equal(res.code, 401);
  const res2 = fakeRes();
  await cron({ headers: {} }, res2);
  assert.equal(res2.code, 401);
});
console.log(`\n${process.exitCode ? 'COM FALHAS' : 'TUDO CERTO'} (${ok} testes ok)`);
