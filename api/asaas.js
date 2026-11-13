// ==============================================================================
// VERCEL SERVERLESS FUNCTION: cobrança de honorários pelo Asaas (boleto e Pix)
// Rota: POST /api/asaas   corpo: { action, orgId, ... }   cabeçalho: Authorization: Bearer <sessão>
//
// Ações: status | salvar_config | testar | ativar_avisos | previa | gerar | detalhes | cancelar | sincronizar | rodar_agora
//
// Segurança (mesmo desenho de /api/nfse):
//   * Toda chamada exige a sessão do usuário e o banco confere o acesso à empresa (contaju_can_access_org).
//   * Configurar, ativar avisos, cancelar e rodar o robô: só o responsável (OWNER) da empresa ou a consultoria.
//   * A chave do Asaas é cifrada (AES-256-GCM) e nunca volta ao navegador nem aos logs.
//   * Este servidor NÃO dá baixa em título: quem baixa é o próprio sistema, no navegador.
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, e NFSE_CERT_SECRET (ou ASAAS_KEY_SECRET)
//   para cifrar a chave; APP_BASE_URL (opcional, endereço público para o webhook).
// ==============================================================================
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { asaas, baseDoAmbiente, GatewayError, hojeBrasil, somarDias } from './_asaas/gateway.js';
import {
  ApiError, abrirContexto, carregarConfig, cifrarChave, COLUNAS_TITULO,
  gerarLote, rodarRobo, segredoDeCifra, selecionarParaRobo, sincronizarAbertas
} from './_asaas/servico.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTOS_WEBHOOK = [
  'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED',
  'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_REFUND_IN_PROGRESS', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_RISK_ANALYSIS', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS'
];

function ambienteServidor() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const segredo = segredoDeCifra();
  const faltando = [];
  if (!url) faltando.push('SUPABASE_URL');
  if (!anon) faltando.push('SUPABASE_ANON_KEY');
  if (!service) faltando.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!segredo) faltando.push('NFSE_CERT_SECRET');
  return { url, anon, service, segredo, faltando };
}

async function autenticar(req, env, orgId) {
  const cab = String(req.headers.authorization || req.headers.Authorization || '');
  const token = cab.startsWith('Bearer ') ? cab.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'Sessão expirada. Entre de novo no sistema.');
  if (!UUID.test(String(orgId || ''))) throw new ApiError(400, 'Empresa não informada.');
  const comoUsuario = createClient(env.url, env.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: sessao, error } = await comoUsuario.auth.getUser(token);
  if (error || !sessao?.user) throw new ApiError(401, 'Sessão expirada. Entre de novo no sistema.');
  const { data: pode, error: erroAcesso } = await comoUsuario.rpc('contaju_can_access_org', { p_org: orgId });
  if (erroAcesso) throw new ApiError(500, 'Não foi possível conferir o acesso à empresa.');
  if (pode !== true) throw new ApiError(403, 'Você não tem acesso a esta empresa.');
  const { data: consultor } = await comoUsuario.rpc('contaju_is_consultant');
  return { usuario: sessao.user, consultor: consultor === true };
}

async function ehGestor(admin, ctx, orgId) {
  if (ctx.consultor) return true;
  const { data } = await admin.from('contaju_memberships').select('role').eq('org_id', orgId).eq('user_id', ctx.usuario.id).maybeSingle();
  return data?.role === 'OWNER';
}
async function exigirGestor(admin, ctx, orgId) {
  if (!(await ehGestor(admin, ctx, orgId))) throw new ApiError(403, 'Só o responsável pela empresa ou a consultoria pode fazer isso.', 'SO_GESTOR');
}

const nomeUsuario = u => String(u.user_metadata?.name || u.user_metadata?.full_name || u.email || '').slice(0, 80);
const linkWebhook = (req, orgId) => {
  const base = (process.env.APP_BASE_URL || '').replace(/\/$/, '') || (req.headers['x-forwarded-host'] ? `https://${req.headers['x-forwarded-host']}` : '');
  return base ? `${base}/api/asaas-webhook?org=${orgId}` : null;
};
const sha = v => createHash('sha256').update(String(v)).digest('hex');

// ------------------------------------------------------------------------------
async function acaoStatus({ admin, ctx, orgId, req }) {
  const config = await carregarConfig(admin, orgId).catch(e => {
    if (e.codigo === 'BANCO_PENDENTE') return 'PENDENTE';
    throw e;
  });
  if (config === 'PENDENTE') return { servidorPronto: true, bancoPronto: false, config: null, podeGerenciar: false };
  const { data: chave } = await admin.from('contaju_asaas_credentials').select('org_id').eq('org_id', orgId).maybeSingle();
  const { webhook_token_hash: _oculto, ...publica } = config || {};
  return {
    servidorPronto: true, bancoPronto: true,
    config: config ? publica : null,
    temChave: Boolean(chave),
    webhookUrl: linkWebhook(req, orgId),
    podeGerenciar: await ehGestor(admin, ctx, orgId)
  };
}

async function acaoSalvarConfig({ admin, env, ctx, orgId, body }) {
  await exigirGestor(admin, ctx, orgId);
  const atual = await carregarConfig(admin, orgId);
  const c = body.config || {};
  const erro = (m, codigo) => { throw new ApiError(422, m, codigo); };

  // Campos que não vieram ficam como estão (assim dá para salvar só a chave sem desligar o resto)
  const ambiente = (c.ambiente ?? atual?.ambiente ?? 'sandbox') === 'producao' ? 'producao' : 'sandbox';
  const antecedencia = Math.round(Number(c.antecedenciaDias ?? atual?.antecedencia_dias ?? 10));
  if (!(antecedencia >= 1 && antecedencia <= 60)) erro('A antecedência precisa ficar entre 1 e 60 dias.');
  const limite = Math.round(Number(c.limitePorExecucao ?? atual?.limite_por_execucao ?? 30));
  if (!(limite >= 1 && limite <= 200)) erro('O limite por execução precisa ficar entre 1 e 200 cobranças.');
  const pct = (v, nome) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 20) erro(`${nome}: informe um percentual entre 0 e 20.`);
    return Math.round(n * 100) / 100;
  };
  const multa = c.multaPercentual === undefined ? (atual?.multa_percentual ?? null) : pct(c.multaPercentual, 'Multa');
  const juros = c.jurosMensalPercentual === undefined ? (atual?.juros_mensal_percentual ?? null) : pct(c.jurosMensalPercentual, 'Juros');

  const chaveNova = String(c.chave || '').trim();
  const trocouAmbiente = atual && atual.ambiente !== ambiente;
  if (ambiente === 'producao' && (!atual || atual.ambiente !== 'producao') && c.confirmarProducao !== true) {
    erro('Confirme que quer usar o Asaas de verdade (produção). Boletos e Pix passam a valer.', 'CONFIRMAR_PRODUCAO');
  }
  if (trocouAmbiente && !chaveNova) erro('Ao trocar o ambiente, informe também a chave correspondente (a de testes só funciona em testes).', 'CHAVE_DO_AMBIENTE');

  if (chaveNova) {
    if (chaveNova.length < 20 || /\s/.test(chaveNova)) erro('A chave do Asaas parece incompleta. Copie de novo em Integrações do Asaas.');
    try {
      await asaas({ base: baseDoAmbiente(ambiente), chave: chaveNova }, '/finance/balance');
    } catch (e) {
      if (e instanceof GatewayError && e.recusado) erro(`O Asaas não aceitou esta chave no ambiente de ${ambiente === 'producao' ? 'produção' : 'testes'}. Confira se a chave é deste ambiente.`, 'CHAVE_INVALIDA');
      throw e;
    }
    const { error } = await admin.from('contaju_asaas_credentials').upsert({ org_id: orgId, api_key_cifrada: cifrarChave(chaveNova, env.segredo), created_by: ctx.usuario.id, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
    if (error) throw new ApiError(500, 'Não foi possível guardar a chave do Asaas.');
  }
  const { data: temChave } = await admin.from('contaju_asaas_credentials').select('org_id').eq('org_id', orgId).maybeSingle();

  const conferir = async (tabela, id, rotulo, extra) => {
    if (!id) return null;
    let q = admin.from(tabela).select('id').eq('org_id', orgId).eq('id', String(id));
    if (extra) q = extra(q);
    const { data } = await q.maybeSingle();
    if (!data) erro(`${rotulo} não encontrada.`);
    return String(id);
  };
  const bankAccountId = c.bankAccountId === undefined ? (atual?.bank_account_id ?? null) : await conferir('contaju_bank_accounts', c.bankAccountId, 'A conta bancária');
  const receitaContaId = c.receitaContaId === undefined ? (atual?.receita_conta_id ?? null) : await conferir('contaju_chart_of_accounts', c.receitaContaId, 'A conta de receita', q => q.eq('is_analytical', true));

  const ativo = (c.ativo ?? atual?.ativo ?? false) === true;
  if (ativo && !temChave) erro('Informe a chave do Asaas antes de ativar.');
  if (ativo && !bankAccountId) erro('Escolha a conta bancária onde o Asaas deposita. É nela que as baixas entram.');
  const roboAtivo = ativo && (c.roboAtivo ?? atual?.robo_ativo ?? false) === true;
  const importar = ativo && (c.importarAssinaturasCrm ?? atual?.importar_assinaturas_crm ?? false) === true;
  if (importar && !receitaContaId) erro('Para lançar as assinaturas do CRM Varejo, escolha a conta de receita delas.');

  const linha = {
    org_id: orgId, ambiente, ativo, robo_ativo: roboAtivo, antecedencia_dias: antecedencia, limite_por_execucao: limite,
    bank_account_id: bankAccountId, receita_conta_id: receitaContaId, importar_assinaturas_crm: importar,
    notificar_cliente: (c.notificarCliente ?? atual?.notificar_cliente ?? false) === true, multa_percentual: multa, juros_mensal_percentual: juros,
    updated_by: ctx.usuario.id, updated_at: new Date().toISOString()
  };
  const { error } = await admin.from('contaju_asaas_config').upsert(linha, { onConflict: 'org_id' });
  if (error) throw new ApiError(500, 'Não foi possível salvar a configuração.');
  return { ok: true };
}

async function acaoTestar({ admin, env, ctx, orgId }) {
  await exigirGestor(admin, ctx, orgId);
  const cx = await abrirContexto(admin, orgId, env.segredo, { exigirAtivo: false });
  await asaas(cx, '/finance/balance');
  return { ok: true, ambiente: cx.config.ambiente };
}

async function acaoAtivarAvisos({ admin, env, ctx, orgId, req }) {
  await exigirGestor(admin, ctx, orgId);
  const cx = await abrirContexto(admin, orgId, env.segredo);
  const url = linkWebhook(req, orgId);
  if (!url || /localhost|127\.0\.0\.1/.test(url)) {
    throw new ApiError(409, 'Os avisos automáticos só podem ser ativados no site publicado (o Asaas precisa de um endereço público).', 'SEM_ENDERECO_PUBLICO');
  }
  const token = randomBytes(32).toString('hex');
  try {
    await asaas(cx, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({ name: 'Financeiro Contaju', url, enabled: true, interrupted: false, apiVersion: 3, authToken: token, sendType: 'SEQUENTIALLY', events: EVENTOS_WEBHOOK })
    });
  } catch (e) {
    if (e instanceof GatewayError && e.recusado) {
      // O Asaas não aceitou criar sozinho: guarda o segredo e mostra uma vez para a pessoa cadastrar à mão.
      await admin.from('contaju_asaas_config').update({ webhook_token_hash: sha(token), webhook_ativado_em: null }).eq('org_id', orgId);
      return { ok: false, manual: true, url, token, motivo: e.detalhe || 'O Asaas não permitiu criar o aviso automaticamente.' };
    }
    throw e;
  }
  await admin.from('contaju_asaas_config').update({ webhook_token_hash: sha(token), webhook_ativado_em: new Date().toISOString() }).eq('org_id', orgId);
  return { ok: true };
}

async function acaoPrevia({ admin, env, orgId }) {
  const cx = await abrirContexto(admin, orgId, env.segredo, { exigirAtivo: false });
  const sel = await selecionarParaRobo(cx);
  const cabe = Math.min(sel.cobrar.length, cx.config.limite_por_execucao);
  return {
    ate: sel.ate, total: sel.cobrar.length, cabeNaProximaExecucao: cabe,
    itens: sel.cobrar.slice(0, 100).map(i => ({ titleId: i.titulo.id, titulo: i.titulo.title_number, descricao: i.titulo.description, cliente: i.parte.name, vencimento: i.titulo.due_date, valor: Number(i.titulo.balance_principal), forma: i.forma })),
    pulados: sel.pulados.slice(0, 100)
  };
}

async function acaoGerar({ admin, env, ctx, orgId, body }) {
  const cx = await abrirContexto(admin, orgId, env.segredo);
  const ids = [...new Set((Array.isArray(body.titleIds) ? body.titleIds : []).map(String))].slice(0, 25);
  if (!ids.length) throw new ApiError(422, 'Escolha pelo menos um título.');
  const hoje = hojeBrasil();
  const { data: titulos } = await admin.from('contaju_financial_titles').select(COLUNAS_TITULO + ', type, document_state, settlement_state')
    .eq('org_id', orgId).in('id', ids);
  const porId = new Map((titulos || []).map(t => [t.id, t]));
  const contratos = [...new Set((titulos || []).map(t => t.contract_id).filter(Boolean))];
  const { data: ctrs } = contratos.length ? await admin.from('contaju_contracts').select('id, billing_method').eq('org_id', orgId).in('id', contratos) : { data: [] };
  const formaContrato = new Map((ctrs || []).map(c => [c.id, c.billing_method]));
  const partesIds = [...new Set((titulos || []).map(t => t.counterparty_id).filter(Boolean))];
  const { data: partes } = partesIds.length ? await admin.from('contaju_counterparties').select('id, name, document, email, phone').eq('org_id', orgId).in('id', partesIds) : { data: [] };
  const porParte = new Map((partes || []).map(p => [p.id, p]));

  const forcada = body.forma === 'PIX' ? 'PIX' : body.forma === 'BOLETO' ? 'BOLETO' : null;
  const itens = [];
  const pulados = [];
  for (const id of ids) {
    const t = porId.get(id);
    if (!t) { pulados.push({ titleId: id, motivo: 'Título não encontrado.' }); continue; }
    if (t.type !== 'RECEBER' || t.document_state !== 'CONFIRMADO' || !['ABERTO', 'PARCIAL'].includes(t.settlement_state)) {
      pulados.push({ titleId: id, titulo: t.title_number, motivo: 'Só dá para cobrar título a receber confirmado e ainda em aberto.' });
      continue;
    }
    const parte = porParte.get(t.counterparty_id);
    if (!parte) { pulados.push({ titleId: id, titulo: t.title_number, motivo: 'Título sem cliente.' }); continue; }
    const f = forcada || (formaContrato.get(t.contract_id) === 'PIX' ? 'PIX' : 'BOLETO');
    // Título já vencido: a cobrança sai com um novo vencimento (o Asaas não aceita data no passado)
    const venc = t.due_date >= hoje ? t.due_date : (/^\d{4}-\d{2}-\d{2}$/.test(String(body.vencimento || '')) && body.vencimento >= hoje ? body.vencimento : somarDias(hoje, 3));
    itens.push({ titulo: t, parte, forma: f, vencimento: venc });
  }
  const r = await gerarLote(cx, itens, { origem: 'MANUAL', usuario: nomeUsuario(ctx.usuario), ateMs: Date.now() + 45_000 });
  return { gerados: r.gerados, pulados: [...pulados, ...r.pulados], restantes: r.restantes };
}

async function acaoDetalhes({ admin, env, orgId, body }) {
  const cx = await abrirContexto(admin, orgId, env.segredo, { exigirAtivo: false });
  const { data: c } = await admin.from('contaju_asaas_charges').select('*').eq('org_id', orgId).eq('id', String(body.chargeId || '')).maybeSingle();
  if (!c) throw new ApiError(404, 'Cobrança não encontrada.');
  let pix = null;
  let linha = c.identification_field || null;
  try {
    if (c.billing_type === 'PIX' && ['PENDING', 'OVERDUE'].includes(c.status)) {
      const qr = await asaas(cx, `/payments/${encodeURIComponent(c.asaas_payment_id)}/pixQrCode`);
      if (typeof qr.encodedImage === 'string' && typeof qr.payload === 'string') pix = { imagem: qr.encodedImage, codigo: qr.payload };
    } else if (c.billing_type !== 'PIX' && !linha && ['PENDING', 'OVERDUE'].includes(c.status)) {
      const r = await asaas(cx, `/payments/${encodeURIComponent(c.asaas_payment_id)}/identificationField`);
      if (typeof r.identificationField === 'string') {
        linha = r.identificationField;
        await admin.from('contaju_asaas_charges').update({ identification_field: linha }).eq('id', c.id);
      }
    }
  } catch (e) {
    if (e instanceof GatewayError && !e.recusado) throw e;
  }
  return { pix, linhaDigitavel: linha, linkFatura: c.invoice_url, linkBoleto: c.bank_slip_url };
}

async function acaoCancelar({ admin, env, ctx, orgId, body }) {
  await exigirGestor(admin, ctx, orgId);
  const cx = await abrirContexto(admin, orgId, env.segredo, { exigirAtivo: false });
  const { data: c } = await admin.from('contaju_asaas_charges').select('id, asaas_payment_id, status').eq('org_id', orgId).eq('id', String(body.chargeId || '')).maybeSingle();
  if (!c) throw new ApiError(404, 'Cobrança não encontrada.');
  if (!['PENDING', 'OVERDUE'].includes(c.status)) throw new ApiError(409, 'Só dá para cancelar uma cobrança que ainda não foi paga.', 'JA_PAGA');
  try {
    await asaas(cx, `/payments/${encodeURIComponent(c.asaas_payment_id)}`, { method: 'DELETE' });
  } catch (e) {
    if (!(e instanceof GatewayError && e.recusado)) throw e;
    // Já não existe mais no Asaas: segue e marca como cancelada aqui também
  }
  await admin.from('contaju_asaas_charges').update({ status: 'DELETED', updated_at: new Date().toISOString() }).eq('id', c.id);
  return { ok: true };
}

async function acaoSincronizar({ admin, env, orgId }) {
  const cx = await abrirContexto(admin, orgId, env.segredo, { exigirAtivo: false });
  return sincronizarAbertas(cx, { limite: 80, ateMs: Date.now() + 40_000 });
}

async function acaoRodarAgora({ admin, env, ctx, orgId }) {
  await exigirGestor(admin, ctx, orgId);
  return rodarRobo(admin, orgId, env.segredo, { ateMs: Date.now() + 45_000 });
}

const ACOES = {
  status: acaoStatus, salvar_config: acaoSalvarConfig, testar: acaoTestar, ativar_avisos: acaoAtivarAvisos, previa: acaoPrevia,
  gerar: acaoGerar, detalhes: acaoDetalhes, cancelar: acaoCancelar, sincronizar: acaoSincronizar, rodar_agora: acaoRodarAgora
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido. Utilize POST.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const acao = ACOES[body.action];
  if (!acao) return res.status(400).json({ error: 'Ação desconhecida.' });
  try {
    const env = ambienteServidor();
    if (env.faltando.length) {
      if (body.action === 'status') return res.status(200).json({ servidorPronto: false, faltando: env.faltando, bancoPronto: false, config: null, podeGerenciar: false });
      return res.status(503).json({ error: 'O servidor ainda não foi configurado para a cobrança pelo Asaas.', codigo: 'SERVIDOR_PENDENTE' });
    }
    const ctx = await autenticar(req, env, body.orgId);
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
    return res.status(200).json(await acao({ admin, env, ctx, orgId: body.orgId, body, req }));
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
    if (err instanceof GatewayError) {
      return err.recusado
        ? res.status(422).json({ error: `O Asaas recusou a operação${err.detalhe ? `: ${err.detalhe}` : '.'}`, codigo: 'ASAAS_RECUSOU' })
        : res.status(503).json({ error: 'O Asaas está fora do ar agora. Tente de novo em alguns minutos.', codigo: 'ASAAS_FORA' });
    }
    console.error('[api/asaas] erro inesperado:', err && err.message ? String(err.message).slice(0, 120) : 'desconhecido');
    return res.status(500).json({ error: 'Erro inesperado ao falar com o Asaas.' });
  }
}

export const __acoesParaTeste = ACOES;
