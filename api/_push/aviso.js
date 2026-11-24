// ==============================================================================
// Peças do aviso de vencimento (Web Push): montar a mensagem do dia e mandar para os aparelhos.
// Usado por /api/push (botão "enviar teste") e por /api/push-cron (robô diário).
// Nada aqui grava ou altera título: só LÊ o que vence hoje.
// ==============================================================================
import * as webpush from 'web-push';

export const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const hojeBrasil = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

let configurado = false;
export function configurarWebPush(env = process.env) {
  const pub = env.VAPID_PUBLIC_KEY || '';
  const priv = env.VAPID_PRIVATE_KEY || '';
  if (!pub || !priv) return false;
  if (!configurado) {
    webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:contato@contaju.com.br', pub, priv);
    configurado = true;
  }
  return true;
}

export const amanhaDe = dia => new Date(new Date(`${dia}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

/** Títulos em aberto que vencem hoje e amanhã (a pagar e a receber). Cada item sabe se é HOJE ou AMANHA. */
export async function vencimentosDoDia(admin, orgId, dia) {
  const amanha = amanhaDe(dia);
  const { data, error } = await admin
    .from('contaju_financial_titles')
    .select('id, type, description, title_number, due_date, balance_principal, counterparty_id')
    .eq('org_id', orgId).in('due_date', [dia, amanha])
    .in('type', ['PAGAR', 'RECEBER'])
    .neq('document_state', 'CANCELADO')
    .in('settlement_state', ['ABERTO', 'PARCIAL']).gt('balance_principal', 0)
    .order('balance_principal', { ascending: false }).range(0, 999);
  if (error) throw new Error('leitura_titulos');
  const lista = data || [];
  const ids = [...new Set(lista.map(t => t.counterparty_id).filter(Boolean))];
  const nomes = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: partes } = await admin.from('contaju_counterparties').select('id, name').eq('org_id', orgId).in('id', ids.slice(i, i + 200));
    for (const p of partes || []) nomes.set(p.id, p.name);
  }
  return lista.map(t => ({
    id: t.id, tipo: t.type, valor: Number(t.balance_principal),
    quando: String(t.due_date).slice(0, 10) === dia ? 'HOJE' : 'AMANHA',
    nome: String(t.description || '').trim() || nomes.get(t.counterparty_id) || (t.type === 'PAGAR' ? 'Conta a pagar' : 'Recebimento'),
    parte: nomes.get(t.counterparty_id) || ''
  }));
}

/**
 * Quem, dentre estes usuários, ainda tem acesso à empresa (membro ou consultoria).
 * O robô confere isso a cada envio: quem saiu da empresa deixa de receber nomes e valores dela.
 */
export async function usuariosComAcesso(admin, orgId, userIds) {
  const ids = [...new Set(userIds)];
  const permitidos = new Set();
  if (!ids.length) return permitidos;
  const { data: membros } = await admin.from('contaju_memberships').select('user_id').eq('org_id', orgId).in('user_id', ids);
  for (const m of membros || []) permitidos.add(m.user_id);
  for (const uid of ids) {
    if (permitidos.has(uid)) continue;
    try {
      const { data } = await admin.auth.admin.getUserById(uid);
      const email = String(data?.user?.email || '').toLowerCase();
      if (!email) continue;
      const { data: c } = await admin.from('contaju_consultants').select('email').eq('email', email).maybeSingle();
      if (c) permitidos.add(uid);
    } catch { /* sem como confirmar: não envia */ }
  }
  return permitidos;
}

const LIMITE_INDIVIDUAL = 3;

/**
 * Mensagens do dia. Até 3 itens viram um aviso cada (ex.: "Água vence hoje — R$ 180,00");
 * passou disso, vira um resumo único para o celular não virar uma enxurrada.
 */
export function montarMensagens(itens, { pagar = true, receber = true } = {}) {
  const lista = itens.filter(i => (i.tipo === 'PAGAR' ? pagar : receber));
  if (!lista.length) return [];
  // hoje primeiro, depois amanhã
  lista.sort((a, b) => (a.quando === b.quando ? 0 : a.quando === 'HOJE' ? -1 : 1));
  const dq = i => (i.quando === 'AMANHA' ? 'amanhã' : 'hoje');
  if (lista.length <= LIMITE_INDIVIDUAL) {
    return lista.map(i => ({
      title: i.tipo === 'PAGAR' ? `${i.nome} vence ${dq(i)}` : `Recebimento previsto ${dq(i)}: ${i.nome}`,
      body: i.tipo === 'PAGAR'
        ? `${brl(i.valor)} a pagar${i.parte && i.parte !== i.nome ? ` • ${i.parte}` : ''}`
        : `${brl(i.valor)} a receber${i.parte && i.parte !== i.nome ? ` • ${i.parte}` : ''}`,
      tag: `vence-${i.id}-${i.quando}`,
      url: i.tipo === 'PAGAR' ? '/#pagar' : '/#receber'
    }));
  }
  const pg = lista.filter(i => i.tipo === 'PAGAR');
  const rc = lista.filter(i => i.tipo === 'RECEBER');
  const partes = [];
  if (pg.length) partes.push(`${pg.length} a pagar: ${brl(pg.reduce((s, i) => s + i.valor, 0))}`);
  if (rc.length) partes.push(`${rc.length} a receber: ${brl(rc.reduce((s, i) => s + i.valor, 0))}`);
  const maiores = lista.slice(0, 3).map(i => `${i.nome} ${brl(i.valor)}${i.quando === 'AMANHA' ? ' (amanhã)' : ''}`).join(' • ');
  const nh = lista.filter(i => i.quando !== 'AMANHA').length;
  const na = lista.length - nh;
  const titulo = na === 0 ? `${lista.length} vencimentos hoje` : nh === 0 ? `${lista.length} vencimentos amanhã` : `${lista.length} vencimentos: ${nh} hoje, ${na} amanhã`;
  return [{
    title: titulo,
    body: `${partes.join(' • ')}\n${maiores}`,
    tag: `vence-resumo-${hojeBrasil()}-${Date.now()}`,
    url: pg.length ? '/#pagar' : '/#receber'
  }];
}

/** Manda uma mensagem a um aparelho. Devolve { ok } ou { gone: true } quando o aparelho não existe mais. */
export async function enviar(sub, mensagem) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: mensagem.title, body: mensagem.body, tag: mensagem.tag, data: { url: mensagem.url || '/' } }),
      { TTL: 12 * 3600, urgency: 'high', timeout: 8000 }
    );
    return { ok: true };
  } catch (e) {
    const status = Number(e?.statusCode || 0);
    return { ok: false, gone: status === 404 || status === 410, erro: `push_${status || 'rede'}` };
  }
}
