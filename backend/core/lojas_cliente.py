# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Cliente HTTP oficial para integração com a API do Módulo Lojas (API-First).
Substitui o acesso direto ao banco `lojas_db`, isolando a fronteira de dados
e delegando autorizações, auditorias e regras de negócio para o ERP Lojas.
"""
import os
from typing import Any, Dict, List, Optional
import httpx
from fastapi import HTTPException
from loguru import logger

LOJAS_API_BASE_URL = os.getenv("LOJAS_API_BASE_URL", "http://localhost:8001/api/v1").rstrip("/")
LOJAS_SERVICE_KEY = os.getenv("LOJAS_SERVICE_KEY", "")
LOJAS_TIMEOUT_SEGUNDOS = float(os.getenv("LOJAS_TIMEOUT_SEGUNDOS", "10.0"))


def _montar_headers(
    token_bearer: Optional[str] = None,
    papel_operador: Optional[str] = None,
    loja_id_operador: Optional[str] = None,
) -> Dict[str, str]:
    """Monta os cabeçalhos autenticados inter-serviços com a chave de serviço e contexto do operador."""
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if LOJAS_SERVICE_KEY:
        headers["X-Service-Key"] = LOJAS_SERVICE_KEY

    if token_bearer:
        token_limpo = token_bearer if token_bearer.startswith("Bearer ") else f"Bearer {token_bearer}"
        headers["Authorization"] = token_limpo

    if papel_operador:
        headers["X-Operador-Papel"] = papel_operador

    if loja_id_operador:
        headers["X-Operador-Loja-Id"] = str(loja_id_operador)

    return headers


class LojasApiClient:
    """Cliente HTTP com conexão assíncrona/síncrona para chamadas à API do módulo Lojas."""

    @staticmethod
    def _tratar_erro(resposta: httpx.Response, acao: str):
        """Uniformiza o tratamento de erros HTTP recebidos da API do Lojas."""
        if resposta.status_code == 404:
            logger.warning(f"Recurso não encontrado no módulo Lojas ao {acao}: {resposta.text}")
            raise HTTPException(status_code=404, detail="Recurso não encontrado no módulo Lojas.")
        if resposta.status_code == 422:
            logger.warning(f"Erro de validação no módulo Lojas ao {acao}: {resposta.text}")
            detalhe = resposta.json().get("detail", "Dados inválidos para o módulo Lojas.")
            raise HTTPException(status_code=422, detail=detalhe)
        if resposta.status_code == 403:
            logger.warning(f"Acesso negado no módulo Lojas ao {acao}: {resposta.text}")
            raise HTTPException(status_code=403, detail="Permissão negada no módulo Lojas.")
        if resposta.status_code >= 500:
            logger.error(f"Erro interno no módulo Lojas ao {acao}: {resposta.status_code} - {resposta.text}")
            raise HTTPException(
                status_code=502,
                detail="O módulo Lojas retornou erro interno. Tente novamente em instantes.",
            )

    @classmethod
    def buscar_lojas_global(cls, termo: str, token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Pesquisa lojas pelo nome, número ou cidade através da API do Lojas."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/lojas/busca", params={"q": termo}, headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, f"buscar lojas com termo '{termo}'")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha de comunicação com módulo Lojas: {e}")
            raise HTTPException(
                status_code=503,
                detail="Módulo Lojas indisponível para consulta no momento.",
            )

    @classmethod
    def buscar_lojas_multiplas(cls, ids: List[int], token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Busca detalhes de múltiplas lojas por lista de IDs."""
        if not ids:
            return []
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.post(f"{LOJAS_API_BASE_URL}/lojas/busca/multiplas", json={"ids": ids}, headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, "buscar lojas múltiplas")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha de comunicação com módulo Lojas: {e}")
            raise HTTPException(
                status_code=503,
                detail="Módulo Lojas indisponível para consulta em lote.",
            )

    @classmethod
    def verificar_status_vm(cls, ids: List[int], token: Optional[str] = None) -> Dict[str, Optional[str]]:
        """Verifica o status de Venerável Mestre ativo para um lote de lojas."""
        if not ids:
            return {}
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.post(f"{LOJAS_API_BASE_URL}/mandatos/status_vm", json={"ids": ids}, headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, "verificar status VM em lote")
                dados = res.json()
                # Converte chaves inteiras ou string para formato compatível
                return {str(k): v for k, v in dados.items()}
        except httpx.RequestError as e:
            logger.error(f"Falha de comunicação com módulo Lojas (status_vm): {e}")
            return {}

    @classmethod
    def cadastrar_loja(cls, loja_in: dict, token: Optional[str] = None) -> dict:
        """Cadastra nova Loja on-the-fly via API do Lojas."""
        headers = _montar_headers(token_bearer=token, papel_operador="DIRETORIA_REGIONAL")
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.post(f"{LOJAS_API_BASE_URL}/lojas", json=loja_in, headers=headers)
                if res.status_code not in (200, 201):
                    cls._tratar_erro(res, "cadastrar loja on-the-fly")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao conectar com módulo Lojas para cadastrar loja: {e}")
            raise HTTPException(
                status_code=503,
                detail="Não foi possível cadastrar a Loja no módulo Lojas.",
            )

    @classmethod
    def atualizar_loja(
        cls,
        loja_id: int,
        payload: dict,
        token: Optional[str] = None,
        papel_operador: Optional[str] = "DIRETORIA_REGIONAL",
    ) -> dict:
        """Atualiza dados cadastrais da Loja no módulo Lojas."""
        headers = _montar_headers(
            token_bearer=token,
            papel_operador=papel_operador,
            loja_id_operador=str(loja_id),
        )
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.put(f"{LOJAS_API_BASE_URL}/lojas/{loja_id}", json=payload, headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, f"atualizar loja {loja_id}")
                return {"status": "success", "message": "Loja atualizada com sucesso!", "loja_id": loja_id}
        except httpx.RequestError as e:
            logger.error(f"Falha ao conectar com módulo Lojas para atualizar loja {loja_id}: {e}")
            raise HTTPException(
                status_code=503,
                detail="Não foi possível atualizar a Loja no módulo Lojas.",
            )

    @classmethod
    def obter_vm_ativo(cls, loja_id: int, token: Optional[str] = None) -> dict:
        """Consulta dados completos do Venerável Mestre ativo da loja."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/lojas/{loja_id}/mandatos/vm", headers=headers)
                if res.status_code == 404:
                    return {"tem_vm": False, "loja_id": loja_id}
                if res.status_code != 200:
                    cls._tratar_erro(res, f"obter VM ativo da loja {loja_id}")
                dados = res.json()
                tem_vm = dados.get("tem_vm_ativo", False)
                return {
                    "tem_vm": tem_vm,
                    "loja_id": loja_id,
                    "mandato_id": dados.get("mandato_id"),
                    "data_inicio": dados.get("data_inicio_mandato"),
                    "obreiro_id": dados.get("obreiro_id"),
                    "cim": dados.get("cim"),
                    "nome_completo": dados.get("nome_completo"),
                    "email": dados.get("email"),
                    "cpf": dados.get("cpf"),
                    "telefone": dados.get("telefone"),
                }
        except httpx.RequestError as e:
            logger.error(f"Falha ao consultar VM ativo no módulo Lojas: {e}")
            raise HTTPException(
                status_code=503,
                detail="Não foi possível consultar os dados do Venerável Mestre no módulo Lojas.",
            )

    @classmethod
    def atualizar_vm_ativo(
        cls,
        loja_id: int,
        payload: dict,
        token: Optional[str] = None,
        papel_operador: Optional[str] = "DIRETORIA_REGIONAL",
    ) -> dict:
        """Atualiza a data de início do mandato do VM ativo ou seus dados cadastrais."""
        headers = _montar_headers(
            token_bearer=token,
            papel_operador=papel_operador,
            loja_id_operador=str(loja_id),
        )
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.put(f"{LOJAS_API_BASE_URL}/lojas/{loja_id}/mandatos/vm", json=payload, headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, f"atualizar VM ativo da loja {loja_id}")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao conectar com módulo Lojas para atualizar VM da loja {loja_id}: {e}")
            raise HTTPException(
                status_code=503,
                detail="Não foi possível atualizar o Venerável Mestre no módulo Lojas.",
            )

    @classmethod
    def encerrar_mandato_vm(
        cls,
        loja_id: int,
        token: Optional[str] = None,
        papel_operador: Optional[str] = "DIRETORIA_REGIONAL",
    ) -> dict:
        """Encerra o mandato de VM ativo na Loja via API do Lojas."""
        headers = _montar_headers(
            token_bearer=token,
            papel_operador=papel_operador,
            loja_id_operador=str(loja_id),
        )
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.delete(f"{LOJAS_API_BASE_URL}/lojas/{loja_id}/mandatos/vm", headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, f"encerrar mandato de VM da loja {loja_id}")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao conectar com módulo Lojas para encerrar mandato de VM: {e}")
            raise HTTPException(
                status_code=503,
                detail="Não foi possível encerrar o mandato do Venerável Mestre no módulo Lojas.",
            )

    @classmethod
    def historico_mandatos_vm(cls, loja_id: int, token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Consulta o histórico cronológico de todos os mandatos de VM da loja."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/lojas/{loja_id}/mandatos/vm/historico", headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, f"consultar histórico de VMs da loja {loja_id}")
                itens = res.json()
                return [
                    {
                        "mandato_id": i.get("mandato_id"),
                        "data_inicio": i.get("data_inicio"),
                        "data_fim": i.get("data_fim"),
                        "cim": i.get("obreiro_cim"),
                        "nome_completo": i.get("obreiro_nome"),
                        "ativo": i.get("ativo", False),
                    }
                    for i in itens
                ]
        except httpx.RequestError as e:
            logger.error(f"Falha ao consultar histórico de mandatos de VM: {e}")
            return []

    @classmethod
    def empossar_obreiro_e_cargo(
        cls,
        loja_id: int,
        payload: dict,
        token: Optional[str] = None,
        papel_operador: Optional[str] = "DIRETORIA_REGIONAL",
    ) -> dict:
        """
        Empossa obreiro em cargo na Loja (on-the-fly).
        Garante as regras de encerramento do VM anterior e titulação de Mestre Instalado no Lojas.
        """
        headers = _montar_headers(
            token_bearer=token,
            papel_operador=papel_operador,
            loja_id_operador=str(loja_id),
        )
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.post(f"{LOJAS_API_BASE_URL}/lojas/{loja_id}/mandatos", json=payload, headers=headers)
                if res.status_code not in (200, 201):
                    cls._tratar_erro(res, f"empossar cargo na loja {loja_id}")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao conectar com módulo Lojas para empossar cargo: {e}")
            raise HTTPException(
                status_code=503,
                detail="Não foi possível empossar o cargo no módulo Lojas.",
            )

    @classmethod
    def listar_eventos_regionais(
        cls,
        lojas_ids: Optional[List[int]] = None,
        a_partir_de: Optional[str] = None,
        token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Consulta eventos das oficinas marcados com visibilidade REGIONAL."""
        headers = _montar_headers(token_bearer=token)
        params: Dict[str, Any] = {}
        if lojas_ids:
            params["lojas_ids"] = ",".join(str(i) for i in lojas_ids)
        if a_partir_de:
            params["a_partir_de"] = a_partir_de

        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/sessoes/regionais", params=params, headers=headers)
                if res.status_code != 200:
                    return []
                return res.json()
        except httpx.RequestError as e:
            logger.warning(f"Falha ao buscar eventos regionais das lojas: {e}")
            return []

    @classmethod
    def listar_documentos_regionais(
        cls,
        lojas_ids: Optional[List[int]] = None,
        tipo: Optional[str] = None,
        token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Consulta documentos das oficinas marcados com visibilidade REGIONAL."""
        headers = _montar_headers(token_bearer=token)
        params: Dict[str, Any] = {}
        if lojas_ids:
            params["lojas_ids"] = ",".join(str(i) for i in lojas_ids)
        if tipo:
            params["tipo"] = tipo

        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/documentos/regionais", params=params, headers=headers)
                if res.status_code != 200:
                    return []
                return res.json()
        except httpx.RequestError as e:
            logger.warning(f"Falha ao buscar documentos regionais das lojas: {e}")
            return []

    @classmethod
    def listar_admissoes_regionais(
        cls,
        lojas_ids: Optional[List[int]] = None,
        tipo: Optional[str] = None,
        status: Optional[str] = None,
        token: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Consulta pedidos de admissão e editais publicados pelas oficinas."""
        headers = _montar_headers(token_bearer=token)
        params: Dict[str, Any] = {}
        if lojas_ids:
            params["lojas_ids"] = ",".join(str(i) for i in lojas_ids)
        if tipo:
            params["tipo"] = tipo
        if status:
            params["status"] = status

        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/admissoes/regionais", params=params, headers=headers)
                if res.status_code != 200:
                    return []
                return res.json()
        except httpx.RequestError as e:
            logger.warning(f"Falha ao buscar prévias regionais das lojas: {e}")
            return []

    @classmethod
    def buscar_obreiro_por_cim(cls, cim: str, token: Optional[str] = None) -> Dict[str, Any]:
        """Busca dados cadastrais do obreiro por CIM via API do Lojas."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/obreiros/busca/{cim}", headers=headers)
                if res.status_code == 404:
                    raise HTTPException(status_code=404, detail="Obreiro não encontrado.")
                if res.status_code != 200:
                    cls._tratar_erro(res, f"buscar obreiro por CIM {cim}")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao consultar obreiro por CIM no módulo Lojas: {e}")
            raise HTTPException(status_code=503, detail="Módulo Lojas indisponível para busca de obreiro.")

    @classmethod
    def publicar_aviso_regional(cls, payload: Dict[str, Any], token: Optional[str] = None) -> Dict[str, Any]:
        """Publica aviso oficial do Conselho Regional no mural do módulo Lojas (via dupla)."""
        headers = _montar_headers(token_bearer=token, papel_operador="DIRETORIA_REGIONAL")
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.post(f"{LOJAS_API_BASE_URL}/avisos/regional", json=payload, headers=headers)
                if res.status_code not in (200, 201):
                    cls._tratar_erro(res, "publicar aviso regional no Lojas")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao conectar com módulo Lojas para publicar aviso: {e}")
            raise HTTPException(
                status_code=503,
                detail="Não foi possível publicar o aviso no módulo Lojas.",
            )

    @classmethod
    def listar_avisos_regionais(cls, loja_id: Optional[int] = None, token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Consulta avisos regionais publicados pelo conselho no módulo Lojas."""
        headers = _montar_headers(token_bearer=token)
        params = {}
        if loja_id is not None:
            params["loja_id"] = loja_id
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/avisos/regionais", params=params, headers=headers)
                if res.status_code != 200:
                    return []
                return res.json()
        except httpx.RequestError as e:
            logger.warning(f"Falha ao consultar avisos regionais do Lojas: {e}")
            return []

    @classmethod
    def buscar_obreiros_multiplos(cls, ids: List[int], token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Busca dados cadastrais de múltiplos obreiros por IDs via API do Lojas."""
        if not ids:
            return []
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.post(f"{LOJAS_API_BASE_URL}/obreiros/busca/multiplos", json={"ids": ids}, headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, "buscar obreiros múltiplos")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao buscar múltiplos obreiros no módulo Lojas: {e}")
            return []

    @classmethod
    def buscar_obreiro_por_id(cls, obreiro_id: int, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Busca dados cadastrais de um obreiro por ID numérico via API do Lojas."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/obreiros/busca-id/{obreiro_id}", headers=headers)
                if res.status_code == 404:
                    return None
                if res.status_code != 200:
                    cls._tratar_erro(res, f"buscar obreiro por ID {obreiro_id}")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao buscar obreiro por ID no módulo Lojas: {e}")
            return None

    @classmethod
    def obter_veneraveis_elegiveis(cls, lojas_ids: List[int], token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Consulta Veneráveis Mestres em exercício de um lote de lojas."""
        if not lojas_ids:
            return []
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.post(
                    f"{LOJAS_API_BASE_URL}/mandatos/veneraveis-elegiveis",
                    json={"lojas_ids": lojas_ids},
                    headers=headers
                )
                if res.status_code != 200:
                    cls._tratar_erro(res, "consultar veneráveis elegíveis em lote")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao consultar veneráveis elegíveis no módulo Lojas: {e}")
            return []

    @classmethod
    def listar_oficiais_loja(cls, loja_id: int, token: Optional[str] = None) -> List[Dict[str, Any]]:
        """Consulta oficiais elegíveis (cargos 2..7 e Mestres Instalados) de uma loja."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(f"{LOJAS_API_BASE_URL}/lojas/{loja_id}/oficiais-elegiveis", headers=headers)
                if res.status_code != 200:
                    cls._tratar_erro(res, f"listar oficiais elegíveis da loja {loja_id}")
                dados = res.json()
                return dados.get("oficiais", [])
        except httpx.RequestError as e:
            logger.error(f"Falha ao consultar oficiais elegíveis da loja {loja_id}: {e}")
            return []

    @classmethod
    def validar_oficial_elegivel(cls, loja_id: int, identificador: str, token: Optional[str] = None) -> Dict[str, Any]:
        """Valida se um membro é oficial elegível ou Mestre Instalado da loja."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(
                    f"{LOJAS_API_BASE_URL}/lojas/{loja_id}/oficiais-elegiveis/validar/{identificador}",
                    headers=headers
                )
                if res.status_code != 200:
                    cls._tratar_erro(res, f"validar elegibilidade do oficial {identificador}")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao validar oficial elegível no módulo Lojas: {e}")
            return {"valido": False, "motivo": "Erro de conexão com módulo Lojas.", "obreiro": None}

    @classmethod
    def buscar_obreiro_com_mandatos(cls, identificador: str, token: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Busca dados cadastrais e mandatos ativos de um obreiro por CIM, CPF ou ID."""
        headers = _montar_headers(token_bearer=token)
        try:
            with httpx.Client(timeout=LOJAS_TIMEOUT_SEGUNDOS) as cliente:
                res = cliente.get(
                    f"{LOJAS_API_BASE_URL}/obreiros/busca-identificador/{identificador}",
                    headers=headers
                )
                if res.status_code == 404:
                    return None
                if res.status_code != 200:
                    cls._tratar_erro(res, f"buscar obreiro por identificador {identificador}")
                return res.json()
        except httpx.RequestError as e:
            logger.error(f"Falha ao buscar obreiro com mandatos no módulo Lojas: {e}")
            return None




