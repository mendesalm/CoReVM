# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_listar_regioes():
    """
    Testa se a rota de listagem de regies retorna HTTP 200
    e um formato de lista JSON.
    """
    response = client.get("/api/v1/regioes/")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
