// ============================================================
// SERVICE — Integração via API oficial do PNCP (por organização)
// backend/src/modules/pca/integracao-pncp.service.ts
//
// Configuração opt-in em Configurações > PCA: cada organização liga ou
// desliga o botão "Publicar via API" do Monitor PNCP (Tela 8). O botão
// "Gerar CSV" NUNCA depende disso e continua sempre habilitado — ver
// pncp.service.ts / marcarCsvGerado.
//
// COMO O PNCP AUTENTICA (Manual de Integração PNCP): não existe token
// fixo. A Terracap precisa se credenciar junto ao Ministério da Gestão
// e recebe LOGIN + SENHA. A cada sessão, o dbliciti autentica em
// POST {PNCP_BASE_URL}/v1/usuarios/login com esse login/senha e recebe
// um JWT (Bearer) de curta duração no header Authorization da resposta.
// Esse JWT é cacheado aqui (tokenJwtCache/tokenJwtExpiraEm) até expirar,
// pra não logar de novo a cada publicação.
//
// IMPORTANTE: o dbliciti ainda NÃO tem login/senha oficiais do PNCP
// (mesma situação do tokenId do Benner). Toda a estrutura já está
// pronta — falta só `chamarLoginPncp` e `chamarPublicarPncp` de verdade.
// Enquanto isso, essas funções lançam erro claro em vez de fingir sucesso.
// ============================================================

import prisma from '../../shared/prisma'
import { criptografar, descriptografar } from '../../shared/crypto'
import { PNCP_ENVIO_STATUS, PNCP_METODO_ENVIO } from './pca.constants'

interface SalvarIntegracaoPncpInput {
  ativo: boolean
  loginPncp?: string
  senha?: string // texto puro vindo do formulário — nunca persistido assim
}

// Nunca devolve a senha nem o JWT cacheado — só sinaliza se já está configurada
function paraApresentacao(registro: any) {
  const { senhaCriptografada, tokenJwtCache, ...resto } = registro
  return {
    ...resto,
    senhaConfigurada: !!senhaCriptografada,
  }
}

export async function buscarIntegracaoPncp(idOrganizacao: string) {
  const registro = await prisma.integracaoPncp.findUnique({ where: { idOrganizacao } })
  if (!registro) {
    // Sem registro ainda = toggle desligado por padrão (default seguro)
    return { idOrganizacao, ativo: false, loginPncp: null, senhaConfigurada: false }
  }
  return paraApresentacao(registro)
}

export async function salvarIntegracaoPncp(idOrganizacao: string, input: SalvarIntegracaoPncpInput) {
  const org = await prisma.organizacao.findUnique({ where: { id: idOrganizacao } })
  if (!org) throw new Error('Organização não encontrada')

  const existente = await prisma.integracaoPncp.findUnique({ where: { idOrganizacao } })

  const dados = {
    ativo: input.ativo,
    loginPncp: input.loginPncp?.trim() || null,
    // Só recriptografa se algo novo foi digitado — campo vazio mantém o valor anterior
    ...(input.senha ? { senhaCriptografada: criptografar(input.senha) } : {}),
    // Login/senha novos invalidam qualquer JWT cacheado da credencial anterior
    ...(input.senha || input.loginPncp !== undefined ? { tokenJwtCache: null, tokenJwtExpiraEm: null } : {}),
  }

  const registro = existente
    ? await prisma.integracaoPncp.update({ where: { idOrganizacao }, data: dados })
    : await prisma.integracaoPncp.create({ data: { idOrganizacao, ...dados } })

  return paraApresentacao(registro)
}

// ── Placeholders das chamadas reais ao PNCP ────────────────────────────────
// Pontos únicos a substituir quando login/senha oficiais existirem. Hoje
// lançam erro de propósito — nunca devem fingir que autenticaram ou
// publicaram algo no PNCP de verdade.

async function chamarLoginPncp(_params: { login: string; senha: string }): Promise<{ jwt: string; expiraEm: Date }> {
  throw new Error(
    'Login na API do PNCP ainda não está disponível — aguardando login/senha oficiais do credenciamento junto ao Ministério da Gestão. Use o botão "Gerar CSV" enquanto isso.'
  )
}

async function chamarPublicarPncp(_params: {
  jwt: string
  cnpjOrgao: string
  payload: Record<string, unknown>
}): Promise<{ protocolo: string; respostaPncp: Record<string, unknown> }> {
  throw new Error('Publicação via API do PNCP ainda não está disponível.')
}

// ── Obtém um JWT válido, reautenticando só se o cache expirou ────────────
async function obterTokenJwt(config: NonNullable<Awaited<ReturnType<typeof prisma.integracaoPncp.findUnique>>>) {
  const MARGEM_SEGURANCA_MS = 60_000 // renova 1 min antes de expirar, por segurança
  if (config.tokenJwtCache && config.tokenJwtExpiraEm && config.tokenJwtExpiraEm.getTime() - MARGEM_SEGURANCA_MS > Date.now()) {
    return config.tokenJwtCache
  }
  if (!config.loginPncp || !config.senhaCriptografada) {
    throw new Error('Login e senha do PNCP não configurados.')
  }
  const senha = descriptografar(config.senhaCriptografada)
  const { jwt, expiraEm } = await chamarLoginPncp({ login: config.loginPncp, senha })

  await prisma.integracaoPncp.update({
    where: { idOrganizacao: config.idOrganizacao },
    data: { tokenJwtCache: jwt, tokenJwtExpiraEm: expiraEm },
  })

  return jwt
}

// ── Publicar um envio da fila via API — botão "Publicar via API" ─────────
export async function publicarViaApiPncp(idEnvio: string, params: { idOrganizacao: string; idUsuario: string }) {
  const config = await prisma.integracaoPncp.findUnique({ where: { idOrganizacao: params.idOrganizacao } })
  if (!config || !config.ativo) {
    throw new Error('Integração via API do PNCP está desligada para esta organização. Ative em Configurações > PCA ou use o botão "Gerar CSV".')
  }
  if (!config.loginPncp || !config.senhaCriptografada) {
    throw new Error('Integração via API do PNCP está ligada, mas login/senha ainda não foram configurados.')
  }

  const envio = await prisma.pncpEnvioPca.findFirst({ where: { id: idEnvio, idOrganizacao: params.idOrganizacao } })
  if (!envio) throw new Error('Envio não encontrado')
  if (![PNCP_ENVIO_STATUS.PENDENTE, PNCP_ENVIO_STATUS.EM_CONFERENCIA].includes(envio.status as any)) {
    throw new Error('Só é possível publicar via API envios pendentes ou em conferência')
  }

  const org = await prisma.organizacao.findUnique({ where: { id: params.idOrganizacao } })
  if (!org) throw new Error('Organização não encontrada')

  try {
    const jwt = await obterTokenJwt(config)
    const resultado = await chamarPublicarPncp({
      jwt,
      cnpjOrgao: org.cnpj,
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
