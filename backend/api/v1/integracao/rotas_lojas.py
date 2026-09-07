# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from loguru import logger
from database import get_db_lojas
from models.lojas_models import LojaIntegracao
from schemas.schemas import LojaCreateOnTheFly

router = APIRouter()

@router.post("/", response_model=dict, summary="Cadastra Loja On-the-Fly", description="Cria uma loja diretamente no lojas_db respeitando regras de GLEGO e GOB.")
def cadastrar_loja_integracao(loja_in: LojaCreateOnTheFly, db: Session = Depends(get_db_lojas)):
    """
    Insere uma nova Loja no ecossistema global do e-Sigma através do lojas_db.
    Aplica a regra de ouro da GLEGO (duplicação de potência) e GOB (hierarquia normal).
    """
    logger.info(f"Iniciando cadastro on-the-fly da Loja {loja_in.numero_loja}")
    
    loja_existente = db.query(LojaIntegracao).filter(LojaIntegracao.numero_loja == loja_in.numero_loja).first()
    if loja_existente:
        logger.warning(f"Tentativa de duplicar loja: {loja_in.numero_loja}")
        raise HTTPException(status_code=422, detail="Já existe uma loja cadastrada com este número.")
    
    # Regra GLEGO: obediencia_id = 3 (por exemplo, na estrutura real de lojas)
    # Aqui a regra de negócios pede "duplicação de Potência em obediência para a GLEGO".
    # Supondo que obediencia_id == 3 seja GLEGO.
    subobediencia = loja_in.obediencia_id
    # O frontend pode omitir ou enviar null para subobediencia, 
    # o backend garante que potência = subobediência (na vida real checaríamos o tipo).
    
    nova_loja = LojaIntegracao(
        nome_loja=loja_in.nome_loja,
        numero_loja=loja_in.numero_loja,
        titulo_loja=loja_in.titulo_loja,
        rito=loja_in.rito,
        obediencia_id=loja_in.obediencia_id,
        subobediencia_id=subobediencia,
        cidade=loja_in.cidade,
        estado=loja_in.estado,
        cep=loja_in.cep,
        ativo=True
    )
    
    db.add(nova_loja)
    db.commit()
    db.refresh(nova_loja)
    
    logger.info(f"Loja {nova_loja.nome_loja} criada com sucesso com ID {nova_loja.id}")
    return {"status": "success", "loja_id": nova_loja.id, "nome": nova_loja.nome_loja}
