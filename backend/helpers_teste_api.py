# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Helpers compartilhados pelos scripts de teste automatizado do roteiro
(claude/roteiro-testes-conselho-ceres.md no Project "Core").

Reaproveita o mesmo padrão já usado em testar_modulo1_login_rbac.py:
login via e-Sigma + chamadas HTTP diretas ao CoReVM, com um helper
`checar()` que acumula falhas e um `resumo()` para o relatório final.

Uso típico num script de módulo:

    from helpers_teste_api import (
        Contexto, checar, resumo, ESIGMA_URL, COREVM_URL, REGIAO_ID,
    )

    ctx = Contexto()
    ctx.login("presidente", "9900001", "senha123")
    resp = ctx.get("presidente", f"/regional/{REGIAO_ID}/avisos")
    checar("GET /avisos responde 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")
    resumo()
"""
import sys

import requests

ESIGMA_URL = "http://localhost:8000/api/v1"
COREVM_URL = "http://localhost:8003/api/v1"
REGIAO_ID = "test-core-ceres-go-001"
SENHA_TESTE = "senha123"

FALHAS = []


def checar(descricao: str, condicao: bool, detalhe: str = ""):
    """Registra o resultado de uma asserção e imprime na hora (mesmo padrão de testar_modulo1_login_rbac.py)."""
    if condicao:
        print(f"  [OK] {descricao}")
    else:
        print(f"  [FALHOU] {descricao} -- {detalhe}")
        FALHAS.append(descricao)


def resumo(titulo: str = "RESULTADO"):
    print("\n" + "=" * 60)
    if FALHAS:
        print(f"{titulo}: {len(FALHAS)} falha(s):")
        for f in FALHAS:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print(f"{titulo}: TODOS OS ITENS PASSARAM.")


class Contexto:
    """
    Guarda os tokens já obtidos por apelido (ex.: "presidente", "vm904",
    "sem_vinculo") para não logar de novo em toda chamada, e oferece
    get/post/put/delete já com o header Authorization certo.
    """

    def __init__(self):
        self._tokens: dict[str, str] = {}

    def login(self, apelido: str, identificador: str, senha: str = SENHA_TESTE) -> requests.Response:
        resp = requests.post(
            f"{ESIGMA_URL}/auth/login",
            json={"username": identificador, "password": senha},
            timeout=10,
        )
        if resp.status_code == 200:
            self._tokens[apelido] = resp.json()["access_token"]
        return resp

    def token(self, apelido: str) -> str:
        if apelido not in self._tokens:
            raise RuntimeError(f"Nenhum login feito para o apelido '{apelido}' -- chame ctx.login() antes.")
        return self._tokens[apelido]

    def _headers(self, apelido: str) -> dict:
        return {"Authorization": f"Bearer {self.token(apelido)}"}

    def get(self, apelido: str, caminho: str, **kwargs) -> requests.Response:
        return requests.get(f"{COREVM_URL}{caminho}", headers=self._headers(apelido), timeout=15, **kwargs)

    def post(self, apelido: str, caminho: str, json: dict | None = None, **kwargs) -> requests.Response:
        return requests.post(f"{COREVM_URL}{caminho}", headers=self._headers(apelido), json=json, timeout=15, **kwargs)

    def put(self, apelido: str, caminho: str, json: dict | None = None, **kwargs) -> requests.Response:
        return requests.put(f"{COREVM_URL}{caminho}", headers=self._headers(apelido), json=json, timeout=15, **kwargs)

    def delete(self, apelido: str, caminho: str, **kwargs) -> requests.Response:
        return requests.delete(f"{COREVM_URL}{caminho}", headers=self._headers(apelido), timeout=15, **kwargs)
