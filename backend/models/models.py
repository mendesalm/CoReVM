import enum
import uuid
from sqlalchemy import Column, String, Boolean, Date, ForeignKey, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship
from database import Base

def generate_uuid():
    return str(uuid.uuid4())

class CargoConselhoEnum(str, enum.Enum):
    PRESIDENTE = "presidente"
    SECRETARIO = "secretario"
    DELEGADO = "delegado"

class Regiao(Base):
    """
    Representa o Conselho Regional.
    Ex: Conselho Regional de Veneráveis Mestres de Anápolis.
    """
    __tablename__ = "regioes"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    nome = Column(String(150), nullable=False)
    uf = Column(String(2), nullable=False)
    ativa = Column(Boolean, default=True)

    # Relacionamentos
    diretoria = relationship("DiretoriaConselho", back_populates="regiao")
    lojas = relationship("LojaAgregada", back_populates="regiao")

class DiretoriaConselho(Base):
    """
    Gestores do Conselho Regional (Presidente, Secretário, etc).
    O usuario_id aponta para o e-sigma IdP.
    """
    __tablename__ = "diretoria_conselho"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    usuario_id = Column(String(36), nullable=False) # Ref: E-Sigma ID
    cargo = Column(SQLAlchemyEnum(CargoConselhoEnum), nullable=False)
    inicio_mandato = Column(Date, nullable=False)
    termino_mandato = Column(Date, nullable=False)

    regiao = relationship("Regiao", back_populates="diretoria")

class LojaAgregada(Base):
    """
    Tabela de vínculo. Diz quais Lojas pertencem a qual Conselho Regional.
    O loja_id aponta para a Loja fundadora no Módulo Lojas.
    """
    __tablename__ = "lojas_agregadas"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    loja_id = Column(String(36), nullable=False) # Ref: Módulo Lojas ID
    data_filiacao = Column(Date, nullable=False)
    ativa = Column(Boolean, default=True)

    regiao = relationship("Regiao", back_populates="lojas")
