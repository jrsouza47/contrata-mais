// ============================================================
// ROUTES — Módulo PCA: Monitor de envio PNCP (Tela 8)
// backend/src/modules/pca/pncp.routes.ts
// ============================================================

import { FastifyInstance } from 'fastify'
import {
  listarEnviosPncp,
  confirmarEnvioPncp,
  registrarErroEnvioPncp,
  reenviarEnvioPncp,
  marcarCsvGerado,
} from './pncp.service'
import {
  buscarIntegracaoPncp,
  salvarIntegracaoPncp,
  publicarViaApiPncp,
} from './integracao-pncp.service'

export async function pncpRoutes(app: FastifyInstance) {

  // GET /pca/pncp/integracao/:idOrganizacao — lê o toggle + config (Configurações > PCA)
  app.get('/pca/pncp/integracao/:idOrganizacao', async (request, reply) => {
    const { idOrganizacao } = request.params as { idOrganizacao: string }
    try {
      return reply.send(await buscarIntegracaoPncp(idOrganizacao))
    } catch (err: any) { return reply.status(500).send({ erro: err.message }) }
  })

  // PUT /pca/pncp/integracao/:idOrganizacao — liga/desliga + salva credenciais
  app.put('/pca/pncp/integracao/:idOrganizacao', async (request, reply) => {
    const { idOrganizacao } = request.params as { idOrganizacao: string }
    const body = request.body as { ativo: boolean; idContratante?: string; token?: string }
    try {
      return reply.send(await salvarIntegracaoPncp(idOrganizacao, body))
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // POST /pca/pncp/envios/:id/publicar-api — botão "Publicar via API" (Monitor PNCP)
  app.post('/pca/pncp/envios/:id/publicar-api', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao, idUsuario } = request.body as { idOrganizacao: string; idUsuario: string }
    try {
      return reply.send(await publicarViaApiPncp(id, { idOrganizacao, idUsuario }))
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // GET /pca/pncp/envios?idOrganizacao=&status=&tipoEnvio=&idPlano=
  app.get('/pca/pncp/envios', async (request, reply) => {
    const { idOrganizacao, status, tipoEnvio, idPlano } = request.query as {
      idOrganizacao: string; status?: string; tipoEnvio?: string; idPlano?: string
    }
    if (!idOrganizacao) return reply.status(400).send({ erro: 'idOrganizacao obrigatorio' })
    try {
      return reply.send(await listarEnviosPncp(idOrganizacao, { status, tipoEnvio, idPlano }))
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // POST /pca/pncp/envios/:id/confirmar — conferência manual + confirmação de envio
  app.post('/pca/pncp/envios/:id/confirmar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao, idUsuario } = request.body as { idOrganizacao: string; idUsuario: string }
    try {
      return reply.send(await confirmarEnvioPncp(id, { idOrganizacao, idUsuario }))
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // POST /pca/pncp/envios/:id/erro — registrar falha manualmente
  app.post('/pca/pncp/envios/:id/erro', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao, mensagemErro } = request.body as { idOrganizacao: string; mensagemErro: string }
    try {
      return reply.send(await registrarErroEnvioPncp(id, { idOrganizacao, mensagemErro }))
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // POST /pca/pncp/envios/:id/reenviar
  app.post('/pca/pncp/envios/:id/reenviar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao } = request.body as { idOrganizacao: string }
    try {
      return reply.send(await reenviarEnvioPncp(id, idOrganizacao))
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // POST /pca/pncp/envios/marcar-csv-gerado — marca 1 ou vários de uma vez
  app.post('/pca/pncp/envios/marcar-csv-gerado', async (request, reply) => {
    const { ids, idOrganizacao, idUsuario } = request.body as { ids: string[]; idOrganizacao: string; idUsuario: string }
    try {
      return reply.send(await marcarCsvGerado(ids, { idOrganizacao, idUsuario }))
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })
}
