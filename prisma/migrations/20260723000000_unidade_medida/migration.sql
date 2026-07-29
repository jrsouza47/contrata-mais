-- Migration: unidade_medida
-- Unidades de medida configuráveis por organização (cadastro próprio,
-- em vez de texto livre no Item do Catálogo)

CREATE TABLE IF NOT EXISTS "unidade_medida" (
  "id"              TEXT         NOT NULL,
  "id_organizacao"  TEXT         NOT NULL,
  "nome"            TEXT         NOT NULL,
  "sigla"           TEXT         NOT NULL,
  "ativo"           BOOLEAN      NOT NULL DEFAULT true,
  "criado_em"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "unidade_medida_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "unidade_medida_id_organizacao_fkey"
    FOREIGN KEY ("id_organizacao") REFERENCES "organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "unidade_medida_id_organizacao_sigla_key"
    UNIQUE ("id_organizacao", "sigla")
);
