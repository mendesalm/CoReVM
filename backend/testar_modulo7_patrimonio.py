# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 7 do roteiro (Patrimônio).

Cobre via API:
  - VM comum tentando cadastrar bem do CONSELHO -> 403
  - VM cadastra bem da própria Loja -> 200
  - Atualizar cadastro do item
  - Empréstimo (termo de cautela) e devolução
  - Fila de espera: entrar e cancelar
  - Excluir (soft) e hard delete (só SuperAdmin)
  - Nota (roteiro, seção 7): Operador Administrativo continua bloqueado em
    qualquer rota de Patrimônio -- este módulo usa `get_current_regional_user`
    puro (não o resolvedor combinado), então um Operador Administrativo
    nem chega a resolver identidade aqui; não precisa de um teste dedicado
    além do que já é garantido pela própria dependência da rota.

Uso:
    python testar_modulo7_patrimonio.py
"""
from datetime import date, timedelta

from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)
    checar("login SuperAdmin", ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!").status_code == 200)

    print("\n1) VM comum tentando cadastrar bem do CONSELHO -> 403")
    resp_bloqueado = ctx.post("vm904", f"/regional/{REGIAO_ID}/patrimonio/itens", json={
        "nome": "[TESTE AUTOMATIZADO] Bem do Conselho (não deveria ser criado)",
        "tipo_propriedade": "CONSELHO",
        "quantidade_total": 1,
    })
    checar("POST /patrimonio/itens CONSELHO (VM comum) -> 403", resp_bloqueado.status_code == 403, f"{resp_bloqueado.status_code} {resp_bloqueado.text}")

    print("\n2) VM cadastra bem da própria Loja")
    resp = ctx.post("vm904", f"/regional/{REGIAO_ID}/patrimonio/itens", json={
        "nome": "[TESTE AUTOMATIZADO] Item de teste da Loja 904",
        "tipo_propriedade": "LOJA",
        "loja_proprietaria_id": "269",
        "loja_proprietaria_nome": "Loja Teste",
        "loja_proprietaria_numero": "904",
        "quantidade_total": 2,
    })
    checar("POST /patrimonio/itens LOJA (VM 904) -> 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")
    item_id = resp.json().get("item_id") if resp.status_code == 200 else None

    if item_id:
        print("\n3) Atualizar cadastro do item")
        resp_put = ctx.put("vm904", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}", json={
            "nome": "[TESTE AUTOMATIZADO] Item de teste da Loja 904 (atualizado)",
            "tipo_propriedade": "LOJA",
            "quantidade_total": 2,
        })
        checar("PUT /patrimonio/itens/{id} -> 200", resp_put.status_code == 200, f"{resp_put.status_code} {resp_put.text}")

        print("\n4) VM de outra Loja tentando editar -> 403")
        resp_put_alheio = ctx.put("vm905", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}", json={
            "nome": "Tentativa indevida",
            "tipo_propriedade": "LOJA",
            "quantidade_total": 2,
        })
        checar("PUT /patrimonio/itens/{id} de outra Loja -> 403", resp_put_alheio.status_code == 403, f"{resp_put_alheio.status_code} {resp_put_alheio.text}")

        print("\n5) Registrar empréstimo (termo de cautela)")
        resp_emp = ctx.post("vm905", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}/emprestar", json={
            "loja_solicitante_id": "270",
            "loja_solicitante_nome": "Loja Teste",
            "loja_solicitante_numero": "905",
            "responsavel_retirada_nome": "[TESTE AUTOMATIZADO] Retirada",
            "responsavel_entrega_nome": "[TESTE AUTOMATIZADO] Entrega",
            "data_prevista_devolucao": str(date.today() + timedelta(days=7)),
            "quantidade": 1,
        })
        checar("POST /emprestar -> 200", resp_emp.status_code == 200, f"{resp_emp.status_code} {resp_emp.text}")
        emprestimo_id = resp_emp.json().get("emprestimo_id") if resp_emp.status_code == 200 else None

        print("\n6) Tentar emprestar mais do que o disponível -> 400")
        resp_emp_excesso = ctx.post("vm905", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}/emprestar", json={
            "loja_solicitante_id": "270",
            "loja_solicitante_nome": "Loja Teste",
            "loja_solicitante_numero": "905",
            "responsavel_retirada_nome": "[TESTE AUTOMATIZADO] Retirada",
            "responsavel_entrega_nome": "[TESTE AUTOMATIZADO] Entrega",
            "data_prevista_devolucao": str(date.today() + timedelta(days=7)),
            "quantidade": 99,
        })
        checar("POST /emprestar quantidade excessiva -> 400", resp_emp_excesso.status_code == 400, f"{resp_emp_excesso.status_code} {resp_emp_excesso.text}")

        print("\n7) Entrar na fila de espera para a quantidade já indisponível")
        resp_fila = ctx.post("vm905", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}/fila", json={
            "loja_solicitante_id": "271",
            "loja_solicitante_nome": "Loja Teste 2",
            "loja_solicitante_numero": "902",
            "responsavel_nome": "[TESTE AUTOMATIZADO] Fila",
        })
        checar("POST /fila -> 200", resp_fila.status_code == 200, f"{resp_fila.status_code} {resp_fila.text}")
        fila_id = resp_fila.json().get("fila_id") if resp_fila.status_code == 200 else None

        if fila_id:
            print("\n8) Cancelar a solicitação na fila")
            resp_cancela = ctx.delete("presidente", f"/regional/{REGIAO_ID}/patrimonio/fila/{fila_id}")
            checar("DELETE /fila/{id} -> 200", resp_cancela.status_code == 200, f"{resp_cancela.status_code} {resp_cancela.text}")

        if emprestimo_id:
            print("\n9) Registrar devolução")
            resp_dev = ctx.post("vm905", f"/regional/{REGIAO_ID}/patrimonio/emprestimos/{emprestimo_id}/devolver", json={})
            checar("POST /devolver -> 200", resp_dev.status_code == 200, f"{resp_dev.status_code} {resp_dev.text}")

            print("\n10) Devolver de novo (já concluído) -> 400")
            resp_dev2 = ctx.post("vm905", f"/regional/{REGIAO_ID}/patrimonio/emprestimos/{emprestimo_id}/devolver", json={})
            checar("2ª devolução do mesmo empréstimo -> 400", resp_dev2.status_code == 400, f"{resp_dev2.status_code} {resp_dev2.text}")

        print("\n11) Excluir (soft) o item")
        resp_soft = ctx.delete("vm904", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}")
        checar("DELETE /patrimonio/itens/{id} (soft) -> 200", resp_soft.status_code == 200 and resp_soft.json().get("tipo_delecao") == "VISUAL", f"{resp_soft.status_code} {resp_soft.text}")

        print("\n12) VM comum tentando hard delete -> 403")
        resp_hard_vm = ctx.delete("vm904", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (VM comum) -> 403", resp_hard_vm.status_code == 403, f"{resp_hard_vm.status_code} {resp_hard_vm.text}")

        print("\n13) SuperAdmin faz o hard delete de limpeza")
        resp_hard = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/patrimonio/itens/{item_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (SuperAdmin, limpeza) -> 200", resp_hard.status_code == 200 and resp_hard.json().get("tipo_delecao") == "FISICA", f"{resp_hard.status_code} {resp_hard.text}")

    resumo("MÓDULO 7 (PATRIMÔNIO)")


if __name__ == "__main__":
    main()
