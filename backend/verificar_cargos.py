import os
from dotenv import load_dotenv
load_dotenv()
import psycopg2

conn = psycopg2.connect(os.getenv("DATABASE_URL_LOJAS"))
cur = conn.cursor()
cur.execute("SELECT id, nome, tipo_cargo FROM cargos ORDER BY id;")
for row in cur.fetchall():
    print(row)
cur.close()
conn.close()
