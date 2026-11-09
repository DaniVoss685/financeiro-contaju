import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  AlertTriangle, 
  Users, 
  PieChart, 
  Filter, 
  FileText, 
  TrendingUp, 
  Wallet,
  Calendar,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { exportToExcel, exportToCSV } from '../../utils/exportUtils';
import { ReportingEngine } from '../../services/reportingEngine';
import { 
  exportDREToPDF, 
  exportCashFlowToPDF, 
  exportDREToCSV, 
  exportCashFlowToCSV 
} from '../../utils/pdfExportUtils';
import { PageToolbar, Button, TabPills } from '../Common/ui';

type ReportTab = 'DRE_CONTABIL' | 'FLUXO_CAIXA_CONTABIL' | 'AGING' | 'TOP_CLIENTS' | 'EXPENSE_CATEGORIES';

export const ReportsView: React.FC = () => {
  const [activeReport, setActiveReport] = useState<ReportTab>('DRE_CONTABIL');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [cashFlowMode, setCashFlowMode] = useState<'REALIZADO' | 'PROJETADO' | 'CONSOLIDADO'>('CONSOLIDADO');
  const [isExporting, setIsExporting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const titles = storage.getTitles();
  const counterparties = storage.getCounterparties();
  const chartAccounts = storage.getChartAccounts();

  // DRE & Cash Flow Data
  const dreData = ReportingEngine.generateDRE(selectedYear);
  const cashFlowData = ReportingEngine.generateCashFlow(selectedYear, cashFlowMode);

  // 1. Aging List (Inadimplência por faixa de atraso)
  const overdueTitles = titles.filter(t => t.type === 'RECEBER' && t.balancePrincipal > 0 && t.dueDate < today);

  const agingBuckets = {
    '1_30': { label: '1 a 30 dias', total: 0, items: [] as typeof overdueTitles },
    '31_60': { label: '31 a 60 dias', total: 0, items: [] as typeof overdueTitles },
    '61_90': { label: '61 a 90 dias', total: 0, items: [] as typeof overdueTitles },
    '90_plus': { label: 'Acima de 90 dias', total: 0, items: [] as typeof overdueTitles },
  };

  const todayDate = new Date(today);
  overdueTitles.forEach(t => {
    const due = new Date(t.dueDate);
    const diffDays = Math.floor((todayDate.getTime() - due.getTime()) / (1000 * 3600 * 24));

    if (diffDays <= 30) {
      agingBuckets['1_30'].total += t.balancePrincipal;
      agingBuckets['1_30'].items.push(t);
    } else if (diffDays <= 60) {
      agingBuckets['31_60'].total += t.balancePrincipal;
      agingBuckets['31_60'].items.push(t);
    } else if (diffDays <= 90) {
      agingBuckets['61_90'].total += t.balancePrincipal;
      agingBuckets['61_90'].items.push(t);
    } else {
      agingBuckets['90_plus'].total += t.balancePrincipal;
      agingBuckets['90_plus'].items.push(t);
    }
  });

  // 2. Top Clients by Revenue
  const clientsMap: Record<string, { name: string; document: string; totalRevenue: number; openBalance: number }> = {};
  titles.filter(t => t.type === 'RECEBER').forEach(t => {
    const c = counterparties.find(cp => cp.id === t.counterpartyId);
    if (!clientsMap[t.counterpartyId]) {
      clientsMap[t.counterpartyId] = {
        name: c?.name || 'Cliente',
        document: c?.document || '',
        totalRevenue: 0,
        openBalance: 0
      };
    }
    clientsMap[t.counterpartyId].totalRevenue += t.originalAmount;
    clientsMap[t.counterpartyId].openBalance += t.balancePrincipal;
  });

  const topClients = Object.values(clientsMap).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // 3. Expense Breakdown by Category
  const expenseMap: Record<string, { code: string; name: string; total: number }> = {};
  titles.filter(t => t.type === 'PAGAR').forEach(t => {
    const acc = chartAccounts.find(a => a.id === t.accountId);
    const code = acc?.code || '9.9.9';
    const name = acc?.name || 'Outras Despesas';

    if (!expenseMap[code]) {
      expenseMap[code] = { code, name, total: 0 };
    }
    expenseMap[code].total += t.originalAmount;
  });

  const expenseCategories = Object.values(expenseMap).sort((a, b) => b.total - a.total);

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const handleExportDRE_PDF = () => {
    try {
      setIsExporting(true);
      exportDREToPDF(dreData, selectedYear, 'ContaJu Gestão Financeira');
      showFeedback(`DRE Exercício ${selectedYear} exportada com sucesso em PDF executivo!`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF da DRE.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportDRE_CSV = () => {
    try {
      exportDREToCSV(dreData, selectedYear);
      showFeedback(`DRE Exercício ${selectedYear} exportada em CSV.`);
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar CSV.');
    }
  };

  const handleExportCashFlow_PDF = () => {
    try {
      setIsExporting(true);
      exportCashFlowToPDF(cashFlowData, selectedYear, cashFlowMode, 'ContaJu Gestão Financeira');
      showFeedback(`Fluxo de Caixa (${cashFlowMode}) exportado com sucesso em PDF executivo!`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF do Fluxo de Caixa.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCashFlow_CSV = () => {
    try {
      exportCashFlowToCSV(cashFlowData, selectedYear, cashFlowMode);
      showFeedback(`Fluxo de Caixa exportado em CSV.`);
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar CSV.');
    }
  };

  const handleExportStandard = () => {
    if (activeReport === 'AGING') {
      const headers = ['Título', 'Cliente', 'Vencimento', 'Dias em Atraso', 'Saldo Vencido'];
      const rows = overdueTitles.map(t => {
        const c = counterparties.find(cp => cp.id === t.counterpartyId);
        const due = new Date(t.dueDate);
        const diffDays = Math.floor((todayDate.getTime() - due.getTime()) / (1000 * 3600 * 24));
        return [t.titleNumber, c?.name || 'Cliente', t.dueDate, diffDays, t.balancePrincipal];
      });
      exportToExcel(`relatorio-aging-${today}`, 'Inadimplência Aging', headers, rows);
      showFeedback('Relatório Aging exportado.');
    } else if (activeReport === 'TOP_CLIENTS') {
      const headers = ['Cliente', 'Documento', 'Faturamento Total', 'Saldo em Aberto'];
      const rows = topClients.map(c => [c.name, c.document, c.totalRevenue, c.openBalance]);
      exportToExcel(`ranking-clientes-${today}`, 'Top Clientes', headers, rows);
      showFeedback('Ranking de Clientes exportado.');
    } else if (activeReport === 'EXPENSE_CATEGORIES') {
      const headers = ['Código', 'Conta / Categoria', 'Total Despesas'];
      const rows = expenseCategories.map(e => [e.code, e.name, e.total]);
      exportToExcel(`despesas-por-categoria-${today}`, 'Despesas', headers, rows);
      showFeedback('Despesas por Categoria exportadas.');
    }
  };

  return (
    <div className="space-y-6">
      
      <PageToolbar description="DRE e fluxo de caixa em PDF e CSV para reuniões de diretoria, contadores e auditorias externas.">
        {activeReport === 'DRE_CONTABIL' && (
          <>
            <Button id="btn-export-dre-csv" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExportDRE_CSV}>
              Exportar CSV
            </Button>
            <Button id="btn-export-dre-pdf" variant="primary" icon={<FileText className="w-4 h-4" />} onClick={handleExportDRE_PDF} disabled={isExporting}>
              Exportar DRE em PDF
            </Button>
          </>
        )}

        {activeReport === 'FLUXO_CAIXA_CONTABIL' && (
          <>
            <Button id="btn-export-cashflow-csv" variant="secondary" icon={<Download className="w-4 h-4" />} onClick={handleExportCashFlow_CSV}>
              Exportar CSV
            </Button>
            <Button id="btn-export-cashflow-pdf" variant="primary" icon={<FileText className="w-4 h-4" />} onClick={handleExportCashFlow_PDF} disabled={isExporting}>
              Exportar fluxo em PDF
            </Button>
          </>
        )}

        {activeReport !== 'DRE_CONTABIL' && activeReport !== 'FLUXO_CAIXA_CONTABIL' && (
          <Button variant="primary" icon={<Download className="w-4 h-4" />} onClick={handleExportStandard}>
            Exportar tabela (Excel)
          </Button>
        )}
      </PageToolbar>

      {feedbackMsg && (
        <div className="px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <span className="text-xs text-[var(--text-muted)]">Arquivo baixado com sucesso</span>
        </div>
      )}

      <TabPills
        tabs={[
          { id: 'DRE_CONTABIL', label: 'DRE contábil' },
          { id: 'FLUXO_CAIXA_CONTABIL', label: 'Fluxo de caixa' },
          { id: 'AGING', label: 'Inadimplência' },
          { id: 'TOP_CLIENTS', label: 'Ranking de clientes' },
          { id: 'EXPENSE_CATEGORIES', label: 'Despesas por categoria' }
        ]}
        value={activeReport}
        onChange={id => setActiveReport(id as any)}
      />

      {/* 1. DRE CONTÁBIL TAB */}
      {activeReport === 'DRE_CONTABIL' && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <span className="font-semibold text-slate-700 flex items-center">
                <Calendar className="w-4 h-4 mr-1.5 text-slate-500" />
                Ano Base do Exercício:
              </span>
              <div className="flex items-center space-x-1">
                {[2024, 2025, 2026, 2027].map(yr => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    className={`px-3 py-1 rounded-lg font-mono font-medium transition-all ${
                      selectedYear === yr
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-slate-500">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Regime de Competência Econômica (CPC 26)</span>
            </div>
          </div>

          {/* DRE Key Metrics Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Receita Bruta Total</p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {formatBRL(dreData.lines.find(l => l.id === 'h-1')?.totalYear || 0)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Acumulado {selectedYear}</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lucro Bruto</p>
              <p className="text-xl font-bold text-amber-800 mt-1">
                {formatBRL(dreData.lines.find(l => l.id === 's-gross')?.totalYear || 0)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Após Deduções e Custos</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Resultado Operacional</p>
              <p className={`text-xl font-bold mt-1 ${
                (dreData.lines.find(l => l.id === 's-op-result')?.totalYear || 0) >= 0 ? 'text-amber-800' : 'text-rose-700'
              }`}>
                {formatBRL(dreData.lines.find(l => l.id === 's-op-result')?.totalYear || 0)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">LAJIR / EBITDA</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Resultado Líquido</p>
              <p className={`text-xl font-bold mt-1 ${dreData.totalNetResult >= 0 ? 'text-amber-800' : 'text-rose-700'}`}>
                {formatBRL(dreData.totalNetResult)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Margem do Período</p>
            </div>
          </div>

          {/* DRE Preview Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Pré-visualização do Demonstrativo do Resultado (DRE {selectedYear})
                </h3>
                <p className="text-[11px] text-slate-500">Relatório consolidado mês a mês para exportação em PDF/CSV.</p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportDRE_PDF}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  Baixar PDF
                </button>
                <button
                  onClick={handleExportDRE_CSV}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  Baixar CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-20 border-b border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4 min-w-[145px] max-w-[170px] sm:min-w-[220px] sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 border-r border-slate-300 dark:border-slate-700 shadow-sm">
                      Estrutura de Contas
                    </th>
                    {dreData.months.map(m => (
                      <th key={m} className="py-2.5 px-3 text-right font-mono min-w-[90px]">{m}</th>
                    ))}
                    <th className="py-2.5 px-4 text-right font-mono min-w-[110px] bg-slate-200/60 dark:bg-slate-700/60 font-bold">Total Ano</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {dreData.lines.map(line => {
                    const isHeader = line.isHeader;
                    const isSummary = line.isSummary;
                    const indentClass = line.level === 1 ? 'pl-7' : line.level === 2 ? 'pl-11' : 'pl-4';

                    let rowStyle = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50';
                    let stickyBg = 'bg-white dark:bg-[#131316] text-slate-900 dark:text-slate-100';

                    if (isHeader) {
                      rowStyle = 'bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white';
                      stickyBg = 'bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white';
                    }
                    if (isSummary) {
                      rowStyle = 'bg-amber-500/10 font-bold text-slate-900 dark:text-amber-300 border-t border-b border-amber-500/30';
                      stickyBg = 'bg-amber-100 dark:bg-[#201c14] font-bold text-amber-950 dark:text-amber-300';
                    }

                    return (
                      <tr key={line.id} className={rowStyle}>
                        <td className={`py-2 px-3 sm:px-4 min-w-[145px] max-w-[170px] sm:min-w-[220px] sticky left-0 z-10 border-r border-slate-300 dark:border-slate-700 shadow-sm ${stickyBg} ${indentClass}`}>
                          {line.code && <span className="text-[10px] font-mono text-slate-500 mr-1.5">{line.code}</span>}
                          <span>{line.name}</span>
                        </td>
                        {line.valuesByMonth.map((val, idx) => (
                          <td key={idx} className={`py-2 px-3 text-right font-mono text-[11px] ${
                            val < 0 ? 'text-rose-600 font-semibold' : val > 0 && isSummary ? 'text-amber-800 font-semibold' : 'text-slate-700'
                          }`}>
                            {val !== 0 ? formatBRL(val) : '-'}
                          </td>
                        ))}
                        <td className={`py-2 px-4 text-right font-mono font-bold text-[11px] bg-slate-50/50 ${
                          line.totalYear < 0 ? 'text-rose-600' : 'text-slate-900'
                        }`}>
                          {formatBRL(line.totalYear)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. FLUXO DE CAIXA CONTÁBIL TAB */}
      {activeReport === 'FLUXO_CAIXA_CONTABIL' && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-700 flex items-center">
                  <Calendar className="w-4 h-4 mr-1 text-slate-500" />
                  Ano:
                </span>
                <div className="flex items-center space-x-1">
                  {[2024, 2025, 2026, 2027].map(yr => (
                    <button
                      key={yr}
                      onClick={() => setSelectedYear(yr)}
                      className={`px-3 py-1 rounded-lg font-mono font-medium transition-all ${
                        selectedYear === yr
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {yr}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-700">Modalidade:</span>
                <div className="flex items-center space-x-1">
                  {(['REALIZADO', 'PROJETADO', 'CONSOLIDADO'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setCashFlowMode(m)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                        cashFlowMode === m
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-slate-500">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
              <span>Método Direto (Norma Contábil CPC 03 / IAS 7)</span>
            </div>
          </div>

          {/* Cash Flow Key Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total de Ingressos (Entradas)</p>
              <p className="text-xl font-bold text-amber-800 mt-1">
                {formatBRL(cashFlowData.lines.find(l => l.name.includes('Ingressos') || l.name.includes('Entradas'))?.totalYear || 0)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Atividades Operacionais & Recebimentos</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total de Desembolsos (Saídas)</p>
              <p className="text-xl font-bold text-rose-700 mt-1">
                {formatBRL(cashFlowData.lines.find(l => l.name.includes('Desembolsos') || l.name.includes('Saídas'))?.totalYear || 0)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Pagamentos a Fornecedores & Custos</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Geração Líquida no Ano</p>
              <p className={`text-xl font-bold mt-1 ${
                (cashFlowData.lines.find(l => l.name.includes('Geração Líquida'))?.totalYear || 0) >= 0 ? 'text-amber-800' : 'text-rose-700'
              }`}>
                {formatBRL(cashFlowData.lines.find(l => l.name.includes('Geração Líquida'))?.totalYear || 0)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Variação de Disponibilidades</p>
            </div>
          </div>

          {/* Cash Flow Preview Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Pré-visualização do Fluxo de Caixa Direto ({selectedYear} - {cashFlowMode})
                </h3>
                <p className="text-[11px] text-slate-500">Detalhamento mês a mês com saldos inicial, movimentos e saldo final de tesouraria.</p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportCashFlow_PDF}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium flex items-center shadow-2xs"
                >
                  <FileText className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  Baixar PDF
                </button>
                <button
                  onClick={handleExportCashFlow_CSV}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 mr-1 text-amber-400" />
                  Baixar CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-20 border-b border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4 min-w-[145px] max-w-[170px] sm:min-w-[220px] sticky left-0 z-20 bg-slate-100 dark:bg-slate-800 border-r border-slate-300 dark:border-slate-700 shadow-sm">
                      Item do Fluxo de Caixa
                    </th>
                    {cashFlowData.months.map(m => (
                      <th key={m} className="py-2.5 px-3 text-right font-mono min-w-[90px]">{m}</th>
                    ))}
                    <th className="py-2.5 px-4 text-right font-mono min-w-[110px] bg-slate-200/60 dark:bg-slate-700/60 font-bold">Total Ano</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cashFlowData.lines.map(line => {
                    const isHeader = line.isHeader;
                    const isSummary = line.isSummary;
                    const indentClass = line.level === 1 ? 'pl-7' : line.level === 2 ? 'pl-11' : 'pl-4';

                    let rowStyle = 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50';
                    let stickyBg = 'bg-white dark:bg-[#131316] text-slate-900 dark:text-slate-100';

                    if (isHeader) {
                      rowStyle = 'bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white';
                      stickyBg = 'bg-slate-50 dark:bg-slate-800 font-bold text-slate-900 dark:text-white';
                    }
                    if (isSummary) {
                      rowStyle = 'bg-amber-500/10 font-bold text-slate-900 dark:text-amber-300 border-t border-b border-amber-500/30';
                      stickyBg = 'bg-amber-100 dark:bg-[#201c14] font-bold text-amber-950 dark:text-amber-300';
                    }

                    return (
                      <tr key={line.id} className={rowStyle}>
                        <td className={`py-2 px-3 sm:px-4 min-w-[145px] max-w-[170px] sm:min-w-[220px] sticky left-0 z-10 border-r border-slate-300 dark:border-slate-700 shadow-sm ${stickyBg} ${indentClass}`}>
                          <span>{line.name}</span>
                        </td>
                        {line.valuesByMonth.map((val, idx) => (
                          <td key={idx} className={`py-2 px-3 text-right font-mono text-[11px] ${
                            val < 0 ? 'text-rose-600 font-semibold' : val > 0 && isSummary ? 'text-amber-800 font-semibold' : 'text-slate-700'
                          }`}>
                            {val !== 0 ? formatBRL(val) : '-'}
                          </td>
                        ))}
                        <td className={`py-2 px-4 text-right font-mono font-bold text-[11px] bg-slate-50/50 ${
                          line.totalYear < 0 ? 'text-rose-600' : 'text-slate-900'
                        }`}>
                          {formatBRL(line.totalYear)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. AGING LIST */}
      {activeReport === 'AGING' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {Object.entries(agingBuckets).map(([key, bucket]) => (
              <div key={key} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {bucket.label}
                  </span>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-lg font-bold text-slate-900 mt-2">
                  {formatBRL(bucket.total)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {bucket.items.length} títulos vencidos
                </p>
              </div>
            ))}
          </div>

          {/* Aging Details Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Detalhamento dos Títulos Inadimplentes
              </h3>
              <button
                onClick={handleExportStandard}
                className="px-3 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md text-xs font-medium flex items-center"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Exportar Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase">
                  <tr>
                    <th className="py-2.5 px-4">Nº Título</th>
                    <th className="py-2.5 px-4">Cliente</th>
                    <th className="py-2.5 px-4">Vencimento</th>
                    <th className="py-2.5 px-4 text-center">Dias em Atraso</th>
                    <th className="py-2.5 px-4 text-right">Saldo Devedor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overdueTitles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        Nenhum título vencido encontrado na carteira.
                      </td>
                    </tr>
                  ) : (
                    overdueTitles.map(t => {
                      const c = counterparties.find(cp => cp.id === t.counterpartyId);
                      const due = new Date(t.dueDate);
                      const diffDays = Math.floor((todayDate.getTime() - due.getTime()) / (1000 * 3600 * 24));
                      return (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-mono font-medium text-slate-900">{t.titleNumber}</td>
                          <td className="py-2.5 px-4 text-slate-800 font-medium">{c?.name || 'Cliente'}</td>
                          <td className="py-2.5 px-4 text-slate-600">{formatDateBR(t.dueDate)}</td>
                          <td className="py-2.5 px-4 text-center font-bold text-rose-700">
                            +{diffDays} dias
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-rose-700">
                            {formatBRL(t.balancePrincipal)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. TOP CLIENTS */}
      {activeReport === 'TOP_CLIENTS' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Ranking de Clientes por Faturamento Emitido
            </h3>
            <button
              onClick={handleExportStandard}
              className="px-3 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md text-xs font-medium flex items-center"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Exportar Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase">
                <tr>
                  <th className="py-2.5 px-4">Posição</th>
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">Documento</th>
                  <th className="py-2.5 px-4 text-right">Faturamento Acumulado</th>
                  <th className="py-2.5 px-4 text-right">Saldo em Aberto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topClients.map((client, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-bold text-slate-700">#{idx + 1}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{client.name}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-700">{client.document}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-amber-500">
                      {formatBRL(client.totalRevenue)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-medium text-slate-700">
                      {formatBRL(client.openBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. EXPENSE CATEGORIES */}
      {activeReport === 'EXPENSE_CATEGORIES' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Despesas e Custos por Categoria do Plano de Contas
            </h3>
            <button
              onClick={handleExportStandard}
              className="px-3 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md text-xs font-medium flex items-center"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Exportar Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase">
                <tr>
                  <th className="py-2.5 px-4">Código Contábil</th>
                  <th className="py-2.5 px-4">Conta / Rubrica</th>
                  <th className="py-2.5 px-4 text-right">Total Provisionado (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenseCategories.map(exp => (
                  <tr key={exp.code} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-medium text-slate-700">{exp.code}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{exp.name}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-rose-700">
                      {formatBRL(exp.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
