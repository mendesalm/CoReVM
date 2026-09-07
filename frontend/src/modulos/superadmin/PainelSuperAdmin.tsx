// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import React, { useState, useEffect } from 'react';
import { Search, Plus, MapPin, Users, Activity, Settings, ChevronRight, Loader2, Map, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import BuscadorObreiro from '../../compartilhado/componentes/BuscadorObreiro';
import BuscadorLoja from '../../compartilhado/componentes/BuscadorLoja';

// URL base do backend FastAPI do CoReVM
const API_URL = 'http://localhost:8003/api/v1';

export default function PainelSuperAdmin() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [regioes, setRegioes] = useState<any[]>([]);

  // Wizard States
  const [step, setStep] = useState(1);
  const [selectedLojas, setSelectedLojas] = useState<{id: number, nome: string, numero: string}[]>([]);
  const [editModal, setEditModal] = useState<any>(null); // Estado para o modal de edição
  const [editPresidente, setEditPresidente] = useState<string>('');
  const [editVice, setEditVice] = useState<string>('');
  const [editSecretario, setEditSecretario] = useState<string>('');
  const [editLojas, setEditLojas] = useState<any[]>([]);

  // Campos do formulário
  const [nome, setNome] = useState('');
  const [uf, setUf] = useState('GO');
  
  // Diretores selecionados
  const [presidenteId, setPresidenteId] = useState('');
  const [vicePresidenteId, setVicePresidenteId] = useState('');
  const [secretarioId, setSecretarioId] = useState('');
  

  // Carregar dados da API
  const fetchRegioes = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/regioes/`);
      setRegioes(res.data);
    } catch (err) {
      console.error("Erro ao buscar regiões", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegioes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if(!presidenteId && !vicePresidenteId && !secretarioId) {
      alert("Por favor, resolva o CIM de pelo menos um diretor (ex: Presidente) antes de salvar.");
      return;
    }

    try {
      await axios.post(`${API_URL}/regioes/`, {
        nome,
        uf,
        presidente_id: presidenteId || null,
        vice_presidente_id: vicePresidenteId || null,
        secretario_id: secretarioId || null,
        lojas_ids: selectedLojas.map(l => l.id)
      });
      setShowModal(false);
      setStep(1);
      setSelectedLojas([]);
      setNome('');
      setPresidenteId('');
      setVicePresidenteId('');
      setSecretarioId('');
      fetchRegioes(); // Recarrega a tabela
    } catch (err) {
      console.error("Erro ao criar região", err);
      alert("Erro ao criar conselho");
    }
  };

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
        lojas_ids: editLojas.map((l: any) => l.id || l.loja_id)
      });
      setEditModal(null);
      fetchRegioes();
    } catch (err) {
      console.error("Erro ao atualizar região", err);
      alert("Erro ao atualizar conselho");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente deletar este Conselho Regional?")) return;
    try {
      await axios.delete(`${API_URL}/regioes/${id}`);
      fetchRegioes();
    } catch (err) {
      console.error("Erro ao deletar região", err);
      alert("Erro ao deletar conselho");
    }
  };

  return (
    <div className="h-full bg-[#080808] text-white p-8 font-sans overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold text-[#facc15] mb-2">Administração Global (CoRe)</h1>
            <p className="text-gray-400">Gerencie todos os Conselhos Regionais (Tenants) do sistema.</p>
          </div>
          <button 
            onClick={() => {
              setStep(1);
              setSelectedLojas([]);
              setNome('');
              setPresidenteId('');
              setVicePresidenteId('');
              setSecretarioId('');
              setShowModal(true);
            }}
            className="bg-[#facc15] hover:bg-[#eab308] text-black px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Novo Conselho
          </button>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-[#111111] border border-[#222] p-6 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-gray-400 mb-1">Total de Conselhos</p>
              <h3 className="text-3xl font-bold text-white">{regioes.length}</h3>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
              <MapPin className="text-blue-500 w-6 h-6" />
            </div>
          </div>
          <div className="bg-[#111111] border border-[#222] p-6 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-gray-400 mb-1">Lojas Integradas</p>
              <h3 className="text-3xl font-bold text-white">0 <span className="text-xs text-gray-500 font-normal ml-2">(Em breve)</span></h3>
            </div>
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
              <Users className="text-green-500 w-6 h-6" />
            </div>
          </div>
          <div className="bg-[#111111] border border-[#222] p-6 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-gray-400 mb-1">Status do Sistema</p>
              <h3 className="text-3xl font-bold text-green-500">Online</h3>
            </div>
            <div className="w-12 h-12 bg-[#facc15]/10 rounded-full flex items-center justify-center">
              <Activity className="text-[#facc15] w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search and Table */}
        <div className="bg-[#111111] border border-[#222] rounded-xl overflow-hidden">
          <div className="p-4 border-b border-[#222] flex items-center gap-3">
            <Search className="text-gray-500 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar conselho regional..." 
              className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#1a1a1a] text-gray-400 text-sm">
                <th className="p-4 font-medium">Nome do Conselho</th>
                <th className="p-4 font-medium">Lojas (Tenants)</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                    Carregando conselhos...
                  </td>
                </tr>
              ) : regioes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">Nenhum conselho regional encontrado. Crie o primeiro!</td>
                </tr>
              ) : regioes.filter(r => r.nome.toLowerCase().includes(search.toLowerCase())).map(regiao => (
                <tr key={regiao.id} className="border-b border-[#222] hover:bg-[#151515] transition-colors">
                  <td className="p-4 font-medium text-[#facc15]">{regiao.nome} <span className="text-gray-500 text-xs ml-2">({regiao.uf})</span></td>
                  <td className="p-4 text-gray-300">0 Lojas ativas</td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      regiao.ativa ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
                    }`}>
                      {regiao.ativa ? 'ATIVO' : 'INATIVO'}
                    </span>
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
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
                      className="p-2 hover:bg-[#222] rounded-lg text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                      title="Editar Dados da Região"
                    >
                      <Settings className="w-4 h-4" />
                      <span className="text-sm">Editar</span>
                    </button>
                    <button 
                      onClick={() => navigate(`/regiao/${regiao.id}`)}
                      className="p-2 hover:bg-[#222] rounded-lg text-[#facc15] hover:text-[#eab308] transition-colors flex items-center gap-1 font-medium"
                      title="Entrar no Dashboard do Conselho"
                    >
                      Acessar <ChevronRight className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(regiao.id)}
                      className="p-2 hover:bg-[#222] rounded-lg text-red-500/50 hover:text-red-500 transition-colors flex items-center"
                      title="Deletar Região"
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
</tbody>
          </table>
        </div>
      </div>

      {/* Modal de Criação (Wizard) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111] border border-[#333] rounded-xl p-8 w-full max-w-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#facc15]">Criar Novo Conselho Regional</h2>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${step === 1 ? 'bg-[#facc15] text-black' : 'bg-[#333] text-gray-400'}`}>1. Lojas</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${step === 2 ? 'bg-[#facc15] text-black' : 'bg-[#333] text-gray-400'}`}>2. Diretoria</span>
              </div>
            </div>
            
            {step === 1 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-400 mb-1">Nome do Conselho</label>
                    <input type="text" value={nome} onChange={e => setNome(e.target.value)} required placeholder="Ex: Conselho Regional de Anápolis" className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Estado (UF)</label>
                    <select value={uf} onChange={e => setUf(e.target.value)} className="w-full bg-[#080808] border border-[#333] rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none">
                      <option value="GO">GO</option>
                      <option value="DF">DF</option>
                      <option value="SP">SP</option>
                      <option value="MG">MG</option>
                      <option value="RJ">RJ</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-[#333] pt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-200">Lojas do Conselho</h3>
                    {selectedLojas.length > 0 && <span className="text-xs bg-[#333] px-2 py-1 rounded text-gray-300">{selectedLojas.length} selecionadas</span>}
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Busque e adicione as Lojas que farão parte deste Conselho (Recomendado: mínimo de 5).</p>
                  
                  <BuscadorLoja 
                    onSelect={(loja) => {
                      if (!selectedLojas.find(l => l.id === loja.id)) {
                        setSelectedLojas([...selectedLojas, loja]);
                      }
                    }} 
                    onSelectMultiple={(lojas) => {
                      const novasLojas = lojas.filter(l => !selectedLojas.find(sl => sl.id === l.id));
                      if (novasLojas.length > 0) {
                        setSelectedLojas([...selectedLojas, ...novasLojas]);
                      }
                    }}
                  />

                  {selectedLojas.length > 0 && (
                    <div className="mt-4 p-4 bg-[#151515] border border-[#333] rounded-lg max-h-48 overflow-y-auto">
                      <ul className="space-y-2">
                        {selectedLojas.map(loja => (
                          <li key={loja.id} className="flex items-center justify-between text-sm text-gray-300 bg-[#080808] p-2 rounded">
                            <span>{loja.nome} <span className="text-gray-500 ml-1">(Nº {loja.numero})</span></span>
                            <button 
                              type="button"
                              onClick={() => setSelectedLojas(selectedLojas.filter(l => l.id !== loja.id))}
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

                <div className="border-t border-[#333] pt-6 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => { setShowModal(false); setStep(1); }}
                    className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={selectedLojas.length === 0 || !nome}
                    className={`px-6 py-2 rounded-lg font-semibold transition-colors ${selectedLojas.length > 0 && nome ? 'bg-[#facc15] hover:bg-[#eab308] text-black' : 'bg-[#333] text-gray-500 cursor-not-allowed'}`}
                  >
                    Avançar para Diretoria
                  </button>
                </div>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={handleCreate}>
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-200">Composição da Diretoria</h3>
                  <p className="text-sm text-gray-500 mb-4">Resolva o CIM de cada diretor no sistema e-Sigma antes de salvar a região. Se precisar criar um novo Obreiro, referencie uma das lojas criadas no passo anterior.</p>
                  
                  <BuscadorObreiro cargo="Presidente" lojasConselho={selectedLojas} onSuccess={(cim) => setPresidenteId(cim)} />
                  <BuscadorObreiro cargo="Vice-Presidente" lojasConselho={selectedLojas} onSuccess={(cim) => setVicePresidenteId(cim)} />
                  <BuscadorObreiro cargo="Secretário" lojasConselho={selectedLojas} onSuccess={(cim) => setSecretarioId(cim)} />
                </div>

                <div className="border-t border-[#333] pt-6 flex justify-between">
                  <button 
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors border border-[#333]"
                  >
                    Voltar
                  </button>
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => { setShowModal(false); setStep(1); }}
                      className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className={`px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${presidenteId || vicePresidenteId || secretarioId ? 'bg-[#facc15] hover:bg-[#eab308] text-black' : 'bg-[#333] text-gray-500 cursor-not-allowed'}`}
                      disabled={!presidenteId && !vicePresidenteId && !secretarioId}
                    >
                      Criar e Salvar no Banco
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {editModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111] border border-[#333] rounded-xl p-8 w-full max-w-2xl">
            <h2 className="text-2xl font-bold text-[#facc15] mb-6">Editar Conselho Regional</h2>
            
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
                <BuscadorLoja 
                  onSelect={(loja) => {
                    if (!editLojas.find(l => l.id === loja.id)) {
                      setEditLojas([...editLojas, loja]);
                    }
                  }} 
                  onSelectMultiple={(lojas) => {
                    const novasLojas = lojas.filter(l => !editLojas.find(el => el.id === l.id));
                    if (novasLojas.length > 0) {
                      setEditLojas([...editLojas, ...novasLojas]);
                    }
                  }}
                />
                
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
          </div>
        </div>
      )}
    </div>
  );
}
