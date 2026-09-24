"""
Verificação de fronteira de API entre módulos do ecossistema Sigma.

Contexto (ver `contexto-implementacao.md` do projeto, seção 9): o CoReVM
deveria consumir dados de Lojas e e-Sigma via API (HTTP), não lendo o schema
de `lojas_db`/`esigma` diretamente. Essa migração ainda está em andamento —
existem arquivos legados que hoje dependem de acesso direto e continuam
funcionando assim até a API correspondente estar pronta (ver ALLOWLIST
abaixo). O objetivo deste script NÃO é quebrar o que já existe, e sim
impedir que esse padrão se espalhe silenciosamente para código NOVO.

Como funciona: procura, em todo `backend/**.py`, por uso de qualquer padrão
da lista `PADROES_PROIBIDOS` (acesso direto a `lojas_db`/`esigma`). Se
encontrar em um arquivo que NÃO está na ALLOWLIST, falha (exit code 1) e
lista exatamente o quê e onde.

Se uma feature nova PRECISA mesmo de acesso direto (ex.: um script de
migração pontual), a pessoa (ou agente de IA) precisa adicionar o arquivo
à ALLOWLIST explicitamente, de forma consciente e revisável no diff do
Pull Request/commit — nunca por acidente.

Uso (rodado pelo CI antes do deploy, ver .github/workflows/deploy.yml):
    python3 backend/scripts/verificar_fronteiras_api.py
"""
import sys
from pathlib import Path

RAIZ_BACKEND = Path(__file__).resolve().parent.parent

PADROES_PROIBIDOS = [
    "get_db_lojas",
    "get_db_esigma",
    "lojas_models",
    "DATABASE_URL_LOJAS",
    "DATABASE_URL_ESIGMA",
]

# Arquivos que JÁ dependem de acesso direto a lojas_db/esigma, mapeados na
# auditoria de 2026-09 (ver seção 9.4 do contexto de implementação). Cada
# entrada aqui é uma dívida técnica conhecida e aceita, não um exemplo a
# copiar em código novo.
ALLOWLIST = {
    "database.py",  # define as conexões em si — é o único lugar "autorizado" a existir
    "core/dependencies.py",  # RBAC ainda resolve VM/Suplente via lojas_db (pendente migrar p/ API do Lojas)
    "core/reconciliacao_diretoria_lojas.py",  # reconciliação pontual em background

    "delete_test_data.py",
    "delete_test_obreiros.py",
    "fix_obediences.py",
    "inspect_db.py",
    "inspect_lista_lojas.py",
    "inspecionar_enum_rito_lojas_db.py",
    "verificar_cargos.py",
    "verificar_migracao_lojas_db.py",
    "seed_lojas.py",
    "investigar_usuarios_teste.py",
    "tests/conftest.py",
}


def caminho_relativo(arquivo: Path) -> str:
    return str(arquivo.relative_to(RAIZ_BACKEND)).replace("\\", "/")


def main() -> int:
    violacoes = []

    for arquivo in RAIZ_BACKEND.rglob("*.py"):
        if "__pycache__" in arquivo.parts or "scripts" in arquivo.parts:
            continue

        relativo = caminho_relativo(arquivo)
        if relativo in ALLOWLIST or Path(relativo).name in ALLOWLIST:
            continue

        conteudo = arquivo.read_text(encoding="utf-8", errors="ignore")
        for padrao in PADROES_PROIBIDOS:
            if padrao in conteudo:
                violacoes.append((relativo, padrao))

    if violacoes:
        print("ERRO: acesso direto a banco de outro módulo encontrado fora da allowlist:\n")
        for arquivo, padrao in violacoes:
            print(f"  - {arquivo}: usa '{padrao}'")
        print(
            "\nSe isso é intencional (ex.: um novo script de migração pontual), "
            "adicione o arquivo à ALLOWLIST em backend/scripts/verificar_fronteiras_api.py "
            "de forma consciente. Caso contrário, a feature nova deveria consumir a API "
            "do módulo correspondente (e-Sigma: GET /api/v1/auth/validate e afins; "
            "Lojas: contrato ainda pendente de desenho, ver seção 9.4 do contexto de "
            "implementação) em vez de ler o banco diretamente."
        )
        return 1

    print("OK: nenhum acesso direto novo a lojas_db/esigma fora da allowlist conhecida.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
