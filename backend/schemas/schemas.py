from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime
from models.models import CargoConselhoEnum

class RegiaoBase(BaseModel):
    nome: str
    uf: str

class RegiaoCreate(RegiaoBase):
    presidente_id: Optional[str] = None
    vice_presidente_id: Optional[str] = None
    secretario_id: Optional[str] = None
    lojas_ids: List[int] = []

class RegiaoResponse(RegiaoBase):
    id: str
    ativa: bool
    criado_em: datetime

    class Config:
        from_attributes = True

class DiretoriaCreate(BaseModel):
    regiao_id: str
    usuario_id: str
    cargo: CargoConselhoEnum
    inicio_mandato: date
    termino_mandato: date

class LojaAgregadaCreate(BaseModel):
    regiao_id: str
    loja_id: str
    data_filiacao: date
