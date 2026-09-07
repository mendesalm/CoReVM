import psycopg2
try:
    conn = psycopg2.connect("postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lista_de_lojas_db")
    cur = conn.cursor()
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    for table in cur.fetchall():
        print(f"Table: {table[0]}")
        cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s", (table[0],))
        for col in cur.fetchall():
            print(f"  - {col[0]}")
except Exception as e:
    print("Error:", e)
