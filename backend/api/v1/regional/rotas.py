# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from loguru import logger
from typing import List, Optional
from datetime import date, timedelta
from pydantic import BaseModel

from database import get_db_core, get_db_lojas
from models.models import Regiao, DiretoriaConselho, LojaAgregada, AvisoRegional
from models.lojas_models import ObreiroIntegracao
from core.constants import CargoConselho
from schemas.schemas import RegiaoResponse, DiretoriaMembroResponse, DiretoriaUpdatePayload
from core.dependencies import get_current_director, get_current_regional_user, RegionalUserContext

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
        "regiao_id": user.regiao_id
    }

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


