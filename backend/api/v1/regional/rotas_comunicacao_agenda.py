# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Módulo de Comunicação, Mural de Avisos e Agenda Regional (API-First).
Centraliza todas as rotas de Avisos, Eventos da Agenda e Correspondência Interna (Pranchas),
consumindo dados cadastrais de Obreiros e Lojas exclusivamente via LojasApiClient.
"""
import os
import shutil
import uuid
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from loguru import logger

from database import get_db_core
from models.models import (
    AvisoRegional,
    AvisoLido,
    EventoAgenda,
    PreviaAdmissao,
    LojaAgregada,
    Regiao,
    TopicoComunicacao,
    MensagemComunicacao,
)
from core.dependencies import (
    get_current_regional_user,
    get_current_director,
    obter_identidade_regional_ou_operador_administrativo,
    RegionalUserContext,
    OperadorAdministrativoContext,
)
from core.lojas_cliente import LojasApiClient
from utils.pdf_generator import gerar_pdf_prancha_comunicacao
from core.auditoria_service import registrar_auditoria

router = APIRouter(tags=["Comunicação e Agenda Regional"])



def _obter_nome_completo(identificador: Optional[str]) -> str:
    """
    Resolve o nome completo do obreiro através da API do módulo Lojas (API-First).
    Se não localizar, mantém o identificador original sem quebrar o fluxo.
    """
    if not identificador:
        return "Irmão do Conselho"
    try:
        dados = LojasApiClient.buscar_obreiro_por_cim(str(identificador))
        if dados and dados.get("nome_completo"):
            return dados["nome_completo"]
    except Exception:
        pass
    return str(identificador)


def _fixado_efetivo(nivel: str, fixado_solicitado: bool) -> bool:
    """Avisos de nível ALTO (Urgência) permanecem fixados no topo por padrão."""
    return True if nivel == "ALTO" else fixado_solicitado


# ==============================================================================
# SCHEMAS - AVISOS E NOTIFICAÇÕES
# ==============================================================================
class AvisoCreatePayload(BaseModel):
    titulo: str
    conteudo: str  # Limite máximo: 200 palavras
    nivel: Optional[str] = "BAIXO"  # BAIXO (Informativo), MEDIO (Alerta), ALTO (Urgência)
    tipo: Optional[str] = "AVISO"  # AVISO, NOTIFICACAO
    data_validade: Optional[date] = None
    fixado: Optional[bool] = False


class AvisoUpdatePayload(BaseModel):
    titulo: Optional[str] = None
    conteudo: Optional[str] = None
    nivel: Optional[str] = None
    tipo: Optional[str] = None
    data_validade: Optional[date] = None
    fixado: Optional[bool] = None


# ==============================================================================
# ROTAS - MURAL DE AVISOS E NOTIFICAÇÕES
# ==============================================================================
@router.get("/{regiao_id}/avisos", summary="Lista os avisos e notificações do conselho")
def listar_avisos_regionais(
    regiao_id: str,
    incluir_arquivados: bool = False,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """
    Retorna os avisos da região ordenados por prioridade de exibição.
    Consome dados cadastrais das lojas em lote via API do Lojas (API-First).
    """
    pode_ver_arquivados = user.is_diretoria or user.role.upper() == "SUPERADMIN"

    query = db.query(AvisoRegional).filter(AvisoRegional.regiao_id == regiao_id)
    if not (pode_ver_arquivados and incluir_arquivados):
        query = query.filter(AvisoRegional.arquivado == False)

    if not (user.is_diretoria or user.role.upper() == "SUPERADMIN"):
        query = query.filter(
            (AvisoRegional.data_validade == None) | (AvisoRegional.data_validade >= date.today())
        )

    avisos = query.all()

    def _prioridade(a: AvisoRegional) -> int:
        if a.nivel == "ALTO":
            return 0
        if a.nivel == "MEDIO" and a.fixado:
            return 1
        if a.nivel == "MEDIO":
            return 2
        if a.fixado:
            return 3
        return 4

    avisos.sort(key=lambda a: a.data_publicacao or date.min, reverse=True)
    avisos.sort(key=_prioridade)

    ids_avisos = [a.id for a in avisos]
    ids_lidos = set()
    if ids_avisos and user.usuario_id:
        ids_lidos = {
            l.aviso_id
            for l in db.query(AvisoLido)
            .filter(
                AvisoLido.aviso_id.in_(ids_avisos),
                AvisoLido.usuario_id == user.usuario_id,
            )
            .all()
        }

    ids_lojas_num = [int(a.loja_id) for a in avisos if a.loja_id and str(a.loja_id).isdigit()]
    numeros_loja = {}
    if ids_lojas_num:
        try:
            lojas_api = LojasApiClient.buscar_lojas_multiplas(list(set(ids_lojas_num)))
            numeros_loja = {str(l["id"]): l.get("numero_loja") for l in lojas_api}
        except Exception as e:
            logger.warning(f"Não foi possível resolver números de loja via API: {e}")

    return [
        {
            "id": a.id,
            "titulo": a.titulo,
            "conteudo": a.conteudo,
            "nivel": a.nivel or "BAIXO",
            "tipo": a.tipo or "AVISO",
            "autor_id": a.autor_id,
            "autor_nome": a.autor_nome,
            "autor_cargo": a.autor_cargo,
            "loja_id": a.loja_id,
            "loja_numero": numeros_loja.get(str(a.loja_id)) if a.loja_id else None,
            "fixado": a.fixado,
            "data_publicacao": a.data_publicacao.isoformat() if a.data_publicacao else None,
            "data_validade": a.data_validade.isoformat() if a.data_validade else None,
            "arquivado": a.arquivado,
            "arquivado_em": a.arquivado_em.isoformat() if a.arquivado_em else None,
            "arquivado_por": a.arquivado_por,
            "lido": a.id in ids_lidos,
            "pode_editar": (
                user.role.upper() == "SUPERADMIN"
                or user.is_diretoria
                or (user.loja_id and str(user.loja_id) == str(a.loja_id))
                or user.usuario_id == a.autor_id
            ),
            "pode_excluir": (
                user.role.upper() == "SUPERADMIN"
                or user.is_diretoria
                or (user.loja_id and str(user.loja_id) == str(a.loja_id))
                or user.usuario_id == a.autor_id
            ),
            "pode_reativar": pode_ver_arquivados,
            "eh_superadmin": user.role.upper() == "SUPERADMIN",
        }
        for a in avisos
    ]


@router.post("/{regiao_id}/avisos/{aviso_id}/marcar-lido", summary="Marca um aviso/notificação como lido pelo usuário atual")
def marcar_aviso_como_lido(
    regiao_id: str,
    aviso_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    """Registra leitura de aviso e desafixa do mural."""
    aviso = db.query(AvisoRegional).filter(
        AvisoRegional.id == aviso_id, AvisoRegional.regiao_id == regiao_id
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado.")

    if not user.usuario_id:
        return {"message": "Sem identificador de usuário para registrar leitura."}

    ja_lido = db.query(AvisoLido).filter(
        AvisoLido.aviso_id == aviso_id, AvisoLido.usuario_id == user.usuario_id
    ).first()
    precisa_commit = False
    if not ja_lido:
        db.add(AvisoLido(aviso_id=aviso_id, usuario_id=user.usuario_id))
        precisa_commit = True

    if aviso.fixado:
        aviso.fixado = False
        precisa_commit = True

    if precisa_commit:
        db.commit()

    return {"message": "Leitura registrada."}


@router.post("/{regiao_id}/avisos", summary="Publica um novo aviso ou notificação no conselho")
def criar_aviso_regional(
    regiao_id: str,
    payload: AvisoCreatePayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """Publica um novo aviso e replica para o mural do ERP Lojas via API (via dupla)."""
    palavras = [w for w in payload.conteudo.strip().split() if w]
    if len(palavras) > 200:
        raise HTTPException(
            status_code=400,
            detail=f"O conteúdo excede o limite máximo permitido de 200 palavras (contém {len(palavras)} palavras).",
        )

    nivel = payload.nivel.upper() if payload.nivel else "BAIXO"
    fixado_solicitado = bool(payload.fixado and (user.is_diretoria or user.role.upper() == "SUPERADMIN"))

    autor_nome = _obter_nome_completo(user.usuario_id)
    autor_cargo = (
        f"Operador Administrativo ({user.slot.capitalize()})"
        if isinstance(user, OperadorAdministrativoContext)
        else user.role
    )

    novo_aviso = AvisoRegional(
        regiao_id=regiao_id,
        titulo=payload.titulo.strip(),
        conteudo=payload.conteudo.strip(),
        nivel=nivel,
        tipo=payload.tipo.upper() if payload.tipo else "AVISO",
        data_validade=payload.data_validade,
        autor_id=user.usuario_id,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        loja_id=str(user.loja_id) if user.loja_id else None,
        fixado=_fixado_efetivo(nivel, fixado_solicitado),
        data_publicacao=date.today(),
        arquivado=False,
    )
    db.add(novo_aviso)
    db.commit()
    db.refresh(novo_aviso)

    # Sincronização via dupla via API
    try:
        if user.is_diretoria or user.role.upper() == "SUPERADMIN":
            LojasApiClient.publicar_aviso_regional({
                "titulo": novo_aviso.titulo,
                "conteudo": novo_aviso.conteudo,
                "data_expiracao": novo_aviso.data_validade.isoformat() if novo_aviso.data_validade else None,
                "nivel_prioridade": "URGENTE" if nivel in ("ALTO", "CRITICO") else "NORMAL",
                "autor_nome": f"Conselho Regional ({novo_aviso.autor_nome or 'Mesa Diretora'})",
                "loja_id": int(novo_aviso.loja_id) if novo_aviso.loja_id and str(novo_aviso.loja_id).isdigit() else None,
            })
    except Exception as err:
        logger.warning(f"Falha ao propagar aviso do conselho para o módulo Lojas: {err}")

    registrar_auditoria(
        db=db,
        regiao_id=regiao_id,
        usuario_id=user.usuario_id,
        usuario_nome=autor_nome,
        usuario_cargo=autor_cargo,
        acao="CRIACAO_AVISO",
        entidade="AvisoRegional",
        entidade_id=novo_aviso.id,
        detalhes={"titulo": novo_aviso.titulo, "nivel": novo_aviso.nivel, "tipo": novo_aviso.tipo},
    )

    return {"status": "success", "aviso_id": novo_aviso.id, "message": "Aviso publicado com sucesso."}



@router.put("/{regiao_id}/avisos/{aviso_id}", summary="Edita um aviso no conselho")
def atualizar_aviso_regional(
    regiao_id: str,
    aviso_id: str,
    payload: AvisoUpdatePayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """Edita um aviso existente respeitando posse e hierarquia."""
    aviso = db.query(AvisoRegional).filter(
        AvisoRegional.id == aviso_id, AvisoRegional.regiao_id == regiao_id
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado.")

    pode_editar = (
        user.role.upper() == "SUPERADMIN"
        or user.is_diretoria
        or (user.loja_id and str(user.loja_id) == str(aviso.loja_id))
        or (user.usuario_id and user.usuario_id == aviso.autor_id)
    )
    if not pode_editar:
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode editar avisos criados por sua própria Loja.")

    if payload.conteudo is not None:
        palavras = [w for w in payload.conteudo.strip().split() if w]
        if len(palavras) > 200:
            raise HTTPException(
                status_code=400,
                detail=f"O conteúdo excede o limite máximo permitido de 200 palavras (contém {len(palavras)} palavras).",
            )
        aviso.conteudo = payload.conteudo.strip()

    if payload.titulo is not None:
        aviso.titulo = payload.titulo.strip()
    if payload.nivel is not None:
        aviso.nivel = payload.nivel.upper()
    if payload.tipo is not None:
        aviso.tipo = payload.tipo.upper()
    if payload.data_validade is not None:
        aviso.data_validade = payload.data_validade
    if payload.fixado is not None and (user.is_diretoria or user.role.upper() == "SUPERADMIN"):
        aviso.fixado = payload.fixado

    aviso.fixado = _fixado_efetivo(aviso.nivel, aviso.fixado)
    db.commit()
    db.refresh(aviso)
    return {"status": "success", "message": "Aviso atualizado com sucesso."}


@router.delete("/{regiao_id}/avisos/{aviso_id}", summary="Arquiva ou remove definitivamente um aviso do conselho")
def excluir_aviso_regional(
    regiao_id: str,
    aviso_id: str,
    hard_delete: bool = False,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """Arquiva (soft-delete) ou deleta fisicamente o aviso."""
    aviso = db.query(AvisoRegional).filter(
        AvisoRegional.id == aviso_id, AvisoRegional.regiao_id == regiao_id
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado.")

    pode_excluir = (
        user.role.upper() == "SUPERADMIN"
        or user.is_diretoria
        or (user.loja_id and str(user.loja_id) == str(aviso.loja_id))
        or (user.usuario_id and user.usuario_id == aviso.autor_id)
    )
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode arquivar avisos criados por sua própria Loja.")

    rotulo_tipo = "Notificação" if aviso.tipo == "NOTIFICACAO" else "Aviso"
    sufixo_genero = "a" if aviso.tipo == "NOTIFICACAO" else "o"

    if hard_delete:
        if user.role.upper() != "SUPERADMIN":
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin possui permissão para deletar fisicamente um registro.")
        db.delete(aviso)
        db.commit()
        return {"status": "success", "tipo_delecao": "FISICA", "message": f"{rotulo_tipo} deletad{sufixo_genero} definitivamente."}
    else:
        aviso.arquivado = True
        aviso.arquivado_em = datetime.utcnow()
        aviso.arquivado_por = _obter_nome_completo(user.usuario_id)
        db.commit()
        return {"status": "success", "tipo_delecao": "VISUAL", "message": f"{rotulo_tipo} arquivad{sufixo_genero} com sucesso."}


@router.put("/{regiao_id}/avisos/{aviso_id}/reativar", summary="Reativa (desarquiva) um aviso ou notificação")
def reativar_aviso_regional(
    regiao_id: str,
    aviso_id: str,
    diretor: RegionalUserContext = Depends(get_current_director),
    db: Session = Depends(get_db_core),
):
    """Reativa aviso previamente arquivado."""
    aviso = db.query(AvisoRegional).filter(
        AvisoRegional.id == aviso_id, AvisoRegional.regiao_id == regiao_id
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado.")

    rotulo_tipo = "Notificação" if aviso.tipo == "NOTIFICACAO" else "Aviso"
    sufixo_genero = "a" if aviso.tipo == "NOTIFICACAO" else "o"

    aviso.arquivado = False
    aviso.arquivado_em = None
    aviso.arquivado_por = None
    db.commit()

    logger.info(f"{rotulo_tipo} {aviso_id} reativad{sufixo_genero} por {diretor.usuario_id} na Região {regiao_id}")
    return {"status": "success", "message": f"{rotulo_tipo} reativad{sufixo_genero} com sucesso."}


# ==============================================================================
# SCHEMAS - AGENDA REGIONAL
# ==============================================================================
TIPOS_EVENTO_AGENDA = {
    "REUNIAO_ADMINISTRATIVA": {"rotulo": "Reunião Administrativa", "ambito": "CONSELHO", "quem_lanca": "Mesa Diretora"},
    "ENCONTRO_REGIONAL":      {"rotulo": "Encontro Regional",      "ambito": "CONSELHO", "quem_lanca": "Mesa Diretora"},
    "CONFERENCIA":            {"rotulo": "Conferência",            "ambito": "CONSELHO", "quem_lanca": "Mesa Diretora"},
    "SESSAO_MAGNA":           {"rotulo": "Sessão Magna",           "ambito": "LOJA",      "quem_lanca": "Diretoria da Loja"},
    "SESSAO_PUBLICA":         {"rotulo": "Sessão Pública",         "ambito": "LOJA",      "quem_lanca": "Diretoria da Loja"},
    "AGAPE_RITUALISTICO":     {"rotulo": "Ágape Ritualístico",     "ambito": "LOJA",      "quem_lanca": "Diretoria da Loja"},
    "EVENTO_BENEFICENTE":     {"rotulo": "Evento Beneficente",     "ambito": "AMBOS",     "quem_lanca": "Mesa Diretora / Diretoria da Loja"},
    "EVENTO_ARRECADACAO":     {"rotulo": "Evento de Arrecadação",  "ambito": "AMBOS",     "quem_lanca": "Mesa Diretora / Diretoria da Loja"},
    "HOMENAGEM_EXTERNA":      {"rotulo": "Homenagem Externa",      "ambito": "AMBOS",     "quem_lanca": "Mesa Diretora / Diretoria da Loja"},
}
TIPOS_EVENTO_AGENDA_VALIDOS = list(TIPOS_EVENTO_AGENDA.keys())
SUBTIPOS_SESSAO_MAGNA_VALIDOS = ["INICIACAO", "ELEVACAO", "EXALTACAO", "POSSE", "INSTALACAO", "COMEMORATIVA"]
STATUS_EVENTO_AGENDA_VALIDOS = ["AGENDADO", "REALIZADO", "CANCELADO"]


class EventoAgendaCreatePayload(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    tipo: str = "OUTRO"
    subtipo: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    previa_admissao_id: Optional[str] = None
    gerar_aviso: bool = False


class EventoAgendaUpdatePayload(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    subtipo: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    status: Optional[str] = None


# ==============================================================================
# ROTAS - AGENDA REGIONAL
# ==============================================================================
@router.get("/{regiao_id}/agenda/tipos-evento", summary="Lista o catálogo fechado de tipos de evento da Agenda")
def listar_tipos_evento_agenda(
    regiao_id: str,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
):
    """Devolve tipos de eventos e seus âmbitos."""
    return [
        {
            "tipo": tipo,
            "rotulo": info["rotulo"],
            "ambito": info["ambito"],
            "quem_lanca": info["quem_lanca"],
            "subtipos_validos": SUBTIPOS_SESSAO_MAGNA_VALIDOS if tipo == "SESSAO_MAGNA" else None,
        }
        for tipo, info in TIPOS_EVENTO_AGENDA.items()
    ]


@router.get("/{regiao_id}/agenda/eventos", summary="Lista os eventos da agenda do conselho")
def listar_eventos_agenda(
    regiao_id: str,
    tipo: Optional[str] = None,
    loja_id: Optional[str] = None,
    status: Optional[str] = None,
    data_de: Optional[date] = None,
    data_ate: Optional[date] = None,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """Lista eventos do conselho agregados com eventos do Lojas (via API-First)."""
    query = db.query(EventoAgenda).filter(EventoAgenda.regiao_id == regiao_id)

    if tipo and tipo.upper() != "TODOS":
        query = query.filter(EventoAgenda.tipo == tipo.upper())
    if status and status.upper() != "TODOS":
        query = query.filter(EventoAgenda.status == status.upper())
    if loja_id:
        query = query.filter(EventoAgenda.loja_organizadora_id == str(loja_id))
    if data_de:
        query = query.filter(EventoAgenda.data_inicio >= datetime.combine(data_de, datetime.min.time()))
    if data_ate:
        query = query.filter(EventoAgenda.data_inicio <= datetime.combine(data_ate, datetime.max.time()))

    eventos = query.order_by(EventoAgenda.data_inicio.asc()).all()

    resultado = [
        {
            "id": e.id,
            "regiao_id": e.regiao_id,
            "titulo": e.titulo,
            "descricao": e.descricao,
            "tipo": e.tipo,
            "subtipo": e.subtipo,
            "data_inicio": e.data_inicio.isoformat(),
            "data_fim": e.data_fim.isoformat() if e.data_fim else None,
            "loja_organizadora_id": e.loja_organizadora_id,
            "loja_organizadora_nome": e.loja_organizadora_nome,
            "loja_organizadora_numero": e.loja_organizadora_numero,
            "criado_por_id": e.criado_por_id,
            "criado_por_nome": e.criado_por_nome,
            "criado_por_tipo": e.criado_por_tipo,
            "previa_admissao_id": e.previa_admissao_id,
            "aviso_gerado_id": e.aviso_gerado_id,
            "status": e.status,
            "criado_em": e.criado_em.isoformat() if e.criado_em else None,
            "origem": "COREVM",
            "pode_editar": (
                user.role.upper() == "SUPERADMIN"
                or user.is_diretoria
                or (user.loja_id and str(user.loja_id) == str(e.loja_organizadora_id))
                or (user.usuario_id and user.usuario_id == e.criado_por_id)
            ),
        }
        for e in eventos
    ]

    # Agregação API-First: Sessões e Eventos regionais das lojas parceiras
    try:
        lojas_regionais = db.query(LojaAgregada).filter(LojaAgregada.regiao_id == regiao_id).all()
        lojas_ids_num = [int(l.loja_id) for l in lojas_regionais if l.loja_id and str(l.loja_id).isdigit()]
        if loja_id and str(loja_id).isdigit():
            lojas_ids_num = [int(loja_id)]

        if lojas_ids_num:
            data_ini_str = data_de.isoformat() if data_de else None
            eventos_lojas = LojasApiClient.listar_eventos_regionais(lojas_ids=lojas_ids_num, a_partir_de=data_ini_str)
            for el in eventos_lojas:
                resultado.append({
                    "id": f"loja_evt_{el.get('id')}",
                    "regiao_id": regiao_id,
                    "titulo": el.get("titulo"),
                    "descricao": f"Sessão {el.get('tipo', '')} ({el.get('subtipo') or 'Ordinária'}) da Loja {el.get('loja_nome', '')}",
                    "tipo": "SESSAO_MAGNA" if el.get("tipo") == "Magna" else "OUTRO",
                    "subtipo": el.get("subtipo"),
                    "data_inicio": f"{el.get('data_sessao')}T{el.get('hora_inicio') or '20:00:00'}",
                    "data_fim": f"{el.get('data_sessao')}T{el.get('hora_fim') or '22:00:00'}",
                    "loja_organizadora_id": str(el.get("loja_id")),
                    "loja_organizadora_nome": el.get("loja_nome"),
                    "loja_organizadora_numero": el.get("loja_numero"),
                    "criado_por_id": None,
                    "criado_por_nome": "Secretaria (Lojas)",
                    "criado_por_tipo": "SISTEMA",
                    "previa_admissao_id": None,
                    "aviso_gerado_id": None,
                    "status": "AGENDADO",
                    "criado_em": None,
                    "origem": "MODULO_LOJAS",
                    "pode_editar": (
                        user.role.upper() == "SUPERADMIN"
                        or user.is_diretoria
                        or (user.loja_id and str(user.loja_id) == str(el.get("loja_id")))
                    ),
                })
    except Exception as err:
        logger.warning(f"Não foi possível agregar eventos regionais do Lojas: {err}")

    return resultado


@router.post("/{regiao_id}/agenda/eventos", summary="Cria novo evento na agenda do conselho")
def criar_evento_agenda(
    regiao_id: str,
    payload: EventoAgendaCreatePayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """Cria um novo evento na agenda regional com dados de autor e loja via API-First."""
    tipo = (payload.tipo or "OUTRO").upper()
    if tipo not in TIPOS_EVENTO_AGENDA:
        raise HTTPException(status_code=400, detail=f"Tipo de evento inválido. Use um de: {', '.join(TIPOS_EVENTO_AGENDA_VALIDOS)}.")
    ambito = TIPOS_EVENTO_AGENDA[tipo]["ambito"]

    is_diretoria = user.is_diretoria or user.role.upper() == "SUPERADMIN"
    is_operador = isinstance(user, OperadorAdministrativoContext)
    tem_loja_propria = bool(user.loja_id)

    if ambito == "CONSELHO" and not is_diretoria:
        raise HTTPException(status_code=403, detail="Este tipo de evento é exclusivo da Mesa Diretora/SuperAdmin.")
    if ambito == "LOJA" and not tem_loja_propria:
        raise HTTPException(status_code=403, detail="Este tipo de evento exige vínculo com uma Loja.")
    if ambito == "AMBOS" and not (is_diretoria or tem_loja_propria):
        raise HTTPException(status_code=403, detail="Você precisa ser Mesa Diretora ou ter vínculo com Loja.")

    subtipo = (payload.subtipo or "").strip().upper() or None
    if tipo == "SESSAO_MAGNA":
        if not subtipo:
            raise HTTPException(status_code=400, detail=f"Sessão Magna exige subtipo. Use um de: {', '.join(SUBTIPOS_SESSAO_MAGNA_VALIDOS)}.")
        if subtipo not in SUBTIPOS_SESSAO_MAGNA_VALIDOS:
            raise HTTPException(status_code=400, detail=f"Subtipo inválido para Sessão Magna. Use um de: {', '.join(SUBTIPOS_SESSAO_MAGNA_VALIDOS)}.")

    if payload.previa_admissao_id:
        previa = db.query(PreviaAdmissao).filter(
            PreviaAdmissao.id == payload.previa_admissao_id,
            PreviaAdmissao.regiao_id == regiao_id,
        ).first()
        if not previa:
            raise HTTPException(status_code=404, detail="Prévia de admissão referenciada não foi encontrada nesta região.")
        if is_operador and str(previa.loja_id) != str(user.loja_id):
            raise HTTPException(status_code=403, detail="Você só pode vincular o evento a uma prévia de admissão da própria Loja.")

    loja_organizadora_id = None
    loja_organizadora_nome = None
    loja_organizadora_numero = None
    if ambito != "CONSELHO" and user.loja_id:
        loja_organizadora_id = str(user.loja_id)
        if str(user.loja_id).isdigit():
            try:
                lojas_api = LojasApiClient.buscar_lojas_multiplas([int(user.loja_id)])
                if lojas_api:
                    loja_organizadora_nome = lojas_api[0].get("nome_loja")
                    loja_organizadora_numero = lojas_api[0].get("numero_loja")
            except Exception as e:
                logger.warning(f"Não foi possível obter dados da loja organizadora via API: {e}")

    nome_autor = _obter_nome_completo(user.usuario_id)
    if is_operador:
        criado_por_tipo = f"OPERADOR_ADMINISTRATIVO_{user.slot}"
        criado_por_nome = f"Operador Administrativo ({user.slot.capitalize()}) — {nome_autor}"
    elif is_diretoria:
        criado_por_tipo = "DIRETORIA"
        criado_por_nome = f"Mesa Diretora ({user.role})"
    else:
        criado_por_tipo = "LOJA"
        criado_por_nome = nome_autor

    novo_evento = EventoAgenda(
        regiao_id=regiao_id,
        titulo=payload.titulo.strip(),
        descricao=payload.descricao.strip() if payload.descricao else None,
        tipo=tipo,
        subtipo=subtipo,
        data_inicio=payload.data_inicio,
        data_fim=payload.data_fim,
        loja_organizadora_id=loja_organizadora_id,
        loja_organizadora_nome=loja_organizadora_nome,
        loja_organizadora_numero=loja_organizadora_numero,
        criado_por_id=user.usuario_id,
        criado_por_nome=criado_por_nome,
        criado_por_tipo=criado_por_tipo,
        previa_admissao_id=payload.previa_admissao_id,
        status="AGENDADO",
    )
    db.add(novo_evento)
    db.commit()
    db.refresh(novo_evento)

    aviso_gerado_id = None
    if payload.gerar_aviso:
        quando = novo_evento.data_inicio.strftime("%d/%m/%Y às %H:%M")
        local = f" — {loja_organizadora_nome}" if loja_organizadora_nome else ""
        novo_aviso = AvisoRegional(
            regiao_id=regiao_id,
            titulo=f"Lembrete: {novo_evento.titulo}",
            conteudo=f"Evento agendado para {quando}{local}." + (f"\n\n{novo_evento.descricao}" if novo_evento.descricao else ""),
            nivel="MEDIO",
            tipo="NOTIFICACAO",
            autor_id=user.usuario_id,
            autor_nome=criado_por_nome,
            autor_cargo=criado_por_tipo,
            loja_id=loja_organizadora_id,
            fixado=False,
            data_publicacao=date.today(),
            arquivado=False,
        )
        db.add(novo_aviso)
        db.commit()
        db.refresh(novo_aviso)
        aviso_gerado_id = novo_aviso.id
        novo_evento.aviso_gerado_id = aviso_gerado_id
        db.commit()

    registrar_auditoria(
        db=db,
        regiao_id=regiao_id,
        usuario_id=user.usuario_id,
        usuario_nome=criado_por_nome,
        usuario_cargo=criado_por_tipo,
        acao="CRIACAO_EVENTO_AGENDA",
        entidade="EventoAgenda",
        entidade_id=novo_evento.id,
        detalhes={"titulo": novo_evento.titulo, "tipo": novo_evento.tipo, "data_inicio": novo_evento.data_inicio.isoformat()},
    )

    return {
        "status": "success",
        "evento_id": novo_evento.id,
        "aviso_gerado_id": aviso_gerado_id,
        "message": "Evento criado com sucesso.",
    }



@router.put("/{regiao_id}/agenda/eventos/{evento_id}", summary="Edita um evento da agenda")
def atualizar_evento_agenda(
    regiao_id: str,
    evento_id: str,
    payload: EventoAgendaUpdatePayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """Edita um evento da agenda respeitando permissão do autor ou diretoria."""
    evento = db.query(EventoAgenda).filter(
        EventoAgenda.id == evento_id, EventoAgenda.regiao_id == regiao_id
    ).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    pode_editar = (
        user.role.upper() == "SUPERADMIN"
        or user.is_diretoria
        or (user.loja_id and str(user.loja_id) == str(evento.loja_organizadora_id))
        or (user.usuario_id and user.usuario_id == evento.criado_por_id)
    )
    if not pode_editar:
        raise HTTPException(status_code=403, detail="Você não tem permissão para editar este evento.")

    if payload.titulo is not None:
        evento.titulo = payload.titulo.strip()
    if payload.descricao is not None:
        evento.descricao = payload.descricao.strip()
    if payload.tipo is not None:
        tipo = payload.tipo.upper()
        if tipo not in TIPOS_EVENTO_AGENDA:
            raise HTTPException(status_code=400, detail="Tipo de evento inválido.")
        evento.tipo = tipo
    if payload.subtipo is not None:
        evento.subtipo = payload.subtipo.strip().upper() or None
    if payload.data_inicio is not None:
        evento.data_inicio = payload.data_inicio
    if payload.data_fim is not None:
        evento.data_fim = payload.data_fim
    if payload.status is not None:
        status = payload.status.upper()
        if status not in STATUS_EVENTO_AGENDA_VALIDOS:
            raise HTTPException(status_code=400, detail="Status de evento inválido.")
        evento.status = status

    db.commit()
    db.refresh(evento)
    return {"status": "success", "message": "Evento atualizado com sucesso."}


@router.delete("/{regiao_id}/agenda/eventos/{evento_id}", summary="Cancela ou remove definitivamente um evento")
def excluir_evento_agenda(
    regiao_id: str,
    evento_id: str,
    hard_delete: bool = False,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    """Cancela (soft-delete) ou remove fisicamente um evento da agenda."""
    evento = db.query(EventoAgenda).filter(
        EventoAgenda.id == evento_id, EventoAgenda.regiao_id == regiao_id
    ).first()
    if not evento:
        raise HTTPException(status_code=404, detail="Evento não encontrado.")

    pode_excluir = (
        user.role.upper() == "SUPERADMIN"
        or user.is_diretoria
        or (user.loja_id and str(user.loja_id) == str(evento.loja_organizadora_id))
        or (user.usuario_id and user.usuario_id == evento.criado_por_id)
    )
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Você não tem permissão para cancelar ou excluir este evento.")

    if hard_delete:
        if user.role.upper() != "SUPERADMIN":
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin pode deletar fisicamente um evento.")
        db.delete(evento)
        db.commit()
        return {"status": "success", "tipo": "FISICA", "message": "Evento deletado definitivamente."}
    else:
        evento.status = "CANCELADO"
        db.commit()
        return {"status": "success", "tipo": "CANCELAMENTO", "message": "Evento cancelado com sucesso."}


# ==============================================================================
# SCHEMAS - CENTRAL DE COMUNICAÇÃO (PRANCHAS)
# ==============================================================================
class TopicoCriarPayload(BaseModel):
    assunto: str
    categoria: str = "ADMINISTRATIVO"
    tipo_alcance: str = "CONSELHO_LOJA"
    loja_origem_id: Optional[str] = None
    loja_origem_nome: Optional[str] = None
    loja_origem_numero: Optional[str] = None
    loja_destino_id: Optional[str] = None
    loja_destino_nome: Optional[str] = None
    loja_destino_numero: Optional[str] = None
    prioridade: str = "NORMAL"
    mensagem_inicial: str
    arquivo_url: Optional[str] = None
    arquivo_nome: Optional[str] = None


class MensagemCriarPayload(BaseModel):
    conteudo: str
    arquivo_url: Optional[str] = None
    arquivo_nome: Optional[str] = None


class TopicoStatusPayload(BaseModel):
    status: str


# ==============================================================================
# ROTAS - CENTRAL DE COMUNICAÇÃO (PRANCHAS)
# ==============================================================================
@router.get("/{regiao_id}/comunicacao/estatisticas", summary="Estatísticas da Central de Comunicação Interna")
def obter_estatisticas_comunicacao(
    regiao_id: str,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core),
):
    """Retorna totalizadores e contadores de mensagens não lidas por perfil."""
    query = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False,
    )

    is_diretoria = user.is_diretoria or user.role.upper() == "SUPERADMIN"
    user_loja = user.loja_id

    if not is_diretoria:
        query = query.filter(
            (TopicoComunicacao.tipo_alcance == "CIRCULAR")
            | (TopicoComunicacao.loja_origem_id == user_loja)
            | (TopicoComunicacao.loja_destino_id == user_loja)
        )

    topicos = query.all()
    topico_ids = [t.id for t in topicos]

    total_topicos = len(topicos)
    topicos_abertos = sum(1 for t in topicos if t.status in ["ABERTA", "RESPONDIDA"])
    topicos_concluidos = sum(1 for t in topicos if t.status == "CONCLUIDA")
    inter_lojas_total = sum(1 for t in topicos if t.tipo_alcance == "LOJA_LOJA")
    circulares_total = sum(1 for t in topicos if t.tipo_alcance == "CIRCULAR")
    conselho_loja_total = sum(1 for t in topicos if t.tipo_alcance == "CONSELHO_LOJA")

    mensagens_nao_lidas = 0
    if topico_ids:
        msg_query = db_core.query(MensagemComunicacao).filter(
            MensagemComunicacao.topico_id.in_(topico_ids),
            MensagemComunicacao.lida == False,
            MensagemComunicacao.deletado_visualmente == False,
            MensagemComunicacao.remetente_id != user.usuario_id,
        )
        mensagens_nao_lidas = msg_query.count()

    return {
        "total_topicos": total_topicos,
        "topicos_abertos": topicos_abertos,
        "topicos_concluidos": topicos_concluidos,
        "inter_lojas_total": inter_lojas_total,
        "circulares_total": circulares_total,
        "conselho_loja_total": conselho_loja_total,
        "mensagens_nao_lidas": mensagens_nao_lidas,
    }


@router.get("/{regiao_id}/comunicacao/topicos", summary="Lista tópicos de correspondência oficial com filtros e sigilo")
def listar_topicos_comunicacao(
    regiao_id: str,
    categoria: Optional[str] = None,
    status: Optional[str] = None,
    tipo_alcance: Optional[str] = None,
    busca: Optional[str] = None,
    loja_id: Optional[str] = None,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core),
):
    """Lista os tópicos de comunicação respeitando o sigilo e isolamento entre lojas."""
    query = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False,
    )

    is_diretoria = user.is_diretoria or user.role.upper() == "SUPERADMIN"
    user_loja = user.loja_id

    if not is_diretoria:
        query = query.filter(
            (TopicoComunicacao.tipo_alcance == "CIRCULAR")
            | (TopicoComunicacao.loja_origem_id == user_loja)
            | (TopicoComunicacao.loja_destino_id == user_loja)
        )

    if categoria and categoria.upper() != "TODAS":
        query = query.filter(TopicoComunicacao.categoria == categoria.upper())
    if status and status.upper() != "TODOS":
        query = query.filter(TopicoComunicacao.status == status.upper())
    if tipo_alcance and tipo_alcance.upper() != "TODOS":
        query = query.filter(TopicoComunicacao.tipo_alcance == tipo_alcance.upper())
    if loja_id:
        query = query.filter(
            (TopicoComunicacao.loja_origem_id == loja_id)
            | (TopicoComunicacao.loja_destino_id == loja_id)
        )
    if busca:
        termo = f"%{busca.strip()}%"
        query = query.filter(
            (TopicoComunicacao.assunto.ilike(termo))
            | (TopicoComunicacao.loja_origem_nome.ilike(termo))
            | (TopicoComunicacao.loja_destino_nome.ilike(termo))
            | (TopicoComunicacao.criado_por_nome.ilike(termo))
        )

    topicos = query.order_by(TopicoComunicacao.data_ultima_mensagem.desc()).all()

    resultado = []
    for t in topicos:
        total_msgs = len(t.mensagens)
        ultima_msg = t.mensagens[-1] if total_msgs > 0 else None
        nao_lidas = sum(
            1 for m in t.mensagens if not m.lida and m.remetente_id != user.usuario_id
        )

        resultado.append({
            "id": t.id,
            "regiao_id": t.regiao_id,
            "assunto": t.assunto,
            "categoria": t.categoria,
            "tipo_alcance": t.tipo_alcance,
            "loja_origem_id": t.loja_origem_id,
            "loja_origem_nome": t.loja_origem_nome,
            "loja_origem_numero": t.loja_origem_numero,
            "loja_destino_id": t.loja_destino_id,
            "loja_destino_nome": t.loja_destino_nome,
            "loja_destino_numero": t.loja_destino_numero,
            "prioridade": t.prioridade,
            "status": t.status,
            "criado_por_id": t.criado_por_id,
            "criado_por_nome": t.criado_por_nome,
            "criado_por_tipo": t.criado_por_tipo,
            "data_criacao": t.data_criacao.strftime("%d/%m/%Y %H:%M") if t.data_criacao else "",
            "data_ultima_mensagem": t.data_ultima_mensagem.strftime("%d/%m/%Y %H:%M") if t.data_ultima_mensagem else "",
            "total_mensagens": total_msgs,
            "mensagens_nao_lidas": nao_lidas,
            "ultima_mensagem_preview": ultima_msg.conteudo[:120] if ultima_msg else "",
            "ultimo_remetente_nome": ultima_msg.remetente_nome if ultima_msg else "",
            "ultimo_remetente_tipo": ultima_msg.tipo_remetente if ultima_msg else "",
        })

    return resultado


@router.post("/{regiao_id}/comunicacao/topicos", summary="Cria novo tópico de comunicação ou prancha oficial")
def criar_topico_comunicacao(
    regiao_id: str,
    payload: TopicoCriarPayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core),
):
    """Abre um novo tópico/prancha oficial com resolução API-First de nomes."""
    is_diretoria = user.is_diretoria or user.role.upper() == "SUPERADMIN"
    tipo = payload.tipo_alcance.upper()
    is_operador = isinstance(user, OperadorAdministrativoContext)

    if tipo == "CIRCULAR" and not is_diretoria:
        raise HTTPException(status_code=403, detail="Apenas a Diretoria do Conselho pode emitir Pranchas Circulares Gerais.")
    if tipo == "LOJA_LOJA" and not payload.loja_destino_id:
        raise HTTPException(status_code=400, detail="Para canal restrito Inter-Lojas é obrigatório indicar a Loja de Destino.")

    if is_operador:
        payload.loja_origem_id = str(user.loja_id)
        payload.loja_origem_nome = None
        payload.loja_origem_numero = None

    autor_nome = _obter_nome_completo(user.usuario_id)
    autor_cargo = user.role

    origem_id = payload.loja_origem_id or user.loja_id
    origem_nome = payload.loja_origem_nome
    origem_num = payload.loja_origem_numero

    if origem_id and (not origem_nome or not origem_num):
        if str(origem_id).isdigit():
            lojas_api = LojasApiClient.buscar_lojas_multiplas([int(origem_id)])
            if lojas_api:
                origem_nome = lojas_api[0].get("nome_loja")
                origem_num = lojas_api[0].get("numero_loja")

    destino_id = payload.loja_destino_id
    destino_nome = payload.loja_destino_nome
    destino_num = payload.loja_destino_numero

    if destino_id and (not destino_nome or not destino_num):
        if str(destino_id).isdigit():
            lojas_api = LojasApiClient.buscar_lojas_multiplas([int(destino_id)])
            if lojas_api:
                destino_nome = lojas_api[0].get("nome_loja")
                destino_num = lojas_api[0].get("numero_loja")

    novo_topico = TopicoComunicacao(
        regiao_id=regiao_id,
        assunto=payload.assunto.strip(),
        categoria=payload.categoria.upper(),
        tipo_alcance=tipo,
        loja_origem_id=origem_id,
        loja_origem_nome=origem_nome,
        loja_origem_numero=origem_num,
        loja_destino_id=destino_id,
        loja_destino_nome=destino_nome,
        loja_destino_numero=destino_num,
        prioridade=payload.prioridade.upper(),
        status="ABERTA",
        criado_por_id=user.usuario_id,
        criado_por_nome=autor_nome,
        criado_por_tipo="DIRETORIA" if is_diretoria else "LOJA",
        data_criacao=datetime.utcnow(),
        data_ultima_mensagem=datetime.utcnow(),
    )

    db_core.add(novo_topico)
    db_core.commit()
    db_core.refresh(novo_topico)

    msg_inicial = MensagemComunicacao(
        topico_id=novo_topico.id,
        remetente_id=user.usuario_id,
        remetente_nome=autor_nome,
        remetente_cargo=autor_cargo,
        tipo_remetente="DIRETORIA" if is_diretoria else "LOJA",
        loja_remetente_id=user.loja_id,
        conteudo=payload.mensagem_inicial.strip(),
        data_envio=datetime.utcnow(),
        arquivo_url=payload.arquivo_url,
        arquivo_nome=payload.arquivo_nome,
        lida=True,
        data_leitura=datetime.utcnow(),
        lida_por_nome=autor_nome,
    )

    db_core.add(msg_inicial)
    db_core.commit()

    return {
        "status": "success",
        "topico_id": novo_topico.id,
        "assunto": novo_topico.assunto,
        "tipo_alcance": novo_topico.tipo_alcance,
        "message": "Tópico de comunicação aberto e prancha inicial protocolada com sucesso.",
    }


@router.get("/{regiao_id}/comunicacao/topicos/{topico_id}", summary="Obtém detalhes do tópico com mensagens e marca leitura")
def obter_topico_comunicacao(
    regiao_id: str,
    topico_id: str,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core),
):
    """Retorna o histórico cronológico de mensagens e marca automaticamente como lidas."""
    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False,
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico de comunicação não encontrado.")

    is_diretoria = user.is_diretoria or user.role.upper() == "SUPERADMIN"
    user_loja = user.loja_id

    if not is_diretoria:
        pode_acessar = (
            topico.tipo_alcance == "CIRCULAR"
            or topico.loja_origem_id == user_loja
            or topico.loja_destino_id == user_loja
        )
        if not pode_acessar:
            raise HTTPException(status_code=403, detail="Acesso restrito: Você não tem permissão para acessar esta correspondência privada.")

    leitor_nome = _obter_nome_completo(user.usuario_id)
    if is_diretoria:
        leitor_nome = f"{user.role} Regional ({leitor_nome})"
    elif user_loja:
        leitor_nome = f"Oficial da Loja {user_loja} ({leitor_nome})"

    agora = datetime.utcnow()
    houve_leitura = False
    for m in topico.mensagens:
        if not m.lida and m.remetente_id != user.usuario_id:
            m.lida = True
            m.data_leitura = agora
            m.lida_por_nome = leitor_nome
            houve_leitura = True

    if houve_leitura:
        db_core.commit()

    mensagens_formatadas = []
    for m in topico.mensagens:
        if m.deletado_visualmente:
            continue
        mensagens_formatadas.append({
            "id": m.id,
            "remetente_id": m.remetente_id,
            "remetente_nome": m.remetente_nome,
            "remetente_cargo": m.remetente_cargo,
            "tipo_remetente": m.tipo_remetente,
            "loja_remetente_id": m.loja_remetente_id,
            "conteudo": m.conteudo,
            "data_envio": m.data_envio.strftime("%d/%m/%Y %H:%M"),
            "arquivo_url": m.arquivo_url,
            "arquivo_nome": m.arquivo_nome,
            "lida": m.lida,
            "data_leitura": m.data_leitura.strftime("%d/%m/%Y %H:%M") if m.data_leitura else None,
            "lida_por_nome": m.lida_por_nome,
            "sou_autor": m.remetente_id == user.usuario_id,
        })

    return {
        "id": topico.id,
        "assunto": topico.assunto,
        "categoria": topico.categoria,
        "tipo_alcance": topico.tipo_alcance,
        "loja_origem_id": topico.loja_origem_id,
        "loja_origem_nome": topico.loja_origem_nome,
        "loja_origem_numero": topico.loja_origem_numero,
        "loja_destino_id": topico.loja_destino_id,
        "loja_destino_nome": topico.loja_destino_nome,
        "loja_destino_numero": topico.loja_destino_numero,
        "prioridade": topico.prioridade,
        "status": topico.status,
        "criado_por_id": topico.criado_por_id,
        "criado_por_nome": topico.criado_por_nome,
        "criado_por_tipo": topico.criado_por_tipo,
        "data_criacao": topico.data_criacao.strftime("%d/%m/%Y %H:%M"),
        "mensagens": mensagens_formatadas,
    }


@router.post("/{regiao_id}/comunicacao/topicos/{topico_id}/mensagens", summary="Envia nova resposta ou prancha no tópico")
def enviar_mensagem_comunicacao(
    regiao_id: str,
    topico_id: str,
    payload: MensagemCriarPayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core),
):
    """Envia uma nova réplica oficial dentro do canal."""
    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False,
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")

    is_diretoria = user.is_diretoria or user.role.upper() == "SUPERADMIN"
    user_loja = user.loja_id

    if not is_diretoria:
        pode_enviar = (
            topico.tipo_alcance == "CIRCULAR"
            or topico.loja_origem_id == user_loja
            or topico.loja_destino_id == user_loja
        )
        if not pode_enviar:
            raise HTTPException(status_code=403, detail="Sem permissão para responder neste canal restrito.")

    autor_nome = _obter_nome_completo(user.usuario_id)
    autor_cargo = user.role

    nova_msg = MensagemComunicacao(
        topico_id=topico.id,
        remetente_id=user.usuario_id,
        remetente_nome=autor_nome,
        remetente_cargo=autor_cargo,
        tipo_remetente="DIRETORIA" if is_diretoria else "LOJA",
        loja_remetente_id=user.loja_id,
        conteudo=payload.conteudo.strip(),
        data_envio=datetime.utcnow(),
        arquivo_url=payload.arquivo_url,
        arquivo_nome=payload.arquivo_nome,
        lida=False,
    )

    topico.data_ultima_mensagem = datetime.utcnow()
    if topico.status == "ABERTA":
        topico.status = "RESPONDIDA"

    db_core.add(nova_msg)
    db_core.commit()
    db_core.refresh(nova_msg)

    return {
        "status": "success",
        "mensagem_id": nova_msg.id,
        "data_envio": nova_msg.data_envio.strftime("%d/%m/%Y %H:%M"),
        "message": "Prancha enviada com sucesso.",
    }


@router.post("/{regiao_id}/comunicacao/topicos/{topico_id}/upload", summary="Envia resposta com upload físico de anexo")
def upload_anexo_comunicacao(
    regiao_id: str,
    topico_id: str,
    conteudo: str = Form(...),
    arquivo: UploadFile = File(...),
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core),
):
    """Envia resposta com arquivo físico anexado."""
    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id,
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")

    is_diretoria = user.is_diretoria or user.role.upper() == "SUPERADMIN"
    user_loja = user.loja_id

    if not is_diretoria:
        pode_enviar = (
            topico.tipo_alcance == "CIRCULAR"
            or topico.loja_origem_id == user_loja
            or topico.loja_destino_id == user_loja
        )
        if not pode_enviar:
            raise HTTPException(status_code=403, detail="Sem permissão para responder neste canal.")

    diretorio_destino = os.path.join("uploads", "comunicacao", regiao_id, topico_id)
    os.makedirs(diretorio_destino, exist_ok=True)

    ext = os.path.splitext(arquivo.filename)[1] if arquivo.filename else ".pdf"
    msg_id = str(uuid.uuid4())
    caminho_final = os.path.join(diretorio_destino, f"{msg_id}{ext}")

    with open(caminho_final, "wb") as buffer:
        shutil.copyfileobj(arquivo.file, buffer)

    autor_nome = _obter_nome_completo(user.usuario_id)
    autor_cargo = user.role

    nova_msg = MensagemComunicacao(
        id=msg_id,
        topico_id=topico.id,
        remetente_id=user.usuario_id,
        remetente_nome=autor_nome,
        remetente_cargo=autor_cargo,
        tipo_remetente="DIRETORIA" if is_diretoria else "LOJA",
        loja_remetente_id=user.loja_id,
        conteudo=conteudo.strip(),
        data_envio=datetime.utcnow(),
        arquivo_url=caminho_final,
        arquivo_nome=arquivo.filename,
        lida=False,
    )

    topico.data_ultima_mensagem = datetime.utcnow()
    db_core.add(nova_msg)
    db_core.commit()

    return {
        "status": "success",
        "mensagem_id": nova_msg.id,
        "arquivo_nome": arquivo.filename,
        "message": "Prancha e anexo protocolados com sucesso.",
    }


@router.put("/{regiao_id}/comunicacao/topicos/{topico_id}/status", summary="Altera status do chamado/prancha")
def atualizar_status_topico(
    regiao_id: str,
    topico_id: str,
    payload: TopicoStatusPayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db_core: Session = Depends(get_db_core),
):
    """Altera status da conversa/prancha."""
    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id,
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")

    if isinstance(user, OperadorAdministrativoContext) and str(user.loja_id) not in (
        str(topico.loja_origem_id),
        str(topico.loja_destino_id),
    ):
        raise HTTPException(status_code=403, detail="Permissão negada para alterar status deste tópico.")

    novo_status = payload.status.upper()
    if novo_status not in ["ABERTA", "RESPONDIDA", "CONCLUIDA", "ARQUIVADA"]:
        raise HTTPException(status_code=400, detail="Status inválido.")

    topico.status = novo_status
    db_core.commit()

    return {"status": "success", "novo_status": topico.status, "message": f"Status atualizado para {topico.status}."}


@router.get("/{regiao_id}/comunicacao/mensagens/{mensagem_id}/pdf", summary="Exporta certidão oficial da prancha em PDF")
def exportar_prancha_pdf(
    regiao_id: str,
    mensagem_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
):
    """Gera certidão oficial da prancha em PDF."""
    msg = db_core.query(MensagemComunicacao).filter(
        MensagemComunicacao.id == mensagem_id,
        MensagemComunicacao.deletado_visualmente == False,
    ).first()

    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    topico = msg.topico
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    origem = conselho_nome if msg.tipo_remetente == "DIRETORIA" else (topico.loja_origem_nome or f"Loja {msg.loja_remetente_id}")
    destinatario = "Todas as Lojas Federadas" if topico.tipo_alcance == "CIRCULAR" else (topico.loja_destino_nome or "Conselho Regional")

    diretorio_relatorios = os.path.join("uploads", "comunicacao", "pdf", regiao_id)
    os.makedirs(diretorio_relatorios, exist_ok=True)
    caminho_pdf = os.path.join(diretorio_relatorios, f"Prancha_{msg.id[:8]}.pdf")

    gerar_pdf_prancha_comunicacao(
        caminho_saida=caminho_pdf,
        topico_assunto=topico.assunto,
        categoria=topico.categoria,
        tipo_alcance=topico.tipo_alcance,
        remetente_nome=msg.remetente_nome,
        remetente_cargo=msg.remetente_cargo or "Oficial",
        origem_entidade=origem,
        destinatario_entidade=destinatario,
        conteudo_mensagem=msg.conteudo,
        data_envio=msg.data_envio,
        prioridade=topico.prioridade,
        conselho_nome=conselho_nome,
    )

    return FileResponse(
        path=caminho_pdf,
        filename=f"Prancha_Oficial_{msg.id[:8]}.pdf",
        media_type="application/pdf",
    )
