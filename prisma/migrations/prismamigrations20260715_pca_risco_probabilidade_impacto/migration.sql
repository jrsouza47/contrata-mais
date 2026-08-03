-- ============================================================
-- Módulo PCA — Tela 5 (Gestão de riscos)
-- Adiciona probabilidade e impacto ao risco_item_pca.
-- Campos não previstos na especificação/schema original; alinhados
-- ao esboço de tela a pedido do cliente. Default 2 (Média/Médio)
-- para não quebrar eventuais registros já existentes.
-- ============================================================

ALTER TABLE "risco_item_pca"
  ADD COLUMN IF NOT EXISTS "probabilidade" INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "impacto"       INT NOT NULL DEFAULT 2;

ALTER TABLE "risco_item_pca"
  ADD CONSTRAINT "risco_item_pca_probabilidade_check" CHECK ("probabilidade" IN (1, 2, 3)),
  ADD CONSTRAINT "risco_item_pca_impacto_check" CHECK ("impacto" IN (1, 2, 3));
