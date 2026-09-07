# REGRAS DE ENGENHARIA, QUALIDADE DE CÓDIGO E DEVOPS (QA & DevOps)

As seguintes políticas rigorosas de qualidade devem ser aplicadas **sistematicamente e obrigatoriamente** durante todas as iterações e gerações de código neste workspace (Ecossistema CoReVM):

## 1. Documentação de Código e Idioma
- **Comentários Detalhados (pt-BR):** Qualquer nova função, classe, hook ou fluxo de negócio (tanto em Python quanto em TypeScript/React) deve ser obrigatoriamente acompanhada de documentação inline, comentários explicativos e docstrings. 
- **100% Português:** A linguagem padrão de todos os comentários, logs de terminal, documentação e nomes de variáveis/estruturas de negócio deve ser o Português do Brasil (pt-BR), respeitando a nomenclatura maçônica padrão (ex: `Obreiro`, `Loja`, `Conselho`, `Mandato`).

## 2. Padrões de API e Swagger
- **Swagger/OpenAPI Automático:** Ao criar ou modificar rotas no FastAPI, você deve atualizar os parâmetros de `responses`, `summary` e `description` dos decorators (`@router.get`, `@router.post`, etc.).
- A documentação gerada em `/docs` deve refletir estritamente o formato dos payloads e códigos de erro HTTP (ex: 404, 422).

## 3. Validação de Dados (Double-Check)
- **Frontend (React):** Formulários devem possuir validação instantânea no onChange/onBlur (Regex para CPF sem traços, máscaras de WhatsApp) e desabilitar botões de "Submit" enquanto os dados estiverem pendentes.
- **Backend (FastAPI/Pydantic):** O schema deve higienizar dados através do `@field_validator` (ex: forçar nomes em *Title Case*, higienizar pontuação de CPFs). O Backend é o guardião final das *Golden Rules*.
- O frontend deve estar preparado para interceptar e exibir adequadamente mensagens de erro `422 Unprocessable Entity` vindas do backend.

## 4. Dicionário de Dados
- Qualquer nova entidade (ex: Suplentes) ou enumeração criada deve ser previamente definida e unificada em `backend/core/constants.py` antes de ser referenciada pelo banco ou rotas, mantendo consistência com o *Golden Data Dictionary*.

## 5. Logs Detalhados (Tracing)
- Utilize a biblioteca `loguru` em todas as rotas e lógicas transacionais do backend. Ações Críticas (criação on-the-fly, destituição, deleção) devem disparar logs descritivos (INFO, WARNING, ERROR), identificando quem fez a requisição e qual banco (`core_db`, `lojas_db`) foi afetado.

## 6. Testes Automáticos
- Toda vez que criarmos blocos modulares cruciais (RBAC de rotas, higienização de schemas), devemos em seguida escrever e/ou rodar os testes correspondentes (Pytest) para garantir que a segurança e a validação funcionam sob diferentes condições (tokens inválidos, dados sujos, duplicidade cruzada).

> Estas regras são não-negociáveis e ditam o padrão-ouro de entrega de software para este repositório. O assistente de IA deve ler, internalizar e executar todas as solicitações respeitando integralmente estas diretrizes.
