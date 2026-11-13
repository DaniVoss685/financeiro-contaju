import { cleanDocumentDigits, isValidCNPJ, maskCNPJOnly } from '../utils/cnpjValidator';

export interface CNPJCompanyData {
  cnpj: string;
  formattedCnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  isRegular: boolean;
  motivoSituacao?: string;
  dataSituacao?: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  cnaeCodigo: string;
  cnaeDescricao: string;
  /** Código IBGE do município (7 dígitos), quando o provedor informa. */
  codigoMunicipioIbge?: string;
  enderecoCompleto: string;
}

const CNPJ_CACHE_KEY = 'contaju_cnpj_cache_v2';

function getCnpjCache(): Record<string, CNPJCompanyData> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CNPJ_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCnpjCache(digits: string, data: CNPJCompanyData): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const current = getCnpjCache();
    current[digits] = data;
    localStorage.setItem(CNPJ_CACHE_KEY, JSON.stringify(current));
  } catch {
    // quota exceeded ou indisponível
  }
}

function formatPhone(dddTel: string): string {
  if (!dddTel) return '';
  const clean = dddTel.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  }
  if (clean.length === 10) {
    return clean.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  }
  if (clean.length === 8 || clean.length === 9) {
    return clean;
  }
  return dddTel;
}

/**
 * Consulta dados cadastrais oficiais de uma empresa via múltiplos provedores públicos
 * com fallback transparente e tolerância a instabilidades de rede:
 * Provedor 1: BrasilAPI
 * Provedor 2: MinhaReceita
 * Provedor 3: CNPJ.ws Pública
 */
export async function lookupCNPJ(rawCnpj: string): Promise<CNPJCompanyData | null> {
  const digits = cleanDocumentDigits(rawCnpj);

  if (digits.length !== 14 || !isValidCNPJ(digits)) {
    return null;
  }

  // 1. Verifica cache local persistente
  const cache = getCnpjCache();
  if (cache[digits]) {
    return cache[digits];
  }

  // 2. Provedor 1: BrasilAPI
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      
      const logradouro = data.logradouro || '';
      const numero = data.numero || 'S/N';
      const complemento = data.complemento ? ` - ${data.complemento}` : '';
      const bairro = data.bairro || '';
      const municipio = data.municipio || '';
      const uf = data.uf || '';
      const cep = data.cep ? String(data.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';

      const enderecoParts = [
        logradouro ? `${logradouro}, ${numero}${complemento}` : '',
        bairro,
        municipio && uf ? `${municipio}/${uf}` : municipio,
        cep ? `CEP: ${cep}` : ''
      ].filter(Boolean);

      const tel = formatPhone(data.ddd_telefone_1 || '');
      const situacao = (data.descricao_situacao_cadastral || 'ATIVA').toUpperCase();

      const companyData: CNPJCompanyData = {
        cnpj: digits,
        formattedCnpj: maskCNPJOnly(digits),
        razaoSocial: data.razao_social || data.nome_fantasia || '',
        nomeFantasia: data.nome_fantasia || data.razao_social || '',
        situacaoCadastral: situacao,
        isRegular: situacao === 'ATIVA',
        motivoSituacao: data.motivo_situacao_cadastral || undefined,
        dataSituacao: data.data_situacao_cadastral || undefined,
        logradouro,
        numero,
        complemento: data.complemento || '',
        bairro,
        municipio,
        uf,
        cep,
        telefone: tel,
        email: data.email || '',
        cnaeCodigo: String(data.cnae_fiscal || ''),
        cnaeDescricao: data.cnae_fiscal_descricao || '',
        codigoMunicipioIbge: String(data.codigo_municipio_ibge || ''),
        enderecoCompleto: enderecoParts.join(' - ')
      };

      saveCnpjCache(digits, companyData);
      return companyData;
    }
  } catch (err) {
    console.warn(`[CNPJ Lookup] BrasilAPI falhou para CNPJ ${digits}, acionando Provedor 2:`, err);
  }

  // 3. Provedor 2: MinhaReceita
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const fallbackResponse = await fetch(`https://minhareceita.org/${digits}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (fallbackResponse.ok) {
      const data = await fallbackResponse.json();

      const logradouro = data.logradouro || '';
      const numero = data.numero || 'S/N';
      const complemento = data.complemento ? ` - ${data.complemento}` : '';
      const bairro = data.bairro || '';
      const municipio = data.municipio || '';
      const uf = data.uf || '';
      const cep = data.cep ? String(data.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';

      const enderecoParts = [
        logradouro ? `${logradouro}, ${numero}${complemento}` : '',
        bairro,
        municipio && uf ? `${municipio}/${uf}` : municipio,
        cep ? `CEP: ${cep}` : ''
      ].filter(Boolean);

      const tel = formatPhone(data.ddd_telefone_1 || '');
      const situacao = (data.descricao_situacao_cadastral || 'ATIVA').toUpperCase();

      const companyData: CNPJCompanyData = {
        cnpj: digits,
        formattedCnpj: maskCNPJOnly(digits),
        razaoSocial: data.razao_social || data.nome_fantasia || '',
        nomeFantasia: data.nome_fantasia || data.razao_social || '',
        situacaoCadastral: situacao,
        isRegular: situacao === 'ATIVA',
        motivoSituacao: data.motivo_situacao_cadastral || undefined,
        dataSituacao: data.data_situacao_cadastral || undefined,
        logradouro,
        numero,
        complemento: data.complemento || '',
        bairro,
        municipio,
        uf,
        cep,
        telefone: tel,
        email: data.email || '',
        cnaeCodigo: String(data.cnae_fiscal || ''),
        cnaeDescricao: data.cnae_fiscal_descricao || '',
        codigoMunicipioIbge: String(data.codigo_municipio_ibge || ''),
        enderecoCompleto: enderecoParts.join(' - ')
      };

      saveCnpjCache(digits, companyData);
      return companyData;
    }
  } catch (fallbackErr) {
    console.warn(`[CNPJ Lookup] MinhaReceita falhou para CNPJ ${digits}, acionando Provedor 3:`, fallbackErr);
  }

  // 4. Provedor 3: CNPJ.ws Pública
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const wsResponse = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (wsResponse.ok) {
      const data = await wsResponse.json();
      const estab = data.estabelecimento || {};

      const logradouro = estab.tipo_logradouro ? `${estab.tipo_logradouro} ${estab.logradouro}` : (estab.logradouro || '');
      const numero = estab.numero || 'S/N';
      const complemento = estab.complemento ? ` - ${estab.complemento}` : '';
      const bairro = estab.bairro || '';
      const municipio = estab.cidade?.nome || '';
      const uf = estab.estado?.sigla || '';
      const cep = estab.cep ? String(estab.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';

      const enderecoParts = [
        logradouro ? `${logradouro}, ${numero}${complemento}` : '',
        bairro,
        municipio && uf ? `${municipio}/${uf}` : municipio,
        cep ? `CEP: ${cep}` : ''
      ].filter(Boolean);

      const ddd = estab.ddd1 || '';
      const tel = estab.telefone1 ? formatPhone(`${ddd}${estab.telefone1}`) : '';
      const situacao = (estab.situacao_cadastral || 'ATIVA').toUpperCase();

      const companyData: CNPJCompanyData = {
        cnpj: digits,
        formattedCnpj: maskCNPJOnly(digits),
        razaoSocial: data.razao_social || estab.nome_fantasia || '',
        nomeFantasia: estab.nome_fantasia || data.razao_social || '',
        situacaoCadastral: situacao,
        isRegular: situacao === 'ATIVA',
        motivoSituacao: estab.motivo_situacao_cadastral || undefined,
        dataSituacao: estab.data_situacao_cadastral || undefined,
        logradouro,
        numero,
        complemento: estab.complemento || '',
        bairro,
        municipio,
        uf,
        cep,
        telefone: tel,
        email: estab.email || '',
        cnaeCodigo: String(estab.atividade_principal?.subclasse || ''),
        cnaeDescricao: estab.atividade_principal?.descricao || '',
        enderecoCompleto: enderecoParts.join(' - ')
      };

      saveCnpjCache(digits, companyData);
      return companyData;
    }
  } catch (wsErr) {
    console.warn(`[CNPJ Lookup] Provedor 3 também indisponível para CNPJ ${digits}:`, wsErr);
  }

  return null;
}

