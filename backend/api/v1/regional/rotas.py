# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import os
import shutil
import uuid
from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from loguru import logger
from pydantic import BaseModel

from database import get_db_core, get_db_lojas
from models.models import Regiao, DiretoriaConselho, LojaAgregada, AvisoRegional, PreviaAdmissao, ConsideracaoPrevia
from models.lojas_models import ObreiroIntegracao
from core.constants import CargoConselho
from schemas.schemas import RegiaoResponse, DiretoriaMembroResponse, DiretoriaUpdatePayload
from core.dependencies import get_current_director, get_current_regional_user, RegionalUserContext
from utils.pdf_generator import gerar_pdf_previa

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
            "status": p.status,
            "autor_id": p.autor_id,
            "autor_nome": p.autor_nome,
            "total_consideracoes": len(cons_ativas),
            "pode_editar": pode_editar,
            "pode_considerar": True
        })

    return resultado

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



