/**
 * Exportação em lote das notas fiscais: um .zip com os PDFs (pasta PDF), os XMLs (pasta XML) e um
 * índice em planilha (indice.csv) para a contabilidade conferir.
 */

export type FormatoExport = 'PDF' | 'XML';

export interface NotaParaExportar {
  id: string;
  numero_nfse: string | null;
  numero_dps: number;
  chave_acesso: string | null;
  status: string;
  tomador_nome: string;
  tomador_documento: string;
  valor_servico: number;
  competencia: string;
  ambiente: number;
}

export interface ResultadoExportacao {
  blob: Blob;
  nomeArquivo: string;
  incluidas: number;
  /** Notas que não puderam entrar (com o motivo, em português). */
  falhas: { numero: string; motivo: string }[];
  /** Notas da lista que nem tentamos (recusadas, em processamento) */
  fora: number;
}

interface Opcoes {
  notas: NotaParaExportar[];
  formatos: FormatoExport[];
  /** Ex.: "Novembro de 2026". Vai no nome do arquivo. */
  titulo: string;
  obterXmls: (ids: string[]) => Promise<{ id: string; xml: string }[]>;
  gerarPdf: (xml: string, situacao: 'GERADA' | 'CANCELADA') => Promise<Blob>;
  onProgresso?: (feito: number, total: number) => void;
  /** Retorna true quando a pessoa pediu para cancelar. */
  cancelado?: () => boolean;
}

const LOTE = 40;

const limparNome = (t: string) => t.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
const csv = (v: string | number) => {
  const s = String(v ?? '');
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dataBR = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const doc = (d: string) => {
  const x = (d || '').replace(/\D/g, '');
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d || '';
};

export async function montarZip(o: Opcoes): Promise<ResultadoExportacao> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const pdfs = zip.folder('PDF')!;
  const xmls = zip.folder('XML')!;

  const elegiveis = o.notas.filter(n => (n.status === 'AUTORIZADA' || n.status === 'CANCELADA') && n.chave_acesso);
  const fora = o.notas.length - elegiveis.length;
  const falhas: { numero: string; motivo: string }[] = [];
  const nomesUsados = new Set<string>();
  const linhas: string[][] = [];
  let feitos = 0;
  o.onProgresso?.(0, elegiveis.length);

  for (let i = 0; i < elegiveis.length; i += LOTE) {
    if (o.cancelado?.()) throw new Error('CANCELADO');
    const grupo = elegiveis.slice(i, i + LOTE);
    let xmlsDoLote: Map<string, string>;
    try {
      xmlsDoLote = new Map((await o.obterXmls(grupo.map(n => n.id))).map(x => [x.id, x.xml]));
    } catch (e) {
      for (const n of grupo) falhas.push({ numero: n.numero_nfse || `envio ${n.numero_dps}`, motivo: e instanceof Error ? e.message : 'Não foi possível buscar o XML.' });
      feitos += grupo.length;
      o.onProgresso?.(feitos, elegiveis.length);
      continue;
    }

    for (const n of grupo) {
      if (o.cancelado?.()) throw new Error('CANCELADO');
      const numero = n.numero_nfse || `envio ${n.numero_dps}`;
      const xml = xmlsDoLote.get(n.id);
      if (!xml) {
        falhas.push({ numero, motivo: 'A nota não tem XML guardado.' });
      } else {
        let base = limparNome(`NFS-e ${numero}${n.status === 'CANCELADA' ? ' (cancelada)' : ''}`);
        for (let k = 2; nomesUsados.has(base); k++) base = limparNome(`NFS-e ${numero} (${k})`);
        nomesUsados.add(base);
        let temPdf = false;
        let temXml = false;
        if (o.formatos.includes('XML')) {
          xmls.file(`${base}.xml`, xml);
          temXml = true;
        }
        if (o.formatos.includes('PDF')) {
          try {
            pdfs.file(`${base}.pdf`, await (await o.gerarPdf(xml, n.status === 'CANCELADA' ? 'CANCELADA' : 'GERADA')).arrayBuffer());
            temPdf = true;
          } catch (e) {
            falhas.push({ numero, motivo: `Não foi possível gerar o PDF${e instanceof Error && e.message ? ` (${e.message})` : ''}.` });
          }
        }
        linhas.push([
          numero,
          dataBR(n.competencia),
          n.tomador_nome,
          doc(n.tomador_documento),
          Number(n.valor_servico).toFixed(2).replace('.', ','),
          n.status === 'CANCELADA' ? 'Cancelada' : 'Emitida',
          n.ambiente === 1 ? 'Produção' : 'Testes',
          n.chave_acesso || '',
          temPdf ? `PDF/${base}.pdf` : '',
          temXml ? `XML/${base}.xml` : ''
        ]);
      }
      feitos++;
      o.onProgresso?.(feitos, elegiveis.length);
      // Deixa a tela respirar entre uma nota e outra (gerar PDF é trabalho pesado).
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const cabecalho = ['Número da nota', 'Data do serviço', 'Cliente', 'CPF/CNPJ', 'Valor (R$)', 'Situação', 'Ambiente', 'Chave de acesso', 'Arquivo PDF', 'Arquivo XML'];
  const texto = [cabecalho, ...linhas].map(l => l.map(csv).join(';')).join('\r\n');
  zip.file('indice.csv', `﻿${texto}\r\n`);

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const blob = new Blob([bytes], { type: 'application/zip' });
  const qual = o.formatos.length === 2 ? 'PDF e XML' : o.formatos[0] === 'PDF' ? 'PDF' : 'XML';
  return {
    blob,
    nomeArquivo: limparNome(`Notas fiscais ${qual} - ${o.titulo}.zip`),
    incluidas: linhas.length,
    falhas,
    fora
  };
}
