import { FastifyInstance } from 'fastify'
import prisma from '../../shared/prisma'

export async function unidadeMedidaRoutes(app: FastifyInstance) {

  // GET /unidades-medida?idOrganizacao=
  app.get('/unidades-medida', async (request, reply) => {
    const { idOrganizacao } = request.query as { idOrganizacao: string }
    if (!idOrganizacao) return reply.status(400).send({ error: 'idOrganizacao obrigatorio' })

    const unidades = await prisma.unidadeMedida.findMany({
      where: { idOrganizacao },
      orderBy: [{ nome: 'asc' }],
    })
    return reply.send(unidades)
  })

  // POST /unidades-medida
  app.post('/unidades-medida', async (request, reply) => {
    const { idOrganizacao, nome, sigla } = request.body as {
      idOrganizacao: string
      nome: string
      sigla: string
    }

    if (!idOrganizacao || !nome || !sigla) {
      return reply.status(400).send({ error: 'idOrganizacao, nome e sigla sao obrigatorios' })
    }

    try {
      const unidade = await prisma.unidadeMedida.create({
        data: {
          idOrganizacao,
          nome: nome.trim(),
          sigla: sigla.trim().toUpperCase(),
        },
      })
      return reply.status(201).send(unidade)
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.status(400).send({ error: 'Sigla ja cadastrada para esta organizacao' })
      return reply.status(400).send({ error: err?.message ?? 'Erro ao criar unidade de medida' })
    }
  })

  // PATCH /unidades-medida/:id
  app.patch('/unidades-medida/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { nome, sigla, ativo } = request.body as {
      nome?: string
      sigla?: string
      ativo?: boolean
    }

    try {
      const unidade = await prisma.unidadeMedida.update({
        where: { id },
        data: {
          ...(nome  !== undefined ? { nome:  nome.trim()                } : {}),
          ...(sigla !== undefined ? { sigla: sigla.trim().toUpperCase() } : {}),
          ...(ativo !== undefined ? { ativo                             } : {}),
        },
      })
      return reply.send(unidade)
    } catch (err: any) {
      if (err?.code === 'P2002') return reply.status(400).send({ error: 'Sigla ja cadastrada para esta organizacao' })
      if (err?.code === 'P2025') return reply.status(404).send({ error: 'Unidade de medida nao encontrada' })
      return reply.status(400).send({ error: err?.message ?? 'Erro ao atualizar unidade de medida' })
    }
  })

  // DELETE /unidades-medida/:id
  app.delete('/unidades-medida/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    try {
      await prisma.unidadeMedida.delete({ where: { id } })
      return reply.send({ ok: true })
    } catch (err: any) {
      if (err?.code === 'P2025') return reply.status(404).send({ error: 'Unidade de medida nao encontrada' })
      return reply.status(400).send({ error: err?.message ?? 'Erro ao excluir unidade de medida' })
    }
  })
}
