# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Date, DateTime, Integer, ForeignKey, Enum as SQLAlchemyEnum
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
    itens_patrimonio = relationship("ItemPatrimonio", back_populates="regiao")
    emprestimos_patrimonio = relationship("EmprestimoPatrimonio", back_populates="regiao")
    documentos = relationship("DocumentoRegional", back_populates="regiao")
    topicos_comunicacao = relationship("TopicoComunicacao", back_populates="regiao")

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


class ItemPatrimonio(Base):
    """
    Itens e Ativos de Patrimônio do Conselho Regional ou disponibilizados por Lojas.
    Categorias: HOSPITALAR (cadeiras de rodas, muletas, camas), MOBILIARIO, AUDIOVISUAL, LITURGICO, ESTRUTURAL, OUTROS.
    Tipo Propriedade: CONSELHO ou LOJA (rede solidária).
    """
    __tablename__ = "itens_patrimonio"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    codigo_tombamento = Column(String(50), nullable=False) # Ex: PAT-2026-001
    nome = Column(String(255), nullable=False)
    descricao = Column(String(2000), nullable=True)
    categoria = Column(String(50), nullable=False, default="HOSPITALAR") # HOSPITALAR, MOBILIARIO, AUDIOVISUAL, LITURGICO, ESTRUTURAL, OUTROS
    tipo_propriedade = Column(String(50), nullable=False, default="CONSELHO") # CONSELHO, LOJA
    loja_proprietaria_id = Column(String(36), nullable=True)
    loja_proprietaria_nome = Column(String(255), nullable=True)
    loja_proprietaria_numero = Column(String(50), nullable=True)
    quantidade_total = Column(Integer, default=1, nullable=False)
    quantidade_disponivel = Column(Integer, default=1, nullable=False)
    localizacao_fisica = Column(String(255), nullable=True) # Ex: Sede do Conselho, Sala de Hospitalaria, Templo Anápolis
    estado_conservacao = Column(String(50), default="BOM", nullable=False) # NOVO, OTIMO, BOM, REGULAR, EM_MANUTENCAO
    permite_emprestimo = Column(Boolean, default=True)
    permite_locacao = Column(Boolean, default=False)
    taxa_locacao_estimada = Column(String(100), nullable=True)
    foto_url = Column(String(500), nullable=True)
    deletado_visualmente = Column(Boolean, default=False)
    data_cadastro = Column(DateTime, default=datetime.utcnow)

    regiao = relationship("Regiao", back_populates="itens_patrimonio")
    emprestimos = relationship("EmprestimoPatrimonio", back_populates="item", cascade="all, delete-orphan", order_by="EmprestimoPatrimonio.data_retirada.desc()")
    fila = relationship("FilaEsperaPatrimonio", back_populates="item", cascade="all, delete-orphan", order_by="FilaEsperaPatrimonio.data_solicitacao.asc()")


class EmprestimoPatrimonio(Base):
    """
    Termo de Cautela e Empréstimo / Cessão de Ativo de Patrimônio.
    Registra datas, responsáveis pela entrega e retirada, e estado de conservação.
    """
    __tablename__ = "emprestimos_patrimonio"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    item_id = Column(String(36), ForeignKey("itens_patrimonio.id"), nullable=False)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    loja_solicitante_id = Column(String(36), nullable=False)
    loja_solicitante_nome = Column(String(255), nullable=False)
    loja_solicitante_numero = Column(String(50), nullable=False)
    beneficiario_final = Column(String(255), nullable=True) # Ex: "Familiar do Ir.'. Silva (Preservação de Discrição)"
    responsavel_retirada_nome = Column(String(255), nullable=False)
    responsavel_retirada_cargo = Column(String(100), nullable=True)
    responsavel_retirada_contato = Column(String(100), nullable=True)
    responsavel_entrega_nome = Column(String(255), nullable=False)
    responsavel_entrega_cargo = Column(String(100), nullable=True)
    data_retirada = Column(Date, nullable=False)
    data_prevista_devolucao = Column(Date, nullable=False)
    data_efetiva_devolucao = Column(Date, nullable=True)
    quantidade = Column(Integer, default=1, nullable=False)
    status = Column(String(50), default="ATIVO", nullable=False) # ATIVO, CONCLUIDO, ATRASADO, CANCELADO
    estado_conservacao_entrega = Column(String(50), default="BOM")
    estado_conservacao_devolucao = Column(String(50), nullable=True)
    observacoes = Column(String(2000), nullable=True)
    data_solicitacao = Column(DateTime, default=datetime.utcnow)

    item = relationship("ItemPatrimonio", back_populates="emprestimos")
    regiao = relationship("Regiao", back_populates="emprestimos_patrimonio")


class FilaEsperaPatrimonio(Base):
    """
    Fila de Espera para itens com 0 unidades disponíveis no momento.
    """
    __tablename__ = "fila_espera_patrimonio"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    item_id = Column(String(36), ForeignKey("itens_patrimonio.id"), nullable=False)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    loja_solicitante_id = Column(String(36), nullable=False)
    loja_solicitante_nome = Column(String(255), nullable=False)
    loja_solicitante_numero = Column(String(50), nullable=False)
    responsavel_nome = Column(String(255), nullable=False)
    contato = Column(String(100), nullable=True)
    grau_urgencia = Column(String(50), default="NORMAL") # NORMAL, ALTA, URGENTE
    status = Column(String(50), default="AGUARDANDO") # AGUARDANDO, ATENDIDO, CANCELADO
    observacoes = Column(String(1000), nullable=True)
    data_solicitacao = Column(DateTime, default=datetime.utcnow)

    item = relationship("ItemPatrimonio", back_populates="fila")


class DocumentoRegional(Base):
    """
    Repositório documental oficial do Conselho Regional.
    Categorias: ATA, DECRETO, REGULAMENTO, CIRCULAR, CONVITE, MODELO.
    Origem: CONSELHO ou LOJA.
    """
    __tablename__ = "documentos_regionais"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    codigo_documento = Column(String(50), nullable=False) # Ex: ATA-CORE-04/2026, DEC-CORE-01/2026
    titulo = Column(String(255), nullable=False)
    descricao_ementa = Column(String(2000), nullable=True)
    categoria = Column(String(50), nullable=False, default="ATA") # ATA, DECRETO, REGULAMENTO, CIRCULAR, CONVITE, MODELO
    tipo_origem = Column(String(50), nullable=False, default="CONSELHO") # CONSELHO, LOJA
    loja_emissora_id = Column(String(36), nullable=True)
    loja_emissora_nome = Column(String(255), nullable=True)
    loja_emissora_numero = Column(String(50), nullable=True)
    autor_nome = Column(String(255), nullable=False)
    autor_cargo = Column(String(100), nullable=True)
    data_documento = Column(Date, nullable=False)
    data_publicacao = Column(DateTime, default=datetime.utcnow)
    arquivo_url = Column(String(500), nullable=True)
    tamanho_bytes = Column(Integer, default=0)
    downloads_count = Column(Integer, default=0)
    visibilidade = Column(String(50), default="PUBLICO_CONSELHO") # PUBLICO_CONSELHO, RESTRITO_DIRETORIA
    conteudo_texto = Column(String(10000), nullable=True)
    deletado_visualmente = Column(Boolean, default=False)

    regiao = relationship("Regiao", back_populates="documentos")


class TopicoComunicacao(Base):
    """
    Tópico/Protocolo de Comunicação Oficial Interna.
    Alcances:
    - CONSELHO_LOJA: Bilateral privativo entre a Diretoria do Conselho e uma Loja específica.
    - LOJA_LOJA: Canal restrito inter-lojas (exclusivo entre a Loja de Origem e a Loja de Destino).
    - CIRCULAR: Prancha oficial de difusão geral da Diretoria para todas as Lojas.
    """
    __tablename__ = "topicos_comunicacao"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    assunto = Column(String(255), nullable=False)
    categoria = Column(String(50), nullable=False, default="ADMINISTRATIVO") # ADMINISTRATIVO, FINANCEIRO, LITURGICO, INTER_LOJAS, SINDICANCIA_CONFIDENCIAL, PROTOCOLO
    tipo_alcance = Column(String(50), nullable=False, default="CONSELHO_LOJA") # CONSELHO_LOJA, LOJA_LOJA, CIRCULAR

    # Loja de Origem (quem abriu o chamado ou prancha)
    loja_origem_id = Column(String(36), nullable=True)
    loja_origem_nome = Column(String(255), nullable=True)
    loja_origem_numero = Column(String(50), nullable=True)

    # Loja de Destino (em caso de LOJA_LOJA ou CONSELHO_LOJA)
    loja_destino_id = Column(String(36), nullable=True)
    loja_destino_nome = Column(String(255), nullable=True)
    loja_destino_numero = Column(String(50), nullable=True)

    prioridade = Column(String(20), nullable=False, default="NORMAL") # NORMAL, URGENTE, CONFIDENCIAL
    status = Column(String(30), nullable=False, default="ABERTA") # ABERTA, RESPONDIDA, CONCLUIDA, ARQUIVADA

    criado_por_id = Column(String(255), nullable=False)
    criado_por_nome = Column(String(255), nullable=False)
    criado_por_tipo = Column(String(20), nullable=False, default="DIRETORIA") # DIRETORIA, LOJA

    data_criacao = Column(DateTime, default=datetime.utcnow)
    data_ultima_mensagem = Column(DateTime, default=datetime.utcnow)
    deletado_visualmente = Column(Boolean, default=False)

    regiao = relationship("Regiao", back_populates="topicos_comunicacao")
    mensagens = relationship("MensagemComunicacao", back_populates="topico", cascade="all, delete-orphan", order_by="MensagemComunicacao.data_envio.asc()")


class MensagemComunicacao(Base):
    """
    Mensagem/Prancha oficial enviada dentro de um tópico de comunicação.
    """
    __tablename__ = "mensagens_comunicacao"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    topico_id = Column(String(36), ForeignKey("topicos_comunicacao.id"), nullable=False)
    remetente_id = Column(String(255), nullable=False)
    remetente_nome = Column(String(255), nullable=False)
    remetente_cargo = Column(String(100), nullable=True)
    tipo_remetente = Column(String(20), nullable=False, default="DIRETORIA") # DIRETORIA, LOJA
    loja_remetente_id = Column(String(36), nullable=True)

    conteudo = Column(String(5000), nullable=False)
    data_envio = Column(DateTime, default=datetime.utcnow)
    arquivo_url = Column(String(500), nullable=True)
    arquivo_nome = Column(String(255), nullable=True)

    lida = Column(Boolean, default=False)
    data_leitura = Column(DateTime, nullable=True)
    lida_por_nome = Column(String(255), nullable=True)
    deletado_visualmente = Column(Boolean, default=False)

    topico = relationship("TopicoComunicacao", back_populates="mensagens")







