/** Endereço do cliente para a NFS-e (formato do Portal Nacional). */
export interface EnderecoNfse {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  /** Código IBGE do município (7 dígitos). */
  codigoMunicipio: string;
  /** Só para mostrar na tela, ex.: "Iturama/MG". */
  municipioNome?: string;
}

export const enderecoVazio = (): EnderecoNfse => ({ cep: '', logradouro: '', numero: '', complemento: '', bairro: '', codigoMunicipio: '', municipioNome: '' });

export const cepPontuado = (c: string) => {
  const d = (c || '').replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/**
 * Separa o endereço digitado em um campo só no cadastro do cliente. Formato esperado (o mesmo que a
 * consulta de CNPJ grava): "RUA TAL, 310 - COMPLEMENTO - BAIRRO - CIDADE/UF - CEP: 00000-000".
 * Partes que faltam ficam vazias; é só um palpite para poupar digitação e a pessoa confere na tela.
 */
export function endereçoDoCadastro(texto: string | undefined): Partial<EnderecoNfse> {
  const t = (texto || '').trim();
  if (!t) return {};
  const r: Partial<EnderecoNfse> = {};
  let partes = t.split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);

  // CEP (pode vir como "CEP: 38280-000" ou solto)
  const iCep = partes.findIndex(p => /(\d{5})-?(\d{3})/.test(p));
  if (iCep >= 0) {
    const m = /(\d{5})-?(\d{3})/.exec(partes[iCep]);
    if (m) r.cep = `${m[1]}${m[2]}`;
    partes = partes.filter((_, i) => i !== iCep);
  }
  // Cidade/UF
  const iCid = partes.findIndex(p => /^[^/,]+\/[A-Za-z]{2}$/.test(p));
  if (iCid >= 0) partes = partes.filter((_, i) => i !== iCid);

  if (partes.length === 0) return r;
  const virgula = /^(.*?),\s*([^,\s]+)\s*(.*)$/.exec(partes[0]);
  if (virgula) {
    // "RUA TAL, 310 [resto]" + (complemento...) + bairro
    r.logradouro = virgula[1].trim();
    r.numero = virgula[2].trim();
    const resto = [virgula[3].replace(/^[,\s]+/, '').trim(), ...partes.slice(1)].filter(Boolean);
    if (resto.length === 1) r.bairro = resto[0];
    else if (resto.length >= 2) {
      r.bairro = resto[resto.length - 1];
      r.complemento = resto.slice(0, -1).join(' - ');
    }
  } else if (partes.length === 1) {
    // Só uma parte sem vírgula: é o bairro (a Receita não divulgou a rua de alguns CNPJs).
    r.bairro = partes[0];
  } else {
    r.logradouro = partes[0];
    r.bairro = partes[partes.length - 1];
    if (partes.length > 2) r.complemento = partes.slice(1, -1).join(' - ');
  }
  return r;
}

/** Endereço completo em texto único, no mesmo formato do cadastro (para guardar no cliente). */
export function enderecoParaTexto(e: EnderecoNfse): string {
  return [
    e.logradouro && `${e.logradouro.trim()}, ${e.numero.trim() || 'S/N'}`,
    e.complemento.trim(),
    e.bairro.trim(),
    e.municipioNome,
    e.cep && `CEP: ${cepPontuado(e.cep)}`
  ].filter(Boolean).join(' - ');
}

/** Consulta pública de CEP (ViaCEP). Só o CEP é enviado. */
export async function buscarCep(cep: string): Promise<Partial<EnderecoNfse> | null> {
  const d = (cep || '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!resp.ok) return null;
    const j = await resp.json();
    if (!j || j.erro) return null;
    return {
      cep: d,
      logradouro: j.logradouro || '',
      bairro: j.bairro || '',
      codigoMunicipio: String(j.ibge || ''),
      municipioNome: j.localidade ? `${j.localidade}/${j.uf}` : ''
    };
  } catch {
    return null;
  }
}

export function enderecoCompleto(e: EnderecoNfse): boolean {
  return e.cep.replace(/\D/g, '').length === 8 && e.codigoMunicipio.replace(/\D/g, '').length === 7 && Boolean(e.logradouro.trim() && e.numero.trim() && e.bairro.trim());
}

const chave = (clienteId: string) => `contaju_nfse_end_${clienteId}`;
/** Lembra o endereço usado por cliente, neste navegador (só conveniência). */
export function lembrarEndereco(clienteId: string, e: EnderecoNfse) {
  try { localStorage.setItem(chave(clienteId), JSON.stringify(e)); } catch { /* sem armazenamento: segue sem lembrar */ }
}
export function enderecoLembrado(clienteId: string): EnderecoNfse | null {
  try {
    const raw = localStorage.getItem(chave(clienteId));
    return raw ? { ...enderecoVazio(), ...JSON.parse(raw) } : null;
  } catch {
    return null;
  }
}
