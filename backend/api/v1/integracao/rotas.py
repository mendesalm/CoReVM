# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter
from .rotas_lojas import router as lojas_router
from .rotas_obreiros import router as obreiros_router

router = APIRouter()
router.include_router(lojas_router, prefix="/lojas", tags=["Lojas (On-the-Fly)"])
router.include_router(obreiros_router, prefix="/obreiros", tags=["Obreiros (On-the-Fly)"])
