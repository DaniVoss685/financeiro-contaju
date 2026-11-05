import React, { useState } from 'react';
import { Scale, ArrowRight, CheckCircle2, AlertCircle, Info, Calendar } from 'lucide-react';
import { ReportingEngine } from '../../services/reportingEngine';
import { storage } from '../../services/storageService';
import { formatBRL, formatCompetence } from '../../services/financialEngine';
import { MonthField } from '../Common/DateField';

export const CompareDRECashView: React.FC = () => {
  const currentMonth = new Date().toISOString().substring(0, 7);
  const [selectedCompetence, setSelectedCompetence] = useState<string>(currentMonth);

  const [yearStr, monthStr] = selectedCompetence.split('-');
  const year = parseInt(yearStr);
  const monthIdx = parseInt(monthStr) - 1;

  // 1. DRE Data
  const dre = ReportingEngine.generateDRE(year);
  const netResultDRE = dre.netResults[monthIdx] || 0;
  const grossRevenue = dre.lines[0]?.valuesByMonth[monthIdx] || 0;

  // 2. Cash Flow Data
  const cash = ReportingEngine.generateCashFlow(year, 'REALIZADO');
  const opNetLine = cash.lines.find(l => l.id === 'cf-op-net') || cash.lines[4];
  const cashNetOperating = opNetLine?.valuesByMonth[monthIdx] || 0; // Geração Líquida Operacional

  // 3. Timing Differences Analysis
  const titles = storage.getTitles();
  const settlements = storage.getSettlements();

  // Revenues of this competence NOT yet received in cash
  const uncollectedRevenue = titles
    .filter(t => t.type === 'RECEBER' && t.competence === selectedCompetence && t.balancePrincipal > 0)
    .reduce((acc, t) => acc + t.balancePrincipal, 0);

  // Expenses of this competence NOT yet paid in cash
  const unpaidExpenses = titles
    .filter(t => t.type === 'PAGAR' && t.competence === selectedCompetence && t.balancePrincipal > 0)
    .reduce((acc, t) => acc + t.balancePrincipal, 0);

  // Cash received this month belonging to PAST competences
  const targetPrefix = `${selectedCompetence}-`;
  const pastCollectionsInMonth = settlements
    .filter(s => {
      if (!s.settlementDate.startsWith(targetPrefix)) return false;
      const title = titles.find(t => t.id === s.titleId);
      return title && title.type === 'RECEBER' && title.competence !== selectedCompetence;
    })
    .reduce((acc, s) => acc + s.components.netFinancialAmount, 0);

  // Cash paid this month belonging to PAST competences
  const pastPaymentsInMonth = settlements
    .filter(s => {
      if (!s.settlementDate.startsWith(targetPrefix)) return false;
      const title = titles.find(t => t.id === s.titleId);
      return title && title.type === 'PAGAR' && title.competence !== selectedCompetence;
    })
    .reduce((acc, s) => acc + s.components.netFinancialAmount, 0);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center space-x-2">
            <Scale className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Conciliação Executiva: DRE (Competência) x Caixa (Realizado)
            </h1>
          </div>
          <p className="text-xs text-slate-700 mt-0.5">
            Compreenda a diferença matemática entre <strong>Lucro Contábil</strong> e <strong>Saldo Financeiro em Banco</strong>.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-xs font-semibold text-slate-700">Mês de Análise:</label>
          <MonthField
            value={selectedCompetence}
            onChange={(e) => setSelectedCompetence(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white"
          />
        </div>
      </div>

      {/* Explanatory Rule Box */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs text-slate-900 dark:text-slate-100 flex items-start space-x-3">
        <Info className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <span className="font-bold text-slate-900 dark:text-slate-100">
            Princípio Contábil Fundamental
          </span>
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            "Lucro não é caixa." A DRE reconhece os direitos e obrigações no momento em que o serviço é prestado ou o custo incorrido (Regime de Competência). 
            O Fluxo de Caixa registra o dinheiro apenas no momento de sua efetiva liquidação bancária.
            A conciliação abaixo mapeia exatamente as pontes e defasagens temporais entre os dois universos.
          </p>
        </div>
      </div>

      {/* Main Dual Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left: DRE Result */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Visão Econômica (DRE - Competência)
            </span>
            <span className="text-[10px] font-mono text-slate-700">{formatCompetence(selectedCompetence)}</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Receita Bruta Faturada na Competência:</span>
              <span className="font-semibold text-slate-900">{formatBRL(grossRevenue)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Custos e Despesas Incorridas:</span>
              <span className="font-semibold text-rose-700">
                - {formatBRL(Math.abs(grossRevenue - netResultDRE))}
              </span>
            </div>
            <div className="flex justify-between py-2 bg-slate-100 p-2 rounded text-slate-900 font-bold text-sm">
              <span>(=) Resultado Líquido do Exercício (Lucro/Prejuízo):</span>
              <span className={netResultDRE >= 0 ? 'text-amber-700' : 'text-rose-700'}>
                {formatBRL(netResultDRE)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Cash Flow Result */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
              Visão Financeira (Caixa Realizado)
            </span>
            <span className="text-[10px] font-mono text-slate-700">{formatCompetence(selectedCompetence)}</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Total de Entradas Efetivas no Banco:</span>
              <span className="font-semibold text-amber-800">
                + {formatBRL(cash.lines[2]?.valuesByMonth[monthIdx] || 0)}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-600">Total de Saídas Efetivas do Banco:</span>
              <span className="font-semibold text-rose-700">
                - {formatBRL(cash.lines[3]?.valuesByMonth[monthIdx] || 0)}
              </span>
            </div>
            <div className="flex justify-between py-2 bg-amber-500/10 p-2 rounded text-slate-900 font-bold text-sm border border-amber-500/20">
              <span>(=) Variação Líquida de Caixa no Mês:</span>
              <span className={cashNetOperating >= 0 ? 'text-amber-800' : 'text-rose-700'}>
                {formatBRL(cashNetOperating)}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Bridges & Reconciliation Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Reconciliação das Diferenças Temporais de Liquidez
          </h2>
          <span className="text-[11px] text-slate-700">Por que o lucro difere do caixa gerado?</span>
        </div>

        <div className="p-5 space-y-3 text-xs">
          
          <div className="flex justify-between items-center py-2 border-b border-slate-200 font-semibold text-slate-900">
            <span>Resultado Líquido do DRE (Ponto de Partida)</span>
            <span className="font-bold text-sm">{formatBRL(netResultDRE)}</span>
          </div>

          <div className="flex justify-between items-center py-1.5 text-rose-700 pl-4 border-b border-slate-100">
            <span>
              (-) Receitas do mês ainda não recebidas em caixa (Clientes a Receber / Em Aberto):
            </span>
            <span className="font-medium">- {formatBRL(uncollectedRevenue)}</span>
          </div>

          <div className="flex justify-between items-center py-1.5 text-slate-800 pl-4 border-b border-slate-100">
            <span>
              (+) Despesas do mês incorridas mas ainda não pagas no caixa (Fornecedores a Pagar):
            </span>
            <span className="font-medium text-amber-800">+ {formatBRL(unpaidExpenses)}</span>
          </div>

          <div className="flex justify-between items-center py-1.5 text-slate-800 pl-4 border-b border-slate-100">
            <span>
              (+) Recebimentos de faturamentos de competências anteriores que entraram agora no caixa:
            </span>
            <span className="font-medium text-amber-800">+ {formatBRL(pastCollectionsInMonth)}</span>
          </div>

          <div className="flex justify-between items-center py-1.5 text-rose-700 pl-4 border-b border-slate-100">
            <span>
              (-) Pagamentos de obrigações de meses anteriores que saíram agora do caixa:
            </span>
            <span className="font-medium">- {formatBRL(pastPaymentsInMonth)}</span>
          </div>

          <div className="flex justify-between items-center py-3 bg-slate-100/70 p-3 rounded-lg font-bold text-slate-900 text-sm mt-2 border border-slate-200">
            <span>(=) Geração Operacional Efetiva de Caixa Calculada:</span>
            <span className="text-amber-800">{formatBRL(cashNetOperating)}</span>
          </div>

        </div>
      </div>

    </div>
  );
};
