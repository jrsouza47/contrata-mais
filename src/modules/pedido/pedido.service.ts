import prisma from '../../shared/prisma'
import {
  CriarPedidoInput,
  CadastrarPedidoInput,
  SubmeterPedidoInput,
  DecidirPedidoInput,
  EncaminharPedidoInput,
  CancelarPedidoInput,
  AtualizarPedidoInput,
} from './pedido.schema'
import { reservar, ajustarReserva, devolver } from '../pca/saldo-item-pca.service'

// ─────────────────────────────────────────────────────────────────────────────
// Domínio de status — M2 Pedido de Compra
// ─────────────────────────────────────────────────────────────────────────────
// 1  = Rascunho          (criado, editável)
// 2  = Cadastrado        (= "Submetido" no doc v2; bloqueia edição, aguarda aprovação)
// 3  = Em Aprovação      (fluxo de alçadas ativo)
// 4  = Aprovado          (todos os níveis aprovaram)
// 5  = Cancelado         (cancelado pelo solicitante; permitido nos status 1, 2, 3)
// 6  = Reprovado         (qualquer nível reprovou — definitivo, não reabre)
// 7  = Encaminhado       (comprador definiu destino: Cotação ou Licitação)
// 8  = Em Cotação        (M3 assumiu — portal apenas exibe)
// 9  = Licitação         (M7 enviou para Sistema de Licitação — portal apenas exibe)
// 10 = Contrato          (contrato gerado em M6 — portal apenas exibe)
// 11 = Integrado         (integrado a sistemas legados/ERP — portal apenas exibe)
//
// Domínio destinoPos: 1=Cotação | 2=Licitação
// Domínio aprovacao.decisao: 1=Aprovado | 2=Reprovado
// Domínio tipoProcesso: 1=Pedido | 2=Cotação | 3=Contrato | 4=Licitação
//
// BACKLOG — próximas sprints:
//   - Status 4b "Aprovado parcialmente": aprovador seleciona itens aprovados;
//     itens não aprovados retornam ao solicitante.
//   - Item não catalogado: campo 'descricaoLivre' opcional no ItemPedido.
//   - Pedido urgente: flag 'urgente' reduz fluxo a um nível de aprovação.
//   - Pedido recorrente: endpoint POST /pedidos/:id/clonar.
//   - Falta de orçamento: status 12 "Aguardando dotação" (configurável por org).
// ─────────────────────────────────────────────────────────────────────────────

// ── Vínculo obrigatório com o PCA (item 9.6 da especificação) ───────────────
// Todo Pedido precisa apontar para um Item PCA aprovado/publicado do plano
// vigente. Se a data desejada do item estiver a menos de 60 dias, exige
// justificativa (instrução processual) em vez de bloquear — mesmo padrão já
// usado no DFD (foraDaJanela / justificativaForaJanela).
const JANELA_MINIMA_DIAS_PCA = 60

async function validarVinculoPca(
  idOrganizacao: string,
  idItemPca: string,
  justificativaForaJanela?: string
): Promise<{ foraDaJanelaPca: boolean }> {
  const item = await prisma.itemPca.findFirst({
    where: { id: idItemPca, idOrganizacao },
  })
  if (!item) throw new Error('Item do PCA não encontrado para esta organização')

  // status: 1=EM_ELABORACAO 2=EM_APROVACAO 3=APROVADO 4=PUBLICADO 5=REJEITADO
  if (![3, 4].includes(item.status)) {
    throw new Error(
      'Só é possível vincular um Pedido a um Item do PCA aprovado ou publicado (item 9.6 da norma)'
    )
  }

  let foraDaJanelaPca = false
  if (item.dataDesejada) {
    const hoje = new Date()
    const diffDias = Math.floor(
      (item.dataDesejada.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    )
    if (diffDias < JANELA_MINIMA_DIAS_PCA) {
      if (!justificativaForaJanela || justificativaForaJanela.trim().length < 10) {
        throw new Error(
          `Este item está a menos de ${JANELA_MINIMA_DIAS_PCA} dias da data desejada — ` +
          'informe a instrução processual/justificativa para prosseguir (item 9.6 da norma)'
        )
      }
      foraDaJanelaPca = true
    }
  }

  return { foraDaJanelaPca }
}

async function gerarNumeroPedido(idOrganizacao: string): Promise<string> {
  // Lê configurações da organização
  const org = await prisma.organizacao.findUnique({
    where: { id: idOrganizacao },
    select: { configuracoes: true },
  })

  const cfg = (org?.configuracoes as Record<string, unknown>) ?? {}
  const prefixo          = String(cfg.pedidoPrefixo ?? 'PD')
  const usaAno           = cfg.pedidoUsaAno !== false
  const digitos          = Number(cfg.pedidoDigitosSequencial ?? 6)
  const reiniciaAno      = cfg.pedidoSequencialReiniciaAno !== false
  const ano              = new Date().getFullYear()

  // Prefixo do número (igual ao que será montado no final), para buscar o
  // maior número já emitido com esse mesmo prefixo/ano.
  const prefixoNumero = usaAno ? `${prefixo}-${ano}-` : `${prefixo}-`

  // Baseado no MAIOR número já usado, não na contagem de registros — se um
  // pedido no meio da sequência for excluído, a contagem cai mas o maior
  // número usado continua o mesmo, e usar count()+1 gera colisão com um
  // número que já existe (mesmo problema já corrigido em gerarNumeroDfd e
  // gerarNumeroItemPca).
  const where: any = { idOrganizacao, numero: { startsWith: prefixoNumero } }
  if (reiniciaAno) {
    const inicio = new Date(`${ano}-01-01T00:00:00.000Z`)
    const fim    = new Date(`${ano + 1}-01-01T00:00:00.000Z`)
    where.criadoEm = { gte: inicio, lt: fim }
  }

  const ultimo = await prisma.pedido.findFirst({
    where,
    orderBy: { numero: 'desc' },
    select: { numero: true },
  })
  const ultimoSequencial = ultimo ? parseInt(ultimo.numero.split('-').pop() ?? '0', 10) || 0 : 0
  const seq = String(ultimoSequencial + 1).padStart(digitos, '0')

  // Monta número: PREFIXO[-ANO]-SEQUENCIAL
  const partes = [prefixo]
  if (usaAno) partes.push(String(ano))
  partes.push(seq)

  return partes.join('-')
}

// ── Preview do próximo número (sem criar pedido) ────────────────────────────────
export async function previewNumeroPedido(idOrganizacao: string): Promise<string> {
  return gerarNumeroPedido(idOrganizacao)
}

// ── Criar pedido (status 1 = Rascunho) ───────────────────────────────────────
// Reserva a quantidade solicitada no saldo do Item do PCA vinculado. Se não
// houver saldo disponível, a criação inteira é cancelada (transação) — o
// pedido não fica "meio criado" sem reserva.
export async function criarPedido(data: CriarPedidoInput) {
  const { itens, idItemPca, justificativaForaJanela, ...pedidoData } = data

  const { foraDaJanelaPca } = await validarVinculoPca(
    pedidoData.idOrganizacao,
    idItemPca,
    justificativaForaJanela
  )

  const valorTotal = itens.reduce(
    (acc: number, i: CriarPedidoInput['itens'][0]) =>
      acc + i.quantidade * i.precoUnitario,
    0
  )
  const quantidadeTotalPedido = itens.reduce(
    (acc: number, i: CriarPedidoInput['itens'][0]) => acc + Number(i.quantidade),
    0
  )

  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.create({
      data: {
        ...pedidoData,
        idItemPca,
        foraDaJanelaPca,
        justificativaForaJanelaPca: justificativaForaJanela,
        numero: await gerarNumeroPedido(pedidoData.idOrganizacao),
        valorTotal,
        status: 1,
        itens: {
          create: itens.map((i: CriarPedidoInput['itens'][0]) => ({
            idItem: i.idItem,
            quantidade: i.quantidade,
            precoUnitario: i.precoUnitario,
            subtotal: i.quantidade * i.precoUnitario,
            observacao: i.observacao,
          })),
        },
      },
      include: { itens: true },
    })

    // Lança erro (e desfaz a criação acima) se não houver saldo suficiente
    await reservar({
      idOrganizacao: pedidoData.idOrganizacao,
      idItemPca,
      idPedido: pedido.id,
      quantidade: quantidadeTotalPedido,
      idUsuario: pedidoData.idSolicitante,
      tx: tx as any,
    })

    return pedido
  })
}

// ── Listar pedidos (grid) ─────────────────────────────────────────────────────
export async function listarPedidos(idOrganizacao: string) {
  return prisma.pedido.findMany({
    where: { idOrganizacao },
    select: {
      id: true,
      numero: true,
      status: true,
      valorTotal: true,
      justificativa: true,
      nivelAtual: true,
      destinoPos: true,
      criadoEm: true,
      atualizadoEm: true,
      idCentroCusto: true,
      solicitante: { select: { id: true, nome: true, perfil: true } },
      centroCusto: { select: { id: true, codigo: true, descricao: true } },
    },
    orderBy: { criadoEm: 'desc' },
  })
}

// ── Buscar pedido completo ────────────────────────────────────────────────────
export async function buscarPedido(id: string) {
  return prisma.pedido.findUnique({
    where: { id },
    include: {
      itens: { include: { item: true } },
      aprovacoes: {
        include: { aprovador: { select: { id: true, nome: true, perfil: true } } },
        orderBy: { criadoEm: 'asc' },
      },
      solicitante: { select: { id: true, nome: true, email: true, perfil: true } },
      centroCusto: { select: { id: true, codigo: true, descricao: true } },
      itemPca: {
        select: {
          id: true, numero: true, descricaoObjeto: true,
          plano: { select: { ano: true, versao: true } },
        },
      },
      analisesCpl: {
        orderBy: { criadoEm: 'desc' },
        take: 1,
        select: {
          motivoTexto: true,
          statusResultado: true,
        },
      },
    },
  })
}

// ── Cadastrar pedido (1 → 2) — botão "Cadastrar" ─────────────────────────────
export async function cadastrarPedido(id: string, data: CadastrarPedidoInput) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.status !== 1)
    throw new Error('Apenas pedidos em Rascunho podem ser cadastrados')

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: { status: 2 },
  })

  await prisma.auditoriaPedido.create({
    data: {
      idPedido: id,
      acao: 'Cadastrado',
      valorAntes: '1',
      valorDepois: '2',
      usuarioId: data.idUsuario,
    },
  })

  return pedidoAtualizado
}

// ── Submeter pedido para aprovação (2 → 3) ────────────────────────────────────
export async function submeterPedido(id: string, data: SubmeterPedidoInput) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.status !== 2)
    throw new Error('Apenas pedidos Cadastrados podem ser submetidos para aprovação')

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: { status: 3, nivelAtual: 1 },
  })

  await prisma.auditoriaPedido.create({
    data: {
      idPedido: id,
      acao: 'Submetido para aprovação',
      valorAntes: '2',
      valorDepois: '3',
      usuarioId: data.idUsuario,
    },
  })

  return pedidoAtualizado
}

// ── Decidir pedido (3 → 4 Aprovado | 3 → 5 Reprovado) ───────────────────────
// Reprovado é definitivo (não reabre para edição — se precisar refazer, o
// solicitante cria um pedido novo), mas devolve o saldo reservado no Item
// do PCA, já que a compra nunca chegou a acontecer.
export async function decidirPedido(id: string, data: DecidirPedidoInput) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.status !== 3)
    throw new Error('Pedido não está em aprovação')

  const alcada = await prisma.alcadaAprovacao.findFirst({
    where: { idOrganizacao: pedido.idOrganizacao, tipo: 1, ativo: true },
    include: {
      usuarios: {
        where: { status: 1 },
      },
    },
  })

  if (!alcada) throw new Error('Alçada de aprovação não configurada para Pedido')

  const decisaoInt = data.decisao === 'Aprovado' ? 1 : 2
  const novoStatus = decisaoInt === 2 ? 6 /* Reprovado */ : 4 /* Aprovado */

  return prisma.$transaction(async (tx) => {
    await tx.aprovacaoPedido.create({
      data: {
        idPedido: id,
        idAlcada: alcada.id,
        idAprovador: data.idAprovador,
        nivel: pedido.nivelAtual,
        decisao: decisaoInt,
        justificativa: data.justificativa,
      },
    })

    const pedidoAtualizado = await tx.pedido.update({
      where: { id },
      data: { status: novoStatus, nivelAtual: pedido.nivelAtual },
    })

    await tx.auditoriaPedido.create({
      data: {
        idPedido: id,
        acao: data.decisao,
        usuarioId: data.idAprovador,
        valorDepois: String(novoStatus),
      },
    })

    if (decisaoInt === 2) {
      await devolver({
        idOrganizacao: pedido.idOrganizacao,
        idPedido: id,
        idUsuario: data.idAprovador,
        observacao: `Pedido reprovado na alçada — ${data.justificativa ?? ''}`.trim(),
        tx: tx as any,
      })
    }

    return pedidoAtualizado
  })
}

// ── Encaminhar pedido aprovado (4 → 7) ───────────────────────────────────────
export async function encaminharPedido(id: string, data: EncaminharPedidoInput) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.status !== 4)
    throw new Error('Apenas pedidos aprovados podem ser encaminhados')

  const destinoInt = data.destino === 'Cotacao' ? 1 : 2
  // Cotação → status 7. Licitação → status 2 (entra na fila do CPL)
  const novoStatusEncaminhar = data.destino === 'Cotacao' ? 7 : 20

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: { status: novoStatusEncaminhar, destinoPos: destinoInt },
  })

  await prisma.auditoriaPedido.create({
    data: {
      idPedido: id,
      acao: 'Encaminhado',
      valorDepois: String(destinoInt),
      usuarioId: data.idComprador,
    },
  })

  return pedidoAtualizado
}

// ── Atualizar pedido rascunho (status 1) ─────────────────────────────────────
export async function atualizarPedido(id: string, data: AtualizarPedidoInput) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.status !== 1)
    throw new Error('Apenas pedidos em Rascunho podem ser editados')

  // Extrai os campos do model Pedido
  const { itens, idCentroCusto, idAlcada, criticidade, justificativa, observacao, tipoPedido, idItemPca, justificativaForaJanela } = data

  // Se o vínculo com o PCA está sendo alterado, revalida (item 9.6 da norma)
  let foraDaJanelaPca: boolean | undefined
  if (idItemPca !== undefined) {
    const resultado = await validarVinculoPca(pedido.idOrganizacao, idItemPca, justificativaForaJanela)
    foraDaJanelaPca = resultado.foraDaJanelaPca
  }

  // Recalcula valor total se itens forem enviados
  let valorTotal = Number(pedido.valorTotal)
  const itensMudaram = !!(itens && itens.length > 0)
  const itemPcaMudou = idItemPca !== undefined && idItemPca !== pedido.idItemPca

  return prisma.$transaction(async (tx) => {
    if (itensMudaram) {
      valorTotal = itens!.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0)
      // Remove itens antigos e recria
      await tx.itemPedido.deleteMany({ where: { idPedido: id } })
      await tx.itemPedido.createMany({
        data: itens!.map(i => ({
          idPedido: id,
          idItem: i.idItem,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
          subtotal: i.quantidade * i.precoUnitario,
          observacao: i.observacao,
        })),
      })
    }

    // Se a quantidade dos itens mudou ou o vínculo com o PCA mudou, ajusta a
    // reserva de saldo (devolve a anterior e reserva de novo com o total
    // atual) — lança erro e desfaz tudo se o novo total não couber no saldo.
    if (itensMudaram || itemPcaMudou) {
      const itemPcaFinal = idItemPca ?? pedido.idItemPca
      if (itemPcaFinal) {
        const quantidadeFinal = itensMudaram
          ? itens!.reduce((acc, i) => acc + Number(i.quantidade), 0)
          : (await tx.itemPedido.aggregate({ where: { idPedido: id }, _sum: { quantidade: true } }))._sum.quantidade ?? 0

        await ajustarReserva({
          idOrganizacao: pedido.idOrganizacao,
          idPedido: id,
          novoIdItemPca: itemPcaFinal,
          novaQuantidade: Number(quantidadeFinal),
          idUsuario: pedido.idSolicitante,
          tx: tx as any,
        })
      }
    }

    return tx.pedido.update({
      where: { id },
      data: {
        ...(idCentroCusto !== undefined ? { idCentroCusto } : {}),
        ...(idAlcada      !== undefined ? { idAlcada      } : {}),
        ...(criticidade   !== undefined ? { criticidade   } : {}),
        ...(justificativa !== undefined ? { justificativa } : {}),
        ...(observacao    !== undefined ? { observacao    } : {}),
        ...(tipoPedido    !== undefined ? { tipoPedido    } : {}),
        ...(idItemPca     !== undefined ? { idItemPca, foraDaJanelaPca, justificativaForaJanelaPca: justificativaForaJanela } : {}),
        valorTotal,
      },
      include: {
        itens: { include: { item: true } },
        solicitante: { select: { id: true, nome: true, email: true, perfil: true } },
        centroCusto: { select: { id: true, codigo: true, descricao: true } },
        itemPca: {
          select: {
            id: true, numero: true, descricaoObjeto: true,
            plano: { select: { ano: true, versao: true } },
          },
        },
        analisesCpl: {
          orderBy: { criadoEm: 'desc' },
          take: 1,
          select: {
            motivoTexto: true,
            statusResultado: true,
          },
        },
      },
    })
  })
}

// ── Voltar para Rascunho (2 → 1) ────────────────────────────────────────────
export async function voltarRascunho(id: string, idUsuario: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')
  if (pedido.status !== 2)
    throw new Error('Apenas pedidos Cadastrados podem voltar para Rascunho')

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: { status: 1 },
  })

  await prisma.auditoriaPedido.create({
    data: {
      idPedido: id,
      acao: 'Voltou para Rascunho',
      valorAntes: '2',
      valorDepois: '1',
      usuarioId: idUsuario,
    },
  })

  return pedidoAtualizado
}

// ── Copiar pedido ─────────────────────────────────────────────────────────────
export async function copiarPedido(id: string, idUsuario: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { itens: true },
  })
  if (!pedido) throw new Error('Pedido não encontrado')

  const novoNumero = await gerarNumeroPedido(pedido.idOrganizacao)

  const novo = await prisma.pedido.create({
    data: {
      idOrganizacao: pedido.idOrganizacao,
      idSolicitante: idUsuario,
      idCentroCusto: pedido.idCentroCusto ?? undefined,
      numero: novoNumero,
      justificativa: pedido.justificativa,
      valorTotal: pedido.valorTotal,
      status: 1,
      itens: {
        create: pedido.itens.map(it => ({
          idItem: it.idItem,
          quantidade: it.quantidade,
          precoUnitario: it.precoUnitario,
          subtotal: it.subtotal,
          observacao: it.observacao ?? undefined,
        })),
      },
    },
    include: { itens: { include: { item: true } }, solicitante: true, centroCusto: true },
  })

  await prisma.auditoriaPedido.create({
    data: {
      idPedido: novo.id,
      acao: 'Copiado de ' + pedido.numero,
      usuarioId: idUsuario,
    },
  })

  return novo
}

// ── Cancelar pedido (1,2,3 → 5) ──────────────────────────────────────────────
// Status 5 = Cancelado (confirmado pelo STATUS_LABEL do frontend). O código
// original já estava certo aqui — devolve ao Item do PCA a quantidade que
// estava reservada por este pedido.
export async function cancelarPedido(id: string, data: CancelarPedidoInput) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')

  const statusPermitidos = [1, 2, 3]
  if (!statusPermitidos.includes(pedido.status)) {
    throw new Error('Pedido não pode ser cancelado neste status')
  }

  return prisma.$transaction(async (tx) => {
    const pedidoAtualizado = await tx.pedido.update({
      where: { id },
      data: { status: 5 },
    })

    await tx.auditoriaPedido.create({
      data: {
        idPedido: id,
        acao: 'Cancelado',
        valorAntes: String(pedido.status),
        valorDepois: data.motivo,
        usuarioId: data.idUsuario,
        campo: 'motivo',
      },
    })

    await devolver({
      idOrganizacao: pedido.idOrganizacao,
      idPedido: id,
      idUsuario: data.idUsuario,
      observacao: `Pedido cancelado — ${data.motivo}`,
      tx: tx as any,
    })

    return pedidoAtualizado
  })
}

// ── Devolver pedido para ajuste (3,4,5 → 12) ─────────────────────────────────
// Área de Compras/CPL devolve com lista de pendências
export async function devolverPedido(id: string, data: { idUsuario: string; pendencias: string }) {
  const pedido = await prisma.pedido.findUnique({ where: { id } })
  if (!pedido) throw new Error('Pedido não encontrado')

  const statusPermitidos = [2, 3, 4]
  if (!statusPermitidos.includes(pedido.status)) {
    throw new Error('Pedido não pode ser devolvido neste status')
  }

  const pedidoAtualizado = await prisma.pedido.update({
    where: { id },
    data: { status: 24 },
  })

  await prisma.auditoriaPedido.create({
    data: {
      idPedido: id,
      acao: 'Devolvido para ajuste',
      valorAntes: String(pedido.status),
      valorDepois: data.pendencias,
      usuarioId: data.idUsuario,
      campo: 'pendencias',
    },
  })

  return pedidoAtualizado
}

// ── Upload de documento ───────────────────────────────────────────────────────
export async function uploadDocumento(data: {
  idPedido: string
  tipo: string
  nome: string
  tamanho: number
  mimeType: string
  dados: Buffer
  idUsuario: string
}) {
  return prisma.documentoPedido.create({
    data: {
      idPedido: data.idPedido,
      tipo: data.tipo,
      nome: data.nome,
      tamanho: data.tamanho,
      mimeType: data.mimeType,
      dados: data.dados,
      idUsuario: data.idUsuario,
    },
    select: {
      id: true,
      tipo: true,
      nome: true,
      tamanho: true,
      mimeType: true,
      idUsuario: true,
      criadoEm: true,
    },
  })
}

// ── Listar documentos do pedido ───────────────────────────────────────────────
export async function listarDocumentos(idPedido: string) {
  return prisma.documentoPedido.findMany({
    where: { idPedido },
    select: {
      id: true,
      tipo: true,
      nome: true,
      tamanho: true,
      mimeType: true,
      idUsuario: true,
      criadoEm: true,
      usuario: { select: { nome: true } },
    },
    orderBy: { criadoEm: 'asc' },
  })
}

// ── Download de documento ─────────────────────────────────────────────────────
export async function downloadDocumento(id: string) {
  return prisma.documentoPedido.findUnique({ where: { id } })
}

// ── Excluir documento ─────────────────────────────────────────────────────────
export async function excluirDocumento(id: string) {
  return prisma.documentoPedido.delete({ where: { id } })
}
