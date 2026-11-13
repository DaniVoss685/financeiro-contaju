// Teste do núcleo da NFS-e Nacional (sem rede e sem banco):
//   node scripts/test-nfse.mjs
// Confere: leitura do certificado, cifragem, XML válido no esquema oficial (XSD),
// assinatura verificada por biblioteca independente, compactação e validações.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { validateXML } from 'xmllint-wasm';
import { layoutDoAmbiente, outroLayout, recusaPorLeiaute, recusaPorDuplicidade, montarDps, montarPedidoCancelamento, assinarDocumento, montarIdDps, paraCentavos, decimal2, dataHoraBrasilia, validarCnpj, validarCpf, lerTag, ValidacaoError } from '../api/_nfse/xml.js';
import { lerCertificado, cifrar, decifrar, CertificadoError } from '../api/_nfse/cert.js';
import { compactar, descompactar, mensagensDeErro } from '../api/_nfse/sefin.js';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dirXsd = path.join(raiz, 'docs', 'nfse', 'schemas');
let falhas = 0;
let total = 0;
function ok(cond, nome, detalhe = '') {
  total++;
  if (cond) console.log(`  ok  ${nome}`);
  else { falhas++; console.log(`FALHA ${nome} ${detalhe}`); }
}
function lanca(fn, tipo, nome) {
  try { fn(); ok(false, nome, '(não lançou erro)'); } catch (e) { ok(e instanceof tipo, nome, `(${e.message})`); }
}

// --- Certificado A1 sintético (autoassinado, só para teste) --------------------
const SENHA = 'senha-de-teste';
const CNPJ_TESTE = '11222333000181'; // CNPJ fictício com dígitos verificadores válidos
function gerarPfx() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000);
  const attrs = [{ name: 'commonName', value: `EMPRESA DE TESTE LTDA:${CNPJ_TESTE}` }, { name: 'countryName', value: 'BR' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], SENHA, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

const dirXsdAntigo = path.join(raiz, 'docs', 'nfse', 'schemas_20260209');
const esquemas = (nomes, dir = dirXsd) => nomes.map(n => ({ fileName: n, contents: fs.readFileSync(path.join(dir, n), 'utf8').replace(/^﻿/, '') }));
async function validarXsd(xml, principal, extras, dir = dirXsd) {
  const r = await validateXML({
    xml: [{ fileName: 'doc.xml', contents: xml }],
    schema: esquemas([principal], dir),
    preload: esquemas(extras, dir)
  });
  return r;
}

function verificarAssinatura(xml, certPem) {
  const assinatura = /<Signature[\s\S]*<\/Signature>/.exec(xml)[0];
  const sig = new SignedXml({ publicCert: certPem });
  sig.loadSignature(assinatura);
  return sig.checkSignature(xml);
}

const dadosBase = () => ({
  ambiente: 2,
  serie: '1',
  numero: 7,
  competencia: dataHoraBrasilia().slice(0, 10),
  prestador: { cnpj: CNPJ_TESTE, codigoMunicipio: '3550308', inscricaoMunicipal: '12345678', telefone: '(11) 3333-4444', email: 'fiscal@teste.com.br', opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 },
  tomador: { documento: '529.982.247-25', nome: 'Cliente & Filhos <Teste>', email: 'cliente@teste.com.br', telefone: '11999998888', endereco: { cep: '38280-000', codigoMunicipio: '3134400', logradouro: 'Rua Exemplo', numero: '10', complemento: '', bairro: 'Centro' } },
  servico: { cTribNac: '171901', cNBS: '113021000', descricao: 'Honorários contábeis\r\nReferente a 10/2026 — "teste" & ajustes', informacoesComplementares: 'Venda VD-0001' },
  valores: { valorServico: 1500.1, issRetido: false, pTotTribSN: 6 }
});

console.log('\n== Utilitários');
ok(paraCentavos(0.1 + 0.2) === 30, 'centavos sem erro de ponto flutuante (0.1+0.2)');
ok(paraCentavos('1500,10') === 150010, 'centavos a partir de texto com vírgula');
ok(decimal2(150010) === '1500.10' && decimal2(5) === '0.05' && decimal2(100) === '1.00', 'formatação decimal do leiaute');
ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(dataHoraBrasilia()), 'data e hora no fuso de Brasília');
ok(validarCnpj(CNPJ_TESTE) && !validarCnpj('11222333000180'), 'validação de CNPJ');
ok(validarCpf('52998224725') && !validarCpf('11111111111'), 'validação de CPF');
const idEsperado = `DPS35503082${CNPJ_TESTE}00001000000000000007`;
ok(montarIdDps({ codigoMunicipio: '3550308', cnpj: CNPJ_TESTE, serie: '1', numero: 7 }) === idEsperado && idEsperado.length === 45, 'Id da DPS com 45 posições');

console.log('\n== Certificado');
const pfx = gerarPfx();
const cert = lerCertificado(pfx, SENHA);
ok(cert.titular === 'EMPRESA DE TESTE LTDA' && cert.documento === CNPJ_TESTE, 'titular e CNPJ lidos do certificado');
ok(cert.validoAte > new Date(), 'validade lida');
lanca(() => lerCertificado(pfx, 'senha-errada'), CertificadoError, 'senha errada é recusada com mensagem clara');
lanca(() => lerCertificado(Buffer.from('isto nao e um pfx'), SENHA), CertificadoError, 'arquivo inválido é recusado');
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const cifrado = cifrar(pfx, SEGREDO);
ok(decifrar(cifrado, SEGREDO).equals(pfx), 'cifragem e decifragem do certificado');
ok(!cifrado.includes(pfx.toString('base64').slice(0, 40)), 'conteúdo cifrado não expõe o arquivo');
lanca(() => decifrar(cifrado, 'outro-segredo-com-mais-de-32-caracteres!!!!'), Error, 'segredo errado não decifra');
lanca(() => decifrar(cifrado.slice(0, -6) + 'AAAAAA', SEGREDO), Error, 'conteúdo adulterado não decifra');
lanca(() => cifrar(pfx, 'curto'), Error, 'segredo curto é recusado');

console.log('\n== DPS');
const XSD_DPS = ['tiposComplexos_v1.01.xsd', 'tiposSimples_v1.01.xsd', 'xmldsig-core-schema.xsd'];
for (const alg of ['sha1', 'sha256']) {
  const doc = montarDps(dadosBase());
  const xml = assinarDocumento(doc, cert, alg);
  const r = await validarXsd(xml, 'DPS_v1.01.xsd', XSD_DPS);
  ok(r.valid, `XML da DPS válido no esquema oficial (${alg})`, JSON.stringify(r.errors).slice(0, 600));
  ok(verificarAssinatura(xml, cert.certificadoPem), `assinatura confere em verificador independente (${alg})`);
  const adulterado = xml.replace('<vServ>1500.10</vServ>', '<vServ>9500.10</vServ>');
  let pegou = false;
  try { pegou = !verificarAssinatura(adulterado, cert.certificadoPem); } catch { pegou = true; }
  ok(pegou, `valor alterado depois de assinar invalida a assinatura (${alg})`);
  if (alg === 'sha1') {
    ok(doc.id === idEsperado && xml.includes(`<infDPS Id="${idEsperado}">`), 'Id da DPS no XML');
    ok(lerTag(xml, 'vServ') === '1500.10' && lerTag(xml, 'pTotTribSN') === '6.00', 'valores com duas casas');
    ok(xml.indexOf('<finNFSe>0</finNFSe>') > xml.indexOf('<tpEmit>1</tpEmit>') && xml.indexOf('<finNFSe>0</finNFSe>') < xml.indexOf('<cLocEmi>'), 'finNFSe entre tpEmit e cLocEmi');
    ok(xml.indexOf('<cNBS>') < xml.indexOf('<xDescServ>'), 'cNBS antes de xDescServ');
    ok(xml.includes('Cliente &amp; Filhos &lt;Teste&gt;'), 'caracteres especiais escapados');
    ok(!xml.includes('\r') && xml.includes('<CPF>52998224725</CPF>'), 'quebras de linha normalizadas e CPF só com dígitos');
    ok(descompactar(compactar(xml)) === xml, 'compactação GZip+Base64 ida e volta');
  }
}

// Variações de regime e tomador
const naoOptante = dadosBase();
naoOptante.prestador.opSimpNac = 1; delete naoOptante.prestador.regApTribSN;
naoOptante.tomador.documento = '11.444.777/0001-61';
naoOptante.valores = { valorServico: 250, issRetido: true, aliquotaIss: 2.5, descontoIncondicionado: 10 };
naoOptante.tomador.endereco = { cep: '38280-000', codigoMunicipio: '3134400', logradouro: 'Rua Exemplo', numero: '123', complemento: 'Sala 4', bairro: 'Centro' };
const xmlNao = assinarDocumento(montarDps(naoOptante), cert);
const rNao = await validarXsd(xmlNao, 'DPS_v1.01.xsd', XSD_DPS);
ok(rNao.valid, 'DPS de empresa fora do Simples, cliente PJ, ISS retido e desconto', JSON.stringify(rNao.errors).slice(0, 600));
ok(xmlNao.includes('<tpRetISSQN>2</tpRetISSQN>') && xmlNao.includes('<pAliq>2.50</pAliq>') && xmlNao.includes('<indTotTrib>0</indTotTrib>') && !xmlNao.includes('regApTribSN'), 'campos de retenção, alíquota e regime corretos');

console.log('\n== Validações de entrada');
const muda = fn => { const d = dadosBase(); fn(d); return () => montarDps(d); };
lanca(muda(d => { d.tomador.documento = '12345678900'; }), ValidacaoError, 'CPF inválido do cliente');
lanca(muda(d => { d.valores.valorServico = 0; }), ValidacaoError, 'valor zero');
lanca(muda(d => { d.valores.valorServico = -10; }), ValidacaoError, 'valor negativo');
lanca(muda(d => { d.servico.cTribNac = '1719'; }), ValidacaoError, 'código de tributação incompleto');
lanca(muda(d => { d.servico.cNBS = ''; }), ValidacaoError, 'NBS ausente');
lanca(muda(d => { d.servico.descricao = '   '; }), ValidacaoError, 'descrição vazia');
lanca(muda(d => { d.prestador.opSimpNac = null; }), ValidacaoError, 'regime da empresa não configurado');
lanca(muda(d => { d.prestador.regApTribSN = null; }), ValidacaoError, 'ME/EPP sem regime de apuração');
lanca(muda(d => { d.valores.pTotTribSN = null; }), ValidacaoError, 'ME/EPP sem percentual de tributos (regra E0712 do portal)');
lanca(muda(d => { d.competencia = '2999-01-01'; }), ValidacaoError, 'data do serviço no futuro');
lanca(muda(d => { d.prestador.codigoMunicipio = '355'; }), ValidacaoError, 'município incompleto');

console.log('\n== Informações complementares e tributação federal');
const completo = dadosBase();
completo.servico.idDocTec = 'ART 12345/2026';
completo.servico.docRef = 'Contrato 7/2026\nrenovação';
completo.servico.informacoesComplementares = 'Venda VD-0001 — referente a 10/2026';
completo.valores.pisCofinsCst = '00';
completo.valores.pisCofinsTpRet = '3'; // exige CSLL (E0724): informada logo abaixo
completo.valores.retIRRF = 15;
completo.valores.retCSLL = 10.5;
completo.valores.retCP = 20;
const xmlCompleto = assinarDocumento(montarDps(completo), cert);
const rCompleto = await validarXsd(xmlCompleto, 'DPS_v1.01.xsd', XSD_DPS);
ok(rCompleto.valid, 'DPS com todos os campos novos válida no esquema oficial', JSON.stringify(rCompleto.errors).slice(0, 600));
ok(/<infoCompl><idDocTec>ART 12345\/2026<\/idDocTec><docRef>Contrato 7\/2026 renovação<\/docRef><xInfComp>/.test(xmlCompleto), 'informações complementares na ordem do leiaute');
ok(/<tribFed><piscofins><CST>00<\/CST><tpRetPisCofins>3<\/tpRetPisCofins><\/piscofins><vRetCP>20\.00<\/vRetCP><vRetIRRF>15\.00<\/vRetIRRF><vRetCSLL>10\.50<\/vRetCSLL><\/tribFed><totTrib>/.test(xmlCompleto), 'tributação federal depois do ISS e antes dos tributos totais');
const semFed = assinarDocumento(montarDps(dadosBase()), cert);
ok(!semFed.includes('tribFed') && !semFed.includes('idDocTec') && !semFed.includes('docRef'), 'campos vazios não vão no XML');
const soIrrf = dadosBase(); soIrrf.valores.retIRRF = 12.34;
const xmlIrrf = assinarDocumento(montarDps(soIrrf), cert);
ok((await validarXsd(xmlIrrf, 'DPS_v1.01.xsd', XSD_DPS)).valid && !xmlIrrf.includes('piscofins') && xmlIrrf.includes('<vRetIRRF>12.34</vRetIRRF>'), 'só IRRF informado (sem PIS/COFINS) é válido');
lanca(muda(d => { d.valores.pisCofinsCst = '77'; }), ValidacaoError, 'situação do PIS/COFINS fora da tabela');
lanca(muda(d => { d.valores.pisCofinsTpRet = '3'; }), ValidacaoError, 'tipo de retenção sem situação do PIS/COFINS');
lanca(muda(d => { d.valores.pisCofinsCst = '00'; d.valores.pisCofinsTpRet = '3'; }), ValidacaoError, 'retenção 3 sem valor de CSLL (E0724) é barrada antes do envio');
ok(!!montarDps((() => { const d = dadosBase(); d.valores.pisCofinsCst = '00'; d.valores.pisCofinsTpRet = '2'; return d; })()), 'retenção 2 (não retidos) não exige CSLL');
lanca(muda(d => { d.valores.retIRRF = 99999; }), ValidacaoError, 'IRRF maior que o valor do serviço');
lanca(muda(d => { d.valores.retCSLL = -5; }), ValidacaoError, 'retenção negativa');
const bonito = dadosBase();
bonito.servico.informacoesComplementares = 'Ref. “10/2026” — serviço 😀 prestado…\nsegunda linha';
bonito.servico.descricao = 'Honorários – “teste” 😀';
bonito.tomador.nome = 'Cliente — Ação “Ltda” 😀';
const xmlBonito = assinarDocumento(montarDps(bonito), cert);
const rBonito = await validarXsd(xmlBonito, 'DPS_v1.01.xsd', XSD_DPS);
ok(rBonito.valid, 'aspas, travessão e emoji colados de outro programa não quebram o XML', JSON.stringify(rBonito.errors).slice(0, 400));
ok(lerTag(xmlBonito, 'xInfComp') === 'Ref. "10/2026" - serviço prestado... segunda linha', 'texto trocado pelos caracteres comuns (acentos mantidos)', lerTag(xmlBonito, 'xInfComp'));
const longo = dadosBase(); longo.servico.idDocTec = 'X'.repeat(80); longo.servico.docRef = 'Y'.repeat(400);
const xmlLongo = montarDps(longo).conteudo;
ok(lerTag(xmlLongo, 'idDocTec').length === 40 && lerTag(xmlLongo, 'docRef').length === 255, 'textos longos cortados no limite do leiaute');

console.log('\n== Endereço do tomador e regras do portal (E0237, E0625, E0008)');
ok(/<xNome>Cliente[^<]*<\/xNome><end><endNac><cMun>3134400<\/cMun><CEP>38280000<\/CEP><\/endNac><xLgr>Rua Exemplo<\/xLgr><nro>123<\/nro><xCpl>Sala 4<\/xCpl><xBairro>Centro<\/xBairro><\/end>/.test(xmlNao.replace(/\n/g, '')) || /<end><endNac>/.test(xmlNao), 'endereço do tomador depois do nome');
const retido = dadosBase();
retido.valores.issRetido = true; retido.valores.aliquotaIss = '2'; delete retido.tomador.endereco;
lanca(() => montarDps(retido), ValidacaoError, 'sem endereço do cliente a nota é barrada antes do envio (vale para toda nota; com ISS retido é regra E0237 do portal)');
lanca(() => montarDps({ ...dadosBase(), tomador: { ...dadosBase().tomador, endereco: undefined } }), ValidacaoError, 'nota sem ISS retido e sem endereço do cliente também é barrada');
retido.tomador.endereco = { cep: '38280000', codigoMunicipio: '3134400', logradouro: 'Rua Exemplo', numero: 'S/N', bairro: 'Centro' };
const retidoSemAliq = JSON.parse(JSON.stringify(retido)); retidoSemAliq.valores.aliquotaIss = '';
lanca(() => montarDps(retidoSemAliq), ValidacaoError, 'ME/EPP com ISS retido sem alíquota (E0621) é barrado antes do envio');
const xmlRetido = assinarDocumento(montarDps(retido), cert);
ok((await validarXsd(xmlRetido, 'DPS_v1.01.xsd', XSD_DPS)).valid && xmlRetido.includes('<tpRetISSQN>2</tpRetISSQN>'), 'ISS retido com endereço é válido no esquema oficial');
const endPela = dadosBase(); endPela.tomador.endereco = { cep: '38280000', codigoMunicipio: '3134400', logradouro: 'Rua Exemplo', numero: '', bairro: 'Centro' };
lanca(() => montarDps(endPela), ValidacaoError, 'endereço incompleto (sem número) é barrado');
const aliq = dadosBase(); aliq.valores.aliquotaIss = '2';
lanca(() => montarDps(aliq), ValidacaoError, 'ME/EPP com alíquota e sem retenção (E0625) é barrado');
aliq.valores.issRetido = true; aliq.tomador.endereco = retido.tomador.endereco;
ok((await validarXsd(assinarDocumento(montarDps(aliq), cert), 'DPS_v1.01.xsd', XSD_DPS)).valid, 'ME/EPP com alíquota e ISS retido é aceito');
const dh = montarDps(dadosBase()); const dhx = assinarDocumento(dh, cert);
const emi = new Date(lerTag(dhx, 'dhEmi'));
ok(Date.now() - emi.getTime() > 90 * 1000 && Date.now() - emi.getTime() < 150 * 1000, 'hora da DPS sai ~2 minutos antes de agora (folga contra E0008)');

console.log('\n== Dois leiautes (produção ainda no de 09/02/2026, testes no de 20/10/2026)');
ok(layoutDoAmbiente(1) === 'antigo' && layoutDoAmbiente(2) === 'novo' && outroLayout('novo') === 'antigo', 'produção começa no leiaute anterior e testes no novo');
const casos = { 'só o básico': dadosBase(), 'tudo preenchido': completo, 'ISS retido com endereço': retido };
for (const [nome, d] of Object.entries(casos)) {
  const xmlAntigo = assinarDocumento(montarDps({ ...d, layout: 'antigo' }), cert);
  const xmlNovo = assinarDocumento(montarDps({ ...d, layout: 'novo' }), cert);
  ok(!xmlAntigo.includes('finNFSe') && xmlAntigo.indexOf('<xDescServ>') < xmlAntigo.indexOf('<cNBS>'), `leiaute anterior sem finNFSe e com xDescServ antes de cNBS (${nome})`);
  const rA = await validarXsd(xmlAntigo, 'DPS_v1.01.xsd', XSD_DPS, dirXsdAntigo);
  ok(rA.valid, `XML do leiaute anterior válido no esquema de 09/02/2026 (${nome})`, JSON.stringify(rA.errors).slice(0, 500));
  const rN = await validarXsd(xmlNovo, 'DPS_v1.01.xsd', XSD_DPS);
  ok(rN.valid, `XML do leiaute novo válido no esquema de 20/10/2026 (${nome})`, JSON.stringify(rN.errors).slice(0, 500));
  const cruzado = await validarXsd(xmlNovo, 'DPS_v1.01.xsd', XSD_DPS, dirXsdAntigo);
  ok(!cruzado.valid, `o XML novo é mesmo recusado pelo esquema anterior (${nome}), como a produção fez`);
}
ok(recusaPorLeiaute(["E1235 — Falha no esquema XML do DF-e. — The element 'infDPS' in namespace 'http://www.sped.fazenda.gov.br/nfse' has invalid child element 'finNFSe' in namespace"]), 'reconhece a recusa por leiaute (finNFSe)');
ok(recusaPorDuplicidade(['E0014 — Conjunto de Série, Número, Código do Município Emissor e CNPJ/CPF informado nesta DPS já existe em uma NFS-e gerada a partir de uma DPS enviada anteriormente.']) && !recusaPorDuplicidade(['E0712 — outra regra']), 'reconhece a recusa por número de DPS repetido (E0014)');
ok(!recusaPorLeiaute(['E0712 — Para ME/EPP o indicador de informação de valor total de tributos não pode ser informado.']), 'não confunde regra de negócio com leiaute');

console.log('\n== IBS/CBS (reforma tributária)');
const ibsBase = () => ({ informar: true, cst: '000', cClassTrib: '000001', cIndOp: '100201', indFinal: '0', indDest: '0' });
const comIbs = (alt = {}, extra = {}) => ({ ...dadosBase(), ibscbs: { ...ibsBase(), ...alt }, ...extra });
for (const [nome, extra] of Object.entries({
  'básico': {},
  'com destinatário diferente do adquirente': { indDest: '1', dest: { documento: '11.444.777/0001-61', nome: 'Destinatário Ltda', endereco: { cep: '38280000', codigoMunicipio: '3134400', logradouro: 'Rua A', numero: '5', bairro: 'Centro' } } },
  'compra governamental': { tpEnteGov: '4', tpOper: '1' },
  'com nota referenciada': { refNFSe: ['3'.repeat(50)] },
  'consumidor final': { indFinal: '1' }
})) {
  for (const layout of ['novo', 'antigo']) {
    const x = assinarDocumento(montarDps({ ...comIbs(extra), layout }), cert);
    const v = await validarXsd(x, 'DPS_v1.01.xsd', XSD_DPS, layout === 'novo' ? dirXsd : dirXsdAntigo);
    ok(v.valid, `IBS/CBS ${nome} válido no esquema oficial (${layout})`, JSON.stringify(v.errors).slice(0, 500));
  }
}
const xNovo = assinarDocumento(montarDps({ ...comIbs(), layout: 'novo' }), cert);
const xAntigo = assinarDocumento(montarDps({ ...comIbs(), layout: 'antigo' }), cert);
ok(/<IBSCBS><indFinal>0<\/indFinal><cIndOp>100201<\/cIndOp><indDest>0<\/indDest><valores><trib><CST>000<\/CST><cClassTrib>000001<\/cClassTrib><\/trib><\/valores><\/IBSCBS><\/infDPS>/.test(xNovo), 'leiaute novo: CST e cClassTrib direto em trib, grupo no fim da DPS');
ok(/<IBSCBS><finNFSe>0<\/finNFSe><indFinal>0<\/indFinal>.*<gIBSCBS><CST>000<\/CST><cClassTrib>000001<\/cClassTrib><\/gIBSCBS>/.test(xAntigo), 'leiaute antigo: finNFSe dentro do grupo e CST/cClassTrib dentro de gIBSCBS');
ok(!assinarDocumento(montarDps({ ...dadosBase(), ibscbs: { ...ibsBase(), informar: false } }), cert).includes('IBSCBS'), 'IBS/CBS desmarcado não vai no XML');
lanca(() => montarDps(comIbs({ cst: '' })), ValidacaoError, 'IBS/CBS sem CST é barrado');
lanca(() => montarDps(comIbs({ cClassTrib: '999999' })), ValidacaoError, 'classificação tributária inexistente é barrada');
lanca(() => montarDps(comIbs({ cst: '200' })), ValidacaoError, 'classificação que não pertence ao CST é barrada');
lanca(() => montarDps(comIbs({ cIndOp: '' })), ValidacaoError, 'IBS/CBS sem indicador da operação é barrado');
lanca(() => montarDps(comIbs({ indDest: '1' })), ValidacaoError, 'destinatário diferente sem dados é barrado');
lanca(() => montarDps(comIbs({ tpEnteGov: '2' })), ValidacaoError, 'compra governamental sem tipo de operação é barrada');
lanca(() => montarDps(comIbs({ refNFSe: ['123'] })), ValidacaoError, 'chave de nota referenciada inválida é barrada');
lanca(() => montarDps(comIbs({}, { competencia: '2025-12-31' })), ValidacaoError, 'IBS/CBS antes de 01/01/2026 é barrado');

console.log('\n== Cancelamento');
// Chave de acesso sintética no padrão: 6 dígitos + 14 (tipo de inscrição 2 + CNPJ) + 30 dígitos
const chave = '355030' + '12' + CNPJ_TESTE + '3'.repeat(28);
const ped = montarPedidoCancelamento({ ambiente: 2, chaveAcesso: chave, cnpjAutor: CNPJ_TESTE, codigoMotivo: 1, motivo: 'Nota emitida com valor errado' });
const xmlPed = assinarDocumento(ped, cert);
const rPed = await validarXsd(xmlPed, 'pedRegEvento_v1.01.xsd', ['tiposEventos_v1.01.xsd', ...XSD_DPS]);
ok(rPed.valid, 'XML do pedido de cancelamento válido no esquema oficial', JSON.stringify(rPed.errors).slice(0, 600));
ok(ped.id === `PRE${chave}101101` && ped.id.length === 59, 'Id do pedido de cancelamento (59 posições)');
ok(!xmlPed.includes('nPedRegEvento'), 'pedido sem o campo removido no leiaute novo');
ok(verificarAssinatura(xmlPed, cert.certificadoPem), 'assinatura do cancelamento confere');
lanca(() => montarPedidoCancelamento({ ambiente: 2, chaveAcesso: chave, cnpjAutor: CNPJ_TESTE, codigoMotivo: 1, motivo: 'curto' }), ValidacaoError, 'motivo curto é recusado');
lanca(() => montarPedidoCancelamento({ ambiente: 2, chaveAcesso: '123', cnpjAutor: CNPJ_TESTE, codigoMotivo: 1, motivo: 'Nota emitida com valor errado' }), ValidacaoError, 'chave inválida é recusada');

console.log('\n== Leitura das respostas do portal');
ok(mensagensDeErro({ erros: [{ Codigo: 'E0014', Descricao: 'DPS duplicada', Complemento: 'x' }] })[0] === 'E0014 — DPS duplicada — x', 'erros com iniciais maiúsculas');
ok(mensagensDeErro({ erro: { codigo: 'E1', descricao: 'Falha' } })[0] === 'E1 — Falha', 'erro único em minúsculas');
ok(mensagensDeErro({ chaveAcesso: 'x' }).length === 0, 'resposta de sucesso não vira erro');

console.log(`\n${total - falhas}/${total} verificações passaram.`);
process.exit(falhas ? 1 : 0);
