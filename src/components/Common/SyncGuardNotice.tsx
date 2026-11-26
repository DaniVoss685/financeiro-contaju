import React, { useEffect, useState } from 'react';
import { ShieldAlert, CloudOff, Loader2 } from 'lucide-react';
import { getSyncGuardStatus, subscribeSyncGuard, flushUnsynced, startSyncWatch, getLastFlushErrors } from '../../services/unsyncedGuard';
import { storage } from '../../services/storageService';

/**
 * Avisa quando a sessão venceu ou quando há dados que ainda não chegaram na nuvem.
 * Nada some: os dados ficam guardados neste aparelho e são enviados quando o acesso voltar.
 */
export const SyncGuardNotice: React.FC = () => {
  const [status, setStatus] = useState(getSyncGuardStatus());
  const [busy, setBusy] = useState(false);
  const [retryMsg, setRetryMsg] = useState('');

  useEffect(() => {
    startSyncWatch();
    return subscribeSyncGuard(() => setStatus(getSyncGuardStatus()));
  }, []);

  const retry = async () => {
    setBusy(true);
    setRetryMsg('');
    const ok = await flushUnsynced();
    setBusy(false);
    setStatus(getSyncGuardStatus());
    if (!ok) {
      const why = getLastFlushErrors()[0];
      setRetryMsg(why ? `Ainda não foi possível enviar (${why.slice(0, 140)}).` : 'Ainda não foi possível enviar. Entre de novo para continuar.');
    }
  };

  if (!status.sessionExpired && !status.unsynced) return null;

  if (status.sessionExpired) {
    // Aviso sem bloquear a tela: o login deste aparelho venceu; os lançamentos ficam guardados e sobem ao entrar de novo
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] flex flex-wrap items-center gap-3 rounded-xl border border-[var(--gold-edge)] bg-[var(--surface-card)] shadow-xl px-4 py-3 text-sm" role="alert">
        <ShieldAlert className="w-4 h-4 text-[var(--brand-gold)] shrink-0" />
        <span className="text-[var(--text-primary)]">
          O login deste aparelho venceu. Seus lançamentos estão guardados aqui e sobem assim que você entrar de novo.
          {retryMsg && <span className="block text-xs text-rose-500 mt-0.5">{retryMsg}</span>}
        </span>
        <button type="button" onClick={retry} disabled={busy} className="px-3 h-8 rounded-lg border border-[var(--border-highlight)] text-xs font-semibold cursor-pointer disabled:opacity-60 shrink-0 flex items-center gap-1.5">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Tentar de novo
        </button>
        <button type="button" onClick={() => storage.logout()} className="px-3 h-8 rounded-lg btn-gold text-xs font-semibold cursor-pointer shrink-0">
          Entrar de novo
        </button>
      </div>
    );
  }

  return (
    <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] flex items-center gap-3 rounded-xl border border-rose-500/50 bg-[var(--surface-card)] shadow-xl px-4 py-3 text-sm">
      <CloudOff className="w-4 h-4 text-rose-500 shrink-0" />
      <span className="text-[var(--text-primary)]">
        Não foi possível salvar o último lançamento na nuvem (sem internet ou o banco não respondeu). O sistema está tentando de novo sozinho — não feche esta tela até este aviso sumir.
        {retryMsg && <span className="block text-xs text-rose-500 mt-0.5">{retryMsg}</span>}
      </span>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="px-3 h-8 rounded-lg btn-gold text-xs font-semibold cursor-pointer disabled:opacity-60 shrink-0"
      >
        {busy ? 'Salvando...' : 'Tentar agora'}
      </button>
    </div>
  );
};
