// ==============================================================================
// VERCEL SERVERLESS FUNCTION: aviso de vencimento no aparelho (Web Push)
// Rota: POST /api/push   corpo: { action, orgId, ... }   cabeçalho: Authorization: Bearer <sessão>
//
// Ações: chave | inscrever | cancelar | testar
//   chave     -> devolve a chave pública do aviso (o navegador precisa dela para se inscrever)
//   inscrever -> grava o aparelho (celular ou PC) para a empresa
//   cancelar  -> apaga o aparelho
//   testar    -> manda um aviso de teste (ou o do dia, se houver) só para este aparelho
//
// Segurança: toda chamada exige a sessão do usuário e o banco confere o acesso à empresa
// (contaju_can_access_org). A chave privada (VAPID_PRIVATE_KEY) só existe aqui, no servidor.
// Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
// ==============================================================================
import { createClient } from '@supabase/supabase-js';
import { configurarWebPush, enviar, hojeBrasil, montarMensagens, vencimentosDoDia } from './_push/aviso.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class ApiError extends Error {
  constructor(status, mensagem, codigo) { super(mensagem); this.status = status; this.codigo = codigo; }
}

async function autenticar(req, env, orgId) {
  const cab = String(req.headers.authorization || '');
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
  return sessao.user;
}

const enderecoValido = e => typeof e === 'string' && e.length <= 1000 && /^https:\/\//.test(e);
const chaveValida = k => typeof k === 'string' && k.length >= 10 && k.length <= 200 && /^[A-Za-z0-9_\-+/=]+$/.test(k);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  const env = {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  };
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action, orgId } = body;
    if (!env.url || !env.anon || !env.service || !configurarWebPush()) {
      return res.status(503).json({ error: 'O aviso no celular ainda não foi configurado no servidor.', codigo: 'SERVIDOR_NAO_CONFIGURADO' });
    }
    const usuario = await autenticar(req, env, orgId);
    const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === 'chave') return res.status(200).json({ chavePublica: process.env.VAPID_PUBLIC_KEY });

    if (action === 'inscrever') {
      const s = body.subscription || {};
      if (!enderecoValido(s.endpoint) || !chaveValida(s.keys?.p256dh) || !chaveValida(s.keys?.auth)) {
        throw new ApiError(422, 'Inscrição do aparelho inválida. Tente ativar de novo.');
      }
      const { error } = await admin.from('contaju_push_subscriptions').upsert({
        org_id: orgId, user_id: usuario.id, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 200),
        avisar_pagar: body.avisarPagar !== false, avisar_receber: body.avisarReceber !== false,
        ultimo_erro: null, updated_at: new Date().toISOString()
      }, { onConflict: 'org_id,endpoint' });
      if (error) throw new ApiError(500, 'Não foi possível salvar este aparelho. Tente de novo.');
      return res.status(200).json({ ok: true });
    }

    if (action === 'cancelar') {
      if (!enderecoValido(body.endpoint)) throw new ApiError(422, 'Aparelho inválido.');
      // só apaga o aparelho do próprio usuário
      await admin.from('contaju_push_subscriptions').delete().eq('org_id', orgId).eq('user_id', usuario.id).eq('endpoint', body.endpoint);
      return res.status(200).json({ ok: true });
    }

    if (action === 'testar') {
      if (!enderecoValido(body.endpoint)) throw new ApiError(422, 'Aparelho inválido.');
      const { data: sub } = await admin.from('contaju_push_subscriptions').select('endpoint, p256dh, auth')
        .eq('org_id', orgId).eq('user_id', usuario.id).eq('endpoint', body.endpoint).maybeSingle();
      if (!sub) throw new ApiError(404, 'Este aparelho ainda não está ativado. Ative o aviso primeiro.');
      const itens = await vencimentosDoDia(admin, orgId, hojeBrasil());
      const reais = montarMensagens(itens);
      const mensagens = reais.length ? reais : [{
        title: 'Aviso de vencimento ativado ✓',
        body: 'Quando uma conta vencer no dia, você recebe aqui, mesmo com o sistema fechado.',
        tag: 'contaju-teste', url: '/'
      }];
      let enviados = 0;
      for (const m of mensagens) {
        const r = await enviar(sub, m);
        if (r.gone) {
          await admin.from('contaju_push_subscriptions').delete().eq('org_id', orgId).eq('endpoint', sub.endpoint);
          throw new ApiError(410, 'Este aparelho não recebe mais avisos. Ative de novo.', 'APARELHO_EXPIRADO');
        }
        if (r.ok) enviados++;
      }
      if (!enviados) throw new ApiError(502, 'O envio não funcionou agora. Tente de novo em instantes.');
      return res.status(200).json({ ok: true, enviados, comVencimentos: reais.length > 0 });
    }

    throw new ApiError(400, 'Ação desconhecida.');
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.message, codigo: e.codigo });
    console.error('[push] falha inesperada');
    return res.status(500).json({ error: 'Não foi possível concluir. Tente de novo.' });
  }
}
