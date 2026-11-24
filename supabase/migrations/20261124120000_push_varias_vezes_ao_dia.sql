-- ==============================================================================
-- Aviso de vencimento: várias rodadas por dia + "vence amanhã" — Financeiro Contaju
-- Migration ADITIVA e IDEMPOTENTE.
--
-- 1) contaju_push_enviados: o que cada aparelho já recebeu no dia (para não repetir aviso
--    quando o robô roda de 30 em 30 minutos). Só o servidor lê/grava (RLS sem policy).
-- 2) Agendador do banco (pg_cron + pg_net) chama /api/push-cron a cada 30 min, das 8h às 20h30
--    de Brasília (11h–23h30 UTC). O segredo da chamada fica no Vault com o nome
--    'push_trigger_secret' (criado à parte, nunca no git) e é o mesmo PUSH_TRIGGER_SECRET da Vercel.
-- ==============================================================================

create table if not exists public.contaju_push_enviados (
  subscription_id uuid not null references public.contaju_push_subscriptions(id) on delete cascade,
  title_id text not null,
  quando text not null check (quando in ('HOJE', 'AMANHA')),
  dia date not null,
  enviado_em timestamptz not null default now(),
  primary key (subscription_id, title_id, quando, dia)
);
create index if not exists contaju_push_enviados_dia_idx on public.contaju_push_enviados (dia);
alter table public.contaju_push_enviados enable row level security;
revoke all on public.contaju_push_enviados from anon, authenticated;

-- Agendamento (substitui se já existir)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'contaju_push_vencimentos') then
    perform cron.unschedule('contaju_push_vencimentos');
  end if;
end $$;

select cron.schedule(
  'contaju_push_vencimentos',
  '*/30 11-23 * * *',
  $job$
  select net.http_get(
    url := 'https://financeiro-contaju-wine.vercel.app/api/push-cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_trigger_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);
