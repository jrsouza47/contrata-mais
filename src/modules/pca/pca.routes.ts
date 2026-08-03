// ============================================================
// ROUTES — Módulo PCA: agregador
// backend/src/modules/pca/pca.routes.ts
// Registra planoRoutes, dfdRoutes, sugestaoIaRoutes e consolidacaoRoutes
// em server.ts com uma única chamada: app.register(pcaRoutes)
// ============================================================

import { FastifyInstance } from 'fastify'
import { planoRoutes } from './plano.routes'
import { dfdRoutes } from './dfd.routes'
import { sugestaoIaRoutes } from './sugestao-ia.routes'
import { consolidacaoRoutes } from './consolidacao.routes'
import { riscoRoutes } from './risco.routes'
import { aprovacaoRoutes } from './aprovacao.routes'
import { pncpRoutes } from './pncp.routes'
import { relatorioRoutes } from './relatorio.routes'
import { revisaoRoutes } from './revisao.routes'
import { saldoItemPcaRoutes } from './saldo-item-pca.routes'

export async function pcaRoutes(app: FastifyInstance) {
  await app.register(planoRoutes)
  await app.register(dfdRoutes)
  await app.register(sugestaoIaRoutes)
  await app.register(consolidacaoRoutes)
  await app.register(riscoRoutes)
  await app.register(aprovacaoRoutes)
  await app.register(pncpRoutes)
  await app.register(relatorioRoutes)
  await app.register(revisaoRoutes)
  await app.register(saldoItemPcaRoutes)
}
