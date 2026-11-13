// Teste do servidor da cobrança pelo Asaas, com um Asaas de mentira local e um banco de mentira em memória.
// Sem rede externa, sem chave real, sem tocar no banco de verdade.  Rodar: node scripts/test-cobranca-asaas.mjs
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

const umPdf = async texto => { const d = await PDFDocument.create(); d.addPage([300, 200]).drawText(texto); return Buffer.from(await d.save()); };

// ------------------------------------------------------------------ Asaas de mentira
const chamadas = [];
const pagamentos = new Map(); // id -> pagamento
let contador = 0;
let modoForaDoAr = false;
const mock = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', c => (corpo += c));
  req.on('end', () => {
    const json = corpo ? JSON.parse(corpo) : null;
    const url = new URL(req.url, 'http://x');
    chamadas.push({ metodo: req.method, caminho: url.pathname, consulta: url.search, chave: req.headers.access_token, corpo: json });
    const r = (s, d) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
    if (url.pathname.startsWith('/pdf/')) {
      if (url.pathname === '/pdf/quebrado') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>nao e pdf</html>'); }
      return umPdf(url.pathname).then(b => { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end(b); });
    }
    if (modoForaDoAr) return r(500, { errors: [{ description: 'indisponível' }] });
    if (url.pathname === '/finance/balance') return req.headers.access_token === 'chave-ruim-0000000000000' ? r(401, { errors: [{ description: 'invalid_access_token' }] }) : r(200, { balance: 10 });
    if (url.pathname === '/customers' && req.method === 'GET') {
      return r(200, { data: url.searchParams.get('cpfCnpj') === '99999999999' ? [{ id: 'cus_existente', deleted: false }] : [] });
    }
    if (url.pathname === '/customers' && req.method === 'POST') return r(200, { id: `cus_${++contador}` });
    if (url.pathname.startsWith('/customers/')) return r(200, { id: 'cus_crm', name: 'Loja da Maria', cpfCnpj: '12345678000190', email: 'maria@loja.com' });
    if (url.pathname === '/payments' && req.method === 'GET') {
      const ref = url.searchParams.get('externalReference');
      return r(200, { data: [...pagamentos.values()].filter(p => p.externalReference === ref) });
    }
    if (url.pathname === '/payments' && req.method === 'POST') {
      const id = `pay_${++contador}`;
      const p = { id, status: 'PENDING', invoiceUrl: `https://asaas.test/i/${id}`, bankSlipUrl: `https://asaas.test/b/${id}`, nossoNumero: `${contador}`, originalValue: json.value, ...json };
      pagamentos.set(id, p);
      return r(200, p);
    }
    if (url.pathname.endsWith('/pixQrCode')) return r(200, { encodedImage: 'QUJD', payload: '000201pix' });
    if (url.pathname.endsWith('/identificationField')) return r(200, { identificationField: '34191.79001' });
    if (url.pathname.startsWith('/payments/') && req.method === 'DELETE') return r(200, { deleted: true });
    if (url.pathname.startsWith('/payments/')) { const p = pagamentos.get(url.pathname.split('/')[2]); return p ? r(200, p) : r(404, { errors: [{ description: 'não existe' }] }); }
    if (url.pathname === '/webhooks') return r(200, { id: 'wh_1' });
    return r(404, { errors: [{ description: 'rota não simulada' }] });
  });
});
await new Promise(ok => mock.listen(0, '127.0.0.1', ok));
process.env.ASAAS_API_URL_OVERRIDE = `http://127.0.0.1:${mock.address().port}`;
process.env.NFSE_CERT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-falsa';
process.env.SUPABASE_ANON_KEY = 'anon-falsa';

// ------------------------------------------------------------------ Banco de mentira em memória
function bancoFalso(tabelas) {
  const rpcs = [];
  const lerLinhas = t => (tabelas[t] = tabelas[t] || []);
  const vivos = ['PENDING', 'AWAITING_RISK_ANALYSIS', 'OVERDUE', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'];
  function consulta(t, op, valores) {
    const q = { filtros: [], ordem: null, faixa: null, lim: null, op, valores, colunas: '*' };
    const executar = () => {
      let linhas = lerLinhas(t).slice();
      for (const f of q.filtros) linhas = linhas.filter(f);
      if (q.ordem) {
        const { col, asc, nullsFirst } = q.ordem;
        linhas.sort((a, b) => {
          const x = a[col], y = b[col];
          if (x == null && y == null) return 0;
          if (x == null) return nullsFirst ? -1 : 1;
          if (y == null) return nullsFirst ? 1 : -1;
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (q.faixa) linhas = linhas.slice(q.faixa[0], q.faixa[1] + 1);
      if (q.lim != null) linhas = linhas.slice(0, q.lim);
      return linhas;
    };
    const api = {
      select(c) { q.colunas = c; return api; },
      eq(c, v) { q.filtros.push(l => l[c] === v); return api; },
      in(c, v) { q.filtros.push(l => v.includes(l[c])); return api; },
      gt(c, v) { q.filtros.push(l => l[c] > v); return api; },
      gte(c, v) { q.filtros.push(l => l[c] >= v); return api; },
      lte(c, v) { q.filtros.push(l => l[c] <= v); return api; },
      order(col, o = {}) { q.ordem = { col, asc: o.ascending !== false, nullsFirst: Boolean(o.nullsFirst) }; return api; },
      range(a, b) { q.faixa = [a, b]; return api; },
      limit(n) { q.lim = n; return api; },
      maybeSingle: async () => ({ data: executar()[0] ?? null, error: null }),
      single: async () => {
        if (q.op === 'insert') return fazerInsert(true);
        const l = executar()[0];
        return l ? { data: l, error: null } : { data: null, error: { code: 'PGRST116' } };
      },
      then(ok, falha) { return Promise.resolve(fazer()).then(ok, falha); }
    };
    const fazerInsert = comRetorno => {
      const linha = { id: `id_${Math.random().toString(36).slice(2)}`, ...valores };
      if (t === 'contaju_asaas_charges') {
        const dup = lerLinhas(t).find(l => l.asaas_payment_id === linha.asaas_payment_id || (l.org_id === linha.org_id && l.title_id === linha.title_id && vivos.includes(l.status) && vivos.includes(linha.status || 'PENDING')));
        if (dup) return { data: null, error: { code: '23505' } };
        linha.status = linha.status || 'PENDING';
      }
      lerLinhas(t).push(linha);
      return { data: comRetorno ? { id: linha.id } : null, error: null };
    };
    const fazer = () => {
      if (op === 'insert') return fazerInsert(false);
      if (op === 'upsert') {
        const chaves = (valores.__onConflict || '').split(',');
        const { __onConflict, ...v } = valores;
        const ex = lerLinhas(t).find(l => chaves.every(k => l[k] === v[k]));
        if (ex) Object.assign(ex, v); else lerLinhas(t).push({ ...v });
        return { data: null, error: null };
      }
      if (op === 'update') {
        for (const l of executar()) Object.assign(l, valores);
        return { data: null, error: null };
      }
      return { data: executar(), error: null };
    };
    return api;
  }
  return {
    rpcs, tabelas,
    from: t => ({
      select: c => consulta(t, 'select', null).select(c),
      insert: v => consulta(t, 'insert', v),
      upsert: (v, o = {}) => consulta(t, 'upsert', { ...v, __onConflict: o.onConflict || 'id' }),
      update: v => consulta(t, 'update', v)
    }),
    rpc: async (nome, args) => { rpcs.push({ nome, args }); return { data: { status: 'processed' }, error: null }; }
  };
}

// ------------------------------------------------------------------ Carrega o código testado
const gw = await import('../api/_asaas/gateway.js');
const sv = await import('../api/_asaas/servico.js');
const { __acoesParaTeste: ACOES } = await import('../api/asaas.js');
const webhook = (await import('../api/asaas-webhook.js')).default;
const cron = (await import('../api/asaas-cron.js')).default;
const { decifrar } = await import('../api/_nfse/cert.js');
const { hojeBrasil, somarDias } = gw;

let ok = 0;
const teste = async (nome, fn) => {
  try { await fn(); ok++; console.log('  ok  ', nome); }
  catch (e) { console.error('  FALHOU', nome, '\n       ', e.stack?.split('\n').slice(0, 3).join('\n        ') || e.message); process.exitCode = 1; }
};
const rejeita = async (p, re) => { try { await p; } catch (e) { assert.match(String(e.message), re); return; } assert.fail('devia ter recusado'); };

const ORG = '11111111-1111-4111-8111-111111111111';
const hoje = hojeBrasil();
const segredo = sv.segredoDeCifra();
const configBase = { org_id: ORG, ambiente: 'sandbox', ativo: true, robo_ativo: true, antecedencia_dias: 10, limite_por_execucao: 30, bank_account_id: 'b1', receita_conta_id: 'r1', importar_assinaturas_crm: true, notificar_cliente: false, multa_percentual: null, juros_mensal_percentual: null, webhook_token_hash: null };
const titulo = (id, dias, extra = {}) => ({ id, org_id: ORG, type: 'RECEBER', document_state: 'CONFIRMADO', settlement_state: 'ABERTO', balance_principal: 1000, due_date: somarDias(hoje, dias), counterparty_id: 'cli1', contract_id: 'ct1', description: `Honorários ${id}`, title_number: `FAT-${id}`, competence: '2026-11', ...extra });
function cenario(extra = {}) {
  return bancoFalso({
    contaju_asaas_config: [{ ...configBase }],
    contaju_asaas_credentials: [{ org_id: ORG, api_key_cifrada: sv.cifrarChave('chave-boa-de-teste-0000000000', segredo) }],
    contaju_financial_titles: [titulo('a', 3), titulo('b', 9), titulo('c', 15), titulo('d', -2), titulo('e', 4, { contract_id: 'ct2' }), titulo('f', 5, { counterparty_id: 'cli2' }), titulo('g', 6, { contract_id: 'ct3' }), titulo('h', 2, { type: 'PAGAR' }), titulo('i', 2, { settlement_state: 'LIQUIDADO' }), titulo('j', 7, { balance_principal: 3 })],
    contaju_contracts: [{ id: 'ct1', org_id: ORG, billing_method: 'BOLETO' }, { id: 'ct2', org_id: ORG, billing_method: 'TRANSFERENCIA' }, { id: 'ct3', org_id: ORG, billing_method: 'PIX' }],
    contaju_counterparties: [{ id: 'cli1', org_id: ORG, name: 'Padaria Pão Quente', document: '12.345.678/0001-90', email: 'padaria@exemplo.com', phone: '(11) 98888-7777' }, { id: 'cli2', org_id: ORG, name: 'Cliente Sem Documento', document: '', email: '', phone: '' }],
    contaju_asaas_charges: [], contaju_asaas_customers: [], contaju_bank_accounts: [{ id: 'b1', org_id: ORG }], contaju_chart_of_accounts: [{ id: 'r1', org_id: ORG, is_analytical: true }], contaju_memberships: [{ org_id: ORG, user_id: 'u1', role: 'OWNER' }],
    ...extra
  });
}
const dono = { usuario: { id: 'u1', email: 'dono@x.com', user_metadata: { name: 'Dono' } }, consultor: false };
const membro = { usuario: { id: 'u9', email: 'func@x.com' }, consultor: false };
const consultor = { usuario: { id: 'u2', email: 'c@x.com' }, consultor: true };
const envSrv = { segredo };
const req = { headers: { 'x-forwarded-host': 'financeiro.exemplo.com' } };

console.log('Quais títulos o robô cobra');
await teste('só honorário de contrato com boleto/Pix, a vencer na janela, confirmado, em aberto, com CPF/CNPJ', async () => {
  const db = cenario();
  const cx = await sv.abrirContexto(db, ORG, segredo);
  const sel = await sv.selecionarParaRobo(cx, { hoje });
  assert.deepEqual(sel.cobrar.map(i => i.titulo.id).sort(), ['a', 'b', 'g', 'j']); // c fora da janela, d vencido, e transferência, f sem doc, h pagar, i liquidado
  assert.equal(sel.cobrar.find(i => i.titulo.id === 'g').forma, 'PIX');
  assert.equal(sel.cobrar.find(i => i.titulo.id === 'a').forma, 'BOLETO');
  assert.deepEqual(sel.pulados.map(p => p.titleId), ['f']);
  assert.match(sel.pulados[0].motivo, /CPF\/CNPJ/);
});
await teste('título que já tem cobrança viva é pulado; cobrança cancelada não conta', async () => {
  const db = cenario({ contaju_asaas_charges: [{ org_id: ORG, title_id: 'a', status: 'PENDING', asaas_payment_id: 'p1' }, { org_id: ORG, title_id: 'b', status: 'DELETED', asaas_payment_id: 'p2' }] });
  const sel = await sv.selecionarParaRobo(await sv.abrirContexto(db, ORG, segredo), { hoje });
  assert.deepEqual(sel.cobrar.map(i => i.titulo.id).sort(), ['b', 'g', 'j']);
});
await teste('janela segue a antecedência configurada', async () => {
  const db = cenario();
  db.tabelas.contaju_asaas_config[0].antecedencia_dias = 4;
  const sel = await sv.selecionarParaRobo(await sv.abrirContexto(db, ORG, segredo), { hoje });
  assert.deepEqual(sel.cobrar.map(i => i.titulo.id).sort(), ['a']);
});
await teste('conexão desligada ou sem chave não deixa operar', async () => {
  const db = cenario();
  db.tabelas.contaju_asaas_config[0].ativo = false;
  await rejeita(sv.abrirContexto(db, ORG, segredo), /desligada/);
  const db2 = cenario({ contaju_asaas_credentials: [] });
  await rejeita(sv.abrirContexto(db2, ORG, segredo), /chave do Asaas/);
});

console.log('Gerar cobranças');
await teste('gera cliente + cobrança com os dados certos e guarda o vínculo', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = cenario();
  db.tabelas.contaju_asaas_config[0].multa_percentual = 2;
  db.tabelas.contaju_asaas_config[0].juros_mensal_percentual = 1;
  const cx = await sv.abrirContexto(db, ORG, segredo);
  const sel = await sv.selecionarParaRobo(cx, { hoje });
  const r = await sv.gerarLote(cx, sel.cobrar.filter(i => i.titulo.id === 'a'), { origem: 'ROBO', usuario: 'Robô diário' });
  assert.equal(r.gerados.length, 1);
  const cli = chamadas.find(c => c.caminho === '/customers' && c.metodo === 'POST').corpo;
  assert.equal(cli.cpfCnpj, '12345678000190');
  assert.equal(cli.notificationDisabled, true); // cliente não é avisado pelo Asaas por padrão
  assert.equal(cli.mobilePhone, '11988887777');
  assert.equal(chamadas.find(c => c.caminho === '/customers').chave, 'chave-boa-de-teste-0000000000');
  const pag = chamadas.find(c => c.caminho === '/payments' && c.metodo === 'POST').corpo;
  assert.equal(pag.value, 1000);
  assert.equal(pag.billingType, 'BOLETO');
  assert.equal(pag.dueDate, somarDias(hoje, 3));
  assert.equal(pag.externalReference, `contaju:${ORG}:a`);
  assert.deepEqual(pag.fine, { value: 2 });
  assert.deepEqual(pag.interest, { value: 1 });
  const ch = db.tabelas.contaju_asaas_charges[0];
  assert.equal(ch.title_id, 'a');
  assert.equal(ch.origin, 'ROBO');
  assert.equal(db.tabelas.contaju_asaas_customers[0].counterparty_id, 'cli1');
});
await teste('cliente que já existe no Asaas (mesmo CPF) é reaproveitado, sem duplicar', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = cenario();
  db.tabelas.contaju_counterparties[0].document = '999.999.999-99';
  const cx = await sv.abrirContexto(db, ORG, segredo);
  const sel = await sv.selecionarParaRobo(cx, { hoje });
  await sv.gerarLote(cx, sel.cobrar.filter(i => i.titulo.id === 'a'), { origem: 'MANUAL' });
  assert.equal(chamadas.some(c => c.caminho === '/customers' && c.metodo === 'POST'), false);
  assert.equal(db.tabelas.contaju_asaas_charges[0].asaas_customer_id, 'cus_existente');
});
await teste('idempotente: se o Asaas já tem a cobrança do título, adota em vez de criar outra', async () => {
  chamadas.length = 0; pagamentos.clear();
  pagamentos.set('pay_antiga', { id: 'pay_antiga', status: 'PENDING', externalReference: `contaju:${ORG}:a`, value: 1000, dueDate: somarDias(hoje, 3), invoiceUrl: 'https://x/i' });
  const db = cenario();
  const cx = await sv.abrirContexto(db, ORG, segredo);
  const sel = await sv.selecionarParaRobo(cx, { hoje });
  await sv.gerarLote(cx, sel.cobrar.filter(i => i.titulo.id === 'a'), { origem: 'ROBO' });
  assert.equal(chamadas.some(c => c.caminho === '/payments' && c.metodo === 'POST'), false);
  assert.equal(db.tabelas.contaju_asaas_charges[0].asaas_payment_id, 'pay_antiga');
});
await teste('rodar duas vezes não duplica (segunda execução não acha nada a cobrar)', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = cenario();
  const r1 = await sv.rodarRobo(db, ORG, segredo);
  const n1 = db.tabelas.contaju_asaas_charges.length;
  const r2 = await sv.rodarRobo(db, ORG, segredo);
  assert.equal(r1.gerados, 3); // a, b e g (o título de R$ 3,00 é pulado)
  assert.equal(n1, 3);
  assert.equal(db.tabelas.contaju_asaas_charges.length, 3);
  assert.equal(r2.gerados, 0);
  assert.equal(db.tabelas.contaju_asaas_config[0].ultimo_resumo_robo.gerados, 0);
});
await teste('limite por execução: gera só o limite e deixa o resto para o dia seguinte', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = cenario();
  db.tabelas.contaju_asaas_config[0].limite_por_execucao = 2;
  const r = await sv.rodarRobo(db, ORG, segredo);
  assert.equal(r.gerados, 2);
  assert.equal(r.restantes, 2);
  assert.equal(db.tabelas.contaju_asaas_charges.length, 2);
  assert.deepEqual(db.tabelas.contaju_asaas_charges.map(c => c.title_id).sort(), ['a', 'g']); // os 2 mais próximos do vencimento
});
await teste('valor abaixo de R$ 5,00 é pulado com motivo (limite do Asaas)', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = cenario();
  const r = await sv.rodarRobo(db, ORG, segredo);
  assert.ok(r.detalhePulados.some(p => /R\$ 5,00/.test(p.motivo)));
  assert.equal(db.tabelas.contaju_asaas_charges.some(c => c.title_id === 'j'), false);
});
await teste('Asaas fora do ar: o robô para, registra o erro e não cria cobrança pela metade', async () => {
  pagamentos.clear();
  modoForaDoAr = true;
  const db = cenario();
  const r = await sv.rodarRobo(db, ORG, segredo);
  modoForaDoAr = false;
  assert.match(r.erro, /fora do ar/i);
  assert.equal(db.tabelas.contaju_asaas_charges.length, 0);
});

console.log('Duplicidade (títulos idênticos de importação)');
const comGemeos = () => cenario({
  contaju_financial_titles: [titulo('a1', 3, { description: 'Mensalidade Comp. 10/2026' }), titulo('a2', 3, { description: 'Mensalidade Comp. 10/2026' }), titulo('a3', 3, { description: 'Mensalidade Comp. 10/2026' }), titulo('b', 4, { contract_id: 'ct3', description: 'Outro honorário' }), titulo('c1', 5, { contract_id: 'ct3', balance_principal: 700, description: 'Mensalidade Comp. 10/2026' }), titulo('c2', 5, { contract_id: 'ct3', balance_principal: 750, description: 'Mensalidade Comp. 10/2026' })]
});
await teste('robô: grupo de títulos idênticos NÃO é cobrado (nem 1, nem 3); os diferentes seguem normalmente', async () => {
  const cx = await sv.abrirContexto(comGemeos(), ORG, segredo);
  const sel = await sv.selecionarParaRobo(cx, { hoje });
  assert.deepEqual(sel.cobrar.map(i => i.titulo.id).sort(), ['b', 'c1', 'c2']); // valor diferente = não é duplicado
  assert.equal(sel.pulados.filter(p => p.duplicado).length, 3);
  assert.match(sel.pulados[0].motivo, /duplicados/);
});
await teste('robô de ponta a ponta: com 3 títulos iguais não gera nenhum boleto deles', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = comGemeos();
  const r = await sv.rodarRobo(db, ORG, segredo);
  assert.equal(r.gerados, 3);
  assert.equal(db.tabelas.contaju_asaas_charges.some(c => c.title_id.startsWith('a')), false);
  assert.equal(r.pulados, 3);
});
await teste('gerar manual: título que tem gêmeos é recusado com motivo claro; o diferente é gerado', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = comGemeos();
  const r = await ACOES.gerar({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { titleIds: ['a1', 'b'] } });
  assert.deepEqual(r.gerados.map(g => g.titleId), ['b']);
  assert.equal(r.pulados.length, 1);
  assert.match(r.pulados[0].motivo, /duplicados/);
});
await teste('prévia separa duplicados dos demais e conta quantos são', async () => {
  const p = await ACOES.previa({ admin: comGemeos(), env: envSrv, orgId: ORG });
  assert.equal(p.duplicados, 3);
  assert.equal(p.total, 3);
  assert.equal(p.pulados.length, 0);
});

console.log('Ações da tela');
await teste('gerar manual: título vencido sai com novo vencimento (hoje + 3) e a forma escolhida', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = cenario();
  const r = await ACOES.gerar({ admin: db, env: envSrv, ctx: membro, orgId: ORG, body: { titleIds: ['d', 'a'], forma: 'PIX' } });
  assert.equal(r.gerados.length, 2);
  const pagamentosCriados = chamadas.filter(c => c.caminho === '/payments' && c.metodo === 'POST').map(c => c.corpo);
  assert.ok(pagamentosCriados.every(p => p.billingType === 'PIX'));
  assert.equal(pagamentosCriados.find(p => p.externalReference.endsWith(':d')).dueDate, somarDias(hoje, 3));
  assert.equal(pagamentosCriados.find(p => p.externalReference.endsWith(':a')).dueDate, somarDias(hoje, 3));
});
await teste('gerar manual: recusa título pago, a pagar ou inexistente, sem chamar o Asaas', async () => {
  chamadas.length = 0; pagamentos.clear();
  const db = cenario();
  const r = await ACOES.gerar({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { titleIds: ['i', 'h', 'nao-existe'] } });
  assert.equal(r.gerados.length, 0);
  assert.equal(r.pulados.length, 3);
  assert.equal(chamadas.filter(c => c.metodo === 'POST').length, 0);
  await rejeita(ACOES.gerar({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { titleIds: [] } }), /pelo menos um/);
});
await teste('cancelar: só gestor; só cobrança ainda não paga; marca como cancelada', async () => {
  chamadas.length = 0;
  const db = cenario({ contaju_asaas_charges: [{ id: 'c1', org_id: ORG, title_id: 'a', status: 'PENDING', asaas_payment_id: 'pay_1' }, { id: 'c2', org_id: ORG, title_id: 'b', status: 'RECEIVED', asaas_payment_id: 'pay_2' }] });
  await rejeita(ACOES.cancelar({ admin: db, env: envSrv, ctx: membro, orgId: ORG, body: { chargeId: 'c1' } }), /responsável|consultoria/);
  await rejeita(ACOES.cancelar({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { chargeId: 'c2' } }), /ainda não foi paga/);
  await ACOES.cancelar({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { chargeId: 'c1' } });
  assert.equal(db.tabelas.contaju_asaas_charges.find(c => c.id === 'c1').status, 'DELETED');
  assert.ok(chamadas.some(c => c.metodo === 'DELETE' && c.caminho === '/payments/pay_1'));
});
await teste('detalhes: Pix traz QR e código; boleto traz a linha digitável (e guarda)', async () => {
  const db = cenario({ contaju_asaas_charges: [{ id: 'c1', org_id: ORG, title_id: 'a', status: 'PENDING', asaas_payment_id: 'pay_1', billing_type: 'PIX' }, { id: 'c2', org_id: ORG, title_id: 'b', status: 'PENDING', asaas_payment_id: 'pay_2', billing_type: 'BOLETO', identification_field: null }] });
  const a = await ACOES.detalhes({ admin: db, env: envSrv, orgId: ORG, body: { chargeId: 'c1' } });
  assert.equal(a.pix.codigo, '000201pix');
  const b = await ACOES.detalhes({ admin: db, env: envSrv, orgId: ORG, body: { chargeId: 'c2' } });
  assert.equal(b.linhaDigitavel, '34191.79001');
  assert.equal(db.tabelas.contaju_asaas_charges[1].identification_field, '34191.79001');
});
await teste('sincronizar: pega o que o Asaas já sabe (pago, vencido) e manda para a mesma função dos avisos', async () => {
  pagamentos.clear();
  pagamentos.set('pay_1', { id: 'pay_1', status: 'RECEIVED', value: 1000, netValue: 998.01, paymentDate: hoje });
  pagamentos.set('pay_2', { id: 'pay_2', status: 'OVERDUE', value: 1000 });
  const db = cenario({ contaju_asaas_charges: [{ id: 'c1', org_id: ORG, title_id: 'a', status: 'PENDING', asaas_payment_id: 'pay_1', synced_at: null }, { id: 'c2', org_id: ORG, title_id: 'b', status: 'PENDING', asaas_payment_id: 'pay_2', synced_at: null }] });
  const r = await ACOES.sincronizar({ admin: db, env: envSrv, orgId: ORG });
  assert.equal(r.verificadas, 2);
  assert.equal(r.atualizadas, 2);
  const eventos = db.rpcs.filter(x => x.nome === 'contaju_asaas_apply_event').map(x => x.args.event_in.event).sort();
  assert.deepEqual(eventos, ['PAYMENT_OVERDUE', 'PAYMENT_RECEIVED']);
  assert.ok(db.tabelas.contaju_asaas_charges.every(c => c.synced_at));
});

console.log('Imprimir boletos (PDF único)');
const urlPdf = n => `${process.env.ASAAS_API_URL_OVERRIDE}/pdf/${n}`;
await teste('junta os boletos em um PDF só, só os em aberto com PDF', async () => {
  const db = cenario({ contaju_asaas_charges: [
    { id: 'c3', org_id: ORG, status: 'PENDING', billing_type: 'BOLETO', bank_slip_url: urlPdf('terceiro'), due_date: '2026-12-20' },
    { id: 'c1', org_id: ORG, status: 'PENDING', billing_type: 'BOLETO', bank_slip_url: urlPdf('primeiro'), due_date: '2026-12-01' },
    { id: 'c2', org_id: ORG, status: 'OVERDUE', billing_type: 'BOLETO', bank_slip_url: urlPdf('segundo'), due_date: '2026-12-10' },
    { id: 'cp', org_id: ORG, status: 'PENDING', billing_type: 'PIX', bank_slip_url: null, due_date: '2026-12-02' },
    { id: 'cr', org_id: ORG, status: 'RECEIVED', billing_type: 'BOLETO', bank_slip_url: urlPdf('pago'), due_date: '2026-11-01' },
    { id: 'cq', org_id: ORG, status: 'PENDING', billing_type: 'BOLETO', bank_slip_url: urlPdf('quebrado'), due_date: '2026-12-03' }
  ] });
  const r = await ACOES.boletos_pdf({ admin: db, orgId: ORG, body: { chargeIds: ['c3', 'c1', 'c2', 'cp', 'cr', 'cq', 'nao-existe'] } });
  assert.equal(r.incluidos, 3);
  assert.equal(r.paginas, 3);
  assert.equal(r.falhas.length, 4); // pix, pago, html no lugar do pdf, inexistente
  const doc = await PDFDocument.load(Buffer.from(r.pdf, 'base64'));
  assert.equal(doc.getPageCount(), 3);
});
await teste('só baixa PDF de endereço do próprio Asaas (nada de endereços de fora)', async () => {
  const db = cenario({ contaju_asaas_charges: [
    { id: 'x1', org_id: ORG, status: 'PENDING', billing_type: 'BOLETO', bank_slip_url: 'https://site-malicioso.example.com/boleto.pdf', due_date: '2026-12-01' },
    { id: 'x2', org_id: ORG, status: 'PENDING', billing_type: 'BOLETO', bank_slip_url: 'http://sandbox.asaas.com/b/pdf/1', due_date: '2026-12-01' },
    { id: 'x3', org_id: ORG, status: 'PENDING', billing_type: 'BOLETO', bank_slip_url: 'https://asaas.com.evil.example/b.pdf', due_date: '2026-12-01' }
  ] });
  chamadas.length = 0;
  await rejeita(ACOES.boletos_pdf({ admin: db, orgId: ORG, body: { chargeIds: ['x1', 'x2', 'x3'] } }), /nenhum boleto/);
  assert.equal(chamadas.length, 0);
  await rejeita(ACOES.boletos_pdf({ admin: db, orgId: ORG, body: { chargeIds: [] } }), /pelo menos um/);
});
await teste('boleto de outra empresa não entra no PDF', async () => {
  const db = cenario({ contaju_asaas_charges: [{ id: 'o1', org_id: '99999999-9999-4999-8999-999999999999', status: 'PENDING', billing_type: 'BOLETO', bank_slip_url: urlPdf('alheio'), due_date: '2026-12-01' }] });
  await rejeita(ACOES.boletos_pdf({ admin: db, orgId: ORG, body: { chargeIds: ['o1'] } }), /nenhum boleto/);
});

console.log('Configuração');
await teste('só gestor configura', async () => {
  await rejeita(ACOES.salvar_config({ admin: cenario(), env: envSrv, ctx: membro, orgId: ORG, body: { config: {} } }), /responsável|consultoria/);
});
await teste('chave recusada pelo Asaas não é guardada', async () => {
  const db = cenario({ contaju_asaas_credentials: [] });
  await rejeita(ACOES.salvar_config({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { config: { chave: 'chave-ruim-0000000000000' } } }), /não aceitou esta chave/);
  assert.equal(db.tabelas.contaju_asaas_credentials.length, 0);
});
await teste('chave boa é guardada CIFRADA (nunca em texto puro) e dá para abrir de volta', async () => {
  const db = cenario({ contaju_asaas_credentials: [], contaju_asaas_config: [] });
  await ACOES.salvar_config({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { config: { chave: 'chave-nova-de-teste-000000000', bankAccountId: 'b1', ativo: true } } });
  const guardado = db.tabelas.contaju_asaas_credentials[0].api_key_cifrada;
  assert.ok(!guardado.includes('chave-nova'));
  assert.equal(decifrar(guardado, segredo).toString('utf8'), 'chave-nova-de-teste-000000000');
  const cfg = db.tabelas.contaju_asaas_config[0];
  assert.equal(cfg.ambiente, 'sandbox'); // padrão seguro
  assert.equal(cfg.ativo, true);
  assert.equal(cfg.robo_ativo, false); // robô nunca liga sozinho
});
await teste('produção exige confirmação; trocar de ambiente exige a chave do novo ambiente', async () => {
  const db = cenario();
  await rejeita(ACOES.salvar_config({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { config: { ambiente: 'producao', chave: 'chave-prod-de-teste-000000000' } } }), /Confirme que quer usar o Asaas de verdade/);
  await rejeita(ACOES.salvar_config({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { config: { ambiente: 'producao', confirmarProducao: true } } }), /informe também a chave/);
  assert.equal(db.tabelas.contaju_asaas_config[0].ambiente, 'sandbox');
});
await teste('ativar sem conta bancária é recusado; valores fora da faixa também', async () => {
  const db = cenario();
  db.tabelas.contaju_asaas_config[0].bank_account_id = null;
  await rejeita(ACOES.salvar_config({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { config: { ativo: true } } }), /conta bancária/);
  await rejeita(ACOES.salvar_config({ admin: cenario(), env: envSrv, ctx: dono, orgId: ORG, body: { config: { antecedenciaDias: 90 } } }), /entre 1 e 60/);
  await rejeita(ACOES.salvar_config({ admin: cenario(), env: envSrv, ctx: dono, orgId: ORG, body: { config: { multaPercentual: '50' } } }), /entre 0 e 20/);
  await rejeita(ACOES.salvar_config({ admin: cenario(), env: envSrv, ctx: dono, orgId: ORG, body: { config: { bankAccountId: 'conta-de-outra-empresa' } } }), /não encontrada/);
});
await teste('salvar só a chave NÃO desliga o robô nem mexe no resto (campos ausentes ficam como estão)', async () => {
  const db = cenario();
  await ACOES.salvar_config({ admin: db, env: envSrv, ctx: dono, orgId: ORG, body: { config: { chave: 'chave-trocada-0000000000000' } } });
  const cfg = db.tabelas.contaju_asaas_config[0];
  assert.equal(cfg.robo_ativo, true);
  assert.equal(cfg.ativo, true);
  assert.equal(cfg.antecedencia_dias, 10);
  assert.equal(cfg.importar_assinaturas_crm, true);
});
await teste('status nunca devolve chave nem o segredo do webhook', async () => {
  const db = cenario();
  db.tabelas.contaju_asaas_config[0].webhook_token_hash = 'hash-secreto';
  const s = await ACOES.status({ admin: db, ctx: dono, orgId: ORG, req });
  const texto = JSON.stringify(s);
  assert.ok(!texto.includes('hash-secreto') && !texto.includes('chave-boa') && !texto.includes('api_key'));
  assert.equal(s.temChave, true);
  assert.equal(s.webhookUrl, `https://financeiro.exemplo.com/api/asaas-webhook?org=${ORG}`);
});
await teste('ativar avisos: exige e-mail válido (o Asaas exige); cria com token novo e guarda só o hash; sem endereço público é recusado', async () => {
  chamadas.length = 0;
  const db = cenario();
  await rejeita(ACOES.ativar_avisos({ admin: db, env: envSrv, ctx: dono, orgId: ORG, req, body: {} }), /e-mail válido/);
  await rejeita(ACOES.ativar_avisos({ admin: db, env: envSrv, ctx: dono, orgId: ORG, req, body: { email: 'sem-arroba' } }), /e-mail válido/);
  assert.equal(chamadas.filter(c => c.caminho === '/webhooks').length, 0);
  const r = await ACOES.ativar_avisos({ admin: db, env: envSrv, ctx: dono, orgId: ORG, req, body: { email: 'responsavel@empresa.com' } });
  assert.equal(r.ok, true);
  const wh = chamadas.find(c => c.caminho === '/webhooks').corpo;
  assert.equal(wh.url, `https://financeiro.exemplo.com/api/asaas-webhook?org=${ORG}`);
  assert.equal(wh.email, 'responsavel@empresa.com');
  assert.ok(wh.authToken.length >= 32);
  assert.ok(wh.events.includes('PAYMENT_RECEIVED'));
  assert.equal(db.tabelas.contaju_asaas_config[0].webhook_token_hash, createHash('sha256').update(wh.authToken).digest('hex'));
  assert.ok(!JSON.stringify(r).includes(wh.authToken));
  await rejeita(ACOES.ativar_avisos({ admin: db, env: envSrv, ctx: dono, orgId: ORG, req: { headers: {} }, body: { email: 'responsavel@empresa.com' } }), /endereço público/);
});

console.log('Webhook (banco simulado por HTTP)');
// Banco REST de mentira só com o que o webhook usa
const restChamadas = [];
let restConfig = { ativo: true, webhook_token_hash: createHash('sha256').update('token-certo').digest('hex'), importar_assinaturas_crm: true };
const rest = http.createServer((rq, rs) => {
  let c = ''; rq.on('data', d => (c += d));
  rq.on('end', () => {
    const u = new URL(rq.url, 'http://x');
    const r = (s, d) => { rs.writeHead(s, { 'content-type': 'application/json' }); rs.end(JSON.stringify(d)); };
    if (u.pathname === '/rest/v1/contaju_asaas_config') return r(200, restConfig);
    if (u.pathname === '/rest/v1/contaju_asaas_credentials') return r(200, { api_key_cifrada: sv.cifrarChave('chave-boa-de-teste-0000000000', segredo) });
    if (u.pathname === '/rest/v1/rpc/contaju_asaas_apply_event') { restChamadas.push(JSON.parse(c)); return r(200, { status: 'processed' }); }
    r(404, { message: 'x' });
  });
});
await new Promise(ok => rest.listen(0, '127.0.0.1', ok));
process.env.SUPABASE_URL = `http://127.0.0.1:${rest.address().port}`;
const resFalsa = () => ({ cab: {}, setHeader(k, v) { this.cab[k] = v; }, status(c) { this.codigo = c; return this; }, json(d) { this.corpo = d; return this; } });
const evento = (extra = {}) => ({ id: `ev_${Math.random()}`, event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED', value: 1000, description: 'Honorários' }, ...extra });
const post = (cab, body, query = { org: ORG }) => ({ method: 'POST', headers: cab, body, query });

await teste('sem token, token errado ou empresa inexistente: 401 igual (não revela nada)', async () => {
  for (const cab of [{}, { 'asaas-access-token': 'errado' }]) { const r = resFalsa(); await webhook(post(cab, evento()), r); assert.equal(r.codigo, 401); }
  const r = resFalsa(); await webhook(post({ 'asaas-access-token': 'token-certo' }, evento(), { org: 'nao-e-uuid' }), r); assert.equal(r.codigo, 400);
});
await teste('token certo: aviso vai para a função do banco da empresa certa', async () => {
  restChamadas.length = 0;
  const r = resFalsa(); await webhook(post({ 'asaas-access-token': 'token-certo' }, evento()), r);
  assert.equal(r.codigo, 200);
  assert.equal(restChamadas.length, 1);
  assert.equal(restChamadas[0].p_org, ORG);
  assert.equal(restChamadas[0].event_in.payment.id, 'pay_1');
});
await teste('assinatura do CRM Varejo: busca o cliente no Asaas e manda junto', async () => {
  restChamadas.length = 0; chamadas.length = 0;
  const r = resFalsa(); await webhook(post({ 'asaas-access-token': 'token-certo' }, evento({ payment: { id: 'pay_crm', status: 'RECEIVED', value: 149.9, description: 'CRM Varejo - mensalidade', customer: 'cus_crm' } })), r);
  assert.equal(r.codigo, 200);
  assert.equal(restChamadas[0].customer_in.name, 'Loja da Maria');
  assert.ok(chamadas.some(c => c.caminho === '/customers/cus_crm'));
});
await teste('pagamento de outro produto: não busca nada, só passa adiante (o banco ignora)', async () => {
  restChamadas.length = 0; chamadas.length = 0;
  const r = resFalsa(); await webhook(post({ 'asaas-access-token': 'token-certo' }, evento({ payment: { id: 'pay_outro', status: 'RECEIVED', value: 50, description: 'Plano outro sistema', customer: 'cus_z' } })), r);
  assert.equal(r.codigo, 200);
  assert.equal(chamadas.length, 0);
  assert.equal(restChamadas[0].customer_in, null);
});
await teste('conexão desligada: responde 200 e ignora; corpo inválido: 400', async () => {
  restConfig = { ...restConfig, ativo: false };
  restChamadas.length = 0;
  let r = resFalsa(); await webhook(post({ 'asaas-access-token': 'token-certo' }, evento()), r);
  assert.equal(r.codigo, 200);
  assert.equal(restChamadas.length, 0);
  restConfig = { ...restConfig, ativo: true };
  r = resFalsa(); await webhook(post({ 'asaas-access-token': 'token-certo' }, { sem: 'id' }), r);
  assert.equal(r.codigo, 400);
});

console.log('Cron');
await teste('sem o segredo do cron: 401; método e cabeçalho errados também', async () => {
  delete process.env.CRON_SECRET;
  let r = resFalsa(); await cron({ method: 'GET', headers: { authorization: 'Bearer x' } }, r); assert.equal(r.codigo, 401);
  process.env.CRON_SECRET = 'segredo-do-cron-de-teste-123456';
  r = resFalsa(); await cron({ method: 'GET', headers: {} }, r); assert.equal(r.codigo, 401);
  r = resFalsa(); await cron({ method: 'GET', headers: { authorization: 'Bearer errado' } }, r); assert.equal(r.codigo, 401);
});

mock.close(); rest.close();
console.log(process.exitCode ? '\nHá falhas.' : `\nTudo certo: ${ok} verificações.`);
