# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 3 do roteiro (Diretoria do Conselho).

Cobre os itens do roteiro que são seguros de automatizar via API sem
risco de corromper os dados de teste:
  - VM comum (não Diretoria) tentando editar Diretoria -> bloqueado (403)
  - Tentar inserir CIM inválido/inexistente no formulário -> bloqueado (400)
  - "Editar Diretoria" happy-path, mas re-enviando o MESMO trio já
    documentado no roteiro (9900001/9900008/9900015) -- exercita a rota
    de escrita sem mudar a composição real da Mesa Diretora.

ATENÇÃO -- por que NÃO reproduzimos aqui os itens de "assento órfão" e
"reatribuição emergencial": `PUT /{regiao_id}/diretoria` primeiro VALIDA
os três CIMs e só então DELETA E RECRIA toda a linha de diretoria_conselho
da região. Enviar um payload parcial (só 1 ou 2 cargos) apagaria de
verdade o(s) assento(s) omitido(s) -- por isso este script nunca envia um
payload que não seja o trio completo e correto. Simular um assento órfão
de verdade exige alterar o VM de uma Loja em lojas_db, o que é uma
mutação de dados de teste demais arriscada para automatizar sem
supervisão -- ver checklist manual no roteiro (seção 3).

Uso:
    python testar_modulo3_diretoria.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo

TRIO_ATUAL = {
    "presidente_id": "9900001",
    "vice_presidente_id": "9900008",
    "secretario_id": "9900015",
}


def obter_diretoria(ctx: Contexto, apelido: str):
    return ctx.get(apelido, f"/regional/{REGIAO_ID}/diretoria")


def teste_vm_comum_bloqueado(ctx: Contexto):
    print("\n1) VM comum (9900022) tentando editar Diretoria -> deve dar 403")
    resp_login = ctx.login("vm904", "9900022")
    checar("login do VM da Loja 904", resp_login.status_code == 200, f"{resp_login.status_code} {resp_login.text}")
    if resp_login.status_code != 200:
        return
    resp = ctx.put("vm904", f"/regional/{REGIAO_ID}/diretoria", json=TRIO_ATUAL)
    checar("PUT /diretoria como VM comum -> 403", resp.status_code == 403, f"{resp.status_code} {resp.text}")


def teste_cim_invalido_bloqueado(ctx: Contexto):
    print("\n2) Presidente tentando designar CIM inexistente -> deve dar 400 (e não apagar nada)")
    resp_login = ctx.login("presidente", "9900001")
    checar("login do Presidente", resp_login.status_code == 200, f"{resp_login.status_code} {resp_login.text}")
    if resp_login.status_code != 200:
        return

    antes = obter_diretoria(ctx, "presidente")
    checar("GET /diretoria (antes) responde 200", antes.status_code == 200, f"{antes.status_code} {antes.text}")

    payload_invalido = dict(TRIO_ATUAL)
    payload_invalido["secretario_id"] = "9999999999-nao-existe"
    resp = ctx.put("presidente", f"/regional/{REGIAO_ID}/diretoria", json=payload_invalido)
    checar("PUT /diretoria com CIM inválido -> 400", resp.status_code == 400, f"{resp.status_code} {resp.text}")

    depois = obter_diretoria(ctx, "presidente")
    if antes.status_code == 200 and depois.status_code == 200:
        checar(
            "Diretoria NÃO foi alterada pela tentativa inválida (validação ocorre antes do delete)",
            antes.json() == depois.json(),
            "composição da diretoria mudou após uma chamada que deveria ter sido bloqueada",
        )


def teste_editar_diretoria_noop(ctx: Contexto):
    print("\n3) Presidente reenviando o trio já correto (round-trip seguro) -> 200, composição inalterada")
    resp = ctx.put("presidente", f"/regional/{REGIAO_ID}/diretoria", json=TRIO_ATUAL)
    checar("PUT /diretoria com o trio correto -> 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")

    depois = obter_diretoria(ctx, "presidente")
    checar("GET /diretoria (depois) responde 200", depois.status_code == 200, f"{depois.status_code} {depois.text}")
    if depois.status_code == 200:
        membros = {m["cargo"]: m["usuario_id"] for m in depois.json()}
        checar(
            "Presidente/Vice/Secretário continuam 9900001/9900008/9900015",
            membros.get("PRESIDENTE") == "9900001"
            and membros.get("VICE_PRESIDENTE") == "9900008"
            and membros.get("SECRETARIO") == "9900015",
            f"composição atual: {membros!r}",
        )


def main():
    ctx = Contexto()
    teste_vm_comum_bloqueado(ctx)
    teste_cim_invalido_bloqueado(ctx)
    teste_editar_diretoria_noop(ctx)
    resumo("MÓDULO 3 (DIRETORIA)")


if __name__ == "__main__":
    main()
