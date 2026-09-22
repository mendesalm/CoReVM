-- Migração: adiciona expiração automática e log de arquivamento a
-- Documentos/Convites (documentos_regionais) -- mesmo mecanismo já existente
-- para Avisos/Notificações (ver migracao_avisos_arquivamento_e_lidos.sql).
--
-- Diferença deliberada: NÃO renomeia `deletado_visualmente` (ao contrário do
-- que foi feito em avisos_regionais -> arquivado) para não exigir reescrever
-- dados existentes nem tocar em todas as outras rotas que já leem essa coluna
-- (estatísticas, listagem, upload) -- o efeito é o mesmo (oculta da listagem
-- padrão), só o nome da coluna continua o de sempre.
--
-- Banco alvo: core_db (mesmo banco de avisos_regionais/eventos_agenda)
-- Rodar ANTES de subir o código novo do backend (models.py/rotas.py já
-- esperam as colunas abaixo) -- mesma janela de deploy, igual às migrações
-- anteriores do projeto (ver seção 9.6 do contexto de implementação).
--
-- Como rodar (mesmo padrão já usado antes):
--   psql -h 69.62.89.211 -U esigma -d core_db -f migracao_documentos_expiracao_arquivamento.sql

BEGIN;

ALTER TABLE documentos_regionais ADD COLUMN data_expiracao DATE NULL;
ALTER TABLE documentos_regionais ADD COLUMN arquivado_em TIMESTAMP NULL;
ALTER TABLE documentos_regionais ADD COLUMN arquivado_por VARCHAR(255) NULL;

COMMIT;

-- Rollback, se necessário (rodar manualmente, não faz parte da migração):
-- BEGIN;
-- ALTER TABLE documentos_regionais DROP COLUMN IF EXISTS data_expiracao;
-- ALTER TABLE documentos_regionais DROP COLUMN IF EXISTS arquivado_em;
-- ALTER TABLE documentos_regionais DROP COLUMN IF EXISTS arquivado_por;
-- COMMIT;
