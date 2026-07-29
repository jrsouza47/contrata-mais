import 'dotenv/config'
import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyMultipart from '@fastify/multipart'
import { authRoutes } from './modules/auth/auth.routes'
import { catalogoRoutes } from './modules/catalogo/catalogo.routes'
import { catalogoDuplicatasRoutes } from './modules/catalogo/catalogo.duplicatas.routes'
import { catalogoCatmatRoutes } from './modules/catalogo/catalogo.catmat.routes'
import { configuracoesRoutes } from './modules/configuracoes/configuracoes.routes'
import { hierarquiaRoutes } from './modules/hierarquia/hierarquia.routes'
import { areaOrganizacionalRoutes } from './modules/area-organizacional/area-organizacional.routes'
import { catalogoImportacaoRoutes } from './modules/catalogo/catalogo.importacao.routes'
import { pedidoRoutes } from './modules/pedido/routes/pedido.routes'
import { fornecedorRoutes } from './modules/fornecedor/routes/fornecedor.routes'
import { cotacaoRoutes } from './modules/cotacao/cotacao.routes'
import { portalRoutes } from './modules/portal/portal.routes'
import { contratoRoutes } from './modules/contrato/contrato.routes'
import { negociacaoRoutes } from './modules/negociacao/negociacao.routes'
import { licitacaoRoutes } from './modules/licitacao/licitacao.routes'
import { monitoramentoRoutes } from './modules/monitoramento/monitoramento.routes'
import { fornecedorHistoricoRoutes } from './modules/fornecedor/routes/fornecedor.historico.routes'
import { organizacaoRoutes } from './modules/organizacao/organizacao.routes'
import { assistenteRoutes } from './modules/assistente/assistente.routes'
import { dashboardRoutes } from './modules/dashboard/dashboard.routes'
import { usuarioRoutes } from './modules/usuario/usuario.routes'
import { alcadaRoutes } from './modules/alcada/alcada.routes'
import { notificacoesRoutes } from './modules/notificacoes/notificacoes.routes'
import { filialRoutes } from './modules/filial/filial.routes'
import { grupoRoutes } from './modules/grupo/grupo.routes'
import { tipoDocumentoRoutes } from './modules/tipo-documento/tipo-documento.routes'
import { unidadeMedidaRoutes } from './modules/unidade-medida/unidade-medida.routes'
import { analiseCplRoutes } from './modules/analise-cpl/analise-cpl.routes'
import { definicaoContratacaoRoutes } from './modules/definicao-contratacao/definicao-contratacao.routes'
import { editalRoutes } from './modules/edital/edital.routes'
import { pcaRoutes } from './modules/pca/pca.routes'
import { integracaoErpRoutes } from './modules/integracao-erp/integracao-erp.routes'

const app = Fastify({ logger: true, bodyLimit: 52428800 })

app.register(fastifyCors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
})
app.register(fastifyMultipart)
app.register(authRoutes)
app.register(cotacaoRoutes)
app.register(portalRoutes)
app.register(contratoRoutes)
app.register(negociacaoRoutes)

app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    done(null, body ? JSON.parse(body as string) : {})
  } catch (err) {
    done(err as Error, undefined)
  }
})

app.get('/health', async () => {
  return { status: 'ok', projeto: 'Portal de Compras API', versao: '2.0.0' }
})

app.register(catalogoRoutes)
app.register(catalogoImportacaoRoutes)
app.register(catalogoDuplicatasRoutes)
app.register(catalogoCatmatRoutes)
app.register(configuracoesRoutes)
app.register(hierarquiaRoutes)
app.register(areaOrganizacionalRoutes)
app.register(pedidoRoutes)
app.register(fornecedorRoutes)
app.register(licitacaoRoutes)
app.register(monitoramentoRoutes)
app.register(fornecedorHistoricoRoutes)
app.register(organizacaoRoutes)
app.register(assistenteRoutes)
app.register(dashboardRoutes)
app.register(usuarioRoutes)
app.register(alcadaRoutes)
app.register(notificacoesRoutes)
app.register(filialRoutes)
app.register(grupoRoutes)
app.register(tipoDocumentoRoutes)
app.register(unidadeMedidaRoutes)
app.register(analiseCplRoutes)
app.register(definicaoContratacaoRoutes)
app.register(editalRoutes)
app.register(pcaRoutes)
app.register(integracaoErpRoutes)

const start = async () => {
  try {
    await app.listen({ port: 3333, host: '0.0.0.0' })
    console.log('Servidor rodando em http://localhost:3333')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
