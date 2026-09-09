# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
from fastapi import APIRouter, Query
from pydantic import BaseModel
from typing import Optional
from core.email_service import enviar_email_teste, enviar_email_credenciais, enviar_email_notificacao

router = APIRouter()


class TesteEmailPayload(BaseModel):
    destinatario: str
    tipo: str = "teste"  # "teste", "credenciais", "notificacao"
    # Campos opcionais para tipo "credenciais"
    nome: Optional[str] = "Obreiro de Teste"
    cim: Optional[str] = "0000000"
    senha: Optional[str] = "SenhaTemp123"
    # Campos opcionais para tipo "notificacao"
    titulo: Optional[str] = "Notificacao de Teste"
    mensagem: Optional[str] = "Esta e uma mensagem de teste do sistema CoReVM."


@router.post("/teste", summary="Envia email de teste", description="Dispara um email de teste para verificar o SMTP.")
def rota_teste_email(payload: TesteEmailPayload):
    """
    Envia um email de teste para o destinatario informado.
    Tipos disponiveis:
    - teste: Email simples de verificacao SMTP
    - credenciais: Simula envio de credenciais de acesso
    - notificacao: Simula envio de notificacao do conselho
    """
    if payload.tipo == "credenciais":
        sucesso = enviar_email_credenciais(
            destinatario=payload.destinatario,
            nome=payload.nome,
            cim=payload.cim,
            senha_aleatoria=payload.senha
        )
        return {"sucesso": sucesso, "tipo": "credenciais", "destinatario": payload.destinatario}
    
    elif payload.tipo == "notificacao":
        sucesso = enviar_email_notificacao(
            destinatario=payload.destinatario,
            nome=payload.nome,
            titulo=payload.titulo,
            mensagem=payload.mensagem
        )
        return {"sucesso": sucesso, "tipo": "notificacao", "destinatario": payload.destinatario}
    
    else:
        resultado = enviar_email_teste(payload.destinatario)
        return resultado


@router.get("/status", summary="Verifica configuracao SMTP", description="Retorna o status da configuracao SMTP sem enviar email.")
def rota_status_smtp():
    from core.email_service import SMTP_SERVER, SMTP_PORT, SMTP_USER, SMTP_PASS
    return {
        "servidor": SMTP_SERVER,
        "porta": SMTP_PORT,
        "remetente": SMTP_USER,
        "senha_configurada": bool(SMTP_PASS),
        "status": "configurado" if SMTP_PASS else "sem_senha"
    }
