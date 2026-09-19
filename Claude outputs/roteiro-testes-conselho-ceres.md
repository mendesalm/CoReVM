# Roteiro de Testes — Conselho Regional (Ambiente Ceres [TESTE])

Ambiente: Região de teste Ceres/GO, 5 Lojas (901 a 905), 35 membros de teste.
Login: `teste.cim<CIM>@e-sigma.app` / senha `senha123` para todos.

Mesa Diretora do Conselho (todos acumulam com VM da própria loja):
- `9900001` — Presidente **e** VM da Loja 901
- `9900008` — Vice-Presidente **e** VM da Loja 902
- `9900015` — Secretário **e** VM da Loja 903

Lojas "limpas" para testar papéis puros (sem acúmulo com Diretoria):
- Loja 904 — VM `9900022`, oficiais `9900023` a `9900028`
- Loja 905 — VM `9900029`, oficiais `9900030` a `9900035`

Marque cada item como ✅ (ok), ❌ (falhou) ou ⏳ (não testado ainda).

## 1. Login e RBAC

- [ ] Login SuperAdmin → acessa o dashboard e qualquer Região sem restrição
- [ ] Login `9900001` (Presidente) → `GET /me` retorna `is_diretoria: true`, `loja_id: "901"`, `is_veneravel: true`
- [ ] Login `9900022` (VM puro, Loja 904) → `is_diretoria: false`, `role: "VENERAVEL"`, `loja_id: "904"`
- [ ] Login de um oficial comum SEM suplência (ex.: `9900023`, ainda não designado) → deve dar 403 "Acesso negado" (comportamento esperado, ainda não tem vínculo com o Conselho)
- [ ] Após designar `9900023` como Suplente da Loja 904 (item 2 abaixo), login dele → `role: "SUPLENTE"`, `loja_id: "904"`

## 2. Lojas e Designação Livre de Suplente (feature nova)

- [ ] Tela de Lojas lista as 5 lojas com VM e coluna "Suplente do Conselho"
- [ ] Logado como VM da Loja 904 (`9900022`): abrir "Designar Suplente" → lista os 7 oficiais da própria loja
- [ ] Designar um oficial (ex.: `9900024`, 2º Vigilante) como Suplente → sucesso, coluna atualiza
- [ ] Logar como `9900024` → confirma que agora acessa o Conselho como Suplente
- [ ] Trocar o Suplente da Loja 904 para outro oficial → confirma substituição (não deve haver 2 suplentes acumulados)
- [ ] Logado como VM da Loja 904, tentar designar suplente da Loja 905 → deve ser bloqueado (403)
- [ ] Logado como Presidente (`9900001`, Diretoria) → designar suplente de QUALQUER loja (ex.: Loja 905) → deve ser permitido
- [ ] Remover designação de suplente de uma loja → botão "Remover designação" funciona
- [ ] Usuário sem vínculo nenhum (ex.: oficial de loja que não está no conselho) tentando chamar a rota diretamente → 403

## 3. Diretoria do Conselho

- [ ] Tela de composição da Diretoria carrega os 3 membros com nome/CIM/e-mail
- [ ] Editar Diretoria (trocar Presidente/Vice/Secretário) — só Diretoria/SuperAdmin conseguem
- [ ] VM comum (não Diretoria) tentando editar Diretoria → bloqueado

## 4. Mural de Avisos e Notificações

- [ ] Publicar Aviso (qualquer membro do conselho) e Notificação
- [ ] Fixar aviso no topo — restrito à Diretoria
- [ ] Editar / excluir aviso próprio
- [ ] SuperAdmin: exclusão física (hard delete) vs. oculta (soft delete)
- [ ] Aviso com data de validade expirada some da visão de membros comuns, mas continua visível para Diretoria/SuperAdmin

## 5. Admissões (Prévias)

- [ ] Criar prévia com geração automática de PDF
- [ ] Criar prévia via upload de PDF
- [ ] Adicionar considerações incrementais
- [ ] Atualizar status de verificação da prévia
- [ ] Excluir/ocultar prévia

## 6. Votações e Consultas

- [ ] Criar votação/consulta regional
- [ ] Cada Loja jurisdicionada consegue registrar 1 voto
- [ ] Encerrar e reabrir votação
- [ ] Excluir/ocultar votação

## 7. Patrimônio

- [ ] Cadastrar bem (Conselho ou Loja)
- [ ] Atualizar cadastro de item
- [ ] Registrar empréstimo (termo de cautela)
- [ ] Registrar devolução
- [ ] Entrar na fila de espera de item indisponível / cancelar fila
- [ ] Excluir/ocultar item

## 8. Documentos

- [ ] Publicar documento com geração automática de PDF oficial
- [ ] Publicar documento via upload (PDF/Docx)
- [ ] Editar metadados de documento
- [ ] Excluir/ocultar documento

## 9. Comunicação (Tópicos/Pranchas)

- [ ] Criar novo tópico/prancha oficial
- [ ] Responder tópico (mensagem simples)
- [ ] Responder com upload de anexo
- [ ] Alterar status do chamado/prancha

## 10. Relatórios

- [ ] Relatório executivo
- [ ] Relatório de integrantes (Lojas, VM, 1º Vigilante/Suplente)
- [ ] Relatório de patrimônio

---

### Observações de execução
Registrar aqui qualquer bug encontrado durante os testes (arquivo, sintoma, CIM usado para reproduzir), para virar item de correção depois.
