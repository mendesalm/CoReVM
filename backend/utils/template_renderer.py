# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Motor de renderização de templates de relatórios.
Usa Jinja2 para interpolação de variáveis e WeasyPrint para geração de PDF.
"""
import os
import json
import tempfile
from datetime import date, datetime
from typing import Optional
from jinja2 import Environment, BaseLoader, select_autoescape
from loguru import logger

# CSS base injetado em todo relatório (pode ser sobrescrito no template)
CSS_BASE = """
@page {
    margin: 2.5cm 2cm;
    @bottom-center {
        content: "Página " counter(page) " de " counter(pages);
        font-size: 9pt;
        color: #888;
    }
}
body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #1a1a1a;
    line-height: 1.5;
}
h1, h2, h3 { font-family: 'Georgia', serif; }
table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
th { background: #f5f0e8; border: 1px solid #ccc; padding: 6pt; text-align: left; font-weight: bold; }
td { border: 1px solid #ddd; padding: 5pt; }
tr:nth-child(even) { background: #fafafa; }
.cabecalho { text-align: center; margin-bottom: 24pt; border-bottom: 2px solid #8b6914; padding-bottom: 12pt; }
.cabecalho h1 { font-size: 14pt; margin: 4pt 0; color: #5c4a00; }
.cabecalho p { font-size: 9pt; color: #666; margin: 2pt 0; }
.rodape { text-align: center; margin-top: 32pt; padding-top: 12pt; border-top: 1px solid #ccc; font-size: 9pt; color: #888; }
.assinatura { margin-top: 48pt; }
.linha-assinatura { border-top: 1px solid #333; width: 250pt; margin: 0 auto; padding-top: 4pt; text-align: center; font-size: 10pt; }
"""

# Variáveis disponíveis por tipo de template (usadas no editor do superadmin)
VARIAVEIS_POR_TIPO = {
    "prancha": {
        "conselho_nome": "Nome do Conselho Regional",
        "numero_prancha": "Número da prancha (ex: 01/2025)",
        "data_emissao": "Data de emissão (ex: 09 de setembro de 2025)",
        "autor_nome": "Nome do autor",
        "autor_cargo": "Cargo do autor (ex: Presidente Regional)",
        "assunto": "Assunto da prancha",
        "corpo": "Conteúdo completo da prancha",
    },
    "relatorio_lojas": {
        "conselho_nome": "Nome do Conselho Regional",
        "data_relatorio": "Data do relatório",
        "lojas": "Lista de lojas (loja.numero, loja.nome, loja.rito, loja.vm_nome)",
        "total_lojas": "Total de lojas na região",
    },
    "patrimonio": {
        "conselho_nome": "Nome do Conselho Regional",
        "data_relatorio": "Data do relatório",
        "itens_patrimonio": "Lista de itens (item.descricao, item.tipo, item.responsavel, item.status, item.valor)",
        "total_itens": "Total de itens no patrimônio",
    },
    "integrantes": {
        "conselho_nome": "Nome do Conselho Regional",
        "data_relatorio": "Data do relatório",
        "diretoria": "Membros da diretoria (membro.nome, membro.cargo, membro.loja)",
        "lojas": "Lista de lojas com VMs (loja.nome, loja.numero, loja.vm_nome)",
    },
    "livre": {
        "conselho_nome": "Nome do Conselho Regional",
        "data_relatorio": "Data do relatório",
        "usuario_nome": "Nome do usuário que gerou o relatório",
    },
}

# Templates padrão (biblioteca base incluída no sistema)
TEMPLATES_PADRAO = [
    {
        "nome": "Prancha Circular — Padrão CoReVM",
        "tipo": "prancha",
        "descricao": "Template oficial para pranchas e comunicações circulares do Conselho Regional.",
        "conteudo_html": """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
{{ css_base }}
.numero-prancha { font-size: 10pt; color: #666; text-align: right; margin-bottom: 8pt; }
.assunto-box { background: #f9f5e8; border-left: 4px solid #8b6914; padding: 8pt 12pt; margin: 16pt 0; }
.corpo { text-align: justify; margin-top: 16pt; }
</style>
</head>
<body>
  <div class="cabecalho">
    <h1>{{ conselho_nome }}</h1>
    <p>Conselho Regional de Veneráveis Mestres</p>
  </div>

  <div class="numero-prancha">Prancha Circular nº {{ numero_prancha }}</div>

  <div class="assunto-box">
    <strong>Assunto:</strong> {{ assunto }}
  </div>

  <p>Ir∴ Veneráveis Mestres e demais Obreiros,</p>

  <div class="corpo">
    {{ corpo }}
  </div>

  <div class="rodape">
    <p>{{ data_emissao }}</p>
  </div>

  <div class="assinatura">
    <div class="linha-assinatura">
      {{ autor_nome }}<br>
      <em>{{ autor_cargo }}</em>
    </div>
  </div>
</body>
</html>""",
    },
    {
        "nome": "Relatório de Lojas — Padrão CoReVM",
        "tipo": "relatorio_lojas",
        "descricao": "Relatório com a relação de todas as lojas agregadas ao Conselho Regional.",
        "conteudo_html": """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>{{ css_base }}</style>
</head>
<body>
  <div class="cabecalho">
    <h1>{{ conselho_nome }}</h1>
    <p>Relatório de Lojas Agregadas — {{ data_relatorio }}</p>
  </div>

  <p>Total de lojas: <strong>{{ total_lojas }}</strong></p>

  <table>
    <thead>
      <tr>
        <th>Nº</th>
        <th>Nome da Loja</th>
        <th>Rito</th>
        <th>Venerável Mestre</th>
      </tr>
    </thead>
    <tbody>
      {% for loja in lojas %}
      <tr>
        <td>{{ loja.numero }}</td>
        <td>{{ loja.nome }}</td>
        <td>{{ loja.rito }}</td>
        <td>{{ loja.vm_nome }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <div class="rodape">Gerado em {{ data_relatorio }} — {{ conselho_nome }}</div>
</body>
</html>""",
    },
    {
        "nome": "Relatório de Patrimônio — Padrão CoReVM",
        "tipo": "patrimonio",
        "descricao": "Relatório do acervo patrimonial e rede solidária do Conselho Regional.",
        "conteudo_html": """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>{{ css_base }}</style>
</head>
<body>
  <div class="cabecalho">
    <h1>{{ conselho_nome }}</h1>
    <p>Relatório de Patrimônio — {{ data_relatorio }}</p>
  </div>

  <p>Total de itens: <strong>{{ total_itens }}</strong></p>

  <table>
    <thead>
      <tr>
        <th>Descrição</th>
        <th>Tipo</th>
        <th>Responsável</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {% for item in itens_patrimonio %}
      <tr>
        <td>{{ item.descricao }}</td>
        <td>{{ item.tipo }}</td>
        <td>{{ item.responsavel }}</td>
        <td>{{ item.status }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <div class="rodape">Gerado em {{ data_relatorio }} — {{ conselho_nome }}</div>
</body>
</html>""",
    },
    {
        "nome": "Integrantes do Conselho — Padrão CoReVM",
        "tipo": "integrantes",
        "descricao": "Relação dos integrantes da diretoria e VMs das lojas agregadas.",
        "conteudo_html": """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>{{ css_base }}</style>
</head>
<body>
  <div class="cabecalho">
    <h1>{{ conselho_nome }}</h1>
    <p>Integrantes do Conselho Regional — {{ data_relatorio }}</p>
  </div>

  <h2>Mesa Diretora Regional</h2>
  <table>
    <thead>
      <tr><th>Cargo</th><th>Nome</th><th>Loja</th></tr>
    </thead>
    <tbody>
      {% for m in diretoria %}
      <tr>
        <td>{{ m.cargo }}</td>
        <td>{{ m.nome }}</td>
        <td>{{ m.loja }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <h2>Veneráveis Mestres das Lojas</h2>
  <table>
    <thead>
      <tr><th>Nº</th><th>Nome da Loja</th><th>Venerável Mestre</th></tr>
    </thead>
    <tbody>
      {% for loja in lojas %}
      <tr>
        <td>{{ loja.numero }}</td>
        <td>{{ loja.nome }}</td>
        <td>{{ loja.vm_nome }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <div class="rodape">Gerado em {{ data_relatorio }} — {{ conselho_nome }}</div>
</body>
</html>""",
    },
]


def renderizar_template(conteudo_html: str, variaveis: dict) -> str:
    """Renderiza um template HTML com Jinja2 e retorna HTML final."""
    # Injeta o CSS base como variável disponível no template
    variaveis["css_base"] = CSS_BASE

    env = Environment(
        loader=BaseLoader(),
        autoescape=select_autoescape(["html"]),
        undefined_type="Undefined",
    )
    # Desabilita autoescape para o CSS base (contém caracteres especiais)
    env.autoescape = False

    try:
        tpl = env.from_string(conteudo_html)
        return tpl.render(**variaveis)
    except Exception as e:
        logger.error(f"[TEMPLATE] Erro ao renderizar: {e}")
        raise ValueError(f"Erro ao renderizar template: {e}")


def html_para_pdf(html_content: str, caminho_saida: str) -> str:
    """Converte HTML renderizado em PDF via WeasyPrint."""
    try:
        from weasyprint import HTML, CSS
        os.makedirs(os.path.dirname(caminho_saida), exist_ok=True)
        HTML(string=html_content).write_pdf(caminho_saida)
        logger.info(f"[TEMPLATE] PDF gerado: {caminho_saida}")
        return caminho_saida
    except Exception as e:
        logger.error(f"[TEMPLATE] Erro WeasyPrint: {e}")
        raise


def docx_para_html(caminho_docx: str) -> str:
    """Converte um arquivo .docx em HTML usando mammoth."""
    try:
        import mammoth
        with open(caminho_docx, "rb") as f:
            result = mammoth.convert_to_html(f)
        if result.messages:
            logger.warning(f"[MAMMOTH] Avisos na conversão: {result.messages}")
        return result.value
    except Exception as e:
        logger.error(f"[MAMMOTH] Erro na conversão: {e}")
        raise ValueError(f"Erro ao converter .docx: {e}")


def formatar_data_br(dt) -> str:
    """Formata uma data para o padrão brasileiro por extenso."""
    meses = [
        "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ]
    if isinstance(dt, (date, datetime)):
        return f"{dt.day} de {meses[dt.month]} de {dt.year}"
    return str(dt)


def get_variaveis_por_tipo(tipo: str) -> dict:
    """Retorna as variáveis disponíveis para um tipo de template."""
    return VARIAVEIS_POR_TIPO.get(tipo, VARIAVEIS_POR_TIPO["livre"])


def get_templates_padrao() -> list:
    """Retorna a lista de templates padrão incluídos no sistema."""
    return TEMPLATES_PADRAO
