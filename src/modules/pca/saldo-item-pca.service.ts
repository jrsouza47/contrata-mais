// ============================================================
// SERVICE — Módulo PCA: Saldo do Item PCA (reserva / baixa / devolução)
// backend/src/modules/pca/saldo-item-pca.service.ts
//
// Todo Pedido vinculado a um Item do PCA reserva a quantidade solicitada
// (RESERVA). Quando a Proposta vencedora é homologada na Cotação (M3), a
// reserva vira consumo definitivo (BAIXA). Se o Pedido é cancelado ou
// reprovado, a reserva volta para o saldo disponível (DEVOLUCAO).
//
// O saldo em si (quantidadeReservada/quantidadeUtilizada no ItemPca) é um
// cache — a fonte de verdade auditável é sempre o ledger em
// MovimentoSaldoItemPca, por isso toda função aqui grava os dois juntos.
// ============================================================

import prisma from '../../shared/prisma'
import { TIPO_MOVIMENTO_SALDO } from './pca.constants'

type Db = typeof prisma // aceita tanto o client normal quanto um `tx` de transação

export interface SaldoItemPca {
  quantidadeTotal: number
  quantidadeReservada: number
  quantidadeUtilizada: number
  quantidadeDisponivel: number
}

// ── Saldo atual de um Item do PCA ───────────────────────────────────────────
export async function calcularSaldo(idItemPca: string): Promise<SaldoItemPca> {
  const item = await prisma.itemPca.findUnique({
    where: { id: idItemPca },
    select: { quantidadeTotal: true, quantidadeReservada: true, quantidadeUtilizada: true },
  })
  if (!item) throw new Error('Item do PCA não encontrado')

  const total = Number(item.quantidadeTotal)
  const reservada = Number(item.quantidadeReservada)
  const utilizada = Number(item.quantidadeUtilizada)

  return {
    quantidadeTotal: total,
    quantidadeReservada: reservada,
    quantidadeUtilizada: utilizada,
    quantidadeDisponivel: total - reservada - utilizada,
  }
}

// ── RESERVA — Pedido criado/editado, vinculado a um Item do PCA ────────────
// Valida saldo disponível ANTES de reservar; lança erro (e cancela a
// transação que estiver em volta) se insuficiente.
export async function reservar(params: {
  idOrganizacao: string
  idItemPca: string
  idPedido: string
  quantidade: number
  idUsuario?: string
  tx?: Db
}) {
  if (params.quantidade <= 0) return
  const db = params.tx ?? prisma

  const item = await db.itemPca.findUnique({
    where: { id: params.idItemPca },
    select: {
      numero: true, descricaoObjeto: true,
      quantidadeTotal: true, quantidadeReservada: true, quantidadeUtilizada: true,
    },
  })
  if (!item) throw new Error('Item do PCA não encontrado')

  const disponivel = Number(item.quantidadeTotal) - Number(item.quantidadeReservada) - Number(item.quantidadeUtilizada)
  if (params.quantidade > disponivel) {
    throw new Error(
      `Saldo insuficiente no Item do PCA ${item.numero} (${item.descricaoObjeto}). ` +
      `Disponível: ${disponivel} — solicitado: ${params.quantidade}.`
    )
  }

  await db.movimentoSaldoItemPca.create({
    data: {
      idOrganizacao: params.idOrganizacao,
      idItemPca: params.idItemPca,
      idPedido: params.idPedido,
      tipo: TIPO_MOVIMENTO_SALDO.RESERVA,
      quantidade: params.quantidade,
      idUsuario: params.idUsuario,
    },
  })

  await db.itemPca.update({
    where: { id: params.idItemPca },
    data: { quantidadeReservada: { increment: params.quantidade } },
  })
}

// ── DEVOLUCAO — Pedido cancelado ou reprovado: libera a reserva ────────────
// Devolve com base na reserva líquida ainda aberta deste pedido (RESERVA
// menos BAIXA/DEVOLUCAO já lançadas para ele) — não um valor fixo — assim
// funciona certo mesmo que o pedido tenha sido editado no meio do caminho.
export async function devolver(params: {
  idOrganizacao: string
  idPedido: string
  idUsuario?: string
  observacao?: string
  tx?: Db
}) {
  const db = params.tx ?? prisma
  const reservaPorItem = await obterReservaLiquidaPorItem(params.idPedido, db)

  for (const r of reservaPorItem) {
    if (r.quantidade <= 0) continue
    await db.movimentoSaldoItemPca.create({
      data: {
        idOrganizacao: params.idOrganizacao,
        idItemPca: r.idItemPca,
        idPedido: params.idPedido,
        tipo: TIPO_MOVIMENTO_SALDO.DEVOLUCAO,
        quantidade: r.quantidade,
        idUsuario: params.idUsuario,
        observacao: params.observacao,
      },
    })
    await db.itemPca.update({
      where: { id: r.idItemPca },
      data: { quantidadeReservada: { decrement: r.quantidade } },
    })
  }
}

// ── BAIXA — Proposta vencedora homologada na Cotação (M3) ──────────────────
export async function darBaixa(params: {
  idOrganizacao: string
  idItemPca: string
  idPedido: string
  idProposta: string
  quantidade: number
  valorReal: number
  idUsuario?: string
  tx?: Db
}) {
  const db = params.tx ?? prisma

  await db.movimentoSaldoItemPca.create({
    data: {
      idOrganizacao: params.idOrganizacao,
      idItemPca: params.idItemPca,
      idPedido: params.idPedido,
      idProposta: params.idProposta,
      tipo: TIPO_MOVIMENTO_SALDO.BAIXA,
      quantidade: params.quantidade,
      valorReal: params.valorReal,
      idUsuario: params.idUsuario,
    },
  })

  const item = await db.itemPca.findUnique({
    where: { id: params.idItemPca },
    select: { quantidadeReservada: true },
  })
  // Nunca deixa reservado negativo — clamp em 0 caso já tenha divergido.
  const novaReservada = Math.max(0, Number(item?.quantidadeReservada ?? 0) - params.quantidade)

  await db.itemPca.update({
    where: { id: params.idItemPca },
    data: {
      quantidadeReservada: novaReservada,
      quantidadeUtilizada: { increment: params.quantidade },
    },
  })
}

// ── Ajuste de reserva ao editar um Pedido (ainda em Rascunho) ──────────────
// Devolve a reserva líquida anterior e reserva de novo com o item/quantidade
// atualizados — cobre tanto "só mudou a quantidade" quanto "trocou de item
// do PCA" com a mesma lógica.
export async function ajustarReserva(params: {
  idOrganizacao: string
  idPedido: string
  novoIdItemPca: string
  novaQuantidade: number
  idUsuario?: string
  tx?: Db
}) {
  const db = params.tx ?? prisma
  await devolver({
    idOrganizacao: params.idOrganizacao, idPedido: params.idPedido,
    idUsuario: params.idUsuario, observacao: 'Ajuste por edição do pedido', tx: db,
  })
  await reservar({
    idOrganizacao: params.idOrganizacao, idItemPca: params.novoIdItemPca,
    idPedido: params.idPedido, quantidade: params.novaQuantidade,
    idUsuario: params.idUsuario, tx: db,
  })
}

// ── Reserva líquida atual de um Pedido, agrupada por Item do PCA ──────────
// Normalmente um Pedido só tem um Item do PCA vinculado de cada vez, mas o
// agrupamento garante que o cálculo continua certo mesmo que o pedido já
// tenha trocado de item do PCA numa edição anterior.
async function obterReservaLiquidaPorItem(
  idPedido: string, db: Db
): Promise<{ idItemPca: string; quantidade: number }[]> {
  const movimentos = await db.movimentoSaldoItemPca.findMany({
    where: { idPedido },
    select: { idItemPca: true, tipo: true, quantidade: true },
  })

  const saldos = new Map<string, number>()
  for (const m of movimentos) {
    const atual = saldos.get(m.idItemPca) ?? 0
    // RESERVA soma; BAIXA e DEVOLUCAO tiram do valor ainda reservado.
    const sinal = m.tipo === TIPO_MOVIMENTO_SALDO.RESERVA ? 1 : -1
    saldos.set(m.idItemPca, atual + sinal * Number(m.quantidade))
  }

  return Array.from(saldos.entries()).map(([idItemPca, quantidade]) => ({ idItemPca, quantidade }))
}

// ── Histórico de movimentação de um Item do PCA ────────────────────────────
// Quem comprou (solicitante), de qual setor (centro de custo), quando
// (criadoEm), e o número do Pedido de origem — pra tela de monitoramento.
export async function listarMovimentos(idItemPca: string) {
  return prisma.movimentoSaldoItemPca.findMany({
    where: { idItemPca },
    include: {
      pedido: {
        select: {
          numero: true,
          solicitante: { select: { nome: true } },
          centroCusto: { select: { codigo: true, descricao: true } },
        },
      },
      proposta: {
        select: {
          convite: { select: { fornecedor: { select: { razaoSocial: true } } } },
        },
      },
    },
    orderBy: { criadoEm: 'desc' },
  })
}

// ── Saldo + histórico do plano inteiro (Tela de monitoramento) ────────────
// Traz, de uma vez: todos os itens do plano com seu saldo (total/reservado/
// utilizado/disponível) e o ledger completo de movimentações, já com o item
// (número/descrição) e o pedido (número/solicitante/centro de custo)
// resolvidos — a tela não precisa fazer N chamadas, uma por item.
export async function obterSaldoPca(idOrganizacao: string, idPlano: string) {
  const [itens, movimentos] = await Promise.all([
    prisma.itemPca.findMany({
      where: { idOrganizacao, idPlano },
      select: {
        id: true, numero: true, descricaoObjeto: true,
        quantidadeTotal: true, quantidadeReservada: true, quantidadeUtilizada: true,
      },
      orderBy: { numero: 'asc' },
    }),
    prisma.movimentoSaldoItemPca.findMany({
      where: { idOrganizacao, itemPca: { idPlano } },
      include: {
        itemPca: { select: { id: true, numero: true, descricaoObjeto: true } },
        pedido: {
          select: {
            numero: true,
            solicitante: { select: { nome: true } },
            centroCusto: { select: { codigo: true, descricao: true } },
          },
        },
        proposta: {
          select: {
            convite: { select: { fornecedor: { select: { razaoSocial: true } } } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    }),
  ])

  const itensComSaldo = itens.map((i) => {
    const total = Number(i.quantidadeTotal)
    const reservada = Number(i.quantidadeReservada)
    const utilizada = Number(i.quantidadeUtilizada)
    return {
      id: i.id,
      numero: i.numero,
      descricaoObjeto: i.descricaoObjeto,
      quantidadeTotal: total,
      quantidadeReservada: reservada,
      quantidadeUtilizada: utilizada,
      quantidadeDisponivel: total - reservada - utilizada,
    }
  })

  return { itens: itensComSaldo, movimentos }
}
