-- ============================================================
-- MIGRATION: Ajusta integracao_pncp de token fixo para login+senha
-- dbliciti — Módulo PCA
--
-- Correção de modelagem: o PNCP não usa token fixo — usa credenciamento
-- via LOGIN + SENHA junto ao Ministério da Gestão, e o token real é um
-- JWT de curta duração obtido dinamicamente em POST /v1/usuarios/login.
-- Esta migration renomeia as colunas antigas (id_contratante,
-- token_criptografado) e adiciona o cache do JWT.
--
-- Os valores de teste digitados anteriormente (ex.: "admin" no campo
-- antigo id_contratante) são preservados na coluna renomeada, mas não
-- fazem sentido como login real — devem ser substituídos quando as
-- credenciais oficiais da Terracap chegarem.
-- ============================================================

ALTER TABLE "integracao_pncp" RENAME COLUMN "id_contratante" TO "login_pncp";
ALTER TABLE "integracao_pncp" RENAME COLUMN "token_criptografado" TO "senha_criptografada";

ALTER TABLE "integracao_pncp"
  ADD COLUMN IF NOT EXISTS "token_jwt_cache"      TEXT,
  ADD COLUMN IF NOT EXISTS "token_jwt_expira_em"  TIMESTAMP(3);
