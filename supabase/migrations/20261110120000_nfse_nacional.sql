-- ==============================================================================
-- NFS-e Nacional (Portal Nacional / Sefin Nacional) — Financeiro Contaju
-- Migration ADITIVA e IDEMPOTENTE: só cria tabelas, índices, policies e uma função.
-- Não altera nem apaga nada que já existe.
--
-- Modelo de segurança:
--   * Leitura: usuários da empresa (e consultores) leem configuração e notas via RLS.
--   * Escrita: SOMENTE o servidor (/api/nfse, com service_role). Não há policy de
--     INSERT/UPDATE/DELETE para o navegador, então ninguém forja uma nota "autorizada".
--   * Certificado digital: tabela sem NENHUMA policy (nem leitura). O arquivo e a senha
--     ficam cifrados (AES-256-GCM) com um segredo que só existe no servidor.
-- ==============================================================================

-- 1) Configuração fiscal do emissor (uma linha por empresa) -------------------
create table if not exists public.contaju_nfse_config (
  org_id uuid primary key references public.contaju_organizations(id),
  ambiente smallint not null default 2 check (ambiente in (1, 2)),          -- 1 = produção, 2 = testes (produção restrita)
  cnpj text,
  inscricao_municipal text,
  codigo_municipio text check (codigo_municipio is null or codigo_municipio ~ '^[0-9]{7}$'), -- IBGE 7 dígitos
  telefone text,
  email text,
  op_simp_nac smallint check (op_simp_nac in (1, 2, 3)),                    -- 1 não optante, 2 MEI, 3 ME/EPP
  reg_ap_trib_sn smallint check (reg_ap_trib_sn in (1, 2, 3)),
  reg_esp_trib smallint not null default 0 check (reg_esp_trib between 0 and 6),
  serie text not null default '1' check (serie ~ '^[0-9]{1,5}$'),
  proximo_numero_producao bigint not null default 1 check (proximo_numero_producao >= 1),
  proximo_numero_testes bigint not null default 1 check (proximo_numero_testes >= 1),
  padrao_c_trib_nac text check (padrao_c_trib_nac is null or padrao_c_trib_nac ~ '^[0-9]{6}$'),
  padrao_c_nbs text check (padrao_c_nbs is null or padrao_c_nbs ~ '^[0-9]{9}$'),
  padrao_descricao text,
  p_tot_trib_sn numeric(5, 2) check (p_tot_trib_sn is null or (p_tot_trib_sn >= 0 and p_tot_trib_sn < 100)),
  -- Dados públicos do certificado (o arquivo em si fica em contaju_nfse_certificates)
  cert_titular text,
  cert_documento text,
  cert_validade timestamptz,
  cert_enviado_em timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contaju_nfse_config enable row level security;

drop policy if exists contaju_nfse_config_select on public.contaju_nfse_config;
create policy contaju_nfse_config_select on public.contaju_nfse_config
  for select to authenticated
  using (public.contaju_can_access_org(org_id));

revoke all on public.contaju_nfse_config from anon;
revoke insert, update, delete, truncate on public.contaju_nfse_config from authenticated;

-- 2) Certificado digital A1 cifrado (somente servidor) ------------------------
create table if not exists public.contaju_nfse_certificates (
  org_id uuid primary key references public.contaju_organizations(id),
  pfx_cifrado text not null,
  senha_cifrada text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contaju_nfse_certificates enable row level security;
-- Sem policies de propósito: nem anon nem authenticated enxergam esta tabela.
revoke all on public.contaju_nfse_certificates from anon, authenticated;

-- 3) Notas emitidas -----------------------------------------------------------
create table if not exists public.contaju_nfse_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.contaju_organizations(id),
  idempotency_key text not null,
  ambiente smallint not null check (ambiente in (1, 2)),
  serie text not null,
  numero_dps bigint not null,
  id_dps text not null,
  status text not null default 'PROCESSANDO'
    check (status in ('PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA')),
  chave_acesso text,
  numero_nfse text,
  customer_id text,
  sale_id text,
  tomador_nome text not null,
  tomador_documento text not null,
  tomador_email text,
  descricao text not null,
  c_trib_nac text not null,
  c_nbs text not null,
  valor_servico numeric(15, 2) not null check (valor_servico > 0),
  competencia date not null,
  iss_retido boolean not null default false,
  aliquota_iss numeric(5, 2),
  dados_envio jsonb,
  xml_dps text,
  xml_nfse text,
  mensagem text,
  cancel_codigo smallint,
  cancel_motivo text,
  cancelada_em timestamptz,
  autorizada_em timestamptz,
  emitida_por uuid,
  emitida_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um clique = uma nota (protege contra duplo envio)
create unique index if not exists contaju_nfse_notes_idem_uq
  on public.contaju_nfse_notes (org_id, idempotency_key);
-- A numeração nunca se repete dentro da mesma empresa/ambiente/série
create unique index if not exists contaju_nfse_notes_numero_uq
  on public.contaju_nfse_notes (org_id, ambiente, serie, numero_dps);
-- Uma venda só pode ter uma nota viva (em processamento ou autorizada) por ambiente
create unique index if not exists contaju_nfse_notes_venda_uq
  on public.contaju_nfse_notes (org_id, ambiente, sale_id)
  where sale_id is not null and status in ('PROCESSANDO', 'AUTORIZADA');
create index if not exists contaju_nfse_notes_lista_idx
  on public.contaju_nfse_notes (org_id, ambiente, created_at desc);

alter table public.contaju_nfse_notes enable row level security;

drop policy if exists contaju_nfse_notes_select on public.contaju_nfse_notes;
create policy contaju_nfse_notes_select on public.contaju_nfse_notes
  for select to authenticated
  using (public.contaju_can_access_org(org_id));

revoke all on public.contaju_nfse_notes from anon;
revoke insert, update, delete, truncate on public.contaju_nfse_notes from authenticated;

-- 4) Reserva atômica do próximo número da DPS ---------------------------------
-- O UPDATE trava a linha da empresa: duas emissões simultâneas nunca pegam o mesmo número.
create or replace function public.contaju_nfse_reservar_numero(p_org uuid, p_ambiente smallint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero bigint;
begin
  if p_ambiente = 1 then
    update public.contaju_nfse_config
       set proximo_numero_producao = proximo_numero_producao + 1, updated_at = now()
     where org_id = p_org
     returning proximo_numero_producao - 1 into v_numero;
  else
    update public.contaju_nfse_config
       set proximo_numero_testes = proximo_numero_testes + 1, updated_at = now()
     where org_id = p_org
     returning proximo_numero_testes - 1 into v_numero;
  end if;
  if v_numero is null then
    raise exception 'Configuração de NFS-e não encontrada para a empresa %', p_org;
  end if;
  return v_numero;
end;
$$;

revoke all on function public.contaju_nfse_reservar_numero(uuid, smallint) from public, anon, authenticated;
grant execute on function public.contaju_nfse_reservar_numero(uuid, smallint) to service_role;
