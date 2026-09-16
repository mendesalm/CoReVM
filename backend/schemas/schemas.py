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

class DiretoriaMembroResponse(BaseModel):
    id: str
    usuario_id: str
    cargo: CargoConselho
    inicio_mandato: date
    termino_mandato: date
    nome_completo: Optional[str] = None
    cim: Optional[str] = None
    email: Optional[str] = None
    telefone: Optional[str] = None
    # ALTERAÇÃO (2026-09-14): detecção de assento "órfão" — quando a Loja
    # que este membro representava trocou de Venerável Mestre (ou ficou sem
    # VM) depois que ele foi indicado à Diretoria. Ver nota em
    # models.py::DiretoriaConselho.loja_id.
    loja_id: Optional[str] = None
    loja_numero: Optional[str] = None
    vinculo_desatualizado: bool = False
    loja_sem_vm: bool = False
    sugestao_novo_veneravel: Optional["VeneravelElegivelResponse"] = None

class DiretoriaUpdatePayload(BaseModel):
    presidente_id: Optional[str] = None
    vice_presidente_id: Optional[str] = None
    secretario_id: Optional[str] = None
    inicio_mandato: Optional[date] = None
    termino_mandato: Optional[date] = None

class VeneravelElegivelResponse(BaseModel):
    """Venerável Mestre em exercício em uma Loja jurisdicionada ao Conselho
    — usado para popular o seletor de Diretoria (em vez de aceitar
    qualquer CIM digitado livremente, sem validação) e para sugerir a
    atualização automática de um assento órfão."""
    usuario_id: str
    nome_completo: Optional[str] = None
    loja_id: str
    loja_nome: Optional[str] = None
    loja_numero: Optional[str] = None

class DiretoriaEmergenciaPayload(BaseModel):
    usuario_id: str  # CIM (ou CPF) de um Venerável Mestre elegível

# ALTERAÇÃO (2026-09-14): transmissão de cargo emergencial de VM — ver
# regional/rotas.py e claude/decisao-transmissao-cargo-vm.md no Project.
class TransmissaoEmergencialVmPayload(BaseModel):
    """Dados do novo Venerável Mestre indicado emergencialmente (posse
    on-the-fly em lojas_db — mesmo formato de ObreiroCreateOnTheFly, sem o
    campo loja_id, que já vem da URL)."""
    cim: str
    nome_completo: str
    email: Optional[str] = None
    cpf: Optional[str] = None
    telefone: Optional[str] = None
    data_inicio_mandato: Optional[date] = None

DiretoriaMembroResponse.model_rebuild()

class LojaAgregadaCreate(BaseModel):
    regiao_id: str
    loja_id: str
    data_filiacao: date

import re
from core.constants import CargoLoja

class LojaCreateOnTheFly(BaseModel):
    nome_loja: str
    numero_loja: str
    titulo_loja: str
    rito: str
    # ALTERAÇÃO (2026-09-11): hierarquia redefinida pelo usuário — Potência
    # é o nível superior (federal/estadual), Obediência agora é a
    # organização subordinada à Potência, com Lojas subordinadas à
    # Obediência. Antes este campo se chamava "obediencia_id" e representava
    # o nível superior; ver seção 9.9 do contexto de implementação.
    potencia_id: int
    cidade: str
    estado: str
    cep: Optional[str] = None
    
    @field_validator('nome_loja', 'cidade')
    def sanitize_title_case(cls, v):
        if not v: return v
        words = v.split()
        preps = ['de', 'da', 'do', 'das', 'dos', 'e']
        title_words = [w.capitalize() if w.lower() not in preps else w.lower() for w in words]
        return ' '.join(title_words)
        
    @field_validator('estado')
    def sanitize_estado(cls, v):
        if v:
            return v.upper().strip()
        return v

class ObreiroCreateOnTheFly(BaseModel):
    cim: str
    nome_completo: str
    email: Optional[str] = None
    cpf: Optional[str] = None
    loja_id: int
    telefone: Optional[str] = None
    cargo_atual: Optional[str] = None
    data_inicio_mandato: Optional[date] = None
    cargo_loja: Optional[CargoLoja] = None
    
    @field_validator('nome_completo')
    def sanitize_nome(cls, v):
        if not v: return v
        words = v.split()
        preps = ['de', 'da', 'do', 'das', 'dos', 'e']
        title_words = [w.capitalize() if w.lower() not in preps else w.lower() for w in words]
        return ' '.join(title_words)
        
    @field_validator('cpf')
    def sanitize_cpf(cls, v):
        if not v: return v
        return re.sub(r'[^0-9]', '', v)

    @field_validator('telefone')
    def sanitize_telefone(cls, v):
        if not v: return v
        return re.sub(r'[^0-9]', '', v)
