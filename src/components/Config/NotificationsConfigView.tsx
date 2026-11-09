import React, { useState, useMemo } from 'react';
import { 
  Bell, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  FileText, 
  TrendingDown, 
  CheckCheck, 
  Save, 
  RefreshCw, 
  Sliders, 
  ArrowRight,
  ShieldAlert,
  Info,
  ExternalLink,
  Monitor,
  Smartphone,
  Sparkles
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { NotificationService } from '../../services/notificationService';
import { NavigationScreen } from '../Sidebar';
import { PremiumSelect } from '../Common/PremiumSelect';

interface NotificationPreferences {
  contractAlertDays: number;
  alertPayablesToday: boolean;
  alertPayablesOverdue: boolean;
  alertPendingReconciliation: boolean;
  notifyInAppBanner: boolean;
  notifySound: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  contractAlertDays: 30,
  alertPayablesToday: true,
  alertPayablesOverdue: true,
  alertPendingReconciliation: true,
  notifyInAppBanner: true,
  notifySound: false
};

interface NotificationsConfigViewProps {
  onNavigate?: (screen: NavigationScreen) => void;
}

export const NotificationsConfigView: React.FC<NotificationsConfigViewProps> = ({ onNavigate }) => {
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    try {
      const saved = localStorage.getItem('contaju_notification_preferences');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_PREFERENCES;
  });

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CONTRATOS' | 'PAGAR' | 'CONCILIACAO'>('ALL');
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() => NotificationService.getPermission());
  const [isPushEnabled, setIsPushEnabled] = useState<boolean>(() => NotificationService.isEnabledByUser());
  const [testNotificationFeedback, setTestNotificationFeedback] = useState<string | null>(null);

  const handleRequestPush = async () => {
    const res = await NotificationService.requestPermission();
    setPushPermission(res);
    setIsPushEnabled(res === 'granted');
    if (res === 'granted') {
      setTestNotificationFeedback('Notificações ativadas no seu dispositivo com sucesso!');
      setTimeout(() => setTestNotificationFeedback(null), 4000);
    }
  };

  const handleTestPushToday = async () => {
    setTestNotificationFeedback('Verificando contas e enviando notificação nativa...');
    const res = await NotificationService.checkAndNotifyDueToday(true);
    if (res.notified) {
      setTestNotificationFeedback(`Notificação enviada com sucesso! (${res.payablesCount} a pagar, ${res.receivablesCount} a receber hoje)`);
    } else {
      // Se não houver contas hoje, envia notificação de exemplo
      await NotificationService.showNotification('ContaJu: Teste de Notificação Nativa', {
        body: 'Seu sistema está pronto para alertar sobre contas a pagar e receber vencendo no dia!',
        tag: 'contaju-test-manual'
      });
      setTestNotificationFeedback('Notificação de teste disparada com sucesso!');
    }
    setTimeout(() => setTestNotificationFeedback(null), 5000);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDate = new Date();

  // 1. Contratos com Vencimento Próximo
  const expiringContracts = useMemo(() => {
    const contracts = storage.getContracts().filter(c => c.status === 'ATIVO');
    const counterparties = storage.getCounterparties();
    const thresholdDays = preferences.contractAlertDays;

    return contracts
      .filter(contract => {
        if (!contract.endDate) return false;
        const endDate = new Date(contract.endDate);
        const diffMs = endDate.getTime() - todayDate.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= thresholdDays;
      })
      .map(contract => {
        const client = counterparties.find(cp => cp.id === contract.customerId || cp.id === (contract as any).clientId);
        const endDate = new Date(contract.endDate!);
        const diffDays = Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          ...contract,
          clientName: client?.name || 'Cliente não identificado',
          clientDoc: client?.document || '',
          daysRemaining: diffDays
        };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [preferences.contractAlertDays, todayDate]);

  // 2. Contas a Pagar Vencendo Hoje
  const payablesDueToday = useMemo(() => {
    const titles = storage.getTitles();
    const counterparties = storage.getCounterparties();

    return titles
      .filter(t => t.type === 'PAGAR' && t.balancePrincipal > 0 && t.dueDate === todayStr)
      .map(t => {
        const supplier = counterparties.find(cp => cp.id === t.counterpartyId);
        return {
          ...t,
          supplierName: supplier?.name || 'Fornecedor não identificado'
        };
      });
  }, [todayStr]);

  // 3. Contas a Pagar já Vencidas (Atrasadas)
  const payablesOverdue = useMemo(() => {
    const titles = storage.getTitles();
    const counterparties = storage.getCounterparties();

    return titles
      .filter(t => t.type === 'PAGAR' && t.balancePrincipal > 0 && t.dueDate < todayStr)
      .map(t => {
        const supplier = counterparties.find(cp => cp.id === t.counterpartyId);
        const due = new Date(t.dueDate);
        const diffDays = Math.floor((todayDate.getTime() - due.getTime()) / (1000 * 3600 * 24));
        return {
          ...t,
          supplierName: supplier?.name || 'Fornecedor não identificado',
          daysLate: diffDays
        };
      })
      .sort((a, b) => b.daysLate - a.daysLate);
  }, [todayStr, todayDate]);

  // 4. Pendências na Conciliação Bancária
  const pendingReconciliations = useMemo(() => {
    const entries = storage.getStatementEntries();
    const bankAccounts = storage.getBankAccounts();

    return entries
      .filter(e => e.reconciliationStatus === 'PENDENTE' || e.reconciliationStatus === 'SUGESTAO')
      .map(e => {
        const acc = bankAccounts.find(b => b.id === e.bankAccountId);
        return {
          ...e,
          bankName: acc?.name || 'Conta Bancária'
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, []);

  const totalActiveAlerts = 
    expiringContracts.length + 
    payablesDueToday.length + 
    (preferences.alertPayablesOverdue ? payablesOverdue.length : 0) + 
    pendingReconciliations.length;

  const handleSavePreferences = () => {
    localStorage.setItem('contaju_notification_preferences', JSON.stringify(preferences));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Central de Notificações & Alertas Operacionais
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Monitoramento proativo de contratos a vencer, contas a pagar no dia e pendências de conciliação.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {savedSuccess && (
            <span className="text-xs font-semibold text-emerald-400 flex items-center bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/30 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              Preferências salvas!
            </span>
          )}
          <button
            onClick={handleSavePreferences}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-colors flex items-center shadow-xs"
          >
            <Save className="w-4 h-4 mr-1.5" />
            Salvar Regras de Notificação
          </button>
        </div>
      </div>

      {/* KPI Cards de Alertas Ativos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Contratos a Vencer */}
        <div 
          onClick={() => setActiveFilter('CONTRATOS')}
          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-xs ${
            activeFilter === 'CONTRATOS' 
              ? 'border-amber-500 bg-amber-500/[0.10]' 
              : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase">
            <span>Contratos Próximos</span>
            <FileText className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-[var(--text-primary)]">
            {expiringContracts.length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            Vencendo em até {preferences.contractAlertDays} dias
          </span>
        </div>

        {/* Card 2: Contas a Pagar Vencendo Hoje */}
        <div 
          onClick={() => setActiveFilter('PAGAR')}
          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-xs ${
            activeFilter === 'PAGAR' 
              ? 'border-amber-500 bg-amber-500/[0.10]' 
              : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-400 font-bold uppercase">
            <span>A Pagar Hoje</span>
            <Calendar className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-amber-300">
            {payablesDueToday.length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            Total: {formatBRL(payablesDueToday.reduce((acc, t) => acc + t.balancePrincipal, 0))}
          </span>
        </div>

        {/* Card 3: Contas a Pagar Atrasadas */}
        <div 
          onClick={() => setActiveFilter('PAGAR')}
          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-xs ${
            activeFilter === 'PAGAR' 
              ? 'border-rose-500 bg-rose-500/[0.10]' 
              : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-rose-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-rose-400 font-bold uppercase">
            <span>A Pagar Vencidas</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-400">
            {payablesOverdue.length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            Total em atraso: {formatBRL(payablesOverdue.reduce((acc, t) => acc + t.balancePrincipal, 0))}
          </span>
        </div>

        {/* Card 4: Pendências de Conciliação */}
        <div 
          onClick={() => setActiveFilter('CONCILIACAO')}
          className={`p-4 rounded-xl border transition-all cursor-pointer shadow-xs ${
            activeFilter === 'CONCILIACAO' 
              ? 'border-emerald-500 bg-emerald-500/[0.10]' 
              : 'border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-emerald-400 font-bold uppercase">
            <span>Conciliação Bancária</span>
            <CheckCheck className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-300">
            {pendingReconciliations.length}
          </div>
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            Extratos sem conferência contábil
          </span>
        </div>

      </div>

      {/* Grid: 2 Colunas (Configurações de Regras à esquerda, Lista Ativa de Alertas à direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Painel de Configuração de Parâmetros */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs space-y-5">
            <div className="flex items-center space-x-2 border-b border-[var(--border-subtle)] pb-3">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Parâmetros e Gatilhos
              </h2>
            </div>

            {/* 1. Antecedência de Contratos */}
            <div>
              <label className="text-xs font-semibold text-[var(--text-primary)] block">
                Antecedência para Alerta de Contratos
              </label>
              <p className="text-[11px] text-[var(--text-secondary)] mb-2">
                Avisar com antecedência antes do término da vigência para renegociação ou renovação.
              </p>
              <PremiumSelect
                value={preferences.contractAlertDays}
                onChange={e => setPreferences(prev => ({ ...prev, contractAlertDays: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-[var(--surface-elevated)] border border-[var(--border-subtle)] rounded-xl text-xs font-medium text-[var(--text-primary)] focus:outline-hidden focus:border-amber-400"
              >
                <option value={15}>15 dias de antecedência</option>
                <option value={30}>30 dias de antecedência (Recomendado)</option>
                <option value={45}>45 dias de antecedência</option>
                <option value={60}>60 dias de antecedência</option>
                <option value={90}>90 dias de antecedência</option>
              </PremiumSelect>
            </div>

            {/* 2. Toggles de Regras */}
            <div className="space-y-3 pt-2 border-t border-[var(--border-subtle)]">
              <label className="text-xs font-semibold text-[var(--text-primary)] block">
                Alertas Ativos no Sistema
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-elevated)]/80 cursor-pointer border border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-primary)] font-medium">
                  Contas a pagar vencendo hoje
                </span>
                <input
                  type="checkbox"
                  checked={preferences.alertPayablesToday}
                  onChange={e => setPreferences(prev => ({ ...prev, alertPayablesToday: e.target.checked }))}
                  className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-elevated)]/80 cursor-pointer border border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-primary)] font-medium">
                  Contas a pagar em atraso (inadimplência)
                </span>
                <input
                  type="checkbox"
                  checked={preferences.alertPayablesOverdue}
                  onChange={e => setPreferences(prev => ({ ...prev, alertPayablesOverdue: e.target.checked }))}
                  className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-elevated)]/80 cursor-pointer border border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-primary)] font-medium">
                  Pendências de conciliação bancária
                </span>
                <input
                  type="checkbox"
                  checked={preferences.alertPendingReconciliation}
                  onChange={e => setPreferences(prev => ({ ...prev, alertPendingReconciliation: e.target.checked }))}
                  className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--surface-elevated)]/80 cursor-pointer border border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-primary)] font-medium">
                  Exibir indicador no menu superior
                </span>
                <input
                  type="checkbox"
                  checked={preferences.notifyInAppBanner}
                  onChange={e => setPreferences(prev => ({ ...prev, notifyInAppBanner: e.target.checked }))}
                  className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSavePreferences}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-colors flex items-center justify-center shadow-xs"
              >
                <Save className="w-4 h-4 mr-1.5" />
                Gravar Preferências
              </button>
            </div>

          </div>

          {/* Card de Notificações Push Nativas no Dispositivo / Computador */}
          <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-xs space-y-4">
            <div className="flex items-center space-x-2 border-b border-[var(--border-subtle)] pb-3">
              <Bell className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Notificações Nativas no Dispositivo
              </h2>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Receba alertas do sistema operacional no seu computador ou celular sobre contas a pagar e a receber que vencem no dia, sem depender de e-mail.
            </p>

            {testNotificationFeedback && (
              <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium">
                {testNotificationFeedback}
              </div>
            )}

            <div className="space-y-2.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]">
                <div>
                  <span className="text-xs font-semibold text-[var(--text-primary)] block">Permissão do Navegador</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    pushPermission === 'granted' ? 'text-emerald-500' : pushPermission === 'denied' ? 'text-rose-500' : 'text-amber-500'
                  }`}>
                    {pushPermission === 'granted' ? '● Ativada' : pushPermission === 'denied' ? '● Bloqueada' : '● Pendente'}
                  </span>
                </div>
                {pushPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={handleRequestPush}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-xs transition-colors"
                  >
                    Ativar Agora
                  </button>
                )}
              </div>

              {pushPermission === 'granted' && (
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestPushToday}
                    className="w-full py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-elevated)]/80 text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Disparar Alerta de Teste Agora</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Lista Detalhada de Alertas em Tempo Real */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Barra de Filtro de Notificações */}
          <div className="flex items-center justify-between bg-[var(--surface-card)] p-2.5 rounded-xl border border-[var(--border-subtle)] text-xs">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setActiveFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeFilter === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Todas ({totalActiveAlerts})
              </button>
              <button
                onClick={() => setActiveFilter('CONTRATOS')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeFilter === 'CONTRATOS'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Contratos ({expiringContracts.length})
              </button>
              <button
                onClick={() => setActiveFilter('PAGAR')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeFilter === 'PAGAR'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Contas a Pagar ({payablesDueToday.length + payablesOverdue.length})
              </button>
              <button
                onClick={() => setActiveFilter('CONCILIACAO')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeFilter === 'CONCILIACAO'
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Conciliação ({pendingReconciliations.length})
              </button>
            </div>

            <span className="text-[11px] text-[var(--text-secondary)] font-mono hidden sm:inline">
              Data Base: {formatDateBR(todayStr)}
            </span>
          </div>

          {/* 1. Seção: Contratos Próximos do Fim */}
          {(activeFilter === 'ALL' || activeFilter === 'CONTRATOS') && expiringContracts.length > 0 && (
            <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
              <div className="p-3.5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Contratos com Término Previsto ({expiringContracts.length})
                  </h3>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('CONTRATOS')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center"
                  >
                    Ver Contratos <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                )}
              </div>

              <div className="divide-y divide-[var(--border-subtle)]">
                {expiringContracts.map(c => (
                  <div key={c.id} className="p-3.5 hover:bg-[var(--surface-elevated)]/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)]">{c.clientName}</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">{c.clientDoc}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        Término em: <strong className="text-[var(--text-primary)]">{formatDateBR(c.endDate!)}</strong> • Mensalidade: <strong className="text-emerald-400 font-mono">{formatBRL(c.amount)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        c.daysRemaining <= 7 
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' 
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      }`}>
                        {c.daysRemaining === 0 ? 'Vence Hoje!' : `Restam ${c.daysRemaining} dias`}
                      </span>

                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('CONTRATOS')}
                          className="px-2.5 py-1 bg-[var(--surface-elevated)] hover:bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-lg text-xs font-semibold flex items-center transition-colors"
                        >
                          Renovar / Ver
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Seção: Contas a Pagar Vencendo Hoje */}
          {(activeFilter === 'ALL' || activeFilter === 'PAGAR') && payablesDueToday.length > 0 && (
            <div className="bg-[var(--surface-card)] rounded-2xl border border-amber-500/40 shadow-xs overflow-hidden">
              <div className="p-3.5 border-b border-amber-500/30 bg-amber-500/10 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    Contas a Pagar com Vencimento Hoje ({payablesDueToday.length})
                  </h3>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('CONTAS_PAGAR')}
                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center"
                  >
                    Ir para Contas a Pagar <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                )}
              </div>

              <div className="divide-y divide-[var(--border-subtle)]">
                {payablesDueToday.map(t => (
                  <div key={t.id} className="p-3.5 hover:bg-[var(--surface-elevated)]/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)]">{t.supplierName}</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">Doc: {t.titleNumber}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        {t.description || 'Título a pagar'}
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-bold text-xs text-rose-400">
                        {formatBRL(t.balancePrincipal)}
                      </span>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('CONTAS_PAGAR')}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition-colors"
                        >
                          Liquidar / Pagar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Seção: Contas a Pagar Atrasadas */}
          {(activeFilter === 'ALL' || activeFilter === 'PAGAR') && preferences.alertPayablesOverdue && payablesOverdue.length > 0 && (
            <div className="bg-[var(--surface-card)] rounded-2xl border border-rose-500/40 shadow-xs overflow-hidden">
              <div className="p-3.5 border-b border-rose-500/30 bg-rose-500/10 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                    Contas a Pagar em Atraso ({payablesOverdue.length})
                  </h3>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('CONTAS_PAGAR')}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center"
                  >
                    Gerenciar Atrasos <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                )}
              </div>

              <div className="divide-y divide-[var(--border-subtle)]">
                {payablesOverdue.slice(0, 8).map(t => (
                  <div key={t.id} className="p-3.5 hover:bg-[var(--surface-elevated)]/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)]">{t.supplierName}</span>
                        <span className="text-[10px] font-mono text-[var(--text-secondary)]">Doc: {t.titleNumber}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                        Vencido em: <strong className="text-rose-400">{formatDateBR(t.dueDate)}</strong> (+{t.daysLate} dias de atraso)
                      </p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-bold text-xs text-rose-400">
                        {formatBRL(t.balancePrincipal)}
                      </span>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('CONTAS_PAGAR')}
                          className="px-2.5 py-1 bg-[var(--surface-elevated)] hover:bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold rounded-lg text-xs transition-colors"
                        >
                          Resolver
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Seção: Pendências na Conciliação Bancária */}
          {(activeFilter === 'ALL' || activeFilter === 'CONCILIACAO') && preferences.alertPendingReconciliation && (
            <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] shadow-xs overflow-hidden">
              <div className="p-3.5 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                    Pendências na Conciliação Bancária ({pendingReconciliations.length})
                  </h3>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('CONCILIACAO')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center"
                  >
                    Abrir Conciliação <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                )}
              </div>

              {pendingReconciliations.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-[var(--text-primary)]">
                    Parabéns! Nenhuma pendência na conciliação bancária.
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    Todos os extratos importados já foram conferidos e conciliados com sucesso.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {pendingReconciliations.slice(0, 8).map(e => (
                    <div key={e.id} className="p-3.5 hover:bg-[var(--surface-elevated)]/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-colors">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-[var(--text-primary)]">{e.bankName}</span>
                          <span className="text-[10px] text-[var(--text-secondary)] font-mono">{formatDateBR(e.date)}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                            {e.reconciliationStatus === 'SUGESTAO' ? 'Sugestão Disponível' : 'Pendente'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {e.description}
                        </p>
                      </div>

                      <div className="flex items-center space-x-3">
                        <span className={`font-mono font-bold text-xs ${
                          e.type === 'CREDITO' ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {e.type === 'CREDITO' ? '+' : '-'}{formatBRL(e.amount)}
                        </span>
                        {onNavigate && (
                          <button
                            onClick={() => onNavigate('CONCILIACAO')}
                            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-colors"
                          >
                            Conciliar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mensagem quando não há alertas ativos */}
          {totalActiveAlerts === 0 && (
            <div className="bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] p-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Tudo em dia! Sem alertas operacionais pendentes
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto mt-1">
                Não há contratos vencendo no prazo configurado, não há contas a pagar vencendo hoje e todos os extratos bancários estão conciliados.
              </p>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
