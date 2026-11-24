import React, { useEffect, useState } from 'react';
import { Bell, X, CheckCircle2 } from 'lucide-react';
import { NotificationService } from '../../services/notificationService';
import { getActiveOrgId } from '../../services/authService';

const CHAVE_ADIADO = 'contaju_push_invite_ate';
const DIAS_ADIADO = 14;

/**
 * Convite para ligar o aviso de vencimento neste aparelho. O navegador só deixa pedir permissão
 * depois de um toque do usuário, então este cartão é o "ativar" mais direto possível.
 * Aparece uma vez por aparelho (volta em 14 dias se a pessoa escolher "Agora não").
 */
export const PushInvite: React.FC = () => {
  const [visivel, setVisivel] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    const decidir = async () => {
      if (!getActiveOrgId()) return;
      if (!NotificationService.isPushSupported() && !NotificationService.needsInstallOnIos()) return;
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return;
      const ate = Number(localStorage.getItem(CHAVE_ADIADO) || 0);
      if (ate > Date.now()) return;
      if (await NotificationService.isPushActive()) return;
      if (vivo) setVisivel(true);
    };
    const t = setTimeout(decidir, 4000); // deixa o sistema carregar primeiro
    return () => { vivo = false; clearTimeout(t); };
  }, []);

  if (!visivel) return null;

  const adiar = () => {
    localStorage.setItem(CHAVE_ADIADO, String(Date.now() + DIAS_ADIADO * 86_400_000));
    setVisivel(false);
  };

  const ativar = async () => {
    setOcupado(true);
    setErro(null);
    const r = await NotificationService.enablePush();
    setOcupado(false);
    if (r.ok) {
      setPronto(true);
      setTimeout(() => setVisivel(false), 3500);
    } else {
      setErro(r.motivo || 'Não foi possível ativar agora.');
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Ativar aviso de vencimento"
      className="fixed z-[60] left-3 right-3 bottom-20 lg:bottom-6 lg:left-auto lg:right-6 lg:w-[380px] bg-[var(--surface-card)] border border-amber-500/40 rounded-2xl shadow-2xl p-4"
    >
      {pronto ? (
        <div className="flex items-center gap-3 text-sm text-emerald-500 font-semibold">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          Pronto! Você vai receber o aviso das contas que vencem no dia.
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[var(--text-primary)]">Receber aviso de vencimento?</p>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed mt-1">
                No seu {NotificationService.needsInstallOnIos() ? 'iPhone' : 'aparelho'}, com o nome e o valor do que vence hoje e amanhã. Funciona até com o sistema fechado.
              </p>
            </div>
            <button
              type="button"
              onClick={adiar}
              aria-label="Fechar"
              className="p-1.5 -m-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {erro && (
            <p role="alert" className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 leading-relaxed">{erro}</p>
          )}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={adiar}
              className="px-3 min-h-[40px] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              Agora não
            </button>
            <button
              type="button"
              onClick={ativar}
              disabled={ocupado}
              className="px-4 min-h-[40px] rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {ocupado ? 'Ativando...' : 'Ativar aviso'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
