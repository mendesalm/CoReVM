# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Módulo de Governança, Dashboard, Identidade Regional e Gestão da Diretoria do Conselho.
Isolado com arquitetura API-First: 100% via LojasApiClient.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from loguru import logger

from database import get_db_core
from models.models import (
    Regiao, DiretoriaConselho, LojaAgregada, SuplenteConselho,
    OperadorAdministrativoLoja, HistoricoLiderancaLoja, RegistroAuditoriaRegional
)
from core.constants import CargoConselho
from schemas.schemas import (
    RegiaoResponse, DiretoriaMembroResponse, DiretoriaUpdatePayload,
    VeneravelElegivelResponse, DiretoriaEmergenciaPayload
)
from core.dependencies import (
    get_current_director, get_current_regional_user, RegionalUserContext,
    obter_identidade_regional_ou_operador_administrativo, OperadorAdministrativoContext
)
from core.auth_esigma import UsuarioEsigma, obter_usuario_esigma
from core.lojas_cliente import LojasApiClient
from core.eventos_tempo_real import gerador_sse_regional
from core.auditoria_service import registrar_auditoria


router = APIRouter()


# ==============================================================================
# DASHBOARD E IDENTIDADE REGIONAL
# ==============================================================================

@router.get("/{regiao_id}/dashboard", response_model=RegiaoResponse, summary="Dashboard do Conselho")
def obter_dashboard_regional(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Retorna os dados do Conselho Regional se o usuário for membro autorizado.
    """
    logger.info(f"Gerando Dashboard Regional {regiao_id} solicitado por {user.usuario_id} (Perfil: {user.role})")
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    if not regiao:
        raise HTTPException(status_code=404, detail="Região não encontrada.")
    return regiao


@router.get("/{regiao_id}/me", summary="Obtém o contexto e permissões do usuário atual no conselho")
def obter_meu_contexto_regional(
    regiao_id: str,
    user = Depends(obter_identidade_regional_ou_operador_administrativo)
):
    """
    Retorna papel e escopo do usuário ativo (Diretoria, VM, Suplente ou Operador Administrativo).
    """
    return {
        "usuario_id": user.usuario_id,
        "role": user.role,
        "is_diretoria": user.is_diretoria,
        "loja_id": user.loja_id,
        "regiao_id": getattr(user, "regiao_id", regiao_id) or regiao_id,
        "is_veneravel": getattr(user, "is_veneravel", False),
        "slot": getattr(user, "slot", None),
        "nome_operador": getattr(user, "nome", None),
    }


@router.get("/minhas-regioes", summary="Lista as Regiões às quais o usuário autenticado tem vínculo")
def listar_minhas_regioes(
    usuario: UsuarioEsigma = Depends(obter_usuario_esigma),
    db_core: Session = Depends(get_db_core)
):
    """
    Descobre a quais Conselhos Regionais o usuário autenticado tem vínculo
    (SuperAdmin, Diretoria, Suplente, Venerável Mestre ou Operador Administrativo).
    Vínculos de VM resolvidos via LojasApiClient (API-First).
    """
    identificador = usuario.identificador_negocio

    if usuario.is_super_admin:
        regioes = db_core.query(Regiao).filter(Regiao.ativa == True).all()
        return [{"regiao_id": r.id, "nome": r.nome, "papel": "SUPERADMIN"} for r in regioes]

    if not identificador:
        return []

    encontradas = {}

    # 1. Diretoria do Conselho
    for diretor in db_core.query(DiretoriaConselho).filter(DiretoriaConselho.usuario_id == identificador).all():
        cargo_nome = diretor.cargo.value.upper() if hasattr(diretor.cargo, "value") else str(diretor.cargo).upper()
        encontradas[diretor.regiao_id] = cargo_nome

    # 2. Suplente de Loja do Conselho
    lojas_suplente = db_core.query(SuplenteConselho.loja_id).filter(SuplenteConselho.usuario_id == identificador).all()
    if lojas_suplente:
        lojas_ids = [l[0] for l in lojas_suplente]
        for agregada in db_core.query(LojaAgregada).filter(LojaAgregada.loja_id.in_(lojas_ids), LojaAgregada.ativa == True).all():
            encontradas.setdefault(agregada.regiao_id, "SUPLENTE")

    # 3. Venerável Mestre (via LojasApiClient)
    try:
        obreiro_info = LojasApiClient.buscar_obreiro_com_mandatos(identificador)
        if obreiro_info and obreiro_info.get("mandatos_ativos"):
            loja_ids_vm = [
                str(m["loja_id"]) for m in obreiro_info["mandatos_ativos"]
                if m.get("cargo_id") == 1
            ]
            if loja_ids_vm:
                for agregada in db_core.query(LojaAgregada).filter(LojaAgregada.loja_id.in_(loja_ids_vm), LojaAgregada.ativa == True).all():
                    encontradas.setdefault(agregada.regiao_id, "VENERAVEL")
    except Exception as e:
        logger.warning(f"Erro ao checar mandato de VM em /minhas-regioes via API: {e}")

    # 4. Operador Administrativo (Secretário/Chanceler)
    operacoes = db_core.query(OperadorAdministrativoLoja.loja_id, OperadorAdministrativoLoja.slot).filter(
        OperadorAdministrativoLoja.usuario_id == identificador,
        OperadorAdministrativoLoja.ativo == True,
    ).all()
    if operacoes:
        lojas_ids_operador = [str(o[0]) for o in operacoes]
        slot_por_loja = {str(o[0]): o[1] for o in operacoes}
        for agregada in db_core.query(LojaAgregada).filter(LojaAgregada.loja_id.in_(lojas_ids_operador), LojaAgregada.ativa == True).all():
            encontradas.setdefault(agregada.regiao_id, slot_por_loja.get(agregada.loja_id, "OPERADOR_ADMINISTRATIVO"))

    if not encontradas:
        return []

    regioes = db_core.query(Regiao).filter(Regiao.id.in_(list(encontradas.keys()))).all()
    return [{"regiao_id": r.id, "nome": r.nome, "papel": encontradas[r.id]} for r in regioes]


# ==============================================================================
# GESTÃO DA MESA DIRETORA REGIONAL
# ==============================================================================

def _obter_veneraveis_elegiveis_core(db_core: Session, regiao_id: str) -> List[dict]:
    """Obtém Veneráveis Mestres em exercício das Lojas ativas via LojasApiClient."""
    agregadas = db_core.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()
    ids_lojas = [int(a.loja_id) for a in agregadas if a.loja_id.isdigit()]
    if not ids_lojas:
        return []

    return LojasApiClient.obter_veneraveis_elegiveis(ids_lojas)


@router.get("/{regiao_id}/veneraveis-elegiveis", response_model=List[VeneravelElegivelResponse], summary="Lista os Veneráveis Mestres elegíveis à Diretoria")
def listar_veneraveis_elegiveis_diretoria(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    return _obter_veneraveis_elegiveis_core(db_core, regiao_id)


@router.get("/{regiao_id}/diretoria", response_model=List[DiretoriaMembroResponse], summary="Obtém Diretoria Enriquecida do Conselho")
def obter_diretoria_regional(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    """
    Retorna a composição da mesa diretora enriquecida com dados cadastrais e
    status de assento órfão ou vínculo desatualizado, via LojasApiClient.
    """
    diretoria = db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).all()
    if not diretoria:
        return []

    user_ids = [d.usuario_id for d in diretoria if d.usuario_id]
    obreiros_map = {}
    if user_ids:
        for uid in user_ids:
            try:
                obr = LojasApiClient.buscar_obreiro_com_mandatos(uid)
                if obr:
                    obreiros_map[uid] = obr
            except Exception as e:
                logger.warning(f"Erro ao buscar obreiro {uid} para diretoria: {e}")

    lojas_info = {}
    lojas_ids_int = [int(d.loja_id) for d in diretoria if d.loja_id and str(d.loja_id).isdigit()]
    if lojas_ids_int:
        try:
            lojas_list = LojasApiClient.buscar_lojas_multiplas(lojas_ids_int)
            for l in lojas_list:
                lojas_info[str(l.get("id"))] = l
        except Exception as e:
            logger.warning(f"Erro ao buscar detalhes de lojas para diretoria: {e}")

    resultado = []
    for d in diretoria:
        o = obreiros_map.get(d.usuario_id)

        vinculo_desatualizado = False
        loja_sem_vm = False
        sugestao = None
        loja_numero = None

        if d.loja_id and str(d.loja_id).isdigit():
            info_loja = lojas_info.get(d.loja_id, {})
            loja_numero = info_loja.get("numero_loja")

            try:
                vm_atual = LojasApiClient.obter_vm_ativo(int(d.loja_id))
                if not vm_atual or not vm_atual.get("tem_vm"):
                    loja_sem_vm = True
                elif vm_atual.get("cim") != d.usuario_id:
                    vinculo_desatualizado = True
                    sugestao = VeneravelElegivelResponse(
                        usuario_id=vm_atual.get("cim") or "",
                        nome_completo=vm_atual.get("nome_completo") or "",
                        loja_id=d.loja_id,
                        loja_nome=info_loja.get("nome_loja"),
                        loja_numero=str(loja_numero) if loja_numero is not None else None,
                    )
            except Exception as e:
                logger.warning(f"Erro ao verificar VM ativo da loja {d.loja_id}: {e}")

        nome_completo = o.get("nome_completo") if o else None
        cim = o.get("cim") if o else (d.usuario_id if d.usuario_id.isdigit() else None)
        email = o.get("email") if o else None
        telefone = o.get("telefone") if o else None

        resultado.append(DiretoriaMembroResponse(
            id=d.id,
            usuario_id=d.usuario_id,
            cargo=d.cargo,
            inicio_mandato=d.inicio_mandato,
            termino_mandato=d.termino_mandato,
            nome_completo=nome_completo,
            cim=cim,
            email=email,
            telefone=telefone,
            loja_id=d.loja_id,
            loja_numero=str(loja_numero) if loja_numero is not None else None,
            vinculo_desatualizado=vinculo_desatualizado,
            loja_sem_vm=loja_sem_vm,
            sugestao_novo_veneravel=sugestao,
        ))
    return resultado


@router.put("/{regiao_id}/diretoria", summary="Atualiza Diretoria e Mandato do Conselho")
def atualizar_diretoria_regional(
    regiao_id: str,
    payload: DiretoriaUpdatePayload,
    diretor: RegionalUserContext = Depends(get_current_director),
    db_core: Session = Depends(get_db_core)
):
    """
    Atualiza a composição da mesa diretora e as datas do mandato.
    Validação contra Veneráveis Mestres elegíveis obtidos via LojasApiClient.
    """
    logger.info(f"Atualizando diretoria da Região {regiao_id} por {diretor.usuario_id}")

    elegiveis = _obter_veneraveis_elegiveis_core(db_core, regiao_id)
    elegiveis_map = {e["usuario_id"]: e for e in elegiveis}

    inicio = payload.inicio_mandato or date.today()
    termino = payload.termino_mandato or (date.today() + timedelta(days=365))

    novos = [
        (payload.presidente_id, CargoConselho.PRESIDENTE, "Presidente"),
        (payload.vice_presidente_id, CargoConselho.VICE_PRESIDENTE, "Vice-Presidente"),
        (payload.secretario_id, CargoConselho.SECRETARIO, "Secretário"),
    ]

    a_inserir = []
    for uid, cargo, rotulo in novos:
        if uid and uid.strip():
            uid = uid.strip()
            elegivel = elegiveis_map.get(uid)
            if not elegivel:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"O CIM '{uid}' informado para {rotulo} não corresponde a um Venerável "
                        "Mestre em exercício em nenhuma Loja jurisdicionada a este Conselho. "
                        "Verifique se o CIM está correto e se o cadastro da Loja foi atualizado."
                    )
                )
            a_inserir.append((elegivel, cargo))

    db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).delete()

    for elegivel, cargo in a_inserir:
        db_core.add(DiretoriaConselho(
            regiao_id=regiao_id,
            usuario_id=elegivel["usuario_id"],
            cargo=cargo,
            inicio_mandato=inicio,
            termino_mandato=termino,
            loja_id=elegivel["loja_id"],
        ))

    db_core.commit()

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=diretor.usuario_id,
        usuario_nome=f"Ir. {diretor.usuario_id}",
        usuario_cargo=diretor.role,
        acao="ATUALIZACAO_DIRETORIA",
        entidade="DiretoriaConselho",
        detalhes={"novos_membros": [{"cargo": c.value, "cim": el["usuario_id"], "loja_id": el["loja_id"]} for el, c in a_inserir]},
    )

    return {"message": "Diretoria e mandatos atualizados com sucesso"}


@router.put("/{regiao_id}/diretoria/{cargo}/emergencia", summary="Substitui emergencialmente um único assento órfão da Diretoria")
def atualizar_assento_diretoria_emergencia(
    regiao_id: str,
    cargo: CargoConselho,
    payload: DiretoriaEmergenciaPayload,
    diretor: RegionalUserContext = Depends(get_current_director),
    db_core: Session = Depends(get_db_core)
):
    elegiveis = _obter_veneraveis_elegiveis_core(db_core, regiao_id)
    elegiveis_map = {e["usuario_id"]: e for e in elegiveis}
    uid = payload.usuario_id.strip()
    elegivel = elegiveis_map.get(uid)
    if not elegivel:
        raise HTTPException(
            status_code=400,
            detail=f"O CIM '{uid}' não corresponde a um Venerável Mestre em exercício em nenhuma Loja jurisdicionada a este Conselho."
        )

    existente = db_core.query(DiretoriaConselho).filter(
        DiretoriaConselho.regiao_id == regiao_id,
        DiretoriaConselho.cargo == cargo
    ).first()
    inicio = existente.inicio_mandato if existente else date.today()
    termino = existente.termino_mandato if existente else (date.today() + timedelta(days=365))

    db_core.query(DiretoriaConselho).filter(
        DiretoriaConselho.regiao_id == regiao_id,
        DiretoriaConselho.cargo == cargo
    ).delete()
    db_core.add(DiretoriaConselho(
        regiao_id=regiao_id,
        usuario_id=elegivel["usuario_id"],
        cargo=cargo,
        inicio_mandato=inicio,
        termino_mandato=termino,
        loja_id=elegivel["loja_id"],
    ))
    db_core.commit()

    registrar_auditoria(
        db=db_core,
        regiao_id=regiao_id,
        usuario_id=diretor.usuario_id,
        usuario_nome=f"Ir. {diretor.usuario_id}",
        usuario_cargo=diretor.role,
        acao="SUBSTITUICAO_EMERGENCIAL_DIRETORIA",
        entidade="DiretoriaConselho",
        entidade_id=cargo.value,
        detalhes={"cargo": cargo.value, "novo_titular_cim": elegivel["usuario_id"], "loja_id": elegivel["loja_id"]},
    )

    logger.info(f"Assento de {cargo.value} da Região {regiao_id} atualizado emergencialmente por {diretor.usuario_id} para {elegivel['usuario_id']}")
    return {"message": f"Assento de {cargo.value} atualizado com sucesso para {elegivel.get('nome_completo') or elegivel['usuario_id']}."}



# ==============================================================================
# DISCREPÂNCIAS E RECONCILIAÇÃO
# ==============================================================================

@router.get(
    "/{regiao_id}/diretoria/discrepancias",
    summary="Lista divergências Diretoria×Lojas",
    description="Lista registros de VM/Suplente atualmente divergentes entre o Conselho e o cadastro do Lojas."
)
def listar_discrepancias_diretoria_lojas(
    regiao_id: str,
    diretor: RegionalUserContext = Depends(get_current_director),
    db_core: Session = Depends(get_db_core)
):
    veneraveis_divergentes = db_core.query(HistoricoLiderancaLoja).filter(
        HistoricoLiderancaLoja.regiao_id == regiao_id,
        HistoricoLiderancaLoja.divergente == True
    ).all()

    suplentes_invalidos = db_core.query(SuplenteConselho).filter(
        SuplenteConselho.loja_id.in_(
            db_core.query(LojaAgregada.id).filter(LojaAgregada.regiao_id == regiao_id)
        ),
        SuplenteConselho.vinculo_valido == False
    ).all()

    return {
        "veneraveis_divergentes": [
            {
                "loja_id": h.loja_id,
                "veneravel_cim": h.veneravel_cim,
                "veneravel_nome": h.veneravel_nome,
                "fonte": h.fonte,
                "divergencia_detalhe": h.divergencia_detalhe,
                "ultima_verificacao_em": h.ultima_verificacao_em,
                "ultimo_alerta_em": h.ultimo_alerta_em,
            }
            for h in veneraveis_divergentes
        ],
        "suplentes_com_vinculo_invalido": [
            {
                "loja_id": s.loja_id,
                "usuario_id": s.usuario_id,
                "nome_suplente": s.nome_suplente,
                "vinculo_invalido_detalhe": s.vinculo_invalido_detalhe,
                "vinculo_verificado_em": s.vinculo_verificado_em,
            }
            for s in suplentes_invalidos
        ],
    }


@router.post(
    "/{regiao_id}/diretoria/reconciliar-agora",
    summary="Dispara reconciliação Diretoria×Lojas sob demanda"
)
def reconciliar_diretoria_lojas_agora(
    regiao_id: str,
    diretor: RegionalUserContext = Depends(get_current_director)
):
    from core.reconciliacao_diretoria_lojas import executar_reconciliacao_diretoria_lojas

    logger.info(f"Reconciliação Diretoria×Lojas disparada manualmente para Região {regiao_id} por {diretor.usuario_id}")
    try:
        resultado = executar_reconciliacao_diretoria_lojas(regiao_id=regiao_id)
    except Exception as e:
        logger.error(f"Erro na reconciliação manual Diretoria×Lojas (Região {regiao_id}): {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao executar a reconciliação: {e}")

    return resultado


# ==============================================================================
# EVENTOS EM TEMPO REAL (SSE) & AUDITORIA
# ==============================================================================

@router.get("/{regiao_id}/eventos/stream", summary="Stream SSE de eventos e notificações em tempo real")
async def stream_eventos_regional(
    regiao_id: str,
    user = Depends(obter_identidade_regional_ou_operador_administrativo)
):
    """
    Canal Server-Sent Events (SSE) exclusivo da Região para recebimento instantâneo
    de avisos, eventos na agenda, considerações e atos da Mesa Diretora.
    """
    logger.info(f"Conexão SSE aberta para a Região {regiao_id} pelo usuário {user.usuario_id}")
    return StreamingResponse(
        gerador_sse_regional(regiao_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/{regiao_id}/auditoria", summary="Consulta a trilha de auditoria e governança do conselho")
def listar_auditoria_regional(
    regiao_id: str,
    acao: Optional[str] = Query(None, description="Filtrar por ação específica"),
    usuario_id: Optional[str] = Query(None, description="Filtrar por autor da ação"),
    limite: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    diretor: RegionalUserContext = Depends(get_current_director),
    db: Session = Depends(get_db_core)
):
    """
    Retorna o log cronológico de governança e auditoria do conselho.
    Exclusivo para Diretoria do Conselho e SuperAdmin.
    """
    query = db.query(RegistroAuditoriaRegional).filter(RegistroAuditoriaRegional.regiao_id == regiao_id)
    if acao:
        query = query.filter(RegistroAuditoriaRegional.acao == acao.upper())
    if usuario_id:
        query = query.filter(RegistroAuditoriaRegional.usuario_id == usuario_id)

    total = query.count()
    registros = query.order_by(RegistroAuditoriaRegional.criado_em.desc()).offset(offset).limit(limite).all()

    return {
        "total": total,
        "limite": limite,
        "offset": offset,
        "registros": [
            {
                "id": r.id,
                "regiao_id": r.regiao_id,
                "usuario_id": r.usuario_id,
                "usuario_nome": r.usuario_nome,
                "usuario_cargo": r.usuario_cargo,
                "acao": r.acao,
                "entidade": r.entidade,
                "entidade_id": r.entidade_id,
                "detalhes": r.detalhes,
                "ip_origem": r.ip_origem,
                "criado_em": r.criado_em.isoformat() if r.criado_em else None,
            }
            for r in registros
        ]
    }

