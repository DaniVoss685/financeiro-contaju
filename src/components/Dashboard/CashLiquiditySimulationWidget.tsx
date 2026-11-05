import React, { useState, useMemo } from 'react';
import { 
  Sliders, 
  Sparkles, 
  TrendingDown, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  DollarSign, 
  Percent, 
  Users, 
  Eye, 
  EyeOff, 
  HelpCircle,
  Clock,
  Layers,
  Check,
  ExternalLink,
  Info
} from 'lucide-react';
import { 
  SavedCashSimulationScenario, 
  ClientDelinquencySetting, 
  FinancialTitle, 
  Contract, 
  Counterparty 
} from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL } from '../../services/financialEngine';
import { CashSimulationModal } from './CashSimulationModal';
import { TitlesCompositionModal } from './TitlesCompositionModal';
import { PremiumSelect } from '../Common/PremiumSelect';
import { Card, Button, TabPills } from '../Common/ui';

interface CashLiquiditySimulationWidgetProps {
  currentCompetenceStr: string; // ex: '2026-10'
  nominalCashBalance: number;
  allReceivables: FinancialTitle[];
  allPayables: FinancialTitle[];
  contracts: Contract[];
  counterparties: Counterparty[];
  onSelectTitle?: (title: FinancialTitle) => void;
  onOpenStressTesting?: () => void;
}

export const CashLiquiditySimulationWidget: React.FC<CashLiquiditySimulationWidgetProps> = ({
  currentCompetenceStr,
  nominalCashBalance = 0,
  allReceivables = [],
  allPayables = [],
  contracts = [],
  counterparties = [],
  onSelectTitle,
  onOpenStressTesting
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modo de filtro de data para a projeção de liquidez:
  // 'DUE_DATE' = Por Vencimento no Mês (Fluxo Real de Caixa) [Padrão e Recomendado]
  // 'COMPETENCE' = Por Competência do Mês
  // 'BOTH' = Ambos (Acumulado)
  const [dateFilterMode, setDateFilterMode] = useState<'DUE_DATE' | 'COMPETENCE' | 'BOTH'>('DUE_DATE');

  // Modal de Composição Detalhada
  const [compositionModalConfig, setCompositionModalConfig] = useState<{
    isOpen: boolean;
    type: 'RECEBER' | 'PAGAR';
  } | null>(null);

  // Cenários do storage
  const scenarios = useMemo(() => {
    return storage.getCashSimulationScenarios() || [];
  }, [refreshKey]);

  const activeScenario = useMemo(() => {
    return (scenarios || []).find(s => s.isActive) || (scenarios || [])[0] || null;
  }, [scenarios]);

  const [isSimulationEnabled, setIsSimulationEnabled] = useState(true);
  const [showClientDetails, setShowClientDetails] = useState(false);

  // Títulos a Receber do período com base no critério selecionado
  const receivablesTitlesThisMonth = useMemo(() => {
    return (allReceivables || []).filter(t => {
      if (!t || t.documentState !== 'CONFIRMADO') return false;
      const isDue = t.dueDate && t.dueDate.startsWith(currentCompetenceStr);
      const isComp = t.competence && t.competence.startsWith(currentCompetenceStr);
      if (dateFilterMode === 'DUE_DATE') return isDue;
      if (dateFilterMode === 'COMPETENCE') return isComp;
      return isDue || isComp;
    });
  }, [allReceivables, currentCompetenceStr, dateFilterMode]);

  // Títulos a Pagar do período com base no critério selecionado
  const payablesTitlesThisMonth = useMemo(() => {
    return (allPayables || []).filter(t => {
      if (!t || t.documentState !== 'CONFIRMADO') return false;
      const isDue = t.dueDate && t.dueDate.startsWith(currentCompetenceStr);
      const isComp = t.competence && t.competence.startsWith(currentCompetenceStr);
      if (dateFilterMode === 'DUE_DATE') return isDue;
      if (dateFilterMode === 'COMPETENCE') return isComp;
      return isDue || isComp;
    });
  }, [allPayables, currentCompetenceStr, dateFilterMode]);

  // Títulos em aberto para a soma
  const openReceivablesTitles = useMemo(() => {
    return receivablesTitlesThisMonth.filter(t => (t.balancePrincipal || 0) > 0);
  }, [receivablesTitlesThisMonth]);

  const openPayablesTitles = useMemo(() => {
    return payablesTitlesThisMonth.filter(t => (t.balancePrincipal || 0) > 0);
  }, [payablesTitlesThisMonth]);

  const openReceivablesThisMonth = useMemo(() => {
    return Math.round(openReceivablesTitles.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0) * 100) / 100;
  }, [openReceivablesTitles]);

  const openPayablesThisMonth = useMemo(() => {
    return Math.round(openPayablesTitles.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0) * 100) / 100;
  }, [openPayablesTitles]);

  // Selecionar outro cenário ativo
  const handleSelectScenario = (id: string) => {
    storage.setActiveCashSimulationScenario(id);
    setRefreshKey(k => k + 1);
  };

  // Helper para obter o honorário base do cliente no mês
  const getClientExpectedBase = (clientId: string): number => {
    const clientTitles = openReceivablesTitles.filter(t => t.counterpartyId === clientId);
    const sumTitles = clientTitles.reduce((acc, t) => acc + (t.balancePrincipal || 0), 0);
    if (sumTitles > 0) return sumTitles;

    const clientContract = (contracts || []).find(c => c && c.customerId === clientId);
    if (clientContract) return clientContract.monthlyTotal || 0;

    return 1500;
  };

  // Cálculo das deduções por cliente
  const clientDeductions = useMemo(() => {
    if (!activeScenario || !isSimulationEnabled) return [];
    const clientSettings = Array.isArray(activeScenario.clientSettings) ? activeScenario.clientSettings : [];

    return clientSettings.map(cs => {
      const baseValue = getClientExpectedBase(cs.clientId);
      let deduction = 0;

      if (cs.mode === 'TOTAL') {
        deduction = baseValue;
      } else if (cs.mode === 'PERCENTAGE') {
        deduction = (baseValue * (cs.percentage ?? 100)) / 100;
      } else if (cs.mode === 'FIXED_VALUE') {
        deduction = Math.min(baseValue, cs.fixedAmount ?? baseValue);
      }

      return {
        ...cs,
        baseValue,
        deduction: Math.round(deduction * 100) / 100
      };
    });
  }, [activeScenario, isSimulationEnabled, openReceivablesTitles, contracts]);

  const totalExpectedDelinquency = useMemo(() => {
    return clientDeductions.reduce((sum, item) => sum + (item.deduction || 0), 0);
  }, [clientDeductions]);

  // Totais do Nível 1: Nominal
  const nominalProjectedFinal = Math.round((nominalCashBalance + openReceivablesThisMonth - openPayablesThisMonth) * 100) / 100;

  // Totais do Nível 2: Previsto com Inadimplência
  const reliableNetCash = Math.round((nominalProjectedFinal - (isSimulationEnabled ? totalExpectedDelinquency : 0)) * 100) / 100;
  const adjustedReceivables = Math.max(0, Math.round((openReceivablesThisMonth - (isSimulationEnabled ? totalExpectedDelinquency : 0)) * 100) / 100);

  return (
    <Card padded={false} className="overflow-hidden">
      {/* Topo: título e controles do cenário */}
      <div className="p-5 sm:p-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3>Projeção de caixa do mês</h3>
            <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[var(--surface-elevated)] text-xs text-[var(--text-secondary)]">
              <span className={`w-1.5 h-1.5 rounded-full ${isSimulationEnabled ? 'bg-[var(--brand-gold-fill)]' : 'bg-[var(--text-tertiary)]'}`} />
              {isSimulationEnabled ? 'Simulação ativa' : 'Visão nominal'}
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Saldo projetado pelo contrato versus saldo previsto com os atrasos esperados dos clientes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {scenarios.length > 0 && (
            <PremiumSelect
              value={activeScenario?.id || ''}
              onChange={e => handleSelectScenario(e.target.value)}
              sheetTitle="Cenário"
              className="h-10 w-56 px-3 text-sm"
            >
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </PremiumSelect>
          )}

          <Button
            variant="secondary"
            onClick={() => setIsSimulationEnabled(!isSimulationEnabled)}
            icon={isSimulationEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            title={isSimulationEnabled ? 'Desativar a simulação e ver os valores nominais' : 'Ativar a simulação de inadimplência'}
          >
            {isSimulationEnabled ? 'Simulação ligada' : 'Ver nominal (100%)'}
          </Button>

          <Button variant="secondary" onClick={() => setIsModalOpen(true)} icon={<Sliders className="w-4 h-4" />}>
            Personalizar
          </Button>

          {onOpenStressTesting && (
            <Button
              variant="ghost"
              onClick={onOpenStressTesting}
              title="Abrir o simulador de estresse e churn para os próximos 180 dias"
            >
              Estresse 180 dias
            </Button>
          )}
        </div>
      </div>

      {/* Critério de data */}
      <div className="px-5 sm:px-6 py-3.5 border-y border-[var(--border-subtle)] bg-[var(--surface-base)] flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-secondary)]">
          Competência <span className="font-medium text-[var(--text-primary)] tabular-nums">{currentCompetenceStr.split('-').reverse().join('/')}</span>
          <span className="text-[var(--text-muted)]">
            {' '}
            •{' '}
            {dateFilterMode === 'DUE_DATE' && 'por vencimento no mês (fluxo real de caixa)'}
            {dateFilterMode === 'COMPETENCE' && 'por competência faturada'}
            {dateFilterMode === 'BOTH' && 'vencimento e competência acumulados'}
          </span>
        </p>
        <TabPills
          tabs={[
            { id: 'DUE_DATE', label: 'Vencimento' },
            { id: 'COMPETENCE', label: 'Competência' },
            { id: 'BOTH', label: 'Ambos' }
          ]}
          value={dateFilterMode}
          onChange={id => setDateFilterMode(id as any)}
        />
      </div>

      <div className="p-5 sm:p-6 space-y-8">
        {/* 1. Saldo contratual */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[15px] font-semibold">Saldo contratual do mês</h4>
            <span className="text-sm text-[var(--text-muted)]">Considerando que todos os clientes pagam em dia</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--text-secondary)]">Disponibilidade atual</p>
              <p className="mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums">{formatBRL(nominalCashBalance)}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Saldo consolidado nos bancos hoje</p>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-[var(--text-secondary)]">A receber no mês</p>
                <span className="text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap">{openReceivablesTitles.length} títulos</span>
              </div>
              <p className="mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums text-[var(--status-success)]">
                +{formatBRL(openReceivablesThisMonth)}
              </p>
              <button
                type="button"
                onClick={() => setCompositionModalConfig({ isOpen: true, type: 'RECEBER' })}
                className="mt-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                title="Ver quais títulos compõem este valor"
              >
                Ver composição
              </button>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-[var(--text-secondary)]">A pagar no mês</p>
                <span className="text-xs text-[var(--text-muted)] tabular-nums whitespace-nowrap">{openPayablesTitles.length} títulos</span>
              </div>
              <p className="mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums text-[var(--status-danger)]">
                -{formatBRL(openPayablesThisMonth)}
              </p>
              <button
                type="button"
                onClick={() => setCompositionModalConfig({ isOpen: true, type: 'PAGAR' })}
                className="mt-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                title="Ver quais contas compõem este valor"
              >
                Ver composição
              </button>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-base)]">
              <p className="text-sm text-[var(--text-secondary)]">Saldo final projetado</p>
              <p className={`mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums ${nominalProjectedFinal < 0 ? 'text-[var(--status-danger)]' : ''}`}>
                {formatBRL(nominalProjectedFinal)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Resultado teórico do contrato</p>
            </div>
          </div>
        </section>

        {/* 2. Com inadimplência esperada */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-[15px] font-semibold">Com a inadimplência esperada</h4>
            {clientDeductions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClientDetails(!showClientDetails)}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
              >
                {showClientDetails ? 'Ocultar clientes' : `Ver ${clientDeductions.length} cliente(s) na simulação`}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl border border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--text-secondary)]">Inadimplência prevista</p>
              <p className={`mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums ${isSimulationEnabled && totalExpectedDelinquency > 0 ? 'text-[var(--status-danger)]' : ''}`}>
                {isSimulationEnabled ? `-${formatBRL(totalExpectedDelinquency)}` : 'R$ 0,00'}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {isSimulationEnabled ? `${clientDeductions.length} cliente(s) com atraso estimado` : 'Simulação desligada'}
              </p>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--border-subtle)]">
              <p className="text-sm text-[var(--text-secondary)]">Recebíveis confiáveis</p>
              <p className="mt-2 text-[22px] leading-7 font-semibold tracking-tight tabular-nums">{formatBRL(adjustedReceivables)}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">A receber descontado o risco</p>
            </div>

            <div className="p-5 rounded-2xl border border-[var(--brand-gold-fill)] ring-1 ring-[var(--brand-gold-fill)] bg-[var(--surface-card)]">
              <p className="text-sm font-medium text-[var(--text-primary)]">Caixa líquido real</p>
              <p className={`mt-2 text-[26px] leading-8 font-semibold tracking-tight tabular-nums ${reliableNetCash < 0 ? 'text-[var(--status-danger)]' : ''}`}>
                {formatBRL(reliableNetCash)}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)] flex items-center justify-between gap-2">
                <span>Saldo seguro para planejar</span>
                <span className={reliableNetCash >= openPayablesThisMonth ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'}>
                  {reliableNetCash >= openPayablesThisMonth ? 'Cobre as contas do mês' : 'Atenção ao caixa'}
                </span>
              </p>
            </div>
          </div>

          {showClientDetails && clientDeductions.length > 0 && (
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-[var(--text-secondary)]">Clientes com atraso previsto neste cenário</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline underline-offset-2 cursor-pointer"
                >
                  Alterar clientes e porcentagens
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {clientDeductions.map(c => (
                  <div key={c.clientId} className="p-4 rounded-xl border border-[var(--border-subtle)] space-y-1.5">
                    <div className="text-sm font-medium truncate" title={c.clientName}>
                      {c.clientName}
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] tabular-nums">
                      <span>Honorário {formatBRL(c.baseValue)}</span>
                      <span className="text-[var(--status-danger)]">-{formatBRL(c.deduction)}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] flex items-center justify-between gap-2">
                      <span>{c.mode === 'TOTAL' ? 'Abatimento total (100%)' : c.mode === 'PERCENTAGE' ? `Abatimento de ${c.percentage}%` : 'Valor fixo'}</span>
                      {c.notes && <span className="italic truncate max-w-[120px]" title={c.notes}>{c.notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Modal de Configuração Completa da Simulação */}
      {isModalOpen && (
        <CashSimulationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          currentCompetenceStr={currentCompetenceStr}
          nominalCashBalance={nominalCashBalance}
          nominalReceivablesThisMonth={openReceivablesThisMonth}
          nominalPayablesThisMonth={openPayablesThisMonth}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* Modal de Composição Detalhada dos Títulos a Receber/Pagar */}
      {compositionModalConfig && compositionModalConfig.isOpen && (
        <TitlesCompositionModal
          isOpen={compositionModalConfig.isOpen}
          onClose={() => setCompositionModalConfig(null)}
          type={compositionModalConfig.type}
          periodStr={currentCompetenceStr}
          allTitles={compositionModalConfig.type === 'RECEBER' ? allReceivables : allPayables}
          counterparties={counterparties}
          onSelectTitle={(t) => {
            setCompositionModalConfig(null);
            if (onSelectTitle) onSelectTitle(t);
          }}
          initialFilterMode={dateFilterMode}
        />
      )}
    </Card>
  );
};
