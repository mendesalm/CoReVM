# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Gerenciador de Eventos em Tempo Real via Server-Sent Events (SSE) para o CoReVM.
Permite streaming reativo de notificações, avisos e mudanças de governança para o frontend.
"""
import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator, Dict, List
from loguru import logger


class GerenciadorEventosRegional:
    """Gerencia subscrições e publicações de eventos em tempo real por Região (Conselho)."""

    def __init__(self):
        # Mapeamento: regiao_id -> lista de asyncio.Queue para assinantes conectados
        self._assinantes: Dict[str, List[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscrever(self, regiao_id: str) -> asyncio.Queue:
        """Registra uma nova fila de mensagens para um cliente SSE conectado."""
        fila: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            if regiao_id not in self._assinantes:
                self._assinantes[regiao_id] = []
            self._assinantes[regiao_id].append(fila)
        logger.info(f"Novo cliente conectado ao SSE da Região {regiao_id}. Assinantes ativos: {len(self._assinantes[regiao_id])}")
        return fila

    async def cancelar_subscricao(self, regiao_id: str, fila: asyncio.Queue):
        """Remove a fila do assinante desconectado."""
        async with self._lock:
            if regiao_id in self._assinantes and fila in self._assinantes[regiao_id]:
                self._assinantes[regiao_id].remove(fila)
                if not self._assinantes[regiao_id]:
                    del self._assinantes[regiao_id]
        logger.info(f"Cliente desconectado do SSE da Região {regiao_id}.")

    async def publicar_evento(self, regiao_id: str, tipo_evento: str, dados: dict):
        """Publica um evento para todos os clientes conectados ao canal SSE da Região."""
        async with self._lock:
            filas = list(self._assinantes.get(regiao_id, []))

        if not filas:
            return

        payload = {
            "tipo": tipo_evento,
            "regiao_id": regiao_id,
            "timestamp": datetime.utcnow().isoformat(),
            "dados": dados,
        }
        mensagem = json.dumps(payload, ensure_ascii=False)

        for fila in filas:
            try:
                fila.put_nowait(mensagem)
            except asyncio.QueueFull:
                logger.warning(f"Fila SSE cheia para assinante da Região {regiao_id}. Descartando evento mais antigo.")
                try:
                    _ = fila.get_nowait()
                    fila.put_nowait(mensagem)
                except Exception:
                    pass

    def emitir_evento_sincrono(self, regiao_id: str, tipo_evento: str, dados: dict):
        """Helper para emissão de evento a partir de contextos síncronos (ex: endpoints comuns do FastAPI)."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.publicar_evento(regiao_id, tipo_evento, dados), loop
                )
            else:
                loop.run_until_complete(self.publicar_evento(regiao_id, tipo_evento, dados))
        except RuntimeError:
            # Em threads separadas sem loop ativo
            try:
                novo_loop = asyncio.new_event_loop()
                novo_loop.run_until_complete(self.publicar_evento(regiao_id, tipo_evento, dados))
                novo_loop.close()
            except Exception as e:
                logger.warning(f"Falha ao emitir evento SSE em background: {e}")


# Instância Singleton global para o CoReVM
gerenciador_eventos = GerenciadorEventosRegional()


async def gerador_sse_regional(regiao_id: str) -> AsyncGenerator[str, None]:
    """Gera um stream SSE compatível com navegadores e clientes EventSource."""
    fila = await gerenciador_eventos.subscrever(regiao_id)
    try:
        # Envia heartbeat inicial de conexão estabelecida
        boas_vindas = json.dumps({
            "tipo": "CONEXAO_ESTABELECIDA",
            "regiao_id": regiao_id,
            "timestamp": datetime.utcnow().isoformat(),
            "dados": {"status": "conectado", "mensagem": "Canal de tempo real ativo"}
        }, ensure_ascii=False)
        yield f"event: conectou\ndata: {boas_vindas}\n\n"

        while True:
            try:
                # Aguarda nova mensagem com timeout de heartbeat a cada 25s
                mensagem = await asyncio.wait_for(fila.get(), timeout=25.0)
                yield f"event: mensagem\ndata: {mensagem}\n\n"
            except asyncio.TimeoutError:
                # Heartbeat para manter conexão aberta contra proxies e load balancers
                yield ": heartbeat\n\n"
    except asyncio.CancelledError:
        logger.info(f"Stream SSE cancelado para a Região {regiao_id}")
    finally:
        await gerenciador_eventos.cancelar_subscricao(regiao_id, fila)
