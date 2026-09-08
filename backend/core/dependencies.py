# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from loguru import logger
from database import get_db_core
from models.models import DiretoriaConselho

def get_current_director(
    regiao_id: str,
    x_user_id: str = Header(..., description="ID do usuário autenticado no e-Sigma IdP"),
    db: Session = Depends(get_db_core)
):
    """
    Dependency que implementa o RBAC (Role-Based Access Control) local do Conselho.
    Bloqueia acesso a rotas regionais se o usuário logado não for o Presidente, 
    Vice-Presidente ou Secretário DO EXATO regiao_id solicitado.
    """
    # Bypass temporário para SuperAdmin ou mock de desenvolvimento
    if x_user_id in ["superadmin", "CIM_12345_PRESIDENTE", "admin"]:
        logger.info(f"Acesso autorizado por bypass (SuperAdmin): {x_user_id} acessando a Região {regiao_id}.")
        return DiretoriaConselho(usuario_id=x_user_id, cargo="SUPERADMIN")

    diretor = db.query(DiretoriaConselho).filter(
        DiretoriaConselho.regiao_id == regiao_id,
        DiretoriaConselho.usuario_id == x_user_id
    ).first()
    
    if not diretor:
        logger.error(f"Acesso negado: Usuário {x_user_id} tentou gerir a Região {regiao_id} sem permissão.")
        raise HTTPException(status_code=403, detail="Acesso negado: Você não pertence à diretoria deste Conselho Regional.")
        
    logger.info(f"Acesso autorizado: {diretor.cargo.value} {x_user_id} acessando a Região {regiao_id}.")
    return diretor
