import psycopg2

def run():
    print("Deletando testes em lista_de_lojas_db...")
    conn = psycopg2.connect("postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lista_de_lojas_db")
    cur = conn.cursor()
    # Delete lodges that reference test obediences
    cur.execute("DELETE FROM lodges WHERE obedience_id IN (SELECT id FROM obediences WHERE name LIKE '%[TESTE]%') OR subobedience_id IN (SELECT id FROM obediences WHERE name LIKE '%[TESTE]%');")
    # Delete test lodges
    cur.execute("DELETE FROM lodges WHERE lodge_name LIKE '%[TESTE]%';")
    # Delete test obediences
    cur.execute("DELETE FROM obediences WHERE name LIKE '%[TESTE]%';")
    conn.commit()
    print(f"lista_de_lojas_db limpo.")
    conn.close()

    print("Deletando testes em lojas_db...")
    conn = psycopg2.connect("postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lojas_db")
    cur = conn.cursor()
    # Find test lodges
    cur.execute("SELECT id FROM lojas WHERE obediencia_id IN (SELECT id FROM obediencias WHERE nome LIKE '%[TESTE]%') OR subobediencia_id IN (SELECT id FROM obediencias WHERE nome LIKE '%[TESTE]%') OR nome_loja LIKE '%[TESTE]%';")
    test_lodges = [r[0] for r in cur.fetchall()]
    
    if test_lodges:
        test_lodges_tuple = tuple(test_lodges)
        if len(test_lodges) == 1:
            test_lodges_tuple = f"({test_lodges[0]})"
            
        # Delete associations
        cur.execute(f"DELETE FROM obreiro_loja_associacoes WHERE loja_id IN {test_lodges_tuple};")
        # Delete lodges
        cur.execute(f"DELETE FROM lojas WHERE id IN {test_lodges_tuple};")
        
    # Delete test obediencias
    cur.execute("DELETE FROM obediencias WHERE nome LIKE '%[TESTE]%';")
    conn.commit()
    print(f"lojas_db limpo.")
    conn.close()

if __name__ == '__main__':
    run()
