// ============================================================
// CONSTANTES — Módulo PCA (Plano de Contratações Anual)
// backend/src/modules/pca/pca.constants.ts
// ============================================================

export const DFD_STATUS = {
  RASCUNHO:    1,
  ENVIADO:     2,
  CONSOLIDADO: 3,
  CANCELADO:   4,
  DEVOLVIDO:   5,
  REJEITADO:   6,
} as const

export const ITEM_PCA_STATUS = {
  EM_ELABORACAO: 1,
  EM_APROVACAO:  2,
  APROVADO:      3,
  PUBLICADO:     4,
  REJEITADO:     5,
} as const

export const PLANO_STATUS = {
  EM_ELABORACAO: 1,
  EM_APROVACAO:  2,
  APROVADO:      3,
  PUBLICADO:     4,
} as const

export const PRIORIDADE = {
  BAIXA: 1,
  MEDIA: 2,
  ALTA:  3,
} as const

// Tela 5 — Gestão de riscos (item 9.4 da norma)
export const PROBABILIDADE_RISCO = {
  BAIXA: 1,
  MEDIA: 2,
  ALTA:  3,
} as const

export const IMPACTO_RISCO = {
  BAIXO: 1,
  MEDIO: 2,
  ALTO:  3,
} as const

export const TIPOS_OBJETO = ['BEM', 'SERVICO', 'OBRA', 'TIC'] as const

// Tela 8 — Monitor de envio PNCP (item 9.9 da norma)
export const PNCP_ENVIO_STATUS = {
  PENDENTE:       'PENDENTE',
  EM_CONFERENCIA: 'EM_CONFERENCIA',
  ENVIADO:        'ENVIADO',
  ERRO:           'ERRO',
} as const

export const PNCP_TIPO_ENVIO = {
  PLANO:   'PLANO',
  ITEM:    'ITEM',
  REVISAO: 'REVISAO',
} as const

// Janela oficial de envio de demandas — 01/jan a 10/fev (norma, item 7)
export function dentroJanelaEnvioDfd(data: Date = new Date()): boolean {
  const ano = data.getFullYear()
  const inicio = new Date(ano, 0, 1)       // 1º de janeiro
  const fim = new Date(ano, 1, 10, 23, 59, 59) // 10 de fevereiro
  return data >= inicio && data <= fim
}

// Antecedência mínima de 60 dias entre envio à GECOP e a data desejada (item 9.6)
export const ANTECEDENCIA_MINIMA_DIAS = 60

// Período padrão (dias) usado na sugestão de preço com base no histórico
export const PERIODO_PADRAO_SUGESTAO_PRECO_DIAS = 365

// Campos mínimos exigidos pela norma para envio da demanda (item 10.1.3.1)
export const CAMPOS_MINIMOS_ENVIO_DFD = [
  'tipoObjeto',
  'codigoSistemaCorporativo',
  'unidadeFornecimento',
  'quantidade',
  'descricaoObjeto',
  'justificativa',
  'valorEstimado',
  'prioridade',
  'dataDesejada',
] as const

// Tela 9 — Relatórios de execução (item 9.7 da norma — declaração MANUAL)
export const SITUACAO_EXECUCAO = {
  NO_PRAZO:  'NO_PRAZO',
  ATRASADO:  'ATRASADO',
  EXECUTADO: 'EXECUTADO',
} as const

export const TIPO_RELATORIO_PCA = {
  TRIMESTRAL:   'TRIMESTRAL',
  SIMPLIFICADO: 'SIMPLIFICADO',
} as const

// Tela 10 — Revisão e redimensionamento (item 9.8 da norma)
export const TIPO_ALTERACAO_REVISAO = {
  INCLUSAO: 'INCLUSAO',
  EXCLUSAO: 'EXCLUSAO',
  REDIMENSIONAMENTO: 'REDIMENSIONAMENTO',
} as const

export const STATUS_REVISAO = {
  EM_APROVACAO: 'EM_APROVACAO',
  APROVADO: 'APROVADO',
  REJEITADO: 'REJEITADO',
} as const

// Saldo do Item PCA — histórico/ledger de reserva, baixa e devolução
export const TIPO_MOVIMENTO_SALDO = {
  CRIACAO:    'CRIACAO',    // Item do PCA criado na Consolidação — saldo total planejado
  RESERVA:    'RESERVA',    // Pedido criado/editado, vinculado a um Item do PCA
  BAIXA:      'BAIXA',      // Proposta vencedora homologada na Cotação (M3)
  DEVOLUCAO:  'DEVOLUCAO',  // Pedido cancelado ou reprovado
} as const

export const TIPO_JANELA_REVISAO = {
  SET_NOV: 'SET_NOV', // 1-30/set ou 16-30/nov — automático
  POS_LDO: 'POS_LDO', // 15 dias após aprovação da LDO — data externa, não rastreada pelo sistema
} as const

// Janelas automáticas de revisão: 1º a 30 de setembro, e 16 a 30 de novembro.
// A janela pós-LDO (15 dias após aprovação da LDO) depende de uma data externa
// que o sistema não tem como saber sozinho — por isso não é verificada aqui;
// fora das duas janelas de calendário, o usuário marca "fora da janela" e
// justifica (mesmo padrão já usado no envio de demanda).
export function dentroJanelaRevisao(data: Date = new Date()): boolean {
  const ano = data.getFullYear()
  const inicioSet = new Date(ano, 8, 1)                 // 1º de setembro
  const fimSet     = new Date(ano, 8, 30, 23, 59, 59)    // 30 de setembro
  const inicioNov  = new Date(ano, 10, 16)               // 16 de novembro
  const fimNov     = new Date(ano, 10, 30, 23, 59, 59)   // 30 de novembro
  return (data >= inicioSet && data <= fimSet) || (data >= inicioNov && data <= fimNov)
}
