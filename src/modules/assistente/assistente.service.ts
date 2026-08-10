import Anthropic from '@anthropic-ai/sdk'
import prisma from '../../shared/prisma'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface MensagemChat {
  role: 'user' | 'assistant'
  content: string
}

export interface RespostaAssistente {
  resposta: string
  sugestoes: string[]
}

// ─────────────────────────────────────────────
// Domínio (referência dos codigos Int)
// ─────────────────────────────────────────────
// pedido.status:       1=Rascunho, 2=Submetido, 3=EmAprovacao, 4=Aprovado, 5=Reprovado, 6=Cancelado, 7=Encaminhado
// cotacao.status:      1=Aberta, 2=Encerrada, 3=Homologada, 4=Deserta
// contrato.status:     1=Minuta, 2=Vigente, 3=Encerrado
// fornecedor.status:   1=Ativo, 2=Suspenso, 3=Bloqueado
// entrega.status:      1=Pendente, 2=Confirmado, 3=Contestado
// alerta_sancao.status:1=Ativo, 2=Resolvido
// log_frac.status:     1=Aberto, 2=Resolvido
// documento.status:    1=Vigente, 2=Vencido, 3=Cancelado

async function coletarContexto(idOrganizacao: string): Promise<string> {
  const agora = new Date()
  const inicioAno = new Date(agora.getFullYear(), 0, 1)
  const em30dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [
    totalPedidos,
    pedidosEmAprovacao,
    pedidosAprovadosAno,
    pedidosCanceladosAno,
    totalCotacoes,
    cotacoesAbertas,
    cotacoesHomologadasAno,
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
    prisma.pedido.count({ where: { idOrganizacao, status: 3 } }), // EmAprovacao
    prisma.pedido.count({ where: { idOrganizacao, status: 4, criadoEm: { gte: inicioAno } } }), // Aprovado
    prisma.pedido.count({ where: { idOrganizacao, status: 6, criadoEm: { gte: inicioAno } } }), // Cancelado
    prisma.cotacao.count({ where: { idOrganizacao } }),
    prisma.cotacao.count({ where: { idOrganizacao, status: 1 } }), // Aberta
    prisma.cotacao.count({ where: { idOrganizacao, status: 3, criadoEm: { gte: inicioAno } } }), // Homologada
    prisma.contrato.count({ where: { idOrganizacao } }),
    prisma.contrato.count({ where: { idOrganizacao, status: 2 } }), // Vigente
    prisma.contrato.count({ where: { idOrganizacao, status: 2, dataFim: { lte: em30dias } } }),
    prisma.fornecedor.count({ where: { idOrganizacao } }),
    prisma.fornecedor.count({ where: { idOrganizacao, status: { in: [2, 3] } } }), // Suspenso, Bloqueado
    prisma.itemCatalogo.count({ where: { idOrganizacao } }),
    prisma.itemCategoria.count({ where: { ativo: false } }),
    prisma.alertaSancao.count({ where: { idOrganizacao, status: 1 } }), // Ativo
    prisma.ocorrenciaContrato.count({ where: { status: 1, contrato: { idOrganizacao } } }), // Aberta
    prisma.logFracionamento.count({ where: { idOrganizacao, status: 1 } }), // Aberto
    prisma.documentoFornecedor.count({
      where: {
        fornecedor: { idOrganizacao },
        dataVencimento: { lte: em30dias },
        status: 1, // Vigente
      }
    }),
  ])

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

  const ultimosPedidos = await prisma.pedido.findMany({
    where: { idOrganizacao },
    orderBy: { criadoEm: 'desc' },
    take: 5,
    select: { numero: true, status: true, valorTotal: true, criadoEm: true }
  })

  const statusPedidoMap: Record<number, string> = {
    1: 'Rascunho', 2: 'Submetido', 3: 'EmAprovacao',
    4: 'Aprovado', 5: 'Reprovado', 6: 'Cancelado', 7: 'Encaminhado'
  }

  const pedidosStr = ultimosPedidos.map(p =>
    `${p.numero} (${statusPedidoMap[p.status] ?? p.status} - R$ ${Number(p.valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
  ).join(', ')

  return `
=== CONTEXTO DO SISTEMA — Portal de Compras Contrata+ ===
Data atual: ${agora.toLocaleDateString('pt-BR')}

PEDIDOS:
- Total: ${totalPedidos}
- Em aprovação: ${pedidosEmAprovacao}
- Aprovados no ano: ${pedidosAprovadosAno}
- Cancelados no ano: ${pedidosCanceladosAno}
- Últimos 5: ${pedidosStr}

COTAÇÕES:
- Total: ${totalCotacoes}
- Abertas (aguardando propostas): ${cotacoesAbertas}
- Homologadas no ano: ${cotacoesHomologadasAno}

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

export async function processarMensagem(
  idOrganizacao: string,
  mensagem: string,
  historico: MensagemChat[],
  documentoBase64?: string,
  tipoDocumento?: string
): Promise<RespostaAssistente> {

  const contexto = await coletarContexto(idOrganizacao)

  const mensagens: Anthropic.MessageParam[] = []

  for (const msg of historico) {
    mensagens.push({ role: msg.role, content: msg.content })
  }

  let conteudoAtual: Anthropic.ContentBlockParam[]

  if (documentoBase64 && tipoDocumento) {
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
    conteudoAtual = [
      {
        type: 'text',
        text: `${contexto}\n\nPergunta do usuário: ${mensagem}`
      }
    ]
  }

  mensagens.push({ role: 'user', content: conteudoAtual })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: mensagens,
  })

  const textoCompleto = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as Anthropic.TextBlock).text)
    .join('')

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