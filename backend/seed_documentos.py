import os
import uuid
from datetime import date, datetime, timedelta
from database import get_db_core
from models.models import Regiao, DocumentoRegional
from utils.pdf_generator import gerar_pdf_documento_regional

def seed():
    db = next(get_db_core())
    regiao_id = "58cf9e32-6134-4e86-bd8e-698b65e2856d"
    
    regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
    if not regiao:
        print("Região não encontrada!")
        return

    # Limpar documentos existentes da região para reload limpo
    db.query(DocumentoRegional).filter(DocumentoRegional.regiao_id == regiao_id).delete()
    db.commit()

    diretorio_destino = os.path.join("uploads", "documentos", regiao_id)
    os.makedirs(diretorio_destino, exist_ok=True)

    hoje = date.today()
    conselho_nome = regiao.nome

    documentos_seed = [
        {
            "codigo": "ATA-CORE-04/2026",
            "titulo": "Ata da 4ª Reunião Plenária Ordinária do Conselho Regional",
            "categoria": "ATA",
            "tipo_origem": "CONSELHO",
            "ementa": "Deliberações sobre o calendário de sessões conjuntas, prestação de contas do fundo de beneficência e homologação de novos membros da mesa diretora.",
            "data_doc": hoje - timedelta(days=12),
            "autor_nome": "Ir.'. Marcos Vinícius Ferreira",
            "autor_cargo": "Secretário Regional",
            "loja_nome": None,
            "loja_numero": None,
            "conteudo": (
                "Aos vinte e cinco dias do mês de agosto de dois mil e vinte e seis da Era Vulgar, reuniu-se ordinariamente "
                "o Conselho Regional de Veneráveis Mestres de Anápolis e Região, sob a presidência do Ir.'. Presidente do Conselho, "
                "contando com a presença dos Veneráveis Mestres e Representantes Legais de 14 Lojas Jurisdicionadas.\n\n"
                "Iniciados os trabalhos litúrgicos no Grau de Aprendiz, procedeu-se à leitura e aprovação unânime da ata da reunião anterior. "
                "Em seguida, o Ir.'. Presidente expôs a proposta de unificação do calendário de iniciações e sessões magnas para o biênio 2026/2027, "
                "ressaltando a importância de evitar sobreposição de datas entre oficinas irmãs.\n\n"
                "Colocada em votação, a proposta foi aprovada por aclamação pela unanimidade dos presentes. Não havendo mais matérias a deliberar, "
                "a reunião foi suspensa às 22h15, lavrando-se a presente ata que, lida e achada conforme, vai devidamente assinada pela Mesa Diretora."
            )
        },
        {
            "codigo": "DEC-CORE-01/2026",
            "titulo": "Decreto Regional nº 01/2026 — Criação do Fundo Regional de Beneficência",
            "categoria": "DECRETO",
            "tipo_origem": "CONSELHO",
            "ementa": "Institui e regulamenta a gestão do Fundo Emergencial de Beneficência e Hospitalaria Regional para assistência a obreiros e seus familiares.",
            "data_doc": hoje - timedelta(days=25),
            "autor_nome": "Ir.'. Presidente do Conselho",
            "autor_cargo": "Presidente do Conselho Regional",
            "loja_nome": None,
            "loja_numero": None,
            "conteudo": (
                "O PRESIDENTE DO CONSELHO REGIONAL DE VENERÁVEIS MESTRES DE ANÁPOLIS E REGIÃO, no uso de suas prerrogativas canônicas "
                "e em cumprimento à soberana decisão da Plenária Regional de Veneráveis Mestres:\n\n"
                "DECRETA:\n"
                "Art. 1º - Fica formalmente instituído o Fundo Regional de Hospitalaria e Beneficência Maçônica, destinado ao suporte emergencial "
                "de saúde, medicamentos e locomoção para Irmãos, cunhadas e sobrinhos jurisdicionados ao conselho.\n\n"
                "Art. 2º - A custódia e administração financeira do Fundo caberá conjuntamente ao Presidente e ao Tesoureiro do Conselho, "
                "com prestação de contas mensal transparente disponibilizada no módulo financeiro do CoReVM.\n\n"
                "Art. 3º - Este Decreto entra em vigor na data de sua publicação oficial no repositório documental do CoReVM."
            )
        },
        {
            "codigo": "REG-CORE-01/2026",
            "titulo": "Regimento Interno e Normas Canônicas do Conselho Regional",
            "categoria": "REGULAMENTO",
            "tipo_origem": "CONSELHO",
            "ementa": "Estatuto consolidado, deveres dos Veneráveis Mestres membros, quóruns deliberativos e funcionamento das comissões regionais.",
            "data_doc": hoje - timedelta(days=60),
            "autor_nome": "Comissão de Legislação e Justiça",
            "autor_cargo": "Relatoria do Conselho",
            "loja_nome": None,
            "loja_numero": None,
            "conteudo": (
                "CAPÍTULO I - DA NATUREZA E FINALIDADES\n"
                "Art. 1º - O Conselho Regional de Veneráveis Mestres de Anápolis e Região é órgão colegiado fraterno, representativo "
                "das Oficinas Maçônicas jurisdicionadas, com o objetivo de promover a integração, a harmonia ritualística e a mútua assistência.\n\n"
                "CAPÍTULO II - DA COMPOSIÇÃO E MANDATOS\n"
                "Art. 2º - Integram o Conselho todos os Veneráveis Mestres em exercício das Lojas sediadas no Oriente de Anápolis e circunvizinhança.\n\n"
                "CAPÍTULO III - DAS VOTAÇÕES E QUÓRUNS\n"
                "Art. 3º - Cada Loja Jurisdicionada terá direito a exatamente 1 (um) voto formal nas deliberações plenárias, "
                "exercido pelo seu respectivo Venerável Mestre ou pelo Primeiro Vigilante legitimamente credenciado."
            )
        },
        {
            "codigo": "CIR-CORE-02/2026",
            "titulo": "Prancha Circular nº 02/2026 — Orientação Litúrgica para Sessões Conjuntas",
            "categoria": "CIRCULAR",
            "tipo_origem": "CONSELHO",
            "ementa": "Recomendações ritualísticas, protocolo de recepção de autoridades maçônicas e trajes para os banquetes comemorativos do semestre.",
            "data_doc": hoje - timedelta(days=5),
            "autor_nome": "Ir.'. Marcos Vinícius Ferreira",
            "autor_cargo": "Secretário Regional",
            "loja_nome": None,
            "loja_numero": None,
            "conteudo": (
                "A todos os Respeitáveis Veneráveis Mestres das Lojas Jurisdicionadas,\n\n"
                "Saudações Fraternais.\n\n"
                "A Mesa Diretora do Conselho Regional recomenda a estrita observância do protocolo litúrgico nas sessões magnas conjuntas, "
                "especialmente quanto à recepção das comitivas no Átrio, pontualidade na entrada das colunas e trajes a rigor conforme os ritos.\n\n"
                "Solicitamos que as confirmações de presença dos quadros de obreiros sejam enviadas à Secretaria do Conselho com antecedência "
                "mínima de 72 horas para a adequada organização dos ágapest."
            )
        },
        {
            "codigo": "CONV-LOJA42-01/2026",
            "titulo": "Prancha Convite: Sessão Magna Comemorativa de 50 Anos da ARLS Estrela de Anápolis",
            "categoria": "CONVITE",
            "tipo_origem": "LOJA",
            "ementa": "Convite a todos os Veneráveis Mestres e Obreiros da Região para o Jubileu de Ouro de fundação da oficina.",
            "data_doc": hoje - timedelta(days=8),
            "autor_nome": "Ir.'. Carlos Alberto Mendes",
            "autor_cargo": "Venerável Mestre",
            "loja_nome": "ARLS Estrela de Anápolis",
            "loja_numero": "42",
            "conteudo": (
                "A Aug.'. e Resp.'. Loja Simb.'. Estrela de Anápolis nº 42 tem a sublime honra e grata satisfação de convidar o Ilustre "
                "Conselho Regional de Veneráveis Mestres e todas as Lojas Coirmãs para a SESSÃO MAGNA COMEMORATIVA DO JUBILEU DE OURO (50 ANOS) "
                "de nossa fundação.\n\n"
                "Data: 18 de Outubro de 2026, às 20h00.\n"
                "Local: Templo Nobre da Fraternidade, Av. São Francisco, nº 850 - Anápolis - GO.\n"
                "Traje: Terno escuro completo com paramentos do grau.\n\n"
                "Após a magna sessão, será servido um Ágape Festivo comemorativo com a presença das cunhadas e sobrinhos."
            )
        },
        {
            "codigo": "MOD-CORE-01/2026",
            "titulo": "Modelo Padrão: Termo de Cautela e Comodato para Equipamentos Ortopédicos",
            "categoria": "MODELO",
            "tipo_origem": "CONSELHO",
            "ementa": "Minuta padrão de cautela fraterna para empréstimo de cadeiras de rodas, muletas e camas hospitalares do acervo.",
            "data_doc": hoje - timedelta(days=15),
            "autor_nome": "Ir.'. Marcos Vinícius Ferreira",
            "autor_cargo": "Secretário Regional",
            "loja_nome": None,
            "loja_numero": None,
            "conteudo": (
                "TERMO PADRONIZADO DE CAUTELA E COMODATO FRATERNO\n\n"
                "Pelo presente instrumento, a Loja Solicitante qualificada no sistema CoReVM declara ter recebido do Conselho Regional "
                "de Veneráveis Mestres de Anápolis, em perfeito estado de funcionamento e higienização, o bem patrimonial especificado.\n\n"
                "Compromete-se a zelar pela sua integridade física, utilizá-lo exclusivamente para a finalidade assistencial pactuada "
                "e efetuar a devolução no prazo regulamentar assinalado no sistema."
            )
        }
    ]

    for doc_data in documentos_seed:
        doc_id = str(uuid.uuid4())
        caminho_pdf = os.path.join(diretorio_destino, f"{doc_id}.pdf")

        gerar_pdf_documento_regional(
            caminho_saida=caminho_pdf,
            codigo_documento=doc_data["codigo"],
            titulo=doc_data["titulo"],
            categoria=doc_data["categoria"],
            descricao_ementa=doc_data["ementa"],
            conteudo_texto=doc_data["conteudo"],
            data_documento=doc_data["data_doc"],
            autor_nome=doc_data["autor_nome"],
            autor_cargo=doc_data["autor_cargo"],
            tipo_origem=doc_data["tipo_origem"],
            loja_emissora_nome=doc_data["loja_nome"],
            conselho_nome=conselho_nome
        )

        tamanho = os.path.getsize(caminho_pdf) if os.path.exists(caminho_pdf) else 0

        doc_db = DocumentoRegional(
            id=doc_id,
            regiao_id=regiao_id,
            codigo_documento=doc_data["codigo"],
            titulo=doc_data["titulo"],
            descricao_ementa=doc_data["ementa"],
            categoria=doc_data["categoria"],
            tipo_origem=doc_data["tipo_origem"],
            loja_emissora_id="LOJA_ESTRELA_ANAPOLIS_42" if doc_data["loja_numero"] == "42" else None,
            loja_emissora_nome=doc_data["loja_nome"],
            loja_emissora_numero=doc_data["loja_numero"],
            autor_nome=doc_data["autor_nome"],
            autor_cargo=doc_data["autor_cargo"],
            data_documento=doc_data["data_doc"],
            data_publicacao=datetime.utcnow(),
            arquivo_url=caminho_pdf,
            tamanho_bytes=tamanho,
            downloads_count=12 if doc_data["categoria"] in ["ATA", "REGULAMENTO"] else 5,
            visibilidade="PUBLICO_CONSELHO",
            conteudo_texto=doc_data["conteudo"]
        )
        db.add(doc_db)

    db.commit()
    print("Seed de Documentos executado com total sucesso!")

if __name__ == "__main__":
    seed()
