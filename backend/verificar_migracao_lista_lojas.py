# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Verifica exatamente o que já foi aplicado em lista_de_lojas_db, já que a
migração passou por três versões (nomenclatura PT-BR -> +troca para REAA ->
+renomeação potencia_id/obediencia_id) e pode ter sido rodada com uma
versão intermediária.

Rode com: python verificar_migracao_lista_lojas.py (dentro de
CoReVM/backend/, com o .env configurado — usa DATABASE_URL_LISTA)
Cole a saída de volta na conversa.
"""
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LISTA

def verificar():
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LISTA)
    cur = conn.cursor()

    print("=== Tabelas existentes ===")
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
    tabelas = [r[0] for r in cur.fetchall()]
    print(tabelas)

    tabela_lojas = "lojas" if "lojas" in tabelas else ("lodges" if "lodges" in tabelas else None)
    tabela_obediencias = "obediencias" if "obediencias" in tabelas else ("obediences" if "obediences" in tabelas else None)

    if tabela_lojas:
        print(f"\n=== Colunas de '{tabela_lojas}' ===")
        cur.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position",
            (tabela_lojas,),
        )
        colunas_lojas = [r[0] for r in cur.fetchall()]
        print(colunas_lojas)

        # Quais dos nomes candidatos para o par hierárquico existem hoje?
        candidatos = [
            "obedience_id", "subobedience_id",              # versão original (inglês)
            "obediencia_id", "subobediencia_id",             # versão intermediária (primeira renomeação PT-BR)
            "potencia_id",                                    # versão final (Potência)
        ]
        print("Presença de cada nome candidato:")
        for c in candidatos:
            print(f"  {c}: {'SIM' if c in colunas_lojas else 'não'}")

    if tabela_obediencias:
        print(f"\n=== Colunas de '{tabela_obediencias}' ===")
        cur.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position",
            (tabela_obediencias,),
        )
        print([r[0] for r in cur.fetchall()])

    # Rótulo do enum de rito, para saber se a troca para REAA já rodou.
    print("\n=== Enum 'riteenum' (ou equivalente) ===")
    cur.execute(
        """
        SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname ILIKE '%%rite%%' OR t.typname ILIKE '%%rito%%'
        ORDER BY t.typname, e.enumsortorder
        """
    )
    for typname, label in cur.fetchall():
        print(f"  {typname}: {label!r}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    verificar()
