# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Conexão com os bancos do ecossistema (Postgres remoto na VPS do e-Sigma).
# CORREÇÃO DE SEGURANÇA (2026-09-11): as strings de conexão eram hardcoded
# neste arquivo, incluindo usuário e senha em texto puro, o que expunha as
# credenciais de produção no histórico do Git. Agora elas vêm exclusivamente
# do arquivo .env (que já está listado no .gitignore do projeto). Configure
# um arquivo .env local em backend/ com base no .env.example antes de rodar
# a aplicação — sem essas variáveis definidas, o backend não inicia.
#
# Todos os scripts utilitários do backend (seeds, fixes, inspects) devem
# importar as constantes SQLALCHEMY_DATABASE_URL_* deste módulo em vez de
# hardcodar sua própria string de conexão — isso foi corrigido em 2026-09-11
# nos arquivos delete_test_data.py, delete_test_obreiros.py, fix_obediences.py,
# inspect_db.py, inspect_lista_lojas.py e seed_lojas.py, que antes conectavam
# diretamente via psycopg2 com a senha escrita no código.


def _obter_variavel_obrigatoria(nome: str) -> str:
    """Lê uma variável de ambiente obrigatória, falhando de forma explícita
    (em vez de silenciosamente) caso ela não esteja configurada no .env."""
    valor = os.getenv(nome)
    if not valor:
        raise RuntimeError(
            f"Variável de ambiente '{nome}' não configurada. "
            "Copie backend/.env.example para backend/.env e preencha as "
            "credenciais de conexão com o PostgreSQL antes de iniciar o backend."
        )
    return valor


SQLALCHEMY_DATABASE_URL_CORE = _obter_variavel_obrigatoria("DATABASE_URL_CORE")
SQLALCHEMY_DATABASE_URL_LOJAS = _obter_variavel_obrigatoria("DATABASE_URL_LOJAS")
SQLALCHEMY_DATABASE_URL_LISTA = _obter_variavel_obrigatoria("DATABASE_URL_LISTA")

# Conexão com o banco "esigma" (dados centrais de identidade do e-Sigma:
# Organizacao, Pessoa, Mandatos). Adicionada em 2026-09-11 por decisão
# explícita: o CoReVM passa a acessar este schema diretamente, no mesmo
# padrão já usado para lojas_db e lista_de_lojas_db (acoplamento por banco
# compartilhado, não por chamada HTTP a uma API do e-Sigma).
SQLALCHEMY_DATABASE_URL_ESIGMA = _obter_variavel_obrigatoria("DATABASE_URL_ESIGMA")

# Conexão OPCIONAL e somente para uso pontual em scripts de migração de dados
# legados (ex.: seed_lojas.py lendo o banco "esigma_db_ref", um snapshot do
# projeto de referência "sigma"). NÃO é obrigatória para o backend iniciar:
# só é lida quando um script de migração específico precisar dela.
SQLALCHEMY_DATABASE_URL_LEGACY_REF = os.getenv("DATABASE_URL_LEGACY_REF")

engine_core = create_engine(SQLALCHEMY_DATABASE_URL_CORE)
SessionLocalCore = sessionmaker(autocommit=False, autoflush=False, bind=engine_core)

engine_lojas = create_engine(SQLALCHEMY_DATABASE_URL_LOJAS)
SessionLocalLojas = sessionmaker(autocommit=False, autoflush=False, bind=engine_lojas)

engine_lista = create_engine(SQLALCHEMY_DATABASE_URL_LISTA)
SessionLocalLista = sessionmaker(autocommit=False, autoflush=False, bind=engine_lista)

engine_esigma = create_engine(SQLALCHEMY_DATABASE_URL_ESIGMA)
SessionLocalEsigma = sessionmaker(autocommit=False, autoflush=False, bind=engine_esigma)

Base = declarative_base()

def get_db_core():
    db = SessionLocalCore()
    try:
        yield db
    finally:
        db.close()

def get_db_lojas():
    db = SessionLocalLojas()
    try:
        yield db
    finally:
        db.close()

def get_db_lista():
    db = SessionLocalLista()
    try:
        yield db
    finally:
        db.close()

def get_db_esigma():
    db = SessionLocalEsigma()
    try:
        yield db
    finally:
        db.close()
