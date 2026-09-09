import os
from datetime import date
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def gerar_pdf_previa(
    caminho_saida: str,
    tipo: str,
    loja_nome: str,
    loja_numero: str,
    candidato_nome: str,
    data_postagem: date,
    data_limite: date = None,
    conselho_nome: str = "Conselho Regional de Veneráveis Mestres de Anápolis e Região",
    autor_nome: str = "Venerável Mestre"
) -> str:
    """
    Gera um documento PDF oficial de Prancha de Prévia maçônica.
    """
    os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
    doc = SimpleDocTemplate(
        caminho_saida,
        pagesize=letter,
        rightMargin=45,
        leftMargin=45,
        topMargin=45,
        bottomMargin=45
    )

    styles = getSampleStyleSheet()
    
    style_agadu = ParagraphStyle(
        name="AGADU",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        alignment=1, # Center
        textColor=colors.HexColor("#333333")
    )
    
    style_conselho = ParagraphStyle(
        name="ConselhoNome",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        alignment=1,
        textColor=colors.HexColor("#666666")
    )

    style_titulo = ParagraphStyle(
        name="TituloPrancha",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        alignment=1,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=10
    )

    style_corpo = ParagraphStyle(
        name="CorpoPrancha",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#1e293b")
    )

    style_label = ParagraphStyle(
        name="LabelTabela",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569")
    )

    style_valor = ParagraphStyle(
        name="ValorTabela",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # Cabeçalho
    story.append(Paragraph("A.'. G.'. D.'. G.'. A.'. D.'. U.'.", style_agadu))
    story.append(Spacer(1, 4))
    story.append(Paragraph(conselho_nome.upper(), style_conselho))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#d97706"), spaceAfter=14))

    # Título do Documento
    tipo_formatado = tipo.upper().replace("_", " ")
    titulo_texto = f"PRANCHA DE PRÉVIA DE {tipo_formatado}"
    story.append(Paragraph(titulo_texto, style_titulo))
    story.append(Spacer(1, 8))

    # Tabela com Metadados
    data_lim_str = data_limite.strftime("%d/%m/%Y") if data_limite else "30 dias da publicação"
    data_post_str = data_postagem.strftime("%d/%m/%Y") if hasattr(data_postagem, "strftime") else str(data_postagem)

    dados_tabela = [
        [
            Paragraph("Loja Proponente:", style_label),
            Paragraph(f"ARLS {loja_nome}, nº {loja_numero}", style_valor)
        ],
        [
            Paragraph("Candidato Proposto:", style_label),
            Paragraph(f"<b>{candidato_nome.upper()}</b>", style_valor)
        ],
        [
            Paragraph("Natureza do Processo:", style_label),
            Paragraph(f"Proposta de {tipo.capitalize()}", style_valor)
        ],
        [
            Paragraph("Data de Fixação no Mural:", style_label),
            Paragraph(data_post_str, style_valor)
        ],
        [
            Paragraph("Prazo para Considerações:", style_label),
            Paragraph(data_lim_str, style_valor)
        ],
    ]

    tabela = Table(dados_tabela, colWidths=[2.2 * inch, 4.8 * inch])
    tabela.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(tabela)
    story.append(Spacer(1, 16))

    # Texto Oficial
    texto_declaracao = f"""
    A <b>ARLS {loja_nome}, nº {loja_numero}</b>, no uso de suas atribuições e em estrita observância 
    aos preceitos e regulamentos maçônicos vigentes, submete à apreciação deste Ilustre Conselho 
    Regional de Veneráveis Mestres a presente Prancha de Prévia para o processo de <b>{tipo.capitalize()}</b> 
    do profano/irmão <b>{candidato_nome}</b>.<br/><br/>
    Convidam-se todos os Respeitáveis Veneráveis Mestres das Lojas Jurisdicionadas a apresentarem 
    suas considerações, sindicâncias ou apontamentos no prazo regulamentar através do Mural de 
    Admissão do sistema CoReVM.
    """
    story.append(Paragraph(texto_declaracao, style_corpo))
    story.append(Spacer(1, 35))

    # Assinatura simbólica
    dados_assinatura = [
        [
            Paragraph("________________________________________<br/><b>Venerável Mestre</b><br/>ARLS " + loja_nome, ParagraphStyle('Assinatura1', parent=style_conselho, alignment=1)),
            Paragraph("________________________________________<br/><b>Secretário</b><br/>ARLS " + loja_nome, ParagraphStyle('Assinatura2', parent=style_conselho, alignment=1))
        ]
    ]
    tabela_ass = Table(dados_assinatura, colWidths=[3.5 * inch, 3.5 * inch])
    tabela_ass.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(tabela_ass)
    story.append(Spacer(1, 40))

    # Rodapé de Confidencialidade
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#e2e8f0"), spaceAfter=8))
    aviso_seguranca = "DOCUMENTO CONFIDENCIAL - CIRCULAÇÃO RESTRITA AO CONSELHO REGIONAL DE VENERÁVEIS MESTRES"
    story.append(Paragraph(aviso_seguranca, ParagraphStyle('Footer', parent=style_conselho, fontSize=7, textColor=colors.HexColor("#94a3b8"))))

    doc.build(story)
    return caminho_saida


def gerar_pdf_documento_regional(
    caminho_saida: str,
    codigo_documento: str,
    titulo: str,
    categoria: str,
    descricao_ementa: str,
    conteudo_texto: str,
    data_documento: date,
    autor_nome: str = "Venerável Mestre",
    autor_cargo: str = "Secretário Regional",
    tipo_origem: str = "CONSELHO",
    loja_emissora_nome: str = None,
    conselho_nome: str = "Conselho Regional de Veneráveis Mestres de Anápolis e Região"
) -> str:
    """
    Gera um PDF oficial de Ata, Decreto, Regulamento, Circular ou Convite Maçônico.
    """
    os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
    doc = SimpleDocTemplate(
        caminho_saida,
        pagesize=letter,
        rightMargin=45,
        leftMargin=45,
        topMargin=45,
        bottomMargin=45
    )

    styles = getSampleStyleSheet()

    style_agadu = ParagraphStyle(
        name="DocAGADU",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        alignment=1,
        textColor=colors.HexColor("#262626")
    )

    style_conselho = ParagraphStyle(
        name="DocConselho",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        alignment=1,
        textColor=colors.HexColor("#1e293b")
    )

    style_sub = ParagraphStyle(
        name="DocSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        alignment=1,
        textColor=colors.HexColor("#64748b")
    )

    style_titulo = ParagraphStyle(
        name="DocTitulo",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=19,
        alignment=1,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6
    )

    style_codigo = ParagraphStyle(
        name="DocCodigo",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        alignment=1,
        textColor=colors.HexColor("#b45309")
    )

    style_ementa = ParagraphStyle(
        name="DocEmenta",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#334155"),
        leftIndent=30,
        rightIndent=30,
        spaceAfter=12
    )

    style_corpo = ParagraphStyle(
        name="DocCorpo",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        alignment=4, # Justified
        spaceAfter=10
    )

    story = []

    # 1. Cabeçalho Canônico
    story.append(Paragraph("A.'. G.'. D.'. G.'. A.'. D.'. U.'.", style_agadu))
    story.append(Spacer(1, 4))
    
    cabecalho_entidade = conselho_nome
    if tipo_origem == "LOJA" and loja_emissora_nome:
        cabecalho_entidade = f"{loja_emissora_nome} &bull; {conselho_nome}"
    
    story.append(Paragraph(cabecalho_entidade.upper(), style_conselho))
    story.append(Paragraph("REPOSITÓRIO DOCUMENTAL OFICIAL &bull; ORIENTE DE ANÁPOLIS - GOIÁS", style_sub))
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#facc15"), spaceAfter=14))

    # 2. Identificação do Documento
    categoria_label = {
        "ATA": "ATA DE SESSÃO / REUNIÃO",
        "DECRETO": "DECRETO REGIONAL",
        "REGULAMENTO": "REGULAMENTO / REGIMENTO",
        "CIRCULAR": "PRANCHA CIRCULAR OFICIAL",
        "CONVITE": "PRANCHA CONVITE DE LOJA",
        "MODELO": "MODELO OFICIAL PADRONIZADO"
    }.get(categoria.upper(), categoria.upper())

    story.append(Paragraph(f"{categoria_label} &bull; {codigo_documento}", style_codigo))
    story.append(Spacer(1, 4))
    story.append(Paragraph(titulo, style_titulo))
    story.append(Spacer(1, 10))

    # 3. Data e Ementa
    data_formatada = data_documento.strftime("%d de %B de %Y") if hasattr(data_documento, "strftime") else str(data_documento)
    story.append(Paragraph(f"<b>Data Oficial:</b> {data_formatada}", ParagraphStyle('DataDoc', parent=styles['Normal'], fontSize=9.5, alignment=1, textColor=colors.HexColor("#475569"))))
    story.append(Spacer(1, 10))

    if descricao_ementa:
        story.append(Paragraph(f"<b>Ementa:</b> {descricao_ementa}", style_ementa))
        story.append(HRFlowable(width="80%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=14, spaceBefore=4))

    # 4. Corpo do Documento
    if conteudo_texto:
        paragrafos = conteudo_texto.split("\n\n") if "\n\n" in conteudo_texto else conteudo_texto.split("\n")
        for p in paragrafos:
            p_limpo = p.strip().replace("\n", "<br/>")
            if p_limpo:
                story.append(Paragraph(p_limpo, style_corpo))
    else:
        story.append(Paragraph("O presente documento encontra-se devidamente registrado e arquivado no repositório digital do Conselho Regional de Veneráveis Mestres para todos os efeitos canônicos e administrativos.", style_corpo))

    story.append(Spacer(1, 35))

    # 5. Fecho de Assinaturas
    assinaturas = [
        [
            Paragraph("________________________________________<br/><b>Presidente do Conselho</b><br/>" + conselho_nome, ParagraphStyle('Ass1', parent=style_sub, alignment=1)),
            Paragraph(f"________________________________________<br/><b>{autor_cargo}</b><br/>{autor_nome}", ParagraphStyle('Ass2', parent=style_sub, alignment=1))
        ]
    ]
    tabela_ass = Table(assinaturas, colWidths=[3.5 * inch, 3.5 * inch])
    tabela_ass.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(tabela_ass)
    story.append(Spacer(1, 30))

    # 6. Rodapé de Autenticidade
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#e2e8f0"), spaceAfter=6))
    rodape_seguranca = f"DOCUMENTO OFICIAL REGISTRADO NO REPOSITÓRIO DIGITAL CoReVM &bull; CÓDIGO: {codigo_documento}"
    story.append(Paragraph(rodape_seguranca, ParagraphStyle('DocFooter', parent=style_sub, fontSize=7.5, textColor=colors.HexColor("#94a3b8"))))

    doc.build(story)
    return caminho_saida


def gerar_pdf_relatorio_executivo(
    caminho_saida: str,
    conselho_nome: str,
    stats: dict,
    ranking_lojas: list
) -> str:
    """
    Gera relatório executivo geral consolidado com indicadores e ranking de assiduidade.
    """
    os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
    doc = SimpleDocTemplate(
        caminho_saida,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()
    style_center = ParagraphStyle('Center', parent=styles['Normal'], alignment=1, fontSize=10, textColor=colors.HexColor("#333"))
    style_title = ParagraphStyle('Title', parent=styles['Heading1'], alignment=1, fontName="Helvetica-Bold", fontSize=14, textColor=colors.HexColor("#0f172a"), spaceAfter=10)
    style_h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName="Helvetica-Bold", fontSize=11, textColor=colors.HexColor("#b45309"), spaceBefore=12, spaceAfter=6)
    style_cell = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=8.5, leading=11, textColor=colors.HexColor("#1e293b"))
    style_cell_bold = ParagraphStyle('CellB', parent=styles['Normal'], fontName="Helvetica-Bold", fontSize=8.5, leading=11, textColor=colors.HexColor("#0f172a"))
    style_cell_header = ParagraphStyle('CellH', parent=styles['Normal'], fontName="Helvetica-Bold", fontSize=8.5, textColor=colors.HexColor("#ffffff"), alignment=1)

    story = []

    # Cabeçalho
    story.append(Paragraph("A.'. G.'. D.'. G.'. A.'. D.'. U.'.", style_center))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>{conselho_nome.upper()}</b>", style_center))
    story.append(Paragraph("RELATÓRIO EXECUTIVO DE GESTÃO E GOVERNANÇA REGIONAL", style_title))
    story.append(Paragraph(f"Posição consolidada em {date.today().strftime('%d/%m/%Y')}", style_center))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#facc15"), spaceAfter=14))

    # 1. Tabela de Indicadores Globais
    story.append(Paragraph("1. INDICADORES CONSOLIDADOS DE GOVERNANÇA", style_h2))
    
    dados_kpis = [
        [
            Paragraph("<b>Total de Lojas Jurisdicionadas:</b>", style_cell), Paragraph(str(stats.get('total_lojas', 17)), style_cell_bold),
            Paragraph("<b>Taxa Média de Quórum:</b>", style_cell), Paragraph(f"{stats.get('quorum_medio', 0)}%", style_cell_bold)
        ],
        [
            Paragraph("<b>Votações / Deliberações:</b>", style_cell), Paragraph(str(stats.get('total_votacoes', 0)), style_cell_bold),
            Paragraph("<b>Processos no Mural de Admissão:</b>", style_cell), Paragraph(str(stats.get('total_admissoes', 0)), style_cell_bold)
        ],
        [
            Paragraph("<b>Ativos no Acervo Patrimonial:</b>", style_cell), Paragraph(str(stats.get('total_ativos_patrimonio', 0)), style_cell_bold),
            Paragraph("<b>Auxílios de Hospitalaria / Cautelas:</b>", style_cell), Paragraph(str(stats.get('total_cautelas', 0)), style_cell_bold)
        ],
        [
            Paragraph("<b>Documentos Oficiais Arquivados:</b>", style_cell), Paragraph(str(stats.get('total_documentos', 0)), style_cell_bold),
            Paragraph("<b>Downloads de Atas e Decretos:</b>", style_cell), Paragraph(str(stats.get('total_downloads', 0)), style_cell_bold)
        ]
    ]
    tabela_kpis = Table(dados_kpis, colWidths=[2.2 * inch, 1.3 * inch, 2.2 * inch, 1.3 * inch])
    tabela_kpis.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(tabela_kpis)
    story.append(Spacer(1, 14))

    # 2. Ranking de Assiduidade das Lojas
    story.append(Paragraph("2. AUDITORIA DE PARTICIPAÇÃO E ASSIDUIDADE DAS LOJAS", style_h2))
    
    tabela_ranking_dados = [[
        Paragraph("Pos.", style_cell_header),
        Paragraph("Loja Jurisdicionada", style_cell_header),
        Paragraph("Votos Reg.", style_cell_header),
        Paragraph("Assiduidade", style_cell_header),
        Paragraph("Status", style_cell_header)
    ]]

    for idx, l in enumerate(ranking_lojas[:15], 1):
        tabela_ranking_dados.append([
            Paragraph(f"{idx}º", style_cell_bold),
            Paragraph(f"{l.get('nome')} (Nº {l.get('numero')})", style_cell),
            Paragraph(str(l.get('votos_computados', 0)), style_cell),
            Paragraph(f"{l.get('percentual_participacao', 0)}%", style_cell_bold),
            Paragraph(l.get('status_label', 'Regular'), style_cell)
        ])

    tabela_rk = Table(tabela_ranking_dados, colWidths=[0.6 * inch, 3.2 * inch, 1.1 * inch, 1.1 * inch, 1.0 * inch])
    tabela_rk.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")])
    ]))
    story.append(tabela_rk)
    story.append(Spacer(1, 25))

    # Fecho de Assinaturas
    story.append(Paragraph("____________________________________________<br/><b>Presidente do Conselho Regional</b>", style_center))
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#e2e8f0"), spaceAfter=6))
    story.append(Paragraph("DOCUMENTO DE AUDITORIA E GOVERNANÇA GERADO PELO SISTEMA CoReVM", ParagraphStyle('F', parent=style_center, fontSize=7, textColor=colors.HexColor("#94a3b8"))))

    doc.build(story)
    return caminho_saida


def gerar_pdf_relatorio_integrantes(
    caminho_saida: str,
    conselho_nome: str,
    diretoria: list,
    lojas_vms: list
) -> str:
    """
    Gera documento oficial com a composição da Mesa Diretora e o Quadro de Veneráveis Mestres.
    """
    os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
    doc = SimpleDocTemplate(
        caminho_saida,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()
    style_center = ParagraphStyle('Center', parent=styles['Normal'], alignment=1, fontSize=10, textColor=colors.HexColor("#333"))
    style_title = ParagraphStyle('Title', parent=styles['Heading1'], alignment=1, fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#0f172a"), spaceAfter=8)
    style_h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.HexColor("#b45309"), spaceBefore=10, spaceAfter=5)
    style_cell = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=8, leading=10, textColor=colors.HexColor("#1e293b"))
    style_cell_bold = ParagraphStyle('CellB', parent=styles['Normal'], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.HexColor("#0f172a"))
    style_cell_header = ParagraphStyle('CellH', parent=styles['Normal'], fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#ffffff"), alignment=1)

    story = []

    story.append(Paragraph("A.'. G.'. D.'. G.'. A.'. D.'. U.'.", style_center))
    story.append(Paragraph(f"<b>{conselho_nome.upper()}</b>", style_center))
    story.append(Paragraph("LIVRO DE MATRÍCULA E COMPOSIÇÃO OFICIAL DO COLEGIADO", style_title))
    story.append(Paragraph(f"Quadro de Membros em Exercício &bull; Atualizado em {date.today().strftime('%d/%m/%Y')}", style_center))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#facc15"), spaceAfter=12))

    # 1. Mesa Diretora
    story.append(Paragraph("1. MESA DIRETORA EXECUTIVA EM EXERCÍCIO", style_h2))
    dados_dir = [[
        Paragraph("Cargo Regional", style_cell_header),
        Paragraph("Membro / Titular", style_cell_header),
        Paragraph("Identificação / CIM", style_cell_header),
        Paragraph("Vigência do Mandato", style_cell_header)
    ]]
    for d in diretoria:
        dados_dir.append([
            Paragraph(f"<b>{d.get('cargo')}</b>", style_cell_bold),
            Paragraph(d.get('nome', 'Ir.'.format()), style_cell),
            Paragraph(d.get('usuario_id', '-'), style_cell),
            Paragraph(f"{d.get('inicio_mandato', '-')} a {d.get('termino_mandato', '-')}", style_cell)
        ])
    tabela_dir = Table(dados_dir, colWidths=[1.8 * inch, 2.5 * inch, 1.4 * inch, 1.3 * inch])
    tabela_dir.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")])
    ]))
    story.append(tabela_dir)
    story.append(Spacer(1, 12))

    # 2. Lojas e Veneráveis Mestres
    story.append(Paragraph("2. QUADRO DE VENERÁVEIS MESTRES E REPRESENTANTES DAS LOJAS", style_h2))
    dados_lojas = [[
        Paragraph("Loja Jurisdicionada", style_cell_header),
        Paragraph("Rito", style_cell_header),
        Paragraph("Venerável Mestre", style_cell_header),
        Paragraph("1º Vigilante (Suplente)", style_cell_header)
    ]]
    for l in lojas_vms:
        dados_lojas.append([
            Paragraph(f"<b>{l.get('nome')}</b> (Nº {l.get('numero')})", style_cell_bold),
            Paragraph(l.get('rito', 'REAA'), style_cell),
            Paragraph(l.get('vm_nome', 'Não designado'), style_cell),
            Paragraph(l.get('suplente_nome', 'Não designado'), style_cell)
        ])
    tabela_lojas = Table(dados_lojas, colWidths=[2.5 * inch, 1.1 * inch, 1.8 * inch, 1.6 * inch])
    tabela_lojas.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")])
    ]))
    story.append(tabela_lojas)
    story.append(Spacer(1, 20))

    # Fecho
    story.append(Paragraph("____________________________________________<br/><b>Secretaria do Conselho Regional</b>", style_center))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#e2e8f0"), spaceAfter=5))
    story.append(Paragraph("DOCUMENTO OFICIAL PARA FINS DE PROTOCOLO E CREDENCIAMENTO MAÇÔNICO", ParagraphStyle('F', parent=style_center, fontSize=7, textColor=colors.HexColor("#94a3b8"))))

    doc.build(story)
    return caminho_saida


def gerar_pdf_relatorio_patrimonio(
    caminho_saida: str,
    conselho_nome: str,
    itens_patrimonio: list,
    emprestimos_ativos: list
) -> str:
    """
    Gera balanço patrimonial e relação de termos de cautela / comodato.
    """
    os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
    doc = SimpleDocTemplate(
        caminho_saida,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()
    style_center = ParagraphStyle('Center', parent=styles['Normal'], alignment=1, fontSize=10, textColor=colors.HexColor("#333"))
    style_title = ParagraphStyle('Title', parent=styles['Heading1'], alignment=1, fontName="Helvetica-Bold", fontSize=13, textColor=colors.HexColor("#0f172a"), spaceAfter=8)
    style_h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.HexColor("#b45309"), spaceBefore=10, spaceAfter=5)
    style_cell = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=8, leading=10, textColor=colors.HexColor("#1e293b"))
    style_cell_bold = ParagraphStyle('CellB', parent=styles['Normal'], fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.HexColor("#0f172a"))
    style_cell_header = ParagraphStyle('CellH', parent=styles['Normal'], fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#ffffff"), alignment=1)

    story = []

    story.append(Paragraph("A.'. G.'. D.'. G.'. A.'. D.'. U.'.", style_center))
    story.append(Paragraph(f"<b>{conselho_nome.upper()}</b>", style_center))
    story.append(Paragraph("BALANÇO PATRIMONIAL FÍSICO E COMODATOS DE HOSPITALARIA", style_title))
    story.append(Paragraph(f"Inventário de Bens Tombados e Termos de Cautela em {date.today().strftime('%d/%m/%Y')}", style_center))
    story.append(Spacer(1, 8))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#facc15"), spaceAfter=12))

    # 1. Bens Tombados
    story.append(Paragraph("1. INVENTÁRIO DE BENS TOMBADOS DO ACERVO", style_h2))
    dados_bens = [[
        Paragraph("Plaqueta", style_cell_header),
        Paragraph("Descrição do Bem", style_cell_header),
        Paragraph("Categoria", style_cell_header),
        Paragraph("Origem", style_cell_header),
        Paragraph("Quant.", style_cell_header),
        Paragraph("Estado", style_cell_header)
    ]]
    for item in itens_patrimonio:
        dados_bens.append([
            Paragraph(f"<b>{item.get('codigo_tombamento')}</b>", style_cell_bold),
            Paragraph(item.get('nome'), style_cell),
            Paragraph(item.get('categoria'), style_cell),
            Paragraph("Loja Solidária" if item.get('tipo_propriedade') == 'LOJA' else "Conselho", style_cell),
            Paragraph(f"{item.get('quantidade_disponivel')}/{item.get('quantidade_total')}", style_cell),
            Paragraph(item.get('estado_conservacao'), style_cell)
        ])
    tabela_bens = Table(dados_bens, colWidths=[1.3 * inch, 2.7 * inch, 0.9 * inch, 0.9 * inch, 0.6 * inch, 0.6 * inch])
    tabela_bens.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")])
    ]))
    story.append(tabela_bens)
    story.append(Spacer(1, 12))

    # 2. Termos de Cautela Ativos
    story.append(Paragraph("2. TERMOS DE CAUTELA E EMPRÉSTIMOS EM ANDAMENTO", style_h2))
    dados_emp = [[
        Paragraph("Item Emprestado", style_cell_header),
        Paragraph("Loja Solicitante", style_cell_header),
        Paragraph("Responsável / Contato", style_cell_header),
        Paragraph("Retirada", style_cell_header),
        Paragraph("Devolução Prev.", style_cell_header),
        Paragraph("Status", style_cell_header)
    ]]
    for emp in emprestimos_ativos:
        dados_emp.append([
            Paragraph(f"<b>{emp.get('item_nome')}</b>", style_cell_bold),
            Paragraph(emp.get('loja_solicitante_nome'), style_cell),
            Paragraph(f"{emp.get('responsavel_retirada_nome')} ({emp.get('responsavel_retirada_contato') or ''})", style_cell),
            Paragraph(emp.get('data_retirada'), style_cell),
            Paragraph(emp.get('data_prevista_devolucao'), style_cell_bold if not emp.get('atrasado') else style_cell),
            Paragraph("ATRASADO" if emp.get('atrasado') else emp.get('status'), style_cell_bold if emp.get('atrasado') else style_cell)
        ])
    tabela_emp = Table(dados_emp, colWidths=[1.8 * inch, 1.6 * inch, 1.6 * inch, 0.7 * inch, 0.7 * inch, 0.6 * inch])
    tabela_emp.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 3.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")])
    ]))
    story.append(tabela_emp)
    story.append(Spacer(1, 20))

    # Fecho
    story.append(Paragraph("____________________________________________<br/><b>Hospitaleiro Regional / Comissão de Patrimônio</b>", style_center))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#e2e8f0"), spaceAfter=5))
    story.append(Paragraph("BALANÇO PATRIMONIAL FÍSICO DO CONSELHO REGIONAL DE VENERÁVEIS MESTRES", ParagraphStyle('F', parent=style_center, fontSize=7, textColor=colors.HexColor("#94a3b8"))))

    doc.build(story)
    return caminho_saida


