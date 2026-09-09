# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Script de Criação do Ambiente de Teste Isolado do CoReVM em Ceres - GO.
Cria:
- 1 Região de Teste no core_db: [TESTE-CORE] Conselho Regional do Vale do São Patrício - Ceres
- 5 Lojas no lojas_db (3 GOB/GOBGO e 2 GLEGO) com ritos canônicos e CEP de Ceres
- 35 Mestres Maçons com CIMs 99XXXXX, CPFs válidos (mod 11), telefones WhatsApp
- 35 Mandatos vigentes (maio/2025 a maio/2027) com os 7 oficiais de cada loja
- Mesa Diretora Regional do Conselho de Ceres
- Dados iniciais de demonstração para testes ponta a ponta
"""
import sys
import os
from datetime import date, datetime

# Garante que o diretório backend esteja no path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import psycopg2
from psycopg2.extras import execute_values

# Conexões diretas via psycopg2
URL_CORE = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/core_db"
URL_LOJAS = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lojas_db"

REGIAO_TESTE_ID = "test-core-ceres-go-001"
TAG_TESTE = "[TESTE-CORE]"

def gerar_cpf_valido(base_num: int) -> str:
    """Gera um CPF matematicamente válido atendendo ao módulo 11."""
    s = f"{base_num:09d}"
    soma1 = sum(int(s[i]) * (10 - i) for i in range(9))
    resto1 = (soma1 * 10) % 11
    d1 = 0 if resto1 == 10 else resto1
    soma2 = sum(int(s[i]) * (11 - i) for i in range(9)) + (d1 * 2)
    resto2 = (soma2 * 10) % 11
    d2 = 0 if resto2 == 10 else resto2
    return f"{s[:3]}.{s[3:6]}.{s[6:9]}-{d1}{d2}"

def seed():
    print("==================================================================")
    print(" INICIANDO MONTAGEM DO AMBIENTE DE TESTE ISOLADO (CERES - GO)")
    print("==================================================================")

    conn_core = psycopg2.connect(URL_CORE)
    conn_lojas = psycopg2.connect(URL_LOJAS)

    cur_core = conn_core.cursor()
    cur_lojas = conn_lojas.cursor()

    try:
        # Sincronizar sequências no lojas_db
        for tabela in ['lojas', 'obreiros', 'mandatos', 'obreiro_loja_associacoes']:
            try:
                cur_lojas.execute(f"SELECT pg_get_serial_sequence('{tabela}', 'id');")
                seq = cur_lojas.fetchone()[0]
                if seq:
                    cur_lojas.execute(f"SELECT setval('{seq}', (SELECT COALESCE(max(id), 1) FROM {tabela}));")
            except Exception:
                pass
        conn_lojas.commit()

        # -------------------------------------------------------------
        # 1. REGIÃO NO CORE_DB
        # -------------------------------------------------------------
        print("\n1. Criando/Atualizando Região de Teste no core_db...")
        cur_core.execute("SELECT id FROM regioes WHERE id = %s;", (REGIAO_TESTE_ID,))
        if not cur_core.fetchone():
            cur_core.execute("""
                INSERT INTO regioes (id, nome, uf, ativa)
                VALUES (%s, %s, %s, %s);
            """, (
                REGIAO_TESTE_ID,
                f"{TAG_TESTE} Conselho Regional do Vale do São Patrício - Ceres",
                "GO",
                True
            ))
            print(f"   [OK] Região de teste '{REGIAO_TESTE_ID}' criada.")
        else:
            print(f"   [OK] Região de teste '{REGIAO_TESTE_ID}' já existia.")

        # -------------------------------------------------------------
        # 2. CRIANDO AS 5 LOJAS EM LOJAS_DB
        # -------------------------------------------------------------
        print("\n2. Criando as 5 Lojas de teste em lojas_db (Ceres - GO)...")
        # Ritos canônicos no enum ritoenum:
        # 'Rito Escocês Antigo e Aceito', 'Rito Moderno', 'Rito Brasileiro', 'Rito York', 'Rito Schroder'
        dados_lojas = [
            {
                "numero": "901",
                "nome": f"{TAG_TESTE} ARLS Ceres Fraterna",
                "titulo": "ARLS",
                "rito": "Rito Escocês Antigo e Aceito",
                "obediencia_id": 12, # GOB
                "subobediencia_id": 13, # GOBGO
                "cidade": "Ceres",
                "estado": "GO",
                "cep": "76300-000"
            },
            {
                "numero": "902",
                "nome": f"{TAG_TESTE} ARLS Luz de São Patrício",
                "titulo": "ARLS",
                "rito": "Rito Moderno",
                "obediencia_id": 12, # GOB
                "subobediencia_id": 13, # GOBGO
                "cidade": "Ceres",
                "estado": "GO",
                "cep": "76300-000"
            },
            {
                "numero": "903",
                "nome": f"{TAG_TESTE} ARLS União do Vale",
                "titulo": "ARLS",
                "rito": "Rito Brasileiro",
                "obediencia_id": 12, # GOB
                "subobediencia_id": 13, # GOBGO
                "cidade": "Ceres",
                "estado": "GO",
                "cep": "76300-000"
            },
            {
                "numero": "904",
                "nome": f"{TAG_TESTE} ARLS Acácia de Ceres",
                "titulo": "ARLS",
                "rito": "Rito York",
                "obediencia_id": 14, # GLEG
                "subobediencia_id": None,
                "cidade": "Ceres",
                "estado": "GO",
                "cep": "76300-000"
            },
            {
                "numero": "905",
                "nome": f"{TAG_TESTE} ARLS Guardiões do Rio das Almas",
                "titulo": "ARLS",
                "rito": "Rito Schroder",
                "obediencia_id": 14, # GLEG
                "subobediencia_id": None,
                "cidade": "Ceres",
                "estado": "GO",
                "cep": "76300-000"
            }
        ]

        lojas_criadas = []
        for l in dados_lojas:
            cur_lojas.execute("SELECT id FROM lojas WHERE numero_loja = %s AND nome_loja LIKE %s;", (l["numero"], f"{TAG_TESTE}%"))
            row = cur_lojas.fetchone()
            if row:
                loja_id = row[0]
                print(f"   - Loja {l['numero']} já existente com ID {loja_id}.")
            else:
                import uuid
                cur_lojas.execute("""
                    INSERT INTO lojas (
                        nome_loja, titulo_loja, codigo_loja, numero_loja, rito, 
                        obediencia_id, subobediencia_id, cidade, estado, cep, 
                        ativo, nome_contato_tecnico, email_contato_tecnico
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id;
                """, (
                    l["nome"], l["titulo"], str(uuid.uuid4()), l["numero"], l["rito"],
                    l["obediencia_id"], l["subobediencia_id"], l["cidade"], l["estado"], l["cep"],
                    True, "Secretaria Ceres", f"contato.loja{l['numero']}@teste-core.org.br"
                ))
                loja_id = cur_lojas.fetchone()[0]
                print(f"   [+] Loja {l['numero']} ({l['nome']}) cadastrada com ID {loja_id}.")

            lojas_criadas.append({"id": loja_id, **l})

        # -------------------------------------------------------------
        # 3. VINCULANDO LOJAS À REGIÃO DE TESTE (LOJAS_AGREGADAS)
        # -------------------------------------------------------------
        print("\n3. Vinculando as 5 Lojas de teste à Região no core_db...")
        for l in lojas_criadas:
            cur_core.execute("""
                SELECT id FROM lojas_agregadas 
                WHERE regiao_id = %s AND loja_id = %s;
            """, (REGIAO_TESTE_ID, str(l["id"])))
            if not cur_core.fetchone():
                cur_core.execute("""
                    INSERT INTO lojas_agregadas (id, regiao_id, loja_id, data_filiacao, ativa)
                    VALUES (gen_random_uuid(), %s, %s, %s, %s);
                """, (REGIAO_TESTE_ID, str(l["id"]), date(2025, 5, 1), True))
                print(f"   [+] Loja {l['id']} vinculada à Região de Ceres.")

        # -------------------------------------------------------------
        # 4. CRIANDO OS 35 MESTRES MAÇONS E MANDATOS EM LOJAS_DB
        # -------------------------------------------------------------
        print("\n4. Criando 35 Mestres Maçons com CIMs 99XXXXX e Mandatos (maio/2025 a maio/2027)...")
        cargos_ordem = [
            (1, "Venerável Mestre", "Mestre Instalado"),
            (2, "Primeiro Vigilante", "Mestre"),
            (3, "Segundo Vigilante", "Mestre"),
            (4, "Orador", "Mestre"),
            (5, "Secretário", "Mestre"),
            (6, "Tesoureiro", "Mestre"),
            (7, "Chanceler", "Mestre")
        ]

        nomes_por_loja = [
            # Loja 901
            ["Bernardo Silveira", "Carlos Drummond", "Daniel Guimarães", "Eduardo Prado", "Fernando Dias", "Gabriel Arcanjo", "Heitor Villa"],
            # Loja 902
            ["Ícaro Beltrão", "Jorge Amado", "Kléber Toledo", "Leandro Karnal", "Murilo Mendes", "Newton Paiva", "Olavo Bilac"],
            # Loja 903
            ["Lucas Medeiros", "Paulo Freire", "Quintino Bocaiúva", "Renato Russo", "Sérgio Buarque", "Tom Jobim", "Ulysses Guimarães"],
            # Loja 904
            ["Marcelo Queiroz", "Vicente Celestino", "Wagner Tiso", "Xisto Bahia", "Yuri Gagarin", "Ziraldo Alves", "Ariano Suassuna"],
            # Loja 905
            ["Otávio Bueno", "Bento Gonçalves", "Castro Alves", "Dario Vellozo", "Euclides da Cunha", "Fagundes Varella", "Gonçalves Dias"]
        ]

        obreiros_criados = []
        cim_contador = 9900001
        base_cpf = 991000001

        # Senha padrão em hash bcrypt ("teste123")
        HASH_PADRAO = "$2b$12$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

        for idx_loja, l in enumerate(lojas_criadas):
            loja_id = l["id"]
            nomes_loja = nomes_por_loja[idx_loja]
            print(f"\n   -> Montando Diretoria da Loja {l['numero']} ({l['nome']}):")

            for idx_cargo, (cargo_id, cargo_nome, grau_maconico) in enumerate(cargos_ordem):
                cim_str = str(cim_contador)
                nome_obreiro = f"{nomes_loja[idx_cargo]} {TAG_TESTE}"
                email_obreiro = f"cim{cim_str}.loja{l['numero']}@teste-core.org.br"
                cpf_valido = gerar_cpf_valido(base_cpf)
                tel_whatsapp = f"(62) 999{l['numero'][1:]}-{idx_cargo+1:04d}"

                # Verifica se obreiro já existe por CIM
                cur_lojas.execute("SELECT id FROM obreiros WHERE cim = %s;", (cim_str,))
                row_ob = cur_lojas.fetchone()
                if row_ob:
                    obreiro_id = row_ob[0]
                else:
                    cur_lojas.execute("""
                        INSERT INTO obreiros (
                            cim, nome_completo, email, cpf, telefone, status,
                            grau, status_registro, hash_senha, cidade, estado
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id;
                    """, (
                        cim_str, nome_obreiro, email_obreiro, cpf_valido, tel_whatsapp,
                        "Ativo", grau_maconico, "Aprovado", HASH_PADRAO, "Ceres", "GO"
                    ))
                    obreiro_id = cur_lojas.fetchone()[0]

                # Associação na Loja
                cur_lojas.execute("""
                    SELECT id FROM obreiro_loja_associacoes 
                    WHERE obreiro_id = %s AND loja_id = %s;
                """, (obreiro_id, loja_id))
                if not cur_lojas.fetchone():
                    cur_lojas.execute("""
                        INSERT INTO obreiro_loja_associacoes (
                            obreiro_id, loja_id, status, classe_obreiro, data_inicio
                        ) VALUES (%s, %s, %s, %s, %s);
                    """, (obreiro_id, loja_id, "Ativo", "Regular", date(2025, 5, 1)))

                # Mandato Ativo (maio/2025 a maio/2027)
                cur_lojas.execute("""
                    SELECT id FROM mandatos 
                    WHERE obreiro_id = %s AND loja_id = %s AND cargo_id = %s;
                """, (obreiro_id, loja_id, cargo_id))
                if not cur_lojas.fetchone():
                    cur_lojas.execute("""
                        INSERT INTO mandatos (
                            obreiro_id, loja_id, cargo_id, data_inicio, data_fim
                        ) VALUES (%s, %s, %s, %s, %s);
                    """, (obreiro_id, loja_id, cargo_id, date(2025, 5, 1), date(2027, 5, 31)))

                obreiros_criados.append({
                    "id": obreiro_id,
                    "cim": cim_str,
                    "nome": nome_obreiro,
                    "cargo": cargo_nome,
                    "cargo_id": cargo_id,
                    "loja_id": loja_id,
                    "loja_numero": l["numero"]
                })

                print(f"      • {cargo_nome}: {nomes_loja[idx_cargo]} (CIM {cim_str}, CPF: {cpf_valido})")

                cim_contador += 1
                base_cpf += 1

        # -------------------------------------------------------------
        # 5. MESA DIRETORA REGIONAL EM CORE_DB (DIRETORIA_CONSELHO)
        # -------------------------------------------------------------
        print("\n5. Compondo a Mesa Diretora do Conselho de Ceres em core_db...")
        # Presidente: CIM 9900001 (VM da Loja 901)
        # Vice-Presidente: CIM 9900008 (VM da Loja 902)
        # Secretário: CIM 9900015 (VM da Loja 903)
        # Tesoureiro: CIM 9900022 (VM da Loja 904)
        # Chanceler: CIM 9900029 (VM da Loja 905)
        # Hospitaleiro: CIM 9900002 (1º Vig da Loja 901)
        membros_diretoria = [
            ("PRESIDENTE", "9900001"),
            ("VICE_PRESIDENTE", "9900008"),
            ("SECRETARIO", "9900015"),
            ("DELEGADO", "9900022")
        ]

        for cargo_enum, cim_membro in membros_diretoria:
            cur_core.execute("""
                SELECT id FROM diretoria_conselho 
                WHERE regiao_id = %s AND cargo = %s;
            """, (REGIAO_TESTE_ID, cargo_enum))
            row_dir = cur_core.fetchone()
            if not row_dir:
                cur_core.execute("""
                    INSERT INTO diretoria_conselho (
                        id, regiao_id, usuario_id, cargo, inicio_mandato, termino_mandato
                    ) VALUES (gen_random_uuid(), %s, %s, %s, %s, %s);
                """, (REGIAO_TESTE_ID, cim_membro, cargo_enum, date(2025, 5, 1), date(2027, 5, 31)))
                print(f"   [+] Cargo Regional {cargo_enum} atribuído ao CIM {cim_membro}.")

        # -------------------------------------------------------------
        # 6. DADOS INICIAIS DE DEMONSTRAÇÃO PARA OS TESTES
        # -------------------------------------------------------------
        print("\n6. Criando registros iniciais de demonstração para testes...")

        # 6.1 Votação de Teste
        cur_core.execute("SELECT id FROM votacoes_regionais WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))
        if not cur_core.fetchone():
            cur_core.execute("""
                INSERT INTO votacoes_regionais (
                    id, regiao_id, titulo, descricao, tipo, status, 
                    opcoes, data_abertura, data_encerramento, autor_nome, autor_cargo
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                );
            """, (
                REGIAO_TESTE_ID,
                f"{TAG_TESTE} Aprovação do Fundo Regional de Auxílio e Solidariedade de Ceres",
                "Deliberação plenária sobre a criação do fundo regional solidário entre as 5 Lojas de Ceres.",
                "DELIBERACAO",
                "EM_ANDAMENTO",
                '["Favorável", "Contrário", "Abstenção"]',
                date.today(),
                date(2026, 12, 31),
                "Ir. Bernardo Silveira [TESTE-CORE]",
                "Presidente Regional"
            ))
            print("   [+] Votação plenária de teste criada.")

        # 6.2 Bens de Patrimônio
        cur_core.execute("SELECT id FROM itens_patrimonio WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))
        if not cur_core.fetchone():
            # Item do Conselho
            cur_core.execute("""
                INSERT INTO itens_patrimonio (
                    id, regiao_id, codigo_tombamento, nome, descricao, categoria,
                    tipo_propriedade, quantidade_total, quantidade_disponivel,
                    localizacao_fisica, estado_conservacao, permite_emprestimo, permite_locacao
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                );
            """, (
                REGIAO_TESTE_ID, "PAT-CERES-001", f"{TAG_TESTE} Cadeira de Rodas Hospitalar Ceres 01",
                "Cadeira de rodas para empréstimo fraterno de hospitalaria regional.",
                "HOSPITALARIA", "CONSELHO", 2, 2, "Sede Regional Ceres", "BOM", True, False
            ))
            # Item da Rede Solidária (Loja 903)
            cur_core.execute("""
                INSERT INTO itens_patrimonio (
                    id, regiao_id, codigo_tombamento, nome, descricao, categoria,
                    tipo_propriedade, loja_proprietaria_id, loja_proprietaria_nome, loja_proprietaria_numero,
                    quantidade_total, quantidade_disponivel, localizacao_fisica, estado_conservacao,
                    permite_emprestimo, permite_locacao
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                );
            """, (
                REGIAO_TESTE_ID, "PAT-CERES-LOJA903", f"{TAG_TESTE} Par de Muletas Reguláveis de Alumínio",
                "Bem solidário disponibilizado pela ARLS União do Vale nº 903 para toda a região.",
                "HOSPITALARIA", "LOJA", str(lojas_criadas[2]["id"]), lojas_criadas[2]["nome"], "903",
                2, 2, "Templo da Loja 903", "NOVO", True, False
            ))
            print("   [+] Bens de patrimônio e Rede Solidária de teste cadastrados.")

        # 6.3 Prancha Circular Inicial
        cur_core.execute("SELECT id FROM topicos_comunicacao WHERE regiao_id = %s;", (REGIAO_TESTE_ID,))
        if not cur_core.fetchone():
            cur_core.execute("""
                INSERT INTO topicos_comunicacao (
                    id, regiao_id, assunto, categoria, tipo_alcance, prioridade, status,
                    criado_por_id, criado_por_nome, criado_por_tipo, data_criacao, data_ultima_mensagem
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id;
            """, (
                REGIAO_TESTE_ID,
                f"{TAG_TESTE} Prancha Circular nº 01/2025 - Instalação do Conselho de Ceres",
                "ADMINISTRATIVO", "CIRCULAR", "NORMAL", "ABERTA",
                "9900001", "Ir. Bernardo Silveira [TESTE-CORE]", "DIRETORIA",
                datetime.utcnow(), datetime.utcnow()
            ))
            topico_id = cur_core.fetchone()[0]

            cur_core.execute("""
                INSERT INTO mensagens_comunicacao (
                    id, topico_id, remetente_id, remetente_nome, remetente_cargo,
                    tipo_remetente, conteudo, data_envio, lida
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s
                );
            """, (
                topico_id, "9900001", "Ir. Bernardo Silveira [TESTE-CORE]", "Presidente Regional",
                "DIRETORIA",
                "Saudações Fraternais a todos os Veneráveis Mestres e Oficiais das 5 Lojas de Ceres. Damos início formal aos trabalhos do nosso Conselho Regional.",
                datetime.utcnow(), False
            ))
            print("   [+] Prancha Circular Geral nº 01/2025 protocolada.")

        # Commit em ambos os bancos
        conn_core.commit()
        conn_lojas.commit()

        print("\n==================================================================")
        print(" AMBIENTE DE TESTE INSTALADO COM ABSOLUTO SUCESSO!")
        print("==================================================================")
        print(f"ID da Região de Teste: {REGIAO_TESTE_ID}")
        print("Acesse no Frontend: /regiao/test-core-ceres-go-001")
        print("Lojas Criadas:")
        for l in lojas_criadas:
            print(f"  • Loja {l['numero']}: {l['nome']} (ID no BD: {l['id']}, Rito: {l['rito']})")

    except Exception as e:
        conn_core.rollback()
        conn_lojas.rollback()
        print(f"\n[ERRO CRÍTICO] Falha ao instalar ambiente de teste: {e}")
        raise e
    finally:
        cur_core.close()
        cur_lojas.close()
        conn_core.close()
        conn_lojas.close()

if __name__ == "__main__":
    seed()
