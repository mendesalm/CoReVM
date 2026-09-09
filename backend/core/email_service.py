# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from loguru import logger
import os

# Configuração SMTP Hostinger (e-sigma.app)
SMTP_SERVER = os.getenv('SMTP_SERVER', 'smtp.hostinger.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', 465))
SMTP_USER = os.getenv('SMTP_USER', 'contato@e-sigma.app')
SMTP_PASS = os.getenv('SMTP_PASS', "P0d@f)rnMW6rjXC'")
SMTP_FROM_NAME = os.getenv('SMTP_FROM_NAME', 'E-Sigma CoReVM')

# Template HTML base para emails do CoReVM
TEMPLATE_BASE = """
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background-color:#0a0a0a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a; padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#1a1a1a; border-radius:16px; border:1px solid #333; overflow:hidden;">
        <!-- Header -->
        <tr><td style="background: linear-gradient(135deg, #854d0e, #facc15); padding:24px 32px; text-align:center;">
          <h1 style="margin:0; color:#000; font-size:22px; font-weight:800; letter-spacing:1px;">E-Sigma: CoReVM</h1>
          <p style="margin:4px 0 0; color:#1a1a1a; font-size:12px;">Conselho Regional de Veneraveis Mestres</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          {CONTEUDO}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px; border-top:1px solid #333; text-align:center;">
          <p style="margin:0; color:#666; font-size:11px;">
            Este e um e-mail automatico do sistema E-Sigma CoReVM.<br>
            Em caso de duvidas, entre em contato com a Secretaria do seu Conselho Regional.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _enviar(destinatario: str, assunto: str, corpo_html: str) -> bool:
    """Envia um email via SMTP SSL (porta 465) da Hostinger."""
    if not SMTP_PASS:
        logger.warning(f'[EMAIL] SMTP_PASS nao configurado. Simulando envio para {destinatario}')
        logger.info(f'[EMAIL SIMULADO] Para: {destinatario} | Assunto: {assunto}')
        return True

    msg = MIMEMultipart('alternative')
    msg['From'] = f'{SMTP_FROM_NAME} <{SMTP_USER}>'
    msg['To'] = destinatario
    msg['Subject'] = assunto
    msg.attach(MIMEText(corpo_html, 'html', 'utf-8'))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, destinatario, msg.as_string())
        logger.info(f'[EMAIL] Enviado com sucesso para {destinatario} | Assunto: {assunto}')
        return True
    except Exception as e:
        logger.error(f'[EMAIL] Falha ao enviar para {destinatario}: {e}')
        return False


def enviar_email_credenciais(destinatario: str, nome: str, cim: str, senha_aleatoria: str) -> bool:
    """Envia email de boas-vindas com as credenciais de acesso ao CoReVM."""
    conteudo = f"""
    <h2 style="color:#facc15; margin:0 0 16px;">Saudacoes Fraternais, Ir:. {nome}!</h2>
    <p style="color:#ccc; font-size:14px; line-height:1.6;">
      Seu cadastro no sistema <strong style="color:#facc15;">E-Sigma CoReVM</strong> foi realizado com sucesso.
      Seguem suas credenciais de acesso:
    </p>
    <table style="width:100%; margin:20px 0; border-collapse:collapse;">
      <tr>
        <td style="padding:12px 16px; background:#222; border-radius:8px 8px 0 0; border-bottom:1px solid #333;">
          <span style="color:#888; font-size:12px;">CIM (Login)</span><br>
          <span style="color:#fff; font-size:18px; font-weight:bold; letter-spacing:2px;">{cim}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px; background:#222; border-radius:0 0 8px 8px;">
          <span style="color:#888; font-size:12px;">Senha Temporaria</span><br>
          <span style="color:#facc15; font-size:18px; font-weight:bold; font-family:monospace;">{senha_aleatoria}</span>
        </td>
      </tr>
    </table>
    <p style="color:#f87171; font-size:13px; margin-top:16px;">
      <strong>Recomendamos que altere sua senha no primeiro acesso.</strong>
    </p>
    <p style="color:#888; font-size:13px;">
      Acesse o sistema em: <a href="https://core.e-sigma.app" style="color:#facc15;">core.e-sigma.app</a>
    </p>
    """
    html = TEMPLATE_BASE.replace('{CONTEUDO}', conteudo)
    return _enviar(destinatario, 'Bem-vindo ao CoReVM - Suas Credenciais de Acesso', html)


def enviar_email_notificacao(destinatario: str, nome: str, titulo: str, mensagem: str) -> bool:
    """Envia email de notificacao generica do Conselho Regional."""
    conteudo = f"""
    <h2 style="color:#facc15; margin:0 0 16px;">{titulo}</h2>
    <p style="color:#ccc; font-size:14px; line-height:1.6;">
      Ir:. {nome},
    </p>
    <div style="background:#222; border-radius:8px; padding:16px 20px; margin:16px 0; border-left:4px solid #facc15;">
      <p style="color:#ddd; font-size:14px; line-height:1.6; margin:0;">{mensagem}</p>
    </div>
    <p style="color:#888; font-size:13px;">
      Acesse o painel do Conselho para mais detalhes: <a href="https://core.e-sigma.app" style="color:#facc15;">core.e-sigma.app</a>
    </p>
    """
    html = TEMPLATE_BASE.replace('{CONTEUDO}', conteudo)
    return _enviar(destinatario, f'CoReVM - {titulo}', html)


def enviar_email_teste(destinatario: str) -> dict:
    """Envia email de teste para verificar se o SMTP esta operacional."""
    conteudo = """
    <h2 style="color:#facc15; margin:0 0 16px;">Teste de Envio SMTP</h2>
    <p style="color:#ccc; font-size:14px; line-height:1.6;">
      Este e um e-mail de teste do sistema <strong style="color:#facc15;">E-Sigma CoReVM</strong>.
    </p>
    <div style="background:#222; border-radius:8px; padding:16px 20px; margin:16px 0; border-left:4px solid #22c55e;">
      <p style="color:#22c55e; font-size:14px; margin:0;">
        Conexao SMTP estabelecida com sucesso<br>
        Autenticacao realizada<br>
        E-mail entregue ao servidor de destino
      </p>
    </div>
    <p style="color:#888; font-size:12px;">
      Servidor: {server}:{port} | Remetente: {user}
    </p>
    """.format(server=SMTP_SERVER, port=SMTP_PORT, user=SMTP_USER)
    html = TEMPLATE_BASE.replace('{CONTEUDO}', conteudo)

    sucesso = _enviar(destinatario, 'CoReVM - Teste de Envio SMTP', html)
    return {
        "sucesso": sucesso,
        "servidor": SMTP_SERVER,
        "porta": SMTP_PORT,
        "remetente": SMTP_USER,
        "destinatario": destinatario
    }
