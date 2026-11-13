// Gera src/data/nfseIbsCbs.ts (listas do IBS/CBS usadas na emissão da NFS-e).
//   node scripts/gen-nfse-ibscbs.mjs
// Fontes (em docs/nfse/ibs):
//   - AnexoI-DPS_NFSe-*.xlsx (aba CÓDIGO_INDICADOR_OPERAÇÃO): indicador de operação (cIndOp), anexo oficial do Portal Nacional da NFS-e;
//   - classificacao-tributaria.json: CST e cClassTrib (Informe Técnico 2025.002). CONFERIR com a planilha oficial.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(raiz, 'docs', 'nfse', 'ibs');
const limpar = t => String(t ?? '').replace(/\s+/g, ' ').trim();

// ---- cIndOp (Anexo I, aba CÓDIGO_INDICADOR_OPERAÇÃO: lista completa de códigos de indicador de operação)
const wb = XLSX.readFile(path.join(dir, 'AnexoI-DPS_NFSe-PRODREST-v1.01-20261020.xlsx'));
const linhas = XLSX.utils.sheet_to_json(wb.Sheets['CÓDIGO_INDICADOR_OPERAÇÃO'], { header: 1, defval: '' });
const indOp = linhas
  .filter(l => /^\d{6}$/.test(limpar(l[4])))
  .map(l => [limpar(l[4]), limpar(l[5]), limpar(l[6])]);

// ---- CST e cClassTrib
const j = JSON.parse(fs.readFileSync(path.join(dir, 'classificacao-tributaria.json'), 'utf8'));
const cst = j.cst.map(([c, n]) => [c, n]);
// Só as classificações habilitadas para a NFS-e (modelo "NFS-e" da planilha oficial).
const classificacao = j.classificacao
  .filter(r => r.modelos.split(',').map(x => x.trim()).includes('NFS-e'))
  .map(r => [r.cClassTrib, r.descricao, r.cst, r.redIBS, r.redCBS]);

const saida = `// ARQUIVO GERADO por scripts/gen-nfse-ibscbs.mjs — não edite à mão.
// ${j.fonte}
/** [código de situação tributária (CST, 3 dígitos), nome] */
export const CST_IBS_CBS: [string, string][] = ${JSON.stringify(cst)};
/** [cClassTrib (6 dígitos), descrição, CST a que pertence, redução IBS, redução CBS] — só as habilitadas para NFS-e */
export const CLASSIFICACAO_TRIBUTARIA: [string, string, string, string, string][] = ${JSON.stringify(classificacao)};
/** [cIndOp (6 dígitos), tipo de operação, local do fornecimento] (Anexo I do Portal Nacional da NFS-e) */
export const INDICADOR_OPERACAO: [string, string, string][] = ${JSON.stringify(indOp)};
`;
fs.writeFileSync(path.join(raiz, 'src', 'data', 'nfseIbsCbs.ts'), saida);
// Cópia para o servidor (a API não importa arquivos TypeScript do front).
const saidaJs = `// ARQUIVO GERADO por scripts/gen-nfse-ibscbs.mjs — não edite à mão.
// ${j.fonte}
export const CST_IBS_CBS = ${JSON.stringify(cst)};
export const CLASSIFICACAO_TRIBUTARIA = ${JSON.stringify(classificacao)};
export const INDICADOR_OPERACAO = ${JSON.stringify(indOp)};
`;
fs.writeFileSync(path.join(raiz, 'api', '_nfse', 'ibscbsTabelas.js'), saidaJs);
console.log(`${cst.length} CST, ${classificacao.length} classificações (NFS-e) e ${indOp.length} indicadores de operação gravados.`);
