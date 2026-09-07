# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import pytest
from schemas.schemas import ObreiroCreateOnTheFly, LojaCreateOnTheFly

def test_obreiro_sanitization():
    # Testa Título Case, limpeza de CPF e Telefone
    payload = {
        "cim": "12345",
        "nome_completo": "joão da silva e souza",
        "email": "joao@teste.com",
        "cpf": "123.456.789-00",
        "telefone": "+55 (62) 9 9999-9999",
        "loja_id": 1,
        "cargo_loja": "Venerável Mestre"
    }
    
    obreiro = ObreiroCreateOnTheFly(**payload)
    
    assert obreiro.nome_completo == "João da Silva e Souza"
    assert obreiro.cpf == "12345678900"
    assert obreiro.telefone == "5562999999999"

def test_loja_sanitization():
    # Testa uppercase de estado e Título Case da cidade
    payload = {
        "nome_loja": "acácia de goiânia",
        "numero_loja": "1234",
        "titulo_loja": "ARLS",
        "rito": "REAA",
        "obediencia_id": 1,
        "cidade": "são luís de montes belos",
        "estado": "go "
    }
    
    loja = LojaCreateOnTheFly(**payload)
    
    assert loja.nome_loja == "Acácia de Goiânia"
    assert loja.cidade == "São Luís de Montes Belos"
    assert loja.estado == "GO"
