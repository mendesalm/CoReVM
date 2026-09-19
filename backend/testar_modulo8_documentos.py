# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 8 do roteiro (Documentos).

Cobre via API:
  - VM comum tentando publicar documento tipo CONSELHO -> 403
  - VM publica documento tipo LOJA (com geração automática de PDF) -> 200
  - Editar metadados de documento próprio
  - VM de outra Loja tentando editar -> 403
  - Excluir (soft) e hard delete (só SuperAdmin)
  - Regressão do retrofit 2026-09-15 (roteiro, item "[NOVO 2026-09-15]"):
    confirma que VM/Diretoria continuam publicando/editando/excluindo
    documento exatamente como antes -- é isso que este script já exercita
    de ponta a ponta.

Uso:
    python testar_modulo8_documentos.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)
    checar("login SuperAdmin", ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!").status_code == 200)

    print("\n1) VM comum tentando publicar documento CONSELHO -> 403")
    resp_bloqueado = ctx.post("vm904", f"/regional/{REGIAO_ID}/documentos", json={
        "titulo": "[TESTE AUTOMATIZADO] Documento do Conselho (não deveria ser criado)",
        "tipo_origem": "CONSELHO",
    })
    checar("POST /documentos CONSELHO (VM comum) -> 403", resp_bloqueado.status_code == 403, f"{resp_bloqueado.status_code} {resp_bloqueado.text}")

    print("\n2) VM publica documento tipo LOJA")
    resp = ctx.post("vm904", f"/regional/{REGIAO_ID}/documentos", json={
        "titulo": "[TESTE AUTOMATIZADO] Ata de teste da Loja 904",
        "categoria": "ATA",
        "tipo_origem": "LOJA",
        "loja_emissora_id": "269",
        "loja_emissora_nome": "Loja Teste",
        "loja_emissora_numero": "904",
        "conteudo_texto": "Conteúdo de teste automatizado.",
    })
    checar("POST /documentos LOJA (VM 904) -> 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")
    doc_id = resp.json().get("documento_id") if resp.status_code == 200 else None

    if doc_id:
        print("\n3) Editar metadados do documento próprio")
        resp_put = ctx.put("vm904", f"/regional/{REGIAO_ID}/documentos/{doc_id}", json={
            "titulo": "[TESTE AUTOMATIZADO] Ata de teste da Loja 904 (revisada)",
            "categoria": "ATA",
            "tipo_origem": "LOJA",
            "visibilidade": "PUBLICO_CONSELHO",
        })
        checar("PUT /documentos/{id} (dono) -> 200", resp_put.status_code == 200, f"{resp_put.status_code} {resp_put.text}")

        print("\n4) VM de outra Loja tentando editar -> 403")
        resp_put_alheio = ctx.put("vm905", f"/regional/{REGIAO_ID}/documentos/{doc_id}", json={
            "titulo": "Tentativa indevida",
            "categoria": "ATA",
            "tipo_origem": "LOJA",
            "visibilidade": "PUBLICO_CONSELHO",
        })
        checar("PUT /documentos/{id} de outra Loja -> 403", resp_put_alheio.status_code == 403, f"{resp_put_alheio.status_code} {resp_put_alheio.text}")

        print("\n5) VM de outra Loja tentando excluir -> 403")
        resp_del_alheio = ctx.delete("vm905", f"/regional/{REGIAO_ID}/documentos/{doc_id}")
        checar("DELETE /documentos/{id} de outra Loja -> 403", resp_del_alheio.status_code == 403, f"{resp_del_alheio.status_code} {resp_del_alheio.text}")

        print("\n6) Excluir (soft) o documento pelo próprio dono")
        resp_soft = ctx.delete("vm904", f"/regional/{REGIAO_ID}/documentos/{doc_id}")
        checar("DELETE /documentos/{id} (soft) -> 200", resp_soft.status_code == 200 and resp_soft.json().get("tipo_delecao") == "VISUAL", f"{resp_soft.status_code} {resp_soft.text}")

        print("\n7) VM comum tentando hard delete -> 403")
        resp_hard_vm = ctx.delete("vm904", f"/regional/{REGIAO_ID}/documentos/{doc_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (VM comum) -> 403", resp_hard_vm.status_code == 403, f"{resp_hard_vm.status_code} {resp_hard_vm.text}")

        print("\n8) SuperAdmin faz o hard delete de limpeza")
        resp_hard = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/documentos/{doc_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (SuperAdmin, limpeza) -> 200", resp_hard.status_code == 200 and resp_hard.json().get("tipo_delecao") == "FISICA", f"{resp_hard.status_code} {resp_hard.text}")

    resumo("MÓDULO 8 (DOCUMENTOS)")


if __name__ == "__main__":
    main()
