// ==============================================================================
// VERCEL SERVERLESS FUNCTION: avisos do Asaas (pagamento, atraso, estorno)
// Rota: POST /api/asaas-webhook?org=<id da empresa>
//
// O Asaas não faz login: cada aviso precisa trazer, no cabeçalho `asaas-access-token`, o segredo
// que geramos ao ativar os avisos (guardamos só o hash dele). Cada aviso é gravado uma vez só
// (pelo id do evento), então reenvio é inofensivo. Responde 200 também para cobrança de outro
// produto (a conta do Asaas é uma só) e 500 só quando o banco falhou, para o Asaas tentar de novo.
// Aqui NÃO se dá baixa: o aviso fica guardado e o sistema dá a baixa quando estiver aberto.
// O conteúdo bruto nunca é guardado nem registrado em log.
// ==============================================================================
import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { asaas, GatewayError } from './_asaas/gateway.js';
import { abrirContexto, segredoDeCifra } from './_asaas/servico.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXO_CRM = 'CRM Varejo';
const sha = v => createHash('sha256').update(String(v)).digest();
const iguais = (a, b) => timingSafeEqual(sha(a), sha(b));

function orgDaRequisicao(req) {
  if (req.query && req.query.org) return String(req.query.org);
  try {
    return new URL(req.url, 'http://x').searchParams.get('org') || '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !service) return res.status(500).json({ ok: false, error: 'not_configured' });

  const orgId = orgDaRequisicao(req);
  if (!UUID.test(orgId)) return res.status(400).json({ ok: false, error: 'invalid_org' });
  const recebido = String(req.headers['asaas-access-token'] || '');
  if (!recebido) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: config, error: erroConfig } = await admin.from('contaju_asaas_config').select('ativo, webhook_token_hash, importar_assinaturas_crm').eq('org_id', orgId).maybeSingle();
  if (erroConfig) return res.status(500).json({ ok: false, error: 'processing_failed' });
  // Empresa desconhecida e segredo errado dão a mesma resposta (não revela quais empresas existem)
  if (!config || !config.webhook_token_hash || !iguais(createHash('sha256').update(recebido).digest('hex'), config.webhook_token_hash)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const evento = req.body;
  if (!evento || typeof evento !== 'object' || Array.isArray(evento) || typeof evento.id !== 'string' || typeof evento.event !== 'string') {
    return res.status(400).json({ ok: false, error: 'invalid_payload' });
  }
  if (JSON.stringify(evento).length > 200_000) return res.status(413).json({ ok: false, error: 'payload_too_large' });
  if (!config.ativo || !evento.payment || typeof evento.payment.id !== 'string') return res.status(200).json({ ok: true, status: 'ignored' });

  // Assinatura do CRM Varejo paga: busca o nome/CPF do cliente no Asaas para lançar a receita
  let cliente = null;
  const p = evento.payment;
  if (config.importar_assinaturas_crm && evento.event === 'PAYMENT_RECEIVED' && String(p.description || '').startsWith(PREFIXO_CRM) && typeof p.customer === 'string') {
    try {
      const cx = await abrirContexto(admin, orgId, segredoDeCifra());
      const c = await asaas(cx, `/customers/${encodeURIComponent(p.customer)}`);
      cliente = { name: c.name, cpfCnpj: c.cpfCnpj, email: c.email };
    } catch (e) {
      if (e instanceof GatewayError && !e.recusado) return res.status(500).json({ ok: false, error: 'processing_failed' }); // tenta de novo depois
      cliente = null;
    }
  }

  const { data, error } = await admin.rpc('contaju_asaas_apply_event', { p_org: orgId, event_in: evento, customer_in: cliente, p_crm_prefix: PREFIXO_CRM });
  if (error) {
    console.error(JSON.stringify({ asaas_webhook_erro: error.code || 'desconhecido', evento: String(evento.event).slice(0, 60) }));
    return res.status(500).json({ ok: false, error: 'processing_failed' });
  }
  return res.status(200).json({ ok: true, status: String((data && data.status) || 'unknown') });
}
