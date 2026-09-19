# Relatório de Implementações — Sessão CoReVM (2026-09-15)

Este documento consolida, em ordem cronológica, tudo o que foi discutido, decidido e implementado nesta conversa sobre o sistema CoReVM (Conselho Regional de Veneráveis Mestres). Serve como registro técnico de referência — o documento de decisão vivo continua sendo `claude/decisao-controle-acesso-cadastro.md` e `claude/decisao-resiliencia-core-semiautonomo.md` no Project "Core"; este relatório é um resumo narrativo e técnico do que foi feito, para consulta rápida.

---

## 1. Correção de elegibilidade do Suplente do Conselho

**Pedido do usuário:** o Suplente do Conselho deveria poder ser não só um dos 6 oficiais eletivos da Loja, mas também qualquer membro com status de **Mestre Instalado** ativo na Loja — necessário para dar flexibilidade aos Veneráveis Mestres na hora de escolher quem os representa no Conselho.

**O que foi implementado:**
- Nova função auxiliar `_obreiro_e_mestre_instalado_ativo_na_loja(db_lojas, obreiro_id, loja_id)` — verifica, via SQL bruto (`SELECT grau FROM obreiros WHERE id = :id`, sem mapear ORM, para não replicar o ENUM do Postgres), se o `grau` do Obreiro é `"Mestre Instalado"` e se ele tem vínculo ativo (`ObreiroLojaAssociacao.status == "Ativo"`) com aquela Loja.
- A checagem de elegibilidade de Suplente (`designar_suplente_conselho`, em `api/v1/regional/rotas.py`) passou a aceitar: mandato ativo num dos 6 cargos eletivos (`CARGOS_SUPLENTE_ELEGIVEIS`, cargo_id 2–7) **OU** status de Mestre Instalado com vínculo ativo.
- A reconciliação semanal (`core/reconciliacao_diretoria_lojas.py`) foi ajustada da mesma forma, para não marcar como divergente um Suplente que só é elegível pela via Mestre Instalado.
- A mesma função foi duplicada (padrão já usado no projeto para evitar import circular) em `regional/rotas.py`, `core/reconciliacao_diretoria_lojas.py` e, depois, em `core/dependencies.py` — usada também na elegibilidade do Operador Administrativo (seção 4 abaixo).

**Documentação:** seção de correção adicionada a `claude/decisao-resiliencia-core-semiautonomo.md` e itens de teste adicionados a `claude/roteiro-testes-conselho-ceres.md`.

---

## 2. Parecer técnico: Política de controle de acesso e cadastro aprimorada

O usuário trouxe uma proposta de três formas de entrada de uma pessoa no ecossistema, pedindo parecer de engenharia. As três vias, com o parecer dado:

### Via 1 — Reconhecimento por CIM/CPF/e-mail
Já é o padrão existente (`GET /auth/validate` do e-Sigma + `_resolver_pessoa_por_identificador`). Sem mudança de arquitetura necessária.

### Via 2 — Cadastro inicial via formulário de inscrição (não implementado ainda)
Fluxo de "primeiro acesso": formulário com Potência, Loja, CIM, CPF, e-mail, nome, telefone, cargo e data de início → validação humana (SuperAdmin/Diretoria/VM) → aprovação gera cadastro em Lojas + credencial via e-Sigma.

Pontos centrais do parecer:
- É o **primeiro endpoint de escrita não autenticado** do ecossistema — exige rate limiting e não pode revelar se um CPF/CIM já existe (enumeration attack).
- **Fila única de inscrições pendentes**, hospedada no módulo Lojas (dono de `Obreiro`/`Mandato`), nunca duplicada em `core_db`.
- **Validação cruzada Potência↔Loja sem busca dinâmica é intencional** (confirmado pelo usuário) — funciona como filtro anti-curioso barato: quem é membro legítimo sabe de cor sua Potência/Loja. Três motivos de falha tratados diferente: Potência inexistente (rejeição dura), Loja inexistente (rejeição dura), Loja que existe mas não pertence à Potência informada (mantém registro com status interno para análise agregada de fraude, sem UX de rejeição imediata — pode ser dado legado divergente, não necessariamente fraude).
- Emissão de credencial/senha temporária deve ser feita **pelo e-Sigma** (único IdP do ecossistema), nunca por Core ou Lojas diretamente.
- Aprovação em modelo "primeiro que agir vale" com lock otimista (`if_version`).

**Status:** decisão de arquitetura registrada, nenhum código escrito ainda.

### Via 3 — Cadastro pelo Venerável Mestre no Core (não implementado ainda)
Parecer: **não** replicar o padrão de "grava no core_db e espera a reconciliação semanal" (isso trataria uma posse de cargo rotineira como um `OVERRIDE_CONSELHO`, criando até 7 dias de inconsistência). Recomendação: chamada **síncrona** à API já existente do módulo Lojas (`POST /api/v1/lojas/{loja_id}/mandatos`), que já existe desde a entrega da transmissão de cargo de VM. A reconciliação semanal continua como rede de segurança para drift, não como mecanismo primário.

**Status:** decisão de arquitetura registrada, nenhum código escrito ainda.

---

## 3. Novo perfil: Operador Administrativo da Loja — desenho

Proposta complementar do usuário: um perfil de acesso puramente administrativo para o Chanceler/Secretário (ou quem o VM designar), escopado à própria Loja, sem visão de outras Lojas e sem poder de decisão política.

Pontos fechados na discussão:
- **Diferença em relação ao Suplente:** o Suplente tem, na prática, as mesmas permissões do VM dentro do Conselho. O Operador Administrativo só vê/age no contexto da própria Loja.
- **Slot duplo (`SECRETARIO` / `CHANCELER`)**, independentes — evita ponto único de falha operacional.
- Confirmado por consulta direta ao banco (`verificar_cargos.py`, rodado pelo usuário): **não existem** cargos formais de "Secretário Adjunto" ou "Chanceler Adjunto" em `lojas_db` (21 cargos reais, de Venerável Mestre a Cobridor Externo). Isso descartou modelar por `cargo_id` de adjunto — os slots são rótulos organizacionais, não cargos formais.
- Elegibilidade: mesma lista do Suplente (cargo_id 2–7) + Mestre Instalado com vínculo ativo.
- Quem designa: VM da própria Loja ou Diretoria do Conselho.
- Fora do escopo do perfil: designar/trocar Suplente, acionar transmissão de cargo emergencial — permanecem exclusivos de VM/Diretoria (decisões políticas).
- Revalidação do vínculo em **tempo real**, a cada requisição (diferente de VM/Suplente, revalidados só na reconciliação semanal).

---

## 4. Implementação do Operador Administrativo da Loja

**`models/models.py`** — novo model `OperadorAdministrativoLoja` (tabela `operadores_administrativos_loja`): `loja_id`, `slot` (`SECRETARIO`|`CHANCELER`), `usuario_id`, `nome_operador`, `email_operador`, `ativo`, `designado_por`, `designado_em`.

**`core/dependencies.py`**:
- `OperadorAdministrativoContext` — identidade deliberadamente mais restrita que `RegionalUserContext`: sem `regiao_id`, sem qualquer noção de acesso alem da própria Loja (`usuario_id`, `loja_id`, `slot`, `nome`, `role="OPERADOR_ADMINISTRATIVO"`, `is_diretoria=False`).
- `_operador_administrativo_ainda_elegivel(db_lojas, identificador, loja_id)` — revalida em tempo real (mandato ativo num dos 6 cargos eletivos, ou Mestre Instalado com vínculo ativo).
- `obter_operador_administrativo_da_loja(loja_id, ...)` — resolve a identidade quando a rota já conhece a Loja de antemão (usado nas rotas de designação).

**Decisão de design importante:** este perfil **não** foi encaixado como mais um caso dentro de `get_current_regional_user`, porque aquela função resolve identidade para rotas de âmbito regional que não filtram por Loja — se o Operador Administrativo ganhasse um `RegionalUserContext` normal, passaria a enxergar qualquer rota "aberta a qualquer membro autenticado do Conselho", exatamente o vazamento entre Lojas que o perfil existe para evitar.

**`api/v1/regional/rotas.py`** — três rotas novas de designação:
- `GET /{regiao_id}/lojas/{loja_id}/operadores-administrativos` — lista o estado dos dois slots.
- `PUT /{regiao_id}/lojas/{loja_id}/operador-administrativo/{slot}` — designa (exige VM da Loja ou Diretoria).
- `DELETE /{regiao_id}/lojas/{loja_id}/operador-administrativo/{slot}` — remove a designação.

**Migração:** `migracao_operador_administrativo_loja.sql` (tabela + `UNIQUE(loja_id, slot)` + `CHECK` de slot + 2 índices) e `rodar_migracao_operador_administrativo_loja.py` — **rodada com sucesso pelo usuário**.

---

## 5. Triagem dos módulos administrativos para delegação

Depois da implementação inicial (que só cobria a *designação* de quem ocupa cada slot, não o *uso* do acesso em nenhuma rota administrativa), foi feita uma triagem lendo a implementação real de cada módulo candidato, para saber quais já isolam dado por Loja e quais são murais/mecanismos inter-Loja por desenho:

| Módulo | Leitura hoje | Conclusão |
|---|---|---|
| **Documentos** | Filtra por `visibilidade == PUBLICO_CONSELHO OR loja_emissora_id == user.loja_id` | Isolamento já existia — seguro para delegar sem mudança |
| **Comunicação** | "Regra de Ouro do Sigilo Maçônico" já no código: só `CIRCULAR` ou tópicos da própria Loja | Isolamento já existia — seguro para delegar sem mudança |
| **Avisos** | Sem filtro de Loja — mural region-wide, conteúdo não sigiloso | Seguro para delegar leitura sem restrição; escrita trava por Loja |
| **Admissões** | Sem filtro de Loja — peer review entre Lojas, carrega dado pessoal de candidato | Delegar só com leitura restrita à própria Loja e sem acesso a "considerações" (parecer político) |
| **Patrimônio** | Sem filtro de Loja — mercado de empréstimo inter-Loja por desenho | **Fora do escopo desta rodada** — abrir exporia inventário/fila de outras Lojas sem necessidade demonstrada |

O usuário pediu explicitamente para viabilizar Avisos, Admissões e um módulo novo de Agenda, por serem necessidades centrais do papel — Patrimônio ficou de fora por não ter a mesma justificativa e por ser estruturalmente inter-Loja.

---

## 6. Resolvedor combinado de identidade

**`core/dependencies.py`** — refatoração e adição:
- `_resolver_regional_user_ou_none(regiao_id, usuario, db_core, db_lojas)` — núcleo de resolução extraído de `get_current_regional_user`, devolvendo `None` em vez de levantar 403 quando não encontra vínculo (SuperAdmin/Diretoria/Suplente/VM).
- `get_current_regional_user` foi reescrita para chamar esse núcleo e levantar exatamente as mesmas mensagens de erro de antes — **sem mudança de comportamento** para os papéis já existentes.
- `obter_identidade_regional_ou_operador_administrativo(regiao_id, ...)` — resolvedor novo: tenta primeiro o caminho normal; só cai para Operador Administrativo se nenhum papel regional bater, e só aceita a designação se a Loja do operador pertencer às Lojas agregadas àquela região (nunca aceita operador de Loja de outro Conselho).

Esse resolvedor foi plugado seletivamente, rota a rota, nos módulos abaixo.

---

## 7. Retrofit de Avisos

**Rotas afetadas:** `GET/POST/PUT/DELETE /{regiao_id}/avisos`.

- Leitura: sem restrição adicional — Operador Administrativo vê o mesmo mural que qualquer outro papel.
- Criação: `loja_id` do aviso sempre travado na própria Loja de quem publica; `autor_cargo` passa a registrar `"Operador Administrativo (Secretario)"` ou `"(Chanceler)"` para essa identidade, em vez do `role` genérico.
- Edição/exclusão: a checagem de posse já existente (`user.loja_id == aviso.loja_id` ou autoria) já era compatível por duck-typing — só precisou trocar a dependência de identidade.
- `fixado` continua exclusivo de Diretoria/SuperAdmin (Operador Administrativo nunca fixa aviso).

---

## 8. Retrofit de Admissões

**Rotas afetadas:** `GET /{regiao_id}/admissoes`, `PUT .../status`, `POST .../upload`, `POST /admissoes`, `GET .../consideracoes`, `DELETE /{previa_id}`.

- **Leitura restrita à própria Loja** para esse perfil (diferente de VM/Suplente/Diretoria, que continuam vendo todas as Lojas da região — é assim que o parecer entre Lojas funciona).
- `pode_considerar` sempre `false` na resposta para esse perfil — a "consideração"/parecer é decisão política, fora do escopo do papel.
- Criação de prévia (upload e via JSON): rejeitada com 403 se o `loja_id` do payload não for a própria Loja do operador.
- Atualização de status: rejeitada com 403 se a prévia não for da própria Loja; `verificado_por_nome` passa a registrar `"Operador Administrativo (Secretario) da Loja X"`.
- Leitura de considerações: rejeitada com 403 se a prévia não for da própria Loja.
- Exclusão/arquivamento de prévia: já funcionava por duck-typing (checagem de posse existente).
- **Deliberadamente não plugado:** `POST .../consideracoes` (adicionar parecer) e `DELETE .../consideracoes/{id}` — continuam só em `get_current_regional_user`, ou seja, o Operador Administrativo recebe 403 antes de chegar à lógica da rota. Ele nunca deve emitir ou remover um parecer.

---

## 9. Retrofit de Documentos

**Rotas afetadas:** `GET/POST/POST upload/PUT/DELETE /{regiao_id}/documentos...`.

- O isolamento por `loja_emissora_id`/`visibilidade` já existia e cobriu o caso sozinho — só foi preciso trocar a dependência.
- Publicação (`POST` e `POST /upload`) tipo `LOJA`: rejeitada com 403 se `loja_emissora_id` não for a própria Loja do operador.
- `autor_cargo` passa a registrar `"Operador Administrativo (Secretario)"` quando aplicável.
- Publicação tipo `CONSELHO`: já era exclusiva de Diretoria/SuperAdmin, continua bloqueada para esse perfil.

---

## 10. Retrofit de Comunicação

**Rotas afetadas:** `GET listar tópicos`, `POST criar tópico`, `GET detalhe do tópico`, `POST mensagem`, `POST upload de anexo`, `PUT status do tópico`.

- A "Regra de Ouro do Sigilo Maçônico" já existente cobriu leitura e resposta sem mudança de lógica.
- Criação de tópico `CIRCULAR`: continua exclusiva de Diretoria/SuperAdmin.
- Criação de tópico: para o Operador Administrativo, `loja_origem_id` é sempre travado na própria Loja — nunca aceito do payload.
- Alteração de status do tópico: nova restrição — o Operador Administrativo só pode alterar status de tópico que envolva a própria Loja (origem ou destino); esta é uma restrição nova mesmo para o padrão existente, já que antes nenhum papel tinha essa checagem de posse na rota de status.
- **Deliberadamente não plugado:** `GET /comunicacao/mensagens/{id}/pdf` (exportação de certidão) e as rotas de estatísticas — não foram reavaliadas.

---

## 11. Módulo novo: Agenda do Conselho

Não existia módulo de calendário/eventos no backend antes desta sessão — foi desenhado e implementado do zero, a partir de decisões fechadas com o usuário via perguntas diretas:

- **Leitura:** sempre region-wide (mural, mesmo padrão de Avisos) — decisão explícita do usuário, diferente do padrão de isolamento usado em Documentos/Comunicação.
- **Escrita:** aberta a VM, Suplente, Diretoria, SuperAdmin **e também ao Operador Administrativo** — esta foi a necessidade que motivou o módulo inteiro (Secretário/Chanceler cadastrando a agenda da própria Loja sem depender do VM). `loja_organizadora_id` sempre travado na Loja de quem cria.
- **Integração com Admissões:** campo opcional `previa_admissao_id` — vincula um evento (ex.: Iniciação) à prévia que o originou. Se quem cria for Operador Administrativo, só aceita prévia da própria Loja.
- **Integração com Avisos:** flag `gerar_aviso` — se `true`, cria automaticamente um `AvisoRegional` (nível MEDIO, não fixado) como lembrete, com referência cruzada gravada em `aviso_gerado_id`.

**`models/models.py`** — novo model `EventoAgenda` (tabela `eventos_agenda`): `regiao_id`, `titulo`, `descricao`, `tipo` (SESSAO/REUNIAO/VISITA/ADMINISTRATIVO/INICIACAO/OUTRO), `data_inicio`, `data_fim`, `loja_organizadora_id/nome/numero`, `criado_por_id/nome/tipo`, `previa_admissao_id` (FK), `aviso_gerado_id` (FK), `status` (AGENDADO/REALIZADO/CANCELADO), `criado_em`, `atualizado_em`.

**`api/v1/regional/rotas.py`** — novo "MÓDULO 11: AGENDA DO CONSELHO":
- `GET /{regiao_id}/agenda/eventos` — lista com filtros de `tipo`, `loja_id`, `status`, período (`data_de`/`data_ate`).
- `POST /{regiao_id}/agenda/eventos` — cria, valida `tipo`, valida e trava `previa_admissao_id`, trava `loja_organizadora_id`, aplica a lógica de `gerar_aviso`.
- `PUT /{regiao_id}/agenda/eventos/{evento_id}` — edita (mesma checagem de posse usada em Avisos/Documentos).
- `DELETE /{regiao_id}/agenda/eventos/{evento_id}` — soft-cancel (`status = CANCELADO`) por padrão; hard delete físico exclusivo de SuperAdmin.

**Migração:** `migracao_eventos_agenda.sql` (tabela + 2 `CHECK` de enum + 3 índices) e `rodar_migracao_eventos_agenda.py`.

---

## 12. Estado atual e pendências

**Rodado com sucesso pelo usuário:** migração do Operador Administrativo (`operadores_administrativos_loja`).

**Ainda pendente de rodar pelo usuário:**
```
cd CoReVM\backend
python rodar_migracao_eventos_agenda.py
```

**Verificação feita:** só `python3 -m py_compile` (sintaxe) em `models/models.py`, `core/dependencies.py` e `api/v1/regional/rotas.py` — `device_bash` (shell remoto na máquina do usuário) permaneceu indisponível durante toda a sessão (problema conhecido do Windows Update de 8/9). Todos os arquivos foram entregues via `device_commit_files` (transferência de arquivo, que continuou funcionando).

**Nenhum teste funcional foi feito ainda** para nenhuma parte desta sessão — nem para a extensão do Suplente (Mestre Instalado), nem para o retrofit dos módulos administrativos, nem para o módulo Agenda.

**Itens que permanecem só como decisão de arquitetura, sem código:**
- Via 2 (formulário de inscrição pública com validação cruzada Potência/Loja).
- Via 3 como chamada síncrona à API do Lojas.
- Rota de provisionamento de credencial no e-Sigma.
- Decisão sobre expandir a reconciliação semanal para cadastro geral de Obreiro (hoje restrita a VM/Suplente).

**Documentos de referência no Project "Core":**
- `claude/decisao-controle-acesso-cadastro.md` — decisão completa, com a seção 9 detalhando o retrofit e a Agenda.
- `claude/decisao-resiliencia-core-semiautonomo.md` — correção do Suplente/Mestre Instalado.
- `claude/roteiro-testes-conselho-ceres.md` — itens de teste atualizados para a extensão do Suplente (o retrofit dos módulos administrativos e a Agenda ainda não têm itens de teste no roteiro — próximo passo natural, se desejado).
