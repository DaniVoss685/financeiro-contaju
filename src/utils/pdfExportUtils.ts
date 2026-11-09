import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DREMatrix, CashFlowLineItem } from '../services/reportingEngine';
import { formatBRL } from '../services/financialEngine';
import { storage } from '../services/storageService';
import { PeriodClosure, CompanyProfile } from '../types';

/**
 * Utilitários de Exportação em PDF de alta qualidade para Contadores e Apresentações Externas.
 */

interface PDFExportOptions {
  orientation?: 'p' | 'portrait' | 'l' | 'landscape';
  title: string;
  subtitle?: string;
  periodLabel: string;
}

export interface DREExportOptions {
  companyName?: string;
  theme?: 'light' | 'dark' | 'auto';
  timeHorizonLabel?: string;
  activeMonthIndices?: number[];
  totalColLabel?: string;
}

export function exportDREToPDF(
  dreData: DREMatrix, 
  year: number, 
  optionsOrCompanyName?: string | DREExportOptions
) {
  const company = storage.getCompany();
  const currentTheme = storage.getTheme();
  
  const opts: DREExportOptions = typeof optionsOrCompanyName === 'string'
    ? { companyName: optionsOrCompanyName, theme: 'auto' }
    : (optionsOrCompanyName || { theme: 'auto' });

  const companyName = opts.companyName || company.companyName || company.tradeName || 'Contaju Gestão Financeira';
  const isDark = (opts.theme === 'dark') || (opts.theme !== 'light' && currentTheme === 'dark');

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const nowStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Cabeçalho Executivo Contábil com variáveis do tema
  if (isDark) {
    doc.setFillColor(11, 14, 20); // --bg-app dark
    doc.rect(0, 0, 297, 24, 'F');
    doc.setFillColor(212, 175, 55); // --brand-gold
    doc.rect(0, 24, 297, 1.5, 'F');
  } else {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 297, 24, 'F');
    doc.setFillColor(180, 83, 9); // amber-700
    doc.rect(0, 24, 297, 1.5, 'F');
  }

  // Título e dados da empresa
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CONTAJU • DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO (DRE GERENCIAL)', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Empresa: ${companyName} • CNPJ: ${company.cnpj || '00.000.000/0001-00'} • Regime: Competência`, 14, 18);
  const horizonText = opts.timeHorizonLabel ? ` • ${opts.timeHorizonLabel}` : '';
  doc.text(`Exercício: ${year}${horizonText} • Emissão: ${nowStr}`, 200, 18);

  const activeIndices = opts.activeMonthIndices && opts.activeMonthIndices.length > 0
    ? opts.activeMonthIndices
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const visibleMonths = activeIndices.map(i => dreData.months[i]);
  const totalColName = opts.totalColLabel || 'Total Exercício';

  // Montagem da tabela com meses
  const headers = ['Estrutura', 'Descrição das Contas', ...visibleMonths, totalColName, '% AV'];
  const grossRevenue = dreData.lines[0]?.totalYear || 1;

  const tableBody: any[] = [];

  dreData.lines.forEach(line => {
    const isHeaderGroup = (line.level === 0) || (Boolean(line.code) && !line.code!.includes('.'));
    const isSubtotal = line.name.includes('(=)') || line.name.includes('LUCRO') || line.name.includes('RESULTADO');
    const av = grossRevenue > 0 ? (line.totalYear / grossRevenue) * 100 : 0;

    const row = [
      line.code || '-',
      line.name,
      ...activeIndices.map(i => formatBRL(line.valuesByMonth[i] || 0)),
      formatBRL(line.totalYear),
      `${(av ?? 0).toFixed(1)}%`
    ];

    tableBody.push({
      data: row,
      isHeaderGroup,
      isSubtotal
    });
  });

  // Linha de Resultado Líquido Final
  const netAV = grossRevenue > 0 ? (dreData.totalNetResult / grossRevenue) * 100 : 0;
  tableBody.push({
    data: [
      '9',
      '(=) RESULTADO LÍQUIDO DO EXERCÍCIO',
      ...activeIndices.map(i => formatBRL(dreData.netResults[i] || 0)),
      formatBRL(dreData.totalNetResult),
      `${netAV.toFixed(1)}%`
    ],
    isHeaderGroup: false,
    isSubtotal: true,
    isNetResult: true
  });

  // Larguras dinâmicas conforme quantidade de colunas de meses
  const colCount = visibleMonths.length;
  const usableWidth = 277;
  const col0Width = 16;
  const colTotalWidth = 26;
  const colAvWidth = 14;
  const col1Width = colCount <= 3 ? 95 : (colCount <= 6 ? 70 : 54);
  const remainingMonthWidth = usableWidth - col0Width - col1Width - colTotalWidth - colAvWidth;
  const monthCellWidth = Number((remainingMonthWidth / colCount).toFixed(2));

  const dynamicColStyles: Record<number, any> = {
    0: { cellWidth: col0Width, halign: 'center' },
    1: { cellWidth: col1Width, halign: 'left' }
  };
  for (let c = 2; c < 2 + colCount; c++) {
    dynamicColStyles[c] = { cellWidth: monthCellWidth, halign: 'right' };
  }
  dynamicColStyles[2 + colCount] = { cellWidth: colTotalWidth, halign: 'right', fontStyle: 'bold' };
  dynamicColStyles[2 + colCount + 1] = { cellWidth: colAvWidth, halign: 'center' };

  autoTable(doc, {
    head: [headers],
    body: tableBody.map(b => b.data),
    startY: 28,
    theme: 'grid',
    styles: {
      fontSize: colCount <= 6 ? 7.5 : 6.5,
      cellPadding: colCount <= 6 ? 2 : 1.5,
      textColor: isDark ? [248, 250, 252] : [15, 23, 42],
      font: 'helvetica'
    },
    headStyles: {
      fillColor: isDark ? [25, 32, 45] : [241, 245, 249],
      textColor: isDark ? [248, 250, 252] : [15, 23, 42],
      fontStyle: 'bold',
      fontSize: colCount <= 6 ? 8 : 7,
      halign: 'center',
      lineColor: isDark ? [36, 45, 61] : [203, 213, 225],
      lineWidth: 0.2
    },
    columnStyles: dynamicColStyles,
    didParseCell: function(data) {
      const rowMeta = tableBody[data.row.index];
      if (rowMeta) {
        if (rowMeta.isNetResult) {
          data.cell.styles.fillColor = isDark ? [22, 30, 46] : [226, 232, 240];
          data.cell.styles.textColor = dreData.totalNetResult >= 0 
            ? (isDark ? [52, 211, 153] : [4, 120, 87]) 
            : (isDark ? [248, 113, 113] : [185, 28, 28]);
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isSubtotal) {
          data.cell.styles.fillColor = isDark ? [28, 36, 50] : [241, 245, 249];
          data.cell.styles.textColor = isDark ? [255, 255, 255] : [15, 23, 42];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isHeaderGroup) {
          data.cell.styles.fillColor = isDark ? [20, 26, 38] : [248, 250, 252];
          data.cell.styles.textColor = isDark ? [212, 175, 55] : [15, 23, 42];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.fillColor = isDark ? [14, 18, 26] : [255, 255, 255];
        }
      }

      if (data.section === 'body' && data.column.index >= 2 && data.column.index <= 2 + colCount) {
        data.cell.styles.halign = 'right';
      }
    },
    margin: { left: 10, right: 10, bottom: 22 }
  });

  // Bloco de Assinaturas e Rodapé
  const pageHeight = doc.internal.pageSize.height;
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);

  const lineY = pageHeight - 16;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(30, lineY, 110, lineY);
  doc.line(187, lineY, 267, lineY);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isDark ? 226 : 51, isDark ? 232 : 65, isDark ? 240 : 85);
  doc.text('Contador Responsável (CRC/UF)', 70, lineY + 4, { align: 'center' });
  doc.text('Diretoria Financeira / Administração', 227, lineY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Relatório contábil emitido pelo Contaju Gestão Financeira • Página 1 de 1`, 148.5, pageHeight - 4, { align: 'center' });

  doc.save(`Contaju-DRE-Gerencial-${year}.pdf`);
}

export interface CashFlowExportOptions {
  companyName?: string;
  mode?: string;
  theme?: 'light' | 'dark' | 'auto';
  timeHorizonLabel?: string;
  activeMonthIndices?: number[];
  totalColLabel?: string;
}

export function exportCashFlowToPDF(
  cashData: {
    months: string[];
    lines: any[];
    netVariationByMonth?: number[];
    finalBalances?: number[];
  },
  year: number,
  modeOrOptions?: string | CashFlowExportOptions,
  companyNameParam?: string
) {
  const company = storage.getCompany();
  const currentTheme = storage.getTheme();

  const opts: CashFlowExportOptions = typeof modeOrOptions === 'string'
    ? { mode: modeOrOptions, companyName: companyNameParam, theme: 'auto' }
    : (modeOrOptions || { theme: 'auto' });

  const mode = opts.mode || 'CONSOLIDADO';
  const companyName = opts.companyName || company.companyName || company.tradeName || 'Contaju Gestão Financeira';
  const isDark = (opts.theme === 'dark') || (opts.theme !== 'light' && currentTheme === 'dark');

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const nowStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Cabeçalho Executivo Contábil
  if (isDark) {
    doc.setFillColor(11, 14, 20); // slate-950
    doc.rect(0, 0, 297, 24, 'F');
    doc.setFillColor(16, 185, 129); // emerald-500
    doc.rect(0, 24, 297, 1.5, 'F');
  } else {
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 297, 24, 'F');
    doc.setFillColor(4, 120, 87); // emerald-700
    doc.rect(0, 24, 297, 1.5, 'F');
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CONTAJU • DEMONSTRAÇÃO DO FLUXO DE CAIXA DIRETO (DFC)', 14, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Empresa: ${companyName} • CNPJ: ${company.cnpj || '00.000.000/0001-00'} • Regime: Caixa (${mode})`, 14, 18);
  const horizonText = opts.timeHorizonLabel ? ` • ${opts.timeHorizonLabel}` : '';
  doc.text(`Exercício: ${year}${horizonText} • Emissão: ${nowStr}`, 200, 18);

  const activeIndices = opts.activeMonthIndices && opts.activeMonthIndices.length > 0
    ? opts.activeMonthIndices
    : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  const visibleMonths = activeIndices.map(i => cashData.months[i]);
  const totalColName = opts.totalColLabel || 'Total Período';

  const headers = ['Ref', 'Movimentação / Atividade', ...visibleMonths, totalColName];

  const rows = cashData.lines.map(line => {
    const isInitialBalance = line.id === 'cf-initial';
    const isFinalBalance = line.id === 'cf-final';
    let totalCol = 0;

    if (isInitialBalance) {
      totalCol = line.valuesByMonth[activeIndices[0]] || 0;
    } else if (isFinalBalance) {
      totalCol = line.valuesByMonth[activeIndices[activeIndices.length - 1]] || 0;
    } else {
      totalCol = activeIndices.reduce((acc, idx) => acc + (line.valuesByMonth[idx] || 0), 0);
    }

    const isCashBeforeProfit = line.id === 'cf-cash-before-profit';
    const isProfitDistribution = line.id === 'cf-profit-distribution' || line.id === 'cf-fin-out-profit';
    const isRealActivitiesOutflows = line.id === 'cf-real-activities-outflows';

    return {
      id: line.id,
      code: line.code || line.id || '-',
      name: line.name,
      type: line.type,
      values: [
        line.code || line.id || '-',
        line.name,
        ...activeIndices.map(idx => line.isHeader ? '-' : formatBRL(line.valuesByMonth[idx] || 0)),
        line.isHeader ? '-' : formatBRL(totalCol)
      ],
      isInitialBalance,
      isFinalBalance,
      isNetVariation: line.id === 'cf-net-variation' || line.id === 'cf-op-net' || line.id === 'cf-inv-net' || line.id === 'cf-fin-net',
      isCashBeforeProfit,
      isProfitDistribution,
      isRealActivitiesOutflows,
      isHeader: line.isHeader,
      isSummary: line.isSummary,
      totalAmount: totalCol
    };
  });

  const colCount = visibleMonths.length;
  const usableWidth = 277;
  const col0Width = 18;
  const colTotalWidth = 28;
  const col1Width = colCount <= 3 ? 100 : (colCount <= 6 ? 78 : 58);
  const remainingMonthWidth = usableWidth - col0Width - col1Width - colTotalWidth;
  const monthCellWidth = Number((remainingMonthWidth / colCount).toFixed(2));

  const dynamicColStyles: Record<number, any> = {
    0: { cellWidth: col0Width, halign: 'center' },
    1: { cellWidth: col1Width, halign: 'left' }
  };
  for (let c = 2; c < 2 + colCount; c++) {
    dynamicColStyles[c] = { cellWidth: monthCellWidth, halign: 'right' };
  }
  dynamicColStyles[2 + colCount] = { cellWidth: colTotalWidth, halign: 'right', fontStyle: 'bold' };

  autoTable(doc, {
    head: [headers],
    body: rows.map(r => r.values),
    startY: 28,
    theme: 'grid',
    styles: {
      fontSize: colCount <= 6 ? 7.5 : 6.5,
      cellPadding: colCount <= 6 ? 2 : 1.6,
      textColor: isDark ? [248, 250, 252] : [15, 23, 42],
      font: 'helvetica'
    },
    headStyles: {
      fillColor: isDark ? [25, 32, 45] : [241, 245, 249],
      textColor: isDark ? [248, 250, 252] : [15, 23, 42],
      fontStyle: 'bold',
      fontSize: colCount <= 6 ? 8 : 7,
      halign: 'center',
      lineColor: isDark ? [36, 45, 61] : [203, 213, 225],
      lineWidth: 0.2
    },
    columnStyles: dynamicColStyles,
    didParseCell: function(data) {
      const rowMeta = rows[data.row.index];
      if (rowMeta) {
        if (rowMeta.isFinalBalance) {
          data.cell.styles.fillColor = isDark ? [16, 36, 30] : [209, 250, 229];
          data.cell.styles.textColor = rowMeta.totalAmount >= 0
            ? (isDark ? [52, 211, 153] : [6, 78, 59])
            : (isDark ? [248, 113, 113] : [185, 28, 28]);
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isCashBeforeProfit) {
          data.cell.styles.fillColor = isDark ? [16, 40, 32] : [209, 250, 229];
          data.cell.styles.textColor = rowMeta.totalAmount >= 0
            ? (isDark ? [52, 211, 153] : [6, 78, 59])
            : (isDark ? [248, 113, 113] : [185, 28, 28]);
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isProfitDistribution) {
          data.cell.styles.fillColor = isDark ? [35, 20, 48] : [243, 232, 255];
          data.cell.styles.textColor = isDark ? [216, 180, 254] : [107, 33, 168];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isRealActivitiesOutflows) {
          data.cell.styles.fillColor = isDark ? [38, 28, 16] : [254, 243, 199];
          data.cell.styles.textColor = isDark ? [251, 191, 36] : [146, 64, 14];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isNetVariation) {
          data.cell.styles.fillColor = isDark ? [24, 28, 48] : [238, 242, 255];
          data.cell.styles.textColor = isDark ? [199, 210, 254] : [30, 27, 75];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isInitialBalance) {
          data.cell.styles.fillColor = isDark ? [25, 32, 45] : [241, 245, 249];
          data.cell.styles.textColor = isDark ? [248, 250, 252] : [15, 23, 42];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isHeader) {
          data.cell.styles.fillColor = isDark ? [20, 26, 38] : [248, 250, 252];
          data.cell.styles.textColor = isDark ? [212, 175, 55] : [15, 23, 42];
          data.cell.styles.fontStyle = 'bold';
        } else if (rowMeta.isSummary) {
          data.cell.styles.fillColor = isDark ? [25, 32, 45] : [241, 245, 249];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.fillColor = isDark ? [14, 18, 26] : [255, 255, 255];
        }
      }

      if (data.section === 'body' && data.column.index >= 2) {
        data.cell.styles.halign = 'right';
      }
    },
    margin: { left: 10, right: 10, bottom: 22 }
  });

  const pageHeight = doc.internal.pageSize.height;
  const lineY = pageHeight - 16;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(30, lineY, 110, lineY);
  doc.line(187, lineY, 267, lineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(isDark ? 226 : 51, isDark ? 232 : 65, isDark ? 240 : 85);
  doc.text('Tesoureiro / Responsável Financeiro', 70, lineY + 4, { align: 'center' });
  doc.text('Diretoria Financeira / CFO', 227, lineY + 4, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Demonstração de Fluxo de Caixa emitida via Contaju • Página 1 de 1`, 148.5, pageHeight - 4, { align: 'center' });

  doc.save(`Contaju-Fluxo-Caixa-${year}-${mode}.pdf`);
}

/**
 * EXPORTAÇÃO EXECUTIVA ONE-PAGER (Sugestão 5)
 * Gera um PDF executivo em folha única (A4 Paisagem) com KPIs, DRE Sintética e Diagnóstico de Riscos.
 */
export function exportOnePageDRESummaryPDF(
  dreData: DREMatrix,
  year: number,
  companyName?: string,
  reconciliationData?: any,
  kpis?: {
    grossRev: number;
    netRev: number;
    costs: number;
    grossProfit: number;
    opExpenses: number;
    opResult: number;
    finResult: number;
    netResult: number;
  }
) {
  const company = storage.getCompany();
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const nowStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // 1. Cabeçalho Executivo Noturno com Faixa Dourada
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 297, 22, 'F');

  doc.setFillColor(245, 158, 11); // amber-500
  doc.rect(0, 22, 297, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('CONTAJU • SUMÁRIO EXECUTIVO GERENCIAL DO DRE (ONE-PAGER)', 14, 10);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(`Empresa: ${companyName || company.companyName || company.tradeName || 'Contaju Gestão'} • CNPJ: ${company.cnpj || '00.000.000/0001-00'} • Exercício: ${year}`, 14, 17);
  doc.text(`Emissão: ${nowStr} • Relatório Sintético para Diretoria & Conselho`, 200, 17);

  // 2. Quatro Cards de Destaque Executivo (Y: 28 to 48)
  const cardY = 27;
  const cardW = 64;
  const cardH = 20;
  const gap = 6;
  const startX = 14;

  const grossRev = kpis?.grossRev || dreData.lines[0]?.totalYear || 1;
  const netRev = kpis?.netRev || dreData.lines[2]?.totalYear || grossRev;
  const grossProfit = kpis?.grossProfit || (netRev - (kpis?.costs || 0));
  const opResult = kpis?.opResult || (grossProfit - (kpis?.opExpenses || 0));
  const netResult = kpis?.netResult || dreData.totalNetResult;

  const grossMargin = netRev > 0 ? (grossProfit / netRev) * 100 : 0;
  const opMargin = netRev > 0 ? (opResult / netRev) * 100 : 0;
  const netMargin = netRev > 0 ? (netResult / netRev) * 100 : 0;

  const executiveCards = [
    { title: 'RECEITA LÍQUIDA', value: formatBRL(netRev), subtitle: `100% da Base Operacional`, bg: [248, 250, 252], border: [203, 213, 225] },
    { title: 'LUCRO BRUTO', value: formatBRL(grossProfit), subtitle: `Margem Bruta: ${grossMargin.toFixed(1)}%`, bg: [254, 243, 199], border: [245, 158, 11] },
    { title: 'EBITDA OPERACIONAL', value: formatBRL(opResult), subtitle: `Margem EBITDA: ${opMargin.toFixed(1)}%`, bg: [248, 250, 252], border: [203, 213, 225] },
    { title: 'RESULTADO LÍQUIDO', value: formatBRL(netResult), subtitle: `Margem Líquida: ${netMargin.toFixed(1)}%`, bg: netResult >= 0 ? [236, 253, 245] : [254, 242, 242], border: netResult >= 0 ? [16, 185, 129] : [239, 68, 68] }
  ];

  executiveCards.forEach((c, idx) => {
    const x = startX + idx * (cardW + gap);
    doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
    doc.setDrawColor(c.border[0], c.border[1], c.border[2]);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(c.title, x + 4, cardY + 5.5);

    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(c.value, x + 4, cardY + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(c.subtitle, x + 4, cardY + 17);
  });

  // 3. Tabela DRE Sintética Compacta de 8 Linhas (Lado Esquerdo: X 14, Largura: 175mm)
  const syntheticLines = dreData.lines.filter(l => l.level === 0 || l.isSummary);
  const tableData = syntheticLines.map(l => {
    const av = grossRev > 0 ? (l.totalYear / grossRev) * 100 : 0;
    return [
      l.code || '-',
      l.name,
      formatBRL(l.totalYear),
      `${av.toFixed(1)}%`
    ];
  });

  // Adiciona a linha final de resultado líquido
  const finalNetAV = grossRev > 0 ? (netResult / grossRev) * 100 : 0;
  tableData.push([
    '9',
    '(=) RESULTADO LÍQUIDO DO EXERCÍCIO',
    formatBRL(netResult),
    `${finalNetAV.toFixed(1)}%`
  ]);

  autoTable(doc, {
    startY: 51,
    margin: { left: 14, right: 110 },
    tableWidth: 172,
    head: [['Código', 'Estrutura DRE Sintética', 'Exercício (R$)', '% AV']],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 1.8,
      font: 'helvetica'
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left'
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 90 },
      2: { cellWidth: 42, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'right' }
    },
    didParseCell: (data) => {
      const row = data.row.raw as string[];
      if (row && row[1]) {
        const isSumm = row[1].includes('(=)') || row[1].includes('LUCRO') || row[1].includes('RESULTADO');
        if (isSumm) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
        if (row[0] === '9') {
          data.cell.styles.fillColor = [254, 243, 199];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  // 4. Painel Lateral Direito: Diagnósticos de Eficiência e Riscos (X 192, Largura: 91mm)
  const sideX = 192;
  const sideW = 91;

  // Bloco 4A: Realização Caixa vs Competência
  const box1Y = 51;
  const box1H = 55;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(sideX, box1Y, sideW, box1H, 2, 2, 'FD');

  doc.setFillColor(30, 41, 59);
  doc.rect(sideX, box1Y, sideW, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('CONCILIAÇÃO CAIXA X COMPETÊNCIA', sideX + 4, box1Y + 5);

  if (reconciliationData) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    
    doc.text(`• Realização de Receitas: ${reconciliationData.overallRevenueRealizationRate}% liquidadas`, sideX + 4, box1Y + 13);
    doc.text(`• Vendas Pendentes de Recebimento: ${formatBRL(reconciliationData.totalPendingRevenue)}`, sideX + 4, box1Y + 19);
    doc.text(`• Realização de Despesas: ${reconciliationData.overallExpenseRealizationRate}% quitadas`, sideX + 4, box1Y + 25);
    doc.text(`• Geração Operacional de Caixa: ${formatBRL(reconciliationData.netOperatingCashGenerated)}`, sideX + 4, box1Y + 31);
    doc.text(`• Gap Caixa vs Lucro: ${formatBRL(reconciliationData.cashGap)}`, sideX + 4, box1Y + 37);

    // Diagnóstico
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    const riskColor = reconciliationData.riskLevel === 'CRITICO' ? [225, 29, 72] : [217, 119, 6];
    doc.setTextColor(riskColor[0], riskColor[1], riskColor[2]);
    doc.text(`Diagnóstico: ${reconciliationData.riskTitle}`, sideX + 4, box1Y + 45);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    const splitDesc = doc.splitTextToSize(reconciliationData.recommendedAction, sideW - 8);
    doc.text(splitDesc, sideX + 4, box1Y + 49);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('Dados de conciliação bancária integrados ao fechamento.', sideX + 4, box1Y + 15);
  }

  // Bloco 4B: Principais Ofensores de Custo & Despesa (AH)
  const box2Y = 110;
  const box2H = 70;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(sideX, box2Y, sideW, box2H, 2, 2, 'FD');

  doc.setFillColor(30, 41, 59);
  doc.rect(sideX, box2Y, sideW, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('OFENSORES E VARIABILIDADE (ANÁLISE AH)', sideX + 4, box2Y + 5);

  // Identificar top linhas de custos com maior expansão
  const expenseLines = dreData.lines.filter(l => !l.isHeader && !l.isSummary && l.level > 0 && l.totalYear > 0);
  expenseLines.sort((a, b) => b.totalYear - a.totalYear);
  const topExpenses = expenseLines.slice(0, 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);

  topExpenses.forEach((exp, i) => {
    const yLine = box2Y + 14 + (i * 12);
    const av = grossRev > 0 ? (exp.totalYear / grossRev) * 100 : 0;
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}. ${exp.name.slice(0, 32)}`, sideX + 4, yLine);
    doc.setFont('helvetica', 'normal');
    doc.text(`Valor: ${formatBRL(exp.totalYear)}  •  Part. Faturamento (% AV): ${av.toFixed(1)}%`, sideX + 4, yLine + 4.5);
  });

  // 5. Rodapé Executivo de Página Única
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento estritamente confidencial elaborado para fins decisórios • Contaju Gestão Financeira Inteligente', 14, 202);
  doc.text('Página 1 de 1 (Sumário Executivo Consolidado)', 235, 202);

  doc.save(`Contaju-Sumario-Executivo-DRE-${year}.pdf`);
}


export function exportDREToCSV(dreData: DREMatrix, year: number) {
  const headers = ['Código', 'Descrição', ...dreData.months, 'Total Exercício'];
  const rows = dreData.lines.map(line => [
    line.code || '',
    line.name,
    ...line.valuesByMonth.map(v => v.toFixed(2)),
    line.totalYear.toFixed(2)
  ]);
  
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
  ].join('\r\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Contaju-DRE-${year}.csv`;
  link.click();
}

export function exportCashFlowToCSV(
  cashFlowData: {
    months: string[];
    lines: CashFlowLineItem[] | any[];
    finalBalances?: number[];
  },
  year: number,
  mode = 'CONSOLIDADO'
) {
  const headers = ['Item de Fluxo', ...cashFlowData.months, 'Total Exercício'];
  const rows = cashFlowData.lines.map(line => [
    line.name,
    ...line.valuesByMonth.map(v => ((v ?? 0)).toFixed(2)),
    ((line.totalYear ?? 0)).toFixed(2)
  ]);

  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
  ].join('\r\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `Contaju-Fluxo-Caixa-${year}-${mode}.csv`;
  link.click();
}

/**
 * Exporta o Termo Executivo de Fechamento Contábil & Saldos Auditados em PDF institucional.
 */
export function exportPeriodClosureToPDF(closure: PeriodClosure, customCompany?: CompanyProfile): void {
  const company = customCompany || storage.getCompany();
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const nowStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const competence = closure.competence || closure.yearMonth;

  // Cabeçalho Executivo Contábil (Slate 900)
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, 'F');

  // Faixa Dourada (Amber 500)
  doc.setFillColor(245, 158, 11);
  doc.rect(0, 28, 210, 2, 'F');

  // Título e dados da empresa
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CONTAJU • TERMO EXECUTIVO DE FECHAMENTO CONTÁBIL', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  const compName = company.companyName || company.tradeName || 'Contaju Gestão Contábil';
  doc.text(`Empresa: ${compName} • CNPJ: ${company.cnpj || '00.000.000/0001-00'} • Regime: ${company.fiscalRegime || 'Simples Nacional'}`, 14, 18);
  doc.text(`Competência: ${competence} • Auditoria de Saldos e Travas Operacionais`, 14, 23);
  doc.text(`Emissão: ${nowStr}`, 155, 23);

  let currentY = 36;

  // Bloco 1: Dados do Fechamento e Auditor
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, 182, 30, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('1. DADOS DA COMPETÊNCIA E REGISTRO DA TRAVA', 18, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  const closedDateStr = closure.closedAt ? new Date(closure.closedAt).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '-';

  doc.text(`• Competência Encerrada: ${competence}`, 18, currentY + 12);
  doc.text(`• Data e Hora do Fechamento: ${closedDateStr}`, 18, currentY + 17);
  doc.text(`• Responsável pelo Fechamento: ${closure.closedBy || 'Administrador'}`, 18, currentY + 22);

  const statusLabel = closure.checklistSnapshot?.bankBalancesMatched ? 'TRAVADO (100% CONCILIADO)' : 'TRAVADO (COM DIVERGÊNCIA JUSTIFICADA)';
  doc.setFont('helvetica', 'bold');
  doc.text(`• Status Operacional: ${statusLabel}`, 110, currentY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`• Parecer Registrado: ${(closure.notes || 'Sem observações adicionais').slice(0, 48)}`, 110, currentY + 17);

  currentY += 36;

  // Bloco 2: Resumo das 5 Travas do Checklist
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('2. AUDITORIA DE CONFORMIDADE (CHECKLIST DE 5 TRAVAS)', 14, currentY);

  currentY += 3;

  const chk = closure.checklistSnapshot;
  const checklistData = [
    [
      '1. Conciliação Bancária de Extratos',
      chk ? (chk.reconciled ? '✓ APROVADO' : `${chk.pendingReconciliationCount} pendências`) : '✓ CONCILIADO',
      chk?.reconciled ? 'Todos os lançamentos bancários foram conciliados sem pendências.' : 'Lançamentos pendentes registrados.'
    ],
    [
      '2. Conferência de Saldos Bancários',
      chk ? (chk.bankBalancesMatched ? '✓ EXATO (R$ 0,00)' : `Divergência: ${formatBRL(chk.totalBankDifference)}`) : '✓ CONCILIADO',
      chk?.bankBalancesMatched ? 'Saldos do sistema conferem 100% com os extratos bancários reais.' : 'Divergência apontada na conciliação.'
    ],
    [
      '3. Resolução de Títulos em Aberto',
      chk ? (chk.unsettledPayablesCount === 0 && chk.unsettledReceivablesCount === 0 ? '✓ 100% QUITADO' : 'CIENTE / INADIMPLÊNCIA') : '✓ APROVADO',
      `Títulos a Pagar: ${chk?.unsettledPayablesCount || 0} (${formatBRL(chk?.totalUnsettledPayables || 0)}) | A Receber: ${chk?.unsettledReceivablesCount || 0} (${formatBRL(chk?.totalUnsettledReceivables || 0)})`
    ],
    [
      '4. Classificação Contábil & Plano de Contas',
      chk ? (chk.unclassifiedCount === 0 ? '✓ 100% VINCULADO' : `${chk.unclassifiedCount} sem conta`) : '✓ APROVADO',
      'Integridade das contas e reflexo direto no DRE e Balancete patrimonial.'
    ],
    [
      '5. Provisão de Tributos e Encargos',
      chk ? (chk.taxesProvisioned ? '✓ PROVISIONADO' : 'NÃO DETECTADO') : '✓ APROVADO',
      'Guias e provisões de impostos apurados no período de competência.'
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Trava de Segurança Contábil', 'Status Auditoria', 'Detalhamento']],
    body: checklistData,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2.2 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 42, halign: 'center' },
      2: { cellWidth: 85 }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Bloco 3: Tabela de Saldos Bancários
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('3. DEMONSTRATIVO DE SALDOS BANCÁRIOS AUDITADOS', 14, currentY);

  currentY += 3;

  const bankRows: any[] = (closure.bankSnapshots || []).map(b => [
    `${b.bankName} (${b.institution})`,
    formatBRL(b.systemBalance),
    formatBRL(b.declaredBalance),
    b.isMatched ? 'R$ 0,00' : (b.difference > 0 ? `+${formatBRL(b.difference)}` : formatBRL(b.difference)),
    b.isMatched ? '✓ Conciliado' : 'Divergência'
  ]);

  // Linha de total
  const totSys = closure.checklistSnapshot?.totalSystemBankBalance ?? (closure.bankSnapshots || []).reduce((a, b) => a + b.systemBalance, 0);
  const totDec = closure.checklistSnapshot?.totalDeclaredBankBalance ?? (closure.bankSnapshots || []).reduce((a, b) => a + b.declaredBalance, 0);
  const totDiff = closure.checklistSnapshot?.totalBankDifference ?? (totDec - totSys);

  bankRows.push([
    'TOTAL GERAL CONSOLIDADO',
    formatBRL(totSys),
    formatBRL(totDec),
    Math.abs(totDiff) < 0.01 ? 'R$ 0,00' : (totDiff > 0 ? `+${formatBRL(totDiff)}` : formatBRL(totDiff)),
    Math.abs(totDiff) < 0.01 ? '✓ 100% Exato' : '⚠️ Divergente'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Conta Bancária / Caixa', 'Saldo Sistema (R$)', 'Saldo Extrato (R$)', 'Diferença (R$)', 'Situação']],
    body: bankRows,
    theme: 'striped',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [245, 158, 11], textColor: [15, 23, 42], fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 32, halign: 'right' },
      2: { cellWidth: 32, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 26, halign: 'center' }
    },
    didParseCell: (data) => {
      if (data.row.index === bankRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
    },
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 12;

  // Bloco 4: Termo de Responsabilidade & Assinaturas
  if (currentY > 235) {
    doc.addPage();
    currentY = 25;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, currentY, 182, 48, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DECLARAÇÃO DE CONFORMIDADE E VALIDAÇÃO CONTÁBIL', 18, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const termText = `Certificamos que as movimentações financeiras, conciliações bancárias e saldos relativos à competência ${competence} foram integralmente conferidos e consolidados de acordo com os princípios contábeis e fiscais vigentes. Este documento comprova a exatidão das posições patrimoniais em ${closedDateStr} e autoriza a trava contra alterações retroativas involuntárias.`;
  const splitTerm = doc.splitTextToSize(termText, 174);
  doc.text(splitTerm, 18, currentY + 12);

  // Linhas de Assinatura
  const signY = currentY + 36;
  doc.setDrawColor(148, 163, 184);
  doc.line(22, signY, 70, signY);
  doc.line(82, signY, 130, signY);
  doc.line(142, signY, 190, signY);

  doc.setFontSize(6.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Responsável Financeiro', 30, signY + 4);
  doc.text((closure.closedBy || 'Auditor').slice(0, 20), 30, signY + 7);

  doc.text('Diretoria / Gestão', 94, signY + 4);
  doc.text(compName.slice(0, 22), 94, signY + 7);

  doc.text('Contador Responsável', 152, signY + 4);
  doc.text('CRC / Conformidade', 154, signY + 7);

  // Rodapé da Página
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Documento gerado automaticamente pelo Sistema Contaju • Governança, Conciliação e Fechamento Contábil Perfeito', 14, 290);
  doc.text(`ID: ${closure.id}`, 165, 290);

  doc.save(`Contaju-Termo-Fechamento-${competence}.pdf`);
}


