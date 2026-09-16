# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import os
from datetime import date
from fastapi import HTTPException, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session
from loguru import logger
from typing import Optional
from database import get_db_core, get_db_lojas
from models.models import DiretoriaConselho, LojaAgregada, SuplenteConselho, OperadorAdministrativoLoja
from models.lojas_models import ObreiroIntegracao, Mandato, ObreiroLojaAssociacao
from core.auth_esigma import UsuarioEsigma, obter_usuario_esigma
from sqlalchemy import text

# CORREÇÃO DE SEGURANÇA (2026-09-11): esta dependência aceitava um header
# `x-user-id` enviado livremente pelo cliente, SEM QUALQUER VERIFICAÇÃO —
# qualquer requisição podia se autodeclarar "superadmin"/"admin" e obter
# acesso total de Diretoria do Conselho Regional. A partir de agora, a
# identidade do usuário só é aceita depois de validada pelo e-Sigma via
# GET /api/v1/auth/validate (ver core/auth_esigma.py), repassando o mesmo
# token Bearer que o frontend do CoReVM já envia hoje (AuthContext.tsx já
# injeta `Authorization: Bearer <token>` em toda chamada — o backend só não
# estava validando esse token).
#
# Os "bypasses" de desenvolvimento que existiam aqui (strings mágicas
# "superadmin", "admin", "CIM_12345_PRESIDENTE", prefixo "VM_") ficam
# desativados por padrão (Security by Default). Só ficam disponíveis se a
# variável de ambiente COREVM_PERMITIR_BYPASS_DEV=true estiver definida —
# nunca configure isso em produção.
_BYPASS_DEV_HABILITADO = os.getenv("COREVM_PERMITIR_BYPASS_DEV", "false").lower() == "true"


class RegionalUserContext:
    # CORREÇÃO (2026-09-12): um membro da Diretoria (Presidente/Vice/
    # Secretário) costuma SER TAMBÉM o Venerável Mestre da própria Loja —
    # são cargos acumuláveis, não excludentes. Antes, assim que a pessoa era
    # reconhecida como Diretoria, o código nunca mais verificava o mandato
    # de VM: `loja_id` ficava sempre None e a pessoa perdia qualquer vínculo
    # com a própria Loja dentro do CoReVM (não aparecia como "sua Loja" em
    # nenhuma tela). `is_veneravel` agora sinaliza esse acúmulo de papéis
    # explicitamente, e `loja_id` é preenchido sempre que houver mandato de
    # VM ativo — mesmo quando `is_diretoria` também é True. O acesso pleno
    # de Diretoria (`can_edit_loja` sempre True) não muda: isto só ACRESCENTA
    # informação de contexto, nunca restringe.
    def __init__(self, usuario_id: str, role: str, regiao_id: str, is_diretoria: bool, loja_id: Optional[str] = None, is_veneravel: bool = False):
        self.usuario_id = usuario_id
        self.role = role
        self.regiao_id = regiao_id
        self.is_diretoria = is_diretoria
        self.loja_id = loja_id
        self.is_veneravel = is_veneravel

    def can_edit_loja(self, target_loja_id: str) -> bool:
        if self.is_diretoria:
            return True
        return str(self.loja_id) == str(target_loja_id)


def _resolver_loja_vm_ativa(identificador: str, lojas_ids: list, db_lojas: Session) -> Optional[str]:
    """
    Resolve, se houver, a Loja (dentre as agregadas a este Conselho) onde
    `identificador` (CIM/CPF) possui mandato ATIVO de Venerável Mestre
    (cargo_id=1) em lojas_db. Usada tanto para reconhecer um VM "puro"
    quanto para enriquecer o contexto de um membro da Diretoria que também
    seja VM da própria Loja.
    """
    try:
        obreiro = db_lojas.query(ObreiroIntegracao).filter(
            (ObreiroIntegracao.cim == identificador) |
            (ObreiroIntegracao.cpf == identificador) |
            (ObreiroIntegracao.id == int(identificador) if identificador.isdigit() else False)
        ).first()

        if not obreiro:
            return None

        mandato = db_lojas.query(Mandato).filter(
            Mandato.obreiro_id == obreiro.id,
            Mandato.cargo_id == 1,
            or_(Mandato.data_fim.is_(None), Mandato.data_fim >= date.today())
        ).first()

        if mandato and str(mandato.loja_id) in lojas_ids:
            return str(mandato.loja_id)
    except Exception as e:
        logger.warning(f"Erro ao checar mandato de VM em lojas_db para {identificador}: {e}")

    return None

def _resolver_regional_user_ou_none(
    regiao_id: str,
    usuario: UsuarioEsigma,
    db_core: Session,
    db_lojas: Session,
) -> Optional[RegionalUserContext]:
    """
    Núcleo de resolução de `get_current_regional_user`, extraído para
    devolver `None` em vez de levantar 403 quando não encontra vínculo —
    permite que `get_current_regional_user` (abaixo) mantenha o
    comportamento de sempre (403 imediato) enquanto o resolvedor combinado
    `obter_identidade_regional_ou_operador_administrativo` (mais abaixo)
    pode tentar este caminho primeiro e cair para Operador Administrativo
    sem duplicar a lógica de SuperAdmin/Diretoria/Suplente/VM.
    """
    identificador = usuario.identificador_negocio

    # 0. Bypasses de desenvolvimento — DESATIVADOS por padrão (ver nota no
    # topo do arquivo). Só existem para facilitar testes locais sem depender
    # de um e-Sigma rodando, e nunca devem ser habilitados em produção.
    if _BYPASS_DEV_HABILITADO:
        if identificador in ["superadmin", "admin"]:
            logger.warning(f"RBAC Bypass DEV SuperAdmin: {identificador} na Região {regiao_id}")
            return RegionalUserContext(usuario_id=identificador, role="SUPERADMIN", regiao_id=regiao_id, is_diretoria=True)
        if identificador == "CIM_12345_PRESIDENTE":
            logger.warning(f"RBAC Bypass DEV Presidente: {identificador} na Região {regiao_id}")
            return RegionalUserContext(usuario_id=identificador, role="PRESIDENTE", regiao_id=regiao_id, is_diretoria=True)
        if identificador and identificador.startswith("VM_"):
            loja_id_mock = identificador.replace("VM_", "")
            logger.warning(f"RBAC Bypass DEV VM Loja {loja_id_mock}")
            return RegionalUserContext(usuario_id=identificador, role="VENERAVEL", regiao_id=regiao_id, is_diretoria=False, loja_id=loja_id_mock)

    # 1. SuperAdmin verificado de fato pelo e-Sigma (o papel vem do token
    # validado no servidor, não de um valor que o cliente pode simplesmente
    # declarar).
    if usuario.is_super_admin:
        logger.info(f"RBAC SuperAdmin verificado via e-Sigma: {usuario.email} na Região {regiao_id}")
        return RegionalUserContext(usuario_id=identificador or usuario.email, role="SUPERADMIN", regiao_id=regiao_id, is_diretoria=True)

    if not identificador:
        return None

    # 2. Verifica se é membro da Diretoria do Conselho
    diretor = db_core.query(DiretoriaConselho).filter(
        DiretoriaConselho.regiao_id == regiao_id,
        DiretoriaConselho.usuario_id == identificador
    ).first()

    # 3. Obtém IDs das lojas agregadas a esta região (usado tanto para achar
    # o mandato de VM quanto para validar o vínculo de Suplente abaixo).
    lojas_conselho = db_core.query(LojaAgregada.loja_id).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()
    lojas_ids = [str(l[0]) for l in lojas_conselho]

    if diretor:
        # Um Presidente/Vice/Secretário costuma SER TAMBÉM o Venerável
        # Mestre da própria Loja — verificamos aqui para não perder esse
        # vínculo (ver nota em RegionalUserContext acima).
        loja_id_vm = _resolver_loja_vm_ativa(identificador, lojas_ids, db_lojas)
        logger.info(
            f"RBAC Diretoria: {diretor.cargo.value} ({identificador}) na Região {regiao_id}"
            + (f" — também VM da Loja {loja_id_vm}" if loja_id_vm else "")
        )
        return RegionalUserContext(
            usuario_id=identificador,
            role=diretor.cargo.value.upper(),
            regiao_id=regiao_id,
            is_diretoria=True,
            loja_id=loja_id_vm,
            is_veneravel=bool(loja_id_vm)
        )

    # 4. Verifica se é Suplente cadastrado no Conselho
    suplente = db_core.query(SuplenteConselho).filter(
        SuplenteConselho.usuario_id == identificador,
        SuplenteConselho.loja_id.in_(lojas_ids)
    ).first()

    if suplente:
        logger.info(f"RBAC Suplente: {identificador} da Loja {suplente.loja_id}")
        return RegionalUserContext(
            usuario_id=identificador,
            role="SUPLENTE",
            regiao_id=regiao_id,
            is_diretoria=False,
            loja_id=str(suplente.loja_id)
        )

    # 5. Verifica se é Venerável Mestre no banco lojas_db
    loja_id_vm = _resolver_loja_vm_ativa(identificador, lojas_ids, db_lojas)
    if loja_id_vm:
        logger.info(f"RBAC VM: {identificador} da Loja {loja_id_vm}")
        return RegionalUserContext(
            usuario_id=identificador,
            role="VENERAVEL",
            regiao_id=regiao_id,
            is_diretoria=False,
            loja_id=loja_id_vm,
            is_veneravel=True
        )

    return None


def get_current_regional_user(
    regiao_id: str,
    usuario: UsuarioEsigma = Depends(obter_usuario_esigma),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
) -> RegionalUserContext:
    """
    Resolve o contexto de permissão do usuário dentro da Região:
    - SuperAdmin / Presidente / Vice / Secretário: Diretoria (acesso pleno à gestão do conselho)
    - Venerável Mestre: Acesso de visualização regional e edição exclusiva da sua Loja
    - Suplente: Acesso de visualização regional e edição exclusiva da sua Loja

    A identidade em `usuario` já foi validada pelo e-Sigma (ver
    core/auth_esigma.py) — o identificador usado para casar com os registros
    de negócio do CoReVM (CIM/CPF) vem de `usuario.identificador_negocio`,
    nunca de um valor enviado sem verificação pelo cliente.
    """
    user = _resolver_regional_user_ou_none(regiao_id, usuario, db_core, db_lojas)
    if user is not None:
        return user

    if not usuario.identificador_negocio:
        logger.error(f"Usuário validado pelo e-Sigma ({usuario.email}) não possui CIM/CPF cadastrado — impossível resolver vínculo no CoReVM.")
        raise HTTPException(status_code=403, detail="Seu cadastro não possui CIM/CPF vinculado. Não é possível determinar seu vínculo com um Conselho Regional.")

    logger.error(f"Acesso negado no CoReVM: {usuario.identificador_negocio} não possui vínculo ativo na Região {regiao_id}")
    raise HTTPException(status_code=403, detail="Acesso negado: Você não possui permissão de acesso a este Conselho Regional.")

def get_current_director(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user)
) -> RegionalUserContext:
    """
    Exige especificamente perfil de Diretoria (SuperAdmin, Presidente, Vice-Presidente ou Secretário).
    """
    if not user.is_diretoria:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado: Esta ação é exclusiva para a Diretoria do Conselho Regional."
        )
    return user


# ADIÇÃO (2026-09-15): perfil "Operador Administrativo da Loja" — ver
# `claude/decisao-controle-acesso-cadastro.md` no Project "Core", seção 5.
# Acesso puramente administrativo, escopado a UMA loja, sem nenhuma
# visibilidade de dados de outras Lojas. Por isso, deliberadamente, NÃO foi
# adicionado como um caso a mais dentro de `get_current_regional_user` —
# aquela função resolve identidade para rotas de âmbito REGIONAL (dashboard,
# avisos do Conselho, etc.), que hoje não filtram por Loja. Se o Operador
# Administrativo ganhasse um `RegionalUserContext` normal, ele passaria a
# enxergar qualquer rota que só exija "usuário autenticado no Conselho" —
# exatamente o vazamento entre Lojas que este perfil existe para evitar.
# Este é um caminho de resolução de identidade TOTALMENTE separado,
# amarrado a um `loja_id` específico desde o início, nunca a um `regiao_id`.

# Mesma lista usada em `api/v1/regional/rotas.py::CARGOS_SUPLENTE_ELEGIVEIS`
# (os 6 cargos eletivos da Loja que não o Venerável Mestre). Duplicada aqui
# de propósito — importar de `regional/rotas.py` criaria um import circular
# (aquele módulo já importa deste). Se a lista mudar lá, precisa mudar aqui
# também. Mesmo padrão já usado em `core/reconciliacao_diretoria_lojas.py`.
CARGOS_SUPLENTE_ELEGIVEIS_IDS = [2, 3, 4, 5, 6, 7]


def _obreiro_e_mestre_instalado_ativo_na_loja(db_lojas: Session, obreiro_id: int, loja_id: int) -> bool:
    """Mesma checagem de `regional/rotas.py::_obreiro_e_mestre_instalado_ativo_na_loja`
    e de `core/reconciliacao_diretoria_lojas.py` (duplicada aqui pelo mesmo
    motivo de sempre — evitar import circular)."""
    grau = db_lojas.execute(
        text("SELECT grau FROM obreiros WHERE id = :id"),
        {"id": obreiro_id},
    ).scalar()
    if grau != "Mestre Instalado":
        return False

    vinculo_ativo = db_lojas.query(ObreiroLojaAssociacao).filter(
        ObreiroLojaAssociacao.obreiro_id == obreiro_id,
        ObreiroLojaAssociacao.loja_id == loja_id,
        ObreiroLojaAssociacao.status == "Ativo",
    ).first()
    return vinculo_ativo is not None


def _operador_administrativo_ainda_elegivel(db_lojas: Session, identificador: str, loja_id: int) -> bool:
    """
    Revalida, EM TEMPO REAL (sem cache/lote — decisão explícita da seção
    5.5 do documento de decisão, diferente de VM/Suplente que só são
    revalidados na reconciliação semanal), se quem ocupa um slot de
    Operador Administrativo ainda tem vínculo elegível com a Loja: um dos 6
    cargos eletivos, ou status de Mestre Instalado com vínculo ativo.
    """
    obreiro = (
        db_lojas.query(ObreiroIntegracao)
        .filter((ObreiroIntegracao.cim == identificador) | (ObreiroIntegracao.cpf == identificador))
        .first()
    )
    if not obreiro:
        return False

    mandato_ativo = (
        db_lojas.query(Mandato)
        .filter(
            Mandato.obreiro_id == obreiro.id,
            Mandato.loja_id == loja_id,
            Mandato.cargo_id.in_(CARGOS_SUPLENTE_ELEGIVEIS_IDS),
            or_(Mandato.data_fim.is_(None), Mandato.data_fim >= date.today()),
        )
        .first()
    )
    if mandato_ativo:
        return True

    return _obreiro_e_mestre_instalado_ativo_na_loja(db_lojas, obreiro.id, loja_id)


class OperadorAdministrativoContext:
    """Identidade resolvida para o perfil Operador Administrativo — bem
    mais restrita que `RegionalUserContext` de propósito: não carrega
    `regiao_id` nem qualquer noção de acesso além da própria Loja."""
    def __init__(self, usuario_id: str, loja_id: str, slot: str, nome: str):
        self.usuario_id = usuario_id
        self.loja_id = loja_id
        self.slot = slot
        self.nome = nome
        self.role = "OPERADOR_ADMINISTRATIVO"
        self.is_diretoria = False


def obter_operador_administrativo_da_loja(
    loja_id: str,
    usuario: UsuarioEsigma = Depends(obter_usuario_esigma),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas),
) -> OperadorAdministrativoContext:
    """
    Resolve a identidade de quem ocupa um slot de Operador Administrativo
    ATIVO para esta Loja específica — não aceita ninguém que não esteja
    designado, mesmo que seja um oficial elegível "no papel" (a designação
    em `operadores_administrativos_loja` é obrigatória, ela é que concede o
    acesso, não a mera elegibilidade de cargo).
    """
    identificador = usuario.identificador_negocio
    if not identificador:
        raise HTTPException(
            status_code=403,
            detail="Seu cadastro não possui CIM/CPF vinculado. Não é possível determinar seu vínculo com esta Loja."
        )

    if not str(loja_id).isdigit():
        raise HTTPException(status_code=400, detail="Loja inválida.")

    operador = db_core.query(OperadorAdministrativoLoja).filter(
        OperadorAdministrativoLoja.loja_id == str(loja_id),
        OperadorAdministrativoLoja.usuario_id == identificador,
        OperadorAdministrativoLoja.ativo == True,
    ).first()

    if not operador:
        raise HTTPException(
            status_code=403,
            detail="Acesso negado: você não está designado como Operador Administrativo desta Loja."
        )

    if not _operador_administrativo_ainda_elegivel(db_lojas, identificador, int(loja_id)):
        logger.warning(
            f"Operador Administrativo {identificador} (slot {operador.slot}, Loja {loja_id}) "
            "perdeu o vínculo elegível no módulo Lojas — acesso negado nesta requisição."
        )
        raise HTTPException(
            status_code=403,
            detail="Seu vínculo como Operador Administrativo desta Loja não pôde ser confirmado no módulo Lojas."
        )

    return OperadorAdministrativoContext(
        usuario_id=identificador, loja_id=str(loja_id), slot=operador.slot, nome=operador.nome_operador
    )


# ADIÇÃO (2026-09-15): resolvedor COMBINADO — decisão revisada em
# `claude/decisao-controle-acesso-cadastro.md` (seção 9). Rotas de âmbito
# regional cujo RBAC de leitura/escrita já isola por `loja_id` (Documentos,
# Comunicação) ou que foram deliberadamente reajustadas para isolar
# (Admissões) ou que não carregam dado sensível de outra Loja (Avisos,
# Agenda) passam a usar ESTE resolvedor em vez de `get_current_regional_user`
# puro. Ele tenta primeiro o caminho normal (SuperAdmin/Diretoria/Suplente/
# VM) e SÓ cai para Operador Administrativo se nenhum desses bater — e,
# mesmo assim, só aceita a designação se a Loja do operador estiver entre as
# Lojas agregadas a ESTA região (nunca um operador de Loja de outro
# Conselho). Rotas que NÃO foram reavaliadas (Patrimônio, Votação, painéis
# regionais gerais) continuam exclusivamente em `get_current_regional_user`.
def obter_identidade_regional_ou_operador_administrativo(
    regiao_id: str,
    usuario: UsuarioEsigma = Depends(obter_usuario_esigma),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas),
):
    """
    Retorna um `RegionalUserContext` (SuperAdmin/Diretoria/Suplente/VM) ou,
    na ausência de qualquer um desses vínculos, um `OperadorAdministrativoContext`
    — desde que a Loja da designação pertença a esta região. Levanta 403 se
    nenhum dos dois caminhos resolver.
    """
    user = _resolver_regional_user_ou_none(regiao_id, usuario, db_core, db_lojas)
    if user is not None:
        return user

    identificador = usuario.identificador_negocio
    if not identificador:
        raise HTTPException(
            status_code=403,
            detail="Seu cadastro não possui CIM/CPF vinculado. Não é possível determinar seu vínculo com um Conselho Regional."
        )

    lojas_conselho = db_core.query(LojaAgregada.loja_id).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()
    lojas_ids = [str(l[0]) for l in lojas_conselho]

    operador = db_core.query(OperadorAdministrativoLoja).filter(
        OperadorAdministrativoLoja.usuario_id == identificador,
        OperadorAdministrativoLoja.ativo == True,
        OperadorAdministrativoLoja.loja_id.in_(lojas_ids),
    ).first()

    if operador and _operador_administrativo_ainda_elegivel(db_lojas, identificador, int(operador.loja_id)):
        logger.info(
            f"RBAC Operador Administrativo ({operador.slot}): {identificador} da Loja {operador.loja_id} "
            f"na Região {regiao_id}"
        )
        return OperadorAdministrativoContext(
            usuario_id=identificador, loja_id=str(operador.loja_id), slot=operador.slot, nome=operador.nome_operador
        )

    logger.error(f"Acesso negado no CoReVM: {identificador} não possui vínculo ativo (nem regional, nem Operador Administrativo) na Região {regiao_id}")
    raise HTTPException(status_code=403, detail="Acesso negado: Você não possui permissão de acesso a este Conselho Regional.")
