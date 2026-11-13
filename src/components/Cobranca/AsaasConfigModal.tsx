import React, { useMemo, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Loader2, PlugZap } from 'lucide-react';
import { Button } from '../Common/ui';
import { Aviso, CAMPO, Campo, ModalShell, ResultadoModal } from '../Fiscal/nfseUi';
import { storage } from '../../services/storageService';
import { asaasApi, avisarMudancaAsaas, type AsaasConfig, type AsaasConfigInput, type AsaasStatusInfo } from '../../services/asaasService';

interface Props {
  status: AsaasStatusInfo;
  onClose: () => void;
  onSaved: () => void;
}

const Interruptor: React.FC<{ ligado: boolean; onChange: (v: boolean) => void; titulo: string; texto?: string; desabilitado?: boolean }> = ({ ligado, onChange, titulo, texto, desabilitado }) => (
  <label className={`flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-4 ${desabilitado ? 'opacity-60' : 'cursor-pointer hover:bg-[var(--surface-hover)]'}`}>
    <input type="checkbox" className="mt-1 w-4 h-4 accent-[var(--brand-gold-fill)]" checked={ligado} disabled={desabilitado} onChange={e => onChange(e.target.checked)} />
    <span className="min-w-0">
      <span className="block text-sm font-medium text-[var(--text-primary)]">{titulo}</span>
      {texto && <span className="block mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed">{texto}</span>}
    </span>
  </label>
);

const Opcao: React.FC<{ marcada: boolean; onClick: () => void; titulo: string; texto: string }> = ({ marcada, onClick, titulo, texto }) => (
  <button
    type="button"
    onClick={onClick}
    className={`text-left rounded-xl border p-4 transition cursor-pointer ${marcada ? 'border-[var(--brand-gold-fill)] bg-[var(--brand-gold-soft)]' : 'border-[var(--border-highlight)] hover:bg-[var(--surface-hover)]'}`}
  >
    <span className="block text-sm font-semibold text-[var(--text-primary)]">{titulo}</span>
    <span className="block mt-1 text-xs text-[var(--text-muted)] leading-relaxed">{texto}</span>
  </button>
);

const inicial = (c: AsaasConfig | null): AsaasConfigInput => ({
  ambiente: c?.ambiente ?? 'sandbox',
  chave: '',
  ativo: c?.ativo ?? false,
  roboAtivo: c?.robo_ativo ?? false,
  antecedenciaDias: c?.antecedencia_dias ?? 10,
  limitePorExecucao: c?.limite_por_execucao ?? 30,
  bankAccountId: c?.bank_account_id ?? '',
  receitaContaId: c?.receita_conta_id ?? '',
  importarAssinaturasCrm: c?.importar_assinaturas_crm ?? false,
  notificarCliente: c?.notificar_cliente ?? false,
  multaPercentual: c?.multa_percentual != null ? String(c.multa_percentual).replace('.', ',') : '',
  jurosMensalPercentual: c?.juros_mensal_percentual != null ? String(c.juros_mensal_percentual).replace('.', ',') : '',
  confirmarProducao: false
});

export const AsaasConfigModal: React.FC<Props> = ({ status, onClose, onSaved }) => {
  const [f, setF] = useState<AsaasConfigInput>(() => inicial(status.config));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [testando, setTestando] = useState(false);
  const [teste, setTeste] = useState<{ ok: boolean; texto: string } | null>(null);
  const [avisos, setAvisos] = useState<{ carregando: boolean; manual?: { url: string; token: string; motivo?: string }; ok?: boolean; erro?: string }>({ carregando: false });
  const [resultado, setResultado] = useState(false);
  const [copiado, setCopiado] = useState('');

  const contasBanco = useMemo(() => storage.getBankAccounts().filter(b => b.status === 'ATIVO'), []);
  const contasReceita = useMemo(
    () => storage.getChartAccounts().filter(a => a.isAnalytical && a.isActive && String(a.nature).startsWith('RECEITA')).sort((a, b) => a.code.localeCompare(b.code)),
    []
  );
  const set = <K extends keyof AsaasConfigInput>(k: K, v: AsaasConfigInput[K]) => setF(prev => ({ ...prev, [k]: v }));
  const producaoNova = f.ambiente === 'producao' && status.config?.ambiente !== 'producao';
  const temChave = Boolean(status.temChave) || Boolean(f.chave.trim());

  const salvar = async () => {
    setErro('');
    setSalvando(true);
    try {
      await asaasApi.salvarConfig(f);
      avisarMudancaAsaas();
      setResultado(true);
    } catch (e: any) {
      setErro(e?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const testar = async () => {
    setTeste(null);
    setTestando(true);
    try {
      // Se digitou uma chave nova, salva antes de testar (o teste usa a chave guardada)
      if (f.chave.trim()) await asaasApi.salvarConfig({ ambiente: f.ambiente, chave: f.chave, confirmarProducao: f.confirmarProducao });
      const r = await asaasApi.testar();
      setTeste({ ok: true, texto: `Conexão funcionando no ambiente de ${r.ambiente === 'producao' ? 'produção (valendo)' : 'testes'}.` });
      setF(prev => ({ ...prev, chave: '' }));
      onSaved();
    } catch (e: any) {
      setTeste({ ok: false, texto: e?.message || 'Não foi possível conectar.' });
    } finally {
      setTestando(false);
    }
  };

  const ativarAvisos = async () => {
    setAvisos({ carregando: true });
    try {
      const r = await asaasApi.ativarAvisos();
      if (r.ok) setAvisos({ carregando: false, ok: true });
      else setAvisos({ carregando: false, manual: { url: r.url || '', token: r.token || '', motivo: r.motivo } });
      onSaved();
    } catch (e: any) {
      setAvisos({ carregando: false, erro: e?.message || 'Não foi possível ativar os avisos.' });
    }
  };
  const copiar = (texto: string, id: string) => {
    void navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(id);
      setTimeout(() => setCopiado(''), 2000);
    });
  };

  return (
    <>
      <ModalShell
        title="Conexão com o Asaas"
        subtitle="Boleto e Pix dos honorários, com baixa automática"
        icon={<PlugZap />}
        onClose={onClose}
        bloqueado={salvando}
        footer={
          <>
            <Button variant="ghost" className="h-12" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button variant="primary" className="h-12 px-6" onClick={() => void salvar()} disabled={salvando} icon={salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      >
        <div className="space-y-7">
          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ambiente</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Opcao marcada={f.ambiente === 'sandbox'} onClick={() => set('ambiente', 'sandbox')} titulo="Testes" texto="Nada vale dinheiro. Use para conferir tudo antes de cobrar de verdade." />
              <Opcao marcada={f.ambiente === 'producao'} onClick={() => set('ambiente', 'producao')} titulo="Valendo (produção)" texto="Boletos e Pix reais, cobrados dos seus clientes." />
            </div>
            {producaoNova && (
              <Interruptor ligado={f.confirmarProducao} onChange={v => set('confirmarProducao', v)} titulo="Entendo que, em produção, os boletos e Pix passam a valer" texto="Ao trocar de ambiente é preciso informar a chave correspondente abaixo." />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Chave do Asaas</h3>
            <Campo
              label={status.temChave ? 'Nova chave (deixe vazio para manter a atual)' : 'Chave da API'}
              hint="No Asaas: Integrações > Chave de API. Fica guardada com criptografia no servidor e nunca aparece de novo aqui."
            >
              <input className={CAMPO} type="password" autoComplete="off" value={f.chave} onChange={e => set('chave', e.target.value)} />
            </Campo>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void testar()} disabled={testando || !temChave} icon={testando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}>
                Testar conexão
              </Button>
              {teste && (
                <span className={`text-sm inline-flex items-center gap-1.5 ${teste.ok ? 'text-[var(--status-success)]' : 'text-[var(--status-danger)]'}`}>
                  {teste.ok && <CheckCircle2 className="w-4 h-4" />} {teste.texto}
                </span>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Onde o dinheiro entra</h3>
            <Campo label="Conta bancária onde o Asaas deposita" hint="É nesta conta que cada baixa automática entra, já descontada a tarifa do Asaas.">
              <select className={CAMPO} value={f.bankAccountId} onChange={e => set('bankAccountId', e.target.value)}>
                <option value="">Escolha…</option>
                {contasBanco.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.institution ? `${b.institution} - ` : ''}{b.name}
                  </option>
                ))}
              </select>
            </Campo>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Cobrança automática dos honorários</h3>
            <Interruptor
              ligado={f.roboAtivo}
              onChange={v => set('roboAtivo', v)}
              titulo="Robô diário"
              texto="Todo dia, gera o boleto ou Pix (conforme o contrato) dos honorários que estão perto de vencer e ainda não têm cobrança."
            />
            <div className="grid sm:grid-cols-2 gap-4">
              <Campo label="Gerar quantos dias antes do vencimento" hint="De 1 a 60 dias.">
                <input className={CAMPO} inputMode="numeric" value={f.antecedenciaDias} onChange={e => set('antecedenciaDias', Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </Campo>
              <Campo label="Máximo de cobranças por dia" hint="O que passar disso fica para o dia seguinte.">
                <input className={CAMPO} inputMode="numeric" value={f.limitePorExecucao} onChange={e => set('limitePorExecucao', Number(e.target.value.replace(/\D/g, '')) || 0)} />
              </Campo>
              <Campo label="Multa por atraso (%)" hint="Opcional. Cobrada pelo Asaas se o cliente pagar depois do vencimento.">
                <input className={CAMPO} inputMode="decimal" value={f.multaPercentual} onChange={e => set('multaPercentual', e.target.value)} />
              </Campo>
              <Campo label="Juros ao mês (%)" hint="Opcional. Também cobrado pelo Asaas depois do vencimento.">
                <input className={CAMPO} inputMode="decimal" value={f.jurosMensalPercentual} onChange={e => set('jurosMensalPercentual', e.target.value)} />
              </Campo>
            </div>
            <Interruptor ligado={f.notificarCliente} onChange={v => set('notificarCliente', v)} titulo="Deixar o Asaas avisar o cliente por e-mail e SMS" texto="Desligado, o cliente só recebe o que você mandar. Vale para clientes novos criados no Asaas." />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Assinaturas do CRM Varejo</h3>
            <Interruptor
              ligado={f.importarAssinaturasCrm}
              onChange={v => set('importarAssinaturasCrm', v)}
              titulo="Lançar como receita as assinaturas pagas"
              texto="Quando um cliente do CRM Varejo paga a mensalidade, ela entra aqui sozinha como receita (assinatura do sistema), já baixada."
            />
            {f.importarAssinaturasCrm && (
              <Campo label="Conta de receita das assinaturas" hint="Plano de contas onde a assinatura do sistema é registrada.">
                <select className={CAMPO} value={f.receitaContaId} onChange={e => set('receitaContaId', e.target.value)}>
                  <option value="">Escolha…</option>
                  {contasReceita.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Ligar a conexão</h3>
            <Interruptor ligado={f.ativo} onChange={v => set('ativo', v)} titulo="Conexão com o Asaas ligada" texto="Desligada, nada é gerado nem baixado. Os dados já criados continuam guardados." />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Avisos automáticos de pagamento</h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              O Asaas avisa o sistema assim que um cliente paga, para dar a baixa na hora. {status.config?.webhook_ativado_em ? 'Já está ativado.' : 'Salve a configuração, depois ative aqui.'}
            </p>
            <Button onClick={() => void ativarAvisos()} disabled={avisos.carregando || !status.config?.ativo} icon={avisos.carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {status.config?.webhook_ativado_em ? 'Ativar de novo (novo segredo)' : 'Ativar avisos automáticos'}
            </Button>
            {avisos.ok && <Aviso tipo="info">Avisos ativados no Asaas.</Aviso>}
            {avisos.erro && <Aviso tipo="erro">{avisos.erro}</Aviso>}
            {avisos.manual && (
              <div className="rounded-xl border border-[var(--border-highlight)] p-4 space-y-3 text-sm">
                <p className="text-[var(--text-secondary)]">O Asaas não deixou criar sozinho{avisos.manual.motivo ? ` (${avisos.manual.motivo})` : ''}. Cadastre em Integrações &gt; Webhooks, com estes dados. O segredo só aparece agora:</p>
                {[
                  ['Endereço (URL)', avisos.manual.url, 'url'],
                  ['Token de autenticação', avisos.manual.token, 'token']
                ].map(([rotulo, valor, id]) => (
                  <div key={id}>
                    <p className="text-xs text-[var(--text-muted)] mb-1">{rotulo}</p>
                    <div className="flex gap-2 items-center">
                      <code className="flex-1 min-w-0 break-all text-xs rounded-lg bg-[var(--surface-input)] border border-[var(--border-subtle)] p-2.5">{valor}</code>
                      <Button onClick={() => copiar(valor, id)} icon={<Copy className="w-4 h-4" />}>
                        {copiado === id ? 'Copiado' : 'Copiar'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </ModalShell>
      {resultado && (
        <ResultadoModal
          tipo="sucesso"
          titulo="Configuração salva"
          onClose={() => {
            setResultado(false);
            onSaved();
          }}
        >
          {f.ativo ? 'A conexão com o Asaas está ligada.' : 'A conexão está desligada: nada será gerado nem baixado até você ligar.'}
        </ResultadoModal>
      )}
    </>
  );
};
