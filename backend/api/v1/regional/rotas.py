# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from loguru import logger
from typing import List, Optional
from datetime import date, timedelta
from pydantic import BaseModel

from database import get_db_core, get_db_lojas
from models.models import Regiao, DiretoriaConselho, LojaAgregada, AvisoRegional
from models.lojas_models import ObreiroIntegracao
from core.constants import CargoConselho
from schemas.schemas import RegiaoResponse, DiretoriaMembroResponse, DiretoriaUpdatePayload
from core.dependencies import get_current_director, get_current_regional_user, RegionalUserContext

router = APIRouter()

@router.get("/{regiao_id}/dashboard", response_model=RegiaoResponse, summary="Dashboard do Conselho", description="Obtém os dados completos da Região, acessível por membros autorizados do conselho.")
def obter_dashboard_regional(
    regiao_id: str, 
    user: RegionalUserContext = Depends(get_current_regional_user), 
    db: Session = Depends(get_db_core)
):
    """
    Retorna os dados do Conselho Regional se o usuário for membro (Diretoria, VM ou Suplente de Loja do Conselho).
    """
    logger.info(f"Gerando Dashboard Regional {regiao_id} solicitado por {user.usuario_id} (Perfil: {user.role})")
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    
    if not regiao:
        raise HTTPException(status_code=404, detail="Região não encontrada.")
        
    return regiao

@router.get("/{regiao_id}/me", summary="Obtém o contexto e permissões do usuário atual no conselho")
def obter_meu_contexto_regional(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user)
):
    """
    Retorna papel e escopo do usuário ativo (ex: se é diretoria ou de qual loja específica é o VM).
    """
    return {
        "usuario_id": user.usuario_id,
        "role": user.role,
        "is_diretoria": user.is_diretoria,
        "loja_id": user.loja_id,
        "regiao_id": user.regiao_id
    }

@router.get("/{regiao_id}/diretoria", response_model=List[DiretoriaMembroResponse], summary="Obtém Diretoria Enriquecida do Conselho")
def obter_diretoria_regional(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Retorna a composição da mesa diretora do conselho com os dados cadastrais (nome, CIM, e-mail) obtidos de lojas_db.
    """
    diretoria = db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).all()
    if not diretoria:
        return []

    user_ids = [d.usuario_id for d in diretoria if d.usuario_id]
    obreiros_map = {}
    if user_ids:
        obreiros = db_lojas.query(ObreiroIntegracao).filter(
            (ObreiroIntegracao.cim.in_(user_ids)) |
            (ObreiroIntegracao.cpf.in_(user_ids))
        ).all()
        for o in obreiros:
            obreiros_map[o.cim] = o
            if o.cpf:
                obreiros_map[o.cpf] = o
            obreiros_map[str(o.id)] = o

    resultado = []
    for d in diretoria:
        o = obreiros_map.get(d.usuario_id)
        resultado.append(DiretoriaMembroResponse(
            id=d.id,
            usuario_id=d.usuario_id,
            cargo=d.cargo,
            inicio_mandato=d.inicio_mandato,
            termino_mandato=d.termino_mandato,
            nome_completo=o.nome_completo if o else None,
            cim=o.cim if o else (d.usuario_id if d.usuario_id.isdigit() else None),
            email=o.email if o else None,
            telefone=o.telefone if o else None
        ))
    return resultado

@router.put("/{regiao_id}/diretoria", summary="Atualiza Diretoria e Mandato do Conselho")
def atualizar_diretoria_regional(
    regiao_id: str,
    payload: DiretoriaUpdatePayload,
    diretor: RegionalUserContext = Depends(get_current_director),
    db_core: Session = Depends(get_db_core)
):
    """
    Atualiza a composição da mesa diretora e as datas do mandato. Exclusivo para Diretoria/SuperAdmin.
    """
    logger.info(f"Atualizando diretoria da Região {regiao_id} por {diretor.usuario_id}")
    db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).delete()

    inicio = payload.inicio_mandato or date.today()
    termino = payload.termino_mandato or (date.today() + timedelta(days=365))

    novos = [
        (payload.presidente_id, CargoConselho.PRESIDENTE),
        (payload.vice_presidente_id, CargoConselho.VICE_PRESIDENTE),
        (payload.secretario_id, CargoConselho.SECRETARIO),
    ]

    for uid, cargo in novos:
        if uid and uid.strip():
            db_core.add(DiretoriaConselho(
                regiao_id=regiao_id,
                usuario_id=uid.strip(),
                cargo=cargo,
                inicio_mandato=inicio,
                termino_mandato=termino
            ))

    db_core.commit()
    return {"message": "Diretoria e mandatos atualizados com sucesso"}

class LojaAddRequest(BaseModel):
    loja_id: str

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

class AvisoCreatePayload(BaseModel):
    titulo: str
    conteudo: str
    tipo: Optional[str] = "COMUNICADO"
    fixado: Optional[bool] = False

@router.get("/{regiao_id}/avisos", summary="Lista os avisos e notificações do conselho")
def listar_avisos_regionais(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Retorna os avisos da região ordenados por fixados primeiro e data mais recente.
    """
    avisos = db.query(AvisoRegional).filter(
        AvisoRegional.regiao_id == regiao_id
    ).order_by(
        AvisoRegional.fixado.desc(),
        AvisoRegional.data_publicacao.desc(),
        AvisoRegional.id.desc()
    ).all()
    
    return [
        {
            "id": a.id,
            "titulo": a.titulo,
            "conteudo": a.conteudo,
            "tipo": a.tipo,
            "autor_nome": a.autor_nome,
            "autor_cargo": a.autor_cargo,
            "fixado": a.fixado,
            "data_publicacao": a.data_publicacao.isoformat() if a.data_publicacao else None
        }
        for a in avisos
    ]

@router.post("/{regiao_id}/avisos", summary="Publica um novo aviso ou notificação no conselho")
def criar_aviso_regional(
    regiao_id: str,
    payload: AvisoCreatePayload,
    diretor: RegionalUserContext = Depends(get_current_director),
    db: Session = Depends(get_db_core)
):
    """
    Exclusivo para Diretoria ou SuperAdmin: publica um comunicado ou convocação.
    """
    novo_aviso = AvisoRegional(
        regiao_id=regiao_id,
        titulo=payload.titulo,
        conteudo=payload.conteudo,
        tipo=payload.tipo or "COMUNICADO",
        autor_nome="Diretoria do Conselho",
        autor_cargo=diretor.role,
        fixado=payload.fixado or False,
        data_publicacao=date.today()
    )
    db.add(novo_aviso)
    db.commit()
    db.refresh(novo_aviso)
    return {"status": "success", "aviso_id": novo_aviso.id, "message": "Aviso publicado com sucesso."}

@router.delete("/{regiao_id}/avisos/{aviso_id}", summary="Remove um aviso do conselho")
def excluir_aviso_regional(
    regiao_id: str,
    aviso_id: str,
    diretor: RegionalUserContext = Depends(get_current_director),
    db: Session = Depends(get_db_core)
):
    """
    Exclusivo para Diretoria ou SuperAdmin: remove um aviso.
    """
    aviso = db.query(AvisoRegional).filter(
        AvisoRegional.id == aviso_id,
        AvisoRegional.regiao_id == regiao_id
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado.")
    db.delete(aviso)
    db.commit()
    return {"status": "success", "message": "Aviso removido com sucesso."}

