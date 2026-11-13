import React, { useState } from 'react';
import { Barcode, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../Common/ui';
import { Aviso, ModalShell } from '../Fiscal/nfseUi';
import { asaasApi, avisarMudancaAsaas, type AsaasGerarResultado } from '../../services/asaasService';

type Forma = 'CONTRATO' | 'BOLETO' | 'PIX';

/** Gera boleto ou Pix dos títulos selecionados (de 25 em 25, para não estourar o tempo do servidor). */
export const GerarCobrancaModal: React.FC<{ titleIds: string[]; onClose: () => void; onDone: () => void }> = ({ titleIds, onClose, onDone }) => {
  const [forma, setForma] = useState<Forma>('CONTRATO');
  const [gerando, setGerando] = useState(false);
  const [feitos, setFeitos] = useState(0);
  const [resultado, setResultado] = useState<AsaasGerarResultado | null>(null);
  const [erro, setErro] = useState('');

  const gerar = async () => {
    setGerando(true);
    setErro('');
    const total: AsaasGerarResultado = { gerados: [], pulados: [], restantes: 0 };
    try {
      for (let i = 0; i < titleIds.length; i += 25) {
        const lote = titleIds.slice(i, i + 25);
        const r = await asaasApi.gerar(lote, forma === 'CONTRATO' ? {} : { forma });
        total.gerados.push(...r.gerados);
        total.pulados.push(...r.pulados);
        setFeitos(Math.min(titleIds.length, i + lote.length));
        // O que o servidor não deu conta nesta leva volta como "restantes": reenvia só esses
        if (r.restantes > 0) {
          const jaTratados = new Set([...r.gerados, ...r.pulados].map(x => x.titleId));
          const sobra = lote.filter(id => !jaTratados.has(id));
          if (sobra.length) {
            const r2 = await asaasApi.gerar(sobra, forma === 'CONTRATO' ? {} : { forma });
            total.gerados.push(...r2.gerados);
            total.pulados.push(...r2.pulados);
          }
        }
      }
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível gerar as cobranças.');
    } finally {
      setResultado(total);
      setGerando(false);
      avisarMudancaAsaas();
    }
  };

  return (
    <ModalShell
      title="Gerar boleto ou Pix"
      subtitle={`${titleIds.length} título(s) selecionado(s)`}
      icon={<Barcode />}
      onClose={() => {
        onClose();
        if (resultado) onDone();
      }}
      size="md"
      bloqueado={gerando}
      footer={
        resultado ? (
          <Button
            variant="primary"
            className="h-12 px-6"
            onClick={() => {
              onClose();
              onDone();
            }}
          >
            Fechar
          </Button>
        ) : (
          <>
            <Button variant="ghost" className="h-12" onClick={onClose} disabled={gerando}>
              Cancelar
            </Button>
            <Button variant="primary" className="h-12 px-6" onClick={() => void gerar()} disabled={gerando} icon={gerando ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {gerando ? `Gerando… ${feitos}/${titleIds.length}` : 'Gerar cobranças'}
            </Button>
          </>
        )
      }
    >
      {!resultado ? (
        <div className="space-y-5">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Cada título vira uma cobrança no Asaas. Quando o cliente pagar, o sistema dá a baixa sozinho. Título já vencido sai com um novo vencimento (daqui a 3 dias).
          </p>
          <div className="grid gap-2.5">
            {(
              [
                ['CONTRATO', 'Como está no contrato', 'Boleto ou Pix, conforme a forma de cobrança do contrato (sem contrato, boleto).'],
                ['BOLETO', 'Boleto', 'Gera boleto para todos os selecionados.'],
                ['PIX', 'Pix', 'Gera Pix (QR Code) para todos os selecionados.']
              ] as [Forma, string, string][]
            ).map(([id, titulo, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setForma(id)}
                className={`text-left rounded-xl border p-4 transition cursor-pointer ${forma === id ? 'border-[var(--brand-gold-fill)] bg-[var(--brand-gold-soft)]' : 'border-[var(--border-highlight)] hover:bg-[var(--surface-hover)]'}`}
              >
                <span className="block text-sm font-semibold">{titulo}</span>
                <span className="block mt-0.5 text-xs text-[var(--text-muted)]">{texto}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-[var(--status-success)] shrink-0" />
            <p className="text-sm">
              <strong>{resultado.gerados.length}</strong> cobrança(s) gerada(s)
              {resultado.pulados.length ? <>, <strong>{resultado.pulados.length}</strong> não gerada(s)</> : null}.
            </p>
          </div>
          {resultado.pulados.length > 0 && (
            <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
              {resultado.pulados.map(p => (
                <li key={p.titleId}>
                  <strong>{p.cliente || p.titulo || 'Título'}</strong>: {p.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ModalShell>
  );
};
