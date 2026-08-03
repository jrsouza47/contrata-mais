// ============================================================
// CONSTANTES — Módulo de Licenciamento (controle de acesso por módulo)
// backend/src/modules/licenciamento/licenciamento.constants.ts
// ============================================================

// Lista oficial de módulos licenciáveis do sistema.
// Se um módulo novo for criado no futuro, adicionar aqui também.
export const MODULOS_SISTEMA = {
  M1_CATALOGO: 'M1_CATALOGO',
  M2_PEDIDOS: 'M2_PEDIDOS',
  M6_CONTRATOS: 'M6_CONTRATOS',
  M7_LICITACAO: 'M7_LICITACAO',
  PCA: 'PCA',
} as const

export type ModuloSistema = typeof MODULOS_SISTEMA[keyof typeof MODULOS_SISTEMA]

export const LISTA_MODULOS: ModuloSistema[] = Object.values(MODULOS_SISTEMA)

// Rótulos amigáveis — usados na tela de administração de licenças
export const MODULO_LABEL: Record<ModuloSistema, string> = {
  M1_CATALOGO: 'M1 — Catálogo',
  M2_PEDIDOS: 'M2 — Pedidos de Compra',
  M6_CONTRATOS: 'M6 — Contratos e Entregas',
  M7_LICITACAO: 'M7 — Licitação',
  PCA: 'PCA — Plano de Contratações Anual',
}

// Perfil com permissão para gerenciar licenças de módulo por organização.
// Fora da hierarquia normal de perfis da Terracap (GECOP, CPLIC, Autoridade Competente etc.)
export const PERFIL_ADMIN_DBLICITI = 'ADMINISTRADOR_DBLICITI'

// Tempo de cache em memória dos módulos ativos por organização (ms)
export const CACHE_TTL_MS = 60_000
