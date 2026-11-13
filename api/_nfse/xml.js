// ==============================================================================
// NFS-e Nacional — montagem e assinatura dos XML (DPS e pedido de cancelamento)
// Leiaute: DPS v1.01 / pedRegEvento v1.01, esquemas oficiais de 20/10/2026 (NT SE/CGNFS-e 009),
// guardados em docs/nfse/schemas.
//
// O XML é gerado já na forma canônica (C14N): sem espaços entre tags, sem tags
// vazias, texto escapado pelo padrão. Assim a assinatura digital é calculada
// direto sobre o texto gerado, sem depender de biblioteca de XML.
// ==============================================================================
import crypto from 'node:crypto';
import { CLASSIFICACAO_TRIBUTARIA, CST_IBS_CBS, INDICADOR_OPERACAO } from './ibscbsTabelas.js';

export const NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse';
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const ALG_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
export const VERSAO_LEIAUTE = '1.01';
export const VER_APLIC = 'ContajuFinanceiro1.0'; // máx. 20 caracteres

const ALGS = {
  sha1: {
    node: 'RSA-SHA1',
    hash: 'sha1',
    sig: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    digest: 'http://www.w3.org/2000/09/xmldsig#sha1'
  },
  sha256: {
    node: 'RSA-SHA256',
    hash: 'sha256',
    sig: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    digest: 'http://www.w3.org/2001/04/xmlenc#sha256'
  }
};

export class ValidacaoError extends Error {
  constructor(message, campo) {
    super(message);
    this.name = 'ValidacaoError';
    this.campo = campo;
  }
}

/** Leiaute usado primeiro em cada ambiente (a produção ainda estava no anterior em 10/11/2026). */
export const layoutDoAmbiente = ambiente => {
  // NFSE_LAYOUT_INICIAL existe só para testes (forçar o primeiro formato tentado).
  if (process.env.NFSE_LAYOUT_INICIAL === 'novo' || process.env.NFSE_LAYOUT_INICIAL === 'antigo') return process.env.NFSE_LAYOUT_INICIAL;
  return Number(ambiente) === 2 ? 'novo' : 'antigo';
};
export const outroLayout = layout => (layout === 'novo' ? 'antigo' : 'novo');
/** O portal recusou o formato do arquivo por causa do leiaute (e não por regra de negócio)? */
export const recusaPorLeiaute = mensagens => (mensagens || []).some(m => /E1235/.test(m) && /finNFSe/.test(m));

/** O portal recusou porque esse número de DPS já foi usado (E0014)? Acontece quando outro sistema ou o site do Emissor Nacional usa a mesma série. */
export const recusaPorDuplicidade = mensagens => (mensagens || []).some(m => /E0014/.test(m));

/** Situações tributárias do PIS/COFINS aceitas pelo leiaute (TSTipoCST). */
export const CST_PIS_COFINS = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '49', '50', '51', '52', '53', '54', '55', '56', '60', '61', '62', '63', '64', '65', '66', '67', '70', '71', '72', '73', '74', '75', '98', '99'];

export const soDigitos =v => String(v ?? '').replace(/\D/g, '');

/** Escapa texto para dentro de uma tag, já no padrão canônico. */
function esc(v) {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

/** Limpa texto livre: tira caracteres de controle e espaços sobrando. */
const SUBSTITUTOS = { '—': '-', '–': '-', '‐': '-', '‑': '-', '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '‚': "'", '…': '...', '•': '-', '€': 'EUR', '™': '', ' ': ' ', ' ': ' ', '​': '' };

/**
 * Limpa texto livre para o leiaute: o portal só aceita caracteres do alfabeto latino (até U+00FF,
 * que cobre todos os acentos do português). Aspas e travessões "bonitos" (de Word/WhatsApp) viram
 * os comuns; o que não tem equivalente (emoji, por exemplo) é descartado. Quebras de linha são
 * mantidas aqui: quem não aceita quebra remove depois.
 */
export function textoLimpo(v, max) {
  const s = String(v ?? '')
    .replace(/[—–‐‑“”„‘’‚…•€™  ​]/g, c => SUBSTITUTOS[c] ?? '')
    .replace(/[^\u0000-ÿ]/gu, '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  return max ? s.slice(0, max) : s;
}

const tag = (nome, valor) => (valor === undefined || valor === null || valor === '' ? '' : `<${nome}>${esc(valor)}</${nome}>`);
const grupo = (nome, conteudo) => (conteudo ? `<${nome}>${conteudo}</${nome}>` : '');

/** Converte reais em centavos inteiros (evita erro de ponto flutuante). */
export function paraCentavos(valor) {
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor);
  if (!Number.isFinite(n)) throw new ValidacaoError('Valor inválido.', 'valor');
  return Math.round(n * 100);
}

/** Formata centavos como decimal do leiaute: "1500.00". */
export function decimal2(centavos) {
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Data e hora de Brasília (-03:00) no formato exigido: AAAA-MM-DDThh:mm:ss-03:00. */
export function dataHoraBrasilia(date = new Date()) {
  const d = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${d.toISOString().slice(0, 19)}-03:00`;
}

export function validarCpf(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i);
    const dig = ((soma * 10) % 11) % 10;
    if (dig !== Number(d[t])) return false;
  }
  return true;
}

export function validarCnpj(cnpj) {
  const d = soDigitos(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = base => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12));
  const d2 = calc(d.slice(0, 12) + d1);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** Identificador da DPS: "DPS" + município(7) + tipo inscrição(1) + inscrição(14) + série(5) + número(15). */
export function montarIdDps({ codigoMunicipio, cnpj, serie, numero }) {
  return `DPS${codigoMunicipio}2${soDigitos(cnpj).padStart(14, '0')}${String(serie).padStart(5, '0')}${String(numero).padStart(15, '0')}`;
}

/**
 * Grupo IBS/CBS da DPS (reforma tributária). Só vai no XML quando a pessoa marcou "informar".
 * A estrutura mudou entre os dois leiautes: no antigo (produção) o grupo leva finNFSe e o CST/cClassTrib
 * ficam dentro de gIBSCBS; no novo (testes) finNFSe sobe para infDPS e CST/cClassTrib ficam direto em trib.
 */
function montarIbsCbs(i, layoutNovo, competencia, e) {
  if (!i || !i.informar) return '';
  if (competencia < '2026-01-01') e('IBS/CBS só pode ser informado para serviços com data a partir de 01/01/2026.', 'ibscbs');

  const cst = String(i.cst ?? '').trim();
  if (!CST_IBS_CBS.some(([c]) => c === cst)) e('IBS/CBS: escolha o código de situação tributária (CST).', 'ibscbs.cst');
  const cClass = String(i.cClassTrib ?? '').trim();
  const classif = CLASSIFICACAO_TRIBUTARIA.find(([c]) => c === cClass);
  if (!classif) e('IBS/CBS: escolha o código de classificação tributária.', 'ibscbs.cClassTrib');
  if (classif[2] !== cst) e('IBS/CBS: a classificação tributária escolhida não pertence à situação tributária (CST) escolhida.', 'ibscbs.cClassTrib');

  const cIndOp = String(i.cIndOp ?? '').trim();
  if (!INDICADOR_OPERACAO.some(([c]) => c === cIndOp)) e('IBS/CBS: escolha o código indicador da operação.', 'ibscbs.cIndOp');

  const indFinal = i.indFinal === '1' || i.indFinal === 1 ? '1' : '0';
  const indDest = String(i.indDest ?? '0');
  if (!['0', '1'].includes(indDest)) e('IBS/CBS: informe se o destinatário é o próprio adquirente.', 'ibscbs.indDest');

  const tpEnteGov = String(i.tpEnteGov ?? '').trim();
  if (tpEnteGov && !['1', '2', '3', '4'].includes(tpEnteGov)) e('IBS/CBS: tipo de ente governamental inválido.', 'ibscbs.tpEnteGov');
  const tpOper = String(i.tpOper ?? '').trim();
  if (tpEnteGov && !tpOper) e('IBS/CBS: em compra governamental informe o tipo de operação.', 'ibscbs.tpOper');
  if (tpOper && !['1', '2', '3', '4', '5'].includes(tpOper)) e('IBS/CBS: tipo de operação inválido.', 'ibscbs.tpOper');

  const refs = (Array.isArray(i.refNFSe) ? i.refNFSe : []).map(soDigitos).filter(Boolean);
  if (refs.length > 99) e('IBS/CBS: no máximo 99 notas referenciadas.', 'ibscbs.refNFSe');
  for (const r of refs) if (r.length !== 50) e('IBS/CBS: a chave de acesso da NFS-e referenciada precisa ter 50 dígitos.', 'ibscbs.refNFSe');

  let dest = '';
  if (indDest === '1') {
    const d = i.dest || {};
    const doc = soDigitos(d.documento);
    if (doc.length === 14 ? !validarCnpj(doc) : !(doc.length === 11 && validarCpf(doc))) e('IBS/CBS: informe o CPF ou CNPJ válido do destinatário.', 'ibscbs.dest.documento');
    const nome = textoLimpo(d.nome, 150).replace(/\n/g, ' ');
    if (!nome) e('IBS/CBS: informe o nome do destinatário.', 'ibscbs.dest.nome');
    let end = '';
    const en = d.endereco;
    if (en && (en.cep || en.logradouro || en.numero || en.bairro || en.codigoMunicipio)) {
      const cep = soDigitos(en.cep);
      const cMun = soDigitos(en.codigoMunicipio);
      const xLgr = textoLimpo(en.logradouro, 255).replace(/\n/g, ' ');
      const nro = textoLimpo(en.numero, 60).replace(/\n/g, ' ');
      const xBairro = textoLimpo(en.bairro, 60).replace(/\n/g, ' ');
      if (cep.length !== 8 || cMun.length !== 7 || !xLgr || !nro || !xBairro) e('IBS/CBS: endereço do destinatário incompleto (CEP, rua, número e bairro).', 'ibscbs.dest.endereco');
      end = grupo('end', grupo('endNac', tag('cMun', cMun) + tag('CEP', cep)) + tag('xLgr', xLgr) + tag('nro', nro) + tag('xCpl', textoLimpo(en.complemento, 156).replace(/\n/g, ' ')) + tag('xBairro', xBairro));
    }
    // Regra do portal (E0919): quando o local da operação é o endereço do destinatário, ele precisa estar na nota.
    if (!end) e('IBS/CBS: o portal exige o endereço do destinatário (CEP, rua, número e bairro).', 'ibscbs.dest.endereco');
    dest = grupo('dest', tag(doc.length === 14 ? 'CNPJ' : 'CPF', doc) + tag('xNome', nome) + end);
  }

  const trib = layoutNovo
    ? grupo('trib', tag('CST', cst) + tag('cClassTrib', cClass))
    : grupo('trib', grupo('gIBSCBS', tag('CST', cst) + tag('cClassTrib', cClass)));

  return grupo('IBSCBS',
    (layoutNovo ? '' : tag('finNFSe', 0)) +
    tag('indFinal', indFinal) +
    tag('cIndOp', cIndOp) +
    tag('tpOper', tpOper) +
    (refs.length ? grupo('gRefNFSe', refs.map(r => tag('refNFSe', r)).join('')) : '') +
    tag('tpEnteGov', tpEnteGov) +
    tag('indDest', indDest) +
    dest +
    grupo('valores', trib));
}

/**
 * Confere os dados e devolve o conteúdo pronto da DPS.
 * Nenhuma regra fiscal é presumida aqui: regime, código de serviço, retenção e
 * alíquota vêm do cadastro da empresa e do que o usuário informou na emissão.
 */
export function montarDps(dados) {
  const e = (msg, campo) => { throw new ValidacaoError(msg, campo); };

  // Dois leiautes convivem: o de 20/10/2026 (testes) e o anterior, de 09/02/2026 (produção até virar a chave).
  // "novo" = com finNFSe e cNBS antes de xDescServ. O envio tenta um e, se o portal recusar a forma, o outro.
  const layoutNovo = (dados.layout || layoutDoAmbiente(dados.ambiente)) === 'novo';
  const ambiente = Number(dados.ambiente);
  if (ambiente !== 1 && ambiente !== 2) e('Ambiente inválido.', 'ambiente');

  const p = dados.prestador || {};
  const cnpj = soDigitos(p.cnpj);
  if (!validarCnpj(cnpj)) e('CNPJ da empresa emissora inválido. Confira em Configurar emissão.', 'cnpj');
  const codMun = soDigitos(p.codigoMunicipio);
  if (codMun.length !== 7) e('Código do município (IBGE, 7 dígitos) não informado. Confira em Configurar emissão.', 'codigoMunicipio');
  const opSimpNac = Number(p.opSimpNac);
  if (![1, 2, 3].includes(opSimpNac)) e('Informe a situação da empresa no Simples Nacional em Configurar emissão.', 'opSimpNac');
  const regApTribSN = p.regApTribSN ? Number(p.regApTribSN) : null;
  if (opSimpNac === 3 && ![1, 2, 3].includes(regApTribSN)) e('Informe o regime de apuração do Simples Nacional em Configurar emissão.', 'regApTribSN');
  const regEspTrib = Number(p.regEspTrib ?? 0);
  if (!(regEspTrib >= 0 && regEspTrib <= 6)) e('Regime especial de tributação inválido.', 'regEspTrib');

  const serie = soDigitos(dados.serie);
  if (!serie || serie.length > 5) e('Série inválida.', 'serie');
  const numero = String(dados.numero);
  if (!/^[1-9][0-9]{0,14}$/.test(numero)) e('Número da DPS inválido.', 'numero');

  const competencia = String(dados.competencia || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) e('Data do serviço inválida.', 'competencia');
  // O relógio do portal anda alguns segundos atrás do nosso; se a hora da DPS passar da hora dele,
  // ele recusa (E0008). Por isso a DPS sai marcada 2 minutos antes. Nunca antes do dia da competência.
  let dhEmi = dados.dhEmi || dataHoraBrasilia(new Date(Date.now() - 2 * 60 * 1000));
  if (competencia > dhEmi.slice(0, 10)) {
    const agora = dataHoraBrasilia();
    if (competencia > agora.slice(0, 10)) e('A data do serviço não pode ser depois de hoje.', 'competencia');
    dhEmi = agora;
  }

  const t = dados.tomador || {};
  const docTomador = soDigitos(t.documento);
  const tomadorPJ = docTomador.length === 14;
  if (tomadorPJ ? !validarCnpj(docTomador) : !validarCpf(docTomador)) e('CPF ou CNPJ do cliente inválido. Corrija no cadastro do cliente.', 'tomador.documento');
  const nomeTomador = textoLimpo(t.nome, 300).replace(/\n/g, ' ');
  if (!nomeTomador) e('Nome do cliente não informado.', 'tomador.nome');
  const emailTomador = textoLimpo(t.email, 80).replace(/\s/g, '');
  if (emailTomador && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailTomador)) e('E-mail do cliente inválido.', 'tomador.email');
  const foneTomador = soDigitos(t.telefone);
  // Endereço nacional do tomador: opcional, mas obrigatório quando o ISS é retido (regra E0237 do portal).
  const en = t.endereco || {};
  const temEndereco = Boolean(en.cep || en.logradouro || en.numero || en.bairro || en.codigoMunicipio);
  let endTomador = '';
  if (temEndereco) {
    const cep = soDigitos(en.cep);
    const cMunT = soDigitos(en.codigoMunicipio);
    const xLgr = textoLimpo(en.logradouro, 255).replace(/\n/g, ' ');
    const nro = textoLimpo(en.numero, 60).replace(/\n/g, ' ');
    const xBairro = textoLimpo(en.bairro, 60).replace(/\n/g, ' ');
    if (cep.length !== 8) e('CEP do cliente inválido (8 dígitos).', 'tomador.endereco.cep');
    if (cMunT.length !== 7) e('Município do cliente não identificado. Confira o CEP do cliente.', 'tomador.endereco.codigoMunicipio');
    if (!xLgr) e('Informe o logradouro (rua) do cliente.', 'tomador.endereco.logradouro');
    if (!nro) e('Informe o número do endereço do cliente (use "S/N" se não houver).', 'tomador.endereco.numero');
    if (!xBairro) e('Informe o bairro do cliente.', 'tomador.endereco.bairro');
    endTomador = grupo('end',
      grupo('endNac', tag('cMun', cMunT) + tag('CEP', cep)) +
      tag('xLgr', xLgr) + tag('nro', nro) + tag('xCpl', textoLimpo(en.complemento, 156).replace(/\n/g, ' ')) + tag('xBairro', xBairro));
  } else {
    // O portal só trava a nota sem endereço quando o ISS é retido (E0237), mas o endereço do cliente é
    // informação esperada em toda nota (a fiscal confirmou), então o sistema sempre exige.
    e('Informe o endereço do cliente (CEP, rua, número e bairro). Ele sai na nota fiscal.', 'tomador.endereco');
  }

  const s = dados.servico || {};
  const cTribNac = soDigitos(s.cTribNac);
  if (cTribNac.length !== 6) e('Código de tributação nacional do serviço deve ter 6 dígitos.', 'servico.cTribNac');
  const cNBS = soDigitos(s.cNBS);
  if (cNBS.length !== 9) e('Código NBS do serviço deve ter 9 dígitos.', 'servico.cNBS');
  const descricao = textoLimpo(s.descricao, 2000);
  if (!descricao) e('Descreva o serviço prestado.', 'servico.descricao');
  const locPrest = soDigitos(s.codigoMunicipioPrestacao || codMun);
  if (locPrest.length !== 7) e('Município onde o serviço foi prestado inválido.', 'servico.codigoMunicipioPrestacao');
  const infCompl = textoLimpo(s.informacoesComplementares, 2000).replace(/\n/g, ' ');
  const docRef = textoLimpo(s.docRef, 255).replace(/\n/g, ' ');
  const idDocTec = textoLimpo(s.idDocTec, 40).replace(/\n/g, ' ');

  const v = dados.valores || {};
  const centavos = paraCentavos(v.valorServico);
  if (centavos <= 0) e('O valor do serviço precisa ser maior que zero.', 'valores.valorServico');
  const descontoCent = v.descontoIncondicionado ? paraCentavos(v.descontoIncondicionado) : 0;
  if (descontoCent < 0 || descontoCent >= centavos) e('Desconto inválido.', 'valores.descontoIncondicionado');
  const tribISSQN = Number(v.tribISSQN ?? 1);
  if (![1, 2, 3, 4].includes(tribISSQN)) e('Tipo de tributação do ISS inválido.', 'valores.tribISSQN');
  const tpRetISSQN = v.issRetido ? 2 : 1;
  let pAliq = '';
  if (v.aliquotaIss !== undefined && v.aliquotaIss !== null && v.aliquotaIss !== '') {
    const aliqCent = paraCentavos(v.aliquotaIss);
    if (aliqCent < 0 || aliqCent > 999) e('Alíquota do ISS inválida.', 'valores.aliquotaIss');
    // Regra do portal (E0625): empresa ME/EPP só informa alíquota quando o ISS é retido.
    if (opSimpNac === 3 && !v.issRetido) e('Para empresa ME/EPP a alíquota do ISS só pode ser informada quando o ISS é retido pelo cliente. Deixe a alíquota em branco.', 'valores.aliquotaIss');
    pAliq = decimal2(aliqCent);
  }
  // Regra do portal (E0621): empresa ME/EPP com ISS retido é obrigada a informar a alíquota.
  if (opSimpNac === 3 && v.issRetido && !pAliq) e('Para empresa ME/EPP com ISS retido pelo cliente, informe a alíquota do ISS (confirme o valor com a contabilidade).', 'valores.aliquotaIss');
  // Regra do portal (E0712): para ME/EPP o indicador "indTotTrib" não pode ser informado;
  // o total aproximado de tributos vai como percentual do Simples (pTotTribSN), que vem do cadastro.
  let totTrib = '<indTotTrib>0</indTotTrib>';
  if (opSimpNac === 3) {
    if (v.pTotTribSN === undefined || v.pTotTribSN === null || v.pTotTribSN === '') {
      e('Para empresa ME/EPP o portal exige o percentual aproximado de tributos. Preencha "Tributos aproximados (%)" em Configurar emissão (confirme o valor com a contabilidade).', 'valores.pTotTribSN');
    }
    const pc = paraCentavos(v.pTotTribSN);
    if (pc < 0 || pc > 9999) e('Percentual aproximado de tributos inválido.', 'valores.pTotTribSN');
    totTrib = `<pTotTribSN>${decimal2(pc)}</pTotTribSN>`;
  }

  // Tributação federal (PIS/COFINS e retenções). Só vai no XML se algo foi preenchido.
  const cst = String(v.pisCofinsCst ?? '').trim();
  const tpRetPisCofins = String(v.pisCofinsTpRet ?? '').trim();
  if (cst && !CST_PIS_COFINS.includes(cst)) e('Situação tributária do PIS/COFINS inválida.', 'valores.pisCofinsCst');
  if (tpRetPisCofins && !/^[0-9]$/.test(tpRetPisCofins)) e('Tipo de retenção do PIS/COFINS/CSLL inválido.', 'valores.pisCofinsTpRet');
  if (tpRetPisCofins && !cst) e('Para informar o tipo de retenção do PIS/COFINS/CSLL, escolha antes a situação tributária do PIS/COFINS (use "00 - Nenhum" se não houver).', 'valores.pisCofinsCst');
  const retencao = (valor, rotulo, campo) => {
    if (valor === undefined || valor === null || valor === '' || Number(valor) === 0) return '';
    const c = paraCentavos(valor);
    if (c < 0) e(`${rotulo}: valor inválido.`, campo);
    if (c > centavos) e(`${rotulo} não pode ser maior que o valor do serviço.`, campo);
    return decimal2(c);
  };
  const vRetCP = retencao(v.retCP, 'Contribuição previdenciária retida', 'valores.retCP');
  const vRetIRRF = retencao(v.retIRRF, 'IRRF', 'valores.retIRRF');
  const vRetCSLL = retencao(v.retCSLL, 'Contribuições sociais retidas', 'valores.retCSLL');
  // Regra do portal (E0724): retenção diferente de "0" e "2" exige o valor das contribuições sociais retidas (CSLL).
  if (tpRetPisCofins && !['0', '2'].includes(tpRetPisCofins) && !vRetCSLL) {
    e('Com esse tipo de retenção do PIS/COFINS/CSLL o portal exige informar o valor das "Contribuições sociais retidas".', 'valores.retCSLL');
  }
  const tribFed = grupo('tribFed',
    (cst ? grupo('piscofins', tag('CST', cst) + tag('tpRetPisCofins', tpRetPisCofins)) : '') +
    tag('vRetCP', vRetCP) +
    tag('vRetIRRF', vRetIRRF) +
    tag('vRetCSLL', vRetCSLL));

  const ibscbs = montarIbsCbs(dados.ibscbs, layoutNovo, competencia, e);

  const id = montarIdDps({ codigoMunicipio: codMun, cnpj, serie, numero });

  const inf =
    tag('tpAmb', ambiente) +
    tag('dhEmi', dhEmi) +
    tag('verAplic', VER_APLIC) +
    tag('serie', Number(serie)) +
    tag('nDPS', numero) +
    tag('dCompet', competencia) +
    tag('tpEmit', 1) +
    (layoutNovo ? tag('finNFSe', 0) : '') + // finalidade: 0 = NFS-e regular (só existe no leiaute de 20/10/2026)
    tag('cLocEmi', codMun) +
    grupo('prest',
      tag('CNPJ', cnpj) +
      tag('IM', textoLimpo(p.inscricaoMunicipal, 15)) +
      tag('fone', soDigitos(p.telefone).length >= 6 ? soDigitos(p.telefone).slice(0, 20) : '') +
      tag('email', textoLimpo(p.email, 80)) +
      grupo('regTrib',
        tag('opSimpNac', opSimpNac) +
        (opSimpNac === 3 ? tag('regApTribSN', regApTribSN) : '') +
        tag('regEspTrib', regEspTrib))) +
    grupo('toma',
      tag(tomadorPJ ? 'CNPJ' : 'CPF', docTomador) +
      tag('xNome', nomeTomador) +
      endTomador +
      tag('fone', foneTomador.length >= 6 ? foneTomador.slice(0, 20) : '') +
      tag('email', emailTomador)) +
    grupo('serv',
      grupo('locPrest', tag('cLocPrestacao', locPrest)) +
      grupo('cServ',
        tag('cTribNac', cTribNac) +
        (layoutNovo ? tag('cNBS', cNBS) + tag('xDescServ', descricao) : tag('xDescServ', descricao) + tag('cNBS', cNBS))) +
      grupo('infoCompl', tag('idDocTec', idDocTec) + tag('docRef', docRef) + tag('xInfComp', infCompl))) +
    grupo('valores',
      grupo('vServPrest', tag('vServ', decimal2(centavos))) +
      (descontoCent > 0 ? grupo('vDescCondIncond', tag('vDescIncond', decimal2(descontoCent))) : '') +
      grupo('trib',
        grupo('tribMun',
          tag('tribISSQN', tribISSQN) +
          tag('tpRetISSQN', tpRetISSQN) +
          tag('pAliq', pAliq)) +
        tribFed +
        grupo('totTrib', totTrib))) + ibscbs;

  return { id, raiz: 'DPS', tagAssinada: 'infDPS', conteudo: inf, valorCentavos: centavos };
}

/** Pedido de cancelamento (evento 101101). Id: "PRE" + chave(50) + código do evento(6) = 59 posições. */
export function montarPedidoCancelamento({ ambiente, chaveAcesso, cnpjAutor, codigoMotivo, motivo, dhEvento }) {
  const chave = soDigitos(chaveAcesso);
  if (chave.length !== 50) throw new ValidacaoError('Chave de acesso da nota inválida.', 'chaveAcesso');
  const cnpj = soDigitos(cnpjAutor);
  if (!validarCnpj(cnpj)) throw new ValidacaoError('CNPJ da empresa emissora inválido.', 'cnpj');
  const cod = Number(codigoMotivo);
  if (![1, 2, 9].includes(cod)) throw new ValidacaoError('Escolha o motivo do cancelamento.', 'codigoMotivo');
  const xMotivo = textoLimpo(motivo, 255).replace(/\n/g, ' ');
  if (xMotivo.length < 15) throw new ValidacaoError('Explique o motivo do cancelamento com pelo menos 15 caracteres.', 'motivo');

  const id = `PRE${chave}101101`;
  const inf =
    tag('tpAmb', Number(ambiente)) +
    tag('verAplic', VER_APLIC) +
    tag('dhEvento', dhEvento || dataHoraBrasilia()) +
    tag('CNPJAutor', cnpj) +
    tag('chNFSe', chave) +
    grupo('e101101',
      tag('xDesc', 'Cancelamento de NFS-e') +
      tag('cMotivo', cod) +
      tag('xMotivo', xMotivo));
  return { id, raiz: 'pedRegEvento', tagAssinada: 'infPedReg', conteudo: inf };
}

/**
 * Assina o documento (assinatura envelopada sobre a tag com Id) e devolve o XML final.
 * @param {{id:string, raiz:string, tagAssinada:string, conteudo:string}} doc
 * @param {{chavePrivadaPem:string, certificadoDerB64:string}} cert
 * @param {'sha1'|'sha256'} algoritmo
 */
export function assinarDocumento(doc, cert, algoritmo = 'sha1') {
  const alg = ALGS[algoritmo];
  if (!alg) throw new Error(`Algoritmo de assinatura desconhecido: ${algoritmo}`);

  // Forma canônica da tag assinada: herda o namespace do elemento raiz.
  const canonico = `<${doc.tagAssinada} xmlns="${NS_NFSE}" Id="${doc.id}">${doc.conteudo}</${doc.tagAssinada}>`;
  const digest = crypto.createHash(alg.hash).update(canonico, 'utf8').digest('base64');

  const corpoSignedInfo =
    `<CanonicalizationMethod Algorithm="${ALG_C14N}"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="${alg.sig}"></SignatureMethod>` +
    `<Reference URI="#${doc.id}">` +
    `<Transforms><Transform Algorithm="${ALG_ENVELOPED}"></Transform><Transform Algorithm="${ALG_C14N}"></Transform></Transforms>` +
    `<DigestMethod Algorithm="${alg.digest}"></DigestMethod>` +
    `<DigestValue>${digest}</DigestValue>` +
    `</Reference>`;
  const signedInfoCanonico = `<SignedInfo xmlns="${NS_DSIG}">${corpoSignedInfo}</SignedInfo>`;
  const assinatura = crypto.createSign(alg.node).update(signedInfoCanonico, 'utf8').sign(cert.chavePrivadaPem, 'base64');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<${doc.raiz} xmlns="${NS_NFSE}" versao="${VERSAO_LEIAUTE}">` +
    `<${doc.tagAssinada} Id="${doc.id}">${doc.conteudo}</${doc.tagAssinada}>` +
    `<Signature xmlns="${NS_DSIG}">` +
    `<SignedInfo>${corpoSignedInfo}</SignedInfo>` +
    `<SignatureValue>${assinatura}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${cert.certificadoDerB64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>` +
    `</${doc.raiz}>`
  );
}

/** Lê um valor simples de dentro do XML devolvido pelo portal (primeira ocorrência da tag). */
export function lerTag(xml, nome) {
  const m = new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml || '');
  return m ? m[1] : null;
}
