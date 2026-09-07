# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from loguru import logger
from database import get_db_lojas, get_db_lista
from models.lojas_models import LojaIntegracao
from schemas.schemas import LojaCreateOnTheFly

router = APIRouter()

@router.get("/busca", summary="Busca Lojas no banco global (lista_de_lojas_db)", description="Busca lojas pelo nome ou número na base unificada de todas as lojas.")
def buscar_lojas_global(q: str = Query(..., min_length=3), db_lista: Session = Depends(get_db_lista)):
    """
    Pesquisa as lojas globalmente na tabela 'lojas' do 'lista_de_lojas_db'.
    Cruza a busca pelo nome e pelo número da loja.
    """
    termo = f"%{q}%"
    try:
        # Supondo que a tabela seja "lojas" e tenha "id", "nome", e "numero"
        result = db_lista.execute(
            text("SELECT id, lodge_name, lodge_number, city, obedience_id FROM lodges WHERE lodge_name ILIKE :t OR lodge_number::text ILIKE :t OR city ILIKE :t LIMIT 20"),
            {"t": termo}
        ).fetchall()
        
        return [{"id": row[0], "nome": row[1], "numero_loja": str(row[2]), "cidade": row[3] if len(row) > 3 else '', "potencia": row[4] if len(row) > 4 else ''} for row in result]
    except Exception as e:
        logger.error(f"Erro ao buscar na lista_de_lojas_db: {e}")
        # Tenta fallback para Lojas Integracao (lojas_db) se a tabela for diferente
        try:
            db_lojas = next(get_db_lojas())
            lojas = db_lojas.query(LojaIntegracao).filter(
                (LojaIntegracao.nome_loja.ilike(termo)) | 
                (LojaIntegracao.numero_loja.ilike(termo)) |
                (LojaIntegracao.cidade.ilike(termo))
            ).limit(20).all()
            return [{"id": l.id, "nome": l.nome_loja, "numero_loja": l.numero_loja, "cidade": l.cidade} for l in lojas]
        except Exception as e2:
             logger.error(f"Erro no fallback: {e2}")
             return []

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
    
    subobediencia = loja_in.obediencia_id
    
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
