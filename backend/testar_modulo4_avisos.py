# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 4 do roteiro (Mural de Avisos e Notificações).

Cobre via API:
  - Publicar Aviso e Publicar Notificação
  - Fixar (`fixado=true`) só é respeitado se vier de Diretoria/SuperAdmin
    (um VM comum que tenta fixar tem o campo silenciosamente ignorado --
    `_fixado_efetivo`/`criar_aviso_regional` em regional/rotas.py)
  - Editar/excluir aviso próprio
  - VM tentando editar/excluir aviso de OUTRA Loja -> 403
  - SuperAdmin: hard delete (físico) vs. Diretoria/VM: soft delete (arquivamento)
  - Tag "lido"/"não lido" persiste (marcar-lido)
  - "Ver arquivados" (incluir_arquivados=true) + reativar
  - Card mostra loja_numero (não o loja_id interno) -- confirmado no
    payload de GET /avisos

NÃO automatizado aqui (fica para verificação manual, ver roteiro):
  - Aviso com data_validade expirada sumir da visão de membros comuns:
    depende do agendador (`arquivar_avisos_vencidos_automaticamente`,
    core/tarefas_agendadas.py) rodar, ou de mexer no relógio do servidor --
    fora do alcance de um teste de API pontual.

Uso:
    python testar_modulo4_avisos.py
"""
from datetime import date, timedelta

from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)
    checar("login SuperAdmin", ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!").status_code == 200)

    print("\n1) Publicar Aviso (VM 904)")
    resp = ctx.post("vm904", f"/regional/{REGIAO_ID}/avisos", json={
        "titulo": "[TESTE AUTOMATIZADO] Aviso de rotina",
        "conteudo": "Conteúdo de teste automatizado -- pode ser removido.",
        "nivel": "BAIXO",
        "tipo": "AVISO",
    })
    checar("POST /avisos (Aviso) -> 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")
    aviso_id = resp.json().get("aviso_id") if resp.status_code == 200 else None

    print("\n2) Publicar Notificação (VM 904)")
    resp_notif = ctx.post("vm904", f"/regional/{REGIAO_ID}/avisos", json={
        "titulo": "[TESTE AUTOMATIZADO] Notificação de rotina",
        "conteudo": "Conteúdo de teste automatizado -- pode ser removido.",
        "nivel": "MEDIO",
        "tipo": "NOTIFICACAO",
    })
    checar("POST /avisos (Notificação) -> 200", resp_notif.status_code == 200, f"{resp_notif.status_code} {resp_notif.text}")
    notif_id = resp_notif.json().get("aviso_id") if resp_notif.status_code == 200 else None

    if aviso_id:
        print("\n3) VM comum tentando publicar já fixado -> campo é ignorado (fixado deve ficar False)")
        resp_fix = ctx.post("vm904", f"/regional/{REGIAO_ID}/avisos", json={
            "titulo": "[TESTE AUTOMATIZADO] Tentativa de fixar sem ser Diretoria",
            "conteudo": "Teste automatizado.",
            "nivel": "BAIXO",
            "fixado": True,
        })
        checar("POST /avisos com fixado=true (VM comum) -> 200", resp_fix.status_code == 200, f"{resp_fix.status_code} {resp_fix.text}")
        fixado_id = resp_fix.json().get("aviso_id") if resp_fix.status_code == 200 else None

        lista = ctx.get("vm904", f"/regional/{REGIAO_ID}/avisos")
        checar("GET /avisos -> 200", lista.status_code == 200, f"{lista.status_code} {lista.text}")
        if lista.status_code == 200 and fixado_id:
            item = next((a for a in lista.json() if a.get("id") == fixado_id), None)
            checar(
                "fixado ficou False (VM comum não pode fixar)",
                item is not None and item.get("fixado") is False,
                f"item={item!r}",
            )
            checar(
                "card mostra loja_numero, não o loja_id interno",
                item is not None and item.get("loja_numero") not in (None, "") and item.get("loja_numero") != item.get("loja_id"),
                f"item={item!r}",
            )

        print("\n4) Presidente (Diretoria) fixando o mesmo aviso -> fixado deve virar True")
        resp_put = ctx.put("presidente", f"/regional/{REGIAO_ID}/avisos/{fixado_id}", json={"fixado": True})
        checar("PUT /avisos/{id} fixado=true (Diretoria) -> 200", resp_put.status_code == 200, f"{resp_put.status_code} {resp_put.text}")

        print("\n5) VM da Loja 905 tentando editar aviso da Loja 904 -> 403")
        resp_edita_alheio = ctx.put("vm905", f"/regional/{REGIAO_ID}/avisos/{aviso_id}", json={"titulo": "Tentativa indevida"})
        checar("PUT /avisos/{id} de outra Loja (VM 905) -> 403", resp_edita_alheio.status_code == 403, f"{resp_edita_alheio.status_code} {resp_edita_alheio.text}")

        print("\n6) VM da Loja 905 tentando excluir aviso da Loja 904 -> 403")
        resp_exclui_alheio = ctx.delete("vm905", f"/regional/{REGIAO_ID}/avisos/{aviso_id}")
        checar("DELETE /avisos/{id} de outra Loja (VM 905) -> 403", resp_exclui_alheio.status_code == 403, f"{resp_exclui_alheio.status_code} {resp_exclui_alheio.text}")

        print("\n7) Marcar como lido + persistência")
        resp_lido = ctx.post("vm905", f"/regional/{REGIAO_ID}/avisos/{aviso_id}/marcar-lido")
        checar("POST /avisos/{id}/marcar-lido -> 200", resp_lido.status_code == 200, f"{resp_lido.status_code} {resp_lido.text}")
        lista2 = ctx.get("vm905", f"/regional/{REGIAO_ID}/avisos")
        if lista2.status_code == 200:
            item2 = next((a for a in lista2.json() if a.get("id") == aviso_id), None)
            checar(
                "aviso aparece marcado como lido para quem marcou (persistência)",
                item2 is not None and item2.get("lido") is True,
                f"item={item2!r}",
            )

        print("\n8) VM 904 arquivando (soft delete) o próprio aviso")
        resp_arquiva = ctx.delete("vm904", f"/regional/{REGIAO_ID}/avisos/{aviso_id}")
        checar("DELETE /avisos/{id} (soft, dono) -> 200 tipo_delecao=VISUAL", resp_arquiva.status_code == 200 and resp_arquiva.json().get("tipo_delecao") == "VISUAL", f"{resp_arquiva.status_code} {resp_arquiva.text}")

        print("\n9) VM comum tentando hard delete -> 403 (mesmo sendo autor)")
        resp_hard_vm = ctx.delete("vm904", f"/regional/{REGIAO_ID}/avisos/{aviso_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (VM comum) -> 403", resp_hard_vm.status_code == 403, f"{resp_hard_vm.status_code} {resp_hard_vm.text}")

        print("\n10) Aviso arquivado: some da listagem padrão até para Diretoria, e só reaparece com incluir_arquivados=true PARA Diretoria/SuperAdmin")
        # ATENÇÃO: incluir_arquivados=true só tem efeito para quem é
        # Diretoria/SuperAdmin (`pode_ver_arquivados` em
        # listar_avisos_regionais) -- um VM comum nunca vê arquivados,
        # mesmo pedindo o filtro. Por isso a checagem do filtro usa o
        # Presidente, não o vm904.
        lista_sem_vm = ctx.get("vm904", f"/regional/{REGIAO_ID}/avisos")
        lista_com_vm = ctx.get("vm904", f"/regional/{REGIAO_ID}/avisos", params={"incluir_arquivados": "true"})
        lista_sem_diretoria = ctx.get("presidente", f"/regional/{REGIAO_ID}/avisos")
        lista_com_diretoria = ctx.get("presidente", f"/regional/{REGIAO_ID}/avisos", params={"incluir_arquivados": "true"})
        if all(r.status_code == 200 for r in (lista_sem_vm, lista_com_vm, lista_sem_diretoria, lista_com_diretoria)):
            presente_sem_vm = any(a.get("id") == aviso_id for a in lista_sem_vm.json())
            presente_com_vm = any(a.get("id") == aviso_id for a in lista_com_vm.json())
            presente_sem_diretoria = any(a.get("id") == aviso_id for a in lista_sem_diretoria.json())
            presente_com_diretoria = any(a.get("id") == aviso_id for a in lista_com_diretoria.json())
            checar("aviso arquivado NÃO aparece na listagem padrão (VM comum)", not presente_sem_vm, "aviso arquivado apareceu sem incluir_arquivados (VM)")
            checar(
                "aviso arquivado NÃO aparece nem com incluir_arquivados=true para VM comum (só Diretoria/SuperAdmin veem)",
                not presente_com_vm,
                "VM comum conseguiu ver um aviso arquivado -- deveria ser exclusivo de Diretoria/SuperAdmin",
            )
            checar("aviso arquivado NÃO aparece na listagem padrão (Diretoria)", not presente_sem_diretoria, "aviso arquivado apareceu sem incluir_arquivados (Diretoria)")
            checar("aviso arquivado aparece com incluir_arquivados=true (Diretoria)", presente_com_diretoria, "aviso arquivado não retornou nem para a Diretoria com o filtro")

        print("\n11) Diretoria reativando o aviso arquivado")
        resp_reativa = ctx.put("presidente", f"/regional/{REGIAO_ID}/avisos/{aviso_id}/reativar")
        checar("PUT /avisos/{id}/reativar (Diretoria) -> 200", resp_reativa.status_code == 200, f"{resp_reativa.status_code} {resp_reativa.text}")

        print("\n12) SuperAdmin fazendo hard delete definitivo (limpeza dos dados de teste)")
        resp_hard = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/avisos/{aviso_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (SuperAdmin) -> 200 tipo_delecao=FISICA", resp_hard.status_code == 200 and resp_hard.json().get("tipo_delecao") == "FISICA", f"{resp_hard.status_code} {resp_hard.text}")

    if notif_id:
        print("\n13) Limpeza da notificação de teste (hard delete via SuperAdmin)")
        resp_hard_n = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/avisos/{notif_id}?hard_delete=true")
        checar("limpeza da notificação de teste -> 200", resp_hard_n.status_code == 200, f"{resp_hard_n.status_code} {resp_hard_n.text}")

    resumo("MÓDULO 4 (AVISOS E NOTIFICAÇÕES)")


if __name__ == "__main__":
    main()
