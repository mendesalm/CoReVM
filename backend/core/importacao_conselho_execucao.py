# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Execução (com efeitos colaterais) da importação em lote de Conselho Regional.

Ordem das operações — pensada para que uma falha nunca deixe o `core_db`
inconsistente e para que a reexecução seja segura (tudo é idempotente):

  1. e-Sigma:  provisiona as contas de VMs/Suplentes SEM enviar e-mail.
  2. Lojas:    garante cada Loja e empossa VM/Suplente (buscar-antes-de-criar).
  3. core_db:  UMA transação (Região, vínculo da Loja, liderança, Suplente,
               Operadores, Diretoria). Falhou? rollback total.
  4. Auditoria + e-mails de senha provisória, só DEPOIS do commit do core_db
     (ninguém recebe senha de um cadastro desfeito).

Fronteira de módulos (AGENTS.md, seção 2): Lojas e e-Sigma são acessados
somente pelos clientes de API injetados; `core_db` é o único banco tocado.
Nenhuma senha passa por este módulo.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol

from fastapi import HTTPException
from loguru import logger
from sqlalchemy.orm import Session

from core.auditoria_service import registrar_auditoria
from core.constants import (
    CARGO_LOJA_ID_POR_NOME,
    FONTE_LIDERANCA_IMPORTACAO,
    ModoImportacao,
    SlotOperador,
)
from models.models import (
    DiretoriaConselho,
    HistoricoLiderancaLoja,
    LojaAgregada,
    OperadorAdministrativoLoja,
    Regiao,
    SuplenteConselho,
)
from schemas.importacao_conselho import (
    ContaProvisionada,
    LinhaImportacaoConselho,
    RelatorioExecucao,
)


class OperacoesLojas(Protocol):
    """Operações no módulo Lojas (implementadas sobre `LojasApiClient`; dublê nos testes)."""

    def buscar_loja(self, numero: str, uf: str) -> Optional[Dict[str, Any]]:
        """Retorna a Loja (dict com `id`) ou None."""
        ...

    def criar_loja(self, payload: Dict[str, Any]) -> Dict[str, Any]: ...

    def cim_do_vm_ativo(self, loja_id: str) -> Optional[str]: ...

    def empossar(self, loja_id: str, payload: Dict[str, Any]) -> Dict[str, Any]: ...


class OperacoesEsigma(Protocol):
    """Operações de conta no e-Sigma (implementadas sobre `EsigmaProvisionamentoClient`)."""

    def provisionar_pessoas(self, pessoas: List[Dict[str, Any]], enviar_email: bool = False) -> Dict[str, Any]: ...

    def reenviar_senha(self, pessoa_id: str) -> Dict[str, Any]: ...


def _pessoas_para_provisionar(linhas: List[LinhaImportacaoConselho]) -> List[Dict[str, Any]]:
    """VMs e Suplentes, deduplicados por CPF (a mesma pessoa pode aparecer em mais de uma linha)."""
    vistos: Dict[str, Dict[str, Any]] = {}
    for m in linhas:
        vistos.setdefault(m.vm_cpf, {
            "cpf": m.vm_cpf, "email": m.vm_email, "nome_completo": m.vm_nome,
            "cim": m.vm_cim, "telefone": m.vm_whatsapp,
        })
        if m.suplente_cim:
            vistos.setdefault(m.suplente_cpf, {
                "cpf": m.suplente_cpf, "email": m.suplente_email,
                "nome_completo": m.suplente_nome, "cim": m.suplente_cim,
            })
    return list(vistos.values())


def _garantir_loja_no_lojas(m: LinhaImportacaoConselho, lojas: OperacoesLojas) -> tuple[str, bool]:
    """Retorna (loja_id, criada_agora). Idempotente: busca antes de criar."""
    existente = lojas.buscar_loja(m.loja_numero, m.loja_uf)
    if existente:
        return str(existente["id"]), False
    criada = lojas.criar_loja({
        "nome_loja": m.loja_nome,
        "numero_loja": m.loja_numero,
        "titulo_loja": m.loja_nome,
        "rito": m.loja_rito.value,
        "potencia_id": int(m.loja_potencia_id),
        "cidade": m.loja_cidade,
        "estado": m.loja_uf,
    })
    return str(criada.get("id") or criada.get("loja_id")), True


def _empossar_lideranca_no_lojas(m: LinhaImportacaoConselho, loja_id: str, lojas: OperacoesLojas) -> None:
    """Empossa o VM (se ainda não for o VM ativo) e o Suplente (se ocupa cargo eletivo)."""
    if lojas.cim_do_vm_ativo(loja_id) != m.vm_cim:
        lojas.empossar(loja_id, {
            "cim": m.vm_cim, "nome_completo": m.vm_nome, "email": m.vm_email, "cpf": m.vm_cpf,
            "telefone": m.vm_whatsapp, "cargo_id": CARGO_LOJA_ID_POR_NOME["Venerável Mestre"],
            "data_inicio_mandato": m.vm_data_posse.isoformat(),
        })
    cargo_id = CARGO_LOJA_ID_POR_NOME.get(m.suplente_cargo_loja or "")
    if m.suplente_cim and cargo_id:
        lojas.empossar(loja_id, {
            "cim": m.suplente_cim, "nome_completo": m.suplente_nome, "email": m.suplente_email,
            "cpf": m.suplente_cpf, "cargo_id": cargo_id,
        })


def _gravar_core(
    db: Session, modo: ModoImportacao, regiao_id: Optional[str],
    linhas: List[LinhaImportacaoConselho], loja_ids: Dict[int, str],
    lojas_desagregar: List[str], ator_id: str,
) -> tuple[Regiao, int]:
    """Toda a escrita no `core_db`, SEM commit (o chamador comita/rollback). Retorna (Região, desagregadas)."""
    primeiro = linhas[0]
    if modo == ModoImportacao.CRIAR:
        duplicada = db.query(Regiao).filter(Regiao.nome == primeiro.conselho_nome, Regiao.uf == primeiro.conselho_uf).first()
        if duplicada:
            raise HTTPException(status_code=409, detail="Já existe um Conselho com este nome/UF. Use o modo ATUALIZAR.")
        regiao = Regiao(nome=primeiro.conselho_nome, uf=primeiro.conselho_uf, ativa=True)
        db.add(regiao)
        db.flush()
    else:
        regiao = db.query(Regiao).filter(Regiao.id == regiao_id).first()
        if not regiao:
            raise HTTPException(status_code=404, detail="Conselho (Região) não encontrado.")

    agora = datetime.utcnow()
    for indice, m in enumerate(linhas):
        loja_id = loja_ids[indice]

        # Vínculo da Loja ao Conselho (reativa se estava desagregada).
        vinculo = db.query(LojaAgregada).filter(LojaAgregada.loja_id == loja_id, LojaAgregada.regiao_id == regiao.id).first()
        if vinculo:
            vinculo.ativa = True
            vinculo.data_filiacao = m.data_filiacao
        else:
            db.add(LojaAgregada(regiao_id=regiao.id, loja_id=loja_id, data_filiacao=m.data_filiacao, ativa=True))

        # Registro próprio do Conselho sobre quem é o VM da Loja.
        lideranca = db.query(HistoricoLiderancaLoja).filter(HistoricoLiderancaLoja.loja_id == loja_id).first()
        if not lideranca:
            lideranca = HistoricoLiderancaLoja(loja_id=loja_id, regiao_id=regiao.id)
            db.add(lideranca)
        lideranca.regiao_id = regiao.id
        lideranca.veneravel_cim = m.vm_cim
        lideranca.veneravel_nome = m.vm_nome
        lideranca.veneravel_email = m.vm_email
        lideranca.fonte = FONTE_LIDERANCA_IMPORTACAO
        lideranca.confirmado_em = agora
        lideranca.divergente = False
        lideranca.divergencia_detalhe = None

        # Suplente do Conselho: a importação substitui o anterior da Loja.
        db.query(SuplenteConselho).filter(SuplenteConselho.loja_id == loja_id).delete(synchronize_session=False)
        if m.suplente_cim:
            db.add(SuplenteConselho(
                loja_id=loja_id, usuario_id=m.suplente_cim, nome_suplente=m.suplente_nome,
                email_suplente=m.suplente_email, vinculo_valido=True,
            ))

        # Operadores administrativos (slots independentes por Loja).
        for slot in (SlotOperador.SECRETARIO, SlotOperador.CHANCELER):
            prefixo = f"op_{slot.value.lower()}"
            cim = getattr(m, f"{prefixo}_cim")
            if not cim:
                continue
            operador = db.query(OperadorAdministrativoLoja).filter(
                OperadorAdministrativoLoja.loja_id == loja_id, OperadorAdministrativoLoja.slot == slot.value
            ).first()
            if not operador:
                operador = OperadorAdministrativoLoja(loja_id=loja_id, slot=slot.value)
                db.add(operador)
            operador.usuario_id = cim
            operador.nome_operador = getattr(m, f"{prefixo}_nome")
            operador.email_operador = getattr(m, f"{prefixo}_email")
            operador.ativo = True
            operador.designado_por = ator_id
            operador.designado_em = agora

        # Mesa Diretora: todo diretor é VM (decisão 2026-10-09) e mantém o loja_id da própria Loja.
        if m.cargo_diretoria:
            membro = db.query(DiretoriaConselho).filter(
                DiretoriaConselho.regiao_id == regiao.id, DiretoriaConselho.cargo == m.cargo_diretoria
            ).first()
            if not membro:
                membro = DiretoriaConselho(regiao_id=regiao.id, cargo=m.cargo_diretoria)
                db.add(membro)
            membro.usuario_id = m.vm_cim
            membro.loja_id = loja_id
            membro.inicio_mandato = m.inicio_mandato
            membro.termino_mandato = m.termino_mandato

    # Desagregações explícitas aprovadas pelo SuperAdmin (nunca automáticas).
    desagregadas = 0
    for loja_id in lojas_desagregar:
        vinculo = db.query(LojaAgregada).filter(
            LojaAgregada.loja_id == str(loja_id), LojaAgregada.regiao_id == regiao.id, LojaAgregada.ativa.is_(True)
        ).first()
        if vinculo:
            vinculo.ativa = False
            desagregadas += 1
    return regiao, desagregadas


def executar_importacao(
    db: Session,
    linhas_validadas: List[Dict[str, Any]],
    modo: ModoImportacao,
    regiao_id: Optional[str],
    lojas_desagregar: List[str],
    ator_id: str,
    ator_nome: Optional[str],
    lojas: OperacoesLojas,
    esigma: OperacoesEsigma,
) -> RelatorioExecucao:
    """Executa a importação já validada e confirmada. Ver docstring do módulo para a ordem."""
    linhas = [LinhaImportacaoConselho(**dados) for dados in linhas_validadas]
    if not linhas:
        raise HTTPException(status_code=422, detail="Nenhuma linha para importar.")

    logger.info(
        f"[Importação Conselho] Execução iniciada por {ator_nome or ator_id}: modo={modo.value} "
        f"regiao={regiao_id} linhas={len(linhas)} (bancos: e-Sigma/API, Lojas/API, core_db)"
    )

    # 1. Contas no e-Sigma (sem e-mail; tudo-ou-nada no próprio e-Sigma).
    resposta_contas = esigma.provisionar_pessoas(_pessoas_para_provisionar(linhas), enviar_email=False)

    # 2. Lojas e lideranças no módulo Lojas.
    loja_ids: Dict[int, str] = {}
    criadas = 0
    try:
        for indice, m in enumerate(linhas):
            loja_id, criada = _garantir_loja_no_lojas(m, lojas)
            loja_ids[indice] = loja_id
            criadas += int(criada)
            _empossar_lideranca_no_lojas(m, loja_id, lojas)
    except HTTPException as erro:
        # Nada foi gravado no core_db; o que já existe no e-Sigma/Lojas é reaproveitado numa nova tentativa.
        logger.error(f"[Importação Conselho] Falha no módulo Lojas na linha {len(loja_ids) + 1}: {erro.detail}")
        raise HTTPException(status_code=erro.status_code, detail={
            "mensagem": "Falha ao gravar no módulo Lojas; nada foi gravado no CoReVM. É seguro tentar novamente.",
            "linha": len(loja_ids) + 1, "causa": erro.detail,
        })

    # 3. core_db em uma única transação.
    try:
        regiao, desagregadas = _gravar_core(db, modo, regiao_id, linhas, loja_ids, lojas_desagregar, ator_id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[Importação Conselho] Falha no core_db — rollback executado.")
        raise

    # 4. Auditoria e e-mails (pós-commit).
    registrar_auditoria(
        db, regiao_id=regiao.id, usuario_id=ator_id, usuario_nome=ator_nome, usuario_cargo="SUPERADMIN",
        acao=f"IMPORTACAO_CONSELHO_{modo.value}", entidade="Regiao", entidade_id=regiao.id,
        detalhes={"lojas": len(linhas), "lojas_criadas": criadas, "desagregadas": desagregadas},
        emitir_tempo_real=False,
    )

    contas: List[ContaProvisionada] = []
    avisos: List[str] = []
    for resultado in resposta_contas.get("resultados", []):
        enviado = False
        if resultado["status"] in ("criada", "acesso_concedido") and resultado.get("pessoa_id"):
            try:
                enviado = bool(esigma.reenviar_senha(resultado["pessoa_id"]).get("email_enviado"))
            except HTTPException as erro:
                logger.warning(f"[Importação Conselho] Falha ao enviar senha de {resultado['email']}: {erro.detail}")
            if not enviado:
                avisos.append(f"Senha não enviada para {resultado['email']}; use 'reenviar senha'.")
        contas.append(ContaProvisionada(
            cpf=resultado["cpf"], email=resultado["email"], status=resultado["status"], email_enviado=enviado,
        ))

    logger.info(
        f"[Importação Conselho] Concluída: região={regiao.id} lojas={len(linhas)} criadas_no_lojas={criadas} "
        f"desagregadas={desagregadas} contas={len(contas)}"
    )
    return RelatorioExecucao(
        regiao_id=regiao.id, regiao_nome=regiao.nome, modo=modo, lojas_processadas=len(linhas),
        lojas_criadas_no_lojas=criadas, lojas_desagregadas=desagregadas, contas=contas, avisos=avisos,
    )
