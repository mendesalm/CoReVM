# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Serviço central de auditoria e governança do CoReVM.
Persiste a trilha de auditoria em RegistroAuditoriaRegional e emite eventos em tempo real via SSE.
"""
import json
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from loguru import logger

from models.models import RegistroAuditoriaRegional
from core.eventos_tempo_real import gerenciador_eventos


def registrar_auditoria(
    db: Session,
    regiao_id: str,
    usuario_id: str,
    acao: str,
    entidade: str,
    entidade_id: Optional[str] = None,
    detalhes: Optional[Dict[str, Any]] = None,
    usuario_nome: Optional[str] = None,
    usuario_cargo: Optional[str] = None,
    ip_origem: Optional[str] = None,
    emitir_tempo_real: bool = True
) -> RegistroAuditoriaRegional:
    """
    Grava um registro auditável de ação de governança e transmite em tempo real aos clientes conectados.
    """
    detalhes_str = json.dumps(detalhes, ensure_ascii=False) if detalhes else None

    registro = RegistroAuditoriaRegional(
        regiao_id=regiao_id,
        usuario_id=usuario_id,
        usuario_nome=usuario_nome,
        usuario_cargo=usuario_cargo,
        acao=acao,
        entidade=entidade,
        entidade_id=str(entidade_id) if entidade_id else None,
        detalhes=detalhes_str,
        ip_origem=ip_origem,
        criado_em=datetime.utcnow()
    )
    db.add(registro)
    db.commit()
    db.refresh(registro)

    logger.info(
        f"[AUDITORIA] Região: {regiao_id} | Usuário: {usuario_id} ({usuario_cargo or 'Membro'}) | "
        f"Ação: {acao} | Entidade: {entidade} (ID: {entidade_id})"
    )

    if emitir_tempo_real:
        evento_payload = {
            "auditoria_id": registro.id,
            "acao": acao,
            "entidade": entidade,
            "entidade_id": entidade_id,
            "usuario_nome": usuario_nome or f"Ir. {usuario_id}",
            "usuario_cargo": usuario_cargo,
            "criado_em": registro.criado_em.isoformat(),
            "detalhes": detalhes or {},
        }
        gerenciador_eventos.emitir_evento_sincrono(
            regiao_id=regiao_id,
            tipo_evento=f"AUDITORIA_{acao}",
            dados=evento_payload
        )

    return registro
