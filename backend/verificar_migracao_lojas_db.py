# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Verifica o estado de lojas_db (produção) depois da migração de hierarquia
Potência/Obediência, e de passagem já levanta o nome do ENUM de 'rito'
nesse banco (para a troca para 'REAA' — seção 9.7 do contexto de
implementação, ainda pendente aqui).

Rode com: python verificar_migracao_lojas_db.py (dentro de
CoReVM/backend/, com o .env configurado — usa DATABASE_URL_LOJAS)
Cole a saída de volta na conversa.
"""
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LOJAS

def verificar():
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LOJAS)
    cur = conn.cursor()

    print("=== Banco conectado ===")
    cur.execute("SELECT current_database();")
    print(cur.fetchone()[0])

    print("\n=== Colunas de 'lojas' ===")
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'lojas' ORDER BY ordinal_position"
    )
    colunas = [r[0] for r in cur.fetchall()]
    print(colunas)

    candidatos = ["obediencia_id", "subobediencia_id", "potencia_id"]
    print("Presença de cada nome candidato:")
    for c in candidatos:
        print(f"  {c}: {'SIM' if c in colunas else 'não'}")

    print("\n=== ENUM de 'rito' em lojas_db ===")
    cur.execute(
        """
        SELECT t.typname, e.enumlabel
        FROM information_schema.columns c
        JOIN pg_type t ON t.typname = c.udt_name
        LEFT JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE c.table_name = 'lojas' AND c.column_name = 'rito'
        ORDER BY e.enumsortorder
        """
    )
    rows = cur.fetchall()
    if rows:
        print(f"Tipo ENUM: {rows[0][0]}")
        print(f"Rótulos: {[r[1] for r in rows if r[1] is not None]}")
    else:
        print("Coluna 'rito' não é um ENUM nomeado (pode ser varchar).")

    cur.execute("SELECT DISTINCT rito, COUNT(*) FROM lojas GROUP BY rito ORDER BY 2 DESC")
    print("Valores em uso:")
    for valor, contagem in cur.fetchall():
        print(f"  {valor!r}: {contagem}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    verificar()
