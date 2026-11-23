// ==============================================================================
// VERCEL CRON: aviso diário de vencimento (ver "crons" em vercel.json)
// Rota: GET /api/push-cron   cabeçalho: Authorization: Bearer <CRON_SECRET>
//
// Para cada empresa com aparelhos ativados: procura o que vence HOJE (a pagar e a receber) e manda
// o aviso para cada aparelho, mesmo com o sistema fechado. Cada aparelho recebe no máximo uma vez
// por dia (ultimo_envio_data). Aparelho que não existe mais (desinstalou/bloqueou) é apagado.
// Só LÊ títulos; não altera nenhum dado financeiro.
// ==============================================================================
import { timingSafeEqual, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { configurarWebPush, enviar, hojeBrasil, montarMensagens, usuariosComAcesso, vencimentosDoDia } from './_push/aviso.js';

const sha = v => createHash('sha256').update(String(v)).digest();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const segredoCron = process.env.CRON_SECRET || '';
  const recebido = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!segredoCron || !recebido || !timingSafeEqual(sha(recebido), sha(segredoCron))) return res.status(401).json({ error: 'unauthorized' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !service || !configurarWebPush()) return res.status(500).json({ error: 'not_configured' });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const hoje = hojeBrasil();
  const { data: subs, error } = await admin.from('contaju_push_subscriptions')
    .select('id, org_id, user_id, endpoint, p256dh, auth, avisar_pagar, avisar_receber, ultimo_envio_data')
    .or(`ultimo_envio_data.is.null,ultimo_envio_data.lt.${hoje}`).range(0, 4999);
  if (error) return res.status(500).json({ error: 'processing_failed' });

  const porEmpresa = new Map();
  for (const s of subs || []) {
    if (!porEmpresa.has(s.org_id)) porEmpresa.set(s.org_id, []);
    porEmpresa.get(s.org_id).push(s);
  }

  const ateMs = Date.now() + 50_000;
  const resumo = { empresas: 0, enviados: 0, removidos: 0, falhas: 0, adiadas: 0 };
  for (const [orgId, aparelhos] of porEmpresa) {
    if (Date.now() > ateMs) { resumo.adiadas++; continue; }
    resumo.empresas++;
    let itens;
    try { itens = await vencimentosDoDia(admin, orgId, hoje); } catch { resumo.falhas++; continue; }
    // Só manda para quem ainda tem acesso à empresa (quem saiu da equipe não recebe nomes nem valores)
    const comAcesso = itens.length ? await usuariosComAcesso(admin, orgId, aparelhos.map(a => a.user_id)) : null;
    for (const ap of aparelhos) {
      if (Date.now() > ateMs) { resumo.adiadas++; break; }
      if (comAcesso && !comAcesso.has(ap.user_id)) {
        await admin.from('contaju_push_subscriptions').delete().eq('id', ap.id);
        resumo.removidos++;
        continue;
      }
      const mensagens = montarMensagens(itens, { pagar: ap.avisar_pagar, receber: ap.avisar_receber });
      if (!mensagens.length) {
        // nada a avisar hoje neste aparelho: marca o dia para não reler à toa
        await admin.from('contaju_push_subscriptions').update({ ultimo_envio_data: hoje }).eq('id', ap.id);
        continue;
      }
      let algumOk = false;
      let sumiu = false;
      let erro = null;
      for (const m of mensagens) {
        const r = await enviar(ap, m);
        if (r.ok) algumOk = true;
        else if (r.gone) { sumiu = true; break; }
        else erro = r.erro;
      }
      if (sumiu) {
        await admin.from('contaju_push_subscriptions').delete().eq('id', ap.id);
        resumo.removidos++;
      } else if (algumOk) {
        await admin.from('contaju_push_subscriptions').update({ ultimo_envio_data: hoje, ultimo_erro: null }).eq('id', ap.id);
        resumo.enviados++;
      } else {
        await admin.from('contaju_push_subscriptions').update({ ultimo_erro: erro }).eq('id', ap.id);
        resumo.falhas++;
      }
    }
  }
  return res.status(200).json({ ok: true, dia: hoje, ...resumo });
}
