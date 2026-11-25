-- Aplicada em producao em 25/11/2026 (via MCP). Registro do que foi apagado + gatilho que impede recriar.
create table if not exists public.contaju_deleted_records (
  org_id uuid not null references public.contaju_organizations(id) on delete cascade,
  table_name text not null,
  record_id text not null,
  reason text,
  deleted_at timestamptz not null default now(),
  primary key (org_id, table_name, record_id)
);
alter table public.contaju_deleted_records enable row level security;
revoke all on public.contaju_deleted_records from anon;
grant select, insert on public.contaju_deleted_records to authenticated;
drop policy if exists contaju_deleted_records_select on public.contaju_deleted_records;
create policy contaju_deleted_records_select on public.contaju_deleted_records for select to authenticated using (public.contaju_can_access_org(org_id));
drop policy if exists contaju_deleted_records_insert on public.contaju_deleted_records;
create policy contaju_deleted_records_insert on public.contaju_deleted_records for insert to authenticated with check (public.contaju_can_access_org(org_id));

create or replace function public.contaju_skip_deleted_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.contaju_deleted_records d
             where d.org_id = new.org_id and d.table_name = tg_table_name and d.record_id = new.id) then
    return null;
  end if;
  return new;
end; $$;
revoke all on function public.contaju_skip_deleted_record() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['contaju_financial_titles','contaju_sales','contaju_settlements','contaju_financial_movements'] loop
    execute format('drop trigger if exists trg_skip_deleted on public.%I', t);
    execute format('create trigger trg_skip_deleted before insert on public.%I for each row execute function public.contaju_skip_deleted_record()', t);
  end loop;
end $$;
