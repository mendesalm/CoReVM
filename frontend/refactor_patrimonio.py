import re

with open(r'c:\Users\engan\Desktop\CoReVM\frontend\src\modulos\regional\submodulos\PaginaPatrimonio.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Palette changes
content = content.replace('bg-sigma-bg', 'bg-[#070e1c]')
content = content.replace('bg-sigma-surface', 'bg-[#1e293b]')
content = content.replace('bg-sigma-elevated', 'bg-slate-700')
content = content.replace('border-sigma-border', 'border-slate-700')

# Reduce gold
content = content.replace('bg-sigma-gold text-[#070F1E]', 'bg-blue-600 text-white hover:bg-blue-500')
content = content.replace('text-[#facc15]', 'text-blue-400')
content = content.replace('border-[#facc15]', 'border-blue-400')
content = content.replace('border-[#facc15]/20', 'border-blue-400/20')

# Order alphabetically
content = content.replace(
    'setItens(Array.isArray(itensRes.data) ? itensRes.data : []);',
    'setItens(Array.isArray(itensRes.data) ? itensRes.data.sort((a,b) => a.nome.localeCompare(b.nome)) : []);'
)

# Extract and move the 'Cadastrar Bem' button from the subheader
btn_regex = re.compile(r'<div className="flex flex-wrap items-center gap-3">\s*<button[^>]*>\s*<Plus[^>]*/> Cadastrar Bem\s*</button>\s*</div>')
btn_match = btn_regex.search(content)

if btn_match:
    btn_str = btn_match.group(0)
    # remove it from its original place
    content = content.replace(btn_str, '', 1)
    
    # find the toolbar place: 'className="bg-[#1e293b] border border-[#242424] rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4"'
    # let's find the inner flex containing filters: '<div className="flex flex-wrap items-center gap-3">'
    # Wait, there are multiple "flex flex-wrap items-center gap-3". Let's insert the button at the beginning of the Toolbar.
    
    toolbar_str = '<div className="bg-[#1e293b] border border-[#242424] rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-4">'
    if toolbar_str in content:
        # Instead of replacing inside the same div, we can just insert the button after the toolbar_str opening tag.
        content = content.replace(toolbar_str, toolbar_str + '\n            ' + btn_str)

# Master list replacement
list_regex = re.compile(r'<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">.*?(?=</div>\n          \)\})', re.DOTALL)

new_list = '''<div className="flex flex-col gap-2">
              {itensPaginados.map((item) => {
                const estaDisponivel = item.quantidade_disponivel > 0;
                return (
                  <div
                    key={item.id}
                    onClick={() => setItemSelecionado(item)}
                    className="bg-[#1e293b] border border-slate-700 rounded-lg p-4 flex items-center justify-between hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <span className="font-bold text-white">{item.nome}</span>
                    <span className={`text-sm font-semibold px-2 py-1 rounded-md ${estaDisponivel ? 'bg-emerald-900/50 text-emerald-400' : 'bg-amber-900/50 text-amber-400'}`}>
                      {item.quantidade_disponivel} disp.
                    </span>
                  </div>
                );
              })}'''

content = list_regex.sub(new_list, content)

with open(r'c:\Users\engan\Desktop\CoReVM\frontend\src\modulos\regional\submodulos\PaginaPatrimonio.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
