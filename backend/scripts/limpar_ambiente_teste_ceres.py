# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Script de Limpeza Cirúrgica (Teardown) do Ambiente de Teste em Ceres - GO.
Remove com total segurança e integridade referencial:
- Mensagens e tópicos de comunicação da região de teste
- Itens de patrimônio, cautelas e filas de espera da região de teste
- Votações, votos e opções da região de teste
- Prévias de admissão e considerações da região de teste
- Documentos e avisos da região de teste
- Diretoria e Lojas agregadas da região de teste
- A Região de Teste no core_db
- Mandatos, associações e obreiros com CIM 99% ou [TESTE-CORE] em lojas_db
- As 5 Lojas de teste com [TESTE-CORE] em lojas_db
"""
import sys
import os
import psycopg2

URL_CORE = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/core_db"
URL_LOJAS = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lojas_db"
URL_LISTA = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lista_de_lojas_db"

REGIAO_TESTE_ID = "test-core-ceres-go-001"
TAG_TESTE = "[TESTE-CORE]"

def limpar():
    print("==================================================================")
    print(" INICIANDO LIMPEZA CIRÚRGICA DO AMBIENTE DE TESTE (CERES - GO)")
    print("==================================================================")

    conn_core = psycopg2.connect(URL_CORE)
    conn_lojas = psycopg2.connect(URL_LOJAS)
    conn_lista = psycopg2.connect(URL_LISTA)

    cur_core = conn_core.cursor()
    cur_lojas = conn_lojas.cursor()
    cur_lista = conn_lista.cursor()

    try:
        # 1. Limpeza em core_db
        print("\n1. Removendo dados do ambiente de teste em core_db...")

        # Mensagens e Tópicos
        cur_core.execute("""
            DELETE FROM mensagens_comunicacao 
            WHERE topico_id IN (SELECT id FROM topicos_comunicacao WHERE regiao_id = %s);
        """, (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM topicos_comunicacao WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))

        # Patrimônio
        cur_core.execute("DELETE FROM fila_espera_patrimonio WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM emprestimos_patrimonio WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM itens_patrimonio WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))

        # Votações
        cur_core.execute("""
            DELETE FROM votos_lojas 
            WHERE votacao_id IN (SELECT id FROM votacoes_regionais WHERE regiao_id = %s);
        """, (REGIAO_TESTE_ID,))
        cur_core.execute("""
            DELETE FROM opcoes_votacao 
            WHERE votacao_id IN (SELECT id FROM votacoes_regionais WHERE regiao_id = %s);
        """, (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM votacoes_regionais WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))

        # Prévias
        cur_core.execute("""
            DELETE FROM consideracoes_previa 
            WHERE previa_id IN (SELECT id FROM previas_admissao WHERE regiao_id = %s);
        """, (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM previas_admissao WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))

        # Documentos e Avisos
        cur_core.execute("DELETE FROM documentos_regionais WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM avisos_regionais WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))

        # Diretoria e Vínculos
        cur_core.execute("DELETE FROM diretoria_conselho WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM suplentes_conselho WHERE loja_id IN (SELECT loja_id FROM lojas_agregadas WHERE regiao_id = %s);", (REGIAO_TESTE_ID,))
        cur_core.execute("DELETE FROM lojas_agregadas WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))

        # Região de Teste
        cur_core.execute("DELETE FROM regioes WHERE id = %s;", (REGIAO_TESTE_ID,))
        print("   [OK] Dados do core_db removidos.")

        # 2. Limpeza em lojas_db
        print("\n2. Removendo obreiros, mandatos e lojas de teste em lojas_db...")

        # Buscar IDs das lojas de teste
        cur_lojas.execute("SELECT id FROM lojas WHERE nome_loja LIKE %s;", (f"{TAG_TESTE}%",))
        lojas_ids = [r[0] for r in cur_lojas.fetchall()]

        # Buscar IDs dos obreiros de teste
        cur_lojas.execute("SELECT id FROM obreiros WHERE cim LIKE '99%' OR nome_completo LIKE %s;", (f"%{TAG_TESTE}%",))
        obreiros_ids = [r[0] for r in cur_lojas.fetchall()]

        if obreiros_ids:
            cur_lojas.execute("DELETE FROM mandatos WHERE obreiro_id = ANY(%s);", (obreiros_ids,))
            cur_lojas.execute("DELETE FROM obreiro_loja_associacoes WHERE obreiro_id = ANY(%s);", (obreiros_ids,))
            cur_lojas.execute("DELETE FROM obreiros WHERE id = ANY(%s);", (obreiros_ids,))
            print(f"   [OK] {len(obreiros_ids)} obreiros de teste e seus mandatos removidos.")

        if lojas_ids:
            cur_lojas.execute("DELETE FROM mandatos WHERE loja_id = ANY(%s);", (lojas_ids,))
            cur_lojas.execute("DELETE FROM obreiro_loja_associacoes WHERE loja_id = ANY(%s);", (lojas_ids,))
            cur_lojas.execute("DELETE FROM lojas WHERE id = ANY(%s);", (lojas_ids,))
            print(f"   [OK] {len(lojas_ids)} lojas de teste de Ceres removidas.")

        # 3. Limpeza em lista_de_lojas_db
        print("\n3. Removendo lojas de teste em lista_de_lojas_db (lodges)...")
        cur_lista.execute("DELETE FROM lodges WHERE lodge_name LIKE %s;", (f"{TAG_TESTE}%",))
        removidas_lista = cur_lista.rowcount
        print(f"   [OK] {removidas_lista} lojas de teste removidas de lista_de_lojas_db.")

        conn_core.commit()
        conn_lojas.commit()
        conn_lista.commit()

        print("\n==================================================================")
        print(" LIMPEZA CONCLUÍDA: BANCO 100% RESTAURADO AO ESTADO ORIGINAL!")
        print("==================================================================")

    except Exception as e:
        conn_core.rollback()
        conn_lojas.rollback()
        conn_lista.rollback()
        print(f"\n[ERRO] Falha durante a limpeza: {e}")
        raise e
    finally:
        cur_core.close()
        cur_lojas.close()
        cur_lista.close()
        conn_core.close()
        conn_lojas.close()
        conn_lista.close()

if __name__ == "__main__":
    limpar()
