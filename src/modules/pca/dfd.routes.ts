// ============================================================
// ROUTES — Módulo PCA: Demanda do Setor Requisitante (DFD)
// backend/src/modules/pca/dfd.routes.ts
// ============================================================

import { FastifyInstance } from 'fastify'
import {
  criarDfd, atualizarDfd, enviarDfd, cancelarDfd, excluirDfd,
  listarDfdsUnidade, obterDetalheDfd,
} from './dfd.service'

export async function dfdRoutes(app: FastifyInstance) {

  // GET /pca/dfd?idOrganizacao=&idPlano=&idCentroCusto=&idSolicitante=&status=&idUsuario=
  app.get('/pca/dfd', async (request, reply) => {
    const { idOrganizacao, idPlano, idCentroCusto, idSolicitante, status, idUsuario } = request.query as {
      idOrganizacao: string; idPlano?: string; idCentroCusto?: string; idSolicitante?: string; status?: string; idUsuario?: string
    }
    if (!idOrganizacao) return reply.status(400).send({ erro: 'idOrganizacao obrigatorio' })
    try {
      const demandas = await listarDfdsUnidade(idOrganizacao, {
        idPlano, idCentroCusto, idSolicitante,
        status: status ? Number(status) : undefined,
        idUsuario,
      })
      return reply.send({ total: demandas.length, demandas })
    } catch (err: any) { return reply.status(500).send({ erro: err.message }) }
  })

  // GET /pca/dfd/:id?idOrganizacao=
  app.get('/pca/dfd/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao } = request.query as { idOrganizacao: string }
    if (!idOrganizacao) return reply.status(400).send({ erro: 'idOrganizacao obrigatorio' })
    try {
      const dfd = await obterDetalheDfd(id, idOrganizacao)
      return reply.send(dfd)
    } catch (err: any) { return reply.status(404).send({ erro: err.message }) }
  })

  // POST /pca/dfd
  app.post('/pca/dfd', async (request, reply) => {
    const body = request.body as any
    if (!body.idOrganizacao || !body.idPlano || !body.idSolicitante) {
      return reply.status(400).send({ erro: 'idOrganizacao, idPlano e idSolicitante obrigatorios' })
    }
    try {
      const dfd = await criarDfd(body)
      return reply.status(201).send({ dfd })
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // PUT /pca/dfd/:id
  app.put('/pca/dfd/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as any
    if (!body.idOrganizacao) return reply.status(400).send({ erro: 'idOrganizacao obrigatorio' })
    try {
      const dfd = await atualizarDfd(id, body)
      return reply.send({ dfd })
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // POST /pca/dfd/:id/enviar
  app.post('/pca/dfd/:id/enviar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao, justificativaForaJanela } = request.body as { idOrganizacao: string; justificativaForaJanela?: string }
    if (!idOrganizacao) return reply.status(400).send({ erro: 'idOrganizacao obrigatorio' })
    try {
      const dfd = await enviarDfd(id, { idOrganizacao, justificativaForaJanela })
      return reply.send({ dfd, mensagem: 'Demanda enviada — sugestoes de IA geradas automaticamente' })
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // POST /pca/dfd/:id/cancelar
  app.post('/pca/dfd/:id/cancelar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao } = request.body as { idOrganizacao: string }
    if (!idOrganizacao) return reply.status(400).send({ erro: 'idOrganizacao obrigatorio' })
    try {
      const dfd = await cancelarDfd(id, idOrganizacao)
      return reply.send({ dfd, mensagem: 'Demanda cancelada' })
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // DELETE /pca/dfd/:id?idOrganizacao= — apenas rascunhos
  app.delete('/pca/dfd/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idOrganizacao } = request.query as { idOrganizacao: string }
    if (!idOrganizacao) return reply.status(400).send({ erro: 'idOrganizacao obrigatorio' })
    try {
      const resultado = await excluirDfd(id, idOrganizacao)
      return reply.send({ ...resultado, mensagem: 'Rascunho excluído' })
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })
}
