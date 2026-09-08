// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { LayoutDashboard, Calendar, LibraryBig, ArrowLeft, Loader2, Shield, Settings, LogOut } from 'lucide-react';
import axios from 'axios';

export default function Layout() {
  const { id } = useParams();
  const [regiaoNome, setRegiaoNome] = useState('Carregando...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRegiao = async () => {
      try {
        const res = await axios.get(`http://localhost:8003/api/v1/regioes/${id}`);
        setRegiaoNome(res.data.nome);
      } catch (err) {
        setRegiaoNome('Região Desconhecida');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchRegiao();
  }, [id]);

  return (
    <div className="flex h-screen bg-[#080808] text-gray-200 overflow-hidden font-sans">
      
      {/* Sidebar Lateral */}
      <aside className="w-72 bg-[#111111] border-r border-[#222] flex flex-col justify-between shrink-0">
        <div>
          {/* Topo / Logo */}
          <div className="h-20 flex items-center px-4 border-b border-[#222] gap-3">
            <Link to="/" className="p-2 hover:bg-[#222] rounded-lg transition-colors text-gray-400 hover:text-white shrink-0" title="Voltar ao Painel Global">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-[#854d0e] to-[#facc15] flex items-center justify-center font-bold text-black text-xl shrink-0">
                C
              </div>
              <div className="min-w-0">
                <h1 className="font-bold text-[#facc15] text-sm truncate tracking-wide" title={regiaoNome}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : regiaoNome}
                </h1>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5 truncate">Gestão do Conselho</p>
              </div>
            </div>
          </div>

          {/* Navegação principal */}
          <nav className="p-4 space-y-1">
            <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 mt-4">Menu do Conselho</p>
            
            <NavLink end to={`/regiao/${id}`} className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-[#facc15]/10 text-[#facc15]' : 'hover:bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              <LayoutDashboard className="w-5 h-5" />
              <span className="font-medium">Painel de Lojas</span>
            </NavLink>
            
            <NavLink to={`/regiao/${id}/calendario`} className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-[#facc15]/10 text-[#facc15]' : 'hover:bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              <Calendar className="w-5 h-5" />
              <span className="font-medium">Calendário Regional</span>
            </NavLink>

            <NavLink to={`/regiao/${id}/livros`} className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-[#facc15]/10 text-[#facc15]' : 'hover:bg-[#1a1a1a] text-gray-400 hover:text-white'}`}>
              <LibraryBig className="w-5 h-5" />
              <span className="font-medium">Livros Secretos</span>
            </NavLink>
          </nav>
        </div>

        {/* Rodapé da Sidebar (User Profile) */}
        <div className="p-4 border-t border-[#222]">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#0a0a0a] border border-[#222] mb-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
                <Shield className="w-4 h-4 text-[#facc15]" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">SuperAdmin</p>
                <p className="text-xs text-gray-500">e-sigma root</p>
              </div>
            </div>
            <Settings className="w-4 h-4 text-gray-500 hover:text-white cursor-pointer" />
          </div>
          
          <button className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-400 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4" />
            Encerrar Sessão
          </button>
        </div>
      </aside>

      {/* Área Central Principal */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        <Outlet />
      </main>

    </div>
  );
}
