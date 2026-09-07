from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db_core
from models.models import Regiao, DiretoriaConselho, CargoConselhoEnum
from schemas.schemas import RegiaoCreate, RegiaoResponse
from typing import List
from datetime import date, timedelta

router = APIRouter()

@router.post("/", response_model=RegiaoResponse)
def criar_regiao(regiao_in: RegiaoCreate, db: Session = Depends(get_db_core)):
    nova_regiao = Regiao(
        nome=regiao_in.nome,
        uf=regiao_in.uf,
        ativa=True
    )
    db.add(nova_regiao)
    db.flush()

    diretores = [
        (regiao_in.presidente_id, CargoConselhoEnum.PRESIDENTE),
        (regiao_in.vice_presidente_id, CargoConselhoEnum.VICE_PRESIDENTE),
        (regiao_in.secretario_id, CargoConselhoEnum.SECRETARIO)
    ]
    
    for user_id, cargo in diretores:
        if user_id:
            db.add(DiretoriaConselho(
                regiao_id=nova_regiao.id,
                usuario_id=user_id,
                cargo=cargo,
                inicio_mandato=date.today(),
                termino_mandato=date.today() + timedelta(days=365)
            ))

    if regiao_in.lojas_ids:
        insert_loja = text("""
            INSERT INTO lojas_agregadas (regiao_id, loja_id, data_filiacao, ativa)
            VALUES (:regiao_id, :loja_id, :data_filiacao, true)
        """)
        for loja_id in regiao_in.lojas_ids:
            db.execute(insert_loja, {
                "regiao_id": nova_regiao.id,
                "loja_id": loja_id,
                "data_filiacao": date.today()
            })
            
    db.commit()
    db.refresh(nova_regiao)
    return nova_regiao

@router.get("/", response_model=List[RegiaoResponse])
def listar_regioes(db: Session = Depends(get_db_core)):
    return db.query(Regiao).all()

@router.get("/{regiao_id}", response_model=RegiaoResponse)
def obter_regiao(regiao_id: str, db: Session = Depends(get_db_core)):
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    if not regiao:
        raise HTTPException(status_code=404, detail="Região não encontrada")
    return regiao

@router.put("/{regiao_id}", response_model=RegiaoResponse)
def atualizar_regiao(regiao_id: str, regiao_in: RegiaoCreate, db: Session = Depends(get_db_core)):
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    if not regiao:
        raise HTTPException(status_code=404, detail="Região não encontrada")
    
    regiao.nome = regiao_in.nome
    regiao.uf = regiao_in.uf
    db.commit()
    db.refresh(regiao)
    return regiao

@router.delete("/{regiao_id}")
def deletar_regiao(regiao_id: str, db: Session = Depends(get_db_core)):
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    if not regiao:
        raise HTTPException(status_code=404, detail="Região não encontrada")
    
    # Deletar diretoria vinculada primeiro (Cascade manual)
    db.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).delete()
    db.delete(regiao)
    db.commit()
    return {"message": "Região deletada com sucesso"}
