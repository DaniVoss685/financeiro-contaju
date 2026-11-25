-- Aplicada em producao em 25/11/2026 (via MCP). Movimentacao de baixa lancada como ajuste (mov-<baixa>-ajuste):
-- a movimentacao original recusada, se reenviada por um aparelho, e ignorada (nao conta o dinheiro duas vezes).
create or replace function public.contaju_skip_adjusted_movement()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.origin_type = 'BAIXA_TITULO' and new.id not like '%-ajuste' and new.id not like '%-fee'
     and exists (select 1 from public.contaju_financial_movements m
                 where m.org_id = new.org_id and m.origin_reference_id = new.origin_reference_id
                   and m.id = 'mov-' || new.origin_reference_id || '-ajuste') then
    return null;
  end if;
  return new;
end; $$;
revoke all on function public.contaju_skip_adjusted_movement() from public, anon, authenticated;
drop trigger if exists trg_skip_adjusted_movement on public.contaju_financial_movements;
create trigger trg_skip_adjusted_movement before insert on public.contaju_financial_movements
for each row execute function public.contaju_skip_adjusted_movement();
