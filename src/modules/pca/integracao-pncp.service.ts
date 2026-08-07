// ============================================================
// SERVICE — Integração via API oficial do PNCP (por organização)
// backend/src/modules/pca/integracao-pncp.service.ts
//
// Configuração opt-in em Configurações > PCA: cada organização liga ou
// desliga o botão "Publicar via API" do Monitor PNCP (Tela 8). O botão
// "Gerar CSV" NUNCA depende disso e continua sempre habilitado — ver
// pncp.service.ts / marcarCsvGerado.
//
// IMPORTANTE: o dbliciti ainda NÃO tem credenciais/token oficiais do
// PNCP (mesma situação do tokenId do Benner). `publicarViaApiPncp` já
// está com toda a estrutura pronta (leitura da config, descriptografia
// do token, atualização de status) — falta só o `chamarApiPncp` real.
// Enquanto isso, a função lança um erro claro em vez de fingir sucesso.
// ============================================================

import prisma from '../../shared/prisma'
import { criptografar, descriptografar } from '../../shared/crypto'
import { PNCP_ENVIO_STATUS, PNCP_METODO_ENVIO } from './pca.constants'

interface SalvarIntegracaoPncpInput {
  ativo: boolean
  idContratante?: string
  token?: string // texto puro vindo do formulário — nunca persistido assim
}

// Nunca devolve o token — só sinaliza se já está configurado
function paraApresentacao(registro: any) {
  const { tokenCriptografado, ...resto } = registro
  return {
    ...resto,
    tokenConfigurado: !!tokenCriptografado,
  }
}

export async function buscarIntegracaoPncp(idOrganizacao: string) {
  const registro = await prisma.integracaoPncp.findUnique({ where: { idOrganizacao } })
  if (!registro) {
    // Sem registro ainda = toggle desligado por padrão (default seguro)
    return { idOrganizacao, ativo: false, idContratante: null, tokenConfigurado: false }
  }
  return paraApresentacao(registro)
}

export async function salvarIntegracaoPncp(idOrganizacao: string, input: SalvarIntegracaoPncpInput) {
  const org = await prisma.organizacao.findUnique({ where: { id: idOrganizacao } })
  if (!org) throw new Error('Organização não encontrada')

  const existente = await prisma.integracaoPncp.findUnique({ where: { idOrganizacao } })

  const dados = {
    ativo: input.ativo,
    idContratante: input.idContratante?.trim() || null,
    // Só recriptografa se algo novo foi digitado — campo vazio mantém o valor anterior
    ...(input.token ? { tokenCriptografado: criptografar(input.token) } : {}),
  }

  const registro = existente
    ? await prisma.integracaoPncp.update({ where: { idOrganizacao }, data: dados })
    : await prisma.integracaoPncp.create({ data: { idOrganizacao, ...dados } })

  return paraApresentacao(registro)
}

// ── Placeholder da chamada real à API do PNCP ─────────────────────────────
// Ponto único a substituir quando o token oficial existir. Hoje lança erro
// de propósito — nunca deve fingir que publicou algo no PNCP de verdade.
async function chamarApiPncp(_params: {
  idContratante: string
  token: string
  payload: Record<string, unknown>
}): Promise<{ protocolo: string; respostaPncp: Record<string, unknown> }> {
  throw new Error(
    'Integração via API do PNCP ainda não está disponível — aguardando token/credenciais oficiais do PNCP. Use o botão "Gerar CSV" enquanto isso.'
  )
}

// ── Publicar um envio da fila via API — botão "Publicar via API" ─────────
export async function publicarViaApiPncp(idEnvio: string, params: { idOrganizacao: string; idUsuario: string }) {
  const config = await prisma.integracaoPncp.findUnique({ where: { idOrganizacao: params.idOrganizacao } })
  if (!config || !config.ativo) {
    throw new Error('Integração via API do PNCP está desligada para esta organização. Ative em Configurações > PCA ou use o botão "Gerar CSV".')
  }
  if (!config.tokenCriptografado || !config.idContratante) {
    throw new Error('Integração via API do PNCP está ligada, mas as credenciais ainda não foram configuradas.')
  }

  const envio = await prisma.pncpEnvioPca.findFirst({ where: { id: idEnvio, idOrganizacao: params.idOrganizacao } })
  if (!envio) throw new Error('Envio não encontrado')
  if (![PNCP_ENVIO_STATUS.PENDENTE, PNCP_ENVIO_STATUS.EM_CONFERENCIA].includes(envio.status as any)) {
    throw new Error('Só é possível publicar via API envios pendentes ou em conferência')
  }

  try {
    const token = descriptografar(config.tokenCriptografado)
    const resultado = await chamarApiPncp({
      idContratante: config.idContratante,
      token,
      payload: (envio.payload as Record<string, unknown>) ?? {},
    })

    await prisma.integracaoPncp.update({
      where: { idOrganizacao: params.idOrganizacao },
      data: { ultimaPublicacaoEm: new Date(), ultimoResultado: 'SUCESSO', ultimaMensagemErro: null },
    })

    return prisma.pncpEnvioPca.update({
      where: { id: idEnvio },
      data: {
        status: PNCP_ENVIO_STATUS.ENVIADO,
        dataEnvio: new Date(),
        metodoEnvio: PNCP_METODO_ENVIO.API,
        respostaPncp: resultado.respostaPncp as any,
        idConferidoPor: params.idUsuario,
        dataConferencia: envio.dataConferencia ?? new Date(),
      },
    })
  } catch (err: any) {
    await prisma.integracaoPncp.update({
      where: { idOrganizacao: params.idOrganizacao },
      data: { ultimaPublicacaoEm: new Date(), ultimoResultado: 'ERRO', ultimaMensagemErro: err.message },
    })
    throw err
  }
}
