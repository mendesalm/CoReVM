# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Testes da validação da importação em lote de Conselho via CSV
(completude, validade, consistência interna e consultas externas mockadas).
Nenhum teste toca `lojas_db`/`esigma`: o consultor externo é um dublê.
"""
import pytest

from core.constants import AcaoImportacao, ModoImportacao, StatusLinhaImportacao
from core.importacao_conselho import (
    ErroArquivoImportacao,
    gerar_modelo_csv,
    ler_csv,
    validar_importacao,
)
from schemas.importacao_conselho import COLUNAS_CSV, cpf_valido


def linha_base(**extra):
    """Linha mínima válida (VM presidente)."""
    base = {
        "conselho_nome": "conselho regional de anápolis", "conselho_uf": "go",
        "loja_numero": "10", "loja_nome": "loja estrela do oriente", "loja_rito": "reaa",
        "loja_cidade": "anápolis", "loja_uf": "GO", "data_filiacao": "01/01/2026",
        "vm_cim": "1001", "vm_nome": "joão da silva", "vm_cpf": "529.982.247-25",
        "vm_email": "VM@Exemplo.org", "vm_data_posse": "2026-07-01",
        "cargo_diretoria": "Presidente", "inicio_mandato": "01/07/2026", "termino_mandato": "30/06/2028",
    }
    base.update(extra)
    return base


def mensagens_de(relatorio, n=1):
    return {(m.campo, m.mensagem) for m in relatorio.linhas[n - 1].mensagens}


class ConsultorFake:
    def __init__(self, agregada=None, lojas=(), obreiros=(), contas=()):
        self.agregada, self.lojas, self.obreiros, self.contas = agregada or {}, set(lojas), set(obreiros), set(contas)

    def loja_agregada_em_outra_regiao(self, numero, uf, regiao_id):
        return self.agregada.get((numero, uf))

    def loja_existe(self, numero, uf):
        return (numero, uf) in self.lojas

    def obreiro_existe(self, cim):
        return cim in self.obreiros

    def conta_existe(self, cpf, email):
        return cpf in self.contas or email in self.contas


# --- Parse --------------------------------------------------------------

def test_modelo_csv_e_valido_e_parseavel():
    linhas = ler_csv(gerar_modelo_csv().encode("utf-8"))
    rel = validar_importacao(linhas, ModoImportacao.CRIAR)
    assert rel.resumo.linhas_erro == 0, rel.linhas[0].mensagens
    assert rel.token_importacao


def test_csv_com_bom_e_virgula():
    conteudo = "\ufeff" + ",".join(COLUNAS_CSV) + "\n" + ",".join(linha_base().get(c, "") for c in COLUNAS_CSV)
    linhas = ler_csv(conteudo.encode("utf-8"))
    assert linhas[0]["vm_cim"] == "1001"


def test_cabecalho_sem_coluna_obrigatoria():
    with pytest.raises(ErroArquivoImportacao, match="vm_cpf"):
        ler_csv("conselho_nome;conselho_uf\nX;GO".encode())


def test_coluna_desconhecida():
    cab = ";".join(COLUNAS_CSV + ["senha"])
    with pytest.raises(ErroArquivoImportacao, match="desconhecidas"):
        ler_csv((cab + "\n" + ";" * len(COLUNAS_CSV) + "x").encode())


def test_arquivo_grande_rejeitado():
    with pytest.raises(ErroArquivoImportacao, match="tamanho"):
        ler_csv(b"a" * (1_048_576 + 1))


# --- Higienização / validade -------------------------------------------

def test_higienizacao_golden_rules():
    rel = validar_importacao([linha_base()], ModoImportacao.CRIAR)
    d = rel.linhas[0].dados
    assert rel.linhas[0].status == StatusLinhaImportacao.OK
    assert d["vm_cpf"] == "52998224725"
    assert d["vm_nome"] == "João da Silva"
    assert d["vm_email"] == "vm@exemplo.org"
    assert d["conselho_uf"] == "GO"
    assert d["loja_rito"] == "REAA"
    assert d["cargo_diretoria"] == "presidente"
    assert d["vm_data_posse"] == "2026-07-01"


def test_cpf_invalido_e_email_invalido_sao_reportados_por_campo():
    rel = validar_importacao([linha_base(vm_cpf="111.111.111-11", vm_email="sem-arroba")], ModoImportacao.CRIAR)
    campos = {c for c, _ in mensagens_de(rel)}
    assert {"vm_cpf", "vm_email"} <= campos
    assert rel.token_importacao is None


def test_obrigatorios_ausentes_cada_um_no_seu_campo():
    rel = validar_importacao([linha_base(vm_cim="", loja_nome="  ")], ModoImportacao.CRIAR)
    campos = {c for c, _ in mensagens_de(rel)}
    assert {"vm_cim", "loja_nome"} <= campos


def test_suplente_incompleto_e_inelegivel():
    rel = validar_importacao([linha_base(suplente_cim="2002")], ModoImportacao.CRIAR)
    assert any("Suplente incompleto" in m for _, m in mensagens_de(rel))

    rel = validar_importacao([linha_base(
        suplente_cim="2002", suplente_nome="x y", suplente_cpf="11144477735",
        suplente_email="s@x.org", suplente_cargo_loja="Cobridor Externo",
    )], ModoImportacao.CRIAR)
    assert any("inelegível" in m for _, m in mensagens_de(rel))


def test_suplente_igual_ao_vm():
    rel = validar_importacao([linha_base(
        suplente_cim="1001", suplente_nome="x", suplente_cpf="11144477735",
        suplente_email="s@x.org", suplente_cargo_loja="orador",
    )], ModoImportacao.CRIAR)
    assert any("próprio Venerável" in m for _, m in mensagens_de(rel))


def test_mandato_invertido_e_cargo_sem_datas():
    rel = validar_importacao([linha_base(inicio_mandato="01/01/2030")], ModoImportacao.CRIAR)
    assert any("anterior" in m for _, m in mensagens_de(rel))
    rel = validar_importacao([linha_base(inicio_mandato="", termino_mandato="")], ModoImportacao.CRIAR)
    assert any("exige inicio_mandato" in m for _, m in mensagens_de(rel))


# --- Consistência entre linhas -----------------------------------------

def test_duplicidades_entre_linhas():
    l1 = linha_base()
    l2 = linha_base(vm_cim="1002", vm_cpf="11144477735", vm_email="b@x.org")  # mesma Loja e mesmo cargo
    rel = validar_importacao([l1, l2], ModoImportacao.CRIAR)
    textos = " ".join(m for _, m in mensagens_de(rel, 2))
    assert "Loja repetido" in textos and "Cargo de Diretoria repetido" in textos
    assert rel.token_importacao is None


def test_conselho_divergente_bloqueia():
    l2 = linha_base(conselho_nome="Outro", loja_numero="11", vm_cim="1002", vm_cpf="11144477735",
                    vm_email="b@x.org", cargo_diretoria="", inicio_mandato="", termino_mandato="")
    rel = validar_importacao([linha_base(), l2], ModoImportacao.CRIAR)
    assert any("único Conselho" in e for e in rel.erros_gerais)
    assert rel.token_importacao is None


def test_sem_presidente_e_apenas_aviso():
    rel = validar_importacao([linha_base(cargo_diretoria="", inicio_mandato="", termino_mandato="")], ModoImportacao.CRIAR)
    assert any("Presidente" in e for e in rel.erros_gerais)
    assert rel.token_importacao  # não bloqueia


def test_atualizar_exige_regiao():
    rel = validar_importacao([linha_base()], ModoImportacao.ATUALIZAR)
    assert rel.token_importacao is None


# --- Consultas externas (dublê) ----------------------------------------

def test_loja_em_outra_regiao_bloqueia():
    consultor = ConsultorFake(agregada={("10", "GO"): "Conselho de Goiânia"})
    rel = validar_importacao([linha_base()], ModoImportacao.CRIAR, consultor=consultor)
    assert any("Goiânia" in m for _, m in mensagens_de(rel))


def test_acoes_previstas_e_contas_a_criar():
    consultor = ConsultorFake(lojas={("10", "GO")}, obreiros={"1001"})
    rel = validar_importacao([linha_base()], ModoImportacao.CRIAR, consultor=consultor)
    acoes = rel.linhas[0].acoes
    assert AcaoImportacao.VINCULAR_LOJA in acoes
    assert AcaoImportacao.VINCULAR_OBREIRO in acoes
    assert AcaoImportacao.CRIAR_CONTA in acoes
    assert AcaoImportacao.DEFINIR_DIRETORIA in acoes
    assert rel.resumo.contas_a_criar == 1


def test_token_muda_quando_dados_mudam():
    a = validar_importacao([linha_base()], ModoImportacao.CRIAR).token_importacao
    b = validar_importacao([linha_base(vm_whatsapp="62999990000")], ModoImportacao.CRIAR).token_importacao
    assert a and b and a != b


def test_cpf_valido_util():
    assert cpf_valido("52998224725") and not cpf_valido("12345678900")
