# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import psycopg2

def run():
    print("Deletando obreiros de teste...")
    conn = psycopg2.connect("postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lojas_db")
    cur = conn.cursor()
    
    cur.execute("SELECT id FROM obreiros WHERE nome_completo LIKE '%[TESTE]%';")
    test_obreiros = [r[0] for r in cur.fetchall()]
    
    if test_obreiros:
        print(f"Encontrados {len(test_obreiros)} obreiros de teste.")
        ids_tuple = tuple(test_obreiros)
        if len(test_obreiros) == 1:
            ids_tuple = f"({test_obreiros[0]})"
            
        cur.execute(f"DELETE FROM obreiro_loja_associacoes WHERE obreiro_id IN {ids_tuple};")
        cur.execute(f"DELETE FROM obreiros WHERE id IN {ids_tuple};")
        conn.commit()
        print("Deletados.")
    else:
        print("Nenhum obreiro de teste encontrado.")

if __name__ == '__main__':
    run()
