import re, sys

path = "api/v1/regional/rotas.py"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

def do_replace(old, new, label):
    n = src.count(old)
    if n != 1:
        print(f"ERRO: '{label}' encontrado {n} vezes (esperado 1).")
        sys.exit(1)
    return src.replace(old, new, 1)

# 1) Constantes + payloads
old1 = '''TIPOS_EVENTO_AGENDA_VALIDOS = ["SESSAO", "REUNIAO", "VISITA", "ADMINISTRATIVO", "INICIACAO", "OUTRO"]
STATUS_EVENTO_AGENDA_VALIDOS = ["AGENDADO", "REALIZADO", "CANCELADO"]


class EventoAgendaCreatePayload(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    tipo: str = "OUTRO"
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    previa_admissao_id: Optional[str] = None
    gerar_aviso: bool = False


class EventoAgendaUpdatePayload(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    status: Optional[str] = None
'''

new1 = '''# CORREÇÃO (2026-09-17): catálogo fechado de fato implementado -- antes desta
# correção, esta lista ainda era o rascunho genérico inicial (SESSAO/REUNIAO/
# VISITA/ADMINISTRATIVO/INICIACAO/OUTRO), embora o docstring de EventoAgenda
# (models/models.py) e a seção 10 de claude/decisao-controle-acesso-cadastro.md
# já descrevessem o catálogo de 9 tipos com âmbito fixo. Achado durante a
# investigação do Módulo 13 do roteiro de testes.
TIPOS_EVENTO_AGENDA = {
    "REUNIAO_ADMINISTRATIVA": {"rotulo": "Reunião Administrativa", "ambito": "CONSELHO", "quem_lanca": "Mesa Diretora"},
    "ENCONTRO_REGIONAL":      {"rotulo": "Encontro Regional",      "ambito": "CONSELHO", "quem_lanca": "Mesa Diretora"},
    "CONFERENCIA":            {"rotulo": "Conferência",            "ambito": "CONSELHO", "quem_lanca": "Mesa Diretora"},
    "SESSAO_MAGNA":           {"rotulo": "Sessão Magna",           "ambito": "LOJA",      "quem_lanca": "Diretoria da Loja"},
    "SESSAO_PUBLICA":         {"rotulo": "Sessão Pública",         "ambito": "LOJA",      "quem_lanca": "Diretoria da Loja"},
    "AGAPE_RITUALISTICO":     {"rotulo": "Ágape Ritualístico",     "ambito": "LOJA",      "quem_lanca": "Diretoria da Loja"},
    "EVENTO_BENEFICENTE":     {"rotulo": "Evento Beneficente",     "ambito": "AMBOS",     "quem_lanca": "Mesa Diretora / Diretoria da Loja"},
    "EVENTO_ARRECADACAO":     {"rotulo": "Evento de Arrecadação",  "ambito": "AMBOS",     "quem_lanca": "Mesa Diretora / Diretoria da Loja"},
    "HOMENAGEM_EXTERNA":      {"rotulo": "Homenagem Externa",      "ambito": "AMBOS",     "quem_lanca": "Mesa Diretora / Diretoria da Loja"},
}
TIPOS_EVENTO_AGENDA_VALIDOS = list(TIPOS_EVENTO_AGENDA.keys())
SUBTIPOS_SESSAO_MAGNA_VALIDOS = ["INICIACAO", "ELEVACAO", "EXALTACAO", "POSSE", "INSTALACAO", "COMEMORATIVA"]
STATUS_EVENTO_AGENDA_VALIDOS = ["AGENDADO", "REALIZADO", "CANCELADO"]


class EventoAgendaCreatePayload(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    tipo: str = "OUTRO"
    subtipo: Optional[str] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    previa_admissao_id: Optional[str] = None
    gerar_aviso: bool = False


class EventoAgendaUpdatePayload(BaseModel):
    titulo: Optional[str] = None
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    subtipo: Optional[str] = None
    data_inicio: Optional[datetime] = None
    data_fim: Optional[datetime] = None
    status: Optional[str] = None
'''
src = do_replace(old1, new1, "constantes+payloads")

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("Etapa 1 OK")
