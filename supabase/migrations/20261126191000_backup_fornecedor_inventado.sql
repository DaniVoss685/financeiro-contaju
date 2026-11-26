-- Cópia (já aplicada em 26/11/2026) do fornecedor que o sistema tinha preenchido sozinho (primeiro da lista),
-- feita antes de limpar 366 despesas da Contaju. Para desfazer a limpeza:
--   update contaju_financial_titles t set counterparty_id = b.counterparty_id
--   from contaju_backup_fornecedor_20261126 b where t.id = b.title_id and t.counterparty_id is null;
create table if not exists public.contaju_backup_fornecedor_20261126 (
  title_id text primary key,
  counterparty_id text not null,
  description text,
  backed_up_at timestamptz not null default now()
);
alter table public.contaju_backup_fornecedor_20261126 enable row level security;
