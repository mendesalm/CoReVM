# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LISTA
try:
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LISTA)
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    for table in cur.fetchall():
        print(f"Table: {table[0]}")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table[0],))
        for col in cur.fetchall():
            print(f"  - {col[0]}")
except Exception as e:
    print("Error:", e)
