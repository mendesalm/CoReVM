# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Rotas de Integração do CoReVM com o Módulo Lojas (API-First).
Consome a API oficial do módulo Lojas via `LojasApiClient`, sem conexão direta
ou queries ao banco `lojas_db`, garantindo a separação e isolamento de domínios.
"""
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel
from loguru import logger

from core.lojas_cliente import LojasApiClient
from schemas.schemas import LojaCreateOnTheFly, ObreiroCreateOnTheFly

router = APIRouter()


@router.get(
    "/busca",
    summary="Busca Lojas (via API Lojas)",
    description="Busca lojas pelo nome, número ou cidade consumindo a API oficial do módulo Lojas.",
)
def buscar_lojas_global(
    q: str = Query(..., min_length=3),
    authorization: Optional[str] = Header(None),
):
    """Encaminha a pesquisa de lojas para a API do módulo Lojas."""
    logger.info(f"CoReVM consumindo API Lojas para busca: '{q}'")
    return LojasApiClient.buscar_lojas_global(termo=q, token=authorization)


@router.post(
    "/busca/multiplas",
    summary="Busca múltiplas lojas por ID (via API Lojas)",
    description="Retorna os detalhes de várias lojas consumindo a API oficial do módulo Lojas.",
)
def buscar_lojas_multiplas(
    ids: list[int],
    authorization: Optional[str] = Header(None),
):
    """Consulta lote de lojas via API do módulo Lojas."""
    return LojasApiClient.buscar_lojas_multiplas(ids=ids, token=authorization)


@router.post(
    "/status_vm",
    summary="Verifica status de Venerável Mestre (via API Lojas)",
    description="Retorna os nomes dos VMs cadastrados nas lojas solicitadas via API.",
)
def verificar_status_vm(
    ids: list[int],
    authorization: Optional[str] = Header(None),
):
    """Verifica status de VM em lote via API do módulo Lojas."""
    return LojasApiClient.verificar_status_vm(ids=ids, token=authorization)


@router.post(
    "/",
    response_model=dict,
    summary="Cadastra Loja On-the-Fly (via API Lojas)",
    description="Cria uma loja através da API do módulo Lojas respeitando as regras institucionais.",
)
def cadastrar_loja_integracao(
    loja_in: LojaCreateOnTheFly,
    authorization: Optional[str] = Header(None),
):
    """Criação de loja delegada para a API do Lojas."""
    logger.info(f"Solicitando cadastro on-the-fly da Loja {loja_in.numero_loja} via API Lojas")
    return LojasApiClient.cadastrar_loja(loja_in.model_dump(), token=authorization)


class LojaUpdatePayload(BaseModel):
    nome: Optional[str] = None
    numero: Optional[str] = None
    rito: Optional[str] = None
    cidade: Optional[str] = None
    logradouro: Optional[str] = None
    numero_endereco: Optional[str] = None
    complemento: Optional[str] = None
    bairro: Optional[str] = None
    estado: Optional[str] = None
    cep: Optional[str] = None
    dia_sessao: Optional[str] = None
    periodicidade: Optional[str] = None
    horario_sessao: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    site: Optional[str] = None
    cnpj: Optional[str] = None


@router.put(
    "/{loja_id}",
    summary="Atualiza dados cadastrais de uma Loja (via API Lojas)",
    description="Atualiza dados da loja através da API do módulo Lojas.",
)
def atualizar_loja_integracao(
    loja_id: int,
    loja_in: LojaUpdatePayload,
    authorization: Optional[str] = Header(None),
):
    """Atualização cadastral da loja delegada para a API do Lojas."""
    logger.info(f"Atualizando cadastro da Loja {loja_id} via API Lojas")
    payload = loja_in.model_dump(exclude_unset=True)
    return LojasApiClient.atualizar_loja(
        loja_id=loja_id,
        payload=payload,
        token=authorization,
        papel_operador="DIRETORIA_REGIONAL",
    )


class VmMandatoUpdatePayload(BaseModel):
    data_inicio: Optional[date] = None
    nome_completo: Optional[str] = None
    email: Optional[str] = None
    cpf: Optional[str] = None
    telefone: Optional[str] = None


@router.get(
    "/{loja_id}/vm",
    summary="Obtém detalhes do Venerável Mestre ativo da loja (via API Lojas)",
)
def obter_vm_ativo(
    loja_id: int,
    authorization: Optional[str] = Header(None),
):
    """Consulta VM ativo via API do Lojas."""
    return LojasApiClient.obter_vm_ativo(loja_id=loja_id, token=authorization)


@router.put(
    "/{loja_id}/vm",
    summary="Atualiza dados do Venerável Mestre ou do Mandato ativo (via API Lojas)",
)
def atualizar_vm_ativo(
    loja_id: int,
    payload: VmMandatoUpdatePayload,
    authorization: Optional[str] = Header(None),
):
    """Atualização de VM delegada para a API do Lojas."""
    logger.info(f"Atualizando VM da Loja {loja_id} via API Lojas")
    return LojasApiClient.atualizar_vm_ativo(
        loja_id=loja_id,
        payload=payload.model_dump(exclude_unset=True),
        token=authorization,
        papel_operador="DIRETORIA_REGIONAL",
    )


@router.delete(
    "/{loja_id}/vm",
    summary="Encerra o mandato do Venerável Mestre da loja (via API Lojas)",
)
def encerrar_mandato_vm(
    loja_id: int,
    authorization: Optional[str] = Header(None),
):
    """Encerramento de mandato de VM delegado para a API do Lojas."""
    logger.info(f"Encerrando mandato de VM da Loja {loja_id} via API Lojas")
    return LojasApiClient.encerrar_mandato_vm(
        loja_id=loja_id,
        token=authorization,
        papel_operador="DIRETORIA_REGIONAL",
    )


@router.get(
    "/{loja_id}/vm/historico",
    summary="Histórico de mandatos de Veneráveis Mestres da loja (via API Lojas)",
)
def historico_mandatos_vm(
    loja_id: int,
    authorization: Optional[str] = Header(None),
):
    """Consulta histórico de mandatos de VM via API do Lojas."""
    return LojasApiClient.historico_mandatos_vm(loja_id=loja_id, token=authorization)


@router.post(
    "/obreiros/",
    response_model=dict,
    summary="Cadastra/Atualiza Obreiro On-the-Fly e Empossa Cargo (via API Lojas)",
    description=(
        "Localiza ou cria o Obreiro e empossa no cargo indicado delegando para a API "
        "do módulo Lojas, preservando encerramento anterior e titulação de Mestre Instalado."
    ),
)
def cadastrar_obreiro_integracao(
    obreiro_in: ObreiroCreateOnTheFly,
    authorization: Optional[str] = Header(None),
):
    """Posse de cargo e admissão delegadas para a API do Lojas."""
    cargo_id = 1 if obreiro_in.cargo_atual == "Venerável Mestre" else 1
    posse_payload = {
        "cim": obreiro_in.cim,
        "nome_completo": obreiro_in.nome_completo,
        "email": obreiro_in.email,
        "cpf": obreiro_in.cpf,
        "telefone": obreiro_in.telefone,
        "cargo_id": cargo_id,
        "data_inicio_mandato": obreiro_in.data_inicio_mandato.isoformat() if obreiro_in.data_inicio_mandato else None,
    }
    logger.info(
        f"Empossando obreiro CIM={obreiro_in.cim} na Loja {obreiro_in.loja_id} via API Lojas (cargo={obreiro_in.cargo_atual})"
    )
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
        "nome_completo": res.get("obreiro_nome"),
        "message": f"Novo Venerável Mestre (Ir. {res.get('obreiro_nome')}) empossado com sucesso via API do Lojas.",
        "titular_anterior_marcado_mestre_instalado": res.get("titular_anterior_marcado_mestre_instalado", False),
    }
