# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
"""
Restaura a Mesa Diretora da Regiao de teste (Ceres) para o cenario
documentado no roteiro (claude/roteiro-testes-conselho-ceres.md):
  Presidente      -> 9900001 (era 9900022)
  Vice-Presidente -> 9900008 (era 9900040)
  Secretario      -> 9900015 (ja estava correto, nao precisa mudar)

Motivo: diagnosticar_diretoria_teste.py encontrou os dois primeiros cargos
apontando para CIMs errados -- provavelmente sobra de um teste manual
anterior de edicao da Diretoria, nunca revertido.

Uso (dentro de CoReVM/backend, no mesmo venv do projeto):
    python corrigir_diretoria_teste.py
"""
from database import SessionLocalCore
from models.models import DiretoriaConselho

REGIAO_ID = "test-core-ceres-go-001"

CORRECOES = {
    "presidente": "9900001",
    "vice-presidente": "9900008",
}


def main():
    db = SessionLocalCore()
    try:
        alterado = False
        for linha in db.query(DiretoriaConselho).filter(DiretoriaConselho.regiao_id == REGIAO_ID).all():
            cargo = linha.cargo.value
            correto = CORRECOES.get(cargo)
            if correto and linha.usuario_id != correto:
                print(f"Corrigindo {cargo}: {linha.usuario_id!r} -> {correto!r}")
                linha.usuario_id = correto
                # loja_id fica None aqui de proposito -- get_current_regional_user
                # resolve loja_id_vm dinamicamente a partir do mandato ativo em
                # lojas_db (ver core/dependencies.py::_resolver_loja_vm_ativa).
                alterado = True
        if alterado:
            db.commit()
            print("Commit OK.")
        else:
            print("Nada para corrigir -- todos os cargos ja estavam com o CIM esperado.")
    except Exception as erro:
        db.rollback()
        print(f"[ERRO] Falha ao corrigir: {erro}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
