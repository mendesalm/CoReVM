# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import uuid
from sqlalchemy import Column, Integer, String, Boolean, Date, Enum, ForeignKey
from database import Base

def generate_uuid():
    return str(uuid.uuid4())

class LojaIntegracao(Base):
    __tablename__ = "lojas"
    
    id = Column(Integer, primary_key=True, index=True)
    nome_loja = Column(String(255), nullable=False)
    titulo_loja = Column(String(50), nullable=True, default="ARLS")
    codigo_loja = Column(String(36), unique=True, index=True, default=generate_uuid)
    numero_loja = Column(String(255))
    rito = Column(String(50), nullable=True)
    obediencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=False)
    subobediencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=True)
    cidade = Column(String(100), nullable=True)
    estado = Column(String(2), nullable=True)
    cep = Column(String(9), nullable=True)
    ativo = Column(Boolean, default=True)
    
    # Campos que parecem obrigatórios no BD original
    nome_contato_tecnico = Column(String(255), nullable=False, default="Admin")
    email_contato_tecnico = Column(String(255), nullable=False, default="admin@admin.com")

class ObreiroIntegracao(Base):
    __tablename__ = "obreiros"
    
    id = Column(Integer, primary_key=True, index=True)
    cim = Column(String(50), unique=True, index=True, nullable=False)
    nome_completo = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=True)
    cpf = Column(String(14), unique=True, index=True, nullable=True)
    telefone = Column(String(20), nullable=True)
    ativo = Column(Boolean, default=True)

class ObreiroLojaAssociacao(Base):
    __tablename__ = "obreiros_lojas_associacao"
    
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), primary_key=True)
    loja_id = Column(Integer, ForeignKey("lojas.id"), primary_key=True)
    cargo_id = Column(Integer, nullable=True)

class Mandato(Base):
    __tablename__ = "mandatos"
    id = Column(Integer, primary_key=True, index=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    cargo_id = Column(Integer, nullable=False)
    inicio_mandato = Column(Date, nullable=False)
