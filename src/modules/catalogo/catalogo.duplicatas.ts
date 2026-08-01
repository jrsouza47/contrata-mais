import prisma from '../../shared/prisma'

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function calcularSimilaridade(a: string, b: string): number {
  const na = normalizarNome(a)
  const nb = normalizarNome(b)

  if (na === nb) return 1

  const maior = Math.max(na.length, nb.length)
  if (maior === 0) return 1

  const setA = new Set(na.split(' '))
  const setB = new Set(nb.split(' '))
  const intersecao = [...setA].filter(p => setB.has(p)).length
  const uniao = new Set([...setA, ...setB]).size

  return intersecao / uniao
}

export async function detectarDuplicatas(idOrganizacao: string) {
  const itens = await prisma.itemCatalogo.findMany({
    where: { idOrganizacao, status: { not: 4 } }, // 4 = Inativo
    select: {
      id: true,
      nome: true,
      codigoInterno: true,
      codigoCatmatCatser: true,
      status: true,
    }
  })

  const gruposPorNome: Array<{
    motivo: string
    itens: typeof itens
  }> = []

  const jaAgrupados = new Set<string>()

  for (let i = 0; i < itens.length; i++) {
    const grupo = [itens[i]]

    for (let j = i + 1; j < itens.length; j++) {
      const similaridade = calcularSimilaridade(itens[i].nome, itens[j].nome)
      if (similaridade >= 0.6) {
        grupo.push(itens[j])
      }
    }

    if (grupo.length > 1) {
      const idsGrupo = grupo.map(it => it.id).sort().join(',')
      if (!jaAgrupados.has(idsGrupo)) {
        jaAgrupados.add(idsGrupo)
        gruposPorNome.push({ motivo: 'Nome similar', itens: grupo })
      }
    }
  }

  const porCatmat: Record<string, typeof itens> = {}
  for (const item of itens) {
    if (item.codigoCatmatCatser) {
      const codigo = item.codigoCatmatCatser.trim()
      if (!porCatmat[codigo]) porCatmat[codigo] = []
      porCatmat[codigo].push(item)
    }
  }

  for (const [codigo, grupo] of Object.entries(porCatmat)) {
    if (grupo.length > 1) {
      gruposPorNome.push({ motivo: `Código CATMAT/CATSER idêntico: ${codigo}`, itens: grupo })
    }
  }

  return {
    totalGrupos: gruposPorNome.length,
    grupos: gruposPorNome
  }
}

export async function verificarDuplicataAoCadastrar(
  idOrganizacao: string,
  nomePretendido: string
): Promise<{ temSimilar: boolean; itensSimilares: Array<{ id: string; nome: string; codigoInterno: string }> }> {
  const itens = await prisma.itemCatalogo.findMany({
    where: { idOrganizacao, status: { not: 4 } }, // 4 = Inativo
    select: { id: true, nome: true, codigoInterno: true }
  })

  const similares = itens.filter(item =>
    calcularSimilaridade(item.nome, nomePretendido) >= 0.6
  )

  return {
    temSimilar: similares.length > 0,
    itensSimilares: similares
  }
}