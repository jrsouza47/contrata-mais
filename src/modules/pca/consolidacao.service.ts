// ============================================================
// SERVICE — Módulo PCA: Consolidação (CPLIC)
// backend/src/modules/pca/consolidacao.service.ts
// Agrega demandas de mesma natureza em um único Item PCA (item 9.3)
// ============================================================

import prisma from '../../shared/prisma'
import { DFD_STATUS, ITEM_PCA_STATUS, TIPO_MOVIMENTO_SALDO } from './pca.constants'

interface ConsolidarInput {
  idOrganizacao: string
  idPlano: string
  idsDfd: string[]
  idUsuarioConsolidador: string
  // Sobrescritas opcionais — se ausentes, usa os dados da primeira demanda do grupo
  descricaoObjeto?: string
  unidadeFornecimento?: string
}

export async function gerarNumeroItemPca(idOrganizacao: string, ano: number): Promise<string> {
  // Antes usava count() — quebrou quando passamos a apagar itens
  // reprovados/ajustados (a contagem de itens restantes fica menor que
  // o maior número já emitido, e o próximo número gerado colide com um
  // que já existe). Usar o maior número já emitido evita isso.
  const ultimo = await prisma.itemPca.findFirst({
    where: { idOrganizacao, numero: { startsWith: `PCA-${ano}-` } },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  })
  const ultimoSeq = ultimo ? parseInt(ultimo.numero.slice(-5), 10) || 0 : 0
  return `PCA-${ano}-${String(ultimoSeq + 1).padStart(5, '0')}`
}

async function lerValorCorteRisco(idOrganizacao: string): Promise<number> {
  const org = await prisma.organizacao.findUnique({
    where: { id: idOrganizacao },
    select: { configuracoes: true },
  })
  const config = (org?.configuracoes as Record<string, unknown>) ?? {}
  const valor = config.pcaValorCorteRisco
  return typeof valor === 'number' ? valor : Infinity // sem parametrização = risco nunca obrigatório
}

// ── Candidatos à consolidação — demandas ENVIADAS ainda soltas ─
export async function listarCandidatosConsolidacao(idOrganizacao: string, idPlano: string) {
  return prisma.dfd.findMany({
    where: { idOrganizacao, idPlano, status: DFD_STATUS.ENVIADO, idItemPca: null },
    include: {
      solicitante: { select: { id: true, nome: true } },
      centroCusto: { select: { id: true, codigo: true, nome: true } },
      sugestoesIa: { where: { tipo: { in: ['DUPLICIDADE', 'AGREGACAO'] } } },
    },
    orderBy: [{ tipoObjeto: 'asc' }, { descricaoObjeto: 'asc' }],
  })
}

// ── Consolidar N demandas em um Item PCA ─────────────────────
export async function consolidarDemandas(input: ConsolidarInput) {
  if (input.idsDfd.length === 0) throw new Error('Selecione ao menos uma demanda para consolidar')

  const demandas = await prisma.dfd.findMany({
    where: {
      id: { in: input.idsDfd },
      idOrganizacao: input.idOrganizacao,
      idPlano: input.idPlano,
    },
  })
  if (demandas.length !== input.idsDfd.length) {
    throw new Error('Uma ou mais demandas não foram encontradas neste plano/organização')
  }
  const foraDoStatus = demandas.filter((d) => d.status !== DFD_STATUS.ENVIADO || d.idItemPca !== null)
  if (foraDoStatus.length > 0) {
    throw new Error('Só é possível consolidar demandas enviadas e ainda não consolidadas')
  }

  // Segregação de funções (diretriz 8.1.9): quem consolida não pode ser quem elaborou a demanda
  const conflito = demandas.some((d) => d.idSolicitante === input.idUsuarioConsolidador)
  if (conflito) {
    throw new Error('Segregação de funções: o consolidador não pode ser o solicitante de uma das demandas agregadas')
  }

  const plano = await prisma.planoContratacaoAnual.findUnique({ where: { id: input.idPlano } })
  if (!plano) throw new Error('Plano não encontrado')

  const quantidadeTotal = demandas.reduce((soma, d) => soma + Number(d.quantidade), 0)
  const valorTotal = demandas.reduce((soma, d) => soma + Number(d.valorEstimado), 0)
  const prioridade = Math.max(...demandas.map((d) => d.prioridade)) // maior prioridade entre as origens
  const dataDesejada = new Date(Math.min(...demandas.map((d) => d.dataDesejada.getTime())))
  const primeira = demandas[0]

  const valorCorte = await lerValorCorteRisco(input.idOrganizacao)
  const exigeGestaoRisco = valorTotal >= valorCorte

  // Tenta gerar o número e criar o item; se colidir (corrida entre
  // consolidações quase simultâneas), tenta de novo com o próximo número.
  let itemPca
  let tentativas = 0
  while (true) {
    tentativas++
    const numero = await gerarNumeroItemPca(input.idOrganizacao, plano.ano)
    try {
      itemPca = await prisma.$transaction(async (tx) => {
        const item = await tx.itemPca.create({
          data: {
            idOrganizacao: input.idOrganizacao,
            idPlano: input.idPlano,
            numero,
            tipoObjeto: primeira.tipoObjeto,
            descricaoObjeto: input.descricaoObjeto ?? primeira.descricaoObjeto,
            idItemCatalogo: primeira.idItemCatalogo,
            unidadeFornecimento: input.unidadeFornecimento ?? primeira.unidadeFornecimento,
            quantidadeTotal,
            valorTotal,
            prioridade,
            dataDesejada,
            status: ITEM_PCA_STATUS.EM_ELABORACAO,
            idConsolidadoPor: input.idUsuarioConsolidador,
            dataConsolidacao: new Date(),
            exigeGestaoRisco,
          },
        })

        await tx.dfd.updateMany({
          where: { id: { in: input.idsDfd } },
          data: { idItemPca: item.id, status: DFD_STATUS.CONSOLIDADO },
        })

        // Registra no ledger o saldo total planejado no momento da criação —
        // sem isso, o histórico de movimentação fica vazio até o primeiro
        // Pedido ser feito, mesmo o item já existindo com quantidade prevista.
        await tx.movimentoSaldoItemPca.create({
          data: {
            idOrganizacao: input.idOrganizacao,
            idItemPca: item.id,
            tipo: TIPO_MOVIMENTO_SALDO.CRIACAO,
            quantidade: quantidadeTotal,
            idUsuario: input.idUsuarioConsolidador,
            observacao: `Item criado na consolidação de ${input.idsDfd.length} demanda(s)`,
          },
        })

        return item
      })
      break
    } catch (err: any) {
      const colisaoDeNumero = err?.code === 'P2002' && String(err?.meta?.target ?? '').includes('numero')
      if (colisaoDeNumero && tentativas < 5) continue
      throw err
    }
  }

  return itemPca
}

// ── Listagens e detalhe ──────────────────────────────────────
export async function listarItensPca(idOrganizacao: string, filtros: { idPlano?: string; status?: number }) {
  return prisma.itemPca.findMany({
    where: { idOrganizacao, idPlano: filtros.idPlano, status: filtros.status },
    include: {
      dfdsOrigem: { include: { centroCusto: true, solicitante: { select: { id: true, nome: true } } } },
      riscos: true,
    },
    orderBy: { criadoEm: 'desc' },
  })
}

export async function obterDetalheItemPca(idItemPca: string, idOrganizacao: string) {
  const item = await prisma.itemPca.findFirst({
    where: { id: idItemPca, idOrganizacao },
    include: {
      dfdsOrigem: { include: { solicitante: { select: { id: true, nome: true } }, centroCusto: true } },
      riscos: true,
      dependencia: { select: { id: true, numero: true, descricaoObjeto: true } },
      dependentes: { select: { id: true, numero: true, descricaoObjeto: true } },
    },
  })
  if (!item) throw new Error('Item PCA não encontrado')
  return item
}

// ── Calendário de licitação — dependência entre itens (item 9.3) ─
export async function definirCalendarioItemPca(idItemPca: string, input: {
  idOrganizacao: string
  idItemPcaDependencia?: string
  dataPrevistaLicitacao?: string
}) {
  const item = await prisma.itemPca.findFirst({ where: { id: idItemPca, idOrganizacao: input.idOrganizacao } })
  if (!item) throw new Error('Item PCA não encontrado')
  if (input.idItemPcaDependencia === idItemPca) throw new Error('Um item não pode depender de si mesmo')

  return prisma.itemPca.update({
    where: { id: idItemPca },
    data: {
      idItemPcaDependencia: input.idItemPcaDependencia,
      dataPrevistaLicitacao: input.dataPrevistaLicitacao ? new Date(input.dataPrevistaLicitacao) : undefined,
    },
  })
}
