# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from enum import Enum

class RitoMaconico(str, Enum):
    # ALTERAÇÃO (2026-09-11, seção 9.7): valor canônico do REAA passou de
    # "Rito Escocês Antigo e Aceito" para a sigla "REAA", em todo o
    # ecossistema (lista_de_lojas_db, lojas_db e código dependente).
    REAA = "REAA"
    YORK = "Rito de York"
    ADONHIRAMITA = "Rito Adonhiramita"
    BRASILEIRO = "Rito Brasileiro"
    MODERNO = "Rito Moderno"
    SCHRODER = "Rito Schröder"

class GrauSimbolico(str, Enum):
    APRENDIZ = "Aprendiz"
    COMPANHEIRO = "Companheiro"
    MESTRE = "Mestre"
    MESTRE_INSTALADO = "Mestre Instalado"

class CargoLoja(str, Enum):
    VENERAVEL_MESTRE = "Venerável Mestre"
    PRIMEIRO_VIGILANTE = "Primeiro Vigilante"
    SEGUNDO_VIGILANTE = "Segundo Vigilante"
    ORADOR = "Orador"
    SECRETARIO = "Secretário"
    TESOUREIRO = "Tesoureiro"
    CHANCELER = "Chanceler"
    PRIMEIRO_EXPERTO = "Primeiro Experto"
    SEGUNDO_EXPERTO = "Segundo Experto"
    PRIMEIRO_DIACONO = "Primeiro Diácono"
    SEGUNDO_DIACONO = "Segundo Diácono"
    MESTRE_HARMONIA = "Mestre de Harmonia"
    HOSPITALEIRO = "Hospitaleiro"
    ARQUITETO = "Arquiteto"
    PORTA_ESTANDARTE = "Porta Estandarte"
    PORTA_BANDEIRAS = "Porta Bandeiras"
    MESTRE_DE_BANQUETES = "Mestre de Banquetes"
    COBRIDOR_EXTERNO = "Cobridor Externo"
    COBRIDOR_INTERNO = "Cobridor Interno"
    BIBLIOTECARIO = "Bibliotecário"
    PORTA_ESPADAS = "Porta Espadas"
    GUARDA_DO_TEMPLO = "Guarda do Templo"

class CargoConselho(str, Enum):
    PRESIDENTE = "presidente"
    VICE_PRESIDENTE = "vice-presidente"
    SECRETARIO = "secretario"
    DELEGADO = "delegado"

class StatusObreiro(str, Enum):
    ATIVO = "Ativo"
    INATIVO = "Inativo"
    REGULAR = "Regular"
    IRREGULAR = "Irregular"
    FALECIDO = "Falecido"


# ---------------------------------------------------------------------------
# Importação em lote de Conselho Regional via CSV (2026-10-09)
# ---------------------------------------------------------------------------

class ModoImportacao(str, Enum):
    """Define se a importação cria uma Região nova ou atualiza uma existente."""
    CRIAR = "CRIAR"
    ATUALIZAR = "ATUALIZAR"


class StatusLinhaImportacao(str, Enum):
    """Resultado da validação de uma linha (ou campo) do CSV."""
    OK = "OK"
    AVISO = "AVISO"
    ERRO = "ERRO"


class AcaoImportacao(str, Enum):
    """Ações previstas/executadas para cada linha durante a importação."""
    CRIAR_LOJA = "CRIAR_LOJA"
    VINCULAR_LOJA = "VINCULAR_LOJA"
    ATUALIZAR_LOJA = "ATUALIZAR_LOJA"
    CRIAR_OBREIRO = "CRIAR_OBREIRO"
    VINCULAR_OBREIRO = "VINCULAR_OBREIRO"
    CRIAR_CONTA = "CRIAR_CONTA"
    CONTA_EXISTENTE = "CONTA_EXISTENTE"
    SUBSTITUIR_VM = "SUBSTITUIR_VM"
    SUBSTITUIR_SUPLENTE = "SUBSTITUIR_SUPLENTE"
    DEFINIR_DIRETORIA = "DEFINIR_DIRETORIA"
    DESAGREGAR_LOJA = "DESAGREGAR_LOJA"


class SlotOperador(str, Enum):
    """Slots do Operador Administrativo de Loja (ver OperadorAdministrativoLoja)."""
    SECRETARIO = "SECRETARIO"
    CHANCELER = "CHANCELER"


# Cargos da Loja aceitos para o Suplente do Conselho: os 6 cargos eletivos
# (exceto o VM) + Mestre Instalado. Equivale, por nome, a
# `CARGOS_SUPLENTE_ELEGIVEIS_IDS = [2..7]` de `core/dependencies.py`.
CARGOS_SUPLENTE_ELEGIVEIS_NOMES = (
    CargoLoja.PRIMEIRO_VIGILANTE.value,
    CargoLoja.SEGUNDO_VIGILANTE.value,
    CargoLoja.ORADOR.value,
    CargoLoja.SECRETARIO.value,
    CargoLoja.TESOUREIRO.value,
    CargoLoja.CHANCELER.value,
    GrauSimbolico.MESTRE_INSTALADO.value,
)

# Limites de segurança do upload de CSV.
IMPORTACAO_TAMANHO_MAX_BYTES = 1_048_576  # 1 MB
IMPORTACAO_MAX_LINHAS = 500
IMPORTACAO_TOKEN_TTL_MINUTOS = 30
