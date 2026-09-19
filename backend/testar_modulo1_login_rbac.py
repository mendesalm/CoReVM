# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Modulo 1 do roteiro (Login e RBAC), reteste de
regressao motivado pela refatoracao de get_current_regional_user
(2026-09-16).

Cobre os 4 itens ainda pendentes no roteiro:
  1. SuperAdmin -> GET /me: role=SUPERADMIN, is_diretoria=True
  2. Presidente (9900001) -> GET /me: is_diretoria=True, is_veneravel=True,
     loja_id="266"
  3. VM puro (9900022, Loja 904) -> GET /me: is_diretoria=False,
     role=VENERAVEL, is_veneravel=True, loja_id="269"
  4. Sem vinculo (9900028) -> GET /me: 403 com a mensagem de sempre

Uso:
    python testar_modulo1_login_rbac.py

Requer o pacote `requests` (ja e dependencia do backend do CoReVM).
"""
import sys

import requests

ESIGMA_URL = "http://localhost:8000/api/v1"
COREVM_URL = "http://localhost:8003/api/v1"
REGIAO_ID = "test-core-ceres-go-001"

SENHA_TESTE = "senha123"

FALHAS = []


def login(username: str, password: str):
    resp = requests.post(
        f"{ESIGMA_URL}/auth/login",
        json={"username": username, "password": password},
        timeout=10,
    )
    return resp


def get_me(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    return requests.get(f"{COREVM_URL}/regional/{REGIAO_ID}/me", headers=headers, timeout=10)


def checar(descricao: str, condicao: bool, detalhe: str = ""):
    if condicao:
        print(f"  [OK] {descricao}")
    else:
        print(f"  [FALHOU] {descricao} -- {detalhe}")
        FALHAS.append(descricao)


def teste_superadmin():
    print("\n1) SuperAdmin (sistema@e-sigma.app)")
    resp_login = login("sistema@e-sigma.app", "Ceres@2026Teste!")
    if resp_login.status_code != 200:
        checar("login do SuperAdmin", False, f"status={resp_login.status_code} body={resp_login.text}")
        return
    token = resp_login.json()["access_token"]
    resp = get_me(token)
    checar("GET /me responde 200", resp.status_code == 200, f"status={resp.status_code} body={resp.text}")
    if resp.status_code == 200:
        dados = resp.json()
        checar("role == SUPERADMIN", dados.get("role") == "SUPERADMIN", f"role={dados.get('role')!r}")
        checar("is_diretoria == True", dados.get("is_diretoria") is True, f"is_diretoria={dados.get('is_diretoria')!r}")


def teste_presidente():
    print("\n2) Presidente (9900001)")
    resp_login = login("9900001", SENHA_TESTE)
    if resp_login.status_code != 200:
        checar("login do Presidente", False, f"status={resp_login.status_code} body={resp_login.text}")
        return
    token = resp_login.json()["access_token"]
    resp = get_me(token)
    checar("GET /me responde 200", resp.status_code == 200, f"status={resp.status_code} body={resp.text}")
    if resp.status_code == 200:
        dados = resp.json()
        checar("is_diretoria == True", dados.get("is_diretoria") is True, f"is_diretoria={dados.get('is_diretoria')!r}")
        checar("is_veneravel == True", dados.get("is_veneravel") is True, f"is_veneravel={dados.get('is_veneravel')!r}")
        checar('loja_id == "266"', str(dados.get("loja_id")) == "266", f"loja_id={dados.get('loja_id')!r}")


def teste_vm_puro():
    print("\n3) VM puro (9900022, Loja 904)")
    resp_login = login("9900022", SENHA_TESTE)
    if resp_login.status_code != 200:
        checar("login do VM puro", False, f"status={resp_login.status_code} body={resp_login.text}")
        return
    token = resp_login.json()["access_token"]
    resp = get_me(token)
    checar("GET /me responde 200", resp.status_code == 200, f"status={resp.status_code} body={resp.text}")
    if resp.status_code == 200:
        dados = resp.json()
        checar("is_diretoria == False", dados.get("is_diretoria") is False, f"is_diretoria={dados.get('is_diretoria')!r}")
        checar("role == VENERAVEL", dados.get("role") == "VENERAVEL", f"role={dados.get('role')!r}")
        checar("is_veneravel == True", dados.get("is_veneravel") is True, f"is_veneravel={dados.get('is_veneravel')!r}")
        checar('loja_id == "269"', str(dados.get("loja_id")) == "269", f"loja_id={dados.get('loja_id')!r}")


def teste_sem_vinculo():
    print("\n4) Sem vinculo (9900028)")
    resp_login = login("9900028", SENHA_TESTE)
    if resp_login.status_code != 200:
        checar("login do usuario sem vinculo", False, f"status={resp_login.status_code} body={resp_login.text}")
        return
    token = resp_login.json()["access_token"]
    resp = get_me(token)
    checar("GET /me responde 403", resp.status_code == 403, f"status={resp.status_code} body={resp.text}")
    if resp.status_code == 403:
        msg_esperada = "Acesso negado: Você não possui permissão de acesso a este Conselho Regional."
        detalhe = resp.json().get("detail", "")
        checar("mensagem de erro inalterada", detalhe == msg_esperada, f"detail={detalhe!r}")


def main():
    teste_superadmin()
    teste_presidente()
    teste_vm_puro()
    teste_sem_vinculo()

    print("\n" + "=" * 60)
    if FALHAS:
        print(f"RESULTADO: {len(FALHAS)} falha(s):")
        for f in FALHAS:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("RESULTADO: TODOS OS ITENS DO MODULO 1 PASSARAM.")


if __name__ == "__main__":
    main()
