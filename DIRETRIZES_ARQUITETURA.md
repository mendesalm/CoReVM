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

## 3. Varredura, Correção e Auditoria

- Sempre que um novo padrão for definido, um script de varredura (ou migration) deve ser executado sobre o banco de dados para levantar (ou corrigir automaticamente) as inconsistências históricas.
- Arquitetura avessa ao `DELETE` físico em tabelas sensíveis: adotar o conceito de exclusões lógicas (Soft Deletes) em transações financeiras e registros históricos de obreiros.

---

## 4. Práticas de Código e Documentação (Handoff e Walkthrough)

Um ecossistema satélite precisa ser passível de manutenção por outros desenvolvedores. As seguintes regras de versionamento e documentação são obrigatórias:

### 4.1 Conformidade de Código
- Todo código deve possuir comentários claros, focados no "porquê" (lógica de negócios), escritos em **pt-BR**.
- Ao abrir um arquivo legado para edição, o desenvolvedor (ou agente de IA) deve varrê-lo em busca de inconsistências com estas regras e, se refatorado e certificado, adicionar um comentário de conformidade no topo do arquivo:
  `// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA`

### 4.2 Documentação de APIs
- Uso irrestrito de **Swagger / OpenAPI**. O backend (FastAPI) deve ter seus schemas (Pydantic) e rotas (Routers) devidamente tipados e documentados para geração automática da interface de API.

### 4.3 Versionamento Automático (Git)
- O fim de cada sessão de desenvolvimento ativa deve engatilhar automaticamente as rotinas de versionamento:
  `git add .`, `git commit -m "..."`, e `git push`.
- A mensagem de commit deve tentar resumir o que foi implantado, gerando um "diário de implantação" (Deployment Diary) no histórico do repositório.

### 4.4 Artefatos de Handoff e Walkthrough
- Toda implantação estrutural grande (features complexas, mudanças de banco de dados) deve ser acompanhada da escrita de um **Walkthrough** ou plano de **Handoff**.
- Estes documentos registram a concepção da funcionalidade, o que foi alterado e como deve ser testado, garantindo uma passagem de bastão segura.
