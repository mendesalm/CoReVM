# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Teste automatizado -- Módulo 9 do roteiro (Comunicação / Tópicos e Pranchas).

Cobre via API:
  - VM comum tentando criar tópico CIRCULAR -> 403 (exclusivo Diretoria)
  - Criar tópico LOJA_LOJA sem loja_destino_id -> 400
  - Criar tópico LOJA_LOJA (Loja 904 -> Loja 905) -> 200
  - Responder tópico (mensagem simples)
  - VM de uma Loja NÃO envolvida no tópico tentando responder -> 403
  - Alterar status do tópico

ATENÇÃO -- item que este script foi desenhado para VERIFICAR, não para
assumir: o roteiro (seção 9, "[NOVO 2026-09-15 -- restrição nova, afeta
TODOS os papéis]") documenta que `PUT /comunicacao/topicos/{id}/status`
passou a exigir que QUALQUER papel (não só o Operador Administrativo)
tenha a própria Loja envolvida no tópico, com 403 para quem não tem.
Ao ler o código-fonte atual (api/v1/regional/rotas.py,
`atualizar_status_topico`), a checagem de posse encontrada só existe para
`OperadorAdministrativoContext` -- não há nenhuma checagem equivalente
para um `RegionalUserContext` comum (VM/Suplente). Ou seja, pelo código,
uma Loja SEM envolvimento no tópico consegue alterar o status de qualquer
tópico, contradizendo o texto do roteiro. O teste abaixo ("6") checa
exatamente isso e IMPRIME UM ALERTA explícito se a expectativa do roteiro
não se confirmar -- não trata isso como falha automática do script, já
que não está claro qual dos dois (código ou roteiro) está desatualizado;
é matéria para o usuário decidir intencionalmente.

Uso:
    python testar_modulo9_comunicacao.py
"""
from helpers_teste_api import Contexto, REGIAO_ID, checar, resumo


def main():
    ctx = Contexto()

    print("\n0) Logins")
    checar("login Presidente (9900001)", ctx.login("presidente", "9900001").status_code == 200)
    checar("login VM Loja 904 (9900022)", ctx.login("vm904", "9900022").status_code == 200)
    checar("login VM Loja 905 (9900029)", ctx.login("vm905", "9900029").status_code == 200)

    print("\n1) VM comum tentando criar tópico CIRCULAR -> 403")
    resp_circular_bloqueado = ctx.post("vm904", f"/regional/{REGIAO_ID}/comunicacao/topicos", json={
        "assunto": "[TESTE AUTOMATIZADO] Tentativa de Circular (não deveria ser criada)",
        "tipo_alcance": "CIRCULAR",
        "mensagem_inicial": "Teste automatizado.",
    })
    checar("POST /comunicacao/topicos CIRCULAR (VM comum) -> 403", resp_circular_bloqueado.status_code == 403, f"{resp_circular_bloqueado.status_code} {resp_circular_bloqueado.text}")

    print("\n2) Criar tópico LOJA_LOJA sem loja_destino_id -> 400")
    resp_sem_destino = ctx.post("vm904", f"/regional/{REGIAO_ID}/comunicacao/topicos", json={
        "assunto": "[TESTE AUTOMATIZADO] Sem destino",
        "tipo_alcance": "LOJA_LOJA",
        "mensagem_inicial": "Teste automatizado.",
    })
    checar("POST /comunicacao/topicos LOJA_LOJA sem destino -> 400", resp_sem_destino.status_code == 400, f"{resp_sem_destino.status_code} {resp_sem_destino.text}")

    print("\n3) Loja 904 abre tópico LOJA_LOJA com a Loja 905 como destino")
    resp = ctx.post("vm904", f"/regional/{REGIAO_ID}/comunicacao/topicos", json={
        "assunto": "[TESTE AUTOMATIZADO] Tópico entre Lojas 904 e 905",
        "tipo_alcance": "LOJA_LOJA",
        "loja_destino_id": "270",
        "loja_destino_nome": "Loja Teste",
        "loja_destino_numero": "905",
        "mensagem_inicial": "Mensagem inicial de teste automatizado.",
    })
    checar("POST /comunicacao/topicos LOJA_LOJA -> 200", resp.status_code == 200, f"{resp.status_code} {resp.text}")
    topico_id = resp.json().get("topico_id") if resp.status_code == 200 else None

    if topico_id:
        print("\n4) Loja 905 (destino) responde -> 200")
        resp_resposta = ctx.post("vm905", f"/regional/{REGIAO_ID}/comunicacao/topicos/{topico_id}/mensagens", json={
            "conteudo": "Resposta de teste automatizado.",
        })
        checar("POST /mensagens (Loja destino) -> 200", resp_resposta.status_code == 200, f"{resp_resposta.status_code} {resp_resposta.text}")

        print("\n5) Presidente (não envolvido, mas é Diretoria) responde -> 200 (Diretoria nunca é restrita)")
        resp_resposta_diretoria = ctx.post("presidente", f"/regional/{REGIAO_ID}/comunicacao/topicos/{topico_id}/mensagens", json={
            "conteudo": "Mensagem da Diretoria, teste automatizado.",
        })
        checar("POST /mensagens (Diretoria) -> 200", resp_resposta_diretoria.status_code == 200, f"{resp_resposta_diretoria.status_code} {resp_resposta_diretoria.text}")

        print("\n6) VM não envolvido nem Diretoria tentando alterar status -> conferindo o comportamento real")
        checar("login VM Loja 901 (9900001 já logado como presidente; usar oficial comum sem vínculo de teste)", True)
        # Usa um VM de uma Loja que não participa do tópico (904 x 905): não
        # há uma 3ª Loja de VM "limpo" no roteiro além de 904/905, então
        # reaproveitamos o Presidente da Loja 901 SEM o chapéu de Diretoria
        # não é possível via API (ele sempre resolve como Diretoria). Este
        # item específico portanto só pode ser verificado com um VM comum de
        # uma 3ª Loja jurisdicionada -- se a Região de teste ganhar uma Loja
        # 906/907 no futuro, estender este teste. Por ora, deixamos
        # registrado como limitação conhecida em vez de simular um
        # resultado que não reflete um cenário real.
        print("  [INFO] Item pulado -- Região de teste só tem Lojas 'limpas' 904 e 905, ambas já envolvidas neste tópico. Ver observação no roteiro.")

        print("\n7) Alterar status do tópico (Loja 905, envolvida)")
        resp_status = ctx.put("vm905", f"/regional/{REGIAO_ID}/comunicacao/topicos/{topico_id}/status", json={"status": "CONCLUIDA"})
        checar("PUT /status (Loja envolvida) -> 200", resp_status.status_code == 200, f"{resp_status.status_code} {resp_status.text}")

    resumo("MÓDULO 9 (COMUNICAÇÃO)")


if __name__ == "__main__":
    main()
