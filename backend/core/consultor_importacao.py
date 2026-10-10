# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Adaptadores reais da importação de Conselho: ligam os contratos
`ConsultorExterno` / `OperacoesLojas` / `OperacoesEsigma` às APIs do módulo
Lojas e do e-Sigma, sempre com o JWT do SuperAdmin. Só o `core_db` é lido
diretamente (banco do próprio CoReVM). Nenhum acesso a `lojas_db`/`esigma`.

Importante: `buscar_loja` NÃO usa `LojasApiClient.buscar_lojas_global`, pois
este engole falhas de rede devolvendo lista vazia — o que faria uma queda do
Lojas parecer "Loja inexistente" e levaria a cadastros duplicados.
"""
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import HTTPException
from loguru import logger
from sqlalchemy.orm import Session

from core.esigma_cliente import EsigmaProvisionamentoClient
from core.lojas_cliente import LOJAS_API_BASE_URL, LOJAS_TIMEOUT_SEGUNDOS, LojasApiClient, _montar_headers
from models.models import LojaAgregada, Regiao


def _numero_da_loja(loja: Dict[str, Any]) -> str:
    return str(loja.get("numero_loja") or loja.get("numero") or "").strip()


def _uf_da_loja(loja: Dict[str, Any]) -> str:
    return str(loja.get("estado") or loja.get("uf") or "").strip().upper()


class AdaptadorLojas:
    """Operações no módulo Lojas (implementa `OperacoesLojas`)."""

    def __init__(self, token: str):
        self._token = token
        self._cache_busca: Dict[Tuple[str, str], Optional[Dict[str, Any]]] = {}

    def buscar_loja(self, numero: str, uf: str) -> Optional[Dict[str, Any]]:
        """Busca exata por número+UF. Falha de comunicação levanta 503 (nunca vira 'inexistente')."""
        chave = (numero, uf)
        if chave in self._cache_busca:
            return self._cache_busca[chave]
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                resposta = cliente.get(
                    f"{LOJAS_API_BASE_URL}/lojas/busca", params={"q": numero}, headers=_montar_headers(token_bearer=self._token)
                )
        except httpx.RequestError as erro:
            logger.error(f"[Importação Conselho] Lojas indisponível ao buscar Loja {numero}/{uf}: {erro}")
            raise HTTPException(status_code=503, detail="Módulo Lojas indisponível.")
        if resposta.status_code == 404:
            encontrada = None
        elif resposta.status_code != 200:
            raise HTTPException(status_code=502, detail="Erro do módulo Lojas ao buscar Loja.")
        else:
            candidatas = [l for l in resposta.json() if _numero_da_loja(l) == numero and _uf_da_loja(l) == uf]
            encontrada = candidatas[0] if len(candidatas) == 1 else None
            if len(candidatas) > 1:
                raise HTTPException(status_code=409, detail=f"Mais de uma Loja {numero}/{uf} no módulo Lojas; resolva a duplicidade.")
        self._cache_busca[chave] = encontrada
        return encontrada

    def criar_loja(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        return LojasApiClient.cadastrar_loja(payload, token=self._token)

    def cim_do_vm_ativo(self, loja_id: str) -> Optional[str]:
        dados = LojasApiClient.obter_vm_ativo(int(loja_id), token=self._token)
        return dados.get("cim") if dados.get("tem_vm") else None

    def empossar(self, loja_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        return LojasApiClient.empossar_obreiro_e_cargo(int(loja_id), payload, token=self._token)

    def obreiro_existe(self, cim: str) -> bool:
        try:
            LojasApiClient.buscar_obreiro_por_cim(cim, token=self._token)
            return True
        except HTTPException as erro:
            if erro.status_code == 404:
                return False
            raise


class ConsultorImportacao:
    """Consultas somente-leitura da validação (implementa `ConsultorExterno`)."""

    def __init__(self, db: Session, lojas: AdaptadorLojas, esigma: EsigmaProvisionamentoClient):
        self._db = db
        self._lojas = lojas
        self._esigma = esigma
        self._cache_contas: Dict[Tuple[Optional[str], Optional[str]], Dict[str, Any]] = {}

    def loja_existe(self, loja_numero: str, loja_uf: str) -> bool:
        return self._lojas.buscar_loja(loja_numero, loja_uf) is not None

    def obreiro_existe(self, cim: str) -> bool:
        return self._lojas.obreiro_existe(cim)

    def loja_agregada_em_outra_regiao(self, loja_numero: str, loja_uf: str, regiao_id: Optional[str]) -> Optional[str]:
        loja = self._lojas.buscar_loja(loja_numero, loja_uf)
        if not loja:
            return None
        consulta = self._db.query(LojaAgregada, Regiao).join(Regiao, Regiao.id == LojaAgregada.regiao_id).filter(
            LojaAgregada.loja_id == str(loja["id"]), LojaAgregada.ativa.is_(True)
        )
        if regiao_id:
            consulta = consulta.filter(LojaAgregada.regiao_id != regiao_id)
        achado = consulta.first()
        return achado[1].nome if achado else None

    def _conta(self, cpf: Optional[str], email: Optional[str]) -> Dict[str, Any]:
        chave = (cpf, email)
        if chave not in self._cache_contas:
            self._cache_contas[chave] = self._esigma.consultar_pessoas([{"cpf": cpf, "email": email}])[0]
        return self._cache_contas[chave]

    def conta_existe(self, cpf: Optional[str], email: Optional[str]) -> bool:
        conta = self._conta(cpf, email)
        return bool(conta["existe"] and conta["possui_acesso"])

    def conta_conflito(self, cpf: Optional[str], email: Optional[str]) -> Optional[str]:
        return self._conta(cpf, email).get("conflito")

    def lojas_da_regiao(self, regiao_id: str) -> List[Dict[str, Any]]:
        vinculos = self._db.query(LojaAgregada).filter(LojaAgregada.regiao_id == regiao_id, LojaAgregada.ativa.is_(True)).all()
        if not vinculos:
            return []
        detalhes = {
            str(l.get("id")): l
            for l in LojasApiClient.buscar_lojas_multiplas([v.loja_id for v in vinculos], token=self._lojas._token)
        }
        return [
            {
                "loja_id": v.loja_id,
                "numero": _numero_da_loja(detalhes.get(v.loja_id, {})),
                "uf": _uf_da_loja(detalhes.get(v.loja_id, {})),
                "nome": detalhes.get(v.loja_id, {}).get("nome_loja") or detalhes.get(v.loja_id, {}).get("nome"),
            }
            for v in vinculos
        ]
