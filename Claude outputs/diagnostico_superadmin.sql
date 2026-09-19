-- Diagnóstico de login do superadmin sistema@e-sigma.app
-- Rodar contra o banco "esigma" no servidor 69.62.89.211:
--   psql -d esigma -f diagnostico_superadmin.sql
--
-- Não altera nada — é só leitura, seguro de rodar em produção.

-- 1. A pessoa existe? Busca com ILIKE para pegar variações de
--    maiúscula/minúscula ou espaço (o backend faz busca EXATA por e-mail,
--    então qualquer diferença aqui já explicaria o login falhar).
SELECT
    id,
    email,
    length(email) AS tamanho_email,          -- ajuda a flagrar espaço invisível no fim
    nome_completo,
    status_acesso,
    senha_hash IS NOT NULL AS tem_senha_hash,
    left(senha_hash, 7) AS prefixo_hash,      -- bcrypt começa com $2b$ / $2a$ etc. — não expõe a senha
    dados_civis -> 'permissoes_sistema' AS permissoes_sistema,
    ultimo_login,
    criado_em
FROM pessoas
WHERE email ILIKE '%sistema@e-sigma.app%';

-- 2. Quantas pessoas têm 'super_admin' nas permissões, no total?
--    (para confirmar se existe ALGUM superadmin funcional, ou se o
--    problema é mais amplo do que só esta conta)
SELECT id, email, status_acesso, senha_hash IS NOT NULL AS tem_senha_hash
FROM pessoas
WHERE dados_civis -> 'permissoes_sistema' @> '["super_admin"]'::jsonb;
