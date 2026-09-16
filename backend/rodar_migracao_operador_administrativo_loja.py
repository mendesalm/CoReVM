# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Executa a migração `migracao_operador_administrativo_loja.sql` contra o
`core_db` — cria a tabela `operadores_administrativos_loja`, usada pelo
novo perfil de acesso administrativo escopado à Loja (ver
`claude/decisao-controle-acesso-cadastro.md` no Project "Core", seção 5).
Mesmo padrão já usado em `rodar_migracao_historico_lideranca_loja.py` e
demais scripts de migração (psycopg2, sem depender de `psql`).

Como rodar (dentro de `CoReVM/backend`, no mesmo venv do projeto):
    python rodar_migracao_operador_administrativo_loja.py

Pré-requisito: o arquivo `.env` desta pasta precisa ter `DATABASE_URL_CORE`
configurada (é a mesma variável que o backend já usa para funcionar).
"""
import os
import sys

from dotenv import load_dotenv
import psycopg2

load_dotenv()

DATABASE_URL_CORE = os.getenv("DATABASE_URL_CORE")
ARQUIVO_SQL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "migracao_operador_administrativo_loja.sql")

if not DATABASE_URL_CORE:
    print("ERRO: variável de ambiente DATABASE_URL_CORE não encontrada no .env desta pasta.")
    sys.exit(1)

if not os.path.exists(ARQUIVO_SQL):
    print(f"ERRO: arquivo de migração não encontrado em {ARQUIVO_SQL}")
    sys.exit(1)

with open(ARQUIVO_SQL, "r", encoding="utf-8") as f:
    sql_completo = f.read()

print(f"Conectando ao core_db e executando {ARQUIVO_SQL} ...")

conexao = psycopg2.connect(DATABASE_URL_CORE)
try:
    with conexao.cursor() as cursor:
        cursor.execute(sql_completo)
    conexao.commit()
    print("Migração aplicada com sucesso!")
    print("- Tabela 'operadores_administrativos_loja' criada (ou já existia).")
except Exception as e:
    conexao.rollback()
    print(f"ERRO ao aplicar a migração (nada foi alterado, rollback feito): {e}")
    sys.exit(1)
finally:
    conexao.close()
