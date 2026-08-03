-- Migration: organizacao_modulo
-- Controle de licenciamento por módulo e por organização (multi-tenant).
-- Permite vender/ativar só um subconjunto de módulos (ex: só o PCA) pra um
-- cliente, sem que os demais módulos apareçam no menu ou respondam na API.

CREATE TABLE IF NOT EXISTS "organizacao_modulo" (
  "id"              TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "id_organizacao"  TEXT         NOT NULL,
  "modulo"          TEXT         NOT NULL,
  "ativo"           BOOLEAN      NOT NULL DEFAULT false,
  "data_inicio"     DATE,
  "data_fim"        DATE,
  "observacao"      TEXT,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "organizacao_modulo_id_organizacao_fkey"
    FOREIGN KEY ("id_organizacao") REFERENCES "organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organizacao_modulo_id_organizacao_modulo_key"
    UNIQUE ("id_organizacao", "modulo"),
  CONSTRAINT "organizacao_modulo_modulo_check"
    CHECK ("modulo" IN ('M1_CATALOGO', 'M2_PEDIDOS', 'M6_CONTRATOS', 'M7_LICITACAO', 'PCA'))
);

CREATE INDEX IF NOT EXISTS "organizacao_modulo_id_organizacao_idx"
  ON "organizacao_modulo" ("id_organizacao");

-- Seed inicial: libera todos os módulos pra todas as organizações ativas
-- hoje (TERRACAP, BIOTIC, ETR), conforme combinado. Se alguma organização
-- de teste/homologação não devia entrar aqui, ajuste o WHERE abaixo antes
-- de rodar, ou desligue manualmente depois pela tela de administração.
INSERT INTO "organizacao_modulo" ("id_organizacao", "modulo", "ativo")
SELECT o."id", m."modulo", true
FROM "organizacao" o
CROSS JOIN (VALUES
  ('M1_CATALOGO'),
  ('M2_PEDIDOS'),
  ('M6_CONTRATOS'),
  ('M7_LICITACAO'),
  ('PCA')
) AS m("modulo")
WHERE o."ativo" = true
ON CONFLICT ("id_organizacao", "modulo") DO NOTHING;
