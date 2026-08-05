// ============================================================
// SCRIPT ÚNICO — popular retroativamente o movimento CRIACAO
// backend/popular_movimento_criacao.js
//
// Objetivo: para todo Item do PCA que já existia ANTES da mudança que
// passou a gravar o movimento CRIACAO na consolidação, cria esse registro
// retroativamente no ledger (movimento_saldo_item_pca), usando a data da
// consolidação original (ou de criação do item, se a consolidação não
// tiver data) para preservar a ordem cronológica correta no histórico.
//
// SEGURO PRA RODAR MAIS DE UMA VEZ: pula qualquer item que já tenha um
// movimento CRIACAO (idempotente).
//
// Pré-requisito: já ter rodado a migration que torna id_pedido opcional:
//   ALTER TABLE movimento_saldo_item_pca ALTER COLUMN id_pedido DROP NOT NULL;
// e já ter rodado `npx prisma generate` depois da mudança no schema.prisma.
//
// Como rodar (na raiz do backend, com o .env de produção configurado):
//   node popular_movimento_criacao.js
// ============================================================

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Buscando Itens do PCA existentes...')
  const itens = await prisma.itemPca.findMany({
    select: {
      id: true,
      numero: true,
      idOrganizacao: true,
      quantidadeTotal: true,
      idConsolidadoPor: true,
      dataConsolidacao: true,
      criadoEm: true,
    },
  })
  console.log(`Encontrados ${itens.length} itens no total.\n`)

  let criados = 0
  let pulados = 0
  let erros = 0

  for (const item of itens) {
    try {
      const jaTem = await prisma.movimentoSaldoItemPca.findFirst({
        where: { idItemPca: item.id, tipo: 'CRIACAO' },
        select: { id: true },
      })
      if (jaTem) {
        pulados++
        continue
      }

      await prisma.movimentoSaldoItemPca.create({
        data: {
          idOrganizacao: item.idOrganizacao,
          idItemPca: item.id,
          tipo: 'CRIACAO',
          quantidade: item.quantidadeTotal,
          idUsuario: item.idConsolidadoPor ?? undefined,
          observacao: 'Registro retroativo — item já existia antes da criação automática deste movimento (script de população)',
          criadoEm: item.dataConsolidacao ?? item.criadoEm,
        },
      })
      criados++
      console.log(`✓ ${item.numero} — movimento CRIACAO criado (qtd: ${item.quantidadeTotal})`)
    } catch (err) {
      erros++
      console.error(`✗ ${item.numero} — erro: ${err.message}`)
    }
  }

  console.log('\n── Resumo ──────────────────────────')
  console.log(`Criados: ${criados}`)
  console.log(`Já existiam (pulados): ${pulados}`)
  console.log(`Erros: ${erros}`)
  console.log(`Total processado: ${itens.length}`)
}

main()
  .catch((err) => {
    console.error('Erro fatal:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
