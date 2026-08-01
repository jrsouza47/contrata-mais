import prisma from '../../shared/prisma'
import { tipoItemInfo } from './catalogo.constants'

// Domínio: tipo 1=Bem, 2=Servico, 3=Obra, 4=TIC | status 1=Rascunho, 2=Ativo, 3=Reprovado, 4=Inativo

export async function listarItens(organizacaoId: string, opts?: { status?: number; todos?: boolean }) {
  const where: any = { idOrganizacao: organizacaoId }
  if (opts?.todos) {
    // sem filtro de status — usado pela tela de gestão do catálogo (M1)
  } else if (opts?.status !== undefined) {
    where.status = opts.status
  } else {
    where.status = 2 // 2 = Ativo — comportamento padrão (usado em seletores de item)
  }
  return prisma.itemCatalogo.findMany({
    where,
    include: { categoria: { select: { id: true, nome: true, codigo: true } } },
    orderBy: { criadoEm: 'desc' }
  })
}

export async function buscarItemPorId(id: string, organizacaoId: string) {
  return prisma.itemCatalogo.findFirst({
    where: { id, idOrganizacao: organizacaoId },
    include: {
      categoria: true,
      precos: { orderBy: { dataReferencia: 'desc' }, take: 1 }
    }
  })
}

export async function criarItem(dados: {
  idOrganizacao: string
  nome: string
  descricaoTecnica: string
  tipo: string
  unidadeMedida: string
  criadoPor: string
  idCategoria?: string
  codigoCatmatCatser?: string
  sigilo?: boolean
  usoUnico?: boolean
  idItemSucessor?: string
  atributosExtras?: Record<string, string>
}) {
  const total = await prisma.itemCatalogo.count({
    where: { idOrganizacao: dados.idOrganizacao }
  })

  const seq = String(total + 1).padStart(6, '0')
  const info = tipoItemInfo(dados.tipo)
  if (!info) throw new Error(`Tipo "${dados.tipo}" inválido. Use: Bem, Servico, Obra ou TIC`)
  const codigoInterno = `CAT-${info.prefixo}-${seq}`
  const tipoInt = info.int

  return prisma.itemCatalogo.create({
    data: {
      idOrganizacao: dados.idOrganizacao,
      nome: dados.nome,
      descricaoTecnica: dados.descricaoTecnica,
      tipo: tipoInt,
      unidadeMedida: dados.unidadeMedida,
      criadoPor: dados.criadoPor,
      idCategoria: dados.idCategoria || undefined,
      codigoCatmatCatser: dados.codigoCatmatCatser || undefined,
      sigilo: dados.sigilo ?? false,
      usoUnico: dados.usoUnico ?? false,
      idItemSucessor: dados.idItemSucessor || undefined,
      atributosExtras: dados.atributosExtras && Object.keys(dados.atributosExtras).length > 0 ? dados.atributosExtras : undefined,
      codigoInterno,
      status: 1 // Rascunho
    }
  })
}

export async function atualizarItem(
  id: string,
  organizacaoId: string,
  usuarioId: string,
  dados: {
    nome?: string
    descricaoTecnica?: string
    tipo?: string
    unidadeMedida?: string
    idCategoria?: string | null
    codigoCatmatCatser?: string | null
    sigilo?: boolean
    usoUnico?: boolean
    idItemSucessor?: string | null
    atributosExtras?: Record<string, string> | null
  }
) {
  const existente = await prisma.itemCatalogo.findFirst({ where: { id, idOrganizacao: organizacaoId } })
  if (!existente) throw new Error('Item não encontrado')

  const data: any = {}
  if (dados.nome !== undefined) data.nome = dados.nome
  if (dados.descricaoTecnica !== undefined) data.descricaoTecnica = dados.descricaoTecnica
  if (dados.tipo !== undefined) {
    const info = tipoItemInfo(dados.tipo)
    if (!info) throw new Error(`Tipo "${dados.tipo}" inválido. Use: Bem, Servico, Obra ou TIC`)
    data.tipo = info.int
  }
  if (dados.unidadeMedida !== undefined) data.unidadeMedida = dados.unidadeMedida
  if (dados.idCategoria !== undefined) data.idCategoria = dados.idCategoria || null
  if (dados.codigoCatmatCatser !== undefined) data.codigoCatmatCatser = dados.codigoCatmatCatser || null
  if (dados.sigilo !== undefined) data.sigilo = dados.sigilo
  if (dados.usoUnico !== undefined) data.usoUnico = dados.usoUnico
  if (dados.idItemSucessor !== undefined) data.idItemSucessor = dados.idItemSucessor || null
  if (dados.atributosExtras !== undefined) {
    data.atributosExtras = dados.atributosExtras && Object.keys(dados.atributosExtras).length > 0 ? dados.atributosExtras : null
  }

  const item = await prisma.itemCatalogo.update({ where: { id }, data })

  await prisma.auditoriaItem.create({
    data: {
      idItem: id,
      acao: 'editado',
      campo: Object.keys(data).join(','),
      usuarioId
    }
  })

  return item
}

export async function listarCategorias(organizacaoId: string) {
  return prisma.categoria.findMany({
    where: { idOrganizacao: organizacaoId, ativo: true },
    select: { id: true, nome: true, codigo: true, nivel: true, idPai: true },
    orderBy: [{ nivel: 'asc' }, { nome: 'asc' }]
  })
}

export async function atualizarStatusItem(
  id: string,
  organizacaoId: string,
  status: string,
  usuarioId: string,
  justificativa?: string
) {
  const statusMap: Record<string, number> = {
    'Rascunho': 1, 'Ativo': 2, 'Reprovado': 3, 'Inativo': 4
  }
  const statusInt = statusMap[status] ?? 1

  const item = await prisma.itemCatalogo.update({
    where: { id },
    data: { status: statusInt }
  })

  await prisma.auditoriaItem.create({
    data: {
      idItem: id,
      acao: status.toLowerCase().replace(' ', '_'),
      campo: 'status',
      valorDepois: String(statusInt),
      usuarioId
    }
  })

  return item
}

export async function registrarPreco(dados: {
  idItem: string
  valor: number
  fonte: string
  dataReferencia: string
  responsavelId: string
}) {
  return prisma.precoReferencia.create({
    data: {
      ...dados,
      dataReferencia: new Date(dados.dataReferencia)
    }
  })
}