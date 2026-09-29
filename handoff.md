# Handoff: Contexto e Estado Atual do Projeto CoReVM

**Última Atualização:** 29 de Setembro de 2026

## 📌 Contexto Atual
Na sessão mais recente, conduzimos uma **Revolução UI** no frontend do CoReVM, focada em melhorar a ergonomia, a experiência mobile e padronizar o modelo mental do usuário. Abandonamos as navegações baseadas em "abas ocultas" e implementamos a **Arquitetura Master-Detail (Catálogo + Drawer)** nos principais módulos operacionais.

## ✅ O que foi realizado
- **Agenda do Conselho:** Unificação dos filtros em uma barra única no desktop e quebra inteligente (em duas linhas) no mobile, resolvendo problemas de "fat-finger". A legenda de cores foi transformada em um acordeão.
- **Patrimônio:** Estrutura de abas removida. Catálogo mestre implementado com as métricas no topo. Ações e histórico de empréstimo passaram para a ficha do ativo (Drawer lateral).
- **Enquetes e Votações:** Unificação de votações ativas, encerradas e apurações em um grid. Drawer injetado para visualização de resultados e emissão de voto de forma contextualizada.
- **Mesa Diretora:** Cards dos diretores tornaram-se botões interagíveis, com ficha completa no painel lateral exibindo mandatos e alertas gerenciais.
- **Documentos:** Implementação de visualizador e metadados via painel lateral com histórico de cliques integrado.
- **Painel do Conselho (Mural):** Inseridas abas (Tabs) nativas exclusivamente para o mobile para alternar entre "Avisos" e "Notificações", evitando que módulos fiquem ocultos verticalmente.
- **Lojas:** Correções cirúrgicas de respiro visual na barra de busca e refinamento do botão de adicionar.

*Observação Técnica:* Todas as refatorações preservaram estritamente o `clienteHttp` (Auth E-Sigma), os hooks de validação e compilaram perfeitamente sob o `TypeScript strict`.

## 🚧 Problemas Pendentes / Próximos Passos (Próxima Sessão)
1. **Auditoria Visual no Mobile:** Recomenda-se que o usuário navegue pelos Drawers recém-criados usando dispositivos móveis para confirmar se os overlays, scrolls (overflow) e botões fixos nos rodapés (`z-index`) estão confortáveis.
2. **Propagação de Padrão:** Avaliar se módulos similares nos outros sistemas do ecossistema (ex: repositório `Lojas` ou `Harmonia`) devem receber esse mesmo upgrade de UI/Master-Detail, respeitando o "clone visual" do legado quando estritamente solicitado.
3. **Revisão de Dívidas Técnicas (`backend`):** A verificação de fronteiras (scripts Python na pasta `backend/scripts`) deve continuar rodando em CI. Nenhuma query nativa no backend do CoReVM cruzou a linha para os bancos `lojas_db` e `esigma` nessas atualizações recentes. Manter essa vigilância ativa.

> **Nota para o Agente:** Ao iniciar uma nova sessão, mantenha em mente que as Regras de Negócio (AGENTS.md / GEMINI.md) são inegociáveis. Erros 422 precisam de parser extraído e nunca expostos crus ao usuário. Credenciais são expressamente proibidas no frontend.
