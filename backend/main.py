# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1.regioes.rotas import router as regioes_router
from api.v1.integracao.rotas import router as integracao_router
from api.v1.regional.rotas import router as regional_router

app = FastAPI(
    title="CoReVM API",
    description="Backend do Conselho Regional de Veneráveis Mestres",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000", "*"], # Em produção, remover o "*" se usar credentials
    allow_credentials=False, # Removido True para permitir "*" (Wildcard CORS policy)
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(regioes_router, prefix="/api/v1/regioes", tags=["Regiões"])
app.include_router(integracao_router, prefix="/api/v1/integracao", tags=["Integração e-Sigma"])
app.include_router(regional_router, prefix="/api/v1/regional", tags=["Gestão Regional"])

@app.get("/")
def read_root():
    return {"status": "CoReVM API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8003, reload=True)
