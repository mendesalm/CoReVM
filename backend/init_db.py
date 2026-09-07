from database import engine_core, Base
from models.models import Regiao, DiretoriaConselho, LojaAgregada

def init_db():
    print("Criando as tabelas no banco de dados do CoReVM...")
    Base.metadata.create_all(bind=engine_core)
    print("Tabelas criadas com sucesso!")

if __name__ == "__main__":
    init_db()
