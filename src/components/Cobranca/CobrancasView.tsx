import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clock, Eye, Loader2, PlugZap, RefreshCw, Search, Settings2, WalletCards } from 'lucide-react';
import { Badge, Button, Card, IconTile, StatTile } from '../Common/ui';
import { Aviso, ResultadoModal } from '../Fiscal/nfseUi';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import {
  ASAAS_CHANGED_EVENT, asaasApi, avisarMudancaAsaas, dispensar, listarCobrancas, listarReceitas, situacaoDaCobranca, tentarDeNovo,
  type AsaasCharge, type AsaasReceipt, type AsaasStatusInfo
} from '../../services/asaasService';
import { processarRecebimentos } from '../../services/asaasBaixaService';
import { AsaasConfigModal } from './AsaasConfigModal';
import { DetalheCobrancaModal, PreviaRoboModal } from './CobrancaModais';

type Filtro = 'TODAS' | 'ABERTAS' | 'ATRASO' | 'PAGAS' | 'CANCELADAS';
const hoje = () => new Date().toISOString().split('T')[0];
const PAGO = ['RECEIVED', 'RECEIVED_IN_CASH', 'CONFIRMED'];
const ehPago = (c: AsaasCharge) => PAGO.includes(c.status);
const ehCancelada = (c: AsaasCharge) => ['DELETED', 'REFUNDED'].includes(c.status);
const atrasada = (c: AsaasCharge) => c.status === 'OVERDUE' || (c.status === 'PENDING' && c.due_date < hoje());

export const CobrancasView: React.FC = () => {
  const [status, setStatus] = useState<AsaasStatusInfo | null>(null);
  const [erroStatus, setErroStatus] = useState('');
  const [cobrancas, setCobrancas] = useState<AsaasCharge[]>([]);
  const [receitas, setReceitas] = useState<AsaasReceipt[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('ABERTAS');
  const [busca, setBusca] = useState('');
  const [config, setConfig] = useState(false);
  const [previa, setPrevia] = useState(false);
  const [detalhe, setDetalhe] = useState<AsaasCharge | null>(null);
  const [resultado, setResultado] = useState<{ tipo: 'sucesso' | 'erro'; titulo: string; texto: string } | null>(null);
  const [rodando, setRodando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const s = await asaasApi.status();
      setStatus(s);
      setErroStatus('');
      if (s.bancoPronto && s.config) {
        const [c, r] = await Promise.all([listarCobrancas(), listarReceitas()]);
        setCobrancas(c);
        setReceitas(r);
      }
    } catch (e: any) {
      setErroStatus(e?.message || 'Não foi possível consultar a cobrança.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const aoMudar = () => void carregar();
    window.addEventListener(ASAAS_CHANGED_EVENT, aoMudar);
    return () => window.removeEventListener(ASAAS_CHANGED_EVENT, aoMudar);
  }, [carregar]);

  // Nomes do cliente e número do título (vêm dos dados que o sistema já tem)
  const nomes = useMemo(() => {
    const clientes = new Map(storage.getCounterparties().map(p => [p.id, p.name]));
    const titulos = new Map(storage.getTitles().map(t => [t.id, { numero: t.titleNumber, desc: t.description, cliente: clientes.get(t.counterpartyId) || '' }]));
    return { titulos, clientes };
  }, [cobrancas]);
  const nomeCliente = (c: AsaasCharge) => nomes.titulos.get(c.title_id)?.cliente || (c.counterparty_id && nomes.clientes.get(c.counterparty_id)) || 'Cliente';
  const numeroTitulo = (c: AsaasCharge) => nomes.titulos.get(c.title_id)?.numero || '—';

  const atualizar = async () => {
    setAtualizando(true);
    try {
      if (status?.config?.ativo) await asaasApi.sincronizar().catch(() => null);
      await processarRecebimentos();
      await carregar();
    } finally {
      setAtualizando(false);
    }
  };

  const resumo = useMemo(() => {
    const mes = hoje().slice(0, 7);
    const abertas = cobrancas.filter(c => ['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(c.status));
    const atrasadas = abertas.filter(atrasada);
    const aVencer = abertas.filter(c => !atrasada(c));
    const pagas = cobrancas.filter(c => ehPago(c) && (c.paid_at || '').startsWith(mes));
    const soma = (l: AsaasCharge[]) => l.reduce((a, c) => a + Number(c.value), 0);
    const problemas = cobrancas.filter(c => c.apply_error || c.revisar_motivo).length + receitas.filter(r => r.apply_error).length;
    return { aVencer: aVencer.length, aVencerValor: soma(aVencer), atrasadas: atrasadas.length, atrasadasValor: soma(atrasadas), pagas: pagas.length, pagasValor: soma(pagas), problemas };
  }, [cobrancas, receitas]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cobrancas.filter(c => {
      if (filtro === 'ABERTAS' && !['PENDING', 'OVERDUE', 'AWAITING_RISK_ANALYSIS'].includes(c.status)) return false;
      if (filtro === 'ATRASO' && !(atrasada(c) && ['PENDING', 'OVERDUE'].includes(c.status))) return false;
      if (filtro === 'PAGAS' && !ehPago(c)) return false;
      if (filtro === 'CANCELADAS' && !ehCancelada(c)) return false;
      if (!q) return true;
      return `${nomeCliente(c)} ${numeroTitulo(c)} ${c.asaas_payment_id}`.toLowerCase().includes(q);
    });
  }, [cobrancas, filtro, busca, nomes]);

  const pendencias = useMemo(
    () => ({
      cobrancas: cobrancas.filter(c => c.apply_error || c.revisar_motivo),
      receitas: receitas.filter(r => r.apply_error)
    }),
    [cobrancas, receitas]
  );

  const rodarRobo = async () => {
    setRodando(true);
    try {
      const r = await asaasApi.rodarAgora();
      await carregar();
      setResultado(
        r.erro
          ? { tipo: 'erro', titulo: 'O robô parou', texto: r.erro }
          : { tipo: 'sucesso', titulo: 'Robô executado', texto: `${r.gerados} cobrança(s) gerada(s), ${r.pulados} pulada(s)${r.restantes ? `, ${r.restantes} ficam para o próximo dia` : ''}. ${r.atualizadas} cobrança(s) atualizada(s) com o Asaas.` }
      );
    } catch (e: any) {
      setResultado({ tipo: 'erro', titulo: 'Não foi possível rodar o robô', texto: e?.message || 'Tente de novo.' });
    } finally {
      setRodando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-[var(--text-muted)] gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando as cobranças…
      </div>
    );
  }
  if (erroStatus || !status) {
    return (
      <div className="space-y-4">
        <Aviso tipo="erro">{erroStatus || 'Não foi possível consultar a cobrança.'}</Aviso>
        <Button onClick={() => void carregar()} icon={<RefreshCw className="w-4 h-4" />}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  if (!status.servidorPronto) {
    return <Aviso tipo="info">O servidor ainda não está pronto para a cobrança pelo Asaas. Falta configurar: {(status.faltando || []).join(', ')}.</Aviso>;
  }
  if (!status.bancoPronto) {
    return <Aviso tipo="info">A cobrança pelo Asaas ainda não foi instalada no banco de dados. Fale com a consultoria.</Aviso>;
  }

  const cfg = status.config;
  const ligado = Boolean(cfg?.ativo);

  if (!ligado) {
    return (
      <div className="space-y-6">
        <Card hero>
          <div className="flex flex-col md:flex-row md:items-center gap-5">
            <IconTile>
              <PlugZap />
            </IconTile>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold">Cobre os honorários pelo Asaas</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)] leading-relaxed max-w-2xl">
                Gere boleto ou Pix dos honorários, envie ao cliente e deixe o sistema dar a baixa sozinho quando o pagamento cair. Atrasos aparecem na hora. {cfg ? 'A conexão está desligada.' : ''}
              </p>
            </div>
            {status.podeGerenciar ? (
              <Button variant="primary" className="h-12 px-6 shrink-0" onClick={() => setConfig(true)} icon={<Settings2 className="w-4 h-4" />}>
                {cfg ? 'Configurar e ligar' : 'Conectar o Asaas'}
              </Button>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">Peça ao responsável pela empresa ou à consultoria para conectar.</p>
            )}
          </div>
        </Card>
        {config && <AsaasConfigModal status={status} onClose={() => setConfig(false)} onSaved={() => void carregar()} />}
      </div>
    );
  }

  const resumoRobo = cfg?.ultimo_resumo_robo;
  const filtros: { id: Filtro; rotulo: string }[] = [
    { id: 'ABERTAS', rotulo: 'Em aberto' },
    { id: 'ATRASO', rotulo: 'Em atraso' },
    { id: 'PAGAS', rotulo: 'Pagas' },
    { id: 'CANCELADAS', rotulo: 'Canceladas' },
    { id: 'TODAS', rotulo: 'Todas' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
          Boletos e Pix dos honorários. Quando o cliente paga, o sistema dá a baixa sozinho.
          {cfg?.ambiente === 'sandbox' && <Badge tone="gold" className="ml-2">Ambiente de testes</Badge>}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={() => void atualizar()} disabled={atualizando} icon={atualizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}>
            Atualizar
          </Button>
          {status.podeGerenciar && (
            <Button onClick={() => setConfig(true)} icon={<Settings2 className="w-4 h-4" />}>
              Configurar
            </Button>
          )}
        </div>
      </div>

      {!cfg?.webhook_ativado_em && status.podeGerenciar && (
        <Aviso tipo="aviso">
          Os avisos automáticos de pagamento ainda não foram ativados. Sem eles o sistema só descobre os pagamentos quando você toca em Atualizar. Ative em Configurar.
        </Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatTile label="A vencer" value={formatBRL(resumo.aVencerValor)} hint={`${resumo.aVencer} cobrança(s)`} icon={<Clock />} onClick={() => setFiltro('ABERTAS')} active={filtro === 'ABERTAS'} />
        <StatTile label="Em atraso" value={formatBRL(resumo.atrasadasValor)} hint={`${resumo.atrasadas} cobrança(s)`} tone={resumo.atrasadas ? 'danger' : 'neutral'} icon={<AlertTriangle />} onClick={() => setFiltro('ATRASO')} active={filtro === 'ATRASO'} />
        <StatTile label="Recebido no mês" value={formatBRL(resumo.pagasValor)} hint={`${resumo.pagas} pagamento(s)`} tone="success" icon={<CheckCircle2 />} onClick={() => setFiltro('PAGAS')} active={filtro === 'PAGAS'} />
        <StatTile label="Pedem atenção" value={String(resumo.problemas)} hint={resumo.problemas ? 'Veja abaixo' : 'Tudo certo'} tone={resumo.problemas ? 'danger' : 'neutral'} icon={<WalletCards />} />
      </div>

      {(pendencias.cobrancas.length > 0 || pendencias.receitas.length > 0) && (
        <Card>
          <h2 className="text-[17px] font-semibold mb-1">Pedem atenção</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">A baixa automática não conseguiu terminar, ou algo mudou no Asaas depois da baixa.</p>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {pendencias.cobrancas.map(c => (
              <li key={c.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{nomeCliente(c)} · {numeroTitulo(c)} · {formatBRL(Number(c.value))}</p>
                  <p className="text-xs text-[var(--status-danger)] mt-0.5">{c.apply_error || c.revisar_motivo}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {c.apply_error && (
                    <Button
                      onClick={async () => {
                        await tentarDeNovo('charge', c.id);
                        await processarRecebimentos();
                        avisarMudancaAsaas();
                      }}
                    >
                      Tentar de novo
                    </Button>
                  )}
                  {(status.podeGerenciar || !c.apply_error) && (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await dispensar('charge', c.id);
                        avisarMudancaAsaas();
                      }}
                    >
                      {c.apply_error ? 'Dispensar' : 'Entendi'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {pendencias.receitas.map(r => (
              <li key={r.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Assinatura do CRM Varejo · {r.customer_name || 'cliente'} · {formatBRL(Number(r.value))}</p>
                  <p className="text-xs text-[var(--status-danger)] mt-0.5">{r.apply_error}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    onClick={async () => {
                      await tentarDeNovo('receipt', r.id);
                      await processarRecebimentos();
                      avisarMudancaAsaas();
                    }}
                  >
                    Tentar de novo
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile>
              <Bot />
            </IconTile>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold">Robô diário</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {cfg?.robo_ativo ? `Gera boleto ou Pix ${cfg.antecedencia_dias} dias antes do vencimento, até ${cfg.limite_por_execucao} por dia.` : 'Desligado. Nada é gerado sozinho.'}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setPrevia(true)} icon={<Eye className="w-4 h-4" />}>
              Ver prévia
            </Button>
            {status.podeGerenciar && (
              <Button onClick={() => void rodarRobo()} disabled={rodando} icon={rodando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}>
                Rodar agora
              </Button>
            )}
          </div>
        </div>
        {resumoRobo && (
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            Última execução em {new Date(resumoRobo.em).toLocaleString('pt-BR')}:{' '}
            {resumoRobo.erro ? <span className="text-[var(--status-danger)]">{resumoRobo.erro}</span> : `${resumoRobo.gerados} gerada(s), ${resumoRobo.pulados} pulada(s)${resumoRobo.restantes ? `, ${resumoRobo.restantes} para o próximo dia` : ''}.`}
          </p>
        )}
      </Card>

      <Card padded={false}>
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-subtle)]">
          <div className="flex flex-wrap gap-2">
            {filtros.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`h-9 px-3.5 rounded-full text-sm border transition cursor-pointer ${filtro === f.id ? 'border-[var(--brand-gold-fill)] bg-[var(--brand-gold-soft)] font-semibold text-[var(--text-primary)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input className="w-full h-10 pl-10 pr-3 rounded-xl border border-[var(--border-highlight)] bg-[var(--surface-input)] text-sm focus:outline-hidden focus:border-[var(--brand-gold-fill)]" placeholder="Buscar cliente ou título" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </div>
        {lista.length === 0 ? (
          <p className="p-8 text-sm text-center text-[var(--text-muted)]">{cobrancas.length === 0 ? 'Nenhuma cobrança gerada ainda. Veja a prévia do robô ou gere pela tela Contas a receber.' : 'Nenhuma cobrança neste filtro.'}</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {lista.slice(0, 300).map(c => {
              const sit = situacaoDaCobranca(c);
              return (
                <li key={c.id} className="px-5 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-sm font-medium truncate">{nomeCliente(c)}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">Título {numeroTitulo(c)} · {c.billing_type === 'PIX' ? 'Pix' : 'Boleto'}{c.origin === 'ROBO' ? ' · robô' : ''}</p>
                  </div>
                  <div className="text-sm w-24 shrink-0">
                    <p className="text-xs text-[var(--text-muted)]">{c.paid_at ? 'Pago em' : 'Vence'}</p>
                    <p className="font-medium">{formatDateBR(c.paid_at || c.due_date)}</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums w-28 shrink-0">{formatBRL(Number(c.value))}</p>
                  <div className="w-44 shrink-0">
                    <Badge tone={sit.tom}>{sit.texto}</Badge>
                  </div>
                  <Button onClick={() => setDetalhe(c)} icon={<Eye className="w-4 h-4" />}>
                    Ver
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {receitas.length > 0 && (
        <Card>
          <h2 className="text-[17px] font-semibold mb-1">Assinaturas do sistema recebidas</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">Pagamentos de mensalidade do CRM Varejo que o Asaas recebeu e entraram aqui como receita.</p>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {receitas.slice(0, 20).map(r => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.customer_name || 'Cliente'} · {formatDateBR(r.paid_at || r.created_at)}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums font-medium">{formatBRL(Number(r.value))}</span>
                  <Badge tone={r.applied_at ? 'success' : r.apply_error ? 'danger' : 'info'}>{r.applied_at ? 'Lançada' : r.apply_error ? 'Com problema' : 'Lançando…'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {config && <AsaasConfigModal status={status} onClose={() => setConfig(false)} onSaved={() => void carregar()} />}
      {previa && <PreviaRoboModal onClose={() => setPrevia(false)} />}
      {detalhe && (
        <DetalheCobrancaModal
          cobranca={detalhe}
          cliente={nomeCliente(detalhe)}
          titulo={`Título ${numeroTitulo(detalhe)}`}
          podeCancelar={status.podeGerenciar}
          onClose={() => setDetalhe(null)}
          onCancelada={() => {
            setDetalhe(null);
            void carregar();
          }}
        />
      )}
      {resultado && (
        <ResultadoModal tipo={resultado.tipo} titulo={resultado.titulo} onClose={() => setResultado(null)}>
          {resultado.texto}
        </ResultadoModal>
      )}
    </div>
  );
};

export default CobrancasView;
