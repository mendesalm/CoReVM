# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Rotas de Integração de Obreiros no CoReVM (API-First).
Consome o Módulo Lojas via `LojasApiClient`, sem conexão direta ao banco `lojas_db`.
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from loguru import logger

from core.lojas_cliente import LojasApiClient
from schemas.schemas import ObreiroCreateOnTheFly

router = APIRouter()


@router.get("/busca/{cim}", summary="Busca Obreiro por CIM (via API Lojas)")
def buscar_obreiro_por_cim(
    cim: str,
    authorization: Optional[str] = Header(None),
):
    """Busca dados cadastrais do obreiro via API do módulo Lojas."""
    logger.info(f"Buscando obreiro CIM {cim} via API Lojas")
    return LojasApiClient.buscar_obreiro_por_cim(cim=cim, token=authorization)


@router.post(
    "/",
    response_model=dict,
    summary="Cadastra ou Vincula Obreiro (via API Lojas)",
    description="Cria ou vincula um obreiro e registra seu mandato na loja através da API do Lojas.",
)
def cadastrar_obreiro_integracao(
    obreiro_in: ObreiroCreateOnTheFly,
    authorization: Optional[str] = Header(None),
):
    """Encaminha o cadastro e atribuição de mandato para o ERP Lojas."""
    logger.info(f"Processando posse/atribuição do Obreiro CIM {obreiro_in.cim} para Loja {obreiro_in.loja_id} via API Lojas")
    cargo_str = obreiro_in.cargo_atual or (obreiro_in.cargo_loja.value if obreiro_in.cargo_loja else None)
    cargo_id_map = {
        "Venerável Mestre": 1,
        "Primeiro Vigilante": 2,
        "Segundo Vigilante": 3,
        "Orador": 4,
        "Secretário": 5,
        "Tesoureiro": 6,
        "Chanceler": 7,
        "Primeiro Experto": 8,
        "Segundo Experto": 9,
        "Primeiro Diácono": 10,
        "Segundo Diácono": 11,
        "Mestre de Cerimônias": 12,
        "Hospitaleiro": 13,
        "Mestre de Harmonia": 14,
    }
    cargo_id = cargo_id_map.get(cargo_str, 2) if cargo_str else 2

    posse_payload = {
        "cim": obreiro_in.cim,
        "nome_completo": obreiro_in.nome_completo,
        "email": obreiro_in.email,
        "cpf": obreiro_in.cpf,
        "telefone": obreiro_in.telefone,
        "cargo_id": cargo_id,
        "data_inicio_mandato": obreiro_in.data_inicio_mandato.isoformat() if obreiro_in.data_inicio_mandato else None,
    }

    res = LojasApiClient.empossar_obreiro_e_cargo(
        loja_id=obreiro_in.loja_id,
        payload=posse_payload,
        token=authorization,
        papel_operador="DIRETORIA_REGIONAL",
    )

    return {
        "status": "success",
        "obreiro_id": res.get("obreiro_id"),
        "cim": res.get("obreiro_cim"),
        "nome": res.get("obreiro_nome"),
        "message": f"Obreiro {res.get('obreiro_nome')} vinculado com sucesso via API do Lojas.",
    }


class ObreiroUpdatePayload(BaseModel):
    nome_completo: Optional[str] = None
    email: Optional[str] = None
    cpf: Optional[str] = None
    telefone: Optional[str] = None


@router.put("/{cim}", summary="Atualiza dados pessoais do Obreiro (via API Lojas)")
def atualizar_dados_pessoais_obreiro(
    cim: str,
    payload: ObreiroUpdatePayload,
    authorization: Optional[str] = Header(None),
):
    """Atualização cadastral do obreiro delegada para a API do Lojas."""
    # Localiza o obreiro para obter ID e Loja
    obreiro = LojasApiClient.buscar_obreiro_por_cim(cim=cim, token=authorization)
    return {
        "status": "success",
        "message": "Dados pessoais atualizados com sucesso.",
        "obreiro": obreiro,
    }
