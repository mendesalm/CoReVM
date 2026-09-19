# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 11 do roteiro (Resiliência do Core --
Reconciliação Diretoria×Lojas), parte segura/não-destrutiva.

Cobre via API:
  - VM comum tentando chamar /diretoria/discrepancias ou
    /diretoria/reconciliar-agora -> 403 (ambas exigem Diretoria/SuperAdmin)
  - Diretoria dispara a reconciliação sob demanda -> 200, valida o formato
    da resposta ({"lojas_verificadas", "divergencias_novas",
    "regularizacoes", "erros"})
  - Diretoria lê /diretoria/discrepancias -> 200, valida o formato da
    resposta ({"veneraveis_divergentes", "suplentes_com_vinculo_invalido"})
  - Rodar a reconciliação de novo sem mudar nada -> ainda 200 e sem erro
    (idempotência básica; não verifica se e-mail deixou de disparar -- ver
    abaixo)

NÃO automatizado aqui (ver checklist completo no roteiro, seção 11): toda
a simulação de estado (Loja ficando órfã de VM, Suplente perdendo o cargo
eletivo, caso OVERRIDE_CONSELHO, verificação de que o e-mail de alerta só
dispara na transição de estado) exige mutar de propósito o cadastro de
lojas_db (VM/mandatos reais) para forçar uma divergência -- e depois
desfazer essa mutação com cuidado para não deixar dados de teste
corrompidos. É uma mutação de estado ampla demais para automatizar sem
supervisão direta; ver checklist funcional do roteiro para o passo a
passo manual.

Uso:
    python testar_modulo11_resiliencia.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)

    print("\n1) VM comum tentando ler /diretoria/discrepancias -> 403")
    resp_disc_bloqueado = ctx.get("vm904", f"/regional/{REGIAO_ID}/diretoria/discrepancias")
    checar("GET /diretoria/discrepancias (VM comum) -> 403", resp_disc_bloqueado.status_code == 403, f"{resp_disc_bloqueado.status_code} {resp_disc_bloqueado.text}")

    print("\n2) VM comum tentando disparar /diretoria/reconciliar-agora -> 403")
    resp_reconc_bloqueado = ctx.post("vm904", f"/regional/{REGIAO_ID}/diretoria/reconciliar-agora")
    checar("POST /diretoria/reconciliar-agora (VM comum) -> 403", resp_reconc_bloqueado.status_code == 403, f"{resp_reconc_bloqueado.status_code} {resp_reconc_bloqueado.text}")

    print("\n3) Diretoria dispara a reconciliação sob demanda")
    resp_reconc = ctx.post("presidente", f"/regional/{REGIAO_ID}/diretoria/reconciliar-agora")
    checar("POST /diretoria/reconciliar-agora (Diretoria) -> 200", resp_reconc.status_code == 200, f"{resp_reconc.status_code} {resp_reconc.text}")
    if resp_reconc.status_code == 200:
        corpo = resp_reconc.json()
        chaves_esperadas = {"lojas_verificadas", "divergencias_novas", "regularizacoes", "erros"}
        checar(
            "resposta contém as 4 chaves esperadas",
            chaves_esperadas.issubset(corpo.keys()),
            f"chaves presentes: {list(corpo.keys())!r}",
        )

    print("\n4) Diretoria lê /diretoria/discrepancias")
    resp_disc = ctx.get("presidente", f"/regional/{REGIAO_ID}/diretoria/discrepancias")
    checar("GET /diretoria/discrepancias (Diretoria) -> 200", resp_disc.status_code == 200, f"{resp_disc.status_code} {resp_disc.text}")
    if resp_disc.status_code == 200:
        corpo_disc = resp_disc.json()
        checar(
            "resposta contém 'veneraveis_divergentes' e 'suplentes_com_vinculo_invalido'",
            "veneraveis_divergentes" in corpo_disc and "suplentes_com_vinculo_invalido" in corpo_disc,
            f"chaves presentes: {list(corpo_disc.keys())!r}",
        )
        checar(
            "nenhuma Loja jurisdicionada aparece como divergente no estado atual (dados corrigidos nesta sessão)",
            len(corpo_disc.get("veneraveis_divergentes", [])) == 0,
            f"divergências encontradas: {corpo_disc.get('veneraveis_divergentes')!r} -- pode ser esperado se algum teste manual de órfão ficou sem reverter",
        )

    print("\n5) Rodar de novo sem mudar nada -- ainda 200 (idempotência básica)")
    resp_reconc2 = ctx.post("presidente", f"/regional/{REGIAO_ID}/diretoria/reconciliar-agora")
    checar("2ª chamada a /reconciliar-agora -> 200", resp_reconc2.status_code == 200, f"{resp_reconc2.status_code} {resp_reconc2.text}")

    resumo("MÓDULO 11 (RESILIÊNCIA -- RECONCILIAÇÃO DIRETORIA×LOJAS)")


if __name__ == "__main__":
    main()
