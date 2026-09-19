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

# 2) Inserir endpoint GET tipos-evento antes de listar_eventos_agenda
anchor2 = '''@router.get("/{regiao_id}/agenda/eventos", summary="Lista os eventos da agenda do conselho")
def listar_eventos_agenda('''
novo2 = '''@router.get("/{regiao_id}/agenda/tipos-evento", summary="Lista o catálogo fechado de tipos de evento da Agenda")
def listar_tipos_evento_agenda(
    regiao_id: str,
    user = Depends(obter_identidade_regional_ou_operador_administrativo)
):
    """
    Catálogo fechado -- ver seção 10 de claude/decisao-controle-acesso-cadastro.md.
    Devolve, para cada tipo, o âmbito (CONSELHO/LOJA/AMBOS) e quem pode
    lançá-lo, para a UI montar o formulário sem hardcodar a lista.
    """
    return [
        {
            "tipo": tipo,
            "rotulo": info["rotulo"],
            "ambito": info["ambito"],
            "quem_lanca": info["quem_lanca"],
            "subtipos_validos": SUBTIPOS_SESSAO_MAGNA_VALIDOS if tipo == "SESSAO_MAGNA" else None
        }
        for tipo, info in TIPOS_EVENTO_AGENDA.items()
    ]


@router.get("/{regiao_id}/agenda/eventos", summary="Lista os eventos da agenda do conselho")
def listar_eventos_agenda('''
do_replace(anchor2, novo2, "insercao GET tipos-evento")

# 3) subtipo no retorno de listar_eventos_agenda
old3 = '''            "tipo": e.tipo,
            "data_inicio": e.data_inicio.isoformat(),'''
new3 = '''            "tipo": e.tipo,
            "subtipo": e.subtipo,
            "data_inicio": e.data_inicio.isoformat(),'''
do_replace(old3, new3, "subtipo no GET eventos")

# 4) Validação de tipo/ambito/subtipo em criar_evento_agenda
old4 = '''    tipo = (payload.tipo or "OUTRO").upper()
    if tipo not in TIPOS_EVENTO_AGENDA_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo de evento inválido. Use um de: {', '.join(TIPOS_EVENTO_AGENDA_VALIDOS)}.")

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    is_operador = isinstance(user, OperadorAdministrativoContext)
'''
new4 = '''    tipo = (payload.tipo or "OUTRO").upper()
    if tipo not in TIPOS_EVENTO_AGENDA:
        raise HTTPException(status_code=400, detail=f"Tipo de evento inválido. Use um de: {', '.join(TIPOS_EVENTO_AGENDA_VALIDOS)}.")
    ambito = TIPOS_EVENTO_AGENDA[tipo]["ambito"]

    is_diretoria = user.is_diretoria or user.role.upper() == 'SUPERADMIN'
    is_operador = isinstance(user, OperadorAdministrativoContext)
    tem_loja_propria = bool(user.loja_id)

    # Âmbito fechado por tipo (seção 10.2 do documento de decisão): CONSELHO
    # só pode ser lançado pela Mesa Diretora/SuperAdmin, e nunca tem Loja
    # organizadora; LOJA exige vínculo com uma Loja (VM, Suplente ou
    # Operador Administrativo, ou Diretoria que também é VM da própria
    # Loja); AMBOS aceita qualquer um dos dois caminhos.
    if ambito == "CONSELHO" and not is_diretoria:
        raise HTTPException(status_code=403, detail="Este tipo de evento é exclusivo da Mesa Diretora/SuperAdmin.")
    if ambito == "LOJA" and not tem_loja_propria:
        raise HTTPException(status_code=403, detail="Este tipo de evento exige vínculo com uma Loja (VM, Suplente ou Operador Administrativo).")
    if ambito == "AMBOS" and not (is_diretoria or tem_loja_propria):
        raise HTTPException(status_code=403, detail="Você precisa ser Mesa Diretora/SuperAdmin ou ter vínculo com uma Loja para lançar este tipo de evento.")

    # Subtipo: catálogo fechado só para SESSAO_MAGNA; demais tipos, livre.
    subtipo = (payload.subtipo or "").strip().upper() or None
    if tipo == "SESSAO_MAGNA":
        if not subtipo:
            raise HTTPException(status_code=400, detail=f"Sessão Magna exige subtipo. Use um de: {', '.join(SUBTIPOS_SESSAO_MAGNA_VALIDOS)}.")
        if subtipo not in SUBTIPOS_SESSAO_MAGNA_VALIDOS:
            raise HTTPException(status_code=400, detail=f"Subtipo inválido para Sessão Magna. Use um de: {', '.join(SUBTIPOS_SESSAO_MAGNA_VALIDOS)}.")
'''
do_replace(old4, new4, "validacao ambito/subtipo criar_evento_agenda")

# 5) loja_organizadora nunca preenchida para tipos CONSELHO
old5 = '''    loja_organizadora_id = None
    loja_organizadora_nome = None
    loja_organizadora_numero = None
    if user.loja_id:
        loja_organizadora_id = str(user.loja_id)'''
new5 = '''    loja_organizadora_id = None
    loja_organizadora_nome = None
    loja_organizadora_numero = None
    if ambito != "CONSELHO" and user.loja_id:
        loja_organizadora_id = str(user.loja_id)'''
do_replace(old5, new5, "loja_organizadora trava CONSELHO")

# 6) gravar subtipo no INSERT
old6 = '''        tipo=tipo,
        data_inicio=payload.data_inicio,
        data_fim=payload.data_fim,
        loja_organizadora_id=loja_organizadora_id,'''
new6 = '''        tipo=tipo,
        subtipo=subtipo,
        data_inicio=payload.data_inicio,
        data_fim=payload.data_fim,
        loja_organizadora_id=loja_organizadora_id,'''
do_replace(old6, new6, "gravar subtipo no insert")

with open(path, "w", encoding="utf-8") as f:
    f.write(src)

print("Etapa 2 OK")
