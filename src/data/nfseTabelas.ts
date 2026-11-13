// Tabelas fixas do leiaute oficial da NFS-e Nacional (esquema de 20/10/2026), com os mesmos textos do portal.

/** Situação tributária do PIS/COFINS (CST). */
export const CST_PIS_COFINS: [string, string][] = [
  ['00', 'Nenhum'],
  ['01', 'Operação Tributável com Alíquota Básica'],
  ['02', 'Operação Tributável com Alíquota Diferenciada'],
  ['03', 'Operação Tributável com Alíquota por Unidade de Medida de Produto'],
  ['04', 'Operação Tributável monofásica - Revenda a Alíquota Zero'],
  ['05', 'Operação Tributável por Substituição Tributária'],
  ['06', 'Operação Tributável a Alíquota Zero'],
  ['07', 'Operação Isenta da Contribuição'],
  ['08', 'Operação sem Incidência da Contribuição'],
  ['09', 'Operação com Suspensão da Contribuição'],
  ['49', 'Outras Operações de Saída'],
  ['50', 'Operação com Direito a Crédito – Vinculada Exclusivamente a Receita Tributada no Mercado Interno'],
  ['51', 'Operação com Direito a Crédito – Vinculada Exclusivamente a Receita Não-Tributada no Mercado Interno'],
  ['52', 'Operação com Direito a Crédito – Vinculada Exclusivamente a Receita de Exportação'],
  ['53', 'Operação com Direito a Crédito – Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno'],
  ['54', 'Operação com Direito a Crédito – Vinculada a Receitas Tributadas no Mercado Interno e de Exportação'],
  ['55', 'Operação com Direito a Crédito – Vinculada a Receitas Não Tributadas no Mercado Interno e de Exportação'],
  ['56', 'Operação com Direito a Crédito – Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno e de Exportação'],
  ['60', 'Crédito Presumido – Operação de Aquisição Vinculada Exclusivamente a Receita Tributada no Mercado Interno'],
  ['61', 'Crédito Presumido – Operação de Aquisição Vinculada Exclusivamente a Receita Não-Tributada no Mercado Interno'],
  ['62', 'Crédito Presumido – Operação de Aquisição Vinculada Exclusivamente a Receita de Exportação'],
  ['63', 'Crédito Presumido – Operação de Aquisição Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno'],
  ['64', 'Crédito Presumido – Operação de Aquisição Vinculada a Receitas Tributadas no Mercado Interno e de Exportação'],
  ['65', 'Crédito Presumido – Operação de Aquisição Vinculada a Receitas Não-Tributadas no Mercado Interno e de Exportação'],
  ['66', 'Crédito Presumido – Operação de Aquisição Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno e de Exportação'],
  ['67', 'Crédito Presumido – Outras Operações'],
  ['70', 'Operação de Aquisição sem Direito a Crédito'],
  ['71', 'Operação de Aquisição com Isenção'],
  ['72', 'Operação de Aquisição com Suspensão'],
  ['73', 'Operação de Aquisição a Alíquota Zero'],
  ['74', 'Operação de Aquisição sem Incidência da Contribuição'],
  ['75', 'Operação de Aquisição por Substituição Tributária'],
  ['98', 'Outras Operações de Entrada'],
  ['99', 'Outras Operações']
];

/** Tipo de retenção do PIS/COFINS/CSLL (as opções "1" e "2" são só PIS/COFINS e o portal não as mostra aqui). */
export const TIPO_RETENCAO_PIS_COFINS: [string, string][] = [
  ['0', 'PIS/COFINS/CSLL Não Retidos'],
  ['3', 'PIS/COFINS/CSLL Retidos'],
  ['4', 'PIS/COFINS Retidos, CSLL Não Retido'],
  ['5', 'PIS Retido, COFINS/CSLL Não Retido'],
  ['6', 'COFINS Retido, PIS/CSLL Não Retido'],
  ['7', 'PIS Não Retido, COFINS/CSLL Retidos'],
  ['8', 'PIS/COFINS Não Retidos, CSLL Retido'],
  ['9', 'COFINS Não Retido, PIS/CSLL Retidos']
];
