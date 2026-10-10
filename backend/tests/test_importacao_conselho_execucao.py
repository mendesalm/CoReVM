# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Testes da execução da importação de Conselho e das rotas SuperAdmin.

`core_db` é um SQLite em memória criado a partir dos modelos reais; Lojas e
e-Sigma são dublês em memória (nenhum acesso a `lojas_db`/`esigma`).
"""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.constants import CargoConselho, ModoImportacao
from core.importacao_conselho import validar_importacao
from core.importacao_conselho_execucao import executar_importacao
from models.models import (
    Base, DiretoriaConselho, HistoricoLiderancaLoja, LojaAgregada, OperadorAdministrativoLoja,
    Regiao, RegistroAuditoriaRegional, SuplenteConselho,
)
from tests.test_importacao_conselho import ConsultorFake, linha_base


# --- Dublês -----------------------------------------------------------

class LojasFake:
    def __init__(self, existentes=None, falhar_empossar=False):
        self.lojas = dict(existentes or {})  # (numero, uf) -> id
        self.vm = {}                          # loja_id -> cim
        self.criadas, self.posses, self.falhar = [], [], falhar_empossar

    def buscar_loja(self, numero, uf):
        return {"id": self.lojas[(numero, uf)]} if (numero, uf) in self.lojas else None

    def criar_loja(self, payload):
        novo_id = str(100 + len(self.lojas))
        self.lojas[(payload["numero_loja"], payload["estado"])] = novo_id
        self.criadas.append(payload)
        return {"id": novo_id}

    def cim_do_vm_ativo(self, loja_id):
        return self.vm.get(loja_id)

    def empossar(self, loja_id, payload):
        if self.falhar:
            raise HTTPException(status_code=503, detail="Lojas fora do ar")
        self.posses.append((loja_id, payload["cim"], payload["cargo_id"]))
        if payload["cargo_id"] == 1:
            self.vm[loja_id] = payload["cim"]
        return {}


class EsigmaFake:
    def __init__(self):
        self.provisionados, self.reenvios = [], []

    def provisionar_pessoas(self, pessoas, enviar_email=False):
        assert enviar_email is False  # e-mail só depois do commit
        self.provisionados.append(pessoas)
        return {"resultados": [
            {"cpf": p["cpf"], "email": p["email"], "pessoa_id": f"P-{p['cpf']}", "status": "criada"} for p in pessoas
        ]}

    def reenviar_senha(self, pessoa_id):
        self.reenvios.append(pessoa_id)
        return {"pessoa_id": pessoa_id, "email_enviado": True}


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    # Só as tabelas do core_db: Base é compartilhada com os modelos de Lojas (FKs externas).
    Base.metadata.create_all(engine, tables=[m.__table__ for m in (
        Regiao, LojaAgregada, HistoricoLiderancaLoja, SuplenteConselho,
        OperadorAdministrativoLoja, DiretoriaConselho, RegistroAuditoriaRegional)])
    sessao = sessionmaker(bind=engine)()
    yield sessao
    sessao.close()


def dados_validados(*linhas, modo=ModoImportacao.CRIAR, regiao_id=None):
    rel = validar_importacao(list(linhas), modo, regiao_id)
    assert rel.resumo.linhas_erro == 0, [l.mensagens for l in rel.linhas]
    return [l.dados for l in rel.linhas]


def executar(db, dados, lojas=None, esigma=None, modo=ModoImportacao.CRIAR, regiao_id=None, desagregar=()):
    return executar_importacao(
        db, dados, modo, regiao_id, list(desagregar), "999", "super@x.org",
        lojas or LojasFake(), esigma or EsigmaFake(),
    )


SUPLENTE = dict(suplente_cim="2002", suplente_nome="josé de souza", suplente_cpf="111.444.777-35",
                suplente_email="s@x.org", suplente_cargo_loja="Primeiro Vigilante")
POTENCIA = dict(loja_potencia_id="3")


# --- Execução ---------------------------------------------------------

def test_criacao_completa_grava_tudo_e_audita(db):
    lojas, esigma = LojasFake(), EsigmaFake()
    dados = dados_validados(linha_base(**SUPLENTE, **POTENCIA,
                                       op_secretario_cim="777", op_secretario_nome="a b", op_secretario_email="o@x.org"))
    rel = executar(db, dados, lojas, esigma)

    assert rel.lojas_processadas == 1 and rel.lojas_criadas_no_lojas == 1
    regiao = db.query(Regiao).one()
    assert regiao.nome == "Conselho Regional de Anápolis"
    loja_id = lojas.lojas[("10", "GO")]
    assert db.query(LojaAgregada).filter_by(regiao_id=regiao.id, loja_id=loja_id, ativa=True).count() == 1
    assert db.query(HistoricoLiderancaLoja).one().veneravel_cim == "1001"
    assert db.query(SuplenteConselho).one().usuario_id == "2002"
    assert db.query(OperadorAdministrativoLoja).one().slot == "SECRETARIO"
    assert db.query(RegistroAuditoriaRegional).one().acao == "IMPORTACAO_CONSELHO_CRIAR"
    # VM empossado (cargo 1) e Suplente no cargo 2; contas das duas pessoas provisionadas
    assert (loja_id, "1001", 1) in lojas.posses and (loja_id, "2002", 2) in lojas.posses
    assert len(esigma.provisionados[0]) == 2
    assert sorted(esigma.reenvios) == sorted(f"P-{c}" for c in ("52998224725", "11144477735"))
    assert all(c.email_enviado for c in rel.contas)


def test_diretor_e_vm_e_mantem_loja_id(db):
    """RBAC acumulável: a Diretoria preserva o loja_id da Loja onde o diretor é VM."""
    lojas = LojasFake()
    executar(db, dados_validados(linha_base(**POTENCIA)), lojas)
    membro = db.query(DiretoriaConselho).one()
    assert membro.cargo == CargoConselho.PRESIDENTE
    assert membro.loja_id == lojas.lojas[("10", "GO")] and membro.usuario_id == "1001"


def test_idempotencia_nao_recria_loja_nem_reempossa_vm(db):
    lojas = LojasFake()
    dados = dados_validados(linha_base(**POTENCIA))
    executar(db, dados, lojas)
    with pytest.raises(HTTPException) as exc:  # segunda vez no modo CRIAR: Conselho duplicado
        executar(db, dados, lojas)
    assert exc.value.status_code == 409
    assert len(lojas.criadas) == 1 and len(lojas.posses) == 1


def test_falha_no_lojas_nao_grava_nada_no_core(db):
    with pytest.raises(HTTPException) as exc:
        executar(db, dados_validados(linha_base(**POTENCIA)), LojasFake(falhar_empossar=True))
    assert exc.value.status_code == 503
    assert db.query(Regiao).count() == 0 and db.query(LojaAgregada).count() == 0


def test_email_so_apos_commit_core_com_rollback(db, monkeypatch):
    esigma = EsigmaFake()
    monkeypatch.setattr("core.importacao_conselho_execucao._gravar_core", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    with pytest.raises(RuntimeError):
        executar(db, dados_validados(linha_base(**POTENCIA)), esigma=esigma)
    assert esigma.reenvios == []  # ninguém recebe senha de cadastro desfeito


def test_atualizar_troca_vm_suplente_e_diretoria_sem_duplicar(db):
    lojas = LojasFake()
    executar(db, dados_validados(linha_base(**SUPLENTE, **POTENCIA)), lojas)
    regiao = db.query(Regiao).one()

    novo = linha_base(vm_cim="3003", vm_nome="pedro alves", vm_cpf="39053344705", vm_email="novo@x.org",
                      **{**SUPLENTE, "suplente_cim": "4004", "suplente_cpf": "11144477735"})
    executar(db, dados_validados(novo, modo=ModoImportacao.ATUALIZAR, regiao_id=regiao.id),
             lojas, modo=ModoImportacao.ATUALIZAR, regiao_id=regiao.id)

    assert db.query(Regiao).count() == 1 and db.query(LojaAgregada).count() == 1
    assert db.query(HistoricoLiderancaLoja).one().veneravel_cim == "3003"
    assert db.query(SuplenteConselho).one().usuario_id == "4004"
    diretoria = db.query(DiretoriaConselho).one()
    assert diretoria.usuario_id == "3003"  # cargo passa a quem o CSV indica
    assert (lojas.lojas[("10", "GO")], "3003", 1) in lojas.posses


def test_desagregacao_so_com_aprovacao_explicita(db):
    lojas = LojasFake()
    duas = [linha_base(**POTENCIA),
            linha_base(loja_numero="11", vm_cim="1002", vm_cpf="11144477735", vm_email="b@x.org",
                       cargo_diretoria="", inicio_mandato="", termino_mandato="", **POTENCIA)]
    executar(db, dados_validados(*duas), lojas)
    regiao = db.query(Regiao).one()
    id_11 = lojas.lojas[("11", "GO")]

    so_a = dados_validados(linha_base(**POTENCIA), modo=ModoImportacao.ATUALIZAR, regiao_id=regiao.id)
    executar(db, so_a, lojas, modo=ModoImportacao.ATUALIZAR, regiao_id=regiao.id)
    assert db.query(LojaAgregada).filter_by(loja_id=id_11).one().ativa is True  # ausente ≠ desagregada

    rel = executar(db, so_a, lojas, modo=ModoImportacao.ATUALIZAR, regiao_id=regiao.id, desagregar=[id_11])
    assert rel.lojas_desagregadas == 1
    assert db.query(LojaAgregada).filter_by(loja_id=id_11).one().ativa is False


def test_atualizar_regiao_inexistente_404(db):
    with pytest.raises(HTTPException) as exc:
        executar(db, dados_validados(linha_base(**POTENCIA), modo=ModoImportacao.ATUALIZAR, regiao_id="x"),
                 modo=ModoImportacao.ATUALIZAR, regiao_id="x")
    assert exc.value.status_code == 404


# --- Rotas (RBAC e token) ----------------------------------------------

@pytest.fixture
def api(monkeypatch, db):
    from main import app
    from core.auth_esigma import UsuarioEsigma, obter_usuario_esigma
    from database import get_db_core
    import api.v1.superadmin.rotas_importacao as rotas

    papel = {"role": "super_admin"}
    app.dependency_overrides[obter_usuario_esigma] = lambda: UsuarioEsigma("su@x.org", "u1", papel["role"], None, None, None, [])
    app.dependency_overrides[get_db_core] = lambda: db
    consultor = ConsultorFake(lojas={("10", "GO")})
    monkeypatch.setattr(rotas, "_consultor", lambda _db, _auth: consultor)
    yield TestClient(app), papel, rotas
    app.dependency_overrides.clear()


H = {"Authorization": "Bearer jwt-de-teste"}


def test_rotas_exigem_super_admin(api):
    cliente, papel, _ = api
    papel["role"] = "membro"
    assert cliente.get("/api/v1/superadmin/importacao-conselho/modelo-csv", headers=H).status_code == 403
    assert cliente.post("/api/v1/superadmin/importacao-conselho/confirmar", headers=H, json={
        "token_importacao": "x", "modo": "CRIAR", "linhas": []}).status_code == 403


def test_modelo_csv_download(api):
    cliente, _, _ = api
    r = cliente.get("/api/v1/superadmin/importacao-conselho/modelo-csv", headers=H)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"] and "conselho_nome" in r.text


def test_validar_upload_e_arquivo_invalido(api):
    cliente, _, _ = api
    r = cliente.post("/api/v1/superadmin/importacao-conselho/validar", headers=H, data={"modo": "CRIAR"},
                     files={"arquivo": ("x.csv", b"coluna_qualquer\n1", "text/csv")})
    assert r.status_code == 400  # cabeçalho sem colunas obrigatórias


def test_confirmar_recusa_token_divergente_e_executa_com_token_valido(api, monkeypatch):
    cliente, _, rotas = api
    lojas, esigma = LojasFake({("10", "GO"): "55"}), EsigmaFake()
    monkeypatch.setattr(rotas, "AdaptadorLojas", lambda _t: lojas)
    monkeypatch.setattr(rotas, "EsigmaProvisionamentoClient", lambda _t: esigma)

    rel = cliente.post("/api/v1/superadmin/importacao-conselho/revalidar", headers=H,
                       json={"modo": "CRIAR", "linhas": [linha_base()]}).json()
    assert rel["token_importacao"]
    linhas = [l["dados"] for l in rel["linhas"]]

    ruim = cliente.post("/api/v1/superadmin/importacao-conselho/confirmar", headers=H, json={
        "token_importacao": "falso", "modo": "CRIAR", "linhas": linhas})
    assert ruim.status_code == 409

    adulterado = [{**linhas[0], "vm_nome": "Outro Nome"}]  # editado depois da validação, com o token antigo
    assert cliente.post("/api/v1/superadmin/importacao-conselho/confirmar", headers=H, json={
        "token_importacao": rel["token_importacao"], "modo": "CRIAR", "linhas": adulterado}).status_code == 409

    ok = cliente.post("/api/v1/superadmin/importacao-conselho/confirmar", headers=H, json={
        "token_importacao": rel["token_importacao"], "modo": "CRIAR", "linhas": linhas})
    assert ok.status_code == 200, ok.text
    assert ok.json()["lojas_processadas"] == 1 and "senha" not in ok.text.lower()
