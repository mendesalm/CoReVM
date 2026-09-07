# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from enum import Enum

class RitoMaconico(str, Enum):
    REAA = "Rito Escocês Antigo e Aceito"
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
    PRIMEIRO_VIGILANTE = "1º Vigilante"
    SEGUNDO_VIGILANTE = "2º Vigilante"
    ORADOR = "Orador"
    SECRETARIO = "Secretário"
    TESOUREIRO = "Tesoureiro"
    CHANCELER = "Chanceler"
    MESTRE_HARMONIA = "Mestre de Harmonia"
    # ... outros cargos ...

class CargoConselho(str, Enum):
    PRESIDENTE = "presidente"
    VICE_PRESIDENTE = "vice-presidente"
    SECRETARIO = "secretario"
    TESOUREIRO = "tesoureiro"
    DELEGADO = "delegado"

class StatusObreiro(str, Enum):
    ATIVO = "Ativo"
    INATIVO = "Inativo"
    REGULAR = "Regular"
    IRREGULAR = "Irregular"
    FALECIDO = "Falecido"
