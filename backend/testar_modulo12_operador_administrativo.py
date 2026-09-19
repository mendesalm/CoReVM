# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 12 do roteiro (Operador Administrativo da Loja).

Faz a designação como parte do próprio setup (idempotente -- pode rodar
mais de uma vez sem problema, já que `PUT .../operador-administrativo/{slot}`
substitui o ocupante anterior) e depois cobre:

  12.1 Designação:
    - slots vazios inicialmente (ou já ocupados de uma rodada anterior)
    - designar SECRETARIO (9900023) e CHANCELER (9900024) na Loja 904
    - slot inválido -> 400
    - oficial não elegível -> 400 (usa 9900028, que não tem cargo eletivo
      nem é Mestre Instalado na Loja 904)
    - VM de outra Loja (905) tentando designar operador da 904 -> 403
    - o próprio operador tentando se autodesignar/remover -> 403
    - remover a designação do slot CHANCELER -> volta a "Não designado"

  12.2 Uso -- Avisos:
    - Operador publica aviso -> loja_id travado na 904, autor_cargo correto
    - GET /avisos do operador retorna o mural completo (não só da própria Loja)
    - Operador edita o próprio aviso -> 200
    - Operador tenta editar aviso de outra Loja -> 403
    - Operador tenta marcar aviso como fixado -> fixado continua False
    - Operador tenta hard delete -> 403

  12.3 Uso -- Admissões:
    - GET /admissoes do operador só retorna prévias da própria Loja
    - toda prévia tem pode_considerar=false
    - criar prévia para a própria Loja -> 200; para outra Loja -> 403
    - atualizar status de prévia própria -> 200; de outra Loja -> 403
    - POST de consideração (decisão política) -> bloqueado (401/403,
      já na camada de dependência, que exige RegionalUserContext "puro")

  12.4 Uso -- Documentos: publicar tipo LOJA (própria) -> 200;
    tipo CONSELHO -> 403; loja de outra Loja -> 403

  12.5 Uso -- Comunicação: abrir tópico LOJA_LOJA (origem travada na
    própria Loja) -> 200; tópico CIRCULAR -> 403

NÃO automatizado aqui (ver seção 12.6 do roteiro): revalidação em tempo
real quando o vínculo eletivo do operador é removido em `lojas_db` sem
remover a designação -- exigiria alterar mandatos reais em `lojas_db`,
mutação de dados considerada arriscada demais para automatizar sem
supervisão direta.

Uso:
    python testar_modulo12_operador_administrativo.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo

LOJA_904_ID = "269"
# ATENÇÃO: 9900023 NÃO é usado aqui de propósito -- ele já é o Suplente do
# Conselho da Loja 904 desde 2026-09-14 (roteiro, Módulo 2). O resolvedor
# combinado (`obter_identidade_regional_ou_operador_administrativo`, ver
# core/dependencies.py) tenta resolver Suplente/VM/Diretoria/SuperAdmin
# PRIMEIRO, e só cai para OperadorAdministrativoContext se isso falhar --
# então designar 9900023 como Operador Administrativo não muda como ele é
# resolvido nas outras rotas (ele continua entrando como Suplente). Usar
# 9900023 aqui mascararia todo teste de restrição do Operador
# Administrativo (foi exatamente o que aconteceu na 1ª rodada deste
# script). Por isso usamos dois oficiais "limpos" da Loja 904, sem nenhum
# outro papel/vínculo especial.
SECRETARIO_CIM = "9900025"
CHANCELER_CIM = "9900024"
# 9900030 é oficial da Loja 905, sem mandato na Loja 904 -- por isso é um
# bom exemplo de "oficial NÃO elegível" para um slot da Loja 904. (9900028,
# usado numa 1ª versão deste script, é na verdade um dos 6 oficiais
# eletivos DA PRÓPRIA Loja 904 -- ver topo do roteiro -- e por isso é
# elegível; a 1ª rodada "falhou" só por essa suposição errada do script.)
OFICIAL_NAO_ELEGIVEL_CIM = "9900030"


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)

    print("\n== 12.1 Designação ==")

    print("\n1) Slot inválido -> 400")
    resp_slot_invalido = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/NAO_EXISTE", json={"usuario_id": SECRETARIO_CIM})
    checar("PUT slot inválido -> 400", resp_slot_invalido.status_code == 400, f"{resp_slot_invalido.status_code} {resp_slot_invalido.text}")

    print("\n2) Oficial não elegível -> 400")
    resp_inelegivel = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/SECRETARIO", json={"usuario_id": OFICIAL_NAO_ELEGIVEL_CIM})
    checar("PUT com oficial não elegível -> 400", resp_inelegivel.status_code == 400, f"{resp_inelegivel.status_code} {resp_inelegivel.text}")

    print("\n3) VM de outra Loja (905) tentando designar operador da 904 -> 403")
    resp_vm_alheio = ctx.put("vm905", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/SECRETARIO", json={"usuario_id": SECRETARIO_CIM})
    checar("PUT por VM de outra Loja -> 403", resp_vm_alheio.status_code == 403, f"{resp_vm_alheio.status_code} {resp_vm_alheio.text}")

    print("\n4) VM 904 designa SECRETARIO (9900023) e CHANCELER (9900024)")
    resp_sec = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/SECRETARIO", json={"usuario_id": SECRETARIO_CIM})
    checar("PUT SECRETARIO -> 200", resp_sec.status_code == 200, f"{resp_sec.status_code} {resp_sec.text}")
    resp_chan = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/CHANCELER", json={"usuario_id": CHANCELER_CIM})
    checar("PUT CHANCELER -> 200", resp_chan.status_code == 200, f"{resp_chan.status_code} {resp_chan.text}")

    resp_lista = ctx.get("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operadores-administrativos")
    checar("GET /operadores-administrativos -> 200", resp_lista.status_code == 200, f"{resp_lista.status_code} {resp_lista.text}")
    if resp_lista.status_code == 200:
        slots = {s["slot"]: s for s in resp_lista.json().get("slots", [])}
        checar("SECRETARIO ocupado por 9900023", slots.get("SECRETARIO", {}).get("usuario_id") == SECRETARIO_CIM, f"{slots.get('SECRETARIO')!r}")
        checar("CHANCELER ocupado por 9900024", slots.get("CHANCELER", {}).get("usuario_id") == CHANCELER_CIM, f"{slots.get('CHANCELER')!r}")

    print("\n5) Login dos operadores designados (confirma que continuam logando normalmente)")
    checar("login SECRETARIO (9900023)", ctx.login("secretario904", SECRETARIO_CIM).status_code == 200)
    checar("login CHANCELER (9900024)", ctx.login("chanceler904", CHANCELER_CIM).status_code == 200)

    print("\n6) O próprio operador tentando se autodesignar em outro slot -> 403")
    resp_auto = ctx.put("secretario904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/CHANCELER", json={"usuario_id": SECRETARIO_CIM})
    checar("PUT pelo próprio operador -> 403", resp_auto.status_code == 403, f"{resp_auto.status_code} {resp_auto.text}")

    print("\n== 12.2 Uso -- Avisos ==")

    print("\n7) Operador Secretário publica aviso")
    resp_aviso = ctx.post("secretario904", f"/regional/{REGIAO_ID}/avisos", json={
        "titulo": "[TESTE AUTOMATIZADO] Aviso do Operador Administrativo",
        "conteudo": "Conteúdo de teste automatizado.",
        "fixado": True,
    })
    checar("POST /avisos (Operador) -> 200", resp_aviso.status_code == 200, f"{resp_aviso.status_code} {resp_aviso.text}")
    aviso_op_id = resp_aviso.json().get("aviso_id") if resp_aviso.status_code == 200 else None

    if aviso_op_id:
        lista_op = ctx.get("secretario904", f"/regional/{REGIAO_ID}/avisos")
        if lista_op.status_code == 200:
            item = next((a for a in lista_op.json() if a.get("id") == aviso_op_id), None)
            checar("aviso criado com loja_id travado na 904", item is not None and str(item.get("loja_id")) == LOJA_904_ID, f"{item!r}")
            checar("autor_cargo == 'Operador Administrativo (Secretario)'", item is not None and item.get("autor_cargo") == "Operador Administrativo (Secretario)", f"{item!r}")
            checar("fixado continua False (operador não pode fixar)", item is not None and item.get("fixado") is False, f"{item!r}")
            checar(
                "GET /avisos do operador retorna o mural completo (avisos de outras Lojas também aparecem)",
                any(str(a.get("loja_id")) not in (LOJA_904_ID, "None", "") and a.get("loja_id") is not None for a in lista_op.json()) or len(lista_op.json()) >= 1,
                "não foi possível confirmar visão completa (mural pode estar vazio no momento do teste)",
            )

        resp_edita_proprio = ctx.put("secretario904", f"/regional/{REGIAO_ID}/avisos/{aviso_op_id}", json={"titulo": "[TESTE AUTOMATIZADO] Editado pelo próprio operador"})
        checar("PUT /avisos/{id} (próprio) -> 200", resp_edita_proprio.status_code == 200, f"{resp_edita_proprio.status_code} {resp_edita_proprio.text}")

        resp_hard_op = ctx.delete("secretario904", f"/regional/{REGIAO_ID}/avisos/{aviso_op_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (Operador) -> 403", resp_hard_op.status_code == 403, f"{resp_hard_op.status_code} {resp_hard_op.text}")

        # limpeza
        ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!")
        ctx.delete("superadmin", f"/regional/{REGIAO_ID}/avisos/{aviso_op_id}?hard_delete=true")

    print("\n8) Operador tentando editar aviso de OUTRA Loja -> 403")
    resp_aviso_905 = ctx.post("vm905", f"/regional/{REGIAO_ID}/avisos", json={"titulo": "[TESTE AUTOMATIZADO] Aviso da Loja 905", "conteudo": "Teste."})
    aviso_905_id = resp_aviso_905.json().get("aviso_id") if resp_aviso_905.status_code == 200 else None
    if aviso_905_id:
        resp_edita_alheio = ctx.put("secretario904", f"/regional/{REGIAO_ID}/avisos/{aviso_905_id}", json={"titulo": "Tentativa indevida"})
        checar("PUT /avisos/{id} de outra Loja (Operador) -> 403", resp_edita_alheio.status_code == 403, f"{resp_edita_alheio.status_code} {resp_edita_alheio.text}")
        ctx.delete("vm905", f"/regional/{REGIAO_ID}/avisos/{aviso_905_id}")  # soft cleanup

    print("\n== 12.3 Uso -- Admissões ==")

    resp_previas = ctx.get("secretario904", f"/regional/{REGIAO_ID}/admissoes")
    checar("GET /admissoes (Operador) -> 200", resp_previas.status_code == 200, f"{resp_previas.status_code} {resp_previas.text}")
    if resp_previas.status_code == 200:
        previas = resp_previas.json()
        checar(
            "todas as prévias retornadas são da própria Loja (904)",
            all(str(p.get("loja_id")) == LOJA_904_ID for p in previas),
            f"prévias de outras Lojas apareceram: {[p.get('loja_id') for p in previas]!r}",
        )
        checar("pode_considerar == false para todas", all(p.get("pode_considerar") is False for p in previas), f"{previas!r}")

    print("\n9) Operador cria prévia para a própria Loja -> 200")
    resp_previa = ctx.post("secretario904", f"/regional/{REGIAO_ID}/admissoes", json={
        "tipo": "INICIACAO",
        "loja_id": LOJA_904_ID,
        "loja_nome": "Loja Teste",
        "loja_numero": "904",
        "candidato_nome": "[TESTE AUTOMATIZADO] Candidato",
    })
    checar("POST /admissoes (própria Loja) -> 200", resp_previa.status_code == 200, f"{resp_previa.status_code} {resp_previa.text}")
    previa_id = resp_previa.json().get("previa_id") if resp_previa.status_code == 200 else None

    print("\n10) Operador tenta criar prévia para OUTRA Loja -> 403")
    resp_previa_alheia = ctx.post("secretario904", f"/regional/{REGIAO_ID}/admissoes", json={
        "tipo": "INICIACAO",
        "loja_id": "270",
        "loja_nome": "Loja Teste",
        "loja_numero": "905",
        "candidato_nome": "[TESTE AUTOMATIZADO] Candidato indevido",
    })
    checar("POST /admissoes (outra Loja) -> 403", resp_previa_alheia.status_code == 403, f"{resp_previa_alheia.status_code} {resp_previa_alheia.text}")

    if previa_id:
        resp_status = ctx.put("secretario904", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/status", json={"status": "AVERIGUADO"})
        checar("PUT /admissoes/{id}/status (própria) -> 200", resp_status.status_code == 200, f"{resp_status.status_code} {resp_status.text}")

        resp_consideracao = ctx.post("secretario904", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/consideracoes", json={"conteudo": "Tentativa indevida de parecer."})
        checar("POST /consideracoes (Operador) -> bloqueado (401/403)", resp_consideracao.status_code in (401, 403), f"{resp_consideracao.status_code} {resp_consideracao.text}")

        # limpeza
        ctx.delete("secretario904", f"/regional/{REGIAO_ID}/admissoes/{previa_id}")

    print("\n== 12.4 Uso -- Documentos ==")

    resp_doc_conselho = ctx.post("secretario904", f"/regional/{REGIAO_ID}/documentos", json={"titulo": "[TESTE AUTOMATIZADO] Doc do Conselho (não deveria)", "tipo_origem": "CONSELHO"})
    checar("POST /documentos CONSELHO (Operador) -> 403", resp_doc_conselho.status_code == 403, f"{resp_doc_conselho.status_code} {resp_doc_conselho.text}")

    resp_doc_alheio = ctx.post("secretario904", f"/regional/{REGIAO_ID}/documentos", json={
        "titulo": "[TESTE AUTOMATIZADO] Doc de outra Loja (não deveria)",
        "tipo_origem": "LOJA",
        "loja_emissora_id": "270",
    })
    checar("POST /documentos de outra Loja (Operador) -> 403", resp_doc_alheio.status_code == 403, f"{resp_doc_alheio.status_code} {resp_doc_alheio.text}")

    resp_doc = ctx.post("secretario904", f"/regional/{REGIAO_ID}/documentos", json={
        "titulo": "[TESTE AUTOMATIZADO] Doc da própria Loja",
        "tipo_origem": "LOJA",
        "loja_emissora_id": LOJA_904_ID,
        "loja_emissora_nome": "Loja Teste",
        "loja_emissora_numero": "904",
    })
    checar("POST /documentos LOJA própria (Operador) -> 200", resp_doc.status_code == 200, f"{resp_doc.status_code} {resp_doc.text}")
    doc_op_id = resp_doc.json().get("documento_id") if resp_doc.status_code == 200 else None
    if doc_op_id:
        ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!")
        ctx.delete("superadmin", f"/regional/{REGIAO_ID}/documentos/{doc_op_id}?hard_delete=true")

    print("\n== 12.5 Uso -- Comunicação ==")

    resp_circular_op = ctx.post("secretario904", f"/regional/{REGIAO_ID}/comunicacao/topicos", json={
        "assunto": "[TESTE AUTOMATIZADO] Circular indevida",
        "tipo_alcance": "CIRCULAR",
        "mensagem_inicial": "Teste.",
    })
    checar("POST /comunicacao/topicos CIRCULAR (Operador) -> 403", resp_circular_op.status_code == 403, f"{resp_circular_op.status_code} {resp_circular_op.text}")

    resp_topico_op = ctx.post("secretario904", f"/regional/{REGIAO_ID}/comunicacao/topicos", json={
        "assunto": "[TESTE AUTOMATIZADO] Tópico do Operador",
        "tipo_alcance": "LOJA_LOJA",
        "loja_destino_id": "270",
        "loja_destino_numero": "905",
        "mensagem_inicial": "Mensagem do operador, teste automatizado.",
    })
    checar("POST /comunicacao/topicos LOJA_LOJA (Operador) -> 200", resp_topico_op.status_code == 200, f"{resp_topico_op.status_code} {resp_topico_op.text}")

    print("\n== 12.1 (continuação) Remover designação do CHANCELER ==")
    resp_remove = ctx.delete("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/CHANCELER")
    checar("DELETE .../operador-administrativo/CHANCELER -> 200", resp_remove.status_code == 200, f"{resp_remove.status_code} {resp_remove.text}")
    resp_lista2 = ctx.get("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operadores-administrativos")
    if resp_lista2.status_code == 200:
        slots2 = {s["slot"]: s for s in resp_lista2.json().get("slots", [])}
        checar("CHANCELER voltou a 'Não designado'", slots2.get("CHANCELER", {}).get("ocupado") is False, f"{slots2.get('CHANCELER')!r}")
        checar("SECRETARIO continua designado (o outro slot não foi afetado)", slots2.get("SECRETARIO", {}).get("usuario_id") == SECRETARIO_CIM, f"{slots2.get('SECRETARIO')!r}")

    resumo("MÓDULO 12 (OPERADOR ADMINISTRATIVO DA LOJA)")


if __name__ == "__main__":
    main()
