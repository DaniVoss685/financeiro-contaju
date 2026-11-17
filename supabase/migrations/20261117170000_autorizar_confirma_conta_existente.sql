-- Autorizar um e-mail na Consultoria também confirma a conta, caso a pessoa
-- já tenha se cadastrado antes da autorização (o gatilho só cobria conta nova).
-- Aditiva e idempotente.
create or replace function public.contaju_add_invitation(p_email text, p_company text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.contaju_is_consultant() then raise exception 'Apenas consultores podem autorizar empresas'; end if;
  insert into public.contaju_invitations(email, company_name, invited_by)
  values (lower(trim(p_email)), trim(p_company), lower(auth.jwt()->>'email'))
  on conflict (email) do update set company_name = excluded.company_name where public.contaju_invitations.claimed_org_id is null;

  -- conta já criada e ainda não confirmada: libera na hora
  update auth.users
     set email_confirmed_at = now()
   where lower(email) = lower(trim(p_email))
     and email_confirmed_at is null;
end $function$;
