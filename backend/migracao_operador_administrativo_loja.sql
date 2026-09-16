-- Cria a tabela do novo perfil "Operador Administrativo da Loja" (slot
-- duplo Secretário/Chanceler), decisão registrada em
-- claude/decisao-controle-acesso-cadastro.md no Project "Core", seção 5.
-- Acesso puramente administrativo, escopado a uma única Loja, sem
-- visibilidade de outras Lojas e sem decisões políticas (Suplente e
-- transmissão emergencial continuam exclusivos do VM/Diretoria).

CREATE TABLE IF NOT EXISTS operadores_administrativos_loja (
    id VARCHAR(36) PRIMARY KEY,
    loja_id VARCHAR(36) NOT NULL,
    slot VARCHAR(20) NOT NULL,
    usuario_id VARCHAR(255) NOT NULL,
    nome_operador VARCHAR(255) NOT NULL,
    email_operador VARCHAR(255),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    designado_por VARCHAR(255),
    designado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_operador_administrativo_loja_slot UNIQUE (loja_id, slot),
    CONSTRAINT ck_operador_administrativo_loja_slot CHECK (slot IN ('SECRETARIO', 'CHANCELER'))
);

CREATE INDEX IF NOT EXISTS ix_operadores_administrativos_loja_loja ON operadores_administrativos_loja (loja_id);
CREATE INDEX IF NOT EXISTS ix_operadores_administrativos_loja_usuario ON operadores_administrativos_loja (usuario_id);
