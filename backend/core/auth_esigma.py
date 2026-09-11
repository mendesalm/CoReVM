# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Cliente de integração com o e-Sigma para validação de identidade e módulos
ativos. Criado em 2026-09-11 como parte da padronização de comunicação
entre módulos via API (ver documento de contexto de implementação do
projeto): o CoReVM deixa de confiar em um identificador enviado livremente
pelo cliente (header `x-user-id`, sem verificação nenhuma) e passa a validar
a identidade do usuário contra o endpoint central GET /api/v1/auth/validate
do e-Sigma, repassando o mesmo token Bearer que o usuário já enviou.
"""
import os
from typing import List, Optional

import requests
from fastapi import Header, HTTPException
from loguru import logger

ESIGMA_API_BASE_URL = os.getenv("ESIGMA_API_BASE_URL", "").rstrip("/")
ESIGMA_VALIDATE_TIMEOUT_SEGUNDOS = float(os.getenv("ESIGMA_VALIDATE_TIMEOUT_SEGUNDOS", "5"))


class UsuarioEsigma:
    """Identidade do usuário autenticado, já validada pelo e-Sigma."""

    def __init__(
        self,
        email: Optional[str],
        user_id: Optional[str],
        role: Optional[str],
        organizacao_id: Optional[str],
        cim: Optional[str],
        cpf: Optional[str],
        modulos_ativos: List[str],
    ):
        self.email = email
        self.user_id = user_id
        self.role = role
        self.organizacao_id = organizacao_id
        self.cim = cim
        self.cpf = cpf
        self.modulos_ativos = modulos_ativos

    @property
    def is_super_admin(self) -> bool:
        return self.role == "super_admin"

    @property
    def identificador_negocio(self) -> Optional[str]:
        """Identificador usado para casar com os registros de negócio do
        CoReVM (DiretoriaConselho.usuario_id, SuplenteConselho.usuario_id,
        ObreiroIntegracao.cim/cpf) — esses registros hoje guardam CIM/CPF,
        não o UUID/e-mail interno do e-Sigma."""
        return self.cim or self.cpf or self.email


def obter_usuario_esigma(
    authorization: str = Header(
        ...,
        description="Token Bearer emitido pelo e-Sigma no login do usuário (ex.: 'Bearer eyJ...').",
    ),
) -> UsuarioEsigma:
    """
    Dependência FastAPI que substitui a antiga confiança no header
    `x-user-id` (aceito sem qualquer verificação — falha de segurança
    corrigida em 2026-09-11: qualquer requisição podia se autodeclarar
    "superadmin" e obter acesso total de Diretoria). Agora a identidade só é
    aceita depois de validada pelo e-Sigma.
    """
    if not ESIGMA_API_BASE_URL:
        logger.error("ESIGMA_API_BASE_URL não configurada — não é possível validar o usuário.")
        raise HTTPException(
            status_code=500,
            detail="Configuração ausente: ESIGMA_API_BASE_URL não definida no backend do CoReVM.",
        )

    try:
        resposta = requests.get(
            f"{ESIGMA_API_BASE_URL}/auth/validate",
            headers={"Authorization": authorization},
            timeout=ESIGMA_VALIDATE_TIMEOUT_SEGUNDOS,
        )
    except requests.RequestException as erro:
        logger.error(f"Falha ao validar token junto ao e-Sigma: {erro}")
        raise HTTPException(
            status_code=503,
            detail="Não foi possível validar suas credenciais no momento (e-Sigma indisponível). Tente novamente em instantes.",
        )

    if resposta.status_code == 401:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada. Faça login novamente.")
    if resposta.status_code != 200:
        logger.error(f"Resposta inesperada do e-Sigma ao validar token: {resposta.status_code} {resposta.text}")
        raise HTTPException(status_code=502, detail="Erro ao validar credenciais junto ao e-Sigma.")

    dados = resposta.json()
    usuario = dados.get("usuario", {})
    return UsuarioEsigma(
        email=usuario.get("email"),
        user_id=usuario.get("user_id"),
        role=usuario.get("role"),
        organizacao_id=usuario.get("organizacao_id"),
        cim=usuario.get("cim"),
        cpf=usuario.get("cpf"),
        modulos_ativos=dados.get("modulos_ativos", []),
    )
