# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Módulo de Gestão de Patrimônio, Documentos Oficiais e Relatórios Executivos (API-First).
Centraliza o repositório documental, termos de cautela de bens, inventário e relatórios,
consumindo dados cadastrais de Lojas e Obreiros via LojasApiClient sem acesso direto a lojas_db.
"""
import os
import shutil
import uuid
from datetime import datetime, date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from loguru import logger

from database import get_db_core
from models.models import (
    ItemPatrimonio,
    EmprestimoPatrimonio,
    FilaEsperaPatrimonio,
    DocumentoRegional,
    Regiao,
    LojaAgregada,
    DiretoriaConselho,
    SuplenteConselho,
    VotacaoRegional,
    VotoLoja,
    PreviaAdmissao,
    ConsideracaoPrevia,
)
from core.dependencies import (
    get_current_regional_user,
    obter_identidade_regional_ou_operador_administrativo,
    RegionalUserContext,
    OperadorAdministrativoContext,
)
from core.lojas_cliente import LojasApiClient
from utils.pdf_generator import (
    gerar_pdf_documento_regional,
    gerar_pdf_relatorio_executivo,
    gerar_pdf_relatorio_integrantes,
    gerar_pdf_relatorio_patrimonio,
)

router = APIRouter(tags=["Patrimônio, Documentos e Relatórios Regionais"])

UPLOADS_DOCUMENTOS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "uploads",
    "documentos",
)
os.makedirs(UPLOADS_DOCUMENTOS_DIR, exist_ok=True)


# ==============================================================================
# SCHEMAS - PATRIMÔNIO
# ==============================================================================
class ItemPatrimonioPayload(BaseModel):
    codigo_tombamento: Optional[str] = None
    nome: str
    descricao: Optional[str] = None
    categoria: str = "HOSPITALAR"
    tipo_propriedade: str = "CONSELHO"
    loja_proprietaria_id: Optional[str] = None
    loja_proprietaria_nome: Optional[str] = None
    loja_proprietaria_numero: Optional[str] = None
    quantidade_total: int = 1
    localizacao_fisica: Optional[str] = None
    estado_conservacao: str = "BOM"
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
    grau_urgencia: str = "NORMAL"
    observacoes: Optional[str] = None


# ==============================================================================
# ROTAS - PATRIMÔNIO
# ==============================================================================
@router.get("/{regiao_id}/patrimonio/estatisticas", summary="Métricas gerais de patrimônio e empréstimos")
def obter_estatisticas_patrimonio(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    itens = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.regiao_id == regiao_id,
        ItemPatrimonio.deletado_visualmente == False,
    ).all()

    total_ativos = sum(i.quantidade_total for i in itens)
    total_disponiveis = sum(i.quantidade_disponivel for i in itens)
    itens_lojas = sum(1 for i in itens if i.tipo_propriedade == "LOJA")

    hoje = date.today()
    emprestimos_ativos_db = db.query(EmprestimoPatrimonio).filter(
        EmprestimoPatrimonio.regiao_id == regiao_id,
        EmprestimoPatrimonio.status.in_(["ATIVO", "ATRASADO"]),
    ).all()

    total_emprestimos_ativos = len(emprestimos_ativos_db)
    total_atrasados = sum(1 for emp in emprestimos_ativos_db if emp.data_prevista_devolucao < hoje)

    fila_espera_db = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.regiao_id == regiao_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO",
    ).count()

    return {
        "total_ativos": total_ativos,
        "total_disponiveis": total_disponiveis,
        "total_emprestimos_ativos": total_emprestimos_ativos,
        "total_atrasados": total_atrasados,
        "itens_lojas_solidarias": itens_lojas,
        "fila_espera_total": fila_espera_db,
    }


@router.get("/{regiao_id}/patrimonio/itens", summary="Lista os itens de patrimônio com filtros e disponibilidade")
def listar_itens_patrimonio(
    regiao_id: str,
    categoria: Optional[str] = None,
    tipo_propriedade: Optional[str] = None,
    apenas_disponiveis: bool = False,
    busca: Optional[str] = None,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    query = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.regiao_id == regiao_id,
        ItemPatrimonio.deletado_visualmente == False,
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
            (ItemPatrimonio.nome.ilike(busca_termo))
            | (ItemPatrimonio.codigo_tombamento.ilike(busca_termo))
            | (ItemPatrimonio.descricao.ilike(busca_termo))
            | (ItemPatrimonio.localizacao_fisica.ilike(busca_termo))
            | (ItemPatrimonio.loja_proprietaria_nome.ilike(busca_termo))
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
            "pode_gerenciar": user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user_loja_id and item.loja_proprietaria_id == user_loja_id),
        })

    return resultado


@router.post("/{regiao_id}/patrimonio/itens", summary="Cadastra novo bem no patrimônio (Conselho ou Loja)")
def cadastrar_item_patrimonio(
    regiao_id: str,
    payload: ItemPatrimonioPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    tipo_prop = payload.tipo_propriedade.upper()
    if tipo_prop == "CONSELHO" and not (user.is_diretoria or user.role.upper() == "SUPERADMIN"):
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
        foto_url=payload.foto_url,
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
    db: Session = Depends(get_db_core),
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id, ItemPatrimonio.regiao_id == regiao_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    pode_editar = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and item.loja_proprietaria_id == user.loja_id)
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
    db: Session = Depends(get_db_core),
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id, ItemPatrimonio.regiao_id == regiao_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    pode_excluir = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and item.loja_proprietaria_id == user.loja_id)
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Sem permissão para remover este bem patrimonial.")

    if hard_delete:
        if user.role.upper() != "SUPERADMIN":
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
    db: Session = Depends(get_db_core),
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
        if status and status.upper() != "TODOS" and st != status.upper():
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
            "pode_gerenciar": user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and emp.loja_solicitante_id == user.loja_id),
        })

    return resultado


@router.post("/{regiao_id}/patrimonio/itens/{item_id}/emprestar", summary="Registra um termo de cautela e saída de bem para empréstimo")
def realizar_emprestimo(
    regiao_id: str,
    item_id: str,
    payload: EmprestimoPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id, ItemPatrimonio.regiao_id == regiao_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    if item.quantidade_disponivel < payload.quantidade:
        raise HTTPException(
            status_code=400,
            detail=f"Quantidade insuficiente para empréstimo. Disponíveis: {item.quantidade_disponivel}, solicitados: {payload.quantidade}.",
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
        observacoes=payload.observacoes,
    )

    item.quantidade_disponivel -= payload.quantidade
    fila_entry = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.item_id == item.id,
        FilaEsperaPatrimonio.loja_solicitante_id == payload.loja_solicitante_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO",
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
        "message": "Termo de Cautela e Empréstimo registrado com sucesso.",
    }


@router.post("/{regiao_id}/patrimonio/emprestimos/{emprestimo_id}/devolver", summary="Registra devolução (check-in) de bem emprestado")
def registrar_devolucao(
    regiao_id: str,
    emprestimo_id: str,
    payload: DevolucaoPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    emprestimo = db.query(EmprestimoPatrimonio).filter(
        EmprestimoPatrimonio.id == emprestimo_id, EmprestimoPatrimonio.regiao_id == regiao_id
    ).first()
    if not emprestimo:
        raise HTTPException(status_code=404, detail="Registro de empréstimo não encontrado.")

    if emprestimo.status == "CONCLUIDO":
        raise HTTPException(status_code=400, detail="Este empréstimo já foi concluído anteriormente.")

    pode_devolver = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and emprestimo.loja_solicitante_id == user.loja_id)
    if not pode_devolver:
        raise HTTPException(status_code=403, detail="Sem autorização para registrar devolução deste empréstimo.")

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

    db.commit()
    return {"status": "success", "message": "Devolução do bem registrada com sucesso."}


@router.get("/{regiao_id}/patrimonio/fila", summary="Lista todas as demandas na fila de espera")
def listar_fila_espera(
    regiao_id: str,
    item_id: Optional[str] = None,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    query = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.regiao_id == regiao_id,
        FilaEsperaPatrimonio.status == "AGUARDANDO",
    )
    if item_id:
        query = query.filter(FilaEsperaPatrimonio.item_id == item_id)

    fila_db = query.order_by(FilaEsperaPatrimonio.data_solicitacao.asc()).all()
    resultado = []
    for idx, f in enumerate(fila_db, start=1):
        resultado.append({
            "posicao": idx,
            "id": f.id,
            "item_id": f.item_id,
            "item_nome": f.item.nome if f.item else "Ativo Solicitado",
            "item_codigo": f.item.codigo_tombamento if f.item else "",
            "loja_solicitante_id": f.loja_solicitante_id,
            "loja_solicitante_nome": f.loja_solicitante_nome,
            "loja_solicitante_numero": f.loja_solicitante_numero,
            "responsavel_nome": f.responsavel_nome,
            "contato": f.contato,
            "grau_urgencia": f.grau_urgencia,
            "data_solicitacao": f.data_solicitacao.strftime("%d/%m/%Y"),
            "observacoes": f.observacoes,
            "pode_cancelar": user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and f.loja_solicitante_id == user.loja_id),
        })
    return resultado


@router.post("/{regiao_id}/patrimonio/itens/{item_id}/fila", summary="Ingressa na fila de espera para um item indisponível")
def ingressar_fila_espera(
    regiao_id: str,
    item_id: str,
    payload: FilaEsperaPayload,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    item = db.query(ItemPatrimonio).filter(
        ItemPatrimonio.id == item_id, ItemPatrimonio.regiao_id == regiao_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item de patrimônio não encontrado.")

    nova_fila = FilaEsperaPatrimonio(
        item_id=item.id,
        regiao_id=regiao_id,
        loja_solicitante_id=payload.loja_solicitante_id,
        loja_solicitante_nome=payload.loja_solicitante_nome,
        loja_solicitante_numero=payload.loja_solicitante_numero,
        responsavel_nome=payload.responsavel_nome.strip(),
        contato=payload.contato,
        grau_urgencia=payload.grau_urgencia.upper(),
        data_solicitacao=date.today(),
        status="AGUARDANDO",
        observacoes=payload.observacoes,
    )
    db.add(nova_fila)
    db.commit()
    db.refresh(nova_fila)

    posicao = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.item_id == item.id,
        FilaEsperaPatrimonio.status == "AGUARDANDO",
    ).count()

    return {"status": "success", "fila_id": nova_fila.id, "posicao": posicao, "message": f"Demanda incluída com sucesso na Fila de Espera (Posição {posicao}º)."}


@router.delete("/{regiao_id}/patrimonio/fila/{fila_id}", summary="Cancela ou remove solicitação da fila de espera")
def cancelar_fila_espera(
    regiao_id: str,
    fila_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db: Session = Depends(get_db_core),
):
    fila = db.query(FilaEsperaPatrimonio).filter(
        FilaEsperaPatrimonio.id == fila_id, FilaEsperaPatrimonio.regiao_id == regiao_id
    ).first()
    if not fila:
        raise HTTPException(status_code=404, detail="Solicitação na fila não encontrada.")

    pode_cancelar = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and fila.loja_solicitante_id == user.loja_id)
    if not pode_cancelar:
        raise HTTPException(status_code=403, detail="Sem autorização para cancelar esta solicitação da fila.")

    fila.status = "CANCELADO"
    db.commit()
    return {"status": "success", "message": "Solicitação na fila de espera cancelada com sucesso."}


# ==============================================================================
# SCHEMAS - DOCUMENTOS
# ==============================================================================
class DocumentoPayload(BaseModel):
    codigo_documento: Optional[str] = None
    titulo: str
    descricao_ementa: Optional[str] = None
    categoria: str = "ATA"
    tipo_origem: str = "CONSELHO"
    loja_emissora_id: Optional[str] = None
    loja_emissora_nome: Optional[str] = None
    loja_emissora_numero: Optional[str] = None
    data_documento: Optional[date] = None
    conteudo_texto: Optional[str] = None
    visibilidade: str = "PUBLICO_CONSELHO"
    data_expiracao: Optional[date] = None


# ==============================================================================
# ROTAS - DOCUMENTOS
# ==============================================================================
@router.get("/{regiao_id}/documentos/estatisticas", summary="Métricas consolidadas do repositório documental")
def obter_estatisticas_documentos(
    regiao_id: str,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    docs = db.query(DocumentoRegional).filter(
        DocumentoRegional.regiao_id == regiao_id,
        DocumentoRegional.deletado_visualmente == False,
    ).all()

    return {
        "total_documentos": len(docs),
        "total_atas": sum(1 for d in docs if d.categoria == "ATA"),
        "total_decretos": sum(1 for d in docs if d.categoria == "DECRETO"),
        "total_regulamentos": sum(1 for d in docs if d.categoria == "REGULAMENTO"),
        "total_circulares": sum(1 for d in docs if d.categoria == "CIRCULAR"),
        "total_convites": sum(1 for d in docs if d.categoria == "CONVITE"),
        "total_modelos": sum(1 for d in docs if d.categoria == "MODELO"),
        "total_downloads": sum(d.downloads_count for d in docs),
    }


@router.get("/{regiao_id}/documentos", summary="Lista os documentos oficiais com filtros")
def listar_documentos_regionais(
    regiao_id: str,
    categoria: Optional[str] = None,
    tipo_origem: Optional[str] = None,
    busca: Optional[str] = None,
    loja_id: Optional[str] = None,
    incluir_arquivados: bool = False,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    query = db.query(DocumentoRegional).filter(DocumentoRegional.regiao_id == regiao_id)
    if not incluir_arquivados:
        query = query.filter(DocumentoRegional.deletado_visualmente == False)

    if not (user.is_diretoria or user.role.upper() == "SUPERADMIN"):
        query = query.filter(
            (DocumentoRegional.visibilidade == "PUBLICO_CONSELHO")
            | (DocumentoRegional.loja_emissora_id == user.loja_id)
        )

    if categoria and categoria.upper() != "TODAS":
        query = query.filter(DocumentoRegional.categoria == categoria.upper())
    if tipo_origem and tipo_origem.upper() != "TODOS":
        query = query.filter(DocumentoRegional.tipo_origem == tipo_origem.upper())
    if loja_id:
        query = query.filter(DocumentoRegional.loja_emissora_id == loja_id)
    if busca:
        busca_termo = f"%{busca.strip()}%"
        query = query.filter(
            (DocumentoRegional.titulo.ilike(busca_termo))
            | (DocumentoRegional.codigo_documento.ilike(busca_termo))
            | (DocumentoRegional.descricao_ementa.ilike(busca_termo))
            | (DocumentoRegional.loja_emissora_nome.ilike(busca_termo))
            | (DocumentoRegional.autor_nome.ilike(busca_termo))
        )

    documentos = query.order_by(DocumentoRegional.data_documento.desc()).all()
    resultado = []
    for doc in documentos:
        pode_gerenciar = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and doc.loja_emissora_id == user.loja_id)
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
            "data_expiracao": doc.data_expiracao.isoformat() if doc.data_expiracao else None,
            "arquivado": doc.deletado_visualmente,
            "arquivado_em": doc.arquivado_em.isoformat() if doc.arquivado_em else None,
            "arquivado_por": doc.arquivado_por,
            "pode_gerenciar": pode_gerenciar,
        })

    return resultado


@router.post("/{regiao_id}/documentos", summary="Publica novo documento gerando PDF oficial automaticamente")
def publicar_documento_regional(
    regiao_id: str,
    payload: DocumentoPayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    tipo_orig = payload.tipo_origem.upper()
    if tipo_orig == "CONSELHO" and not (user.is_diretoria or user.role.upper() == "SUPERADMIN"):
        raise HTTPException(status_code=403, detail="Apenas a Mesa Diretora ou SuperAdmin podem publicar documentos oficiais do Conselho.")

    if isinstance(user, OperadorAdministrativoContext) and str(payload.loja_emissora_id) != str(user.loja_id):
        raise HTTPException(status_code=403, detail="Você só pode publicar documentos em nome da sua própria Loja.")

    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    ano_corrente = date.today().year
    codigo = payload.codigo_documento
    if not codigo:
        count = db.query(DocumentoRegional).filter(DocumentoRegional.regiao_id == regiao_id).count() + 1
        prefixo = f"{payload.categoria.upper()}-{ano_corrente}"
        codigo = f"{prefixo}-{count:03d}"

    autor_nome = f"Ir.'. {user.usuario_id}"
    autor_cargo = (
        f"Operador Administrativo ({user.slot.capitalize()})"
        if isinstance(user, OperadorAdministrativoContext)
        else user.role
    )

    doc_id = str(uuid.uuid4())
    diretorio_ano = os.path.join(UPLOADS_DOCUMENTOS_DIR, regiao_id, str(ano_corrente))
    os.makedirs(diretorio_ano, exist_ok=True)
    caminho_pdf = os.path.join(diretorio_ano, f"{codigo.replace('/', '_')}_{doc_id[:8]}.pdf")

    gerar_pdf_documento_regional(
        caminho_saida=caminho_pdf,
        conselho_nome=conselho_nome,
        codigo_documento=codigo,
        titulo=payload.titulo,
        categoria=payload.categoria,
        data_doc=payload.data_documento or date.today(),
        emissor_nome=payload.loja_emissora_nome or conselho_nome,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        ementa=payload.descricao_ementa,
        conteudo_texto=payload.conteudo_texto or "",
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
        autor_id=user.usuario_id,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        data_documento=payload.data_documento or date.today(),
        conteudo_texto=payload.conteudo_texto,
        arquivo_url=caminho_pdf,
        tamanho_bytes=tamanho,
        visibilidade=payload.visibilidade.upper(),
        data_expiracao=payload.data_expiracao,
    )

    db.add(novo_doc)
    db.commit()
    db.refresh(novo_doc)

    return {"status": "success", "documento_id": novo_doc.id, "codigo": novo_doc.codigo_documento, "message": "Documento publicado com sucesso."}


@router.post("/{regiao_id}/documentos/upload", summary="Publica documento via upload de arquivo PDF/Docx")
def upload_documento_regional(
    regiao_id: str,
    titulo: str,
    categoria: str,
    tipo_origem: str,
    arquivo: UploadFile = File(...),
    loja_emissora_id: Optional[str] = None,
    loja_emissora_nome: Optional[str] = None,
    loja_emissora_numero: Optional[str] = None,
    descricao_ementa: Optional[str] = None,
    data_documento: Optional[date] = None,
    visibilidade: str = "PUBLICO_CONSELHO",
    data_expiracao: Optional[date] = None,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    tipo_orig = tipo_origem.upper()
    if tipo_orig == "CONSELHO" and not (user.is_diretoria or user.role.upper() == "SUPERADMIN"):
        raise HTTPException(status_code=403, detail="Apenas a Diretoria pode subir documentos em nome do Conselho.")

    if isinstance(user, OperadorAdministrativoContext) and str(loja_emissora_id) != str(user.loja_id):
        raise HTTPException(status_code=403, detail="Você só pode publicar documentos em nome da sua própria Loja.")

    extensao = os.path.splitext(arquivo.filename)[1].lower()
    if extensao not in [".pdf", ".docx", ".doc"]:
        raise HTTPException(status_code=400, detail="Formato não suportado. Envie PDF ou Docx.")

    ano_corrente = date.today().year
    count = db.query(DocumentoRegional).filter(DocumentoRegional.regiao_id == regiao_id).count() + 1
    codigo = f"{categoria.upper()}-{ano_corrente}-{count:03d}"

    doc_id = str(uuid.uuid4())
    diretorio_ano = os.path.join(UPLOADS_DOCUMENTOS_DIR, regiao_id, str(ano_corrente))
    os.makedirs(diretorio_ano, exist_ok=True)
    caminho_final = os.path.join(diretorio_ano, f"{codigo.replace('/', '_')}_{doc_id[:8]}{extensao}")

    with open(caminho_final, "wb") as buffer:
        shutil.copyfileobj(arquivo.file, buffer)

    tamanho = os.path.getsize(caminho_final)
    autor_nome = f"Ir.'. {user.usuario_id}"
    autor_cargo = (
        f"Operador Administrativo ({user.slot.capitalize()})"
        if isinstance(user, OperadorAdministrativoContext)
        else user.role
    )

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
        autor_id=user.usuario_id,
        autor_nome=autor_nome,
        autor_cargo=autor_cargo,
        data_documento=data_documento or date.today(),
        arquivo_url=caminho_final,
        tamanho_bytes=tamanho,
        visibilidade=visibilidade.upper(),
        data_expiracao=data_expiracao,
    )
    db.add(novo_doc)
    db.commit()
    db.refresh(novo_doc)

    return {"status": "success", "documento_id": novo_doc.id, "codigo": novo_doc.codigo_documento, "message": "Documento enviado com sucesso."}


@router.get("/{regiao_id}/documentos/{documento_id}/arquivo", summary="Streaming e download seguro de arquivo de documento")
def baixar_arquivo_documento(
    regiao_id: str,
    documento_id: str,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    doc = db.query(DocumentoRegional).filter(
        DocumentoRegional.id == documento_id, DocumentoRegional.regiao_id == regiao_id
    ).first()
    if not doc or not doc.arquivo_url or not os.path.exists(doc.arquivo_url):
        raise HTTPException(status_code=404, detail="Arquivo do documento não encontrado no servidor.")

    if not (user.is_diretoria or user.role.upper() == "SUPERADMIN"):
        if doc.visibilidade != "PUBLICO_CONSELHO" and doc.loja_emissora_id != user.loja_id:
            raise HTTPException(status_code=403, detail="Acesso restrito ao arquivo deste documento.")

    doc.downloads_count += 1
    db.commit()

    nome_download = f"{doc.codigo_documento.replace('/', '_')}_{doc.titulo[:30]}{os.path.splitext(doc.arquivo_url)[1]}"
    media_type = "application/pdf" if doc.arquivo_url.endswith(".pdf") else "application/octet-stream"

    return FileResponse(path=doc.arquivo_url, filename=nome_download, media_type=media_type)


@router.put("/{regiao_id}/documentos/{documento_id}", summary="Atualiza metadados de um documento")
def atualizar_documento_regional(
    regiao_id: str,
    documento_id: str,
    payload: DocumentoPayload,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    doc = db.query(DocumentoRegional).filter(
        DocumentoRegional.id == documento_id, DocumentoRegional.regiao_id == regiao_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    pode_editar = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and doc.loja_emissora_id == user.loja_id)
    if not pode_editar:
        raise HTTPException(status_code=403, detail="Você não tem permissão para editar este documento.")

    doc.titulo = payload.titulo.strip()
    if payload.descricao_ementa is not None:
        doc.descricao_ementa = payload.descricao_ementa.strip()
    doc.categoria = payload.categoria.upper()
    doc.visibilidade = payload.visibilidade.upper()
    doc.data_expiracao = payload.data_expiracao
    if payload.data_documento:
        doc.data_documento = payload.data_documento

    db.commit()
    return {"status": "success", "message": "Documento atualizado com sucesso."}


@router.delete("/{regiao_id}/documentos/{documento_id}", summary="Oculta visualmente ou remove definitivamente um documento")
def excluir_documento_regional(
    regiao_id: str,
    documento_id: str,
    hard_delete: bool = False,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    doc = db.query(DocumentoRegional).filter(
        DocumentoRegional.id == documento_id, DocumentoRegional.regiao_id == regiao_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    pode_excluir = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and doc.loja_emissora_id == user.loja_id)
    if not pode_excluir:
        raise HTTPException(status_code=403, detail="Você não tem permissão para excluir este documento.")

    if hard_delete:
        if user.role.upper() != "SUPERADMIN":
            raise HTTPException(status_code=403, detail="Apenas o SuperAdmin pode deletar fisicamente.")
        if doc.arquivo_url and os.path.exists(doc.arquivo_url):
            try:
                os.remove(doc.arquivo_url)
            except Exception as e:
                logger.warning(f"Não foi possível apagar arquivo físico {doc.arquivo_url}: {e}")
        db.delete(doc)
        db.commit()
        return {"status": "success", "tipo_delecao": "FISICA", "message": "Documento deletado definitivamente."}
    else:
        doc.deletado_visualmente = True
        doc.arquivado_em = datetime.utcnow()
        doc.arquivado_por = f"Ir.'. {user.usuario_id}"
        db.commit()
        return {"status": "success", "tipo_delecao": "VISUAL", "message": "Documento arquivado com sucesso."}


@router.put("/{regiao_id}/documentos/{documento_id}/reativar", summary="Reativa (desarquiva) um documento ou convite")
def reativar_documento_regional(
    regiao_id: str,
    documento_id: str,
    user=Depends(obter_identidade_regional_ou_operador_administrativo),
    db: Session = Depends(get_db_core),
):
    doc = db.query(DocumentoRegional).filter(
        DocumentoRegional.id == documento_id, DocumentoRegional.regiao_id == regiao_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado.")

    pode_editar = user.is_diretoria or user.role.upper() == "SUPERADMIN" or (user.loja_id and doc.loja_emissora_id == user.loja_id)
    if not pode_editar:
        raise HTTPException(status_code=403, detail="Sem permissão para reativar este documento.")

    doc.deletado_visualmente = False
    doc.arquivado_em = None
    doc.arquivado_por = None
    db.commit()
    return {"status": "success", "message": "Documento reativado com sucesso."}


# ==============================================================================
# ROTAS - RELATÓRIOS EXECUTIVOS (API-FIRST)
# ==============================================================================
@router.get("/{regiao_id}/relatorios/consolidado", summary="Compila indicadores executivos de governança, ritos e assiduidade")
def obter_relatorio_consolidado(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
):
    """
    Retorna métricas executivas globais, distribuição por rito e ranking de assiduidade
    das lojas consumindo dados cadastrais via LojasApiClient (API-First).
    """
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    agregadas = db_core.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True,
    ).all()
    total_lojas = len(agregadas)

    loja_ids_int = [int(a.loja_id) for a in agregadas if a.loja_id.isdigit()]
    lojas_info = {}
    if loja_ids_int:
        try:
            lojas_api = LojasApiClient.buscar_lojas_multiplas(loja_ids_int)
            for l in lojas_api:
                lojas_info[str(l["id"])] = l
        except Exception as e:
            logger.warning(f"Não foi possível obter dados das lojas via API: {e}")

    votacoes = db_core.query(VotacaoRegional).filter(VotacaoRegional.regiao_id == regiao_id).all()
    total_votacoes = len(votacoes)
    votacao_ids = [v.id for v in votacoes]

    votos = db_core.query(VotoLoja).filter(VotoLoja.votacao_id.in_(votacao_ids)).all() if votacao_ids else []
    total_votos_colegiado = len(votos)

    votos_por_loja = {}
    for vt in votos:
        lid = str(vt.loja_id)
        votos_por_loja[lid] = votos_por_loja.get(lid, 0) + 1

    atas_presenca = db_core.query(AtasPresenca).filter(
        AtasPresenca.regiao_id == regiao_id,
        AtasPresenca.presente == True,
    ).all()
    total_presencas_sessao = len(atas_presenca)

    presencas_por_loja = {}
    for p in atas_presenca:
        lid = str(p.loja_id)
        presencas_por_loja[lid] = presencas_por_loja.get(lid, 0) + 1

    distribuicao_ritos = {}
    for lid, l in lojas_info.items():
        rito_nome = l.get("rito") or "Não Informado"
        distribuicao_ritos[rito_nome] = distribuicao_ritos.get(rito_nome, 0) + 1

    ranking_lojas = []
    for a in agregadas:
        lid = str(a.loja_id)
        l = lojas_info.get(lid)
        num_votos = votos_por_loja.get(lid, 0)
        num_pres = presencas_por_loja.get(lid, 0)
        score = (num_votos * 2) + (num_pres * 3)

        ranking_lojas.append({
            "loja_id": lid,
            "nome_loja": l.get("nome_loja") if l else f"Loja {lid}",
            "numero_loja": l.get("numero_loja") if l else lid,
            "rito": l.get("rito") if l else "REAA",
            "filiacao": l.get("filiacao_formatada") if l else "GOB",
            "votos_participados": num_votos,
            "sessoes_presentes": num_pres,
            "score_engajamento": score,
        })

    ranking_lojas.sort(key=lambda x: x["score_engajamento"], reverse=True)

    engajamento_colegiado = 0.0
    if total_lojas > 0 and total_votacoes > 0:
        votos_esperados = total_lojas * total_votacoes
        engajamento_colegiado = round((total_votos_colegiado / votos_esperados * 100), 1)

    return {
        "conselho_nome": conselho_nome,
        "regiao_id": regiao_id,
        "data_consolidacao": date.today().strftime("%d/%m/%Y"),
        "kpis": {
            "total_lojas_jurisdicionadas": total_lojas,
            "total_consultas_pleitos": total_votacoes,
            "total_votos_computados": total_votos_colegiado,
            "total_presencas_registradas": total_presencas_sessao,
            "taxa_engajamento_colegiado": engajamento_colegiado,
        },
        "distribuicao_ritos": distribuicao_ritos,
        "ranking_lojas": ranking_lojas,
    }


@router.get("/{regiao_id}/relatorios/integrantes", summary="Lista nominal da Mesa Diretora e Veneráveis Mestres das Lojas")
def obter_relatorio_integrantes(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
):
    """
    Retorna o Livro de Matrícula do Colegiado Regional via LojasApiClient (API-First).
    """
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    diretoria_db = db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).all()
    user_ids = [d.usuario_id for d in diretoria_db if d.usuario_id]

    obreiros_map = {}
    for uid in user_ids:
        try:
            dados_o = LojasApiClient.buscar_obreiro_por_cim(str(uid))
            if dados_o:
                obreiros_map[str(uid)] = dados_o
        except Exception:
            pass

    ordem_cargos = {
        "PRESIDENTE": 1,
        "VICE_PRESIDENTE": 2,
        "SECRETARIO": 3,
        "TESOUREIRO": 4,
        "CHANCELER": 5,
        "HOSPITALEIRO": 6,
    }

    mesa_diretora = []
    for d in diretoria_db:
        o = obreiros_map.get(d.usuario_id) or {}
        cargo_str = d.cargo.value if hasattr(d.cargo, "value") else str(d.cargo)
        cargo_formatado = cargo_str.replace("_", " ").title()

        mesa_diretora.append({
            "id": d.id,
            "cargo": cargo_formatado,
            "cargo_codigo": cargo_str,
            "usuario_id": d.usuario_id,
            "nome": o.get("nome_completo") or f"Ir.'. {d.usuario_id}",
            "cim": o.get("cim") or (d.usuario_id if str(d.usuario_id).isdigit() else "-"),
            "email": o.get("email") or "secretaria@conselho.org.br",
            "telefone": o.get("telefone") or "(62) 99999-0000",
            "inicio_mandato": d.inicio_mandato.strftime("%d/%m/%Y") if d.inicio_mandato else "-",
            "termino_mandato": d.termino_mandato.strftime("%d/%m/%Y") if d.termino_mandato else "-",
        })

    mesa_diretora.sort(key=lambda x: ordem_cargos.get(x["cargo_codigo"], 99))

    agregadas = db_core.query(LojaAgregada).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True,
    ).all()
    loja_ids_int = [int(a.loja_id) for a in agregadas if a.loja_id.isdigit()]
    lojas_info = {}
    if loja_ids_int:
        try:
            lojas_api = LojasApiClient.buscar_lojas_multiplas(loja_ids_int)
            for l in lojas_api:
                lojas_info[str(l["id"])] = l
        except Exception as e:
            logger.warning(f"Não foi possível obter dados das lojas via API: {e}")

    # Suplentes cadastrados na tabela SuplenteConselho
    suplentes_conselho_map = {s.loja_id: s for s in db_core.query(SuplenteConselho).all()}

    lista_lojas = []
    for a in agregadas:
        lid = str(a.loja_id)
        l = lojas_info.get(lid) or {}
        suplente_reg = suplentes_conselho_map.get(lid)

        # Consulta VM ativo via API
        vm_dados = {}
        if str(lid).isdigit():
            try:
                vm_resp = LojasApiClient.obter_vm_ativo(int(lid))
                if vm_resp.get("tem_vm"):
                    vm_dados = vm_resp
            except Exception:
                pass

        nome_suplente = "-"
        cim_suplente = "-"
        if suplente_reg:
            nome_suplente = suplente_reg.nome or f"Ir.'. {suplente_reg.usuario_id}"
            cim_suplente = suplente_reg.usuario_id

        lista_lojas.append({
            "loja_id": lid,
            "nome_loja": l.get("nome_loja") or f"Loja {lid}",
            "numero_loja": l.get("numero_loja") or lid,
            "rito": l.get("rito") or "REAA",
            "filiacao": l.get("filiacao_formatada") or "GOB",
            "veneravel_mestre": {
                "nome": vm_dados.get("nome_completo") or "A Definir / Vago",
                "cim": vm_dados.get("cim") or "-",
                "email": vm_dados.get("email") or "-",
                "telefone": vm_dados.get("telefone") or "-",
            },
            "suplente_conselho": {
                "nome": nome_suplente,
                "cim": cim_suplente,
                "cargo_origem": "1º Vigilante / Suplente Formal",
            },
        })

    lista_lojas.sort(key=lambda x: str(x["numero_loja"]))

    return {
        "conselho_nome": conselho_nome,
        "regiao_id": regiao_id,
        "data_extracao": date.today().strftime("%d/%m/%Y"),
        "total_integrantes_diretoria": len(mesa_diretora),
        "total_lojas_federadas": len(lista_lojas),
        "mesa_diretora": mesa_diretora,
        "lojas": lista_lojas,
    }


@router.get("/{regiao_id}/relatorios/patrimonio", summary="Inventário patrimonial analítico e balanço de comodatos")
def obter_relatorio_patrimonio(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
):
    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    itens = db_core.query(ItemPatrimonio).filter(
        ItemPatrimonio.regiao_id == regiao_id,
        ItemPatrimonio.deletado_visualmente == False,
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
            "taxa_locacao_estimada": item.taxa_locacao_estimada or 0.0,
        })

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
            "status": "ATRASADO" if is_atrasado else emp.status,
            "atrasado": is_atrasado,
            "observacoes": emp.observacoes or "",
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
            "cautelas_atrasadas": cautelas_atrasadas,
        },
        "itens": lista_itens,
        "emprestimos": lista_emprestimos,
    }


@router.get("/{regiao_id}/relatorios/exportar-pdf", summary="Exporta relatório oficial em PDF via ReportLab")
def exportar_relatorio_pdf(
    regiao_id: str,
    tipo: str = "executivo",
    user: RegionalUserContext = Depends(get_current_regional_user),
    db_core: Session = Depends(get_db_core),
):
    """Gera e exporta relatório consolidado, de integrantes ou patrimonial em PDF."""
    tipo_limpo = tipo.lower().strip()
    if tipo_limpo not in ["executivo", "integrantes", "patrimonio"]:
        raise HTTPException(status_code=400, detail="Tipo de relatório inválido. Escolha: executivo, integrantes ou patrimonio.")

    regiao = db_core.query(Regiao).filter(Regiao.id == regiao_id).first()
    conselho_nome = regiao.nome if regiao else "Conselho Regional de Veneráveis Mestres"

    diretorio_relatorios = os.path.join("uploads", "relatorios", regiao_id)
    os.makedirs(diretorio_relatorios, exist_ok=True)
    caminho_pdf = os.path.join(diretorio_relatorios, f"Relatorio_{tipo_limpo}_{date.today().strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}.pdf")

    if tipo_limpo == "executivo":
        dados = obter_relatorio_consolidado(regiao_id=regiao_id, user=user, db_core=db_core)
        gerar_pdf_relatorio_executivo(
            caminho_saida=caminho_pdf,
            conselho_nome=conselho_nome,
            stats=dados["kpis"],
            ranking_lojas=dados["ranking_lojas"],
        )
        nome_download = f"Relatorio_Executivo_Conselho_{date.today().strftime('%d-%m-%Y')}.pdf"

    elif tipo_limpo == "integrantes":
        dados = obter_relatorio_integrantes(regiao_id=regiao_id, user=user, db_core=db_core)
        gerar_pdf_relatorio_integrantes(
            caminho_saida=caminho_pdf,
            conselho_nome=conselho_nome,
            diretoria=dados["mesa_diretora"],
            lojas_vms=dados["lojas"],
        )
        nome_download = f"Quadro_Integrantes_Conselho_{date.today().strftime('%d-%m-%Y')}.pdf"

    elif tipo_limpo == "patrimonio":
        dados = obter_relatorio_patrimonio(regiao_id=regiao_id, user=user, db_core=db_core)
        gerar_pdf_relatorio_patrimonio(
            caminho_saida=caminho_pdf,
            conselho_nome=conselho_nome,
            itens_patrimonio=dados["itens"],
            emprestimos_ativos=[e for e in dados["emprestimos"] if e["status"] in ["ATIVO", "ATRASADO"]],
        )
        nome_download = f"Balanco_Patrimonial_Conselho_{date.today().strftime('%d-%m-%Y')}.pdf"

    return FileResponse(
        path=caminho_pdf,
        filename=nome_download,
        media_type="application/pdf",
    )
