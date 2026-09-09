// EM CONFORMIDADE COM AS REGRAS DE OURO DO E-SIGMA
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, Link, useLocation } from 'react-router-dom';
import { 
  Bell, Calendar, BookOpenCheck, Vote, Landmark, 
  FileText, Building2, Award, BarChart3, MessageSquare, 
  Bug, Menu, ChevronLeft, ChevronRight, LogOut
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contextos/AuthContext';
import LogoAnimadaCore from './LogoAnimadaCore';
import ModalReportarBug from './ModalReportarBug';

export default function Layout() {
  const { id } = useParams();
  const location = useLocation();
  const { usuario, logout } = useAuth();
  const [regiaoNome, setRegiaoNome] = useState('Carregando...');
  const [loading, setLoading] = useState(true);
  
  // Menu colapsável: suporta fixação via botão sandwich e expansão automática on hover
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = sidebarPinned || isHovered;
  const [showBugModal, setShowBugModal] = useState(false);

  useEffect(() => {
    const fetchRegiao = async () => {
      try {
        const res = await axios.get(`http://localhost:8003/api/v1/regioes/${id}`);
        setRegiaoNome(res.data.nome);
      } catch (err) {
        setRegiaoNome('Conselho Regional de Veneráveis Mestres de Anápolis e Região');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchRegiao();
  }, [id]);

  // Lista dos 10 módulos solicitados (sem numeração)
  const itensMenu = [
    {
      id: 'avisos',
      titulo: 'Avisos e Notificações',
      to: `/regiao/${id}`,
      exact: true,
      icone: Bell,
      descricao: 'Comunicados, novidades e alertas'
    },
    {
      id: 'agenda',
      titulo: 'Agenda do Conselho',
      to: `/regiao/${id}/calendario`,
      icone: Calendar,
      descricao: 'Calendário e eventos regionais'
    },
    {
      id: 'admissao',
      titulo: 'Mural de Admissão',
      to: `/regiao/${id}/admissoes`,
      icone: BookOpenCheck,
      descricao: 'Livros, sindicâncias e pranchas'
    },
    {
      id: 'votacoes',
      titulo: 'Enquetes e Votações',
      to: `/regiao/${id}/votacoes`,
      icone: Vote,
      descricao: 'Consultas oficiais e deliberações'
    },
    {
      id: 'patrimonio',
      titulo: 'Patrimônio',
      to: `/regiao/${id}/patrimonio`,
      icone: Landmark,
      descricao: 'Inventário e bens do conselho'
    },
    {
      id: 'documentos',
      titulo: 'Documentos',
      to: `/regiao/${id}/documentos`,
      icone: FileText,
      descricao: 'Atas, convites e regulamentos'
    },
    {
      id: 'relatorios',
      titulo: 'Relatórios',
      to: `/regiao/${id}/relatorios`,
      icone: BarChart3,
      descricao: 'Métricas e estatísticas de gestão'
    },
    {
      id: 'diretoria',
      titulo: 'Mesa Diretora',
      to: `/regiao/${id}/diretoria`,
      icone: Award,
      descricao: 'Liderança executiva e mandatos'
    },
    {
      id: 'lojas',
      titulo: 'Lojas Jurisdicionadas',
      to: `/regiao/${id}/lojas`,
      icone: Building2,
      descricao: 'Quadro de lojas e veneráveis'
    },
    {
      id: 'comunicacao',
      titulo: 'Comunicação Interna',
      to: `/regiao/${id}/comunicacao`,
      icone: MessageSquare,
      descricao: 'Canal oficial com as lojas'
    }
  ];

  return (
    <div className="flex flex-col h-screen bg-[#080808] text-gray-200 overflow-hidden font-sans">
      
      {/* HEADER FULL-WIDTH (Ocupa toda a largura da tela) */}
      <header className="w-full h-16 bg-[#0e0e0e] border-b border-[#222] px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 shadow-lg select-none">
        
        {/* Esquerda: Botão Toggle Sidebar (Sandwich) + Ícone CoRe + Nome do Conselho */}
        <div className="flex items-center gap-3.5 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarPinned(!sidebarPinned)}
            className={`p-2 rounded-xl transition-all cursor-pointer border shrink-0 ${
              sidebarPinned 
                ? 'text-[#facc15] bg-[#1a1a1a] border-[#333]' 
                : 'text-gray-400 hover:text-[#facc15] hover:bg-[#1a1a1a] border-transparent hover:border-[#333]'
            }`}
            title={sidebarPinned ? "Desafixar menu lateral" : "Fixar / expandir menu lateral"}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo Animada do CoRe (Somente o Ícone) */}
          <Link 
            to={id ? `/regiao/${id}` : '/'} 
            className="flex items-center shrink-0 hover:opacity-90 transition-opacity" 
            title="Início do Conselho Regional"
          >
            <LogoAnimadaCore theme="ouro" width={38} height={34} animated={true} />
          </Link>

          <div className="h-6 w-[1px] bg-[#262626] mx-0.5 shrink-0 hidden sm:block"></div>

          {/* Nome do Conselho */}
          <h1 className="text-xs sm:text-sm font-bold text-gray-200 tracking-wide truncate max-w-[280px] sm:max-w-[450px] md:max-w-[700px]">
            {loading ? 'Carregando...' : (regiaoNome || "Conselho Regional de Veneráveis Mestres de Anápolis e Região")}
          </h1>
        </div>

        {/* Direita: Usuário Ativo, Role Maçônica e Logout */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-3 pl-3 border-l border-[#222]">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#854d0e] to-[#facc15] flex items-center justify-center font-bold text-black text-xs shadow-md">
              {usuario?.nome ? usuario.nome.charAt(0).toUpperCase() : 'C'}
            </div>
            <div className="hidden md:block text-left leading-tight">
              <p className="text-xs font-bold text-white truncate max-w-[150px]">
                {usuario?.nome || 'SuperAdmin'}
              </p>
              <p className="text-[10px] text-[#facc15]/80 font-medium uppercase tracking-wider">
                {usuario?.roles?.[0] || 'Diretoria Regional'}
              </p>
            </div>
          </div>

          {/* Botão Logout */}
          <button
            type="button"
            onClick={logout}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
            title="Encerrar Sessão"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

      </header>

      {/* ÁREA INFERIOR: SIDEBAR COLAPSÁVEL + CONTEÚDO PRINCIPAL */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* SIDEBAR COLAPSÁVEL COM EXPANSÃO AUTOMÁTICA ON HOVER */}
        <aside 
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={`transition-all duration-300 ease-in-out bg-[#0f0f0f] border-r border-[#222] flex flex-col justify-between shrink-0 select-none z-20 ${
            isExpanded ? 'w-72 shadow-2xl' : 'w-20'
          }`}
        >
          {/* Navegação dos 10 Módulos */}
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1.5 scrollbar-thin scrollbar-thumb-[#222]">
            
            {/* Header interno do menu com botão recolher/expandir */}
            <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-[#1c1c1c]">
              {isExpanded ? (
                <>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#facc15]">
                    Módulos do Conselho
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSidebarPinned(false);
                      setIsHovered(false);
                    }}
                    className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-[#222] transition-colors"
                    title="Recolher para modo ícones"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSidebarPinned(true)}
                  className="w-full flex justify-center py-1 text-gray-500 hover:text-[#facc15] transition-colors"
                  title="Fixar Menu Expandido"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Itens do Menu */}
            {itensMenu.map((item) => {
              const Icone = item.icone;
              const isActive = item.exact 
                ? location.pathname === item.to 
                : location.pathname.startsWith(item.to);

              return (
                <NavLink
                  key={item.id}
                  to={item.to}
                  title={!isExpanded ? item.titulo : undefined}
                  className={`group relative flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all ${
                    isActive 
                      ? 'bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/30 shadow-sm font-semibold' 
                      : 'text-gray-400 hover:text-white hover:bg-[#181818] border border-transparent'
                  } ${!isExpanded ? 'justify-center' : ''}`}
                >
                  {/* Ícone */}
                  <div className={`shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-[#facc15]' : 'text-gray-400 group-hover:text-white'}`}>
                    <Icone className="w-5 h-5" />
                  </div>

                  {/* Texto Expandido */}
                  {isExpanded && (
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate leading-tight">
                        {item.titulo}
                      </p>
                      <p className="text-[10px] text-gray-500 truncate mt-0.5">
                        {item.descricao}
                      </p>
                    </div>
                  )}

                  {/* Tooltip flutuante no modo colapsado */}
                  {!isExpanded && (
                    <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#1a1a1a] text-white text-xs font-medium rounded-lg shadow-xl border border-[#333] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                      {item.titulo}
                    </div>
                  )}
                </NavLink>
              );
            })}

            {/* Divisor */}
            <div className="pt-2 pb-1 border-t border-[#1c1c1c] my-1"></div>

            {/* Item Especial: Reportar Bug no Sistema */}
            <button
              type="button"
              onClick={() => setShowBugModal(true)}
              title={!isExpanded ? "Reportar Bug no Sistema" : undefined}
              className={`w-full group relative flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-all text-red-400/90 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 cursor-pointer ${
                !isExpanded ? 'justify-center' : ''
              }`}
            >
              <Bug className="w-5 h-5 shrink-0 transition-transform group-hover:scale-110" />
              {isExpanded && (
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs font-bold truncate">Reportar Bug / Falha</p>
                  <p className="text-[10px] text-gray-500 truncate">Direto ao SuperAdmin</p>
                </div>
              )}

              {/* Tooltip flutuante no modo colapsado */}
              {!isExpanded && (
                <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#1a1a1a] text-red-400 text-xs font-medium rounded-lg shadow-xl border border-red-500/30 whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  Reportar Bug no Sistema
                </div>
              )}
            </button>

          </div>

          {/* RODAPÉ DO MENU PRINCIPAL: ADDEX SOLUTIONS */}
          <div className="p-3 border-t border-[#1c1c1c] bg-[#0c0c0c]/80 text-center select-none">
            {isExpanded ? (
              <div className="space-y-0.5 animate-in fade-in duration-300">
                <p className="text-[10px] font-bold text-gray-300 tracking-wide">
                  Desenvolvido por <span className="text-[#facc15]">Addex Solutions</span>
                </p>
                <p className="text-[9px] text-gray-500">Copyright 2026</p>
                <a 
                  href="mailto:andreluiz@addex.dev" 
                  className="text-[9px] text-[#facc15]/80 hover:text-[#facc15] hover:underline block truncate font-mono pt-0.5"
                >
                  Contato: andreluiz@addex.dev
                </a>
              </div>
            ) : (
              <div 
                className="flex flex-col items-center justify-center text-center cursor-help py-1" 
                title="Desenvolvido por Addex Solutions - Copyright 2026 Contato: andreluiz@addex.dev"
              >
                <span className="text-[9px] font-black tracking-wider text-[#facc15]">ADDEX</span>
                <span className="text-[8px] text-gray-500 font-mono">2026</span>
              </div>
            )}
          </div>

        </aside>

        {/* ÁREA CENTRAL DE CONTEÚDO */}
        <main className="flex-1 flex flex-col h-full overflow-y-auto bg-[#080808]">
          <Outlet />
        </main>

      </div>

      {/* Modal de Reportar Bug */}
      <ModalReportarBug 
        isOpen={showBugModal}
        onClose={() => setShowBugModal(false)}
        usuarioAtual={usuario}
      />

    </div>
  );
}
