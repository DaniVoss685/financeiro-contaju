export interface ReceiptPdfData {
  issuerName: string;
  issuerLegalName?: string;
  issuerCnpj?: string;
  issuerAddress?: string;
  receiptNumber: string;
  amountLabel: string; // ex.: R$ 233,50
  amountInWords: string;
  customerName: string;
  customerDocument?: string;
  description: string;
  competenceLabel: string;
  titleLabel: string;
  originLabel?: string;
  placeAndDate: string; // ex.: "Goiânia - GO, 16/11/2026" ou só a data
  paymentDateLabel: string;
  recordId: string;
}

/** Gera o recibo como PDF de verdade (A4), sem depender da impressão da tela. */
export async function downloadReceiptPdf(d: ReceiptPdfData): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 18;
  const CW = W - M * 2;
  let y = 22;

  const text = (t: string, x: number, yy: number, o: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'center' | 'right'; italic?: boolean } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : o.italic ? 'italic' : 'normal');
    doc.setFontSize(o.size ?? 10);
    const c = o.color ?? [30, 41, 59];
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(t, x, yy, { align: o.align ?? 'left' });
  };
  const wrap = (t: string, width: number, size: number, bold = false, italic = false) => {
    doc.setFont('helvetica', bold ? 'bold' : italic ? 'italic' : 'normal');
    doc.setFontSize(size);
    return doc.splitTextToSize(t, width) as string[];
  };

  // Cabeçalho da empresa
  text(d.issuerName.toUpperCase(), M, y, { size: 16, bold: true, color: [15, 23, 42] });
  y += 6;
  if (d.issuerLegalName) { text(d.issuerLegalName, M, y, { size: 9, color: [71, 85, 105] }); y += 4.5; }
  if (d.issuerCnpj) { text(`CNPJ: ${d.issuerCnpj}`, M, y, { size: 9, color: [71, 85, 105] }); y += 4.5; }
  if (d.issuerAddress) {
    for (const line of wrap(d.issuerAddress, CW * 0.62, 8.5)) { text(line, M, y, { size: 8.5, color: [100, 116, 139] }); y += 4; }
  }

  // Caixa com número e valor
  const boxW = 62, boxH = 22, boxX = W - M - boxW, boxY = 16;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');
  text('NÚMERO DO RECIBO', boxX + 4, boxY + 6, { size: 7, bold: true, color: [100, 116, 139] });
  text(d.receiptNumber, boxX + 4, boxY + 12, { size: 11, bold: true, color: [15, 23, 42] });
  text('Valor:', boxX + 4, boxY + 18, { size: 8, color: [100, 116, 139] });
  text(d.amountLabel, boxX + boxW - 4, boxY + 18, { size: 11, bold: true, color: [4, 120, 87], align: 'right' });

  y = Math.max(y, boxY + boxH) + 5;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 14;

  // Título
  text('RECIBO DE PAGAMENTO', W / 2, y, { size: 15, bold: true, align: 'center', color: [15, 23, 42] });
  y += 3;
  doc.setDrawColor(5, 150, 105);
  doc.setLineWidth(0.8);
  doc.line(W / 2 - 38, y, W / 2 + 38, y);
  y += 12;

  // Corpo
  const doc1 = d.customerDocument ? `, inscrito no CPF/CNPJ sob o nº ${d.customerDocument}` : '';
  const body = `Recebemos de ${d.customerName}${doc1}, a importância líquida e certa de ${d.amountLabel} (${d.amountInWords}).`;
  const bodyLines = wrap(body, CW - 12, 10.5);
  const refLines: string[] = [
    `• Serviço/Descrição: ${d.description}`,
    `• Competência: ${d.competenceLabel}`,
    `• Título / Parcela: ${d.titleLabel}`,
    ...(d.originLabel ? [`• Origem: ${d.originLabel}`] : [])
  ].flatMap(l => wrap(l, CW - 20, 9.5));
  const closing = wrap('Pelo que firmamos o presente recibo, dando plena, geral e irrevogável quitação do valor supramencionado exclusivamente referente ao título aqui especificado.', CW - 12, 8.5, false, true);

  const bodyH = 8 + bodyLines.length * 5.2 + 8 + 6 + refLines.length * 4.8 + 6 + closing.length * 4.4 + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, bodyH, 3, 3, 'FD');
  let by = y + 9;
  for (const l of bodyLines) { text(l, M + 6, by, { size: 10.5 }); by += 5.2; }
  by += 5;
  text('REFERENTE A:', M + 6, by, { size: 7.5, bold: true, color: [100, 116, 139] });
  by += 3;
  const refH = 4 + refLines.length * 4.8;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M + 6, by, CW - 12, refH, 2, 2, 'FD');
  let ry = by + 5.5;
  for (const l of refLines) { text(l, M + 10, ry, { size: 9.5 }); ry += 4.8; }
  by += refH + 6;
  for (const l of closing) { text(l, M + 6, by, { size: 8.5, italic: true, color: [71, 85, 105] }); by += 4.4; }
  y += bodyH + 22;

  // Data e assinatura
  text(d.placeAndDate, M, y, { size: 10, bold: true });
  text(`Data do Pagamento: ${d.paymentDateLabel}`, M, y + 5, { size: 8.5, color: [100, 116, 139] });
  const sigW = 78, sigX = W - M - sigW;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(0.5);
  doc.line(sigX, y + 2, sigX + sigW, y + 2);
  text(d.issuerName, sigX + sigW / 2, y + 7, { size: 10, bold: true, align: 'center' });
  if (d.issuerCnpj) text(`CNPJ: ${d.issuerCnpj}`, sigX + sigW / 2, y + 12, { size: 8, color: [100, 116, 139], align: 'center' });

  // Rodapé
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(M, 280, W - M, 280);
  text('Sistema Financeiro Contaju • Documento emitido eletronicamente', M, 285, { size: 7.5, color: [100, 116, 139] });
  text(`ID: ${d.recordId}`, W - M, 285, { size: 7, color: [100, 116, 139], align: 'right' });

  const safe = d.receiptNumber.replace(/[^A-Za-z0-9_-]/g, '');
  doc.save(`Recibo-${safe || 'pagamento'}.pdf`);
}
