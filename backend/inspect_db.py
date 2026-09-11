# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LOJAS
try:
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LOJAS)
    cur = conn.cursor()
    cur.execute("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'tipoobedienciaenum'")
    for lbl in cur.fetchall(): print(lbl[0])
except Exception as e:
    print(e)
