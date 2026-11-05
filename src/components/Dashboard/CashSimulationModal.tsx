import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ShieldAlert, 
  Plus, 
  Trash2, 
  Check, 
  Sliders, 
  Sparkles, 
  AlertTriangle, 
  DollarSign, 
  Percent, 
  TrendingDown, 
  Save, 
  RotateCcw,
  CheckCircle2,
  FolderOpen,
  Calendar,
  HelpCircle,
  Users
} from 'lucide-react';
import { 
  SavedCashSimulationScenario, 
  ClientDelinquencySetting, 
  DelinquencyImpactMode, 
  Counterparty,
  Contract,
  FinancialTitle
} from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, parseBRL } from '../../services/financialEngine';
import { PremiumSelect } from '../Common/PremiumSelect';

interface CashSimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCompetenceStr: string; // ex: '2026-09'
  nominalCashBalance: number; // Saldo bancário atual consolidado
  nominalReceivablesThisMonth: number; // Total a receber em aberto no mês
  nominalPayablesThisMonth: number; // Total a pagar em aberto no mês
  onSaved?: () => void;
}

export const CashSimulationModal: React.FC<CashSimulationModalProps> = ({
  isOpen,
  onClose,
  currentCompetenceStr,
  nominalCashBalance,
  nominalReceivablesThisMonth,
  nominalPayablesThisMonth,
  onSaved
}) => {
  const [scenarios, setScenarios] = useState<SavedCashSimulationScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  
  // Estado do cenário sendo editado
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [isScenarioActive, setIsScenarioActive] = useState(true);
  const [clientSettings, setClientSettings] = useState<ClientDelinquencySetting[]>([]);

  // Estado para adicionar novo cliente
  const [selectedClientIdToAdd, setSelectedClientIdToAdd] = useState('');

  // Carregar dados de clientes, contratos e títulos
  const counterparties = useMemo(() => {
    return storage.getCounterparties().filter(c => c.type === 'CLIENTE' || c.type === 'AMBOS');
  }, []);

  const contracts = useMemo(() => {
    return storage.getContracts().filter(c => c.status === 'ATIVO');
  }, []);

  const titles = useMemo(() => {
    return storage.getTitles().filter(t => t.documentState === 'CONFIRMADO' && t.type === 'RECEBER');
  }, []);

  // Recarregar cenários salvos
  useEffect(() => {
    const list = storage.getCashSimulationScenarios();
    setScenarios(list);
    const active = list.find(s => s.isActive) || list[0];
    if (active) {
      loadScenario(active);
    } else {
      createNewScenario();
    }
  }, [isOpen]);

  const loadScenario = (scen: SavedCashSimulationScenario) => {
    setSelectedScenarioId(scen.id);
    setScenarioName(scen.name);
    setScenarioDescription(scen.description || '');
    setIsScenarioActive(scen.isActive);
    setClientSettings([...scen.clientSettings]);
  };

  const createNewScenario = () => {
    const newId = `scen-${Date.now()}`;
    setSelectedScenarioId(newId);
    setScenarioName(`Cenário ${scenarios.length + 1} - Inadimplência Prevista`);
    setScenarioDescription('Simulação preventiva de atrasos de honorários.');
    setIsScenarioActive(true);
    setClientSettings([]);
  };

  // Helper para obter o valor esperado a receber do cliente na competência
  const getClientExpectedReceivable = (clientId: string): number => {
    // 1. Títulos a receber da competência em aberto
    const clientTitlesThisMonth = titles.filter(t => 
      t.counterpartyId === clientId && 
      (t.competence === currentCompetenceStr || t.dueDate.startsWith(currentCompetenceStr)) &&
      t.balancePrincipal > 0
    );
    const sumTitles = clientTitlesThisMonth.reduce((acc, t) => acc + t.balancePrincipal, 0);
    if (sumTitles > 0) return sumTitles;

    // 2. Se não houver títulos ainda, usa o valor mensal do contrato ativo do cliente
    const clientContract = contracts.find(c => c.customerId === clientId);
    if (clientContract) return clientContract.monthlyTotal;

    // 3. Fallback para qualquer título em aberto do cliente
    const allOpenTitles = titles.filter(t => t.counterpartyId === clientId && t.balancePrincipal > 0);
    return allOpenTitles.reduce((acc, t) => acc + t.balancePrincipal, 0) || 1500;
  };

  // Adicionar cliente à lista de inadimplência
  const handleAddClient = () => {
    if (!selectedClientIdToAdd) return;
    const client = counterparties.find(c => c.id === selectedClientIdToAdd);
    if (!client) return;

    if (clientSettings.some(cs => cs.clientId === client.id)) {
      return; // Já está na lista
    }

    const newSetting: ClientDelinquencySetting = {
      clientId: client.id,
      clientName: client.name,
      mode: 'TOTAL',
      percentage: 100,
      notes: ''
    };

    setClientSettings(prev => [...prev, newSetting]);
    setSelectedClientIdToAdd('');
  };

  // Remover cliente
  const handleRemoveClient = (clientId: string) => {
    setClientSettings(prev => prev.filter(cs => cs.clientId !== clientId));
  };

  // Atualizar configuração de um cliente
  const handleUpdateClientSetting = (clientId: string, updates: Partial<ClientDelinquencySetting>) => {
    setClientSettings(prev => prev.map(cs => {
      if (cs.clientId === clientId) {
        return { ...cs, ...updates };
      }
      return cs;
    }));
  };

  // Cálculo da inadimplência calculada para cada cliente e total
  const clientImpacts = useMemo(() => {
    return clientSettings.map(cs => {
      const baseValue = getClientExpectedReceivable(cs.clientId);
      let deduction = 0;

      if (cs.mode === 'TOTAL') {
        deduction = baseValue;
      } else if (cs.mode === 'PERCENTAGE') {
        const pct = cs.percentage ?? 100;
        deduction = (baseValue * pct) / 100;
      } else if (cs.mode === 'FIXED_VALUE') {
        deduction = Math.min(baseValue, cs.fixedAmount ?? baseValue);
      }

      return {
        ...cs,
        baseValue,
        deduction: Math.round(deduction * 100) / 100
      };
    });
  }, [clientSettings, titles, contracts, currentCompetenceStr]);

  const totalSimulatedDelinquency = useMemo(() => {
    return clientImpacts.reduce((sum, item) => sum + item.deduction, 0);
  }, [clientImpacts]);

  // Cálculos do Painel Comparativo de Caixa
  const nominalProjectedFinal = nominalCashBalance + nominalReceivablesThisMonth - nominalPayablesThisMonth;
  const simulatedProjectedFinal = nominalProjectedFinal - totalSimulatedDelinquency;
  const simulatedReceivables = Math.max(0, nominalReceivablesThisMonth - totalSimulatedDelinquency);

  // Salvar Cenário
  const handleSaveScenario = (makeActive: boolean) => {
    if (!scenarioName.trim()) return;

    const scenarioToSave: SavedCashSimulationScenario = {
      id: selectedScenarioId,
      name: scenarioName.trim(),
      description: scenarioDescription.trim(),
      isActive: makeActive,
      clientSettings: clientSettings,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    storage.saveOrUpdateCashSimulationScenario(scenarioToSave);
    const updatedList = storage.getCashSimulationScenarios();
    setScenarios(updatedList);
    onSaved?.();
    onClose();
  };

  // Excluir Cenário
  const handleDeleteScenario = (id: string) => {
    if (scenarios.length <= 1) {
      alert('Não é possível excluir o único cenário existente. Você pode apenas editar os clientes.');
      return;
    }
    if (confirm('Tem certeza que deseja excluir esta visualização salva de cenário simulado?')) {
      storage.deleteCashSimulationScenario(id);
      const updatedList = storage.getCashSimulationScenarios();
      setScenarios(updatedList);
      if (updatedList[0]) {
        loadScenario(updatedList[0]);
      }
      onSaved?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100"
        onClick={e => e.stopPropagation()}
      >
        {/* Topo do Modal */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-amber-500/15 rounded-xl border border-amber-500/30 text-amber-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                  Simulação de Caixa Líquido com Inadimplências Esperadas
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {currentCompetenceStr}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Projeção preventiva de liquidez mensal descontando clientes que costumam atrasar pagamentos.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Gerenciamento de Cenários Salvos */}
        <div className="px-6 py-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-medium flex items-center">
              <FolderOpen className="w-3.5 h-3.5 mr-1 text-amber-400" />
              Cenários Salvos:
            </span>
            <PremiumSelect
              value={selectedScenarioId}
              onChange={e => {
                const found = scenarios.find(s => s.id === e.target.value);
                if (found) loadScenario(found);
              }}
              className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5 focus:border-amber-500 outline-hidden font-semibold"
            >
              {scenarios.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isActive ? '(ATIVO NO DASHBOARD)' : ''}
                </option>
              ))}
            </PremiumSelect>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={createNewScenario}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 font-semibold flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              Novo Cenário
            </button>

            {scenarios.length > 1 && (
              <button
                onClick={() => handleDeleteScenario(selectedScenarioId)}
                className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg border border-rose-500/30 font-semibold flex items-center gap-1 transition-colors"
                title="Excluir este cenário salvo"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Cenário
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo Principal com Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Identificação do Cenário */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Nome da Visualização Salva
              </label>
              <input
                type="text"
                value={scenarioName}
                onChange={e => setScenarioName(e.target.value)}
                placeholder="Ex: Cenário Conservador Médicos e Transportes"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:border-amber-500 outline-hidden font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Status no Dashboard
              </label>
              <button
                type="button"
                onClick={() => setIsScenarioActive(!isScenarioActive)}
                className={`w-full py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                  isScenarioActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${isScenarioActive ? 'text-amber-400' : 'text-slate-500'}`} />
                <span>{isScenarioActive ? 'Ativo no Dashboard' : 'Inativo (Apenas Salvo)'}</span>
              </button>
            </div>
          </div>

          {/* Painel de Impacto Comparativo em Tempo Real */}
          <div className="bg-slate-950/80 rounded-xl border border-amber-500/30 p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Comparativo de Caixa: Contratual vs. Caixa Líquido Real Confiável
                </h3>
              </div>
              <span className="text-[11px] text-amber-300 font-medium">
                {clientSettings.length} clientes em simulação
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Saldo Atual */}
              <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Disponibilidade Atual</div>
                <div className="text-base font-mono font-bold text-slate-100">
                  {formatBRL(nominalCashBalance)}
                </div>
                <div className="text-[10px] text-slate-500">Saldo em bancos hoje</div>
              </div>

              {/* Saldo Nominal Projetado */}
              <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Saldo Projetado Nominal</div>
                <div className="text-base font-mono font-bold text-slate-300">
                  {formatBRL(nominalProjectedFinal)}
                </div>
                <div className="text-[10px] text-slate-500">Receber ({formatBRL(nominalReceivablesThisMonth)}) - Pagar ({formatBRL(nominalPayablesThisMonth)})</div>
              </div>

              {/* Inadimplência Prevista */}
              <div className="p-3 bg-rose-950/30 rounded-lg border border-rose-500/40 space-y-1">
                <div className="text-[10px] text-rose-300 uppercase font-semibold flex items-center justify-between">
                  <span>(-) Inadimplência Prevista</span>
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-base font-mono font-bold text-rose-400">
                  -{formatBRL(totalSimulatedDelinquency)}
                </div>
                <div className="text-[10px] text-rose-300/80">Retenção de honorários esperada</div>
              </div>

              {/* Saldo Previsto Confiável */}
              <div className="p-3 bg-amber-950/30 rounded-lg border border-amber-500/60 space-y-1">
                <div className="text-[10px] text-amber-300 uppercase font-bold flex items-center justify-between">
                  <span>(=) Caixa Líquido Real</span>
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-lg font-mono font-extrabold text-amber-300">
                  {formatBRL(simulatedProjectedFinal)}
                </div>
                <div className="text-[10px] text-amber-300/80 font-medium">
                  Valor que você pode realmente contar
                </div>
              </div>
            </div>
          </div>

          {/* Seção de Clientes que Costumam Atrasar */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center">
                  <Users className="w-4 h-4 mr-1.5 text-amber-400" />
                  Clientes com Previsão de Inadimplência / Atraso
                </h3>
                <p className="text-[11px] text-slate-400">
                  Selecione os clientes que costumam atrasar e escolha se deseja abater o valor total ou uma porcentagem do honorário.
                </p>
              </div>

              {/* Seletor para Adicionar Cliente */}
              <div className="flex items-center space-x-2">
                <PremiumSelect
                  value={selectedClientIdToAdd}
                  onChange={e => setSelectedClientIdToAdd(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded-lg px-3 py-1.5 text-xs focus:border-amber-500 outline-hidden max-w-xs"
                >
                  <option value="">-- Selecionar cliente para adicionar --</option>
                  {counterparties
                    .filter(c => !clientSettings.some(cs => cs.clientId === c.id))
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({formatBRL(getClientExpectedReceivable(c.id))})
                      </option>
                    ))}
                </PremiumSelect>

                <button
                  type="button"
                  onClick={handleAddClient}
                  disabled={!selectedClientIdToAdd}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-lg flex items-center space-x-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Adicionar</span>
                </button>
              </div>
            </div>

            {/* Lista dos Clientes Adicionados no Cenário */}
            {clientImpacts.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-dashed border-slate-800 text-slate-400 space-y-2">
                <AlertTriangle className="w-8 h-8 mx-auto text-slate-600" />
                <div className="font-semibold text-slate-300">Nenhum cliente configurado neste cenário</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Selecione um cliente no campo acima para simular o abatimento total ou parcial do honorário mensal.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {clientImpacts.map(item => (
                  <div 
                    key={item.clientId}
                    className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold text-slate-100">{item.clientName}</div>
                        <div className="text-xs text-slate-400">
                          Honorário / Faturamento Previsto no Mês: <strong className="text-slate-200 font-mono">{formatBRL(item.baseValue)}</strong>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <div className="text-[10px] text-rose-300 uppercase font-semibold">Abatimento Simulado</div>
                          <div className="text-sm font-mono font-bold text-rose-400">
                            -{formatBRL(item.deduction)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveClient(item.clientId)}
                          className="p-1.5 bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 transition-colors"
                          title="Remover cliente da simulação"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Controles de Modo: Total vs Porcentagem vs Valor Fixo */}
                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80 text-xs">
                      <span className="text-slate-400 font-semibold">Tipo de Atraso Previsto:</span>

                      <div className="flex items-center space-x-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                        <button
                          type="button"
                          onClick={() => handleUpdateClientSetting(item.clientId, { mode: 'TOTAL' })}
                          className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                            item.mode === 'TOTAL'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Valor Total (100%)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateClientSetting(item.clientId, { mode: 'PERCENTAGE', percentage: item.percentage || 50 })}
                          className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                            item.mode === 'PERCENTAGE'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Porcentagem (%)
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateClientSetting(item.clientId, { mode: 'FIXED_VALUE', fixedAmount: item.fixedAmount || (item.baseValue / 2) })}
                          className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                            item.mode === 'FIXED_VALUE'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Valor Fixo (R$)
                        </button>
                      </div>

                      {/* Configuração de Porcentagem */}
                      {item.mode === 'PERCENTAGE' && (
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={item.percentage ?? 50}
                            onChange={e => handleUpdateClientSetting(item.clientId, { percentage: Number(e.target.value) })}
                            className="w-16 bg-slate-900 border border-slate-700 text-slate-100 rounded px-2 py-1 font-mono text-center font-bold focus:border-amber-500 outline-hidden"
                          />
                          <span className="text-slate-400 font-bold">%</span>

                          <div className="flex items-center space-x-1">
                            {[25, 50, 75].map(pct => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => handleUpdateClientSetting(item.clientId, { percentage: pct })}
                                className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-[10px] font-mono text-slate-300"
                              >
                                {pct}%
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Configuração de Valor Fixo */}
                      {item.mode === 'FIXED_VALUE' && (
                        <div className="flex items-center space-x-1.5">
                          <span className="text-slate-400 font-mono text-xs">R$</span>
                          <input
                            type="number"
                            min={0}
                            max={item.baseValue}
                            value={item.fixedAmount ?? (item.baseValue / 2)}
                            onChange={e => handleUpdateClientSetting(item.clientId, { fixedAmount: Number(e.target.value) })}
                            className="w-24 bg-slate-900 border border-slate-700 text-slate-100 rounded px-2 py-1 font-mono font-bold focus:border-amber-500 outline-hidden"
                          />
                        </div>
                      )}

                      {/* Anotação opcional */}
                      <input
                        type="text"
                        value={item.notes || ''}
                        onChange={e => handleUpdateClientSetting(item.clientId, { notes: e.target.value })}
                        placeholder="Motivo / previsão de atraso (ex: paga após dia 25)"
                        className="flex-1 min-w-[200px] bg-slate-900/60 border border-slate-800 rounded px-2.5 py-1 text-slate-300 placeholder:text-slate-600 focus:border-amber-500 outline-hidden text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé com Ações de Salvamento */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center text-slate-400 text-xs">
            <Sparkles className="w-4 h-4 mr-1.5 text-amber-400" />
            <span>As simulações são salvas localmente e permanecem sempre disponíveis para você consultar e alterar.</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition-colors"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={() => handleSaveScenario(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 font-bold rounded-lg transition-colors flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Visualização</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveScenario(true)}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded-lg shadow-md transition-colors flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Salvar & Ativar no Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
