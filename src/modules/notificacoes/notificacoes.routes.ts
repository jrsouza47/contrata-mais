import { FastifyInstance } from 'fastify'
import twilio from 'twilio'
import prisma from '../../shared/prisma'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

export async function notificacoesRoutes(app: FastifyInstance) {

  // POST /notificacoes/solicitar-item — envia WhatsApp via Twilio ou e-mail
  app.post('/notificacoes/solicitar-item', async (request, reply) => {
    const { canal, para, solicitante, idOrganizacao, descricao } = request.body as {
      canal: 'whatsapp' | 'email'
      para: string
      solicitante: string
      idOrganizacao: string
      descricao: string
    }

    if (!para || !descricao) {
      return reply.status(400).send({ error: 'para e descricao sao obrigatorios' })
    }

    // Busca nome da organizacao
    const org = await prisma.organizacao.findUnique({
      where: { id: idOrganizacao },
      select: { nome: true },
    })
    const nomeOrg = org?.nome ?? idOrganizacao

    const mensagem =
      '*Solicitação de Cadastro de Item*\n' +
      '_Contrata+ Portal de Compras_\n\n' +
      '*Solicitante:* ' + solicitante + '\n' +
      '*Organização:* ' + nomeOrg + '\n\n' +
      '*Descrição do item:*\n' + descricao

    try {
      if (canal === 'email') {
        return reply.status(501).send({ error: 'Envio por e-mail ainda nao configurado.' })
      }

      const numeroLimpo = para.replace(/[^0-9]/g, '')
      const numeroDestino = 'whatsapp:+' + numeroLimpo

      await client.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: numeroDestino,
        body: mensagem,
      })

      return reply.send({ ok: true, message: 'Mensagem enviada com sucesso' })
    } catch (err: any) {
      console.error('Twilio error:', err?.message)
      return reply.status(500).send({ error: 'Erro ao enviar mensagem', detalhe: err?.message })
    }
  })
}
