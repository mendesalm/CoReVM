# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Executa em sequência todos os scripts de teste automatizado do roteiro
(claude/roteiro-testes-conselho-ceres.md no Project "Core") que já
existem em CoReVM/backend, e imprime um resumo final de quais módulos
passaram e quais falharam.

Cada script é executado num subprocesso próprio (mesmo padrão dos
scripts individuais) para que uma falha (sys.exit(1)) num módulo não
impeça os demais de rodar.

Uso:
    python rodar_todos_testes_automatizados.py

Pré-requisitos (ver roteiro):
  - Os 3 backends e o frontend do e-Sigma no ar (iniciar_ecossistema.bat).
  - Migrações confirmadas: transmissão emergencial de VM e histórico de
    liderança de loja (rodadas em 2026-09-16).
  - Módulo 12 faz sua própria designação de Operador Administrativo como
    parte do setup -- não precisa designar manualmente antes.

NÃO incluídos aqui (ver observações em cada roteiro/seção):
  - Módulo 1 (Login/RBAC) e "Esqueci minha senha" -- já cobertos por
    testar_modulo1_login_rbac.py e testar_esqueci_senha.py (este último
    em e-sigma/backend/, não aqui).
  - Módulo 2 (Lojas/Suplente) -- já concluído e confirmado em 2026-09-14,
    scripts testar_acesso_direto_suplente.py já existentes.
  - Seção 2.1 (Transmissão Emergencial de VM), Módulo 3 itens de assento
    órfão, Módulo 11 itens de simulação de divergência, e Módulo 13
    (Agenda) -- ver motivos específicos no cabeçalho de cada script/na
    observação de execução do roteiro; exigem mutação de dados
    considerada arriscada demais para automatizar sem supervisão, ou
    (Agenda) têm pré-requisito ainda não satisfeito.
"""
import subprocess
import sys

SCRIPTS = [
    "testar_modulo3_diretoria.py",
    "testar_modulo4_avisos.py",
    "testar_modulo5_admissoes.py",
    "testar_modulo6_votacoes.py",
    "testar_modulo7_patrimonio.py",
    "testar_modulo8_documentos.py",
    "testar_modulo9_comunicacao.py",
    "testar_modulo11_resiliencia.py",
    "testar_modulo12_operador_administrativo.py",
]


def main():
    resultados = {}
    for script in SCRIPTS:
        print("\n" + "#" * 70)
        print(f"# {script}")
        print("#" * 70)
        proc = subprocess.run([sys.executable, script])
        resultados[script] = proc.returncode == 0

    print("\n\n" + "=" * 70)
    print("RESUMO GERAL")
    print("=" * 70)
    for script, ok in resultados.items():
        print(f"  {'[OK]   ' if ok else '[FALHOU]'} {script}")

    if not all(resultados.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
