# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 5 do roteiro (Admissões / Prévias), papéis
"antigos" (VM, Suplente, Diretoria) -- o Operador Administrativo já tem
seu próprio teste dedicado em testar_modulo12_operador_administrativo.py
(seção 12.3).

Cobre via API:
  - Criar prévia com geração automática de PDF (JSON, sem upload)
  - Criar prévia via upload de arquivo PDF
  - Adicionar considerações incrementais (mais de uma, ordem cronológica)
  - Atualizar status de verificação da prévia (EM_ANDAMENTO -> AVERIGUADO -> CONCLUIDO)
  - VM de OUTRA Loja também pode ver/considerar (peer review não é restrito
    para papéis antigos -- diferente do Operador Administrativo)
  - Excluir (soft) e, por fim, hard delete via SuperAdmin (limpeza)

Uso:
    python testar_modulo5_admissoes.py
"""
import io

from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)
    checar("login SuperAdmin", ctx.login("superadmin", "sistema@e-sigma.app", "Ceres@2026Teste!").status_code == 200)

    print("\n1) Criar prévia com geração automática de PDF (JSON)")
    resp = ctx.post("vm904", f"/regional/{REGIAO_ID}/admissoes", json={
        "tipo": "INICIACAO",
        "loja_id": "269",
        "loja_nome": "Loja Teste",
        "loja_numero": "904",
        "candidato_nome": "[TESTE AUTOMATIZADO] Candidato PDF automático",
    })
    checar("POST /admissoes (JSON) -> 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")
    previa_id = resp.json().get("previa_id") if resp.status_code == 200 else None

    if previa_id:
        resp_pdf = ctx.get("vm904", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/pdf")
        checar("GET /admissoes/{id}/pdf (PDF gerado automaticamente) -> 200", resp_pdf.status_code == 200, f"{resp_pdf.status_code}")

        print("\n2) Adicionar 2 considerações incrementais (Loja 905 e Diretoria)")
        resp_c1 = ctx.post("vm905", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/consideracoes", json={"conteudo": "[TESTE AUTOMATIZADO] Parecer da Loja 905."})
        checar("POST /consideracoes (VM de outra Loja) -> 200 (peer review não é restrito)", resp_c1.status_code == 200, f"{resp_c1.status_code} {resp_c1.text}")
        resp_c2 = ctx.post("presidente", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/consideracoes", json={"conteudo": "[TESTE AUTOMATIZADO] Parecer da Mesa Diretora."})
        checar("POST /consideracoes (Diretoria) -> 200", resp_c2.status_code == 200, f"{resp_c2.status_code} {resp_c2.text}")

        resp_lista_cons = ctx.get("vm904", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/consideracoes")
        checar("GET /consideracoes -> 200", resp_lista_cons.status_code == 200, f"{resp_lista_cons.status_code} {resp_lista_cons.text}")
        if resp_lista_cons.status_code == 200:
            cons = resp_lista_cons.json()
            checar("ordem cronológica (2 considerações, mais antiga primeiro)", len(cons) >= 2 and cons[0]["data_criacao"] <= cons[1]["data_criacao"], f"{cons!r}")

        print("\n3) Atualizar status: EM_ANDAMENTO -> AVERIGUADO -> CONCLUIDO")
        resp_status1 = ctx.put("vm904", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/status", json={"status": "AVERIGUADO"})
        checar("PUT /status AVERIGUADO -> 200", resp_status1.status_code == 200 and resp_status1.json().get("verificado_por_nome") is not None, f"{resp_status1.status_code} {resp_status1.text}")
        resp_status2 = ctx.put("presidente", f"/regional/{REGIAO_ID}/admissoes/{previa_id}/status", json={"status": "CONCLUIDO"})
        checar("PUT /status CONCLUIDO (Diretoria) -> 200", resp_status2.status_code == 200, f"{resp_status2.status_code} {resp_status2.text}")

        print("\n4) Excluir (soft) a prévia pelo autor")
        resp_soft = ctx.delete("vm904", f"/regional/{REGIAO_ID}/admissoes/{previa_id}")
        checar("DELETE /admissoes/{id} (soft) -> 200", resp_soft.status_code == 200 and resp_soft.json().get("tipo_delecao") == "VISUAL", f"{resp_soft.status_code} {resp_soft.text}")

        print("\n5) SuperAdmin faz o hard delete de limpeza")
        resp_hard = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/admissoes/{previa_id}?hard_delete=true")
        checar("DELETE ?hard_delete=true (SuperAdmin, limpeza) -> 200", resp_hard.status_code == 200 and resp_hard.json().get("tipo_delecao") == "FISICA", f"{resp_hard.status_code} {resp_hard.text}")

    print("\n6) Criar prévia via upload de arquivo PDF")
    pdf_falso = io.BytesIO(b"%PDF-1.4 conteudo de teste automatizado")
    resp_upload = ctx.post(
        "vm904",
        f"/regional/{REGIAO_ID}/admissoes/upload",
        data={
            "tipo": "FILIACAO",
            "loja_id": "269",
            "loja_nome": "Loja Teste",
            "loja_numero": "904",
            "candidato_nome": "[TESTE AUTOMATIZADO] Candidato via upload",
        },
        files={"arquivo": ("teste.pdf", pdf_falso, "application/pdf")},
    )
    checar("POST /admissoes/upload -> 200", resp_upload.status_code == 200, f"{resp_upload.status_code} {resp_upload.text}")
    previa_upload_id = resp_upload.json().get("previa_id") if resp_upload.status_code == 200 else None
    if previa_upload_id:
        resp_hard_upload = ctx.delete("superadmin", f"/regional/{REGIAO_ID}/admissoes/{previa_upload_id}?hard_delete=true")
        checar("limpeza da prévia via upload -> 200", resp_hard_upload.status_code == 200, f"{resp_hard_upload.status_code} {resp_hard_upload.text}")

    resumo("MÓDULO 5 (ADMISSÕES -- PAPÉIS ANTIGOS)")


if __name__ == "__main__":
    main()
