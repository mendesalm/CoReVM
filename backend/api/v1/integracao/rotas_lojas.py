# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from loguru import logger
from database import get_db_lojas, get_db_lista
from models.lojas_models import LojaIntegracao
from schemas.schemas import LojaCreateOnTheFly

router = APIRouter()

@router.get("/busca", summary="Busca Lojas no banco global (lista_de_lojas_db)", description="Busca lojas pelo nome ou número na base unificada de todas as lojas.")
def buscar_lojas_global(q: str = Query(..., min_length=3), db_lista: Session = Depends(get_db_lista)):
    """
    Pesquisa as lojas globalmente na tabela 'lojas' do 'lista_de_lojas_db'.
    Cruza a busca pelo nome e pelo número da loja.
    """
    termo = f"%{q}%"
    try:
        # Supondo que a tabela seja "lojas" e tenha "id", "nome", e "numero"
        result = db_lista.execute(
            text("""
                SELECT l.id, l.lodge_name, l.lodge_number, l.city, o.acronym 
                FROM lodges l
                LEFT JOIN obediences o ON l.obedience_id = o.id
                WHERE l.lodge_name ILIKE :t OR l.lodge_number::text ILIKE :t OR l.city ILIKE :t 
                LIMIT 20
            """),
            {"t": termo}
        ).fetchall()
        
        return [{"id": row[0], "nome": row[1], "numero_loja": str(row[2]), "cidade": row[3] if len(row) > 3 else '', "potencia": row[4] if len(row) > 4 and row[4] else ''} for row in result]
    except Exception as e:
        logger.error(f"Erro ao buscar na lista_de_lojas_db: {e}")
        # Tenta fallback para Lojas Integracao (lojas_db) se a tabela for diferente
        try:
            db_lojas = next(get_db_lojas())
            lojas = db_lojas.query(LojaIntegracao).filter(
                (LojaIntegracao.nome_loja.ilike(termo)) | 
                (LojaIntegracao.numero_loja.ilike(termo)) |
                (LojaIntegracao.cidade.ilike(termo))
            ).limit(20).all()
        except Exception as e2:
            logger.error(f"Erro no fallback: {e2}")
            return []

@router.post("/busca/multiplas", summary="Busca multiplas lojas por ID", description="Retorna os detalhes de varias lojas baseado em uma lista de IDs.")
def buscar_lojas_multiplas(ids: list[int], db_lista: Session = Depends(get_db_lista)):
    try:
        if not ids:
            return []
        
        ids_str = ",".join(str(i) for i in ids if isinstance(i, int))
        if not ids_str:
            return []
            
        result = db_lista.execute(
            text(f"""
                SELECT l.id, l.lodge_name, l.lodge_number, l.city, o.acronym, l.rite 
                FROM lodges l
                LEFT JOIN obediences o ON l.obedience_id = o.id
                WHERE l.id IN ({ids_str})
            """)
        ).fetchall()
        
        return [{"id": row[0], "nome": row[1], "numero": str(row[2]), "cidade": row[3] if len(row) > 3 else '', "potencia": row[4] if len(row) > 4 and row[4] else '', "rito": row[5] if len(row) > 5 else ''} for row in result]
    except Exception as e:
        logger.error(f"Erro ao buscar lojas em lote: {e}")
        return []

@router.post("/status_vm", summary="Verifica status de Venerável Mestre", description="Retorna os nomes dos VMs cadastrados nas lojas solicitadas")
def verificar_status_vm(ids: list[int], db_lojas: Session = Depends(get_db_lojas)):
    try:
        if not ids:
            return {}
            
        from models.lojas_models import Mandato, ObreiroIntegracao
        # Busca todas as associações de VM (cargo_id = 1) e o nome do obreiro
        resultados = db_lojas.query(Mandato.loja_id, ObreiroIntegracao.nome_completo).join(
            ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id
        ).filter(
            Mandato.loja_id.in_(ids),
            Mandato.cargo_id == 1,
            Mandato.data_fim.is_(None) # Apenas mandato ativo
        ).all()
        
        # Mapeia loja_id -> nome_completo
        lojas_com_vm = {row.loja_id: row.nome_completo for row in resultados}
        
        # Retorna dicionário com o nome ou None se não tiver
        return {loja_id: lojas_com_vm.get(loja_id) for loja_id in ids}
    except Exception as e:
        logger.error(f"Erro ao verificar status VM em lote: {e}")
        return {}

@router.post("/", response_model=dict, summary="Cadastra Loja On-the-Fly", description="Cria uma loja diretamente no lojas_db respeitando regras de GLEGO e GOB.")
def cadastrar_loja_integracao(loja_in: LojaCreateOnTheFly, db: Session = Depends(get_db_lojas)):
    """
    Insere uma nova Loja no ecossistema global do e-Sigma através do lojas_db.
    Aplica a regra de ouro da GLEGO (duplicação de potência) e GOB (hierarquia normal).
    """
    logger.info(f"Iniciando cadastro on-the-fly da Loja {loja_in.numero_loja}")
    
    loja_existente = db.query(LojaIntegracao).filter(LojaIntegracao.numero_loja == loja_in.numero_loja).first()
    if loja_existente:
        logger.warning(f"Tentativa de duplicar loja: {loja_in.numero_loja}")
        raise HTTPException(status_code=422, detail="Já existe uma loja cadastrada com este número.")
    
    subobediencia = loja_in.obediencia_id
    
    nova_loja = LojaIntegracao(
        nome_loja=loja_in.nome_loja,
        numero_loja=loja_in.numero_loja,
        titulo_loja=loja_in.titulo_loja,
        rito=loja_in.rito,
        obediencia_id=loja_in.obediencia_id,
        subobediencia_id=subobediencia,
        cidade=loja_in.cidade,
        estado=loja_in.estado,
        cep=loja_in.cep,
        ativo=True
    )
    
    db.add(nova_loja)
    db.commit()
    db.refresh(nova_loja)
    
    logger.info(f"Loja {nova_loja.nome_loja} criada com sucesso com ID {nova_loja.id}")
    return {"status": "success", "loja_id": nova_loja.id, "nome": nova_loja.nome_loja}

from pydantic import BaseModel
from typing import Optional

class LojaUpdatePayload(BaseModel):
    nome: Optional[str] = None
    numero: Optional[str] = None
    rito: Optional[str] = None
    cidade: Optional[str] = None

@router.put("/{loja_id}", summary="Atualiza dados cadastrais de uma Loja", description="Corrige dados da loja tanto na lista_de_lojas_db quanto no lojas_db.")
def atualizar_loja_integracao(
    loja_id: int, 
    loja_in: LojaUpdatePayload, 
    db_lista: Session = Depends(get_db_lista),
    db_lojas: Session = Depends(get_db_lojas)
):
    logger.info(f"Atualizando cadastro da Loja {loja_id}: {loja_in}")
    
    # 1. Atualiza lista_de_lojas_db.lodges
    updates_lista = []
    params_lista = {"id": loja_id}
    if loja_in.nome is not None:
        updates_lista.append("lodge_name = :nome")
        params_lista["nome"] = loja_in.nome
    if loja_in.numero is not None:
        updates_lista.append("lodge_number = :numero")
        params_lista["numero"] = loja_in.numero
    if loja_in.rito is not None:
        updates_lista.append("rite = :rito")
        params_lista["rito"] = loja_in.rito
    if loja_in.cidade is not None:
        updates_lista.append("city = :cidade")
        params_lista["cidade"] = loja_in.cidade

    if updates_lista:
        sql = f"UPDATE lodges SET {', '.join(updates_lista)} WHERE id = :id"
        db_lista.execute(text(sql), params_lista)
        db_lista.commit()

    # 2. Atualiza lojas_db.lojas (se existir)
    updates_lojas = []
    params_lojas = {"id": loja_id}
    if loja_in.nome is not None:
        updates_lojas.append("nome_loja = :nome")
        params_lojas["nome"] = loja_in.nome
    if loja_in.numero is not None:
        updates_lojas.append("numero_loja = :numero")
        params_lojas["numero"] = loja_in.numero
    if loja_in.rito is not None:
        updates_lojas.append("rito = :rito")
        params_lojas["rito"] = loja_in.rito
    if loja_in.cidade is not None:
        updates_lojas.append("cidade = :cidade")
        params_lojas["cidade"] = loja_in.cidade

    if updates_lojas:
        sql_lojas = f"UPDATE lojas SET {', '.join(updates_lojas)} WHERE id = :id"
        try:
            db_lojas.execute(text(sql_lojas), params_lojas)
            db_lojas.commit()
        except Exception as e:
            logger.warning(f"Erro ao sincronizar lojas_db: {e}")

    return {"status": "success", "message": "Loja atualizada com sucesso!", "loja_id": loja_id}

from datetime import date

class VmMandatoUpdatePayload(BaseModel):
    data_inicio: Optional[date] = None
    nome_completo: Optional[str] = None
    email: Optional[str] = None
    cpf: Optional[str] = None
    telefone: Optional[str] = None

@router.get("/{loja_id}/vm", summary="Obtém detalhes do Venerável Mestre ativo da loja")
def obter_vm_ativo(loja_id: int, db_lojas: Session = Depends(get_db_lojas)):
    """
    Retorna os detalhes completos do Venerável Mestre com mandato ativo na loja informada.
    """
    from models.lojas_models import Mandato, ObreiroIntegracao
    mandato = db_lojas.query(Mandato).filter(
        Mandato.loja_id == loja_id,
        Mandato.cargo_id == 1,
        Mandato.data_fim.is_(None)
    ).first()

    if not mandato:
        return {"tem_vm": False, "loja_id": loja_id}

    obreiro = db_lojas.query(ObreiroIntegracao).filter(ObreiroIntegracao.id == mandato.obreiro_id).first()
    if not obreiro:
        return {"tem_vm": False, "loja_id": loja_id}

    return {
        "tem_vm": True,
        "loja_id": loja_id,
        "mandato_id": mandato.id,
        "data_inicio": mandato.data_inicio.isoformat() if mandato.data_inicio else None,
        "obreiro_id": obreiro.id,
        "cim": obreiro.cim,
        "nome_completo": obreiro.nome_completo,
        "email": obreiro.email,
        "cpf": obreiro.cpf,
        "telefone": obreiro.telefone
    }

@router.put("/{loja_id}/vm", summary="Atualiza dados do Venerável Mestre ou do Mandato ativo")
def atualizar_vm_ativo(loja_id: int, payload: VmMandatoUpdatePayload, db_lojas: Session = Depends(get_db_lojas)):
    """
    Atualiza a data de início do mandato do VM ativo e/ou seus dados pessoais globais.
    """
    from models.lojas_models import Mandato, ObreiroIntegracao
    mandato = db_lojas.query(Mandato).filter(
        Mandato.loja_id == loja_id,
        Mandato.cargo_id == 1,
        Mandato.data_fim.is_(None)
    ).first()

    if not mandato:
        raise HTTPException(status_code=404, detail="Nenhum Venerável Mestre ativo encontrado nesta loja.")

    if payload.data_inicio is not None:
        mandato.data_inicio = payload.data_inicio

    obreiro = db_lojas.query(ObreiroIntegracao).filter(ObreiroIntegracao.id == mandato.obreiro_id).first()
    if obreiro:
        if payload.nome_completo is not None:
            obreiro.nome_completo = payload.nome_completo
        if payload.email is not None:
            obreiro.email = payload.email
        if payload.cpf is not None:
            obreiro.cpf = payload.cpf
        if payload.telefone is not None:
            obreiro.telefone = payload.telefone

    db_lojas.commit()
    logger.info(f"Dados do VM / Mandato atualizados para Loja {loja_id}")
    return {
        "status": "success",
        "message": "Dados do Venerável Mestre atualizados com sucesso.",
        "loja_id": loja_id
    }

@router.delete("/{loja_id}/vm", summary="Encerra o mandato do Venerável Mestre da loja")
def encerrar_mandato_vm(loja_id: int, db_lojas: Session = Depends(get_db_lojas)):
    """
    Encerra o mandato do Venerável Mestre ativo na loja (define data_fim como hoje),
    retornando o status da loja para 'Pendente'.
    """
    from models.lojas_models import Mandato

    mandatos = db_lojas.query(Mandato).filter(
        Mandato.loja_id == loja_id,
        Mandato.cargo_id == 1,
        Mandato.data_fim.is_(None)
    ).all()

    if not mandatos:
        raise HTTPException(status_code=404, detail="Nenhum mandato de Venerável Mestre ativo encontrado nesta loja.")

    for m in mandatos:
        m.data_fim = date.today()

    db_lojas.commit()
    logger.info(f"Mandato de VM encerrado para Loja {loja_id}")
    return {"status": "success", "message": "Mandato de Venerável Mestre encerrado com sucesso."}

@router.get("/{loja_id}/vm/historico", summary="Histórico de mandatos de Veneráveis Mestres da loja")
def historico_mandatos_vm(loja_id: int, db_lojas: Session = Depends(get_db_lojas)):
    """
    Retorna o histórico cronológico de todos os mandatos de Venerável Mestre da loja.
    """
    from models.lojas_models import Mandato, ObreiroIntegracao
    resultados = db_lojas.query(
        Mandato.id,
        Mandato.data_inicio,
        Mandato.data_fim,
        ObreiroIntegracao.cim,
        ObreiroIntegracao.nome_completo
    ).join(
        ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id
    ).filter(
        Mandato.loja_id == loja_id,
        Mandato.cargo_id == 1
    ).order_by(Mandato.data_inicio.desc().nullslast(), Mandato.id.desc()).all()

    return [
        {
            "mandato_id": r.id,
            "data_inicio": r.data_inicio.isoformat() if r.data_inicio else None,
            "data_fim": r.data_fim.isoformat() if r.data_fim else None,
            "cim": r.cim,
            "nome_completo": r.nome_completo,
            "ativo": r.data_fim is None
        }
        for r in resultados
    ]

