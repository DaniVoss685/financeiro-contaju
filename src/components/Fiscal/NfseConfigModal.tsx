import React, { useRef, useState } from 'react';
import { ShieldCheck, Upload, Loader2, Settings2, Trash2, FileKey2 } from 'lucide-react';
import { Button, Badge, TabPills } from '../Common/ui';
import { PremiumSelect } from '../Common/PremiumSelect';
import { storage } from '../../services/storageService';
import { nfseService, NfseConfig, NfseConfigInput, NfseError, formatarDocumento, soDigitos, pendenciasDaConfig } from '../../services/nfseService';
import { ModalShell, Campo, CAMPO, Aviso, ResultadoModal } from './nfseUi';
import { NfseCatalogoSelect } from './NfseCatalogoSelect';

interface Props {
  config: NfseConfig | null;
  abaInicial?: 'DADOS' | 'CERTIFICADO';
  onClose: () => void;
  onChange: (config: NfseConfig | null) => void;
}

// Opções exatamente como estão no leiaute oficial da NFS-e Nacional.
const OP_SIMPLES = [
  { v: 1, l: 'Não optante pelo Simples Nacional' },
  { v: 2, l: 'Optante — Microempreendedor Individual (MEI)' },
  { v: 3, l: 'Optante — Microempresa ou Empresa de Pequeno Porte (ME/EPP)' }
];
const REG_APURACAO = [
  { v: 1, l: 'Tributos federais e municipal apurados pelo Simples Nacional' },
  { v: 2, l: 'Tributos federais pelo Simples Nacional e ISS pela nota (legislação municipal)' },
  { v: 3, l: 'Tributos federais e municipal apurados pela nota' }
];
const REG_ESPECIAL = [
  { v: 0, l: 'Nenhum' },
  { v: 1, l: 'Ato cooperado (cooperativa)' },
  { v: 2, l: 'Estimativa' },
  { v: 3, l: 'Microempresa municipal' },
  { v: 4, l: 'Notário ou registrador' },
  { v: 5, l: 'Profissional autônomo' },
  { v: 6, l: 'Sociedade de profissionais' }
];

function formInicial(config: NfseConfig | null): NfseConfigInput {
  const empresa = storage.getCompany();
  return {
    ambiente: config?.ambiente ?? 2,
    cnpj: formatarDocumento(config?.cnpj || empresa?.cnpj || ''),
    inscricaoMunicipal: config?.inscricao_municipal || '',
    codigoMunicipio: config?.codigo_municipio || '',
    telefone: config?.telefone || soDigitos(empresa?.phone),
    email: config?.email || empresa?.email || '',
    opSimpNac: config?.op_simp_nac ?? '',
    regApTribSN: config?.reg_ap_trib_sn ?? '',
    regEspTrib: config?.reg_esp_trib ?? 0,
    serie: config?.serie || '1',
    proximoNumeroProducao: String(config?.proximo_numero_producao ?? 1),
    padraoCTribNac: config?.padrao_c_trib_nac || '',
    padraoCNbs: config?.padrao_c_nbs || '',
    padraoDescricao: config?.padrao_descricao || '',
    pTotTribSN: config?.p_tot_trib_sn != null ? String(config.p_tot_trib_sn).replace('.', ',') : ''
  };
}

export const NfseConfigModal: React.FC<Props> = ({ config, abaInicial = 'DADOS', onClose, onChange }) => {
  const [aba, setAba] = useState<'DADOS' | 'CERTIFICADO'>(abaInicial);
  const [form, setForm] = useState<NfseConfigInput>(() => formInicial(config));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ tipo: 'sucesso' | 'aviso'; titulo: string; texto: string } | null>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pend = pendenciasDaConfig(config);
  const set = <K extends keyof NfseConfigInput>(k: K, v: NfseConfigInput[K]) => setForm(f => ({ ...f, [k]: v }));
  const ocupado = salvando || enviando;

  const salvar = async () => {
    setErro('');
    setSalvando(true);
    try {
      const r = await nfseService.salvarConfig(form);
      onChange(r.config);
      setForm(formInicial(r.config));
      setResultado({
        tipo: 'sucesso',
        titulo: 'Dados fiscais salvos',
        texto: r.config.cert_validade ? 'A empresa está pronta para emitir notas fiscais.' : 'Agora envie o certificado digital para liberar a emissão.'
      });
      if (!r.config.cert_validade) setAba('CERTIFICADO');
    } catch (e) {
      setErro(e instanceof NfseError ? e.message : 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  const enviarCertificado = async () => {
    if (!arquivo || !senha) {
      setErro('Selecione o arquivo do certificado e informe a senha.');
      return;
    }
    setErro('');
    setEnviando(true);
    try {
      const r = await nfseService.enviarCertificado(arquivo, senha);
      onChange(r.config);
      setArquivo(null);
      setSenha('');
      if (fileRef.current) fileRef.current.value = '';
      setResultado(
        r.aviso
          ? { tipo: 'aviso', titulo: 'Certificado guardado, com um alerta', texto: r.aviso }
          : { tipo: 'sucesso', titulo: 'Certificado guardado', texto: `Válido até ${new Date(r.config.cert_validade!).toLocaleDateString('pt-BR')}. Ele fica protegido no servidor e não aparece mais na tela.` }
      );
    } catch (e) {
      setErro(e instanceof NfseError ? e.message : 'Não foi possível enviar o certificado. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  const remover = async () => {
    setConfirmarRemocao(false);
    setErro('');
    setEnviando(true);
    try {
      const r = await nfseService.removerCertificado();
      onChange(r.config);
    } catch (e) {
      setErro(e instanceof NfseError ? e.message : 'Não foi possível remover o certificado.');
    } finally {
      setEnviando(false);
    }
  };

  const diasParaVencer = config?.cert_validade ? Math.ceil((new Date(config.cert_validade).getTime() - Date.now()) / 86400000) : null;

  return (
    <>
      <ModalShell
        title="Configurar emissão de notas"
        subtitle="Feito uma vez. Depois disso, emitir uma nota leva poucos cliques."
        icon={<Settings2 />}
        onClose={onClose}
        bloqueado={ocupado}
        footer={
          aba === 'DADOS' ? (
            <>
              <Button variant="ghost" className="h-11" onClick={onClose} disabled={ocupado}>Fechar</Button>
              <Button variant="primary" className="h-11 sm:min-w-[180px]" onClick={salvar} disabled={ocupado} icon={salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
                {salvando ? 'Salvando' : 'Salvar dados fiscais'}
              </Button>
            </>
          ) : (
            <Button variant="ghost" className="h-11" onClick={onClose} disabled={ocupado}>Fechar</Button>
          )
        }
      >
        <div className="mb-6">
          <TabPills
            tabs={[
              { id: 'DADOS', label: pend.dadosFiscais ? 'Dados fiscais' : 'Dados fiscais • pendente' },
              { id: 'CERTIFICADO', label: pend.certificado && !pend.certificadoVencido ? 'Certificado digital' : 'Certificado digital • pendente' }
            ]}
            value={aba}
            onChange={id => { setErro(''); setAba(id as 'DADOS' | 'CERTIFICADO'); }}
          />
        </div>

        {erro && <Aviso tipo="erro" className="mb-6">{erro}</Aviso>}

        {aba === 'DADOS' && (
          <div className="space-y-8">
            <section className="space-y-5">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Empresa que emite</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Campo label="CNPJ">
                  <input className={CAMPO} inputMode="numeric" value={form.cnpj} onChange={e => set('cnpj', formatarDocumento(soDigitos(e.target.value).slice(0, 14)))} />
                </Campo>
                <Campo label="Inscrição municipal" hint="Deixe em branco se a prefeitura não exige.">
                  <input className={CAMPO} value={form.inscricaoMunicipal} maxLength={15} onChange={e => set('inscricaoMunicipal', e.target.value)} />
                </Campo>
                <Campo label="Código do município (IBGE)" hint="7 dígitos. É o código da cidade da empresa na tabela do IBGE.">
                  <input className={CAMPO} inputMode="numeric" value={form.codigoMunicipio} onChange={e => set('codigoMunicipio', soDigitos(e.target.value).slice(0, 7))} />
                </Campo>
                <Campo label="Telefone">
                  <input className={CAMPO} inputMode="tel" value={form.telefone} onChange={e => set('telefone', soDigitos(e.target.value).slice(0, 20))} />
                </Campo>
                <Campo label="E-mail" className="sm:col-span-2">
                  <input className={CAMPO} type="email" value={form.email} maxLength={80} onChange={e => set('email', e.target.value)} />
                </Campo>
              </div>
            </section>

            <section className="space-y-5">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Enquadramento tributário</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Estas respostas vão em toda nota. Na dúvida, confirme com a contabilidade.</p>
              </div>
              <Campo label="Situação no Simples Nacional">
                <PremiumSelect className={CAMPO} value={String(form.opSimpNac)} onChange={e => set('opSimpNac', e.target.value ? Number(e.target.value) : '')} sheetTitle="Situação no Simples Nacional">
                  <option value="">Selecione</option>
                  {OP_SIMPLES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </PremiumSelect>
              </Campo>
              {form.opSimpNac === 3 && (
                <Campo label="Regime de apuração">
                  <PremiumSelect className={CAMPO} value={String(form.regApTribSN)} onChange={e => set('regApTribSN', e.target.value ? Number(e.target.value) : '')} sheetTitle="Regime de apuração">
                    <option value="">Selecione</option>
                    {REG_APURACAO.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </PremiumSelect>
                </Campo>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Campo label="Regime especial de tributação">
                  <PremiumSelect className={CAMPO} value={String(form.regEspTrib)} onChange={e => set('regEspTrib', Number(e.target.value))} sheetTitle="Regime especial de tributação">
                    {REG_ESPECIAL.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                  </PremiumSelect>
                </Campo>
                {form.opSimpNac === 3 && (
                  <Campo label="Tributos aproximados (%)" hint="Obrigatório para ME/EPP. Percentual total aproximado de tributos que aparece na nota. Confirme o valor com a contabilidade.">
                    <input className={CAMPO} inputMode="decimal" value={form.pTotTribSN} onChange={e => set('pTotTribSN', e.target.value.replace(/[^0-9.,]/g, '').slice(0, 5))} />
                  </Campo>
                )}
              </div>
            </section>

            <section className="space-y-5">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Serviço sugerido</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Só vem preenchido na primeira nota. Na hora de emitir você escolhe o serviço de cada nota, e o sistema lembra os que a empresa já usou.</p>
              </div>
              <div className="grid grid-cols-1 gap-5">
                <Campo label="Serviço">
                  <NfseCatalogoSelect tipo="SERVICO" value={form.padraoCTribNac} onChange={v => set('padraoCTribNac', v)} />
                </Campo>
                <Campo label="Código NBS">
                  <NfseCatalogoSelect tipo="NBS" value={form.padraoCNbs} onChange={v => set('padraoCNbs', v)} />
                </Campo>
                <Campo label="Descrição sugerida do serviço">
                  <textarea className={`${CAMPO} h-auto py-3 min-h-[88px] resize-y`} value={form.padraoDescricao} maxLength={2000} onChange={e => set('padraoDescricao', e.target.value)} />
                </Campo>
              </div>
            </section>

            <section className="space-y-5">
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Numeração e ambiente</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Campo label="Ambiente" hint={form.ambiente === 2 ? 'Notas de teste não têm valor fiscal.' : 'Notas reais, com valor fiscal.'}>
                  <PremiumSelect className={CAMPO} value={String(form.ambiente)} onChange={e => set('ambiente', Number(e.target.value) as 1 | 2)} sheetTitle="Ambiente">
                    <option value="2">Testes (sem valor fiscal)</option>
                    <option value="1">Produção (notas reais)</option>
                  </PremiumSelect>
                </Campo>
                <Campo label="Série">
                  <input className={CAMPO} inputMode="numeric" value={form.serie} onChange={e => set('serie', soDigitos(e.target.value).slice(0, 5))} />
                </Campo>
                <Campo label="Próximo número em produção" hint="Se a empresa já emitia notas por outro sistema, continue a sequência daqui. Só pode aumentar.">
                  <input className={CAMPO} inputMode="numeric" value={form.proximoNumeroProducao} onChange={e => set('proximoNumeroProducao', soDigitos(e.target.value).slice(0, 15))} />
                </Campo>
              </div>
            </section>
          </div>
        )}

        {aba === 'CERTIFICADO' && (
          <div className="space-y-6">
            {pend.certificado && config ? (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: pend.certificadoVencido ? 'var(--status-danger-bg)' : 'var(--status-success-bg)', color: pend.certificadoVencido ? 'var(--status-danger)' : 'var(--status-success)' }}>
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[var(--text-primary)] break-words">{config.cert_titular || 'Certificado digital'}</span>
                    {pend.certificadoVencido ? <Badge tone="danger">Vencido</Badge> : diasParaVencer !== null && diasParaVencer <= 30 ? <Badge tone="gold">Vence em {diasParaVencer} dias</Badge> : <Badge tone="success">Válido</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {config.cert_documento ? `${formatarDocumento(config.cert_documento)} • ` : ''}validade até {new Date(config.cert_validade!).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <Button variant="danger" className="h-10" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmarRemocao(true)} disabled={ocupado}>Remover</Button>
              </div>
            ) : (
              <Aviso tipo="info">Para emitir, o Portal Nacional exige o certificado digital A1 da empresa (arquivo .pfx ou .p12).</Aviso>
            )}

            <section className="space-y-5">
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">{pend.certificado ? 'Trocar certificado' : 'Enviar certificado'}</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">O arquivo e a senha são guardados cifrados no servidor. Ninguém consegue baixar o certificado pela tela.</p>
              </div>
              <input ref={fileRef} type="file" accept=".pfx,.p12,application/x-pkcs12" className="hidden" onChange={e => { setErro(''); setArquivo(e.target.files?.[0] || null); }} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={ocupado}
                className="w-full rounded-2xl border border-dashed border-[var(--border-highlight)] hover:border-[var(--gold-edge)] bg-[var(--surface-input)] px-5 py-6 flex items-center gap-4 text-left cursor-pointer transition-colors disabled:opacity-60"
              >
                <span className="w-11 h-11 rounded-xl bg-[var(--brand-gold-soft)] text-[var(--brand-gold)] flex items-center justify-center shrink-0">
                  {arquivo ? <FileKey2 className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)] truncate">{arquivo ? arquivo.name : 'Selecionar arquivo do certificado'}</span>
                  <span className="block text-xs text-[var(--text-muted)] mt-0.5">{arquivo ? 'Toque para escolher outro arquivo' : 'Certificado A1, formato .pfx ou .p12'}</span>
                </span>
              </button>
              <Campo label="Senha do certificado">
                <input className={CAMPO} type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviarCertificado(); }} />
              </Campo>
              <Button variant="primary" className="h-11 w-full sm:w-auto sm:min-w-[200px]" onClick={enviarCertificado} disabled={ocupado || !arquivo || !senha} icon={enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}>
                {enviando ? 'Conferindo certificado' : 'Guardar certificado'}
              </Button>
            </section>
          </div>
        )}
      </ModalShell>

      {confirmarRemocao && (
        <ResultadoModal tipo="aviso" titulo="Remover o certificado?" onClose={() => setConfirmarRemocao(false)} acao={{ label: 'Sim, remover', onClick: remover }}>
          Sem o certificado a empresa não consegue emitir nem cancelar notas até enviar outro.
        </ResultadoModal>
      )}
      {resultado && (
        <ResultadoModal tipo={resultado.tipo} titulo={resultado.titulo} onClose={() => setResultado(null)}>
          {resultado.texto}
        </ResultadoModal>
      )}
    </>
  );
};
