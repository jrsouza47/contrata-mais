import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import prisma from '../../shared/prisma'

// ─── Regras de senha forte ────────────────────────────────────────────────────
// Mínimo 8 caracteres, 1 maiúscula, 1 número, 1 especial
function validarSenhaForte(senha: string): { valida: boolean; motivo?: string } {
  if (senha.length < 8)
    return { valida: false, motivo: 'A senha deve ter ao menos 8 caracteres' }
  if (!/[A-Z]/.test(senha))
    return { valida: false, motivo: 'A senha deve ter ao menos 1 letra maiúscula' }
  if (!/[0-9]/.test(senha))
    return { valida: false, motivo: 'A senha deve ter ao menos 1 número' }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(senha))
    return { valida: false, motivo: 'A senha deve ter ao menos 1 caractere especial (!@#$%...)' }
  return { valida: true }
}

// Gera senha inicial no formato Db@XXXXXX (segura e fácil de repassar)
function gerarSenhaInicial(): string {
  const nums = Math.floor(100000 + Math.random() * 900000)
  return `Db@${nums}`
}

export async function usuarioRoutes(app: FastifyInstance) {

  // GET /usuarios?idOrganizacao=
  app.get('/usuarios', async (request, reply) => {
    const { idOrganizacao } = request.query as { idOrganizacao: string }
    if (!idOrganizacao) return reply.status(400).send({ error: 'idOrganizacao é obrigatório' })

    // Busca usuarios vinculados a essa org via usuario_organizacao
    // OU cuja org principal seja essa (compatibilidade com registros antigos)
    const usuarios = await prisma.usuario.findMany({
      where: {
        OR: [
          { idOrganizacao },
          { organizacoes: { some: { idOrganizacao, ativo: true } } },
        ],
      },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        alcadaValor: true,
        ativo: true,
        criadoEm: true,
      },
    })
    // Remove duplicatas (usuario pode aparecer pelos dois critérios)
    const vistos = new Set<string>()
    const unicos = usuarios.filter(u => { if (vistos.has(u.id)) return false; vistos.add(u.id); return true })
    return reply.send(unicos)
  })

  // GET /usuarios/:id
  app.get('/usuarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        alcadaValor: true,
        ativo: true,
        criadoEm: true,
        idOrganizacao: true,
      },
    })
    if (!usuario) return reply.status(404).send({ error: 'Usuário não encontrado' })
    return reply.send(usuario)
  })

  // POST /usuarios — cria usuário com senha inicial automática
  app.post('/usuarios', async (request, reply) => {
    const body = request.body as {
      idOrganizacao: string
      nome: string
      email: string
      login?: string | null
      perfil: string
      alcadaValor?: number
    }

    if (!body.idOrganizacao || !body.nome || !body.email || !body.perfil) {
      return reply.status(400).send({ error: 'Campos obrigatórios faltando' })
    }

    // Verifica se e-mail já existe
    const emailExistente = await prisma.usuario.findUnique({
      where: { email: body.email.toLowerCase().trim() }
    })
    if (emailExistente) {
      return reply.status(400).send({ error: 'E-mail já cadastrado no sistema' })
    }

    // Gera senha inicial
    const senhaInicial = gerarSenhaInicial()
    const senhaHash = await bcrypt.hash(senhaInicial, 10)

    const usuario = await prisma.usuario.create({
      data: {
        idOrganizacao: body.idOrganizacao,
        nome: body.nome,
        email: body.email.toLowerCase().trim(),
        login: body.login?.trim().toLowerCase() || null,
        perfil: body.perfil,
        alcadaValor: body.alcadaValor ?? null,
        senhaHash,
        trocarSenha: true,
      },
      select: {
        id: true,
        nome: true,
        email: true,
        perfil: true,
        alcadaValor: true,
        ativo: true,
        criadoEm: true,
      },
    })

    // Retorna o usuário + senha inicial para o admin repassar
    return reply.status(201).send({
      ...usuario,
      senhaInicial, // Exibir na tela e nunca mais retornar após isso
    })
  })

  // PATCH /usuarios/:id
  app.patch('/usuarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = request.body as {
      nome?: string
      email?: string
      login?: string | null
      perfil?: string
      alcadaValor?: number
      ativo?: boolean
    }

    // Se e-mail foi enviado, verificar se já existe em OUTRO usuário
    if (body.email) {
      const emailLimpo = body.email.toLowerCase().trim()
      const existente = await prisma.usuario.findFirst({
        where: { email: emailLimpo, NOT: { id } }
      })
      if (existente) {
        return reply.status(400).send({ error: 'E-mail já cadastrado para outro usuário' })
      }
      body.email = emailLimpo
    }

    // Normalizar login
    if (body.login) {
      const loginLimpo = body.login.toLowerCase().trim()
      const existenteLogin = await prisma.usuario.findFirst({
        where: { login: loginLimpo, NOT: { id } }
      })
      if (existenteLogin) {
        return reply.status(400).send({ error: 'Login/apelido já cadastrado para outro usuário' })
      }
      body.login = loginLimpo
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: body,
    })
    return reply.send(usuario)
  })

  // PATCH /usuarios/:id/status
  app.patch('/usuarios/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { ativo } = request.body as { ativo: boolean }
    const usuario = await prisma.usuario.update({
      where: { id },
      data: { ativo },
    })
    return reply.send(usuario)
  })

  // PATCH /usuarios/:id/resetar-senha — admin reseta senha de um usuário
  app.patch('/usuarios/:id/resetar-senha', async (request, reply) => {
    const { id } = request.params as { id: string }

    const senhaInicial = gerarSenhaInicial()
    const senhaHash = await bcrypt.hash(senhaInicial, 10)

    await prisma.usuario.update({
      where: { id },
      data: { senhaHash, trocarSenha: true },
    })

    return reply.send({ senhaInicial })
  })
  // GET /usuarios/:id/filiais — lista filiais vinculadas ao usuário
  app.get('/usuarios/:id/filiais', async (request, reply) => {
    const { id } = request.params as { id: string }
    const vinculos = await prisma.usuarioFilial.findMany({
      where: { idUsuario: id },
      include: { filial: { select: { id: true, nome: true, cnpj: true, isMatriz: true } } },
      orderBy: { criadoEm: 'asc' },
    })
    return reply.send(vinculos.map(v => ({
      id: v.id,
      idFilial: v.idFilial,
      nome: v.filial.nome,
      cnpj: v.filial.cnpj,
      isMatriz: v.filial.isMatriz,
    })))
  })

  // POST /usuarios/:id/filiais — vincula uma filial ao usuário
  app.post('/usuarios/:id/filiais', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { idFilial } = request.body as { idFilial: string }
    if (!idFilial) return reply.status(400).send({ error: 'idFilial é obrigatório' })

    const existente = await prisma.usuarioFilial.findUnique({
      where: { idUsuario_idFilial: { idUsuario: id, idFilial } },
    })
    if (existente) return reply.status(409).send({ error: 'Filial já vinculada a este usuário' })

    const vinculo = await prisma.usuarioFilial.create({
      data: { idUsuario: id, idFilial },
      include: { filial: { select: { id: true, nome: true, cnpj: true, isMatriz: true } } },
    })

    return reply.status(201).send({
      id: vinculo.id,
      idFilial: vinculo.idFilial,
      nome: vinculo.filial.nome,
      cnpj: vinculo.filial.cnpj,
      isMatriz: vinculo.filial.isMatriz,
    })
  })

  // DELETE /usuarios/:id/filiais/:idFilial — desvincula uma filial do usuário
  app.delete('/usuarios/:id/filiais/:idFilial', async (request, reply) => {
    const { id, idFilial } = request.params as { id: string; idFilial: string }

    const existente = await prisma.usuarioFilial.findUnique({
      where: { idUsuario_idFilial: { idUsuario: id, idFilial } },
    })
    if (!existente) return reply.status(404).send({ error: 'Vínculo não encontrado' })

    await prisma.usuarioFilial.delete({
      where: { idUsuario_idFilial: { idUsuario: id, idFilial } },
    })

    return reply.send({ ok: true })
  })
}