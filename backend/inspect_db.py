# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import psycopg2
try:
    conn = psycopg2.connect("postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lojas_db")
    cur = conn.cursor()
    cur.execute("SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'tipoobedienciaenum'")
    for lbl in cur.fetchall(): print(lbl[0])
except Exception as e:
    print(e)
