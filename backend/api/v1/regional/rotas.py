# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import os
import shutil
import uuid
import json
from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from loguru import logger
from pydantic import BaseModel

from database import get_db_core, get_db_lojas
from models.models import (
    Regiao, DiretoriaConselho, LojaAgregada, SuplenteConselho, AvisoRegional, 
    PreviaAdmissao, ConsideracaoPrevia, VotacaoRegional, VotoLoja,
    ItemPatrimonio, EmprestimoPatrimonio, FilaEsperaPatrimonio,
    DocumentoRegional, TopicoComunicacao, MensagemComunicacao
)
from models.lojas_models import ObreiroIntegracao, LojaIntegracao, Mandato
from core.constants import CargoConselho
from schemas.schemas import RegiaoResponse, DiretoriaMembroResponse, DiretoriaUpdatePayload
from core.dependencies import get_current_director, get_current_regional_user, RegionalUserContext
from core.auth_esigma import UsuarioEsigma, obter_usuario_esigma
from utils.pdf_generator import (
    gerar_pdf_previa, gerar_pdf_documento_regional,
    gerar_pdf_relatorio_executivo, gerar_pdf_relatorio_integrantes, gerar_pdf_relatorio_patrimonio,
    gerar_pdf_prancha_comunicacao
)

router = APIRouter()

@router.get("/{regiao_id}/dashboard", response_model=RegiaoResponse, summary="Dashboard do Conselho", description="Obtém os dados completos da Região, acessível por membros autorizados do conselho.")
def obter_dashboard_regional(
    regiao_id: str, 
    user: RegionalUserContext = Depends(get_current_regional_user), 
    db: Session = Depends(get_db_core)
):
    """
    Retorna os dados do Conselho Regional se o usuário for membro (Diretoria, VM ou Suplente de Loja do Conselho).
    """
    logger.info(f"Gerando Dashboard Regional {regiao_id} solicitado por {user.usuario_id} (Perfil: {user.role})")
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    
    if not regiao:
        raise HTTPException(status_code=404, detail="Região não encontrada.")
        
    return regiao

@router.get("/{regiao_id}/me", summary="Obtém o contexto e permissões do usuário atual no conselho")
def obter_meu_contexto_regional(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user)
):
    """
    Retorna papel e escopo do usuário ativo (ex: se é diretoria ou de qual loja específica é o VM).
    """
    return {
        "usuario_id": user.usuario_id,
        "role": user.role,
        "is_diretoria": user.is_diretoria,
        "loja_id": user.loja_id,
        "regiao_id": user.regiao_id,
        # ALTERAÇÃO (2026-09-12): sinaliza quando a pessoa também é Venerável
        # Mestre de uma Loja agregada (mesmo sendo Diretoria) — ver correção
        # em core/dependencies.py. Permite ao frontend exibir, por exemplo,
        # "Presidente do Conselho e Venerável Mestre da Loja 901".
        "is_veneravel": user.is_veneravel
    }

# ALTERAÇÃO (2026-09-11): rota nova, criada junto com a implementação do
# login real do CoReVM contra o e-Sigma (ver PaginaLogin.tsx). Antes, o
# frontend "sabia" para qual Região navegar só porque os logins eram
# simulados com um regiao_id fabricado à mão. Com login real, o e-Sigma
# autentica a pessoa mas não tem nenhum conceito de "Conselho Regional" do
# CoReVM — então o CoReVM precisa, ele mesmo, resolver a quais Regiões essa
# identidade (CIM/CPF/e-mail) tem vínculo, para a tela de login poder
# escolher para onde navegar (ou listar as opções, se houver mais de uma).
# Depende só de `obter_usuario_esigma` (não de `get_current_regional_user`),
# porque aqui ainda não sabemos qual regiao_id usar — é justamente o que
# esta rota descobre.
@router.get("/minhas-regioes", summary="Lista as Regiões (Conselhos Regionais) às quais o usuário autenticado tem vínculo")
def listar_minhas_regioes(
    usuario: UsuarioEsigma = Depends(obter_usuario_esigma),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    identificador = usuario.identificador_negocio

    if usuario.is_super_admin:
        regioes = db_core.query(Regiao).filter(Regiao.ativa == True).all()
        return [{"regiao_id": r.id, "nome": r.nome, "papel": "SUPERADMIN"} for r in regioes]

    if not identificador:
        return []

    encontradas = {}

    # 1. Diretoria do Conselho (Presidente, Vice, Secretário, Delegado)
    for diretor in db_core.query(DiretoriaConselho).filter(DiretoriaConselho.usuario_id == identificador).all():
        encontradas[diretor.regiao_id] = diretor.cargo.value.upper()

    # 2. Suplente de Loja do Conselho — resolve a Região via a Loja agregada
    lojas_suplente = db_core.query(SuplenteConselho.loja_id).filter(SuplenteConselho.usuario_id == identificador).all()
    if lojas_suplente:
        lojas_ids = [l[0] for l in lojas_suplente]
        for agregada in db_core.query(LojaAgregada).filter(LojaAgregada.loja_id.in_(lojas_ids), LojaAgregada.ativa == True).all():
            encontradas.setdefault(agregada.regiao_id, "SUPLENTE")

    # 3. Venerável Mestre — resolve via mandato ativo em lojas_db, depois via LojaAgregada
    try:
        obreiro = db_lojas.query(ObreiroIntegracao).filter(
            (ObreiroIntegracao.cim == identificador) |
            (ObreiroIntegracao.cpf == identificador) |
            (ObreiroIntegracao.id == int(identificador) if identificador.isdigit() else False)
        ).first()
        if obreiro:
            from sqlalchemy import or_, func as sa_func
            mandatos = db_lojas.query(Mandato).filter(
                Mandato.obreiro_id == obreiro.id,
                Mandato.cargo_id == 1,
                or_(Mandato.data_fim.is_(None), Mandato.data_fim >= sa_func.current_date())
            ).all()
            loja_ids_vm = [str(m.loja_id) for m in mandatos]
            if loja_ids_vm:
                for agregada in db_core.query(LojaAgregada).filter(LojaAgregada.loja_id.in_(loja_ids_vm), LojaAgregada.ativa == True).all():
                    encontradas.setdefault(agregada.regiao_id, "VENERAVEL")
    except Exception as e:
        logger.warning(f"Erro ao checar mandato de VM em /minhas-regioes: {e}")

    if not encontradas:
        return []

    regioes = db_core.query(Regiao).filter(Regiao.id.in_(list(encontradas.keys()))).all()
    return [{"regiao_id": r.id, "nome": r.nome, "papel": encontradas[r.id]} for r in regioes]

@router.get("/{regiao_id}/diretoria", response_model=List[DiretoriaMembroResponse], summary="Obtém Diretoria Enriquecida do Conselho")
def obter_diretoria_regional(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Retorna a composição da mesa diretora do conselho com os dados cadastrais (nome, CIM, e-mail) obtidos de lojas_db.
    """
    diretoria = db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).all()
    if not diretoria:
        return []

    user_ids = [d.usuario_id for d in diretoria if d.usuario_id]
    obreiros_map = {}
    if user_ids:
        obreiros = db_lojas.query(ObreiroIntegracao).filter(
            (ObreiroIntegracao.cim.in_(user_ids)) |
            (ObreiroIntegracao.cpf.in_(user_ids))
        ).all()
        for o in obreiros:
            obreiros_map[o.cim] = o
            if o.cpf:
                obreiros_map[o.cpf] = o
            obreiros_map[str(o.id)] = o

    resultado = []
    for d in diretoria:
        o = obreiros_map.get(d.usuario_id)
        resultado.append(DiretoriaMembroResponse(
            id=d.id,
            usuario_id=d.usuario_id,
            cargo=d.cargo,
            inicio_mandato=d.inicio_mandato,
            termino_mandato=d.termino_mandato,
            nome_completo=o.nome_completo if o else None,
            cim=o.cim if o else (d.usuario_id if d.usuario_id.isdigit() else None),
            email=o.email if o else None,
            telefone=o.telefone if o else None
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
    Atualiza a composição da mesa diretora e as datas do mandato. Exclusivo para Diretoria/SuperAdmin.
    """
    logger.info(f"Atualizando diretoria da Região {regiao_id} por {diretor.usuario_id}")
    db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).delete()

    inicio = payload.inicio_mandato or date.today()
    termino = payload.termino_mandato or (date.today() + timedelta(days=365))

    novos = [
        (payload.presidente_id, CargoConselho.PRESIDENTE),
        (payload.vice_presidente_id, CargoConselho.VICE_PRESIDENTE),
        (payload.secretario_id, CargoConselho.SECRETARIO),
    ]

    for uid, cargo in novos:
        if uid and uid.strip():
            db_core.add(DiretoriaConselho(
                regiao_id=regiao_id,
                usuario_id=uid.strip(),
                cargo=cargo,
                inicio_mandato=inicio,
                termino_mandato=termino
            ))

    db_core.commit()
    return {"message": "Diretoria e mandatos atualizados com sucesso"}

@router.get("/{regiao_id}/lojas", summary="Lista as Lojas Jurisdicionadas do Conselho")
def listar_lojas_conselho(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Retorna as lojas agregadas ao conselho com nomes, números e detalhes de lojas_db.
    """
    agregadas = db_core.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()
    
    if not agregadas:
        return {"lojas": []}

    ids = [int(a.loja_id) for a in agregadas if a.loja_id.isdigit()]
    lojas_info = {}
    if ids:
        lojas_db_list = db_lojas.query(LojaIntegracao).filter(LojaIntegracao.id.in_(ids)).all()
        for l in lojas_db_list:
            lojas_info[str(l.id)] = l

    # ALTERAÇÃO (2026-09-12): inclui o Suplente do Conselho atualmente
    # designado para cada Loja (quando houver), para alimentar a tela de
    # designação livre de Suplente sem precisar de uma chamada extra por Loja.
    suplentes_map = {
        s.loja_id: s for s in db_core.query(SuplenteConselho).filter(
            SuplenteConselho.loja_id.in_([a.loja_id for a in agregadas])
        ).all()
    }

    resultado = []
    for a in agregadas:
        info = lojas_info.get(a.loja_id)
        suplente = suplentes_map.get(a.loja_id)
        resultado.append({
            "id": a.loja_id,
            "nome": info.nome_loja if info else f"Loja {a.loja_id}",
            "numero": info.numero_loja if info else "S/N",
            "rito": info.rito if info else None,
            "cidade": info.cidade if info else None,
            "ativa": a.ativa,
            "suplente_usuario_id": suplente.usuario_id if suplente else None,
            "suplente_nome": suplente.nome_suplente if suplente else None,
            "suplente_email": suplente.email_suplente if suplente else None,
        })

    resultado.sort(key=lambda x: int(x["numero"]) if x["numero"] and x["numero"].isdigit() else 999999)
    return {"lojas": resultado}

# ALTERAÇÃO (2026-09-12): implementação da "designação livre de Suplente" —
# até então NÃO existia nenhuma rota de escrita para suplentes_conselho,
# só leitura (RBAC em core/dependencies.py e o relatório de integrantes).
# O objetivo é permitir que o Venerável Mestre de uma Loja (ou a Diretoria
# do Conselho, para qualquer Loja da Região) escolha livremente qualquer um
# dos 7 oficiais eletivos da própria Loja para ocupar a cadeira de Suplente
# no Conselho Regional — trocando o titular quando quiser, sem depender de
# suporte técnico. Ver seção "Ambiente de Teste Ceres" no contexto de
# implementação para o motivo desta feature (simular a troca de Suplente
# entre os membros de teste das 5 Lojas).

CARGOS_LOJA_ELEGIVEIS = [
    (1, "Venerável Mestre"),
    (2, "1º Vigilante"),
    (3, "2º Vigilante"),
    (4, "Orador"),
    (5, "Secretário"),
    (6, "Tesoureiro"),
    (7, "Chanceler"),
]

class SuplenteDesignarPayload(BaseModel):
    usuario_id: str  # CIM (ou CPF) do oficial escolhido dentre os 7 da própria Loja

def _obter_loja_agregada_ou_404(db_core: Session, regiao_id: str, loja_id: str) -> LojaAgregada:
    agregada = db_core.query(LojaAgregada).filter_by(
        regiao_id=regiao_id, loja_id=str(loja_id), ativa=True
    ).first()
    if not agregada:
        raise HTTPException(status_code=404, detail="Esta Loja não está vinculada (ou não está ativa) neste Conselho.")
    return agregada

def _exigir_vm_da_loja_ou_diretoria(user: RegionalUserContext, loja_id: str):
    if user.is_diretoria:
        return
    if user.role == "VENERAVEL" and str(user.loja_id) == str(loja_id):
        return
    raise HTTPException(
        status_code=403,
        detail="Acesso negado: apenas o Venerável Mestre desta Loja ou a Diretoria do Conselho podem designar o Suplente."
    )

@router.get("/{regiao_id}/lojas/{loja_id}/oficiais", summary="Lista os 7 oficiais eletivos (mandato ativo) de uma Loja Jurisdicionada")
def listar_oficiais_loja(
    regiao_id: str,
    loja_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Retorna os ocupantes ativos dos 7 cargos eletivos da Loja (Venerável
    Mestre, 1º e 2º Vigilantes, Orador, Secretário, Tesoureiro e Chanceler),
    usados para popular o seletor de designação de Suplente do Conselho.
    """
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)

    if not str(loja_id).isdigit():
        return {"oficiais": []}

    mandatos = db_lojas.query(Mandato, ObreiroIntegracao).join(
        ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id
    ).filter(
        Mandato.loja_id == int(loja_id),
        Mandato.cargo_id.in_([cargo_id for cargo_id, _ in CARGOS_LOJA_ELEGIVEIS]),
        (Mandato.data_fim.is_(None)) | (Mandato.data_fim >= date.today())
    ).all()

    mapa_cargo = dict(CARGOS_LOJA_ELEGIVEIS)
    resultado = [
        {
            "usuario_id": obreiro.cim,
            "nome_completo": obreiro.nome_completo,
            "email": obreiro.email,
            "cargo_id": mandato.cargo_id,
            "cargo": mapa_cargo.get(mandato.cargo_id, f"Cargo {mandato.cargo_id}"),
        }
        for mandato, obreiro in mandatos
    ]
    resultado.sort(key=lambda o: o["cargo_id"])
    return {"oficiais": resultado}

@router.put("/{regiao_id}/lojas/{loja_id}/suplente", summary="Designa (ou substitui) o Suplente do Conselho de uma Loja")
def designar_suplente_conselho(
    regiao_id: str,
    loja_id: str,
    payload: SuplenteDesignarPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Designação livre de Suplente: o Venerável Mestre da própria Loja, ou
    qualquer membro da Diretoria do Conselho (para qualquer Loja da Região),
    pode escolher qualquer um dos 7 oficiais eletivos da Loja para ocupar a
    cadeira de Suplente. Substitui o Suplente anterior, se houver — a
    cadeira não é acumulativa, é sempre 1 Suplente por Loja.
    """
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    _exigir_vm_da_loja_ou_diretoria(user, loja_id)

    if not str(loja_id).isdigit():
        raise HTTPException(status_code=400, detail="Loja inválida.")

    escolhido = db_lojas.query(ObreiroIntegracao).filter(
        (ObreiroIntegracao.cim == payload.usuario_id) | (ObreiroIntegracao.cpf == payload.usuario_id)
    ).first()
    if not escolhido:
        raise HTTPException(status_code=404, detail="Oficial não encontrado.")

    mandato_valido = db_lojas.query(Mandato).filter(
        Mandato.obreiro_id == escolhido.id,
        Mandato.loja_id == int(loja_id),
        Mandato.cargo_id.in_([cargo_id for cargo_id, _ in CARGOS_LOJA_ELEGIVEIS]),
        (Mandato.data_fim.is_(None)) | (Mandato.data_fim >= date.today())
    ).first()
    if not mandato_valido:
        raise HTTPException(status_code=400, detail="O oficial escolhido não ocupa um dos 7 cargos eletivos ativos desta Loja.")

    db_core.query(SuplenteConselho).filter_by(loja_id=str(loja_id)).delete()
    novo_suplente = SuplenteConselho(
        loja_id=str(loja_id),
        usuario_id=escolhido.cim,
        nome_suplente=escolhido.nome_completo,
        email_suplente=escolhido.email,
    )
    db_core.add(novo_suplente)
    db_core.commit()

    logger.info(f"Suplente do Conselho designado: Loja {loja_id} -> {escolhido.nome_completo} ({escolhido.cim}), por {user.usuario_id} (Região {regiao_id})")
    return {
        "message": "Suplente designado com sucesso.",
        "usuario_id": escolhido.cim,
        "nome_suplente": escolhido.nome_completo,
        "email_suplente": escolhido.email,
    }

@router.delete("/{regiao_id}/lojas/{loja_id}/suplente", summary="Remove a designação de Suplente do Conselho de uma Loja")
def remover_suplente_conselho(
    regiao_id: str,
    loja_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    """
    Desfaz a designação atual de Suplente da Loja, se houver. Mesma regra de
    acesso da designação: VM da própria Loja ou Diretoria do Conselho.
    """
    _obter_loja_agregada_ou_404(db_core, regiao_id, loja_id)
    _exigir_vm_da_loja_ou_diretoria(user, loja_id)

    removido = db_core.query(SuplenteConselho).filter_by(loja_id=str(loja_id)).delete()
    db_core.commit()
    if not removido:
        raise HTTPException(status_code=404, detail="Esta Loja não possui Suplente designado atualmente.")
    return {"message": "Designação de Suplente removida com sucesso."}

class LojaAddRequest(BaseModel):
    loja_id: str

@router.post("/{regiao_id}/lojas", summary="Adiciona uma Loja ao Conselho")
def adicionar_loja_conselho(
    regiao_id: str, 
    request: LojaAddRequest, 
    diretor: RegionalUserContext = Depends(get_current_director), 
    db: Session = Depends(get_db_core)
):
    existente = db.query(LojaAgregada).filter_by(regiao_id=regiao_id, loja_id=request.loja_id).first()
    if existente:
        raise HTTPException(status_code=400, detail="Esta loja já faz parte deste conselho.")
        
    nova_loja = LojaAgregada(
        regiao_id=regiao_id,
        loja_id=request.loja_id,
        data_filiacao=date.today(),
        ativa=True
    )
    db.add(nova_loja)
    db.commit()
    return {"message": "Loja vinculada ao conselho com sucesso"}

@router.delete("/{regiao_id}/lojas/{loja_id}", summary="Remove uma Loja do Conselho")
def remover_loja_conselho(
    regiao_id: str, 
    loja_id: str, 
    diretor: RegionalUserContext = Depends(get_current_director), 
    db: Session = Depends(get_db_core)
):
    loja = db.query(LojaAgregada).filter_by(regiao_id=regiao_id, loja_id=loja_id).first()
    if not loja:
        raise HTTPException(status_code=404, detail="Loja não encontrada neste conselho.")
        
    db.delete(loja)
    db.commit()
    return {"message": "Loja desvinculada do conselho com sucesso"}

class AvisoCreatePayload(BaseModel):
    titulo: str
    conteudo: str # Limite máximo: 200 palavras
    nivel: Optional[str] = "BAIXO" # BAIXO (Informativo), MEDIO (Alerta), ALTO (Urgência)
    tipo: Optional[str] = "AVISO" # AVISO, NOTIFICACAO
    data_validade: Optional[date] = None
    fixado: Optional[bool] = False

class AvisoUpdatePayload(BaseModel):
    titulo: Optional[str] = None
    conteudo: Optional[str] = None
    nivel: Optional[str] = None
    tipo: Optional[str] = None
    data_validade: Optional[date] = None
    fixado: Optional[bool] = None

@router.get("/{regiao_id}/avisos", summary="Lista os avisos e notificações do conselho")
def listar_avisos_regionais(
    regiao_id: str,
    incluir_deletados: bool = False,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Retorna os avisos da região ordenados por fixados primeiro e data mais recente.
    Avisos deletados visualmente são ocultados para usuários comuns.
    SuperAdmin pode visualizar todos (inclusive deletados visualmente para auditoria).
    """
    query = db.query(AvisoRegional).filter(AvisoRegional.regiao_id == regiao_id)
    
    # Filtro de Deleção Visual
    if not (user.role.upper() == 'SUPERADMIN' and incluir_deletados):
        query = query.filter(AvisoRegional.deletado_visualmente == False)
        
    # Filtro de Validade para membros regulares
    if not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        query = query.filter(
            (AvisoRegional.data_validade == None) | (AvisoRegional.data_validade >= date.today())
        )

    avisos = query.order_by(
        AvisoRegional.fixado.desc(),
        AvisoRegional.data_publicacao.desc(),
        AvisoRegional.id.desc()
    ).all()
    
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
            "fixado": a.fixado,
            "data_publicacao": a.data_publicacao.isoformat() if a.data_publicacao else None,
            "data_validade": a.data_validade.isoformat() if a.data_validade else None,
            "deletado_visualmente": a.deletado_visualmente,
            "pode_editar": (user.role.upper() == 'SUPERADMIN' or user.is_diretoria or (user.loja_id and str(user.loja_id) == str(a.loja_id)) or user.usuario_id == a.autor_id),
            "pode_excluir": (user.role.upper() == 'SUPERADMIN' or user.is_diretoria or (user.loja_id and str(user.loja_id) == str(a.loja_id)) or user.usuario_id == a.autor_id),
            "eh_superadmin": user.role.upper() == 'SUPERADMIN'
        }
        for a in avisos
    ]

@router.post("/{regiao_id}/avisos", summary="Publica um novo aviso ou notificação no conselho")
def criar_aviso_regional(
    regiao_id: str,
    payload: AvisoCreatePayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Todos os membros do conselho podem postar avisos com limite máximo de 200 palavras.
    """
    palavras = [w for w in payload.conteudo.strip().split() if w]
    if len(palavras) > 200:
        raise HTTPException(
            status_code=400, 
            detail=f"O conteúdo excede o limite máximo permitido de 200 palavras (contém {len(palavras)} palavras)."
        )

    novo_aviso = AvisoRegional(
        regiao_id=regiao_id,
        titulo=payload.titulo.strip(),
        conteudo=payload.conteudo.strip(),
        nivel=payload.nivel.upper() if payload.nivel else "BAIXO",
        tipo=payload.tipo.upper() if payload.tipo else "AVISO",
        data_validade=payload.data_validade,
        autor_id=user.usuario_id,
        autor_nome=f"Ir. {user.usuario_id}" if user.usuario_id else "Irmão do Conselho",
        autor_cargo=user.role,
        loja_id=str(user.loja_id) if user.loja_id else None,
        fixado=bool(payload.fixado and (user.is_diretoria or user.role.upper() == 'SUPERADMIN')),
        data_publicacao=date.today(),
        deletado_visualmente=False
    )
    db.add(novo_aviso)
    db.commit()
    db.refresh(novo_aviso)
    return {"status": "success", "aviso_id": novo_aviso.id, "message": "Aviso publicado com sucesso."}

@router.put("/{regiao_id}/avisos/{aviso_id}", summary="Edita um aviso no conselho")
def atualizar_aviso_regional(
    regiao_id: str,
    aviso_id: str,
    payload: AvisoUpdatePayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Edição de aviso: SuperAdmin e Diretoria podem editar qualquer post.
    Lojas podem editar exclusivamente seus próprios posts.
    """
    aviso = db.query(AvisoRegional).filter(
        AvisoRegional.id == aviso_id,
        AvisoRegional.regiao_id == regiao_id
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado.")

    pode_editar = (
        user.role.upper() == 'SUPERADMIN' 
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
                detail=f"O conteúdo excede o limite máximo permitido de 200 palavras (contém {len(palavras)} palavras)."
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
    if payload.fixado is not None and (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        aviso.fixado = payload.fixado

    db.commit()
    db.refresh(aviso)
    return {"status": "success", "message": "Aviso atualizado com sucesso."}

@router.delete("/{regiao_id}/avisos/{aviso_id}", summary="Remove ou deleta visualmente um aviso do conselho")
def excluir_aviso_regional(
    regiao_id: str,
    aviso_id: str,
    hard_delete: bool = False,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Deleção:
    - SuperAdmin: pode fazer Hard Delete (exclusão definitiva física) ou deleção visual.
    - Diretoria: deleção visual de qualquer post.
    - Lojas: deleção visual exclusivamente de posts da própria loja.
    """
    aviso = db.query(AvisoRegional).filter(
        AvisoRegional.id == aviso_id,
        AvisoRegional.regiao_id == regiao_id
    ).first()
    if not aviso:
        raise HTTPException(status_code=404, detail="Aviso não encontrado.")

    pode_excluir = (
        user.role.upper() == 'SUPERADMIN' 
        or user.is_diretoria 
        or (user.loja_id and str(user.loja_id) == str(aviso.loja_id))
        or (user.usuario_id and user.usuario_id == aviso.autor_id)
    )
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode deletar avisos criados por sua própria Loja.")

    if hard_delete:
        if user.role.upper() != 'SUPERADMIN':
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin possui permissão para deletar fisicamente um registro do banco de dados.")
        db.delete(aviso)
        db.commit()
        return {"status": "success", "tipo_delecao": "FISICA", "message": "Registro deletado definitivamente do banco de dados."}
    else:
        aviso.deletado_visualmente = True
        db.commit()
        return {"status": "success", "tipo_delecao": "VISUAL", "message": "Aviso ocultado visualmente com sucesso (registro mantido no banco)."}

# -------------------------------------------------------------
# MÓDULO 03: MURAL DE PEDIDOS DE ADMISSÃO (PRÉVIAS E CONSIDERAÇÕES)
# -------------------------------------------------------------

UPLOADS_ADMISSOES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "uploads", "admissoes")
os.makedirs(UPLOADS_ADMISSOES_DIR, exist_ok=True)

class PreviaCreatePayload(BaseModel):
    tipo: str # INICIACAO, REGULARIZACAO, FILIACAO
    loja_id: str
    loja_nome: str
    loja_numero: str
    candidato_nome: str
    data_limite: Optional[date] = None

class ConsideracaoCreatePayload(BaseModel):
    conteudo: str
    autor_nome: Optional[str] = None
    autor_cargo: Optional[str] = None
    loja_nome: Optional[str] = None
    loja_numero: Optional[str] = None

@router.get("/{regiao_id}/admissoes", summary="Lista prévias de admissão do conselho")
def listar_previas_admissao(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Retorna as prévias de admissão (Iniciação, Filiação, Regularização) ativas no conselho.
    """
    previas = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.regiao_id == regiao_id,
        PreviaAdmissao.deletado_visualmente == False
    ).order_by(PreviaAdmissao.data_postagem.desc()).all()

    resultado = []
    for p in previas:
        cons_ativas = [c for c in p.consideracoes if not c.deletado_visualmente]
        
        pode_editar = (
            user.role.upper() == 'SUPERADMIN' 
            or user.is_diretoria 
            or (user.loja_id and str(user.loja_id) == str(p.loja_id))
            or (user.usuario_id and user.usuario_id == p.autor_id)
        )
        
        tipo_label = p.tipo.capitalize()
        if p.tipo.upper() == 'INICIACAO':
            tipo_label = 'Iniciação'
        elif p.tipo.upper() == 'REGULARIZACAO':
            tipo_label = 'Regularização'
        elif p.tipo.upper() == 'FILIACAO':
            tipo_label = 'Filiação'

        titulo_formatado = f"Prévia de {tipo_label} - Loja {p.loja_nome}, nº {p.loja_numero}"

        resultado.append({
            "id": p.id,
            "regiao_id": p.regiao_id,
            "tipo": p.tipo,
            "tipo_label": tipo_label,
            "titulo_formatado": titulo_formatado,
            "loja_id": p.loja_id,
            "loja_nome": p.loja_nome,
            "loja_numero": p.loja_numero,
            "candidato_nome": p.candidato_nome,
            "pdf_url": f"/api/v1/regional/{regiao_id}/admissoes/{p.id}/pdf",
            "pdf_nome_original": p.pdf_nome_original or f"Previa_{p.candidato_nome.replace(' ', '_')}.pdf",
            "data_postagem": p.data_postagem.isoformat() if p.data_postagem else None,
            "data_limite": p.data_limite.isoformat() if p.data_limite else None,
            "status": p.status or "EM_ANDAMENTO",
            "verificado_por_nome": p.verificado_por_nome,
            "data_verificacao": p.data_verificacao.isoformat() if p.data_verificacao else None,
            "autor_id": p.autor_id,
            "autor_nome": p.autor_nome,
            "total_consideracoes": len(cons_ativas),
            "pode_editar": pode_editar,
            "pode_considerar": True
        })

    return resultado

class StatusUpdatePayload(BaseModel):
    status: str # EM_ANDAMENTO, AVERIGUADO, CONCLUIDO
    observacao: Optional[str] = None

@router.put("/{regiao_id}/admissoes/{previa_id}/status", summary="Atualiza o status de verificação da prévia")
def atualizar_status_previa(
    regiao_id: str,
    previa_id: str,
    payload: StatusUpdatePayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    previa = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.id == previa_id,
        PreviaAdmissao.regiao_id == regiao_id
    ).first()
    if not previa:
        raise HTTPException(status_code=404, detail="Prévia não encontrada.")

    novo_status = payload.status.upper()
    previa.status = novo_status

    if novo_status in ["AVERIGUADO", "CONCLUIDO"]:
        if user.is_diretoria:
            previa.verificado_por_nome = f"Mesa Diretora ({user.role})"
        elif user.loja_id:
            previa.verificado_por_nome = f"VM da Loja {user.loja_id}"
        else:
            previa.verificado_por_nome = f"Ir. {user.usuario_id}"
        previa.data_verificacao = datetime.utcnow()
    else:
        previa.verificado_por_nome = None
        previa.data_verificacao = None

    db.commit()
    db.refresh(previa)
    return {
        "status": "success",
        "previa_id": previa.id,
        "novo_status": previa.status,
        "verificado_por_nome": previa.verificado_por_nome,
        "data_verificacao": previa.data_verificacao.isoformat() if previa.data_verificacao else None,
        "message": f"Status atualizado para {previa.status} com sucesso."
    }

@router.post("/{regiao_id}/admissoes/upload", summary="Cria nova prévia com upload de arquivo PDF")
async def criar_previa_com_upload(
    regiao_id: str,
    tipo: str = Form(...),
    loja_id: str = Form(...),
    loja_nome: str = Form(...),
    loja_numero: str = Form(...),
    candidato_nome: str = Form(...),
    data_limite: Optional[str] = Form(None),
    arquivo: Optional[UploadFile] = File(None),
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    previa_id = str(uuid.uuid4())
    limite_dt = None
    if data_limite:
        try:
            limite_dt = datetime.strptime(data_limite, "%Y-%m-%d").date()
        except Exception:
            limite_dt = date.today() + timedelta(days=30)
    else:
        limite_dt = date.today() + timedelta(days=30)

    pdf_nome_salvo = f"{previa_id}.pdf"
    pdf_path_destino = os.path.join(UPLOADS_ADMISSOES_DIR, pdf_nome_salvo)
    nome_original = f"Previa_{candidato_nome.replace(' ', '_')}.pdf"

    if arquivo and arquivo.filename:
        nome_original = arquivo.filename
        with open(pdf_path_destino, "wb") as buffer:
            shutil.copyfileobj(arquivo.file, buffer)
    else:
        gerar_pdf_previa(
            caminho_saida=pdf_path_destino,
            tipo=tipo,
            loja_nome=loja_nome,
            loja_numero=loja_numero,
            candidato_nome=candidato_nome,
            data_postagem=date.today(),
            data_limite=limite_dt
        )

    nova_previa = PreviaAdmissao(
        id=previa_id,
        regiao_id=regiao_id,
        tipo=tipo.upper(),
        loja_id=loja_id,
        loja_nome=loja_nome,
        loja_numero=loja_numero,
        candidato_nome=candidato_nome.strip(),
        pdf_url=pdf_nome_salvo,
        pdf_nome_original=nome_original,
        data_postagem=date.today(),
        data_limite=limite_dt,
        status="EM_ANDAMENTO",
        autor_id=user.usuario_id,
        autor_nome=f"Ir. {user.usuario_id}" if user.usuario_id else "Venerável Mestre",
        deletado_visualmente=False
    )
    db.add(nova_previa)
    db.commit()
    db.refresh(nova_previa)
    return {"status": "success", "previa_id": nova_previa.id, "message": "Prévia de admissão publicada com sucesso."}

@router.post("/{regiao_id}/admissoes", summary="Cria nova prévia com geração automática de PDF")
def criar_previa_json(
    regiao_id: str,
    payload: PreviaCreatePayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    previa_id = str(uuid.uuid4())
    limite_dt = payload.data_limite or (date.today() + timedelta(days=30))
    pdf_nome_salvo = f"{previa_id}.pdf"
    pdf_path_destino = os.path.join(UPLOADS_ADMISSOES_DIR, pdf_nome_salvo)

    gerar_pdf_previa(
        caminho_saida=pdf_path_destino,
        tipo=payload.tipo,
        loja_nome=payload.loja_nome,
        loja_numero=payload.loja_numero,
        candidato_nome=payload.candidato_nome,
        data_postagem=date.today(),
        data_limite=limite_dt
    )

    nova_previa = PreviaAdmissao(
        id=previa_id,
        regiao_id=regiao_id,
        tipo=payload.tipo.upper(),
        loja_id=payload.loja_id,
        loja_nome=payload.loja_nome,
        loja_numero=payload.loja_numero,
        candidato_nome=payload.candidato_nome.strip(),
        pdf_url=pdf_nome_salvo,
        pdf_nome_original=f"Prancha_{payload.candidato_nome.replace(' ', '_')}.pdf",
        data_postagem=date.today(),
        data_limite=limite_dt,
        status="EM_ANDAMENTO",
        autor_id=user.usuario_id,
        autor_nome=f"Ir. {user.usuario_id}" if user.usuario_id else "Venerável Mestre",
        deletado_visualmente=False
    )
    db.add(nova_previa)
    db.commit()
    db.refresh(nova_previa)
    return {"status": "success", "previa_id": nova_previa.id, "message": "Prévia criada e documento oficial gerado com sucesso."}

@router.get("/{regiao_id}/admissoes/{previa_id}/pdf", summary="Retorna o documento PDF da prévia")
def obter_pdf_previa(
    regiao_id: str,
    previa_id: str,
    download: bool = False,
    db: Session = Depends(get_db_core)
):
    previa = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.id == previa_id,
        PreviaAdmissao.regiao_id == regiao_id
    ).first()
    if not previa:
        raise HTTPException(status_code=404, detail="Prévia de admissão não encontrada.")

    pdf_path = os.path.join(UPLOADS_ADMISSOES_DIR, previa.pdf_url)
    if not os.path.exists(pdf_path):
        gerar_pdf_previa(
            caminho_saida=pdf_path,
            tipo=previa.tipo,
            loja_nome=previa.loja_nome,
            loja_numero=previa.loja_numero,
            candidato_nome=previa.candidato_nome,
            data_postagem=previa.data_postagem,
            data_limite=previa.data_limite
        )

    disposition = "attachment" if download else "inline"
    filename = previa.pdf_nome_original or f"Previa_{previa.candidato_nome}.pdf"
    return FileResponse(
        pdf_path, 
        media_type="application/pdf", 
        filename=filename,
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'}
    )

@router.get("/{regiao_id}/admissoes/{previa_id}/consideracoes", summary="Lista histórico cronológico de considerações")
def listar_consideracoes_previa(
    regiao_id: str,
    previa_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    previa = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.id == previa_id,
        PreviaAdmissao.regiao_id == regiao_id
    ).first()
    if not previa:
        raise HTTPException(status_code=404, detail="Prévia não encontrada.")

    consideracoes = db.query(ConsideracaoPrevia).filter(
        ConsideracaoPrevia.previa_id == previa_id,
        ConsideracaoPrevia.deletado_visualmente == False
    ).order_by(ConsideracaoPrevia.data_criacao.asc()).all()

    resultado = []
    for c in consideracoes:
        pode_excluir = (
            user.role.upper() == 'SUPERADMIN'
            or user.is_diretoria
            or (user.usuario_id and user.usuario_id == c.autor_id)
        )
        resultado.append({
            "id": c.id,
            "previa_id": c.previa_id,
            "autor_id": c.autor_id,
            "autor_nome": c.autor_nome,
            "autor_cargo": c.autor_cargo or "Venerável Mestre",
            "loja_id": c.loja_id,
            "loja_nome": c.loja_nome or "Conselho Regional",
            "loja_numero": c.loja_numero,
            "conteudo": c.conteudo,
            "data_criacao": c.data_criacao.isoformat(),
            "pode_excluir": pode_excluir
        })
    return resultado

@router.post("/{regiao_id}/admissoes/{previa_id}/consideracoes", summary="Adiciona nova consideração incremental")
def adicionar_consideracao_previa(
    regiao_id: str,
    previa_id: str,
    payload: ConsideracaoCreatePayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    previa = db_core.query(PreviaAdmissao).filter(
        PreviaAdmissao.id == previa_id,
        PreviaAdmissao.regiao_id == regiao_id
    ).first()
    if not previa:
        raise HTTPException(status_code=404, detail="Prévia de admissão não encontrada.")

    if not payload.conteudo or not payload.conteudo.strip():
        raise HTTPException(status_code=400, detail="O teor da consideração não pode ser vazio.")

    autor_nome = payload.autor_nome
    autor_cargo = payload.autor_cargo or user.role
    loja_nome = payload.loja_nome
    loja_numero = payload.loja_numero

    if not autor_nome:
        if user.is_diretoria:
            autor_nome = f"Mesa Diretora ({user.role})"
        elif user.loja_id:
            autor_nome = f"VM da Loja {user.loja_id}"
        else:
            autor_nome = f"Ir. {user.usuario_id}"

    nova_consideracao = ConsideracaoPrevia(
        previa_id=previa_id,
        autor_id=user.usuario_id,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        loja_id=str(user.loja_id) if user.loja_id else None,
        loja_nome=loja_nome or "Loja Jurisdicionada",
        loja_numero=loja_numero,
        conteudo=payload.conteudo.strip(),
        data_criacao=datetime.utcnow(),
        deletado_visualmente=False
    )
    db_core.add(nova_consideracao)
    db_core.commit()
    db_core.refresh(nova_consideracao)

    return {"status": "success", "consideracao_id": nova_consideracao.id, "message": "Consideração registrada com sucesso."}

@router.delete("/{regiao_id}/admissoes/{previa_id}", summary="Remove ou oculta visualmente uma prévia")
def excluir_previa_admissao(
    regiao_id: str,
    previa_id: str,
    hard_delete: bool = False,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    previa = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.id == previa_id,
        PreviaAdmissao.regiao_id == regiao_id
    ).first()
    if not previa:
        raise HTTPException(status_code=404, detail="Prévia não encontrada.")

    pode_excluir = (
        user.role.upper() == 'SUPERADMIN'
        or user.is_diretoria
        or (user.loja_id and str(user.loja_id) == str(previa.loja_id))
        or (user.usuario_id and user.usuario_id == previa.autor_id)
    )
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode remover prévias de sua própria Loja.")

    if hard_delete:
        if user.role.upper() != 'SUPERADMIN':
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin pode deletar fisicamente registros.")
        db.delete(previa)
        db.commit()
        return {"status": "success", "tipo_delecao": "FISICA", "message": "Prévia deletada permanentemente."}
    else:
        previa.deletado_visualmente = True
        db.commit()
        return {"status": "success", "tipo_delecao": "VISUAL", "message": "Prévia ocultada visualmente com sucesso."}

@router.delete("/{regiao_id}/admissoes/{previa_id}/consideracoes/{consideracao_id}", summary="Remove consideração")
def excluir_consideracao_previa(
    regiao_id: str,
    previa_id: str,
    consideracao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    cons = db.query(ConsideracaoPrevia).filter(
        ConsideracaoPrevia.id == consideracao_id,
        ConsideracaoPrevia.previa_id == previa_id
    ).first()
    if not cons:
        raise HTTPException(status_code=404, detail="Consideração não encontrada.")

    pode_excluir = (
        user.role.upper() == 'SUPERADMIN'
        or user.is_diretoria
        or (user.usuario_id and user.usuario_id == cons.autor_id)
    )
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Permissão negada para excluir este parecer.")

    cons.deletado_visualmente = True
    db.commit()
    return {"status": "success", "message": "Consideração removida com sucesso."}

# -------------------------------------------------------------
# MÓDULO 04: ENQUETES E VOTAÇÕES (DELIBERAÇÕES FORMAIS DO CONSELHO)
# -------------------------------------------------------------

class VotacaoCreatePayload(BaseModel):
    titulo: str
    descricao: str
    tipo: Optional[str] = "DELIBERACAO" # DELIBERACAO, CONSULTA
    opcoes: List[str] = ["Favorável", "Contrário", "Abstenção"]
    data_encerramento: Optional[date] = None
    quorum_minimo: Optional[str] = "MAIORIA_SIMPLES"

class VotoSubmitPayload(BaseModel):
    loja_id: Optional[str] = None
    loja_nome: Optional[str] = None
    loja_numero: Optional[str] = None
    opcao_escolhida: str
    justificativa: Optional[str] = None

class VotacaoStatusPayload(BaseModel):
    status: str # EM_ANDAMENTO, ENCERRADA

@router.get("/{regiao_id}/votacoes", summary="Lista todas as enquetes e votações da região")
def listar_votacoes_regional(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    """
    Retorna as votações ativas com quórum apurado, percentuais e status do voto da Loja ativa.
    """
    votacoes = db.query(VotacaoRegional).filter(
        VotacaoRegional.regiao_id == regiao_id,
        VotacaoRegional.deletado_visualmente == False
    ).order_by(VotacaoRegional.data_abertura.desc()).all()

    # Total de Lojas agregadas ativas no conselho para cálculo de quórum
    total_lojas_conselho = db.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).count() or 1

    resultado = []
    for v in votacoes:
        try:
            opcoes_list = json.loads(v.opcoes) if v.opcoes else ["Favorável", "Contrário", "Abstenção"]
        except Exception:
            opcoes_list = ["Favorável", "Contrário", "Abstenção"]

        # Apuração dos votos
        total_votos = len(v.votos)
        contagem = {op: 0 for op in opcoes_list}
        
        minha_loja_votou = False
        meu_voto = None
        minha_loja_justificativa = None
        user_loja_id_str = str(user.loja_id) if user.loja_id else None

        votos_detalhados = []
        for vt in v.votos:
            if vt.opcao_escolhida in contagem:
                contagem[vt.opcao_escolhida] += 1
            else:
                contagem[vt.opcao_escolhida] = 1

            if user_loja_id_str and str(vt.loja_id) == user_loja_id_str:
                minha_loja_votou = True
                meu_voto = vt.opcao_escolhida
                minha_loja_justificativa = vt.justificativa

            votos_detalhados.append({
                "id": vt.id,
                "loja_id": vt.loja_id,
                "loja_nome": vt.loja_nome,
                "loja_numero": vt.loja_numero,
                "autor_nome": vt.autor_nome,
                "autor_cargo": vt.autor_cargo,
                "opcao_escolhida": vt.opcao_escolhida,
                "justificativa": vt.justificativa,
                "data_voto": vt.data_voto.isoformat() if vt.data_voto else None
            })

        # Cálculo de porcentagens
        apuracao = []
        for op in opcoes_list:
            qtd = contagem.get(op, 0)
            pct = round((qtd / total_votos * 100), 1) if total_votos > 0 else 0.0
            apuracao.append({
                "opcao": op,
                "votos": qtd,
                "percentual": pct
            })

        percentual_quorum = round((total_votos / total_lojas_conselho * 100), 1)

        pode_gerenciar = (user.role.upper() == 'SUPERADMIN' or user.is_diretoria)

        resultado.append({
            "id": v.id,
            "regiao_id": v.regiao_id,
            "titulo": v.titulo,
            "descricao": v.descricao,
            "tipo": v.tipo,
            "tipo_label": "Deliberação Formal" if v.tipo == "DELIBERACAO" else "Consulta Regional",
            "status": v.status,
            "opcoes": opcoes_list,
            "data_abertura": v.data_abertura.isoformat() if v.data_abertura else None,
            "data_encerramento": v.data_encerramento.isoformat() if v.data_encerramento else None,
            "quorum_minimo": v.quorum_minimo,
            "autor_nome": v.autor_nome,
            "autor_cargo": v.autor_cargo,
            "total_votos": total_votos,
            "total_lojas_conselho": total_lojas_conselho,
            "percentual_quorum": percentual_quorum,
            "apuracao": apuracao,
            "minha_loja_votou": minha_loja_votou,
            "meu_voto": meu_voto,
            "minha_loja_justificativa": minha_loja_justificativa,
            "pode_gerenciar": pode_gerenciar,
            "votos_detalhados": votos_detalhados
        })

    return resultado

@router.post("/{regiao_id}/votacoes", summary="Cria nova votação ou consulta regional")
def criar_votacao_regional(
    regiao_id: str,
    payload: VotacaoCreatePayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    if not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        raise HTTPException(status_code=403, detail="Apenas a Mesa Diretora ou SuperAdmin podem abrir novas votações.")

    if not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="O título da votação é obrigatório.")

    if not payload.opcoes or len(payload.opcoes) < 2:
        raise HTTPException(status_code=400, detail="A votação deve possuir no mínimo duas opções de voto.")

    nova_votacao = VotacaoRegional(
        regiao_id=regiao_id,
        titulo=payload.titulo.strip(),
        descricao=payload.descricao.strip(),
        tipo=payload.tipo.upper() if payload.tipo else "DELIBERACAO",
        status="EM_ANDAMENTO",
        opcoes=json.dumps([op.strip() for op in payload.opcoes if op.strip()]),
        data_abertura=date.today(),
        data_encerramento=payload.data_encerramento,
        quorum_minimo=payload.quorum_minimo or "MAIORIA_SIMPLES",
        autor_id=user.usuario_id,
        autor_nome=f"Mesa Diretora ({user.role})" if user.is_diretoria else f"Ir. {user.usuario_id}",
        autor_cargo=user.role,
        deletado_visualmente=False
    )
    db.add(nova_votacao)
    db.commit()
    db.refresh(nova_votacao)
    return {"status": "success", "votacao_id": nova_votacao.id, "message": "Votação aberta com sucesso no Conselho."}

@router.post("/{regiao_id}/votacoes/{votacao_id}/votar", summary="Registra o voto de uma Loja Jurisdicionada")
def votar_na_deliberacao(
    regiao_id: str,
    votacao_id: str,
    payload: VotoSubmitPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    votacao = db_core.query(VotacaoRegional).filter(
        VotacaoRegional.id == votacao_id,
        VotacaoRegional.regiao_id == regiao_id
    ).first()
    if not votacao:
        raise HTTPException(status_code=404, detail="Votação não encontrada.")

    if votacao.status != "EM_ANDAMENTO":
        raise HTTPException(status_code=400, detail="Esta votação já está encerrada.")

    # Resolver ID da Loja votante
    loja_id_final = payload.loja_id or (str(user.loja_id) if user.loja_id else None)
    if not loja_id_final:
        # Se usuário for diretoria ou superadmin e não selecionou loja:
        loja_id_final = "DIRETORIA"

    # Resolver nome e número da Loja
    loja_nome_final = payload.loja_nome
    loja_numero_final = payload.loja_numero

    if not loja_nome_final:
        if loja_id_final.isdigit():
            from models.lojas_models import LojaIntegracao
            loja_db = db_lojas.query(LojaIntegracao).filter(LojaIntegracao.id == int(loja_id_final)).first()
            if loja_db:
                loja_nome_final = loja_db.nome_loja
                loja_numero_final = loja_db.numero_loja or "S/N"
        if not loja_nome_final:
            loja_nome_final = f"Loja Jurisdicionada {loja_id_final}"
            loja_numero_final = "S/N"

    # Verificar se a Loja já votou nesta votação (1 Loja = 1 Voto)
    voto_existente = db_core.query(VotoLoja).filter(
        VotoLoja.votacao_id == votacao_id,
        VotoLoja.loja_id == str(loja_id_final)
    ).first()

    if voto_existente:
        # Atualiza o voto existente antes do encerramento
        voto_existente.opcao_escolhida = payload.opcao_escolhida
        voto_existente.justificativa = payload.justificativa.strip() if payload.justificativa else None
        voto_existente.autor_id = user.usuario_id
        voto_existente.autor_nome = f"VM da Loja {loja_numero_final}" if user.loja_id else f"Ir. {user.usuario_id}"
        voto_existente.data_voto = datetime.utcnow()
        db_core.commit()
        return {"status": "success", "message": "Voto da Loja atualizado com sucesso."}
    else:
        novo_voto = VotoLoja(
            votacao_id=votacao_id,
            loja_id=str(loja_id_final),
            loja_nome=loja_nome_final,
            loja_numero=loja_numero_final,
            autor_id=user.usuario_id,
            autor_nome=f"VM da Loja {loja_numero_final}" if user.loja_id else f"Ir. {user.usuario_id}",
            autor_cargo=user.role,
            opcao_escolhida=payload.opcao_escolhida,
            justificativa=payload.justificativa.strip() if payload.justificativa else None,
            data_voto=datetime.utcnow()
        )
        db_core.add(novo_voto)
        db_core.commit()
        return {"status": "success", "message": "Voto formal da Loja registrado com sucesso."}

@router.put("/{regiao_id}/votacoes/{votacao_id}/status", summary="Encerra ou reabre uma votação")
def alterar_status_votacao(
    regiao_id: str,
    votacao_id: str,
    payload: VotacaoStatusPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    if not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        raise HTTPException(status_code=403, detail="Apenas a Diretoria ou SuperAdmin podem alterar o status de votações.")

    votacao = db.query(VotacaoRegional).filter(
        VotacaoRegional.id == votacao_id,
        VotacaoRegional.regiao_id == regiao_id
    ).first()
    if not votacao:
        raise HTTPException(status_code=404, detail="Votação não encontrada.")

    votacao.status = payload.status.upper()
    if votacao.status == "ENCERRADA" and not votacao.data_encerramento:
        votacao.data_encerramento = date.today()

    db.commit()
    return {"status": "success", "novo_status": votacao.status, "message": f"Votação {votacao.status} com sucesso."}

@router.delete("/{regiao_id}/votacoes/{votacao_id}", summary="Remove ou oculta visualmente uma votação")
def excluir_votacao_regional(
    regiao_id: str,
    votacao_id: str,
    hard_delete: bool = False,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    if not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        raise HTTPException(status_code=403, detail="Apenas a Diretoria ou SuperAdmin podem excluir votações.")

    votacao = db.query(VotacaoRegional).filter(
        VotacaoRegional.id == votacao_id,
        VotacaoRegional.regiao_id == regiao_id
    ).first()
    if not votacao:
        raise HTTPException(status_code=404, detail="Votação não encontrada.")

    if hard_delete:
        if user.role.upper() != 'SUPERADMIN':
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin pode deletar fisicamente.")
        db.delete(votacao)
        db.commit()
        return {"status": "success", "tipo_delecao": "FISICA", "message": "Votação excluída definitivamente."}
    else:
        votacao.deletado_visualmente = True
        db.commit()
        return {"status": "success", "tipo_delecao": "VISUAL", "message": "Votação ocultada visualmente com sucesso."}


# ==============================================================================
# MÓDULO 05: GESTÃO DE PATRIMÔNIO & REDE DE AJUDA MÚTUA
# ==============================================================================

class ItemPatrimonioPayload(BaseModel):
    codigo_tombamento: Optional[str] = None
    nome: str
    descricao: Optional[str] = None
    categoria: str = "HOSPITALAR" # HOSPITALAR, MOBILIARIO, AUDIOVISUAL, LITURGICO, ESTRUTURAL, OUTROS
    tipo_propriedade: str = "CONSELHO" # CONSELHO ou LOJA
    loja_proprietaria_id: Optional[str] = None
    loja_proprietaria_nome: Optional[str] = None
    loja_proprietaria_numero: Optional[str] = None
    quantidade_total: int = 1
    localizacao_fisica: Optional[str] = None
    estado_conservacao: str = "BOM" # NOVO, OTIMO, BOM, REGULAR, EM_MANUTENCAO
    permite_emprestimo: bool = True
    permite_locacao: bool = False
    taxa_locacao_estimada: Optional[str] = None
    foto_url: Optional[str] = None

class EmprestimoPayload(BaseModel):
    loja_solicitante_id: str
    loja_solicitante_nome: str
    loja_solicitante_numero: str
    beneficiario_final: Optional[str] = None
    responsavel_retirada_nome: str
    responsavel_retirada_cargo: Optional[str] = None
    responsavel_retirada_contato: Optional[str] = None
    responsavel_entrega_nome: str
    responsavel_entrega_cargo: Optional[str] = None
    data_retirada: Optional[date] = None
    data_prevista_devolucao: date
    quantidade: int = 1
    estado_conservacao_entrega: Optional[str] = "BOM"
    observacoes: Optional[str] = None

class DevolucaoPayload(BaseModel):
    data_efetiva_devolucao: Optional[date] = None
    estado_conservacao_devolucao: str = "BOM"
    observacoes: Optional[str] = None

class FilaEsperaPayload(BaseModel):
    loja_solicitante_id: str
    loja_solicitante_nome: str
    loja_solicitante_numero: str
    responsavel_nome: str
    contato: Optional[str] = None
    grau_urgencia: str = "NORMAL" # NORMAL, ALTA, URGENTE
    observacoes: Optional[str] = None


@router.get("/{regiao_id}/patrimonio/estatisticas", summary="Métricas gerais de patrimônio e empréstimos")
def obter_estatisticas_patrimonio(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    itens = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.regiao_id == regiao_id,
        ItemPatrimonio.deletado_visualmente == False
    ).all()

    total_ativos = sum(i.quantidade_total for i in itens)
    total_disponiveis = sum(i.quantidade_disponivel for i in itens)
    itens_lojas = sum(1 for i in itens if i.tipo_propriedade == "LOJA")

    hoje = date.today()
    emprestimos_ativos_db = db.query(EmprestimoPatrimonio).filter(
        EmprestimoPatrimonio.regiao_id == regiao_id,
        EmprestimoPatrimonio.status.in_(["ATIVO", "ATRASADO"])
    ).all()

    total_emprestimos_ativos = len(emprestimos_ativos_db)
    total_atrasados = 0
    for emp in emprestimos_ativos_db:
        if emp.data_prevista_devolucao < hoje:
            total_atrasados += 1

    fila_espera_db = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.regiao_id == regiao_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO"
    ).count()

    return {
        "total_ativos": total_ativos,
        "total_disponiveis": total_disponiveis,
        "total_emprestimos_ativos": total_emprestimos_ativos,
        "total_atrasados": total_atrasados,
        "itens_lojas_solidarias": itens_lojas,
        "fila_espera_total": fila_espera_db
    }


@router.get("/{regiao_id}/patrimonio/itens", summary="Lista os itens de patrimônio com filtros e disponibilidade")
def listar_itens_patrimonio(
    regiao_id: str,
    categoria: Optional[str] = None,
    tipo_propriedade: Optional[str] = None,
    apenas_disponiveis: bool = False,
    busca: Optional[str] = None,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    query = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.regiao_id == regiao_id,
        ItemPatrimonio.deletado_visualmente == False
    )

    if categoria and categoria.upper() != "TODAS":
        query = query.filter(ItemPatrimonio.categoria == categoria.upper())

    if tipo_propriedade and tipo_propriedade.upper() != "TODOS":
        query = query.filter(ItemPatrimonio.tipo_propriedade == tipo_propriedade.upper())

    if apenas_disponiveis:
        query = query.filter(ItemPatrimonio.quantidade_disponivel > 0)

    if busca:
        busca_termo = f"%{busca.strip()}%"
        query = query.filter(
            (ItemPatrimonio.nome.ilike(busca_termo)) |
            (ItemPatrimonio.codigo_tombamento.ilike(busca_termo)) |
            (ItemPatrimonio.descricao.ilike(busca_termo)) |
            (ItemPatrimonio.localizacao_fisica.ilike(busca_termo)) |
            (ItemPatrimonio.loja_proprietaria_nome.ilike(busca_termo))
        )

    itens = query.order_by(ItemPatrimonio.data_cadastro.desc()).all()

    resultado = []
    user_loja_id = user.loja_id

    for item in itens:
        fila_aguardando = [f for f in item.fila if f.status == "AGUARDANDO"]
        emprestimos_ativos = [e for e in item.emprestimos if e.status in ["ATIVO", "ATRASADO"]]

        minha_loja_tem_emprestimo = any(e.loja_solicitante_id == user_loja_id for e in emprestimos_ativos) if user_loja_id else False
        minha_loja_na_fila = any(f.loja_solicitante_id == user_loja_id for f in fila_aguardando) if user_loja_id else False

        resultado.append({
            "id": item.id,
            "regiao_id": item.regiao_id,
            "codigo_tombamento": item.codigo_tombamento,
            "nome": item.nome,
            "descricao": item.descricao,
            "categoria": item.categoria,
            "tipo_propriedade": item.tipo_propriedade,
            "loja_proprietaria_id": item.loja_proprietaria_id,
            "loja_proprietaria_nome": item.loja_proprietaria_nome,
            "loja_proprietaria_numero": item.loja_proprietaria_numero,
            "quantidade_total": item.quantidade_total,
            "quantidade_disponivel": item.quantidade_disponivel,
            "quantidade_emprestada": item.quantidade_total - item.quantidade_disponivel,
            "localizacao_fisica": item.localizacao_fisica,
            "estado_conservacao": item.estado_conservacao,
            "permite_emprestimo": item.permite_emprestimo,
            "permite_locacao": item.permite_locacao,
            "taxa_locacao_estimada": item.taxa_locacao_estimada,
            "foto_url": item.foto_url,
            "data_cadastro": item.data_cadastro.strftime("%d/%m/%Y") if item.data_cadastro else "",
            "fila_espera_count": len(fila_aguardando),
            "emprestimos_ativos_count": len(emprestimos_ativos),
            "minha_loja_tem_emprestimo": minha_loja_tem_emprestimo,
            "minha_loja_na_fila": minha_loja_na_fila,
            "pode_gerenciar": user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user_loja_id and item.loja_proprietaria_id == user_loja_id)
        })

    return resultado


@router.post("/{regiao_id}/patrimonio/itens", summary="Cadastra novo bem no patrimônio (Conselho ou Loja)")
def cadastrar_item_patrimonio(
    regiao_id: str,
    payload: ItemPatrimonioPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    tipo_prop = payload.tipo_propriedade.upper()

    if tipo_prop == "CONSELHO" and not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        raise HTTPException(status_code=403, detail="Apenas a Mesa Diretora ou SuperAdmin podem cadastrar bens próprios do Conselho.")

    codigo = payload.codigo_tombamento
    if not codigo:
        count = db.query(ItemPatrimonio).filter(ItemPatrimonio.regiao_id == regiao_id).count() + 1
        prefixo = "PAT-LOJA" if tipo_prop == "LOJA" else "PAT-CORE"
        codigo = f"{prefixo}-{date.today().year}-{count:03d}"

    novo_item = ItemPatrimonio(
        regiao_id=regiao_id,
        codigo_tombamento=codigo,
        nome=payload.nome.strip(),
        descricao=payload.descricao.strip() if payload.descricao else None,
        categoria=payload.categoria.upper(),
        tipo_propriedade=tipo_prop,
        loja_proprietaria_id=payload.loja_proprietaria_id,
        loja_proprietaria_nome=payload.loja_proprietaria_nome,
        loja_proprietaria_numero=payload.loja_proprietaria_numero,
        quantidade_total=max(1, payload.quantidade_total),
        quantidade_disponivel=max(1, payload.quantidade_total),
        localizacao_fisica=payload.localizacao_fisica.strip() if payload.localizacao_fisica else "Sede Regional",
        estado_conservacao=payload.estado_conservacao.upper(),
        permite_emprestimo=payload.permite_emprestimo,
        permite_locacao=payload.permite_locacao,
        taxa_locacao_estimada=payload.taxa_locacao_estimada,
        foto_url=payload.foto_url
    )

    db.add(novo_item)
    db.commit()
    db.refresh(novo_item)

    return {"status": "success", "item_id": novo_item.id, "codigo": novo_item.codigo_tombamento, "message": "Bem patrimonial cadastrado com sucesso."}


@router.put("/{regiao_id}/patrimonio/itens/{item_id}", summary="Atualiza cadastro de um item de patrimônio")
def atualizar_item_patrimonio(
    regiao_id: str,
    item_id: str,
    payload: ItemPatrimonioPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id,
        ItemPatrimonio.regiao_id == regiao_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    pode_editar = user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and item.loja_proprietaria_id == user.loja_id)
    if not pode_editar:
        raise HTTPException(status_code=403, detail="Você não tem permissão para editar este item de patrimônio.")

    item.nome = payload.nome.strip()
    if payload.descricao is not None:
        item.descricao = payload.descricao.strip()
    item.categoria = payload.categoria.upper()
    item.localizacao_fisica = payload.localizacao_fisica
    item.estado_conservacao = payload.estado_conservacao.upper()
    item.permite_emprestimo = payload.permite_emprestimo
    item.permite_locacao = payload.permite_locacao
    item.taxa_locacao_estimada = payload.taxa_locacao_estimada
    if payload.foto_url:
        item.foto_url = payload.foto_url

    emprestados = item.quantidade_total - item.quantidade_disponivel
    novo_total = max(emprestados, payload.quantidade_total)
    item.quantidade_total = novo_total
    item.quantidade_disponivel = novo_total - emprestados

    db.commit()
    return {"status": "success", "message": "Item atualizado com sucesso."}


@router.delete("/{regiao_id}/patrimonio/itens/{item_id}", summary="Remove ou oculta visualmente um bem de patrimônio")
def excluir_item_patrimonio(
    regiao_id: str,
    item_id: str,
    hard_delete: bool = False,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id,
        ItemPatrimonio.regiao_id == regiao_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    pode_excluir = user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and item.loja_proprietaria_id == user.loja_id)
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Sem permissão para remover este bem patrimonial.")

    if hard_delete:
        if user.role.upper() != 'SUPERADMIN':
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin pode deletar fisicamente do banco de dados.")
        db.delete(item)
        db.commit()
        return {"status": "success", "tipo_delecao": "FISICA", "message": "Item excluído definitivamente."}
    else:
        item.deletado_visualmente = True
        db.commit()
        return {"status": "success", "tipo_delecao": "VISUAL", "message": "Item ocultado visualmente com sucesso."}


@router.get("/{regiao_id}/patrimonio/emprestimos", summary="Lista os termos de cautela e empréstimos de patrimônio")
def listar_emprestimos_patrimonio(
    regiao_id: str,
    status: Optional[str] = None,
    loja_id: Optional[str] = None,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    query = db.query(EmprestimoPatrimonio).filter(EmprestimoPatrimonio.regiao_id == regiao_id)

    if loja_id:
        query = query.filter(EmprestimoPatrimonio.loja_solicitante_id == loja_id)

    hoje = date.today()
    emprestimos = query.order_by(EmprestimoPatrimonio.data_retirada.desc()).all()

    resultado = []
    for emp in emprestimos:
        st = emp.status
        if st == "ATIVO" and emp.data_prevista_devolucao < hoje:
            st = "ATRASADO"

        if status and status.upper() != "TODOS":
            if st != status.upper():
                continue

        dias_restantes = (emp.data_prevista_devolucao - hoje).days

        resultado.append({
            "id": emp.id,
            "item_id": emp.item_id,
            "item_nome": emp.item.nome if emp.item else "Ativo do Patrimônio",
            "item_codigo": emp.item.codigo_tombamento if emp.item else "",
            "item_categoria": emp.item.categoria if emp.item else "",
            "loja_solicitante_id": emp.loja_solicitante_id,
            "loja_solicitante_nome": emp.loja_solicitante_nome,
            "loja_solicitante_numero": emp.loja_solicitante_numero,
            "beneficiario_final": emp.beneficiario_final or "Empréstimo Fraterno",
            "responsavel_retirada_nome": emp.responsavel_retirada_nome,
            "responsavel_retirada_cargo": emp.responsavel_retirada_cargo,
            "responsavel_retirada_contato": emp.responsavel_retirada_contato,
            "responsavel_entrega_nome": emp.responsavel_entrega_nome,
            "responsavel_entrega_cargo": emp.responsavel_entrega_cargo,
            "data_retirada": emp.data_retirada.strftime("%d/%m/%Y"),
            "data_prevista_devolucao": emp.data_prevista_devolucao.strftime("%d/%m/%Y"),
            "data_efetiva_devolucao": emp.data_efetiva_devolucao.strftime("%d/%m/%Y") if emp.data_efetiva_devolucao else None,
            "quantidade": emp.quantidade,
            "status": st,
            "dias_restantes": dias_restantes,
            "atrasado": dias_restantes < 0 and st != "CONCLUIDO",
            "estado_conservacao_entrega": emp.estado_conservacao_entrega,
            "estado_conservacao_devolucao": emp.estado_conservacao_devolucao,
            "observacoes": emp.observacoes,
            "pode_gerenciar": user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and emp.loja_solicitante_id == user.loja_id)
        })

    return resultado


@router.post("/{regiao_id}/patrimonio/itens/{item_id}/emprestar", summary="Registra um termo de cautela e saída de bem para empréstimo")
def realizar_emprestimo(
    regiao_id: str,
    item_id: str,
    payload: EmprestimoPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id,
        ItemPatrimonio.regiao_id == regiao_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    if item.quantidade_disponivel < payload.quantidade:
        raise HTTPException(
            status_code=400, 
            detail=f"Quantidade insuficiente para empréstimo. Disponíveis: {item.quantidade_disponivel}, solicitados: {payload.quantidade}. Solicite inclusão na Fila de Espera."
        )

    data_ret = payload.data_retirada or date.today()
    if payload.data_prevista_devolucao <= data_ret:
        raise HTTPException(status_code=400, detail="A data prevista de devolução deve ser posterior à data de retirada.")

    novo_emprestimo = EmprestimoPatrimonio(
        item_id=item.id,
        regiao_id=regiao_id,
        loja_solicitante_id=payload.loja_solicitante_id,
        loja_solicitante_nome=payload.loja_solicitante_nome,
        loja_solicitante_numero=payload.loja_solicitante_numero,
        beneficiario_final=payload.beneficiario_final,
        responsavel_retirada_nome=payload.responsavel_retirada_nome.strip(),
        responsavel_retirada_cargo=payload.responsavel_retirada_cargo,
        responsavel_retirada_contato=payload.responsavel_retirada_contato,
        responsavel_entrega_nome=payload.responsavel_entrega_nome.strip(),
        responsavel_entrega_cargo=payload.responsavel_entrega_cargo,
        data_retirada=data_ret,
        data_prevista_devolucao=payload.data_prevista_devolucao,
        quantidade=payload.quantidade,
        status="ATIVO",
        estado_conservacao_entrega=payload.estado_conservacao_entrega or item.estado_conservacao,
        observacoes=payload.observacoes
    )

    item.quantidade_disponivel -= payload.quantidade

    fila_entry = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.item_id == item.id,
        FilaEsperaPatrimonio.loja_solicitante_id == payload.loja_solicitante_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO"
    ).first()
    if fila_entry:
        fila_entry.status = "ATENDIDO"

    db.add(novo_emprestimo)
    db.commit()
    db.refresh(novo_emprestimo)

    return {
        "status": "success",
        "emprestimo_id": novo_emprestimo.id,
        "item_nome": item.nome,
        "disponiveis_restantes": item.quantidade_disponivel,
        "message": "Termo de Cautela e Empréstimo registrado com sucesso."
    }


@router.post("/{regiao_id}/patrimonio/emprestimos/{emprestimo_id}/devolver", summary="Registra devolução (check-in) de bem emprestado")
def registrar_devolucao(
    regiao_id: str,
    emprestimo_id: str,
    payload: DevolucaoPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    emprestimo = db.query(EmprestimoPatrimonio).filter(
        EmprestimoPatrimonio.id == emprestimo_id,
        EmprestimoPatrimonio.regiao_id == regiao_id
    ).first()

    if not emprestimo:
        raise HTTPException(status_code=404, detail="Registro de empréstimo não encontrado.")

    if emprestimo.status == "CONCLUIDO":
        raise HTTPException(status_code=400, detail="Este empréstimo já foi dado como devolvido anteriormente.")

    pode_devolver = user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and emprestimo.loja_solicitante_id == user.loja_id)
    if not pode_devolver:
        raise HTTPException(status_code=403, detail="Sem autorização para registrar a devolução deste empréstimo.")

    emprestimo.status = "CONCLUIDO"
    emprestimo.data_efetiva_devolucao = payload.data_efetiva_devolucao or date.today()
    emprestimo.estado_conservacao_devolucao = payload.estado_conservacao_devolucao
    if payload.observacoes:
        antigas = emprestimo.observacoes or ""
        emprestimo.observacoes = f"{antigas}\n[Devolução]: {payload.observacoes}".strip()

    item = emprestimo.item
    if item:
        item.quantidade_disponivel = min(item.quantidade_total, item.quantidade_disponivel + emprestimo.quantidade)
        if payload.estado_conservacao_devolucao:
            item.estado_conservacao = payload.estado_conservacao_devolucao

    proximo_fila = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.item_id == emprestimo.item_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO"
    ).order_by(FilaEsperaPatrimonio.data_solicitacao.asc()).first()

    mensagem_fila = None
    if proximo_fila:
        mensagem_fila = f"Atenção: A Loja {proximo_fila.loja_solicitante_nome} (Nº {proximo_fila.loja_solicitante_numero}) é a 1ª da fila de espera para este item."

    db.commit()

    return {
        "status": "success",
        "message": "Devolução homologada e bem reintegrado ao acervo com sucesso.",
        "proximo_na_fila": {
            "loja_nome": proximo_fila.loja_solicitante_nome,
            "loja_numero": proximo_fila.loja_solicitante_numero,
            "responsavel": proximo_fila.responsavel_nome,
            "contato": proximo_fila.contato
        } if proximo_fila else None,
        "aviso_fila": mensagem_fila
    }


@router.get("/{regiao_id}/patrimonio/fila", summary="Lista todas as demandas na fila de espera")
def listar_fila_espera_geral(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    filas = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.regiao_id == regiao_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO"
    ).order_by(FilaEsperaPatrimonio.data_solicitacao.asc()).all()

    resultado = []
    for idx, f in enumerate(filas, 1):
        resultado.append({
            "id": f.id,
            "item_id": f.item_id,
            "item_nome": f.item.nome if f.item else "Item",
            "item_categoria": f.item.categoria if f.item else "",
            "item_disponivel_agora": f.item.quantidade_disponivel if f.item else 0,
            "posicao": idx,
            "loja_solicitante_id": f.loja_solicitante_id,
            "loja_solicitante_nome": f.loja_solicitante_nome,
            "loja_solicitante_numero": f.loja_solicitante_numero,
            "responsavel_nome": f.responsavel_nome,
            "contato": f.contato,
            "grau_urgencia": f.grau_urgencia,
            "status": f.status,
            "observacoes": f.observacoes,
            "data_solicitacao": f.data_solicitacao.strftime("%d/%m/%Y %H:%M")
        })

    return resultado


@router.post("/{regiao_id}/patrimonio/itens/{item_id}/fila", summary="Ingressa na fila de espera para um item indisponível")
def entrar_na_fila_espera(
    regiao_id: str,
    item_id: str,
    payload: FilaEsperaPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id,
        ItemPatrimonio.regiao_id == regiao_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    ja_na_fila = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.item_id == item_id,
        FilaEsperaPatrimonio.loja_solicitante_id == payload.loja_solicitante_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO"
    ).first()

    if ja_na_fila:
        raise HTTPException(status_code=400, detail="Esta Loja já possui solicitação ativa na fila de espera deste item.")

    nova_fila = FilaEsperaPatrimonio(
        item_id=item.id,
        regiao_id=regiao_id,
        loja_solicitante_id=payload.loja_solicitante_id,
        loja_solicitante_nome=payload.loja_solicitante_nome,
        loja_solicitante_numero=payload.loja_solicitante_numero,
        responsavel_nome=payload.responsavel_nome.strip(),
        contato=payload.contato,
        grau_urgencia=payload.grau_urgencia.upper(),
        status="AGUARDANDO",
        observacoes=payload.observacoes
    )

    db.add(nova_fila)
    db.commit()
    db.refresh(nova_fila)

    posicao = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.item_id == item_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO"
    ).count()

    return {
        "status": "success",
        "fila_id": nova_fila.id,
        "posicao": posicao,
        "message": f"Demanda incluída com sucesso na Fila de Espera (Posição {posicao}º)."
    }


@router.delete("/{regiao_id}/patrimonio/fila/{fila_id}", summary="Cancela ou remove solicitação da fila de espera")
def cancelar_fila_espera(
    regiao_id: str,
    fila_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    fila = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.id == fila_id,
        FilaEsperaPatrimonio.regiao_id == regiao_id
    ).first()

    if not fila:
        raise HTTPException(status_code=404, detail="Solicitação na fila não encontrada.")

    pode_cancelar = user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and fila.loja_solicitante_id == user.loja_id)
    if not pode_cancelar:
        raise HTTPException(status_code=403, detail="Sem autorização para cancelar esta solicitação da fila.")

    fila.status = "CANCELADO"
    db.commit()

    return {"status": "success", "message": "Solicitação na fila de espera cancelada com sucesso."}


# ==============================================================================
# MÓDULO 06: DOCUMENTOS DO CONSELHO REGIONAL
# ==============================================================================

class DocumentoPayload(BaseModel):
    codigo_documento: Optional[str] = None
    titulo: str
    descricao_ementa: Optional[str] = None
    categoria: str = "ATA" # ATA, DECRETO, REGULAMENTO, CIRCULAR, CONVITE, MODELO
    tipo_origem: str = "CONSELHO" # CONSELHO, LOJA
    loja_emissora_id: Optional[str] = None
    loja_emissora_nome: Optional[str] = None
    loja_emissora_numero: Optional[str] = None
    data_documento: Optional[date] = None
    conteudo_texto: Optional[str] = None
    visibilidade: str = "PUBLICO_CONSELHO" # PUBLICO_CONSELHO, RESTRITO_DIRETORIA


@router.get("/{regiao_id}/documentos/estatisticas", summary="Métricas consolidadas do repositório documental")
def obter_estatisticas_documentos(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    docs = db.query(DocumentoRegional).filter(
        DocumentoRegional.regiao_id == regiao_id,
        DocumentoRegional.deletado_visualmente == False
    ).all()

    total_docs = len(docs)
    total_atas = sum(1 for d in docs if d.categoria == "ATA")
    total_decretos = sum(1 for d in docs if d.categoria == "DECRETO")
    total_regulamentos = sum(1 for d in docs if d.categoria == "REGULAMENTO")
    total_circulares = sum(1 for d in docs if d.categoria == "CIRCULAR")
    total_convites = sum(1 for d in docs if d.categoria == "CONVITE")
    total_modelos = sum(1 for d in docs if d.categoria == "MODELO")
    total_downloads = sum(d.downloads_count for d in docs)

    return {
        "total_documentos": total_docs,
        "total_atas": total_atas,
        "total_decretos": total_decretos,
        "total_regulamentos": total_regulamentos,
        "total_circulares": total_circulares,
        "total_convites": total_convites,
        "total_modelos": total_modelos,
        "total_downloads": total_downloads
    }


@router.get("/{regiao_id}/documentos", summary="Lista os documentos oficiais com filtros")
def listar_documentos_regionais(
    regiao_id: str,
    categoria: Optional[str] = None,
    tipo_origem: Optional[str] = None,
    busca: Optional[str] = None,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    query = db.query(DocumentoRegional).filter(
        DocumentoRegional.regiao_id == regiao_id,
        DocumentoRegional.deletado_visualmente == False
    )

    # Controle de Visibilidade
    if not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        query = query.filter(
            (DocumentoRegional.visibilidade == "PUBLICO_CONSELHO") |
            (DocumentoRegional.loja_emissora_id == user.loja_id)
        )

    if categoria and categoria.upper() != "TODAS":
        query = query.filter(DocumentoRegional.categoria == categoria.upper())

    if tipo_origem and tipo_origem.upper() != "TODOS":
        query = query.filter(DocumentoRegional.tipo_origem == tipo_origem.upper())

    if busca:
        busca_termo = f"%{busca.strip()}%"
        query = query.filter(
            (DocumentoRegional.titulo.ilike(busca_termo)) |
            (DocumentoRegional.codigo_documento.ilike(busca_termo)) |
            (DocumentoRegional.descricao_ementa.ilike(busca_termo)) |
            (DocumentoRegional.loja_emissora_nome.ilike(busca_termo)) |
            (DocumentoRegional.autor_nome.ilike(busca_termo))
        )

    documentos = query.order_by(DocumentoRegional.data_documento.desc()).all()

    resultado = []
    for doc in documentos:
        pode_gerenciar = user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and doc.loja_emissora_id == user.loja_id)

        resultado.append({
            "id": doc.id,
            "regiao_id": doc.regiao_id,
            "codigo_documento": doc.codigo_documento,
            "titulo": doc.titulo,
            "descricao_ementa": doc.descricao_ementa,
            "categoria": doc.categoria,
            "tipo_origem": doc.tipo_origem,
            "loja_emissora_id": doc.loja_emissora_id,
            "loja_emissora_nome": doc.loja_emissora_nome,
            "loja_emissora_numero": doc.loja_emissora_numero,
            "autor_nome": doc.autor_nome,
            "autor_cargo": doc.autor_cargo,
            "data_documento": doc.data_documento.strftime("%d/%m/%Y"),
            "data_publicacao": doc.data_publicacao.strftime("%d/%m/%Y %H:%M") if doc.data_publicacao else "",
            "arquivo_url": doc.arquivo_url,
            "tem_arquivo": bool(doc.arquivo_url and os.path.exists(doc.arquivo_url)),
            "tamanho_bytes": doc.tamanho_bytes,
            "downloads_count": doc.downloads_count,
            "visibilidade": doc.visibilidade,
            "conteudo_texto": doc.conteudo_texto,
            "pode_gerenciar": pode_gerenciar
        })

    return resultado


@router.post("/{regiao_id}/documentos", summary="Publica novo documento gerando PDF oficial automaticamente")
def publicar_documento_regional(
    regiao_id: str,
    payload: DocumentoPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    tipo_orig = payload.tipo_origem.upper()

    if tipo_orig == "CONSELHO" and not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        raise HTTPException(status_code=403, detail="Apenas a Mesa Diretora ou SuperAdmin podem publicar documentos oficiais do Conselho.")

    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    data_doc = payload.data_documento or date.today()
    ano = data_doc.year

    # Gerar código automático se não fornecido
    codigo = payload.codigo_documento
    if not codigo:
        count = db.query(DocumentoRegional).filter(
            DocumentoRegional.regiao_id == regiao_id,
            DocumentoRegional.categoria == payload.categoria.upper()
        ).count() + 1
        
        pref = {
            "ATA": "ATA-CORE",
            "DECRETO": "DEC-CORE",
            "REGULAMENTO": "REG-CORE",
            "CIRCULAR": "CIR-CORE",
            "CONVITE": f"CONV-LOJA{payload.loja_emissora_numero or 'X'}",
            "MODELO": "MOD-CORE"
        }.get(payload.categoria.upper(), "DOC-CORE")
        codigo = f"{pref}-{count:02d}/{ano}"

    doc_id = str(uuid.uuid4())
    diretorio_destino = os.path.join("uploads", "documentos", regiao_id)
    os.makedirs(diretorio_destino, exist_ok=True)
    caminho_pdf = os.path.join(diretorio_destino, f"{doc_id}.pdf")

    # Autoria
    autor_nome = "Mesa Diretora"
    autor_cargo = "Diretoria Regional"
    if user.is_diretoria:
        autor_nome = f"Ir.'. {user.usuario_id}"
        autor_cargo = f"{user.role} Regional"
    elif user.loja_id:
        autor_nome = f"Ir.'. {user.usuario_id}"
        autor_cargo = "Venerável Mestre"

    # Gerar PDF Oficial via ReportLab
    gerar_pdf_documento_regional(
        caminho_saida=caminho_pdf,
        codigo_documento=codigo,
        titulo=payload.titulo.strip(),
        categoria=payload.categoria.upper(),
        descricao_ementa=payload.descricao_ementa.strip() if payload.descricao_ementa else "",
        conteudo_texto=payload.conteudo_texto.strip() if payload.conteudo_texto else "",
        data_documento=data_doc,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        tipo_origem=tipo_orig,
        loja_emissora_nome=payload.loja_emissora_nome,
        conselho_nome=conselho_nome
    )

    tamanho = os.path.getsize(caminho_pdf) if os.path.exists(caminho_pdf) else 0

    novo_doc = DocumentoRegional(
        id=doc_id,
        regiao_id=regiao_id,
        codigo_documento=codigo,
        titulo=payload.titulo.strip(),
        descricao_ementa=payload.descricao_ementa.strip() if payload.descricao_ementa else None,
        categoria=payload.categoria.upper(),
        tipo_origem=tipo_orig,
        loja_emissora_id=payload.loja_emissora_id,
        loja_emissora_nome=payload.loja_emissora_nome,
        loja_emissora_numero=payload.loja_emissora_numero,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        data_documento=data_doc,
        data_publicacao=datetime.utcnow(),
        arquivo_url=caminho_pdf,
        tamanho_bytes=tamanho,
        downloads_count=0,
        visibilidade=payload.visibilidade,
        conteudo_texto=payload.conteudo_texto
    )

    db.add(novo_doc)
    db.commit()
    db.refresh(novo_doc)

    return {
        "status": "success",
        "documento_id": novo_doc.id,
        "codigo": novo_doc.codigo_documento,
        "arquivo_url": novo_doc.arquivo_url,
        "message": f"Documento oficial {novo_doc.codigo_documento} publicado e PDF gerado com sucesso."
    }


@router.post("/{regiao_id}/documentos/upload", summary="Publica documento via upload de arquivo PDF/Docx")
def upload_documento_regional(
    regiao_id: str,
    titulo: str = Form(...),
    categoria: str = Form(...),
    tipo_origem: str = Form("CONSELHO"),
    descricao_ementa: Optional[str] = Form(None),
    codigo_documento: Optional[str] = Form(None),
    loja_emissora_id: Optional[str] = Form(None),
    loja_emissora_nome: Optional[str] = Form(None),
    loja_emissora_numero: Optional[str] = Form(None),
    data_documento: Optional[str] = Form(None),
    visibilidade: str = Form("PUBLICO_CONSELHO"),
    arquivo: UploadFile = File(...),
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    tipo_orig = tipo_origem.upper()
    if tipo_orig == "CONSELHO" and not (user.is_diretoria or user.role.upper() == 'SUPERADMIN'):
        raise HTTPException(status_code=403, detail="Apenas a Mesa Diretora ou SuperAdmin podem publicar documentos do Conselho.")

    dt_doc = date.today()
    if data_documento:
        try:
            dt_doc = datetime.strptime(data_documento, "%Y-%m-%d").date()
        except Exception:
            dt_doc = date.today()

    codigo = codigo_documento
    if not codigo:
        count = db.query(DocumentoRegional).filter(
            DocumentoRegional.regiao_id == regiao_id,
            DocumentoRegional.categoria == categoria.upper()
        ).count() + 1
        codigo = f"{categoria.upper()}-CORE-{count:02d}/{dt_doc.year}"

    doc_id = str(uuid.uuid4())
    diretorio_destino = os.path.join("uploads", "documentos", regiao_id)
    os.makedirs(diretorio_destino, exist_ok=True)

    ext = os.path.splitext(arquivo.filename)[1] if arquivo.filename else ".pdf"
    caminho_final = os.path.join(diretorio_destino, f"{doc_id}{ext}")

    with open(caminho_final, "wb") as buffer:
        shutil.copyfileobj(arquivo.file, buffer)

    tamanho = os.path.getsize(caminho_final) if os.path.exists(caminho_final) else 0

    autor_nome = f"Ir.'. {user.usuario_id}"
    autor_cargo = user.role

    novo_doc = DocumentoRegional(
        id=doc_id,
        regiao_id=regiao_id,
        codigo_documento=codigo,
        titulo=titulo.strip(),
        descricao_ementa=descricao_ementa.strip() if descricao_ementa else None,
        categoria=categoria.upper(),
        tipo_origem=tipo_orig,
        loja_emissora_id=loja_emissora_id,
        loja_emissora_nome=loja_emissora_nome,
        loja_emissora_numero=loja_emissora_numero,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        data_documento=dt_doc,
        data_publicacao=datetime.utcnow(),
        arquivo_url=caminho_final,
        tamanho_bytes=tamanho,
        downloads_count=0,
        visibilidade=visibilidade
    )

    db.add(novo_doc)
    db.commit()
    db.refresh(novo_doc)

    return {
        "status": "success",
        "documento_id": novo_doc.id,
        "codigo": novo_doc.codigo_documento,
        "arquivo_url": novo_doc.arquivo_url,
        "message": f"Arquivo {arquivo.filename} anexado e registrado com sucesso."
    }


@router.get("/{regiao_id}/documentos/{documento_id}/arquivo", summary="Streaming e download seguro de arquivo de documento")
def baixar_arquivo_documento(
    regiao_id: str,
    documento_id: str,
    db: Session = Depends(get_db_core)
):
    doc = db.query(DocumentoRegional).filter(
        DocumentoRegional.id == documento_id,
        DocumentoRegional.regiao_id == regiao_id
    ).first()

    if not doc or not doc.arquivo_url or not os.path.exists(doc.arquivo_url):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor.")

    doc.downloads_count += 1
    db.commit()

    nome_download = f"{doc.codigo_documento.replace('/', '_')}_{doc.titulo[:30]}.pdf"
    return FileResponse(
        path=doc.arquivo_url,
        filename=nome_download,
        media_type="application/pdf"
    )


@router.put("/{regiao_id}/documentos/{documento_id}", summary="Atualiza metadados de um documento")
def atualizar_documento_regional(
    regiao_id: str,
    documento_id: str,
    payload: DocumentoPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    doc = db.query(DocumentoRegional).filter(
        DocumentoRegional.id == documento_id,
        DocumentoRegional.regiao_id == regiao_id
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    pode_editar = user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and doc.loja_emissora_id == user.loja_id)
    if not pode_editar:
        raise HTTPException(status_code=403, detail="Sem permissão para atualizar este documento.")

    doc.titulo = payload.titulo.strip()
    if payload.descricao_ementa is not None:
        doc.descricao_ementa = payload.descricao_ementa.strip()
    doc.categoria = payload.categoria.upper()
    doc.visibilidade = payload.visibilidade

    db.commit()
    return {"status": "success", "message": "Documento atualizado com sucesso."}


@router.delete("/{regiao_id}/documentos/{documento_id}", summary="Oculta visualmente ou remove definitivamente um documento")
def excluir_documento_regional(
    regiao_id: str,
    documento_id: str,
    hard_delete: bool = False,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core)
):
    doc = db.query(DocumentoRegional).filter(
        DocumentoRegional.id == documento_id,
        DocumentoRegional.regiao_id == regiao_id
    ).first()

    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    pode_excluir = user.is_diretoria or user.role.upper() == 'SUPERADMIN' or (user.loja_id and doc.loja_emissora_id == user.loja_id)
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Sem autorização para remover este documento.")

    if hard_delete:
        if user.role.upper() != 'SUPERADMIN':
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin pode deletar fisicamente.")
        if doc.arquivo_url and os.path.exists(doc.arquivo_url):
            try:
                os.remove(doc.arquivo_url)
            except Exception:
                pass
        db.delete(doc)
        db.commit()
        return {"status": "success", "tipo_delecao": "FISICA", "message": "Documento removido definitivamente."}
    else:
        doc.deletado_visualmente = True
        db.commit()
        return {"status": "success", "tipo_delecao": "VISUAL", "message": "Documento ocultado visualmente com sucesso."}


# ==============================================================================
# MÓDULO 07: RELATÓRIOS DE GESTÃO E INTELIGÊNCIA REGIONAL
# ==============================================================================

@router.get("/{regiao_id}/relatorios/consolidado", summary="Compila indicadores executivos de governança, ritos e assiduidade")
def obter_relatorio_consolidado(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Retorna métricas executivas globais, distribuição por rito, ranking de assiduidade
    das lojas e taxa de engajamento do colegiado regional.
    """
    from models.lojas_models import LojaIntegracao

    # 1. Região e Lojas
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    agregadas = db_core.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()
    total_lojas = len(agregadas)

    loja_ids_int = [int(a.loja_id) for a in agregadas if a.loja_id.isdigit()]
    lojas_info = {}
    if loja_ids_int:
        lojas_db_list = db_lojas.query(LojaIntegracao).filter(LojaIntegracao.id.in_(loja_ids_int)).all()
        for l in lojas_db_list:
            lojas_info[str(l.id)] = l

    # 2. Votações e Votos
    votacoes = db_core.query(VotacaoRegional).filter(VotacaoRegional.regiao_id == regiao_id).all()
    total_votacoes = len(votacoes)
    votacao_ids = [v.id for v in votacoes]

    votos = db_core.query(VotoLoja).filter(VotoLoja.votacao_id.in_(votacao_ids)).all() if votacao_ids else []
    total_votos = len(votos)

    votos_por_loja = {}
    for v in votos:
        votos_por_loja[v.loja_id] = votos_por_loja.get(v.loja_id, 0) + 1

    quorum_medio = 0.0
    if total_votacoes > 0 and total_lojas > 0:
        quorum_medio = round((total_votos / (total_votacoes * total_lojas)) * 100, 1)

    # 3. Admissões (Mural de Prévias)
    previas = db_core.query(PreviaAdmissao).filter(
        PreviaAdmissao.regiao_id == regiao_id,
        PreviaAdmissao.deletado_visualmente == False
    ).all()
    total_admissoes = len(previas)
    admissoes_concluidas = sum(1 for p in previas if p.status in ["CONCLUIDO", "AVERIGUADO"])
    admissoes_andamento = sum(1 for p in previas if p.status == "EM_ANDAMENTO")

    previa_ids = [p.id for p in previas]
    total_consideracoes = db_core.query(ConsideracaoPrevia).filter(
        ConsideracaoPrevia.previa_id.in_(previa_ids),
        ConsideracaoPrevia.deletado_visualmente == False
    ).count() if previa_ids else 0

    # 4. Patrimônio e Cautelas
    itens_patrimonio = db_core.query(ItemPatrimonio).filter(
        ItemPatrimonio.regiao_id == regiao_id,
        ItemPatrimonio.deletado_visualmente == False
    ).all()
    total_ativos_patrimonio = sum(i.quantidade_total for i in itens_patrimonio)
    total_ativos_disponiveis = sum(i.quantidade_disponivel for i in itens_patrimonio)
    total_ativos_emprestados = total_ativos_patrimonio - total_ativos_disponiveis
    bens_solidarios_geral = sum(1 for i in itens_patrimonio if i.tipo_propriedade == "LOJA")

    hoje = date.today()
    emprestimos = db_core.query(EmprestimoPatrimonio).filter(EmprestimoPatrimonio.regiao_id == regiao_id).all()
    total_cautelas = len(emprestimos)
    cautelas_ativas = sum(1 for e in emprestimos if e.status in ["ATIVO", "ATRASADO"])
    cautelas_atrasadas = sum(1 for e in emprestimos if e.status != "CONCLUIDO" and e.data_prevista_devolucao < hoje)

    cautelas_ativas_por_loja = {}
    for e in emprestimos:
        if e.status in ["ATIVO", "ATRASADO"]:
            cautelas_ativas_por_loja[e.loja_solicitante_id] = cautelas_ativas_por_loja.get(e.loja_solicitante_id, 0) + 1

    bens_solidarios_por_loja = {}
    for i in itens_patrimonio:
        if i.tipo_propriedade == "LOJA" and i.loja_proprietaria_id:
            bens_solidarios_por_loja[i.loja_proprietaria_id] = bens_solidarios_por_loja.get(i.loja_proprietaria_id, 0) + 1

    # 5. Documentos Oficiais
    docs = db_core.query(DocumentoRegional).filter(
        DocumentoRegional.regiao_id == regiao_id,
        DocumentoRegional.deletado_visualmente == False
    ).all()
    total_documentos = len(docs)
    total_downloads = sum(d.downloads_count for d in docs)

    # 6. Distribuição por Rito
    contagem_ritos = {}
    for a in agregadas:
        info = lojas_info.get(a.loja_id)
        rito = (info.rito if info and info.rito else "REAA").strip()
        contagem_ritos[rito] = contagem_ritos.get(rito, 0) + 1

    distribuicao_ritos = [
        {
            "rito": rito,
            "quantidade": qtd,
            "percentual": round((qtd / total_lojas) * 100, 1) if total_lojas > 0 else 0
        }
        for rito, qtd in sorted(contagem_ritos.items(), key=lambda x: x[1], reverse=True)
    ]

    # 7. Ranking e Assiduidade das Lojas
    ranking_lojas = []
    for a in agregadas:
        info = lojas_info.get(a.loja_id)
        nome_loja = info.nome_loja if info else f"Loja {a.loja_id}"
        numero_loja = info.numero_loja if info else "S/N"
        rito_loja = info.rito if info and info.rito else "REAA"
        cidade_loja = info.cidade if info and info.cidade else "Anápolis"

        votos_computados = votos_por_loja.get(a.loja_id, 0)
        pct = round((votos_computados / total_votacoes * 100), 1) if total_votacoes > 0 else 100.0

        status_label = "Excelente" if pct >= 80 else ("Regular" if pct >= 50 else "Atenção")

        ranking_lojas.append({
            "id": a.loja_id,
            "nome": nome_loja,
            "numero": numero_loja,
            "rito": rito_loja,
            "cidade": cidade_loja,
            "votos_computados": votos_computados,
            "total_votacoes": total_votacoes,
            "percentual_participacao": pct,
            "status_label": status_label,
            "bens_solidarios_count": bens_solidarios_por_loja.get(a.loja_id, 0),
            "cautelas_ativas_count": cautelas_ativas_por_loja.get(a.loja_id, 0)
        })

    ranking_lojas.sort(key=lambda x: (x["percentual_participacao"], x["votos_computados"]), reverse=True)

    # Índice de Engajamento Regional (IER)
    taxa_admissoes = (admissoes_concluidas / total_admissoes * 100) if total_admissoes > 0 else 85.0
    taxa_patrimonio = (total_ativos_emprestados / total_ativos_patrimonio * 100) if total_ativos_patrimonio > 0 else 50.0
    ier = round((quorum_medio * 0.5) + (taxa_admissoes * 0.3) + (min(100.0, taxa_patrimonio * 2) * 0.2), 1)

    return {
        "conselho": {
            "id": regiao_id,
            "nome": conselho_nome,
            "total_lojas": total_lojas,
            "data_relatorio": date.today().strftime("%d/%m/%Y")
        },
        "kpis": {
            "total_lojas": total_lojas,
            "total_votacoes": total_votacoes,
            "total_votos_registrados": total_votos,
            "quorum_medio": quorum_medio,
            "total_admissoes": total_admissoes,
            "admissoes_concluidas": admissoes_concluidas,
            "admissoes_andamento": admissoes_andamento,
            "total_consideracoes": total_consideracoes,
            "total_ativos_patrimonio": total_ativos_patrimonio,
            "total_ativos_disponiveis": total_ativos_disponiveis,
            "total_ativos_emprestados": total_ativos_emprestados,
            "bens_solidarios_geral": bens_solidarios_geral,
            "total_cautelas": total_cautelas,
            "cautelas_ativas": cautelas_ativas,
            "cautelas_atrasadas": cautelas_atrasadas,
            "total_documentos": total_documentos,
            "total_downloads": total_downloads,
            "indice_engajamento_regional": ier
        },
        "distribuicao_ritos": distribuicao_ritos,
        "ranking_lojas": ranking_lojas
    }


@router.get("/{regiao_id}/relatorios/integrantes", summary="Lista nominal da Mesa Diretora e Veneráveis Mestres das Lojas")
def obter_relatorio_integrantes(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Retorna o Livro de Matrícula do Colegiado Regional:
    1. Mesa Diretora Executiva em exercício com mandatos e contatos.
    2. Relação das 17 Lojas Jurisdicionadas com seus Veneráveis Mestres e 1º Vigilantes/Suplentes.
    """
    from models.lojas_models import LojaIntegracao, Mandato, ObreiroIntegracao

    # 1. Região
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    # 2. Mesa Diretora
    diretoria_db = db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).all()
    user_ids = [d.usuario_id for d in diretoria_db if d.usuario_id]
    
    obreiros_map = {}
    if user_ids:
        obreiros = db_lojas.query(ObreiroIntegracao).filter(
            (ObreiroIntegracao.cim.in_(user_ids)) |
            (ObreiroIntegracao.cpf.in_(user_ids))
        ).all()
        for o in obreiros:
            obreiros_map[o.cim] = o
            if o.cpf:
                obreiros_map[o.cpf] = o
            obreiros_map[str(o.id)] = o

    ordem_cargos = {
        "PRESIDENTE": 1,
        "VICE_PRESIDENTE": 2,
        "SECRETARIO": 3,
        "TESOUREIRO": 4,
        "CHANCELER": 5,
        "HOSPITALEIRO": 6
    }

    mesa_diretora = []
    for d in diretoria_db:
        o = obreiros_map.get(d.usuario_id)
        cargo_str = d.cargo.value if hasattr(d.cargo, 'value') else str(d.cargo)
        cargo_formatado = cargo_str.replace("_", " ").title()
        
        mesa_diretora.append({
            "id": d.id,
            "cargo": cargo_formatado,
            "cargo_codigo": cargo_str,
            "usuario_id": d.usuario_id,
            "nome": o.nome_completo if o else f"Ir.'. {d.usuario_id}",
            "cim": o.cim if o else (d.usuario_id if d.usuario_id.isdigit() else "-"),
            "email": o.email if o else "secretaria@conselho.org.br",
            "telefone": o.telefone if o else "(62) 99999-0000",
            "inicio_mandato": d.inicio_mandato.strftime("%d/%m/%Y") if d.inicio_mandato else "-",
            "termino_mandato": d.termino_mandato.strftime("%d/%m/%Y") if d.termino_mandato else "-"
        })

    mesa_diretora.sort(key=lambda x: ordem_cargos.get(x["cargo_codigo"], 99))

    # 3. Lojas e seus Representantes (VM e Suplente)
    agregadas = db_core.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()

    loja_ids_int = [int(a.loja_id) for a in agregadas if a.loja_id.isdigit()]
    lojas_info = {}
    if loja_ids_int:
        lojas_db_list = db_lojas.query(LojaIntegracao).filter(LojaIntegracao.id.in_(loja_ids_int)).all()
        for l in lojas_db_list:
            lojas_info[str(l.id)] = l

    # Veneráveis Mestres (cargo_id = 1)
    vms_map = {}
    if loja_ids_int:
        mandatos_vm = db_lojas.query(Mandato.loja_id, ObreiroIntegracao).join(
            ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id
        ).filter(
            Mandato.loja_id.in_(loja_ids_int),
            Mandato.cargo_id == 1,
            Mandato.data_fim.is_(None)
        ).all()
        for loja_id, obreiro in mandatos_vm:
            vms_map[str(loja_id)] = obreiro

    # 1º Vigilantes (cargo_id = 2)
    vigilantes_map = {}
    if loja_ids_int:
        mandatos_vig = db_lojas.query(Mandato.loja_id, ObreiroIntegracao).join(
            ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id
        ).filter(
            Mandato.loja_id.in_(loja_ids_int),
            Mandato.cargo_id == 2,
            Mandato.data_fim.is_(None)
        ).all()
        for loja_id, obreiro in mandatos_vig:
            vigilantes_map[str(loja_id)] = obreiro

    # Suplentes cadastrados na tabela SuplenteConselho
    suplentes_conselho_map = {}
    suplentes_db = db_core.query(SuplenteConselho).all()
    for s in suplentes_db:
        suplentes_conselho_map[s.loja_id] = s

    quadro_lojas = []
    for a in agregadas:
        info = lojas_info.get(a.loja_id)
        nome_loja = info.nome_loja if info else f"Loja {a.loja_id}"
        numero_loja = info.numero_loja if info else "S/N"
        rito_loja = info.rito if info and info.rito else "REAA"
        cidade_loja = info.cidade if info and info.cidade else "Anápolis"

        vm_obreiro = vms_map.get(a.loja_id)
        suplente_cons = suplentes_conselho_map.get(a.loja_id)
        vigilante_obreiro = vigilantes_map.get(a.loja_id)

        vm_nome = vm_obreiro.nome_completo if vm_obreiro else f"Ir.'. Venerável Mestre ({a.loja_id})"
        vm_cim = vm_obreiro.cim if vm_obreiro else "-"
        vm_email = vm_obreiro.email if vm_obreiro else f"vm.loja{numero_loja}@corevm.org.br"
        vm_telefone = vm_obreiro.telefone if vm_obreiro else "(62) 99999-1234"

        if suplente_cons:
            suplente_nome = suplente_cons.nome_suplente
            suplente_email = suplente_cons.email_suplente or "-"
            suplente_telefone = "-"
        elif vigilante_obreiro:
            suplente_nome = f"{vigilante_obreiro.nome_completo} (1º Vig.)"
            suplente_email = vigilante_obreiro.email or "-"
            suplente_telefone = vigilante_obreiro.telefone or "-"
        else:
            suplente_nome = "1º Vigilante em Exercício"
            suplente_email = "-"
            suplente_telefone = "-"

        quadro_lojas.append({
            "loja_id": a.loja_id,
            "nome": nome_loja,
            "numero": numero_loja,
            "rito": rito_loja,
            "cidade": cidade_loja,
            "data_filiacao": a.data_filiacao.strftime("%d/%m/%Y") if a.data_filiacao else "01/01/2024",
            "status": "Regular / Ativa",
            "vm_nome": vm_nome,
            "vm_cim": vm_cim,
            "vm_email": vm_email,
            "vm_telefone": vm_telefone,
            "suplente_nome": suplente_nome,
            "suplente_email": suplente_email,
            "suplente_telefone": suplente_telefone
        })

    quadro_lojas.sort(key=lambda x: int(x["numero"]) if x["numero"].isdigit() else 99999)

    return {
        "conselho_nome": conselho_nome,
        "regiao_id": regiao_id,
        "data_atualizacao": date.today().strftime("%d/%m/%Y"),
        "mesa_diretora": mesa_diretora,
        "lojas": quadro_lojas
    }


@router.get("/{regiao_id}/relatorios/patrimonio", summary="Inventário patrimonial analítico e balanço de comodatos")
def obter_relatorio_patrimonio(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    """
    Retorna o inventário detalhado de todos os bens tombados do Conselho e da Rede Solidária,
    além de todos os termos de cautela/comodatos ativos, devolvidos e pendências.
    """
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    # Bens
    itens = db_core.query(ItemPatrimonio).filter(
        ItemPatrimonio.regiao_id == regiao_id,
        ItemPatrimonio.deletado_visualmente == False
    ).order_by(ItemPatrimonio.categoria.asc(), ItemPatrimonio.nome.asc()).all()

    total_ativos = sum(i.quantidade_total for i in itens)
    total_disponiveis = sum(i.quantidade_disponivel for i in itens)
    total_emprestados = total_ativos - total_disponiveis
    bens_core = sum(1 for i in itens if i.tipo_propriedade == "CONSELHO")
    bens_rede = sum(1 for i in itens if i.tipo_propriedade == "LOJA")

    lista_itens = []
    for item in itens:
        lista_itens.append({
            "id": item.id,
            "codigo_tombamento": item.codigo_tombamento,
            "nome": item.nome,
            "descricao": item.descricao or "",
            "categoria": item.categoria,
            "tipo_propriedade": item.tipo_propriedade,
            "loja_proprietaria_nome": item.loja_proprietaria_nome or "Conselho Regional",
            "quantidade_total": item.quantidade_total,
            "quantidade_disponivel": item.quantidade_disponivel,
            "quantidade_emprestada": item.quantidade_total - item.quantidade_disponivel,
            "localizacao_fisica": item.localizacao_fisica,
            "estado_conservacao": item.estado_conservacao,
            "permite_emprestimo": item.permite_emprestimo,
            "permite_locacao": item.permite_locacao,
            "taxa_locacao_estimada": item.taxa_locacao_estimada or 0.0
        })

    # Cautelas
    hoje = date.today()
    emprestimos = db_core.query(EmprestimoPatrimonio).filter(
        EmprestimoPatrimonio.regiao_id == regiao_id
    ).order_by(EmprestimoPatrimonio.data_retirada.desc()).all()

    total_cautelas = len(emprestimos)
    cautelas_ativas = 0
    cautelas_atrasadas = 0
    lista_emprestimos = []

    for emp in emprestimos:
        is_atrasado = emp.status != "CONCLUIDO" and emp.data_prevista_devolucao < hoje
        if emp.status in ["ATIVO", "ATRASADO"]:
            cautelas_ativas += 1
        if is_atrasado:
            cautelas_atrasadas += 1

        status_calc = "ATRASADO" if is_atrasado else emp.status

        lista_emprestimos.append({
            "id": emp.id,
            "item_nome": emp.item.nome if emp.item else "Ativo",
            "item_codigo": emp.item.codigo_tombamento if emp.item else "-",
            "item_categoria": emp.item.categoria if emp.item else "-",
            "loja_solicitante_nome": emp.loja_solicitante_nome,
            "loja_solicitante_numero": emp.loja_solicitante_numero,
            "beneficiario_final": emp.beneficiario_final or "Beneficiário",
            "responsavel_retirada_nome": emp.responsavel_retirada_nome,
            "responsavel_retirada_cargo": emp.responsavel_retirada_cargo or "Representante",
            "responsavel_retirada_contato": emp.responsavel_retirada_contato or "",
            "responsavel_entrega_nome": emp.responsavel_entrega_nome,
            "data_retirada": emp.data_retirada.strftime("%d/%m/%Y"),
            "data_prevista_devolucao": emp.data_prevista_devolucao.strftime("%d/%m/%Y"),
            "data_efetiva_devolucao": emp.data_efetiva_devolucao.strftime("%d/%m/%Y") if emp.data_efetiva_devolucao else None,
            "quantidade": emp.quantidade,
            "status": status_calc,
            "atrasado": is_atrasado,
            "observacoes": emp.observacoes or ""
        })

    return {
        "conselho_nome": conselho_nome,
        "regiao_id": regiao_id,
        "data_balanco": date.today().strftime("%d/%m/%Y"),
        "resumo": {
            "total_itens_cadastrados": len(itens),
            "total_unidades_acervo": total_ativos,
            "unidades_disponiveis": total_disponiveis,
            "unidades_em_uso": total_emprestados,
            "taxa_ocupacao": round((total_emprestados / total_ativos * 100), 1) if total_ativos > 0 else 0.0,
            "itens_conselho": bens_core,
            "itens_rede_solidaria": bens_rede,
            "total_cautelas_historico": total_cautelas,
            "cautelas_ativas": cautelas_ativas,
            "cautelas_atrasadas": cautelas_atrasadas
        },
        "itens": lista_itens,
        "emprestimos": lista_emprestimos
    }


@router.get("/{regiao_id}/relatorios/exportar-pdf", summary="Exporta relatório oficial em PDF via ReportLab")
def exportar_relatorio_pdf(
    regiao_id: str,
    tipo: str = "executivo", # executivo, integrantes, patrimonio
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Gera e faz o download imediato de PDF canônico para auditoria e prestação de contas.
    Tipos suportados: executivo, integrantes, patrimonio.
    """
    tipo_limpo = tipo.lower().strip()
    if tipo_limpo not in ["executivo", "integrantes", "patrimonio"]:
        raise HTTPException(status_code=400, detail="Tipo de relatório inválido. Escolha entre: executivo, integrantes, patrimonio.")

    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres de Anápolis e Região"

    diretorio_relatorios = os.path.join("uploads", "relatorios", regiao_id)
    os.makedirs(diretorio_relatorios, exist_ok=True)
    caminho_pdf = os.path.join(diretorio_relatorios, f"Relatorio_{tipo_limpo}_{date.today().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}.pdf")

    if tipo_limpo == "executivo":
        dados = obter_relatorio_consolidado(regiao_id=regiao_id, user=user, db_core=db_core, db_lojas=db_lojas)
        gerar_pdf_relatorio_executivo(
            caminho_saida=caminho_pdf,
            conselho_nome=conselho_nome,
            stats=dados["kpis"],
            ranking_lojas=dados["ranking_lojas"]
        )
        nome_download = f"Relatorio_Executivo_Conselho_{date.today().strftime('%d-%m-%Y')}.pdf"

    elif tipo_limpo == "integrantes":
        dados = obter_relatorio_integrantes(regiao_id=regiao_id, user=user, db_core=db_core, db_lojas=db_lojas)
        gerar_pdf_relatorio_integrantes(
            caminho_saida=caminho_pdf,
            conselho_nome=conselho_nome,
            diretoria=dados["mesa_diretora"],
            lojas_vms=dados["lojas"]
        )
        nome_download = f"Quadro_Integrantes_Conselho_{date.today().strftime('%d-%m-%Y')}.pdf"

    elif tipo_limpo == "patrimonio":
        dados = obter_relatorio_patrimonio(regiao_id=regiao_id, user=user, db_core=db_core)
        gerar_pdf_relatorio_patrimonio(
            caminho_saida=caminho_pdf,
            conselho_nome=conselho_nome,
            itens_patrimonio=dados["itens"],
            emprestimos_ativos=[e for e in dados["emprestimos"] if e["status"] in ["ATIVO", "ATRASADO"]]
        )
        nome_download = f"Balanco_Patrimonial_Conselho_{date.today().strftime('%d-%m-%Y')}.pdf"

    return FileResponse(
        path=caminho_pdf,
        filename=nome_download,
        media_type="application/pdf"
    )


# ==============================================================================
# MÓDULO 10: COMUNICAÇÃO INTERNA & INTER-LOJAS (CANAL RESTRITO)
# ==============================================================================

class TopicoCriarPayload(BaseModel):
    assunto: str
    categoria: str = "ADMINISTRATIVO" # ADMINISTRATIVO, FINANCEIRO, LITURGICO, INTER_LOJAS, SINDICANCIA_CONFIDENCIAL, PROTOCOLO
    tipo_alcance: str = "CONSELHO_LOJA" # CONSELHO_LOJA, LOJA_LOJA, CIRCULAR
    loja_origem_id: Optional[str] = None
    loja_origem_nome: Optional[str] = None
    loja_origem_numero: Optional[str] = None
    loja_destino_id: Optional[str] = None
    loja_destino_nome: Optional[str] = None
    loja_destino_numero: Optional[str] = None
    prioridade: str = "NORMAL" # NORMAL, URGENTE, CONFIDENCIAL
    mensagem_inicial: str
    arquivo_url: Optional[str] = None
    arquivo_nome: Optional[str] = None

class MensagemCriarPayload(BaseModel):
    conteudo: str
    arquivo_url: Optional[str] = None
    arquivo_nome: Optional[str] = None

class TopicoStatusPayload(BaseModel):
    status: str # ABERTA, RESPONDIDA, CONCLUIDA, ARQUIVADA


@router.get("/{regiao_id}/comunicacao/estatisticas", summary="Estatísticas da Central de Comunicação Interna")
def obter_estatisticas_comunicacao(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    """
    Retorna totalizadores e contadores de mensagens não lidas conforme o perfil do usuário.
    """
    query = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False
    )

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    user_loja = user.loja_id

    if not is_diretoria:
        query = query.filter(
            (TopicoComunicacao.tipo_alcance == "CIRCULAR") |
            (TopicoComunicacao.loja_origem_id == user_loja) |
            (TopicoComunicacao.loja_destino_id == user_loja)
        )

    topicos = query.all()
    topico_ids = [t.id for t in topicos]

    total_topicos = len(topicos)
    topicos_abertos = sum(1 for t in topicos if t.status in ["ABERTA", "RESPONDIDA"])
    topicos_concluidos = sum(1 for t in topicos if t.status == "CONCLUIDA")
    inter_lojas_total = sum(1 for t in topicos if t.tipo_alcance == "LOJA_LOJA")
    circulares_total = sum(1 for t in topicos if t.tipo_alcance == "CIRCULAR")
    conselho_loja_total = sum(1 for t in topicos if t.tipo_alcance == "CONSELHO_LOJA")

    # Mensagens não lidas
    mensagens_nao_lidas = 0
    if topico_ids:
        msg_query = db_core.query(MensagemComunicacao).filter(
            MensagemComunicacao.topico_id.in_(topico_ids),
            MensagemComunicacao.lida == False,
            MensagemComunicacao.deletado_visualmente == False,
            MensagemComunicacao.remetente_id != user.usuario_id
        )
        mensagens_nao_lidas = msg_query.count()

    return {
        "total_topicos": total_topicos,
        "topicos_abertos": topicos_abertos,
        "topicos_concluidos": topicos_concluidos,
        "inter_lojas_total": inter_lojas_total,
        "circulares_total": circulares_total,
        "conselho_loja_total": conselho_loja_total,
        "mensagens_nao_lidas": mensagens_nao_lidas
    }


@router.get("/{regiao_id}/comunicacao/topicos", summary="Lista tópicos de correspondência oficial com filtros e sigilo")
def listar_topicos_comunicacao(
    regiao_id: str,
    categoria: Optional[str] = None,
    status: Optional[str] = None,
    tipo_alcance: Optional[str] = None,
    busca: Optional[str] = None,
    loja_id: Optional[str] = None,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    """
    Lista os tópicos de comunicação respeitando estritamente o sigilo e isolamento entre lojas.
    """
    query = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False
    )

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    user_loja = user.loja_id

    # Regra de Ouro do Sigilo Maçônico
    if not is_diretoria:
        query = query.filter(
            (TopicoComunicacao.tipo_alcance == "CIRCULAR") |
            (TopicoComunicacao.loja_origem_id == user_loja) |
            (TopicoComunicacao.loja_destino_id == user_loja)
        )

    # Filtros
    if categoria and categoria.upper() != "TODAS":
        query = query.filter(TopicoComunicacao.categoria == categoria.upper())

    if status and status.upper() != "TODOS":
        query = query.filter(TopicoComunicacao.status == status.upper())

    if tipo_alcance and tipo_alcance.upper() != "TODOS":
        query = query.filter(TopicoComunicacao.tipo_alcance == tipo_alcance.upper())

    if loja_id:
        query = query.filter(
            (TopicoComunicacao.loja_origem_id == loja_id) |
            (TopicoComunicacao.loja_destino_id == loja_id)
        )

    if busca:
        termo = f"%{busca.strip()}%"
        query = query.filter(
            (TopicoComunicacao.assunto.ilike(termo)) |
            (TopicoComunicacao.loja_origem_nome.ilike(termo)) |
            (TopicoComunicacao.loja_destino_nome.ilike(termo)) |
            (TopicoComunicacao.criado_por_nome.ilike(termo))
        )

    topicos = query.order_by(TopicoComunicacao.data_ultima_mensagem.desc()).all()

    resultado = []
    for t in topicos:
        total_msgs = len(t.mensagens)
        ultima_msg = t.mensagens[-1] if total_msgs > 0 else None

        nao_lidas = sum(
            1 for m in t.mensagens 
            if not m.lida and m.remetente_id != user.usuario_id
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
            "ultimo_remetente_tipo": ultima_msg.tipo_remetente if ultima_msg else ""
        })

    return resultado


@router.post("/{regiao_id}/comunicacao/topicos", summary="Cria novo tópico de comunicação ou prancha oficial")
def criar_topico_comunicacao(
    regiao_id: str,
    payload: TopicoCriarPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Abre um novo tópico/prancha (Conselho ↔ Loja, Inter-Lojas ou Circular Regional).
    """
    from models.lojas_models import LojaIntegracao, ObreiroIntegracao

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    tipo = payload.tipo_alcance.upper()

    if tipo == "CIRCULAR" and not is_diretoria:
        raise HTTPException(status_code=403, detail="Apenas a Diretoria do Conselho pode emitir Pranchas Circulares Gerais.")

    if tipo == "LOJA_LOJA" and not payload.loja_destino_id:
        raise HTTPException(status_code=400, detail="Para canal restrito Inter-Lojas é obrigatório indicar a Loja de Destino.")

    # Resolver nome do autor
    autor_nome = f"Ir.'. {user.usuario_id}"
    autor_cargo = user.role
    obreiro = db_lojas.query(ObreiroIntegracao).filter(
        (ObreiroIntegracao.cim == user.usuario_id) | 
        (ObreiroIntegracao.cpf == user.usuario_id) |
        (ObreiroIntegracao.id == int(user.usuario_id) if user.usuario_id.isdigit() else False)
    ).first()
    if obreiro:
        autor_nome = obreiro.nome_completo

    # Resolver dados das Lojas
    origem_id = payload.loja_origem_id or user.loja_id
    origem_nome = payload.loja_origem_nome
    origem_num = payload.loja_origem_numero

    if origem_id and (not origem_nome or not origem_num):
        loja_orig = db_lojas.query(LojaIntegracao).filter(LojaIntegracao.id == int(origem_id) if origem_id.isdigit() else False).first()
        if loja_orig:
            origem_nome = loja_orig.nome_loja
            origem_num = loja_orig.numero_loja

    destino_id = payload.loja_destino_id
    destino_nome = payload.loja_destino_nome
    destino_num = payload.loja_destino_numero

    if destino_id and (not destino_nome or not destino_num):
        loja_dest = db_lojas.query(LojaIntegracao).filter(LojaIntegracao.id == int(destino_id) if destino_id.isdigit() else False).first()
        if loja_dest:
            destino_nome = loja_dest.nome_loja
            destino_num = loja_dest.numero_loja

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
        data_ultima_mensagem=datetime.utcnow()
    )

    db_core.add(novo_topico)
    db_core.commit()
    db_core.refresh(novo_topico)

    # Criação da primeira mensagem / prancha inicial
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
        lida=True, # Lida pelo próprio autor
        data_leitura=datetime.utcnow(),
        lida_por_nome=autor_nome
    )

    db_core.add(msg_inicial)
    db_core.commit()

    return {
        "status": "success",
        "topico_id": novo_topico.id,
        "assunto": novo_topico.assunto,
        "tipo_alcance": novo_topico.tipo_alcance,
        "message": "Tópico de comunicação aberto e prancha inicial protocolada com sucesso."
    }


@router.get("/{regiao_id}/comunicacao/topicos/{topico_id}", summary="Obtém detalhes do tópico com mensagens e marca leitura")
def obter_topico_comunicacao(
    regiao_id: str,
    topico_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Retorna o histórico cronológico de mensagens e marca automaticamente como vistas.
    """
    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico de comunicação não encontrado.")

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    user_loja = user.loja_id

    # Validação de Sigilo
    if not is_diretoria:
        pode_acessar = (
            topico.tipo_alcance == "CIRCULAR" or
            topico.loja_origem_id == user_loja or
            topico.loja_destino_id == user_loja
        )
        if not pode_acessar:
            raise HTTPException(status_code=403, detail="Acesso restrito: Você não tem permissão para acessar esta correspondência privada.")

    # Resolver nome do leitor
    leitor_nome = f"Ir.'. {user.usuario_id}"
    if is_diretoria:
        leitor_nome = f"{user.role} Regional"
    elif user_loja:
        leitor_nome = f"Venerável Mestre (Loja {user_loja})"

    # Marcar mensagens como lidas
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
            "sou_autor": m.remetente_id == user.usuario_id
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
        "mensagens": mensagens_formatadas
    }


@router.post("/{regiao_id}/comunicacao/topicos/{topico_id}/mensagens", summary="Envia nova resposta ou prancha no tópico")
def enviar_mensagem_comunicacao(
    regiao_id: str,
    topico_id: str,
    payload: MensagemCriarPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Envia uma nova réplica oficial dentro do canal.
    """
    from models.lojas_models import ObreiroIntegracao

    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id,
        TopicoComunicacao.deletado_visualmente == False
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    user_loja = user.loja_id

    # Checagem de permissão
    if not is_diretoria:
        pode_enviar = (
            topico.tipo_alcance == "CIRCULAR" or
            topico.loja_origem_id == user_loja or
            topico.loja_destino_id == user_loja
        )
        if not pode_enviar:
            raise HTTPException(status_code=403, detail="Sem permissão para responder neste canal restrito.")

    autor_nome = f"Ir.'. {user.usuario_id}"
    autor_cargo = user.role
    obreiro = db_lojas.query(ObreiroIntegracao).filter(
        (ObreiroIntegracao.cim == user.usuario_id) | 
        (ObreiroIntegracao.cpf == user.usuario_id) |
        (ObreiroIntegracao.id == int(user.usuario_id) if user.usuario_id.isdigit() else False)
    ).first()
    if obreiro:
        autor_nome = obreiro.nome_completo

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
        lida=False
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
        "message": "Prancha enviada com sucesso."
    }


@router.post("/{regiao_id}/comunicacao/topicos/{topico_id}/upload", summary="Envia resposta com upload físico de anexo")
def upload_anexo_comunicacao(
    regiao_id: str,
    topico_id: str,
    conteudo: str = Form(...),
    arquivo: UploadFile = File(...),
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
):
    """
    Envia resposta com arquivo físico anexado.
    """
    from models.lojas_models import ObreiroIntegracao

    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    user_loja = user.loja_id

    if not is_diretoria:
        pode_enviar = (
            topico.tipo_alcance == "CIRCULAR" or
            topico.loja_origem_id == user_loja or
            topico.loja_destino_id == user_loja
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

    autor_nome = f"Ir.'. {user.usuario_id}"
    autor_cargo = user.role
    obreiro = db_lojas.query(ObreiroIntegracao).filter(
        (ObreiroIntegracao.cim == user.usuario_id) | 
        (ObreiroIntegracao.cpf == user.usuario_id) |
        (ObreiroIntegracao.id == int(user.usuario_id) if user.usuario_id.isdigit() else False)
    ).first()
    if obreiro:
        autor_nome = obreiro.nome_completo

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
        lida=False
    )

    topico.data_ultima_mensagem = datetime.utcnow()
    db_core.add(nova_msg)
    db_core.commit()

    return {
        "status": "success",
        "mensagem_id": nova_msg.id,
        "arquivo_nome": arquivo.filename,
        "message": "Prancha e anexo protocolados com sucesso."
    }


@router.put("/{regiao_id}/comunicacao/topicos/{topico_id}/status", summary="Altera status do chamado/prancha")
def atualizar_status_topico(
    regiao_id: str,
    topico_id: str,
    payload: TopicoStatusPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core)
):
    topico = db_core.query(TopicoComunicacao).filter(
        TopicoComunicacao.id == topico_id,
        TopicoComunicacao.regiao_id == regiao_id
    ).first()

    if not topico:
        raise HTTPException(status_code=404, detail="Tópico não encontrado.")

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
    db_core: Session = Depends(get_db_core)
):
    """
    Gera a prancha canônica individual com timbre e assinaturas para arquivo formal.
    """
    msg = db_core.query(MensagemComunicacao).filter(
        MensagemComunicacao.id == mensagem_id,
        MensagemComunicacao.deletado_visualmente == False
    ).first()

    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada.")

    topico = msg.topico
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    # Resolver entidades
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
        conselho_nome=conselho_nome
    )

    return FileResponse(
        path=caminho_pdf,
        filename=f"Prancha_Oficial_{msg.id[:8]}.pdf",
        media_type="application/pdf"
    )

