-- ============================================================
-- MIGRATION: Integração via API oficial do PNCP (toggle por organização)
-- dbliciti — Módulo PCA
--
-- Cria a tabela integracao_pncp (1 registro por organização, opt-in via
-- Configurações > PCA) e adiciona a coluna metodo_envio em pncp_envio_pca
-- para registrar como o envio foi de fato publicado (CSV ou API).
--
-- Não altera em nada o fluxo atual de CSV — o botão "Gerar CSV" no
-- Monitor PNCP continua funcionando exatamente como está, sem depender
-- desta tabela. Segue o mesmo padrão de integracao_erp (Benner).
-- ============================================================

CREATE OR REPLACE FUNCTION update_timestamp_integracao_pncp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS "integracao_pncp" (
  "id"                    TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "id_organizacao"        TEXT         NOT NULL,

  "ativo"                 BOOLEAN      NOT NULL DEFAULT false, -- toggle "Integração via API PNCP"

  "id_contratante"        TEXT,   -- identificador do órgão no PNCP — não sigiloso
  "token_criptografado"   TEXT,   -- AES-256-GCM — nunca texto puro

  "ultima_publicacao_em"  TIMESTAMP(3),
  "ultimo_resultado"      TEXT,   -- SUCESSO | ERRO
  "ultima_mensagem_erro"  TEXT,

  "criado_em"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "integracao_pncp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integracao_pncp_id_organizacao_key" UNIQUE ("id_organizacao"),
  CONSTRAINT "integracao_pncp_id_organizacao_fkey"
    FOREIGN KEY ("id_organizacao") REFERENCES "organizacao"("id") ON UPDATE CASCADE
);

CREATE TRIGGER integracao_pncp_update_timestamp BEFORE UPDATE ON "integracao_pncp"
  FOR EACH ROW EXECUTE FUNCTION update_timestamp_integracao_pncp();

-- Como cada envio foi de fato publicado — nulo até a primeira confirmação
ALTER TABLE "pncp_envio_pca"
  ADD COLUMN IF NOT EXISTS "metodo_envio" TEXT; -- CSV | API
