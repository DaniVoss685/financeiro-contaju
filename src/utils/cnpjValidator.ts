/**
 * Utilitário de máscara e validação de CNPJ e CPF
 * Garante a integridade dos dados fiscais registrados no sistema Contaju.
 */

// Limpa caracteres não numéricos
export function cleanDocumentDigits(doc: string): string {
  return (doc || '').replace(/\D/g, '');
}

/**
 * Validação do algoritmo oficial da Receita Federal para CNPJ (14 dígitos)
 */
export function isValidCNPJ(cnpj: string): boolean {
  const digits = cleanDocumentDigits(cnpj);
  if (digits.length !== 14) return false;

  // Rejeita sequências de dígitos idênticos conhecidas (00000000000000, 11111111111111, etc.)
  if (/^(\d)\1{13}$/.test(digits)) return false;

  // Primeiro dígito verificador
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += parseInt(digits[i], 10) * weights1[i];
  }
  const mod1 = sum1 % 11;
  const dv1 = mod1 < 2 ? 0 : 11 - mod1;
  if (dv1 !== parseInt(digits[12], 10)) return false;

  // Segundo dígito verificador
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum2 = 0;
  for (let i = 0; i < 13; i++) {
    sum2 += parseInt(digits[i], 10) * weights2[i];
  }
  const mod2 = sum2 % 11;
  const dv2 = mod2 < 2 ? 0 : 11 - mod2;
  if (dv2 !== parseInt(digits[13], 10)) return false;

  return true;
}

/**
 * Validação do algoritmo oficial para CPF (11 dígitos)
 */
export function isValidCPF(cpf: string): boolean {
  const digits = cleanDocumentDigits(cpf);
  if (digits.length !== 11) return false;

  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += parseInt(digits[i], 10) * (10 - i);
  }
  const mod1 = (sum1 * 10) % 11;
  const dv1 = mod1 === 10 || mod1 === 11 ? 0 : mod1;
  if (dv1 !== parseInt(digits[9], 10)) return false;

  let sum2 = 0;
  for (let i = 0; i < 10; i++) {
    sum2 += parseInt(digits[i], 10) * (11 - i);
  }
  const mod2 = (sum2 * 10) % 11;
  const dv2 = mod2 === 10 || mod2 === 11 ? 0 : mod2;
  if (dv2 !== parseInt(digits[10], 10)) return false;

  return true;
}

/**
 * Aplica máscara de CNPJ (00.000.000/0000-00) ou CPF (000.000.000-00) dinamicamente
 */
export function maskCNPJOrCPF(value: string): string {
  const digits = cleanDocumentDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    // Até 11 dígitos aplica máscara de CPF se passar de 9 ou formata progressivo
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  // CNPJ: 14 dígitos (00.000.000/0000-00)
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

/**
 * Aplica máscara estritamente de CNPJ (00.000.000/0000-00)
 */
export function maskCNPJOnly(value: string): string {
  const digits = cleanDocumentDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export interface DocumentValidationResult {
  digits: string;
  formatted: string;
  type: 'CNPJ' | 'CPF' | 'INCOMPLETO' | 'VAZIO';
  isValid: boolean;
  message: string;
  status: 'valid' | 'invalid' | 'incomplete' | 'empty';
}

/**
 * Validação completa de formato e integridade com retorno semântico
 */
export function validateFiscalDocument(value: string): DocumentValidationResult {
  const digits = cleanDocumentDigits(value);

  if (!digits) {
    return {
      digits: '',
      formatted: '',
      type: 'VAZIO',
      isValid: false,
      message: 'Informe o CNPJ da empresa para cadastro fiscal.',
      status: 'empty'
    };
  }

  if (digits.length === 14) {
    const valid = isValidCNPJ(digits);
    return {
      digits,
      formatted: maskCNPJOnly(digits),
      type: 'CNPJ',
      isValid: valid,
      message: valid 
        ? 'CNPJ Válido (dígitos verificadores oficiais conferidos)' 
        : 'CNPJ Inválido (dígitos verificadores incorretos segundo a Receita Federal)',
      status: valid ? 'valid' : 'invalid'
    };
  }

  if (digits.length === 11) {
    const valid = isValidCPF(digits);
    return {
      digits,
      formatted: maskCNPJOrCPF(digits),
      type: 'CPF',
      isValid: valid,
      message: valid 
        ? 'CPF Válido (pessoa física/MEI sem CNPJ)' 
        : 'CPF Inválido (dígitos verificadores incorretos)',
      status: valid ? 'valid' : 'invalid'
    };
  }

  return {
    digits,
    formatted: digits.length > 11 ? maskCNPJOnly(digits) : maskCNPJOrCPF(digits),
    type: 'INCOMPLETO',
    isValid: false,
    message: `Aguardando preenchimento (${digits.length}/14 dígitos para CNPJ ou 11 para CPF)...`,
    status: 'incomplete'
  };
}
