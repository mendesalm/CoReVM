# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import os
import uuid
import json
import tempfile
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from loguru import logger

from database import get_db_core
from models.models import TemplateRelatorio
from utils.template_renderer import (
    renderizar_template, html_para_pdf, docx_para_html,
    get_variaveis_por_tipo, get_templates_padrao, formatar_data_br
)

router = APIRouter()

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "uploads", "templates")
os.makedirs(UPLOADS_DIR, exist_ok=True)


# ─── SCHEMAS ────────────────────────────────────────────────────────────────

class TemplateCriarPayload(BaseModel):
    nome: str
    tipo: str = "livre"
    descricao: Optional[str] = None
    conteudo_html: str


class TemplateAtualizarPayload(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    descricao: Optional[str] = None
    conteudo_html: Optional[str] = None
    ativo: Optional[bool] = None


class TemplateRenderizarPayload(BaseModel):
    variaveis: dict = {}


# ─── MIDDLEWARE: apenas superadmin ─────────────────────────────────────────

def _verificar_superadmin(x_user_id: str = Header(...)):
    if x_user_id not in ["superadmin", "admin", "9999"]:
        raise HTTPException(status_code=403, detail="Acesso restrito ao SuperAdmin.")
    return x_user_id


# ─── ROTAS: CRUD DE TEMPLATES ──────────────────────────────────────────────

@router.get("/templates", summary="Lista todos os templates")
def listar_templates(
    tipo: Optional[str] = None,
    db: Session = Depends(get_db_core),
    _user: str = Depends(_verificar_superadmin)
):
    query = db.query(TemplateRelatorio)
    if tipo:
        query = query.filter(TemplateRelatorio.tipo == tipo)
    templates = query.order_by(TemplateRelatorio.criado_em.desc()).all()
    return [
        {
            "id": t.id, "nome": t.nome, "tipo": t.tipo, "descricao": t.descricao,
            "ativo": t.ativo, "criado_em": t.criado_em, "atualizado_em": t.atualizado_em,
            "criado_por": t.criado_por,
            "tamanho_html": len(t.conteudo_html) if t.conteudo_html else 0,
        }
        for t in templates
    ]


@router.get("/templates/tipos", summary="Retorna tipos e variáveis disponíveis")
def listar_tipos():
    from utils.template_renderer import VARIAVEIS_POR_TIPO
    return {
        "tipos": list(VARIAVEIS_POR_TIPO.keys()),
        "variaveis": VARIAVEIS_POR_TIPO,
    }


@router.get("/templates/padrao", summary="Lista templates padrão (biblioteca base)")
def listar_templates_padrao():
    """Retorna os templates padrão incluídos no sistema para importação."""
    tpls = get_templates_padrao()
    return [{"nome": t["nome"], "tipo": t["tipo"], "descricao": t["descricao"]} for t in tpls]


@router.post("/templates/importar-padrao/{indice}", summary="Importa um template padrão para o banco")
def importar_template_padrao(
    indice: int,
    db: Session = Depends(get_db_core),
    user_id: str = Depends(_verificar_superadmin)
):
    tpls = get_templates_padrao()
    if indice < 0 or indice >= len(tpls):
        raise HTTPException(status_code=404, detail="Template padrão não encontrado.")

    tpl_data = tpls[indice]
    from utils.template_renderer import get_variaveis_por_tipo
    variaveis = get_variaveis_por_tipo(tpl_data["tipo"])

    novo = TemplateRelatorio(
        nome=tpl_data["nome"],
        tipo=tpl_data["tipo"],
        descricao=tpl_data["descricao"],
        conteudo_html=tpl_data["conteudo_html"],
        variaveis_disponiveis=json.dumps(variaveis, ensure_ascii=False),
        criado_por=user_id,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    logger.info(f"[TEMPLATES] Template padrão '{novo.nome}' importado por {user_id}")
    return {"id": novo.id, "nome": novo.nome, "tipo": novo.tipo}


@router.get("/templates/{template_id}", summary="Obtém um template completo (com HTML)")
def obter_template(
    template_id: str,
    db: Session = Depends(get_db_core),
    _user: str = Depends(_verificar_superadmin)
):
    t = db.query(TemplateRelatorio).filter(TemplateRelatorio.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    return {
        "id": t.id, "nome": t.nome, "tipo": t.tipo, "descricao": t.descricao,
        "conteudo_html": t.conteudo_html, "ativo": t.ativo,
        "variaveis_disponiveis": json.loads(t.variaveis_disponiveis) if t.variaveis_disponiveis else get_variaveis_por_tipo(t.tipo),
        "criado_em": t.criado_em, "atualizado_em": t.atualizado_em,
    }


@router.post("/templates", summary="Cria um novo template")
def criar_template(
    payload: TemplateCriarPayload,
    db: Session = Depends(get_db_core),
    user_id: str = Depends(_verificar_superadmin)
):
    variaveis = get_variaveis_por_tipo(payload.tipo)
    novo = TemplateRelatorio(
        nome=payload.nome,
        tipo=payload.tipo,
        descricao=payload.descricao,
        conteudo_html=payload.conteudo_html,
        variaveis_disponiveis=json.dumps(variaveis, ensure_ascii=False),
        criado_por=user_id,
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    logger.info(f"[TEMPLATES] Novo template '{novo.nome}' criado por {user_id}")
    return {"id": novo.id, "nome": novo.nome, "tipo": novo.tipo}


@router.put("/templates/{template_id}", summary="Atualiza um template existente")
def atualizar_template(
    template_id: str,
    payload: TemplateAtualizarPayload,
    db: Session = Depends(get_db_core),
    _user: str = Depends(_verificar_superadmin)
):
    t = db.query(TemplateRelatorio).filter(TemplateRelatorio.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    if payload.nome is not None: t.nome = payload.nome
    if payload.tipo is not None:
        t.tipo = payload.tipo
        t.variaveis_disponiveis = json.dumps(get_variaveis_por_tipo(payload.tipo), ensure_ascii=False)
    if payload.descricao is not None: t.descricao = payload.descricao
    if payload.conteudo_html is not None: t.conteudo_html = payload.conteudo_html
    if payload.ativo is not None: t.ativo = payload.ativo
    t.atualizado_em = datetime.utcnow()

    db.commit()
    logger.info(f"[TEMPLATES] Template '{t.nome}' atualizado.")
    return {"id": t.id, "nome": t.nome, "atualizado_em": t.atualizado_em}


@router.delete("/templates/{template_id}", summary="Remove um template")
def excluir_template(
    template_id: str,
    db: Session = Depends(get_db_core),
    _user: str = Depends(_verificar_superadmin)
):
    t = db.query(TemplateRelatorio).filter(TemplateRelatorio.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")
    db.delete(t)
    db.commit()
    return {"status": "removido", "id": template_id}


@router.post("/templates/{template_id}/duplicar", summary="Duplica um template")
def duplicar_template(
    template_id: str,
    db: Session = Depends(get_db_core),
    user_id: str = Depends(_verificar_superadmin)
):
    t = db.query(TemplateRelatorio).filter(TemplateRelatorio.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    copia = TemplateRelatorio(
        nome=f"Cópia de {t.nome}",
        tipo=t.tipo,
        descricao=t.descricao,
        conteudo_html=t.conteudo_html,
        variaveis_disponiveis=t.variaveis_disponiveis,
        criado_por=user_id,
    )
    db.add(copia)
    db.commit()
    db.refresh(copia)
    return {"id": copia.id, "nome": copia.nome}


# ─── ROTA: UPLOAD DE .DOCX ─────────────────────────────────────────────────

@router.post("/templates/upload-docx", summary="Converte .docx em HTML para edição")
async def upload_docx(
    arquivo: UploadFile = File(...),
    _user: str = Depends(_verificar_superadmin)
):
    if not arquivo.filename.endswith(".docx"):
        raise HTTPException(status_code=400, detail="Apenas arquivos .docx são aceitos.")

    conteudo = await arquivo.read()
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
    try:
        tmp.write(conteudo)
        tmp.close()
        html = docx_para_html(tmp.name)
        logger.info(f"[TEMPLATES] .docx '{arquivo.filename}' convertido em HTML ({len(html)} chars)")
        return {"html": html, "nome_sugerido": arquivo.filename.replace(".docx", "")}
    finally:
        os.unlink(tmp.name)


# ─── ROTA: PRÉ-VISUALIZAÇÃO E GERAÇÃO DE PDF ───────────────────────────────

@router.post("/templates/{template_id}/preview", summary="Renderiza template com variáveis e retorna HTML")
def preview_template(
    template_id: str,
    payload: TemplateRenderizarPayload,
    db: Session = Depends(get_db_core),
    _user: str = Depends(_verificar_superadmin)
):
    """Renderiza o template com as variáveis fornecidas e retorna o HTML final (para preview)."""
    t = db.query(TemplateRelatorio).filter(TemplateRelatorio.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    # Variáveis padrão de preview se não fornecidas
    variaveis_preview = _variaveis_demo(t.tipo)
    variaveis_preview.update(payload.variaveis)

    try:
        html = renderizar_template(t.conteudo_html, variaveis_preview)
        return {"html": html, "tipo": t.tipo}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/templates/{template_id}/gerar-pdf", summary="Gera PDF a partir do template")
def gerar_pdf_template(
    template_id: str,
    payload: TemplateRenderizarPayload,
    db: Session = Depends(get_db_core),
    _user: str = Depends(_verificar_superadmin)
):
    """Gera PDF renderizando o template com as variáveis fornecidas. Retorna o arquivo PDF."""
    t = db.query(TemplateRelatorio).filter(TemplateRelatorio.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    variaveis = _variaveis_demo(t.tipo)
    variaveis.update(payload.variaveis)

    try:
        html = renderizar_template(t.conteudo_html, variaveis)
        nome_arquivo = f"template_{t.tipo}_{uuid.uuid4().hex[:8]}.pdf"
        caminho = os.path.join(UPLOADS_DIR, nome_arquivo)
        html_para_pdf(html, caminho)
        return FileResponse(caminho, media_type="application/pdf", filename=f"{t.nome}.pdf")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar PDF: {e}")


# ─── HELPERS ────────────────────────────────────────────────────────────────

def _variaveis_demo(tipo: str) -> dict:
    """Retorna variáveis de demonstração para preview de cada tipo de template."""
    hoje = formatar_data_br(date.today())
    base = {
        "conselho_nome": "Conselho Regional do Vale do São Patrício — Ceres/GO",
        "data_relatorio": hoje,
        "usuario_nome": "SuperAdmin",
    }
    if tipo == "prancha":
        base.update({
            "numero_prancha": "01/2025",
            "data_emissao": hoje,
            "autor_nome": "Bernardo Silveira",
            "autor_cargo": "Presidente Regional",
            "assunto": "Convocação para Sessão Conjunta Extraordinária",
            "corpo": "Convocamos todos os Veneráveis Mestres e Irmãos para a Sessão Conjunta Extraordinária "
                     "a realizar-se no Templo da ARLS Ceres Fraterna nº 901, no dia 20 de setembro de 2025, "
                     "às 20 horas, com a seguinte pauta: aprovação do regimento interno do Conselho Regional.",
        })
    elif tipo == "relatorio_lojas":
        base.update({
            "total_lojas": 5,
            "lojas": [
                {"numero": "901", "nome": "ARLS Ceres Fraterna", "rito": "REAA", "vm_nome": "Bernardo Silveira"},
                {"numero": "902", "nome": "ARLS Luz de São Patrício", "rito": "Rito Moderno", "vm_nome": "Ícaro Beltrão"},
                {"numero": "903", "nome": "ARLS União do Vale", "rito": "Rito Brasileiro", "vm_nome": "Lucas Medeiros"},
                {"numero": "904", "nome": "ARLS Acácia de Ceres", "rito": "Rito York", "vm_nome": "Marcelo Queiroz"},
                {"numero": "905", "nome": "ARLS Guardiões do Rio das Almas", "rito": "Rito Schroder", "vm_nome": "Otávio Bueno"},
            ],
        })
    elif tipo == "patrimonio":
        base.update({
            "total_itens": 2,
            "itens_patrimonio": [
                {"descricao": "Cadeira de Rodas Hospitalar", "tipo": "Equipamento Médico", "responsavel": "Conselho", "status": "Disponível"},
                {"descricao": "Par de Muletas Reguláveis", "tipo": "Equipamento Médico", "responsavel": "ARLS União do Vale — 903", "status": "Emprestado"},
            ],
        })
    elif tipo == "integrantes":
        base.update({
            "diretoria": [
                {"cargo": "Presidente", "nome": "Bernardo Silveira", "loja": "901"},
                {"cargo": "Vice-Presidente", "nome": "Ícaro Beltrão", "loja": "902"},
                {"cargo": "Secretário", "nome": "Lucas Medeiros", "loja": "903"},
                {"cargo": "Delegado", "nome": "Marcelo Queiroz", "loja": "904"},
            ],
            "lojas": [
                {"numero": "901", "nome": "ARLS Ceres Fraterna", "vm_nome": "Bernardo Silveira"},
                {"numero": "902", "nome": "ARLS Luz de São Patrício", "vm_nome": "Ícaro Beltrão"},
                {"numero": "903", "nome": "ARLS União do Vale", "vm_nome": "Lucas Medeiros"},
                {"numero": "904", "nome": "ARLS Acácia de Ceres", "vm_nome": "Marcelo Queiroz"},
                {"numero": "905", "nome": "ARLS Guardiões do Rio das Almas", "vm_nome": "Otávio Bueno"},
            ],
        })
    return base
