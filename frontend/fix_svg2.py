# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import re

path = 'src/compartilhado/componentes/LogoAnimadaCore.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r' xmlnsXodm="[^"]*"', '', content)
# Corrigir <style> tags no React: JSX requer {` ... `} ou dangerouslySetInnerHTML
content = re.sub(r'<style type="text/css">\s*(<!\[CDATA\[)?(.*?)(]]>)?\s*</style>', r'<style dangerouslySetInnerHTML={{ __html: `\2` }} />', content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
