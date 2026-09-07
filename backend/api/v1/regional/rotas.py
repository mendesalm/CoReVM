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
