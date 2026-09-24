# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Testes unitários e de integração para o subsistema de Auditoria e Eventos em Tempo Real (SSE).
"""
import asyncio
from unittest.mock import MagicMock, patch
import pytest

from core.auditoria_service import registrar_auditoria
from core.eventos_tempo_real import GerenciadorEventosRegional


def test_registrar_auditoria_persistencia_e_payload():
    """Garante que a ação auditada é persistida com os metadados corretos."""
    db_mock = MagicMock()

    registro = registrar_auditoria(
        db=db_mock,
        regiao_id="regiao-anapolis",
        usuario_id="12345",
        acao="TESTE_AUDITORIA",
        entidade="DiretoriaConselho",
        entidade_id="PRESIDENTE",
        detalhes={"mudanca": "novo presidente"},
        usuario_nome="Ir. Fulano de Tal",
        usuario_cargo="Presidente",
        emitir_tempo_real=False,
    )

    assert db_mock.add.called
    assert db_mock.commit.called
    assert registro.regiao_id == "regiao-anapolis"
    assert registro.acao == "TESTE_AUDITORIA"
    assert registro.usuario_id == "12345"
    assert "novo presidente" in registro.detalhes


@pytest.mark.asyncio
async def test_gerenciador_eventos_sse_transmissao():
    """Testa a subscrição, publicação e cancelamento de eventos em tempo real."""
    gerenciador = GerenciadorEventosRegional()
    regiao_id = "regiao-teste-sse"

    # Assinante conecta
    fila = await gerenciador.subscrever(regiao_id)
    assert fila.qsize() == 0

    # Publica evento
    await gerenciador.publicar_evento(
        regiao_id=regiao_id,
        tipo_evento="NOVO_AVISO",
        dados={"titulo": "Aviso Urgente do Conselho", "nivel": "ALTO"}
    )

    # Verifica recebimento
    assert fila.qsize() == 1
    mensagem_recebida = await fila.get()
    assert "NOVO_AVISO" in mensagem_recebida
    assert "Aviso Urgente do Conselho" in mensagem_recebida

    # Desconexão
    await gerenciador.cancelar_subscricao(regiao_id, fila)
    assert regiao_id not in gerenciador._assinantes
