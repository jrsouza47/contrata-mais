// ============================================================
// SERVICE — Módulo PCA: Monitor de envio PNCP (Tela 8)
// backend/src/modules/pca/pncp.service.ts
//
// Item 9.9 da especificação: "O envio ao PNCP é assíncrono, via fila,
// com etapa de conferência manual antes do disparo; falha no envio
// não bloqueia a publicação interna nem a divulgação no sítio da
// Terracap."
//
// IMPORTANTE: o dbliciti ainda NÃO tem integração implementada com a
// API real do PNCP em lugar nenhum do sistema. Este módulo gerencia a
// FILA (criação, conferência, confirmação manual, reenvio) — o envio
// em si, por ora, é feito fora do sistema (ex.: portal do PNCP
// diretamente) e confirmado manualmente aqui. Quando a integração
// real existir, `confirmarEnvioPncp` é o ponto a substituir pela
// chamada HTTP de fato.
// ============================================================

import prisma from '../../shared/prisma'
import { PNCP_ENVIO_STATUS, PNCP_TIPO_ENVIO, PNCP_METODO_ENVIO } from './pca.constants'

type TipoEnvio = typeof PNCP_TIPO_ENVIO[keyof typeof PNCP_TIPO_ENVIO]

// ── Parametrização por empresa (item 10.1 da norma) ──────────────────────
export async function lerParametrizacaoPncp(idOrganizacao: string) {
  const org = await prisma.organizacao.findUnique({
    where: { id: idOrganizacao },
    select: { configuracoes: true },
  })
  const cfg = (org?.configuracoes as Record<string, unknown>) ?? {}
  return {
    habilitado:   cfg.pcaPncpHabilitado === true,
    obrigatorio:  cfg.pcaPncpObrigatorio === true,
  }
}

// ── Enfileirar um envio — chamado na aprovação do Item PCA/Plano ─────────
// Só cria o registro se a empresa tiver habilitado o envio ao PNCP para o
// PCA (pcaPncpHabilitado). Empresas sem essa parametrização não geram fila.
export async function enfileirarEnvioPncp(params: {
  idOrganizacao: string
  idItemPca?: string
  idPlano?: string
  tipoEnvio: TipoEnvio
  payload: Record<string, unknown>
}) {
  const { habilitado } = await lerParametrizacaoPncp(params.idOrganizacao)
  if (!habilitado) return null

  return prisma.pncpEnvioPca.create({
    data: {
      idOrganizacao: params.idOrganizacao,
      idItemPca: params.idItemPca,
      idPlano: params.idPlano,
      tipoEnvio: params.tipoEnvio,
      status: PNCP_ENVIO_STATUS.PENDENTE,
      payload: params.payload as any,
    },
  })
}

// ── Listagem para o monitor (Tela 8) ──────────────────────────────────────
export async function listarEnviosPncp(
  idOrganizacao: string,
  filtros?: { status?: string; tipoEnvio?: string; idPlano?: string }
) {
  const where: any = { idOrganizacao }
  if (filtros?.status) where.status = filtros.status
  if (filtros?.tipoEnvio) where.tipoEnvio = filtros.tipoEnvio
  if (filtros?.idPlano) where.idPlano = filtros.idPlano

  const envios = await prisma.pncpEnvioPca.findMany({
    where,
    include: {
      itemPca: {
        select: {
          id: true, numero: true, descricaoObjeto: true, tipoObjeto: true,
          quantidadeTotal: true, valorTotal: true, unidadeFornecimento: true, dataDesejada: true,
          itemCatalogo: { select: { codigoInterno: true, nome: true } },
          dfdsOrigem: {
            select: {
              codigoSistemaCorporativo: true,
              centroCusto: { select: { id: true, codigo: true, nome: true } },
            },
          },
        },
      },
      plano: { select: { id: true, ano: true, versao: true } },
      conferidoPor: { select: { id: true, nome: true } },
      csvGeradoPorUsuario: { select: { id: true, nome: true } },
    },
    orderBy: { criadoEm: 'desc' },
  })

  const resumo = {
    enviados: envios.filter((e) => e.status === PNCP_ENVIO_STATUS.ENVIADO).length,
    pendentes: envios.filter(
      (e) => e.status === PNCP_ENVIO_STATUS.PENDENTE || e.status === PNCP_ENVIO_STATUS.EM_CONFERENCIA
    ).length,
    comErro: envios.filter((e) => e.status === PNCP_ENVIO_STATUS.ERRO).length,
  }

  return { total: envios.length, resumo, envios }
}

// ── Conferência manual + confirmação de envio ────────────────────────────
// Registra que uma pessoa conferiu o item e confirma que o envio ao PNCP
// foi realizado (hoje, fora do sistema — ver nota no topo do arquivo).
export async function confirmarEnvioPncp(id: string, params: { idOrganizacao: string; idUsuario: string }) {
  const envio = await prisma.pncpEnvioPca.findFirst({ where: { id, idOrganizacao: params.idOrganizacao } })
  if (!envio) throw new Error('Envio não encontrado')
  if (![PNCP_ENVIO_STATUS.PENDENTE, PNCP_ENVIO_STATUS.EM_CONFERENCIA].includes(envio.status as any)) {
    throw new Error('Só é possível confirmar envios pendentes ou em conferência')
  }

  return prisma.pncpEnvioPca.update({
    where: { id },
    data: {
      status: PNCP_ENVIO_STATUS.ENVIADO,
      idConferidoPor: params.idUsuario,
      dataConferencia: envio.dataConferencia ?? new Date(),
      dataEnvio: new Date(),
    },
  })
}

// ── Registrar falha manualmente ───────────────────────────────────────────
export async function registrarErroEnvioPncp(id: string, params: { idOrganizacao: string; mensagemErro: string }) {
  const envio = await prisma.pncpEnvioPca.findFirst({ where: { id, idOrganizacao: params.idOrganizacao } })
  if (!envio) throw new Error('Envio não encontrado')
  if (!params.mensagemErro?.trim()) throw new Error('Informe a mensagem de erro')

  return prisma.pncpEnvioPca.update({
    where: { id },
    data: { status: PNCP_ENVIO_STATUS.ERRO, mensagemErro: params.mensagemErro.trim() },
  })
}

// ── Marcar CSV de referência como gerado (1 ou vários de uma vez) ────────
// O botão "Gerar CSV" no Monitor PNCP continua sempre habilitado,
// independente do toggle de integração via API estar ligado ou não.
export async function marcarCsvGerado(ids: string[], params: { idOrganizacao: string; idUsuario: string }) {
  if (ids.length === 0) return { atualizados: 0 }
  const resultado = await prisma.pncpEnvioPca.updateMany({
    where: { id: { in: ids }, idOrganizacao: params.idOrganizacao },
    data: { csvGeradoEm: new Date(), csvGeradoPor: params.idUsuario, metodoEnvio: PNCP_METODO_ENVIO.CSV },
  })
  return { atualizados: resultado.count }
}
export async function reenviarEnvioPncp(id: string, idOrganizacao: string) {
  const envio = await prisma.pncpEnvioPca.findFirst({ where: { id, idOrganizacao } })
  if (!envio) throw new Error('Envio não encontrado')
  if (envio.status !== PNCP_ENVIO_STATUS.ERRO) {
    throw new Error('Só é possível reenviar envios com erro')
  }

  return prisma.pncpEnvioPca.update({
    where: { id },
    data: { status: PNCP_ENVIO_STATUS.PENDENTE, mensagemErro: null, tentativas: { increment: 1 } },
  })
}
