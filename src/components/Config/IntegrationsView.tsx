import React, { useState } from 'react';
import { Blocks, Key, Globe, CheckCircle2, RefreshCw, Server, Send, Copy, ShieldCheck } from 'lucide-react';

export const IntegrationsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'BANCOS' | 'API' | 'WEBHOOK'>('BANCOS');
  const [apiKey, setApiKey] = useState('ctj_live_89f4b7a6c9e0d1f3');
  const [webhookUrl, setWebhookUrl] = useState('https://app.contabil.com.br/webhooks/financeiro');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400">
              <Blocks className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Módulos e Integrações de Sistema
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Conectores bancários (OFX/Open Finance), Emissor de NFS-e, APIs REST e Webhooks para automações.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300">
            ✓ Serviços Online
          </span>
        </div>
      </div>

      {/* Grid de Conectores */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                ATIVO
              </span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">OFX 2.1</span>
            </div>
            <h3 className="font-bold text-[var(--text-primary)] text-sm mt-2.5">Extrato Bancário OFX / CSV</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Importação padronizada de extratos de todos os bancos brasileiros com reconciliação automática e leitura de regras.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
            <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" />
            Processamento Ativo
          </div>
        </div>

        <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30">
                PRONTO
              </span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">REST API</span>
            </div>
            <h3 className="font-bold text-[var(--text-primary)] text-sm mt-2.5">API Pública Contaju</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Endpoints para emissão de títulos, consulta de saldos e integração com ERPs externos de clientes.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center text-xs text-[var(--text-secondary)] font-semibold">
            <Server className="w-4 h-4 mr-1.5 shrink-0" />
            Endpoints Documentados
          </div>
        </div>

        <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                HOMOLOGAÇÃO
              </span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">WEBHOOK</span>
            </div>
            <h3 className="font-bold text-[var(--text-primary)] text-sm mt-2.5">Webhooks em Tempo Real</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Disparo de eventos em tempo real quando ocorrem liquidações, baixas por Pix ou encerramentos contábeis.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center text-xs text-amber-700 dark:text-amber-400 font-semibold">
            <Send className="w-4 h-4 mr-1.5 shrink-0" />
            Eventos Assíncronos
          </div>
        </div>

        <div className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                SUPABASE
              </span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">POSTGRES</span>
            </div>
            <h3 className="font-bold text-[var(--text-primary)] text-sm mt-2.5">Supabase Cloud DB</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
              Banco de dados relacional PostgreSQL na nuvem com sincronização bidirecional e backup contínuo.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center text-xs text-amber-600 dark:text-amber-400 font-semibold">
            <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" />
            Pronto para Conectar
          </div>
        </div>
      </div>

      {/* Detalhes de Credenciais & Webhooks */}
      <div className="bg-[var(--surface-card)] p-5 sm:p-6 rounded-2xl border border-[var(--border-subtle)] shadow-2xs space-y-4">
        <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
          <Key className="w-4 h-4 text-amber-500" />
          <span>Chave de Acesso da API (API Key)</span>
        </h3>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <input
            type="text"
            readOnly
            value={apiKey}
            className="flex-1 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3.5 py-2 font-mono text-xs text-[var(--text-primary)] select-all"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Copiado!' : 'Copiar Chave'}</span>
          </button>
        </div>

        <div className="pt-4 border-t border-[var(--border-subtle)]">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            URL de Destino para Webhooks de Liquidação
          </label>
          <input
            type="url"
            value={webhookUrl}
            onChange={e => setWebhookUrl(e.target.value)}
            className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3.5 py-2 text-xs text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
          />
          <span className="text-[11px] text-[var(--text-secondary)] mt-1 block">
            Payload formatado em JSON com assinatura HMAC-SHA256 de validação.
          </span>
        </div>
      </div>

    </div>
  );
};
