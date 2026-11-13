import { storage } from './storageService';
import { FinancialEngine } from './financialEngine';
import {
  avisarMudancaAsaas, dispensar, lerConfig, marcarAplicada, marcarErro, reservarRecebimentos,
  type AsaasCharge, type AsaasConfig, type AsaasReceipt
} from './asaasService';
import { componentesDoPagamento } from './asaasMath';
import type { Counterparty, FinancialTitle } from '../types';

/**
 * Baixa automática do que o Asaas recebeu.
 * O servidor só guarda o aviso de pagamento; QUEM DÁ A BAIXA É ESTE CÓDIGO, no navegador, pelo mesmo
 * caminho da baixa manual (FinancialEngine.postSettlement): respeita período fechado, saldo,
 * auditoria e movimentação do banco. Isso evita que uma aba aberta com dados antigos desfaça uma
 * baixa feita pelo servidor (o navegador regrava os títulos inteiros no banco).
 */

const arred = (v: number) => Math.round(v * 100) / 100;
const hoje = () => new Date().toISOString().split('T')[0];
const so = (v: string | null | undefined) => String(v || '').replace(/\D/g, '');

export interface ResultadoBaixa {
  baixadas: number;
  comErro: number;
  receitas: number;
}

async function baixarCobranca(c: AsaasCharge, cfg: AsaasConfig): Promise<'ok' | 'dispensada'> {
  const titles = storage.getTitles();
  const title = titles.find(t => t.id === c.title_id);
  if (!title) throw new Error('O título desta cobrança não foi encontrado (foi excluído?). Confira e dispense este aviso.');

  // Já existe baixa com este pagamento (ex.: a marcação anterior falhou): só confirma, não duplica
  const jaBaixada = storage.getSettlements().find(s => !s.isReversed && s.voucherRef === c.asaas_payment_id);
  if (jaBaixada) {
    await marcarAplicada('charge', c.id, jaBaixada.id);
    return 'ok';
  }
  if (title.settlementState === 'LIQUIDADO' || title.balancePrincipal <= 0.005) {
    await dispensar('charge', c.id, 'O título já estava baixado quando o pagamento chegou. Confira se houve pagamento em duplicidade.');
    return 'dispensada';
  }
  if (!cfg.bank_account_id || !storage.getBankAccounts().some(b => b.id === cfg.bank_account_id)) {
    throw new Error('A conta bancária do Asaas não está definida (ou foi excluída). Escolha em Configurar.');
  }
  const comp = componentesDoPagamento(title.balancePrincipal, c);
  if (comp.principal <= 0) throw new Error('Valor pago inválido para dar a baixa.');
  const data = c.paid_at && c.paid_at <= hoje() ? c.paid_at : hoje();
  const r = FinancialEngine.postSettlement({
    titleId: title.id,
    settlementDate: data,
    bankAccountId: cfg.bank_account_id,
    principalSettled: comp.principal,
    discount: comp.discount,
    interest: comp.interest,
    fine: 0,
    bankFee: comp.bankFee,
    notes: `Baixa automática pelo Asaas (${c.billing_type === 'PIX' ? 'Pix' : 'boleto'}).`,
    voucherRef: c.asaas_payment_id
  });
  if (!r.success || !r.settlement) throw new Error(r.message || 'Não foi possível dar a baixa.');
  await marcarAplicada('charge', c.id, r.settlement.id);
  return 'ok';
}

/** Cliente da assinatura: acha pelo CPF/CNPJ ou pelo nome; se não existe, cadastra. */
function acharOuCriarCliente(r: AsaasReceipt): Counterparty {
  const lista = storage.getCounterparties();
  const doc = so(r.customer_document);
  const nome = String(r.customer_name || '').trim();
  const achado =
    (doc && lista.find(p => so(p.document) === doc)) ||
    (nome && lista.find(p => p.name.trim().toLowerCase() === nome.toLowerCase())) ||
    null;
  if (achado) return achado;
  const novo: Counterparty = {
    id: `cp-asaas-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: 'CLIENTE',
    name: nome || 'Cliente do CRM Varejo',
    document: doc,
    email: r.customer_email || '',
    phone: '',
    status: 'ATIVO',
    notes: 'Cadastrado automaticamente a partir de uma assinatura recebida pelo Asaas.',
    createdAt: new Date().toISOString()
  };
  storage.addCounterparty(novo);
  return novo;
}

async function lancarReceita(r: AsaasReceipt, cfg: AsaasConfig): Promise<void> {
  if (!cfg.receita_conta_id) throw new Error('Escolha, em Configurar, a conta de receita das assinaturas do sistema.');
  if (!cfg.bank_account_id || !storage.getBankAccounts().some(b => b.id === cfg.bank_account_id)) {
    throw new Error('A conta bancária do Asaas não está definida (ou foi excluída). Escolha em Configurar.');
  }
  const jaBaixada = storage.getSettlements().find(s => !s.isReversed && s.voucherRef === r.asaas_payment_id);
  if (jaBaixada) {
    await marcarAplicada('receipt', r.id, jaBaixada.id);
    return;
  }
  const pago = r.paid_at && r.paid_at <= hoje() ? r.paid_at : hoje();
  const externalId = `asaas:${r.asaas_payment_id}`;
  const titles = storage.getTitles();
  let title: FinancialTitle | undefined = titles.find(t => t.externalId === externalId);
  if (!title) {
    const cliente = acharOuCriarCliente(r);
    const agora = new Date().toISOString();
    title = {
      id: `tit-asaas-${r.asaas_payment_id}`,
      companyId: storage.getCompany().id,
      type: 'RECEBER',
      titleNumber: `ASS-${r.asaas_payment_id.replace(/^pay_/, '').slice(-8).toUpperCase()}`,
      counterpartyId: cliente.id,
      description: `Assinatura do sistema - ${(r.description || 'CRM Varejo').replace(/^CRM Varejo\s*-?\s*/i, 'CRM Varejo ')} - ${cliente.name}`.slice(0, 200),
      accountId: cfg.receita_conta_id,
      launchDate: pago,
      competence: pago.slice(0, 7),
      issueDate: pago,
      dueDate: r.due_date || pago,
      expectedCashDate: pago,
      originalAmount: arred(Number(r.value)),
      settledPrincipal: 0,
      balancePrincipal: arred(Number(r.value)),
      accruedInterest: 0,
      accruedFine: 0,
      documentState: 'CONFIRMADO',
      settlementState: 'ABERTO',
      originType: 'MANUAL',
      expectedBankAccountId: cfg.bank_account_id,
      externalId,
      importSource: 'ASAAS',
      notes: 'Lançado automaticamente: pagamento de assinatura recebido pelo Asaas.',
      createdAt: agora,
      updatedAt: agora
    };
    storage.saveTitles([title, ...titles]);
  }
  const bankFee = r.net_value != null ? Math.max(0, arred(Number(r.value) - Number(r.net_value))) : 0;
  const res = FinancialEngine.postSettlement({
    titleId: title.id, settlementDate: pago, bankAccountId: cfg.bank_account_id, principalSettled: arred(Number(r.value)),
    discount: 0, interest: 0, fine: 0, bankFee, notes: 'Baixa automática: assinatura recebida pelo Asaas.', voucherRef: r.asaas_payment_id
  });
  if (!res.success || !res.settlement) throw new Error(res.message || 'Não foi possível dar a baixa.');
  await marcarAplicada('receipt', r.id, res.settlement.id, title.id);
}

let emAndamento = false;

/** Dá a baixa em tudo que o Asaas já recebeu e ainda não foi baixado. Seguro para chamar várias vezes. */
export async function processarRecebimentos(): Promise<ResultadoBaixa> {
  const vazio: ResultadoBaixa = { baixadas: 0, comErro: 0, receitas: 0 };
  if (emAndamento) return vazio;
  emAndamento = true;
  try {
    const cfg = await lerConfig();
    if (!cfg || !cfg.ativo) return vazio;
    const { charges, receipts } = await reservarRecebimentos();
    const res = { ...vazio };
    for (const c of charges) {
      try {
        const r = await baixarCobranca(c, cfg);
        if (r === 'ok') res.baixadas++;
      } catch (e: any) {
        res.comErro++;
        await marcarErro('charge', c.id, e?.message || 'Erro ao dar a baixa.');
      }
    }
    for (const r of receipts) {
      try {
        await lancarReceita(r, cfg);
        res.receitas++;
      } catch (e: any) {
        res.comErro++;
        await marcarErro('receipt', r.id, e?.message || 'Erro ao lançar a receita.');
      }
    }
    if (res.baixadas || res.receitas || res.comErro) avisarMudancaAsaas();
    return res;
  } catch {
    return vazio;
  } finally {
    emAndamento = false;
  }
}
