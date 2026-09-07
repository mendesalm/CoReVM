# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import date, datetime
from core.constants import CargoConselho

class DiretoriaResponse(BaseModel):
    id: str
    usuario_id: str
    cargo: CargoConselho
    inicio_mandato: date
    termino_mandato: date

    class Config:
        from_attributes = True

class LojaAgregadaResponse(BaseModel):
    id: str
    loja_id: str
    data_filiacao: date
    ativa: bool

    class Config:
        from_attributes = True

class RegiaoBase(BaseModel):
    nome: str
    uf: str

    @field_validator('nome')
    def sanitize_nome(cls, v):
        if not v: return v
        words = v.split()
        preps = ['de', 'da', 'do', 'das', 'dos', 'e']
        title_words = [w.capitalize() if w.lower() not in preps else w.lower() for w in words]
        return ' '.join(title_words)

    @field_validator('uf')
    def sanitize_uf(cls, v):
        if v:
            return v.upper().strip()
        return v


class RegiaoCreate(RegiaoBase):
    presidente_id: Optional[str] = None
    vice_presidente_id: Optional[str] = None
    secretario_id: Optional[str] = None
    lojas_ids: List[str] = []

class RegiaoResponse(RegiaoBase):
    id: str
    ativa: bool
    diretoria: List[DiretoriaResponse] = []
    lojas: List[LojaAgregadaResponse] = []

    class Config:
        from_attributes = True

class DiretoriaCreate(BaseModel):
    regiao_id: str
    usuario_id: str
    cargo: CargoConselho
    inicio_mandato: date
    termino_mandato: date

class LojaAgregadaCreate(BaseModel):
    regiao_id: str
    loja_id: str
    data_filiacao: date
