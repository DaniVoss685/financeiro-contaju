// ==============================================================================
// VERCEL SERVERLESS FUNCTION: NFS-e Nacional (Portal Nacional)
// Rota: POST /api/nfse   corpo: { action, orgId, ... }   cabeçalho: Authorization: Bearer <sessão>
//
// Segurança:
//   * Toda chamada exige a sessão do usuário (Supabase Auth) e confere no banco se
//     ele tem acesso à empresa informada (mesma regra das policies: contaju_can_access_org).
//   * Só este servidor grava notas e configuração (service_role). O navegador só lê.
//   * O certificado digital fica cifrado; a chave de cifragem (NFSE_CERT_SECRET) e a
//     service_role nunca saem do servidor.
// Variáveis de ambiente (servidor): SUPABASE_SERVICE_ROLE_KEY, NFSE_CERT_SECRET,
//   SUPABASE_URL (ou VITE_SUPABASE_URL), SUPABASE_ANON_KEY (ou VITE_SUPABASE_ANON_KEY),
//   NFSE_SIGN_ALG (opcional: sha1 | sha256).
// ==============================================================================
import { createClient } from '@supabase/supabase-js';
import { layoutDoAmbiente, outroLayout, recusaPorLeiaute, recusaPorDuplicidade, montarDps, montarPedidoCancelamento, assinarDocumento, lerTag, soDigitos, textoLimpo, validarCnpj, paraCentavos, ValidacaoError } from './_nfse/xml.js';
import { lerCertificado, cifrar, decifrar, CertificadoError } from './_nfse/cert.js';
import { emitirNfse, consultarDps, consultarNfse, cancelarNfse, baixarDanfse, PortalError } from './_nfse/sefin.js';

class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const COLUNAS_NOTA =
  'id, ambiente, serie, numero_dps, status, chave_acesso, numero_nfse, customer_id, sale_id, tomador_nome, tomador_documento, tomador_email, descricao, c_trib_nac, c_nbs, valor_servico, competencia, iss_retido, aliquota_iss, mensagem, cancel_codigo, cancel_motivo, cancelada_em, autorizada_em, emitida_por_nome, created_at';
const COLUNAS_CONFIG =
  'org_id, ambiente, cnpj, inscricao_municipal, codigo_municipio, telefone, email, op_simp_nac, reg_ap_trib_sn, reg_esp_trib, serie, proximo_numero_producao, proximo_numero_testes, padrao_c_trib_nac, padrao_c_nbs, padrao_descricao, p_tot_trib_sn, cert_titular, cert_documento, cert_validade, cert_enviado_em';

function ambienteServidor() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const segredo = process.env.NFSE_CERT_SECRET || '';
  const faltando = [];
  if (!url) faltando.push('SUPABASE_URL');
  if (!anon) faltando.push('SUPABASE_ANON_KEY');
  if (!service) faltando.push('SUPABASE_SERVICE_ROLE_KEY');
  if (segredo.length < 32) faltando.push('NFSE_CERT_SECRET');
  const algoritmo = process.env.NFSE_SIGN_ALG === 'sha256' ? 'sha256' : 'sha1';
  return { url, anon, service, segredo, faltando, algoritmo };
}

const tabelaAusente = error => Boolean(error) && (error.code === 'PGRST205' || error.code === '42P01' || /could not find the table|does not exist/i.test(error.message || ''));

async function autenticar(req, env, orgId) {
  const cabecalho = String(req.headers.authorization || req.headers.Authorization || '');
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'Sessão expirada. Entre de novo no sistema.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(orgId || ''))) {
    throw new ApiError(400, 'Empresa não informada.');
  }
  const comoUsuario = createClient(env.url, env.anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: sessao, error: erroSessao } = await comoUsuario.auth.getUser(token);
  if (erroSessao || !sessao?.user) {
    console.warn('[api/nfse] sessão recusada pelo Supabase:', erroSessao?.message || 'sem usuário');
    throw new ApiError(401, 'Sessão expirada. Entre de novo no sistema.', { motivo: erroSessao?.message || 'sem usuário' });
  }

  // A decisão de acesso é do banco (mesma função usada nas policies de RLS).
  const { data: podeAcessar, error: erroAcesso } = await comoUsuario.rpc('contaju_can_access_org', { p_org: orgId });
  if (erroAcesso) throw new ApiError(500, 'Não foi possível conferir o acesso à empresa.');
  if (podeAcessar !== true) throw new ApiError(403, 'Você não tem acesso a esta empresa.');

  const { data: consultor } = await comoUsuario.rpc('contaju_is_consultant');
  return { usuario: sessao.user, consultor: consultor === true, comoUsuario };
}

async function exigirGestor(admin, ctx, orgId) {
  if (ctx.consultor) return;
  const { data } = await admin.from('contaju_memberships').select('role').eq('org_id', orgId).eq('user_id', ctx.usuario.id).maybeSingle();
  if (!data || data.role !== 'OWNER') throw new ApiError(403, 'Só o responsável pela empresa ou a consultoria pode alterar a configuração de notas fiscais.');
}

async function carregarConfig(admin, orgId) {
  const { data, error } = await admin.from('contaju_nfse_config').select(COLUNAS_CONFIG).eq('org_id', orgId).maybeSingle();
  if (tabelaAusente(error)) throw new ApiError(503, 'O módulo de notas fiscais ainda não foi instalado no banco de dados.', { codigo: 'BANCO_PENDENTE' });
  if (error) throw new ApiError(500, 'Não foi possível ler a configuração de notas fiscais.');
  return data;
}

async function carregarCertificado(admin, env, orgId) {
  const { data, error } = await admin.from('contaju_nfse_certificates').select('pfx_cifrado, senha_cifrada').eq('org_id', orgId).maybeSingle();
  if (error) throw new ApiError(500, 'Não foi possível ler o certificado digital.');
  if (!data) throw new ApiError(422, 'Envie o certificado digital A1 da empresa em Configurar emissão.', { codigo: 'SEM_CERTIFICADO' });
  let cert;
  try {
    const pfx = decifrar(data.pfx_cifrado, env.segredo);
    const senha = decifrar(data.senha_cifrada, env.segredo).toString('utf8');
    cert = lerCertificado(pfx, senha);
  } catch {
    throw new ApiError(500, 'Não foi possível abrir o certificado guardado. Envie o certificado de novo em Configurar emissão.');
  }
  if (cert.validoAte < new Date()) throw new ApiError(422, 'O certificado digital está vencido. Envie um certificado válido em Configurar emissão.', { codigo: 'CERTIFICADO_VENCIDO' });
  return cert;
}

const prestadorDaConfig = config => ({
  cnpj: config.cnpj,
  codigoMunicipio: config.codigo_municipio,
  inscricaoMunicipal: config.inscricao_municipal,
  telefone: config.telefone,
  email: config.email,
  opSimpNac: config.op_simp_nac,
  regApTribSN: config.reg_ap_trib_sn,
  regEspTrib: config.reg_esp_trib
});

function nomeUsuario(usuario) {
  return textoLimpo(usuario.user_metadata?.name || usuario.user_metadata?.full_name || usuario.email || '', 120);
}

// ------------------------------------------------------------------------------
// Ações
// ------------------------------------------------------------------------------
async function acaoStatus({ admin, ctx, orgId }) {
  const { data: config, error } = await admin.from('contaju_nfse_config').select(COLUNAS_CONFIG).eq('org_id', orgId).maybeSingle();
  if (tabelaAusente(error)) return { servidorPronto: true, bancoPronto: false, config: null, podeGerenciar: false };
  if (error) throw new ApiError(500, 'Não foi possível ler a configuração de notas fiscais.');
  let podeGerenciar = ctx.consultor;
  if (!podeGerenciar) {
    const { data: m } = await admin.from('contaju_memberships').select('role').eq('org_id', orgId).eq('user_id', ctx.usuario.id).maybeSingle();
    podeGerenciar = m?.role === 'OWNER';
  }
  return { servidorPronto: true, bancoPronto: true, config: config || null, podeGerenciar };
}

async function acaoSalvarConfig({ admin, ctx, orgId, body }) {
  await exigirGestor(admin, ctx, orgId);
  const atual = await carregarConfig(admin, orgId);
  const c = body.config || {};
  const erro = msg => { throw new ApiError(422, msg); };

  const cnpj = soDigitos(c.cnpj);
  if (!validarCnpj(cnpj)) erro('CNPJ inválido.');
  const codigoMunicipio = soDigitos(c.codigoMunicipio);
  if (codigoMunicipio.length !== 7) erro('O código do município (IBGE) precisa ter 7 dígitos.');
  const ambiente = Number(c.ambiente);
  if (ambiente !== 1 && ambiente !== 2) erro('Escolha o ambiente (testes ou produção).');
  const opSimpNac = Number(c.opSimpNac);
  if (![1, 2, 3].includes(opSimpNac)) erro('Informe a situação da empresa no Simples Nacional.');
  const regApTribSN = opSimpNac === 3 ? Number(c.regApTribSN) : null;
  if (opSimpNac === 3 && ![1, 2, 3].includes(regApTribSN)) erro('Informe o regime de apuração do Simples Nacional.');
  const regEspTrib = Number(c.regEspTrib ?? 0);
  if (!(Number.isInteger(regEspTrib) && regEspTrib >= 0 && regEspTrib <= 6)) erro('Regime especial de tributação inválido.');
  const serie = soDigitos(c.serie || '1');
  if (!serie || serie.length > 5) erro('Série inválida (até 5 dígitos).');
  const cTribNac = soDigitos(c.padraoCTribNac);
  if (cTribNac && cTribNac.length !== 6) erro('O código de tributação nacional precisa ter 6 dígitos.');
  const cNbs = soDigitos(c.padraoCNbs);
  if (cNbs && cNbs.length !== 9) erro('O código NBS precisa ter 9 dígitos.');
  let pTot = null;
  if (opSimpNac === 3 && (c.pTotTribSN === undefined || c.pTotTribSN === null || c.pTotTribSN === '')) {
    erro('Para ME/EPP informe o percentual aproximado de tributos (confirme com a contabilidade).');
  }
  if (c.pTotTribSN !== undefined && c.pTotTribSN !== null && c.pTotTribSN !== '') {
    pTot = paraCentavos(c.pTotTribSN) / 100;
    if (pTot < 0 || pTot >= 100) erro('Percentual aproximado de tributos inválido.');
  }
  const email = textoLimpo(c.email, 80).replace(/\s/g, '');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) erro('E-mail inválido.');

  // A numeração só pode avançar (nunca voltar para um número já usado).
  const proxProd = Number.parseInt(c.proximoNumeroProducao, 10);
  const minProd = atual?.proximo_numero_producao || 1;
  if (c.proximoNumeroProducao !== undefined && c.proximoNumeroProducao !== '' && !(Number.isInteger(proxProd) && proxProd >= minProd)) {
    erro(`O próximo número da nota em produção não pode ser menor que ${minProd}.`);
  }

  const linha = {
    org_id: orgId,
    ambiente,
    cnpj,
    inscricao_municipal: textoLimpo(c.inscricaoMunicipal, 15) || null,
    codigo_municipio: codigoMunicipio,
    telefone: soDigitos(c.telefone).slice(0, 20) || null,
    email: email || null,
    op_simp_nac: opSimpNac,
    reg_ap_trib_sn: regApTribSN,
    reg_esp_trib: regEspTrib,
    serie: String(Number(serie)),
    padrao_c_trib_nac: cTribNac || null,
    padrao_c_nbs: cNbs || null,
    padrao_descricao: textoLimpo(c.padraoDescricao, 2000) || null,
    p_tot_trib_sn: pTot,
    updated_by: ctx.usuario.id,
    updated_at: new Date().toISOString()
  };
  if (Number.isInteger(proxProd) && proxProd >= minProd) linha.proximo_numero_producao = proxProd;

  const { data, error } = await admin.from('contaju_nfse_config').upsert(linha, { onConflict: 'org_id' }).select(COLUNAS_CONFIG).single();
  if (error) throw new ApiError(500, 'Não foi possível salvar a configuração.');
  return { config: data };
}

async function acaoEnviarCertificado({ admin, env, ctx, orgId, body }) {
  await exigirGestor(admin, ctx, orgId);
  const atual = await carregarConfig(admin, orgId);
  const b64 = String(body.pfxBase64 || '');
  const senha = String(body.senha || '');
  if (!b64 || !senha) throw new ApiError(422, 'Selecione o arquivo do certificado e informe a senha.');
  if (b64.length > 200000) throw new ApiError(422, 'Arquivo grande demais para ser um certificado A1.');
  const pfx = Buffer.from(b64, 'base64');
  const cert = lerCertificado(pfx, senha);
  if (cert.validoAte < new Date()) throw new ApiError(422, `Este certificado venceu em ${cert.validoAte.toLocaleDateString('pt-BR')}.`);

  const agora = new Date().toISOString();
  const { error: e1 } = await admin.from('contaju_nfse_certificates').upsert({
    org_id: orgId,
    pfx_cifrado: cifrar(pfx, env.segredo),
    senha_cifrada: cifrar(Buffer.from(senha, 'utf8'), env.segredo),
    created_by: ctx.usuario.id,
    updated_at: agora
  }, { onConflict: 'org_id' });
  if (e1) throw new ApiError(500, 'Não foi possível guardar o certificado.');

  const dadosCert = { cert_titular: cert.titular, cert_documento: cert.documento || null, cert_validade: cert.validoAte.toISOString(), cert_enviado_em: agora, updated_by: ctx.usuario.id, updated_at: agora };
  const { data, error: e2 } = atual
    ? await admin.from('contaju_nfse_config').update(dadosCert).eq('org_id', orgId).select(COLUNAS_CONFIG).single()
    : await admin.from('contaju_nfse_config').insert({ org_id: orgId, ...dadosCert }).select(COLUNAS_CONFIG).single();
  if (e2) throw new ApiError(500, 'Certificado guardado, mas não foi possível atualizar a configuração.');

  const cnpjConfig = soDigitos(data.cnpj);
  const aviso = cert.documento && cnpjConfig && cert.documento.slice(0, 8) !== cnpjConfig.slice(0, 8)
    ? 'Atenção: o CNPJ do certificado é diferente do CNPJ da empresa emissora. O portal só aceita o certificado da própria empresa ou de quem tem procuração.'
    : null;
  return { config: data, aviso };
}

async function acaoRemoverCertificado({ admin, ctx, orgId }) {
  await exigirGestor(admin, ctx, orgId);
  const { error } = await admin.from('contaju_nfse_certificates').delete().eq('org_id', orgId);
  if (error) throw new ApiError(500, 'Não foi possível remover o certificado.');
  const { data } = await admin.from('contaju_nfse_config')
    .update({ cert_titular: null, cert_documento: null, cert_validade: null, cert_enviado_em: null, updated_by: ctx.usuario.id, updated_at: new Date().toISOString() })
    .eq('org_id', orgId).select(COLUNAS_CONFIG).maybeSingle();
  return { config: data || null };
}

async function acaoListar({ admin, orgId, body }) {
  const ambiente = Number(body.ambiente) === 1 ? 1 : 2;
  const mes = /^\d{4}-\d{2}$/.test(String(body.mes || '')) ? String(body.mes) : null;
  const notas = [];
  const PAGINA = 1000; // o PostgREST corta em 1000 linhas por consulta
  for (let inicio = 0; ; inicio += PAGINA) {
    let q = admin.from('contaju_nfse_notes').select(COLUNAS_NOTA).eq('org_id', orgId).eq('ambiente', ambiente)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(inicio, inicio + PAGINA - 1);
    if (mes) {
      const [ano, m] = mes.split('-').map(Number);
      const proximo = m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, '0')}`;
      q = q.gte('competencia', `${mes}-01`).lt('competencia', `${proximo}-01`);
    }
    const { data, error } = await q;
    if (tabelaAusente(error)) throw new ApiError(503, 'O módulo de notas fiscais ainda não foi instalado no banco de dados.', { codigo: 'BANCO_PENDENTE' });
    if (error) throw new ApiError(500, 'Não foi possível carregar as notas.');
    notas.push(...data);
    if (data.length < PAGINA) break;
  }
  return { notas };
}

async function buscarNota(admin, orgId, noteId, colunas = '*') {
  if (!/^[0-9a-f-]{36}$/i.test(String(noteId || ''))) throw new ApiError(400, 'Nota não informada.');
  const { data, error } = await admin.from('contaju_nfse_notes').select(colunas).eq('org_id', orgId).eq('id', noteId).maybeSingle();
  if (error) throw new ApiError(500, 'Não foi possível ler a nota.');
  if (!data) throw new ApiError(404, 'Nota não encontrada.');
  return data;
}

async function atualizarNota(admin, orgId, id, campos) {
  const { data, error } = await admin.from('contaju_nfse_notes').update({ ...campos, updated_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('id', id).select(COLUNAS_NOTA).single();
  if (error) throw new ApiError(500, 'A operação foi feita no portal, mas não foi possível gravar o resultado. Use "Conferir situação" na nota.');
  return data;
}

async function acaoEmitir({ admin, env, ctx, orgId, body }) {
  const chaveIdem = String(body.idempotencyKey || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(chaveIdem)) throw new ApiError(400, 'Requisição inválida. Feche a janela e tente de novo.');

  // Mesmo clique enviado duas vezes devolve a mesma nota (não emite em dobro).
  const { data: repetida, error: erroIdem } = await admin.from('contaju_nfse_notes').select(COLUNAS_NOTA).eq('org_id', orgId).eq('idempotency_key', chaveIdem).maybeSingle();
  if (tabelaAusente(erroIdem)) throw new ApiError(503, 'O módulo de notas fiscais ainda não foi instalado no banco de dados.', { codigo: 'BANCO_PENDENTE' });
  if (repetida) return { nota: repetida, repetida: true };

  const config = await carregarConfig(admin, orgId);
  if (!config || !config.cnpj) throw new ApiError(422, 'Preencha os dados fiscais da empresa em Configurar emissão antes de emitir.', { codigo: 'SEM_CONFIG' });
  const cert = await carregarCertificado(admin, env, orgId);

  const n = body.nota || {};
  const ambiente = config.ambiente;
  const saleId = n.saleId ? String(n.saleId).slice(0, 80) : null;
  const dados = {
    ambiente,
    serie: config.serie,
    numero: 1, // provisório: só para validar tudo antes de gastar um número
    competencia: n.competencia,
    prestador: prestadorDaConfig(config),
    ibscbs: n.ibscbs && n.ibscbs.informar ? n.ibscbs : undefined,
    tomador: { documento: n.tomadorDocumento, nome: n.tomadorNome, email: n.tomadorEmail, telefone: n.tomadorTelefone, endereco: n.tomadorEndereco },
    servico: { cTribNac: n.cTribNac, cNBS: n.cNbs, descricao: n.descricao, informacoesComplementares: n.informacoesComplementares, docRef: n.docRef, idDocTec: n.idDocTec },
    valores: {
      valorServico: n.valorServico,
      issRetido: Boolean(n.issRetido),
      aliquotaIss: n.aliquotaIss,
      pisCofinsCst: n.pisCofinsCst,
      pisCofinsTpRet: n.pisCofinsTpRet,
      retIRRF: n.retIrrf,
      retCSLL: n.retCsll,
      retCP: n.retCp,
      pTotTribSN: config.p_tot_trib_sn
    }
  };
  montarDps(dados); // lança ValidacaoError com mensagem para o usuário

  if (saleId) {
    const { data: viva } = await admin.from('contaju_nfse_notes').select('id, status, numero_nfse').eq('org_id', orgId).eq('ambiente', ambiente)
      .eq('sale_id', saleId).in('status', ['PROCESSANDO', 'AUTORIZADA']).limit(1);
    if (viva && viva.length) throw new ApiError(409, 'Esta venda já tem uma nota fiscal emitida ou em processamento.', { codigo: 'VENDA_JA_FATURADA' });
  }

  const { data: numero, error: erroNumero } = await admin.rpc('contaju_nfse_reservar_numero', { p_org: orgId, p_ambiente: ambiente });
  if (erroNumero || !numero) throw new ApiError(500, 'Não foi possível reservar o número da nota.');

  dados.numero = numero;
  dados.layout = layoutDoAmbiente(ambiente);
  const doc = montarDps(dados);
  const xmlAssinado = assinarDocumento(doc, cert, env.algoritmo);

  const { data: criada, error: erroInsert } = await admin.from('contaju_nfse_notes').insert({
    org_id: orgId,
    idempotency_key: chaveIdem,
    ambiente,
    serie: config.serie,
    numero_dps: numero,
    id_dps: doc.id,
    status: 'PROCESSANDO',
    customer_id: n.customerId ? String(n.customerId).slice(0, 80) : null,
    sale_id: saleId,
    tomador_nome: textoLimpo(n.tomadorNome, 300),
    tomador_documento: soDigitos(n.tomadorDocumento),
    tomador_email: textoLimpo(n.tomadorEmail, 80) || null,
    descricao: textoLimpo(n.descricao, 2000),
    c_trib_nac: soDigitos(n.cTribNac),
    c_nbs: soDigitos(n.cNbs),
    valor_servico: doc.valorCentavos / 100,
    competencia: n.competencia,
    iss_retido: Boolean(n.issRetido),
    aliquota_iss: n.aliquotaIss === '' || n.aliquotaIss === undefined || n.aliquotaIss === null ? null : paraCentavos(n.aliquotaIss) / 100,
    dados_envio: { ...dados, prestador: undefined },
    xml_dps: xmlAssinado,
    emitida_por: ctx.usuario.id,
    emitida_por_nome: nomeUsuario(ctx.usuario)
  }).select(COLUNAS_NOTA).single();
  if (erroInsert) {
    if (erroInsert.code === '23505') {
      const { data: existente } = await admin.from('contaju_nfse_notes').select(COLUNAS_NOTA).eq('org_id', orgId).eq('idempotency_key', chaveIdem).maybeSingle();
      if (existente) return { nota: existente, repetida: true };
      throw new ApiError(409, 'Esta venda já tem uma nota fiscal emitida ou em processamento.', { codigo: 'VENDA_JA_FATURADA' });
    }
    throw new ApiError(500, 'Não foi possível registrar a nota antes do envio. Nada foi enviado ao portal.');
  }

  try {
    let r = await emitirNfse({ ambiente, xmlDpsAssinado: xmlAssinado, cert });
    // Produção e testes do portal nem sempre estão no mesmo leiaute. Se a recusa foi só pela forma do
    // arquivo (E1235 citando finNFSe), refaz a mesma DPS (mesmo número) no outro leiaute e reenvia uma vez.
    if (!r.autorizada && recusaPorLeiaute(r.erros)) {
      const segundo = outroLayout(dados.layout);
      const docB = montarDps({ ...dados, layout: segundo });
      const xmlB = assinarDocumento(docB, cert, env.algoritmo);
      await admin.from('contaju_nfse_notes').update({ xml_dps: xmlB, dados_envio: { ...dados, layout: segundo, prestador: undefined } }).eq('org_id', orgId).eq('id', criada.id);
      console.warn(`[api/nfse] ambiente ${ambiente}: leiaute ${dados.layout} recusado, reenviando no leiaute ${segundo}`);
      dados.layout = segundo;
      r = await emitirNfse({ ambiente, xmlDpsAssinado: xmlB, cert });
    }
    // Número de DPS já usado (E0014): a série também é usada fora deste sistema (site do Emissor Nacional,
    // por exemplo). O portal não gerou nada, então é seguro pegar o próximo número livre e reenviar a mesma nota.
    for (let tentativa = 0; !r.autorizada && recusaPorDuplicidade(r.erros) && tentativa < 12; tentativa++) {
      const { data: proximo, error: erroProx } = await admin.rpc('contaju_nfse_reservar_numero', { p_org: orgId, p_ambiente: ambiente });
      if (erroProx || !proximo) break;
      dados.numero = proximo;
      const docC = montarDps({ ...dados });
      const xmlC = assinarDocumento(docC, cert, env.algoritmo);
      const { error: erroUp } = await admin.from('contaju_nfse_notes')
        .update({ numero_dps: proximo, id_dps: docC.id, xml_dps: xmlC, dados_envio: { ...dados, prestador: undefined } })
        .eq('org_id', orgId).eq('id', criada.id);
      if (erroUp) break;
      console.warn(`[api/nfse] ambiente ${ambiente}: número de DPS já usado, reenviando com o número ${proximo}`);
      r = await emitirNfse({ ambiente, xmlDpsAssinado: xmlC, cert });
    }
    if (r.autorizada) {
      const nota = await atualizarNota(admin, orgId, criada.id, {
        status: 'AUTORIZADA',
        chave_acesso: r.chaveAcesso,
        numero_nfse: lerTag(r.xmlNfse, 'nNFSe'),
        xml_nfse: r.xmlNfse,
        autorizada_em: new Date().toISOString(),
        mensagem: r.alertas.length ? r.alertas.join('\n') : null
      });
      return { nota };
    }
    const nota = await atualizarNota(admin, orgId, criada.id, { status: 'REJEITADA', mensagem: r.erros.join('\n') });
    return { nota };
  } catch (err) {
    if (err instanceof PortalError) {
      if (err.incerto) {
        // Não sabemos se o portal recebeu: fica "em processamento" até conferir.
        const nota = await atualizarNota(admin, orgId, criada.id, { mensagem: `${err.message} Use "Conferir situação" antes de emitir de novo.` });
        return { nota };
      }
      const nota = await atualizarNota(admin, orgId, criada.id, { status: 'REJEITADA', mensagem: err.message });
      return { nota };
    }
    throw err;
  }
}

/** Serviços já usados nas notas da empresa (do mais recente), para sugerir na hora de emitir. */
async function acaoServicosUsados({ admin, orgId, body }) {
  const ambiente = Number(body.ambiente) === 1 ? 1 : 2;
  const { data, error } = await admin.from('contaju_nfse_notes')
    .select('c_trib_nac, c_nbs, descricao, status, created_at')
    .eq('org_id', orgId).eq('ambiente', ambiente).in('status', ['AUTORIZADA', 'CANCELADA', 'PROCESSANDO'])
    .order('created_at', { ascending: false }).limit(300);
  if (tabelaAusente(error)) throw new ApiError(503, 'O módulo de notas fiscais ainda não foi instalado no banco de dados.', { codigo: 'BANCO_PENDENTE' });
  if (error) throw new ApiError(500, 'Não foi possível ler os serviços usados.');
  const mapa = new Map();
  for (const n of data || []) {
    const chave = `${n.c_trib_nac}|${n.c_nbs}`;
    const item = mapa.get(chave);
    if (item) item.vezes++;
    else mapa.set(chave, { cTribNac: n.c_trib_nac, cNbs: n.c_nbs, descricao: n.descricao, vezes: 1 });
  }
  return { servicos: [...mapa.values()].slice(0, 8) };
}

async function acaoConferir({ admin, env, orgId, body }) {
  const nota = await buscarNota(admin, orgId, body.noteId, 'id, status, ambiente, id_dps, chave_acesso');
  if (nota.status !== 'PROCESSANDO') {
    return { nota: await buscarNota(admin, orgId, nota.id, COLUNAS_NOTA) };
  }
  const cert = await carregarCertificado(admin, env, orgId);
  const r = await consultarDps({ ambiente: nota.ambiente, idDps: nota.id_dps, cert });
  if (!r.encontrada) {
    return { nota: await atualizarNota(admin, orgId, nota.id, { status: 'REJEITADA', mensagem: 'O portal não recebeu esta nota. Você pode emitir de novo com segurança.' }) };
  }
  const { xmlNfse } = await consultarNfse({ ambiente: nota.ambiente, chaveAcesso: r.chaveAcesso, cert });
  return {
    nota: await atualizarNota(admin, orgId, nota.id, {
      status: 'AUTORIZADA', chave_acesso: r.chaveAcesso, numero_nfse: lerTag(xmlNfse, 'nNFSe'), xml_nfse: xmlNfse, autorizada_em: new Date().toISOString(), mensagem: null
    })
  };
}

async function acaoCancelar({ admin, env, ctx, orgId, body }) {
  await exigirGestor(admin, ctx, orgId);
  const nota = await buscarNota(admin, orgId, body.noteId, 'id, status, ambiente, chave_acesso');
  if (nota.status !== 'AUTORIZADA' || !nota.chave_acesso) throw new ApiError(422, 'Só é possível cancelar uma nota autorizada.');
  const config = await carregarConfig(admin, orgId);
  const cert = await carregarCertificado(admin, env, orgId);
  const pedido = montarPedidoCancelamento({ ambiente: nota.ambiente, chaveAcesso: nota.chave_acesso, cnpjAutor: config.cnpj, codigoMotivo: body.codigoMotivo, motivo: body.motivo });
  const xml = assinarDocumento(pedido, cert, env.algoritmo);
  const r = await cancelarNfse({ ambiente: nota.ambiente, chaveAcesso: nota.chave_acesso, xmlPedidoAssinado: xml, cert });
  if (!r.cancelada) throw new ApiError(422, `O portal não aceitou o cancelamento: ${r.erros.join('; ')}`, { codigo: 'CANCELAMENTO_RECUSADO' });
  return {
    nota: await atualizarNota(admin, orgId, nota.id, {
      status: 'CANCELADA', cancel_codigo: Number(body.codigoMotivo), cancel_motivo: textoLimpo(body.motivo, 255), cancelada_em: new Date().toISOString()
    })
  };
}

async function acaoPdf({ admin, env, orgId, body }) {
  const nota = await buscarNota(admin, orgId, body.noteId, 'id, status, ambiente, chave_acesso, numero_nfse');
  if (!nota.chave_acesso) throw new ApiError(422, 'Esta nota não foi autorizada, então não tem PDF.');
  const cert = await carregarCertificado(admin, env, orgId);
  try {
    const pdf = await baixarDanfse({ ambiente: nota.ambiente, chaveAcesso: nota.chave_acesso, cert });
    return { pdfBase64: pdf.toString('base64'), nomeArquivo: `NFS-e ${nota.numero_nfse || nota.chave_acesso}.pdf` };
  } catch (err) {
    if (!(err instanceof PortalError)) throw err;
    // O portal nem sempre entrega o DANFSe oficial (no ambiente de testes não há serviço de PDF).
    // O sistema monta um PDF auxiliar a partir do XML autorizado.
    console.warn('[api/nfse] DANFSe oficial indisponível:', err.message);
    return { oficialIndisponivel: true, nomeArquivo: `NFS-e ${nota.numero_nfse || nota.chave_acesso}.pdf` };
  }
}

async function acaoXml({ admin, orgId, body }) {
  const nota = await buscarNota(admin, orgId, body.noteId, 'id, xml_nfse, numero_nfse, chave_acesso');
  if (!nota.xml_nfse) throw new ApiError(422, 'Esta nota não foi autorizada, então não tem XML.');
  return { xml: nota.xml_nfse, nomeArquivo: `NFS-e ${nota.numero_nfse || nota.chave_acesso}.xml` };
}

/** XML de várias notas de uma vez (exportação em lote). Só da empresa da sessão, no máximo 60 por chamada. */
async function acaoXmlLote({ admin, orgId, body }) {
  const ids = Array.isArray(body.noteIds) ? body.noteIds.filter(i => /^[0-9a-f-]{36}$/i.test(String(i))).slice(0, 60) : [];
  if (!ids.length) throw new ApiError(400, 'Nenhuma nota informada.');
  const { data, error } = await admin.from('contaju_nfse_notes').select('id, xml_nfse').eq('org_id', orgId).in('id', ids).not('xml_nfse', 'is', null);
  if (error) throw new ApiError(500, 'Não foi possível ler os XMLs das notas.');
  return { notas: (data || []).map(n => ({ id: n.id, xml: n.xml_nfse })) };
}

const ACOES = {
  xml_lote: acaoXmlLote,
  status: acaoStatus,
  salvar_config: acaoSalvarConfig,
  enviar_certificado: acaoEnviarCertificado,
  remover_certificado: acaoRemoverCertificado,
  listar: acaoListar,
  emitir: acaoEmitir,
  conferir: acaoConferir,
  servicos_usados: acaoServicosUsados,
  cancelar: acaoCancelar,
  pdf: acaoPdf,
  xml: acaoXml
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
      // Diz apenas QUAIS variáveis faltam (nunca valores).
      if (body.action === 'status') return res.status(200).json({ servidorPronto: false, faltando: env.faltando, bancoPronto: false, config: null, podeGerenciar: false });
      return res.status(503).json({ error: 'O servidor ainda não foi configurado para emitir notas fiscais.', codigo: 'SERVIDOR_PENDENTE' });
    }
    const ctx = await autenticar(req, env, body.orgId);
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
    const resultado = await acao({ admin, env, ctx, orgId: body.orgId, body });
    return res.status(200).json(resultado);
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, ...err.extra });
    if (err instanceof ValidacaoError) return res.status(422).json({ error: err.message, campo: err.campo, codigo: 'VALIDACAO' });
    if (err instanceof CertificadoError) return res.status(422).json({ error: err.message, codigo: 'CERTIFICADO' });
    if (err instanceof PortalError) return res.status(502).json({ error: err.message, codigo: 'PORTAL' });
    console.error('[api/nfse] erro inesperado:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Erro inesperado ao processar a nota fiscal.' });
  }
}

/** Só para scripts de teste (não é roteado pelo handler). */
export const __acoesParaTeste = ACOES;
