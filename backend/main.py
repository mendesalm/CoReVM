from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1.regioes.rotas import router as regioes_router
from api.v1.integracao.rotas import router as integracao_router

app = FastAPI(
    title="CoReVM API",
    description="Backend do Conselho Regional de Veneráveis Mestres",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(regioes_router, prefix="/api/v1/regioes", tags=["Regiões"])
app.include_router(integracao_router, prefix="/api/v1/integracao", tags=["Integração e-Sigma"])

@app.get("/")
def read_root():
    return {"status": "CoReVM API is running"}
