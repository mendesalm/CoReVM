# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Serviço de importação em lote de Conselho Regional via CSV.

Este módulo NÃO depende de FastAPI e NÃO acessa `lojas_db`/`esigma`
diretamente: consultas externas são injetadas via `ConsultorExterno`
(implementado com `LojasApiClient` / cliente do e-Sigma na camada de rota),
o que mantém o serviço testável e respeita a fronteira entre módulos.

Etapa 1 (esta): parse + validação de completude, validade e consistência
interna do arquivo. Nenhum efeito colateral.
"""
import csv
import hashlib
import io
import json
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Protocol, Tuple

from loguru import logger
from pydantic import ValidationError

from core.constants import (
    AcaoImportacao,
    ModoImportacao,
    StatusLinhaImportacao,
    IMPORTACAO_MAX_LINHAS,
    IMPORTACAO_TAMANHO_MAX_BYTES,
)
from schemas.importacao_conselho import (
    COLUNAS_CSV,
    COLUNAS_OBRIGATORIAS,
    LinhaImportacaoConselho,
    MensagemValidacao,
    RelatorioValidacao,
    ResultadoLinha,
    ResumoValidacao,
)


class ErroArquivoImportacao(ValueError):
    """Erro estrutural do arquivo (tamanho, codificação, cabeçalho)."""


class ConsultorExterno(Protocol):
    """
    Contrato das consultas somente-leitura feitas durante a validação.
    Implementações reais usam as APIs do Lojas e do e-Sigma; nos testes,
    um dublê em memória.
    """

    def loja_agregada_em_outra_regiao(self, loja_numero: str, loja_uf: str, regiao_id: Optional[str]) -> Optional[str]:
        """Retorna o nome da outra Região se a Loja já estiver agregada a ela."""
        ...

    def loja_existe(self, loja_numero: str, loja_uf: str) -> bool: ...

    def obreiro_existe(self, cim: str) -> bool: ...

    def conta_existe(self, cpf: Optional[str], email: Optional[str]) -> bool: ...


# ---------------------------------------------------------------------------
# Parse
# ---------------------------------------------------------------------------

def ler_csv(conteudo: bytes) -> List[Dict[str, str]]:
    """
    Decodifica o CSV (UTF-8 com/sem BOM, fallback latin-1), detecta o
    separador (`;` ou `,`) e retorna as linhas como dicionários com as
    colunas normalizadas (minúsculas, sem espaços). Valida cabeçalho e limites.
    """
    if len(conteudo) > IMPORTACAO_TAMANHO_MAX_BYTES:
        raise ErroArquivoImportacao("Arquivo excede o tamanho máximo de 1 MB.")
    try:
        texto = conteudo.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = conteudo.decode("latin-1")

    if not texto.strip():
        raise ErroArquivoImportacao("Arquivo vazio.")

    primeira = texto.splitlines()[0]
    separador = ";" if primeira.count(";") >= primeira.count(",") else ","
    leitor = csv.DictReader(io.StringIO(texto), delimiter=separador)
    cabecalho = [(c or "").strip().lower() for c in (leitor.fieldnames or [])]

    faltando = [c for c in COLUNAS_OBRIGATORIAS if c not in cabecalho]
    if faltando:
        raise ErroArquivoImportacao("Colunas obrigatórias ausentes no cabeçalho: " + ", ".join(faltando))
    desconhecidas = [c for c in cabecalho if c and c not in COLUNAS_CSV]
    if desconhecidas:
        raise ErroArquivoImportacao("Colunas desconhecidas: " + ", ".join(desconhecidas))

    linhas: List[Dict[str, str]] = []
    for bruta in leitor:
        linha = {(k or "").strip().lower(): (v or "") for k, v in bruta.items() if k}
        if any(str(v).strip() for v in linha.values()):  # ignora linhas totalmente vazias
            linhas.append(linha)

    if not linhas:
        raise ErroArquivoImportacao("Nenhuma linha de dados encontrada.")
    if len(linhas) > IMPORTACAO_MAX_LINHAS:
        raise ErroArquivoImportacao(f"Máximo de {IMPORTACAO_MAX_LINHAS} linhas por importação.")
    return linhas


# ---------------------------------------------------------------------------
# Validação
# ---------------------------------------------------------------------------

def _validar_linha(bruta: Dict[str, Any]) -> Tuple[Optional[LinhaImportacaoConselho], List[MensagemValidacao]]:
    """
    Valida uma linha isolada. Retorna o modelo higienizado (ou None) e as
    mensagens POR CAMPO, incluindo cada obrigatório ausente separadamente,
    para que o formulário destaque a célula exata.
    """
    mensagens: List[MensagemValidacao] = []
    for campo in COLUNAS_OBRIGATORIAS:
        if not str(bruta.get(campo) or "").strip():
            mensagens.append(MensagemValidacao(campo=campo, status=StatusLinhaImportacao.ERRO, mensagem="Campo obrigatório."))

    dados = {k: v for k, v in bruta.items() if k in COLUNAS_CSV}
    try:
        modelo = LinhaImportacaoConselho(**dados)
        return modelo, mensagens
    except ValidationError as exc:
        for erro in exc.errors():
            campo = erro["loc"][0] if erro["loc"] else None
            texto = str(erro.get("ctx", {}).get("error") or erro["msg"]).removeprefix("Value error, ")
            # Ausências já reportadas por campo acima; evita duplicar.
            if campo is None and texto.startswith("Campos obrigatórios ausentes"):
                continue
            mensagens.append(MensagemValidacao(campo=campo, status=StatusLinhaImportacao.ERRO, mensagem=texto))
        return None, mensagens


def _registrar_duplicados(
    modelos: Dict[int, LinhaImportacaoConselho],
    mensagens: Dict[int, List[MensagemValidacao]],
) -> List[str]:
    """Consistência entre linhas do mesmo arquivo. Retorna erros gerais."""
    erros_gerais: List[str] = []

    # Conselho idêntico em todas as linhas.
    conselhos = {(m.conselho_nome, m.conselho_uf) for m in modelos.values()}
    if len(conselhos) > 1:
        erros_gerais.append("conselho_nome/conselho_uf diferem entre as linhas; o arquivo deve conter um único Conselho.")

    def marcar(chave_fn, campo: str, rotulo: str):
        ocorrencias = defaultdict(list)
        for n, m in modelos.items():
            chave = chave_fn(m)
            if chave:
                ocorrencias[chave].append(n)
        for chave, numeros in ocorrencias.items():
            if len(numeros) > 1:
                for n in numeros:
                    outras = ", ".join(str(x) for x in numeros if x != n)
                    mensagens[n].append(MensagemValidacao(
                        campo=campo, status=StatusLinhaImportacao.ERRO,
                        mensagem=f"{rotulo} repetido(a) nas linhas {outras}.",
                    ))

    marcar(lambda m: (m.loja_numero, m.loja_uf), "loja_numero", "Loja")
    marcar(lambda m: m.vm_cim, "vm_cim", "CIM do VM")
    marcar(lambda m: m.vm_cpf, "vm_cpf", "CPF do VM")
    marcar(lambda m: m.cargo_diretoria.value if m.cargo_diretoria else None, "cargo_diretoria", "Cargo de Diretoria")

    # Uma mesma pessoa (CIM) não pode ser VM de uma Loja e suplente de outra.
    cims_vm = {m.vm_cim: n for n, m in modelos.items()}
    for n, m in modelos.items():
        if m.suplente_cim and m.suplente_cim in cims_vm and cims_vm[m.suplente_cim] != n:
            mensagens[n].append(MensagemValidacao(
                campo="suplente_cim", status=StatusLinhaImportacao.ERRO,
                mensagem=f"Este CIM é VM na linha {cims_vm[m.suplente_cim]}.",
            ))

    # E-mail é login no e-Sigma: o mesmo e-mail não pode pertencer a CPFs diferentes.
    dono_email: Dict[str, set] = defaultdict(set)
    for m in modelos.values():
        for email, cpf in ((m.vm_email, m.vm_cpf), (m.suplente_email, m.suplente_cpf)):
            if email:
                dono_email[email].add(cpf)
    for n, m in modelos.items():
        for campo, email in (("vm_email", m.vm_email), ("suplente_email", m.suplente_email)):
            if email and len(dono_email[email]) > 1:
                mensagens[n].append(MensagemValidacao(
                    campo=campo, status=StatusLinhaImportacao.ERRO,
                    mensagem="E-mail usado por pessoas (CPFs) diferentes no arquivo.",
                ))

    if not any(m.cargo_diretoria and m.cargo_diretoria.value == "presidente" for m in modelos.values()):
        erros_gerais.append("Aviso: nenhuma linha define o Presidente do Conselho.")
    return erros_gerais


def _consultar_externo(
    n: int, m: LinhaImportacaoConselho, consultor: ConsultorExterno, regiao_id: Optional[str],
    mensagens: Dict[int, List[MensagemValidacao]], acoes: Dict[int, List[AcaoImportacao]],
) -> int:
    """Checagens somente-leitura nas APIs externas. Retorna nº de contas a criar."""
    outra = consultor.loja_agregada_em_outra_regiao(m.loja_numero, m.loja_uf, regiao_id)
    if outra:
        mensagens[n].append(MensagemValidacao(
            campo="loja_numero", status=StatusLinhaImportacao.ERRO,
            mensagem=f"Loja já agregada ao Conselho '{outra}'.",
        ))
    acoes[n].append(AcaoImportacao.VINCULAR_LOJA if consultor.loja_existe(m.loja_numero, m.loja_uf) else AcaoImportacao.CRIAR_LOJA)

    contas = 0
    pessoas = [(m.vm_cim, m.vm_cpf, m.vm_email)]
    if m.suplente_cim:
        pessoas.append((m.suplente_cim, m.suplente_cpf, m.suplente_email))
    for cim, cpf, email in pessoas:
        acoes[n].append(AcaoImportacao.VINCULAR_OBREIRO if consultor.obreiro_existe(cim) else AcaoImportacao.CRIAR_OBREIRO)
        if consultor.conta_existe(cpf, email):
            acoes[n].append(AcaoImportacao.CONTA_EXISTENTE)
        else:
            acoes[n].append(AcaoImportacao.CRIAR_CONTA)
            contas += 1
    if m.cargo_diretoria:
        acoes[n].append(AcaoImportacao.DEFINIR_DIRETORIA)
    return contas


def gerar_token(modo: ModoImportacao, regiao_id: Optional[str], linhas: List[Dict[str, Any]]) -> str:
    """Hash determinístico do conteúdo validado: garante que o confirmado é o revisado."""
    carga = json.dumps({"modo": modo.value, "regiao_id": regiao_id, "linhas": linhas}, sort_keys=True, default=str)
    return hashlib.sha256(carga.encode("utf-8")).hexdigest()


def validar_importacao(
    linhas_brutas: List[Dict[str, Any]],
    modo: ModoImportacao,
    regiao_id: Optional[str] = None,
    consultor: Optional[ConsultorExterno] = None,
) -> RelatorioValidacao:
    """
    Valida todas as linhas e monta o relatório para o formulário de revisão.
    Só emite `token_importacao` quando não há nenhum ERRO.
    """
    modelos: Dict[int, LinhaImportacaoConselho] = {}
    mensagens: Dict[int, List[MensagemValidacao]] = {}
    acoes: Dict[int, List[AcaoImportacao]] = defaultdict(list)
    erros_gerais: List[str] = []

    if modo == ModoImportacao.ATUALIZAR and not regiao_id:
        erros_gerais.append("Modo ATUALIZAR exige regiao_id.")

    for n, bruta in enumerate(linhas_brutas, start=1):
        modelo, msgs = _validar_linha(bruta)
        mensagens[n] = msgs
        if modelo and not msgs:
            modelos[n] = modelo

    erros_gerais += _registrar_duplicados(modelos, mensagens)

    contas_a_criar = 0
    if consultor:
        for n, m in modelos.items():
            try:
                contas_a_criar += _consultar_externo(n, m, consultor, regiao_id, mensagens, acoes)
            except Exception as exc:  # API externa indisponível não deve derrubar a validação
                logger.warning(f"[Importação Conselho] Falha em consulta externa na linha {n}: {exc}")
                mensagens[n].append(MensagemValidacao(
                    status=StatusLinhaImportacao.ERRO,
                    mensagem="Não foi possível consultar Lojas/e-Sigma para esta linha. Tente novamente.",
                ))

    resultados: List[ResultadoLinha] = []
    for n, bruta in enumerate(linhas_brutas, start=1):
        msgs = mensagens[n]
        if any(x.status == StatusLinhaImportacao.ERRO for x in msgs):
            status = StatusLinhaImportacao.ERRO
        elif msgs:
            status = StatusLinhaImportacao.AVISO
        else:
            status = StatusLinhaImportacao.OK
        dados = modelos[n].model_dump(mode="json") if n in modelos and status != StatusLinhaImportacao.ERRO else {
            k: bruta.get(k, "") for k in COLUNAS_CSV
        }
        resultados.append(ResultadoLinha(numero_linha=n, status=status, dados=dados, mensagens=msgs, acoes=acoes.get(n, [])))

    contagem = Counter(r.status for r in resultados)
    erros_bloqueantes = [e for e in erros_gerais if not e.startswith("Aviso:")]
    sem_erros = contagem[StatusLinhaImportacao.ERRO] == 0 and not erros_bloqueantes
    primeiro = next(iter(modelos.values()), None)

    relatorio = RelatorioValidacao(
        modo=modo,
        regiao_id=regiao_id,
        conselho_nome=primeiro.conselho_nome if primeiro else None,
        conselho_uf=primeiro.conselho_uf if primeiro else None,
        resumo=ResumoValidacao(
            total_linhas=len(resultados),
            linhas_ok=contagem[StatusLinhaImportacao.OK],
            linhas_aviso=contagem[StatusLinhaImportacao.AVISO],
            linhas_erro=contagem[StatusLinhaImportacao.ERRO],
            contas_a_criar=contas_a_criar,
        ),
        linhas=resultados,
        erros_gerais=erros_gerais,
        token_importacao=gerar_token(modo, regiao_id, [r.dados for r in resultados]) if sem_erros else None,
    )
    logger.info(
        f"[Importação Conselho] Validação modo={modo.value} regiao={regiao_id} "
        f"linhas={len(resultados)} erros={contagem[StatusLinhaImportacao.ERRO]}"
    )
    return relatorio


def gerar_modelo_csv() -> str:
    """Template CSV (separador `;`) com uma linha de exemplo."""
    exemplo = {
        "conselho_nome": "Conselho Regional de Veneráveis Mestres de Anápolis", "conselho_uf": "GO",
        "loja_numero": "1234", "loja_nome": "Loja Exemplo", "loja_rito": "REAA", "loja_cidade": "Anápolis",
        "loja_uf": "GO", "loja_email": "loja@exemplo.org", "loja_telefone": "62999990000",
        "loja_dia_sessao": "Segunda-feira", "loja_periodicidade": "Semanal", "loja_horario_sessao": "20:00",
        "data_filiacao": "01/01/2026",
        "vm_cim": "123456", "vm_nome": "João da Silva", "vm_cpf": "52998224725", "vm_email": "vm@exemplo.org",
        "vm_whatsapp": "62999991111", "vm_data_posse": "01/07/2026",
        "suplente_cim": "654321", "suplente_nome": "José de Souza", "suplente_cpf": "11144477735",
        "suplente_email": "suplente@exemplo.org", "suplente_cargo_loja": "Primeiro Vigilante",
        "cargo_diretoria": "presidente", "inicio_mandato": "01/07/2026", "termino_mandato": "30/06/2028",
    }
    saida = io.StringIO()
    escritor = csv.DictWriter(saida, fieldnames=COLUNAS_CSV, delimiter=";")
    escritor.writeheader()
    escritor.writerow({c: exemplo.get(c, "") for c in COLUNAS_CSV})
    return saida.getvalue()
