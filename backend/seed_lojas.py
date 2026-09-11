# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import psycopg2
from psycopg2.extras import RealDictCursor
from database import SQLALCHEMY_DATABASE_URL_LEGACY_REF, SQLALCHEMY_DATABASE_URL_LOJAS

def seed():
    if not SQLALCHEMY_DATABASE_URL_LEGACY_REF:
        raise RuntimeError(
            "Variável de ambiente 'DATABASE_URL_LEGACY_REF' não configurada. "
            "Este script de migração precisa dela — preencha-a no backend/.env "
            "(veja backend/.env.example) antes de rodar seed_lojas.py."
        )

    print("Conectando aos bancos...")
    # Conexão com o banco legado (snapshot de referência do projeto "sigma")
    conn_legacy = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LEGACY_REF)
    cur_legacy = conn_legacy.cursor(cursor_factory=RealDictCursor)

    # Conexão com o banco atual
    conn_lojas = psycopg2.connect(SQLALCHEMY_DATABASE_URL_LOJAS)
    cur_lojas = conn_lojas.cursor()

    try:
        print("Migrando Obediências...")
        cur_legacy.execute("SELECT id, name, acronym FROM obediences")
        obediences = cur_legacy.fetchall()
        for obed in obediences:
            cur_lojas.execute("SELECT id FROM obediencias WHERE id = %s", (obed['id'],))
            if cur_lojas.fetchone(): continue
            cur_lojas.execute("""INSERT INTO obediencias (id, nome, sigla, tipo, nome_contato_tecnico, email_contato_tecnico)
                                 VALUES (%s, %s, %s, %s, %s, %s)""",
                (obed['id'], obed['name'], obed['acronym'], 'Federal', 'Admin', 'admin@admin.com'))
        conn_lojas.commit()

        print("Migrando Lojas...")
        cur_legacy.execute("SELECT id, lodge_name, lodge_number, lodge_code, obedience_id, status, is_active FROM lodges")
        lodges = cur_legacy.fetchall()
        for lodge in lodges:
            cur_lojas.execute("SELECT id FROM lojas WHERE id = %s", (lodge['id'],))
            if cur_lojas.fetchone(): continue

            # ALTERAÇÃO (2026-09-11, seção 9.9): coluna de destino renomeada de
            # "obediencia_id" para "potencia_id" em lojas_db (Potência = nível
            # superior; a coluna de origem "obedience_id" é do banco legado
            # esigma_db_ref e não muda). Migração legada assume que toda Loja,
            # sem mais informação, está vinculada direto à Potência — sem
            # Obediência intermediária definida (fica NULL).
            cur_lojas.execute("""
                INSERT INTO lojas (id, nome_loja, numero_loja, codigo_loja, potencia_id, status, ativo, nome_contato_tecnico, email_contato_tecnico)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                lodge['id'],
                lodge['lodge_name'],
                lodge['lodge_number'],
                lodge['lodge_code'] if lodge['lodge_code'] else f"LOJA-{lodge['lodge_number']}",
                lodge['obedience_id'] if lodge['obedience_id'] else 1,
                lodge['status'] if lodge['status'] else 'Ativo',
                lodge['is_active'] if lodge['is_active'] is not None else True,
                'Admin', 'admin@admin.com'
            ))
        conn_lojas.commit()
        print(f"{len(lodges)} Lojas migradas.")

        print("Migrando Obreiros...")
        cur_legacy.execute("""
            SELECT id, full_name, email, cim, password_hash, degree, status
            FROM members
        """)
        members = cur_legacy.fetchall()
        for member in members:
            cur_lojas.execute("SELECT id FROM obreiros WHERE id = %s", (member['id'],))
            if cur_lojas.fetchone(): continue

            # Mapeamento do Grau legado (inteiro) para o novo formato (enum string)
            grau_map = {1: 'Aprendiz', 2: 'Companheiro', 3: 'Mestre', 4: 'Mestre Instalado'}
            grau_nome = grau_map.get(member['degree'], 'Mestre')

            try:
                cur_lojas.execute("""
                    INSERT INTO obreiros (id, nome_completo, email, cim, hash_senha, grau, status, status_registro)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    member['id'],
                    member['full_name'],
                    member['email'],
                    member['cim'],
                    member['password_hash'],
                    grau_nome,
                    member['status'] if member['status'] else 'Ativo',
                    'Aprovado'
                ))
            except Exception as e:
                # Caso o CIM ou email seja duplicado
                conn_lojas.rollback()
                continue

            # Se deu certo o insert (ou não falhou), damos commit em blocos, mas no caso precisa ser aqui ou no fim.
            # Como usamos try-except, precisamos dar commit a cada row se falhar, senao a transação fica invalida.
            conn_lojas.commit()
        conn_lojas.commit()
        print(f"{len(members)} Obreiros migrados.")

        print("Migrando Associações (Member Lodge)...")
        cur_legacy.execute("""
            SELECT id, member_id, lodge_id, start_date, status, member_class
            FROM member_lodge_associations
        """)
        assocs = cur_legacy.fetchall()
        for assoc in assocs:
            # Check if member and lodge exist in target (referential integrity)
            cur_lojas.execute("SELECT id FROM obreiros WHERE id = %s", (assoc['member_id'],))
            if not cur_lojas.fetchone(): continue
            cur_lojas.execute("SELECT id FROM lojas WHERE id = %s", (assoc['lodge_id'],))
            if not cur_lojas.fetchone(): continue

            # Verifica se já existe
            cur_lojas.execute("SELECT id FROM obreiro_loja_associacoes WHERE id = %s", (assoc['id'],))
            if cur_lojas.fetchone():
                continue

            cur_lojas.execute("""
                INSERT INTO obreiro_loja_associacoes (id, obreiro_id, loja_id, data_inicio, status, classe_obreiro)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                assoc['id'],
                assoc['member_id'],
                assoc['lodge_id'],
                assoc['start_date'],
                assoc['status'] if assoc['status'] else 'Ativo',
                assoc['member_class'] if assoc['member_class'] else 'Regular'
            ))
        conn_lojas.commit()
        print(f"{len(assocs)} Associações migradas.")

        print("Migração concluída com sucesso!")

    except Exception as e:
        print("Erro na migração:", e)
        conn_lojas.rollback()
    finally:
        cur_legacy.close()
        conn_legacy.close()
        cur_lojas.close()
        conn_lojas.close()

if __name__ == "__main__":
    seed()
