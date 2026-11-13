// Teste da baixa automática do Asaas: as contas do pagamento + a baixa de verdade (FinancialEngine.postSettlement).
// Rodar: npx tsx scripts/test-cobranca-baixa.ts
class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
  clear() { this.store = {}; }
  key(i: number) { return Object.keys(this.store)[i] ?? null; }
  get length() { return Object.keys(this.store).length; }
}
(global as any).localStorage = new LocalStorageMock();
(global as any).window = global;

import assert from 'node:assert/strict';
import { componentesDoPagamento } from '../src/services/asaasMath';
import { FinancialEngine } from '../src/services/financialEngine';
import { storage } from '../src/services/storageService';
import type { BankAccount, FinancialTitle } from '../src/types';

let ok = 0;
const teste = (nome: string, fn: () => void) => {
  try { fn(); ok++; console.log('  ok  ', nome); }
  catch (e: any) { console.error('  FALHOU', nome, '\n       ', e.message); process.exitCode = 1; }
};

console.log('Contas do pagamento');
teste('pago no valor: principal cheio, sem juros nem desconto', () => {
  assert.deepEqual(componentesDoPagamento(1000, { value: 1000, original_value: 1000, net_value: 998.01 }), { principal: 1000, discount: 0, interest: 0, bankFee: 1.99 });
});
teste('pago com atraso (juros e multa do Asaas): a diferença vira juros', () => {
  assert.deepEqual(componentesDoPagamento(1000, { value: 1012.5, original_value: 1000, net_value: 1010.51 }), { principal: 1000, discount: 0, interest: 12.5, bankFee: 1.99 });
});
teste('pago com desconto: a diferença vira desconto', () => {
  assert.deepEqual(componentesDoPagamento(1000, { value: 950, original_value: 1000, net_value: 948.01 }), { principal: 1000, discount: 50, interest: 0, bankFee: 1.99 });
});
teste('sem valor líquido informado: tarifa zero', () => {
  assert.equal(componentesDoPagamento(300, { value: 300, original_value: 300, net_value: null }).bankFee, 0);
});
teste('título com saldo menor que a cobrança (baixa parcial feita à mão antes): principal limitado ao saldo', () => {
  assert.equal(componentesDoPagamento(600, { value: 1000, original_value: 1000, net_value: 998 }).principal, 600);
});
teste('centavos não acumulam erro de ponto flutuante', () => {
  const c = componentesDoPagamento(0.3, { value: 0.3, original_value: 0.1 + 0.2, net_value: 0.3 });
  assert.equal(c.principal, 0.3);
});

console.log('Baixa de verdade');
storage.initIfEmpty(true);
const hoje = new Date().toISOString().split('T')[0];
const conta: BankAccount = { id: 'conta-asaas-teste', institution: 'Asaas', name: 'Conta Asaas (teste)', type: 'CORRENTE', currency: 'BRL', initialBalance: 0, baseDate: '2026-01-01', includeInCashFlow: true, status: 'ATIVO' };
storage.saveBankAccounts([...storage.getBankAccounts(), conta]);
const novoTitulo = (id: string, valor: number): FinancialTitle => ({
  id, companyId: 'comp-1', type: 'RECEBER', titleNumber: id.toUpperCase(), counterpartyId: 'cli-x', description: 'Honorários', accountId: 'acc-3.1.01',
  launchDate: hoje, competence: hoje.slice(0, 7), issueDate: hoje, dueDate: hoje, expectedCashDate: hoje, originalAmount: valor, settledPrincipal: 0,
  balancePrincipal: valor, accruedInterest: 0, accruedFine: 0, documentState: 'CONFIRMADO', settlementState: 'ABERTO', originType: 'MANUAL',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
});
const saldoConta = () => FinancialEngine.getAccountBalance(conta.id);

teste('boleto pago com juros: título liquidado e o banco recebe o líquido (valor pago - tarifa)', () => {
  storage.saveTitles([novoTitulo('t-juros', 1000), ...storage.getTitles()]);
  const antes = saldoConta();
  const c = componentesDoPagamento(1000, { value: 1012.5, original_value: 1000, net_value: 1010.51 });
  const r = FinancialEngine.postSettlement({
    titleId: 't-juros', settlementDate: hoje, bankAccountId: conta.id, principalSettled: c.principal, discount: c.discount,
    interest: c.interest, fine: 0, bankFee: c.bankFee, voucherRef: 'pay_teste_1'
  });
  assert.equal(r.success, true, r.message);
  const t = storage.getTitles().find(x => x.id === 't-juros')!;
  assert.equal(t.settlementState, 'LIQUIDADO');
  assert.equal(t.balancePrincipal, 0);
  assert.equal(Math.round((saldoConta() - antes) * 100) / 100, 1010.51);
  assert.equal(r.settlement!.voucherRef, 'pay_teste_1');
});
teste('mesma baixa de novo é recusada (título já liquidado): sem dinheiro em dobro', () => {
  const r = FinancialEngine.postSettlement({ titleId: 't-juros', settlementDate: hoje, bankAccountId: conta.id, principalSettled: 1000, discount: 0, interest: 0, fine: 0, bankFee: 0 });
  assert.equal(r.success, false);
});
teste('período fechado: a baixa é recusada com mensagem clara (vira "pede atenção" na tela)', () => {
  const mes = hoje.slice(0, 7);
  const fechamentos = storage.getPeriodClosures();
  storage.savePeriodClosures([...fechamentos, { yearMonth: mes, isClosed: true } as any]);
  try {
    storage.saveTitles([novoTitulo('t-fechado', 500), ...storage.getTitles()]);
    const r = FinancialEngine.postSettlement({ titleId: 't-fechado', settlementDate: hoje, bankAccountId: conta.id, principalSettled: 500, discount: 0, interest: 0, fine: 0, bankFee: 0 });
    assert.equal(r.success, false);
    assert.match(r.message, /encerrad/i);
  } finally {
    storage.savePeriodClosures(fechamentos);
  }
});

console.log(process.exitCode ? '\nHá falhas.' : `\nTudo certo: ${ok} verificações.`);
