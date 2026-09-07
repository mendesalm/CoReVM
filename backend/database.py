# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Conexão com o banco local exclusivo do CoReVM
SQLALCHEMY_DATABASE_URL_CORE = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/core_db"
SQLALCHEMY_DATABASE_URL_LOJAS = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lojas_db"
SQLALCHEMY_DATABASE_URL_LISTA = "postgresql://esigma:BsysT23754RthfFg@69.62.89.211:5432/lista_de_lojas_db"

engine_core = create_engine(SQLALCHEMY_DATABASE_URL_CORE)
SessionLocalCore = sessionmaker(autocommit=False, autoflush=False, bind=engine_core)

engine_lojas = create_engine(SQLALCHEMY_DATABASE_URL_LOJAS)
SessionLocalLojas = sessionmaker(autocommit=False, autoflush=False, bind=engine_lojas)

engine_lista = create_engine(SQLALCHEMY_DATABASE_URL_LISTA)
SessionLocalLista = sessionmaker(autocommit=False, autoflush=False, bind=engine_lista)

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
