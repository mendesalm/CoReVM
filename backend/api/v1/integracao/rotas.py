# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from database import get_db_lojas, get_db_lista
from datetime import date

router = APIRouter()

class ObreiroCadastroBasico(BaseModel):
    nome_completo: str
    email: str
    cim: str
    loja_id: int

@router.get("/obreiros/{cim}")
def buscar_obreiro_por_cim(cim: str, db: Session = Depends(get_db_lojas)):
    # Buscamos diretamente no banco de Lojas (SSOT)
    query = text("SELECT id, nome_completo, cim FROM obreiros WHERE cim = :cim LIMIT 1")
    resultado = db.execute(query, {"cim": cim}).fetchone()
    
    if not resultado:
        raise HTTPException(status_code=404, detail="Obreiro não encontrado no e-sigma/Lojas")
        
    # Buscar lojas que ele pertence
    query_lojas = text("SELECT loja_id FROM obreiro_loja_associacoes WHERE obreiro_id = :obreiro_id AND status = 'Ativo'")
    lojas = db.execute(query_lojas, {"obreiro_id": resultado[0]}).fetchall()
    
    return {
        "id": resultado[0],
        "nome_completo": resultado[1],
        "cim": resultado[2],
        "lojas_ids": [l[0] for l in lojas]
    }

class VincularLojaRequest(BaseModel):
    loja_id: int

@router.post("/obreiros/{cim}/vincular-loja")
def vincular_obreiro_loja(cim: str, req: VincularLojaRequest, db: Session = Depends(get_db_lojas)):
    query = text("SELECT id FROM obreiros WHERE cim = :cim LIMIT 1")
    resultado = db.execute(query, {"cim": cim}).fetchone()
    if not resultado:
        raise HTTPException(status_code=404, detail="Obreiro não encontrado.")
        
    insert_assoc = text("""
        INSERT INTO obreiro_loja_associacoes (obreiro_id, loja_id, data_inicio, status, classe_obreiro)
        VALUES (:obreiro, :loja, :hoje, :status, :classe)
    """)
    db.execute(insert_assoc, {
        "obreiro": resultado[0],
        "loja": req.loja_id,
        "hoje": date.today(),
        "status": "Ativo",
        "classe": "Regular"
    })
    db.commit()
    return {"message": "Vinculado com sucesso"}

@router.post("/obreiros")
def cadastrar_obreiro_basico(cadastro: ObreiroCadastroBasico, db: Session = Depends(get_db_lojas)):
    # 1. Verifica se já existe
    query = text("SELECT id FROM obreiros WHERE cim = :cim OR email = :email LIMIT 1")
    if db.execute(query, {"cim": cadastro.cim, "email": cadastro.email}).fetchone():
        raise HTTPException(status_code=400, detail="CIM ou E-mail já cadastrado.")

    # 2. Insere na Tabela obreiros
    insert_obreiro = text("""
        INSERT INTO obreiros (nome_completo, email, cim, hash_senha, grau, status)
        VALUES (:nome, :email, :cim, :senha, :grau, :status)
        RETURNING id
    """)
    novo_obreiro_id = db.execute(insert_obreiro, {
        "nome": cadastro.nome_completo,
        "email": cadastro.email,
        "cim": cadastro.cim,
        "senha": "hash_provisorio", # Em produção seria um gerador de BCRYPT
        "grau": "Mestre Instalado", # Default para presidentes
        "status": "Ativo"
    }).scalar()

    # 3. Associa a uma loja 
    insert_assoc = text("""
        INSERT INTO obreiro_loja_associacoes (obreiro_id, loja_id, data_inicio, status, classe_obreiro)
        VALUES (:obreiro, :loja, :hoje, :status, :classe)
    """)
    db.execute(insert_assoc, {
        "obreiro": novo_obreiro_id,
        "loja": cadastro.loja_id,
        "hoje": date.today(),
        "status": "Ativo",
        "classe": "Regular"
    })

    db.commit()

    return {
        "message": "Obreiro criado e vinculado à loja com sucesso",
        "id": novo_obreiro_id,
        "nome_completo": cadastro.nome_completo
    }

@router.get("/lojas/busca")
def buscar_lojas(q: str = "", db: Session = Depends(get_db_lojas)):
    if len(q) < 3:
        return []
    query = text("SELECT id, nome_loja as nome, numero_loja as numero FROM lojas WHERE nome_loja ILIKE :q OR numero_loja::text ILIKE :q LIMIT 10")
    lojas = db.execute(query, {"q": f"%{q}%"}).fetchall()
    return [{"id": l[0], "nome": l[1], "numero": l[2]} for l in lojas]

class LojaCadastroBasico(BaseModel):
    numero: int
    nome: str
    potencia_id: int
    obediencia_id: int

@router.post("/lojas")
def cadastrar_loja_basica(loja: LojaCadastroBasico, db: Session = Depends(get_db_lojas)):
    query = text("SELECT id FROM lojas WHERE numero_loja = :numero LIMIT 1")
    if db.execute(query, {"numero": loja.numero}).fetchone():
        raise HTTPException(status_code=400, detail="Loja já cadastrada com este número.")

    insert_loja = text("""
        INSERT INTO lojas (numero_loja, nome_loja, ativo, status, obediencia_id, subobediencia_id)
        VALUES (:numero, :nome, true, 'Ativo', :potencia_id, :obediencia_id)
        RETURNING id
    """)
    nova_loja_id = db.execute(insert_loja, {
        "numero": loja.numero,
        "nome": loja.nome,
        "potencia_id": loja.potencia_id,
        "obediencia_id": loja.obediencia_id
    }).scalar()
    db.commit()
    return {"message": "Loja cadastrada", "id": nova_loja_id, "nome": loja.nome}

