import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Conexão com o banco local exclusivo do CoReVM
DATABASE_URL_CORE = os.getenv("DATABASE_URL_CORE", "postgresql+psycopg2://esigma:BsysT23754RthfFg@69.62.89.211:5432/core")
engine_core = create_engine(DATABASE_URL_CORE)
SessionLocalCore = sessionmaker(autocommit=False, autoflush=False, bind=engine_core)
BaseCore = declarative_base()

# Conexão com o banco central de lojas
DATABASE_URL_LOJAS = os.getenv("DATABASE_URL_LOJAS", "postgresql+psycopg2://esigma:BsysT23754RthfFg@69.62.89.211:5432/lista_de_lojas_db")
engine_lojas = create_engine(DATABASE_URL_LOJAS)
SessionLocalLojas = sessionmaker(autocommit=False, autoflush=False, bind=engine_lojas)
BaseLojas = declarative_base()

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
