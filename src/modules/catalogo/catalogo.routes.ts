import { FastifyInstance } from 'fastify'
import { verificarDuplicataAoCadastrar } from './catalogo.duplicatas'
import { lerConfiguracao } from '../configuracoes/configuracoes.service'
import {
  listarItens,
  buscarItemPorId,
  criarItem,
  atualizarItem,
  atualizarStatusItem,
  registrarPreco,
  listarCategorias,
  excluirItem
} from './catalogo.service'

export async function catalogoRoutes(app: FastifyInstance) {

  // GET /itens — lista itens. Por padrão só Ativos (usado em seletores);
  // ?todos=true retorna todos os status (usado na tela de gestão do catálogo M1);
  // ?status=N filtra por um status específico.
  app.get('/itens', async (request, reply) => {
    const { organizacaoId, status, todos } = request.query as { organizacaoId: string; status?: string; todos?: string }
    if (!organizacaoId) {
      return reply.status(400).send({ error: 'organizacaoId é obrigatório' })
    }
    return listarItens(organizacaoId, {
      todos: todos === 'true',
      status: status !== undefined ? Number(status) : undefined
    })
  })

  // GET /itens/:id — busca item por ID
  app.get('/itens/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { organizacaoId } = request.query as { organizacaoId: string }
    if (!organizacaoId) {
      return reply.status(400).send({ error: 'organizacaoId é obrigatório' })
    }
    const item = await buscarItemPorId(id, organizacaoId)
    if (!item) return reply.status(404).send({ error: 'Item não encontrado' })
    return item
  })

  // POST /itens — cadastrar novo item
  app.post('/itens', async (request, reply) => {
    const body = request.body as {
      idOrganizacao: string
      nome: string
      descricaoTecnica: string
      tipo: string
      unidadeMedida: string
      criadoPor: string
      idCategoria?: string
      codigoCatmatCatser?: string
      sigilo?: boolean
      usoUnico?: boolean
      idItemSucessor?: string
      atributosExtras?: Record<string, string>
    }

    if (!body.idOrganizacao || !body.nome || !body.descricaoTecnica ||
        !body.tipo || !body.unidadeMedida || !body.criadoPor) {
      return reply.status(400).send({ error: 'Campos obrigatórios faltando' })
    }

    try {
      const alertaAtivo = await lerConfiguracao(body.idOrganizacao, 'alertaDuplicatasItens')

      const { temSimilar, itensSimilares } = alertaAtivo
        ? await verificarDuplicataAoCadastrar(body.idOrganizacao, body.nome)
        : { temSimilar: false, itensSimilares: [] }

      const item = await criarItem(body)

      return reply.status(201).send({
        ...item,
        alerta: temSimilar
          ? {
              mensagem: 'Item cadastrado, mas existem itens com nome similar no catálogo.',
              itensSimilares: itensSimilares.map(s => ({
                id: s.id,
                codigoInterno: s.codigoInterno,
                nome: s.nome
              }))
            }
          : undefined
      })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // PATCH /itens/:id/status — atualizar status (aprovação)
  app.patch('/itens/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      status: string
      organizacaoId: string
      usuarioId: string
      justificativa?: string
    }

    const statusValidos = [
      'Rascunho', 'Em revisão', 'Ativo',
      'Ativo com ressalva', 'Inativo', 'Descontinuado', 'Bloqueado'
    ]

    if (!statusValidos.includes(body.status)) {
      return reply.status(400).send({ error: 'Status inválido' })
    }

    const item = await atualizarStatusItem(
      id, body.organizacaoId, body.status, body.usuarioId, body.justificativa
    )
    return item
  })

  // PUT /itens/:id — editar item existente
  app.put('/itens/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      organizacaoId: string
      usuarioId: string
      nome?: string
      descricaoTecnica?: string
      tipo?: string
      unidadeMedida?: string
      idCategoria?: string | null
      codigoCatmatCatser?: string | null
      sigilo?: boolean
      usoUnico?: boolean
      idItemSucessor?: string | null
      atributosExtras?: Record<string, string> | null
    }

    if (!body.organizacaoId || !body.usuarioId) {
      return reply.status(400).send({ error: 'organizacaoId e usuarioId são obrigatórios' })
    }

    try {
      let alerta: any = undefined
      if (body.nome) {
        const alertaAtivo = await lerConfiguracao(body.organizacaoId, 'alertaDuplicatasItens')
        if (alertaAtivo) {
          const { temSimilar, itensSimilares } = await verificarDuplicataAoCadastrar(body.organizacaoId, body.nome)
          const similaresExcluindoEsteItem = itensSimilares.filter(s => s.id !== id)
          if (temSimilar && similaresExcluindoEsteItem.length > 0) {
            alerta = {
              mensagem: 'Item atualizado, mas existem itens com nome similar no catálogo.',
              itensSimilares: similaresExcluindoEsteItem.map(s => ({ id: s.id, codigoInterno: s.codigoInterno, nome: s.nome }))
            }
          }
        }
      }

      const { organizacaoId, usuarioId, ...dados } = body
      const item = await atualizarItem(id, organizacaoId, usuarioId, dados)
      return reply.send({ ...item, alerta })
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // GET /categorias?organizacaoId= — lista categorias ativas (para seletor no formulário do item)
  app.get('/categorias', async (request, reply) => {
    const { organizacaoId } = request.query as { organizacaoId: string }
    if (!organizacaoId) {
      return reply.status(400).send({ error: 'organizacaoId é obrigatório' })
    }
    return listarCategorias(organizacaoId)
  })

  // DELETE /itens/:id — exclui item se não estiver em uso em nenhum lugar do sistema
  app.delete('/itens/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { organizacaoId } = request.query as { organizacaoId: string }
    if (!organizacaoId) {
      return reply.status(400).send({ error: 'organizacaoId é obrigatório' })
    }
    try {
      const resultado = await excluirItem(id, organizacaoId)
      return resultado
    } catch (err: any) {
      return reply.status(400).send({ error: err.message })
    }
  })

  // POST /itens/:id/preco — registrar preço de referência
  app.post('/itens/:id/preco', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      valor: number
      fonte: string
      dataReferencia: string
      responsavelId: string
    }

    if (!body.valor || !body.fonte || !body.dataReferencia || !body.responsavelId) {
      return reply.status(400).send({ error: 'Campos obrigatórios faltando' })
    }

    const preco = await registrarPreco({ idItem: id, ...body })
    return reply.status(201).send(preco)
  })
}