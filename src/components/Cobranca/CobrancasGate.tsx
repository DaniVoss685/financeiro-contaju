import React, { lazy, Suspense } from 'react';
import { Wrench } from 'lucide-react';

/** Enquanto a cobrança por boleto e Pix não estiver pronta, a tela mostra o aviso de finalização. Troque para false para liberar. */
export const COBRANCAS_EM_FINALIZACAO = true;

const CobrancasReal = lazy(() => import('./CobrancasView').then(m => ({ default: m.CobrancasView })));

export const CobrancasView: React.FC<any> = props => {
  if (!COBRANCAS_EM_FINALIZACAO) {
    return (
      <Suspense fallback={null}>
        <CobrancasReal {...props} />
      </Suspense>
    );
  }
  return (
    <div className="max-w-xl mx-auto mt-16 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-[var(--brand-gold-soft)] flex items-center justify-center text-[var(--brand-gold)]">
        <Wrench className="w-7 h-7" />
      </div>
      <h2 className="mt-5 text-xl font-semibold text-[var(--text-primary)]">Cobranças em finalização</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Estamos terminando a cobrança por boleto e Pix. Em breve ela estará disponível aqui.
      </p>
    </div>
  );
};
