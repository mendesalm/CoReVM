import enum
import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SQLAlchemyEnum
from sqlalchemy.orm import backref, relationship
from database import Base


class BaseModel(Base):
    __abstract__ = True
    criado_em = Column(DateTime(timezone=True), server_default=func.now())
    atualizado_em = Column(DateTime(timezone=True), onupdate=func.now())


# --- ENUMS ---
class TipoObedienciaEnum(str, enum.Enum):
    FEDERAL = "Federal"
    ESTADUAL = "Estadual"


class RitoEnum(str, enum.Enum):
    # ALTERAÇÃO (2026-09-11): valor canônico passou de "Rito Escocês Antigo
    # e Aceito" para a sigla "REAA" (única sigla de uso corrente entre os
    # ritos maçônicos — os demais continuam com nome completo). Esta
    # mudança PRECISA ser aplicada junto com o script SQL que renomeia o
    # rótulo do ENUM do Postgres em lojas_db (ALTER TYPE ... RENAME VALUE),
    # senão o valor Python e o valor já armazenado no banco ficam
    # divergentes. Ver contexto de implementação, seção 9.7.
    REAA = "REAA"
    YORK = "Rito York"
    SCHRODER = "Rito Schroder"
    BRASILEIRO = "Rito Brasileiro"
    MODERNO = "Rito Moderno"
    ADONHIRAMITA = "Rito Adonhiramita"
    RER = "Rito Escocês Retificado"


class TipoPapelEnum(str, enum.Enum):
    LOJA = "Loja"
    OBEDIENCIA = "Obediência"
    SUBOBEDIENCIA = "Subobediência"

class TipoRelacionamentoEnum(str, enum.Enum):
    ESPOSA = "Esposa"
    FILHO = "Filho"
    FILHA = "Filha"
    PAI = "Pai"
    MAE = "Mãe"


class GrauEnum(str, enum.Enum):
    APRENDIZ = "Aprendiz"
    COMPANHEIRO = "Companheiro"
    MESTRE = "Mestre"
    MESTRE_INSTALADO = "Mestre Instalado"


class StatusRegistroEnum(str, enum.Enum):
    PENDENTE = "Pendente"
    APROVADO = "Aprovado"
    REJEITADO = "Rejeitado"


class TipoExcecaoEnum(str, enum.Enum):
    CONCEDIDA = "Concedida"
    REVOGADA = "Revogada"


class StatusObreiroEnum(str, enum.Enum):
    ATIVO = "Ativo"
    INATIVO = "Inativo"
    DESATIVADO = "Desativado"  # Falecido


class ClasseObreiroEnum(str, enum.Enum):
    REGULAR = "Regular"
    IRREGULAR = "Irregular"
    EMERITO = "Emérito"
    REMIDO = "Remido"
    HONORARIO = "Honorário"


# --- ASSOCIATION TABLES ---
cargos_permissoes = Table(
    "cargos_permissoes",
    Base.metadata,
    Column("cargo_id", ForeignKey("cargos.id"), primary_key=True),
    Column("permissao_id", ForeignKey("permissoes.id"), primary_key=True),
)

webmasters_cargos = Table(
    "webmasters_cargos",
    Base.metadata,
    Column("webmaster_id", ForeignKey("webmasters.id"), primary_key=True),
    Column("cargo_id", ForeignKey("cargos.id"), primary_key=True),
)

obediencias_cargos_associacao = Table(
    "obediencias_cargos_associacao",
    Base.metadata,
    Column("cargo_id", ForeignKey("cargos.id"), primary_key=True),
    Column("obediencia_id", ForeignKey("obediencias.id"), primary_key=True),
)

# --- MAIN MODELS ---


class Obediencia(BaseModel):
    __tablename__ = "obediencias"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), unique=True, nullable=False)
    sigla = Column(String(50), unique=True, nullable=True)
    tipo = Column(SQLAlchemyEnum(TipoObedienciaEnum, values_callable=lambda x: [e.value for e in x]), nullable=False)
    obediencia_mae_id = Column(Integer, ForeignKey("obediencias.id"), nullable=True)
    cnpj = Column(String(18), unique=True, nullable=True)
    email = Column(String(255), nullable=True)
    telefone = Column(String(20), nullable=True)
    site = Column(String(255), nullable=True)
    logradouro = Column(String(255), nullable=True)
    numero = Column(String(20), nullable=True)
    complemento = Column(String(100), nullable=True)
    bairro = Column(String(100), nullable=True)
    cidade = Column(String(100), nullable=True)
    estado = Column(String(2), nullable=True)
    cep = Column(String(9), nullable=True)
    nome_contato_tecnico = Column(String(255), nullable=False)
    email_contato_tecnico = Column(String(255), nullable=False)
    obediencia_mae = relationship("Obediencia", remote_side=[id], backref="obediencias_subordinadas")
    cargos = relationship("Cargo", secondary=obediencias_cargos_associacao, back_populates="obediencias")
    associacoes_obreiro = relationship(
        "ObreiroObedienciaAssociacao", back_populates="obediencia", cascade="all, delete-orphan"
    )


class Loja(BaseModel):
    __tablename__ = "lojas"
    id = Column(Integer, primary_key=True, index=True)
    nome_loja = Column(String(255), nullable=False)
    titulo_loja = Column(String(50), nullable=True, default="ARLS")
    codigo_loja = Column(String(36), unique=True, index=True, nullable=False)
    numero_loja = Column(String(255))
    data_fundacao = Column(Date, nullable=True)
    rito = Column(SQLAlchemyEnum(RitoEnum, values_callable=lambda x: [e.value for e in x]), nullable=True, default=RitoEnum.REAA)
    # ALTERAÇÃO (2026-09-11): hierarquia redefinida pelo usuário — Potência é
    # o nível superior (Federal/Estadual, ver TipoObedienciaEnum), Obediência
    # passou a ser a organização subordinada à Potência, com Lojas
    # subordinadas à Obediência. Antes, "obediencia_id" apontava para o nível
    # superior e "subobediencia_id" para o nível intermediário — nomes
    # invertidos em relação ao uso comum. Ver seção 9.9 do contexto de
    # implementação.
    potencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=False)
    obediencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=True)
    cnpj = Column(String(18), unique=True, nullable=True)
    email = Column(String(255), nullable=True)
    telefone = Column(String(20), nullable=True)
    site = Column(String(255), nullable=True)
    logradouro = Column(String(255), nullable=True)
    numero = Column(String(20), nullable=True)
    complemento = Column(String(100), nullable=True)
    bairro = Column(String(100), nullable=True)
    cidade = Column(String(100), nullable=True)
    estado = Column(String(2), nullable=True)
    cep = Column(String(9), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    qr_code_id = Column(String(36), unique=True, nullable=True, default=lambda: str(uuid.uuid4()))
    raio_geofence = Column(Integer, default=200, nullable=True)
    dominio_customizado = Column(String(255), unique=True, nullable=True)
    plano = Column(String(255), nullable=True)
    limite_usuarios = Column(Integer, nullable=True)
    ativo = Column(Boolean, default=True)
    status = Column(String(255), nullable=True)
    dia_sessao = Column(
        SQLAlchemyEnum(
            "Domingos",
            "Segundas-feiras",
            "Terças-feiras",
            "Quartas-feiras",
            "Quintas-feiras",
            "Sextas-feiras",
            "Sábados",
            name="dia_sessao_enum",
        ),
        nullable=True,
    )
    periodicidade = Column(SQLAlchemyEnum("Semanal", "Quinzenal", "Mensal", name="periodicidade_enum"), nullable=True)
    horario_sessao = Column(Time, nullable=True)
    potencia = relationship("Obediencia", foreign_keys=[potencia_id], backref="lojas")
    obediencia = relationship("Obediencia", foreign_keys=[obediencia_id], backref="lojas_subordinadas")
    nome_contato_tecnico = Column(String(255), nullable=False)
    email_contato_tecnico = Column(String(255), nullable=False)
    associacoes = relationship("ObreiroLojaAssociacao", back_populates="loja", cascade="all, delete-orphan")
    configuracoes_documento = Column(JSON, nullable=True)

    @property
    def filiacao_formatada(self) -> str:
        """Retorna a string formatada da filiação institucional da loja
        (Potência e, quando houver, a Obediência subordinada a ela)."""
        if self.obediencia and self.potencia:
            return f"Federada à {self.potencia.nome}\nJurisdicionada à {self.obediencia.nome}"
        elif self.potencia:
            return f"Confederada à {self.potencia.nome}"
        return ""

    __table_args__ = (
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="chk_lodge_latitude"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="chk_lodge_longitude"),
        CheckConstraint("limite_usuarios > 0", name="chk_lodge_user_limit"),
    )


class Cargo(BaseModel):
    __tablename__ = "cargos"
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), unique=True, nullable=False)
    tipo_cargo = Column(SQLAlchemyEnum(TipoPapelEnum, values_callable=lambda x: [e.value for e in x]), nullable=False)  # Acts as 'scope'
    nivel = Column(Integer, nullable=False, default=1)  # 1-9 hierarchy
    credencial_base = Column(Integer, nullable=False, default=10)  # Base value for calculation
    ritos_aplicaveis = Column(String(255), nullable=True)
    obediencias = relationship("Obediencia", secondary=obediencias_cargos_associacao, back_populates="cargos")
    permissoes = relationship("Permissao", secondary=cargos_permissoes, back_populates="cargos")
    webmasters = relationship("Webmaster", secondary=webmasters_cargos, back_populates="cargos")

    __table_args__ = (
        CheckConstraint("nivel >= 1 AND nivel <= 9", name="chk_role_level"),
    )


class Permissao(BaseModel):
    __tablename__ = "permissoes"
    id = Column(Integer, primary_key=True, index=True)
    acao = Column(String(255), unique=True, nullable=False)
    descricao = Column(String(255))
    credencial_minima = Column(Integer, nullable=False, default=0)  # Minimum credential required
    cargos = relationship("Cargo", secondary=cargos_permissoes, back_populates="permissoes")


class SuperAdmin(BaseModel):
    __tablename__ = "super_admins"
    id = Column(Integer, primary_key=True, index=True)
    usuario = Column(String(255), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hash_senha = Column(String(255), nullable=False)
    ativo = Column(Boolean, default=True)


class Webmaster(BaseModel):
    __tablename__ = "webmasters"
    id = Column(Integer, primary_key=True, index=True)
    usuario = Column(String(255), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    hash_senha = Column(String(255), nullable=False)
    ativo = Column(Boolean, default=True)

    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=True)
    obediencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=True)

    loja = relationship("Loja", backref=backref("webmasters", cascade="all, delete-orphan"))
    obediencia = relationship("Obediencia", backref=backref("webmasters", cascade="all, delete-orphan"))

    cargos = relationship("Cargo", secondary=webmasters_cargos, back_populates="webmasters")

    __table_args__ = (
        CheckConstraint(
            "(loja_id IS NOT NULL AND obediencia_id IS NULL) OR (loja_id IS NULL AND obediencia_id IS NOT NULL)",
            name="chk_webmaster_single_instance",
        ),
    )


class Obreiro(BaseModel):
    __tablename__ = "obreiros"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hash_senha = Column(String(255), nullable=False)
    nome_completo = Column(String(255), nullable=False)
    cpf = Column(String(14), unique=True, nullable=True, index=True)
    rg = Column(String(50), nullable=True)
    data_nascimento = Column(Date, nullable=True)
    data_casamento = Column(Date, nullable=True)
    logradouro = Column(String(255), nullable=True)
    numero = Column(String(50), nullable=True)
    bairro = Column(String(100), nullable=True)
    cidade = Column(String(100), nullable=True)
    estado = Column(String(2), nullable=True) # Added estado column
    cep = Column(String(9), nullable=True)
    telefone = Column(String(20), nullable=True)
    naturalidade = Column(String(100), nullable=True)
    nacionalidade = Column(String(100), nullable=True)
    religiao = Column(String(100), nullable=True)

    escolaridade = Column(String(255), nullable=True)
    profissao = Column(String(255), nullable=True)
    local_trabalho = Column(String(255), nullable=True)
    caminho_foto_perfil = Column(String(255), nullable=True)
    cim = Column(String(50), unique=True, nullable=True, index=True)
    status = Column(String(50), nullable=True, default="Ativo")
    grau = Column(SQLAlchemyEnum(GrauEnum, name="grau_enum", values_callable=lambda x: [e.value for e in x]), nullable=True)
    data_iniciacao = Column(Date, nullable=True)
    data_elevacao = Column(Date, nullable=True)
    data_exaltacao = Column(Date, nullable=True)
    data_instalacao = Column(Date, nullable=True)
    data_filiacao = Column(Date, nullable=True)
    data_regularizacao = Column(Date, nullable=True)
    grau_filosofico = Column(String(100), nullable=True)
    status_registro = Column(
        SQLAlchemyEnum(StatusRegistroEnum, name="status_registro_enum", values_callable=lambda x: [e.value for e in x]), nullable=False, default=StatusRegistroEnum.PENDENTE
    )
    ultimo_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    associacoes_loja = relationship("ObreiroLojaAssociacao", back_populates="obreiro", cascade="all, delete-orphan")
    associacoes_obediencia = relationship(
        "ObreiroObedienciaAssociacao", back_populates="obreiro", cascade="all, delete-orphan"
    )
    familiares = relationship("Familiar", back_populates="obreiro", cascade="all, delete-orphan")
    condecoracoes = relationship("Condecoracao", back_populates="obreiro", cascade="all, delete-orphan")
    mandatos = relationship("Mandato", back_populates="obreiro", cascade="all, delete-orphan")


class ObreiroLojaAssociacao(BaseModel):
    __tablename__ = "obreiro_loja_associacoes"
    id = Column(Integer, primary_key=True, index=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)

    data_inicio = Column(Date, nullable=True)
    data_fim = Column(Date, nullable=True)
    status = Column(SQLAlchemyEnum(StatusObreiroEnum, values_callable=lambda x: [e.value for e in x]), nullable=False, default=StatusObreiroEnum.ATIVO)
    classe_obreiro = Column(SQLAlchemyEnum(ClasseObreiroEnum, values_callable=lambda x: [e.value for e in x]), nullable=False, default=ClasseObreiroEnum.REGULAR)
    obreiro = relationship("Obreiro", back_populates="associacoes_loja")
    loja = relationship("Loja", back_populates="associacoes")
    
    __table_args__ = (
        UniqueConstraint("obreiro_id", "loja_id", name="_member_lodge_uc"),
        CheckConstraint("data_fim IS NULL OR data_fim >= data_inicio", name="chk_lodge_assoc_dates"),
    )


class ObreiroObedienciaAssociacao(BaseModel):
    __tablename__ = "obreiro_obediencia_associacoes"
    id = Column(Integer, primary_key=True, index=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    obediencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=False)
    cargo_id = Column(Integer, ForeignKey("cargos.id"), nullable=False)
    data_inicio = Column(Date, nullable=True)
    data_fim = Column(Date, nullable=True)
    obreiro = relationship("Obreiro", back_populates="associacoes_obediencia")
    obediencia = relationship("Obediencia", back_populates="associacoes_obreiro")
    cargo = relationship("Cargo")
    
    __table_args__ = (
        UniqueConstraint("obreiro_id", "obediencia_id", name="_member_obedience_uc"),
        CheckConstraint("data_fim IS NULL OR data_fim >= data_inicio", name="chk_obedience_assoc_dates"),
    )


class ObreiroPermissaoExcecao(BaseModel):
    __tablename__ = "obreiro_permissao_excecoes"
    id = Column(Integer, primary_key=True, index=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    permissao_id = Column(Integer, ForeignKey("permissoes.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=True)
    obediencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=True)
    tipo_excecao = Column(SQLAlchemyEnum(TipoExcecaoEnum, values_callable=lambda x: [e.value for e in x]), nullable=False)

    obreiro = relationship("Obreiro", backref="excecoes_permissao")
    permissao = relationship("Permissao")
    loja = relationship("Loja")
    obediencia = relationship("Obediencia")

    __table_args__ = (
        CheckConstraint(
            "(loja_id IS NOT NULL AND obediencia_id IS NULL) OR (loja_id IS NULL AND obediencia_id IS NOT NULL)",
            name="chk_exception_single_context",
        ),
        UniqueConstraint(
            "obreiro_id", "permissao_id", "loja_id", "obediencia_id", name="_member_permission_context_uc"
        ),
    )


class ProcessoAdministrativo(BaseModel):
    __tablename__ = "processos_administrativos"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    descricao = Column(Text, nullable=True)
    status = Column(String(50), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    loja = relationship("Loja", backref="processos_administrativos")


class Condecoracao(BaseModel):
    __tablename__ = "condecoracoes"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    data_concessao = Column(Date, nullable=False)
    observacoes = Column(Text, nullable=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    obreiro = relationship("Obreiro", back_populates="condecoracoes")


class Familiar(BaseModel):
    __tablename__ = "familiares"
    id = Column(Integer, primary_key=True, index=True)
    nome_completo = Column(String(255), nullable=False)
    tipo_relacionamento = Column(SQLAlchemyEnum(TipoRelacionamentoEnum, name="tipo_relacionamento_enum", values_callable=lambda x: [e.value for e in x]), nullable=False)
    data_nascimento = Column(Date, nullable=True)
    email = Column(String(255), nullable=True)
    telefone = Column(String(20), nullable=True)
    falecido = Column(Boolean, default=False)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    obreiro = relationship("Obreiro", back_populates="familiares")


class Mandato(BaseModel):
    __tablename__ = "mandatos"
    id = Column(Integer, primary_key=True, index=True)
    data_inicio = Column(Date, nullable=False)
    data_fim = Column(Date, nullable=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    cargo_id = Column(Integer, ForeignKey("cargos.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    gestao_id = Column(Integer, ForeignKey("gestoes.id"), nullable=True) # Optional link to Gestao
    
    obreiro = relationship("Obreiro", back_populates="mandatos")
    cargo = relationship("Cargo")
    loja = relationship("Loja")
    gestao = relationship("Gestao", backref="mandatos")

    __table_args__ = (
        CheckConstraint("data_fim IS NULL OR data_fim >= data_inicio", name="chk_role_history_dates"),
    )



class TipoSessaoEnum(str, enum.Enum):
    ORDINARIA = "Ordinária"
    MAGNA = "Magna"
    EXTRAORDINARIA = "Extraordinária"


class SubtipoSessaoEnum(str, enum.Enum):
    # Ordinárias
    REGULAR = "Regular"
    ADMINISTRATIVA = "Administrativa"
    FINANCAS = "Finanças"
    FILIACAO_REGULARIZACAO = "Filiação e Regularização"
    ELEITORAL = "Eleitoral"
    BANQUETE_RITUALISTICO = "Banquete Ritualístico"
    
    # Magnas
    INICIACAO = "Iniciação"
    ELEVACAO = "Elevação"
    EXALTACAO = "Exaltação"
    POSSE = "Posse"
    INSTALACAO = "Instalação"
    SAGRACAO_ESTANDARTE = "Sagração de Estandarte"
    REGULARIZACAO_LOJA = "Regularização de Loja"
    SAGRACAO_TEMPLO = "Sagração de Templo"
    ADOCAO_LOWTONS = "Adoção de Lowtons"
    CONSAGRACAO_MATRIMONIAL = "Consagração e Exaltação matrimonial"
    POMPAS_FUNEBRES = "Pompas Fúnebres"
    CONFERENCIA = "Conferência"
    PALESTRA = "Palestra"
    FESTIVA = "Festiva"
    CIVICO_CULTURAL = "Cívico-cultural"
    
    # Extraordinárias
    ELEICAO_GM_GERAL = "Eleições de Grão-Mestre Geral e Adjuntos"
    ELEICAO_GM_ESTADUAL = "Eleição de Grão-Mestre Estadual e Adjuntos"
    ELEICAO_GM_DF = "Eleição de Grão Mestre do Distrito Federal e Adjuntos"
    CONSELHO_FAMILIA = "Conselho de Família"
    PLACET_EX_OFFICIO = "Concessão de placet ex-officio"
    ALTERACAO_ESTATUTO = "Alteração de Estatuto"
    MUDANCA_RITO = "Mudança de Rito"
    MUDANCA_ORIENTE = "Mudança de Oriente"
    MUDANCA_TITULO_DISTINTIVO = "Mudança de Título Distintivo"
    FUSAO_LOJAS = "Fusão ou Incorporação de Lojas"


# Mapeamento de validação de hierarquia
VALID_SESSION_SUBTYPES = {
    TipoSessaoEnum.ORDINARIA: {
        SubtipoSessaoEnum.REGULAR,
        SubtipoSessaoEnum.ADMINISTRATIVA,
        SubtipoSessaoEnum.FINANCAS,
        SubtipoSessaoEnum.FILIACAO_REGULARIZACAO,
        SubtipoSessaoEnum.ELEITORAL,
        SubtipoSessaoEnum.BANQUETE_RITUALISTICO,
    },
    TipoSessaoEnum.MAGNA: {
        SubtipoSessaoEnum.INICIACAO,
        SubtipoSessaoEnum.ELEVACAO,
        SubtipoSessaoEnum.EXALTACAO,
        SubtipoSessaoEnum.POSSE,
        SubtipoSessaoEnum.INSTALACAO,
        SubtipoSessaoEnum.SAGRACAO_ESTANDARTE,
        SubtipoSessaoEnum.REGULARIZACAO_LOJA,
        SubtipoSessaoEnum.SAGRACAO_TEMPLO,
        SubtipoSessaoEnum.ADOCAO_LOWTONS,
        SubtipoSessaoEnum.CONSAGRACAO_MATRIMONIAL,
        SubtipoSessaoEnum.POMPAS_FUNEBRES,
        SubtipoSessaoEnum.CONFERENCIA,
        SubtipoSessaoEnum.PALESTRA,
        SubtipoSessaoEnum.FESTIVA,
        SubtipoSessaoEnum.CIVICO_CULTURAL,
    },
    TipoSessaoEnum.EXTRAORDINARIA: {
        SubtipoSessaoEnum.ELEICAO_GM_GERAL,
        SubtipoSessaoEnum.ELEICAO_GM_ESTADUAL,
        SubtipoSessaoEnum.ELEICAO_GM_DF,
        SubtipoSessaoEnum.CONSELHO_FAMILIA,
        SubtipoSessaoEnum.PLACET_EX_OFFICIO,
        SubtipoSessaoEnum.ALTERACAO_ESTATUTO,
        SubtipoSessaoEnum.MUDANCA_RITO,
        SubtipoSessaoEnum.MUDANCA_ORIENTE,
        SubtipoSessaoEnum.MUDANCA_TITULO_DISTINTIVO,
        SubtipoSessaoEnum.FUSAO_LOJAS,
    },
}


class Gestao(Base):
    __tablename__ = "gestoes"
    id = Column(Integer, primary_key=True, index=True)
    identificador = Column(String(255), nullable=False) # Ex: "Exercício Maçônico 2025-2027"
    data_inicio = Column(Date, nullable=False)
    data_fim = Column(Date, nullable=False)
    atual = Column(Boolean, default=True)
    
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    loja = relationship("Loja", backref="gestoes")


class SessaoMaconica(BaseModel):
    __tablename__ = "sessoes_maconicas"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    numero_sessao = Column(Integer, nullable=True) # Número sequencial no exercício
    data_sessao = Column(Date, nullable=False)
    hora_inicio = Column(Time, nullable=True)
    hora_fim = Column(Time, nullable=True)
    
    tipo = Column(SQLAlchemyEnum(TipoSessaoEnum, name="tipo_sessao_enum"), nullable=True)
    subtipo = Column(SQLAlchemyEnum(SubtipoSessaoEnum, name="subtipo_sessao_enum"), nullable=True)
    
    status = Column(
        SQLAlchemyEnum("AGENDADA", "EM_ANDAMENTO", "REALIZADA", "ENCERRADA","CANCELADA", name="status_sessao_enum"),
        nullable=False,
        default="AGENDADA",
    )
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    loja = relationship("Loja", backref="sessoes_maconicas")
    
    gestao_id = Column(Integer, ForeignKey("gestoes.id"), nullable=True)
    gestao = relationship("Gestao", backref="sessions")
    
    gestao = relationship("Gestao", backref="sessions")
    
    # Novos campos
    cargos_temporarios = Column(JSON, nullable=True) # Stores overriding cargos for this sessao { "Venerável Mestre": "Nome do Irmão", ... }
    
    pauta = Column(Text, nullable=True)
    expedientes_enviados = Column(Text, nullable=True)
    expedientes_recebidos = Column(Text, nullable=True)
    diretor_estudos_id = Column(Integer, ForeignKey("obreiros.id"), nullable=True)
    diretor_estudos = relationship("Obreiro", foreign_keys=[diretor_estudos_id])

    presencas = relationship("Presenca", back_populates="sessao", cascade="all, delete-orphan")
    documentos = relationship("Documento", back_populates="sessao")  # Relacionamento com Documentos



class MetodoCheckInEnum(str, enum.Enum):
    MANUAL = "MANUAL"
    QR_CODE = "QR_CODE"
    APP_VISITOR = "APP_VISITOR"


class Presenca(BaseModel):
    __tablename__ = "presencas"
    id = Column(Integer, primary_key=True, index=True)
    sessao_id = Column(Integer, ForeignKey("sessoes_maconicas.id"), nullable=False)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=True)
    visitante_id = Column(Integer, ForeignKey("visitantes.id"), nullable=True)
    status_presenca = Column(String(50), nullable=False)
    data_hora_checkin = Column(DateTime(timezone=True), nullable=True)
    metodo_checkin = Column(SQLAlchemyEnum(MetodoCheckInEnum, name="metodo_checkin_enum", values_callable=lambda x: [e.value for e in x]), nullable=True)
    latitude_checkin = Column(Float, nullable=True)
    longitude_checkin = Column(Float, nullable=True)
    sessao = relationship("SessaoMaconica", back_populates="presencas")
    obreiro = relationship("Obreiro", backref="presencas")
    visitante = relationship("Visitante", backref="presencas")


class Visitante(BaseModel):
    __tablename__ = "visitantes"
    id = Column(Integer, primary_key=True, index=True)
    
    # Dados pessoais
    nome_completo = Column(String(255), nullable=False)
    cim = Column(String(50), unique=True, nullable=False, index=True)  # CIM é obrigatório
    grau = Column(SQLAlchemyEnum(GrauEnum, name="grau_visitante_enum", values_callable=lambda x: [e.value for e in x]), nullable=False)
    
    # Contato
    email = Column(String(255), nullable=True)
    telefone = Column(String(20), nullable=True)
    cpf = Column(String(14), unique=True, nullable=True)  # CPF é opcional
    
    # Loja de Origem (estruturada ou manual)
    loja_origem_id = Column(Integer, nullable=True)  # ID da loja se for do Sigma
    nome_loja_manual = Column(String(255), nullable=True)  # Nome manual se não for do Sigma
    numero_loja_manual = Column(String(50), nullable=True)
    obediencia_loja_manual = Column(String(100), nullable=True)
    
    # ID global para sincronização (se vier do banco global)
    id_visitante_global = Column(String(36), nullable=True, index=True)
    
    observacoes = Column(Text, nullable=True)


class Calendario(BaseModel):
    __tablename__ = "calendarios"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    descricao = Column(Text, nullable=True)
    # Ensuring multitenancy by associating with a loja
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    loja = relationship("Loja", backref="calendarios")


class Evento(BaseModel):
    __tablename__ = "eventos"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    descricao = Column(Text, nullable=True)
    hora_inicio = Column(DateTime(timezone=True), nullable=False)
    hora_fim = Column(DateTime(timezone=True), nullable=False)
    publico = Column(Boolean, default=False)
    # Ensuring multitenancy by associating with a loja
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    loja = relationship("Loja", backref="eventos")
    # Link to a specific calendario (optional)
    calendario_id = Column(Integer, ForeignKey("calendarios.id"), nullable=True)
    calendario = relationship("Calendario", backref="eventos")

    __table_args__ = (
        CheckConstraint("hora_fim > hora_inicio", name="chk_event_dates"),
    )





class Documento(BaseModel):
    __tablename__ = "documentos"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    tipo_documento = Column(String(50), nullable=True, index=True)  # e.g. BALAUSTRE, EDITAL
    caminho_arquivo = Column(String(512), nullable=False)  # Path to the stored file
    nome_arquivo = Column(String(255), nullable=False)
    tipo_arquivo = Column(String(50), nullable=True)
    data_upload = Column(DateTime(timezone=True), server_default=func.now())
    # Ensuring multitenancy by associating with a loja
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    enviado_por_obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=True)  # Optional: who uploaded it
    sessao_id = Column(Integer, ForeignKey("sessoes_maconicas.id"), nullable=True, index=True)  # Link to a sessao
    loja = relationship("Loja", backref="documentos")
    enviado_por = relationship("Obreiro", backref="documentos_enviados")
    sessao = relationship("SessaoMaconica", back_populates="documentos")  # Back-populates from SessaoMaconica


class Visita(BaseModel):
    __tablename__ = "visitas"
    id = Column(Integer, primary_key=True, index=True)
    data_visita = Column(Date, nullable=False, index=True)

    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    loja_origem_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)  # Loja de origem do membro
    loja_visitada_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)  # Loja que foi visitada
    sessao_id = Column(Integer, ForeignKey("sessoes_maconicas.id"), nullable=False)

    obreiro = relationship("Obreiro", backref="visitas")
    loja_origem = relationship("Loja", foreign_keys=[loja_origem_id], backref="visitas_origem")
    loja_visitada = relationship("Loja", foreign_keys=[loja_visitada_id], backref="obreiros_visitantes")
    sessao = relationship("SessaoMaconica", backref="visitas")

    __table_args__ = (UniqueConstraint("obreiro_id", "sessao_id", name="_member_session_visit_uc"),)



class TipoAvisoEnum(str, enum.Enum):
    AVISO = "Aviso"
    NOTICIA = "Notícia"


class Aviso(BaseModel):
    __tablename__ = "avisos"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    conteudo = Column(Text, nullable=False)
    data_expiracao = Column(Date, nullable=True)
    ativo = Column(Boolean, default=True)
    
    tipo = Column(SQLAlchemyEnum(TipoAvisoEnum, name="tipo_aviso_enum", values_callable=lambda x: [e.value for e in x]), nullable=False, default=TipoAvisoEnum.AVISO)
    
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    publicacao_id = Column(Integer, ForeignKey("publicacoes.id"), nullable=True)
    
    loja = relationship("Loja", backref="avisos")
    publicacao = relationship("Publicacao", backref="avisos_vinculados")


class TipoPublicacaoEnum(str, enum.Enum):
    REGULAMENTOS = "Regulamentos"
    ATOS = "Atos"
    DOCUMENTOS = "Documentos"
    BOLETINS = "Boletins"
    ARTIGO = "Artigo"


class StatusPublicacaoEnum(str, enum.Enum):
    RASCUNHO = "Rascunho"
    PENDENTE = "Pendente"
    PUBLICADO = "Publicado"
    REJEITADO = "Rejeitado"
    ARQUIVADO = "Arquivado"


class Publicacao(BaseModel):
    __tablename__ = "publicacoes"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    conteudo = Column(Text, nullable=True) # Description/Observations
    caminho_arquivo = Column(String(512), nullable=False) # Path to PDF file
    tamanho_arquivo = Column(Integer, nullable=True) # Size in bytes
    
    tipo = Column(SQLAlchemyEnum(TipoPublicacaoEnum, name="tipo_publicacao_enum", values_callable=lambda x: [e.value for e in x]), nullable=False)
    status = Column(SQLAlchemyEnum(StatusPublicacaoEnum, name="status_publicacao_enum", values_callable=lambda x: [e.value for e in x]), nullable=False, default=StatusPublicacaoEnum.PUBLICADO)
    
    autor_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    
    publicado_em = Column(DateTime(timezone=True), server_default=func.now())
    valido_ate = Column(Date, nullable=True)
    
    autor = relationship("Obreiro", backref="publicacoes")
    loja = relationship("Loja", backref="publicacoes")


class Classificado(BaseModel):
    __tablename__ = "classificados"
    id = Column(Integer, primary_key=True, index=True)
    titulo = Column(String(255), nullable=False)
    descricao = Column(Text, nullable=False)
    preco = Column(Float, nullable=True)
    informacao_contato = Column(String(255), nullable=True)
    email_contato = Column(String(255), nullable=True)
    
    # Endereço
    logradouro = Column(String(255), nullable=True)
    numero = Column(String(50), nullable=True)
    bairro = Column(String(100), nullable=True)
    cidade = Column(String(100), nullable=True)
    estado = Column(String(2), nullable=True)
    cep = Column(String(9), nullable=True)
    categoria = Column(String(50), nullable=True)
    
    status = Column(String(50), default="ATIVO")  # ATIVO, EXPIRADO
    expira_em = Column(DateTime(timezone=True), nullable=False)
    
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    
    loja = relationship("Loja", backref="classificados")
    obreiro = relationship("Obreiro", backref="classificados")
    photos = relationship("FotoClassificado", back_populates="classificado", cascade="all, delete-orphan")


class FotoClassificado(BaseModel):
    __tablename__ = "fotos_classificados"
    id = Column(Integer, primary_key=True, index=True)
    classificado_id = Column(Integer, ForeignKey("classificados.id"), nullable=False)
    caminho_imagem = Column(String(512), nullable=False)
    classificado = relationship("Classificado", back_populates="photos")


class EscalaAgape(BaseModel):
    __tablename__ = "escalas_agape"
    id = Column(Integer, primary_key=True, index=True)
    data = Column(Date, nullable=False)
    posicao = Column(String(50), nullable=False)  # e.g., "3º", "4º"
    
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    
    loja = relationship("Loja", backref="escalas_agape")
    obreiro = relationship("Obreiro", backref="escalas_agape")


class ModeloDocumento(BaseModel):
    __tablename__ = "modelos_documentos"
    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(50), unique=True, nullable=False)  # 'BALAUSTRE', 'EDITAL'
    conteudo = Column(Text, nullable=False)
    atualizado_em = Column(DateTime, default=func.now(), onupdate=func.now())


class AssinaturaDocumento(BaseModel):
    __tablename__ = "assinaturas_documentos"
    id = Column(Integer, primary_key=True, index=True)
    documento_id = Column(Integer, ForeignKey("documentos.id"), nullable=False, unique=True)
    hash_assinatura = Column(String(64), unique=True, nullable=False, index=True) # SHA256
    assinado_em = Column(DateTime(timezone=True), server_default=func.now())
    assinado_por_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    
    documento = relationship("Documento", backref=backref("signature", uselist=False))
    assinado_por = relationship("Obreiro")


class TipoComissaoEnum(str, enum.Enum):
    PERMANENTE = "Permanente"
    TEMPORARIA = "Temporária"


class Comissao(BaseModel):
    __tablename__ = "comissoes"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), nullable=False)
    descricao = Column(Text, nullable=True)
    tipo_comissao = Column(SQLAlchemyEnum(TipoComissaoEnum, name="tipo_comissao_enum"), nullable=False)
    data_inicio = Column(Date, nullable=False)
    data_fim = Column(Date, nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    presidente_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    
    # Relationships
    loja = relationship("Loja", backref="comissoes")
    presidente = relationship("Obreiro", foreign_keys=[presidente_id])
    obreiros = relationship("MembroComissao", back_populates="comissao", cascade="all, delete-orphan")


class MembroComissao(BaseModel):
    __tablename__ = "membros_comissao"

    id = Column(Integer, primary_key=True, index=True)
    comissao_id = Column(Integer, ForeignKey("comissoes.id"), nullable=False)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    cargo = Column(String(50), default="Membro") # Presidente, Membro

    comissao = relationship("Comissao", back_populates="obreiros")
    obreiro = relationship("Obreiro")


# --- LIBRARY MODELS ---

class CondicaoLivroEnum(str, enum.Enum):
    NOVO = "Novo"
    BOM = "Bom"
    REGULAR = "Regular"
    RUIM = "Ruim"


class StatusItemEnum(str, enum.Enum):
    DISPONIVEL = "Disponível"
    EMPRESTADO = "Emprestado"
    RESERVADO = "Reservado"
    EXTRAVIADO = "Extraviado"


class StatusEmprestimoEnum(str, enum.Enum):
    ATIVO = "Ativo"
    DEVOLVIDO = "Devolvido"
    ATRASADO = "Atrasado"


class StatusListaEsperaEnum(str, enum.Enum):
    AGUARDANDO = "Aguardando"
    NOTIFICADO = "Notificado"
    ATENDIDO = "Atendido"
    CANCELADO = "Cancelado"
    EXPIRADO = "Expirado"


class Livro(BaseModel):
    __tablename__ = "livros"
    id = Column(Integer, primary_key=True, index=True)
    isbn = Column(String(50), unique=True, nullable=True, index=True)
    titulo = Column(String(255), nullable=False)
    autor = Column(String(255), nullable=False)
    editora = Column(String(255), nullable=True)
    ano_publicacao = Column(Integer, nullable=True)
    paginas = Column(Integer, nullable=True)
    url_capa = Column(String(512), nullable=True)
    sinopse = Column(Text, nullable=True)
    grau_necessario = Column(Integer, nullable=False, default=1)  # 1=Apprentice, 2=Fellowcraft, 3=Master

    __table_args__ = (
        CheckConstraint("grau_necessario >= 1 AND grau_necessario <= 3", name="chk_book_required_degree"),
    )


class ItemBiblioteca(BaseModel):
    __tablename__ = "itens_biblioteca"
    id = Column(Integer, primary_key=True, index=True)
    livro_id = Column(Integer, ForeignKey("livros.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False, index=True)
    codigo_inventario = Column(String(100), nullable=True)
    condicao = Column(SQLAlchemyEnum(CondicaoLivroEnum, name="condicao_livro_enum", values_callable=lambda x: [e.value for e in x]), nullable=False, default=CondicaoLivroEnum.BOM)
    status = Column(SQLAlchemyEnum(StatusItemEnum, name="status_item_enum", values_callable=lambda x: [e.value for e in x]), nullable=False, default=StatusItemEnum.DISPONIVEL)

    livro = relationship("Livro", backref="items")
    loja = relationship("Loja", backref="itens_biblioteca")


class Emprestimo(BaseModel):
    __tablename__ = "emprestimos"
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("itens_biblioteca.id"), nullable=False)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    data_emprestimo = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    data_vencimento = Column(DateTime(timezone=True), nullable=False)
    data_devolucao = Column(DateTime(timezone=True), nullable=True)
    status = Column(SQLAlchemyEnum(StatusEmprestimoEnum, name="status_emprestimo_enum", values_callable=lambda x: [e.value for e in x]), nullable=False, default=StatusEmprestimoEnum.ATIVO)

    item = relationship("ItemBiblioteca", backref="emprestimos")
    obreiro = relationship("Obreiro", backref="emprestimos")

    __table_args__ = (
        CheckConstraint("data_vencimento > data_emprestimo", name="chk_loan_dates"),
    )


class ListaEspera(BaseModel):
    __tablename__ = "listas_espera"
    id = Column(Integer, primary_key=True, index=True)
    livro_id = Column(Integer, ForeignKey("livros.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    data_solicitacao = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    status = Column(SQLAlchemyEnum(StatusListaEsperaEnum, name="status_lista_espera_enum", values_callable=lambda x: [e.value for e in x]), nullable=False, default=StatusListaEsperaEnum.AGUARDANDO)
    data_notificacao = Column(DateTime(timezone=True), nullable=True)
    data_expiracao = Column(DateTime(timezone=True), nullable=True)

    livro = relationship("Livro", backref="listas_espera")
    loja = relationship("Loja", backref="listas_espera")
    obreiro = relationship("Obreiro", backref="listas_espera")

