/** Tira da descrição o número do contrato e o "(Parc. 1/1)" de parcela única, que não servem para quem lê. */
export function cleanTitleDescription(d?: string | null): string {
  if (!d) return '';
  return d
    .replace(/\s+-\s+Contrato\s+[A-Za-z]{2,5}-[A-Za-z0-9-]+/g, '')
    .replace(/\s*\((?:Parc\.\s*)?1\/1\)/g, '')
    .trim();
}
