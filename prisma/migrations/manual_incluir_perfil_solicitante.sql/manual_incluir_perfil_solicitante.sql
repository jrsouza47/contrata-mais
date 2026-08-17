-- ═══════════════════════════════════════════════════════════════
-- Corrige a lacuna: "Solicitante" não existe na tabela `perfil`
-- (catálogo gerenciado em /admin/perfis), só como texto solto em
-- usuario.perfil. Por isso não aparecia no <select> nem nos
-- checkboxes/drag-and-drop de perfis adicionais.
-- Rodar no Neon SQL Editor.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO perfil (id, nome, descricao, sistemico, ativo, criado_em, atualizado_em)
SELECT gen_random_uuid()::text, 'Solicitante', 'Solicitante do Setor Requisitante — lança Demandas do PCA', true, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM perfil WHERE nome = 'Solicitante');

-- Depois de rodar, agora já é possível popular usuario_perfil pra
-- quem já tem 'Solicitante' como perfil principal (o backfill da
-- Etapa 1 não achou match pra esse nome na época).
INSERT INTO usuario_perfil (id_usuario, id_perfil)
SELECT u.id, p.id
FROM usuario u
JOIN perfil p ON p.nome = u.perfil
WHERE u.perfil = 'Solicitante'
ON CONFLICT (id_usuario, id_perfil) DO NOTHING;

-- Conferência: perfil criado e quantos usuários "Solicitante" existem
SELECT * FROM perfil WHERE nome = 'Solicitante';
SELECT COUNT(*) AS usuarios_solicitante FROM usuario WHERE perfil = 'Solicitante';
