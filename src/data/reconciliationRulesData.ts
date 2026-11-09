import { ReconciliationRule } from '../types';

export const INITIAL_RECONCILIATION_RULES: ReconciliationRule[] = [
  {
    id: 'rule-tarifa-bancaria',
    name: 'Tarifas e Pacotes de Serviços Bancários',
    pattern: 'TARIFA',
    matchType: 'CONTAINS',
    transactionType: 'DEBIT',
    chartAccountId: 'acc-4.1.01', // Despesas Bancárias / Financeiras
    counterpartyId: 'forn-1',
    action: 'AUTO_CREATE_AND_RECONCILE',
    active: true,
    priority: 1,
    descriptionTemplate: 'Tarifa Bancária Debitada em Conta',
    tags: ['banco', 'tarifas', 'despesa_financeira'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'rule-internet-telefonia',
    name: 'Internet e Telefonia Corporativa',
    pattern: 'INTERNET',
    matchType: 'CONTAINS',
    transactionType: 'DEBIT',
    chartAccountId: 'acc-2.1.05', // Conectividade e Internet
    counterpartyId: 'forn-5', // Vivo Empresas
    action: 'AUTO_CREATE_AND_RECONCILE',
    active: true,
    priority: 2,
    descriptionTemplate: 'Pagamento Internet Fibra Óptica',
    tags: ['telecom', 'vivo', 'conectividade'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'rule-energia-eletrica',
    name: 'Energia Elétrica Sede Contaju',
    pattern: 'ENEL',
    matchType: 'CONTAINS',
    transactionType: 'DEBIT',
    chartAccountId: 'acc-2.1.04', // Utilidades / Energia
    counterpartyId: 'forn-4', // Enel Energia
    action: 'AUTO_CREATE_AND_RECONCILE',
    active: true,
    priority: 3,
    descriptionTemplate: 'Fatura de Energia Elétrica Enel',
    tags: ['utilidades', 'enel', 'energia'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'rule-honorarios-servicos',
    name: 'Honorários de Serviços Contábeis',
    pattern: 'HONORARIOS',
    matchType: 'CONTAINS',
    transactionType: 'CREDIT',
    chartAccountId: 'acc-1.1.01', // Honorários Contábeis
    counterpartyId: 'cli-1',
    action: 'AUTO_SUGGEST',
    active: true,
    priority: 4,
    descriptionTemplate: 'Recebimento de Honorários Contábeis',
    tags: ['receita', 'honorarios', 'servicos'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'rule-pix-alpha',
    name: 'Recebimentos PIX Recorrentes Alpha',
    pattern: 'ALPHA',
    matchType: 'CONTAINS',
    transactionType: 'CREDIT',
    chartAccountId: 'acc-1.1.01',
    counterpartyId: 'cli-7', // Studio Alpha Arquitetura
    action: 'AUTO_SUGGEST',
    active: true,
    priority: 5,
    descriptionTemplate: 'Recebimento PIX - Studio Alpha',
    tags: ['pix', 'receita', 'alpha'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }
];
