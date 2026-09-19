#!/usr/bin/env python3
"""
Corrige as URLs de API hardcoded (http://localhost:8000) nos componentes do
Painel Global do e-Sigma, trocando por import.meta.env.VITE_API_URL com o
mesmo valor como fallback (mesmo padrão já aplicado em cliente_http.ts).

Roda a partir da raiz do projeto frontend:
    cd /var/www/esigma/frontend
    python3 fix_urls_esigma.py
"""
import sys

ENV_EXPR = "${import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'}"

SUBSTITUICOES = [
    (
        "src/modulos/painel_global/componentes/GestaoOrganizacoes.tsx",
        "const response = await axios.get('http://localhost:8000/api/v1/organizacoes/?limite=5000');",
        f"const response = await axios.get(`{ENV_EXPR}/organizacoes/?limite=5000`);",
    ),
    (
        "src/modulos/painel_global/componentes/GestaoLojas.tsx",
        "const resp = await axios.get('http://localhost:8000/api/v1/organizacoes/?limite=5000');",
        f"const resp = await axios.get(`{ENV_EXPR}/organizacoes/?limite=5000`);",
    ),
    (
        "src/modulos/painel_global/componentes/GestaoObediencias.tsx",
        "const resp = await axios.get('http://localhost:8000/api/v1/organizacoes/?limite=5000');",
        f"const resp = await axios.get(`{ENV_EXPR}/organizacoes/?limite=5000`);",
    ),
    (
        "src/modulos/painel_global/componentes/GestaoTratados.tsx",
        "const response = await axios.get('http://localhost:8000/api/v1/saas/tratados');",
        f"const response = await axios.get(`{ENV_EXPR}/saas/tratados`);",
    ),
    (
        "src/modulos/painel_global/componentes/GestaoAssinaturas.tsx",
        "const response = await axios.get('http://localhost:8000/api/v1/saas/planos');",
        f"const response = await axios.get(`{ENV_EXPR}/saas/planos`);",
    ),
    (
        "src/modulos/painel_global/componentes/ModalEdicaoOrganizacao.tsx",
        "await axios.post(`http://localhost:8000/api/v1/organizacoes/`, payload);",
        f"await axios.post(`{ENV_EXPR}/organizacoes/`, payload);",
    ),
    (
        "src/modulos/painel_global/componentes/ModalEdicaoOrganizacao.tsx",
        "await axios.patch(`http://localhost:8000/api/v1/organizacoes/${org.id}`, payload);",
        f"await axios.patch(`{ENV_EXPR}/organizacoes/${{org.id}}`, payload);",
    ),
    (
        "src/modulos/painel_global/componentes/ModalEdicaoOrganizacao.tsx",
        "const resp = await axios.post(`http://localhost:8000/api/v1/saas/checkout/${org.id}`);",
        f"const resp = await axios.post(`{ENV_EXPR}/saas/checkout/${{org.id}}`);",
    ),
    (
        "src/modulos/painel_global/componentes/ModalImportacaoMassa.tsx",
        "const resp = await axios.post('http://localhost:8000/api/v1/organizacoes/importar/preview', formData, {",
        f"const resp = await axios.post(`{ENV_EXPR}/organizacoes/importar/preview`, formData, {{",
    ),
    (
        "src/modulos/painel_global/componentes/ModalImportacaoMassa.tsx",
        "const resp = await axios.post('http://localhost:8000/api/v1/organizacoes/importar/confirmar', { itens: itensValidos });",
        f"const resp = await axios.post(`{ENV_EXPR}/organizacoes/importar/confirmar`, {{ itens: itensValidos }});",
    ),
]


def main():
    erros = 0
    arquivos_tocados = set()
    for caminho, antigo, novo in SUBSTITUICOES:
        try:
            with open(caminho, "r", encoding="utf-8") as f:
                conteudo = f.read()
        except FileNotFoundError:
            print(f"[ERRO] Arquivo não encontrado: {caminho}")
            erros += 1
            continue

        ocorrencias = conteudo.count(antigo)
        if ocorrencias == 0:
            print(f"[ERRO] Trecho esperado não encontrado em {caminho}:")
            print(f"       {antigo}")
            erros += 1
            continue
        if ocorrencias > 1:
            print(f"[AVISO] Trecho aparece {ocorrencias}x em {caminho} — substituindo todas as ocorrências.")

        conteudo_novo = conteudo.replace(antigo, novo)
        with open(caminho, "w", encoding="utf-8") as f:
            f.write(conteudo_novo)
        arquivos_tocados.add(caminho)
        print(f"[OK] {caminho}: substituído.")

    print()
    if erros:
        print(f"Terminado com {erros} erro(s) — revise antes de rebuildar.")
        sys.exit(1)
    else:
        print(f"Tudo certo: {len(arquivos_tocados)} arquivo(s) corrigido(s).")


if __name__ == "__main__":
    main()
