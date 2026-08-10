// ============================================================
// ROUTES — Módulo de Licenciamento
// backend/src/modules/licenciamento/licenciamento.routes.ts
//
// GET  /me/modulos-ativos              — qualquer usuário logado, pro frontend montar o menu
// GET  /admin/licencas                 — ADMINISTRADOR_DBLICITI: lista todas as organizações + licenças
// GET  /admin/licencas/:idOrganizacao  — ADMINISTRADOR_DBLICITI: licenças de uma organização
// PUT  /admin/licencas/:idOrganizacao/:modulo — ADMINISTRADOR_DBLICITI: liga/desliga um módulo
// ============================================================

import { FastifyInstance } from 'fastify'
import { verificarToken, JwtPayload } from '../auth/auth.routes'
import { PERFIL_ADMIN_DBLICITI, LISTA_MODULOS, ModuloSistema } from './licenciamento.constants'
import {
  listarModulosAtivos,
  listarLicencasDaOrganizacao,
  listarTodasOrganizacoesComLicencas,
  definirLicenca,
} from './licenciamento.service'

// Extrai e valida o JWT do header Authorization. Lança erro com .status se algo estiver errado.
function autenticar(request: any): JwtPayload {
  const authHeader = request.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    const err: any = new Error('Token nao fornecido')
    err.status = 401
    throw err
  }
  try {
    return verificarToken(authHeader.slice(7))
  } catch {
    const err: any = new Error('Token invalido ou expirado')
    err.status = 401
    throw err
  }
}

function exigirAdminDbliciti(request: any): JwtPayload {
  const usuario = autenticar(request)
  if (usuario.perfil !== PERFIL_ADMIN_DBLICITI) {
    const err: any = new Error('Acesso restrito ao Administrador Contrata+')
    err.status = 403
    throw err
  }
  return usuario
}

export async function licenciamentoRoutes(app: FastifyInstance) {

  // GET /me/modulos-ativos — módulos licenciados da organização do usuário logado
  app.get('/me/modulos-ativos', async (request, reply) => {
    let usuario: JwtPayload
    try {
      usuario = autenticar(request)
    } catch (err: any) {
      return reply.status(err.status ?? 401).send({ erro: err.message })
    }

    try {
      const modulos = await listarModulosAtivos(usuario.idOrganizacao)
      return reply.send({ modulos })
    } catch (err: any) {
      return reply.status(500).send({ erro: err.message })
    }
  })

  // GET /admin/licencas — todas as organizações com o status de cada módulo
  app.get('/admin/licencas', async (request, reply) => {
    try {
      exigirAdminDbliciti(request)
    } catch (err: any) {
      return reply.status(err.status ?? 401).send({ erro: err.message })
    }

    try {
      const organizacoes = await listarTodasOrganizacoesComLicencas()
      return reply.send({ organizacoes })
    } catch (err: any) {
      return reply.status(500).send({ erro: err.message })
    }
  })

  // GET /admin/licencas/:idOrganizacao — licenças de uma organização específica
  app.get('/admin/licencas/:idOrganizacao', async (request, reply) => {
    try {
      exigirAdminDbliciti(request)
    } catch (err: any) {
      return reply.status(err.status ?? 401).send({ erro: err.message })
    }

    const { idOrganizacao } = request.params as { idOrganizacao: string }
    try {
      const licencas = await listarLicencasDaOrganizacao(idOrganizacao)
      return reply.send({ idOrganizacao, licencas })
    } catch (err: any) {
      return reply.status(500).send({ erro: err.message })
    }
  })

  // PUT /admin/licencas/:idOrganizacao/:modulo — liga/desliga um módulo pra uma organização
  // body: { ativo: boolean, dataInicio?: string, dataFim?: string, observacao?: string }
  app.put('/admin/licencas/:idOrganizacao/:modulo', async (request, reply) => {
    try {
      exigirAdminDbliciti(request)
    } catch (err: any) {
      return reply.status(err.status ?? 401).send({ erro: err.message })
    }

    const { idOrganizacao, modulo } = request.params as { idOrganizacao: string; modulo: string }

    if (!LISTA_MODULOS.includes(modulo as ModuloSistema)) {
      return reply.status(400).send({ erro: `Módulo inválido: ${modulo}`, modulosValidos: LISTA_MODULOS })
    }

    const { ativo, dataInicio, dataFim, observacao } = request.body as {
      ativo: boolean
      dataInicio?: string
      dataFim?: string
      observacao?: string
    }

    if (typeof ativo !== 'boolean') {
      return reply.status(400).send({ erro: '"ativo" é obrigatório e deve ser boolean' })
    }

    try {
      const registro = await definirLicenca({
        idOrganizacao,
        modulo: modulo as ModuloSistema,
        ativo,
        dataInicio: dataInicio ? new Date(dataInicio) : null,
        dataFim: dataFim ? new Date(dataFim) : null,
        observacao: observacao ?? null,
      })
      return reply.send({ registro })
    } catch (err: any) {
      return reply.status(400).send({ erro: err.message })
    }
  })
}
