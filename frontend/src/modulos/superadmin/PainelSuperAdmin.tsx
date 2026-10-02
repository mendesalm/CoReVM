// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState, useEffect } from 'react';
import { 
  Search, Plus, MapPin, Users, Activity, Settings, ChevronRight, 
  Loader2, UserPlus, Fingerprint, Trash2, Building2, X 
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import BuscadorObreiro from '../../compartilhado/componentes/BuscadorObreiro';
import BuscadorLoja from '../../compartilhado/componentes/BuscadorLoja';
import ModalCadastroObreiro from '../../compartilhado/componentes/ModalCadastroObreiro';
import { clienteHttp, API_URL } from '../../compartilhado/contextos/AuthContext';

export default function PainelSuperAdmin() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [regioes, setRegioes] = useState<any[]>([]);
  const [addObreiroModal, setAddObreiroModal] = useState<any>(null);

  // Drill-down states
  const [conselhoFoco, setConselhoFoco] = useState<any>(null);
  const [lojaFoco, setLojaFoco] = useState<any>(null);

  // Local states for Conselho form
  const [conselhoForm, setConselhoForm] = useState({ nome: '', uf: '' });
  const [conselhoDir, setConselhoDir] = useState({ presidente: '', vice: '', secretario: '' });
  const [conselhoLojas, setConselhoLojas] = useState<any[]>([]);
  const [lojaLoading, setLojaLoading] = useState(false);

  // Local states for Loja form
  const [lojaForm, setLojaForm] = useState({ nome: '', numero: '', potencia: '', rito: '' });

  // Wizard States (Create)
  const [step, setStep] = useState(1);
  const [selectedLojas, setSelectedLojas] = useState<{id: number, nome: string, numero: string}[]>([]);
  const [nome, setNome] = useState('');
  const [uf, setUf] = useState('GO');
  const [presidenteId, setPresidenteId] = useState('');
  const [vicePresidenteId, setVicePresidenteId] = useState('');
  const [secretarioId, setSecretarioId] = useState('');

  const fetchRegioes = async () => {
    try {
      setLoading(true);
      const res = await clienteHttp.get(`${API_URL}/regioes/`);
      setRegioes(res.data);
      return res.data;
    } catch (err) {
      console.error("Erro ao buscar regiões", err);
      return [];
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
      await clienteHttp.post(`${API_URL}/regioes/`, {
        nome: nome,
        uf: uf,
        presidente_id: presidenteId || null,
        vice_presidente_id: vicePresidenteId || null,
        secretario_id: secretarioId || null,
        lojas_ids: selectedLojas.map((l: any) => String(l.id))
      });
      setShowModal(false);
      setStep(1);
      setSelectedLojas([]);
      setNome('');
      setPresidenteId('');
      setVicePresidenteId('');
      setSecretarioId('');
      fetchRegioes(); 
    } catch (err) {
      console.error("Erro ao criar região", err);
      alert("Erro ao criar conselho");
    }
  };

  const handleUpdateConselho = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conselhoFoco) return;
    try {
      await clienteHttp.put(`${API_URL}/regioes/${conselhoFoco.id}`, {
        nome: conselhoForm.nome,
        uf: conselhoForm.uf,
        presidente_id: conselhoDir.presidente || null,
        vice_presidente_id: conselhoDir.vice || null,
        secretario_id: conselhoDir.secretario || null,
        lojas_ids: conselhoLojas.map((l: any) => String(l.id || l.loja_id))
      });
      alert("Conselho atualizado com sucesso");
      const updatedRegioes = await fetchRegioes();
      const updatedConselho = updatedRegioes.find((r: any) => r.id === conselhoFoco.id);
      if (updatedConselho) openConselhoFoco(updatedConselho);
    } catch (err) {
      console.error("Erro ao atualizar região", err);
      alert("Erro ao atualizar conselho");
    }
  };

  const handleDeleteConselho = async (id: string) => {
    if (!window.confirm("Deseja realmente deletar este Conselho Regional?")) return;
    try {
      await clienteHttp.delete(`${API_URL}/regioes/${id}`);
      setConselhoFoco(null);
      setLojaFoco(null);
      fetchRegioes();
    } catch (err) {
      console.error("Erro ao deletar região", err);
      alert("Erro ao deletar conselho");
    }
  };

  const handleVincularLoja = async (loja: any) => {
    if(!conselhoFoco) return;
    try {
      await clienteHttp.post(`${API_URL}/regional/${conselhoFoco.id}/lojas`, {
        loja_id: loja.id
      });
      const updatedRegioes = await fetchRegioes();
      const updatedConselho = updatedRegioes.find((r: any) => r.id === conselhoFoco.id);
      if (updatedConselho) openConselhoFoco(updatedConselho);
    } catch (err) {
      console.error("Erro ao vincular loja", err);
      alert("Erro ao vincular loja");
    }
  };

  const handleDesvincularLoja = async () => {
    if(!conselhoFoco || !lojaFoco) return;
    if(!window.confirm("Deseja realmente desvincular esta Loja do Conselho?")) return;
    try {
      await clienteHttp.delete(`${API_URL}/regional/${conselhoFoco.id}/lojas/${lojaFoco.loja_id || lojaFoco.id}`);
      setLojaFoco(null);
      const updatedRegioes = await fetchRegioes();
      const updatedConselho = updatedRegioes.find((r: any) => r.id === conselhoFoco.id);
      if (updatedConselho) openConselhoFoco(updatedConselho);
    } catch (err) {
      console.error("Erro ao desvincular loja", err);
      alert("Erro ao desvincular loja");
    }
  };

  const handleUpdateLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!lojaFoco) return;
    try {
      const payload: any = {};
      if(lojaForm.nome) payload.nome = lojaForm.nome;
      if(lojaForm.numero) payload.numero = lojaForm.numero;
      if(lojaForm.potencia) payload.potencia = lojaForm.potencia;
      if(lojaForm.rito) payload.rito = lojaForm.rito;

      await clienteHttp.put(`${API_URL}/integracao/lojas/${lojaFoco.loja_id || lojaFoco.id}`, payload);
      alert("Loja atualizada com sucesso");
      
      const updatedRegioes = await fetchRegioes();
      const updatedConselho = updatedRegioes.find((r: any) => r.id === conselhoFoco.id);
      if (updatedConselho) {
          openConselhoFoco(updatedConselho);
          setLojaFoco({...lojaFoco, ...payload});
      }
    } catch(err) {
      console.error("Erro ao atualizar loja", err);
      alert("Erro ao atualizar loja");
    }
  }

  const openConselhoFoco = async (regiao: any) => {
    setConselhoFoco(regiao);
    setConselhoForm({ nome: regiao.nome, uf: regiao.uf || 'GO' });
    
    const pres = (regiao.diretoria || []).find((d: any) => d.cargo === 'Presidente' || d.cargo === 'PRESIDENTE');
    const vice = (regiao.diretoria || []).find((d: any) => d.cargo === 'Vice-Presidente' || d.cargo === 'VICE_PRESIDENTE');
    const sec = (regiao.diretoria || []).find((d: any) => d.cargo === 'Secretário' || d.cargo === 'SECRETARIO');
    setConselhoDir({
      presidente: pres ? pres.usuario_id : '',
      vice: vice ? vice.usuario_id : '',
      secretario: sec ? sec.usuario_id : ''
    });

    if (regiao.lojas && regiao.lojas.length > 0) {
      setLojaLoading(true);
      try {
        const idsToFetch = regiao.lojas.map((l: any) => parseInt(l.loja_id || l.id)).filter((id: number) => !isNaN(id));
        if(idsToFetch.length > 0) {
          const res = await clienteHttp.post(`${API_URL}/integracao/lojas/busca/multiplas`, idsToFetch).catch(() => ({ data: [] }));
          const detailsList = Array.isArray(res.data) ? res.data : [];
          const enrichedLojas = regiao.lojas.map((l: any) => {
            const details = detailsList.find((d: any) => String(d.id) === String(l.loja_id || l.id));
            return details ? { ...l, ...details } : l;
          });
          setConselhoLojas(enrichedLojas);
        } else {
          setConselhoLojas(regiao.lojas);
        }
      } catch (e) {
        console.error('Erro ao buscar detalhes das lojas', e);
        setConselhoLojas(regiao.lojas);
      } finally {
        setLojaLoading(false);
      }
    } else {
      setConselhoLojas([]);
    }
  };

  const openLojaFoco = (loja: any) => {
    setLojaFoco(loja);
    setLojaForm({
      nome: loja.nome || '',
      numero: loja.numero || '',
      potencia: loja.potencia || '',
      rito: loja.rito || ''
    });
  };

  const totalLojas = regioes.reduce((acc, r) => acc + (r.lojas?.length || 0), 0);
  const regioesFiltradas = regioes.filter(r => r.nome.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full bg-sigma-bg text-white p-4 sm:p-6 md:p-8 font-sans overflow-y-auto flex relative">
      {/* Main Content Area */}
      <div className={`flex-1 transition-all duration-300 ${conselhoFoco ? 'mr-0 md:mr-[400px]' : ''}`}>
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-10">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold title-sigma-gold mb-1">Conselhos Regionais</h1>
              <p className="text-xs md:text-sm text-gray-400">Administração Global e Gestão de Conselhos</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to="/solicitacoes-cadastro"
                className="border border-sigma-border hover:border-[#facc15]/50 text-gray-300 hover:title-sigma-gold px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold flex items-center gap-1.5 transition-colors"
              >
                <UserPlus className="w-4 h-4 title-sigma-gold" />
                <span className="hidden sm:inline">Solicitações de Cadastro</span>
                <span className="sm:hidden">Solicitações</span>
              </Link>
              <Link
                to="/minhas-passkeys"
                className="border border-sigma-border hover:border-[#facc15]/50 text-gray-300 hover:title-sigma-gold px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Fingerprint className="w-4 h-4 text-blue-400" />
                <span className="hidden sm:inline">Minhas Passkeys</span>
                <span className="sm:hidden">Passkeys</span>
              </Link>
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
                className="bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 px-3.5 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Conselho</span>
              </button>
            </div>
          </header>

          {/* KPIs */}
          <div className="hidden md:grid md:grid-cols-3 gap-6 mb-10">
            <div className="bg-sigma-surface border border-sigma-border p-6 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-gray-400 mb-1">Total de Conselhos</p>
                <h3 className="text-3xl font-bold text-white">{regioes.length}</h3>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center">
                <MapPin className="text-blue-500 w-6 h-6" />
              </div>
            </div>
            <div className="bg-sigma-surface border border-sigma-border p-6 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-gray-400 mb-1">Lojas Integradas</p>
                <h3 className="text-3xl font-bold text-white">{totalLojas}</h3>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                <Users className="text-green-500 w-6 h-6" />
              </div>
            </div>
            <div className="bg-sigma-surface border border-sigma-border p-6 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-gray-400 mb-1">Status do Sistema</p>
                <h3 className="text-3xl font-bold text-green-500">Online</h3>
              </div>
              <div className="w-12 h-12 bg-sigma-elevated border border-sigma-border rounded-full flex items-center justify-center">
                <Activity className="title-sigma-gold w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
            <div className="flex items-center gap-1.5 bg-sigma-surface border border-sigma-border px-3 py-1.5 rounded-full shrink-0 text-xs text-gray-300">
              <MapPin className="text-blue-400 w-3.5 h-3.5" />
              <span className="font-bold text-white">{regioes.length}</span> Conselhos
            </div>
            <div className="flex items-center gap-1.5 bg-sigma-surface border border-sigma-border px-3 py-1.5 rounded-full shrink-0 text-xs text-gray-300">
              <Building2 className="text-green-400 w-3.5 h-3.5" />
              <span className="font-bold text-white">{totalLojas}</span> Lojas
            </div>
          </div>

          {/* Search & List */}
          <div className="bg-sigma-surface border border-sigma-border rounded-xl overflow-hidden mb-8">
            <div className="p-3.5 md:p-4 border-b border-sigma-border flex items-center gap-3">
              <Search className="text-gray-500 w-5 h-5 shrink-0" />
              <input 
                type="text" 
                placeholder="Buscar conselho (ex: Anápolis, Ceres)..." 
                className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 text-sm md:text-base"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-sigma-elevated text-gray-400 text-sm">
                    <th className="p-4 font-medium">Nome do Conselho</th>
                    <th className="p-4 font-medium">Lojas (Tenants)</th>
                    <th className="p-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 title-sigma-gold" />
                        Carregando conselhos...
                      </td>
                    </tr>
                  ) : regioesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-8 text-center text-gray-500">
                        Nenhum conselho regional encontrado.
                      </td>
                    </tr>
                  ) : regioesFiltradas.map(regiao => (
                    <tr 
                      key={regiao.id} 
                      onClick={() => openConselhoFoco(regiao)}
                      className="border-b border-sigma-border hover:bg-[#151515] transition-colors cursor-pointer"
                    >
                      <td className="p-4 font-medium title-sigma-gold">
                        {regiao.nome} <span className="text-gray-500 text-xs ml-2">({regiao.uf || 'GO'})</span>
                      </td>
                      <td className="p-4 text-gray-300">
                        {regiao.lojas?.length || 0} Lojas ativas
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          regiao.ativa ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
                        }`}>
                          {regiao.ativa ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="block md:hidden divide-y divide-[#222]">
              {loading ? (
                <div className="p-8 text-center text-gray-500">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 title-sigma-gold" />
                  Carregando conselhos...
                </div>
              ) : regioesFiltradas.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  Nenhum conselho regional encontrado.
                </div>
              ) : (
                regioesFiltradas.map(regiao => (
                  <div
                    key={regiao.id}
                    onClick={() => openConselhoFoco(regiao)}
                    className="p-4 hover:bg-[#151515] active:bg-sigma-elevated transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-base font-bold text-white group-hover:title-sigma-gold transition-colors truncate">
                          {regiao.nome}
                        </h3>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-sigma-elevated text-gray-300">
                          {regiao.uf || 'GO'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          regiao.ativa ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        }`}>
                          {regiao.ativa ? 'ATIVO' : 'INATIVO'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-gray-500" />
                        <span>{regiao.lojas?.length || 0} Lojas jurisdicionadas</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <ChevronRight className="w-5 h-5 text-gray-600 group-hover:title-sigma-gold transition-colors" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drawer Level 1: Conselho Foco */}
      <div 
        className={`fixed inset-y-0 right-0 w-full md:w-[400px] bg-sigma-surface shadow-2xl border-l border-sigma-border z-40 transform transition-transform duration-300 flex flex-col ${conselhoFoco ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {conselhoFoco && (
          <>
            <div className="p-4 border-b border-sigma-border flex items-center justify-between bg-sigma-elevated">
              <div>
                <h2 className="text-lg font-bold title-sigma-gold">{conselhoForm.nome || 'Conselho'}</h2>
                <p className="text-xs text-gray-400">UF: {conselhoForm.uf}</p>
              </div>
              <div className="flex gap-2 items-center">
                <button onClick={() => navigate(`/regiao/${conselhoFoco.id}`)} className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg flex items-center gap-1 transition-colors" title="Acessar Painel do Conselho"><Activity className="w-4 h-4" /><span className="text-xs font-bold hidden sm:inline">Acessar</span></button>
                  <button onClick={() => handleDeleteConselho(conselhoFoco.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg" title="Excluir Conselho">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => { setConselhoFoco(null); setLojaFoco(null); }} className="p-2 text-gray-400 hover:text-white rounded-lg bg-[#333]">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <form onSubmit={handleUpdateConselho} className="space-y-4">
                <h3 className="font-semibold text-gray-200">Dados do Conselho</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Nome</label>
                    <input type="text" value={conselhoForm.nome} onChange={e => setConselhoForm({...conselhoForm, nome: e.target.value})} className="w-full bg-sigma-bg border border-sigma-border rounded p-2 text-white text-sm focus:border-[#facc15] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">UF</label>
                    <input type="text" value={conselhoForm.uf} onChange={e => setConselhoForm({...conselhoForm, uf: e.target.value})} className="w-full bg-sigma-bg border border-sigma-border rounded p-2 text-white text-sm focus:border-[#facc15] focus:outline-none" />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-medium text-gray-400">Diretoria</h4>
                  <div>
                    <BuscadorObreiro cargo="Presidente" lojasConselho={conselhoLojas} onSuccess={(cim) => setConselhoDir({...conselhoDir, presidente: cim})} />
                    {conselhoDir.presidente && <div className="text-xs text-green-500 mt-1">CIM: {conselhoDir.presidente}</div>}
                  </div>
                  <div>
                    <BuscadorObreiro cargo="Vice-Presidente" lojasConselho={conselhoLojas} onSuccess={(cim) => setConselhoDir({...conselhoDir, vice: cim})} />
                    {conselhoDir.vice && <div className="text-xs text-green-500 mt-1">CIM: {conselhoDir.vice}</div>}
                  </div>
                  <div>
                    <BuscadorObreiro cargo="Secretário" lojasConselho={conselhoLojas} onSuccess={(cim) => setConselhoDir({...conselhoDir, secretario: cim})} />
                    {conselhoDir.secretario && <div className="text-xs text-green-500 mt-1">CIM: {conselhoDir.secretario}</div>}
                  </div>
                </div>

                <button type="submit" className="w-full bg-sigma-gold text-[#070F1E] font-semibold py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
                  Salvar Alterações
                </button>
              </form>

              <div className="border-t border-sigma-border pt-4 space-y-3">
                <h3 className="font-semibold text-gray-200">Lojas Jurisdicionadas ({conselhoLojas.length})</h3>
                <div className="bg-sigma-bg p-2 rounded-lg border border-sigma-border">
                  <BuscadorLoja 
                    onSelect={(loja) => handleVincularLoja(loja)} 
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Busque uma loja para vincular ao conselho.</p>
                </div>

                {lojaLoading ? (
                  <div className="text-center py-4 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                ) : (
                  <div className="space-y-2 mt-3">
                    {conselhoLojas.map((loja, idx) => (
                      <div 
                        key={idx}
                        onClick={() => openLojaFoco(loja)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors flex justify-between items-center ${lojaFoco && (lojaFoco.id === loja.id || lojaFoco.loja_id === loja.loja_id) ? 'border-sigma-gold bg-[#222]' : 'border-sigma-border bg-sigma-elevated hover:bg-[#222]'}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-white">{loja.nome ? `Loja ${loja.nome}` : `Loja ID ${loja.loja_id || loja.id}`}</p>
                          <p className="text-xs text-gray-400">Nº {loja.numero || 'N/A'}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Drawer Level 2: Loja Foco */}
      <div 
        className={`fixed inset-y-0 right-0 w-full md:w-[350px] bg-[#111] shadow-2xl border-l border-sigma-border z-50 transform transition-transform duration-300 flex flex-col ${lojaFoco ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {lojaFoco && (
          <>
            <div className="p-4 border-b border-sigma-border flex items-center justify-between bg-[#1a1a1a]">
              <div>
                <h2 className="text-lg font-bold text-white">Loja Nº {lojaForm.numero || lojaFoco.numero || 'N/A'}</h2>
              </div>
              <button onClick={() => setLojaFoco(null)} className="p-2 text-gray-400 hover:text-white rounded-lg bg-[#333]">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <form onSubmit={handleUpdateLoja} className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Nome da Loja</label>
                    <input type="text" value={lojaForm.nome} onChange={e => setLojaForm({...lojaForm, nome: e.target.value})} className="w-full bg-sigma-bg border border-sigma-border rounded p-2 text-white text-sm focus:border-[#facc15] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Número</label>
                    <input type="text" value={lojaForm.numero} onChange={e => setLojaForm({...lojaForm, numero: e.target.value})} className="w-full bg-sigma-bg border border-sigma-border rounded p-2 text-white text-sm focus:border-[#facc15] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Potência</label>
                    <input type="text" value={lojaForm.potencia} onChange={e => setLojaForm({...lojaForm, potencia: e.target.value})} className="w-full bg-sigma-bg border border-sigma-border rounded p-2 text-white text-sm focus:border-[#facc15] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Rito</label>
                    <input type="text" value={lojaForm.rito} onChange={e => setLojaForm({...lojaForm, rito: e.target.value})} className="w-full bg-sigma-bg border border-sigma-border rounded p-2 text-white text-sm focus:border-[#facc15] focus:outline-none" />
                  </div>
                </div>

                <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors">
                  Salvar Dados da Loja
                </button>
              </form>

              <div className="border-t border-sigma-border pt-4 space-y-3">
                <button 
                  onClick={() => setAddObreiroModal(lojaFoco)}
                  className="w-full border border-sigma-border bg-sigma-elevated text-gray-200 font-semibold py-2 rounded-lg text-sm hover:bg-[#333] transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" /> Cadastrar Membro
                </button>

                <button 
                  onClick={handleDesvincularLoja}
                  className="w-full border border-red-500/20 bg-red-500/10 text-red-500 font-semibold py-2 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
                >
                  Desvincular do Conselho
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal de Criação (Wizard) */}
      {showModal && (
        <div className="fixed inset-0 bg-sigma-bg/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-sigma-surface border border-sigma-border rounded-xl p-8 w-full max-w-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold title-sigma-gold">Criar Novo Conselho Regional</h2>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${step === 1 ? 'bg-sigma-gold text-[#070F1E] shadow-md' : 'bg-[#333] text-gray-400'}`}>1. Lojas</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${step === 2 ? 'bg-sigma-gold text-[#070F1E] shadow-md' : 'bg-[#333] text-gray-400'}`}>2. Diretoria</span>
              </div>
            </div>
            
            {step === 1 ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-400 mb-1">Nome do Conselho</label>
                    <input type="text" value={nome} onChange={e => setNome(e.target.value)} required placeholder="Ex: Conselho Regional de Anápolis" className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Estado (UF)</label>
                    <select value={uf} onChange={e => setUf(e.target.value)} className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none">
                      <option value="GO">GO</option>
                      <option value="DF">DF</option>
                      <option value="SP">SP</option>
                      <option value="MG">MG</option>
                      <option value="RJ">RJ</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-sigma-border pt-6 space-y-4">
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
                    <div className="mt-4 p-4 bg-[#151515] border border-sigma-border rounded-lg max-h-48 overflow-y-auto">
                      <ul className="space-y-2">
                        {selectedLojas.map(loja => (
                          <li key={loja.id} className="flex items-center justify-between text-sm text-gray-300 bg-sigma-bg p-2 rounded">
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

                <div className="border-t border-sigma-border pt-6 flex justify-end gap-3">
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
                    className={`px-6 py-2 rounded-lg font-semibold transition-colors ${selectedLojas.length > 0 && nome ? 'bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90' : 'bg-[#333] text-gray-500 cursor-not-allowed'}`}
                  >
                    Avançar para Diretoria
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-200">Composição da Diretoria</h3>
                  <p className="text-sm text-gray-500 mb-4">Resolva o CIM de cada diretor no sistema e-Sigma antes de salvar a região. Se precisar criar um novo Obreiro, referencie uma das lojas criadas no passo anterior.</p>
                  
                  <BuscadorObreiro cargo="Presidente" lojasConselho={selectedLojas} onSuccess={(cim) => setPresidenteId(cim)} />
                  <BuscadorObreiro cargo="Vice-Presidente" lojasConselho={selectedLojas} onSuccess={(cim) => setVicePresidenteId(cim)} />
                  <BuscadorObreiro cargo="Secretário" lojasConselho={selectedLojas} onSuccess={(cim) => setSecretarioId(cim)} />
                </div>

                <div className="border-t border-sigma-border pt-6 flex justify-between">
                  <button 
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors border border-sigma-border"
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
                      type="button"
                      onClick={(e) => handleCreate(e as unknown as React.FormEvent)}
                      className={`px-6 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${presidenteId || vicePresidenteId || secretarioId ? 'bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90' : 'bg-[#333] text-gray-500 cursor-not-allowed'}`}
                      disabled={!presidenteId && !vicePresidenteId && !secretarioId}
                    >
                      Criar e Salvar no Banco
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {addObreiroModal && (
        <ModalCadastroObreiro 
          lojasDisponiveis={[{ id: addObreiroModal.id || addObreiroModal.loja_id, nome: addObreiroModal.nome }]}
          onSuccess={(cim) => {
            alert(`Obreiro CIM ${cim} cadastrado com sucesso!`);
            setAddObreiroModal(null);
          }}
          onCancel={() => setAddObreiroModal(null)}
        />
      )}

    </div>
  );
}
