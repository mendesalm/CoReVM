-- Migração: renomeia o soft-delete de Avisos/Notificações para "arquivamento"
-- (com log de quem/quando) e cria a tabela de leitura por usuário (tag "lido").
--
-- Banco alvo: core_db (mesmo banco de DiretoriaConselho/SuplenteConselho/LojaAgregada)
-- Rodar ANTES de subir o código novo do backend (models.py/rotas.py já
-- esperam as colunas/tabela abaixo) — mesma janela de deploy, igual às
-- migrações anteriores do projeto (ver seção 9.6 do contexto de implementação).
--
-- Como rodar (mesmo padrão já usado antes):
--   psql -h 69.62.89.211 -U esigma -d core_db -f migracao_avisos_arquivamento_e_lidos.sql

BEGIN;

-- 1. Renomeia a coluna de soft-delete existente.
ALTER TABLE avisos_regionais RENAME COLUMN deletado_visualmente TO arquivado;

-- 2. Adiciona o log de arquivamento pedido pelo usuário.
ALTER TABLE avisos_regionais ADD COLUMN arquivado_em TIMESTAMP NULL;
ALTER TABLE avisos_regionais ADD COLUMN arquivado_por VARCHAR(255) NULL;

-- 3. Tabela nova: leitura por usuário (tag "lido").
CREATE TABLE avisos_lidos (
    id VARCHAR(36) PRIMARY KEY,
    aviso_id VARCHAR(36) NOT NULL REFERENCES avisos_regionais(id) ON DELETE CASCADE,
    usuario_id VARCHAR(255) NOT NULL,
    lido_em TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (aviso_id, usuario_id)
);
CREATE INDEX idx_avisos_lidos_usuario ON avisos_lidos (usuario_id);

COMMIT;

-- Rollback, se necessário (rodar manualmente, não faz parte da migração):
-- BEGIN;
-- DROP TABLE IF EXISTS avisos_lidos;
-- ALTER TABLE avisos_regionais DROP COLUMN IF EXISTS arquivado_em;
-- ALTER TABLE avisos_regionais DROP COLUMN IF EXISTS arquivado_por;
-- ALTER TABLE avisos_regionais RENAME COLUMN arquivado TO deletado_visualmente;
-- COMMIT;
