# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import date
from loguru import logger
from database import get_db_lojas
from models.lojas_models import ObreiroIntegracao, ObreiroLojaAssociacao, Mandato
from schemas.schemas import ObreiroCreateOnTheFly

router = APIRouter()

@router.get("/busca/{cim}")
def buscar_obreiro_por_cim(cim: str, db: Session = Depends(get_db_lojas)):
    """
    Busca um obreiro pelo CIM no lojas_db.
    """
    obreiro = db.query(ObreiroIntegracao).filter(ObreiroIntegracao.cim == cim).first()
    if not obreiro:
        raise HTTPException(status_code=404, detail="Obreiro não encontrado.")
    return {
        "id": obreiro.id,
        "cim": obreiro.cim,
        "nome_completo": obreiro.nome_completo,
        "email": obreiro.email,
        "cpf": obreiro.cpf,
        "telefone": obreiro.telefone
    }

@router.post("/", response_model=dict, summary="Cadastra ou Vincula Obreiro", description="Cria ou vincula um obreiro e registra seu mandato na loja.")
def cadastrar_obreiro_integracao(obreiro_in: ObreiroCreateOnTheFly, db: Session = Depends(get_db_lojas)):
    """
    Cadastra um novo Obreiro ou vincula um já existente no lojas_db a uma Loja com seu respectivo Mandato.
    Garante a anti-duplicidade cruzada de CPF e Email entre membros distintos.
    """
    logger.info(f"Processando atribuição do Obreiro CIM: {obreiro_in.cim} para Loja {obreiro_in.loja_id}")
    
    # 1. Verifica se o obreiro já existe pelo CIM
    obreiro = db.query(ObreiroIntegracao).filter(ObreiroIntegracao.cim == obreiro_in.cim).first()
    
    if obreiro:
        logger.info(f"Obreiro existente encontrado no lojas_db: {obreiro.nome_completo} (ID {obreiro.id})")
        # Atualiza dados caso tenham sido fornecidos e estejam vazios no cadastro
        if obreiro_in.nome_completo and not obreiro.nome_completo:
            obreiro.nome_completo = obreiro_in.nome_completo
        if obreiro_in.email and not obreiro.email:
            obreiro.email = obreiro_in.email
        if obreiro_in.cpf and not obreiro.cpf:
            obreiro.cpf = obreiro_in.cpf
        if obreiro_in.telefone and not obreiro.telefone:
            obreiro.telefone = obreiro_in.telefone
        db.flush()
    else:
        # Validação de Duplicidade Cruzada contra outros membros
        filtros = []
        if obreiro_in.cpf:
            filtros.append(ObreiroIntegracao.cpf == obreiro_in.cpf)
        if obreiro_in.email:
            filtros.append(ObreiroIntegracao.email == obreiro_in.email)
            
        if filtros:
            conflito = db.query(ObreiroIntegracao).filter(or_(*filtros)).first()
            if conflito:
                logger.warning(f"Conflito de duplicidade cadastral: {conflito.nome_completo}")
                raise HTTPException(
                    status_code=422, 
                    detail=f"Conflito cadastral! O CPF ou E-mail já pertence ao obreiro {conflito.nome_completo} (CIM: {conflito.cim})."
                )
        
        # Criação do novo Obreiro
        obreiro = ObreiroIntegracao(
            cim=obreiro_in.cim,
            nome_completo=obreiro_in.nome_completo,
            email=obreiro_in.email,
            cpf=obreiro_in.cpf,
            telefone=obreiro_in.telefone,
            status='Ativo'
        )
        db.add(obreiro)
        db.flush()
    
    # 2. Associação à Loja
    associacao = db.query(ObreiroLojaAssociacao).filter(
        ObreiroLojaAssociacao.obreiro_id == obreiro.id,
        ObreiroLojaAssociacao.loja_id == obreiro_in.loja_id
    ).first()
    
    if not associacao:
        associacao = ObreiroLojaAssociacao(
            obreiro_id=obreiro.id,
            loja_id=obreiro_in.loja_id,
            status='Ativo',
            classe_obreiro='Regular',
            data_inicio=date.today()
        )
        db.add(associacao)
    
    # 3. Mandato
    cargo_str = obreiro_in.cargo_atual or (obreiro_in.cargo_loja.value if obreiro_in.cargo_loja else None)
    cargo_id_map = {
        "Venerável Mestre": 1,
        "Primeiro Vigilante": 2,
        "Segundo Vigilante": 3,
        "Orador": 4,
        "Secretário": 5,
        "Tesoureiro": 6,
        "Chanceler": 7,
        "Mestre de Harmonia": 8,
        "Hospitaleiro": 9
    }
    cargo_id = cargo_id_map.get(cargo_str, 2) if cargo_str else 2
    
    # Se for Venerável Mestre (cargo_id == 1), encerra mandatos de VM anteriores na mesma loja
    if cargo_id == 1:
        vms_anteriores = db.query(Mandato).filter(
            Mandato.loja_id == obreiro_in.loja_id,
            Mandato.cargo_id == 1,
            Mandato.data_fim.is_(None)
        ).all()
        for m in vms_anteriores:
            if m.obreiro_id != obreiro.id:
                m.data_fim = date.today()
    
    # Registra o novo mandato se ainda não estiver ativo
    mandato_ativo = db.query(Mandato).filter(
        Mandato.obreiro_id == obreiro.id,
        Mandato.loja_id == obreiro_in.loja_id,
        Mandato.cargo_id == cargo_id,
        Mandato.data_fim.is_(None)
    ).first()
    
    if not mandato_ativo:
        novo_mandato = Mandato(
            obreiro_id=obreiro.id,
            loja_id=obreiro_in.loja_id,
            cargo_id=cargo_id,
            data_inicio=obreiro_in.data_inicio_mandato or date.today()
        )
        db.add(novo_mandato)
    
    db.commit()
    db.refresh(obreiro)
    
    # 4. Envio de Notificação/Credenciais por E-mail
    try:
        import string
        import random
        from core.email_service import enviar_email_credenciais
        
        senha_temp = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
        if obreiro.email:
            enviar_email_credenciais(obreiro.email, obreiro.nome_completo, obreiro.cim, senha_temp)
    except Exception as e:
        logger.error(f"Erro ao disparar e-mail de credenciais: {e}")
    
    logger.info(f"Obreiro {obreiro.nome_completo} (CIM: {obreiro.cim}) vinculado com sucesso à Loja {obreiro_in.loja_id} como {cargo_str}")
    return {"status": "success", "obreiro_id": obreiro.id, "cim": obreiro.cim, "nome": obreiro.nome_completo}
