# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from loguru import logger
from typing import Optional
from database import get_db_core, get_db_lojas
from models.models import DiretoriaConselho, LojaAgregada, SuplenteConselho
from models.lojas_models import ObreiroIntegracao, Mandato

class RegionalUserContext:
    def __init__(self, usuario_id: str, role: str, regiao_id: str, is_diretoria: bool, loja_id: Optional[str] = None):
        self.usuario_id = usuario_id
        self.role = role
        self.regiao_id = regiao_id
        self.is_diretoria = is_diretoria
        self.loja_id = loja_id

    def can_edit_loja(self, target_loja_id: str) -> bool:
        if self.is_diretoria:
            return True
        return str(self.loja_id) == str(target_loja_id)

def get_current_regional_user(
    regiao_id: str,
    x_user_id: str = Header(..., description="ID ou CIM do usuário autenticado"),
    db_core: Session = Depends(get_db_core),
    db_lojas: Session = Depends(get_db_lojas)
) -> RegionalUserContext:
    """
    Resolve o contexto de permissão do usuário dentro da Região:
    - SuperAdmin / Presidente / Vice / Secretário: Diretoria (acesso pleno à gestão do conselho)
    - Venerável Mestre: Acesso de visualização regional e edição exclusiva da sua Loja
    - Suplente: Acesso de visualização regional e edição exclusiva da sua Loja
    """
    # 1. Bypasses de desenvolvimento e SuperAdmin
    if x_user_id in ["superadmin", "admin"]:
        logger.info(f"RBAC Bypass SuperAdmin: {x_user_id} na Região {regiao_id}")
        return RegionalUserContext(usuario_id=x_user_id, role="SUPERADMIN", regiao_id=regiao_id, is_diretoria=True)

    if x_user_id == "CIM_12345_PRESIDENTE":
        logger.info(f"RBAC Mock Presidente: {x_user_id} na Região {regiao_id}")
        return RegionalUserContext(usuario_id=x_user_id, role="PRESIDENTE", regiao_id=regiao_id, is_diretoria=True)

    if x_user_id.startswith("VM_"):
        loja_id_mock = x_user_id.replace("VM_", "")
        logger.info(f"RBAC Mock VM Loja {loja_id_mock}")
        return RegionalUserContext(usuario_id=x_user_id, role="VENERAVEL", regiao_id=regiao_id, is_diretoria=False, loja_id=loja_id_mock)

    # 2. Verifica se é membro da Diretoria do Conselho
    diretor = db_core.query(DiretoriaConselho).filter(
        DiretoriaConselho.regiao_id == regiao_id,
        DiretoriaConselho.usuario_id == x_user_id
    ).first()

    if diretor:
        logger.info(f"RBAC Diretoria: {diretor.cargo.value} ({x_user_id}) na Região {regiao_id}")
        return RegionalUserContext(
            usuario_id=x_user_id,
            role=diretor.cargo.value.upper(),
            regiao_id=regiao_id,
            is_diretoria=True
        )

    # 3. Obtém IDs das lojas agregadas a esta região
    lojas_conselho = db_core.query(LojaAgregada.loja_id).filter(
        LojaAgregada.regiao_id == regiao_id,
        LojaAgregada.ativa == True
    ).all()
    lojas_ids = [str(l[0]) for l in lojas_conselho]

    # 4. Verifica se é Suplente cadastrado no Conselho
    suplente = db_core.query(SuplenteConselho).filter(
        SuplenteConselho.usuario_id == x_user_id,
        SuplenteConselho.loja_id.in_(lojas_ids)
    ).first()

    if suplente:
        logger.info(f"RBAC Suplente: {x_user_id} da Loja {suplente.loja_id}")
        return RegionalUserContext(
            usuario_id=x_user_id,
            role="SUPLENTE",
            regiao_id=regiao_id,
            is_diretoria=False,
            loja_id=str(suplente.loja_id)
        )

    # 5. Verifica se é Venerável Mestre no banco lojas_db
    try:
        obreiro = db_lojas.query(ObreiroIntegracao).filter(
            (ObreiroIntegracao.cim == x_user_id) | 
            (ObreiroIntegracao.cpf == x_user_id) |
            (ObreiroIntegracao.id == int(x_user_id) if x_user_id.isdigit() else False)
        ).first()

        if obreiro:
            mandato = db_lojas.query(Mandato).filter(
                Mandato.obreiro_id == obreiro.id,
                Mandato.cargo_id == 1,
                Mandato.data_fim.is_(None)
            ).first()

            if mandato and str(mandato.loja_id) in lojas_ids:
                logger.info(f"RBAC VM: {obreiro.nome_completo} ({x_user_id}) da Loja {mandato.loja_id}")
                return RegionalUserContext(
                    usuario_id=x_user_id,
                    role="VENERAVEL",
                    regiao_id=regiao_id,
                    is_diretoria=False,
                    loja_id=str(mandato.loja_id)
                )
    except Exception as e:
        logger.warning(f"Erro ao checar mandato em lojas_db: {e}")

    logger.error(f"Acesso negado no CoReVM: {x_user_id} não possui vínculo ativo na Região {regiao_id}")
    raise HTTPException(status_code=403, detail="Acesso negado: Você não possui permissão de acesso a este Conselho Regional.")

def get_current_director(
    regiao_id: str,
    user: RegionalUserContext = Depends(get_current_regional_user)
) -> RegionalUserContext:
    """
    Exige especificamente perfil de Diretoria (SuperAdmin, Presidente, Vice-Presidente ou Secretário).
    """
    if not user.is_diretoria:
        raise HTTPException(
            status_code=403, 
            detail="Acesso negado: Esta ação é exclusiva para a Diretoria do Conselho Regional."
        )
    return user
