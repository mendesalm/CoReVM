CREATE TABLE IF NOT EXISTS historico_lideranca_loja (
    id VARCHAR(36) PRIMARY KEY,
    loja_id VARCHAR(36) NOT NULL UNIQUE,
    regiao_id VARCHAR(36) NOT NULL REFERENCES regioes(id),
    veneravel_cim VARCHAR(50),
    veneravel_nome VARCHAR(255),
    veneravel_email VARCHAR(255),
    fonte VARCHAR(30) NOT NULL DEFAULT 'SYNC_LOJAS',
    confirmado_em TIMESTAMP,
    divergente BOOLEAN NOT NULL DEFAULT FALSE,
    divergencia_detalhe VARCHAR(1000),
    ultima_verificacao_em TIMESTAMP,
    ultimo_alerta_em TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_historico_lideranca_loja_regiao ON historico_lideranca_loja (regiao_id);
CREATE INDEX IF NOT EXISTS ix_historico_lideranca_loja_divergente ON historico_lideranca_loja (divergente);

-- Escopo do Core reduzido, a pedido do usuário (2026-09-14): só o Venerável
-- Mestre e o Suplente por ele indicado interessam ao Conselho, não a
-- diretoria completa da Loja — por isso a reconciliação semanal também
-- verifica se o Suplente designado ainda ocupa um cargo eletivo elegível.
ALTER TABLE suplentes_conselho
    ADD COLUMN IF NOT EXISTS vinculo_valido BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE suplentes_conselho
    ADD COLUMN IF NOT EXISTS vinculo_invalido_detalhe VARCHAR(1000);
ALTER TABLE suplentes_conselho
    ADD COLUMN IF NOT EXISTS vinculo_verificado_em TIMESTAMP;
