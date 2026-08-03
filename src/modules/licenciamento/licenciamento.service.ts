// ============================================================
// SERVICE — Módulo de Licenciamento
// backend/src/modules/licenciamento/licenciamento.service.ts
// ============================================================

import prisma from '../../shared/prisma'
import { LISTA_MODULOS, ModuloSistema, CACHE_TTL_MS } from './licenciamento.constants'

// ── Cache em memória: idOrganizacao -> { modulos: Set<string>, expiraEm: number } ──
// Evita bater no banco em toda requisição, já que a checagem de módulo roda
// em praticamente todas as rotas do sistema. Invalidado automaticamente por
// TTL e manualmente sempre que uma licença é alterada (ver invalidarCache).
interface CacheEntrada {
  modulos: Set<string>
  expiraEm: number
}

const cache = new Map<string, CacheEntrada>()

function invalidarCache(idOrganizacao: string) {
  cache.delete(idOrganizacao)
}

async function carregarModulosAtivos(idOrganizacao: string): Promise<Set<string>> {
  const agora = Date.now()
  const emCache = cache.get(idOrganizacao)
  if (emCache && emCache.expiraEm > agora) {
    return emCache.modulos
  }

  const registros = await prisma.organizacaoModulo.findMany({
    where: { idOrganizacao, ativo: true },
    select: { modulo: true },
  })

  const modulos = new Set(registros.map((r) => r.modulo))
  cache.set(idOrganizacao, { modulos, expiraEm: agora + CACHE_TTL_MS })
  return modulos
}

// ── Checagem principal — usada pelo middleware em toda requisição de rota licenciada ──
export async function moduloEstaAtivo(idOrganizacao: string, modulo: ModuloSistema): Promise<boolean> {
  if (!idOrganizacao) return false
  const modulos = await carregarModulosAtivos(idOrganizacao)
  return modulos.has(modulo)
}

// ── Usado pelo endpoint /me/modulos-ativos, pro frontend montar o menu ──
export async function listarModulosAtivos(idOrganizacao: string): Promise<string[]> {
  const modulos = await carregarModulosAtivos(idOrganizacao)
  return LISTA_MODULOS.filter((m) => modulos.has(m))
}

// ── Administração (só ADMINISTRADOR_DBLICITI) ──

export async function listarLicencasDaOrganizacao(idOrganizacao: string) {
  const registros = await prisma.organizacaoModulo.findMany({
    where: { idOrganizacao },
  })
  const porModulo = new Map(registros.map((r) => [r.modulo, r]))

  // Sempre retorna a lista completa dos módulos do sistema, mesmo que a
  // organização ainda não tenha nenhum registro (aparece como inativo).
  return LISTA_MODULOS.map((modulo) => {
    const existente = porModulo.get(modulo)
    return {
      modulo,
      ativo: existente?.ativo ?? false,
      dataInicio: existente?.dataInicio ?? null,
      dataFim: existente?.dataFim ?? null,
      observacao: existente?.observacao ?? null,
    }
  })
}

export async function listarTodasOrganizacoesComLicencas() {
  const organizacoes = await prisma.organizacao.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, slug: true },
    orderBy: { nome: 'asc' },
  })

  const resultado: Array<{
    id: string
    nome: string
    slug: string | null
    licencas: Awaited<ReturnType<typeof listarLicencasDaOrganizacao>>
  }> = []
  for (const org of organizacoes) {
    const licencas = await listarLicencasDaOrganizacao(org.id)
    resultado.push({ ...org, licencas })
  }
  return resultado
}

interface DefinirLicencaInput {
  idOrganizacao: string
  modulo: ModuloSistema
  ativo: boolean
  dataInicio?: Date | null
  dataFim?: Date | null
  observacao?: string | null
}

export async function definirLicenca(input: DefinirLicencaInput) {
  if (!LISTA_MODULOS.includes(input.modulo)) {
    throw new Error(`Módulo inválido: ${input.modulo}`)
  }

  const registro = await prisma.organizacaoModulo.upsert({
    where: {
      idOrganizacao_modulo: {
        idOrganizacao: input.idOrganizacao,
        modulo: input.modulo,
      },
    },
    update: {
      ativo: input.ativo,
      dataInicio: input.dataInicio ?? null,
      dataFim: input.dataFim ?? null,
      observacao: input.observacao ?? null,
    },
    create: {
      idOrganizacao: input.idOrganizacao,
      modulo: input.modulo,
      ativo: input.ativo,
      dataInicio: input.dataInicio ?? null,
      dataFim: input.dataFim ?? null,
      observacao: input.observacao ?? null,
    },
  })

  invalidarCache(input.idOrganizacao)
  return registro
}
