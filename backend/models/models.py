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
    historico_lideranca_lojas = relationship("HistoricoLiderancaLoja", back_populates="regiao")
    auditorias = relationship("RegistroAuditoriaRegional", back_populates="regiao")




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
    # ALTERAÇÃO (2026-09-14, bug reportado em teste): antes, um membro da
    # Diretoria era só um `usuario_id` solto, sem registro de qual Loja ele
    # representava como Venerável Mestre — então quando a Loja empossava um
    # novo VM, a Diretoria não tinha como saber que aquele assento ficou
    # "órfão" (apontando pra alguém que já não é mais VM de Loja nenhuma).
    # `loja_id` (ID interno de lojas_db.lojas) registra essa vinculação no
    # momento da indicação, para permitir detectar e sugerir a atualização
    # automática depois. Nullable por compatibilidade com registros criados
    # antes desta migração — nesses, o vínculo simplesmente não é checado
    # até a próxima edição.
    loja_id = Column(String(36), nullable=True)

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
    # ALTERAÇÃO (2026-09-14): transmissão de cargo emergencial de VM — quando
    # uma Loja fica órfã (sem Venerável Mestre) e não regulariza pelo módulo
    # Lojas, o VM substituído (agora "Mestre Instalado", grau tradicional
    # gravado em lojas_db) pode ser transformado neste Suplente-regente, com
    # poder excepcional e de USO ÚNICO de indicar diretamente o próximo VM
    # da própria Loja (ver regional/rotas.py::executar_transmissao_emergencial_vm
    # e claude/decisao-transmissao-cargo-vm.md no Project). Concedido pela
    # Diretoria (`conceder_transmissao_emergencial`); consumido (voltando a
    # False) assim que o próprio Suplente-regente exerce o poder.
    pode_indicar_veneravel = Column(Boolean, nullable=False, default=False)
    concedido_em = Column(DateTime, nullable=True)
    # ALTERAÇÃO (2026-09-14): reconciliação semanal Diretoria×Lojas — por
    # decisão explícita do usuário, o Core só precisa acompanhar o Venerável
    # Mestre e o Suplente por ele indicado (não a diretoria completa da
    # Loja). `vinculo_valido` registra se o Suplente designado ainda ocupa
    # um dos 6 cargos eletivos elegíveis (`CARGOS_SUPLENTE_ELEGIVEIS`) no
    # módulo Lojas — fica `False` quando o oficial já não ocupa mais aquele
    # cargo lá (ex.: perdeu o cargo numa posse nova) e o Conselho ainda não
    # foi avisado. Não se aplica ao Suplente-regente da transmissão
    # emergencial (`concedido_em` preenchido) — esse é o "Mestre Instalado",
    # que por definição não ocupa nenhum dos 6 cargos eletivos, então é
    # ignorado por esta checagem (ver `core/reconciliacao_diretoria_lojas.py`).
    vinculo_valido = Column(Boolean, nullable=False, default=True)
    vinculo_invalido_detalhe = Column(String(1000), nullable=True)
    vinculo_verificado_em = Column(DateTime, nullable=True)

class HistoricoLiderancaLoja(Base):
    """
    Registro PRÓPRIO do Conselho sobre quem é o Venerável Mestre de cada
    Loja jurisdicionada — adicionado 2026-09-14 como parte da decisão de
    tornar o CoReVM um módulo semi-autônomo (ver
    `claude/decisao-resiliencia-core-semiautonomo.md` no Project "Core").

    Diferente de uma simples leitura ao vivo de `lojas_db`, este é o dado
    que a Diretoria/elegibilidade do Conselho efetivamente usa — mantido em
    dia por uma reconciliação semanal (ver
    `core/reconciliacao_diretoria_lojas.py`) que compara este registro com
    `lojas_db` e só avisa (não sobrescreve às cegas) quando os dois
    divergem. Isso permite ao Conselho continuar funcionando mesmo que uma
    Loja específica não mantenha seu cadastro em dia no módulo Lojas, ou que
    o módulo Lojas esteja temporariamente inacessível.

    `fonte`: "SYNC_LOJAS" (o valor mais recente veio de uma sincronização
    normal — lojas_db é a fonte de verdade presumida) ou "OVERRIDE_CONSELHO"
    (o Conselho interveio manualmente — ex.: transmissão emergencial de VM —
    e a reconciliação não deve sobrescrever esse valor até que lojas_db
    passe a bater com ele, sinal de que a Loja regularizou-se).
    """
    __tablename__ = "historico_lideranca_loja"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    loja_id = Column(String(36), nullable=False, unique=True)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    veneravel_cim = Column(String(50), nullable=True)
    veneravel_nome = Column(String(255), nullable=True)
    veneravel_email = Column(String(255), nullable=True)
    fonte = Column(String(30), nullable=False, default="SYNC_LOJAS")
    confirmado_em = Column(DateTime, nullable=True)
    divergente = Column(Boolean, nullable=False, default=False)
    divergencia_detalhe = Column(String(1000), nullable=True)
    ultima_verificacao_em = Column(DateTime, nullable=True)
    ultimo_alerta_em = Column(DateTime, nullable=True)

    regiao = relationship("Regiao", back_populates="historico_lideranca_lojas")


class OperadorAdministrativoLoja(Base):
    """
    Perfil de acesso puramente administrativo, escopado a uma única Loja —
    adicionado 2026-09-15 (ver `claude/decisao-controle-acesso-cadastro.md`
    no Project "Core", seção 5). Diferente do Suplente do Conselho (que tem,
    na prática, as mesmas permissões do Venerável Mestre dentro do
    Conselho — é representação política da Loja), este perfil é só
    operacional: quem o ocupa pode executar tarefas administrativas da
    própria Loja (cadastro, avisos, upload de documentos etc.), mas não tem
    nenhuma visão de dados de outras Lojas e não pode tomar nenhuma decisão
    política da Loja (não pode designar/trocar o Suplente do Conselho, nem
    acionar a transmissão de cargo emergencial de VM — essas continuam
    exclusivas do VM/Diretoria).

    `slot`: "SECRETARIO" ou "CHANCELER" — dois slots independentes por
    Loja (`UNIQUE(loja_id, slot)`), para não haver ponto único de falha
    operacional. É um rótulo organizacional, não uma amarração obrigatória
    ao cargo eletivo homônimo: confirmado por consulta direta a `lojas_db`
    (2026-09-15) que NÃO existe cargo formal de "Secretário Adjunto" nem
    "Chanceler Adjunto" na tabela `cargos` — por isso a designação de quem
    ocupa cada slot é livre (feita pelo VM ou pela Diretoria), dentro da
    mesma lista de elegíveis já usada para o Suplente do Conselho
    (`CARGOS_SUPLENTE_ELEGIVEIS`, incluindo Mestre Instalado com vínculo
    ativo — ver `api/v1/regional/rotas.py`).
    """
    __tablename__ = "operadores_administrativos_loja"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    loja_id = Column(String(36), nullable=False)
    slot = Column(String(20), nullable=False)  # "SECRETARIO" ou "CHANCELER"
    usuario_id = Column(String(255), nullable=False)  # CIM do ocupante do slot
    nome_operador = Column(String(255), nullable=False)
    email_operador = Column(String(255), nullable=True)
    ativo = Column(Boolean, nullable=False, default=True)
    designado_por = Column(String(255), nullable=True)
    designado_em = Column(DateTime, nullable=False, default=datetime.utcnow)


class AvisoRegional(Base):
    """
    Mural de Avisos e Notificações do Conselho Regional.
    Níveis de atenção: BAIXO (Informativo), MEDIO (Alerta), ALTO (Urgência).
    Tipos: AVISO, NOTIFICACAO.
    Suporta arquivamento (soft-delete) com log de quem/quando arquivou.

    ALTERAÇÃO (2026-09-12): `deletado_visualmente` renomeado para
    `arquivado` — é o mesmo mecanismo de sempre (soft-delete), só que agora
    a Mesa Diretora pode consultar e reverter (ver rota
    `PUT /avisos/{id}/reativar`), o que deixou de fazer sentido chamar de
    "deletado". `arquivado_em`/`arquivado_por` registram o log pedido pelo
    usuário ("Arquivado em xx/xx/xxxx por fulano"). Requer a migração SQL
    `migracao_avisos_arquivamento_e_lidos.sql` antes do deploy.
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
    arquivado = Column(Boolean, default=False)
    arquivado_em = Column(DateTime, nullable=True)
    arquivado_por = Column(String(255), nullable=True)


class AvisoLido(Base):
    """
    Registro de leitura de um Aviso/Notificação por uma pessoa (tag "lido").
    Um mesmo aviso é lido de forma independente por cada membro do
    Conselho — por isso é uma tabela própria (N:N Aviso↔Pessoa via
    usuario_id/CIM), não uma coluna em AvisoRegional.
    """
    __tablename__ = "avisos_lidos"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    aviso_id = Column(String(36), ForeignKey("avisos_regionais.id", ondelete="CASCADE"), nullable=False)
    usuario_id = Column(String(255), nullable=False)
    lido_em = Column(DateTime, nullable=False, default=datetime.utcnow)

class EventoAgenda(Base):
    """
    Módulo novo (2026-09-15) — Agenda do Conselho: calendário de eventos. Ver
    `claude/decisao-controle-acesso-cadastro.md`, seção 9.

    ATUALIZAÇÃO (2026-09-16): catálogo de tipos fechado com o usuário,
    substituindo o rascunho genérico inicial (SESSAO/REUNIAO/VISITA/...).
    Cada tipo tem um `ambito` fixo (ver `TIPOS_EVENTO_AGENDA` em
    `api/v1/regional/rotas.py`): `CONSELHO` (só Mesa Diretora/SuperAdmin,
    nunca tem Loja organizadora), `LOJA` (só uma Loja específica) ou
    `AMBOS` (Conselho ou uma Loja, dependendo de quem lança). `subtipo` é
    usado sobretudo por `SESSAO_MAGNA` (Iniciação, Elevação, Exaltação,
    Posse, Instalação, Comemorativa), mas fica livre para os demais tipos.

    Decisões de design fechadas com o usuário:
    - Leitura SEMPRE region-wide (mural, igual `AvisoRegional`) — todo
      evento de qualquer Loja aparece para todo o conselho.
    - Escrita aberta a VM/Suplente/Diretoria/SuperAdmin e também ao
      Operador Administrativo da Loja, sempre com `loja_organizadora_id`
      travado na Loja de quem cria (exceto tipos `CONSELHO`, que nunca têm
      Loja organizadora).
    - `SESSAO_MAGNA` é normalmente sincronizada a partir do módulo Lojas
      (dashboard de lá já lança essas sessões) — `origem_lancamento`
      distingue `LOJAS` (sincronizado; sincronização em si ainda não
      implementada, ver seção 9 do documento de decisão) de `CORE`
      (lançado manualmente aqui, inclusive para coordenação quando a Loja
      não lançou pelo módulo Lojas).
    - Integração com Admissões: `previa_admissao_id` (opcional) referencia
      a prévia que originou o evento (ex.: uma Iniciação agendada a partir
      de uma prévia concluída).
    - Integração com Avisos: se `aviso_gerado_id` estiver preenchido, o
      evento gerou automaticamente um `AvisoRegional` como lembrete
      (criado na mesma transação da criação do evento, ver
      `criar_evento_agenda` em `api/v1/regional/rotas.py`).
    """
    __tablename__ = "eventos_agenda"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False)
    titulo = Column(String(255), nullable=False)
    descricao = Column(String(3000), nullable=True)
    tipo = Column(String(50), nullable=False)  # ver TIPOS_EVENTO_AGENDA em api/v1/regional/rotas.py
    subtipo = Column(String(50), nullable=True)  # ex.: INICIACAO/ELEVACAO/EXALTACAO/POSSE/INSTALACAO/COMEMORATIVA para SESSAO_MAGNA
    data_inicio = Column(DateTime, nullable=False)
    data_fim = Column(DateTime, nullable=True)
    loja_organizadora_id = Column(String(36), nullable=True)
    loja_organizadora_nome = Column(String(255), nullable=True)
    loja_organizadora_numero = Column(String(50), nullable=True)
    criado_por_id = Column(String(255), nullable=True)
    criado_por_nome = Column(String(255), nullable=True)
    criado_por_tipo = Column(String(100), nullable=True)
    previa_admissao_id = Column(String(36), ForeignKey("previas_admissao.id"), nullable=True)
    aviso_gerado_id = Column(String(36), ForeignKey("avisos_regionais.id"), nullable=True)
    origem_lancamento = Column(String(20), nullable=False, default="CORE")  # CORE | LOJAS
    status = Column(String(50), nullable=False, default="AGENDADO")  # AGENDADO, REALIZADO, CANCELADO
    criado_em = Column(DateTime, nullable=False, default=datetime.utcnow)
    atualizado_em = Column(DateTime, nullable=True)


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
    # ALTERAÇÃO (2026-09-22, a pedido do usuário -- "criar um tempo de expiração da
    # publicação de um convite ou documento, para que o sistema arquive
    # automaticamente"): `data_expiracao` é opcional -- se preenchida, o agendador
    # (ver `arquivar_documentos_vencidos_automaticamente` em
    # `core/tarefas_agendadas.py`) arquiva o documento/convite automaticamente
    # assim que a data passa, reaproveitando `deletado_visualmente` como o mesmo
    # flag de arquivamento/ocultação já usado pelo endpoint de exclusão manual
    # (não foi renomeado para "arquivado" como em AvisoRegional para não exigir
    # migração de dados existentes -- mesmo efeito, nome da coluna mantido).
    # `arquivado_em`/`arquivado_por` dão o mesmo log de auditoria que
    # AvisoRegional já tem, preenchidos tanto no arquivamento manual quanto no
    # automático (com `arquivado_por="Sistema (expiração automática)"`).
    data_expiracao = Column(Date, nullable=True)
    arquivado_em = Column(DateTime, nullable=True)
    arquivado_por = Column(String(255), nullable=True)
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


class TemplateRelatorio(Base):
    """
    Template HTML de relatório gerenciado pelo SuperAdmin.
    O conteúdo usa sintaxe Jinja2 para variáveis dinâmicas.
    Templates são globais (disponíveis para todos os conselhos).
    """
    __tablename__ = "templates_relatorio"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    nome = Column(String(150), nullable=False)
    descricao = Column(String(500), nullable=True)
    tipo = Column(
        String(50), nullable=False, default="livre"
        # Valores: "prancha" | "relatorio_lojas" | "patrimonio" | "integrantes" | "livre"
    )
    conteudo_html = Column(String(1000000), nullable=False)  # HTML com Jinja2
    variaveis_disponiveis = Column(String(5000), nullable=True)  # JSON com vars disponíveis
    criado_em = Column(DateTime, default=datetime.utcnow, nullable=False)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    ativo = Column(Boolean, default=True)
    criado_por = Column(String(36), nullable=True)  # usuario_id do superadmin


class RegistroAuditoriaRegional(Base):
    """
    Trilha de auditoria e governança de ações críticas no Conselho Regional.
    Registra com precisão quem realizou a ação, data/hora, entidade afetada e payload de modificação.
    """
    __tablename__ = "registros_auditoria_regional"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    regiao_id = Column(String(36), ForeignKey("regioes.id"), nullable=False, index=True)
    usuario_id = Column(String(255), nullable=False, index=True)
    usuario_nome = Column(String(255), nullable=True)
    usuario_cargo = Column(String(100), nullable=True)
    acao = Column(String(100), nullable=False, index=True)
    entidade = Column(String(100), nullable=False)
    entidade_id = Column(String(100), nullable=True)
    detalhes = Column(String(5000), nullable=True)
    ip_origem = Column(String(50), nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    regiao = relationship("Regiao", back_populates="auditorias")




