// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useState, useEffect } from 'react';
import { 
  Search, Plus, MapPin, Users, Activity, Settings, ChevronRight, 
  Loader2, UserPlus, Fingerprint, MoreVertical, Trash2, Building2, X 
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
  const [menuOpcoesRegiao, setMenuOpcoesRegiao] = useState<any>(null); // Menu de contexto / Bottom sheet mobile

  // Wizard States
  const [step, setStep] = useState(1);
  const [selectedLojas, setSelectedLojas] = useState<{id: number, nome: string, numero: string}[]>([]);
  const [editModal, setEditModal] = useState<any>(null); // Estado para o modal de edição
  const [editPresidente, setEditPresidente] = useState<string>('');
  const [editVice, setEditVice] = useState<string>('');
  const [editSecretario, setEditSecretario] = useState<string>('');
  const [editLojas, setEditLojas] = useState<any[]>([]);
  const [viewLojasModal, setViewLojasModal] = useState<any>(null); // Estado para visualização rápida das lojas


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
      const res = await clienteHttp.get(`${API_URL}/regioes/`);
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
      await clienteHttp.put(`${API_URL}/regioes/${editModal.id}`, {
        nome: editModal.nome,
        uf: editModal.uf,
        presidente_id: editPresidente || null,
        vice_presidente_id: editVice || null,
        secretario_id: editSecretario || null,
        lojas_ids: editLojas.map((l: any) => String(l.id || l.loja_id))
      });
      setEditModal(null);
      fetchRegioes();
    } catch (err) {
      console.error("Erro ao atualizar região", err);
      alert("Erro ao atualizar conselho");
    }
  };

  const openViewLojas = async (regiao: any) => {
    setViewLojasModal({ loading: true, nome: regiao.nome, lojas: [] });
    if (regiao.lojas && regiao.lojas.length > 0) {
      try {
        const idsToFetch = regiao.lojas.map((l: any) => parseInt(l.loja_id)).filter((id: number) => !isNaN(id));
        if(idsToFetch.length > 0) {
          const res = await clienteHttp.post(`${API_URL}/integracao/lojas/busca/multiplas`, idsToFetch).catch(() => ({ data: [] }));
          const detailsList = Array.isArray(res.data) ? res.data : [];
          const enrichedLojas = regiao.lojas.map((l: any) => {
            const details = detailsList.find((d: any) => String(d.id) === String(l.loja_id));
            return details ? { ...l, nome: details.nome, numero: details.numero } : l;
          });
          setViewLojasModal({ loading: false, nome: regiao.nome, lojas: enrichedLojas });
        } else {
          setViewLojasModal({ loading: false, nome: regiao.nome, lojas: regiao.lojas });
        }
      } catch (e) {
        setViewLojasModal({ loading: false, nome: regiao.nome, lojas: regiao.lojas });
      }
    } else {
      setViewLojasModal({ loading: false, nome: regiao.nome, lojas: [] });
    }
  };

  const openEditModal = async (regiao: any) => {
    setEditModal(regiao);
    setEditLojas(regiao.lojas || []);
    const pres = (regiao.diretoria || []).find((d: any) => d.cargo === 'Presidente' || d.cargo === 'PRESIDENTE');
    const vice = (regiao.diretoria || []).find((d: any) => d.cargo === 'Vice-Presidente' || d.cargo === 'VICE_PRESIDENTE');
    const sec = (regiao.diretoria || []).find((d: any) => d.cargo === 'Secretário' || d.cargo === 'SECRETARIO');
    setEditPresidente(pres ? pres.usuario_id : '');
    setEditVice(vice ? vice.usuario_id : '');
    setEditSecretario(sec ? sec.usuario_id : '');
    
    if (regiao.lojas && regiao.lojas.length > 0) {
      try {
        const idsToFetch = regiao.lojas.map((l: any) => parseInt(l.loja_id)).filter((id: number) => !isNaN(id));
        if(idsToFetch.length > 0) {
          const res = await clienteHttp.post(`${API_URL}/integracao/lojas/busca/multiplas`, idsToFetch).catch(() => ({ data: [] }));
          const detailsList = Array.isArray(res.data) ? res.data : [];
          const enrichedLojas = regiao.lojas.map((l: any) => {
            const details = detailsList.find((d: any) => String(d.id) === String(l.loja_id));
            return details ? { ...l, nome: details.nome, numero: details.numero } : l;
          });
          setEditLojas(enrichedLojas);
        }
      } catch (e) {
        console.error('Erro ao buscar detalhes das lojas', e);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente deletar este Conselho Regional?")) return;
    try {
      await clienteHttp.delete(`${API_URL}/regioes/${id}`);
      fetchRegioes();
    } catch (err) {
      console.error("Erro ao deletar região", err);
      alert("Erro ao deletar conselho");
    }
  };

  const totalLojas = regioes.reduce((acc, r) => acc + (r.lojas?.length || 0), 0);
  const regioesFiltradas = regioes.filter(r => r.nome.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="h-full bg-sigma-bg text-white p-4 sm:p-6 md:p-8 font-sans overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-10">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#facc15] mb-1">Conselhos Regionais</h1>
            <p className="text-xs md:text-sm text-gray-400">Administração Global e Gestão de Conselhos</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/solicitacoes-cadastro"
              className="border border-sigma-border hover:border-[#facc15]/50 text-gray-300 hover:text-[#facc15] px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold flex items-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-4 h-4 text-[#facc15]" />
              <span className="hidden sm:inline">Solicitações de Cadastro</span>
              <span className="sm:hidden">Solicitações</span>
            </Link>
            <Link
              to="/minhas-passkeys"
              className="border border-sigma-border hover:border-[#facc15]/50 text-gray-300 hover:text-[#facc15] px-3 py-2 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-semibold flex items-center gap-1.5 transition-colors"
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

        {/* Mobile: Micro-KPIs compactos em linha única (economiza ~400px verticais) */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-1 mb-4 no-scrollbar">
          <div className="flex items-center gap-1.5 bg-sigma-surface border border-sigma-border px-3 py-1.5 rounded-full shrink-0 text-xs text-gray-300">
            <MapPin className="text-blue-400 w-3.5 h-3.5" />
            <span className="font-bold text-white">{regioes.length}</span> Conselhos
          </div>
          <div className="flex items-center gap-1.5 bg-sigma-surface border border-sigma-border px-3 py-1.5 rounded-full shrink-0 text-xs text-gray-300">
            <Building2 className="text-green-400 w-3.5 h-3.5" />
            <span className="font-bold text-white">{totalLojas}</span> Lojas
          </div>
          <div className="flex items-center gap-1.5 bg-sigma-surface border border-sigma-border px-3 py-1.5 rounded-full shrink-0 text-xs text-gray-300">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-green-400 font-medium">Online</span>
          </div>
        </div>

        {/* Desktop: Stats Row tradicional em 3 cards */}
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
              <Activity className="text-[#facc15] w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search and List/Table Container */}
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

          {/* Desktop View: Tabela */}
          <div className="hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-sigma-elevated text-gray-400 text-sm">
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
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#facc15]" />
                      Carregando conselhos...
                    </td>
                  </tr>
                ) : regioesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">
                      Nenhum conselho regional encontrado.
                    </td>
                  </tr>
                ) : regioesFiltradas.map(regiao => (
                  <tr key={regiao.id} className="border-b border-sigma-border hover:bg-[#151515] transition-colors">
                    <td className="p-4 font-medium text-[#facc15]">
                      {regiao.nome} <span className="text-gray-500 text-xs ml-2">({regiao.uf || 'GO'})</span>
                    </td>
                    <td className="p-4 text-gray-300">
                      <button onClick={() => openViewLojas(regiao)} className="hover:text-[#facc15] underline decoration-dashed underline-offset-4 transition-colors cursor-pointer">
                        {regiao.lojas?.length || 0} Lojas ativas
                      </button>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        regiao.ativa ? 'bg-green-500/10 text-green-500' : 'bg-orange-500/10 text-orange-500'
                      }`}>
                        {regiao.ativa ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td className="p-4 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => openEditModal(regiao)}
                        className="p-2 hover:bg-sigma-elevated rounded-lg text-gray-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                        title="Editar Dados da Região"
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-sm">Editar</span>
                      </button>
                      <button 
                        onClick={() => navigate(`/regiao/${regiao.id}`)}
                        className="p-2 hover:bg-sigma-elevated rounded-lg text-[#facc15] hover:text-[#eab308] transition-colors flex items-center gap-1 font-medium cursor-pointer"
                        title="Entrar no Dashboard do Conselho"
                      >
                        Acessar <ChevronRight className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(regiao.id)}
                        className="p-2 hover:bg-sigma-elevated rounded-lg text-red-500/50 hover:text-red-500 transition-colors flex items-center cursor-pointer"
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

          {/* Mobile View: Cards Touch-First (Opção 1: toque abre conselho direto, 3-pontos abre opções) */}
          <div className="block md:hidden divide-y divide-[#222]">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[#facc15]" />
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
                  onClick={() => navigate(`/regiao/${regiao.id}`)}
                  className="p-4 hover:bg-[#151515] active:bg-sigma-elevated transition-all cursor-pointer flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h3 className="text-base font-bold text-white group-hover:text-[#facc15] transition-colors truncate">
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpcoesRegiao(regiao);
                      }}
                      className="p-2.5 text-gray-400 hover:text-white hover:bg-sigma-elevated active:bg-[#333] rounded-xl transition-colors cursor-pointer"
                      title="Mais opções do Conselho"
                      aria-label="Mais opções"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-[#facc15] transition-colors" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Sheet de Opções Mobile para o Conselho Selecionado */}
      {menuOpcoesRegiao && (
        <div className="fixed inset-0 z-[80] md:hidden">
          <div 
            className="fixed inset-0 bg-sigma-bg/75 backdrop-blur-sm transition-opacity"
            onClick={() => setMenuOpcoesRegiao(null)}
          />
          <div className="fixed inset-x-0 bottom-0 bg-sigma-surface border-t border-[#2a2a2a] rounded-t-3xl p-5 shadow-2xl z-10 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-sigma-border pb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Conselho Regional</p>
                <h3 className="text-lg font-bold text-white">{menuOpcoesRegiao.nome} ({menuOpcoesRegiao.uf || 'GO'})</h3>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpcoesRegiao(null)}
                className="p-2 text-gray-400 hover:text-white rounded-full bg-sigma-elevated cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const regId = menuOpcoesRegiao.id;
                  setMenuOpcoesRegiao(null);
                  navigate(`/regiao/${regId}`);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-sigma-elevated border border-sigma-border border border-[#facc15]/30 text-[#facc15] font-bold text-sm hover:bg-sigma-elevated border border-sigma-border transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Activity className="w-4 h-4" /> Acessar Painel do Conselho
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = menuOpcoesRegiao;
                  setMenuOpcoesRegiao(null);
                  openViewLojas(target);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#1c1c1c] hover:bg-sigma-elevated border border-[#2a2a2a] text-gray-200 text-sm font-medium transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  Ver Lojas Jurisdicionadas ({menuOpcoesRegiao.lojas?.length || 0})
                </span>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const target = menuOpcoesRegiao;
                  setMenuOpcoesRegiao(null);
                  openEditModal(target);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-[#1c1c1c] hover:bg-sigma-elevated border border-[#2a2a2a] text-gray-200 text-sm font-medium transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4 text-gray-400" /> Editar Dados do Conselho
                </span>
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const regId = menuOpcoesRegiao.id;
                  setMenuOpcoesRegiao(null);
                  handleDelete(regId);
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-sm font-medium transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  <Trash2 className="w-4 h-4" /> Excluir Conselho
                </span>
                <ChevronRight className="w-4 h-4 text-red-500/50" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criação (Wizard) */}
      {showModal && (
        <div className="fixed inset-0 bg-sigma-bg/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-sigma-surface border border-sigma-border rounded-xl p-8 w-full max-w-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-[#facc15]">Criar Novo Conselho Regional</h2>
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

      {/* Modal de Edição */}
      {editModal && (
        <div className="fixed inset-0 bg-sigma-bg/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-sigma-surface border border-sigma-border rounded-xl p-8 w-full max-w-2xl">
            <h2 className="text-2xl font-bold text-[#facc15] mb-6">Editar Conselho Regional</h2>
            
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Nome do Conselho</label>
                  <input type="text" value={editModal.nome} onChange={e => setEditModal({...editModal, nome: e.target.value})} required className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Estado (UF)</label>
                  <select value={editModal.uf} onChange={e => setEditModal({...editModal, uf: e.target.value})} className="w-full bg-sigma-bg border border-sigma-border rounded-lg p-3 text-white focus:border-[#facc15] focus:outline-none">
                    <option value="GO">GO</option>
                    <option value="DF">DF</option>
                    <option value="SP">SP</option>
                    <option value="MG">MG</option>
                    <option value="RJ">RJ</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-sigma-border pt-4">
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
                  <div className="mt-2 p-3 bg-[#151515] border border-sigma-border rounded-lg max-h-32 overflow-y-auto">
                    <ul className="space-y-2">
                      {editLojas.map(loja => (
                          <li key={loja.id} className="flex items-center justify-between text-xs text-gray-300 bg-sigma-bg p-2 rounded">
                            <span>{loja.nome ? `Loja ${loja.nome}, nº ${loja.numero}` : `(Nº ${loja.numero || (loja.loja_id ? String(loja.loja_id).substring(0,8) : '')})`}</span>
                            <div className="flex items-center gap-2">
                              <button 
                                type="button"
                                onClick={() => setAddObreiroModal(loja)}
                                className="text-blue-500 hover:text-blue-400"
                              >
                                Cadastrar Membro
                              </button>
                              <button 
                                type="button"
                                onClick={() => setEditLojas(editLojas.filter(l => l.id !== loja.id))}
                                className="text-red-500 hover:text-red-400"
                              >
                                Remover
                              </button>
                            </div>
                          </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="border-t border-sigma-border pt-4 space-y-4">
                <h3 className="text-md font-semibold text-gray-200">Diretoria</h3>
                <BuscadorObreiro cargo="Presidente" lojasConselho={editLojas} onSuccess={(cim) => setEditPresidente(cim)} />
                {editPresidente && <div className="text-xs text-green-500 ml-1">CIM Atual: {editPresidente}</div>}
                
                <BuscadorObreiro cargo="Vice-Presidente" lojasConselho={editLojas} onSuccess={(cim) => setEditVice(cim)} />
                {editVice && <div className="text-xs text-green-500 ml-1">CIM Atual: {editVice}</div>}

                <BuscadorObreiro cargo="Secretário" lojasConselho={editLojas} onSuccess={(cim) => setEditSecretario(cim)} />
                {editSecretario && <div className="text-xs text-green-500 ml-1">CIM Atual: {editSecretario}</div>}
              </div>

              <div className="border-t border-sigma-border pt-6 flex justify-end gap-3 sticky bottom-0 bg-sigma-surface py-2">
                <button 
                  type="button"
                  onClick={() => setEditModal(null)}
                  className="px-4 py-2 rounded-lg font-medium text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={(e) => handleUpdate(e as unknown as React.FormEvent)}
                  className="bg-sigma-gold text-[#070F1E] shadow-md hover:opacity-90 px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de View Lojas */}
      {viewLojasModal && (
        <div className="fixed inset-0 bg-sigma-bg/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-sigma-surface border border-sigma-border rounded-xl p-8 w-full max-w-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#facc15]">Lojas: {viewLojasModal.nome}</h2>
              <button onClick={() => setViewLojasModal(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto pr-2">
              {viewLojasModal.loading ? (
                <div className="flex justify-center items-center py-8 text-gray-500">Carregando lojas...</div>
              ) : viewLojasModal.lojas.length === 0 ? (
                <div className="text-gray-500 text-center py-4">Nenhuma loja cadastrada neste conselho.</div>
              ) : (
                <ul className="space-y-2">
                  {viewLojasModal.lojas.map((loja: any, idx: number) => (
                    <li key={idx} className="p-3 bg-sigma-elevated border border-sigma-border rounded-lg text-gray-200 flex justify-between items-center">
                      <span className="font-medium">
                        {loja.nome ? `Loja ${loja.nome}, nº ${loja.numero}` : `(Nº ${loja.numero || loja.loja_id})`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
