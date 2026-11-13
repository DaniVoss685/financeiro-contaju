import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { NFSE_LOGO_PNG } from '../data/nfseLogo';

/**
 * DANFSe (Documento Auxiliar da NFS-e) no mesmo modelo do Portal Nacional (v2.0), montado a partir do
 * XML autorizado. É usado quando o portal não entrega o PDF oficial (o serviço de PDF fica fora do ar
 * de vez em quando). O documento fiscal continua sendo o XML.
 */

export interface DadosNotaPdf {
  /** XML da NFS-e devolvido pelo portal (já com a DPS dentro). */
  xml: string;
  /** Situação para o campo "Situação da NFS-e". */
  situacao: 'GERADA' | 'CANCELADA';
}

type No = Element | null | undefined;

const filho = (el: No, nome: string): Element | null => {
  if (!el) return null;
  for (const c of Array.from(el.children)) if (c.localName === nome) return c;
  return null;
};
const caminho = (el: No, ...nomes: string[]): Element | null => nomes.reduce<No>((acc, n) => filho(acc, n), el) || null;
const txt = (el: No, ...nomes: string[]): string => (caminho(el, ...nomes)?.textContent || '').trim();
const dig = (v: string) => (v || '').replace(/\D/g, '');

const NBSP = / /g;
const brl = (v: string) => (v === '' || v == null || Number.isNaN(Number(v)) ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)).replace(NBSP, ' '));
const pct = (v: string) => (v === '' || Number.isNaN(Number(v)) ? '-' : `${Number(v).toFixed(2).replace('.', ',')}%`);
const ou = (v: string) => (v && v.trim() ? v.trim() : '-');

const dataBR = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const dataHoraBR = (iso: string) => (iso ? `${dataBR(iso)} ${iso.slice(11, 19)}` : '-');

function documento(d: string): string {
  const x = dig(d);
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d || '-';
}
function telefone(t: string): string {
  const x = dig(t);
  if (x.length === 11) return x.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (x.length === 10) return x.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return t ? t : '-';
}
const cep = (c: string) => (dig(c).length === 8 ? dig(c).replace(/^(\d{2})(\d{3})(\d{3})$/, '$1.$2-$3') : '-');
const ibge = (c: string) => (dig(c).length === 7 ? `${dig(c).slice(0, 2)}.${dig(c).slice(2)}` : '-');
/** "31.34400 / 38.280-000"; só um traço quando não há nenhum dos dois, como no portal. */
const ibgeCep = (c: string, p: string) => (dig(c).length === 7 || dig(p).length === 8 ? `${ibge(c)} / ${cep(p)}` : '-');
const servico = (c: string) => (dig(c).length === 6 ? `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}` : ou(c));
const nbs = (c: string) => (dig(c).length === 9 ? `${c.slice(0, 1)}.${c.slice(1, 5)}.${c.slice(5, 7)}.${c.slice(7, 9)}` : ou(c));

const SIMPLES: Record<string, string> = {
  '1': 'Não Optante',
  '2': 'Optante - Microempreendedor Individual (MEI)',
  '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)'
};
const REGIME_SN: Record<string, string> = {
  '1': 'Regime de apuração dos tributos federais e municipal pelo Simples Nacional',
  '2': 'Regime de apuração dos tributos federais pelo Simples Nacional e ISSQN pela NFS-e conforme respectiva legislação municipal',
  '3': 'Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal de cada tributo'
};
const TRIB_ISSQN: Record<string, string> = { '1': 'Operação Tributável', '2': 'Imunidade', '3': 'Exportação de Serviço', '4': 'Não Incidência' };
const RET_ISSQN: Record<string, string> = { '1': 'Não Retido', '2': 'Retido pelo Tomador', '3': 'Retido pelo Intermediário' };
const EMITENTE: Record<string, string> = { '1': 'Prestador', '2': 'Tomador', '3': 'Intermediário' };
const RET_PIS_COFINS: Record<string, string> = {
  '0': 'PIS/COFINS/CSLL Não Retidos', '1': 'PIS/COFINS Retidos', '2': 'PIS/COFINS Não Retidos', '3': 'PIS/COFINS/CSLL Retidos',
  '4': 'PIS/COFINS Retidos, CSLL Não Retido', '5': 'PIS Retido, COFINS/CSLL Não Retido', '6': 'COFINS Retido, PIS/CSLL Não Retido',
  '7': 'PIS Não Retido, COFINS/CSLL Retidos', '8': 'PIS/COFINS Não Retidos, CSLL Retido', '9': 'COFINS Não Retido, PIS/CSLL Retidos'
};

/** Nome e sigla da UF de um município pelo código IBGE (consulta pública do IBGE). */
const cacheMunicipios = new Map<string, string>();
async function municipioPorIbge(codigo: string): Promise<string> {
  const c = dig(codigo);
  if (c.length !== 7) return '';
  const guardado = cacheMunicipios.get(c);
  if (guardado !== undefined) return guardado;
  const r = await consultarMunicipio(c);
  if (r) cacheMunicipios.set(c, r); // só guarda acerto: falha de rede não fica registrada
  return r;
}

async function consultarMunicipio(c: string): Promise<string> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const resp = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${c}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!resp.ok) return '';
    const j = await resp.json();
    const uf = j?.microrregiao?.mesorregiao?.UF?.sigla || j?.['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla || '';
    return j?.nome ? `${j.nome} / ${uf || '-'}` : '';
  } catch {
    return '';
  }
}

export async function gerarPdfNfse(d: DadosNotaPdf): Promise<Blob> {
  const xml = new DOMParser().parseFromString(d.xml, 'application/xml');
  const nfse = xml.documentElement;
  const inf = filho(nfse, 'infNFSe');
  const dps = caminho(inf, 'DPS', 'infDPS');
  const emit = filho(inf, 'emit');
  const ender = filho(emit, 'enderNac');
  const prest = filho(dps, 'prest');
  const toma = filho(dps, 'toma');
  const tomaEnd = caminho(toma, 'end');
  const tomaNac = caminho(tomaEnd, 'endNac');
  const valNf = filho(inf, 'valores');
  const valDps = filho(dps, 'valores');
  const tribMun = caminho(valDps, 'trib', 'tribMun');
  const tribFed = caminho(valDps, 'trib', 'tribFed');
  const pisCofins = filho(tribFed, 'piscofins');
  const infoCompl = caminho(dps, 'serv', 'infoCompl');

  const ibsNf = filho(inf, 'IBSCBS');
  const ibsDps = filho(dps, 'IBSCBS');
  const ibsTrib = caminho(ibsDps, 'valores', 'trib');
  const ibsClass = filho(ibsTrib, 'gIBSCBS') || ibsTrib; // leiaute antigo: dentro de gIBSCBS; novo: direto em trib
  const pc = (v: string) => (v === '' ? '-' : pct(v));
  const chave = (inf?.getAttribute('Id') || '').replace(/^NFS/, '');
  const emitCMun = txt(emit, 'enderNac', 'cMun');
  const emitUF = txt(emit, 'enderNac', 'UF');
  const emitCidade = txt(inf, 'xLocEmi');
  const cidadeUF = (cidade: string, uf: string) => (cidade ? `${cidade} / ${uf || '-'}` : '-');

  // Município do tomador: o XML só traz o código; se for o mesmo do prestador usa o nome dele, senão consulta o IBGE.
  const tomaCMun = txt(tomaNac, 'cMun');
  let tomaCidade = '-';
  if (tomaCMun) tomaCidade = tomaCMun === emitCMun ? cidadeUF(emitCidade, emitUF) : (await municipioPorIbge(tomaCMun)) || '-';
  const locPrestCMun = txt(dps, 'serv', 'locPrest', 'cLocPrestacao');
  const localPrestacao = locPrestCMun && locPrestCMun === emitCMun ? `${cidadeUF(txt(inf, 'xLocPrestacao') || emitCidade, emitUF)} / -` : `${txt(inf, 'xLocPrestacao') || '-'} / - / -`;
  const incidCMun = txt(inf, 'cLocIncid');
  const localIncidencia = incidCMun && incidCMun === emitCMun ? `${cidadeUF(txt(inf, 'xLocIncid') || emitCidade, emitUF)} / -` : `${txt(inf, 'xLocIncid') || '-'} / - / -`;

  const enderecoPrest = [txt(ender, 'xLgr'), txt(ender, 'nro'), txt(ender, 'xCpl'), txt(ender, 'xBairro')].filter(Boolean).join(', ') || '-';
  const enderecoToma = tomaEnd ? [txt(tomaEnd, 'xLgr'), txt(tomaEnd, 'nro'), txt(tomaEnd, 'xCpl'), txt(tomaEnd, 'xBairro')].filter(Boolean).join(', ') || '-' : '-';

  const vServ = txt(valDps, 'vServPrest', 'vServ');
  const vLiq = txt(valNf, 'vLiq');
  const vRetIRRF = txt(tribFed, 'vRetIRRF');
  const vRetCP = txt(tribFed, 'vRetCP');
  const vRetCSLL = txt(tribFed, 'vRetCSLL');
  const totRet = txt(valNf, 'vTotalRet') || (vRetIRRF || vRetCP || vRetCSLL ? String((Number(vRetIRRF || 0) + Number(vRetCP || 0) + Number(vRetCSLL || 0)).toFixed(2)) : '');
  const finalidade = txt(dps, 'finNFSe');
  const tpRetPC = txt(pisCofins, 'tpRetPisCofins');

  // ----------------------------------------------------------------- desenho
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const X = [11.9, 156.5, 301, 445.6];
  const L = 8.5;
  const R = 586.8;
  const CINZA: [number, number, number] = [242, 242, 242];

  const linhaH = (y: number) => { pdf.setDrawColor(0).setLineWidth(0.5).line(L, y, R, y); };
  const cinza = (x: number, y: number, w: number, h: number) => { pdf.setFillColor(...CINZA).rect(x, y, w, h, 'F'); };
  const rotulo = (t: string, x: number, y: number, tam = 6) => { pdf.setFont('helvetica', 'bold').setFontSize(tam).setTextColor(0).text(t, x, y); };
  const valor = (t: string, x: number, y: number, tam = 7, largura = 0) => {
    pdf.setFont('helvetica', 'normal').setFontSize(tam).setTextColor(0);
    let s = t;
    if (largura) {
      // Texto comprido é cortado por palavra e termina com " ...", como no modelo do portal.
      if (pdf.getTextWidth(t) > largura) {
        const palavras = t.split(' ');
        while (palavras.length > 1 && pdf.getTextWidth(`${palavras.join(' ')} ...`) > largura) palavras.pop();
        s = `${palavras.join(' ')} ...`;
      }
    }
    pdf.text(s, x, y);
  };
  /** Linha de campos: rótulo (6pt negrito) e valor (7pt). `col` 0..3. */
  const campo = (top: number, col: number, rot: string, val: string, largura = 0) => {
    rotulo(rot, X[col], top + 5.9);
    valor(val, X[col], top + 13.6, 7, largura);
  };
  const campoGrande = (top: number, col: number, rot: string, val: string) => {
    rotulo(rot, X[col], top + 6.6, 7);
    valor(val, X[col], top + 14.5);
  };

  // Moldura e cabeçalho
  pdf.setDrawColor(0).setLineWidth(1).rect(5, 5, 585, 832);
  cinza(8.5, 5.7, 144.6, 34);
  cinza(153.1, 5.7, 289.1, 34);
  cinza(442.2, 5.7, 144.6, 34);
  pdf.addImage(NFSE_LOGO_PNG, 'PNG', 11.9, 10.3, 115.65, 22.92);
  pdf.setFont('helvetica', 'bold').setFontSize(9).setTextColor(0);
  pdf.text('DANFSe v2.0', 297.6, 20.8, { align: 'center' });
  pdf.text('Documento Auxiliar da NFS-e', 297.6, 31.1, { align: 'center' });
  valor(`Município: ${emitCidade || '-'}${emitUF ? ` - ${emitUF}` : ''}`, X[3], 18.7, 8);
  valor(`Ambiente Gerador: ${ou(txt(inf, 'ambGer'))}`, X[3], 25.9, 6);
  valor(`Tipo de Ambiente: ${ou(txt(dps, 'tpAmb'))}`, X[3], 32.7, 6);
  linhaH(39.9);

  // Chave, números e datas
  rotulo('CHAVE DE ACESSO DA NFS-e', X[0], 51, 7);
  valor(chave || '-', X[0], 58.9);
  campoGrande(64.6, 0, 'NÚMERO DA NFS-e', ou(txt(inf, 'nNFSe')));
  campoGrande(64.6, 1, 'COMPETÊNCIA DA NFS-e', dataBR(txt(dps, 'dCompet')));
  campoGrande(64.6, 2, 'DATA E HORA DA EMISSÃO DA NFS-e', dataHoraBR(txt(inf, 'dhProc')));
  campoGrande(84.9, 0, 'NÚMERO DA DPS', ou(txt(dps, 'nDPS')));
  campoGrande(84.9, 1, 'SÉRIE DA DPS', ou(txt(dps, 'serie')));
  campoGrande(84.9, 2, 'DATA E HORA DA EMISSÃO DA DPS', dataHoraBR(txt(dps, 'dhEmi')));
  cinza(8.5, 105.1, 144.6, 20.2);
  campoGrande(105.1, 0, 'EMITENTE DA NFS-e', EMITENTE[txt(dps, 'tpEmit')] || '-');
  campoGrande(105.1, 1, 'SITUAÇÃO DA NFS-e', d.situacao === 'CANCELADA' ? 'NFS-e Cancelada' : 'NFS-e Gerada');
  campoGrande(105.1, 2, 'FINALIDADE', finalidade === '0' ? 'NFS-e regular' : '-');

  // QR code (consulta pública)
  const qr = QRCode.create(`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave}`, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const passo = 41 / n; // 45 pt no total, com 2 pt de margem branca como no modelo do portal
  pdf.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.modules.get(r, c)) pdf.rect(494 + c * passo, 46.8 + r * passo, passo + 0.05, passo + 0.05, 'F');
  valor('A autenticidade desta NFS-e pode ser verificada', X[3], 97.4, 6);
  valor('pela leitura deste código QR ou pela consulta da', X[3], 104.2, 6);
  valor('chave de acesso no portal nacional da NFS-e', X[3], 111, 6);

  // Prestador
  linhaH(125.6);
  cinza(8.5, 125.8, 144.6, 19.1);
  rotulo('PRESTADOR / FORNECEDOR', X[0], 132.4, 7);
  campo(125.8, 1, 'CNPJ / CPF / NIF', documento(txt(emit, 'CNPJ') || txt(emit, 'CPF')));
  campo(125.8, 2, 'Indicador Municipal (Inscrição)', ou(txt(prest, 'IM')));
  campo(125.8, 3, 'Telefone', telefone(txt(prest, 'fone') || txt(emit, 'fone')));
  campo(144.9, 0, 'Nome / Nome Empresarial', ou(txt(emit, 'xNome')), 140);
  campo(144.9, 2, 'Município / Sigla UF', cidadeUF(emitCidade, emitUF));
  campo(144.9, 3, 'Código IBGE / CEP', ibgeCep(emitCMun, txt(ender, 'CEP')));
  campo(164, 0, 'Endereço', enderecoPrest);
  campo(164, 2, 'E-mail', ou(txt(prest, 'email') || txt(emit, 'email')));
  campo(183.1, 0, 'Simples Nacional na Data de Competência', SIMPLES[txt(prest, 'regTrib', 'opSimpNac')] || '-', 140);
  campo(183.1, 1, 'Regime de Apuração Tributária pelo SN', REGIME_SN[txt(prest, 'regTrib', 'regApTribSN')] || '-');
  linhaH(202.4);

  // Tomador
  cinza(8.5, 202.6, 144.6, 19.1);
  rotulo('TOMADOR / ADQUIRENTE', X[0], 209.2, 7);
  campo(202.6, 1, 'CNPJ / CPF / NIF', documento(txt(toma, 'CNPJ') || txt(toma, 'CPF')));
  campo(202.6, 2, 'Indicador Municipal (Inscrição)', ou(txt(toma, 'IM')));
  campo(202.6, 3, 'Telefone', telefone(txt(toma, 'fone')));
  campo(221.7, 0, 'Nome / Nome Empresarial', ou(txt(toma, 'xNome')));
  campo(221.7, 2, 'Município / Sigla UF', tomaCidade);
  campo(221.7, 3, 'Código IBGE / CEP', ibgeCep(tomaCMun, txt(tomaNac, 'CEP')));
  campo(240.8, 0, 'Endereço', enderecoToma);
  campo(240.8, 2, 'E-mail', ou(txt(toma, 'email')));
  linhaH(260.1);
  const temInterm = Boolean(filho(dps, 'interm'));
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(0);
  pdf.text('DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', 297.6, 266.8, { align: 'center' });
  linhaH(268.5);
  pdf.text(temInterm ? 'INTERMEDIÁRIO DA OPERAÇÃO IDENTIFICADO NA DPS' : 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e', 297.6, 275.2, { align: 'center' });
  linhaH(276.9);

  // Serviço prestado
  cinza(8.5, 277.2, 144.6, 19.1);
  rotulo('SERVIÇO PRESTADO', X[0], 283.8, 7);
  const cTribMun = txt(dps, 'serv', 'cServ', 'cTribMun');
  campo(277.2, 1, 'Código de Tributação Nacional/Municipal', `${servico(txt(dps, 'serv', 'cServ', 'cTribNac'))} / ${ou(cTribMun)}`);
  campo(277.2, 2, 'Código da NBS', nbs(txt(dps, 'serv', 'cServ', 'cNBS')));
  campo(277.2, 3, 'Local da Prestação / Sigla UF / País', localPrestacao);
  valor(ou(txt(inf, 'xTribNac')), X[0], 302.7);
  rotulo('Descrição do Serviço', X[0], 314.1);
  const descricao = pdf.splitTextToSize(ou(txt(dps, 'serv', 'cServ', 'xDescServ')), 570) as string[];
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(0).text(descricao.slice(0, 2), X[0], 321.8);
  linhaH(327.8);

  // Tributação municipal
  cinza(8.5, 328, 144.6, 19.1);
  rotulo('TRIBUTAÇÃO MUNICIPAL (ISSQN)', X[0], 334.6, 7);
  campo(328, 1, 'Tipo de Tributação do ISSQN', TRIB_ISSQN[txt(tribMun, 'tribISSQN')] || '-');
  campo(328, 2, 'Município / Sigla UF / País de Incidência do ISSQN', localIncidencia);
  campo(347.4, 0, 'BC ISSQN', brl(txt(valNf, 'vBC')));
  campo(347.4, 1, 'Alíquota Aplicada', pct(txt(valNf, 'pAliqAplic') || txt(tribMun, 'pAliq')));
  campo(347.4, 2, 'Retenção do ISSQN', RET_ISSQN[txt(tribMun, 'tpRetISSQN')] || '-');
  campo(347.4, 3, 'ISSQN Apurado', brl(txt(valNf, 'vISSQN')));
  linhaH(366.4);

  // Tributação federal
  cinza(8.5, 366.7, 144.6, 19.1);
  rotulo('TRIBUTAÇÃO FEDERAL (EXCETO CBS)', X[0], 373.2, 7);
  campo(366.7, 1, 'IRRF', brl(vRetIRRF));
  campo(366.7, 2, 'Contribuição Previdenciária - Retida', brl(vRetCP));
  campo(366.7, 3, 'Contribuições Sociais - Retidas', brl(vRetCSLL));
  campo(385.8, 0, 'PIS - Débito Apuração Própria', brl(txt(pisCofins, 'vPis')));
  campo(385.8, 1, 'COFINS - Débito Apuração Própria', brl(txt(pisCofins, 'vCofins')));
  campo(385.8, 2, 'Descrição Contrib. Sociais - Retidas', RET_PIS_COFINS[tpRetPC] || '-');
  linhaH(405.1);

  // Tributação IBS/CBS: campos do modelo do portal; ficam com "-" quando a nota não informou o grupo.
  const ibsIncidCMun = txt(ibsNf, 'cLocalidadeIncid');
  const incidNome = txt(ibsNf, 'xLocalidadeIncid');
  const incidUF = ibsIncidCMun && ibsIncidCMun === emitCMun ? emitUF : '';
  const vIBSUF = txt(ibsNf, 'totCIBS', 'gIBS', 'gIBSUFTot', 'vIBSUF');
  const vIBSMun = txt(ibsNf, 'totCIBS', 'gIBS', 'gIBSMunTot', 'vIBSMun');
  const vIBSTot = txt(ibsNf, 'totCIBS', 'gIBS', 'vIBSTot');
  const vCBS = txt(ibsNf, 'totCIBS', 'gCBS', 'vCBS');
  const vTotNF = txt(ibsNf, 'totCIBS', 'vTotNF');
  const totalIbsCbs = vIBSTot || vCBS ? String((Number(vIBSTot || 0) + Number(vCBS || 0)).toFixed(2)) : '';
  const redUF = txt(ibsNf, 'valores', 'uf', 'pRedAliqUF');
  const redMun = txt(ibsNf, 'valores', 'mun', 'pRedAliqMun');
  const redCBS = txt(ibsNf, 'valores', 'fed', 'pRedAliqCBS');
  cinza(8.5, 405.3, 144.6, 19.1);
  rotulo('TRIBUTAÇÃO IBS/CBS', X[0], 411.9, 7);
  campo(405.3, 1, 'CST / cClassTrib', `${ou(txt(ibsClass, 'CST'))} / ${ou(txt(ibsClass, 'cClassTrib'))}`);
  campo(405.3, 2, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', `${ou(txt(ibsDps, 'cIndOp'))} / ${ou(ibsIncidCMun)} / ${ou(incidNome)} / ${ou(incidUF)}`);
  campo(424.4, 0, 'Exclusões e Reduções da Base de Cálculo', 'R$ 0,00');
  campo(424.4, 1, 'Base de Cálculo Após Exclusões e Reduções', brl(txt(ibsNf, 'valores', 'vBC')));
  campo(424.4, 2, 'Red. Alíquota IBS / Red. Alíquota CBS', `${pc(redUF)} / ${pc(redMun)} / ${pc(redCBS)}`);
  campo(424.4, 3, 'Alíquota - IBS UF / IBS Mun', `${pc(txt(ibsNf, 'valores', 'uf', 'pIBSUF'))} / ${pc(txt(ibsNf, 'valores', 'mun', 'pIBSMun'))}`);
  campo(443.5, 0, 'Alíq. Efetiva Municipal - IBS', pc(txt(ibsNf, 'valores', 'mun', 'pAliqEfetMun')));
  campo(443.5, 1, 'Valor Apurado Municipal - IBS', brl(vIBSMun));
  campo(443.5, 2, 'Alíq. Efetiva Estadual - IBS', pc(txt(ibsNf, 'valores', 'uf', 'pAliqEfetUF')));
  campo(443.5, 3, 'Valor Apurado Estadual - IBS', brl(vIBSUF));
  campo(462.6, 0, 'Valor Total Apurado - IBS', brl(vIBSTot));
  campo(462.6, 1, 'Alíquota - CBS', pc(txt(ibsNf, 'valores', 'fed', 'pCBS')));
  campo(462.6, 2, 'Alíquota Efetiva - CBS', pc(txt(ibsNf, 'valores', 'fed', 'pAliqEfetCBS')));
  campo(462.6, 3, 'Valor Total Apurado - CBS', brl(vCBS));
  linhaH(481.9);

  // Valor total
  cinza(8.5, 482.1, 144.6, 19.1);
  rotulo('VALOR TOTAL DA NFS-e', X[0], 488.7, 7);
  campo(482.1, 1, 'VALOR DA OPERAÇÃO / SERVIÇO', brl(vServ));
  campo(482.1, 2, 'Desconto Incondicionado', brl(txt(valDps, 'vDescCondIncond', 'vDescIncond')));
  campo(482.1, 3, 'Desconto Condicionado', brl(txt(valDps, 'vDescCondIncond', 'vDescCond')));
  cinza(442.2, 501.2, 144.6, 19.1);
  campo(501.2, 0, 'Total das Retenções (ISSQN / Federais)', brl(totRet));
  campo(501.2, 1, 'VALOR LÍQUIDO DA NFS-e', brl(vLiq));
  campo(501.2, 2, 'Total do IBS/CBS', totalIbsCbs ? brl(totalIbsCbs) : 'R$ 0,00');
  campo(501.2, 3, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS', brl(vTotNF || vLiq));
  linhaH(520.5);

  // Informações complementares
  rotulo('INFORMAÇÕES COMPLEMENTARES', X[0], 527.3, 7);
  const extras = [
    'Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: -; Estaduais: -; Municipais: -;',
    txt(infoCompl, 'xInfComp'),
    txt(infoCompl, 'docRef') && `Documento de referência: ${txt(infoCompl, 'docRef')}`,
    txt(infoCompl, 'idDocTec') && `Responsabilidade técnica: ${txt(infoCompl, 'idDocTec')}`
  ].filter(Boolean) as string[];
  let yi = 547.4;
  pdf.setFont('helvetica', 'normal').setFontSize(7).setTextColor(0);
  for (const e of extras) {
    const linhas = pdf.splitTextToSize(e, 570) as string[];
    pdf.text(linhas, X[0], yi);
    yi += linhas.length * 9;
  }

  // Rodapé (canhoto)
  pdf.setDrawColor(0).setLineWidth(1);
  pdf.rect(8.5, 795.8, 145.1, 20.6);
  pdf.rect(153.6, 795.8, 144.5, 20.6);
  pdf.rect(298.1, 795.8, 289.2, 20.6);
  rotulo('DATA CIENTIFICAÇÃO:', 12.9, 801.9);
  rotulo('IDENTIFICAÇÃO E ASSINATURA', 157.5, 801.9);
  rotulo('N° NFS-e / CHAVE NFS-e', 302, 801.9);
  valor(`${ou(txt(inf, 'nNFSe'))} / ${chave}`, 302, 809.7);

  return pdf.output('blob');
}
