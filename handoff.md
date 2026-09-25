# handoff.md — CoReVM

## 1. Contexto Atual (Sessão 2026-09-24)
Nesta sessão foi realizada uma grande evolução arquitetural e funcional no ecossistema CoReVM:
- **Proposta 3 (SSO & Autenticação Multi-Domínio)**:
  - Integração do frontend com `/api/v1/auth/sso/session` via `withCredentials: true` e cookie HttpOnly `sigma_sso_token`.
  - Remoção de instâncias isoladas de `axios` puro, assegurando 100% de uso de `clienteHttp`.
- **Proposta 4 (Decomposição do Monólito & Eliminação de Dívida Técnica)**:
  - O antigo monólito `api/v1/regional/rotas.py` (5.033 linhas) foi decomposto em 5 submódulos modulares em `api/v1/regional/`:
    1. `rotas_governanca.py`: Dashboard, `/me`, `/minhas-regioes`, seletor de VM, atualização e emergência da Diretoria, discrepâncias e reconciliação.
    2. `rotas_lojas_agregadas.py`: Lojas jurisdicionadas, oficiais da loja, suplência, operadores administrativos e transmissão emergencial de cargo.
    3. `rotas_comunicacao_agenda.py`: Mural de avisos, calendário de eventos da agenda e correspondência interna (pranchas).
    4. `rotas_patrimonio_documentos.py`: Gestão de patrimônio, termos de cautela/empréstimo, repositório de documentos e relatórios executivos (com exportação PDF).
    5. `rotas_admissoes_votacoes.py`: Prévias de admissão (iniciação/filiação/regularização), pareceres/considerações e deliberações/votações com apuração de quórum.
  - Eliminação completa de acessos diretos a `lojas_db`/`lojas_models` em todas essas rotas, migrando 100% para o cliente HTTP `LojasApiClient` (`core/lojas_cliente.py`).
  - Remoção de `api/v1/regional/rotas.py` da `ALLOWLIST` em `backend/scripts/verificar_fronteiras_api.py`.
  - Script `verificar_fronteiras_api.py` executando com 0 violações.
- **Proposta 5 (Tempo Real & Auditoria de Governança)**:
  - Criado barramento de eventos em tempo real (`core/eventos_tempo_real.py`) com endpoint SSE `GET /api/v1/regional/{regiao_id}/eventos/stream`.
  - Criada a tabela e modelo `RegistroAuditoriaRegional` (`models/models.py`) e serviço `registrar_auditoria` (`core/auditoria_service.py`), com emissão simultânea no canal SSE.
  - Instrumentação de ações críticas (troca de diretoria, transmissão emergencial, posse, suplência, operador administrativo, avisos, eventos na agenda).
  - Rota `GET /api/v1/regional/{regiao_id}/auditoria` para consulta paginada da Mesa Diretora e SuperAdmin.
- **Testes & Estabilidade**:
  - `pytest tests/test_rbac_regional.py tests/test_golden_rules.py tests/test_auditoria_sse.py`: 11 aprovados em 0.58s.
  - Roteador regional carrega 78 rotas ativas.
  - Frontend compila com `npm run build` sem erros.

## 2. Atualizações da Sessão (2026-09-25)
- **Design System Soberano (Glassmorphism Deep Blue Glass + Ouro)**:
  - Fundo Abissal (`#050508`), cards `.card-deep-blue-glass` com backdrop blur e bordas douradas translúcidas.
  - Botões no formato pill com aro chanfrado metálico em ouro (`.btn-masonic-pill .btn-pill-blue`).
  - Favicon em ouro maçônico e `favicon.ico` gerado com cache-busting `?v=3`.
- **Tela de Login Padronizada (`PaginaLogin.tsx`)**:
  - Clonagem visual fiel da tela de login do `e-sigma.app`.
  - Integração do canvas `HeroBackground`, card `.card-deep-blue-glass`, `LogoAnimadaCore` oficial animada (100x90).
  - Título "Acesso Restrito" em gradiente dourado (`#FDE68A` -> `#DDB96B` -> `#B8862D`).
  - Inputs com alternância de visualização da senha (olhinho), "Lembrar-me", link "Esqueci a senha", botão `.btn-masonic-pill .btn-pill-blue` "Entrar", divisor "ou" e Google Login.
  - Preservação de 100% da regra de login com e-Sigma IdP, detecção de regiões do Conselho Regional e redirecionamento.
- **Deploy Automático na VPS**:
  - Validado via GitHub Actions em `https://core.e-sigma.app` respondendo HTTP 200 com bundle JS/CSS novo ativo.

## 3. Problemas Pendentes / O que fazer na próxima sessão
1. **Frontend do CoReVM**:
   - Conectar o hook EventSource ao endpoint `/api/v1/regional/{regiao_id}/eventos/stream` para atualizar o mural de avisos e agenda sem necessidade de reload.
   - Criar tela/aba no painel da Diretoria para visualização da Trilha de Auditoria (`GET /api/v1/regional/{regiao_id}/auditoria`).
2. **Propostas Restantes (1 e 2)**:
   - Proposta 1: Unificação de Cadastros e Ficha Maçônica Única.
   - Proposta 2: Módulo Financeiro Regional e Prestação de Contas.

## 4. Observações Importantes
- **Fronteiras de API**: Nenhum arquivo novo pode importar `get_db_lojas` ou `models.lojas_models`. Toda consulta ao Lojas deve passar por `LojasApiClient`.
- **RBAC**: Qualquer alteração em RBAC deve rodar `pytest tests/test_rbac_regional.py` para preservar a regra inegociável de acúmulo de cargos da Diretoria.
