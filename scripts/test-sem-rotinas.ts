// Garante que nenhuma rotina automática gera lançamentos (rodar: npx tsx scripts/test-sem-rotinas.ts)
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, length: 0 };
(globalThis as any).window = globalThis;
(async () => {
  const { storage } = await import('../src/services/storageService');
  const { renewContractInvoices, renewContractDueMonths, renewForeverRecurrences } = await import('../src/services/renewalService');
  storage.saveTitles([]); // aparelho com a lista vazia (antes de a nuvem chegar)
  const contratos = storage.getContracts().length;
  renewContractInvoices();
  const a = renewContractDueMonths();
  const b = renewForeverRecurrences();
  const n = storage.getTitles().length;
  console.log(`contratos: ${contratos} | títulos criados pelas rotinas: ${n} (${a}, ${b})`);
  console.log(n === 0 ? 'OK   nenhuma rotina gerou lançamento' : 'FALHA rotina gerou lançamento');
  process.exit(n === 0 ? 0 : 1);
})();
