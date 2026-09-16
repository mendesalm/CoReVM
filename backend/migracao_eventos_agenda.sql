-- Cria (ou atualiza) a tabela do módulo "Agenda do Conselho" (calendário de
-- eventos), decisão registrada em claude/decisao-controle-acesso-cadastro.md
-- no Project "Core", seções 9 e 10. Leitura sempre region-wide (mural);
-- escrita aberta a VM/Suplente/Diretoria/SuperAdmin e ao Operador
-- Administrativo da Loja. Integra com Admissões (previa_admissao_id) e
-- Avisos (aviso_gerado_id).
--
-- ATUALIZAÇÃO (2026-09-16): catálogo fechado de tipos de evento (substitui
-- o rascunho genérico inicial SESSAO/REUNIAO/VISITA/...) + colunas novas
-- `subtipo` e `origem_lancamento`. Este script é seguro para rodar tanto em
-- quem ainda não tinha a tabela quanto em quem já rodou a versão anterior
-- da migração — a criação usa o esquema final, e os `ALTER TABLE` abaixo
-- só têm efeito se a tabela já existisse com o esquema antigo.

CREATE TABLE IF NOT EXISTS eventos_agenda (
    id VARCHAR(36) PRIMARY KEY,
    regiao_id VARCHAR(36) NOT NULL REFERENCES regioes(id),
    titulo VARCHAR(255) NOT NULL,
    descricao VARCHAR(3000),
    tipo VARCHAR(50) NOT NULL,
    subtipo VARCHAR(50),
    data_inicio TIMESTAMP NOT NULL,
    data_fim TIMESTAMP,
    loja_organizadora_id VARCHAR(36),
    loja_organizadora_nome VARCHAR(255),
    loja_organizadora_numero VARCHAR(50),
    criado_por_id VARCHAR(255),
    criado_por_nome VARCHAR(255),
    criado_por_tipo VARCHAR(100),
    previa_admissao_id VARCHAR(36) REFERENCES previas_admissao(id),
    aviso_gerado_id VARCHAR(36) REFERENCES avisos_regionais(id),
    origem_lancamento VARCHAR(20) NOT NULL DEFAULT 'CORE',
    status VARCHAR(50) NOT NULL DEFAULT 'AGENDADO',
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP
);

-- Caso a tabela já existisse da versão anterior da migração (sem as
-- colunas novas), adiciona o que falta sem apagar dado nenhum.
ALTER TABLE eventos_agenda ADD COLUMN IF NOT EXISTS subtipo VARCHAR(50);
ALTER TABLE eventos_agenda ADD COLUMN IF NOT EXISTS origem_lancamento VARCHAR(20) NOT NULL DEFAULT 'CORE';

-- Recria o CHECK de `tipo` com o catálogo final (o rascunho anterior usava
-- códigos genéricos que não existem mais).
ALTER TABLE eventos_agenda DROP CONSTRAINT IF EXISTS ck_eventos_agenda_tipo;
ALTER TABLE eventos_agenda ADD CONSTRAINT ck_eventos_agenda_tipo CHECK (tipo IN (
    'REUNIAO_ADMINISTRATIVA', 'ENCONTRO_REGIONAL', 'CONFERENCIA',
    'SESSAO_MAGNA', 'SESSAO_PUBLICA', 'AGAPE_RITUALISTICO',
    'EVENTO_BENEFICENTE', 'EVENTO_ARRECADACAO', 'HOMENAGEM_EXTERNA'
));

ALTER TABLE eventos_agenda DROP CONSTRAINT IF EXISTS ck_eventos_agenda_subtipo_sessao_magna;
ALTER TABLE eventos_agenda ADD CONSTRAINT ck_eventos_agenda_subtipo_sessao_magna CHECK (
    tipo <> 'SESSAO_MAGNA' OR subtipo IS NULL OR subtipo IN (
        'INICIACAO', 'ELEVACAO', 'EXALTACAO', 'POSSE', 'INSTALACAO', 'COMEMORATIVA'
    )
);

ALTER TABLE eventos_agenda DROP CONSTRAINT IF EXISTS ck_eventos_agenda_status;
ALTER TABLE eventos_agenda ADD CONSTRAINT ck_eventos_agenda_status CHECK (status IN ('AGENDADO', 'REALIZADO', 'CANCELADO'));

ALTER TABLE eventos_agenda DROP CONSTRAINT IF EXISTS ck_eventos_agenda_origem_lancamento;
ALTER TABLE eventos_agenda ADD CONSTRAINT ck_eventos_agenda_origem_lancamento CHECK (origem_lancamento IN ('CORE', 'LOJAS'));

CREATE INDEX IF NOT EXISTS ix_eventos_agenda_regiao ON eventos_agenda (regiao_id);
CREATE INDEX IF NOT EXISTS ix_eventos_agenda_loja_organizadora ON eventos_agenda (loja_organizadora_id);
CREATE INDEX IF NOT EXISTS ix_eventos_agenda_data_inicio ON eventos_agenda (data_inicio);
