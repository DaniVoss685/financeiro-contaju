// ==============================================================================
// NFS-e Nacional — certificado digital A1 (.pfx/.p12)
// Lê o arquivo, confere validade e titular, e cifra/decifra para guardar no banco.
// O segredo de cifragem (NFSE_CERT_SECRET) só existe no servidor.
// ==============================================================================
import crypto from 'node:crypto';
import forge from 'node-forge';

export class CertificadoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CertificadoError';
  }
}

/**
 * Abre o .pfx com a senha e devolve chave, certificado e dados públicos.
 * @param {Buffer} pfxBuffer
 * @param {string} senha
 */
export function lerCertificado(pfxBuffer, senha) {
  let p12;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (/mac|password|decrypt/i.test(msg)) throw new CertificadoError('Senha do certificado incorreta.');
    throw new CertificadoError('Não foi possível ler o arquivo. Envie o certificado A1 no formato .pfx ou .p12.');
  }

  const bagsChave = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])
  ];
  const chave = bagsChave.find(b => b.key)?.key;
  if (!chave) throw new CertificadoError('O arquivo não contém a chave privada. Exporte o certificado A1 completo (.pfx).');

  const bagsCert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  // O certificado do titular é o que combina com a chave privada (os demais são da cadeia).
  const bag = bagsCert.find(b => b.cert && b.cert.publicKey && b.cert.publicKey.n && b.cert.publicKey.n.compareTo(chave.n) === 0);
  if (!bag) throw new CertificadoError('O arquivo não contém o certificado correspondente à chave privada.');
  const cert = bag.cert;

  const cn = cert.subject.getField('CN')?.value || '';
  // Padrão ICP-Brasil: "RAZAO SOCIAL:CNPJ" (e-CNPJ) ou "NOME:CPF" (e-CPF).
  const m = /^(.*?):(\d{11}|\d{14})$/.exec(cn.trim());
  const titular = (m ? m[1] : cn).trim();
  const documento = m ? m[2] : '';

  const certificadoDerB64 = forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());

  return {
    chavePrivadaPem: forge.pki.privateKeyToPem(chave),
    certificadoPem: forge.pki.certificateToPem(cert),
    certificadoDerB64,
    titular,
    documento,
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter
  };
}

function chaveCifragem(segredo) {
  if (!segredo || String(segredo).length < 32) {
    throw new Error('NFSE_CERT_SECRET ausente ou curto demais (mínimo de 32 caracteres).');
  }
  return crypto.createHash('sha256').update(String(segredo), 'utf8').digest();
}

/** Cifra com AES-256-GCM. Formato: v1.<iv>.<tag>.<dados> (base64). */
export function cifrar(buffer, segredo) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', chaveCifragem(segredo), iv);
  const dados = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), dados.toString('base64')].join('.');
}

export function decifrar(texto, segredo) {
  const [versao, iv, tag, dados] = String(texto || '').split('.');
  if (versao !== 'v1' || !iv || !tag || !dados) throw new Error('Certificado guardado em formato desconhecido.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', chaveCifragem(segredo), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dados, 'base64')), decipher.final()]);
}
