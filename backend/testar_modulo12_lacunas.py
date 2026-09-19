# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- lacunas automatizáveis do Módulo 12 do roteiro
(Operador Administrativo da Loja), identificadas na auditoria de
2026-09-17 de todos os itens `[ ]` pendentes do roteiro.

Complementa `testar_modulo12_operador_administrativo.py` (que já cobriu o
essencial de designação e uso básico em Avisos/Admissões/Documentos/
Comunicação) com os itens do roteiro ainda sem teste:

  185 -- mesma pessoa designada em 2 slots ao mesmo tempo (observacional)
  187 -- elegibilidade por "Mestre Instalado" sem cargo eletivo (observacional
         -- só roda se existir um candidato elegível nos dados de teste)
  210 -- Operador tentando alterar status de prévia de OUTRA Loja -> 403
  211 -- Operador lendo considerações de prévia própria (200) e de outra
         Loja (403)
  213 -- Operador excluindo (soft) prévia da própria Loja -> 200,
         tipo_delecao == "VISUAL"
  220 -- GET /documentos do Operador filtra RESTRITO_DIRETORIA de outra
         Loja, mas mostra o da própria
  221 -- Operador edita documento próprio (200) e tenta editar/excluir
         documento de outra Loja (403)
  225 -- GET /comunicacao/topicos do Operador só retorna CIRCULAR + tópicos
         que envolvem a própria Loja
  228 -- Operador responde e altera status de tópico que envolve a própria
         Loja -> 200
  233 -- vazamento zero agregado (nenhum recurso de outra Loja aparece em
         nenhuma das listagens acima)
  234 -- bloqueio 403 em rotas fora do escopo do Operador: Suplente,
         Transmissão Emergencial de VM, Patrimônio, Votação

NÃO automatizado aqui (roteiro 12.6, item 232): revalidação em tempo real
ao perder vínculo eletivo -- exigiria mutar mandatos reais em `lojas_db`,
considerado arriscado demais para automatizar sem supervisão direta
(mesma política já aplicada nos módulos anteriores).

PRÉ-REQUISITO: `testar_modulo12_operador_administrativo.py` já deve ter
rodado ao menos uma vez (ou este script assume que pode designar os slots
do zero -- a designação aqui é idempotente, como no script original).

Uso:
    python testar_modulo12_lacunas.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo

LOJA_904_ID = "269"
LOJA_905_ID = "270"
SECRETARIO_CIM = "9900025"
CHANCELER_CIM = "9900024"

SENHA_SUPERADMIN = "Ceres@2026Teste!"


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)
    checar("login SuperAdmin", ctx.login("superadmin", "sistema@e-sigma.app", SENHA_SUPERADMIN).status_code == 200)

    print("\n1) (Re)designar SECRETARIO/CHANCELER na Loja 904 (idempotente)")
    resp_sec = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/SECRETARIO", json={"usuario_id": SECRETARIO_CIM})
    checar("PUT SECRETARIO -> 200", resp_sec.status_code == 200, f"{resp_sec.status_code} {resp_sec.text}")
    resp_chan = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/CHANCELER", json={"usuario_id": CHANCELER_CIM})
    checar("PUT CHANCELER -> 200", resp_chan.status_code == 200, f"{resp_chan.status_code} {resp_chan.text}")
    checar("login SECRETARIO (9900025)", ctx.login("secretario904", SECRETARIO_CIM).status_code == 200)

    print("\n== 12.1 (item 185) mesma pessoa em 2 slots simultaneamente (observacional) ==")
    resp_dup = ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/CHANCELER", json={"usuario_id": SECRETARIO_CIM})
    print(f"  [OBS] PUT CHANCELER com o mesmo usuário do SECRETARIO -> {resp_dup.status_code} {resp_dup.text}")
    print("  (roteiro não define o comportamento esperado -- item observacional, não é pass/fail)")
    # devolve o CHANCELER ao ocupante original, para não afetar os testes seguintes
    ctx.put("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/operador-administrativo/CHANCELER", json={"usuario_id": CHANCELER_CIM})

    print("\n== 12.1 (item 187) elegibilidade por 'Mestre Instalado' sem cargo eletivo ==")
    resp_oficiais = ctx.get("vm904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/oficiais")
    checar("GET /oficiais -> 200", resp_oficiais.status_code == 200, f"{resp_oficiais.status_code} {resp_oficiais.text}")
    if resp_oficiais.status_code == 200:
        oficiais = resp_oficiais.json().get("oficiais", [])
        print(f"  [OBS] /oficiais retorna só os 6 cargos eletivos (endpoint usado para Suplente, não para Operador Administrativo);"
              f" {len(oficiais)} oficial(is) elegível(is) encontrados -- endpoint não expõe 'Mestre Instalado' sem cargo eletivo separadamente.")
        print("  (item requer dado de teste específico -- não fabricado aqui; ver roteiro para teste manual dirigido caso necessário)")

    print("\n== 12.3 (itens 210, 211, 213) Admissões -- prévia de outra Loja ==")

    print("\n2) VM 905 cria prévia de teste na própria Loja")
    resp_previa_905 = ctx.post("vm905", f"/regional/{REGIAO_ID}/admissoes", json={
        "tipo": "INICIACAO",
        "loja_id": LOJA_905_ID,
        "loja_nome": "Loja Teste 905",
        "loja_numero": "905",
        "candidato_nome": "[TESTE AUTOMATIZADO] Candidato Loja 905",
    })
    checar("POST /admissoes (VM905, própria Loja) -> 200", resp_previa_905.status_code == 200, f"{resp_previa_905.status_code} {resp_previa_905.text}")
    previa_905_id = resp_previa_905.json().get("previa_id") if resp_previa_905.status_code == 200 else None

    print("\n3) SECRETARIO 904 cria prévia de teste na própria Loja")
    resp_previa_904 = ctx.post("secretario904", f"/regional/{REGIAO_ID}/admissoes", json={
        "tipo": "INICIACAO",
        "loja_id": LOJA_904_ID,
        "loja_nome": "Loja Teste 904",
        "loja_numero": "904",
        "candidato_nome": "[TESTE AUTOMATIZADO] Candidato Loja 904 (lacunas)",
    })
    checar("POST /admissoes (Operador, própria Loja) -> 200", resp_previa_904.status_code == 200, f"{resp_previa_904.status_code} {resp_previa_904.text}")
    previa_904_id = resp_previa_904.json().get("previa_id") if resp_previa_904.status_code == 200 else None

    if previa_905_id:
        print("\n4) (item 210) Operador 904 tenta alterar status de prévia da Loja 905 -> 403")
        resp_status_alheio = ctx.put("secretario904", f"/regional/{REGIAO_ID}/admissoes/{previa_905_id}/status", json={"status": "AVERIGUADO"})
        checar("PUT /status de prévia de outra Loja (Operador) -> 403", resp_status_alheio.status_code == 403, f"{resp_status_alheio.status_code} {resp_status_alheio.text}")

        print("\n5) (item 211) Operador 904 tenta LER considerações de prévia da Loja 905 -> 403")
        resp_consid_alheio = ctx.get("secretario904", f"/regional/{REGIAO_ID}/admissoes/{previa_905_id}/consideracoes")
        checar("GET /consideracoes de prévia de outra Loja (Operador) -> 403", resp_consid_alheio.status_code == 403, f"{resp_consid_alheio.status_code} {resp_consid_alheio.text}")

    if previa_904_id:
        print("\n6) (item 211) Operador 904 lê considerações da PRÓPRIA prévia -> 200")
        resp_consid_proprio = ctx.get("secretario904", f"/regional/{REGIAO_ID}/admissoes/{previa_904_id}/consideracoes")
        checar("GET /consideracoes de prévia própria (Operador) -> 200", resp_consid_proprio.status_code == 200, f"{resp_consid_proprio.status_code} {resp_consid_proprio.text}")

        print("\n7) (item 213) Operador 904 exclui (soft) a PRÓPRIA prévia -> 200, tipo_delecao == VISUAL")
        resp_excluir_proprio = ctx.delete("secretario904", f"/regional/{REGIAO_ID}/admissoes/{previa_904_id}")
        checar("DELETE prévia própria (Operador) -> 200", resp_excluir_proprio.status_code == 200, f"{resp_excluir_proprio.status_code} {resp_excluir_proprio.text}")
        if resp_excluir_proprio.status_code == 200:
            checar("tipo_delecao == 'VISUAL' (soft delete)", resp_excluir_proprio.json().get("tipo_delecao") == "VISUAL", f"{resp_excluir_proprio.json()!r}")

    # limpeza
    if previa_905_id:
        ctx.delete("superadmin", f"/regional/{REGIAO_ID}/admissoes/{previa_905_id}?hard_delete=true")
    if previa_904_id:
        ctx.delete("superadmin", f"/regional/{REGIAO_ID}/admissoes/{previa_904_id}?hard_delete=true")

    print("\n== 12.4 (itens 220, 221) Documentos -- RESTRITO_DIRETORIA e edição/exclusão entre Lojas ==")

    print("\n8) VM 905 publica documento RESTRITO_DIRETORIA da própria Loja")
    resp_doc_905 = ctx.post("vm905", f"/regional/{REGIAO_ID}/documentos", json={
        "titulo": "[TESTE AUTOMATIZADO] Doc restrito Loja 905",
        "tipo_origem": "LOJA",
        "loja_emissora_id": LOJA_905_ID,
        "loja_emissora_nome": "Loja Teste 905",
        "loja_emissora_numero": "905",
        "visibilidade": "RESTRITO_DIRETORIA",
    })
    checar("POST /documentos RESTRITO (VM905) -> 200", resp_doc_905.status_code == 200, f"{resp_doc_905.status_code} {resp_doc_905.text}")
    doc_905_id = resp_doc_905.json().get("documento_id") if resp_doc_905.status_code == 200 else None

    print("\n9) Operador 904 publica documento RESTRITO_DIRETORIA da própria Loja")
    resp_doc_904 = ctx.post("secretario904", f"/regional/{REGIAO_ID}/documentos", json={
        "titulo": "[TESTE AUTOMATIZADO] Doc restrito Loja 904",
        "tipo_origem": "LOJA",
        "loja_emissora_id": LOJA_904_ID,
        "loja_emissora_nome": "Loja Teste 904",
        "loja_emissora_numero": "904",
        "visibilidade": "RESTRITO_DIRETORIA",
    })
    checar("POST /documentos RESTRITO (Operador, própria Loja) -> 200", resp_doc_904.status_code == 200, f"{resp_doc_904.status_code} {resp_doc_904.text}")
    doc_904_id = resp_doc_904.json().get("documento_id") if resp_doc_904.status_code == 200 else None

    print("\n10) (item 220) GET /documentos do Operador 904 -- confirma filtro")
    resp_lista_docs = ctx.get("secretario904", f"/regional/{REGIAO_ID}/documentos")
    checar("GET /documentos (Operador) -> 200", resp_lista_docs.status_code == 200, f"{resp_lista_docs.status_code} {resp_lista_docs.text}")
    if resp_lista_docs.status_code == 200:
        ids_vistos = {d.get("id") or d.get("documento_id") for d in resp_lista_docs.json()}
        checar("doc RESTRITO da própria Loja (904) aparece na listagem", doc_904_id in ids_vistos, f"ids vistos: {ids_vistos!r}")
        checar("(item 233) doc RESTRITO de OUTRA Loja (905) NÃO aparece na listagem", doc_905_id not in ids_vistos, f"ids vistos: {ids_vistos!r}")

    if doc_904_id:
        print("\n11) (item 221) Operador edita o próprio documento -> 200")
        resp_edita_proprio_doc = ctx.put("secretario904", f"/regional/{REGIAO_ID}/documentos/{doc_904_id}", json={"titulo": "[TESTE AUTOMATIZADO] Doc restrito Loja 904 (editado)"})
        checar("PUT /documentos/{id} próprio (Operador) -> 200", resp_edita_proprio_doc.status_code == 200, f"{resp_edita_proprio_doc.status_code} {resp_edita_proprio_doc.text}")

    if doc_905_id:
        print("\n12) (item 221) Operador tenta editar/excluir documento de OUTRA Loja -> 403")
        resp_edita_alheio_doc = ctx.put("secretario904", f"/regional/{REGIAO_ID}/documentos/{doc_905_id}", json={"titulo": "Tentativa indevida"})
        checar("PUT /documentos/{id} de outra Loja (Operador) -> 403", resp_edita_alheio_doc.status_code == 403, f"{resp_edita_alheio_doc.status_code} {resp_edita_alheio_doc.text}")
        resp_exclui_alheio_doc = ctx.delete("secretario904", f"/regional/{REGIAO_ID}/documentos/{doc_905_id}")
        checar("DELETE /documentos/{id} de outra Loja (Operador) -> 403", resp_exclui_alheio_doc.status_code == 403, f"{resp_exclui_alheio_doc.status_code} {resp_exclui_alheio_doc.text}")

    # limpeza
    if doc_904_id:
        ctx.delete("superadmin", f"/regional/{REGIAO_ID}/documentos/{doc_904_id}?hard_delete=true")
    if doc_905_id:
        ctx.delete("superadmin", f"/regional/{REGIAO_ID}/documentos/{doc_905_id}?hard_delete=true")

    print("\n== 12.5 (itens 225, 228) Comunicação -- filtro de tópicos e resposta/status ==")

    print("\n13) SECRETARIO 904 abre tópico LOJA_LOJA (904 <-> 905)")
    resp_topico = ctx.post("secretario904", f"/regional/{REGIAO_ID}/comunicacao/topicos", json={
        "assunto": "[TESTE AUTOMATIZADO] Tópico lacunas 904<->905",
        "tipo_alcance": "LOJA_LOJA",
        "loja_destino_id": LOJA_905_ID,
        "loja_destino_numero": "905",
        "mensagem_inicial": "Mensagem inicial de teste (lacunas Módulo 12).",
    })
    checar("POST /comunicacao/topicos LOJA_LOJA (Operador) -> 200", resp_topico.status_code == 200, f"{resp_topico.status_code} {resp_topico.text}")
    topico_id = resp_topico.json().get("topico_id") if resp_topico.status_code == 200 else None

    print("\n14) (item 225) GET /comunicacao/topicos do Operador 904 -- confirma filtro")
    resp_lista_topicos = ctx.get("secretario904", f"/regional/{REGIAO_ID}/comunicacao/topicos")
    checar("GET /comunicacao/topicos (Operador) -> 200", resp_lista_topicos.status_code == 200, f"{resp_lista_topicos.status_code} {resp_lista_topicos.text}")
    if resp_lista_topicos.status_code == 200:
        topicos = resp_lista_topicos.json()
        todos_ok = all(
            t.get("tipo_alcance") == "CIRCULAR"
            or str(t.get("loja_origem_id")) == LOJA_904_ID
            or str(t.get("loja_destino_id")) == LOJA_904_ID
            for t in topicos
        )
        checar(
            "(item 225/233) todo tópico retornado é CIRCULAR ou envolve a própria Loja (904) -- zero vazamento",
            todos_ok,
            f"tópico(s) fora do escopo esperado: {[t for t in topicos if not (t.get('tipo_alcance') == 'CIRCULAR' or str(t.get('loja_origem_id')) == LOJA_904_ID or str(t.get('loja_destino_id')) == LOJA_904_ID)]!r}",
        )
        ids_topicos_vistos = {t.get("id") for t in topicos}
        checar("tópico recém-criado (904<->905) aparece na listagem do Operador", topico_id in ids_topicos_vistos, f"ids vistos: {ids_topicos_vistos!r}")

    if topico_id:
        print("\n15) (item 228) Operador 904 responde ao próprio tópico -> 200")
        resp_msg = ctx.post("secretario904", f"/regional/{REGIAO_ID}/comunicacao/topicos/{topico_id}/mensagens", json={"conteudo": "[TESTE AUTOMATIZADO] Resposta do Operador."})
        checar("POST /mensagens em tópico próprio (Operador) -> 200", resp_msg.status_code == 200, f"{resp_msg.status_code} {resp_msg.text}")

        print("\n16) (item 228) Operador 904 altera status do próprio tópico -> 200")
        resp_status_topico = ctx.put("secretario904", f"/regional/{REGIAO_ID}/comunicacao/topicos/{topico_id}/status", json={"status": "RESPONDIDA"})
        checar("PUT /status em tópico próprio (Operador) -> 200", resp_status_topico.status_code == 200, f"{resp_status_topico.status_code} {resp_status_topico.text}")

        print("\n  [OBS] item 225/228 (negativo): testar resposta/status de um tópico que NÃO envolve a Loja 904 exigiria")
        print("  um 3º par de Lojas isolado (mesma limitação já documentada no Módulo 9) -- não fabricado aqui.")

    print("\n== 12.6 (item 234) bloqueio 403 em rotas fora do escopo do Operador Administrativo ==")

    print("\n17) Operador tenta designar Suplente do Conselho -> 403")
    resp_suplente = ctx.put("secretario904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/suplente", json={"usuario_id": CHANCELER_CIM})
    checar("PUT /suplente (Operador) -> 403", resp_suplente.status_code == 403, f"{resp_suplente.status_code} {resp_suplente.text}")

    print("\n18) Operador tenta conceder Transmissão de Cargo Emergencial de VM -> 403")
    resp_transmissao = ctx.post("secretario904", f"/regional/{REGIAO_ID}/lojas/{LOJA_904_ID}/transmissao-emergencial/conceder")
    checar("POST /transmissao-emergencial/conceder (Operador) -> 403", resp_transmissao.status_code == 403, f"{resp_transmissao.status_code} {resp_transmissao.text}")

    print("\n19) Operador tenta cadastrar item de Patrimônio -> 403")
    resp_patrimonio = ctx.post("secretario904", f"/regional/{REGIAO_ID}/patrimonio/itens", json={"nome": "[TESTE AUTOMATIZADO] Item indevido"})
    checar("POST /patrimonio/itens (Operador) -> 403", resp_patrimonio.status_code == 403, f"{resp_patrimonio.status_code} {resp_patrimonio.text}")

    print("\n20) Operador tenta criar Votação Regional -> 403")
    resp_votacao = ctx.post("secretario904", f"/regional/{REGIAO_ID}/votacoes", json={"titulo": "[TESTE AUTOMATIZADO] Votação indevida", "descricao": "Teste."})
    checar("POST /votacoes (Operador) -> 403", resp_votacao.status_code == 403, f"{resp_votacao.status_code} {resp_votacao.text}")

    resumo("MÓDULO 12 -- LACUNAS AUTOMATIZÁVEIS")


if __name__ == "__main__":
    main()
