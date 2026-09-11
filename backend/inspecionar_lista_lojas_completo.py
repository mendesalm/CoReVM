# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Script de apoio para a migração de nomenclatura de `lista_de_lojas_db`
(seção 1.9 do contexto de implementação). Diferente de `inspect_lista_lojas.py`
(que só lista nomes de tabela/coluna), este script também traz:
  - tipo de dado e obrigatoriedade (nullable) de cada coluna;
  - contagem de linhas por tabela;
  - valores distintos de colunas que parecem "categóricas" (status, tipo,
    sigla, rito etc.), para revelar se o problema de idioma está só nos
    NOMES das colunas ou também no CONTEÚDO dos dados.

Rode com: python inspecionar_lista_lojas_completo.py
(a partir da pasta backend/, com o .env configurado — usa DATABASE_URL_LISTA)

Cole a saída completa de volta na conversa para eu desenhar a migração real.
"""
import psycopg2
from database import SQLALCHEMY_DATABASE_URL_LISTA

# Colunas que provavelmente guardam texto categórico/enum — vale ver os
# valores distintos para saber se o conteúdo também está em inglês.
COLUNAS_CATEGORICAS_SUSPEITAS = {
    "status", "situacao", "tipo", "type", "rite", "rito", "grade",
    "degree", "is_active", "ativo", "member_class", "classe",
}

def inspecionar():
    conn = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LISTA)
    cur = conn.cursor()

    cur.execute(
        "SELECT table_name FROM information_schema.tables "
        "WHERE table_schema = 'public' ORDER BY table_name"
    )
    tabelas = [row[0] for row in cur.fetchall()]

    for tabela in tabelas:
        print(f"\n{'=' * 60}")
        print(f"TABELA: {tabela}")
        print("=" * 60)

        cur.execute(
            "SELECT column_name, data_type, is_nullable, character_maximum_length "
            "FROM information_schema.columns "
            "WHERE table_name = %s ORDER BY ordinal_position",
            (tabela,),
        )
        colunas = cur.fetchall()
        for nome_col, tipo, nulavel, tam in colunas:
            tam_str = f"({tam})" if tam else ""
            print(f"  - {nome_col}: {tipo}{tam_str} {'NULL' if nulavel == 'YES' else 'NOT NULL'}")

        try:
            cur.execute(f'SELECT COUNT(*) FROM "{tabela}"')
            total = cur.fetchone()[0]
            print(f"  Total de linhas: {total}")
        except Exception as e:
            print(f"  [erro ao contar linhas: {e}]")
            continue

        for nome_col, tipo, _, _ in colunas:
            if nome_col.lower() in COLUNAS_CATEGORICAS_SUSPEITAS and tipo in (
                "character varying", "text", "character", "boolean",
            ):
                try:
                    cur.execute(
                        f'SELECT DISTINCT "{nome_col}", COUNT(*) FROM "{tabela}" '
                        f'GROUP BY "{nome_col}" ORDER BY 2 DESC LIMIT 15'
                    )
                    valores = cur.fetchall()
                    print(f"  Valores distintos em '{nome_col}':")
                    for valor, contagem in valores:
                        print(f"    {valor!r}: {contagem}")
                except Exception as e:
                    print(f"    [erro ao inspecionar '{nome_col}': {e}]")

    cur.close()
    conn.close()

if __name__ == "__main__":
    inspecionar()
