import sys
from datetime import date, datetime, timedelta
from database import get_db_core
from models.models import Regiao, ItemPatrimonio, EmprestimoPatrimonio, FilaEsperaPatrimonio

def seed():
    db = next(get_db_core())
    regiao_id = "58cf9e32-6134-4e86-bd8e-698b65e2856d"
    
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    if not regiao:
        print("Região não encontrada!")
        return

    # Limpar itens existentes apenas para recarregar seed limpo
    db.query(FilaEsperaPatrimonio).filter(FilaEsperaPatrimonio.regiao_id == regiao_id).delete()
    db.query(EmprestimoPatrimonio).filter(EmprestimoPatrimonio.regiao_id == regiao_id).delete()
    db.query(ItemPatrimonio).filter(ItemPatrimonio.regiao_id == regiao_id).delete()
    db.commit()

    hoje = date.today()

    # 1. Cadeira de Rodas Dobrável Alumínio (Conselho) - 5 no total: 3 disponíveis, 2 emprestadas
    item_cadeira = ItemPatrimonio(
        regiao_id=regiao_id,
        codigo_tombamento="PAT-CORE-2026-001",
        nome="Cadeira de Rodas Dobrável em Alumínio (Ortobrás)",
        descricao="Cadeira de rodas hospitalar de alto conforto, estrutura dobrável em X, apoio de pés removíveis e capacidade até 120kg. Indicada para pós-operatório e reabilitação.",
        categoria="HOSPITALAR",
        tipo_propriedade="CONSELHO",
        quantidade_total=5,
        quantidade_disponivel=3,
        localizacao_fisica="Sala de Hospitalaria - Sede do Conselho Regional (Anápolis)",
        estado_conservacao="OTIMO",
        permite_emprestimo=True,
        permite_locacao=False
    )
    db.add(item_cadeira)
    db.flush()

    # Empréstimo 1 da Cadeira de Rodas (Ativo em dia)
    emp1 = EmprestimoPatrimonio(
        item_id=item_cadeira.id,
        regiao_id=regiao_id,
        loja_solicitante_id="LOJA_ESTRELA_ANAPOLIS_42",
        loja_solicitante_nome="ARLS Estrela de Anápolis",
        loja_solicitante_numero="42",
        beneficiario_final="Familiar de M.'.I.'. da Loja (Recuperação Cirúrgica)",
        responsavel_retirada_nome="Ir.'. Carlos Alberto Mendes",
        responsavel_retirada_cargo="Hospitaleiro",
        responsavel_retirada_contato="(62) 98122-3344",
        responsavel_entrega_nome="Ir.'. Marcos Vinícius Ferreira",
        responsavel_entrega_cargo="Secretário do Conselho Regional",
        data_retirada=hoje - timedelta(days=20),
        data_prevista_devolucao=hoje + timedelta(days=40),
        quantidade=1,
        status="ATIVO",
        estado_conservacao_entrega="OTIMO",
        observacoes="Item retirado em perfeito estado de funcionamento com almofada ortopédica."
    )
    db.add(emp1)

    # Empréstimo 2 da Cadeira de Rodas (Atrasado)
    emp2 = EmprestimoPatrimonio(
        item_id=item_cadeira.id,
        regiao_id=regiao_id,
        loja_solicitante_id="LOJA_UNIAO_TRABALHO_10",
        loja_solicitante_nome="ARLS União e Trabalho",
        loja_solicitante_numero="10",
        beneficiario_final="Irmão do Quadro (Apoio Locomoção)",
        responsavel_retirada_nome="Ir.'. Roberto Siqueira",
        responsavel_retirada_cargo="Venerável Mestre",
        responsavel_retirada_contato="(62) 99244-5566",
        responsavel_entrega_nome="Ir.'. Marcos Vinícius Ferreira",
        responsavel_entrega_cargo="Secretário do Conselho Regional",
        data_retirada=hoje - timedelta(days=75),
        data_prevista_devolucao=hoje - timedelta(days=15),
        quantidade=1,
        status="ATIVO", # rotas calculará ATRASADO
        estado_conservacao_entrega="BOM",
        observacoes="Prazo inicial de 60 dias vencido. Loja informou que solicitará renovação formal."
    )
    db.add(emp2)

    # 2. Pares de Muletas Canadenses Reguláveis (Conselho) - 4 no total: 3 disponíveis, 1 emprestado
    item_muletas = ItemPatrimonio(
        regiao_id=regiao_id,
        codigo_tombamento="PAT-CORE-2026-002",
        nome="Par de Muletas Canadenses Reguláveis em Alumínio",
        descricao="Apoio braquial articulado, regulagem de altura telescópica em 10 níveis e borrachas antiderrapantes novas.",
        categoria="HOSPITALAR",
        tipo_propriedade="CONSELHO",
        quantidade_total=4,
        quantidade_disponivel=3,
        localizacao_fisica="Sala de Hospitalaria - Sede do Conselho Regional (Anápolis)",
        estado_conservacao="NOVO",
        permite_emprestimo=True,
        permite_locacao=False
    )
    db.add(item_muletas)
    db.flush()

    emp_muleta = EmprestimoPatrimonio(
        item_id=item_muletas.id,
        regiao_id=regiao_id,
        loja_solicitante_id="LOJA_LUZ_GOIAS_88",
        loja_solicitante_nome="ARLS Luz de Goiás",
        loja_solicitante_numero="88",
        beneficiario_final="Esposa de Obreiro (Fratura de Tornozelo)",
        responsavel_retirada_nome="Ir.'. Fernando Dias",
        responsavel_retirada_cargo="Chanceler",
        responsavel_retirada_contato="(62) 98455-6677",
        responsavel_entrega_nome="Ir.'. Antônio Silveira",
        responsavel_entrega_cargo="Vice-Presidente do Conselho",
        data_retirada=hoje - timedelta(days=10),
        data_prevista_devolucao=hoje + timedelta(days=20),
        quantidade=1,
        status="ATIVO",
        estado_conservacao_entrega="NOVO",
        observacoes="Cautela assinada digitalmente."
    )
    db.add(emp_muleta)

    # 3. Cama Hospitalar Articulada Manual com Colchão Caixa de Ovo (Conselho) - 1 total: 0 disponíveis (1 emprestada)
    item_cama = ItemPatrimonio(
        regiao_id=regiao_id,
        codigo_tombamento="PAT-CORE-2026-003",
        nome="Cama Hospitalar Articulada Fawler (Cabeceira e Pés)",
        descricao="Cama hospitalar com manivela dupla para elevação do dorso e membros inferiores, grades laterais em inox e colchão hospitalar impermeável com densidade D33.",
        categoria="HOSPITALAR",
        tipo_propriedade="CONSELHO",
        quantidade_total=1,
        quantidade_disponivel=0,
        localizacao_fisica="Residência de Assistido (Sob termo de comodato)",
        estado_conservacao="BOM",
        permite_emprestimo=True,
        permite_locacao=False
    )
    db.add(item_cama)
    db.flush()

    emp_cama = EmprestimoPatrimonio(
        item_id=item_cama.id,
        regiao_id=regiao_id,
        loja_solicitante_id="LOJA_ASILO_VIRTUDE_12",
        loja_solicitante_nome="ARLS Asilo da Virtude",
        loja_solicitante_numero="12",
        beneficiario_final="Irmão Decano da Oficina",
        responsavel_retirada_nome="Ir.'. Geraldo Peixoto",
        responsavel_retirada_cargo="Venerável Mestre",
        responsavel_retirada_contato="(62) 99111-2233",
        responsavel_entrega_nome="Ir.'. Marcos Vinícius Ferreira",
        responsavel_entrega_cargo="Secretário do Conselho Regional",
        data_retirada=hoje - timedelta(days=45),
        data_prevista_devolucao=hoje + timedelta(days=45),
        quantidade=1,
        status="ATIVO",
        estado_conservacao_entrega="BOM",
        observacoes="Instalada na residência do assistido com transporte providenciado pela oficina solicitante."
    )
    db.add(emp_cama)

    # Fila de espera para a Cama Hospitalar (já que está esgotada!)
    fila_cama = FilaEsperaPatrimonio(
        item_id=item_cama.id,
        regiao_id=regiao_id,
        loja_solicitante_id="LOJA_FRATERNIDADE_ANAPOLINA_03",
        loja_solicitante_nome="ARLS Fraternidade Anapolina",
        loja_solicitante_numero="03",
        responsavel_nome="Ir.'. Valdemar Rodrigues (Hospitaleiro)",
        contato="(62) 99333-8899",
        grau_urgencia="URGENTE",
        status="AGUARDANDO",
        observacoes="Mãe de Obreiro recém-operada necessitando de leito regulável com urgência."
    )
    db.add(fila_cama)

    # 4. Item Colaborativo disponibilizado por Loja Jurisdicionada (REDE SOLIDÁRIA)
    item_loja_solidaria = ItemPatrimonio(
        regiao_id=regiao_id,
        codigo_tombamento="PAT-LOJA-2026-004",
        nome="Cadeira de Rodas Reforçada Obeso (Até 160kg)",
        descricao="Cadeira especial com assento alargado de 55cm, estrutura em aço carbono reforçado e pneus maciços. Disponibilizada fraternalmente para qualquer Loja da Região.",
        categoria="HOSPITALAR",
        tipo_propriedade="LOJA",
        loja_proprietaria_id="LOJA_FIRMEZA_LEALDADE_55",
        loja_proprietaria_nome="ARLS Firmeza e Lealdade",
        loja_proprietaria_numero="55",
        quantidade_total=2,
        quantidade_disponivel=2,
        localizacao_fisica="Depósito da Loja Firmeza e Lealdade - Av. Brasil Sul, 1240",
        estado_conservacao="OTIMO",
        permite_emprestimo=True,
        permite_locacao=False
    )
    db.add(item_loja_solidaria)

    # 5. Mobiliário / Eventos: 20 Mesas Redondas de Banquete e 160 Cadeiras Estofadas (Conselho)
    item_mesas = ItemPatrimonio(
        regiao_id=regiao_id,
        codigo_tombamento="PAT-CORE-2026-005",
        nome="Conjunto de Mesas Redondas para Ágapest e Banquetes (8 lugares)",
        descricao="Mesas redondas dobráveis tampo em polietileno de alta densidade 1,80m de diâmetro para sessões magnas e eventos festivos do conselho.",
        categoria="MOBILIARIO",
        tipo_propriedade="CONSELHO",
        quantidade_total=20,
        quantidade_disponivel=20,
        localizacao_fisica="Salão de Banquetes do Templo Central (Anápolis)",
        estado_conservacao="BOM",
        permite_emprestimo=True,
        permite_locacao=True,
        taxa_locacao_estimada="Isento para Lojas do Conselho (Taxa simbólica de limpeza R$ 15,00/mesa)"
    )
    db.add(item_mesas)

    # 6. Equipamento Audiovisual: Kit de Sonorização Móvel e Microfones Sem Fio
    item_som = ItemPatrimonio(
        regiao_id=regiao_id,
        codigo_tombamento="PAT-CORE-2026-006",
        nome="Sistema de Som Portátil JBL Eon One com 2 Microfones Sem Fio",
        descricao="Caixa torre compacta amplificada com mixer integrado, bluetooth e maleta de transporte acolchoada.",
        categoria="AUDIOVISUAL",
        tipo_propriedade="CONSELHO",
        quantidade_total=1,
        quantidade_disponivel=1,
        localizacao_fisica="Gabinete da Presidência - Sede Regional",
        estado_conservacao="NOVO",
        permite_emprestimo=True,
        permite_locacao=False
    )
    db.add(item_som)

    db.commit()
    print("Seed de Patrimônio executado com total sucesso!")

if __name__ == "__main__":
    seed()
