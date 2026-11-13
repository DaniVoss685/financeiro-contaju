// ==============================================================================
// VERCEL CRON: robô diário da cobrança (ver "crons" em vercel.json)
// Rota: GET /api/asaas-cron   cabeçalho: Authorization: Bearer <CRON_SECRET>
//
// Para cada empresa com o robô ligado: confere no Asaas as cobranças ainda abertas (rede de
// segurança dos avisos) e gera boleto/Pix dos honorários que vencem nos próximos N dias e ainda
// não têm cobrança. Respeita o limite por execução da empresa; o que sobrar fica para o dia seguinte.
// Só funciona com CRON_SECRET configurado (a Vercel manda o cabeçalho sozinha).
// ==============================================================================
import { timingSafeEqual, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { rodarRobo, segredoDeCifra } from './_asaas/servico.js';

const sha = v => createHash('sha256').update(String(v)).digest();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const segredoCron = process.env.CRON_SECRET || '';
  const recebido = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!segredoCron || !recebido || !timingSafeEqual(sha(recebido), sha(segredoCron))) return res.status(401).json({ error: 'unauthorized' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const segredo = segredoDeCifra();
  if (!url || !service || !segredo) return res.status(500).json({ error: 'not_configured' });

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: empresas, error } = await admin.from('contaju_asaas_config').select('org_id').eq('ativo', true).eq('robo_ativo', true);
  if (error) return res.status(500).json({ error: 'processing_failed' });

  const ateMs = Date.now() + 50_000;
  const resultado = [];
  for (const e of empresas || []) {
    if (Date.now() > ateMs) { resultado.push({ org: e.org_id, adiada: true }); continue; }
    const r = await rodarRobo(admin, e.org_id, segredo, { ateMs });
    resultado.push({ org: e.org_id, gerados: r.gerados, pulados: r.pulados, restantes: r.restantes, verificadas: r.verificadas, atualizadas: r.atualizadas, erro: r.erro });
  }
  return res.status(200).json({ ok: true, empresas: resultado });
}
