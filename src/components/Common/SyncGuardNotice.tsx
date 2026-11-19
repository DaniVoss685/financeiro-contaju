import React, { useEffect, useState } from 'react';
import { ShieldAlert, CloudOff, Loader2 } from 'lucide-react';
import { getSyncGuardStatus, subscribeSyncGuard, flushUnsynced, startSyncWatch } from '../../services/unsyncedGuard';
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
    if (!ok) setRetryMsg('Ainda não foi possível enviar. Entre de novo para continuar.');
  };

  if (!status.sessionExpired && !status.unsynced) return null;

  if (status.sessionExpired) {
    return (
      <div className="fixed inset-0 z-[80] bg-[var(--overlay)] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl border border-[var(--gold-edge)] bg-[var(--surface-card)] shadow-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--brand-gold-soft)] border border-[var(--gold-edge)] text-[var(--brand-gold)] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Sua sessão foi encerrada</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                O login deste aparelho foi encerrado (por exemplo, alguém saiu da mesma conta em outro computador). <strong>Seus lançamentos estão guardados neste aparelho</strong> e serão enviados assim que você entrar de novo.
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">Dica: não limpe os dados do navegador antes de entrar de novo.</p>
          {retryMsg && <p className="text-xs text-rose-500">{retryMsg}</p>}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={() => storage.logout()}
              className="flex-1 h-11 rounded-xl btn-gold font-semibold text-sm cursor-pointer"
            >
              Entrar de novo
            </button>
            <button
              type="button"
              onClick={retry}
              disabled={busy}
              className="flex-1 h-11 rounded-xl border border-[var(--border-highlight)] bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold text-sm hover:bg-[var(--surface-hover)] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Tentar de novo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] flex items-center gap-3 rounded-xl border border-[var(--gold-edge)] bg-[var(--surface-card)] shadow-xl px-4 py-3 text-sm">
      <CloudOff className="w-4 h-4 text-[var(--brand-gold)] shrink-0" />
      <span className="text-[var(--text-primary)]">Alguns lançamentos ainda não foram enviados para a nuvem. Estão guardados aqui.</span>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="px-3 h-8 rounded-lg btn-gold text-xs font-semibold cursor-pointer disabled:opacity-60 shrink-0"
      >
        {busy ? 'Enviando...' : 'Enviar agora'}
      </button>
    </div>
  );
};
