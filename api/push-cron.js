// ==============================================================================
// ROBÔ do aviso de vencimento (Web Push)
// Rota: GET /api/push-cron   cabeçalho: Authorization: Bearer <CRON_SECRET ou PUSH_TRIGGER_SECRET>
//
// Quem chama: o agendador do banco (pg_cron) a cada 30 min, das 8h às 20h30 de Brasília, e o cron
// diário da Vercel às 8h (reserva). A cada rodada, para cada aparelho ativado:
//   * procura o que vence HOJE e AMANHÃ (a pagar e a receber) e ainda está em aberto;
//   * manda só o que este aparelho ainda NÃO recebeu hoje (contaju_push_enviados). Assim uma conta
//     lançada às 14h que vence hoje avisa na rodada seguinte, sem repetir as da manhã.
// Fora da janela 8h–21h de Brasília não manda nada (ninguém quer aviso de madrugada).
// Só LÊ títulos; não altera nenhum dado financeiro.
// ==============================================================================
import { timingSafeEqual, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { configurarWebPush, enviar, hojeBrasil, montarMensagens, usuariosComAcesso, vencimentosDoDia } from './_push/aviso.js';

const sha = v => createHash('sha256').update(String(v)).digest();
const confere = (recebido, segredo) => !!segredo && !!recebido && timingSafeEqual(sha(recebido), sha(segredo));
export const horaBrasil = (agora = Date.now()) => new Date(agora - 3 * 3600 * 1000).getUTCHours();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const recebido = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!confere(recebido, process.env.CRON_SECRET) && !confere(recebido, process.env.PUSH_TRIGGER_SECRET)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !service || !configurarWebPush()) return res.status(500).json({ error: 'not_configured' });

  const hora = horaBrasil();
  if (hora < 8 || hora >= 21) return res.status(200).json({ ok: true, foraDoHorario: true, hora });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const hoje = hojeBrasil();
  const { data: subs, error } = await admin.from('contaju_push_subscriptions')
    .select('id, org_id, user_id, endpoint, p256dh, auth, avisar_pagar, avisar_receber').range(0, 4999);
  if (error) return res.status(500).json({ error: 'processing_failed' });

  const porEmpresa = new Map();
  for (const s of subs || []) {
    if (!porEmpresa.has(s.org_id)) porEmpresa.set(s.org_id, []);
    porEmpresa.get(s.org_id).push(s);
  }

  const ateMs = Date.now() + 50_000;
  const resumo = { empresas: 0, aparelhosAvisados: 0, avisos: 0, removidos: 0, falhas: 0, adiadas: 0 };
  for (const [orgId, aparelhos] of porEmpresa) {
    if (Date.now() > ateMs) { resumo.adiadas++; continue; }
    resumo.empresas++;
    let itens;
    try { itens = await vencimentosDoDia(admin, orgId, hoje); } catch { resumo.falhas++; continue; }
    if (!itens.length) continue;

    // Só manda para quem ainda tem acesso à empresa (quem saiu da equipe não recebe nomes nem valores)
    const comAcesso = await usuariosComAcesso(admin, orgId, aparelhos.map(a => a.user_id));
    // O que cada aparelho já recebeu hoje
    const { data: jaFoi } = await admin.from('contaju_push_enviados').select('subscription_id, title_id, quando')
      .eq('dia', hoje).in('subscription_id', aparelhos.map(a => a.id)).range(0, 9999);
    const enviado = new Set((jaFoi || []).map(e => `${e.subscription_id}|${e.title_id}|${e.quando}`));

    for (const ap of aparelhos) {
      if (Date.now() > ateMs) { resumo.adiadas++; break; }
      if (!comAcesso.has(ap.user_id)) {
        await admin.from('contaju_push_subscriptions').delete().eq('id', ap.id);
        resumo.removidos++;
        continue;
      }
      const novos = itens.filter(i => !enviado.has(`${ap.id}|${i.id}|${i.quando}`));
      const mensagens = montarMensagens(novos, { pagar: ap.avisar_pagar, receber: ap.avisar_receber });
      if (!mensagens.length) continue;

      let algumOk = false;
      let sumiu = false;
      let erro = null;
      for (const m of mensagens) {
        const r = await enviar(ap, m);
        if (r.ok) { algumOk = true; resumo.avisos++; }
        else if (r.gone) { sumiu = true; break; }
        else erro = r.erro;
      }
      if (sumiu) {
        await admin.from('contaju_push_subscriptions').delete().eq('id', ap.id);
        resumo.removidos++;
      } else if (algumOk) {
        const filtrados = novos.filter(i => (i.tipo === 'PAGAR' ? ap.avisar_pagar : ap.avisar_receber));
        await admin.from('contaju_push_enviados').upsert(
          filtrados.map(i => ({ subscription_id: ap.id, title_id: i.id, quando: i.quando, dia: hoje })),
          { onConflict: 'subscription_id,title_id,quando,dia', ignoreDuplicates: true }
        );
        await admin.from('contaju_push_subscriptions').update({ ultimo_envio_data: hoje, ultimo_erro: null }).eq('id', ap.id);
        resumo.aparelhosAvisados++;
      } else {
        await admin.from('contaju_push_subscriptions').update({ ultimo_erro: erro }).eq('id', ap.id);
        resumo.falhas++;
      }
    }
  }
  // limpeza: o histórico de envios só precisa dos últimos dias
  await admin.from('contaju_push_enviados').delete().lt('dia', hoje);
  return res.status(200).json({ ok: true, dia: hoje, hora, ...resumo });
}
