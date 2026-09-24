# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Roteador Agregador Regional do CoReVM.
Decompõe o antigo monólito de rotas em submódulos especializados e isolados:
1. rotas_governanca: Dashboard, /me, /minhas-regioes, Diretoria e Elegibilidade.
2. rotas_lojas_agregadas: Lojas Jurisdicionadas, Suplência, Operadores Administrativos e Transmissão de Cargo.
3. rotas_comunicacao_agenda: Avisos, Notificações, Agenda de Eventos e Pranchas de Comunicação Interna.
4. rotas_patrimonio_documentos: Inventário Patrimonial, Cautelas, Repositório de Documentos e Relatórios Executivos.
5. rotas_admissoes_votacoes: Prévias de Admissão, Pareceres e Votações / Deliberações do Colegiado.
"""
from fastapi import APIRouter

from api.v1.regional.rotas_governanca import router as router_governanca
from api.v1.regional.rotas_lojas_agregadas import router as router_lojas_agregadas
from api.v1.regional.rotas_comunicacao_agenda import router as router_comunicacao_agenda
from api.v1.regional.rotas_patrimonio_documentos import router as router_patrimonio_documentos
from api.v1.regional.rotas_admissoes_votacoes import router as router_admissoes_votacoes

router = APIRouter()

# Inclusão dos submódulos modulares
router.include_router(router_governanca)
router.include_router(router_lojas_agregadas)
router.include_router(router_comunicacao_agenda)
router.include_router(router_patrimonio_documentos)
router.include_router(router_admissoes_votacoes)
