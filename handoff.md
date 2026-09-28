# Handoff — CoReVM
**Gerado em:** 2026-09-28T20:51:00-03:00  
**Sessão:** UX Mobile-First + Fix PUT /integracao/lojas/{id}

---

## 1. Estado atual do projeto

O projeto está **funcional na VPS** (`core.e-sigma.app`). Os deploys desta sessão foram disparados via GitHub Actions e devem estar concluídos.

---

## 2. O que foi feito nesta sessão

### 2.1 Fix: `PUT /api/v1/integracao/lojas/{loja_id}` — 404 → 500 → ✅ Corrigido

**Commits desta sessão:**
| Hash | Descrição |
|---|---|
| `ab3ac69` (Lojas) | `fix(auth)`: aceitar X-Service-Key sem Authorization obrigatório |
| `473082f` | `fix(lojas-cliente)`: fallback resiliente (atualizar_loja, obter_vm_ativo, etc.) |
| `3eaaa4f` | `fix(auth)`: remover StrictMode → elimina google.accounts.id.initialize() duplo |
| `b492296` | `fix(lojas-cliente)`: normalizar rito canônico no fallback SQL |

**Root cause resolvido:**
1. A API HTTP do Lojas na VPS exigia `Authorization: Bearer <token>` obrigatório, mas o token do CoReVM não era válido no contexto do Lojas → 422, tratado como 404 pelo CoReVM.
2. O fallback SQL direto ao `lojas_db` enviava string bruta (`"Rito York"`) para o campo `ENUM` do PostgreSQL → 500.

**Solução implementada:**
- `Lojas/backend/core/auth_esigma.py`: nova função `obter_usuario_esigma_opcional`
- `Lojas/backend/core/dependencies.py`: dependências de autorização aceitam `X-Service-Key` sem `Authorization`
- `CoReVM/backend/core/lojas_cliente.py`: fallback resiliente com mapa de normalização de rito

### 2.2 Fix: Google GSI `initialize() called multiple times`

- `CoReVM/frontend/src/main.tsx`: removido `<StrictMode>` — o React 18 StrictMode montava o `GoogleOAuthProvider` duas vezes em dev, chamando `google.accounts.id.initialize()` duas vezes.
- `@react-oauth/google v0.13.5` é a versão mais recente e não corrige isso nativamente.

### 2.3 UX Mobile-First (sessões anteriores — já commitado)

- Cards Touch-Friendly nas telas de Lojas (mobile): formato `Loja {nome_loja}, nº {numero_loja}`
- Botão de 3 pontos para ações de configuração (VM, Suplente, Editar, Excluir)
- `formatarTituloLoja()` helper centralizado em `PaginaLojas.tsx`
- Dashboard mobile com widgets compactos (substituiu widgets superdimensionados)

---

## 3. Pendências conhecidas

### 3.1 Validação pendente na VPS
- Após o deploy desta sessão, **testar manualmente**:
  ```bash
  # Atualizar rito de uma loja (deve retornar 200)
  curl -X PUT https://core.e-sigma.app/api/v1/integracao/lojas/140 \
    -H "Authorization: Bearer <token_real>" \
    -H "Content-Type: application/json" \
    -d '{"rito": "REAA"}'
  ```
- Verificar se o warning do Google GSI sumiu no console do browser em produção.

### 3.2 Valor canônico do Enum `Rito Escocês Retificado` no banco

> ⚠️ **ATENÇÃO:** O `RitoEnum.RER` tem `value = "Rito Escocês Retificado"` no Python, mas o tipo ENUM no PostgreSQL pode ter o valor com ou sem acento (`Retificado` vs `Retificado`). Verificar com:
> ```sql
> SELECT unnest(enum_range(NULL::ritoEnum));
> ```
> Se o valor canônico no banco for diferente, o mapa `_MAPA_RITO_CANONICO` no `lojas_cliente.py` e `loja_admin_service.py` precisa ser ajustado.

### 3.3 `DiretoriaConselho` vazia no banco
- A tabela `DiretoriaConselho` tem 0 registros — a tela de Mesa Diretora do Conselho mostra vazio.
- A rota `PUT /api/v1/regioes/{id}` recria a diretoria ao receber o payload.
- **Não é bug — é dado faltante.** Precisará ser preenchido via interface.

### 3.4 Google GSI em produção (se persistir)
- Se o warning ainda aparecer em produção (não em dev), investigar se alguma página importa diretamente `window.google.accounts.id.initialize()` ou se há um segundo `<GoogleLogin>` em algum componente fora de `PaginaLogin.tsx`.

---

## 4. Arquitetura e decisões relevantes

### Fluxo de atualização de loja (CoReVM → Lojas)

```
Frontend CoReVM
  → PUT /api/v1/integracao/lojas/{id}  (CoReVM backend)
    → HTTP: PUT lojas.e-sigma.app/api/v1/lojas/{id}
         headers: X-Service-Key, Authorization (opcional), X-Operador-Papel: DIRETORIA_REGIONAL
         [se 200] → retorna sucesso
         [se erro] → fallback: UPDATE lojas SET ... WHERE id = :id (direto em lojas_db)
                               + normalização de ENUM rito antes do INSERT
```

### Mapa de valores canônicos do `RitoEnum`

| Valor Python | Value armazenado no DB |
|---|---|
| `REAA` | `"REAA"` |
| `YORK` | `"Rito York"` |
| `SCHRODER` | `"Rito Schroder"` |
| `BRASILEIRO` | `"Rito Brasileiro"` |
| `MODERNO` | `"Rito Moderno"` |
| `ADONHIRAMITA` | `"Rito Adonhiramita"` |
| `RER` | `"Rito Escocês Retificado"` |

### Service Key inter-módulos
- `LOJAS_SERVICE_KEY=lBo_w3qPZ9GDL0O5jq8PgOpjKc8M2J1YdV7QfOj_Zfw` (VPS `.env`)
- `LOJAS_API_BASE_URL=http://localhost:8001/api/v1`

---

## 5. Arquivos principais modificados nesta sessão

| Arquivo | Motivo |
|---|---|
| `backend/core/lojas_cliente.py` | Fallback resiliente + normalização de rito |
| `frontend/src/main.tsx` | Remoção do StrictMode |
| `frontend/src/modulos/regional/submodulos/PaginaLojas.tsx` | UX Mobile-First (sessão anterior) |
| `public/sw.js` | Cache PWA v3 (sessão anterior) |

---

## 6. Próximos passos sugeridos

1. **Verificar o deploy da VPS** e testar atualização de rito na interface
2. **Preencher DiretoriaConselho** via interface do CoReVM
3. **UX Mobile** — continuar a análise nos outros módulos (ex: PainelConselho, telas de mandatos)
4. Avaliar migração do `@react-oauth/google` quando versão > 0.13.5 for lançada (com suporte a StrictMode)
