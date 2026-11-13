// Gera src/data/nfseCatalogo.ts a partir do Anexo B oficial (lista de serviços nacionais + NBS).
//   node scripts/gen-nfse-catalogo.mjs
// Para atualizar: troque o .xlsx em docs/nfse/ pela versão nova do Portal Nacional e rode de novo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arq = path.join(raiz, 'docs', 'nfse', 'AnexoB-ListasServNac_NBS-SNNFSe_v1.00.02.xlsx');
const wb = XLSX.readFile(arq);

const serv = XLSX.utils.sheet_to_json(wb.Sheets['LISTA.SERV.NAC.'], { header: 1, defval: '' })
  .filter(r => typeof r[0] === 'number')
  .map(r => [String(r[0]).padStart(6, '0'), String(r[4]).replace(/\s+/g, ' ').trim()]);
const nbs = XLSX.utils.sheet_to_json(wb.Sheets['LISTA.NBS_v2.0'], { header: 1, defval: '' })
  .filter(r => typeof r[0] === 'string' && /^\d\.\d{4}\.\d{2}\.\d{2}$/.test(r[0]))
  .map(r => [r[0].replace(/\./g, ''), String(r[1]).replace(/\s+/g, ' ').trim()]);

const saida = `// ARQUIVO GERADO por scripts/gen-nfse-catalogo.mjs — não edite à mão.
// Fonte: Anexo B (Listas de Serviço Nacional e NBS), Portal Nacional da NFS-e, v1.00.02.
/** [código de tributação nacional (6 dígitos), descrição] */
export const SERVICOS_NACIONAIS: [string, string][] = ${JSON.stringify(serv)};
/** [código NBS (9 dígitos), descrição] — só os itens que podem ser informados na nota */
export const NBS_FOLHAS: [string, string][] = ${JSON.stringify(nbs)};
`;
fs.mkdirSync(path.join(raiz, 'src', 'data'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'src', 'data', 'nfseCatalogo.ts'), saida);
console.log(`${serv.length} serviços nacionais e ${nbs.length} códigos NBS gravados.`);
