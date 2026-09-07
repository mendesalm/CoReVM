# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import os
import re

golden_header = "# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA\n"
golden_header_tsx = "// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA\n"

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    changed = False
    
    if filepath.endswith('.py'):
        if not content.startswith("# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA"):
            content = golden_header + content
            changed = True
    elif filepath.endswith('.tsx') or filepath.endswith('.ts'):
        if not content.startswith("// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA"):
            content = golden_header_tsx + content
            changed = True

    if changed:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

for root, dirs, files in os.walk('.'):
    if 'node_modules' in root or '.git' in root or '__pycache__' in root or '.venv' in root or 'venv' in root:
        continue
    for file in files:
        if file.endswith(('.py', '.ts', '.tsx')):
            process_file(os.path.join(root, file))

# Add Pydantic Validators to schemas.py
schemas_path = 'backend/schemas/schemas.py'
with open(schemas_path, 'r', encoding='utf-8') as f:
    schemas_content = f.read()

if 'from pydantic import BaseModel, field_validator' not in schemas_content:
    schemas_content = schemas_content.replace('from pydantic import BaseModel', 'from pydantic import BaseModel, field_validator')

    validator_code = """
    @field_validator('nome')
    def sanitize_nome(cls, v):
        if not v: return v
        words = v.split()
        preps = ['de', 'da', 'do', 'das', 'dos', 'e']
        title_words = [w.capitalize() if w.lower() not in preps else w.lower() for w in words]
        return ' '.join(title_words)

    @field_validator('uf')
    def sanitize_uf(cls, v):
        if v:
            return v.upper().strip()
        return v
"""
    schemas_content = schemas_content.replace('class RegiaoBase(BaseModel):\n    nome: str\n    uf: str', 'class RegiaoBase(BaseModel):\n    nome: str\n    uf: str\n' + validator_code)

    with open(schemas_path, 'w', encoding='utf-8') as f:
        f.write(schemas_content)

print("Golden rules applied successfully.")
