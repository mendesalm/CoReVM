import sys

path = "api/v1/regional/rotas.py"
with open(path, "r", encoding="utf-8") as f:
    src = f.read()

def do_replace(old, new, label):
    global src
    n = src.count(old)
    if n != 1:
        print(f"ERRO: '{label}' encontrado {n} vezes (esperado 1).")
        sys.exit(1)
    src = src.replace(old, new, 1)

old = '''    if payload.tipo is not None:
        tipo = payload.tipo.upper()
        if tipo not in TIPOS_EVENTO_AGENDA_VALIDOS:
            raise HTTPException(status_code=400, detail=f"Tipo de evento inválido. Use um de: {', '.join(TIPOS_EVENTO_AGENDA_VALIDOS)}.")
        evento.tipo = tipo
    if payload.data_inicio is not None:'''
new = '''    if payload.tipo is not None:
        tipo = payload.tipo.upper()
        if tipo not in TIPOS_EVENTO_AGENDA:
            raise HTTPException(status_code=400, detail=f"Tipo de evento inválido. Use um de: {', '.join(TIPOS_EVENTO_AGENDA_VALIDOS)}.")
        evento.tipo = tipo
    if payload.subtipo is not None:
        subtipo_novo = payload.subtipo.strip().upper() or None
        tipo_vigente = payload.tipo.upper() if payload.tipo is not None else evento.tipo
        if tipo_vigente == "SESSAO_MAGNA" and subtipo_novo and subtipo_novo not in SUBTIPOS_SESSAO_MAGNA_VALIDOS:
            raise HTTPException(status_code=400, detail=f"Subtipo inválido para Sessão Magna. Use um de: {', '.join(SUBTIPOS_SESSAO_MAGNA_VALIDOS)}.")
        evento.subtipo = subtipo_novo
    if payload.data_inicio is not None:'''
do_replace(old, new, "atualizar_evento_agenda subtipo")

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("Etapa 3 OK")
