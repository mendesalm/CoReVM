# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import psycopg2

def fix_db():
    print("Fixing lista_de_lojas_db...")
    conn_lista = psycopg2.connect("postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lista_de_lojas_db")
    cur_lista = conn_lista.cursor()
    
    # GOBGO (13) becomes Potência GOB (12), Obediência GOBGO (13)
    cur_lista.execute("UPDATE lodges SET obedience_id = 12, subobedience_id = 13 WHERE obedience_id = 13;")
    # Everything else that doesn't have a subobedience copies its obedience
    cur_lista.execute("UPDATE lodges SET subobedience_id = obedience_id WHERE subobedience_id IS NULL;")
    conn_lista.commit()
    print("lista_de_lojas_db OK.")

    print("Fixing lojas_db...")
    conn_lojas = psycopg2.connect("postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lojas_db")
    cur_lojas = conn_lojas.cursor()
    
    # In lojas_db, there is one lodge with obediencia_id=12 which is actually GOBGO. Let's find it in lista and fix it if needed.
    # Actually, the lodge "João Pedro Junqueira" was seeded with obediencia_id=12 and subobediencia_id=NULL.
    # If we just run the same rules:
    # 1. GOBGO (13) -> 12 and 13
    cur_lojas.execute("UPDATE lojas SET obediencia_id = 12, subobediencia_id = 13 WHERE obediencia_id = 13;")
    # 2. Fix João Pedro Junqueira manually
    cur_lojas.execute("UPDATE lojas SET subobediencia_id = 13 WHERE nome_loja = 'João Pedro Junqueira';")
    # 3. Everything else copies
    cur_lojas.execute("UPDATE lojas SET subobediencia_id = obediencia_id WHERE subobediencia_id IS NULL;")
    conn_lojas.commit()
    print("lojas_db OK.")

    cur_lista.close()
    conn_lista.close()
    cur_lojas.close()
    conn_lojas.close()

if __name__ == "__main__":
    fix_db()
