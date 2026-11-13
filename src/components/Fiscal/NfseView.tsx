import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FilePlus2, Settings2, Search, ChevronLeft, ChevronRight, FileText, FileCode2, Ban, RefreshCw, Loader2,
  Download, ShieldCheck, Building2, CheckCircle2, CircleDashed, FileCheck2, Hourglass, XCircle, Info, ServerCog
} from 'lucide-react';
import { Card, Button, Badge, PageToolbar, StatCard, TabPills, Tone, MoreMenu } from '../Common/ui';
import { PremiumSelect } from '../Common/PremiumSelect';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { matchesSearch } from '../../utils/searchUtils';
import { montarZip, FormatoExport } from '../../utils/nfseExport';
import { nfseService, baixarArquivo, NfseNote, NfseStatus, NfseStatusInfo, NfseConfig, NfseError, formatarDocumento, pendenciasDaConfig } from '../../services/nfseService';
import { NfseConfigModal } from './NfseConfigModal';
import { NfseEmitModal } from './NfseEmitModal';
import { ModalShell, ResultadoModal, Campo, CAMPO, Aviso } from './nfseUi';

const STATUS: Record<NfseStatus, { label: string; tone: Tone }> = {
  AUTORIZADA: { label: 'Emitida', tone: 'success' },
  PROCESSANDO: { label: 'Em processamento', tone: 'info' },
  REJEITADA: { label: 'Não emitida', tone: 'danger' },
  CANCELADA: { label: 'Cancelada', tone: 'neutral' }
};

const MOTIVOS_CANCELAMENTO = [
  { v: 1, l: 'Erro na emissão' },
  { v: 2, l: 'Serviço não prestado' },
  { v: 9, l: 'Outros' }
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesAtual = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
function somarMes(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const nomeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${a}`;
};
const numeroDaNota = (n: NfseNote) => (n.numero_nfse ? `Nº ${n.numero_nfse}` : `Envio ${n.numero_dps}`);

export const NfseView: React.FC<{ initialSearch?: string }> = ({ initialSearch }) => {
  const [info, setInfo] = useState<NfseStatusInfo | null>(null);
  const [erroInicial, setErroInicial] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [notas, setNotas] = useState<NfseNote[]>([]);
  const [carregandoNotas, setCarregandoNotas] = useState(false);
  const [erroLista, setErroLista] = useState('');
  const [mes, setMes] = useState(mesAtual());
  const [busca, setBusca] = useState(initialSearch || '');
  const [filtro, setFiltro] = useState<'TODAS' | NfseStatus>('TODAS');

  const [configAberta, setConfigAberta] = useState<null | 'DADOS' | 'CERTIFICADO'>(null);
  const [emitirAberto, setEmitirAberto] = useState(false);
  const [resultado, setResultado] = useState<NfseNote | null>(null);
  const [detalhe, setDetalhe] = useState<NfseNote | null>(null);
  const [cancelar, setCancelar] = useState<NfseNote | null>(null);
  const [motivoCod, setMotivoCod] = useState(1);
  const [motivoTexto, setMotivoTexto] = useState('');
  const [erroCancelar, setErroCancelar] = useState('');
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; titulo: string; texto: string } | null>(null);
  const [exportando, setExportando] = useState<{ feito: number; total: number; rotulo: string } | null>(null);
  const [resumoExport, setResumoExport] = useState<{ nome: string; incluidas: number; falhas: { numero: string; motivo: string }[]; fora: number; pastas: string } | null>(null);
  const cancelarExport = useRef(false);
  const [ocupada, setOcupada] = useState<{ id: string; acao: string } | null>(null);
  const pedidoLista = useRef(0);

  const config: NfseConfig | null = info?.config || null;
  const pend = pendenciasDaConfig(config);
  const pronto = Boolean(info?.servidorPronto && info.bancoPronto && pend.dadosFiscais && pend.certificado && !pend.certificadoVencido);
  const ambiente: 1 | 2 = config?.ambiente ?? 2;

  const carregarStatus = useCallback(async () => {
    setCarregando(true);
    setErroInicial('');
    try {
      setInfo(await nfseService.status());
    } catch (e) {
      setErroInicial(e instanceof NfseError ? e.message : 'Não foi possível abrir as notas fiscais.');
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarNotas = useCallback(async () => {
    const pedido = ++pedidoLista.current;
    setCarregandoNotas(true);
    setErroLista('');
    try {
      const r = await nfseService.listar(ambiente, mes);
      if (pedido === pedidoLista.current) setNotas(r.notas);
    } catch (e) {
      if (pedido === pedidoLista.current) setErroLista(e instanceof NfseError ? e.message : 'Não foi possível carregar as notas.');
    } finally {
      if (pedido === pedidoLista.current) setCarregandoNotas(false);
    }
  }, [ambiente, mes]);

  useEffect(() => { carregarStatus(); }, [carregarStatus]);
  useEffect(() => {
    if (info?.servidorPronto && info.bancoPronto) carregarNotas();
  }, [info?.servidorPronto, info?.bancoPronto, carregarNotas]);

  const substituirNota = (nota: NfseNote) => setNotas(lista => (lista.some(n => n.id === nota.id) ? lista.map(n => (n.id === nota.id ? nota : n)) : [nota, ...lista]));

  const registrarAuditoria = (acao: string, nota: NfseNote, detalhes: string) => {
    try {
      const u = storage.getCurrentUser();
      storage.addAuditLog({ userName: u.name, userRole: u.role, action: acao, module: 'Notas fiscais', recordId: nota.id, details: detalhes });
    } catch { /* a trilha oficial da nota fica no servidor */ }
  };

  const aoEmitir = (nota: NfseNote) => {
    setEmitirAberto(false);
    if (nota.competencia.slice(0, 7) === mes) substituirNota(nota);
    else setMes(nota.competencia.slice(0, 7));
    setResultado(nota);
    if (nota.status === 'AUTORIZADA') registrarAuditoria('EMISSAO_NFSE', nota, `Nota fiscal ${nota.numero_nfse || ''} emitida para ${nota.tomador_nome} (${formatBRL(nota.valor_servico)}).`);
  };

  const executar = async (nota: NfseNote, acao: 'pdf' | 'xml' | 'conferir') => {
    setOcupada({ id: nota.id, acao });
    try {
      if (acao === 'pdf') await nfseService.baixarPdf(nota);
      else if (acao === 'xml') await nfseService.baixarXml(nota.id);
      else {
        const r = await nfseService.conferir(nota.id);
        substituirNota(r.nota);
        setResultado(r.nota);
      }
    } catch (e) {
      setMensagem({ tipo: 'erro', titulo: acao === 'conferir' ? 'Não foi possível conferir a nota' : 'Não foi possível baixar', texto: e instanceof NfseError ? e.message : 'Tente de novo em instantes.' });
    } finally {
      setOcupada(null);
    }
  };

  const confirmarCancelamento = async () => {
    if (!cancelar) return;
    if (motivoTexto.trim().length < 15) {
      setErroCancelar('Explique o motivo com pelo menos 15 caracteres.');
      return;
    }
    setErroCancelar('');
    setOcupada({ id: cancelar.id, acao: 'cancelar' });
    try {
      const r = await nfseService.cancelar(cancelar.id, motivoCod, motivoTexto.trim());
      substituirNota(r.nota);
      registrarAuditoria('CANCELAMENTO_NFSE', r.nota, `Nota fiscal ${r.nota.numero_nfse || ''} cancelada. Motivo: ${motivoTexto.trim()}`);
      setCancelar(null);
      setMensagem({ tipo: 'sucesso', titulo: 'Nota cancelada', texto: `A nota ${r.nota.numero_nfse ? `nº ${r.nota.numero_nfse} ` : ''}de ${r.nota.tomador_nome} foi cancelada no Portal Nacional.` });
    } catch (e) {
      setErroCancelar(e instanceof NfseError ? e.message : 'Não foi possível cancelar a nota.');
    } finally {
      setOcupada(null);
    }
  };

  const contagem = useMemo(() => {
    const c = { AUTORIZADA: 0, PROCESSANDO: 0, REJEITADA: 0, CANCELADA: 0 } as Record<NfseStatus, number>;
    let valorEmitido = 0;
    for (const n of notas) {
      c[n.status]++;
      if (n.status === 'AUTORIZADA') valorEmitido += Math.round(Number(n.valor_servico) * 100);
    }
    return { ...c, valorEmitido: valorEmitido / 100 };
  }, [notas]);

  const visiveis = useMemo(
    () => notas.filter(n => (filtro === 'TODAS' || n.status === filtro) && (!busca.trim() || matchesSearch([n.tomador_nome, n.tomador_documento, n.numero_nfse || '', n.descricao], busca))),
    [notas, filtro, busca]
  );

  const exportaveis = useMemo(() => visiveis.filter(n => (n.status === 'AUTORIZADA' || n.status === 'CANCELADA') && n.chave_acesso).length, [visiveis]);

  const exportar = async (formatos: FormatoExport[]) => {
    if (exportando) return;
    if (exportaveis === 0) {
      setMensagem({ tipo: 'erro', titulo: 'Nada para exportar', texto: 'Não há notas emitidas na lista de agora. Mude o mês ou o filtro e tente de novo.' });
      return;
    }
    cancelarExport.current = false;
    setExportando({ feito: 0, total: exportaveis, rotulo: formatos.length === 2 ? 'PDFs e XMLs' : formatos[0] === 'PDF' ? 'PDFs' : 'XMLs' });
    try {
      const r = await montarZip({
        notas: visiveis,
        formatos,
        titulo: nomeMes(mes),
        obterXmls: async ids => (await nfseService.xmlLote(ids)).notas,
        gerarPdf: async (xml, situacao) => (await import('../../utils/nfsePdf')).gerarPdfNfse({ xml, situacao }),
        onProgresso: (feito, total) => setExportando(e => (e ? { ...e, feito, total } : e)),
        cancelado: () => cancelarExport.current
      });
      if (r.incluidas === 0) {
        setMensagem({ tipo: 'erro', titulo: 'Não foi possível exportar', texto: r.falhas[0]?.motivo || 'Nenhuma nota pôde ser incluída no arquivo.' });
      } else {
        baixarArquivo(r.blob, r.nomeArquivo);
        setResumoExport({ nome: r.nomeArquivo, incluidas: r.incluidas, falhas: r.falhas, fora: r.fora, pastas: formatos.length === 2 ? 'as pastas PDF e XML' : `a pasta ${formatos[0]}` });
      }
    } catch (e) {
      if (!(e instanceof Error && e.message === 'CANCELADO')) {
        setMensagem({ tipo: 'erro', titulo: 'Não foi possível exportar', texto: e instanceof NfseError ? e.message : 'Algo deu errado ao montar o arquivo. Tente de novo.' });
      }
    } finally {
      setExportando(null);
    }
  };


  const vendasComNota = useMemo(() => new Set(notas.filter(n => n.sale_id && (n.status === 'AUTORIZADA' || n.status === 'PROCESSANDO')).map(n => n.sale_id as string)), [notas]);

  const acoesDaNota = (n: NfseNote, compacto = false) => {
    const rodando = (acao: string) => ocupada?.id === n.id && ocupada.acao === acao;
    const cls = compacto ? 'h-11 flex-1' : 'h-9 px-3';
    return (
      <>
        {(n.status === 'AUTORIZADA' || n.status === 'CANCELADA') && n.chave_acesso && (
          <>
            <Button className={cls} disabled={Boolean(ocupada)} onClick={() => executar(n, 'pdf')} icon={rodando('pdf') ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}>PDF</Button>
            <Button className={cls} disabled={Boolean(ocupada)} onClick={() => executar(n, 'xml')} icon={rodando('xml') ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode2 className="w-4 h-4" />}>XML</Button>
          </>
        )}
        {n.status === 'AUTORIZADA' && info?.podeGerenciar && (
          <Button variant="danger" className={cls} disabled={Boolean(ocupada)} onClick={() => { setMotivoCod(1); setMotivoTexto(''); setErroCancelar(''); setCancelar(n); }} icon={<Ban className="w-4 h-4" />}>Cancelar</Button>
        )}
        {n.status === 'PROCESSANDO' && (
          <Button variant="primary" className={cls} disabled={Boolean(ocupada)} onClick={() => executar(n, 'conferir')} icon={rodando('conferir') ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}>Conferir situação</Button>
        )}
        {(n.status === 'REJEITADA' || (n.status === 'CANCELADA' && n.cancel_motivo)) && (
          <Button className={cls} onClick={() => setDetalhe(n)} icon={<Info className="w-4 h-4" />}>Ver motivo</Button>
        )}
      </>
    );
  };

  // ---------------------------------------------------------------- estados de abertura
  if (carregando) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-10 w-2/3 max-w-md rounded-xl bg-[var(--surface-elevated)] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-[132px] rounded-2xl bg-[var(--surface-elevated)] animate-pulse" />)}
        </div>
        <div className="h-64 rounded-2xl bg-[var(--surface-elevated)] animate-pulse" />
      </div>
    );
  }

  if (erroInicial) {
    return (
      <Card className="max-w-xl mx-auto text-center py-12">
        <div className="mx-auto w-14 h-14 rounded-full bg-[var(--status-danger-bg)] flex items-center justify-center"><XCircle className="w-7 h-7 text-[var(--status-danger)]" /></div>
        <h2 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">Não foi possível abrir as notas fiscais</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{erroInicial}</p>
        <Button variant="primary" className="mt-6 h-11" onClick={carregarStatus} icon={<RefreshCw className="w-4 h-4" />}>Tentar de novo</Button>
      </Card>
    );
  }

  if (info && (!info.servidorPronto || !info.bancoPronto)) {
    return (
      <Card hero className="max-w-2xl mx-auto text-center py-12 sm:py-14">
        <span className="icon-tile-gold w-14 h-14 rounded-2xl mx-auto [&>svg]:w-7 [&>svg]:h-7"><ServerCog /></span>
        <h2 className="mt-6 text-xl font-semibold text-[var(--text-primary)]">A emissão de notas ainda não foi ativada</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-md mx-auto simple-only">A Contaju está preparando a emissão de notas fiscais para a sua empresa. Fale com a gente para liberar.</p>
        <div className="adv-only mt-2 text-sm text-[var(--text-secondary)] max-w-md mx-auto">
          <p>Falta concluir a instalação no servidor:</p>
          <ul className="mt-4 space-y-2 text-left inline-block">
            {!info.servidorPronto && (info.faltando || []).map(v => (
              <li key={v} className="flex items-center gap-2.5"><CircleDashed className="w-4 h-4 text-[var(--status-warning)] shrink-0" />Variável de ambiente <code className="px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] text-xs">{v}</code></li>
            ))}
            {info.servidorPronto && !info.bancoPronto && (
              <li className="flex items-center gap-2.5"><CircleDashed className="w-4 h-4 text-[var(--status-warning)] shrink-0" />Aplicar a migration de notas fiscais no banco</li>
            )}
          </ul>
        </div>
        <div><Button className="mt-7 h-11" onClick={carregarStatus} icon={<RefreshCw className="w-4 h-4" />}>Verificar de novo</Button></div>
      </Card>
    );
  }

  // ---------------------------------------------------------------- tela principal
  const passos = [
    { ok: pend.dadosFiscais, titulo: 'Dados fiscais da empresa', texto: 'CNPJ, município e enquadramento tributário.', aba: 'DADOS' as const, icone: <Building2 className="w-5 h-5" /> },
    { ok: pend.certificado && !pend.certificadoVencido, titulo: pend.certificadoVencido ? 'Certificado digital vencido' : 'Certificado digital A1', texto: pend.certificadoVencido ? 'Envie um certificado válido para voltar a emitir.' : 'O arquivo .pfx da empresa, exigido pelo Portal Nacional.', aba: 'CERTIFICADO' as const, icone: <ShieldCheck className="w-5 h-5" /> }
  ];
  // Antes da primeira configuração a tela mostra só os passos (sem indicadores zerados).
  const mostrarLista = pronto || notas.length > 0 || Boolean(erroLista) || mes !== mesAtual();
  const diasCert = config?.cert_validade ? Math.ceil((new Date(config.cert_validade).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="space-y-6">
      <PageToolbar description="Emita as notas fiscais de serviço direto no Portal Nacional, sem sair do sistema.">
        {pronto && (
          <MoreMenu
            label="Exportar"
            items={[
              { label: 'PDFs e XMLs juntos', icon: <Download className="w-4 h-4" />, hint: `${exportaveis} ${exportaveis === 1 ? 'nota' : 'notas'} em um arquivo .zip`, onClick: () => exportar(['PDF', 'XML']) },
              { label: 'Só os PDFs', icon: <FileText className="w-4 h-4" />, hint: 'Um .zip com o PDF de cada nota', onClick: () => exportar(['PDF']) },
              { label: 'Só os XMLs', icon: <FileCode2 className="w-4 h-4" />, hint: 'Um .zip com o XML de cada nota (o documento fiscal)', onClick: () => exportar(['XML']) }
            ]}
          />
        )}
        {info?.podeGerenciar && (
          <Button className="h-11 sm:h-10" icon={<Settings2 className="w-4 h-4" />} onClick={() => setConfigAberta('DADOS')}>Configurar emissão</Button>
        )}
        <Button variant="primary" className="h-11 sm:h-10 flex-1 sm:flex-none" icon={<FilePlus2 className="w-4 h-4" />} disabled={!pronto} onClick={() => setEmitirAberto(true)}>Emitir nota</Button>
      </PageToolbar>

      {!pronto && (
        <Card hero className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Falta pouco para emitir a primeira nota</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {info?.podeGerenciar ? 'Conclua os dois passos abaixo. É feito uma vez só.' : 'A configuração precisa ser concluída pelo responsável pela empresa ou pela Contaju.'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {passos.map((p, i) => (
              <div key={p.aba} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3.5">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: p.ok ? 'var(--status-success-bg)' : 'var(--brand-gold-soft)', color: p.ok ? 'var(--status-success)' : 'var(--brand-gold)' }}>
                    {p.ok ? <CheckCircle2 className="w-5 h-5" /> : p.icone}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-muted)]">Passo {i + 1}</p>
                    <p className="text-[15px] font-semibold text-[var(--text-primary)]">{p.titulo}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{p.texto}</p>
                  </div>
                </div>
                {p.ok ? (
                  <Badge tone="success" className="self-start">Concluído</Badge>
                ) : info?.podeGerenciar ? (
                  <Button variant="primary" className="h-11 w-full sm:w-auto sm:self-start" onClick={() => setConfigAberta(p.aba)}>{p.aba === 'DADOS' ? 'Preencher dados' : 'Enviar certificado'}</Button>
                ) : (
                  <Badge tone="gold" className="self-start">Pendente</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {pronto && ambiente === 2 && (
        <Aviso tipo="info">
          Ambiente de testes: as notas emitidas aqui não têm valor fiscal.{info?.podeGerenciar ? ' Quando estiver tudo conferido, mude para Produção em Configurar emissão.' : ''}
        </Aviso>
      )}
      {pronto && diasCert !== null && diasCert <= 30 && (
        <Aviso>O certificado digital vence em {diasCert} {diasCert === 1 ? 'dia' : 'dias'}. Renove e envie o novo para não parar de emitir.</Aviso>
      )}

      {mostrarLista && (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Valor emitido no mês" value={formatBRL(contagem.valorEmitido)} hint={`${contagem.AUTORIZADA} ${contagem.AUTORIZADA === 1 ? 'nota' : 'notas'}`} icon={<FileCheck2 />} accent="success" />
        {/* No celular as contagens já aparecem nas abas de situação logo abaixo */}
        <div className="hidden lg:block"><StatCard label="Em processamento" value={contagem.PROCESSANDO} hint={contagem.PROCESSANDO ? 'Confira a situação' : 'Nada pendente'} icon={<Hourglass />} accent="info" /></div>
        <div className="hidden lg:block"><StatCard label="Não emitidas" value={contagem.REJEITADA} hint="Recusadas pelo portal" icon={<XCircle />} accent="danger" tone={contagem.REJEITADA ? 'danger' : 'neutral'} /></div>
        <div className="hidden lg:block"><StatCard label="Canceladas" value={contagem.CANCELADA} hint="No mês" icon={<Ban />} accent="neutral" /></div>
      </div>
      )}

      {mostrarLista && (
      <Card className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center justify-between gap-1 h-11 px-1 rounded-xl border border-[var(--border-highlight)] bg-[var(--surface-input)] lg:w-[280px] shrink-0">
            <button type="button" aria-label="Mês anterior" onClick={() => setMes(m => somarMes(m, -1))} className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{nomeMes(mes)}</span>
            <button type="button" aria-label="Próximo mês" disabled={mes >= mesAtual()} onClick={() => setMes(m => somarMes(m, 1))} className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
            <input type="text" aria-label="Buscar notas" placeholder="Buscar por cliente ou número" value={busca} onChange={e => setBusca(e.target.value)} className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-[var(--border-highlight)] bg-[var(--surface-input)] text-[var(--text-primary)]" />
          </div>
        </div>
        <TabPills
          value={filtro}
          onChange={id => setFiltro(id as 'TODAS' | NfseStatus)}
          tabs={[
            { id: 'TODAS', label: 'Todas', count: notas.length },
            { id: 'AUTORIZADA', label: 'Emitidas', count: contagem.AUTORIZADA },
            { id: 'PROCESSANDO', label: 'Em processamento', count: contagem.PROCESSANDO },
            { id: 'REJEITADA', label: 'Não emitidas', count: contagem.REJEITADA },
            { id: 'CANCELADA', label: 'Canceladas', count: contagem.CANCELADA }
          ]}
        />
      </Card>
      )}

      {!mostrarLista ? null : erroLista ? (
        <Card className="text-center py-12">
          <p className="text-sm text-[var(--text-secondary)]">{erroLista}</p>
          <Button className="mt-5 h-11" onClick={carregarNotas} icon={<RefreshCw className="w-4 h-4" />}>Tentar de novo</Button>
        </Card>
      ) : carregandoNotas && notas.length === 0 ? (
        <div className="space-y-3" aria-busy="true">{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-2xl bg-[var(--surface-elevated)] animate-pulse" />)}</div>
      ) : visiveis.length === 0 ? (
        <Card className="text-center py-14">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-[var(--surface-elevated)] text-[var(--text-muted)] flex items-center justify-center"><FileText className="w-6 h-6" /></span>
          <h3 className="mt-5 text-base font-semibold text-[var(--text-primary)]">{notas.length === 0 ? `Nenhuma nota em ${nomeMes(mes).toLowerCase()}` : 'Nenhuma nota com esse filtro'}</h3>
          <p className="mt-1.5 text-sm text-[var(--text-muted)]">{notas.length === 0 ? (pronto ? 'As notas emitidas neste mês aparecem aqui.' : 'Conclua a configuração para começar a emitir.') : 'Mude a busca ou o filtro para ver outras notas.'}</p>
          {notas.length === 0 && pronto && mes === mesAtual() && (
            <Button variant="primary" className="mt-6 h-11" icon={<FilePlus2 className="w-4 h-4" />} onClick={() => setEmitirAberto(true)}>Emitir nota</Button>
          )}
        </Card>
      ) : (
        <>
          {/* Computador: tabela */}
          <Card padded={false} className="hidden xl:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
                  <th className="font-medium px-6 py-3.5">Nota</th>
                  <th className="font-medium px-4 py-3.5">Cliente</th>
                  <th className="font-medium px-4 py-3.5 whitespace-nowrap">Data do serviço</th>
                  <th className="font-medium px-4 py-3.5 text-right">Valor</th>
                  <th className="font-medium px-4 py-3.5">Situação</th>
                  <th className="font-medium px-6 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(n => (
                  <tr key={n.id} className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-[var(--text-primary)] tabular-nums">{numeroDaNota(n)}</td>
                    <td className="px-4 py-4 max-w-[320px]">
                      <div className="text-[var(--text-primary)] truncate">{n.tomador_nome}</div>
                      <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">{n.descricao}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-[var(--text-secondary)] tabular-nums">{formatDateBR(n.competencia)}</td>
                    <td className="px-4 py-4 whitespace-nowrap text-right font-semibold tabular-nums text-[var(--text-primary)]">{formatBRL(Number(n.valor_servico))}</td>
                    <td className="px-4 py-4 whitespace-nowrap"><Badge tone={STATUS[n.status].tone}>{STATUS[n.status].label}</Badge></td>
                    <td className="px-6 py-4"><div className="flex items-center justify-end gap-2">{acoesDaNota(n)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Celular e tablet: cartões */}
          <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3">
            {visiveis.map(n => (
              <Card key={n.id} className="space-y-4 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{n.tomador_nome}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">{numeroDaNota(n)} • {formatDateBR(n.competencia)}</p>
                  </div>
                  <Badge tone={STATUS[n.status].tone} className="shrink-0">{STATUS[n.status].label}</Badge>
                </div>
                <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{n.descricao}</p>
                <p className="text-xl font-semibold tabular-nums text-[var(--text-primary)]">{formatBRL(Number(n.valor_servico))}</p>
                <div className="flex items-center gap-2 flex-wrap">{acoesDaNota(n, true)}</div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ---------------------------------------------------------------- janelas */}
      {configAberta && (
        <NfseConfigModal
          config={config}
          abaInicial={configAberta}
          onClose={() => setConfigAberta(null)}
          onChange={novo => setInfo(i => (i ? { ...i, config: novo } : i))}
        />
      )}

      {emitirAberto && config && (
        <NfseEmitModal config={config} vendasComNota={vendasComNota} onClose={() => setEmitirAberto(false)} onResultado={aoEmitir} />
      )}

      {resultado && resultado.status === 'AUTORIZADA' && (
        <ResultadoModal
          tipo="sucesso"
          titulo="Nota fiscal emitida"
          onClose={() => setResultado(null)}
          acao={{ label: 'Baixar PDF da nota', carregando: ocupada?.id === resultado.id, onClick: () => executar(resultado, 'pdf') }}
        >
          Nota {resultado.numero_nfse ? <strong className="text-[var(--text-primary)]">nº {resultado.numero_nfse}</strong> : null} de{' '}
          <strong className="text-[var(--text-primary)]">{formatBRL(Number(resultado.valor_servico))}</strong> para {resultado.tomador_nome}.
          {resultado.ambiente === 2 && <span className="block mt-2 text-xs text-[var(--text-muted)]">Emitida no ambiente de testes, sem valor fiscal.</span>}
        </ResultadoModal>
      )}
      {resultado && resultado.status === 'REJEITADA' && (
        <ResultadoModal tipo="erro" titulo="A nota não foi emitida" onClose={() => setResultado(null)}>
          <p>O Portal Nacional não aceitou a nota, então nenhuma nota foi gerada. Corrija o ponto abaixo e emita de novo.</p>
          {resultado.mensagem && <p className="mt-3 rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-left text-[var(--text-primary)] whitespace-pre-wrap">{resultado.mensagem}</p>}
        </ResultadoModal>
      )}
      {resultado && resultado.status === 'PROCESSANDO' && (
        <ResultadoModal
          tipo="aviso"
          titulo="Ainda sem resposta do portal"
          onClose={() => setResultado(null)}
          acao={{ label: 'Conferir situação agora', carregando: ocupada?.id === resultado.id, onClick: () => executar(resultado, 'conferir') }}
        >
          O envio foi feito, mas o Portal Nacional não confirmou. Não emita de novo antes de conferir a situação, para não gerar nota em dobro.
        </ResultadoModal>
      )}
      {resultado && resultado.status === 'CANCELADA' && (
        <ResultadoModal tipo="aviso" titulo="Esta nota está cancelada" onClose={() => setResultado(null)}>
          A nota de {resultado.tomador_nome} consta como cancelada.
        </ResultadoModal>
      )}

      {detalhe && (
        <ResultadoModal tipo={detalhe.status === 'REJEITADA' ? 'erro' : 'aviso'} titulo={detalhe.status === 'REJEITADA' ? 'Por que a nota não foi emitida' : 'Motivo do cancelamento'} onClose={() => setDetalhe(null)}>
          <p>{detalhe.tomador_nome} • {formatBRL(Number(detalhe.valor_servico))}</p>
          <p className="mt-3 rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-left text-[var(--text-primary)] whitespace-pre-wrap">
            {detalhe.status === 'REJEITADA' ? detalhe.mensagem || 'O portal não informou o motivo.' : detalhe.cancel_motivo}
          </p>
        </ResultadoModal>
      )}

      {mensagem && (
        <ResultadoModal tipo={mensagem.tipo} titulo={mensagem.titulo} onClose={() => setMensagem(null)}>{mensagem.texto}</ResultadoModal>
      )}

      {exportando && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-label="Exportando notas">
          <div className="w-full max-w-md p-7 sm:p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[var(--brand-gold-soft)] flex items-center justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-[var(--brand-gold)]" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">Preparando os {exportando.rotulo}</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)] tabular-nums">{exportando.feito} de {exportando.total} {exportando.total === 1 ? 'nota' : 'notas'}</p>
            <div className="mt-4 h-2 rounded-full bg-[var(--surface-elevated)] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={exportando.total} aria-valuenow={exportando.feito}>
              <div className="h-full rounded-full bg-[var(--brand-gold-fill)] transition-all" style={{ width: `${exportando.total ? Math.round((exportando.feito / exportando.total) * 100) : 0}%` }} />
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">Não feche esta janela. O download começa sozinho no final.</p>
            <Button variant="ghost" className="mt-5 h-11 w-full" onClick={() => { cancelarExport.current = true; }}>Cancelar</Button>
          </div>
        </div>
      )}

      {resumoExport && (
        <ResultadoModal tipo={resumoExport.falhas.length ? 'aviso' : 'sucesso'} titulo={resumoExport.falhas.length ? 'Exportação pronta, com avisos' : 'Exportação pronta'} onClose={() => setResumoExport(null)}>
          <p>
            <strong className="text-[var(--text-primary)]">{resumoExport.incluidas} {resumoExport.incluidas === 1 ? 'nota' : 'notas'}</strong> no arquivo <span className="break-all">{resumoExport.nome}</span>, que já foi baixado. Dentro dele há {resumoExport.pastas} e a planilha <strong className="text-[var(--text-primary)]">indice.csv</strong>.
          </p>
          {resumoExport.fora > 0 && <p className="mt-3 text-xs text-[var(--text-muted)]">{resumoExport.fora} {resumoExport.fora === 1 ? 'nota da lista não entrou, porque não foi emitida' : 'notas da lista não entraram, porque não foram emitidas'} (recusadas ou em processamento).</p>}
          {resumoExport.falhas.length > 0 && (
            <div className="mt-3 rounded-xl bg-[var(--surface-elevated)] px-4 py-3 text-left text-xs text-[var(--text-primary)] max-h-40 overflow-y-auto">
              {resumoExport.falhas.slice(0, 20).map((f, i) => <p key={i}>Nota {f.numero}: {f.motivo}</p>)}
              {resumoExport.falhas.length > 20 && <p>... e mais {resumoExport.falhas.length - 20}.</p>}
            </div>
          )}
        </ResultadoModal>
      )}

      {cancelar && (
        <ModalShell
          size="md"
          title="Cancelar nota fiscal"
          subtitle={`${numeroDaNota(cancelar)} • ${cancelar.tomador_nome} • ${formatBRL(Number(cancelar.valor_servico))}`}
          icon={<Ban />}
          onClose={() => setCancelar(null)}
          bloqueado={ocupada?.acao === 'cancelar'}
          footer={
            <>
              <Button variant="ghost" className="h-11" onClick={() => setCancelar(null)} disabled={ocupada?.acao === 'cancelar'}>Manter a nota</Button>
              <Button variant="danger" className="h-11 sm:min-w-[180px]" onClick={confirmarCancelamento} disabled={ocupada?.acao === 'cancelar'} icon={ocupada?.acao === 'cancelar' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}>
                {ocupada?.acao === 'cancelar' ? 'Cancelando' : 'Cancelar nota'}
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            <Aviso>O cancelamento é registrado no Portal Nacional e não pode ser desfeito. O município pode ter prazo limite para aceitar.</Aviso>
            {erroCancelar && <Aviso tipo="erro">{erroCancelar}</Aviso>}
            <Campo label="Motivo">
              <PremiumSelect className={CAMPO} value={String(motivoCod)} onChange={e => setMotivoCod(Number(e.target.value))} sheetTitle="Motivo do cancelamento">
                {MOTIVOS_CANCELAMENTO.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </PremiumSelect>
            </Campo>
            <Campo label="Explique o que aconteceu" hint={`${motivoTexto.trim().length}/255 • mínimo de 15 caracteres`}>
              <textarea className={`${CAMPO} h-auto py-3 min-h-[104px] resize-y`} maxLength={255} value={motivoTexto} onChange={e => setMotivoTexto(e.target.value)} />
            </Campo>
          </div>
        </ModalShell>
      )}
    </div>
  );
};
