# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Reconciliação semanal entre o registro próprio do Conselho sobre a
liderança das Lojas jurisdicionadas e o cadastro real em `lojas_db`
(2026-09-14) — implementa a decisão de tornar o CoReVM um módulo
semi-autônomo, registrada em
`claude/decisao-resiliencia-core-semiautonomo.md` no Project "Core".

Ideia central (proposta pelo usuário): nem toda Loja adere ao ecossistema
com o mesmo rigor, e mesmo as que aderem podem não manter o cadastro do
módulo Lojas atualizado (troca de Venerável Mestre não regularizada, etc.).
Se o Conselho dependesse de uma leitura síncrona e sempre-atualizada de
`lojas_db` para funcionar, um problema de adesão/qualidade de dados de
QUALQUER Loja jurisdicionada derrubaria o Conselho inteiro — falência em
cascata de um módulo satélite para outro.

A solução: o Conselho passa a manter seu PRÓPRIO registro de quem é (ou foi
visto pela última vez como) o Venerável Mestre de cada Loja jurisdicionada
(tabela `historico_lideranca_loja`, em `core_db`) — é esse registro local
que alimenta a Diretoria, a lista de elegíveis, a detecção de assento órfão
etc. (ver `api/v1/regional/rotas.py`), não mais uma consulta ao vivo em
`lojas_db` a cada requisição. Este módulo é o job PERIÓDICO (semanal — ver
`core/tarefas_agendadas.py`) que mantém esse registro local em dia,
comparando-o com `lojas_db` e avisando os interessados quando os dois
divergem, em vez de travar ou de silenciosamente confiar num dos dois lados.

Regra de reconciliação, por Loja jurisdicionada:
- **Sem registro local ainda** (primeira vez que a Loja é vista): cria o
  registro a partir de `lojas_db`, `fonte="SYNC_LOJAS"`. Não é uma
  divergência — é a inicialização.
- **Registro local com `fonte="SYNC_LOJAS"`** (nenhuma intervenção manual do
  Conselho em vigor): `lojas_db` continua sendo a fonte presumida da
  verdade. Se o VM mudou normalmente (posse regular) ou se a Loja ficou sem
  VM (vacância), o registro local é atualizado para refletir o estado atual
  — mas só dispara alerta quando a Loja FICOU sem VM (esse é o cenário de
  risco que motivou toda a funcionalidade de transmissão emergencial); uma
  troca normal de VM (Loja com VM antes e depois, só que outra pessoa) é
  silenciosa, é exatamente o que a sincronização deveria fazer sem alarde.
- **Registro local com `fonte="OVERRIDE_CONSELHO"`** (o Conselho interveio —
  reatribuição emergencial de assento da Diretoria, ou transmissão
  emergencial de cargo de VM): `lojas_db` NÃO é sobrescrita
  automaticamente enquanto ainda diverge — seria apagar uma decisão legítima
  do Conselho. Só quando `lojas_db` finalmente passa a bater com o que o
  Conselho registrou é que a Loja é considerada "regularizada": o registro
  volta a `fonte="SYNC_LOJAS"` e um aviso de regularização (não de alarme) é
  disparado.

Escopo deliberadamente restrito (esclarecido pelo usuário, 2026-09-14): o
Core não acompanha a diretoria completa de cada Loja — só o Venerável
Mestre (`HistoricoLiderancaLoja`) e o Suplente do Conselho por ele indicado
(`SuplenteConselho.vinculo_valido`, verificado logo abaixo). Os demais
cargos eletivos da Loja (1º/2º Vigilante, Orador, Secretário, Tesoureiro,
Chanceler) não interessam ao Conselho e não são replicados aqui — eles só
aparecem indiretamente, como candidatos elegíveis a Suplente.

Notificação por e-mail (pedido do usuário, 2026-09-14): quando uma Loja
entra ou sai do estado de divergência nesta execução, avisa por e-mail (via
`core/email_service.py`, já existente) três públicos: os Webmasters daquela
Loja especificamente (podem corrigir o cadastro), a Diretoria do Conselho
responsável por aquela Região (Presidente/Vice/Secretário), e o(s)
SuperAdmin(s) configurado(s) em `ALERTA_SUPERADMIN_EMAILS` (variável de
ambiente, lista separada por vírgula — não existe hoje uma tabela canônica
de "quem é SuperAdmin" acessível do CoReVM sem supor a estrutura interna do
schema do e-Sigma; ver ressalva na seção correspondente do documento de
decisão). Alerta só dispara na TRANSIÇÃO de estado (ficou divergente ou
deixou de ser), não a cada execução — evita spam semanal sobre um problema
já conhecido e ainda não resolvido; o próprio painel do Conselho
(`GET /{regiao_id}/diretoria/discrepancias`) continua mostrando o estado
atual a qualquer momento, para quem quiser conferir sem esperar um e-mail.
"""
import os
from datetime import datetime
from typing import Optional

from loguru import logger
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.email_service import enviar_email_notificacao
from database import get_db_core, get_db_lojas
from models.lojas_models import LojaIntegracao, Mandato, ObreiroIntegracao, WebmasterIntegracao
from models.models import DiretoriaConselho, HistoricoLiderancaLoja, LojaAgregada, Regiao, SuplenteConselho

CARGO_ID_VENERAVEL_MESTRE = 1

# Mesma lista usada em `api/v1/regional/rotas.py::CARGOS_SUPLENTE_ELEGIVEIS`
# (os 6 cargos eletivos da Loja que não o Venerável Mestre). Duplicada aqui
# de propósito — importar de `regional/rotas.py` criaria um import circular
# (esse módulo já importa daqui em alguns pontos via lazy-import). Se a
# lista mudar lá, precisa mudar aqui também.
CARGOS_SUPLENTE_ELEGIVEIS_IDS = [2, 3, 4, 5, 6, 7]


def _resolver_vm_atual_com_email(db_lojas: Session, loja_id: int) -> Optional[dict]:
    """Venerável Mestre em exercício de uma Loja, incluindo e-mail (a versão
    usada em `regional/rotas.py::_resolver_veneravel_atual_da_loja` não
    carrega e-mail — não reaproveitada aqui por isso)."""
    resultado = (
        db_lojas.query(Mandato, ObreiroIntegracao)
        .join(ObreiroIntegracao, Mandato.obreiro_id == ObreiroIntegracao.id)
        .filter(
            Mandato.loja_id == loja_id,
            Mandato.cargo_id == CARGO_ID_VENERAVEL_MESTRE,
            or_(Mandato.data_fim.is_(None), Mandato.data_fim >= func.current_date()),
        )
        .first()
    )
    if not resultado:
        return None
    _, obreiro = resultado
    return {"cim": obreiro.cim, "nome_completo": obreiro.nome_completo, "email": obreiro.email}


def _verificar_vinculo_suplente(db_lojas: Session, suplente: SuplenteConselho, loja_id: int) -> tuple[bool, Optional[str]]:
    """Confirma se o Suplente do Conselho designado para esta Loja ainda
    ocupa um dos 6 cargos eletivos elegíveis (`CARGOS_SUPLENTE_ELEGIVEIS_IDS`)
    no módulo Lojas. Não se aplica ao Suplente-regente da transmissão
    emergencial (`concedido_em` preenchido — esse é o "Mestre Instalado",
    que por definição não ocupa nenhum dos 6 cargos eletivos)."""
    if suplente.concedido_em is not None:
        return True, None

    obreiro = (
        db_lojas.query(ObreiroIntegracao)
        .filter((ObreiroIntegracao.cim == suplente.usuario_id) | (ObreiroIntegracao.cpf == suplente.usuario_id))
        .first()
    )
    if not obreiro:
        return False, (
            f"O Suplente designado ({suplente.nome_suplente}) não foi encontrado no cadastro "
            "do módulo Lojas."
        )

    mandato_ativo = (
        db_lojas.query(Mandato)
        .filter(
            Mandato.obreiro_id == obreiro.id,
            Mandato.loja_id == loja_id,
            Mandato.cargo_id.in_(CARGOS_SUPLENTE_ELEGIVEIS_IDS),
            or_(Mandato.data_fim.is_(None), Mandato.data_fim >= func.current_date()),
        )
        .first()
    )
    if mandato_ativo:
        return True, None
    return False, (
        f"O Suplente designado ({suplente.nome_suplente}) não ocupa mais nenhum dos 6 cargos "
        "eletivos elegíveis nesta Loja, segundo o módulo Lojas."
    )


def _notificar_suplente_invalido(
    db_core: Session, db_lojas: Session, regiao: Regiao, loja: LojaIntegracao, suplente: SuplenteConselho, ficou_invalido: bool
) -> None:
    titulo = (
        f"Suplente do Conselho da Loja {loja.numero_loja} não ocupa mais o cargo"
        if ficou_invalido
        else f"Suplente do Conselho da Loja {loja.numero_loja} regularizado"
    )
    if ficou_invalido:
        mensagem = (
            f"O Suplente do Conselho designado pela Loja {loja.nome_loja} (nº {loja.numero_loja}), "
            f"jurisdicionada ao Conselho Regional {regiao.nome}, {suplente.vinculo_invalido_detalhe or 'não ocupa mais um cargo elegível'}. "
            "Recomendamos que a Loja designe um novo Suplente dentre os oficiais em exercício."
        )
    else:
        mensagem = (
            f"O Suplente do Conselho da Loja {loja.nome_loja} (nº {loja.numero_loja}), "
            f"jurisdicionada ao Conselho Regional {regiao.nome}, voltou a ocupar um cargo elegível "
            "no módulo Lojas — a divergência anteriormente registrada foi resolvida."
        )

    destinatarios = set()
    destinatarios.update(_webmasters_da_loja(db_lojas, loja.id))
    destinatarios.update(_emails_diretoria_da_regiao(db_core, db_lojas, regiao.id))
    destinatarios.update(_emails_superadmin_configurados())
    for destinatario in destinatarios:
        enviar_email_notificacao(destinatario, "Ir.", titulo, mensagem)


def _webmasters_da_loja(db_lojas: Session, loja_id: int) -> list[str]:
    webmasters = (
        db_lojas.query(WebmasterIntegracao)
        .filter(WebmasterIntegracao.loja_id == loja_id, WebmasterIntegracao.ativo.is_(True))
        .all()
    )
    return [w.email for w in webmasters if w.email]


def _emails_diretoria_da_regiao(db_core: Session, db_lojas: Session, regiao_id: str) -> list[str]:
    membros = db_core.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == regiao_id).all()
    identificadores = [m.usuario_id for m in membros if m.usuario_id]
    if not identificadores:
        return []
    obreiros = (
        db_lojas.query(ObreiroIntegracao)
        .filter((ObreiroIntegracao.cim.in_(identificadores)) | (ObreiroIntegracao.cpf.in_(identificadores)))
        .all()
    )
    return [o.email for o in obreiros if o.email]


def _emails_superadmin_configurados() -> list[str]:
    """Lista de e-mails de SuperAdmin a notificar, via variável de ambiente
    `ALERTA_SUPERADMIN_EMAILS` (separados por vírgula).

    Ressalva deliberada: o CoReVM não tem hoje uma forma confiável de
    consultar "quem são os SuperAdmins" — o papel `super_admin` vem do token
    do e-Sigma numa claim calculada em tempo de login
    (`permissoes_sistema`/JSONB na tabela `Pessoa`, ver seção 1.4 do
    contexto de implementação), não de uma tabela dedicada e estável que o
    CoReVM possa consultar diretamente. Em vez de supor um schema que não
    foi confirmado, este envio usa uma lista configurável — mais simples e
    correta do que adivinhar. Registrado como possível melhoria futura
    (ex.: um endpoint do e-Sigma que devolva a lista de SuperAdmins) em
    `claude/decisao-resiliencia-core-semiautonomo.md`.
    """
    bruto = os.getenv("ALERTA_SUPERADMIN_EMAILS", "")
    return [e.strip() for e in bruto.split(",") if e.strip()]


def _notificar_transicao(
    db_core: Session,
    db_lojas: Session,
    regiao: Regiao,
    loja: LojaIntegracao,
    registro: HistoricoLiderancaLoja,
    novo_estado_divergente: bool,
) -> None:
    titulo = (
        f"Loja {loja.numero_loja} sem Venerável Mestre regularizado"
        if novo_estado_divergente
        else f"Loja {loja.numero_loja} regularizada"
    )
    if novo_estado_divergente:
        mensagem = (
            f"A Loja {loja.nome_loja} (nº {loja.numero_loja}), jurisdicionada ao "
            f"Conselho Regional {regiao.nome}, está sem Venerável Mestre "
            f"regularizado no cadastro do módulo Lojas. {registro.divergencia_detalhe or ''} "
            "Recomendamos regularizar o cadastro assim que possível, ou contatar a "
            "Diretoria do Conselho caso já exista uma indicação em andamento."
        )
    else:
        mensagem = (
            f"A Loja {loja.nome_loja} (nº {loja.numero_loja}), jurisdicionada ao "
            f"Conselho Regional {regiao.nome}, teve seu cadastro de Venerável Mestre "
            "regularizado no módulo Lojas — a divergência anteriormente registrada foi resolvida."
        )

    destinatarios = set()
    destinatarios.update(_webmasters_da_loja(db_lojas, loja.id))
    destinatarios.update(_emails_diretoria_da_regiao(db_core, db_lojas, regiao.id))
    destinatarios.update(_emails_superadmin_configurados())

    if not destinatarios:
        logger.warning(
            f"[Reconciliação Diretoria/Lojas] Nenhum destinatário resolvido para "
            f"Loja {loja.id} (Região {regiao.id}) — alerta não pôde ser enviado a ninguém."
        )
        return

    for destinatario in destinatarios:
        enviar_email_notificacao(destinatario, "Ir.", titulo, mensagem)

    logger.info(
        f"[Reconciliação Diretoria/Lojas] Notificação de "
        f"{'divergência' if novo_estado_divergente else 'regularização'} enviada para "
        f"{len(destinatarios)} destinatário(s) — Loja {loja.id} (Região {regiao.id})."
    )


def executar_reconciliacao_diretoria_lojas(regiao_id: Optional[str] = None) -> dict:
    """Roda a reconciliação para todas as Regiões ativas (ou só uma, se
    `regiao_id` for informado — usado pela rota de disparo manual). Retorna
    um resumo (para o job agendado logar, e para a rota manual devolver ao
    chamador)."""
    db_core = next(get_db_core())
    db_lojas = next(get_db_lojas())
    resumo = {"lojas_verificadas": 0, "divergencias_novas": 0, "regularizacoes": 0, "erros": 0}

    try:
        query_regioes = db_core.query(Regiao).filter(Regiao.ativa.is_(True))
        if regiao_id:
            query_regioes = query_regioes.filter(Regiao.id == regiao_id)
        regioes = query_regioes.all()

        for regiao in regioes:
            agregadas = (
                db_core.query(LojaAgregada)
                .filter(LojaAgregada.regiao_id == regiao.id, LojaAgregada.ativa.is_(True))
                .all()
            )

            for agregada in agregadas:
                if not str(agregada.loja_id).isdigit():
                    continue
                loja_id_int = int(agregada.loja_id)

                try:
                    loja = db_lojas.query(LojaIntegracao).filter(LojaIntegracao.id == loja_id_int).first()
                    if not loja:
                        continue

                    vm_atual = _resolver_vm_atual_com_email(db_lojas, loja_id_int)
                    agora = datetime.utcnow()

                    registro = (
                        db_core.query(HistoricoLiderancaLoja)
                        .filter(HistoricoLiderancaLoja.loja_id == str(agregada.loja_id))
                        .first()
                    )

                    resumo["lojas_verificadas"] += 1
                    primeira_observacao = registro is None

                    if primeira_observacao:
                        registro = HistoricoLiderancaLoja(
                            loja_id=str(agregada.loja_id),
                            regiao_id=regiao.id,
                            veneravel_cim=vm_atual["cim"] if vm_atual else None,
                            veneravel_nome=vm_atual["nome_completo"] if vm_atual else None,
                            veneravel_email=vm_atual["email"] if vm_atual else None,
                            fonte="SYNC_LOJAS",
                            confirmado_em=agora,
                            divergente=False,
                            ultima_verificacao_em=agora,
                        )
                        db_core.add(registro)
                        db_core.commit()
                        # Não é divergência, é inicialização — segue direto para a
                        # checagem do Suplente abaixo, sem passar pela comparação
                        # VM×lojas_db (não há o que comparar na primeira observação).

                    estava_divergente = registro.divergente
                    novo_estado_divergente = estava_divergente

                    if primeira_observacao:
                        pass
                    elif registro.fonte == "OVERRIDE_CONSELHO":
                        bate_com_lojas = vm_atual is not None and vm_atual["cim"] == registro.veneravel_cim
                        if bate_com_lojas:
                            # Loja regularizou — passa a valer a sincronização normal outra vez.
                            registro.fonte = "SYNC_LOJAS"
                            registro.confirmado_em = agora
                            novo_estado_divergente = False
                            registro.divergencia_detalhe = None
                        else:
                            # Ainda pendente — não sobrescreve a decisão do Conselho.
                            novo_estado_divergente = True
                            if vm_atual is None:
                                registro.divergencia_detalhe = (
                                    "O Conselho indicou um Venerável Mestre emergencialmente, mas a Loja "
                                    "ainda consta sem VM no cadastro do módulo Lojas."
                                )
                            else:
                                registro.divergencia_detalhe = (
                                    f"O Conselho indicou {registro.veneravel_nome} (CIM {registro.veneravel_cim}) "
                                    f"emergencialmente, mas o módulo Lojas ainda registra "
                                    f"{vm_atual['nome_completo']} (CIM {vm_atual['cim']}) como VM."
                                )
                    else:  # fonte == "SYNC_LOJAS"
                        if vm_atual is None and registro.veneravel_cim is not None:
                            # Loja tinha VM e ficou sem — o cenário de risco original.
                            novo_estado_divergente = True
                            registro.divergencia_detalhe = (
                                "A Loja está sem Venerável Mestre registrado no módulo Lojas "
                                "(o último conhecido pelo Conselho foi "
                                f"{registro.veneravel_nome}, CIM {registro.veneravel_cim})."
                            )
                            # Mantém o último VM conhecido no registro — é melhor ter um dado
                            # levemente desatualizado do que nenhum, para o Conselho continuar
                            # funcionando.
                        else:
                            # Turnover normal (ou já resolvido) — sincroniza silenciosamente.
                            registro.veneravel_cim = vm_atual["cim"] if vm_atual else registro.veneravel_cim
                            registro.veneravel_nome = vm_atual["nome_completo"] if vm_atual else registro.veneravel_nome
                            registro.veneravel_email = vm_atual["email"] if vm_atual else registro.veneravel_email
                            registro.confirmado_em = agora
                            novo_estado_divergente = False
                            registro.divergencia_detalhe = None

                    registro.divergente = novo_estado_divergente
                    registro.ultima_verificacao_em = agora
                    db_core.commit()

                    if novo_estado_divergente != estava_divergente:
                        registro.ultimo_alerta_em = agora
                        db_core.commit()
                        if novo_estado_divergente:
                            resumo["divergencias_novas"] += 1
                        else:
                            resumo["regularizacoes"] += 1
                        _notificar_transicao(db_core, db_lojas, regiao, loja, registro, novo_estado_divergente)

                    # Segunda checagem, mais restrita (conforme esclarecido pelo
                    # usuário): o Suplente do Conselho indicado pelo VM ainda
                    # ocupa um cargo eletivo elegível na Loja?
                    suplente = db_core.query(SuplenteConselho).filter_by(loja_id=str(agregada.loja_id)).first()
                    if suplente:
                        vinculo_valido, detalhe = _verificar_vinculo_suplente(db_lojas, suplente, loja_id_int)
                        estava_valido = suplente.vinculo_valido
                        suplente.vinculo_valido = vinculo_valido
                        suplente.vinculo_invalido_detalhe = detalhe
                        suplente.vinculo_verificado_em = agora
                        db_core.commit()

                        if vinculo_valido != estava_valido:
                            if not vinculo_valido:
                                resumo["divergencias_novas"] += 1
                            else:
                                resumo["regularizacoes"] += 1
                            _notificar_suplente_invalido(
                                db_core, db_lojas, regiao, loja, suplente, ficou_invalido=not vinculo_valido
                            )

                except Exception as erro_loja:
                    db_core.rollback()
                    resumo["erros"] += 1
                    logger.error(
                        f"[Reconciliação Diretoria/Lojas] Erro ao processar Loja "
                        f"{agregada.loja_id} (Região {regiao.id}): {erro_loja}"
                    )

        logger.info(f"[Reconciliação Diretoria/Lojas] Execução concluída: {resumo}")
        return resumo
    finally:
        db_core.close()
        db_lojas.close()
