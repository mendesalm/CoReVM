# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Executa a migração `migracao_avisos_arquivamento_e_lidos.sql` contra o
`core_db`, sem depender do cliente `psql` (que não está instalado/no PATH
nesta máquina) — usa `psycopg2`, que já é dependência do projeto
(`requirements.txt`), e lê a mesma variável de ambiente `DATABASE_URL_CORE`
que o próprio backend usa em `database.py`.

Como rodar (dentro de `CoReVM/backend`, no mesmo venv do projeto):
    python rodar_migracao.py

Pré-requisito: o arquivo `.env` desta pasta precisa ter `DATABASE_URL_CORE`
configurada (é a mesma variável que o backend já usa para funcionar).
"""
import os
import sys

from dotenv import load_dotenv
import psycopg2

load_dotenv()

DATABASE_URL_CORE = os.getenv("DATABASE_URL_CORE")
ARQUIVO_SQL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migracao_avisos_arquivamento_e_lidos.sql")

if not DATABASE_URL_CORE:
    print("ERRO: variável de ambiente DATABASE_URL_CORE não encontrada no .env desta pasta.")
    sys.exit(1)

if not os.path.exists(ARQUIVO_SQL):
    print(f"ERRO: arquivo de migração não encontrado em {ARQUIVO_SQL}")
    sys.exit(1)

with open(ARQUIVO_SQL, "r", encoding="utf-8") as f:
    sql_completo = f.read()

# Remove os comentários de rollback do final (tudo depois de "COMMIT;" já
# executado) — eles ficam comentados com "--" no próprio arquivo, então o
# psycopg2 já os ignora ao executar o script inteiro de uma vez.
print(f"Conectando ao core_db e executando {ARQUIVO_SQL} ...")

conexao = psycopg2.connect(DATABASE_URL_CORE)
try:
    with conexao.cursor() as cursor:
        cursor.execute(sql_completo)
    conexao.commit()
    print("Migração aplicada com sucesso!")
    print("- Coluna 'deletado_visualmente' renomeada para 'arquivado' em avisos_regionais.")
    print("- Colunas 'arquivado_em' e 'arquivado_por' adicionadas.")
    print("- Tabela 'avisos_lidos' criada.")
except Exception as e:
    conexao.rollback()
    print(f"ERRO ao aplicar a migração (nada foi alterado, rollback feito): {e}")
    sys.exit(1)
finally:
    conexao.close()
