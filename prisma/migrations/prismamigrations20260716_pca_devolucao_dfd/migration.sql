-- ============================================================
-- Módulo PCA — Devolução de Item PCA cascateando para a(s)
-- demanda(s) de origem (DFD). Quando a Autoridade Competente
-- devolve um Item PCA para ajuste, as demandas voltam para quem
-- elaborou, com status DEVOLVIDO (5) e o motivo anexado.
-- ============================================================

ALTER TABLE "dfd"
  ADD COLUMN IF NOT EXISTS "motivo_devolucao" TEXT;
