# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
from sqlalchemy.sql import func
from loguru import logger
from database import get_db_lojas
from models.lojas_models import LojaIntegracao
from schemas.schemas import LojaCreateOnTheFly, ObreiroCreateOnTheFly

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
#
# REMOÇÃO DA DEPENDÊNCIA DE lista_de_lojas_db (2026-09-16): este arquivo era
# o ÚNICO consumidor real de lista_de_lojas_db em todo o ecossistema (busca
# global de Loja abaixo, e o dual-write com compensação em
# `atualizar_loja_integracao`) — achado confirmado por grep em e-Sigma, Lojas
# e no restante do CoReVM antes desta mudança. `lista_de_lojas_db` nasceu em
# 2026-09-11 como "banco de referência de nomenclatura" (separado de
# `lojas_db` de propósito, ver contexto-implementacao.md seção 1.9), mas
# depois que as colunas puramente operacionais foram removidas dele (seção
# 9.8), o que sobrou é essencialmente as mesmas colunas de identidade que
# `lojas_db.Loja`/`LojaIntegracao` já tem — uma segunda cópia sem nenhum
# mecanismo de sincronização automática, exatamente a mesma forma do bug
# encontrado e corrigido em `esigma.organizacoes` nesta mesma sessão (ver
# claude/decisao-controle-acesso-cadastro.md, seção 13, no Project "Core").
# Os dois endpoints abaixo passaram a ler/escrever só em `lojas_db` — a
# mesma fonte que todo o resto deste arquivo (Mandato, ObreiroIntegracao)
# já usa. `lista_de_lojas_db` continua existindo no Postgres por enquanto
# (decisão de desligar o banco em si é do usuário, feita separadamente,
# depois de confirmar estes dois endpoints em produção).


@router.get(
    "/busca",
    summary="Busca Lojas (lojas_db)",
    description="Busca lojas pelo nome, número ou cidade na base operacional do módulo Lojas.",
)
def buscar_lojas_global(q: str = Query(..., min_length=3), db_lojas: Session = Depends(get_db_lojas)):
    """
    Pesquisa as lojas pela tabela 'lojas' de 'lojas_db' (base operacional do
    módulo Lojas). Cruza a busca pelo nome, pelo número da loja e pela cidade.

    Antes desta correção (2026-09-16), a busca ia primeiro em
    `lista_de_lojas_db` — uma segunda cópia desatualizada, sem sincronização
    automática com `lojas_db` — com um fallback para `lojas_db` só se aquela
    query falhasse. Ver nota no topo do arquivo.
    """
    termo = f"%{q}%"
    try:
        result = db_lojas.execute(
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
        logger.error(f"Erro ao buscar Lojas em lojas_db: {e}")
        return []


@router.post(
    "/busca/multiplas",
    summary="Busca multiplas lojas por ID",
    description="Retorna os detalhes de varias lojas baseado em uma lista de IDs.",
)
def buscar_lojas_multiplas(ids: list[int], db_lojas: Session = Depends(get_db_lojas)):
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
        # MIGRAÇÃO (2026-09-16): lia de lista_de_lojas_db, agora lê de lojas_db
        # — ver nota no topo do arquivo.
        result = db_lojas.execute(
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
    description="Corrige dados da loja em lojas_db.",
)
def atualizar_loja_integracao(
    loja_id: int,
    loja_in: LojaUpdatePayload,
    db_lojas: Session = Depends(get_db_lojas),
):
    """
    Atualiza a Loja em lojas_db (base operacional do módulo Lojas).

    SIMPLIFICAÇÃO (2026-09-16): antes desta correção, esta rota fazia
    dual-write em dois bancos (`lista_de_lojas_db` primeiro, depois
    `lojas_db`), com uma lógica de compensação/rollback manual para o caso
    da segunda escrita falhar depois da primeira já ter sido aplicada — ver
    nota no topo do arquivo para o porquê de `lista_de_lojas_db` ter sido
    removido deste fluxo. Com um único banco de destino, não há mais
    necessidade de transação distribuída nem de compensação: ou a escrita
    em `lojas_db` funciona, ou nada é alterado (dentro da mesma sessão/
    transação).
    """
    logger.info(f"Atualizando cadastro da Loja {loja_id}: {loja_in}")

    existente = db_lojas.execute(
        text("SELECT id FROM lojas WHERE id = :id"),
        {"id": loja_id},
    ).fetchone()
    if existente is None:
        raise HTTPException(status_code=404, detail="Loja não encontrada em lojas_db.")

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
            db_lojas.rollback()
            logger.error(f"Erro ao atualizar Loja {loja_id} em lojas_db: {e}")
            raise HTTPException(
                status_code=502,
                detail="Não foi possível atualizar a Loja no módulo Lojas. Nenhuma alteração foi aplicada.",
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


# ALTERAÇÃO (2026-09-14): posse de cargo em Loja, on-the-fly (localiza ou
# cria o Obreiro pelo CIM) — hoje usada só para Venerável Mestre.
#
# CORREÇÃO (2026-09-14, bug descoberto durante a implementação da
# transmissão de cargo emergencial, ver regional/rotas.py): esta rota
# (`POST /integracao/obreiros/`) já era chamada pelo frontend desde a
# criação da tela de Gestão de VM (`ModalGestaoVM.tsx::handleEmpossarNovoVM`),
# mas nunca existia de fato no backend — toda tentativa de empossar um novo
# Venerável Mestre pela UI normal (fora do contexto de emergência) sempre
# falhava com 404 "Not Found". O schema `ObreiroCreateOnTheFly` já existia
# em `schemas.py`, mas nenhuma rota o utilizava. A lógica de posse foi
# extraída para `_empossar_obreiro_e_cargo`, reaproveitada também pela
# transmissão de cargo emergencial (mesma operação de negócio, gatilhos e
# autorização diferentes).
def _empossar_obreiro_e_cargo(
    db: Session,
    cim: str,
    nome_completo: str,
    email: Optional[str],
    cpf: Optional[str],
    loja_id: int,
    telefone: Optional[str],
    cargo_atual: Optional[str],
    data_inicio_mandato: Optional[date],
) -> dict:
    """
    Localiza (ou cria) o Obreiro pelo CIM, garante o vínculo ativo dele com
    a Loja e, quando `cargo_atual == "Venerável Mestre"`, encerra o mandato
    de VM ativo da Loja (se houver) — marcando o titular anterior com o grau
    tradicional "Mestre Instalado" (`GrauEnum.MESTRE_INSTALADO`, ver
    `Lojas/backend/models/models.py`) e a data de instalação — e abre o
    novo mandato. "Mestre Instalado" é gravado via SQL bruto (`text(...)`)
    em vez de mapear a coluna no modelo espelho `ObreiroIntegracao`, para
    não precisar reproduzir o tipo ENUM do Postgres (`grau_enum`) no lado do
    CoReVM só para esta única gravação pontual.
    """
    from models.lojas_models import Mandato, ObreiroIntegracao, ObreiroLojaAssociacao

    loja = db.query(LojaIntegracao).filter(LojaIntegracao.id == loja_id).first()
    if not loja:
        raise HTTPException(status_code=404, detail="Loja não encontrada.")

    obreiro = db.query(ObreiroIntegracao).filter(ObreiroIntegracao.cim == cim).first()
    if not obreiro:
        obreiro = ObreiroIntegracao(
            cim=cim,
            nome_completo=nome_completo,
            email=email,
            cpf=cpf,
            telefone=telefone,
            status="Ativo",
        )
        db.add(obreiro)
        db.flush()
    else:
        if nome_completo:
            obreiro.nome_completo = nome_completo
        if email:
            obreiro.email = email
        if cpf:
            obreiro.cpf = cpf
        if telefone:
            obreiro.telefone = telefone

    associacao = db.query(ObreiroLojaAssociacao).filter(
        ObreiroLojaAssociacao.obreiro_id == obreiro.id,
        ObreiroLojaAssociacao.loja_id == loja_id,
    ).first()
    if not associacao:
        db.add(ObreiroLojaAssociacao(
            obreiro_id=obreiro.id,
            loja_id=loja_id,
            status="Ativo",
            data_inicio=data_inicio_mandato or date.today(),
        ))

    resultado = {
        "status": "success",
        "obreiro_id": obreiro.id,
        "cim": obreiro.cim,
        "nome_completo": obreiro.nome_completo,
    }

    if cargo_atual == "Venerável Mestre":
        mandato_anterior = db.query(Mandato).filter(
            Mandato.loja_id == loja_id, Mandato.cargo_id == 1, Mandato.data_fim.is_(None)
        ).first()
        if mandato_anterior:
            mandato_anterior.data_fim = date.today()
            db.flush()
            if mandato_anterior.obreiro_id != obreiro.id:
                obreiro_anterior = db.query(ObreiroIntegracao).filter(
                    ObreiroIntegracao.id == mandato_anterior.obreiro_id
                ).first()
                if obreiro_anterior:
                    db.execute(
                        text("UPDATE obreiros SET grau = 'Mestre Instalado', data_instalacao = :hoje WHERE id = :id"),
                        {"hoje": date.today(), "id": obreiro_anterior.id},
                    )
                    resultado["mestre_instalado_anterior"] = {
                        "obreiro_id": obreiro_anterior.id,
                        "cim": obreiro_anterior.cim,
                        "nome_completo": obreiro_anterior.nome_completo,
                    }

        db.add(Mandato(
            obreiro_id=obreiro.id,
            cargo_id=1,
            loja_id=loja_id,
            data_inicio=data_inicio_mandato or date.today(),
            data_fim=None,
        ))
        resultado["message"] = f"Novo Venerável Mestre (Ir. {obreiro.nome_completo}) empossado com sucesso."
    else:
        resultado["message"] = f"Obreiro {obreiro.nome_completo} cadastrado/atualizado com sucesso."

    db.commit()
    logger.info(f"Posse/atualização de obreiro CIM={cim} na Loja {loja_id} (cargo_atual={cargo_atual})")
    return resultado


@router.post(
    "/obreiros/",
    response_model=dict,
    summary="Cadastra/Atualiza Obreiro On-the-Fly e Empossa Cargo (ex.: Venerável Mestre)",
    description=(
        "Localiza o Obreiro pelo CIM (cria se não existir) e, quando "
        "cargo_atual='Venerável Mestre', encerra o mandato de VM ativo da "
        "Loja (se houver) e abre um novo. Usada pela tela de Gestão de VM "
        "(posse normal, não-emergencial)."
    ),
)
def cadastrar_obreiro_integracao(obreiro_in: ObreiroCreateOnTheFly, db: Session = Depends(get_db_lojas)):
    return _empossar_obreiro_e_cargo(
        db,
        cim=obreiro_in.cim,
        nome_completo=obreiro_in.nome_completo,
        email=obreiro_in.email,
        cpf=obreiro_in.cpf,
        loja_id=obreiro_in.loja_id,
        telefone=obreiro_in.telefone,
        cargo_atual=obreiro_in.cargo_atual,
        data_inicio_mandato=obreiro_in.data_inicio_mandato,
    )
