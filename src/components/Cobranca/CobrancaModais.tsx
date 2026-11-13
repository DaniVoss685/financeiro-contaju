import React, { useEffect, useState } from 'react';
import { Barcode, Check, Copy, ExternalLink, Loader2, QrCode, Send, Trash2 } from 'lucide-react';
import { Badge, Button } from '../Common/ui';
import { Aviso, ModalShell } from '../Fiscal/nfseUi';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { asaasApi, situacaoDaCobranca, type AsaasCharge, type AsaasDetalhes, type AsaasPrevia } from '../../services/asaasService';

const BotaoCopiar: React.FC<{ texto: string; rotulo: string }> = ({ texto, rotulo }) => {
  const [ok, setOk] = useState(false);
  return (
    <Button
      onClick={() => {
        void navigator.clipboard?.writeText(texto).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 2200);
        });
      }}
      icon={ok ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    >
      {ok ? 'Copiado' : rotulo}
    </Button>
  );
};

/** Boleto / Pix de uma cobrança: copiar, abrir, e (para quem gerencia) cancelar. */
export const DetalheCobrancaModal: React.FC<{
  cobranca: AsaasCharge;
  cliente: string;
  titulo: string;
  podeCancelar: boolean;
  onClose: () => void;
  onCancelada: () => void;
}> = ({ cobranca, cliente, titulo, podeCancelar, onClose, onCancelada }) => {
  const [dados, setDados] = useState<AsaasDetalhes | null>(null);
  const [erro, setErro] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const aberta = ['PENDING', 'OVERDUE'].includes(cobranca.status);
  const sit = situacaoDaCobranca(cobranca);

  useEffect(() => {
    let vivo = true;
    asaasApi
      .detalhes(cobranca.id)
      .then(d => vivo && setDados(d))
      .catch(e => vivo && setErro(e?.message || 'Não foi possível carregar os dados do pagamento.'));
    return () => {
      vivo = false;
    };
  }, [cobranca.id]);

  const cancelar = async () => {
    setCancelando(true);
    setErro('');
    try {
      await asaasApi.cancelar(cobranca.id);
      onCancelada();
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível cancelar.');
      setCancelando(false);
    }
  };

  return (
    <ModalShell title={cliente} subtitle={`${titulo} · ${cobranca.billing_type === 'PIX' ? 'Pix' : 'Boleto'}`} icon={cobranca.billing_type === 'PIX' ? <QrCode /> : <Barcode />} onClose={onClose} size="md" bloqueado={cancelando}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--text-muted)]">Valor</p>
            <p className="text-2xl font-semibold tabular-nums">{formatBRL(Number(cobranca.value))}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">{cobranca.paid_at ? 'Pago em' : 'Vence em'}</p>
            <p className="text-sm font-semibold">{formatDateBR(cobranca.paid_at || cobranca.due_date)}</p>
          </div>
        </div>
        <Badge tone={sit.tom}>{sit.texto}</Badge>
        {cobranca.apply_error && <Aviso tipo="erro">A baixa automática não foi feita: {cobranca.apply_error}</Aviso>}
        {cobranca.revisar_motivo && <Aviso tipo="aviso">{cobranca.revisar_motivo}</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {aberta && !dados && !erro && (
          <p className="text-sm text-[var(--text-muted)] inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Buscando o código de pagamento…
          </p>
        )}
        {aberta && dados?.pix && (
          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            <img src={`data:image/png;base64,${dados.pix.imagem}`} alt="QR Code do Pix" width={168} height={168} className="rounded-xl bg-white p-2 shrink-0" />
            <div className="min-w-0 w-full space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">O cliente lê o QR Code no app do banco ou usa o código copia e cola.</p>
              <code className="block text-xs break-all rounded-xl bg-[var(--surface-input)] border border-[var(--border-subtle)] p-3 max-h-24 overflow-y-auto">{dados.pix.codigo}</code>
              <BotaoCopiar texto={dados.pix.codigo} rotulo="Copiar código Pix" />
            </div>
          </div>
        )}
        {aberta && dados?.linhaDigitavel && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">Linha digitável do boleto:</p>
            <code className="block text-xs break-all rounded-xl bg-[var(--surface-input)] border border-[var(--border-subtle)] p-3">{dados.linhaDigitavel}</code>
            <BotaoCopiar texto={dados.linhaDigitavel} rotulo="Copiar linha digitável" />
          </div>
        )}
        <div className="flex flex-wrap gap-2.5">
          {cobranca.billing_type !== 'PIX' && (dados?.linkBoleto || cobranca.bank_slip_url) && (
            <a className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-[var(--border-highlight)] text-sm font-medium hover:bg-[var(--surface-hover)]" href={(dados?.linkBoleto || cobranca.bank_slip_url)!} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" /> Abrir boleto (PDF)
            </a>
          )}
          {(dados?.linkFatura || cobranca.invoice_url) && (
            <a className="h-10 px-4 inline-flex items-center gap-2 rounded-xl border border-[var(--border-highlight)] text-sm font-medium hover:bg-[var(--surface-hover)]" href={(dados?.linkFatura || cobranca.invoice_url)!} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" /> Página de pagamento
            </a>
          )}
        </div>

        {aberta && podeCancelar && (
          <div className="pt-4 border-t border-[var(--border-subtle)]">
            {!confirmando ? (
              <Button variant="danger" onClick={() => setConfirmando(true)} icon={<Trash2 className="w-4 h-4" />}>
                Cancelar esta cobrança
              </Button>
            ) : (
              <div className="space-y-3">
                <Aviso tipo="aviso">A cobrança será cancelada no Asaas e o cliente não conseguirá mais pagar este boleto ou Pix. O título continua em aberto aqui.</Aviso>
                <div className="flex gap-2.5">
                  <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={cancelando}>
                    Voltar
                  </Button>
                  <Button variant="danger" onClick={() => void cancelar()} disabled={cancelando} icon={cancelando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}>
                    Sim, cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};

/** O que o robô cobraria agora, sem gerar nada. */
export const PreviaRoboModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [previa, setPrevia] = useState<AsaasPrevia | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    asaasApi
      .previa()
      .then(p => vivo && setPrevia(p))
      .catch(e => vivo && setErro(e?.message || 'Não foi possível montar a prévia.'));
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <ModalShell title="Prévia do robô" subtitle="O que seria cobrado agora (nada é gerado aqui)" icon={<Send />} onClose={onClose}>
      {erro ? (
        <Aviso tipo="erro">{erro}</Aviso>
      ) : !previa ? (
        <p className="text-sm text-[var(--text-muted)] inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Conferindo os honorários…
        </p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Honorários de contratos com boleto ou Pix que vencem até <strong>{formatDateBR(previa.ate)}</strong> e ainda não têm cobrança:{' '}
            <strong>{previa.total}</strong>. Na próxima execução o robô gera {previa.cabeNaProximaExecucao}.
          </p>
          {(previa.duplicados ?? 0) > 0 && (
            <Aviso tipo="aviso">
              <strong>{previa.duplicados} título(s) duplicados não serão cobrados.</strong> São títulos idênticos (mesmo cliente, competência, vencimento e valor), provavelmente de importação repetida. Cobrar todos mandaria 2 ou 3 boletos do mesmo honorário. Use a "Limpeza de duplicidades" em Contas a receber (botão com três pontinhos) e a prévia se atualiza.
              {previa.amostraDuplicados && previa.amostraDuplicados.length > 0 && (
                <span className="block mt-1.5 text-xs opacity-90">Exemplos: {[...new Set(previa.amostraDuplicados.map(d => d.cliente || d.titulo))].join('; ')}</span>
              )}
            </Aviso>
          )}
          {previa.itens.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                    <th className="px-4 py-2.5 font-medium">Cliente</th>
                    <th className="px-4 py-2.5 font-medium">Vence</th>
                    <th className="px-4 py-2.5 font-medium">Valor</th>
                    <th className="px-4 py-2.5 font-medium">Forma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {previa.itens.map(i => (
                    <tr key={i.titleId}>
                      <td className="px-4 py-2.5 max-w-[240px] truncate">{i.cliente}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDateBR(i.vencimento)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatBRL(i.valor)}</td>
                      <td className="px-4 py-2.5">{i.forma === 'PIX' ? 'Pix' : 'Boleto'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {previa.pulados.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Não serão cobrados ({previa.pulados.length})</p>
              <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
                {previa.pulados.map(p => (
                  <li key={p.titleId}>
                    <strong>{p.cliente || p.titulo}</strong>: {p.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {previa.total === 0 && previa.pulados.length === 0 && <Aviso tipo="info">Nada a cobrar neste período.</Aviso>}
        </div>
      )}
    </ModalShell>
  );
};
