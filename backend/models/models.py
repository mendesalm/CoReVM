# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Date, DateTime, ForeignKey, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship
from database import Base
from core.constants import CargoConselho

def generate_uuid():
    return str(uuid.uuid4())

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
    previas = relationship("PreviaAdmissao", back_populates="regiao")
    votacoes = relationship("VotacaoRegional", back_populates="regiao")

class DiretoriaConselho(Base):
    """
    Gestores do Conselho Regional (Presidente, Secretário, etc).
    O usuario_id aponta para o e-sigma IdP.
    """
    __tablename__ = "diretoria_conselho"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    usuario_id = Column(String(36), nullable=False) # Ref: E-Sigma ID
    cargo = Column(SQLAlchemyEnum(CargoConselho), nullable=False)
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

class SuplenteConselho(Base):
    __tablename__ = 'suplentes_conselho'
    id = Column(String(36), primary_key=True, default=generate_uuid)
    loja_id = Column(String(36), nullable=False)
    usuario_id = Column(String(255), nullable=False)
    nome_suplente = Column(String(255), nullable=False)
    email_suplente = Column(String(255), nullable=True)

class AvisoRegional(Base):
    """
    Mural de Avisos e Notificações do Conselho Regional.
    Níveis de atenção: BAIXO (Informativo), MEDIO (Alerta), ALTO (Urgência).
    Tipos: AVISO, NOTIFICACAO.
    Suporta deleção visual (soft-delete).
    """
    __tablename__ = "avisos_regionais"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    titulo = Column(String(255), nullable=False)
    conteudo = Column(String(3000), nullable=False)
    tipo = Column(String(50), default="AVISO") # AVISO, NOTIFICACAO
    nivel = Column(String(50), default="BAIXO") # BAIXO, MEDIO, ALTO
    autor_id = Column(String(255), nullable=True)
    autor_nome = Column(String(255), nullable=True)
    autor_cargo = Column(String(100), nullable=True)
    loja_id = Column(String(36), nullable=True)
    fixado = Column(Boolean, default=False)
    data_publicacao = Column(Date, nullable=False)
    data_validade = Column(Date, nullable=True)
    deletado_visualmente = Column(Boolean, default=False)

class PreviaAdmissao(Base):
    """
    Mural de Pedidos de Admissão (Prévias de Iniciação, Filiação ou Regularização).
    """
    __tablename__ = "previas_admissao"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    tipo = Column(String(50), nullable=False) # INICIACAO, REGULARIZACAO, FILIACAO
    loja_id = Column(String(36), nullable=False)
    loja_nome = Column(String(255), nullable=False)
    loja_numero = Column(String(50), nullable=False)
    candidato_nome = Column(String(255), nullable=False)
    pdf_url = Column(String(500), nullable=False)
    pdf_nome_original = Column(String(255), nullable=True)
    data_postagem = Column(Date, nullable=False)
    data_limite = Column(Date, nullable=True)
    status = Column(String(50), default="EM_ANDAMENTO") # EM_ANDAMENTO, AVERIGUADO, CONCLUIDO
    verificado_por_nome = Column(String(255), nullable=True)
    data_verificacao = Column(DateTime, nullable=True)
    autor_id = Column(String(255), nullable=True)
    autor_nome = Column(String(255), nullable=True)
    deletado_visualmente = Column(Boolean, default=False)

    regiao = relationship("Regiao", back_populates="previas")
    consideracoes = relationship("ConsideracaoPrevia", back_populates="previa", cascade="all, delete-orphan", order_by="ConsideracaoPrevia.data_criacao.asc()")

class ConsideracaoPrevia(Base):
    """
    Apontamentos e pareceres incrementais e confidenciais registrados pelos Veneráveis Mestres.
    """
    __tablename__ = "consideracoes_previa"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    previa_id = Column(String(36), ForeignKey("previas_admissao.id"), nullable=False)
    autor_id = Column(String(255), nullable=True)
    autor_nome = Column(String(255), nullable=False)
    autor_cargo = Column(String(100), nullable=True)
    loja_id = Column(String(36), nullable=True)
    loja_nome = Column(String(255), nullable=True)
    loja_numero = Column(String(50), nullable=True)
    conteudo = Column(String(4000), nullable=False)
    data_criacao = Column(DateTime, nullable=False, default=datetime.utcnow)
    deletado_visualmente = Column(Boolean, default=False)

    previa = relationship("PreviaAdmissao", back_populates="consideracoes")

class VotacaoRegional(Base):
    """
    Enquetes e Votações do Conselho Regional.
    Tipo: DELIBERACAO (deliberação formal) ou CONSULTA (consulta regional).
    Status: EM_ANDAMENTO, ENCERRADA.
    """
    __tablename__ = "votacoes_regionais"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    titulo = Column(String(255), nullable=False)
    descricao = Column(String(4000), nullable=False)
    tipo = Column(String(50), default="DELIBERACAO") # DELIBERACAO, CONSULTA
    status = Column(String(50), default="EM_ANDAMENTO") # EM_ANDAMENTO, ENCERRADA
    opcoes = Column(String(2000), nullable=False) # JSON com lista de opções: ["Favorável", "Contrário", "Abstenção"]
    data_abertura = Column(Date, nullable=False)
    data_encerramento = Column(Date, nullable=True)
    quorum_minimo = Column(String(50), nullable=True, default="MAIORIA_SIMPLES")
    autor_id = Column(String(255), nullable=True)
    autor_nome = Column(String(255), nullable=True)
    autor_cargo = Column(String(100), nullable=True)
    deletado_visualmente = Column(Boolean, default=False)

    regiao = relationship("Regiao", back_populates="votacoes")
    votos = relationship("VotoLoja", back_populates="votacao", cascade="all, delete-orphan", order_by="VotoLoja.data_voto.asc()")

class VotoLoja(Base):
    """
    Registro do voto formal de cada Loja Jurisdicionada em uma votação.
    Cada Loja possui 1 voto formal no Conselho Regional.
    """
    __tablename__ = "votos_loja"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    votacao_id = Column(String(36), ForeignKey("votacoes_regionais.id"), nullable=False)
    loja_id = Column(String(36), nullable=False)
    loja_nome = Column(String(255), nullable=False)
    loja_numero = Column(String(50), nullable=False)
    autor_id = Column(String(255), nullable=True)
    autor_nome = Column(String(255), nullable=False)
    autor_cargo = Column(String(100), nullable=True)
    opcao_escolhida = Column(String(255), nullable=False)
    justificativa = Column(String(2000), nullable=True)
    data_voto = Column(DateTime, nullable=False, default=datetime.utcnow)

    votacao = relationship("VotacaoRegional", back_populates="votos")





