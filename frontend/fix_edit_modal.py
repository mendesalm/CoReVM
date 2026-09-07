# EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import re

path = 'src/modulos/superadmin/PainelSuperAdmin.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Make handleUpdate take all the fields
update_fn = """
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;
    
    try {
      await axios.put(`${API_URL}/regioes/${editModal.id}`, {
        nome: editModal.nome,
        uf: editModal.uf,
        presidente_id: editPresidente || null,
        vice_presidente_id: editVice || null,
        secretario_id: editSecretario || null,
        lojas_ids: editLojas.map((l: any) => l.id)
      });
      setEditModal(null);
      fetchRegioes();
    } catch (err) {
      console.error("Erro ao atualizar região", err);
      alert("Erro ao atualizar conselho");
    }
  };
"""

# We need new state variables for the edit modal
state_vars = """
  const [editModal, setEditModal] = useState<any>(null);
  const [editPresidente, setEditPresidente] = useState<string>('');
  const [editVice, setEditVice] = useState<string>('');
  const [editSecretario, setEditSecretario] = useState<string>('');
  const [editLojas, setEditLojas] = useState<any[]>([]);
"""

# Replace existing editModal state
content = re.sub(r'const \[editModal, setEditModal\] = useState<any>\(null\);.*?', state_vars, content)

# Replace existing handleUpdate
content = re.sub(r'const handleUpdate = async.*?};', update_fn, content, flags=re.DOTALL)

# Modify the Edit button to populate the state
edit_button = """
                    <button 
                      onClick={() => {
                        setEditModal(regiao);
                        setEditLojas(regiao.lojas || []);
                        const pres = (regiao.diretoria || []).find((d: any) => d.cargo === 'Presidente' || d.cargo === 'PRESIDENTE');
                        const vice = (regiao.diretoria || []).find((d: any) => d.cargo === 'Vice-Presidente' || d.cargo === 'VICE_PRESIDENTE');
                        const sec = (regiao.diretoria || []).find((d: any) => d.cargo === 'Secretário' || d.cargo === 'SECRETARIO');
                        setEditPresidente(pres ? pres.usuario_id : '');
                        setEditVice(vice ? vice.usuario_id : '');
                        setEditSecretario(sec ? sec.usuario_id : '');
                      }}
"""
content = re.sub(r'<button[^>]*onClick=\{\(\) => setEditModal\(regiao\)\}[^>]*>', edit_button, content)


# Modify the Edit Modal form
edit_form = """
            <form className="space-y-6 max-h-[70vh] overflow-y-auto pr-2" onSubmit={handleUpdate}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nome do Conselho</label>
                  <input type="text" value={editModal.nome} onChange={e => setEditModal({...editModal, nome: e.target.value})} required className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Estado (UF)</label>
                  <select value={editModal.uf} onChange={e => setEditModal({...editModal, uf: e.target.value})} className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none">
                    <option value="GO">GO</option>
                    <option value="DF">DF</option>
                    <option value="SP">SP</option>
                    <option value="MG">MG</option>
                    <option value="RJ">RJ</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-[#333] pt-4">
                <h3 className="text-md font-semibold text-gray-200 mb-2">Lojas do Conselho</h3>
                <BuscadorLoja onSelect={(loja) => {
                    if (!editLojas.find(l => l.id === loja.id)) {
                      setEditLojas([...editLojas, loja]);
                    }
                  }} />
                
                {editLojas.length > 0 && (
                  <div className="mt-2 p-3 bg-[#151515] border border-[#333] rounded-lg max-h-32 overflow-y-auto">
                    <ul className="space-y-2">
                      {editLojas.map(loja => (
                        <li key={loja.id} className="flex items-center justify-between text-xs text-gray-300 bg-[#080808] p-2 rounded">
                          <span>{loja.nome} <span className="text-gray-500 ml-1">(Nº {loja.numero || (loja.loja_id ? loja.loja_id.substring(0,8) : '')})</span></span>
                          <button 
                            type="button"
                            onClick={() => setEditLojas(editLojas.filter(l => l.id !== loja.id))}
                            className="text-red-500 hover:text-red-400"
                          >
                            Remover
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="border-t border-[#333] pt-4 space-y-4">
                <h3 className="text-md font-semibold text-gray-200">Diretoria</h3>
                <BuscadorObreiro cargo="Presidente" lojasConselho={editLojas} onSuccess={(cim) => setEditPresidente(cim)} />
                {editPresidente && <div className="text-xs text-green-500 ml-1">CIM Atual: {editPresidente}</div>}
                
                <BuscadorObreiro cargo="Vice-Presidente" lojasConselho={editLojas} onSuccess={(cim) => setEditVice(cim)} />
                {editVice && <div className="text-xs text-green-500 ml-1">CIM Atual: {editVice}</div>}

                <BuscadorObreiro cargo="Secretário" lojasConselho={editLojas} onSuccess={(cim) => setEditSecretario(cim)} />
                {editSecretario && <div className="text-xs text-green-500 ml-1">CIM Atual: {editSecretario}</div>}
              </div>

              <div className="border-t border-[#333] pt-6 flex justify-end gap-3 sticky bottom-0 bg-[#111] py-2">
                <button 
                  type="button"
                  onClick={() => setEditModal(null)}
                  className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="bg-[#facc15] hover:bg-[#eab308] text-black px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
"""

content = re.sub(r'<form className="space-y-6" onSubmit=\{\(e\) => \{.*?handleUpdate.*?\}\}>.*?</form>', edit_form, content, flags=re.DOTALL)

# Fix max-w-lg to max-w-2xl for edit modal
content = re.sub(r'max-w-lg(?=[^<]*Editar Conselho Regional)', 'max-w-2xl', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
