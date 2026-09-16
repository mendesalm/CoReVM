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
import hashlib
import os
import threading
import time
from typing import List, Optional

import requests
from fastapi import Header, HTTPException
from loguru import logger

ESIGMA_API_BASE_URL = os.getenv("ESIGMA_API_BASE_URL", "").rstrip("/")
ESIGMA_VALIDATE_TIMEOUT_SEGUNDOS = float(os.getenv("ESIGMA_VALIDATE_TIMEOUT_SEGUNDOS", "5"))

# CORREÇÃO (2026-09-14): toda rota protegida do Conselho depende de
# `obter_usuario_esigma`, que fazia uma chamada HTTP síncrona ao e-Sigma em
# TODA requisição, sem cache nenhum — identificado como a causa raiz do
# delay de 3-5s observado nos testes (mesmo depois de paralelizar as
# chamadas no frontend, a lentidão continuou, confirmando que o gargalo era
# aqui). Cache de curtíssima duração em memória do processo, por token:
# evita repetir a validação remota várias vezes dentro da mesma navegação
# (ex.: /me + /avisos disparados juntos, ou o duplo-mount do React Strict
# Mode em desenvolvimento), sem abrir mão de revalidar com frequência.
#
# Trade-off consciente: uma sessão revogada no e-Sigma (logout forçado,
# usuário desativado) pode continuar sendo aceita pelo CoReVM por até
# `ESIGMA_VALIDATE_CACHE_TTL_SEGUNDOS` depois da revogação — TTL padrão
# baixo (30s) para manter esse risco pequeno. Cache é só em memória (por
# processo); se o backend um dia rodar em múltiplas réplicas, cada réplica
# tem seu próprio cache (não há inconsistência entre elas, só que cada uma
# paga a primeira validação separadamente — comportamento aceitável, mas
# registrado aqui para não ser esquecido, mesmo padrão de nota já usado em
# core/tarefas_agendadas.py).
ESIGMA_VALIDATE_CACHE_TTL_SEGUNDOS = float(os.getenv("ESIGMA_VALIDATE_CACHE_TTL_SEGUNDOS", "30"))

_cache_validacao: dict[str, tuple[float, "UsuarioEsigma"]] = {}
_cache_lock = threading.Lock()

# CORREÇÃO (2026-09-14): o cache acima, sozinho, não evita "cache stampede"
# — quando várias requisições chegam praticamente ao mesmo tempo pro mesmo
# token (ex.: `/me` + `/avisos` disparados juntos pelo frontend via
# `Promise.all`, multiplicado pelo duplo-mount do React Strict Mode em
# desenvolvimento), todas conferem o cache ANTES de qualquer uma ter tido
# tempo de preenchê-lo, então todas dão "cache miss" e todas disparam sua
# própria chamada HTTP ao e-Sigma — confirmado nos logs do e-Sigma durante
# os testes (várias `GET /auth/validate` no mesmo milissegundo). Um lock por
# token resolve isso: a primeira requisição faz a validação de verdade; as
# que chegarem juntas esperam o resultado dela em vez de repetir a chamada.
# Nota de manutenção: diferente do `_cache_validacao`, este dicionário de
# locks não tem limpeza automática — remover um lock enquanto outra thread
# pode estar esperando nele é arriscado (race condition). Na prática isso
# não é um problema real: o número de entradas é limitado ao número de
# tokens distintos já vistos (cresce devagar, um por login), não por
# requisição. Se um dia isso importar de verdade, a solução é trocar por um
# `weakref.WeakValueDictionary` ou um TTL próprio nos locks.
_locks_validacao: dict[str, threading.Lock] = {}
_locks_dict_lock = threading.Lock()


def _chave_cache(authorization: str) -> str:
    # Nunca guarda o token em texto puro na memória do processo — só o hash,
    # que já é suficiente como chave de cache.
    return hashlib.sha256(authorization.encode("utf-8")).hexdigest()


def _obter_lock_do_token(chave: str) -> threading.Lock:
    with _locks_dict_lock:
        lock = _locks_validacao.get(chave)
        if lock is None:
            lock = threading.Lock()
            _locks_validacao[chave] = lock
        return lock


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

    chave = _chave_cache(authorization)
    agora = time.monotonic()
    with _cache_lock:
        entrada = _cache_validacao.get(chave)
        if entrada and entrada[0] > agora:
            return entrada[1]

    # A partir daqui, disputa o lock ESPECÍFICO deste token. Se outra
    # requisição concorrente já está validando o mesmo token, esta espera
    # aqui em vez de disparar uma segunda chamada HTTP ao e-Sigma.
    lock_token = _obter_lock_do_token(chave)
    with lock_token:
        # Double-checked locking: enquanto esperávamos o lock, a requisição
        # que estava à nossa frente pode já ter preenchido o cache — nesse
        # caso, usamos o resultado dela e nem chegamos a tocar na rede.
        agora = time.monotonic()
        with _cache_lock:
            entrada = _cache_validacao.get(chave)
            if entrada and entrada[0] > agora:
                return entrada[1]

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
        usuario_validado = UsuarioEsigma(
            email=usuario.get("email"),
            user_id=usuario.get("user_id"),
            role=usuario.get("role"),
            organizacao_id=usuario.get("organizacao_id"),
            cim=usuario.get("cim"),
            cpf=usuario.get("cpf"),
            modulos_ativos=dados.get("modulos_ativos", []),
        )

        with _cache_lock:
            _cache_validacao[chave] = (agora + ESIGMA_VALIDATE_CACHE_TTL_SEGUNDOS, usuario_validado)
            # Limpeza oportunista das entradas expiradas, só quando o cache
            # já cresceu bastante — evita crescimento sem limite em memória
            # sem precisar de uma tarefa agendada separada só pra isso.
            if len(_cache_validacao) > 500:
                expiradas = [k for k, v in _cache_validacao.items() if v[0] <= agora]
                for k in expiradas:
                    del _cache_validacao[k]

        return usuario_validado
