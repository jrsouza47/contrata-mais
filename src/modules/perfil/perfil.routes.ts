// ============================================================
// ROUTES — Perfil e Permissões
// src/modules/perfil/perfil.routes.ts
//
// CRUD restrito ao Administrador Contrata+ (mesmo padrão de
// licenciamento.routes.ts) — perfis e permissões são globais,
// não pertencem a nenhuma organização.
// ============================================================

import { FastifyInstance } from 'fastify'
import { exigirAdminDbliciti } from '../licenciamento/licenciamento.routes'
import {
  listarPerfis,
  listarMatriz,
  criarPerfil,
  atualizarPerfil,
  excluirPerfil,
  atualizarPermissoesPerfil,
} from './perfil.service'

export async function perfilRoutes(app: FastifyInstance) {

  // GET /admin/perfis — lista simples (nome, descricao, sistemico, ativo)
  app.get('/admin/perfis', async (request, reply) => {
    try { exigirAdminDbliciti(request) } catch (err: any) { return reply.status(err.status ?? 401).send({ erro: err.message }) }
    try {
      const perfis = await listarPerfis()
      return reply.send({ total: perfis.length, perfis })
    } catch (err: any) { return reply.status(500).send({ erro: err.message }) }
  })

  // GET /admin/perfis/matriz — perfis + catálogo de processos + concessões
  app.get('/admin/perfis/matriz', async (request, reply) => {
    try { exigirAdminDbliciti(request) } catch (err: any) { return reply.status(err.status ?? 401).send({ erro: err.message }) }
    try {
      const matriz = await listarMatriz()
      return reply.send(matriz)
    } catch (err: any) { return reply.status(500).send({ erro: err.message }) }
  })

  // POST /admin/perfis — criar novo perfil (nasce com a matriz zerada)
  app.post('/admin/perfis', async (request, reply) => {
    try { exigirAdminDbliciti(request) } catch (err: any) { return reply.status(err.status ?? 401).send({ erro: err.message }) }
    const body = request.body as { nome: string; descricao?: string }
    if (!body.nome) return reply.status(400).send({ erro: 'nome obrigatorio' })
    try {
      const perfil = await criarPerfil(body)
      return reply.status(201).send(perfil)
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // PATCH /admin/perfis/:id — editar nome/descricao/ativo (sistemico não muda)
  app.patch('/admin/perfis/:id', async (request, reply) => {
    try { exigirAdminDbliciti(request) } catch (err: any) { return reply.status(err.status ?? 401).send({ erro: err.message }) }
    const { id } = request.params as { id: string }
    const body = request.body as { nome?: string; descricao?: string; ativo?: boolean }
    try {
      const perfil = await atualizarPerfil(id, body)
      return reply.send(perfil)
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // DELETE /admin/perfis/:id — bloqueado se for sistêmico ou estiver em uso
  app.delete('/admin/perfis/:id', async (request, reply) => {
    try { exigirAdminDbliciti(request) } catch (err: any) { return reply.status(err.status ?? 401).send({ erro: err.message }) }
    const { id } = request.params as { id: string }
    try {
      const resultado = await excluirPerfil(id)
      return reply.send(resultado)
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // PUT /admin/perfis/:id/permissoes — atualização em lote da matriz de um perfil
  // Body: { grants: [{ modulo, processo, concedido }] }
  app.put('/admin/perfis/:id/permissoes', async (request, reply) => {
    try { exigirAdminDbliciti(request) } catch (err: any) { return reply.status(err.status ?? 401).send({ erro: err.message }) }
    const { id } = request.params as { id: string }
    const { grants } = request.body as { grants: { modulo: string; processo: string; concedido: boolean }[] }
    if (!Array.isArray(grants)) return reply.status(400).send({ erro: 'grants obrigatorio (array)' })
    try {
      const permissoes = await atualizarPermissoesPerfil(id, grants)
      return reply.send({ ok: true, permissoes })
    } catch (err: any) { return reply.status(400).send({ erro: err.message }) }
  })

  // GET /publico/perfis/matriz — SEM exigir Admin Contrata+: usada pelo
  // frontend logado normal (qualquer organização) pra montar o menu/telas
  // a partir da matriz real, no lugar do lib/permissoes.ts hardcoded.
  // Só leitura, não expõe nada sensível (é a mesma matriz que já rodava
  // hardcoded no bundle público do frontend antes desta migração).
  app.get('/publico/perfis/matriz', async (_request, reply) => {
    try {
      const matriz = await listarMatriz()
      return reply.send(matriz)
    } catch (err: any) { return reply.status(500).send({ erro: err.message }) }
  })
}
