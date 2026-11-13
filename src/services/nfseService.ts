import { getSupabaseClient } from './supabaseClient';
import { getActiveOrgId } from './authService';

/**
 * Notas fiscais de serviço (NFS-e Nacional).
 * Tudo passa pelo servidor (/api/nfse): é ele que guarda o certificado digital,
 * assina e fala com o Portal Nacional. O navegador nunca vê o certificado.
 */

export type NfseStatus = 'PROCESSANDO' | 'AUTORIZADA' | 'REJEITADA' | 'CANCELADA';

export interface NfseNote {
  id: string;
  ambiente: 1 | 2;
  serie: string;
  numero_dps: number;
  status: NfseStatus;
  chave_acesso: string | null;
  numero_nfse: string | null;
  customer_id: string | null;
  sale_id: string | null;
  tomador_nome: string;
  tomador_documento: string;
  tomador_email: string | null;
  descricao: string;
  c_trib_nac: string;
  c_nbs: string;
  valor_servico: number;
  competencia: string;
  iss_retido: boolean;
  aliquota_iss: number | null;
  mensagem: string | null;
  cancel_codigo: number | null;
  cancel_motivo: string | null;
  cancelada_em: string | null;
  autorizada_em: string | null;
  emitida_por_nome: string | null;
  created_at: string;
}

export interface NfseServicoUsado {
  cTribNac: string;
  cNbs: string;
  descricao: string;
  vezes: number;
}

export interface NfseConfig {
  org_id: string;
  ambiente: 1 | 2;
  cnpj: string | null;
  inscricao_municipal: string | null;
  codigo_municipio: string | null;
  telefone: string | null;
  email: string | null;
  op_simp_nac: 1 | 2 | 3 | null;
  reg_ap_trib_sn: 1 | 2 | 3 | null;
  reg_esp_trib: number;
  serie: string;
  proximo_numero_producao: number;
  proximo_numero_testes: number;
  padrao_c_trib_nac: string | null;
  padrao_c_nbs: string | null;
  padrao_descricao: string | null;
  p_tot_trib_sn: number | null;
  cert_titular: string | null;
  cert_documento: string | null;
  cert_validade: string | null;
  cert_enviado_em: string | null;
}

export interface NfseStatusInfo {
  servidorPronto: boolean;
  faltando?: string[];
  bancoPronto: boolean;
  config: NfseConfig | null;
  podeGerenciar: boolean;
}

export interface NfseConfigInput {
  ambiente: 1 | 2;
  cnpj: string;
  inscricaoMunicipal: string;
  codigoMunicipio: string;
  telefone: string;
  email: string;
  opSimpNac: number | '';
  regApTribSN: number | '';
  regEspTrib: number;
  serie: string;
  proximoNumeroProducao: string;
  padraoCTribNac: string;
  padraoCNbs: string;
  padraoDescricao: string;
  pTotTribSN: string;
}

export interface NfseIbsCbsInput {
  informar: boolean;
  indFinal: '0' | '1';
  cIndOp: string;
  tpEnteGov: string;
  tpOper: string;
  indDest: '0' | '1';
  dest: { documento: string; nome: string; endereco: { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; codigoMunicipio: string } | null } | null;
  cst: string;
  cClassTrib: string;
  refNFSe: string[];
}

export interface NfseEmitInput {
  customerId: string | null;
  saleId: string | null;
  tomadorNome: string;
  tomadorDocumento: string;
  tomadorEmail: string;
  tomadorTelefone: string;
  ibscbs: NfseIbsCbsInput | null;
  tomadorEndereco: { cep: string; logradouro: string; numero: string; complemento: string; bairro: string; codigoMunicipio: string } | null;
  descricao: string;
  informacoesComplementares: string;
  docRef: string;
  idDocTec: string;
  pisCofinsCst: string;
  pisCofinsTpRet: string;
  retIrrf: number;
  retCsll: number;
  retCp: number;
  cTribNac: string;
  cNbs: string;
  valorServico: number;
  competencia: string;
  issRetido: boolean;
  aliquotaIss: string;
}

export class NfseError extends Error {
  codigo?: string;
  status: number;
  constructor(message: string, status: number, codigo?: string) {
    super(message);
    this.name = 'NfseError';
    this.status = status;
    this.codigo = codigo;
  }
}

async function obterToken(forcarRenovacao = false): Promise<string> {
  const client = getSupabaseClient();
  if (!client) throw new NfseError('Conexão com o banco indisponível. Recarregue a página.', 0, 'SEM_SESSAO');
  let { data } = await client.auth.getSession();
  const expira = data.session?.expires_at ? data.session.expires_at * 1000 : 0;
  if (data.session && (forcarRenovacao || expira - Date.now() < 60_000)) {
    const r = await client.auth.refreshSession();
    if (r.data.session) data = { session: r.data.session };
  }
  const token = data.session?.access_token;
  if (!token) {
    throw new NfseError('O login desta aba não está ativo. Saia do sistema (menu do usuário) e entre de novo com e-mail e senha.', 401, 'SEM_SESSAO');
  }
  return token;
}

async function chamar<T>(action: string, dados: Record<string, unknown> = {}): Promise<T> {
  const orgId = getActiveOrgId();
  if (!orgId) throw new NfseError('Escolha uma empresa para usar as notas fiscais.', 401, 'SEM_EMPRESA');

  const enviar = async (token: string) => {
    try {
      return await fetch('/api/nfse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, orgId, ...dados })
      });
    } catch {
      throw new NfseError('Sem conexão com o servidor. Confira a internet e tente de novo.', 0, 'REDE');
    }
  };

  let resp = await enviar(await obterToken());
  // Sessão recusada: renova uma vez e tenta de novo antes de desistir.
  if (resp.status === 401) resp = await enviar(await obterToken(true));

  let json: any = null;
  try {
    json = await resp.json();
  } catch {
    json = null;
  }
  if (!resp.ok) {
    throw new NfseError(json?.error || 'Não foi possível concluir a operação. Tente de novo.', resp.status, json?.codigo);
  }
  return json as T;
}

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const texto = String(reader.result || '');
      resolve(texto.slice(texto.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new NfseError('Não foi possível ler o arquivo do certificado.', 0));
    reader.readAsDataURL(file);
  });
}

export function baixarArquivo(blob: Blob, nome: string) {
  baixar(blob, nome);
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function novaChaveDeEnvio(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export const nfseService = {
  status: () => chamar<NfseStatusInfo>('status'),
  salvarConfig: (config: NfseConfigInput) => chamar<{ config: NfseConfig }>('salvar_config', { config }),
  async enviarCertificado(file: File, senha: string) {
    const pfxBase64 = await arquivoParaBase64(file);
    return chamar<{ config: NfseConfig; aviso: string | null }>('enviar_certificado', { pfxBase64, senha });
  },
  removerCertificado: () => chamar<{ config: NfseConfig | null }>('remover_certificado'),
  listar: (ambiente: 1 | 2, mes: string) => chamar<{ notas: NfseNote[] }>('listar', { ambiente, mes }),
  emitir: (nota: NfseEmitInput, idempotencyKey: string) => chamar<{ nota: NfseNote; repetida?: boolean }>('emitir', { nota, idempotencyKey }),
  servicosUsados: (ambiente: 1 | 2) => chamar<{ servicos: NfseServicoUsado[] }>('servicos_usados', { ambiente }),
  xmlLote: (noteIds: string[]) => chamar<{ notas: { id: string; xml: string }[] }>('xml_lote', { noteIds }),
  conferir: (noteId: string) => chamar<{ nota: NfseNote }>('conferir', { noteId }),
  cancelar: (noteId: string, codigoMotivo: number, motivo: string) => chamar<{ nota: NfseNote }>('cancelar', { noteId, codigoMotivo, motivo }),
  async baixarPdf(nota: NfseNote) {
    const r = await chamar<{ pdfBase64?: string; oficialIndisponivel?: boolean; nomeArquivo: string }>('pdf', { noteId: nota.id });
    if (r.pdfBase64) {
      const bytes = Uint8Array.from(atob(r.pdfBase64), c => c.charCodeAt(0));
      baixar(new Blob([bytes], { type: 'application/pdf' }), r.nomeArquivo);
      return;
    }
    // PDF oficial indisponível: monta o PDF auxiliar a partir do XML autorizado.
    const x = await chamar<{ xml: string }>('xml', { noteId: nota.id });
    const { gerarPdfNfse } = await import('../utils/nfsePdf');
    baixar(await gerarPdfNfse({ xml: x.xml, situacao: nota.status === 'CANCELADA' ? 'CANCELADA' : 'GERADA' }), r.nomeArquivo);
  },
  async baixarXml(noteId: string) {
    const r = await chamar<{ xml: string; nomeArquivo: string }>('xml', { noteId });
    baixar(new Blob([r.xml], { type: 'application/xml' }), r.nomeArquivo);
  }
};

export const soDigitos = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

export function formatarDocumento(doc: string | null | undefined): string {
  const d = soDigitos(doc);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '';
}

/** A empresa já pode emitir? Diz o que falta, em palavras simples. */
export function pendenciasDaConfig(config: NfseConfig | null): { dadosFiscais: boolean; certificado: boolean; certificadoVencido: boolean } {
  const dadosFiscais = Boolean(config && config.cnpj && config.codigo_municipio && config.op_simp_nac && (config.op_simp_nac !== 3 || config.reg_ap_trib_sn));
  const certificado = Boolean(config && config.cert_validade);
  const certificadoVencido = Boolean(config?.cert_validade && new Date(config.cert_validade) < new Date());
  return { dadosFiscais, certificado, certificadoVencido };
}
