// ============================================================
// SERVICE — Módulo PCA: Demanda do Setor Requisitante (DFD)
// backend/src/modules/pca/dfd.service.ts
// ============================================================

import prisma from '../../shared/prisma'
import { DFD_STATUS, CAMPOS_MINIMOS_ENVIO_DFD, dentroJanelaEnvioDfd } from './pca.constants'
import { gerarSugestoesParaDfd } from './sugestao-ia.service'
import { obterEscopoCentroCusto } from './escopo-area.service'

interface CriarDfdInput {
  idOrganizacao: string
  idPlano: string
  idSolicitante: string
  idCentroCusto?: string
  tipoObjeto?: string
  codigoSistemaCorporativo?: string
  idItemCatalogo?: string
  unidadeFornecimento?: string
  quantidade?: number
  descricaoObjeto?: string
  justificativa?: string
  valorEstimado?: number
  prioridade?: number
  dataDesejada?: string
  idItemVinculado?: string
}

interface AtualizarDfdInput extends Partial<CriarDfdInput> {
  idOrganizacao: string
}

interface EnviarDfdInput {
  idOrganizacao: string
  justificativaForaJanela?: string
}

// ── Helpers ──────────────────────────────────────────────────
async function gerarNumeroDfd(idOrganizacao: string, ano: number): Promise<string> {
  // Baseado no MAIOR número já usado, não na contagem de registros — se
  // uma demanda no meio da sequência for excluída, a contagem cai mas o
  // maior número usado continua o mesmo, e usar count()+1 gera colisão
  // com um número que já existe (unique constraint em idOrganizacao+numero).
  const ultimo = await prisma.dfd.findFirst({
    where: { idOrganizacao, numero: { startsWith: `DFD-${ano}-` } },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  })
  const ultimoSequencial = ultimo ? parseInt(ultimo.numero.split('-').pop() ?? '0', 10) || 0 : 0
  const sequencial = String(ultimoSequencial + 1).padStart(5, '0')
  return `DFD-${ano}-${sequencial}`
}

async function resolverDeParaCatalogo(idOrganizacao: string, codigoSistemaCorporativo?: string): Promise<string | undefined> {
  if (!codigoSistemaCorporativo) return undefined
  const deDara = await prisma.deParaItemSistemaCorporativo.findFirst({
    where: { idOrganizacao, codigoSistemaCorporativo, ativo: true },
    select: { idItemCatalogo: true },
  })
  return deDara?.idItemCatalogo
}

function validarPlanoAbertoParaElaboracao(plano: { status: number }) {
  // Demandas só podem ser lançadas/editadas enquanto o plano está em elaboração
  if (plano.status !== 1) {
    throw new Error('O plano de contratações deste exercício não está em elaboração — demanda não pode ser criada ou editada')
  }
}

// ── Criar demanda (RASCUNHO) ────────────────────────────────
export async function criarDfd(input: CriarDfdInput) {
  const plano = await prisma.planoContratacaoAnual.findFirst({
    where: { id: input.idPlano, idOrganizacao: input.idOrganizacao },
  })
  if (!plano) throw new Error('Plano de Contratações Anual não encontrado para esta organização')
  validarPlanoAbertoParaElaboracao(plano)

  // Se o formulário já enviou o item escolhido diretamente (Item do catálogo M1),
  // usa esse valor. Só cai para o de-para por código corporativo quando não vier.
  const idItemCatalogo = input.idItemCatalogo
    ?? await resolverDeParaCatalogo(input.idOrganizacao, input.codigoSistemaCorporativo)
  const numero = await gerarNumeroDfd(input.idOrganizacao, plano.ano)

  const dfd = await prisma.dfd.create({
    data: {
      idOrganizacao: input.idOrganizacao,
      idPlano: input.idPlano,
      idSolicitante: input.idSolicitante,
      idCentroCusto: input.idCentroCusto,
      numero,
      tipoObjeto: input.tipoObjeto ?? '',
      codigoSistemaCorporativo: input.codigoSistemaCorporativo ?? '',
      idItemCatalogo,
      unidadeFornecimento: input.unidadeFornecimento ?? '',
      quantidade: input.quantidade ?? 0,
      descricaoObjeto: input.descricaoObjeto ?? '',
      justificativa: input.justificativa ?? '',
      valorEstimado: input.valorEstimado ?? 0,
      prioridade: input.prioridade ?? 2,
      dataDesejada: input.dataDesejada ? new Date(input.dataDesejada) : new Date(),
      idItemVinculado: input.idItemVinculado,
      status: DFD_STATUS.RASCUNHO,
    },
  })
  return dfd
}

// ── Atualizar demanda (RASCUNHO ou DEVOLVIDO) ───────────
export async function atualizarDfd(idDfd: string, input: AtualizarDfdInput) {
  const dfd = await prisma.dfd.findFirst({ where: { id: idDfd, idOrganizacao: input.idOrganizacao } })
  if (!dfd) throw new Error('Demanda não encontrada')
  if (dfd.status !== DFD_STATUS.RASCUNHO && dfd.status !== DFD_STATUS.DEVOLVIDO) {
    throw new Error('Demanda já enviada — campos bloqueados para o Setor Requisitante')
  }

  const idItemCatalogo = input.idItemCatalogo
    ?? (input.codigoSistemaCorporativo ? await resolverDeParaCatalogo(input.idOrganizacao, input.codigoSistemaCorporativo) : undefined)

  const atualizada = await prisma.dfd.update({
    where: { id: idDfd },
    data: {
      idCentroCusto: input.idCentroCusto ?? dfd.idCentroCusto,
      tipoObjeto: input.tipoObjeto ?? dfd.tipoObjeto,
      codigoSistemaCorporativo: input.codigoSistemaCorporativo ?? dfd.codigoSistemaCorporativo,
      idItemCatalogo: idItemCatalogo ?? dfd.idItemCatalogo,
      unidadeFornecimento: input.unidadeFornecimento ?? dfd.unidadeFornecimento,
      quantidade: input.quantidade ?? dfd.quantidade,
      descricaoObjeto: input.descricaoObjeto ?? dfd.descricaoObjeto,
      justificativa: input.justificativa ?? dfd.justificativa,
      valorEstimado: input.valorEstimado ?? dfd.valorEstimado,
      prioridade: input.prioridade ?? dfd.prioridade,
      dataDesejada: input.dataDesejada ? new Date(input.dataDesejada) : dfd.dataDesejada,
      idItemVinculado: input.idItemVinculado ?? dfd.idItemVinculado,
    },
  })
  return atualizada
}

// ── Enviar demanda (RASCUNHO ou DEVOLVIDO → ENVIADO) ─────────
export async function enviarDfd(idDfd: string, input: EnviarDfdInput) {
  const dfd = await prisma.dfd.findFirst({ where: { id: idDfd, idOrganizacao: input.idOrganizacao } })
  if (!dfd) throw new Error('Demanda não encontrada')
  if (dfd.status !== DFD_STATUS.RASCUNHO && dfd.status !== DFD_STATUS.DEVOLVIDO) throw new Error('Demanda já foi enviada')

  // Regra: envio só é permitido com todos os campos mínimos preenchidos (item 9.1)
  const faltando = CAMPOS_MINIMOS_ENVIO_DFD.filter((campo) => {
    const valor = (dfd as any)[campo]
    return valor === null || valor === undefined || valor === '' || (typeof valor === 'number' && valor <= 0 && campo !== 'prioridade')
  })
  if (faltando.length > 0) {
    throw new Error(`Campos obrigatórios não preenchidos: ${faltando.join(', ')}`)
  }

  const foraDaJanela = !dentroJanelaEnvioDfd()
  if (foraDaJanela && !input.justificativaForaJanela) {
    throw new Error('Envio fora da janela de 1º de janeiro a 10 de fevereiro exige justificativa (item 9.1)')
  }

  const atualizada = await prisma.dfd.update({
    where: { id: idDfd },
    data: {
      status: DFD_STATUS.ENVIADO,
      dataEnvio: new Date(),
      foraDaJanela,
      justificativaForaJanela: foraDaJanela ? input.justificativaForaJanela : null,
      motivoDevolucao: null,
    },
  })

  // Sugestão de IA disparada automaticamente no envio (item 9.2)
  await gerarSugestoesParaDfd(atualizada.id)

  return atualizada
}

// ── Cancelar demanda (ENVIADO → CANCELADO) ──────────────────
export async function cancelarDfd(idDfd: string, idOrganizacao: string) {
  const dfd = await prisma.dfd.findFirst({ where: { id: idDfd, idOrganizacao } })
  if (!dfd) throw new Error('Demanda não encontrada')
  if (dfd.status !== DFD_STATUS.ENVIADO) throw new Error('Somente demandas enviadas podem ser canceladas')

  return prisma.dfd.update({ where: { id: idDfd }, data: { status: DFD_STATUS.CANCELADO } })
}

// Exclusão definitiva — permitida apenas para rascunhos (nunca enviados,
// portanto sem sugestões de IA, item consolidado ou histórico oficial
// que justifique manter um registro de auditoria).
export async function excluirDfd(idDfd: string, idOrganizacao: string) {
  const dfd = await prisma.dfd.findFirst({ where: { id: idDfd, idOrganizacao } })
  if (!dfd) throw new Error('Demanda não encontrada')
  if (dfd.status !== DFD_STATUS.RASCUNHO) throw new Error('Somente demandas em rascunho podem ser excluídas — demandas enviadas devem ser canceladas')

  await prisma.dfd.delete({ where: { id: idDfd } })
  return { excluido: true }
}

// ── Listagens ────────────────────────────────────────────────
export async function listarDfdsUnidade(idOrganizacao: string, filtros: {
  idPlano?: string
  idCentroCusto?: string
  idSolicitante?: string
  status?: number
  idUsuario?: string // usuário logado — usado só pra calcular o escopo de área (Gestor/Solicitante/Operador)
}) {
  // Se a busca já é por um solicitante específico (fluxo "minhas demandas"
  // do Solicitante/Operador), não aplica o filtro de área por cima — assim
  // essas pessoas continuam vendo o que elas mesmas criaram mesmo que a
  // área ainda não esteja configurada pra elas. O filtro de área só entra
  // quando não há um solicitante específico sendo pedido (caso do Gestor,
  // que precisa ver a área inteira, não só o que ele mesmo criou).
  const escopo = filtros.idSolicitante ? null : await obterEscopoCentroCusto(filtros.idUsuario)

  // Combina o filtro manual de centro de custo (se houver) com o escopo de
  // área do usuário — nunca deixa o filtro manual escapar do escopo.
  let idCentroCustoCondicao: any = filtros.idCentroCusto
  if (escopo !== null) {
    if (filtros.idCentroCusto) {
      idCentroCustoCondicao = escopo.includes(filtros.idCentroCusto) ? filtros.idCentroCusto : '__fora_do_escopo__'
    } else {
      idCentroCustoCondicao = { in: escopo }
    }
  }

  return prisma.dfd.findMany({
    where: {
      idOrganizacao,
      idPlano: filtros.idPlano,
      idCentroCusto: idCentroCustoCondicao,
      idSolicitante: filtros.idSolicitante,
      status: filtros.status,
    },
    include: { sugestoesIa: true, itemVinculado: { select: { id: true, numero: true, descricaoObjeto: true } }, centroCusto: true },
    orderBy: { criadoEm: 'desc' },
  })
}

export async function obterDetalheDfd(idDfd: string, idOrganizacao: string) {
  const dfd = await prisma.dfd.findFirst({
    where: { id: idDfd, idOrganizacao },
    include: {
      sugestoesIa: { orderBy: { criadoEm: 'desc' } },
      itemVinculado: { select: { id: true, numero: true, descricaoObjeto: true } },
      dependentes: { select: { id: true, numero: true, descricaoObjeto: true } },
      itemPca: { select: { id: true, numero: true, status: true } },
    },
  })
  if (!dfd) throw new Error('Demanda não encontrada')
  return dfd
}
