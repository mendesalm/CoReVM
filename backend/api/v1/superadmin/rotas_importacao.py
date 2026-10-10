# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Rotas SuperAdmin da importação em lote de Conselho Regional via CSV.

Fluxo: GET modelo-csv -> POST validar (upload) -> [POST revalidar a cada
edição no formulário] -> POST confirmar. Identidade SEMPRE validada pelo
e-Sigma (`obter_usuario_esigma`) e restrita a super_admin.
"""
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from loguru import logger
from sqlalchemy.orm import Session

from core.auth_esigma import UsuarioEsigma, obter_usuario_esigma
from core.consultor_importacao import AdaptadorLojas, ConsultorImportacao
from core.constants import ModoImportacao
from core.esigma_cliente import EsigmaProvisionamentoClient
from core.importacao_conselho import ErroArquivoImportacao, gerar_modelo_csv, ler_csv, validar_importacao
from core.importacao_conselho_execucao import executar_importacao
from database import get_db_core
from schemas.importacao_conselho import (
    ConfirmacaoImportacao,
    RelatorioExecucao,
    RelatorioValidacao,
    RevalidacaoPayload,
)

router = APIRouter(prefix="/importacao-conselho", tags=["SuperAdmin — Importação de Conselho (CSV)"])

_RESPOSTAS_AUTH = {
    401: {"description": "Sessão inválida ou expirada."},
    403: {"description": "Exige perfil SuperAdmin."},
}


def exigir_super_admin(usuario: UsuarioEsigma = Depends(obter_usuario_esigma)) -> UsuarioEsigma:
    """Somente super_admin validado pelo e-Sigma (nunca por header enviado pelo cliente)."""
    if not usuario.is_super_admin:
        logger.warning(f"[Importação Conselho] Acesso negado a {usuario.email} (role={usuario.role}).")
        raise HTTPException(status_code=403, detail="Apenas o SuperAdmin pode importar Conselhos.")
    return usuario


def _consultor(db: Session, authorization: str) -> ConsultorImportacao:
    return ConsultorImportacao(db, AdaptadorLojas(authorization), EsigmaProvisionamentoClient(authorization))


@router.get(
    "/modelo-csv",
    summary="Baixa o modelo de CSV da importação",
    description="Template (separador `;`, UTF-8) com cabeçalho oficial e uma linha de exemplo.",
    responses={**_RESPOSTAS_AUTH},
)
def baixar_modelo_csv(_usuario: UsuarioEsigma = Depends(exigir_super_admin)):
    return Response(
        content="\ufeff" + gerar_modelo_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="modelo_importacao_conselho.csv"'},
    )


@router.post(
    "/validar",
    response_model=RelatorioValidacao,
    summary="Valida o CSV (sem gravar nada)",
    description=(
        "Lê o arquivo, higieniza e valida completude, formato e consistência (inclusive contra Lojas/e-Sigma). "
        "Retorna o relatório por linha/campo para o formulário de revisão e, se não houver erros, o `token_importacao`."
    ),
    responses={
        **_RESPOSTAS_AUTH,
        400: {"description": "Arquivo inválido (tamanho, colunas, linhas)."},
        422: {"description": "Parâmetros inválidos."},
    },
)
async def validar_csv(
    arquivo: UploadFile = File(..., description="Arquivo .csv"),
    modo: ModoImportacao = Form(...),
    regiao_id: Optional[str] = Form(None),
    authorization: str = Header(...),
    db: Session = Depends(get_db_core),
    usuario: UsuarioEsigma = Depends(exigir_super_admin),
):
    logger.info(f"[Importação Conselho] Upload de '{arquivo.filename}' por {usuario.email} (modo={modo.value}, core_db).")
    conteudo = await arquivo.read()
    try:
        linhas = ler_csv(conteudo)
    except ErroArquivoImportacao as erro:
        raise HTTPException(status_code=400, detail=str(erro))
    return validar_importacao(linhas, modo, regiao_id, _consultor(db, authorization))


@router.post(
    "/revalidar",
    response_model=RelatorioValidacao,
    summary="Revalida linhas editadas no formulário",
    description="Mesma validação de `/validar`, mas sobre as linhas já editadas pelo SuperAdmin na tela de revisão.",
    responses={**_RESPOSTAS_AUTH, 422: {"description": "Payload inválido."}},
)
def revalidar(
    payload: RevalidacaoPayload,
    authorization: str = Header(...),
    db: Session = Depends(get_db_core),
    _usuario: UsuarioEsigma = Depends(exigir_super_admin),
):
    return validar_importacao(payload.linhas, payload.modo, payload.regiao_id, _consultor(db, authorization))


@router.post(
    "/confirmar",
    response_model=RelatorioExecucao,
    summary="Confirma e executa a importação validada",
    description=(
        "Revalida as linhas e só executa se o `token_importacao` bater (o confirmado é o revisado). "
        "Cria/vincula Lojas e Obreiros no Lojas, provisiona contas no e-Sigma (senha provisória por e-mail, "
        "após o commit) e grava o Conselho no core_db em uma transação."
    ),
    responses={
        **_RESPOSTAS_AUTH,
        404: {"description": "Conselho (modo ATUALIZAR) não encontrado."},
        409: {"description": "Token divergente/linhas com erro, Conselho duplicado ou conflito de conta."},
        422: {"description": "Payload inválido."},
        502: {"description": "Falha em Lojas/e-Sigma; nada foi gravado no CoReVM (seguro repetir)."},
    },
)
def confirmar(
    payload: ConfirmacaoImportacao,
    authorization: str = Header(...),
    db: Session = Depends(get_db_core),
    usuario: UsuarioEsigma = Depends(exigir_super_admin),
):
    relatorio = validar_importacao(payload.linhas, payload.modo, payload.regiao_id, _consultor(db, authorization))
    if not relatorio.token_importacao or relatorio.token_importacao != payload.token_importacao:
        logger.warning(f"[Importação Conselho] Confirmação recusada para {usuario.email}: token divergente ou linhas com erro.")
        raise HTTPException(
            status_code=409,
            detail="Os dados mudaram ou possuem erros desde a validação. Valide novamente antes de confirmar.",
        )
    return executar_importacao(
        db,
        linhas_validadas=[linha.dados for linha in relatorio.linhas],
        modo=payload.modo,
        regiao_id=payload.regiao_id,
        lojas_desagregar=payload.lojas_desagregar,
        ator_id=usuario.identificador_negocio or usuario.user_id or "superadmin",
        ator_nome=usuario.email,
        lojas=AdaptadorLojas(authorization),
        esigma=EsigmaProvisionamentoClient(authorization),
    )


@router.post(
    "/pessoas/{pessoa_id}/reenviar-senha",
    summary="Reenvia senha provisória a uma pessoa provisionada",
    description="Gera nova senha provisória no e-Sigma e a envia ao e-mail do titular.",
    responses={**_RESPOSTAS_AUTH, 404: {"description": "Pessoa não encontrada."}},
)
def reenviar_senha(
    pessoa_id: str,
    authorization: str = Header(...),
    usuario: UsuarioEsigma = Depends(exigir_super_admin),
):
    logger.info(f"[Importação Conselho] Reenvio de senha da pessoa {pessoa_id} solicitado por {usuario.email}.")
    return EsigmaProvisionamentoClient(authorization).reenviar_senha(pessoa_id)
