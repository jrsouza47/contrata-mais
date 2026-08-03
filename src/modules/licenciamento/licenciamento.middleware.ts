// ============================================================
// MIDDLEWARE — Licenciamento de módulos
// backend/src/modules/licenciamento/licenciamento.middleware.ts
//
// Bloqueia, no backend, o acesso a rotas de módulos que a organização
// não tem licenciados — independente do que o menu do frontend mostra.
// Isso é o que impede alguém de digitar a URL de um módulo não
// contratado e acessar mesmo assim.
// ============================================================

import { FastifyRequest, FastifyReply } from 'fastify'
import { moduloEstaAtivo } from './licenciamento.service'
import { ModuloSistema } from './licenciamento.constants'

// idOrganizacao hoje é passado de formas diferentes conforme a rota:
// query (?idOrganizacao=), body (POST/PATCH) ou params (/rota/:idOrganizacao).
// Este helper procura nos três lugares, nessa ordem.
function extrairIdOrganizacao(request: FastifyRequest): string | null {
  const query = request.query as Record<string, unknown> | undefined
  if (query?.idOrganizacao && typeof query.idOrganizacao === 'string') {
    return query.idOrganizacao
  }

  const body = request.body as Record<string, unknown> | undefined
  if (body?.idOrganizacao && typeof body.idOrganizacao === 'string') {
    return body.idOrganizacao
  }

  const params = request.params as Record<string, unknown> | undefined
  if (params?.idOrganizacao && typeof params.idOrganizacao === 'string') {
    return params.idOrganizacao
  }

  return null
}

// Uso: app.addHook('preHandler', exigirModulo('PCA')) — dentro do bloco de
// registro do módulo (ver server.ts). Aplica-se a todas as rotas registradas
// naquele bloco.
export function exigirModulo(modulo: ModuloSistema) {
  return async function preHandlerExigirModulo(request: FastifyRequest, reply: FastifyReply) {
    const idOrganizacao = extrairIdOrganizacao(request)

    if (!idOrganizacao) {
      // Sem idOrganizacao não dá pra saber se o módulo está licenciado.
      // Deixa a própria rota lidar com a ausência do parâmetro (ela já
      // costuma validar isso e responder 400).
      return
    }

    const ativo = await moduloEstaAtivo(idOrganizacao, modulo)
    if (!ativo) {
      return reply.status(403).send({
        erro: 'Módulo não licenciado para esta organização.',
        modulo,
      })
    }
  }
}
