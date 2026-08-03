// ============================================================
// SERVICE — Módulo PCA: Plano de Contratações Anual
// backend/src/modules/pca/plano.service.ts
// ============================================================

import prisma from '../../shared/prisma'
import { PLANO_STATUS } from './pca.constants'

// ── Criar (ou obter) o plano do exercício — versão 1, EM_ELABORACAO ─
export async function obterOuCriarPlanoDoAno(idOrganizacao: string, ano: number) {
  const existente = await prisma.planoContratacaoAnual.findFirst({
    where: { idOrganizacao, ano },
    orderBy: { versao: 'desc' },
  })
  if (existente) return existente

  return prisma.planoContratacaoAnual.create({
    data: { idOrganizacao, ano, versao: 1, status: PLANO_STATUS.EM_ELABORACAO },
  })
}

export async function listarPlanos(idOrganizacao: string) {
  return prisma.planoContratacaoAnual.findMany({
    where: { idOrganizacao },
    orderBy: [{ ano: 'desc' }, { versao: 'desc' }],
  })
}

export async function obterDetalhePlano(idPlano: string, idOrganizacao: string) {
  const plano = await prisma.planoContratacaoAnual.findFirst({
    where: { id: idPlano, idOrganizacao },
    include: {
      _count: { select: { dfds: true, itens: true } },
    },
  })
  if (!plano) throw new Error('Plano não encontrado')
  return plano
}

// ── Painel do PCA — números consolidados por unidade e corporativo ─
export async function obterPainel(idOrganizacao: string, idPlano: string) {
  const [
    totalDfds, dfdsPorStatus, totalItens, itensPorStatus, valorTotalItens,
    somaQuantidades, valorUtilizadoReal, itensComSaldoZerado,
  ] = await Promise.all([
    prisma.dfd.count({ where: { idOrganizacao, idPlano } }),
    prisma.dfd.groupBy({ by: ['status'], where: { idOrganizacao, idPlano }, _count: true }),
    prisma.itemPca.count({ where: { idOrganizacao, idPlano } }),
    prisma.itemPca.groupBy({ by: ['status'], where: { idOrganizacao, idPlano }, _count: true }),
    prisma.itemPca.aggregate({ where: { idOrganizacao, idPlano }, _sum: { valorTotal: true } }),
    // Saldo (quantidade) — soma total/reservado/utilizado de todos os itens do plano
    prisma.itemPca.aggregate({
      where: { idOrganizacao, idPlano },
      _sum: { quantidadeTotal: true, quantidadeReservada: true, quantidadeUtilizada: true },
    }),
    // Valor real de compra (soma das BAIXAS já homologadas neste plano)
    prisma.movimentoSaldoItemPca.aggregate({
      where: { idOrganizacao, tipo: 'BAIXA', itemPca: { idPlano } },
      _sum: { valorReal: true },
    }),
    // Quantos itens já bateram o teto (disponível = 0) — sinal de atenção no painel
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total FROM "item_pca"
      WHERE "id_organizacao" = ${idOrganizacao} AND "id_plano" = ${idPlano}
        AND ("quantidade_total" - "quantidade_reservada" - "quantidade_utilizada") <= 0
    `,
  ])

  const qtdTotal      = Number(somaQuantidades._sum.quantidadeTotal ?? 0)
  const qtdReservada  = Number(somaQuantidades._sum.quantidadeReservada ?? 0)
  const qtdUtilizada  = Number(somaQuantidades._sum.quantidadeUtilizada ?? 0)

  return {
    totalDemandas: totalDfds,
    demandasPorStatus: dfdsPorStatus,
    totalItens,
    itensPorStatus,
    valorTotalPlanejado: valorTotalItens._sum.valorTotal ?? 0,

    // Indicador de saldo (Tela 1 — Painel)
    saldo: {
      quantidadeTotal: qtdTotal,
      quantidadeReservada: qtdReservada,
      quantidadeUtilizada: qtdUtilizada,
      quantidadeDisponivel: qtdTotal - qtdReservada - qtdUtilizada,
      valorRealUtilizado: Number(valorUtilizadoReal._sum.valorReal ?? 0),
      itensComSaldoEsgotado: Number(itensComSaldoZerado[0]?.total ?? 0),
    },
  }
}
