-- ==============================================================================
-- Aviso de vencimento no celular/computador, com o sistema fechado (Web Push) — Financeiro Contaju
-- Migration ADITIVA e IDEMPOTENTE: só cria uma tabela, índices e policies. Não mexe em
-- nenhum título, baixa, cliente ou contrato.
--
-- Cada linha = um aparelho (celular ou navegador do PC) que ativou o aviso, para uma empresa.
-- Quem grava e apaga é o servidor (/api/push), depois de conferir a sessão e o acesso à empresa.
-- O robô diário (/api/push-cron) lê esta tabela, procura o que vence hoje e manda o aviso.
-- ==============================================================================

create table if not exists public.contaju_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.contaju_organizations(id) on delete cascade,
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  avisar_pagar boolean not null default true,
  avisar_receber boolean not null default true,
  ultimo_envio_data date,        -- último dia em que este aparelho recebeu o aviso (evita aviso repetido no mesmo dia)
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, endpoint)
);
create index if not exists contaju_push_subscriptions_org_idx on public.contaju_push_subscriptions (org_id);
create index if not exists contaju_push_subscriptions_user_idx on public.contaju_push_subscriptions (user_id);

alter table public.contaju_push_subscriptions enable row level security;
revoke all on public.contaju_push_subscriptions from anon, authenticated;
-- O navegador só enxerga os próprios aparelhos, e sem as chaves de criptografia do aviso.
grant select (id, org_id, user_id, user_agent, avisar_pagar, avisar_receber, ultimo_envio_data, created_at, updated_at)
  on public.contaju_push_subscriptions to authenticated;

drop policy if exists contaju_push_subscriptions_select on public.contaju_push_subscriptions;
create policy contaju_push_subscriptions_select on public.contaju_push_subscriptions
  for select to authenticated using (user_id = auth.uid() and public.contaju_can_access_org(org_id));
