# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Tarefas agendadas do CoReVM.

- Arquivamento automático de Avisos/Notificações vencidos (pedido do
  usuário, 2026-09-12 — "Avisos e notificações devem ser arquivados
  automaticamente após a data de expiração").
- Reconciliação semanal Diretoria×Lojas (2026-09-14 — ver
  `core/reconciliacao_diretoria_lojas.py` e
  `claude/decisao-resiliencia-core-semiautonomo.md` no Project "Core"):
  compara o registro próprio do Conselho sobre o Venerável Mestre/Suplente
  de cada Loja jurisdicionada com o cadastro real em `lojas_db`, e avisa por
  e-mail quando os dois divergem — parte da decisão de tornar o Core um
  módulo semi-autônomo, que continua funcionando mesmo que uma Loja não
  mantenha seu cadastro em dia no módulo Lojas.

Implementado com APScheduler rodando DENTRO do próprio processo do
backend (BackgroundScheduler) — decisão consciente de manter simples, sem
exigir infraestrutura nova (cron/systemd timer separado). Se um dia a
aplicação passar a rodar em múltiplas réplicas, isso precisa migrar para um
job externo único (senão cada réplica roda a mesma tarefa em paralelo) —
registrado aqui para não ser esquecido.
"""
from datetime import date, datetime

from apscheduler.schedulers.background import BackgroundScheduler
from loguru import logger


def arquivar_avisos_vencidos_automaticamente():
    """
    Roda uma vez por dia: qualquer Aviso/Notificação com `data_validade` no
    passado e ainda não arquivado é arquivado automaticamente, com
    `arquivado_por="Sistema (expiração automática)"` — mantém o mesmo log
    de auditoria pedido para arquivamento manual, deixando claro que não foi
    uma pessoa que arquivou.
    """
    from database import get_db_core
    from models.models import AvisoRegional

    db = next(get_db_core())
    try:
        hoje = date.today()
        vencidos = db.query(AvisoRegional).filter(
            AvisoRegional.arquivado == False,
            AvisoRegional.data_validade.isnot(None),
            AvisoRegional.data_validade < hoje,
        ).all()

        for aviso in vencidos:
            aviso.arquivado = True
            aviso.arquivado_em = datetime.utcnow()
            aviso.arquivado_por = "Sistema (expiração automática)"

        if vencidos:
            db.commit()
            logger.info(f"Arquivamento automático: {len(vencidos)} aviso(s)/notificação(ões) vencido(s) arquivado(s).")
    except Exception as e:
        db.rollback()
        logger.error(f"Erro no arquivamento automático de avisos vencidos: {e}")
    finally:
        db.close()


def _rodar_reconciliacao_diretoria_lojas():
    """Wrapper fino em torno de `executar_reconciliacao_diretoria_lojas` —
    a lógica de negócio mora em `core/reconciliacao_diretoria_lojas.py`
    (import tardio, mesmo padrão já usado acima para
    `arquivar_avisos_vencidos_automaticamente`, para não acoplar o módulo de
    agendamento aos módulos de negócio na importação)."""
    from core.reconciliacao_diretoria_lojas import executar_reconciliacao_diretoria_lojas

    try:
        executar_reconciliacao_diretoria_lojas()
    except Exception as e:
        logger.error(f"Erro na reconciliação semanal Diretoria×Lojas: {e}")


def iniciar_agendador() -> BackgroundScheduler:
    """
    Chamado uma única vez, no startup do FastAPI (ver main.py). Roda o
    arquivamento todo dia à meia-noite, e a reconciliação Diretoria×Lojas
    uma vez por semana (segunda-feira de madrugada — frequência decidida
    pelo usuário: as reuniões de Veneráveis ocorrem a cada bimestre, então
    uma verificação semanal já dá folga de sobra sem gerar carga
    desnecessária em nenhum dos dois bancos).
    """
    agendador = BackgroundScheduler(timezone="America/Sao_Paulo")
    agendador.add_job(
        arquivar_avisos_vencidos_automaticamente,
        trigger="cron",
        hour=0,
        minute=5,
        id="arquivar_avisos_vencidos",
        replace_existing=True,
    )
    agendador.add_job(
        _rodar_reconciliacao_diretoria_lojas,
        trigger="cron",
        day_of_week="mon",
        hour=3,
        minute=0,
        id="reconciliacao_diretoria_lojas",
        replace_existing=True,
    )
    agendador.start()
    logger.info(
        "Agendador de tarefas iniciado (arquivamento automático de avisos vencidos diariamente às 00:05; "
        "reconciliação Diretoria×Lojas semanalmente às segundas 03:00)."
    )
    return agendador
