import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  X,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  Sun,
  Moon,
  Check,
  Percent,
  Wallet
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { GoldenLionLogo } from '../Common/GoldenLionLogo';

export interface ReportPrintTableRow {
  code?: string;
  name: string;
  level?: number;
  isHeader?: boolean;
  isSummary?: boolean;
  isNetLine?: boolean;
  values: string[];
  total: string;
  percentage?: string;
  isNegative?: boolean;
}

export interface ReportPrintKPI {
  label: string;
  value: string;
  sublabel?: string;
  color?: 'emerald' | 'rose' | 'amber' | 'blue' | 'neutral';
}

interface ReportPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'DRE' | 'FLUXO_CAIXA';
  title: string;
  subtitle: string;
  year: number;
  periodLabel: string;
  modeLabel?: string;
  headers: string[];
  rows: ReportPrintTableRow[];
  kpis?: ReportPrintKPI[];
  onDownloadDirectPDF: () => void;
}

export const ReportPrintModal: React.FC<ReportPrintModalProps> = ({
  isOpen,
  onClose,
  reportType,
  title,
  subtitle,
  year,
  periodLabel,
  modeLabel,
  headers,
  rows,
  kpis,
  onDownloadDirectPDF
}) => {
  const company = storage.getCompany();
  const systemTheme = storage.getTheme();
  // Permite ao usuário escolher se quer imprimir com fundo branco papel ou manter o tema ativo
  const [printTheme, setPrintTheme] = useState<'SYSTEM' | 'PAPER_WHITE'>('PAPER_WHITE');

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const isDark = printTheme === 'SYSTEM' && systemTheme === 'dark';

  const emissionDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 print:p-0 print:bg-white print:static">
      <div 
        className={`rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[94vh] print:max-h-none print:border-none print:shadow-none print:w-full print:rounded-none transition-colors ${
          isDark 
            ? 'bg-[#131316] border border-[#26262b] text-[#F8FAFC]' 
            : 'bg-white border border-slate-200 text-slate-900'
        }`}
      >
        {/* Barra de Ações Superior (Oculta na impressão física) */}
        <div className="p-3.5 sm:p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex flex-wrap justify-between items-center gap-3 print:hidden shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  Layout de Impressão & Exportação PDF
                </span>
                <span className="text-xs text-[var(--text-secondary)] font-medium hidden sm:inline">
                  {periodLabel}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--text-primary)]">
                {title} • Exercício {year}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Seletor de Tema do Relatório */}
            <div className="flex items-center bg-[var(--surface-card)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs">
              <button
                type="button"
                onClick={() => setPrintTheme('PAPER_WHITE')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  printTheme === 'PAPER_WHITE'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Modo Papel Branco: Ideal para impressoras físicas e economizar tinta"
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Papel Branco</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintTheme('SYSTEM')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  printTheme === 'SYSTEM'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                title="Tema do Sistema: Utiliza as variáveis de cor exatas do app (Dark ou Light)"
              >
                <Moon className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Tema do App</span>
              </button>
            </div>

            {/* Baixar PDF Direto (jsPDF) */}
            <button
              type="button"
              onClick={onDownloadDirectPDF}
              className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Baixar arquivo PDF vetorial diagramado em folha A4 Paisagem"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Baixar PDF (A4)</span>
            </button>

            {/* Imprimir via Navegador / Salvar como PDF */}
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
              title="Abrir diálogo de impressão do navegador (Ctrl+P / Salvar como PDF)"
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Imprimir / Salvar PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Área do Documento Impresso (Renderizada com variáveis de tema) */}
        <div 
          id="print-report-container"
          className={`flex-1 overflow-y-auto p-4 sm:p-8 space-y-5 print:p-0 print:overflow-visible print:space-y-4 print:text-black ${
            isDark ? 'bg-[#0b0b0d] text-[#F8FAFC]' : 'bg-white text-slate-900'
          }`}
        >
          {/* Cabeçalho do Documento Contábil */}
          <div className={`p-4 sm:p-5 rounded-2xl border print:border-slate-300 print:rounded-none print:p-3 ${
            isDark 
              ? 'bg-[#131316] border-[#26262b]' 
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center space-x-3">
                <GoldenLionLogo size={42} showText={false} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm tracking-wider uppercase text-amber-500">
                      CONTAJU
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${
                      isDark 
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' 
                        : 'bg-amber-100 text-amber-900 border-amber-300'
                    }`}>
                      {reportType === 'DRE' ? 'DRE GERENCIAL' : 'DFC • FLUXO DE CAIXA'}
                    </span>
                    {modeLabel && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        isDark 
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' 
                          : 'bg-blue-100 text-blue-900 border-blue-300'
                      }`}>
                        {modeLabel}
                      </span>
                    )}
                  </div>
                  <h1 className="text-base sm:text-lg font-black tracking-tight mt-0.5">
                    {title}
                  </h1>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {subtitle} • {periodLabel}
                  </p>
                </div>
              </div>

              <div className={`text-left sm:text-right text-xs space-y-0.5 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700 ${
                isDark ? 'text-slate-300' : 'text-slate-700'
              }`}>
                <div><strong>Empresa:</strong> {company.companyName || company.tradeName || 'Contaju Gestão Financeira'}</div>
                <div><strong>CNPJ:</strong> {company.cnpj || '00.000.000/0001-00'}</div>
                <div><strong>Regime:</strong> {reportType === 'DRE' ? 'Competência' : `Caixa (${modeLabel || 'Consolidado'})`}</div>
                <div className="text-[11px] opacity-80">Emissão: {emissionDate}</div>
              </div>
            </div>
          </div>

          {/* KPIs Executivos Condensados no Topo */}
          {kpis && kpis.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 print:gap-2">
              {kpis.map((kpi, idx) => {
                let badgeColor = isDark ? 'bg-slate-800/80 text-white' : 'bg-slate-100 text-slate-900';
                if (kpi.color === 'emerald') {
                  badgeColor = isDark ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/50' : 'bg-emerald-50 text-emerald-900 border-emerald-200';
                } else if (kpi.color === 'rose') {
                  badgeColor = isDark ? 'bg-rose-950/40 text-rose-300 border-rose-800/50' : 'bg-rose-50 text-rose-900 border-rose-200';
                } else if (kpi.color === 'amber') {
                  badgeColor = isDark ? 'bg-amber-950/40 text-amber-300 border-amber-800/50' : 'bg-amber-50 text-amber-900 border-amber-200';
                }

                return (
                  <div 
                    key={idx} 
                    className={`p-3 rounded-xl border print:border-slate-300 print:rounded-none print:p-2 ${badgeColor}`}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">
                      {kpi.label}
                    </span>
                    <div className="text-sm sm:text-base font-extrabold font-mono mt-0.5">
                      {kpi.value}
                    </div>
                    {kpi.sublabel && (
                      <span className="text-[10px] opacity-75 block mt-0.5">
                        {kpi.sublabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tabela Estruturada do Relatório */}
          <div className={`rounded-xl border overflow-hidden print:border-slate-300 print:rounded-none ${
            isDark ? 'border-[#26262b]' : 'border-slate-200'
          }`}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className={`border-b font-bold uppercase text-[11px] tracking-wider ${
                  isDark 
                    ? 'bg-[#1b1b20] border-[#26262b] text-[#F8FAFC]' 
                    : 'bg-slate-100 border-slate-300 text-slate-900'
                }`}>
                  <th className="py-2.5 px-3 border-r border-inherit">Estrutura</th>
                  <th className="py-2.5 px-3 border-r border-inherit">Descrição da Rubrica</th>
                  {headers.map((h, i) => (
                    <th key={i} className="py-2.5 px-2 text-right border-r border-inherit">
                      {h}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right font-extrabold">Total</th>
                  {rows[0]?.percentage !== undefined && (
                    <th className="py-2.5 px-2 text-center">% AV</th>
                  )}
                </tr>
              </thead>

              <tbody className={`divide-y ${isDark ? 'divide-[#26262b]' : 'divide-slate-200'}`}>
                {rows.map((row, idx) => {
                  let rowBg = '';
                  let rowText = isDark ? 'text-slate-200' : 'text-slate-800';

                  if (row.isNetLine) {
                    rowBg = isDark ? 'bg-amber-950/40 font-bold' : 'bg-amber-50 font-bold';
                    rowText = isDark ? 'text-amber-300' : 'text-slate-950';
                  } else if (row.isSummary) {
                    rowBg = isDark ? 'bg-[#1b1b20] font-bold' : 'bg-slate-100 font-bold';
                    rowText = isDark ? 'text-white' : 'text-slate-900';
                  } else if (row.isHeader) {
                    rowBg = isDark ? 'bg-[#17171b] font-bold' : 'bg-slate-50 font-bold';
                    rowText = isDark ? 'text-amber-400' : 'text-slate-900';
                  }

                  return (
                    <tr key={idx} className={`${rowBg} transition-colors print:bg-transparent`}>
                      <td className={`py-2 px-3 font-mono text-[11px] font-semibold border-r ${isDark ? 'border-[#26262b]' : 'border-slate-200'}`}>
                        {row.code || '-'}
                      </td>
                      <td 
                        className={`py-2 px-3 border-r font-medium ${isDark ? 'border-[#26262b]' : 'border-slate-200'}`}
                        style={{ paddingLeft: `${(row.level || 0) * 14 + 12}px` }}
                      >
                        <span className={rowText}>{row.name}</span>
                      </td>
                      {row.values.map((v, i) => (
                        <td key={i} className={`py-2 px-2 text-right font-mono text-[11px] border-r ${isDark ? 'border-[#26262b]' : 'border-slate-200'}`}>
                          {v}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono font-bold text-[11px]">
                        {row.total}
                      </td>
                      {row.percentage !== undefined && (
                        <td className="py-2 px-2 text-center font-mono text-[10px] opacity-80">
                          {row.percentage}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bloco de Assinaturas Executivas & Conformidade Contábil */}
          <div className="pt-6 border-t border-slate-300 dark:border-slate-700 print:pt-6 print:border-slate-400">
            <div className="grid grid-cols-2 gap-8 text-center text-xs">
              <div>
                <div className="border-t border-slate-400 dark:border-slate-600 w-3/4 mx-auto pt-2">
                  <div className="font-bold text-sm">Contador Responsável</div>
                  <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    CRC/UF • Perito e Auditor Contábil
                  </div>
                </div>
              </div>

              <div>
                <div className="border-t border-slate-400 dark:border-slate-600 w-3/4 mx-auto pt-2">
                  <div className="font-bold text-sm">Diretoria Financeira / Administração</div>
                  <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    {company.companyName || company.tradeName || 'Contaju Gestão'}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 text-center text-[10px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-center gap-3">
              <span>Relatório executivo oficial emitido via <strong>Contaju Gestão Financeira</strong></span>
              <span>•</span>
              <span>Chave de integridade: <code className="font-mono">{`REP-${reportType}-${year}-${Date.now().toString(36).toUpperCase()}`}</code></span>
              <span>•</span>
              <span>Página 1 de 1</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
