-- Migração (2026-09-14): adiciona diretoria_conselho.loja_id
--
-- Necessária para a nova feature de validação da Diretoria do Conselho +
-- detecção de assento "órfão" (quando uma Loja troca de Venerável Mestre
-- sem que a Diretoria do Conselho seja atualizada). O campo registra qual
-- Loja (ID interno de lojas_db.lojas) o membro representa como Venerável
-- Mestre no momento da indicação — nullable, para não quebrar os registros
-- já existentes (criados antes desta alteração, que continuam sem
-- detecção de órfão, como sempre foi).
--
-- Banco: core_db (ver DATABASE_URL_CORE em backend/.env)

ALTER TABLE diretoria_conselho
    ADD COLUMN IF NOT EXISTS loja_id VARCHAR(36) NULL;
