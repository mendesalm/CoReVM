# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Módulo de Prévias de Admissão e Votações/Deliberações Regionais.
Isolado com arquitetura API-First: zero acesso direto a lojas_db.
"""
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

from database import get_db_core
from models.models import (
    PreviaAdmissao, ConsideracaoPrevia, VotacaoRegional, VotoLoja, LojaAgregada
)
from core.dependencies import (
    get_current_regional_user, RegionalUserContext,
    obter_identidade_regional_ou_operador_administrativo, OperadorAdministrativoContext
)
from utils.pdf_generator import gerar_pdf_previa
from core.lojas_cliente import LojasApiClient

router = APIRouter()

UPLOADS_ADMISSOES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "uploads", "admissoes"
)
os.makedirs(UPLOADS_ADMISSOES_DIR, exist_ok=True)


# ==============================================================================
# SCHEMAS DE ENTRADA
# ==============================================================================

class PreviaCreatePayload(BaseModel):
    tipo: str  # INICIACAO, REGULARIZACAO, FILIACAO
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


class StatusUpdatePayload(BaseModel):
    status: str  # EM_ANDAMENTO, AVERIGUADO, CONCLUIDO
    observacao: Optional[str] = None


class VotacaoCreatePayload(BaseModel):
    titulo: str
    descricao: str
    tipo: Optional[str] = "DELIBERACAO"  # DELIBERACAO, CONSULTA
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
    status: str  # EM_ANDAMENTO, ENCERRADA


# ==============================================================================
# PRÉVIAS DE ADMISSÃO E CONSIDERAÇÕES
# ==============================================================================

@router.get("/{regiao_id}/admissoes", summary="Lista prévias de admissão do conselho")
def listar_previas_admissao(
    regiao_id: str,
    loja_id: Optional[str] = None,
    user = Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core)
):
    """
    Retorna as prévias de admissão (Iniciação, Filiação, Regularização) ativas no conselho.
    Para o Operador Administrativo, a listagem é restrita à própria Loja.
    """
    query = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.regiao_id == regiao_id,
        PreviaAdmissao.deletado_visualmente == False
    )
    is_operador = isinstance(user, OperadorAdministrativoContext)
    if is_operador:
        query = query.filter(PreviaAdmissao.loja_id == str(user.loja_id))

    if loja_id:
        query = query.filter(PreviaAdmissao.loja_id == str(loja_id))

    previas = query.order_by(PreviaAdmissao.data_postagem.desc()).all()

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
            "pode_considerar": not is_operador
        })

    return resultado


@router.put("/{regiao_id}/admissoes/{previa_id}/status", summary="Atualiza o status de verificação da prévia")
def atualizar_status_previa(
    regiao_id: str,
    previa_id: str,
    payload: StatusUpdatePayload,
    user = Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core)
):
    previa = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.id == previa_id,
        PreviaAdmissao.regiao_id == regiao_id
    ).first()
    if not previa:
        raise HTTPException(status_code=404, detail="Prévia não encontrada.")

    if isinstance(user, OperadorAdministrativoContext) and str(user.loja_id) != str(previa.loja_id):
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode atualizar o status de prévias de sua própria Loja.")

    novo_status = payload.status.upper()
    previa.status = novo_status

    if novo_status in ["AVERIGUADO", "CONCLUIDO"]:
        if user.is_diretoria:
            previa.verificado_por_nome = f"Mesa Diretora ({user.role})"
        elif isinstance(user, OperadorAdministrativoContext):
            previa.verificado_por_nome = f"Operador Administrativo ({user.slot.capitalize()}) da Loja {user.loja_id}"
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
    user = Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core)
):
    if isinstance(user, OperadorAdministrativoContext) and str(loja_id) != str(user.loja_id):
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode criar prévia de admissão para a própria Loja.")

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
    user = Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core)
):
    if isinstance(user, OperadorAdministrativoContext) and str(payload.loja_id) != str(user.loja_id):
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode criar prévia de admissão para a própria Loja.")

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
    user = Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core)
):
    previa = db.query(PreviaAdmissao).filter(
        PreviaAdmissao.id == previa_id,
        PreviaAdmissao.regiao_id == regiao_id
    ).first()
    if not previa:
        raise HTTPException(status_code=404, detail="Prévia não encontrada.")

    if isinstance(user, OperadorAdministrativoContext) and str(user.loja_id) != str(previa.loja_id):
        raise HTTPException(status_code=403, detail="Permissão negada. Você só pode ver considerações de prévias de sua própria Loja.")

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
    db: Session = Depends(get_db_core)
):
    previa = db.query(PreviaAdmissao).filter(
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
    db.add(nova_consideracao)
    db.commit()
    db.refresh(nova_consideracao)

    return {"status": "success", "consideracao_id": nova_consideracao.id, "message": "Consideração registrada com sucesso."}


@router.delete("/{regiao_id}/admissoes/{previa_id}", summary="Remove ou oculta visualmente uma prévia")
def excluir_previa_admissao(
    regiao_id: str,
    previa_id: str,
    hard_delete: bool = False,
    user = Depends(obter_identidade_regional_ou_operador_administrativo),
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


# ==============================================================================
# ENQUETES E VOTAÇÕES (DELIBERAÇÕES FORMAIS DO CONSELHO)
# ==============================================================================

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
    db_core: Session = Depends(get_db_core)
):
    votacao = db_core.query(VotacaoRegional).filter(
        VotacaoRegional.id == votacao_id,
        VotacaoRegional.regiao_id == regiao_id
    ).first()
    if not votacao:
        raise HTTPException(status_code=404, detail="Votação não encontrada.")

    if votacao.status != "EM_ANDAMENTO":
        raise HTTPException(status_code=400, detail="Esta votação já está encerrada.")

    loja_id_final = payload.loja_id or (str(user.loja_id) if user.loja_id else None)
    if not loja_id_final:
        loja_id_final = "DIRETORIA"

    loja_nome_final = payload.loja_nome
    loja_numero_final = payload.loja_numero

    if not loja_nome_final:
        if loja_id_final.isdigit():
            try:
                lojas_info = LojasApiClient.buscar_lojas_multiplas([int(loja_id_final)])
                if lojas_info:
                    loja_nome_final = lojas_info[0].get("nome_loja")
                    loja_numero_final = str(lojas_info[0].get("numero_loja") or "S/N")
            except Exception as e:
                logger.warning(f"Erro ao buscar detalhes da loja via LojasApiClient: {e}")
        if not loja_nome_final:
            loja_nome_final = f"Loja Jurisdicionada {loja_id_final}"
            loja_numero_final = "S/N"

    voto_existente = db_core.query(VotoLoja).filter(
        VotoLoja.votacao_id == votacao_id,
        VotoLoja.loja_id == str(loja_id_final)
    ).first()

    if voto_existente:
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
