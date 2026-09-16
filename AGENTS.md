# AGENTS.md — Regras inegociáveis do CoReVM

> Leia este arquivo ANTES de tocar em qualquer código deste repositório,
> seja você um humano ou um agente de IA (Claude, Copilot, Cursor, Gemini
> ou qualquer outro). Ele existe porque cada regra abaixo já causou um bug
> real em produção pelo menos uma vez. O histórico completo, com o
> raciocínio e a data de cada decisão, está no documento de contexto do
> projeto ("Core" no Claude, ou peça ao time) — este arquivo é só o
> resumo executável.

## 1. Segurança — nunca, em nenhuma circunstância

- **Nunca hardcode senha, token, chave de API ou string de conexão** no código-fonte, nem em texto puro numa conversa/PR/issue. Toda credencial vem de variável de ambiente (`os.getenv`), lida em `database.py`/`.env` — nunca inline. Se você acabou de digitar uma senha ou token em algum lugar que não seja um cofre de segredos, considere-a comprometida e peça a rotação imediatamente.
- **Nunca confie em um header, query param ou body enviado pelo cliente como prova de identidade** (ex.: `X-User-Id`, `role=admin` no payload). Identidade só é válida depois de passar por `Depends(obter_usuario_esigma)` (`backend/core/auth_esigma.py`), que valida contra `GET /api/v1/auth/validate` do e-Sigma. Isso já foi uma vulnerabilidade crítica real (qualquer requisição podia se autodeclarar `superadmin`).
- **No frontend, toda chamada a uma rota protegida usa `clienteHttp`** (de `compartilhado/contextos/AuthContext.tsx`), nunca `axios` puro. `axios` puro não envia o token — já quebrou duas telas diferentes (`PaginaLojas.tsx`, `PainelConselho.tsx`) do mesmo jeito.
- Bypasses de desenvolvimento (`COREVM_PERMITIR_BYPASS_DEV`) nascem **desativados por padrão** e continuam assim. Nunca inverta esse padrão nem habilite em produção.

## 2. Fronteira entre módulos — CoReVM não é dono do banco dos outros

- e-Sigma e Lojas são módulos **separados**, cada um dono do seu próprio banco. O CoReVM é consumidor, não pode "dar um jeitinho" e ler a tabela alheia direto sempre que for mais rápido.
- Hoje ainda existe acesso direto a `lojas_db`/`esigma` em alguns arquivos legados (dívida técnica conhecida, listada em `backend/scripts/verificar_fronteiras_api.py`). Isso está sendo migrado para chamadas de API — **não adicione um arquivo novo a essa lista sem decidir isso conscientemente**. O CI roda esse script e falha se um arquivo novo, fora da lista, importar `get_db_lojas`, `get_db_esigma` ou `models.lojas_models`.
- Se uma feature nova precisa de dado de Loja ou de identidade do e-Sigma, a pergunta certa é "existe (ou deveria existir) uma rota de API para isso?", não "consigo importar o model direto?".

## 3. RBAC — papéis se acumulam, não se substituem

- Um Presidente/Vice/Secretário do Conselho normalmente **também** é Venerável Mestre da própria Loja. São cargos acumuláveis. Qualquer mudança em `core/dependencies.py` precisa preservar isso: `is_diretoria=True` NÃO significa `loja_id=None`.
- Um Suplente designado para a Loja de alguém que também é Diretoria **não herda** os poderes de Diretoria — a suplência substitui só a cadeira da Loja no Conselho.
- Antes de mexer em `get_current_regional_user`, rode `backend/tests/test_rbac_regional.py` — cada teste ali é um bug real que já aconteceu.

## 4. Antes de considerar uma feature pronta

- [ ] Testes Pytest cobrindo o caso novo (principalmente se tocar RBAC, autenticação ou dinheiro/patrimônio).
- [ ] Nenhuma credencial nova hardcoded (rode `gitleaks detect --source . --no-git` localmente se tiver dúvida).
- [ ] Nenhum acesso novo direto a `lojas_db`/`esigma` fora da allowlist (rode `python3 backend/scripts/verificar_fronteiras_api.py`).
- [ ] Frontend usa `clienteHttp` em toda chamada autenticada; erros 422 tratados com `extrairMensagemErro` (não renderizar `detail` bruto).
- [ ] Enums/valores fixos em `backend/core/constants.py`, nunca texto livre.
- [ ] Comentários e nomenclatura em pt-BR.
- [ ] Commit com mensagem descritiva ao final da sessão.

O CI (`.github/workflows/deploy.yml`) já automatiza a checagem de segredos e de fronteira de API antes do deploy — se ele falhar, é porque uma dessas regras foi violada, não é um falso positivo para ignorar.
