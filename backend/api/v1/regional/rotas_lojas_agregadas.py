# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Módulo de Gestão de Lojas Jurisdicionadas, Suplência, Operadores Administrativos
e Transmissão Emergencial de Cargo.
Isolado com arquitetura API-First: 100% via LojasApiClient.
"""
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from loguru import logger
from pydantic import BaseModel

from database import get_db_core
from models.models import (
    LojaAgregada, SuplenteConselho, OperadorAdministrativoLoja
)
from schemas.schemas import TransmissaoEmergencialVmPayload
from core.dependencies import (
    get_current_director, get_current_regional_user, RegionalUserContext,
    obter_identidade_regional_ou_operador_administrativo, OperadorAdministrativoContext
)
from core.lojas_cliente import LojasApiClient
from core.auditoria_service import registrar_auditoria

router = APIRouter()


SLOTS_OPERADOR_ADMINISTRATIVO_VALIDOS = ["SECRETARIO", "CHANCELER"]


# ==============================================================================
# SCHEMAS DE ENTRADA
# ==============================================================================

class LojaAddRequest(BaseModel):
    loja_id: str


class SuplenteDesignarPayload(BaseModel):
    usuario_id: str  # CIM ou CPF do oficial escolhido


class OperadorAdministrativoDesignarPayload(BaseModel):
    usuario_id: str  # CIM ou CPF do oficial escolhido


# ==============================================================================
# HELPERS DE AUTORIZAÇÃO E BUSCA
# ==============================================================================

def _obter_loja_agregada_ou_404(db_core: Session, regiao_id: str, loja_id: str) -> LojaAgregada:
    agregada = db_core.query(LojaAgregada).filter_by(
        regiao_id=regiao_id, loja_id=str(loja_id), ativa=True
    ).first()
    if not agregada:
        raise HTTPException(status_code=404, detail="Esta Loja não está vinculada (ou não está ativa) neste Conselho.")
    return agregada


def _exigir_vm_da_loja_ou_diretoria(user: RegionalUserContext, loja_id: str):
    if user.is_diretoria:
        return
    if user.role == "VENERAVEL" and str(user.loja_id) == str(loja_id):
        return
    raise HTTPException(
        status_code=403,
        detail="Acesso negado: apenas o Venerável Mestre desta Loja ou a Diretoria do Conselho podem realizar esta ação."
    )


# ==============================================================================
# ROTAS: LOJAS JURISDICIONADAS
# ==============================================================================

@router.get("/{regiao_id}/lojas", summary="Lista as Lojas Jurisdicionadas do Conselho")
def listar_lojas_conselho(
    regiao_id: str,
    user = Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core)
):
    """
    Retorna as lojas agregadas ao conselho com nomes, números e detalhes obtidos via LojasApiClient.
    Um Operador Administrativo (Secretário/Chanceler) recebe só a própria Loja.
    """
    agregadas = db_core.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()

    if isinstance(user, OperadorAdministrativoContext):
        agregadas = [a for a in agregadas if str(a.loja_id) == str(user.loja_id)]

    if not agregadas:
        return {"lojas": []}

    ids = [int(a.loja_id) for a in agregadas if a.loja_id.isdigit()]
    lojas_info = {}
    if ids:
        try:
            lojas_api_list = LojasApiClient.buscar_lojas_multiplas(ids)
            for l in lojas_api_list:
                lojas_info[str(l.get("id"))] = l
        except Exception as e:
            logger.warning(f"Não foi possível obter dados enriquecidos de lojas via API: {e}")

    suplentes_map = {
        s.loja_id: s for s in db_core.query(SuplenteConselho).filter(
            SuplenteConselho.loja_id.in_([a.loja_id for a in agregadas])
        ).all()
    }

    resultado = []
    for a in agregadas:
        info = lojas_info.get(a.loja_id, {})
        suplente = suplentes_map.get(a.loja_id)
        resultado.append({
            "id": a.loja_id,
            "nome": info.get("nome_loja") or f"Loja {a.loja_id}",
            "numero": str(info.get("numero_loja") or "S/N"),
            "rito": info.get("rito"),
            "cidade": info.get("cidade"),
            "ativa": a.ativa,
            "estado": info.get("estado"),
            "cep": info.get("cep"),
            "logradouro": info.get("logradouro"),
            "numero_endereco": info.get("numero_endereco"),
            "complemento": info.get("complemento"),
            "bairro": info.get("bairro"),
            "dia_sessao": info.get("dia_sessao"),
            "periodicidade": info.get("periodicidade"),
            "horario_sessao": info.get("horario_sessao"),
            "email": info.get("email"),
            "telefone": info.get("telefone"),
            "site": info.get("site"),
            "cnpj": info.get("cnpj"),
            "suplente_usuario_id": suplente.usuario_id if suplente else None,
            "suplente_nome": suplente.nome_suplente if suplente else None,
            "suplente_email": suplente.email_suplente if suplente else None,
            "suplente_pode_indicar_veneravel": bool(suplente.pode_indicar_veneravel) if suplente else False,
        })

    resultado.sort(key=lambda x: int(x["numero"]) if x["numero"] and x["numero"].isdigit() else 999999)
    return {"lojas": resultado}


@router.post("/{regiao_id}/lojas", summary="Adiciona uma Loja ao Conselho")
def adicionar_loja_conselho(
    regiao_id: str,
    request: LojaAddRequest,
    diretor: RegionalUserContext = Depends(get_current_director),
    db: Session = Depends(get_db_core)
):
    existente = db.query(LojaAgregada).filter_by(regiao_id=regiao_id, loja_id=request.loja_id).first()
    if existente:
        raise HTTPException(status_code=400, detail="Esta loja já faz parte deste conselho.")

    nova_loja = LojaAgregada(
        regiao_id=regiao_id,
        loja_id=request.loja_id,
        data_filiacao=date.today(),
        ativa=True
    )
    db.add(nova_loja)
    db.commit()
    return {"message": "Loja vinculada ao conselho com sucesso"}


@router.delete("/{regiao_id}/lojas/{loja_id}", summary="Remove uma Loja do Conselho")
def remover_loja_conselho(
    regiao_id: str,
    loja_id: str,
    diretor: RegionalUserContext = Depends(get_current_director),
    db: Session = Depends(get_db_core)
):
    loja = db.query(LojaAgregada).filter_by(regiao_id=regiao_id, loja_id=loja_id).first()
    if not loja:
        raise HTTPException(status_code=404, detail="Loja não encontrada neste conselho.")

    db.delete(loja)
    db.commit()
    return {"message": "Loja desvinculada do conselho com sucesso"}


# ==============================================================================
# ROTAS: OFICIAIS E SUPLÊNCIA DO CONSELHO
# ==============================================================================

@router.get("/{regiao_id}/lojas/{loja_id}/oficiais", summary="Lista os oficiais elegíveis a Suplente do Conselho de uma Loja")
def listar_oficiais_loja(
    regiao_id: str,
    loja_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    """
    Retorna os ocupantes ativos dos 6 cargos eletivos da Loja elegíveis à cadeira de Suplente
    e Mestres Instalados ativos na Loja, via LojasApiClient.
    """
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)

    if not str(loja_id).isdigit():
        return {"oficiais": []}

    oficiais = LojasApiClient.listar_oficiais_loja(int(loja_id))
    return {"oficiais": oficiais}


@router.put("/{regiao_id}/lojas/{loja_id}/suplente", summary="Designa (ou substitui) o Suplente do Conselho de uma Loja")
def designar_suplente_conselho(
    regiao_id: str,
    loja_id: str,
    payload: SuplenteDesignarPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    """
    Designação livre de Suplente: o Venerável Mestre da própria Loja ou Diretoria do Conselho
    pode escolher qualquer um dos 6 oficiais eletivos ou Mestre Instalado da Loja.
    Validação realizada via LojasApiClient.
    """
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    _exigir_vm_da_loja_ou_diretoria(user, loja_id)

    if not str(loja_id).isdigit():
        raise HTTPException(status_code=400, detail="Loja inválida.")

    validacao = LojasApiClient.validar_oficial_elegivel(int(loja_id), payload.usuario_id)
    if not validacao.get("valido"):
        raise HTTPException(
            status_code=400,
            detail=validacao.get("motivo", "O oficial escolhido não é elegível para Suplente desta Loja.")
        )

    obreiro = validacao.get("obreiro") or {}
    cim = obreiro.get("cim") or payload.usuario_id
    nome = obreiro.get("nome_completo") or f"Ir. {cim}"
    email = obreiro.get("email")

    db_core.query(SuplenteConselho).filter_by(loja_id=str(loja_id)).delete()
    novo_suplente = SuplenteConselho(
        loja_id=str(loja_id),
        usuario_id=cim,
        nome_suplente=nome,
        email_suplente=email,
    )
    db_core.add(novo_suplente)
    db_core.commit()

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=user.usuario_id,
        usuario_cargo=user.role,
        acao="DESIGNACAO_SUPLENTE",
        entidade="SuplenteConselho",
        entidade_id=str(loja_id),
        detalhes={"loja_id": str(loja_id), "suplente_cim": cim, "suplente_nome": nome},
    )

    logger.info(f"Suplente do Conselho designado: Loja {loja_id} -> {nome} ({cim}), por {user.usuario_id} (Região {regiao_id})")
    return {
        "message": "Suplente designado com sucesso.",
        "usuario_id": cim,
        "nome_suplente": nome,
        "email_suplente": email,
    }


@router.delete("/{regiao_id}/lojas/{loja_id}/suplente", summary="Remove a designação de Suplente do Conselho de uma Loja")
def remover_suplente_conselho(
    regiao_id: str,
    loja_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    _exigir_vm_da_loja_ou_diretoria(user, loja_id)

    removido = db_core.query(SuplenteConselho).filter_by(loja_id=str(loja_id)).delete()
    db_core.commit()
    if not removido:
        raise HTTPException(status_code=404, detail="Esta Loja não possui Suplente designado atualmente.")

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=user.usuario_id,
        usuario_cargo=user.role,
        acao="REMOCAO_SUPLENTE",
        entidade="SuplenteConselho",
        entidade_id=str(loja_id),
        detalhes={"loja_id": str(loja_id)},
    )

    return {"message": "Designação de Suplente removida com sucesso."}



# ==============================================================================
# ROTAS: OPERADORES ADMINISTRATIVOS DA LOJA (SECRETÁRIO / CHANCELER)
# ==============================================================================

@router.get("/{regiao_id}/lojas/{loja_id}/operadores-administrativos", summary="Lista quem ocupa os slots de Operador Administrativo da Loja")
def listar_operadores_administrativos(
    regiao_id: str,
    loja_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)

    operadores = db_core.query(OperadorAdministrativoLoja).filter(
        OperadorAdministrativoLoja.loja_id == str(loja_id),
        OperadorAdministrativoLoja.ativo == True,
    ).all()
    mapa = {o.slot: o for o in operadores}

    return {
        "slots": [
            {
                "slot": slot,
                "ocupado": slot in mapa,
                "usuario_id": mapa[slot].usuario_id if slot in mapa else None,
                "nome_operador": mapa[slot].nome_operador if slot in mapa else None,
                "email_operador": mapa[slot].email_operador if slot in mapa else None,
                "designado_por": mapa[slot].designado_por if slot in mapa else None,
                "designado_em": mapa[slot].designado_em if slot in mapa else None,
            }
            for slot in SLOTS_OPERADOR_ADMINISTRATIVO_VALIDOS
        ]
    }


@router.put("/{regiao_id}/lojas/{loja_id}/operador-administrativo/{slot}", summary="Designa o ocupante de um slot de Operador Administrativo da Loja")
def designar_operador_administrativo(
    regiao_id: str,
    loja_id: str,
    slot: str,
    payload: OperadorAdministrativoDesignarPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    _exigir_vm_da_loja_ou_diretoria(user, loja_id)

    slot = slot.upper()
    if slot not in SLOTS_OPERADOR_ADMINISTRATIVO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Slot inválido. Use um de: {', '.join(SLOTS_OPERADOR_ADMINISTRATIVO_VALIDOS)}.")

    if not str(loja_id).isdigit():
        raise HTTPException(status_code=400, detail="Loja inválida.")

    validacao = LojasApiClient.validar_oficial_elegivel(int(loja_id), payload.usuario_id)
    if not validacao.get("valido"):
        raise HTTPException(
            status_code=400,
            detail=validacao.get("motivo", "O oficial escolhido não é elegível para Operador Administrativo desta Loja.")
        )

    obreiro = validacao.get("obreiro") or {}
    cim = obreiro.get("cim") or payload.usuario_id
    nome = obreiro.get("nome_completo") or f"Ir. {cim}"
    email = obreiro.get("email")

    db_core.query(OperadorAdministrativoLoja).filter_by(loja_id=str(loja_id), slot=slot).delete()
    novo_operador = OperadorAdministrativoLoja(
        loja_id=str(loja_id),
        slot=slot,
        usuario_id=cim,
        nome_operador=nome,
        email_operador=email,
        designado_por=user.usuario_id,
    )
    db_core.add(novo_operador)
    db_core.commit()

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=user.usuario_id,
        usuario_cargo=user.role,
        acao=f"DESIGNACAO_OPERADOR_{slot}",
        entidade="OperadorAdministrativoLoja",
        entidade_id=str(loja_id),
        detalhes={"loja_id": str(loja_id), "slot": slot, "operador_cim": cim, "operador_nome": nome},
    )

    logger.info(f"Operador Administrativo ({slot}) designado: Loja {loja_id} -> {nome} ({cim}), por {user.usuario_id} (Região {regiao_id})")
    return {
        "message": f"Operador Administrativo ({slot}) designado com sucesso.",
        "slot": slot,
        "usuario_id": cim,
        "nome_operador": nome,
    }


@router.delete("/{regiao_id}/lojas/{loja_id}/operador-administrativo/{slot}", summary="Remove a designação de um slot de Operador Administrativo")
def remover_operador_administrativo(
    regiao_id: str,
    loja_id: str,
    slot: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    _exigir_vm_da_loja_ou_diretoria(user, loja_id)

    slot = slot.upper()
    if slot not in SLOTS_OPERADOR_ADMINISTRATIVO_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Slot inválido. Use um de: {', '.join(SLOTS_OPERADOR_ADMINISTRATIVO_VALIDOS)}.")

    removido = db_core.query(OperadorAdministrativoLoja).filter_by(loja_id=str(loja_id), slot=slot).delete()
    db_core.commit()
    if not removido:
        raise HTTPException(status_code=404, detail=f"Esta Loja não possui Operador Administrativo designado no slot {slot} atualmente.")

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=user.usuario_id,
        usuario_cargo=user.role,
        acao=f"REMOCAO_OPERADOR_{slot}",
        entidade="OperadorAdministrativoLoja",
        entidade_id=str(loja_id),
        detalhes={"loja_id": str(loja_id), "slot": slot},
    )

    return {"message": f"Designação de Operador Administrativo ({slot}) removida com sucesso."}


# ==============================================================================
# ROTAS: TRANSMISSÃO EMERGENCIAL DE CARGO (VM)
# ==============================================================================

@router.post("/{regiao_id}/lojas/{loja_id}/transmissao-emergencial/conceder", summary="Concede poder de transmissão emergencial ao Mestre Instalado imediato")
def conceder_transmissao_emergencial_vm(
    regiao_id: str,
    loja_id: str,
    diretor: RegionalUserContext = Depends(get_current_director),
    db_core: Session = Depends(get_db_core)
):
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    if not str(loja_id).isdigit():
        raise HTTPException(status_code=400, detail="Loja inválida.")

    loja_id_int = int(loja_id)
    vm_atual = LojasApiClient.obter_vm_ativo(loja_id_int)
    if vm_atual and vm_atual.get("tem_vm"):
        raise HTTPException(
            status_code=400,
            detail="Esta Loja já possui Venerável Mestre em exercício — a transmissão emergencial só se aplica a Lojas órfãs (sem VM)."
        )

    historico = LojasApiClient.historico_mandatos_vm(loja_id_int)
    if not historico:
        raise HTTPException(
            status_code=400,
            detail="Não foi encontrado nenhum Venerável Mestre anterior para esta Loja — cadastre o novo VM manualmente."
        )

    ultimo_vm = historico[0]
    cim = ultimo_vm.get("cim")
    nome = ultimo_vm.get("nome_completo")

    db_core.query(SuplenteConselho).filter_by(loja_id=str(loja_id)).delete()
    novo_suplente = SuplenteConselho(
        loja_id=str(loja_id),
        usuario_id=cim,
        nome_suplente=nome,
        pode_indicar_veneravel=True,
        concedido_em=datetime.utcnow(),
    )
    db_core.add(novo_suplente)
    db_core.commit()

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=diretor.usuario_id,
        usuario_cargo=diretor.role,
        acao="CONCESSAO_TRANSMISSAO_EMERGENCIAL_VM",
        entidade="SuplenteConselho",
        entidade_id=str(loja_id),
        detalhes={"loja_id": str(loja_id), "mestre_instalado_cim": cim, "mestre_instalado_nome": nome},
    )

    logger.info(
        f"Poder de transmissão emergencial concedido: Loja {loja_id} -> {nome} ({cim}), por {diretor.usuario_id} (Região {regiao_id})"
    )
    return {
        "message": f"Poder de indicar o novo Venerável Mestre concedido a {nome} (Mestre Instalado imediato desta Loja).",
        "usuario_id": cim,
        "nome_completo": nome,
    }



@router.post("/{regiao_id}/lojas/{loja_id}/transmissao-emergencial/executar", summary="Executa a transmissão de cargo emergencial, empossando o novo VM")
def executar_transmissao_emergencial_vm(
    regiao_id: str,
    loja_id: str,
    payload: TransmissaoEmergencialVmPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    if not str(loja_id).isdigit():
        raise HTTPException(status_code=400, detail="Loja inválida.")

    loja_id_int = int(loja_id)
    suplente = db_core.query(SuplenteConselho).filter_by(loja_id=str(loja_id)).first()
    e_suplente_regente_autorizado = (
        suplente is not None
        and suplente.usuario_id == user.usuario_id
        and suplente.pode_indicar_veneravel
    )

    if not (user.is_diretoria or e_suplente_regente_autorizado):
        raise HTTPException(
            status_code=403,
            detail="Apenas a Diretoria do Conselho ou o Mestre Instalado imediato desta Loja (com poder concedido) podem executar esta ação."
        )

    vm_atual = LojasApiClient.obter_vm_ativo(loja_id_int)
    if vm_atual and vm_atual.get("tem_vm"):
        raise HTTPException(
            status_code=400,
            detail="Esta Loja já possui Venerável Mestre em exercício — a transmissão emergencial só se aplica a Lojas órfãs (sem VM)."
        )

    # Empossar novo VM via API do módulo Lojas
    payload_posse = {
        "cim": payload.cim,
        "nome_completo": payload.nome_completo,
        "email": payload.email,
        "cpf": payload.cpf,
        "telefone": payload.telefone,
        "cargo_id": 1,
        "data_inicio_mandato": payload.data_inicio_mandato.isoformat() if payload.data_inicio_mandato else date.today().isoformat(),
    }
    resultado = LojasApiClient.empossar_obreiro_e_cargo(loja_id_int, payload_posse)

    if e_suplente_regente_autorizado:
        suplente.pode_indicar_veneravel = False
        db_core.commit()

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=user.usuario_id,
        usuario_cargo=user.role,
        acao="EXECUCAO_TRANSMISSAO_EMERGENCIAL_VM",
        entidade="Mandato",
        entidade_id=str(loja_id),
        detalhes={"loja_id": str(loja_id), "novo_vm_cim": payload.cim, "novo_vm_nome": payload.nome_completo},
    )

    logger.info(
        f"Transmissão de cargo emergencial executada: Loja {loja_id} -> novo VM "
        f"{payload.nome_completo} ({payload.cim}), por {user.usuario_id} (Região {regiao_id})"
    )

    return {
        "message": f"Transmissão de cargo concluída: {resultado.get('message', 'Posse registrada com sucesso.')}",
        **resultado,
    }

