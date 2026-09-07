# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import date
from loguru import logger
from database import get_db_lojas
from models.lojas_models import ObreiroIntegracao, ObreiroLojaAssociacao, Mandato
from schemas.schemas import ObreiroCreateOnTheFly

router = APIRouter()

@router.post("/", response_model=dict, summary="Cadastra Obreiro On-the-Fly", description="Cria um obreiro e registra seu mandato inicial no lojas_db.")
def cadastrar_obreiro_integracao(obreiro_in: ObreiroCreateOnTheFly, db: Session = Depends(get_db_lojas)):
    """
    Insere um novo Obreiro no ecossistema global do e-Sigma através do lojas_db.
    Garante a anti-duplicidade cruzada de CPF, CIM e Email.
    Cria a associação com a Loja e registra na tabela de Mandatos.
    """
    logger.info(f"Iniciando cadastro on-the-fly do Obreiro CIM: {obreiro_in.cim}")
    
    # 1. Validação de Duplicidade Cruzada
    duplicado = db.query(ObreiroIntegracao).filter(
        or_(
            ObreiroIntegracao.cim == obreiro_in.cim,
            ObreiroIntegracao.cpf == obreiro_in.cpf,
            ObreiroIntegracao.email == obreiro_in.email
        )
    ).first()
    
    if duplicado:
        logger.warning(f"Conflito de duplicidade para o Obreiro {obreiro_in.cim}")
        raise HTTPException(
            status_code=422, 
            detail="Duplicidade detectada! Já existe um membro com este CIM, CPF ou E-mail cadastrado."
        )
    
    # 2. Criação do Obreiro
    novo_obreiro = ObreiroIntegracao(
        cim=obreiro_in.cim,
        nome_completo=obreiro_in.nome_completo,
        email=obreiro_in.email,
        cpf=obreiro_in.cpf,
        telefone=obreiro_in.telefone,
        ativo=True
    )
    
    db.add(novo_obreiro)
    db.flush() # Para pegar o ID
    
    # 3. Associação à Loja (Cargo Atual)
    # Supondo enum mapping no banco original (ex: Venerável Mestre = ID X)
    cargo_id = 1 if obreiro_in.cargo_loja == "Venerável Mestre" else 2 # Simplificação para o exemplo
    
    associacao = ObreiroLojaAssociacao(
        obreiro_id=novo_obreiro.id,
        loja_id=obreiro_in.loja_id,
        cargo_id=cargo_id
    )
    db.add(associacao)
    
    # 4. Histórico de Mandato
    mandato = Mandato(
        obreiro_id=novo_obreiro.id,
        loja_id=obreiro_in.loja_id,
        cargo_id=cargo_id,
        inicio_mandato=date.today()
    )
    db.add(mandato)
    
    db.commit()
    db.refresh(novo_obreiro)
    
    logger.info(f"Obreiro {novo_obreiro.nome_completo} criado com sucesso com ID {novo_obreiro.id}")
    return {"status": "success", "obreiro_id": novo_obreiro.id, "cim": novo_obreiro.cim}
