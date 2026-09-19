-- EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
-- Passo final da migração de lista_de_lojas_db: renomeia o par
-- obediencia_id/subobediencia_id (já em PT-BR, aplicado anteriormente) para
-- potencia_id/obediencia_id, refletindo a hierarquia redefinida em
-- 2026-09-11 (seção 9.9 do contexto de implementação): Potência é o nível
-- superior, Obediência é subordinada à Potência, Loja é subordinada à
-- Obediência.
--
-- Confirmado por inspeção (verificar_migracao_lista_lojas.py) que o estado
-- atual de lista_de_lojas_db é: tabelas "lojas"/"obediencias" já em PT-BR,
-- colunas operacionais já removidas, rito já usando "REAA" — falta só este
-- passo.
--
-- ORDEM IMPORTA: renomeie "obediencia_id" para "potencia_id" PRIMEIRO.

BEGIN;

ALTER TABLE lojas RENAME COLUMN obediencia_id TO potencia_id;
ALTER TABLE lojas RENAME COLUMN subobediencia_id TO obediencia_id;

COMMIT;

-- ROLLBACK, se precisar:
-- BEGIN;
-- ALTER TABLE lojas RENAME COLUMN obediencia_id TO subobediencia_id;
-- ALTER TABLE lojas RENAME COLUMN potencia_id TO obediencia_id;
-- COMMIT;
