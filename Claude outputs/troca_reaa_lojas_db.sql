-- EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
-- Troca do rito "Rito Escocês Antigo e Aceito" para a sigla "REAA" em
-- lojas_db (produção) — seção 9.7 do contexto de implementação.
-- Confirmado por inspeção (verificar_migracao_lojas_db.py) que o ENUM
-- neste banco se chama "ritoenum" (diferente de "riteenum" em
-- lista_de_lojas_db, onde essa troca já foi aplicada).
--
-- ALTER TYPE ... RENAME VALUE atualiza o rótulo e reflete automaticamente
-- na única linha que hoje usa esse valor (262 linhas estão com rito NULL —
-- não são afetadas). Sem UPDATE de dados necessário.
--
-- IMPORTANTE: confirme que o deploy de CoReVM/backend/core/constants.py e
-- Lojas/backend/models/models.py (ambos já commitados com "REAA" como
-- valor Python) já está em produção antes ou junto com este script — caso
-- contrário, o código consultará "REAA" numa hora em que o banco ainda diz
-- "Rito Escocês Antigo e Aceito" (ou vice-versa) e a comparação vai falhar.

BEGIN;

ALTER TYPE ritoenum RENAME VALUE 'Rito Escocês Antigo e Aceito' TO 'REAA';

COMMIT;

-- ROLLBACK, se precisar:
-- BEGIN;
-- ALTER TYPE ritoenum RENAME VALUE 'REAA' TO 'Rito Escocês Antigo e Aceito';
-- COMMIT;
