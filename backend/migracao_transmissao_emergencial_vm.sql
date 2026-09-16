-- Migração (2026-09-14): transmissão de cargo emergencial de VM
--
-- Adiciona a suplentes_conselho as duas colunas necessárias para o poder
-- excepcional de uso único do "Mestre Instalado imediato" (VM anterior de
-- uma Loja órfã) indicar diretamente o próximo Venerável Mestre. Ver
-- claude/decisao-transmissao-cargo-vm.md no Project e
-- api/v1/regional/rotas.py (conceder_transmissao_emergencial_vm /
-- executar_transmissao_emergencial_vm).
--
-- Banco: core_db (ver DATABASE_URL_CORE em backend/.env)

ALTER TABLE suplentes_conselho
    ADD COLUMN IF NOT EXISTS pode_indicar_veneravel BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE suplentes_conselho
    ADD COLUMN IF NOT EXISTS concedido_em TIMESTAMP NULL;
