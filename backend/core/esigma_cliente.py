# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Cliente HTTP do CoReVM para as rotas de Provisionamento em Lote do e-Sigma
(`/api/v1/provisionamento/*`, criadas em 2026-10-09).

Repassa SEMPRE o JWT do SuperAdmin que fez a requisição — o CoReVM nunca
guarda credencial própria nem acessa o banco `esigma` (AGENTS.md, seção 2).
Contrato entre serviços: alterações nas rotas do e-Sigma exigem revisar este
arquivo. A senha provisória nunca passa por aqui: o e-Sigma a envia
diretamente por e-mail ao titular.
"""
import os
from typing import Any, Dict, List, Optional

import requests
from fastapi import HTTPException
from loguru import logger

ESIGMA_API_BASE_URL = os.getenv("ESIGMA_API_BASE_URL", "").rstrip("/")
ESIGMA_PROVISIONAMENTO_TIMEOUT_SEGUNDOS = float(os.getenv("ESIGMA_PROVISIONAMENTO_TIMEOUT_SEGUNDOS", "30"))


class EsigmaProvisionamentoClient:
    """Chamadas ao provisionamento de contas do e-Sigma, autenticadas pelo token do SuperAdmin."""

    def __init__(self, token: str):
        # Aceita o header "Authorization" completo ou só o JWT.
        self._authorization = token if token.startswith("Bearer ") else f"Bearer {token}"

    def _chamar(self, metodo: str, caminho: str, corpo: Optional[dict] = None) -> Any:
        if not ESIGMA_API_BASE_URL:
            raise HTTPException(status_code=500, detail="ESIGMA_API_BASE_URL não configurada no backend do CoReVM.")
        try:
            resposta = requests.request(
                metodo,
                f"{ESIGMA_API_BASE_URL}/provisionamento{caminho}",
                json=corpo,
                headers={"Authorization": self._authorization},
                timeout=ESIGMA_PROVISIONAMENTO_TIMEOUT_SEGUNDOS,
            )
        except requests.RequestException as erro:
            logger.error(f"Falha de comunicação com o e-Sigma (provisionamento {caminho}): {erro}")
            raise HTTPException(status_code=503, detail="e-Sigma indisponível para provisionamento de contas.")

        if resposta.status_code == 409:
            # Conflito de CPF/e-mail: repassa o detalhe estruturado para o formulário.
            raise HTTPException(status_code=409, detail=resposta.json().get("detail"))
        if resposta.status_code in (401, 403):
            raise HTTPException(status_code=resposta.status_code, detail="e-Sigma recusou a operação (exige SuperAdmin).")
        if resposta.status_code == 422:
            raise HTTPException(status_code=422, detail=resposta.json().get("detail"))
        if resposta.status_code >= 400:
            logger.error(f"e-Sigma retornou {resposta.status_code} no provisionamento: {resposta.text[:300]}")
            raise HTTPException(status_code=502, detail="Erro do e-Sigma no provisionamento de contas.")
        return resposta.json()

    def consultar_pessoas(self, pessoas: List[Dict[str, Optional[str]]]) -> List[Dict[str, Any]]:
        """Consulta somente-leitura: existência, acesso e conflitos por CPF/e-mail."""
        return self._chamar("POST", "/pessoas/consulta", {"pessoas": pessoas})

    def provisionar_pessoas(self, pessoas: List[Dict[str, Any]], enviar_email: bool = False) -> Dict[str, Any]:
        """Cria/concede acesso em lote (tudo-ou-nada no e-Sigma)."""
        return self._chamar(
            "POST", "/pessoas/lote",
            {"pessoas": pessoas, "enviar_email": enviar_email, "origem": "CoReVM/importacao-conselho"},
        )

    def reenviar_senha(self, pessoa_id: str) -> Dict[str, Any]:
        """Gera nova senha provisória e envia por e-mail ao titular."""
        return self._chamar("POST", f"/pessoas/{pessoa_id}/reenviar-senha")
