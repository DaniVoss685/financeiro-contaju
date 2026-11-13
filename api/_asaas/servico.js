// ==============================================================================
// Regras da cobrança de honorários pelo Asaas (usadas por /api/asaas, /api/asaas-cron e pelo webhook).
// Este código só mexe em contaju_asaas_* e fala com o Asaas. Ele NUNCA grava título, baixa ou
// movimentação: isso é feito pelo navegador (ver supabase/migrations/…_cobranca_asaas.sql).
// ==============================================================================
import { cifrar, decifrar } from '../_nfse/cert.js';
import { asaas, baseDoAmbiente, GatewayError, hojeBrasil, somarDias, STATUS_VIVOS } from './gateway.js';

export class ApiError extends Error {
  constructor(status, message, codigo) {
    super(message);
    this.status = status;
    this.codigo = codigo;
  }
}

const so = v => String(v || '').replace(/\D/g, '');
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
const centavos = v => Math.round(Number(v) * 100);
const reais = c => Math.round(c) / 100;
const pedacos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

export const COLUNAS_CONFIG_PUBLICA =
  'org_id, ambiente, ativo, robo_ativo, antecedencia_dias, limite_por_execucao, bank_account_id, receita_conta_id, importar_assinaturas_crm, notificar_cliente, multa_percentual, juros_mensal_percentual, webhook_ativado_em, ultima_execucao_robo, ultimo_resumo_robo';

export const segredoDeCifra = (env = process.env) => {
  const s = env.ASAAS_KEY_SECRET || env.NFSE_CERT_SECRET || '';
  return s.length >= 32 ? s : '';
};

// ------------------------------------------------------------------------------
// Contexto (config + chave decifrada)
// ------------------------------------------------------------------------------
export async function carregarConfig(admin, orgId) {
  const { data, error } = await admin.from('contaju_asaas_config').select(COLUNAS_CONFIG_PUBLICA + ', webhook_token_hash').eq('org_id', orgId).maybeSingle();
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') throw new ApiError(503, 'A cobrança pelo Asaas ainda não foi instalada no banco de dados.', 'BANCO_PENDENTE');
    throw new ApiError(500, 'Não foi possível ler a configuração da cobrança.');
  }
  return data;
}

export async function abrirContexto(admin, orgId, segredo, { exigirAtivo = true } = {}) {
  const config = await carregarConfig(admin, orgId);
  if (!config) throw new ApiError(409, 'Configure a conexão com o Asaas antes de gerar cobranças.', 'SEM_CONFIG');
  if (exigirAtivo && !config.ativo) throw new ApiError(409, 'A conexão com o Asaas está desligada. Ative em Configurar.', 'DESLIGADO');
  const { data, error } = await admin.from('contaju_asaas_credentials').select('api_key_cifrada').eq('org_id', orgId).maybeSingle();
  if (error) throw new ApiError(500, 'Não foi possível ler a chave do Asaas.');
  if (!data) throw new ApiError(409, 'Informe a chave do Asaas em Configurar.', 'SEM_CHAVE');
  let chave;
  try {
    chave = decifrar(data.api_key_cifrada, segredo).toString('utf8');
  } catch {
    throw new ApiError(500, 'Não foi possível abrir a chave guardada. Informe a chave do Asaas de novo em Configurar.');
  }
  return { orgId, config, admin, chave, base: baseDoAmbiente(config.ambiente) };
}

export const cifrarChave = (chave, segredo) => cifrar(Buffer.from(chave, 'utf8'), segredo);

// ------------------------------------------------------------------------------
// Cliente do Asaas (um por cadastro de cliente nosso)
// ------------------------------------------------------------------------------
async function garantirCliente(cx, parte) {
  const { admin, orgId } = cx;
  const documento = so(parte.document);
  if (documento.length !== 11 && documento.length !== 14) return { motivo: 'Cliente sem CPF/CNPJ válido no cadastro.' };
  if (!String(parte.name || '').trim()) return { motivo: 'Cliente sem nome no cadastro.' };

  const { data: ja } = await admin.from('contaju_asaas_customers').select('asaas_customer_id, cpf_cnpj').eq('org_id', orgId).eq('counterparty_id', parte.id).maybeSingle();
  if (ja && ja.cpf_cnpj === documento) return { id: ja.asaas_customer_id };

  // Reaproveita o cliente que já existe no Asaas com o mesmo CPF/CNPJ (evita duplicar)
  const achados = await asaas(cx, `/customers?cpfCnpj=${documento}&limit=5`);
  const existente = (Array.isArray(achados.data) ? achados.data : []).find(c => !c.deleted);
  let id = existente && existente.id;
  if (!id) {
    const corpo = {
      name: String(parte.name).trim().slice(0, 100),
      cpfCnpj: documento,
      externalReference: `contaju:${orgId}:${parte.id}`.slice(0, 100),
      notificationDisabled: !cx.config.notificar_cliente
    };
    if (emailOk(parte.email)) corpo.email = String(parte.email).trim();
    const fone = so(parte.phone);
    if (fone.length >= 10 && fone.length <= 11) corpo.mobilePhone = fone;
    const criado = await asaas(cx, '/customers', { method: 'POST', body: JSON.stringify(corpo) });
    id = criado.id;
  }
  if (!id) throw new GatewayError(false);
  await admin.from('contaju_asaas_customers').upsert({ org_id: orgId, counterparty_id: parte.id, asaas_customer_id: id, cpf_cnpj: documento }, { onConflict: 'org_id,counterparty_id' });
  return { id };
}

// ------------------------------------------------------------------------------
// Gerar a cobrança de UM título
// ------------------------------------------------------------------------------
const refDoTitulo = (orgId, tituloId) => `contaju:${orgId}:${tituloId}`.slice(0, 100);

export async function gerarCobranca(cx, { titulo, parte, forma, vencimento, origem, usuario }) {
  const valor = Number(titulo.balance_principal);
  if (!(valor > 0)) return { motivo: 'Título sem saldo a receber.' };
  if (centavos(valor) < 500) return { motivo: 'Valor abaixo do mínimo de R$ 5,00 aceito pelo Asaas.' };
  const cliente = await garantirCliente(cx, parte);
  if (cliente.motivo) return { motivo: cliente.motivo };

  const ref = refDoTitulo(cx.orgId, titulo.id);
  // Se o Asaas já tem uma cobrança deste título (ex.: o banco falhou na volta), adota em vez de duplicar
  const existentes = await asaas(cx, `/payments?externalReference=${encodeURIComponent(ref)}&limit=5`);
  let pagamento = (Array.isArray(existentes.data) ? existentes.data : []).find(p => !p.deleted && STATUS_VIVOS.includes(p.status));
  if (!pagamento) {
    const corpo = {
      customer: cliente.id,
      billingType: forma,
      value: valor,
      dueDate: vencimento,
      description: String(titulo.description || `Título ${titulo.title_number || ''}`).slice(0, 480),
      externalReference: ref
    };
    if (cx.config.multa_percentual != null) corpo.fine = { value: Number(cx.config.multa_percentual) };
    if (cx.config.juros_mensal_percentual != null) corpo.interest = { value: Number(cx.config.juros_mensal_percentual) };
    pagamento = await asaas(cx, '/payments', { method: 'POST', body: JSON.stringify(corpo) });
  }
  if (!pagamento.id) throw new GatewayError(false);

  const linha = {
    org_id: cx.orgId,
    title_id: titulo.id,
    counterparty_id: titulo.counterparty_id || parte.id,
    asaas_payment_id: pagamento.id,
    asaas_customer_id: cliente.id,
    billing_type: forma,
    value: Number(pagamento.value ?? valor),
    original_value: Number(pagamento.originalValue ?? pagamento.value ?? valor),
    due_date: pagamento.dueDate || vencimento,
    status: pagamento.status || 'PENDING',
    invoice_url: pagamento.invoiceUrl || null,
    bank_slip_url: pagamento.bankSlipUrl || null,
    nosso_numero: pagamento.nossoNumero || null,
    origin: origem,
    created_by: usuario || null,
    synced_at: new Date().toISOString()
  };
  const { data, error } = await cx.admin.from('contaju_asaas_charges').insert(linha).select('id').single();
  if (error) {
    if (error.code === '23505') return { motivo: 'Este título já tem uma cobrança.' };
    throw new ApiError(500, 'A cobrança foi criada no Asaas, mas não conseguimos guardar. Tente de novo (ela não será duplicada).');
  }
  return { id: data.id, asaasId: pagamento.id, vencimento: linha.due_date, forma };
}

// ------------------------------------------------------------------------------
// Quais títulos o robô cobra
// ------------------------------------------------------------------------------
export const COLUNAS_TITULO = 'id, counterparty_id, description, title_number, due_date, balance_principal, contract_id, competence';

async function lerPorIds(admin, tabela, colunas, orgId, ids, campo = 'id') {
  const saida = [];
  for (const lote of pedacos([...new Set(ids.filter(Boolean))], 100)) {
    const { data, error } = await admin.from(tabela).select(colunas).eq('org_id', orgId).in(campo, lote);
    if (error) throw new ApiError(500, 'Não foi possível ler os dados para gerar as cobranças.');
    saida.push(...(data || []));
  }
  return saida;
}

/**
 * Títulos idênticos (mesmo cliente, contrato, competência, vencimento, valor e descrição) são duplicados de importação:
 * cobrar todos mandaria 2 ou 3 boletos do mesmo honorário. Eles NÃO são cobrados até alguém limpar a duplicidade.
 */
export const chaveDuplicidade = t =>
  [t.counterparty_id, t.contract_id || '', t.competence || '', t.due_date, Number(t.balance_principal).toFixed(2), String(t.description || '').trim().toLowerCase()].join('|');

export function agruparDuplicados(titulos) {
  const grupos = new Map();
  for (const t of titulos) {
    const k = chaveDuplicidade(t);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(t);
  }
  return grupos;
}

export const MOTIVO_DUPLICADO = 'Há títulos idênticos para este cliente (duplicados). Use a Limpeza de duplicidades em Contas a receber antes de cobrar.';

/** Títulos que o robô cobraria agora (e os que ele pula, com o motivo). */
export async function selecionarParaRobo(cx, { hoje = hojeBrasil() } = {}) {
  const ate = somarDias(hoje, cx.config.antecedencia_dias);
  const { data: titulos, error } = await cx.admin
    .from('contaju_financial_titles')
    .select(COLUNAS_TITULO)
    .eq('org_id', cx.orgId).eq('type', 'RECEBER').eq('document_state', 'CONFIRMADO')
    .in('settlement_state', ['ABERTO', 'PARCIAL']).gt('balance_principal', 0)
    .gte('due_date', hoje).lte('due_date', ate)
    .order('due_date', { ascending: true }).range(0, 999);
  if (error) throw new ApiError(500, 'Não foi possível ler os títulos a receber.');
  const lista = titulos || [];
  const contratos = await lerPorIds(cx.admin, 'contaju_contracts', 'id, billing_method', cx.orgId, lista.map(t => t.contract_id));
  const forma = new Map(contratos.map(c => [c.id, c.billing_method]));
  const vivas = await lerPorIds(cx.admin, 'contaju_asaas_charges', 'title_id, status', cx.orgId, lista.map(t => t.id), 'title_id');
  const comCobranca = new Set(vivas.filter(c => STATUS_VIVOS.includes(c.status)).map(c => c.title_id));
  const partes = await lerPorIds(cx.admin, 'contaju_counterparties', 'id, name, document, email, phone', cx.orgId, lista.map(t => t.counterparty_id));
  const porParte = new Map(partes.map(p => [p.id, p]));

  const cobrar = [];
  const pulados = [];
  const grupos = agruparDuplicados(lista);
  for (const t of lista) {
    if (comCobranca.has(t.id)) continue;
    const irmaos = grupos.get(chaveDuplicidade(t)) || [];
    if (irmaos.length > 1) {
      // só aponta quando o honorário seria cobrado (contrato com boleto/Pix); o resto nem entra na conta
      const f0 = forma.get(t.contract_id);
      if (f0 === 'BOLETO' || f0 === 'PIX') {
        const p0 = porParte.get(t.counterparty_id);
        pulados.push({ titleId: t.id, titulo: t.title_number, cliente: p0 ? p0.name : '(sem cliente)', motivo: MOTIVO_DUPLICADO, duplicado: true });
      }
      continue;
    }
    const f = forma.get(t.contract_id);
    if (f !== 'BOLETO' && f !== 'PIX') continue; // só honorário de contrato com boleto ou Pix
    const parte = porParte.get(t.counterparty_id);
    const doc = so(parte && parte.document);
    if (!parte || (doc.length !== 11 && doc.length !== 14)) {
      pulados.push({ titleId: t.id, titulo: t.title_number, cliente: parte ? parte.name : '(sem cliente)', motivo: 'Cliente sem CPF/CNPJ válido no cadastro.' });
      continue;
    }
    cobrar.push({ titulo: t, parte, forma: f });
  }
  return { cobrar, pulados, ate, hoje };
}

/** Gera uma leva de cobranças com limite e orçamento de tempo. */
export async function gerarLote(cx, itens, { vencimentoPadrao, origem, usuario, limite, ateMs }) {
  const gerados = [];
  const pulados = [];
  let restantes = 0;
  const fila = itens.slice();
  let tomados = 0; // itens já retirados da fila (conta ao retirar, para o limite valer mesmo com 3 trabalhando juntos)
  const trabalhar = async () => {
    while (fila.length) {
      if ((limite != null && tomados >= limite) || (ateMs && Date.now() > ateMs)) {
        restantes += fila.length;
        fila.length = 0;
        return;
      }
      const it = fila.shift();
      tomados++;
      try {
        const venc = it.vencimento || vencimentoPadrao || it.titulo.due_date;
        const r = await gerarCobranca(cx, { titulo: it.titulo, parte: it.parte, forma: it.forma, vencimento: venc, origem, usuario });
        if (r.motivo) pulados.push({ titleId: it.titulo.id, titulo: it.titulo.title_number, cliente: it.parte.name, motivo: r.motivo });
        else gerados.push({ titleId: it.titulo.id, titulo: it.titulo.title_number, cliente: it.parte.name, forma: r.forma, vencimento: r.vencimento });
      } catch (e) {
        if (e instanceof GatewayError && !e.recusado) throw e; // Asaas fora do ar: para tudo, o resto fica para a próxima
        pulados.push({
          titleId: it.titulo.id, titulo: it.titulo.title_number, cliente: it.parte.name,
          motivo: e instanceof GatewayError ? `O Asaas recusou: ${e.detalhe || 'dados inválidos'}` : e.message || 'Erro ao gerar a cobrança.'
        });
      }
    }
  };
  await Promise.all([trabalhar(), trabalhar(), trabalhar()]); // 3 de cada vez (o Asaas aceita bem mais)
  return { gerados, pulados, restantes };
}

// ------------------------------------------------------------------------------
// Sincronizar o que o Asaas já sabe (rede de segurança para avisos que não chegaram)
// ------------------------------------------------------------------------------
const EVENTO_POR_STATUS = {
  RECEIVED: 'PAYMENT_RECEIVED', RECEIVED_IN_CASH: 'PAYMENT_RECEIVED', CONFIRMED: 'PAYMENT_CONFIRMED', OVERDUE: 'PAYMENT_OVERDUE',
  REFUNDED: 'PAYMENT_REFUNDED', DELETED: 'PAYMENT_DELETED', PENDING: 'PAYMENT_UPDATED'
};

export async function sincronizarAbertas(cx, { limite = 60, ateMs } = {}) {
  const { data: abertas, error } = await cx.admin
    .from('contaju_asaas_charges').select('id, asaas_payment_id, status')
    .eq('org_id', cx.orgId).in('status', ['PENDING', 'OVERDUE', 'CONFIRMED', 'AWAITING_RISK_ANALYSIS'])
    .order('synced_at', { ascending: true, nullsFirst: true }).limit(limite);
  if (error) throw new ApiError(500, 'Não foi possível ler as cobranças abertas.');
  let atualizadas = 0;
  for (const c of abertas || []) {
    if (ateMs && Date.now() > ateMs) break;
    let p;
    try {
      p = await asaas(cx, `/payments/${encodeURIComponent(c.asaas_payment_id)}`);
    } catch (e) {
      if (e instanceof GatewayError && !e.recusado) throw e;
      continue;
    }
    const status = p.deleted ? 'DELETED' : p.status;
    const evento = EVENTO_POR_STATUS[status] || 'PAYMENT_UPDATED';
    await cx.admin.rpc('contaju_asaas_apply_event', {
      p_org: cx.orgId,
      event_in: { id: `sync:${c.asaas_payment_id}:${status}`, event: evento, payment: { ...p, status } },
      customer_in: null
    });
    await cx.admin.from('contaju_asaas_charges').update({ synced_at: new Date().toISOString() }).eq('id', c.id);
    if (status !== c.status) atualizadas++;
  }
  return { verificadas: (abertas || []).length, atualizadas };
}

// ------------------------------------------------------------------------------
// Execução diária de uma empresa (robô)
// ------------------------------------------------------------------------------
export async function rodarRobo(admin, orgId, segredo, { ateMs } = {}) {
  const cx = await abrirContexto(admin, orgId, segredo);
  const resumo = { em: new Date().toISOString(), gerados: 0, pulados: 0, restantes: 0, verificadas: 0, atualizadas: 0, erro: null };
  try {
    const sync = await sincronizarAbertas(cx, { ateMs });
    resumo.verificadas = sync.verificadas;
    resumo.atualizadas = sync.atualizadas;
    const sel = await selecionarParaRobo(cx);
    const r = await gerarLote(cx, sel.cobrar, { origem: 'ROBO', usuario: 'Robô diário', limite: cx.config.limite_por_execucao, ateMs });
    resumo.gerados = r.gerados.length;
    resumo.pulados = r.pulados.length + sel.pulados.length;
    resumo.restantes = r.restantes;
    resumo.detalhePulados = [...sel.pulados, ...r.pulados].slice(0, 20);
  } catch (e) {
    resumo.erro = e instanceof GatewayError ? (e.recusado ? `O Asaas recusou: ${e.detalhe || 'chave inválida?'}` : 'Asaas fora do ar') : e.message || 'erro';
  }
  await admin.from('contaju_asaas_config').update({ ultima_execucao_robo: resumo.em, ultimo_resumo_robo: resumo }).eq('org_id', orgId);
  return resumo;
}
