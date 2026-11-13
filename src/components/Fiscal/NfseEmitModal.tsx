import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, Loader2, ArrowLeft, ChevronDown, Send } from 'lucide-react';
import { Button } from '../Common/ui';
import { SearchableSelect } from '../Common/SearchableSelect';
import { PremiumSelect } from '../Common/PremiumSelect';
import { CST_PIS_COFINS, TIPO_RETENCAO_PIS_COFINS } from '../../data/nfseTabelas';
import { MoneyField } from '../Common/MoneyField';
import { DateField } from '../Common/DateField';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';
import { isValidCPF as validateCPF, isValidCNPJ as validateCNPJ } from '../../utils/cnpjValidator';
import { lookupCNPJ } from '../../services/cnpjLookupService';
import { nfseService, NfseConfig, NfseNote, NfseEmitInput, NfseError, NfseServicoUsado, formatarDocumento, soDigitos, novaChaveDeEnvio } from '../../services/nfseService';
import { NfseCatalogoSelect, useDescricoes, pontuarServico } from './NfseCatalogoSelect';
import { ModalShell, Campo, CAMPO, Aviso } from './nfseUi';
import { NfseIbsCbsForm, IbsCbsEstado, ibsCbsVazio, validarIbsCbs, ibsCbsParaPedido, resumoIbsCbs } from './NfseIbsCbsForm';
import { EnderecoNfse, enderecoVazio, endereçoDoCadastro, buscarCep, cepPontuado, enderecoCompleto, enderecoParaTexto, lembrarEndereco, enderecoLembrado } from '../../utils/nfseEndereco';

interface Props {
  config: NfseConfig;
  /** Vendas que já têm nota emitida ou em processamento (não aparecem na lista). */
  vendasComNota: Set<string>;
  onClose: () => void;
  /** Chamado quando o servidor responde (nota autorizada, não emitida ou em processamento). */
  onResultado: (nota: NfseNote) => void;
}

/** Bloco que abre e fecha, no mesmo estilo de "Detalhes fiscais". */
const Secao: React.FC<{ titulo: string; resumo: string; aberto: boolean; onToggle: () => void; children: React.ReactNode }> = ({ titulo, resumo, aberto, onToggle, children }) => (
  <div className="rounded-2xl border border-[var(--border-subtle)]">
    <button type="button" onClick={onToggle} aria-expanded={aberto} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--text-primary)]">{titulo}</span>
        <span className="block text-xs text-[var(--text-muted)] mt-0.5 truncate">{resumo}</span>
      </span>
      <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
    </button>
    {aberto && <div className="px-5 pb-5 pt-4 space-y-5 border-t border-[var(--border-subtle)]">{children}</div>}
  </div>
);

const dig7 = (v?: string) => {
  const d = (v || '').replace(/\D/g, '');
  return d.length === 7 ? d : '';
};
const hojeBrasilia = () => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const NfseEmitModal: React.FC<Props> = ({ config, vendasComNota, onClose, onResultado }) => {
  const clientes = useMemo(() => storage.getCounterparties().filter(c => c.type !== 'FORNECEDOR' && c.status !== 'INATIVO'), []);
  const vendas = useMemo(
    () =>
      storage
        .getSales()
        .filter(s => s.status !== 'CANCELADA' && !vendasComNota.has(s.id))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 300),
    [vendasComNota]
  );
  const nomeCliente = (id: string) => clientes.find(c => c.id === id)?.name || storage.getCounterparties().find(c => c.id === id)?.name || 'Cliente';

  const [etapa, setEtapa] = useState<'DADOS' | 'CONFERIR'>('DADOS');
  const [saleId, setSaleId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [valor, setValor] = useState(0);
  const [competencia, setCompetencia] = useState(hojeBrasilia());
  const [descricao, setDescricao] = useState(config.padrao_descricao || '');
  const [cTribNac, setCTribNac] = useState(config.padrao_c_trib_nac || '');
  const [cNbs, setCNbs] = useState(config.padrao_c_nbs || '');
  const [issRetido, setIssRetido] = useState(false);
  const [aliquota, setAliquota] = useState('');
  // Endereço do cliente (obrigatório quando o ISS é retido)
  const [end, setEnd] = useState<EnderecoNfse>(enderecoVazio());
  const [endAberto, setEndAberto] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState('');
  const [guardarCadastro, setGuardarCadastro] = useState(true);
  const [errosIbs, setErrosIbs] = useState<Record<string, string>>({});
  // IBS/CBS: já vem marcado para empresa que não é do Simples (Lucro Presumido / Real).
  const [ibs, setIbs] = useState<IbsCbsEstado>(() => ibsCbsVazio(config.op_simp_nac === 1));
  const [ibsAberto, setIbsAberto] = useState(config.op_simp_nac === 1);
  const meEpp = config.op_simp_nac === 3;
  // Informações complementares
  const [infoCompl, setInfoCompl] = useState('');
  const [docRef, setDocRef] = useState('');
  const [idDocTec, setIdDocTec] = useState('');
  const [complAberto, setComplAberto] = useState(false);
  // Tributação federal
  const [cst, setCst] = useState('');
  const [tpRet, setTpRet] = useState('');
  const [retIrrf, setRetIrrf] = useState(0);
  const [retCsll, setRetCsll] = useState(0);
  const [retCp, setRetCp] = useState(0);
  const [federalAberto, setFederalAberto] = useState(false);
  const [fiscalAberto, setFiscalAberto] = useState(!config.padrao_c_trib_nac || !config.padrao_c_nbs);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Uma chave por janela aberta: se o envio for repetido, o servidor devolve a mesma nota.
  const [chaveEnvio] = useState(novaChaveDeEnvio);
  const [usados, setUsados] = useState<NfseServicoUsado[]>([]);
  const [descEditada, setDescEditada] = useState(false);
  const nomes = useDescricoes();

  // Serviços que esta empresa já emitiu (mais recentes primeiro), para escolher com um toque.
  useEffect(() => {
    let vivo = true;
    nfseService.servicosUsados(config.ambiente).then(r => vivo && setUsados(r.servicos)).catch(() => {});
    return () => { vivo = false; };
  }, [config.ambiente]);

  const escolherServico = (codigo: string) => {
    setCTribNac(codigo);
    setErros(e => ({ ...e, cTribNac: '' }));
    // Se este código já foi usado antes, traz o NBS que acompanhou da última vez.
    const anterior = usados.find(u => u.cTribNac === codigo);
    if (anterior && anterior.cNbs) {
      setCNbs(anterior.cNbs);
      setErros(e => ({ ...e, cNbs: '' }));
    }
  };
  const escolherUsado = (u: NfseServicoUsado) => {
    setCTribNac(u.cTribNac);
    setCNbs(u.cNbs);
    setErros(e => ({ ...e, cTribNac: '', cNbs: '' }));
    if (!descEditada) setDescricao(u.descricao);
  };

  const cliente = clientes.find(c => c.id === customerId) || storage.getCounterparties().find(c => c.id === customerId) || null;
  const docCliente = soDigitos(cliente?.document);
  const docValido = docCliente.length === 14 ? validateCNPJ(docCliente) : docCliente.length === 11 ? validateCPF(docCliente) : false;

  const preencherPorCep = async (cepDigitos: string, base: EnderecoNfse): Promise<EnderecoNfse | null> => {
    setBuscandoCep(true);
    setErroCep('');
    const r = await buscarCep(cepDigitos);
    setBuscandoCep(false);
    if (!r) {
      setErroCep('Não encontrei esse CEP. Confira o número digitado ou tente de novo em instantes.');
      return null;
    }
    // Mantém o que já estava digitado (número, complemento) e completa o resto.
    const novo = { ...base, cep: cepDigitos, logradouro: base.logradouro || r.logradouro || '', bairro: base.bairro || r.bairro || '', codigoMunicipio: r.codigoMunicipio || '', municipioNome: r.municipioNome || '' };
    setEnd(novo);
    return novo;
  };

  // Ao trocar o cliente, o endereço vem sozinho: último usado com ele, senão cartão CNPJ (cliente pessoa
  // jurídica), senão o texto do cadastro. O CEP completa município e código IBGE.
  useEffect(() => {
    if (!customerId) return;
    let vivo = true;
    (async () => {
      const lembrado = enderecoLembrado(customerId);
      if (lembrado && enderecoCompleto(lembrado)) { setEnd(lembrado); return; }
      const c = storage.getCounterparties().find(x => x.id === customerId);
      let atual: EnderecoNfse = { ...enderecoVazio(), ...endereçoDoCadastro(c?.address) };
      setEnd(atual);
      const doc = soDigitos(c?.document);
      if (doc.length === 14) {
        const r = await lookupCNPJ(doc).catch(() => null);
        if (r && vivo) {
          atual = {
            ...atual,
            cep: soDigitos(r.cep) || atual.cep,
            logradouro: r.logradouro || atual.logradouro,
            numero: r.numero || atual.numero,
            complemento: r.complemento || atual.complemento,
            bairro: r.bairro || atual.bairro,
            // O próprio cartão CNPJ já traz o município e o código IBGE.
            ...(dig7(r.codigoMunicipioIbge) ? { codigoMunicipio: dig7(r.codigoMunicipioIbge), municipioNome: r.municipio && r.uf ? `${r.municipio}/${r.uf}` : r.municipio } : {})
          };
          setEnd(atual);
        }
      }
      // Sem município ainda: o CEP completa (consulta pública de CEP).
      if (vivo && atual.cep.length === 8 && !atual.codigoMunicipio) atual = (await preencherPorCep(atual.cep, atual)) || atual;
      if (vivo) setEndAberto(!enderecoCompleto(atual));
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const escolherVenda = (id: string) => {
    setSaleId(id);
    const venda = vendas.find(s => s.id === id);
    if (!venda) return;
    setCustomerId(venda.customerId);
    setValor(venda.netTotal);
    if (venda.date && venda.date <= hojeBrasilia()) setCompetencia(venda.date);
    const itens = (venda.items || []).map(i => i.description).filter(Boolean).join('; ');
    if (itens) { setDescricao(itens); setDescEditada(true); }
    setInfoCompl(`Venda ${venda.saleNumber}`);
    setComplAberto(true);
    setErros({});
  };

  const validar = (): boolean => {
    const e: Record<string, string> = {};
    if (!cliente) e.cliente = 'Escolha o cliente.';
    else if (!docValido) e.cliente = 'O cadastro deste cliente está sem CPF ou CNPJ válido. Corrija em Clientes antes de emitir.';
    if (!(valor > 0)) e.valor = 'Informe o valor do serviço.';
    if (!competencia) e.competencia = 'Informe a data do serviço.';
    else if (competencia > hojeBrasilia()) e.competencia = 'A data do serviço não pode ser depois de hoje.';
    if (!descricao.trim()) e.descricao = 'Descreva o serviço prestado.';
    if (soDigitos(cTribNac).length !== 6) e.cTribNac = 'Escolha o serviço prestado.';
    if (soDigitos(cNbs).length !== 9) e.cNbs = 'Escolha o código NBS.';
    if (!enderecoCompleto(end)) {
      e.endereco = 'O endereço do cliente é obrigatório na nota (CEP, rua, número e bairro).';
    }
    if (meEpp && issRetido && !aliquota.trim()) e.aliquota = 'Com ISS retido, a empresa ME/EPP precisa informar a alíquota.';
    if (tpRet && !['0', '2'].includes(tpRet) && !(retCsll > 0)) e.retCsll = 'Com esse tipo de retenção o portal exige o valor das contribuições sociais retidas.';
    if (tpRet && !cst) e.cst ='Escolha antes a situação tributária do PIS/COFINS (use "00 - Nenhum" se não houver).';
    for (const [campo, v, nome] of [['retIrrf', retIrrf, 'IRRF'], ['retCsll', retCsll, 'Contribuições sociais retidas'], ['retCp', retCp, 'Contribuição previdenciária retida']] as const) {
      if (valor > 0 && v > valor) e[campo] = `${nome} não pode ser maior que o valor do serviço.`;
    }
    setErros(e);
    if (e.cTribNac || e.cNbs || e.aliquota) setFiscalAberto(true);
    if (e.endereco) setEndAberto(true);
    const eIbs = validarIbsCbs(ibs, competencia);
    if (Object.keys(eIbs).length) {
      e.ibscbs = Object.values(eIbs)[0];
      setIbsAberto(true);
    }
    setErrosIbs(eIbs);
    if (e.cst || e.retIrrf || e.retCsll || e.retCp) setFederalAberto(true);
    return Object.keys(e).length === 0;
  };

  const emitir = async () => {
    if (!cliente || enviando) return;
    setErroGeral('');
    setEnviando(true);
    const entrada: NfseEmitInput = {
      customerId: cliente.id,
      saleId: saleId || null,
      tomadorNome: cliente.name,
      tomadorDocumento: docCliente,
      tomadorEmail: cliente.email || '',
      tomadorTelefone: cliente.phone || '',
      descricao: descricao.trim(),
      informacoesComplementares: infoCompl.trim(),
      docRef: docRef.trim(),
      idDocTec: idDocTec.trim(),
      pisCofinsCst: cst,
      pisCofinsTpRet: tpRet,
      retIrrf,
      retCsll,
      retCp,
      cTribNac: soDigitos(cTribNac),
      cNbs: soDigitos(cNbs),
      valorServico: valor,
      competencia,
      issRetido,
      aliquotaIss: meEpp && !issRetido ? '' : aliquota.trim(),
      ibscbs: ibsCbsParaPedido(ibs),
      tomadorEndereco: enderecoCompleto(end)
        ? { cep: end.cep, logradouro: end.logradouro.trim(), numero: end.numero.trim(), complemento: end.complemento.trim(), bairro: end.bairro.trim(), codigoMunicipio: end.codigoMunicipio }
        : null
    };
    if (customerId && enderecoCompleto(end)) {
      lembrarEndereco(customerId, end);
      // Guarda o endereço completo no cadastro do cliente para as próximas notas (se a pessoa deixou marcado).
      if (guardarCadastro) {
        try {
          const texto = enderecoParaTexto(end);
          const todos = storage.getCounterparties();
          if (texto && todos.some(c => c.id === customerId && c.address !== texto)) {
            storage.saveCounterparties(todos.map(c => (c.id === customerId ? { ...c, address: texto } : c)));
          }
        } catch { /* a nota segue; o endereço continua lembrado neste navegador */ }
      }
    }
    try {
      const r = await nfseService.emitir(entrada, chaveEnvio);
      onResultado(r.nota);
    } catch (e) {
      setErroGeral(e instanceof NfseError ? e.message : 'Não foi possível emitir a nota. Tente de novo.');
      setEtapa('DADOS');
    } finally {
      setEnviando(false);
    }
  };

  const linha = (rotulo: string, valorLinha: React.ReactNode) => (
    <div className="flex items-start justify-between gap-6 py-3 border-b border-[var(--border-subtle)] last:border-b-0">
      <span className="text-sm text-[var(--text-muted)] shrink-0">{rotulo}</span>
      <span className="text-sm text-[var(--text-primary)] text-right min-w-0 break-words">{valorLinha}</span>
    </div>
  );

  return (
    <ModalShell
      title={etapa === 'DADOS' ? 'Emitir nota fiscal' : 'Conferir antes de emitir'}
      subtitle={etapa === 'DADOS' ? 'Nota fiscal de serviço, emitida direto no Portal Nacional.' : 'Depois de emitida, a nota só pode ser cancelada, não editada.'}
      icon={<FilePlus2 />}
      onClose={onClose}
      bloqueado={enviando}
      footer={
        etapa === 'DADOS' ? (
          <>
            <Button variant="ghost" className="h-11" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" className="h-11 sm:min-w-[180px]" onClick={() => { setErroGeral(''); if (validar()) setEtapa('CONFERIR'); }}>
              Conferir nota
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="h-11" onClick={() => setEtapa('DADOS')} disabled={enviando} icon={<ArrowLeft className="w-4 h-4" />}>Voltar e corrigir</Button>
            <Button variant="primary" className="h-11 sm:min-w-[200px]" onClick={emitir} disabled={enviando} icon={enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}>
              {enviando ? 'Enviando ao portal' : 'Emitir nota'}
            </Button>
          </>
        )
      }
    >
      {config.ambiente === 2 && (
        <Aviso tipo="info" className="mb-6">Ambiente de testes: esta nota não terá valor fiscal.</Aviso>
      )}
      {erroGeral && <Aviso tipo="erro" className="mb-6">{erroGeral}</Aviso>}

      {etapa === 'DADOS' && (
        <div className="space-y-6">
          {vendas.length > 0 && (
            <Campo label="Puxar de uma venda (opcional)" hint="Preenche cliente, valor e descrição com os dados da venda.">
              <SearchableSelect
                size="lg"
                value={saleId}
                onChange={escolherVenda}
                placeholder="Escolher venda"
                searchPlaceholder="Buscar por número ou cliente"
                options={vendas.map(s => ({ value: s.id, label: `${s.saleNumber} • ${nomeCliente(s.customerId)}`, sublabel: `${formatDateBR(s.date)} • ${formatBRL(s.netTotal)}` }))}
              />
            </Campo>
          )}

          <Campo label="Cliente" erro={erros.cliente} hint={cliente && docValido ? `${docCliente.length === 14 ? 'CNPJ' : 'CPF'} ${formatarDocumento(docCliente)}` : undefined}>
            <SearchableSelect
              size="lg"
              value={customerId}
              onChange={v => { setCustomerId(v); setErros(e => ({ ...e, cliente: '' })); }}
              placeholder="Escolher cliente"
              searchPlaceholder="Buscar por nome ou documento"
              options={clientes.map(c => ({ value: c.id, label: c.name, sublabel: formatarDocumento(c.document) }))}
            />
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Campo label="Valor do serviço (R$)" erro={erros.valor}>
              <MoneyField value={valor} onChange={v => { setValor(v); setErros(e => ({ ...e, valor: '' })); }} className={`${CAMPO} tabular-nums font-semibold`} />
            </Campo>
            <Campo label="Data do serviço" erro={erros.competencia}>
              <DateField value={competencia} max={hojeBrasilia()} onChange={e => { setCompetencia(e.target.value); setErros(er => ({ ...er, competencia: '' })); }} className={CAMPO} />
            </Campo>
          </div>

          <Campo label="Serviço prestado" erro={erros.cTribNac} hint={cTribNac && nomes.servico(cTribNac) ? `Código ${pontuarServico(cTribNac)}` : 'Escolha na lista nacional de serviços, como no Portal Nacional.'}>
            <NfseCatalogoSelect tipo="SERVICO" value={cTribNac} onChange={escolherServico} />
            {usados.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-[var(--text-muted)] mb-2">Usados antes nesta empresa</p>
                <div className="flex flex-wrap gap-2">
                  {usados.map(u => {
                    const ativo = u.cTribNac === cTribNac && u.cNbs === cNbs;
                    const nome = nomes.servico(u.cTribNac) || `Código ${u.cTribNac}`;
                    return (
                      <button
                        key={`${u.cTribNac}-${u.cNbs}`}
                        type="button"
                        onClick={() => escolherUsado(u)}
                        title={`${nome} • NBS ${u.cNbs}`}
                        className={`max-w-full min-h-[40px] px-3.5 rounded-xl border text-sm text-left truncate cursor-pointer transition-colors ${ativo ? 'btn-gold font-semibold border-transparent' : 'border-[var(--border-highlight)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
                      >
                        {nome.length > 44 ? `${nome.slice(0, 43)}…` : nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </Campo>

          <Campo label="Descrição do serviço" erro={erros.descricao} hint="É o texto que aparece na nota para o cliente.">
            <textarea className={`${CAMPO} h-auto py-3 min-h-[104px] resize-y`} value={descricao} maxLength={2000} onChange={e => { setDescricao(e.target.value); setDescEditada(true); setErros(er => ({ ...er, descricao: '' })); }} />
          </Campo>

          <div className="rounded-2xl border border-[var(--border-subtle)]">
            <button type="button" onClick={() => setFiscalAberto(o => !o)} aria-expanded={fiscalAberto} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--text-primary)]">Detalhes fiscais</span>
                <span className="block text-xs text-[var(--text-muted)] mt-0.5 truncate">
                  {cNbs ? `NBS ${cNbs}${nomes.nbs(cNbs) ? ` • ${nomes.nbs(cNbs)}` : ''} • ISS ${issRetido ? 'retido pelo cliente' : 'não retido'}` : 'NBS e retenção de ISS'}
                </span>
              </span>
              <ChevronDown className={`w-4 h-4 text-[var(--text-muted)] shrink-0 transition-transform ${fiscalAberto ? 'rotate-180' : ''}`} />
            </button>
            {fiscalAberto && (
              <div className="px-5 pb-5 pt-1 space-y-5 border-t border-[var(--border-subtle)]">
                <div className="pt-4">
                  <Campo label="Código NBS" erro={erros.cNbs} hint="Nomenclatura Brasileira de Serviços. Vem preenchido pelo último uso do serviço; confirme se está certo.">
                    <NfseCatalogoSelect tipo="NBS" value={cNbs} onChange={v => { setCNbs(v); setErros(e => ({ ...e, cNbs: '' })); }} />
                  </Campo>
                </div>
                <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={issRetido}
                    onChange={e => {
                      setIssRetido(e.target.checked);
                      // ISS retido exige o endereço do cliente: abre o bloco já preenchendo o que der.
                      if (e.target.checked) setEndAberto(true);
                      else setErros(er => ({ ...er, aliquota: '', endereco: '' }));
                    }}
                    className="mt-1 w-4 h-4 shrink-0"
                  />
                  <span>
                    <span className="block text-sm text-[var(--text-primary)]">ISS retido pelo cliente</span>
                    <span className="block text-xs text-[var(--text-muted)] mt-0.5">Marque só quando quem paga o ISS é o cliente que contratou o serviço. {meEpp ? 'Exige a alíquota.' : ''}</span>
                  </span>
                </label>
                <Campo
                  label="Alíquota do ISS (%)"
                  className="sm:max-w-[240px]"
                  erro={erros.aliquota}
                  hint={meEpp ? (issRetido ? 'Obrigatória com ISS retido. Confirme o valor com a contabilidade.' : 'Para ME/EPP só se informa quando o ISS é retido.') : 'Opcional. Preencha só se a contabilidade orientar.'}
                >
                  <input
                    className={CAMPO}
                    inputMode="decimal"
                    disabled={meEpp && !issRetido}
                    value={meEpp && !issRetido ? '' : aliquota}
                    onChange={e => { setAliquota(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 4)); setErros(er => ({ ...er, aliquota: '' })); }}
                  />
                </Campo>
              </div>
            )}
          </div>

          <Secao
            titulo="Endereço do cliente"
            resumo={enderecoCompleto(end) ? `${end.logradouro}, ${end.numero} • ${end.bairro} • ${end.municipioNome || end.codigoMunicipio} • CEP ${cepPontuado(end.cep)}` : 'Obrigatório. Vem do cadastro do cliente; complete o que faltar'}
            aberto={endAberto}
            onToggle={() => setEndAberto(o => !o)}
          >
            {erros.endereco && <Aviso tipo="erro">{erros.endereco}</Aviso>}
            <Campo label="CEP" hint={buscandoCep ? 'Buscando endereço...' : 'Ao digitar o CEP, a rua, o bairro e o município são preenchidos.'} erro={erroCep}>
              <input
                className={CAMPO}
                inputMode="numeric"
                value={cepPontuado(end.cep)}
                onChange={e => {
                  const d = soDigitos(e.target.value).slice(0, 8);
                  const novo = { ...end, cep: d, ...(d.length < 8 ? { codigoMunicipio: '', municipioNome: '' } : {}) };
                  setEnd(novo);
                  setErroCep('');
                  setErros(er => ({ ...er, endereco: '' }));
                  if (d.length === 8) void preencherPorCep(d, novo);
                }}
              />
            </Campo>
            <Campo label="Rua / logradouro">
              <input className={CAMPO} value={end.logradouro} maxLength={255} onChange={e => { setEnd({ ...end, logradouro: e.target.value }); setErros(er => ({ ...er, endereco: '' })); }} />
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Campo label="Número" hint='Use "S/N" se não houver.'>
                <input className={CAMPO} value={end.numero} maxLength={60} onChange={e => { setEnd({ ...end, numero: e.target.value }); setErros(er => ({ ...er, endereco: '' })); }} />
              </Campo>
              <Campo label="Complemento">
                <input className={CAMPO} value={end.complemento} maxLength={156} onChange={e => setEnd({ ...end, complemento: e.target.value })} />
              </Campo>
              <Campo label="Bairro">
                <input className={CAMPO} value={end.bairro} maxLength={60} onChange={e => { setEnd({ ...end, bairro: e.target.value }); setErros(er => ({ ...er, endereco: '' })); }} />
              </Campo>
              <Campo label="Município" hint="Vem do CEP.">
                <input className={`${CAMPO} bg-[var(--surface-elevated)]`} readOnly value={end.municipioNome ? `${end.municipioNome} (${end.codigoMunicipio})` : end.codigoMunicipio} />
              </Campo>
            </div>
            <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
              <input type="checkbox" checked={guardarCadastro} onChange={e => setGuardarCadastro(e.target.checked)} className="mt-1 w-4 h-4 shrink-0" />
              <span className="text-sm text-[var(--text-primary)]">Guardar este endereço no cadastro do cliente<span className="block text-xs text-[var(--text-muted)] mt-0.5">Assim as próximas notas já saem com o endereço completo.</span></span>
            </label>
          </Secao>

          <Secao
            titulo="IBS/CBS (reforma tributária)"
            resumo={resumoIbsCbs(ibs)}
            aberto={ibsAberto}
            onToggle={() => setIbsAberto(o => !o)}
          >
            <NfseIbsCbsForm value={ibs} onChange={v => { setIbs(v); setErrosIbs({}); }} erros={errosIbs} competencia={competencia} />
          </Secao>

          <Secao
            titulo="Informações complementares"
            resumo={infoCompl.trim() || docRef.trim() || idDocTec.trim() ? [infoCompl.trim(), docRef.trim() && `Doc. ref.: ${docRef.trim()}`, idDocTec.trim() && `Resp. técnica: ${idDocTec.trim()}`].filter(Boolean).join(' • ') : 'Texto extra na nota, documento de referência e responsabilidade técnica'}
            aberto={complAberto}
            onToggle={() => setComplAberto(o => !o)}
          >
            <Campo label="Informações complementares" hint={`${infoCompl.length}/2000 • texto livre que sai na nota (sem quebra de linha).`}>
              <textarea className={`${CAMPO} h-auto py-3 min-h-[104px] resize-y`} value={infoCompl} maxLength={2000} onChange={e => setInfoCompl(e.target.value)} />
            </Campo>
            <Campo label="Documento de referência" hint={`${docRef.length}/255 • chave da nota, número do contrato ou outro documento que dá base a esta nota.`}>
              <textarea className={`${CAMPO} h-auto py-3 min-h-[72px] resize-y`} value={docRef} maxLength={255} onChange={e => setDocRef(e.target.value)} />
            </Campo>
            <Campo label="Número do documento de responsabilidade técnica" hint="ART, RRT, DRT ou outro. Só para serviços que exigem.">
              <input className={CAMPO} value={idDocTec} maxLength={40} onChange={e => setIdDocTec(e.target.value)} />
            </Campo>
          </Secao>

          <Secao
            titulo="Tributação federal"
            resumo={
              cst || tpRet || retIrrf || retCsll || retCp
                ? [cst && `PIS/COFINS ${cst}`, tpRet && 'retenção informada', retIrrf > 0 && `IRRF ${formatBRL(retIrrf)}`, retCsll > 0 && `CSLL ${formatBRL(retCsll)}`, retCp > 0 && `CP ${formatBRL(retCp)}`].filter(Boolean).join(' • ')
                : 'PIS/COFINS e retenções de IRRF, contribuições sociais e previdência'
            }
            aberto={federalAberto}
            onToggle={() => setFederalAberto(o => !o)}
          >
            <Campo label="Situação tributária do PIS/COFINS" erro={erros.cst}>
              <PremiumSelect className={CAMPO} value={cst} onChange={e => { setCst(e.target.value); setErros(er => ({ ...er, cst: '' })); }} sheetTitle="Situação tributária do PIS/COFINS">
                <option value="">Selecione</option>
                {CST_PIS_COFINS.map(([c, d]) => <option key={c} value={c}>{c} - {d}</option>)}
              </PremiumSelect>
            </Campo>
            <Campo label="Tipo de retenção do PIS/COFINS/CSLL">
              <PremiumSelect className={CAMPO} value={tpRet} onChange={e => { setTpRet(e.target.value); setErros(er => ({ ...er, cst: '' })); }} sheetTitle="Tipo de retenção">
                <option value="">Selecione</option>
                {TIPO_RETENCAO_PIS_COFINS.map(([c, d]) => <option key={c} value={c}>{c} - {d}</option>)}
              </PremiumSelect>
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <Campo label="IRRF (R$)" erro={erros.retIrrf}>
                <MoneyField value={retIrrf} onChange={v => { setRetIrrf(v); setErros(er => ({ ...er, retIrrf: '' })); }} className={`${CAMPO} tabular-nums`} />
              </Campo>
              <Campo label="Contribuições sociais retidas (R$)" erro={erros.retCsll}>
                <MoneyField value={retCsll} onChange={v => { setRetCsll(v); setErros(er => ({ ...er, retCsll: '' })); }} className={`${CAMPO} tabular-nums`} />
              </Campo>
              <Campo label="Contribuição previdenciária retida (R$)" erro={erros.retCp}>
                <MoneyField value={retCp} onChange={v => { setRetCp(v); setErros(er => ({ ...er, retCp: '' })); }} className={`${CAMPO} tabular-nums`} />
              </Campo>
            </div>
          </Secao>
        </div>
      )}

      {etapa === 'CONFERIR' && cliente && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[var(--gold-edge)] bg-[var(--brand-gold-soft)] px-5 py-6 text-center">
            <p className="text-sm text-[var(--text-secondary)]">Valor da nota</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)]">{formatBRL(valor)}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border-subtle)] px-5">
            {linha('Cliente', cliente.name)}
            {linha(docCliente.length === 14 ? 'CNPJ' : 'CPF', formatarDocumento(docCliente))}
            {linha('Data do serviço', formatDateBR(competencia))}
            {linha('Descrição', <span className="whitespace-pre-wrap">{descricao.trim()}</span>)}
            {linha('Serviço', `${nomes.servico(cTribNac) || 'Código ' + cTribNac} (${cTribNac})`)}
            {linha('NBS', `${nomes.nbs(cNbs) || 'Código ' + cNbs} (${cNbs})`)}
            {linha('ISS', issRetido ? 'Retido pelo cliente' : 'Não retido')}
            {aliquota.trim() && !(meEpp && !issRetido) && linha('Alíquota do ISS', `${aliquota.trim()}%`)}
            {ibs.informar && linha('IBS/CBS', `CST ${ibs.cst} • classificação ${ibs.cClassTrib} • operação ${ibs.cIndOp}${ibs.indDest === '1' ? ' • destinatário: ' + ibs.destNome : ''}${ibs.compraGov ? ' • compra governamental' : ''}`)}
            {enderecoCompleto(end) && linha('Endereço do cliente', `${end.logradouro}, ${end.numero}${end.complemento ? ' - ' + end.complemento : ''} • ${end.bairro} • ${end.municipioNome || end.codigoMunicipio} • CEP ${cepPontuado(end.cep)}`)}
            {infoCompl.trim() && linha('Informações complementares', infoCompl.trim())}
            {docRef.trim() && linha('Documento de referência', docRef.trim())}
            {idDocTec.trim() && linha('Resp. técnica', idDocTec.trim())}
            {cst && linha('PIS/COFINS', `${cst} - ${CST_PIS_COFINS.find(([c]) => c === cst)?.[1] || ''}`)}
            {tpRet && linha('Retenção PIS/COFINS/CSLL', `${tpRet} - ${TIPO_RETENCAO_PIS_COFINS.find(([c]) => c === tpRet)?.[1] || ''}`)}
            {retIrrf > 0 && linha('IRRF retido', formatBRL(retIrrf))}
            {retCsll > 0 && linha('Contribuições sociais retidas', formatBRL(retCsll))}
            {retCp > 0 && linha('Contribuição previdenciária retida', formatBRL(retCp))}
          </div>
        </div>
      )}
    </ModalShell>
  );
};
