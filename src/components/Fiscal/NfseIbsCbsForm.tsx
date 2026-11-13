import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../Common/ui';
import { PremiumSelect } from '../Common/PremiumSelect';
import { CST_IBS_CBS, CLASSIFICACAO_TRIBUTARIA, INDICADOR_OPERACAO } from '../../data/nfseIbsCbs';
import { isValidCPF, isValidCNPJ } from '../../utils/cnpjValidator';
import { Campo, CAMPO, Aviso } from './nfseUi';
import type { NfseIbsCbsInput } from '../../services/nfseService';
import { EnderecoNfse, enderecoVazio, enderecoCompleto, buscarCep, cepPontuado } from '../../utils/nfseEndereco';

/** Estado do bloco IBS/CBS no formulário de emissão. */
export interface IbsCbsEstado {
  informar: boolean;
  indFinal: '0' | '1';
  compraGov: boolean;
  tpEnteGov: string;
  tpOper: string;
  indDest: '0' | '1';
  destDoc: string;
  destNome: string;
  destEnd: EnderecoNfse;
  cIndOp: string;
  cst: string;
  cClassTrib: string;
  refs: string[];
}

export const ibsCbsVazio = (informar = false): IbsCbsEstado => ({
  informar, indFinal: '0', compraGov: false, tpEnteGov: '', tpOper: '', indDest: '0', destDoc: '', destNome: '', destEnd: enderecoVazio(),
  cIndOp: '', cst: '', cClassTrib: '', refs: []
});

const ENTES: [string, string][] = [['1', 'União'], ['2', 'Estado'], ['3', 'Distrito Federal'], ['4', 'Município']];
const OPERACOES: [string, string][] = [
  ['1', 'Fornecimento com pagamento posterior'],
  ['2', 'Recebimento do pagamento com fornecimento já realizado'],
  ['3', 'Fornecimento com pagamento já realizado'],
  ['4', 'Recebimento do pagamento com fornecimento posterior'],
  ['5', 'Fornecimento e recebimento do pagamento concomitantes']
];

const so = (v: string) => (v || '').replace(/\D/g, '');

/** Confere o bloco e devolve as mensagens de erro por campo (vazio = tudo certo). */
export function validarIbsCbs(s: IbsCbsEstado, competencia: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!s.informar) return e;
  if (competencia && competencia < '2026-01-01') e.geral = 'IBS/CBS só pode ser informado para serviços com data a partir de 01/01/2026.';
  if (!s.cIndOp) e.cIndOp = 'Escolha o código indicador da operação.';
  if (!s.cst) e.cst = 'Escolha o código de situação tributária.';
  if (!s.cClassTrib) e.cClassTrib = 'Escolha o código de classificação tributária.';
  if (s.compraGov) {
    if (!s.tpEnteGov) e.tpEnteGov = 'Escolha o tipo de ente governamental.';
    if (!s.tpOper) e.tpOper = 'Escolha o tipo de operação.';
  }
  if (s.indDest === '1') {
    const d = so(s.destDoc);
    if (!(d.length === 14 ? isValidCNPJ(d) : d.length === 11 && isValidCPF(d))) e.destDoc = 'Informe um CPF ou CNPJ válido do destinatário.';
    if (!s.destNome.trim()) e.destNome = 'Informe o nome do destinatário.';
    if (!enderecoCompleto(s.destEnd)) e.destEnd = 'O portal exige o endereço do destinatário (CEP, rua, número e bairro).';
  }
  s.refs.forEach((r, i) => {
    if (so(r).length !== 50) e[`ref${i}`] = 'A chave de acesso tem 50 dígitos.';
  });
  return e;
}

/** Converte o estado do formulário no pedido enviado ao servidor. */
export function ibsCbsParaPedido(s: IbsCbsEstado): NfseIbsCbsInput | null {
  if (!s.informar) return null;
  return {
    informar: true,
    indFinal: s.indFinal,
    cIndOp: s.cIndOp,
    tpEnteGov: s.compraGov ? s.tpEnteGov : '',
    tpOper: s.compraGov ? s.tpOper : '',
    indDest: s.indDest,
    dest: s.indDest === '1'
      ? { documento: so(s.destDoc), nome: s.destNome.trim(), endereco: { cep: s.destEnd.cep, logradouro: s.destEnd.logradouro.trim(), numero: s.destEnd.numero.trim(), complemento: s.destEnd.complemento.trim(), bairro: s.destEnd.bairro.trim(), codigoMunicipio: s.destEnd.codigoMunicipio } }
      : null,
    cst: s.cst,
    cClassTrib: s.cClassTrib,
    refNFSe: s.refs.map(so).filter(Boolean)
  };
}

export function resumoIbsCbs(s: IbsCbsEstado): string {
  if (!s.informar) return 'Não informado. Marque "Sim" se a operação exige (comum no Lucro Presumido e no Lucro Real).';
  const cl = CLASSIFICACAO_TRIBUTARIA.find(c => c[0] === s.cClassTrib);
  return s.cst && s.cClassTrib ? `CST ${s.cst} • ${s.cClassTrib}${cl ? ` • ${cl[1]}` : ''}` : 'Informado: falta escolher a situação e a classificação tributária';
}

const Opcoes: React.FC<{ valor: string; onChange: (v: string) => void; itens: [string, string][]; nome: string }> = ({ valor, onChange, itens, nome }) => (
  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={nome}>
    {itens.map(([v, r]) => (
      <button
        key={v}
        type="button"
        role="radio"
        aria-checked={valor === v}
        onClick={() => onChange(v)}
        className={`min-h-[44px] px-4 rounded-xl border text-sm cursor-pointer transition-colors ${valor === v ? 'btn-gold font-semibold border-transparent' : 'border-[var(--border-highlight)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'}`}
      >
        {r}
      </button>
    ))}
  </div>
);

export const NfseIbsCbsForm: React.FC<{
  value: IbsCbsEstado;
  onChange: (v: IbsCbsEstado) => void;
  erros: Record<string, string>;
  competencia: string;
}> = ({ value: s, onChange, erros, competencia }) => {
  const set = (parcial: Partial<IbsCbsEstado>) => onChange({ ...s, ...parcial });
  const [novaRef, setNovaRef] = useState('');
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState('');

  const mudarCep = async (digitos: string) => {
    const d = so(digitos).slice(0, 8);
    const novo = { ...s.destEnd, cep: d, ...(d.length < 8 ? { codigoMunicipio: '', municipioNome: '' } : {}) };
    set({ destEnd: novo });
    setErroCep('');
    if (d.length === 8) {
      setBuscandoCep(true);
      const r = await buscarCep(d);
      setBuscandoCep(false);
      if (!r) { setErroCep('Não encontrei esse CEP. Confira o número digitado.'); return; }
      onChange({ ...s, destEnd: { ...novo, logradouro: novo.logradouro || r.logradouro || '', bairro: novo.bairro || r.bairro || '', codigoMunicipio: r.codigoMunicipio || '', municipioNome: r.municipioNome || '' } });
    }
  };

  const classificacoes = useMemo(() => CLASSIFICACAO_TRIBUTARIA.filter(c => !s.cst || c[2] === s.cst), [s.cst]);
  const csts = useMemo(() => {
    const usados = new Set(CLASSIFICACAO_TRIBUTARIA.map(c => c[2]));
    return CST_IBS_CBS.filter(c => usados.has(c[0]));
  }, []);
  const classEscolhida = CLASSIFICACAO_TRIBUTARIA.find(c => c[0] === s.cClassTrib);

  return (
    <div className="space-y-6">
      <Campo label="Preencher as informações de IBS/CBS?" hint="O portal pede este bloco nas notas de empresas que não são do Simples (Lucro Presumido e Lucro Real). Confirme com a contabilidade.">
        <Opcoes nome="Preencher IBS/CBS" valor={s.informar ? 'S' : 'N'} onChange={v => set({ informar: v === 'S' })} itens={[['S', 'Sim'], ['N', 'Não']]} />
      </Campo>

      {s.informar && (
        <>
          {competencia && competencia < '2026-01-01' && <Aviso tipo="erro">{erros.geral || 'IBS/CBS só vale para serviços com data a partir de 01/01/2026.'}</Aviso>}

          <Campo label="É uma compra governamental?">
            <Opcoes nome="Compra governamental" valor={s.compraGov ? 'S' : 'N'} onChange={v => set({ compraGov: v === 'S', ...(v === 'N' ? { tpEnteGov: '', tpOper: '' } : {}) })} itens={[['N', 'Não'], ['S', 'Sim']]} />
          </Campo>
          {s.compraGov && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Campo label="Tipo de ente governamental" erro={erros.tpEnteGov}>
                <PremiumSelect className={CAMPO} value={s.tpEnteGov} onChange={e => set({ tpEnteGov: e.target.value })} sheetTitle="Tipo de ente governamental">
                  <option value="">Selecione</option>
                  {ENTES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
                </PremiumSelect>
              </Campo>
              <Campo label="Tipo de operação" erro={erros.tpOper}>
                <PremiumSelect className={CAMPO} value={s.tpOper} onChange={e => set({ tpOper: e.target.value })} sheetTitle="Tipo de operação">
                  <option value="">Selecione</option>
                  {OPERACOES.map(([v, r]) => <option key={v} value={v}>{v} - {r}</option>)}
                </PremiumSelect>
              </Campo>
            </div>
          )}

          <Campo label="O cliente é consumidor final, para uso ou consumo pessoal?">
            <Opcoes nome="Consumo pessoal" valor={s.indFinal} onChange={v => set({ indFinal: v as '0' | '1' })} itens={[['0', 'Não'], ['1', 'Sim']]} />
          </Campo>

          <Campo label="Para apuração do IBS/CBS, o destinatário é o próprio cliente (adquirente)?">
            <Opcoes nome="Destinatário" valor={s.indDest} onChange={v => set({ indDest: v as '0' | '1' })} itens={[['0', 'Sim, é o mesmo'], ['1', 'Não, é outra pessoa']]} />
          </Campo>
          {s.indDest === '1' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Campo label="CPF ou CNPJ do destinatário" erro={erros.destDoc}>
                <input className={CAMPO} inputMode="numeric" value={s.destDoc} maxLength={18} onChange={e => set({ destDoc: e.target.value })} />
              </Campo>
              <Campo label="Nome do destinatário" erro={erros.destNome}>
                <input className={CAMPO} value={s.destNome} maxLength={150} onChange={e => set({ destNome: e.target.value })} />
              </Campo>
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5">
                {erros.destEnd && <div className="sm:col-span-2"><Aviso tipo="erro">{erros.destEnd}</Aviso></div>}
                <Campo label="CEP do destinatário" hint={buscandoCep ? 'Buscando endereço...' : 'Preenche rua, bairro e município.'} erro={erroCep}>
                  <input className={CAMPO} inputMode="numeric" value={cepPontuado(s.destEnd.cep)} onChange={e => void mudarCep(e.target.value)} />
                </Campo>
                <Campo label="Rua / logradouro">
                  <input className={CAMPO} value={s.destEnd.logradouro} maxLength={255} onChange={e => set({ destEnd: { ...s.destEnd, logradouro: e.target.value } })} />
                </Campo>
                <Campo label="Número" hint='Use "S/N" se não houver.'>
                  <input className={CAMPO} value={s.destEnd.numero} maxLength={60} onChange={e => set({ destEnd: { ...s.destEnd, numero: e.target.value } })} />
                </Campo>
                <Campo label="Bairro">
                  <input className={CAMPO} value={s.destEnd.bairro} maxLength={60} onChange={e => set({ destEnd: { ...s.destEnd, bairro: e.target.value } })} />
                </Campo>
                <Campo label="Município" hint="Vem do CEP.">
                  <input className={`${CAMPO} bg-[var(--surface-elevated)]`} readOnly value={s.destEnd.municipioNome ? `${s.destEnd.municipioNome} (${s.destEnd.codigoMunicipio})` : s.destEnd.codigoMunicipio} />
                </Campo>
              </div>
            </div>
          )}

          <Campo label="Código indicador da operação" erro={erros.cIndOp} hint="Diz onde o serviço é considerado prestado. Confirme com a contabilidade.">
            <PremiumSelect className={CAMPO} value={s.cIndOp} onChange={e => set({ cIndOp: e.target.value })} sheetTitle="Código indicador da operação">
              <option value="">Selecione</option>
              {INDICADOR_OPERACAO.map(([c, tipo, local]) => <option key={c} value={c}>{c} - {tipo}{local ? ` (${local})` : ''}</option>)}
            </PremiumSelect>
          </Campo>

          <div className="grid grid-cols-1 gap-5">
            <Campo label="Código de situação tributária (CST)" erro={erros.cst}>
              <PremiumSelect className={CAMPO} value={s.cst} onChange={e => set({ cst: e.target.value, cClassTrib: '' })} sheetTitle="Situação tributária do IBS/CBS">
                <option value="">Selecione</option>
                {csts.map(([c, n]) => <option key={c} value={c}>{c} - {n}</option>)}
              </PremiumSelect>
            </Campo>
            <Campo label="Código de classificação tributária" erro={erros.cClassTrib} hint={classEscolhida ? `Redução de alíquota: IBS ${classEscolhida[3]} • CBS ${classEscolhida[4]}` : 'Escolha primeiro a situação tributária; a lista mostra só as classificações dela.'}>
              <PremiumSelect className={CAMPO} value={s.cClassTrib} onChange={e => set({ cClassTrib: e.target.value })} disabled={!s.cst} sheetTitle="Classificação tributária">
                <option value="">Selecione</option>
                {classificacoes.map(([c, d]) => <option key={c} value={c}>{c} - {d}</option>)}
              </PremiumSelect>
            </Campo>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">Notas referenciadas (reembolso, repasse ou ressarcimento)</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Opcional. Informe a chave de acesso (50 dígitos) de cada NFS-e que entra na base de cálculo do IBS/CBS.</p>
            </div>
            {s.refs.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <input className={CAMPO} inputMode="numeric" value={r} maxLength={50} onChange={e => set({ refs: s.refs.map((x, k) => (k === i ? so(e.target.value) : x)) })} />
                  {erros[`ref${i}`] && <p className="mt-1.5 text-xs text-[var(--status-danger)]">{erros[`ref${i}`]}</p>}
                </div>
                <Button variant="ghost" className="h-11 w-11 px-0 shrink-0" aria-label="Remover nota referenciada" onClick={() => set({ refs: s.refs.filter((_, k) => k !== i) })} icon={<Trash2 className="w-4 h-4" />} />
              </div>
            ))}
            <div className="flex gap-2">
              <input className={CAMPO} inputMode="numeric" value={novaRef} maxLength={50} placeholder="Chave de acesso da NFS-e" onChange={e => setNovaRef(so(e.target.value))} />
              <Button className="h-11 shrink-0" icon={<Plus className="w-4 h-4" />} disabled={so(novaRef).length !== 50 || s.refs.length >= 99} onClick={() => { set({ refs: [...s.refs, so(novaRef)] }); setNovaRef(''); }}>Incluir</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
