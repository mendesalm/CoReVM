# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Schemas da importação em lote de Conselho Regional via CSV.

Cada linha do CSV representa UMA Loja jurisdicionada, com seu Venerável
Mestre (obrigatório), Suplente do Conselho (opcional), Operadores
Administrativos (opcionais) e, se o VM compõe a Mesa Diretora, o cargo e
mandato na Diretoria do Conselho (todo diretor é VM — decisão 2026-10-09).

O backend é o guardião final das Golden Rules: todos os campos são
higienizados aqui (CPF só dígitos, nomes em Title Case, e-mail minúsculo...).
"""
import re
from datetime import date, datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field, field_validator, model_validator

from core.constants import (
    RitoMaconico,
    CargoConselho,
    ModoImportacao,
    StatusLinhaImportacao,
    AcaoImportacao,
    CARGOS_SUPLENTE_ELEGIVEIS_NOMES,
)

# Colunas oficiais do modelo CSV, na ordem do template para download.
COLUNAS_CSV: List[str] = [
    "conselho_nome", "conselho_uf",
    "loja_numero", "loja_nome", "loja_rito", "loja_cidade", "loja_uf",
    "loja_email", "loja_telefone", "loja_dia_sessao", "loja_periodicidade",
    "loja_horario_sessao", "data_filiacao", "loja_potencia_id",
    "vm_cim", "vm_nome", "vm_cpf", "vm_email", "vm_whatsapp", "vm_data_posse",
    "suplente_cim", "suplente_nome", "suplente_cpf", "suplente_email", "suplente_cargo_loja",
    "op_secretario_cim", "op_secretario_nome", "op_secretario_email",
    "op_chanceler_cim", "op_chanceler_nome", "op_chanceler_email",
    "cargo_diretoria", "inicio_mandato", "termino_mandato",
]

# Campos obrigatórios em toda linha (completude mínima).
COLUNAS_OBRIGATORIAS = (
    "conselho_nome", "conselho_uf",
    "loja_numero", "loja_nome", "loja_rito", "loja_cidade", "loja_uf", "data_filiacao",
    "vm_cim", "vm_nome", "vm_cpf", "vm_email", "vm_data_posse",
)

UFS_VALIDAS = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
    "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
}

_REGEX_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Preposições mantidas em minúsculo no Title Case (padrão de nomes pt-BR).
_PREPOSICOES = {"da", "de", "do", "das", "dos", "e"}


# ---------------------------------------------------------------------------
# Funções de higienização reutilizáveis
# ---------------------------------------------------------------------------

def titulo_ptbr(valor: str) -> str:
    """Converte para Title Case preservando preposições (ex.: 'João da Silva')."""
    palavras = valor.strip().split()
    return " ".join(
        p.lower() if i > 0 and p.lower() in _PREPOSICOES else p.capitalize()
        for i, p in enumerate(palavras)
    )


def cpf_valido(cpf: str) -> bool:
    """Valida os dígitos verificadores de um CPF já contendo só números."""
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for tamanho in (9, 10):
        soma = sum(int(cpf[i]) * (tamanho + 1 - i) for i in range(tamanho))
        digito = (soma * 10 % 11) % 10
        if digito != int(cpf[tamanho]):
            return False
    return True


def normalizar_cpf(valor: str) -> str:
    """Remove pontuação e valida o CPF; levanta ValueError se inválido."""
    cpf = re.sub(r"\D", "", valor)
    if not cpf_valido(cpf):
        raise ValueError("CPF inválido (verifique os dígitos).")
    return cpf


def normalizar_email(valor: str) -> str:
    """E-mail minúsculo e com formato válido."""
    email = valor.strip().lower()
    if not _REGEX_EMAIL.match(email):
        raise ValueError("E-mail em formato inválido.")
    return email


def normalizar_telefone(valor: str) -> str:
    """Telefone/WhatsApp só dígitos, com DDD (10 ou 11 dígitos; aceita +55)."""
    digitos = re.sub(r"\D", "", valor)
    if digitos.startswith("55") and len(digitos) in (12, 13):
        digitos = digitos[2:]
    if len(digitos) not in (10, 11):
        raise ValueError("Telefone deve ter DDD + número (10 ou 11 dígitos).")
    return digitos


def normalizar_uf(valor: str) -> str:
    """UF em maiúsculo e pertencente à lista oficial."""
    uf = valor.strip().upper()
    if uf not in UFS_VALIDAS:
        raise ValueError("UF inválida.")
    return uf


def converter_data(valor: str) -> date:
    """Aceita DD/MM/AAAA ou AAAA-MM-DD."""
    texto = valor.strip()
    for formato in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    raise ValueError("Data inválida (use DD/MM/AAAA).")


def converter_enum(enum_cls, valor: str):
    """Aceita o valor ou o nome do enum, sem diferenciar maiúsculas/acentos de caixa."""
    texto = valor.strip().lower()
    for item in enum_cls:
        if texto in (item.value.lower(), item.name.lower(), item.name.lower().replace("_", "-")):
            return item
    aceitos = ", ".join(i.value for i in enum_cls)
    raise ValueError(f"Valor não reconhecido. Aceitos: {aceitos}.")


def _vazio_para_none(valor: Any) -> Any:
    """Células vazias/só espaços viram None (o CSV não distingue ausente de vazio)."""
    if isinstance(valor, str) and not valor.strip():
        return None
    return valor.strip() if isinstance(valor, str) else valor


# ---------------------------------------------------------------------------
# Linha do CSV
# ---------------------------------------------------------------------------

class LinhaImportacaoConselho(BaseModel):
    """
    Uma linha do CSV já higienizada. Campos obrigatórios são verificados no
    `model_validator` (para que TODAS as ausências sejam reportadas juntas,
    junto com os erros de formato dos demais campos).
    """
    conselho_nome: Optional[str] = None
    conselho_uf: Optional[str] = None

    loja_numero: Optional[str] = None
    loja_nome: Optional[str] = None
    loja_rito: Optional[RitoMaconico] = None
    loja_cidade: Optional[str] = None
    loja_uf: Optional[str] = None
    loja_email: Optional[str] = None
    loja_telefone: Optional[str] = None
    loja_dia_sessao: Optional[str] = None
    loja_periodicidade: Optional[str] = None
    loja_horario_sessao: Optional[str] = None
    data_filiacao: Optional[date] = None
    # Necessário apenas quando a Loja ainda não existe no módulo Lojas (cadastro on-the-fly).
    loja_potencia_id: Optional[str] = None

    vm_cim: Optional[str] = None
    vm_nome: Optional[str] = None
    vm_cpf: Optional[str] = None
    vm_email: Optional[str] = None
    vm_whatsapp: Optional[str] = None
    vm_data_posse: Optional[date] = None

    suplente_cim: Optional[str] = None
    suplente_nome: Optional[str] = None
    suplente_cpf: Optional[str] = None
    suplente_email: Optional[str] = None
    suplente_cargo_loja: Optional[str] = None

    op_secretario_cim: Optional[str] = None
    op_secretario_nome: Optional[str] = None
    op_secretario_email: Optional[str] = None
    op_chanceler_cim: Optional[str] = None
    op_chanceler_nome: Optional[str] = None
    op_chanceler_email: Optional[str] = None

    cargo_diretoria: Optional[CargoConselho] = None
    inicio_mandato: Optional[date] = None
    termino_mandato: Optional[date] = None

    # --- Higienização -----------------------------------------------------

    @field_validator("*", mode="before")
    @classmethod
    def _limpar_vazios(cls, v):
        return _vazio_para_none(v)

    @field_validator(
        "conselho_nome", "loja_nome", "loja_cidade",
        "vm_nome", "suplente_nome", "op_secretario_nome", "op_chanceler_nome",
    )
    @classmethod
    def _titulo(cls, v):
        return titulo_ptbr(v) if v else v

    @field_validator("conselho_uf", "loja_uf")
    @classmethod
    def _uf(cls, v):
        return normalizar_uf(v) if v else v

    @field_validator("vm_cpf", "suplente_cpf")
    @classmethod
    def _cpf(cls, v):
        return normalizar_cpf(v) if v else v

    @field_validator(
        "loja_email", "vm_email", "suplente_email",
        "op_secretario_email", "op_chanceler_email",
    )
    @classmethod
    def _email(cls, v):
        return normalizar_email(v) if v else v

    @field_validator("loja_telefone", "vm_whatsapp")
    @classmethod
    def _telefone(cls, v):
        return normalizar_telefone(v) if v else v

    @field_validator("vm_cim", "suplente_cim", "op_secretario_cim", "op_chanceler_cim", "loja_numero", "loja_potencia_id")
    @classmethod
    def _so_digitos(cls, v):
        if v and not re.fullmatch(r"\d{1,20}", v):
            raise ValueError("Deve conter apenas números.")
        return v

    @field_validator("data_filiacao", "vm_data_posse", "inicio_mandato", "termino_mandato", mode="before")
    @classmethod
    def _data(cls, v):
        v = _vazio_para_none(v)
        return converter_data(v) if isinstance(v, str) else v

    @field_validator("loja_rito", mode="before")
    @classmethod
    def _rito(cls, v):
        v = _vazio_para_none(v)
        return converter_enum(RitoMaconico, v) if isinstance(v, str) else v

    @field_validator("cargo_diretoria", mode="before")
    @classmethod
    def _cargo_diretoria(cls, v):
        v = _vazio_para_none(v)
        return converter_enum(CargoConselho, v) if isinstance(v, str) else v

    @field_validator("suplente_cargo_loja")
    @classmethod
    def _cargo_suplente(cls, v):
        if not v:
            return v
        for nome in CARGOS_SUPLENTE_ELEGIVEIS_NOMES:
            if v.lower() == nome.lower():
                return nome
        raise ValueError(
            "Cargo inelegível para Suplente. Aceitos: " + ", ".join(CARGOS_SUPLENTE_ELEGIVEIS_NOMES) + "."
        )

    # --- Completude e regras condicionais ---------------------------------

    @model_validator(mode="after")
    def _completude(self):
        faltando = [c for c in COLUNAS_OBRIGATORIAS if getattr(self, c) in (None, "")]
        if faltando:
            raise ValueError("Campos obrigatórios ausentes: " + ", ".join(faltando))

        grupo_suplente = ("suplente_cim", "suplente_nome", "suplente_cpf", "suplente_email", "suplente_cargo_loja")
        preenchidos = [c for c in grupo_suplente if getattr(self, c)]
        if preenchidos and len(preenchidos) != len(grupo_suplente):
            faltam = [c for c in grupo_suplente if not getattr(self, c)]
            raise ValueError("Suplente incompleto; faltam: " + ", ".join(faltam))
        if self.suplente_cim and self.suplente_cim == self.vm_cim:
            raise ValueError("O Suplente não pode ser o próprio Venerável Mestre.")

        for slot in ("op_secretario", "op_chanceler"):
            grupo = (f"{slot}_cim", f"{slot}_nome", f"{slot}_email")
            cheios = [c for c in grupo if getattr(self, c)]
            if cheios and len(cheios) != len(grupo):
                raise ValueError(f"Operador '{slot}' incompleto; faltam: " + ", ".join(c for c in grupo if not getattr(self, c)))

        if self.cargo_diretoria:
            if not (self.inicio_mandato and self.termino_mandato):
                raise ValueError("Cargo de Diretoria exige inicio_mandato e termino_mandato.")
            if self.inicio_mandato >= self.termino_mandato:
                raise ValueError("inicio_mandato deve ser anterior a termino_mandato.")
        elif self.inicio_mandato or self.termino_mandato:
            raise ValueError("Datas de mandato informadas sem cargo_diretoria.")
        return self


# ---------------------------------------------------------------------------
# Relatórios e payloads de API
# ---------------------------------------------------------------------------

class MensagemValidacao(BaseModel):
    """Mensagem associada a um campo (ou à linha inteira, quando campo=None)."""
    campo: Optional[str] = None
    status: StatusLinhaImportacao
    mensagem: str


class ResultadoLinha(BaseModel):
    """Resultado da validação de uma linha, pronto para o formulário de revisão."""
    numero_linha: int = Field(..., description="Linha no arquivo (1 = primeira linha de dados).")
    status: StatusLinhaImportacao
    dados: Dict[str, Any] = Field(..., description="Valores brutos/higienizados para edição no formulário.")
    mensagens: List[MensagemValidacao] = []
    acoes: List[AcaoImportacao] = []


class ResumoValidacao(BaseModel):
    total_linhas: int
    linhas_ok: int
    linhas_aviso: int
    linhas_erro: int
    contas_a_criar: int = 0


class RelatorioValidacao(BaseModel):
    """Resposta de POST /validar."""
    modo: ModoImportacao
    regiao_id: Optional[str] = None
    conselho_nome: Optional[str] = None
    conselho_uf: Optional[str] = None
    resumo: ResumoValidacao
    linhas: List[ResultadoLinha]
    erros_gerais: List[str] = []
    lojas_ausentes: List[Dict[str, Any]] = Field(
        default=[], description="Modo ATUALIZAR: Lojas agregadas que não aparecem no CSV (candidatas a desagregar)."
    )
    token_importacao: Optional[str] = Field(
        None, description="Presente só quando não há erros; exigido em POST /confirmar."
    )


class RevalidacaoPayload(BaseModel):
    """Linhas editadas no formulário, reenviadas para nova validação."""
    modo: ModoImportacao
    regiao_id: Optional[str] = None
    linhas: List[Dict[str, Any]]


class ConfirmacaoImportacao(BaseModel):
    """
    Payload de POST /confirmar. Reenvia as linhas exatamente como validadas:
    o servidor revalida tudo e só executa se o `token_importacao` bater com o
    recalculado — garantindo que o confirmado é o que o SuperAdmin revisou.
    """
    token_importacao: str
    modo: ModoImportacao
    regiao_id: Optional[str] = None
    linhas: List[Dict[str, Any]]
    lojas_desagregar: List[str] = Field(default=[], description="loja_id das Lojas ausentes que o superadmin aprovou desagregar.")


class ContaProvisionada(BaseModel):
    """Resultado do provisionamento de conta de uma pessoa (sem qualquer senha)."""
    cpf: str
    email: str
    status: str = Field(..., description="criada | acesso_concedido | existente")
    email_enviado: bool = False


class RelatorioExecucao(BaseModel):
    """Resposta de POST /confirmar: resumo do que foi efetivamente gravado."""
    regiao_id: str
    regiao_nome: str
    modo: ModoImportacao
    lojas_processadas: int
    lojas_criadas_no_lojas: int
    lojas_desagregadas: int
    contas: List[ContaProvisionada] = []
    avisos: List[str] = []
