# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import re

path = 'src/compartilhado/componentes/LogoAnimadaCore.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remover as tags indesejadas no inicio do SVG
content = re.sub(r'<\?xml[^\?]*\?>\n?', '', content)
content = re.sub(r'<!DOCTYPE[^>]*>\n?', '', content)
content = re.sub(r'<!--.*?-->\n?', '', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
