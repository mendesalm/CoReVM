# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Complemento a `inspecionar_lista_lojas_completo.py`: aquele script pulou as
colunas com tipo customizado do Postgres (USER-DEFINED) — que é justamente
o caso de `lodges.rite`, `lodges.session_day`, `lodges.periodicity` e
`obediences.type`. Este script lista os rótulos (labels) de cada ENUM do
Postgres usado nessas colunas, e também os valores distintos realmente
usados nas 270/3 linhas de `lista_de_lojas_db`.

Rode com: python inspecionar_enums_lista_lojas.py (dentro de backend/, .env configurado)
Cole a saída de volta na conversa.
"""
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LISTA

COLUNAS_ENUM = [
    ("lodges", "rite"),
    ("lodges", "session_day"),
    ("lodges", "periodicity"),
    ("obediences", "type"),
]

def inspecionar():
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LISTA)
    cur = conn.cursor()

    for tabela, coluna in COLUNAS_ENUM:
        print(f"\n=== {tabela}.{coluna} ===")

        # 1. Nome do tipo ENUM do Postgres e seus rótulos possíveis
        cur.execute(
            """
            SELECT t.typname, e.enumlabel
            FROM information_schema.columns c
            JOIN pg_type t ON t.typname = c.udt_name
            LEFT JOIN pg_enum e ON e.enumtypid = t.oid
            WHERE c.table_name = %s AND c.column_name = %s
            ORDER BY e.enumsortorder
            """,
            (tabela, coluna),
        )
        rows = cur.fetchall()
        if rows:
            print(f"  Tipo ENUM: {rows[0][0]}")
            print(f"  Rótulos possíveis: {[r[1] for r in rows if r[1] is not None]}")
        else:
            print("  [não encontrado como enum — verificar manualmente]")

        # 2. Valores distintos realmente usados nos dados
        try:
            cur.execute(
                f'SELECT DISTINCT "{coluna}"::text, COUNT(*) FROM "{tabela}" '
                f'GROUP BY "{coluna}" ORDER BY 2 DESC'
            )
            print("  Valores em uso nos dados:")
            for valor, contagem in cur.fetchall():
                print(f"    {valor!r}: {contagem}")
        except Exception as e:
            print(f"  [erro ao consultar valores: {e}]")

    # Também vale conferir 'plan' (lodges) e 'lodge_title' (lodges), que
    # ficaram de fora do primeiro script por serem varchar livre, não
    # categórica óbvia pelo nome — mas podem ter valores repetidos/fixos.
    for tabela, coluna in [("lodges", "plan"), ("lodges", "lodge_title")]:
        print(f"\n=== {tabela}.{coluna} (varchar livre, checando se é na prática fixo) ===")
        try:
            cur.execute(
                f'SELECT DISTINCT "{coluna}", COUNT(*) FROM "{tabela}" '
                f'GROUP BY "{coluna}" ORDER BY 2 DESC LIMIT 15'
            )
            for valor, contagem in cur.fetchall():
                print(f"    {valor!r}: {contagem}")
        except Exception as e:
            print(f"  [erro: {e}]")

    cur.close()
    conn.close()

if __name__ == "__main__":
    inspecionar()
