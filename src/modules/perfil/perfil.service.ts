// ============================================================
// SERVICE — Perfil e Permissões (catálogo global)
// src/modules/perfil/perfil.service.ts
//
// Substitui a matriz hoje hardcoded em frontend/lib/permissoes.ts.
// Perfil é global (não por organização) — gerenciado pelo
// Administrador Contrata+ em /admin/perfis.
// ============================================================

import prisma from '../../shared/prisma'

export async function listarPerfis() {
  return prisma.perfil.findMany({ orderBy: { criadoEm: 'asc' } })
}

/** Lista completa pra montar a tela de matriz: perfis, o catálogo de
 * (módulo, processo, tipo) existentes, e todas as concessões. */
export async function listarMatriz() {
  const [perfis, permissoes] = await Promise.all([
    prisma.perfil.findMany({ orderBy: { criadoEm: 'asc' } }),
    prisma.permissaoPerfil.findMany(),
  ])

  // O catálogo de processos é derivado das próprias linhas (todo perfil
  // tem uma linha por processo, então basta olhar pra um perfil qualquer —
  // ou, por segurança contra dessincronia, deduplicar de todas as linhas).
  const processosMap = new Map<string, { modulo: string; processo: string; tipo: string }>()
  for (const p of permissoes) {
    const chave = `${p.modulo}::${p.processo}`
    if (!processosMap.has(chave)) processosMap.set(chave, { modulo: p.modulo, processo: p.processo, tipo: p.tipo })
  }

  return {
    perfis,
    processos: [...processosMap.values()],
    permissoes: permissoes.map(p => ({ idPerfil: p.idPerfil, modulo: p.modulo, processo: p.processo, concedido: p.concedido })),
  }
}

export async function criarPerfil(dados: { nome: string; descricao?: string }) {
  const nome = dados.nome.trim()
  if (!nome) throw new Error('Nome do perfil é obrigatório')

  const existente = await prisma.perfil.findUnique({ where: { nome } })
  if (existente) throw new Error(`Já existe um perfil chamado "${nome}"`)

  // Pega o catálogo de (modulo, processo, tipo) já existente, olhando pra
  // qualquer perfil já cadastrado — assim o novo perfil nasce com uma linha
  // pra cada processo do sistema, tudo com concedido=false (padrão seguro).
  const catalogo = await prisma.permissaoPerfil.findMany({
    distinct: ['modulo', 'processo'],
    select: { modulo: true, processo: true, tipo: true },
  })

  return prisma.perfil.create({
    data: {
      nome,
      descricao: dados.descricao?.trim() || null,
      sistemico: false,
      permissoes: {
        create: catalogo.map(c => ({ modulo: c.modulo, processo: c.processo, tipo: c.tipo, concedido: false })),
      },
    },
    include: { permissoes: true },
  })
}

export async function atualizarPerfil(id: string, dados: { nome?: string; descricao?: string; ativo?: boolean }) {
  const perfil = await prisma.perfil.findUnique({ where: { id } })
  if (!perfil) throw new Error('Perfil não encontrado')

  if (dados.nome && dados.nome.trim() !== perfil.nome) {
    const outro = await prisma.perfil.findUnique({ where: { nome: dados.nome.trim() } })
    if (outro) throw new Error(`Já existe um perfil chamado "${dados.nome.trim()}"`)
  }

  return prisma.perfil.update({
    where: { id },
    data: {
      nome: dados.nome?.trim(),
      descricao: dados.descricao !== undefined ? (dados.descricao.trim() || null) : undefined,
      ativo: dados.ativo,
      atualizadoEm: new Date(),
    },
  })
}

export async function excluirPerfil(id: string) {
  const perfil = await prisma.perfil.findUnique({ where: { id } })
  if (!perfil) throw new Error('Perfil não encontrado')
  if (perfil.sistemico) throw new Error('Este é um perfil original do sistema e não pode ser excluído — você pode desativá-lo ou zerar as permissões dele.')

  const emUso = await prisma.usuario.count({ where: { perfil: perfil.nome } })
  if (emUso > 0) throw new Error(`Este perfil está em uso por ${emUso} usuário(s) e não pode ser excluído. Desative-o em vez disso.`)

  await prisma.perfil.delete({ where: { id } })
  return { ok: true }
}

/** Atualização em lote da matriz de um perfil. Só atualiza combos que já
 * existem no catálogo (não inventa módulo/processo novo por essa via). */
export async function atualizarPermissoesPerfil(
  idPerfil: string,
  grants: { modulo: string; processo: string; concedido: boolean }[]
) {
  const perfil = await prisma.perfil.findUnique({ where: { id: idPerfil } })
  if (!perfil) throw new Error('Perfil não encontrado')

  await prisma.$transaction(
    grants.map(g =>
      prisma.permissaoPerfil.updateMany({
        where: { idPerfil, modulo: g.modulo, processo: g.processo },
        data: { concedido: g.concedido },
      })
    )
  )

  return prisma.permissaoPerfil.findMany({ where: { idPerfil } })
}
