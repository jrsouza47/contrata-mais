// ============================================================
// SERVICE — Escopo de área (Área Organizacional) por usuário
// backend/src/modules/pca/escopo-area.service.ts
//
// Regra: Gestor, Solicitante e Operador só enxergam Demandas/Itens do PCA
// da sua área e de tudo que está hierarquicamente abaixo dela (usando a
// relação real de pai/filho de AreaOrganizacional). Os demais perfis
// (Administrador, Comprador, Aprovador, Auditor) não são restritos.
//
// Um Item do PCA consolidado pode reunir Demandas de vários setores —
// nesse caso ele fica visível pra quem tem PELO MENOS UM setor em comum
// (ver uso em consolidacao/risco/aprovacao/saldo/relatorio/pncp/revisao).
// ============================================================

import prisma from '../../shared/prisma'

export const PERFIS_RESTRITOS_POR_AREA = ['Gestor', 'Solicitante', 'Operador']

/**
 * Retorna a lista de IDs de Área Organizacional visíveis para o usuário, ou
 * `null` se o perfil não é restrito (enxerga tudo, sem filtro).
 *
 * Perfil restrito sem área configurada => retorna [] (não vê nada — padrão
 * seguro, evita vazar dados por esquecimento de configuração).
 *
 * Recebe só o idUsuario — busca o perfil internamente, assim as rotas não
 * precisam saber/repassar o perfil, só quem está logado.
 */
export async function obterEscopoCentroCusto(idUsuario: string | undefined): Promise<string[] | null> {
  if (!idUsuario) return null // sem usuário informado, não filtra (compatibilidade)

  const usuario = await prisma.usuario.findUnique({
    where: { id: idUsuario },
    select: { perfil: true, idCentroCustoArea: true, idOrganizacao: true },
  })
  if (!usuario) return null
  if (!PERFIS_RESTRITOS_POR_AREA.includes(usuario.perfil)) return null
  if (!usuario.idCentroCustoArea) return []

  const areaBase = await prisma.areaOrganizacional.findUnique({
    where: { id: usuario.idCentroCustoArea },
    select: { id: true, idOrganizacao: true },
  })
  if (!areaBase) return []

  // Busca todas as áreas da organização pra montar o mapa pai → filhos em
  // memória. Mais simples e robusto que uma CTE recursiva no banco, e o
  // volume de áreas por organização (dezenas a poucas centenas) é pequeno
  // o suficiente pra isso ser barato.
  const todasAreas = await prisma.areaOrganizacional.findMany({
    where: { idOrganizacao: areaBase.idOrganizacao },
    select: { id: true, idPai: true },
  })

  const filhosPorPai = new Map<string, string[]>()
  for (const a of todasAreas) {
    if (!a.idPai) continue
    const lista = filhosPorPai.get(a.idPai) ?? []
    lista.push(a.id)
    filhosPorPai.set(a.idPai, lista)
  }

  // Percorre a árvore a partir da área do usuário, coletando todos os
  // descendentes. O `ids.has` evita loop infinito mesmo se, por engano,
  // algum dado tivesse uma referência circular de id_pai.
  const ids = new Set<string>([areaBase.id])
  const pilha = [areaBase.id]
  while (pilha.length > 0) {
    const atual = pilha.pop()!
    for (const filhoId of filhosPorPai.get(atual) ?? []) {
      if (!ids.has(filhoId)) {
        ids.add(filhoId)
        pilha.push(filhoId)
      }
    }
  }

  return [...ids]
}

/** Monta a cláusula Prisma `where` pra filtrar Dfd por área organizacional,
 * a partir do escopo já calculado. `null` = sem filtro (não restrito). */
export function whereDfdPorEscopo(escopo: string[] | null) {
  if (escopo === null) return {}
  return { idCentroCusto: { in: escopo } }
}

/** Mesma ideia, mas pra Item do PCA — que não tem área organizacional
 * direta, e sim através das Demandas (Dfd) que foram consolidadas nele.
 * Visível se PELO MENOS UMA demanda do item estiver no escopo. */
export function whereItemPcaPorEscopo(escopo: string[] | null) {
  if (escopo === null) return {}
  return { dfdsOrigem: { some: { idCentroCusto: { in: escopo } } } }
}
