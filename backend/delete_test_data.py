# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LISTA, SQLALCHEMY_DATABASE_URL_LOJAS

# ALTERAÇÃO (2026-09-11, seção 9.9): script atualizado para os nomes de
# schema DEPOIS das migrações — lista_de_lojas_db usa "lojas"/"obediencias"/
# "potencia_id"/"obediencia_id" (migracao_lista_de_lojas_pt_br.sql) e
# lojas_db usa "potencia_id"/"obediencia_id" (migração equivalente em
# lojas_db). NÃO rode este script antes de ambas as migrações estarem
# aplicadas — os nomes antigos (lodges/obedience_id/subobedience_id em
# lista_de_lojas_db) deixam de existir depois da migração.

def run():
    print("Deletando testes em lista_de_lojas_db...")
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LISTA)
    cur = conn.cursor()
    # Delete lojas that reference test obediencias/potencias
    cur.execute("DELETE FROM lojas WHERE potencia_id IN (SELECT id FROM obediencias WHERE nome LIKE '%[TESTE]%') OR obediencia_id IN (SELECT id FROM obediencias WHERE nome LIKE '%[TESTE]%');")
    # Delete test lojas
    cur.execute("DELETE FROM lojas WHERE nome_loja LIKE '%[TESTE]%';")
    # Delete test obediencias
    cur.execute("DELETE FROM obediencias WHERE nome LIKE '%[TESTE]%';")
    conn.commit()
    print(f"lista_de_lojas_db limpo.")
    conn.close()

    print("Deletando testes em lojas_db...")
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LOJAS)
    cur = conn.cursor()
    # Find test lodges
    cur.execute("SELECT id FROM lojas WHERE potencia_id IN (SELECT id FROM obediencias WHERE nome LIKE '%[TESTE]%') OR obediencia_id IN (SELECT id FROM obediencias WHERE nome LIKE '%[TESTE]%') OR nome_loja LIKE '%[TESTE]%';")
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
