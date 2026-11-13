// ==============================================================================
// Cliente HTTP do Asaas. A chave de cada empresa vem do banco (cifrada) e só existe aqui, no
// servidor. Nenhum log leva chave, CPF/CNPJ ou cabeçalho: só o status HTTP e a 1ª descrição de
// erro devolvida pelo Asaas (texto técnico dele, sem dados do cliente).
// ==============================================================================

export const ASAAS_URLS = {
  sandbox: 'https://api-sandbox.asaas.com/v3',
  producao: 'https://api.asaas.com/v3'
};

export class GatewayError extends Error {
  constructor(recusado, status = 0, detalhe = '') {
    super('gateway');
    this.recusado = recusado; // true = o Asaas recusou (4xx); false = fora do ar / sem resposta
    this.status = status;
    this.detalhe = detalhe;
  }
}

/** Endereço do Asaas por ambiente. ASAAS_API_URL_OVERRIDE só existe para os testes automatizados. */
export function baseDoAmbiente(ambiente, env = process.env) {
  if (env.ASAAS_API_URL_OVERRIDE) return String(env.ASAAS_API_URL_OVERRIDE).replace(/\/$/, '');
  return ambiente === 'producao' ? ASAAS_URLS.producao : ASAAS_URLS.sandbox;
}

export async function asaas(cx, caminho, init = {}) {
  let resposta;
  try {
    resposta = await fetch(`${cx.base}${caminho}`, {
      ...init,
      headers: { 'content-type': 'application/json', access_token: cx.chave, 'user-agent': 'financeiro-contaju-cobranca' },
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new GatewayError(false);
  }
  const texto = await resposta.text();
  let dados = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = null;
  }
  if (!resposta.ok) {
    const erros = dados && Array.isArray(dados.errors) ? dados.errors : [];
    const detalhe = String((erros[0] && erros[0].description) || '').slice(0, 200);
    console.error(JSON.stringify({ asaas_erro: resposta.status, caminho: caminho.split('?')[0], detalhe }));
    throw new GatewayError(resposta.status >= 400 && resposta.status < 500, resposta.status, detalhe);
  }
  return dados || {};
}

export const dataIso = d => d.toISOString().slice(0, 10);
/** "Hoje" no Brasil (UTC-3), porque o servidor roda em UTC e à noite já seria amanhã. */
export const hojeBrasil = () => dataIso(new Date(Date.now() - 3 * 3600 * 1000));
export const somarDias = (iso, dias) => dataIso(new Date(new Date(`${iso}T12:00:00Z`).getTime() + dias * 86_400_000));

export const STATUS_VIVOS = ['PENDING', 'AWAITING_RISK_ANALYSIS', 'OVERDUE', 'CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH'];
export const STATUS_PAGOS = ['RECEIVED', 'RECEIVED_IN_CASH'];
