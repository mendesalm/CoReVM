"""
Configuração compartilhada dos testes do backend do CoReVM.

`database.py` exige (por design — ver seção 1.8 do contexto de
implementação) que as URLs de conexão venham de variáveis de ambiente,
falhando com RuntimeError se alguma estiver ausente. Isso é correto para
rodar a aplicação de verdade, mas os testes unitários deste diretório não
abrem nenhuma conexão real (todas as sessões de banco são mockadas) — só
precisamos de valores sintaticamente válidos para que os módulos importem
sem erro, tanto no ambiente do desenvolvedor quanto no CI.

`setdefault` garante que, se o desenvolvedor já tiver um `.env` real
carregado no ambiente, os valores reais são respeitados — isto aqui é só
um "piso" para quando eles não existem (ex.: CI).
"""
import os

os.environ.setdefault("DATABASE_URL_CORE", "postgresql://teste:teste@localhost/teste_core")
os.environ.setdefault("DATABASE_URL_LOJAS", "postgresql://teste:teste@localhost/teste_lojas")
os.environ.setdefault("DATABASE_URL_LISTA", "postgresql://teste:teste@localhost/teste_lista")
os.environ.setdefault("DATABASE_URL_ESIGMA", "postgresql://teste:teste@localhost/teste_esigma")
os.environ.setdefault("ESIGMA_API_BASE_URL", "http://localhost:8001/api/v1")
