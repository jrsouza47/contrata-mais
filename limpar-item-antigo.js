// ============================================================
// SCRIPT DE LIMPEZA — rodar UMA VEZ, só para destravar o
// PCA-2026-00005, que foi reprovado com o código antigo (antes
// da correção que faz a reprovação devolver a demanda de origem).
//
// COMO USAR:
// 1. Salve este arquivo como "limpar-item-antigo.js" na raiz do
//    projeto backend (D:\OneDrive\Documentos\dbliciti)
// 2. No CMD, na mesma pasta, rode:
//      node limpar-item-antigo.js
// 3. Confira a mensagem no final. Pode apagar este arquivo depois.
// ============================================================

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const item = await prisma.itemPca.findFirst({
    where: { numero: 'PCA-2026-00005' },
    include: { dfdsOrigem: true },
  })

  if (!item) {
    console.log('PCA-2026-00005 não encontrado — talvez já tenha sido limpo antes. Nada a fazer.')
    return
  }

  console.log(`Encontrado: ${item.numero} (status atual: ${item.status}), com ${item.dfdsOrigem.length} demanda(s) de origem.`)

  // Libera a(s) demanda(s) de origem, com o mesmo tratamento que a
  // reprovação normal já faz hoje (status 6 = Reprovado, motivo,
  // desvincula do item).
  await prisma.dfd.updateMany({
    where: { idItemPca: item.id },
    data: {
      status: 6, // REJEITADO
      motivoDevolucao: 'Reprovado antes da correção do sistema — regularizado manualmente.',
      idItemPca: null,
    },
  })

  await prisma.riscoItemPca.deleteMany({ where: { idItemPca: item.id } })
  await prisma.itemPca.delete({ where: { id: item.id } })

  console.log('Pronto! PCA-2026-00005 removido e a(s) demanda(s) de origem liberada(s) com status Reprovado.')
}

main()
  .catch((e) => console.error('Erro:', e))
  .finally(() => prisma.$disconnect())
