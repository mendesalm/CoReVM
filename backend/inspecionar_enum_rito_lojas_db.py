# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Descobre o nome real do tipo ENUM do Postgres usado pela coluna
`lojas.rito` em `lojas_db` (o modelo do próprio serviço Lojas define
`RitoEnum` em Python, mas o SQLAlchemy escolhe o nome do tipo no Postgres
por convenção — precisamos confirmar antes de rodar um ALTER TYPE).

Rode com: python inspecionar_enum_rito_lojas_db.py (dentro de
CoReVM/backend/, com o .env configurado — usa DATABASE_URL_LOJAS)
Cole a saída de volta na conversa.
"""
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LOJAS

def inspecionar():
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LOJAS)
    cur = conn.cursor()

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
        print(f"Rótulos possíveis: {[r[1] for r in rows if r[1] is not None]}")
    else:
        print("Coluna 'rito' em 'lojas' não usa um tipo ENUM nomeado (pode ser varchar).")

    cur.execute('SELECT DISTINCT rito, COUNT(*) FROM lojas GROUP BY rito ORDER BY 2 DESC')
    print("Valores em uso nos dados de lojas_db.lojas.rito:")
    for valor, contagem in cur.fetchall():
        print(f"  {valor!r}: {contagem}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    inspecionar()
