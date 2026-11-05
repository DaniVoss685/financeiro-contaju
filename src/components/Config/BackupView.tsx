import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Upload, 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileText, 
  FileJson,
  Users, 
  Building2, 
  Wallet, 
  RefreshCw,
  Info,
  ShieldAlert,
  Mail,
  Send,
  Calendar,
  Check,
  Sparkles,
  Play
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { automaticBackupService, AutoBackupConfig } from '../../services/automaticBackupService';
import { PremiumSelect } from '../Common/PremiumSelect';

export const BackupView: React.FC = () => {
  const [lastBackupInfo, setLastBackupInfo] = useState<{ filename: string; date: string; sizeKb: number } | null>(() => {
    try {
      const saved = localStorage.getItem('contaju_last_backup_info');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [autoConfig, setAutoConfig] = useState<AutoBackupConfig>(() => automaticBackupService.getConfig());
  const [recipientsInput, setRecipientsInput] = useState<string>(() => autoConfig.recipients.join(', '));
  const [selectedDay, setSelectedDay] = useState<number>(autoConfig.dayOfWeek);
  const [selectedTime, setSelectedTime] = useState<string>(autoConfig.timeOfDay);
  const [isSendingEmailNow, setIsSendingEmailNow] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    system?: string;
    version?: string;
    exportedAt?: string;
    stats?: Record<string, number>;
  } | null>(null);
  const [restoreJsonContent, setRestoreJsonContent] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Escuta atualizações do storage e configurações
  useEffect(() => {
    return storage.subscribe(() => {
      setRefreshKey(k => k + 1);
      const latestConfig = automaticBackupService.getConfig();
      setAutoConfig(latestConfig);
    });
  }, []);

  const handleToggleAutoBackup = () => {
    const nextState = !autoConfig.enabled;
    const updated = automaticBackupService.saveConfig({ enabled: nextState });
    setAutoConfig(updated);
    setNotification({
      type: 'info',
      text: nextState 
        ? 'Rotina de backup semanal por e-mail ATIVADA com sucesso! O sistema fará os envios automaticamente.'
        : 'Rotina de backup semanal por e-mail desativada.'
    });
  };

  const handleSaveEmailConfig = () => {
    setIsSavingConfig(true);
    const splitRecipients = recipientsInput
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(e => e.length > 0 && e.includes('@'));

    if (splitRecipients.length === 0) {
      setNotification({
        type: 'error',
        text: 'Por favor, informe ao menos um e-mail válido para receber o backup.'
      });
      setIsSavingConfig(false);
      return;
    }

    const updated = automaticBackupService.saveConfig({
      recipients: splitRecipients,
      dayOfWeek: selectedDay,
      timeOfDay: selectedTime
    });
    setAutoConfig(updated);
    setRecipientsInput(updated.recipients.join(', '));
    setIsSavingConfig(false);
    setNotification({
      type: 'success',
      text: 'Configuração da rotina semanal de backup salva com sucesso!'
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleTriggerEmailBackupNow = async () => {
    setIsSendingEmailNow(true);
    try {
      const splitRecipients = recipientsInput
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(e => e.length > 0 && e.includes('@'));

      const res = await automaticBackupService.executeBackupNow(
        'MANUAL',
        splitRecipients.length > 0 ? splitRecipients : undefined
      );

      const latestConfig = automaticBackupService.getConfig();
      setAutoConfig(latestConfig);

      if (res.success) {
        setNotification({
          type: 'success',
          text: `🎉 Sucesso! Backup "${res.filename}" (${res.sizeKb} KB) enviado com sucesso para ${res.sentTo?.join(', ')}!`
        });
      } else {
        setNotification({
          type: 'error',
          text: `Falha ao transmitir backup por e-mail: ${res.message}`
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: `Erro inesperado: ${err?.message || err}`
      });
    } finally {
      setIsSendingEmailNow(false);
    }
  };

  // Dados atuais para exibição das estatísticas
  const titles = storage.getTitles();
  const contracts = storage.getContracts();
  const counterparties = storage.getCounterparties();
  const movements = storage.getMovements();
  const bankAccounts = storage.getBankAccounts();
  const company = storage.getCompany();

  // Tratador de Exportação
  const handleExportBackup = () => {
    try {
      const result = storage.downloadBackupFile();
      const backupInfo = {
        filename: result.filename,
        date: new Date().toLocaleString('pt-BR'),
        sizeKb: result.sizeKb
      };
      setLastBackupInfo(backupInfo);
      localStorage.setItem('contaju_last_backup_info', JSON.stringify(backupInfo));

      setNotification({
        type: 'success',
        text: `Arquivo "${result.filename}" (${result.sizeKb} KB) exportado e salvo com sucesso!`
      });
      setTimeout(() => setNotification(null), 6000);
    } catch (err) {
      setNotification({
        type: 'error',
        text: 'Erro ao gerar o arquivo de backup. Verifique as permissões do navegador.'
      });
    }
  };

  // Tratador de Seleção de Arquivo para Restauração
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setNotification({
        type: 'error',
        text: 'Por favor, selecione um arquivo válido no formato .JSON de backup.'
      });
      return;
    }

    setRestoreFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setRestoreJsonContent(text);
        const parsed = JSON.parse(text);

        // Preview dos metadados
        setRestorePreview({
          system: parsed.system || 'Backup Compatível',
          version: parsed.version || '1.0',
          exportedAt: parsed.exportedAt || 'Data não especificada',
          stats: parsed.stats || (parsed.data ? {
            'Títulos': parsed.data.TITLES?.length || 0,
            'Contratos': parsed.data.CONTRACTS?.length || 0,
            'Clientes/Fornecedores': parsed.data.COUNTERPARTIES?.length || 0
          } : undefined)
        });
      } catch (err) {
        setNotification({
          type: 'error',
          text: 'O arquivo selecionado não contém um JSON válido.'
        });
        setRestoreFile(null);
        setRestorePreview(null);
      }
    };
    reader.readAsText(file);
  };

  // Execução da Restauração
  const handleConfirmRestore = () => {
    if (!restoreJsonContent) return;
    setIsRestoring(true);

    try {
      const res = storage.importFullBackup(restoreJsonContent);
      if (res.success) {
        setNotification({
          type: 'success',
          text: res.message
        });
        setRestoreFile(null);
        setRestorePreview(null);
        setRestoreJsonContent('');
      } else {
        setNotification({
          type: 'error',
          text: res.message
        });
      }
    } catch {
      setNotification({
        type: 'error',
        text: 'Falha durante a restauração do banco de dados.'
      });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-[#131316] p-5 rounded-2xl border border-slate-200 dark:border-[#26262b] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Backup & Segurança da Base de Dados
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                  Armazenamento Ativo
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Exporte uma cópia completa de segurança em formato JSON para salvar no seu computador ou restaure dados anteriores.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleExportBackup}
          className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center space-x-2 text-xs"
        >
          <Download className="w-4 h-4" />
          <span>Exportar Backup (.JSON)</span>
        </button>
      </div>

      {/* Notificação Flutuante ou Inline */}
      {notification && (
        <div className={`p-4 rounded-xl border flex items-center space-x-3 text-xs font-semibold ${
          notification.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            : notification.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
            : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span className="flex-1">{notification.text}</span>
          <button 
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid: Estatísticas do Banco de Dados Atual & Último Backup */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Card 1: Resumo da Base Atual */}
        <div className="md:col-span-2 bg-white dark:bg-[#131316] p-6 rounded-2xl border border-slate-200 dark:border-[#26262b] shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#26262b] pb-3">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Conteúdo Incluído no Backup
              </h2>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Empresa: {company.tradeName || 'Escritório Contábil'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200/80 dark:border-[#26262b]">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Títulos Fin.</span>
                <FileText className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{titles.length}</div>
              <div className="text-[10px] text-slate-500">Pagar e Receber</div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200/80 dark:border-[#26262b]">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Contratos</span>
                <Building2 className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{contracts.length}</div>
              <div className="text-[10px] text-slate-500">Recorrentes (MRR)</div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200/80 dark:border-[#26262b]">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Cadastros</span>
                <Users className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{counterparties.length}</div>
              <div className="text-[10px] text-slate-500">Clientes & Fornecedores</div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200/80 dark:border-[#26262b]">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider">Extratos/Caixa</span>
                <Wallet className="w-3.5 h-3.5 text-cyan-500" />
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">{movements.length}</div>
              <div className="text-[10px] text-slate-500">Movimentações ativas</div>
            </div>
          </div>

          <div className="p-3.5 bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3 text-xs text-amber-900 dark:text-amber-200">
            <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Backup 100% Completo e Portável</p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                O arquivo gerado inclui todas as tabelas: Plano de Contas, Regras de Recorrência, Usuários, Fechamentos, Cartões de Crédito e Histórico de Auditoria.
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Status do Último Backup & Ação Rápida */}
        <div className="bg-white dark:bg-[#131316] p-6 rounded-2xl border border-slate-200 dark:border-[#26262b] shadow-2xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-[#26262b] pb-3">
              <Clock className="w-4 h-4 text-slate-500" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Última Cópia Local Salva
              </h2>
            </div>

            {lastBackupInfo ? (
              <div className="mt-4 space-y-2 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-[#1b1b20] rounded-xl border border-slate-200 dark:border-[#26262b] space-y-1">
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 truncate" title={lastBackupInfo.filename}>
                    {lastBackupInfo.filename}
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Exportado em:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{lastBackupInfo.date}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>Tamanho do arquivo:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{lastBackupInfo.sizeKb} KB</span>
                  </div>
                </div>
                <div className="flex items-center text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Cópia de segurança disponível no seu dispositivo
                </div>
              </div>
            ) : (
              <div className="mt-6 text-center py-4 text-xs text-slate-500 dark:text-slate-400">
                <FileJson className="w-8 h-8 mx-auto text-slate-400 mb-2 opacity-60" />
                <p>Nenhum backup baixado nesta sessão.</p>
                <p className="text-[11px] text-slate-400 mt-1">Clique no botão abaixo para gerar sua primeira cópia.</p>
              </div>
            )}
          </div>

          <button
            onClick={handleExportBackup}
            className="w-full py-2.5 bg-slate-900 dark:bg-[#1b1b20] hover:bg-slate-800 dark:hover:bg-[#222938] text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Cópia de Segurança (.JSON)</span>
          </button>
        </div>

      </div>

      {/* Seção Nova: Rotina Automática de Exportação Semanal por E-mail (.JSON) */}
      <div className="bg-white dark:bg-[#131316] p-6 rounded-2xl border border-amber-500/30 dark:border-amber-500/20 shadow-md space-y-6 relative overflow-hidden">
        {/* Glow de fundo dourado sutil */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-amber-500/10 via-transparent to-transparent rounded-bl-full pointer-events-none" />

        {/* Header do Card */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 dark:border-[#26262b] pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 text-amber-500 border border-amber-500/30 shadow-xs">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Rotina Automática de Backup Semanal via E-mail
                </h2>
                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                  autoConfig.enabled
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                }`}>
                  {autoConfig.enabled ? 'Ativo na Nuvem' : 'Pausado'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Exporta automaticamente toda a base de dados do sistema em formato <strong>.JSON</strong> e envia anexada por e-mail toda semana.
              </p>
            </div>
          </div>

          {/* Toggle Switch Ativado / Desativado */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {autoConfig.enabled ? 'Rotina Ativada' : 'Rotina Desativada'}
            </span>
            <button
              type="button"
              onClick={handleToggleAutoBackup}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoConfig.enabled ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'
              }`}
              role="switch"
              aria-checked={autoConfig.enabled}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  autoConfig.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Configurações da Rotina */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Coluna 1 & 2: Formulário de Configuração */}
          <div className="lg:col-span-2 space-y-4">
            
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                <span>E-mails Destinatários (separados por vírgula):</span>
                <span className="text-[11px] font-normal text-slate-400">
                  Ex: econtajuridico@gmail.com, leonardo@empresa.com
                </span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={recipientsInput}
                  onChange={(e) => setRecipientsInput(e.target.value)}
                  placeholder="econtajuridico@gmail.com, seu-email@exemplo.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                💡 O arquivo <span className="font-mono text-amber-500 font-bold">.JSON</span> será enviado como anexo oficial para os endereços informados acima.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  Dia da Semana para Envio:
                </label>
                <PremiumSelect
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value={1}>Segunda-feira (Recomendado - Abertura de Semana)</option>
                  <option value={2}>Terça-feira</option>
                  <option value={3}>Quarta-feira</option>
                  <option value={4}>Quinta-feira</option>
                  <option value={5}>Sexta-feira (Fechamento Semanal)</option>
                  <option value={6}>Sábado</option>
                  <option value={0}>Domingo</option>
                </PremiumSelect>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-500" />
                  Horário Preferencial de Disparo:
                </label>
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-amber-500 outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleSaveEmailConfig}
                disabled={isSavingConfig}
                className="px-4 py-2 bg-slate-900 dark:bg-[#1b1b20] hover:bg-slate-800 dark:hover:bg-[#252c3c] text-amber-400 border border-amber-500/40 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salvar Configuração Semanal</span>
              </button>

              <button
                type="button"
                onClick={handleTriggerEmailBackupNow}
                disabled={isSendingEmailNow}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSendingEmailNow ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Gerando e Enviando por E-mail...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Disparar Envio Agora (Teste Imediato)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Coluna 3: Painel do Último Envio Realizado */}
          <div className="bg-slate-50 dark:bg-[#1b1b20] p-4 rounded-xl border border-slate-200 dark:border-[#26262b] flex flex-col justify-between space-y-3">
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  Status do Último Envio
                </span>
                {autoConfig.lastStatus === 'SUCCESS' && (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Entregue com Sucesso
                  </span>
                )}
                {autoConfig.lastStatus === 'ERROR' && (
                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30">
                    Falha no Envio
                  </span>
                )}
              </div>

              {autoConfig.lastRunAt ? (
                <div className="space-y-2 text-xs">
                  <div className="text-[11px] text-slate-500 flex justify-between border-b border-slate-200/50 dark:border-[#26262b] pb-1.5">
                    <span>Data/Hora:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(autoConfig.lastRunAt).toLocaleString('pt-BR')}
                    </span>
                  </div>

                  {autoConfig.lastFilename && (
                    <div className="text-[11px] text-slate-500 flex justify-between border-b border-slate-200/50 dark:border-[#26262b] pb-1.5">
                      <span>Arquivo:</span>
                      <span className="font-mono font-bold text-sky-600 dark:text-sky-400 truncate max-w-[140px]" title={autoConfig.lastFilename}>
                        {autoConfig.lastFilename}
                      </span>
                    </div>
                  )}

                  {autoConfig.lastSizeKb && (
                    <div className="text-[11px] text-slate-500 flex justify-between border-b border-slate-200/50 dark:border-[#26262b] pb-1.5">
                      <span>Tamanho:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {autoConfig.lastSizeKb} KB
                      </span>
                    </div>
                  )}

                  {autoConfig.lastSentRecipients && autoConfig.lastSentRecipients.length > 0 && (
                    <div className="text-[11px] text-slate-500 pt-1">
                      <span className="block mb-1 font-semibold text-slate-700 dark:text-slate-300">Enviado para:</span>
                      <span className="font-mono text-[10px] text-slate-600 dark:text-slate-400 break-all bg-white dark:bg-[#131316] p-1.5 rounded-lg border border-slate-200 dark:border-[#26262b] block">
                        {autoConfig.lastSentRecipients.join(', ')}
                      </span>
                    </div>
                  )}

                  {autoConfig.lastError && (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                      <strong>Erro:</strong> {autoConfig.lastError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-400">
                  <Mail className="w-7 h-7 mx-auto mb-1.5 opacity-40 text-amber-500" />
                  <p>Nenhum envio registrado ainda.</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Clique em "Disparar Envio Agora" para fazer seu primeiro teste.</p>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200/50 dark:border-[#26262b] text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Frequência: Semanal (A cada 7 dias)</span>
              <span className="font-semibold text-amber-500">Serviço Ativo</span>
            </div>
          </div>

        </div>
      </div>

      {/* Seção 2: Restauração de Backup */}
      <div className="bg-white dark:bg-[#131316] p-6 rounded-2xl border border-slate-200 dark:border-[#26262b] shadow-2xs space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-[#26262b] pb-3">
          <Upload className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Restaurar Base de Dados a Partir de um Arquivo .JSON
          </h2>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400">
          Caso precise recuperar os dados salvos anteriormente em outro computador ou restabelecer um ponto de restauração, selecione o arquivo JSON de backup exportado pelo sistema.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          
          {/* Upload Drop Area */}
          <div className="border-2 border-dashed border-slate-300 dark:border-[#26262b] hover:border-amber-500 dark:hover:border-amber-500/60 rounded-2xl p-6 text-center transition-colors">
            <input
              type="file"
              id="backupFileInput"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="backupFileInput" className="cursor-pointer block space-y-2">
              <FileJson className="w-10 h-10 mx-auto text-amber-500/80" />
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {restoreFile ? restoreFile.name : 'Clique para selecionar o arquivo .JSON de backup'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {restoreFile ? `${(restoreFile.size / 1024).toFixed(1)} KB` : 'Formato suportado: backup-*.json'}
              </div>
            </label>
          </div>

          {/* Preview & Confirmação */}
          <div className="bg-slate-50 dark:bg-[#1b1b20] p-5 rounded-2xl border border-slate-200 dark:border-[#26262b] space-y-3">
            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center justify-between">
              <span>Pré-visualização do Arquivo</span>
              {restorePreview && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50">
                  Estrutura Válida
                </span>
              )}
            </div>

            {restorePreview ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-500">Sistema: </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{restorePreview.system}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Versão: </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{restorePreview.version}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Data de Exportação: </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{restorePreview.exportedAt}</span>
                  </div>
                </div>

                {restorePreview.stats && (
                  <div className="pt-2 border-t border-slate-200 dark:border-[#26262b] flex flex-wrap gap-2">
                    {Object.entries(restorePreview.stats).map(([k, v]) => (
                      <span key={k} className="text-[10px] bg-white dark:bg-[#131316] px-2 py-1 rounded border border-slate-200 dark:border-[#26262b] font-mono text-slate-700 dark:text-slate-300">
                        {k}: <strong>{v}</strong>
                      </span>
                    ))}
                  </div>
                )}

                <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-xl text-[11px] text-rose-800 dark:text-rose-300 flex items-start space-x-2 mt-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>
                    Atenção: A restauração substituirá os registros atuais pela versão do arquivo importado.
                  </span>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleConfirmRestore}
                    disabled={isRestoring}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center space-x-2"
                  >
                    {isRestoring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>Confirmar e Restaurar Dados</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-500 dark:text-slate-400">
                Selecione um arquivo de backup para visualizar os detalhes antes de restaurar.
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
