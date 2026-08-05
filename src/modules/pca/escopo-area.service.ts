// ============================================================
// SERVICE — Escopo de área (Centro de Custo) por usuário
// backend/src/modules/pca/escopo-area.service.ts
//
// Regra: Gestor, Solicitante e Operador só enxergam Demandas/Itens do PCA
// da sua área (Centro de Custo) e de tudo que está hierarquicamente abaixo
// dela (usando o prefixo de `estruturaBenner`). Os demais perfis
// (Administrador, Comprador, Aprovador, Auditor) não são restritos.
//
// Um Item do PCA consolidado pode reunir Demandas de vários setores —
// nesse caso ele fica visível pra quem tem PELO MENOS UM setor em comum
// (ver uso em consolidacao/risco/aprovacao/saldo/relatorio/pncp/revisao).
// ============================================================

import prisma from '../../shared/prisma'

export const PERFIS_RESTRITOS_POR_AREA = ['Gestor', 'Solicitante', 'Operador']

/**
 * Retorna a lista de IDs de Centro de Custo visíveis para o usuário, ou
 * `null` se o perfil não é restrito (enxerga tudo, sem filtro).
 *
 * Perfil restrito sem área configurada => retorna [] (não vê nada — padrão
 * seguro, evita vazar dados por esquecimento de configuração).
 */
export async function obterEscopoCentroCusto(idUsuario: string, perfil: string): Promise<string[] | null> {
  if (!PERFIS_RESTRITOS_POR_AREA.includes(perfil)) return null

  const usuario = await prisma.usuario.findUnique({
    where: { id: idUsuario },
    select: { idCentroCustoArea: true, idOrganizacao: true },
  })
  if (!usuario?.idCentroCustoArea) return []

  const centroBase = await prisma.centroCusto.findUnique({
    where: { id: usuario.idCentroCustoArea },
    select: { id: true, estruturaBenner: true, idOrganizacao: true },
  })
  if (!centroBase) return []

  // Sem estruturaBenner (item não veio do Benner ou é raiz sem caminho
  // definido) — só dá pra garantir o próprio nó, sem descendentes.
  if (!centroBase.estruturaBenner) return [centroBase.id]

  const descendentes = await prisma.centroCusto.findMany({
    where: {
      idOrganizacao: centroBase.idOrganizacao,
      estruturaBenner: { startsWith: centroBase.estruturaBenner },
    },
    select: { id: true },
  })

  const ids = new Set<string>([centroBase.id, ...descendentes.map(d => d.id)])
  return [...ids]
}

/** Monta a cláusula Prisma `where` pra filtrar Dfd por centro de custo, a
 * partir do escopo já calculado. `null` = sem filtro (não restrito). */
export function whereDfdPorEscopo(escopo: string[] | null) {
  if (escopo === null) return {}
  return { idCentroCusto: { in: escopo } }
}

/** Mesma ideia, mas pra Item do PCA — que não tem centro de custo direto,
 * e sim através das Demandas (Dfd) que foram consolidadas nele. Visível
 * se PELO MENOS UMA demanda do item estiver no escopo. */
export function whereItemPcaPorEscopo(escopo: string[] | null) {
  if (escopo === null) return {}
  return { dfdsOrigem: { some: { idCentroCusto: { in: escopo } } } }
}
