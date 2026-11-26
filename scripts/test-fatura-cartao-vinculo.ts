/**
 * Fatura do cartão <-> Contas a Pagar, com dados sintéticos (nada vai para o banco: rede bloqueada).
 *
 * Cenários:
 *  1. Pagar a fatura no cartão dá baixa nos títulos do Contas a Pagar.
 *  2. Pagar de novo a mesma fatura é recusado (não debita o banco duas vezes).
 *  3. Reabrir a fatura volta títulos e parcelas para em aberto, estorna a saída do banco e desfaz a conciliação.
 *  4. Pagar de novo depois de reabrir funciona.
 *  5. Baixa feita título a título no Contas a Pagar faz a fatura aparecer paga no cartão; reabrir desfaz também.
 *  6. Pagamento parcial só marca como pagas as parcelas cujo título foi quitado.
 *  7. Fatura com estorno: o estorno abate o valor e nenhum título fica sobrando em aberto.
 *  8. Valor maior que o saldo é recusado.
 *  9. Período encerrado bloqueia pagar e reabrir.
 * 10. Editar uma compra já paga não volta o título para em aberto.
 *
 * Rodar: npx tsx scripts/test-fatura-cartao-vinculo.ts
 */
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; }
};
(globalThis as any).window = globalThis;
(globalThis as any).document = { visibilityState: 'visible', addEventListener: () => {} };
(globalThis as any).addEventListener = () => {};
(globalThis as any).fetch = async () => { throw new Error('rede bloqueada no teste'); };

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '  OK ' : '  FALHOU'} ${msg}`);
  if (!cond) failures++;
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  const { storage } = await import('../src/services/storageService');
  const { FinancialEngine } = await import('../src/services/financialEngine');
  const { buildCardInstallments } = await import('../src/utils/cardInvoice');

  storage.initIfEmpty(true);
  // Base limpa só com o que o teste cria
  storage.saveTitles([]);
  storage.saveSettlements([]);
  storage.saveMovements([]);
  storage.saveCardPurchases([]);
  storage.saveCardInvoicePayments([]);
  storage.saveStatementEntries([]);
  storage.savePeriodClosures([]);

  const BANK = 'bank-teste-cartao';
  storage.saveBankAccounts([{
    id: BANK, name: 'Banco Teste', bankName: 'Teste', accountType: 'CORRENTE',
    initialBalance: 10000, currentBalance: 10000, isActive: true, createdAt: new Date().toISOString()
  } as any]);

  const card = { id: 'card-teste', name: 'Cartão Teste', brand: 'MASTERCARD', closingDay: 30, dueDay: 10, creditLimit: 5000, defaultPaymentBankAccountId: BANK, isActive: true, createdAt: new Date().toISOString() } as any;
  storage.saveCreditCards([card]);

  let seq = 0;
  const addPurchase = (description: string, total: number, count: number, purchaseDate: string, type: 'DESPESA' | 'ESTORNO' = 'DESPESA') => {
    const id = `cp-teste-${++seq}`;
    storage.addCardPurchaseAndSyncTitles({
      id, cardId: card.id, description, totalAmount: total, purchaseDate,
      transactionType: type, installments: buildCardInstallments(card, purchaseDate, total, count),
      createdAt: new Date().toISOString()
    } as any);
    return id;
  };
  const inv = (m: string) => FinancialEngine.getCardInvoices(card.id).find(i => i.invoiceMonth === m)!;
  const titlesOf = (m: string) => storage.getTitles().filter(t => t.creditCardId === card.id && t.creditCardInvoiceMonth === m && t.type === 'PAGAR');
  const bankBalance = () => FinancialEngine.getAccountBalance(BANK);

  // Fatura 2026-08: 100 + 50 + parcela 1/2 de 200 (= 100) => 250
  const p1 = addPurchase('Compra A', 100, 1, '2026-08-05');
  addPurchase('Compra B', 50, 1, '2026-08-06');
  addPurchase('Compra C', 200, 2, '2026-08-07');

  console.log('\n[1] Pagar a fatura no cartão dá baixa no Contas a Pagar');
  ok(near(inv('2026-08').balance, 250), `saldo da fatura antes = 250 (veio ${inv('2026-08').balance})`);
  const r1 = FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-08', bankAccountId: BANK, amountPaid: 250, paymentDate: '2026-09-10' });
  ok(r1.success, `pagamento aceito ${r1.error || ''}`);
  ok(titlesOf('2026-08').every(t => t.settlementState === 'LIQUIDADO' && near(t.balancePrincipal, 0)), 'os 3 títulos da fatura ficaram LIQUIDADO');
  ok(inv('2026-08').status === 'PAGA', 'fatura aparece PAGA');
  ok(near(bankBalance(), 9750), `banco caiu 250 (saldo ${bankBalance()})`);
  ok(titlesOf('2026-09').every(t => t.settlementState === 'ABERTO'), 'a parcela 2/2 (fatura seguinte) continua em aberto');
  const state1 = FinancialEngine.getCardInvoiceState(card.id);
  ok(state1.installmentPaid.get(`${p1}-1`) === true, 'parcela da Compra A aparece paga no cartão');

  console.log('\n[2] Pagar de novo a mesma fatura é recusado');
  const r2 = FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-08', bankAccountId: BANK, amountPaid: 250, paymentDate: '2026-09-10' });
  ok(!r2.success, `segundo pagamento recusado ("${r2.error}")`);
  ok(near(bankBalance(), 9750), 'banco não foi debitado de novo');

  console.log('\n[3] Reabrir a fatura');
  // Concilia a saída do pagamento com uma linha do extrato
  const lump = storage.getMovements().find(m => m.originType === 'FATURA_CARTAO')!;
  storage.saveStatementEntries([{ id: 'st-teste-1', bankAccountId: BANK, date: '2026-09-10', description: 'PGTO FATURA', amount: -250, reconciliationStatus: 'CONCILIADO', matchedMovementId: lump.id } as any]);
  const prev = FinancialEngine.previewCardInvoiceReopen(card.id, '2026-08');
  ok(prev.titlesCount === 3 && near(prev.bankAmount, 250) && prev.reconciledCount === 1, `prévia: 3 títulos, R$ 250 no banco, 1 linha do extrato (veio ${prev.titlesCount}, ${prev.bankAmount}, ${prev.reconciledCount})`);
  const r3 = FinancialEngine.reopenCardInvoice({ cardId: card.id, invoiceMonth: '2026-08', reason: 'teste' });
  ok(r3.success && r3.reopenedTitles === 3, `reabriu 3 títulos (${r3.message})`);
  ok(titlesOf('2026-08').every(t => t.settlementState === 'ABERTO' && near(t.balancePrincipal, t.originalAmount)), 'títulos voltaram para ABERTO com saldo cheio');
  ok(storage.getSettlements().every(s => s.isReversed), 'baixas marcadas como estornadas (nada apagado)');
  ok(storage.getMovements().find(m => m.id === lump.id)?.isReversed === true, 'saída do banco estornada');
  ok(near(bankBalance(), 10000), `saldo do banco voltou para 10.000 (veio ${bankBalance()})`);
  const st = storage.getStatementEntries().find(s => s.id === 'st-teste-1')!;
  ok(st.reconciliationStatus === 'PENDENTE' && !st.matchedMovementId, 'linha do extrato voltou para pendente');
  ok(storage.getCardPurchases().every(p => p.installments.filter(i => i.invoiceMonth === '2026-08').every(i => !i.settled)), 'parcelas do cartão voltaram para em aberto');
  ok(inv('2026-08').status !== 'PAGA' && near(inv('2026-08').balance, 250) && !inv('2026-08').hasPayment, 'fatura em aberto com saldo 250 e sem botão de reabrir');
  const r3b = FinancialEngine.reopenCardInvoice({ cardId: card.id, invoiceMonth: '2026-08' });
  ok(!r3b.success, `reabrir de novo é recusado ("${r3b.message}")`);

  console.log('\n[4] Pagar de novo depois de reabrir');
  const r4 = FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-08', bankAccountId: BANK, amountPaid: 250, paymentDate: '2026-09-11' });
  ok(r4.success && inv('2026-08').status === 'PAGA' && near(bankBalance(), 9750), 'pagou de novo: fatura PAGA e banco 9.750');

  console.log('\n[5] Baixa título a título no Contas a Pagar aparece no cartão');
  // Fatura 2026-10: 80 + 20
  addPurchase('Compra D', 80, 1, '2026-10-02');
  addPurchase('Compra E', 20, 1, '2026-10-03');
  for (const t of titlesOf('2026-10')) {
    const res = FinancialEngine.postSettlement({ titleId: t.id, settlementDate: '2026-11-10', bankAccountId: BANK, principalSettled: t.balancePrincipal } as any);
    ok(res.success, `baixa no Contas a Pagar de ${t.description} ${res.success ? "" : res.message}`);
  }
  ok(inv('2026-10').status === 'PAGA' && near(inv('2026-10').balance, 0), 'fatura 10/2026 aparece PAGA no cartão');
  const r5 = FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-10', bankAccountId: BANK, amountPaid: 100, paymentDate: '2026-11-10' });
  ok(!r5.success, 'o cartão não deixa pagar de novo (evita débito em dobro)');
  const bankBefore5 = bankBalance();
  const r5b = FinancialEngine.reopenCardInvoice({ cardId: card.id, invoiceMonth: '2026-10' });
  ok(r5b.success && r5b.reopenedTitles === 2, 'reabrir desfaz as baixas feitas no Contas a Pagar');
  ok(near(bankBalance(), bankBefore5 + 100), `as saídas de 100 voltaram para o banco (antes ${bankBefore5}, agora ${bankBalance()})`);
  ok(titlesOf('2026-10').every(t => t.settlementState === 'ABERTO'), 'títulos de 10/2026 em aberto');

  console.log('\n[6] Pagamento parcial');
  const r6 = FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-10', bankAccountId: BANK, amountPaid: 80, paymentDate: '2026-11-10' });
  ok(r6.success, 'pagamento parcial de 80 aceito');
  const st6 = FinancialEngine.getCardInvoiceState(card.id);
  const paidFlags = storage.getCardPurchases().filter(p => p.installments.some(i => i.invoiceMonth === '2026-10')).map(p => st6.installmentPaid.get(`${p.id}-1`));
  ok(paidFlags.filter(Boolean).length === 1, `só 1 das 2 parcelas aparece paga (veio ${paidFlags.join(', ')})`);
  ok(near(inv('2026-10').balance, 20) && inv('2026-10').status !== 'PAGA', 'fatura com saldo 20, não aparece paga');
  ok(storage.getCardPurchases().flatMap(p => p.installments.filter(i => i.invoiceMonth === '2026-10')).filter(i => i.settled).length === 1, 'só 1 parcela gravada como paga');

  console.log('\n[7] Fatura com estorno');
  // Fatura 2026-11 (compra antes do fechamento dia 30): 300 de despesa e 50 de estorno => 250
  addPurchase('Compra F', 300, 1, '2026-11-05');
  addPurchase('Estorno F', 50, 1, '2026-11-06', 'ESTORNO');
  ok(near(inv('2026-11').balance, 250), `saldo com estorno = 250 (veio ${inv('2026-11').balance})`);
  const bankBefore7 = bankBalance();
  const r7 = FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-11', bankAccountId: BANK, amountPaid: 250, paymentDate: '2026-12-10' });
  ok(r7.success, 'pagamento de 250 aceito');
  ok(titlesOf('2026-11').every(t => t.settlementState === 'LIQUIDADO'), 'título de 300 ficou LIQUIDADO (estorno abateu 50)');
  ok(near(bankBalance(), bankBefore7 - 250), 'banco caiu só 250');
  ok(inv('2026-11').status === 'PAGA', 'fatura com estorno aparece PAGA');
  const recv = storage.getTitles().filter(t => t.creditCardInvoiceMonth === '2026-11' && t.type === 'RECEBER');
  const r7b = FinancialEngine.reopenCardInvoice({ cardId: card.id, invoiceMonth: '2026-11' });
  ok(r7b.success && near(inv('2026-11').balance, 250), 'reabrir volta saldo para 250');
  ok(storage.getTitles().filter(t => t.creditCardInvoiceMonth === '2026-11' && t.type === 'RECEBER').every((t, i) => t.settlementState === recv[i].settlementState), 'o título do estorno não foi mexido');

  console.log('\n[8] Valor maior que o saldo');
  const r8 = FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-11', bankAccountId: BANK, amountPaid: 999, paymentDate: '2026-12-10' });
  ok(!r8.success, `recusado ("${r8.error}")`);

  console.log('\n[9] Período encerrado');
  FinancialEngine.payCardInvoice({ cardId: card.id, invoiceMonth: '2026-11', bankAccountId: BANK, amountPaid: 250, paymentDate: '2026-12-10' });
  storage.savePeriodClosures([{ id: 'pc-teste', yearMonth: '2026-12', isClosed: true, closedAt: new Date().toISOString(), closedBy: 'teste' } as any]);
  const r9 = FinancialEngine.reopenCardInvoice({ cardId: card.id, invoiceMonth: '2026-11' });
  ok(!r9.success && inv('2026-11').status === 'PAGA', `reabrir bloqueado com período fechado ("${r9.message}")`);
  storage.savePeriodClosures([]);

  console.log('\n[10] Editar compra já paga');
  const pur = storage.getCardPurchases().find(p => p.id === p1)!;
  // Igual à tela de edição: as parcelas são remontadas com "settled: false"
  storage.updateCardPurchaseAndSyncTitles({ ...pur, description: 'Compra A (editada)', installments: pur.installments.map(i => ({ ...i, settled: false, settledAt: undefined, settlementId: undefined })) });
  const t10 = storage.getTitles().find(t => t.originId === p1)!;
  ok(t10.settlementState === 'LIQUIDADO' && near(t10.balancePrincipal, 0), `título continua LIQUIDADO depois de editar (veio ${t10.settlementState})`);
  ok(inv('2026-08').status === 'PAGA', 'fatura 08/2026 continua PAGA');
  // Compra paga título a título no Contas a Pagar (caso real do INTER - PRI) e depois editada
  const pG = addPurchase('Compra G', 40, 1, '2026-09-03');
  const tG = storage.getTitles().find(t => t.originId === pG)!;
  FinancialEngine.postSettlement({ titleId: tG.id, settlementDate: '2026-11-10', bankAccountId: BANK, principalSettled: 40 } as any);
  const purG = storage.getCardPurchases().find(p => p.id === pG)!;
  ok(purG.installments.every(i => !i.settled), 'parcela da Compra G continua gravada como não paga no cartão (como no banco real)');
  storage.updateCardPurchaseAndSyncTitles({ ...purG, description: 'Compra G (editada)' });
  const tG2 = storage.getTitles().find(t => t.originId === pG)!;
  ok(tG2.settlementState === 'LIQUIDADO', `título pago no Contas a Pagar continua LIQUIDADO depois de editar (veio ${tG2.settlementState})`);
  ok(FinancialEngine.getCardInvoiceState(card.id).installmentPaid.get(`${pG}-1`) === true, 'cartão mostra a Compra G como paga');

  console.log('\n[11] Reabrir no Contas a Pagar um título pago pela fatura');
  const t11 = titlesOf('2026-08')[0];
  const r11 = FinancialEngine.reopenTitlesToOpenBatch([t11.id], 'teste');
  ok(!r11.success && storage.getTitles().find(t => t.id === t11.id)!.settlementState === 'LIQUIDADO', `recusado e aponta para "Reabrir fatura" ("${r11.message}")`);
  const s11 = storage.getSettlements().find(s => s.titleId === t11.id && !s.isReversed)!;
  const r11b = FinancialEngine.reverseSettlement(s11.id, 'teste');
  ok(!r11b.success, `estorno avulso da baixa da fatura também recusado ("${r11b.message}")`);
  const tGr = FinancialEngine.reopenTitlesToOpenBatch([tG.id], 'teste');
  ok(tGr.success, 'título pago avulso no Contas a Pagar continua podendo ser reaberto lá');

  console.log(failures === 0 ? '\nTUDO CERTO' : `\n${failures} FALHA(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
