-- EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
-- Renomeação da hierarquia Potência/Obediência em lojas_db (JÁ EM PRODUÇÃO).
-- Decisão do usuário (2026-09-11, seção 9.9 do contexto de implementação):
-- "Potência" passa a ser o nível superior (Federal/Estadual), "Obediência"
-- passa a ser a organização subordinada à Potência, com Loja subordinada à
-- Obediência. Antes, "obediencia_id" apontava para o nível superior e
-- "subobediencia_id" para o nível intermediário — nomes invertidos em
-- relação ao uso comum entre os maçons.
--
-- RENAME é uma operação de metadado no Postgres — atômica e rápida, sem
-- reescrever linhas, mesmo em produção.
--
-- ORDEM IMPORTA: renomeie "obediencia_id" para "potencia_id" PRIMEIRO, para
-- liberar o nome "obediencia_id" antes de renomear "subobediencia_id" para
-- ele. Se a ordem for invertida, o segundo comando falha (nome já em uso).
--
-- PRÉ-REQUISITO DE DEPLOY: rode isto na mesma janela do deploy do código já
-- atualizado (CoReVM/backend/models/lojas_models.py, schemas/schemas.py,
-- api/v1/integracao/rotas_lojas.py, frontend ModalCadastroLoja.tsx, e o
-- próprio repositório Lojas/backend/models/models.py) — os nomes antigos
-- deixam de existir imediatamente após o RENAME.

BEGIN;

ALTER TABLE lojas RENAME COLUMN obediencia_id TO potencia_id;
ALTER TABLE lojas RENAME COLUMN subobediencia_id TO obediencia_id;

COMMIT;

-- =========================================================================
-- OPCIONAL — cosmético: os nomes de constraint (FK/UNIQUE) auto-gerados
-- pelo Postgres continuam com o nome antigo depois do RENAME COLUMN (ex.:
-- "lojas_obediencia_id_fkey" continua se chamando assim mesmo depois da
-- coluna virar "potencia_id"). Isso não afeta o funcionamento, só a leitura
-- do catálogo. Descomente se quiser renomear também (ajuste os nomes reais
-- consultando primeiro: SELECT conname FROM pg_constraint WHERE conrelid =
-- 'lojas'::regclass;).
-- =========================================================================
-- ALTER TABLE lojas RENAME CONSTRAINT lojas_obediencia_id_fkey TO lojas_potencia_id_fkey;
-- ALTER TABLE lojas RENAME CONSTRAINT lojas_subobediencia_id_fkey TO lojas_obediencia_id_fkey;

-- =========================================================================
-- ROLLBACK (caso precise desfazer)
-- =========================================================================
-- BEGIN;
-- ALTER TABLE lojas RENAME COLUMN obediencia_id TO subobediencia_id;
-- ALTER TABLE lojas RENAME COLUMN potencia_id TO obediencia_id;
-- COMMIT;
