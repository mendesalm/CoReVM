"""
Testes de regressão do RBAC do Conselho Regional (core/dependencies.py).

Cada teste aqui corresponde a um bug REAL já encontrado e corrigido em
produção (ver contexto de implementação do projeto, seções 9.5 e a correção
de 2026-09-12 sobre acúmulo de Diretoria+Venerável Mestre). O objetivo não é
cobertura genérica — é garantir que esses erros específicos não voltem a
acontecer silenciosamente numa mudança futura, feita por qualquer pessoa ou
agente de IA.

Nenhum teste aqui abre conexão real com o banco: as sessões SQLAlchemy são
mockadas (ver conftest.py para o porquê das variáveis de ambiente).
"""
import importlib
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from core import dependencies


def _usuario_esigma(identificador="9900001", is_super_admin=False, email="teste@e-sigma.app"):
    """Fabrica um UsuarioEsigma mínimo, já validado (é o que auth_esigma.py devolveria)."""
    return SimpleNamespace(
        identificador_negocio=identificador,
        is_super_admin=is_super_admin,
        email=email,
    )


def test_diretoria_acumula_papel_de_veneravel_mestre():
    """
    Regressão (2026-09-12): um Presidente/Vice/Secretário do Conselho
    normalmente TAMBÉM é Venerável Mestre da própria Loja — cargos
    acumuláveis, não excludentes. Antes da correção, assim que a pessoa era
    reconhecida como Diretoria, o código nunca chegava a checar o mandato
    de VM: `loja_id` ficava sempre None, perdendo o vínculo com a própria
    Loja dentro do CoReVM. Este teste garante que `loja_id` e
    `is_veneravel` continuam sendo preenchidos mesmo quando a pessoa
    também é Diretoria — sem que isso reduza `is_diretoria`.
    """
    diretor_fake = SimpleNamespace(cargo=SimpleNamespace(value="presidente"))

    db_core = MagicMock()
    db_core.query.return_value.filter.return_value.first.return_value = diretor_fake
    db_core.query.return_value.filter.return_value.all.return_value = [("901",)]

    with patch.object(dependencies, "_resolver_loja_vm_ativa", return_value="901") as mock_resolver:
        contexto = dependencies.get_current_regional_user(
            regiao_id="regiao-teste",
            usuario=_usuario_esigma(),
            db_core=db_core,
            db_lojas=MagicMock(),
        )

    assert contexto.is_diretoria is True
    assert contexto.role == "PRESIDENTE"
    assert contexto.loja_id == "901"
    assert contexto.is_veneravel is True
    mock_resolver.assert_called_once()


def test_diretoria_sem_mandato_de_vm_no_zera_acesso():
    """Um membro de Diretoria que NÃO é VM de nenhuma Loja continua com acesso pleno (is_diretoria=True), só sem loja_id."""
    diretor_fake = SimpleNamespace(cargo=SimpleNamespace(value="secretario"))

    db_core = MagicMock()
    db_core.query.return_value.filter.return_value.first.return_value = diretor_fake
    db_core.query.return_value.filter.return_value.all.return_value = []

    with patch.object(dependencies, "_resolver_loja_vm_ativa", return_value=None):
        contexto = dependencies.get_current_regional_user(
            regiao_id="regiao-teste",
            usuario=_usuario_esigma(),
            db_core=db_core,
            db_lojas=MagicMock(),
        )

    assert contexto.is_diretoria is True
    assert contexto.loja_id is None
    assert contexto.is_veneravel is False


def test_suplente_nao_herda_papel_de_diretoria():
    """
    Regressão de regra de negócio (2026-09-12, apontada pelo usuário): o
    Suplente de uma Loja cujo VM titular também é Presidente do Conselho
    NÃO deve herdar os poderes de Diretoria — a suplência substitui a
    cadeira da LOJA no Conselho, nunca o cargo de Diretoria que o titular
    acumula. Cada identidade é resolvida pelo próprio CIM de quem loga,
    nunca pelo de quem ela substitui.
    """
    suplente_fake = SimpleNamespace(loja_id="901")

    db_core = MagicMock()
    resultados_first = iter([None, suplente_fake])  # 1) não é diretor  2) é suplente
    resultados_all = iter([[("901",)]])  # lojas agregadas à região

    db_core.query.return_value.filter.return_value.first.side_effect = lambda: next(resultados_first)
    db_core.query.return_value.filter.return_value.all.side_effect = lambda: next(resultados_all)

    contexto = dependencies.get_current_regional_user(
        regiao_id="regiao-teste",
        usuario=_usuario_esigma(identificador="9900024"),
        db_core=db_core,
        db_lojas=MagicMock(),
    )

    assert contexto.role == "SUPLENTE"
    assert contexto.is_diretoria is False
    assert contexto.loja_id == "901"


def test_sem_vinculo_nenhum_da_403():
    """Identidade validada pelo e-Sigma, mas sem NENHUM vínculo com este Conselho, deve ser recusada (403), nunca receber acesso por omissão."""
    db_core = MagicMock()
    db_core.query.return_value.filter.return_value.first.return_value = None
    db_core.query.return_value.filter.return_value.all.return_value = []

    with patch.object(dependencies, "_resolver_loja_vm_ativa", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            dependencies.get_current_regional_user(
                regiao_id="regiao-teste",
                usuario=_usuario_esigma(identificador="0000000"),
                db_core=db_core,
                db_lojas=MagicMock(),
            )

    assert exc_info.value.status_code == 403


def test_bypass_dev_desativado_por_padrao_nao_concede_acesso(monkeypatch):
    """
    Regressão de segurança CRÍTICA (2026-09-11): esta dependência já aceitou
    um identificador como "superadmin" enviado livremente pelo cliente como
    prova de identidade (vulnerabilidade real, corrigida). Hoje, um
    identificador com esse valor só concede algo se
    COREVM_PERMITIR_BYPASS_DEV estiver EXPLICITAMENTE "true". Este teste
    garante que, por padrão (variável ausente), esse valor não concede
    nenhum acesso especial — precisa passar pelas mesmas checagens de
    qualquer outra identidade.
    """
    monkeypatch.delenv("COREVM_PERMITIR_BYPASS_DEV", raising=False)
    dependencies_recarregado = importlib.reload(dependencies)

    db_core = MagicMock()
    db_core.query.return_value.filter.return_value.first.return_value = None
    db_core.query.return_value.filter.return_value.all.return_value = []

    with patch.object(dependencies_recarregado, "_resolver_loja_vm_ativa", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            dependencies_recarregado.get_current_regional_user(
                regiao_id="regiao-teste",
                usuario=_usuario_esigma(identificador="superadmin", is_super_admin=False),
                db_core=db_core,
                db_lojas=MagicMock(),
            )

    assert exc_info.value.status_code == 403

    # Restaura o módulo ao estado normal para não vazar efeito colateral a outros testes.
    importlib.reload(dependencies)


def test_can_edit_loja_diretoria_sempre_permite():
    """is_diretoria=True dá acesso de edição a qualquer Loja, independente de loja_id."""
    ctx = dependencies.RegionalUserContext(
        usuario_id="1", role="PRESIDENTE", regiao_id="r1", is_diretoria=True, loja_id=None
    )
    assert ctx.can_edit_loja("999") is True


def test_can_edit_loja_veneravel_so_a_propria_loja():
    """Um VM comum (não Diretoria) só pode editar a própria Loja, nunca outra."""
    ctx = dependencies.RegionalUserContext(
        usuario_id="1", role="VENERAVEL", regiao_id="r1", is_diretoria=False, loja_id="901"
    )
    assert ctx.can_edit_loja("901") is True
    assert ctx.can_edit_loja("902") is False
