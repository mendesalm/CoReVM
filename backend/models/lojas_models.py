# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import uuid
from sqlalchemy import Column, Integer, String, Boolean, Date, Time, Enum, ForeignKey
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
    # ALTERAÇÃO (2026-09-11): hierarquia redefinida pelo usuário — Potência é
    # o nível superior, Obediência passou a ser a organização subordinada à
    # Potência (com Lojas subordinadas à Obediência). Antes, "obediencia_id"
    # apontava para o nível superior e "subobediencia_id" para o nível
    # intermediário — os nomes ficavam invertidos em relação ao uso comum.
    # Ver seção 9.9 do contexto de implementação.
    potencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=False)
    obediencia_id = Column(Integer, ForeignKey("obediencias.id"), nullable=True)
    cidade = Column(String(100), nullable=True)
    estado = Column(String(2), nullable=True)
    cep = Column(String(9), nullable=True)
    ativo = Column(Boolean, default=True)

    # ALTERAÇÃO (2026-09-19): campos adicionais do painel "Minha Loja"
    # (endereço completo, dia/horário de sessão e contato institucional).
    # Estas colunas já existiam na tabela `lojas` de lojas_db (ver
    # Lojas/backend/models/models.py, classe Loja) mas não estavam
    # declaradas neste modelo-espelho do CoReVM, então o ORM as ignorava em
    # SELECTs e não conseguia escrever nelas. `numero_endereco` mapeia para
    # a coluna física "numero" (nome de atributo diferente do nome de
    # coluna, para não colidir com `numero_loja` acima). `dia_sessao` e
    # `periodicidade` são ENUMs no Postgres (ver dia_sessao_enum/
    # periodicidade_enum em lojas_db) mas são lidos/gravados aqui como
    # String simples — o SQLAlchemy não valida o valor contra o enum do lado
    # do Python, só o Postgres valida no INSERT/UPDATE, o que é suficiente
    # já que o formulário do frontend só envia os valores válidos do enum.
    logradouro = Column(String(255), nullable=True)
    numero_endereco = Column("numero", String(20), nullable=True)
    complemento = Column(String(100), nullable=True)
    bairro = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    telefone = Column(String(20), nullable=True)
    site = Column(String(255), nullable=True)
    cnpj = Column(String(18), nullable=True)
    dia_sessao = Column(String(30), nullable=True)
    periodicidade = Column(String(20), nullable=True)
    horario_sessao = Column(Time, nullable=True)

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
    status = Column(String(50), nullable=True)

class ObreiroLojaAssociacao(Base):
    __tablename__ = "obreiro_loja_associacoes"
    
    id = Column(Integer, primary_key=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"))
    loja_id = Column(Integer, ForeignKey("lojas.id"))
    status = Column(String(50))
    classe_obreiro = Column(String(50))
    data_inicio = Column(Date)
    data_fim = Column(Date)

class Mandato(Base):
    __tablename__ = "mandatos"
    id = Column(Integer, primary_key=True, index=True)
    obreiro_id = Column(Integer, ForeignKey("obreiros.id"), nullable=False)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=False)
    cargo_id = Column(Integer, nullable=False)
    data_inicio = Column(Date, nullable=False)
    data_fim = Column(Date, nullable=True)
    gestao_id = Column(Integer, nullable=True)


class WebmasterIntegracao(Base):
    """Espelho mínimo de `webmasters` (lojas_db) — adicionado 2026-09-14
    para a reconciliação semanal Diretoria×Lojas poder notificar o(s)
    Webmaster(s) de uma Loja específica quando o cadastro dela diverge do
    que o Conselho tem registrado (ver
    `core/reconciliacao_diretoria_lojas.py`)."""
    __tablename__ = "webmasters"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False)
    ativo = Column(Boolean, default=True)
    loja_id = Column(Integer, ForeignKey("lojas.id"), nullable=True)
