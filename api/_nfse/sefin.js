// ==============================================================================
// NFS-e Nacional — comunicação com o Portal Nacional (Sefin Nacional e ADN)
// A conexão é autenticada com o certificado A1 da empresa (mTLS).
// ==============================================================================
import https from 'node:https';
import zlib from 'node:zlib';

const BASES = {
  // 1 = produção, 2 = produção restrita (testes)
  sefin: { 1: 'https://sefin.nfse.gov.br/sefinnacional', 2: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional' },
  adn: { 1: 'https://adn.nfse.gov.br', 2: 'https://adn.producaorestrita.nfse.gov.br' }
};

export class PortalError extends Error {
  /** @param {string} message @param {{incerto?:boolean, httpStatus?:number}} [info] */
  constructor(message, info = {}) {
    super(message);
    this.name = 'PortalError';
    // incerto = a requisição pode ter chegado ao portal (não sabemos se a nota foi gerada)
    this.incerto = Boolean(info.incerto);
    this.httpStatus = info.httpStatus;
  }
}

export const compactar = xml => zlib.gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
export const descompactar = b64 => zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');

function requisicao({ servico, ambiente, metodo, caminho, corpo, cert, timeoutMs = 45000 }) {
  const url = new URL(`${BASES[servico][ambiente]}/${caminho}`);
  const payload = corpo ? Buffer.from(JSON.stringify(corpo), 'utf8') : null;
  return new Promise((resolve, reject) => {
    let enviado = false;
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: metodo,
        key: cert.chavePrivadaPem,
        cert: cert.certificadoPem,
        minVersion: 'TLSv1.2',
        headers: {
          Accept: 'application/json, application/pdf',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {})
        },
        timeout: timeoutMs
      },
      res => {
        const partes = [];
        res.on('data', c => partes.push(c));
        res.on('end', () => {
          const buffer = Buffer.concat(partes);
          const tipo = String(res.headers['content-type'] || '');
          let json = null;
          if (!tipo.includes('pdf')) {
            try { json = JSON.parse(buffer.toString('utf8')); } catch { json = null; }
          }
          resolve({ status: res.statusCode || 0, tipo, buffer, json });
        });
        res.on('error', err => reject(new PortalError(`Resposta do portal interrompida: ${err.message}`, { incerto: true })));
      }
    );
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', err => {
      const codigo = err.code || '';
      const tls = /SSL|TLS|CERT|ALERT|handshake/i.test(`${codigo} ${err.message}`);
      const msg = tls
        ? 'O portal recusou a conexão com o certificado digital. Confira se o certificado é válido e pertence à empresa emissora.'
        : `Não foi possível falar com o Portal Nacional (${codigo || err.message}).`;
      reject(new PortalError(msg, { incerto: enviado && !tls }));
    });
    if (payload) req.write(payload);
    req.end(() => { enviado = true; });
  });
}

/** Junta as mensagens de erro do portal, qualquer que seja o formato devolvido. */
export function mensagensDeErro(json) {
  if (!json || typeof json !== 'object') return [];
  const lista = [];
  const coletar = item => {
    if (!item) return;
    if (typeof item === 'string') { lista.push(item); return; }
    const chaves = Object.fromEntries(Object.entries(item).map(([k, v]) => [k.toLowerCase(), v]));
    const partes = [chaves.codigo, chaves.descricao || chaves.mensagem || chaves.message, chaves.complemento].filter(Boolean);
    if (partes.length) lista.push(partes.join(' — '));
  };
  for (const chave of Object.keys(json)) {
    const k = chave.toLowerCase();
    if (k === 'erros' || k === 'erro' || k === 'errors') {
      const v = json[chave];
      if (Array.isArray(v)) v.forEach(coletar); else coletar(v);
    }
  }
  if (!lista.length && (json.title || json.detail || json.message)) lista.push([json.title, json.detail || json.message].filter(Boolean).join(' — '));
  return lista;
}

function falhaHttp(r, contexto) {
  if (r.status === 401 || r.status === 403) {
    return new PortalError('O portal não autorizou o acesso com este certificado digital. Confira se ele é da empresa emissora e se a empresa está habilitada no Emissor Nacional.', { httpStatus: r.status });
  }
  return new PortalError(`${contexto}: o portal respondeu com erro ${r.status}.`, { httpStatus: r.status, incerto: r.status >= 500 });
}

/** Envia a DPS assinada. Devolve { autorizada, chaveAcesso, xmlNfse, erros, alertas }. */
export async function emitirNfse({ ambiente, xmlDpsAssinado, cert }) {
  const r = await requisicao({ servico: 'sefin', ambiente, metodo: 'POST', caminho: 'nfse', corpo: { dpsXmlGZipB64: compactar(xmlDpsAssinado) }, cert });
  const chave = r.json && (r.json.chaveAcesso || r.json.ChaveAcesso);
  const xmlB64 = r.json && (r.json.nfseXmlGZipB64 || r.json.NfseXmlGZipB64);
  if (r.status >= 200 && r.status < 300 && chave && xmlB64) {
    return { autorizada: true, chaveAcesso: String(chave), xmlNfse: descompactar(xmlB64), erros: [], alertas: mensagensDeErro({ erros: r.json.alertas }) };
  }
  const erros = mensagensDeErro(r.json);
  if (erros.length) return { autorizada: false, erros, alertas: [] };
  throw falhaHttp(r, 'Envio da nota');
}

/** Descobre se uma DPS já virou nota (usado quando o envio ficou sem resposta). */
export async function consultarDps({ ambiente, idDps, cert }) {
  const r = await requisicao({ servico: 'sefin', ambiente, metodo: 'GET', caminho: `dps/${idDps}`, cert, timeoutMs: 25000 });
  if (r.status === 404) return { encontrada: false };
  const chave = r.json && (r.json.chaveAcesso || r.json.ChaveAcesso);
  if (r.status >= 200 && r.status < 300 && chave) return { encontrada: true, chaveAcesso: String(chave) };
  const erros = mensagensDeErro(r.json);
  // O portal responde com erro de negócio quando a DPS não existe.
  if (erros.length && r.status >= 400 && r.status < 500) return { encontrada: false, erros };
  throw falhaHttp(r, 'Consulta da nota');
}

export async function consultarNfse({ ambiente, chaveAcesso, cert }) {
  const r = await requisicao({ servico: 'sefin', ambiente, metodo: 'GET', caminho: `nfse/${chaveAcesso}`, cert, timeoutMs: 25000 });
  const xmlB64 = r.json && (r.json.nfseXmlGZipB64 || r.json.NfseXmlGZipB64);
  if (r.status >= 200 && r.status < 300 && xmlB64) return { xmlNfse: descompactar(xmlB64) };
  throw falhaHttp(r, 'Consulta da nota');
}

/** Registra o cancelamento. Devolve { cancelada, erros }. */
export async function cancelarNfse({ ambiente, chaveAcesso, xmlPedidoAssinado, cert }) {
  const r = await requisicao({
    servico: 'sefin', ambiente, metodo: 'POST', caminho: `nfse/${chaveAcesso}/eventos`,
    corpo: { pedidoRegistroEventoXmlGZipB64: compactar(xmlPedidoAssinado) }, cert
  });
  const erros = mensagensDeErro(r.json);
  if (r.status >= 200 && r.status < 300 && !erros.length) return { cancelada: true, erros: [] };
  if (erros.length) return { cancelada: false, erros };
  throw falhaHttp(r, 'Cancelamento da nota');
}

/** Baixa o PDF oficial da nota (DANFSe). */
export async function baixarDanfse({ ambiente, chaveAcesso, cert }) {
  const r = await requisicao({ servico: 'adn', ambiente, metodo: 'GET', caminho: `danfse/${chaveAcesso}`, cert, timeoutMs: 40000 });
  if (r.status >= 200 && r.status < 300 && r.buffer.length > 4 && r.buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return r.buffer;
  }
  const erros = mensagensDeErro(r.json);
  if (erros.length) throw new PortalError(`O portal não gerou o PDF: ${erros.join('; ')}`, { httpStatus: r.status });
  throw falhaHttp(r, 'Download do PDF');
}
