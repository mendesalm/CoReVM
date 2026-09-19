# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Diagnostico -- lista todas as linhas de DiretoriaConselho na Regiao de
teste (Ceres), para investigar por que 9900022 (VM puro da Loja 904)
apareceu com role=PRESIDENTE no reteste de regressao do Modulo 1
(2026-09-16).

Uso (dentro de CoReVM/backend, no mesmo venv do projeto):
    python diagnosticar_diretoria_teste.py
"""
from database import SessionLocalCore
from models.models import DiretoriaConselho

REGIAO_ID = "test-core-ceres-go-001"


def main():
    db = SessionLocalCore()
    try:
        linhas = db.query(DiretoriaConselho).filter(
            DiretoriaConselho.regiao_id == REGIAO_ID
        ).all()
        if not linhas:
            print("Nenhuma linha encontrada em diretoria_conselho para esta regiao.")
            return
        print(f"{len(linhas)} linha(s) em diretoria_conselho para {REGIAO_ID}:\n")
        for linha in linhas:
            print(
                f"  id={linha.id}  cargo={linha.cargo.value!r}  usuario_id={linha.usuario_id!r}  "
                f"loja_id={linha.loja_id!r}  inicio={linha.inicio_mandato}  termino={linha.termino_mandato}"
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
