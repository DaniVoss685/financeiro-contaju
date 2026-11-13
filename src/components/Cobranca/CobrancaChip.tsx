import React, { useState } from 'react';
import { Barcode, QrCode } from 'lucide-react';
import { situacaoDaCobranca, type AsaasCharge } from '../../services/asaasService';
import { DetalheCobrancaModal } from './CobrancaModais';

const COR: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  info: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  danger: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  gold: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  neutral: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25'
};

/** Etiqueta do boleto/Pix de um título; toque para ver, copiar o código ou abrir o PDF. */
export const CobrancaChip: React.FC<{ cobranca: AsaasCharge; cliente: string; titulo: string; podeCancelar: boolean; onMudou: () => void }> = ({ cobranca, cliente, titulo, podeCancelar, onMudou }) => {
  const [aberto, setAberto] = useState(false);
  const sit = situacaoDaCobranca(cobranca);
  const Icone = cobranca.billing_type === 'PIX' ? QrCode : Barcode;
  return (
    <>
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          setAberto(true);
        }}
        title="Ver boleto ou Pix deste título"
        className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border cursor-pointer ${COR[sit.tom]}`}
      >
        <Icone className="w-3 h-3" />
        {cobranca.billing_type === 'PIX' ? 'Pix' : 'Boleto'} · {sit.texto}
      </button>
      {aberto && (
        <DetalheCobrancaModal
          cobranca={cobranca}
          cliente={cliente}
          titulo={titulo}
          podeCancelar={podeCancelar}
          onClose={() => setAberto(false)}
          onCancelada={() => {
            setAberto(false);
            onMudou();
          }}
        />
      )}
    </>
  );
};
