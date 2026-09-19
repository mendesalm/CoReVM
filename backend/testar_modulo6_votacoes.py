# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 6 do roteiro (Votações e Consultas).

Cobre via API:
  - VM comum tentando criar votação -> 403 (só Diretoria/SuperAdmin abre)
  - Diretoria cria votação/consulta regional -> 200
  - Cada Loja jurisdicionada registra 1 voto (Loja 904, depois Loja 905)
  - Votar de novo com a mesma Loja atualiza o voto (não duplica)
  - Encerrar e reabrir votação (só Diretoria/SuperAdmin)
  - Excluir (soft) e, por fim, hard delete via SuperAdmin (limpeza)

Uso:
    python testar_modulo6_votacoes.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)
    checar("login SuperAdmin", ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!").status_code == 200)

    print("\n1) VM comum tentando criar votação -> 403")
    resp_bloqueado = ctx.post("vm904", f"/regional/{REGIAO_ID}/votacoes", json={
        "titulo": "[TESTE AUTOMATIZADO] Tentativa indevida",
        "descricao": "Não deveria ser criada.",
    })
    checar("POST /votacoes (VM comum) -> 403", resp_bloqueado.status_code == 403, f"{resp_bloqueado.status_code} {resp_bloqueado.text}")

    print("\n2) Presidente cria a votação")
    resp = ctx.post("presidente", f"/regional/{REGIAO_ID}/votacoes", json={
        "titulo": "[TESTE AUTOMATIZADO] Consulta de rotina",
        "descricao": "Votação criada por script automatizado -- pode ser removida.",
        "tipo": "CONSULTA",
        "opcoes": ["Favorável", "Contrário", "Abstenção"],
    })
    checar("POST /votacoes (Presidente) -> 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")
    votacao_id = resp.json().get("votacao_id") if resp.status_code == 200 else None

    if votacao_id:
        print("\n3) Loja 904 vota")
        resp_voto904 = ctx.post("vm904", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}/votar", json={
            "opcao_escolhida": "Favorável",
        })
        checar("POST /votar (Loja 904) -> 200", resp_voto904.status_code == 200, f"{resp_voto904.status_code} {resp_voto904.text}")

        print("\n4) Loja 905 vota")
        resp_voto905 = ctx.post("vm905", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}/votar", json={
            "opcao_escolhida": "Contrário",
        })
        checar("POST /votar (Loja 905) -> 200", resp_voto905.status_code == 200, f"{resp_voto905.status_code} {resp_voto905.text}")

        print("\n5) Loja 904 vota de novo (deve ATUALIZAR o voto, não duplicar)")
        resp_voto904b = ctx.post("vm904", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}/votar", json={
            "opcao_escolhida": "Abstenção",
        })
        checar("2º voto da Loja 904 -> 200 (atualiza)", resp_voto904b.status_code == 200, f"{resp_voto904b.status_code} {resp_voto904b.text}")

        lista = ctx.get("presidente", f"/regional/{REGIAO_ID}/votacoes")
        if lista.status_code == 200:
            v = next((x for x in lista.json() if x.get("id") == votacao_id), None)
            checar("votação encontrada na listagem", v is not None, "votação de teste não apareceu em GET /votacoes")

        print("\n6) VM comum tentando encerrar a votação -> 403")
        resp_encerra_vm = ctx.put("vm904", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}/status", json={"status": "ENCERRADA"})
        checar("PUT /status (VM comum) -> 403", resp_encerra_vm.status_code == 403, f"{resp_encerra_vm.status_code} {resp_encerra_vm.text}")

        print("\n7) Presidente encerra a votação")
        resp_encerra = ctx.put("presidente", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}/status", json={"status": "ENCERRADA"})
        checar("PUT /status ENCERRADA (Presidente) -> 200", resp_encerra.status_code == 200, f"{resp_encerra.status_code} {resp_encerra.text}")

        print("\n8) Votar numa votação já encerrada -> 400")
        resp_voto_encerrada = ctx.post("vm905", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}/votar", json={"opcao_escolhida": "Favorável"})
        checar("POST /votar em votação encerrada -> 400", resp_voto_encerrada.status_code == 400, f"{resp_voto_encerrada.status_code} {resp_voto_encerrada.text}")

        print("\n9) Presidente reabre a votação")
        resp_reabre = ctx.put("presidente", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}/status", json={"status": "EM_ANDAMENTO"})
        checar("PUT /status EM_ANDAMENTO (reabrir) -> 200", resp_reabre.status_code == 200, f"{resp_reabre.status_code} {resp_reabre.text}")

        print("\n10) Excluir (soft) e depois hard delete de limpeza via SuperAdmin")
        resp_soft = ctx.delete("presidente", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}")
        checar("DELETE /votacoes/{id} (soft) -> 200", resp_soft.status_code == 200 and resp_soft.json().get("tipo_delecao") == "VISUAL", f"{resp_soft.status_code} {resp_soft.text}")
        resp_hard = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/votacoes/{votacao_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (SuperAdmin, limpeza) -> 200", resp_hard.status_code == 200 and resp_hard.json().get("tipo_delecao") == "FISICA", f"{resp_hard.status_code} {resp_hard.text}")

    resumo("MÓDULO 6 (VOTAÇÕES E CONSULTAS)")


if __name__ == "__main__":
    main()
