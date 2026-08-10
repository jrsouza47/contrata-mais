import Anthropic from '@anthropic-ai/sdk'
import prisma from '../../shared/prisma'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ─────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────
export interface MensagemChat {
  role: 'user' | 'assistant'
  content: string
}

export interface RespostaAssistente {
  resposta: string
  sugestoes: string[]
}

// ─────────────────────────────────────────────
// Coleta contexto do banco para enriquecer a resposta
// ─────────────────────────────────────────────
async function coletarContexto(idOrganizacao: string): Promise<string> {
  const agora = new Date()
  const inicioAno = new Date(agora.getFullYear(), 0, 1)
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [
    totalPedidos,
    pedidosEmAprovacao,
    pedidosAprovados,
    pedidosCancelados,
    totalCotacoes,
    cotacoesAbertas,
    cotacoesHomologadas,
    totalContratos,
    contratosVigentes,
    contratosVencendo,
    totalFornecedores,
    fornecedoresBloqueados,
    totalItens,
    itensSemCategoria,
    alertasSancao,
    ocorrenciasAbertas,
    fracionamentosAbertos,
    docsVencendo,
  ] = await Promise.all([
    prisma.pedido.count({ where: { idOrganizacao } }),
    prisma.pedido.count({ where: { idOrganizacao, status: 'EmAprovacao' as any } }),
    prisma.pedido.count({ where: { idOrganizacao, status: 'Aprovado' as any, criadoEm: { gte: inicioAno } } }),
    prisma.pedido.count({ where: { idOrganizacao, status: 'Cancelado' as any, criadoEm: { gte: inicioAno } } }),
    prisma.cotacao.count({ where: { idOrganizacao } }),
    prisma.cotacao.count({ where: { idOrganizacao, status: 'Aberta' as any } }),
    prisma.cotacao.count({ where: { idOrganizacao, status: 'Homologada' as any, criadoEm: { gte: inicioAno } } }),
    prisma.contrato.count({ where: { idOrganizacao } }),
    prisma.contrato.count({ where: { idOrganizacao, status: 'Vigente' as any } }),
    prisma.contrato.count({ where: { idOrganizacao, status: 'Vigente' as any, dataFim: { lte: em30dias } } }),
    prisma.fornecedor.count({ where: { idOrganizacao } }),
    prisma.fornecedor.count({ where: { idOrganizacao, status: { in: ['Suspenso', 'Bloqueado'] as any[] } } }),
    prisma.itemCatalogo.count({ where: { idOrganizacao } }),
    prisma.itemCategoria.count({ where: { ativo: false } }),
    prisma.alertaSancao.count({ where: { idOrganizacao, status: 'Ativo' as any } }),
    prisma.ocorrenciaContrato.count({ where: { status: 'Aberta' as any, contrato: { idOrganizacao } } }),
    prisma.logFracionamento.count({ where: { idOrganizacao, status: 'Aberto' as any } }),
    prisma.documentoFornecedor.count({
      where: {
        fornecedor: { idOrganizacao },
        dataVencimento: { lte: em30dias },
        status: 'Vigente' as any,
      }
    }),
  ])

  // Top 3 fornecedores por valor contratado
  const topFornecedores = await prisma.contrato.groupBy({
    by: ['idFornecedor'],
    where: { idOrganizacao },
    _sum: { valorTotal: true },
    orderBy: { _sum: { valorTotal: 'desc' } },
    take: 3,
  })

  const idsForn = topFornecedores.map(f => f.idFornecedor)
  const detForn = await prisma.fornecedor.findMany({
    where: { id: { in: idsForn } },
    select: { id: true, razaoSocial: true }
  })

  const topFornStr = topFornecedores.map(f => {
    const det = detForn.find(d => d.id === f.idFornecedor)
    return `${det?.razaoSocial ?? 'Desconhecido'}: R$ ${Number(f._sum.valorTotal ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  }).join(', ')

  // Ultimos 5 pedidos
  const ultimosPedidos = await prisma.pedido.findMany({
    where: { idOrganizacao },
    orderBy: { criadoEm: 'desc' },
    take: 5,
    select: { numero: true, status: true, valorTotal: true, criadoEm: true }
  })

  const pedidosStr = ultimosPedidos.map(p =>
    `${p.numero} (${p.status} - R$ ${Number(p.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
  ).join(', ')

  return `
=== CONTEXTO DO SISTEMA — Portal de Compras Contrata+ ===
Data atual: ${agora.toLocaleDateString('pt-BR')}

PEDIDOS:
- Total: ${totalPedidos}
- Em aprovação: ${pedidosEmAprovacao}
- Aprovados no ano: ${pedidosAprovados}
- Cancelados no ano: ${pedidosCancelados}
- Últimos 5: ${pedidosStr}

COTAÇÕES:
- Total: ${totalCotacoes}
- Abertas (aguardando propostas): ${cotacoesAbertas}
- Homologadas no ano: ${cotacoesHomologadas}

CONTRATOS:
- Total: ${totalContratos}
- Vigentes: ${contratosVigentes}
- Vencendo em 30 dias: ${contratosVencendo}
- Ocorrências abertas: ${ocorrenciasAbertas}

FORNECEDORES:
- Total cadastrados: ${totalFornecedores}
- Suspensos/Bloqueados: ${fornecedoresBloqueados}
- Alertas de sanção ativos: ${alertasSancao}
- Documentos vencendo em 30 dias: ${docsVencendo}
- Top 3 por valor contratado: ${topFornStr || 'Nenhum contrato ainda'}

CATÁLOGO:
- Total de itens: ${totalItens}
- Itens sem categoria: ${itensSemCategoria}

ALERTAS:
- Fracionamentos abertos: ${fracionamentosAbertos}
- Alertas de sanção: ${alertasSancao}
=======================================================
`.trim()
}

// ─────────────────────────────────────────────
// Prompt do sistema
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o Assistente do Portal de Compras Contrata+ — um sistema de gestão de compras públicas e privadas.

Seu papel é ajudar compradores, gestores e diretores a:
- Consultar dados operacionais (pedidos, cotações, contratos, fornecedores)
- Identificar alertas e pendências que precisam de atenção
- Analisar documentos e contratos enviados pelo usuário
- Identificar cláusulas de risco em contratos
- Sugerir ações com base nos dados apresentados

Regras de comportamento:
- Responda sempre em português brasileiro
- Seja direto e objetivo — o usuário é um profissional de compras
- Use números e dados concretos quando disponíveis no contexto
- Destaque situações críticas (vencimentos, alertas, bloqueios) com clareza
- Ao identificar cláusulas de risco em contratos, liste-as de forma clara com explicação do risco
- Nunca invente dados que não estejam no contexto fornecido
- Se não souber a resposta, diga claramente e sugira como o usuário pode encontrar a informação

Ao final de cada resposta, sugira de 2 a 4 ações relevantes no seguinte formato JSON (após o texto da resposta):
<sugestoes>["Ação 1", "Ação 2", "Ação 3"]</sugestoes>

As sugestões devem ser perguntas ou comandos curtos que o usuário pode clicar para continuar a conversa.`

// ─────────────────────────────────────────────
// Função principal do assistente
// ─────────────────────────────────────────────
export async function processarMensagem(
  idOrganizacao: string,
  mensagem: string,
  historico: MensagemChat[],
  documentoBase64?: string,
  tipoDocumento?: string
): Promise<RespostaAssistente> {

  // Coleta contexto do banco
  const contexto = await coletarContexto(idOrganizacao)

  // Monta mensagens para a API
  const mensagens: Anthropic.MessageParam[] = []

  // Adiciona historico anterior
  for (const msg of historico) {
    mensagens.push({ role: msg.role, content: msg.content })
  }

  // Monta mensagem atual com contexto
  let conteudoAtual: Anthropic.ContentBlockParam[]

  if (documentoBase64 && tipoDocumento) {
    // Com documento anexado (analise de contrato)
    conteudoAtual = [
      {
        type: 'text',
        text: `${contexto}\n\nPergunta do usuário: ${mensagem}\n\nAnalise o documento anexado e responda considerando o contexto do sistema acima.`
      },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: tipoDocumento as 'application/pdf',
          data: documentoBase64,
        },
      } as any
    ]
  } else {
    // Somente texto
    conteudoAtual = [
      {
        type: 'text',
        text: `${contexto}\n\nPergunta do usuário: ${mensagem}`
      }
    ]
  }

  mensagens.push({ role: 'user', content: conteudoAtual })

  // Chama a API da Anthropic
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: mensagens,
  })

  // Extrai texto da resposta
  const textoCompleto = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')

  // Separa sugestoes do texto principal
  const matchSugestoes = textoCompleto.match(/<sugestoes>([\s\S]*?)<\/sugestoes>/)
  const textoPrincipal = textoCompleto.replace(/<sugestoes>[\s\S]*?<\/sugestoes>/, '').trim()

  let sugestoes: string[] = []
  if (matchSugestoes) {
    try {
      sugestoes = JSON.parse(matchSugestoes[1])
    } catch {
      sugestoes = []
    }
  }

  // Sugestoes padrao se nao geradas
  if (sugestoes.length === 0) {
    sugestoes = [
      'Quantos pedidos estão em aprovação?',
      'Quais contratos vencem nos próximos 30 dias?',
      'Há fornecedores com alertas de sanção?',
      'Qual o status das cotações abertas?',
    ]
  }

  return { resposta: textoPrincipal, sugestoes }
}