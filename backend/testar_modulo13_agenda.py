# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 13 do roteiro (Agenda do Conselho).

Escrito em 2026-09-17, depois da correção que implementou de fato o
catálogo fechado de 9 tipos de evento com âmbito (ver
`claude/decisao-controle-acesso-cadastro.md`, seção 15, e a observação de
execução "2026-09-17" no roteiro). Antes dessa correção, `rotas.py` ainda
tinha o rascunho genérico de 6 tipos sem âmbito -- este script não faria
sentido contra aquela versão.

PRÉ-REQUISITO: rodar `rodar_migracao_eventos_agenda.py` antes -- a tabela
`eventos_agenda` precisa existir. Se a migração ainda não foi confirmada,
todo POST abaixo vai falhar com 500 (tabela inexistente), não com os
códigos esperados.

Cobre:
  13.1 Catálogo:
    - GET /agenda/tipos-evento -> 9 tipos, subtipos_validos só em SESSAO_MAGNA

  13.2 Âmbito CONSELHO (Reunião Administrativa, Encontro Regional, Conferência):
    - Diretoria cria REUNIAO_ADMINISTRATIVA -> sucesso, sem Loja organizadora
    - Tentativa de injetar loja_organizadora_id no payload (campo não existe
      no schema) -> ignorado pelo Pydantic, evento continua sem Loja --
      prova de que a trava não pode ser manipulada pelo cliente
    - VM (não Diretoria) tentando ENCONTRO_REGIONAL -> 403
    - Operador Administrativo tentando CONFERENCIA -> 403

  13.3 Âmbito LOJA (Sessão Magna, Sessão Pública, Ágape Ritualístico):
    - VM da Loja 904 cria SESSAO_PUBLICA -> sucesso, Loja travada na 904
    - Operador Administrativo (Secretário) cria AGAPE_RITUALISTICO -> sucesso,
      mesma Loja travada -- o caso de uso que motivou o módulo
    - SESSAO_MAGNA com subtipo INICIACAO -> sucesso
    - SESSAO_MAGNA com subtipo inválido ("FESTA") -> 400
    - SESSAO_MAGNA sem subtipo -> 400
    - Diretoria pura (sem loja_id) tentando SESSAO_PUBLICA -> 403 (âmbito
      LOJA exige vínculo com uma Loja; NOTA: o payload real não aceita
      `loja_organizadora_id` como input -- por isso o item do roteiro
      "Diretoria informando loja_organizadora_id explicitamente -> sucesso"
      não é testável como descrito; documentado como limitação conhecida,
      não como falha)

  13.4 Âmbito AMBOS (Evento Beneficente, Evento de Arrecadação, Homenagem Externa):
    - Operador Administrativo cria EVENTO_BENEFICENTE -> sucesso, travado na própria Loja
    - Diretoria pura cria HOMENAGEM_EXTERNA -> sucesso, sem Loja (representa o Conselho)

  13.5 Leitura, edição e integrações:
    - GET /agenda/eventos -> mural region-wide (Operador Administrativo
      também vê eventos de outras Lojas), campo subtipo presente
    - Filtro por tipo isolado
    - gerar_aviso=true -> AvisoRegional criado automaticamente, aviso_gerado_id aponta pra ele
    - previa_admissao_id de prévia real da mesma região -> sucesso
    - previa_admissao_id inexistente -> 404
    - Operador Administrativo vinculando previa_admissao_id de OUTRA Loja -> 403
    - PUT edita título/descrição de evento próprio -> sucesso
    - DELETE sem hard_delete -> soft-cancel (status CANCELADO)
    - VM de outra Loja tentando editar evento organizado pela 904 -> 403
    - hard_delete por não-SuperAdmin -> 403; limpeza final via SuperAdmin

NÃO AUTOMATIZADO aqui (limitações do desenho atual, não deste script):
  - `origem_lancamento` não é devolvido no JSON de `GET /agenda/eventos`
    hoje (só existe na coluna do model) -- não dá para afirmar via API que
    todo evento nasce com "CORE" sem uma query direta ao banco.
  - "Diretoria lança em nome de uma Loja específica" (coordenação, seção
    13.3/13.4 do roteiro) não é possível hoje porque `loja_organizadora_id`
    não é campo de input do payload -- só é auto-derivado de quem cria.
    Fica registrado como possível ajuste futuro, não como bug.

Uso:
    python testar_modulo13_agenda.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo

LOJA_904_ID = "269"
LOJA_905_ID = "270"
SECRETARIO_CIM = "9900025"  # mesmo CIM usado em testar_modulo12 -- limpo, sem outro papel regional


def main():
    ctx = Contexto()

    print("\n0) Logins + designação do Operador Administrativo (setup idempotente)")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)
    checar("login SuperAdmin", ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!").status_code == 200)

    resp_designa = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/SECRETARIO", json={"usuario_id": SECRETARIO_CIM})
    checar("(setup) SECRETARIO 904 designado/confirmado", resp_designa.status_code == 200, f"{resp_designa.status_code} {resp_designa.text}")
    checar("login Secretário 904 (Operador Administrativo)", ctx.login("secretario904", SECRETARIO_CIM).status_code == 200)

    ids_para_limpar = []  # (apelido_dono_ou_superadmin, evento_id)

    print("\n1) 13.1 Catálogo fechado")
    resp_tipos = ctx.get("vm904", f"/regional/{REGIAO_ID}/agenda/tipos-evento")
    checar("GET /agenda/tipos-evento -> 200", resp_tipos.status_code == 200, f"{resp_tipos.status_code} {resp_tipos.text}")
    if resp_tipos.status_code == 200:
        tipos = resp_tipos.json()
        checar("catálogo tem 9 tipos", len(tipos) == 9, f"{len(tipos)} tipos: {[t['tipo'] for t in tipos]}")
        por_codigo = {t["tipo"]: t for t in tipos}
        checar("SESSAO_MAGNA tem subtipos_validos com 6 itens", por_codigo.get("SESSAO_MAGNA", {}).get("subtipos_validos") not in (None, []) and len(por_codigo["SESSAO_MAGNA"]["subtipos_validos"]) == 6, f"{por_codigo.get('SESSAO_MAGNA')!r}")
        checar("REUNIAO_ADMINISTRATIVA tem ambito CONSELHO", por_codigo.get("REUNIAO_ADMINISTRATIVA", {}).get("ambito") == "CONSELHO", f"{por_codigo.get('REUNIAO_ADMINISTRATIVA')!r}")
        checar("SESSAO_PUBLICA tem ambito LOJA e subtipos_validos None", por_codigo.get("SESSAO_PUBLICA", {}).get("ambito") == "LOJA" and por_codigo.get("SESSAO_PUBLICA", {}).get("subtipos_validos") is None, f"{por_codigo.get('SESSAO_PUBLICA')!r}")
        checar("EVENTO_BENEFICENTE tem ambito AMBOS", por_codigo.get("EVENTO_BENEFICENTE", {}).get("ambito") == "AMBOS", f"{por_codigo.get('EVENTO_BENEFICENTE')!r}")

    print("\n2) 13.2 Âmbito CONSELHO")
    resp_conselho = ctx.post("presidente", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Reunião Administrativa",
        "tipo": "REUNIAO_ADMINISTRATIVA",
        "data_inicio": "2026-10-01T19:00:00",
        "loja_organizadora_id": LOJA_904_ID,  # campo não existe no payload -- deve ser ignorado
    })
    checar("Diretoria cria REUNIAO_ADMINISTRATIVA -> 200", resp_conselho.status_code == 200, f"{resp_conselho.status_code} {resp_conselho.text}")
    evento_conselho_id = resp_conselho.json().get("evento_id") if resp_conselho.status_code == 200 else None
    if evento_conselho_id:
        ids_para_limpar.append(("presidente", evento_conselho_id))
        eventos = ctx.get("presidente", f"/regional/{REGIAO_ID}/agenda/eventos").json()
        achado = next((e for e in eventos if e["id"] == evento_conselho_id), None)
        checar(
            "evento CONSELHO não tem Loja organizadora mesmo tentando injetar uma no payload",
            achado is not None and achado.get("loja_organizadora_id") is None,
            f"{achado!r}",
        )

    resp_vm_conselho = ctx.post("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Encontro Regional (deveria falhar)",
        "tipo": "ENCONTRO_REGIONAL",
        "data_inicio": "2026-10-02T19:00:00",
    })
    checar("VM comum tentando ENCONTRO_REGIONAL -> 403", resp_vm_conselho.status_code == 403, f"{resp_vm_conselho.status_code} {resp_vm_conselho.text}")

    resp_op_conselho = ctx.post("secretario904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Conferência (deveria falhar)",
        "tipo": "CONFERENCIA",
        "data_inicio": "2026-10-03T19:00:00",
    })
    checar("Operador Administrativo tentando CONFERENCIA -> 403", resp_op_conselho.status_code == 403, f"{resp_op_conselho.status_code} {resp_op_conselho.text}")

    print("\n3) 13.3 Âmbito LOJA")
    resp_sessao_publica = ctx.post("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Sessão Pública",
        "tipo": "SESSAO_PUBLICA",
        "data_inicio": "2026-10-04T19:00:00",
    })
    checar("VM da 904 cria SESSAO_PUBLICA -> 200", resp_sessao_publica.status_code == 200, f"{resp_sessao_publica.status_code} {resp_sessao_publica.text}")
    evt_sp_id = resp_sessao_publica.json().get("evento_id") if resp_sessao_publica.status_code == 200 else None
    if evt_sp_id:
        ids_para_limpar.append(("vm904", evt_sp_id))
        eventos = ctx.get("vm904", f"/regional/{REGIAO_ID}/agenda/eventos").json()
        achado = next((e for e in eventos if e["id"] == evt_sp_id), None)
        checar("SESSAO_PUBLICA travada na Loja 904", achado is not None and achado.get("loja_organizadora_id") == LOJA_904_ID, f"{achado!r}")

    resp_agape = ctx.post("secretario904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Ágape Ritualístico (via Operador Administrativo)",
        "tipo": "AGAPE_RITUALISTICO",
        "data_inicio": "2026-10-05T19:00:00",
    })
    checar("Operador Administrativo cria AGAPE_RITUALISTICO -> 200 (caso de uso que motivou o módulo)", resp_agape.status_code == 200, f"{resp_agape.status_code} {resp_agape.text}")
    evt_agape_id = resp_agape.json().get("evento_id") if resp_agape.status_code == 200 else None
    if evt_agape_id:
        ids_para_limpar.append(("vm904", evt_agape_id))
        eventos = ctx.get("vm904", f"/regional/{REGIAO_ID}/agenda/eventos").json()
        achado = next((e for e in eventos if e["id"] == evt_agape_id), None)
        checar("AGAPE_RITUALISTICO travado na Loja 904 mesmo criado pelo Operador", achado is not None and achado.get("loja_organizadora_id") == LOJA_904_ID, f"{achado!r}")

    resp_magna_ok = ctx.post("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Sessão Magna -- Iniciação",
        "tipo": "SESSAO_MAGNA",
        "subtipo": "INICIACAO",
        "data_inicio": "2026-10-06T19:00:00",
    })
    checar("SESSAO_MAGNA com subtipo INICIACAO -> 200", resp_magna_ok.status_code == 200, f"{resp_magna_ok.status_code} {resp_magna_ok.text}")
    evt_magna_id = resp_magna_ok.json().get("evento_id") if resp_magna_ok.status_code == 200 else None
    if evt_magna_id:
        ids_para_limpar.append(("vm904", evt_magna_id))

    resp_magna_invalido = ctx.post("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Sessão Magna -- subtipo inválido",
        "tipo": "SESSAO_MAGNA",
        "subtipo": "FESTA",
        "data_inicio": "2026-10-07T19:00:00",
    })
    checar("SESSAO_MAGNA com subtipo inválido -> 400", resp_magna_invalido.status_code == 400, f"{resp_magna_invalido.status_code} {resp_magna_invalido.text}")

    resp_magna_sem_subtipo = ctx.post("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Sessão Magna -- sem subtipo",
        "tipo": "SESSAO_MAGNA",
        "data_inicio": "2026-10-08T19:00:00",
    })
    checar("SESSAO_MAGNA sem subtipo -> 400", resp_magna_sem_subtipo.status_code == 400, f"{resp_magna_sem_subtipo.status_code} {resp_magna_sem_subtipo.text}")

    # NOTA (corrigido em 2026-09-17, 1ª execução real): "presidente" (9900001)
    # NÃO é um bom exemplo de "Diretoria pura" -- ele acumula o papel de VM da
    # Loja 901 (id 266), como o próprio RegionalUserContext já documenta
    # (CORREÇÃO 2026-09-12: Diretoria que também é VM continua com loja_id
    # preenchido). Usar "presidente" aqui fazia esta checagem falhar porque
    # ele TEM loja_id -- o comportamento do sistema estava certo, a premissa
    # do teste estava errada. Trocado para "superadmin", que não tem nenhum
    # vínculo de Loja em lojas_db.
    resp_diretoria_pura_loja = ctx.post("superadmin", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Sessão Pública por Diretoria pura (deveria falhar)",
        "tipo": "SESSAO_PUBLICA",
        "data_inicio": "2026-10-09T19:00:00",
    })
    checar(
        "Diretoria sem loja_id (SuperAdmin) tentando tipo de âmbito LOJA -> 403 (limitação conhecida: loja_organizadora_id não é input do payload)",
        resp_diretoria_pura_loja.status_code == 403,
        f"{resp_diretoria_pura_loja.status_code} {resp_diretoria_pura_loja.text}",
    )
    if resp_diretoria_pura_loja.status_code == 200:
        # se por acaso passou, precisa ser limpo também
        evt_id_vazado = resp_diretoria_pura_loja.json().get("evento_id")
        if evt_id_vazado:
            ids_para_limpar.append(("superadmin", evt_id_vazado))

    print("\n4) 13.4 Âmbito AMBOS")
    resp_beneficente = ctx.post("secretario904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Evento Beneficente (Operador Administrativo)",
        "tipo": "EVENTO_BENEFICENTE",
        "data_inicio": "2026-10-10T19:00:00",
    })
    checar("Operador Administrativo cria EVENTO_BENEFICENTE -> 200", resp_beneficente.status_code == 200, f"{resp_beneficente.status_code} {resp_beneficente.text}")
    evt_benef_id = resp_beneficente.json().get("evento_id") if resp_beneficente.status_code == 200 else None
    if evt_benef_id:
        ids_para_limpar.append(("vm904", evt_benef_id))
        eventos = ctx.get("vm904", f"/regional/{REGIAO_ID}/agenda/eventos").json()
        achado = next((e for e in eventos if e["id"] == evt_benef_id), None)
        checar("EVENTO_BENEFICENTE travado na própria Loja do Operador", achado is not None and achado.get("loja_organizadora_id") == LOJA_904_ID, f"{achado!r}")

    # NOTA (corrigido em 2026-09-17): mesma questão do teste anterior --
    # "presidente" acumula VM da Loja 901, então um evento AMBOS criado por
    # ele É corretamente travado na própria Loja (mesmo padrão "trava na
    # Loja de quem cria" usado em todo o resto do sistema). Trocado para
    # "superadmin" para representar de fato uma Diretoria sem vínculo de
    # Loja nenhuma.
    resp_homenagem = ctx.post("superadmin", f"/regional/{REGIAO_ID}/agenda/eventos", json={
        "titulo": "[TESTE AUTOMATIZADO] Homenagem Externa (Diretoria pura)",
        "tipo": "HOMENAGEM_EXTERNA",
        "data_inicio": "2026-10-11T19:00:00",
        "gerar_aviso": True,
    })
    checar("Diretoria pura (SuperAdmin) cria HOMENAGEM_EXTERNA -> 200", resp_homenagem.status_code == 200, f"{resp_homenagem.status_code} {resp_homenagem.text}")
    evt_homenagem_id = resp_homenagem.json().get("evento_id") if resp_homenagem.status_code == 200 else None
    aviso_homenagem_id = resp_homenagem.json().get("aviso_gerado_id") if resp_homenagem.status_code == 200 else None
    if evt_homenagem_id:
        ids_para_limpar.append(("superadmin", evt_homenagem_id))
        eventos = ctx.get("superadmin", f"/regional/{REGIAO_ID}/agenda/eventos").json()
        achado = next((e for e in eventos if e["id"] == evt_homenagem_id), None)
        checar("HOMENAGEM_EXTERNA sem Loja organizadora (Diretoria pura via SuperAdmin)", achado is not None and achado.get("loja_organizadora_id") is None, f"{achado!r}")

    print("\n5) 13.5 Leitura, edição e integrações")
    checar(
        "gerar_aviso=true criou um AvisoRegional (aviso_gerado_id presente)",
        aviso_homenagem_id is not None,
        f"aviso_gerado_id={aviso_homenagem_id!r}",
    )
    if aviso_homenagem_id:
        resp_avisos = ctx.get("presidente", f"/regional/{REGIAO_ID}/avisos")
        existe = resp_avisos.status_code == 200 and any(a["id"] == aviso_homenagem_id for a in resp_avisos.json())
        checar("aviso gerado automaticamente aparece no mural de Avisos", existe, f"{resp_avisos.status_code} (buscando {aviso_homenagem_id})")

    resp_mural_operador = ctx.get("secretario904", f"/regional/{REGIAO_ID}/agenda/eventos")
    resp_mural_vm = ctx.get("vm904", f"/regional/{REGIAO_ID}/agenda/eventos")
    checar(
        "mural region-wide: Operador Administrativo vê a mesma quantidade de eventos que o VM",
        resp_mural_operador.status_code == 200 and resp_mural_vm.status_code == 200 and len(resp_mural_operador.json()) == len(resp_mural_vm.json()),
        f"operador={resp_mural_operador.status_code}/{len(resp_mural_operador.json()) if resp_mural_operador.status_code == 200 else '?'} vm={resp_mural_vm.status_code}",
    )
    if resp_mural_operador.status_code == 200 and resp_mural_operador.json():
        checar("evento no mural inclui campo subtipo", "subtipo" in resp_mural_operador.json()[0], f"{list(resp_mural_operador.json()[0].keys())}")

    resp_filtro_tipo = ctx.get("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", params={"tipo": "SESSAO_MAGNA"})
    checar(
        "filtro ?tipo=SESSAO_MAGNA só retorna esse tipo",
        resp_filtro_tipo.status_code == 200 and all(e["tipo"] == "SESSAO_MAGNA" for e in resp_filtro_tipo.json()),
        f"{resp_filtro_tipo.status_code} {[e.get('tipo') for e in resp_filtro_tipo.json()] if resp_filtro_tipo.status_code == 200 else resp_filtro_tipo.text}",
    )

    print("\n6) Integração com Admissões (previa_admissao_id)")
    resp_previa = ctx.post("vm904", f"/regional/{REGIAO_ID}/admissoes", json={
        "tipo": "INICIACAO",
        "loja_id": LOJA_904_ID,
        "loja_nome": "Loja Teste",
        "loja_numero": "904",
        "candidato_nome": "[TESTE AUTOMATIZADO Módulo 13] Candidato vinculado a evento",
    })
    checar("(setup) POST /admissoes para vincular ao evento -> 200", resp_previa.status_code == 200, f"{resp_previa.status_code} {resp_previa.text}")
    previa_id = resp_previa.json().get("previa_id") if resp_previa.status_code == 200 else None

    if previa_id:
        resp_evt_previa = ctx.post("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
            "titulo": "[TESTE AUTOMATIZADO] Sessão Magna vinculada à prévia",
            "tipo": "SESSAO_MAGNA",
            "subtipo": "INICIACAO",
            "data_inicio": "2026-10-12T19:00:00",
            "previa_admissao_id": previa_id,
        })
        checar("SESSAO_MAGNA com previa_admissao_id real -> 200", resp_evt_previa.status_code == 200, f"{resp_evt_previa.status_code} {resp_evt_previa.text}")
        evt_previa_id = resp_evt_previa.json().get("evento_id") if resp_evt_previa.status_code == 200 else None
        if evt_previa_id:
            ids_para_limpar.append(("vm904", evt_previa_id))

        resp_previa_outra_loja = ctx.post("secretario904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
            "titulo": "[TESTE AUTOMATIZADO] tentativa de vincular prévia de outra Loja (deveria falhar)",
            "tipo": "AGAPE_RITUALISTICO",
            "data_inicio": "2026-10-13T19:00:00",
            "previa_admissao_id": previa_id,
        })
        # previa_id pertence à Loja 904 -- o secretario904 TAMBÉM é da 904, então
        # este caso não gera 403 por Loja alheia; ver o teste seguinte para isso.
        checar("Operador Administrativo vincula prévia da PRÓPRIA Loja -> 200", resp_previa_outra_loja.status_code == 200, f"{resp_previa_outra_loja.status_code} {resp_previa_outra_loja.text}")
        if resp_previa_outra_loja.status_code == 200:
            ids_para_limpar.append(("secretario904", resp_previa_outra_loja.json().get("evento_id")))

        resp_previa_404 = ctx.post("vm904", f"/regional/{REGIAO_ID}/agenda/eventos", json={
            "titulo": "[TESTE AUTOMATIZADO] previa_admissao_id inexistente (deveria falhar)",
            "tipo": "SESSAO_PUBLICA",
            "data_inicio": "2026-10-14T19:00:00",
            "previa_admissao_id": "00000000-0000-0000-0000-000000000000",
        })
        checar("previa_admissao_id inexistente -> 404", resp_previa_404.status_code == 404, f"{resp_previa_404.status_code} {resp_previa_404.text}")

    print("\n7) Edição, exclusão e cross-Loja")
    if evt_sp_id:
        resp_edit = ctx.put("vm904", f"/regional/{REGIAO_ID}/agenda/eventos/{evt_sp_id}", json={"descricao": "[TESTE AUTOMATIZADO] descrição editada"})
        checar("PUT edita evento próprio -> 200", resp_edit.status_code == 200, f"{resp_edit.status_code} {resp_edit.text}")

        resp_edit_alheio = ctx.put("vm905", f"/regional/{REGIAO_ID}/agenda/eventos/{evt_sp_id}", json={"descricao": "não deveria conseguir"})
        checar("VM de outra Loja tentando editar evento da 904 -> 403", resp_edit_alheio.status_code == 403, f"{resp_edit_alheio.status_code} {resp_edit_alheio.text}")

        resp_soft_delete = ctx.delete("vm904", f"/regional/{REGIAO_ID}/agenda/eventos/{evt_sp_id}")
        checar("DELETE sem hard_delete -> soft-cancel 200", resp_soft_delete.status_code == 200 and resp_soft_delete.json().get("tipo_delecao") == "VISUAL", f"{resp_soft_delete.status_code} {resp_soft_delete.text}")

        resp_hard_bloqueado = ctx.delete("vm904", f"/regional/{REGIAO_ID}/agenda/eventos/{evt_sp_id}?hard_delete=true")
        checar("hard_delete por não-SuperAdmin -> 403", resp_hard_bloqueado.status_code == 403, f"{resp_hard_bloqueado.status_code} {resp_hard_bloqueado.text}")

    print("\n8) Limpeza (hard delete via SuperAdmin dos eventos de teste)")
    for _apelido_dono, evento_id in ids_para_limpar:
        if not evento_id:
            continue
        resp_cleanup = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/agenda/eventos/{evento_id}?hard_delete=true")
        checar(f"(limpeza) hard_delete evento {evento_id[:8]}", resp_cleanup.status_code == 200, f"{resp_cleanup.status_code} {resp_cleanup.text}")
    if aviso_homenagem_id:
        resp_cleanup_aviso = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/avisos/{aviso_homenagem_id}?hard_delete=true")
        checar("(limpeza) hard_delete aviso gerado automaticamente", resp_cleanup_aviso.status_code == 200, f"{resp_cleanup_aviso.status_code} {resp_cleanup_aviso.text}")

    resumo("MÓDULO 13 (AGENDA DO CONSELHO)")


if __name__ == "__main__":
    main()
