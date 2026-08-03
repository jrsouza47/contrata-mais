import { FastifyRequest, FastifyReply } from 'fastify'
import prisma from '../../shared/prisma'
import { darBaixa } from '../pca/saldo-item-pca.service'

// POST /cotacoes
export async function criarCotacao(req: FastifyRequest, reply: FastifyReply) {
  const {
    idOrganizacao,
    idPedido,
    titulo,
    modalidade,
    prazoRespostas,
    sigilo,
    criadoPor,
    fornecedores,
  } = req.body as any

  const itensPedido = await prisma.itemPedido.findMany({
    where: { idPedido },
    include: { item: true },
  })

  if (itensPedido.length === 0) {
    return reply.status(400).send({ erro: 'Pedido não possui itens.' })
  }

  const total = await prisma.cotacao.count({ where: { idOrganizacao } })
  const numero = `COT-${String(total + 1).padStart(5, '0')}`

  const cotacao = await prisma.cotacao.create({
    data: {
      idOrganizacao,
      idPedido,
      numero,
      titulo,
      modalidade,
      prazoRespostas: new Date(prazoRespostas),
      sigilo: sigilo ?? true,
      criadoPor,
      status: 'Aberta' as any,
      itens: {
        create: itensPedido.map((ip) => ({
          idItem: ip.idItem,
          quantidade: ip.quantidade,
          unidade: ip.item.unidadeMedida,
        })),
      },
      convites: {
        create: fornecedores.map((idFornecedor: string) => ({
          idFornecedor,
        })),
      },
    },
    include: {
      itens: true,
      convites: true,
    },
  })

  return reply.status(201).send(cotacao)
}

// PATCH /cotacoes/:id/encerrar
export async function encerrarCotacao(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any

  const cotacao = await prisma.cotacao.findUnique({ where: { id } })
  if (!cotacao) return reply.status(404).send({ erro: 'Cotação não encontrada.' })
  if (cotacao.status !== 'Aberta' as any) {
    return reply.status(400).send({ erro: `Cotação já está com status "${cotacao.status}".` })
  }

  const atualizada = await prisma.cotacao.update({
    where: { id },
    data: { status: 'Encerrada' as any },
  })

  return reply.send(atualizada)
}

// GET /cotacoes/:id/quadro
export async function quadroComparativo(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any

  const cotacao = await prisma.cotacao.findUnique({
    where: { id },
    include: {
      itens: {
        include: {
          item: true,
          propostas: {
            include: {
              convite: {
                include: { fornecedor: true },
              },
            },
          },
        },
      },
    },
  })

  if (!cotacao) return reply.status(404).send({ erro: 'Cotação não encontrada.' })

  const quadro = cotacao.itens.map((itemCot) => ({
    idItemCotacao: itemCot.id,
    item: itemCot.item.nome,
    quantidade: itemCot.quantidade,
    unidade: itemCot.unidade,
    propostas: itemCot.propostas.map((p) => ({
      idProposta: p.id,
      fornecedor: p.convite.fornecedor.razaoSocial,
      precoUnitario: p.precoUnitario,
      subtotal: p.subtotal,
      homologada: p.homologada,
    })),
  }))

  return reply.send({ cotacao: { id, numero: cotacao.numero, status: cotacao.status }, quadro })
}

// PATCH /cotacoes/:id/homologar
// Ao homologar a proposta vencedora, dá baixa no saldo do Item do PCA
// vinculado ao Pedido de origem: sai do "reservado" e entra em "utilizado",
// registrando quantidade e o valor real negociado (subtotal da proposta).
//
// Observação (limitação atual, não introduzida por esta mudança): este
// endpoint homologa UMA proposta por chamada e já marca a cotação inteira
// como "Homologada" — cotações com mais de um item precisam ser revistas
// separadamente (a segunda chamada falharia, pois o status deixa de ser
// "Encerrada" após a primeira homologação).
export async function homologarCotacao(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any
  const { idProposta, idUsuario } = req.body as any

  const cotacao = await prisma.cotacao.findUnique({ where: { id } })
  if (!cotacao) return reply.status(404).send({ erro: 'Cotação não encontrada.' })
  if (cotacao.status !== 'Encerrada' as any) {
    return reply.status(400).send({ erro: 'A cotação precisa estar Encerrada para ser homologada.' })
  }

  const proposta = await prisma.proposta.findUnique({
    where: { id: idProposta },
    include: { itemCotacao: true },
  })
  if (!proposta) return reply.status(404).send({ erro: 'Proposta não encontrada.' })

  const [, atualizada] = await prisma.$transaction(async (tx) => {
    const propostaAtualizada = await tx.proposta.update({
      where: { id: idProposta },
      data: { homologada: true },
    })

    const cotacaoAtualizada = await tx.cotacao.update({
      where: { id },
      data: { status: 'Homologada' as any },
    })

    // Baixa no Item do PCA — só roda se a cotação veio de um Pedido vinculado
    if (cotacao.idPedido) {
      const pedido = await tx.pedido.findUnique({
        where: { id: cotacao.idPedido },
        select: { idItemPca: true },
      })
      if (pedido?.idItemPca) {
        await darBaixa({
          idOrganizacao: cotacao.idOrganizacao,
          idItemPca: pedido.idItemPca,
          idPedido: cotacao.idPedido,
          idProposta,
          quantidade: Number(proposta.itemCotacao.quantidade),
          valorReal: Number(proposta.subtotal),
          idUsuario,
          tx: tx as any,
        })
      }
    }

    return [propostaAtualizada, cotacaoAtualizada]
  })

  return reply.send({ mensagem: 'Cotação homologada com sucesso.', cotacao: atualizada })
}

// PATCH /cotacoes/:id/desertar
export async function desertarCotacao(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any

  const cotacao = await prisma.cotacao.findUnique({
    where: { id },
    include: { convites: { include: { propostas: true } } },
  })

  if (!cotacao) return reply.status(404).send({ erro: 'Cotação não encontrada.' })
  if (cotacao.status !== 'Encerrada' as any) {
    return reply.status(400).send({ erro: 'A cotação precisa estar Encerrada para ser desertada.' })
  }

  const temPropostas = cotacao.convites.some((c) => c.propostas.length > 0)
  if (temPropostas) {
    return reply.status(400).send({ erro: 'Existem propostas recebidas. Use homologar em vez de desertar.' })
  }

  const atualizada = await prisma.cotacao.update({
    where: { id },
    data: { status: 'Deserta' as any },
  })

  return reply.send({ mensagem: 'Cotação declarada deserta.', cotacao: atualizada })
}