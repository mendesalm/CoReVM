# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
from sqlalchemy.sql import func
from loguru import logger
from database import get_db_lojas, get_db_lista
from models.lojas_models import LojaIntegracao
from schemas.schemas import LojaCreateOnTheFly

router = APIRouter()

# CORREÇÃO DE NOMENCLATURA (2026-09-11): antes desta correção, lista_de_lojas_db
# usava tabelas/colunas em inglês (lodges, lodge_name, city, obedience_id...),
# herdadas do projeto de referência legado. Cada endpoint deste arquivo fazia
# sua própria tradução manual inglês->português (3 cópias divergentes do mesmo
# mapeamento, ver seção 1.9/9.6 do contexto de implementação). Após a migração
# de schema (migracao_lista_de_lojas_pt_br.sql), lista_de_lojas_db passou a usar
# as MESMAS convenções de nome do resto do ecossistema (tabelas "lojas"/
# "obediencias", colunas nome_loja/numero_loja/cidade/rito/potencia_id...),
# então este arquivo não precisa mais de nenhuma tradução ad-hoc — as queries
# abaixo já usam os nomes definitivos em PT-BR.
#
# ALTERAÇÃO DE HIERARQUIA (2026-09-11, ver seção 9.9): "Potência" passou a
# ser o nível superior e "Obediência" o nível subordinado à Potência (com
# Loja subordinada à Obediência) — antes "obediencia_id" apontava para o
# nível superior e "subobediencia_id" para o intermediário. As queries e o
# cadastro on-the-fly abaixo já usam potencia_id/obediencia_id.


@router.get(
    "/busca",
    summary="Busca Lojas no banco global (lista_de_lojas_db)",
    description="Busca lojas pelo nome ou número na base unificada de todas as lojas.",
)
def buscar_lojas_global(q: str = Query(..., min_length=3), db_lista: Session = Depends(get_db_lista)):
    """
    Pesquisa as lojas globalmente na tabela 'lojas' do 'lista_de_lojas_db'.
    Cruza a busca pelo nome, pelo número da loja e pela cidade.
    """
    termo = f"%{q}%"
    try:
        result = db_lista.execute(
            text(
                """
                SELECT l.id, l.nome_loja, l.numero_loja, l.cidade, o.sigla
                FROM lojas l
                LEFT JOIN obediencias o ON l.potencia_id = o.id
                WHERE l.nome_loja ILIKE :t OR l.numero_loja ILIKE :t OR l.cidade ILIKE :t
                LIMIT 20
                """
            ),
            {"t": termo},
        ).fetchall()

        return [
            {
                "id": row[0],
                "nome": row[1],
                "numero_loja": str(row[2]) if row[2] is not None else None,
                "cidade": row[3] or "",
                "potencia": row[4] or "",
            }
            for row in result
        ]
    except Exception as e:
        logger.error(f"Erro ao buscar na lista_de_lojas_db: {e}")
        # Fallback para lojas_db, caso lista_de_lojas_db esteja indisponível.
        # CORREÇÃO (2026-09-11): o fallback anterior montava a lista mas
        # nunca retornava (bug — a função terminava sem `return` nesse
        # caminho). Agora o resultado do fallback é de fato devolvido.
        try:
            db_lojas = next(get_db_lojas())
            lojas = (
                db_lojas.query(LojaIntegracao)
                .filter(
                    (LojaIntegracao.nome_loja.ilike(termo))
                    | (LojaIntegracao.numero_loja.ilike(termo))
                    | (LojaIntegracao.cidade.ilike(termo))
                )
                .limit(20)
                .all()
            )
            return [
                {
                    "id": loja.id,
                    "nome": loja.nome_loja,
                    "numero_loja": loja.numero_loja,
                    "cidade": loja.cidade or "",
                    "potencia": "",
                }
                for loja in lojas
            ]
        except Exception as e2:
            logger.error(f"Erro no fallback para lojas_db: {e2}")
            return []


@router.post(
    "/busca/multiplas",
    summary="Busca multiplas lojas por ID",
    description="Retorna os detalhes de varias lojas baseado em uma lista de IDs.",
)
def buscar_lojas_multiplas(ids: list[int], db_lista: Session = Depends(get_db_lista)):
    if not ids:
        return []

    ids_validos = [i for i in ids if isinstance(i, int)]
    if not ids_validos:
        return []

    try:
        # CORREÇÃO (2026-09-11): a query anterior montava a lista de IDs
        # como string via ",".join(...) e interpolava direto no SQL (f-string).
        # Funcionava sem risco de injeção só porque filtrava por isinstance(int)
        # antes, mas não é o padrão correto — agora usa bind parameter com
        # ANY(:ids), como o SQLAlchemy espera.
        result = db_lista.execute(
            text(
                """
                SELECT l.id, l.nome_loja, l.numero_loja, l.cidade, o.sigla, l.rito
                FROM lojas l
                LEFT JOIN obediencias o ON l.potencia_id = o.id
                WHERE l.id = ANY(:ids)
                """
            ),
            {"ids": ids_validos},
        ).fetchall()

        return [
            {
                "id": row[0],
                "nome": row[1],
                "numero": str(row[2]) if row[2] is not None else None,
                "cidade": row[3] or "",
                "potencia": row[4] or "",
                "rito": row[5] or "",
            }
            for row in result
        ]
    except Exception as e:
        logger.error(f"Erro ao buscar lojas em lote: {e}")
        return []


@router.post(
    "/status_vm",
    summary="Verifica status de Venerável Mestre",
    description="Retorna os nomes dos VMs cadastrados nas lojas solicitadas",
)
def verificar_status_vm(ids: list[int], db_lojas: Session = Depends(get_db_lojas)):
    try:
        if not ids:
            return {}

        from models.lojas_models import Mandato, ObreiroIntegracao

        resultados = (
            db_lojas.query(Mandato.loja_id, ObreiroIntegracao.nome_completo)
            .join(ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id)
            .filter(
                Mandato.loja_id.in_(ids),
                Mandato.cargo_id == 1,
                or_(Mandato.data_fim.is_(None), Mandato.data_fim >= func.current_date()),
            )
            .all()
        )

        lojas_com_vm = {row.loja_id: row.nome_completo for row in resultados}
        return {loja_id: lojas_com_vm.get(loja_id) for loja_id in ids}
    except Exception as e:
        logger.error(f"Erro ao verificar status VM em lote: {e}")
        return {}


@router.post(
    "/",
    response_model=dict,
    summary="Cadastra Loja On-the-Fly",
    description="Cria uma loja diretamente no lojas_db respeitando regras de GLEGO e GOB.",
)
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

    # ALTERAÇÃO (2026-09-11, seção 9.9): no cadastro on-the-fly ainda não se
    # distingue Potência de Obediência — por padrão, a Obediência nasce igual
    # à Potência informada (mesmo comportamento de antes, só com os nomes
    # corrigidos). Quando o cadastro completo for desenhado, esse valor pode
    # passar a ser preenchido com a Obediência real, diferente da Potência.
    obediencia_default = loja_in.potencia_id

    nova_loja = LojaIntegracao(
        nome_loja=loja_in.nome_loja,
        numero_loja=loja_in.numero_loja,
        titulo_loja=loja_in.titulo_loja,
        rito=loja_in.rito,
        potencia_id=loja_in.potencia_id,
        obediencia_id=obediencia_default,
        cidade=loja_in.cidade,
        estado=loja_in.estado,
        cep=loja_in.cep,
        ativo=True,
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


@router.put(
    "/{loja_id}",
    summary="Atualiza dados cadastrais de uma Loja",
    description="Corrige dados da loja tanto na lista_de_lojas_db quanto no lojas_db.",
)
def atualizar_loja_integracao(
    loja_id: int,
    loja_in: LojaUpdatePayload,
    db_lista: Session = Depends(get_db_lista),
    db_lojas: Session = Depends(get_db_lojas),
):
    """
    Atualiza a Loja nos dois bancos. Escreve primeiro em lista_de_lojas_db
    (fonte de verdade de nomenclatura) e só então em lojas_db (operacional).

    CORREÇÃO (2026-09-11): antes desta correção, se a segunda escrita
    (lojas_db) falhasse, o erro era só logado como warning e a resposta
    ainda dizia "success" — deixando os dois bancos dessincronizados sem
    aviso nenhum para quem chamou a API. Agora, se a escrita em lojas_db
    falhar, o CoReVM tenta desfazer (compensar) a escrita já feita em
    lista_de_lojas_db e retorna 502 deixando claro que a atualização NÃO
    foi aplicada de forma consistente. Não é uma transação distribuída de
    verdade (os dois bancos são serviços diferentes) — é um best-effort de
    compensação; ainda existe uma janela pequena de inconsistência possível
    se o próprio rollback falhar, o que é logado como ERROR para auditoria.
    """
    logger.info(f"Atualizando cadastro da Loja {loja_id}: {loja_in}")

    updates_lista = []
    params_lista = {"id": loja_id}
    valores_antigos_lista = {}

    if any([loja_in.nome, loja_in.numero, loja_in.rito, loja_in.cidade]):
        # Guarda os valores atuais em lista_de_lojas_db para permitir
        # compensação (rollback manual) se a escrita em lojas_db falhar.
        atual = db_lista.execute(
            text("SELECT nome_loja, numero_loja, rito, cidade FROM lojas WHERE id = :id"),
            {"id": loja_id},
        ).fetchone()
        if atual is None:
            raise HTTPException(status_code=404, detail="Loja não encontrada em lista_de_lojas_db.")
        valores_antigos_lista = {
            "nome_loja": atual[0],
            "numero_loja": atual[1],
            "rito": atual[2],
            "cidade": atual[3],
        }

    if loja_in.nome is not None:
        updates_lista.append("nome_loja = :nome")
        params_lista["nome"] = loja_in.nome
    if loja_in.numero is not None:
        updates_lista.append("numero_loja = :numero")
        params_lista["numero"] = loja_in.numero
    if loja_in.rito is not None:
        updates_lista.append("rito = :rito")
        params_lista["rito"] = loja_in.rito
    if loja_in.cidade is not None:
        updates_lista.append("cidade = :cidade")
        params_lista["cidade"] = loja_in.cidade

    if updates_lista:
        sql = f"UPDATE lojas SET {', '.join(updates_lista)} WHERE id = :id"
        db_lista.execute(text(sql), params_lista)
        db_lista.commit()

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
            logger.error(f"Erro ao sincronizar lojas_db para Loja {loja_id}: {e}")
            # Compensação: tenta desfazer a escrita já feita em lista_de_lojas_db.
            if updates_lista and valores_antigos_lista:
                try:
                    db_lista.execute(
                        text(
                            "UPDATE lojas SET nome_loja = :nome_loja, numero_loja = :numero_loja, "
                            "rito = :rito, cidade = :cidade WHERE id = :id"
                        ),
                        {**valores_antigos_lista, "id": loja_id},
                    )
                    db_lista.commit()
                    logger.warning(
                        f"Rollback de compensação aplicado em lista_de_lojas_db para Loja {loja_id} "
                        f"após falha em lojas_db."
                    )
                except Exception as e_rollback:
                    logger.error(
                        f"FALHA CRÍTICA: não foi possível compensar lista_de_lojas_db para Loja "
                        f"{loja_id} após falha em lojas_db. Bancos podem estar dessincronizados. "
                        f"Erro original: {e}. Erro no rollback: {e_rollback}"
                    )
            raise HTTPException(
                status_code=502,
                detail="Não foi possível sincronizar a atualização com o módulo Lojas. Nenhuma alteração foi aplicada.",
            )

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
        Mandato.data_fim.is_(None),
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
        "telefone": obreiro.telefone,
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
        Mandato.data_fim.is_(None),
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
        "loja_id": loja_id,
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
        Mandato.data_fim.is_(None),
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

    resultados = (
        db_lojas.query(
            Mandato.id,
            Mandato.data_inicio,
            Mandato.data_fim,
            ObreiroIntegracao.cim,
            ObreiroIntegracao.nome_completo,
        )
        .join(ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id)
        .filter(Mandato.loja_id == loja_id, Mandato.cargo_id == 1)
        .order_by(Mandato.data_inicio.desc().nullslast(), Mandato.id.desc())
        .all()
    )

    return [
        {
            "mandato_id": r.id,
            "data_inicio": r.data_inicio.isoformat() if r.data_inicio else None,
            "data_fim": r.data_fim.isoformat() if r.data_fim else None,
            "cim": r.cim,
            "nome_completo": r.nome_completo,
            "ativo": r.data_fim is None,
        }
        for r in resultados
    ]
