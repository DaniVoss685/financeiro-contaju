-- Fornecedor/cliente do lançamento passa a ser opcional (como já é na tela "Nova despesa").
-- Antes a coluna era obrigatória e o sistema preenchia sozinho com o PRIMEIRO fornecedor/cliente da lista
-- (ex.: despesas sem fornecedor ficavam como "VALE ALIMENTACAO CAROL").
-- Aditiva e idempotente: só retira a obrigatoriedade; não apaga nem altera nenhum dado.
alter table public.contaju_financial_titles alter column counterparty_id drop not null;
