-- EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
-- Remoção de colunas operacionais desnecessárias de lista_de_lojas_db
-- (decisão do usuário, 2026-09-11 — segunda migração, separada da de
-- nomenclatura em migracao_lista_de_lojas_pt_br.sql).
--
-- CRÍTICO — LER ANTES DE RODAR:
-- 1. Só rode isto DEPOIS de confirmar que migracao_lista_de_lojas_pt_br.sql
--    já rodou com sucesso em produção (este script usa os nomes de coluna
--    NOVOS, em PT-BR — ex.: "situacao", não "status").
-- 2. Esta operação é DESTRUTIVA E IRREVERSÍVEL: DROP COLUMN apaga os dados
--    dessas colunas permanentemente. Algumas colunas abaixo têm valores
--    reais preenchidos (ex.: checkin_janela_inicio_minutos, ativo,
--    whatsapp_notificacoes_habilitadas eram NOT NULL na inspeção original —
--    ou seja, têm valor em toda linha, não são todas NULL). Faça um NOVO
--    backup específico DEPOIS da migração de nomenclatura e ANTES desta,
--    mesmo já tendo um backup anterior.
-- 3. Recomendo rodar primeiro contra uma cópia de teste, e confirmar que
--    nada no código (CoReVM, Lojas, e-Sigma) lê essas colunas — na
--    inspeção do código do CoReVM (rotas_lojas.py e demais arquivos lidos
--    nesta conversa), NENHUMA dessas colunas é referenciada; não
--    inspecionei o repositório completo de Lojas nem de e-Sigma em busca
--    de outras leituras de lista_de_lojas_db, então vale uma checagem sua
--    antes de rodar em produção.
--
-- CRITÉRIO usado para separar "fica" de "sai": lista_de_lojas_db existe
-- para garantir integridade de NOMENCLATURA/IDENTIDADE de Loja (seção 1.9
-- do contexto de implementação) — dados que ajudam a identificar/
-- desambiguar uma Loja real (nome, número, título, rito, potência,
-- localização, contato institucional, CNPJ) permanecem. Dados que
-- pertencem a funcionalidades operacionais de outros módulos do
-- ecossistema (seção 1.1: SaaS/assinatura = e-Sigma; sessões/agendamento/
-- check-in = Lojas; WhatsApp/comunicação = módulo de Comunicação) saem.

BEGIN;

-- ===== Tabela "lojas" (ex-"lodges") =====

-- SaaS / e-Sigma (assinatura, domínio, plano, módulos habilitados) — não é
-- papel de um banco de referência de nomenclatura decidir isso.
ALTER TABLE lojas DROP COLUMN IF EXISTS dominio_personalizado;
ALTER TABLE lojas DROP COLUMN IF EXISTS plano;
ALTER TABLE lojas DROP COLUMN IF EXISTS limite_usuarios;
ALTER TABLE lojas DROP COLUMN IF EXISTS modulos_disponiveis;
ALTER TABLE lojas DROP COLUMN IF EXISTS configuracoes_anteriores;

-- Presença / check-in (escopo do módulo Lojas ou de um futuro módulo de
-- Presença, não da referência de nomenclatura).
ALTER TABLE lojas DROP COLUMN IF EXISTS codigo_qr;
ALTER TABLE lojas DROP COLUMN IF EXISTS raio_geolocalizacao;
ALTER TABLE lojas DROP COLUMN IF EXISTS checkin_janela_inicio_minutos;
ALTER TABLE lojas DROP COLUMN IF EXISTS checkin_janela_fim_minutos;

-- Agendamento de sessões (escopo do módulo Lojas, seção 1.1 — "gerenciamento
-- de sessões" é explicitamente atribuído ao Lojas, não ao banco de referência).
ALTER TABLE lojas DROP COLUMN IF EXISTS dia_sessao;
ALTER TABLE lojas DROP COLUMN IF EXISTS periodicidade;
ALTER TABLE lojas DROP COLUMN IF EXISTS horario_sessao;
ALTER TABLE lojas DROP COLUMN IF EXISTS agendamento_automatico_sessoes;
ALTER TABLE lojas DROP COLUMN IF EXISTS feriados_personalizados;
ALTER TABLE lojas DROP COLUMN IF EXISTS semanas_sessao;

-- Comunicação / WhatsApp (escopo de um módulo de Comunicação próprio).
ALTER TABLE lojas DROP COLUMN IF EXISTS whatsapp_grupo_id;
ALTER TABLE lojas DROP COLUMN IF EXISTS whatsapp_notificacoes_habilitadas;
ALTER TABLE lojas DROP COLUMN IF EXISTS whatsapp_configuracoes;

-- Documentos (escopo do submódulo Documentos do CoReVM / futuro módulo próprio).
ALTER TABLE lojas DROP COLUMN IF EXISTS configuracoes_documento;

-- Identidade visual / branding (escopo do TenantStorageService do e-Sigma).
ALTER TABLE lojas DROP COLUMN IF EXISTS caminho_logo;

-- Coluna "situacao" (status): 100% NULL em todas as 270 linhas na inspeção
-- original — não usada, redundante com a coluna "ativo" (boolean, essa sim
-- preenchida e mantida).
ALTER TABLE lojas DROP COLUMN IF EXISTS situacao;

-- Contato técnico/webmaster: conceito de e-Sigma (webmaster por organização),
-- não de identidade da Loja em si.
ALTER TABLE lojas DROP COLUMN IF EXISTS nome_contato_tecnico;
ALTER TABLE lojas DROP COLUMN IF EXISTS email_contato_tecnico;

-- ===== Tabela "obediencias" (ex-"obediences") =====
ALTER TABLE obediencias DROP COLUMN IF EXISTS modulos_disponiveis;
ALTER TABLE obediencias DROP COLUMN IF EXISTS configuracoes_anteriores;
ALTER TABLE obediencias DROP COLUMN IF EXISTS nome_contato_tecnico;
ALTER TABLE obediencias DROP COLUMN IF EXISTS email_contato_tecnico;

COMMIT;

-- =========================================================================
-- O QUE FICA (proposital, não removido) e por quê:
-- lojas: id, nome_loja, titulo_loja, codigo_loja, numero_loja,
--        data_fundacao, rito, obediencia_id, subobediencia_id, cnpj, email,
--        telefone, site, logradouro, numero_endereco, complemento_endereco,
--        bairro, cidade, estado, cep, latitude, longitude, ativo,
--        criado_em, atualizado_em, regiao.
--   -> tudo aqui ajuda a identificar/desambiguar uma Loja real (nome,
--      número, rito, potência, localização, contato institucional, CNPJ) —
--      exatamente o papel de "livro de consultas" de nomenclatura.
-- obediencias: id, nome, sigla, tipo, obediencia_superior_id, cnpj, email,
--              telefone, site, logradouro, numero_endereco,
--              complemento_endereco, bairro, cidade, estado, cep,
--              criado_em, atualizado_em.
--
-- Se algo aqui devia sair também (ou algo que removi devia ficar), me avise
-- antes de rodar — é mais fácil ajustar a lista agora do que depois do DROP.
--
-- ROLLBACK: não existe rollback estrutural para DROP COLUMN além de
-- restaurar o backup completo do banco. Por isso o aviso no topo do
-- arquivo sobre tirar um backup novo, específico, antes de rodar este script.
-- =========================================================================
