# Diretrizes de Arquitetura e Regras de Ouro (e-Sigma / CoReVM)

Este documento constitui a base arquitetural e as regras de negócio irrevogáveis aplicadas ao ecossistema **e-Sigma** e seus módulos satélites (como o **CoReVM**). Qualquer novo código, refatoração ou banco de dados deve obrigatoriamente estar em conformidade com estas diretrizes.

---

## 1. Integridade, Padronização e Prevenção de Duplicatas

O sistema deve possuir mecanismos robustos na camada de entrada e validação para impedir poluição de dados, bouncing e duplicações por formatações distintas.

### 1.1 Formatação de Nomes (Sanitização)
- Toda inserção de texto passará por um serviço/middleware de formatação de nomes próprios antes de atingir o banco de dados.
- **Regra:** Primeira letra de cada palavra em maiúsculo, restante em minúsculo.
- **Exceções (Minúsculas):** Preposições de ligação (de, da, do, das, dos). Exemplo: *Augusto dos Anjos*.
- **Exceções (Maiúsculas):** Abreviações institucionais maçônicas (ARLS, ARBLS, GOB, GLEG, CIM).

### 1.2 Formatação de Máscaras e Validadores
O sistema aplica validações matemáticas e de máscara sistematicamente para dados sensíveis:
- **CPF:** Algoritmo de validação matemática obrigatório.
- **CNPJ:** Algoritmo de validação matemática obrigatório.
- **E-mail:** Validação de regex, salvo sempre em minúsculo (`.lower()`) e sem espaços (`.strip()`).
- **Celular (Padrão WhatsApp / E.164):** Os telefones devem ser salvos no banco de dados exclusivamente no formato internacional numérico (ex: `5511999999999`), visando integração nativa com APIs do WhatsApp e SMS. A máscara `(11) 99999-9999` será aplicada *apenas* na renderização visual do frontend.

> **Regra de Ouro (Storage vs Display):** 
> No Banco de Dados, documentos (CPF/CNPJ) e Telefones/CEPs devem ser armazenados **estritamente como números** (somente dígitos) para garantir que as constraints de `UNIQUE` funcionem sem falsos negativos. 
> As máscaras formatadas devem ser aplicadas **apenas na camada visual** (Frontend/React).

### 1.3 Dicionário de Dados Centralizado (Enums)
Para evitar registros duplicados ou com grafias distintas (ex: "Mestre Instalado" vs "Mestre-Instalado"), variáveis internas estáticas (Ritos, Cargos, Graus, Status) **não devem ser textos livres no banco de dados**. 
- Devem ser tipadas em arquivos de Constantes/Enums no código fonte (ex: `constants.py`).
- O banco de dados deve utilizar tipos enumerados (`ENUM`) ou tabelas de referência estáticas.

---

## 2. Ecossistema de APIs e Autocompletar

Para garantir agilidade de UX e precisão de dados, o sistema evitará ao máximo o preenchimento manual de dados que já são de domínio público ou interno.

### 2.1 APIs Públicas
- Uso sistemático de serviços públicos para autocompletamento.
- **Exemplos:** ViaCEP para endereços, APIs de ISBN para livros, Receita Federal para CNPJs.
- **Fallbacks:** O sistema deve estar preparado para quedas destas APIs. Caso haja falha (timeout/500), os campos devem ser liberados para preenchimento manual sem bloquear a experiência do usuário.

### 2.2 APIs Internas (Domínio Maçônico)
- O backend deve prover rotas próprias de domínio estático para alimentar os seletores do frontend.
- **Exemplos:** Ritos, Cargos em Loja, Graus, Tipos de Sessão, Potências e Obediências.
- Evitar hardcoding no frontend sempre que a lista for passível de expansão.

---

## 3. Logs, Auditoria e Troubleshooting

- **Sistema de Logs Estruturados:** Todo o tráfego crítico da API, falhas de integração e ações sensíveis (ex: cadastro/exclusão) devem ser registrados em um sistema robusto de logs (ex: JSON estruturado via biblioteca `loguru` ou nativa do Python).
- O log deve ser rastreável (Trace ID) para permitir auditoria e troubleshooting rápido sem precisar parar a aplicação em produção.

---

## 4. Testes e Qualidade (Checklist e Testes Automáticos)

- **Checklist de Validação:** Nenhuma funcionalidade (Feature) deve ser considerada pronta (Done) sem antes passar por um Checklist de Validação que confirme o atendimento das regras de negócio, tratamento de erros e UX.
- **Testes Automáticos de API:** As APIs devem ser blindadas por testes automatizados (usando `pytest` + `TestClient` no FastAPI). Todo endpoint core (login, inserção de dados, relatórios) deve ter cobertura de teste unitário/integração para garantir que mudanças futuras não quebrem o comportamento original.

---

## 5. Práticas de Código e Documentação (Handoff e Walkthrough)

Um ecossistema satélite precisa ser passível de manutenção por outros desenvolvedores. As seguintes regras de versionamento e documentação são obrigatórias:

### 5.1 Consulta Estrita ao Dicionário de Dados
- **Regra do Enum:** Sempre que o desenvolvedor ou agente de IA precisar usar um enumerador (Ritos, Cargos, Graus, etc.), ele deve, primeiramente, varrer o Dicionário de Dados (`constants.py`).
- O sistema deve listar as informações disponíveis e questionar o responsável se aquelas opções são suficientes para o novo requisito, antes de criar variáveis hardcoded ou novos Enums redundantes.

### 5.2 Conformidade de Código
- Todo código deve possuir comentários claros, focados no "porquê" (lógica de negócios), escritos em **pt-BR**.
- Ao abrir um arquivo legado para edição, o desenvolvedor (ou agente de IA) deve varrê-lo em busca de inconsistências com estas regras e, se refatorado e certificado, adicionar um comentário de conformidade no topo do arquivo:
  `// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA`

### 5.3 Documentação de APIs
- Uso irrestrito de **Swagger / OpenAPI**. O backend (FastAPI) deve ter seus schemas (Pydantic) e rotas (Routers) devidamente tipados e documentados para geração automática da interface de API.

### 5.4 Versionamento Automático (Git)
- O fim de cada sessão de desenvolvimento ativa deve engatilhar automaticamente as rotinas de versionamento:
  `git add .`, `git commit -m "..."`, e `git push`.
- A mensagem de commit deve tentar resumir o que foi implantado, gerando um "diário de implantação" (Deployment Diary) no histórico do repositório.

### 5.5 Artefatos de Handoff e Walkthrough
- Toda implantação estrutural grande (features complexas, mudanças de banco de dados) deve ser acompanhada da escrita de um **Walkthrough** ou plano de **Handoff**.
- Estes documentos registram a concepção da funcionalidade, o que foi alterado e como deve ser testado, garantindo uma passagem de bastão segura.
