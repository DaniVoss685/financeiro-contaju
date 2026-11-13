/**
 * Contas da baixa de um pagamento do Asaas (sem dependências, para poder ser testada sozinha).
 */
const arred = (v: number) => Math.round(v * 100) / 100;

/** Quanto do valor pago é principal, desconto, juros e tarifa (função pura, testada). */
export function componentesDoPagamento(
  saldoDoTitulo: number,
  c: { value: number; original_value: number | null; net_value: number | null }
): { principal: number; discount: number; interest: number; bankFee: number } {
  const pago = arred(Number(c.value));
  const cobrado = arred(Number(c.original_value ?? c.value));
  const principal = arred(Math.min(cobrado, saldoDoTitulo));
  const diferenca = arred(pago - cobrado);
  const bankFee = c.net_value != null ? Math.max(0, arred(pago - Number(c.net_value))) : 0;
  return { principal, discount: diferenca < 0 ? arred(-diferenca) : 0, interest: diferenca > 0 ? diferenca : 0, bankFee };
}
