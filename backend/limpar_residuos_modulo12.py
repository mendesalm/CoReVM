# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Limpeza pontual -- remove os 2 registros de teste que ficaram órfãos da
1ª rodada (com bug) de testar_modulo12_operador_administrativo.py:
  - Prévia de admissão criada indevidamente para a Loja 905 (deveria ter
    sido bloqueada com 403, mas passou por causa do bug já corrigido)
  - Documento criado indevidamente em nome da Loja 905

Seguro de rodar mesmo que os IDs já não existam mais (ignora 404).

Uso:
    python limpar_residuos_modulo12.py
"""
from helpers_teste_api import Contexto, REGIAO_ID

PREVIA_ID = "30ae4790-64eb-4b9e-9796-aaf00e9fdf02"
DOCUMENTO_ID = "3a26275a-b549-4979-9f80-4cbcbeaa64a6"


def main():
    ctx = Contexto()
    resp_login = ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!")
    if resp_login.status_code != 200:
        print(f"[ERRO] login do SuperAdmin falhou: {resp_login.status_code} {resp_login.text}")
        return

    resp1 = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/admissoes/{PREVIA_ID}?hard_delete=true")
    print(f"prévia {PREVIA_ID}: {resp1.status_code} {resp1.text}")

    resp2 = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/documentos/{DOCUMENTO_ID}?hard_delete=true")
    print(f"documento {DOCUMENTO_ID}: {resp2.status_code} {resp2.text}")


if __name__ == "__main__":
    main()
