# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from loguru import logger
from database import get_db_core
from models.models import Regiao
from schemas.schemas import RegiaoResponse
from core.dependencies import get_current_director

router = APIRouter()

@router.get("/{regiao_id}/dashboard", response_model=RegiaoResponse, summary="Dashboard do Conselho", description="Obtém os dados completos da Região, protegidos por RBAC local.")
def obter_dashboard_regional(regiao_id: str, diretor: dict = Depends(get_current_director), db: Session = Depends(get_db_core)):
    """
    Retorna os dados do Conselho Regional (Lojas, Diretoria, etc.) apenas se o usuário for membro da diretoria deste conselho específico.
    """
    logger.info(f"Gerando Dashboard Regional para Região {regiao_id} solicitado por {diretor.usuario_id}")
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    
    if not regiao:
        raise HTTPException(status_code=404, detail="Região não encontrada.")
        
    return regiao

from models.models import LojaAgregada
from datetime import date
from pydantic import BaseModel

class LojaAddRequest(BaseModel):
    loja_id: str

@router.post("/{regiao_id}/lojas", summary="Adiciona uma Loja ao Conselho")
def adicionar_loja_conselho(regiao_id: str, request: LojaAddRequest, diretor: dict = Depends(get_current_director), db: Session = Depends(get_db_core)):
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
def remover_loja_conselho(regiao_id: str, loja_id: str, diretor: dict = Depends(get_current_director), db: Session = Depends(get_db_core)):
    loja = db.query(LojaAgregada).filter_by(regiao_id=regiao_id, loja_id=loja_id).first()
    if not loja:
        raise HTTPException(status_code=404, detail="Loja não encontrada neste conselho.")
        
    db.delete(loja)
    db.commit()
    return {"message": "Loja desvinculada do conselho com sucesso"}
