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
    Regiao, DiretoriaConselho, LojaAgregada, AvisoRegional, 
    PreviaAdmissao, ConsideracaoPrevia, VotacaoRegional, VotoLoja,
    ItemPatrimonio, EmprestimoPatrimonio, FilaEsperaPatrimonio,
    DocumentoRegional
)
from models.lojas_models import ObreiroIntegracao, LojaIntegracao
from core.constants import CargoConselho
from schemas.schemas import RegiaoResponse, DiretoriaMembroResponse, DiretoriaUpdatePayload
from core.dependencies import get_current_director, get_current_regional_user, RegionalUserContext
from utils.pdf_generator import gerar_pdf_previa, gerar_pdf_documento_regional

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

    resultado = []
    for a in agregadas:
        info = lojas_info.get(a.loja_id)
        resultado.append({
            "id": a.loja_id,
            "nome": info.nome_loja if info else f"Loja {a.loja_id}",
            "numero": info.numero_loja if info else "S/N",
            "rito": info.rito if info else None,
            "cidade": info.cidade if info else None,
            "ativa": a.ativa
        })

    resultado.sort(key=lambda x: int(x["numero"]) if x["numero"] and x["numero"].isdigit() else 999999)
    return {"lojas": resultado}

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

