-- Migração: Saldo do Item PCA (reserva / baixa / devolução)
-- Rodar direto no Neon SQL Editor, ANTES de fazer o deploy do código novo.

-- 1) Novos campos em item_pca
ALTER TABLE "item_pca"
  ADD COLUMN IF NOT EXISTS "quantidade_reservada" DECIMAL(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "quantidade_utilizada" DECIMAL(15,4) NOT NULL DEFAULT 0;

-- 2) Nova tabela de movimentação de saldo
CREATE TABLE IF NOT EXISTS "movimento_saldo_item_pca" (
  "id"             TEXT PRIMARY KEY,
  "id_organizacao" TEXT NOT NULL,
  "id_item_pca"    TEXT NOT NULL,
  "id_pedido"      TEXT NOT NULL,
  "id_proposta"    TEXT,
  "tipo"           TEXT NOT NULL,
  "quantidade"     DECIMAL(15,4) NOT NULL,
  "valor_real"     DECIMAL(15,2),
  "observacao"     TEXT,
  "id_usuario"     TEXT,
  "criado_em"      TIMESTAMP NOT NULL DEFAULT now(),

  CONSTRAINT "movimento_saldo_item_pca_id_organizacao_fkey"
    FOREIGN KEY ("id_organizacao") REFERENCES "organizacao"("id"),
  CONSTRAINT "movimento_saldo_item_pca_id_item_pca_fkey"
    FOREIGN KEY ("id_item_pca") REFERENCES "item_pca"("id"),
  CONSTRAINT "movimento_saldo_item_pca_id_pedido_fkey"
    FOREIGN KEY ("id_pedido") REFERENCES "pedido"("id"),
  CONSTRAINT "movimento_saldo_item_pca_id_proposta_fkey"
    FOREIGN KEY ("id_proposta") REFERENCES "proposta"("id"),
  CONSTRAINT "movimento_saldo_item_pca_id_usuario_fkey"
    FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id")
);

CREATE INDEX IF NOT EXISTS "movimento_saldo_item_pca_id_item_pca_idx" ON "movimento_saldo_item_pca"("id_item_pca");
CREATE INDEX IF NOT EXISTS "movimento_saldo_item_pca_id_pedido_idx" ON "movimento_saldo_item_pca"("id_pedido");
CREATE INDEX IF NOT EXISTS "movimento_saldo_item_pca_tipo_idx" ON "movimento_saldo_item_pca"("tipo");
