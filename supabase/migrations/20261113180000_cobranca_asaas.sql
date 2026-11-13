-- ==============================================================================
-- Cobrança de honorários pelo Asaas (boleto e Pix) — Financeiro Contaju
-- Migration ADITIVA e IDEMPOTENTE: só cria tabelas, índices, policies e funções.
-- Não altera nem apaga nenhum título, baixa, cliente ou contrato que já existe.
--
-- Como funciona:
--   * Cada empresa tem a própria conexão com o Asaas (contaju_asaas_config) e a chave guardada
--     CIFRADA em tabela sem nenhuma policy (contaju_asaas_credentials), como o certificado da NFS-e.
--   * O servidor (/api/asaas, /api/asaas-cron) gera a cobrança de um título e guarda o vínculo em
--     contaju_asaas_charges. O servidor NÃO mexe em títulos, baixas nem movimentações: eles são
--     gravados pelo navegador (que regrava os títulos inteiros), então uma baixa feita pelo
--     servidor poderia ser desfeita por uma aba aberta com dados antigos.
--   * Quando o Asaas avisa que o cliente pagou, o aviso fica guardado aqui e o PRÓPRIO sistema
--     dá a baixa (pelo mesmo caminho da baixa manual: período fechado, saldo, auditoria,
--     movimentação do banco). As funções contaju_asaas_claim / mark_* garantem que a baixa
--     seja aplicada uma única vez, mesmo com duas abas abertas.
--   * Pagamentos de assinatura do CRM Varejo (mesma conta do Asaas) viram receita nossa em
--     contaju_asaas_receipts, também lançada pelo sistema.
-- ==============================================================================

-- 1) Configuração por empresa --------------------------------------------------------
create table if not exists public.contaju_asaas_config (
  org_id uuid primary key references public.contaju_organizations(id) on delete cascade,
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox', 'producao')),
  ativo boolean not null default false,
  robo_ativo boolean not null default false,
  antecedencia_dias integer not null default 10 check (antecedencia_dias between 1 and 60),
  limite_por_execucao integer not null default 30 check (limite_por_execucao between 1 and 200),
  bank_account_id text,
  receita_conta_id text,
  importar_assinaturas_crm boolean not null default false,
  notificar_cliente boolean not null default false,
  multa_percentual numeric(5, 2) check (multa_percentual is null or (multa_percentual >= 0 and multa_percentual <= 20)),
  juros_mensal_percentual numeric(5, 2) check (juros_mensal_percentual is null or (juros_mensal_percentual >= 0 and juros_mensal_percentual <= 20)),
  webhook_token_hash text,
  webhook_ativado_em timestamptz,
  ultima_execucao_robo timestamptz,
  ultimo_resumo_robo jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Chave da API do Asaas, cifrada (AES-256-GCM). Sem policies de propósito.
create table if not exists public.contaju_asaas_credentials (
  org_id uuid primary key references public.contaju_organizations(id) on delete cascade,
  api_key_cifrada text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cliente do Asaas de cada cadastro de cliente nosso (para nunca criar duplicado)
create table if not exists public.contaju_asaas_customers (
  org_id uuid not null references public.contaju_organizations(id) on delete cascade,
  counterparty_id text not null,
  asaas_customer_id text not null,
  cpf_cnpj text,
  created_at timestamptz not null default now(),
  primary key (org_id, counterparty_id)
);

-- 2) Cobranças geradas para títulos a receber ----------------------------------------------
create table if not exists public.contaju_asaas_charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.contaju_organizations(id) on delete cascade,
  title_id text not null,
  counterparty_id text,
  asaas_payment_id text not null,
  asaas_customer_id text,
  billing_type text not null check (billing_type in ('BOLETO', 'PIX', 'UNDEFINED')),
  value numeric(15, 2) not null check (value > 0),          -- valor cobrado (e, depois de pago, o valor pago)
  original_value numeric(15, 2),                              -- valor da cobrança sem juros/multa
  net_value numeric(15, 2),                                   -- o que sobra depois da tarifa do Asaas
  due_date date not null,
  status text not null default 'PENDING',                     -- status do Asaas (PENDING, RECEIVED, OVERDUE, ...)
  invoice_url text,
  bank_slip_url text,
  identification_field text,
  nosso_numero text,
  paid_at date,
  origin text not null default 'MANUAL' check (origin in ('MANUAL', 'ROBO')),
  created_by text,
  -- baixa no financeiro (feita pelo navegador)
  claimed_at timestamptz,
  applied_at timestamptz,
  settlement_id text,
  apply_error text,
  -- algo que pede olho humano (ex.: cobrança estornada depois de baixada)
  revisar_motivo text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contaju_asaas_charges_payment_uq on public.contaju_asaas_charges (asaas_payment_id);
-- Um título só pode ter UMA cobrança viva (aberta ou paga): protege contra clique duplo e robô repetido
create unique index if not exists contaju_asaas_charges_titulo_vivo_uq
  on public.contaju_asaas_charges (org_id, title_id)
  where status in ('PENDING', 'AWAITING_RISK_ANALYSIS', 'OVERDUE', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH');
create index if not exists contaju_asaas_charges_lista_idx on public.contaju_asaas_charges (org_id, due_date desc);
create index if not exists contaju_asaas_charges_pendente_baixa_idx
  on public.contaju_asaas_charges (org_id) where applied_at is null and status in ('RECEIVED', 'RECEIVED_IN_CASH');

-- 3) Receitas que chegam no Asaas sem título nosso (assinaturas do CRM Varejo) -----------------
create table if not exists public.contaju_asaas_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.contaju_organizations(id) on delete cascade,
  kind text not null default 'ASSINATURA_CRM' check (kind in ('ASSINATURA_CRM')),
  asaas_payment_id text not null,
  description text,
  customer_name text,
  customer_document text,
  customer_email text,
  value numeric(15, 2) not null,
  net_value numeric(15, 2),
  due_date date,
  paid_at date,
  status text not null default 'RECEIVED',
  claimed_at timestamptz,
  applied_at timestamptz,
  title_id text,
  settlement_id text,
  apply_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, asaas_payment_id)
);

-- 4) Eventos já tratados (cada aviso do Asaas vale uma vez só) --------------------------------
create table if not exists public.contaju_asaas_events (
  event_id text not null,
  org_id uuid not null references public.contaju_organizations(id) on delete cascade,
  event_type text not null,
  payment_id text,
  outcome text not null default 'processed' check (outcome in ('processed', 'ignored')),
  received_at timestamptz not null default now(),
  primary key (org_id, event_id)
);

-- 5) Permissões: o navegador só LÊ (e sem o hash do segredo do webhook) -----------------------
alter table public.contaju_asaas_config enable row level security;
alter table public.contaju_asaas_credentials enable row level security;
alter table public.contaju_asaas_customers enable row level security;
alter table public.contaju_asaas_charges enable row level security;
alter table public.contaju_asaas_receipts enable row level security;
alter table public.contaju_asaas_events enable row level security;

revoke all on public.contaju_asaas_config, public.contaju_asaas_credentials, public.contaju_asaas_customers,
  public.contaju_asaas_charges, public.contaju_asaas_receipts, public.contaju_asaas_events from anon, authenticated;

grant select (org_id, ambiente, ativo, robo_ativo, antecedencia_dias, limite_por_execucao, bank_account_id, receita_conta_id,
  importar_assinaturas_crm, notificar_cliente, multa_percentual, juros_mensal_percentual, webhook_ativado_em,
  ultima_execucao_robo, ultimo_resumo_robo, created_at, updated_at)
  on public.contaju_asaas_config to authenticated;
grant select on public.contaju_asaas_charges, public.contaju_asaas_receipts to authenticated;

drop policy if exists contaju_asaas_config_select on public.contaju_asaas_config;
create policy contaju_asaas_config_select on public.contaju_asaas_config
  for select to authenticated using (public.contaju_can_access_org(org_id));
drop policy if exists contaju_asaas_charges_select on public.contaju_asaas_charges;
create policy contaju_asaas_charges_select on public.contaju_asaas_charges
  for select to authenticated using (public.contaju_can_access_org(org_id));
drop policy if exists contaju_asaas_receipts_select on public.contaju_asaas_receipts;
create policy contaju_asaas_receipts_select on public.contaju_asaas_receipts
  for select to authenticated using (public.contaju_can_access_org(org_id));
-- credentials, customers e events: sem policy (só o servidor, com service_role, enxerga)

-- 6) Baixa feita pelo sistema: reservar, confirmar, registrar erro, tentar de novo ---------------
-- Reserva (por 3 minutos) as cobranças pagas que ainda não foram baixadas, para que duas abas
-- abertas nunca baixem a mesma. Linhas com erro não voltam sozinhas: precisam de "tentar de novo".
create or replace function public.contaju_asaas_claim(p_org uuid, p_limit integer default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_charges jsonb;
  v_receipts jsonb;
begin
  if auth.uid() is null or not public.contaju_can_access_org(p_org) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;

  with pegas as (
    select c.id from public.contaju_asaas_charges c
    where c.org_id = p_org and c.applied_at is null and c.apply_error is null
      and c.status in ('RECEIVED', 'RECEIVED_IN_CASH')
      and (c.claimed_at is null or c.claimed_at < now() - interval '3 minutes')
    order by c.paid_at nulls last, c.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  ), marcadas as (
    update public.contaju_asaas_charges c set claimed_at = now()
    from pegas where c.id = pegas.id
    returning c.*
  )
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) into v_charges from marcadas m;

  with pegas as (
    select r.id from public.contaju_asaas_receipts r
    where r.org_id = p_org and r.applied_at is null and r.apply_error is null
      and r.status in ('RECEIVED', 'RECEIVED_IN_CASH')
      and (r.claimed_at is null or r.claimed_at < now() - interval '3 minutes')
    order by r.paid_at nulls last, r.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  ), marcadas as (
    update public.contaju_asaas_receipts r set claimed_at = now()
    from pegas where r.id = pegas.id
    returning r.*
  )
  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) into v_receipts from marcadas m;

  return jsonb_build_object('charges', v_charges, 'receipts', v_receipts);
end;
$$;

create or replace function public.contaju_asaas_mark_applied(p_kind text, p_id uuid, p_settlement_id text, p_title_id text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Sem acesso' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    select org_id into v_org from public.contaju_asaas_charges where id = p_id;
  elsif p_kind = 'receipt' then
    select org_id into v_org from public.contaju_asaas_receipts where id = p_id;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  if v_org is null or not public.contaju_can_access_org(v_org) then raise exception 'Sem acesso a esta empresa' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    update public.contaju_asaas_charges set applied_at = now(), settlement_id = p_settlement_id, apply_error = null, updated_at = now()
     where id = p_id and applied_at is null;
  else
    update public.contaju_asaas_receipts set applied_at = now(), settlement_id = p_settlement_id, title_id = coalesce(p_title_id, title_id), apply_error = null, updated_at = now()
     where id = p_id and applied_at is null;
  end if;
end;
$$;

create or replace function public.contaju_asaas_mark_error(p_kind text, p_id uuid, p_error text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_msg text := pg_catalog.left(coalesce(p_error, 'Erro ao dar baixa'), 300);
begin
  if auth.uid() is null then raise exception 'Sem acesso' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    select org_id into v_org from public.contaju_asaas_charges where id = p_id;
  elsif p_kind = 'receipt' then
    select org_id into v_org from public.contaju_asaas_receipts where id = p_id;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  if v_org is null or not public.contaju_can_access_org(v_org) then raise exception 'Sem acesso a esta empresa' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    update public.contaju_asaas_charges set apply_error = v_msg, claimed_at = null, updated_at = now() where id = p_id and applied_at is null;
  else
    update public.contaju_asaas_receipts set apply_error = v_msg, claimed_at = null, updated_at = now() where id = p_id and applied_at is null;
  end if;
end;
$$;

create or replace function public.contaju_asaas_retry(p_kind text, p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Sem acesso' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    select org_id into v_org from public.contaju_asaas_charges where id = p_id;
  elsif p_kind = 'receipt' then
    select org_id into v_org from public.contaju_asaas_receipts where id = p_id;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  if v_org is null or not public.contaju_can_access_org(v_org) then raise exception 'Sem acesso a esta empresa' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    update public.contaju_asaas_charges set apply_error = null, claimed_at = null, updated_at = now() where id = p_id and applied_at is null;
  else
    update public.contaju_asaas_receipts set apply_error = null, claimed_at = null, updated_at = now() where id = p_id and applied_at is null;
  end if;
end;
$$;

-- Dispensar: (a) baixa pendente que não deve ser feita (ex.: título já baixado à mão) -> marca como resolvida sem criar nada,
-- guardando a nota (se houver) para alguém conferir; (b) item já baixado que pedia revisão -> "entendi", limpa o aviso.
create or replace function public.contaju_asaas_dismiss(p_kind text, p_id uuid, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Sem acesso' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    select org_id into v_org from public.contaju_asaas_charges where id = p_id;
  elsif p_kind = 'receipt' then
    select org_id into v_org from public.contaju_asaas_receipts where id = p_id;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  if v_org is null or not public.contaju_can_access_org(v_org) then raise exception 'Sem acesso a esta empresa' using errcode = '42501'; end if;
  if p_kind = 'charge' then
    update public.contaju_asaas_charges set
      revisar_motivo = case when applied_at is not null then null else pg_catalog.left(p_note, 200) end,
      applied_at = coalesce(applied_at, now()), settlement_id = coalesce(settlement_id, 'DISPENSADA'),
      apply_error = null, updated_at = now()
    where id = p_id;
  else
    update public.contaju_asaas_receipts set applied_at = now(), settlement_id = 'DISPENSADA', apply_error = null, updated_at = now() where id = p_id and applied_at is null;
  end if;
end;
$$;

-- 7) Avisos do Asaas (somente servidor): atualiza a cobrança ou registra a receita ---------------
-- event_in = corpo do aviso do Asaas; customer_in = dados do cliente quando o servidor precisou buscar.
create or replace function public.contaju_asaas_apply_event(p_org uuid, event_in jsonb, customer_in jsonb default null, p_crm_prefix text default 'CRM Varejo')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id text := event_in ->> 'id';
  v_type text := event_in ->> 'event';
  v_pay jsonb := event_in -> 'payment';
  v_pay_id text := event_in -> 'payment' ->> 'id';
  v_status text := event_in -> 'payment' ->> 'status';
  v_value numeric;
  v_net numeric;
  v_orig numeric;
  v_due date;
  v_paid date;
  c public.contaju_asaas_charges%rowtype;
  v_cfg public.contaju_asaas_config%rowtype;
  v_rows integer;
begin
  if v_event_id is null or pg_catalog.char_length(v_event_id) not between 1 and 200 or v_type is null
     or pg_catalog.char_length(v_type) > 80 or v_pay_id is null then
    raise exception 'Evento inválido' using errcode = '22023';
  end if;
  begin v_value := nullif(v_pay ->> 'value', '')::numeric; exception when others then v_value := null; end;
  begin v_net := nullif(v_pay ->> 'netValue', '')::numeric; exception when others then v_net := null; end;
  begin v_orig := nullif(v_pay ->> 'originalValue', '')::numeric; exception when others then v_orig := null; end;
  begin v_due := nullif(v_pay ->> 'dueDate', '')::date; exception when others then v_due := null; end;
  begin v_paid := coalesce(nullif(v_pay ->> 'clientPaymentDate', '')::date, nullif(v_pay ->> 'paymentDate', '')::date); exception when others then v_paid := null; end;

  select * into c from public.contaju_asaas_charges x where x.asaas_payment_id = v_pay_id and x.org_id = p_org for update;

  insert into public.contaju_asaas_events (event_id, org_id, event_type, payment_id, outcome)
    values (v_event_id, p_org, v_type, v_pay_id, case when c.id is null then 'ignored' else 'processed' end)
    on conflict (org_id, event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return pg_catalog.jsonb_build_object('status', 'duplicate'); end if;

  -- Não é cobrança nossa: só interessa se for assinatura do CRM Varejo já recebida.
  if c.id is null then
    select * into v_cfg from public.contaju_asaas_config where org_id = p_org;
    if found and v_cfg.importar_assinaturas_crm
       and (v_pay ->> 'description') like (p_crm_prefix || '%')
       and v_type in ('PAYMENT_RECEIVED') and v_value is not null and v_value > 0 then
      insert into public.contaju_asaas_receipts (org_id, asaas_payment_id, description, customer_name, customer_document, customer_email,
        value, net_value, due_date, paid_at, status)
      values (p_org, v_pay_id, pg_catalog.left(v_pay ->> 'description', 200),
        pg_catalog.left(customer_in ->> 'name', 200), pg_catalog.regexp_replace(coalesce(customer_in ->> 'cpfCnpj', ''), '\D', '', 'g'),
        pg_catalog.left(customer_in ->> 'email', 200), v_value, v_net, v_due, coalesce(v_paid, current_date), coalesce(v_status, 'RECEIVED'))
      on conflict (org_id, asaas_payment_id) do nothing;
      update public.contaju_asaas_events set outcome = 'processed' where org_id = p_org and event_id = v_event_id;
      return pg_catalog.jsonb_build_object('status', 'receipt');
    end if;
    return pg_catalog.jsonb_build_object('status', 'ignored');
  end if;

  if v_type in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_UPDATED', 'PAYMENT_CREATED', 'PAYMENT_OVERDUE', 'PAYMENT_RESTORED',
                'PAYMENT_ANTICIPATED', 'PAYMENT_AWAITING_RISK_ANALYSIS', 'PAYMENT_APPROVED_BY_RISK_ANALYSIS') then
    -- Nunca "desfaz" um pagamento já registrado por causa de um aviso antigo chegando atrasado.
    if c.status in ('RECEIVED', 'RECEIVED_IN_CASH') and coalesce(v_status, '') in ('PENDING', 'OVERDUE', 'CONFIRMED') then
      return pg_catalog.jsonb_build_object('status', 'processed', 'charge_id', c.id);
    end if;
    update public.contaju_asaas_charges x set
      status = coalesce(v_status, x.status),
      value = coalesce(v_value, x.value),
      original_value = coalesce(v_orig, x.original_value),
      net_value = coalesce(v_net, x.net_value),
      due_date = coalesce(v_due, x.due_date),
      invoice_url = coalesce(v_pay ->> 'invoiceUrl', x.invoice_url),
      bank_slip_url = coalesce(v_pay ->> 'bankSlipUrl', x.bank_slip_url),
      nosso_numero = coalesce(v_pay ->> 'nossoNumero', x.nosso_numero),
      paid_at = case when coalesce(v_status, '') in ('RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED') then coalesce(v_paid, x.paid_at, current_date) else x.paid_at end,
      synced_at = now(), updated_at = now()
    where x.id = c.id;
  elsif v_type in ('PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_REFUND_IN_PROGRESS') then
    update public.contaju_asaas_charges x set
      status = case when v_type = 'PAYMENT_DELETED' then 'DELETED' when v_type = 'PAYMENT_REFUNDED' then 'REFUNDED' else coalesce(v_status, x.status) end,
      -- Se a baixa já tinha sido dada no financeiro, alguém precisa olhar (o sistema não estorna sozinho)
      revisar_motivo = case when x.applied_at is not null and x.settlement_id is distinct from 'DISPENSADA'
        then 'Cobrança alterada no Asaas depois da baixa (' || v_type || '). Confira e estorne a baixa se for o caso.' else x.revisar_motivo end,
      synced_at = now(), updated_at = now()
    where x.id = c.id;
  else
    update public.contaju_asaas_events set outcome = 'ignored' where org_id = p_org and event_id = v_event_id;
    return pg_catalog.jsonb_build_object('status', 'ignored', 'charge_id', c.id);
  end if;
  return pg_catalog.jsonb_build_object('status', 'processed', 'charge_id', c.id);
end;
$$;

-- 8) Permissões das funções ---------------------------------------------------------------------
revoke all on function public.contaju_asaas_claim(uuid, integer), public.contaju_asaas_mark_applied(text, uuid, text, text),
  public.contaju_asaas_mark_error(text, uuid, text), public.contaju_asaas_retry(text, uuid), public.contaju_asaas_dismiss(text, uuid, text) from public, anon;
grant execute on function public.contaju_asaas_claim(uuid, integer), public.contaju_asaas_mark_applied(text, uuid, text, text),
  public.contaju_asaas_mark_error(text, uuid, text), public.contaju_asaas_retry(text, uuid), public.contaju_asaas_dismiss(text, uuid, text) to authenticated, service_role;

revoke all on function public.contaju_asaas_apply_event(uuid, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.contaju_asaas_apply_event(uuid, jsonb, jsonb, text) to service_role;
