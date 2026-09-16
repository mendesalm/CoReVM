# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado — Módulo 2 do roteiro: "Usuário sem vínculo nenhum
tentando chamar a rota diretamente -> 403".

Não dá para testar isso pela UI (a tela nem mostra o botão quando não há
vínculo), então este script chama a API do CoReVM diretamente, com o token
de um oficial que nunca foi designado VM, Suplente ou Diretoria de loja
nenhuma no Conselho de teste.

Uso:
    python testar_acesso_direto_suplente.py

Requer o pacote `requests` (já é dependência do próprio backend do CoReVM,
ver core/auth_esigma.py — se faltar: pip install requests).
"""
import sys

import requests

ESIGMA_URL = "http://localhost:8000/api/v1"
COREVM_URL = "http://localhost:8003/api/v1"

REGIAO_ID = "test-core-ceres-go-001"
LOJA_ALVO_ID = "269"  # ID interno da Loja nº 904 (ver roteiro de testes)

# Oficial de teste SEM nenhum vínculo com o Conselho (nunca foi designado
# VM, Suplente ou Diretoria) — troque se este CIM já tiver sido usado em
# outro teste manual.
CIM_SEM_VINCULO = "9900028"
SENHA = "senha123"


def main() -> None:
    print(f"1) Login de {CIM_SEM_VINCULO} no e-Sigma ({ESIGMA_URL}/auth/login)...")
    resp_login = requests.post(
        f"{ESIGMA_URL}/auth/login",
        json={"username": CIM_SEM_VINCULO, "password": SENHA},
        timeout=10,
    )
    if resp_login.status_code != 200:
        print(f"   FALHOU: login retornou {resp_login.status_code} - {resp_login.text}")
        sys.exit(1)
    token = resp_login.json()["access_token"]
    print("   OK, token obtido.")

    headers = {"Authorization": f"Bearer {token}"}

    print(f"\n2) Confirmando contexto no CoReVM (GET /regional/{REGIAO_ID}/me)...")
    resp_me = requests.get(f"{COREVM_URL}/regional/{REGIAO_ID}/me", headers=headers, timeout=10)
    print(f"   status={resp_me.status_code} body={resp_me.text}")
    if resp_me.status_code == 200 and resp_me.json().get("role"):
        print(
            f"   AVISO: este usuário já tem role={resp_me.json().get('role')!r} neste Conselho — "
            "escolha outro CIM sem nenhum vínculo para um teste limpo."
        )

    print(
        f"\n3) Tentando designar Suplente da Loja {LOJA_ALVO_ID} direto na API "
        "(sem passar pela UI, sem ter vínculo nenhum)..."
    )
    resp_designar = requests.put(
        f"{COREVM_URL}/regional/{REGIAO_ID}/lojas/{LOJA_ALVO_ID}/suplente",
        headers=headers,
        json={"usuario_id": CIM_SEM_VINCULO},
        timeout=10,
    )
    print(f"   status={resp_designar.status_code} body={resp_designar.text}")

    print()
    if resp_designar.status_code == 403:
        print("RESULTADO: SUCESSO - a API bloqueou corretamente com 403, mesmo na chamada direta.")
    else:
        print(
            f"RESULTADO: FALHA - esperado 403, recebido {resp_designar.status_code}. "
            "Investigar get_current_regional_user / _exigir_vm_da_loja_ou_diretoria."
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
