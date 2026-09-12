"""
Investigação (somente leitura) dos usuários de teste do Conselho Regional.

Roda a partir de CoReVM/backend (reaproveita o .env e o database.py já
configurados lá — não altera nada, só consulta):

    cd C:\\Users\\engan\\Desktop\\CoReVM\\backend
    python investigar_usuarios_teste.py
"""
from sqlalchemy import text
from database import engine_core, engine_esigma

print("=" * 70)
print("1. Pessoas no banco 'esigma' com e-mail parecido com contato@e-sigma.app")
print("   (procurando aliases tipo contato+algo@e-sigma.app)")
print("=" * 70)
with engine_esigma.connect() as conn:
    resultado = conn.execute(text("""
        SELECT id, email, nome_completo, status_acesso,
               senha_hash IS NOT NULL AS tem_senha_hash,
               left(senha_hash, 7) AS prefixo_hash,
               dados_civis -> 'permissoes_sistema' AS permissoes_sistema,
               dados_civis ->> 'cim' AS cim,
               cpf,
               criado_em
        FROM pessoas
        WHERE email ILIKE '%contato%e-sigma.app%'
           OR email ILIKE '%teste%'
        ORDER BY criado_em DESC NULLS LAST
    """)).fetchall()
    if not resultado:
        print("Nenhuma pessoa encontrada com esse padrão de e-mail.")
    for row in resultado:
        print(dict(row._mapping))

print()
print("=" * 70)
print("2. Diretoria do Conselho cadastrada (banco 'core_db')")
print("=" * 70)
with engine_core.connect() as conn:
    try:
        resultado = conn.execute(text("""
            SELECT usuario_id, regiao_id, cargo
            FROM diretoria_conselho
        """)).fetchall()
        if not resultado:
            print("Nenhum registro em diretoria_conselho.")
        for row in resultado:
            print(dict(row._mapping))
    except Exception as e:
        print(f"[ERRO ao consultar diretoria_conselho: {e}]")

print()
print("=" * 70)
print("3. Suplentes do Conselho cadastrados (banco 'core_db')")
print("=" * 70)
with engine_core.connect() as conn:
    try:
        resultado = conn.execute(text("""
            SELECT usuario_id, loja_id, nome_suplente, email_suplente
            FROM suplentes_conselho
        """)).fetchall()
        if not resultado:
            print("Nenhum registro em suplentes_conselho.")
        for row in resultado:
            print(dict(row._mapping))
    except Exception as e:
        print(f"[ERRO ao consultar suplentes_conselho: {e}]")

print()
print("=" * 70)
print("4. Lojas Agregadas cadastradas (banco 'core_db') — quais Regiões existem")
print("=" * 70)
with engine_core.connect() as conn:
    try:
        resultado = conn.execute(text("""
            SELECT id, nome, ativa FROM regioes
        """)).fetchall()
        if not resultado:
            print("Nenhuma Região cadastrada.")
        for row in resultado:
            print(dict(row._mapping))
    except Exception as e:
        print(f"[ERRO ao consultar regioes: {e}]")
