// ============================================================
// ROUTES — Módulo PCA: Saldo do Item PCA
// backend/src/modules/pca/saldo-item-pca.routes.ts
// ============================================================

import { FastifyInstance } from 'fastify'
import { calcularSaldo, listarMovimentos } from './saldo-item-pca.service'

export async function saldoItemPcaRoutes(app: FastifyInstance) {

  // GET /pca/itens/:id/saldo — total / reservado / utilizado / disponível
  app.get('/pca/itens/:id/saldo', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const saldo = await calcularSaldo(id)
      return reply.send(saldo)
    } catch (err: any) { return reply.status(404).send({ erro: err.message }) }
  })

  // GET /pca/itens/:id/movimentos — histórico (quem, setor, quando, pedido)
  app.get('/pca/itens/:id/movimentos', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      const movimentos = await listarMovimentos(id)
      return reply.send({ total: movimentos.length, movimentos })
    } catch (err: any) { return reply.status(500).send({ erro: err.message }) }
  })
}
