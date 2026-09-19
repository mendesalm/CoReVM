-- EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
-- Migração de nomenclatura de lista_de_lojas_db (schema legado em inglês -> PT-BR)
-- Decisão do usuário (2026-09-11): manter lista_de_lojas_db como banco separado
-- (não fundir com lojas_db), apenas traduzindo tabelas/colunas para PT-BR.
--
-- Confirmado por inspeção (inspecionar_lista_lojas_completo.py +
-- inspecionar_enums_lista_lojas.py): o CONTEÚDO das linhas já está em
-- português (ex.: 'Rito Escocês Antigo e Aceito', 'Sextas-feiras',
-- 'Federal'/'Estadual') — só os nomes de tabela/coluna estão em inglês.
-- Portanto esta migração é puramente estrutural (RENAME), sem UPDATE de
-- dados. RENAME TABLE/COLUMN no Postgres é uma operação de metadado,
-- rápida e atômica mesmo em tabelas grandes — segura mesmo com as 270
-- linhas de "lodges" e 3 linhas de "obediences" de hoje.
--
-- IMPORTANTE: depois de rodar esta migração, o código que lê/escreve
-- lista_de_lojas_db (hoje só CoReVM/backend/api/v1/integracao/rotas_lojas.py)
-- PRECISA subir junto com os novos nomes de coluna — os nomes antigos
-- deixam de existir imediatamente após o RENAME. Rode esta migração e
-- faça o deploy do rotas_lojas.py atualizado na mesma janela.
--
-- Como testar antes de aplicar em produção: rode esta migração contra uma
-- cópia/backup de lista_de_lojas_db primeiro (pg_dump + restore num banco
-- de teste), valide as queries do rotas_lojas.py novo contra ela, e só
-- depois aplique aqui.

BEGIN;

-- =========================================================================
-- 1. Tabela "obediences" -> "obediencias"
-- =========================================================================
ALTER TABLE obediences RENAME TO obediencias;

ALTER TABLE obediencias RENAME COLUMN name TO nome;
ALTER TABLE obediencias RENAME COLUMN acronym TO sigla;
ALTER TABLE obediencias RENAME COLUMN type TO tipo;
ALTER TABLE obediencias RENAME COLUMN parent_obedience_id TO obediencia_superior_id;
ALTER TABLE obediencias RENAME COLUMN phone TO telefone;
ALTER TABLE obediencias RENAME COLUMN website TO site;
ALTER TABLE obediencias RENAME COLUMN street_address TO logradouro;
ALTER TABLE obediencias RENAME COLUMN street_number TO numero_endereco;
ALTER TABLE obediencias RENAME COLUMN address_complement TO complemento_endereco;
ALTER TABLE obediencias RENAME COLUMN neighborhood TO bairro;
ALTER TABLE obediencias RENAME COLUMN city TO cidade;
ALTER TABLE obediencias RENAME COLUMN state TO estado;
ALTER TABLE obediencias RENAME COLUMN zip_code TO cep;
ALTER TABLE obediencias RENAME COLUMN technical_contact_name TO nome_contato_tecnico;
ALTER TABLE obediencias RENAME COLUMN technical_contact_email TO email_contato_tecnico;
ALTER TABLE obediencias RENAME COLUMN created_at TO criado_em;
ALTER TABLE obediencias RENAME COLUMN updated_at TO atualizado_em;
ALTER TABLE obediencias RENAME COLUMN available_modules TO modulos_disponiveis;
ALTER TABLE obediencias RENAME COLUMN previous_settings TO configuracoes_anteriores;
-- cnpj, email, latitude, longitude: já são termos técnicos universais, sem tradução necessária.

-- =========================================================================
-- 2. Tabela "lodges" -> "lojas"
-- =========================================================================
ALTER TABLE lodges RENAME TO lojas;

ALTER TABLE lojas RENAME COLUMN lodge_name TO nome_loja;
ALTER TABLE lojas RENAME COLUMN lodge_title TO titulo_loja;
ALTER TABLE lojas RENAME COLUMN lodge_code TO codigo_loja;
ALTER TABLE lojas RENAME COLUMN lodge_number TO numero_loja;
ALTER TABLE lojas RENAME COLUMN foundation_date TO data_fundacao;
ALTER TABLE lojas RENAME COLUMN rite TO rito;
-- ALTERAÇÃO (2026-09-11, decisão do usuário — seção 9.9 do contexto de
-- implementação): hierarquia redefinida. "Potência" passou a ser o nível
-- superior, "Obediência" o nível subordinado à Potência (com Loja
-- subordinada à Obediência). Por isso obedience_id (nível superior) vira
-- potencia_id, e subobedience_id (nível intermediário) vira obediencia_id
-- — não "subobediencia_id" como uma primeira versão desta migração previa.
ALTER TABLE lojas RENAME COLUMN obedience_id TO potencia_id;
ALTER TABLE lojas RENAME COLUMN subobedience_id TO obediencia_id;
ALTER TABLE lojas RENAME COLUMN phone TO telefone;
ALTER TABLE lojas RENAME COLUMN website TO site;
ALTER TABLE lojas RENAME COLUMN street_address TO logradouro;
ALTER TABLE lojas RENAME COLUMN street_number TO numero_endereco;
ALTER TABLE lojas RENAME COLUMN address_complement TO complemento_endereco;
ALTER TABLE lojas RENAME COLUMN neighborhood TO bairro;
ALTER TABLE lojas RENAME COLUMN city TO cidade;
ALTER TABLE lojas RENAME COLUMN state TO estado;
ALTER TABLE lojas RENAME COLUMN zip_code TO cep;
ALTER TABLE lojas RENAME COLUMN qr_code_id TO codigo_qr;
ALTER TABLE lojas RENAME COLUMN geofence_radius TO raio_geolocalizacao;
ALTER TABLE lojas RENAME COLUMN custom_domain TO dominio_personalizado;
ALTER TABLE lojas RENAME COLUMN plan TO plano;
ALTER TABLE lojas RENAME COLUMN user_limit TO limite_usuarios;
ALTER TABLE lojas RENAME COLUMN is_active TO ativo;
ALTER TABLE lojas RENAME COLUMN status TO situacao;
ALTER TABLE lojas RENAME COLUMN session_day TO dia_sessao;
ALTER TABLE lojas RENAME COLUMN periodicity TO periodicidade;
ALTER TABLE lojas RENAME COLUMN session_time TO horario_sessao;
ALTER TABLE lojas RENAME COLUMN technical_contact_name TO nome_contato_tecnico;
ALTER TABLE lojas RENAME COLUMN technical_contact_email TO email_contato_tecnico;
ALTER TABLE lojas RENAME COLUMN document_settings TO configuracoes_documento;
ALTER TABLE lojas RENAME COLUMN created_at TO criado_em;
ALTER TABLE lojas RENAME COLUMN updated_at TO atualizado_em;
ALTER TABLE lojas RENAME COLUMN available_modules TO modulos_disponiveis;
ALTER TABLE lojas RENAME COLUMN previous_settings TO configuracoes_anteriores;
ALTER TABLE lojas RENAME COLUMN auto_schedule_sessions TO agendamento_automatico_sessoes;
ALTER TABLE lojas RENAME COLUMN custom_holidays TO feriados_personalizados;
ALTER TABLE lojas RENAME COLUMN session_weeks TO semanas_sessao;
ALTER TABLE lojas RENAME COLUMN checkin_window_start_minutes TO checkin_janela_inicio_minutos;
ALTER TABLE lojas RENAME COLUMN checkin_window_end_minutes TO checkin_janela_fim_minutos;
ALTER TABLE lojas RENAME COLUMN whatsapp_group_id TO whatsapp_grupo_id;
ALTER TABLE lojas RENAME COLUMN whatsapp_notifications_enabled TO whatsapp_notificacoes_habilitadas;
ALTER TABLE lojas RENAME COLUMN whatsapp_settings TO whatsapp_configuracoes;
ALTER TABLE lojas RENAME COLUMN logo_path TO caminho_logo;
-- cnpj, email, latitude, longitude, regiao: sem tradução necessária (regiao já era PT-BR).

COMMIT;

-- =========================================================================
-- 2.1. Alteração de conteúdo (2026-09-11, decisão explícita do usuário):
-- "REAA" passa a ser o valor canônico do rito Escocês Antigo e Aceito em
-- todo o ecossistema (era "Rito Escocês Antigo e Aceito"), por ser a única
-- sigla de uso corrente/universal entre os ritos maçônicos. Os demais
-- ritos continuam com nome completo. Esta é a ÚNICA alteração de CONTEÚDO
-- de dado desta migração — todo o resto acima é puramente estrutural.
-- ALTER TYPE ... RENAME VALUE atualiza o rótulo do enum e reflete
-- automaticamente em todas as linhas que já usam esse valor, sem precisar
-- de UPDATE. Precisa rodar DEPOIS do RENAME COLUMN acima (a coluna já
-- precisa se chamar "rito", não "rite", mas o tipo enum em si não mudou
-- de nome nesta migração — só o rótulo interno).
-- IMPORTANTE: esta mudança deve ser aplicada junto com o deploy de
-- CoReVM/backend/core/constants.py e Lojas/backend/models/models.py
-- (ambos já atualizados para usar "REAA" como valor) — ver seção 9.7 do
-- contexto de implementação.
-- =========================================================================
BEGIN;
ALTER TYPE riteenum RENAME VALUE 'Rito Escocês Antigo e Aceito' TO 'REAA';
COMMIT;

-- =========================================================================
-- 3. OPCIONAL — cosmético, não obrigatório para o funcionamento:
-- renomear os próprios tipos ENUM do Postgres para PT-BR (os RÓTULOS já
-- estão em português; isso só troca o NOME do tipo, sem afetar dados).
-- Descomente se quiser 100% de aderência ao nome também no catálogo do
-- Postgres (psql \d mostraria "rito_enum" em vez de "riteenum" etc.).
-- =========================================================================
-- BEGIN;
-- ALTER TYPE riteenum RENAME TO rito_enum;
-- ALTER TYPE session_day_enum RENAME TO dia_sessao_enum;
-- ALTER TYPE periodicity_enum RENAME TO periodicidade_enum;
-- ALTER TYPE obediencetypeenum RENAME TO tipo_obediencia_enum;
-- COMMIT;

-- =========================================================================
-- ROLLBACK (caso precise desfazer) — reverte tabela e colunas para os
-- nomes originais em inglês. Não é necessário se a migração acima já
-- rodou com sucesso (RENAME é atômico); guardado aqui só por segurança.
-- =========================================================================
-- BEGIN;
-- ALTER TYPE riteenum RENAME VALUE 'REAA' TO 'Rito Escocês Antigo e Aceito';
-- COMMIT;
-- BEGIN;
-- ALTER TABLE obediencias RENAME COLUMN nome TO name;
-- ALTER TABLE obediencias RENAME COLUMN sigla TO acronym;
-- ALTER TABLE obediencias RENAME COLUMN tipo TO type;
-- ALTER TABLE obediencias RENAME COLUMN obediencia_superior_id TO parent_obedience_id;
-- ALTER TABLE obediencias RENAME COLUMN telefone TO phone;
-- ALTER TABLE obediencias RENAME COLUMN site TO website;
-- ALTER TABLE obediencias RENAME COLUMN logradouro TO street_address;
-- ALTER TABLE obediencias RENAME COLUMN numero_endereco TO street_number;
-- ALTER TABLE obediencias RENAME COLUMN complemento_endereco TO address_complement;
-- ALTER TABLE obediencias RENAME COLUMN bairro TO neighborhood;
-- ALTER TABLE obediencias RENAME COLUMN cidade TO city;
-- ALTER TABLE obediencias RENAME COLUMN estado TO state;
-- ALTER TABLE obediencias RENAME COLUMN cep TO zip_code;
-- ALTER TABLE obediencias RENAME COLUMN nome_contato_tecnico TO technical_contact_name;
-- ALTER TABLE obediencias RENAME COLUMN email_contato_tecnico TO technical_contact_email;
-- ALTER TABLE obediencias RENAME COLUMN criado_em TO created_at;
-- ALTER TABLE obediencias RENAME COLUMN atualizado_em TO updated_at;
-- ALTER TABLE obediencias RENAME COLUMN modulos_disponiveis TO available_modules;
-- ALTER TABLE obediencias RENAME COLUMN configuracoes_anteriores TO previous_settings;
-- ALTER TABLE obediencias RENAME TO obediences;
--
-- ALTER TABLE lojas RENAME COLUMN nome_loja TO lodge_name;
-- ALTER TABLE lojas RENAME COLUMN titulo_loja TO lodge_title;
-- ALTER TABLE lojas RENAME COLUMN codigo_loja TO lodge_code;
-- ALTER TABLE lojas RENAME COLUMN numero_loja TO lodge_number;
-- ALTER TABLE lojas RENAME COLUMN data_fundacao TO foundation_date;
-- ALTER TABLE lojas RENAME COLUMN rito TO rite;
-- ALTER TABLE lojas RENAME COLUMN potencia_id TO obedience_id;
-- ALTER TABLE lojas RENAME COLUMN obediencia_id TO subobedience_id;
-- ALTER TABLE lojas RENAME COLUMN telefone TO phone;
-- ALTER TABLE lojas RENAME COLUMN site TO website;
-- ALTER TABLE lojas RENAME COLUMN logradouro TO street_address;
-- ALTER TABLE lojas RENAME COLUMN numero_endereco TO street_number;
-- ALTER TABLE lojas RENAME COLUMN complemento_endereco TO address_complement;
-- ALTER TABLE lojas RENAME COLUMN bairro TO neighborhood;
-- ALTER TABLE lojas RENAME COLUMN cidade TO city;
-- ALTER TABLE lojas RENAME COLUMN estado TO state;
-- ALTER TABLE lojas RENAME COLUMN cep TO zip_code;
-- ALTER TABLE lojas RENAME COLUMN codigo_qr TO qr_code_id;
-- ALTER TABLE lojas RENAME COLUMN raio_geolocalizacao TO geofence_radius;
-- ALTER TABLE lojas RENAME COLUMN dominio_personalizado TO custom_domain;
-- ALTER TABLE lojas RENAME COLUMN plano TO plan;
-- ALTER TABLE lojas RENAME COLUMN limite_usuarios TO user_limit;
-- ALTER TABLE lojas RENAME COLUMN ativo TO is_active;
-- ALTER TABLE lojas RENAME COLUMN situacao TO status;
-- ALTER TABLE lojas RENAME COLUMN dia_sessao TO session_day;
-- ALTER TABLE lojas RENAME COLUMN periodicidade TO periodicity;
-- ALTER TABLE lojas RENAME COLUMN horario_sessao TO session_time;
-- ALTER TABLE lojas RENAME COLUMN nome_contato_tecnico TO technical_contact_name;
-- ALTER TABLE lojas RENAME COLUMN email_contato_tecnico TO technical_contact_email;
-- ALTER TABLE lojas RENAME COLUMN configuracoes_documento TO document_settings;
-- ALTER TABLE lojas RENAME COLUMN criado_em TO created_at;
-- ALTER TABLE lojas RENAME COLUMN atualizado_em TO updated_at;
-- ALTER TABLE lojas RENAME COLUMN modulos_disponiveis TO available_modules;
-- ALTER TABLE lojas RENAME COLUMN configuracoes_anteriores TO previous_settings;
-- ALTER TABLE lojas RENAME COLUMN agendamento_automatico_sessoes TO auto_schedule_sessions;
-- ALTER TABLE lojas RENAME COLUMN feriados_personalizados TO custom_holidays;
-- ALTER TABLE lojas RENAME COLUMN semanas_sessao TO session_weeks;
-- ALTER TABLE lojas RENAME COLUMN checkin_janela_inicio_minutos TO checkin_window_start_minutes;
-- ALTER TABLE lojas RENAME COLUMN checkin_janela_fim_minutos TO checkin_window_end_minutes;
-- ALTER TABLE lojas RENAME COLUMN whatsapp_grupo_id TO whatsapp_group_id;
-- ALTER TABLE lojas RENAME COLUMN whatsapp_notificacoes_habilitadas TO whatsapp_notifications_enabled;
-- ALTER TABLE lojas RENAME COLUMN whatsapp_configuracoes TO whatsapp_settings;
-- ALTER TABLE lojas RENAME COLUMN caminho_logo TO logo_path;
-- ALTER TABLE lojas RENAME TO lodges;
-- COMMIT;
