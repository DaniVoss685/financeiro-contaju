import { getSupabaseClient } from './supabaseClient';
import { getActiveOrgId } from './authService';

/**
 * Cobrança de honorários pelo Asaas (boleto e Pix).
 * - Tudo que fala com o Asaas passa pelo servidor (/api/asaas): a chave nunca chega ao navegador.
 * - A baixa do que foi pago é feita AQUI, no navegador (ver asaasBaixaService.ts), pelo mesmo caminho da baixa manual.
 */

export type AsaasAmbiente = 'sandbox' | 'producao';

export interface AsaasConfig {
  org_id: string;
  ambiente: AsaasAmbiente;
  ativo: boolean;
  robo_ativo: boolean;
  antecedencia_dias: number;
  limite_por_execucao: number;
  bank_account_id: string | null;
  receita_conta_id: string | null;
  importar_assinaturas_crm: boolean;
  notificar_cliente: boolean;
  multa_percentual: number | null;
  juros_mensal_percentual: number | null;
  webhook_ativado_em: string | null;
  ultima_execucao_robo: string | null;
  ultimo_resumo_robo: {
    em: string; gerados: number; pulados: number; restantes: number; verificadas: number; atualizadas: number; erro: string | null;
    detalhePulados?: { titulo?: string; cliente?: string; motivo: string }[];
  } | null;
}

export interface AsaasStatusInfo {
  servidorPronto: boolean;
  faltando?: string[];
  bancoPronto: boolean;
  config: AsaasConfig | null;
  temChave?: boolean;
  webhookUrl?: string | null;
  podeGerenciar: boolean;
}

export interface AsaasConfigInput {
  ambiente: AsaasAmbiente;
  chave: string;
  ativo: boolean;
  roboAtivo: boolean;
  antecedenciaDias: number;
  limitePorExecucao: number;
  bankAccountId: string;
  receitaContaId: string;
  importarAssinaturasCrm: boolean;
  notificarCliente: boolean;
  multaPercentual: string;
  jurosMensalPercentual: string;
  confirmarProducao: boolean;
}

export interface AsaasCharge {
  id: string;
  org_id: string;
  title_id: string;
  counterparty_id: string | null;
  asaas_payment_id: string;
  billing_type: 'BOLETO' | 'PIX' | 'UNDEFINED';
  value: number;
  original_value: number | null;
  net_value: number | null;
  due_date: string;
  status: string;
  invoice_url: string | null;
  bank_slip_url: string | null;
  identification_field: string | null;
  paid_at: string | null;
  origin: 'MANUAL' | 'ROBO';
  claimed_at: string | null;
  applied_at: string | null;
  settlement_id: string | null;
  apply_error: string | null;
  revisar_motivo: string | null;
  created_at: string;
}

export interface AsaasReceipt {
  id: string;
  org_id: string;
  kind: 'ASSINATURA_CRM';
  asaas_payment_id: string;
  description: string | null;
  customer_name: string | null;
  customer_document: string | null;
  customer_email: string | null;
  value: number;
  net_value: number | null;
  due_date: string | null;
  paid_at: string | null;
  status: string;
  applied_at: string | null;
  title_id: string | null;
  apply_error: string | null;
  created_at: string;
}

export interface AsaasPrevia {
  ate: string;
  total: number;
  cabeNaProximaExecucao: number;
  itens: { titleId: string; titulo: string; descricao: string; cliente: string; vencimento: string; valor: number; forma: 'BOLETO' | 'PIX' }[];
  pulados: { titleId: string; titulo?: string; cliente?: string; motivo: string }[];
}

export interface AsaasGerarResultado {
  gerados: { titleId: string; titulo?: string; cliente?: string; forma: string; vencimento: string }[];
  pulados: { titleId: string; titulo?: string; cliente?: string; motivo: string }[];
  restantes: number;
}

export interface AsaasDetalhes {
  pix: { imagem: string; codigo: string } | null;
  linhaDigitavel: string | null;
  linkFatura: string | null;
  linkBoleto: string | null;
}

export class AsaasError extends Error {
  codigo?: string;
  status: number;
  constructor(message: string, status: number, codigo?: string) {
    super(message);
    this.name = 'AsaasError';
    this.status = status;
    this.codigo = codigo;
  }
}

async function obterToken(forcar = false): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new AsaasError('Conexão com o banco indisponível. Recarregue a página.', 0, 'SEM_SESSAO');
  let { data } = await client.auth.getSession();
  const expira = data.session?.expires_at ? data.session.expires_at * 1000 : 0;
  if (data.session && (forcar || expira - Date.now() < 60_000)) {
    const r = await client.auth.refreshSession();
    if (r.data.session) data = { session: r.data.session };
  }
  const token = data.session?.access_token;
  if (!token) throw new AsaasError('O login desta aba não está ativo. Saia do sistema e entre de novo com e-mail e senha.', 401, 'SEM_SESSAO');
  return token;
}

async function chamar<T>(action: string, dados: Record<string, unknown> = {}): Promise<T> {
  const orgId = getActiveOrgId();
  if (!orgId) throw new AsaasError('Escolha uma empresa para usar a cobrança.', 401, 'SEM_EMPRESA');
  const enviar = async (token: string) => {
    try {
      return await fetch('/api/asaas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, orgId, ...dados })
      });
    } catch {
      throw new AsaasError('Sem conexão com o servidor. Confira a internet e tente de novo.', 0, 'REDE');
    }
  };
  let resp = await enviar(await obterToken());
  if (resp.status === 401) resp = await enviar(await obterToken(true));
  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  if (!resp.ok) throw new AsaasError(json?.error || 'Não foi possível concluir. Tente de novo.', resp.status, json?.codigo);
  return json as T;
}

export const asaasApi = {
  status: () => chamar<AsaasStatusInfo>('status'),
  salvarConfig: (config: Partial<AsaasConfigInput>) => chamar<{ ok: true }>('salvar_config', { config }),
  testar: () => chamar<{ ok: true; ambiente: AsaasAmbiente }>('testar'),
  ativarAvisos: () => chamar<{ ok: boolean; manual?: boolean; url?: string; token?: string; motivo?: string }>('ativar_avisos'),
  previa: () => chamar<AsaasPrevia>('previa'),
  gerar: (titleIds: string[], extra: { forma?: 'BOLETO' | 'PIX'; vencimento?: string } = {}) => chamar<AsaasGerarResultado>('gerar', { titleIds, ...extra }),
  detalhes: (chargeId: string) => chamar<AsaasDetalhes>('detalhes', { chargeId }),
  cancelar: (chargeId: string) => chamar<{ ok: true }>('cancelar', { chargeId }),
  sincronizar: () => chamar<{ verificadas: number; atualizadas: number }>('sincronizar'),
  rodarAgora: () => chamar<NonNullable<AsaasConfig['ultimo_resumo_robo']>>('rodar_agora')
};

// ------------------------------------------------------------------------------
// Leitura direta (RLS: cada empresa só enxerga as suas)
// ------------------------------------------------------------------------------
const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  Boolean(e) && (e!.code === 'PGRST205' || e!.code === '42P01' || /could not find the table|does not exist/i.test(e!.message || ''));

export async function lerConfig(): Promise<AsaasConfig | null> {
  const client = getSupabaseClient();
  const orgId = getActiveOrgId();
  if (!client || !orgId) return null;
  const { data, error } = await client
    .from('contaju_asaas_config')
    .select('org_id, ambiente, ativo, robo_ativo, antecedencia_dias, limite_por_execucao, bank_account_id, receita_conta_id, importar_assinaturas_crm, notificar_cliente, multa_percentual, juros_mensal_percentual, webhook_ativado_em, ultima_execucao_robo, ultimo_resumo_robo')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return null;
  return (data as AsaasConfig | null) ?? null;
}

/** Cobranças da empresa, paginadas (o PostgREST corta em 1000 linhas por consulta). */
export async function listarCobrancas(): Promise<AsaasCharge[]> {
  const client = getSupabaseClient();
  const orgId = getActiveOrgId();
  if (!client || !orgId) return [];
  const saida: AsaasCharge[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await client.from('contaju_asaas_charges').select('*').eq('org_id', orgId).order('due_date', { ascending: false }).range(de, de + 999);
    if (error) {
      if (tabelaAusente(error)) return [];
      throw new AsaasError('Não foi possível carregar as cobranças.', 500);
    }
    saida.push(...((data as AsaasCharge[]) || []));
    if (!data || data.length < 1000) break;
  }
  return saida;
}

export async function listarReceitas(): Promise<AsaasReceipt[]> {
  const client = getSupabaseClient();
  const orgId = getActiveOrgId();
  if (!client || !orgId) return [];
  const { data, error } = await client.from('contaju_asaas_receipts').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(300);
  if (error) return [];
  return (data as AsaasReceipt[]) || [];
}

// ------------------------------------------------------------------------------
// Baixa feita pelo sistema (reservar, confirmar, registrar erro)
// ------------------------------------------------------------------------------
export async function reservarRecebimentos(): Promise<{ charges: AsaasCharge[]; receipts: AsaasReceipt[] }> {
  const client = getSupabaseClient();
  const orgId = getActiveOrgId();
  if (!client || !orgId) return { charges: [], receipts: [] };
  const { data, error } = await client.rpc('contaju_asaas_claim', { p_org: orgId, p_limit: 20 });
  if (error) return { charges: [], receipts: [] };
  return { charges: (data?.charges as AsaasCharge[]) || [], receipts: (data?.receipts as AsaasReceipt[]) || [] };
}

export async function marcarAplicada(tipo: 'charge' | 'receipt', id: string, settlementId: string, titleId?: string): Promise<void> {
  const { error } = await getSupabaseClient()!.rpc('contaju_asaas_mark_applied', { p_kind: tipo, p_id: id, p_settlement_id: settlementId, p_title_id: titleId ?? null });
  if (error) throw new AsaasError('A baixa foi dada, mas não conseguimos registrar o vínculo com o Asaas.', 500);
}
export async function marcarErro(tipo: 'charge' | 'receipt', id: string, mensagem: string): Promise<void> {
  await getSupabaseClient()!.rpc('contaju_asaas_mark_error', { p_kind: tipo, p_id: id, p_error: mensagem });
}
export async function tentarDeNovo(tipo: 'charge' | 'receipt', id: string): Promise<void> {
  await getSupabaseClient()!.rpc('contaju_asaas_retry', { p_kind: tipo, p_id: id });
}
export async function dispensar(tipo: 'charge' | 'receipt', id: string, nota?: string): Promise<void> {
  const { error } = await getSupabaseClient()!.rpc('contaju_asaas_dismiss', { p_kind: tipo, p_id: id, p_note: nota ?? null });
  if (error) throw new AsaasError('Não foi possível dispensar este item.', 500);
}

export const ASAAS_CHANGED_EVENT = 'contaju-asaas-changed';
export const avisarMudancaAsaas = () => window.dispatchEvent(new Event(ASAAS_CHANGED_EVENT));

/** Texto simples do status do Asaas (versão para o cliente: sem termos técnicos). */
export function situacaoDaCobranca(c: Pick<AsaasCharge, 'status' | 'applied_at' | 'apply_error'>): { texto: string; tom: 'success' | 'info' | 'danger' | 'gold' | 'neutral' } {
  if (['RECEIVED', 'RECEIVED_IN_CASH'].includes(c.status)) {
    if (c.apply_error) return { texto: 'Pago, baixa com problema', tom: 'danger' };
    return c.applied_at ? { texto: 'Pago e baixado', tom: 'success' } : { texto: 'Pago, baixando…', tom: 'info' };
  }
  if (c.status === 'CONFIRMED') return { texto: 'Pago, a compensar', tom: 'info' };
  if (c.status === 'OVERDUE') return { texto: 'Em atraso', tom: 'danger' };
  if (c.status === 'PENDING' || c.status === 'AWAITING_RISK_ANALYSIS') return { texto: 'A vencer', tom: 'neutral' };
  if (c.status === 'DELETED') return { texto: 'Cancelada', tom: 'gold' };
  if (['REFUNDED', 'REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE'].includes(c.status)) return { texto: 'Estornada', tom: 'gold' };
  return { texto: 'Outra situação', tom: 'neutral' };
}
