// Emite NOTAS DE TESTE no ambiente de testes do Portal Nacional (produção restrita), usando o mesmo
// código do servidor e o certificado guardado. Sem valor fiscal. Recusa rodar se o ambiente não for "testes".
//   node scripts/test-nfse-portal.mjs core|cst|tpret|ret|todos
// Cada nota sai com a descrição "TESTE AUTOMATIZADO ..." para ser fácil de identificar na lista.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { __acoesParaTeste as acoes } from '../api/nfse.js';
import { CST_PIS_COFINS, TIPO_RETENCAO_PIS_COFINS } from '../src/data/nfseTabelas.ts';

const ler = f => Object.fromEntries(fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
const local = ler('.env.local'); const base = ler('.env');
const env = { url: base.VITE_SUPABASE_URL, anon: base.VITE_SUPABASE_ANON_KEY, service: local.SUPABASE_SERVICE_ROLE_KEY, segredo: local.NFSE_CERT_SECRET, algoritmo: local.NFSE_SIGN_ALG === 'sha256' ? 'sha256' : 'sha1' };
const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });

const ORG = '4aa60bef-d3b8-41fc-917c-f49b3117417f';
const ctx = { consultor: true, usuario: { id: null, email: 'teste', user_metadata: { name: 'Teste automatizado' } } };
const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

const { data: cfg } = await admin.from('contaju_nfse_config').select('ambiente').eq('org_id', ORG).single();
if (cfg.ambiente !== 2) { console.error('ABORTADO: a empresa não está no ambiente de testes.'); process.exit(1); }

// Endereço genérico de teste (CEP geral e código IBGE de Iturama/MG, o município da empresa de teste).
const ENDERECO = { cep: '38280000', codigoMunicipio: '3134400', logradouro: 'RUA DE TESTE', numero: '1', complemento: '', bairro: 'CENTRO' };

// Tomador dos testes: o mesmo da última nota autorizada no ambiente de testes (nenhum dado de cliente fica no código).
const { data: ultima } = await admin.from('contaju_nfse_notes').select('tomador_nome, tomador_documento').eq('org_id', ORG).eq('ambiente', 2).eq('status', 'AUTORIZADA').order('created_at', { ascending: false }).limit(1).single();
if (!ultima) { console.error('ABORTADO: não há nota de teste autorizada para copiar o tomador. Emita uma pela tela no ambiente de testes.'); process.exit(1); }

const BASE = {
  customerId: null, saleId: null,
  tomadorNome: ultima.tomador_nome, tomadorDocumento: ultima.tomador_documento, tomadorEmail: '', tomadorTelefone: '',
  descricao: 'TESTE AUTOMATIZADO', informacoesComplementares: '', docRef: '', idDocTec: '',
  cTribNac: '171901', cNbs: '113022100', valorServico: 100, competencia: hoje,
  tomadorEndereco: ENDERECO,
  issRetido: false, aliquotaIss: '', pisCofinsCst: '', pisCofinsTpRet: '', retIrrf: 0, retCsll: 0, retCp: 0
};

async function emitir(nome, extra) {
  const nota = { ...BASE, ...extra, descricao: `TESTE AUTOMATIZADO - ${nome}` };
  try {
    const r = await acoes.emitir({ admin, env, ctx, orgId: ORG, body: { idempotencyKey: crypto.randomUUID(), nota } });
    const n = r.nota;
    return { nome, status: n.status, nfse: n.numero_nfse, msg: (n.mensagem || '').replace(/\s+/g, ' ').slice(0, 200) };
  } catch (e) {
    return { nome, status: 'ERRO-LOCAL', nfse: '-', msg: String(e.message).slice(0, 200) };
  }
}
const mostrar = r => console.log(`${r.status.padEnd(11)} | ${String(r.nfse || '-').padEnd(4)} | ${r.nome}${r.msg ? '\n              -> ' + r.msg : ''}`);

const grupos = {
  core: [
    ['sem nada extra (controle)', {}],
    ['ISS retido SEM endereco (deve ser barrado localmente)', { issRetido: true }],
    ['ISS retido, com endereco, SEM aliquota (deve ser barrado localmente)', { issRetido: true, tomadorEndereco: ENDERECO }],
    ['aliquota ISS 2,00 sem retencao (deve ser barrado localmente)', { aliquotaIss: '2' }],
    ['ISS retido + aliquota 2,00', { issRetido: true, aliquotaIss: '2', tomadorEndereco: ENDERECO }],
    ['endereco do tomador informado sem retencao', { tomadorEndereco: ENDERECO }],
    ['informacoes complementares', { informacoesComplementares: 'Referente ao contrato 7/2026, teste de informacoes complementares' }],
    ['documento de referencia', { docRef: 'Contrato 7/2026' }],
    ['responsabilidade tecnica (ART)', { idDocTec: 'ART 1234567' }],
    ['3 informacoes complementares juntas', { informacoesComplementares: 'Info extra', docRef: 'Contrato 7/2026', idDocTec: 'ART 1234567' }],
    ['texto com aspas e travessao bonitos', { informacoesComplementares: 'Ref. “10/2026” — serviço prestado…' }],
    ['PIS/COFINS CST 00 (Nenhum)', { pisCofinsCst: '00' }],
    ['IRRF retido R$ 1,50', { retIrrf: 1.5 }],
    ['contribuicoes sociais retidas R$ 1,00', { retCsll: 1 }],
    ['contribuicao previdenciaria retida R$ 2,00', { retCp: 2 }],
    ['3 retencoes juntas', { retIrrf: 1.5, retCsll: 1, retCp: 2 }],
    ['TUDO: ISS retido + info + CST 00 + retencao tipo 3 + 3 retencoes', { issRetido: true, aliquotaIss: '2', tomadorEndereco: ENDERECO, informacoesComplementares: 'Info extra', docRef: 'Contrato 7/2026', idDocTec: 'ART 1234567', pisCofinsCst: '00', pisCofinsTpRet: '3', retIrrf: 1.5, retCsll: 1, retCp: 2 }]
  ],
  tudo: [
    ['TUDO (ISS retido + aliquota + endereco + info + CST 01 + retencao 3 + IRRF + CSLL + CP)', { issRetido: true, aliquotaIss: '2', tomadorEndereco: ENDERECO, informacoesComplementares: 'Info extra', docRef: 'Contrato 7/2026', idDocTec: 'ART 1234567', pisCofinsCst: '01', pisCofinsTpRet: '3', retIrrf: 1.5, retCsll: 1, retCp: 2 }],
    ['TUDO com valor alto (R$ 12.345,67) e retencoes proporcionais', { valorServico: 12345.67, issRetido: true, aliquotaIss: '2', tomadorEndereco: ENDERECO, pisCofinsCst: '49', pisCofinsTpRet: '4', retIrrf: 185.18, retCsll: 123.46, retCp: 1358.02 }]
  ],
  // Testa a troca automática de leiaute: força o formato ANTIGO no ambiente de testes (que exige o novo).
  layout: [['leiaute antigo forcado: o sistema deve refazer no novo e ser autorizado', {}]],
  cst: CST_PIS_COFINS.map(([c, d]) => [`CST ${c} - ${d.slice(0, 40)}`, { pisCofinsCst: c }]),
  tpret: [...TIPO_RETENCAO_PIS_COFINS, ['2', 'PIS/COFINS Não Retidos']].sort((a, b) => a[0] - b[0]).map(([c, d]) => [`tipo retencao ${c} - ${d} (CST 00)`, { pisCofinsCst: '00', pisCofinsTpRet: c, retCsll: ['0', '2'].includes(c) ? 0 : 1 }])
};

const alvo = process.argv[2] || 'core';
if (alvo === 'layout') process.env.NFSE_LAYOUT_INICIAL = 'antigo';
const lista = alvo === 'todos' ? [...grupos.core, ...grupos.cst, ...grupos.tpret] : (grupos[alvo] || []);
let ok = 0;
for (const [nome, extra] of lista) {
  const r = await emitir(nome, extra);
  if (r.status === 'AUTORIZADA') ok++;
  mostrar(r);
}
console.log(`\n${ok}/${lista.length} notas autorizadas pelo portal.`);
